# Installed CPU preview across sequential AppImage builds

The [runtime management contract](../specs/07-python-runtime-management.md)
keeps the app-owned runtime separate from the AppImage. This check opens the
same owned AppData on successive stock builds, with the production runtime
resolver and Project Save in each build. It extends the earlier
[historical migration check](./phase-5-packaged-installed-historical-upgrade-research.md),
which reopened the same AppImage twice.

## Source and test boundary

The clean InvokeAI donor was `4875d96531ca6712b288f6e660fcbb34143408c1`.
`invokeai/app/api_app.py::lifespan` calls
`api/dependencies.py::ApiDependencies.initialize`, which resolves the existing
data root and initializes its database before app services.
`services/config/config_default.py::root_path` anchors that root once.
`services/gallery_maintenance/gallery_maintenance_default.py` checks the
original image identity around `services/image_files/image_files_disk.py::generate_thumbnail_if_missing`.
`docs/src/content/docs/start-here/upgrading.mdx` documents the existing-root
and isolated-root upgrade choices. The qualification runner exercises
Studio's existing installed-slot and CPU preview adaptation.

The earlier AppImage was built from `3c1d42ec` and the successor from
`353fe8f1`. Both identify as `0.1.0-dev.1`. They have distinct Main and
renderer content, with the same Python worker sources. The predecessor
comes from the signed installed-engine report. The successor is bound to
the committed production inputs, package identity and independent ASAR
readback from the [keyboard checkpoint](./phase-5-packaged-home-recovery-keyboard-research.md).
Both applications start directly in the private test session.

The runner holds an exclusive qualification claim on the idle retained slot
and moves its ordinary non-runtime files aside by same-filesystem rename.
It keeps the exact installed runtime, signed pointer and inference resources
at their original locations. It creates a copy of the earlier 48×32 Raster
package in the isolated workspace. Each build reports the same slot ready,
opens the Project, edits the prompt and Save publishes a new revision.
The predecessor closes normally before the successor starts. The successor
opens the predecessor's saved revision before making its own edit.

Main Save asks the actual installed derivatives worker for a fresh preview.
When the worker or its output is unavailable, `ProjectSession.saveOnce`
writes placeholder files. Each successful Save here reports `rendered` and
preserves exact decoded pixels, ICC and all three image bodies across the
Raster, merged preview and WebP thumbnail. For each Save the independent
Pillow oracle checks all 4,608 plane pixels and exact ZIP membership.

## Executed checks

Both native runs passed. R1 exercised the two actual builds and exact slot.
The final R2 also checked the successor's changed-source hashes, the pinned
independent ASAR report and the committed production inputs. A control with a
changed `App.vue` source hash and internally matching proof receipt failed at
the source verification before claiming or moving the installed AppData.
Fresh `app:build` matched all 42 compiled files attested for the successor.
The focused runtime, worker, Project, Linux package and resource-limit
selection passed 259 tests with zero failures or skips.

Both R2 AppImages exited normally in the private X11 session at zero swap.
The observed service peak was 1,962,491,904 bytes within its 4 GiB bound.
The 25-table logical SQLite comparison preserves every non-Project-index
table. The sole Project row points to the new saved revision. The runner
restored the original 112 AppData entries and rechecked 77 pinned engine
inputs including the resolved interpreter, worker bodies, pointer and
installation provenance. Neither AppImage changed bytes.

Independent R1 and R2 audits rechecked the saved packages, both closed
SQLite stores, the restored AppData and physical process exit. The R1
audit also read both embedded ASARs directly and confirmed distinct Main
bodies. After both audits released their readers, cleanup removed 13
temporary paths and reclaimed 25,890,816 allocated bytes. The saved `.igs`,
closed SQLite files, source pins and receipts stay in the two run directories.

This check covers direct startup and CPU Save on a shared app-owned slot.
Signed update and relaunch, actual CUDA inference after an app upgrade and
the supported host matrix remain open.

## Replay

Under the existing private X11 launcher, run
`node --import tsx scripts/qualify-packaged-installed-upgrade.mjs --runtime-continuity`
with `--engine-report` pointing to the retained `installed-engine.json`,
`--package-proof` to the successor's retained `package-proof.json` and
`--artifacts` to a fresh `runtime-continuity-rN` child of the engine run.
The successor proof uses the sibling `commit-proof.json` and
`independent-audit.json`. The launcher uses a short owned temporary
directory, a 4 GiB user service, zero swap and a 240-second outer deadline.
