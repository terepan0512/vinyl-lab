import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { explainFeatureColor, featureColor, buildTrackModels } from '../src/audio/musicColorAnalysis.ts'
import { projectTimbre } from '../src/audio/timbreProjection.ts'
import { colorDistance, hexToLab, labToHex } from '../src/audio/colorSpace.ts'

const read = name => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'))
const reference = JSON.parse(readFileSync(new URL('../src/audio/timbreReference.json', import.meta.url), 'utf8'))
const calibration = read('timbre-reference-profiles.json')
const holdout = read('timbre-holdout.json')
const measured = read('color-profiles.json').profiles
const displayed = color => hexToLab(labToHex(color))
const neutral = { time: 0, rms: 0.1, centroidHz: 1200, flatness: 0.001,
  onset: 0, mfcc: [-100, ...reference.mean], chroma: Array(12).fill(1 / 12) }

test('frozen reference is versioned and balanced independently of uploaded tracks and held-out profiles', () => {
  assert.equal(reference.version, calibration.referenceVersion)
  assert.equal(reference.reference.count, 96)
  assert.equal(calibration.profiles.length, 96)
  assert.equal(reference.extractor.excludedCoefficient, 0)
  for (const family of reference.reference.families) {
    assert.equal(calibration.profiles.filter(row => row.name.startsWith(family + '/')).length, 24)
  }
  const coordinates = calibration.profiles.map(row => projectTimbre([0, ...row.mfcc]).coordinates)
  for (let axis = 0; axis < 2; axis++) {
    const mean = coordinates.reduce((sum, point) => sum + point[axis], 0) / coordinates.length
    const variance = coordinates.reduce((sum, point) => sum + (point[axis] - mean) ** 2, 0) / (coordinates.length - 1)
    assert.ok(Math.abs(mean) < 1e-10)
    assert.ok(Math.abs(variance - 1) < 1e-10)
  }
})

test('reference-center timbre remains neutral and small perturbations cannot invent saturated hues', () => {
  const center = featureColor(neutral)
  assert.ok(Math.hypot(center.a, center.b) < 1e-12)
  for (let coefficient = 1; coefficient <= 12; coefficient++) {
    for (const direction of [-1, 1]) {
      const nearby = structuredClone(neutral)
      nearby.mfcc[coefficient] += direction * 0.0001
      assert.ok(colorDistance(center, featureColor(nearby)) < 0.00001)
    }
  }
  const changedGain = { ...neutral, mfcc: [10000, ...reference.mean] }
  assert.deepEqual(projectTimbre(changedGain.mfcc), projectTimbre(neutral.mfcc))
})

test('higher timbre coefficients contribute while recording gain never rotates the measured core color', () => {
  const shape = structuredClone(neutral)
  shape.mfcc[11] += 40
  assert.ok(colorDistance(featureColor(neutral), featureColor(shape)) > 0.02)
  const bass = featureColor(measured[0].feature)
  const gain = featureColor(measured.find(row => row.name.includes('gain control')).feature)
  assert.ok(Math.hypot(bass.a - gain.a, bass.b - gain.b) < 0.001)
  for (const row of holdout.profiles) {
    const result = explainFeatureColor(row.feature)
    assert.ok(result.mapping.harmonyWeight <= 0.25)
    assert.equal(result.mapping.timbreReference, reference.version)
    assert.ok(Object.values(result.color).every(Number.isFinite))
  }
})

test('independent same-pitch spectral-shape control retains distinctions previously compressed by the rules', () => {
  const left = holdout.profiles.find(row => row.name === 'harmonic 440Hz slope0.5')
  const right = holdout.profiles.find(row => row.name === 'harmonic 440Hz slope3.0')
  assert.ok(left && right)
  const previous = colorDistance(displayed(left.legacyIdentity), displayed(right.legacyIdentity))
  const revised = colorDistance(displayed(featureColor(left.feature)), displayed(featureColor(right.feature)))
  assert.ok(previous < 0.025, 'the holdout control must reproduce the earlier collapse')
  assert.ok(revised > 0.055 && revised > previous * 2)
  // Other synthetic extremes retain broad separation as well; color diversity
  // alone is insufficient if clear acoustic distinctions disappear elsewhere.
  const low = holdout.profiles.find(row => row.name === 'noise center80 width0.5')
  const high = holdout.profiles.find(row => row.name === 'noise center5120 width0.5')
  assert.ok(low && high)
  assert.ok(colorDistance(displayed(featureColor(low.feature)), displayed(featureColor(high.feature))) > 0.1)
})

test('held-out piano/pad and bass/percussion no longer share the old near-neighbor cores', () => {
  const colors = measured.slice(0, 6).map(row => displayed(featureColor(row.feature)))
  assert.ok(colorDistance(colors[1], colors[5]) > 0.12)
  assert.ok(colorDistance(colors[0], colors[4]) > 0.10)
})

test('a track identity is independent of the other uploads and keeps deterministic model revisions', () => {
  const payload = row => ({ featureBackend: 'librosa', extractorVersion: '0.11.0', parameters: {},
    sourceId: row.name, sampleRate: 22050, duration: 2, tempoBpm: null,
    frames: Array.from({ length: 8 }, (_, index) => ({ ...row.feature, time: index / 4 })) })
  const input = payload(holdout.profiles[0])
  const first = buildTrackModels(input)
  buildTrackModels(payload(holdout.profiles.at(-1)))
  const repeated = buildTrackModels(structuredClone(input))
  assert.deepEqual(repeated, first)
  assert.equal(first.models.A.model, 'rule-based-v7')
  assert.equal(first.models.C.model, 'fusion-v3')
  assert.equal(first.models.B, null)
})
