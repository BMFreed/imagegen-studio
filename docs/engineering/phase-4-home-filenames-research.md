# Home real filename metadata

Base: `b9f33fd3b49398632f807ff60b3c11eac18f7a05`, clean `master` at entry.
Scope: the [Home browser contract](../features/home-screen.md#project-browser)
requires the actual filename in compact List rows, and the approved Vue prototype
shows `workspace / fileName` in the Inspector. Production previously supplied
this field only for Trash. Project titles may differ from their actual UUID,
imported, Unicode or case-sensitive filenames; synthesizing `title + '.igs'`
would therefore misidentify the saved file.

Risk is medium: an additive read-only summary/transport/display change. It does
not change `.igs` schema, write/recovery/relocation decisions, filesystem admission,
stable Project keys or document revisions. Existing Move/Rename and unhealthy
states are consumers to verify, not new mutation owners.

## Fresh InvokeAI basis

Before implementation, read the clean local InvokeAI checkout at
`4875d96531ca6712b288f6e660fcbb34143408c1`, including callers:

- `invokeai/app/services/project_records/project_records_common.py`
  (`ProjectSummaryDTO`), `project_records_default.py` (`list`);
- `invokeai/app/services/shared/database/schema/projects.py` and
  `queries/projects.py` (summary columns, fields and projection);
- `invokeai/app/api/routers/projects.py` (`list_projects`);
- `invokeai/frontend/webv2/src/workbench/projects/api.ts`, `library.ts`,
  `launchpad/projects/ProjectsBrowser.tsx` and `ProjectRow.tsx`.

Confirmed: Invoke projects are server DB/JSON records. Their lightweight summary
projection passes authoritative metadata through the API to rows, but contains no
canonical local project filename. The card export caller
`launchpad/projects/useProjectCardActions.ts` → `projects/useProjectFileActions.ts`
→ `projects/projectFile.ts` → `projects/invk/exportProject.ts` →
`projects/invk/manifest.ts` derives a new download suggestion from the display
name. That is not the real filename of a folder-backed Project and cannot supply
this field. Import callers likewise do not preserve such a filename in summaries.

This absence and its reason were communicated to the user before the production
patch. The adaptation retains Invoke's authoritative lightweight projection and
pass-through; the local value comes from Studio's existing Trash basename owner.
No independent storage, scanner, relocation or filename-normalization mechanism
is introduced. Prior research alone was not used as the source check.

## Production path and invariants

`ProjectIndexRecord.canonicalPath` → `ProjectService.toSummary()` →
`ProjectSummary.fileName` → existing list IPC/preload validator → Home List row /
selected Inspector. Main supplies `path.basename(record.canonicalPath)` for ready,
missing, corrupt, unsupported and unavailable-workspace cached records. This reads
the indexed location without opening or saving the document.

Pending Move/Rename is intentionally different: `pendingMoveSummaries()` retains
the original journal source workspace/title/snapshot and now also
`basename(move.sourcePath)`. Even after the file moves or DB repoints, the ordinary
indexed row stays excluded until journal finalization. Only then does the committed
canonical target filename publish. Existing Trash already provides the basename
of its lifecycle owner and keeps that required field.

The additive shared field is optional for older producers. Preload accepts omission
or a string and rejects present nonstrings; Trash still requires a string. The UI
uses `Filename unavailable` for missing legacy metadata instead of inventing a
filename. Existing Linux names with literal backslashes, Unicode, mixed case or
characters forbidden by the separate Rename form are displayed exactly. Rename
validation is not a file-admission or metadata-normalization rule.

List rows and Inspector use Vue-escaped text and exact `title` attributes with
existing ellipsis CSS. Active Grid keeps its existing compact layout; Trash Grid
keeps its existing filename. Renderer actions still address Project IDs, and gain
no filesystem authority. Search stays display-name-only; sort/filter, selection,
opening targets, Save and recovery remain with their existing owners. Mock-only
model/layer fields are not added to production summaries.

## Verification and evidence boundaries

Authored focused checks cover real same-title packages with Unicode/case/Linux
backslash leaves, cached unavailable workspaces, actual missing/corrupt/newer-schema
packages, legacy and malformed preload replies, existing Trash, and real pending
Move/Rename fault seams before finalization and after Retry. Read-only browse checks
compare package bytes and relevant indexed rows; pending checks preserve journal
bytes/state. This is distinct from a successful test execution.

The new `scripts/smoke-home-filenames.mjs` uses two actual built app lifetimes,
existing `ProjectSession` packages written while Main is physically closed, the
real scanner/SQLite/preload and List/Inspector. Only its owned Add Workspace OS
picker callback is controlled and restored. Same-title available and cached
Missing rows, long narrow metadata, and explicit UI Rename are finite consumers.
Read-only bytes/identity/revision/lastOpened controls are separate from the expected
explicit Rename title/revision/package changes. Original inputs are backed up;
the held Missing source restores only after physical exit. It fabricates neither
pending journals nor legacy production replies. Those remain separate Main/preload
and source evidence.

Execution results, screenshot inspection, retained byte audit and delivery proof
are recorded below only after they occur. Independent production source review
already found no concrete blocker across the five changed production files; it
did not run tests, builds, the app or visual checks.

### Executed checkpoint

- ROOT executed **138 PASS, zero failed/skipped** across `project-service`,
  `project-move`, `project-workspaces-preload`, `project-home-metadata` and
  `home-project-browse`. These include three new tests and extended existing
  pending/Trash controls; the remaining cases are neighboring regressions.
- `pnpm run typecheck` and `pnpm run app:build` passed. The build retains its
  existing large-chunk warning. All four lint partitions passed through the
  retained artifact-only launcher adapter: identical scopes/config/flags, 3,072 MiB
  child heap under the same 4 GiB group cap. This is not a claim that the unmodified
  2,048 MiB repository launcher passed. The only baseline parser exclusion was
  unchanged `scripts/qualify-installed-regional-init.mts`.
- Actual built app `native-r1`: **8 checks, two normal physical lifetimes, three
  screenshots**, zero page errors/Vue warnings. Main scanned two real same-title
  packages; List/Inspector selected and refreshed them without Open/Save or
  package/revision/lastOpened changes. The real Missing diagnostic preserved the
  literal-backslash cached leaf. Explicit UI Rename preserved Project/document
  identity, changed only its expected title/revision content and published the new
  basename; the original input backups and unrenamed sibling remained exact.
  Both the picker callback and held source were restored, the latter after exit.
- ROOT viewed the actual 1440×900 and two 900×620 screenshots: real filename rows,
  narrow Inspector ellipsis and cached Missing. This is local UI self-review,
  separate from the independent source review and retained-byte audit.

There were no failed attempts or executed semantic mutations. Plausible
`title + '.igs'` synthesis is contradicted by same-title/different-leaf controls;
premature target publication is contradicted by before-finalization journal
controls. Medium read-only metadata scope does not require an isolated mutation
matrix. Legacy UI fallback is source/preload evidence, not a fabricated native
reply. No prototype, Python, inference, old full gesture/recovery/lifecycle or
capacity matrix was rerun or claimed by these checks.

The compact run report records exact source/bundle hashes, commands, bounded
resources and outcomes. `final-source.tar.gz`, `retained-payloads.tar.gz` and
`qualified-bundles.tar.gz` plus manifests retain all qualified bytes. Raw profiles,
workspaces and temporary paths are disposable after the independent reader's
`CLEAN / READ_FINISHED` and final physical-exit/dependency check; the final
`artifact-lifecycle.json` records actual removed paths and reclaimed bytes.
Reconstruct from the archives or run the harness with a new absolute report path;
do not resume a historical raw profile. Git delivery and live remote equality
are recorded separately in `commit-proof.json`.

## Resources and remaining scope

New evidence root:
`~/.codex/artifacts/imagegen-studio/runs/home-filenames/20261112`.
Fresh inventory before heavy work: artifact root 29 GiB (shared 17 GiB, runs
12 GiB), filesystem 62 GiB free; GPU 7,970 MiB used / 8,049 MiB free. This slice
performs no ML/inference, copies no runtime/models and has no SHARED dependency.
Foreign processes and existing reusable resources remain protected.

Checks run serially with a 4 GiB group cap, zero swap and 600-second deadline.
Native launcher and each owned app group have separate 2 GiB caps, zero swap and
bounded lifetimes. Exact run-generated profiles/workspaces/temp paths are retained
with all source and qualified bundles, independently audited, and eligible for
cleanup only after readers finish, restoration, physical exit and dependency
closure. Reproduction uses a new report/profile, never a removed raw path.

This closes filename presentation only. Full Home compatibility/capacity and
acceptance, broader metadata decisions, cross-launch preferences, remaining Model
Manager/export/runtime/update/release work and visual model acceptance stay
separate. PP-001/005/007/008 remain **«Пока не обещать»**.
