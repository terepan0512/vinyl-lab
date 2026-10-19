import { DataTexture, LinearFilter, NoColorSpace, RedFormat, RepeatWrapping, UnsignedByteType } from 'three'

export const LIQUID_NOISE_SIZE = 128

// Bake the previous spatial hash once. This texture describes pigment shape;
// it does not choose colors or provide an animation clock.
export function createLiquidNoiseData(): Uint8Array {
  const data = new Uint8Array(LIQUID_NOISE_SIZE * LIQUID_NOISE_SIZE)
  for (let y = 0; y < LIQUID_NOISE_SIZE; y++) {
    for (let x = 0; x < LIQUID_NOISE_SIZE; x++) {
      const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
      data[y * LIQUID_NOISE_SIZE + x] = Math.round((value - Math.floor(value)) * 255)
    }
  }
  return data
}

export function createLiquidNoiseTexture(): DataTexture {
  const texture = new DataTexture(createLiquidNoiseData(), LIQUID_NOISE_SIZE, LIQUID_NOISE_SIZE, RedFormat, UnsignedByteType)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.colorSpace = NoColorSpace
  texture.generateMipmaps = false
  texture.needsUpdate = true
  return texture
}
