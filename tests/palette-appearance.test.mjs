import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Color } from 'three'
import { applyPigmentAppearance, DEFAULT_PIGMENT_APPEARANCE } from '../src/audio/paletteAppearance.ts'
import { hexToLab, labToHex, labToLinearRgb, lchColor } from '../src/audio/colorSpace.ts'
import { applyTrajectoryPalette } from '../src/scene/liquid/palette.ts'

const chroma = color => Math.hypot(color.a, color.b)
const hue = color => Math.atan2(color.b, color.a)

test('default appearance raises perceptual lightness and pigment chroma while preserving hue', () => {
  for (let angle = 0; angle < 360; angle += 15) {
    const original = lchColor(0.5, 0.05, angle)
    const before = structuredClone(original)
    const adjusted = applyPigmentAppearance(original)
    assert.ok(Math.abs(adjusted.l - original.l - DEFAULT_PIGMENT_APPEARANCE.lightness) < 1e-12)
    assert.ok(Math.abs(chroma(adjusted) / chroma(original) - DEFAULT_PIGMENT_APPEARANCE.saturation) < 1e-12)
    assert.ok(Math.abs(Math.sin(hue(adjusted) - hue(original))) < 1e-12)
    const visible = hexToLab(labToHex(adjusted))
    assert.ok(visible.l > original.l)
    assert.ok(chroma(visible) > chroma(original))
    assert.ok(Math.abs(Math.sin(hue(visible) - hue(original))) < 0.025)
    assert.deepEqual(original, before)
  }
})

test('brightness does not wash out chroma and intensity does not change lightness', () => {
  const original = lchColor(0.5, 0.06, 220)
  const bright = applyPigmentAppearance(original, { lightness: 0.12, saturation: 1 })
  const vivid = applyPigmentAppearance(original, { lightness: 0, saturation: 1.8 })
  assert.equal(bright.a, original.a)
  assert.equal(bright.b, original.b)
  assert.equal(vivid.l, original.l)
  assert.ok(chroma(vivid) > chroma(original))
  assert.deepEqual(applyPigmentAppearance(original, { lightness: 0, saturation: 1 }), original)
})

test('extreme pigment settings use the existing sRGB gamut mapping and keep neutral colors neutral', () => {
  for (let angle = 0; angle < 360; angle += 15) {
    const adjusted = applyPigmentAppearance(lchColor(0.8, 0.4, angle), { lightness: 0.14, saturation: 2 })
    assert.ok(labToLinearRgb(adjusted).every(value => Number.isFinite(value) && value >= 0 && value <= 1))
  }
  assert.deepEqual(applyPigmentAppearance({ l: 0.97, a: 0, b: 0 }), { l: 1, a: 0, b: 0 })
})

test('render palette applies appearance before gamut conversion and preserves its raw optional path', () => {
  const palette = [lchColor(0.45, 0.08, 230), lchColor(0.5, 0.1, 90), lchColor(0.6, 0.08, 330)]
  const original = structuredClone(palette)
  const colors = palette.map(() => new Color())
  applyTrajectoryPalette(colors, palette)
  assert.deepEqual(colors.map(color => `#${color.getHexString()}`), palette.map(labToHex))
  applyTrajectoryPalette(colors, palette, DEFAULT_PIGMENT_APPEARANCE)
  assert.deepEqual(colors.map(color => `#${color.getHexString()}`), palette.map(color => labToHex(applyPigmentAppearance(color))))
  assert.deepEqual(palette, original)
})
