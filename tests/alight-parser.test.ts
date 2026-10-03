import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import { it } from 'node:test'
import { parseAlightXml } from '../src/alight/parser.ts'
import { inspectProject } from '../src/alight/inspect.ts'
import type { AnimationLayer, AnimationProperty, AnimationScene, XmlElement } from '../src/alight/types.ts'

const fixture = new URL('./fixtures/alight/real-world/Odette x Sing me to sleep.xml', import.meta.url)
const xml = readFileSync(fixture, 'utf8')
const result = parseAlightXml(xml)
assert.ok(result.project)
const project = result.project
const allLayers = (scene: AnimationScene): AnimationLayer[] => [
  ...scene.layers,
  ...scene.layers.flatMap(layer => layer.scenes.flatMap(allLayers)),
  ...scene.scenes.flatMap(allLayers),
]
const layers = allLayers(project)
const allProperties = (layer: AnimationLayer): AnimationProperty[] => [
  ...layer.properties, ...layer.transforms.flatMap(transform => transform.properties),
  ...layer.effects.flatMap(effect => effect.properties),
]
const keyframes = layers.flatMap(allProperties).flatMap(property => property.keyframes)
const parseLayer = (body: string, attrs = '') => parseAlightXml(`<scene><shape id="a" startTime="0" endTime="100" ${attrs}>${body}</shape></scene>`)

it('parses the actual Odette metadata, bookmarks, scenes, and complete inventory', () => {
  assert.deepEqual(result.errors, [])
  assert.equal(project.title, 'Odette x Sing me to sleep')
  assert.equal(project.fps, 30)
  assert.equal(project.totalTime, 14262)
  assert.deepEqual([project.width, project.height, project.exportWidth, project.exportHeight], [1338, 1078, 1080, 1080])
  assert.equal(project.metadata.amplatform, 'android')
  assert.equal(project.metadata.amver, '106019')
  assert.equal(project.bookmarks.length, 21)
  assert.equal(project.bookmarks[0].rawTime, '16')
  const summary = inspectProject(project)
  assert.equal(summary.layerCount, 98)
  assert.deepEqual(summary.layerCounts, { media: 21, null: 8, embedded: 17, shape: 52 })
  assert.equal(summary.nestedSceneCount, 17)
  assert.equal(summary.keyframeCount, 239)
  assert.equal(summary.parentRelationships.length, 7)
  assert.equal(summary.effectUsage['com.alightcreative.effects.flip3'], 10)
  assert.equal(summary.effectUsage['com.alightcreative.effects.motionblur4'], 8)
  assert.equal(summary.effectUsage['com.alightcreative.effects.oscillate3'], 8)
  assert.equal(Object.values(summary.effectUsage).reduce((a, b) => a + b, 0), 144)
})

it('preserves hidden layers, media timing, parents, shape details and blending', () => {
  assert.ok(layers.some(layer => layer.hidden === true))
  const media = layers.find(layer => layer.id === '205149955')!
  assert.equal(media.parentId, '205149964')
  assert.equal(media.timing.speed, 1.049550)
  assert.equal(media.raw.attributes.speed, '1.049550')
  assert.equal(media.timing.outTime, 699)
  assert.equal(layers.find(layer => layer.id === '205149922')!.timing.inTime, 101200)
  assert.ok(media.media.fillVideo.startsWith('content://'))
  assert.ok(layers.some(layer => layer.blending === 'mask'))
  assert.ok(layers.some(layer => layer.blending === 'diff'))
  assert.ok(layers.some(layer => layer.shapeType === '.roundrect'))
  assert.ok(layers.flatMap(allProperties).some(property => property.name === 'size' && property.type === 'vec2'))
  assert.ok(layers.flatMap(allProperties).some(property => /radius/i.test(property.name)))
})

it('retains five independent masked Flip Layer sequences at 2333–3032 ms', () => {
  const group = layers.find(layer => layer.id === '205149990')!
  assert.deepEqual([group.timing.startTime, group.timing.endTime], [2333, 3032])
  const scene = group.scenes[0]
  assert.equal(scene.totalTime, 699)
  assert.equal(scene.ownerLayerPath, group.source.path)
  assert.equal(scene.parentScenePath, project.source.path)
  const nested = scene.layers.filter(layer => layer.kind === 'embedded')
  assert.deepEqual(nested.map(layer => layer.id), ['205149984', '205149985', '205149986', '205149987', '205149988'])
  const sequences = nested.map(layer => {
    assert.equal(layer.scenes[0].layers.filter(child => child.blending === 'mask').length, 1)
    const flip = layer.effects.find(effect => effect.id === 'com.alightcreative.effects.flip3')!
    assert.equal(flip.locallyApplied, true)
    return flip.properties.find(property => property.name === 'angle')!
  })
  assert.deepEqual(sequences.map(property => property.keyframes.map(kf => [kf.timing.sourceT, kf.value.raw])), [
    [['0.977110', '0.000000'], ['0.024320', '-16.200001']],
    [['0.690987', '0.000000'], ['0.024320', '-30.100000']],
    [['0.500715', '0.000000'], ['0.024320', '-57.000000']],
    [['0.977110', '0.000000'], ['0.024320', '-68.700005']],
    [['0.024320', '-90.099998'], ['0.977110', '0.000000']],
  ])
  assert.equal(new Set(sequences.map(property => property.source.path)).size, 5)
})

it('preserves every keyframe, raw time, easing token, and source reference without fitting', () => {
  const nodes = new Map<string, XmlElement>()
  const visit = (node: XmlElement) => { nodes.set(node.source.path, node); node.children.forEach(visit) }
  visit(project.raw)
  assert.equal(keyframes.length, [...nodes.values()].filter(node => node.source.element === 'kf').length)
  for (const frame of keyframes) {
    const node = nodes.get(frame.source.path)!
    assert.equal(frame.timing.sourceT, node.attributes.t)
    assert.equal(frame.timing.sourceValue, Number(node.attributes.t))
    assert.equal(frame.value.raw, node.attributes.v)
    assert.equal(frame.easing?.raw, node.attributes.e)
    assert.ok(nodes.has(frame.propertyPath))
    assert.ok(frame.source.line > 0)
    if (frame.easing) assert.deepEqual(frame.easing.rawParameters, node.attributes.e.split(' ').slice(1))
  }
  assert.ok(keyframes.some(frame => frame.easing?.kind === 'elastic'))
  assert.ok(keyframes.some(frame => frame.easing?.kind === 'cubicBezier'))
  assert.deepEqual(result.warnings, [])
  assert.equal(project.sourceXml, xml)
  assert.deepEqual(parseAlightXml(xml), result)
})

it('normalizes typed static/animated properties and retains unknown effects and content', () => {
  const parsed = parseLayer(`<transform><location value="1,2,3"/><scale value="1,1"/><pivot value="0,0"/><rotation value="45"/><opacity><kf t=".5" v=".7"/></opacity></transform>
    <effect id="future.effect" locallyApplied="false">
      <property name="enabled" type="bool" value="true"/>
      <property name="count" type="int" value="3"/>
      <property name="amount" type="float" value=".5000"><kf t="1" v=".25"/></property>
      <property name="point" type="vec3" value="1,2,3"/>
      <property name="tint" type="color" value="#ffAbCdEf"/>
      <property name="future" type="matrix" value="1;0;0;1"><extra mode="raw">opaque</extra><kf t="0" v="custom" e="futureCurve abc 2"/></property>
    </effect><future attr="keep"><child/></future>`, 'group="g" mask="m"')
  assert.deepEqual(parsed.errors, [])
  const layer = parsed.project!.layers[0]
  assert.deepEqual(layer.transforms[0].properties[0].staticValue!.value, [1, 2, 3])
  assert.equal(layer.transforms[0].properties[4].keyframes[0].value.value, .7)
  assert.equal(layer.effects[0].locallyApplied, false)
  const properties = layer.effects[0].properties
  assert.deepEqual(properties.slice(0, 5).map(p => p.staticValue!.value), [true, 3, .5, [1, 2, 3], '#ffAbCdEf'])
  assert.equal(properties[2].staticValue!.raw, '.5000')
  assert.equal(properties[5].keyframes[0].easing!.raw, 'futureCurve abc 2')
  assert.equal(properties[5].unknownElements[0].text, 'opaque')
  assert.equal(layer.unknownElements[0].children[0].source.element, 'child')
  assert.deepEqual(layer.maskGroupAttributes, { group: 'g', mask: 'm' })
  assert.ok(parsed.warnings.some(w => w.code === 'UNKNOWN_EASING'))
  assert.equal(properties[5].keyframes[0].source.effectId, 'future.effect')
  assert.equal(properties[5].keyframes[0].source.propertyName, 'future')
})

it('reports malformed numbers, keyframes, timing and easing without substituting values', () => {
  const parsed = parseAlightXml(`<scene fps="NaN" width="0"><shape id="a" startTime="100" endTime="0" speed="Infinity" hidden="yes">
    <transform><location value="1,oops,3"/></transform>
    <effect id="e" locallyApplied="maybe">
      <property name="n" type="int" value="1.5"/>
      <property name="f" type="float"><kf t="bad" v="oops" e="cubicBezier 0 0 1"/><kf v="3" e="elastic 0 bad 1 2"/><kf t=".5"/></property>
    </effect></shape></scene>`)
  const codes = parsed.errors.map(error => error.code)
  for (const code of ['MALFORMED_NUMBER', 'MALFORMED_VECTOR', 'MALFORMED_BOOLEAN', 'MALFORMED_INTEGER', 'INVALID_LAYER_TIMING', 'INVALID_SCENE_METRIC', 'MALFORMED_KEYFRAME', 'MALFORMED_EASING']) assert.ok(codes.includes(code), code)
  const layer = parsed.project!.layers[0]
  assert.equal(layer.timing.endTime, 0)
  assert.equal(layer.timing.speed, undefined)
  const frame = layer.effects[0].properties[1].keyframes[0]
  assert.equal(frame.timing.sourceValue, null)
  assert.equal(frame.value.raw, 'oops')
  assert.equal(frame.value.value, null)
  assert.equal(frame.easing!.raw, 'cubicBezier 0 0 1')
  assert.ok(parsed.errors.every(error => error.source?.path))
})

it('validates scene-scoped IDs, unresolved/ambiguous parents, and cycles', () => {
  const parsed = parseAlightXml(`<scene id="root">
    <nullobj id="a" parent="b" startTime="0" endTime="1"/>
    <nullobj id="b" parent="a" startTime="0" endTime="1"/>
    <shape id="dup" startTime="0" endTime="1"/><shape id="dup" startTime="0" endTime="1"/>
    <shape id="c" parent="dup" startTime="0" endTime="1"/>
    <shape id="d" parent="missing" startTime="0" endTime="1"/>
    <embedScene id="g" startTime="0" endTime="1"><scene id="root"><shape id="a" parent="b" startTime="0" endTime="1"/></scene></embedScene>
  </scene>`)
  const codes = parsed.errors.map(error => error.code)
  assert.equal(codes.filter(code => code === 'DUPLICATE_LAYER_ID').length, 1)
  assert.equal(codes.filter(code => code === 'UNRESOLVED_PARENT').length, 2)
  for (const code of ['PARENT_CYCLE', 'AMBIGUOUS_PARENT', 'DUPLICATE_SCENE_ID']) assert.ok(codes.includes(code))
})

it('retains structurally invalid nested scenes and reports them', () => {
  const parsed = parseAlightXml(`<scene><embedScene id="g" startTime="0" endTime="1"><scene/><scene/></embedScene>
    <shape id="a" startTime="0" endTime="1"><effect id="e"><scene/></effect></shape>
    <embedScene id="empty" startTime="0" endTime="1"/></scene>`)
  assert.equal(parsed.errors.filter(e => e.code === 'INVALID_EMBEDDED_SCENE').length, 2)
  assert.ok(parsed.errors.some(e => e.code === 'INVALID_NESTED_SCENE'))
  assert.equal(parsed.project!.layers[0].scenes.length, 2)
  assert.equal(parsed.project!.layers[1].effects[0].unknownElements[0].source.element, 'scene')
})

it('retains direct nested scene IDs and generic unknown layer types', () => {
  const parsed = parseAlightXml('<scene id="p"><scene id="nested"/><futureLayer id="f" startTime="0" endTime="1"><property name="p" type="future" value="raw"/></futureLayer></scene>')
  assert.equal(parsed.project!.scenes[0].id, 'nested')
  assert.equal(parsed.project!.scenes[0].parentScenePath, '/scene[1]')
  assert.equal(parsed.project!.layers[0].kind, 'unknown')
  assert.equal(parsed.project!.layers[0].properties[0].staticValue!.raw, 'raw')
})

it('rejects malformed XML, duplicate attributes, DTDs, invalid roots and excessive depth', () => {
  for (const input of ['', '<scene>', '<scene/><scene/>', '<scene title="a" title="b"/>', '<scene>&undefined;</scene>', '<!DOCTYPE scene [<!ENTITY x "test">]><scene>&x;</scene>', '<scene>' + '<scene>'.repeat(129) + '</scene>'.repeat(130)]) {
    const parsed = parseAlightXml(input)
    assert.equal(parsed.project, null)
    assert.equal(parsed.errors[0].code, 'INVALID_XML')
  }
  assert.equal(parseAlightXml('<project/>').errors[0].code, 'INVALID_ROOT')
})

it('preserves the lexical source while decoding XML entities and CDATA', () => {
  const input = '<scene title="A &amp; B"><future value="&#49;.00"><![CDATA[<opaque>]]></future></scene>'
  const parsed = parseAlightXml(input)
  assert.equal(parsed.project!.title, 'A & B')
  assert.equal(parsed.project!.unknownElements[0].attributes.value, '1.00')
  assert.equal(parsed.project!.unknownElements[0].text, '<opaque>')
  assert.equal(parsed.project!.sourceXml, input)
})

it('inspection handles arbitrary effect IDs and the CLI reports counts and errors', () => {
  const parsed = parseLayer('<effect id="__proto__"/><effect id="__proto__"/>')
  assert.equal(inspectProject(parsed.project!).effectUsage.__proto__, 2)
  const command = spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/alight-inspect.ts', fileURLToPath(fixture)], { encoding: 'utf8' })
  assert.equal(command.status, 0, command.stderr)
  const output = JSON.parse(command.stdout)
  assert.equal(output.project.keyframeCount, 239)
  assert.deepEqual(output.errors, [])
  assert.equal(output.warnings.length, 0)
  const missing = spawnSync(process.execPath, ['--experimental-strip-types', 'scripts/alight-inspect.ts'], { encoding: 'utf8' })
  assert.equal(missing.status, 1)
  assert.match(missing.stderr, /Usage:/)
})
