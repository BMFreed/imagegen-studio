# Idle Model Manager hard Remove Local Resource

Base: clean `master` `6b812f93d2715af2c4f904e70093b3f9c5b09713`.
Risk: high, destructive managed-file/resource lifecycle, IPC and migration.
Supporting contract: [Remove Local Resource](../features/model-manager.md#remove-local-resource),
PP-003/005/006/007. Public statuses remain unchanged.

## Fresh basis and disclosed gaps

Clean Invoke `4875d96531ca6712b288f6e660fcbb34143408c1` was read anew:
`invokeai/app/api/routers/model_manager.py` `_claim_model_key`/`delete_model`
and update/conversion callers; `services/model_install/model_install_default.py`
`delete`/`unconditionally_delete`; `services/model_records/model_records_sql.py`
`del_model`. Frontend callers under `invokeai/frontend/webv2/src/`:
`features/models/ui/shared/ModelActionsMenu.tsx`, `ui/detail/useModelActions.ts`,
`data/api.ts` and the models catalog/UI stores. Captured target confirmation,
exclusive operation claim, managed individual-file unlink before registry and
authoritative catalog publication are adapted to existing Studio owners.

The user was told before adaptation: this Invoke delete path does not check
running/pending queue usage, Project/Preset/provenance refs or shared Anima
companions. Its cache drop/stale mechanism is separate, not a deletion lease.
Additional source review: `services/orphaned_models/orphaned_models_service.py`,
`services/model_install/install_staging_ledger.py` protect registered roots and
installation sources; `services/session_queue/session_queue_default.py` and
router `session_queue.py` have explicit pending-only cancellation, unconnected to
model deletion. These are not proof of Studio destructive behavior.

## Finite consumer and ownership

The first consumer removes all versions of one captured resource only with a
globally idle recovered generation queue and idle installer. It does not cancel
jobs, invent a resource classifier or allow an unrelated job through this first
maintenance boundary. Pending/running work produces an explicit refusal and
instructions to finish/cancel through Queue. Resource-specific usage and confirmed
affected-pending-only cancellation remain required follow-up work for full MVP.

App's existing generation action admission blocks normal Generate/Retry/Smart
preparation. Queue's existing serializer rechecks every pending/running operation
and holds publication/claim until completion, including an already entered claim.
Installer's exclusive storage claim rejects a start already preparing metadata,
queued/download/verifying/publication and another removal. No new scheduler or
worker owner is introduced. Scope is the single production queue/SQLite owner;
external concurrent writers are not granted by this contract.

Main captures one exact full catalog snapshot behind an opaque one-attempt UUID.
Renderer receives no paths. A newer review invalidates an older token. Execution
rechecks the complete target inside the existing repository transaction. A changed
default/version/dependency/identity at execution requires a new review. This is
snapshot value-CAS, not a monotonic epoch: edit/Undo returning the identical
snapshot is permitted. Unlink callback cannot
reenter repository/queue methods while their existing owners are held.

Only strict managed content-addressed individual files are eligible. Every
ancestor is checked without following symlinks. Nonregular/out-of-root targets
are refused; ENOENT is absence, not permission failure. Shared paths owned by
another resource are retained. Incoming Anima companion ownership refuses direct
component removal; removing a checkpoint never sweeps companions. No directory
`rmtree`, storage sweep, Trash or Restore is part of this action.

The UI always warns that Project/Preset/saved-result refs may become missing.
The accepted index cannot enumerate every LoRA/VAE/TI or offline/unregistered
Project; no zero-reference or exhaustive usage count is claimed. Project files,
drafts, presets, accepted provenance and Default references are never rewritten.

## Exact identity and failures

Deleting registry UUIDs without a retained identity would make exact repaired
Compare permanently unavailable. This incompatibility was disclosed before the
minimal `model_reference_identity` adaptation. It contains only exact old local
UUID/source/kind/family/hash/size identity: no paths, weight bytes, default,
deleted state or restorable installation. Full registry/file rows are hard deleted.
Only a new verified publication with the complete same tuple can reclaim UUIDs.
Wrong SHA/provider/kind/family/size cannot relink an old reference. Existing live
identity remains authoritative: a different live source binding is not replaced
when an older exact tuple is reinstalled; that case cannot reclaim old UUIDs.
The ledger is not exposed as an installed model.

As in Invoke, filesystem removal precedes registry deletion. Ledger/registry
changes share a SQLite transaction. An unlink or post-unlink DB failure rolls
that transaction back; already removed bytes cannot be restored by rollback.
UI reports possible partial absence, publishes a real catalog invalidation and
requires a fresh review/retry (ENOENT permitted), or a new verified installation.
No success is reported before the operation finishes. Startup/repair keep their
existing owners; no unverified retained file can silently restore a model.

## Verification and lifecycle

Authored tests and actual execution are recorded separately. Planned critical
checks: migration/reopen; all queue operation/status guards; already-entered claim,
late admission, installer preparation/publication/reentrant races; target change;
shared file/companion; symlink/nonregular/escape; ENOENT/OS failure; post-unlink DB
failure and retry; exact verified reinstall and tuple negatives; unchanged refs.
High-risk semantic mutation requires an actual targeted RED, adjacent GREEN and
exact restoration. Setup errors/timeouts are not semantic RED.

Native uses tiny owned files and declared accepted portable fixture states,
actual built renderer/preload/Main/SQLite and normal physical app lifetimes.
No weight loading, inference, Add, Anima native, release or full MVP claim follows.
The existing approved Vue/Naive Models layout and confirmation surfaces are used.
Prototype mock Remove is still separate; no prototype mock qualification stands
in for production deletion.

Run: `~/.codex/artifacts/imagegen-studio/runs/model-removal/20261113`.
Fresh inventory: root29 GiB/shared17 GiB/runs12 GiB, free62 GiB;
GPU1,488 MiB used/14,532 free. No ML/runtime/SHARED copy or foreign process change.
Checks: 4 GiB/zero swap/600 seconds; native launcher and owned groups2 GiB,
480-second app deadlines. Retain source/bundles/attempts and own fixture bytes,
confirm restoration and physical exit, release independent readers, then remove
only exact own raw paths. The run's qualification summary, source/payload/bundle
manifests, independent retained-byte audit, lifecycle, release gates and post-push
commit proof form the final evidence index; removed raw paths must not be resumed.

## Executed results

ROOT ran 241 distinct lower-level cases: `unit-r1`61 and `unit-r2`180, zero
failures/skips, including 45 new authored cases. Final `unit-r3` repeats 65 affected
cases after formatting; it adds no distinct cases. Coverage includes all 15 queue
operations × pending/running, actual private claim/enqueue barriers, already-entered
claim, installer preparation/download/queue/claim, migration/reopen, unsafe paths,
shared files/Anima edges, ENOENT, preflight/OS/registry failures, retry and all exact
reinstall identity axes. Mock transports and inert dispatch/runtime collaborators
in lower tests are explicit; none establishes model loading or inference.

Isolated shared-path, SHA-identity and queue-idle mutations give 3 lower-level
semantic RED selections between 3 baseline GREEN and 3 exact-restored GREEN.
They reach repository/SQLite and callback/admission boundaries, not native mutated
inference. Production sources were never mutated. Initial wrong WorkingDirectory
ran unchanged production tests, isolated pnpm setup failed, and an ICC fixture was
absent; these setup failures are retained and do not count as semantic RED.

Final TS/Vue `typecheck-r3`, `build-r2`, scoped final source/harness lint and full
four-scope `lint-r2` PASS. Full lint uses the retained 3,072 MiB child heap adapter
inside 4 GiB and only `scripts/qualify-installed-regional-init.mts` parser exclusion;
its unchanged prior source SHA was rechecked after `lint-r1` reproduced the error.
Initial typing failures (preload predicate/new busy literals) were fixed before
qualification. Existing large-chunk build advisory remains. No prototype UI or
imported prototype consumer changed; the old mock matrix was not rerun.

Final `native-r6`: 10 checks PASS, two normally closed physical lifetimes, three
screenshots, all 24 source/five bundle hashes unchanged. Actual Main/file/SQLite
observations show Cancel unchanged, stale/invalid token refusal, whole-resource
registry deletion, unique unlink/shared survival, unchanged accepted/current refs,
fresh verified publication reclaiming UUIDs and restarted actual Compare Same.
ROOT opened all three final screenshots under `ui-audit`: confirmation at1440×900/
900×620 and missing Compare at900×620. No material local finding; bounded
self-review, not full accessibility qualification. No Anima native or inference.

Independent source review found P2 REMOVE-SOURCE-01: a held genuine Main review
allowed Import to open; late review opened an overlapping removal confirmation.
ROOT reproduced it with old-build `native-r5`, then guarded `openImport`, its header
button and the symmetric removal opener, and reset acknowledgement after an error.
Byte-identical harness gives actual old-build RED → final-build GREEN.
Earlier `native-r4` reproduced the defect but cleanup tried to close covered
Import before the topmost confirmation and failed. Its failed report stays intact.
ROOT separately canceled its topmost own confirmation, closed its Import/Models/
clean Project and requested normal window close through UI/CDP, then confirmed
physical exit and exact files/package/handlers plus immutable SQLite integrity.
This Root diagnostic Node recovery was outside a bounded qualification launcher;
no forced kill or original normal-qualified lifetime is claimed for it.

All six attempts remain indexed: r1/r2 selector failures before case2; r3 the
pre-guard 10-case PASS; r4/r5 actual regression RED; only r6 final qualification.
Seven harness-confirmed normal lifetimes and one separately recovered failed
lifetime are distinct. Root execution, source review and final independent byte
audit remain separate evidence. Resource-specific usage/affected-pending-only
cancellation and broader compatibility/recovery/release/MVP acceptance remain open.
