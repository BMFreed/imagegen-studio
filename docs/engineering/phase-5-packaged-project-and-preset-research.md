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

## Trash keyboard focus on KDE Wayland

The packaged Trash persistence case previously drove the destructive dialog
with the pointer. The follow-up used trusted KWin keyboard events in the
production renderer resized to 900×620. The named dialog opened on Cancel,
kept Tab and Shift+Tab within its two buttons, and returned to the same Delete
button after Escape and Cancel. Both dismissals left the exact `.igs`, its
inode and its SQLite Trash entry in place. Restore and permanent deletion
initially left the document body focused when the row disappeared.

The renderer captures focus ownership before a Trash action and waits for
successful Restore or completed deletion and the resulting list update. If the
same Trash view remains active, the target row has left and focus is on the
document body, the existing Naive input receives focus. Another control with
focus, a pending operation or a closed view suppresses this handoff.
[Action owner](../../src/renderer/App.vue), [Home search](../../src/renderer/components/HomeView.vue).

The UI reference check used the clean InvokeAI revision
`4875d96531ca6712b288f6e660fcbb34143408c1`. The inspected files under
`invokeai/frontend/webv2/src/features/gallery/ui/` were `GalleryImageGrid.tsx`,
`GalleryProgressSection.tsx` and `GalleryGridFocus.browser.test.tsx`. InvokeAI
keeps focus inside the Gallery when its focused item disappears. Studio uses
the Trash search as its stable target and keeps project selection empty.

The same keyboard fixture reached the post-removal assertion on the original
AppImage from `efcf0b36`. It reported `BODY` after both successful actions,
after the modal, file, persistence and process-exit checks had passed. The
rebuilt AppImage passed the same assertion with visible focus in Search
projects. Confirmed deletion retired the target, and the neighbor and its
sentinel file survived a cold reopen. Each run closed three AppImage lifetimes
normally and confirmed 30 enrolled process exits. Typecheck, focused lint,
61 focused tests and AppImage packaging passed. The native evidence covers
this desktop, viewport and Trash list view.

Independent readback rehashed both AppImages and the six matching fixture
pins. The closed SQLite snapshots show the same Trash key retired after
reopen. Both after-Trash `.igs` hashes match the pinned source, and the final
neighbor matches its recorded hash.

The original AppImage SHA-256 was
`a3c133847c78ce61972f59dbae71f129e12467006b78e3e6c07f858eb349953a`.
The rebuilt SHA-256 was
`51893a62d27b75f8a1af232f098b79d98cfdb6de8e90e2c5e4951738de2e4f99`.
The semantic RED and final PASS retain traces, screenshots, package manifests,
closed snapshots and exit receipts under `runs/packaged-project-trash/20261123-r2`
and `runs/packaged-project-trash/20261123-r3` in the local artifact root.
The AppImage builds, private profiles and scratch were removed after physical
exit and dependency checks, reclaiming 1,087,827,968 allocated bytes.

## Enter on Home project cards

The Home card used to consume Enter even when the action could neither open nor
switch to the project. In the packed KDE Wayland baseline at 900×620, the grid
and list cards in Trash kept visible focus but stayed unselected and left the
Inspector empty. The same keyboard path opened the restored available project
in the current tab.

Home now consumes Enter only when its existing open eligibility check succeeds.
In other states the Naive button uses native activation, which selects the card
for inspection through the same handler as Space. The Vue prototype shares its
open eligibility between both card layouts, the Inspector and the open request.
It preserves the existing decisions for Trash, project health and current
workspace availability. Recovery still uses the existing decision dialog.
[Production Home](../../src/renderer/components/HomeView.vue),
[prototype eligibility](../prototype-app/src/prototypes/home/home.utils.ts).

The AppImage fixture found both cards unselected on the original build and
both selected with the correction. The final native trace
records trusted Enter, visible focus, selected state and the visible Inspector
in Grid and List, with Home still active in each observation. The ready-project
control replaced Home with the expected tab and preserved the project revision
and accepted Raster provenance. Restore, Escape and Cancel, intentional deletion
and cold reopen ran in the same fixture. The native coverage uses the private KWin
session and owned copies of the existing Project fixtures.

Independent readback matched both AppImage hashes and all six common fixture
pins. Each run recorded 70 trusted key events, three normal AppImage closes
and 30 confirmed process exits. The SQLite snapshots and closed `.igs` files
preserved the neighbor and reflected the selected target's retirement.

The focused prototype cases used the same test bytes on the original and updated
prototype. The original failed for both layouts across a missing file in an
unavailable workspace, corrupt and unsupported projects, and a trashed project.
The cases also exercise Recovery and distinguish Space selection from an
available project's Enter open.

All 365 prototype tests passed. The final helper formatting moved its private
function and wrapped a signature. The two focused tests passed again on those
exact bytes. Typecheck, scoped lint and AppImage packaging passed.

The original AppImage SHA-256 was
`1761f76a8a0a2cae262046b4ed402a898a33480c0781044e8b879790b0782654`.
The final AppImage SHA-256 was
`01f3e206eeac0b74542bb4881c12e9bdda3aee675b98819d0f42617cf8796dd7`.
The evidence directories under the local artifact root are
`runs/packaged-project-trash/20261123-r4` and
`runs/packaged-project-trash/20261123-r5`.
Guarded cleanup removed both packages, private profiles, browser scratch and
redundant temporary output. It reclaimed 1,108,357,120 allocated bytes.

## Keyboard focus after Move to Trash

On `cdeb6f10`, the active Project actions button disappeared after a
confirmed Move to Trash. In Chromium at 900×620, Escape returned to that
button and kept the card. Confirming the move removed the card and left
Search projects unfocused. The stock AppImage reproduced this with actual
KDE keyboard input through the dropdown and confirmation. After the shorter
list rendered, focus was on `BODY` with no visible indicator.

In InvokeAI `64ff2c600f04d220e470fdaeec570bd402af42a7`,
`invokeai/frontend/webv2/src/features/gallery/ui/GalleryImageGrid.tsx` passes a
focus resolver to `useGalleryGridHotkeys.ts`. The delete command uses the
original opener while it remains connected and otherwise resolves a Gallery
target. `GalleryGridFocus.browser.test.tsx` covers keeping focus on a stable
surface during item changes and preserving focus already held elsewhere.
Studio uses its existing Home search input as the fallback in the same view.

The renderer removes the row after Main confirms the move. It focuses the
search after Naive finishes closing the confirmation, provided the Project
is absent, the same Home workspace remains active and the body has focus.
The normal list and counts refresh still runs. The shared Trash confirmation
now exposes `aria-modal` for both actions. The patch affects renderer
presentation. [Renderer owner](../../src/renderer/App.vue) ·
[Confirmation](../../src/renderer/components/ProjectTrashModal.vue)

The repaired AppImage showed visible focus on Search projects after trusted
keyboard confirmation. Both package runs used the same retained `.igs` input,
KDE Wayland at 900×620, software rendering, 120% CPU, 4 GiB and zero swap.
They exercised Restore and later permanent deletion, preserved the unrelated
Project and text file, and closed three AppImage lifetimes each. The old
build reached the focus assertion after those closes. The Chromium
check mounts the production renderer with controlled IPC and independently
covers Escape, the modal attribute, and the search focus in a scoped workspace.

Independent readback matched both AppImages and their embedded application
and SQLite addon bytes, 103 trusted key events per run and 27 exited process
identities per run. It checked the preserved target and accepted Raster in
the first closed SQLite and `.igs` pair, and the retired target key and
preserved neighbor in the final pair.

The old and repaired package SHA-256 digests are
`be00e6c9ed10cbbd14f6f2d5d361c8c2fe63ad7bea6b355683cc7cd89ac9151f` and
`69426ae2c7633262a078ec15a7f1f936aa954c545cfcbc3cbb29f01e337db5e4`.
Native evidence is under `runs/packaged-project-trash/20261126-r1` and
`runs/packaged-project-trash/20261126-r2`. The 30 Home browser checks,
149 focused Main checks, typecheck, scoped lint and AppImage packaging passed.
This qualifies the local keyboard path in the sampled desktop and viewport.
Cleanup removed both package builds, private profiles and short scratch
directories, reclaiming 1,087,557,632 allocated bytes. Both audit receipts,
keyboard traces, screenshots and closed data snapshots remain.
