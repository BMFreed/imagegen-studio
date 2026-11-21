# Locating the patterned mug background in an ordinary IMG trajectory

The [VAE-only controls](./phase-4-ordinary-img-mug-vae-research.md)
preserved the plain background in Studio and installed InvokeAI.
The [ordinary IMG comparison](./phase-4-invoke-ordinary-img-mug-research.md)
showed a patterned background in both applications at strength 0.6.
This diagnostic follows one real Invoke trajectory to locate the earliest
sampled stage with the recognizable pattern.

## Fixed run and stage captures

Studio base `10b523ab9557254547a84817982fb40dca18d229`.
Re-read clean InvokeAI checkout `4875d96531ca6712b288f6e660fcbb34143408c1`
and installed InvokeAI 6.14.3. Current
`invokeai/frontend/webv2/src/features/generation/core/canvas/compileCanvasGraph.ts`
connects the source encoder to the ordinary SDXL denoiser and maps
strength 0.6 to start 0.4. Under `invokeai/app/invocations`,
`sd/denoise_latents.py::DenoiseLatentsInvocation.init_scheduler`
selects the suffix and `_old_invoke` calls
`invokeai/backend/stable_diffusion/diffusers_pipeline.py::latents_from_embeddings`.
That pipeline calls the scheduler's `add_noise` before the loop,
and later assigns `step_output.prev_sample` to the next latent.
The installed release follows these same owners, with its invocations
directly under `app/invocations`. The exact installed numerical
owners are Diffusers 0.40.0 `schedulers/scheduling_euler_discrete.py`,
`models/autoencoders/autoencoder_kl.py` and `image_processor.py`.
The native decoder uses the installed `latents_to_image.py`
scaling, denormalization and quantization.

Use the exact neutral prompt and opaque 512×512 source from the previous
comparison, official Illustrious XL v0.1 epsilon, seed 123, CFG 5,
rescale 0 and embedded untiled FP16 VAE. The serial service runs
one real ordinary graph at strength 0.6 and observes its full 19-step
Euler suffix from 595 to 1. The original graph uses its own VAE posterior
sample. The recorder retains the exact source latent passed to
`add_noise`, the actual noise and initial noised state, the first
native UNet's conditioning, pooled embeddings and time IDs, and
`prev_sample` from steps 1, 2, 4, 8 and 19. All snapshots come from
that single chain. The driver checks the chronological hash chain and
requires the actual conditioning to stay fixed across the 19 forwards.

Six supplemental VAE decodes run after the graph's actual terminal decode.
Each uses the same resident native AutoencoderKL and the installed
scale and output conversion. The terminal preview uses the real
terminal decoder tensor after verifying the held latent's exact
unscaled bytes against the original input. Its RGB and RGBA must
match the original queue PNG byte for byte after decoding the PNGs.

The preregistration freezes the seven captures and eight shuffled
panels, which include the original terminal PNG. The common input is
shown separately. Blind readers distinguish recognizable structured
pastel fragments from incidental color in still-noisy intermediate
latents. The numeric corroboration uses the original three masks and
reports channel spread and mean absolute channel error. A partially
noisy latent decode is a diagnostic frame. A gap between sampled
steps limits the precision of onset.

## Result

Native **PASS**. Invoke completed one actual ordinary queue item with
19 original Euler steps. The initial add-noise output is the input to
the first step. Every subsequent input matches the previous step's
output. The recorded context, pooled embeddings, and time IDs stay
fixed across the chain. They and the noise also match the earlier neutral
Invoke job's digests. The new job uses its own source VAE posterior sample.

The blind readers agree that the source latent decodes to a plain
background and gray ceramic. Immediately after adding noise, the preview
already shows dense multicolored blobs with the mug mostly obscured.
The first, second, and fourth steps retain that dense texture. By step 8,
the mug shape and emerging mosaic are both readable, with fragments
extending across the mug as well as the background. The mature pastel
pattern remains ambiguous at this checkpoint. Both readers clearly
identify the distinct pastel background and metallic-looking body at
step 19 and in the original queue PNG.

| Sampled state        | Corner mean RGB error | Corner pixels with channel spread ≥30 |
| -------------------- | --------------------: | ------------------------------------: |
| Before initial noise |                  0.59 |                                     0 |
| After initial noise  |                 56.11 |                                 7,064 |
| After Euler step 1   |                 51.56 |                                 6,900 |
| After Euler step 2   |                 47.56 |                                 6,906 |
| After Euler step 4   |                 40.23 |                                 7,470 |
| After Euler step 8   |                 29.57 |                                 8,966 |
| After Euler step 19  |                 13.86 |                                 3,723 |

Mean absolute error is measured against the input on the same
25,600-pixel corner mask. The count of colorful pixels is higher in some
noisy captures than in the final PNG. The visual result distinguishes those
captures from the recognizable finished pattern.

This trajectory establishes visible color fragmentation at initialization,
a mosaic-like transition by step 8, and the clear terminal pattern by
step 19. The exact onset of the finished pattern within the intervening
steps remains unresolved. The snapshots do not establish a faulty
scheduler operation or isolate the effect of prompt conditioning.
The [held-input follow-up](./phase-4-ordinary-img-mug-held-replay-research.md)
compares those retained inputs through all 19 steps and finds byte-exact
operator outputs on one shared runtime. Human visual acceptance remains open.

## Checks and retention

The owned service finished in 34.773 seconds. It peaked at 5,171,093,504
bytes of RAM with zero swap and sampled the Invoke PID at up to 6,758 MiB
of VRAM. Invoke exited normally on SIGINT and the cgroup was empty.

The independent byte audit confirmed the actual upload, graph, completed
queue item, all 19 transitions, and eleven finite FP16 tensor bodies.
It independently unscaled the terminal latent and matched the native
decoder input hash. The terminal preview is RGB and RGBA byte-exact
to the queue PNG after PNG decoding. The audit also checked the full
checkpoint and source pins, seventeen installed Invoke source pins,
three Diffusers source pins and seventeen offline cache files. It
replayed 66 committed WAL frames across seven commits and matched
the closed snapshot, with one completed job and two images.

Ruff, Python compilation, the application build, and static controls
for trace, raw pin, and terminal-pixel drift passed. The run at
`runs/invoke-ordinary-img-mug-trajectory/20261121-r1` retains the PNGs,
raw captures, graph and queue receipts, packaged source pins, SQLite
snapshot and original WAL, blind descriptions, measurements, and
the eight-panel stage comparison. The raw FP16 captures total 898,072
bytes. Cleanup freed 20,283,392 allocated bytes from the isolated app root
and blind-panel copies. The retained run occupies about 12 MiB.

## Replay

Use the frozen Studio base and the current
[`qualify-invoke-mug-img.py`](../../scripts/qualify-invoke-mug-img.py)
and
[`qualify-invoke-mug-launch.py`](../../scripts/qualify-invoke-mug-launch.py).
The retained run has the fixed trajectory contract, exact installed
source pins, offline cache preparation and bounded launcher. Use fresh
owned isolated application and run roots. The original source and
checkpoint stay at the exact paths pinned by the contract.
