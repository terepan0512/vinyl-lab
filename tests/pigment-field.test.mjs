import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PigmentField, pigmentPercentile, samplePigmentField } from '../src/scene/liquid/PigmentField.ts'

const silent = { flowX: 0, flowY: 0, swirl: 0, stretch: 0, bass: 0, mid: 0, treble: 0, onset: 0, timbre: 0 }
const phases = [0, 2, 8, 24, 60].map(phase => ({
  flowX: phase * 0.7, flowY: phase * 0.36, swirl: phase * 0.57, stretch: phase * 0.41,
  bass: 0.46, mid: 0.24, treble: 0.16, onset: 0.12, timbre: 0.68,
}))
const oldQuantiles = new Float32Array([0.30396, 0.35710, 0.43810, 0.52612, 0.60053, 0.67001, 0.72773, 1])

// A dense Cartesian grid is independent of the calibration's 384-point annular
// quadrature. Every accepted cell represents the same visible surface area.
function visibleFields(input) {
  const fields = []
  const size = 192
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = (x + 0.5) / size * 2 - 1
      const py = (y + 0.5) / size * 2 - 1
      const radius = Math.hypot(px, py)
      if (radius > 0.35 && radius < 0.976) fields.push(samplePigmentField(px, py, input))
    }
  }
  return fields
}

function pigmentAreas(fields, quantiles, weights) {
  const counts = [0, 0, 0]
  for (const value of fields) {
    const selection = pigmentPercentile(value, quantiles)
    counts[selection < weights[0] ? 0 : selection < weights[0] + weights[1] ? 1 : 2]++
  }
  return counts.map(count => count / fields.length)
}

test('initial pigment calibration is deterministic, ordered, and valid while paused', () => {
  const field = new PigmentField()
  const second = new PigmentField()
  assert.deepEqual(field.quantiles, second.quantiles)
  for (let i = 0; i < 8; i++) {
    assert.ok(field.quantiles[i] > (field.quantiles[i - 1] ?? 0))
  }
  assert.equal(field.quantiles[7], 1)
  assert.equal(pigmentPercentile(-1, field.quantiles), 0)
  assert.equal(pigmentPercentile(2, field.quantiles), 1)
  for (let i = 0; i < 7; i++) {
    assert.ok(Math.abs(pigmentPercentile(field.quantiles[i], field.quantiles) - (i + 1) / 8) < 1e-8)
  }
  const initial = field.quantiles.slice()
  assert.equal(field.update(phases[3], 1, false), field.quantiles)
  assert.deepEqual(field.quantiles, initial)
})

test('current-field calibration preserves balanced and contrasting pigment allocations across flow', () => {
  const field = new PigmentField()
  const allocations = [[1 / 3, 1 / 3, 1 / 3], [0.48, 0.3, 0.22], [0.22, 0.3, 0.48], [0.3, 0.48, 0.22]]
  for (const input of [silent, ...phases]) {
    field.reset(input)
    const fields = visibleFields(input)
    for (const weights of allocations) {
      const areas = pigmentAreas(fields, field.quantiles, weights)
      for (let i = 0; i < 3; i++) {
        assert.ok(Math.abs(areas[i] - weights[i]) < 0.035,
          `flow=${input.flowX}, weights=${weights}, areas=${areas}`)
      }
    }
  }
})

test('adaptive calibration removes the fixed distribution bias toward Main', () => {
  const input = phases.at(-1)
  const fields = visibleFields(input)
  const weights = [0.48, 0.3, 0.22]
  const oldAreas = pigmentAreas(fields, oldQuantiles, weights)
  const field = new PigmentField()
  const newAreas = pigmentAreas(fields, field.reset(input), weights)
  assert.ok(oldAreas[0] > 0.65, oldAreas.join(', '))
  assert.ok(Math.abs(newAreas[0] - weights[0]) < 0.025, newAreas.join(', '))
  assert.ok(Math.abs(newAreas[2] - weights[2]) < 0.025, newAreas.join(', '))
})

test('calibration runs at most ten times per second and never advances in silence', () => {
  const field = new PigmentField()
  const initial = field.quantiles.slice()
  for (let i = 0; i < 5; i++) field.update(phases[2], 1 / 60, true)
  assert.deepEqual(field.quantiles, initial)
  field.update(phases[2], 1 / 60, true)
  assert.notDeepEqual(field.quantiles, initial)
  const calibrated = field.quantiles.slice()
  for (let i = 0; i < 600; i++) field.update(phases[2], 1 / 60, true)
  assert.deepEqual(field.quantiles, calibrated)
  for (let i = 0; i < 600; i++) field.update(phases[4], 1 / 60, false)
  assert.deepEqual(field.quantiles, calibrated)
  field.update(phases[4], Number.NaN, true)
  assert.deepEqual(field.quantiles, calibrated)
  field.reset()
  assert.deepEqual(field.quantiles, initial)
  let calibrations = 0
  let before = field.quantiles.slice()
  const moving = { ...phases[1] }
  for (let i = 0; i < 120; i++) {
    moving.flowX += 0.02
    field.update(moving, 1 / 60, true)
    if (field.quantiles.some((value, index) => value !== before[index])) calibrations++
    before = field.quantiles.slice()
  }
  assert.equal(calibrations, 20)
})
