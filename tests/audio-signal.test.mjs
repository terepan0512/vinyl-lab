import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AudioSignal, SIGNAL_SAMPLES } from '../src/audio/AudioSignal.ts'

test('silence remains a flat signal for any elapsed time', () => {
  const signal = new AudioSignal()
  for (let i = 0; i < 300; i++) signal.update(new Float32Array(2048), 48000, 1 / 60)
  assert.ok(signal.data.slice(0, SIGNAL_SAMPLES).every(value => value === 128))
  assert.ok(signal.data.slice(SIGNAL_SAMPLES).every(value => value === 0))
})

test('surface samples preserve the sign and amplitude of captured PCM', () => {
  const signal = new AudioSignal()
  const pcm = new Float32Array(2048)
  pcm.fill(0.5, 0, 1024)
  pcm.fill(-0.25, 1024)
  signal.update(pcm, 48000, 1 / 60)
  assert.ok(signal.data.slice(0, 128).every(value => value === 192))
  assert.ok(signal.data.slice(128, 256).every(value => value === 96))
  pcm.fill(0.1)
  signal.update(pcm, 48000, 1 / 60)
  assert.ok(signal.data.slice(0, 256).every(value => value === 141))
})

test('captured RMS advances at the same speed across refresh rates and clears after pause', () => {
  for (const fps of [30, 60, 120]) {
    const signal = new AudioSignal()
    const pcm = new Float32Array(2048).fill(0.25)
    for (let i = 0; i < fps; i++) signal.update(pcm, 48000, 1 / fps)
    assert.equal(signal.cursor, 119)
    assert.equal(signal.data.slice(256).filter(value => value > 0).length, 120)
    assert.ok(signal.data.slice(256, 376).every(value => value === 128))
    for (let i = 0; i < fps * 3; i++) signal.update(null, 48000, 1 / fps)
    assert.ok(signal.data.slice(0, 256).every(value => value === 128))
    assert.ok(signal.data.slice(256).every(value => value === 0))
  }
})

test('a sound pulse survives as recorded history and reset clears it immediately', () => {
  const signal = new AudioSignal()
  signal.update(new Float32Array(2048).fill(0.4), 48000, 1 / 60)
  const pulseIndex = signal.cursor
  for (let i = 0; i < 30; i++) signal.update(null, 48000, 1 / 60)
  assert.ok(signal.data[256 + pulseIndex] > 0)
  assert.equal(signal.data[256 + signal.cursor], 0)
  signal.reset()
  assert.ok(signal.data.slice(256).every(value => value === 0))
})

test('PCM capture immediately follows analyser block-size changes', () => {
  const signal = new AudioSignal()
  signal.update(new Float32Array(2048).fill(0.5), 48000, 1 / 60)
  assert.ok(signal.data.slice(0, 256).every(value => value === 192))
  signal.update(new Float32Array(513).fill(-0.25), 44100, 1 / 60)
  assert.ok(signal.data.slice(0, 256).every(value => value === 96))
  signal.update(new Float32Array(128).fill(0.5), 44100, 1 / 60)
  for (let i = 0; i < 256; i++) assert.equal(signal.data[i], i % 2 ? 192 : 128)
  signal.update(null, 44100, 1 / 60)
  assert.ok(signal.data.slice(0, 256).every(value => value === 128))
  signal.update(new Float32Array(4096).fill(0.5), 48000, 1 / 60)
  assert.ok(signal.data.slice(0, 256).every(value => value === 192))
})

