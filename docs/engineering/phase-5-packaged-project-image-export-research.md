# Stock AppImage Project image export with the installed CPU worker

## Source and scope

Base `02d734b5`. This checks the existing
[Project image export contract](../features/project/generate-mode/image-and-bounding-box.md#export-and-crop-boundary)
through the stock AppImage from `4f08d1cd`, 147,139,886 bytes, SHA-256
`555c6a7985ef1cad3b0427d97862aa3db94da3cbf0d4ffdc7a67da5201bfc5d8`.
The production app, worker and packaging inputs match that build. The
earlier [built Electron check](./phase-4-project-image-export-research.md)
used the development CPU adapter and a controlled native destination reply.
This run uses the installed release worker and the real KDE Save dialog.

The InvokeAI checkout was clean at
`4875d96531ca6712b288f6e660fcbb34143408c1`. Under
`invokeai/frontend/webv2/src/workbench/`, reread
`widgets/canvas/CanvasHeaderActions.tsx`, `widgets/canvas/useCanvasGallerySave.ts`,
`canvas-operations/saveCanvasToGallery.ts`, `canvas-operations/exportCanvasComposite.ts`,
`canvas-engine/engine.ts`, `canvas-engine/exportRasterComposite.ts` and
`canvas-engine/render/rasterComposite.ts`.
Invoke flushes uploads, freezes the document, chooses content bounds or the
primary bbox, reserves and pins the compositing inputs, and checks the
snapshot again after PNG encoding. Its destination is a gallery upload.
Studio's existing adaptation uses a canonical sRGB PNG and create-only native
file publication. This change exercises those owners without changing them.

The installed engine remains at its original canonical path. The existing
qualification wrapper checks the package manifest and installed file pins,
claims the idle fixture, holds its non-runtime entries, and verifies exact
restoration after physical process exit. A live derivatives-only worker
handshake and PNG/WebP self-test precede the AppImage. The native export
also witnesses the installed CPU child and its staged PNG during the
private KDE SaveFile request.

The KDE driver correlates the actual AppImage D-Bus sender, the frontend
portal, the KDE backend, the private KWin socket peers and the matching
request/response. It verifies the PNG filter and suggested filename and
uses the specific dialog's accessibility controls. Native selection is to
an absent owned path. Existing-file, stale-owner and failure controls
continue to use the earlier real-service tests.
[XDG SaveFile](https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.FileChooser.html#org-freedesktop-portal-filechooser-savefile) ·
[KDE SaveFile implementation](https://github.com/KDE/xdg-desktop-portal-kde/blob/v6.6.6/src/filechooser.cpp#L468)

## Fixture and oracle

The source is the exact previously qualified 107,262-byte archive
with SHA-256 `049c61378499e8b1221fcea9a690a8276cc23e399c7730ffa6546688d0715b39`.
Only that regular member was recovered from the verified retained archive.
Visible content has a `2075 × 36` alpha rectangle. The primary bbox is
`64 × 64`; the selected Smart Patch has a different authoring bbox.
The independent Pillow comparator checks every RGBA pixel and the pinned
sRGB ICC against literal source geometry and active Smart contribution.
The oracle uses Pillow's public identity transform to account for
premultiplied-alpha rounding. It imports no Studio composition code.

## Executed evidence

The passing run is `runs/packaged-installed-engine/20261118/project-export-r2`.
Two stock AppImage lifetimes closed normally. The four SaveFile responses
were one Cancel and three selections with exact PNG destinations. During each
request the fixture identified the unique installed CPU child by PID, parent,
start time, interpreter, cgroup and empty CUDA visibility. The staged PNG was
already present before selection. After the dialog, the worker exited and its
stage disappeared. Cancel left the export directory empty. Each saved file
matched its staged bytes.

The visible-content PNG has a `2075 × 36` rectangle. The bbox PNG has a
`64 × 64` rectangle and agrees pixel-for-pixel with the primary bbox oracle
while the selected Smart Patch uses `256 × 128`. Reopening and exporting the
visible content gives the identical PNG. Both retained .igs snapshots match
the original package. The live snapshot checks preserve undo/redo, accepted
provenance and the Project and generation tables throughout each lifetime.
The wrapper restored all 112 original non-runtime entries and verified
the 77 engine file pins, including the pointer and interpreter.

R1 reached Cancel and the next real save dialog, then its selector expected
the open dialog's accessible combo label. The Save dialog actually used
the suggested filename as its accessible combo name, alongside the visible
Name label. The recorded AT-SPI tree identifies both controls. That owned
dialog was canceled after the normal-close deadline. The process then
exited with code 0 and no signal, physical exit was confirmed, and
restoration passed. The final driver verifies both the label and the
suggested name.
If an observer fails with a verified SaveFile request still open, the driver
attempts to cancel that exact request before propagating the failure.

The adjacent KDE OpenFile Copy regression passed on the final driver at
`runs/packaged-noobai-chooser/20261121-r18`, with four chooser responses and
two normal physical exits. The focused Node and Python selections passed
195 and 69 tests respectively, with no failures or skips. Typecheck, app
build and scoped format, lint and syntax checks passed.

The independent audit reread all four portal traces, decoded every published
RGBA pixel and the ICC, checked the closed SQLite copies and rehashed the
restored original AppData. Live worker and staged-file ownership come from
the pinned runner observations. The audit checked the physical exits from
their recorded identities. Cleanup removed 25 idle profile and scratch
paths and released 40,480,768 allocated bytes. The recovered source,
published PNGs, retained .igs and SQLite snapshots, and exit receipts remain.

## Replay

Run the existing `scripts/fixtures/packaged-project-chooser-wayland.py`
launcher with a short owned `TMPDIR`. Its command is
`node --import tsx scripts/qualify-packaged-installed-upgrade.mjs --project-export`
with the retained `--engine-report`, exact stock `--package-proof` and a
fresh `--artifacts` child `project-export-rN` inside the engine run.
The bounded user service uses 4 GiB, zero swap and a 220-second ceiling.
The wrapper holds its restore claim if physical exit or byte continuity
is uncertain. The original non-runtime entries stay in their holding
directory while test state occupies the claimed path.

## Existing PNG selected through the KDE overwrite prompt

The follow-up built the stock AppImage with the current production inputs.
Its SHA-256 is
`2e038fbf206b55bcee32d8051e224634e6d9ade30e60d16d4415ec1ab39bfed6`.
The package verifier checked all 42 compiled members. Its build tree
included the committed Anima test fixture changes, with the exact
production-input diff and binary hash retained in the package proof.
An initial wrapper invocation refused the proof file's group-writable
mode before acquiring the runtime lease. The new invocation used the
same proof bytes with mode `0600`.

InvokeAI revision `4875d96531ca6712b288f6e660fcbb34143408c1` still routes
`workbench/canvas-operations/saveCanvasToGallery.ts` via
`exportCanvasComposite.ts` and uploads the composite. The local
destination in this Studio test goes through KDE and the existing
create-only Main publication owner.

The first AppImage lifetime created a 64×64 primary BBox PNG. A real
Export As request staged a different 2075×36 PNG. The private driver
selected the BBox file and confirmed the overwrite prompt belonging to
the verified KDE backend. The portal returned success with that exact
URI. Studio displayed the instruction to choose a different name.
The existing file kept its bytes, inode, mode and modification and
change times. The staged image and temporary publication file cleared.
The neighboring export, live Project state, saved Projects and closed
SQLite checks passed across two normal closes.

Run `project-export-r3` uses the retained installed CPU worker. The
wrapper restored all 112 original AppData entries with exact identity
and bytes. The zero-swap scope ran for 30.351 seconds and reported a
2.6 GiB peak under its 4 GiB limit. All 29 focused tests passed with zero
failures or skips. The AppImage build, scoped ESLint, formatting and
syntax checks passed.

The independent audit verified five SaveFile traces, three published
PNGs, three exact `.igs` copies, four SQLite bodies and all 112 restored
AppData entries. All 18 enrolled AppImage process identities and five
export workers had exited. Cleanup of the build and private profiles
released 572,149,760 allocated bytes and rechecked 68 retained files.
