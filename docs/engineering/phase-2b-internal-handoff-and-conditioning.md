# Phase 2B: internal handoff, runtime qualification and SDXL conditioning

Base: `d8f7f8e` (28.09.2026). Risk: **high**. The expected behavior comes from
[Phase 2B](../specs/01-implementation-roadmap.md#фаза-2b-очередь-и-первая-сквозная-генерация),
[runtime management](../specs/07-python-runtime-management.md),
[Queue Manager](../features/queue-manager.md) and
[generation results](../features/project/generate-mode/generation-results.md).
This is an internal checkpoint, not a user-facing Generate flow or a released runtime.

## Boundary and invariants

`recoverGenerationRepositories()` runs queue cancellation before candidate-receipt
reconciliation and returns the **same** queue/staging objects that a processor may use.
An unsafe storage root or failed recovery yields no dispatchable pair. The new
`GenerationOrchestrator` takes an open Project tab, resolves its healthy indexed
canonical path and document identity, composes the current frozen target,
re-verifies the exact checkpoint, materializes a qualified request and inserts a
durable queue row. Dispatch is a separate `runNext()` operation: it claims the
oldest pending row, which may differ from the row just inserted. `runNext()`
waits for enqueues already in progress; a later enqueue can overlap a running
dispatch. The orchestrator cancels the exact new row if the
Project closes or its indexed identity changes during durable insertion. Main
must own one orchestrator/processor pair; a separate processor instance is not
covered by this local barrier.

`RuntimeManager` now treats an app-owned pointer as a location hint, never as
proof of readiness. It derives an app-owned SDXL config path, fingerprints its
contents, launches the exact 0.2 inference entrypoint with an isolated offline
environment and publishes `ready` only after the protocol handshake **and**
confirmed child exit. Status caching is advisory; its qualified resolver repeats
the live test before returning a worker location. The actual job launch must
still start and handshake its own child. The runtime manager retains a
post-ready qualification child whose exit is unconfirmed; the worker client
separately retains an unconfirmed failed-start child. Each blocks further
qualification/startup until its child exits. A pointer can be forged by the same
user because signed artifact/install validation is not implemented; status is
not release-package authenticity evidence. The status self-test imports the
inference graph and checks CUDA/config without loading a selected checkpoint
or denoising. Its 60-second successful cache can briefly show advisory `ready`
after a package/driver change that leaves the pointer and config unchanged;
the dispatch resolver bypasses that cache, and the job still needs its own
model load and worker handshake.

The Python inference worker now builds positive and negative conditioning
independently with Compel 2.4.0 for SDXL CLIP1 and CLIP2, including pooled CLIP2
embeddings, weighted syntax, long prompts and zero embeddings for empty text.
It passes embeddings to Diffusers rather than raw `prompt=` strings. Unsupported
resource/dynamic/compositional/LoRA syntax remains an explicit error. The editor's
common `(tag:1.2)` attention form is translated to Compel's `(tag)1.2` before
both tokenizers and encoders; signed/exponent or ambiguous colon forms fail
explicitly because Compel would not preserve their apparent weights. This is
still narrower than the editor's advisory syntax diagnostics and must be
resolved before user-facing Generate. The
four-77-token ceiling is a provisional operational bound, not an Invoke or
model capacity claim. The default derivative worker keeps its Pillow-only
dependency set; the pinned inference extra is separate in `uv.lock`.

## Evidence and limits

| Boundary | Observed evidence | Does not prove |
| --- | --- | --- |
| Bootstrap | Real SQLite/filesystem tests return recovered instances and reject unsafe queue or staging storage. | Electron has retained these instances for a user dispatch. |
| Internal handoff | Five integration scenarios use real `.igs`, ProjectService, derivative subprocess, ModelService structural preflight, SQLite queue and staging; only inference output is supplied at the transport seam. A close during enqueue leaves a canceled row and no candidate. | Renderer Generate, a managed checkpoint's full GPU load, or acceptance into `.igs`. |
| Runtime qualification | Fourteen app-owned child-process tests exercise missing/changed config, pointer change, wrong ready version, exit confirmation, isolation, resolver cache bypass and unconfirmed-exit blocking. A semantic mutation that skipped prior-exit confirmation made its test fail. | Signed/exact release artifacts, a complete installer, or actual CUDA behavior in that test fixture. |
| Worker startup ownership | Eight real-subprocess client tests include a red-before/green-after unconfirmed-start case: no second child launches until the first exit is observed. A mutation removing retry cleanup made it fail again. | Scheduling between an already-ready generation worker and a concurrent runtime status probe. |
| Python conditioning | The light Python suite passed 109 tests with one skipped real-Compel case; that parser case passed separately in the full dev environment. Tests cover independent dual-CLIP, weighted/empty prompts, unequal-length masking, CFG order and hook cleanup. Local RTX 4080 JSONL smokes with long weighted positive/empty negative generated pinned-sRGB PNGs; the final 128×192 DPM++ SDE Karras run used seed 42. Real SDXL inspection observed two UNet calls with the expected `[negative, positive]` `(2, 154)` mask and no leaked hook. | Pixel parity with Invoke, LoRA/regions/advanced options, release performance or a managed CivitAI-install flow. |

A separate real-model check through the installed InvokeAI Python environment
loaded the local checkpoint and found identical CLIP embeddings and pooled
output for `(blue lantern:1.2)` and `(blue lantern)1.2` after worker
normalization (shape `[1, 77, 2048]`, pooled `[1, 1280]`). This checks the
colon-weight bridge but does not repeat full denoising. The earlier long-prompt
GPU smoke used a 154-token positive sequence with an empty negative. The worker
now zero-pads the shorter side and adds the matching attention mask to each
UNet call through a scoped PyTorch pre-hook because the pinned Diffusers SDXL
pipeline does not expose that input. The hook is removed even if inference
fails. A direct tiny-UNet comparison found the hook and direct mask calls
identical, while omitting the mask changed the output. This checks the padding
boundary; it does not establish pixel parity with Invoke. Independent review
also found two SDXL semantic drifts: the SDE Brownian sampler used a constant
seed instead of the actual job seed, and Diffusers inferred original/target
time IDs from output dimensions while Invoke's default conditioning uses
1024×1024 with zero crop. Both are corrected in this checkpoint, with focused
tests for the two SDE keys and for non-square output dimensions. Three isolated
semantic mutations (swapped mask rows, SDE seed reset to zero, time IDs derived
from output dimensions) each failed its focused test. A real CFG=1 SDXL probe
observed a positive-only `(1, 154)` mask when needed and no mask when the
positive sequence was unpadded; a non-square real run observed both time ID
rows as `[1024, 1024, 0, 0, 1024, 1024]`. Model cache and measured batch
performance remain a separate release gate.

The local GPU smoke used an existing Invoke development environment and local
SDXL-shaped checkpoint; its CivitAI identity was not established. No public
readiness status changes. The release installer still lacks a signed manifest,
app-managed Python/wheelhouse, pinned config delivery, exact installed-package
check, activation and rollback. Electron still has no Generate/Results IPC or
Project acceptance/provenance path. A failed qualification leaves the runtime
unready; no Project file or model file is changed. A failed internal enqueue
stays in durable queue recovery or is canceled by exact ID; a candidate remains
outside `.igs` until a future explicit Add implementation.

The combined application suite passed 366/366 tests after a runtime fixture
was corrected to observe any child exit, not only a SIGTERM handler. `pnpm run
lint`, `pnpm run typecheck`, `pnpm run app:build`, Ruff format/check and
basedpyright passed on the dirty tree. The Electron startup still recovers
queue/staging into temporary instances and exposes no dispatch caller; the
new bootstrap helper is exercised by the internal orchestrator tests, not yet
used by the application entrypoint. A later Electron integration must retain
one recovered pair and prevent a runtime status probe from competing with a
running CUDA job.

This paragraph records the state of that checkpoint. The later
[retained-recovery and owned-dispatch checkpoint](./phase-2b-owned-dispatch-and-recovery.md)
adds both internal boundaries; Electron still has no Generate caller.

An isolated detached-worktree mutation removed queue recovery from the
bootstrap helper. Two of its three focused tests failed (`QUEUE_NOT_RECONCILED`
and wrong unsafe-storage error); the original helper passed 3/3 again after
the worktree was removed. This checks sensitivity to skipping the real
repository recovery call, not merely a fixture-defined flag.
