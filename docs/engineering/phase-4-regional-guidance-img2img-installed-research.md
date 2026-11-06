# Installed opaque Regional Guidance UI

Base: `ae2325a16a057aa0e76287a4680df8de8ea62526`. This checkpoint connects the
already qualified public opaque image backend to the existing renderer and
verifies its explicit acceptance/save lifecycle. It does not add an image
encoder, diffusion loop, queue operation, provenance schema or `.igs` format.

## Current sources and observed gap

Clean local InvokeAI `a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd` is inspected
directly. `invokeai/frontend/webv2/src/features/generation/core/canvas/compileCanvasGraph.ts`
validates composited input and strength, grafts image-to-latents, then adds
regional conditioning through `addRegionalGuidance.ts`. The current
`workbench/widgets/canvas/CanvasWidgetView.tsx` delegates explicit acceptance to
`stagedAcceptance.ts`; `session_queue_default.py::retry_items_by_id` reuses the
saved root graph with new execution state. Studio retains its existing native
image owner, frozen queue inputs and explicit Add/Save owners.

Confirmed source gap: `ProjectView.vue` still refuses every enabled-region
target whose mode is not `txt2img`, with the obsolete empty-Canvas message.
The shared advisory also lacks actual-mode and image-capability inputs. Merely
removing the old refusal would expose TXT-only sampler/VAE/rescale combinations
that Main correctly rejects. Existing Denoising Strength authoring and frozen
IMG Retry capability checks already exist.

The bounded correction gives the advisory actual target mode and the separate
`illustrious-regional-img2img-v1` capability. Opaque IMG requires Illustrious
epsilon, Euler/Normal, Embedded/manual FP16 VAE, zero CFG Rescale and an explicit
finite strength in 0..1. Partial alpha remains refused. TXT, disabled regions and
Smart Patch preserve their previous behavior. Main remains authoritative for
the actual composited snapshot and peer/resource checks.

Strength zero is the existing Studio VAE-roundtrip contract. Current Invoke
Canvas UI separately requires strength greater than zero; this checkpoint
preserves Studio's already qualified boundary and introduces no new endpoint
semantics or implicit default.

## Finite acceptance

First challenge the new renderer regression against the original implementation,
then run the same assertions against the correction. Mounted real ProjectView
tests with controlled target/runtime collaborators are distinct from an
installed Electron/native qualification. Cover missing/false image capability,
unset/invalid strength, partial alpha, unsupported image sampler/VAE/rescale and
unchanged TXT neighbors. No test may infer actual opaque pixels from a UI flag.

The installed profile reuses `qualify-installed-regional-generation.mjs` and the
one canonical compatible runtime/catalog, official Illustrious v0.1 epsilon
checkpoint and current worker companion. It uses a real imported opaque Raster,
translated 512x512 bbox, Euler/Normal 30, CFG 5, rescale 0, Embedded FP16 and explicit
strength 0.5, with two fixed enabled regions and no TI/LoRA/reference/dynamics.
These are test selections, not product defaults or a capacity claim.

The planned native path is healthy control, UI Cancel after real bounded
numerical progress, saved source/text/strength edits, and explicit frozen Retry.
The Retry must retain the original source/recipe/seed/strength and reproduce the
control RGB. Actual truncated progress follows the selected image schedule,
not the 30 requested text steps. No completed receipt is retried.

Results remain temporary until explicit Add. Preserve the original source
Raster, then verify layer counts 1→2→1→2 through Add/Undo/Redo, the same accepted
ID after Redo, ordinary IMG mode/strength provenance and the absence of Regional
operational data. Explicit Save, independent ZIP/member/PNG checks and genuine
reopen must preserve pixels, source, authored edits and accepted provenance.
Navigation and mutating actions enter through normal UI; IPC/SQL observers call
original owners unchanged and supply independent association evidence.

Run serially with bounded launcher and native scopes, aggregate host ceiling
12 GiB, zero swap and 600-second unit deadline. Reuse dependencies and model bytes;
do not provision another runtime or alter a production default. Retain original
screenshots, original wires, failures and successful controls before confirmed
idle scratch disposal. Artifact-relative run:
`runs/regional-guidance-public-img2img-installed/20261106-ui-cycle`.

## Evidence status

ROOT executes 100 Main/shared/Retry/storage neighbor cases and the full 188-case
prototype/browser suite with zero failures/skips in the accepted runs. The six
focused mounted renderer cases are included in 188, not added again. Full
TypeScript/Vue typecheck, scoped ESLint/Prettier and production build pass; the
existing bundle-size warning remains. Mounted UI collaborators are controlled;
these lower tests do not establish native inference or persistence by themselves.

The new opaque renderer selector fails on baseline production source with the
original disabled Generate control, then passes on the correction. A separate
real Electron baseline imports/normalizes opaque input, observes the actual
specific capability and target mode, then confirms the same old UI refusal.
No Generate IPC or regional numerical wire occurs. Original build hashes and
screenshots are retained; this is an excluded old-build diagnostic.

One isolated advisory mutation bypasses the specific image-capability refusal.
Six selected executions give five GREEN/one semantic RED: the IMG oracle fails,
the TXT/omitted-mode control stays GREEN, and exact restoration returns both
GREEN. All 1508 mutable-source files restore exactly; live production source is
unchanged. This is an advisory mutation, not a new native pixel-causality test.

Source review is CLEAN for production admission; it finds one inherited stale
embedding diagnostic expectation. Execution also exposes an ambiguous Retry
locator matching both row and details. ROOT corrects the expected current message
and scopes the locator to its actual row without changing behavior or removing
assertions. An initial anchored browser filter selects no tests and is excluded.

The first new-build installed attempt completes a healthy control and the main
request, but misses Cancel: GPU-backed screenshot capture finishes after the
short 16-step native run completes. Real 5/16 and 6/16 observations, both completed
receipts, PNGs and diagnostics remain retained. It is not a completed Cancel/Retry
qualification. Its close exceeds the harness 10-second deadline; a verified owned
SIGKILL fallback confirms physical exit, without claiming healthy shutdown.
ROOT moves only IMG screenshot capture before the two genuine step observations
so the click follows them immediately; historical TXT/fault order and all native
computation remain unchanged. The repeat uses fresh Projects and the same
settings, source and bounds; no completed receipt is retried.

The second attempt reaches genuine Cancel, frozen Retry with exact control RGB
and original Add, then exposes the signed-URL oracle error. The third exposes
ROOT's extra required Raster `kind`; `ProjectRasterLayerView` explicitly makes
it optional. Both unsaved accepted results remain in durable autosave; they are
not discarded or silently recovered. ROOT corrects the test against the API:
canonical optional Raster spelling, exact stable URL owner/layer/asset identity,
every other property and exact source PNG bytes. Seven counterfactual checks and
three actual captured-DTO/provenance checks pass. The fixture's copied model
label is aligned with the already consumed real catalog label; exact model IDs,
SHA, source, prompts, seed and sampling do not change.

An open independent control with an unaccepted candidate requires an ordinary
close decision. Source follow-up identifies that confirmation path; the earlier
forced close is not relabelled as a runtime hang. The final run retains and
checks the control, then uses normal Close Project → Discard Candidates and Close
on that own tab. Prior unsaved Add shadows are additionally pinned under the
actual `autosave` root throughout the new run.

## Installed R4 result

ROOT completes 16 installed checks in 353.406 seconds (353.989-second bounded unit):
three original regional requests, two completed receipts/PNGs and one canceled
attempt. `nativeAccounting.completedReceiptCount=1` is the main Project only;
the second receipt belongs to the independent healthy control. The 28 worker
spawns also include Ready/image-normalizer probes; they are not 28 generation
requests. The accepted profile uses the unchanged actual RuntimeManager and
installed workers, without a substituted runtime-availability collaborator.

Both healthy requests emit exactly 1..16 selected-step progress at requested 30 /
strength 0.5. Cancel clears the existing counter before child exit and no late
owner repaints it. Saved edits change source opacity 1→0.75, global/regional
texts, strength 0.8, steps 2, seed 124 and enabled regions. Original frozen Retry
still consumes opaque source / strength 0.5 /30 /123 and yields exactly the
control RGB. Source and recipe identity come from the actual Main capture and
original wire, not a Python-side reconstruction.

Results → explicit Add → Undo/Redo → Save → independent ZIP read → genuine reopen
preserve source Raster, edited draft and masks. Layer counts are1→2→1→2; Redo
retains the accepted layer ID. Source asset bytes and the accepted 175,392-byte
RGB PNG remain exact. Portable provenance is ordinary `illustrious-img2img`
with applied strength 0.5 and original settings; authored current strength 0.8
and disabled regions survive. Regional operational fields remain excluded.

ROOT opens the original baseline, preview and saved/reopened screenshots at
1440×900 with `ui-audit`. The Generate refusal is visibly removed, preview/Add
and the saved document are real renderer states. This is local functional/visual
inspection, not image-quality acceptance or a whole-interface design audit.

The final app closes normally with exit 0, confirmed child/owned-scope exit and
no fallback signal. Earlier durable rows and package/candidate/input/autosave file bytes are
preserved. Project-index scan timestamps and the receipt sequence advance
normally; the whole SQL database is not byte-identical. Model inode/stat/full
SHA, installed 52 Python modules/65 files, configuration, qualification companion
and source/bundle pins remain unchanged. The R4
source-only review is CLEAN; it does not independently rerun ROOT numerics.
The three incomplete new-build attempts remain excluded: eight requests/six
PNGs, with their original failures and physical-exit evidence retained.

## Retention and remaining limits

All own input/output bytes, 15 Project packages, consistent SQLite snapshots,
recoverable unsaved Add shadows, original requests, screenshots and mutation
proofs are retained. All required old-runtime bundle bytes are reconstructed
byte-exactly; one non-executable main debug map differs and has no original-byte
claim. A baseline-copy pnpm invocation proposes a modules purge and aborts;
existing direct Vite/esbuild CLIs complete reconstruction without provisioning
or changing dependencies. The independent retained-data/document audit is
CLEAN: all 3,494 entries (3,294 files, 198 directories and two literal symlinks),
15 Project packages/25 retained copies, both SQLite snapshots, recoverable Add
shadows, original PNGs/wires, old runtime bundle pins and six Invoke source pins
close. Control and Retry RGBA/ICC are independently decoded exact. This audit
does not independently rerun native execution or certify physical release.

ROOT then rechecks all 20 bounded units, 162 recorded native process identities,
actual owned cgroups, current process cwd/open files, restored 1,508-file mutation
source, qualified source/bundle hashes, all readers and 251 lifecycle records.
No incoming dependency references either disposable child. Only the exact own
`payloads` and `__pycache__` roots are removed, without following the two external
`node_modules` links. The deletion-only interval reduces artifact-root allocation
from 23,586,619,392 to 23,474,356,224 bytes: **112,263,168 bytes reclaimed**.

Required raw bytes survive in the verified 36,169,566-byte
`retained-payloads.tar.gz`, SHA-256
`eb710e12d07675dcc2d37a910266be4a530299c6f654cc6bb70573d3174662f2`,
with its complete no-follow manifest. Reports retain their historical raw paths;
the archive is the surviving source for disposed payloads. Lifecycle is
`retained`, with empty disposable payloads. Canonical shared runtime/catalog,
original weights/configuration, current companions, ordinary Project packages
and previous unsaved Add autosaves remain protected for follow-up work. Protected
historical compact evidence remains above the soft 1 GiB review threshold; no
global sweep is performed. Finalization changes only four documents after the
qualified code freeze; all five code/test files remain R4-exact.

Historical visual qualification remains negative or inconclusive. Anima, mixed
alpha, other image samplers/VAE, release Install/Repair and general capacity or
quality remain outside. PP-001/005/007/008 remain **«Пока не обещать»**.
