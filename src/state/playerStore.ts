
import { create } from 'zustand'
import { AudioEngine } from '../audio/AudioEngine'
import { analyzeTrack } from '../audio/analyzeTrack'
import { buildMusicColors, type ColorModelId, type TrackAnalysis } from '../audio/musicColorAnalysis'
import { isPersonalColorModel, type PersonalColorModel } from '../audio/personalColorModel'
import { refreshTrackModels } from '../audio/refreshTrackModels'

export const PERSONAL_MODEL_STORAGE = 'vinyl-personal-color-model-v1'
function savedPersonalModel(): PersonalColorModel | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(PERSONAL_MODEL_STORAGE) ?? 'null')
    return isPersonalColorModel(value) ? value : null
  } catch { return null }
}

export type PlayerStatus = 'idle' | 'analyzing' | 'ready' | 'playing' | 'paused' | 'error'

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
  analysis: TrackAnalysis | null
  analysisProgress: number
  selectedModel: ColorModelId
  personalModel: PersonalColorModel | null
  selectModel: (model: ColorModelId) => void
  refreshAnalysis: (force?: boolean) => void
  applyPersonalModel: (model: PersonalColorModel | null) => void
  loadFile: (file: File) => Promise<void>
  toggle: () => Promise<void>
  seek: (seconds: number) => void
}

export const engine = new AudioEngine()

const ACCEPTED_EXT = ['mp3', 'wav']
let analysisController: AbortController | null = null

function getExt(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? ''
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  status: 'idle',
  track: null,
  currentTime: 0,
  duration: 0,
  error: null,
  analysis: null,
  analysisProgress: 0,
  selectedModel: 'A',
  personalModel: savedPersonalModel(),

  selectModel: (model) => {
    const analysis = get().analysis
    const colors = analysis?.models[model]
    if (analysis && colors) set({ selectedModel: model, analysis: { ...analysis, colors } })
  },

  refreshAnalysis: (force = false) => {
    const { analysis, selectedModel } = get()
    if (!analysis) return
    const refreshed = refreshTrackModels(analysis, selectedModel, force, get().personalModel)
    if (refreshed !== analysis) set({ analysis: refreshed })
  },

  applyPersonalModel: (personalModel) => {
    const analysis = get().analysis
    if (!analysis) { set({ personalModel }); return }
    const b = personalModel && (personalModel.scopes.identity || personalModel.scopes.time)
      ? buildMusicColors(analysis.features, undefined, { model: 'B', personalModel }) : null
    const models = { ...analysis.models, B: b }
    const selectedModel = get().selectedModel === 'B' && !b ? 'A' : get().selectedModel
    set({ personalModel, selectedModel, analysis: { ...analysis, models, colors: models[selectedModel]! } })
  },

  loadFile: async (file) => {
    const ext = getExt(file.name)
    if (!ACCEPTED_EXT.includes(ext)) {
      set({ error: 'Only MP3 and WAV files are supported.' })
      return
    }
    analysisController?.abort()
    const controller = new AbortController()
    analysisController = controller
    engine.pause()
    set({
      status: 'analyzing',
      analysis: null,
      analysisProgress: 0,
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
    engine.load(file)
    try {
      const submittedModel = get().personalModel
      const analysis = await analyzeTrack(file, controller.signal, progress => {
        if (!controller.signal.aborted) set({ analysisProgress: progress })
      }, submittedModel)
      if (!controller.signal.aborted) {
        const latest = get().personalModel
        if (latest !== submittedModel) {
          analysis.models.B = latest && (latest.scopes.identity || latest.scopes.time)
            && latest.extractorVersion === analysis.features.extractorVersion
            ? buildMusicColors(analysis.features, undefined, { model: 'B', personalModel: latest }) : null
        }
        const selectedModel = analysis.models[get().selectedModel] ? get().selectedModel : 'A'
        set({ analysis: { ...analysis, colors: analysis.models[selectedModel]! }, selectedModel, analysisProgress: 1, status: 'ready' })
      }
    } catch (error) {
      if (!controller.signal.aborted) set({ status: 'error', error: error instanceof Error ? error.message : 'Audio analysis failed. Please select the file again.' })
    } finally {
      if (analysisController === controller) analysisController = null
    }
  },

  toggle: async () => {
    const { status } = get()
    if (status !== 'ready' && status !== 'paused' && status !== 'playing') return
    if (!get().analysis) return
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
  if (!el.ended && usePlayerStore.getState().status === 'playing') {
    usePlayerStore.setState({ status: 'paused' })
  }
})
el.addEventListener('ended', () =>
  usePlayerStore.setState({ status: 'paused', currentTime: el.currentTime }),
)
