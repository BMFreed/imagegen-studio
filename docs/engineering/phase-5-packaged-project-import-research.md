# Portable NoobAI Project import on the stock AppImage

## Source and contract

InvokeAI revision `4875d96531ca6712b288f6e660fcbb34143408c1` was clean when
consulted. The callers in
`invokeai/frontend/webv2/src/workbench/launchpad/pages/{HomePage,ProjectsPage}.tsx`
and `invokeai/frontend/webv2/src/workbench/projects/components/OpenProjectDialog.tsx`
use `useImportProjectFile` in `workbench/projects/useProjectFileActions.ts`.
It checks account scope and cancellation before calling `importProjectFile`.
`workbench/projects/projectFile.ts` owns the browser file input and import;
`workbench/projects/invk/importProject.ts` validates the archive before
restore. Invoke provides a browser picker. This test operates Electron's
desktop portal through an isolated X11 session and uses Studio's existing
Main import service.

Studio opens a managed `.igs` directly. An external source needs the
user's explicit Copy or Move into a registered workspace. The draft's
foreign library binding and the history of accepted images survive
opening. [Home import contract](../features/home-screen.md#import-existing-project-flow) ·
[Project lifecycle](../features/project/document-lifecycle.md#imagegen-studio-decision)

## Native evidence

The stock AppImage built from `4f08d1cdb6427a2ca6cdc86ce58de60064f52e30`
was 147,139,886 bytes with SHA-256
`555c6a7985ef1cad3b0427d97862aa3db94da3cbf0d4ffdc7a67da5201bfc5d8`.
Production inputs match the checkpoint at `4f5bda8a`. The qualifier
checked the same archive bytes before and after all lifetimes.

Copy and Move ran on separate fresh app profiles. Each dismissed the
system picker, selected an external file and canceled the workspace
dialog, then selected it again and confirmed the transfer.

- Both cancellations preserved the external inode and bytes, an empty
  workspace and index, and zero open Project tabs.
- Copy retained the external source and created a separate managed
  inode. Move removed only its own staged external source and left the
  managed package. The retained fixture stayed untouched.
- Both managed packages matched the original 337,829-byte `.igs` and
  its saved revision. The owner index contained one ready Project and
  one accepted Raster, with no queue jobs, candidate receipts or seed
  cursors. The fresh model catalog was empty and the runtime was absent.
- The real Project tab showed the exact accepted Raster at seed 0.
  Main returned the saved draft's advisory Epsilon and the accepted
  settings' V-prediction for checkpoint `1147756/2679856/2566634`.
  The draft's saved library IDs remained unchanged.
- After a normal exit, each profile started again and selected the
  managed package through the system picker. It opened the same tab
  and local Project identity without a second transfer screen.

Each initial and reopened lifetime closed normally with status 0 and a
confirmed physical exit. The launcher and AppImage shared one 4 GiB
scope per profile, with zero swap and a 140-second outer deadline.
The driver identified the actual GTK portal PID on the private D-Bus
session, matched its X11 transient parent to the packaged Main PID, and
checked window focus before input. There were eight real chooser
observations. The first exploratory runs exposed Xvfb socket ownership,
the portal process boundary, and the path-derived local Project key
assumption. Their failure receipts are separate from the successful runs.

Evidence is under
`~/.codex/artifacts/imagegen-studio/runs/packaged-noobai-chooser/20261121-r6/`,
with `copy/report.json`, `move/report.json`, their wrapper receipts, and the
retained Project and SQLite bodies. The older protected source is
`runs/packaged-installed-engine/20261118/trained-noobai-v-r2/native/after-restarted-close.igs`
under the same artifact root.

An independent reader verified all four retained packages and four
SQLite bodies, both live managed copies, the external source state,
the exact Raster and accepted index, four process-exit receipts, and
all 42 fresh build files against the stock package manifest. The 174
focused tests had zero failures or skips. Typecheck, app build and
scoped ESLint passed.

## Reproduce

Use the pinned stock AppImage and source fixture, the local GTK XDG desktop
portal and its ordinary services, Xvfb, `xdotool`, `xprop`, `gdbus`, and
the checked-in private session launcher. The artifact output path must be
a fresh `copy` or `move` child of a dated `packaged-noobai-chooser` run
under the artifact root. Use a separate scratch directory with a short
path. The command below assumes those paths and Xvfb have been located.

```sh
systemd-run --user --scope --quiet \
  -p MemoryMax=4G -p MemorySwapMax=0 -p RuntimeMaxSec=140s \
  env TMPDIR="$scratch" \
  IMAGEGEN_LINUX_PACKAGE_PORTABLE_IMPORT=copy \
  IMAGEGEN_LINUX_PACKAGE_ARTIFACTS="$run/copy" \
  IMAGEGEN_LINUX_PACKAGE_APPIMAGE="$appimage" \
  /usr/bin/python3 scripts/fixtures/packaged-project-chooser-x11.py \
  --xvfb "$xvfb" -- node scripts/smoke-linux-package.mjs
```

For Move use mode `move` and output `"$run/move"`. The run used
Ubuntu Xvfb package `2:21.1.22-1ubuntu1.3`, verified against the local apt
package index and extracted into the artifact root.

## Remaining acceptance

This checkpoint covers the stock AppImage using the Linux GTK portal on
isolated X11. The KDE/Wayland chooser, missing-file Locate, arbitrary
workspace destinations, shipping install and the joint NoobAI release
matrix still require qualification. Exact checkpoint relinking with an
installed catalog has its own existing
[managed-workspace test](./phase-5-packaged-noobai-versions-research.md).
The inference and public promise statuses are unchanged.
