import assert from 'node:assert/strict'
import { test } from 'node:test'
import { explainFusionColor, FUSION_MODEL_DESCRIPTION } from '../src/audio/fusionColorModel.ts'

function feature(overrides = {}) {
  const chroma = Array(12).fill(0)
  chroma[0] = 1
  chroma[4] = 0.8
  chroma[7] = 0.9
  return { time: 0, rms: 0.1, centroidHz: 1800, flatness: 0.01, onset: 2,
    mfcc: [80, 30, -10, 20, 15, -5, 10, 0, 0, 0, 0, 0, 0], chroma, ...overrides }
}

const hue = color => Math.atan2(color.b, color.a)
const sameHue = (left, right) => assert.ok(Math.abs(Math.sin(hue(left) - hue(right))) < 1e-12
  && Math.cos(hue(left) - hue(right)) > 0.999999)

test('fusion is explicitly untrained, deterministic, and independent of feature timestamps', () => {
  const input = feature()
  const result = explainFusionColor(input, 120)
  assert.equal(FUSION_MODEL_DESCRIPTION.training, 'untrained')
  assert.equal(FUSION_MODEL_DESCRIPTION.emotion, 'not-estimated')
  assert.deepEqual(result, explainFusionColor(structuredClone(input), 120))
  assert.deepEqual(result, explainFusionColor({ ...input, time: 999 }, 120))
})

test('inverse DCT timbre axes distinguish low and high spectral prominence without chroma', () => {
  const input = feature({ chroma: Array(12).fill(1 / 12), mfcc: Array(13).fill(0) })
  const bass = { ...input, mfcc: [...input.mfcc] }, treble = { ...input, mfcc: [...input.mfcc] }
  bass.mfcc[1] = 80
  treble.mfcc[1] = -80
  const left = explainFusionColor(bass), right = explainFusionColor(treble)
  assert.ok(left.color.a > 0.05)
  assert.ok(right.color.a < -0.05)
  assert.ok(Math.hypot(left.color.a - right.color.a, left.color.b - right.color.b) > 0.1)
  assert.equal(left.mapping.harmonyWeight, 0)
  assert.equal(left.mapping.harmonyHue, null)
})

test('recording gain and MFCC0 do not change timbral or harmonic hue', () => {
  const input = feature()
  const quiet = explainFusionColor(input)
  const louder = explainFusionColor({ ...input, rms: 0.3,
    mfcc: input.mfcc.map((value, index) => index === 0 ? value + 300 : value) })
  sameHue(quiet.color, louder.color)
  assert.deepEqual(quiet.mapping, louder.mapping)
  assert.ok(louder.color.l > quiet.color.l)
})

test('root-specific triad evidence influences fusion while uniform chroma remains unassertive', () => {
  const input = feature({ mfcc: Array(13).fill(0) })
  const c = explainFusionColor(input)
  const shifted = input.chroma.map((_, index) => input.chroma[(index + 6) % 12])
  const fs = explainFusionColor({ ...input, chroma: shifted })
  assert.ok(c.mapping.harmonyWeight > 0.1)
  assert.equal(c.mapping.harmonyHue, 0)
  assert.equal(fs.mapping.harmonyHue, 180)
  assert.ok(c.color.a > 0 && fs.color.a < 0)
  const uniform = explainFusionColor({ ...input, chroma: Array(12).fill(1 / 12) })
  assert.equal(uniform.mapping.harmonyHue, null)
  assert.equal(uniform.mapping.harmonyWeight, 0)
  assert.equal(uniform.color.a, 0)
  assert.equal(uniform.color.b, 0)
})

test('flatness changes saturation without attracting different timbres to a fixed hue', () => {
  const input = feature({ chroma: Array(12).fill(0) })
  const clean = explainFusionColor({ ...input, flatness: 0 })
  const noisy = explainFusionColor({ ...input, flatness: 1 })
  sameHue(clean.color, noisy.color)
  assert.ok(Math.hypot(noisy.color.a, noisy.color.b) < Math.hypot(clean.color.a, clean.color.b))
  const opposite = explainFusionColor({ ...input, flatness: 1, mfcc: input.mfcc.map(value => -value) })
  assert.ok(noisy.color.a * opposite.color.a + noisy.color.b * opposite.color.b < 0)
})

test('rhythm affects brightness and chroma while leaving the core hue unchanged', () => {
  const input = feature()
  const calm = explainFusionColor({ ...input, onset: 0 }, null)
  const active = explainFusionColor({ ...input, onset: 30 }, 180)
  sameHue(calm.color, active.color)
  assert.ok(active.color.l > calm.color.l)
  assert.ok(Math.hypot(active.color.a, active.color.b) > Math.hypot(calm.color.a, calm.color.b))
  // Tempo by itself does not fabricate measured rhythmic activity.
  assert.deepEqual(calm, explainFusionColor({ ...input, onset: 0 }, 180))
  assert.deepEqual(explainFusionColor(input, null), explainFusionColor(input, Number.NaN))
})

test('silence remains a neutral core without fabricated harmonic evidence', () => {
  const { color, mapping } = explainFusionColor(feature({ rms: 0 }), 180)
  assert.deepEqual(color, { l: 0.32, a: 0, b: 0 })
  assert.equal(mapping.harmonyWeight, 0)
})
