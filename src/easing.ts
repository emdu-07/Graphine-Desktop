import type { MotionChannel, MotionCurvePoint, MotionSample } from './motion/types'

export interface DerivedEasing {
  points: MotionCurvePoint[]
  cubic: [number, number, number, number]
  amount: number
}

// Short gestures (including the 1.23s reference) get the stronger default.
export const SHORT_EASING_INTERVAL_SECONDS = 1.5
export const LINEAR_PROGRESS_TOLERANCE = .025

export function defaultEasingEmphasis(durationSeconds: number): number {
  return Number.isFinite(durationSeconds) && durationSeconds > 0 && durationSeconds <= SHORT_EASING_INTERVAL_SECONDS ? .6 : 0
}

/** Stylize the fitted curve by expanding handle offsets from linear timing.
 * This is an explicit creative adjustment, not a new measurement of the capture.
 * Zero preserves the original fit; linear curves remain linear at any strength.
 */
export function emphasizeEasing(
  cubic: [number, number, number, number],
  strength: number,
): [number, number, number, number] {
  const amount = Number.isFinite(strength) ? Math.max(0, Math.min(1, strength)) : 0
  if (amount === 0) return [...cubic]
  const [x1, y1, x2, y2] = cubic
  const expand = (x: number, y: number) => Math.max(-.5, Math.min(1.5, x + (y - x) * (1 + amount)))
  return [x1, expand(x1, y1), x2, expand(x2, y2)]
}

export function fitBezierToProgress(points: Array<{ time: number, progress: number }>): [number, number, number, number] {
  if (points.length < 2) return [.33, .33, .67, .67]

  const linearTolerance = LINEAR_PROGRESS_TOLERANCE
  if (points.every(point => Math.abs(point.progress - point.time) <= linearTolerance)) {
    return [.33, .33, .67, .67]
  }

  let a11 = 0
  let a12 = 0
  let a22 = 0
  let b1 = 0
  let b2 = 0
  for (const point of points) {
    const t = point.time
    const inverse = 1 - t
    const basis1 = 3 * inverse * inverse * t
    const basis2 = 3 * inverse * t * t
    const target = point.progress - t * t * t
    a11 += basis1 * basis1
    a12 += basis1 * basis2
    a22 += basis2 * basis2
    b1 += basis1 * target
    b2 += basis2 * target
  }

  const determinant = a11 * a22 - a12 * a12
  const fittedY1 = Math.abs(determinant) > 1e-8 ? (b1 * a22 - b2 * a12) / determinant : .33
  const fittedY2 = Math.abs(determinant) > 1e-8 ? (a11 * b2 - a12 * b1) / determinant : .67
  const clamp = (value: number) => Math.max(-.5, Math.min(1.5, value))
  return [.33, clamp(fittedY1), .67, clamp(fittedY2)]
}

export function deriveEasing(samples: MotionSample[], channel: MotionChannel): DerivedEasing {
  if (samples.length < 2) {
    return { points: [{ time: 0, progress: 0 }, { time: 1, progress: 1 }], cubic: [.33, .33, .67, .67], amount: 0 }
  }

  const startTime = samples[0].time
  const duration = Math.max(samples.at(-1)!.time - startTime, .001)
  const distances = [0]
  let total = 0

  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1]
    const current = samples[index]
    const change = channel === 'position'
      ? Math.hypot(current.x - previous.x, current.y - previous.y)
      : Math.abs(current.rotation - previous.rotation)
    total += change
    distances.push(total)
  }

  const hasMotion = total > (channel === 'position' ? .5 : .25)
  const points = samples.map((sample, index) => ({
    time: (sample.time - startTime) / duration,
    progress: hasMotion ? distances[index] / total : (sample.time - startTime) / duration,
  }))

  // Allow small capture noise (2.5% of segment progress). Exact linear handles
  // also remain unchanged by emphasis, even for very short intervals.
  if (points.every(point => Math.abs(point.progress - point.time) <= LINEAR_PROGRESS_TOLERANCE)) {
    return { points, cubic: [.33, .33, .67, .67], amount: total }
  }

  const cubic = fitBezierToProgress(points)
  return { points, cubic, amount: total }
}
