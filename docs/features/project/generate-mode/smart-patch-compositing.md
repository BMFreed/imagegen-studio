# Smart Patch Compositing Settings

## Feature

Smart Patch compositing settings control how local generation uses masks, infill and blending.

The broader Smart Patch Layer ownership model is documented in [Smart Patch Layer](./smart-patch-layer.md).

## Reference

Reference: InvokeAI Inpaint Mask and Compositing settings, adapted into ImageGen Studio Smart Patch Layer ownership.

## ImageGen Studio Decision

Compositing settings belong to the current operation or selected Smart Patch Layer, not to standalone mask layers.

## Scope

MVP candidates:

- mask blur;
- edge coherence / coherence mode where supported;
- edge size;
- infill method;
- noise level where supported;
- blend mode;
- opacity;
- show/hide mask overlay;
- mask overlay color/opacity.

Post-MVP:

- advanced mask preprocessing;
- reusable mask presets;
- more infill algorithms if worker support is good.

Rejected for MVP:

- standalone mask layers;
- shared masks reused by multiple Smart Patch Layers;
- complex mask graph/composition.

## Ownership Rules

Smart Patch Layer owns:

- mask;
- layer-owned bounding box;
- internal resolution;
- compositing settings that affect regeneration;
- raster sub-layers produced from those inputs.

If a setting affects an already generated Smart Patch Layer, changing it marks the layer as `outdated`.

Owned `maskSettings.blur` is an integer project-pixel value0..512, default16.
The painted mask remains immutable; the generation/compositing snapshot must
freeze and consume blur,and a changed blur can stale an accepted variant.
The [private contribution scope](../../../engineering/phase-4-smart-patch-contribution-fade-research.md)
qualifies its private CPU consumer:affected1888 TS/203 Python PASS,including50
fade cases/21 pinned Invoke comparisons,and three semantic RED/neighbor GREEN
pairs;typecheck/lint/build/global Python checks PASS,exit/cleanup confirmed. Soft authored
alpha stays in conditioning inputs,but nonzero pixels seed full/binary output
core. TXT/IMG use whole-bbox core,INP uses authored clipped coverage,and OUT uses
its union with source alpha<255. Blur0 gives binary core;positive blur gives
external Invoke distance/curve fade in world project pixels. It does not blur
painted coverage or attenuate contribution within a soft painted core.
Owned `maskSettings.padding` is an integer Fit margin0..512, default8. Padding
does not process pixels or stale a result by itself; a later Fit that changes
bbox changes the generation input. Overlay visibility/color/opacity are viewer
state and do not change accepted pixels or generation staleness.

The existing production settings UI/persistence and Fit are qualified by the
[settings checkpoint](../../../engineering/phase-4-smart-patch-mask-settings-research.md).
The [private Main/CPU input capture](../../../engineering/phase-4-smart-patch-generation-capture-research.md)
is qualified by focused14/affected1852 tests and actual CPU composition;
it records whole owned mask and source RGBA/source alpha without applying blur or
implementing inpaint. The previous [effective-mask/internal-size preparation](../../../engineering/phase-4-smart-patch-mask-preparation-research.md)
checkpoint derives zero-padded bbox-local numeric generate coverage, resizes numeric
coverage and sRGB source independently with BICUBIC, and retains world-derived
mode with `processingMaskHasCoverage` reporting. Final focused33 TS/Python24 and
three isolated semantic RED/neighbor GREEN pairs and affected1871 TS/125 Python
pass; required typecheck/lint/build pass, physical exit and temporary-copy
cleanup are confirmed in the checkpoint.
It does not apply blur/fade/coherence or prepare latent conditioning.

Internal resolution may differ from world-space bbox size. The current
contribution scope computes project-pixel fade directly from world planes,
independently of the existing internal-size preparation outputs;nonuniform
internal scaling therefore does
not change this geometric fade distance. Invoke's scaled `addInpaint` graph
expands/fades at processing size and then resizes the mask back,so full scaled
pixel parity is not claimed. This helper is pre-coherence geometry:later edge
coherence,latent/infill processing may expand the base edit area and still needs
an explicit numerical contract/oracle before final inference/compositing.

Current-operation compositing settings can be used before a Smart Patch Layer exists. Once a Smart Patch Layer is created, the relevant settings are copied into the layer-owned state.

`Denoising strength` is intentionally not placed here. It is a Generation setting and should appear in the Generation card, not above the layer stack or inside selected-layer controls.

## Vue Prototype Coverage

The prototype preserves the ownership boundary and keeps Denoising Strength in the Generation card. It can mark a Smart Patch outdated when deterministic mask/bbox/generation inputs change. A dedicated Smart Patch compositing form for blur, coherence, infill, overlay color/opacity and related controls is not currently rendered; those settings remain product scope.

## Acceptance Criteria

- Compositing settings are not attached to standalone mask layers.
- Denoising strength is not shown in this compositing block; it belongs to Generation settings.
- Changing Smart Patch compositing settings marks existing generated results as `outdated`.
- Mask overlay visibility/color can be controlled without changing generated raster results.
