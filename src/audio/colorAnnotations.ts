import { personalFeatureVector, type ColorAnnotation } from './personalColorModel.ts'

export const ANNOTATION_STORAGE = 'vinyl-color-annotations-v1'

export function isColorAnnotation(value: unknown): value is ColorAnnotation {
  if (!value || typeof value !== 'object') return false
  const row = value as ColorAnnotation
  return typeof row.sourceId === 'string' && row.sourceId.trim().length > 0 && row.sourceId.length <= 200
    && (row.groupId === undefined || (typeof row.groupId === 'string' && row.groupId.trim().length > 0 && row.groupId.length <= 200))
    && (row.scope === 'identity' ? row.time === null : row.scope === 'time' && typeof row.time === 'number' && Number.isFinite(row.time) && row.time >= 0 && row.time <= 1e9)
    && typeof row.labelHex === 'string' && /^#[0-9a-f]{6}$/i.test(row.labelHex)
    && !!row.prediction && [row.prediction.l, row.prediction.a, row.prediction.b].every(Number.isFinite)
    && typeof row.model === 'string' && typeof row.createdAt === 'string' && Number.isFinite(Date.parse(row.createdAt)) && /(?:Z|[+-]\d\d:\d\d)$/i.test(row.createdAt)
    && (row.extractorVersion === undefined || row.extractorVersion === '0.11.0')
    && (row.modelRevision === undefined || (typeof row.modelRevision === 'string' && row.modelRevision.length <= 100))
    && personalFeatureVector(row.features) !== null
}

export function parseAnnotations(value: unknown): ColorAnnotation[] {
  const rows = Array.isArray(value) ? value : value && typeof value === 'object' && 'annotations' in value ? value.annotations : null
  if (!Array.isArray(rows) || rows.length > 2000 || !rows.every(isColorAnnotation)) {
    throw new Error('Invalid label file or more than 2,000 labels. Import a labels JSON file exported by this app.')
  }
  return rows
}

export function mergeAnnotations(existing: ColorAnnotation[], imported: ColorAnnotation[]): ColorAnnotation[] {
  const latest = new Map<string, ColorAnnotation>()
  for (const row of [...existing, ...imported].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))) {
    latest.set(JSON.stringify([row.sourceId, row.scope, row.scope === 'identity' ? null : row.time]), row)
  }
  if (latest.size > 2000) throw new Error('The 2,000-label limit has been reached. Export your labels as a backup first.')
  return [...latest.values()]
}
