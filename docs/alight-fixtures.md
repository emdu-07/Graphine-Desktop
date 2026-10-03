# Alight Motion fixture library

This is a developer corpus and metadata foundation. It does not score benchmarks,
run a renderer, decode video, export training data, or connect to the application.

```text
tests/fixtures/alight/
  schema-isolation/       # 16 existing import/schema candidates + synthetic timing XML
    source-notes/         # Original README/CSV context; not renderer review
  controlled/            # Future controlled project XML + matching render/media
  official/              # Future official projects
  real-world/            # Existing Odette export
  external/              # Future external exports
  fixture-manifest.json  # Shared corpus inventory
  timing-cases.json      # Existing timing test expectations, separate from inventory
```

The Odette and affine-timing files were moved without changing their bytes; parser
and timing tests use the updated paths. The 16 numbered isolation files were
copied byte-for-byte from the local `alight-motion-import-tests`,
`alight-motion-followup-tests`, and `alight-motion-blend-fix-tests` collections.
Their source README/CSV files are retained for context. Those files contain
import-test claims, including differing accounts of the combined example; no
claim has been converted into renderer verification or completed human review.

## Manifest contract

`scripts/fixtures/types.ts` defines `FixtureManifest` (schemaVersion 1 and a
fixtures array), `AlightFixture`, and `RenderReview`.
`scripts/fixtures/validation.ts` validates unknown data without coercion and
returns a detached manifest or path-based errors. Tooling lives under `scripts/`
and is covered by `tsconfig.alight.json`; no frontend imports are added.

Each entry contains:

- `id`, `title`, `category`, and `xmlPath`.
- Optional `renderPath` and `sourceMediaPath`.
- `primaryConstruct`, `expectedConstructs`, and `notes`.
- `provenance`, `rendererVerified`, and `humanReviewed`.
- Required `renderReview` for verified pairs: reviewer, YYYY-MM-DD review date,
  project ID, and explicit `xmlRenderMatch: true`.

Paths are relative to this corpus root and begin with the entry's category.
They cannot be absolute paths, URLs, traversal paths, or original media URIs.
IDs are unique kebab-case strings; constructs are descriptive lowercase tags
using letters, digits, and underscores, with the primary tag included in the
nonempty expected list. Tags describe the XML content being exercised; they are
not a benchmark assertion language or proof that Alight supports that encoding.

| Category | Allowed provenance |
| --- | --- |
| schema-isolation | schema_fixture, synthetic |
| controlled | controlled_project |
| official | official_project |
| real-world | real_world_project |
| external | external_export |

Metadata validation rejects unknown/missing fields, duplicate IDs/XML paths or
constructs, malformed booleans/dates, inconsistent category/provenance, identical
asset paths, and invalid verification declarations. Object/array/text limits
bound manifest size. Optional paths must be omitted when absent, not set to null.

`scripts/fixtures/catalog.ts` separately checks every declared asset for existence,
regular-file status, and real-path containment (including symlink escapes).
Successful metadata validation alone does not establish asset availability.

## Evidence and review rules

XML-only fixtures are always renderer-unverified. Schema and synthetic fixtures
can exercise parsing/arithmetic but cannot prove rendering semantics. Successful
XML parsing or Alight import is not a reviewed rendering result. Merely adding a
render file does not set verification flags.

For this foundation, only a `controlled_project` pair can be marked
`rendererVerified: true`. A reviewer must explicitly establish that XML and render
come from the same identified controlled Alight project, provide `renderReview`,
and set `humanReviewed: true`. Review fields are attestations, not automated proof
of authenticity or an original project's exact settings. Official, real-world,
and external assets stay renderer-unverified in this phase even if a render is
attached; broader evidence rules would require a separate reviewed extension.

All 18 currently registered entries have `rendererVerified: false` and
`humanReviewed: false`, with no render or source-media paths. The 16 schema entries
cover minimal metadata, solid layers, size, gradient, animated location, circle,
animated scale/opacity, blend child/attribute variants, comments, and combined
compositions. The existing timing fixture is `synthetic`; Odette is a
`real_world_project`. Nothing here declares any entry training truth. External
XML without its matching render must never be promoted by a later consumer.

## Commands and onboarding

```sh
npm run fixtures:list
npm run alight:inspect -- tests/fixtures/alight/schema-isolation/03-size-property.xml
npm run alight:inspect -- "tests/fixtures/alight/real-world/Odette x Sing me to sleep.xml"
node --experimental-strip-types --test tests/alight-fixtures.test.ts
```

`fixtures:list` locates the corpus relative to the script, validates metadata and
assets, and prints tab-separated ID, category, primary construct, XML/render
availability, provenance, and renderer verification. Missing/unsafe declared
assets or invalid metadata produce diagnostics and exit status 1. A missing XML
or render never displays a verified status. Absent optional assets show false.

To register a new fixture, preserve its original XML in the appropriate category,
add a unique manifest entry, use conservative provenance/review flags, and add
focused parser tests where behavior is new. Future paired assets should be grouped
under `controlled/<fixture-id>/`. Do not invent a render path or infer review from
a filename. Existing timing-policy cases remain in `timing-cases.json`; registering
a corpus entry does not create benchmark scoring or timing truth.

## Foundation verification

The full suite passes 119 tests, including nine new fixture-library tests.
Typecheck, lint, production build, and `fixtures:list` pass. Build retains the
existing nonfatal chunk-size warning. All 16 copied XML files and both relocated
baseline XML files were compared byte-for-byte against their sources. Motion,
ReferenceAnalysis, and parser/timing implementation behavior is unchanged.
