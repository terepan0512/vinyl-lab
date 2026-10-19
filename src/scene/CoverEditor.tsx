import { useEffect, useRef, useState } from 'react'
import { useCoverStore } from '../state/coverStore'
import { generatedCoverDataUrl, imageToCoverDataUrl } from './coverGen'

// Open from a wall cover to upload an image or generate a random cover
export default function CoverEditor() {
  const editing = useCoverStore((s) => s.editing)
  const current = useCoverStore((s) => (s.editing === null ? undefined : s.covers[s.editing]))
  const { closeEditor, setCover, clearCover } = useCoverStore.getState()
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState('')
  const seed = useRef(Date.now() % 100000)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setDraft(null)
    setError('')
  }, [editing])

  useEffect(() => {
    if (editing === null) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && useCoverStore.getState().closeEditor()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editing])

  if (editing === null) return null
  const preview = draft ?? current ?? null

  const roll = () => {
    seed.current += 1 + Math.floor(Math.random() * 50)
    setDraft(generatedCoverDataUrl(seed.current))
    setError('')
  }

  const onFile = (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Choose an image (PNG / JPG / WebP)')
      return
    }
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      try {
        setDraft(imageToCoverDataUrl(img))
        setError('')
      } catch {
        setError('Unable to read this image. Try another one.')
      }
      URL.revokeObjectURL(url)
    }
    img.onerror = () => {
      setError('Unable to read this image. Try another one.')
      URL.revokeObjectURL(url)
    }
    img.src = url
  }

  return (
    <div className="cover-ed" onClick={closeEditor}>
      <div className="cover-ed__card" onClick={(e) => e.stopPropagation()}>
        <div className="cover-ed__title">Cover {editing + 1}</div>
        <div className="cover-ed__preview">
          {preview ? <img src={preview} alt="Cover preview" /> : <span>Upload an image or generate a cover to replace the default.</span>}
        </div>
        {error && <div className="cover-ed__err">{error}</div>}
        <div className="cover-ed__row">
          <button onClick={() => fileRef.current?.click()}>Upload Image</button>
          <button onClick={roll}>Generate Random Cover</button>
        </div>
        <div className="cover-ed__row">
          <button
            className="primary"
            disabled={!draft}
            onClick={() => {
              if (draft) setCover(editing, draft)
              closeEditor()
            }}
          >
            Apply Cover
          </button>
          <button
            disabled={!current && !draft}
            onClick={() => {
              clearCover(editing)
              closeEditor()
            }}
          >
            Reset to Default
          </button>
          <button onClick={closeEditor}>Close</button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      </div>
    </div>
  )
}
