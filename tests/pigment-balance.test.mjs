import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MAX_PIGMENT_SHARE, MIN_PIGMENT_SHARE, PigmentBalance } from '../src/scene/liquid/PigmentBalance.ts'

const silence = { bass: 0, mid: 0, treble: 0, inputLevel: 0 }
const balanced = { bass: 1, mid: 1, treble: 1, inputLevel: 0.2, timbre: 0.5, onset: 0 }
const bass = { ...balanced, mid: 0, treble: 0 }
const mid = { ...balanced, bass: 0, treble: 0 }
const treble = { ...balanced, bass: 0, mid: 0 }

function run(balance, input, seconds, fps = 60, playing = true) {
  for (let frame = 0; frame < seconds * fps; frame++) balance.update(input, 1 / fps, playing)
  return [...balance.weights]
}

test('the baseline is balanced and elapsed silence cannot invent a composition', () => {
  const balance = new PigmentBalance()
  const initial = [...balance.weights]
  assert.deepEqual(initial, [1 / 3, 1 / 3, 1 / 3])
  assert.deepEqual(run(balance, silence, 10), initial)
  assert.deepEqual(run(balance, { ...bass, inputLevel: 0.0009 }, 10), initial)
  assert.deepEqual(run(balance, balanced, 3), initial)
})

test('each acoustic band can take the largest pool, without a permanent Main advantage', () => {
  for (const [role, input] of [bass, mid, treble].entries()) {
    const weights = run(new PigmentBalance(), input, 1)
    assert.ok(weights[role] > 0.45, weights.join(', '))
    assert.ok(weights[role] > Math.max(...weights.filter((_, index) => index !== role)) + 0.15)
  }
})

test('composition responds smoothly to a new passage at unchanged loudness', () => {
  const balance = new PigmentBalance()
  const before = run(balance, bass, 4)
  const returned = balance.update(treble, 1 / 60)
  assert.equal(returned, balance.weights)
  const first = [...returned]
  assert.ok(Math.abs(first[0] - before[0]) < 0.025)
  assert.ok(Math.abs(first[2] - before[2]) < 0.025)
  const after = run(balance, treble, 1)
  assert.ok(after[2] > before[2] + 0.15)
  assert.ok(after[0] < before[0] - 0.15)
})

test('stationary mastering bias adapts toward thirds instead of keeping a privileged pool', () => {
  const balance = new PigmentBalance()
  const peak = run(balance, bass, 1)
  const settled = run(balance, bass, 70)
  assert.ok(peak[0] > 0.45)
  for (const weight of settled) assert.ok(Math.abs(weight - 1 / 3) < 0.00001)
})

test('onset and timbre changes redistribute pigments at identical band levels', () => {
  const plain = run(new PigmentBalance(), balanced, 0.5)
  const bright = run(new PigmentBalance(), { ...balanced, timbre: 1 }, 0.5)
  const hit = run(new PigmentBalance(), { ...balanced, onset: 1 }, 0.5)
  assert.ok(bright[2] > plain[2] + 0.025)
  assert.ok(bright[0] < plain[0] - 0.025)
  assert.ok(hit[1] > plain[1] + 0.035)
})

test('pause and silence preserve weights and freeze the acoustic baselines', () => {
  const paused = new PigmentBalance(), reference = new PigmentBalance()
  const before = run(paused, bass, 1)
  run(reference, bass, 1)
  assert.deepEqual(run(paused, treble, 10, 60, false), before)
  assert.deepEqual(run(paused, silence, 10), before)
  assert.deepEqual(run(paused, treble, 1), run(reference, treble, 1))
})

test('the same captured passages produce the same allocation at different refresh rates', () => {
  const results = [30, 60, 120].map(fps => {
    const balance = new PigmentBalance()
    run(balance, bass, 2, fps)
    run(balance, { ...treble, timbre: 0.95, onset: 1 }, 0.5, fps)
    run(balance, mid, 1.5, fps)
    run(balance, silence, 1, fps)
    return run(balance, { ...balanced, timbre: 0.2 }, 1, fps)
  })
  for (const result of results.slice(1)) {
    result.forEach((weight, index) => assert.ok(Math.abs(weight - results[0][index]) < 1e-12))
  }
})

test('extreme and invalid measurements retain finite bounded shares with a total of one', () => {
  const balance = new PigmentBalance()
  const passages = [bass, treble, mid, { ...bass, timbre: 1, onset: 1 },
    { ...mid, timbre: 0, onset: 1 }, { ...treble, bass: Infinity, mid: NaN, onset: -1, timbre: NaN }]
  for (let repeat = 0; repeat < 10; repeat++) {
    for (const passage of passages) {
      for (let frame = 0; frame < 120; frame++) {
        const weights = balance.update(passage, 1 / 60)
        for (const weight of weights) {
          assert.ok(Number.isFinite(weight))
          assert.ok(weight >= MIN_PIGMENT_SHARE && weight <= MAX_PIGMENT_SHARE)
        }
        assert.ok(Math.abs(weights[0] + weights[1] + weights[2] - 1) < 1e-10)
      }
    }
  }
})

test('reset restores the balanced composition and its subsequent response', () => {
  const balance = new PigmentBalance()
  run(balance, bass, 3)
  assert.equal(balance.reset(), balance.weights)
  assert.deepEqual(balance.weights, [1 / 3, 1 / 3, 1 / 3])
  assert.deepEqual(run(balance, treble, 1), run(new PigmentBalance(), treble, 1))
})
