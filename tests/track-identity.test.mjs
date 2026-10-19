import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { colorDistance, hexToLab, labToHex, lchColor } from '../src/audio/colorSpace.ts'
import { buildTrackModels, featureColor } from '../src/audio/musicColorAnalysis.ts'
import { explainTrackIdentity } from '../src/audio/trackIdentity.ts'

// Measured synthetic WAV features from one fixed production chain, used as
// development regressions. They do not validate subjective music colors.
const fixture = JSON.parse(readFileSync(new URL('./fixtures/source-controls.json', import.meta.url), 'utf8'))
const controls = new Map(fixture.controls.map(control => [control.id, control]))
const analyzed = new Map(fixture.controls.map(control => [control.id, buildTrackModels(control.features)]))
const chromaticDistance = (left, right) => Math.hypot(left.a - right.a, left.b - right.b)
const displayed = color => hexToLab(labToHex(color))
const hue = color => Math.atan2(color.b, color.a) * 180 / Math.PI
const hueDistance = (left, right) => Math.abs(((hue(left) - hue(right) + 540) % 360) - 180)
const stationary = (changes = {}) => Array.from({ length: 48 }, (_, index) => ({
  time: index / 4, rms: 0.1, centroidHz: 1200, flatness: 0.01, onset: 0,
  mfcc: [-100, ...Array(12).fill(0)], chroma: Array(12).fill(1 / 12), ...changes,
}))

test('the measured reorder controls have similar global means despite different note transitions', () => {
  const patterns = new Map(fixture.provenance.patterns.map(pattern => [pattern.id, pattern]))
  const ascending = patterns.get('ascending'), leaping = patterns.get('leaping')
  const multiset = pattern => pattern.melodyMidi.map((note, index) => [note, pattern.noteSeconds[index]])
    .sort((left, right) => left[0] - right[0] || left[1] - right[1])
  assert.deepEqual(multiset(ascending), multiset(leaping))
  assert.notDeepEqual(ascending.melodyMidi, leaping.melodyMidi)
  for (const pair of fixture.pairs.sequence) {
    const a = analyzed.get(pair.first).models.A.summary, b = analyzed.get(pair.second).models.A.summary
    assert.ok(a.chroma.reduce((sum, value, index) => sum + Math.abs(value - b.chroma[index]), 0) < 0.025)
    assert.ok(Math.max(...a.mfcc.slice(1).map((value, index) => Math.abs(value - b.mfcc[index + 1]))) < 1)
    assert.ok(Math.abs(a.centroidHz - b.centroidHz) / a.centroidHz < 0.01)
    assert.ok(colorDistance(featureColor(a), featureColor(b)) < 0.005,
      'a mean-only rule should expose why these sequence controls previously collapsed')
  }
})

test('actual same-note-multiset reorder controls retain useful displayed identity differences', () => {
  // A declared regression floor, not a universal perceptual threshold. Merely
  // changing one RGB channel does not satisfy this controlled sequence check.
  const failures = []
  for (const pair of fixture.pairs.sequence) for (const id of ['A', 'C']) {
    const a = analyzed.get(pair.first).models[id].identity, b = analyzed.get(pair.second).models[id].identity
    const distance = colorDistance(displayed(a), displayed(b))
    if (distance < 0.02) failures.push(`${id}: ${pair.first} / ${pair.second}: ${distance.toFixed(6)}`)
  }
  assert.deepEqual(failures, [], failures.join('\n'))
})

test('same-production harmony and rhythm changes survive the global identity mapping', () => {
  const failures = []
  for (const pair of fixture.pairs.differentComposition) for (const id of ['A', 'C']) {
    const a = analyzed.get(pair.first).models[id].identity, b = analyzed.get(pair.second).models[id].identity
    const distance = colorDistance(displayed(a), displayed(b))
    if (distance < 0.02) failures.push(`${id}: ${pair.first} / ${pair.second}: ${distance.toFixed(6)}`)
  }
  assert.deepEqual(failures, [], failures.join('\n'))
})

test('gain controls preserve chromatic identity while allowing the explicit loudness lightness rule', () => {
  for (const pair of fixture.pairs.sameComposition.filter(pair => pair.second.endsWith('gain-minus-12db'))) {
    for (const id of ['A', 'C']) {
      const a = analyzed.get(pair.first).models[id].identity, b = analyzed.get(pair.second).models[id].identity
      assert.ok(chromaticDistance(a, b) < 0.005, `${id}: ${pair.first}`)
      assert.ok(hueDistance(a, b) < 2, `${id}: ${pair.first}`)
      assert.ok(b.l < a.l, 'quieter audio may remain visually darker under the declared mapping')
    }
  }
})

test('the fixed low-pass mastering controls do not cause arbitrary hue rotations', () => {
  for (const pair of fixture.pairs.sameComposition.filter(pair => pair.second.endsWith('static-lowpass'))) {
    for (const id of ['A', 'C']) {
      const a = analyzed.get(pair.first).models[id].identity, b = analyzed.get(pair.second).models[id].identity
      assert.ok(hueDistance(a, b) < 15, `${id}: ${pair.first}`)
      assert.ok(chromaticDistance(a, b) < 0.025, `${id}: ${pair.first}`)
    }
  }
})

test('file identity, names, source labels, and upload order cannot choose a core color', () => {
  const ids = ['ascending--original', 'syncopated-minor--original', 'descending-minor--static-lowpass']
  for (const id of [...ids].reverse()) {
    const original = controls.get(id).features
    const renamed = { ...structuredClone(original), sourceId: 'f'.repeat(64),
      filename: 'different-download-source.mp3', title: 'Renamed file', source: 'another source' }
    const actual = buildTrackModels(renamed)
    for (const model of ['A', 'C']) {
      assert.deepEqual(actual.models[model], analyzed.get(id).models[model])
    }
  }
})

test('silence bypasses even contradictory pitched or rhythmic frame metadata', () => {
  const base = { l: 0.32, a: 0, b: 0 }
  const frames = stationary({ rms: 0 }).map((frame, index) => ({ ...frame, onset: index % 2 * 10,
    mfcc: frame.mfcc.map((value, coefficient) => value + coefficient * index),
    chroma: Array.from({ length: 12 }, (_, pitch) => pitch === index % 12 ? 1 : 0) }))
  assert.deepEqual(explainTrackIdentity(base, frames).color, base)
})

test('a uniform stationary chroma floor cannot invent a saturated harmonic or sequence identity', () => {
  const base = { l: 0.6, a: 0, b: 0 }
  for (const chroma of [Array(12).fill(0), Array(12).fill(1 / 12), Array(12).fill(2)]) {
    const result = explainTrackIdentity(base, stationary({ chroma }))
    assert.deepEqual(result.color, base)
    assert.equal(result.context.harmonicWeight, 0)
    assert.equal(result.context.harmonic.direction, null)
    assert.equal(result.context.hueRotation, 0)
    assert.equal(result.context.chromaFactor, 1)
  }
})

test('supported harmonic hues stay chromatic when the static timbre points the opposite way', () => {
  // Test all twelve explicit pitch-class anchors rather than four particular
  // recordings. Conflicting acoustic channels should not all become gray.
  for (let pitch = 0; pitch < 12; pitch++) {
    const angle = ((pitch * 7) % 12) * 30 + 265
    const base = lchColor(0.65, 0.12, angle + 180)
    const chroma = Array.from({ length: 12 }, (_, index) => index === pitch ? 1 : 0)
    const result = explainTrackIdentity(base, stationary({ chroma }))
    assert.ok(Math.hypot(result.color.a, result.color.b) > 0.15)
    assert.ok(hueDistance(result.color, lchColor(0.65, 0.15, angle)) < 2)
    assert.ok(Math.hypot(displayed(result.color).a, displayed(result.color).b) > 0.10)
  }
})

test('a tiny pitch-profile perturbation cannot produce a discontinuous vivid hue jump', () => {
  const base = lchColor(0.65, 0.10, 45)
  const chroma = Array.from({ length: 12 }, (_, pitch) => pitch === 2 ? 1 : 0.05)
  const before = explainTrackIdentity(base, stationary({ chroma })).color
  for (const epsilon of [1e-4, 1e-6, 1e-8]) {
    const after = explainTrackIdentity(base, stationary({ chroma: chroma.map((value, index) =>
      value + (index % 2 ? -epsilon : epsilon)) })).color
    assert.ok(colorDistance(before, after) < epsilon * 10)
  }
})

test('a nearly flat noise spectrum cannot turn residual pitch bins into a vivid harmonic identity', () => {
  const base = { l: 0.65, a: 0, b: 0 }
  const chroma = Array.from({ length: 12 }, (_, pitch) => pitch === 4 ? 1 : 0.02)
  let previous = Infinity
  for (const flatness of [0.5, 0.9, 0.99, 0.9999, 1]) {
    const result = explainTrackIdentity(base, stationary({ chroma, flatness }))
    const distance = colorDistance(result.color, base)
    assert.ok(distance < previous)
    assert.ok(distance <= (1 - flatness) * 0.2)
    previous = distance
  }
})

test('arbitrarily small departures from uniform chroma contribute arbitrarily small color changes', () => {
  const base = { l: 0.6, a: 0, b: 0 }
  for (const epsilon of [0.01, 0.0001, 0.000001, 0.00000001]) {
    for (const pitch of [0, 3, 6, 9]) {
      const chroma = Array.from({ length: 12 }, (_, index) => 1 / 12 + (index === pitch ? epsilon : 0))
      const result = explainTrackIdentity(base, stationary({ chroma }))
      assert.ok(colorDistance(result.color, base) < epsilon * 2,
        `an excess of ${epsilon} at pitch ${pitch} must not be normalized to a vivid color`)
      assert.ok(Object.values(result.color).every(Number.isFinite))
    }
  }
})
