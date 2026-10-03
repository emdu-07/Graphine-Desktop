# Repository health verification

## Motion failures

All eight failures reproduced before edits. None imports the Reference domain.
The engine and UI are unchanged from the committed baseline. History establishes
timed corner detection in `3d3e1e3`, fitted Y handles bounded to [-0.5, 1.5] before
and after `36a0cbb`, and configurable RGBA grid rendering in `a707e02`.
The existing motion-corners and workspace tests explicitly expect timed corners.

The following original tests in `tests/motion-segmentation.test.ts` asserted an
alternate reconstruction design that the engine does not implement:

| Original failing test | Original expected vs actual | Classification and correction |
| --- | --- | --- |
| preserves an L trajectory with one timing interval | Key times [0, 1] vs [0, 0.6, 1] | Incorrect expectation: corner detection intentionally splits the interval. Expect the timed corner. |
| keeps multiple turns as spatial controls | [0, 1.2] vs [0, 0.4, 0.8, 1.2] | Incorrect expectation: spatial controls do not replace timed corners. Expect both detected corners. |
| keeps dense corners and jitter out of timing keyframes | Dense corner [0, 1.6] vs [0, 0.76, 1.6]; straight jitter already passed | Incorrect expectation: preserve the detected corner while continuing to reject jitter keys. |
| includes initial and final pauses in one full-duration easing curve | Initial [0, 1] vs [0.2, 0.4]; final independently [0, 0.2]; both independently no keys | Incorrect expectation plus pre-existing sampling limitation: the engine trims boundary holds and only detects changes within 0.25 seconds. Original movement gaps were 0.3–0.5 seconds. Use capture-like 0.2-second movement intervals for hold-trimming coverage; add a separate explicit sparse-gap regression test. |
| preserves all raw samples and L geometry independently of endpoint keyframes | First curve progress [0, .25, .5, .75, 1] vs [0, .5, 1] | Incorrect expectation plus the same sparse-gap limitation: the first curve covers only detected motion through 0.4 seconds. Use 0.2-second intervals to exercise both sides of the corner; assert progress per interval. The later assertions also incorrectly promised a Move Along Path instruction and detached capture snapshot. Current steps specify position values; samples retain the input array. Geometry checks remain. |
| preserves closed loops and curved paths using two endpoint keys | Square [0, 1] vs [0, .25, .75, 1]; smooth arc independently [0, 1] | Incorrect expectation: the square receives detected corner keys, while the smooth arc uses endpoints. Preserve full raw loop/arc geometry in both cases. This records the current detector's output, not a guarantee that every geometric corner is detected. |
| fits known monotonic cubic progress and constrains difficult pauses | Required 0 <= y1 <= y2 <= 1; pause fit y1=-0.18329466177195775, y2=-0.05421307265138248 | Incorrect expectation: least-squares fitting clamps each Y handle to [-.5, 1.5], not monotonicity. Retain exact known-cubic recovery, finite/bounded handles, and explicitly cover a negative pause handle. |

The eighth test, `renders a white canvas in light mode and preserves the dark
canvas in dark mode` in `tests/motion-stage.test.ts`, expected grid strokes
`#e3e9e6` and `#223039`. Current strokes are `rgba(223, 231, 228, 1)` and
`rgba(34, 48, 57, 1)`. This is a stale color/representation expectation following
configurable grid colors and opacity. Background and selection assertions remain.

These are mismatches with pre-existing implemented behavior, not regressions
introduced by Reference contracts. The health phase changes tests only, without
silently implementing endpoint-only reconstruction, monotonic fitting, capture
cloning, sparse-sample interpolation, or new motion instructions.

## Lint and build investigation

Environment: Node v26.3.1, npm 11.16.0, Vite 7.1.7. No runtime, dependency,
configuration, or timeout changes were necessary.

The initial production build completed: Vite transformed 1882 modules and reported
52.77 seconds. A subsequent build completed in 2.69 seconds, producing identical
asset names and sizes. The existing >500 kB chunk warning remains nonfatal.

ESLint debug logging located the delay during configuration/dependency loading,
before linting the target file. Configuration discovery/loading took 853421 ms;
rule module loads had multi-second gaps. An OS process sample captured the main
thread in `node::fs::ReadFileUtf8 -> uv_fs_read -> read`, rather than an infinite
lint rule, Vite server handle, or application execution. The target file was then
read in 9 ms and linted in 159 ms. Later direct reads of dependency/source files
took about 1–3 ms. Repeated full lint completed successfully with no changes.

The demonstrated immediate cause is filesystem read latency during dependency
module loading. Its underlying storage/system cause is not proven by these
observations; neither iCloud involvement nor a Node version defect is established.
Build delays are consistent with the same transient module-loading environment,
but no build process sample was captured. Both tools now complete with their
original configuration. No arbitrary timeout suppresses verification.

## Reference isolation and final verification

No application/Motion import points at `src/reference`; only its tests import it.
No Motion engine, easing, UI, or workspace source changed. A regression test runs
valid and rejected Reference validation between deterministic engine calls and
asserts capture input and Motion output remain unchanged. Production assets are
identical before and after the health test fixes.

- Motion tests: 40 passed.
- Reference tests: 11 passed (including the new isolation test).
- Combined targeted run: 51 passed, zero failures.
- Full suite: 110 passed, zero failures.
- Typecheck: passed.
- Full lint: passed.
- Production build: passed; existing chunk-size warning only.

The repository is ready to continue with the Reference pipeline against this
verified baseline. Sparse captures, current corner detection, borrowed sample
arrays, and approximate/nonmonotonic easing fits remain existing limitations;
this phase does not extend the engine's contract. If filesystem stalls recur,
diagnose the local storage/runtime environment rather than weakening checks.
