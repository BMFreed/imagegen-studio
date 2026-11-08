# Runtime startup without false Repair

Bounded follow-up to [Anima regional batches](./phase-4-anima-regional-batch-research.md).
Base: `5af646bd190749d1702091ef77a91fa88785900b`.

## Trigger and scope

A Queue Manager state refresh calls `GenerationActionController.getState()` →
`RuntimeManager.getStatus()`. A valid generation lease can still be qualifying,
or its CPU-only preparation child can still be starting. Previously, absence of
confirmed advisory readiness mapped those ordinary transitions to `needs-repair`.
The renderer then said the engine could not start and offered Repair. No failed
self-test was required. The preceding installed OUT Retry screenshot records this
symptom; its successful generation does not itself diagnose runtime health.

This is a high-consequence advisory-state/IPC correction: readiness gates controls,
but no queue admission, persistent payload, worker command, numerical algorithm,
installer or ownership/exit protocol changes. No new database migration or runtime
installation is needed. Generation permission remains with the existing owners.

## InvokeAI basis

Consulted clean local InvokeAI `b0ac163b139c432aff4c51078c31c074bf292f72`:

- `invokeai/frontend/webv2/src/platform/transport/socketHub.ts`: one publisher,
  connecting at startup, settled states from actual connection callbacks.
- `.../platform/transport/connectionStore.ts`: connection snapshot independent of work.
- `.../app/QueueUiAdapter.tsx`, `.../features/queue/runtime.ts` and
  `.../features/queue/runtime/coordinator.ts`: queue consumers and reconciliation.
- `invokeai/app/api/routers/session_queue.py` and
  `.../services/session_processor/session_processor_default.py`: independent
  queue/processor activity and existing cancellation/Retry owners.

Adapt that connection/activity separation and event publication to Studio's
existing RuntimeManager. Invoke has no matching desktop disposable-worker installer;
this change adds neither another installer nor a parallel health service.

## Final behavior

- Add advisory `RuntimeStatus.kind = 'checking'` across typed Main/preload/renderer.
  Only valid unchanged runtime metadata and an owned unfinished startup qualify.
- Existing matching qualified/running/normal-close readiness remains ready.
  Missing/changed configuration, invalid pointers, failed startup and unconfirmed
  child exits remain unavailable; no second GPU child is started for status.
- An observed checking state settles through the lifecycle owner after final
  pointer/configuration/capability validation. Failures settle to repair before
  owner release. A healthy generation finishing while CPU preparation is still
  starting does not declare the other child broken.
- Late status queries re-read state when ownership or published status changes.
  They cannot substitute an old ready snapshot for a newly observed metadata error.
- The existing notice shows starting progress with no Repair action. Ready removes
  it through the existing App condition. Genuine repair/setup/unsupported/error
  states retain their distinct messages/actions. No polling or timer-based masking.

## Executed evidence

ROOT runs controlled real JSONL child processes, actual RuntimeManager and original
Main consumers. The initial regression is semantic RED (`needs-repair` versus
`checking`). Final focused neighbors: **256 PASS**, zero failures/skips, including
**94 runtime checks** and queue/action/processor/shutdown neighbors. Five production
Vue/Naive presentation browser cases pass. Full typecheck, scoped ESLint and desktop
build pass; existing build chunk-size warning remains. No new Python/ML suite run.

The dedicated Electron fixture traverses actual runtime IPC and the **built original
preload**. Checking getter → ready/failure events settle without another getter.
Exactly three controlled children launch/exit; Electron also physically exits.
This substitutes application wiring and Python/CUDA, and is not a full production
Generate/Retry or installed trained-model rerun.

An isolated source-copy status mutation restores false Repair: two healthy selectors
→ target semantic RED / invalid-config control GREEN → both restored GREEN
(**five GREEN / one RED**). Final source restoration is exact. The first mutation
phase is historical; the final revision is qualified again after review correction.

Independent source review found a real P2 in the first revision fallback: it could
discard a newly observed invalid configuration in favor of an older ready snapshot.
ROOT reproduces that race as RED in the isolated pre-correction copy, corrects it
by fresh recomputation, and adds the passing delayed-query regression. That closure
is ROOT-executed; the source-only review does not independently certify it.

## Excluded diagnostics and limits

- Initial typecheck hit Node's default approximately1GiB heap in its 2GiB unit.
  Retry declares a 3GiB Node heap /4GiB unit, zero swap; checks pass.
- Initial browser case expected exact accessible name Repair while Naive's loading
  button is named `loading Repair`. Only that locator is corrected; disabled/action
  assertions remain. All five cases pass afterward.
- Existing native-error peer tests omitted mandatory Linux lifetime capability.
  The exact baseline reproduces the same eight failing leaves (nine including
  their parent). Only that fake peer's ready declaration is corrected; real worker
  guard and all diagnostic/source/receipt/seed assertions remain unchanged.
- The first delayed-query fixture removed only `model_index.json`. Its changed
  but structurally readable configuration legitimately required failing live probes;
  the no-extra-probe assertion was incorrect. The final fixture removes the entire
  configuration directory to test metadata refusal before probing. Both pre-fix
  semantic race failures remain recorded; only the final fixture qualifies counts.
- The first isolated baseline launcher invoked pnpm's dependency check, which
  refused before tests. Direct existing tsx CLI resolves that setup issue without
  installing/copying dependencies or changing the lockfile.

ROOT viewed the historical Retry screenshot and actual checking/repair presentation
screenshots using ui-audit. Local progress/error distinction is visible; this is
not a full-app visual, accessibility, trained Retry, quality or release acceptance.
No Repair action is required to complete a healthy startup. No public readiness
promotion: PP-001/005/007/008 remain **«Пока не обещать»**.

Compact logs, source snapshots, screenshots, failure and mutation controls remain
under the artifact lifecycle at `runs/runtime-checking/20261108-transient-repair`.
No model, catalog or reusable ML environment is copied or changed. Retention/release
records distinguish preserved evidence from disposed idle test scratch.
