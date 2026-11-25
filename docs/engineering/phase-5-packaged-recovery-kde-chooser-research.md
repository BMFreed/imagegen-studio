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

## Startup after replacement before the activation journal

Studio base `46611961`. Rechecked clean InvokeAI
`64ff2c600f04d220e470fdaeec570bd402af42a7`, including
`invokeai/app/services/model_install/install_staging_ledger.py` and its startup
and restore callers in `model_install_default.py`. Invoke retains claims and
recovery data when it cannot establish safe ownership. Also reread
`invokeai/app/api/dependencies.py` and the desktop installer instructions in
`docs/src/content/docs/start-here/installation.mdx`. Invoke Launcher
`c267bdb439519216b277a7a8c6ad408b9d79efce` uses its single-instance lock and
`quitAndInstall` through `src/main/index.ts`, `src/main/main-process-manager.ts`
and `src/main/updater.ts`. Studio uses its existing signed stage and startup
inspection for this AppImage boundary.

The new `--kde-save-after-replace` driver reuses the two-package `--kde-save`
build and the existing application-update interruption child. The child
performs the actual replacement of an inert predecessor with the signed
0.1.0 AppImage. It stops after rename, before directory sync and the
`activated` journal. The parent sees the exact PID/start identity and a Busy
result from the same admission lock. The journal still names the original
inode as current and the published inode as candidate. The candidate pathname
is absent. The parent then kills and reaps that owned process, reacquires the
lock and rechecks the stage, original path and private backup.

The AppImage started with the same signed bytes and keyring as the adjacent
completed-stage control. Both runs kept recovery required and runtime
verification unavailable. Only the completed `activated` journal let
Updates report the AppImage file as verified. The interrupted `activating`
journal produced `Application file: could not be verified.`. Both starts
withheld Review and Install. Explicit Check and Download triggered the
only two requests to the qualification loopback feed in each run.

Both real KDE SaveFile sequences cancelled once, then published exact signed
0.2.0 bytes at the offered lowercase `.appimage` pathname. Both original
paths, stage directories, journals, authority files, backups and locks
survived byte-for-byte. Starting the new copy reported recovery clear and
opened the same saved Project. All four AppImage lifetimes closed normally.
The run uses qualification trust and isolated AppData. The crash was a
process death, with power-loss durability and stage retirement still open.

The passing artifacts are
`runs/packaged-recovery-action/20261125-kde-rename-r1` (interrupted) and
`20261125-kde-rename-r2` (completed control). The control uses separate
regular file copies of the two R1 AppImages with the exact same hashes and
trust. Use the same private KDE wrapper in Replay, passing
`--kde-save-after-replace` for the interrupted branch and
`--kde-save-default` for the completed control.

The initial application-update suite found two failures in the controlled
Main close fixture. The actual close region now aborts and awaits KWallet
setup before SQLite finalization, while the fixture omitted both ports.
The corrected fixture holds wallet settlement and checks that Main has
sealed the data without closing SQLite or starting Install. Releasing the
wallet allows the existing exact-artifact and error paths to settle. The
full rerun passed 674 cases with one unsupported-platform skip.
Removing only the wallet wait in an isolated source copy failed the new
assertion because SQLite had already closed. Restoring the source exactly
passed the same case. App build, full typecheck, scoped ESLint, formatting
and syntax checks passed.

The independent readback verified both release signatures, the exact ASAR and
wallet helper, 13 source pins, 42 ASAR members, four D-Bus SaveFile pairs and
four closed Project and SQLite snapshots. The Electron executable pin recorded
by the builder is from before fuses are applied. The audit checked the final
SquashFS executable separately. It confirmed that all 32 recorded AppImage
process identities and the interrupted producer had exited. Both branches
used a single inherited 4 GiB scope with zero swap. The highest sampled peak
was 1,907,216,384 bytes.

Cleanup removed 2,278,641,664 allocated bytes from the two private payload
and scratch pairs. The receipt verifies 71 remaining files, including exact
copies of the four stage members and the lock from each branch.
