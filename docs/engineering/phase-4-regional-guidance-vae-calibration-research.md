# Same-terminal-latent VAE precision control

## Question and current sources

Base: clean `c0716f906a8c3e05458799c2d17b2d218521ef6c`.
The [ordinary controls](./phase-4-regional-guidance-ordinary-research.md) reproduce
the extra white mug at seed 124 without enabled regions. Current source review
finds no new scheduler, CFG, conditioning, micro-conditioning or checkpoint
conversion defect. Known noise/initialization differences were already isolated;
generic Invoke SDXL defaults are not an Illustrious author recommendation.

One preparation difference remains useful to isolate: the ordinary experiment
explicitly selects manual FP16 VAE decoding, while current Invoke defaults to
FP32 unless the stored model explicitly overrides it. This is a deliberate
precision choice, not a demonstrated cause of the extra mug or malformed scene.

Reference: clean Invoke `a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd`:

- `invokeai/frontend/webv2/src/features/generation/core/baseGenerationPolicies.ts`:
  `getGenerationDefaults` selects FP32 absent the explicit FP16 model default.
- `invokeai/frontend/webv2/src/features/generation/core/graph.ts`: the active
  SDXL caller forwards that choice to `l2i.fp32`.
- `invokeai/app/invocations/vae/latents_to_image.py`: the decoder casts the whole
  VAE and raw latent to the chosen dtype before scaling, native decode,
  denormalization and NumPy/PIL conversion.

Studio's existing `inference_vae.py` already adapts this precision mechanism
through native `force_upcast`; pinned Diffusers 0.40.0 fully casts the VAE for
that decode. No missing mechanism, replacement loop, production precision
profile or default change is required for this diagnostic.

## Frozen experiment

Perform **one fresh ordinary request**, genuine historical Main
`seed124-baseline` with `regions == []`, unchanged global prompt/empty negative,
official Illustrious v0.1 epsilon, 1024² at (-13,5), thirty Euler steps, CFG 5,
Main false-ZTSNR/leading, FP32 CPU noise cast to FP16 and native initialization.
Require exact native predictions, original PT and reopened RGB against the
retained ordinary seed 124. Do not tune the prompt, sampler or seed.

Capture the raw terminal latent from the original thirtieth Euler transition.
After the request restores borrowed state, copy only the native VAE and verify
its state values. Finish the fixture and retire its test-owned model objects
before the extra decodes; this is no offload or precision fallback. Replay the
same latent and same initial half-loaded VAE values twice:

1. Original current Invoke decoder with `fp32=False`: require exact native PT
   and all RGB bytes against the ordinary request.
2. The same original decoder with `fp32=True`: observe actual full-VAE/input
   FP32, finite output, and independently reproduced RGB quantization.

Original Invoke decode/precision/scaling/denormalization code executes unchanged
on the common runtime. Explicit test adapters supply only context, image storage
and memory-accounting IO; they do not qualify the installed Invoke application,
model manager, allocator estimator or complete cache service. No VAE weights
are replaced and no extra denoising request is permitted. Retain the terminal
latent and original FP32 image values for the isolated contrast.

Observe both images anonymously for object counts, colors, support, geometry,
background coherence and seams. A numerical change is not visual improvement.
If the extra mug persists, this precision intervention has not removed it;
that does not establish which upstream setting, prompt or learned model behavior
causes it. Quality, human acceptance and regional assignment/reversal remain
separate gates.

## Ownership and bounds

Evidence owner: `runs/regional-guidance-vae-precision/20261102-same-latent/`.
`vae-contract.json` pins the hypothesis, inputs, source, one-request ceiling and
two-replay ceiling before execution. A run-owned probe reuses the prior ordinary
qualification owner; the historical ordinary run remains immutable evidence.

Use the existing compatible runtime/config/checkpoint without provisioning or
model copies. Serial native unit: 12 GiB host, zero unit swap, 600 seconds,
CUDA allocator fraction 0.75. Small units use 3 GiB. The owned VAE copy has a
concrete comparison purpose and ends with this unit; retire all its references.
Record actual peaks and failures without silently increasing bounds.
Archive required bytes before confirmed-idle payload cleanup. Compact target:
96 MiB; required historical dependencies remain protected.

## Executed result — 2 November 2026

**1 PASS / 3 warnings / zero failures, errors or skips.** There was exactly one
fresh ordinary request: thirty UNet calls, thirty Euler transitions, 2,100
cross-attention observations and one native VAE decode. Its thirty guided
predictions, original denormalized image and PNG/RGB exactly reproduce the
retained ordinary seed 124. The captured 131,072-byte terminal latent matches
the original thirtieth scheduler output.

The copied VAE's 248 state values and metadata matched, with independent
storage. Borrowed tensor/storage/graph/tokenizer/RNG/reservation checks passed
before copying. All five original model objects were gone before replay, as
checked through weak references; no model was offloaded or repaired. Both
additional decodes executed the unchanged current Invoke method, with actual
CUDA input and all 248 parameters observed at the requested dtype.

FP16 replay matches the native denormalized values and all RGB bytes exactly.
FP32 is finite and changes 123,227 RGB channels / 116,536 pixels, with maximum
channel difference **2/255**, mean absolute difference 0.039175669/255, and
denormalized maximum difference 0.0078418255. A separate model-free Pillow/NumPy
readback independently reproduces all RGB bytes from each original snapshot
and checks dimensions and pinned ICC. Global RNG, method slots and test
namespaces restore after both replays.

ROOT and an independent observer viewed both full originals. The independent
observer received anonymous images without prompts or conditions: both show
the blue mug left, extra white mug right and central apple on a tray, with the
same ambiguous background loops. The observer could not reliably distinguish
the images. **FP32 decode does not remove the extra mug in this fixed case.**
This closes the proposed precision intervention, not the source of the learned
scene or general VAE quality. No further generation or settings search occurred.

The serial native unit took 100.315 seconds, with host peak 7,947,149,312 bytes
and zero swap. Its peak sample separates 903,847,936 anonymous from
6,954,663,936 file bytes. Recorded CUDA allocated/reserved peaks are
9,617,606,144 / 12,194,938,880 bytes; separate replay-phase peaks were not
measured. These are unit observations, not a capacity claim.

Initial static typing diagnostics were corrected with annotations/casts and
equivalent reference clearing; strict typing and scoped Ruff pass. Two
preflight failures occurred before model loading: system Python 3.13 and target
Python 3.12 serialized the same original AST differently, then ROOT supplied an
incorrect self-hash in the command. Target-specific pins and the corrected
command pass. Original source-file bytes and decoder compute did not change;
both diagnostics remain excluded from runtime PASS and semantic-RED evidence.

Independent source review is CLEAN at its stated freeze. The later target-AST
serialization correction and ROOT execution are separately recorded. No new
implementation defect was established by the source or precision comparison.
Further visual calibration needs an explicit model/prompt/settings hypothesis;
it must not become an automatic sampler sweep or a regional-mask repair.

The no-follow inventory and complete archive readback retain all thirteen
payload entries (ten regular files, three directories), including terminal
latent, both decoded PNGs/thumbnails, FP16/FP32 original image values and target.
After fresh seven-unit physical-exit checks, five completed readers, unchanged
source and incoming-dependency checks, only this run's `payloads/` was removed:
**22,515,712 allocated bytes reclaimed** in the deletion-only interval. The
18,684,810-byte archive, anonymous PNGs, source and reports remain. Lifecycle is
`retained` with empty live payloads; required historical source/config/model/
runtime dependencies stay protected. Inaccessible preexisting desktop-service
handles remain an explicit process-scan limitation. New compact proof stays
below 96 MiB; the artifact root remains below its 30 GiB soft budget.

Public enabled-region NEW refusal,
frozen Retry independence, Smart target-only permission and Regional provenance/
Compare/preset exclusions remain. PP-001/007/008 stay **«Пока не обещать»**.
No Anima capability, generic SDXL family, durable candidate, Add/Save or visual
quality claim is added.
