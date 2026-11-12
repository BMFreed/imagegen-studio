# Home workspace actions and model availability notice

Base: clean `master` at `63a8873f8bc0672bb35d4f3e4535a577ace6bd50`.
The current [Home contract](../features/home-screen.md) and approved Vue prototype
still required concrete-workspace header options, sidebar Rescan/Remove and the
no-generation-model notice. Existing Settings, unregister, catalog, scanner,
filename, selection, opening, preview and Trash owners are already implemented;
this slice connects their remaining Home entry points.

Risk: medium UI orchestration. No Main/preload/shared API, schema, filesystem
admission, unregister decision or resource lifecycle changes. The direct Remove
shortcut reaches the same explicit confirmation and Main guards as Settings;
it cannot remove files or bypass the existing open/pending/default checks.

## Fresh source and adaptation

Read current clean InvokeAI revision
`4875d96531ca6712b288f6e660fcbb34143408c1`, including implementation and callers:

- `invokeai/frontend/webv2/src/features/models/data/modelsStore.ts`, `api.ts`
  and `installsStore.ts`: authoritative shared catalog, loading/error distinction,
  stale-scope protection and completed-install refresh;
- `features/models/ui/components/ModelSelect.tsx`, `ui/openModelManager.ts`,
  `features/generation/ui/GenerateWidgetView.tsx` and
  `features/models/core/library.ts`: load on use, supported selection candidates,
  separate catalog status/error and canonical manager navigation;
- `invokeai/app/api/routers/model_manager.py:list_model_records`;
- `invokeai/frontend/webv2/src/workbench/projects/library.ts`, `api.ts` →
  `invokeai/app/api/routers/projects.py:list_projects` →
  `invokeai/app/services/project_records/project_records_default.py:list` and
  `services/shared/database/queries/projects.py`: authoritative relist with
  current-owner/error handling.

Invoke's DB/JSON projects have no folder-backed workspace Rescan/unregister.
This absence and reason were reported before implementation. Studio already has
the adapted scanner and guarded unregister; both remain unchanged. Notably,
`ProjectService.listWorkspaces()` scans every registered available folder, so
the existing Home refresh already covers the workspace owning the menu, even
when another browse scope is selected. A parallel target scanner is unnecessary.

The catalog consumer adapts Invoke's status-aware library reads and supported
candidate checks using existing Studio `refreshModelCatalog`, `checkpointCatalog`
and `selectableVersion`. It does not invent another catalog or infer readiness
from the raw number of installed auxiliary resources.

## Paths and invariants

Selected workspace header `Workspace options` → existing Settings modal.
Aggregate Projects/Trash do not receive this context action. Sidebar Rescan →
existing refresh; sidebar Remove → current registered ID → existing confirmation
→ existing `removeWorkspace` Main command. Default has no Remove entry. Busy and
stale menu selections refuse before dispatch. Rescan preserves scope/selection;
confirmed unregister retains its existing successful switch to Uncategorized.

Home model notice reads the one App-owned catalog. Before successful load, during
loading or after error the presence is unknown (`null`), never false. A settled
catalog with no ready supported checkpoint shows the exact prototype notice and
`Manage Models`; auxiliary-only, missing/corrupt and unsupported-family versions
do not count. A catalog error shows `Model catalog unavailable` with a retry/
Models direction instead of falsely claiming an empty library. Catalog presence
does not promise compatible inference, runtime installation or model selection.

Fresh reads occur at initial Home, return to Home, manual Refresh/Rescan, Models
close even without an active Project, and completed install notifications. The
existing request counter prevents old replies/errors from replacing newer reads.
The existing Project Apply suspended handoff branch is retained. Models browsing
does not create/select/install resources, write Project settings or affect history.
Create/Import/Open stay available when there is no model.

## Verification plan and boundaries

Focused existing Main/workspace/preload, model-picker, manager read/job ordering
and preset handoff tests are neighboring regression checks; they do not prove new
UI wiring. Typecheck, production build and all lint scopes are required. A runtime
tooltip finding below expands verification to the shared prototype component.

The authored built-app harness uses owned real Main/SQLite/catalog/package/scanner
consumers, normal physical close and bounded screenshots. Catalog fixtures contain
small hash-verified files published by the existing repository while Main is closed;
they prove catalog presence only, with no ML parsing/loading or compatibility claim.
A unique closed package added to the owned folder while idle is a controlled
external addition for actual Rescan. Explicit unregister must preserve its folder
and exact package bytes. Picker callbacks, read hold/reject and typed completion
notification controls are restored and distinguished from actual downloads or
installation. No fabricated workspace/model list is production persistence proof.

Independent source review of the two production files is CLEAN / READ_FINISHED;
it did not execute tests, build, app or visuals. Actual executions and retention
audit are recorded only when completed. Plausible wrong empty-catalog inference,
auxiliary-only presence, missed Home freshness and wrong workspace action targets
are opposed by finite real-consumer controls, not by a repeated inference matrix.
That independent review covers App/HomeView; the later small shared tooltip fix
has ROOT self-review and the baseline regression/full prototype/native checks.

Executed ROOT checks so far: **76 existing neighboring tests PASS, zero
failed/skipped**, across workspace management/scanning/preload/destination,
model-picker, manager read/job ordering and preset Models handoff. These are
regressions, not new UI acceptance tests. Full `pnpm run typecheck` and
`pnpm run app:build` passed; the existing large-chunk build warning remains.

### Runtime tooltip finding

First native attempt `native-r1` completed one check, then the focused Add Workspace
tooltip intercepted the neighboring workspace menu after the modal closed. Its
report/screenshot, exact old bundles and harness source are retained; the app
physically closed normally and restored the picker. This is a reachable existing
UI defect, not semantic RED for the new catalog/scanner behavior.

The shared `IconButton` tooltip contains text only. Naive's public portal style
attribute now makes this tooltip pass pointer events through to neighboring
actions; focus/hover/disabled visibility and Escape remain unchanged. This single
library API style is needed on the portaled body, not an inline layout/color rule.
The installed Naive `Tooltip.mjs` → `Popover.mjs` → `PopoverBody.mjs` forwards
attrs to that body. No global popover behavior or interactive menu is changed.

A new interaction regression places a neighboring button under the actual focused
tooltip and clicks normally. Before the fix it reached that consumer and failed
specifically because tooltip content intercepted pointer events; trace/screenshot
are retained. This is a baseline regression RED, not an isolated source mutation.
The required full prototype run uses exactly two workers, separate from actual
Main/native evidence. Final typing/build/lint must cover this expanded source.

The full prototype run subsequently passed **275 scenarios**, including the new
regression. Final typecheck/build passed after the shared component change, and
scoped lint covered all final changed executable sources after the four-partition
lint pass. `native-r2` then reached five checks, including real Rescan and Models
close, before an authored test-control error: Electron application's `evaluate`
passes its module first and the supplied value second. The read mode accidentally
received that module instead of `hold`. Its two lifetimes closed normally with
exact handler restoration. The corrected harness uses both arguments and validates
the finite control values. This excluded setup failure is not a semantic RED.

### Final built-app checkpoint

ROOT `native-r3` passed **11 checks / three normal physical lifetimes / three
1440×900 screenshots**, zero page errors/Vue warnings. Actual empty and auxiliary-only
catalogs show the notice; the actual ready supported checkpoint hides it. This is
catalog/file status evidence from tiny owned fixtures, not trained-model parsing,
loading or inference. The typed completion notification proves UI refresh to a real
Main reply, not an actual install/download. Controlled loading/current error/stale
error cases retain their separate labels and exact original-handler restoration.

Header options/Settings and default menu were exercised. Actual Rescan published
the externally added package in UI before any diagnostic list could itself scan,
retaining original selection, identity/revision/lastOpened and bytes. Direct Remove
Cancel preserved exact rows/files; confirmed existing Main unregister kept folder
and both original packages while removing only registry/index owners and selecting
Uncategorized. No Project was implicitly opened or saved. ROOT viewed all three
final screenshots (missing-model guidance, catalog error action and confirmation).
This local visual self-review is separate from source and retained-byte audit.

The two excluded native attempts retain **six partial checks / three normal
lifetimes** in total; they are not added to the qualified 11/3 checkpoint. All six
raw native lifetimes, all callback restoration and all inputs remain in retention.
No isolated semantic mutation was performed or claimed; the before-fix tooltip
regression and subsequent full-suite GREEN are preserved separately.

## Resources and remaining scope

New run: `~/.codex/artifacts/imagegen-studio/runs/home-maintenance/20261112`.
Before heavy work: root 29 GiB (shared 17 GiB, runs 12 GiB), disk 62 GiB free;
GPU 8,014 MiB used / 8,006 MiB free. No ML, SHARED access or runtime/model copy;
foreign processes are protected. Serial checks use 4 GiB/600 seconds/zero swap;
native launcher and owned app groups each use 2 GiB with bounded deadlines.
Full lint uses the retained same-scope artifact-only 3,072 MiB child-heap adapter
under 4 GiB, with only unchanged `qualify-installed-regional-init.mts` excluded;
this does not claim success of the unmodified 2,048 MiB launcher.

Retain full source, qualified bundles, payloads, reports and screenshots. Cleanup
is limited to exact owned raw profiles/temp paths after independent byte audit,
READ_FINISHED, callback/fixture restoration, physical exit and empty dependencies.
Reconstruction uses retained archives or a fresh report path, never a removed raw
profile. Final lifecycle and delivery reports record actual cleanup and live Git
remote equality separately.

Broader Home compatibility/capacity and joint acceptance remain distinct. Remaining
material MVP blocks are Model Manager menu/missing-resource/Preset/New Project
contexts and guarded hard removal, full image exports, release runtime/install/
update delivery, visual model utility/capacity and final compatibility/recovery/
NoobAI/MVP acceptance. PP-001/005/007/008 remain **«Пока не обещать»**.
