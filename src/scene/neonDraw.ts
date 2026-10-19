// Neon sign lettering drawn with canvas. Pink and cyan use separate images so they can flicker independently.
export const NEON_W = 2048
export const NEON_H = 256
export const NEON_TEXT = ['NO MUSIC', 'NO LIFE'] as const

const FONT = "800 168px 'Arial Rounded MT Bold', 'Hiragino Maru Gothic ProN', 'Helvetica Neue', Arial, sans-serif"

// which: 0 = NO MUSIC (pink), 1 = NO LIFE (cyan). Both phrases have fixed positions on the same line.
// Position letters manually instead of using ctx.letterSpacing, which older Safari versions do not support.
const TRACK = 0.16 // Letter spacing as a multiple of font size
const WORD_GAP = 0.9 // Word spacing as a multiple of font size

function layout(ctx: CanvasRenderingContext2D, size: number) {
  ctx.font = FONT.replace('168px', `${size}px`)
  const track = size * TRACK
  const wordW = NEON_TEXT.map((w) => [...w].reduce((sum, ch) => sum + ctx.measureText(ch).width + track, -track))
  const total = wordW[0] + size * WORD_GAP + wordW[1]
  return { track, wordW, total }
}

export function drawNeon(ctx: CanvasRenderingContext2D, which: 0 | 1) {
  const W = NEON_W
  const H = NEON_H
  ctx.clearRect(0, 0, W, H)
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  // Scale the font size to fit the full line within the available width
  let size = 168
  let l = layout(ctx, size)
  const maxW = W - 120
  if (l.total > maxW) {
    size = Math.floor((size * maxW) / l.total)
    l = layout(ctx, size)
  }
  const x0 = (W - l.total) / 2 + (which === 0 ? 0 : l.wordW[0] + size * WORD_GAP)
  const y = H / 2 + 6
  const text = NEON_TEXT[which]
  const color = which === 0 ? '#ff4fd8' : '#35f2ff'
  const core = which === 0 ? '#ffe3f7' : '#e2fdff'

  const stroke = () => {
    let x = x0
    for (const ch of text) {
      ctx.strokeText(ch, x, y)
      x += ctx.measureText(ch).width + l.track
    }
  }

  // Outer glow
  ctx.strokeStyle = color
  ctx.shadowColor = color
  ctx.shadowBlur = 46
  ctx.lineWidth = 12
  stroke()
  stroke()
  // Tube body
  ctx.shadowBlur = 16
  ctx.lineWidth = 9
  stroke()
  // Bright core at the center of the tube
  ctx.shadowBlur = 0
  ctx.strokeStyle = core
  ctx.lineWidth = 3
  stroke()
}

// Halo around the pick frame: a pink-to-cyan gradient covered by the frame, leaving only its outer edge visible
export const GLOW_SIZE = 512
export function drawGlowFrame(ctx: CanvasRenderingContext2D, inner: number) {
  const N = GLOW_SIZE
  ctx.clearRect(0, 0, N, N)
  const a = (N - inner) / 2
  const g = ctx.createLinearGradient(a, a, N - a, N - a)
  g.addColorStop(0, '#ff4fd8')
  g.addColorStop(1, '#35f2ff')
  ctx.strokeStyle = g
  ctx.shadowColor = '#b36bff'
  ctx.lineWidth = 12
  ctx.lineJoin = 'round'
  for (const blur of [90, 60, 30]) {
    ctx.shadowBlur = blur
    ctx.strokeRect(a, a, inner, inner)
  }
}

// ---------------- VINYL LAB title sign ----------------
// Letters use custom single-line neon tubes with rounded geometric shapes, without font files.
export const TITLE_W = 2048
export const TITLE_H = 420

// Each letter width relative to letter height h
const GLYPH_W: Record<string, number> = { V: 0.8, I: 0, N: 0.7, Y: 0.78, L: 0.55, A: 0.82, B: 0.47 }

// Trace a letter at (x, y), where y is its top and h is its height. The caller strokes the combined paths.
function glyph(ctx: CanvasRenderingContext2D, ch: string, x: number, y: number, h: number) {
  const w = GLYPH_W[ch] * h
  ctx.beginPath()
  switch (ch) {
    case 'V':
      ctx.moveTo(x, y)
      ctx.lineTo(x + w / 2, y + h)
      ctx.lineTo(x + w, y)
      break
    case 'I':
      ctx.moveTo(x, y)
      ctx.lineTo(x, y + h)
      break
    case 'N':
      ctx.moveTo(x, y + h)
      ctx.lineTo(x, y)
      ctx.lineTo(x + w, y + h)
      ctx.lineTo(x + w, y)
      break
    case 'Y':
      ctx.moveTo(x, y)
      ctx.lineTo(x + w / 2, y + h * 0.52)
      ctx.lineTo(x + w, y)
      ctx.moveTo(x + w / 2, y + h * 0.52)
      ctx.lineTo(x + w / 2, y + h)
      break
    case 'L':
      ctx.moveTo(x, y)
      ctx.lineTo(x, y + h)
      ctx.lineTo(x + w, y + h)
      break
    case 'A':
      ctx.moveTo(x, y + h)
      ctx.lineTo(x + w / 2, y)
      ctx.lineTo(x + w, y + h)
      ctx.moveTo(x + w * 0.22, y + h * 0.66)
      ctx.lineTo(x + w * 0.78, y + h * 0.66)
      break
    case 'B': {
      const r = h / 4
      const bx = w - r
      ctx.moveTo(x, y)
      ctx.lineTo(x, y + h)
      ctx.moveTo(x, y)
      ctx.lineTo(x + bx, y)
      ctx.arc(x + bx, y + r, r, -Math.PI / 2, Math.PI / 2)
      ctx.lineTo(x, y + 2 * r)
      ctx.moveTo(x + 0.0, y + 2 * r)
      ctx.lineTo(x + bx, y + 2 * r)
      ctx.arc(x + bx, y + 3 * r, r, -Math.PI / 2, Math.PI / 2)
      ctx.lineTo(x, y + h)
      break
    }
  }
  ctx.stroke()
  return w
}

// Tube: multiple strokes for the outer glow, tube body, and bright core. k scales relative to letter height.
function tube(ctx: CanvasRenderingContext2D, color: string, core: string, draw: () => void, k: number) {
  ctx.strokeStyle = color
  ctx.shadowColor = color
  ctx.shadowBlur = 46 * k
  ctx.lineWidth = 14 * k
  draw()
  draw()
  ctx.shadowBlur = 16 * k
  ctx.lineWidth = 10 * k
  draw()
  ctx.shadowBlur = 0
  ctx.strokeStyle = core
  ctx.lineWidth = 3.5 * k
  draw()
}

// layer 0 = pink (record icon + VINYL), layer 1 = cyan (LAB + subtitle)
// Scale the lettering to fill the canvas width so it matches the sign width.
export function drawTitle(ctx: CanvasRenderingContext2D, layer: 0 | 1) {
  const W = TITLE_W
  ctx.clearRect(0, 0, W, TITLE_H)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  // Express each section width as a multiple of letter height h, then solve for h to fill the line
  const GAP = 0.26 // Letter spacing
  const wordK = (t: string) => [...t].reduce((sum, ch) => sum + GLYPH_W[ch] + GAP, -GAP)
  const ICON = 1.0
  const GAP1 = 0.4 // Icon-to-text gap
  const GAP2 = 0.7 // Gap between VINYL and LAB
  const totalK = ICON + GAP1 + wordK('VINYL') + GAP2 + wordK('LAB')
  const h = (W - 110) / totalK
  const k = h / 128 // Tube thickness scale
  const gap = h * GAP
  const iconR = (h * ICON) / 2
  const x0 = 55
  const top = 56
  const cy = top + h / 2

  const word = (t: string, x: number) => () => {
    let px = x
    for (const ch of t) px += glyph(ctx, ch, px, top, h) + gap
  }
  const w0 = wordK('VINYL') * h

  if (layer === 0) {
    const cx = x0 + iconR
    tube(
      ctx,
      '#ff4fd8',
      '#ffe3f7',
      () => {
        ctx.beginPath()
        ctx.arc(cx, cy, iconR, 0, Math.PI * 2)
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(cx, cy, iconR * 0.4, 0, Math.PI * 2)
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(cx, cy, iconR * 0.7, -Math.PI * 0.85, -Math.PI * 0.45)
        ctx.stroke()
      },
      k,
    )
    tube(ctx, '#ff4fd8', '#ffe3f7', word('VINYL', x0 + h * (ICON + GAP1)), k)
  } else {
    const lx = x0 + h * (ICON + GAP1) + w0 + h * GAP2
    tube(ctx, '#35f2ff', '#e2fdff', word('LAB', lx), k)
    // Subtitle: thinner strokes and wide spacing, aligned with the width of the line above
    const sub = 'LISTENING BOOTH'
    const ss = h * 0.27
    ctx.font = `700 ${ss}px 'Helvetica Neue', Arial, sans-serif`
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'
    const base = [...sub].reduce((sum, ch) => sum + ctx.measureText(ch).width, 0)
    const st = (W - 110 - base) / (sub.length - 1) // Letter spacing to make the subtitle fill the line
    const y = top + h + h * 0.42
    const draw = (fill: boolean) => {
      let sx = x0
      for (const ch of sub) {
        if (fill) ctx.fillText(ch, sx, y)
        else ctx.strokeText(ch, sx, y)
        sx += ctx.measureText(ch).width + st
      }
    }
    ctx.strokeStyle = '#35f2ff'
    ctx.shadowColor = '#35f2ff'
    ctx.shadowBlur = 30 * k
    ctx.lineWidth = 5 * k
    draw(false)
    ctx.shadowBlur = 0
    ctx.fillStyle = '#e8fdff'
    draw(true)
  }
}
