import type { CSSProperties } from 'react'
import { usePlayerStore } from '../state/playerStore'
import UploadCrate from './UploadCrate'

function formatTime(s: number): string {
  if (!Number.isFinite(s)) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export default function Sleeve() {
  const { status, track, currentTime, duration, toggle, seek } = usePlayerStore()
  const playing = status === 'playing'
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  if (!track) {
    return (
      <section className="sleeve" aria-label="Turntable">
        <p className="sleeve__empty">Nothing on the platter yet.</p>
        <UploadCrate />
      </section>
    )
  }

  return (
    <section className="sleeve" aria-label="Now spinning">
      <h2 className="sleeve__title">{track.title}</h2>

      <dl className="notes">
        <div>
          <dt>Format</dt>
          <dd>{track.format}</dd>
        </div>
        <div>
          <dt>Length</dt>
          <dd>{formatTime(duration)}</dd>
        </div>
        <div>
          <dt>Size</dt>
          <dd>{track.sizeMB} MB</dd>
        </div>
      </dl>

      <div className="player">
        <button
          type="button"
          className="sticker"
          aria-pressed={playing}
          onClick={() => void toggle()}
        >
          {playing ? 'Pause' : 'Play'}
        </button>
        <div className="times">
          <span>{formatTime(currentTime)}</span>
          <span>of {formatTime(duration)}</span>
        </div>
      </div>

      <input
        className="groove"
        type="range"
        aria-label="Playback position"
        min={0}
        max={duration || 0}
        step={0.1}
        value={currentTime}
        onChange={(e) => seek(Number(e.target.value))}
        style={{ '--progress': `${progress}%` } as CSSProperties}
      />

      <UploadCrate compact />
    </section>
  )
}