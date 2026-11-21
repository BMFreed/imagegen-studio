# Illustrious IMG strength and recoloring

The [ordinary IMG experiment at strength 0.5](./phase-4-ordinary-img-recolor-research.md)
reproduced the neutral output. Its red and blue prompts left the head gray.
This follow-up tests whether an earlier denoising start gives the same
Illustrious XL v0.1 checkpoint enough room to apply both colors while
retaining the frontal head and plain background.

## Fixed comparison

ImageGen Studio base `dc2cfc68557f8c375bc47da5e1aa1ba162756f05`.
Re-read clean InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1`.
Under `invokeai/frontend/webv2/src/features/generation/core`,
`graph.ts::buildSDGraph` supplies SDXL text conditioning,
`canvas/compileCanvasGraph.ts::graftImageToImage` connects the source VAE
latents to the family denoiser, and its caller applies the graft for opaque
IMG. `canvasDenoisingStart` passes `1 − strength` through
`sdxlRefiner.ts::getBaseDenoisingRange`. Under `invokeai/app/invocations`,
`sd/denoise_latents.py::DenoiseLatentsInvocation.init_scheduler` slices
the schedule at the rounded training timestep cutoff.
`vae/image_to_latents.py::ImageToLatentsInvocation.invoke` encodes the image,
`text_encoder/compel.py::SDXLCompelPromptInvocation.invoke` encodes prompt
and style, and `noise.py::NoiseInvocation.invoke` calls
`latent_noise.py::generate_noise_tensor` with the seed and latent shape.

Studio reuses its installed `worker-python/src/imagegen_worker/inference.py`
through `generate_illustrious_img2img`, `run_sdxl_pipeline`, and
`img2img_pipeline_class`. The fixed Euler/leading profile has 1,000 training
timesteps and a steps offset of 1. With 30 nominal steps, the schedule is
`33k + 1` for `k` from 29 to 0. At strength 0.5 it starts at timestep 496
and executes 16 steps. At strength 0.75 it starts at 727 and executes 23.
The existing pipeline clones the frozen CPU generator state for the VAE
posterior and uses the original generator for initial noise.

The qualification profile preregisters exactly three calls at strength
0.75, in order: neutral, red, blue. Each keeps the matching positive literal,
empty negative, same source and model bytes, 512×512 at `(0,0)`, seed 123,
Euler/Normal 30, CFG 5, Rescale 0, and embedded FP16 VAE. The saved Projects
author `regionalGuidance: []`. No LoRA, embeddings, or adapters enter the
requests. Before each submission the runner verifies the matching 0.5 wire
receipt by pinned hash, and compares all request fields after normalizing
the identifier and staging paths. The only allowed behavioral difference is
`denoisingStrength`.

The visual gate requires a coherent centered frontal head, two ears, two
distinguishable eyes and a plain light background. Neutral should stay gray.
Both red and blue should recolor the broad head fill. A missing color, edge
accent alone, or lost geometry fails the corresponding arm. Six original
PNGs from both strengths are shuffled together for blind reading. The two
historical masks stay in fixed source coordinates. The counts of pixels where
the intended channel leads by at least 30 corroborate visual observations and
can include background if the shape changes.

## Result

Native **PASS**. Three new CUDA workers completed 23 steps each and physically
exited. All three captured targets are byte-identical to the original PNG.
The wire audit confirms that each strength pair differs only in
`denoisingStrength` after normalization. Sampled peak VRAM was 8,168 MiB
on RTX 4080 with driver 615.71.09. The service peaked at 9,480,851,456 bytes
of RAM with zero swap and completed in 268.235 seconds.

Visual **NOT_QUALIFIED**. The independent observer received all six original
PNGs in numbered order and recorded descriptions before seeing the key. At
0.75 all panels retain the centered round outline and two ears. The eye
regions and face details distort, and new protrusions and detached marks
break the plain background even with the neutral prompt. The red prompt
adds orange/gold patches, while the blue prompt gives the face a muted teal
cast. Neither produces broad intended head color with preserved geometry.
The 0.5 set retains its basic frontal shape and undecorated background.

| Strength | Prompt  | Strong red in head core | Strong blue in head core |
| -------- | ------- | ----------------------: | -----------------------: |
| 0.5      | All     |                       0 |                        0 |
| 0.75     | Neutral |                       9 |                       13 |
| 0.75     | Red     |          7,128 (13.74%) |                      171 |
| 0.75     | Blue    |                   2,821 |              228 (0.44%) |

Each head-core count is out of 51,878 pixels. The corner mask has 25,600
pixels. At 0.75 the red and blue prompts add 86 and 183 strong-blue corner
pixels respectively, with no strong-red corner pixels. The channel counts
also capture saturated details such as the orange and gold patches.

This source yielded a stable silhouette at 0.5 and distorted details at
0.75. Both settings failed to provide a positive ordinary recoloring
control. Choose a different preregistered source with a readable,
recolorable subject for the next ordinary gate before comparing Regional
Reference assignments. Human visual acceptance remains open.

## Verification and retained evidence

All 172 focused tests passed. The older TXT and IMG contracts and the new
strength contract matched their exact retained JSON. Typecheck initially
found a too-narrow fixture type for previous sampling contracts. The
correction changes only that annotation. The emitted JavaScript was
byte-identical before and after in TypeScript and tsx's esbuild dependency.
Final typecheck, scoped lint, and application build passed.

The independent byte audit verified the three saved Projects and normalized
requests, the 23-event progress sequences, the closed SQLite with 30
migrations and empty execution tables, and physical exit of Main and all
three workers. It rehashed 77 installed files, 17 signed configuration
files, the full checkpoint, nine Studio files and seven Invoke files. The
installed inference module equals the Studio source.

Retained evidence is under `runs/ordinary-img-recolor-strength/20261121-r1`.
It has the contract, source and schedule receipts, exact PNGs and Projects,
the SQLite snapshot, six blind observations and their key, measurements
and the side-by-side comparison. Both strengths can be reviewed there.
Cleanup reclaimed 6,279,168 allocated bytes from five idle temporary
paths after physical-exit verification. The retained run is about 1.7 MiB.

## Replay

Use the frozen application base and the delivered
[`qualify-installed-ordinary-cat-tags.ts`](../../scripts/qualify-installed-ordinary-cat-tags.ts)
and
[`regional-guidance-character-visual-probe.ts`](../../src/main/projects/test-fixtures/regional-guidance-character-visual-probe.ts).
Create a fresh owned `runs/ordinary-img-recolor-strength/<date>-rN` with
`payloads/`, the exact `experiment-contract.json`, and `cat-source.png`.
Run `node --import tsx scripts/qualify-installed-ordinary-cat-tags.ts --run <run>`
in a 12 GiB zero-swap user service with a 600-second deadline and a short
owned temporary directory. The historical run, original source masks,
signed installation, and checkpoint stay at their pinned paths.
