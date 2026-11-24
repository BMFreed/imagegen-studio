# Packaged Repair after an incompatible installed worker

The Phase 5 contract requires one AppImage upgrade profile to preserve the
historical Project and queued inputs, refuse an incompatible worker, then
switch to a compatible runtime after explicit Repair. The prior checks
qualified the refusal and fresh-slot Repair in separate profiles.
[Runtime contract](../specs/07-python-runtime-management.md#repair-semantics),
[installed refusal](./phase-5-packaged-installed-engine-research.md#stock-appimage-with-an-incompatible-installed-worker),
[staged Repair](./phase-5-packaged-runtime-setup-repair-research.md).

## Source and qualification boundary

Production base `de97e7c3bebaf711dc7859040e0830ff90f7d41d`. Fresh source checks
used InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1` and Invoke Launcher
`c267bdb439519216b277a7a8c6ad408b9d79efce`. InvokeAI's
`docs/src/content/docs/start-here/installation.mdx` delegates desktop
installation to the launcher. The launcher's
`src/renderer/features/InstallFlow/state.ts` calls the
`install-process:start-install` owner in `src/main/install-manager.ts`.
Repair reinstalls managed Python and recreates the current venv before
sync. Invoke's `invokeai/app/run_app.py` calls
`invokeai/app/util/startup_utils.py` for Torch, CUDA and cuDNN startup checks.

The database reference is InvokeAI's `invokeai/app/api/dependencies.py`
through `invokeai/app/services/shared/database/startup.py`,
`sqlite_migrator/sqlite_migrator_impl.py` and `database/database.py`
under `invokeai/app/services/shared`. The queue reference is
`invokeai/app/api/routers/session_queue.py::retry_items_by_id` through
`invokeai/app/services/session_queue/session_queue_default.py`.
This scenario uses Studio's existing startup, Repair, queue, Save and
runtime-pointer owners. It adds a route to the existing qualification-only
AppImage and loopback artifact provider.

## Profile and oracles

Restore five pinned regular members from the original DB29 checkpoint
archive into owned ext4 state. In a private user and mount namespace, bind
that state to the absolute AppData path embedded in the installed Python.
Bind the previous Python and environment slots read-only, including the
nested bootstrap mount. Only the worker's protocol declaration is replaced
with the pinned protocol-2 fixture. Both slot parents remain writable for
the real installer. The launcher drops ambient and inheritable capabilities
before it starts the controller and AppImage.
[Profile source](../../scripts/fixtures/packaged-runtime-protocol-repair-profile.py),
[namespace](../../scripts/fixtures/packaged-runtime-protocol-repair-namespace.sh).

Check the online pre-migration DB29 backup and the full migrated index
before the first Project action. Through the AppImage the installed worker
must report Repair required. Generate and historical Retry must refuse
without changing the queue or frozen files. Opening and canceling the
first Repair review must keep the pointer, slots, requests and Project
intact. The second review consents to the exact signed transport and
outpainting resource. Require actual transfers, exact extracted entries,
completion of both worker checks around activation, and durable publication
of a distinct slot while the original remains mounted and pinned.

Explicitly edit and Save the historical Project through the installed CPU
preview worker. Read both previews and the original Raster with a separate
Pillow check, and compare the saved project identity, exact frozen request
and index. Cold reopen must do a new CUDA status check for the new slot and
read the exact saved Project. The historical model file is a synthetic
56-byte fixture. The frozen Retry is a preservation check, and trained
inference requires its own model control.
[AppImage scenario](../../scripts/fixtures/packaged-runtime-protocol-repair.mjs),
[historical state checks](../../scripts/fixtures/packaged-runtime-protocol-repair-state.mjs).

## Executed result

The `20261124-protocol-repair` qualification AppImage passed on the
local Linux ext4/NVIDIA host with an RTX 4080 and driver `615.71.09`.
AppImage SHA-256
`de63582da4f9d3536865018f67adb8f265e83401adbfa7a938f29bb131b004a1`.
Embedded ASAR SHA-256
`9097a39a462322c0a546aa8352ef55affefee687a63a3adf961f03dc64bdc962`.
Its builder compared 42 production dist assets and the separate
qualification Main entry. Execution was extract-and-run.

- Main retained the 29-migration backup and applied migration 30. The
  protocol-2 worker reported the existing self-test failure and disabled
  Generate and Retry. Direct attempts through their normal IPC returned
  `GENERATION_RUNTIME_UNAVAILABLE` with the full index and frozen files
  intact.
- Repair review dismissal kept the prior pointer, journal, sole slot and
  idle installer. Confirmed Repair transferred 3,424,284,558 bytes over
  loopback and reverified 4,607 extracted entries. The journal retained
  the former pointer bytes and published a distinct protocol-1 runtime
  after the pre- and post-activation checks. The original slot matched
  its prior filesystem identities and file pins. Outpainting status was
  Ready on both lifetimes.
- Explicit Save checked 3,072 pixels across the two 48×32 previews and
  kept the exact original Raster and ICC. The saved package reopened
  byte-for-byte with the same document ID and the updated revision and prompt.
  The historical queue row, status sequence, frozen request and bound
  model and image files remained intact.
- Both Main lifetimes closed normally. The combined hard memory limit was
  8 GiB across the qualified controller and KDE AppImage groups, with
  zero swap and zero OOM events. At consent the owned filesystem had
  59,038,916,608 bytes free. After publication it had 37,031,886,848
  bytes free. These are measurements for this run and transport.

Two preliminary controller attempts stopped before launching Main. One
used Node's strip-only TypeScript loader on the existing Project reader.
The other compared a retained byte copy against the source pin including
its original path. The passing attempt used tsx and verified the same
bytes at their owned copy path. The checkpoint database was unchanged
across the preliminary attempts.

Typecheck, production app build, AppImage packaging and scoped lint passed.
The focused runtime and database suite passed 326 tests including subtests
with zero failures or skips. It enabled the pinned release config, LaMa
and actual host preflight fixtures, using the existing test ports outside
the native scenario.

Independent readback matched the contained ASAR and 42 build assets,
20 native source pins, both transferred artifacts and the 73 installed
worker files in the signed wheel. It checked the DB29 backup and both
closed DB30 bodies, the unchanged frozen inputs and staging inventory,
and all 3,072 decoded preview pixels. Both lifetime receipts and the
wrapper scope showed physical exit. Compact evidence is retained under
`runs/packaged-runtime-setup/20261124-protocol-repair`.
