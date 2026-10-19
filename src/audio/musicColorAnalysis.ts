import { colorDistance, lchColor, mixLab, type LabColor } from './colorSpace.ts'
import type { AudioFeatureFrame, AudioFeaturePayload } from './spectralFeatures.ts'
import { explainFusionColor } from './fusionColorModel.ts'
import { predictPersonalColor, type PersonalColorModel } from './personalColorModel.ts'
import { projectTimbre, TIMBRE_REFERENCE_VERSION } from './timbreProjection.ts'
import { explainTrackIdentity, type TrackIdentityContext } from './trackIdentity.ts'
import { analyzePaletteRelationship, composeRelationalPalette, measurePaletteSeparation,
  measurePaletteSurfaceSeparation,
  type PaletteRelationshipPlan, type RelationalPalette } from './paletteRelationships.ts'

export const COLOR_MODEL = 'rule-based-v7' as const
export const MODEL_VERSIONS = { A: COLOR_MODEL, B: 'personal-ridge-v1', C: 'fusion-v3' } as const
export type ColorModelId = keyof typeof MODEL_VERSIONS
export interface ColorBuildOptions { model?: ColorModelId; personalModel?: PersonalColorModel | null }

export interface IdentityMapping {
  timbreHue: number
  harmonyHue: number | null
  harmonyWeight: number
  noiseWeight: number
  timbreStrength?: number
  timbreReference?: string
  trackContext?: TrackIdentityContext
}

export interface ColorTrajectoryPoint extends AudioFeatureFrame {
  palette: [LabColor, LabColor, LabColor]
  motionSpeed: number
  glow: number
}

export interface ColorSection {
  id: number
  label: string
  start: number
  end: number
  palette: LabColor[]
}

export interface MusicColorAnalysis {
  model: typeof MODEL_VERSIONS[ColorModelId]
  modelId: ColorModelId
  modelRevision: string
  featureBackend: 'librosa'
  extractorVersion: string
  parameters: Record<string, string | number>
  identity: LabColor
  identityPalette: [LabColor, LabColor, LabColor]
  paletteRelationship: PaletteRelationshipPlan
  paletteDiagnostics: RelationalPalette['diagnostics']
  identityMapping: IdentityMapping | null
  learning: { identity: 'learned' | 'time-average'; trajectory: 'learned' | 'constant' } | null
  sections: ColorSection[]
  trajectory: ColorTrajectoryPoint[]
  summary: AudioFeatureFrame & { tempoBpm: number | null }
  emotion: { status: 'not-estimated' }
  sampleRate: number
  duration: number
}

export interface TrackAnalysis {
  algorithm: 'music-color-models-v2'
  sourceId: string
  duration: number
  colors: MusicColorAnalysis
  models: Record<ColorModelId, MusicColorAnalysis | null>
  features: AudioFeaturePayload
}

const clamp = (value: number, low = 0, high = 1) => Math.max(low, Math.min(high, value))
const level = (rms: number) => clamp((20 * Math.log10(Math.max(1e-6, rms)) + 60) / 54)
const brightness = (centroid: number) => clamp(Math.log2(Math.max(120, centroid) / 120) / Math.log2(5000 / 120))

function summarize(frames: AudioFeatureFrame[], balanceSections = false): AudioFeatureFrame {
  const summary: AudioFeatureFrame = { time: frames[0]?.time ?? 0, rms: 0, centroidHz: 0, flatness: 0,
    onset: 0, mfcc: Array(13).fill(0), chroma: Array(12).fill(0) }
  if (!frames.length) return summary
  const audibleFloor = Math.max(1e-5, Math.max(...frames.map(frame => frame.rms)) * 0.025)
  let energyWeight = 0
  for (const frame of frames) {
    summary.rms += frame.rms ** 2
    summary.onset += frame.onset
    // The song's identity must also represent sustained quiet passages.
    // Local windows retain energy weighting; global timbre/harmony uses duration.
    const weight = balanceSections ? (frame.rms >= audibleFloor ? 1 : 0) : frame.rms ** 2
    energyWeight += weight
    summary.centroidHz += frame.centroidHz * weight
    summary.flatness += frame.flatness * weight
    frame.mfcc.forEach((value, i) => { summary.mfcc[i] += value * weight })
    frame.chroma.forEach((value, i) => { summary.chroma[i] += value * weight })
  }
  summary.rms = Math.sqrt(summary.rms / frames.length)
  summary.onset /= frames.length
  if (energyWeight > 1e-16) {
    summary.centroidHz /= energyWeight
    summary.flatness /= energyWeight
    summary.mfcc = summary.mfcc.map(value => value / energyWeight)
    summary.chroma = summary.chroma.map(value => value / energyWeight)
  }
  return summary
}

const degrees = (angle: number) => (angle * 180 / Math.PI + 360) % 360

/** Explicit design rules, not learned emotion or naturally occurring note colors. */
export function explainFeatureColor(feature: AudioFeatureFrame): { color: LabColor; mapping: IdentityMapping } {
  if (feature.rms < 1e-5) return { color: { l: 0.32, a: 0, b: 0 },
    mapping: { timbreHue: 0, harmonyHue: null, harmonyWeight: 0, noiseWeight: 0 } }

  // All twelve shape coefficients use a frozen, centered acoustic reference.
  // It is independent of the upload collection and excludes MFCC0 (gain).
  const timbre = projectTimbre(feature.mfcc)
  // Flatness only reduces chroma. It cannot pull the direction to a fixed hue.
  const noiseWeight = clamp((Math.log10(Math.max(1e-7, feature.flatness)) + 4) / 3) * 0.75
  const timbreAngle = Math.atan2(timbre.y, timbre.x)

  // Remove the uniform chroma floor. Diffuse/noisy profiles must not invent a
  // strong harmonic direction. Confident pitch-class structure uses a unit vector.
  const chromaTotal = feature.chroma.reduce((sum, value) => sum + Math.max(0, value), 0)
  const excess = feature.chroma.map(value => Math.max(0, value / Math.max(1e-12, chromaTotal) - 1 / 12))
  const excessMass = excess.reduce((sum, value) => sum + value, 0)
  let harmonicX = 0, harmonicY = 0
  excess.forEach((weight, pitchClass) => {
    const angle = (((pitchClass * 7) % 12) * 30 + 265) * Math.PI / 180
    harmonicX += Math.cos(angle) * weight
    harmonicY += Math.sin(angle) * weight
  })
  const strength = Math.hypot(harmonicX, harmonicY)
  const concentration = excessMass > 1e-9 ? strength / excessMass : 0
  // Shared key should influence a color without overriding distinct timbres.
  const harmonyWeight = 0.25 * clamp(excessMass / 0.3) * clamp(concentration / 0.35)
  const harmonyAngle = Math.atan2(harmonicY, harmonicX)
  const combinedX = timbre.x * (1 - harmonyWeight) + Math.cos(harmonyAngle) * harmonyWeight
  const combinedY = timbre.y * (1 - harmonyWeight) + Math.sin(harmonyAngle) * harmonyWeight
  const spectralBrightness = brightness(feature.centroidHz)
  const lightness = 0.36 + level(feature.rms) * 0.28 + spectralBrightness * 0.09
  const chromaScale = 0.25 * (1 - noiseWeight * 0.3)
  return {
    // Direct Cartesian color keeps uncertain/near-cancelling evidence neutral,
    // rather than assigning a saturated hue to an almost-zero vector.
    color: { l: lightness, a: combinedX * chromaScale, b: combinedY * chromaScale },
    mapping: { timbreHue: degrees(timbreAngle), harmonyHue: strength > 1e-9 ? degrees(harmonyAngle) : null,
      harmonyWeight, noiseWeight, timbreStrength: timbre.strength, timbreReference: TIMBRE_REFERENCE_VERSION },
  }
}

export function featureColor(feature: AudioFeatureFrame): LabColor {
  return explainFeatureColor(feature).color
}

function novelty(a: AudioFeatureFrame, b: AudioFeatureFrame) {
  const centroid = Math.abs(brightness(a.centroidHz) - brightness(b.centroidHz))
  const loudness = Math.abs(level(a.rms) - level(b.rms))
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < 12; i++) {
    dot += a.chroma[i] * b.chroma[i]
    normA += a.chroma[i] ** 2
    normB += b.chroma[i] ** 2
  }
  const harmony = normA > 1e-12 && normB > 1e-12 ? 1 - dot / Math.sqrt(normA * normB) : 0
  const timbre = a.mfcc.slice(1, 7).reduce((sum, value, i) => sum + Math.abs(Math.tanh(value / 80) - Math.tanh(b.mfcc[i + 1] / 80)), 0) / 6
  return centroid * 0.3 + loudness * 0.2 + harmony * 0.35 + timbre * 0.15
}

/** Acoustic change boundaries; labels deliberately do not claim verse/chorus recognition. */
function sectionBoundaries(frames: AudioFeatureFrame[], duration: number) {
  if (frames.length < 8) return [0, duration]
  const window = Math.max(1, Math.min(6, Math.floor(frames.length / 6)))
  const scores = frames.map((_, i) => i < window || i >= frames.length - window ? 0
    : novelty(summarize(frames.slice(i - window, i)), summarize(frames.slice(i, i + window))))
  const sorted = [...scores].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0
  const deviations = sorted.map(score => Math.abs(score - median)).sort((a, b) => a - b)
  const threshold = Math.max(0.12, median + (deviations[Math.floor(deviations.length / 2)] ?? 0) * 2)
  const gap = Math.max(1, Math.min(8, duration / 8))
  const candidates = scores.map((score, i) => ({ score, time: frames[i].time, i }))
    .filter(({ score, time, i }) => score > threshold && score >= (scores[i - 1] ?? 0) && score > (scores[i + 1] ?? 0)
      && time >= gap && time <= duration - gap)
    .sort((a, b) => b.score - a.score || a.time - b.time)
  const boundaries: number[] = []
  for (const candidate of candidates) {
    if (boundaries.length < 11 && boundaries.every(time => Math.abs(time - candidate.time) >= gap)) boundaries.push(candidate.time)
  }
  return [0, ...boundaries.sort((a, b) => a - b), duration]
}

/** Deterministic medoid-style selection of up to five colors actually on the path. */
function representativeColors(colors: LabColor[]): LabColor[] {
  if (!colors.length) return []
  const mean = colors.reduce((sum, color) => ({ l: sum.l + color.l / colors.length,
    a: sum.a + color.a / colors.length, b: sum.b + color.b / colors.length }), { l: 0, a: 0, b: 0 })
  const first = colors.reduce((best, color) => colorDistance(color, mean) < colorDistance(best, mean) ? color : best, colors[0])
  const selected = [first]
  while (selected.length < 5) {
    let farthest = first, distance = 0
    for (const color of colors) {
      const nearest = Math.min(...selected.map(candidate => colorDistance(candidate, color)))
      if (nearest > distance) { distance = nearest; farthest = color }
    }
    if (distance < 0.025) break
    selected.push(farthest)
  }
  return selected.map(color => ({ ...color }))
}

/** Keep local motion subtle while the three pigment families stay stable for the song. */
function trajectoryMain(identity: LabColor, predicted: LabColor): LabColor {
  const identityChroma = Math.hypot(identity.a, identity.b)
  const l = clamp(identity.l + clamp((predicted.l - identity.l) * 0.45, -0.045, 0.045))
  if (identityChroma < 0.015) return { l, a: identity.a, b: identity.b }
  const identityHue = degrees(Math.atan2(identity.b, identity.a))
  const predictedChroma = Math.hypot(predicted.a, predicted.b)
  const predictedHue = predictedChroma > 0.005 ? degrees(Math.atan2(predicted.b, predicted.a)) : identityHue
  const difference = ((predictedHue - identityHue + 540) % 360) - 180
  const hue = identityHue + clamp(difference * 0.3, -8, 8)
  const chroma = Math.max(0, identityChroma + clamp((predictedChroma - identityChroma) * 0.45, -0.018, 0.018))
  return lchColor(l, chroma, hue)
}

/** Move all three roles together; attenuate any shift that collapses mapped colors. */
function translatedPalette(base: ColorTrajectoryPoint['palette'], main: LabColor, minimumDistance: number,
  minimumSurfaceDistance: number): ColorTrajectoryPoint['palette'] {
  const shifted = (amount: number) => base.map(color => ({
    l: color.l + (main.l - base[0].l) * amount,
    a: color.a + (main.a - base[0].a) * amount,
    b: color.b + (main.b - base[0].b) * amount,
  })) as ColorTrajectoryPoint['palette']
  const qualifies = (palette: ColorTrajectoryPoint['palette']) =>
    measurePaletteSeparation(palette) >= minimumDistance
    && measurePaletteSurfaceSeparation(palette) >= minimumSurfaceDistance
  const result = shifted(1)
  if (minimumDistance <= 0 || qualifies(result)) return result
  let low = 0, high = 1
  for (let i = 0; i < 10; i++) {
    const middle = (low + high) / 2
    if (qualifies(shifted(middle))) low = middle
    else high = middle
  }
  return shifted(low)
}

export function buildMusicColors(payload: AudioFeaturePayload, progress?: (fraction: number) => void,
  options: ColorBuildOptions = {}): MusicColorAnalysis {
  const { frames, sampleRate, duration, tempoBpm } = payload
  const modelId = options.model ?? 'A'
  const personal = options.personalModel
  if (modelId === 'B' && (!personal || (!personal.scopes.identity && !personal.scopes.time))) {
    throw new Error('Model B needs personal color annotations and training first.')
  }
  if (modelId === 'B' && personal?.extractorVersion !== payload.extractorVersion) {
    throw new Error('Model B uses an incompatible feature version. Label and train again with the current version.')
  }
  const summary = summarize(frames, true)
  const ruleResult = modelId === 'C' ? explainFusionColor(summary, tempoBpm) : explainFeatureColor(summary)
  const trackIdentity = modelId === 'B' ? null : explainTrackIdentity(ruleResult.color, frames)
  let identity = trackIdentity?.color ?? ruleResult.color
  if (modelId === 'B' && personal) {
    const predicted = predictPersonalColor(summary, personal, 'identity')
    if (predicted) identity = predicted
    else {
      // A time-only model's fixed identity is the duration mean of its predictions,
      // never a rule prediction presented as a personalized result.
      const predictions = frames.filter(frame => frame.rms >= 1e-5)
        .map(frame => predictPersonalColor(frame, personal, 'time')).filter((color): color is LabColor => color !== null)
      identity = predictions.length ? predictions.reduce((sum, color) => ({
        l: sum.l + color.l / predictions.length, a: sum.a + color.a / predictions.length,
        b: sum.b + color.b / predictions.length,
      }), { l: 0, a: 0, b: 0 }) : { l: 0.32, a: 0, b: 0 }
    }
  }
  const paletteRelationship = analyzePaletteRelationship(summary, frames, tempoBpm)
  const composed = composeRelationalPalette(identity, paletteRelationship)
  const identityPalette = composed.palette
  const paletteDiagnostics = composed.diagnostics
  const minimumDistance = Math.min(paletteRelationship.minimumDistance, paletteDiagnostics.minimumDistance)
  const minimumSurfaceDistance = Math.min(paletteRelationship.minimumSurfaceDistance, paletteDiagnostics.surfaceMinimumDistance)
  const predictedColor = (frame: AudioFeatureFrame): LabColor => {
    if (modelId === 'C') return explainFusionColor(frame, tempoBpm).color
    if (modelId === 'B' && personal) return predictPersonalColor(frame, personal, 'time') ?? identity
    return featureColor(frame)
  }
  const bins: AudioFeatureFrame[][] = []
  for (const frame of frames) {
    const index = Math.floor(frame.time / 0.25)
    if (!bins[index]) bins[index] = []
    bins[index].push(frame)
  }
  const coarse = bins.map((bin, i) => {
    const feature = summarize(bin)
    feature.time = i * 0.25
    feature.onset = Math.max(...bin.map(frame => frame.onset))
    return feature
  })
  const onsetPeak = Math.max(1e-6, ...coarse.map(frame => frame.onset))
  const trajectory: ColorTrajectoryPoint[] = []
  for (const frame of coarse) {
    const targetMain = trajectoryMain(identity, predictedColor(frame))
    const onset = clamp(frame.onset / onsetPeak)
    const previous = trajectory[trajectory.length - 1]
    const speed = 0.45 + onset * 1.6 + (tempoBpm ? tempoBpm / 200 * 0.5 : 0)
    const blend = previous ? 1 - Math.exp(-(frame.time - previous.time) * speed) : 1
    const nextMain = previous ? mixLab(previous.palette[0], targetMain, blend) : targetMain
    const step = previous ? colorDistance(previous.palette[0], nextMain) : 0
    const main = previous && step > 0.025 ? mixLab(previous.palette[0], nextMain, 0.025 / step) : nextMain
    const palette = translatedPalette(identityPalette, main, minimumDistance, minimumSurfaceDistance)
    trajectory.push({ ...frame, palette, motionSpeed: speed, glow: level(frame.rms) * 0.65 + onset * 0.35 })
  }
  const last = trajectory[trajectory.length - 1]
  if (last && last.time < duration) trajectory.push({ ...last, time: duration })
  const boundaries = sectionBoundaries(coarse, duration)
  const sections = boundaries.slice(0, -1).map((start, id) => ({
    id, label: `Section ${String(id + 1).padStart(2, '0')}`, start, end: boundaries[id + 1],
    palette: representativeColors(trajectory.filter(point => point.time >= start && point.time < boundaries[id + 1])
      .flatMap(point => [point.palette[0], point.palette[1]])),
  }))
  progress?.(1)
  return { model: MODEL_VERSIONS[modelId], modelId,
    modelRevision: `${modelId === 'B' && personal ? personal.createdAt : MODEL_VERSIONS[modelId]}+${paletteRelationship.version}`,
    featureBackend: 'librosa', extractorVersion: payload.extractorVersion,
    parameters: payload.parameters, identity, identityPalette, paletteRelationship, paletteDiagnostics,
    identityMapping: modelId === 'B' ? null : { ...ruleResult.mapping, trackContext: trackIdentity!.context },
    learning: modelId === 'B' && personal ? { identity: personal.scopes.identity ? 'learned' : 'time-average',
      trajectory: personal.scopes.time ? 'learned' : 'constant' } : null,
    sections, trajectory, summary: { ...summary, tempoBpm }, emotion: { status: 'not-estimated' }, sampleRate, duration }
}

export function buildTrackModels(payload: AudioFeaturePayload, personalModel?: PersonalColorModel | null,
  progress?: (fraction: number) => void): TrackAnalysis {
  const a = buildMusicColors(payload)
  progress?.(0.4)
  const c = buildMusicColors(payload, undefined, { model: 'C' })
  progress?.(0.8)
  const b = personalModel && personalModel.extractorVersion === payload.extractorVersion && (personalModel.scopes.identity || personalModel.scopes.time)
    ? buildMusicColors(payload, undefined, { model: 'B', personalModel }) : null
  progress?.(1)
  return { algorithm: 'music-color-models-v2', sourceId: payload.sourceId, duration: payload.duration,
    colors: a, models: { A: a, B: b, C: c }, features: payload }
}

/** Pure playback-time lookup: seek/replay never depends on previous animation frames. */
export function sampleColorTrajectory(analysis: MusicColorAnalysis, seconds: number) {
  const points = analysis.trajectory
  if (!points.length) return null
  const time = clamp(seconds, 0, analysis.duration)
  let low = 0, high = points.length - 1
  while (low + 1 < high) {
    const middle = (low + high) >> 1
    if (points[middle].time <= time) low = middle
    else high = middle
  }
  const left = points[low], right = points[high]
  const fraction = right.time > left.time ? clamp((time - left.time) / (right.time - left.time)) : 0
  const blend = fraction * fraction * (3 - 2 * fraction)
  return {
    palette: translatedPalette(analysis.identityPalette, mixLab(left.palette[0], right.palette[0], blend),
      Math.min(analysis.paletteRelationship?.minimumDistance ?? 0, analysis.paletteDiagnostics?.minimumDistance ?? 0),
      Math.min(analysis.paletteRelationship?.minimumSurfaceDistance ?? 0, analysis.paletteDiagnostics?.surfaceMinimumDistance ?? 0)),
    glow: left.glow + (right.glow - left.glow) * blend,
    motionSpeed: left.motionSpeed + (right.motionSpeed - left.motionSpeed) * blend,
    section: analysis.sections.find(section => time >= section.start && (time < section.end || time === analysis.duration)) ?? analysis.sections[0],
    features: blend < 0.5 ? left : right,
  }
}
