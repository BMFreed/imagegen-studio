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
