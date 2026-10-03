import { FIXTURE_CATEGORIES, FIXTURE_PROVENANCE } from './types.ts'
import type { FixtureIssue, FixtureManifest, FixtureValidationResult } from './types.ts'

const REQUIRED = ['id', 'title', 'category', 'xmlPath', 'primaryConstruct', 'expectedConstructs', 'provenance', 'rendererVerified', 'humanReviewed', 'notes']
const OPTIONAL = ['renderPath', 'sourceMediaPath', 'renderReview']
const PROVENANCE: Record<string, readonly string[]> = {
  'schema-isolation': ['schema_fixture', 'synthetic'], controlled: ['controlled_project'],
  official: ['official_project'], 'real-world': ['real_world_project'], external: ['external_export'],
}

/** Metadata validation checks declarations, not renderer output or source authenticity. */
export function validateFixtureManifest(value: unknown): FixtureValidationResult {
  const errors: FixtureIssue[] = []
  const error = (path: string, message: string) => errors.push({ path, message })
  const object = (value: unknown, path: string, required: string[], optional: string[] = []): Record<string, unknown> => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
      error(path, 'Expected a plain object'); return {}
    }
    const o = value as Record<string, unknown>
    for (const key of required) if (!Object.hasOwn(o, key)) error(`${path}.${key}`, 'Required field')
    for (const key of Object.keys(o)) if (![...required, ...optional].includes(key)) error(`${path}.${key}`, 'Unsupported field')
    return o
  }
  const text = (value: unknown, path: string) => {
    if (typeof value !== 'string' || !value.trim() || value.length > 10000) error(path, 'Expected nonempty text up to 10000 characters')
  }
  const choice = (value: unknown, path: string, choices: readonly unknown[]) => {
    if (!choices.includes(value)) error(path, `Expected one of: ${choices.join(', ')}`)
  }
  const root = object(value, '$', ['schemaVersion', 'fixtures'])
  choice(root.schemaVersion, '$.schemaVersion', [1])
  const ids = new Set<string>()
  const xmlPaths = new Set<string>()
  if (!Array.isArray(root.fixtures) || root.fixtures.length > 10000) error('$.fixtures', 'Expected at most 10000 fixtures')
  else root.fixtures.forEach((value, index) => {
    const p = `$.fixtures[${index}]`
    const f = object(value, p, REQUIRED, OPTIONAL)
    for (const key of ['id', 'title', 'primaryConstruct', 'notes']) text(f[key], `${p}.${key}`)
    if (typeof f.primaryConstruct === 'string' && !/^[a-z][a-z0-9_]*$/.test(f.primaryConstruct)) error(`${p}.primaryConstruct`, 'Expected a lowercase construct tag')
    if (typeof f.id === 'string') {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(f.id)) error(`${p}.id`, 'Expected a lowercase kebab-case ID')
      if (ids.has(f.id)) error(`${p}.id`, 'Duplicate fixture ID')
      ids.add(f.id)
    }
    choice(f.category, `${p}.category`, FIXTURE_CATEGORIES)
    choice(f.provenance, `${p}.provenance`, FIXTURE_PROVENANCE)
    if (typeof f.category === 'string' && (!Object.hasOwn(PROVENANCE, f.category) || !PROVENANCE[f.category].includes(String(f.provenance)))) error(`${p}.provenance`, 'Provenance does not match category')
    for (const key of ['rendererVerified', 'humanReviewed']) if (typeof f[key] !== 'boolean') error(`${p}.${key}`, 'Expected boolean')
    for (const key of ['xmlPath', 'renderPath', 'sourceMediaPath']) {
      if (key !== 'xmlPath' && !Object.hasOwn(f, key)) continue
      const path = f[key]
      text(path, `${p}.${key}`)
      if (typeof path === 'string') {
        const parts = path.split('/')
        const controlCharacter = [...path].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
        if (/[\\:]/.test(path) || controlCharacter || parts.some(part => !part.trim() || part === '.' || part === '..') || parts.length < 2 || parts[0] !== f.category) error(`${p}.${key}`, 'Expected a safe relative path within the fixture category')
        if (key === 'xmlPath') {
          if (!path.endsWith('.xml')) error(`${p}.${key}`, 'Expected an XML file')
          if (xmlPaths.has(path)) error(`${p}.${key}`, 'Duplicate XML registration')
          xmlPaths.add(path)
        }
      }
    }
    if (f.xmlPath === f.renderPath || f.xmlPath === f.sourceMediaPath || (f.renderPath !== undefined && f.renderPath === f.sourceMediaPath)) error(p, 'XML, render, and source media must be distinct assets')
    if (!Array.isArray(f.expectedConstructs) || !f.expectedConstructs.length || f.expectedConstructs.length > 1000) error(`${p}.expectedConstructs`, 'Expected 1–1000 constructs')
    else {
      const seen = new Set<unknown>()
      f.expectedConstructs.forEach((construct, i) => {
        text(construct, `${p}.expectedConstructs[${i}]`)
        if (typeof construct === 'string' && !/^[a-z][a-z0-9_]*$/.test(construct)) error(`${p}.expectedConstructs[${i}]`, 'Expected a lowercase construct tag')
        if (seen.has(construct)) error(`${p}.expectedConstructs[${i}]`, 'Duplicate construct')
        seen.add(construct)
      })
      if (!f.expectedConstructs.includes(f.primaryConstruct)) error(`${p}.primaryConstruct`, 'Primary construct must be included in expectedConstructs')
    }
    if (f.rendererVerified === true) {
      if (f.category !== 'controlled' || f.provenance !== 'controlled_project') error(`${p}.rendererVerified`, 'Only controlled project pairs can be renderer-verified in this phase')
      if (typeof f.renderPath !== 'string' || f.humanReviewed !== true || !Object.hasOwn(f, 'renderReview')) error(`${p}.rendererVerified`, 'Requires a matching render and explicit human render review')
    }
    if (Object.hasOwn(f, 'renderReview')) {
      const r = object(f.renderReview, `${p}.renderReview`, ['reviewer', 'reviewedAt', 'projectId', 'xmlRenderMatch'])
      for (const key of ['reviewer', 'projectId']) text(r[key], `${p}.renderReview.${key}`)
      const date = r.reviewedAt
      if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) error(`${p}.renderReview.reviewedAt`, 'Expected a valid YYYY-MM-DD date')
      choice(r.xmlRenderMatch, `${p}.renderReview.xmlRenderMatch`, [true])
      if (f.rendererVerified !== true) error(`${p}.renderReview`, 'Render review belongs only to a verified controlled pair')
    }
  })
  return errors.length ? { valid: false, errors } : { valid: true, manifest: structuredClone(value) as FixtureManifest, errors: [] }
}
