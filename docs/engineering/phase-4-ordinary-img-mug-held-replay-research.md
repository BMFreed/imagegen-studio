# Ordinary mug IMG operators on held inputs

The [original Invoke trajectory](./phase-4-ordinary-img-mug-trajectory-research.md)
captured a plain source reconstruction, visible color fragmentation after
noise addition, and a recognizable patterned background at the terminal
image. This comparison holds the exact original source latent, noise,
and conditioning to check whether the native IMG operators diverge.

## Fixed comparison

Studio base `7a4d25b3ebc356d1da1578af3b40deb53217db69`.
Re-read clean InvokeAI checkout `4875d96531ca6712b288f6e660fcbb34143408c1`
and the installed InvokeAI 6.14.3 source. Current
`invokeai/frontend/webv2/src/features/generation/core/canvas/compileCanvasGraph.ts`
connects the IMG source latent to the ordinary graph at start 0.4.
Current `invokeai/app/invocations/sd/denoise_latents.py` selects the schedule
and calls `invokeai/backend/stable_diffusion/diffusers_pipeline.py` for the
legacy loop. That loop adds noise, scales each model input, delegates
signed UNet work, applies CFG and calls Euler. The installed invocation
lives at `app/invocations/denoise_latents.py`. The pinned installed legacy
pipeline and `backend/stable_diffusion/diffusion/shared_invokeai_diffusion.py`
provide the actual compute definitions for this lane. Installed
`diffusion/conditioning_data.py` and `extensions/preview.py` under
`backend/stable_diffusion` supply its data and callback definitions.
Installed `app/services/config/config_default.py` supplies the attention
configuration defaults for the admitted lane.

The test compiles the installed definitions with their original ASTs.
Its adapter supplies the shared model and scheduler, config values and
callback. It exercises the installed default attention selection on RTX
4080, with the original native SDPA processors. The unchanged loop and
operators consume the held tensors in negative/positive order. The
second lane calls Studio's installed `img2img_pipeline_class` and
`run_sdxl_pipeline` in
`worker-python/src/imagegen_worker/inference.py` and the original
Diffusers 0.40.0 IMG loop. Both lanes share a single CUDA FP16 UNet
from the exact official Illustrious XL v0.1 epsilon checkpoint.

The pinned input is the exact retained 512×512 mug source latent,
original noise, and actual unconditioned/conditioned K77 context,
pooled vectors, and micro-conditioning time IDs. Studio accepts the
four-channel latent through Diffusers' existing latent-input path.
Native Studio CPU seed 123 regenerates the exact held FP16 noise.
No new CLIP encoding, VAE evaluation, or PNG publication is included.
Fresh schedulers select the same 19-step suffix of Euler/leading
from 595 to 1, with strength 0.6 and CFG 5 and rescale 0. One owned
service runs the two lanes serially on the signed Studio runtime.

Observers compare the actual initial sample, noise and noised values,
then the scaled input, actual batched UNet input and output, the CFG
prediction received by Euler, and the next latent. Observe the scalar
or batched timestep form and the batch shape at scaling separately.
The oracle identifies the first observed difference.

## Result

Both lanes finished all 19 steps on the same CUDA 12.6 runtime with
Torch 2.7.1 and Diffusers 0.40.0. Initial noise addition matched
byte for byte. The scaled input, actual UNet input and output, CFG
prediction and Euler output matched on all 19 steps, for 95 exact
per-step comparisons. The FP32 sigma grids also matched. Invoke scales
one sample before batching for CFG and passes a two-element UNet
timestep. Studio scales the two batched samples and passes a scalar
timestep of the same value. Both calls reached the same UNet with
unchanged parameters and produced the same terminal latent.

The earlier Invoke application trajectory uses Torch 2.7.1 with CUDA
12.8. Its retained digests match both new lanes at the initial noised
latent, the first scaled sample and the first actual UNet input.
The first raw UNet output is the earliest observed cross-runtime
difference. Its cause remains unresolved and the terminal latents
also differ. CLIP, VAE sampling and decoding, and the app queue are
outside the held operator run. The earlier recoloring and
background-preservation trial remains visually unqualified.

The initial attempt stopped before model loading when the unchanged
worker parser rejected a target outside the staging directory. The
successful attempt places a verified copy of the exact source PNG in
its owned staging directory. Both attempts are retained. The second
service finished in 22.588 seconds with exit 0, 1,495,142,400 bytes
of peak group RAM, zero swap and 7,490 MiB peak sampled process
VRAM. No processes remained before or after the owned unit stopped.

The CPU control detected a one-element sign change in a retained
Euler output and passed when the original bytes were restored. A
separate signed-zero mutation also registered one changed element.
Ruff, Python compilation, Prettier for the research notes and
acceptance backlog, and the application build passed.

The independent audit checked 145 file bodies, including the full
checkpoint, eight held tensor bodies, 94 signed installation and
configuration pins and the source for 16 executed Invoke AST definitions.
It checked the execution receipts, the reported 19-step tensor digests,
the historical comparison, and physical process exit. The native
comparison ran once through the successful harness. The audit did
not re-execute inference or recompute the current native tensors.

## Retention

`runs/ordinary-img-mug-held-replay/20261121-r1` retains the rejected
staging setup, original preregistration and CPU noise preflight.
`runs/ordinary-img-mug-held-replay/20261121-r2` retains the native
comparison, chart, execution receipts, independent audit, source pins
and CPU comparison controls. Both runs refer to the existing held
tensors, source PNG, checkpoint and installed runtime. Cleanup
released 315,392 allocated bytes from two idle temporary directories.
All 46 sealed files passed SHA-256 verification after cleanup.

## Replay

Use the frozen Studio base and
[`qualify-held-mug.py`](../../scripts/qualify-held-mug.py),
[`qualify-held-mug-invoke.py`](../../scripts/qualify-held-mug-invoke.py),
and [`qualify-held-mug-studio.py`](../../scripts/qualify-held-mug-studio.py).
Reuse the exact retained held inputs and source pins in a fresh owned
run, with the signed Studio interpreter and pinned checkpoint and
configuration. The retained contract and launcher define the scope
and serial resource bound.
