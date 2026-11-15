# Public engine review and token IPC

Base: `1b34412e74348b45740a1bfeafd1678bcd6e0aa9`, `master`.
Risk: **High** — public IPC now carries reviewed installation authority. Existing
runtime assembly, resource publication, activation, rollback and worker owners
remain unchanged. Supporting contracts: [runtime management](../specs/07-python-runtime-management.md),
[PP-001](../product-promises.md#pp-001-понятный-интерфейс-вместо-собираемого-workbench),
[engine composition](./phase-5-engine-lama-composition-research.md),
[research](./research-protocol.md), [review](./review-protocol.md) and
[artifact lifecycle](./artifact-lifecycle.md).

## Expected result and finite scope

Expose the existing Main engine review through typed IPC/preload, then delegate
only its current mode-bound one-use token to the existing RuntimeManager. Reject
internal `python-runtime-slot` review, untrusted caller/frame, stale/dismissed
review and a response arriving after its renderer document is replaced. No new
installer, queue, token generator, download classifier or pointer implementation.

This is the public protocol consumer for **already obtained verified local
sources**. Internal review currently needs an expanded selection and a verified
cached ZIP. A future provider must not acquire them implicitly just to answer
preview. Metadata-first pre-download review, shipping provider/keyring/endpoints,
confirmation UI, progress/cancel and distribution acceptance remain separate.
Default Main still has no shipping backend and returns unavailable. No source
paths, keys, manifests, hashes or auxiliary plan IDs are accepted from renderer.

Legacy zero-argument Install/Repair remains an explicit unavailable refusal,
without forwarding a mutating call, even with an internal backend. This preserves
partial outpaint Repair's existing nonblocking outcome. Positive public actions
require the new preview/token API; this stage does not install from the old UI.

## Fresh Invoke source and callers

Reread clean local Invoke revision
`4875d96531ca6712b288f6e660fcbb34143408c1`:

- `frontend/webv2/src/features/models/ui/add-models/useInstallActions.ts:23,74`
  captures account ownership and checks it before publishing or queuing the next
  constituent. Callers: `AddModelsView.tsx:226,249`, `ModelsNotice.tsx:374`.
  `starterModelInstallSources.ts:36–72` composes/deduplicates dependencies and
  excludes installed sources.
- `app/api/routers/model_manager.py:946` invokes `heuristic_import`, then
  `app/services/model_install/model_install_default.py:1123,1138` performs actual
  acquisition/installation. Its account/source credentials are not review tokens.
- `app/services/download/download_default.py:241–319,783–822` composes known byte
  constituents, runs them sequentially and settles cancellation after disk users
  stop. Actual installation callers use revision-bound staging through
  `install_staging_ledger.py:611` / `model_install_default.py:2138`.
- Cancel UI caller `useInstallJobActions.ts:81` → router1205 → service1267;
  `_discard_cancelled_staging:308` protects other ownership/recovery state.

These owners supply explicit intent and owner-currentness, but no compatible
signed aggregate preview/one-use installation token. Invoke's install endpoint
cannot serve as a side-effect-free preview. This absence was disclosed before
implementation. The adaptation joins existing Studio RuntimeManager capture and
controller to existing preset/project trusted-main-frame IPC conventions.

## Public projection and lifetime

The flat exact DTO exposes engine scope, verified-local-cache source, mode,
opaque existing token/release ID, byte totals, unknown aggregate required peak,
separate signed runtime floor and cache/reuse facts. It does not expose expanded
`verifiedPayloadBytes` as download volume. Runtime source caching never means
installed-slot reuse; LaMa reuse remains a distinct fact. Unknown sizes remain
null and no new estimated peak or timeout is invented.

The shared validator only validates the bounded DTO shape; existing Main planner
remains byte arithmetic authority. Only an exact engine review can issue public
intent. Main stores one public binding to the existing internal token and mode.
New valid preview, including failure, invalidates old intent before awaiting.
An active-preview guard refuses overlap; epoch checks discard a late response.
Dismissal revokes only unconsumed review, never claims to cancel a running install.

Only the trusted WebContents **and its main frame** can invoke these channels.
Main-frame navigation, render-process loss, window closure and disposal revoke
review authority. Existing installation rehash, pointer CAS, admission, one-use
capture and physical cancellation remain with RuntimeManager/controller.

## Verification plan and limitations

- Strict DTO cases: exact/null sizes, wrong scope/source, malformed tokens/modes,
  unsafe integers, unknown/private fields, prototypes/accessors and symbols.
- Registrar cases: trusted frame, invalid arguments, engine-only projection,
  legacy unavailable refusal, replay/wrong mode/token, failed/superseding preview,
  discard, overlap/late result and disposal/document epoch.
- Actual existing signed fixture/controller: public preview performs no assembly
  or auxiliary install; explicit token reaches existing Install/Repair and pointer
  publication; revoked tokens cannot spend auxiliary bytes or create a slot.
  Assembly/worker ports stay controlled; no native or actual LaMa claim.
- Built preload: real Electron/IPC with strict getter normalization, mode binding,
  token arguments, dismissal and document replacement. Controlled provider is
  explicit and never relabeled shipping trust or full production Main execution.
- Meaningful semantic RED with neighboring GREEN and restoration, TypeScript/Vue
  typecheck, scoped lint and app build. UI source does not change; no browser/mock
  prototype pass is used as installation evidence.

## Root execution and delivery record — 2026-11-15

Evidence: `runs/runtime-setup-ipc/20261115` under the established artifact root.

- **99 tests PASS, two explicit opt-in SKIP** (`unit-final`), including the actual
  signed fixture, public registrar and existing RuntimeManager/controller Install
  and Repair through two distinct pointer publications. Revoked reviews do not
  reach auxiliary/assembly. Package assembly, auxiliary delivery and worker
  transports are controlled ports, not native qualification. Real host and LaMa
  installer opt-ins remain skipped; no heavy ML runtime or weights were copied.
- Full TypeScript/Vue typecheck, scoped lint for changed sources and `app:build`
  passed. No Vue/prototype UI changes were made and no historical browser matrix
  is relabeled as a fresh execution.
- Final real Electron/IPC/built-preload smoke: **36 recorded cases**, exactly two
  authorized controlled-service calls (Install/Repair), 13 malformed review DTOs
  and four malformed dismissal results. Actual native main-frame reload revokes
  old review; subframe controls remain registrar-unit evidence. The fixture's
  internal service is controlled, not the complete production Main or installer.
- Source review found private native diagnostics crossing the new public API.
  Fixed messages now normalize preview/operation errors. An actual missing
  transport regression and a semantic mutation demonstrate the private-path
  refusal at the consumer; untrusted error text is not returned.
- Three isolated-source semantic mutations remove frame protection, one-use
  consumption and preview-error normalization. Each reaches its actual protected
  consumer and yields the intended assertion RED with adjacent GREEN and exact
  restoration. Live delivery source was never mutated.
- The first smoke completed protocol phases but hung in close: its new cleanup
  accessed `window.webContents` after native window destruction. Only its owned
  service was stopped; exit90/forced termination is **not** a successful close or
  semantic mutation. Capturing the caller before closure fixes production Main
  and fixture cleanup. The final native receipt confirms the old accessor rejects,
  owner disposal succeeds and Electron physically exits with code0/no signal.
  PASS logging now follows report publication and normal close.
- Separate initial review was source-only. Root performed final self-review of
  lifecycle refinements, source/report byte checks and archive/live verification.
  These are explicitly self-audits, not an independent native/whole-head run.

Initial authored cached-source fixtures accidentally included an installed-size
field rejected by the existing strict planner; they were corrected to exact
four-field cache identities without weakening the planner. Two authored typing
issues (literal-field lookup after lint normalization and a test assertion's
narrowing order) were corrected. Failed receipts remain retained and do not count
as semantic REDs. Existing auxiliary preview capacity/expiry stays with its owner;
public dismissal releases only public authority, not an unsupported private-plan
cancellation operation.

Nine code/test sources are retained in `validated-source.tar.gz`. Both successful
smoke source-before/source-after records match their actual consumers. Final
retention covers **1,368 entries**, with no omitted bytes;
archive size 6,139,567 bytes, SHA-256
`df657cce441f18e6a396225971d50e53b63e121dffb75d22d16b71326cd6ff7c`. Root streamed archive hashes/kinds/modes/link text and
rechecked full live membership immediately before exact no-follow disposal.
**36,110,336 allocated bytes** were released; Shared inputs,
models and ordinary app data remained untouched. Lifecycle is `retained`,
`payloads: []`; retained source/link metadata is not an executable relocated test
environment. Reconstruct at fresh owned paths and requalify; never resume deleted
raw paths or automatically extract/follow links.

`validation.json`, `release-gates.json`, exact staged `delivery-source.json` and
`commit-proof.json` distinguish actual checks, retention and Git publication.
PP-001/005/007/008 remain **«Пока не обещать»**. Shipping provider/trust/endpoints,
metadata-first pre-download review, positive confirmation UI/progress/cancel,
distribution/upgrade/update, native capacity/visual and final MVP acceptance are
still separate.
