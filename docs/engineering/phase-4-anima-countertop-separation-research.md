# Anima tabletop placement with explicit space between subjects

Both ordinary controls and all four regional assignments passed a blind
reading on seeds 123 and 124. On the earlier recipe, the seed-124 swapped
frame put the apple inside the mug in Studio and in the current InvokeAI
denoising comparison. With the added separation phrase, that frame put the
apple on the right and the mug on the left with tabletop between them.
[Earlier matched comparison](./phase-4-anima-countertop-global-subjects-research.md)

## Fixed inputs and donor

On Studio base `f6f74fef01712f8b16869876126217871ec32b54`, the global positive
adds `two separate objects with a clear stretch of empty tabletop between them`
after the two already named subjects. The regional positives, global
negative, empty local negatives, prior mask geometry and ownership, 512×512
target, Cyberfalafel Anima checkpoint, Qwen3, Wan VAE, Euler 20, CFG 4 and
Auto VAE match the corresponding earlier cases. Each seed has one ordinary
control with zero Regional Guidance Layers. The two treatment cases assign
the subjects to the two fixed masks, then swap the assignments.

Reviewed clean InvokeAI `64ff2c600f04d220e470fdaeec570bd402af42a7`.
`invokeai/frontend/webv2/src/features/generation/core/graph.ts` constructs the
Anima graph. The Canvas caller `canvas/compileCanvasGraph.ts` connects
`canvas/addRegionalGuidance.ts`. The text encoder at
`invokeai/app/invocations/text_encoder/anima_text_encoder.py` uses
`invokeai/backend/anima/prompt_weighting.py`.
`invokeai/app/invocations/anima/anima_denoise.py` uses
`invokeai/backend/anima/regional_prompting.py` and the
`anima_transformer_patch.py` attention patch. The probe uses the existing
Studio capture, conditioning and installed worker entry points. It changes
the fixture wording.

## Installed result

The seed-124 scout ran first. The seed-123 repeat kept the same wording to
check the already successful seed against a regression. Each request was
checked against the exact earlier request for that seed and layout before
CUDA submission. Apart from the global positive and its compiled span,
the differences were generated request IDs and runtime paths. Mask
coverage, model and conditioning inputs remained exact.

| Seed | Ordinary earlier → new | Assigned earlier → new | Swapped earlier → new  |
| ---- | ---------------------- | ---------------------- | ---------------------- |
| 123  | Pass → Pass            | Pass → Pass            | Pass → Pass            |
| 124  | Pass → Pass            | Pass → Pass            | Nested subjects → Pass |

For each seed, two agents assessed randomly named earlier and new originals
before looking up the treatment assignment. They checked recognizable
subjects, empty tabletop between them, scene continuity, duplicates and
visible joins. The treatment score also required the assigned opposite
sides. Both readers agreed for all six new frames. The current-source
Invoke comparator was prepared for each seed. The preregistered trigger
was a failed treatment, so both comparisons were skipped.

The installed CUDA worker completed six requests and 120 ordered progress
events. Independent audits checked all six exact output PNGs, masks,
original Project archives and closed SQLite logical snapshots, as well
as source pins and the physical exit of the two controllers and six
workers. The earlier readings were agent verdicts for two fixed seeds
with one checkpoint.

The exact contracts, requests, output images, blind readings and verified
closed-fixture archives are retained under
`runs/anima-countertop-separate-subjects/20261128-r1` and `20261128-r2`
in the artifact root. The comparison sheet is in R2.

## Human review of the two-seed placement

The user saw the six original outputs together under letter labels. The
panel hid the seed, treatment and earlier verdict. A side mark meant one
recognizable apple, one recognizable mug, open tabletop between them and
no duplicate or visible join. The two ordinary controls required the scene
criteria. The regional cases also required the assigned side.

| Seed | Ordinary | Assigned, apple left | Swapped, apple right |
| ---- | -------- | -------------------- | -------------------- |
| 123  | B, pass  | F, pass              | D, pass              |
| 124  | E, pass  | C, pass              | A, pass              |

The user confirmed the left-side mark for C before the mapping was revealed.
The initial response, confirmation and six source SHA-256 pins are retained
under `runs/anima-countertop-separate-subjects/20261128-human-panel-a`.
This accepts the tabletop placement on the two tested seeds. Independent
Anima local-negative utility and the Illustrious visual checks remain open.
