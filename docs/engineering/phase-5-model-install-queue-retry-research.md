# Retry a failed installation from Model Manager

[The previous AppImage check](./phase-5-packaged-model-install-retry-research.md)
established the exact-file reinstall path through Add from CivitAI URL.
The [Install Queue contract](../features/model-manager.md#install-queue)
adds an action on the failed row. It opens a review of that source and
uses the existing confirmation and install owner.

## Source and ownership

Studio base `e8be93765f846c780c5bd7c65ad559aa005a3bd2`. Re-read the
clean InvokeAI checkout `4875d96531ca6712b288f6e660fcbb34143408c1`.

- `invokeai/frontend/webv2/src/features/models/ui/install-queue/InstallJobRow.tsx`
- `invokeai/frontend/webv2/src/features/models/ui/install-queue/useInstallJobActions.ts`
- `invokeai/frontend/webv2/src/features/models/ui/install-queue/queueModel.ts`
- `invokeai/frontend/webv2/src/features/models/data/api.ts`
- `invokeai/app/api/routers/model_manager.py`
- `invokeai/app/services/model_install/model_install_default.py`
- `invokeai/app/services/download/download_default.py`

Invoke's settled retry resubmits the job source through `installModel`,
`install_model`, `heuristic_import` and `import_model`. The installer
reserves the source across preparation and reuses an active submission.
Its part restart requires a live job with retained parts. Studio startup
removes interrupted staging, so the settled resubmission mechanism
applies to this action.

The renderer sends a job ID through preload. Main reads the failed row
and matching primary CivitAI artifact, resolves fresh metadata for its
model and version, and checks the original file and any stored SHA-256.
The same one-file preview goes to the modal and the internal session
consumed by `startInstall`. The current catalog determines Install,
Repair or Already installed. Anima uses its existing acknowledgment
and required-file review. Closing the modal invalidates any pending
Retry preview response. A source claim spans confirmation preparation
through enqueue or failure for both Add and Retry. The existing
active-row check runs before the installed-version lookup. An attempt
that publishes between reads either was seen as active or has committed
its catalog row before the installed-version lookup.

The action reads the existing SQLite job and artifact records. A failed
row is terminal and keeps its artifact and historical error. Confirmation
alone admits a job. The existing serial installer owns download,
verification, publish and shutdown. A missing or changed source ends
review with an error.

## Production-owner controls

The real Main service, coordinator, downloader and SQLite ran against
controlled CivitAI metadata and file responses. Two files advertised the
same hash. A failed attempt on the secondary file was reviewed with only
that file available. A changed or withdrawn hash and a confirmation for
the sibling were refused. Waiting, canceled and unknown jobs were
refused before the provider was contacted.

Two independent previews exercised the same source at three boundaries.
A second confirmation was refused while the first was held before SQL
creation and again while it was downloading. A later confirmation saw
the completed model. The original failed job and artifact stayed intact.
Isolated mutations that removed the pending source claim or moved the
active check behind the catalog query each allowed an extra admission and
failed the regression assertion. Both restored controls passed.

## Fresh AppImage

Run `20261122-r3` used the recovered `failed/interrupted` SQLite store
from the original live interruption and a fresh unsigned AppImage on
isolated X11. The AppImage SHA-256 was
`30e6be62068c0e8307f4fdab7e52605fc2c207375a925d43736d6aa582f0a684`.
The package and embedded ASAR were hashed directly from their files.

CivitAI version `1594319` advertised both `1494323` (the original file)
and `1494307` with the same digest. The ordinary preview showed both.
Retry showed only `1494323`, and the alternate failed in the packaged
Main `startInstall` handler with `MODEL_INVALID_FILE`. Cancel preserved
the original job, empty catalog and empty staging. The second review
confirmed exactly one fresh job, `9b2b5cdc-2e34-4de9-a412-12b18ec0823d`.
CivitAI delivered 334,640,988 bytes in 16.908 seconds. Their SHA-256 was
`fc7d6b12b37b12759e30b1109068a4bb2a0a84e79ab01262cc5af6b89a783ec6`.

Both AppImage lifetimes closed normally. On cold reopen the UI showed
both jobs and the installed VAE without the provider token. The closed
SQLite snapshots were identical, with SHA-256
`712046fdcd79b6e312522326982e1f6d5cff60683ce08e0012b41cc4e59a161c`.
The native scope used a 4 GiB limit and zero swap. It peaked at
1,309,437,952 bytes. The focused suite passed 262 tests with zero failures
or skips, and typecheck, app build and AppImage packaging passed.
An independent audit rehashed the full VAE and the package, compared the
five SQLite readbacks and verified both process cohorts had exited.

The package preflight initially triggered AppImageLauncher desktop
integration. The generated image, desktop entry and six icons were moved
back to the qualification artifact root, and user menu/icon caches were
refreshed. The final package identity came from direct byte reads, and
the actual qualification used the existing isolated AppImage launcher.
The local artifact ledger records the transient preflight image for
cleanup after the desktop daemon releases its open file descriptor.

This case covers one exact CivitAI VAE and the dedicated Retry action.
The shipping platform and provider matrix remains open.
