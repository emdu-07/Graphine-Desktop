# Reference analysis contracts

This domain has no UI, model provider, video processing, or motion-engine dependency.
`types.ts` owns the contracts and allowlists; `validation.ts` validates unknown
input with path-based errors, without coercion or accepting extra fields.

`ReferenceAnalysis` separates visible observations (with confidence and
measurements), evidence-linked technique hypotheses (with confidence), and a
`RecreationSpec` explicitly tagged `plausible_recreation`. Empty evidence and
steps are permitted when nothing can be established. Unknown numbers use null,
never a fabricated zero. All estimates include units and a basis.

Measured values require a video measurement source. Model values may be derived
or suggested, never measured or exact. `exact_reference` is available only for
video duration, dimensions, and frame rate from video metadata. It does not mean
exact original editor settings. Validation checks declared provenance, not the
truth of evidence: a future trusted metadata reader must establish exact metadata
and must never copy a model's claims into that trusted source category.

Recreation parameters express duration, delay, intensity, and repetitions as
estimates; they contain no executable paths, keyframes, rotations, scale tracks,
or easing curves. Numeric units and ranges, finite values, confidence in [0, 1],
unique IDs, evidence references, schema version, and technique allowlists are
validated. Text is plain data and must never be rendered as generated HTML.
Successful validation returns a detached snapshot.

The future workspace belongs at `src/workspaces/reference/`, using the already
reserved `reference` WorkspaceId and WorkspaceOutlet branch. It should consume
validated analysis and present a proposed recreation for review. A separate
future adapter must validate RecreationSpec, translate supported semantic intent
into allowlisted GraphineOperation commands, and pass those to the deterministic
engine. GraphineOperation and that adapter do not currently exist. Only that
engine should produce MotionResult: exact deterministic output for its input,
not verified knowledge about the reference video's original project.
