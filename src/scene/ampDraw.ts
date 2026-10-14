// 功放面板上的所有 2D 画面，纯 canvas，不依赖 three，方便单独预览。

export const DISPLAY_W = 1024
export const DISPLAY_H = 256
// 进度灯条在显示屏画布里的位置（点击跳转时要用）
export const BAR = { x0: 40, x1: 984, y0: 188, y1: 240, segments: 48 }

const MONO = "ui-monospace, Menlo, Consolas, 'Courier New', monospace"

export interface DisplayState {
  title: string
  time: string
  duration: string
  progress: number // 0..1
  playing: boolean
  hasTrack: boolean
  error: string | null
}

function fit(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  if (ctx.measureText(text).width <= maxW) return text
  let t = text
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1)
  return t + '…'
}

export function drawDisplay(ctx: CanvasRenderingContext2D, s: DisplayState) {
  const W = DISPLAY_W
  const H = DISPLAY_H

  ctx.fillStyle = '#0a0418'
  ctx.fillRect(0, 0, W, H)

  // 轻微的扫描线
  ctx.fillStyle = 'rgba(255,255,255,0.025)'
  for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1)

  ctx.textBaseline = 'alphabetic'

  // 第一行：曲名（没有曲子时给提示）
  ctx.shadowBlur = 14
  if (s.error) {
    ctx.fillStyle = '#ff9ad8'
    ctx.shadowColor = '#ff4fd8'
    ctx.font = `600 54px ${MONO}`
    ctx.fillText(fit(ctx, s.error, W - 80), 40, 92)
  } else if (s.hasTrack) {
    ctx.fillStyle = '#35f2ff'
    ctx.shadowColor = '#35f2ff'
    ctx.font = `700 74px ${MONO}`
    ctx.fillText(fit(ctx, s.title, W - 80), 40, 92)
  } else {
    ctx.fillStyle = 'rgba(53,242,255,0.55)'
    ctx.shadowColor = '#35f2ff'
    ctx.font = `700 74px ${MONO}`
    ctx.fillText('NO RECORD', 40, 92)
  }

  // 第二行：时间 + 状态
  ctx.fillStyle = s.hasTrack ? '#ff4fd8' : 'rgba(255,79,216,0.4)'
  ctx.shadowColor = '#ff4fd8'
  ctx.font = `600 52px ${MONO}`
  ctx.fillText(s.hasTrack ? `${s.time} / ${s.duration}` : '--:-- / --:--', 40, 152)
  ctx.textAlign = 'right'
  ctx.fillText(s.playing ? 'PLAY' : s.hasTrack ? 'PAUSE' : 'IDLE', W - 40, 152)
  ctx.textAlign = 'left'
  ctx.shadowBlur = 0

  // 进度灯条：48 格，亮的部分从粉渐变到青
  const { x0, x1, y0, y1, segments } = BAR
  const gap = 4
  const segW = (x1 - x0 - gap * (segments - 1)) / segments
  const lit = Math.round(s.progress * segments)
  for (let i = 0; i < segments; i++) {
    const x = x0 + i * (segW + gap)
    if (s.hasTrack && i < lit) {
      const t = i / (segments - 1)
      const r = Math.round(255 + (53 - 255) * t)
      const g = Math.round(79 + (242 - 79) * t)
      const b = Math.round(216 + (255 - 216) * t)
      ctx.fillStyle = `rgb(${r},${g},${b})`
      ctx.shadowColor = `rgb(${r},${g},${b})`
      ctx.shadowBlur = 8
    } else {
      ctx.fillStyle = '#2a1450'
      ctx.shadowBlur = 0
    }
    ctx.fillRect(x, y0, segW, y1 - y0)
  }
  ctx.shadowBlur = 0
}

// 按钮上的小标签
export function drawPlate(ctx: CanvasRenderingContext2D, w: number, h: number, text: string, color = '#d9ccff') {
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = color
  ctx.font = `700 ${Math.round(h * 0.5)}px ${MONO}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, w / 2, h / 2 + 2)
}

// 播放旋钮上的图标：播放时显示暂停符号，暂停时显示播放三角
export function drawPlayIcon(ctx: CanvasRenderingContext2D, size: number, playing: boolean) {
  ctx.clearRect(0, 0, size, size)
  ctx.fillStyle = '#140a3a'
  const c = size / 2
  if (playing) {
    const bw = size * 0.12
    const bh = size * 0.36
    ctx.fillRect(c - bw * 1.7, c - bh / 2, bw, bh)
    ctx.fillRect(c + bw * 0.7, c - bh / 2, bw, bh)
  } else {
    ctx.beginPath()
    ctx.moveTo(c - size * 0.1, c - size * 0.2)
    ctx.lineTo(c - size * 0.1, c + size * 0.2)
    ctx.lineTo(c + size * 0.2, c)
    ctx.closePath()
    ctx.fill()
  }
}
