# Stock AppImage Project chooser on KDE Wayland

## Scope and source

This gate replays the [Import](./phase-5-packaged-project-import-research.md)
and [Locate](./phase-5-packaged-project-locate-research.md) flows with the
KDE implementation of XDG FileChooser on a virtual KWin compositor.
The test uses the stock AppImage built from `4f08d1cd`, 147,139,886 bytes,
SHA-256 `555c6a7985ef1cad3b0427d97862aa3db94da3cbf0d4ffdc7a67da5201bfc5d8`.
The renderer, Electron dialog and Main storage owners are those in the
packaged app.

The InvokeAI checkout was clean at
`4875d96531ca6712b288f6e660fcbb34143408c1`. In
`invokeai/frontend/webv2/src/workbench/`,
`launchpad/pages/{HomePage,ProjectsPage}.tsx` and
`projects/components/OpenProjectDialog.tsx` call
`projects/useProjectFileActions.ts::useImportProjectFile`. That calls
`projects/projectFile.ts::pickProjectFile`, which handles browser file
selection, cancellation and account ownership. The prior Locate checkpoint
records the existing guarded path rebind. The KDE driver exercises
Studio's current dialogs and storage behavior.

## Session and independent proof of the backend

The launcher starts an isolated D-Bus session and virtual KWin with its
own Wayland socket, private home and private XDG directories. A short
runtime path allows the nested KIO socket addresses. The launcher sets
the private accessibility bus before starting the compositor and KDE
portal. It runs the compositor with `setpriv --no-new-privs` so the
test can read its socket ownership. The AppImage has its normal
launch privileges. [KWin virtual backend](https://github.com/KDE/kwin/blob/v6.6.6/src/main_wayland.cpp) ·
[Qt accessibility bus lookup](https://raw.githubusercontent.com/qt/qtbase/v6.10.2/src/gui/accessible/linux/dbusconnection.cpp)

The driver links the active Main PID and KDE portal PID to the
private KWin using the established UNIX socket pairs. It correlates
Main's actual FileChooser OpenFile request with the real KDE backend
and the matching result through the private D-Bus. The AT-SPI helper
targets only the identified KDE dialog and its filename, Open or
Cancel control. The response carries either the exact local file URI
or a cancellation code. [XDG FileChooser contract](https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.FileChooser.html) ·
[AT-SPI edit and action](https://gnome.pages.gitlab.gnome.org/at-spi2-core/libatspi/method.EditableText.set_text_contents.html) ·
[AT-SPI action call](https://gnome.pages.gitlab.gnome.org/at-spi2-core/libatspi/method.Action.do_action.html)

## Cases

- Import picker Cancel and transfer Cancel preserve the original inode,
  package and empty Project index. Copy retains the staged source. Move
  removes the staged source after confirmed transfer. Both reopen the
  managed Project through the chooser after restart.
- Locate rejects the exact archive outside the registered workspace
  and the valid archive with the wrong saved revision. It accepts the
  exact renamed Project and keeps the original local key. Explicit
  Open after restart retains the accepted Raster and its checkpoint
  provenance.

The test profiles have an empty model catalog and no runtime. The
signed shipping delivery and broader desktop matrix remain separate.

## Executed evidence

The final Import Copy and Move runs are
`runs/packaged-noobai-chooser/20261121-r15`. The final Locate run is
`runs/packaged-noobai-locate/20261121-r5` under the artifact root.
All three wrapper receipts are 0. Seven application lifetimes closed
normally. Twelve D-Bus traces show the real exported `wayland:` parent,
the same request forwarded to KDE, and the matching response.

Earlier attempts stopped at harness checks. The installed KWin has
a file capability, so the unprivileged launcher initially could not
read its proc identity. The first AppImage attempts expected the
launcher environment and arguments to persist verbatim in proc.
The final proof uses the established socket and the D-Bus sender
instead. The captured extension filter was
`*.[iI][gG][sS]`, the case-insensitive form Chromium emits. The
driver now checks the exact expected Project format on both sides.
[Chromium portal filter builder](https://chromium.googlesource.com/chromium/src/+/main/ui/shell_dialogs/select_file_dialog_linux_portal.cc#227)

The initial passing Wayland runs remain at `20261121-r13` for Copy/Move
and `20261121-r4` for Locate. The formatted driver was then replayed in all
three cases. The GTK Copy regression at `20261121-r14` also closed twice
normally. The 194 focused Project, workspace, relocation and resource-scope
tests passed without failures or skips. Typecheck, app build, scoped lint
and syntax checks passed.

An independent audit of the final runs checked all 12 portal traces,
eight retained Project archives, seven retained and three live SQLite
bodies, and the packaged files and runner source hashes. Socket and
process ownership during execution was recorded by the runner. The
audit corroborated those records against the traces and post-exit state.
The raw traces, storage snapshots and audit report were retained.
Disposable profiles and scratch space released 109,223,936 allocated
bytes after the audit and exit checks.

## Replay

Use the same stock AppImage, Project fixture and output modes as the
GTK Import and Locate checks. Run
`/usr/bin/python3 scripts/fixtures/packaged-project-chooser-wayland.py -- node scripts/smoke-linux-package.mjs`
inside the bounded user scope. Keep a short scratch path under the
artifact root and use a fresh dated output directory. The launcher
uses local KWin, KDE XDG portal, D-Bus, setpriv and PyGI AT-SPI.
The native run used one 4 GiB scope per profile, zero swap and a
150-second outer deadline.
