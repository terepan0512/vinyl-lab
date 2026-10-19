import { buildTrackModels } from './musicColorAnalysis'
import type { AudioFeaturePayload } from './spectralFeatures'
import type { PersonalColorModel } from './personalColorModel'

self.onmessage = (event: MessageEvent<{ features: AudioFeaturePayload; personalModel?: PersonalColorModel | null }>) => {
  try {
    const features = event.data.features
    const analysis = buildTrackModels(features, event.data.personalModel,
      progress => self.postMessage({ type: 'progress', progress }))
    self.postMessage({ type: 'result', analysis })
  } catch {
    self.postMessage({ type: 'error' })
  }
}
