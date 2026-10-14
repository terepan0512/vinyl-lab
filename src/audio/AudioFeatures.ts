/** Samples the existing audio graph without creating sources or React updates. */
export class AudioFeatures {
    readonly values = { bass: 0, mid: 0, treble: 0, level: 0 }
    private frequency = new Uint8Array(0)
    private waveform = new Uint8Array(0)
  
    sample(analyser: AnalyserNode | null, playing: boolean, delta: number) {
      let bass = 0, mid = 0, treble = 0, level = 0
  
      if (analyser && playing && analyser.context.state === 'running') {
        if (this.frequency.length !== analyser.frequencyBinCount) {
          this.frequency = new Uint8Array(analyser.frequencyBinCount)
          this.waveform = new Uint8Array(analyser.fftSize)
        }
  
        analyser.getByteFrequencyData(this.frequency)
        analyser.getByteTimeDomainData(this.waveform)
  
        const binHz = analyser.context.sampleRate / analyser.fftSize
  
        const band = (low: number, high: number) => {
          const start = Math.max(1, Math.floor(low / binHz))
          const end = Math.min(this.frequency.length, Math.ceil(high / binHz))
          let sum = 0
  
          for (let i = start; i < end; i++) {
            sum += this.frequency[i] / 255
          }
  
          return sum / Math.max(1, end - start)
        }
  
        bass = band(20, 250)
        mid = band(250, 2000)
        treble = band(2000, 8000)
  
        let squares = 0
        for (const byte of this.waveform) {
          squares += ((byte - 128) / 128) ** 2
        }
  
        level = Math.min(1, Math.sqrt(squares / this.waveform.length) * 2)
      }
  
      const smooth = (value: number, target: number) =>
        value + (target - value) * (1 - Math.exp(-delta * (target > value ? 12 : 3)))
  
      this.values.bass = smooth(this.values.bass, bass)
      this.values.mid = smooth(this.values.mid, mid)
      this.values.treble = smooth(this.values.treble, treble)
      this.values.level = smooth(this.values.level, level)
  
      return this.values
    }
  }