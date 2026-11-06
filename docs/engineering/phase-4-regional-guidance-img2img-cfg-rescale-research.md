# CFG Rescale for opaque regional img2img

Base: `92a19c2e904c80812df66d0a58cb82f7d8ac3ec6`. This finite continuation
extends the existing opaque Illustrious image route with its already authored
CFG Rescale setting. It adds no sampler, diffusion loop, numeric control,
persistence field or migration. Default remains zero.

## Current InvokeAI and ownership

The clean local InvokeAI checkout is inspected directly at
`a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd`:

- `invokeai/frontend/webv2/src/features/generation/core/canvas/compileCanvasGraph.ts`
  grafts image-to-latents into the ordinary denoiser, then adds regional guidance.
- `invokeai/frontend/webv2/src/features/generation/core/graph.ts` forwards the
  authored CFG rescale multiplier to that denoiser.
- `invokeai/app/invocations/sd/denoise_latents.py` installs `RescaleCFGExt` for
  a positive multiplier without an image-mode exclusion.
- `invokeai/backend/stable_diffusion/extensions/rescale_cfg.py` applies the
  per-image positive/guided standard-deviation ratio and authored blend.
- `invokeai/backend/stable_diffusion/diffusion_backend.py` invokes the extension
  after CFG combination and before the original scheduler step.

Studio already delegates this operation to the pinned native SDXL pipeline via
`run_sdxl_pipeline(..., cfg_rescale=...)`. The confirmed missing behavior is a
set of IMG-only zero guards in admission, frozen reload, transport and the
public native profile. Reuse the existing operation, dtype and ordering; no
new formula, denominator repair, clamp, scheduler or fallback is introduced.
This parameter remains distinct from zero-terminal-SNR scheduler policy.

## Finite admission and compatibility

Public opaque IMG keeps Illustrious epsilon, Euler/Normal, Embedded manual FP16
VAE, explicit strength in 0..1 and all current geometry/resource/row/mask/job
bounds. CFG Rescale uses the existing finite 0..0.99 product range. Missing
draft data retains effective zero semantics; malformed values refuse. Historical
private image profiles retain their zero-only behavior. TXT retains its existing
sampler, VAE, initialization and rescale policy.

The additive capability `illustrious-regional-img2img-cfg-rescale-v1` is required
only for nonzero regional IMG. A previous worker already advertises both
regional IMG and regional CFG rescale while refusing their combination; those
two older strings alone cannot qualify this extension. The strict new check
requires qualified regional IMG and CFG rescale plus the combination capability.
Neutral IMG remains usable on its previously qualified peer.

Renderer advisory uses actual target mode and a strict optional transient state
Boolean. Main obtains authoritative mode only after composing the target;
therefore the exact IMG-combination refusal follows alpha classification but
precedes model/resource verification, input-file publication and queue SQL.
Refusing every nonzero draft before composition would incorrectly block valid
TXT work. Frozen Retry gates the frozen value before new SQL; dispatch/client
gate again before numerical scratch/transport.

Existing `cfgRescale` fields carry the exact value through concrete commands,
frozen reload, Retry and ordinary accepted IMG provenance. Regional operational
fields remain excluded from accepted provenance, Compare and result-derived
presets. Source, strength, explicit Add/Save and frozen-work independence remain
owned by their existing mechanisms.

## Planned verification

Focused Main tests enter actual Service/capture/planner/SQLite/queue/receipt
owners with explicitly controlled catalog/compositor/numerics. They challenge
the old peer with both earlier capabilities, neutral IMG/TXT controls, finite
boundaries and frozen .7 after saved .2 edits. Lower fixtures do not establish
installed numerical execution by themselves.

Tiny CPU/CUDA tests use original dual-CLIP/Compel, UNet/Euler/VAE, static
conversion and real PNG publication. Independently observed signed predictions
derive the literal CFG/std-ratio/blend expectation for actual scheduler inputs.
Zero uses exact ordinary image controls. Strength zero performs the existing
seeded VAE roundtrip without fabricated denoising/rescale events. Refusal and
recoverable failure paths preserve borrowed state and allow a fresh call.

Isolated mutations bypass the specific combination gate and substitute zero
for the actual native multiplier. Targets must fail semantically, neighboring
neutral/TXT controls stay GREEN, and restored source returns GREEN. Import,
setup, OOM and timing failures are not semantic RED.

The installed scenario reuses the canonical runtime/catalog and exact official
Illustrious XL v0.1 epsilon checkpoint. Actual Advanced Options selects .7 for
opaque 512x512, strength .5, Euler/Normal 30, seed 123. A separate same-input
healthy control precedes Generate/Cancel and saved source/text/strength/rescale
edits. Frozen Retry must retain .7/.5/30/123 and match control RGBA exactly,
then complete explicit Add/Undo/Redo/Save/ZIP/reopen with .7 applied provenance
and .2 current authoring. A separate zero replay should demonstrate trained
numeric influence without creating queue rows or acceptance receipts.

Serial lower units use 3 GiB/zero swap/600 seconds. The installed scenario keeps
the existing aggregate 12 GiB host envelope, 2 GiB launcher and bounded native
scope; direct replay uses one bounded group. These are qualification selections,
not general memory/VRAM capacity promises. Dependencies/models are reused; only
the idle installed worker payload is refreshed through the existing verified
developer tool, not release Install/Repair.

Evidence directory: artifact-relative
`runs/regional-guidance-img2img-cfg-rescale/20261106-frozen-multiplier`.
Source authors' static checks, ROOT execution, independent reviews and physical
retention/release gates remain distinct. The initial plan freeze precedes the executed results below.

Prior visual results remain negative or inconclusive; this is no new visual
cohort or prompt/seed search. Partial alpha, selected-VAE encoding, additional
image samplers, Anima, visual/human acceptance and release readiness remain
separate. PP-001/005/007/008 stay **«Пока не обещать»**.

## Executed evidence and excluded diagnostics

ROOT records **499 distinct Main PASS**, **299 distinct Python PASS / 187
warnings** and **190 full browser PASS**, with no failures/errors/skips in the
accepted runs. The eight focused browser cases are included in 190. The new
36-case CPU/CUDA suite is included once in 299; its earlier identical successful
run is not added again. Full TypeScript/Vue and strict scoped Python typing,
scoped lint/format and a fresh app build pass; the existing large-chunk warning
remains. An external virtual-path TypeScript check reports zero diagnostics
for the direct numerical-control helper.

Two isolated mutations execute **21 selections: 18 GREEN / 3 semantic RED**.
Bypassing only the IMG-combination capability fails its preserving Main refusal,
while neutral IMG and TXT-rescale remain GREEN. Replacing the actual native
multiplier with zero reaches real PNG publication, then fails both CPU/CUDA
signed-prediction-to-scheduler input oracles. Neutral ordinary IMG controls stay
GREEN. All 1,511 known copied source files and the live workspace restore exactly.
The driver marks its current detached unit before launch; missing current exit
proof blocks rollback and retains mutant/backup for explicit ROOT reconciliation.
Four simulated guard checks pass without creating or signaling a real child;
this is not an executed OS interruption claim.

The canonical noneditable worker is refreshed in place: 52 Python modules and
65 files, with the new combination capability. Existing dependencies, offline
configuration, runtime pointer and original checkpoint are reused. Developer
payload refresh does not qualify release Install/Repair.

Installed **native-r4: 17 grouped checks PASS, 287.293 seconds**
(287.937-second bounded unit). Real Advanced Options selects .7 for the healthy
control and main request. Actual UI Cancel follows genuine selected-step progress;
there are three original requests, two completed receipts/PNGs and one Cancel.
Requested 30 steps at strength .5 select 16 actual steps. The main-project receipt
count is one; the second belongs to the independent control. The 27 observed
worker spawns include readiness/normalization and are not 27 numerical requests.

Saved edits change source opacity, global/regional text, strength to .8, steps
to two, seed to 124, enabled regions and rescale to .2. Frozen Retry still sends
.7/.5/30/123 and the original opaque pixels on a fresh request. Every executing
peer advertises the combination capability. Control/Retry RGBA matches exactly.
Results, explicit Add/Undo/Redo, Save/ZIP/reopen preserve the source Raster,
accepted ID, output bytes, .7 applied ordinary IMG provenance and .2 current
authoring. Regional operational fields remain excluded. The accepted RGB PNG is
193,558 bytes, SHA-256
`2c38c05adedb9a946633fc16a477d2743652bf60018f8b81f630011d536912ef`;
decoded RGBA SHA-256 is
`b941b8070d52b115bf33d8bbb390cacf893669d04a3940b42fc99421edfb3a66`.
The control is explicitly closed through normal Discard Candidates UI after
retention; app exit is zero with confirmed owned-child/scope exit, no fallback.

The two separate direct controls pass in 51.602 seconds, after physical Electron
exit. They load genuine verified durable Main input, changing only rescale and
request/staging nonces through the original installed client. The .7 replay
matches every UI RGBA channel; zero changes **569,646 RGB channels / 255,327
pixels**. There are no new queue admissions or receipts. All SQL table hashes,
original frozen row/input bytes, own packages, checkpoint/resource identities,
worker/configuration/source/bundle/companion hashes remain exact around these
read-only replays. This establishes finite numerical influence, not improvement
in image quality or a new durability boundary.

ROOT opens mounted and actual installed healthy/reopened screenshots using
`ui-audit`. Actual output/source/draft states are visible; no new layout design
or whole-interface/aesthetic acceptance is claimed. Source R2, R3 correction,
external-control and narrow navigation reviews are CLEAN within source-only
limits; ROOT execution remains separate.

Excluded diagnostics are retained without counting their partial passes:
Main affected-r1 has 496 PASS/three false-oracle failures. Two inherited negative
fixtures used newly valid .7; they now challenge the unchanged upper bound with
invalid `1`. The new controlled-child test asserted fresh nonces while reusing a
caller request ID; it now explicitly assigns fresh IDs. A focused repeat catches
ROOT's omitted randomUUID import, fixed before the accepted 499-case run. Three
browser non-null assertions and a typed progress callback resolve strict typing
without removing assertions or changing inputs.

Installed r1 completes only its healthy control, then times out after a redundant
Home click before main Generate; its exact race is unproven. ROOT's additional
Save-enabled navigation precondition in r2 is too broad for the deliberately
invalid partial-alpha fixture and fails before any numerical request. The new
profile instead keeps an already selected exact Project tab, preserving normal
Home/Refresh/Open for cross-Project navigation and genuine close/reopen later.
R3 completes control and actual Cancel, but the harness fills a regional editor
while global draft synchronization intentionally blocks its handler. No regional
prompt IPC occurs; the unchanged text assertion fails. R4 waits for global
acknowledgement/editor readiness and regional acknowledgement before hiding the
owner. No production behavior or expected value is weakened. These three
incomplete attempts contribute three requests/two PNG receipts/one Cancel;
r1/r3 owned SIGKILL fallbacks remain distinct from r4's healthy exit.

## Retention and finalization

All own source/output/failed/control/mutation bytes, 12 Project packages, 17
retained input copies and consistent SQLite/autosave snapshots are collected.
Current shared runtime/catalog, original weights/configuration, companions and
prior unsaved Add shadows remain protected. Independent final source/retained-byte
review is CLEAN within its stated scope and all review-owned readers have ended;
it does not rerun ROOT's native qualification or authorize deletion.

The verified no-follow archive preserves all 3,180 entries: 2,417 regular files,
690 directories and 73 literal symlinks, with no hardlinks or FIFO. Its compressed
size is 19,980,115 bytes and SHA-256 is
`6ce8198f54918d707b7a1eb87c3cc8e3fb4d54d6e58cf564ee618988e85434e6`.
Fresh ROOT gates confirm source/mutation restoration, 109 ended native process
identities, ended units/empty owned scopes, no current process users and no
blocking incoming dependencies across 252 lifecycle records. ROOT then removes
only this run's idle `payloads` tree: artifact-root allocation falls from
23,657,238,528 to 23,591,677,952 bytes during the deletion-only interval,
reclaiming **65,560,576 bytes**. Raw payload paths are historical; their required
bytes remain in the archive. Lifecycle is `retained` with `payloads: []`;
canonical dependencies remain protected. No public promise status changes.
