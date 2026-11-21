# Ordinary mug IMG with explicit color emphasis

The [unweighted mug experiment](./phase-4-ordinary-img-mug-research.md)
kept a readable mug and missed the red and blue recoloring targets.
Both installed applications produced the same visual failure, and a
[held-input comparison](./phase-4-ordinary-img-mug-held-replay-research.md)
matched their denoising operators. This experiment asks whether the
existing attention syntax gives a usable ordinary IMG control before
another regional reference trial.

## Fixed experiment

ImageGen Studio base `f3dc43e43ed4c0d1739c9b1bddbc48217155b154`.
Re-read clean InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1`.
`docs/src/content/docs/Users Guide/04.Image Generation/advanced-prompt-syntax.mdx`
documents explicit numeric Compel weights. Under
`invokeai/frontend/webv2/src/features/generation/core`,
`graph.ts::buildSDGraph` routes the signed text to both SDXL prompt
and style, and `canvas/compileCanvasGraph.ts::graftImageToImage`
connects the source encoder and updates the denoising range.
`invokeai/app/invocations/text_encoder/compel.py::SDXLPromptInvocationBase.run_clip_compel`
parses the prompt for sequence conditioning and sends the string
to the pooled encoder. Studio's
`worker-python/src/imagegen_worker/inference.py::build_sdxl_conditioning`
uses the installed Compel through both CLIP encoders before
`generate_illustrious_img2img` delegates to the ordinary IMG pipeline.

The three fixtures keep the exact opaque 512×512 mug PNG, official
Illustrious XL v0.1 epsilon checkpoint, mask bytes, seed 123, Euler/Normal
30, CFG 5, rescale 0, strength 0.6, embedded FP16 VAE and empty negative.
The saved Projects author `regionalGuidance: []`. The gray prompt is
unchanged. In the two edit prompts, only the color adjective is wrapped
as `(red)2.0` or `(blue)2.0`. The run ceiling is three native jobs with
the existing 19-step schedule.

The installed Compel 2.4.0 CPU preflight parses just the adjective with
weight 2.0. The sequence token IDs remain identical to the matching
unweighted prompt on both pinned tokenizers, at 32 tokens including the
special tokens. The CLIP2 pooled provider tokenizes the syntax-bearing
string and sees 37 tokens. The comparison varies the authored positive
field and includes both effects of that change.

The preregistered treatment gate keeps the original thresholds. An edit
must preserve the upright pose, open rim, right handle and its visible
gap, and plain light background. The intended channel must lead the
other channels by at least 30 levels across at least 50% of the pinned
body core. Red and blue pixel coverage must each remain at or below 5%
in the handle opening and corners. Two blinded readers check the
actual hue, geometry and background. The gray control must reproduce
the earlier neutral PNG byte for byte, including its existing
background pattern. The earlier all-three rubric is also tracked.
One successful edit would give a candidate for that hue. The matched
red/blue comparison requires both edits to pass.

## Results

Native **PASS**. The Main fixture saved and reopened three Projects,
and three distinct installed workers completed 19 steps each. Each
generation used the exact source bytes. The neutral PNG and its
decoded RGBA match the earlier unweighted neutral byte for byte.
The two weighted images have distinct image hashes. The service
completed in 99.679 seconds with 9,140,576,256 bytes of controller
cgroup peak memory, zero swap, and 8,168 MiB maximum sampled worker
VRAM on RTX 4080 with driver 615.71.09. The controller and workers
exited normally.

Visual **NOT_QUALIFIED**. Both blinded readers see one upright mug,
an open rim and the visible gap of its right handle in all cases.
Both weighted edits retain a metallic-gray body with rim and edge
accents. The light background still has a dense pastel pattern.

| Edit | Unweighted body pixels | Body pixels at weight 2.0 | Required body pixels |
| ---- | ---------------------: | ------------------------: | -------------------: |
| Red  |            0 of 33,304 |               0 of 33,304 |     16,652 of 33,304 |
| Blue |            0 of 33,304 |               0 of 33,304 |     16,652 of 33,304 |

Both edits meet the numeric red/blue bounds in the corners and
handle opening. The plain-background criterion still fails under
blind inspection. Neither edit yields a positive ordinary control
for a matched regional reference comparison on this scene. This
result covers the fixed subject, seed, strength and two authored
weights. Human visual acceptance remains open.

## Installed InvokeAI comparison

The installed InvokeAI 6.14.3 application accepted the same source
through its real upload API and preserved decoded RGB and RGBA.
The real queue executed the three preregistered ordinary IMG graphs.
The submitted, enqueued and embedded graphs contain the matching
literal positives, including `(red)2.0` and `(blue)2.0`. All three
executed the 19 Euler transitions from 595 through 1 and published
original PNGs. Each app used its own installed runtime, VAE posterior
sampling and PNG encoding.

The two readers inspected the six randomized originals before the
mapping was revealed. All six preserve an upright mug, open rim and
right handle gap, leave the body gray with narrow color accents and
show a patterned light backdrop.

| Application | Red body pixels in red edit | Blue body pixels in blue edit |
| ----------- | --------------------------: | ----------------------------: |
| Studio      |                 0 of 33,304 |                   0 of 33,304 |
| InvokeAI    |                 0 of 33,304 |                   0 of 33,304 |

The user decided to remove exact prompt-only recoloring in ordinary
IMG from the product goals after this matched result. The regional
visual gate moves to a separate fixed scene that demonstrates
recognizable spatial influence. The comparison establishes the
result for this source, model, prompt pair, seed and strength.
[Product scope](../specs/00-product-scope.md#продуктовые-нецели-mvp).

Invoke exited normally on SIGINT. The wrapper had exit 0 with no
remaining cgroup members. It finished in 40.048 seconds with
7,298,048,000 bytes of group peak memory, zero swap and 5,834 MiB
sampled peak VRAM. Its independent audit checked the exact graphs,
source and output bytes, checkpoint and source/configuration pins,
57 observed Euler, UNet and CFG events, and physical exit. It replayed
175 committed WAL frames over 17 commits and matched the logical
contents of the closed database.

## Checks and retention

The independent byte audit checked the three prior requests and
all three current requests. The treatment pairs differ in the
positive text and per-request identities and staging paths. The
audit verified the preregistration and decision guide, the exact gray
replay, the source reconstruction and masks, the full checkpoint,
77 installed runtime and 17 signed configuration pins, nine
Studio and seven current Invoke source pins, three saved Projects,
and the exact closed SQLite copy with 30 applied migrations.
The audit observed physical exit. It read the retained bytes
and receipts without repeating native generation.

Typecheck, the application build, scoped lint and all 37 focused
tests passed. The final lint change sorts two groups of fixture keys.
The final loader still returns the exact executed and historical
contracts and refuses an unlisted run root. Python Ruff lint and
format checks passed for the Invoke driver and launcher.

The run under `runs/ordinary-img-mug-weight/20261121-r1` retains
the frozen inputs, original outputs, saved Projects, gate and
preflight, both blind reports, measurements, comparison chart,
audit and execution receipts.
Cleanup released 5,623,808 allocated bytes from five idle Studio
temporary paths. All 81 sealed files verified after cleanup.

The Invoke follow-up under `runs/invoke-ordinary-img-mug-weight/20261121-r1`
retains its original PNGs, exact graphs, queue receipts, cross-application
chart, independent audit and SQLite evidence.
Cleanup released 14,655,488 allocated bytes from the isolated
Invoke app and the blind-panel copies. All 71 sealed files verified
after cleanup.

## Replay

Use the frozen Studio base and the delivered
[`qualify-installed-ordinary-cat-tags.ts`](../../scripts/qualify-installed-ordinary-cat-tags.ts)
with the mug weight profile in
[`regional-guidance-character-visual-probe.ts`](../../src/main/projects/test-fixtures/regional-guidance-character-visual-probe.ts).
Prepare a fresh owned `runs/ordinary-img-mug-weight/<date>-rN`
with the pinned mug source and masks and a matching experiment
contract. Run the retained launcher as an owned 12 GiB, zero-swap
user service with a 600-second ceiling and short temporary path.
