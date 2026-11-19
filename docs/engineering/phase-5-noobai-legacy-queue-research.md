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

This covers the production database, queue and Project readers. Native
AppImage upgrade, dispatching the historical recipe and worker refusal
remain separate cases in the [MVP backlog](./mvp-acceptance-backlog.md).
