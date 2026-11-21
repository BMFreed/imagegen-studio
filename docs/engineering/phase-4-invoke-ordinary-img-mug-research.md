# Ordinary mug IMG through the installed InvokeAI application

The [Studio mug experiment](./phase-4-ordinary-img-mug-research.md) preserved
the outline and openings of the gray mug. Red and blue prompts left the body
gray and all three results replaced the plain background with a pattern.
Run the same three prompts and source through the installed InvokeAI application
to see which observations carry over.

## Fixed inputs and source owners

ImageGen Studio base `0a54cc6be9711c070201ccd39b9a7112aa584316`.
Re-read clean InvokeAI checkout `4875d96531ca6712b288f6e660fcbb34143408c1`.
Under `invokeai/frontend/webv2/src/features/generation/core`,
`graph.ts::buildSDGraph` sends the positive and negative strings through
both SDXL CLIP encoders. The opaque IMG caller in
`canvas/compileCanvasGraph.ts` grafts `i2l` into the family graph and connects
the same VAE to encode and decode. `canvasDenoisingStart` maps strength 0.6
to start 0.4, and `sdxlRefiner.ts::getBaseDenoisingRange` supplies the end of
1 when the refiner is absent. Current backend owners include
`app/invocations/vae/image_to_latents.py`, `app/invocations/sd/denoise_latents.py`,
`app/invocations/text_encoder/compel.py`, and
`backend/stable_diffusion/diffusers_pipeline.py::latents_from_embeddings`.

The executed app is the separate installed InvokeAI 6.14.3. Its corresponding
VAE, denoiser and Compel modules live directly under
`invokeai/app/invocations`; API entry points live in
`app/api/routers/{images,model_manager,session_queue}.py`. The launch uses
`app/run_app.py::run_app`. The caller follows the same installed
[application qualification](./phase-4-illustrious-invoke-application-research.md)
for isolated startup, real checkpoint registration, queue and result retrieval.
The graph adds the real image upload and VAE encoding path.

The preregistration pins the same opaque 512×512 mug PNG, the checkpoint
Illustrious XL v0.1 epsilon, the three exact Studio prompt strings, and the
empty negative. Seed 123, CFG 5, rescale 0, embedded untiled FP16 VAE and the
19 selected steps of Euler/leading from 595 to 1 match the Studio settings.
There are three serial graph requests in neutral, red, blue order. Both the
source PNG and the returned upload are checked in decoded RGB and RGBA.
The two products keep their installed Torch/Diffusers versions and their own
VAE posterior and noise handling. The Invoke VAE draws from its own RNG
while the Studio worker clones the seeded generator. The comparison uses
common external inputs and records these execution differences.

The observed app uses a separate localhost listener and owned database,
output and cache roots. The controller registers the checkpoint in place
and copies 17 verified offline configuration/tokenizer files into the
owned cache. It launches one bounded service with 12 GiB RAM, zero swap and
a 600-second deadline. The launch path delegates computation to the
installed operators and records tensor hashes, graph/queue identities,
model/scheduler configuration, and the actual encode-to-decode sequence.

The reference, three Studio outputs and three Invoke outputs go through
the same blind visual review. The three fixed measurement masks and the
visual rubric are carried over as written. The intended channel must lead
by at least 30 over at least half the body core, and the geometry and plain
background must survive. The closing quality verdict depends on both the
original images and the numeric checks.

## Result

Native **PASS**. The real upload and retrieval preserve every decoded
RGB and RGBA byte of the source. Invoke re-encodes the PNG and omits its
ICC profile. Its three output PNGs also omit the profile. The retained
Studio results carry the Studio sRGB ICC. All three Invoke queue items
completed through the original graph. Each ran 19 Euler transitions and
19 UNet forwards, with one VAE encode, one noise draw, one initial
`add_noise` and one decode. The observed scheduler used epsilon,
scaled-linear betas, leading spacing with offset 1, false zero-terminal-SNR,
and the exact suffix 595 through 1.

The normalized image tensor and VAE posterior mean match across the three
Invoke jobs. The FP16 CPU noise also matches. Each VAE posterior sample
and resulting first noised latent differs. The text conditioning differs
by case. The execution therefore demonstrates the result of the installed
application with its ordinary sampling policies.

Visual **NOT_QUALIFIED** in both applications. Before revealing the key,
both readers grouped the six results into the same three pairs based on
the shape and placement of the reflections and scuffs. Each pair
corresponds to the same prompt across the two applications. Every result
keeps an upright mug with an open rim and a visible handle gap, gives the
body a gray metallic appearance, and replaces the plain background
with a bright pattern. Neither color prompt recolors the broad body.

| Application | Red pixels in red body core | Blue pixels in blue body core |
| ----------- | --------------------------: | ----------------------------: |
| Studio      |                 0 of 33,304 |                   0 of 33,304 |
| InvokeAI    |                 0 of 33,304 |                   0 of 33,304 |

The numerical corner masks meet the 5% red/blue bounds in each app.
The blind review still sees the pattern in every result. The exploratory
mean absolute decoded RGB differences within the same-prompt pairs are
4.40, 3.79, and 4.61 channel levels for neutral, red, and blue. The
different-prompt comparisons range from 8.03 to 9.05 channel levels.
The source, model, seed, prompts, and visible settings in this experiment
produce the same visual failure in both applications. The comparison
leaves the responsible stage open. A VAE-only encode/decode control on the
same source can test whether the pattern appears before the first denoising
step. If the pattern requires denoising, compare the original Invoke and
Studio paths with the same fixed source latent, noise, and conditioning.

## Verification and retention

The normal SIGINT path exited with status 0. No owned process remained
before the unit stopped. The service finished in 43.704 seconds, with
6,966,607,872 bytes of peak RAM, no swap, and 6,754 MiB peak sampled VRAM
for the server PID on RTX 4080 driver 615.71.09.

The independent audit checked all three submitted, accepted and embedded
graphs, completed queue and output identities, the full checkpoint, the
input and output bytes, and 57 Euler, UNet and CFG events. It verified
three Studio, eight current Invoke, sixteen installed Invoke, five executed,
and seventeen offline config file pins. Invoke left committed SQLite WAL
and SHM after normal exit. The retained main/WAL/SHM triplet is exact.
The closed SQLite snapshot was made through SQLite backup from a private
copy of the triplet. The audit independently replayed 175 committed
WAL frames across seventeen commits and matched the logical contents:
three completed jobs, four images and one in-place registered model.
The startup backup and full snapshot passed integrity and foreign-key checks.

Ruff, Python compile checks, and the application build passed. The run under
`runs/invoke-ordinary-img-mug/20261121-r1` retains the three original Invoke
outputs, exact upload roundtrip, original graph and queue receipts, measured
tensors, source pins, database evidence, blind descriptions and key, and a
side-by-side comparison with all six outputs. The scope is the fixed source
and this installed Invoke release. Human visual acceptance remains open.
Cleanup released 19,693,568 allocated bytes from the isolated application
root and blind-panel copies. The retained run occupies 9.0 MiB.

## Replay

Use the frozen Studio base and the delivered
[`qualify-invoke-mug-img.py`](../../scripts/qualify-invoke-mug-img.py)
and
[`qualify-invoke-mug-launch.py`](../../scripts/qualify-invoke-mug-launch.py)
with the retained contract, fixture preparation and resource boundary.
Replay requires fresh owned run and app roots, the same installed Invoke
environment, and the exact borrowed checkpoint and source/configuration
files. Keep the original and isolated application roots distinct.
