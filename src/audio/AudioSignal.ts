export const SIGNAL_SAMPLES = 256
export const HISTORY_RATE = 120

/** Texture rows contain captured PCM and a circular history of captured RMS. */
export class AudioSignal {
  readonly data = new Uint8Array(SIGNAL_SAMPLES * 2)
  cursor = SIGNAL_SAMPLES - 1
  private remainder = 0
  private pcmLength = 0
  private readonly sampleBounds = new Uint32Array(SIGNAL_SAMPLES + 1)
  private readonly sampleScale = new Float64Array(SIGNAL_SAMPLES)

  constructor() {
    this.reset()
  }

  reset() {
    this.data.fill(128, 0, SIGNAL_SAMPLES)
    this.data.fill(0, SIGNAL_SAMPLES)
    this.cursor = SIGNAL_SAMPLES - 1
    this.remainder = 0
  }

  update(pcm: Float32Array | null, sampleRate: number, delta: number) {
    if (pcm) {
      if (this.pcmLength !== pcm.length) {
        this.pcmLength = pcm.length
        for (let i = 0; i <= SIGNAL_SAMPLES; i++) {
          this.sampleBounds[i] = Math.floor(i * pcm.length / SIGNAL_SAMPLES)
          if (i > 0) this.sampleScale[i - 1] = 1 / Math.max(1, this.sampleBounds[i] - this.sampleBounds[i - 1])
        }
      }
      for (let i = 0; i < SIGNAL_SAMPLES; i++) {
        let sum = 0
        const end = this.sampleBounds[i + 1]
        for (let j = this.sampleBounds[i]; j < end; j++) sum += pcm[j]
        const sample = sum * this.sampleScale[i]
        this.data[i] = Math.round(128 + Math.max(-1, Math.min(1, sample)) * 127)
      }
    } else {
      this.data.fill(128, 0, SIGNAL_SAMPLES)
    }

    this.remainder += Math.max(0, Math.min(delta, 0.1)) * HISTORY_RATE
    const steps = Math.floor(this.remainder + 1e-8)
    this.remainder -= steps
    for (let step = 0; step < steps; step++) {
      // Read successive windows from the actual analyser block, oldest first.
      const age = (steps - 1 - step) / HISTORY_RATE
      const end = pcm ? Math.max(0, pcm.length - Math.round(age * sampleRate)) : 0
      const start = Math.max(0, end - Math.round(sampleRate / HISTORY_RATE))
      let squares = 0
      if (pcm) for (let j = start; j < end; j++) squares += pcm[j] * pcm[j]
      const rms = Math.sqrt(squares / Math.max(1, end - start))
      this.cursor = (this.cursor + 1) % SIGNAL_SAMPLES
      this.data[SIGNAL_SAMPLES + this.cursor] = Math.round(Math.min(1, rms * 2) * 255)
    }
  }
}
