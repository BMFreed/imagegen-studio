# Installed batch32 and bounded dynamic-prefix qualification

This gate follows the [Random and uint32 seed qualification](./phase-2c-generation-seed-boundary-research.md).
Entry revision: `0f37beadf89b7f0a2d7f721ce230d9d35c201ea5`, `master`.
It qualifies existing behavior; it does not increase production limits or change
PP-004/005/007/008 readiness.
The entry revision identifies the base checkout. Native execution consumes the
actual edited qualification sources and fresh built artifacts, pinned by their
SHA-256 values before the first admission and checked again at handoff.

## Contract, risk and path

The [dynamic prompt contract](../features/project/generate-mode/dynamic-prompting.md)
distinguishes `maxPrompts`, which selects an ordered prefix of concrete prompt
pairs, from the production ceiling of 32 generation jobs. Iterations multiply
the selected pairs. An oversized job batch is refused as a whole. Preview shows
one iteration and reports pair truncation; Generate reports actual truncation.

This is a high-risk qualification of renderer → Main planner → durable queue →
native worker → temporary candidates → Add → immutable provenance → explicit
Save/reopen. A refused confirmed Discard + Generate must preserve existing
temporary results. Current prompt/seed/sampler/LoRA edits must not rewrite admitted
inputs or accepted history. Qualification hooks observe these real boundaries;
they do not replace the planner, queue, worker, completion or Save implementation.

Source inspection confirms public 32 checks in the normal generation orchestrator
and Anima builder. Queue/storage 64 and byte ceilings are separate internal
boundaries. Anima preflights before composition; Illustrious may read models or
compose before refusal. We assert no durable effects and cleaned scratch after
refusal, rather than claiming no transient work. The production planner already
saturates dynamic pair counts correctly; negative-side saturation and its radix
are an identified regression-coverage gap, not a reproduced product defect.

## Finite matrix and independent expectation

Each of Anima, Illustrious EPS and Illustrious v-pred uses the same known weighted
two-positive × two-negative templates, actual signed LoRA −0.5, three denoising
steps and 256×256 outputs in the existing worker 0.14 runtime/catalog.

| Stage                             | maxPrompts × iterations | Behavior                | Expected jobs / truncation  |
| --------------------------------- | ----------------------- | ----------------------- | --------------------------- |
| Boundary                          | 4 × 8                   | Fixed 0 / per iteration | 32 / false                  |
| Prefix                            | 3 × 2                   | Fixed 0 / per prompt    | 6 / true                    |
| Refusal after boundary completion | 1 × 33                  | Fixed 0                 | 0 new jobs; BATCH_TOO_LARGE |

Boundary pair-major order is red/blurry, red/noisy, blue/blurry, blue/noisy;
each pair uses seeds 0…7. Prefix contains the first three pairs with seeds 0…5.
Its six native executions must match boundary indices 0,1,10,11,20,21. After the
standard omission of cross-project document ID/revision, the only allowed
generation-setting difference is requested seed behavior, which is separately
asserted. All executed inputs must match. This gives
an intended 114 native outputs, six accepted saved/reopened packages, 114 read-only
layer comparisons and 18 same-input pixel controls. These are a plan until the
execution evidence below records successful observations.

The real UI preview must show 4 or 3 pairs, not 32 or 6 iterations. Prefix must show
the preview warning and actual Main truncation notice. After boundary completion,
author/save the refusal draft before taking the preservation snapshot. Confirm
Discard + Generate with 33 iterations through the UI; correlate its public typed generation-state
error with the attempt and verify retained 32 candidates, receipts, PNG bytes,
cursor, session, frozen/private inputs, layers, visible Undo/Redo flags and
saved/shadow package. This does not inspect an exposed internal Undo-stack snapshot.
This typed state observation is not a captured generate-response DTO. Restore
the legitimately edited current draft before Add/Save. Refusal uses explicit
Fixed 0 with the already edited sampler and LoRA −0.25; its actual authored draft
is recorded. Three pre-refusal empty-project Saves and six portable before/after
proof copies are additional artifacts, not accepted-result packages.

The independent raw reader uses SQLite, ZIP and Pillow without importing an
application planner or qualification oracle. Entry raw rows were captured before
the first run: 360 queue rows, 298 receipts, 202 seed cursors and seven immutable
catalog tables containing 9 resources / 14 versions. Each new raw job must belong
to a recorded successful stage; refused requests cannot create replacement jobs.

## Parameter and resource boundaries

Preview uses one iteration; authoring maxPrompts accepts 1…100. Production batch
limit 32 is an existing policy, not a GPU-capacity measurement. Frozen payload and
manifest byte limits remain independent; this small-input gate does not qualify
arbitrarily long 32-job inputs or every sampler/mode/model combination.

Native stages run serially, offline, on the existing Linux/NVIDIA runtime. No
environment or model copy/download is needed. The launcher has 2 GiB, native
scope ≤12 GiB, combined owned-memory watchdog 14 GiB and swap 0. The 32-job stage has
an 1800-second launcher deadline and 1600-second completion poll, allowing time
for 32 real completions and subsequent refusal/Add/Save comparisons. Prior
per-job observations suggest 20–25 minutes per boundary stage; this is a planning
estimate, not a measured cap32 result. Observed owned cgroup-charged memory peaks
depend on warm shared cache and page-charge attribution; they are not physical
model working memory or a measured GPU-capacity limit. Source tests and isolated source mutations
use bounded memory and finite deadlines. Root owns execution and cleanup.

## Semantic mutations and controls

Isolated real production sources test five independent faults: raise the public
normal or Anima limit to 33; change job overflow `>` to `>=`; corrupt negative
radix only when truncated; suppress the pair-truncation flag. Exact 32 must remain
allowed, 33 must be refused, and neighboring negative 31/32 controls remain green
when only the saturated negative 33 prefix is broken. Baseline and fresh original
tests must execute with 0 skips. Assertion failures count as semantic detection;
import, collection, deadline and memory failures do not.

Profile/mock tests cover wiring and observation only. Actual native stages prove
the production inputs, results, UI refusal, saved packages and comparisons. Final
handoff requires physical Main/worker exit, all 43 original installed source/asset
hashes, fixed qualification/bundle identities, catalog/history preservation and
artifact inventory. Remaining MVP/release and broad native qualification gaps
stay explicit in the roadmap.

## Source checks and executed mutations

The fresh focused 23-file source selection passed 349 tests, 0 failures, 0 skipped
with 3 GiB / swap 0 / 300 seconds. Full typecheck and the fresh production build passed
with 6 GiB / swap 0 / 240 seconds. Nineteen consumed qualification sources and five built
artifacts were pinned before the first native admission.

The independent isolated-source runner completed 204 tests across its finite
matrix: original baseline 52/52 and fresh restored 52/52, each with 0 skips. The five
mutants yielded 22 semantic failures with 182 neighboring/baseline passes overall:
normal limit 27/1, Anima limit 4/1, exact-capacity planner 14/5 plus Anima 3/2,
negative radix 16/3, silent truncation planner 11/8 plus Anima 3/2. Negative31/32
controls stayed green when the saturated negative 33 case failed. The exact-limit
mutation produced a real BATCH_TOO_LARGE at successful boundary controls;
this is semantic refusal evidence, not an import/collection failure.

The first new oracle fixture lacked the mandatory worker 0.14 outpaint capability;
its INFERENCE_UNAVAILABLE failures were setup evidence, followed by the corrected
59/59 baseline before the additional cardinality cases. The mutation harness
retains three separate setup exclusions (retired service metrics, service
retirement measurement and an ambiguous normal/outpaint source anchor), plus an
honestly retained partial attempt where its overly narrow ERR_ASSERTION-only
classifier rejected a genuine exact-boundary error. None is counted as a detected
new mutation. Each isolated copy was physically idle/restored before removal;
original production source/test bytes and installed worker files were unchanged.

## Execution evidence

All six installed stages passed on the same exact runtime/catalog and fixed
source/bundle hashes. The independent SQLite/ZIP/Pillow reader completed 31,562
checks: 114 admissions, 114 finite completions, 114 accepted saved layers,
114 owning-layer comparisons and six saved/reopened packages. All 18 selected
prefix outputs matched the corresponding boundary RGBA pixels. Each genuine
confirmed 33-job UI refusal preserved all 32 temporary results and the captured
durable, private, portable and Project state; no new job or receipt was created.
The three empty pre-refusal Saves and six package proof copies remain separate
from the six accepted-result packages.

| Stage          | Runtime     | Combined owned charged-memory peak |
| -------------- | ----------- | ---------------------------------- |
| EPS boundary   | 25m 54.789s | 9.842 GiB                          |
| EPS prefix     | 6m 28.682s  | 3.898 GiB                          |
| V boundary     | 26m 40.464s | 9.028 GiB                          |
| V prefix       | 6m 32.303s  | 8.164 GiB                          |
| Anima boundary | 24m 56.605s | 12.736 GiB                         |
| Anima prefix   | 5m 40.835s  | 10.556 GiB                         |

All stages exited successfully within the 1800-second deadline, with swap zero
and no resource watchdog stop or OOM kill. Anima boundary reached the native
12 GiB charged-memory ceiling without an OOM kill. Warm-cache/page-charge attribution
affects these peaks; they do not measure physical model working memory, cold-run
performance or the application's GPU-capacity limit.

Raw preservation checks confirmed the prior 360 queue rows, 298 receipts and
202 document-scoped seed cursors, seven catalog tables with nine resources /
14 versions, 43 installed source/assets and eight original model-source files.
Final physical Main/worker exit is confirmed. Large original weights were
checked through pinned raw catalog descriptors and unchanged physical metadata;
the independent reader did not rehash them.

Evidence lives in
`~/.codex/artifacts/imagegen-studio/runs/generation-batch-cap/20261009-checks/`:
the six fixtures/reports/bounds/logs, pre-native raw rows/source-bundle manifests,
refusal before/after JSON and `.igs` copies, saved-package/layer screenshots,
source-mutation TAP and `final-evidence.json`. The independent reader SHA-256 is
`f88278ecc821c20a539c372cc284144785c454b9a1493c01899ffe15a50fa9cd`.

Full lint initially found object-field ordering in the added planner tests.
Sorting those fields leaves production and native-consumed sources unchanged.
The pre-style source-mutation/aggregate evidence is retained separately. The
final 349/349 source checks, typecheck, 204-test mutation matrix and independent
31,562-check aggregate passed again against the delivered test bytes. Baseline
and fresh restored remained 52/52 with zero skips; all five mutants were killed.
The earlier complete 204-test matrix is historical evidence, separate from the
final 204-test matrix; neither native results nor repeated test cases are added
to the final finite-matrix counts.

Final lint, formatting and diff checks passed. Inventory recorded approximately
26.22 GiB for the artifact root, 0.26 GiB for compact run data and 60.96 MiB for
this evidence directory, below the 30/1 GiB soft budgets. Six physically idle,
restored isolated source copies across setup, pre-style and final attempts were
removed: 66,650,112 allocated bytes in total. This is measured payload cleanup,
not a claim that net disk usage decreased. Reports and rollback evidence remain;
the sole compatible runtime/catalog is protected for the next gate.

Next gate: installed Anima ER-SDE order3, five-step TXT against a three-step
neighboring control. Five steps reach a nonterminal third-order correction;
three steps do not. A causal omission of only `dd_x0` must preserve the short
control, change the five-step result, and restore fresh healthy pixels after
exact source restoration. Broad modes, geometry, formats, quality and release
qualification remain open; PP-004/005/007/008 status stays unchanged.
