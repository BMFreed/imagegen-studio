# Phase 2B: frozen Retry while inference is busy

Risk: **high**. Base: `90de518980dc387b3387478e525557f42e8865d3`,
`master`, clean before this slice. Expected behavior:
[Queue Manager](../features/queue-manager.md#frozen-job-rule),
[PP-007](../product-promises.md#pp-007-проект-принадлежит-пользователю) and
[PP-008](../product-promises.md#pp-008-генерация-меняет-проект-только-по-явному-решению).

## Confirmed boundary and alternatives

Queue Manager → typed preload/main IPC → `retryJob(review)` → original verified
frozen input → current exact checkpoint/request qualification → capacity
preflight → SQLite source-sequence CAS/new pending row → serial dispatch.
The existing Project gate protects Retry against Add/close. Candidate recovery,
actual seed and the explicit `.igs` Save remain separate owners.

There were three independent busy-time refusals: Queue Manager refused a
processing engine or any pending/running counts; the controller refused its
active drain; RuntimeManager refused another generation lease. Removing the UI
guard alone would still fail. A second CUDA child would violate the single-worker
contract. Waiting for inference under the Project gate would prolong transient
admission and delay close while holding a volatile operation.

Unlike Generate, Retry already owns a verified PNG and frozen context.
`withIllustriousTxt2ImgRequest` checks these, the exact model and request limits
without sending any worker command. Admission can therefore use a **copied
qualified ready message from the live worker**, while the existing owner retains
exclusive control of that process. No composition, inference, close, status probe,
new child or cached qualification is performed by this busy admission path.
Idle admission uses the existing fresh qualified lease. The future dispatch
always reserves and qualifies its own worker and rechecks its frozen resources.

This slice enables busy **Retry**, not busy Generate. Generate still needs
Canvas composition through the single worker. It keeps its explicit refusal;
retained new captures, session filtering, automatic Open/recovery continuation,
accepted history navigation and release/full GPU pipeline remain separate work.

## Invariants, refusals and races

- Only failed/canceled, reviewed ID/sequence and original open Project key plus
  document ID can Retry. Current draft, seed mode/value and bbox are not read.
- The active worker must be running, readable and qualified. Qualifying,
  unconfirmed exit, closed child, shutdown and unsupported host return no
  admission metadata. A ready DTO exposes no process/path or transport handle.
- A concurrent admission is refused. Processing may continue during filesystem
  validation and publication; there is still at most one running job/worker.
- New-row publication and source CAS remain atomic. Missing/corrupt input,
  model/prediction change, capacity, stale review, fence or changed document
  refuse before publication without changing source revision. Existing uncertain
  publication/exit behavior retains its fence and restart recovery.
- If shutdown, document change or a recovery block is observed after an already
  committed copy, the new row is canceled before admission returns. Its source
  sequence has already been consumed; this is compensation after publication,
  not a claim that an acknowledged SQLite commit can be rolled back.
- A successful publication wakes the drain, including publication after its
  last idle observation. Failed or blocked drains cannot silently restart.
  Shutdown waits admitted publication, then confirmed worker exit before DB close.
- Retry preserves old results, cursor, accepted layers/provenance, dirty, Undo
  and `.igs`. The UI reports errors rather than claiming a refused row is queued.

## Parameters and finite scope

No new queue, worker, timeout or capacity is introduced. One controller admission
and one active worker remain the resource ceilings. Existing frozen target
32 MiB, payload 128 KiB, request wire 64 KiB, prompts 16 KiB, dimensions
2048/4,000,000 pixels, steps 1–200 and CFG 1–30 remain enforced. Existing staging
capacity preflight remains authoritative; disk space/model load/VRAM are external
limits and are not proved by controlled-worker tests.

Queue statuses are the five migration/schema values; only failed/canceled can
Retry. Runtime lease states are qualifying/running/unconfirmed-exit, additionally
bounded by shutdown and closed-client readiness. Worker compatibility is the
existing finite qualified 0.2/0.3/0.4 capability matrix, not an arbitrary new
version fallback. A copied live ready message qualifies this admission only;
it is not a persistent promise that a future activated runtime will work.

## Verification plan

Execute the actual RuntimeManager with controlled subprocess peers and the
controller with real SQLite/files. Hold one active generation; publish Retry
before its release, check unchanged worker ownership/progress/frozen payload and
eventual serial execution. Cover idle/publication wake race, concurrent admission,
stale review, current document, checkpoint/capacity refusal, close and shutdown.
Kill a semantic mutation of a production guard in an isolated source copy with
an unchanged neighboring control; restore and rerun. Run the actual native
renderer/preload/main Queue Manager UI through its controlled peer, inspect
enabled and pending states at compact and normal sizes. Full app tests,
typecheck, lint, build, formatting and document links complete the check.
No prototype or Python source change is planned; these runs do not establish
CUDA readiness, release packaging, installer repair or throughput.

## Observed evidence

Executed on 01.10.2026 against the final dirty tree based on `90de518`:

- `pnpm run app:test`: **697 passed, 0 failed/skipped**, including final
  concurrent-admission assertions. `pnpm run typecheck`, full ESLint plus the
  final changed-test check, app build, formatting and local document links pass.
  Vite retains its existing renderer chunk-size warning.
- Actual controller/SQLite/files: **32 passed**, zero skips, including seven new
  top-level tests and four nested controls. Busy Retry publishes before a held
  sibling finishes, copies exact old PNG/context after prompt/seed edits, keeps
  the one-worker invariant, then executes serially. Real idle observation/wake,
  capacity/runtime/checkpoint refusal, concurrent Retry refusal, shutdown/close
  and concurrent worker-exit block versus late nonblocking failure are exercised.
- Actual RuntimeManager/controlled JSONL children: **31 passed**, zero skips.
  Active qualified 0.2/0.3/0.4 peers lend copied metadata without new launch,
  probe or command. Callback failure keeps the owner; qualifying, closed,
  shutdown/unconfirmed exit and idle/missing/unsupported/unqualified controls run.
- Three isolated production mutations are killed by the unchanged focused tests:
  shared ready capabilities **5 green → 1 pass/4 fail → 5 green**; remove late
  drain wake **2 green → 1 pass/1 fail → 2 green**; restore non-sticky blocking
  error **4 green → 1 pass/3 fail → 4 green**. Every run has zero skips and a
  neighboring control still passes in the mutant. Copies/load probes and source
  hashes are retained; mutant workspaces are removed and live source is unchanged.
- Built native Electron Generate/Queue Manager: **24/24 named checks**, no page
  errors. The actual UI busy Retry consumes one source revision and publishes
  exactly one pending row while the original PID/request/step progress remain
  unchanged. No new peer launch/request occurs. Duplicate review refuses; Cancel
  of the new pending row leaves the running worker and Project intact.
- Native Results recovery/export, five exact navigation checks, early Add,
  sibling cancellation, grouped Undo/Redo, shadow recovery and portable Save
  pass; page errors are empty. General desktop smoke passes all **9** reported
  flows, including Project/window close and degraded runtime/recovery.
- The first general desktop run, concurrent with the Results Electron run,
  failed at an unchanged LoRA hover-tooltip expectation. Its full log is kept.
  The same source and bundle pass when run alone. This does not prove a product
  regression or a causal explanation; parallel native hover/focus sensitivity
  is a harness limitation requiring separate reproduction if it recurs.
- Root and native author opened actual enabled/pending **900×620** and normal
  **1440×900** screenshots; the settled Queue Manager stays inside the viewport
  with separate scroll areas and visible actions/footer. This is a focused
  visual self-review, not a complete hover/keyboard/accessibility audit.
- A reviewer who authored the runtime helper reviewed the other implementation
  and independently ran all controller tests: no blocker. Its missing concurrent
  Retry evidence finding was closed with a held-copy assertion before final runs.

The native peer replaces Python/CUDA/pixels, while renderer/preload/main, runtime
ownership, filesystem, SQLite, staging resources and Canvas remain real.
No Python or prototype source changed, so their suites were not rerun or claimed
as new evidence. No release install, actual GPU throughput/model loading or full
MVP readiness is implied; PP-007/008 public statuses remain unchanged.

Artifacts, executed commands, before/after native hashes and final source hashes:
`/home/user/.codex/artifacts/imagegen-studio/busy-frozen-retry-2026-10-01/`.
