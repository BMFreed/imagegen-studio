# Phase 2B: production Generate actions and serial queue dispatch

Base: `a6e8e93`, clean master. High risk: renderer/main IPC, frozen Project
inputs, durable queue/staging, confirmed worker exit and destructive result
replacement. Sources: [PP-007/008](../product-promises.md),
[Generate actions](../features/project/generate-mode/generation-actions.md),
[Queue Manager](../features/queue-manager.md),
[target transport](./phase-2b-inference-target-composition.md),
[research](./research-protocol.md) and [review](./review-protocol.md).

## Confirmed architecture and chosen first slice

The production client now composes targets in its qualified inference child.
ProjectService/Orchestrator already prepare and qualify Illustrious txt2img,
plan dynamic pairs/seeds, atomically publish queue rows and hand validated
completed pixels to staging. DispatchCoordinator reserves one runtime lease for
one oldest pending row; it has no renderer action or automatic drain. Main creates
it only for shutdown. Results sibling IDs are a subset and cannot supply a queue
badge/current cancel.

One app-owned action controller will admit a captured Project batch, publish typed
state changes and drain the SQLite queue serially with a fresh lease per job.
Admission uses its own qualified lease and releases it before dispatch; no nested
reservation or reused failed child. It joins the same operation gate as Add/close
until admission is complete, then releases that gate while inference runs. Shutdown
must stop admission and drain before pending cancellation or database close.

The first UI admits Generate only while the engine is idle. A live inference
lease cannot concurrently compose another target; unsupported concurrent enqueue
is an explicit Busy refusal, not a false readiness claim. Editing, Save, current
Cancel and early Add remain available while processing. Adding another batch
while GPU is occupied, terminal history/retry/prune, complete Invoke conditioning,
Anima and runtime installation remain separate roadmap work. The implemented
worker scope stays narrow Illustrious txt2img; no other visible input is ignored.

## Snapshot and ownership

Renderer captures tab/count and flushes the actual draft before requesting main.
Main validates document identity and captures the copied document, visible source
references/bytes and finite bbox before waiting for runtime qualification. A
ProjectService callback owns private frozen raster files through preparation and
admission. Later edits cannot replace those inputs; identity change/close refuses
publication. Existing strict target verifier and model qualification stay intact.
Seed reuse is scoped to local project plus captured document; Random selects one
base and the existing planner assigns concrete seeds. Settings/count use the
existing 1..100 input, cap32 planner and independent recovery byte preflight.
Count and queue status are transient and do not enter dirty/Undo/Save.

The controller reads every pending/running job for the current document from
SQLite metadata; a state read must not rehash target pixels. Main owns global
engine phase, scoped running ID and safe errors. Notifications trigger typed
renderer refresh; no worker stdout or fabricated progress reaches UI. Current
Cancel verifies the reviewed document/job ID and awaits actual child exit before
another lease. It preserves completed candidates and neighboring Projects.

## Result replacement and refusals

Keep results/Escape does not enqueue or discard. Discard and generate requires
exact candidate/job ID sets for this document. Re-read after confirmation; changed
sets require another review. Historical candidates for another document are not
part of that loss. Use exact session tombstones, never discardProject across all
documents at a reused path. Prepare/model/runtime/plan qualification must succeed
before replacement. Publish the new batch durably before canceling reviewed old
jobs and tombstoning their exact sessions; dispatch starts only after that cleanup.
Known queue preflight/publication failures preserve old candidate IDs and PNGs.
If post-publication old cleanup fails, cancel the newly admitted jobs and retain
a Project fence plus explicit uncertainty; never present it as a successful batch.
The controller retains the global blocked state for this app lifetime; saving and
restarting is the recovery action, not merely closing/reopening a Project tab.

The main gate prevents Add/close from consuming the same staging during admission.
Running dispatch makes admission Busy; orphan pending jobs from a stopped drain
can be explicitly canceled under the reviewed replacement scope. Unconfirmed exit
or publication uncertainty retains recovery/blocked ownership. App close waits
active preparation before canceling pending and closing SQLite, preventing late
enqueue after shutdown. Typed input/output validation bounds IDs, counts, prompt
bytes and state shape; sender/frame checks remain main-owned.

## UI composition and checks

Use the approved fixed top Generate bar, count70px, queue badge and visible
secondary current Cancel, above independently scrolling settings. No new palette,
Create header or mode switch. A compact queue overlay shows real pending/running
jobs only; history/progress commands remain absent until their API exists.
Raw invalid/uncommitted bbox size disables Generate until Enter commits it;
this transient guard must not affect Save. Per-tab count and async responses stay
scoped across switches and close. Reuse existing icons/Naive props and tokens.

## Verification plan and parameter sources

Real ProjectService capture tests use SQLite/shadow/.igs and a paused callback;
files remain available through admission and are cleaned on success/failure.
Controller tests use real queue/staging/orchestrator/processor and controlled
worker/runtime nondeterminism, with observed requests/statuses before assertions.
Cover ordered multi-job drain, immutable edits, no-runtime/unsupported refusal,
exact replacement and stale review, Cancel/tab isolation, late completion and
shutdown during preparation. Native checks cover actual draft flush and typed IPC,
fixed bar/queue layout, count and bbox guards, runtime-unavailable behavior and
existing Add/Save/reopen. No substituted worker test proves installed CUDA.

Wire/request caps and deadlines remain those of the existing worker and batch
contracts: 64KiB JSONL, 16KiB per concrete prompt, startup120s/request30min,
confirmed close2s, cap32 prepared jobs, 64-candidate and byte preflight. Pending
status sequence starts at0. State/confirmation ID envelope uses the existing
archive-entry safety ceiling, not a measured UI capacity. No new throughput,
VRAM or supported model-family limit is inferred.

Execute isolated semantic mutation of captured input or exact replacement refusal,
then restore green. Run app tests, typecheck, lint, scoped formatting, native
smoke and actual screenshot inspection. Prototype coverage is required only if a
prototype component changes. Record actual counts, substituted boundaries, failed
attempts and remaining gaps before committing and pushing.

## Executed evidence and source-aware review

The first missing capture/controller tests failed before their implementation.
Real capture/preparation neighbor checks then passed11/11; controller/wire checks
passed16/16. The complete app suite passed625/625, zero failures/skips. Typecheck
(including the prototype TS project), full ESLint, scoped Prettier and production
build passed. Prototype source was unchanged, so prototype Playwright was not run.
Python ML source was unchanged; this is no new Python/GPU qualification claim.

The app-owned controller, shared operation gate, single dispatch instance,
shutdown ordering and payload-free invalidations were reviewed against actual
main/preload code. That pass found UUID/local-project-key confusion in both the
ProjectTab validator and current Cancel IPC; both were fixed. Native Create/open
DTO and current Cancel now pass the actual validated routes. Document DTO identity
uses the portable `.igs` UUID domain, without narrowing imported document IDs to
local path keys. Unknown worker/model/storage errors do not expose raw paths in
state or generation IPC; controlled preparation/planner refusals stay actionable.

A real SQLite/PNG replacement test reproduced destructive cleanup before a known
queue refusal. The revised publication-before-cleanup order preserves old candidate
IDs and byte-identical PNGs on that refusal; post-commit cleanup failure cancels new
jobs and leaves the explicit fence/blocked state. Controller snapshot tests also
pause the initial impact read and runtime qualification, proving later edits do
not enter the admitted capture.

Isolated semantic mutations changed only copies, never the live implementation:

- Late document reread in ProjectService capture: snapshot case failed while its
  quiet neighbor passed (1 fail/1 pass); restored source passed2/2.
- Bypass exact replacement confirmation: baseline11/11 passed; mutation caused
  3 failures and8 passes, including stale loss-review accepting a queued batch.
  The temporary worktree was removed and live controller hashes stayed unchanged;
  final unmutated controller/wire checks passed16/16.

Renderer checks used actual App/ProjectView components with a substituted API:
9 scenario checks plus4 same-document controls passed, with no final page/console
errors. The same-value bbox DTO regression first failed: pending1536 became1024.
Watching primitive bbox fields plus tab/document identity fixed it; real external
bbox changes still replace the draft. Native prompt/Save acknowledgements now also
exercise this regression, so a cloned DTO cannot silently clear Generate's guard.
Count100 was clipped by Naive's default inner spacing; public Input peer padding
preserves the70px count field and both steppers while making all digits readable.
Settled screenshots were actually viewed at900×620 and normal desktop size;
queue scroll/footer, fixed bar, busy/editable state, loss modal and count were checked.
Initial modal captures caught an enter transition and were replaced after waiting
for finite animations; they were not counted as verified final layout.

`pnpm exec tsx scripts/smoke-generation-actions.mjs` passed9 native scenarios:
actual renderer→preload→main Generate admission, shared batch/session, serial
sibling processing, UI current Cancel/OS-confirmed process exit, verified staging
PNG/resource, Keep/Escape/no loss, exact replacement with latest prompt/bbox,
transient count, unavailable runtime and pending/raw bbox acknowledgements.
All15 observed qualification/worker peer PIDs exited; no fixture dirs remained.
This uses a controlled app-owned executable, structural miniature checkpoint and
deterministic pixels. Runtime ownership/live qualification, model hash/header
checks, strict target/output verification, SQLite and staging are real. Python/
CUDA/model loading/composition inference are substituted; Save previews use the
existing development image worker. It is a built Electron app, not a release package.
The native report records hashes for main, preload, HTML and actual renderer JS/CSS.

Existing native desktop checks passed Home/Models, import, Canvas, Save/reopen,
recovery, native close and unavailable storage. Existing Results/acceptance checks
passed preview/export/Cancel/discard, exact early Add/sibling cancellation, neighbor
preservation, grouped Undo/Redo, shadow recovery and portable Save/reopen. A first
old-dist desktop attempt failed Create before the UUID fix was rebuilt; it was
not treated as current-source failure. A fast repeated dropdown click also caused
one Results attempt to miss its second native picker; diagnostic/unmodified runs
passed. The smoke helper now waits for the old menu to hide before reopening and
after selection, without relaxing file/dialog assertions. A diagnostic Save poll
spanned atomic rename and correctly got `PACKAGE_CHANGED`; only that transient
loader identity-change rejection is retried, with all corruption/storage errors
still failing. Final Results/acceptance run passed with no renderer page errors.

The new native harness is included in `pnpm run app:smoke` and is available alone
as `pnpm run app:smoke:generation`. It defaults to portable temporary artifacts;
this session's reports, logs, commands, screenshots and source hashes are retained
at `/home/user/.codex/artifacts/imagegen-studio/generate-actions-2026-09-30/`.

## Remaining delivery boundary

PP-002/005/007/008 matrix rows and bodies plus the roadmap now record this narrow
Generate checkpoint; public promises remain incomplete. Admission while GPU is
busy, terminal Queue Manager/history/retry/prune/progress, full Invoke conditioning,
Anima/LoRA/embeddings/advanced options, other raster modes/Smart Patch and release
runtime installation remain open. No throughput, CUDA readiness or full model
support is inferred from the controlled native peer. Save/recovery remains usable
when generation is unavailable; uncertain generation exit/replacement retains the
app-lifetime blocked state and asks the user to save and restart.
