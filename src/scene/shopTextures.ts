
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'

// ---------- helpers ----------
function rng(seed: number) {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser does not support 2D canvas.')
  return [canvas, ctx]
}

function colorTexture(canvas: HTMLCanvasElement) {
  const t = new CanvasTexture(canvas)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 8
  return t
}

// ---------- wood ----------
interface WoodOptions {
  boards: number
  vertical: boolean
  seed: number
  hue: number
  light: number
  sat: number
  repeatX: number
  repeatY: number
}

function drawWood(ctx: CanvasRenderingContext2D, size: number, o: WoodOptions, bump: boolean) {
  const r = rng(o.seed)
  const col = (h: number, s: number, l: number, a = 1) =>
    bump ? `hsla(0,0%,${l * 1.6}%,${a})` : `hsla(${h},${s}%,${l}%,${a})`

  const bw = size / o.boards
  for (let i = 0; i < o.boards; i++) {
    const h = o.hue + (r() - 0.5) * 8
    const l = o.light + (r() - 0.5) * 7
    const x0 = i * bw

    ctx.save()
    ctx.translate(o.vertical ? x0 : 0, o.vertical ? 0 : x0)
    const w = o.vertical ? bw : size
    const hgt = o.vertical ? size : bw

    ctx.fillStyle = col(h, o.sat, l)
    ctx.fillRect(0, 0, w, hgt)

    // grain lines, slightly wavy
    const lines = 150
    for (let k = 0; k < lines; k++) {
      const dark = r() > 0.45
      ctx.strokeStyle = dark ? col(h, o.sat, l - 9 - r() * 7, 0.05 + r() * 0.14) : col(h, o.sat, l + 6 + r() * 6, 0.04 + r() * 0.08)
      ctx.lineWidth = 0.5 + r() * 1.6
      const pos = r() * (o.vertical ? w : hgt)
      const wob = 1 + r() * 5
      const phase = r() * 6
      ctx.beginPath()
      const len = o.vertical ? hgt : w
      for (let t = 0; t <= len; t += 24) {
        const off = Math.sin(t / 130 + phase) * wob
        if (o.vertical) ctx.lineTo(pos + off, t)
        else ctx.lineTo(t, pos + off)
      }
      ctx.stroke()
    }

    // an occasional knot
    if (r() > 0.6) {
      const kx = o.vertical ? r() * w : r() * w
      const ky = r() * hgt
      const g = ctx.createRadialGradient(kx, ky, 1, kx, ky, 16 + r() * 14)
      g.addColorStop(0, col(h, o.sat, l - 14, 0.55))
      g.addColorStop(1, col(h, o.sat, l - 14, 0))
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.ellipse(kx, ky, o.vertical ? 12 : 30, o.vertical ? 30 : 12, 0, 0, Math.PI * 2)
      ctx.fill()
    }

    // dark seam between boards
    ctx.fillStyle = bump ? 'hsl(0,0%,5%)' : 'hsla(255,40%,3%,0.9)'
    if (o.vertical) ctx.fillRect(0, 0, 2.5, hgt)
    else ctx.fillRect(0, 0, w, 2.5)
    ctx.restore()
  }
}

export function createWoodTextures(o: WoodOptions) {
  const size = 1024
  const [cc, cctx] = makeCanvas(size, size)
  drawWood(cctx, size, o, false)
  const [bc, bctx] = makeCanvas(size, size)
  drawWood(bctx, size, o, true)

  const map = colorTexture(cc)
  const bumpMap = new CanvasTexture(bc)
  bumpMap.anisotropy = 8
  for (const t of [map, bumpMap]) {
    t.wrapS = RepeatWrapping
    t.wrapT = RepeatWrapping
    t.repeat.set(o.repeatX, o.repeatY)
  }
  return { map, bumpMap }
}

// ---------- record covers ----------
export const PALETTES = [
  { bg: '#140a3a', fg: '#e8dcff', ac: '#ff4fd8' },
  { bg: '#0b1f5c', fg: '#d8f3ff', ac: '#35f2ff' },
  { bg: '#2a0f55', fg: '#ffd9f4', ac: '#ff6ec7' },
  { bg: '#102a6e', fg: '#e9e1ff', ac: '#c6ff5a' },
  { bg: '#3a0a4a', fg: '#ffe3f7', ac: '#7df9ff' },
  { bg: '#0a1240', fg: '#cfe0ff', ac: '#ff4f9a' },
] as const

export function createCoverTexture(_title: string, pal: number, kind: number) {
  const S = 512
  const P = PALETTES[pal % PALETTES.length]
  const [canvas, ctx] = makeCanvas(S, S)
  const r = rng(_title.length * 131 + pal * 17 + kind)

  ctx.fillStyle = P.bg
  ctx.fillRect(0, 0, S, S)

  // artwork
  if (kind % 4 === 0) {
    ctx.fillStyle = P.fg
    ctx.beginPath(); ctx.arc(256, 200, 165, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = P.bg
    ctx.beginPath(); ctx.arc(256, 200, 112, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = P.ac
    ctx.beginPath(); ctx.arc(256, 200, 50, 0, Math.PI * 2); ctx.fill()
  } else if (kind % 4 === 1) {
    ctx.fillStyle = P.ac
    ctx.beginPath(); ctx.arc(256, 260, 165, Math.PI, 0); ctx.fill()
    ctx.fillStyle = P.fg
    for (let i = 0; i < 4; i++) ctx.fillRect(70, 190 + i * 28, 372, 9 - i)
    ctx.beginPath(); ctx.arc(380, 80, 26, 0, Math.PI * 2); ctx.fill()
  } else if (kind % 4 === 2) {
    ctx.fillStyle = P.fg
    ctx.globalAlpha = 0.92
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(S, 0); ctx.lineTo(S, 330); ctx.closePath(); ctx.fill()
    ctx.globalAlpha = 0.22
    ctx.beginPath(); ctx.moveTo(0, 330); ctx.lineTo(0, 150); ctx.lineTo(200, 330); ctx.closePath(); ctx.fill()
    ctx.globalAlpha = 1
    ctx.fillStyle = P.ac
    ctx.beginPath(); ctx.arc(180, 170, 85, 0, Math.PI * 2); ctx.fill()
  } else {
    for (let a = 0; a < 6; a++) {
      for (let b = 0; b < 5; b++) {
        ctx.fillStyle = (a + b) % 2 ? P.fg : P.ac
        ctx.globalAlpha = 0.85
        ctx.beginPath(); ctx.arc(60 + b * 98, 55 + a * 56, 15, 0, Math.PI * 2); ctx.fill()
      }
    }
    ctx.globalAlpha = 1
  }

  // press ring
  ctx.strokeStyle = 'rgba(255,255,255,0.07)'
  ctx.lineWidth = 5
  ctx.beginPath(); ctx.arc(256, 256, 218, 0, Math.PI * 2); ctx.stroke()

  // paper: specks, worn edges, a soft crease
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)'
    ctx.fillRect(r() * S, r() * S, 1 + r() * 2, 1 + r() * 2)
  }
  const edge = ctx.createLinearGradient(0, 0, S, S)
  edge.addColorStop(0, 'rgba(255,255,255,0.1)')
  edge.addColorStop(0.5, 'rgba(255,255,255,0)')
  edge.addColorStop(1, 'rgba(0,0,0,0.12)')
  ctx.fillStyle = edge
  ctx.fillRect(0, 0, S, S)
  ctx.strokeStyle = 'rgba(235,225,200,0.35)'
  ctx.lineWidth = 6
  ctx.strokeRect(3, 3, S - 6, S - 6)

  return colorTexture(canvas)
}

// ---------- record spines for the shelves ----------
export function createSpinesTexture(seed: number) {
  const W = 1024
  const H = 1176
  const [canvas, ctx] = makeCanvas(W, H)
  const r = rng(seed)

  ctx.fillStyle = '#07041a'
  ctx.fillRect(0, 0, W, H)

  let x = 6
  while (x < W - 14) {
    const w = 11 + Math.floor(r() * 16)
    const pale = r() > 0.88
    const hue = [190, 215, 265, 290, 320, 335][Math.floor(r() * 6)]
    const base = pale ? `hsl(255,25%,${72 + r() * 14}%)` : `hsl(${hue},${35 + r() * 45}%,${22 + r() * 30}%)`
    const top = 18 + Math.floor(r() * 40)

    ctx.fillStyle = base
    ctx.fillRect(x, top, w, H - top)

    // spine roundness
    const g = ctx.createLinearGradient(x, 0, x + w, 0)
    g.addColorStop(0, 'rgba(0,0,0,0.5)')
    g.addColorStop(0.35, 'rgba(255,255,255,0.12)')
    g.addColorStop(1, 'rgba(0,0,0,0.4)')
    ctx.fillStyle = g
    ctx.fillRect(x, top, w, H - top)

    // title strip + a band
    if (!pale && r() > 0.4) {
      ctx.fillStyle = 'rgba(236,230,214,0.55)'
      ctx.fillRect(x + 3, top + 40, w - 6, 70 + r() * 90)
    }
    if (r() > 0.5) {
      ctx.fillStyle = 'rgba(236,230,214,0.4)'
      ctx.fillRect(x, H - 120 - r() * 40, w, 8)
    }
    x += w + 1 + Math.floor(r() * 2)
  }
  return colorTexture(canvas)
}

// ---------- turntable strobe ring ----------
export function createStrobeTexture() {
  const S = 512
  const [canvas, ctx] = makeCanvas(S, S)
  ctx.clearRect(0, 0, S, S)
  const c = S / 2
  const dots = 120
  ctx.fillStyle = '#d6d8dc'
  for (let i = 0; i < dots; i++) {
    const a = (i / dots) * Math.PI * 2
    ctx.save()
    ctx.translate(c + Math.cos(a) * (c - 12), c + Math.sin(a) * (c - 12))
    ctx.rotate(a)
    ctx.fillRect(-5, -1.6, 10, 3.2)
    ctx.restore()
  }
  return colorTexture(canvas)
}
