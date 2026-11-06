# Private opaque img2img with Regional Guidance

Base: `6802bb3a08da149dbfe34ba2c3d1cf77ee6956be`. High risk: source-pixel
consumption, VAE encoding, timestep selection and restoration of borrowed native
components. This slice adds a private Python consumer; public regional admission,
worker transport, frozen jobs, Retry, candidate durability and UI stay unchanged.

## InvokeAI basis and deliberate adaptation

Current clean local InvokeAI `a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd`:

- `frontend/webv2/src/features/generation/core/canvas/compileCanvasGraph.ts`
  maps SDXL strength to `denoising_start=1-strength` and grafts image-to-latents
  into the same denoiser before regional guidance.
- `canvas/addRegionalGuidance.ts` connects regional text and mask ownership to
  that denoiser; img2img does not need another regional diffusion algorithm.
- `app/invocations/sd/denoise_latents.py::init_scheduler` selects native training
  timesteps below the rounded strength cutoff. `prepare_noise_and_latents`
  supplies both source latents and noise.
- `app/invocations/vae/image_to_latents.py` performs native posterior sampling
  and scaling; `backend/stable_diffusion/diffusion_backend.py` returns the encoded
  source when the selected timestep window is empty.

Studio already adapts these mechanisms in `inference.img2img_pipeline_class` and
`run_sdxl_pipeline`. Reuse that exact factory and original Diffusers0.40.0 VAE,
conditioning, Euler loop, decode, static conversion and publisher. No copied loop,
new source encoder, clamp or numerical repair is introduced.

The existing ordinary adaptation deliberately uses an independent frozen CPU
posterior generator to make Invoke's unseeded sampling reproducible. It draws
image noise directly in compute dtype; current Invoke's `latent_noise.py` and
`devices.choose_noise_dtype` normally draw FP32 and then cast. This slice retains
ordinary Studio image behavior. It does not claim complete current Invoke img2img
numerical parity or silently change ordinary noise semantics.

## Finite ownership and parameters

The sibling private `generate_current_canvas_regional_img2img` accepts only an
exact `GenerateIllustriousImg2ImgCommand`. It derives the sole parameter record
from that command. Exact subclass refusal excludes outpaint. Command/recipe
bbox including origin, dimensions, seed, text, resource and profile agreement
precedes filesystem/native work. The existing target validator reads one
hash/size/ICC/dimension-checked RGBA snapshot, requires alpha255 everywhere,
and returns owned RGB from those verified bytes. No second source path is read.

New explicit profiles are `ordinary-canvas-euler-img2img-cpu-v1` and
`ordinary-canvas-euler-img2img-cuda-fp16-v1`. They require Euler/epsilon, explicit
versioned noise policy, steps1..200, finite strength0..1 excluding bool, existing
CFG/layout bounds and zero CFG Rescale. CPU uses FP32 and CUDA uses manual FP16
embedded VAE; `force_upcast` must be exactFalse on both lanes before borrowing.
Selected/prepared VAE encoders, ancestral/DPM image samplers and other objectives
remain outside this slice.

The original borrowed pipeline stays an exact standard txt2img pipeline. Under
its existing reservation, only a fresh execution wrapper uses the existing
img2img factory. The VAE reservation covers encoder and decoder. Text and TI
preparation, geometry, permissions and mask budgets still complete before native
consumption. The txt2img zero-latent initializer never runs on the image lane.

Native selected timesteps determine the expected forward/progress count,
including zero. The private adapter may finish without attention consumption
only when this image execution has a validated empty native window; historical
attention callers still require consumption. Strength0 is seeded VAE encode/
decode without UNet or progress, not source-pixel identity. For leading30 and
strength0.5, the training cutoff selects16 evaluations beginning at496, rather
than floor(30*0.5)=15.

Existing bounds remain: sides8..2048/divisible8, area<=4,000,000; target32MiB;
three regions, four pairs/eight signs, text16KiB/128KiB aggregate, emitted308
rows per sign, existing exact-TI budgets and33,554,432 expanded mask elements.
These are admission/payload bounds, not RSS/VRAM capacity or image-quality claims.

## Acceptance and evidence level

Focused real CPU/CUDA tests observe source VAE encode,
independent seeded posterior/noise, original scheduler.add_noise, selected native
window, regional attention, decode and reopened PNG quantization. Zero-region
ordinary image counterparts must agree exactly on PT/RGB. Source-only neighbors
and a valid wrong-source mutation must remain distinct from regional permission
controls. Encoding, later native-step, decode and publication failures must
preserve borrowed state/RNG/targets, release reservations and permit a fresh call.

A bounded full official Illustrious v0.1 probe uses the existing production loader
and runtime/configuration, synthetic opaque source images and canonical complete
Python recipe fixtures. These are explicitly not fresh genuine Main handoffs.
The private checkpoint therefore does not establish public Main image admission,
frozen Retry transport, installed worker support, Add/Save or visual usefulness.

Artifact-relative run: `runs/regional-guidance-img2img/20261106-opaque-native`.
Serial lower units:3GiB/zero swap/600seconds; trained unit:12GiB/zero swap/600seconds
and CUDA allocator fraction0.75. No environment, model or checkpoint copy is needed.
Actual execution, source review, mutations and retention results belong below.

Historical visual3 narrow PASS/1 INCONCLUSIVE remains NOT_QUALIFIED. Human/general
quality, Anima, partial-alpha inpaint/outpaint and release remain separate.
PP-001/005/007/008 readiness and Regional provenance/Compare/preset exclusions stay
unchanged. Public opaque regional requests continue to refuse.

## Executed evidence and correction

ROOT:369 distinct PASS,322 warnings, zero failures/errors/skips in the accepted
four units:85 new IMG,237 denoising/output/attention/sampling neighbors,40 CFG
Rescale neighbors and7 trained selections. Strict Python typing reports zero
diagnostics; scoped Ruff lint/format and diff checks pass. No TypeScript, public
worker, protocol, queue, UI or installed runtime payload changes are made.

The official checkpoint probe completes in182.792seconds under the declared
12GiB/zero-swap/600second envelope. It makes seven native calls and publishes
seven PNGs at104x72: strength0, base0.5/30, source-only neighbor, exact repeat,
strength1/3, zero-region0.5/30 and its ordinary counterpart. Native counts are
seven VAE encodes/decodes,83 UNet/Euler steps and5,810 original attention calls
across all70 sites. No borrowed VAE cast occurs. Source-only variation changes
22,235 RGB channels; repeat changes zero. Zero-region PT/RGB equals the genuine
ordinary native image call exactly. Every PNG is independently quantized from
its own original native output. This is finite trained mechanics, not renewed
whole-checkpoint loading fidelity, image quality or a capacity envelope claim.

R1 source review found a reachable borrowed-state defect: a native InstanceNorm2d
substituted into the VAE encoder can update existing running buffers even in eval
mode. ROOT reproduced both mean and variance changes after an actual strength0
PNG. The new IMG-only preflight admits exactly the16 qualified native VAE classes
instead of treating every native eval module as readonly. Four CPU/CUDA
strength0/interior refusal-and-recovery cases prove rejection before encode.
Legacy TXT admission remains unchanged. Independent R2 source review is CLEAN
within the finite cooperative contract; it does not rerun ROOT qualification.

Two isolated R3 mutations execute24 selections:20 GREEN/four semantic RED.
A valid horizontal flip replaces only the verified image supplied to the runner;
the source-association oracle fails after actual PNG publication on CPU/CUDA,
with819/779 changed RGB channels. Replacing the training cutoff with floor-based
step selection publishes a valid15-step image and then fails the independent
16-step timeline oracle, changing942/955 channels. Both unchanged TXT controls
stay exact; both restorations return exact source/PNG bytes. The complete1,502-file
isolated checkout restores exactly and the live workspace stays unchanged.

Excluded diagnostics remain retained separately: canonical installed Python has
no pytest, so native suites reuse the existing development ML environment;
initial failure-observer ordering and old exact-signature expectations were
corrected; static annotations/kwargs/lambda typing were corrected. The first
mutation driver did not forward isolated PYTHONPATH into its systemd unit and
therefore stayed GREEN; R2 adds an explicit package-origin assertion. R2's source
identity assertion stopped before generation, so R3 moves that assertion after
publication and requires both target PNGs plus changed RGB. Earlier passes and
R2 mutation phases are not added to accepted unique counts. No setup failure is
reported as semantic RED.

## Retention and release boundary

A no-follow archive retains all7,303 entries of the two exact owned payload roots,
including original PNGs, failed attempts, source snapshots and restored mutation
copies. Archive verification matches every regular byte stream, literal link and
special fixture; its compressed size is30,232,622bytes. Runtime, config, checkpoint
and prior companion dependencies remain protected. Independent final closure review
is CLEAN: source/archive bytes, accepted counts, the unchanged late identity
assertion and independently reopened trained/mutation PNG contrasts reconcile.
That review does not independently rerun native inference or authorize deletion.

ROOT then confirms30 recorded units physically ended, all six readers finished,
all1,502 mutation sources restored, unchanged Python bytes and249 lifecycle records
with zero incoming exact-child dependency. Only the two archived idle roots are
disposed, reclaiming116,465,664 allocated bytes in the deletion-only interval.
The artifact root changes from23,436,922,880 to23,320,457,216 allocated bytes;
new release reports are written afterward. Lifecycle is retained with payloads
empty. No runtime, config, checkpoint, previous companion or business data is
removed. Finalization changes only these three documents; six Python files stay
qualification-exact. Native execution, source review, retained-byte review and
physical release remain separate evidence levels.
