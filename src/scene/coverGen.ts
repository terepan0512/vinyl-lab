// 生成唱片封面：纯 canvas、不带文字。同一个 seed 永远出同一张图。
export const COVER_SIZE = 512
export const COVER_STYLES = ['sunset', 'moon', 'rings', 'glitch', 'city', 'orbit', 'peaks'] as const

const PALS = [
  { top: '#140a3a', bot: '#3a0a4a', a: '#ff4fd8', b: '#35f2ff' },
  { top: '#0b1f5c', bot: '#2a0f55', a: '#35f2ff', b: '#ff6ec7' },
  { top: '#1a0b3d', bot: '#0a1240', a: '#7c6bff', b: '#ff4fd8' },
  { top: '#2a0f55', bot: '#140a3a', a: '#ffd9f4', b: '#35f2ff' },
  { top: '#0a1240', bot: '#3a0a4a', a: '#ff4f9a', b: '#7df9ff' },
]

function rng(seed: number) {
  let s = (seed * 2654435761) >>> 0 || 1
  return () => {
    s ^= s << 13
    s >>>= 0
    s ^= s >>> 17
    s ^= s << 5
    s >>>= 0
    return s / 4294967296
  }
}

export function drawGeneratedCover(ctx: CanvasRenderingContext2D, seed: number, style?: number) {
  const S = COVER_SIZE
  const r = rng(seed + 7)
  const P = PALS[Math.floor(r() * PALS.length)]
  const st = style ?? Math.floor(r() * COVER_STYLES.length)
  const bg = ctx.createLinearGradient(0, 0, 0, S)
  bg.addColorStop(0, P.top)
  bg.addColorStop(1, P.bot)
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, S, S)
  ctx.lineCap = 'round'

  const stars = (n: number) => {
    ctx.fillStyle = '#ffffff'
    for (let i = 0; i < n; i++) {
      ctx.globalAlpha = 0.2 + r() * 0.7
      ctx.fillRect(r() * S, r() * S * 0.7, 1 + r() * 2, 1 + r() * 2)
    }
    ctx.globalAlpha = 1
  }

  if (st === 0) {
    // 日落 + 条纹太阳 + 透视网格
    stars(60)
    const horizon = S * 0.62
    const sun = ctx.createLinearGradient(0, 70, 0, horizon)
    sun.addColorStop(0, P.b)
    sun.addColorStop(1, P.a)
    ctx.fillStyle = sun
    ctx.beginPath()
    ctx.arc(S / 2, horizon - 110, 150, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = P.bot
    for (let i = 0; i < 6; i++) ctx.fillRect(0, horizon - 150 + i * 26, S, 3 + i * 2.2)
    ctx.fillStyle = P.bot
    ctx.fillRect(0, horizon, S, S - horizon)
    ctx.strokeStyle = P.a
    ctx.lineWidth = 2
    ctx.globalAlpha = 0.8
    for (let i = -8; i <= 8; i++) {
      ctx.beginPath()
      ctx.moveTo(S / 2 + i * 14, horizon)
      ctx.lineTo(S / 2 + i * 120, S)
      ctx.stroke()
    }
    for (let i = 1; i < 9; i++) {
      const y = horizon + (i / 9) ** 2 * (S - horizon)
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(S, y)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  } else if (st === 1) {
    // 新月 + 水面倒影
    stars(80)
    const horizon = S * 0.66
    const mx = S * 0.5
    const my = S * 0.34
    ctx.fillStyle = P.a
    ctx.beginPath()
    ctx.arc(mx, my, 100, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = P.top
    ctx.beginPath()
    ctx.arc(mx + 42, my - 22, 92, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = P.bot
    ctx.fillRect(0, horizon, S, S - horizon)
    ctx.fillStyle = P.a
    for (let i = 0; i < 9; i++) {
      const w = 150 - i * 14
      ctx.globalAlpha = 0.7 - i * 0.06
      ctx.fillRect(mx - w / 2 + Math.sin(i * 1.7) * 10, horizon + 12 + i * 20, w, 5)
    }
    ctx.globalAlpha = 1
  } else if (st === 2) {
    // 偏心同心圆 + 波浪线
    const cx = S * (0.35 + r() * 0.3)
    const cy = S * (0.35 + r() * 0.3)
    for (let i = 12; i >= 1; i--) {
      ctx.fillStyle = i % 2 ? P.a : P.top
      ctx.globalAlpha = i % 2 ? 0.9 : 1
      ctx.beginPath()
      ctx.arc(cx + i * 3, cy + i * 2, i * 24, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
    ctx.strokeStyle = P.b
    ctx.lineWidth = 4
    for (let k = 0; k < 5; k++) {
      ctx.beginPath()
      for (let x = 0; x <= S; x += 8) {
        const y = S * 0.78 + k * 16 + Math.sin(x / 38 + k) * 12
        x ? ctx.lineTo(x, y) : ctx.moveTo(x, y)
      }
      ctx.stroke()
    }
  } else if (st === 3) {
    // 故障条纹
    for (let i = 0; i < 26; i++) {
      const y = r() * S
      const h = 6 + r() * 46
      ctx.fillStyle = [P.a, P.b, P.top, '#ffffff'][Math.floor(r() * 4)]
      ctx.globalAlpha = 0.25 + r() * 0.6
      ctx.fillRect(r() * S * 0.4, y, S * (0.2 + r() * 0.8), h)
    }
    ctx.globalAlpha = 1
    ctx.strokeStyle = P.a
    ctx.lineWidth = 16
    ctx.beginPath()
    ctx.arc(S / 2 - 8, S / 2, 120, 0, Math.PI * 2)
    ctx.stroke()
    ctx.strokeStyle = P.b
    ctx.beginPath()
    ctx.arc(S / 2 + 8, S / 2, 120, 0, Math.PI * 2)
    ctx.stroke()
  } else if (st === 4) {
    // 月亮 + 城市天际线
    stars(70)
    ctx.fillStyle = P.a
    ctx.beginPath()
    ctx.arc(S * (0.3 + r() * 0.4), 150, 90, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = P.top
    let x = -10
    while (x < S) {
      const w = 30 + r() * 50
      const h = 110 + r() * 220
      ctx.fillRect(x, S - h, w, h)
      ctx.fillStyle = P.b
      for (let wy = S - h + 12; wy < S - 10; wy += 20) {
        for (let wx = x + 7; wx < x + w - 8; wx += 14) {
          if (r() > 0.6) ctx.fillRect(wx, wy, 6, 9)
        }
      }
      ctx.fillStyle = P.top
      x += w + 4
    }
  } else if (st === 6) {
    // 层叠的山
    stars(50)
    ctx.fillStyle = P.a
    ctx.beginPath()
    ctx.arc(S * 0.7, S * 0.28, 60, 0, Math.PI * 2)
    ctx.fill()
    for (let layer = 0; layer < 4; layer++) {
      const base = S * (0.5 + layer * 0.12)
      ctx.fillStyle = layer % 2 ? P.top : P.bot
      ctx.globalAlpha = 0.45 + layer * 0.18
      ctx.beginPath()
      ctx.moveTo(0, S)
      for (let x = 0; x <= S; x += 32) ctx.lineTo(x, base - (60 + r() * 90) * (1 - layer * 0.18))
      ctx.lineTo(S, S)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = P.b
      ctx.globalAlpha = 0.35
      ctx.lineWidth = 2
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  } else {
    // 行星 + 星环
    stars(90)
    const pg = ctx.createLinearGradient(S * 0.3, S * 0.2, S * 0.7, S * 0.8)
    pg.addColorStop(0, P.a)
    pg.addColorStop(1, P.b)
    ctx.save()
    ctx.translate(S / 2, S / 2)
    ctx.rotate(-0.4)
    ctx.strokeStyle = P.b
    ctx.lineWidth = 10
    ctx.globalAlpha = 0.6
    ctx.beginPath()
    ctx.ellipse(0, 0, 220, 52, 0, Math.PI, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha = 1
    ctx.fillStyle = pg
    ctx.beginPath()
    ctx.arc(0, 0, 130, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = P.a
    ctx.lineWidth = 10
    ctx.beginPath()
    ctx.ellipse(0, 0, 220, 52, 0, 0, Math.PI)
    ctx.stroke()
    ctx.restore()
  }

  // 颗粒 + 暗角
  for (let i = 0; i < 1800; i++) {
    ctx.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.07)'
    ctx.fillRect(r() * S, r() * S, 1 + r() * 2, 1 + r() * 2)
  }
  const v = ctx.createRadialGradient(S / 2, S / 2, S * 0.35, S / 2, S / 2, S * 0.75)
  v.addColorStop(0, 'rgba(0,0,0,0)')
  v.addColorStop(1, 'rgba(0,0,0,0.4)')
  ctx.fillStyle = v
  ctx.fillRect(0, 0, S, S)
}

// 把用户上传的图片居中裁成正方形，缩到 512
export function imageToCoverDataUrl(img: CanvasImageSource & { width: number; height: number }) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = COVER_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('当前浏览器不支持 2D canvas')
  const m = Math.min(img.width, img.height)
  ctx.drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, COVER_SIZE, COVER_SIZE)
  return canvas.toDataURL('image/jpeg', 0.9)
}

export function generatedCoverDataUrl(seed: number, style?: number) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = COVER_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('当前浏览器不支持 2D canvas')
  drawGeneratedCover(ctx, seed, style)
  return canvas.toDataURL('image/jpeg', 0.9)
}
