import type { LabColor } from './colorSpace.ts'

export interface PigmentAppearance {
  lightness: number
  saturation: number
}

export const DEFAULT_PIGMENT_APPEARANCE = Object.freeze({
  opacity: 0.82,
  lightness: 0.06,
  saturation: 1.35,
})

/** Adjust perceptual lightness and chroma before the existing sRGB gamut conversion. */
export function applyPigmentAppearance(color: LabColor,
  appearance: PigmentAppearance = DEFAULT_PIGMENT_APPEARANCE): LabColor {
  return {
    l: Math.max(0, Math.min(1, color.l + appearance.lightness)),
    a: color.a * appearance.saturation,
    b: color.b * appearance.saturation,
  }
}
