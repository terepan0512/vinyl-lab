import { buildMusicColors, MODEL_VERSIONS, type ColorModelId, type TrackAnalysis } from './musicColorAnalysis.ts'
import { PALETTE_RELATIONSHIP_VERSION } from './paletteRelationships.ts'
import type { PersonalColorModel } from './personalColorModel.ts'

/** Reuse extracted audio when a rule changes; personalized predictions remain untouched. */
export function refreshTrackModels(analysis: TrackAnalysis,
  selectedModel: ColorModelId = analysis.colors.modelId, force = false,
  personalModel: PersonalColorModel | null = null): TrackAnalysis {
  let models = analysis.models
  for (const model of ['A', 'C'] as const) {
    const current = models[model]
    const expectedRevision = `${MODEL_VERSIONS[model]}+${PALETTE_RELATIONSHIP_VERSION}`
    const fresh = current?.model === MODEL_VERSIONS[model] && current.modelRevision === expectedRevision
      && current.paletteRelationship?.version === PALETTE_RELATIONSHIP_VERSION
      && current.extractorVersion === analysis.features.extractorVersion
    if (force || !fresh) {
      if (models === analysis.models) models = { ...models }
      models[model] = buildMusicColors(analysis.features, undefined, { model })
    }
  }
  // A material/composition revision may update B's two designed accents. Its
  // trained predictor and Main identity use the same artifact and input data.
  const b = models.B
  if (b && b.paletteRelationship.version !== PALETTE_RELATIONSHIP_VERSION && personalModel
    && personalModel.extractorVersion === analysis.features.extractorVersion
    && b.modelRevision.startsWith(personalModel.createdAt + '+')) {
    if (models === analysis.models) models = { ...models }
    models.B = buildMusicColors(analysis.features, undefined, { model: 'B', personalModel })
  }
  const colors = models[selectedModel] ?? analysis.colors
  return models === analysis.models && colors === analysis.colors ? analysis : { ...analysis, models, colors }
}
