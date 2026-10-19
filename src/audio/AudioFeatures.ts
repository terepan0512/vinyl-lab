import { AudioSignal } from './AudioSignal.ts'

/** Samples the existing audio graph without creating sources or React updates. */
export class AudioFeatures {
  readonly values = {
    bass: 0, mid: 0, treble: 0, level: 0, inputLevel: 0,
    onset: 0, timbre: 0, flatness: 0,
  }
  readonly signal = new AudioSignal()
  private frequency = new Uint8Array(0)
  private waveform = new Float32Array(0)
  private previousSpectrum = new Float32Array(0)
  private previousLevel = 0
  private readonly magnitudeTable = new Float64Array(256)
  private readonly powerTable = new Float64Array(256)
  private readonly logPowerTable = new Float64Array(256)
  private minDb = Number.NaN
  private maxDb = Number.NaN
  private sampleRate = 0
  private fftSize = 0
  private binHz = 0
  private spectrumStart = 0
  private spectrumEnd = 0
  private readonly bandBounds = new Uint32Array(6)

  private configure(analyser: AnalyserNode) {
    const { frequencyBinCount, fftSize } = analyser
    const sampleRate = analyser.context.sampleRate
    if (this.frequency.length !== frequencyBinCount || this.waveform.length !== fftSize) {
      this.frequency = new Uint8Array(frequencyBinCount)
      this.waveform = new Float32Array(fftSize)
      this.previousSpectrum = new Float32Array(frequencyBinCount)
    }
    if (this.sampleRate !== sampleRate || this.fftSize !== fftSize) {
      this.sampleRate = sampleRate
      this.fftSize = fftSize
      this.binHz = sampleRate / fftSize
      this.spectrumStart = Math.max(1, Math.ceil(20 / this.binHz))
      this.spectrumEnd = Math.min(frequencyBinCount, Math.floor(8000 / this.binHz) + 1)
      this.bandBounds[0] = Math.max(1, Math.floor(20 / this.binHz))
      this.bandBounds[1] = Math.min(frequencyBinCount, Math.ceil(250 / this.binHz))
      this.bandBounds[2] = Math.max(1, Math.floor(250 / this.binHz))
      this.bandBounds[3] = Math.min(frequencyBinCount, Math.ceil(2000 / this.binHz))
      this.bandBounds[4] = Math.max(1, Math.floor(2000 / this.binHz))
      this.bandBounds[5] = Math.min(frequencyBinCount, Math.ceil(8000 / this.binHz))
    }
    const minDb = analyser.minDecibels ?? -100
    const maxDb = analyser.maxDecibels ?? -30
    if (minDb !== this.minDb || maxDb !== this.maxDb) {
      this.minDb = minDb
      this.maxDb = maxDb
      // A byte has only 256 possible values. Cache the dB conversion instead of
      // repeating exponentiation and logarithms for every FFT bin, every frame.
      for (let byte = 0; byte < 256; byte++) {
        const magnitude = byte === 0 ? 0 : 10 ** ((minDb + byte / 255 * (maxDb - minDb)) / 20)
        const power = magnitude * magnitude
        this.magnitudeTable[byte] = magnitude
        this.powerTable[byte] = power
        this.logPowerTable[byte] = Math.log(Math.max(1e-12, power))
      }
    }
  }

  private band(index: number) {
    const start = this.bandBounds[index]
    const end = this.bandBounds[index + 1]
    let sum = 0
    for (let i = start; i < end; i++) sum += this.frequency[i]
    return sum / (255 * Math.max(1, end - start))
  }

  reset() {
    this.values.bass = 0
    this.values.mid = 0
    this.values.treble = 0
    this.values.level = 0
    this.values.inputLevel = 0
    this.values.onset = 0
    this.values.timbre = 0
    this.values.flatness = 0
    this.previousSpectrum.fill(0)
    this.previousLevel = 0
    this.signal.reset()
  }

  sample(analyser: AnalyserNode | null, playing: boolean, delta: number) {
    let bass = 0, mid = 0, treble = 0, level = 0, onset = 0, timbre = 0, flatness = 0
    const dt = Math.max(0, Math.min(delta, 0.1))
    const active = analyser && playing && analyser.context.state === 'running'

    if (active) {
      this.configure(analyser)
      analyser.getByteFrequencyData(this.frequency)
      analyser.getFloatTimeDomainData(this.waveform)
      bass = this.band(0)
      mid = this.band(2)
      treble = this.band(4)

      let squares = 0
      for (let i = 0; i < this.waveform.length; i++) squares += this.waveform[i] * this.waveform[i]
      level = Math.min(1, Math.sqrt(squares / this.waveform.length) * 2)

      // Byte FFT bins are logarithmic dB values. Reconstruct magnitudes before
      // measuring centroid, flatness, and positive spectral change each frame.
      let magnitudes = 0, weightedHz = 0, positiveChange = 0
      let power = 0, logPower = 0
      const count = Math.max(1, this.spectrumEnd - this.spectrumStart)
      for (let i = this.spectrumStart; i < this.spectrumEnd; i++) {
        const byte = this.frequency[i]
        const magnitude = this.magnitudeTable[byte]
        magnitudes += magnitude
        weightedHz += i * this.binHz * magnitude
        positiveChange += Math.max(0, magnitude - this.previousSpectrum[i])
        power += this.powerTable[byte]
        logPower += this.logPowerTable[byte]
        this.previousSpectrum[i] = magnitude
      }
      if (level > 0.001 && magnitudes > 0) {
        const centroid = weightedHz / magnitudes
        timbre = Math.max(0, Math.min(1, Math.log(Math.max(120, centroid) / 120) / Math.log(6500 / 120)))
        flatness = Math.min(1, Math.exp(logPower / count) / Math.max(1e-12, power / count))
        // Flux catches new spectral events even when overall RMS stays steady.
        // RMS attack also catches low-frequency attacks between FFT updates.
        const flux = positiveChange / Math.max(1e-9, magnitudes)
        const attack = Math.max(0, level - this.previousLevel) / Math.max(0.025, level)
        onset = Math.min(1, Math.max(flux * 2.2, attack * 0.85))
      }
      this.previousLevel = level
      this.signal.update(this.waveform, analyser.context.sampleRate, dt)
    } else {
      this.previousSpectrum.fill(0)
      this.previousLevel = 0
      this.signal.update(null, 48000, dt)
    }

    const attack = 1 - Math.exp(-dt * 12)
    const release = 1 - Math.exp(-dt * 3)
    this.values.bass += (bass - this.values.bass) * (bass > this.values.bass ? attack : release)
    this.values.mid += (mid - this.values.mid) * (mid > this.values.mid ? attack : release)
    this.values.treble += (treble - this.values.treble) * (treble > this.values.treble ? attack : release)
    this.values.level += (level - this.values.level) * (level > this.values.level ? attack : release)
    this.values.inputLevel = level
    this.values.onset = Math.max(onset, this.values.onset * Math.exp(-dt * 12))
    this.values.timbre += (timbre - this.values.timbre) * (timbre > this.values.timbre ? attack : release)
    this.values.flatness += (flatness - this.values.flatness) * (flatness > this.values.flatness ? attack : release)
    return this.values
  }
}
