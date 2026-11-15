# Metadata-first runtime review and deferred acquisition

Base: `c76c67611166af99f7e3f606269db242e75cc954`, `master`.
Risk: **High** — consent now covers executable runtime acquisition as well as
the existing installation, shared LaMa and pointer/rollback boundaries.
Contracts: [PP-001](../product-promises.md#pp-001-понятный-интерфейс-вместо-собираемого-workbench),
[runtime management](../specs/07-python-runtime-management.md),
[setup confirmation](./phase-5-runtime-setup-ui-research.md),
[transport cache](./phase-5-runtime-transport-cache-research.md),
[research](./research-protocol.md), [review](./review-protocol.md) and
[artifact lifecycle](./artifact-lifecycle.md).

## Expected result and settled boundary

The previous public review needs an already expanded runtime and verified cached
ZIP. Putting download/extraction into its `loadRelease()` would acquire payload
before consent. The new optional Main metadata backend supplies the already
obtained bounded signed metadata, separately trusted keys/app version and exact
source/redirect policy. It does not obtain keys or URLs from renderer.

User confirmed that a production publisher, signed metadata/artifact endpoints
and trusted public identity do not exist yet. They remain unconfigured. Default
Main therefore remains unavailable; no qualification key or endpoint becomes
shipping trust. Metadata discovery/delivery and publisher provisioning remain
separate from this consumer of explicitly supplied metadata.

RuntimeManager remains the sole token, mode, admission and operation owner.
Preview authenticates metadata with `verifyRuntimeTransportMetadata`, inspects
only existing exact cache and the pinned LaMa, then uses the existing engine
planner. It does not obtain/extract executable payload, assemble a slot or start
a worker. A new preview invalidates the previous internal capture as well as
the existing public intent. Ambiguous metadata/legacy backends refuse.

Explicit token confirmation performs host and pointer checks before acquisition,
then uses **existing** cache/download, extractor, release verifier, auxiliary
installer, runtime controller, assembler, qualification and rollback. The
metadata backend freezes envelope buffers, keys, source policy and bound
collaborator methods before awaits. No latest-release reselect or fallback
source occurs after consent. Extraction uses a fresh Main-owned output path
derived from the existing token, never a renderer path or new token generator.

Read-only cache inspection shares the current complete-entry verifier. The
existing per-entry acquisition lock now supports `requireCached`: missing cache
after a zero-runtime-download review refuses before new output or transfer.
Corruption, incomplete entries and changed snapshot also refuse. A newly
available exact cache may reduce transfer. Auxiliary plan currentness and
zero-to-nonzero refusal remain with the existing LaMa installer. Incomplete
acquisition/extraction outputs remain owned inspection/recovery state; there is
no implicit deletion, partial resume, eviction or automatic retry. A provider
must explicitly select a valid fresh attempt after failure.

The public projection retains exactly twelve path-free fields. Metadata review
can describe cached or uncached source; legacy local review still requires
cached source. The existing dialog distinguishes those states, retains unknown
installed/aggregate peak values and never substitutes the signed runtime floor
for sufficient total free space. Review dismissal is not operation cancellation.
Public operation progress/cancel remains a separate consumer; internal cancel
still awaits the existing acquisition/installation operation's settlement.

## Fresh Invoke implementation and callers

Read clean local revision `4875d96531ca6712b288f6e660fcbb34143408c1`:

- `invokeai/app/services/model_install/model_install_default.py:1606–1655`
  obtains remote metadata and pins HF URLs to a commit before acquisition.
- `invokeai/app/services/download/download_default.py:241–321` composes known
  parts/byte counts with optional `submit_job=False`; separate submission starts
  sequential acquisition. This supplies the metadata-before-bytes sequence.
- `model_install_default.py:1549–1603` serializes source cache acquisition and
  rechecks cache under the lock. Its unchecked first-entry shortcut cannot
  replace Studio's signed exact-cache verification.
- Callers: `invokeai/app/services/shared/invocation_context.py:800–824` and
  `invokeai/app/invocations/infill.py:134` obtain the shared cached LaMa before
  worker consumption. Existing Studio owners already adapt their download and
  lifecycle mechanisms.
- Frontend callers `useInstallActions.ts` → `AddModelsView.tsx` and
  `launchpad/ModelsNotice.tsx` scope explicit install intent to its current owner.

Those Invoke owners have no compatible signed aggregate managed-Python engine
catalog/keyring. This absence was reported before implementation. The adaptation
joins existing Studio owners rather than introducing another downloader,
installer, acceptance wrapper, worker, classifier, queue or recovery ledger.

## Parameters, failure signals and checks

Existing signed-envelope ceiling: 1 MiB each. Existing runtime archive ceiling:
65 GiB; ordinary model limits remain unchanged. Keys, signatures, exact app
version, inventory/ZIP expansion budgets and source HTTPS/redirect rules retain
their existing verifiers. No new network timeout, retry count, disk estimate or
ML capacity default is introduced. One current Main review and operation remain
the finite authority; the signed runtime floor and aggregate peak stay separate.

Checks must prove no acquisition before confirmation, exact runtime+LaMa totals,
immutable capture, invalid metadata before acquisition, host/pointer refusal
before bytes, cached loss/corruption without extra download, cancellation/error
without activation, fresh explicit retry and the preserved local-source path.
Signed fixture/cache/extraction/controller tests use controlled download,
auxiliary, assembly and worker ports explicitly. Browser/API mocks and built
renderer/preload/IPC checks do not prove real installation or shipping trust.
Semantic mutations need intended consumer RED with adjacent GREEN/restoration.

This stage uses only seventeen exact pinned config files from the protected
shared transport for small signed fixtures. It creates no second ML runtime,
interpreter, wheelhouse or weights copy. Root/source/retention evidence stays
separate. PP-001/005/007/008 remain **«Пока не обещать»**; native capacity/visual,
shipping delivery, distribution/upgrade/update and final MVP acceptance remain
open.

## Execution and delivery

Root executed the following on 2026-11-15, retaining evidence under
`runs/runtime-metadata-provider/20261115` in the established artifact root:

- **145 Main/shared tests PASS, two existing opt-in SKIP** (147 TAP tests).
  The skipped cases require actual host preflight or pinned LaMa publication;
  neither is relabeled as executed. New integration cases use real signatures,
  ZIP, cache, extraction, public registrar, RuntimeManager, controller and
  pointer files. Download, auxiliary, assembly and worker transports are explicit
  controlled ports. Install then cached Repair publishes distinct pointers;
  previews, revoked tokens, bad metadata, host/pointer refusal, failed/canceled
  acquisition and missing/corrupt cached source do not activate a slot.
- **293 browser tests PASS**, including uncached metadata review before explicit
  confirmation. Existing cached/partial Repair and other prototype regressions
  remain green. API ports are mocked; no persistence/inference claim follows.
- **16 built Electron/IPC checks PASS**, exactly three authorized controlled
  service attempts. The actual built renderer/preload/registrar accepts uncached
  metadata provenance and full byte totals, preserves cached review, and revokes
  consent on dismissal/reload/stale token. The internal service is controlled,
  not RuntimeManager assembly or a shipping publisher. A separate actual default
  Main run still shows unavailable Setup on isolated empty data. Both lifetimes
  close with exit0/no signal and confirmed physical process/scope exit.
- Full TypeScript/Vue typecheck, scoped ESLint over all thirteen changed code/test
  sources, and app build PASS. No Python or inference source changed.
- Three isolated source-copy mutations reach actual Main/cache consumers:
  acquiring during preview makes the observed pre-consent download count one;
  omitting the initial pointer fence spends bytes before the later refusal;
  bypassing `requireCached` completes acquisition instead of refusing. Each
  yields the intended assertion RED with adjacent GREEN and exact restoration:
  **nine selections = six GREEN + three semantic RED**. Live source is never
  mutated. Source copies retain a dependency symlink without following it.
- Bounded source-only review found no blocker. Root viewed actual browser and
  built Electron uncached-review PNGs. Those finite source/visual passes and
  Root's retention self-audit are distinct from independent whole-head, native
  installation, capacity or model-quality acceptance.

Checks ran serially with 4 GiB/zero-swap group limits and a 420-second deadline.
The browser suite took 335 seconds and peaked at about 3.3 GiB. Existing native
scope ownership/deadline guards narrow owned scopes to 4 GiB/120 seconds;
launcher plus native scope stays at most 8 GiB. The controlled UI lifetime took
12.0 seconds, default Main 2.8 seconds. No foreign process was stopped.

Two initial setup failures remain retained and are not semantic REDs: assertions
on an empty authored array narrowed it to `never[]` during typing; the long run
TMPDIR exceeded the Unix socket path limit before tsx could start tests. The
empty-array checks now compare length, preserving the same invariant. A short
owned artifact-root TMPDIR fixes socket setup. The subsequent typing and full
test runs above pass; no production guard was weakened.

`validated-source.json/tar.gz` retains the thirteen changed code/test sources;
the seventeen actual native source/build consumers are retained separately.
Full archive/live membership, kinds, modes, symlink text and regular-byte hashes
cover **5,832 entries**, with zero omitted entries. `retained-payloads.tar.gz`
is 17,291,202 bytes. After exact restoration and physical-exit checks, only this
run's idle payloads, short TMPDIR and Python harness cache were removed,
releasing **80,433,152 allocated bytes**. Lifecycle is `retained`, `payloads: []`.

The protected shared transport remains a reciprocal source dependency for the
seventeen pinned config files; no wheelhouse/environment/weight copy was made.
Models, current reusable runtime, managed Projects and prior evidence were not
removed. About 21 MiB of compact evidence remains; the preexisting protected
36 GiB root budget exception does not authorize a sweep. Reconstruct fixtures
at fresh owned paths; do not resume deleted raw paths or automatically extract
and follow retained links. Validation, retention and committed-byte/remote
publication receipts remain separate. Public promise statuses are unchanged.
