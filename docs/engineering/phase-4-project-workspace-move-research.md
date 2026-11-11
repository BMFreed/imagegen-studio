# Closed Project workspace Move with stable identity

## Scope, risk and source

Baseline clean master `f5701b17c5a46e66bf3880c95a3eed992ec8fdb9`.
High risk: local identity, SQLite bootstrap/migration, source relocation, immutable
queue inputs and recovery. [Home workspace management](../features/home-screen.md#workspace-management-flow)
and PP-007 supply the contract. This slice implements same-filesystem Move of closed,
ready saved Projects. Clean-open Move/rebind and Rename (title AND filename) remain
separate consumers. No title-only shortcut or public MVP/promise promotion.

Fresh clean Invoke `4875d96531ca6712b288f6e660fcbb34143408c1`:

- `app/api/routers/image_moves.py:63–90` → `image_moves_default.py` startup112,
  mutation lock128, reservation/queue-idle admission188–252, move_all286–322,
  recovery324–350, preflight391–426, filesystem442–528, repoint548–563 and
  same-filesystem673; shared database `queries/image_moves.py` and schema.
- This owner journals a positive plan under its mutation lock, moves/fsyncs the
  actual files, transactionally repoints metadata and recovers interrupted moves.
  It preserves stable image_name while changing image_subfolder. Studio adapts that
  distinction to existing opaque project-v1 keys plus a durable location binding.
- Invoke uses os.replace after a destination preflight. It has no OS-atomic
  no-replace operation here. Studio repeats current canonical parents/source
  identity/destination absence synchronously immediately before renameSync; no
  await/callback/log gap. This does not promise arbitrary hostile cross-process
  scheduling safety or a renameat2 no-replace primitive.
- Fresh `names/names_default.py:9–12` UUID generation → `images_default.create:87`
  and `routers/images.py:delete_image:238+` → `images_default.delete:527+` supplies
  non-reused stable names and journaled deletion. Invoke needs no retired-pathhash
  table because its image_name is independent of filenames. The explicit Studio
  retired-key adaptation preserves non-reuse when a physical path becomes free.

The missing path-derived migration and no desktop Move wrapper were reported before
adapting the source mechanism. Existing path locks, generation maintenance fences,
Project package validation, shadow and staging owners remain the owners of their
boundaries; no parallel queue, sampler, classifier or acceptance wrapper is added.

## Complete path and finite admission

Home frozen Project+target intent → strict ID-only preload/Main → existing catalog
lock → Project generation gate/maintenance lease → service lifecycle guards →
positive relocation journal → final synchronous filesystem checks → rename/fsync →
transactional repoint → synchronous registry refresh → journal finalization → Home.

Admission refuses any open/opening/saving/rebuilding Project, unfinished job, owned
candidate, pending acceptance handoff, dirty/stale/invalid/unknown document recovery,
unknown generation storage, nonempty normal OR Smart staging project directory,
Trash, unavailable/readonly workspace, cross-filesystem target or filename collision.
The exact staging directories are inspected even when verified candidates are zero;
invalid/deferred/tombstoned payloads are not silently ignored or discarded. Both the
owned dataRoot and each existing path component must be canonical directories without
symlinks. No implicit Save, close, Add, discard, cancel, workspace Add or target change.

Move preserves basename and exact package bytes. It freezes source dev/inode/size/
mtime/ctime and SHA-256, both parent witnesses and document identity/revision. Intent
precedes filesystem change. Source-only recovery proves original fingerprint/hash;
destination-only recovery proves original inode/version/data hash. Both present,
neither present, changed parent/source or a late collision stay pending without
unlinking a replacement. File and both directories are synced before repoint. No
filesystem effects occur in a retryable SQL transaction. The final syscall can be
namespace-atomic on the supported same filesystem; cross-device copying is refused.

Pending intent reserves BOTH paths against scan/index/Create/Import publication,
active Open/preview/history/Trash and other moves. Import treats a reserved basename
as occupied before its no-clobber publication, and chooses another owned filename.
Workspace unregister is refused for either reserved workspace. Home keeps one source-
scoped pending snapshot/count with disabled Open, message and Retry Move. Closing the
dialog does not roll back a committed move. Retry freezes the original target. Startup
recovery runs before initial scanner/Trash/Open and uses the same caller guards.

## Stable identity and immutable state

Migration0028 adds independent binding, retired-key and positive relocation tables;
none depends on disposable index/workspace foreign keys. Binding is loaded at SQLite
bootstrap before any service/queue parser. The physical canonicalProjectPath remains
realpath; it never redirects an old filename. The compatibility hash remains the
fallback for ordinary legacy paths, while a moved file keeps its original opaque key.

Registry owns per-canonical-DB snapshots/refcounted connections. Closing a secondary
connection cannot unload the active owner; close is idempotent. Conflicting/malformed
bindings fail closed; rejected unrelated bootstrap does not publish a partial owner.
After committed SQL a failed refresh poisons lookup, never returns a stale binding.
Historical through27 fixtures have no identity tables; installed0028 with a missing
identity table is corruption, not legacy fallback.

Repoint changes ONLY mutable canonical path fields in terminal queue/receipts and
index location/workspace/fingerprint. Frozen JSON, Smart context.projectKey, bundle
files/hashes, PNG inputs, seed cursor, discard tombstones, shadow bytes and portable
accepted provenance stay unchanged. Smart frozen input contains key but no Project
path; pending staging/acceptance JSON DOES contain paths and is excluded by admission.
No worker inference or accepted-result schema changes follow.

Former-name reuse cannot inherit the moved key. A validated different physical file
gets a distinct persisted opaque binding, including direct managed Import without a
prior rescan. An unhealthy replacement has no trusted document UUID: only that known
colliding path is isolated from indexing until repaired, preserving healthy neighbors.
It is not assigned a fabricated document ID or the moved Project's key.

After actual permanent deletion, finalization atomically retires the old key and
releases its active location binding together with removing the delete journal. New
files can use the freed location without inheriting old jobs/recovery. A postcommit
registry repair failure still reports the already durable deletion honestly instead
of inventing a pending row; lookup remains poisoned. The positive deletion/fsync
checks and separately owned queue/recovery data remain unchanged.

## Verification and evidence

ROOT final critical selection: **524 PASS, zero failures/skips** (507 top-level
TAP cases plus nested cases). It covers all database migrations/bootstrap and affected
identity, index, service, Move, workspace, Trash, shadow/autosave, queue, normal/Smart/
regional/Anima staging and acceptance/recovery consumers. The global identity owner
justifies this broader adjacent selection; unchanged trained inference matrices were
not repeated. Initial35 focused cases pass. An intermediate run had514PASS/one test
setup ReferenceError from missing fs imports; fixed imports and all eleven final
service Move cases pass, without weakening behavior assertions. That setup error is
not semantic RED. Full final TypeScript/Vue typing, partitioned lint and app build
PASS. Only unchanged regional-init.mts parser exclusion remains; build's existing
renderer chunk advisory is unchanged. Python/prototype source was not changed.

Actual production queue consumers verify Move → close SQLite → cold reopen →
terminal frozen Retry for ordinary TXT and Smart Illustrious/Anima. They preserve
stable key, payload/context/manifest bytes, original bundle/PNG hashes, seed and
source package, while new Retry owns an independent valid input bundle. These are
queue/input tests using existing tiny resource fixtures/adapters, not trained
inference or public Generate/worker quality evidence.

Six isolated semantic selections = five GREEN and one intended consumer RED:
baseline ordinary Move plus late-destination replacement both pass; omitting ONLY
the final assertNoCollision in renameCheckedNow keeps the ordinary neighbor GREEN
but actual rename/repoint returns `moved` instead of `pending`, detecting overwrite
of the foreign destination. Both cases pass after byte-exact restoration. Early
preflight checks stay enabled, so this is a real final-consumer RED, not setup/OOM/
timeout. The current Core source equals the original/restored isolated copy.

Finite source review found and closed dataRoot symlink admission, reserved Import/
index publication and direct managed Import on a reused oldname. Tests additionally
isolate corrupt former-name occupants until valid repair, prevent moved identity
inheritance and verify moved Project Trash/delete/free-location reuse. Source review
of Core/consumers and the retirement intersection is CLEAN after fixes; reviewers
executed no tests and do not claim ROOT's runtime results as independent execution.

Final built Electron **native-r3: six checks, three normal physical lifetimes,
three screenshots, zero page errors**. Actual UI/IPC/SQLite/fs verifies open refusal
with Switch to Project, selected destination and exact moved file bytes, unchanged
stable ID, source scope removal, cold reopen/target tab marker, explicit later edit/
Save writing only the new path, and journaled EACCES pending/recovery. The fault
adapter wraps only Main's renameSync for one exact owned source/target: it chmods
the destination directory at the syscall boundary, then calls the ORIGINAL rename.
Thus the reported EACCES is a real filesystem permission failure after positive
intent. It never substitutes a Move result or persistence owner. The wrapper is
identity-restored and mode repaired before normal close. Pending Close leaves one
visible frozen Retry card and both unregisters refuse. The next normal startup
finishes only the original move before scanning. Remaining neighboring files survive.
OS workspace picker replies are controlled; no foreign process or workspace is used.

Native-r1 failed a harness Open/Home async race; native-r2 completed Move/reopen but
failed the unsupported dynamic-import fault setup before permission injection. Both
are excluded diagnostics with normal exits, not semantic RED or full qualification.
Final source/bundle/PNG hashes are checked against current bytes. ROOT opened all
three final screenshots at900×620/1440×900: destination, warning and Close/Retry are
visible, pending target stays readonly, recovered workspace counts agree. A bounded
UI source/screenshot review is separate from independent interactive/accessibility
or trained-inference acceptance. No PP-001/005/007/008 promotion follows.

## Retention and reproduction

Evidence root: `~/.codex/artifacts/imagegen-studio/runs/project-workspace-move/20261111`.
The summary, final native PNGs, bounded resource logs, failed diagnostics, mutation
plan/applied/restoration and source/bundle fingerprints are compact evidence.
Inventory before work:29GiB root(17shared/12runs),63GiB disk free; RTX4080 memory
16376MiB total/1223 used/14797 free. No GPU work, runtime/weight copy or dependency
on active SHARED models/Projects/reports was introduced. Checks use4GiB/600s; native
launcher and owned scope each2GiB/zero swap,600s overall/300s per native lifetime.

`retained-payloads.tar.gz`/`payload-inventory.json` retain the isolated source copy and
three exact owned native fixture folders without following symlinks. Final full source,
staged tree/patch and five tested bundles are retained by final-source and qualified-
bundles archives/manifests. Independent byte audit, process/cgroup exit, restoration,
dependency closure, actual cleanup and final commit/remote proof are recorded beside
those archives. The mutable lifecycle records whether raw paths were removed; old
raw paths and pre-final0028 fixture schemas must not be resumed as current state.

Reproduce from final commit and compatible existing dependencies: run critical tests,
`pnpm run typecheck`, lint and `pnpm run app:build`; run the existing
`pnpm exec tsx scripts/smoke-home-workspaces.mjs --report-file ABSOLUTE_NEW_OWNED_REPORT --move-only`
in a fresh lifecycle-owned artifact directory under a bounded controller. It creates
blank `.igs` through actual Main and requires no ML runtime. Restore historical raw
bytes from archive without dereferencing links; rebind only isolated node_modules
to compatible workspace dependencies and rebuild native SQLite for the intended ABI.
Never resume deleted raw XDG folders or copy old runtime/weights into this run.

Remaining: clean-open coordinator/lease rebind preserving Undo/Redo, Rename title+
filename, cross-filesystem transfer and relocation with deferred candidates/acceptance/
dirty recovery are not implemented by this finite lane. No automatic discard/prune
workaround is offered. Home locate/relink/unhealthy-file presentation, Models/export/
runtime/release/compatibility/visual/NoobAI/MVP gates remain separate continuations.
