type PigmentInput = {
  bass: number
  mid: number
  treble: number
  inputLevel: number
  onset?: number
  timbre?: number
}

export const MIN_PIGMENT_SHARE = 0.22
export const MAX_PIGMENT_SHARE = 0.48

const THIRD = 1 / 3
const BASELINE_RATE = 1 / 6
const RESPONSE_RATE = 3.8
const clamp = (value: number, low = 0, high = 1) =>
  Number.isFinite(value) ? Math.max(low, Math.min(high, value)) : low

/**
 * Live changes redistribute three pigments without changing their stored colors.
 * Low/mid/high changes favor Main/Accent/Counterpoint respectively. These are
 * visual conventions, not instrument labels. A slow relative baseline prevents
 * a bass-heavy master from assigning Main a permanent area advantage.
 */
export class PigmentBalance {
  readonly weights: [number, number, number] = [THIRD, THIRD, THIRD]
  private readonly baseline = [THIRD, THIRD, THIRD, 0.5, 0]
  private readonly response = [0, 0, 0]

  reset() {
    this.weights.fill(THIRD)
    this.baseline[0] = this.baseline[1] = this.baseline[2] = THIRD
    this.baseline[3] = 0.5
    this.baseline[4] = 0
    this.response.fill(0)
    return this.weights
  }

  update(input: PigmentInput, delta: number, playing = true) {
    const dt = clamp(delta, 0, 0.1)
    // Pause and silence hold the last composition. Neither a section clock nor
    // elapsed render time can rebalance pigment without measured audible input.
    if (!playing || clamp(input.inputLevel) <= 0.001 || dt === 0) return this.weights

    // Square roots compress the static mastering bias before relative changes
    // are measured. RMS gates activity; it does not privilege any pigment.
    const bass = Math.sqrt(clamp(input.bass))
    const mid = Math.sqrt(clamp(input.mid))
    const treble = Math.sqrt(clamp(input.treble))
    const sum = bass + mid + treble
    const low = sum > 1e-6 ? bass / sum : THIRD
    const middle = sum > 1e-6 ? mid / sum : THIRD
    const high = sum > 1e-6 ? treble / sum : THIRD
    const timbre = clamp(input.timbre ?? 0.5)
    const onset = clamp(input.onset ?? 0)
    const timbreChange = timbre - this.baseline[3]
    const onsetChange = onset - this.baseline[4]

    const lowChange = 0.30 * (low - this.baseline[0])
      - 0.08 * timbreChange - 0.025 * onsetChange
    const middleChange = 0.30 * (middle - this.baseline[1]) + 0.05 * onsetChange
    const highChange = 0.30 * (high - this.baseline[2])
      + 0.08 * timbreChange - 0.025 * onsetChange

    // Integrate the baseline and its damped response analytically for this
    // captured input. The response to a passage does not depend on display Hz.
    const baselineDecay = Math.exp(-BASELINE_RATE * dt)
    const responseDecay = Math.exp(-RESPONSE_RATE * dt)
    const responseIntegral = RESPONSE_RATE / (RESPONSE_RATE - BASELINE_RATE)
      * (baselineDecay - responseDecay)
    this.response[0] = this.response[0] * responseDecay + lowChange * responseIntegral
    this.response[1] = this.response[1] * responseDecay + middleChange * responseIntegral
    this.response[2] = this.response[2] * responseDecay + highChange * responseIntegral
    const baselineBlend = 1 - baselineDecay
    this.baseline[0] += (low - this.baseline[0]) * baselineBlend
    this.baseline[1] += (middle - this.baseline[1]) * baselineBlend
    this.baseline[2] += (high - this.baseline[2]) * baselineBlend
    this.baseline[3] += timbreChange * baselineBlend
    this.baseline[4] += onsetChange * baselineBlend

    for (let i = 0; i < 3; i++) {
      this.weights[i] = clamp(THIRD + this.response[i], MIN_PIGMENT_SHARE, MAX_PIGMENT_SHARE)
    }
    // Project back onto a bounded simplex without favoring a named role. Only
    // extreme changes need this; every pigment retains a readable pool.
    for (let pass = 0; pass < 3; pass++) {
      const difference = 1 - this.weights[0] - this.weights[1] - this.weights[2]
      if (Math.abs(difference) < 1e-12) break
      let available = 0
      for (let i = 0; i < 3; i++) {
        if (difference > 0 ? this.weights[i] < MAX_PIGMENT_SHARE : this.weights[i] > MIN_PIGMENT_SHARE) available++
      }
      if (!available) break
      const adjustment = difference / available
      for (let i = 0; i < 3; i++) {
        if (difference > 0 ? this.weights[i] < MAX_PIGMENT_SHARE : this.weights[i] > MIN_PIGMENT_SHARE) {
          this.weights[i] = clamp(this.weights[i] + adjustment, MIN_PIGMENT_SHARE, MAX_PIGMENT_SHARE)
        }
      }
    }
    return this.weights
  }
}
