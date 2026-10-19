// Guitar body and pick outlines use only moveTo / lineTo / bezierCurveTo,
// so they work with both Three.js Shape and a canvas 2D context for previews.
export interface PathLike {
  moveTo(x: number, y: number): unknown
  lineTo(x: number, y: number): unknown
  bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): unknown
}

// Double-cutaway electric guitar body: bottom at y=0, neck joint near y=1.95, width about 1.9, height about 2.3
export function traceGuitarBody(p: PathLike) {
  p.moveTo(0, 0)
  p.bezierCurveTo(0.55, -0.02, 0.98, 0.25, 0.95, 0.65) // Lower right shoulder
  p.bezierCurveTo(0.93, 0.95, 0.62, 1.05, 0.64, 1.3) // Right waist
  p.bezierCurveTo(0.66, 1.55, 0.92, 1.6, 0.86, 1.95) // Upper right
  p.bezierCurveTo(0.82, 2.2, 0.62, 2.35, 0.5, 2.3) // Right horn
  p.bezierCurveTo(0.4, 2.27, 0.3, 2.0, 0.2, 1.95) // Return to the neck joint
  p.lineTo(-0.2, 1.95)
  p.bezierCurveTo(-0.3, 2.0, -0.38, 2.25, -0.55, 2.2) // Left horn
  p.bezierCurveTo(-0.75, 2.15, -0.85, 1.9, -0.82, 1.65)
  p.bezierCurveTo(-0.8, 1.4, -0.62, 1.3, -0.66, 1.05) // Left waist
  p.bezierCurveTo(-0.7, 0.8, -0.95, 0.7, -0.93, 0.5)
  p.bezierCurveTo(-0.9, 0.2, -0.5, -0.02, 0, 0)
}

// Guitar pick: rounded triangle pointing down, about 1.0 × 1.1
export function tracePick(p: PathLike) {
  p.moveTo(0, -0.55)
  p.bezierCurveTo(0.12, -0.45, 0.5, 0.05, 0.5, 0.28)
  p.bezierCurveTo(0.5, 0.5, 0.3, 0.55, 0, 0.55)
  p.bezierCurveTo(-0.3, 0.55, -0.5, 0.5, -0.5, 0.28)
  p.bezierCurveTo(-0.5, 0.05, -0.12, -0.45, 0, -0.55)
}

// Neck: fret positions measured from the nut using twelve-tone equal temperament
export const NUT_Y = 4.5
export const SCALE_LENGTH = 3.4
export const FRET_COUNT = 17
export function fretY(n: number) {
  return NUT_Y - SCALE_LENGTH * (1 - Math.pow(2, -n / 12))
}
