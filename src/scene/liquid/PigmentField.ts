import { createLiquidNoiseData, LIQUID_NOISE_SIZE } from './noiseTexture.ts'

export interface PigmentFieldParameters {
  flowX: number
  flowY: number
  swirl: number
  stretch: number
  bass: number
  mid: number
  treble: number
  onset: number
  timbre: number
}

const ZERO: Readonly<PigmentFieldParameters> = {
  flowX: 0, flowY: 0, swirl: 0, stretch: 0,
  bass: 0, mid: 0, treble: 0, onset: 0, timbre: 0,
}
const PARAMETER_KEYS = Object.keys(ZERO) as (keyof PigmentFieldParameters)[]
const NOISE = createLiquidNoiseData()
const NOISE_MASK = LIQUID_NOISE_SIZE - 1
const SAMPLE_COUNT = 384
const INNER_RADIUS = 0.35
const OUTER_RADIUS = 0.976
const SAMPLE_INTERVAL = 0.1
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

/** Match the shader's repeating, unsigned-byte lattice and cubic interpolation. */
function noise(x: number, y: number): number {
  const ix = Math.floor(x), iy = Math.floor(y)
  const fx = x - ix, fy = y - iy
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy)
  const x0 = ix & NOISE_MASK, x1 = (ix + 1) & NOISE_MASK
  const y0 = (iy & NOISE_MASK) * LIQUID_NOISE_SIZE
  const y1 = ((iy + 1) & NOISE_MASK) * LIQUID_NOISE_SIZE
  const top = NOISE[y0 + x0] + (NOISE[y0 + x1] - NOISE[y0 + x0]) * sx
  const bottom = NOISE[y1 + x0] + (NOISE[y1 + x1] - NOISE[y1 + x0]) * sx
  return (top + (bottom - top) * sy) / 255
}

/** CPU counterpart of liquidDomain() and the fragment shader's pigment field. */
export function samplePigmentField(x: number, y: number, input: PigmentFieldParameters): number {
  const turn = input.swirl * (0.22 - Math.hypot(x, y) * 0.08)
  const cosine = Math.cos(turn), sine = Math.sin(turn)
  // GLSL mat2 constructors specify columns, including this clockwise rotation.
  let qx = (cosine * x + sine * y) * 2.5
  let qy = (-sine * x + cosine * y) * 2.5
  const driftX = input.flowX * 0.70, driftY = -input.flowY * 0.60
  const bendX = noise(qx * 0.7 + driftX, qy * 0.7 + driftY)
  const bendY = noise(qx * 0.7 + 3.8 - driftX, qy * 0.7 + 7.1 - driftY)
  const bend = 1.3 + input.bass * 0.65 + input.onset * 0.30
  qx += (bendX - 0.5) * bend
  qy += (bendY - 0.5) * bend
  const strain = Math.sin(input.stretch * 0.38) * (0.18 + input.mid * 0.22)
  const strainedX = (1 + strain) * qx + 0.16 * Math.sin(input.flowY * 0.4) * qy
  const strainedY = 0.16 * Math.sin(input.flowX * 0.4) * qx + (1 - strain * 0.55) * qy
  qx = strainedX
  qy = strainedY
  const curlX = noise(qx * 1.1 + driftY + 9.2, qy * 1.1 + driftX + 2.6) - 0.5
  const curlY = noise(qx * 1.1 - driftX + 1.4, qy * 1.1 - driftY + 8.8) - 0.5
  const curl = 0.35 + input.timbre * 0.25 + input.treble * 0.15
  qx += driftX * 0.32 + curlX * curl
  qy += driftY * 0.32 + curlY * curl
  const foldX = noise(qx * 0.9 + 2.1, qy * 0.9 + 6.3) - 0.5
  const foldY = noise(qx * 0.9 + 7.7, qy * 0.9 + 1.4) - 0.5
  return noise(qx * 1.25 + foldX * 1.9, qy * 1.25 + foldY * 1.9) * 0.75
    + noise(qx * 0.55 + 4.8, qy * 0.55 + 2.6) * 0.25
}

/** The shader uses these eight linear CDF segments, with fixed endpoints 0, 1. */
export function pigmentPercentile(field: number, quantiles: ArrayLike<number>): number {
  let percentile = 0, lower = 0
  for (let i = 0; i < 8; i++) {
    const upper = i === 7 ? 1 : quantiles[i]
    percentile += Math.max(0, Math.min(1, (field - lower) / Math.max(0.0001, upper - lower))) * 0.125
    lower = upper
  }
  return percentile
}

/** Calibrate pigment area from the current field, without reading GPU pixels. */
export class PigmentField {
  // Two vec4 uniforms can consume this array without allocating per-frame data.
  readonly quantiles = new Float32Array(8)
  private readonly samples = new Float32Array(SAMPLE_COUNT)
  private readonly points = new Float32Array(SAMPLE_COUNT * 2)
  private readonly previous = { ...ZERO }
  private elapsed = 0

  constructor() {
    for (let i = 0; i < SAMPLE_COUNT; i++) {
      // Equal annular areas, rather than equal radii, keep the estimate unbiased.
      const radius = Math.sqrt(INNER_RADIUS ** 2
        + (OUTER_RADIUS ** 2 - INNER_RADIUS ** 2) * (i + 0.5) / SAMPLE_COUNT)
      this.points[i * 2] = Math.cos(i * GOLDEN_ANGLE) * radius
      this.points[i * 2 + 1] = Math.sin(i * GOLDEN_ANGLE) * radius
    }
    this.reset()
  }

  reset(input: PigmentFieldParameters = ZERO): Float32Array {
    this.elapsed = 0
    this.calibrate(input)
    return this.quantiles
  }

  update(input: PigmentFieldParameters, delta: number, active: boolean): Float32Array {
    if (!active) return this.quantiles
    if (!Number.isFinite(delta) || delta <= 0) return this.quantiles
    this.elapsed += Math.min(delta, SAMPLE_INTERVAL)
    if (this.elapsed < SAMPLE_INTERVAL - 1e-8) return this.quantiles
    this.elapsed = Math.max(0, this.elapsed - SAMPLE_INTERVAL)
    if (PARAMETER_KEYS.every(key => input[key] === this.previous[key])) return this.quantiles
    this.calibrate(input)
    return this.quantiles
  }

  private calibrate(input: PigmentFieldParameters) {
    for (let i = 0; i < SAMPLE_COUNT; i++) {
      this.samples[i] = samplePigmentField(this.points[i * 2], this.points[i * 2 + 1], input)
    }
    this.samples.sort()
    for (let i = 0; i < 7; i++) {
      const index = SAMPLE_COUNT * (i + 1) / 8 - 0.5
      const lower = Math.floor(index)
      const target = this.samples[lower]
        + (this.samples[lower + 1] - this.samples[lower]) * (index - lower)
      this.quantiles[i] = target
    }
    this.quantiles[7] = 1
    for (const key of PARAMETER_KEYS) this.previous[key] = input[key]
  }
}
