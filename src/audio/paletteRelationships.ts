import { colorDistance, hexToLab, labToHex, labToLinearRgb, lchColor, type LabColor } from './colorSpace.ts'
import type { AudioFeatureFrame } from './spectralFeatures.ts'
import { applyPigmentAppearance, DEFAULT_PIGMENT_APPEARANCE } from './paletteAppearance.ts'

export type PaletteScheme = 'analogous' | 'split-complementary' | 'triadic'
export const PALETTE_RELATIONSHIP_VERSION = 'palette-relations-v4' as const

/** These are explicit composition choices, not universal music-to-color laws. */
export interface PaletteRelationshipPlan {
  version: typeof PALETTE_RELATIONSHIP_VERSION
  scheme: PaletteScheme
  silent: boolean
  contrast: number
  activity: number
  harmonicChange: number
  rhythmicActivity: number
  noiseRatio: number
  referenceHue: number
  hueOffsets: [number, number, number]
  minimumDistance: number
  minimumSurfaceDistance: number
}

export interface RelationalPalette {
  palette: [LabColor, LabColor, LabColor]
  diagnostics: {
    minimumDistance: number
    targetDistance: number
    surfaceMinimumDistance: number
    surfaceTargetDistance: number
    meetsTarget: boolean
    gamutLimited: boolean
  }
}

const clamp = (value: number, low = 0, high = 1) => Math.max(low, Math.min(high, value))
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)
const degrees = (angle: number) => (angle * 180 / Math.PI + 360) % 360
const displayed = (color: LabColor) => hexToLab(labToHex(color))

// A conservative approximation of a pigment pool at the default material
// settings: minimum thickness, maximum reflection, and the pale backing alone.
// This checks composition under attenuation; it is not a GPU pixel prediction.
const surfaceAlpha = DEFAULT_PIGMENT_APPEARANCE.opacity * 0.78
const surfacePigmentWeight = 1 - 0.035
const surfaceBacking = labToLinearRgb(hexToLab('#d9dfe8'))

function surfaceColor(color: LabColor): LabColor {
  const pigment = displayed(applyPigmentAppearance(color))
  const hex = '#' + labToLinearRgb(pigment).map((value, channel) => {
    const lifted = value * surfacePigmentWeight + 1 - surfacePigmentWeight
    const linear = lifted * surfaceAlpha + surfaceBacking[channel] * (1 - surfaceAlpha)
    const srgb = linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055
    return Math.round(srgb * 255).toString(16).padStart(2, '0')
  }).join('')
  return hexToLab(hex)
}

function minimumPairDistance(colors: [LabColor, LabColor, LabColor]) {
  return Math.min(colorDistance(colors[0], colors[1]), colorDistance(colors[0], colors[2]), colorDistance(colors[1], colors[2]))
}

function pitchProfile(frame: AudioFeatureFrame) {
  const values = frame.chroma.map(value => Math.max(0, value))
  const total = values.reduce((sum, value) => sum + value, 0)
  return values.map(value => value / Math.max(1e-12, total))
}

/** Analyze once for the complete recording; neither playback time nor rotation is an input. */
export function analyzePaletteRelationship(
  summary: AudioFeatureFrame,
  frames: AudioFeatureFrame[],
  tempoBpm: number | null,
): PaletteRelationshipPlan {
  const silent = summary.rms < 1e-5
  const peakRms = frames.reduce((peak, frame) => Math.max(peak, frame.rms), summary.rms)
  const active = frames.filter(frame => frame.rms >= Math.max(1e-5, peakRms * 0.025))
  const sequence = active.length ? active : [summary]
  const profiles = sequence.map(pitchProfile)
  const changes = profiles.slice(1).map((profile, index) => {
    const previous = profiles[index]
    const norm = Math.hypot(...profile) * Math.hypot(...previous)
    if (norm < 1e-12) return 0
    return clamp(1 - profile.reduce((sum, value, i) => sum + value * previous[i], 0) / norm)
  })
  const harmonicChange = silent ? 0 : clamp(mean(changes) * 3)
  const onsets = sequence.map(frame => Math.max(0, frame.onset))
  const onsetMean = mean(onsets)
  const onsetDelta = mean(onsets.slice(1).map((value, i) => Math.abs(value - onsets[i])))
  // A constant onset envelope supplies no rhythmic-change evidence. Tempo alone
  // cannot turn a sustained pad into a highly active arrangement.
  const onsetVariation = clamp(onsetDelta / Math.max(1e-9, onsetMean * 2))
  const tempoFactor = tempoBpm === null || !Number.isFinite(tempoBpm)
    ? 0.7 : 0.55 + clamp((tempoBpm - 55) / 110) * 0.45
  const rhythmicActivity = silent ? 0 : onsetVariation * tempoFactor
  const levels = sequence.map(frame => frame.rms / Math.max(1e-9, peakRms))
  const levelMean = mean(levels)
  const dynamics = clamp(Math.sqrt(mean(levels.map(value => (value - levelMean) ** 2))) * 3)
  const noiseRatio = silent ? 0 : clamp((Math.log10(Math.max(1e-7, summary.flatness)) + 4) / 4)
  const activity = clamp(rhythmicActivity * 0.6 + harmonicChange * 0.25 + dynamics * 0.15)
  const contrast = silent ? 0 : clamp(0.16 + activity * 0.62 + harmonicChange * 0.12 + noiseRatio * 0.1)
  // Reserve near neighbors for clearly restrained passages. Normal arrangements
  // use split complements; strong rhythmic/harmonic change selects three axes.
  const scheme: PaletteScheme = activity >= 0.52 || harmonicChange >= 0.6 ? 'triadic'
    : activity < 0.2 && contrast < 0.3 && noiseRatio < 0.18 ? 'analogous' : 'split-complementary'
  let x = 0, y = 0
  pitchProfile(summary).forEach((weight, pitchClass) => {
    const angle = (((pitchClass * 7) % 12) * 30 + 265) * Math.PI / 180
    x += Math.cos(angle) * weight
    y += Math.sin(angle) * weight
  })
  if (Math.hypot(x, y) < 1e-6) {
    x = (summary.mfcc[2] ?? 0) - (summary.mfcc[4] ?? 0) * 0.5
    y = (summary.mfcc[3] ?? 0) + (summary.mfcc[5] ?? 0) * 0.5
  }
  // Only an achromatic core needs this explicit design anchor. A learned gray
  // core stays gray; its accents may still use this feature-conditioned hue.
  const referenceHue = Math.hypot(x, y) > 1e-6 ? degrees(Math.atan2(y, x)) : 265
  return { version: PALETTE_RELATIONSHIP_VERSION, scheme, silent, contrast, activity, harmonicChange,
    rhythmicActivity, noiseRatio, referenceHue,
    hueOffsets: scheme === 'triadic' ? [0, 120, 240] : scheme === 'split-complementary' ? [0, 140, 220] : [0, 50, -50],
    minimumDistance: silent ? 0 : scheme === 'analogous' ? 0.14 : 0.17,
    minimumSurfaceDistance: silent ? 0 : scheme === 'analogous' ? 0.06 : 0.075 }
}

/** Compose once per identity, checking both sRGB swatches and attenuated resin pools. */
export function composeRelationalPalette(main: LabColor, plan: PaletteRelationshipPlan): RelationalPalette {
  const visibleMain = displayed(main)
  if (plan.silent) {
    const palette: RelationalPalette['palette'] = [main,
      { l: clamp(main.l + 0.08), a: 0, b: 0 }, { l: clamp(main.l + 0.16), a: 0, b: 0 }]
    return { palette, diagnostics: { minimumDistance: measurePaletteSeparation(palette), targetDistance: 0,
      surfaceMinimumDistance: measurePaletteSurfaceSeparation(palette), surfaceTargetDistance: 0,
      meetsTarget: true, gamutLimited: false } }
  }

  const surfaceMain = surfaceColor(main)
  const hue = Math.hypot(visibleMain.a, visibleMain.b) >= 0.015
    ? degrees(Math.atan2(visibleMain.b, visibleMain.a)) : plan.referenceHue
  const baseChroma = 0.18 + plan.contrast * 0.04
  const baseLightness = clamp(main.l, 0.43, 0.73)
  const candidates = (offset: number, role: 1 | 2) => {
    const desiredLightness = clamp(baseLightness + (role === 1 ? -0.1 : 0.16), 0.36, 0.83)
    const desiredChroma = baseChroma * (role === 1 ? 1 : 0.9)
    const lightnesses = [...new Set([desiredLightness, desiredLightness - 0.08, desiredLightness + 0.08,
      desiredLightness - 0.16, desiredLightness + 0.16, 0.32, 0.42, 0.52, 0.62, 0.72, 0.82, 0.88]
      .map(value => clamp(value, 0.3, 0.88)))]
    return lightnesses.flatMap(l => [desiredChroma, desiredChroma + 0.045, desiredChroma - 0.035].map(chroma => {
      const color = lchColor(l, chroma, hue + offset)
      const visible = displayed(color)
      return { color, visible, surface: surfaceColor(color),
        cost: Math.abs(l - desiredLightness) + Math.abs(chroma - desiredChroma) * 0.6 }
    }))
  }
  const secondary = candidates(plan.hueOffsets[1], 1)
  const counterpoint = candidates(plan.hueOffsets[2], 2)
  let best: { palette: RelationalPalette['palette']; separation: number; surfaceSeparation: number;
    score: number; cost: number } | null = null
  for (const left of secondary) for (const right of counterpoint) {
    const separation = minimumPairDistance([visibleMain, left.visible, right.visible])
    const surfaceSeparation = minimumPairDistance([surfaceMain, left.surface, right.surface])
    const cost = left.cost + right.cost
    const score = Math.min(separation / plan.minimumDistance, surfaceSeparation / plan.minimumSurfaceDistance)
    const qualifies = score >= 1
    const bestQualifies = best !== null && best.score >= 1
    if (!best || (qualifies && !bestQualifies) || (qualifies && bestQualifies && cost < best.cost - 1e-12)
      || (!qualifies && !bestQualifies && score > best.score + 1e-12)) {
      best = { palette: [main, left.color, right.color], separation, surfaceSeparation, score, cost }
    }
  }
  const palette = best!.palette
  return { palette, diagnostics: {
    minimumDistance: best!.separation,
    targetDistance: plan.minimumDistance,
    surfaceMinimumDistance: best!.surfaceSeparation,
    surfaceTargetDistance: plan.minimumSurfaceDistance,
    meetsTarget: best!.score >= 1,
    gamutLimited: palette.some(color => colorDistance(color, displayed(color)) > 0.01),
  } }
}

/** Minimum pairwise Oklab distance of the represented, gamut-mapped sRGB colors. */
export function measurePaletteSeparation(palette: [LabColor, LabColor, LabColor]) {
  return minimumPairDistance(palette.map(displayed) as [LabColor, LabColor, LabColor])
}

/** Minimum Oklab distance under the conservative default resin appearance approximation. */
export function measurePaletteSurfaceSeparation(palette: [LabColor, LabColor, LabColor]) {
  return minimumPairDistance(palette.map(surfaceColor) as [LabColor, LabColor, LabColor])
}
