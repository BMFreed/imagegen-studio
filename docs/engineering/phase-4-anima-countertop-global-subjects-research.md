# Anima regional placement with both subjects named globally

Naming both subjects in the global positive raised the matched Anima tabletop
recipe from two to three successful regional assignments out of four. Both
subjects remained recognizable in all six frames. The seed-124 swap placed
the apple inside the mug near the center, so the two-seed gate stays open.

## Frozen inputs and current InvokeAI

Studio base `94f1d80d411396aa6e9efe44dccbaf694c5f3718` with the two qualification
source files in this change pinned before launch. The local InvokeAI checkout
was clean at `64ff2c600f04d220e470fdaeec570bd402af42a7`. Reviewed the Canvas
`compileCanvasGraph.ts` caller and `addRegionalGuidance.ts` under
`invokeai/frontend/webv2/src/features/generation/core/canvas/`. The Anima text
encoder in `invokeai/app/invocations/text_encoder/anima_text_encoder.py`
uses `invokeai/backend/anima/prompt_weighting.py` before the denoiser passes
conditioning to `invokeai/backend/anima/regional_prompting.py`. The global
positive covers the complement of the positive masks on masked even blocks.
Odd blocks use full attention in `invokeai/backend/anima/anima_transformer_patch.py`.
The invocation owner is `invokeai/app/invocations/anima/anima_denoise.py`.

Compared with the [unweighted tabletop trial](./phase-4-anima-countertop-scene-research.md),
the global positive replaces `open display space` with `one red apple and one blue ceramic mug`.
The shared scene context and unweighted local positives, `(blur)0.75, noise`
global negative, empty local negatives, target, 512×512 processing size,
seeds 123 and 124, Euler 20, CFG 4, Auto VAE and exact Cyberfalafel Anima,
Qwen3 and Wan VAE bodies are fixed. Local positives swap between masks at
`[32,224) × [64,352)` and `[288,480) × [64,352)`. Each mask has 216 sampled
cells, with zero overlap and 592 cells in the global complement. Each seed
has an ordinary control saved with zero Regional Guidance Layers.

The preregistered contract SHA-256 is
`000b282b1bc485dbcb643554cf55099bdbfc6cee8638b148818bce4274c96df3`.
The ordinary rubric requires both recognizable subjects and a continuous
tabletop and light blue wall. The regional rubric also requires opposing
assigned sides, separate identities and no conspicuous joins or duplicates.
The comparison rule chooses the first seed with a failed treatment.

## Installed Studio path

The Main capture path saved and reopened six owned Projects and sent six
requests to the installed signed CUDA worker. Each emitted 20 progress events
and exited. On the RTX 4080 the maximum sampled worker VRAM was 7,026 MiB.
The enclosing group took 336.644 seconds and reached 12 GiB with zero swap
and zero OOM. The focused suite passed 80 tests with zero failures or skips.
Full typecheck, application build, scoped ESLint and format checks passed.
[Fixture](../../src/main/projects/test-fixtures/anima-regional-input.ts) ·
[Installed runner](../../scripts/qualify-installed-anima-background-visual.mts)

Both blind readers reviewed the six original PNGs in a shuffled order.
Both ordinary controls and three of four regional outputs passed. Each
reader recognized both subjects and the continuous scene in all six.

| Seed | Ordinary              | Apple assigned left                     | Mug assigned left                        |
| ---- | --------------------- | --------------------------------------- | ---------------------------------------- |
| 123  | Both subjects present | Separate subjects on the assigned sides | Separate subjects on the assigned sides  |
| 124  | Both subjects present | Separate subjects on the assigned sides | Both centered, with apple inside the mug |

This recipe improves object presence and fixes the seed-123 assigned
arrangement seen in the previous trial. It still fails exact assignment
on seed 124. This is a two-seed result on one checkpoint. The overall visual
step, human acceptance, and independent local-negative gate remain open.

The independent live audit checked 17 application and Invoke source pins,
77 installed runtime and 17 configuration pins, six exact requests and PNGs,
and the 120 ordered progress events. The six closed `.igs` files and six
independently computed SQLite logical snapshots matched their pre-capture
state. The audit checked the installed pin records and did not separately
rehash the three shared model bodies.

## Matched current InvokeAI source comparison

The first failed seed was 124. A separate three-case native comparison ran
original Invoke Anima denoiser and transformer bodies on the same captured
prompts, exact checkpoint, masks, seed and schedule. Its common runtime
supplied the encoder, tokenizer and VAE. The standalone probe executed the
source revision above with the current checkpoint layout and attention
patch. It exercised the denoising path outside the Invoke UI and queue.

The probe pinned 62 source and dependency bodies and 120 inputs. All four
prompt records had exact compiled text, spans, Qwen input IDs, mask and
hidden-state tensors, and T5 IDs and weights across the measured paths.
Regional permission bytes matched for both assignments. All three Invoke
cases ran 20 positive and 20 negative forward passes with one shared initial
noise digest. The cgroup completed in 46.015 seconds with a 10.11 GiB peak,
zero swap, and zero OOM. The three decoded RGB pairs had mean absolute
channel differences of 0.83, 1.05 and 2.49 on the 0–255 scale.

Two separate blind readers agreed on the outcome of all three Invoke cases.
The ordinary and assigned images passed. The swapped image put the apple
inside the mug at the center, as Studio did. The failure is shared by the
measured paths on this seed and recipe. It gives no basis for changing the
Studio regional mechanism to correct this composition.

No inference ran during the initial freeze failure. The guard compared a
live model record with an historical stat record from another mount rather
than comparing content identity and verifying live stat separately. The
first launched probe then refused an obsolete loader caller hash before
its first denoising step. Reading the current
`invokeai/backend/model_manager/load/model_loaders/anima.py` showed that it
now prefilters tensor names before reading checkpoint payloads. The retained
adapter already uses the same prefix stripping and key exclusion functions
for this unquantized checkpoint. The second launch pinned the current caller
and kept the same cases and inputs.

The Studio run `runs/anima-countertop-global-subjects/20261127-r1` retains
six original PNGs, blind ratings, one nine-image comparison sheet and a
verified 63-entry archive of the closed Project and SQLite payloads. The
Invoke comparison under `runs/anima-countertop-global-subjects-invoke/20261127-r2`
retains three original PNGs, both blind ratings and exact source, runtime,
mask and prompt receipts. The failed first launch receipt stays in `20261127-r1`
of the same comparison directory. After process exit, 81,514,496 allocated
bytes of raw payload and scratch were reclaimed from the three run scopes.
