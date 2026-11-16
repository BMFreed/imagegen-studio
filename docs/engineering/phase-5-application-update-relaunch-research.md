# Exit-synchronized AppImage relaunch handoff

Base: `bef4e44ca08f2a1d5bc7a9794d75f7a606684217`, clean master at entry.
High risk: executable handoff and irreversible app-data close. Supporting contract:
[Application Updates](../features/application-updates.md), PP-002, research/review
protocols and artifact lifecycle. Public Install remains unavailable in this slice.

## Fresh source and disclosed gap

Read clean InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1`:
`model_install/install_staging_ledger.py` marker/claim/persist/transfer;
`model_install_default.py:_install_path_with_info_claimed` → `_restore_moved_path`,
`app/util/no_replace.py`; `session_processor_default.py:stop` and `invoker.py:stop`.
Reuse the existing adapted exclusive staging/intent/retention and close barrier.
Read launcher `c267bdb439519216b277a7a8c6ad408b9d79efce` updater/main-process
callers and builder/build-linux sources; installed electron-updater6.6.2
BaseUpdater → AppImageUpdater deletes current and launches before quit. That unsafe
replacement/handoff absence was disclosed before adding this narrow platform adapter.
No independent subprocess helper, queue, classifier or shutdown state machine is added.

Primary pinned Electron44.4.5 sources freshly read:
[App::Relaunch](https://github.com/electron/electron/blob/v44.4.5/shell/browser/api/electron_api_app.cc),
[relauncher](https://github.com/electron/electron/blob/v44.4.5/shell/browser/relauncher.cc),
[Linux synchronization](https://github.com/electron/electron/blob/v44.4.5/shell/browser/relauncher_linux.cc),
[public API](https://www.electronjs.org/docs/latest/api/app#apprelaunchoptions).
The C++ binding returns a bool despite TypeScript's void declaration. The old
version's helper handshakes parent-exit monitoring before executing a specified
path. A literal true acknowledges helper setup, not exec, new-version readiness,
SQL migration or image engine readiness. False/throw does not prove no child exists:
a helper may already have launched before handshake failure. Never automatically
rollback or retry after any attempted callback. Qualify the actual pinned runtime;
unsupported Electron versions yield no scheduler, while Check/Download still work.

## Same owner and finite consumer

Extend the actual activated owner with `handoffRelaunch(schedule)`. Persist
`relaunching` intent, verify owned target/backup/journal independently of native
cache, then invoke the synchronous callback inside final fresh-FD guards without
an await. Only literal true succeeds. Every capability becomes terminal after
handoff; older verifiers/rollback refuse without poisoning its journal. A refused
pre-call guard is not-attempted; any callback attempt/nontrue/throw is uncertain.
Keep all recovery material and never automatically quit/rollback/retry there.

The adapter captures native app.relaunch and receiver, passes only the exact
current AppImage path and a fixed native `--appimage-extract-and-run` argument; no renderer path, inherited CLI arguments,
process.execPath fallback or direct spawn is allowed. It neither quits nor closes
resources. Main injects this private scheduler into ApplicationUpdateService.
`installAfterClose(version)` checks the captured synchronous finalized/no-tabs
assertion and scheduler before any stage creation, then consumes the existing
stage→backup→activation→handoff path for the current signed native artifact.
No new IPC/UI action invokes it. Preview/Download/ordinary Close stay unchanged.

Future Install must use the existing normal close flow, with no stage writes on
pre-close Cancel. After finalize, any failure requires a sealed normal-exit path:
SQLite is disposed, so releasing the UI back to editing is invalid. The current
normal Main close catch is not repurposed here. The native qualification fixture
uses this sealed ordering explicitly; it is not full production Project close,
public Install or crash adoption. Unsigned journal facts cannot authorize recovery.

## Evidence plan and boundaries

Real FS tests cover terminal true/nontrue/throw/thenable, coalescing, consumed
capabilities, foreign same-byte target/backup/journal tamper, cache loss and no
callback on a failed guard. Signed native service integration uses controlled
metadata/transfer/scheduler ports and checks refusal before stage when unavailable,
unclosed, wrong version or metadata-only. Full typecheck/build/scoped lint follow.

Native proof uses two minimal Electron/AppImage qualification bodies with the
actual production service/staging/adapter/GenerationAppShutdown and controlled
checker/source/close resources. Real canonical signature validation binds B bytes.
Observe old FUSE/normal exit, new extracted body version/lock and target/cache/backup identities.
A fixture DB is not production Project persistence/migration qualification.
Use the existing builder/runtime and smoke-owner process-boundary patterns,
isolated XDG roots, APPIMAGELAUNCHER_DISABLE=1, no host integration/HOME override,
no foreign process termination. Distinguish FUSE from extract-and-run and physical
Main exit from launcher exit. Retain exact payloads, errors and limits before idle
cleanup. Serial4GiB, zero swap,600s; two images/one stage have a concrete reason,
no ML copies. Root40GiB protected budget exception,45GiB free at entry.

Public Install/relaunch flow, crash recovery/adoption, shipping publisher and
final migration/protocol/runtime acceptance remain open; promise statuses unchanged.

## Native discovery and corrected runtime profile

The initial empty-args proposal did not pass native qualification. A real helper
returned true and old Main exited0, but no B startup receipt arrived. A subreaper
observer (reap-only, no signaling) captured the actual helper exit0 followed by
a child exit127. Thus the old-FUSE/helper-crash hypothesis was not established.
The exact same B bytes start manually and close normally. Under
`setpriv --no-new-privs`, they instead fail127 with `fusermount: mount failed:
Operation not permitted`. Under the same flag plus native extract-and-run, B
reaches JavaScript and the old FUSE-only fixture assertion refuses as expected.
These are separate diagnostic outcomes, not accepted relaunch or semantic RED.

Fresh Electron-pinned Chromium launch sources explain the default helper's
irreversible NoNewPrivs inheritance; the later allow-new-privileges option cannot
clear it. The fixed adapter uses the existing AppImage type2 runtime extraction
mechanism rather than a custom helper or privilege escalation. This is a narrow
profile for this pinned builder/runtime, not a claim that arbitrary signed ELFs
support this option. The updated native fixture must prove A on real FUSE, B in
an actual extracted directory, NoNewPrivs status, and normal lifetime cleanup.

Primary sources: [Chromium defaults](https://raw.githubusercontent.com/chromium/chromium/152.0.7977.130/base/process/launch.h),
[launch implementation](https://raw.githubusercontent.com/chromium/chromium/152.0.7977.130/base/process/launch_posix.cc),
[kernel no_new_privs](https://www.kernel.org/doc/html/latest/userspace-api/no_new_privs.html),
[AppImage runtime](https://raw.githubusercontent.com/AppImage/AppImageKit/master/src/runtime.c).
The actual packaged AppRun was read with unsquashfs at recorded offset188392;
it does not change cwd, and the runtime replaces APPDIR/APPIMAGE for the new body.

Two earlier excluded setup attempts assumed one cgroup and reliable initial
`/proc/PID/environ` keys. Both old fixtures closed normally without any stage or
handoff. R2 uses the existing qualification-resource-limits owner: both Main
processes pause before large hashes, exact PID/start/executable/root receipts
and scope identities admit work, each owned group and launcher<=1GiB, three
128MiB watchdogs keep the aggregate<=3.375GiB, zero swap. Initial kernel-env keys
are checked if present but are not a substitute for the owned-process proof.
No kill authority or independent cgroup manager was added.

## Executed result

Root ran the final changed-owner/update/shared/close tests: **323 cases,322PASS,
one unsupported-host SKIP,0FAIL**. Full `pnpm run typecheck`, `pnpm run app:build`
and scoped ESLint passed. An initial authored adapter-test narrowing error was
fixed before the final typing pass; the failed log is retained. No renderer,
prototype or Python changes require a repeat of their unchanged matrices.

The isolated same-owner semantic mutation bypasses only literal-true admission.
The actual false callback is reached once; the mutant wrongly succeeds and gives
the precise semantic RED. Original→mutant→original is **0→1→0**, with adjacent
true-callback GREEN and exact workspace/source restoration. Setup failures,
native FUSE denial and timeouts are not counted as semantic RED.

Final `native-normal-extract-r1` uses freshly built revisionr3 packages with the
actual production owners and canonical verifier. A0.1.0 starts on real FUSE with
NoNewPrivs0; after the actual finalized SQLite close, stage/backup/activation,
the native helper returns true with NoNewPrivs1. Old Main108714 exits normally;
B0.2.0 Main109328 starts inside the runtime's actual extracted AppDir with
NoNewPrivs1, obtains the same lock/profile and reads the same sentinel row.
It then closes normally. Both app-quit/process-exit codes are0; wrapper exit0,
owned scopes/helper physical exit, old FUSE unmount and automatic extracted
directory removal are independently observed by the driver. Target is exact
signed B, backup is exact A, cache is unchanged, current/backup inodes are
independent and journal remains terminal `relaunching` intent. Fixture metadata,
transfer and file authority are controlled; the service, signature validation,
filesystem transaction, native helper and packaged startup are real.

The final native run completed in14.923s. Launcher and each owned Main scope are
bounded at1GiB; three128MiB watchdogs give a maximum recorded aggregate ceiling
of3.375GiB, zero swap,600s outer deadline. Source Electron bytes are unchanged
after packaging; exact fixture sources/bundles/package hashes are retained.
Earlier two setup exclusions, two actual empty-args/FUSE relaunch failures,
manual-start GREEN, NoNewPrivs/FUSE denial and extraction diagnostic are retained
separately. No foreign process, model/runtime or ordinary app data was modified.

Final independent **source-only** review is CLEAN, including the corrected
fixed runtime argument and its callers. This is separate from Root's executed
checks/native result and from retained-byte verification. It does not establish
production Studio Project Save/Discard/Cancel close, SQL migration compatibility,
postcrash recovery, arbitrary AppImage runtime support or shipping readiness.

Evidence owner:
`~/.codex/artifacts/imagegen-studio/runs/application-update-relaunch/20261116`.
Use its `qualification-summary.json`, `native-normal-extract-r1-result.json`,
`native-package-manifest-r3.json`, `mutation.json`, final check receipts and
retention/audit records. Payload reconstruction must materialize independent
regular files from archive-internal dedup references before any new current/cache/
backup experiment; old PID/inode facts are historical observations, not authority
for resume. No startup or recovery may be authorized from an unsigned journal.

Root verified and retained all **6321 entries,0 omissions** before exact idle
cleanup of this run's `payloads` and `t-aurl-1116`; **3730657280 allocated bytes**
were released. Archive-internal dedup preserves631 logical copies and modes
without filesystem hardlinks on reconstruction. The archive is1151697756bytes
(SHA256 `1f1cc877c62dad5631e73f34252fe17bf0eeb0a44591aa58b88086a553a64c26`).
Its inspected compact-evidence exception is1.1GiB, preserving the three native
package revisions and exact failure/control bodies until the public Install/
recovery acceptance checkpoint can release them. No shared dependency, foreign
process or external host-integration file was cleaned. Lifecycle is `retained`
with empty payloads/dependencies. Independent retained-byte results, distinct
from Root's runtime and retention verification, are recorded in `final-audit.json`.

Next finite consumer is the public Install action through the existing Project
close flow, including Cancel before any stage write and a sealed failure path
after SQLite disposal. It still needs startup/recovery and copied-state migration/
protocol acceptance before release; this private handoff does not enable it.
