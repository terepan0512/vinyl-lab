import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ViscousMotion } from '../src/scene/liquid/ViscousMotion.ts'

const silent = { inputLevel: 0, bass: 0, mid: 0, treble: 0 }
const sound = { inputLevel: 0.5, bass: 0.7, mid: 0.3, treble: 0.2 }

test('elapsed time without audio cannot move the liquid', () => {
  const motion = new ViscousMotion()
  for (let i = 0; i < 600; i++) motion.update(silent, 1 / 60)
  assert.deepEqual(motion.values, new ViscousMotion().values)
})

test('measured sound produces damped movement that settles after silence', () => {
  const motion = new ViscousMotion()
  const first = { ...motion.update(sound, 1 / 60) }
  assert.ok(first.level > 0.1 && first.level < 0.5)
  for (let i = 0; i < 120; i++) motion.update(sound, 1 / 60)
  assert.ok(motion.values.travel > 0.5)
  for (let i = 0; i < 180; i++) motion.update(silent, 1 / 60)
  const settled = { ...motion.values }
  assert.equal(settled.level, 0)
  for (let i = 0; i < 60; i++) motion.update(silent, 1 / 60)
  assert.deepEqual(motion.values, settled)
  motion.reset()
  assert.deepEqual(motion.values, new ViscousMotion().values)
})

test('audio-driven travel is consistent across refresh rates', () => {
  const runs = [30, 60, 120].map(fps => {
    const motion = new ViscousMotion()
    for (let i = 0; i < fps * 2; i++) motion.update(sound, 1 / fps)
    return { ...motion.values }
  })
  for (const value of runs.slice(1)) {
    for (const key of Object.keys(value)) assert.ok(Math.abs(value[key] - runs[0][key]) < 1e-10, key)
  }
})

test('quiet sustained notes continuously advect pigment instead of waiting for a section', () => {
  const motion = new ViscousMotion()
  const quiet = { inputLevel: 0.02, bass: 0.1, mid: 0.6, treble: 0.1 }
  for (let i = 0; i < 60; i++) motion.update(quiet, 1 / 60)
  const before = { ...motion.values }
  assert.ok(before.level > 0.1)
  for (let i = 0; i < 60; i++) motion.update(quiet, 1 / 60)
  for (const key of ['travel', 'flowX', 'flowY', 'swirl', 'stretch']) {
    assert.ok(motion.values[key] > before[key] + 0.01, key)
  }
})

test('bass, mid, treble, and spectral attacks drive distinct flow channels at the same RMS', () => {
  const run = (input) => {
    const motion = new ViscousMotion()
    for (let i = 0; i < 60; i++) motion.update({ inputLevel: 0.2, ...input }, 1 / 60)
    return { ...motion.values }
  }
  const bass = run({ bass: 1, mid: 0, treble: 0 })
  const mid = run({ bass: 0, mid: 1, treble: 0 })
  const treble = run({ bass: 0, mid: 0, treble: 1 })
  assert.equal(bass.travel, mid.travel)
  assert.equal(mid.travel, treble.travel)
  assert.ok(bass.flowX > mid.flowX + 0.4)
  assert.ok(mid.flowY > bass.flowY + 0.3)
  assert.ok(treble.stretch > bass.stretch + 0.2)
  assert.ok(bass.swirl > treble.swirl + 0.4)
  const hit = run({ bass: 0, mid: 1, treble: 0, onset: 1 })
  assert.ok(hit.swirl > mid.swirl + 0.3)
  assert.ok(hit.stretch > mid.stretch + 0.2)
})

test('an onset responds quickly, then releases with inertia', () => {
  const motion = new ViscousMotion()
  const hit = { ...sound, onset: 1 }
  motion.update(hit, 1 / 60)
  const attack = motion.values.onset
  assert.ok(attack > 0.4)
  motion.update({ ...sound, onset: 0 }, 1 / 60)
  assert.ok(motion.values.onset > 0.2 && motion.values.onset < attack)
  for (let i = 0; i < 90; i++) motion.update({ ...sound, onset: 0 }, 1 / 60)
  assert.ok(motion.values.onset < 0.0001)
})

test('timed strength and timbre changes remain consistent across refresh rates', () => {
  const runs = [30, 60, 120].map(fps => {
    const motion = new ViscousMotion()
    const passages = [
      [1, { inputLevel: 0.02, bass: 0.7, mid: 0.2, treble: 0.1, onset: 0, timbre: 0.2 }],
      [0.5, { inputLevel: 0.5, bass: 0.1, mid: 0.4, treble: 0.5, onset: 1, timbre: 0.9 }],
      [1.5, { inputLevel: 0.1, bass: 0.3, mid: 0.5, treble: 0.2, onset: 0, timbre: 0.5 }],
    ]
    for (const [seconds, input] of passages) {
      for (let i = 0; i < fps * seconds; i++) motion.update(input, 1 / fps)
    }
    return { ...motion.values }
  })
  for (const value of runs.slice(1)) {
    for (const key of Object.keys(value)) assert.ok(Math.abs(value[key] - runs[0][key]) < 1e-10, key)
  }
})

test('the user flow multiplier scales audio displacement and does not create it', () => {
  const stopped = new ViscousMotion()
  const normal = new ViscousMotion()
  const double = new ViscousMotion()
  for (let i = 0; i < 60; i++) {
    stopped.update(sound, 1 / 60, 0)
    normal.update(sound, 1 / 60, 1)
    double.update(sound, 1 / 60, 2)
  }
  assert.ok(stopped.values.level > 0)
  for (const key of ['travel', 'flowX', 'flowY', 'swirl', 'stretch']) {
    assert.equal(stopped.values[key], 0)
    assert.equal(double.values[key], normal.values[key] * 2)
  }
  const silent = new ViscousMotion()
  for (let i = 0; i < 60; i++) silent.update({ inputLevel: 0.0009, bass: 1, mid: 1, treble: 1, onset: 1 }, 1 / 60, 4)
  assert.deepEqual(silent.values, new ViscousMotion().values)
})
