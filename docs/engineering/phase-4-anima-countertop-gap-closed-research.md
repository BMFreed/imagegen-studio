# Anima tabletop placement with touching masks

The [unweighted tabletop trial](./phase-4-anima-countertop-scene-research.md)
and [subject weighting trial](./phase-4-anima-countertop-subject-weight-research.md)
both passed two of four assignments. In both trials the seed-123 assigned
image overlapped the objects at the center and the seed-124 swapped image
omitted the apple. The next experiment gives each region positive
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

## CPU verification and pending native gate

The capture-only fixture uses the same scene authoring as the native
runner. It saves and reopens the six Projects, compares the exact
projected Alpha8 hashes and their prompt owners, and checks that the
ordinary Project has zero regional layers and mask files.
All 266 focused tests, full typecheck, app build and scoped lint passed.
[Fixture](../../src/main/projects/test-fixtures/anima-regional-input.ts),
[CPU test](../../src/main/projects/project-current-canvas-anima-regional-input.test.ts),
[native runner](../../scripts/qualify-installed-anima-background-visual.mts).

The native run uses an owned artifact directory under
`runs/anima-countertop-gap-closed` and reuses the existing signed
environment and three pinned model bodies. The two ordinary output PNGs
must match the prior unweighted control byte for byte. The same blind
rubric requires four recognizable, separate, correctly placed pairs,
readable tabletop and wall, and no conspicuous seam. Six CUDA requests
and human visual acceptance are pending.
