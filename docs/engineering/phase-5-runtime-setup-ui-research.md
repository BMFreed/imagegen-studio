# Engine setup confirmation consumer

Base: `09a8abccc7a0af3f65d27bcc69ef9dd0b256bc8f`, `master`.
Risk: **High** — renderer confirmation now submits installation authority to the
existing public IPC. Runtime assembly, downloads, resource publication, pointer
activation, rollback and worker owners are unchanged.

Supporting contracts: [PP-001](../product-promises.md#pp-001-понятный-интерфейс-вместо-собираемого-workbench),
[runtime management](../specs/07-python-runtime-management.md),
[review/token IPC](./phase-5-runtime-setup-ipc-research.md),
[research](./research-protocol.md), [review](./review-protocol.md) and
[artifact lifecycle](./artifact-lifecycle.md). Existing Vue/Naive modal presentation
and the local frontend/ui-audit guidance supply the visual design.

## Expected behavior and finite boundary

Set up/Repair opens a pending review, then presents the current engine release,
download/installed/additional sizes, cached source and outpainting reuse. Null
sizes remain **Unknown**. The signed runtime free-space floor is distinct from
the unknown aggregate installation peak; cached source never means that a fresh
runtime is already installed. No estimated capacity or automatic approval is
introduced.

Only explicit Install/Repair confirmation sends the captured mode/token to the
existing public API. Duplicate confirmation is disabled before awaiting. Failed
operations require a fresh preview; no automatic retry or token persistence.
Cancel/Escape dismisses unconsumed review, including while preview is pending.
The renderer ignores late replies and prevents another action until both the
old preview and dismissal settle. Unmount requests dismissal; Main's existing
document/main-frame protection remains authority after reload or renderer loss.

Accepted operation state disables review dismissal and shows only nonnumeric
pending text. Dismissal does not cancel an installation. Public operation progress
and cancellation remain separate consumers of existing Main owners.

The unavailable partial-outpaint Repair stays separate from connection/status
failure, preserving ordinary generation and CPU tools. A failed preview/operation
returns to the existing notice with a visible error and a fresh explicit action.
No Project, `.igs`, model, queue or result state is modified by this UI.

## Fresh Invoke implementation and callers

Read clean local Invoke revision `4875d96531ca6712b288f6e660fcbb34143408c1`:

- `invokeai/frontend/webv2/src/features/models/ui/add-models/useInstallActions.ts`
  captures current ownership, exposes one pending source, and only publishes
  completion to its current owner. Callers: `AddModelsView.tsx:226,249` and
  `features/models/ui/launchpad/ModelsNotice.tsx:374`.
- `features/models/data/api.ts:118` posts explicit installation intent to
  `app/api/routers/model_manager.py:946,1006`, which invokes
  `app/services/model_install/model_install_default.py:1123,1138` immediately.
  It cannot be reused as a side-effect-free preview.
- `features/models/ui/install-queue/useConfirmedInstallCancel.tsx` keeps a
  confirmation dialog separate from the actual cancellation callback.

Invoke has no compatible signed aggregate engine review/token. This absence
was reported before the UI adaptation. The consumer adapts explicit intent,
pending state and owner-currentness to the **existing Studio** preview/dismiss/
tokenized API; it introduces no independent installer or authority mechanism.

## Parameters, refusals and verification plan

The finite action domain is `check | install | repair`; setup mode is
`install | repair` from the shared DTO. There is one visible review and pending
action. Token lifetime/expiry, signed sizes, host/disk checks and resource
identities remain Main-owned; the UI adds no timeout, byte estimate or limit.
The dialog follows existing 540px bounded modal layout and the supported native
minimum window; long release identifiers must wrap and footer actions remain
reachable.

Verification distinguishes production App browser tests with mocked APIs from
built renderer → preload → real IPC with a controlled installation service.
Neither qualifies shipping trust, downloads, native installation, visual model
quality or complete release readiness. Semantic controls must reach token
submission or late-reply publication, with neighboring GREEN and restoration.
All TypeScript/Vue checks, scoped lint, app build and the complete prototype
browser suite are required for this change. Screenshots must actually be viewed.

Default Main still has no shipping provider/keyring/endpoints. This consumer
uses verified-local-source review; metadata-first review **before download**,
public operation progress/cancel, distribution/upgrade/update, native capacity,
visual and final MVP acceptance remain open. PP-001/005/007/008 stay
**«Пока не обещать»**.

## Execution and delivery

Root executed the following on 2026-11-15. Evidence is retained under
`runs/runtime-setup-ui/20261115` in the established artifact root.

- **292 browser tests PASS** in the complete prototype suite with two workers,
  including eleven new production App/modal cases with explicit mocked API
  ports. The existing partial-outpaint health fixture now counts preview
  refusals and asserts that legacy Repair is never called. Its connection/status
  refusal and ordinary availability controls remain intact.
- Full TypeScript/Vue typecheck, scoped ESLint on all five changed code/test
  sources, and `app:build` PASS. No Python or inference behavior changed; no
  historical Main/Python/native counts are relabeled as fresh evidence.
- **13 built Electron checks PASS**, through the actual production renderer,
  sandboxed preload and existing setup IPC registrar. The controlled Main
  service receives exactly three authorized attempts: Install, Repair and
  explicitly reconfirmed Repair. Loaded/pending dismissal, actual document
  reload, token replay and stale confirmation refuse before that service.
  Two synchronous DOM confirmation events exercise the parent submission guard;
  accepted-operation Cancel/Escape stays disabled. The service, Home API and
  installation mutations are controlled ports, not real runtime installation.
- A separate **actual default production Main** run on fresh isolated empty
  app data shows the unavailable-provider error, leaves status not-installed
  and closes normally. This verifies refusal, not a shipping provider or native
  installation.
- Three response-only semantic mutations reach actual App consumers: replacing
  the submitted token yields an exact token mismatch; removing the wait for the
  old preview enables Set up prematurely; moving unavailable partial Repair
  into the status error channel blocks ordinary availability. All three give
  intended assertion REDs, each with neighboring GREEN and restored GREEN:
  **nine selections = six GREEN + three semantic RED**. Live source hashes stay
  identical; no delivered source or installed worker was mutated.
- Bounded source-only review found no blocker. Root viewed browser and native
  screenshots, including long release at native 900×620, regular 1280×800,
  pending and reused-resource Repair. Footer actions remain reachable and
  disabled state is checked after finite Naive transitions. This is a finite
  self-review, not a whole-app accessibility or model-quality acceptance.

Final checks run serially in a 4 GiB, zero-swap launcher with a 420-second deadline;
the complete browser run took 329 seconds and peaked at about 3.3 GiB. Native
KDE scopes use the existing qualification guard with its execution port
narrowing the owned scope to 4 GiB and a 120-second deadline. Launcher plus
native scope stays at most 8 GiB; no ML runtime or weights are read/copied.
Actual process/scope exit is confirmed and owned deadline timers are stopped.
Final controlled UI lifetime took 10.3 seconds; default Main took 2.4 seconds.

Initial failures are retained separately: systemd's missing Node PATH prevented
one command from starting; an early typecheck saw two unfinished authored test
types; three new browser selectors omitted Naive's accessible `loading` prefix.
These were corrected without weakening behavior assertions. The first two
native attempts stopped at scope guards: a loose custom Main file became
`app-electron-<pid>.scope`, outside the existing guard's named ownership rule.
The fixture now launches its own package with the production app identity and
uses the existing guard. Those early interrupted loads exited with code1 and
are **neither** successful normal-close qualification nor semantic REDs. Their
PIDs/scopes are confirmed absent. The preliminary bounded r3 report stays separate; final counts refer only to
`native-final`. Final successful native runs exit0/no signal and retain
physical-exit receipts. No foreign process was stopped.

`validated-source.json/tar.gz` retains thirteen source/test dependencies;
`built-consumers.tar.gz` and the final native source-before/after records retain
the exact seventeen consumers. Validation, visual review, semantic failures,
retention and Git publication are separate receipts. Payload disposal and final
publication are recorded in the lifecycle/commit proof; deleted raw fixtures
must be reconstructed at fresh owned paths, never resumed.

Root's full archive/live byte self-audit retained **752 entries**, with zero
omissions, in `retained-payloads.tar.gz` (19,227,047 bytes). Exact idle payloads
and the failed focused browser scratch were then removed, releasing
**50,470,912 allocated bytes**. Lifecycle is `retained`, `payloads: []`, with no
Shared dependency. Models, reusable runtime, prior reports and ordinary app data
were untouched. The run retains about 21 MiB of compact evidence; the existing
36 GiB artifact-root budget exception remains protected, not a cleanup target.

The first retention attempt refused before writing/deleting: the outer check
receipt had reused the inner mutation-summary basename. The complete nine-case
stdout records, successful per-phase hash assertions and native-before/current
source hashes reconstruct `semantic-mutations.json`; `mutations.json` remains
the original outer check receipt. No executed outcome or raw payload was lost.
The subsequent full membership/byte audit and exact disposal completed. This
finalization incident is not a semantic RED or independent audit.
