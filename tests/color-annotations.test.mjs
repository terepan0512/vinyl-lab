import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { isColorAnnotation, parseAnnotations, mergeAnnotations } from '../src/audio/colorAnnotations.ts'

const features = JSON.parse(readFileSync(new URL('./fixtures/personal-model-parity.json', import.meta.url), 'utf8')).cases[0].features
const label = { sourceId: 'one-work', scope: 'identity', time: null, labelHex: '#284c87',
  prediction: { l: 0.5, a: 0, b: 0 }, features, model: 'rule-based-v3', createdAt: '2026-10-18T12:00:00Z' }

test('legacy annotations remain importable and new labels reject incompatible training input', () => {
  assert.deepEqual(parseAnnotations({ schema: 'music-color-labels-v1', annotations: [label] }), [label])
  for (const patch of [{ groupId: '  ' }, { extractorVersion: '0.9.0' }, { createdAt: '2026-10-18T12:00:00' },
    { scope: 'time', time: Infinity }, { features: { ...features, mfcc: [] } }]) {
    assert.equal(isColorAnnotation({ ...label, ...patch }), false)
    assert.throws(() => parseAnnotations([{ ...label, ...patch }]), /Invalid label file/)
  }
})

test('importing an older export cannot overwrite a newer color choice or lose its model revision', () => {
  const revised = { ...label, labelHex: '#aa4f75', model: 'personal-ridge-v1', modelRevision: '2026-10-18T13:00:00Z',
    groupId: 'same-composition', createdAt: '2026-10-18T14:00:00Z' }
  const merged = mergeAnnotations([revised], [label])
  assert.deepEqual(merged, [revised])
  assert.equal(mergeAnnotations(merged, [revised]).length, 1)
})
