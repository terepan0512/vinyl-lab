import { useEffect, useMemo, useRef, useState } from 'react'
import { labToHex, hexToLab, colorDistance, type LabColor } from '../audio/colorSpace'
import { MODEL_VERSIONS, sampleColorTrajectory, type ColorModelId } from '../audio/musicColorAnalysis'
import { isPersonalColorModel, trainPersonalColorModel, type ColorAnnotation } from '../audio/personalColorModel'
import { ANNOTATION_STORAGE, mergeAnnotations, parseAnnotations } from '../audio/colorAnnotations'
import { measurePaletteSeparation, measurePaletteSurfaceSeparation, PALETTE_RELATIONSHIP_VERSION } from '../audio/paletteRelationships'
import { PERSONAL_MODEL_STORAGE, usePlayerStore } from '../state/playerStore'
import LiquidControls from './LiquidControls'
import './colorJourney.css'

const formatTime = (time: number) => `${Math.floor(time / 60)}:${Math.floor(time % 60).toString().padStart(2, '0')}`
const MODEL_NAMES = { A: 'Rule-based', B: 'Personalized', C: 'Feature Fusion' }
const SCHEME_NAMES = { analogous: 'Analogous', 'split-complementary': 'Split Complementary', triadic: 'Triadic' }
const MODEL_DETAILS = {
  A: 'Twelve MFCC timbre coefficients use a fixed reference of 96 synthetic sounds. Salient, coherent harmony anchors the track hue; timbre supplies a fallback and modifies that direction. Pigment intensity is calculated separately so different acoustic directions do not routinely cancel into gray. Temporal patterns make bounded adjustments; RMS and spectral centroid control lightness. These are engineering design choices, not human color training.',
  B: 'Ridge regression learns your color choices: 28 audio features → Oklab color. Color Identity and time-specific colors are learned separately. The palette relationship rules compose Accent and Counterpoint; those colors are not learned separately.',
  C: 'Reconstructs a frequency envelope from MFCCs and matches chroma against chord templates. It shares A’s salient-harmony hue anchor and separate pigment-intensity calculation, with bounded temporal adjustments. A and C can agree when harmony is strong. This is an untrained rule-based model and does not recognize emotion.',
}

function download(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
function Swatch({ color, label }: { color: LabColor; label: string }) {
  const hex = labToHex(color)
  return <div className="color-journey__swatch"><i style={{ background: hex }} /><span>{label}<small>{hex}</small></span></div>
}

export default function ColorJourney() {
  const { analysis, status, analysisProgress, track, currentTime, error, seek, toggle, selectedModel,
    selectModel, refreshAnalysis, personalModel, applyPersonalModel } = usePlayerStore()
  const [labelHex, setLabelHex] = useState('#808080')
  const [message, setMessage] = useState('')
  const [training, setTraining] = useState(false)
  const [blindMode, setBlindMode] = useState(false)
  const [groupIds, setGroupIds] = useState<Record<string, string>>({})
  const labelImport = useRef<HTMLInputElement>(null)
  const modelImport = useRef<HTMLInputElement>(null)
  const [annotations, setAnnotations] = useState<ColorAnnotation[]>(() => {
    try { return parseAnnotations(JSON.parse(localStorage.getItem(ANNOTATION_STORAGE) ?? '[]')) } catch { return [] }
  })
  const mappingRevision = `${MODEL_VERSIONS.A}+${MODEL_VERSIONS.C}+${PALETTE_RELATIONSHIP_VERSION}`
  useEffect(() => {
    refreshAnalysis()
  }, [analysis, refreshAnalysis, mappingRevision])
  const colors = analysis?.colors
  const sample = colors ? sampleColorTrajectory(colors, currentTime) : null
  const relationship = colors?.paletteRelationship
  const gradient = useMemo(() => {
    if (!colors) return ''
    const stride = Math.max(1, Math.floor(colors.trajectory.length / 100))
    return `linear-gradient(to right, ${colors.trajectory.filter((_, index) => index % stride === 0 || index === colors.trajectory.length - 1)
      .map(point => `${labToHex(point.palette[0])} ${colors.duration ? point.time / colors.duration * 100 : 0}%`).join(', ')})`
  }, [colors])
  if (!track) return null
  const thisTrack = annotations.filter(annotation => annotation.sourceId === analysis?.sourceId)
  const groupName = analysis ? groupIds[analysis.sourceId]
    ?? thisTrack.find(row => row.groupId && row.groupId !== analysis.sourceId)?.groupId ?? '' : ''

  const saveAnnotations = (next: ColorAnnotation[]) => {
    setAnnotations(next)
    try { localStorage.setItem(ANNOTATION_STORAGE, JSON.stringify(next)); return true }
    catch { setMessage('Browser storage is unavailable. Your labels are still in memory; export them to keep a backup.'); return false }
  }
  const recordAnnotation = (scope: ColorAnnotation['scope']) => {
    if (!analysis || !sample || !colors) return
    const source = scope === 'identity' ? colors.summary : sample.features
    const annotation: ColorAnnotation = {
      sourceId: analysis.sourceId, groupId: groupName.trim() || analysis.sourceId,
      scope, time: scope === 'time' ? currentTime : null, labelHex,
      prediction: scope === 'identity' ? colors.identity : sample.palette[0],
      features: { time: source.time, rms: source.rms, centroidHz: source.centroidHz, flatness: source.flatness,
        onset: source.onset, mfcc: source.mfcc, chroma: source.chroma },
      model: colors.model, modelRevision: colors.modelRevision, extractorVersion: colors.extractorVersion, createdAt: new Date().toISOString(),
    }
    try {
      if (saveAnnotations(mergeAnnotations(annotations, [annotation]))) setMessage('Saved. Labeling the same position in this track again will update it.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save.') }
  }
  const updateGroup = (value: string) => {
    if (!analysis) return
    setGroupIds({ ...groupIds, [analysis.sourceId]: value })
    const next = annotations.map(row => row.sourceId === analysis.sourceId
      ? { ...row, groupId: value.trim() || analysis.sourceId } : row)
    saveAnnotations(next)
  }
  const keepModel = (model: NonNullable<typeof personalModel>) => {
    applyPersonalModel(model)
    try { localStorage.setItem(PERSONAL_MODEL_STORAGE, JSON.stringify(model)); return true }
    catch { setMessage('Model applied, but browser storage failed. Export the model to keep a backup.'); return false }
  }
  const train = async () => {
    setTraining(true)
    setMessage('Training locally and validating by work…')
    try {
      const model = await trainPersonalColorModel(annotations)
      if (!model.scopes.identity && !model.scopes.time) {
        setMessage(`Training needs labels from at least 6 distinct works for either Color Identity or time-specific colors. Multiple times in one work count as one work. ${personalModel ? 'The existing model has been kept.' : ''}`)
      } else if (keepModel(model)) {
        setMessage('Model B is trained and applied to this track. Select B to compare. Validation error may vary with a small number of works.')
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Training failed.') }
    finally { setTraining(false) }
  }
  const importFile = async (file: File | undefined, kind: 'labels' | 'model') => {
    if (!file) return
    try {
      if (file.size > 8 * 1024 * 1024) throw new Error('Choose a JSON file smaller than 8 MB.')
      const data: unknown = JSON.parse(await file.text())
      if (kind === 'labels') {
        const imported = parseAnnotations(data)
        if (saveAnnotations(mergeAnnotations(annotations, imported))) setMessage(`Merged ${imported.length} labels.`)
      } else {
        if (!isPersonalColorModel(data) || (!data.scopes.identity && !data.scopes.time)) throw new Error('Choose a compatible, trained Model B file.')
        if (keepModel(data)) setMessage('Model B imported and applied. Select B to compare.')
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Import failed.') }
  }
  const currentModelLabels = thisTrack.filter(annotation => annotation.model === colors?.model
    && (annotation.modelRevision ?? annotation.model) === colors?.modelRevision)
  const averageDifference = currentModelLabels.length ? currentModelLabels.reduce((sum, annotation) =>
    sum + colorDistance(annotation.prediction, hexToLab(annotation.labelHex)), 0) / currentModelLabels.length : null
  const scopeGroups = (scope: 'identity' | 'time') => new Set(annotations.filter(a => a.scope === scope).map(a => a.groupId || a.sourceId)).size

  return (
    <details className={`color-journey${blindMode ? ' color-journey--blind' : ''}`} open>
      {blindMode && <style>{'.stage { visibility: hidden; }'}</style>}
      <summary>Music Colors <span>{status === 'analyzing' ? `Analyzing ${Math.round(analysisProgress * 100)}%` : '3 models · 3 colors each'}</span></summary>
      {error && <p role="alert" className="color-journey__error">{error}</p>}
      {!colors && status === 'analyzing' && <progress aria-label="Audio analysis progress" value={analysisProgress} max={1} />}
      {colors && sample && <>
        {!blindMode && <>
          <nav className="color-journey__models" aria-label="Compare color models">
            {(['A', 'B', 'C'] as ColorModelId[]).map(id => {
              const candidate = analysis.models[id]
              return <button key={id} type="button" aria-pressed={selectedModel === id} disabled={!candidate}
                onClick={() => selectModel(id)} title={candidate?.model ?? 'Add labels below and train Model B first'}>
                <b>{id}</b> {MODEL_NAMES[id]}<small>{candidate ? <><em style={{ background: labToHex(candidate.identity) }} />{labToHex(candidate.identity)}</> : 'Not trained'}</small>
                {candidate && <small>{candidate.model}</small>}
              </button>
            })}
          </nav>
          <div className="color-journey__identity"><Swatch color={colors.identity} label="Color Identity" /><span>Fixed identity · {colors.modelRevision}</span></div>
          <p><button type="button" disabled={status === 'analyzing'} onClick={() => {
            refreshAnalysis(true)
            setMessage('Models A and C recalculated from this track’s stored audio measurements. Your selected model, trained Model B, and labels were kept.')
          }}>Recalculate Colors</button></p>
          <div className="color-journey__swatches" aria-label="Current three-color palette">
            {sample.palette.map((color, i) => <Swatch key={i} color={color} label={['Main', 'Accent', 'Counterpoint'][i]} />)}
          </div>
          {relationship && <div className="color-journey__relationship" aria-label="Palette relationship">
            <strong>{relationship.silent ? 'Neutral · silence' : SCHEME_NAMES[relationship.scheme]}</strong>
            <span>Selected from this track · fixed during playback</span>
          </div>}
          <p className="color-journey__caption">Main, Accent, and Counterpoint start with equal shares. Live sound changes their relative areas and reshapes the pools while the color relationship stays fixed. Main names the song's identity; it does not reserve the largest area. {formatTime(currentTime)}</p>
          <LiquidControls />
          <div className="color-journey__timeline" style={{ background: gradient }}>
            <input type="range" aria-label="Color trajectory timeline" min={0} max={colors.duration} step={0.01}
              value={Math.min(currentTime, colors.duration)} onChange={event => seek(Number(event.target.value))} />
          </div>
          <div className="color-journey__time"><span>0:00</span><span>{formatTime(colors.duration)}</span></div>
          <nav className="color-journey__sections" aria-label="Audio sections">
            {colors.sections.map(section => <button key={section.id} type="button" aria-pressed={section.id === sample.section?.id}
              onClick={() => seek(section.start)}>{section.label} · {formatTime(section.start)}</button>)}
          </nav>
          <details className="color-journey__explanation">
            <summary>How does Model {selectedModel} work?</summary>
            <p>{MODEL_DETAILS[selectedModel]}</p>
            {relationship && <>
              <p><strong>Palette design:</strong> A separate rule chooses the relationship once from measured rhythmic activity, harmonic change, and noisiness. A/B/C determine the main color; Accent and Counterpoint use the chosen hue offsets and separation targets for both flat swatches and a default translucent resin approximation. These are design choices, not naturally occurring primary colors of music.</p>
              <dl>
                <div><dt>Relationship</dt><dd>{relationship.silent ? 'Neutral' : SCHEME_NAMES[relationship.scheme]}</dd></div>
                <div><dt>Hue offsets</dt><dd>{relationship.silent ? 'Not applied' : relationship.hueOffsets.map(value => `${value > 0 ? '+' : ''}${value}°`).join(' / ')}</dd></div>
                <div><dt>Min. Oklab distance</dt><dd>{measurePaletteSeparation(sample.palette).toFixed(3)} / target {relationship.minimumDistance.toFixed(3)}</dd></div>
                <div><dt>Default resin distance</dt><dd>{measurePaletteSurfaceSeparation(sample.palette).toFixed(3)} / target {relationship.minimumSurfaceDistance.toFixed(3)}</dd></div>
              </dl>
              <p>Rhythmic activity {relationship.rhythmicActivity.toFixed(2)} · harmonic change {relationship.harmonicChange.toFixed(2)} · design contrast {relationship.contrast.toFixed(2)}. Distances are checked after sRGB gamut mapping; they are design targets rather than a universal perception threshold. The resin check approximates default opacity, perceptual brightness, and color intensity, not measured screen pixels. Appearance settings change the surface preview; exported music colors remain unchanged.</p>
              {!colors.paletteDiagnostics.meetsTarget && <p>This palette cannot meet every display and default-resin separation target. The closest available palette is shown.</p>}
              <p>Counterpoint is a pigment, not a white reflection. Surface gloss is rendered separately.</p>
            </>}
            <ol>
              <li>Python/librosa measures MFCCs, chroma, RMS, spectral centroid, spectral flatness, and onset strength from the audio.</li>
              <li>Active audio and its temporal patterns produce a fixed Color Identity for A/C. Model B uses your trained predictions. A three-color palette is generated every 0.25 seconds and smoothed.</li>
              <li>Playback time selects the precomputed colors. Record rotation does not affect the palette, and colors are deterministic.</li>
            </ol>
            <dl>
              <div><dt>Spectral centroid</dt><dd>{Math.round(sample.features.centroidHz)} Hz</dd></div>
              <div><dt>RMS level</dt><dd>{(20 * Math.log10(Math.max(1e-6, sample.features.rms))).toFixed(1)} dBFS</dd></div>
              <div><dt>Estimated tempo</dt><dd>{colors.summary.tempoBpm ? `${Math.round(colors.summary.tempoBpm)} BPM` : 'Not detected'}</dd></div>
            </dl>
            {colors.identityMapping && <p>Static timbre direction: {colors.identityMapping.timbreHue.toFixed(0)}°;
              static harmony direction: {colors.identityMapping.harmonyHue === null ? 'Unclear' : `${colors.identityMapping.harmonyHue.toFixed(0)}°`};
              static harmony weight: {(colors.identityMapping.harmonyWeight * 100).toFixed(0)}%. The track context below also contributes to the final identity. These angles are mappings defined by this model.</p>}
            {colors.identityMapping?.timbreReference && <p>Timbre reference: {colors.identityMapping.timbreReference};
              projected strength: {colors.identityMapping.timbreStrength?.toFixed(2)}. Strength is a coordinate magnitude, not a confidence score. The track layer separates hue from pigment intensity. Silence stays neutral; unsupported pitch evidence contributes no harmonic color.</p>}
            {colors.identityMapping?.trackContext && <>
              <p>Track context: {colors.identityMapping.trackContext.version} / {colors.identityMapping.trackContext.temporal.version}.
                Pitched observations are weighted before averaging. Supported harmony anchors hue; rhythmic and timbral patterns adjust its angle, intensity, and lightness within bounds.</p>
              <dl>
                <div><dt>Salient harmony direction</dt><dd>{colors.identityMapping.trackContext.harmonic.direction === null ? 'Unclear' : `${colors.identityMapping.trackContext.harmonic.direction.toFixed(0)}°`}</dd></div>
                <div><dt>Track harmony contribution</dt><dd>{(colors.identityMapping.trackContext.harmonicWeight * 100).toFixed(0)}%</dd></div>
                <div><dt>Pulse contrast</dt><dd>{colors.identityMapping.trackContext.temporal.rhythm.pulseContrast.toFixed(2)}</dd></div>
                <div><dt>Sequence hue adjustment</dt><dd>{colors.identityMapping.trackContext.hueRotation.toFixed(1)}°</dd></div>
                <div><dt>Sequence intensity factor</dt><dd>{colors.identityMapping.trackContext.chromaFactor.toFixed(2)}×</dd></div>
              </dl>
              <p>These are acoustic descriptors and visual design rules, not a transcription of the lead melody or a guarantee of unique colors for every song.</p>
            </>}
            {colors.learning && <p>Color Identity: {colors.learning.identity === 'learned' ? 'regression from your labels' : 'duration-weighted average of time-specific predictions'};
              time-specific color: {colors.learning.trajectory === 'learned' ? 'regression from your labels' : 'no time-specific model yet; uses the fixed Color Identity'}.</p>}
            <p>Emotion and the exact lead melody are not detected. Similar sounds may produce similar colors. These mappings have not yet been validated in human perception studies.</p>
            <button type="button" onClick={() => download('music-color-analysis.json', analysis)}>Export All Model Analyses</button>
          </details>
        </>}
        <details className="color-journey__explanation" open={blindMode || undefined}>
          <summary>Teach Model B Your Colors</summary>
          <p>Labeled works: {scopeGroups('identity')} for Color Identity and {scopeGroups('time')} for time-specific colors. Each category needs at least 6 distinct works to start training. This minimum does not mean the dataset is sufficient.</p>
          <label className="color-journey__blind"><input type="checkbox" checked={blindMode} onChange={event => setBlindMode(event.target.checked)} /> Hide visuals and predicted colors while labeling to reduce bias</label>
          {blindMode && <div className="color-journey__blind-controls"><button type="button" onClick={toggle}>{status === 'playing' ? 'Pause' : 'Play'}</button>
            <input type="range" aria-label="Blind labeling playback position" min={0} max={colors.duration} step={0.1} value={currentTime} onChange={e => seek(Number(e.target.value))} /> {formatTime(currentTime)}</div>}
          <label className="color-journey__group">Work ID (optional)<input type="text" maxLength={200} value={groupName}
            placeholder="Use the same ID for files of the same work" onChange={e => updateGroup(e.target.value)} /></label>
          <div className="color-journey__annotation">
            <label>The Color I Hear <input type="color" aria-label="The Color I Hear" value={labelHex} onChange={event => setLabelHex(event.target.value)} /></label>
            <button type="button" onClick={() => recordAnnotation('identity')}>Label Identity</button>
            <button type="button" onClick={() => recordAnnotation('time')}>Label Current Time</button>
          </div>
          <p>{thisTrack.length} labels for this track{averageDifference !== null ? `; mean Oklab distance from same-version predictions: ${averageDifference.toFixed(3)}` : ''}. Labels are saved in this browser. Export them to keep a backup.</p>
          <div className="color-journey__actions">
            <button type="button" disabled={training || !annotations.length || status === 'analyzing'} onClick={train}>{training ? 'Training…' : 'Train / Update Model B'}</button>
            <button type="button" onClick={() => labelImport.current?.click()}>Import Labels</button>
            <button type="button" disabled={!annotations.length} onClick={() => download('music-color-annotations.json', { schema: 'music-color-labels-v1', annotations })}>Export Labels</button>
            <button type="button" disabled={training} onClick={() => modelImport.current?.click()}>Import Model</button>
            <button type="button" disabled={!personalModel} onClick={() => download('music-color-model-b.json', personalModel)}>Export Model</button>
          </div>
          <input ref={labelImport} type="file" aria-label="Import Labels" accept=".json,application/json" hidden onChange={event => { void importFile(event.target.files?.[0], 'labels'); event.target.value = '' }} />
          <input ref={modelImport} type="file" aria-label="Import Model" accept=".json,application/json" hidden onChange={event => { void importFile(event.target.files?.[0], 'model'); event.target.value = '' }} />
          <p role="status">{message}</p>
          {personalModel && (['identity', 'time'] as const).map(scope => {
            const fitted = personalModel.scopes[scope]
            return <p key={scope}>{scope === 'identity' ? 'Color Identity model' : 'Time-specific color model'}: {fitted
              ? `${fitted.metrics.nGroups} works; grouped holdout mean Oklab distance for unsmoothed regression: ${fitted.metrics.meanOklabDistance.toFixed(3)} (training mean-color baseline: ${fitted.metrics.baselineOklabDistance.toFixed(3)})`
              : 'Not trained; no personalized predictions yet'}.</p>
          })}
          <p>Validation is grouped by work, so the same work never appears in both training and validation. The label differences above are descriptive measures; Model B’s holdout error is not an accuracy score.</p>
        </details>
      </>}
    </details>
  )
}
