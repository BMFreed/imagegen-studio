# Regional denoising progress

## Boundary and source

Medium-risk transient telemetry change on
`master@d1a06bf5cbc06c7317e33dac0bc38a32adc74033`. The preceding
[Main lifetime checkpoint](./phase-4-regional-guidance-main-death-research.md)
qualified process ownership and frozen Retry. It explicitly left numeric regional
progress open. This slice connects completed native steps to the existing
Project/Queue progress feed and tests cancellation after an observed step.

Consulted current clean InvokeAI
`a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd`:

- `invokeai/app/invocations/sd/denoise_latents.py`: existing pipeline callback,
  invocation-context forwarding and `PreviewExt` registration.
- `invokeai/backend/stable_diffusion/extensions/preview.py`: initial zero and
  completed `step_index + 1` after the original scheduler step, with actual
  schedule length.
- `invokeai/backend/stable_diffusion/diffusers_pipeline.py`: callback around the
  existing native loop, rather than another sampler.
- `invokeai/app/services/shared/invocation_context.py` and
  `invokeai/app/util/step_callback.py`: queue-associated transient progress and
  cancellation, separate from completed results.

Studio adapts that mechanism through its existing scalar
`run_sdxl_pipeline(on_progress=...)`, JSONL exchange, processor ownership guards,
`GenerationProgressSource`, IPC and existing renderer controls. The native loop,
schedule, output conversion, cancellation/physical-exit owner and renderer remain
unchanged. No latent/image preview is requested or transported. The existing
numeric schema starts at one; initial zero remains the existing busy state.

## Contract

Only a qualified engine 0.14 peer with `denoising-progress`, a regional execution
capability and new `illustrious-regional-progress-v1` may opt in. Main adds
`reportProgress: true` to the private request only when that peer and a callable
observer are present. Absence preserves the old wire shape and quiet regional
execution. Any other present value refuses; requested telemetry without a
callable worker sink refuses before loading. Old Main/new worker and new
Main/old worker retain the quiet path. This adds no public command or persisted
recipe/queue field.

The original native callback emits scalar completed steps `1..N` with its actual
schedule length. Existing JSONL validation owns correlation, bounds, ordering,
slot retention and terminal response. Main additionally associates telemetry with
the claimed document, job, project and running status sequence, and checks the
frozen step denominator. Presentation observers receive detached values and
cannot alter execution. Cancel/stop, failure and settlement clear current
telemetry; stale callbacks cannot revive it. Progress never writes SQLite,
advances seeds, creates receipts or changes document/provenance state.

`N/N` means denoising finished. Decode, PNG validation and durable candidate
publication still have to succeed. Progress neither resets the request deadline
nor releases the single worker slot. Physical exit still governs canceled-worker
release and transport disposal. Retry retains the original frozen input and
gets a new request/counter.

## Qualification

ROOT confirms **477 distinct lower PASS: 243 Main/JSONL and 234 Python**, with
128 Python warnings in the accepted reports. The new coverage includes nine
processor cases, twelve real-subprocess JSONL cases and 26 Python cases. Full
TypeScript checks, scoped strict Python typing (zero errors/warnings), scoped
ESLint/Ruff/format checks and a fresh desktop build pass. Controlled peer tests
qualify IPC/ownership, not model execution. Small native CPU/CUDA tests separately
observe the original Euler return before each scalar callback, empty callback
tensor inputs, exact PT/PNG equality with the quiet control, and original sink
failure/restoration/fresh-call behavior.

The isolated Python source mutation drops only progress forwarding. Its twelve
executions give **four GREEN → two semantic RED plus two quiet controls GREEN →
four restored GREEN**. Both CPU/CUDA targets fail on the missing scalar sequence
after genuine PNG publication. All 142 fixture files restore exactly; workspace
and installed code are untouched.

Installed `native-r4` passes **14 checks in 179.005 seconds**, one real built
Electron lifetime using the default RuntimeManager and refreshed noneditable
worker 0.14.0. Original JSONL and Main IPC reach the existing Project/Queue
counters at **5/30 and 6/30** while operational SQL stays unchanged. Cancel clears
Main progress before physical worker exit/close and acknowledgment, with no stale
repaint. Same-stack invalidation is established by the focused processor tests;
the installed IPC handler can await its gate before reaching that owner.

After saved edits to two steps, seed 124 and disabled regions, explicit Queue
Retry keeps the original frozen 30-step/seed-123 input, gets a fresh request ID
and emits **1..30**. The actual `30/30` state precedes terminal PNG publication;
settlement clears it. Two regional wires yield one canceled job and one completed
receipt. Results/browser pixels, explicit Raster Add, Undo/Redo and Save/reopen
retain the control PNG: 1,379,326 bytes, SHA-256
`942f59c35b92c3bab04328d92d3714cca48a24106b0c4a8e818559af17e913a1`,
decoded RGBA SHA-256
`7bc3695217b9f44285c97d7b19a9d2c3478b0441da019b30897c51f5ce126829`.
All prior SQL/package/candidate/input rows and bytes remain pinned, including
three accepted jobs and the prior unaccepted candidate. Only rebuildable
`project_index.indexed_at` is normalized in the historical-row comparison.

The installed witness observes original stdout → Main → DOM. It does not
intercept Python's native callback; the focused native suite owns that separate
proof. All nineteen observed worker subprocesses (fourteen through generation
completion, five later derivative workers) and 28 observed birth identities exit;
healthy Main exits with code zero. Actual launcher/native scopes have
aggregate limits no greater than 12 GiB, zero swap and an 1,800-second deadline.
Recorded peaks are per cgroup, not an application-wide RAM/VRAM capacity claim.

ROOT opens the original running and saved/reopened screenshots using `ui-audit`:
the Queue counter/bar and Cancel remain readable, and settled progress is absent.
This is a two-frame local self-review, not full UI/accessibility or image-quality
acceptance. Independent production source review is CLEAN within source-only
limits. The separate final source/document/retained-data verdict is recorded in
`final-review.md` beside the run; it does not independently rerun native execution.

Excluded attempts remain recorded. An initial wrong test filename collected no
tests; one old Ready expectation and six newly authored exception-type
expectations were corrected. Ten typing diagnostics needed two casts; the first
typing invocation used the wrong project root. Native-r1 refused ROOT's malformed
provision-report fixture before launch. Native-r2 correctly showed progress and
Cancel but its harness rejected the legitimate pending Retry state; after physical
exit, the exact owned pending row was canceled through the existing repository
API, preserving its frozen input. Native-r3's startup window closed for an unknown
reason before Generate; its observed identities exited and its exact watchdog was
stopped. Neither attempt is promoted or erased. The final harness waits for
pending → running, pins the complete accumulated terminal baseline and retains
bounded original startup/exit diagnostics. No production repair was needed.

Evidence directory:
`~/.codex/artifacts/imagegen-studio/runs/regional-guidance-progress/20261104-native`.
The run reuses the protected installed runtime/catalog and original official
Illustrious checkpoint. It creates no model/environment copy or new download.
Native and mutation selections run serially in bounded units; the native launcher
plus actual Electron scope stays within aggregate 12 GiB, zero swap and the
declared deadline.

Complete baseline/qualification/final source snapshots, JUnit/TAP logs, the
mutation source/patch/import proofs, all original screenshots, selected final
app-state archive and verified no-follow payload archive are retained. Runtime,
catalog, original weights/configs and live app data remain protected dependencies.
After archive byte verification, exact Python-source restoration, all then-owned
readers ending and fresh checks of 55 native birth identities, six cgroups,
twenty owned units and global incoming lifecycle references, ROOT removes four
exact disposable paths. The 157 retained entries account for **6,443,008 allocated
bytes reclaimed in the deletion-only interval**. No model, environment, live app
data, candidate or package is removed. The final app-state archive retains 130
entries; the current reusable pool stays at its original absolute path.

## Limits

This is numeric operational telemetry, not elapsed-time estimation or visual
quality. Anima regional inference, arbitrary capacity, worker-only crash
qualification, release Install/Repair and complete InvokeAI parity remain
separate. Existing Smart target-only permissions, frozen-work independence,
explicit Add/Save and Regional Guidance provenance/Compare/preset exclusions
remain intact. PP-001/007/008 stay **«Пока не обещать»**.
