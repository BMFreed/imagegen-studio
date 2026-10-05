# Phase 2C: Project resource handoff to Model Manager

## Expected result and risk

Project checkpoint, LoRA and VAE controls open Model Manager in the matching
resource category. An existing selection also focuses its exact local resource
and version, including missing-resource diagnostics. Closing the overlay returns
to the same Project and refreshes its catalog; choosing a resource remains an
explicit action in the Project selectors.

Risk: **medium**, covering shared renderer navigation and catalog projections.
The authority remains [PP-004](../product-promises.md) and the
[managed model library contract](../contracts/managed-model-library.md).
The [Phase 2C roadmap](../specs/01-implementation-roadmap.md) explicitly leaves
the reverse handoff and other resource selectors open. Existing Main selection,
history, persistence and generation owners retain their boundaries.

## Baseline: `cfd16ce3022f8a456eb212c2703a81027b604a84`

- [ProjectView](../../src/renderer/components/ProjectView.vue) sends checkpoint
  `manageModels` with exact local IDs/names, or `null` when no checkpoint exists.
- [ProjectVaePicker](../../src/renderer/components/ProjectVaePicker.vue) uses the
  same exact-focus-or-null shape. Embedded VAE therefore supplies no browse kind.
- [ProjectLoraStack](../../src/renderer/components/ProjectLoraStack.vue) exposes
  add/change/relink/remove events, but has no manager entry.
- [ModelManagerFocus](../../src/renderer/components/model-manager-focus.ts)
  contains resource/version IDs and display names; it carries no resource type.
  [ModelManager](../../src/renderer/components/ModelManager.vue) resets exact
  focus to `All`; a null request retains previous filters. Empty checkpoint/VAE
  entry consequently cannot request its own resource category.
- [App](../../src/renderer/App.vue) already owns the overlay. On close with an
  active Project, its watcher calls the real `models.getCatalog()` API through
  `refreshModelCatalog()`, guarded against late responses. This existing return
  path needs verification, rather than a second catalog owner.
- Existing embedding manager actions share this focus contract and are a
  neighboring caller to preserve when its type changes.

## Request and data path

Use a typed **renderer-only** open request that separates browse intent from
optional exact focus: resource type plus a nullable focus object containing local
resource/version IDs and names. An empty selection still sends its resource type.
Home retains the general library entry; no new IPC payload or stored Project
field is needed.

```text
Project checkpoint / LoRA / VAE control
→ typed resource browse request, optional exact local focus
→ App-owned Model Manager overlay
→ category filter + exact resource/version focus or missing diagnostic
→ Close Model Manager
→ existing Main-owned catalog read
→ refreshed Project selectors
→ user explicitly chooses an exact resource through its existing handler
```

Each Project entry clears incompatible previous manager search/status/family
filters and selects the requested resource category. Exact focus must remain
visible independently of library Default; a missing resource/version retains
the diagnostic and never substitutes another version. Reopening the overlay
applies the new synchronous browse request instead of previous category/search
state. This slice does not claim delayed-response fencing of Model Manager’s
existing catalog loader; App’s Project return refresh already has its own
request guard.

Browsing, changing library Default and closing the manager must preserve the
Project's exact checkpoint/VAE references, LoRA stack and embedding sidecars.
They must not change Project draft/history, dirty state, seed cursor or saved
`.igs` bytes. Catalog availability and selector options can change after refresh;
newly installed/default resources must never be selected automatically.
The original selection commands remain the only resource-choice boundary.

## Verification and evidence boundary

- Native helper checks empty browse requests, exact focus, category routing
  and fresh requests after different prior manager filters. Full typecheck
  checks the shared request across all renderer callers.
- Native Electron coverage enters through the actual Project controls, built
  renderer/preload/Main and real SQLite catalog. Check checkpoint and Embedded
  VAE entries, the new LoRA entry, existing exact selections and missing exact files. The full desktop smoke
  separately exercises an absent checkpoint resource ID.
- The native collaborator verifies a real library Default/catalog change,
  closes the overlay, observes refreshed Project options and compares exact
  draft/dirty/bbox/seed/file state. Real Undo/Redo must still address the
  last authored prompt edit after manager roundtrips; initial exact selections
  use the existing Main handlers through Project selectors.
- Neighboring controls include Home's general manager entry, embedding focus,
  prior-filter reset, exact-version badges, and returning to the same Project.
- Required checks after implementation: `pnpm run typecheck`, appropriate
  focused tests, lint and the native handoff smoke. Prototype UI changes, if any,
  additionally require `pnpm run prototype:test`.

Native fixtures may prepare catalog bytes and control inventory changes. They
do not prove CivitAI download, repair, ML compatibility or trained generation.

### Executed evidence

Baseline built bundle `cfd16ce` failed three independent native assertions:
empty checkpoint opened All, Embedded VAE opened All, and Manage LoRAs was
absent. Two existing close/Escape controls still preserved focus and Project
state. The corrected baseline report is `red-corrected/report.json`; the first
baseline attempt had a checkpoint locator typo and is not counted as evidence.

The first updated build passed 20 native assertions and failed the saved
embedding return-focus assertion. Closing starts the existing catalog refresh;
`checking` temporarily removed the Manage action despite its known saved ref.
Keeping that trigger mounted when a saved ref exists fixed the reproduced
failure without another focus owner or a second catalog refresh.

Fresh enhanced native GREEN passed **23 checks**, zero page errors, including:

- Home’s general entry, empty category requests and stale filter reset;
- exact checkpoint/LoRA/VAE/embedding versions, distinct from actual library
  Default changes; selected-version badges and detail metadata remain exact;
- close button and Escape return, dirty authored inputs, stable embedding
  trigger, real Undo/Redo of the last authored prompt;
- restored exact VAE/embedding file availability and refreshed Installed/Default
  picker labels; no automatic replacement of saved selections;
- unchanged saved `.igs` bytes during manager navigation, genuine Save/readback
  and Project close/reopen;
- LoRA controls/row action geometry and inspected screenshots at 1380×900 and
  900×620. The new actions use existing secondary text/compact icon primitives.

Artifacts are retained under
`/home/user/.codex/artifacts/imagegen-studio/model-resource-handoff-2026-10-06/`.
Intermediate `green/report.json` retains the focus regression; `green-2` records
its 23-check resolution. `final-green-3/report.json` first recorded **24/24 passed**, zero page errors
and 12 screenshots, including restoration of the original empty draft and
clean/empty Undo/Redo. The final isolated integration passed the same 24 checks
in `isolated-final-green/report.json`, with package/script/bundle SHA-256.
Root inspected its normal and narrow LoRA screenshots too. Baseline and enhanced GREEN helper hashes differ: only their
common empty-entry assertions establish the original three regressions.

Root inspected actual native screenshots; a collaborator reviewed source and
harness after reading implementation. This is implementation review/self-review,
not a blind independent product audit. PP-004’s body and matrix are updated
without changing its public **Пока не обещать** status.

Commands completed for the final source tree:

- `pnpm run typecheck`: prototype and production Vue/TS passed.
- `pnpm run app:test`: **1595/1595 passed**, zero failed/cancelled/skipped.
- `pnpm run lint`: passed; changed files also pass Prettier and `git diff --check`.
- `pnpm run app:smoke:handoff` (fresh build plus isolated flagged desktop run):
  **24/24 passed** against native renderer/preload/Main/SQLite, zero page errors.

The first shared smoke attempt ran the helper inside the existing desktop
scenario before its first-focus prompt-hint test. The helper consumed the
one-time hint, so that old test correctly failed. The failure is retained as
`app-smoke-failed-hint-contamination.log`. Final integration gives the handoff
its own app/data-root invocation; normal desktop catalog and session preferences
retain their original fixture. `app:smoke:handoff` also runs it directly. No
production hint/preference behavior was changed to satisfy the harness.
The revised exact `pnpm run app:smoke` finished **exit 0**, including fresh build
and **all eleven native invocations**: desktop, isolated resource handoff,
generation results, Generate/queue actions, accepted history, Illustrious and
Anima comparison, VAE, embeddings, Anima authoring and Anima queue. Final run log
is `app-smoke-final.log`; `full-suite-summary.json` lists each invocation and
report. `full-final/handoff/report.json` passed 24/24 on the shared build and its
package/script/bundle fingerprints still match the final tree. Typecheck,
1595-test and lint logs are retained alongside the native evidence.
No prototype components were changed; their existing generic Manage Models mock
event does not qualify this production typed handoff. The native suite uses
controlled catalogs/workers and adds no new trained inference qualification.

Known evidence limits: the no-generation fixture observes a null operational
seed cursor, not crash/reuse after a completed seed. Missing local version IDs
and delayed responses to Model Manager’s existing unguarded loader are not
qualified by this helper. The latter remains an existing follow-up risk; the
new synchronous category/focus request and App’s guarded return catalog refresh
are separate owners. Preset entry/Apply, installed thumbnails and full Phase 2C
pipeline/release qualification remain open.

Follow-up: [Model Manager read ordering](./phase-2c-model-manager-read-research.md)
now qualifies the loader's separate presentation-read boundary with real
delayed Main replies, errors, loading ownership and observed job/list merging.
The historical counts and evidence above remain those of the handoff slice;
missing version IDs and the other named gaps remain open.

## Remaining conditioning split

Normal alpha-derived outpaint can build on the current frozen RGBA target and
finite primary bbox without introducing a live mask layer. Full Regional
Guidance and Smart Patch require owned masks/document assets and remain Phase 4
work under their [regional](../features/project/generate-mode/regional-guidance.md)
and [Smart Patch](../features/project/generate-mode/smart-patch-layer.md) contracts.
Public outpaint activation needs a concrete operational infill/coherence and
preservation contract, durable frozen inputs and family-specific masked
execution. Adopting Invoke's LaMa default also requires delivery of its auxiliary
weights; merely removing the current outpaint refusal does not supply that
pipeline. The [compositing contract](../features/project/generate-mode/smart-patch-compositing.md)
currently lists MVP candidates rather than a selected complete policy.
