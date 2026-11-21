# Mug reconstruction through VAE before denoising

The [installed Invoke comparison](./phase-4-invoke-ordinary-img-mug-research.md)
reproduced Studio's gray metallic-looking mug and patterned background
on the same ordinary IMG input. The two fixed controls reconstruct that
source through the embedded VAE to test whether encoding and decoding
the source alone produce those changes.

## Fixed inputs and owners

Studio base `bcf4142af266b7fc5acb97140a287a09a8eb118f`.
Re-read clean InvokeAI checkout `4875d96531ca6712b288f6e660fcbb34143408c1`
and installed InvokeAI 6.14.3. Current
`invokeai/frontend/webv2/src/features/generation/core/canvas/compileCanvasGraph.ts`
wires `graftImageToImage` into the SDXL graph and shares a VAE between source
encode and output decode. `core/graph.ts` supplies the SDXL loader's embedded
VAE. Current `invokeai/app/invocations/vae/{image_to_latents,latents_to_image}.py`
encode through `i2l` and invert the latent scale and decode through `l2i`.
The installed release keeps the same invocation owners under
`invokeai/app/invocations` and reads saved latents through
`app/services/shared/invocation_context.py::TensorsInterface.load`.
The control sends one actual graph through the installed image upload and
session-queue API. Its three nodes are `sdxl_model_loader`, `i2l` and `l2i`.
The loader supplies the embedded VAE to the two image nodes. The encode
output supplies the decoder's latent input.

Studio sends one saved ordinary IMG request. Its normalized wire payload
matches the archived neutral IMG after replacing only strength 0.6 with 0.
`worker-python/src/imagegen_worker/inference.py::img2img_pipeline_class`
selects an empty suffix and calls the real Diffusers encoder with no initial
noise. The installed worker's source is byte-identical to the reviewed
checkout. In the installed Diffusers 0.40.0
`StableDiffusionXLImg2ImgPipeline.__call__`, UNet and Euler step calls are
inside the empty loop. The call still decodes the prepared latent. Studio
prepares text conditioning and instantiates the scheduler before that loop.
Invoke's direct graph contains no matching text, noise, or scheduler nodes.

Both controls use the same opaque 512×512 sRGB mug PNG and official
Illustrious XL v0.1 epsilon checkpoint as the earlier runs. Both use the
embedded untiled FP16 VAE. Studio retains the original neutral prompt and
seed 123 for the existing reproducible VAE draw. Invoke samples its VAE
posterior by its installed policy. Three pinned masks and the two earlier
neutral IMG PNGs are reused. Before either launch the comparison freezes
one new request per app, blind inspection of four original outputs, and
an expected corner RGB error no greater than one quarter of the same app's
strength 0.6 result if the pattern requires additional stages. Two separate
serial bounded native services run the VAE controls.

## Results

Both requests **PASS**. Studio publishes one valid PNG with zero denoising
progress events through its original installed worker. Invoke completes one
real queue item. Its observers record one VAE encode and one VAE decode.
The decoder loads the exact name, SHA-256, shape and FP16 type of the
encoder's scaled latent. The noise, initial noise addition, scheduler,
UNet, CFG and Euler step records are empty. The two physical exit receipts
are clean.

Before the key reveal, both observers identify the reconstructions as
the two panels resembling the source, with gray ceramic, an open rim
and handle, and a plain background. Both observers identify the earlier
IMG panels as metallic-looking, with a saturated patchwork background.
The four outputs preserve the general mug geometry.

| Application | Corner RGB error, VAE | Corner RGB error, IMG | VAE/IMG |
| ----------- | --------------------: | --------------------: | ------: |
| Studio      |                0.5939 |               14.6936 |   4.04% |
| InvokeAI    |                0.5940 |               13.2577 |   4.48% |

Errors are mean absolute decoded channel levels versus the common source
on the fixed 25,600-pixel corner mask. Both reconstructions have zero
corner pixels with a channel spread of at least 30, compared with 4,221
and 3,579 in the corresponding IMG results. Mean channel errors across
the 33,304-pixel mug body are about 1.01 in the reconstructions and about
19 in the IMG results. The preregistered corner-error threshold passes in
both controls.

Encoding and decoding the original source alone do not reproduce the
pattern for these exact installed configurations. Attribution is now
bounded to the added-noise and denoising path and its changed latents.
The next comparison can hold a common source latent, raw noise and text
conditioning, then inspect the image or latent after initialization and
the first Euler transitions. This source-level diagnostic leaves human
visual acceptance open.

## Evidence and replay

The Studio and Invoke services took 39.840 and 29.543 seconds. Peak sampled
VRAM was 7,280 MiB and 1,002 MiB respectively, with zero swap. Studio's
ordinary path still loads the full pipeline. The isolated VAE-only graph
loads the component needed by its nodes. These measurements cover the
two finite qualification calls.

The independent audit verified both preregistrations, exact source and
ROI pins, the full checkpoint, Studio's native wire and reopened Project,
the installed empty-schedule source and zero progress receipt, and the
original Invoke graph and its tensor identity. Studio's closed private
SQLite has 30 migrations and empty generation tables. The audit
independently replayed 51 WAL frames across seven commits for Invoke and
verified one completed queue item and two images in its closed snapshot.
Startup and closed database integrity checks passed.

Two focused CPU tests passed, with 88 warnings from the installed test
dependencies. The strength-zero check exercises the real small Diffusers
pipeline and observes no initial scheduler noise or denoising steps.
Typecheck, changed-file ESLint, Ruff, Python compilation, and the
application build passed. Five fixed Studio profiles still match their
retained contracts.

Use the two retained runs at `runs/ordinary-img-mug-vae/20261121-r1`
and `runs/invoke-ordinary-img-mug-vae/20261121-r1`. The shared preregistration,
source and history pins, blind descriptions, measurements, and comparison
page are in the Studio run. The Invoke run retains the actual source
upload, graph, queue, encoded and decoded tensor receipts, and the byte
audit. Cleanup freed 22,691,840 allocated bytes from six idle paths.
The runs retain about 10 MiB together. Reuse a fresh owned profile and
temp root with their exact contracts,
and the prior
[Studio runner](../../scripts/qualify-installed-ordinary-cat-tags.ts),
[Invoke driver](../../scripts/qualify-invoke-mug-img.py), and
[Invoke observers](../../scripts/qualify-invoke-mug-launch.py)
on the frozen Studio base.
