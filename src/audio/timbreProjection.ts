import reference from './timbreReference.json' with { type: 'json' }

export const TIMBRE_REFERENCE_VERSION = reference.version

/** Fixed synthetic acoustic reference, not a learned music-to-color model. */
export function projectTimbre(mfcc: readonly number[]) {
  const standardized = reference.mean.map((mean, index) => {
    const value = mfcc[index + 1]
    return ((Number.isFinite(value) ? value : mean) - mean) / reference.scale[index]
  })
  const coordinates = reference.components.map((component, axis) =>
    component.reduce((sum, weight, index) => sum + weight * standardized[index], 0) / reference.eigenScale[axis])
  const [rawX, rawY] = coordinates
  // Keep the vector continuous through the reference center. Normalizing every
  // point to a unit vector would turn tiny residuals into saturated colors.
  const radius = Math.hypot(rawX, rawY)
  const denominator = Math.sqrt(1 + radius * radius)
  return { x: rawX / denominator, y: rawY / denominator,
    strength: radius / denominator, coordinates: [rawX, rawY] as [number, number] }
}
