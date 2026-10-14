
import { AdditiveBlending, CanvasTexture, SRGBColorSpace } from 'three'

const SIZE = 1024
const DISC_RADIUS = 2

// Convert the record radius to canvas pixel coordinates.
const toPx = (r: number) => (r / DISC_RADIUS) * (SIZE / 2)

function makeCanvas(size = SIZE): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser does not support 2D canvas.')
  return [canvas, ctx]
}

function circle(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath()
  ctx.arc(SIZE / 2, SIZE / 2, r, 0, Math.PI * 2)
}

// Generate groove bump and roughness maps.
export function createGrooveMaps() {
  const [bumpCanvas, bump] = makeCanvas()
  bump.fillStyle = '#808080'
  bump.fillRect(0, 0, SIZE, SIZE)

  bump.lineWidth = 1
  for (let r = toPx(0.95); r < toPx(1.95); r += 1.6) {
    const v = 90 + Math.floor(Math.random() * 90)
    bump.strokeStyle = `rgb(${v},${v},${v})`
    circle(bump, r)
    bump.stroke()
  }

  // Smooth separation bands between tracks.
  bump.strokeStyle = '#808080'
  bump.lineWidth = 6
  for (const gap of [1.3, 1.62]) {
    circle(bump, toPx(gap))
    bump.stroke()
  }

  const [roughCanvas, rough] = makeCanvas()
  rough.fillStyle = '#4d4d4d'
  rough.fillRect(0, 0, SIZE, SIZE)
  rough.strokeStyle = '#1f1f1f'
  rough.lineWidth = 8
  for (const gap of [1.3, 1.62]) {
    circle(rough, toPx(gap))
    rough.stroke()
  }

  const bumpMap = new CanvasTexture(bumpCanvas)
  const roughnessMap = new CanvasTexture(roughCanvas)
  bumpMap.anisotropy = 8
  roughnessMap.anisotropy = 8
  return { bumpMap, roughnessMap }
}

// Create two distinctive wedge-shaped vinyl highlights
// with a subtle cool-toned sheen.
export function createSheenTexture() {
  const [canvas, ctx] = makeCanvas()
  const g = ctx.createConicGradient(0, SIZE / 2, SIZE / 2)
  const wedge = (center: number) => {
    g.addColorStop(center - 0.12, 'rgba(200,215,255,0)')
    g.addColorStop(center, 'rgba(200,215,255,0.7)')
    g.addColorStop(center + 0.12, 'rgba(200,215,255,0)')
  }
  g.addColorStop(0, 'rgba(200,215,255,0)')
  wedge(0.15)
  wedge(0.65)
  g.addColorStop(1, 'rgba(200,215,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, SIZE, SIZE)

  // Mask the texture to retain only the annular groove region.
  ctx.globalCompositeOperation = 'destination-in'
  ctx.beginPath()
  ctx.arc(SIZE / 2, SIZE / 2, toPx(1.95), 0, Math.PI * 2)
  ctx.moveTo(SIZE / 2 + toPx(0.95), SIZE / 2)
  ctx.arc(SIZE / 2, SIZE / 2, toPx(0.95), 0, Math.PI * 2, true)
  ctx.fillStyle = '#fff'
  ctx.fill('evenodd')

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}

export const SHEEN_BLENDING = AdditiveBlending

// Center label: neon pink background with dark indigo typography.
export function createLabelTexture() {
  const size = 512
  const [canvas, ctx] = makeCanvas(size)
  const c = size / 2

  ctx.fillStyle = '#ff4fd8'
  ctx.fillRect(0, 0, size, size)

  ctx.strokeStyle = 'rgba(20,10,58,0.5)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(c, c, c * 0.82, 0, Math.PI * 2)
  ctx.stroke()

  ctx.fillStyle = '#140a3a'
  ctx.textAlign = 'center'
  ctx.font = '600 44px system-ui, sans-serif'
  ctx.fillText('VINYL LAB', c, c - 70)
  ctx.font = '400 28px system-ui, sans-serif'
  ctx.fillText('SIDE A  33⅓ RPM', c, c + 90)

  // Small reference dot to make record rotation easier to observe.
  ctx.beginPath()
  ctx.arc(c + c * 0.55, c, 14, 0, Math.PI * 2)
  ctx.fill()

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}
