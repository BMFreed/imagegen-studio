# Signed AppImage recovery onto a fresh path

Base `4af1787b4a99774acd79e5a102a53d47f4da3250`. The
[application update contract](../features/application-updates.md) requires
preserving an interrupted transaction's files. The
[interruption qualification](./phase-5-application-update-interruption-research.md)
showed that participating-writer admission alone does not exclude a legacy
process. The new private publication path never takes ownership of the old
running image, old stage, backup or SQLite data. The operator must explicitly
select a new AppImage pathname. Native qualification starts the two paths
sequentially in one isolated app-data root.

## Fresh donor and adaptation

Reread clean InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1`.
`invokeai/app/util/no_replace.py:57–97` first publishes a completed file with
`os.link`, with an atomic no-replace rename on filesystems where hardlinks
fail. Its final direct-copy fallback can expose a partial destination.
`invokeai/app/services/model_install/install_staging_ledger.py:114–133`
writes and syncs a temporary claim before publication.
`invokeai/app/util/database_copy.py:246–296` verifies a private sibling copy
before publishing to an unused pathname. The thumbnail caller at
`invokeai/app/services/image_files/image_files_disk.py:327–373` syncs the
completed file and parent directory. The model install restore caller at
`invokeai/app/services/model_install/model_install_default.py:929–961`
refuses an original path recreated by another owner.

Invoke's hardlink publication adapts directly to the existing Studio
AppImage staging owner. Its direct-copy fallback cannot publish executable
bytes safely. Invoke does not supply a signed AppImage or Studio publisher
trust contract. The existing Ed25519 release verifier, exact compatibility
declaration, header admission, anchored readers, copying and sync owners
supply those boundaries. The missing donor pieces were disclosed before
implementation.

## Private operation

`publishVerifiedApplicationRecovery` requires a separately supplied verified
publisher context, the authority and canonical source and destination paths.
It does not infer trust from the retained journal, an unsigned backup or the
destination. The destination must differ from the original and source, have
an owned canonical parent, and have no pre-existing image, update stage or
update lock. Existing original aliases and destinations inside a reserved
stage or recovery tree refuse. A missing original file is allowed.

The candidate is copied to a newly claimed 0700 sibling directory using
exclusive creation. The owner verifies the source hash, signed byte count,
AppImage header, candidate readback, executable mode and physical identities.
One no-replace hardlink publishes the completed file. After syncing the
destination parent, the owner checks both names against the held inode and
drops only its private candidate name, making the final executable singly
linked. Success requires a final digest and identity readback and an unused
destination update namespace.

An existing target or a late competing publisher is preserved. Failure after
publication is reported as uncertain and never authorizes deleting the public
name. A failed private copy or uncertain attempt may leave its owned scratch
for inspection. A process death between link publication and alias removal
can leave a two-link image; this is outside success and outside existing
single-link update admission. There is no direct-copy or overwrite fallback.
Private directory ownership and post-link checks bound the cooperating
actors, with no global exclusion of arbitrary same-user writers.

This entry point is Main-private and exercised by the native qualification
runner. A public review/action, shipping trust, in-place recovery and automatic
restart remain open. Existing application or database backups are never used
as publisher authority. All eight public promises stay **«Пока не обещать»**.

## Executed qualification

The [publisher fixture](../../scripts/qualify-packaged-application-recovery.ts)
uses the previously retained ordinary AppImage `0.1.0-dev.1`. It is 147,131,545 B
with SHA-256 `b92cd007299479a6d8c582a5bf8ca06808d5353833026e61b3435c8e8f1f89ed`.
A qualification-only Ed25519 pair signs its exact bytes and current compatibility
inventory in memory. The key is external to the two packages. A controlled
non-runnable predecessor A creates the original retained stage through the
existing transaction. It is never started. The verified original and the
published recovery image have the same B bytes on independent inodes.

In R2 the actual first AppImage opens on the original path, reports
`required` with unverified target and runtime, and saves an owned Project.
It closes normally. The second actual AppImage starts from the newly
published path using the same isolated app-data root. Its startup reports
`clear` and reopens the same saved Project. The two `.igs` bodies match
byte-for-byte. Both processes exit normally, the original stage and lock
match their captured identities and bytes, and the upstream package is
unchanged. The 19.962 s wrapper contains publication, both lifetimes and
post-close readback. Each native lifetime used at most 8 GiB aggregate
configured across its admitted AppImage and wrapper groups, with zero swap.
The run uses the ordinary extract-and-run path and an empty runtime root.
It does not qualify an installed image worker, configured publisher feed,
or a subsequent native update.

The application update, release-signing and Linux package matrix produced
**648 PASS, zero fail, one platform skip**, including all 19 new publication
cases. The cases cover occupied paths, conflicting publishers, independent
signature and byte controls, and real hardlinks with a timed competing
replacement around publication. In an isolated source copy, removing just
the two original-path checks breaks the dangling-original-symlink test.
The adjacent successful-publication case stays green and both pass after
byte-exact restoration.

Full typecheck, app build, scoped ESLint, Prettier and whitespace checks
passed. The initial typecheck exposed a missing type import and union typing
in the tests. The final type import has no runtime effect. An esbuild
comparison verifies identical JavaScript for the executed R2 publisher
source and the final source.

Independent live readback confirmed the Ed25519 signature, three exact
AppImage bodies, four original stage bodies, the empty 0600 lock, and
20 recorded process identities after exit. Both closed SQLite snapshots
passed integrity checks without WAL/SHM companions. Both five-member Project
packages were valid and identical. This was an independent audit of the
execution, with no second native launch by the auditor.

Evidence is under
`~/.codex/artifacts/imagegen-studio/runs/packaged-application-recovery/20261118-r2`.
The two native reports, old stage bodies, exact Project and database
snapshots, full test and mutation logs and independent audit are retained.
The initial native run at `20261118-r1` is a separate earlier positive.
Together both runs disposed of 14 owned temporary paths after physical
exit, reclaiming 660,848,640 allocated bytes. The shared source package
and its dependency records remain retained.
