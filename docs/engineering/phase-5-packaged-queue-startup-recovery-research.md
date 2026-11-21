# Packaged startup recovery of interrupted queue records

The [Queue Manager contract](../features/queue-manager.md) preserves frozen
inputs after restart and requires explicit Retry. This checkpoint exercises
the current stock AppImage against a prepared, closed generation store.

## Source and fixture

The clean InvokeAI revision was `4875d96531ca6712b288f6e660fcbb34143408c1`.
`invokeai/app/services/session_queue/session_queue_default.py::start` and
`invokeai/app/services/shared/database/queries/session_queue.py::cancel_interrupted`
cancel interrupted workflow chains before the processor starts. The caller
order is in `invokeai/app/services/invoker.py::_start`. The Retry router in
`invokeai/app/api/routers/session_queue.py` calls the queue service's
`retry_items_by_id`, which clones the original execution inputs on explicit
request. Studio's existing adaptation also cancels old ordinary pending jobs.
`generation-bootstrap.ts` recovers the queue before opening the staging and
dispatch owners.

The fixture uses the AppImage built from `353fe8f1` and the exact archived
NoobAI EPS target PNG and frozen request from the earlier packaged CUDA
crash run. It opens a fresh test database and uses the ordinary repository to
enqueue the jobs and claim one of them. The cloned frozen context refers to
an owned copy of a saved NoobAI V Project with an accepted Raster. Its
checkpoint path is deliberately absent. The startup input is one pending row,
one running claim and a terminal row already canceled by the user. Fixture
preparation closes SQLite before the first AppImage starts.

At startup the real Main must cancel the unfinished rows with `APP_RESTART`
and advance their status sequences once. The terminal control keeps its
exact row. Frozen JSON, manifests and target PNGs stay byte-exact. The real
Queue Manager reads the three cancellations and disables Retry with the
runtime-unavailable reason after the Project opens. The matching direct
Main Retry request must return `GENERATION_RUNTIME_UNAVAILABLE` without a new
admission. The saved package, accepted Raster, candidate and seed boundaries
are checked at both normal closes. A second startup must preserve the first
recovery's row state and still expose all three jobs.

## Executed checks

R1 stopped in fixture preparation before launching the AppImage. The durable
queue validator refused the temporary request's noncanonical output name.
R2 uses `result.png` and obtains verified PNG bytes through the existing
frozen Retry reader.

R2 passed both native lifetimes. The pending row advanced from sequence 0 to 1
and the running row from 1 to 2. Both reported the literal `APP_RESTART`
diagnostic. The prior `USER_CANCELED` row matched its baseline. After a refused
Retry and the second startup, the queue still held exactly those three terminal
rows. There were no new candidates or seed records and no saved Project edit.
Both AppImages closed normally. The focused queue, bootstrap, actions and
renderer Retry selection passed 206 tests with zero failures or skips.

The independent audit rehashed the AppImage, 42 embedded files and 12 source
pins. It decoded the saved Raster, merged preview, thumbnail and ICC, and
checked the retained V-prediction provenance. It compared the 25 tables in
all three closed SQLite snapshots and matched the frozen input copies to the
live profile. The two native process groups exited normally. The shared
cleanup for this and the update-interruption checkpoint removed 14 temporary
paths and reclaimed 23,818,240 allocated bytes. The closed stores, frozen
inputs, logs and review receipts remain in the recorded run directories.

The gate covers closed durable queue states and unavailable-engine Retry.
Actual CUDA process interruption and a subsequent successful frozen Retry
remain open in the packaged generation matrix.

## Replay

Run `scripts/fixtures/packaged-project-chooser-x11.py --xvfb <owned-Xvfb> -- node --import tsx scripts/smoke-linux-package.mjs`
with `IMAGEGEN_LINUX_PACKAGE_OFFLINE_PROJECT=queue-startup-recovery`, the exact
AppImage in `IMAGEGEN_LINUX_PACKAGE_APPIMAGE` and a fresh
`runs/packaged-queue-startup-recovery/<date>-rN/queue-startup-recovery` for
`IMAGEGEN_LINUX_PACKAGE_ARTIFACTS`. Put the verified `package-proof.json`
beside that directory. The private service uses 4 GiB, zero swap, a short
owned temporary directory and a 150-second outer deadline.
