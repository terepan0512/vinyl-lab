import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { buildTrackModels, MODEL_VERSIONS } from '../src/audio/musicColorAnalysis.ts'
import { PALETTE_RELATIONSHIP_VERSION } from '../src/audio/paletteRelationships.ts'
import { refreshTrackModels } from '../src/audio/refreshTrackModels.ts'

function payload() {
  return { sourceId: 'freshness-track', featureBackend: 'librosa', extractorVersion: '0.11.0',
    parameters: {}, sampleRate: 22050, duration: 2, tempoBpm: 120,
    frames: Array.from({ length: 8 }, (_, i) => ({ time: i / 4, rms: 0.1,
      centroidHz: 1400 + i * 80, flatness: 0.01, onset: i % 2 ? 0 : 3,
      mfcc: Array.from({ length: 13 }, (_, n) => n ? 20 * Math.sin(n + i / 4) : 0),
      chroma: Array.from({ length: 12 }, (_, pitch) => pitch === i % 12 ? 1 : 0.01) })) }
}

function stale(track, model) {
  const previous = { ...track.models[model], modelRevision: 'old-rules+old-palette' }
  return { ...track, models: { ...track.models, [model]: previous },
    colors: track.colors.modelId === model ? previous : track.colors }
}

test('current models return the same analysis object without repeated recalculation', () => {
  const track = buildTrackModels(payload())
  assert.equal(refreshTrackModels(track), track)
})

test('stale selected C updates from stored features while keeping C selected', () => {
  const track = buildTrackModels(payload())
  const outdated = stale({ ...track, colors: track.models.C }, 'C')
  const updated = refreshTrackModels(outdated, 'C')
  assert.equal(updated.colors.modelId, 'C')
  assert.equal(updated.colors.model, MODEL_VERSIONS.C)
  assert.equal(updated.colors.modelRevision, `${MODEL_VERSIONS.C}+${PALETTE_RELATIONSHIP_VERSION}`)
  assert.equal(updated.colors, updated.models.C)
  assert.equal(updated.models.A, track.models.A)
  assert.equal(updated.features, track.features)
  assert.equal(updated.sourceId, track.sourceId)
  assert.equal(refreshTrackModels(updated, 'C'), updated)
})

test('a changed palette revision also invalidates the stored rule result', () => {
  const track = buildTrackModels(payload())
  const outdated = stale(track, 'A')
  outdated.models.A.modelRevision = `${MODEL_VERSIONS.A}+old-palette`
  const updated = refreshTrackModels(outdated)
  assert.notEqual(updated.models.A, outdated.models.A)
  assert.equal(updated.models.C, track.models.C)
  assert.equal(updated.colors, updated.models.A)
})

test('forced recalculation refreshes A/C and never invents an untrained B', () => {
  const track = buildTrackModels(payload())
  const updated = refreshTrackModels(track, 'A', true)
  assert.notEqual(updated.models.A, track.models.A)
  assert.notEqual(updated.models.C, track.models.C)
  assert.deepEqual(updated.models.A, track.models.A)
  assert.deepEqual(updated.models.C, track.models.C)
  assert.equal(updated.models.B, null)
})

test('refresh preserves the exact personalized prediction and does not mutate its input', () => {
  const artifact = JSON.parse(readFileSync(new URL('./fixtures/personal-model-parity.json', import.meta.url), 'utf8')).artifact
  const track = buildTrackModels(payload(), artifact)
  const selected = { ...track, colors: track.models.B }
  const outdated = stale(selected, 'A')
  const before = structuredClone(outdated)
  const updated = refreshTrackModels(outdated, 'B', true)
  assert.equal(updated.models.B, track.models.B)
  assert.equal(updated.colors, track.models.B)
  assert.equal(updated.colors.modelId, 'B')
  assert.deepEqual(outdated, before)
})

test('a palette migration recomposes B with the same trained artifact while preserving its Main prediction', () => {
  const artifact = JSON.parse(readFileSync(new URL('./fixtures/personal-model-parity.json', import.meta.url), 'utf8')).artifact
  const track = buildTrackModels(payload(), artifact)
  const oldB = { ...track.models.B, modelRevision: artifact.createdAt + '+palette-relations-v2',
    paletteRelationship: { ...track.models.B.paletteRelationship, version: 'palette-relations-v2' } }
  const outdated = { ...track, models: { ...track.models, B: oldB }, colors: oldB }
  const before = structuredClone(outdated)
  const updated = refreshTrackModels(outdated, 'B', false, artifact)
  assert.notEqual(updated.colors, oldB)
  assert.deepEqual(updated.colors.identity, oldB.identity)
  assert.deepEqual(updated.colors.learning, oldB.learning)
  assert.equal(updated.colors.paletteRelationship.version, PALETTE_RELATIONSHIP_VERSION)
  assert.deepEqual(outdated, before)
})
