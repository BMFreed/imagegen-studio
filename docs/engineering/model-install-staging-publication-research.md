# Model installation: finalize staging before catalog publication

## Scope and invariant

This high-risk resource-lifecycle fix supports
[PP-004's managed-library contract](../contracts/managed-model-library.md).
An installed exact resource must remain verifiable immediately after publication.
The actual install coordinator, downloader, SQLite repository, filesystem and
ModelService integrity selector are the subjects. Source metadata and download
responses are controlled test inputs; integrity verification is not substituted.

Base revision: `d2b3c6dee85adb3274d4902055ca26455c091951`. Main model production and
tests were byte-identical to this base when the original failure was observed.
The Anima flow-sampling work revealed the existing race during a full concurrent
test run; it did not change these main-process files.

## Confirmed mechanism

`ModelInstallCoordinator.publishContentAddressed` creates a managed hardlink to
the verified staging file and syncs its destination directory. `run` publishes
the catalog and completed job together through SQLite and emits completion before
its `finally` block unlinks the staging hardlink. `ModelService.actualFileStatus`
requires stable device/inode/size/mtime/ctime around the actual byte hash.

Unlinking staging changes the same inode's ctime. A selector that stats the managed
path before cleanup and finishes hashing afterwards therefore reports
`MODEL_FILE_CORRUPT`, despite unchanged bytes, size, inode and mtime.

A deterministic artifact copy retained the actual install/download/repository/
selector path and added only await barriers around existing operations. It
reproduced this refusal with identical expected and actual SHA-256, and ctime as
the only changed fingerprint field. The original full-run failure had no ctime
diagnostic; that exact historical interleaving remains inferred. The neighboring
Anima rollback timeout is separately not localized: its unchanged helper has a
5000 ms deadline and its focused rerun completed in about 1095 ms.

## Change and failure boundaries

Finalize only the current job's downloaded staging links and sync the staging
directory before either normal publication or repair commits SQLite catalog/job
readiness. Reused installed files are not staging-owned and must remain untouched.
Keep the strict integrity guard unchanged. Delaying only the completion event
would leave catalog polling exposed; weakening ctime verification would conceal
actual concurrent changes.

Before this boundary, download/hash/size checks and managed-link preparation are
unchanged. A staging unlink or directory-sync failure must enter the existing
pre-publication failed-job/rollback path. Cancel accepted during staging cleanup
must still be checked before entering commit. Late SQLite publication failure
keeps old repair identity and removes newly prepared managed paths using the
existing cleanup path. Crash before SQLite commit leaves no selectable new group;
startup's interrupted-job/orphan cleanup remains responsible for unfinished work.
Crash after commit has no current-job staging hardlink left to invalidate a
published file when startup cleans staging.

No envelope, new deadline or resource cap is introduced. Ownership is the existing
bounded `staging` list: one primary plus at most two Anima companions, added only
for actual downloads. The finite publication methods are normal
`publishVerifiedInstallation` and `repairVerifiedVersion`.

## Verification plan

Capture the actual pre-SQLite method boundary with an observing wrapper that then
calls the real repository method. Normal install and repair must retain a
neighboring staging file, have no own staging link, expose a single managed inode
link, and preserve pre-commit catalog/job state. Completed selection must pass the
real ModelService hash verification. First run these controls against unchanged
production to obtain assertion RED, then against the fix.

Verify staging-cleanup failure refuses catalog publication; exercise existing
normal install, reuse, update, repair, late publication failure, Anima companion
rollback and cancel tests. In an isolated source copy, restore cleanup to after
publication and completion; the same actual-boundary regression must fail an
assertion. Run TypeScript, scoped lint, formatting and the full relevant suites.

## Executed checks

The original production coordinator failed all three new install/repair/unlink
refusal controls with executed assertions: own `.part` remained at the pre-SQLite
boundary, or an actual unlink permission failure still published `completed`.
These results are saved in `main/staging-publication-red.log` under
`/home/user/.codex/artifacts/imagegen-studio/anima-flow-sampling-2026-10-05/`.

After the fix, the same three controls and the prepared-link cancellation neighbor
passed: **4 executed, 0 failures, 0 skips**. The observing wrappers snapshot
filesystem/catalog/job state and then call the original SQLite method. No test
hook was added to production. The unlink refusal uses actual directory permissions
around a real verified download; cancellation calls the actual coordinator after
managed-link preparation while catalog publication is still pending.

Both complete suites (`model-service.test.ts` and
`anima-install-coordinator.test.ts`) passed **80 tests, 0 failures, 0 skips**,
including existing normal install, versions, duplicate/reuse, repair, failed
companion download, late repair publication rollback and cancellation cases.
Full `pnpm run typecheck`, scoped ESLint, Prettier and `git diff --check` passed.

An isolated source copy executed **5 semantic mutations**, all assertion-killed:
cleanup after completion event, cleanup after SQLite commit, ignored unlink
failure, deletion of another staging owner's file, and omitted final cancellation
check. Baseline and restored runs each passed all 4 controls. Every process printed
its imported copied coordinator URL and SHA-256, checked against mutated bytes;
workspace source remained unchanged. Logs and hashes are recorded in
`main/model-mutation-report.json`. These targeted experiments do not measure an
exhaustive mutation score.

No literal power cut or injected directory-fsync failure was executed. Crash
recovery and sync-error handling are source-reviewed extensions of the same
pre-publication failure path; the real unlink failure, late SQLite refusal and
existing restart/orphan controls provide the executed neighboring evidence. This
fix does not claim full PP-004 completion or new inference/runtime readiness.
