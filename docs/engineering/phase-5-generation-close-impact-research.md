# App-wide generation impact before native close

Base: `3ce988484636f1cd603ce33a6d4e69fef1a0738f`, clean `master`.
Risk: **High**: explicit cancellation intent, persistent queue and shared SQLite
shutdown. Contracts: [Application Updates](../features/application-updates.md),
[explicit intent](../contracts/explicit-intent.md),
[research](./research-protocol.md), [review](./review-protocol.md).

## Fresh source and concrete gap

Read clean InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1`:
`invokeai/app/services/shared/database/queries/session_queue.py` `_status_counts`
and `status_counts`, caller
`invokeai/app/services/session_queue/session_queue_default.py:get_queue_status`,
and `invokeai/app/api/routers/session_queue.py:get_queue_status`. Invoke reads
aggregate status metadata without hydrating frozen sessions. Adapt that count
to Studio's existing serialized `GenerationQueueRepository`, with Studio's
`pending`/`running` statuses and one app-wide queue.

Read `session_processor/session_processor_default.py:stop` and caller
`services/invoker.py:stop`: stop/join precedes database disposal. Studio already
adapts this ordering in `GenerationAppShutdown`; this change does not introduce
another shutdown owner or change cancellation/recovery policy.

Also reread launcher `c267bdb439519216b277a7a8c6ad408b9d79efce`
`src/main/updater.ts` and `main-process-manager.ts`, plus installed exact
electron-updater6.6.2 `AppImageUpdater.doInstall` and `BaseUpdater` callers.
Upstream unlinks the old AppImage before moving the candidate, without the
required recoverable rollback. This absence was disclosed; no custom binary
replacement or Install action is introduced in this slice.

Confirmed source mismatch: Main's native close warning sums unfinished jobs
only for open Project tabs. `GenerationAppShutdown.prepareWindowClose` later
calls `queue.cancelPendingForShutdown`, which cancels **all** pending rows.
Thus an app-owned pending job outside the open-tab set can be canceled without
being described in the warning. Terminal startup-recovered `APP_RESTART` rows
are already canceled and must not be counted as new cancellation work.

## Finite behavior and ownership

Before reading open-tab staging impact, Main reads one app-wide pending/running
count from the same recovered queue repository that shutdown uses. The query
reads only status metadata, includes all operations and Projects, and does not
verify inputs, run inference, open Projects, repair files or mutate rows. It uses
existing serialization/recovery admission and introduces no pagination or
arbitrary item limit. Query failure refuses closing before any destructive step.

The existing native dialog describes that aggregate count without adding it to
the open-tab count, avoiding double counting. Open-tab dirty changes and candidate
discard warnings keep their current owners. Reading queue metadata before staging
preserves the existing transition ordering: a job completing between reads is
included in at least one relevant observation. This remains advisory, not a frozen
install review token. Existing Main close admission guards and Project fences remain.

Cancel releases temporary close fences and changes no jobs, documents or staging.
Confirmed close uses the existing worker/model drain and global durable pending
cancellation before SQLite disposal. Closed-Project terminal rows/candidates are
not newly discarded; their recovery remains unchanged. A failed queue inspection,
unconfirmed worker exit or failed cancellation keeps the window/database open under
existing error/retry behavior. No new timeouts, worker leases or public IPC are added.

## Verification plan

Use real SQLite/reconciled queue tests across the finite five-status domain:
pending/running count; completed/failed/canceled do not. Include normal, Smart and
private regional operation metadata, closed Project keys, invalid frozen JSON and
missing input directories; inspection must not hydrate or mutate them. Startup
recovery still terminalizes former pending/running rows without automatic resume.

Actual copied built Main/preload/renderer qualification adapts the existing bounded
model-shutdown harness, with one declared owner-capture insertion. Fixture setup
inserts queue metadata after startup, not through a claimed public inference path.
The actual close dialog options and choice are controlled; queue inspection,
cancellation, storage and close behavior are not stubbed. Own closed-Project pending
rows must be described before cancellation. Cancel preserves them and an unrelated
saved Project. Confirm terminalizes them before normal physical exit; restart
preserves the durable result. Isolated omission of the app-wide count must give a
semantic silent-cancellation RED after two normal lifetimes, with adjacent original
GREEN and exact original restoration. Setup errors/timeouts are not semantic RED.

## Executed evidence and limits

Root executed **97 targeted tests PASS**, full `pnpm run typecheck`,
`pnpm run app:build` and scoped ESLint of all four changed code/test files PASS.
Prototype/renderer source and styles are unchanged; the previous323 browser cases
are historical and were not rerun or relabeled as this stage's evidence.

Final **r6** copied-built Main qualification gives original **GREEN**, an isolated
consumed-count omission **semantic RED**, then exact original **GREEN**. All three
flows complete two normal physical lifetimes, **six qualified normal exits** total.
Launcher is bounded4GiB/zero swap/600s, native scope4GiB/120s; the observed current
lifetime aggregate is at most8GiB. No inference/runtime/model copies or foreign
processes are involved. The check observations are9/8/9; the middle flow then fails
at the intended warning assertion, after both normal exits and durable readback.

Two real UI-created closed Projects own ordinary/private pending metadata; a third
unrelated saved Project remains open. Their four fixture rows include terminal
APP_RESTART and completed controls, deliberately malformed/unusable frozen payloads
and no input files. This is metadata fixture setup through the real DB after startup,
not public inference admission or valid accepted-result provenance. The original
Main warning names exactly two unfinished jobs and `Cancel Jobs and Close`. Native
Cancel preserves **all table rows**, the open-tab snapshot, both pending rows and
all three `.igs` bytes. Confirm uses the existing drain: both pending rows become
USER_CANCELED with incremented sequence before database close; terminal controls
stay identical. Normal restart reopens the witness through Home UI, reads the same
terminal queue and gives no repeat warning.

The isolated mutation leaves the real aggregate query in place and changes only
`const unfinishedJobCount = queueCloseImpact?.unfinishedJobCount ?? 0;` to zero.
The real Main silently closes and durably cancels the two pending rows. The harness
records zero dialogs, completes restart and its second normal close, then fails
specifically because no warning preceded cancellation. Original/restored copied
Main bytes are identical; production source/live dist and all recorded source/bundle
hashes remain unchanged across the mutation sequence. Only a declaration exposing
existing owners and that one consumed-count mutation are added to copied Main.
Dialog choices/error presentation are controlled; native dialog appearance is
**not** visually qualified. This is not a pristine/fused AppImage test.

Five earlier setup attempts are excluded. Their retained source snapshots document
Electron evaluate argument positions, actual renderer Close/Open Home behavior and
settlement: removing a tab precedes asynchronous Home refresh, and tab activation
can be refused while the close action is pending. None is a semantic RED. Four
failed attempts closed normally in cleanup. R2's normal cleanup timed out after
an out-of-sync direct API Close; its owned finite deadline was retained, and a
separate PID/start/cgroup supplement confirms physical exit. That exit is neither
normal nor included in the six qualified closes. Final setup uses actual UI Close,
waits for selected Home and reopens via the Home card.

Independent finite production/source-plan review is CLEAN. The pre-execution
harness source pass did not detect these setup assumptions and is not counted as
successful execution. Root corrected and executed the final harness; final source,
retained-byte and staged-byte checks are separate evidence. The eight workspace
SQLite prebuild files retain exact bytes, modes, mtime and inode.

Evidence is under
`~/.codex/artifacts/imagegen-studio/runs/generation-close-impact/20261116`:
`final-native-summary.json`, bounded logs/receipts, original/mutated copied Main,
all fixture rows/stores, source snapshots and normal/deadline exit proofs. The
payload archive preserves all **6,245 entries** at its archival checkpoint,
verified for complete membership, kinds, modes, link text and file hashes. One
stale agent-created Chromium TMP Unix socket has no file bytes: its identity and
absent kernel endpoint are recorded separately before removal. After confirmed
exit/restoration and dependency checks, Root removed only its idle payloads/TMP,
reclaiming **242,511,872 allocated bytes**. Shared ML/runtime/models, repository
dependencies, ordinary app data and external files remain protected. Final compact
run evidence is about52MiB against the1GiB soft budget; the existing39GiB artifact
root exception remains protected. Independent retained-byte and final source/index
proofs are recorded in the same run, separately from these actual executions.

This is an Install Update prerequisite, not a completed installer, shipping
publisher, binary replacement/rollback, upgrade/migration/runtime qualification or
full MVP acceptance. Promise statuses remain unchanged.
