# Historical database upgrade and incompatible worker

## Scope and source basis

Base: clean `0c152495ae711262a0c4c645e303c27b83cd3d4a`. This is the copied-state
compatibility gate from [application updates](../features/application-updates.md),
[runtime management](../specs/07-python-runtime-management.md) and PP-004/007.
It does not add another updater, migrator, queue or acceptance owner.

Fresh clean Invoke `4875d96531ca6712b288f6e660fcbb34143408c1`:

- `invokeai/app/services/shared/database/startup.py::init_database/_migrator`,
  called by `api/dependencies.py::initialize` before other services: validate and
  migrate at startup, dispose the database on failure.
- `shared/sqlite_migrator/sqlite_migrator_impl.py::run_migrations/_backup_db/
_run_migration`: refuse unknown history, preserve a backup before upgrade and
  run each SQLite migration in an explicit transaction.
- `shared/database/database.py::backup`: SQLite online backup includes committed
  WAL; reserve a new destination exclusively.
- `frontend/webv2/src/workbench/projects/invk/importProject.ts` and
  `projectFile.ts`: unsupported schemas refuse rather than rewrite unknown data.
- `session_processor/session_processor_default.py` and `invoker.py::_start/stop`:
  workers follow service initialization and their shutdown is joined. Invoke's
  workers are threads; Studio's existing JSON child-process protocol owners are
  its adapter, not a newly invented protocol in this checkpoint.

Fresh launcher `c267bdb439519216b277a7a8c6ad408b9d79efce`:
`src/main/updater.ts`, `main-process-manager.ts`, `install-manager.ts`. The already
qualified local AppImage packaging supplies the desktop consumer; no publisher
configuration, signed update handoff or ML environment is recreated here.

The preceding recovery investigation also rechecked Invoke's
`model_install/install_staging_ledger.py::discard/recoverable_installs`,
`model_install_default.py::_restore_incomplete_installs/_restore_moved_path` and
`app/util/no_replace.py`. Neither donor supplies signed AppImage startup retirement
or proof that legacy updater writers have stopped. Signed target/runtime matches
and a free participating-writer lock cannot grant that authority. No independent
archive/delete/rollback alternative is introduced by this compatibility slice.

## Historical producer and actual consumers

Historical source is `6b812f93d2715af2c4f904e70093b3f9c5b09713`, the parent of
`a1bf0fcdd52fe6117434450b62cde145403500c1`, which introduced migration0030.
Its exact source graph and 29 SQL files create fresh agent-owned state. This is
historical-owner execution with pinned current dependency versions, not execution
of a complete historical desktop or its historical lockfile environment.

Current `src/main/db/database.ts::openAppDatabase/applySqlMigrations` is the sole
upgrade owner. Migration0030 only adds empty STRICT `model_reference_identity`
and its source/type/hash/size index. It does not rewrite or backfill prior rows.
A successful startup must preserve all 29 applied migration names/hashes and the
historical data, add the actual0030 record and schema, and open the real `.igs`.

Persisted Project, workspace, model and queue records can contain absolute paths.
Moving a fixture to another root can accidentally direct Save back to the retained
source. Both producer and upgraded desktop therefore use the same fresh canonical
active path, with a separate immutable pre-upgrade checkpoint retained before
current startup. This is a controlled historical fixture, never real user data;
no SQL path rewriting or cross-root relocation acceptance is implied.

A tiny owned executable emits an otherwise valid ready record with an incompatible
protocol. It uses the established runtime-test Node wire fixture mechanism, an
absolute pinned interpreter and runtime-contained paths. Actual current
RuntimeManager and CPU/inference clients must reach their existing handshake
parser. A metadata refusal or a generic needs-repair label alone is insufficient.
The controlled wire program is not CPython, an installed worker or ML readiness.

The production Project Save owner must remain usable after that refusal. Test the
visible diagnostic, edit and explicit Save with placeholder preview, normal close,
and a second packaged lifetime reopening the actual saved file. Retain pointer,
wire-program/config bytes, original transport observations and known child exit
identities. No production test hook replaces the parser or Save implementation.

## Invariants, risk and verification

This changes qualification code, not persisted schemas or application behavior.
Consequences are still high risk if the fixture silently follows original paths,
mutates reusable binaries, misses a live child or overstates compatibility.

- Use create-only artifact paths and the existing lifecycle/resource-limit owners.
  Keep source snapshots and compact reports separate from raw package/data files.
- Compare actual database schema and rows, including copied IDs/references, rather
  than only migration count or startup labels. Record legitimate startup changes
  exactly; do not broadly ignore whole user tables.
- Prove handshake entry and its specific protocol rejection. Confirm physical child
  exit; a returned launcher or a status error does not establish it.
- Exercise the actual migration consumer with a valid data-loss mutation, a nearby
  preserved-data control, and exact source restoration. Exercise transactional
  migration failure separately from the usable-Project worker-incompatibility case.
- Use two serial native lifetimes and ordinary close. Scope admission bounds the
  original startup continuation; pre-admission desktop promotion overhead remains
  unqualified. No GPU allocation, weights, system Python worker/ML runtime or
  shared runtime mutation. Host Python is used only as the EWMH desktop-close
  messenger.

Studio's migrator currently has per-migration transactions and name/hash checks,
**no automatic pre-migration backup**. The retained fixture checkpoint must never
be described as production backup, automatic restoration or downgrade support.
Unchanged schema1 `.igs`, one additive migration and one controlled wrong-protocol
worker cannot establish arbitrary migrations, all historical versions, an actual
old ML runtime, rollback, clean-machine installation or shipping/MVP acceptance.
All eight promise statuses remain unchanged.

## Results

Final Root execution: `~/.codex/artifacts/imagegen-studio/runs/application-state-upgrade/20261117-r4`.
Production TypeScript/Vue, migration SQL and worker implementations are unchanged.
The committed helpers add a reproducible qualification consumer of those owners.

- Historical producer **187 source files / 29 migrations / 24 snapshotted tables**:
  real historical Project Save, preset, catalog row and terminal canceled queue item.
  Current packaged startup preserves all historical rows and 29 migration records;
  only the known scanner's `project_index.indexed_at` changes before UI interaction.
  Migration0030 adds its actual empty STRICT table/index and applied record.
- Final native **PASS, 15.239 seconds**, two sequential current AppImage lifetimes
  with the exact 42 production dist files. First opens the historical schema1,
  empty-layer `.igs`, edits its prompt and explicitly Saves; second opens that saved
  file and prompt. The existing placeholder preview is `empty`. This does not
  qualify complex old raster/history packages or arbitrary changed migrations.
- **Nine controlled protocol2 child lifetimes (5 + 4)** reach actual original
  stdout consumers and exit through client-owned SIGTERM/exit0. Public UI shows
  needs-repair while Project Save remains usable. No self-test request or inference
  is sent to this incompatible peer. Private `WORKER_VERSION_MISMATCH` inside Main
  is source-inferred, rather than captured as a public/private error. Separate
  actual-owner CPU/GPU regressions observe the specific error code.
- **10 SQLite regressions + one CPU and one inference startup regression PASS**;
  app build PASS. These Root checks ran in the original attempt before the QA
  observer fixes; exact original receipt/log paths and hashes are linked by
  `qualification-summary.json::externalChecks`. They were not rerun or counted as
  new R4 executions. Final changed-helper ESLint PASS. No TypeScript/Vue or prototype
  UI change required another typecheck/prototype matrix. Existing packaging
  desktop-name/default-icon and build chunk-size warnings remain.
- Actual unchanged migration owner over isolated copies: original GREEN → valid
  sentinel-data-loss mutation semantic RED → restored GREEN, with neighboring
  preset rows preserved. DDL failure rolls back the new table and migration record.
  The historical29 owner refuses the newer30 history without downgrading its data.
  Original subject and repository SQL/source bytes remain intact.
- The closed-checkpoint reader passed two repeated reads with identical full file
  witnesses. It refuses a nonempty WAL/journal; the default live reader sees a
  committed WAL row, and the closed reader sees it after writer close. Only a
  private Buffer's journal flags are normalized for memory deserialization. Live
  WAL reads still use the existing readonly SQLite transaction. A copied runtime
  symlink may point absolutely to its original subject; the checkpoint is data-only,
  not an activatable, relocatable or self-contained runtime.
- Root rechecked **37 known PID/start identities, two owned native scopes**, both
  extracted runtime directories and all nine wire exits. Admitted native ceiling
  is 2.25 GiB aggregate including finite watchdogs, zero swap; promotion overhead
  before admission remains unqualified. No foreign process, ML resource or SHARED
  runtime was stopped, replaced or copied.

Root opened both final screenshots. The repair notice/details and persisted prompt
are visible without clipping. The first image still contains the Save response's
loading presentation and the second an asynchronous model-picker indicator; these
are snapshots, not a whole-app settled-state/visual acceptance claim. UI actions,
Save result and second reopen are separately exercised by the native consumer.

### Earlier attempts and retention

R1 (`20261116`) stopped before production Main because the observer called an
unavailable Electron Archive method. It is corrected to the pinned existing
`getFdAndValidateIntegrityLater`, retaining the native owner while borrowing its FD.
R2 (`20261116-r2`) reached migration/Save but the close observer could not find an
X11 window; explicit `--ozone-platform=x11` is now supplied at process launch.
R3 (`20261116-r3`) completed both native lifetimes but its final strict checkpoint
oracle detected only SHM mtime/ctime drift from the observer's own readonly SQLite
connection. The new closed-memory reader prevents that write. Every original FAIL
is retained unchanged and excluded from R4 acceptance; no setup/timing failure is
called a product semantic RED.

Complete raw archives and independent failure audits were obtained before disposing
those exact idle raw paths (5,202 / 5,092 / 5,029 entries respectively). Their
necessary source, checkpoints, actual Project/SQLite/control data, wire logs and
screenshots are retained separately from disposable prior package/tool-cache
copies. Actual compaction/disposal outcomes are in each `compact-retention.json`
and R4's independent `prior-compaction-audit.json`; discarded prior binary/cache
bytes are no longer promised readable. No lossless-full-prior-payload claim is made
once compaction is recorded. R4 retains its complete final payload archive and
inventory; `final-audit-live-r2.json`, `final-audit.json`, `retention.json` and lifecycle
record the actual final archive/audit/disposal outcomes. No removed raw path is a
valid resume target.

The first independent live audit (`final-audit-live.json`) failed in its own ZIP
member-set check: it omitted the required `mimetype` marker. That FAIL and its
frozen auditor are retained. The corrected check requires the marker and its exact
contract bytes; all member hashes and document-preservation checks remain. This
observer failure is not a product semantic RED or another native app run.

Source-only reviews, Root execution/visual inspection and retained-byte audits are
separate results. PP-004/007 supporting evidence gains this finite cohort; all eight
public promise statuses remain unchanged. Automatic production pre-migration backup,
verified app recovery/reinstall/retirement, real runtime/driver/model compatibility,
shipping publisher configuration and final MVP acceptance remain open.

### Reproduce

Build the current app, create a NEW artifact RUN with lifecycle/payload directory
and a canonical private TMPDIR inside the artifact root, and stage only the pinned
AppImage build-tool cache documented by `builder-cache-copy.json`. Use the composed
budget wrappers (4 GiB prepare/controls; 1 GiB native launcher plus independently
bounded native scope, zero swap, 600-second deadline):

```text
pnpm run app:build
node scripts/qualify-application-state-upgrade.mjs --artifacts <new-run> --phase prepare --revision r1
node scripts/fixtures/application-state-upgrade-controls.mjs --artifacts <new-run>
node scripts/qualify-application-state-upgrade.mjs --artifacts <new-run> --phase run --revision r1
```

Prepare requires `ELECTRON_BUILDER_CACHE=<new-run>/payloads/builder-cache`. Native
requires the explicit artifact TMPDIR and real X11/CDP/native-close prerequisites.
It is fresh-only; reconstruct retained archive aliases as independent regular files,
never filesystem hardlinks between mutable current/cache/backup paths. Do not activate
a copied runtime pointer or follow an archived absolute symlink into another fixture.
Historical producer execution needs the pinned Git commit and current locked
qualification dependencies. It does not install historical dependencies or run an
old desktop. The closed reader is only for a known writer-closed checkpoint with
empty/absent WAL and rollback journal; never use it to bypass live WAL recovery.
