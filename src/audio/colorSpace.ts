export interface LabColor { l: number; a: number; b: number }

export const mixLab = (a: LabColor, b: LabColor, t: number): LabColor => ({
  l: a.l + (b.l - a.l) * t, a: a.a + (b.a - a.a) * t, b: a.b + (b.b - a.b) * t,
})

export const colorDistance = (a: LabColor, b: LabColor) => Math.hypot(a.l - b.l, a.a - b.a, a.b - b.b)

export function lchColor(l: number, chroma: number, hue: number): LabColor {
  return { l, a: chroma * Math.cos(hue * Math.PI / 180), b: chroma * Math.sin(hue * Math.PI / 180) }
}

/** Ottosson's Oklab matrices (2021); reduce chroma to the sRGB gamut. */
export function labToLinearRgb(color: LabColor): [number, number, number] {
  const convert = (c: LabColor): [number, number, number] => {
    const l = (c.l + 0.3963377774 * c.a + 0.2158037573 * c.b) ** 3
    const m = (c.l - 0.1055613458 * c.a - 0.0638541728 * c.b) ** 3
    const s = (c.l - 0.0894841775 * c.a - 1.291485548 * c.b) ** 3
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s]
  }
  let rgb = convert(color)
  if (rgb.every(value => value >= 0 && value <= 1)) return rgb
  let low = 0, high = 1
  for (let i = 0; i < 16; i++) {
    const t = (low + high) / 2
    const candidate = convert({ l: color.l, a: color.a * t, b: color.b * t })
    if (candidate.every(value => value >= 0 && value <= 1)) low = t
    else high = t
  }
  rgb = convert({ l: color.l, a: color.a * low, b: color.b * low })
  return rgb.map(value => Math.max(0, Math.min(1, value))) as [number, number, number]
}

export function labToHex(color: LabColor): string {
  return '#' + labToLinearRgb(color).map(value => {
    const srgb = value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055
    return Math.round(srgb * 255).toString(16).padStart(2, '0')
  }).join('')
}

export function hexToLab(hex: string): LabColor {
  const rgb = [1, 3, 5].map(index => {
    const value = parseInt(hex.slice(index, index + 2), 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  const l = Math.cbrt(0.4122214708 * rgb[0] + 0.5363325363 * rgb[1] + 0.0514459929 * rgb[2])
  const m = Math.cbrt(0.2119034982 * rgb[0] + 0.6806995451 * rgb[1] + 0.1073969566 * rgb[2])
  const s = Math.cbrt(0.0883024619 * rgb[0] + 0.2817188376 * rgb[1] + 0.6299787005 * rgb[2])
  return { l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s }
}
