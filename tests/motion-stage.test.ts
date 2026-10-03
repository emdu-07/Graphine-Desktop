import assert from 'node:assert/strict'
import { after, before, it } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import type { ViteDevServer } from 'vite'
import Konva from 'konva'

// Inspect the canvas scene's props without requiring a browser or a canvas dependency.
let server: ViteDevServer
let scene: { kind: string; props: Record<string, unknown> }[]
before(async () => {
  server = await createServer({
    configFile: false,
    ssr: { noExternal: ['react-konva'] },
    optimizeDeps: { noDiscovery: true, include: [] },
    esbuild: { jsx: 'automatic' },
    server: { middlewareMode: true, ws: false, watch: null },
    plugins: [{
      name: 'inspect-canvas-scene',
      enforce: 'pre',
      resolveId(id) { if (id === 'react-konva') return '\0canvas-scene' },
      load(id) {
        if (id !== '\0canvas-scene') return
        return `export const scene = [];
          ${['Circle', 'Group', 'Image', 'Layer', 'Line', 'Rect', 'Stage', 'Text', 'Transformer'].map(kind =>
            `export function ${kind}({ children, ...props }) { scene.push({ kind: '${kind}', props }); return children ?? null; }`
          ).join('\n')}`
      },
    }],
  })
  scene = (await server.ssrLoadModule('\0canvas-scene')).scene
})
after(async () => { await server?.close() })

const object = {
  id: 'test', name: 'Test shape', kind: 'square', x: 150, y: 74,
  startX: 300, startY: 210, width: 126, height: 126, rotation: 0, fill: '#b7a5ff',
}

async function render(props = {}) {
  scene.length = 0
  const { MotionStage } = await server.ssrLoadModule('/src/components/MotionStage.tsx')
  renderToStaticMarkup(createElement(MotionStage, { object, onChange() {}, ...props }))
}

it('hides motion markers before recording, including during the countdown', async () => {
  for (const props of [{}, { countdown: 3 }]) {
    await render(props)
    assert.equal(scene.some(node => node.kind === 'Text' && ['START', 'END'].includes(String(node.props.text))), false)
    assert.equal(scene.some(node => node.kind === 'Line' && node.props.stroke === '#63727a'), false)
    assert.equal(scene.some(node => node.kind === 'Circle' && node.props.stroke === '#93a1a9'), false)
  }
})

it('shows the motion markers during recording and for a captured path', async () => {
  for (const props of [{ recording: true }, { motionPath: [{ time: 0, x: 300, y: 210, rotation: 0 }] }]) {
    await render(props)
    assert.ok(scene.some(node => node.kind === 'Text' && node.props.text === 'START'))
    assert.ok(scene.some(node => node.kind === 'Line' && node.props.stroke === '#63727a'))
  }
})

it('overlays the unsmoothed dotted trajectory and marks its start, corner and end', async () => {
  const motionPath = [[100, 100], [110, 100], [120, 100], [120, 110], [120, 120]].map(([x, y], i) => ({ time: i * .1, x, y, rotation: 0 }))
  await render({ motionPath })
  const overlay = scene.findIndex(node => node.props.name === 'motion-path-overlay')
  const shape = scene.findIndex(node => node.props.fill === object.fill)
  assert.ok(overlay > shape)
  assert.equal(scene[overlay].props.listening, false)
  const trail = scene.find(node => node.props.name === 'recorded-motion-path')!
  assert.deepEqual(trail.props.points, motionPath.flatMap(p => [p.x + 63, p.y + 63]))
  assert.deepEqual(trail.props.dash, [2, 5])
  assert.equal(trail.props.tension, 0)
  const dots = scene.filter(node => node.props.name === 'motion-change-marker')
  assert.deepEqual(dots.map(node => [node.props.x, node.props.y]), [[163, 163], [183, 163], [183, 183]])
  assert.ok(dots.every(node => node.props.radius === 3))
})

it('renders shapes without shadows and keeps selection bounds aligned', async () => {
  for (const kind of ['square', 'circle', 'triangle']) {
    await render({ object: { ...object, kind } })
    const shape = scene.find(node => node.props.fill === object.fill)!
    assert.ok(shape)
    assert.equal(scene.some(node => node.kind === 'Rect' && node.props.fill === '#000'), false)
    const Constructor = { Rect: Konva.Rect, Circle: Konva.Circle, Line: Konva.Line }[shape.kind]!
    const node = new Constructor(shape.props)
    assert.deepEqual(node.getClientRect({ skipShadow: true }), { x: 0, y: 0, width: 126, height: 126 })
    assert.equal(node.hasShadow(), false)
    assert.deepEqual(node.getClientRect(), { x: 0, y: 0, width: 126, height: 126 })
    node.destroy()
  }
})

it('draws a grey unfilled starting outline for each object at the captured rotation', async () => {
  for (const [kind, expected] of [['square', 'Rect'], ['circle', 'Circle'], ['triangle', 'Line'], ['image', 'Rect']]) {
    await render({ object: { ...object, kind, startRotation: 30, rotation: 80 }, recording: true })
    const outline = scene.find(node => node.props.name === 'recording-start-outline')!
    assert.equal(outline.props.x, object.startX + object.width / 2)
    assert.equal(outline.props.y, object.startY + object.height / 2)
    assert.equal(outline.props.rotation, 30)
    const stroke = scene.find(node => node.props.stroke === '#93a1a9')!
    assert.equal(stroke.kind, expected)
    assert.equal(stroke.props.fillEnabled, false)
    assert.equal(stroke.props.radius === 5, false)
  }
})

it('engages straight-line snapping sooner, resists drift, and releases for deliberate turns', async () => {
  for (const vertical of [false, true]) {
    await render()
    const group = scene.find(node => node.props.draggable)!
    let point = { x: 200, y: 200 }
    const target = {
      x: () => point.x,
      y: () => point.y,
      position(next: typeof point) { point = next },
    }
    const start = group.props.onDragStart as (event: { target: typeof target }) => void
    const move = group.props.onDragMove as typeof start
    start({ target })
    const drag = (along: number, across: number) => {
      point = vertical ? { x: 200 + across, y: 200 + along } : { x: 200 + along, y: 200 + across }
      move({ target })
      return (vertical ? point.x : point.y) - 200
    }
    assert.ok(Math.abs(drag(30, 8)) < .1)
    assert.ok(Math.abs(drag(80, 20)) < .15)
    assert.ok(Math.abs(drag(100, 50)) > 10)
  }
})

it('renders a white canvas in light mode and preserves the dark canvas in dark mode', async () => {
  const { ThemeContext } = await server.ssrLoadModule('/src/components/layout/ThemeContext.ts')
  const { MotionStage } = await server.ssrLoadModule('/src/components/MotionStage.tsx')
  for (const [theme, background, grid, selection] of [
    ['light', '#ffffff', 'rgba(223, 231, 228, 1)', '#087749'],
    ['dark', '#111b20', 'rgba(34, 48, 57, 1)', '#b8ffd9'],
  ]) {
    scene.length = 0
    renderToStaticMarkup(createElement(ThemeContext.Provider, { value: theme }, createElement(MotionStage, { object, onChange() {} })))
    assert.equal(scene.find(node => node.kind === 'Rect' && node.props.width === 1024 && node.props.height === 1024)?.props.fill, background)
    assert.ok(scene.some(node => node.kind === 'Line' && node.props.stroke === grid))
    assert.equal(scene.find(node => node.kind === 'Transformer')?.props.borderStroke, selection)
  }
})

it('hits all four world edges exactly on the first drag event and can move away again', async () => {
  for (const contact of [{ x: 63, y: 300 }, { x: 961, y: 300 }, { x: 300, y: 63 }, { x: 300, y: 961 }, { x: -50, y: -50 }]) {
    let saved = { ...object }
    await render({ onChange(next: typeof object) { saved = next } })
    const group = scene.find(node => node.props.draggable)!
    let point = { x: 300, y: 300 }
    const target = { x: () => point.x, y: () => point.y, position(next: typeof point) { point = next } }
    const start = group.props.onDragStart as (event: { target: typeof target }) => void
    const move = group.props.onDragMove as typeof start
    start({ target })
    point = contact
    move({ target })
    if (contact.x <= 63) assert.equal(saved.x, 0)
    if (contact.x >= 961) assert.equal(saved.x, 898)
    if (contact.y <= 63) assert.equal(saved.y, 0)
    if (contact.y >= 961) assert.equal(saved.y, 898)
    point = { x: 300, y: 300 }
    move({ target })
    assert.ok(saved.x > 0 && saved.x < 898)
    assert.ok(saved.y > 0 && saved.y < 898)
  }
})


it('resizes the canvas background and grid together', async () => {
  await render({ canvasWidth: 1920, canvasHeight: 1080 })
  assert.ok(scene.some(node => node.kind === 'Rect' && node.props.width === 1920 && node.props.height === 1080))
  const lines = scene.filter(node => node.kind === 'Line').map(node => node.props.points)
  assert.ok(lines.some(points => JSON.stringify(points) === '[1920,0,1920,1080]'))
  assert.ok(lines.some(points => JSON.stringify(points) === '[0,1080,1920,1080]'))
})

it('hides the resized grid when its toggle is off', async () => {
  await render({ canvasWidth: 1920, canvasHeight: 1080, gridEnabled: false })
  const grid = scene.filter(node => node.kind === 'Line' && Array.isArray(node.props.points) && node.props.points.length === 4)
  assert.ok(grid.length > 0)
  assert.ok(grid.every(node => node.props.stroke === 'transparent'))
})
