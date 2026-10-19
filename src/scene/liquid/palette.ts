import type { Color } from 'three'
import { labToLinearRgb, type LabColor } from '../../audio/colorSpace.ts'
import { applyPigmentAppearance, type PigmentAppearance } from '../../audio/paletteAppearance.ts'

/** Convert the sampled, precomputed Oklab colors into Three's linear RGB. */
export function applyTrajectoryPalette(colors: Color[], palette: LabColor[] | null, appearance?: PigmentAppearance) {
  colors.forEach((color, index) => {
    const swatch = palette?.[index]
    if (swatch) {
      const rgb = labToLinearRgb(appearance ? applyPigmentAppearance(swatch, appearance) : swatch)
      color.setRGB(rgb[0], rgb[1], rgb[2])
    }
    else color.set('#aaaaaa')
  })
}
