# Euler a for opaque regional img2img

Base: `d725b1a52d7fa76d7e9dd0fbfe99f858262dd531`. This continuation adds
Euler a / Normal to the existing opaque Illustrious regional image route.
It does not change the default sampler, image composition, storage schema,
numeric controls or original denoising loop.

## Current InvokeAI and confirmed gap

The clean local InvokeAI checkout is read directly at
`a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd`:

- `invokeai/frontend/webv2/src/features/generation/core/canvas/compileCanvasGraph.ts`
  constructs the ordinary graph, grafts image-to-latents and then regional
  conditioning, retaining the selected scheduler.
- `invokeai/app/invocations/sd/denoise_latents.py::init_scheduler` selects the
  strength window using actual training timesteps and supplies an independent
  compute-device step generator seeded with `seed ^ 0xFFFFFFFF`.
- `invokeai/backend/stable_diffusion/schedulers/schedulers.py` maps `euler_a`
  to the original Euler ancestral scheduler.
- `invokeai/backend/stable_diffusion/diffusion_backend.py` forwards the original
  prediction and scheduler kwargs to the scheduler step.
- `invokeai/app/api/routers/session_queue.py` and
  `invokeai/app/services/session_queue/session_queue_default.py` admit the
  prepared graph through the existing all-or-none queue owner. Studio preserves
  that owner and changes only its matching-sampler guard for the image mode.

Studio already has that scheduler selector, independent step-RNG scope and the
ordinary image pipeline factory. The confirmed gap is that regional IMG admits
only Euler, and its fresh-pipeline branch does not select ancestral execution.
Reuse those existing mechanisms, including the previously qualified replayable
VAE posterior; add no alternate loop, noise formula, cache or fallback.

## Boundary and invariants

The route remains Current Canvas, Illustrious epsilon, actual wholly opaque
input, Embedded manual-FP16 VAE and explicit strength. The two additive private
profiles are `ordinary-canvas-euler-ancestral-img2img-cpu-v1` and
`ordinary-canvas-euler-ancestral-img2img-cuda-fp16-v1`. Public dispatch selects
the latter. Historical Euler/TXT profiles and their refusal semantics remain.

`illustrious-regional-img2img-euler-a-v1` separately qualifies the combination;
independent earlier IMG and TXT Euler-a capabilities are insufficient. Advisory,
authoritative post-composition admission, frozen Retry, processor and client
checks precede their existing resource/files/SQL or scratch boundaries. Existing
frozen fields carry sampler, source, strength, rescale and seed; no migration or
new worker-command field is needed. IMG has no TXT initialization profile.

| Parameter              | Retained bound / ownership                                                                                                    |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Sampler/schedule       | Euler or Euler a / Normal; DPM image routes remain excluded                                                                   |
| Steps                  | Exact integer 1..200; actual selected native count determines progress                                                        |
| Strength               | Finite non-Boolean 0..1; zero is the existing VAE roundtrip with no invented steps                                            |
| CFG / Rescale          | Existing public CFG >1..30 and finite non-Boolean rescale 0..0.99; nonzero also requires the IMG-rescale capability           |
| Seed streams           | Frozen uint32 seed; unchanged image posterior/initial noise; independent device step RNG uses xor seed                        |
| Geometry               | Sides 8..2048, divisible by eight, area <=4,000,000; original world geometry and mask ceilings                                |
| Conditioning/resources | Existing three-region, text/row/vector/alias/resource budgets and explicit composition/pools                                  |
| Qualification envelope | Serial lower checks 3 GiB / zero swap / 600 seconds; installed aggregate <=12 GiB with 2 GiB launcher; not a capacity promise |

Regional operational fields remain excluded from accepted provenance, Compare
and result-derived presets. Ordinary IMG provenance preserves the applied
sampler; current authoring and frozen work remain independent. Explicit Add and
Save retain their existing owners.

## Planned discriminating verification

Main checks must exercise actual composition, capture, planner, frozen queue,
Retry and transport. Old peers refuse the new combination before work while
Euler IMG and TXT neighbors remain usable. Saved Euler edits cannot retarget
a frozen Euler-a image request.

Tiny CPU/CUDA checks observe the original posterior, initial noise, selected
timesteps, every original ancestral step, independent generator, CFG/rescale,
terminal latent and real reopened PNG. Strength zero and all recovery failures
retain original state/RNG and allow a fresh request. An ordinary no-region
counterpart and exact repeat provide controls.

An isolated xor-seed mutation must complete native PNG publication before its
consumption oracle turns RED; an Euler control stays GREEN. A combination-gate
mutation separately challenges old-peer refusal. Exact source restoration and
physical exit precede rollback disposal. Setup/import/OOM failures are not
semantic RED.

The installed scenario uses the canonical runtime and official Illustrious XL
v0.1 checkpoint: 512x512, translated origin, strength .5, 30 Euler-a/Normal steps,
CFG5, rescale .7 and seed123. Real Sampler UI, Generate/Cancel, saved Euler/.2/
source/text/strength edits, frozen Euler-a/.7 Retry, exact control RGBA, explicit
Add/Undo/Redo/Save/ZIP/reopen must remain associated. Optional direct installed
replays compare the same original request against Euler without creating queue
admissions or receipts.

Evidence directory: artifact-relative
`runs/regional-guidance-img2img-euler-a/20261107-frozen-ancestral`.
Authored checks are not executed qualification. Results, independent review,
retained-byte closure and ROOT physical release will be recorded separately.

Selected VAE/FP32 image encoding, DPM image sampling, partial-alpha inpaint/
outpaint, v-prediction, Anima, regional references, visual/human quality and
release Install/Repair remain separate. PP-001/005/007/008 remain
**«Пока не обещать»**.

## Executed qualification

ROOT records **520 distinct Main PASS**, **332 distinct Python PASS / 364
warnings**, and **192 full browser PASS**. The ten regional browser cases are
included in 192. Python includes 153 worker/protocol cases, 121 existing image/
rescale neighbors, 40 new CPU/CUDA ancestral-image cases and 18 TXT-ancestral
neighbors. These groups have no duplicate test identities. Full TypeScript/Vue
typecheck after the final TS edit, strict scoped Python typing, external control
helper typing, scoped ESLint/Ruff and app build pass; the existing chunk warning
remains. Authored/static evidence is distinct from those executed runs.

Isolated mutations execute **21 selections: 18 GREEN / three semantic RED**.
Removing only the IMG-Euler-a combination capability breaks the real Main
old-peer refusal while Euler IMG and Euler-a TXT controls remain GREEN. Removing
the xor from the actual step generator reaches native PNG publication, then
breaks both CPU/CUDA consumption oracles; ordinary Euler image controls remain
GREEN. The 1,513-file copy restores exactly and the live workspace is unchanged
at mutation closure. Its R3 source differs from later qualification only in the
disclosed recovery-fixture line and Canvas observer. Physical exit is checked
before restoration; a missing current exit report blocks rollback.

The canonical worker is refreshed in place, with 52 Python modules / 65 files
and the new combination capability. Dependencies, offline configuration, runtime
pointer identity and original official checkpoint remain reused. This is a
developer payload refresh, not release Install/Repair qualification.

Installed **native-r2 passes 18 grouped checks in 293.104 seconds**
(293.776-second bounded unit). Actual Sampler UI selects Euler a / Normal for
the healthy control and main request at 512x512, strength .5, 30 requested
steps, CFG5, rescale .7 and seed123. All three original numerical wires use
`euler_a`, advertise the separate capability and omit TXT initialization.
The actual strength window emits 16 steps; progress and UI Cancel are genuine.
Three requests produce two completed receipts/PNGs and one Cancel. The report's
one completed receipt counts only the main Project; the second is its separate
healthy control. The intermediate accounting snapshot has 27 worker spawns;
final observers contain 32 after Add/reopen/normalization. Both include readiness
and image normalization, not additional numerical requests.

Saved current authoring switches to Euler, rescale .2, strength .8, two steps,
seed124, modified source opacity/text and disabled regions. Frozen Retry remains
Euler a / .7 / .5 / 30 / 123 with original opaque pixels and matches control
RGBA exactly. Results, explicit Add/Undo/Redo, Save/ZIP/reopen preserve the
accepted layer, source Raster and edited draft. Applied ordinary IMG provenance
keeps Euler a while the saved draft keeps Euler; Regional fields remain excluded.
The accepted PNG is 239,963 bytes, SHA-256
`6ef17d6817d08414efa012db9ac2062d497a94e857e2454cadb54cb63dcf611e`;
decoded RGBA SHA-256 is
`decc2b0b2eb78924f65b9ec186cd1307ed1ae4852f919fe37e46035d4cd49770`.
The healthy control is explicitly discarded through normal Close Project UI
after retention. App exit is zero, signal null, with owned processes/scopes
confirmed ended and no fallback in the accepted run. Previous business rows,
packages and autosaves stay preserved; normal index timestamps and receipt
sequences are not claimed byte-identical across UI operations.

Two direct installed-client controls pass in 50.817 seconds
(51.319-second bounded unit) after physical Electron exit. They use genuine
verified Main input and change only `euler` versus `euler_a` plus fresh protocol
nonces, keeping source/recipe/seed/strength/rescale exact. Euler-a matches every
UI RGBA channel; Euler changes **765,621 RGB channels / 262,102 pixels**. There
are no new queue admissions or receipts. SQL table hashes, frozen inputs,
packages, resources and source/bundle/runtime/configuration/companion pins remain
unchanged. This establishes numerical influence, not better image quality.

ROOT views the actual pre-Generate, Results and saved/reopened screenshots using
`ui-audit`. This is a bounded self-review of existing controls and output display,
not full accessibility, interface or generated-image aesthetic acceptance.
Feature/source and narrow Canvas-observer reviews are CLEAN within source-only
limits; they do not independently rerun ROOT's native qualification.

## Diagnostic exclusions and display observer correction

Main-r1 has 508 partial PASS / 11 failures: the additional single/batch queue
admission guards still required Euler. Both guards now admit only exact public
image Euler-a without TXT initialization; a two-image batch regression is added.
Main-r2 has 519 partial PASS / one fixture failure: its fresh repository omitted
mandatory startup recovery. Adding `recoverAfterRestart()` after cancellation
preserves every input/assertion; focused storage19 and final full520 pass. An
earlier typecheck identifies one missing optional test `Bundle` declaration;
the declaration-only correction changes no runtime assertion.

Native-r1 completes its independent Euler-a control, then its three-point Canvas
comparison finds 13 versus the unchanged <=8 allowance. That incomplete cycle
and its owned SIGKILL fallback are excluded. It contributes one request/PNG and
no Cancel. A later display-only app diagnosis makes no Generate call but cannot
find its Results tile after restart; its fallback/exit are separately recorded.

The harness had inferred backing scale from integer bitmap size divided by a
fractional CSS bound. Konva 10.7.0 instead preserves its original backing
transform. Native-r2 observes bitmap width843, CSS width843.203125 and exact base
scale1; the old ratio is0.9997591031223941. The corrected independent reference
reads that base transform, rejects skew/translation/anisotropy or inconsistent
dimensions, and uses it for both draw and sample coordinates. Image, world bbox
and camera associations and the <=8 allowance remain unchanged. Older profiles
retain their historical observer. Production rendering and numerics are unchanged.

Thirty display-only original-Konva cases have 12 old-reference differences >8
and zero corrected differences. An additional probe using the observed native
dimensions/camera has old middle-sample difference16 and corrected difference0;
actual native-r2 differences are at most3. Native-r1/r2 healthy PNGs are byte-exact.
These measurements support a display-oracle correction without extra inference
for the probes. Initial import/executable setup failures and a 12-case integer-DPR
probe that ruled out transform-order differences remain diagnostic exclusions.
The accepted installed cycle is rerun in full. Qualified UI/direct accounting is
five requests / four PNGs / one Cancel; including the excluded native control,
the total is **six requests / five PNGs / one Cancel**.

## Retention and finalization

Six own Project packages, seven input/shadow copies and a consistent SQLite
backup with clean integrity/foreign keys are retained. Required source, target,
output, control, failed and mutation bytes are in the verified no-follow archive.
All 2,972 entries are preserved; compressed size is 17,191,686 bytes. Canonical
runtime/catalog, original weights/configuration, current qualification companions
and previous unsaved Add shadows remain protected.

Independent retained-byte audit is CLEAN within its stated scope; all owned
readers have ended. Its minor worker-count clarification is applied above.
This audit does not independently rerun ROOT's native qualification or authorize
deletion. The archive SHA-256 is
`3afa36b6d1635c8df4da3ac169c5b4486dbee6ffb50784482d2645d1ecf10062`;
it contains 2,259 regular files, 643 directories and 70 literal symlinks, with no
regular hardlinks or followed links.

Fresh ROOT gates verify all source/mutation bytes, 69 ended native process
identities including the display-only diagnosis, empty owned scopes/units,
no current process users and no blocking incoming dependencies across 253
lifecycle records. Only this run's idle `payloads` tree is removed. Artifact-root
allocation falls from 23,749,705,728 to 23,694,020,608 bytes during the deletion-only
interval, reclaiming **55,685,120 bytes**. Raw payload paths are historical;
their required bytes remain in the verified archive. Lifecycle is `retained`
with `payloads: []`; canonical dependencies remain protected. No promise status
or visual/human readiness promotion follows.
