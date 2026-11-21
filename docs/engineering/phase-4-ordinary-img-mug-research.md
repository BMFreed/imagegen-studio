# Ordinary Illustrious IMG recoloring on a ceramic mug

The [cat source](./phase-4-ordinary-img-strength-research.md) kept its outline
at strength 0.5 and lost facial and background detail at 0.75. Both trials
missed the color criterion. This follow-up changes the source and subject
and picks one strength of 0.6 before execution. It tests for an ordinary
positive control on a familiar shape with a broad neutral ceramic surface,
a handle opening, and a simple tabletop.

## Source and fixed experiment

ImageGen Studio base `4c3b1aab0021046ba332a1dad34077e8017d25b2`.
Re-read clean InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1`.
Under `invokeai/frontend/webv2/src/features/generation/core`,
`graph.ts::buildSDGraph` routes the positive text to both SDXL prompt and
style. The opaque IMG caller in `canvas/compileCanvasGraph.ts` grafts an
image-to-latents encoder onto that graph. Its `canvasDenoisingStart`
sets `1 − strength`, and `sdxlRefiner.ts::getBaseDenoisingRange` supplies
the end of 1 for the base model. Under `invokeai/app/invocations`,
`vae/image_to_latents.py::ImageToLatentsInvocation.invoke` encodes the
source, `text_encoder/compel.py::SDXLCompelPromptInvocation.invoke`
encodes the text, and
`sd/denoise_latents.py::DenoiseLatentsInvocation.init_scheduler` cuts the
selected schedule at that start. Studio's installed
`worker-python/src/imagegen_worker/inference.py` uses the same cutoff in
the ordinary `generate_illustrious_img2img` path. The existing Euler/leading
schedule of 30 nominal steps has 19 remaining at strength 0.6, from
timestep 595 down to 1.

The source is one ImageGen fixture generation of a photorealistic unbranded
gray mug. The retained original is 1254×1254, SHA-256
`c60e7d773d5cbbf1f6b0c004cdf195b3813c0df8628f4d37271a5ecf6cfe7d16`.
The preparation receipt records the single Lanczos resize and opaque RGBA
PNG with Studio's sRGB profile. The 512×512 file has SHA-256
`c60751aa01b763158f3d25788b9541e3ee5859e30ae56fb92290bb705d3ea3b5`.
The source generation prompt and both images are retained. All evaluated
IMG outputs come from Studio's installed native worker.

The three saved Projects author `regionalGuidance: []` with the same
source, official epsilon Illustrious XL v0.1, `(0,0)` origin, seed 123,
Euler/Normal 30, CFG 5, Rescale 0, leading, false ZTSNR, embedded FP16 VAE
and empty negative. They are executed in neutral, red, blue order. The
only positive text change replaces `gray glazed` with `red glazed` or
`blue glazed` in the fixed literal. No external VAE, LoRA, embeddings,
or adapters enter the requests.

Two observers describe the three shuffled original outputs before label
reveal. All cases must preserve one centered upright mug, the open rim,
a single right handle with readable gap, and a plain light background.
The neutral mug must look gray. Both edits must broadly recolor the
ceramic in the intended hue. Numeric controls require the intended
channel to lead by at least 30 in at least half the fixed body core.
The gray core, handle opening, and background masks allow at most 5%
unwanted dominance. The body mask covers 33,304 pixels, the handle
opening 3,910, and the background corners 25,600. Masks and thresholds
are frozen before submission. The known coordinates can record shape
drift as color, so the numeric result and blind geometry criterion both
apply.

## Result

Native **PASS**. All three saved `.igs` packages reopened and produced
byte-identical targets. The normalized requests differ only in positive
text. Three distinct workers each sent 19 denoising progress events and
physically exited. The installed worker peaked at 8,168 MiB on
RTX 4080 with driver 615.71.09. The service peaked at 8,989,773,824 bytes
of host RAM with zero swap and finished in 124.937 seconds.

Visual **NOT_QUALIFIED**. Both readers described one upright mug of roughly
the original scale and position, a visibly open rim and the right handle
with background visible through its opening. The red and blue outputs
retain a broadly gray or olive-gray body with colored rim accents. All
three, including neutral, make the surface look metallic and replace the
plain backdrop with dense pastel shapes, speckles and streaks.

| Prompt  | Strong red in body core | Strong blue in body core | Strong red in corners | Strong blue in corners |
| ------- | ----------------------: | -----------------------: | --------------------: | ---------------------: |
| Neutral |                       0 |                        0 |                   469 |                     59 |
| Red     |                       0 |                        0 |                   386 |                     67 |
| Blue    |                       0 |                        0 |                   702 |                    105 |

The handle-opening mask had zero strong red and blue pixels across all
three outputs. Both colored variants missed the 50% body criterion.
The corner mask stayed below its numeric limit while the blind reviewers
still saw a visibly changed background. One subject, seed, strength, and
one phrase per color are covered. Human visual acceptance remains open.

This leaves no positive ordinary control for the matched Regional
Reference comparison. For the next comparison, the read-only preflight
confirmed the installed InvokeAI 6.14.3 environment and matched all 17
offline configuration and tokenizer pins from the
[previous application reference](./phase-4-illustrious-invoke-application-research.md)
against the signed Studio installation. The installed image upload and
`i2l` owners can feed the exact mug PNG to its own IMG graph. This will
compare observable application behavior. Causal attribution also needs
a common-runtime comparison of the original denoiser and Studio with the
same VAE source latent, noise, conditioning, and Euler schedule.

## Checks and retained evidence

All 172 focused tests, typecheck, scoped lint, and application build passed.
All four private profiles still match their exact retained contracts.
The independent byte audit reconstructed the source from the ImageGen
original, rechecked the three masks, the exact normalized wire differences,
the `.igs` packages and all 19-event progress sequences. It checked the
closed SQLite and its 30 migration hashes, confirmed physical exit of Main
and the three workers, and verified the checkpoint, 77 installed files,
17 signed configuration files, nine Studio sources, and seven Invoke sources.

The retained run is `runs/ordinary-img-mug-recolor/20261121-r1`. It contains
the ImageGen original and exact prompt, the canonical PNG and three masks,
preregistration, PNGs and saved Projects, request and process receipts,
the closed SQLite, measurements, blind descriptions, and a four-panel
comparison with a color-coverage chart.
Cleanup reclaimed 6,443,008 allocated bytes from five verified idle
temporary paths. The retained run occupies about 7.1 MiB.

## Replay

Use the frozen Studio base and the delivered
[`qualify-installed-ordinary-cat-tags.ts`](../../scripts/qualify-installed-ordinary-cat-tags.ts)
and
[`regional-guidance-character-visual-probe.ts`](../../src/main/projects/test-fixtures/regional-guidance-character-visual-probe.ts).
Create a fresh owned `runs/ordinary-img-mug-recolor/<date>-rN` with
`payloads/`, the exact `experiment-contract.json`, `mug-source.png`, and
all three mask PNGs. Invoke
`node --import tsx scripts/qualify-installed-ordinary-cat-tags.ts --run <run>`
in a 12 GiB, zero-swap user service with a 600-second deadline and a short
owned temporary directory. The qualification borrows the verified installed
engine and checkpoint at their exact paths.
