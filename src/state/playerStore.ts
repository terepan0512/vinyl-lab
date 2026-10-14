
import { create } from 'zustand'
import { AudioEngine } from '../audio/AudioEngine'

export type PlayerStatus = 'idle' | 'ready' | 'playing' | 'paused'

export interface TrackInfo {
  title: string
  fileName: string
  format: string
  sizeMB: number
}

interface PlayerState {
  status: PlayerStatus
  track: TrackInfo | null
  currentTime: number
  duration: number
  error: string | null
  loadFile: (file: File) => void
  toggle: () => Promise<void>
  seek: (seconds: number) => void
}

export const engine = new AudioEngine()

const ACCEPTED_EXT = ['mp3', 'wav']

function getExt(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? ''
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  status: 'idle',
  track: null,
  currentTime: 0,
  duration: 0,
  error: null,

  loadFile: (file) => {
    const ext = getExt(file.name)
    if (!ACCEPTED_EXT.includes(ext)) {
      set({ error: 'Only MP3 and WAV files are supported.' })
      return
    }
    engine.pause()
    engine.load(file)
    set({
      status: 'ready',
      error: null,
      currentTime: 0,
      duration: 0,
      track: {
        title: file.name.replace(/\.[^.]+$/, ''),
        fileName: file.name,
        format: ext.toUpperCase(),
        sizeMB: Number((file.size / 1024 / 1024).toFixed(2)),
      },
    })
  },

  toggle: async () => {
    const { status } = get()
    if (status === 'idle') return
    if (status === 'playing') {
      engine.pause()
      return
    }
    try {
      await engine.play()
    } catch {
      set({ error: 'Playback failed. Please select the file again.' })
    }
  },

  seek: (seconds) => {
    engine.seek(seconds)
    set({ currentTime: seconds })
  },
}))

const el = engine.element
el.addEventListener('loadedmetadata', () =>
  usePlayerStore.setState({ duration: el.duration }),
)
el.addEventListener('timeupdate', () =>
  usePlayerStore.setState({ currentTime: el.currentTime }),
)
el.addEventListener('play', () => usePlayerStore.setState({ status: 'playing' }))
el.addEventListener('pause', () => {
  if (el.ended) return
  usePlayerStore.setState({ status: 'paused' })
})
el.addEventListener('ended', () =>
  usePlayerStore.setState({ status: 'paused', currentTime: 0 }),
)
