# Stock AppImage Raster acceptance, Undo and Redo

## Source and scope

Base `b63277d5`. This joins the existing
[packaged trained generation](./phase-5-packaged-trained-generation-research.md),
[Raster acceptance](./phase-2b-raster-acceptance-research.md) and
[Project Undo/Redo contract](../features/project/undo-redo.md).
The production sources, worker and packaging inputs match the stock
AppImage from `4f08d1cd`, 147,139,886 bytes, SHA-256
`555c6a7985ef1cad3b0427d97862aa3db94da3cbf0d4ffdc7a67da5201bfc5d8`.

InvokeAI was clean at `4875d96531ca6712b288f6e660fcbb34143408c1`.
Under `invokeai/frontend/webv2/src/workbench/`, reread
`widgets/canvas/CanvasWidgetView.tsx`, `widgets/canvas/stagedAcceptance.ts`,
`canvas-engine/controllers/stagedResultController.ts` and
`canvasProjectMutations.ts`. Accept uses the verified candidate and
publishes one layer mutation and one history entry with its own asset
references. The stored undo/redo steps remove and reinsert that same layer.
The corresponding command and replay owners are
`widgets/canvas/canvasHotkeyCommands.ts`, `canvas-engine/engine.ts`,
`canvas-engine/controllers/historyController.ts` and
`canvas-engine/history/history.ts`. Staging is committed separately from
document history.

The qualification exercises Studio's existing renderer and IPC consumers,
Main's verified candidate acceptance and the same Project history and
shadow owners. Add writes the recovery snapshot before consuming staging.
Undo removes the accepted layer from the canvas and the accepted-results list.
Redo restores the exact layer, PNG and immutable provenance under a fresh
document revision. The saved accepted-result index is derived from the
portable .igs during Save. Queue/receipt/seed ownership and the consumed
staging session stay outside the history operation.

## Fixture and replay

Each case uses one public 256×256, seed 0, three-step ordinary TXT request.
Checkpoint choices are EPS `833294/1022833/928571` and Cyberfalafel V 1.2
`1147756/2679856/2566634`. The existing prepared project makes an independent
draft edit after capture so exact frozen provenance and the live draft
have distinct witnesses. The AppImage uses the live installed CUDA worker.
The wrapper reuses the exact local model file, engine and package pins and
restores the held test AppData after physical process exit.

## Executed evidence

Under `runs/packaged-installed-engine/20261118`, EPS passed as
`trained-noobai-eps-r2` and V-prediction passed as `trained-noobai-v-r3`.
The EPS case used the model default and the V case used the explicit prediction
override. Each admitted and completed one CUDA generation with the installed
worker. The two results differ. Within each case the exact candidate PNG,
accepted shadow asset, redone shadow asset and saved layer PNG match.

The Project history toolbar performed Undo and Redo. Undo removed the layer
and showed an empty Accepted results list. Redo restored the same layer ID,
browser-decoded RGBA and complete frozen generation configuration. Each
transition used a distinct document revision. Three retained shadow manifests
and document snapshots record the Add, Undo and Redo states. The live reads
verified the exact asset hash on the Add and Redo shadows and no asset on the
Undo shadow. The completed job, receipt, seed cursor and staging tombstone
were equal throughout the history actions, whose verified candidate list
stayed empty. The current draft edit was preserved.

The saved .igs retained its bytes and inode until the explicit Save. Save
published the Redo revision and its accepted index row. Restart reopened
that exact package and provenance with empty Undo and Redo stacks and one
original completed job. Both runs had two normal physical AppImage exits.
The wrapper restored 112 original AppData entries per run and reverified
the engine, stock package and borrowed model inputs. The sampled active
generation worker peak was 7,434 MiB VRAM in both runs on this host. Both
scopes had zero swap and no OOM kill.

The initial `trained-noobai-eps-history-r1` attempt stopped in the model
preparer's directory-name guard before AppImage launch. Its original AppData
restoration passed. The successful attempts reuse the existing directory
naming contract and opt into history through the verified fixture descriptor.

The focused history, acceptance, storage and process ownership selection
passed 218 tests with no failures or skips. Typecheck, app build, scoped lint,
format and syntax checks passed.

The independent audit decoded both cohorts' six Project archives, six
manifest/document pairs and six SQLite bodies. It reproduced the
pre-Save operational digest from the closed SQLite table rows, verified
the PNGs and frozen provenance, checked the CUDA samples against job process
identities and rehashed all 77 installed engine pins. It also rebuilt the
112-entry original AppData inventory against both pre-run snapshots.
The model content hashes come from the actual runner's before/after checks.
The audit independently checked the model file identities.

Cleanup removed 14 idle profiles and scratch paths after the audits and
physical exits, releasing 36,380,672 allocated bytes. The three .igs
snapshots per profile, PNGs, SQLite, shadows, process receipts and audit
remain available for review.

## Replay

Run `node --import tsx scripts/qualify-packaged-installed-upgrade.mjs --raster-history`
with `--family illustrious`, one of `--profile noobai-eps` or `--profile noobai-v`,
the retained exact engine report, package proof and model input descriptor,
and a fresh `trained-<profile>-rN` child of the engine run.
The existing controller bounds the outer service to 2 GiB and 600 seconds,
with a separate owned app scope bounded to 12 GiB. Both scopes have zero swap.
