import { useEffect, useRef, useState } from 'react'
import { Box, ChevronDown, Circle as CircleIcon, ImagePlus, Play, Plus, Square, StopCircle, Triangle } from 'lucide-react'
import { MotionStage } from '../../components/MotionStage'
import { PALETTE } from '../../data'
import { buildMotionResult } from '../../motion/engine'
import type { CapturePhase, MotionSample } from '../../motion/types'
import type { MotionObject, ShapeKind } from '../../types'
import { ShapeColorPicker } from '../../components/ShapeColorPicker'
import { MotionGuide } from './MotionGuide'

const INITIAL_OBJECT: MotionObject = {
  id: 'object-1', name: 'Square layer', kind: 'square', x: 300, y: 210,
  startX: 300, startY: 210, width: 126, height: 126, rotation: 0, fill: PALETTE[0],
}

export function MotionWorkspace() {
  const [object, setObject] = useState(INITIAL_OBJECT)
  const [duration, setDuration] = useState(3)
  const [activeTab, setActiveTab] = useState<'curves' | 'steps'>('curves')
  const [phase, setPhase] = useState<CapturePhase>('idle')
  const [countdown, setCountdown] = useState<number | null>(null)
  const [progress, setProgress] = useState(0)
  const [samples, setSamples] = useState<MotionSample[]>([])
  const [trailSamples, setTrailSamples] = useState<MotionSample[]>([])
  const [showShapes, setShowShapes] = useState(false)
  const [gridOpen, setGridOpen] = useState(false)
  const [gridEnabled, setGridEnabled] = useState(true)
  const [gridColor, setGridColor] = useState('#7e8d8a')
  const [gridOpacity, setGridOpacity] = useState(60)
  const fileInput = useRef<HTMLInputElement>(null)
  const objectRef = useRef(object)
  const sampleBuffer = useRef<MotionSample[]>([])

  const updateObject = (next: MotionObject) => {
    objectRef.current = next
    setObject(next)
  }

  useEffect(() => {
    if (phase !== 'countdown' || countdown === null) return
    const timer = window.setTimeout(() => {
      if (countdown > 1) setCountdown(countdown - 1)
      else {
        setCountdown(null)
        sampleBuffer.current = []
        setPhase('recording')
      }
    }, 1000)
    return () => window.clearTimeout(timer)
  }, [phase, countdown])

  useEffect(() => {
    if (phase !== 'recording') return
    const startedAt = performance.now()
    let frame = 0
    let lastSampleAt = -40

    const capture = (now: number) => {
      const elapsed = Math.min((now - startedAt) / 1000, duration)
      setProgress(elapsed / duration)
      if (elapsed * 1000 - lastSampleAt >= 32 || elapsed >= duration) {
        const current = objectRef.current
        sampleBuffer.current.push({ time: elapsed, x: current.x, y: current.y, rotation: current.rotation })
        setTrailSamples([...sampleBuffer.current])
        lastSampleAt = elapsed * 1000
      }
      if (elapsed < duration) frame = requestAnimationFrame(capture)
      else {
        setSamples([...sampleBuffer.current])
        setPhase('complete')
        setActiveTab('curves')
      }
    }
    frame = requestAnimationFrame(capture)
    return () => cancelAnimationFrame(frame)
  }, [phase, duration])

  const startCapture = () => {
    if (phase === 'countdown' || phase === 'recording') return
    const current = objectRef.current
    updateObject({ ...current, startX: current.x, startY: current.y, startRotation: current.rotation })
    setSamples([])
    setTrailSamples([])
    sampleBuffer.current = []
    setProgress(0)
    setCountdown(3)
    setPhase('countdown')
  }

  const stopCapture = () => {
    if (phase !== 'recording') return
    setSamples([...sampleBuffer.current])
    setPhase('complete')
    setActiveTab('curves')
  }

  const addShape = (kind: ShapeKind) => {
    updateObject({ ...INITIAL_OBJECT, id: crypto.randomUUID(), kind, name: `${kind[0].toUpperCase()}${kind.slice(1)} layer`, fill: object.fill })
    setShowShapes(false)
    setSamples([])
    setTrailSamples([])
    setPhase('idle')
    setProgress(0)
  }

  const handleUpload = (file?: File) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      updateObject({ ...INITIAL_OBJECT, id: crypto.randomUUID(), kind: 'image', name: file.name, imageUrl: String(reader.result), width: 180, height: 135 })
      setSamples([])
      setTrailSamples([])
      setPhase('idle')
    }
    reader.readAsDataURL(file)
  }

  const motionResult = buildMotionResult(samples)

  const captureLabel = phase === 'recording' ? 'Stop recording' : phase === 'complete' ? 'Record again' : 'Record movement'
  const elapsed = progress * duration

  return (
    <div className="content-grid">
      <section className="design-panel">
        <div className="panel-heading">
          <div><h1>Motion Canvas</h1><p className="kicker">Move an object and see its easing curves!</p></div>
          <div className="canvas-tools">
            <div className="shape-menu-wrap">
              <button className="tool-button" onClick={() => setShowShapes(!showShapes)} disabled={phase === 'recording'}><Plus size={17} /> Shape <ChevronDown size={13} /></button>
              {showShapes && <div className="shape-popover"><button onClick={() => addShape('square')}><Square size={18} /> Square</button><button onClick={() => addShape('circle')}><CircleIcon size={18} /> Circle</button><button onClick={() => addShape('triangle')}><Triangle size={18} /> Triangle</button></div>}
            </div>
            <button className="tool-button" onClick={() => fileInput.current?.click()} disabled={phase === 'recording'}><ImagePlus size={17} /> Import</button>
            <input ref={fileInput} type="file" accept="image/*" hidden onChange={(event) => handleUpload(event.target.files?.[0])} />
          </div>
        </div>

        <div className={`canvas-card ${phase === 'recording' ? 'is-recording' : ''}`}>
          <div className="canvas-bar">
            <div className="object-identity"><Box size={15} /><span>{object.name}</span>{object.kind !== 'image' && <ShapeColorPicker value={object.fill} onChange={fill => updateObject({ ...objectRef.current, fill })} disabled={phase === 'recording' || phase === 'countdown'} />}</div>
            <div className="stage-stats-wrap">
              <div className="stage-grid-controls stage-grid-controls-inline">
                <button type="button" className={`grid-toggle-button ${gridEnabled ? 'on' : 'off'}`} onClick={() => setGridEnabled(!gridEnabled)} aria-pressed={gridEnabled} aria-label={gridEnabled ? 'Disable grid' : 'Enable grid'}>
                  <span className="grid-toggle-label">Grid</span>
                  <span className="grid-toggle-track" aria-hidden="true">
                    <span className="grid-toggle-thumb" />
                  </span>
                </button>
                {gridOpen && (
                  <div className="grid-panel" role="group" aria-label="Grid settings">
                    <label className="grid-slider-row">
                      <span>Opacity</span>
                      <div className="grid-opacity-control">
                        <input type="range" min="10" max="100" value={gridOpacity} onChange={event => setGridOpacity(Number(event.target.value))} />
                      </div>
                    </label>
                  </div>
                )}
              </div>
              <div className="stage-stats"><span>x: {Math.round(object.x)}</span><span>y: {Math.round(object.y)}</span><span>{Math.round(object.rotation)}°</span></div>
            </div>
          </div>
          <MotionStage object={object} onChange={updateObject} countdown={countdown} recording={phase === 'recording'} motionPath={trailSamples} gridEnabled={gridEnabled} gridColor={gridColor} gridOpacity={gridOpacity} />
          <div className="playback-bar capture-bar">
            <button className={`play-button ${phase === 'recording' ? 'stop' : ''}`} onClick={phase === 'recording' ? stopCapture : startCapture} disabled={phase === 'countdown'}>{phase === 'recording' ? <StopCircle size={17} /> : <Play size={17} fill="currentColor" />}</button>
            <span className="timecode">{elapsed.toFixed(1)}s</span>
            <div className="timeline"><div className="timeline-fill" style={{ width: `${progress * 100}%` }} /><span className="timeline-thumb" style={{ left: `${progress * 100}%` }} /></div>
            <span className="timecode">{duration.toFixed(1)}s</span>
            <label className="duration-control"><span>Record for:</span><select value={duration} disabled={phase === 'recording' || phase === 'countdown'} onChange={(event) => setDuration(Number(event.target.value))} aria-label="Recording duration"><option value="1">1 second</option><option value="2">2 seconds</option><option value="3">3 seconds</option><option value="5">5 seconds</option><option value="8">8 seconds</option><option value="10">10 seconds</option></select></label>
            <button className={`record-button ${phase === 'recording' ? 'stop' : ''}`} onClick={phase === 'recording' ? stopCapture : startCapture} disabled={phase === 'countdown'}>{phase === 'recording' ? <StopCircle size={15} /> : <span className="record-dot" />}{captureLabel}</button>
          </div>
        </div>

        <div className="capture-help">
          <div><span>1</span><p><strong>Choose how long you want to record for</strong></p></div>
          <div><span>2</span><p><strong>Press record</strong>You'll get a 3-second countdown.</p></div>
          <div><span>3</span><p><strong>Move your object in whatever motion you want</strong>Learn what graphs you can use to recreate it!</p></div>
        </div>
      </section>

      <MotionGuide motionResult={motionResult} activeTab={activeTab} setActiveTab={setActiveTab} />
    </div>
  )
}
