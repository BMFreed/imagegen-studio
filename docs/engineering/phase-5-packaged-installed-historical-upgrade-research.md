# Historical Project upgrade with the installed engine

Base `170a1d8abbadb067eb366a2596e580eb269eefef`. This qualification joins the
existing [historical producer](./phase-5-application-state-upgrade-research.md),
[startup backup](./phase-5-database-migration-backup-research.md) and
[packaged installed engine](./phase-5-packaged-installed-engine-research.md).
The retained AppImage is byte-pinned. The current production sources and
packaging inputs match the revision used to build it. Changes in this checkpoint
are limited to qualification owners.

## Source and fixture

Re-read InvokeAI at `4875d96531ca6712b288f6e660fcbb34143408c1`.
`invokeai/app/api/dependencies.py::initialize` calls `database/startup.py::init_database`
before services. `sqlite_migrator/sqlite_migrator_impl.py::run_migrations/_backup_db`
calls `database/database.py::backup` before pending migrations and reserves an
exclusive output. `image_files/image_files_disk.py::generate_thumbnail_if_missing`
derives a thumbnail from a saved image while preserving the source. Studio's
existing SQLite, Project package and installed `compose-preview` owners serve
these roles for this check. No new production migration, worker or restore owner
is needed.

Execute the exact previous historical producer `6b812f93d2715af2c4f904e70093b3f9c5b09713`
against the same locked qualification dependencies. It writes 29 migrations, a
nonempty 48×32 sRGB Raster `.igs`, a preset, an exact catalog fixture and a
terminal canceled queue item. The Raster is authored with an embedded ICC and
normalized through the actual installed CPU worker. Historical Save leaves an
unavailable preview. The catalog artifact is a controlled identity fixture.

The qualification runner requires the retained AppImage, install and native report
hashes, the exact pointer/provenance, 73 installed worker members and the resolved
interpreter pinned by the signed manifest. It uses the already idle slot at its
original canonical path. A create-only claim and a physical process scan fence
this qualification. The runner verifies an inventory before moving the original
owned non-runtime entries aside. Runtime and LaMa remain at their original paths.
The historical producer creates a closed checkpoint of its small durable files at
the same active app-data path used by Main. Independent copies preserve the
pre-migration database and Project before launch.

After confirmed process exit the runner retains the staged test state separately
and restores the original entries by rename with exact identity and byte checks.
An unresolved process or interruption retains the claim and the inventory for
inspection. This isolation is a qualification mechanism. Production continues
to use the existing manual [SQLite recovery](../features/application-updates.md#pre-migration-database-backup-and-manual-recovery)
contract.

## Execution

- R2 launched the ordinary fused AppImage twice. Both actual Main instances
  qualified the exact installed slot. SQLite startup preserved 29 migration
  names/hashes and the contents of all 24 historical tables, with the ordinary
  `project_index.indexed_at` scan update. It added the empty STRICT 0030 table
  and index. The one private `0600` backup matches the closed historical29
  schema and rows. The second startup preserved that backup and created no repeat.
- A real renderer prompt edit and explicit Save reached the packaged CPU worker.
  The historical unavailable preview became rendered. Independent Pillow
  decoding of the exact seven-member `.igs` verified the source, merged PNG and
  WebP thumbnail, all **4,608 RGBA pixels** and the ICC on each plane. The source
  Raster asset and original ICC bytes were preserved. The saved nonempty Project
  reopened with the changed prompt and exact persisted revision. Its `.igs`
  bytes remained identical across the second close. Other historical table rows
  remained equal across startup, Save and reopen.
- Both R2 application lifetimes closed normally with physical exit confirmed.
  The launcher's peak was 1.1 GiB, swap zero, with an observed aggregate cgroup
  limit of 8 GiB including each respective native scope. The original **111**
  owned entries, exact installed input pins and pointer were restored or verified.
- R1 reached backup, migration, real Save and a normal first close. Its initial
  independent ZIP check expected six members and missed the original ICC member.
  It is retained as an oracle failure. R2 requires the full seven-member set and
  exact ICC witness. Original state restoration also passed after R1.
- An owned busy-process control refused before state displacement, preserved the
  original database bytes and released its claim. The ordinary no-engine smoke
  still passed both packaged lifetimes. The original historical producer and
  migration controls passed separately, including the intended semantic RED.
  The focused package/runtime and SQLite selection passed **89 tests** without
  skips or failures. Scoped ESLint passed.

Independent read-only audit compared both 29-state bodies and both 30-state
snapshots, decoded each saved package, rehashed all 77 exact engine inputs and
rebuilt the original 111-entry inventory. It checked the exact R1 and R2
observed process identities and cgroup exits. The audit did not execute an
application or worker. R1 and R2 retain verified archives of 335 and 337
entries, respectively. Exact idle payloads and short temp directories released
44,826,624 allocated bytes. Archive symlinks are retained as data.

Reports live under `~/.codex/artifacts/imagegen-studio/runs/packaged-installed-engine/20261118/`,
with positive `historical-upgrade-r2` and separate R1 receipts. This closes the
single-host packaged historical migration and CPU-preview portion of the
[MVP backlog](./mvp-acceptance-backlog.md). Trained model generation, visual
utility, broader database or app upgrades, public publisher and recovery gates
remain open. All eight public promise statuses remain «Пока не обещать».
