# DPM++ 2M for opaque regional img2img

Base: `66b82fcab7c5efe44957615d5cdce35c353372ac`.
This additive slice connects Normal and Karras DPM++ 2M to the existing opaque
Illustrious image route. Sampling defaults, source composition, persistent schema,
UI controls and the original native denoising loop remain unchanged.

## Current InvokeAI source and adaptation

The local clean InvokeAI revision is
`a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd`. Directly consulted:

- `invokeai/frontend/webv2/src/features/generation/core/canvas/compileCanvasGraph.ts`:
  ordinary graph, image-to-latents graft, then regional conditioning with the selected sampler.
- `invokeai/app/invocations/sd/denoise_latents.py::get_scheduler/init_scheduler`:
  native scheduler construction, training-timestep strength cutoff and independent
  compute-device generator seeded with `seed ^ 0xFFFFFFFF`.
- `invokeai/backend/stable_diffusion/schedulers/schedulers.py`: both `dpmpp_2m`
  keys select native `DPMSolverMultistepScheduler`, solver order two; Karras differs
  by `use_karras_sigmas`.
- `invokeai/backend/stable_diffusion/diffusion_backend.py`: original source-latent
  noising and original multistep prediction updates.

Studio already implements these mechanisms for ordinary IMG and regional TXT.
The adaptation classifies two additional regional image profiles, propagates the
DPM flag to the fresh image wrapper and extends matching admission guards.
It adds no scheduler update formula, alternate loop, noise generator or fallback.
The replayable posterior and versioned beta policy remain existing Studio
contracts; whole-Invoke image-byte parity is not asserted.
Invoke queue router/service `session_queue.py` and `session_queue_default.py`
provide the existing prepared all-or-none owner; only matching sampler guards
change in Studio, without a parallel queue algorithm.

## Finite contract

Profiles: `ordinary-canvas-dpmpp-2m-img2img-cpu-v1` and
`ordinary-canvas-dpmpp-2m-img2img-cuda-fp16-v1`. Public dispatch selects CUDA.
The explicit combination capability is
`illustrious-regional-img2img-dpmpp-2m-v1`; both qualified IMG and native DPM
capabilities are also required. IMG does not require or carry a TXT initialization
profile. Actual composed mode selects its final guard; independent TXT/IMG
capabilities alone do not authorize the combination. Single and batch queue,
frozen reload/Retry, processor and client retain their existing owners.

Retained bounds: exact steps 1..200; finite non-Boolean strength 0..1; epsilon;
Embedded manual-FP16 VAE; existing CFG/Rescale bounds and separate image-rescale
capability; original seed/source posterior; original geometry, text, row,
resource and attention-mask ceilings. Selected VAE/FP32 IMG, SDE, partial-alpha,
Anima and v-prediction remain outside this slice.

Strength filters the complete native training timeline. Scheduler `order=1`
determines evaluations; `solver_order=2` governs history, not double progress.
At 30 requested steps and strength .5, Normal/leading selects 15 evaluations
starting at 481; the independently constructed native Karras reference selects
16 starting at 458. Its final selected timestep is zero. Full native schedules
remain intact, the begin index points into them, and history starts empty for
each fresh request. Strength zero retains the source VAE roundtrip without
invented UNet steps. The TXT initializer's `begin_index is None` expectation
is deliberately not applied to an image window.

## Verification boundary

Focused native checks must enter the existing output frontend, observe original
source posterior/noising, selected window, history and every native transition,
then independently reopen RGB. An ordinary zero-region counterpart, exact repeat,
Euler controls and recoverable failures distinguish association and restoration.
A nonzero-begin-index mutation must publish a finite PNG before semantic RED;
setup, import or OOM failures do not qualify. Old-peer combination refusal has
its own mutation/control.

Installed acceptance uses the canonical noneditable runtime and official
Illustrious XL v0.1 at 512x512, translated origin, strength .5, 30 requested
Karras steps, CFG5/rescale .7, seed123. Real sampler/schedule UI, Generate/Cancel,
saved Euler/cleared-schedule/.2/source/text/strength edits, frozen DPM/Karras Retry,
independent exact RGB control and explicit Add/Undo/Redo/Save/reopen must preserve
request identity. Bounded direct Normal/Karras controls create no queue rows or
receipts and do not modify the saved request.

Evidence: artifact-relative
`runs/regional-guidance-img2img-dpmpp-2m/20261107-frozen-history`.
Authored/static checks, executed ROOT evidence, independent source/retention
review and physical lifecycle closure are recorded separately. Reuse one runtime
and checkpoint; ordinary units are bounded to 3 GiB/zero swap/600 seconds,
installed aggregate to 12 GiB with a 2 GiB launcher. These are operational test
envelopes, not capacity promises.

Regional operational fields remain excluded from accepted provenance, Compare
and result-derived presets. Ordinary image provenance retains the applied
sampler/schedule. Frozen work remains independent of current authoring; Add/Save
remain explicit. No visual quality, broader model family or readiness promotion:
PP-001/005/007/008 stay **«Пока не обещать»**.


## Executed qualification

ROOT executed **550 Main PASS**, **450 Python PASS / 500 warnings**, and the
full **194 browser PASS**. Python groups are185 boundary,214 IMG/TXT-DPM
neighbors and51 new CPU/CUDA cases. TypeScript/Vue typecheck, strict Python
(0 errors/0 warnings), scoped ESLint/Ruff, format and production build pass.
The build retains its existing large-chunk warning.

Isolated mutation evidence is **21 selections:18 GREEN /3 semantic RED**.
Removing only the new combination check admits an old peer and is caught;
forcing the DPM image begin index to zero publishes original finite PNGs before
the consumed-source-sigma oracle fails on CPU/CUDA. Euler controls stay GREEN;
restoration is byte-exact across all1515 copied/live source files at that phase.
Later qualification-harness corrections are explicitly separate from this freeze.

Accepted installed attempt `native-r3` passes **18 checks in296.119 seconds**
(297.362 seconds bounded). Three actual regional requests yield two PNGs and
one live Cancel. The independent healthy control and frozen Retry both consume
16 Karras evaluations; the final observer records32 worker spawns, including
Ready/normalization workers. The intermediate accounting's27 workers and one
main receipt exclude later observers/the separate healthy control. Neither
number is a numerical-request count.

Actual sampler/schedule UI selects DPM++2M/Karras. Saved authoring changes
Euler with cleared scheduler (`null`), rescale .2, source opacity .75, text, strength .8, steps2, seed124
and region enablement. Frozen Retry retains original source, masks, text,
strength .5,30 steps/seed123, rescale .7 and no TXT initializer. Browser PNG,
Canvas preview, Add/Undo/Redo, Save and independent ZIP/reopen preserve every
output RGBA byte. The healthy control is explicitly discarded through UI before
normal Electron exit0. Existing SQL, accepted history, packages and candidates
remain pinned. No production repair was needed during qualification.

The accepted PNG is177,222 bytes, SHA-256
`c7a26f15ea7b9757db2aa0f650c768901bc1d9952edd421f695d95e13167a7d0`;
its decoded RGBA digest is
`e071603b11a0c23799a619c8553d55bce3de43d63299899becc375d4a17d2620`.

Two subsequent installed-client controls pass in54.193 bounded seconds with
zero queue/receipt mutations. Normal selects15 evaluations and Karras16.
Karras matches the UI on every decoded channel. Changing only the scheduler
plus fresh protocol nonces changes **721,176 RGB channels /262,033 pixels**.
This establishes mode consumption, not useful visual semantics or quality.

Excluded attempts remain retained: one wrong Main error-code expectation;
two CPU-versus-CUDA TI row comparisons; an eight-worker browser OOM followed
by a full one-worker pass under the same3GiB bound. Installed `native-r1`
stopped at an old Normal-only assertion before any numerical JSONL command;
its sole running queue attempt was canceled APP_RESTART by actual production
startup, without another queue/receipt. The first recovery observer failed
before Electron on a receipt-sort column typo; its corrected run exits normally.
Installed `native-r2` completes Generate/Cancel/Retry/Add/Save/reopen but fails
its final raw-event expectation: the existing UI clears incompatible Karras
with `scheduler:null` when selecting Euler, and Main preserves that incomplete choice.
Retained reports and both IGS packages confirm saved `scheduler:null`;
`resolveIllustriousScheduler('Euler', null)` refuses execution until the
choice is complete. This does not imply a Normal fallback. The original
corrected expectation checks the raw null event. Its
three requests/two PNGs/one Cancel are excluded from the accepted whole run.
All attempts together contain eight numerical requests/six PNGs/two live
Cancels; the earlier startup-interrupted queue attempt is additional and
performs no numerical request. No failed report is rewritten as passed.
The retention review caught the erroneous Normal wording after qualification;
final docs and the future harness narrative are corrected without changing
assertions or numerical execution. Raw reports retain their original wording.

Frozen R2 source review is independently **CLEAN**,1513 baseline/1515 final
members,28 deltas/two additions at that point. R2→R4 changes only the two
disclosed installed-harness expectations. Twenty direct-control preservation,
PNG and exit helpers remain exact; subsequent five-literal path changes merely
select the accepted installed attempt. Source review is not runtime replay.

## Retained evidence and lifecycle

The run reuses the original checkpoint and canonical noneditable runtime.
Current source/qualification archives, all original attempts and outputs,
mutants/patches/restoration, commands, bounded process records, six InvokeAI
source pins/copies and two pinned Diffusers native sources are retained. Nine
own IGS packages, their available autosave bytes and a consistent SQLite backup
close the installed fixture inputs; no original model/runtime is duplicated.
The canonical terminal pool and its existing dependencies remain protected.

Final retained-byte/document review and ROOT physical release are recorded
separately below. The initial artifact root was23,703,834,624 allocated bytes;
protected historical evidence over the compact soft budget remains an explicit
exception. Only this run's verified idle payload tree is eligible for disposal.
No RSS/VRAM fit, allocator release, general trained capacity, human visual
acceptance or broader product readiness is inferred.


Final corrected-R5 source/document/retention review is independently **CLEAN**.
It verifies all3264 entries (2450 regular files,750 directories,64 literal
symlinks),1515 source members,692 local Python import references, nine IGS
packages and22 migration hashes, and independently reopens all six numerical
output PNGs. Runtime behavior remains ROOT evidence; this review is not a rerun.

ROOT then independently rechecks25 ended bounded units,106 native PID/start
identities, empty recorded cgroups,254 lifecycle records and zero incoming
disposable-child dependencies. All six child tasks/readers have ended. Only
the exact owned `payloads` tree is disposed: **59,707,392 allocated bytes**
reclaimed in the deletion-only interval. Canonical source/runtime/catalog,
companions, prior fixtures and their dependencies remain protected.

`retained-payloads.tar.gz` retains all raw reproduction bytes (17,539,266
compressed bytes), SHA-256
`3aa994edbe728e6ecf4db0b6457e7c10b51f087beb4c49c5e2b925dd75eb8ef3`.
Raw paths mentioned in historical reports now name archived entries, not live
files. Lifecycle is `retained`, with `payloads:[]`; source/commands/verdicts and
byte manifests remain accessible. This physical release is ROOT evidence,
separate from the independent audit and from feature readiness.
