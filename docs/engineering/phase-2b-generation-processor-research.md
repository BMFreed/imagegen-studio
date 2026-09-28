# Phase 2B: private generation processor handoff

Base: `146c775` (2026-09-28). Risk: **high** — a mistaken worker-exit or
publication decision can release the sole GPU slot early, lose a candidate, or
turn a late completion into a Project-visible result. Expected behavior comes
from [Queue Manager](../features/queue-manager.md#processor-model),
[Worker Protocol](../specs/05-worker-protocol.md#правила-протокола), PP-005 and
PP-008. This checkpoint is internal; it does not enable Generate in Electron.

## Boundary and verified assumptions

The production path already had an immutable Illustrious `txt2img` input, a
SQLite queue row, a staging receipt/manifest repository, and restart recovery.
The gap was the handoff between them. `GenerationProcessor.runOne()` now takes
a runtime-qualified transport, rejects an unqualified `ready` message before
claim, and requires successful queue *and* staging reconciliation on the same
repository instances before dispatch. The current `derivatives-only` Python
worker does not meet that inference capability; no production transport is
wired to this processor yet.

After claim, the processor rechecks the frozen target bytes and exact managed
checkpoint/prediction type, materializes fresh private scratch paths, and sends
one versioned request. It correlates `generation-done` by protocol, request ID,
output path and actual uint32 seed. The seed reported by the worker may differ
from the scheduled seed; staging stores the actual value as candidate metadata
and the Project-scoped `Reuse` cursor. The worker-provided queue ID is never
trusted for publication. The `.igs` document is not changed by completion.

| Failure boundary | Durable decision |
| --- | --- |
| Inference capability or startup reconciliation unavailable | Do not claim a pending row. |
| Frozen target/checkpoint changes before dispatch | Fail the exact running sequence without starting inference. |
| Malformed `done`, missing/invalid PNG, or other proven pre-publication failure | Confirm worker exit, then fail the exact running sequence and remove scratch. |
| Receipt exists after a publication error, or its presence cannot be checked | Keep the running row for restart reconciliation; never mark it failed speculatively. |
| Running cancel | Mark cancel requested, close worker, acknowledge only after observed exit, suppress late `done`. |
| Worker exit remains unconfirmed | Keep the active transport, scratch lease and SQLite running slot; a later explicit cancel may retry close. |
| Scratch cleanup fails after a durable outcome | Emit a diagnostic, clear the in-memory owner; cleanup cannot undo a completed candidate or acknowledged cancellation. |

`ProjectWorkerClient.close()` previously returned immediately after sending
`SIGKILL`. It now observes `exit` (or `close` for failed spawn), first waits two
seconds after `SIGTERM`, then two seconds after `SIGKILL`, and reports
`WORKER_EXIT_UNCONFIRMED` if termination still cannot be established. A later
call can retry. The timeouts preserve the existing two-second graceful window;
the post-kill bound prevents an indefinite close wait. Failure to confirm exit
does **not** free the queue slot.

## Evidence and limits

Focused tests use real ModelService, SQLite queue/staging, app-owned filesystem,
and sRGB PNG validation; only the GPU inference transport is substituted. They
exercise successful publication with a worker-reported seed different from the
scheduled one, readiness/recovery gates, a changed model-library prediction
override, malformed correlation, missing/invalid output, receipt-present
uncertainty, cancellation while `generate()` never settles, unconfirmed-exit
retry, and late completion suppression. Worker-client shutdown tests use real
child processes, including a child that ignores `SIGTERM`. The independent
review found and drove fixes for invalid-output slot stranding, lost retry
ownership and cleanup overriding a durable result.

Validation on this working tree: `pnpm run lint`, `pnpm run typecheck` and
`pnpm run app:test` passed (338/338 tests, including 12 processor and 16
worker-client tests). The Electron smoke passed when launched with
`ELECTRON_OZONE_PLATFORM_HINT=wayland`; the default Xwayland run was stopped by
its 1920×1080 content-size assertion being clamped to 900×620 on the current
1920×1080 desktop. An isolated semantic mutation inverted the processor's
receipt-present condition. The missing-PNG test then failed because the job
incorrectly became `PUBLICATION_UNCERTAIN`; the original test passed after
discarding the mutation. The mutation used a temporary archive/copy and did
not touch the working tree.

This evidence does not prove CUDA inference, checkpoint loading, a release
runtime, renderer Generate/Queue Manager, progress, retry/prune UI, candidate
acceptance, immutable accepted provenance or `.igs` storage. A worker-error
close that cannot confirm exit remains unresolved until explicit cancellation
or process restart; if the user explicitly cancels it, the durable outcome is
`canceled`. The current Electron bootstrap constructs temporary repository
instances for recovery and does not construct this processor. Integration must
retain the successfully reconciled instances and surface recovery failure
before enabling Generate.
