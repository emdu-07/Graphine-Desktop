import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { LocateFixed, Minus, Plus } from 'lucide-react'
import { Circle, Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text, Transformer } from 'react-konva'
import type Konva from 'konva'
import { ThemeContext } from './layout/ThemeContext'
import { buildMotionResult } from '../motion/engine'
import type { MotionObject, MotionSample } from '../types'

interface MotionStageProps {
  object: MotionObject
  onChange: (next: MotionObject) => void
  previewPosition?: { x: number; y: number; rotation: number }
  countdown?: number | null
  recording?: boolean
  motionPath?: MotionSample[]
  gridEnabled?: boolean
  gridColor?: string
  gridOpacity?: number
}

const WORLD_WIDTH = 1024
const WORLD_HEIGHT = 1024
const MIN_ZOOM = .35
const MAX_ZOOM = 3

function hexToRgba(hex: string, alpha: number) {
  const numeric = /^#?([0-9a-fA-F]{6})$/.exec(hex)
  if (!numeric) return hex
  const value = numeric[1]
  const red = Number.parseInt(value.slice(0, 2), 16)
  const green = Number.parseInt(value.slice(2, 4), 16)
  const blue = Number.parseInt(value.slice(4, 6), 16)
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

function useContainerSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ width: 760, height: 520 })
  useLayoutEffect(() => {
    if (!ref.current) return
    const bounds = ref.current.getBoundingClientRect()
    setSize({ width: bounds.width, height: bounds.height })
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [ref])
  return size
}

function LoadedImage({ src }: { src?: string }) {
  const [image, setImage] = useState<HTMLImageElement>()
  useEffect(() => {
    if (!src) return
    const next = new window.Image()
    next.onload = () => setImage(next)
    next.src = src
  }, [src])
  return image
}

export function MotionStage({ object, onChange, previewPosition, countdown, recording, motionPath = [], gridEnabled = true, gridColor, gridOpacity = 100 }: MotionStageProps) {
  const theme = useContext(ThemeContext)
  const positionKeys = useMemo(() => buildMotionResult(motionPath).keyframes.position, [motionPath])
  const canvasColors = theme === 'light'
    ? { background: '#ffffff', grid: '#e3e9e6', border: '#cad5d0', selection: '#087749', anchorBorder: '#ffffff' }
    : { background: '#111b20', grid: '#223039', border: '#334149', selection: '#b8ffd9', anchorBorder: '#10191e' }
  const containerRef = useRef<HTMLDivElement>(null)
  const shapeRef = useRef<Konva.Group>(null)
  const transformerRef = useRef<Konva.Transformer>(null)
  const size = useContainerSize(containerRef)
  const image = LoadedImage({ src: object.imageUrl })
  const display = previewPosition ?? object
  const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 1 })
  const [activeSnap, setActiveSnap] = useState<'horizontal' | 'vertical' | null>(null)
  const [snapGuidePosition, setSnapGuidePosition] = useState(0)
  const hasCentered = useRef(false)
  const dragMotion = useRef<{
    originX: number
    originY: number
    filteredX: number
    filteredY: number
    rawX: number
    rawY: number
    snap: 'horizontal' | 'vertical' | null
  } | null>(null)
  const filteredRotation = useRef<number | null>(null)

  const clampPosition = useCallback((position: { x: number; y: number }) => {
    const padding = 0
    return {
      x: Math.min(Math.max(position.x, padding), WORLD_WIDTH - object.width - padding),
      y: Math.min(Math.max(position.y, padding), WORLD_HEIGHT - object.height - padding),
    }
  }, [object.width, object.height])

  const boundShapeDrag = useCallback((absolutePosition: { x: number; y: number }) => {
    const parent = shapeRef.current?.getParent()
    if (!parent) return absolutePosition
    const parentTransform = parent.getAbsoluteTransform()
    const localPosition = parentTransform.copy().invert().point(absolutePosition)
    const clampedPosition = clampPosition({
      x: localPosition.x - object.width / 2,
      y: localPosition.y - object.height / 2,
    })
    return parentTransform.point({
      x: clampedPosition.x + object.width / 2,
      y: clampedPosition.y + object.height / 2,
    })
  }, [clampPosition, object.height, object.width])

  const keepShapeInsideWorld = (node: Konva.Group) => {
    const parent = node.getParent()
    if (!parent) return { x: node.x(), y: node.y() }

    const padding = 0
    const bounds = node.getClientRect({ relativeTo: parent, skipShadow: true })
    let x = node.x()
    let y = node.y()

    if (bounds.x < padding) x += padding - bounds.x
    else if (bounds.x + bounds.width > WORLD_WIDTH - padding) x -= bounds.x + bounds.width - (WORLD_WIDTH - padding)
    if (bounds.y < padding) y += padding - bounds.y
    else if (bounds.y + bounds.height > WORLD_HEIGHT - padding) y -= bounds.y + bounds.height - (WORLD_HEIGHT - padding)

    node.position({ x, y })
    return { x, y }
  }

  const clampViewport = useCallback((next: { x: number; y: number; scale: number }) => {
    const scaledWidth = WORLD_WIDTH * next.scale
    const scaledHeight = WORLD_HEIGHT * next.scale
    const x = scaledWidth <= size.width
      ? (size.width - scaledWidth) / 2
      : Math.min(0, Math.max(size.width - scaledWidth, next.x))
    const y = scaledHeight <= size.height
      ? (size.height - scaledHeight) / 2
      : Math.min(0, Math.max(size.height - scaledHeight, next.y))
    return { ...next, x, y }
  }, [size.width, size.height])

  const centerOnObject = useCallback(() => {
    const scale = 1
    setViewport(clampViewport({
      scale,
      x: size.width / 2 - (object.x + object.width / 2) * scale,
      y: size.height / 2 - (object.y + object.height / 2) * scale,
    }))
  }, [clampViewport, object.x, object.y, object.width, object.height, size.width, size.height])

  useEffect(() => {
    if (!hasCentered.current && size.width > 0 && size.height > 0) {
      centerOnObject()
      hasCentered.current = true
    }
  }, [centerOnObject, size.width, size.height])

  const zoomAt = (point: { x: number; y: number }, requestedScale: number) => {
    const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, requestedScale))
    const worldPoint = {
      x: (point.x - viewport.x) / viewport.scale,
      y: (point.y - viewport.y) / viewport.scale,
    }
    setViewport(clampViewport({
      scale,
      x: point.x - worldPoint.x * scale,
      y: point.y - worldPoint.y * scale,
    }))
  }

  const handleWheel = (event: Konva.KonvaEventObject<WheelEvent>) => {
    event.evt.preventDefault()
    if (event.evt.ctrlKey || event.evt.metaKey) {
      const pointer = event.target.getStage()?.getPointerPosition()
      if (!pointer) return
      zoomAt(pointer, viewport.scale * Math.exp(-event.evt.deltaY * .01))
      return
    }
    setViewport(current => clampViewport({
      ...current,
      x: current.x - event.evt.deltaX,
      y: current.y - event.evt.deltaY,
    }))
  }

  const zoomFromCenter = (factor: number) => {
    zoomAt({ x: size.width / 2, y: size.height / 2 }, viewport.scale * factor)
  }

  useEffect(() => {
    if (shapeRef.current && transformerRef.current) {
      transformerRef.current.nodes([shapeRef.current])
      transformerRef.current.getLayer()?.batchDraw()
    }
  }, [object.kind])

  const commitTransform = () => {
    const node = shapeRef.current
    if (!node) return
    const scaleX = node.scaleX()
    const scaleY = node.scaleY()
    const width = Math.max(48, object.width * scaleX)
    const height = Math.max(48, object.height * scaleY)
    node.scaleX(1)
    node.scaleY(1)
    onChange({
      ...object,
      x: node.x() - width / 2,
      y: node.y() - height / 2,
      width,
      height,
      rotation: node.rotation(),
    })
  }

  const beginDrag = (event: Konva.KonvaEventObject<DragEvent>) => {
    const x = event.target.x()
    const y = event.target.y()
    dragMotion.current = { originX: x, originY: y, filteredX: x, filteredY: y, rawX: x, rawY: y, snap: null }
    setActiveSnap(null)
  }

  const stabilizeDrag = (event: Konva.KonvaEventObject<DragEvent>) => {
    const state = dragMotion.current
    if (!state) return
    const rawX = event.target.x()
    const rawY = event.target.y()
    const deltaX = rawX - state.originX
    const deltaY = rawY - state.originY
    const absX = Math.abs(deltaX)
    const absY = Math.abs(deltaY)
    let snap = state.snap

    if (snap === 'horizontal' && absY > Math.max(24, absX * .22)) snap = null
    if (snap === 'vertical' && absX > Math.max(24, absY * .22)) snap = null
    if (!snap && Math.max(absX, absY) > 24) {
      if (absY <= Math.max(10, absX * .12)) snap = 'horizontal'
      else if (absX <= Math.max(10, absY * .12)) snap = 'vertical'
    }

    const magneticStrength = .015
    const targetX = snap === 'vertical' ? state.originX + deltaX * magneticStrength : rawX
    const targetY = snap === 'horizontal' ? state.originY + deltaY * magneticStrength : rawY
    const smoothing = .24
    const minX = object.width / 2
    const maxX = WORLD_WIDTH - object.width / 2
    const minY = object.height / 2
    const maxY = WORLD_HEIGHT - object.height / 2
    // Boundary contact overrides smoothing and snapping, so the shape hits the wall exactly.
    const filteredX = rawX <= minX ? minX : rawX >= maxX ? maxX : state.filteredX + (targetX - state.filteredX) * smoothing
    const filteredY = rawY <= minY ? minY : rawY >= maxY ? maxY : state.filteredY + (targetY - state.filteredY) * smoothing

    event.target.position({ x: filteredX, y: filteredY })
    dragMotion.current = { ...state, filteredX, filteredY, rawX, rawY, snap }
    if (snap !== state.snap) {
      setActiveSnap(snap)
      if (snap) setSnapGuidePosition(snap === 'horizontal' ? state.originY : state.originX)
    }
    onChange({ ...object, x: filteredX - object.width / 2, y: filteredY - object.height / 2 })
  }

  const finishDrag = (event: Konva.KonvaEventObject<DragEvent>) => {
    onChange({ ...object, x: event.target.x() - object.width / 2, y: event.target.y() - object.height / 2 })
    dragMotion.current = null
    setActiveSnap(null)
  }

  const beginRotation = (event: Konva.KonvaEventObject<Event>) => {
    filteredRotation.current = event.target.rotation()
  }

  const stabilizeTransform = (event: Konva.KonvaEventObject<Event>) => {
    const rawRotation = event.target.rotation()
    const previous = filteredRotation.current ?? rawRotation
    const shortestDelta = ((rawRotation - previous + 540) % 360) - 180
    const rotation = previous + shortestDelta * .42
    filteredRotation.current = rotation
    event.target.rotation(rotation)
    const position = keepShapeInsideWorld(event.target as Konva.Group)
    onChange({
      ...object,
      x: position.x - object.width / 2,
      y: position.y - object.height / 2,
      rotation,
    })
  }

  const renderShape = (outline = false) => {
    const appearance = outline
      ? { stroke: '#93a1a9', strokeWidth: 1.5 / viewport.scale, fillEnabled: false, listening: false }
      : { fill: object.kind === 'image' ? undefined : object.fill }
    if (outline && object.kind === 'image') {
      return <Rect {...appearance} width={object.width} height={object.height} cornerRadius={18} />
    }
    if (object.kind === 'image' && image) {
      return <KonvaImage {...appearance} image={image} width={object.width} height={object.height} cornerRadius={18} />
    }
    if (object.kind === 'circle') {
      return <Circle {...appearance} x={object.width / 2} y={object.height / 2} radius={Math.min(object.width, object.height) / 2} />
    }
    if (object.kind === 'triangle') {
      return <Line {...appearance} points={[object.width / 2, 0, object.width, object.height, 0, object.height]} closed lineJoin="round" />
    }
    return <Rect {...appearance} width={object.width} height={object.height} cornerRadius={24} />
  }

  const resolvedGridColor = gridColor ?? (theme === 'light' ? '#dfe7e4' : '#223039')
  const gridStroke = gridEnabled ? hexToRgba(resolvedGridColor, gridOpacity / 100) : 'transparent'

  const endX = object.x
  const endY = object.y
  const centerAt = (x: number, y: number) => ({
    x: x + object.width / 2,
    y: y + object.height / 2,
  })
  const startCenter = centerAt(object.startX, object.startY)
  const endCenter = centerAt(endX, endY)
  const trailPoints = motionPath.length > 1
    ? motionPath.flatMap(sample => {
        const center = centerAt(sample.x, sample.y)
        return [center.x, center.y]
      })
    : [startCenter.x, startCenter.y, endCenter.x, endCenter.y]

  return (
    <div className="stage-container" ref={containerRef}>
      <Stage width={size.width} height={size.height} onWheel={handleWheel}>
        <Layer listening={false}>
          <Group x={viewport.x} y={viewport.y} scaleX={viewport.scale} scaleY={viewport.scale}>
            <Rect width={WORLD_WIDTH} height={WORLD_HEIGHT} fill={canvasColors.background} stroke={canvasColors.border} strokeWidth={1 / viewport.scale} />
            {Array.from({ length: Math.floor(WORLD_WIDTH / 40) + 1 }).map((_, index) => (
              <Line key={`v-${index}`} points={[index * 40, 0, index * 40, WORLD_HEIGHT]} stroke={gridStroke} strokeWidth={1 / viewport.scale} />
            ))}
            {Array.from({ length: Math.floor(WORLD_HEIGHT / 40) + 1 }).map((_, index) => (
              <Line key={`h-${index}`} points={[0, index * 40, WORLD_WIDTH, index * 40]} stroke={gridStroke} strokeWidth={1 / viewport.scale} />
            ))}
            {activeSnap === 'horizontal' && <Line points={[0, snapGuidePosition, WORLD_WIDTH, snapGuidePosition]} stroke={canvasColors.selection} opacity={.55} strokeWidth={1 / viewport.scale} dash={[5 / viewport.scale, 6 / viewport.scale]} />}
            {activeSnap === 'vertical' && <Line points={[snapGuidePosition, 0, snapGuidePosition, WORLD_HEIGHT]} stroke={canvasColors.selection} opacity={.55} strokeWidth={1 / viewport.scale} dash={[5 / viewport.scale, 6 / viewport.scale]} />}
            {(recording || motionPath.length > 0) && (
              <Group>
                <Group
                  name="recording-start-outline"
                  x={startCenter.x}
                  y={startCenter.y}
                  offsetX={object.width / 2}
                  offsetY={object.height / 2}
                  rotation={object.startRotation ?? motionPath[0]?.rotation ?? object.rotation}
                >
                  {renderShape(true)}
                </Group>
                <Text x={object.startX - 8} y={object.startY + object.height + 13} text="START" fill="#75838b" fontSize={10 / viewport.scale} fontFamily="DM Sans" />
                <Text x={endX - 2} y={endY + object.height + 13} text="END" fill="#8de8ba" fontSize={10 / viewport.scale} fontFamily="DM Sans" />
              </Group>
            )}
          </Group>
        </Layer>
        <Layer>
          <Group x={viewport.x} y={viewport.y} scaleX={viewport.scale} scaleY={viewport.scale}>
            <Group
              ref={shapeRef}
              x={display.x + object.width / 2}
              y={display.y + object.height / 2}
              offsetX={object.width / 2}
              offsetY={object.height / 2}
              rotation={display.rotation}
              draggable={!previewPosition}
              dragBoundFunc={boundShapeDrag}
              onDragStart={beginDrag}
              onDragMove={stabilizeDrag}
              onDragEnd={finishDrag}
              onTransformStart={beginRotation}
              onTransform={stabilizeTransform}
              onTransformEnd={() => { filteredRotation.current = null; commitTransform() }}
            >
              {renderShape()}
            </Group>
            {!previewPosition && (
              <Transformer
                ref={transformerRef}
                rotateEnabled
                borderStroke={canvasColors.selection}
                borderStrokeWidth={1.5 / viewport.scale}
                anchorFill={canvasColors.selection}
                anchorStroke={canvasColors.anchorBorder}
                anchorSize={10 / viewport.scale}
                anchorCornerRadius={5 / viewport.scale}
                rotateAnchorOffset={28 / viewport.scale}
                enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
                boundBoxFunc={(oldBox, newBox) => (
                  newBox.width < 48
                  || newBox.height < 48
                  || newBox.width > WORLD_WIDTH - 24
                  || newBox.height > WORLD_HEIGHT - 24
                    ? oldBox
                    : newBox
                )}
              />
            )}
          </Group>
        </Layer>
        {(recording || motionPath.length > 0) && (
          <Layer listening={false} name="motion-path-overlay">
            <Group x={viewport.x} y={viewport.y} scaleX={viewport.scale} scaleY={viewport.scale}>
              <Line
                name="recorded-motion-path"
                points={trailPoints}
                stroke="#63727a"
                strokeWidth={1.5 / viewport.scale}
                dash={[2 / viewport.scale, 5 / viewport.scale]}
                tension={0}
                lineCap="round"
                lineJoin="round"
              />
              {[
                motionPath[0] ?? { x: object.startX, y: object.startY },
                ...positionKeys.slice(1, -1),
                ...(motionPath.length > 1 ? [motionPath.at(-1)!] : []),
              ].map((sample, index) => {
                const center = centerAt(sample.x, sample.y)
                return <Circle key={index} name="motion-change-marker" x={center.x} y={center.y} radius={3 / viewport.scale} fill={theme === 'light' ? '#52636c' : '#b7c7cf'} stroke={theme === 'light' ? '#ffffff' : '#111b20'} strokeWidth={1 / viewport.scale} />
              })}
            </Group>
          </Layer>
        )}
      </Stage>
      {countdown !== null && countdown !== undefined && (
        <div className="countdown-overlay"><span>GET READY</span><strong key={countdown}>{countdown}</strong><small>Grab the object when recording starts</small></div>
      )}
      {recording && <div className="recording-indicator"><i /> RECORDING MOVEMENT</div>}
      <div className="viewport-controls" aria-label="Canvas zoom controls">
        <button onClick={() => zoomFromCenter(.8)} title="Zoom out"><Minus size={13} /></button>
        <span>{Math.round(viewport.scale * 100)}%</span>
        <button onClick={() => zoomFromCenter(1.25)} title="Zoom in"><Plus size={13} /></button>
        <button onClick={centerOnObject} title="Center object"><LocateFixed size={13} /></button>
      </div>
      <div className="stage-hint">Two-finger scroll to pan · Pinch to zoom · Drag object to move</div>
    </div>
  )
}
