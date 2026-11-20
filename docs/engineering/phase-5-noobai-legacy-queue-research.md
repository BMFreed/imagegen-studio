# Historical NoobAI queue and accepted provenance

This check uses a closed historical 17-migration catalog with a canceled
and completed Cyberfalafel V IMG pair from an earlier native run. The
original package contains an accepted Raster from the completed job.
The checkpoint identity is `1147756 / 2679856 / 2566634`. The historical
queue and accepted sampling records predate the explicit noise profile.

Re-read clean InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1`.
`invokeai/app/api/dependencies.py` starts the database before the queue.
`invokeai/app/services/shared/database/startup.py::init_database` brings
the database to the current schema.
`invokeai/app/services/session_queue/session_queue_default.py::retry_items_by_id`
reads and validates preserved executions and their stored graph.
The Studio check uses the existing database initializer, queue recovery
and verified input readers, and the strict `.igs` reader.

## Results

The current initializer migrated a disposable copy from 17 to 30
migrations. The online backup had the original 17 migrations and
identical logical schema and rows. Real queue recovery changed zero
jobs. Queue Manager's repository paginated **1,329** rows across 27
pages, including 1,228 completed, 99 canceled and two failed jobs.
The queue and accepted-result index rows matched the original copy.

Both selected jobs still expose the exact V-prediction checkpoint, fixed
seed 0, Euler a/Normal and three steps. Their frozen payload and target
hashes agree with the original source. Both context and worker sampling
still omit `noiseProfile`. The accepted `.igs` Raster links the completed
job and keeps the same omission, exact model and 93,987-byte Raster asset.

The negative control changed the first PNG byte in the canceled job's
temporary target. The actual queue reader returned `QUEUE_INPUT_INVALID`
with “The queued input file changed.” The unchanged completed neighbor
passed, as did the canceled job after restoring the original byte.
All six source files retained their original bytes and filesystem identity.

Independent immutable readback checked all 19 original backup tables,
1,329 queue rows, 1,139 accepted-result index rows and the archived
Raster. The legacy attempts released 119,066,624 allocated bytes
after physical exit and reader checks. Only the isolated payloads were
released.

The final bounded process exited 0 in 1.382 seconds, peaked at 318.2 MiB
and used zero swap. Three earlier attempts corrected fixture use of the
database handle, the isolated run guard and the verified-input DTO.
The final evidence is under `runs/noobai-legacy-queue/20261119-r4`.

The next checkpoint joins these readers through the production AppImage.

## Stock AppImage upgrade and readback

Re-read clean InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1`.
`invokeai/app/api/dependencies.py` calls `init_database` before services.
`invokeai/app/services/shared/database/startup.py` invokes the SQLite
migrator and `sqlite_migrator/sqlite_migrator_impl.py` calls the online
copy in `database/database.py`. The queue API in
`invokeai/app/api/routers/session_queue.py` gets stored queue views and
passes reviewed Retry to `session_queue_default.py`. Its page and Retry
owners read historical rows and validate their stored execution.
`invokeai/frontend/webv2/src/workbench/projects/projectFile.ts` calls
`invk/importProject.ts::readInvkArchive` at the portable archive boundary.
The AppImage fixture uses Studio's existing Main owners, real preload,
Queue Manager, Saved generations and Compare.

The stock AppImage used the production build `4f08d1cd` and SHA-256
`555c6a7985ef1cad3b0427d97862aa3db94da3cbf0d4ffdc7a67da5201bfc5d8`.
The private mount namespace binds a writable, owned copy at the original
absolute AppData path. It contains the pinned DB17, one `.igs`, and both
manifest/PNG pairs. The other 460 Project packages stay outside the copy.
The copied catalog marks those paths missing and retains their accepted
index rows. The selected package remains available. The AppImage runs
with its ordinary renderer and sandbox on this host. The profile has no
installed worker or local model bodies.

The final run upgraded 17→30, created one private SQLite backup with the
DB17 schema and rows, and kept it byte-identical through the second start.
Both starts exposed all 1,329 exact job IDs in the original order across
27 real preload pages and 27 Queue Manager pages. The two selected rows
showed their frozen seed, steps, sampler, scheduler and V-prediction.
Readback matched all 1,329 queue rows, 1,228 candidate receipts and 1,139
accepted-result index rows. The only permitted Project index updates
were file health, file identity and ordinary scan/open metadata.

Saved generations decoded and opened the selected Raster from the
owned package. The real review IPC refused an otherwise exact reference
with the wrong asset digest. Compare displayed the saved model and sampling
and showed all three missing noise-profile fields as unavailable. The exact
checkpoint/file identity, accepted asset and Project package bytes
matched before and after both application lifetimes.

The actual Retry IPC verified the frozen target before asking for the
runtime. The original target returned `GENERATION_RUNTIME_UNAVAILABLE`.
Changing its first byte in the disposable copy returned
`QUEUE_INPUT_INVALID` with the public storage-verification message.
Restoring the byte returned the original runtime refusal. The untouched
neighbor, both manifests and all durable job/receipt rows stayed exact.
This check covers frozen input validation and historical readback.
Dispatching the historical recipe with a compatible worker remains a
separate release case.

The first four attempts closed normally and retained their failure
receipts. The harness corrected the frozen-details locator scope, split
the grouped Saved generations observation and explicitly scrolled its
lazy image into view. It then checked the ordinary Raster view DTO and
the public input error message at their actual boundaries.
The final wrapper exited 0 in 85.911 seconds with zero swap and an 8 GiB
aggregate limit. Both AppImage lifetimes exited normally with all 20
tracked process identities confirmed gone. The focused queue, database,
accepted provenance, index, Compare and process-boundary suites passed
275 tests with zero failures and zero skips.

Independent readback matched the DB17 backup across all 19 application
tables and `sqlite_sequence`, both DB30 snapshots, the six source file
identities, both saved packages and the 93,987-byte Raster. Evidence is
under `runs/packaged-legacy-noobai/20261120`. After process and reader
exit, cleanup removed disposable profiles, extraction and duplicate
database and Project bodies. It released 349,732,864 allocated bytes.
Reports and checksums remain with the original six source files pinned
through the artifact dependency records.
