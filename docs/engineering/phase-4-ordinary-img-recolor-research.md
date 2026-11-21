# Ordinary Illustrious IMG recoloring

Both [image-only Regional Reference controls](./phase-4-reference-img-utility-research.md)
preserved the frontal cat shape and left the head mostly gray. This follow-up
tests whether the same source and denoising strength can yield visibly red and
blue heads through ordinary IMG when the color is specified in text.

## Source and preregistration

ImageGen Studio base `b76ffc51ca15ef38fc1acda0071377850d00e148`.
Re-read clean InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1`.
Under `invokeai/frontend/webv2/src/features/generation/core`,
`graph.ts::buildSDGraph` connects the same positive string to SDXL prompt
and style. The caller in `canvas/compileCanvasGraph.ts` constructs the
family graph then calls `graftImageToImage` for opaque IMG. It feeds the VAE
encoder's latents to the denoiser at the processing size and sets the
SDXL start to `1 − strength`. Under `invokeai/app/invocations`,
`text_encoder/compel.py::SDXLCompelPromptInvocation.invoke`
encodes the two strings, `vae/image_to_latents.py::ImageToLatentsInvocation.invoke`
encodes the RGB input, and
`sd/denoise_latents.py::DenoiseLatentsInvocation.init_scheduler` selects the
remaining timesteps. The runner also retains the hashes of the existing
`noise.py` and `latent_noise.py` seed/noise owners. The experiment reuses
Studio's normal saved-Canvas IMG, retained signed installation, and native
worker request. It adds a fixed qualification profile.

The run freezes three ordered requests for neutral, red, and blue. They use
the same opaque 512×512 cat PNG at `(0,0)`, official Illustrious XL v0.1
epsilon, seed 123, Euler/Normal 30 nominal steps, strength 0.5, CFG 5,
Rescale 0, leading with false zero-terminal-SNR, embedded FP16 VAE, and
empty negative. The saved Projects author `regionalGuidance: []`; LoRA,
embeddings, and references are absent. The neutral string is
`a simple illustration of one cat head, front view, two pointed ears, two eyes, plain light background`.
The edits substitute `one red cat head` and `one blue cat head`. The
contract pins the input PNG, earlier neutral PNG and both ROI masks before
the worker runs.

The preregistered visual criterion requires a coherent frontal head with two
ears and two eyes in all three outputs, a neutral head in the control, and
broad, recognizable intended head color in each edit with a plain light
background. Ambiguous color or anatomy is inconclusive. The historical
51,878-pixel head core and 25,600-pixel background corners corroborate
the visual result. Report the count where the red or blue RGB channel
exceeds both other channels by at least 30 in each fixed mask.

## Native and visual results

Native **PASS**. All three requests ran on distinct owned processes of the
signed installed worker. Each reported 16 denoising steps and physically
exited. The neutral PNG reproduced the prior ordinary IMG PNG byte for byte.
The matched colored requests differ only in positive text after normalizing
request identity and staging paths. Peak sampled worker VRAM was 8,168 MiB on
RTX 4080 with driver 615.71.09. The service peaked at 4,023,910,400 bytes of RAM
with zero swap and exited in 90.153 seconds.

Visual **NOT_QUALIFIED**. Two observers described the randomly numbered
original PNGs before the labels were revealed. All three show a frontal gray
head with two pointed ears against a plain cream background. The independent
observer found the eye assignment ambiguous because small dark dots sit above
two larger dark ovals. The red prompt leaves the head gray. The blue prompt
adds a narrow cyan and blue border while the broad fill stays gray.

| Prompt  | Head-core mean RGB       | Strong red pixels | Strong blue pixels |
| ------- | ------------------------ | ----------------: | -----------------: |
| Neutral | (131.19, 132.82, 120.93) |                 0 |                  0 |
| Red     | (128.37, 131.71, 119.62) |                 0 |                  0 |
| Blue    | (130.60, 134.46, 121.35) |                 0 |                  0 |

Both background-corner counts also remain zero in every output. The red and
blue edits change 230,769 and 254,554 decoded RGB pixels respectively versus
neutral across the complete raster. Those differences coexist with zero
strong target-color pixels inside the head core. The two historical
reference-image outputs still have zero strong red and blue head-core pixels.

This source at strength 0.5 fails as an ordinary positive recoloring control.
The weak reference-only result therefore does not isolate the adapter as the
cause. The next diagnostic is to test an increased ordinary IMG
strength against the same geometry and color criteria before authoring another
matched reference pair. Human visual acceptance remains open.

## Checks and evidence

All 172 focused tests passed. Typecheck, lint of the two changed TypeScript
files, and the application build passed. The retained run is
`runs/ordinary-img-recolor/20261121-r1` under the artifact root. It includes
the exact contract and preregistration, PNG originals, saved `.igs` packages,
capture handoffs, wire receipts, the closed SQLite snapshot, blind panel
descriptions and key, reproducible color measurements, and a local comparison
page linking the three new outputs and the earlier reference results.
An independent byte and process audit verified the three saved packages,
targets, output profiles, normalized wire requests, 30 migration records,
empty queue/candidate/seed tables, and termination of Main and the three
workers. It rehashed the full checkpoint, installed payload, signed
configurations, and Studio and Invoke source pins. Cleanup released 5,492,736
allocated bytes from five finished temporary paths. The retained run
occupies about 1.3 MiB.

## Replay

Use the frozen application base and the delivered
[`qualify-installed-ordinary-cat-tags.ts`](../../scripts/qualify-installed-ordinary-cat-tags.ts)
and
[`regional-guidance-character-visual-probe.ts`](../../src/main/projects/test-fixtures/regional-guidance-character-visual-probe.ts).
Create a fresh owned `runs/ordinary-img-recolor/<date>-rN` with
`payloads/`, the exact `experiment-contract.json`, and `cat-source.png`.
Use `node --import tsx scripts/qualify-installed-ordinary-cat-tags.ts --run <run>`
in a 12 GiB zero-swap user service with a 600-second deadline and a short
owned temporary directory. The retained engine, checkpoint, and prior IMG
control are pinned dependencies. The private direct-worker path leaves
the public queue and Project acceptance for later acceptance work.
