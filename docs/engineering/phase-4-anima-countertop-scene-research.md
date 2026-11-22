# Anima regional placement with shared tabletop context

The [festival stall trial](./phase-4-anima-festival-stall-research.md)
retained both ordinary scenes and passed one of four regional images
on the joint subject and scene criterion. This trial uses a simpler
still life and repeats the same scene description in both local prompts.

## Current source and experiment

Studio base `0c7dfb2c31785b1e39d7f0e6076fd774d5e0205f`.
The local InvokeAI checkout was clean at
`4875d96531ca6712b288f6e660fcbb34143408c1`. The current
`invokeai/frontend/webv2/src/features/generation/core/canvas/compileCanvasGraph.ts`
caller runs `addRegionalGuidance.ts::addRegionalGuidance` to join masked
Anima conditioning. The prompt encoder is
`invokeai/app/invocations/text_encoder/anima_text_encoder.py::_encode_prompt`.
The denoiser in `invokeai/app/invocations/anima/anima_denoise.py` passes
the positive and negative conditioning banks separately to
`invokeai/backend/anima/regional_prompting.py` and applies the masks on
alternating blocks through `anima_transformer_patch.py`.

The global positive reaches the uncovered complement on the masked
blocks. Describing the tabletop and wall inside both local positives
gives the corresponding image tokens access to that scene context
inside their masks. The trial measures the new recipe's practical
utility. The scene also changes relative to the earlier festival trial.

The two seeds are 123 and 124. Each has one ordinary TXT control with
no authored regions and two regional variants whose complete local
positives swap between fixed masks. Runtime, exact Cyberfalafel Anima,
Qwen3 and Wan VAE bodies, offsets, 512×512 geometry, Euler 20, CFG 4,
Auto VAE and global negative `(blur)0.75, noise` follow the prior run.
The regions occupy `[32, 224) × [64, 352)` and
`[288, 480) × [64, 352)` in processing coordinates. The expected sampled
coverage is 216 cells per region with zero overlap, leaving 592 global
positive cells on masked blocks.

- Global positive `anime still life illustration, front view, medium wide shot, continuous pale wooden tabletop in front of a plain light blue wall, open display space, even lighting`
- First regional positive `a red apple with a small green leaf on a continuous pale wooden tabletop in front of a plain light blue wall`
- Second regional positive `a blue ceramic mug with a loop handle on a continuous pale wooden tabletop in front of a plain light blue wall`

Both ordinary controls must show a continuous pale wooden tabletop
crossing the center and a readable light blue wall above. Each regional
image must also show a distinct red apple with stem or leaf and a blue
mug with its loop handle, on the requested opposing sides. The two
placements must reverse at both seeds. Prominent duplicates, fused
objects and conspicuous mask seams fail. Uncertain identity or side is
inconclusive. Blind reads use all six original images before reveal.
Regional negative text has its own visual gate.

The preregistered contract SHA-256 is
`4e1706b5b9bc83665aa4729b29cdb2312afa327e30e2b8cedc27dd43d7894ca0`.

## Installed-worker execution

Run `20261123-r1` completed six requests on the existing signed CUDA
worker in 337.773 seconds. The group reached its 12 GiB limit with
zero swap and zero OOM kills. The maximum sampled worker VRAM was
7,026 MiB on the RTX 4080. The same installed release and all three
model bodies remained intact.

An independent audit checked 77 engine and 17 signed configuration
pins, the Studio and Invoke sources, the literal compiled prompts and
mask assignments, all 120 progress events and six distinct decoded PNGs.
All six `.igs` files reopened after Save. Six SQLite bodies and six Project
packages were retained. The six workers and their controller exited.
The compact archive retained and verified all 63 payload entries.

## Blind visual result

Two readers described all six shuffled PNGs before reveal. Both
ordinary controls and all four regional frames retained the pale wooden
tabletop and light blue wall. The readers identified no conspicuous
mask seam in the four regional frames.

| Seed | Ordinary                     | Apple assigned left                                           | Mug assigned left                                   |
| ---- | ---------------------------- | ------------------------------------------------------------- | --------------------------------------------------- |
| 123  | Continuous tabletop and wall | Both subjects centered, with the apple hiding part of the mug | Mug left and apple right, with readable silhouettes |
| 124  | Continuous tabletop and wall | Apple left and mug right, with distinct outlines              | One centered mug, apple absent                      |

Two of four regional images met the joint criterion. The complete
placement gate remains `NOT_QUALIFIED`. The scene background passed all
four treatment observations in this recipe. Isolating the effect of the
shared context would require matched local prompts with and without
that text on this same scene. Human acceptance and the regional negative
gate remain open.

The run retains the six original PNGs, comparison, blind observations,
mapping, contract, audits and native receipts. The focused suite passed
238 tests, with zero failures or skips. Typecheck, application build and
scoped ESLint passed.
