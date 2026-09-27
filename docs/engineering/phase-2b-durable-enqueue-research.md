# Phase 2B: durable input for the first generation queue item

Base: clean `c59fe30`. Risk: **high** because this checkpoint coordinates
app-owned files and a persistent SQLite queue row. The expected result comes
from [Queue Manager](../features/queue-manager.md#frozen-job-rule),
[GenerationResults](../features/project/generate-mode/generation-results.md#candidate-lifecycle),
[worker protocol](../specs/05-worker-protocol.md#queue-first-contract), and
[PP-005/008](../product-promises.md). It must not yet enable Generate or claim a
completed candidate.

## Checked path and ownership

- Confirmed: `ProjectService` plus the development worker can freeze the finite
  target from a real `.igs`. `prepareNormalTxt2Img` copies the Project draft and
  PNG, resolves a concrete Fixed/Random seed and force-verifies an exact model.
- Confirmed: `withIllustriousTxt2ImgRequest` validates an explicit supported
  scheduler pair, target, prediction type and worker capability. Its staging
  directory is removed after the callback; retaining that `target.png` path in a
  database row would create a broken job.
- Confirmed: the current worker is `derivatives-only` and returns
  `INFERENCE_UNAVAILABLE` for the generation request. It has no GPU inference,
  output or candidate publication. Ordinary CivitAI checkpoint installs also
  record `predictionType: null`, so they cannot pass this request gate yet.
- Decision for this checkpoint: SQLite owns one durable `pending` queue item;
  app-managed generation input storage owns its immutable target and frozen
  context. Neither is part of `.igs`, document shadow, Home's rebuildable
  `project_index` or the current scratch directory. The portable document ID
  alone is not a local Project identity; the canonical local path/recovery key
  is retained separately.

The path is Project snapshot → qualified request lease → copy and validate
frozen context and PNG → publish a durable input directory → insert a `pending`
row. Dispatch, output validation, candidate publication, seed cursor, accepted
provenance, history and renderer events remain subsequent boundaries. Queue
startup may cancel old `pending`/`running` rows; it must never turn an old job
into a new running job automatically. Completed candidate recovery, when it
exists, will be independent of queue pruning.

## Failure model

SQLite and the filesystem cannot commit atomically together. Publish verified
bytes and a manifest in a private temporary directory, sync them, rename to a
unique final job directory, then insert the queue row. If insertion fails, clean
the unpublished directory. If the process dies after rename but before insert,
startup reconciliation may remove an orphan only after comparing it with queue
row identities. A row is not allowed to reference a missing or corrupt target;
reads and future dispatch must reverify the bytes and hash. If verification
fails, the job is diagnosable and never handed to worker. If the process dies
after insert, restart cancels the unfinished row and retains its frozen input
for an explicit future retry. Cleanup must not touch unrelated Project, model,
shadow or candidate files. Cancellation or queue-history pruning rules for this
input need to be implemented alongside their actions, not inferred from row
status alone.

Electron bootstrap calls restart reconciliation before creating a window. If
reconciliation fails, it logs `Generation queue recovery is unavailable`; the
current application still opens Project/Model Manager because no generation
processor or Generate IPC is active. Before enabling dispatch, runtime status
must gate queue processing on successful reconciliation and surface a repair
diagnostic. An interrupted/corrupt input remains a diagnosable local record;
it is never treated as a completed candidate.

The queue payload includes plaintext prompts in app-owned SQLite. The checked
local pre-change app data root and database directory were mode `0775`, and
`app.sqlite` was `0644`, so simply adding the queue row would expose prompts
to other local users. Database bootstrap now requires a canonical app-owned
data root and database directory, tightens both to `0700`, and checks/tightens
regular owned SQLite, WAL and SHM files to `0600` before queue writes. It
refuses symlink/hard-link substitution rather than following it. The
generation-input directory and its files are private separately. This does
not claim encrypted-at-rest data.

## Parameter register and verification

| Parameter / external bound | Source and consequence |
| --- | --- |
| Target ≤ 2,048 px per side, 4 million pixels, 32 MiB PNG | Existing `compose-target` and request guards; defensive, not measured GPU capacity. Enqueue must not relax them. |
| Request line ≤ 64 KiB, prompt ≤ 16 KiB each, Steps 1–200, CFG 1–30 | Existing first request contract; provisional limits, explicit refusal before publication. |
| Frozen SQLite payload ≤ 128 KiB; input manifest ≤ 4 KiB | New defensive queue bounds; payload includes frozen Project context in addition to the worker request. Oversize/corrupt data is rejected, not truncated. |
| Model checkpoint size, free disk and filesystem durability | External/unknown at enqueue; target plus manifest need space. Write/sync/rename failures must leave no queue row that appears executable. |
| Queue history retention and durable input lifetime | Not yet defined as an automatic size/time policy. This checkpoint retains inputs for canceled jobs and does not implement terminal pruning. |

The meaningful test boundary is real SQLite plus filesystem across close/reopen,
including unchanged frozen bytes after caller mutation, missing/corrupt files,
forced insert failure, orphan reconciliation and previous-lifetime status
conversion. A neighboring control is a valid item reopened without corruption.
A semantic mutation such as retaining the temporary lease path or marking a
stale row `pending` again must make these checks fail. Passing this checkpoint
does not prove the GPU worker, renderer Generate, or staging recovery.

## Verification on this checkpoint

The dirty tree based on `c59fe30` passed `pnpm run typecheck`, `pnpm run lint`,
`pnpm run app:test` (294/294) and `pnpm run app:smoke`. The
[queue integration tests](../../src/main/projects/generation-queue.test.ts)
use real SQLite and files across reopen. The desktop smoke seeds an unfinished
row before Electron launch and reads its `APP_RESTART` cancellation after the
app exits, so that verification cannot disturb the live SQLite WAL. An
isolated mutation that stopped canceling `running` jobs made the corresponding
restart test fail. Dispatch and result publication are still absent.
