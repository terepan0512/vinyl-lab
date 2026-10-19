import assert from 'node:assert/strict'
import { test } from 'node:test'
import { analyzeTemporalIdentity } from '../src/audio/temporalIdentity.ts'

const frame = (note = 0, rms = 0.1, mfcc = 0) => ({ time: 0, rms, centroidHz: 1200,
  flatness: 0.01, onset: 0, mfcc: [-100, ...Array(12).fill(mfcc)],
  chroma: Array.from({ length: 12 }, (_, index) => index === note ? 1 : 0) })
const series = values => values.map((value, index) => ({ ...value, time: index / 4 }))
const compare = (left, right, tolerance = 1e-10) => {
  if (typeof left === 'number' && typeof right === 'number') assert.ok(Math.abs(left - right) < tolerance, `${left} != ${right}`)
  else if (Array.isArray(left)) left.forEach((value, index) => compare(value, right[index], tolerance))
  else if (left && typeof left === 'object') Object.keys(left).forEach(key => compare(left[key], right[key], tolerance))
  else assert.equal(left, right)
}

test('silence and a stationary sustained sound have no temporal evidence', () => {
  for (const input of [[], series(Array.from({ length: 32 }, () => frame(2))),
    series(Array.from({ length: 32 }, (_, index) => ({ ...frame(index % 12, 0, index), onset: index })))]) {
    const result = analyzeTemporalIdentity(input)
    assert.equal(result.confidence, 0)
    assert.deepEqual(result.coordinate, { x: 0, y: 0 })
    assert.equal(result.harmony.change, 0)
  }
})

test('the same frame multiset can reveal different directed harmonic transitions', () => {
  const ascending = series(Array.from({ length: 48 }, (_, index) => frame([0, 2, 4, 7][index % 4])))
  const reordered = series(Array.from({ length: 48 }, (_, index) => frame([0, 7, 4, 2][index % 4])))
  const a = analyzeTemporalIdentity(ascending), b = analyzeTemporalIdentity(reordered)
  assert.ok(a.harmony.direction > 0.2)
  assert.ok(b.harmony.direction < -0.2)
  assert.ok(Math.abs(a.coordinate.y - b.coordinate.y) > 0.4)
  assert.notDeepEqual(a.harmony.directedIntervals, b.harmony.directedIntervals)
})

test('gain and constant MFCC recording offsets leave sequence descriptors unchanged', () => {
  const input = series(Array.from({ length: 48 }, (_, index) => ({ ...frame(index % 5, index % 4 === 0 ? 0.2 : 0.05, index % 3 * 12),
    onset: index % 4 === 0 ? 2 : 0.1 })))
  const changed = input.map(item => ({ ...item, rms: item.rms * 0.03, onset: item.onset * 8,
    mfcc: item.mfcc.map((value, coefficient) => value + 400 - coefficient * 21) }))
  compare(analyzeTemporalIdentity(input), analyzeTemporalIdentity(changed))
})

test('successive transition contour distinguishes order beyond the same first-order interval counts', () => {
  const interleaved = [0, 2, 0, 5, 0, 2, 0, 5]
  const grouped = [0, 2, 0, 2, 0, 5, 0, 5]
  const a = analyzeTemporalIdentity(series(Array.from({ length: 16 }, () => interleaved).flat().map(note => frame(note))))
  const b = analyzeTemporalIdentity(series(Array.from({ length: 16 }, () => grouped).flat().map(note => frame(note))))
  compare(a.harmony.directedIntervals, b.harmony.directedIntervals)
  assert.ok(Math.abs(a.harmony.contour - b.harmony.contour) > 0.1)
  assert.ok(Math.abs(a.coordinate.y - b.coordinate.y) > 0.03)
})

test('uniform nonzero transition intervals do not impose a distant-motion color bias', () => {
  const notes = [0]
  for (let interval = 1; interval < 12; interval++) {
    for (let repeat = 0; repeat < 12; repeat++) notes.push((notes.at(-1) + interval) % 12)
  }
  const result = analyzeTemporalIdentity(series(notes.map(note => frame(note))))
  for (const probability of result.harmony.directedIntervals.slice(1)) assert.ok(Math.abs(probability - 1 / 11) < 1e-12)
  assert.ok(Math.abs(result.harmony.stepContrast) < 1e-12)
  assert.ok(Math.hypot(...Object.values(result.harmony.centeredTransitionVector)) < 1e-12)
  assert.ok(result.harmony.confidence < 1e-7)
})

test('timbral modulation patterns survive constant per-coefficient recording offsets and scales', () => {
  const input = series(Array.from({ length: 96 }, (_, index) => ({ ...frame(0),
    mfcc: [-80, ...Array.from({ length: 12 }, (_, coefficient) =>
      20 * Math.sin(index * 0.3 + coefficient) + 10 * Math.cos(index * 0.7 - coefficient))] })))
  const transformed = input.map(item => ({ ...item, mfcc: item.mfcc.map((value, coefficient) =>
    value * (0.5 + coefficient / 4) + 300 - coefficient * 15) }))
  const a = analyzeTemporalIdentity(input), b = analyzeTemporalIdentity(transformed)
  compare(a.timbre.lagCorrelations, b.timbre.lagCorrelations)
  compare(a.timbre.pulseContrast, b.timbre.pulseContrast)
})

test('local pulse contrast retains alternating attacks rather than collapsing all positive correlation into a mean pace', () => {
  const alternating = series(Array.from({ length: 128 }, (_, index) => ({ ...frame(), onset: index % 2 ? 0 : 2 })))
  const longerPulse = series(Array.from({ length: 128 }, (_, index) => ({ ...frame(), onset: index % 6 ? 0 : 2 })))
  const a = analyzeTemporalIdentity(alternating), b = analyzeTemporalIdentity(longerPulse)
  assert.ok(a.rhythm.pulseContrast > 0.8)
  assert.ok(Math.abs(a.rhythm.rateBalance - b.rhythm.rateBalance) > 0.2)
  assert.ok(Math.hypot(a.coordinate.x - b.coordinate.x, a.coordinate.y - b.coordinate.y) > 0.2)
})

test('pulse spacing and timbral order contribute beyond identical global means', () => {
  const notes = Array.from({ length: 48 }, (_, index) => frame(0, index % 4 === 0 ? 0.2 : 0.05))
  const grouped = Array.from({ length: 48 }, (_, index) => frame(0, index < 12 ? 0.2 : 0.05))
  const periodic = analyzeTemporalIdentity(series(notes)), block = analyzeTemporalIdentity(series(grouped))
  assert.ok(periodic.rhythm.regularity > 0.9)
  assert.ok(Math.abs(periodic.coordinate.x - block.coordinate.x) > 0.15)
  const fast = analyzeTemporalIdentity(series(Array.from({ length: 48 }, (_, index) => frame(0, 0.1, index % 2 * 30))))
  const slow = analyzeTemporalIdentity(series(Array.from({ length: 48 }, (_, index) => frame(0, 0.1, index % 12 < 6 ? 0 : 30))))
  assert.ok(Math.abs(fast.timbre.variation - slow.timbre.variation) < 1e-12)
  assert.ok(fast.timbre.pace > slow.timbre.pace + 0.4)
  assert.ok(Math.abs(fast.coordinate.x - slow.coordinate.x) > 0.8)
})

test('nearby feature perturbations remain continuous and repetition does not become a duration fingerprint', () => {
  const motif = Array.from({ length: 8 }, (_, index) => frame([0, 2, 5, 7][index % 4], index % 2 ? 0.05 : 0.2, index % 3 * 8))
  const input = series(Array.from({ length: 16 }, () => motif).flat())
  const perturbed = input.map(item => ({ ...item, rms: item.rms * (1 + 1e-7),
    chroma: item.chroma.map(value => value + 1e-8), mfcc: item.mfcc.map(value => value + 1e-7) }))
  compare(analyzeTemporalIdentity(input), analyzeTemporalIdentity(perturbed), 1e-5)
  const repeated = analyzeTemporalIdentity(series([...input, ...input]))
  const original = analyzeTemporalIdentity(input)
  assert.ok(Math.hypot(repeated.coordinate.x - original.coordinate.x, repeated.coordinate.y - original.coordinate.y) < 0.03)
})
