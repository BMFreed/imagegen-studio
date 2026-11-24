# Anima tabletop placement with weighted subjects

The prior [tabletop trial](./phase-4-anima-countertop-scene-research.md)
kept the background in all four regional frames. Two frames placed the
subjects on opposite assigned sides. One overlapped them at the center and
one omitted the apple. This trial tests whether weighting the two subject
phrases makes their masked conditioning easier to realize in the same scene.

## Source and preregistration

Studio base `4f171148cc06b7cc2fe4ece530628cb2ee3256cb`. Fresh source checks
used clean InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1`.
Under `invokeai/frontend/webv2/src/features/generation/core/canvas`,
`compileCanvasGraph.ts` calls `addRegionalGuidance.ts` for Anima masks.
`invokeai/app/invocations/text_encoder/anima_text_encoder.py::_encode_prompt`
calls `invokeai/backend/anima/prompt_weighting.py::parse_prompt_attention`
and maps the resulting character weights to T5 tokens. Qwen3 sees the
same cleaned text. `invokeai/app/invocations/anima/anima_denoise.py`
passes the conditioning banks to `invokeai/backend/anima/regional_prompting.py`
and the transformer patch.

Only the spans for `a red apple with a small green leaf` and
`a blue ceramic mug with a loop handle` receive weight 1.5. The literal
expected ranges in the previous cleaned strings are `[0,35)` and
`[0,37)`. The context and the space preceding it retain weight 1.
The fixture checks the persistent mask IDs, exact Alpha8 planes, the
compiled spans and their assignment to each mask before dispatch.
The two ordinary Projects have no regional layers.

The six-case contract keeps both seeds 123 and 124, 512×512, Euler 20,
CFG 4, Auto VAE, the target and masks, and the same Anima model, Qwen3 and
Wan VAE. Both ordinary PNGs must match the prior trial exactly. The
regional outputs must retain the scene and show separate recognizable
subjects on opposite assigned sides, with both pairs reversing. The
gate permits no extra requests or tuning after seeing the outputs.
Human approval and the regional negative experiment have their own gates.

The preregistered contract SHA-256 is
`210aed842fb73328f0c71bbbc9adb6385ba533cad63401a8f4e869913f15d572`.
[Runner](../../scripts/qualify-installed-anima-background-visual.mts),
[fixture](../../src/main/projects/test-fixtures/anima-regional-input.ts).

## Native and visual results

Run `20261124-r1` completed all six CUDA requests in 326.343 seconds.
The RTX 4080's maximum sampled worker VRAM was 7,026 MiB. The single
native service reached 12 GiB with zero swap and zero OOM events.
The independent audit matched the 77 engine and 17 configuration pins,
all three model bodies, six complete matched requests, 120 progress
events, six closed SQLite stores and six saved Project packages.
All six workers and the controller exited.

Both ordinary PNGs and the transparent target repeated byte for byte.
All four regional PNGs changed. Two separately blinded model-assisted
readers passed the two ordinary scenes and all four regional backgrounds.
They saw no conspicuous mask seams. Their placement verdicts agreed.

| Seed | Apple assigned left                                                 | Mug assigned left                                                              |
| ---- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 123  | Both objects occupy the center. The apple obscures part of the mug. | Both shapes are distinct and on their assigned sides.                          |
| 124  | Both shapes are distinct and on their assigned sides.               | One central mug appears with a green leaf at the rim. The red apple is absent. |

The same two of four regional frames passed as in the unweighted trial.
Weight 1.5 changed the images while retaining both previous placement
failures on the same seeds. The two-seed placement gate remains open.
The local evidence retains all six PNGs, the paired comparison, both
blind readings, the controlled requests and the closed stores under
`runs/anima-countertop-subject-weight/20261124-r1`.
The focused suite passed 265 tests with zero failures or skips.
Typecheck, application build and scoped ESLint passed.
