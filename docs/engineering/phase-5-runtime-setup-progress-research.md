# Runtime setup progress and operation cancellation

Base: `d9735ad5bac03f54fb1c7a190588bad366cfc4d2`, `master`.
Risk: **High** — public cancellation reaches an accepted installation, process
exit, pointer activation/rollback and recovery. Contracts:
[PP-001](../product-promises.md#pp-001-понятный-интерфейс-вместо-собираемого-workbench),
[runtime management](../specs/07-python-runtime-management.md),
[metadata review](./phase-5-runtime-metadata-provider-research.md),
[research](./research-protocol.md), [review](./review-protocol.md) and
[artifact lifecycle](./artifact-lifecycle.md).

## Expected behavior and existing owners

Setup/Repair shows actual stages and the active constituent's download bytes.
RuntimeManager remains the only operation/token/admission owner. Its consumed
review token also identifies that operation; no second token, queue, installer
or acceptance wrapper is introduced. Getter/subscription snapshots are transient
Main telemetry with a monotonic revision, not durable receipts or readiness.

Actual callbacks come from the existing runtime cache downloader, exact LaMa
installer, offline assembler's copying/assembling/verifying stages and the
controller's before-/after-activation qualification callbacks. Extraction has a
stage boundary but no measured percentage. Unknown work uses stage text/spinner;
only the current download constituent has byte progress. Download completion
does not mean the runtime installed or passed qualification.

Observers are isolated, receive copied snapshots and cannot change installation
outcome. Invalid, duplicate, backward or obsolete transfer data is ignored. The
existing Invoke 1% byte-delta rule bounds transfer event volume; signed artifact
sizes supply totals. Owner-local callback lifetimes prevent a completed transfer
or assembler from publishing into later phases or another operation.

Public Cancel validates the current main frame/document and the target ID;
RuntimeManager checks the target again immediately before abort. The existing
cancel/stream/process/controller owners perform the actual work. `Cancelling…`
persists until the fully settled operation releases its fences. Stale IDs cannot
abort the next operation. Review dismissal remains a separate action.

Accepted operations survive renderer reload. A new trusted document subscribes
then reads the current snapshot, restores active UI/control and rejects stale
getter replies/events by revision and operation identity. Old invoke/cancel
responses cannot close a newer operation. No transient snapshot persists across
Main restart; the existing installation journal/status recovery remains owner.

## Cancel, completion and recovery

The controller already supports cancellation after activation followed by
rollback. No guessed cutoff is added. It also has a final commit window after
its last abort check: a late Cancel can lose to actual success. The operation's
actual terminal result wins, rather than the request or abort acknowledgement.

Source research found an existing metadata catch that normalized every aborted
error to ordinary cancellation. It could hide unconfirmed worker exit or failed
rollback. The catch now preserves the existing `RuntimeInstallationError`
recovery/exit flags; recovery-required is a distinct terminal state, with the
original claim/journal and admission barriers retained.

Source review also found that the controller converted confirmed local-cache
assembly cancellation into generic installation failure. A regression reproduced
that error. The narrow mapping now preserves `RUNTIME_ASSEMBLY_CANCELED` as
`RUNTIME_INSTALL_CANCELED` after the controller's existing unknown-exit and
rollback recovery gates. No activation, journal or recovery policy changes.

The settled promise is stored before notifying synchronous listeners, and
terminal publication follows fence cleanup. Even a listener requesting Cancel
on the first progress update waits for the whole operation. A failed observer
or IPC event send never rolls back a successful installation.

## Fresh Invoke implementation and actual callers

Read clean local revision `4875d96531ca6712b288f6e660fcbb34143408c1`:

- `invokeai/app/services/download/download_default.py:598–619` reports byte
  changes every 1% and the final count. `783–856` keeps progress, download
  completion and cancellation settlement separate; the active part stops
  touching disk before multifile cancellation finalizes.
- `invokeai/app/services/model_install/model_install_default.py:2468–2504,2630–2690`
  separates download progress/`DOWNLOADS_DONE` from actual installation/completion.
  `1267–1295,1772–1787` marks active cancellation requests and refuses protected
  transfer or recovery-required work.
- Actual cancel caller:
  `frontend/webv2/src/features/models/ui/install-queue/useInstallJobActions.ts:81`
  → `features/models/data/api.ts:146` → `app/api/routers/model_manager.py:1205`
  → installer `cancel_job:1267`.
- UI callers `InstallJobRow.tsx` / `InstallQueueBar.tsx` use
  `useConfirmedInstallCancel.tsx`. Its warning that partial bytes are lost does
  not match Studio's retained verified cache/incomplete output contract and is
  not copied.

Invoke has no compatible signed-runtime Electron DTO. That absence was reported
before the adaptation. This change maps its job/byte/cancel semantics onto
Studio's existing trusted IPC, RuntimeManager and transient progress patterns;
it does not replace its installer, physical-close or recovery mechanisms.

## Finite parameters and verification plan

The shared DTO defines the exact stage/state domains and field allowlists.
Bytes are null outside the two transfer stages and in terminal states. Safe
integer bounds and known signed totals remain exact. No overall progress
estimate, new network/worker timeout, cache eviction, resource default or retry
policy is added. One active installation remains app-owned; failure still needs
a fresh reviewed action and valid selected staging/cache state.

Checks cover source attribution and observer isolation; actual phase/byte data;
100% download without readiness; synchronous/duplicate/late Cancel; target and
document/reload guards; physical child exit; post-activation rollback; recovery
claim preservation; late success; safe public DTO/error projection; actual App
interaction and native renderer/preload/IPC. Controlled ports, a real bounded
protocol child and native ML qualification are separate evidence levels.
Meaningful semantic REDs require neighboring GREEN and exact restoration.

Publisher metadata/artifact URLs and trusted shipping identity remain absent,
as already confirmed by the user. Default Setup stays unavailable. This stage
does not qualify publisher delivery, clean distribution/upgrade/update, native
capacity, model quality or full MVP acceptance. PP-001/005/007/008 stay
**«Пока не обещать»**.

## Execution and delivery

Root executed these checks on the dirty delivery tree over the base above:

- Focused Main/shared/IPC/cache/installation suite: **203 PASS, 0 FAIL, 2 SKIP**
  (205 TAP tests). The two existing opt-in actual pinned LaMa publication and
  host-preflight cases were not enabled. New cases cover phase/byte attribution,
  observer isolation, invalid telemetry, synchronous/stale/late Cancel,
  post-activation rollback, unconfirmed exit and a competing pointer that retains
  the recovery claim/journal and foreign bytes. A real bounded Node protocol
  child uses the actual `GenerationWorkerClient`: it is alive at the independent
  close fence and physically exited before canceled terminal publication. This
  is process/protocol evidence, not Python, CUDA or ML qualification.
- `pnpm run typecheck`: **PASS**. Scoped ESLint covers all 16 changed code/test
  files; no whole-tree lint claim. `pnpm run app:build`: **PASS** with the existing
  bundle-size advisory. The final Main suite includes the explicit recovery-code
  preservation guard.
- Focused browser setup/health checks: **19 PASS**. Required full
  `pnpm run prototype:test --workers=2`: **299 PASS**. Prototype service ports are
  controlled. Checks include constituent completion without Installed, target
  identity, stale getter/event/result rejection, reload restoration, cancellation
  refusal/retry, actual canceled/recovery/success terminal behavior and minimum
  window geometry.
- Built Electron renderer, sandboxed preload and real setup IPC owner: **20
  recorded checks, 5 authorized controlled-service attempts, 4 controlled
  mutations, 2 Cancel requests**. A real document reload restores the cancelling
  operation. Canceled work settles without a mutation; controlled final success
  wins the late Cancel. No page errors. Normal close, owner disposal and physical
  exit of the observed processes/scopes are confirmed. The service behind IPC
  remains controlled: this does not install a real runtime or qualify shipping
  trust/payloads. A separate built **default production Main** run with empty
  isolated app data confirms unavailable Setup, no review/install and normal
  physical exit while publisher configuration is absent.
- Four isolated semantic mutations: **12 selections = 8 GREEN + 4 intended
  semantic RED**, each with neighboring GREEN and restoration. They expose
  recovery masking, abort-before-target-validation, premature terminal while the
  real protocol child is live, and stale getter overwriting visible UI. The
  first three use a restored source copy; UI mutation changes only the served
  response. Setup errors, OOM and global deadlines are not counted as RED.
- Root viewed browser progress/`Cancelling…` screenshots at 900×620 and the built
  Electron equivalents at 1280×800. Stage, bytes and actions remain accessible.

The bounded source-only delegate review found the local assembly cancellation
issue above; Root reproduced and fixed it. It is not an independent whole-tree
runtime acceptance. Early diagnostic failures are retained separately: two
authored IPC stub typing errors, a test's incorrect pre-activation journal-phase
expectation, and acceptance of a callback's mismatched total. The first two were
fixture corrections; the latter now refuses inconsistent telemetry. Final
checks pass without weakening recovery or physical-exit assertions.
A separate read-only delivery check found no contradiction between the six
changed documents, exact result receipts and unchanged promise statuses. It did
not run tests or review the full implementation, retention or Git publication.

Evidence is under
`~/.codex/artifacts/imagegen-studio/runs/runtime-setup-progress/20261115`:
bounded commands/logs and `check-*.json`, semantic mutation results, native and
default-Main reports/physical-exit receipts, screenshots, frozen delivery sources
and retained payload inventory/archive. Only 17 pinned configs were reconstructed
from protected `shared/runtime-transport-fa8b9272-r1`; no interpreter, wheelhouse,
environment or weights were copied. Lifecycle/retention receipts record exact
disposal after process exit/restoration and archive/live byte verification.
Raw payload paths in reports are historical after retention; reconstruct from
the archive instead of assuming they still exist. Shared runtime/model data and
its reciprocal source dependency remain protected. These receipts are Root
self-audits, not independent acceptance.

Retention preserved all **5,844 entries**, including regular-file bytes, kinds,
modes and symlink text without following targets, in an 18,084,320-byte archive.
Only this run's idle `payloads`, `t-rsp-1115` and harness `__pycache__` were
removed after full archive/live comparison, reclaiming **77,176,832 allocated
bytes**. The compact run occupied about 23 MiB afterward. The protected artifact
root remains about 36 GiB, an explicit existing budget exception; no shared
runtime, model, Project or unrelated run was deleted.

Shipping publisher publication, signed production identity, distribution,
install/upgrade/update and full MVP acceptance remain open; promise statuses
are unchanged. Git publication is recorded by the retained delivery/commit
receipts, separately from local validation.
