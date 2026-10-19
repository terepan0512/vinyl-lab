import assert from 'node:assert/strict'
import { test } from 'node:test'
import { RenderBudget } from '../src/scene/renderBudget.ts'

const frames = (budget, fps, seconds, suspended = false) => {
  const changes = []
  for (let i = 0; i < fps * seconds; i++) {
    const change = budget.sample(1 / fps, suspended)
    if (change !== null) changes.push(change)
  }
  return changes
}

test('render resolution drops under sustained pressure while staying within bounds', () => {
  const budget = new RenderBudget(2)
  assert.equal(budget.pixelRatio, 1.5)
  const changes = frames(budget, 24, 20)
  assert.deepEqual(changes, [1.25, 1, 0.75])
  assert.equal(budget.pixelRatio, 0.75)
})

test('resolution recovers slowly with headroom and never exceeds the device limit', () => {
  const budget = new RenderBudget(1)
  frames(budget, 24, 8)
  assert.equal(budget.pixelRatio, 0.75)
  assert.deepEqual(frames(budget, 60, 6), [])
  assert.deepEqual(frames(budget, 60, 14), [1])
  assert.equal(budget.pixelRatio, 1)
})

test('hidden tabs, analysis and isolated stalls do not lower render resolution', () => {
  const budget = new RenderBudget(2)
  frames(budget, 24, 20, true)
  frames(budget, 60, 2)
  assert.equal(budget.sample(4), null)
  for (let i = 0; i < 10; i++) {
    frames(budget, 60, 1.9)
    budget.sample(0.15)
  }
  assert.equal(budget.pixelRatio, 1.5)
})
