import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Color } from 'three'
import { analyzePaletteRelationship, composeRelationalPalette, measurePaletteSeparation,
  measurePaletteSurfaceSeparation } from '../src/audio/paletteRelationships.ts'
import { colorDistance, hexToLab, labToHex, lchColor } from '../src/audio/colorSpace.ts'
import { DEFAULT_LIQUID_SETTINGS } from '../src/state/liquidSettings.ts'

function feature(time = 0, changes = {}) {
  return { time, rms: 0.06, centroidHz: 700, flatness: 0.00001, onset: 0,
    mfcc: [-100, 30, -15, 10, -2, 4, 2], chroma: Array.from({ length: 12 }, (_, i) => i === 0 ? 1 : 0), ...changes }
}

const quietFrames = Array.from({ length: 48 }, (_, i) => feature(i / 4))
const normalFrames = quietFrames.map(frame => ({ ...frame, rms: 0.2, flatness: 0.01 }))
const activeFrames = quietFrames.map((frame, i) => ({ ...frame, rms: i % 2 ? 0.3 : 0.05,
  onset: i % 2 ? 5 : 0, chroma: Array.from({ length: 12 }, (_, pitch) => pitch === (i % 2 ? 6 : 0) ? 1 : 0) }))

test('quiet, ordinary, and active recordings select explicit repeatable color relationships', () => {
  const quiet = analyzePaletteRelationship(quietFrames[0], quietFrames, null)
  const normal = analyzePaletteRelationship(normalFrames[0], normalFrames, 110)
  const active = analyzePaletteRelationship(activeFrames[0], activeFrames, 150)
  assert.equal(quiet.scheme, 'analogous')
  assert.equal(normal.scheme, 'split-complementary')
  assert.equal(active.scheme, 'triadic')
  assert.deepEqual(quiet.hueOffsets, [0, 50, -50])
  assert.deepEqual(normal.hueOffsets, [0, 140, 220])
  assert.deepEqual(active.hueOffsets, [0, 120, 240])
  assert.ok(active.contrast > quiet.contrast)
  assert.ok(active.harmonicChange > quiet.harmonicChange)
  assert.deepEqual(active, analyzePaletteRelationship(structuredClone(activeFrames[0]), structuredClone(activeFrames), 150))
  const identity = lchColor(0.62, 0.11, 215)
  assert.deepEqual(composeRelationalPalette(identity, active), composeRelationalPalette(identity, structuredClone(active)))
})

test('tempo alone cannot invent energetic color contrast for a sustained sound', () => {
  const slow = analyzePaletteRelationship(quietFrames[0], quietFrames, 60)
  const fast = analyzePaletteRelationship(quietFrames[0], quietFrames, 190)
  assert.equal(slow.rhythmicActivity, 0)
  assert.equal(fast.rhythmicActivity, 0)
  assert.equal(slow.scheme, fast.scheme)
})

test('gain changes preserve relationships while audible activity stays the same', () => {
  for (const frames of [quietFrames, normalFrames, activeFrames]) {
    const original = analyzePaletteRelationship(frames[0], frames, 130)
    for (const gain of [0.01, 0.1, 2]) {
      const scaled = frames.map(frame => ({ ...frame, rms: frame.rms * gain }))
      const result = analyzePaletteRelationship(scaled[0], scaled, 130)
      assert.equal(result.scheme, original.scheme)
      assert.deepEqual(result.hueOffsets, original.hueOffsets)
      assert.ok(Math.abs(result.activity - original.activity) < 1e-12)
      assert.ok(Math.abs(result.contrast - original.contrast) < 1e-12)
    }
  }
})

test('nonfinite tempo uses the same finite fallback as an unavailable estimate', () => {
  const expected = analyzePaletteRelationship(activeFrames[0], activeFrames, null)
  for (const tempo of [NaN, Infinity, -Infinity]) {
    const result = analyzePaletteRelationship(activeFrames[0], activeFrames, tempo)
    assert.deepEqual(result, expected)
    assert.ok(Object.values(result).filter(value => typeof value === 'number').every(Number.isFinite))
  }
})

test('three roles remain separated after actual sRGB gamut conversion across hues and schemes', () => {
  for (const frames of [quietFrames, normalFrames, activeFrames]) {
    const plan = analyzePaletteRelationship(frames[0], frames, 130)
    for (let hue = 0; hue < 360; hue += 30) {
      for (const chroma of [0.04, 0.13, 0.35]) {
        const main = lchColor(0.62, chroma, hue)
        const result = composeRelationalPalette(main, plan)
        assert.strictEqual(result.palette[0], main, 'composition must preserve the exact identity')
        const visible = result.palette.map(color => hexToLab(labToHex(color)))
        const measured = Math.min(colorDistance(visible[0], visible[1]), colorDistance(visible[0], visible[2]), colorDistance(visible[1], visible[2]))
        assert.ok(result.diagnostics.meetsTarget, `failed ${plan.scheme} at hue ${hue}, chroma ${chroma}`)
        assert.ok(measured >= plan.minimumDistance)
        assert.equal(result.diagnostics.minimumDistance, measured)
        assert.equal(measurePaletteSeparation(result.palette), measured)
        assert.equal(new Set(result.palette.map(labToHex)).size, 3)
      }
    }
  }
})

// Use Three's independent color conversion and blending operations to inspect
// the same composition after pale backing, white light, and transmission.
function simulatedResinColors(palette) {
  const white = new Color('#ffffff')
  const backing = new Color('#d9dfe8')
  return palette.map(color => {
    const pigment = new Color(labToHex({
      l: Math.min(1, Math.max(0, color.l + DEFAULT_LIQUID_SETTINGS.lightness)),
      a: color.a * DEFAULT_LIQUID_SETTINGS.saturation,
      b: color.b * DEFAULT_LIQUID_SETTINGS.saturation,
    })).lerp(white, 0.035)
    const surface = backing.clone().lerp(pigment, DEFAULT_LIQUID_SETTINGS.opacity * 0.78)
    return hexToLab('#' + surface.getHexString())
  })
}

test('pigments retain useful separation under conservative default resin appearance across the color wheel', () => {
  for (const frames of [quietFrames, normalFrames, activeFrames]) {
    const plan = analyzePaletteRelationship(frames[0], frames, 130)
    for (let hue = 0; hue < 360; hue += 15) {
      for (const lightness of [0.35, 0.5, 0.62, 0.8]) {
        for (const chroma of [0.02, 0.13, 0.35]) {
          const main = lchColor(lightness, chroma, hue)
          const result = composeRelationalPalette(main, plan)
          const surface = simulatedResinColors(result.palette)
          const distances = [colorDistance(surface[0], surface[1]), colorDistance(surface[0], surface[2]), colorDistance(surface[1], surface[2])]
          const label = `${plan.scheme} at hue ${hue}, lightness ${lightness}, chroma ${chroma}`
          assert.strictEqual(result.palette[0], main, label)
          assert.ok(result.diagnostics.meetsTarget, label)
          assert.ok(Math.min(...distances) >= plan.minimumSurfaceDistance, label)
          assert.ok(measurePaletteSeparation(result.palette) >= plan.minimumDistance, label)
          assert.equal(result.diagnostics.surfaceMinimumDistance, measurePaletteSurfaceSeparation(result.palette))
          assert.equal(result.diagnostics.surfaceTargetDistance, plan.minimumSurfaceDistance)
        }
      }
    }
  }
})

test('flat swatch differences alone cannot qualify a palette that fades together in resin', () => {
  // A darker nearby palette remains vulnerable to pale-backing dilution even
  // at the higher default opacity. Raw swatch separation alone is insufficient.
  const closePalette = [lchColor(0.5, 0.13, 215), lchColor(0.465, 0.14, 250), lchColor(0.59, 0.126, 180)]
  const swatchDistance = measurePaletteSeparation(closePalette)
  assert.ok(swatchDistance >= 0.08, 'the former analogous target accepts these swatches')
  assert.ok(measurePaletteSurfaceSeparation(closePalette) < 0.06)
  const plan = analyzePaletteRelationship(quietFrames[0], quietFrames, null)
  const result = composeRelationalPalette(closePalette[0], plan)
  assert.ok(result.diagnostics.meetsTarget)
  assert.ok(measurePaletteSurfaceSeparation(result.palette) >= 0.06)
  assert.ok(measurePaletteSurfaceSeparation(result.palette) > measurePaletteSurfaceSeparation(closePalette) * 1.5)
})

test('black, white, and learned neutral identities are preserved while accents are explicitly composed', () => {
  const plan = analyzePaletteRelationship(normalFrames[0], normalFrames, 110)
  for (const hex of ['#000000', '#ffffff', '#777777']) {
    const main = hexToLab(hex)
    const result = composeRelationalPalette(main, plan)
    assert.strictEqual(result.palette[0], main)
    assert.equal(labToHex(result.palette[0]), hex)
    assert.ok(result.diagnostics.meetsTarget)
    assert.ok(result.palette.slice(1).every(color => Math.hypot(color.a, color.b) > 0.05))
    assert.ok(result.palette.flatMap(color => Object.values(color)).every(Number.isFinite))
  }
})

test('silence keeps a neutral palette and bypasses chromatic separation targets', () => {
  const silence = feature(0, { rms: 0, onset: 0, chroma: Array(12).fill(0), mfcc: Array(13).fill(0) })
  const plan = analyzePaletteRelationship(silence, [silence], null)
  const main = { l: 0.32, a: 0, b: 0 }
  const result = composeRelationalPalette(main, plan)
  assert.ok(plan.silent)
  assert.equal(plan.minimumDistance, 0)
  assert.equal(plan.minimumSurfaceDistance, 0)
  assert.strictEqual(result.palette[0], main)
  assert.ok(result.palette.every(color => color.a === 0 && color.b === 0))
  assert.ok(result.diagnostics.meetsTarget)
})

test('gamut diagnostics report chroma compression rather than trusting preconversion distances', () => {
  const plan = analyzePaletteRelationship(normalFrames[0], normalFrames, 110)
  const main = lchColor(0.7, 0.8, 200)
  const result = composeRelationalPalette(main, plan)
  assert.ok(result.diagnostics.gamutLimited)
  assert.ok(result.diagnostics.meetsTarget)
  assert.equal(result.diagnostics.minimumDistance, measurePaletteSeparation(result.palette))
})

test('an unreachable resin target reports achieved separation without claiming success', () => {
  const plan = { ...analyzePaletteRelationship(normalFrames[0], normalFrames, 110), minimumSurfaceDistance: 0.8 }
  const main = lchColor(0.62, 0.13, 215)
  const result = composeRelationalPalette(main, plan)
  assert.strictEqual(result.palette[0], main)
  assert.equal(result.diagnostics.meetsTarget, false)
  assert.equal(result.diagnostics.surfaceTargetDistance, 0.8)
  assert.equal(result.diagnostics.surfaceMinimumDistance, measurePaletteSurfaceSeparation(result.palette))
  assert.ok(result.diagnostics.surfaceMinimumDistance < result.diagnostics.surfaceTargetDistance)
  assert.ok(result.diagnostics.surfaceMinimumDistance > 0)
})
