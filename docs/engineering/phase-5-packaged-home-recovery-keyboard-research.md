# Keyboard focus in packaged Home and Project Recovery

The [Home accessibility contract](../features/home-screen.md) requires
keyboard opening and visible focus. A canceled [Project Recovery](../features/project/document-lifecycle.md#autosave-and-recovery)
leaves the saved Project and local recovery copy available for another attempt.

## Source and reproduced defect

The test starts from `e13227f7` and borrows an exact saved NoobAI V Project
with one accepted Raster. It copies that small `.igs` into an isolated
workspace. After a clean keyboard Open and normal close, the test writes an
authentic autosave shadow through `ProjectShadowStore`. Only the generation
box position and document revision differ from the saved file. The new
AppImage lifetime detects the shadow through the ordinary Home Open path.

For fixture preparation, consulted InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1`
at `invokeai/frontend/webv2/src/workbench/projects/`, including
`components/OpenProjectDialog.tsx`, `useProjectActions.ts` and
`durableSyncedPersistence.ts`. Open resolves the Project through the active
persistence owner, including any compatible local draft. The new fixture
uses the existing Studio adaptation with the original saved base and its
Project-owned shadow. The production change is in presentation.

On the old stock AppImage from `4f08d1cd`, Escape and Enter on Cancel both
left `document.activeElement` on `BODY`. A fresh Tab sequence started from
the top of Home and took 29 presses to reach the same card. Home temporarily
disables its Project buttons during the async open request. The built-in
Naive focus trap captures the active element when Recovery opens. By then
the card has already lost focus.

The Home Open intent now remembers the attached trigger before the request.
On Cancel the renderer restores it after the dialog's focus trap deactivates,
provided the same Home presentation is current and focus still belongs to
the dialog or body. The Project card and list row show an inset focus ring
using the existing text token. The Recovery card exposes the modal semantic.

## Packaged verification

- R1 stopped on a test measurement. The X11 frame was 1440×900 and its
  Chromium content was 1432×896 at DPR 1. The runner now verifies the native
  frame and separately records the content dimensions and frame inset.
- R2 and R3 reproduced focus loss in both dismissal paths on the old
  AppImage. R3 used the same final keyboard oracle as R4. Both old two-window
  runs closed normally after checking the preserved files and index state.
- R4 passed with the new AppImage. Home opened a clean Project by keyboard
  at 1440×900. At the 900×620 native minimum, Recovery focused Cancel,
  cycled forward and backward through all three actions, and returned
  visible focus to the original Home card after Escape and explicit Cancel.
  All actions fit in the dialog. The inspected screenshots show the focus
  ring on the card and all three visible action labels. The `.igs` bytes and
  inode, shadow bytes and checked Project/index state survived both actions.
  Both app lifetimes exited normally.

The R4 AppImage contains the 42 matching compiled files from the current
build. Its application payload was read from SquashFS without launching the
binary. The focused Home, Project and shadow selection passed 157 tests with
zero failures or skips. Typecheck, app build, AppImage build, scoped ESLint
and formatting checks passed.

The independent retained-data audit matched 11 runner source pins, 42 ASAR
members and 41 retained files. It verified 73 trusted keyboard events, the
2 px focus outline in the screenshots and 25 SQLite tables. Only the Project
index timestamp varied between the two closed databases. The two app
lifetimes' process identities had settled. After the audit released its
readers, cleanup removed 24 paths and reclaimed 849,862,656 allocated bytes.
The verified package, trace, screenshots and closed stores remain available.

A packaging diagnostic outside the private launcher activated the host
AppImageLauncher. The test package was returned by same-filesystem rename,
the generated desktop entry and icons were withdrawn, and the desktop
caches were refreshed. The superseded binary is kept in the local artifact
root while the host daemon still holds read-only handles. The replay uses
the private launcher and reads SquashFS directly for package inspection.

This is a keyboard and layout check in a private X11 session, with saved
Project data and a prepared recovery input. The [previous crash checkpoint](./phase-5-packaged-raster-crash-recovery-research.md)
owns evidence from actual Main death and recovered CUDA output. Screen reader,
Wayland keyboard behavior, broader contrast and performance remain open.

## Replay

Use `scripts/fixtures/packaged-project-chooser-x11.py --xvfb <owned-Xvfb> -- node --import tsx scripts/smoke-linux-package.mjs`
with `IMAGEGEN_LINUX_PACKAGE_OFFLINE_PROJECT=home-recovery-keyboard`. Point
`IMAGEGEN_LINUX_PACKAGE_ARTIFACTS` at a fresh `home-recovery-keyboard` child
under `runs/packaged-home-recovery-keyboard/<date>-rN` in the artifact root.
Place `package-proof.json` beside that child with `schemaVersion: 1` and a
`package` entry containing the canonical path, byte size and SHA-256 of
`IMAGEGEN_LINUX_PACKAGE_APPIMAGE`. Use the private launcher to isolate the
display and disable AppImageLauncher integration. The runner uses native
X11 keys and window geometry, a 4 GiB scope with zero swap and a 150-second
outer deadline. Run `20261121-r4` keeps the final trace and images.
