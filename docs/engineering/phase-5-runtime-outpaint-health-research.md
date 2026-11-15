# Reopened outpaint resource health

Base: `a1c648ebb5d12bbc10227f543a4f47e5953ffe93`, `master`.
Risk: **High** at the existing async runtime/status and typed IPC boundaries;
no resource installation, storage migration or generation policy change.
Supporting contracts: [runtime management](../specs/07-python-runtime-management.md),
[PP-001](../product-promises.md#pp-001-понятный-интерфейс-вместо-собираемого-workbench),
[engine composition](./phase-5-engine-lama-composition-research.md),
[native qualification](./phase-5-native-engine-qualification-research.md),
[research](./research-protocol.md), [review](./review-protocol.md) and
[artifact lifecycle](./artifact-lifecycle.md).

## Expected result and scope

A reopened application must distinguish a healthy installed Python/GPU worker
from an unavailable shared LaMa resource. A successful cached GPU handshake does
not verify LaMa. The status read must not download, repair, activate a slot,
change a Project or block ordinary generation/CPU derivatives because LaMa is
unavailable. The existing per-operation outpaint verification remains authority.

The existing generation-context contract explicitly confines shared LaMa failure
to outpaint (`generation-app-context.ts:116`). Replacing the whole runtime's
`ready` with `needs-repair` would violate that contract and is rejected.
An additive advisory `RuntimeStatus.outpaintInfill` instead reports `ready` or
`needs-repair` when the Python/GPU status is ready. Omission means this service
has not inspected the resource; it is not a healthy aggregate assertion.

Public Main supplies the already recovered generation-context resolver to the
RuntimeManager. Legacy Python-slot qualification collaborators omit the new
optional resolver and keep their previous scope. No paths, model descriptors,
keys or user-controlled inputs are added to the status DTO. The existing public
zero-argument getStatus/event channels carry it; preload validates its finite
enum for both getters and events.

The existing runtime notice shows a separate outpaint warning, Repair and Check
again. It explicitly preserves other generation and Project tools. Check again
observes externally restored bytes. There is no filesystem watcher or implicit
installation. Public Repair remains unavailable until the existing shipping
provider/trust/preview prerequisites are fulfilled; its actual error is retained.
The approved Vue/Naive layout and generation readiness predicates stay intact.

## Fresh Invoke implementation and callers

Reread clean InvokeAI revision
`4875d96531ca6712b288f6e660fcbb34143408c1`:

- `invokeai/app/invocations/infill.py:134–143` calls the context's shared-model
  loader for the fixed LaMa URL.
- `invokeai/app/services/shared/invocation_context.py:800–824` obtains its path
  from `download_and_cache_model`, then calls `load_model_from_path`.
- `invokeai/app/services/model_install/model_install_default.py:1549–1603`
  serializes same-source downloads and rechecks the shared cache after locking.
  Its existing first-entry cache return neither verifies the pinned hash nor
  refuses missing files without downloading.
- `invokeai/app/services/model_load/model_load_default.py:315–394` owns local
  model-loading/cache claims under its load lock; its concrete LaMa loader is
  `invokeai/backend/image_util/infill_methods/lama.py:49–56`.

Invoke separates shared resources from the runtime environment, but these
inspected owners supply no compatible signed managed-engine health/provider
API. The opportunistic download and unhashed cache path cannot be used for a
verification-only Studio status read. This absence/conflict was disclosed before
implementation. The adaptation reuses Studio's existing exact-resource owner
`InferenceAuxiliaryResources.resolveVerifiedOutpaintInfill()`; it adds no
parallel downloader, resource classifier or verification algorithm.

Shipping provider, publisher keyring and endpoints are still absent in public
Main. Qualification-only signing identities cannot be substituted. This stage
closes the independent reopened-resource visibility prerequisite, not public
Setup Install/Repair or shipping trust.

## Owners and asynchronous invariants

```text
public Main RuntimeManager
→ existing recovered infillResolver (verification only)
→ canonical root + pinned size/hash/fd/path identity
→ fresh outpaint health projection beside Python/GPU readiness
→ existing trusted-window IPC / strict preload getter and event validation
→ existing runtime notice / explicit Check again
```

The resolver runs afresh before preparing the worker status, independently of
the existing 60-second GPU qualification cache. Its failure becomes only the
outpaint projection. After its awaited I/O, shutdown/install fences and pointer
identity are checked before worker preparation. Existing lease/revision guards
continue to prevent a competing CUDA status probe. Pointer replacement restarts
the advisory read against the current pointer; an I/O failure refuses status.

No health-cache lifetime, file-size ceiling, worker deadline, resource manifest
or generation default changes. The pinned resource remains 205,669,692 bytes.
A status snapshot is advisory; a later outpaint operation verifies its own
resource. Native health/capacity and visual results cannot be inferred from the
controlled subprocess tests used for status orchestration.

## Finite verification plan

- Cached GPU ready plus missing, exact, same-size changed, linked and restored
  resource bytes; fresh manager checks and resource-only status events.
- Missing/invalid pointer, unsupported host and failed worker remain their own
  states; no extra worker launched solely for resource health.
- Ordinary inference/metadata admission and CPU target preparation remain usable
  with a failing helper. Shutdown and pointer replacement during delayed reads
  fail closed, with healthy neighboring controls.
- Actual built preload getter/event accepts both enum values and rejects malformed
  resource fields. Existing Node worker peers are explicit substitutes for native
  Python/CUDA; the exact pinned resource filesystem path is tested separately.
- Production Vue/Naive notice: partial warning, busy/error, explicit recheck and
  healthy restoration; screenshot/interaction checks do not establish persistence.
- Semantic mutation reaches the fresh-health consumer, produces the intended
  assertion RED, and has adjacent GREEN plus exact byte restoration.
- Typecheck, appropriate focused owner suites, full prototype suite with two
  workers, scoped lint and application build. Retain execution/source/exit
  receipts and dispose only exact idle owned temporary payloads.

## Execution record

Root evidence owner: `runs/runtime-outpaint-health/20261115` under the established
artifact root. These are fresh executions on this delivery working tree.

- **168 owner tests PASS, two explicit opt-in SKIP** (`owner-tests-final`): real
  runtime/status/filesystem and controlled subprocess boundaries, including fresh
  synthetic byte verification, reopen, ordinary/CPU admission and pointer/shutdown
  races. The two absent opt-ins are real pinned LaMa installation and actual host
  inspection in the earlier installer suite. This stage's separate resource
  smoke uses the actual pinned LaMa; it does not rerun those installer/native gates.
- **11 focused browser cases PASS**, including the production `App.vue` action
  and its real `runtimeUnavailableReason` consumed by Generate guards. Unrelated
  Home/catalog APIs are explicit empty mocks. Tests click real Repair/Check again,
  observe the actual computation and cover status/transport failures/restoration;
  no test-only production export or generation-request execution is used.
- Source review found a real P2: failed partial Repair populated the existing
  global connection error and blocked ordinary generation. The fix stores the
  exact `RUNTIME_INSTALL_UNAVAILABLE` partial-action refusal separately. Other
  failures remain blocking. A preceding unresolved status error also survives
  a stale partial Repair action; the notice shows connection status and only
  Check again while that error remains. Final App guards received Root self-review
  and actual consumer regression; initial separate review was source-only.
- The maintained `smoke-runtime-status.mjs` now accepts the optional explicit
  `IMAGEGEN_RUNTIME_STATUS_LAMA_SOURCE` qualification profile. `ipc-health-r2`
  passes eight exact resource phases, an ordinary live-lease phase, six malformed
  getter DTOs and six malformed event DTOs with an ordered valid event barrier.
  The real RuntimeManager, exact pinned verifier and built preload are used;
  Node JSONL peers explicitly replace Python/CUDA. All seven peers physically
  exit; Electron closes with exit code zero and no signal. The original protected
  205,669,692-byte LaMa remains unchanged. One owned resource copy per attempt is
  verified/restored; two temporary attempts remain until retention/cleanup.
- Two Main semantic mutations run in an isolated current-source copy: sharing
  the GPU cache with resource health and turning helper failure into global
  runtime repair. Each produces its intended assertion RED, neighboring GREEN
  and exact restoration. A separate isolated browser-module response mutation
  reproduces the P2 error-channel regression through the actual App computation.
  It never changes production source bytes. That earlier UI source hash is
  explicitly distinct from the final App's additional preceding-error guard.
- A separate agent executed **37 read-only byte/report/process checks** against
  the stable IPC fixtures, three exact LaMa files, peer/Electron exits and Main
  mutation restoration (`independent-byte-audit.json`). This is an independent
  byte audit, not another product/native execution or an archive audit. Root's
  archive/live verification and final source checks are reported separately.
- Production App screenshots at 1280×720 were opened and inspected in Home
  context, including partial warning and refused Repair feedback. Existing
  surfaces, typography, action grouping and CSS remain unchanged. Screenshots
  plus explicit interactions do not constitute full accessibility acceptance.

The first owner run caught a wrong authored shutdown expectation, corrected to
existing `RUNTIME_SHUTTING_DOWN`. The first new notice test used an exact button
name that omitted Naive's accessible `loading` prefix; the selector was corrected.
A test-only global API typing error and an isolated-copy pnpm bootstrap refusal
were also corrected. These diagnostics remain retained and are **not** semantic
mutation REDs or product/native failures.

The third full browser run exposed a timeout in the unchanged Euler preset test.
Trace snapshots prove its sampler click occurred during active collapse expansion
(`enter-active`, `enter-to`, inline `max-height:72px`); they do not prove the exact
blur/clickoutside event preventing the popup. Installed Naive UI **2.44.1** sources
were checked: `lib/collapse/src/CollapseItemContent.js:26–38` uses
`NFadeInExpandTransition`, whose `handleAfterEnter` clears max-height in
`lib/_internal/fade-in-expand-transition/src/FadeInExpandTransition.js:51–87`.
Collapse overrides its duration to 0.15 seconds in
`lib/collapse/src/styles/index.cssr.js:32–34`; Select trigger/blur/clickoutside
handlers are in `lib/select/src/Select.js:347–400` (resize at640–644 only syncs
position). The test now observes settled expansion and zero/one/zero popup
lifetime, removing arbitrary `.first()`. Three repeated controls pass. No sampling
implementation/default, timeout, sleep or extra click/retry was introduced.

Final frozen `prototype-r4`: **281 PASS**, 305.411 seconds with two workers.
Final typecheck, scoped ESLint and `app:build` pass. Eleven code/test files are
bound by `source-current.json` / `validated-source.tar.gz`; documentation is
bound separately at delivery. No source edits followed the final full-run start.

Retention inventories **1,233 entries**; the verified archive
retains 1,231 entries, 7,321,639 compressed bytes,
SHA-256 `73f703f6ab804d8ee8447657d26ee8bfb1c129fa71d772ac10d06fc1955315c6`. Only two byte-exact owned LaMa copies are omitted,
with explicit recipes referencing the protected original. All other payload bytes
and recorded link text are retained; links are never followed/extracted. Root
streamed every archive member and rechecked full live identity immediately before
no-follow disposal. **447,406,080 allocated bytes** were released.
Protected Shared inputs, models and ordinary app data were preserved.

The run-owned retention helper initially tried to replace lifecycle metadata with
its create-only writer **after** both verified trees were disposed. That finalizer
failed; the archive and inventory remained intact. A separate metadata-only
recovery verified the archive, exact absent roots, original source, source pins,
process exits and reciprocal dependencies, then atomically replaced the lifecycle
through a new sibling. No raw deletion was retried. Both failure and successful
recovery receipts are retained. Global free-space delta was not recorded at the
failed finalizer; reclaimed allocation comes from the complete fresh block
inventory with single-link regular files and confirmed disposal. Lifecycle is
`retained`, `payloads: []`; compact evidence and two protected input dependencies
remain explicit. This helper incident did not alter production code or tests.

`validation.json`, `release-gates.json`, the exact staged delivery snapshot and
`commit-proof.json` distinguish validation, retention, local commit and remote
publication. PP-001/005/007/008 remain **«Пока не обещать»**. No native CUDA/Python inference,
model capacity/visual quality, shipping network/trust, clean install/upgrade or
complete public Setup readiness is claimed by this stage.
