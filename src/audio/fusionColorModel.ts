import { lchColor, type LabColor } from './colorSpace.ts'
import type { AudioFeatureFrame } from './spectralFeatures.ts'

export const FUSION_MODEL_DESCRIPTION = {
  version: 'fusion-v3',
  training: 'untrained',
  emotion: 'not-estimated',
  method: 'MFCC spectral envelope and chroma triads, with a shared salient-harmony hue anchor and bounded temporal modulation',
} as const

export interface FusionMapping {
  timbreHue: number
  harmonyHue: number | null
  harmonyWeight: number
  noiseWeight: number
}

const clamp = (value: number, low = 0, high = 1) => Math.max(low, Math.min(high, value))
const finite = (value: number | undefined) => Number.isFinite(value) ? value! : 0
const degrees = (angle: number) => (angle * 180 / Math.PI + 360) % 360
const level = (rms: number) => clamp((20 * Math.log10(Math.max(1e-6, rms)) + 60) / 54)
const brightness = (centroid: number) => clamp(Math.log2(Math.max(120, centroid) / 120) / Math.log2(5000 / 120))

/**
 * Reconstruct a centered, smoothed log-mel envelope with the extractor's
 * orthonormal DCT-II basis (40 Slaney bands). MFCC0 is omitted deliberately:
 * changing recording gain should not change the spectral shape or its hue.
 * This is a truncated reconstruction, not a recovery of the original spectrum.
 */
function timbralCoordinates(feature: AudioFeatureFrame) {
  const envelope = Array.from({ length: 40 }, (_, band) => {
    let value = 0
    for (let coefficient = 1; coefficient < Math.min(13, feature.mfcc.length); coefficient++) {
      value += Math.sqrt(2 / 40) * finite(feature.mfcc[coefficient])
        * Math.cos(Math.PI * coefficient * (band + 0.5) / 40)
    }
    return value
  })
  const mean = (start: number, end: number) => envelope.slice(start, end)
    .reduce((sum, value) => sum + value, 0) / (end - start)
  const low = mean(0, 13), middle = mean(13, 27), high = mean(27, 40)
  const scale = Math.sqrt(envelope.reduce((sum, value) => sum + value ** 2, 0) / 40)
  if (scale < 1e-9) return { x: 0, y: 0, hue: 0, confidence: 0 }
  // Explicit visual conventions: a compares bass/treble prominence; b compares
  // middle-band prominence with the outer bands. These are design axes, not
  // naturally occurring colors of frequency ranges. RMS normalization makes
  // the contrasts independent of the overall cepstral magnitude.
  const x = (low - high) / scale
  const y = (middle - (low + high) / 2) / scale
  const magnitude = Math.hypot(x, y)
  const confidence = clamp(magnitude / 2)
  return magnitude > 1e-9
    ? { x: x / magnitude, y: y / magnitude, hue: degrees(Math.atan2(y, x)), confidence }
    : { x: 0, y: 0, hue: 0, confidence: 0 }
}

/**
 * Compare all 24 major/minor triads with the measured chroma profile. A root,
 * third and fifth use weights 1, .8, .9; the root has slightly more influence.
 * Centered cosine matching removes the uniform chroma floor. Confidence uses
 * both concentration and the margin over the next distinct root, so diffuse
 * chroma and ambiguous mixtures cannot assert a strong harmonic color.
 * These small templates describe harmonic evidence, not a full key detector.
 */
function harmonicCoordinates(feature: AudioFeatureFrame) {
  const chroma = Array.from({ length: 12 }, (_, index) => Math.max(0, finite(feature.chroma[index])))
  const total = chroma.reduce((sum, value) => sum + value, 0)
  if (total < 1e-12) return { hue: null, confidence: 0 }
  const centered = chroma.map(value => value / total - 1 / 12)
  const norm = Math.hypot(...centered)
  if (norm < 1e-9) return { hue: null, confidence: 0 }
  const roots = Array.from({ length: 12 }, (_, root) => {
    const correlations = [3, 4].map(third => {
      const template = Array<number>(12).fill(-2.7 / 12)
      template[root] += 1
      template[(root + third) % 12] += 0.8
      template[(root + 7) % 12] += 0.9
      const dot = centered.reduce((sum, value, index) => sum + value * template[index], 0)
      return dot / (norm * Math.hypot(...template))
    })
    return { root, score: Math.max(...correlations) }
  }).sort((left, right) => right.score - left.score || left.root - right.root)
  const best = roots[0]
  const margin = Math.max(0, best.score - roots[1].score)
  // A .2 root margin reaches full decisiveness. Concentration reaches full
  // confidence at a centered-chroma norm of .35. Both are stated heuristics.
  const confidence = clamp(norm / 0.35) * clamp(best.score) * clamp(margin / 0.2)
  const hue = (best.root * 7 % 12) * 30
  return { hue: confidence > 1e-9 ? hue : null, confidence }
}

function pulseActivity(feature: AudioFeatureFrame, tempoBpm: number | null) {
  const attack = clamp(Math.log1p(Math.max(0, finite(feature.onset))) / Math.log(33))
  // A missing tempo contributes nothing; attacks still contribute. Tempo alone
  // does not invent a beat or an oscillating color for sustained/silent audio.
  const tempo = tempoBpm !== null && Number.isFinite(tempoBpm) && tempoBpm > 0
    ? clamp((tempoBpm - 40) / 160) : 0
  return attack * (0.75 + 0.25 * tempo)
}

/** Deterministic, untrained fusion baseline; it does not infer musical emotion. */
export function explainFusionColor(feature: AudioFeatureFrame, tempoBpm: number | null = null): {
  color: LabColor
  mapping: FusionMapping
} {
  if (feature.rms < 1e-5) return { color: { l: 0.32, a: 0, b: 0 },
    mapping: { timbreHue: 0, harmonyHue: null, harmonyWeight: 0, noiseWeight: 0 } }
  const timbre = timbralCoordinates(feature)
  const harmony = harmonicCoordinates(feature)
  // Harmonic evidence can contribute at most 60%. Timbre strength is retained
  // in the vector rather than fabricating a saturated hue when its axes cancel.
  const harmonyWeight = 0.6 * harmony.confidence
  const angle = (harmony.hue ?? 0) * Math.PI / 180
  const x = timbre.x * timbre.confidence * (1 - harmonyWeight) + Math.cos(angle) * harmonyWeight
  const y = timbre.y * timbre.confidence * (1 - harmonyWeight) + Math.sin(angle) * harmonyWeight
  const magnitude = Math.hypot(x, y)
  const noiseWeight = Math.sqrt(clamp(finite(feature.flatness)))
  const pulse = pulseActivity(feature, tempoBpm)
  // Noise only reduces saturation. Rhythm adjusts lightness/chroma, never hue.
  // No fixed colored attractor, file-name hash, random seed or time oscillator.
  const chroma = 0.145 * clamp(magnitude) * (1 - noiseWeight * 0.35) * (0.9 + pulse * 0.1)
  const lightness = 0.34 + level(feature.rms) * 0.28 + brightness(feature.centroidHz) * 0.06 + pulse * 0.035
  return { color: magnitude > 1e-9 ? lchColor(lightness, chroma, degrees(Math.atan2(y, x)))
    : { l: lightness, a: 0, b: 0 },
  mapping: { timbreHue: timbre.hue, harmonyHue: harmony.hue, harmonyWeight, noiseWeight } }
}

