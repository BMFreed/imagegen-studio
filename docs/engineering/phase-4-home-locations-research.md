# Home locations and workspace tab markers

## Scope and fresh source

Baseline clean master `0e2611106a0f07d18299f2f95eeafdda60ecc633`.
[Home](../features/home-screen.md#workspace-management-flow) and PP-007 remain the
supporting contract; public readiness stays unchanged. This slice connects actual
Project/workspace Show in Folder and authoritative workspace tab markers. It does
not change portable documents, storage schemas, filenames, queues or recovery.
Risk: medium readonly IPC/desktop effects and ownership presentation; final target
validation and denied-path controls are necessary even though no source is written.

Fresh clean Invoke revision `4875d96531ca6712b288f6e660fcbb34143408c1`:
`app/api/routers/images.py:get_image_thumbnail:475–495` →
`app/services/images/images_default.py:get_path:445–458` →
`app/services/image_files/image_files_disk.py:get_path:638–666`.
The caller checks authority/maintenance; the service first loads the authoritative
record, then resolves and validates containment. Studio adapts this lookup through
its existing repository and catalog/per-file locks. Invoke has no desktop Reveal
adapter; this gap was reported before implementing the Electron shell adapter.
Existing Studio `models.openModelFolder` demonstrates shell.openPath at Main.
UI uses approved Home prototype/menu/IconButton and existing workspace color tokens.

## Consumer path and bounds

Home menu key → ID-only renderer/preload → authenticated Main channel and catalog
lock → ProjectService → active registered repository record → canonical parent/file
validation under existing file lock → shell.showItemInFolder. Workspace Show in
Folder resolves the exact registered directory and uses shell.openPath, never opens
a Project document. No renderer-provided pathname or URL reaches shell. No source,
SQLite lifecycle, queue, staging, accepted provenance or shadow mutation is added.
Present corrupt/unsupported files can be located without parsing/saving them;
missing files, unavailable/unregistered folders, Trash/deleting authority and path
redirection are refused visibly. Readonly folders remain revealable. OS shell errors
are user-facing Home failures and can be retried. showItemInFolder has a void API;
success proves dispatch, not that a particular OS file manager displayed its window.
No hostile external-process syscall race guarantee is claimed.

Main records workspace ID when Create/Open/recovery attaches a coordinator. Every
current tab projection uses that owner, including mutation and tabs-changed results.
Closing removes the ephemeral mapping; nothing is added to `.igs` or frozen state.
The additive optional DTO field accepts legacy messages without inventing ownership;
when supplied it must be a valid workspace ID. Renderer joins only the complete
catalog, never its currently filtered project list. Unknown workspace/color has no
invented marker. Catalog color changes update existing tabs; Home keeps its icon.

## Rename/Move inventory: separate migration required

The fresh investigation rejected a title-only shortcut: Home:503–510 and the
prototype RenameProjectModal require both display name AND `.igs` filename; tabs
must track canonical relocation. `localProjectRecoveryKey` hashes canonical path;
ProjectSession.filePath is readonly and autosave continues using its owning session.

Current carriers are finite but cross multiple owners: project_index/derived saved
accepted-result index; queue rows and receipts/seed cursor; staging discard tombstones;
Raster/Smart manifests and frozen bundles; shadows; acceptance journals; runtime
coordinators/gates/fences; Trash authority. Strict consumers include
`generation-queue.ts` Smart enqueue/acceptance scope,
`smart-patch-generation-staging.ts` manifest projectKey/path checks,
`generation-acceptance-journal.ts` path-derived intent key and `project-shadow.ts`.
`finishImport` creates a new identity for an external copy/move; it is not migration
of managed operational state. Rewriting frozen bundles would not preserve exact Retry.

Fresh Invoke callers `api/routers/image_moves.py:start_background_move_all` and
`start_background_recovery` → `services/image_moves/image_moves_default.py` startup,
reservation/queue-idle admission, plan → moving → moved → transactional repoint →
recovery, with `shared/database/queries/image_moves.py` and its schema, provide the
durable relocation skeleton. `images_default._image_mutation_lock` serializes moves
with record/file mutations. Invoke preserves stable image_name while changing
image_subfolder; it has no migration for Studio's path-derived Project identity.
This mismatch was reported before any alternative. No Rename/Move production API,
UI promise, auto-discard or parallel acceptance owner is introduced in this slice.
The next relocation change needs a deliberate carrier/identity strategy and crash
matrix, preserving frozen Retry and recovery rather than merely updating Home rows.

## Executed evidence

ROOT final affected selection: **203 PASS, zero failures/skips**, including thirteen
new real SQLite/filesystem Reveal/ownership cases and seven preload transport/DTO
cases. Adjacent service, workspace, Trash, thumbnail and generation recovery tests
remain green. Readonly/corrupt files, missing/unregistered/Trash/deleting targets,
symlink redirection, stale authority and shell failures are exercised. Dirty tab,
saved package, opaque terminal queue and shadow bytes stay exact. Workspace metadata
survives document edits, Undo/Redo, clean reopen and actual shadow recovery.

Finite independent source review found an availability-policy mismatch: execute-only
parent mode0111 allowed Project shell dispatch despite catalog inaccessible state.
`availability-red.log` reproduces the missing rejection with readonly0500 GREEN.
Project Reveal now reuses the existing workspaceAvailability policy before its final
file-lock checks; the unchanged regression passes in the final selection. No separate
permissions algorithm was added. Specific source recheck is CLEAN, no rerun claim.

Isolated semantic mutation: six selections = five GREEN + one intended consumer RED.
Replacing only the in-lock authoritative Project lookup with the initial stale record
lets an actual intervening Trash publication reach the shell adapter without the
required rejection. The ordinary exact-path neighbor stays GREEN. Baseline and
byte-exact restoration each pass both cases; workspace and isolated service hashes
match. Mutation is not a setup error, permission timeout or inferred authored test.

`pnpm run typecheck` and `pnpm run app:build` PASS; full partitioned lint PASS with
only unchanged `scripts/qualify-installed-regional-init.mts` parser exclusion. Later
service/test/harness changes pass scoped lint. The renderer chunk advisory is unchanged.
Python/prototype sources and inference owners were not modified or broadly retested.

Final built Electron `native-r3.json`: **six checks, two normal physical lifetimes,
three screenshots, zero page errors**. Real UI/IPC validates Project/file selection,
workspace/directory dispatch, arbitrary renderer path refusal, visible shell error/
retry, no implicit Project Open/Save, marker ownership outside the selected Home
scope, live catalog color update and normal restart/reopen with exact package bytes.
OS picker and shell callbacks are controlled; this proves dispatch to the exact
validated target, not the OS file-manager window experience. Callback identities
are explicitly restored before first normal close; final source22/bundle5 hashes
match current bytes. Earlier native-r1 dropdown selector and native-r2 hidden-Home
screenshot-helper failures are retained separately and do not count as qualification.
All observed native actors across attempts are physically gone, with actual cgroups
and zero-swap resource reports recorded; launcher exit alone is not used as proof.

ROOT and the independent reviewer opened all three final PNGs at900×620 and1440×900.
Error feedback, reopened/scoped tab markers and actions have no blocking visible
finding. Reviewer evidence is source+screenshot only; hover/Tab and OS window UX
were not independently exercised. PP-001/005/007/008 statuses stay unchanged.

## Retention and reproduction

Evidence: `~/.codex/artifacts/imagegen-studio/runs/home-locations/20261111`.
The qualification summary, bounded logs/resource reports, native PNGs, source/bundle
hashes, regression RED and mutation/restoration witnesses are compact evidence.
The lifecycle inventory started at29GiB(root)/17GiB(shared)/12GiB(runs),64GiB free,
RTX4080 memory16376MiB total/1304 used/14716 free. No GPU work/runtime/weights copy
or SHARED dependency was needed. Checks use4GiB/600s; native launcher and owned
scope each2GiB/zero swap,600s overall and300s per scope.

Exact owned payloads are the isolated mutation source plus three native fixture
folders. `retained-payloads.tar.gz`/`payload-inventory.json` retain their bytes without
following dependency/OS symlinks. `final-source.tar.gz`/`final-source.json`,
`delivery.patch` and `qualified-bundles.tar.gz` preserve the reviewed staged tree and
five final tested bundle files. Independent retained-byte audit, physical exit,
restoration/dependency closure and actual cleanup/commit/remote status are recorded
beside them. The mutable lifecycle records removal of raw payloads after that audit;
old raw paths must not be resumed as if present.

Reproduce from the final commit with compatible existing Node/Electron dependencies:
build the app, then run existing `scripts/smoke-home-workspaces.mjs --report-file
ABSOLUTE_NEW_OWNED_REPORT --locations-only` via tsx inside a fresh lifecycle-owned
artifact directory and bounded controller. It uses real Main-created blank packages;
no ML setup is needed. Retained mutation dependencies are a symlink to the existing
workspace, not an archived runtime: rebind only that isolated dependency link after
checking compatibility. Rebuild native SQLite for the intended Node/Electron ABI.
No cross-run payload or active shared data is eligible for this slice's cleanup.

Rename/Move remains the next identity migration owner described above. Folder
locate/relink, unhealthy-file lifecycle, remaining Home presentation and Models/
exports/runtime/release/compatibility/visual/MVP gates remain separate continuations.
