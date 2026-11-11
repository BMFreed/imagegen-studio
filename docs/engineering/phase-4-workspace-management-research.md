# Production workspace metadata management

High risk: authenticated Main IPC, metadata transaction and removal of derived
Home rows. Baseline clean master `759df06183e1aa8b51576ec2baca26d10d3aa4cd`.
[Home contract](../features/home-screen.md#workspace-sidebar), PP-001/007 and
[previous catalog stage](./phase-4-home-workspaces-research.md) define the scope.
Public promise status is unchanged. This stage adds name/color settings and
confirmed unregister. Project rename/move, Trash, folder relink/reveal, tab markers,
remaining Home/Models/export/release and visual-generation gates remain open.

## Fresh source and adaptation

Invoke checkout clean at `4875d96531ca6712b288f6e660fcbb34143408c1`.
Read current implementation AND callers before editing:

- `invokeai/app/api/routers/projects.py:update_project/delete_project` →
  `invokeai/app/services/project_records/project_records_default.py:update/delete`
  → `invokeai/app/services/shared/database/queries/projects.py`.
- `invokeai/app/api/routers/boards.py:update_board/delete_board` →
  `invokeai/app/services/boards/boards_default.py` →
  `invokeai/app/services/board_records/board_records_default.py:update/delete`
  → `invokeai/app/services/shared/database/queries/boards.py`.
- `invokeai/app/services/shared/database/queries/locks.py`, `database.py` and
  `board_records/board_records_common.py` supply shared guard/write transaction,
  lock ordering, row readback, and the bounded300-character named-record pattern.

Invoke metadata deletion preserves media files. Its folder-backed `.igs` registry
and live document-tab block do not exist. This absence was reported before
implementation. Adapt existing Studio repository and path-lock owners, using
Invoke's transactional guard/mutation pattern; no new queue or filesystem mover.

## Path, invariants and failure cases

Home row menu → Settings draft → preload → validated Main caller → service →
repository transaction → saved row → guarded catalog/Home refresh. Update reuses
the existing bounded metadata input; folder path is read-only. Uncat accepts color
changes while its name is immutable and registration is never removable. Duplicate
normalized names exclude the updated row itself. Missing/readonly folders remain
manageable because metadata writes do not require access to their files.

Remove requires explicit confirmation in UI and `confirmed:true` at Main. It
refuses any live Project coordinator under that workspace, including clean and
dirty documents and files absent from a stale index. The final registry check
runs inside the metadata transaction. Delete project_index rows and the workspace
row atomically; only project_accepted_result_index cascades. Queue/receipts/seed
cursors/acceptance journals/presets/shadows/files/cache are separate owners and
remain untouched. Failure rolls back metadata; user-owned files are never deleted.
Success always selects Uncat. Re-registering the folder rediscovers the same
canonical Project identity and saved content.

Main uses the existing path lock with the canonical catalog directory key around
list/listWorkspaces/add/update/remove/Create/Open/selectImport/finishImport/
resolveRecovery/rebuildPreview. Nested Project file locks have different keys;
Import's internal Open callback uses the existing generation gate without
re-entering the catalog lock. This prevents an in-flight Open/Create/scan/Import
from publishing after unregister. Save/Discard already have a live coordinator,
which blocks removal; Close only reduces that registry. No cross-process folder
lock is claimed; external changes retain existing fingerprint/canonical guards.

Names remain at most300 JS code units, five semantic colors, UUID/Uncat IDs; no
new measured capacity/default or portable `.igs` schema is introduced.

## Verification plan

Real SQLite/filesystem cases: same-row update/duplicates/default guards; unavailable
folder metadata edits; atomic rollback; open-tab guard; exact Project/non-project
file preservation; derived accepted-index eviction and rediscovery; independent
operational rows remain. Preload shapes/transport and authenticated IPC guards.
Built Electron actual Settings/Cancel/error/Save/Remove confirmation, Main refusal
with an open Project, controlled in-flight Import/Open vs Remove, unregister/re-add,
restart and bounded UI screenshots. OS picker replies are controlled nondeterminism;
no ML inference, real OS dialog UX or release acceptance claim follows.
Semantic mutation must reach the real metadata consumer and fail for the intended
wrong outcome with adjacent GREEN and exact restoration.

## Executed evidence

ROOT executed165 affected Main/index/service/recovery/path-lock/shared/preload/
renderer-destination test cases:165 PASS,0 fail/skip. This includes eight new real
SQLite/filesystem management cases. Tests assert portable/non-project bytes and
live documents survive metadata changes; missing/readonly settings work; default,
duplicate/invalid and live-tab guards refuse; accepted cache rebuilds after Add;
operational records/shadows survive; metadata delete/final-guard failures roll back.
The full unchanged inference matrix was not repeated for this metadata slice.

Full `pnpm run typecheck` r2 and `pnpm run app:build` r1 PASS. Full lint uses the
single unchanged parser exclusion `scripts/qualify-installed-regional-init.mts`;
its final r2 report is PASS and retained. Initial lint r1 found12 ordering findings in new
root glue; scoped auto-fixes changed import/set/interface/member ordering only.
No prototype source or Python inference owner changed.

Built Electron native-r3: **20 PASS,three normal physical lifetimes,zero page
errors**. The existing catalog/Create/Import/Save/restart regression stays in the
same harness. New Settings paths verify default color/no name/remove controls,
duplicate-error draft retention and Cancel, persisted name/color across restart,
confirmed unregister refusal with a real open Project, explicit Cancel/false
confirmation, Uncat selection after successful unregister and re-Add discovering
original canonical identities and committed package bytes. All three `.igs` and
one non-project file hashes remain exact across the metadata workflow.

The race uses a held OS picker reply while the original known-file Import/Open
runs. A passive IPC entry observer confirms Remove has arrived before releasing
the picker. The original handler, service, SQLite and file owners execute; the
catalog fence lets Open finish first, then Remove returns WORKSPACE_PROJECT_OPEN.
The observer and picker restore by exact function identity before normal close.
This is production Main coordination evidence, not arbitrary service concurrency.
Real OS dialog UX, generation, release/update and cross-process filesystem races
remain outside this finite qualification.

ROOT viewed all11 final screenshots at1440×900/900×620, including Settings, Remove
confirmation/open refusal, rediscovery, long workspace ellipsis and minimum form
scroll. No material local layout defect found. This is `ui-audit` bounded
self-review, not independent visual/accessibility acceptance. Native-r1/r2 failed
on harness selectors (new action button caused an ambiguous old workspace regex;
Naive Dropdown uses label divs rather than the assumed menuitem role). Both
failed attempts and normal physical exits remain retained and are not semantic
mutation REDs or feature PASS.

An isolated copy skips only the live coordinator enumeration in removeWorkspace:
2 baseline GREEN →1 adjacent update GREEN+1 intended semantic RED (actual
unregister transaction wrongly succeeds for a live Project) →byte-exact service
restoration and2 GREEN. Source ROOT remains unmutated. Other copied files are
not claimed to equal a later formatted tree; the tested service restoration is
checked exactly. No package install/runtime/model copy was used.

Checks are serial,4GiB/zero-swap/600s. Actual app launcher2GiB plus one bounded
native scope2GiB, with300s per-lifetime deadlines; all owned exits are verified.
Initial artifact root29GiB,64GiB disk free. Fresh RTX4080 observation:
16,376MiB total/1,648 used/14,372 free; no CUDA/model work requested and CUDA is
hidden in the app fixtures. Shared ML/runtime/model/managed Projects and foreign
processes stay protected.

## Retention and reproduction

Evidence root:
`~/.codex/artifacts/imagegen-studio/runs/home-workspace-management/20261111-metadata`.
Retain final native-r3, bounded test/typecheck/lint/build logs/resources, all final
screenshots and failed attempts, mutation witnesses/restoration, source/payload/
bundle archives and inventories, independent retained-byte audit and lifecycle.
Raw payload cleanup follows archive byte comparison, physical exit and reader/
dependency closure; actual reclaimed bytes are recorded by lifecycle.

For a new run use recorded source/lock and existing Node/Electron dependencies,
build the app, then run the existing `scripts/smoke-home-workspaces.mjs` with a
fresh absolute `--report-file` under an owned evidence root and finite controller.
It creates fresh isolated XDG data and controlled picker replies. Do not resume
old raw paths; archives are diagnosis/reconstruction inputs. Extract only into an
isolated path without following archived node_modules symlink; supply trusted
Node dependencies rather than copying a runtime or weights. No current SHARED
ML environment is a dependency of this slice.

## Remaining accepted work

Workspace reveal/rescan/locate and stable tab markers; Project rename/move/reveal,
app-managed Trash, Home sort/status/grid/Inspector; remaining Model Manager
contexts/hard resource removal, full Export As/BBox; release runtime Install/
Repair, Linux/NVIDIA distributable install/upgrade/rollback, manual app updates
and final compatibility/visual/capacity/MVP acceptance remain open. No
PP-001/005/007/008 status promotion follows. Next material consumer is Project
operations and Trash, with their separate filesystem/recovery contract.
