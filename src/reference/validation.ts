import { TECHNIQUES, UNITS } from './types.ts'
import type { RecreationSpec, ReferenceAnalysis, ReferenceValidationIssue, ReferenceValidationResult } from './types.ts'

type ObjectValue = Record<string, unknown>
class Validator {
  errors: ReferenceValidationIssue[] = []
  error(path: string, message: string) { this.errors.push({ path, message }) }
  object(value: unknown, path: string, keys: string[]): ObjectValue {
    if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
      this.error(path, 'Expected a plain object'); return {}
    }
    const object = value as ObjectValue
    for (const key of Object.keys(object)) if (!keys.includes(key)) this.error(`${path}.${key}`, 'Unsupported field')
    for (const key of keys) if (!Object.hasOwn(object, key)) this.error(`${path}.${key}`, 'Required field')
    return object
  }
  text(value: unknown, path: string) {
    if (typeof value !== 'string' || !value.trim() || value.length > 10000) this.error(path, 'Expected nonempty text up to 10000 characters')
  }
  choice(value: unknown, path: string, choices: readonly unknown[]) {
    if (!choices.includes(value)) this.error(path, `Expected one of: ${choices.join(', ')}`)
  }
  number(value: unknown, path: string, min = -Infinity, max = Infinity) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) this.error(path, 'Expected a finite number in range')
  }
  array(value: unknown, path: string, visit: (item: unknown, path: string) => void) {
    if (!Array.isArray(value) || value.length > 1000) { this.error(path, 'Expected an array of at most 1000 entries'); return }
    value.forEach((item, index) => visit(item, `${path}[${index}]`))
  }
  estimate(value: unknown, path: string, context: 'metadata' | 'observation' | 'recreation', unit?: string) {
    const unknown = !!value && typeof value === 'object' && 'provenance' in value && value.provenance === 'unknown'
    const o = this.object(value, path, unknown ? ['provenance', 'value', 'unit', 'basis'] : ['provenance', 'source', 'value', 'unit', 'basis'])
    const allowed = context === 'metadata' ? ['measured', 'derived', 'suggested', 'exact_reference', 'unknown'] : context === 'observation' ? ['measured', 'derived', 'unknown'] : ['derived', 'suggested', 'unknown']
    this.choice(o.provenance, `${path}.provenance`, allowed)
    this.choice(o.unit, `${path}.unit`, unit ? [unit] : UNITS)
    this.text(o.basis, `${path}.basis`)
    if (unknown) this.choice(o.value, `${path}.value`, [null])
    else {
      this.number(o.value, `${path}.value`)
      this.choice(o.source, `${path}.source`, o.provenance === 'exact_reference' ? ['video_metadata'] : o.provenance === 'measured' ? ['video_measurement'] : ['video_measurement', 'model', 'user'])
    }
    return o
  }
  ids = new Set<string>()
  id(value: unknown, path: string, set = this.ids) {
    this.text(value, path)
    if (typeof value === 'string') {
      if (set.has(value)) this.error(path, 'Duplicate ID')
      set.add(value)
    }
  }
  links(value: unknown, path: string, targets: Set<string>) {
    const seen = new Set<string>()
    this.array(value, path, (id, p) => {
      this.id(id, p, seen)
      if (typeof id === 'string' && !targets.has(id)) this.error(p, 'Unresolved reference')
    })
  }
  spec(value: unknown, path: string, hypotheses: Set<string>) {
    const o = this.object(value, path, ['kind', 'rationale', 'steps'])
    this.choice(o.kind, `${path}.kind`, ['plausible_recreation'])
    this.text(o.rationale, `${path}.rationale`)
    this.array(o.steps, `${path}.steps`, (value, p) => {
      const step = this.object(value, p, ['id', 'technique', 'intent', 'hypothesisIds', 'parameters'])
      this.id(step.id, `${p}.id`)
      this.choice(step.technique, `${p}.technique`, TECHNIQUES)
      this.text(step.intent, `${p}.intent`)
      this.links(step.hypothesisIds, `${p}.hypothesisIds`, hypotheses)
      const names = new Set<string>()
      this.array(step.parameters, `${p}.parameters`, (value, q) => {
        const parameter = this.object(value, q, ['name', 'estimate'])
        this.choice(parameter.name, `${q}.name`, ['duration', 'delay', 'intensity', 'repetitions'])
        this.id(parameter.name, `${q}.name`, names)
        const time = parameter.name === 'duration' || parameter.name === 'delay'
        const estimate = this.estimate(parameter.estimate, `${q}.estimate`, 'recreation', time ? 'seconds' : 'ratio')
        if (estimate.value !== null) {
          this.number(estimate.value, `${q}.estimate.value`, parameter.name === 'duration' || parameter.name === 'repetitions' ? Number.MIN_VALUE : 0)
          if (parameter.name === 'repetitions' && !Number.isInteger(estimate.value)) this.error(`${q}.estimate.value`, 'Expected integer repetitions')
        }
      })
    })
  }
  result<T>(value: unknown): ReferenceValidationResult<T> {
    return this.errors.length ? { valid: false, errors: this.errors } : { valid: true, data: structuredClone(value) as T, errors: [] }
  }
}

/** Validates untrusted data without coercion; returns a detached snapshot on success. */
export function validateReferenceAnalysis(value: unknown): ReferenceValidationResult<ReferenceAnalysis> {
  const v = new Validator()
  const o = v.object(value, '$', ['schemaVersion', 'kind', 'reference', 'observations', 'hypotheses', 'recreation'])
  v.choice(o.schemaVersion, '$.schemaVersion', [1])
  v.choice(o.kind, '$.kind', ['reference_analysis'])
  const reference = v.object(o.reference, '$.reference', ['videoId', 'question', 'metadata'])
  v.text(reference.videoId, '$.reference.videoId'); v.text(reference.question, '$.reference.question')
  const metadata = v.object(reference.metadata, '$.reference.metadata', ['duration', 'width', 'height', 'frameRate'])
  for (const [key, unit] of Object.entries({ duration: 'seconds', width: 'pixels', height: 'pixels', frameRate: 'fps' })) {
    const p = `$.reference.metadata.${key}`
    const estimate = v.estimate(metadata[key], p, 'metadata', unit)
    if (estimate.value !== null) {
      v.number(estimate.value, `${p}.value`, Number.MIN_VALUE)
      if ((key === 'width' || key === 'height') && !Number.isInteger(estimate.value)) v.error(`${p}.value`, 'Expected integer dimensions')
    }
  }
  const observations = new Set<string>()
  v.array(o.observations, '$.observations', (value, p) => {
    const observation = v.object(value, p, ['id', 'description', 'confidence', 'measurements'])
    v.id(observation.id, `${p}.id`); if (typeof observation.id === 'string') observations.add(observation.id)
    v.text(observation.description, `${p}.description`); v.number(observation.confidence, `${p}.confidence`, 0, 1)
    v.array(observation.measurements, `${p}.measurements`, (value, q) => {
      const measurement = v.object(value, q, ['quantity', 'estimate'])
      const units: Record<string, string> = { screen_x: 'pixels', screen_y: 'pixels', apparent_rotation: 'degrees', apparent_scale: 'ratio', brightness: 'ratio', event_time: 'seconds' }
      v.choice(measurement.quantity, `${q}.quantity`, Object.keys(units))
      const estimate = v.estimate(measurement.estimate, `${q}.estimate`, 'observation', units[String(measurement.quantity)])
      if (['event_time', 'apparent_scale', 'brightness'].includes(String(measurement.quantity)) && estimate.value !== null) v.number(estimate.value, `${q}.estimate.value`, 0)
    })
  })
  const hypotheses = new Set<string>()
  v.array(o.hypotheses, '$.hypotheses', (value, p) => {
    const hypothesis = v.object(value, p, ['id', 'technique', 'confidence', 'rationale', 'observationIds'])
    v.id(hypothesis.id, `${p}.id`); if (typeof hypothesis.id === 'string') hypotheses.add(hypothesis.id)
    v.choice(hypothesis.technique, `${p}.technique`, TECHNIQUES)
    v.number(hypothesis.confidence, `${p}.confidence`, 0, 1); v.text(hypothesis.rationale, `${p}.rationale`)
    v.links(hypothesis.observationIds, `${p}.observationIds`, observations)
  })
  v.spec(o.recreation, '$.recreation', hypotheses)
  return v.result<ReferenceAnalysis>(value)
}

/** Standalone plans can reference only explicitly supplied, already validated hypotheses. */
export function validateRecreationSpec(value: unknown, hypothesisIds: readonly string[] = []): ReferenceValidationResult<RecreationSpec> {
  const v = new Validator()
  v.spec(value, '$', new Set(hypothesisIds))
  return v.result<RecreationSpec>(value)
}
