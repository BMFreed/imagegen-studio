# Remove a NoobAI resource with queued work on the stock AppImage

## Contract and Invoke source

This extends the [idle packaged embedding check](./phase-5-packaged-noobai-component-remove-research.md)
through the [Remove queue contract](../features/model-manager.md#remove-local-resource).
The packaged app owns review, the pending cancellation transaction, managed
file removal and catalog updates. PP-004 and PP-005 retain their existing
public statuses.

The clean local InvokeAI revision was
`4875d96531ca6712b288f6e660fcbb34143408c1`. The wait-only cancellation path
starts in `invokeai/frontend/webv2/src/features/queue/ui/queueMenuActions.tsx`
and `features/queue/data/serverApi.ts`. The callers in
`invokeai/app/api/routers/session_queue.py` and
`services/session_queue/session_queue_default.py` reach
`services/shared/database/queries/session_queue.py::cancel_waiting_work`,
where `_locked_scope` and `_cancel` preserve in-progress work. The dequeue
caller uses a pending-to-running claim. Deletion takes a separate claim in
`app/api/routers/model_manager.py::delete_model` and uses
`services/model_install/model_install_default.py` for managed unlink and
registry removal. Invoke exposes these as separate operations. Studio's
existing adapter uses the exact resource and file references when it scopes
pending cancellation. [Source-built resource controls](./phase-4-model-removal-usage-research.md)

## Owned queue preparation

The stock executable is the same pinned 147,139,886-byte AppImage from
`4f08d1cdb6427a2ca6cdc86ce58de60064f52e30`, SHA-256
`555c6a7985ef1cad3b0427d97862aa3db94da3cbf0d4ffdc7a67da5201bfc5d8`.
The fresh profile uses a copied accepted NoobAI EPS Project and copied
IllustriousPhoto embedding. The test retains the exact CivitAI tuple and
the user-visible accepted provenance from the idle checkpoint.

After packaged Main starts and reports no installed runtime, the harness
uses the existing `GenerationQueueRepository` from the checkout to prepare
durable rows in the owned profile. Startup settles preexisting unfinished
work, so the rows are admitted after startup. The producer adapts the
retained NoobAI EPS frozen TXT request to the opened Project and owned
paths, with the original 721-byte target PNG. The affected rows reference
the exact copied embedding. Two neighbor rows omit it. The other model
references use declared, unpopulated paths for this queue test.

The setup uses normal queue admission, input verification and claim. A
claimed row represents the durable running state. The profile uses no
runtime or worker, and the driver never opens a shipping catalog or
dispatches a generation. Fixture teardown settles its remaining rows
after the product assertions and before normal close.

## Exercised behavior

- An affected pending row is claimed after review. Packaged Main refuses
  both that stale request and a fresh running review. The UI blocks
  Remove while the affected row is running. Rows, frozen inputs and
  managed bytes stay unchanged.
- With an unrelated running row and unrelated pending row present, Main
  refuses removal without pending-cancellation consent and refuses reuse
  of its spent token. Adding an affected pending job after review
  invalidates that review.
- The fresh UI review requires both the missing-reference and exact
  pending-cancellation acknowledgements. Confirm cancels only the two
  reviewed pending rows with `USER_CANCELED` and one sequence increment.
  The unrelated running and pending rows are exact at the consumer.
- The managed embedding copy is unlinked, the library record disappears
  and the exact identity ledger and accepted reference survive. Compare
  reports the missing resource and the accepted PNG and `.igs` hashes
  remain exact.
- The final files and rows survive a cold restart. Retry validates an
  affected canceled row before reaching the no-runtime refusal. A
  changed target byte reaches `QUEUE_INPUT_INVALID`. Restoring that
  byte returns the original refusal and leaves all queue rows exact.

## Retained runs

The final run is
`~/.codex/artifacts/imagegen-studio/runs/packaged-noobai-queue-remove/20261121-r3/`.
It has two normal app closes and a zero launcher exit. Four SQLite bodies
cover the fresh review, actual consumer before test-owned teardown, the
first normal close and the cold reopen. Five exact input directories
retain ten files. Two preserved `.igs` files match the original archive.

The first attempt stopped at a fixture directory-name assertion and
closed normally. R2 passed the initial native gate. R3 added the direct
fresh running-review refusal and verified every retained input file
on reopen and after close.

The adjacent idle regression also passed with two normal closes at
`runs/packaged-noobai-component-remove/20261121-r5/` under the same
artifact root. The 222 focused queue, Model Manager, Compare, and scope
tests had zero failures or skips. Typecheck, app build and scoped lint
passed.

## Replay

Use the [private X11 launcher](./phase-5-packaged-project-import-research.md#reproduce)
with `IMAGEGEN_LINUX_PACKAGE_NOOBAI_COMPONENT_REMOVE=queue` and a fresh
`remove` child of `runs/packaged-noobai-queue-remove/<dated-run>/`. Run
`node --import tsx scripts/smoke-linux-package.mjs` so the harness can use
the existing TypeScript queue producer. The app executable and its loaded
Main and renderer come from the stock AppImage.

The finite scope is one unshared embedding, one Project and five owned
queue rows. Active-worker cancellation, shared companion removal,
reinstall, shipping delivery and the joint release matrix remain
separate checks.
