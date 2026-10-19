export interface AudioFeatureFrame {
  time: number
  rms: number
  centroidHz: number
  flatness: number
  onset: number
  mfcc: number[]
  chroma: number[]
}

export interface AudioFeaturePayload {
  featureBackend: 'librosa'
  extractorVersion: string
  sourceId: string
  parameters: Record<string, string | number>
  sampleRate: number
  duration: number
  tempoBpm: number | null
  frames: AudioFeatureFrame[]
}
