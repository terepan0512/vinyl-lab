import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AudioFeatures } from '../src/audio/AudioFeatures.ts'

function createAnalyser(sampleRate = 48000) {
  return {
    context: { state: 'running', sampleRate },
    fftSize: 2048,
    frequencyBinCount: 1024,
    minDecibels: -100,
    maxDecibels: -30,
    amplitude: 0.25,
    bands: [[20, 250]],
    getByteFrequencyData(buffer) {
      buffer.fill(0)
      const binHz = this.context.sampleRate / this.fftSize
      for (const [low, high] of this.bands) {
        buffer.fill(200, Math.max(1, Math.floor(low / binHz)), Math.ceil(high / binHz))
      }
    },
    getFloatTimeDomainData(buffer) {
      for (let i = 0; i < buffer.length; i++) buffer[i] = i % 2 ? this.amplitude : -this.amplitude
    },
  }
}

test('frequency bands and RMS level are sampled at both common sample rates', () => {
  for (const sampleRate of [44100, 48000]) {
    const features = new AudioFeatures()
    const analyser = createAnalyser(sampleRate)
    for (let i = 0; i < 60; i++) features.sample(analyser, true, 1 / 60)
    const { bass, mid, treble, level } = features.values
    assert.ok(bass > 0.75 && bass < 0.8)
    // The band boundary bin is shared, so allow a small amount of mid energy.
    assert.ok(mid < 0.02)
    assert.equal(treble, 0)
    assert.ok(Math.abs(level - 0.5) < 0.001)
  }
})

test('paused, missing, and suspended audio decays without live input', () => {
  const features = new AudioFeatures()
  const analyser = createAnalyser()
  assert.ok(features.sample(analyser, true, 1 / 60).inputLevel > 0)
  const originalBass = features.values.bass
  for (let i = 0; i < 120; i++) {
    const values = features.sample(analyser, false, 1 / 60)
    assert.equal(values.inputLevel, 0)
  }
  assert.ok(features.values.bass < originalBass * 0.01)
  assert.equal(features.sample(null, true, 1 / 60).inputLevel, 0)
  analyser.context.state = 'suspended'
  assert.equal(features.sample(analyser, true, 1 / 60).inputLevel, 0)
  features.reset()
  assert.deepEqual(features.values, new AudioFeatures().values)
})

test('a spectral attack is captured live even when RMS and the track section do not change', () => {
  const features = new AudioFeatures()
  const analyser = createAnalyser()
  for (let i = 0; i < 60; i++) features.sample(analyser, true, 1 / 60)
  const before = { ...features.values }
  assert.ok(before.onset < 0.0001)
  analyser.bands = [[3000, 6000]]
  const attack = { ...features.sample(analyser, true, 1 / 60) }
  assert.equal(attack.inputLevel, before.inputLevel)
  assert.ok(attack.onset > 0.9)
  for (let i = 0; i < 60; i++) features.sample(analyser, true, 1 / 60)
  assert.ok(features.values.timbre > before.timbre + 0.6)
  assert.ok(features.values.treble > 0.3)
  assert.ok(features.values.bass < 0.05)
  assert.ok(features.values.onset < 0.0001)
})

test('live flatness distinguishes broad noise from a narrow tone without instrument labels', () => {
  const analyser = createAnalyser()
  const features = new AudioFeatures()
  analyser.bands = [[1000, 1020]]
  for (let i = 0; i < 60; i++) features.sample(analyser, true, 1 / 60)
  const narrow = features.values.flatness
  analyser.bands = [[20, 8000]]
  for (let i = 0; i < 60; i++) features.sample(analyser, true, 1 / 60)
  assert.ok(narrow < 0.1)
  assert.ok(features.values.flatness > 0.95)
})

test('reset clears spectral history and silence cannot invent an onset', () => {
  const analyser = createAnalyser()
  const features = new AudioFeatures()
  features.sample(analyser, true, 1 / 60)
  features.reset()
  analyser.amplitude = 0
  analyser.bands = []
  for (let i = 0; i < 60; i++) features.sample(analyser, true, 1 / 60)
  assert.deepEqual(features.values, new AudioFeatures().values)
})

test('quiet sustained audio keeps responding on consecutive rendered frames', () => {
  const analyser = createAnalyser()
  analyser.amplitude = 0.002
  const features = new AudioFeatures()
  for (let i = 0; i < 90; i++) features.sample(analyser, true, 1 / 120)
  const quietLevel = features.values.inputLevel
  assert.ok(quietLevel > 0 && quietLevel < 0.01)
  analyser.bands = [[3000, 6000]]
  assert.ok(features.sample(analyser, true, 1 / 120).onset > 0.9)
  analyser.bands = [[20, 250]]
  assert.ok(features.sample(analyser, true, 1 / 120).onset > 0.9)
  assert.equal(features.values.inputLevel, quietLevel)
})

test('changing FFT settings and decibel range refreshes cached measurements', () => {
  const analyser = createAnalyser()
  analyser.getByteFrequencyData = function (buffer) {
    buffer.fill(0)
    const binHz = this.context.sampleRate / this.fftSize
    buffer[Math.round(200 / binHz)] = 200
    buffer[Math.round(4000 / binHz)] = 150
  }
  const features = new AudioFeatures()
  for (let i = 0; i < 120; i++) features.sample(analyser, true, 1 / 60)
  const previousTimbre = features.values.timbre
  analyser.minDecibels = -70
  analyser.maxDecibels = -10
  analyser.fftSize = 1024
  analyser.frequencyBinCount = 512
  analyser.context.sampleRate = 44100
  const fresh = new AudioFeatures()
  for (let i = 0; i < 600; i++) {
    features.sample(analyser, true, 1 / 60)
    fresh.sample(analyser, true, 1 / 60)
  }
  for (const key of Object.keys(features.values)) {
    assert.ok(Math.abs(features.values[key] - fresh.values[key]) < 1e-10, key)
  }
  assert.ok(Math.abs(features.values.timbre - previousTimbre) > 0.001)
})
