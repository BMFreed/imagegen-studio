# Smart Patch document foundation

## Prospective scope and risk

Base: `c9d8884`. High risk: a new `.igs` entity crosses document validation,
atomic Save, local recovery, history, asset traversal and typed IPC. This slice
implements `+ Patch`, independent empty owned masks, bbox, internal resolution,
generation drafts, selection and editing, Undo/Redo, Save/reopen and recovery.
The supporting requirements are [Smart Patch](../features/project/generate-mode/smart-patch-layer.md),
[document lifecycle](../features/project/document-lifecycle.md),
[PP-007](../product-promises.md#pp-007-проект-принадлежит-пользователю) and
[PP-008](../product-promises.md#pp-008-генерация-меняет-проект-только-по-явному-решению).
Painting, inpaint, accepted variants, staleness and Smart Patch preset projection
remain subsequent phase-4 slices. The public promise statuses remain unchanged.

## Boundaries and ownership

Renderer → validated preload/IPC → ProjectService → existing autosave/history
coordinator → strict document/package/shadow validation → native renderer.
Main creates identities, inserts the new Patch at the top of the stack, and
copies the acknowledged normal draft and primary bbox at creation. Each Patch owns a distinct mask identity and detached draft. Normal
Project settings/bbox and another Patch must remain unchanged by targeted edits.
Editor commands carry the captured layer identity, rather than consulting a
mutable selection when an asynchronous command completes. Selection flushes
pending edits before changing the editor owner. Resource metadata is still
resolved by Main; the renderer only provides existing resource identities.

An empty mask is represented explicitly by `{ id, revision: 0, asset: null }`.
This represents the layer-owned empty mask without fabricating image pixels or
requiring a functioning ML runtime. It is not a shared mask or a standalone layer.
Painted masks and nonempty variants are rejected by this foundation schema until
their storage and execution owners are implemented. Existing Raster schema and
package members retain their meaning; empty Patches contribute no image pixels,
asset references or accepted-history entries. The release has not shipped, so
this is a strict pre-release extension of document format v1.

## Invariants, controls and semantic mutations

- Production boundary: real ProjectService/SQLite/filesystem and built native UI.
  Invariant: editing Patch B changes only B; normal draft/bbox and Patch A remain
  exact. Neighbor: the equivalent edit of A. Mutation: target lookup always
  selects the first Patch; B must fail while A stays green.
- Production boundary: actual writer/loader and local recovery. Invariant: a
  saved Patch survives reopen/transfer, while dirty edits live only in recovery
  until Save. Neighbor: an old Raster-only Project. Mutation: writer drops Patch
  entities; a direct reopened-file assertion must fail.
- Production boundary: renderer/preload/Main. Invariant: selection binds the
  actual owned draft/bbox; rapid edits and switching owners retain their owner;
  Smart Patch Generate is explicitly unavailable, without ordinary fallback.
  Neighbor: ordinary Project authoring and generation admission.
- Invalid/missing/non-Patch target, locked Patch, malformed geometry, duplicate
  identity and unsupported mask/variant payloads refuse before mutation. Save
  with an absent worker uses existing empty/unavailable preview behavior.

The finite layer kinds and strict schemas define the asset/preview consumer
inventory. Review includes compositor, accepted history, resource URL readers,
generation target capture, acceptance journal, storage and all authoring controls.
No worker/model qualification is needed for this document-only slice.

## Planned evidence and resource limits

Run focused production storage/service tests, semantic mutations with exact
restoration, required typecheck, lint/build and a bounded built Electron scenario
in isolated agent-owned app data. Native scenarios cover two Patches, editing,
selection, history, Save/reopen, actual dirty-shadow recovery and runtime absence.
Read saved ZIP/JSON and recovery independently of the UI response. Retain compact
reports/screenshots, restore mutants, prove physical process exit and remove only
owned disposable test payloads. Do not copy model weights or provision a runtime.

## Executed evidence

This is an implementation/self-review of the dirty tree over `c9d8884`, not a
blind independent product audit. Exact production/harness source hashes and
bundle hashes are retained in the native reports.

Evidence root:
`~/.codex/artifacts/imagegen-studio/runs/smart-patch-foundation/20261014-foundation/`.
Compact reports, screenshots, logs and the saved/recovered packages stay pinned;
fixture app data is disposable only after verified physical exit.

- `app-tests-r3.log`: serial full application suite, **3718 PASS, 0 fail/skip**,
  about 9m17s, 557 MiB peak and no swap. This run preceded the final top-of-stack,
  locked-visibility and layout fixes; it is not labelled a final-tree full run.
- `focused-final.log`: **148 PASS, 0 fail/skip** after those fixes, covering real
  ProjectService, strict schema, document lifecycle, empty-Patch preview/storage
  and ordinary Add. `focused-handoff.log`: **162 PASS, 0 fail/skip** after removing
  one redundant test-only assertion, also covering draft synchronization and
  renderer layer-context helpers. Service tests use actual SQLite/filesystem/
  writer/read/reopen, not an invented local Patch implementation.
- `mutation-report.json` and RED/GREEN logs: current production owner routing
  mutated to write the first Patch regardless of target; Patch B fails at its
  owned prompt assertion while Patch A stays green. Actual strict variant schema
  mutated to admit arbitrary entries; unsupported-variant refusal fails while
  valid empty-Patch parsing stays green. **2 targeted RED, 2 neighbor GREEN**;
  source bytes unchanged and all isolated sibling mutant copies removed. The
  prospective writer-drop mutation was not run; real package/shadow/recovery
  readbacks cover retention, and the schema mutation exercises the discovered
  unsupported-payload hole instead.
- `native-r4/report.json`: **15 named checks PASS**, no page errors, real built
  Electron at 1440×900 and 900×620. Two distinct Patch/mask identities, captured
  rapid input→owner switch, geometry/internal resolution, Canvas arrow movement,
  Undo/Redo, actual Save/ZIP read/close/reopen and dirty shadow→owned Main SIGKILL
  →Home Recover→explicit Save/reopen retain both owners and the Raster neighbor.
  The saved package remains unchanged until explicit Save. A tiny 2×2 pinned-ICC
  Raster is a declared precondition written by the real package writer only while
  the genuine UI-created Project is closed. No Project DTO, worker output or ML
  runtime is fabricated. The empty Patch adds no image assets; placeholder Save
  uses the existing unavailable-preview route with the runtime absent.
- Both final screenshots were visually inspected. The right header title/count
  and actions remain reachable at the minimum window, with no horizontal control
  clipping. This finite check is not blanket verification of every Canvas tool.
- Native r4 observed a connected, nonbusy retiring New Project form and submitted
  it once after explicit Create; catalog/SQLite/package retain exactly one
  Project. Earlier runs where that form was disconnected did not exercise this
  guard and are not counted as its proof.

Detected issues and controls:

1. Installed Valibot `tuple([])` silently discarded nonempty variant input.
   A real-schema negative test failed before the fix; `strictTuple([])` now
   rejects it without weakening the assertion.
2. Native r1 entered dimensions using Enter and created two actual Projects
   before the intended explicit Create. The fixture now authors both fields
   before one Create; the production closing-form guard prevents a late submit.
   Its original failure and duplicate package bytes are retained separately.
3. Native r2 found new Patch creation below the Raster neighbor. Creation now
   prepends the new layer; service and native assertions verify actual order.
4. Native r3 found the layer count wrapped apart from its title at 900×620.
   Local flex wrapping and title no-wrap keep the text together; native r4
   verifies actual Range lines rather than asserting a CSS declaration.
5. Final self-review found a delayed preset-get reply could open ordinary Apply
   after selection changed to Patch. The final native race check and fix are
   recorded below after execution.

Final checkpoint:

- `native-race-red/report.json`: the source-established preset race reproduced
  on the pre-fix built renderer after six prior checks: the actual normal-owner
  preset getter completed, its unchanged response was held, the UI selected
  Patch A, and release opened one forbidden Apply dialog (expected zero). Its
  failure screenshot was inspected. The original Main handler reference was
  restored and every owned native PID/start exited.
- Main's genuine getter/result remain unchanged; only reply timing is controlled.
  The prompt-only preset is genuinely created in isolated SQLite, with its API
  record/raw row retained. Renderer now invalidates opening/create epochs on
  normal↔Patch owner change and checks owner again after awaits, before Apply and
  on resource handoff. Normal Raster→Raster selection keeps the same owner.
- `native-race-green/report.json`: **17 named checks PASS**, including that exact
  delayed-response scenario and the neighboring normal-owner Apply→Cancel flow.
  Both preserve Project/draft/history and preset bytes. The complete two-Patch
  Save/reopen/actual crash recovery campaign is repeated on the fixed renderer.
  Both final screenshots (900×620 and 1440×900) were inspected; no page errors.
  Final source hashes equal startup hashes and the current source, and both
  crash/final physical exits are confirmed. No resource or ML inference is run.
- `typecheck-race-final.log`, `lint-race-final.log`, `build-race-final.log` all PASS
  on the final source; changed-file Prettier and `git diff --check` also pass.
  Prototype source was not changed, so no prototype UI execution is claimed.
  Existing Vite large-chunk warning remains a release/performance limit.
- Runs are sequential and bounded: tests/native actor 2 GiB/no swap; each native
  scope 2 GiB/no swap/300s with recorded actual limits and PID/start fences.
  Final native actor peak is 576.5 MiB; typecheck uses 4 GiB/2304-MiB JS heap
  (actual 1.6 GiB peak), lint 6 GiB/4096-MiB heap (actual 3.6 GiB), build 2 GiB
  (actual 1.1 GiB). Initial typecheck's automatically reduced 1-GiB JS heap
  aborted inside its bounded group; its diagnostic is retained, and corrected
  bounded reruns pass. No system-wide memory exhaustion or ML launch is used.
- `cleanup-report.json`: six exact isolated payloads removed only after recorded
  physical exits plus current PID/start and `/proc` command/maps/fd dependency
  checks. **67,346,432 allocated payload bytes (64.23 MiB)** disposed; this is
  measured payload allocation, not a claim about net system-wide free-space
  change. Compact reports/logs/screenshots, final saved/recovered `.igs`, actual
  RED/GREEN/restoration and initial duplicate-Create packages stay pinned.
  Historical cross-run evidence and the shared runtime/model pool are untouched.
  Cleanup is recorded separately; raw reports' historical fixture paths now
  describe disposed data rather than live environments.

## Verification limits and next owner

This is empty document foundation. No mask pixels, brush/lasso tools, inpaint,
accepted variants, outdated state, Regional Guidance or Patch preset projection
are qualified. Patch Generate and Apply/Save Current presets are explicitly
unavailable; Manage Presets remains usable. Normal Raster candidates still add
as Raster layers rather than silently changing destination with Patch selection.
The ordinary acceptance regression preserves an existing Patch through actual
Save/reopen, immutable accepted provenance and PNG assets; it uses the declared
candidate fixture and proves no new ML inference.

No new runtime/model/catalog is provisioned or copied. Save without a worker,
local crash recovery and same-machine reopen are tested; transfer across computers
and release compatibility are not. PP-007/008 remain «Пока не обещать». Next owner
is owned mask storage/authoring and Canvas tools, followed by Patch generation,
variants/staleness/comparison/presets and Regional Guidance.

Rerun the built-native foundation with a fresh absolute report path whose parent
exists beneath the artifact root:

```sh
pnpm run app:smoke:smart-patch --report-file /absolute/owned/evidence/report.json
```

The harness refuses reused reports, noncanonical/outside-root evidence parents,
and records source/bundle identities, actual cgroup limits and physical exits.
Apply the artifact-lifecycle inventory/cleanup rules before and after a run.
