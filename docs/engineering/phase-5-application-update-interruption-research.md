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
