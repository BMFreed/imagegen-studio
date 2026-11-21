# Signed recovery AppImage through KDE Wayland SaveFile

## Scope and source

Base `1fe659d357445ee5bf6d99d0bd721475fbd96059`. The
[previous packaged recovery run](./phase-5-public-appimage-recovery-research.md)
supplied deterministic replies to Electron's Save dialog. This qualification
uses the real native dialog on the same production Updates path. Two local
releases share the current production bundles and carry one ephemeral
qualification publisher for the loopback feed.

Reread clean InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1`.
`invokeai/app/util/database_copy.py::_copy_to_sqlite` verifies the chosen
copy before `_move_into_place` delegates to
`invokeai/app/util/no_replace.py::publish_noreplace`.
`invokeai/app/services/model_install/install_staging_ledger.py::_publish_claim`
publishes a completed, synced exclusive claim. The
[earlier adaptation](./phase-5-application-recovery-fresh-path-research.md)
uses Studio's signed executable publisher with create-only semantics.
InvokeAI does not have a signed AppImage recovery flow or a filename rule
for this picker. Studio adapts local suffix validation at its existing
publication boundary.

The controller seeds A's retained stage through the existing staging owner.
The real Updates dialog downloads signed B. The native Main calls Electron's
Save dialog and the driver correlates its D-Bus sender with the private KWin
socket and both FileChooser interfaces. It checks the AppImage filter, default
filename and request identity, then selects only through the verified KDE
dialog's accessibility controls. The native-mode bootstrap observes IPC and
process exit. It leaves the Save dialog function unmodified.
[Updates contract](../features/application-updates.md#explicit-save-recovery-appimage) ·
[KDE qualification driver](../../scripts/fixtures/packaged-kde-chooser.mjs).

## Native refusal with the default filename

R1 and R2 reached real Cancel. Their Select attempts had test-selector
failures. The observer dismissed the owned chooser and the original
AppImage exited with code zero each time. R2 identified the filename that
KFileWidget prefilled.

R3 isolated the user's ordinary Save. An XDG downloads setting pointed
into the owned directory. Electron and KDE logged the suggestion
`ImageGen-Studio-0.2.0-Recovery.AppImage`. The real filename field showed
`ImageGen-Studio-0.2.0-Recovery.appimage`. The driver activated Save with that
field as displayed. The response reported success and returned the lowercase
URI. Studio refused publication with `APPLICATION_UPDATE_RECOVERY_UNSAFE`.
The directory contained no additional image. The original AppImage, stage,
backup and lock matched their initial identities and bytes. The Project and
SQLite passed closed-file readback after a normal exit.

The publisher had required the exact suffix `.AppImage` for all three
paths. The fix follows the operator-selected local pathname on recovery
destination and later original-path validation. Both local checks compare
the extension case-insensitively. The downloaded publisher input still
requires `.AppImage` and the exact signed identity. The native save
path is passed to the create-only publisher as supplied by KDE.
[Recovery publisher](../../src/main/application-updates/application-update-staging.ts).

## Native result

R4 rebuilt both qualification AppImages from the patched production bundles.
The real portal returned Cancel with code 1 and no URI. The next request
accepted the unedited lowercase default and returned that exact URI with
code 0. The renderer reported **Recovery AppImage saved**. The selected
path contained the exactly signed 147,140,058-byte B as a single-link
executable. A's pathname, stage, backup and lock retained their identities
and bytes. After normal close, the controller started B through the
lowercase pathname. B reported recovery clear, reopened the same clean
Project from the shared isolated profile, and closed normally.

The native wrapper exited zero in 19.677 seconds, with 1.7 GiB peak service
memory and zero swap. Both lifetimes stayed in the inherited 4 GiB scope.
The two Main processes and all 16 recorded
PID/start pairs exited physically. The post-exit byte audit verified the
two Ed25519-signed package bodies, the two real D-Bus traces, the retained
staging files, two identical five-member `.igs` copies and both closed
SQLite files with all 30 migration hashes. Socket ownership during
execution comes from the pinned live runner. The app build, scoped
format, ESLint, syntax checks and 74 focused recovery and resource-control
tests passed. The focused tests ran before the production suffix change.
The recovery action regression reproduced the same unsafe result before
the fix and passed after it. An adjacent case verifies rejection of a
different local extension and lowercase downloaded artifact suffix.
After the fix, 639 application-update tests passed with one existing
platform skip, and the final 42 recovery and signing checks passed.

The local artifact store retains R1 through R4 under
`runs/packaged-recovery-action/20261121-kde-save-rN`. An independent reader
checked the R3 refusal, the live exact signed B and the R4 exit and portal
receipts. Lifecycle cleanup removed eight owned payload and scratch paths
after physical exit and reclaimed 4,067,708,928 allocated bytes. All 37
sealed R4 files verified after disposal. The retained files include the
original-stage evidence, both closed Projects and SQLite snapshots, the
screenshots, raw D-Bus traces and signed archive digest receipts.

The suites exercise
the actual KDE Wayland portal with a qualification publisher and isolated
AppData. Shipping publisher trust, installed-engine continuity and the
wider desktop matrix remain open.

## Replay

Use a fresh owned child of `runs/packaged-recovery-action`, a short owned
`TMPDIR` under the artifact root, and a running lifecycle record. Build the
application and run
`node --import tsx scripts/prepare-packaged-recovery-action.mjs <run> --kde-save`.
Then run
`/usr/bin/python3 scripts/fixtures/packaged-project-chooser-wayland.py -- node --import tsx scripts/qualify-packaged-recovery-action.mjs <run> --kde-save-default`
inside a bounded user service. The package build and the inherited native
scope each use 4 GiB and zero swap. If KDE moves an AppImage into its own
scope, the runner bounds that scope at 4 GiB and zero swap as well.
