# Application update interruption and the next signed release

Base `81c56d2f465b70fe08135b1f9fdfc82c851b7ea1`. The
[Application Updates contract](../features/application-updates.md) requires
explicit consent and preservation of executable and Project recovery data.
This stage exercises owner death, durable stage state and the next update
admission. The bytes are signed test fixtures. The actual application
transaction and kernel lock run, with controlled network, close and scheduler
ports. The fixtures never execute an AppImage or open an Electron window.

## Current donor

Clean InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1` was reread at
`invokeai/app/services/model_install/install_staging_ledger.py:103–219,700–804,881–902`
and its startup caller
`invokeai/app/services/model_install/model_install_default.py:337–344,738–768`.
It publishes an exclusive claim with Linux process identity, durably replaces
the marker, and reacquires ownership before acting on staging. It preserves
ambiguous or recovery-marked files. The
`invokeai/app/services/session_processor/session_processor_default.py:85–91,1061–1102`
shutdown and `invokeai/app/api/dependencies.py:128` callers require the
previous owned workers to settle before starting successors.

The clean Launcher `c267bdb439519216b277a7a8c6ad408b9d79efce` uses the
Electron single-instance lock in `src/main/index.ts:42–48` and calls
`src/main/updater.ts:14–65` through `src/main/main-process-manager.ts:173`.
Its updater delegates to `quitAndInstall`. The checked local
`electron-updater` 6.6.2 `out/AppImageUpdater.js:72–110` changes the
`APPIMAGE` target without Studio's participating-writer lock. Launcher
shutdown also does not establish physical exit of all its children.

Invoke's conservative retention and re-check rules inform the existing
Studio owners. There is no reusable signed AppImage retirement, proof of the
loaded executable body, or global exclusion of legacy/unleased writers.
This gap was disclosed before the qualification changes. No recovery,
retirement, automatic rollback or permission to execute backup A was added.

## Interrupted and adjacent paths

The [child fixture](../../src/main/application-updates/test-fixtures/application-update-interruption-child.ts)
uses real admission, backup and activation. It takes one of two deliberate
cuts while holding the exact kernel lock. The test verifies PID and Linux
start ticks, confirms a participating attempt gets `BUSY`, then sends the
owned child `SIGKILL` and confirms physical exit and the ability to reacquire
the same lock. The phase is written by the actual stage owner.

| Cut                                            | Durable state and fresh inspection                                                                                                                                                                                                     |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Immediately before the synchronous replacement | Journal is `activating`. The original A, executable candidate B and private backup A all remain. The stage is retained and target remains unverified.                                                                                  |
| After activation returns, before any relaunch  | Journal is `activated`. The target is exact signed B, the candidate pathname is consumed and backup A remains private. Fresh offline inspection verifies B's target bytes and retains the stage. Runtime authentication is unverified. |

For both cuts, the real service sees separately signed C from its native
checker and cache parser. Review and preflight refuse before impact, close or
scheduling. The checks exercise both the captured startup disposition and
the fresh veto with a previously clear startup. Target, journal, authority,
backup, candidate where present, lock and original signed B cache maintain
their enumerated identities, modes and bytes after owner death and refusal.

A separate test compares the same B bytes initialized at an independent
pathname. That path passes C Review, preflight, backup and activation; the
test observes exactly one handoff to its own pathname and verifies its backup
is B. The original path and retained stage survive this adjacent transaction.
This is a transaction control with an observed scheduler call. It grants
no product reinstall action or native restart acceptance.

An additional real Node subprocess bypasses the cooperating protocol in an
owned fixture. While the cooperating process holds `flock` and other
participants receive `BUSY`, the unleased process replaces B with its own
inode and body. Fresh offline inspection stops authenticating the target.
The prior diagnostic remains an observation of the earlier state. The
entire original stage is unchanged. This models an unleased writer and
does not execute an old app build.

Normal packaged A→B and C Review refusal with an editable Project remain
the separate [previous AppImage evidence](./phase-5-application-update-startup-authority-research.md#packaged-native-qualification).
Recovering onto the original pathname and retiring the original claim and
backup require an ownership contract beyond the current cooperating lock.
An explicit signed reinstall at a fresh path is a candidate for recovery
without touching the old path. Invoke's no-replace publisher in
`invokeai/app/util/no_replace.py:57–95` offers an atomic publication pattern
for that design. A direct copy into an executable destination can expose
incomplete bytes and does not satisfy the application's publication contract.
All eight public promises remain **«Пока не обещать»**.

## Execution and retained evidence

The three new scenarios pass in the full application-update matrix.
The matrix finished with **594 PASS, zero fail, one platform skip**. The skip
is the unsupported-host relaunch case on Linux x64. Full typecheck, app build,
scoped ESLint, Prettier and whitespace checks passed. Vite reported the
existing chunk-size warning. An initial focused setup failed before either
cut because the fixture cache file inherited group-write permission. The
fixture now creates that copy at mode 0600. Its failure log is retained.

A mutation in an isolated source copy removed retained-stage admission from
Review and preflight. Both crash tests reached the actual Review consumer
and failed with the missing recovery-required refusal. The clean Review and
unleased-writer controls continued to pass. All four selections passed again
after exact source restoration. This is sensitivity at Review, not a separate
preflight mutation result.

The independent source and receipt review confirmed the disposal owner is
registered before async capture, checked the successful wrappers and compared
the interrupted-owner identities with the live kernel. The test run did not
perform an independent native app restart or power-loss test. Each root check
used an inherited 4 GiB cgroup, zero swap and a finite service deadline.

Evidence lives under
`~/.codex/artifacts/imagegen-studio/runs/application-update-interruption/20261118-r1`.
The matrix, build, mutation receipts, six source pins, exact failed setup log,
and readback of eight process identities are retained. The isolated source
copy and compilation scratch were removed after restoration and physical
exit, releasing 26,685,440 allocated bytes. No previous retained package,
runtime or model was reused or removed.

## Process death after rename and before the activation journal

The follow-up on `75ce489b` re-read InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1`.
`invokeai/app/services/model_install/install_staging_ledger.py` publishes an
exclusive claim, writes a durable marker and preserves incomplete markers at
startup. Its `model_install_default.py` start and transfer callers and
`invokeai/app/util/no_replace.py` expose the separate publication and marker
steps. Launcher `c267bdb439519216b277a7a8c6ad408b9d79efce`
`src/main/updater.ts` delegates restart and install to `quitAndInstall`.
The follow-up exercises Studio's existing staging owner at that boundary.

The test child intercepts only the exact FD-anchored candidate-to-target
rename during activation. It completes the actual rename and checks the
published inode before waiting for SIGKILL. The owner holds the real
admission lock. The replacement has happened, and the production owner
has yet to sync the directories or write `activated`.

The target is exact signed B and executable. The journal still says
`activating` and records A as current and B as candidate. The candidate
pathname is consumed and the private A backup remains byte-exact. After
the child exits and the kernel lock is available again, startup reports
`retained` with target and runtime unverified. Signed C is available to
download. Review and preflight refuse it before impact, Project close or
scheduling. The independently initialized exact B pathname passes C through
the same transaction with a controlled scheduler. Both adjacent fault cuts
still pass.

The focused receipts contain three passes. The application-update, package
and publisher suite passed 672 cases with zero failures and one platform
skip. Reordering TypeScript type fields for lint left emitted JavaScript
identical, and all three cuts passed again on the final source. Typecheck,
app build and changed-file checks passed. Independent review
checked the test, its transcript and physical exit of the three reported PID
identities. Its evidence covers SIGKILL before directory sync. Power-loss
durability, native relaunch and stage retirement are separate checks.

The transcripts are retained under
`runs/application-update-publication-cut/20261121` in the artifact root.
The normal test teardown removes the owned stage fixtures.

## A subsequent release on the used recovery path

Re-read clean InvokeAI `64ff2c600f04d220e470fdaeec570bd402af42a7`.
`invokeai/app/services/model_install/model_install_default.py` restores
pending installs through `invokeai/app/services/model_install/install_staging_ledger.py`
and preserves recovery-marked directories. Clean Launcher
`c267bdb439519216b277a7a8c6ad408b9d79efce` calls
`src/main/updater.ts` from `src/main/main-process-manager.ts` and
hands installation to `quitAndInstall`. Its single-instance lock
is profile-scoped. Ownership of a legacy process's executable path
remains unresolved in both donors. Studio preserves the old stage
and backup.

The existing SIGKILL fixture now continues through signed D after
activating C on the independently initialized B path. Offline
inspection authenticates C at that path and reports its runtime
unverified. A fresh C source and a previously clear startup
observation still refuse D in both Review and preflight. The real
retained-stage admission runs before impact, close or scheduling.
The old stage and the stage on the used recovery path keep their
exact members, inode and byte identities. The latter still holds the
B backup, and D remains downloaded. The same D passes Review and
preflight on a fresh path containing the same C bytes.

The integration file passed 44 tests with zero failures or skips.
This transaction control uses the real signed service and staging
owners with a controlled scheduler. The separate
[native A–B–C result](./phase-5-public-appimage-recovery-research.md#native-result)
covers Project Save and restart. A lifecycle for safe retirement
of the used paths is still open.

## A signed runtime match and an unleased writer

Base `7ba156b4`. Clean InvokeAI
`64ff2c600f04d220e470fdaeec570bd402af42a7` uses the claim and revalidation
rules in `invokeai/app/services/model_install/install_staging_ledger.py`.
Its startup caller is `model_install_default.py::start`. The explicit
orphan-removal route in `invokeai/app/api/routers/model_manager.py` also
requires ownership through `invokeai/app/services/orphaned_models/orphaned_models_service.py`.
The existing claims cover participating owners and preserve active and
recovery-marked staging. Clean Launcher `c267bdb439519216b277a7a8c6ad408b9d79efce`
uses a profile-scoped instance lock in `src/main/index.ts` and delegates
installation through `src/main/main-process-manager.ts` and
`src/main/updater.ts`. Its pinned `electron-updater` 6.6.2 can replace
`APPIMAGE` without Studio's advisory lock. These donors do not supply
exclusion of already shipped AppImage writers.

The startup test now runs the owned replacement process with both the v1
and v2 release fixtures. In the v2 case, the signed target and declared
ASAR and executable files match while the real cooperating lock is held
and the separate Node process is waiting. That process replaces the
target inode. Another cooperating writer still gets `BUSY` and a fresh
inspection reports both target and runtime unverified. The earlier
observation, runtime fixture files, stage and backup remain intact.
The fixtures exercise actual signatures, file descriptors and flock.
The synthetic AppImage and runtime files are never executed.

Retirement still requires exclusion of all supported writers for the
duration of the operation. A matching startup snapshot and a held or
reacquirable update lock establish different facts. The current path
retains the stage and backup when writer participation is unknown.

## Recovery without a newer release

The source review at Studio `b4198ade` found a gap in the fresh-path action.
Bundled electron-updater 6.6.2 `out/AppUpdater.js` reports no update for
the same version. Studio's `electron-update-checker.ts` clears the signed
update selection on that result. `ApplicationUpdatesModal.vue` offers
Save recovery AppImage only after a signed download. A verified startup
target cannot supply that download. The documented B-to-C and C-to-D
scenarios each had a later release in the qualification feed.

The clean InvokeAI donor at `64ff2c600f04d220e470fdaeec570bd402af42a7`
uses explicit choice, verification and a no-replace publication in
`invokeai/app/util/database_copy.py` and `invokeai/app/util/no_replace.py`.
The clean Launcher at `c267bdb439519216b277a7a8c6ad408b9d79efce` has the
same availability gate in `src/main/updater.ts`, called from
`src/main/main-process-manager.ts`. Neither has a signed AppImage recovery
copy of the currently running version.

Studio now selects the verified retained target when the feed reports
up-to-date, the check fails, or checking is unavailable. A downloaded
signed release retains its existing path. Both use the existing
version-only IPC and chooser ownership checks. Main repeats the completed
stage inspection using bundled trust before and after the chooser.
The inspection verifies the target artifact against the signed version
and passes a private assertion of source and stage identities to the
publisher. It holds no descriptors across the chooser.

The retained-source route uses the current local AppImage as the
source, including a lowercase extension. The publisher checks its
captured file identity, copies and hashes the bytes, then rechecks the
target, journal, authority and backup identities immediately before the
create-only link. The unsigned backup is never copied. Cancel and refusal
preserve existing update recovery data. Existing uncertain-publication
handling still applies. This path offers a separate copy and supplies no
right to replace the original, retire the stage or exclude legacy writers.

The old AppImage reached the signed same-version Check result and the
exact missing-Save assertion. The real Main action tests remove the
native download, exercise Cancel and an occupied path, confirm exact
executable bytes and preserve the original stage. They refuse a stale
verified startup observation and a same-byte source replacement during
the chooser. Removing the post-copy stage identity check in an isolated
mutation let publication proceed after the stage changed. Restoring the
guard made the same test pass again.

In the candidate KDE Wayland run, the signed loopback feed offered the
same version and returned only one successful metadata response. The
system Save dialog returned Cancel once and then accepted the lowercase
default name. The two normal application lifetimes ran the same version
from different executable inodes. The fresh path reported recovery clear
and reopened the exact saved Project. The original AppImage, stage,
backup and participating lock stayed intact. Both releases used
qualification-only signing keys.

The independent byte readback checked the four signed packages and their
embedded ASAR and Electron, the two raw KDE responses, the original and
published file identities, and the preserved stage and lock. It verified
three closed Project and SQLite pairs with 30 migrations each, and
confirmed physical exit of 24 recorded process identities. The RED and
GREEN receipts are in `runs/packaged-recovery-action/20261127-current-red`
and `20261127-current-final` under the local artifact root. The earlier
passing candidate remains recorded under `20261127-current-green`. The
final package was rebuilt and rerun after adding the renderer alert keys
and reordering the shared helper for lint.
Cleanup after physical exit reclaimed 3,961,278,464 allocated bytes across
the three scopes. The compact proofs and closed snapshots are listed in
each run's `retention.json`.

The focused window-close suite uncovered a preexisting harness error on
`765fdabb`. Its extracted Main code omitted the catalog lock helper.
The fixed harness uses the actual helper and again verifies that an
admitted Open drains while queued or new catalog operations refuse
during ordinary close.

The final focused Node run passed 679 tests with one platform skip for
unsupported-host relaunch. All 41 Updates Chromium tests passed, including
the same-version Save and the downloaded-release control at 900×620.
Typecheck, scoped lint and AppImage packaging passed. Independent source
review found no blocking issue.

## Archive a dedicated old AppImage folder after exit

Re-read clean InvokeAI `64ff2c600f04d220e470fdaeec570bd402af42a7`.
`invokeai/app/services/model_install/model_install_default.py::start` calls
`install_staging_ledger.py::sweep_stale_claims` and
`remove_dangling_staging`. The ledger checks the specific recorded owner using
Linux boot identity and process start ticks and preserves recovery-marked
or uncertain trees. The explicit removal route in `api/routers/model_manager.py`
calls `orphaned_models_service.py::delete_orphaned_models`, which refuses
protected data. `invokeai/app/util/no_replace.py::rename_noreplace` provides
the same-filesystem, no-replace primitive for moving a directory as one unit.

Clean Launcher `c267bdb439519216b277a7a8c6ad408b9d79efce` uses the Electron
profile lock in `src/main/index.ts`. `src/main/main-process-manager.ts`
calls `src/main/updater.ts`, which hands off to `quitAndInstall`.
The pinned `electron-updater` 6.6.2 `out/AppImageUpdater.js::doInstall`
writes by pathname and does not acquire Studio's writer lock. Neither
donor excludes all prior AppImage processes with other profiles or
uncooperating writers. The Invoke database instance lock in
`shared/database/startup.py` and `database.py` is scoped to an Invoke
server database.

Studio uses the donor's preserve-on-uncertainty rule. The bounded manual
procedure requires exclusive access to the local volume outside the
normal session. A recovered copy must already reopen the Project from a
different folder. Move the dedicated old folder as one directory to an
unused sibling name on the same filesystem. This keeps the original
image, complete stage and stable lock together, with the backup still
inside the stage. The archived journal retains its original paths.
Folders shared with user data or unrelated programs stay outside this
procedure. The application gains no deletion, rollback or retirement
authority.

A separate owned-process control opened the original directory before
rename and waited. The parent performed the no-copy, no-replace move
and observed that the old pathname was gone. The same live PID and
start identity then used its held directory descriptor to write a marker
into the archived directory before exiting normally. A successful move
alone therefore cannot stand in for physical exit or exclusive access.

The opt-in native `--kde-retire-current` scenario used the exact compiled
Studio application from `db4072b6`, rebuilt as signed qualification
AppImages on ext4. Updates checked the current version through the local
feed and KDE saved the verified image in a sibling folder. The original
and recovered AppImages each closed normally with their recorded process
identities gone. The driver verified that the dedicated old folder
contained just the original executable, its stage and the lock.

GNU `mv --no-copy --update=none-fail -T` refused an occupied empty sibling
and preserved its inode. The same command moved to an unused sibling and
the driver synced the parent directory. The source path was absent. The
archived parent and stage kept their inodes, and the original image and
all stage and lock files matched their previous bytes and identities.
The third lifetime used the separate verified copy. Updates reported
recovery clear and the original clean Project revision reopened. After
normal exit, the archive still matched and the old name was still absent.
The three lifetimes used extract-and-run, and the fixture controlled all
launches from the tested paths. Actual rescue boot and ownership of other
processes on an end-user volume were outside this qualification.

Independent readback checked the two signed packages, 42 compiled file
hashes bound to the prior audited build, the two real KDE responses,
both directory inodes and all six archived file witnesses. It verified
the same Project in three closed SQLite snapshots at 30 migrations and
the physical exit of 24 recorded processes. It also checked the live
descriptor control's marker and the controlled writer's exit against
the kernel. This fixture has one synthetic Project and no installed
models or runtime.

The 127 focused tests, scoped lint, syntax and formatting checks passed.
The durable receipts and compact witnesses are in
`runs/packaged-recovery-action/20261127-retire-r1` under the artifact root.
Cleanup removed the owned test packages, profiles and scratch after
physical exit, reclaiming 1,360,523,264 allocated bytes.

## Archive one old AppImage from a shared folder

At clean InvokeAI `64ff2c600f04d220e470fdaeec570bd402af42a7`,
`invokeai/app/api/routers/gallery_maintenance.py::archive_untracked_images`
calls `services/gallery_maintenance/gallery_maintenance_default.py::execute`,
`_archive_snapshot_files` and `_archive_file`. The service rechecks the
identified entries, refuses overwrites, syncs directories and preserves
uncertain items at the locations where they survived. For a same-filesystem
move, `invokeai/app/util/no_replace.py::rename_noreplace` wraps
`renameat2(RENAME_NOREPLACE)`. The model install caller
`services/model_install/model_install_default.py::_restore_moved_path`
uses that primitive on each identified entry. Its directory-transfer
caller keeps recovery data on ambiguous failures.

Clean Launcher `c267bdb439519216b277a7a8c6ad408b9d79efce` still uses the
profile lock in `src/main/index.ts` and
`src/main/main-process-manager.ts` calls `src/main/updater.ts` for
`quitAndInstall`. Neither donor provides an atomic two-entry AppImage/stage
move or excludes older AppImage writers. Studio's shared-folder procedure
uses the existing manual offline prerequisite, an exact completed stage
association, and two separately synced no-replace moves. It moves the old
executable first. Until that succeeds the stage still guards the original
path. After it succeeds the original executable is absent and the stage
still guards the path. The second move archives the stage as a whole with
the backup inside. The original lock remains in the shared folder with
the same inode. External legacy ownership, automatic cleanup and a
rollback from the archived journal remain outside the procedure.

The opt-in `--kde-retire-mixed-current` scenario rebuilt the two signed
qualification packages from the same 42 compiled file hashes used by
the dedicated-folder run. The original AppImage and the KDE-saved
verified copy closed normally before either move. The old parent also
held an actual unregistered neighboring `.igs` and fixture files for a
neighboring AppImage, stage and lock.

On ext4, GNU `mv --no-copy --update=none-fail -T` refused an occupied
image destination before any move and an occupied stage destination
after the old image had moved. The refusal fixtures were retained
separately for readback. At the synced split, the old executable was
absent and its stage and backup remained at their original location.
The actual retained-stage inspector returned `retained` with an
unverified target. After the second move, the old stage was absent,
the archived stage and image retained their inodes and contents, and
the original lock and neighbors retained their exact identities.

The copy reopened the same clean Project revision in a third normal
lifetime with recovery clear. The two moves and split were observed in
a controlled environment with enrolled process exit. These checks do
not simulate power loss, boot a rescue system, or establish ownership
of external legacy writers. Release publisher configuration and
readiness stay separate.

Independent readback verified the two signed packages, 42 compiled file
hashes, both native KDE responses, the archived inodes and file bytes,
the retained original lock, the four neighboring entries and both
occupied destinations. It matched three closed Project and SQLite pairs
at 30 migrations and checked physical exit of 24 recorded processes.
The operation order and inspector result came from the native driver.
The 127 focused tests, scoped lint, syntax and formatting passed.
Evidence lives under `runs/packaged-recovery-action/20261127-retire-mixed-r1`
in the artifact root. Cleanup retained the compact proofs and reclaimed
1,360,580,608 allocated bytes after the native and audit processes exited.

## Guidance after a stage appears during the session

The existing Main stage-veto control proves that a new retained stage
refuses Review and Install preflight before close even after a clear
startup observation. The live Vue renderer previously showed the generic
recovery error with Refresh preview as the available follow-up. Reopening
the dialog reads the same immutable startup snapshot. That action cannot
recheck disk or expose Save recovery during this session.

For a typed `APPLICATION_UPDATE_RECOVERY_REQUIRED` reply, the existing
Review and Install alerts now ask the user to save their work, restart
Studio and reopen Application Updates. The change maps the message in
the renderer. The Main veto, startup snapshot and recovery save admission
retain their original owners. Other errors keep their supplied text.

The before/after browser checks use the actual renderer with controlled
Main responses. Review was checked at 1280×800 and 900×620 with a
not-checked startup result. Install was checked at 900×620 with clear
startup and an earlier successful Review. The new guidance and dismissal
action fit at both sizes. After the refusal, manual dismissal and reopening
leave the same signed download available, with no close or secondary
mutation calls. The neighboring source-change controls keep their own
error text. The first focused rerun stopped at a duplicate type import.
Removing that import let all six reach their actual renderer assertions.

The application-update matrix passed 640 tests with one existing platform
skip. Typecheck, scoped lint and the application build passed. The first
full Chromium run reached 323 passing tests at its 600-second limit. A
second run used Playwright's test list to select exactly the 49 remaining
tests. A title and source-location comparison against the original list
confirmed 372 passing cases without overlap across the two receipts.

The test and screenshot receipts are retained under
`runs/application-update-late-recovery/20261126-r1`. After physical exit,
cleanup reclaimed 1,148,301,312 allocated bytes and rechecked 51 retained
files, including the before/after screenshots. The new text is qualified
in Chromium against the renderer port. The signed AppImage recovery
action has a separate
[native A–D qualification](./phase-5-packaged-recovery-kde-next-update-research.md#a-subsequent-signed-recovery-on-a-fresh-path).
