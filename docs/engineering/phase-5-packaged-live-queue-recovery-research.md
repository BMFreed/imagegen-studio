# Packaged recovery and Retry of a live CUDA job

The [Queue Manager contract](../features/queue-manager.md) recovers an
interrupted job as canceled and requires explicit Retry of its frozen
inputs. The [prepared queue checkpoint](./phase-5-packaged-queue-startup-recovery-research.md)
qualified startup against closed SQLite. This scenario begins with a real
Generate in the stock AppImage and uses the installed Linux/NVIDIA worker.

## Source and fixture

The clean InvokeAI revision was `4875d96531ca6712b288f6e660fcbb34143408c1`.
Read `invokeai/app/services/session_queue/session_queue_default.py::start`,
`_set_in_progress_to_canceled` and `retry_items_by_id`, and
`invokeai/app/services/shared/database/queries/session_queue.py::cancel_interrupted`.
`invokeai/app/services/invoker.py::_start` starts the queue before the processor.
`invokeai/app/api/dependencies.py` constructs that Invoker. The explicit Retry
caller in `invokeai/app/api/routers/session_queue.py` delegates to the queue,
which clones the graph and field values into fresh execution state.
Studio's current `generation-bootstrap.ts` and `generation-queue.ts` own
startup cancellation and the immutable Retry admission. The app behavior
is exercised through its existing Main, preload and renderer owners.

The stock package from `353fe8f1` was previously read back independently.
The proof accepts the two exact application-update test paths added since
that revision, with a fresh build matching all 42 pinned package files.
The signed retained runtime and the exact managed NoobAI EPS checkpoint
are borrowed at their original canonical paths. Runtime and checkpoint
bytes are validated before and after the run.

The fixture saves the authored Project before Generate. It checks the sole
live `running` row, its frozen JSON, manifest and target image, and the
matching child PID, start time, interpreter and CUDA allocation. The existing
Main-only pidfd signal is gated on the same worker and row immediately
before delivery. After physical exit the runner retains the `.igs` and
SQLite main, WAL and SHM available at that instant. The original durable
row must still be running without a candidate, seed cursor or accepted layer.

The next AppImage opens the same Project clean and displays `APP_RESTART`
in Queue Manager. The sole row must advance from sequence 1 to 2 with the
original frozen bytes. The fixture edits the draft prompt and seed and
then uses the public Retry button. The new row and child must be distinct
and retain the original job inputs. Add and Save remain explicit. The
third lifetime reads the saved Raster and the same closed queue state.

## Executed checks

R5 passed on the RTX 4080 with driver 615.71.09. The first job held an
owned CUDA allocation of 240 MiB when Main was killed during the active
claim. Its exact denoising phase was unobserved. The AppImage wrapper exited
abnormally with code 127 and its owned cohort physically exited. SQLite
still had the sole running row. The next Main canceled it with `APP_RESTART`
at sequence 2. Its frozen request and target bytes survived unchanged.

After the draft edits, explicit Retry admitted one clone with the original
seed 0 and prompt. The draft retained seed 23 and the edited prompt. A
distinct installed worker emitted all three real denoising steps and used
7,434 MiB peak sampled VRAM. The frozen target and the completed PNG both
matched the uninterrupted EPS generation in `trained-noobai-eps-r4` byte
for byte. Only the clone published a candidate and seed cursor. Add and
Save produced one accepted Raster. Both the recovery session and the final
reopen closed normally, keeping the same saved package and queue rows.

The outer runner verified all 112 original AppData entries and 77 engine
inputs after restoration. The serial focused queue, staging, worker, Project,
runtime and package selection passed 302 tests with zero failures or skips.
The desktop build, 42 compiled-file hashes, scoped ESLint and syntax checks
passed. The independent audit reconstructed the crash SQLite from 41 WAL
frames. The raw main file alone had zero queue rows. Reconstruction found
the sole running claim, and the final closed stores preserved the canceled
source, completed clone, accepted Raster and seed. The audit verified 32
recorded process identities had exited. Cleanup released seven idle paths
and reclaimed 14,290,944 allocated bytes. The native report and receipts
are retained under
`runs/packaged-installed-engine/20261118/trained-noobai-eps-r5`.
This covers one cleanly saved Project and one NoobAI EPS job after Main
death on the tested host. CUDA inference across a signed application update
and the shipping host matrix remain open.

## Replay

Build with `pnpm run app:build` for the stock package proof comparison.
Run `node --import tsx scripts/qualify-packaged-installed-upgrade.mjs`
with `--family illustrious --profile noobai-eps --queue-crash-recovery`,
the retained `--engine-report` and `--model-inputs` descriptor, the
stock `--package-proof` and a fresh `trained-noobai-eps-rN` child of the
installed engine run as `--artifacts`. The outer user service uses 2 GiB,
zero swap and a 600-second deadline. The owned native scopes use at most
12 GiB, with the total bound checked for each lifetime. Run with a short
owned temporary path and a desktop that creates an observed native scope.
