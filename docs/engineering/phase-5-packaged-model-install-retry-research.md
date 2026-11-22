# Explicit reinstall of the exact file after an interrupted download

The [live interruption run](./phase-5-packaged-model-install-interruption-research.md)
left one VAE installation at `failed/interrupted` after recovery.
This check starts from its closed SQLite snapshot and runs the existing
Model Manager import review for the exact same CivitAI file. The failed
job remains part of the queue history.

## Source and packaged consumer

Studio base `50703673e3e6780d81421f2410a103d80a2b5940`. Re-read clean
InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1`.
The queue action restarts retained failed parts when eligible. For
other jobs it calls the install API again with the source. The backend
coalesces active source jobs and creates a new job after failure.
Consulted paths in the InvokeAI checkout:

- `invokeai/frontend/webv2/src/features/models/ui/install-queue/InstallJobRow.tsx`
- `invokeai/frontend/webv2/src/features/models/ui/install-queue/useInstallJobActions.ts`
- `invokeai/frontend/webv2/src/features/models/data/api.ts`
- `invokeai/app/api/routers/model_manager.py`
- `invokeai/app/services/model_install/model_install_default.py`
- `invokeai/app/services/download/download_default.py`

Studio's existing public route creates a new job from a newly confirmed
exact-file review. The Install Queue row action listed in the
[Model Manager contract](../features/model-manager.md#install-queue)
remains open.

The stock AppImage is the same 147,049,484-byte image as the interruption
run. Its SHA-256 is
`f34da4d3a4e13d1172fff312689a9a91afe71d25166b2ae3ce4361475caec06b`.
The AppImage and its embedded ASAR match their retained proofs. Eleven
current model, startup, renderer and preload sources match the package
authority record. The recorded build base is `e13227f7`. The explicit
build-source pin for `App.vue` matches both the later committed renderer
correction `353fe8f1` and the current source.

## Fixture and assertions

The source store has 30 migrations and one interrupted job with 401
durable downloaded bytes. Its SHA-256 is
`301ebe7a149a247ed77b905c802c415e85800fd30a5d32fc6b3491fcc5e40895`.
The owned copy changes the uncategorized workspace directory to the
new profile's empty workspace. The prepared readback permits only
that change. The original SQLite remains byte-identical.

The test reviews CivitAI tuple `1219546/1594319/1494323` and selects the
secondary file in a version whose primary file has the same digest.
Cancel must preserve the failed job, empty staging and empty catalog.
A fresh confirmed review must create one distinct job, download
334,640,988 bytes and publish the exact SHA-256
`fc7d6b12b37b12759e30b1109068a4bb2a0a84e79ab01262cc5af6b89a783ec6`.
After credential removal and normal close, another cold launch must
show the original failed job, the new completed job and one ready
resource with the same local identifiers and managed bytes.

## Results

Run `20261122-r1` reached the fixture's 100-second deadline during
the full live transfer. The app settled the owned job as canceled
at 258,224,597 bytes and closed normally. The closed SQLite preserved
the original failure and the canceled attempt. Staging and the catalog
were empty. The next run began with a fresh copy of the recovered store
and a 210-second transfer deadline.

Run `20261122-r2` passed in the stock AppImage on an isolated X11
desktop. Cancel preserved all seeded database rows, the original failed
job, and an empty catalog and staging directory. Confirming the next
review completed job `56a38fe3-4bf4-42b0-94bd-5d965846eb88` in 159.497
seconds. The downloaded 334,640,988 bytes matched the exact SHA-256.
The failed job and its artifact stayed unchanged. The catalog gained
one ready VAE. The token was removed before the first normal close.
After cold reopen both jobs remained visible and the same file and
catalog identifiers passed readback without a token.

Both AppImage lifetimes closed normally. Their 368,640-byte SQLite
snapshots matched byte for byte with SHA-256
`f5e4d60f25f559dec408423b6326899c7d12bf655daf9d7cdf433e7feadca22e`.
The original recovered store stayed byte-identical. The native scope
used a 4 GiB memory ceiling and zero swap. The measured peak was
1,238,200,320 bytes with no OOM events.

An independent audit verified the installed file body, the closed SQLite
snapshots and their row-level deltas, the package and embedded ASAR,
source pins, credential removal metadata and both normal exits.

Typecheck, app build and 238 focused model, repository, downloader,
CivitAI, maintenance and shutdown tests passed. This evidence covers
one CivitAI VAE and the explicit Add from CivitAI URL flow. Dedicated
queue Retry, cross-provider and shipping matrix qualification remain open.
