import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Color } from 'three'
import { buildMusicColors, buildTrackModels, featureColor, sampleColorTrajectory } from '../src/audio/musicColorAnalysis.ts'
import { colorDistance, hexToLab, labToHex, labToLinearRgb, lchColor, mixLab } from '../src/audio/colorSpace.ts'
import { applyTrajectoryPalette } from '../src/scene/liquid/palette.ts'
import { measurePaletteSeparation, measurePaletteSurfaceSeparation } from '../src/audio/paletteRelationships.ts'
import { readFileSync } from 'node:fs'

// Synthetic measured-feature fixtures for testing the rules, not demonstration audio results.
function feature(time, bright = false) {
  const chroma = Array(12).fill(0)
  chroma[bright ? 2 : 9] = 0.8
  chroma[bright ? 6 : 4] = 0.2
  return { time, rms: bright ? 0.35 : 0.08, centroidHz: bright ? 3500 : 250, flatness: bright ? 0.35 : 0.02,
    onset: time % 0.5 === 0 ? 3 : 0, mfcc: Array.from({ length: 13 }, (_, i) => (bright ? -1 : 1) * (100 - i * 5)), chroma }
}
function payload() {
  return { sourceId: 'a'.repeat(64), featureBackend: 'librosa', extractorVersion: '0.11.0',
    parameters: { sampleRate: 22050 }, sampleRate: 22050, duration: 20, tempoBpm: 120,
    frames: Array.from({ length: 80 }, (_, i) => feature(i / 4, i >= 40)) }
}

test('all three color layers are computed upfront and repeat deterministically', () => {
  const input = payload()
  const analysis = buildMusicColors(input)
  assert.deepEqual(analysis, buildMusicColors(structuredClone(input)))
  assert.equal(analysis.featureBackend, 'librosa')
  assert.equal(analysis.emotion.status, 'not-estimated')
  assert.equal(analysis.trajectory[0].time, 0)
  assert.equal(analysis.trajectory.at(-1).time, 20)
  assert.equal(analysis.sections[0].start, 0)
  assert.equal(analysis.sections.at(-1).end, 20)
})

test('timbre/harmony change yields a detected section and a changing anchored path', () => {
  const analysis = buildMusicColors(payload())
  assert.ok(analysis.sections.some(section => Math.abs(section.start - 10) <= 1))
  assert.ok(colorDistance(sampleColorTrajectory(analysis, 3).palette[0], sampleColorTrajectory(analysis, 17).palette[0]) > 0.025)
  assert.ok(analysis.sections.every(section => section.palette.length >= 1 && section.palette.length <= 5))
  const identity = structuredClone(analysis.identity)
  sampleColorTrajectory(analysis, 15)
  sampleColorTrajectory(analysis, 0)
  assert.deepEqual(analysis.identity, identity)
})

test('seeking and replaying a timestamp return exactly the same color', () => {
  const analysis = buildMusicColors(payload())
  const expected = sampleColorTrajectory(analysis, 10.13)
  for (const time of [0, 19, 2, 12]) sampleColorTrajectory(analysis, time)
  assert.deepEqual(sampleColorTrajectory(analysis, 10.13), expected)
  assert.deepEqual(sampleColorTrajectory(analysis, -5), sampleColorTrajectory(analysis, 0))
  assert.deepEqual(sampleColorTrajectory(analysis, 100), sampleColorTrajectory(analysis, 20))
})

test('color trajectory is bounded and continuous at frame and section boundaries', () => {
  const analysis = buildMusicColors(payload())
  for (let time = 0.01; time < 20; time += 0.01) {
    assert.ok(colorDistance(sampleColorTrajectory(analysis, time).palette[0], sampleColorTrajectory(analysis, time - 0.01).palette[0]) < 0.01)
  }
  for (const point of analysis.trajectory) for (const color of point.palette) {
    assert.ok(labToLinearRgb(color).every(value => Number.isFinite(value) && value >= 0 && value <= 1))
  }
})

test('silence is neutral and has no fabricated emotion or tempo', () => {
  const input = payload()
  input.tempoBpm = null
  input.frames = input.frames.map(frame => ({ ...frame, rms: 0, centroidHz: 0, flatness: 0, onset: 0, mfcc: Array(13).fill(0), chroma: Array(12).fill(0) }))
  const analysis = buildMusicColors(input)
  assert.equal(analysis.identity.a, 0)
  assert.equal(analysis.identity.b, 0)
  assert.equal(analysis.summary.tempoBpm, null)
  assert.equal(analysis.sections.length, 1)
})

test('timbre and loudness each affect the explicit mapping', () => {
  const base = feature(0)
  const original = featureColor(base), brighter = featureColor({ ...base, centroidHz: 4000 })
  assert.ok(brighter.l > original.l)
  assert.equal(brighter.a, original.a)
  assert.equal(brighter.b, original.b)
  assert.ok(featureColor({ ...base, rms: 0.5 }).l > featureColor(base).l)
  assert.ok(colorDistance(featureColor(base), featureColor({ ...base, mfcc: base.mfcc.map(value => -value) })) > 0.01)
})

test('similar spectral brightness with different harmonies has different core hues', () => {
  const base = { ...feature(0), centroidHz: 2200, flatness: 0.01 }
  const note = pitchClass => ({ ...base, chroma: Array.from({ length: 12 }, (_, i) => i === pitchClass ? 1 : 0) })
  const left = featureColor(note(0)), right = featureColor(note(6))
  assert.ok(Math.hypot(left.a - right.a, left.b - right.b) > 0.1)
})

test('global identity preserves sustained quiet sections instead of RMS-squared dominance', () => {
  const input = payload()
  input.frames = input.frames.map((frame, i) => ({ ...frame, rms: i < 40 ? 0.4 : 0.02 }))
  const analysis = buildMusicColors(input)
  assert.ok(Math.abs(analysis.summary.chroma[9] - 0.4) < 1e-12)
  assert.ok(Math.abs(analysis.summary.chroma[2] - 0.4) < 1e-12)
  assert.equal(analysis.model, 'rule-based-v7')
})

test('measured calibration timbres no longer converge on the old yellow sector', () => {
  const measured = JSON.parse(readFileSync(new URL('./fixtures/color-profiles.json', import.meta.url), 'utf8')).profiles
  const profiles = measured.filter(profile => !profile.name.includes('gain control'))
  const colors = profiles.map(profile => featureColor(profile.feature))
  const hues = colors.map(color => (Math.atan2(color.b, color.a) * 180 / Math.PI + 360) % 360)
  assert.ok(hues.filter(hue => hue >= 65 && hue <= 115).length < profiles.length / 2)
  const harmonic = profiles.find(profile => profile.name.includes('bright sustained'))
  const bell = profiles.find(profile => profile.name.includes('bell'))
  const difference = colorDistance(featureColor(harmonic.feature), featureColor(bell.feature))
  assert.ok(difference > 0.08, 'similarly bright bell and harmonic chord must remain distinguishable')
  const bass = featureColor(measured[0].feature)
  const gainControl = featureColor(measured.find(profile => profile.name.includes('gain control')).feature)
  assert.ok(Math.hypot(bass.a - gainControl.a, bass.b - gainControl.b) < 0.001, 'gain alone must not change the hue')
})

test('diffuse/noisy chroma leaves hue to timbre and remains finite', () => {
  const base = feature(0)
  for (const chroma of [Array(12).fill(0), Array(12).fill(1 / 12)]) {
    const color = featureColor({ ...base, chroma, flatness: 0.2 })
    assert.ok(Object.values(color).every(Number.isFinite))
  }
})

test('Oklab conversion round-trips sRGB and interpolates close hues without a color-wheel jump', () => {
  for (const hex of ['#000000', '#ffffff', '#ff0000', '#397ac2', '#808080']) assert.equal(labToHex(hexToLab(hex)), hex)
  const left = lchColor(0.6, 0.1, 359), right = lchColor(0.6, 0.1, 1)
  assert.ok(colorDistance(left, mixLab(left, right, 0.5)) < 0.002)
})

test('renderer colors correspond to the stored trajectory sample', () => {
  const colors = [new Color(), new Color(), new Color()]
  const sample = sampleColorTrajectory(buildMusicColors(payload()), 12.2)
  applyTrajectoryPalette(colors, sample.palette)
  assert.deepEqual(colors.map(color => '#' + color.getHexString()), sample.palette.map(labToHex))
})


test('high flatness cannot collapse varied timbres into a teal attractor', () => {
  const hues = []
  for (let degree = 0; degree < 360; degree += 10) {
    const mfcc = Array(13).fill(0)
    mfcc[2] = Math.cos(degree * Math.PI / 180) * 100
    mfcc[3] = Math.sin(degree * Math.PI / 180) * 100
    const base = { ...feature(0), mfcc, chroma: Array(12).fill(1 / 12) }
    const dry = featureColor({ ...base, flatness: 0.00001 })
    const noisy = featureColor({ ...base, flatness: 0.2 })
    assert.ok(Math.abs(Math.atan2(dry.b, dry.a) - Math.atan2(noisy.b, noisy.a)) < 1e-12)
    hues.push((Math.atan2(noisy.b, noisy.a) * 180 / Math.PI + 360) % 360)
  }
  assert.ok(hues.filter(hue => hue >= 160 && hue <= 220).length < hues.length / 3)
})

test('model comparison has three roles per available model without inventing B predictions', () => {
  const track = buildTrackModels(payload())
  assert.equal(track.algorithm, 'music-color-models-v2')
  assert.equal(track.models.B, null)
  assert.equal(track.colors, track.models.A)
  for (const id of ['A', 'C']) {
    const model = track.models[id]
    assert.equal(model.modelId, id)
    assert.equal(model.identityPalette.length, 3)
    assert.deepEqual(model.identityPalette[0], model.identity)
    assert.ok(model.trajectory.every(point => point.palette.length === 3))
    assert.deepEqual(model, buildTrackModels(payload()).models[id])
  }
  assert.ok(colorDistance(track.models.A.identity, track.models.C.identity) > 0.01)
})

test('identity-only personalized B stays constant instead of fabricating a learned trajectory', () => {
  const artifact = JSON.parse(readFileSync(new URL('./fixtures/personal-model-parity.json', import.meta.url), 'utf8')).artifact
  const track = buildTrackModels(payload(), artifact)
  const b = track.models.B
  assert.equal(b.model, 'personal-ridge-v1')
  assert.equal(b.learning.identity, 'learned')
  assert.equal(b.learning.trajectory, 'constant')
  assert.equal(b.identityMapping, null)
  assert.ok(b.trajectory.every(point => colorDistance(point.palette[0], b.identity) < 1e-12))
})

test('time-only B derives identity from its own predictions and model revisions separate retrains', () => {
  const artifact = JSON.parse(readFileSync(new URL('./fixtures/personal-model-parity.json', import.meta.url), 'utf8')).artifact
  const timeOnly = structuredClone(artifact)
  timeOnly.scopes = { time: timeOnly.scopes.identity }
  timeOnly.createdAt = '2026-10-18T23:00:00Z'
  const b = buildMusicColors(payload(), undefined, { model: 'B', personalModel: timeOnly })
  assert.equal(b.learning.identity, 'time-average')
  assert.equal(b.learning.trajectory, 'learned')
  assert.equal(b.modelRevision, timeOnly.createdAt + '+palette-relations-v4')
  assert.ok(measurePaletteSeparation(b.identityPalette) >= b.paletteRelationship.minimumDistance)
  const incompatible = { ...timeOnly, extractorVersion: '0.10.0' }
  assert.throws(() => buildMusicColors(payload(), undefined, { model: 'B', personalModel: incompatible }), /incompatible feature version/)
  assert.equal(buildTrackModels(payload(), incompatible).models.B, null)
})


test('all models retain their core predictor and compose three distinct displayed pigments', () => {
  const input = payload()
  const artifact = JSON.parse(readFileSync(new URL('./fixtures/personal-model-parity.json', import.meta.url), 'utf8')).artifact
  const track = buildTrackModels(input, artifact)
  for (const id of ['A', 'B', 'C']) {
    const analysis = track.models[id]
    assert.equal(analysis.paletteRelationship.version, 'palette-relations-v4')
    assert.ok(analysis.modelRevision.endsWith('+palette-relations-v4'))
    assert.deepEqual(analysis.identityPalette[0], analysis.identity)
    assert.equal(new Set(analysis.identityPalette.map(labToHex)).size, 3)
    assert.ok(measurePaletteSeparation(analysis.identityPalette) >= analysis.paletteRelationship.minimumDistance)
    assert.ok(measurePaletteSurfaceSeparation(analysis.identityPalette) >= analysis.paletteRelationship.minimumSurfaceDistance)
    for (let time = 0; time <= input.duration; time += 0.13) {
      const sample = sampleColorTrajectory(analysis, time)
      assert.ok(measurePaletteSeparation(sample.palette) >= analysis.paletteRelationship.minimumDistance - 1e-12,
        `separation collapsed for ${id} at ${time}`)
      assert.ok(measurePaletteSurfaceSeparation(sample.palette) >= analysis.paletteRelationship.minimumSurfaceDistance - 1e-12,
        `default resin separation collapsed for ${id} at ${time}`)
    }
  }
})

test('color relationship stays fixed across playback, with bounded shared changes instead of hue cycling', () => {
  const analysis = buildMusicColors(payload())
  const plan = structuredClone(analysis.paletteRelationship)
  const identityHue = Math.atan2(analysis.identity.b, analysis.identity.a) * 180 / Math.PI
  for (let time = 0; time < analysis.duration; time += 0.07) {
    const sample = sampleColorTrajectory(analysis, time)
    const main = sample.palette[0]
    const hue = Math.atan2(main.b, main.a) * 180 / Math.PI
    assert.ok(Math.abs(((hue - identityHue + 540) % 360) - 180) <= 8.00001)
    assert.ok(Math.abs(main.l - analysis.identity.l) <= 0.045001)
    for (let role = 1; role < 3; role++) {
      for (const channel of ['l', 'a', 'b']) {
        assert.ok(Math.abs((sample.palette[role][channel] - main[channel])
          - (analysis.identityPalette[role][channel] - analysis.identity[channel])) < 1e-12)
      }
    }
  }
  assert.deepEqual(analysis.paletteRelationship, plan)
})
