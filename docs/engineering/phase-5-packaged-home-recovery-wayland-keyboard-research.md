# Keyboard focus in packaged Home and Recovery on KDE Wayland

The [Home accessibility contract](../features/home-screen.md) covers keyboard
opening and visible focus. The [previous X11 check](./phase-5-packaged-home-recovery-keyboard-research.md)
reproduced a focus loss on dismissing Recovery and verified the existing fix.
This check repeats the saved Project and recovery flow on native KDE Wayland.

## Fixture and source

The saved Project and prepared autosave shadow use the same real `.igs`
and Project-owned shadow writers as the X11 check. Re-read clean InvokeAI
`4875d96531ca6712b288f6e660fcbb34143408c1` under
`invokeai/frontend/webv2/src/workbench/projects/`.
`components/OpenProjectDialog.tsx::openProject` and
`useProjectActions.ts::openProject` call
`durableSyncedPersistence.ts::hydrateProjectFromServer`. It resolves the
durable Project and its compatible local draft via `hydrateProjectWithDraft`.
The two packaged lifetimes use Studio's existing Open and Recovery owners.

The stock 147,049,484-byte AppImage is shared with the passing X11 run.
Its SHA-256 is
`f34da4d3a4e13d1172fff312689a9a91afe71d25166b2ae3ce4361475caec06b`.
The embedded ASAR was read from SquashFS and matched the prior manifest
for 42 compiled files. Current `App.vue`, `HomeView.vue` and the relevant
Project storage owners match the packaged checkpoint.

## Real Wayland input and window sizing

The private launcher owns KWin, D-Bus, the runtime socket and XDG profile.
The harness confirms the AppImage Main actually connects to its compositor
by matching the established Unix socket pair. The compositor resizes
only the active window whose PID matches that Main. The renderer records
its real viewport and device pixel ratio after the configure.
[KWin frame geometry](https://github.com/KDE/kwin/blob/v6.6.7/src/window.h#L435)

The [keyboard helper](../../scripts/fixtures/packaged-wayland-keyboard.c)
binds version 4 of KWin's fake-input protocol, granted only to this
binary by a desktop entry in the private XDG profile. The helper checks
the socket peer's PID, UID, command line and cgroup before using the
protocol. The launcher holds one device for the complete session.
Tab, Shift+Tab, Enter and Escape reach Chromium through KWin. CDP
observes the renderer and captures screenshots.
[KWin protocol](https://github.com/KDE/plasma-wayland-protocols/blob/v1.20.0/src/protocols/fake-input.xml#L80) ·
[Private client authorization](https://github.com/KDE/kwin/blob/v6.6.7/src/wayland_server.cpp#L146)

KWin creates a device for each bound client and removes it on disconnect.
Chromium updates its keyboard when the seat capabilities change. An
early attempt had no permanent keyboard. The Wayland trace showed Tab
press and release being discarded while Chromium replaced the keyboard
after the short-lived input client exited. A separate native KDialog
control received all four keys. The fixed launcher presents a persistent
keyboard before starting the AppImage.
[KWin device lifetime](https://github.com/KDE/kwin/blob/v6.6.7/src/backends/fakeinput/fakeinputbackend.cpp) ·
[Chromium Wayland seat](https://github.com/chromium/chromium/blob/152.0.7977.130/ui/ozone/platform/wayland/host/wayland_seat.cc#L58-L97)

## Native results

R9 with protocol tracing and R10 without it both passed, with 73 trusted
keydown events and two normal AppImage closes each. At 1440×900, keyboard
selection and Enter opened the clean Project. At 900×620, Recovery initial
focus was on Cancel. Tab and Shift+Tab cycled through all three actions.
Escape and Enter on Cancel both returned focus to the original Home card.
The screenshots show the focus outline and three complete action labels.
The `.igs` inode and bytes, prepared shadow and Project index state
survived each dismissal.

The first earlier attempt compared browser outer bounds to compositor
frame bounds. Chromium reports outer decoration margins on this backend,
while the visible renderer measured 1440×900 and 900×620 at DPR 1.
The next two attempts reached the window resize and stopped on the
missing Tab before the persistent device was added. All three AppImage
lifetimes closed normally. The X11 regression completed in R5 with two
normal closes.

R10 ran in one 4 GiB zero-swap scope. It peaked at 1,197,543,424 bytes
with zero OOM events. All 136 focused Home, Project index, shadow and
Project service tests passed. Typecheck, the application build, scoped
ESLint, formatting and the C compiler's static analysis passed.
The two desktop runs cover keyboard navigation and visible focus for
this prepared recovery case on KWin 6.6.7 and X11.
Screen reader operation, other compositors and the shipping matrix
remain open.

An independent audit checked R5 and R9 through both closed store copies
and their native exit receipts. It rehashed the AppImage, ASAR, 15 source
pins and the exact Projects and shadow files. The closed SQLite snapshots
contain 30 migrations. Only the Project index timestamp varied. The
auditor verified that all 38 enrolled application processes had exited
and corroborated the discarded Tab in the R8 trace. The keyboard traces,
screenshots, closed stores and diagnostics remain available. Cleanup of
the six run profiles and short scratch directories reclaimed 44,154,880
allocated bytes across 36 idle paths.

## Replay

Compile `scripts/fixtures/packaged-wayland-keyboard.c` with the installed
Wayland client development library, Linux input headers and a C11
compiler. For example, use
`cc -std=c11 -D_GNU_SOURCE -O2 -Wall -Wextra -Werror scripts/fixtures/packaged-wayland-keyboard.c -o "$scratch/keyboard" -lwayland-client`.
Set `IMAGEGEN_WAYLAND_KEYBOARD_HELPER` to that exact executable under the
artifact root. Use `IMAGEGEN_LINUX_PACKAGE_OFFLINE_PROJECT=home-recovery-keyboard`
and the same AppImage, package proof and fresh artifact structure as the X11
check. Use [the private Wayland launcher](../../scripts/fixtures/packaged-project-chooser-wayland.py)
inside the 4 GiB zero-swap scope with a 150-second ceiling. The final window,
trace and database snapshots are under `20261121-r9` and `20261121-r10` in
`runs/packaged-home-recovery-keyboard`.
