# Stock AppImage recovery of an unsaved accepted Raster

## Source and scope

Base `96a1e327`. The stock AppImage from `4f08d1cd` matches the
present production and packaging sources, 147,139,886 bytes, SHA-256
`555c6a7985ef1cad3b0427d97862aa3db94da3cbf0d4ffdc7a67da5201bfc5d8`.
This exercises the existing
[Project recovery contract](../features/project/document-lifecycle.md#autosave-and-recovery)
with the live NoobAI EPS generation and
[Raster history fixture](./phase-5-packaged-raster-acceptance-history-research.md).
The older built Electron
[Results smoke](../../scripts/smoke-generation-results.mjs)
covered accepted Raster recovery with a staged test result.

InvokeAI was clean at `4875d96531ca6712b288f6e660fcbb34143408c1`.
Under `invokeai/frontend/webv2/src/workbench/`, reviewed
`projects/components/OpenProjectDialog.tsx`, `projects/useProjectActions.ts`,
`projects/durableSyncedPersistence.ts`, `projects/draftStore.ts`,
`projects/indexedDbDraftStore.ts`, `persistenceRuntime.ts` and
`shell/ProjectConflictBanner.tsx`. Invoke stages drafts, checks live
editor lineages and writer ownership, and adopts the newest compatible
draft for the project. Draft deletion verifies its exact generation and
timestamp. Studio uses the existing Project-owned shadow manifest, saved
package identity and dirty asset hashes as its on-disk authority. The
Project Service and autosave coordinator adopt a valid shadow only after
the user's Recover choice and publish the adopted dirty state under a new
revision.

## Observed boundaries

The fixture uses a signed installed engine and the exact borrowed EPS
checkpoint `833294/1022833/928571`. It generates once on CUDA, explicitly
accepts the result, undoes and redoes the layer, and reads the latest
published shadow manifest, document and PNG. The baseline .igs still has
no accepted layer. The positive fault sends `SIGKILL` to the enrolled
Main PID and start identity through the existing Linux pidfd owner. The
fixture waits for physical scope exit before starting recovery.

The next AppImage lifetime opens the Project from Home. Cancel leaves the
saved package, shadow and operational rows intact. Recover reopens the
same Project dirty, with the exact accepted Raster and provenance and an
empty session history; the original portable file is still pending Save.
The normal Save publishes the recovered document. A later clean Open
reads the saved Raster. The completed queue row, receipt, seed cursor and
consumed staging session remain tied to the original generation.

The fault occurs after the dirty shadow is fully published and before
Save. The existing tests cover stale/conflicting and unfinished shadows,
Discard and the acceptance journal failure windows. This checkpoint is
the packaged Recover path at that one boundary.

## Executed evidence

The final exact-source run is
`runs/packaged-installed-engine/20261118/trained-noobai-eps-r4`.
`trained-noobai-eps-r3` passed with the helper before two formatting changes.
That run retains its exact executed helper. R4 repeated all checks and
captured eight exact runner source pins.

After one actual 256×256, three-step CUDA generation, the Add and Redo
shadows held the exact candidate bytes and the accepted record. The
expected-fault receipt ties SIGKILL to one enrolled Main PID/start/cgroup
through pidfd. The AppImage wrapper reported exit code 127; physical
settlement was checked separately. Neither later normal close required
forced cleanup. The peak sampled generation-worker VRAM was 7,320 MiB on
this host.

The physically closed crash checkpoint preserves the unchanged .igs,
SQLite main body and its 193,672-byte WAL and 32,768-byte SHM. After
Cancel the complete logical database, saved file identity and three
shadow member hashes match the pre-decision state. Recover republishes
the exact dirty document and PNG with a fresh revision, leaving the
original saved base untouched. The live browser decodes the same RGBA
and shows the dirty tab. Explicit Save writes that new revision and one
accepted index row, and the third lifetime reads it back clean. The
original completed job, receipt, seed and consumed session are preserved.
The wrapper verifies all 112 original AppData entries after restoration.

The focused selection passed 254 tests with no failures or skips.
Typecheck, app build, changed-file lint, syntax and format checks passed.

The independent read-only audit rebuilt the closed crash database using all
47 valid WAL frames and confirmed that the main body alone lacked the
completed receipt. The audit checked the queue, receipt and seed cursor in
all three snapshots, the accepted index count from 0 to 1 to 1, the saved
containers, PNG byte and pixel identity, and all enrolled process exits.
After the audit released its readers, cleanup removed 13 idle test paths
from the two runs and reclaimed 36,261,888 allocated bytes. Both runs retain
their database snapshots, PNGs, saved packages, source and process proofs.

## Replay

Use `node --import tsx scripts/qualify-packaged-installed-upgrade.mjs
--raster-crash-recovery` with `--family illustrious --profile noobai-eps`,
the retained engine report, exact stock package proof and EPS model input
descriptor, and a fresh `trained-noobai-eps-rN` child of the engine run.
The outer service is bounded to 2 GiB and 600 seconds, with zero swap.
The first owned Main scope uses a 10 GiB bound and the existing
surviving deadline. Recovery and clean reopen use the trained runner's
12 GiB bound. Every lifetime reports physical settlement.
