
import { create } from 'zustand'

// Cover artwork for the 8 record sleeves displayed on the wall.
// Uploaded or generated images (stored as data URLs) are persisted
// in IndexedDB and remain available after a page refresh.
const DB = 'vinyl-lab'
const STORE = 'covers'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function dbAll(): Promise<Record<number, string>> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const out: Record<number, string> = {}
    const req = db.transaction(STORE).objectStore(STORE).openCursor()
    req.onsuccess = () => {
      const c = req.result
      if (c) {
        out[Number(c.key)] = c.value as string
        c.continue()
      } else resolve(out)
    }
    req.onerror = () => reject(req.error)
  })
}

async function dbSet(i: number, url: string | null) {
  const db = await open()
  const tx = db.transaction(STORE, 'readwrite')
  if (url) tx.objectStore(STORE).put(url, i)
  else tx.objectStore(STORE).delete(i)
}

interface CoverState {
  covers: Record<number, string>
  editing: number | null
  openEditor: (i: number) => void
  closeEditor: () => void
  setCover: (i: number, url: string) => void
  clearCover: (i: number) => void
}

export const useCoverStore = create<CoverState>((set) => ({
  covers: {},
  editing: null,
  openEditor: (i) => set({ editing: i }),
  closeEditor: () => set({ editing: null }),
  setCover: (i, url) => {
    set((s) => ({ covers: { ...s.covers, [i]: url } }))
    dbSet(i, url).catch(() => {})
  },
  clearCover: (i) => {
    set((s) => {
      const covers = { ...s.covers }
      delete covers[i]
      return { covers }
    })
    dbSet(i, null).catch(() => {})
  },
}))

// Restore previously saved cover artwork on startup.
// Silently ignore storage errors, such as when IndexedDB
// is unavailable or restricted in private browsing mode.
dbAll()
  .then((covers) => useCoverStore.setState((s) => ({ covers: { ...covers, ...s.covers } })))
  .catch(() => {})
