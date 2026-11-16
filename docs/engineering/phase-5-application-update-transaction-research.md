# Private application binary transaction

Base: `1e466bd3e831fa6bb23df54a8756db67bf109edc`, clean `master`.
Risk: **High**: executable replacement, retained backup and rollback. Contracts:
[Application Updates](../features/application-updates.md),
[explicit intent](../contracts/explicit-intent.md),
[research](./research-protocol.md), [review](./review-protocol.md),
[artifact lifecycle](./artifact-lifecycle.md).

## Fresh source and engineering boundary

Reread clean InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1`:
`invokeai/app/services/model_install/install_staging_ledger.py` claim/marker/transfer,
`model_install_default.py:_install_path_with_info_claimed` and its rollback caller
`_restore_moved_path`, plus `app/util/no_replace.py`. Invoke persists intent,
copies beside a destination when filesystems differ and retains uncertain recovery
material instead of overwriting foreign paths. Reread its processor stop and
`services/invoker.py:stop` caller: processor/service joins precede database disposal.

Reread launcher `c267bdb439519216b277a7a8c6ad408b9d79efce` updater and callers,
and installed exact electron-updater6.6.2 BaseUpdater/AppImageUpdater. Native install
is before app.quit and unlinks the original first. That unsafe replacement is not
reused; its absence was disclosed. Adapt Invoke's ledger/copy/restore mechanisms
inside the existing staging owner and reuse its current fd/stream/fsync guards.
Runtime pointer installation remains a separate owner, not a pretend executable
installer with fake runtime roots.

This finite consumer is a **private in-process filesystem transaction** after
the caller's app-data close barrier. It does not claim that old Main has physically
exited or that the mounted AppImage/FUSE lifecycle supports a public self-update.
There is no helper or new restart protocol here. After-exit adoption still needs
reauthenticated release authority; the current unsigned journal is not sufficient.

## Intended owner transitions

Extend the same owner that knows current/candidate snapshots and signed native
artifact authority. An external wrapper around the old immutable prepared verifier
would reject its own legal chmod/rename and is not valid. Serialize explicit phases:
`prepared → backing-up → backed-up → activating → activated → rolling-back → rolled-back`.
Consumed old capabilities refuse without writing a failed marker into a legitimate
transition. Unsupported/malformed/existing claims are not automatically adopted.

Backup copies old bytes into `previous.AppImage` as a fresh private0600 inode,
checks exact old hash/identity and fsyncs before the backed-up journal. Target and
cache remain unchanged. Candidate uses the same existing streaming copy owner.

Activation requires a **synchronous, side-effect-free close assertion**, first
before any phase/chmod mutation and again after the final authority await. Main's
private service supplies its own captured assertion; caller callbacks cannot bypass
it. The assertion reads the existing GenerationAppShutdown finalized state and
requires no open Project tabs. It does not initiate Save/close or establish physical
Main exit. A failed first assertion leaves backup-ready preparation available for
a later authorized attempt.

After verification, hold/verify candidate FD, change only its mode to0755 and pin
the resulting exact identity. Persist activating intent. After the last source
authority await, perform final synchronous directory/file/journal/membership guards
and one same-filesystem rename over current with no await in between. Never unlink
current first. Fsync both affected directories and pin the actual published inode
and complete bytes before recording activated. A filesystem result is not evidence
that the new application version started or qualified.

Rollback requires the exact owned published inode and retained backup, not merely
a matching filename/hash. Copy the backup to a separate rollback inode, hash/fsync,
chmod0755 and durably record intent before guarded atomic replacement. The restored
target has the old bytes/mode but a **new inode**. Backup remains. Native cache or
selection revocation after successful activation must not remove rollback authority.
Active/rolled-back verification uses phase-specific owned snapshots, not the consumed
prepared verifier, and never executes either binary.

Errors distinguish proven unchanged from uncertain after possible publication.
Post-rename hash/fsync/journal uncertainty retains every remaining artifact; no
automatic rollback or cleanup may overwrite an unrecognized target. A future crash
recovery owner must inspect real identities and authenticated context, not trust a
phase string alone. Cooperative claims do not provide hostile same-UID filesystem CAS.

## Verification plan and limits

Use real owned files for backup/activate/rollback, open old FDs across rename,
foreign same-byte inode replacement, changed backup/candidate/journal, rejected close,
late revoked close/cache authority, duplicate/concurrent operations and old-capability
consumption. Verify exact target/cache/backup bytes and independent inodes; do not
claim original target inode restoration. Test the real service gate and the existing
SQLite-backed close assertion. Controlled filesystem faults must be finite causal
seams, not a globally patched filesystem. A substantial guard mutation must give
actual semantic RED with neighboring GREEN and exact restored source.

A retained real AppImage can be a large data round-trip fixture without launching
it. Small differing fixtures establish the content change. Preserve bounded4GiB/
zero-swap/600s Node runs, source/module hashes, all outcomes and exact idle cleanup
after retention. No ML/runtime/model copying or external host application changes.
Full typecheck, build and relevant lint are required; prototype remains unchanged.

## Executed evidence and limits

Root executed **251 targeted tests PASS**, full `pnpm run typecheck`,
`pnpm run app:build` and scoped ESLint of all seven changed code/test files PASS.
The integration joins the actual native provider/signature/cache/service to the
transaction with controlled metadata HTTP/transfer ports. It refuses activation
without Main's captured close assertion, ignores an extra caller assertion, and
preserves active verification/rollback after a new Check. The close assertion is
also checked against the existing real SQLite disposal barrier. No renderer or
public installer workflow is inferred from these tests.

The transaction suite uses actual owned files, including held old/new descriptors
across atomic rename, backup and foreign same-byte target identity tampering,
late close/cache revocation, consumed capabilities and cooperative exclusivity.
Matching pending intents share one promise; conflicting operations refuse. The
first authored concurrency test incorrectly awaited duplicate rejection and hung;
Root stopped only that owned unit after about40s. Its incomplete TAP is retained
separately, even though systemd-run returned0. It is neither PASS nor semantic RED.
The corrected complete run has251 PASS,0 fail/cancelled/skipped.

The actual owner compiled separately with esbuild passed different8192-byte
fixtures and a **147,106,530-byte retained AppImage data round trip**:
fresh0600 backup, candidate0755 atomic publication, old-byte copied rollback and
unchanged native source. Held descriptors continue to read their prior bytes.
The AppImage is never executed and its internal version is not checked. Real
canonical Ed25519 verification is used; test envelopes and public keys are retained,
while source authority is a controlled callback. This is a private filesystem
consumer, not a native Electron handoff, FUSE or shipping qualification.

An initial standalone fixture assertion wrongly assumed an unreferenced numeric
inode could never be recycled after replacement. That harness failure is retained
separately. The corrected driver holds the original FD throughout the transaction
and checks its original bytes, as the transaction test already does. Copied rollback
does not promise restoration of the original inode; it creates a separate file.

The neighboring **GREEN / semantic RED / exact original GREEN** removes only
the final current-target identity guard in an isolated compiled module. The final
authority callback substitutes a foreign inode with identical old bytes after
all asynchronous target hashes. Original/restored refuse with unchanged outcome
and retain the foreign file; the mutant overwrites it and fails the exact semantic
assertion. All three reach the third activating-authority call. This is not setup,
OOM or timeout RED. The workspace source is never mutated; original module hashes
match. Its final hash, modes and source snapshots are retained.

Independent finite production source review is **CLEAN**, without independent
execution claims. Post-rename fsync/journal uncertainty is represented explicitly
and preserves recovery material, but that failure branch was **not fault injected**;
no global filesystem monkeypatch or speculative recovery seam was added. This scope
has no crash adoption, process death or hostile same-UID filesystem CAS guarantee.
The held-FD tests prove ordinary POSIX behavior, not safe replacement of a running
mounted AppImage.

Evidence is under `runs/application-update-transaction/20261116` in the artifact
root. Retention preserved all **4,525 entries** (4,491 files,34 directories) in a
448,498,392-byte archive; exact idle payload cleanup reclaimed **478,142,464
allocated bytes**. The source AppImage retains its exact hash/size/mode/inode/times,
and reciprocal borrowed-source dependencies are cleared. Lifecycle is retained,
payloads empty, compact evidence431MiB. Shared runtime/models and host files were
not modified. The protected existing artifact root40GiB remains a recorded soft
budget exception; this run introduced no ML copies.

Independent retained-byte audit is **CLEAN** for every entry, modes/full hashes,
five report/body reconstructions and all five retained public Ed25519 envelopes.
It confirms the exact guard diff, final251-PASS footer, ten check receipts and
unchanged live production/source fixture. Two audit-reader setup failures (wrong
compiled indentation expectation and missing Node PATH) are separately recorded;
the final bounded audit passed using the existing absolute Node executable.
Audit execution is not a second runtime qualification. Source/store audit and
commit/push proofs are retained separately alongside the reports.

Public Install Update, restart/startup qualification, mounted/FUSE safety, crash
recovery/adoption, shipping publisher and full MVP acceptance remain open. Promise
statuses are unchanged.
