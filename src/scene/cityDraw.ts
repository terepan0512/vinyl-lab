// Drawn entirely with canvas, independent of Three.js for standalone previews.
function rng(seed: number) {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const NEON = ['#ff4fd8', '#35f2ff', '#c6ff5a', '#ff6ec7', '#7c6bff']

interface TowerLayer {
  base: string
  minH: number
  maxH: number
  minW: number
  maxW: number
  winProb: number
  winColors: string[]
  edgeProb: number
  gapMin: number
  gapMax: number
}

export function drawCity(ctx: CanvasRenderingContext2D, W: number, H: number, seed = 9) {
  const r = rng(seed)
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)]

  // ---- Sky: deep purple → electric blue → magenta horizon ----
  const sky = ctx.createLinearGradient(0, 0, 0, H)
  sky.addColorStop(0, '#07031f')
  sky.addColorStop(0.35, '#170b66')
  sky.addColorStop(0.62, '#3320c8')
  sky.addColorStop(0.82, '#9a2fd0')
  sky.addColorStop(1, '#ff4fb0')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, W, H)

  for (let i = 0; i < 140; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.15 + r() * 0.5})`
    ctx.fillRect(r() * W, r() * H * 0.42, 1.5, 1.5)
  }

  // Large pink halo, like a moon seen through fog
  const glow = ctx.createRadialGradient(W * 0.68, H * 0.5, 10, W * 0.68, H * 0.5, W * 0.6)
  glow.addColorStop(0, 'rgba(255,120,220,0.6)')
  glow.addColorStop(1, 'rgba(255,120,220,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  // ---- Buildings ----
  const towers = (o: TowerLayer) => {
    let x = -30
    while (x < W) {
      const w = o.minW + r() * (o.maxW - o.minW)
      const h = H * (o.minH + r() * (o.maxH - o.minH))
      const y = H - h
      ctx.fillStyle = o.base
      ctx.fillRect(x, y, w, h)

      for (let wy = y + 18; wy < H - 40; wy += 22) {
        for (let wx = x + 9; wx < x + w - 12; wx += 16) {
          if (r() < o.winProb) {
            ctx.globalAlpha = 0.45 + r() * 0.55
            ctx.fillStyle = pick(o.winColors)
            ctx.fillRect(wx, wy, 9, 14)
          }
        }
      }
      ctx.globalAlpha = 1

      if (r() < o.edgeProb) {
        const c = pick(NEON)
        ctx.save()
        ctx.shadowBlur = 20
        ctx.shadowColor = c
        ctx.fillStyle = c
        ctx.fillRect(r() > 0.5 ? x : x + w - 3, y, 3, h)
        ctx.restore()
      }
      if (r() > 0.62) {
        const ax = x + w * (0.3 + r() * 0.4)
        ctx.fillStyle = o.base
        ctx.fillRect(ax, y - 60, 3, 60)
        ctx.save()
        ctx.shadowBlur = 14
        ctx.shadowColor = '#ff2f8a'
        ctx.fillStyle = '#ff2f8a'
        ctx.beginPath()
        ctx.arc(ax + 1.5, y - 62, 4, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
      x += w + o.gapMin + r() * (o.gapMax - o.gapMin)
    }
  }

  towers({
    base: 'rgba(48,32,170,0.7)', minH: 0.25, maxH: 0.55, minW: 70, maxW: 120,
    winProb: 0.22, winColors: ['#ff6ec7', '#7df9ff'], edgeProb: 0.1, gapMin: 0, gapMax: 8,
  })

  const haze = ctx.createLinearGradient(0, H * 0.45, 0, H)
  haze.addColorStop(0, 'rgba(120,70,255,0)')
  haze.addColorStop(1, 'rgba(160,80,255,0.4)')
  ctx.fillStyle = haze
  ctx.fillRect(0, H * 0.45, W, H * 0.55)

  towers({
    base: '#2a169c', minH: 0.35, maxH: 0.72, minW: 80, maxW: 130,
    winProb: 0.34, winColors: ['#ff4fd8', '#35f2ff', '#e6dcff'], edgeProb: 0.5, gapMin: 14, gapMax: 60,
  })

  // ---- Vertical neon signs ----
  for (let i = 0; i < 5; i++) {
    const c = pick(NEON)
    const sx = W * (0.08 + r() * 0.8)
    const sy = H * (0.26 + r() * 0.3)
    const sw = 46
    const sh = 150 + r() * 60
    ctx.save()
    ctx.shadowBlur = 30
    ctx.shadowColor = c
    ctx.strokeStyle = c
    ctx.lineWidth = 3
    ctx.strokeRect(sx, sy, sw, sh)
    ctx.lineWidth = 2.5
    for (let g = 0; g < 4; g++) {
      const gy = sy + 14 + g * ((sh - 28) / 4)
      ctx.beginPath()
      ctx.moveTo(sx + 10, gy)
      ctx.lineTo(sx + sw - 10, gy + (r() - 0.5) * 12)
      ctx.moveTo(sx + sw / 2, gy - 6)
      ctx.lineTo(sx + sw / 2 + (r() - 0.5) * 16, gy + 16)
      ctx.stroke()
    }
    ctx.restore()
  }

  towers({
    base: '#0a0429', minH: 0.5, maxH: 0.88, minW: 110, maxW: 170,
    winProb: 0.14, winColors: ['#ff9ad8', '#ffd36b', '#7df9ff'], edgeProb: 0.5, gapMin: 180, gapMax: 330,
  })

  // ---- Aircraft light trails ----
  for (let i = 0; i < 7; i++) {
    const c = pick(NEON)
    const fx = r() * W
    const fy = H * (0.08 + r() * 0.4)
    const len = 40 + r() * 90
    const g = ctx.createLinearGradient(fx - len, fy, fx, fy)
    g.addColorStop(0, 'rgba(255,255,255,0)')
    g.addColorStop(1, c)
    ctx.save()
    ctx.shadowBlur = 14
    ctx.shadowColor = c
    ctx.strokeStyle = g
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(fx - len, fy)
    ctx.lineTo(fx, fy)
    ctx.stroke()
    ctx.restore()
  }

  // ---- Ground fog and edge vignette ----
  const fog = ctx.createLinearGradient(0, H * 0.72, 0, H)
  fog.addColorStop(0, 'rgba(255,79,176,0)')
  fog.addColorStop(1, 'rgba(255,79,176,0.45)')
  ctx.fillStyle = fog
  ctx.fillRect(0, H * 0.72, W, H * 0.28)

  const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.75)
  vig.addColorStop(0, 'rgba(0,0,0,0)')
  vig.addColorStop(1, 'rgba(0,0,0,0.38)')
  ctx.fillStyle = vig
  ctx.fillRect(0, 0, W, H)
}

// Rain: fine diagonal lines on a transparent background, tiled vertically without seams
export function drawRain(ctx: CanvasRenderingContext2D, W: number, H: number, seed = 3) {
  const r = rng(seed)
  ctx.clearRect(0, 0, W, H)
  for (let i = 0; i < 130; i++) {
    const x = r() * W
    const y = r() * H
    const len = 22 + r() * 46
    ctx.strokeStyle = `rgba(190,205,255,${0.18 + r() * 0.4})`
    ctx.lineWidth = 1 + r() * 1.2
    for (const dy of [-H, 0, H]) {
      ctx.beginPath()
      ctx.moveTo(x, y + dy)
      ctx.lineTo(x - len * 0.12, y + dy + len)
      ctx.stroke()
    }
  }
}
