# Deterministic Alight XML parser

`src/alight/parser.ts` exposes `parseAlightXml(xml: string): AlightParseResult`.
It returns `{ project, warnings, errors }`. XML syntax errors or a non-`scene`
root return `project: null`; domain validation errors retain a partial project
with the original values and structured diagnostics. Callers must check `errors`
before treating an IR as ground truth.

This is an independent parsing domain. It imports neither `src/motion` nor any
workspace/UI code. It describes existing animation facts; it does not evaluate
effects, calculate motion paths, fit easing, generate tutorials, or interpret
animation meaning. Nothing imports it into the frontend. The Node CLI reads files;
the parser itself does no I/O.

## Schema

See `src/alight/types.ts` for the complete TypeScript definitions.

- `AnimationProject` is the root `AnimationScene`, plus the original `sourceXml`.
- `AnimationScene` contains title, dimensions, export dimensions, fps, totalTime,
  version/platform and other metadata, bookmarks, ordered layers, direct nested
  scenes, and links to its parent scene and owning embedded layer where present.
- `AnimationLayer` contains kind, ID, label, hidden state, scene path, parent ID,
  scene-local timing, media attributes, shape type, blending, explicit mask/group
  attributes, transforms, properties, effects, and embedded scenes.
- `AnimationTransform` contains ordered properties (location, scale, rotation,
  opacity, pivot, or an unknown channel). Arrays retain duplicate occurrences.
- `AnimationProperty` contains its name/type, optional static value, ordered
  keyframes, and unrecognized child elements. Static and animated data can coexist.
  Shape size, corner radius, fill colors, and gain use this same property structure.
- `AnimationValue` contains a typed value and its raw string. Supported numeric
  types are int, float, vec2 and vec3; transform vectors allow two or three
  components. Booleans accept the XML spellings `true` and `false`. Colors remain
  strings; no channel reordering, alpha conversion, or color-space inference occurs.
- `AnimationKeyframe` contains uninterpreted `timing.sourceT` / `sourceValue`, value, optional easing,
  and the source property path.
- `AnimationEasing` retains the entire raw definition, parameter tokens, and
  numeric parameters. Recognized definitions are cubicBezier and elastic; unknown
  definitions remain intact and produce a warning. No easing is synthesized when
  the source omits it.
- `AnimationEffect` retains its type ID, locallyApplied flag, ordered properties,
  and unknown content. There is no effect allowlist and no effect implementation.

Every XML-derived IR entity has source metadata. Paths include sibling occurrence
numbers and do not depend on IDs being unique. Metadata includes the XML element,
ID, property/effect name when available, and parser line/column. Numeric values
retain their original strings through `raw` or the source element's attributes.
Each structural entity retains its raw XML element tree; the original document
preserves lexical details such as entities, comments, whitespace, and CDATA
boundaries that a decoded tree alone would lose. Paths, not line/column positions,
are the canonical element references. Column positions identify the opening tag
as reported by the SAX parser, not byte offsets.

## Timing and hierarchy assumptions

The timing-hardening review supersedes the initial normalized-time assumption.
See [alight-timing.md](alight-timing.md) for evidence, policy choices, unresolved
constructs, and fixture onboarding.

- Source timing is retained without declaring `kf.t` normalized. `resolveTimeline`
  is a separate pure function; its default policy leaves keyframe conversion
  unresolved. An explicitly selected policy can derive progress and times.
- Millisecond units are an export-dialect convention supported by the first
  fixture's scene/layer spans, not an XML-declared unit.
- Out-of-[0,1] numeric values are no longer parser warnings. Invalid numbers
  remain errors. Resolver diagnostics describe missing interpretation or
  unsupported retiming separately from parser validity.
- XML ordering, raw values, and separate mask/effect instances remain intact.
- Scene-local layer/parent ID scope and document-wide scene ID uniqueness remain
  validation conventions, not proven Alight format rules. The single fixture
  cannot distinguish alternative ID scopes.

## Validation and unsupported constructs

Diagnostics contain a stable code, message, source reference, and relevant
attribute name. Validation checks numeric syntax and finiteness, vector arity,
integers, booleans, required keyframe values/times, empty properties, four numeric
parameters for the observed cubicBezier/elastic encodings, scene dimensions/FPS,
layer start/end ordering, duplicate IDs, missing/ambiguous parents, parent cycles,
and scene placement/embedded scene cardinality. Values are never repaired.

This phase supports the fixture's `<scene>` export dialect. Other root wrappers,
compressed project files, external precomp references, alternative easing XML
encodings, and other transform encodings are not normalized. Unknown properties,
effect IDs, attributes and XML subtrees are retained generically. A scene child
with timing attributes is retained as an unknown layer; other unknown children
remain raw content with warnings. Unsupported content may contain animation facts
that are not included in the normalized inventory counts. Unrecognized color
formats are preserved as strings without semantic validation.

Malformed XML is rejected by `saxes`. DTDs are rejected; no external entities or
media URIs are loaded. Input is limited to 20 million UTF-16 code units, 250,000
XML elements, and 128 levels. These are parsing limits, not animation corrections.

## Inspection

From the repository root, using the same Node TypeScript execution convention as
the tests:

```sh
npm run alight:inspect -- "tests/fixtures/alight/real-world/Odette x Sing me to sleep.xml"
npm run alight:inspect -- "/path/to/project.xml"
```

The command prints JSON containing project metadata, layer counts by kind,
nested scene and null counts, effect usage, keyframe count, parent relationships,
warnings and errors, plus a separate timing inventory with its explicit policy
and diagnostics. Use `--timing-policy layer-relative-v1` to inspect the opt-in
layer-relative hypothesis. Validation errors produce exit status 1; warnings alone
produce status 0. File/usage failures also produce status 1. No training export
is produced.

## Fixture coverage

`tests/fixtures/alight/real-world/Odette x Sing me to sleep.xml` is copied unchanged from the
provided local export. It contains 98 layers (21 media, 52 shape, 8 null, 17
embedded), 17 nested scenes, 144 effect instances, 239 keyframes, 21 bookmarks,
and 7 parent relationships. Tests assert metadata, inventory, raw easing/time
preservation, source traceability, and all five independent Flip angle sequences
in the 2333–3032 ms group. It produces no parser errors or warnings. Its 66 numeric keyframes outside
`[0, 1]` remain unchanged; timing interpretation is reported separately.

Additional synthetic tests cover vec3, unknown definitions and subtrees,
malformed input, reference scope, parent cycles, nested scene errors, XML
entities, and the inspection command. Existing Motion Engine and workspace tests
remain part of `npm test`.
