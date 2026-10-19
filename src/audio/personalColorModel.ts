import type { LabColor } from './colorSpace.ts'
import type { AudioFeatureFrame } from './spectralFeatures.ts'

export type PersonalColorScope = 'identity' | 'time'

export interface ColorAnnotation {
  sourceId: string
  groupId?: string
  scope: PersonalColorScope
  time: number | null
  labelHex: string
  prediction: LabColor
  features: AudioFeatureFrame
  model: string
  modelRevision?: string
  createdAt: string
  extractorVersion?: string
}

export interface PersonalScopeModel {
  featureMean: number[]
  featureScale: number[]
  /** Feature-major: 28 rows, each containing coefficients for [l, a, b]. */
  coefficients: number[][]
  intercept: [number, number, number]
  metrics: {
    nLabels: number
    nGroups: number
    nFolds: number
    meanOklabDistance: number
    baselineOklabDistance: number
    validation: 'group-held-out-5-fold'
    weighting: 'equal-per-work'
    scalerFit: 'training-fold-only'
  }
}

export interface PersonalColorModel {
  schema: 'personal-color-ridge-v1'
  featureBackend: 'librosa'
  extractorVersion: '0.11.0'
  featureVersion: 'acoustic-v1'
  featureCount: 28
  alpha: 10
  status: 'trained' | 'partial' | 'untrained'
  scopes: Partial<Record<PersonalColorScope, PersonalScopeModel>>
  unavailableScopes: Partial<Record<PersonalColorScope, {
    nLabels: number
    nGroups: number
    requiredGroups: number
    reason: string
  }>>
  submittedLabels: number
  deduplicatedLabels: number
  createdAt: string
  note: string
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const finite = (value: unknown, low = -1e12, high = 1e12): value is number => typeof value === 'number' && Number.isFinite(value) && value >= low && value <= high
const count = (value: unknown, low = 0, high = 2000): value is number => finite(value, low, high) && Number.isInteger(value)
const vector = (value: unknown, length: number, low = -1e12, high = 1e12): value is number[] => Array.isArray(value)
  && value.length === length && value.every(item => finite(item, low, high))

function isScopeModel(value: unknown): value is PersonalScopeModel {
  if (!record(value) || !record(value.metrics)) return false
  const metrics = value.metrics
  return vector(value.featureMean, 28) && vector(value.featureScale, 28, Number.MIN_VALUE)
    && Array.isArray(value.coefficients) && value.coefficients.length === 28 && value.coefficients.every(row => vector(row, 3))
    && vector(value.intercept, 3) && count(metrics.nLabels, 6) && count(metrics.nGroups, 6)
    && metrics.nGroups <= metrics.nLabels && metrics.nFolds === 5
    && finite(metrics.meanOklabDistance, 0, 2) && finite(metrics.baselineOklabDistance, 0, 2)
    && metrics.validation === 'group-held-out-5-fold' && metrics.weighting === 'equal-per-work'
    && metrics.scalerFit === 'training-fold-only'
}

/** Validate persisted/imported models before they can reach rendering code. */
export function isPersonalColorModel(value: unknown): value is PersonalColorModel {
  if (!record(value) || value.schema !== 'personal-color-ridge-v1' || value.featureBackend !== 'librosa'
    || value.extractorVersion !== '0.11.0' || value.featureVersion !== 'acoustic-v1' || value.featureCount !== 28 || value.alpha !== 10
    || !record(value.scopes) || !record(value.unavailableScopes) || !count(value.submittedLabels) || !count(value.deduplicatedLabels)
    || value.deduplicatedLabels > value.submittedLabels || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))
    || typeof value.note !== 'string') return false
  let available = 0
  for (const scope of ['identity', 'time'] as const) {
    const model = value.scopes[scope]
    const unavailable = value.unavailableScopes[scope]
    if (model !== undefined) {
      if (!isScopeModel(model) || unavailable !== undefined) return false
      available++
    } else if (!record(unavailable) || !count(unavailable.nLabels) || !count(unavailable.nGroups, 0, 5)
      || unavailable.nGroups > unavailable.nLabels || unavailable.requiredGroups !== 6 || typeof unavailable.reason !== 'string') return false
  }
  return value.status === (available === 2 ? 'trained' : available === 1 ? 'partial' : 'untrained')
}

/** acoustic-v1, exactly mirrored by analysis/personal_model.py. */
export function personalFeatureVector(frame: AudioFeatureFrame): number[] | null {
  if (!frame || !finite(frame.time, 0, 1e9) || !finite(frame.rms, 0, 10) || !finite(frame.centroidHz, 0, 100000)
    || !finite(frame.flatness, 0, 1) || !finite(frame.onset, 0, 1e6)
    || !vector(frame.mfcc, 13, -100000, 100000) || !vector(frame.chroma, 12, 0, 1e6)) return null
  const total = frame.chroma.reduce((sum, value) => sum + value, 0)
  return [Math.log10(Math.max(1e-6, frame.rms)), Math.log10(Math.max(1, frame.centroidHz)),
    Math.log10(Math.max(1e-7, frame.flatness)), Math.log1p(frame.onset),
    ...frame.mfcc.slice(1, 13).map(value => value / 100), ...frame.chroma.map(value => total > 0 ? value / total : 0)]
}

export function predictPersonalColor(frame: AudioFeatureFrame, artifact: PersonalColorModel, scope: PersonalColorScope): LabColor | null {
  const model = artifact.scopes[scope]
  const features = personalFeatureVector(frame)
  if (!model || !features) return null
  const predicted = [...model.intercept]
  for (let index = 0; index < 28; index++) {
    const standardized = (features[index] - model.featureMean[index]) / model.featureScale[index]
    for (let channel = 0; channel < 3; channel++) predicted[channel] += standardized * model.coefficients[index][channel]
  }
  if (!predicted.every(Number.isFinite)) return null
  return { l: Math.max(0, Math.min(1, predicted[0])), a: Math.max(-0.5, Math.min(0.5, predicted[1])), b: Math.max(-0.5, Math.min(0.5, predicted[2])) }
}

export async function trainPersonalColorModel(annotations: ColorAnnotation[], signal?: AbortSignal): Promise<PersonalColorModel> {
  let response: Response
  try {
    response = await fetch('/api/train-color', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
      body: JSON.stringify({ annotations, featureBackend: 'librosa', extractorVersion: '0.11.0' }),
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new Error('Cannot connect to the local training service. Run npm run analysis first.', { cause: error })
  }
  let data: unknown
  try { data = await response.json() } catch { throw new Error('The training service returned an invalid result. Update and start the local analysis service.') }
  if (!response.ok) throw new Error(record(data) && typeof data.error === 'string' ? data.error : 'Model B training failed. Check your labels.')
  if (!isPersonalColorModel(data)) throw new Error('The model format or feature version is incompatible. Update the local analysis service.')
  return data
}
