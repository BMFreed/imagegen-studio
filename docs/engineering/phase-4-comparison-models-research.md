# Accepted Compare exact-resource Models handoff

Base: clean `master` at `1bf4a92a602f5c85b29abd36d2fe4df3777b6751`.
The [Models entry contract](../features/model-manager.md#entry-points) requires
missing accepted-resource navigation. The
[read-only comparison contract](../features/project/generate-mode/generation-provenance.md#compare-generation-settings)
owns Generated with versus Current Canvas, shared Raster/active Smart/converted
Smart behavior and the explicit exclusion of Apply/Recall/Restore.

Risk: medium read-only projection and UI orchestration. No provenance/schema,
storage/IPC/read authority, worker/queue, acceptance or resource lifecycle change.
Accepted fixture setup for native checks is explicitly not Add/inference evidence.
Exact references never relink by name, hash fallback or library Default.

## Fresh InvokeAI basis and limits

The clean local checkout `4875d96531ca6712b288f6e660fcbb34143408c1`
was read before implementation. Paths below are relative to
`invokeai/frontend/webv2/src/`:

- `workbench/widgets/preview/previewMetadata.ts`, `PreviewMetadataPanel.tsx`,
  callers `PreviewDetailsPanel.tsx`/`PreviewHeaderActions.tsx`: current read-only
  metadata display/copy and selected recall; model metadata rows have no Models
  navigation. No Studio two-sided accepted-versus-Canvas settings comparison;
- `features/models/ui/ModelsUiContext.tsx` `useOpenModelInManager`,
  `ui/uiStore.ts` `openModelDetail`; callers `app/GenerationUiAdapter.tsx` →
  `features/generation/ui/shared/ConceptRow.tsx`: exact key details navigation,
  with account, origin location and active Project rechecked after lazy loading;
- `features/models/ui/openModelManager.ts`, `data/modelsStore.ts`: canonical
  Models route and authoritative catalog publication remain separate from choice;
- `workbench/image-actions/recordedModel.ts`, callers `imageRecall.ts`: key-first,
  then hash/name fallback under caller policies. This is weaker than Studio's full
  local/portable tuple and must not replace its comparison availability owner.

The lack of a reusable two-sided Compare/retained return mechanism and weaker
fallback policy were explained before adaptation. Reuse the existing Studio
comparison projection/reader and App tagged Models handoff; do not introduce a
second classifier, manager, catalog, acceptance wrapper or persistence owner.

## Typed resource projection

The existing row type gains optional `resourceActions` with full detached exact
resource, side, availability and stable key. Targets are projected next to the
existing availability calls, never parsed from rendered labels. The unchanged
exact resolver is exported as `exactBoundComparisonVersion` and reused by Models
for this origin. Ordinary Project and preset authoring policies remain unchanged.

Only `model.resource`, `loras.stack`, `vae.resource`, `prompt.embeddings` and
`negativePrompt.embeddings` own actions. Known missing catalogs include only
the exact missing side/ref; unknown catalogs may browse known refs on each side
without calling them confirmed missing. Same labels or portable equality do not
collapse independent local bindings. One exact action per row/side/resource;
configured text/order, signed weights and duplicate occurrences remain displayed.

Existing enabled-only LoRA availability is preserved. Legacy omitted fields,
Embedded VAE, inactive/dormant unsupported values and Anima companion byte/hash
rows do not fabricate registry refs. Scalar/noise/prediction rows have no duplicate
actions. Regional/source/execution context remains excluded from both sides.

## Ownership and presentation

The same `captureGenerationComparisonSource` and `GenerationComparisonReader`
read Raster, active Smart and converted Smart data. Current Canvas remains the
Project generation draft, never the selected Patch draft. Source, document/revision,
accepted asset SHA, selected entity and monotonic comparison epoch bind a visit.
The transient renderer request has a unique Symbol plus current/resume/cancel
callbacks; it never crosses IPC or enters provenance. Close/reopen, disposal,
revision/edit-Undo, active variant/asset/composition change, selection or pending
draft/busy/reload invalidation cancels the old return.

Logical Compare stays open while a separate presentation ID hides its popover.
Outside/leave callbacks caused by that suspension cannot clear the logical owner.
The existing row/surface interface forwards Naive's typed `internalOnAfterLeave`
to complete suspension before Models opens. Installed Naive 2.44.1 has no public
NPopover afterLeave prop; its declaration and actual body callback were checked.
No animation/display behavior changes for ordinary dismissal. This version-specific
UI API requires the prototype/native checks below.

App's existing handoff now tags the comparison owner. Models dismissal plus the
current catalog request finalizer precede guarded return; a stale/older read cannot
reopen it. The app shell remains inert through the visit and headless return
interval, while teleported Models remains interactive. The existing global modal,
Project draft and close guards remain with App and ProjectView.
The App window shortcut owner also refuses Save/Undo/Redo throughout this visit:
DOM inertness alone does not fence a window-level key listener in the headless
return interval. Actual keyboard input is included with the held-read control.

Show unchanged settings and scroll position are retained explicitly across popover
remount. Focus returns to the same action or Compare Close after exact repair
removes it. Model Manager labels Generated with versus Current Canvas, checks the
same full expected identity and states that saved result/current settings remain
unchanged. Repair stays in Models; replacement stays in Project controls. No
Apply/Recall/Restore, preset creation, history step, Save or active-member change
is caused by browsing.

## Executed verification and boundaries

Authored projection cases cover both sides and multi-reference rows, strict tuple
axes, unknown catalogs, disabled/signed LoRA rules, legacy/Embedded/Anima exclusions,
copy isolation and ordinary/Smart equivalence. ROOT executes the tests separately
from authoring. Existing reader/source tests cover stale replies and owner ABA;
actual UI ownership/invalidation is verified through the built app.

ROOT executed 131 distinct focused cases (0 failures/skips): comparison projection
and both families, Smart comparison, new exact-resource cases, source/reader,
existing preset return and Project picker neighbors, and Main Smart comparison
read authority. The new 12 cases were rerun after a fixture-only TypeScript
narrowing fix, all PASS; they are included in 131, not added to that count.
Final `typecheck-r5`, `build-r2` and full four-scope `lint-r1` PASS, followed by
scoped final source and harness lint. The build retains its existing large-chunk
advisory. Earlier typing failures (dataset index access and new fixture narrowing)
and `build-r1`'s duplicate Vue conditional key were corrected before qualification.
They are not successful runtime evidence.

`GenerationSettingsComparison` is also imported by the Vue prototype. It keeps
Models actions behind a production capability prop; prototype navigation remains
a separate mock gap. ROOT ran complete `prototype:test --workers=2`: 275 PASS,
zero swap, under the 4 GiB envelope. No shared prototype consumer changed after
that run. Production native checks use owned portable accepted
fixtures and actual renderer/preload/Main/SQLite/catalog/files/package readers,
cover all three owner shapes, both resource sides, delayed/error/newer catalog
settlement, stale owner invalidation and normal close/reopen. These do not rerun
the old full inference/acceptance/family matrix.

Final `native-r4`: 16 checks PASS in 43.947 seconds, two normally closed physical
Electron lifetimes, all observed identities/scopes gone, zero page/Vue errors.
The actual layer menu reads strict original Main data for ordinary Raster, active
Smart and converted Smart. Both exact checkpoint sides and LoRA/external VAE/
positive and negative TI actions reach Models. Project Steps 17, selected Patch
67 and accepted 4 are kept distinct. Wrong-SHA ready/default A never substitutes
for its recorded reference. Exact B repair removes only the repaired-side action
and returns focus to Compare Close; it changes no Project/result setting.

Held, newer and rejected catalog controls exercise the real current-read finalizer;
actual background clicks and Save/Undo/Redo keys remain fenced during the gap.
Original Main active-member and revision edit/Undo responses are explicitly
published through the existing typed `projects:tabs-changed` event: direct harness
IPC bypasses App's ordinary response caller. These are declared external controls,
not evidence that the user can edit through an open modal. Source cancellation is
observed before Models closes. Empty-tab publication disposes the old ProjectView;
reopening the same saved revision under a new owner and then releasing the held
reply cannot revive its Compare. A second physical lifetime repeats negative-TI
navigation from the same saved package.

All four attempts and frozen harness sources are retained separately. `native-r1`
and `r2` each passed the first four checks, then failed a harness camera assertion
after its explicit screenshot resize. Narrowing can clamp pane widths and recenter
screen pan even after outer-size restoration. Final harness verifies every
document/SQL/history/pixel/selection/mutation witness and scale exactly, then
declares a new pan baseline only at its three explicit resize steps. At a fixed
viewport, navigation still compares the complete raw camera exactly. `native-r3`
passed 12 checks, then its direct Main control never reached the renderer; the
typed publication above corrected the test. No production fix or semantic RED is
claimed for these test failures. Each failed attempt closed normally and restored
handlers and fixture bytes; four attempts contain five normal physical lifetimes.

ROOT opened all three final screenshots under `ui-audit`: 1440×900 ordinary Compare,
900×620 Models and converted Compare. Columns, warning, actions, footer/scroll and
modal bounds are usable in these states; no material local finding. Native checks
also exercise scroll, retained focus, Escape, reopen and resize. This is bounded
self-review, not a full accessibility audit. The previous Smart comparison harness
has three selectors updated for the added per-side wrapper; its old large matrix
was not rerun or relabeled as new evidence.

Independent implementation source review found one missing side caption in the
missing-ID/version Models warning. ROOT added the side to both branches before
final typing/build/native. Source review and the final retained-byte audit are
separate from ROOT's actual runs. The final native records all 31 source and five
bundle hashes, four exact B-file restorations (eight A/B files verified), all four
catalog probes restored with zero in-flight calls, and package/SQLite witnesses.

## Lifecycle and remaining scope

Run: `~/.codex/artifacts/imagegen-studio/runs/comparison-models/20261113`.
Fresh inventory: root 29 GiB, protected shared 17 GiB, runs 12 GiB, disk 62 GiB
free; GPU 1,562 MiB used / 14,458 MiB free. No ML/SHARED payload access, runtime/
weight copies or foreign process changes. Checks use 4 GiB/600 seconds/zero swap;
native launcher and owned groups use 2 GiB each, 600-second controller and
480-second lifetimes. Full lint uses the retained same-scope child heap 3,072 MiB
adapter and unchanged parser exclusion `scripts/qualify-installed-regional-init.mts`.

All source/patch/bundles/attempts and owned fixture bytes are retained before exact
raw cleanup. Independent READ_FINISHED, restoration, fresh process/scope exit and
empty dependencies precede deletion. `qualification-summary.json`, source/payload/
bundle manifests, the independent `final-retained-audit.json`, lifecycle, release
gates and post-push `commit-proof.json` in the run are the final evidence index.
Removed previous-stage profiles are never resumed.
Deleted-preset read-only browsing, hard Remove, exports, runtime/install/update/
release delivery, visual utility/capacity and final compatibility/NoobAI/MVP
acceptance remain separate. PP-001/005/006/007/008 remain «Пока не обещать».
