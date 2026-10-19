import type { AudioFeatureFrame } from './spectralFeatures.ts'
import reference from './timbreReference.json' with { type: 'json' }

export const TEMPORAL_IDENTITY_VERSION = 'temporal-structure-v2'

const clamp = (value: number, low = 0, high = 1) => Math.max(low, Math.min(high, value))
const finite = (value: number) => Number.isFinite(value) ? value : 0
const mean = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)
const bounded = (value: number, scale: number) => value / (value + scale)
const maximum = (values: readonly number[]) => values.reduce((result, value) => Math.max(result, value), 0)

function localResidual(values: readonly number[], radius: number) {
  return values.map((value, index) => value - mean(values.slice(Math.max(0, index - radius), index + radius + 1)))
}

function correlations(values: readonly number[], maximumLag: number) {
  const center = mean(values)
  return Array.from({ length: maximumLag }, (_, offset) => {
    const lag = offset + 1
    let dot = 0, left = 0, right = 0
    for (let index = lag; index < values.length; index++) {
      const current = values[index] - center, previous = values[index - lag] - center
      dot += current * previous
      left += current * current
      right += previous * previous
    }
    return clamp(dot / Math.max(1e-12, Math.sqrt(left * right)), -1, 1)
  })
}

function pulseContrast(correlations: readonly number[]) {
  const even = correlations.filter((_, index) => index % 2 === 1)
  const odd = correlations.filter((_, index) => index % 2 === 0)
  return even.length ? Math.tanh((mean(even) - mean(odd)) / (mean(correlations.map(Math.abs)) + 0.1)) : 0
}

/** Import-time sequence descriptors, not melody transcription or emotion recognition.
 *
 * The input is the existing 250 ms feature series. Absolute level, MFCC 0,
 * metadata, track duration, and upload order never choose a color. MFCC
 * differences also reject constant coefficient offsets (an approximation to
 * a fixed recording coloration, not a guarantee of invariance to every EQ).
 */
export function analyzeTemporalIdentity(frames: readonly AudioFeatureFrame[]) {
  const maximumRms = maximum(frames.map(frame => Math.max(0, finite(frame.rms))))
  const active = frames.map(frame => maximumRms > 1e-12 && frame.rms / maximumRms > 0.01)
  const validPairs = frames.slice(1).map((_, index) => active[index] && active[index + 1])
  const pairCount = validPairs.filter(Boolean).length
  const activeCount = active.filter(Boolean).length
  const intervals = frames.slice(1).map((frame, index) => frame.time - frames[index].time)
    .filter(value => Number.isFinite(value) && value > 0 && value <= 1)
  const frameSeconds = intervals.length ? [...intervals].sort((a, b) => a - b)[Math.floor(intervals.length / 2)] : 0.25

  // Positive RMS attacks and the varying part of spectral onset are relative
  // to this recording. A constant onset floor cannot create a periodic pulse.
  const onsetInput = frames.map((frame, index) => active[index] && index > 0 ? Math.max(0, finite(frame.onset)) : 0)
  const eligibleOnsets = onsetInput.slice(1).filter((_, index) => active[index + 1])
  const onsetMin = eligibleOnsets.reduce((result, value) => Math.min(result, value), eligibleOnsets.length ? Infinity : 0)
  const onsetMax = maximum(eligibleOnsets)
  const novelty = frames.map((frame, index) => {
    if (index === 0 || !active[index]) return 0
    const rmsAttack = Math.max(0, frame.rms - finite(frames[index - 1].rms)) / Math.max(1e-12, maximumRms)
    const onsetChange = (onsetInput[index] - onsetMin) / Math.max(1e-12, onsetMax)
    return 0.5 * rmsAttack + 0.5 * Math.max(0, onsetChange)
  })
  // Remove a two-second local envelope before measuring pulse structure.
  // Otherwise a shared fade, limiter, or slow arrangement envelope can make
  // every lag positive and hide alternating percussive events.
  const localRadius = Math.max(1, Math.round(1 / frameSeconds))
  const rhythmicResidual = localResidual(novelty, localRadius)
  const noveltyVariance = mean(rhythmicResidual.map(value => value * value))
  const rhythmicActivity = bounded(Math.sqrt(noveltyVariance), 0.06)
  const maximumLag = Math.min(Math.floor(3 / frameSeconds), Math.floor(frames.length / 3))
  const lagCorrelations = correlations(rhythmicResidual, maximumLag)
  const envelopeLagCorrelations = correlations(novelty, maximumLag)
  let periodWeight = 0, paceSum = 0, lagSum = 0, rateSum = 0
  for (let index = 0; index < lagCorrelations.length; index++) {
    const lag = index + 1, correlation = lagCorrelations[index]
    // Average across supported lags rather than switching to a winning tempo.
    const weight = Math.max(0, correlation) ** 4 * (novelty.length - lag) / Math.max(1, novelty.length)
    const seconds = lag * frameSeconds
    paceSum += weight * clamp(Math.log(3 / Math.max(0.25, seconds)) / Math.log(12))
    lagSum += weight * seconds
    rateSum += weight * Math.log(1 / Math.max(0.25, seconds))
    periodWeight += weight
  }
  const regularity = Math.max(0, ...lagCorrelations)
  // Weak uncorrelated fluctuations can become large after relative onset
  // normalization. Repeated evidence raises confidence; an isolated attack
  // or codec-induced floor fluctuation gets little authority over identity.
  const repeatEvidence = clamp((regularity - 2 / Math.sqrt(Math.max(1, frames.length))) / 0.35)
  const rhythmConfidence = rhythmicActivity * (0.1 + 0.9 * repeatEvidence) * clamp((frames.length - 3) / 13)
  const rhythm = {
    activity: rhythmicActivity,
    regularity,
    pace: periodWeight > 1e-9 ? paceSum / periodWeight : 0.5,
    lagSeconds: periodWeight > 1e-9 ? lagSum / periodWeight : null,
    lagCorrelations,
    envelopeLagCorrelations,
    pulseContrast: pulseContrast(lagCorrelations),
    // One second is a declared modulation reference, not a fitted song mean.
    rateBalance: periodWeight > 1e-9 ? Math.tanh(rateSum / periodWeight) : 0,
    confidence: rhythmConfidence,
  }

  const chroma = frames.map(frame => {
    const bins = Array.from({ length: 12 }, (_, index) => Math.max(0, finite(frame.chroma[index])))
    const total = bins.reduce((sum, value) => sum + value, 0)
    return bins.map(value => total > 1e-12 ? value / total : 1 / 12)
  })
  const chromaConfidence = chroma.map((bins, index) => active[index]
    ? Math.sqrt(clamp(1 + bins.reduce((sum, value) => sum + (value > 0 ? value * Math.log(value) : 0), 0) / Math.log(12))) : 0)
  const intervalMass = Array<number>(12).fill(0)
  let changeSum = 0, tonalPairWeight = 0
  let previousTransition: { x: number, y: number, weight: number } | null = null
  let turnSum = 0, turnWeight = 0
  for (let index = 1; index < frames.length; index++) {
    if (!validPairs[index - 1]) {
      previousTransition = null
      continue
    }
    const previous = chroma[index - 1], current = chroma[index]
    const removed = previous.map((value, bin) => Math.max(0, value - current[bin]))
    const added = current.map((value, bin) => Math.max(0, value - previous[bin]))
    const change = removed.reduce((sum, value) => sum + value, 0)
    const confidence = Math.sqrt(chromaConfidence[index] * chromaConfidence[index - 1])
    tonalPairWeight += confidence
    changeSum += change * confidence
    if (change <= 1e-12) continue
    let transitionX = 0, transitionY = 0
    // Match only the probability mass that changed; outer products of whole
    // spectra would incorrectly interpret a sustained chord as transitions.
    for (let from = 0; from < 12; from++) {
      for (let to = 0; to < 12; to++) {
        const interval = (to - from + 12) % 12
        const mass = removed[from] * added[to] / change * confidence
        intervalMass[interval] += mass
        transitionX += mass * Math.cos(interval * Math.PI / 6)
        transitionY += mass * Math.sin(interval * Math.PI / 6)
      }
    }
    const transitionWeight = change * confidence
    const transition = { x: transitionX / Math.max(1e-12, transitionWeight),
      y: transitionY / Math.max(1e-12, transitionWeight), weight: transitionWeight }
    if (previousTransition) {
      const evidence = Math.sqrt(transition.weight * previousTransition.weight)
      turnSum += (transition.x * previousTransition.x + transition.y * previousTransition.y) * evidence
      turnWeight += evidence
    }
    previousTransition = transition
  }
  const totalMass = intervalMass.reduce((sum, value) => sum + value, 0)
  const directedIntervals = intervalMass.map(value => totalMass > 1e-12 ? value / totalMass : 0)
  const harmonicChange = changeSum / Math.max(1, pairCount)
  const tonalConfidence = tonalPairWeight / Math.max(1, pairCount)
  const intervalDistinctiveness = totalMass > 1e-12 ? Math.sqrt(clamp(directedIntervals.reduce((sum, value) =>
    sum + (value > 0 ? value * Math.log(value * 11) : 0), 0) / Math.log(11))) : 0
  const harmonyConfidence = bounded(harmonicChange, 0.06) * Math.sqrt(tonalConfidence) * intervalDistinctiveness
  const step = directedIntervals[1] + directedIntervals[2] + directedIntervals[10] + directedIntervals[11]
  const leap = directedIntervals.slice(3, 10).reduce((sum, value) => sum + value, 0)
  const direction = directedIntervals.reduce((sum, value, interval) => sum + value * Math.sin(interval * Math.PI / 6), 0)
  const contour = turnWeight > 1e-12 ? clamp(turnSum / turnWeight, -1, 1) : 0
  // There are four close and seven distant nonzero intervals. Subtract their
  // unequal uniform-null masses before assigning a visual direction.
  const stepNull = 4 / 11
  const stepContrast = totalMass > 1e-12 ? (step - stepNull) / (step < stepNull ? stepNull : 1 - stepNull) : 0
  const centeredTransitionVector = {
    x: totalMass > 1e-12 ? (directedIntervals.reduce((sum, value, interval) =>
      sum + value * Math.cos(interval * Math.PI / 6), 0) + 1 / 11) / (1 + 1 / 11) : 0,
    y: direction,
  }
  const harmony = {
    change: harmonicChange,
    directedIntervals,
    step,
    leap,
    direction,
    contour,
    stepContrast,
    centeredTransitionVector,
    intervalDistinctiveness,
    tonalConfidence,
    confidence: harmonyConfidence,
  }

  const coefficients = reference.scale.map((scale, coefficient) => {
    const values = frames.map((frame, index) => active[index] ? finite(frame.mfcc[coefficient + 1]) / scale : 0)
    const center = values.reduce((sum, value, index) => sum + (active[index] ? value : 0), 0) / Math.max(1, activeCount)
    return values.map((value, index) => active[index] ? value - center : 0)
  })
  let variationPower = 0, differencePower = 0
  for (const values of coefficients) {
    variationPower += values.reduce((sum, value) => sum + value * value, 0)
    for (let index = 1; index < values.length; index++) {
      if (validPairs[index - 1]) differencePower += (values[index] - values[index - 1]) ** 2
    }
  }
  const variation = Math.sqrt(variationPower / Math.max(1, activeCount * coefficients.length))
  const change = Math.sqrt(differencePower / Math.max(1, pairCount * coefficients.length))
  const timbreConfidence = bounded(change, 0.18)
  // Correlation normalizes each coefficient's own temporal variance. It is
  // insensitive to a constant offset or positive scale per coefficient, so
  // recording coloration does not set these modulation-pattern coordinates.
  const coefficientCorrelations = coefficients.map(values => correlations(localResidual(values, localRadius), maximumLag))
  const timbreLagCorrelations = Array.from({ length: maximumLag }, (_, lag) =>
    mean(coefficientCorrelations.map(values => values[lag])))
  const relativeChange = variation > 1e-12 ? change / (Math.SQRT2 * variation) : 0
  const timbre = {
    variation: bounded(variation, 0.25),
    change: bounded(change, 0.25),
    pace: variation > 1e-12 ? clamp(change / (2 * variation)) : 0,
    relativeChange,
    lagCorrelations: timbreLagCorrelations,
    pulseContrast: pulseContrast(timbreLagCorrelations),
    continuity: variation > 1e-12 ? clamp(1 - relativeChange ** 2, -1, 1) : 0,
    confidence: timbreConfidence,
  }

  // Declared visual axes preserve distinct kinds of sequence evidence:
  // x = alternating pulse modulation + centered harmonic interval motion;
  // y = short/long pulse recurrence + relative timbral continuity/direction.
  // Null interval churn has no preferred hue. This is a design mapping, not
  // a scientifically unique correspondence between sound and color.
  const harmonicWeight = 0.5 * harmonyConfidence
  const rhythmWeight = 0.65 * rhythmConfidence
  const timbreWeight = 0.35 * timbreConfidence
  const weight = harmonicWeight + rhythmWeight + timbreWeight
  const confidence = 1 - (1 - harmonyConfidence) * (1 - rhythmConfidence) * (1 - timbreConfidence)
  const coordinate = {
    x: weight > 1e-12 ? clamp((harmonicWeight * centeredTransitionVector.x + rhythmWeight * rhythm.pulseContrast
      + timbreWeight * timbre.pulseContrast) / weight, -1, 1) : 0,
    y: weight > 1e-12 ? clamp((harmonicWeight * (0.7 * direction + 0.3 * contour) + rhythmWeight * rhythm.rateBalance
      - timbreWeight * timbre.continuity) / weight, -1, 1) : 0,
  }
  return { version: TEMPORAL_IDENTITY_VERSION, coordinate, confidence, rhythm, harmony, timbre }
}
