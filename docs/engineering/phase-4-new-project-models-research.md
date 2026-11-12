# New Project exact-resource Models handoff

Base: clean `master` at `a5a9fa90a47201469075af7644c054d1ba37f0ac`.
The [Models entry contract](../features/model-manager.md#entry-points) and
[New Project customization](../features/presets.md#new-project-preset-customization)
require access to the same canonical Models manager from missing preset resources.
This consumer follows the completed Apply/active Preset Manager handoff. Accepted
comparison resource navigation is a separate remaining consumer: its aggregate
comparison rows currently carry no structured resource/side action identity.

Risk: medium UI orchestration/read-only projection. No Main/preload/schema,
Project Create/first-package writer, resource lifecycle, worker/queue or accepted
provenance changes. Existing structural Create validation remains authoritative;
missing resources are advisory and do not block explicit Create Project.

## Fresh InvokeAI basis and adaptation limits

Clean local InvokeAI revision `4875d96531ca6712b288f6e660fcbb34143408c1`
was read before implementation. Paths below are relative to
`invokeai/frontend/webv2/src/`:

- `features/models/ui/openModelManager.ts`, `ui/uiStore.ts`,
  `ui/components/ModelSelect.tsx`; callers `app/GenerationUiAdapter.tsx`,
  `app/WorkflowUiAdapter.tsx`: canonical Models navigation, seeded type/search;
- `features/models/data/modelsStore.ts`: backend-owned catalog and guarded current
  publication; existing Studio current-request finalizer is reused;
- `features/models/ui/ModelsUiContext.tsx` and its selection callers: account,
  origin location and Project guards prevent lazy navigation from crossing its
  owner. Reread before the return-interval background guard below;
- `features/generation/ui/GeneratePresetsPopover.tsx`: missing model key reports
  an error before applying settings; it has no Studio New Project roundtrip;
- `features/generation/core/resolveGenerateWidgetValues.ts`, production callers
  `app/GenerateWidgetSyncRuntime.tsx` → `features/generation/runtime.ts`: retain
  a runnable chosen missing model, with hash-based rematching/initial fallback;
- `workbench/launchpad/projects/NewProjectButton.tsx`: navigate to `/app` with
  `{new:true}`, without Studio's unsaved name/workspace/preset modal;
- `features/workflow/ui/library/WorkflowLibraryDetailPanel.tsx` and
  `WorkflowRequirementsList.tsx` → `features/workflow/core/modelRequirements.ts`:
  missing requirements can navigate to Models, but close the library and accept
  key/hash/name fallback.

The absence of a reusable unsaved Studio modal return was explained to the user
before implementation. Hash/name relinking and first-model fallback cannot meet
Studio's strict saved-reference contract and are not adopted. Adapt the existing
Studio Apply/Manager modal handoff and strict authoring projection; no new manager,
availability classifier, catalog store or persistence wrapper.

## Owners, invariants and finite acceptance

NewProjectPresetState retains its detached TXT source snapshot, current payload,
initial reset payload, Use mask and section revisions. The existing selected-only
projection now feeds the same resource rows used by Manager. It never parses
unfinished unrelated name/numeric fields. All LoRAs in a used section retain the
previous authoring availability policy, including disabled/signed rows. Unused
sections keep their values but contribute neither diagnostics nor Create payload.
Unknown catalog is explicitly distinct from known missing: known used refs remain
browseable, without claiming that every ref is missing.

`newProjectPresetModelRows` → copied exact focus `origin: 'new-project'` → existing
App tagged handoff → New Project `afterLeave` → Models → current catalog settlement
and Models `afterClose` → same New Project. A logical presentation epoch invalidates
true close/reopen; a stale request cannot reopen a new form. The existing current
catalog finalizer owns success/error/newer-read settlement. No new request wrapper.

Logical `show` remains true through suspension. Naive `displayDirective="show"`
retains editor DOM/raw inputs while presentation show releases its focus trap.
Title, workspace, captured Home placement, source/payload/Use, expansion, size/aspect,
raw validity, reset baselines and Create error keep their original owners. Hidden
Create is refused by the component and App. Global save shortcuts remain blocked
by the existing logical New Project modal guard. Only explicit Create writes a
Project; Models never writes a preset or selects a library Default.

During this New Project handoff the existing app shell is inert. Naive modals
teleport outside that shell, so Models stays interactive while chrome/Home/tabs
remain blocked through the otherwise exposed return interval. An ordinary Models
opener also cannot replace the pending New Project handoff. The source review
found that guarding only that opener left Presets/Queue/Home actions reachable;
central shell inertness covers those existing background surfaces without changing
their independent command policies or introducing another modal/queue owner.

Unresolved actions restore exact section/resource focus, including recreated nodes;
if repair removes an action, Project name is the focus fallback. Models labels the
temporary origin as New Project and retains complete expected identity for strict
SHA/provider/local binding checks. Existing Apply/Manager copy stays unchanged.

## Executed verification and limits

Authored eight new helper cases preserve the prior Apply/Manager matrix and cover
selected-only refs, edited refs, reset/source isolation, invalid unrelated fields,
unknown availability, strict SHA/family/default distinctions, disabled/signed
LoRAs, deduplication and proxy-compatible copied identity. ROOT executed **95
focused/new/neighbor tests PASS, zero failed/skipped**, including the real shared
Create parser and PresetService. Full TypeScript/Vue checks passed before and after
the final guards. Final `app:build` passed with the existing large-chunk advisory.
Full four-scope lint passed via the documented heap adapter; final harness scoped
lint also passed. No prototype sources/consumers or Python/worker code changed;
the old prototype matrix is not rerun as production persistence evidence.

ROOT executed final **native-r5: 14 PASS, two normal physical lifetimes, three
screenshots**, no page errors or Vue warnings. Actual built renderer/preload/Main,
catalog, files, SQLite presets/index and `.igs` first writer/reader remain real.
All eight catalog-only files/backups and all three captured Main catalog controls
restore exactly; no preset is changed. Five per-section resource actions include
both embedding sidecars. The same editor/raw/title/workspace/Use/expansion/reset
baseline survives Close/Escape, held and newer-read settlement and explicit
catalog error. Exact repair removes its diagnostic with Project-name focus;
nominal-ID/wrong-SHA remains unavailable without a Used badge or Default choice.

Actual background pointer input tries Models, Project menu, Queue, Saved generations
and Home New Project while the genuine return read remains held. The fixed shell
admits none; only current catalog settlement resumes the form. A typed completed
notification permits a newer actual Main reply and late old delivery does not
reset the draft. The notification is a controlled UI event, not real installation.
The existing Preset Manager neighbor retains its original copy/session/focus;
explicit Discard writes no preset. Cancel creates no Project or preset, and a true
New Project reopen resets the abandoned form.

Only explicit UI Create adds one new `.igs`/index record. Selected edited prompt,
model/VAE refs and 832×576 primary bbox are present; unchecked LoRAs/negative/
guidance and default-excluded Seed stay omitted, with random initial Seed and
clean history. Missing used refs still permit Create. Existing Home replacement
places the created Project first/active while preserving the dirty neighboring
Project inactive. That owned neighbor is explicitly discarded before ordinary
close. The second physical app lifetime reopens the new package through Main,
reads identical selected settings/references and closes normally. The neighboring
saved package and both source presets stay unchanged throughout this qualified run.

ROOT inspected final screenshots at 1440×900 and 900×620 with the local UI
checklist. Warning/action rows remain readable, the narrow form scrolls within its
modal and keeps Create/Cancel visible. Native interactions verify local focus,
scroll, raw-field and return behavior; this is not a full accessibility audit.
Tiny catalog-only files and genuine Main read holds/errors do not prove model
loading, installation, inference, release readiness or joint MVP acceptance.

## Intermediate attempts and regression control

Native r1 expected a Home tab after normal current-slot Open had replaced Home;
r2 used `Sampling` instead of the existing `Sampler & Scheduler` label. Both
stopped after fixture checks, were normally closed and remain harness failures.

Independent source review found the return-interval ownership gap above. R3 then
reached the actual held-catalog/repeated-Models consumer and reproduced New Project
over Models. Its cleanup tried to click the covered manager first, so normal close
was **not confirmed**. Original failure/closeError stay retained. A separate Root
recovery used the existing process-exit helper to confirm all recorded identities/
scopes gone, stop only their owned deadline timer and restore all eight exact tiny
files. No normal-close success is claimed for r3. Recovery made no process kill;
its first `tsx --eval` module-format error occurred before any fixture mutation.

After correcting only cleanup order to Cancel the actual topmost owned form,
**r4 reproduces the same real consumer RED after five checks**, then closes
normally and restores its exact catalog handler/files. R4 uses the exact retained
pre-guard build-r1 assets while live source already contains the pending guards;
it is an explicit old-bundle control, not coherent final qualification. Its harness
is byte-identical to final r5. R5 uses final build-r2 and passes the same background
input consumer plus the complete fourteen-check scope. `before-return-guard.json`
records old source/bundle continuity, and archives preserve both builds. No domain
semantic mutation or setup-error RED is claimed. Across attempts: five confirmed
normal physical lifetimes plus one separately confirmed failed-lifetime exit;
only r5's two lifetimes are qualified.

The independent review is a source finding; the small central correction is Root
self-review with actual RED/GREEN execution. Final independent retained-byte/source/
document inspection remains distinct from ROOT's tests and native execution.

## Resource lifecycle and negative scope

Run: `~/.codex/artifacts/imagegen-studio/runs/new-project-models/20261113`
(local 13 November; UTC starts on 12 November). Fresh inventory: root 29 GiB,
protected shared 17 GiB, runs 12 GiB, disk 62 GiB free; GPU 1,579 MiB used /
14,441 MiB free. No ML/SHARED payload access, runtime/weight copies or foreign
process changes. Checks use 4 GiB/600 seconds/zero swap; native launcher and owned
groups each use 2 GiB, 600-second controller/480-second app lifetimes. Full lint
uses the retained same-scope 3,072 MiB child-heap adapter with the unchanged parser
exclusion `scripts/qualify-installed-regional-init.mts`.

Retain source/patch/bundles, attempts, screenshots and all owned fixture bytes
before exact raw cleanup. Independent retained-byte READ_FINISHED, restoration,
fresh physical exit and empty dependencies precede deletion. Reconstruction uses
retained archives or fresh fixtures, never the removed previous-stage profiles.

One leftover Unix `SingletonSocket` in the fresh owned TMPDIR had zero allocated
bytes and no kernel socket record after all 51 observed process identities and
19 groups were gone. Its exact metadata/exit checks are retained before removal;
an idle endpoint has no regular payload to archive or reconstruct. No regular
fixture bytes were pruned before the complete source/payload retention audit.

Accepted Compare→Models, Deleted read-only resource browsing, hard Remove Local
Resource, exports, runtime/install/update/release, visual utility/capacity and
final compatibility/recovery/NoobAI/MVP acceptance remain separate. Public promise
statuses remain unchanged, including PP-001/005/006/007/008 «Пока не обещать».
