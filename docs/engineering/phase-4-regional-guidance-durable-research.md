# Private durable Regional Guidance jobs

## Boundary and source

High-risk queue/filesystem change, based on clean
`c5db277fb583fc2476079421b5fd0790864d7b53`. The existing private worker handoff
now has a durable Main owner: frozen input → queue attempt → explicit Retry →
correlated PNG bytes → the existing candidate receipt/manifest/completion
transaction. Public Generate, Results, Add and Save remain outside this slice.

Current local InvokeAI was inspected at
`a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd`:

- `invokeai/app/services/session_queue/session_queue_default.py`, including
  `_enqueue_batch`, `retry_items_by_id` and startup cancellation: prepare detached
  execution state, admit transactionally, retry the saved graph in a new attempt.
- Its queue router and `features/queue/data/serverApi.ts` /
  `httpRealtimeQueueBackend.ts` callers: owner-bound retry and item association.
- `invokeai/app/services/session_processor/session_processor_default.py`:
  cancellation of the exact running owner.
- `invokeai/app/services/images/images_default.py`, `image_files_disk.py` and
  `services/shared/database/schema/session_queue.py`: named media and durable
  session/resource ownership.

Invoke's graph/services cannot be inserted literally into Studio's Node/Python
protocol. This adaptation was disclosed before implementation: retain its saved
execution/resource-reference mechanism through the existing Studio SQLite queue,
owned files and candidate receipt owner. No second queue, sampler, native loop,
model loader or regional attention implementation was added.

## Ownership and failure behavior

`enqueueCurrentCanvasRegional` synchronously detaches inputs, then uses the
existing durable target-directory and SQL admission path. `regional.json`
retains the complete recipe, explicit globals, pools and layout; raw alpha is
stored in fixed-role files with exact size/SHA. Request paths are reconstructed
for each attempt. SQLite stores a distinct `illustrious-regional` payload with
the metadata digest. Migration0020 preserves the eight previous operations,
rows, receipts, seed cursor and indexes while extending its operation CHECK.

The private claim shares the ordinary/Smart global running-slot CAS. Restart
cancels pending/running work; it never automatically resumes native computation.
Explicit regional Retry makes an independently synced input copy and a new
row/batch/session while preserving the saved seed/settings/refs. A stale source
revision refuses. Pruning its old row cannot invalidate the retry. An uncertain
SQL acknowledgement retains input ownership rather than deleting committed data.

`RegionalGenerationProcessor` checks the qualified private capability and
reverifies the exact checkpoint/resolved policy and every effective signed TI
pair through existing ModelService methods. It calls the existing client once.
Its result's historical output path has already been disposed; only owned PNG
bytes go to `publishRegionalCandidate`. Actual RGB dimensions/ICC/seed and bytes
are independently checked before the shared receipt/files/completion transaction.
The completed candidate survives queue pruning and database reopening.

Cancellation waits for the owning worker's physical exit before acknowledging a
running row. Unconfirmed exit keeps the owner/slot for a close retry. Cancellation
during publication joins that publication; a reserved/unreadable receipt stays
fenced for restart reconciliation. Manifest-first completion is reconciled by the
existing staging recovery, without duplicate candidates or seed-cursor updates.

Normal dispatcher routing, queue-manager discovery/counts, candidate image reads
and accepted-provenance parsing exclude the private operation. Capacity and
recovery still account for its candidates. Private callers must own/quiesce and
explicitly discard their sessions: the public Project close/review flow does not
enumerate these private results. No public lifecycle integration is claimed.

## Finite parameters

| Parameter             | Bound/source                                                    | Behavior                                                 |
| --------------------- | --------------------------------------------------------------- | -------------------------------------------------------- |
| SQLite frozen payload | Existing 128 KiB                                                | Refuse oversize metadata                                 |
| Regional metadata     | Existing worker-adapter 1 MiB                                   | Exact fixed-file size/SHA                                |
| Raw alpha aggregate   | Existing 64 MiB                                                 | Fixed regional/global roles; no arbitrary filenames      |
| Target                | Existing 32 MiB, 8–2048 sides, ≤4,000,000 pixels                | Verify exact transparent pinned-sRGB RGBA                |
| Native lane           | Existing explicit CUDA FP16/shared-readonly TI/Euler v2         | No CPU production-loader, LoRA or external VAE expansion |
| Other inputs          | Existing three-region, text/TI/row/mask and 1–200-step ceilings | Existing consumers retain their refusals                 |

Snapshot readers require canonical owned directories and stable single-link
regular files, reject symlinks/extra entries and never traverse model references.
Installed checkpoint/TI bytes remain catalog-owned, with no deletion lease or
model copy. Replay fails if the exact installed resource is unavailable. Current
ordinary preparation metadata must agree with empty independent worker embedding
tuples; genuine prepared-global-TI admission is not qualified here. Recipe-owned
regional TI reverification has focused controlled-fixture coverage.

These are admission/payload bounds, not measured disk, RAM or VRAM capacity.
Retry and transport can simultaneously own independent copies. A checksum binds
bytes and metadata; it does not authenticate a caller's catalog/project authority.

## Executed evidence

ROOT ran **424 affected Main cases PASS**, zero failures/skips, across the new
queue/material/processor/staging owners, migrations and ordinary/Anima/Smart and
regional transport neighbors. The final exact-source rerun also passes all 424 cases; common typecheck,
scoped ESLint/Prettier and diff checks PASS. Command logs and bounded resource
records are retained separately; repeated runs are not added to the case total.
Controlled tests use real SQLite/filesystem and explicitly substituted small
model resolvers/transports; they do not establish trained execution.

Fresh real Save/reopen/capture/planner/ModelService/target composition produced six
complete Main recipes with zero network attempts. One unchanged recipe was used
with an explicit test-authored ordinary preparation/command at two Euler steps:
official Illustrious v0.1 epsilon `3e15ba…45aa9`, 1024², bbox `(-13,5)`, seed123,
CFG5, actual Main false-ZTSNR/leading policy, no TI. This does not claim a public
Service/coordinator submission entry point or a changed sampling default.

The new native probe:

1. Enqueued that recipe; changed caller text/alpha and removed its transient target.
2. Closed/reopened the actual database, canceled the old attempt on restart,
   retried it and pruned the source row.
3. Used real Main ModelService plus the actual qualified Python inference child,
   production checkpoint loader and unchanged regional PNG output.
4. Closed the child and database, reopened/reconciled again, pruned the completed
   queue row and independently reread the surviving private candidate/seed cursor.

The original target/package stayed exact. Normal candidates stayed empty and
ordinary provenance parsing refused the private payload. The **2,045,268-byte
RGB PNG** exactly matches the prior transport control:
`e5b160371d02f7385eb9113bd3061a40e03136c40a966470b132194d5faddcec`.
Independent reopening verifies every RGB byte, 1024² and pinned ICC; RGB SHA is
`b18347c52c136101394dda692f03a93902c0db9ef28639f6ac0aa5611738b905`.
IPC is 536 bytes and its transient bundle 4,206 bytes; frozen metadata is 2,410
bytes and both raw masks total 2,097,152 bytes.

The native unit completed in **24.011 s**, host peak **2,482,147,328 bytes**, within
12 GiB/zero-swap/600-second group bounds. Its controller confirms no remaining
owned PIDs. GPU allocation fraction/peak usage was not measured or independently
constrained; this is no capacity or visual-quality qualification.

A separate isolated hydration mutation reverses verified alpha bytes after
snapshot validation: **2 GREEN → one association assertion RED + one zero-region
parser control GREEN → 2 restored GREEN**. All 601 copied source files matched
the prelint source at restoration, and the live helper never changed. Subsequent
queue lint changes only reorder members/imports/properties and add braces; the
independent source reviewer checked that mapping. This mutation qualifies the
snapshot-association oracle, not another trained or visual intervention.

An independent final source review is CLEAN within the finite cooperative scope;
execution remains ROOT evidence. Earlier local diagnostics are excluded: one
queue test queried manager state through an unreconciled repository; a typecheck
ran before the processor file existed; the old0019 migration fixture accidentally
included0020; mechanical lint corrections followed the first affected run;
the final processor test needed an explicit array-element type. The last change
is one type-only import and annotation; emitted runtime JavaScript is identical.

## Scope and retention

Enabled-region public NEW refusal, frozen-work independence, Smart target-only
permissions and provenance/Compare/result-derived-preset exclusions remain.
PP-001/007/008 stay **«Пока не обещать»**. This does not repair prior negative
visual findings, qualify Anima or add a generic SDXL product family.

The next integration owner is an explicitly guarded Project submission/lifecycle
coordinator using these private queue/candidate owners. Public composition policy,
Results/Retry UI, explicit acceptance/Save and visual usefulness remain separate.

Evidence lives under
`~/.codex/artifacts/imagegen-studio/runs/regional-guidance-durable/20261103-frozen/`.
Source, original PNG, Main handoffs, TAP/logs, mutation original/control/
restoration and bounded resource records are retained. Lifecycle/cleanup records
separate archived input/source payloads from reusable external runtime, offline
config and the single protected original checkpoint. All 645 no-follow payload
entries, including 608 regular files and the literal mutation `node_modules`
symlink, were verified in a retained archive. After source restoration, all-reader
completion, fresh owned-process/dependency checks and archive verification, only
this run’s live `payloads` directory was removed: **14,344,192 allocated bytes**
reclaimed during the deletion-only interval. Its Main DB/package, candidate PNG
and mutation source bytes remain archived; historical absolute payload paths in
reports refer to that retained archive. No runtime/config/model dependency was
removed.


## Project lifecycle continuation

The later [private Project coordinator](./phase-4-regional-guidance-project-lifecycle-research.md)
closes the earlier manual-caller lifecycle gap: genuine Service submission,
registered regional execution, scoped close/recovery draining and operational
close-impact enumeration now use the existing owners. Public Results/Home and
NEW admission stay separate. The earlier native/424-case evidence above remains
historical; the continuation records its own source, checks and native result.
