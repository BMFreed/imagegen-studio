# Resource-specific hard Remove and confirmed pending cancellation

Base: clean master `a1bf0fcdd52fe6117434450b62cde145403500c1`.
High risk: destructive resource lifecycle, durable queue transitions and IPC.
The [Remove contract](../features/model-manager.md#remove-local-resource) blocks
running use and requires confirmation before canceling affected pending work.
The [idle checkpoint](./phase-4-model-removal-research.md) already owns actual
managed-file/registry removal, exact identity retention/reinstall and failure
semantics. Reuse those owners; no new queue, scheduler or acceptance wrapper.

## Fresh Invoke basis and disclosed limits

Current clean Invoke `4875d96531ca6712b288f6e660fcbb34143408c1` was reread:
`invokeai/app/services/shared/database/queries/session_queue.py` dequeue CAS,
`cancel_waiting_work`, `_locked_scope`, `_cancel`; callers in
`services/session_queue/session_queue_default.py` and
`app/api/routers/session_queue.py` `cancel_all_except_current`. Frontend callers:
`features/queue/ui/queueMenuActions.tsx` and `features/queue/data/serverApi.ts`.
Deletion claim/callers were reread in `app/api/routers/model_manager.py`, installer
`services/model_install/model_install_default.py` and SQL records owner.

Pending-only transaction, sequence CAS and notification after actual transition
are adapted. Batch/destination cancellation also stops current work and cannot
serve this consumer. The user was told before implementation: Invoke's queue
affinity UUID substring heuristic is not destructive usage authority; no combined
typed resource-use/delete/confirmed-pending path was found. Studio's existing
strict frozen parsers and concrete worker-resource projection owners supply the
required adaptation. No substring/name/global-SHA inference is introduced.

## Finite data and operation path

All 15 durable operation discriminants come from current queue schema: six
ordinary Illustrious/Anima TXT/IMG/OUT, two Smart, one private regional and six
public regional. Unknown/corrupt unfinished input fails closed. Public manager
details exclude private work and can turn malformed input into null, so they are
not used as authority. No production upscale queue exists; it is not qualified.

Normal contexts use existing exact references and validated worker path/SHA
agreement. Smart pairs concrete inference with its frozen selected draft using
existing validation; disabled/dormant settings are not consumed resources. Regional
TI additionally comes from owned, bounded, hash-verified regional sidecars through
the existing queued-regional owner. That metadata path does not hash/load ML
weights or introduce another readiness resolver. Regional reference/LaMa auxiliary
files belong to inference-resources, not the ModelRepository catalog.

Usage matches either retired exact local model/version IDs, or concrete paths in
the actual unshared unlink footprint. Another registry owner of retained shared
bytes stays unrelated. Primary/LoRA/VAE/positive-negative TI and Anima bundle
components keep their current semantics. Sidecar and parser failure never means
unused. Names and globally equal bytes do not establish a reference.

Main captures full resource snapshot, exact unlink footprint and affected pending
ID/sequence/payload-SHA behind one opaque review token. UI receives counts, not
paths or payloads. Running affected work disables Remove. Pending work requires a
separate explicit cancellation acknowledgement, alongside the reference warning.

Execution shares existing generation admission and installer claim. Before queue
mutation it rechecks the existing repository preflight and footprint. The queue
serializer then rescans usage: affected running refuses; changed affected pending
set/sequence/payload refuses without silently extending consent. Unrelated rows
remain untouched. One pending-only CAS transaction cancels exactly the reviewed
set, retaining frozen inputs and normal canceled/Retry meanings, before the
existing filesystem/registry callback. Claims/enqueues cannot cross this boundary.

Cancellation and removal are explicitly separate durable steps. A later filesystem
or registry failure may leave the consented jobs canceled and some files absent;
neither SQLite rollback nor UI retry fabricates restoration. Fresh review is
required after failure. No running job cancellation is routed through Remove.
The existing value-CAS and identity ledger semantics remain; no provenance rewrite.

## Checks and lifecycle

Planned executable boundaries: all operation/resource projections and sidecars;
disabled/dormant and shared aliases; corrupt inputs; affected/unrelated pending/
running; claim/admission races, sequence/payload/set drift; atomic pending sweep;
filesystem failure after approved cancel, retained Retry and unchanged unrelated
rows; actual Main/UI two acknowledgements and catalog/result continuity. Critical
mutations need semantic RED, adjacent GREEN and exact restoration. Authored tests,
Root execution and independent reviews/audits remain separate evidence.

Run: `~/.codex/artifacts/imagegen-studio/runs/model-removal-usage/20261113`.
Fresh root29 GiB/shared17 GiB/runs13 GiB, disk62 GiB free; GPU9,239 MiB used/
6,780 MiB free. No GPU work, model/runtime copies, SHARED access or foreign process
changes are needed. Checks use4 GiB/zero swap/600s, owned native groups/launcher2 GiB
and480s app deadline. Retain exact source/bundles/raw attempts before audit/physical
exit/dependency closure and exact own cleanup. Previous raw paths were removed
after retention and must not be resumed. Actual results follow implementation.


## Executed qualification and limits

ROOT final `unit-r4`:120 Node PASS across9 files; `neighbors-r1`:196 PASS across9
other files,316 distinct checks total (nested TAP tests counted, no duplicate files).
These cover all15 operation discriminants, exact resource roles, owned regional
sidecars, sharing, corruption, claim/admission/consent drift, transaction rollback,
retained Retry input and actual unlink followed by registry failure. The focused
sidecar-only TI test reaches real service removal before asserting no consent.
Final `typecheck-r3`, `build-r1` and full4-part `lint-full-r1` pass. The only explicit
lint parser exclusion is unchanged `scripts/qualify-installed-regional-init.mts`;
its bytes match the previous retained source archive. No prototype consumer/UI
changed; an old prototype matrix is not new production evidence. Python/inference
owners did not change and were not rerun.

Earlier `unit-r1` omitted new DTO counts in an expectation; r2 had two invalid
fixtures and overlapped formatting, so it is not final coherent qualification;
r3 retained one invalid external-VAE fixture. `typecheck-r2` caught two fixture
shape/type errors. The final fixtures satisfy the existing strict parsers without
relaxation. A genuine new OUT inspection bug was separately reproduced with a
corrected fixture: its synthetic request used a nonstandard output name. The
existing outpaint consumer rejected it; restoring required `result.png` gave a
neighbor GREEN. Inspection never writes that output. Both source/test snapshots
and before/after raw reports remain retained in `outpaint-regression.json`.

The mutation executor subagent ran three isolated source mutations; ROOT reviewed
the raw results. Each reached actual `ModelRemovalService.removeLocalResource`
and failed the expected rejection after the forbidden effect: removing the
running guard, bypassing pending consent, or omitting region-local TI sidecar use.
All three adjacent controls and all three restored controls pass; source is
exactly restored. Setup errors, OOM and timeout are not semantic RED. This is
subagent-executed mutation evidence, separate from ROOT's runtime qualification
and independent source review.

ROOT built Electron `native-r2`:14 checks, two normal physical application
lifetimes, three screenshots,30 source hashes and five actual bundle hashes.
Actual Main/UI refuses a pending→running race and missing cancellation consent;
a new affected pending job invalidates the whole reviewed set. Both separate
acknowledgements cancel exactly three reviewed pending jobs before real managed
unlink/hard registry delete, preserving unrelated running/pending, shared bytes,
all frozen inputs and copied Project/result bytes. Actual Compare diagnoses the
missing exact version, then sees its exact UUID after fresh verified publication
and restart. All original IPC handlers are restored with zero in-flight calls.
ROOT opened the running-block1440×900, pending-consent900×620 and missing-reference
900×620 screenshots under `ui-audit`: no material local layout/action finding;
minor singular-count copy grammar is not an acceptance claim. This is bounded
self-review, not full accessibility or visual-quality acceptance.

Native rows were prepared after Main startup using existing queue admission and
claim owners on tiny catalog-only metadata. Running controls never started a
worker; only their explicit own fixture restoration terminalizes them before
normal Project close. Exact preservation is checked at the real Remove consumer
before this cleanup. That fixture cleanup does not qualify product running-job
cancellation, public Generate or inference. Earlier `native-r1` failed during
fixture admission because its output filename violated the existing strict
contract; one-line harness correction produced r2. r1 has one check and one
normal physical close, remains excluded/raw-retained, and is not semantic RED.

Production source review is CLEAN source-only with final OUT fix reviewed;
ROOT execution and final independent source/document/archive/live-byte audit
remain separate. No GPU, runtime/model copy, SHARED or foreign-process change,
network download, Anima native matrix, full library lifecycle, release or joint
MVP acceptance is claimed. All promise statuses remain **«Пока не обещать»**.

## Retention and delivery

Selected final cohorts, raw failures, mutation diffs/restoration, source, actual
bundles, native SQLite companions and all owned payload entries are retained by
manifest before independent audit. Cleanup requires READ_FINISHED/readersClosed,
fresh exact PID/start/cgroup physical-exit proof, byte continuity and no external
dependencies; only the exact owned RUN payloads/native roots and `t-rmu-1113` may
be removed, without following symlinks. `node_modules` in the mutation copy is a
retained symlink entry, never archived/deleted by traversing the dependency tree.
Final counts, actual reclaimed bytes, staged-tree/commit/remote continuity and
lifecycle state are recorded in RUN `qualification-summary.json`,
`final-retained-audit.json`, `release-gates.json`, `commit-proof.json` and
`artifact-lifecycle.json`. Raw paths must not be resumed after retained cleanup.
