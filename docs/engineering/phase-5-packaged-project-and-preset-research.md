# Stock AppImage Project Trash and accepted-result presets

## Scope and sources

These scenarios use the stock AppImage from `4f08d1cd`, 147,139,886 bytes,
SHA-256 `555c6a7985ef1cad3b0427d97862aa3db94da3cbf0d4ffdc7a67da5201bfc5d8`.
Production app, worker and packaging sources match that revision. Each case uses
a fresh AppData under the artifact root and a private authenticated Xvfb and
D-Bus session. Both launch from an empty working directory through the existing
fused-AppImage runner. The profiles have an empty resource catalog and no
installed runtime. The inputs come from previous accepted NoobAI runs.

The fresh InvokeAI checkout was clean at
`4875d96531ca6712b288f6e660fcbb34143408c1`. For Trash, the existing adaptation
uses reversible metadata filtering from
`invokeai/app/api/routers/boards.py`,
`services/boards/boards_default.py`,
`services/board_records/board_records_default.py` and
`services/shared/database/queries/boards.py`. The positive delete commit and
retained file-purge intent come from `api/routers/images.py::delete_image`,
`services/images/images_default.py::delete` and
`services/image_files/image_files_disk.py::begin_delete/commit_delete` under
`invokeai/app/`. Invoke's separate Project delete goes through the server
project and board records. Studio's guarded desktop source-file authority is
described in the [Trash checkpoint](./phase-4-project-trash-research.md).

For accepted settings, the InvokeAI files
`invokeai/frontend/webv2/src/workbench/image-actions/{useImageActions,executeImageRecall,imageRecall}.ts`
show the caller's captured owner, source metadata lookup and projection of
recorded settings. `invokeai/app/api/routers/style_presets.py` and
`invokeai/app/services/style_preset_records/style_preset_records_default.py`
provide explicit creation and readback for Invoke's prompt-oriented presets.
Studio's [portable preset contract](../features/presets.md)
uses that source separation for an independently saved preset. Compare remains
read-only, and the separately opened preset editor requires explicit Create.
The earlier [Raster preset checkpoint](./phase-3-result-preset-research.md)
covered those owners through built Electron. These fixtures exercise the current
package and its real Main, preload, SQLite and local Project files.

## Home Trash

Home offered Switch to Project for the open V-prediction Project and Main
refused the Trash request. After close, Trash kept the original path, inode
and bytes. The first restart retained the same Trash ID, excluded the Project
from the active list and kept the accepted Raster index. Restore cleared the
lifecycle record and reopened the same local key, revision and NoobAI Raster.

Moving the Project to Trash again allocated a new ID. Main refused the old
ID and the unconfirmed request. Cancel in the actual confirmation dialog kept
the current Trash item. Confirm removed only the owned target, retired its
local key and removed its accepted index. The second restart had no target
or pending Trash item. An unrelated Project created through the same Home UI
and a neighboring text file kept their original bytes. The protected original
NoobAI package also kept its exact hash.

The passing trace is `runs/packaged-project-trash/20261121-r4` with three
normal physical exits. R1–R3 stopped at Home navigation after creating the
neighbor. Opening a Project in the current tab replaces Home. With the last
Project closed, the empty document screen and the app header both offer
Open Home. The final fixture addresses the header control explicitly.
No Trash action completed in those attempts.

## Compare and Save Preset from Result

The accepted 256×256 EPS Raster comes from the [packaged CUDA Retry
run](./phase-5-packaged-noobai-components-research.md#packaged-frozen-retry-with-all-three-components).
Its accepted image SHA-256 is
`16309e1db9c186d7193c45d65a404f6e49b64e678f2e6fa96432a61da610f267`.
Compare showed the accepted seed 0 against current 23, the two respective
prompt pairs, the frozen NoobAI noise profile and all four exact resource
references with missing-resource diagnostics. Current mode remained unavailable
with no worker to compose the Canvas.

The result action opened a detached draft. Editing and canceling it left the
preset table empty. Explicit Create from a fresh draft saved one portable
TXT preset with the recorded prompt pair, 256×256 size, sampling, exact
checkpoint, VAE, negative embedding and signed LoRA weight. The decoded
payload has no seed, batch, layer, execution or regional fields. The preset
reopened from Home's Manager after restart, and the exact Compare reopened
from its Project. The two closed SQLite snapshots matched the verified
preset row, and the .igs bytes, local revision, accepted image and history
stayed unchanged.

The passing trace is `runs/packaged-noobai-result-preset/20261121-r1` with
two normal physical exits. These actions exercise stored CUDA output. Generate,
Add and Add's Undo/Redo require a live unaccepted result and are separate
acceptance cases.

## Checks

The adjacent GTK Copy regression also passed on the final runner at
`runs/packaged-noobai-chooser/20261121-r16`, with two normal physical exits.
The focused Project, Trash, presets and process ownership selection passed 289
tests with zero failures or skips. Typecheck, app build, scoped lint and format
checks passed. Independent audits of Trash and the result preset rehashed the
AppImage and runner sources and checked the retained Project ZIPs, SQLite bodies
and process exits. Intermediate UI actions and the empty table immediately
after Cancel are evidenced by the live assertions.

Cleanup removed 32 disposable profile and scratch paths after the audits and
process-exit checks, releasing 55,853,056 allocated bytes. Closed snapshots and
process records remain with both audits. The local lifecycle ledgers retain
the protected stock AppImage, accepted source projects and Xvfb package links.

## Replay

Use `scripts/fixtures/packaged-project-chooser-x11.py --xvfb <owned-Xvfb> -- node scripts/smoke-linux-package.mjs`
from the checkout. Set `IMAGEGEN_LINUX_PACKAGE_OFFLINE_PROJECT` to `trash` or
`result-preset` and supply the exact stock image through
`IMAGEGEN_LINUX_PACKAGE_APPIMAGE`. Set `IMAGEGEN_LINUX_PACKAGE_ARTIFACTS` to a
fresh `runs/packaged-project-trash/<date>-rN/trash` or
`runs/packaged-noobai-result-preset/<date>-rN/result-preset` path, respectively,
under the artifact root. Use a short owned `TMPDIR`, a 4 GiB user scope with
zero swap and a 150-second outer deadline for each case.
