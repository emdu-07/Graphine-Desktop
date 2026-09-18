import { detectPositionCorners } from './corners.ts'
import { deriveEasing } from '../easing.ts'
import { extractSpatialPath } from './path.ts'
import type {
  MotionChannel,
  MotionCurve,
  MotionGuideStep,
  MotionKeyframe,
  MotionResult,
  MotionSample,
} from './types'

const MOTION_CHANNELS: MotionChannel[] = ['position', 'rotation']
const MIN_POSITION_CHANGE = 2
const MIN_ROTATION_CHANGE = 1
const MOTION_DETECTION_WINDOW_SECONDS = .25

function findMotionRange(
  samples: MotionSample[],
  minimumChange: number,
  difference: (start: MotionSample, end: MotionSample) => number,
): { startIndex: number; endIndex: number } | undefined {
  let startIndex: number | undefined
  let endIndex: number | undefined

  for (let index = 0; index < samples.length - 1; index += 1) {
    for (let nextIndex = index + 1; nextIndex < samples.length; nextIndex += 1) {
      if (samples[nextIndex].time - samples[index].time > MOTION_DETECTION_WINDOW_SECONDS) break
      if (difference(samples[index], samples[nextIndex]) < minimumChange) continue

      let activeStart = index
      let activeEnd = nextIndex
      const activityThreshold = minimumChange / 10
      for (let activeIndex = index + 1; activeIndex <= nextIndex; activeIndex += 1) {
        if (difference(samples[activeIndex - 1], samples[activeIndex]) < activityThreshold) continue
        activeStart = activeIndex - 1
        break
      }
      for (let activeIndex = nextIndex; activeIndex > index; activeIndex -= 1) {
        if (difference(samples[activeIndex - 1], samples[activeIndex]) < activityThreshold) continue
        activeEnd = activeIndex
        break
      }

      startIndex = Math.min(startIndex ?? activeStart, activeStart)
      endIndex = Math.max(endIndex ?? activeEnd, activeEnd)
      break
    }
  }

  return startIndex === undefined || endIndex === undefined ? undefined : { startIndex, endIndex }
}

function selectPositionKeyframeIndices(samples: MotionSample[]): number[] {
  const motionRange = findMotionRange(
    samples,
    MIN_POSITION_CHANGE,
    (start, end) => Math.hypot(end.x - start.x, end.y - start.y),
  )
  if (!motionRange) return []

  return [motionRange.startIndex, ...detectPositionCorners(samples, motionRange.startIndex, motionRange.endIndex), motionRange.endIndex]
}

function selectRotationKeyframeIndices(samples: MotionSample[]): number[] {
  const motionRange = findMotionRange(
    samples,
    MIN_ROTATION_CHANGE,
    (start, end) => Math.abs(end.rotation - start.rotation),
  )
  if (!motionRange) return []

  const boundaryIndices = new Set([motionRange.startIndex, motionRange.endIndex])
  let rotationAnchorIndex = motionRange.startIndex
  let previousRotationDirection: -1 | 1 | undefined

  for (let index = motionRange.startIndex + 1; index <= motionRange.endIndex; index += 1) {
    const sample = samples[index]
    const rotationAnchor = samples[rotationAnchorIndex]
    const rotationDelta = sample.rotation - rotationAnchor.rotation
    if (Math.abs(rotationDelta) >= MIN_ROTATION_CHANGE) {
      const direction = rotationDelta < 0 ? -1 : 1
      if (previousRotationDirection !== undefined && direction !== previousRotationDirection) {
        boundaryIndices.add(rotationAnchorIndex)
      }
      previousRotationDirection = direction
      rotationAnchorIndex = index
    }
  }

  return [...boundaryIndices].sort((left, right) => left - right)
}

function buildCurves(samples: MotionSample[], keyframeIndices: Record<MotionChannel, number[]>): MotionCurve[] {
  return MOTION_CHANNELS.flatMap((channel) => keyframeIndices[channel].slice(0, -1).map((startIndex, segmentIndex) => {
    const endIndex = keyframeIndices[channel][segmentIndex + 1]
    const segment = samples.slice(startIndex, endIndex + 1)
    const easing = deriveEasing(segment, channel)
    return {
      channel,
      segmentIndex,
      label: `Keyframe ${segmentIndex + 1}`,
      startTime: samples[startIndex].time,
      endTime: samples[endIndex].time,
      ...easing,
    }
  }))
}

function buildSteps(keyframes: Record<MotionChannel, MotionKeyframe[]>): MotionGuideStep[] {
  const detectedChannels = MOTION_CHANNELS.filter(channel => keyframes[channel].length > 0)
  const propertyNames = detectedChannels.map(channel => channel === 'position' ? 'Position' : 'Rotation')
  const setupDescription = propertyNames.length > 0
    ? `On your layer, enable keyframes for ${propertyNames.join(' and ')}.`
    : 'No position or rotation change exceeded the motion threshold.'

  return [
    {
      id: 'create-detected-property-tracks',
      index: 0,
      title: 'Create the detected property tracks',
      description: setupDescription,
    },
    ...keyframes.position.map((keyframe, index) => ({
      id: `position-keyframe-${index + 1}`,
      index: index + 1,
      channel: 'position' as const,
      title: `Position keyframe at ${keyframe.time.toFixed(2)} seconds`,
      description: `Set x-position to ${Math.round(keyframe.x)}px, y-position to ${Math.round(keyframe.y)}px.`,
    })),
    ...keyframes.rotation.map((keyframe, index) => ({
      id: `rotation-keyframe-${index + 1}`,
      index: index + 1,
      channel: 'rotation' as const,
      title: `Rotation keyframe at ${keyframe.time.toFixed(2)} seconds`,
      description: `Set Rotation to ${Math.round(keyframe.rotation)}°.`,
    })),
  ]
}

export function buildMotionResult(samples: MotionSample[]): MotionResult {
  const duration = samples.at(-1)?.time ?? 0
  const keyframeIndices = {
    position: selectPositionKeyframeIndices(samples),
    rotation: selectRotationKeyframeIndices(samples),
  }
  const keyframes = {
    position: keyframeIndices.position.map(index => samples[index]),
    rotation: keyframeIndices.rotation.map(index => samples[index]),
  }

  const result: MotionResult = {
    duration,
    sampleCount: samples.length,
    keyframes,
    curves: buildCurves(samples, keyframeIndices),
    steps: buildSteps(keyframes),
  }

  if (samples.length > 0) {
    return {
      ...result,
      samples,
      spatialPath: extractSpatialPath(samples),
    }
  }

  return result
}
