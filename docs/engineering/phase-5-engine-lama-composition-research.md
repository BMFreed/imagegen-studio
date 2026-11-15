# Reviewed engine installation with shared LaMa

Base: `f6196d54831d248eff20e22b6d1a5d5e0a0c11af` on `master`.
Risk: **High** — reviewed download volume, executable release identity,
shared-resource publication, current-runtime pointer ownership and recovery.
Supporting contracts: [runtime management](../specs/07-python-runtime-management.md),
[PP-001](../product-promises.md#pp-001-понятный-интерфейс-вместо-собираемого-workbench),
[existing LaMa delivery](./phase-2c-lama-install-research.md),
[offline installation](./phase-4-runtime-offline-install-research.md),
[trusted transport cache](./phase-5-runtime-transport-cache-research.md),
[research protocol](./research-protocol.md) and [review protocol](./review-protocol.md).

This note records fresh source research, the settled finite implementation
boundary and its acceptance plan. Authored code or checks do not establish
execution success. Actual source pins, test counts, installed/runtime results,
mutations, audits, cleanup and commit/push evidence belong to Root's completion
record. Public promise statuses remain unchanged.

## Expected result and current gap

The accepted product installs shared LaMa with the engine and reviews the full
download beforehand. LaMa belongs to app-managed inference resources, separately
from Python environments, checkpoints and Projects. Workers receive an already
verified local path and never download missing weights during generation.

Studio already has exact shared-resource download/publication, a pure engine
byte planner, signed runtime inventory/transport verification, bounded extraction
and reviewed new-slot runtime installation with qualification and rollback.
The last runtime review is deliberately scoped to `python-runtime-slot`.
Its `ensureAuxiliaryReady` collaborator verifies installed shared resources;
it cannot silently start an unreviewed download.

The next material consumer composes those existing owners through
`RuntimeManager`. It adds an internal engine review and explicitly installs the
reviewed LaMa before the existing Python-slot operation. It does not introduce
another queue, downloader, release verifier, worker, runtime assembler or
pointer/recovery controller.

This finite stage starts from **already available local inputs**: an expanded
payload accepted by the existing release verifier and the real signed cached
transport for the same exact inner envelope. Acquiring/extracting the runtime
is a prerequisite, not an implicit preview side effect. The previously completed
transport/cache/extraction consumers are reused rather than implemented again.

## Fresh Invoke implementation and actual callers

The local Invoke checkout was reread clean at
`4875d96531ca6712b288f6e660fcbb34143408c1` for this composition stage:

- `invokeai/app/invocations/infill.py:130–143` fixes the shared LaMa source and
  calls `context.models.load_remote_model` with `LaMA.load_jit_model`.
- `invokeai/app/services/shared/invocation_context.py:756,800–824` obtains a
  shared cached resource through the model installer, then loads the local
  model. This caller separates obtaining bytes from inference consumption.
- `invokeai/app/services/model_install/model_install_default.py:1549–1603`
  serializes downloads for the same shared source and checks cache again after
  locking. Its first-entry fast path does not hash the cached file and therefore
  cannot replace Studio's exact installed-resource verification.
- `model_install_default.py:2364` maps remote parts into the existing multifile
  downloader. `download_default.py:245–280` creates parts with their known source
  sizes. `_submit_next_mfd_part:290` submits them sequentially; callbacks
  at783–805 sum constituent bytes and progress.
- `download_default.py:821` finalizes multifile cancellation only after the
  active part stops touching disk. Reusing a completed constituent resource is
  distinct from declaring an entire installation complete.
- `download_default.py:564–570` checks free space for the remaining source
  download bytes. It does not calculate a combined peak for compressed source,
  expanded payload, environment assembly, auxiliary publisher copies, backups
  and previous runtime slots.
- `invokeai/app/services/model_install/install_staging_ledger.py:189` writes
  durable markers; `HeldClaim:321` and `create_staging:611` supply active claims
  and source/revision-bound staging ownership. Their installation callers are
  in `model_install_default.py`. Studio already adapts these mechanisms in its
  auxiliary and runtime owners; composition must not add a parallel ledger.
- `invokeai/frontend/webv2/src/features/models/ui/add-models/starterModelInstallSources.ts:36–72`
  composes dependencies and main resources, deduplicates sources and omits
  installed dependencies. Actual callers are `AddModelsView.tsx:249` and
  `ModelsNotice.tsx:374`, through `useInstallActions.ts:74`'s sequential
  `installMany`. That helper queues independent constituents; it is not an
  atomic signed engine installation or sufficient disk preview.

The inspected Invoke owners obtain LaMa lazily during infill. They do not supply
a combined signed managed-Python runtime plus eager LaMa transaction, aggregate
review token, shipping release selection/keyring or sufficient engine disk-peak
calculation. This missing upstream mechanism must be disclosed before the
Studio-specific composition is introduced. The adaptation takes constituent
composition, exact-source download ownership, serialization and cancellation
from Invoke, then joins the existing Studio contracts and consumers.

The optional launcher reference was also checked clean at
`c267bdb439519216b277a7a8c6ad408b9d79efce`:
`src/main/install-manager.ts:298` sequences managed Python, venv and dependency
installation with status/cancellation callbacks. Its actual Main IPC caller is
`createInstallManager:1034–1077`; renderer entry is
`src/renderer/features/InstallFlow/state.ts:184`.
`InstallFlowStepReview.tsx:40–112` reviews selected version/GPU/repair choices,
not total download or peak disk bytes. Repair deletes the existing `.venv`
at598–605 and bootstrap sync uses `--inexact` around750–766. Those behaviors
conflict with Studio's exact new-slot/rollback contract and are not copied.

## Existing owners and finite composition

`src/main/runtime/index.ts` owns runtime review tokens, generation/preparation
admission, host preflight, cancellation and physical worker qualification.
`runtime-installation.ts` owns pointer compare-and-swap, durable new-slot state,
activation and rollback/recovery. `offline-runtime-assembly.ts` owns exact
offline environment construction. Their responsibilities remain intact.

`inference-auxiliary-installer.ts` owns a bounded expiring preview and one-use
plan ID, actual installed-byte checks, private staging and verified publication.
It rechecks under its operation lock. If preview said that LaMa was already
installed but it has become invalid, installation refuses rather than increasing
the reviewed download. A newly valid exact shared artifact may instead reduce
the transfer to zero. Existing cancellation/publication cleanup remains with
that owner.

`runtime-release-transport.ts` owns both signatures, exact inner binding, real
ZIP hash/size and complete transport snapshots. `runtime-release.ts` owns the
expanded inventory and complete payload snapshots. Composition must verify the
selected expanded envelope's exact hash against the transport binding; matching
release labels or valid signatures alone do not establish that relationship.

The internal `RuntimeInstallationBackend` may optionally provide
`engine: { transportDirectory, auxiliaryInstaller }`. Those are trusted Main
collaborators, never renderer paths or manifests. Without that optional engine
collaborator, the existing `python-runtime-slot` review and verification-only
auxiliary prerequisite keep their previous behavior.

The auxiliary class also supports regional-reference artifacts. Therefore an
engine composition must check its preview's **filename, role, SHA-256 and exact
size against the pinned LaMa identity** before presenting the standard engine
plan. The pure planner's unconditional pinned LaMa row cannot authorize an
arbitrary auxiliary installer merely because its class/type matches.

No default release provider, public IPC/UI setup switch, downloaded keyring,
production endpoint or new trust identity is introduced by this optional Main
collaborator.

## Source cache and installed reuse are different facts

The existing engine planner is extended to represent verified cached source
separately from verified installed reuse. `sourceCached` records source bytes
that are already available and need no transfer. `reused` continues to mean an
already installed exact artifact can be kept as installed.

The concrete review has one complete signed runtime ZIP plus shared pinned LaMa.
The runtime's real ZIP is present and verified, so its source is cached. This
does not mean the reviewed Python environment is installed or can be skipped:
Install and Repair still construct a fresh runtime slot. An existing active
runtime likewise does not turn the new runtime row into installed reuse.

LaMa is marked installed/reused only after the existing auxiliary preview checks
its exact installed bytes. A cache receipt, same-sized file or previous success
cannot supply either verification. Source-cache metadata does not authorize
assembling from drifted bytes.

The planner preserves these distinctions:

| Fact | Transfer effect | Installation/footprint effect |
| --- | --- | --- |
| Verified cached runtime ZIP | zero runtime archive download | fresh slot still required; runtime installed footprint remains unknown |
| Verified installed LaMa | zero LaMa download | existing shared file reused |
| Missing/invalid LaMa at preview | exact pinned LaMa size is reviewed | existing auxiliary installer may publish the shared resource |
| Previously installed LaMa becomes invalid | no unreviewed increased download | refuse and require a fresh review |
| Expanded signed payload exists | no implicit new acquisition | not a final environment footprint or readiness proof |

The transport's `expandedRegularBytes` measures its expanded source inventory,
including wheel files. It is not the final Python environment footprint.
`installedBytes` and additional installed size therefore remain unknown where
the runtime footprint is unknown; caching must not turn those unknowns into zero.

## Review token and actual operation

The engine review uses the existing current runtime review/token owner. Its
returned DTO is path-free and distinguishes its engine scope from the older
slot-only scope. Private captured state contains the selected release/payload
snapshot, transport snapshot, auxiliary owner and exact auxiliary plan ID.
A later preview replaces the current review; mode mismatch, stale/consumed token
or invalid auxiliary plan refuses. There is no second independent token registry.

The expected material path is:

```text
explicit trusted Main release + optional engine collaborators
→ existing exact expanded-release verification
→ actual signed cached transport verification and exact inner-envelope binding
→ actual auxiliary preview, checked against pinned LaMa
→ existing engine planner with source-cache/installed-reuse distinction
→ one current path-free engine review/token
→ explicit Install/Repair consumes that review
→ existing runtime/generation/worker admission and captured-source revalidation
→ strict host preflight, then current-pointer CAS before auxiliary mutation
→ existing auxiliary install with the captured one-use plan and cancellation
→ verification-only ensureAuxiliaryReady
→ existing fresh-slot assembly, qualification, activation and rollback/recovery
```

The early pointer comparison prevents an operation reviewed against A from
downloading/installing LaMa after host inspection has already observed an
unrelated runtime pointer publication B. The existing installation controller
still performs its later pointer checks around assembly/activation; the early
check does not replace those fences or promise a global lock against all
external writers.

Preview/status/capability inspection must not initiate auxiliary downloads.
Host refusal, invalid source/binding or failed pointer comparison must occur
before the auxiliary consumer. Cancellation reaches the existing auxiliary
downloader/publication owner, and completion is reported only after owned
readers/processes settle. Worker inference never becomes a resource installer.

## Disk and transfer accounting

The engine review reports `requiredFreeBytes: null` for the aggregate installation
peak. `runtimeRequiredFreeBytes` preserves the signed runtime-slot floor. This
keeps the known slot requirement available without mislabeling it as enough
space for the whole engine operation.

Download totals use verified source/installed reuse. The local verified runtime
transport contributes zero network bytes in this finite stage; missing LaMa
contributes its pinned exact size. The existing planner's `stagingBytes` remains
download-source bytes only, not extraction, publisher copies, backups or retained
slots. A known transfer total cannot promote an unknown installed footprint or
unknown aggregate peak into a sufficient free-space claim.

| Parameter / owner | Source and finite meaning |
| --- | --- |
| Runtime source size/hash | actual signed transport descriptor and full ZIP verification |
| Runtime source inventory | existing exact signed release verifier and transport binding |
| LaMa source size/hash | existing pinned descriptor plus actual auxiliary preview/install |
| Runtime slot free-space floor | signed inner manifest, reported separately |
| Aggregate engine free-space peak | unknown/null; no guessed formula or readiness claim |
| Review ownership | one current RuntimeManager token and captured mode/source/auxiliary plan |
| Auxiliary plan expiry/concurrency | inherited installer bounds and lock; no replacement policy |
| Execution and recovery | existing runtime controller/worker physical-exit and rollback rules |

This change does not alter inherited envelope, ZIP, download, process, family or
generation limits. It does not qualify maximum release capacity or supported
hardware by adding known metadata numbers.

## Failure and recovery boundaries

Shared LaMa and runtime slots have separate lifecycles. After a successful exact
LaMa publication, a later runtime preparation/qualification/activation failure
may leave that valid shared resource installed. The runtime operation must not
delete it to imitate a transaction spanning unrelated owners. A subsequent
fresh review can verify and reuse those bytes.

The existing runtime controller preserves or rolls back the previous pointer
according to the observed phase. Unconfirmed worker exit retains the existing
recovery-required claim/state; it must not be reported as a clean rollback.
Auxiliary publication failures keep the existing installer cleanup/restore
semantics. No new slot collector, shared-resource rollback, cache eviction,
partial resume or automatic retry is added by composition.

Failure consumes the current review. A changed installed state or larger
required transfer needs a fresh explicit review rather than an implicit download
or token reuse. Models, Projects and their provenance remain outside this change.

## Finite acceptance and sensitivity plan

1. Existing backend without engine collaborators retains slot-only scope,
   verification-only auxiliary readiness and previous refusal behavior.
2. A valid engine preview reaches real payload/transport verification and the
   real pinned auxiliary preview; no downloader, assembler or worker starts.
   The DTO distinguishes cached source from installed reuse and reports unknown
   runtime footprint/engine peak truthfully.
3. Missing/corrupt transport, invalid signatures, other valid inner envelope,
   same-size ZIP drift or later snapshot substitution refuses before auxiliary
   mutation or runtime assembly. Exact original source is the adjacent control.
4. A different valid auxiliary manifest cannot impersonate pinned LaMa. Reject
   mismatched filename, role, size or SHA before issuing a usable engine review.
5. Missing LaMa contributes exact reviewed bytes; installed LaMa contributes zero.
   Installed-to-invalid drift refuses an increased transfer, while newly valid
   bytes may reduce it. Source-cached runtime still requires a fresh slot and
   preserves unknown installed-size totals.
6. Explicit Install and Repair use the same captured one-use owner. Host failure
   and a pointer change observed after host preflight invoke neither the
   auxiliary downloader nor assembler; existing busy/worker fences remain.
7. Normal success orders auxiliary installation, verification-only readiness and
   existing runtime preparation/qualification/activation. A runtime failure after
   successful LaMa publication preserves that exact shared file and the expected
   old/restored pointer. No hidden deletion or readiness promotion occurs.
8. Cancellation settles the actual auxiliary/worker owner; canceled/failed tokens
   cannot replay. Shared-resource and runtime recovery remain separate observed
   outcomes, including unconfirmed-exit refusal.
9. Semantic mutations must reach the actual consumer: treating cached source as
   installed reuse, dropping exact transport binding, accepting the wrong
   auxiliary or moving pointer comparison after auxiliary work must produce the
   intended assertion RED with a neighboring GREEN and exact restoration.
   Setup errors, timeout and OOM are not substitutes.
10. Run focused planner/auxiliary/runtime neighbors, required TypeScript checks,
    relevant lint/build and high-risk source/evidence review. Distinguish real
    filesystem/installer execution from injected network/worker/assembly seams.
    An authored test or CPU fixture does not establish installed native or public
    Setup/release readiness.

## Evidence and completion boundary

Source research and the acceptance design above are recorded before implementation
qualification. Actual execution counts, source pins, installed results, semantic
sensitivity/restoration, independent byte/retention audits and physical-exit
proof are recorded separately below by Root. Artifact work must follow the
existing lifecycle/dependency protocol and retain one compatible reusable set;
this document does not authorize new runtime/weight copies or deletion.

Public default backend/IPC/UI, trusted release/key distribution, production
endpoints, total peak-space qualification, distributable install/upgrade/rollback,
manual Electron updates and final MVP acceptance remain separate gates.
PP-001/005/007/008 remain **«Пока не обещать»**.

## Root execution and source-bound evidence

RUN: `~/.codex/artifacts/imagegen-studio/runs/engine-lama-composition/20261115`.
The initial checkout was clean at the stated base; all implementation/test/docs
changes belong to this stage. Both Invoke and launcher references were checked
clean at their recorded revisions before non-UI edits. The original Shared
runtime/LaMa and signed transport remain reciprocal lifecycle dependencies;
no active installed environment, managed Project or model set was changed.

Final focused execution passed **480 TAP tests, zero failures/skips** across
nine existing runtime/planner/auxiliary files in 11.777s. This includes the new
aggregate review, exact pinned preview refusals, transport binding/drift,
one-use/mode/pointer guards, cancellation awaiting auxiliary closure, both late
auxiliary-health phases and the existing runtime lease/activation/rollback and
neighbor controls. The actual Main host-metadata opt-in also passed; this is
host preflight, not a CUDA/inference run.

`pnpm run typecheck` passed in 26.817s. Scoped ESLint on all five changed TS/MJS
files and `pnpm run app:build` passed. The existing large-chunk build advisory
remains. UI and Python sources did not change; no prototype, Python typing or
native inference results are claimed. The initial synthetic manager/planner
selection passed 62 cases with two opt-ins skipped before the final execution;
those skips do not describe the final 480-case selection.

Three semantic mutants reached the real consumers: falsely marking cached
runtime as installed removes unknown additional footprint, dropping exact
transport-envelope binding accepts a different selection, and skipping
post-qualification auxiliary verification lets a lost resource reach Ready.
All three produced the intended assertion RED with adjacent GREEN and exact
source restoration. `mutations.json` retains nine bounded executions and their
specific diagnostics; grouped TAP parent counts are not additional defects.
No timeout, OOM, import/setup error substitutes for semantic RED.

### Actual pinned LaMa, controlled runtime ports

The opt-in manager scenario used the unchanged production pinned LaMa factory,
private auxiliary publication, exact resource verifier, RuntimeManager review
and real pointer/journal controller. Only its download transport was replaced
by a copy port reading the already retained original file. Assembly and CPU/GPU
worker qualification ports were explicitly controlled; no Python environment
was assembled, no weights were executed and no GPU/native67-package readiness
was established in this stage.

The actual source and published file each contain **205,669,692 bytes**, SHA-256
`344c77bbcb158f17dd143070d1e789f38a66c04202311ae3a258ef66667a9ea9`.
They have distinct material inodes. Preview made no copy request; Install used
one copy/publication; successful Repair reused the verified resource with zero
new transfer. A later failed post-activation Repair returned the exact previous
pointer and retained valid LaMa. The final retained receipt records one copy-port
call across those three operations, 56 ordered events, closed readers, public
qualification keys and explicit native/package/public-endpoint false flags.
No private key was serialized.

The complete final Main run stayed within 4 GiB/zero swap/600s, with peak
1,062,662,144 B. All observed cgroups were physically empty on completion.
`actual-source.json/tar.gz` freezes 15 relevant owner/test files before execution;
these source bytes, actual filesystem output and completion receipts are
separate evidence. Earlier full offline 67-package native results remain
historical checkpoints, not an independent rerun of this aggregate consumer.

### Readiness and next material qualification

Source review was CLEAN for coherent source capture, exact transport/LaMa
identity, separate cache/install accounting and existing rollback/cancel fences.
Source review is not execution or a retained-byte audit. The optional backend
remains an internal Main integration; default public Main still has no shipped
provider/review IPC/UI, and advisory getStatus retains its prior Python-runtime
scope rather than proving reopened aggregate LaMa health.

The next native full-engine qualification must adopt the exact existing signed
transport through `extractRuntimeTransport`. The current offline qualification
harness generates a new release ID/envelope; merely attaching the retained ZIP
to that newly signed selection would violate the tested exact binding. Reuse its
67-package/host/pre-post/reopen/CUDA/refusal controls with the adopted selection,
not a newly generated duplicate ZIP. Shipping metadata/keys/endpoints and public
Setup still require their own acceptance. No public promise status is promoted.

### Retention and cleanup

Independent output/retention audit and exact own raw disposal are recorded in
this RUN's companions and completion addendum below. Keep compact receipt,
source pins, controlled-port limits, semantic RED/GREEN/restoration and both
Shared dependencies. The published weight copy is reconstructable only from
its explicitly pinned original Shared source. Disposed test roots must never
be passed to an old resume command. This archive is byte evidence, not a
runnable installed environment.

The independent output audit passed **20 checks**: full original/publication
weight streams, distinct inodes/modes, both canonical Ed25519 envelopes,
21 signed ZIP members/exact expanded fixture, raw rollback pointer bytes,
three controlled slots and their event trace, 15 source pins and exact mutation
restoration. Its 0.524s bounded process was physically closed. This verifies
retained bytes and observed trace consistency, not an independent rerun of
installation, native workers or HTTP delivery.

Independent retention then passed **18 checks**. The compact support archive
has 313 entries (220 files, 90 directories,three symlinks); the complete live
inventory had 314 entries. Absolute controlled Python link targets were compared
as text without following or extracting them. Only the 205,669,692 B published
LaMa copy is omitted, pinned to the protected original for reconstruction.
Support archive: 7,552,698 B, SHA-256
`b1e1a223b021d1bba8e081eaae17e4ed7e19c2357aa339b3155e3f256468c481`.
The audit also confirmed both reciprocal Shared dependencies, 15 retained/current
source pins, three restored mutants and physical exit of the assigned units.

Root then removed exactly `RUN/payloads` and artifact-root `t-elc-1115` using the
existing descriptor-based, no-symlink cleanup pattern, after all readers closed.
**228,425,728 allocated bytes** were reclaimed. Root allocation fell from
38,539,386,880 to 38,310,961,152 bytes, matching that exact delta. Original Shared
LaMa was rehashed unchanged; signed transport, runtime/models, wheelhouse and
all dependent reports remain protected. Lifecycle is `retained`, `payloads: []`.
The compact reconstruction/source/control set remains; raw disposed paths are
historical. Final delivery is bound by `commit-proof.json` and
`release-result.json`, with remote head and all 11 exact committed files checked
against staged/retained source and the 15 actual execution pins.
