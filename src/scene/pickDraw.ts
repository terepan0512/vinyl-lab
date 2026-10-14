// Original guitar pick face designs drawn entirely on canvas (skull, eye, lightning bolt, vinyl record).
export type PickKind = 'none' | 'skull' | 'eye' | 'bolt' | 'record' | 'star' | 'flame' | 'note'
export const PICK_TEX = 256

// color = primary design color; dark = cutout areas (eye sockets and pupils, matching the pick background).
export function drawPickFace(ctx: CanvasRenderingContext2D, kind: PickKind, color: string, dark: string) {
  const N = PICK_TEX
  ctx.clearRect(0, 0, N, N)
  if (kind === 'none') return
  const s = N * 0.9
  const cx = N / 2
  const cy = N / 2
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.fillStyle = color
  ctx.strokeStyle = color

  if (kind === 'skull') {
    // Skull: rounded cranium with a tapered jaw
    ctx.beginPath()
    ctx.arc(cx, cy - 0.06 * s, 0.3 * s, Math.PI, 0)
    ctx.lineTo(cx + 0.3 * s, cy + 0.1 * s)
    ctx.lineTo(cx + 0.19 * s, cy + 0.19 * s)
    ctx.lineTo(cx + 0.19 * s, cy + 0.33 * s)
    ctx.lineTo(cx - 0.19 * s, cy + 0.33 * s)
    ctx.lineTo(cx - 0.19 * s, cy + 0.19 * s)
    ctx.lineTo(cx - 0.3 * s, cy + 0.1 * s)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = dark
    // Eye sockets
    for (const sx of [-1, 1]) {
      ctx.beginPath()
      ctx.ellipse(cx + sx * 0.14 * s, cy - 0.03 * s, 0.095 * s, 0.11 * s, sx * 0.15, 0, Math.PI * 2)
      ctx.fill()
    }
    // Nasal cavity
    ctx.beginPath()
    ctx.moveTo(cx, cy + 0.06 * s)
    ctx.lineTo(cx - 0.04 * s, cy + 0.15 * s)
    ctx.lineTo(cx + 0.04 * s, cy + 0.15 * s)
    ctx.closePath()
    ctx.fill()
    // Gaps between the teeth
    ctx.strokeStyle = dark
    ctx.lineWidth = 0.022 * s
    for (const x of [-0.095, 0, 0.095]) {
      ctx.beginPath()
      ctx.moveTo(cx + x * s, cy + 0.24 * s)
      ctx.lineTo(cx + x * s, cy + 0.33 * s)
      ctx.stroke()
    }
  } else if (kind === 'eye') {
    // Almond-shaped eye with radiating lines above it
    ctx.lineWidth = 0.04 * s
    ctx.beginPath()
    ctx.moveTo(cx - 0.4 * s, cy + 0.04 * s)
    ctx.quadraticCurveTo(cx, cy - 0.34 * s, cx + 0.4 * s, cy + 0.04 * s)
    ctx.quadraticCurveTo(cx, cy + 0.38 * s, cx - 0.4 * s, cy + 0.04 * s)
    ctx.closePath()
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(cx, cy + 0.03 * s, 0.155 * s, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = dark
    ctx.beginPath()
    ctx.arc(cx, cy + 0.03 * s, 0.07 * s, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(cx + 0.05 * s, cy - 0.02 * s, 0.028 * s, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = color
    ctx.lineWidth = 0.03 * s
    for (const a of [-0.7, 0, 0.7]) {
      const x = cx + Math.sin(a) * 0.3 * s
      const y = cy - 0.3 * s - Math.cos(a) * 0.02 * s
      ctx.beginPath()
      ctx.moveTo(x, y - 0.03 * s)
      ctx.lineTo(x + Math.sin(a) * 0.08 * s, y - 0.1 * s)
      ctx.stroke()
    }
  } else if (kind === 'star') {
    ctx.beginPath()
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5
      const rr = (i % 2 ? 0.17 : 0.4) * s
      const x = cx + Math.cos(a) * rr
      const y = cy + 0.02 * s + Math.sin(a) * rr
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)
    }
    ctx.closePath()
    ctx.fill()
  } else if (kind === 'flame') {
    ctx.beginPath()
    ctx.moveTo(cx, cy - 0.42 * s)
    ctx.bezierCurveTo(cx + 0.06 * s, cy - 0.22 * s, cx + 0.3 * s, cy - 0.12 * s, cx + 0.3 * s, cy + 0.14 * s)
    ctx.bezierCurveTo(cx + 0.3 * s, cy + 0.34 * s, cx + 0.16 * s, cy + 0.42 * s, cx, cy + 0.42 * s)
    ctx.bezierCurveTo(cx - 0.16 * s, cy + 0.42 * s, cx - 0.3 * s, cy + 0.34 * s, cx - 0.3 * s, cy + 0.14 * s)
    ctx.bezierCurveTo(cx - 0.3 * s, cy - 0.02 * s, cx - 0.18 * s, cy - 0.06 * s, cx - 0.16 * s, cy - 0.2 * s)
    ctx.bezierCurveTo(cx - 0.08 * s, cy - 0.16 * s, cx - 0.02 * s, cy - 0.3 * s, cx, cy - 0.42 * s)
    ctx.closePath()
    ctx.fill()
    // Cut out a smaller inner flame to reveal the pick background or gradient
    ctx.globalCompositeOperation = 'destination-out'
    ctx.beginPath()
    ctx.moveTo(cx, cy + 0.02 * s)
    ctx.bezierCurveTo(cx + 0.03 * s, cy + 0.1 * s, cx + 0.14 * s, cy + 0.14 * s, cx + 0.14 * s, cy + 0.27 * s)
    ctx.bezierCurveTo(cx + 0.14 * s, cy + 0.36 * s, cx + 0.06 * s, cy + 0.38 * s, cx, cy + 0.38 * s)
    ctx.bezierCurveTo(cx - 0.06 * s, cy + 0.38 * s, cx - 0.14 * s, cy + 0.36 * s, cx - 0.14 * s, cy + 0.27 * s)
    ctx.bezierCurveTo(cx - 0.14 * s, cy + 0.16 * s, cx - 0.03 * s, cy + 0.12 * s, cx, cy + 0.02 * s)
    ctx.closePath()
    ctx.fill()
    ctx.globalCompositeOperation = 'source-over'
  } else if (kind === 'note') {
    // A pair of beamed eighth notes
    ctx.lineWidth = 0.05 * s
    ctx.lineCap = 'butt'
    for (const x of [-0.2, 0.2]) {
      ctx.beginPath()
      ctx.ellipse(cx + x * s, cy + 0.22 * s, 0.11 * s, 0.08 * s, -0.4, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(cx + (x + 0.095) * s, cy + 0.2 * s)
      ctx.lineTo(cx + (x + 0.095) * s, cy - 0.3 * s)
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.moveTo(cx - 0.105 * s, cy - 0.32 * s)
    ctx.lineTo(cx + 0.295 * s, cy - 0.4 * s)
    ctx.lineTo(cx + 0.295 * s, cy - 0.27 * s)
    ctx.lineTo(cx - 0.105 * s, cy - 0.19 * s)
    ctx.closePath()
    ctx.fill()
  } else if (kind === 'bolt') {
    const pts: [number, number][] = [
      [0.1, -0.4],
      [-0.2, 0.04],
      [-0.01, 0.04],
      [-0.1, 0.4],
      [0.2, -0.07],
      [0.02, -0.07],
    ]
    ctx.beginPath()
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(cx + x * s, cy + y * s) : ctx.moveTo(cx + x * s, cy + y * s)))
    ctx.closePath()
    ctx.fill()
  } else {
    // Vinyl record: two concentric grooves and a center label
    ctx.lineWidth = 0.035 * s
    ctx.beginPath()
    ctx.arc(cx, cy, 0.34 * s, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(cx, cy, 0.22 * s, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(cx, cy, 0.09 * s, 0, Math.PI * 2)
    ctx.fill()
    ctx.lineWidth = 0.03 * s
    ctx.beginPath()
    ctx.arc(cx, cy, 0.28 * s, -Math.PI * 0.85, -Math.PI * 0.45)
    ctx.stroke()
  }
}

// ---------------- Typography-based guitar picks ----------------
// Layouts inspired by the two Toru picks, using our own lettering:
//  word  : large serif title + bold condensed subtitle + small rounded text
//  badge : circular emblem with an icon + script-style name + small text
//  stack : stacked lines of bold condensed text + small text
export type PickIcon = 'skull' | 'eye' | 'record' | 'stripes'
export type PickDesign = {
  layout: 'word' | 'badge' | 'stack'
  ink: string // Color of the lettering and graphics
  hole?: string // Color of cutout areas (usually matches the pick background)
  lines: string[] // word: [title, subtitle, small text]; badge: [name, small text]; stack: stacked lines + final small-text line
  icon?: PickIcon
  dot?: string // word layout: add a colored dot inside the second letter (O)
}

function badgeIcon(ctx: CanvasRenderingContext2D, icon: PickIcon, cx: number, cy: number, r: number, ink: string, hole: string) {
  ctx.fillStyle = ink
  ctx.strokeStyle = ink
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.clip()
  ctx.fillStyle = hole
  ctx.strokeStyle = hole
  if (icon === 'stripes') {
    // Vertical stripes, similar to the circular emblem on the Toru pick
    ctx.fillRect(cx - r * 0.55, cy - r, r * 0.38, r * 2)
    ctx.fillRect(cx + r * 0.1, cy - r, r * 0.24, r * 2)
    ctx.beginPath()
    ctx.moveTo(cx + r * 0.5, cy - r)
    ctx.lineTo(cx + r, cy - r * 0.2)
    ctx.lineTo(cx + r, cy - r)
    ctx.fill()
  } else if (icon === 'skull') {
    for (const sx of [-1, 1]) {
      ctx.beginPath()
      ctx.ellipse(cx + sx * r * 0.36, cy - r * 0.1, r * 0.25, r * 0.29, sx * 0.15, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.beginPath()
    ctx.moveTo(cx, cy + r * 0.12)
    ctx.lineTo(cx - r * 0.1, cy + r * 0.34)
    ctx.lineTo(cx + r * 0.1, cy + r * 0.34)
    ctx.fill()
    ctx.lineWidth = r * 0.07
    for (const x of [-0.26, 0, 0.26]) {
      ctx.beginPath()
      ctx.moveTo(cx + x * r, cy + r * 0.52)
      ctx.lineTo(cx + x * r, cy + r * 0.85)
      ctx.stroke()
    }
  } else if (icon === 'eye') {
    ctx.lineWidth = r * 0.1
    ctx.beginPath()
    ctx.moveTo(cx - r * 0.8, cy)
    ctx.quadraticCurveTo(cx, cy - r * 0.8, cx + r * 0.8, cy)
    ctx.quadraticCurveTo(cx, cy + r * 0.8, cx - r * 0.8, cy)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(cx, cy, r * 0.3, 0, Math.PI * 2)
    ctx.fill()
  } else {
    ctx.lineWidth = r * 0.09
    for (const k of [0.78, 0.52]) {
      ctx.beginPath()
      ctx.arc(cx, cy, r * k, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.arc(cx, cy, r * 0.2, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

export function drawPickDesign(ctx: CanvasRenderingContext2D, d: PickDesign) {
  const N = PICK_TEX
  ctx.clearRect(0, 0, N, N)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = d.ink
  const hole = d.hole ?? '#000'
  const SERIF = 'Georgia, "Times New Roman", serif'
  const CONDENSED = 'Impact, "Arial Narrow", "Haettenschweiler", sans-serif'
  const ROUND = '"Arial Rounded MT Bold", "Trebuchet MS", Verdana, sans-serif'
  const SCRIPT = '"Brush Script MT", "Snell Roundhand", "Apple Chancery", cursive'
  // Keep the text width within maxW
  const fit = (text: string, font: (px: number) => string, px: number, maxW: number) => {
    ctx.font = font(px)
    const w = ctx.measureText(text).width
    if (w > maxW) px *= maxW / w
    ctx.font = font(px)
  }

  if (d.layout === 'word') {
    const [title, sub, tag] = d.lines
    fit(title, (p) => `bold ${p}px ${SERIF}`, 84, 176)
    ctx.fillText(title, N / 2, N * 0.34)
    if (d.dot && title.length > 1) {
      const px = parseFloat(ctx.font.match(/(\d+(?:\.\d+)?)px/)![1])
      const total = ctx.measureText(title).width
      const left = N / 2 - total / 2
      const before = ctx.measureText(title[0]).width
      const ow = ctx.measureText(title[1]).width
      const ox = left + before + ow / 2
      const oy = N * 0.34 - px * 0.02
      ctx.fillStyle = d.dot
      ctx.beginPath()
      ctx.arc(ox, oy, px * 0.1, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = d.ink
    }
    fit(sub, (p) => `${p}px ${CONDENSED}`, 30, 150)
    ctx.fillText(sub, N / 2, N * 0.52)
    fit(tag, (p) => `${p}px ${ROUND}`, 26, 130)
    ctx.fillText(tag, N / 2, N * 0.68)
  } else if (d.layout === 'badge') {
    const [name, tag] = d.lines
    badgeIcon(ctx, d.icon ?? 'stripes', N / 2, N * 0.3, 48, d.ink, hole)
    ctx.fillStyle = d.ink
    ctx.save()
    ctx.translate(N / 2, N * 0.58)
    ctx.rotate(-0.08)
    fit(name, (p) => `italic ${p}px ${SCRIPT}`, 56, 140)
    ctx.fillText(name, 0, 0)
    ctx.restore()
    fit(tag, (p) => `${p}px ${ROUND}`, 30, 130)
    ctx.save()
    ctx.translate(N / 2, N * 0.7)
    ctx.rotate(-0.08)
    ctx.fillText(tag, 0, 0)
    ctx.restore()
  } else {
    const rows = d.lines.slice(0, -1)
    const tag = d.lines[d.lines.length - 1]
    const rowH = 54
    const y0 = N * 0.4 - ((rows.length - 1) * rowH) / 2
    rows.forEach((t, i) => {
      fit(t, (p) => `${p}px ${CONDENSED}`, 58, 150)
      ctx.fillText(t, N / 2, y0 + i * rowH)
    })
    fit(tag, (p) => `${p}px ${ROUND}`, 24, 120)
    ctx.fillText(tag, N / 2, y0 + (rows.length - 1) * rowH + 40)
  }
}
