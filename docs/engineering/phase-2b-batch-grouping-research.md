# Phase 2B: durable grouping of qualified jobs

Base: `2a3a42a`, clean `master` aligned with `origin/master`. Risk: high —
queue publication, recovery metadata, dispatch admission and filesystem cleanup.
Contracts: [PP-008](../product-promises.md#pp-008-генерация-меняет-проект-только-по-явному-решению),
[Queue batch/frozen job rules](../features/queue-manager.md#batch-model),
[Generation Results](../features/project/generate-mode/generation-results.md) and
[concrete seed schedule](../features/project/generate-mode/dynamic-prompting.md#seed-behavior).

## Confirmed starting point and scope

`enqueueOne` currently allocates a new staging session, and the queue allocates a
new batch ID per row. Early Add already supports shared-session input, but its
previous tests injected membership as a fixture precondition. The next internal
entry point accepts an ordered list of already qualified concrete Illustrious
`txt2img` jobs from one frozen Project snapshot. One batch/session identity groups
them durably; each remains independently dispatchable/cancelable. All input
directories are synced before a single SQLite transaction exposes the group.

The list is already expanded and seeds already concrete. Fixed/Random/Reuse,
uint32 wrap and prompt-pair/iteration order are existing product decisions, not
new policy in this slice. Public dynamic expansion, output-count UI, ordinary
Generate, GPU qualification and release runtime install remain separate. The
prototype's 100-job guard is not a production limit. Phase 2B is not complete.

## Owners and boundaries

Caller holds qualified request target leases → orchestrator snapshots metadata
and one common PNG before its admission barrier → verifies current open document,
indexed canonical path and exact model → queue freezes/validates concrete inputs,
allocates one batch/session and planned item identities → required staging
capacity/fresh-session preflight → file-first publication → atomic queue rows →
dispatch through the existing processor → verified candidates in the common
session → exact early Add cancellation and existing journal/shadow/Save boundary.

Input must share document ID/revision, bbox, target bytes, exact model and sampling
settings other than the supplied concrete prompts and seeds. Jobs do not reread
mutable Project settings. Queue IDs are opaque random UUIDs allocated as a sorted
list and assigned to supplied item order. A common real `created_at` and the
existing `created_at,id` ordering preserve within-batch order without fabricating
timestamps or adding an ordinal migration. Dispatch can interleave independent
batches; global batch-contiguous scheduling is not claimed.

Startup recovery runs only on the production recovered queue/staging pair,
before admission. A concurrent recovery owner must not delete input directories
being published. The existing lifecycle remains main-owned and single-process.

## Parameters and failure policy

Existing recovery format: at most 64 candidates per session, 128 KiB frozen JSON
per candidate and 8 MiB session manifest. These become shared named constants;
they are storage ceilings, not a measured public batch capacity. Admission also
preflights aggregate escaped JSON using the actual payloads/path and conservative
maximum completion metadata. Individually valid jobs can collectively exceed
the manifest ceiling and must fail before files/rows are published. A public
capacity limit still requires the roadmap's capacity tests before Phase 2C.

Each existing target is limited to 32 MiB, 2048 per side and 4,000,000 pixels.
Inputs in this slice share one frozen PNG in memory, but durable per-job input
directories remain independent: 64 maximum-size copies can require 2 GiB on
disk, plus the caller's existing scratch lease and filesystem overhead. No
deduplication/refcount format is introduced. Free disk, fsync failures, actual
model size and VRAM remain external conditions; no new inference budget is inferred.

- Empty, oversized, mixed-snapshot, duplicate-request or invalid input: no
  published input or dispatchable row.
- Fresh session already exists/is discarded/reserved: refuse reuse.
- Capacity, model or worker-request qualification failure: no queue mutation.
- Failure after input directory publication: prove no committed rows before
  deleting files; a partial batch is never dispatchable.
- Lost commit acknowledgement: an exact full committed row set proves success.
  Uninspectable/partial outcome retains inputs and blocks this Project's claim,
  admission and fence release until successful startup recovery. Neighboring
  Projects retain their independent queue operations.
- Project closes/replaces during admission: fence/identity checks prevent a new
  group, or cancel exactly its just-committed rows before reporting failure.
- Later caller/Project edits cannot change frozen bytes, seeds, prompts or scope.
- Completion and early Add use real queue/staging/processor and preserve the
  main `.igs` until explicit Save; retry still creates an independent session.

## Verification plan

Focused red/green will exercise the real queue and staging capacity boundary,
SQLite transaction failure, interrupted file publication, uncertain commit,
ordering and input immutability. Orchestrator integration will create a real
shared group, complete one job with controlled external inference, expose its
unfinished siblings through Results and early Add, preserve a neighboring group,
and verify shadow/portable Save. Semantic mutations will remove atomic publication
or a capacity/ownership guard in isolated copies and must make the regression
fail. Typecheck, lint, application tests and native smoke verify existing wiring.
No UI design/prototype changes are planned. Actual outcomes will be recorded
after execution; fixtures do not qualify GPU or release inference.

## Executed evidence (30 September 2026)

Checked the uncommitted implementation over base `2a3a42a`. The changed owners
are the orchestrator, queue, staging repository and shared recovery limits;
renderer, IPC, prototype and Python inference implementation are unchanged.

| Boundary                 | Red before implementation                                                               | Final green                        | Isolated semantic mutation                                                                                                                                                                       |
| ------------------------ | --------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Queue grouped admission  | 11 failed batch cases                                                                   | 41 queue tests; focused 11 passed  | Removing the transaction produced 6 failures and 5 passes; an independent SQLite observer saw partial rows before commit. Restored: 11 passed.                                                   |
| Staging capacity         | 4 missing-method failures, then the unsafe-permissions regression failed before its fix | 20 staging tests; focused 5 passed | Removing the manifest-byte guard produced 2 failures and 3 passes: escaped aggregate overflow and exact 8 MiB/+1. Restored: 5 passed.                                                            |
| Orchestrator integration | 5 new cases failed for absent `enqueueBatch`; existing ownership control passed         | 6 focused cases passed             | Retaining caller metadata references produced 1 failure and 1 pass: the persisted prompt changed after admission, while the neighboring acceptance ownership control passed. Restored: 2 passed. |

All listed final runs have zero failures/skips. The integration test uses the
actual Model Service structural/file checks, qualified request leases, queue,
processor, staging, Results resource, acceptance journal, document/shadow and
portable `.igs` writer/reader. It supplies concrete prompts/seeds and substitutes
the external inference transport; it does not replace the grouping operation
with manually inserted membership. The separate native Results smoke still uses
its historical injected shared-session precondition and verifies existing IPC/UI
acceptance wiring, not the new internal admission API.

Verified failure cases include missing/mixed inputs, duplicate requests, caller
mutation during an await, preflight refusal, interrupted per-job file publication,
SQLite failure during the second row, a close fence raised before commit,
lost commit acknowledgement and uninspectable reconciliation. No failed atomic
admission leaves a dispatchable partial group. Capacity tests cover 64/65 items,
JSON escaping and exact serialized 8 MiB/+1, reused queue/receipt/tombstone
identity, existing/dangling session paths and unsafe existing ancestors without
permission changes. A replaced document after commit cancels only that group;
unconfirmed cancellation keeps the fence until confirmed close/recovery.

Commands and results:

- `pnpm run app:test`: **560 executed, 560 passed, 0 failed/skipped**.
- `pnpm run typecheck`: prototype and application typechecks passed.
- `pnpm run lint`: passed.
- `pnpm run app:smoke`: fresh build, desktop storage/IPC/runtime-degraded checks
  and native Results/early Add/Undo/recovery/portable Save passed; Results page
  errors were empty.
- Focused queue/staging/orchestrator commands, red logs, mutation patches and
  restored logs are preserved outside the checkout at
  `~/.codex/artifacts/imagegen-studio/phase-2b-batch-grouping-2026-09-30/`.

Existing Vite chunk-size and desktop Wayland/Vulkan messages did not fail the
smoke. They are not evidence of model inference qualification. No new public
capacity, renderer Generate, dynamic planner, GPU pipeline or installed release
runtime is claimed. Full Phase 2B acceptance remains open.

## Implementation review

Self-review and an implementation-aware parallel review found no blocker in
caller snapshotting, document/fence checks, owned dispatch ordering, exact
postcommit cancellation, conservative uncertain-publication recovery or
capacity preflight. This was not a blind product audit. The new unconfirmed
batch cleanup test injects a `cancelAndWait` failure; the admission barrier keeps
its new rows pending. Controlled running-worker exit and late-result behavior
are covered by existing processor/orchestrator regressions and native early Add
smoke, rather than claimed as newly exercised by that injection.
