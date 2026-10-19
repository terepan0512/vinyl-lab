import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { isPersonalColorModel, personalFeatureVector, predictPersonalColor, trainPersonalColorModel } from '../src/audio/personalColorModel.ts'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/personal-model-parity.json', import.meta.url), 'utf8'))

test('Python-trained ridge model and TypeScript predictor have matching transforms and predictions', () => {
  assert.equal(isPersonalColorModel(fixture.artifact), true)
  for (const example of fixture.cases) {
    const vector = personalFeatureVector(example.features)
    vector.forEach((value, index) => assert.ok(Math.abs(value - example.vector[index]) < 1e-12))
    const color = predictPersonalColor(example.features, fixture.artifact, 'identity')
    for (const channel of ['l', 'a', 'b']) assert.ok(Math.abs(color[channel] - example.prediction[channel]) < 1e-12)
    assert.equal(predictPersonalColor(example.features, fixture.artifact, 'time'), null)
  }
})

test('personal model persistence rejects incompatible and corrupt models', () => {
  for (const mutate of [model => { model.featureVersion = 'wrong' }, model => { model.extractorVersion = '0.9.0' },
    model => { model.scopes.identity.featureScale[0] = 0 }, model => { model.scopes.identity.coefficients[0][1] = NaN },
    model => { model.scopes.identity.metrics.nGroups = 1 }, model => { model.status = 'trained' },
    model => { delete model.unavailableScopes.time }]) {
    const model = structuredClone(fixture.artifact)
    mutate(model)
    assert.equal(isPersonalColorModel(model), false)
  }
  assert.equal(isPersonalColorModel(null), false)
  assert.equal(isPersonalColorModel({}), false)
})

test('prediction requires valid features, excludes MFCC0 and keeps no fake scope fallback', () => {
  const frame = fixture.cases[0].features
  const expected = predictPersonalColor(frame, fixture.artifact, 'identity')
  assert.deepEqual(predictPersonalColor({ ...frame, time: 200, mfcc: [10000, ...frame.mfcc.slice(1)] }, fixture.artifact, 'identity'), expected)
  assert.equal(predictPersonalColor({ ...frame, rms: Infinity }, fixture.artifact, 'identity'), null)
  assert.equal(predictPersonalColor({ ...frame, mfcc: [] }, fixture.artifact, 'identity'), null)
})

test('training reports backend validation errors instead of returning an invented model', async () => {
  const savedFetch = globalThis.fetch
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Invalid training labels' }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    await assert.rejects(trainPersonalColorModel([]), /Invalid training labels/)
    globalThis.fetch = async () => new Response(JSON.stringify({ scopes: {} }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    await assert.rejects(trainPersonalColorModel([]), /model format or feature version is incompatible/)
  } finally { globalThis.fetch = savedFetch }
})
