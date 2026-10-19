import { lchColor, type LabColor } from './colorSpace.ts'
import type { AudioFeatureFrame } from './spectralFeatures.ts'
import { analyzeTemporalIdentity } from './temporalIdentity.ts'

const clamp = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
export const TRACK_IDENTITY_VERSION = 'harmony-anchor-v2'

/** Preserve salient pitched observations before averaging the recording.
 * Subtract the uniform pitch-class floor in each window, rather than after
 * averaging. Squared excess emphasizes the audible pitch profile; its original
 * mass gates the contribution so almost-uniform noise cannot become vivid hue.
 * The circle-of-fifths angles and thresholds are declared visual conventions.
 */
function salientHarmony(frames: readonly AudioFeatureFrame[]) {
  const peak = frames.reduce((maximum, frame) => Math.max(maximum, frame.rms), 0)
  let x = 0, y = 0, localMagnitude = 0, excessSum = 0, supportedMass = 0, count = 0
  for (const frame of frames) {
    if (frame.rms < Math.max(1e-5, peak * 0.025)) continue
    count++
    const total = frame.chroma.reduce((sum, value) => sum + Math.max(0, value), 0)
    const excess = frame.chroma.map(value => Math.max(0, value / Math.max(1e-12, total) - 1 / 12))
    const mass = excess.reduce((sum, value) => sum + value, 0)
    const squares = excess.reduce((sum, value) => sum + value * value, 0)
    excessSum += mass
    if (squares < 1e-20) continue
    let localX = 0, localY = 0
    excess.forEach((value, pitchClass) => {
      const angle = (((pitchClass * 7) % 12) * 30 + 265) * Math.PI / 180
      localX += value * value / squares * Math.cos(angle)
      localY += value * value / squares * Math.sin(angle)
    })
    const weight = mass * (1 - Math.sqrt(clamp(frame.flatness)))
    supportedMass += weight
    x += localX * weight
    y += localY * weight
    localMagnitude += Math.hypot(localX, localY) * weight
  }
  const meanExcess = excessSum / Math.max(1, count)
  const vectorX = x / Math.max(1e-12, localMagnitude)
  const vectorY = y / Math.max(1e-12, localMagnitude)
  const coherence = clamp(Math.hypot(vectorX, vectorY))
  const salience = clamp(meanExcess / 0.18)
  // Preserve absolute support as well as relative directional agreement.
  // Otherwise normalizing x/y by localMagnitude cancels the noise attenuation
  // and almost-flat noise can assert the same hue as a clear pitched sound.
  const reliability = clamp(supportedMass / Math.max(1e-12, excessSum))
  return { direction: coherence > 1e-8 ? (Math.atan2(y, x) * 180 / Math.PI + 360) % 360 : null,
    meanExcess, coherence, salience, reliability, vector: { x: vectorX, y: vectorY } }
}

/** Track context is computed once at import, never from rotation or file identity. */
export function explainTrackIdentity(baseColor: LabColor, frames: readonly AudioFeatureFrame[]) {
  const harmonic = salientHarmony(frames)
  const temporal = analyzeTemporalIdentity(frames)
  // Constant single-window/sustained controls have no sequence contribution.
  // Bypassing absolute silence also avoids fabricated context from noisy metadata.
  const audible = frames.some(frame => frame.rms >= 1e-5)
  // A coherent, salient pitch profile carries hue. Timbre supplies the fallback
  // and a smaller contribution when harmony is supported. These are declared
  // design weights, not probabilities or a claim that notes have natural colors.
  const harmonicWeight = audible
    ? 0.85 * harmonic.salience * harmonic.reliability * clamp(harmonic.coherence / 0.65) : 0
  const baseChroma = Math.hypot(baseColor.a, baseColor.b)
  const harmonicChroma = 0.20
  const x = baseColor.a * (1 - harmonicWeight)
    + harmonicChroma * harmonicWeight * harmonic.vector.x / Math.max(1e-12, harmonic.coherence)
  const y = baseColor.b * (1 - harmonicWeight)
    + harmonicChroma * harmonicWeight * harmonic.vector.y / Math.max(1e-12, harmonic.coherence)
  const magnitude = Math.hypot(x, y)
  const chromaMass = baseChroma * (1 - harmonicWeight) + harmonicChroma * harmonicWeight
  // Separate hue composition from pigment strength: two different supported
  // acoustic directions must not routinely dilute each other into gray. Retain
  // a continuous neutral crossing for almost exactly opposing evidence.
  const ambiguityGate = Math.min(1, magnitude / Math.max(1e-12, chromaMass * 0.1))
  // Sequence evidence changes bounded hue/chroma parameters, rather than adding
  // an always-blue Cartesian offset from positive timbral continuity.
  const hueRotation = audible ? 24 * temporal.confidence * temporal.coordinate.x
    + temporal.harmony.confidence * (32 * temporal.harmony.direction + 12 * temporal.harmony.contour) : 0
  const chromaFactor = 1 + (audible ? 0.2 * temporal.harmony.confidence * temporal.harmony.stepContrast
    + 0.1 * temporal.timbre.confidence * temporal.timbre.pulseContrast : 0)
  const timbralContinuity = audible
    ? 0.04 * temporal.timbre.confidence * (2 * temporal.timbre.continuity - 1) : 0
  const lightness = clamp(baseColor.l + 0.055 * temporal.confidence * temporal.rhythm.pulseContrast + timbralContinuity)
  const color = audible ? lchColor(lightness, chromaMass * ambiguityGate * chromaFactor,
    Math.atan2(y, x) * 180 / Math.PI + hueRotation) : { ...baseColor }
  return { color, context: { version: TRACK_IDENTITY_VERSION, baseColor: { ...baseColor },
    harmonic, harmonicWeight, hueRotation, chromaFactor, ambiguityGate, timbralContinuity, temporal } }
}

export type TrackIdentityContext = ReturnType<typeof explainTrackIdentity>['context']
