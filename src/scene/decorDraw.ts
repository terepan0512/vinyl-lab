// 三张演出海报，纯 canvas，512 × 720。
export const POSTER_W = 512
export const POSTER_H = 720

const DISPLAY = "900 76px Impact, Haettenschweiler, 'Arial Black', sans-serif"
const MONO = "ui-monospace, Menlo, Consolas, 'Courier New', monospace"

export function drawPoster(ctx: CanvasRenderingContext2D, kind: number) {
  const W = POSTER_W
  const H = POSTER_H
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'

  if (kind === 0) {
    // NEON NIGHTS：复古落日加网格地面
    const bg = ctx.createLinearGradient(0, 0, 0, H)
    bg.addColorStop(0, '#140a3a')
    bg.addColorStop(0.5, '#4a1fb8')
    bg.addColorStop(0.75, '#d02fa8')
    bg.addColorStop(1, '#ff7ac8')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, W, H)

    const sun = ctx.createLinearGradient(0, 180, 0, 440)
    sun.addColorStop(0, '#ffe36b')
    sun.addColorStop(1, '#ff4fb0')
    ctx.fillStyle = sun
    ctx.beginPath()
    ctx.arc(256, 310, 140, 0, Math.PI * 2)
    ctx.fill()
    // 落日下半部的横向切口
    ctx.fillStyle = '#7a22b8'
    for (let i = 0; i < 6; i++) ctx.fillRect(100, 330 + i * 20, 312, 4 + i * 2)

    // 地平线下的网格
    const horizon = 450
    ctx.fillStyle = '#1a0a48'
    ctx.fillRect(0, horizon, W, H - horizon)
    ctx.strokeStyle = '#35f2ff'
    ctx.lineWidth = 2
    for (let i = -8; i <= 8; i++) {
      ctx.beginPath()
      ctx.moveTo(256 + i * 18, horizon)
      ctx.lineTo(256 + i * 90, H)
      ctx.stroke()
    }
    for (let i = 1; i < 8; i++) {
      const y = horizon + Math.pow(i / 8, 2) * (H - horizon)
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(W, y)
      ctx.stroke()
    }

    ctx.fillStyle = '#ffffff'
    ctx.shadowColor = '#ff4fd8'
    ctx.shadowBlur = 24
    ctx.font = DISPLAY
    ctx.fillText('NEON', 256, 110)
    ctx.fillText('NIGHTS', 256, 190)
    ctx.shadowBlur = 0
    ctx.fillStyle = '#e8dcff'
    ctx.font = `600 26px ${MONO}`
    ctx.fillText('LIVE · FRI 21:00', 256, 690)
  } else if (kind === 1) {
    // LIVE TONIGHT：大号拨片
    ctx.fillStyle = '#0b1f5c'
    ctx.fillRect(0, 0, W, H)
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = i % 2 ? 'rgba(53,242,255,0.07)' : 'rgba(255,79,216,0.07)'
      ctx.fillRect(0, i * 52, W, 26)
    }
    ctx.save()
    ctx.translate(256, 330)
    ctx.scale(250, 270)
    ctx.beginPath()
    ctx.moveTo(0, -0.55)
    ctx.bezierCurveTo(0.12, -0.45, 0.5, 0.05, 0.5, 0.28)
    ctx.bezierCurveTo(0.5, 0.5, 0.3, 0.55, 0, 0.55)
    ctx.bezierCurveTo(-0.3, 0.55, -0.5, 0.5, -0.5, 0.28)
    ctx.bezierCurveTo(-0.5, 0.05, -0.12, -0.45, 0, -0.55)
    ctx.restore()
    ctx.fillStyle = '#ff4fd8'
    ctx.shadowColor = '#ff4fd8'
    ctx.shadowBlur = 30
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.fillStyle = '#0b1f5c'
    ctx.font = DISPLAY
    ctx.fillText('LIVE', 256, 360)
    ctx.fillStyle = '#d8f3ff'
    ctx.font = `700 54px ${MONO}`
    ctx.fillText('TONIGHT', 256, 640)
    ctx.font = `400 26px ${MONO}`
    ctx.fillText('DOORS 20:00', 256, 685)
  } else {
    // VINYL CLUB：同心圆唱片
    ctx.fillStyle = '#0a0620'
    ctx.fillRect(0, 0, W, H)
    for (let r = 230; r > 40; r -= 9) {
      ctx.strokeStyle = r % 18 ? 'rgba(255,79,216,0.5)' : 'rgba(53,242,255,0.45)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(256, 300, r, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.fillStyle = '#c6ff5a'
    ctx.beginPath()
    ctx.arc(256, 300, 62, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#0a0620'
    ctx.beginPath()
    ctx.arc(256, 300, 8, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#efe6ff'
    ctx.font = DISPLAY
    ctx.fillText('VINYL', 256, 610)
    ctx.fillText('CLUB', 256, 685)
  }
}
