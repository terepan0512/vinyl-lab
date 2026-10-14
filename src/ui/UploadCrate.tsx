import { useRef, useState } from 'react'
import { usePlayerStore } from '../state/playerStore'

interface Props {
  compact?: boolean
}

export default function UploadCrate({ compact = false }: Props) {
  const loadFile = usePlayerStore((s) => s.loadFile)
  const error = usePlayerStore((s) => s.error)
  const [over, setOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const className = ['crate', compact && 'crate--compact', over && 'crate--over']
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={className}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const file = e.dataTransfer.files[0]
        if (file) loadFile(file)
      }}
    >
      <input
        ref={inputRef}
        type="file"
        hidden
        accept=".mp3,.wav,audio/mpeg,audio/wav"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) loadFile(file)
          e.target.value = ''
        }}
      />
      <button
        type="button"
        className="crate__button"
        onClick={() => inputRef.current?.click()}
      >
        {compact ? 'Swap record' : 'Drop a record here'}
      </button>
      {!compact && (
        <p className="crate__hint">or click to choose an MP3 or WAV file</p>
      )}
      {error && (
        <p role="alert" className="crate__error">
          {error}
        </p>
      )}
    </div>
  )
}