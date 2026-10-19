type AudioInput = {
  bass: number; mid: number; treble: number; inputLevel: number
  onset?: number; timbre?: number
}

const clamp = (value: number, low = 0, high = 1) =>
  Number.isFinite(value) ? Math.max(low, Math.min(high, value)) : low

/** Live audio drives damped pigment advection, rather than an elapsed-time clock. */
export class ViscousMotion {
  readonly values = {
    bass: 0, mid: 0, treble: 0, level: 0, travel: 0,
    flowX: 0, flowY: 0, swirl: 0, stretch: 0, onset: 0, timbre: 0,
  }

  reset() {
    for (const key of Object.keys(this.values) as (keyof typeof this.values)[]) this.values[key] = 0
  }

  update(input: AudioInput, delta: number, motionSpeed = 1) {
    const dt = clamp(delta, 0, 0.1)
    const inputLevel = clamp(input.inputLevel)
    const active = inputLevel > 0.001
    // A compressive response makes quiet passages visible without inventing
    // motion in silence. This is display gain, not a measured loudness label.
    const targetLevel = active ? Math.sqrt(clamp((inputLevel - 0.001) / 0.499)) : 0
    const bass = clamp(input.bass), mid = clamp(input.mid), treble = clamp(input.treble)
    const bandSum = Math.max(1e-6, bass + mid + treble)
    const targets = {
      level: targetLevel,
      bass: active ? bass / bandSum * targetLevel : 0,
      mid: active ? mid / bandSum * targetLevel : 0,
      treble: active ? treble / bandSum * targetLevel : 0,
      onset: active ? clamp(input.onset ?? 0) * Math.sqrt(targetLevel) : 0,
      timbre: active ? clamp(input.timbre ?? (mid * 0.45 + treble) / bandSum) : 0,
    }

    // Integrate the exponential envelope exactly. A display refresh is never
    // itself a source of displacement; sustained audio still keeps advecting.
    const integrate = (key: keyof typeof targets) => {
      const before = this.values[key]
      const target = targets[key]
      const attack = key === 'onset' ? 38 : 16
      const release = key === 'onset' ? 10 : active ? 3.5 : 6
      const rate = target > before ? attack : release
      const blend = 1 - Math.exp(-dt * rate)
      let next = before + (target - before) * blend
      if (!active && next < 0.0001) next = 0
      this.values[key] = next
      return before === 0 && target === 0 ? 0 : target * dt + (before - target) * blend / rate
    }

    const levelDistance = integrate('level')
    const bassDistance = integrate('bass')
    const midDistance = integrate('mid')
    const trebleDistance = integrate('treble')
    const onsetDistance = integrate('onset')
    integrate('timbre')
    const speed = clamp(motionSpeed, 0, 4)
    this.values.travel += levelDistance * speed
    // Independent channels let bass displace broad pools, mids pull ribbons,
    // and high-frequency attacks create smaller folds instead of whole rings.
    this.values.flowX += (0.34 * levelDistance + 0.92 * bassDistance - 0.28 * trebleDistance) * speed
    this.values.flowY += (-0.19 * levelDistance + 0.74 * midDistance + 0.28 * onsetDistance) * speed
    this.values.swirl += (0.22 * levelDistance + 0.55 * bassDistance - 0.42 * trebleDistance + 0.6 * onsetDistance) * speed
    this.values.stretch += (0.25 * midDistance + 0.42 * trebleDistance + 0.4 * onsetDistance) * speed
    return this.values
  }
}
