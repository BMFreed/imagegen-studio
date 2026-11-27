# Locate a portable NoobAI Project on the stock AppImage

The [Home Locate contract](../features/home-screen.md) and
[source-built qualification](./phase-4-home-project-locate-research.md)
define the same-document, same-revision rebind. This gate runs the
stock AppImage through the Linux GTK desktop portal and an explicit
later Open. It uses a fresh profile with no installed models or runtime.

## Donor and exercised owners

The clean InvokeAI checkout was
`4875d96531ca6712b288f6e660fcbb34143408c1`.
In `invokeai/frontend/webv2/src/workbench/`,
`launchpad/pages/{HomePage,ProjectsPage}.tsx` and
`projects/components/OpenProjectDialog.tsx` call
`projects/useProjectFileActions.ts`, which uses the browser picker
and the archive import function in `projects/projectFile.ts`.
That import allocates a new canonical project ID. Separately,
`projects/library.ts`, `projects/projectLifecycleLocks.ts` and the
Project and Launchpad deletion callers acquire lifecycle authority
before mutating an existing record.

In `invokeai/app/services/`, `image_moves/image_moves_default.py`
checks the old and new paths before `_reconcile_destination_subfolder`
repoints the existing image name. The move and recovery callers
also use `commit_database_updates`. The guarded SQL lives in
`shared/database/queries/image_moves.py`. Studio's Locate already
adapts the existing-owner repoint to a lost Project path. The gate
uses the installed renderer, Main picker and SQLite relocation owner.
[Home renderer](../../src/renderer/App.vue) ·
[Main picker](../../src/main/index.ts) ·
[Project relocation store](../../src/main/projects/project-relocation-store.ts)

## Native controls

The stock executable is the AppImage built from
`4f08d1cdb6427a2ca6cdc86ce58de60064f52e30`, SHA-256
`555c6a7985ef1cad3b0427d97862aa3db94da3cbf0d4ffdc7a67da5201bfc5d8`.
The 337,829-byte accepted NoobAI archive used by
[packaged import](./phase-5-packaged-project-import-research.md)
was copied into `Uncategorized` and opened from Home. The harness
renamed the copy externally after normal physical exit.

The next launch scanned the missing original, the renamed archive,
and a valid same-document archive with another revision. The revision
control changes only the saved revision and the manifest metadata
needed to cover that change. A separate exact copy was outside the
registered workspace.

- Cancel left the missing Project and the unopened candidate rows
  in place.
- Selecting the external copy reached the registered-workspace
  refusal. Selecting the ready archive with a different revision
  reached the saved-identity refusal. Both left the index, binding
  and accepted-result projection unchanged.
- Choosing the exact renamed file rebound the original local key to
  the new path. The scanner's unopened duplicate row disappeared.
  The distinct revision stayed independent. No Project tab opened,
  the original last-opened timestamp survived and the three test
  files retained their bytes and inode.
- A cold restart preserved the binding. Only explicit Open activated
  the Project tab and advanced the last-opened timestamp. The original
  accepted Raster and its immutable V-prediction settings were
  available through Main.

The four chooser windows belonged to the authenticated private X11
session. The portal PID, transient Main owner and keyboard focus were
checked before input. The launcher used one 4 GiB scope with zero swap
and a 140-second outer deadline. Production sources and the publisher
inputs were outside the fixture mutation.

The gate establishes the packaged native path within one workspace
on the GTK portal. The [KDE Wayland follow-up](./phase-5-packaged-kde-chooser-research.md)
replays the same chooser controls. Retained dirty recovery and nonempty
queue repointing have separate source-built coverage. The shipping
desktop matrix remains a release check.

## Execution and retained evidence

The final run is
`~/.codex/artifacts/imagegen-studio/runs/packaged-noobai-locate/20261121-r3/`.
It produced three normal physical closes, a zero launcher exit
and a complete report. The retained archive and SQLite snapshots
cover before the external rename, after Locate before explicit
Open, and after restart and Open. The first two exploratory runs retain
their failure receipts. The first inspected a migration-only
table name instead of the deployed schema. The second confused
the normal missing-model warning with the Locate error alert.

The adjacent Copy and Move reruns on the shared chooser passed
in `runs/packaged-noobai-chooser/20261121-r7/` under the same
artifact root, with four more normal physical closes. The 194
focused Project, workspace, relocation and resource-scope tests
passed with zero failures or skips. Typecheck, app build and
scoped lint passed.

## Replay

Use the same isolated X11 launcher and prerequisites as
[packaged import](./phase-5-packaged-project-import-research.md#reproduce),
plus `zip` and `unzip` for the revision control. Set
`IMAGEGEN_LINUX_PACKAGE_PORTABLE_LOCATE=1` and choose a fresh
`locate` child under `runs/packaged-noobai-locate/<dated-run>/`
for `IMAGEGEN_LINUX_PACKAGE_ARTIFACTS`.

## Cross-workspace Locate on KDE Wayland

For this replay, the clean InvokeAI checkout was
`64ff2c600f04d220e470fdaeec570bd402af42a7`. The current
`invokeai/app/api/routers/image_moves.py` calls the move service in
`invokeai/app/services/image_moves/image_moves_default.py`. Its
`_reconcile_destination_subfolder` and `commit_database_updates`
call the guarded `repoint_image` query in
`invokeai/app/services/shared/database/queries/image_moves.py`.
The existing Studio relocation owner was exercised as shipped.

The stock `8a8af9214f377a70226b8bac583426056aa3c1fb` AppImage,
SHA-256 `8b57a5e50bde8fc0b0818e6b5b7ab8057e5da96dc5f70cb17dbfc42eca4e7cfa`,
registered a second workspace through a real KDE directory chooser.
The harness moved the closed default-workspace Project into that workspace.
Cancel, an exact copy outside the registered folders, and a valid neighbor
with a different revision preserved the index and accepted Raster. The exact
file rebound the original key to the destination workspace and removed the
scanner's unused duplicate. The other revision stayed independently indexed.
Three normal physical closes completed. A cold explicit Open alone advanced
the last-opened timestamp.

The independent audit matched the AppImage to its embedded ASAR, six
source pins, five raw KDE D-Bus responses, the archive and Raster bytes,
and three closed SQLite snapshots. It confirmed all 27 recorded process
identities had exited. Evidence is in
`runs/packaged-noobai-locate/20261127-r1` under the artifact root.
Enable `IMAGEGEN_PORTABLE_LOCATE_CROSS_WORKSPACE=1` in the private KDE
launcher and supply the exact `.package` identity in `package-proof.json`
beside the `locate` directory to replay.

## Keyboard focus after Cancel

On the production Home renderer in Chromium, a held Locate response
disabled the Inspector action. Returning Cancel re-enabled it but left focus
on the document body. The renderer now shares the focus-return check from
Locate Folder. The controlled regression passed at 900×620 with visible
focus. A second cancellation also preserved focus when it had already moved
to the File menu. All eight Home catalog tests passed. The RED and GREEN
logs and screenshots are in `runs/current-stock-mvp/20261127/browser-focus`.

The rebuilt stock `4d0cdae60ce30f06bd07974ce4b578d999f1eb6b`
AppImage, SHA-256
`e0e45842ef0ec5d13372b56f2cd9161b68ea2ec41cdfdf4fc3a9c5b919493425`,
repeated the cross-workspace flow in private KDE Wayland. Keyboard Enter
on the Inspector action triggered the real portal picker. After the native
Cancel response, the button was enabled, focused and matched `:focus-visible`.
The 1380×900 screenshot shows the focus outline on the same action.
The other selection controls and three normal physical closes passed.
Independent readback matched the screenshot, five KDE responses, the stock
AppImage and embedded ASAR, three closed SQLite snapshots and the accepted
Raster bytes. All 30 recorded process identities had exited.
Both Home browser files passed all 33 tests on the committed renderer.
The full browser suite was stopped before completion, so this verification
is limited to Home and the recorded packaged replay.
Replay with `IMAGEGEN_PORTABLE_LOCATE_INSPECTOR_CANCEL=1` in cross-workspace
mode. The screenshot, portal traces, report and closed snapshots are in
`runs/packaged-noobai-locate/20261127-r2`.
