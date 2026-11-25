# Anima tabletop placement with touching masks

The [unweighted tabletop trial](./phase-4-anima-countertop-scene-research.md)
and [subject weighting trial](./phase-4-anima-countertop-subject-weight-research.md)
both passed two of four assignments. In both trials the seed-123 assigned
image overlapped the objects at the center and the seed-124 swapped image
omitted the apple. This experiment gives each region positive
conditioning over half of the formerly uncovered strip.

## Source and fixed inputs

Read clean InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1`.
`invokeai/frontend/webv2/src/features/generation/core/canvas/compileCanvasGraph.ts`
calls `addRegionalGuidance.ts::addRegionalGuidance` to connect authored alpha
masks to conditioning. `invokeai/app/invocations/anima/anima_denoise.py` projects
them to the token grid using nearest-neighbor sampling from
`invokeai/backend/anima/regional_prompting.py`. This owner lets the global
positive reach the complement of all positive masks.
`invokeai/backend/anima/anima_transformer_patch.py` uses these restrictions
on even blocks. The odd blocks keep full attention. Studio reuses the
existing mask authoring, capture and installed generation paths.

The unweighted baseline uses `[32,224)` and `[288,480)` on the x-axis.
The prepared treatment uses `[32,256)` and `[256,480)`. Both use
`[64,352)` on the y-axis at 512×512. The outer edges and mask IDs stay
fixed. The inner edges touch without overlap. On the 32×32 sampled grid
each region gains 36 cells and the global positive complement changes
from 592 to 520 cells. This tests the authored geometry change as a
whole, including the increase in region area and the shift in its center.

Use the exact model bodies, prompts at weight 1, target, seeds 123 and 124,
Euler 20, CFG 4 and Auto VAE from the unweighted baseline. Keep the empty
local negatives and the existing global negative. Each seed has one
ordinary Project with no regional layers and two treatments swapping
the complete local positives between the fixed masks.

## CPU and installed worker verification

The capture-only fixture uses the same scene authoring as the native
runner. It saves and reopens the six Projects, compares the exact
projected Alpha8 hashes and their prompt owners, and checks that the
ordinary Project has zero regional layers and mask files.
All 266 focused tests, full typecheck, app build and scoped lint passed.
[Fixture](../../src/main/projects/test-fixtures/anima-regional-input.ts),
[CPU test](../../src/main/projects/project-current-canvas-anima-regional-input.test.ts),
[native runner](../../scripts/qualify-installed-anima-background-visual.mts).

Studio `39faf6ac6db1f1abbf511c6aba579937eaa770fd` passed all six
installed CUDA requests on the RTX 4080 in the existing signed runtime.
The six workers each emitted 20 progress events and exited. Both
ordinary PNGs matched the prior unweighted controls byte for byte. All
four regional PNGs changed. The matched requests preserved their
normalized worker job fields, compiled prompts and regional ownership.
The changed alpha masks projected to 252 tokens per region and 520
background tokens, with zero overlap.

The maximum sampled worker VRAM was 7,014 MiB. The cgroup reached its
12 GiB limit with zero OOM and zero swap. The independent read-only
audit rehashed 17 Studio and Invoke source pins, 94 installed runtime
and configuration pins and all three model files. The six closed
`.igs` and six SQLite stores matched their respective pre-capture
package and logical snapshot hashes. The test used the installed worker
and Main capture path with six owned Projects.

## Blind visual result

Two readers independently described all six shuffled PNGs before
reveal. Both ordinary controls and all four regional frames showed the
pale tabletop and light blue wall. Neither reader saw a conspicuous
mask seam. The same rubric requires all four regional frames to show
recognizable, separate objects on their assigned sides.

| Seed | Apple assigned left                                 | Mug assigned left                                                  |
| ---- | --------------------------------------------------- | ------------------------------------------------------------------ |
| 123  | Both objects overlap near the center                | Centered mug and an obscured shape that could be an apple          |
| 124  | Recognizable apple on the left and mug on the right | Centered mug with a stem-like projection and no recognizable apple |

One of four regional frames passed, down from two of four with the
64-pixel strip. The seed-123 swapped frame lost its recognizable pair.
The seed-124 assigned frame was the sole pass in this trial. The
two-seed placement criterion remains `NOT_QUALIFIED`. Human acceptance
and regional negative utility remain open. The trial varied the authored
Project mask geometry.

Local evidence is under `runs/anima-countertop-gap-closed/20261125-r7`.
It includes the six original PNGs, reviewed contact sheet, blind
observations and mapping, baseline comparison, archived Project and
SQLite fixtures, and process, preservation and cleanup receipts.

## Matched current InvokeAI source comparison

Studio `f927063b27fa877664a104631f005ab9ab0b3250` and clean InvokeAI
`4875d96531ca6712b288f6e660fcbb34143408c1`. The comparison selected
the seed-123 ordinary TXT control and both seed-123 swapped treatments
before generating any Invoke frames. The Studio treatments differed in
mask geometry and used the same mug-left and apple-right prompts. The
probe verified the saved Alpha8 bytes against the authored RGBA mask
assets and against the corresponding native handoffs.

The current Invoke Canvas compiler calls
`invokeai/frontend/webv2/src/features/generation/core/canvas/addRegionalGuidance.ts`
to connect regional conditioning through `AlphaMaskToTensorInvocation` in
`invokeai/app/invocations/mask.py`. The binary fixture pixels make its
opaque-alpha conversion equivalent to the signed Studio mask input.
`invokeai/app/invocations/text_encoder/anima_text_encoder.py` calls
`invokeai/backend/anima/prompt_weighting.py` for text and weighted T5
inputs. The original `AnimaDenoiseInvocation._run_diffusion` in
`invokeai/app/invocations/anima/anima_denoise.py` calls
`invokeai/backend/anima/regional_prompting.py` and
`invokeai/backend/anima/anima_transformer_patch.py` and runs its built-in
Euler loop. The probe loads the original transformer and checkpoint
layout in `invokeai/backend/anima/` using the mapping read from the
Anima loader in `invokeai/backend/model_manager/load/model_loaders/anima.py`.

The existing [source-control harness](./phase-4-anima-negative-invoke-control-research.md#original-denoiser-visual-control)
binds the original denoising methods and supplies application service
ports. This TXT probe reused the signed Studio dependencies, Qwen encoder
and untiled Wan decode and exercised the current original Invoke
transformer, text preparation and denoising source. The runtime comparison
covers those source owners. The installed Invoke application and its model
registry are outside this run.

The first attempt exited at the first transformer pre-hook with no
generated PNGs. The harness had expected the progress scale
`sigma × 1000` in the transformer argument. The second attempt checked
the transformer's normalized sigma and kept the separate progress
assertion. Both attempts used the same authored inputs and donor revision.

The three CUDA requests completed in 44.039 s with 20 Euler steps and
20 positive and 20 negative transformer calls per image. The initial noise
matched the signed Studio rule of seeded CPU FP32 generation followed by
BF16 conversion. All four raw prompts matched in cleaned text, span
weights, Qwen IDs, attention mask and hidden states, and weighted T5 IDs
and weights. The positive permissions matched the installed Studio mask
builder byte for byte, with global/left/right support of 592/216/216 with
the gap and 520/252/252 with touching masks. Both masks were absent for
ordinary TXT. The global-only negative was unrestricted in all three
cases. The donor's even-block patch was scoped to each regional call and
restored afterward. Peak group memory was 8,889,339,904 bytes, peak
Torch CUDA allocation was 5,699,738,112 bytes, and swap and OOM were zero.

Both blind readers passed the ordinary scene and the 64-pixel-gap
placement in both engines. With touching masks both readers saw a
centered blue mug and no recognizable apple body. All six frames
retained the tabletop and wall. The paired RGB bytes differ across
engines. The same placement failure occurs with the original source and
the signed Studio worker for this scene and seed. The comparison offers
no verified Studio fix to port for the touching-mask case. The complete
two-seed visual criterion and human acceptance remain open.

Under the artifact root, `runs/anima-countertop-invoke-control/20261125-r1`
retains the failed harness diagnostic. R2 retains the three original Invoke
PNGs, visual comparison sheet, blind readings, source pins, resource receipt
and independent audit. Duplicate handoffs can be recovered byte for byte
from the previous verified Studio payload archives using the recorded
member names.
