export const TECHNIQUES = ['punch_zoom', 'overshoot', 'bounce', 'anticipation', 'pan', 'zoom', 'shake', 'camera_depth', 'masked_reveal', 'glow_pulse'] as const
export type Technique = typeof TECHNIQUES[number]

export const UNITS = ['seconds', 'pixels', 'degrees', 'ratio', 'fps'] as const
export type ReferenceUnit = typeof UNITS[number]

/** Source identifies who supplied the value, not proof of original project settings. */
export type EstimateSource = 'video_measurement' | 'model' | 'user'
export type EstimatedNumber =
  | { provenance: 'measured'; source: 'video_measurement'; value: number; unit: ReferenceUnit; basis: string }
  | { provenance: 'derived' | 'suggested'; source: EstimateSource; value: number; unit: ReferenceUnit; basis: string }
  | { provenance: 'unknown'; value: null; unit: ReferenceUnit; basis: string }

/** Exactness applies ONLY to trusted video metadata, never editor keyframes/settings. */
export type MetadataNumber = EstimatedNumber | {
  provenance: 'exact_reference'
  source: 'video_metadata'
  value: number
  unit: ReferenceUnit
  basis: string
}
export type ObservedNumber = Exclude<EstimatedNumber, { provenance: 'derived' | 'suggested' }> |
  { provenance: 'derived'; source: EstimateSource; value: number; unit: ReferenceUnit; basis: string }
export type RecreationNumber = Exclude<EstimatedNumber, { provenance: 'measured' }>

export interface ReferenceObservation {
  id: string
  /** Visible evidence, not an inferred editing technique. Plain text only. */
  description: string
  confidence: number // 0..1; confidence is not verification
  measurements: { quantity: 'screen_x' | 'screen_y' | 'apparent_rotation' | 'apparent_scale' | 'brightness' | 'event_time'; estimate: ObservedNumber }[]
}

export interface TechniqueHypothesis {
  id: string
  technique: Technique
  confidence: number
  rationale: string
  observationIds: string[]
}

/** Semantic intent only. A future validated adapter must produce allowlisted
 * GraphineOperation commands; only the deterministic engine may calculate motion. */
export interface RecreationSpec {
  kind: 'plausible_recreation'
  rationale: string
  steps: {
    id: string
    technique: Technique
    intent: string
    hypothesisIds: string[]
    parameters: { name: 'duration' | 'delay' | 'intensity' | 'repetitions'; estimate: RecreationNumber }[]
  }[]
}

/** What Graphine observes, interprets, and proposes; never a MotionResult. */
export interface ReferenceAnalysis {
  schemaVersion: 1
  kind: 'reference_analysis'
  reference: {
    videoId: string
    question: string
    metadata: { duration: MetadataNumber; width: MetadataNumber; height: MetadataNumber; frameRate: MetadataNumber }
  }
  observations: ReferenceObservation[]
  hypotheses: TechniqueHypothesis[]
  recreation: RecreationSpec
}

export interface ReferenceValidationIssue { path: string; message: string }
export type ReferenceValidationResult<T> =
  | { valid: true; data: T; errors: [] }
  | { valid: false; errors: ReferenceValidationIssue[] }
