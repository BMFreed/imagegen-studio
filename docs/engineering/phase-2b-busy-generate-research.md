# Phase 2B: Generate while the inference worker is busy

Risk: **high**. Base: `a87866dd3993618c8fc8026bae19485072530073`, clean
`master`. Source contracts: [Generate actions](../features/project/generate-mode/generation-actions.md),
[Queue Manager](../features/queue-manager.md), [PP-007](../product-promises.md#pp-007-проект-принадлежит-пользователю)
and [PP-008](../product-promises.md#pp-008-генерация-меняет-проект-только-по-явному-решению).

## Confirmed path and choice

Project Generate → renderer draft flush → typed IPC → single controller admission
and Project operation gate → retained frozen document/raster files → qualified
target composition → current exact checkpoint/base seed/planner → recovery
capacity and exact-impact checks → durable SQLite batch → serial drain/staging.
Queue completion never accepts a result or changes `.igs`.

Busy Retry already admits its verified existing PNG using copied live inference
readiness. New Generate needs composition: `GenerationWorkerClient` admits only
one command and its CUDA lease lasts through inference and confirmed exit.
Removing the UI refusal alone would still fail; waiting under the Project gate
for the long inference callback would delay close without creating durable jobs.
Adding parallel inference or constructing an unverified target in TS would
violate existing ownership/contracts.

The installed package already includes a separate **CPU derivatives entrypoint**
(`-I -m imagegen_worker`). Its protocol/compositor/import/derivative modules use
Pillow and do not import the inference loader or Torch. The active GPU worker
continues its request. Busy preparation uses exactly one bounded CPU target
process in the **same app-owned activated Python environment**; it receives no
model-loading/inference command and has `CUDA_VISIBLE_DEVICES=''`.
The main-owned callback receives a target-composition interface and a separate
copied qualified inference-ready DTO. Derivatives readiness does not masquerade
as inference capability. Idle Generate keeps the existing qualified inference
composition path.

This is generation target preparation while a runtime is qualified, not another
preview worker when the ML runtime has failed. Save placeholder behavior,
development-only image-worker opt-in and release installer status are unchanged.

## Preserved behavior and lifecycle

- Capture document/draft/bbox and visible raster assets before runtime awaits;
  retain those files through enqueue. Later edits must not change the request.
- Same-Project Generate remains **replacement**, with exact reviewed candidates
  and unfinished jobs. Keep/Escape does nothing. New jobs become durable before
  cancellation/discard of the old scope. A live completion changing that scope
  requires renewed confirmation; it cannot be silently lost.
- Another Project can enqueue behind the current job without canceling it.
  The global controller still permits one admission and one running GPU job.
  The existing between-job admission wait and late idle wake remain in use.
- Before CPU startup and after its handshake, compare current pointer/executable/
  config identity with the captured active environment. Missing, changed,
  qualifying, closed or unconfirmed runtime refuses; no system-Python,
  source-checkout or unsupported-version fallback is permitted.
- Runtime retains CPU ownership until confirmed exit, including failed startup.
  New CPU/GPU preparation is blocked on unconfirmed exit. Shutdown prevents new
  work, interrupts CPU preparation and confirms both worker owners before DB close.
  The same Project gate serializes admission, close and acceptance.
- Recovery blocks stay sticky across concurrent errors. Identity/block/impact
  checks after awaits and publication compensation remain required.
- Reuse preserves existing cursor resolution after composition, scoped to local
  Project plus document ID, including seed zero. A naturally completing job may
  update that cursor before it is read. Once enqueued, the chosen seed is frozen;
  preparation/queue publication itself does not advance the actual-seed cursor.
- Before enqueue, an interrupted preparation loses only scratch; old jobs/results
  remain. After enqueue, previous-lifetime unfinished jobs are canceled on restart,
  while validated completed candidates remain recoverable. Late acknowledged
  publication followed by refusal cancels the new rows rather than rolling back
  an already committed source/queue transaction.
  If final CPU close fails after the admission callback has already published,
  its new rows remain pending under the sticky exit fence; no job is claimed.
  Explicit confirmed application shutdown can retry retained exits; restart
  cancels those unfinished rows and keeps independently verified completed output.

## Parameters and finite scope

One GPU job, one controller admission and at most one runtime-owned CPU target
preparation remain separate ceilings. This CPU limit belongs to generation
preparation; existing Save/import derivative workers keep their own lifecycle.
Per-Project close shares the operation gate, while application shutdown interrupts
preparation through AbortSignal. Existing CPU startup deadline is 15 s,
request deadline 120 s; confirmed close uses the existing TERM/KILL waits.
No inference deadline is extended. Startup/exit retries retain a strong process
owner and do not silently wait behind a 30-minute inference command.

Existing ceilings remain: iterations 1–100, prepared jobs cap 32, target side
2048 / 4,000,000 pixels / 32 MiB, 256 source layers, 128,000,000 decoded source
pixels, 64 KiB JSONL, 128 KiB frozen payload, 64 recovery candidates and 8 MiB
escaped manifest. Filesystem capacity/preflight remains data-dependent. Available
RAM/disk/VRAM and full model loadability are external limits, not measured here.

Worker compatibility remains the finite qualified inference 0.2/0.3/0.4 matrix
and derivatives-only 0.1.0 protocol/profile with target-composition capability.
Queue status completeness is the five migration/schema values. This slice keeps
the existing narrow Illustrious txt2img capability; opaque/partial targets and
unsupported settings still refuse instead of silently choosing another pipeline.
Full conditioning/Anima/LoRA/modes, accepted history, session filtering and release
runtime installation remain separate roadmap work.

## Verification plan

Use real RuntimeManager/ProjectWorkerClient with controlled subprocess peers,
controller with SQLite/files and actual Electron UI/preload/main. Hold Project A
inference and admit Project B before it finishes; witness a CPU-only request,
unchanged GPU PID/request/progress, durable pending rows and copied frozen input.
Exercise reviewed same-Project replacement, Keep, exact late completion, frozen
edits, refusals/capacity, stale activation, concurrent admission, failed CPU
startup/exit retention, current-document/close/shutdown and serial continuation.
Execute isolated semantic mutations against actual production modules with
neighboring controls; restore and retain logs/load probes/hashes. Inspect actual
enabled/preparing/pending screenshots at compact/normal sizes. Run app tests,
typecheck, lint, build and native regressions without overlapping desktop hover
scenarios. Record actual worker substitutions and remaining readiness gaps.

## Observed evidence

Validated on the final working tree based on `a87866d`; no production source
changed after the successful bundle build. Source/bundle SHA-256, exact commands,
raw logs, mutation patches and PNGs are retained in
`~/.codex/artifacts/imagegen-studio/busy-generate-2026-10-01/`.

| Boundary                       | Executed evidence                                                                                                                                                                                                                                             | Limits                                                                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime/client ownership       | 66/66 focused tests, 0 skips; actual JSONL GPU/CPU peer children, PNG/ICC verification, pointer/config/executable refusal, natural completion, shutdown startup/request interruption, retained normal/startup exit owners and explicit physical-exit retry    | Peers replace Python inference/model loading; forced non-exit is controlled at child.kill                                                     |
| Generate/controller            | 47/47 focused tests, 0 skips; real SQLite/queue/staging/capture/model files, busy sibling frozen enqueue, same-Project Keep/exact replacement, late completion, capacity/identity faults, sticky block, close/shutdown and post-publication CPU-close failure | Controlled target/worker facade; native wiring tested separately                                                                              |
| Actual Electron Generate/Queue | 29/29 checks, 0 page errors; previous24 plus held B preparation while A progress advances, B durable pending through one CUDA-hidden CPU child, frozen edits/pending Cancel preserving A, A Keep/Escape and confirmed replacement                             | Controlled Node executable replaces Python/CUDA/model loading/composition/inference; existing development image worker prepares Save previews |
| Existing app boundaries        | `pnpm run app:test`: 731/731, 0 skipped; full `pnpm run typecheck`, `pnpm run lint`, `pnpm run app:build` passed                                                                                                                                              | Full GPU pipeline/release installer still absent                                                                                              |
| CPU package path               | Real `worker-python/.venv/bin/python -I -m imagegen_worker`, CUDA hidden: derivatives-only ready with target-composition, self-test reply and exit0; CPU protocol import loads no Torch/inference modules                                                     | Development environment, not release runtime installation                                                                                     |

The native report records five bundle hashes and the executed script hash, two
independently observed CPU exits with code0, their exact activated executable,
entrypoint and environment, and actual GPU process/request/progress observations.
Root and reviewer inspected preparing/pending images at the normal viewport and
frozen Queue Manager at 900×620; no confirmed visual defect in the changed area.
The first native attempt stopped on harness setup: Naive exposes `loading
Generate` during loading and New Project defaults to four iterations. The harness
now recognizes loading state and explicitly chooses one iteration through UI;
the failed report/PNG are retained, production bundle remained identical.

Executed semantic mutations used isolated source copies, real production modules
and real test boundaries with only dependencies symlinked. Mirrors were removed;
workspace modules were not mutated and restored hashes match:

| Mutation                                     | Baseline | Mutant          | Restored | Neighboring control                                                                                       |
| -------------------------------------------- | -------- | --------------- | -------- | --------------------------------------------------------------------------------------------------------- |
| Drop post-CPU activation-key recheck         | 8 pass   | 4 pass / 4 fail | 8 pass   | Before-start pointer/config/executable refusals remain green                                              |
| Expose CUDA to CPU child (`''` → `'0'`)      | 2 pass   | 1 pass / 1 fail | 2 pass   | Idle qualified inference composition remains green                                                        |
| Bypass sticky block recheck inside admission | 4 pass   | 2 pass / 2 fail | 4 pass   | Busy sibling enqueue and exact late completion remain green; failing blocked subtest propagates to parent |

Independent cross-owner review found that CPU preparation could mask a concurrent
unconfirmed GPU exit as advisory `ready`. The final status guard now checks the
GPU exit fence; its actual dual-owner regression verifies `needs-repair` while
CPU is live and after it finishes, no extra subprocess and confirmed retry.
No other reachable ownership/replacement blocker was found in that review.

`pnpm exec tsx scripts/smoke-desktop.mjs` and then
`pnpm exec tsx scripts/smoke-generation-results.mjs` both exited0 against the same
bundle. Desktop reports nine successful flows (Home/models/import/layers/Save,
shadow recovery, previews, close/cancellation, relink, runtime/storage refusal);
Results reports recovery/preview/exact export/Save/discard, exact cross-session
navigation and confirmed early Add/cancel/Undo/Redo/shadow/portable reopen, with
no page errors. They ran sequentially to avoid unrelated desktop hover/focus
interference. Prototype sources did not change; prototype tests were not rerun.

Failure remains visible as typed refusal/confirmation or sticky worker-exit/
recovery error in Project/Queue. Main holds unconfirmed owners, forbids new
claims and refuses application close until retained exit can be confirmed. A
post-publication CPU-close failure can leave a pending batch under this fence;
restart reconciles it to canceled, while valid completed candidates remain local
recovery data. No manual `.igs` or SQLite repair is required by this change.
Full Illustrious conditioning/modes, Anima, LoRA, release runtime and packaged
CUDA inference remain open; PP-007/008 public readiness is unchanged.
