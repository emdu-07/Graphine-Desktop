# Alight timing: evidence, policy, and unresolved conversions

This phase uses one real export: `Odette x Sing me to sleep.xml` (30 FPS,
14,262 ms, Alight metadata amver 106019, amplatform android). The Downloads copy
is the same project, not independent evidence. `timing-affine.xml` is a synthetic
arithmetic test and is not renderer evidence. No rendered video, additional real
project, format specification, or web search was used.

## Findings about source kf.t

The observed coordinates are consistent with layer-relative property timing that
can extend outside the visible layer interval, but the XML does not declare that
interpretation. The initial `normalizedTime` name overstated certainty. The old
parser preserved all values but incorrectly attached a universal normalization
claim and a generic range warning to 66 finite numeric coordinates.

The strongest local consistency check is the 699 ms nested section: multiplying
Flip coordinates by 699 produces near-integer millisecond offsets (16.999680,
349.999785, 482.999913, 682.999890), independent of each group's media content. This
supports a layer-relative hypothesis for those groups. It does not prove rounding,
frame sampling, endpoint inclusion, easing ownership, or behavior on sped layers.

| Source t | Count | Observed context | Classification |
| --- | ---: | --- | --- |
| -0.002224 | 28 | Repeated effect tracks on media and embedded layers | Valid numeric XML; negative property offset under the opt-in policy; retimed cases unresolved |
| 1.019669 | 21 | Same repeated effect families | Valid numeric XML; beyond layer end under the policy; no clamping |
| 1.189975 | 7 | Pinch/bulge strength, elastic easing | Beyond layer end under the policy; not evidence of malformed easing/time |
| 1.243006 | 7 | Squeeze strength, elastic easing | Same; a 24% extension is not classified as rounding noise |
| 1.004016 | 1 | Exposure on color layer with speed 0.534335 | Property-time basis on a sped layer unresolved |
| 1.753769 | 1 | Gaussian blur on a 199 ms color layer | Outside-layer coordinate under the policy; intent unresolved |
| 11.889148 | 1 | Same 199 ms layer, no explicit speed | Far outside-layer coordinate under the policy; cause unresolved |

Repeated identical effect coordinates on different layer lengths, including
unsped embedded layers, do not establish that speed caused these ranges.
Trimming/copying/extrapolated control points are possible explanations, not facts.
No coordinate above is numerically malformed. Valid XML is not a guarantee of
valid/rendered animation behavior. The single large value cannot establish a
new coordinate unit or justify a magnitude-based conversion rule.

For the 199 ms layer starting at 6251, the hypothesis maps 11.889148 to a local
offset of 2365.940452 ms and project coordinate 8616.940452 ms, well outside the
layer's 6251–6450 interval. This is a coordinate calculation, not a claim that a
keyframe is visible at 8616 ms. In source-only mode these derived fields are null.

## IR and resolution API

`AnimationKeyframe.timing` now stores:

- `sourceT`: the unchanged XML attribute string;
- `sourceValue`: the finite parsed number, or null if malformed.

This replaces the pre-hardening `rawTime` and `normalizedTime` keyframe fields.
Bookmark `rawTime` is unchanged. Source nodes and the original XML remain intact.
The parser does not populate derived times or select a policy.

`resolveTimeline(project, policy?)` returns separate scene, layer and keyframe
records, keyed by occurrence-based XML paths. Keyframes retain source coordinates
and expose `localProgress`, `localTimeMs` (offset from layer start), `sceneTimeMs`,
`projectTimeMs`, overall `resolution`, and a range classification. Each derived
coordinate has a value or null, exact/unresolved resolution, source/derived basis,
a rule, and an unresolved reason where applicable. Exact means arithmetic under
the selected policy—not universally proven format semantics or renderer accuracy.
The returned policy and `evidence: 'xml-only'` make that limitation explicit.

Layer records separate their containing-scene interval, project interval, and
content interval. Scene records retain the owning embedded layer path. A scene's
full interval can be unresolved in project space when only a trimmed portion is
placed; individual points within the placement may still resolve. Parent/null
IDs are retained but are not followed as timeline containment edges.

## Policies and timeline rules

The default `source-only` policy makes no keyframe-progress or embedded-clock
assumptions. It can describe root-layer project intervals from source start/end,
but all keyframe conversions remain unresolved.

The opt-in `layer-relative-v1` policy states:

1. A property's t is interpreted as progress relative to its owning layer:
   `localTimeMs = t * (endTime - startTime)`;
   `sceneTimeMs = startTime + localTimeMs`.
2. A non-unit/invalid layer speed leaves property timing unresolved unless a
   caller explicitly supplies a separately reviewed `retimedProperties` policy.
   Content speed is not silently applied to property timing.
3. For supported embedded content,
   `parentSceneMs = owner.startTime + (childSceneMs - inTime) / speed`.
   Compose this conversion through each containing scene. Positive explicit
   speeds and trims are supported. Missing speed/inTime use 1/0 only because
   this policy explicitly opts into those omission conventions.
4. The child must explicitly say `retime="off"`; missing retime requires a
   separate `allowOmittedRetime` policy choice. Freeze, reverse, zero speed,
   FPS-adaptive retime, scene-level playback attributes (as opposed to owner-layer
   speed/trim), unknown timing metadata/content, missing/invalid durations,
   and content outside the nested scene are unresolved.
5. When outTime is present, it must agree with
   `inTime + layerSpan * speed`. Only machine-arithmetic epsilon is allowed;
   no frame-sized tolerance or exported decimal rounding rule is assumed.
   Mismatches stay unresolved. When absent, a derived content endpoint is labeled.
6. Conversion is limited to the embedded content interval. Points outside are
   not clipped or extrapolated. At the root, scene time is project time under
   the millisecond convention, restricted to the declared project duration.
7. Direct nested scene declarations without an owner have no inferred placement.
   Structural/parent-reference errors block project conversions. Property timing
   remains separate from temporal placement, content sampling, and spatial parenting.

End coordinates are retained as boundaries. The resolver does not decide whether
a renderer treats them inclusively or exclusively. It does not quantize to FPS,
choose a frame timestamp, evaluate easing/parent transforms, or infer visibility.
Unknown effect IDs remain supported as opaque properties; unknown timing metadata
or property content causes the affected timing conversion to remain unresolved.

## Results for reviewed intervals

Under `layer-relative-v1`, embedded group 205149990 occupies 2333–3032 ms, and its
child scene spans 0–699 ms. All five masked groups keep their own source paths,
scene relationships, effects, and angle sequences. In XML order:

| Group ID | Source t sequence | Conditional project milliseconds |
| --- | --- | --- |
| 205149984 | .977110, .024320 | 3015.999890, 2349.999680 |
| 205149985 | .690987, .024320 | 2815.999913, 2349.999680 |
| 205149986 | .500715, .024320 | 2682.999785, 2349.999680 |
| 205149987 | .977110, .024320 | 3015.999890, 2349.999680 |
| 205149988 | .024320, .977110 | 2349.999680, 3015.999890 |

No sorting, merging, or rounding occurs. These times are internally consistent
XML-derived coordinates, not measured rendered timestamps.

In the later 5100–5799 ms section, null 205149971's location coordinates .022890
and .786838 map to 5116.000110 and 5649.999762 ms. Media child 205149960 retains
that same placement and parent reference. Its speed 1.047210, inTime 3600, and
outTime 4332 are retained; its property clock stays unresolved. Parenting does
not add the null's startTime to the child time. This is the resolver convention,
consistent with the fixture, not proof of universal parent semantics.

## Diagnostic policy and current inventory

The parser reports zero warnings and errors on Odette; malformed numbers still
produce errors. There is no generic invalid-normalized-time warning.

Under the opt-in policy, 116 of 239 keyframes have conditional exact project
coordinates; 123 remain unresolved on 11 speed-modified layers. Twenty-nine
interpreted coordinates are outside their layer interval. The other 37 of the
original 66 outliers belong to unresolved sped property tracks.

The resolver reports a policy-not-render-verified diagnostic, 11 layer-level
unresolved-property diagnostics, and 21 unresolved-content diagnostics (media
content retime is unspecified). These diagnostics are separate from parser
warnings/errors. They do not declare source data invalid. Source-only mode leaves
all 239 keyframe conversions unresolved.

## Assumptions review

| Statement | Status |
| --- | --- |
| Scene/layer time fields behave as milliseconds in Odette | Fixture-supported consistency; unit naming remains a dialect convention |
| 699 ms embedded scenes match their owner spans | Fixture-supported for all identity placements inspected |
| kf.t is always normalized to the layer duration | Unresolved universally; opt-in hypothesis for reviewed unsped tracks |
| Out-of-[0,1] values are malformed | Rejected as a generic validation rule; their ultimate render behavior remains unresolved |
| Omitted speed/inTime mean 1/0 | Explicit policy convention, consistent with identity embeddings |
| IDs/parents must be scene-local | Current validation convention; fixture IDs are globally unique, so scope is not proven |
| Scene IDs must be document-unique | Current validation convention; the real fixture has no scene IDs |
| Parent/null links change spatial transforms, not time origin | Resolver convention consistent with the reviewed section; not renderer-verified |
| Arbitrary speed, trimming and retime share one universal mapping | Unresolved; affine arithmetic tested synthetically only |

## Inspection and adding fixtures

```sh
npm run alight:inspect -- "tests/fixtures/alight/real-world/Odette x Sing me to sleep.xml"
npm run alight:inspect -- "tests/fixtures/alight/real-world/Odette x Sing me to sleep.xml" --timing-policy layer-relative-v1
npm run alight:inspect -- tests/fixtures/alight/schema-isolation/timing-affine.xml --timing-policy layer-relative-v1
```

Inspection includes source-coordinate frequencies, exact/unresolved counts,
scene intervals, the policy, and precise timing diagnostics. It is an inspection
inventory, not a training export. The CLI retains its parser-error exit behavior;
unresolved interpretation is not a parse failure.

Add future real exports unchanged under the appropriate provenance category in
`tests/fixtures/alight/` and register them in `fixture-manifest.json` (see
[alight-fixtures.md](alight-fixtures.md)). Append a timing case to
`timing-cases.json` specifying the reviewed policy, group IDs, raw sequences,
expected intervals and parent cases. The timing test runner discovers timing-case entries;
production code contains no fixture IDs. Keep synthetic cases explicitly labeled.
Record provenance and whether evidence is XML-only or renderer-measured in the
review documentation. Unsupported cases should assert null coordinates and
specific reasons rather than force an existing policy. Policy values can be
selected per project without changing the core timing representation.

## Alignment readiness

General XML ↔ rendered-video ground-truth alignment is **not yet safe**. This
phase makes the uncertainty explicit and provides a regression foundation, but
renderer-backed fixtures are still needed for property clocks under speed/trim,
frame sampling/endpoint rules, retiming and extrapolation, plus additional real
projects to test ID and nesting conventions. Even conditional exact results
must not be treated as renderer-verified labels. No dataset extraction is added.
