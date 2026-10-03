import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { it } from 'node:test'
import { inspectFixtureAssets, loadFixtureCatalog } from '../scripts/fixtures/catalog.ts'
import { validateFixtureManifest } from '../scripts/fixtures/validation.ts'
import type { FixtureManifest } from '../scripts/fixtures/types.ts'
import { parseAlightXml } from '../src/alight/parser.ts'

const root = fileURLToPath(new URL('./fixtures/alight/', import.meta.url))
function controlled(): FixtureManifest {
  return { schemaVersion: 1, fixtures: [{
    id: 'controlled-zoom', title: 'Controlled zoom', category: 'controlled',
    xmlPath: 'controlled/zoom.xml', renderPath: 'controlled/zoom.mp4', sourceMediaPath: 'controlled/source.png',
    primaryConstruct: 'animated_scale', expectedConstructs: ['animated_scale'], provenance: 'controlled_project',
    rendererVerified: true, humanReviewed: true, notes: 'Explicitly reviewed matching pair declaration for validation tests only.',
    renderReview: { reviewer: 'Test reviewer', reviewedAt: '2026-10-03', projectId: 'test-project-1', xmlRenderMatch: true },
  }] }
}

it('registers only available XML and keeps existing XML-only entries unverified', async () => {
  const catalog = await loadFixtureCatalog(root)
  assert.deepEqual(catalog.errors, [])
  assert.ok(catalog.entries.length >= 18)
  const physicalXml = (await readdir(root, { recursive: true })).filter(path => path.endsWith('.xml')).map(path => path.replaceAll('\\', '/')).sort()
  assert.deepEqual(catalog.entries.map(entry => entry.fixture.xmlPath).sort(), physicalXml)
  for (const entry of catalog.entries) {
    assert.equal(entry.xmlAvailable, true)
    assert.equal(entry.fixture.rendererVerified, false)
    assert.equal(entry.renderAvailable, false)
    const parsed = parseAlightXml(await readFile(join(root, entry.fixture.xmlPath), 'utf8'))
    assert.ok(parsed.project, entry.fixture.id)
    assert.deepEqual(parsed.errors, [], entry.fixture.id)
  }
})

it('accepts explicitly reviewed controlled pairs and returns a detached manifest', () => {
  const input = controlled()
  const result = validateFixtureManifest(input)
  assert.equal(result.valid, true)
  input.fixtures[0].rendererVerified = false
  if (result.valid) assert.equal(result.manifest.fixtures[0].rendererVerified, true)
})

it('preserves the registered size, gradient, animation, shape, and blend constructs without evaluating them', async () => {
  const load = async (file: string) => {
    const result = parseAlightXml(await readFile(join(root, 'schema-isolation', file), 'utf8'))
    assert.deepEqual(result.errors, [])
    assert.ok(result.project)
    return result.project
  }
  const size = await load('03-size-property.xml')
  assert.deepEqual(size.layers[0].properties.find(p => p.name === 'size')!.staticValue!.value, [800, 800])
  const gradient = await load('04-static-gradient.xml')
  assert.equal(gradient.layers[0].fillType, 'gradient')
  assert.equal(gradient.layers[0].unknownElements.find(e => e.source.element === 'gradient')!.attributes.type, 'linear')
  for (const [file, property, count] of [
    ['05-animated-location.xml', 'location', 3], ['07-animated-scale.xml', 'scale', 2], ['08-animated-opacity.xml', 'opacity', 3],
  ] as const) {
    const project = await load(file)
    const keys = project.layers[0].transforms[0].properties.find(p => p.name === property)!.keyframes
    assert.equal(keys.length, count)
    assert.equal(keys[0].timing.sourceT, '0.000000')
  }
  assert.equal((await load('06-circle-shape.xml')).layers[0].shapeType, '.circle')
  const childBlend = await load('09-screen-blend.xml')
  assert.equal(childBlend.layers[0].blending, undefined)
  assert.equal(childBlend.layers[0].unknownElements.find(e => e.source.element === 'blendMode')!.attributes.value, 'screen')
  const attributeBlend = await load('14-two-layer-blending-attribute.xml')
  assert.equal(attributeBlend.layers[1].blending, 'screen')
  assert.equal((await load('10-full-multi-layer.xml')).layers.length, 3)
})

it('never upgrades schema, synthetic, official, real-world, or external XML to renderer truth', () => {
  for (const [category, provenance] of [
    ['schema-isolation', 'schema_fixture'], ['schema-isolation', 'synthetic'], ['official', 'official_project'],
    ['real-world', 'real_world_project'], ['external', 'external_export'],
  ]) {
    const input = controlled()
    Object.assign(input.fixtures[0], { category, provenance, xmlPath: `${category}/test.xml`, renderPath: `${category}/test.mp4`, sourceMediaPath: `${category}/source.png` })
    assert.equal(validateFixtureManifest(input).valid, false, provenance)
    input.fixtures[0].rendererVerified = false
    delete input.fixtures[0].renderReview
    assert.equal(validateFixtureManifest(input).valid, true, provenance)
  }
})

it('requires matching-render review, human review, and a render path for verification', () => {
  for (const change of [
    (m: FixtureManifest) => { delete m.fixtures[0].renderPath },
    (m: FixtureManifest) => { delete m.fixtures[0].renderReview },
    (m: FixtureManifest) => { m.fixtures[0].humanReviewed = false },
    (m: FixtureManifest) => { Object.assign(m.fixtures[0].renderReview!, { xmlRenderMatch: false }) },
    (m: FixtureManifest) => { m.fixtures[0].renderReview!.reviewedAt = '2026-02-30' },
    (m: FixtureManifest) => { m.fixtures[0].renderReview!.reviewer = '' },
    (m: FixtureManifest) => { m.fixtures[0].renderReview!.projectId = '' },
  ]) { const input = controlled(); change(input); assert.equal(validateFixtureManifest(input).valid, false) }
})

it('rejects invalid schema, unknown metadata, duplicates, and category/provenance mismatch', () => {
  for (const value of [null, [], {}, { ...controlled(), schemaVersion: 2 }, { ...controlled(), trainingTruth: true }]) assert.equal(validateFixtureManifest(value).valid, false)
  for (const patch of [
    { id: 'Bad ID' }, { title: '' }, { notes: '' }, { category: '__proto__' }, { provenance: 'unknown' },
    { provenance: 'schema_fixture' }, { rendererVerified: 'true' }, { humanReviewed: 1 },
    { expectedConstructs: [] }, { expectedConstructs: ['animated_scale', 'animated_scale'] },
    { expectedConstructs: [42] }, { primaryConstruct: 'unlisted' }, { originalEditorGroundTruth: true },
    { primaryConstruct: 'tab\tspoof', expectedConstructs: ['tab\tspoof'] },
  ]) { const input = controlled(); Object.assign(input.fixtures[0], patch); assert.equal(validateFixtureManifest(input).valid, false, JSON.stringify(patch)) }
  const duplicate = controlled(); duplicate.fixtures.push(structuredClone(duplicate.fixtures[0]))
  const result = validateFixtureManifest(duplicate)
  assert.equal(result.valid, false)
  if (!result.valid) assert.ok(result.errors.some(error => error.message === 'Duplicate XML registration'))
})

it('rejects traversal, absolute paths, URLs, wrong folders, and identical assets', () => {
  for (const path of ['/tmp/test.xml', '../test.xml', 'controlled/../test.xml', 'controlled/./test.xml', 'controlled//test.xml', 'C:\\test.xml', 'https://example.com/test.xml', 'external/test.xml', 'controlled/test.json', 'controlled/test\n.xml']) {
    const input = controlled(); input.fixtures[0].xmlPath = path
    assert.equal(validateFixtureManifest(input).valid, false, path)
  }
  const input = controlled(); input.fixtures[0].renderPath = input.fixtures[0].xmlPath
  assert.equal(validateFixtureManifest(input).valid, false)
})

it('checks actual asset existence, regular files, and symlink containment independently of metadata', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'graphine-fixture-assets-'))
  try {
    const corpus = join(temp, 'corpus')
    await mkdir(join(corpus, 'controlled'), { recursive: true })
    await writeFile(join(corpus, 'controlled/zoom.xml'), '<scene/>')
    const manifest = controlled()
    const missing = await inspectFixtureAssets(manifest, corpus)
    assert.equal(missing.entries[0].xmlAvailable, true)
    assert.equal(missing.entries[0].renderAvailable, false)
    assert.equal(missing.errors.length, 2)
    await writeFile(join(temp, 'outside.mp4'), 'not a real render')
    await symlink(join(temp, 'outside.mp4'), join(corpus, 'controlled/zoom.mp4'))
    await mkdir(join(corpus, 'controlled/source.png'))
    const invalid = await inspectFixtureAssets(manifest, corpus)
    assert.equal(invalid.errors.length, 2)
    assert.ok(invalid.errors.some(error => error.message === 'Asset resolves outside the corpus'))
    assert.ok(invalid.errors.some(error => error.message === 'Asset is not a regular file'))
  } finally { await rm(temp, { recursive: true, force: true }) }
})

it('lists registered fixture provenance and availability independently of working directory', () => {
  const command = fileURLToPath(new URL('../scripts/fixtures-list.ts', import.meta.url))
  const run = spawnSync(process.execPath, ['--experimental-strip-types', command], { encoding: 'utf8', cwd: tmpdir() })
  assert.equal(run.status, 0, run.stderr)
  assert.match(run.stdout, /ID\tCATEGORY\tPRIMARY CONSTRUCT\tXML AVAILABLE\tRENDER AVAILABLE\tPROVENANCE\tRENDERER VERIFIED/)
  assert.match(run.stdout, /timing-affine\tschema-isolation\taffine_timing\ttrue\tfalse\tsynthetic\tfalse/)
  assert.match(run.stdout, /odette-sing-me-to-sleep\treal-world\tmulti_layer_composition\ttrue\tfalse\treal_world_project\tfalse/)
  const bad = spawnSync(process.execPath, ['--experimental-strip-types', command, 'unexpected'], { encoding: 'utf8' })
  assert.equal(bad.status, 1)
  assert.match(bad.stderr, /Usage:/)
})
