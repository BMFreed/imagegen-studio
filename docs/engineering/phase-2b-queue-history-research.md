# Phase 2B: retry and pruning of terminal queue history

Risk: **high**. A retry copies frozen generation input, while pruning deletes
SQLite rows and app-owned input files. The expected behavior comes from
[Queue Manager](../features/queue-manager.md) and
[PP-008](../product-promises.md#pp-008-генерация-меняет-проект-только-по-явному-решению):
failed/canceled work can be retried explicitly; deleting operational history
must not remove a valid unaccepted candidate or its seed cursor.

## Checked boundary and ownership

At base `0c2bc20` on `master`, the queue repository owns
`generation_queue_item` in SQLite and `generation-inputs/{itemId}` under the
private app-data root. Enqueue commits a frozen payload and target PNG to disk
before inserting a row. `recoverAfterRestart()` cancels former-lifetime
pending/running rows and removes input directories without a row. The staging
repository separately owns `generation_candidate_receipt`, the completed
candidate asset/manifest and `generation_seed_cursor`; these are not queue
history. A `reserved` receipt can still need its original canceled queue row
to reconcile a manifest-first crash, while a `completed` receipt remains
usable after that row is pruned. These ownership facts follow directly from
SQLite migrations `0005`/`0006` and staging recovery, not from prototype UI.

This checkpoint is repository-only. It does not expose Generate or Queue
Manager in the renderer, dispatch the release GPU worker, or make every Project
setting eligible for inference. Production input admission and model hashes
remain the existing processor's responsibility.

## Invariants and failure decisions

- Retry accepts only an exact failed/canceled source revision with valid frozen
  payload and PNG. It does not reconstruct inputs from today's Project draft.
  It creates a new pending item, batch and staging session. The source remains
  terminal history. An unresolved publication receipt blocks retry.
- Two repository instances must not turn one stale retry action into two new
  jobs. A SQLite compare-and-swap consumes the source sequence in the same
  transaction as the new insert. A later, explicit retry of a refreshed
  terminal source is a separate action; the first retry is not implicitly
  queued again.
- A Project-close fence is checked before the durable copy and again after
  awaiting file operations. Changed canonical Project **path** or corrupt
  frozen input fails closed. This repository does not compare the frozen
  `document_id` with a newly replaced `.igs` at the same path; user-facing
  Retry admission must check that before wiring this method. The local fence
  also does not claim to fence another process's independently opened instance.
- Delete and bulk prune select terminal rows only. A `reserved` candidate
  receipt blocks removal so staging recovery can finish. A `completed` receipt,
  published PNG/manifest and seed cursor survive. Pending/running rows and
  their frozen inputs are never selected by terminal pruning.
- Retry writes its new input directory first and then commits SQLite. A crash
  before the row leaves an orphan for startup cleanup. Pruning commits SQLite
  deletion first and then removes the now-unreferenced input directory. A crash
  between those steps also leaves an orphan for startup cleanup. Removing files
  before SQLite commit was rejected because it would strand a live queue row.

The finite status set is the `generation_queue_item.status` CHECK constraint:
`pending`, `running`, `completed`, `failed`, `canceled`. The two receipt states
are `reserved` and `completed`. The relevant size ceilings are inherited from
durable enqueue: target PNG 32 MiB, frozen payload 128 KiB, manifest 4 KiB;
this change introduces no new capacity value. Free disk space remains external
and unknown. Storage errors before the SQLite commit reject the operation.
After a committed row deletion, input-cleanup errors are warned rather than
reported as if the deletion failed; startup recovery reclaims those orphan
directories. No automatic eviction or retention policy is introduced.

## Verification and remaining boundary

Check the production repository through real SQLite and files: retry success,
same-sequence race across two repository instances, stale sequence, corrupt
input, Project fence, crash after file publication, delete/prune after DB
commit, and receipt `reserved`/`completed` controls. Run an isolated semantic
mutation that removes the reserved-receipt guard: the production test must
fail. Review the queue/staging paths together; a green in-memory queue mock
cannot prove the disk ordering or candidate independence.

Observed on the working tree based on `0c2bc20` (30.09.2026): focused queue
tests **28/28 passed** against real SQLite, private files and staging;
`pnpm run app:test` **463/463 passed**, `pnpm run typecheck`, `pnpm run lint`
and `pnpm run app:smoke` passed. The Electron smoke includes Results recovery,
explicit Add and portable Save/reopen; it does not drive the new private
retry/prune API from the renderer. In an isolated detached worktree, replacing
the production `noReservedReceipt()` predicate with `1 = 1` made the focused
reserved-publication test fail: pruning removed one row where zero were
expected. The mutated worktree was removed.

After this repository checkpoint, renderer Generate/Queue Manager controls,
same-path current-document admission, release runtime/inference parity, and
user-facing retry/prune wiring remain open. An invalid `reserved` receipt is
deliberately retained by staging recovery and therefore also blocks queue
pruning; a separate explicit resolution path will be needed before a complete
retention policy. PP-008 stays **not yet publicly promised** until its whole
flow passes.
