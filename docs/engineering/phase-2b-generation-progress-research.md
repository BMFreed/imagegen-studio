# Phase 2B: actual denoising progress

Date: 2026-10-01. Base: `2a365d5`. High risk because this changes the qualified
worker protocol and asynchronous Cancel/completion boundary. Scope is the existing
Illustrious txt2img pipeline; PP-007/008 remain publicly incomplete.

## Boundary and evidence before implementation

Confirmed: the Python inference entrypoint returned only ready/error/done.
`GenerationWorkerClient` treated other messages as fatal. The processor owns one
claimed SQLite running slot and correlates the worker request with its own frozen
job. Cancel retains that slot until confirmed child exit; uncertain exit/publication
retains recovery ownership. Those decisions must not depend on a progress counter.

Confirmed: forwarding steps through existing processor `onChanged` would make
`App.vue` reread generation state and staging for all open Projects, and reload all
loaded Queue Manager pages. A separate notification is needed for presentation.

Confirmed: inference redirects library stdout to stderr. Resolving `sys.stdout`
inside a progress callback would send protocol events to the wrong stream.
The entrypoint now captures its original binary stdout before redirecting.

The public Diffusers callback runs after each scheduler iteration and returns its
callback payload. The pinned second-order SDE scheduler expands the iteration
sequence, so requested sampling Steps cannot be used as the denominator. Sources:
[pipeline callbacks](https://huggingface.co/docs/diffusers/main/en/using-diffusers/callback),
[pinned SDXL pipeline](https://github.com/huggingface/diffusers/blob/v0.40.0/src/diffusers/pipelines/stable_diffusion_xl/pipeline_stable_diffusion_xl.py),
[pinned SDE scheduler](https://github.com/huggingface/diffusers/blob/v0.40.0/src/diffusers/schedulers/scheduling_dpmsolver_sde.py).

## Contract and finite compatibility matrix

- Protocol `1`, Linux/NVIDIA, worker `0.2.0`: existing inference remains qualified;
  no progress events are allowed. Running status has no fabricated step count.
- Protocol `1`, Linux/NVIDIA, worker `0.3.0`: requires both `illustrious-txt2img`
  and `denoising-progress`. Unknown versions/profiles or missing capabilities
  fail qualification before dispatch. Shared `inference-worker-capabilities.ts`
  is used by transport, request preparation, processor and RuntimeManager.
- Emitting progress under worker `0.2.0` would break old terminal-only app clients.
  The new version makes them refuse startup instead of failing a dispatched job.

Python emits exactly
`{type:'generation-progress', protocolVersion:'1', requestId, step, totalSteps}`.
The public `callback_on_step_end` requests no tensors, returns the same kwargs,
reads the actual initialized scheduler timestep count and requires contiguous
callbacks. No pipeline loop or attention implementation is copied.

Transport requires the current generation request, valid shape, integers, bounded
counts and a stable denominator. Accepted steps increase; duplicates/regressions
are ignored. It retains only the most recently settled generation request identity
and ignores its valid trailing progress. Unknown/crossed identities, progress during
composition, legacy-peer progress and malformed messages fail closed. Late messages
on a closed client are already suppressed. Progress cannot settle a request, release
its busy slot, reset its deadline, publish a PNG or supply trusted Project identity.

Processor binds the callback to its captured active owner and supplies jobId,
local projectKey, portable documentId and claimed statusSequence. It additionally
checks receiving/cancel/exit/stopping/capability/bounds. It invalidates progress
synchronously before awaiting Cancel and before completion publication. Failed
observer callbacks cannot affect generation or another observer's snapshot.

The independent transient snapshot is `{revision,current}`. Its revision increases
within the current app process and fences a getter arriving after a newer event.
Main uses trusted typed IPC; preload checks the entire payload. Renderer subscribes
before reading the initial snapshot. Project and Queue Manager overlays require
exact job, sequence, both Project identities, running status and no cancellation.
Edits after enqueue do not invalidate a frozen job, so live documentRevision is
intentionally not a progress identity.

Progress does not write SQLite statusSequence, queue inputs, staging/receipts,
seed cursor, history, dirty/Undo, shadow or `.igs`. Restart discards it and uses
existing durable recovery. The existing lifecycle notification still refreshes
state/results on real transitions; step events update only the counter.

## Parameter registry

| Parameter                    | Source / value                                                | Behavior and observation                                                                                                                                                              |
| ---------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Requested Steps              | Existing TS/Python request bounds, 1–200                      | Sampling setting stays frozen; progress does not replace it.                                                                                                                          |
| Actual denoising evaluations | Initialized pinned scheduler; Euler/2M: N, SDE: 2N−1          | Counter describes completed evaluations, including second-order ones.                                                                                                                 |
| Wire total cap               | TS `MAX_DENOISING_STEPS=400`; Python `2*MAX_GENERATION_STEPS` | Also at most twice this request's Steps; malformed excess refuses the transport. The maximum current supported SDE total is 399; 400 is a defensive bound, not a new sampler setting. |
| Accepted step updates        | Strictly increasing integers, at most totalSteps              | Duplicate/regressing events cannot move UI backwards or extend timeout.                                                                                                               |
| Protocol line                | Existing 64 KiB                                               | Bounded UTF-8 JSONL parser; no output paths, arbitrary text or previews in progress.                                                                                                  |
| Request deadline             | Existing 30 minutes by default                                | Steps do not reset it; timeout retains the existing worker shutdown contract.                                                                                                         |
| Inference owner              | Existing single running slot                                  | Progress adds no worker, parallel execution or persisted running state.                                                                                                               |
| Stale identity retention     | One last settled generation per client                        | Bounded memory; arbitrary older/crossed messages are refused.                                                                                                                         |
| Native sample                | 259 UTF-8 bytes per non-null typed snapshot                   | Measured fixture payload only, not a GPU/IPC latency benchmark.                                                                                                                       |

A final denoising count is not candidate completion: decoding, PNG fsync and main
validation/publication still follow. No ETA or overall percentage is claimed.
Disk, VRAM, model loadability and packaging remain separate qualification axes.

## Verification

Tests exercise actual production guards, subprocess JSONL client, processor with
real SQLite/files/staging, and native Electron renderer → preload → main → owned
controlled peer. Model/pixel production is substituted where explicitly stated;
none of those substitutions implement the transport, processor or storage SUT.

- Full app suite: 659 passed, no failures/skips. Typecheck (prototype + app),
  ESLint, changed-file formatting, build and diff whitespace pass.
- Python suite: 140 passed, zero skips in the pinned ML environment; the
  lightweight dev environment separately passed 139 with the existing Compel skip.
  Ruff and basedpyright pass. Actual adapter tests cover equal/
  unequal conditioning masks, returned callback kwargs, expanded totals, invalid
  callback schedules, protocol stdout under redirect and callback-before-PNG order.
- Native Generate/Queue Manager: 15 checks pass, zero page errors. Actual 1→2
  events update Project/footer/panel and global row/details; two progress events
  cause zero lifecycle invalidations. Queue rows/sequences, Project DTO, receipts,
  candidate list, cursor and `.igs` are unchanged; final step remains Running.
  Owner Cancel clears before next job's step1; unrelated pending Cancel preserves
  the owner snapshot. Done followed by trailing progress stays completed/cleared.
  Frozen Retry has the same isolation. Active 900×620 / 1440×900 screenshots were
  opened and inspected; geometry checks find no horizontal overflow.
- The installed pinned ML environment executes 20 real scheduler cases (all five
  supported keys × Steps 1/2/7/200). A randomly initialized tiny CPU SDXL pipeline
  executes the actual adapter for all five schedulers with CFG and unequal-length
  conditioning masks, produces 16×16 pixels, reports 2 versus 3 callbacks at requested
  Steps 2 and removes every scoped UNet hook. No downloads are needed; this verifies
  the public callback API/expanded denominator, not a full checkpoint or CUDA.
- Existing native desktop checks pass all 9 flows; native candidate recovery/export,
  confirmed early Add, sibling/neighbor isolation, grouped Undo/Redo, shadow recovery
  and portable Save/reopen also pass. Native Results has zero page errors.
- Isolated processor mutation removes synchronous Cancel invalidation:
  baseline 2/2 → red 1 failure plus 1 neighboring pass → restored 2/2.
- Isolated transport mutation rejects known settled trailing progress:
  baseline 2/2 → red 1 failure plus 1 neighboring pass → restored 2/2.
- Isolated Python mutation substitutes requested Steps for actual schedule length:
  baseline 8/8 → red 6 failures plus 2 controls → restored 8/8.

Retained evidence, commands, source hashes and screenshots:
`~/.codex/artifacts/imagegen-studio/denoising-progress-2026-10-01/`.
Infrastructure failures are retained separately and are not counted as mutations.

## Remaining scope

This connects actual pipeline callback code and verifies its downstream native path
with a controlled peer. A new end-to-end full-checkpoint CUDA inference run and
packaged runtime installation are not claimed. Loading/conditioning/decode progress,
preview images, ETA, queue result thumbnails/session navigation, admission while
busy, other Invoke conditioning/Anima/operations remain separate roadmap slices.

Subsequent [bounded result thumbnail checkpoint](./phase-2b-result-thumbnails-research.md)
adds exact worker0.4.0 with both `denoising-progress` and `candidate-thumbnails`;
the 0.2/0.3 compatibility and progress gates above remain intact. Project Results
now use bounded cache, while Queue Manager previews and output/session navigation
remain open. Historical evidence above belongs to this progress checkpoint.
