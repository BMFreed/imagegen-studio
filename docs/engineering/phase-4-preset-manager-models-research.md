# Preset Manager exact-resource Models handoff

Base: clean `master` at `6ffb35e13412ac93fa21e7c78c268926d34d3a73`.
The [Models entry contract](../features/model-manager.md#entry-points),
[Preset resource handling](../features/presets.md#missing-resources) and approved
Vue chrome require global Models navigation and missing-resource access from the
active Preset Manager draft. Project resource controls and Project Apply already
have their own completed checkpoints; they are neighboring consumers here.

Risk: medium UI orchestration and read-only authoring projections. No Main/preload,
storage/schema, worker/queue, install/repair/removal or resource identity policy
changes. The existing PresetManagerSession retains CRUD/dirty/close ownership.
Unavailable references remain saveable; browsing does not select a Default,
replace a reference, create a preset or write the Project.

## Fresh InvokeAI basis and limits

The clean local checkout was rechecked at
`4875d96531ca6712b288f6e660fcbb34143408c1` before implementation. Read current
implementation and callers (frontend paths relative to
`invokeai/frontend/webv2/src/`):

- `features/models/ui/openModelManager.ts`, `ui/uiStore.ts`,
  `ui/components/ModelSelect.tsx` → `app/GenerationUiAdapter.tsx` and
  `app/WorkflowUiAdapter.tsx`: seed type/search, then canonical Models navigation;
- `features/generation/ui/GeneratePresetsPopover.tsx`: resolve the preset model
  by catalog key, report missing and return;
- `features/workflow/ui/library/WorkflowLibraryDetailPanel.tsx`,
  `WorkflowRequirementsList.tsx` and `features/workflow/core/modelRequirements.ts`:
  requirements → Add Models → close the library; key/hash/name fallback matching;
- `workbench/launchpad/Launchpad.tsx`, `OpenProjectsControl.tsx`: Models belongs
  to the Launchpad, visited pages retain Activity state, workbench re-entry is
  separate;
- `features/models/data/modelsStore.ts`, `installsStore.ts`: authoritative
  current-owner catalog publication and refresh after completion events. These
  were reread before refining the catalog settlement boundary below.

Invoke supplies canonical Models navigation, seeding and retained manager state.
Its examined preset consumer has no unsaved Studio-style modal preset-editor
suspension/return. Its name/hash fallback cannot implement Studio's strict exact
identity promise. These limits were explained to the user before the adaptation.
Extend the already adapted Studio Apply handoff and strict authoring availability
owners; no independent manager, identity classifier or persistence wrapper.

## Owners and paths

Global `Models → Manage Models` follows the approved chrome and opens the one
App-owned ModelManager with ordinary browsing intent. Home/no-document and
Project presentation remain mounted; resource choice stays with the selector.

`PresetManager.state.draft` → existing authoring resource enumeration/availability
→ typed exact focus → existing App handoff → Models → current catalog settlement
and Models dismissal → the same Manager draft. All active create/edit intents
share this branch; Deleted read-only viewing and New Project handoff are outside
this slice. Project/Smart/result extraction is not recreated.

`presetResourceReferences` retains section association for model, VAE, every LoRA
(including disabled/signed rows), positive and negative embedding sidecars.
`presetUnavailableResources` projects the previous `presetNeedsAttention`
predicate; the boolean now delegates to it. Existing `savedModelAvailability`
owns kind/local IDs/SHA/provider IDs/family/file-state checks. This authoring policy
does not acquire Apply's blocking/dependency admission. It never parses unrelated
incomplete name/workflow/raw numbers. Unknown catalog state is not missing: its
warning can browse known authored refs without asserting unavailability.

The shared handoff helper retains the previous Apply signature/origin and stable
section/exact-resource action key. Manager focus uses `origin: 'preset-manager'`
with copied `expectedResource`; duplicate references have one action per section.
Model Manager uses draft-specific copy and the same exact readiness policy;
Apply wording and behavior are preserved.

App's existing transient handoff has tagged Apply/Manager owners. Apply keeps its
Project/document/Smart guards; Manager uses logical-open/presentation epoch and
does not inherit a current-Project requirement. Parent leave completes before
Models opens. Return requires both Models `afterClose` and the authoritative
current catalog read's finalizer. An obsolete promise cannot settle the handoff;
a newer completed-notification read may publish while an older response remains
held. Current errors settle as explicit unknown availability, preserving edits.
Full close invalidates the Manager epoch; late callbacks do not reopen it.

Manager logical `show`, session and editor key stay unchanged while suspended.
Naive `displayDirective="show"` retains controls/raw values and releases the
hidden modal's trap. Filters/sort/split widths/Included/expansion/source banner,
baseline/error and draft values remain with their current owners. Capture and
deferred Save shortcuts skip suspension. Native window close still reaches the
existing session save/discard/cancel guard. Model Manager uses the existing
app-overlay token. Its nested import uses that token plus one, remaining below
the owning dirty guard's dialog layer without depending on teleport insertion
order or Naive's global auto-incrementing z-index.

After enter, focus returns to the same exact-resource action or its replacement
node. If repair removes it, Close Preset Manager is the fallback. Only true
Manager dismissal emits its original App focus-return event.

## Verification and boundaries

Authored 13 new helper cases cover edited/unfinished drafts, all resource locations,
exact identity axes, default/wrong-SHA, unknown/empty/healed states, signed/disabled
LoRAs, deduplication, proxy-compatible copies and source/catalog nonmutation.
ROOT executed **82 focused/new/neighbor tests PASS, zero failed/skipped** across
editor/handoff/session, New Project, picker, shared Apply and real PresetService.
Tests prove their own boundaries, not new UI wiring. Full typecheck passed after
the final current-read refinement and again after the nested-layer correction.
Full build and four-scope lint passed before that correction; final app build
and changed-source ESLint passed after it. Build retains its existing large-chunk
advisory. No worker/Python code changed.
Prototype sources/consumers are unchanged; their old mock matrix is
not rerun as production persistence evidence.

The new native harness uses actual built App/Main/PresetService/SQLite/packages,
tiny owned catalog-only A/B files and real file-status reads. It covers global
Models, saved edit and detached source-create, retained DOM/raw/filter/layout,
valid-dirty Ctrl+S isolation, exact current refs and wrong-SHA refusal, delayed/
error/newer catalog reads, explicit Save and dirty native-close decisions, plus
one real existing Apply neighbor. Read holds/errors and typed completion are
explicit UI controls followed by genuine Main replies; they are not installation
or inference evidence. All captured handlers and withheld owned files must restore
exactly. Source/bytes/reviews/native execution/visual inspection stay separate.

Intermediate attempts remain evidence, not qualification: r1 failed before app
launch because fixture SQLite's parent directory was absent; r2 compared a
derived disabled filter class to a selected-state snapshot; r3 refused an older
screenshot destination; r4 sampled pane geometry during Naive's enter transition.
The harness now preserves selection separately, uses per-attempt screenshots and
waits for settled modal transform before geometry snapshots.

r5 reached 14 checks and exposed a real nested-import stacking defect. r6
reproduced it against the exact retained **pre-fix built assets**, after waiting
for the dirty guard's enter transform to settle: Model Manager 1000, nested import
2011, dirty guard 2000. The guard existed but could not receive input. Its source
tree already contained the pending layer fix, so r6 is explicitly an old-bundle
control, not a coherent final source/build qualification. Both attempts closed
normally with exact handler/file restoration. `before-layer-fix.json` retains
the old bundles/source and hashes; no semantic mutation is claimed.

ROOT independently executed final **native-r7: 16 PASS, two normal physical app
lifetimes, three screenshots**, zero page errors or Vue warnings. The retained
source and five built assets did not change during execution. Exact restoration
covered all eight catalog-only files and rollback copies, all three captured
catalog controls and both transparently observed preset-writer handlers. One
explicit UI Save Changes produced the sole observed preset write after fixture
creation. A real second app lifetime read it back; navigation and the discarded
source-create draft produced no record. The neighboring `.igs` package remained
byte-exact, including its saved prompt; the deliberately dirty live Project kept
its draft/history through navigation and was explicitly discarded before close.

The final settled dirty-close hit test observes manager 1000, nested import 1001,
guard 2000 and receives input in `Unsaved preset changes`. Cancel preserves the
actual window; explicit import/Models Close returns the same source-create editor,
then Discard Draft writes nothing. An unchanged-source old Apply roundtrip also
retains its selection, invalid excluded raw Steps and edited prompt with original
Apply copy/focus. Newer-read settlement and late-response controls prove this UI
boundary; the typed completion notification does not prove a real installation.

ROOT inspected the final global Models and invalid-draft diagnostics screenshots
at 1440×900 and exact missing-checkpoint Models at 900×620 using the local UI
checklist: actions/warnings remain visible, narrow panels stay inside the modal,
and the returned editor keeps its layout. Native interaction covers local focus,
Escape/Close, split drag and dirty-dialog behavior; this is neither a complete
accessibility audit nor model/inference qualification. Across all attempts there
were seven confirmed normal physical lifetimes; only r7's two are qualified.

Independent source review of the original seven implementation files and a
separate documentation/contract review returned CLEAN/READ_FINISHED. The later
one-prop nested-import layer correction was reviewed by ROOT and is covered by
the actual old-bundle RED/final native GREEN. Final archive/source/byte audit is
separate from these reviews and from ROOT's execution.

## Resource lifecycle and remaining scope

Run: `~/.codex/artifacts/imagegen-studio/runs/preset-manager-models/20261112`
(UTC run date; local work crosses into 13 November). Before heavy work: artifact
root 29 GiB (shared 17 GiB, runs 12 GiB), disk 62 GiB free, GPU 1,494 MiB used /
14,526 MiB free. No ML, SHARED use, worker/runtime/model-weight copy or foreign
process mutation. Serial checks use 4 GiB/600 seconds/zero swap; native launcher
and owned app groups each use 2 GiB, 600-second controller/480-second lifetimes.
Lint uses the retained same-scope 3,072 MiB child-heap adapter under 4 GiB and the
unchanged parser exclusion `scripts/qualify-installed-regional-init.mts`; this
does not claim the unmodified 2,048 MiB repository launcher passed.

Retain full source/staged patch, qualified bundles, all attempts, package/catalog/
preset bytes, screenshots and bounded reports. Exact raw paths are disposable only
after independent byte audit READ_FINISHED, restoration, physical exit and empty
dependencies. Final lifecycle/delivery reports record cleanup and live Git equality;
reconstruction uses archives or a fresh run, never an old raw `--resume`.

New Project and accepted-result missing-resource contexts, safe hard Remove Local
Resource, full exports, runtime/install/update/release delivery, visual utility/
capacity and final compatibility/recovery/NoobAI/MVP acceptance remain separate.
PP-001/005/006/007/008 remain **«Пока не обещать»**.
