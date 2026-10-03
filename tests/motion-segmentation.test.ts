import assert from 'node:assert/strict'
import { it } from 'node:test'
import { buildMotionResult } from '../src/motion/engine.ts'
import { segmentSamplesByKeyframes } from '../src/motion/segmentation.ts'
import { deriveEasing, fitBezierToProgress } from '../src/easing.ts'

const samples = (points: number[][]) => points.map(([time, x, y = 0]) => ({ time, x, y, rotation: 0 }))
const check = (points: number[][], times: number[]) => {
  const input = samples(points)
  const result = buildMotionResult(input)
  assert.deepEqual(result.keyframes.position.map(p => p.time), times)
  assert.equal(result.curves.length, times.length - 1)
  for (const curve of result.curves) {
    assert.deepEqual(curve.points[0], { time: 0, progress: 0 })
    assert.deepEqual(curve.points.at(-1), { time: 1, progress: 1 })
    assert.ok(curve.cubic.every(Number.isFinite))
  }
  assert.deepEqual(buildMotionResult(input), result)
  return result
}

it('keeps straight motion to two keyframes', () => {
  check([[0, 0], [.2, 20], [.4, 40], [.6, 60]], [0, .6])
})

it('preserves an L trajectory with a timed corner', () => {
  check([[0, 330, 330], [.2, 450, 330], [.4, 600, 330], [.6, 830, 330], [.8, 830, 420], [1, 830, 520]], [0, .6, 1])
})

it('retains multiple turns as timed corners and spatial controls', () => {
  check([[0, 0, 0], [.2, 20, 0], [.4, 40, 0], [.6, 40, 20], [.8, 40, 40], [1, 60, 40], [1.2, 80, 40]], [0, .4, .8, 1.2])
})

it('detects dense corners without creating jitter keyframes', () => {
  const straight = Array.from({ length: 41 }, (_, i) => [i * .04, i * 3, i % 2 ? .5 : 0])
  check(straight, [0, 1.6])
  const corner = Array.from({ length: 41 }, (_, i) => [i * .04, Math.min(i, 19) * 3, Math.max(0, i - 19) * 3])
  check(corner, [0, .76, 1.6])
})

it('keeps both long and brief holds inside the timing curve', () => {
  check([[0, 0], [.2, 20], [.4, 40], [.5, 40], [.8, 40], [1, 60], [1.2, 80]], [0, 1.2])
  check([[0, 0], [.2, 20], [.4, 40], [.5, 40], [.7, 60], [.9, 80]], [0, .9])
})

it('keeps speed changes inside one timing interval', () => {
  check([[0, 0], [.2, 10], [.4, 20], [.6, 70], [.8, 120]], [0, .8])
  check([[0, 0], [.2, 50], [.4, 100], [.6, 110], [.8, 120]], [0, .8])
  check([[0, 0], [.2, 50], [.4, 100], [.6, 110], [.8, 120], [1, 170], [1.2, 220]], [0, 1.2])
})

it('shares boundary samples without losing interior samples', () => {
  const input = samples([[0, 0], [.1, 10], [.2, 20], [.3, 30], [.4, 40]])
  assert.deepEqual(segmentSamplesByKeyframes(input, [0, 2, 4]), [input.slice(0, 3), input.slice(2)])
})

it('uses timing and travelled distance independently of spatial orientation', () => {
  const input = samples([[2, 0], [2.1, 10], [2.4, 40], [3, 100]])
  const rotated = input.map(p => ({ ...p, x: 42, y: p.x + 80 }))
  assert.deepEqual(deriveEasing(input, 'position'), deriveEasing(rotated, 'position'))
  assert.deepEqual(deriveEasing(input, 'position').points.map(p => p.progress), [0, .1, .4, 1])
})

it('trims boundary holds while retaining capture duration and raw samples', () => {
  // Keep movement samples inside the engine's 0.25-second detection window.
  const initial = check([[0, 0], [.2, 0], [.4, 20], [.6, 60], [.8, 100]], [.2, .8])
  const final = check([[0, 0], [.2, 40], [.4, 100], [.6, 100], [.8, 100]], [0, .4])
  const both = check([[0, 0], [.2, 0], [.4, 100], [.6, 100]], [.2, .4])
  for (const result of [initial, final, both]) {
    assert.equal(result.duration, result.samples!.at(-1)!.time)
    assert.equal(result.sampleCount, result.samples!.length)
    assert.equal(result.samples![0].time, 0)
  }
  assert.deepEqual(both.curves[0].points.map(p => p.progress), [0, 1])
})

it('does not infer active motion across gaps longer than the detection window', () => {
  const input = samples([[0, 0], [.2, 0], [.7, 100], [1, 100]])
  const result = buildMotionResult(input)
  assert.deepEqual(result.keyframes.position, [])
  assert.deepEqual(result.curves, [])
  assert.deepEqual(result.samples, input)
  assert.equal(result.duration, 1)
})

it('preserves raw samples and L geometry with progress normalized per timed interval', () => {
  const input = samples([[0, 0, 0], [.2, 50, 0], [.4, 100, 0], [.6, 100, 50], [.8, 100, 100]])
  const result = buildMotionResult(input)
  assert.deepEqual(result.samples, input)
  assert.deepEqual(result.spatialPath.points, input.map(({ x, y }) => ({ x, y })))
  assert.equal(result.spatialPath.totalLength, 200)
  assert.equal(result.spatialPath.reconstruction, 'move-along-path')
  assert.deepEqual(result.keyframes.position.map(p => p.time), [0, .4, .8])
  assert.deepEqual(result.curves.map(curve => curve.points.map(p => p.progress)), [[0, .5, 1], [0, .5, 1]])
  assert.ok(result.steps.some(step => step.description === 'Set x-position to 100px, y-position to 100px.'))
  // The current engine retains the capture array; it does not promise a snapshot.
  assert.equal(result.samples, input)
})

it('preserves loops with detected corners and smooth arcs with endpoint keys', () => {
  const cases: [number[][], number[]][] = [
    [[[0, 0, 0], [.25, 100, 0], [.5, 100, 100], [.75, 0, 100], [1, 0, 0]], [0, .25, .75, 1]],
    [Array.from({ length: 21 }, (_, i) => [i / 20, 100 * Math.cos(i * Math.PI / 40), 100 * Math.sin(i * Math.PI / 40)]), [0, 1]],
  ]
  for (const [points, times] of cases) {
    const result = check(points, times)
    assert.equal(result.spatialPath.reconstruction, 'move-along-path')
    assert.deepEqual(result.spatialPath.points, samples(points).map(({ x, y }) => ({ x, y })))
  }
})

it('fits known cubic progress and bounds difficult pause handles without enforcing monotonicity', () => {
  const known = Array.from({ length: 21 }, (_, i) => {
    const t = i / 20
    return { time: t, progress: 3 * (1 - t) ** 2 * t * .2 + 3 * (1 - t) * t * t * .8 + t ** 3 }
  })
  const fitted = fitBezierToProgress(known)
  assert.ok(Math.abs(fitted[1] - .2) < 1e-10)
  assert.ok(Math.abs(fitted[3] - .8) < 1e-10)
  for (const points of [known, known.map(p => ({ ...p, progress: p.time < .8 ? 0 : 1 }))]) {
    const [x1, y1, x2, y2] = fitBezierToProgress(points)
    assert.ok(x1 >= 0 && x1 <= x2 && x2 <= 1)
    assert.ok([y1, y2].every(value => Number.isFinite(value) && value >= -.5 && value <= 1.5))
  }
  const paused = fitBezierToProgress(known.map(p => ({ ...p, progress: p.time < .8 ? 0 : 1 })))
  assert.ok(paused[1] < 0)
})
