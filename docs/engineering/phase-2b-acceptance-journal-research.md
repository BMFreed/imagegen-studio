# Phase 2B: durable Raster acceptance journal

Base: `e9f97aa`, clean `master` aligned with `origin/master` before this change.
Risk: high — SQLite migration, accepted-result lineage, shadow recovery and
destructive staging cleanup. Contracts: [PP-008](../product-promises.md#pp-008-генерация-меняет-проект-только-по-явному-решению),
[Generation Results](../features/project/generate-mode/generation-results.md),
[Project document lifecycle](../features/project/document-lifecycle.md) and
[accepted provenance](../features/project/generate-mode/generation-provenance.md).

## Observed gap and intended result

`ProjectGenerationAcceptance` already verifies candidates, inserts selected
Raster Layers as one document edit, proves a synced recovery shadow and then
tombstones the captured staging sessions. The complete cleanup set is held in
its process-local `PendingHandoff`. After a crash between shadow commit and
tombstones, reconciliation can identify accepted candidates from provenance,
but cannot distinguish the unchecked sessions of that Add from newer work. It
therefore preserves unchecked candidates. This is an explicit gap of the prior
[Raster acceptance checkpoint](./phase-2b-raster-acceptance-research.md).

This slice records that exact handoff durably before the document mutation.
Recovery can consume the captured sessions only after proving every selected
layer's immutable identity and its durability in shadow or the saved `.igs`.
A journal entry alone is intent, not evidence that Add happened. Newer
sessions, another document at the same local path and candidates without a
proven accepted counterpart must remain recoverable.

## Path, owners and invariants

Renderer Add → typed IPC → shared Project operation gate → generation fence →
verified staging candidate set → projected layers/provenance → SQLite journal
intent → Project edit and synced shadow → exact journal proof → one SQLite
transaction for captured session tombstones plus journal completion →
best-effort file cleanup. Project reopen follows the same proof/cleanup path
after the user has chosen the saved or recovered document.

The journal stores operation ID, local Project key, canonical Project path,
portable `documentId`, expected accepted layer snapshots and captured staging
session IDs. It stores no image bytes, ML weights or renderer state. Proof
matches layer ID, complete asset reference and immutable generation provenance;
ordinary name, visibility, opacity or placement edits do not remove lineage.
The local key and portable ID are both required: a copy shares `documentId`,
while a replacement at one path shares the local key.

Only one pending intent is allowed per local Project/document pair. A different
operation cannot overwrite it. Existing no-journal handoffs retain their
conservative recovery rule. Add still rejects unfinished jobs; early Add and
its cancellation confirmation remain a separate task. `.igs` changes only on
explicit Save, and journal writes do not add document revisions or Undo steps.

## Failure matrix

| Trigger                                      | Observable invariant and recovery                                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Journal write fails                          | No Project mutation and no staging deletion.                                                                              |
| Crash after intent, before Add               | No accepted layer proof: remove the abandoned intent and retain every candidate.                                          |
| Crash after synced shadow, before tombstones | On recovered-document open, prove all recorded immutable layers, then clear exactly captured selected/unchecked sessions. |
| User undoes the entire Add before cleanup    | Preserve candidate bytes and abandon the intent; do not interpret the journal as accepted state.                          |
| Partial or changed immutable lineage         | Preserve candidates, retain the generation fence and report recovery required.                                            |
| Tombstone transaction fails                  | Journal remains pending and no partial tombstones commit; retry is safe.                                                  |
| Crash after tombstones before file cleanup   | Journal is already completed; staging startup hides/cleans those exact sessions.                                          |
| Newer candidate or same-path other document  | Outside the captured matching intent; preserved.                                                                          |
| Cleanup retry or repeated Add                | No duplicated layers or Undo steps; exact operation/tombstones make completion idempotent.                                |

The intent cannot share an atomic transaction with filesystem shadow publication.
Writing intent first and requiring independent durable proof is the recovery
mechanism for that split boundary. Broad cleanup by Project path or accepted
candidate overlap cannot identify unchecked sessions safely; keeping only the
in-memory map reproduces the observed gap.

## Parameters and verification

The journal reuses the existing `projectJsonBytes` ceiling for serialized
payload, the current Add limit of 64 accepted layers and `archiveEntries` for
captured session count. These are safety bounds, not throughput or memory
benchmarks. Free space, interruption timing and transient memory remain
external conditions; failed disk/SQLite writes must preserve staged pixels.

Verification uses real SQLite migrations/reopen, production journal transactions,
staging manifests/PNGs, Project shadow and `.igs` Save/reopen. Controls cover
intent without adoption, complete versus partial proof, ordinary versus
immutable layer changes, newer sessions and another document at the same path.
An isolated semantic mutation must make the main crash/recovery regression
red. Full app tests, typecheck, lint and fresh Electron smoke check neighboring
flows; execution results are recorded below after implementation.

## Executed evidence (30.09.2026)

Checked the working tree based on `e9f97aa`, including the new migration,
journal repository, acceptance integration and generated database types.

The original restart gap was reproduced before the change in an isolated copy
of the base acceptance code/tests. Changing only the expected remaining set to
the newer candidate made `recovered shadow can finish tombstones before new
Generate admission` fail: the captured unchecked candidate was still present.
The command used `tsx --test --test-name-pattern='recovered shadow can finish'`;
one test executed and failed with a result-set assertion, with zero skips.
The corrected final test also preserves a same-path other-document candidate.

| Boundary                          | Observable result and neighboring control                                                                                                                                                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Real journal SQLite and reopen    | Exact intent survives reopen; another operation/payload cannot overwrite or complete it. Same path/different document and same document/different path remain isolated.                                                                           |
| Atomic completion                 | Failure on session 401 after the first 400-session chunk rolls back all tombstones; failure on intent DELETE also rolls back tombstones and preserves the intent. Normal completion and its retry succeed at the existing 10,000-session ceiling. |
| Document mutation and intent      | Journal write failure leaves the complete document unchanged. Intent before apply/full Undo preserves candidates; a later explicit Add can use another selection without reopening.                                                               |
| Immutable adoption proof          | A changed provenance with unchanged candidate/image hash and a partially represented Add preserve journal, candidates and fence. Ordinary name, visibility, opacity and transform edits retain proof.                                             |
| Real queue/staging/shadow restart | Interrupted Add consumes its selected and unchecked captured sessions after SQLite reopen and shadow recovery; newer and same-path orphan candidates remain. Saving and reopening `.igs` retains the accepted Raster/provenance.                  |
| Legacy/corrupt storage            | No-journal recovery preserves unchecked/newer sessions. Corrupt journal cannot authorize cleanup; current document B cannot consume old document A's journal or candidates at the same path.                                                      |
| Actual Electron entry             | Renderer selection/confirmation → IPC → Main Add completes journal and captured tombstones before Save. Undo/Redo keeps staging empty; crash recovery and explicit Save/reopen retain accepted assets/provenance.                                 |

The main staging restart regression uses the production queue, staging,
journal, filesystem, autosave coordinator and `.igs` loader/writer. A controlled
orchestrator adapter supplies fence state; later candidates are published
directly after repository restart to test the cleanup-set boundary, not Generate
admission. Coordinator matrix tests use controlled staging/queue adapters but
real SQLite journal and Project shadow/`.igs`; the staging integration and
Electron smoke cover their production consumers. No GPU inference is claimed
by this journal slice.

Commands and outcomes:

- `pnpm run app:test`: **498 passed, 0 failed/skipped**.
- `pnpm exec tsx --test src/main/projects/generation-acceptance-journal.test.ts src/main/projects/project-generation-acceptance.test.ts src/main/projects/generation-staging.test.ts`:
  final focused tree **51 passed, 0 failed/skipped** (10 journal, 26 acceptance,
  15 staging).
- `pnpm run typecheck` and `pnpm run lint`: exit 0.
- `pnpm run app:smoke`: exit 0 after a fresh desktop build; both desktop and
  Results/acceptance runners passed. The acceptance runner independently reads
  the SQLite journal/tombstones after killing Electron and before recovery.
- `git diff --check`: clean.

Six isolated semantic mutations were executed through `tsx --test` on copied
production source and real tests; the normal working tree was never mutated:

| Mutation                                             | Runtime failure                                                                                                                                |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Remove completion transaction                        | 2 of 10 journal tests fail on observable rollback state after chunk/DELETE errors.                                                             |
| Skip exact handoff equality                          | 3 of 10 journal tests fail on conflicts, identity isolation or corruption.                                                                     |
| Skip asset/output hash equality                      | 1 of 10 journal tests fails because invalid intent is admitted.                                                                                |
| Weaken immutable layer proof to candidate/image hash | Targeted `changed immutable provenance`: 1 executed/failed; expected recovery rejection disappears.                                            |
| Ignore the persisted journal at reconciliation       | Targeted `recovered shadow can finish`: 1 executed/failed; captured unchecked candidate remains alongside the two required preserved controls. |
| Skip journal record before apply                     | Targeted `journal write failure prevents`: 1 executed/failed; layer and revision change despite the required unchanged document.               |

All mutation commands exited 1 with runtime assertion failures, not dependency
or compile errors. Normal focused tests passed afterward; mutation copies were
removed. Independent review found a pre-apply failure liveness defect (a changed
selection was rejected before an absent intent could be abandoned); it was
fixed and covered. Review executed 47 then-current focused tests successfully;
the final expanded controls are included in the 51-test root run above.

## Failure signals and remaining scope

An unconfirmed shadow/Save, partial or changed lineage, invalid journal or
SQLite failure retains candidate evidence and the generation fence. Main
surfaces the acceptance error through typed IPC, or a cleanup-needs-attention
warning on Project open; the document remains usable. Reopen/retry reruns proof,
and committed tombstones allow staging startup to finish deferred file cleanup.
An absent adoption abandons the intent without deleting results. Repair of
corrupt storage must preserve its evidence; this change does not add a general
corrupt-database repair UI or storage quota policy.

PP-008 remains incomplete: unfinished-job early Add/cancellation, renderer
Generate admission and release runtime/pipeline, Smart Patch variants and
derived history are still separate roadmap tasks. The journal changes neither
portable `.igs` format nor the explicit Save boundary. Prototype UI was not
changed, so prototype visual runs are outside this slice's evidence.
