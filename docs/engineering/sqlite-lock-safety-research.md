# SQLite file checks and WAL lock safety

Risk: **high**: the SQLite bootstrap owns operational queue, staging tombstones,
seed cursor and local Project index durability. This gap was found while verifying
[Result sessions and recovery discard](./phase-2b-result-sessions-research.md)
against dirty working tree based on `75531a7`; it must be fixed without narrowing
the reviewed Add/cleanup assertions or hiding the second connection.

## Reproduction and cause

In actual Electron, Discard successfully cleared shadow and every temporary
candidate. Fresh completed candidates remained visible, but main Results reported
no unfinished sibling jobs although the external fixture database had five
pending rows with correct Project/document/session identity. Main Queue counted
eight completed rows and zero pending; the fixture counted eight plus five.

Independent non-GUI reproductions used actual `openAppDatabase` in two Node
processes. Both initially observed the first committed insert. Closing the
secondary writer deleted WAL/SHM paths while the long-lived reader retained their
old `/proc/<pid>/fd` inodes marked `(deleted)`. Reopening the writer created new
sidecars: its count became three while the reader stayed at two. The same control
without post-open raw file checks retained inode identity and reader visibility.
This disproved Results filtering, document/session mismatch and queue drain as
causes of the failed Add precondition.

`ensurePrivateSqliteFiles` opened and closed raw descriptors for the main database
and its sidecars after SQLite had opened them. Closing an unrelated descriptor
can release process-wide POSIX locks that SQLite still believes held; this is
explicitly described by [SQLite's locking guidance](https://www.sqlite.org/howtocorrupt.html#posix_advisory_locks_canceled_by_a_separate_thread_doing_close_).
Pre-open raw checks are also unsafe if another handle to the same database is
already alive in that process. Production currently has one shared main owner
and a single-instance application lock, but that does not justify this bootstrap
breaking SQLite's lock protocol.

## Choice, scope and compatibility

SQLite exclusively owns descriptors of existing database/WAL/SHM files. Safety
checks use filesystem metadata, retain regular-file/owner/symlink/hardlink checks,
and compare identity around bootstrap. A genuinely new main file may be created
exclusively with mode `0600` and closed before SQLite opens it. Sidecars inherit
private main-file permissions. Owned directories keep their `0700` normalization.
Main-file identity is checked before pragmas/migration writes. These metadata
checks rely on the existing stable private owned-root boundary; they do not claim
protection against a hostile same-user process swapping and restoring files
between checks.

Existing shared SQLite files must fail closed with explicit repair instructions,
rather than automatically chmod a path that can follow a substituted symlink or
open/close another descriptor under a live connection. The earlier bootstrap
normalized existing `0644` files automatically; this compatibility change is
intentional. App-created files are already `0600`; users with altered legacy
permissions must close the application and repair them before retrying. Do not
rewrite bytes, delete WAL, truncate databases, change migrations or weaken
`synchronous=FULL` / foreign keys / WAL mode.

This is a bootstrap correctness fix. It does not promise external database editing
as a user feature, multi-writer product synchronization, network-filesystem
support, broader operating systems or a new repair worker.

## Verification plan

Use actual migrated `app_metadata` and actual production bootstrap across child
processes. A long-lived reader must observe acknowledged insert one, secondary
close/reopen, then acknowledged insert two. Verify sidecar identity/visibility and
cleanly stop all children. Include a neighboring overlapping same-process handle
case and keep existing migration, strict-schema, private-file and unsafe-path
checks. Unsafe permissions must preserve original bytes, refuse clearly, then
permit an explicit repair/reopen.

Run an isolated semantic mutation restoring the raw-file checks: the visibility
regression must fail, then pass after restore. Preserve live source hashes.
Rebuild Electron and rerun the unchanged destructive Discard and sibling-cancel
Add scenario with its secondary close/reopen boundary. Run typecheck, lint, full
app tests and sequential native desktop/Generate regressions. Report actual
substitutions: controlled inference is not CUDA/release evidence.

## Evidence

Original diagnosis and causal control are retained under
`/home/user/.codex/artifacts/imagegen-studio/result-sessions-2026-10-01/sqlite-visibility-readonly/`.
Actual production `database.test.ts`: **9/9 pass**, including the two new
acknowledged cross-process visibility and overlapping same-process write-lock
checks. The helper uses migrated `app_metadata`, production `openAppDatabase`,
bounded ten-second readiness/request/exit waits and forced child cleanup on
protocol failure. It does not declare a fake database or read raw live SQLite
bytes. Unsafe permissions preserve bytes; explicit repair reopens successfully.
Existing strict migrations, rollback and symlink/hardlink controls remain green.

An isolated semantic mutation reintroduced raw open/close in existing-file checks:
**9 pass → 7 pass / 2 fail → 9 pass**. The observable failures are a missing
acknowledged second insert and an external write succeeding while the owner still
believes its write lock held. Live source hashes were unchanged. Evidence:
`sqlite-lock-mutation/` beneath the artifact root above. Independent read-only
review found no further proven defect in this scope.

Final full suite: **752/752 pass**, no failed/skipped/canceled; typecheck, lint and
app build passed. Native verification retains secondary close/reopen and the
original exact sibling cancellation assertions; its result is recorded with the
[Results checkpoint](./phase-2b-result-sessions-research.md).
