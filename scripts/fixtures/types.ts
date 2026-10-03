export const FIXTURE_CATEGORIES = ['schema-isolation', 'controlled', 'official', 'real-world', 'external'] as const
export type FixtureCategory = typeof FIXTURE_CATEGORIES[number]
export const FIXTURE_PROVENANCE = ['schema_fixture', 'controlled_project', 'official_project', 'real_world_project', 'external_export', 'synthetic'] as const
export type FixtureProvenance = typeof FIXTURE_PROVENANCE[number]

export interface RenderReview {
  reviewer: string
  reviewedAt: string // YYYY-MM-DD
  projectId: string
  xmlRenderMatch: true
}

/** Paths are relative to tests/fixtures/alight, never URLs or original media URIs. */
export interface AlightFixture {
  id: string
  title: string
  category: FixtureCategory
  xmlPath: string
  renderPath?: string
  sourceMediaPath?: string
  primaryConstruct: string
  expectedConstructs: string[]
  provenance: FixtureProvenance
  rendererVerified: boolean
  humanReviewed: boolean
  notes: string
  renderReview?: RenderReview
}

export interface FixtureManifest { schemaVersion: 1; fixtures: AlightFixture[] }
export interface FixtureIssue { path: string; message: string }
export type FixtureValidationResult =
  | { valid: true; manifest: FixtureManifest; errors: [] }
  | { valid: false; errors: FixtureIssue[] }
