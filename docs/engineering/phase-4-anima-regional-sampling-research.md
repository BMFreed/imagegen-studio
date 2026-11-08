# Anima regional native flow sampling

## Boundary and source

Implementation starts from clean `00edfbabc9ece2f84e1490fe93e7e66dbf95ced0`.
This high-risk slice connects existing regional prediction to the existing native
Anima flow driver, through normal Generate, frozen queue, installed worker and
Results. It adds no solver, model loader, loop, command, migration or composition.

Current local Invoke HEAD is `ae06c1bd36218100f89a48ff5b8855751d06a898`.
Its selected working files are dirty; consulted bytes, HEAD comparisons and copies
are retained in `runs/anima-regional-sampling/20261108-native-flow/` under the
agent artifact root. `backend/anima/scheduler_driver.py` and
`backend/anima/regional_prompting.py` are HEAD-exact. Current
`app/invocations/anima/anima_denoise.py` prepares contexts outside scheduler
iteration and invokes the same regional model prediction on both Heun halves.
`backend/flux/schedulers.py`, `frontend/webv2/src/features/generation/core/graph.ts`
and `core/canvas/addRegionalGuidance.ts` provide the finite methods and callers.
Concurrent external Invoke changes are preserved; this task never edits them.
During this research an external commit advanced Invoke to
`6b5f7d1f155a7ff4a868957720e6a5c6204b9b0d`; all six consulted byte pins
remained unchanged and now match that HEAD. Both revision observations are retained.

Confirmed source gap: the shared executor refuses simultaneous prediction and
native-driver ownership; the native driver directly calls ordinary prediction.
Removing Euler admission alone therefore cannot implement regional sampling.
Adapt Invoke's separation by passing the prepared request-owned predictor into
the existing driver. Its absent-predictor ordinary branch remains unchanged.

## Finite contract

- Methods are the existing closed Anima flow enum: Euler, Heun, DPM++ 2M,
  DPM++ 2M SDE, ER-SDE and LCM. The captured `anima-flow-denoising-v1` arrays,
  `stepSeed`, version and native history retain their meaning.
- Existing `anima-regional-txt2img-v1` grants Euler only. Non-Euler additionally
  requires `anima-regional-sampling-v1` at advisory, actual admission, dispatch
  and frozen Retry. Old peers cannot accidentally consume the new lane.
- The private no-argument regional API retains Euler-only admission; the worker
  explicitly selects `invoke-anima-flow-sampling-v1` for the extended lane.
- Steps remain authored exact integers 1–200. Progress counts actual frozen
  evaluations: Heun `2N−1`, all others `N`; existing telemetry ceiling 400 already
  covers the maximum 399. Current Invoke exposes logical user steps separately;
  adopting that display meaning would alter Studio's existing wire contract.
- Keep the accepted LCM once-shifted authored-grid adaptation documented in
  [ordinary flow sampling](./phase-2c-anima-flow-sampling-research.md). Do not
  regenerate old frozen arrays from the current Invoke driver.
- Keep one item, transparent TXT, 64–512 sides divisible by eight, CFG 1–30,
  static compiled prompts, Auto VAE, zero rescale, current text/mask budgets,
  no active TI/LoRA/regional references, and empty effective regional negatives.
  Existing explicit global-support composition and fragment interpretation remain.

The actual selected method belongs to frozen input, independently of later saved
sampler, seed, model, text or mask edits. Accepted provenance continues projecting
ordinary Anima settings while excluding regional state from Compare/presets.
No IMG, batch, spatial negative, Anima reference, quality or default extension.

## Verification plan and risks

The material risks are predictor bypass, silent method substitution, stale native
history/RNG, missing Heun corrector masks, authored/native progress confusion and
Retry admission using the current draft. Focused tests must observe real native
solver calls and regional positive/negative consumers, with ordinary and legacy
Euler controls. Include seeded stochastic replay, a nonterminal changed-seed
control, at least five ER steps, late failure/restoration and fresh calls.

Installed acceptance will use the existing canonical runtime/catalog without
model/environment copies and the retained real Main scene. One Heun healthy
Generate, one observed Cancel and a saved/restarted frozen Retry must produce
39 evaluations for 20 authored steps and exact healthy/Retry RGB. Real Results
Add → Undo → Redo → explicit Save/reopen closes the previous original-Add history
gap; the earlier recovery visibility-history proof remains separately reported.

Execution is serial, zero swap, at most 600 seconds per unit, aggregate host
limit 12 GiB (installed launcher 2 GiB plus native group 10 GiB). This is an
operational envelope, not a capacity claim. Production has no CUDA allocator
fraction guard; do not infer one. Runtime availability, trained compatibility,
memory/time, RGB causality and recovery remain unknown until actual execution.

Source review and semantic mutations must challenge predictor routing, sampler
selection, progress and frozen ownership, with unaffected controls and exact
restoration. Retain failures as failures. Artifact lifecycle includes physical
exit, dependency closure and byte restoration before disposable payload cleanup.

## Evidence status

ROOT executed the final implementation on 08.11.2026:

- 1,500 Main cases across the existing adjacent-owner selection, including 34
  added capability/NEW/Retry/client/progress cases; 82 separate tooling guards.
- 55 new native Python cases and 285 adjacent cases: 340 PASS, 114 warnings,
  no failures/errors/skips in the accepted runs. All six methods reach original
  native prediction/attention, native solvers and decoded PNGs on CPU/CUDA.
  Independent fresh solvers replay the observed predictions; stochastic replay,
  Heun correctors, zero-region ordinary equivalence, legacy Euler and recoverable
  encoding/corrector/scheduler/progress/publication failures are covered.
- TypeScript/Vue typecheck, configured strict Python typing, scoped Ruff/ESLint,
  build and 200 browser cases pass. The prototype remains mock evidence; the
  installed path below supplies the actual child-worker boundary.
- Independent R2 source-only review is CLEAN for 1,559 frozen files against
  1,556 baseline files, with 25 deltas/three additions before final documentation.
  Its verdict supplies no independent runtime certification.

The initial test-control failure is retained, not counted GREEN. That test had
required the ordinary executor to preserve private-borrow Wan-cache state. Its
ordinary call now precedes the regional preservation baseline, matching the
existing zero-region Euler test, without weakening regional state/RGB assertions.
Three Python callback-type diagnostics and three TS readonly-array diagnostics
were corrected in tests. A wrong-configuration typing invocation, overlong ROOT
TMPDIR socket path and an eight-worker browser OOM are excluded. Browser rerun
uses two workers at the same 4 GiB ceiling; it does not raise the budget.

## Installed consumer and mutation evidence

The canonical worker0.14 payload was refreshed in place using the existing
qualification tool. No environment or model copy was created. Actual worker
Ready advertises both old and new regional capabilities. Three original trained
Anima requests pass within one 600-second unit (345.867 seconds in the harness):

1. Real Generate consumes Heun20/native39 and publishes a Results candidate.
2. Another Generate shows actual numerical progress 2/39 before Cancel. Progress
   clears, no successful completion is accepted, and physical exit is confirmed.
3. After editing and saving method Euler, seed999, text, masks, model-null and
   four-items authoring, restart and explicit Queue Retry consume the exact frozen
   Heun/seed123/one-item input. Its decoded RGB equals the healthy control exactly.

Results Add → Undo → Redo → explicit Save → close/reopen passes through the
original UI/IPC/history/package owners. The accepted Raster, exact PNG bytes,
ordinary Heun provenance and later draft are preserved. This closes the remaining
Add-history check on this new result; the previous checkpoint's failed native
report and separate visibility-history continuation keep their historical status.
Pre-existing SQL/project/model/runtime state is checked; only the original Home
scan's `project_index.indexed_at` cache timestamp is excluded explicitly.

ROOT opened the real Results, Queue progress and reopened-Raster screenshots
using ui-audit; no material layout defect was found in those named states. This
does not certify every UI state, accessibility or generated-image quality.

The native groups are capped at 10 GiB plus a 2 GiB launcher, zero swap, with the
original whole-run deadline. Recorded native group peaks are 9,686,659,072 and
8,984,817,664 bytes; launcher peak is 2,147,495,936 bytes including cache. These
separate peaks are not a simultaneous whole-machine peak or a headroom claim.
GPU peak and production CUDA allocator fraction are not measured/set.

Three isolated mutations complete nine serial units: 18 selected executions,
15 GREEN and three semantic RED, followed by exact source restoration. Ignoring
the regional predictor breaks signed context association after actual native PNG
publication while the zero-region control remains GREEN. Reseeding stochastic
history on every iteration breaks independent ER-SDE latent/history replay after
PNG publication, leaving Heun ordinary control GREEN. Replacing frozen Heun39
progress with authored20 fails the real processor's progress assertion while
Euler20 remains GREEN. All 1,559 isolated source files and live opening/closing
source pins restore exactly. The first driver attempt wrongly required a JUnit
`type` attribute omitted by pytest; it remains excluded. The corrected driver
requires an exact final AssertionError traceback plus the original cause,
control, publication and restoration checks, using fresh paths/units.

This trained installed qualification selects Heun only; the other methods have
native small-model and Main integration evidence, not a new trained visual
matrix. The previous [public TXT checkpoint](./phase-4-anima-regional-public-research.md)
remains historical evidence. Full-scene NOT_QUALIFIED, human acceptance,
Anima IMG/batch/spatial negatives/references and PP-001/005/007/008
«Пока не обещать» remain unchanged. No default sampler or prompt is changed.

## Retained evidence

Compact reports, source/Invoke pins and archives, JUnit/TAP, mutation originals/
patches/observations, final IGS and closed SQLite snapshot live under
`~/.codex/artifacts/imagegen-studio/runs/anima-regional-sampling/20261108-native-flow/`.
Independent retained-byte/document review is CLEAN: all 9,976 entries, two
internal hardlinked paths, final IGS/SQLite, 24 migration hashes and raw PNG/
mutation associations agree. Runtime results remain ROOT evidence, not its rerun.

After fresh ROOT physical-exit, source-restoration, six-reader and global-incoming
gates, three exact idle disposable paths were released: this run's `payloads`,
`t-ars-20261108` and the worker-refresh scratch leaf. The deletion-only reduction
is 356,851,712 allocated bytes; artifact root goes from 25,435,123,712 to
25,078,272,000 bytes during that interval. Eight zero-byte dead Chromium socket
entries from the excluded browser OOM were separately removed after endpoint/exit
checks, retaining their metadata. The source checkout, canonical runtime/catalog
and external original model files were preserved.

Lifecycle is `retained`, with `payloads: []`. Raw historical paths require verified
restoration from `retained-payloads.tar.gz` and `payload-inventory.json`. Compact
reports, source archives, final IGS/SQLite, canonical runtime/catalog, current
worker report and its ancestry, external original models and preceding evidence
remain protected. Archive retention is below this run's 1 GiB compact-evidence
soft budget; no trained capacity or public-readiness promotion follows cleanup.
