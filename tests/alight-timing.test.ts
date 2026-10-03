import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { it } from 'node:test'
import { parseAlightXml } from '../src/alight/parser.ts'
import { CONSERVATIVE_TIMING, LAYER_RELATIVE_TIMING, resolveTimeline } from '../src/alight/timeline.ts'
import type { TimingPolicy } from '../src/alight/timing-types.ts'
import type { AnimationLayer, AnimationScene } from '../src/alight/types.ts'

const load = (file: string) => parseAlightXml(readFileSync(new URL(`./fixtures/alight/${file}`, import.meta.url), 'utf8'))
const close = (actual: number | null, expected: number) => { assert.notEqual(actual, null); assert.ok(Math.abs(actual! - expected) < 1e-8, `${actual} != ${expected}`) }
const layers = (scene: AnimationScene): AnimationLayer[] => [...scene.layers, ...scene.layers.flatMap(layer => layer.scenes.flatMap(layers)), ...scene.scenes.flatMap(layers)]
interface FixtureCase {
  file: string
  policy: TimingPolicy
  groups: { id: string; projectInterval: number[]; childIds: string[]; effectId: string; propertyName: string; sourceSequences: string[][]; projectSequences: number[][] }[]
  parentCases: { parentId: string; childId: string; projectInterval: number[]; propertyName: string; sourceSequence: string[]; projectSequence: number[] }[]
}
const cases: FixtureCase[] = JSON.parse(readFileSync(new URL('./fixtures/alight/timing-cases.json', import.meta.url), 'utf8'))
for (const fixture of cases) {
  it(`${fixture.file}: timing policy preserves group instances and resolves reviewed nested coordinates`, () => {
    const parsed = load(fixture.file)
    assert.deepEqual(parsed.errors, [])
    const project = parsed.project!
    const before = JSON.stringify(project)
    const timeline = resolveTimeline(project, fixture.policy)
    assert.equal(JSON.stringify(project), before)
    assert.deepEqual(resolveTimeline(project, fixture.policy), timeline)
    for (const groupCase of fixture.groups) {
      const group = layers(project).find(layer => layer.id === groupCase.id)!
      const placement = timeline.layers.find(layer => layer.source.path === group.source.path)!
      assert.deepEqual([placement.projectInterval.start.value, placement.projectInterval.end.value], groupCase.projectInterval)
      const sceneTiming = timeline.scenes.find(scene => scene.source.path === group.scenes[0].source.path)!
      assert.deepEqual([sceneTiming.projectInterval.start.value, sceneTiming.projectInterval.end.value], groupCase.projectInterval)
      const children = group.scenes[0].layers.filter(layer => layer.kind === 'embedded')
      assert.deepEqual(children.map(layer => layer.id), groupCase.childIds)
      children.forEach((child, index) => {
        assert.equal(child.scenes[0].layers.filter(layer => layer.blending === 'mask').length, 1)
        const property = child.effects.find(effect => effect.id === groupCase.effectId)!.properties.find(property => property.name === groupCase.propertyName)!
        const frames = timeline.keyframes.filter(frame => frame.propertyPath === property.source.path)
        assert.deepEqual(frames.map(frame => frame.sourceT), groupCase.sourceSequences[index])
        frames.forEach((frame, keyframeIndex) => {
          assert.equal(frame.scenePath, group.scenes[0].source.path)
          assert.equal(frame.layerPath, child.source.path)
          assert.equal(frame.resolution, 'exact')
          close(frame.projectTimeMs.value, groupCase.projectSequences[index][keyframeIndex])
        })
      })
    }
  })
  it(`${fixture.file}: later null/parent tracks use their own layer clock; retimed child tracks remain unresolved`, () => {
    const project = load(fixture.file).project!
    const timeline = resolveTimeline(project, fixture.policy)
    for (const testCase of fixture.parentCases) {
      const parent = layers(project).find(layer => layer.id === testCase.parentId)!
      const child = layers(project).find(layer => layer.id === testCase.childId)!
      assert.equal(child.parentId, parent.id)
      const property = parent.transforms.flatMap(transform => transform.properties).find(property => property.name === testCase.propertyName)!
      const frames = timeline.keyframes.filter(frame => frame.propertyPath === property.source.path)
      assert.deepEqual(frames.map(frame => frame.sourceT), testCase.sourceSequence)
      frames.forEach((frame, index) => close(frame.projectTimeMs.value, testCase.projectSequence[index]))
      const placement = timeline.layers.find(layer => layer.source.path === child.source.path)!
      assert.deepEqual([placement.projectInterval.start.value, placement.projectInterval.end.value], testCase.projectInterval)
      assert.ok(timeline.keyframes.filter(frame => frame.layerPath === child.source.path).every(frame => frame.resolution === 'unresolved'))
    }
  })
}

it('source-only mode preserves every coordinate but makes no keyframe progress/time assertion', () => {
  const parsed = load(cases[0].file)
  assert.deepEqual(parsed.warnings, [])
  const timeline = resolveTimeline(parsed.project!)
  assert.deepEqual(timeline.policy, CONSERVATIVE_TIMING)
  assert.equal(timeline.keyframes.length, 239)
  assert.ok(timeline.keyframes.every(frame => frame.localProgress.value === null && frame.localTimeMs.value === null && frame.projectTimeMs.value === null))
  const counts = new Map<string, number>()
  for (const frame of timeline.keyframes) if (frame.sourceValue! < 0 || frame.sourceValue! > 1) counts.set(frame.sourceT!, (counts.get(frame.sourceT!) ?? 0) + 1)
  assert.deepEqual(Object.fromEntries(counts), { '-0.002224': 28, '1.019669': 21, '1.189975': 7, '1.243006': 7, '11.889148': 1, '1.753769': 1, '1.004016': 1 })
})

it('negative, modest and large source coordinates are not clamped or automatically malformed', () => {
  const timeline = resolveTimeline(load(cases[0].file).project!, LAYER_RELATIVE_TIMING)
  const group = timeline.layers.find(layer => layer.source.id === '205149990')!
  for (const [raw, expected] of [['-0.002224', 2331.445424], ['1.019669', 3045.748631], ['1.243006', 3201.861194]] as const) {
    const frame = timeline.keyframes.find(frame => frame.layerPath === group.source.path && frame.sourceT === raw)!
    assert.equal(frame.classification, 'outside-layer')
    close(frame.projectTimeMs.value, expected)
  }
  const large = timeline.keyframes.find(frame => frame.sourceT === '11.889148')!
  close(large.localTimeMs.value, 2365.940452)
  close(large.projectTimeMs.value, 8616.940452)
  assert.equal(large.withinLayerInterval, false)
  assert.equal(large.sourceT, '11.889148')
  assert.ok(timeline.diagnostics.some(d => d.code === 'TIMING_POLICY_NOT_RENDER_VERIFIED'))
})

it('synthetic affine fixture composes speed and trim through two nested scenes', () => {
  const parsed = load('schema-isolation/timing-affine.xml')
  assert.deepEqual(parsed.errors, [])
  const timeline = resolveTimeline(parsed.project!, LAYER_RELATIVE_TIMING)
  const track = timeline.layers.find(layer => layer.source.id === 'track')!
  const frames = timeline.keyframes.filter(frame => frame.layerPath === track.source.path)
  close(frames[0].sceneTimeMs.value, 200)
  close(frames[0].projectTimeMs.value, 1050)
  close(frames[1].projectTimeMs.value, 1200)
  assert.equal(frames[2].projectTimeMs.value, null)
  assert.match(frames[2].projectTimeMs.reason!, /outside/)
  const deep = timeline.layers.find(layer => layer.source.id === 'deep')!
  close(timeline.keyframes.find(frame => frame.layerPath === deep.source.path)!.projectTimeMs.value, 1050)
})

const embedded = (attrs: string, sceneAttrs = 'retime="off"', child = '') => parseAlightXml(`<scene totalTime="5000"><embedScene id="g" startTime="1000" endTime="1200" ${attrs}><scene totalTime="800" ${sceneAttrs}><shape id="s" startTime="0" endTime="800"><transform><rotation><kf t=".25" v="1"/></rotation></transform></shape>${child}</scene></embedScene></scene>`).project!
for (const [name, attrs, sceneAttrs, child] of [
  ['mismatched trim', 'speed="2" inTime="100" outTime="501"', 'retime="off"', ''],
  ['reverse speed', 'speed="-2" inTime="100"', 'retime="off"', ''],
  ['zero speed', 'speed="0" inTime="100"', 'retime="off"', ''],
  ['malformed speed', 'speed="oops" inTime="100"', 'retime="off"', ''],
  ['scene-level speed', 'speed="2" inTime="100"', 'retime="off" speed="2"', ''],
  ['conflicting owner retime', 'speed="2" inTime="100" retime="loop"', 'retime="off"', ''],
  ['freeze retime', 'speed="2" inTime="100"', 'retime="freeze"', ''],
  ['missing retime', 'speed="2" inTime="100"', '', ''],
  ['adaptive FPS', 'speed="2" inTime="100"', 'retime="off" retimeAdaptFPS="true"', ''],
  ['future time metadata', 'speed="2" inTime="100" timeOffset="5"', 'retime="off"', ''],
  ['future child time element', 'speed="2" inTime="100"', 'retime="off"', '<timeRemap/>'],
  ['beyond scene duration', 'speed="10" inTime="100"', 'retime="off"', ''],
] as const) it(`leaves ${name} unresolved without altering raw timing`, () => {
  const project = embedded(attrs, sceneAttrs, child)
  const before = JSON.stringify(project)
  const timeline = resolveTimeline(project, LAYER_RELATIVE_TIMING)
  assert.equal(timeline.keyframes[0].projectTimeMs.value, null)
  assert.ok(timeline.diagnostics.some(d => d.code === 'UNRESOLVED_CONTENT_TIMING'))
  assert.equal(JSON.stringify(project), before)
})

it('requires explicit omission conventions and supports future policies without fixture IDs', () => {
  const project = embedded('', 'retime="off"')
  const policy: TimingPolicy = { id: 'future-no-defaults', keyframeBasis: 'layer-duration', embeddedMapping: 'affine' }
  assert.equal(resolveTimeline(project, policy).keyframes[0].projectTimeMs.value, null)
  close(resolveTimeline(project, { ...policy, omittedSpeed: 1, omittedInTime: 0 }).keyframes[0].projectTimeMs.value, 1200)
})

it('rejects malformed/zero duration conversions and does not follow null-parent links as scene clocks', () => {
  const parsed = parseAlightXml('<scene totalTime="1000"><nullobj id="n" startTime="500" endTime="900"/><shape id="s" parent="n" startTime="10" endTime="110"><transform><rotation><kf t=".5" v="1"/><kf t="NaN" v="2"/></rotation></transform></shape><shape startTime="0" endTime="0"><transform><rotation><kf t=".5" v="3"/></rotation></transform></shape></scene>')
  assert.ok(parsed.errors.some(error => error.code === 'MALFORMED_NUMBER'))
  const timeline = resolveTimeline(parsed.project!, LAYER_RELATIVE_TIMING)
  close(timeline.keyframes[0].projectTimeMs.value, 60)
  assert.equal(timeline.keyframes[1].classification, 'malformed')
  assert.equal(timeline.keyframes[2].projectTimeMs.value, null)
})

it('does not invent placement for direct scenes or invalid scene/reference structures', () => {
  const direct = parseAlightXml('<scene><scene totalTime="100"><shape startTime="0" endTime="100"><transform><rotation><kf t=".5" v="1"/></rotation></transform></shape></scene></scene>').project!
  assert.equal(resolveTimeline(direct, LAYER_RELATIVE_TIMING).keyframes[0].projectTimeMs.value, null)
  const invalid = parseAlightXml('<scene totalTime="100"><shape id="x" parent="missing" startTime="0" endTime="100"><transform><rotation><kf t=".5" v="1"/></rotation></transform></shape></scene>').project!
  assert.equal(resolveTimeline(invalid, LAYER_RELATIVE_TIMING).keyframes[0].projectTimeMs.value, null)
})

it('does not interpret future property timing ranges or coordinates outside the project interval', () => {
  const parsed = parseAlightXml('<scene totalTime="100"><shape startTime="0" endTime="100"><effect id="future"><property name="angle" type="float" timeUnit="seconds"><kf t=".5" v="1"/></property><property name="other" type="float"><kf t="2" v="1"/></property></effect></shape></scene>')
  const timeline = resolveTimeline(parsed.project!, LAYER_RELATIVE_TIMING)
  assert.equal(timeline.keyframes[0].localProgress.value, null)
  assert.match(timeline.keyframes[0].projectTimeMs.reason!, /Unrecognized/)
  assert.equal(timeline.keyframes[1].sceneTimeMs.value, 200)
  assert.equal(timeline.keyframes[1].projectTimeMs.value, null)
  assert.match(timeline.keyframes[1].projectTimeMs.reason!, /outside project/)
})

it('an explicit retimed-property policy never legitimizes a malformed speed', () => {
  const project = parseAlightXml('<scene totalTime="100"><shape startTime="0" endTime="100" speed="bad"><transform><rotation><kf t=".5" v="1"/></rotation></transform></shape></scene>').project!
  const timeline = resolveTimeline(project, { ...LAYER_RELATIVE_TIMING, retimedProperties: 'layer-duration' })
  assert.equal(timeline.keyframes[0].projectTimeMs.value, null)
})
