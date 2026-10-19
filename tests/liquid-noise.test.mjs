import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LinearFilter, NoColorSpace, RedFormat, RepeatWrapping, UnsignedByteType } from 'three'
import { createLiquidNoiseData, createLiquidNoiseTexture, LIQUID_NOISE_SIZE } from '../src/scene/liquid/noiseTexture.ts'

test('the static flow texture is repeatable and owns its data', () => {
  const first = createLiquidNoiseData()
  const second = createLiquidNoiseData()
  assert.equal(first.length, LIQUID_NOISE_SIZE ** 2)
  assert.deepEqual(first, second)
  first[0] = 255
  assert.equal(second[0], 0)
})

test('noise uses linear data sampling with seamless wrapping and no color conversion', () => {
  const texture = createLiquidNoiseTexture()
  try {
    assert.equal(texture.image.width, LIQUID_NOISE_SIZE)
    assert.equal(texture.image.height, LIQUID_NOISE_SIZE)
    assert.equal(texture.format, RedFormat)
    assert.equal(texture.type, UnsignedByteType)
    assert.equal(texture.minFilter, LinearFilter)
    assert.equal(texture.magFilter, LinearFilter)
    assert.equal(texture.wrapS, RepeatWrapping)
    assert.equal(texture.wrapT, RepeatWrapping)
    assert.equal(texture.colorSpace, NoColorSpace)
    assert.equal(texture.generateMipmaps, false)
    assert.ok(texture.version > 0)
  } finally {
    texture.dispose()
  }
})

test('the baked lattice covers the full noise range without a directional band', () => {
  const data = createLiquidNoiseData()
  const buckets = new Array(16).fill(0)
  let sum = 0, xCorrelation = 0, yCorrelation = 0
  for (let y = 0; y < LIQUID_NOISE_SIZE; y++) {
    for (let x = 0; x < LIQUID_NOISE_SIZE; x++) {
      const value = data[y * LIQUID_NOISE_SIZE + x]
      buckets[Math.min(15, Math.floor(value / 16))]++
      sum += value / 255
      const centered = value / 255 - 0.5
      xCorrelation += centered * (data[y * LIQUID_NOISE_SIZE + (x + 1) % LIQUID_NOISE_SIZE] / 255 - 0.5)
      yCorrelation += centered * (data[((y + 1) % LIQUID_NOISE_SIZE) * LIQUID_NOISE_SIZE + x] / 255 - 0.5)
    }
  }
  assert.ok(sum / data.length > 0.49 && sum / data.length < 0.51)
  assert.ok(buckets.every(count => count > 850 && count < 1200), buckets.join(', '))
  assert.ok(Math.abs(xCorrelation / data.length) < 0.003)
  assert.ok(Math.abs(yCorrelation / data.length) < 0.003)
})
