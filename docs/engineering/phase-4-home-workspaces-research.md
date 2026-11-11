# Production Home workspace catalog and destinations

## Scope and source check

High risk: workspace registration, Main IPC, Create/Import destinations and the
SQLite projection of committed `.igs` files. This slice connects existing Home
workspace authoring to production. It does not close all Home or MVP acceptance.
Supporting contracts: [Home](../features/home-screen.md),
[PP-001 and PP-007](../product-promises.md). Their public status is unchanged.

Starting Studio revision: `8d5423004514eb1538bdaea64dd4e44a9b2b64f3`, clean master.
Current local Invoke revision: `4875d96531ca6712b288f6e660fcbb34143408c1`, clean.
Freshly read implementation and callers:

- `invokeai/app/api/routers/projects.py` →
  `invokeai/app/services/project_records/project_records_default.py` →
  `invokeai/app/services/shared/database/queries/projects.py` and
  `schema/projects.py`.
- `invokeai/app/api/routers/boards.py` →
  `invokeai/app/services/boards/boards_default.py` →
  `invokeai/app/services/board_records/board_records_default.py` →
  `invokeai/app/services/shared/database/queries/boards.py`.
- `invokeai/app/services/shared/database/database.py`, `queries/locks.py` and
  `invokeai/app/services/board_records/board_records_common.py`.

Confirmed source: typed bounded metadata, transaction-owned validation/conflicts,
returning persisted rows, and separation of filesystem work from retryable database
callbacks. Invoke's `project_workspaces` stores per-user project JSON state; it is
not a folder registry. Invoke has no reusable folder-backed `.igs` catalog. This
absence and adaptation were reported to the user before implementation. We adapt
Invoke's metadata CRUD through Studio's existing repository, canonical scanner,
atomic Project writer and staged import; no parallel storage or file mover.

## Data path and finite behavior

Home → preload → authenticated Main handler → existing ProjectService →
ProjectIndexRepository/project_workspace → response → Home. `0003_projects.sql`
already contains the workspace table and project-index FK; no schema migration.
Main alone opens the OS folder picker. Renderer submits only name and color.
Names are trimmed, nonempty, at most 300 JS code units (adapted from Invoke's
300-character board bound, an input bound rather than measured capacity). Colors
are the approved prototype's green/blue/amber/violet/teal. IDs are Uncat's stable
ID or UUIDs. Projects is the aggregate view, never a destination.

The registered folder is canonical and flat. Scanner accepts direct regular
`.igs` files, ignores nested directories and non-project files. Duplicate names,
canonical paths/aliases and ancestor/descendant workspace paths are refused.
Availability (available/missing/inaccessible) and destination writability remain
separate from Project health. Unavailable registration and cached rows survive;
one unavailable folder must not hide others. Database faults remain visible.

Create and Import capture an explicit destination. Omitted IDs retain the existing
Uncategorized default. Explicit invalid, unknown, unavailable or readonly IDs fail
before file publication, without silently falling back. The UI defaults to the
selected writable concrete workspace, otherwise Uncat, and displays the choice.
Existing staged-copy/fingerprint/path-lock/directory-sync/source-removal rules
remain the Import owner. Known files in any registered workspace open directly.
Save, preview rebuilding, recovery and accepted-result reindexing must preserve
the original workspace instead of assigning Uncat.

## Failure and verification plan

- Picker cancellation: no registration, no folder deletion, draft retained.
- Conflicting registration: reject transactionally; do not remove selected files.
- Folder disappears/permissions change: retain catalog and cached rows; refresh
  reports availability; explicit destination fails without writing elsewhere.
- Interrupted Create/Import and failed index update: existing committed-package
  and source-retention rules remain; recoverable projection rebuild uses the
  actual workspace. No filesystem effects inside metadata transaction callbacks.
- Async Home refresh: request identity prevents late aggregate/scoped results from
  replacing the current selection. Add/error/Cancel cannot reset unrelated tabs.

Planned checks: meaningful temporary SQLite/filesystem tests; shared parser and
preload/Main validation; TypeScript/Vue checks; affected regression tests; built
Electron Home → picker response → actual `.igs`/SQLite → Save/reopen/restart;
explicit copy/move source preservation; aggregate/scoped lists and unavailable
folder behavior; production screenshots at normal/minimum size; controlled
semantic destination mutation with adjacent control and exact restoration.
Mock picker responses exercise the real handler but do not qualify OS dialog UX.
No inference/model/runtime-install or visual-generation claim follows.

Rename, remove registration, project moves, Trash, remaining Home presentation,
workspace tab markers and release acceptance remain separate continuations.
Results below will distinguish authored, executed, source-reviewed and retained
byte evidence. No promise promotion is implied by this implementation.

## Execution

ROOT executed the affected Main/db/shared/renderer test scopes with test
concurrency2: **4,854 PASS,27 opt-in skips,0 failures** (4,881 test cases including
nested subtests). Missing pinned LaMa/opt-in fixtures remain skipped; these are not
new installed-worker evidence. Ten new real SQLite/filesystem workspace cases
cover canonical aliases/nesting/name conflicts/concurrent registration, actual
Create/Save/rebuild/recovery/accepted-result reindex, known-file import, explicit
refusal/no fallback and availability restoration. Shared parser/preload and
renderer destination tests also execute in this scope.

`pnpm run typecheck` final r5 and `pnpm run app:build` final r4 PASS. Full lint
r1 passes with only the unchanged parser exclusion
`scripts/qualify-installed-regional-init.mts`; final Home/harness scoped lint
also passes. No prototype source changed. No Python inference owner changed and
no native model-generation/runtime matrix was repeated as qualification for this slice.
The broad affected Node scope is justified by the shared ProjectService/index
and required existing Smart/ordinary/import/recovery consumers.

Final actual built Electron **native-r3:12 checks,two normal physical lifetimes,
zero page errors**. It exercises Add/picker Cancel/draft retention, Main rejection
of a renderer path and duplicate folder, selected Create, committed Save, Copy
and Move with proper source semantics, known nondefault direct Open, aggregate
and scoped Home, Saved generations refresh scope, restart/reopen, missing folder
cached rows, explicit destination refusal and restoration. OS picker responses
are controlled; actual dialog UX is outside this evidence. Save's bbox edit uses
the real API as setup for the actual writer, not a claim about bbox-editor UI.
No inference, accepted-result generation or runtime installation is exercised.

ROOT opened all seven final screenshots (1440×900 and900×620), including actual
minimum-size form scrolling with the Create action still visible. This is bounded
self-review with `ui-audit`, not independent UI or accessibility acceptance.
Source review found and fixed false invalid-recovery reporting on unavailable
folders and a Saved generations refresh bypass of Home scope. Screenshot review
found a workspace-label/status overflow; bounded grid/flex sizing and ellipsis
fix it without hiding the sidebar. Final screenshots and overflow assertions pass.
Native-r1/r2 mechanics remain retained separately; early r1 modal frames captured
enter animation and are not stable visual evidence. r3 waits for finite animations.

Isolated destination mutation:2 baseline GREEN, then1 adjacent registration GREEN
and1 intended semantic RED (real Create/index assigned Uncat instead of the
requested workspace), followed by byte-exact service restoration and2 GREEN.
The original checkout stayed unchanged. Two earlier pnpm isolated-copy attempts
failed before tests because it refused modules purge without TTY; neither counts
as semantic RED. Repair uses the existing Node/tsx CLI directly with no install
or purge override. Initial DTO typing and VM-realm test-shape failures were fixed
and retained separately from the successful final checks.

Checks use4GiB/zero-swap/600s owned units; actual Electron uses a2GiB launcher and
at most one2GiB native scope at a time with300s lifetime deadlines. All owned
physical exits are confirmed. Disk inventory was29GiB in the artifact root with
64GiB available. RTX4080 was observed at16,376MiB total/2,632 used/13,388 free;
no model/ML runtime was allocated, copied or modified, and CUDA is hidden in the
owned app test. Existing shared runtime/resources/Projects and other apps are
outside this run.

## Retention and reproduction

Compact evidence lives at
`~/.codex/artifacts/imagegen-studio/runs/home-workspaces/20261111-catalog`:
`native-r3.json`, final screenshots, bounded logs/resources, mutation witnesses,
source/payload inventories and archives, final retained-byte audit and lifecycle.
Raw test payloads are disposable only after archive byte comparison, physical
exit and reader/dependency closure. The final lifecycle records actual reclamation.
No historical SHARED data is a dependency of this slice.

For a new run build the recorded source with the repository pnpm lock and existing
Node/Electron dependencies, create a fresh owned evidence directory, and run
`pnpm exec tsx scripts/smoke-home-workspaces.mjs --report-file ABSOLUTE_NEW_REPORT`
under the finite controller. The harness always creates isolated XDG data and
controlled picker replies; never resume by substituting historical raw paths.
`retained-payloads.tar.gz` and its inventory preserve raw bytes for diagnosis;
extract only into an isolated directory without following the archived
`mutation-source/node_modules` symlink. Supply a fresh trusted dependency link
for reconstruction rather than copying a runtime or weights. Source/fixture
reconstruction is separate from rerunning the production acceptance path.

## Remaining accepted tracks

Current API/renderer inspection still has no workspace rename/remove-registration,
project move/Trash, full image Export As/BBox, hard Remove Local Resource or app
update commands. Home sort/status/view/Inspector/project management and workspace
tab markers remain open. Remaining Model Manager contexts, release Install/Repair,
verified Linux/NVIDIA clean install/upgrade/rollback, manual application updates,
compatibility/recovery release matrix and final MVP acceptance remain accepted
tracks. Existing inference visual-usefulness/capacity gates remain open and no
PP-001/005/007/008 promotion follows. The next material continuation is workspace
management and project operations/Trash through their current contracts.
