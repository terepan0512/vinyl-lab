/** React to sustained frame pressure, not individual loading or resize spikes. */
export class RenderBudget {
  readonly maximum: number
  private ratio: number
  private warmup = 1.5
  private seconds = 0
  private frames = 0
  private headroom = 0
  private cooldown = 0

  constructor(deviceRatio = 1) {
    this.maximum = Math.max(0.75, Math.min(1.5, Number.isFinite(deviceRatio) ? deviceRatio : 1))
    this.ratio = this.maximum
  }

  get pixelRatio() { return this.ratio }

  sample(delta: number, suspended = false): number | null {
    if (suspended || !Number.isFinite(delta) || delta <= 0 || delta > 0.5) {
      this.seconds = this.frames = this.headroom = 0
      return null
    }
    if (this.warmup > 0) { this.warmup -= delta; return null }
    this.cooldown = Math.max(0, this.cooldown - delta)
    this.seconds += delta
    this.frames++
    if (this.seconds < 2) return null
    const average = this.seconds / this.frames
    const elapsed = this.seconds
    this.seconds = this.frames = 0
    if (this.cooldown > 0) return null
    let next = this.ratio
    if (average > 1 / 40) {
      next = Math.max(0.75, this.ratio - 0.25)
      this.headroom = 0
    } else if (average < 1 / 58) {
      this.headroom += elapsed
      if (this.headroom >= 10) { next = Math.min(this.maximum, this.ratio + 0.25); this.headroom = 0 }
    } else this.headroom = 0
    if (next === this.ratio) return null
    this.ratio = next
    this.cooldown = 3
    return next
  }
}
