# Remove review while a packaged CUDA job is running

## Contract and sources

The [Model Manager contract](../features/model-manager.md#remove-local-resource)
requires Remove to block while the resource has affected running work.
The [stock queue controls](./phase-5-packaged-noobai-queue-remove-research.md)
exercise direct Main refusals and pending consent with prepared queue
states. This gate adds the actual installed CUDA worker and lets its job
complete.

The clean local InvokeAI checkout was
`4875d96531ca6712b288f6e660fcbb34143408c1`.
In `invokeai/frontend/webv2/src/features/queue/`, the wait-only action in
`ui/queueMenuActions.tsx` calls `data/serverApi.ts::cancelAllExceptCurrent`.
`invokeai/app/api/routers/session_queue.py` and
`services/session_queue/session_queue_default.py` call
`services/shared/database/queries/session_queue.py::cancel_waiting_work`.
Its `_locked_scope` and `_cancel` preserve running work, and the service's
dequeue uses a pending-to-running claim. The model action in
`invokeai/frontend/webv2/src/features/models/ui/detail/useModelActions.ts`
uses `data/api.ts::deleteModel`. Its router claims the model key and the
installer owns managed unlink. The same installer has `register_path`
and `_register` for existing model paths. Invoke separates queue and
model actions. This test drives the existing Studio review that joins
exact installed ownership with frozen queue references.

## Fixture and actual consumer

- Stock Linux AppImage from `4f08d1cd`, 147,139,886 bytes, SHA-256
  `555c6a7985ef1cad3b0427d97862aa3db94da3cbf0d4ffdc7a67da5201bfc5d8`.
- Retained signed installed-engine slot. The wrapper acquires an idle
  qualification claim, holds the old non-runtime data by same-filesystem
  rename, and restores its exact inventory after app and worker exit.
- The existing NoobAI EPS checkpoint `833294/1022833/928571` and one
  **IllustriousPhoto** embedding `2360940/2655289/2542976`. The checkpoint
  and installed worker are borrowed. Only the 49,736-byte embedding is
  copied into a disposable canonical managed path. The exact prior install
  catalog supplies the version and file IDs.
- A real UI Generate submits one 256×256 Euler TXT job. Its frozen negative
  embedding points to the copied body. Before and after the Model Manager
  dialog and a separate read-only Main review, the same SQL row is running
  with the same ID, sequence and frozen payload. The same child PID, start
  identity and bounded cgroup match a positive CUDA memory observation.
- Model Manager reports one affected running job and keeps Remove permanently
  disabled after the missing-reference checkbox is selected. A fresh Main
  review returns the same count. The private embedding retains its
  exact inode and SHA-256. The prepared-queue gate owns destructive IPC
  refusal controls for this policy.
- The original job proceeds to its candidate. Explicit Add, Save, normal
  close and reopen use the existing trained AppImage harness to verify the
  exact accepted negative embedding and Raster bytes.

The nested bounds are 2 GiB for the controller and 12 GiB for its native
AppImage/worker scope, both with zero swap. The controller has a 600-second
deadline. This gate is one resource, one ordinary NoobAI EPS queue job, one
installed worker and one Linux/NVIDIA host. It covers actual running review
and the uninterrupted result, with shipping delivery and the joint matrix
still separate.

## Executed result

The final `trained-noobai-eps-running-remove-r1` under
`runs/packaged-installed-engine/20261118` exited 0 in 123.290 seconds.
The four review observations captured the same running queue row and
worker with a matching 240 MiB CUDA sample. Across that worker's lifetime
there were 21 matching samples and a peak of 7,322 MiB on the RTX 4080.
The first native scope peaked at 9,699,217,408 host bytes, with zero swap
and no OOM event.

The same job completed once with no cancellation. The accepted archive
kept the exact IllustriousPhoto reference after Add, Save and reopen.
Both app lifetimes closed normally and the wrapper restored all 112
original non-runtime entries with exact identity and content.

The independent audit rehashed the two saved archives and both databases,
matched the candidate PNG to the accepted Raster, and checked the restored
112-entry inventory. It matched six executed source files, 77 engine
inputs, and all 42 compiled files inside the stock AppImage. The 351 focused
tests passed without failures or skips. Typecheck, app build and scoped lint
passed.

## Replay

Use `scripts/qualify-packaged-installed-upgrade.mjs` under its bounded
systemd user service with `--family illustrious --profile noobai-eps-running-remove`,
the retained installed-engine report and the stock package proof. Use a
fresh `trained-noobai-eps-running-remove-rN` evidence directory under
`runs/packaged-installed-engine/20261118`. Its sibling `.inputs.json`
pins the retained EPS checkpoint and the exact embedding source and closed
catalog. The fixture verifies and copies those inputs before exposing the
actual AppImage job.
