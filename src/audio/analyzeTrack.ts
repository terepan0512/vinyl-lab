import type { TrackAnalysis } from './musicColorAnalysis'
import type { AudioFeaturePayload } from './spectralFeatures'
import type { PersonalColorModel } from './personalColorModel'

type ServiceMessage = { type: 'progress'; progress: number }
  | { type: 'result'; features: AudioFeaturePayload }
  | { type: 'error'; error: string }

/** Read real extraction progress from the loopback Python/librosa service. */
export async function analyzeTrack(file: File, signal: AbortSignal, onProgress: (progress: number) => void,
  personalModel?: PersonalColorModel | null): Promise<TrackAnalysis> {
  if (file.size > 128 * 1024 * 1024) throw new Error('Choose an audio file smaller than 128 MB.')
  let response: Response
  try {
    response = await fetch('/api/analyze', { method: 'POST', body: file, signal,
      headers: { 'Content-Type': 'application/octet-stream' } })
  } catch (error) {
    if (signal.aborted) throw error
    throw new Error('Start the local analysis service with npm run analysis, then try again.', { cause: error })
  }
  if (!response.ok || !response.body) throw new Error('Analysis service unavailable. Run npm run analysis and try again.')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let text = ''
  let features: AudioFeaturePayload | null = null
  const consume = (line: string) => {
    if (!line.trim()) return
    const message = JSON.parse(line) as ServiceMessage
    if (message.type === 'progress') onProgress(Math.max(0, Math.min(0.85, message.progress * 0.85)))
    if (message.type === 'result') features = message.features
    if (message.type === 'error') throw new Error(message.error)
  }
  try {
    while (true) {
      const part = await reader.read()
      text += decoder.decode(part.value, { stream: !part.done })
      let newline: number
      while ((newline = text.indexOf('\n')) >= 0) {
        consume(text.slice(0, newline))
        text = text.slice(newline + 1)
      }
      if (part.done) break
    }
    consume(text)
  } finally {
    reader.releaseLock()
  }
  if (!features) throw new Error('The analysis service returned no measurements.')
  if (signal.aborted) throw new DOMException('Analysis cancelled', 'AbortError')
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./color.worker.ts', import.meta.url), { type: 'module' })
    const clean = () => { signal.removeEventListener('abort', abort); worker.terminate() }
    const abort = () => { clean(); reject(new DOMException('Analysis cancelled', 'AbortError')) }
    signal.addEventListener('abort', abort, { once: true })
    worker.onerror = () => { clean(); reject(new Error('Color mapping failed.')) }
    worker.onmessage = (event: MessageEvent) => {
      if (event.data.type === 'progress') onProgress(0.85 + event.data.progress * 0.15)
      if (event.data.type === 'result') { clean(); resolve(event.data.analysis as TrackAnalysis) }
      if (event.data.type === 'error') { clean(); reject(new Error('Color mapping failed.')) }
    }
    if (signal.aborted) { abort(); return }
    worker.postMessage({ features, personalModel })
  })
}
