# Phase 2B: confirmed early Raster acceptance

Base: `f6e57c3`, clean `master` aligned with `origin/master`. Risk: high —
confirmed cancellation, worker exit, immutable acceptance and recovery cleanup.
Contracts: [PP-008](../product-promises.md#pp-008-генерация-меняет-проект-только-по-явному-решению),
[Generation Results](../features/project/generate-mode/generation-results.md),
[worker cancellation](../specs/05-worker-protocol.md) and
[durable acceptance journal](./phase-2b-acceptance-journal-research.md).

## Observed gap and chosen boundary

At the base revision, Add rejected any unfinished job for the Project. The contract permits
accepting completed results before siblings finish after explicitly explaining
the cancellation and unchecked-result discard. Renderer has no job IDs in its
Results snapshot and confirms only unchecked candidates. The existing
`cancelProjectJobs` is a close operation: it permanently marks cancellation
started and cannot release the fence while the Project remains open. Reusing
it would leave a successful Add unable to admit new work.

This slice adds exact sibling-job confirmation to the existing Add flow. Its
scope is the currently open document and staging sessions represented by the
eligible completed candidates being reviewed. A newer unrelated session,
another document at the same path and another Project are preserved. No normal
renderer Generate or release-runtime installation is enabled here.

## Owners and operation order

Verified Results/staging + lightweight SQLite queue scope → typed snapshot with
sibling job IDs → renderer confirmation of candidate/job sets → Main operation
gate and generation admission fence → authoritative set comparison and selected
image/layer/package preflight → scoped cancellation with confirmed worker exit
→ candidate-set recheck for a completion that won the race → existing journal
intent → one document edit/synced shadow → exact tombstones/journal completion.
The main `.igs` changes only on Save; Undo restores the accepted document edit
without reviving staging or canceled jobs.

Cancellation uses a distinct orchestrator operation, not the close marker.
While cancellation runs or worker exit is uncertain, generation admission stays
fenced. Successful retry proves exit before release; an in-process cancellation
scope permits reconciliation without interpreting intent as an adopted layer.
After crash the existing bootstrap cancels unfinished rows from the old worker
lifetime. Journal adoption/cleanup proof remains unchanged.

## Parameters, failures and neighboring controls

The existing 64-selected-layer and 10,000 archive-entry bounds constrain Add
and its confirmation arrays. Queue identity is UUID plus local Project key,
portable document ID and staging-session ID. No inference, timeout, package or
image-size ceiling changes. A queue scope query reads stored identity instead
of re-hashing every 32 MiB frozen target just to show a count. Disk space,
worker-exit timing and actual model memory remain external conditions. The
confirmed-ID lookup uses 500 IDs per SQLite query plus two status parameters,
below the legacy 999-variable limit; the 10,000-ID regression crosses 20 chunks
and checks exact membership/order. This is a query policy, not a measured queue
capacity or a new product batch limit.

- Cancel confirmation: no queue/document/candidate mutation.
- New candidate or new sibling job before commit: require fresh confirmation;
  no silent expansion of cancellation/discard scope.
- Invalid selected pixels, document mismatch or package limits: reject before
  cancellation and retain results.
- Natural completion during cancellation: recheck staging before adoption;
  preserve the newly completed result if the reviewed set changed.
- Unconfirmed worker exit or cancellation failure: no Add/cleanup; retain
  candidate pixels and fence, expose a retryable error.
- Confirmed cancellation: stop only reviewed siblings, preserve unrelated rows,
  and prevent canceled late `done` from publishing or advancing seed.
- Journal/shadow/cleanup failure: existing exact durable proof and recovery
  rules preserve pixels; no new `.igs` format or migration.

Verification uses real SQLite/queue/processor with controlled external worker
transport, real Project shadow/package roundtrips, and native Electron
confirmation with post-startup pending fixtures. Sparse/model fixtures and
injected inference do not qualify GPU or release runtime. Phase 2A release
install/repair remains an explicit separate gap.

## Batch construction boundary

Implementation-aware review identified that production `enqueueOne` allocates a
new `stagingSessionId` and batch ID for each individual job. Two independent calls
are therefore not one user batch, and document-wide cancellation would overreach.
This checkpoint verifies valid shared-session inputs constructed through the real
queue repository; tests/smoke inject that group membership as a precondition.
The future batch scheduler must allocate one durable group/session ID before
enqueueing its N jobs. Neither this grouping entry point nor ordinary renderer
Generate is implemented or claimed here.

## Executed verification (30.09.2026)

Revision: dirty working tree based on `f6e57c3`, including the new note, shared
snapshot/IPC contract, main cancellation/acceptance and renderer confirmation.
Raw evidence and mutation patches are retained outside the checkout at
`/home/user/.codex/artifacts/imagegen-studio/phase-2b-early-add-2026-09-30/`.

- Acceptance regressions before implementation: 6 executed, 1 neighboring
  control passed and 5 failed on the old unfinished-job/refusal behavior.
  After implementation, the acceptance suite passed 31/31; acceptance + result
  resource + preload guards passed 38/38. These coordinator tests use real
  Project/shadow/package and SQLite journal, with controlled staging/cancel
  adapters. They do not substitute for the real queue/processor checks below.
- Queue/orchestrator/processor: 68 passed, 0 failed/skipped. New-entrypoint
  baseline red: 8 failed on missing scope/cancel methods. Real SQLite and
  processor test pending/running cancellation, confirmed exit, late `done`,
  current document/session/job scopes, uncertain exit retry, admission after
  successful acceptance and existing irreversible Project close. External
  inference transport and group membership are controlled preconditions.
- Isolated main mutation skipped the candidate-set recheck after cancellation:
  the natural-completion test failed with missing `ACCEPTANCE_SELECTION_STALE`,
  while the ordinary Add control passed. Restoring it gave 2/2 passes. The
  isolated orchestrator mutation removed confirmed-ID membership validation:
  3 scope/new-job regressions failed; restoration gave 8/8 focused passes.
  A third isolated renderer mutation removed jobs-only confirmation: the native
  test failed because the dialog never appeared, after 3 layers were accepted
  and 2 pending jobs canceled without the warning. Neighbors stayed pending.
  Restored renderer source matched the shared original byte-for-byte and the
  complete native scenario passed again. Shared source was never mutated for
  these experiments.
- Native Electron Results smoke passed with real typed IPC, queue/staging,
  Project owner, shadow and portable Save/reopen. It verifies jobs-only and
  combined cancel/discard confirmation, Cancel without mutation, another job
  arriving during the dialog requiring a second confirmation, exact canceled
  row sets, unaffected neighboring rows, grouped Undo/Redo, crash/recovery and
  accepted provenance/pixels after Save. The completed seed remains 73 while
  canceled requests had planned seed 42. Same-path/other-document fixture rows
  deliberately share a session UUID to test cancellation exclusion; this proves
  their status is preserved, not future publication for that artificial reused
  UUID. Normal new sessions are generated separately.
- Actual before/after native screenshots were inspected at 900×620: jobs-only,
  combined warning, settled changed-count dialog and accepted two-layer state.
  Counts and actions fit, only Add is primary, and the modal disappears after
  success. Renderer page errors were `[]`. Host Wayland/Vulkan compatibility
  diagnostics remain separate from Project/renderer failures.
- `pnpm run typecheck`: passed (prototype and desktop). `pnpm run app:test`:
  539 passed, 0 failed/skipped. `pnpm run lint`: passed.
  `pnpm run app:smoke`: fresh build and both native smoke scripts passed.
  No prototype UI was changed; these checks do not assert new prototype coverage.

An initial native fixture run opened/closed multiple Node SQLite connections
while Electron owned the live database and hit `SQLITE_CORRUPT` before Add. It is
not behavioral red evidence. Keeping one fixture WAL connection through the
native action and closing it only after the process exits made the complete
scenario pass. Fixture setup remains separate from the production single-main
SQLite owner. The copy-only mutation harness also needed the existing worker ICC
resource and direct installed executables; missing resources/dependency setup
failures are excluded from semantic red counts.

Implementation-aware read-only review found no further proven data-loss defect
on valid shared-session inputs. It identified the batch construction limitation
above; this was added to the promise matrix and roadmap instead of claiming an
ordinary Generate/batch entry point. Unconfirmed exit reports a retryable error
and keeps admission fenced; retry/reconciliation proves the original authorized
scope stopped before releasing it. Crash uses the existing old-lifetime queue
cancellation and candidate recovery paths. A new DB migration, `.igs` schema,
background preview worker or release runtime was not introduced.

The roadmap export row also stops listing the already verified `Save Candidate
Image` as pending; `Export As` and `Export Generation BBox` remain open.
