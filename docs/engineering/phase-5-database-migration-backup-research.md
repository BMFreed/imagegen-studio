# Pre-migration SQLite backup

Base: `ceb16f66ab4a978dd6f71ac0139825f06c11d2ba`. High risk: startup SQLite
migration and recovery. PP-004/007, application-updates and runtime-management
contracts require explicit failure without silent data loss. Promise statuses
remain unchanged.

## Fresh source basis and decision

Clean Invoke `4875d96531ca6712b288f6e660fcbb34143408c1`:

- `invokeai/app/services/shared/sqlite_migrator/sqlite_migrator_impl.py`:
  `run_migrations`, `_backup_db`, `_run_migration`, unknown-history refusal.
- `invokeai/app/services/shared/database/database.py::backup`: exclusive 0600
  destination, SQLite online backup including committed WAL, failure cleanup.
- `shared/database/startup.py::init_database/open_migrated_database` and
  `api/dependencies.py::initialize`: migration before services, close on failure;
  companion tools refuse a database that still needs startup migration.
- `docs/src/content/docs/start-here/upgrading.mdx`: manual restore with all
  processes stopped; preserve current main/WAL/SHM together, COPY a specifically
  chosen backup, retain the original. The latest backup may contain partial
  migrations and must not be chosen automatically.

Studio's public `better-sqlite3@13.0.3` backup method is asynchronous, using
`sqlite3_backup_init/step` (`lib/methods/backup.js`, `src/objects/backup.cpp`).
Use this actual online backup, not file copying, serialize, VACUUM or private APIs.
Adapt the donor's startup/tool split: async `initializeAppDatabase` for Main,
existing synchronous `openAppDatabase` for fresh test/tool state and current DBs.
Existing pending databases must refuse the synchronous path before any schema/row
writes. A provably newly created empty database skips a valueless initial backup;
an existing database without migration metadata does not count as fresh.

There remains one connection preparation, complete migration-plan admission and
transaction owner. Prevalidate every installed name/hash and read all pending SQL
before any execution or backup. Reserve a new private backup inode exclusively,
await online backup, check identity/durability, then run existing per-migration
transactions. Name backups `database/app_backup_<YYYYMMDD>-<HHMMSS>[-N].db`;
collisions preserve existing entries. Keep a successful backup after migration
success or failure. Main awaits initialization before preset cleanup, Project,
queue or worker services. Its existing startup error dialog displays the backup
path and recovery guidance. No new IPC or UI owner is needed.

Invoke supplies no automatic database rollback consumer. This slice adds no
in-place restore, backup selection/deletion policy or app updater retirement.
Restoring SQLite does not rewind `.igs`, model files, staging or other app data.

## Verification plan

Real SQLite integration covers old state to new state, WAL-only committed rows,
no-op/no redundant backup, exclusive collision handling, backup I/O failure before
SQL, existing no-history data, complete preflight before a later hash refusal,
per-migration partial success/failure and explicit copy-restore into isolated data.
Keep cross-process descriptor/lock visibility controls. A semantic mutation must
reach the actual backup consumer, fail the preservation oracle, and restore
exactly. Run typecheck, focused DB tests, relevant Main tests, build and lint.

## Results and limits

Root execution evidence:
`~/.codex/artifacts/imagegen-studio/runs/database-migration-backup/20261117`.

- **20 focused DB tests PASS**, then **127 final DB/preset/staging/index tests
  PASS**, zero failed/skipped. The latter includes the former; do not add the
  counts. Fifteen legacy-test files now await startup initialization for sixteen
  upgrade scenarios, preserving their existing row/constraint/error oracles.
- A direct real initializer run retains actual working30, backup29 and restored29
  SQLite files and their complete schema/row snapshots. The committed WAL marker
  survives in the backup while a writer is still open. Copy restoration opens
  through the real synchronous owner; no-op startup leaves one unchanged backup.
  This is current first29 SQL fixture state, not a historical binary or Electron
  GUI execution, automatic in-place restore or Project/resource-file rewind.
- Isolated actual-owner mutation: main-file copy instead of awaited online backup
  loses the committed WAL row and gives the intended semantic RED. Original and
  restored GREEN have identical owner and bundle hashes. Repository bytes never
  change during this experiment. `semantic-backup.json` records the 0/1/0 exits.
- Source review found a reachable empty-installed-hash admission defect. Root's
  pre-fix regression observed the saved neighboring row deleted by earlier pending
  SQL before a later migration failed. Both hash predicates now distinguish
  presence from truthiness; the same preservation regression passes before SQL
  or backup is attempted.
- Source-only independent review of production startup/backup and its initial
  consumers is CLEAN after that fix. It is not independent runtime execution.
  Root adapted the remaining migration tests and checked them in the final127.

The attempted official expanded `app:test` (470 files, concurrency2) reached the
600-second deadline without a complete footer. It is **not a green full suite**.
Its sixteen observed pending-upgrade consumer failures are fixed and covered by
the final127. The other **81 observed failures** were reproduced by running their
22 full test files at the original `ceb16f66` source fixture: 169 tests, 88 PASS,
81 FAIL. All 81 failure names **and exact error payloads** match. These older Anima
qualification DTO/oracle mismatches remain an open verification gap; no prompt,
inference default or qualification oracle is relaxed by this backup slice.

The first broad check failed before collection because its original TMPDIR made
tsx's Unix socket path too long. A short owned TMPDIR corrected that setup. The
first baseline replay omitted the source ICC dependency and is also retained as
setup FAIL; the final replay uses that file from the same original Git revision.
Neither setup failure nor the broad timeout is a product semantic RED.

Final typecheck and app build PASS; changed-code lint PASS. The stock full lint
exhausted its 2 GiB JS heap in the source partition. A separate runner completed
all **1,174 source files in 47 disjoint partitions**, keeping the same two
unchanged parser exclusions and the 4 GiB/zero-swap group limit. Its coverage file
is written only after every CLI partition returns zero. A server restart lost
the outer wrapper receipt: coverage and the 47-partition log establish completion;
the retained unit journal corroborates physical exit/resource use, not a missing
wrapper exit code. The first partition runner also had an ESLint CLI resolution
setup failure; its source/log are retained separately from the corrected run.

Retained-byte audit outcomes are recorded by their
separate immutable receipts and `qualification-summary.json`; authored checks or
source review alone do not establish those outcomes. Payload inventory, full
archive, independent live/final audits, retention and lifecycle record the actual
retained/disposed state. Removed raw paths are never valid resume targets. The
baseline source fixture uses the existing locked repository dependencies through
a data-only archived symlink; never follow it during archive extraction/cleanup.

No full MVP, shipping, arbitrary migration, downgrade, app-binary recovery,
automatic restore or ML/runtime compatibility is implied. Backups are not pruned.
Unexpected companions or replaced destinations are preserved on backup failure;
only the exact newly owned partial main inode may be removed.
