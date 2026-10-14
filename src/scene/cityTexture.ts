import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'
import { drawCity, drawRain } from './cityDraw'

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('当前浏览器不支持 2D canvas')
  return [c, ctx]
}

export function createCityTexture() {
  const [c, ctx] = canvas(1024, 1480)
  drawCity(ctx, 1024, 1480)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 8
  return t
}

export function createRainTexture() {
  const [c, ctx] = canvas(256, 512)
  drawRain(ctx, 256, 512)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.wrapS = RepeatWrapping
  t.wrapT = RepeatWrapping
  t.repeat.set(2, 2.6)
  return t
}
