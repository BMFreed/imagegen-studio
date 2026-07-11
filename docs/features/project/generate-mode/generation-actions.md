# Generate Action Behavior

## Feature

Pressing `Generate` creates one or more generation jobs from current Generate state.

## Reference

Reference: InvokeAI generation queue behavior, adapted to ImageGen Studio `.igs` project storage and Smart Patch Layer model.

See also: [Queue Manager](../../queue-manager.md).

## ImageGen Studio Decision

Generation output first enters a project-scoped staging session. Worker completion does not mutate the open project.

The generation target depends on selection/context:

- no Smart Patch Layer target: stage normal Project Canvas candidates;
- Smart Patch Layer target: stage candidates for that self-contained Smart Patch Layer;
- regional guidance entities: included as conditioning data when supported.

The user can select one or more completed candidates in [GenerationResults](./generation-results.md). Only explicit `Add N as Layers` / `Add N as Variants` writes raster assets and [generation provenance](./generation-provenance.md) into `.igs`.

Pressing `Generate` does not call the worker directly. It creates one or more Queue Manager items from frozen project/generation state. The queued jobs must not change if the user edits prompts, layers, masks, Project Canvas or Smart Patch bbox while they are pending.

## Generate Action Area

In the current Project UI, generation commands live in a fixed action bar directly below the `Create` tab and above the independently scrolling settings stack:

```text
[ wand Generate ] [ 1 ]                         [ queue badge ] [ x ]
```

Rules:

- `Generate` starts one batch from the current frozen project/generation state;
- the integer count input accepts any value from 1 through 100 and controls iterations per concrete prompt;
- the icon-only queue action opens the project queue and shows the current non-terminal job count in a badge;
- `x` is the visible cancel-current-generation action and must not be hidden inside the menu.

The bar uses a grid so the primary action and count remain content-sized on the left while queue and cancel stay grouped on the right. Queue and cancel use visible secondary surfaces. Queue pause/resume is not exposed from the Project action bar in the current scope.

## Automatic Canvas Workflow

Project does not expose a manual txt2img/img2img mode switch. At enqueue time it derives the worker path from visible raster content in the current target area:

- fully transparent composite → txt2img;
- partially transparent composite → outpaint;
- opaque composite without an effective mask → img2img;
- raster content plus an effective Smart Patch mask → inpaint.

For normal generation the target area is Project Canvas. For Smart Patch generation it is the selected layer-owned bbox.

The mere existence of a Raster Layer elsewhere in the document does not imply img2img; only visible raster pixels inside the frozen target area matter. That frozen composite includes visible Raster Layers and the active variants of visible Smart Patch Layers according to their shared z-order.

## New Raster Generation

When no Smart Patch Layer is the generation target:

- worker receives prompt/settings/model resources;
- worker receives Project Canvas bounds/dimensions as the normal generation target;
- worker receives the frozen visible composite inside Project Canvas when raster content exists;
- completed outputs remain temporary candidates;
- selected candidates become independent new Raster Layers only after `Add N as Layers`;
- an existing selected Raster Layer is never overwritten implicitly;
- the accepted anchor candidate starts selected/visible, while other accepted opaque alternatives start hidden;
- accepted layers store immutable generation provenance.

## Smart Patch Regeneration

When a Smart Patch Layer is the generation target:

- worker receives the flattened source composite beneath the target Smart Patch Layer for its bbox;
- the target layer's current active variant is excluded from its own regeneration input;
- worker receives the layer mask;
- worker receives the layer-owned bounding box;
- worker receives the layer internal resolution;
- worker receives the layer-owned generation draft and compositing settings;
- completed outputs remain temporary candidates;
- selected candidates become variants only after `Add N as Variants`;
- the accepted anchor candidate becomes active;
- other newly accepted candidates and the previous active variant remain inactive;
- every accepted variant stores immutable generation provenance;
- the Smart Patch Layer becomes `ready` when the active accepted variant matches current owned inputs.

Unselected candidates are discarded when the staging session closes and never become Smart Patch variants.

## Dynamic Prompt Expansion

Dynamic prompting can expand one visible Generate action into multiple concrete jobs.

Each candidate remains associated with the concrete expanded prompt used for its frozen job. The prompt becomes persistent generation provenance only if that candidate is accepted.

Every concrete prompt/seed combination becomes its own queue item, grouped by one batch id for the originating user action.

## Upscale Follow-Up

Upscale and `Send Composite to Upscale` are deferred to a separate Project pass. They do not block the current Create/Generate prototype or its acceptance criteria.

## Acceptance Criteria

- Generate creates queue items from frozen project/generation state.
- Generation mode is derived from target-area raster/mask content rather than a manual txt2img/img2img switch.
- Completed outputs appear as temporary candidates without mutating `.igs`.
- User can accept one or more normal candidates as new Raster Layers.
- User can accept one or more Smart Patch candidates as variants, with only one active.
- Existing Raster Layers and Smart Patch variants are never overwritten implicitly.
- Only accepted results store generation provenance and enter result history.
- Dynamic prompt expansion can create multiple concrete jobs.
