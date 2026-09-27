# Phase 2B: durable publication of one unaccepted candidate

Risk: **high**. This checkpoint coordinates worker-produced pixels, app-owned
recovery files, a SQLite queue transition and the Project's operational seed
cursor. The required behavior comes from [PP-008](../product-promises.md#pp-008-генерация-меняет-проект-только-по-явному-решению),
[GenerationResults](../features/project/generate-mode/generation-results.md#candidate-lifecycle),
[Queue Manager](../features/queue-manager.md#candidate-handoff-rules), and
[Data Storage](../specs/03-data-storage.md#temporary-generation-staging).
It does not make the current derivatives-only Python worker perform inference.

## Checked path and boundary

- The prior [durable enqueue](./phase-2b-durable-enqueue-research.md) owns the
  frozen Illustrious txt2img context and target PNG. The queue repository can
  now claim one verified pending item as running and gives it a status sequence.
  The request lease supplies a main-chosen `result.png` under private app
  scratch; the lease deletes its provisional directory afterward.
- Before publication, main must have observed a worker completion for that
  exact running attempt. This repository accepts a provisional path and actual
  uint32 seed, but it does not connect to a worker or assert that inference
  happened. It rejects a caller path outside canonical app scratch, a
  cancel-requested row, a stale status sequence and an unsafe/symlinked file.
- The candidate's verified pixels, exact frozen queue JSON, Project/local
  identity, finite bbox, actual seed and completion order are stored outside
  the portable `.igs`, document autosave shadow, accepted provenance and
  accepted-result history. Queue history can be pruned independently.

The first output is one normal Illustrious txt2img raster, not a Smart Patch
variant or an accepted layer. Publication requires the frozen width/height,
8-bit RGB/RGBA data, pinned sRGB ICC, valid PNG chunks/zlib and a legal filter
byte on every decoded row, including Adam7 passes. The repository derives
bytes/hash from its open file descriptor rather than trusting worker-reported
metadata. This bounded validator is not a complete PNG decoder; production
preview/acceptance must still check actual decode at that boundary. The
per-output 32 MiB ceiling is defensive, not a measured GPU capacity or a
product quota. This generation-output gate rejects 16-bit RGB/RGBA PNG even
though the general `.igs` raster validator accepts that bit depth.

## Publication and crash ordering

SQLite migration `0006_generation_staging.sql` records one receipt per queue
item. Its monotonic `completion_order` is reserved after the output has
passed validation, while the queue item is still running. One receipt per job
keeps repeated publication attempts idempotent. The receipt binds the exact
frozen-payload hash, canonical local Project path/key, staging session,
expected running sequence, image hash/size, actual seed and the timestamp
which becomes `completedAt` in the manifest. That binding still works after
the queue row is pruned.

The repository then copies the PNG into
`recovery/generation-staging/{local-project-key}/{session-id}/assets/` and
fsyncs it. Its temporary hardlink is removed and the asset directory is fsynced
before a manifest may refer to the candidate; newly created parent directories
are fsynced as well. It atomically replaces the session `manifest.json` and
fsyncs its directory. SQLite explicitly uses `synchronous=FULL`. Only after a
validated manifest is durable does one SQLite
transaction compare-and-swap the same running sequence to `completed`, mark
the receipt completed and update `generation_seed_cursor` if its order is
newer. The cursor is Project-scoped operational metadata; this checkpoint does
not write its snapshot into `.igs` or enable Seed Reuse.

The first processor is specified to run one job at a time. Reservation order
therefore equals completion order for committed jobs. Parallel completion
would require revisiting this ordering contract before adding workers.
Timestamp sorting was rejected because wall clocks can tie or move backward.
Using only the queue row was rejected because its pruning must not remove a
valid unaccepted candidate.

On startup, queue reconciliation cancels prior-lifetime pending/running rows.
Staging reconciliation then verifies the actual manifest and PNG. It may
complete a reserved receipt only when the queue row is `canceled` with
`APP_RESTART` and sequence exactly `expected running sequence + 1`. It never
revives an explicit `USER_CANCELED` attempt, a later retry, an absent row or
an invalid asset. A previously completed receipt remains listable with a
valid manifest even if its terminal queue row has been pruned. Candidate
listing and reading the local seed cursor are gated until that reconciliation
succeeds in the repository instance. The Electron bootstrap invokes it after
queue reconciliation; a future processor must retain that instance or run
the same gate before processing.

The filesystem and SQLite cannot share one atomic transaction. If asset
publication happened without a manifest, the file is not a candidate. If the
manifest committed before the SQLite completion transaction, startup replays
that exact receipt. If an explicit cancel wins before the final transaction,
the manifest remains hidden because listing requires a completed receipt and
the compare-and-swap fails. This checkpoint leaves cleanup of unpublished
orphan assets, user-driven session discard and acceptance to later work; it
does not expose staging in the production UI. The numeric total staging quota
still requires capacity tests, with no silent eviction of valid candidates.

## Evidence and limits

The [integration tests](../../src/main/projects/generation-staging.test.ts)
exercise real SQLite, a real `.igs` package, checked PNG/ICC bytes, queue claim,
filesystem publication and process-like close/reopen. They check valid output,
row-pruned recovery, rejection of a candidate transplanted into another
Project's manifest, immutable `.igs`, manifest-first restart, a real SQLite
completion-abort trigger, explicit cancellation, stale sequence, invalid and
symlinked provisional files, an invalid decoded PNG scanline filter, and
16-bit RGB and RGBA output rejection after each passes the general `.igs`
PNG validator. They also check post-publication asset corruption. The
neighboring valid reopen stays accepted while corrupt output is excluded.
`pnpm exec tsx --test src/main/projects/generation-staging.test.ts` passed
**7/7** after implementation. An isolated semantic mutation inverting the
`APP_RESTART` recovery guard made both crash-recovery tests fail (5/7);
restoring it returned the suite to 7/7. The expanded 16-bit RGB/RGBA cases
passed the focused suite and the full `pnpm run app:test` (312/312).

This proves the local publication/recovery boundary, not a real GPU job,
renderer Generate, progress/cancel signaling to a worker, Add as Layer,
portable Save, accepted provenance/history, or measured capacity. Those
remain separate phase-2B/2C gates.
