import { useEffect, useRef, useState } from 'react'
import { useCoverStore } from '../state/coverStore'
import { generatedCoverDataUrl, imageToCoverDataUrl } from './coverGen'

// 点墙上的封套弹出来：上传自己的图，或者随机生成一张
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
      setError('请选一张图片（png / jpg / webp）')
      return
    }
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      try {
        setDraft(imageToCoverDataUrl(img))
        setError('')
      } catch {
        setError('这张图读不了，换一张试试')
      }
      URL.revokeObjectURL(url)
    }
    img.onerror = () => {
      setError('这张图读不了，换一张试试')
      URL.revokeObjectURL(url)
    }
    img.src = url
  }

  return (
    <div className="cover-ed" onClick={closeEditor}>
      <div className="cover-ed__card" onClick={(e) => e.stopPropagation()}>
        <div className="cover-ed__title">封套 {editing + 1}</div>
        <div className="cover-ed__preview">
          {preview ? <img src={preview} alt="封面预览" /> : <span>还是默认封面，上传或生成一张吧</span>}
        </div>
        {error && <div className="cover-ed__err">{error}</div>}
        <div className="cover-ed__row">
          <button onClick={() => fileRef.current?.click()}>上传图片</button>
          <button onClick={roll}>随机生成</button>
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
            用这张
          </button>
          <button
            disabled={!current && !draft}
            onClick={() => {
              clearCover(editing)
              closeEditor()
            }}
          >
            恢复默认
          </button>
          <button onClick={closeEditor}>关闭</button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      </div>
    </div>
  )
}
