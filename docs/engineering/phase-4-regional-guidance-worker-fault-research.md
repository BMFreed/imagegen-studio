# Regional inference worker failure while Main stays alive

## Boundary and source

Qualification on `master@cafe517ef4ddb96b2ba1c081a00c354a6b949e52`.
The [progress checkpoint](./phase-4-regional-guidance-progress-research.md)
qualified completed native steps, normal Cancel and explicit frozen Retry.
The [Main-death checkpoint](./phase-4-regional-guidance-main-death-research.md)
qualified the opposite lifetime: Main dies and its owned inference child exits.
This slice keeps Main alive and terminates only its verified native worker after
an actual intermediate step. Existing failure handling is the subject; no new
production behavior is assumed necessary.

Consulted clean InvokeAI `a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd`:

- `invokeai/app/services/session_processor/session_processor_default.py`:
  `_on_node_error` clears progress previews, records the error and fails the
  current queue item; the session processor retains its nonfatal work loop.
- `invokeai/app/services/session_queue/session_queue_default.py`:
  `fail_queue_item` uses the existing queue transition owner.

Studio already adapts that failure ownership across its separate Python child:
the JSONL client rejects an unexpected exit; the regional processor clears
transient progress, confirms transport closure, then marks the running attempt
`GENERATION_WORKER_FAILED`. Existing Queue Retry owns a new attempt with the
original frozen inputs. The fault injector is a developer-test control using
the existing Linux pidfd qualification pattern, not an application recovery
mechanism or an alternative inference loop.

## Finite acceptance

Reuse the unchanged noneditable worker 0.14 runtime/catalog and original official
Illustrious epsilon checkpoint. One built Electron lifetime, 1024×1024, original
30-step Euler/Normal leading policy, seed 123 and CFG 5. Actual scalar progress
must reach an intermediate step before a pidfd signal targets only the verified
inference child. Main identity remains unchanged.

The interrupted attempt must become failed, clear Main/Project/Queue progress,
publish no candidate or receipt, and release its slot only after physical worker
exit. Its error must be visible and explicit Retry available. There is no Cancel
or automatic retry. After saved authoring edits to two steps, seed 124 and
disabled regions, explicit frozen Retry must use a fresh worker/request and the
original 30-step/seed-123 input, produce the retained control PNG, and continue
through existing Results, Raster Add, Undo/Redo and explicit Save/reopen.

All prior SQL rows, packages, accepted history, unaccepted candidate and frozen
inputs stay protected. Native selections are serial, with aggregate launcher plus
actual Electron scope limits ≤12 GiB, zero swap and an 1,800-second deadline.
No environment/model copy, provisioning, worker refresh or new resource policy
is planned. Bounds are qualification conditions, not capacity promises.

## Evidence and lifecycle

ROOT confirms **126 distinct lower PASS**, including three new cases: actual
controlled-child SIGKILL after 1/2 and 2/2, plus real SQLite N/N failure with a
deliberately held physical-exit barrier. No candidate/receipt/seed advancement
occurs before closure; frozen Retry owns a fresh request and counter. These
controlled peers qualify subprocess/IPC/queue ownership, not model computation.
Full typecheck, scoped lint/format and a fresh desktop build pass.

An isolated source fixture removes only `await` from failure-path
`transport.close()`. Baseline two GREEN → target semantic RED plus healthy
completion GREEN → restored two GREEN: **six executions, five GREEN and one RED**.
The target observes premature `failed` instead of retained `running` while exit
is unconfirmed. All 621 source files restore exactly; production workspace and
installed payload remain unchanged. The one dependency symlink is recorded
literally and its existing external target is never copied or deleted.

Installed `native-r1` passes **14 checks** in a **186.959-second bounded unit**
(186.204 seconds in the scenario report). Actual steps 5/30 and 6/30 precede the
verified worker-only pidfd SIGKILL. The targeted PID had 7,976 MiB recorded GPU
usage and disappears from the GPU process list afterward. Main PID/start remain
the same; no Cancel IPC or application restart occurs. The original attempt
becomes `GENERATION_WORKER_FAILED`, with cleared progress, no candidate/receipt/
seed cursor and disposed request/output paths. The installed witness observes
original exit/close events before its first failed-row sample; the lower held-exit
test independently establishes the exact failure fence.

After genuine saved edits to two steps, seed 124 and disabled regions, explicit
Queue Retry retains original 30-step/seed-123 frozen inputs. A new worker/request
emits 1..30 and publishes the unchanged control PNG: 1,379,326 bytes, SHA-256
`942f59c35b92c3bab04328d92d3714cca48a24106b0c4a8e818559af17e913a1`,
decoded RGBA SHA-256
`7bc3695217b9f44285c97d7b19a9d2c3478b0441da019b30897c51f5ce126829`.
Results/browser pixels, explicit Raster Add, Undo/Redo and Save/reopen pass.
All twelve prior terminal rows, 27 packages, four accepted jobs, the unaccepted
candidate and input bytes remain protected. Rebuildable `project_index.indexed_at`
alone is normalized in historical-row comparison. All nineteen observed worker
subprocesses (fourteen through generation completion plus five later derivative
workers) and 28 observed native birth identities exit; healthy Main exits zero.

Both first real-child tests initially failed an authored equality oracle because
new leases correctly have different absolute alpha paths. The correction
normalizes only the owned lease prefix, explicitly requires different roots and
retains exact filename/hash/size/byte comparisons. The rerun passes both; duplicate
neighbor passes are not counted again. No production defect or repair emerged.
Independent source review is CLEAN within source-only limits. The final
source/document/retained-data verdict is recorded separately in `final-review.md`
beside the run; it does not independently rerun native computation.

Evidence is kept under
`~/.codex/artifacts/imagegen-studio/runs/regional-guidance-worker-fault/20261104-native`.
The current reusable runtime, original checkpoint and predecessor's compact
evidence remain explicit dependencies. Complete source snapshots, raw reports,
TAP/resource logs, mutant/patch/restoration proof, screenshots and the final
146-entry app-state archive remain retained. The no-follow payload archive
verifies all 647 entries, including the literal dependency link. ROOT confirms
28 birth identities, two empty cgroups, nine completed owned units, exact source
restoration, global incoming references and all then-owned readers ending before
removing two exact disposable paths. The deletion-only interval reclaims
**12,275,712 allocated bytes**. Runtime, weights, live app data and the external
dependency installation are preserved. This is ROOT release evidence, not an
independent physical-release certification.

## Preserved limits

This checks recoverable worker death while Main survives. It does not establish
GPU-driver recovery after context poisoning, arbitrary descendants, arbitrary
OOM/capacity, trained visual quality, Anima regional inference, release
Install/Repair or complete InvokeAI parity. Existing explicit Add/Save,
frozen-work independence, Smart target-only permissions and Regional Guidance
provenance/Compare/result-derived-preset exclusions remain.
PP-001/007/008 stay **«Пока не обещать»**.
