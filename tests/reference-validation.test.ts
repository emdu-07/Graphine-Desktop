import assert from 'node:assert/strict'
import { it } from 'node:test'
import { TECHNIQUES } from '../src/reference/types.ts'
import type { ReferenceAnalysis } from '../src/reference/types.ts'
import { validateRecreationSpec, validateReferenceAnalysis } from '../src/reference/validation.ts'
import { buildMotionResult } from '../src/motion/engine.ts'

const unknown = (unit: 'pixels' | 'fps') => ({ provenance: 'unknown' as const, value: null, unit, basis: 'Not available' })
function fixture(): ReferenceAnalysis {
  return {
    schemaVersion: 1, kind: 'reference_analysis',
    reference: { videoId: 'upload-1', question: 'How can I recreate the zoom?', metadata: {
      duration: { provenance: 'exact_reference', source: 'video_metadata', value: 2, unit: 'seconds', basis: 'Container metadata' },
      width: unknown('pixels'), height: unknown('pixels'), frameRate: unknown('fps'),
    } },
    observations: [{ id: 'o1', description: 'Subject appears larger', confidence: .8, measurements: [
      { quantity: 'apparent_scale', estimate: { provenance: 'derived', source: 'model', value: 1.2, unit: 'ratio', basis: 'Estimated visible size change' } },
    ] }],
    hypotheses: [{ id: 'h1', technique: 'punch_zoom', confidence: .6, rationale: 'Rapid apparent size change', observationIds: ['o1'] }],
    recreation: { kind: 'plausible_recreation', rationale: 'One possible recreation', steps: [{ id: 's1', technique: 'punch_zoom', intent: 'Briefly enlarge subject', hypothesisIds: ['h1'], parameters: [
      { name: 'duration', estimate: { provenance: 'suggested', source: 'user', value: .3, unit: 'seconds', basis: 'Recreation preference' } },
    ] }] },
  }
}

it('accepts structured analysis and returns a detached validated snapshot', () => {
  const input = fixture()
  const result = validateReferenceAnalysis(input)
  assert.equal(result.valid, true)
  if (result.valid) { input.observations[0].confidence = 0; assert.equal(result.data.observations[0].confidence, .8) }
  assert.equal(validateRecreationSpec(fixture().recreation, ['h1']).valid, true)
})

it('keeps reference validation independent of deterministic Motion output and capture data', () => {
  const samples = [[0, 0], [10, 0], [20, 0], [20, 10], [20, 20]].map(([x, y], i) => ({ time: i * .1, x, y, rotation: i * 5 }))
  const original = structuredClone(samples)
  const before = structuredClone(buildMotionResult(samples))
  assert.equal(validateReferenceAnalysis(fixture()).valid, true)
  assert.equal(validateReferenceAnalysis({ ...fixture(), keyframes: samples }).valid, false)
  assert.deepEqual(samples, original)
  assert.deepEqual(buildMotionResult(samples), before)
})

it('supports every allowlisted technique and empty evidence with explicit uncertainty', () => {
  for (const technique of TECHNIQUES) {
    const input = fixture(); input.hypotheses[0].technique = technique; input.recreation.steps[0].technique = technique
    assert.equal(validateReferenceAnalysis(input).valid, true)
  }
  const input = fixture(); input.observations = []; input.hypotheses = []; input.recreation.steps = []
  assert.equal(validateReferenceAnalysis(input).valid, true)
})

const invalidCases: [string, (input: ReferenceAnalysis) => void][] = [
  ['nonfinite confidence', a => { a.observations[0].confidence = NaN }],
  ['out of range confidence', a => { a.hypotheses[0].confidence = 1.1 }],
  ['duplicate IDs', a => { a.hypotheses[0].id = 'o1' }],
  ['missing evidence', a => { a.hypotheses[0].observationIds = ['missing'] }],
  ['missing hypothesis', a => { a.recreation.steps[0].hypothesisIds = ['missing'] }],
  ['negative duration', a => { a.recreation.steps[0].parameters[0].estimate.value = -1 }],
]
for (const [name, mutate] of invalidCases) it(`rejects ${name}`, () => {
  const input = fixture(); mutate(input)
  const result = validateReferenceAnalysis(input)
  assert.equal(result.valid, false)
  if (!result.valid) assert.ok(result.errors.every(error => error.path.startsWith('$') && error.message))
})

it('rejects ground truth claims, model measurements, executable fields, and unsupported techniques', () => {
  for (const patch of [
    { provenance: 'exact_reference', source: 'model' },
    { provenance: 'exact_reference', source: 'video_metadata' },
    { provenance: 'measured', source: 'model' },
    { provenance: 'verified_original' },
    { value: Infinity }, { value: '1.2' }, { unit: 'seconds' }, { originalKeyframe: true },
  ]) {
    const input = fixture(); Object.assign(input.observations[0].measurements[0].estimate, patch)
    assert.equal(validateReferenceAnalysis(input).valid, false, JSON.stringify(patch))
  }
  for (const patch of [{ keyframes: [] }, { curves: [] }, { technique: 'arbitrary_effect' }]) {
    const input = fixture(); Object.assign(input.recreation.steps[0], patch)
    assert.equal(validateReferenceAnalysis(input).valid, false)
  }
  const input = fixture(); Object.assign(input.reference.metadata.duration, { source: 'model' })
  assert.equal(validateReferenceAnalysis(input).valid, false)
})

it('rejects measured recreation parameters and malformed or unknown data', () => {
  const input = fixture(); Object.assign(input.recreation.steps[0].parameters[0].estimate, { provenance: 'measured', source: 'video_measurement' })
  assert.equal(validateReferenceAnalysis(input).valid, false)
  for (const value of [null, [], {}, { ...fixture(), schemaVersion: 2 }, { ...fixture(), verified: true }]) assert.equal(validateReferenceAnalysis(value).valid, false)
  const missing = fixture(); Reflect.deleteProperty(missing, 'observations')
  assert.equal(validateReferenceAnalysis(missing).valid, false)
  const unknownValue = fixture(); Object.assign(unknownValue.reference.metadata.width, { value: 100 })
  assert.equal(validateReferenceAnalysis(unknownValue).valid, false)
  assert.equal(validateRecreationSpec(fixture().recreation).valid, false)
})
