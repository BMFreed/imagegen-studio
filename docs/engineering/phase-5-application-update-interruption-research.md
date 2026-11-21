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

| Cut | Durable state and fresh inspection |
| --- | --- |
| Immediately before the synchronous replacement | Journal is `activating`. The original A, executable candidate B and private backup A all remain. The stage is retained and target remains unverified. |
| After activation returns, before any relaunch | Journal is `activated`. The target is exact signed B, the candidate pathname is consumed and backup A remains private. Fresh offline inspection verifies B's target bytes and retains the stage. Runtime authentication is unverified. |

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
