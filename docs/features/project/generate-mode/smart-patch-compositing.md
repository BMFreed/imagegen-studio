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

Current-operation compositing settings can be used before a Smart Patch Layer exists. Once a Smart Patch Layer is created, the relevant settings are copied into the layer-owned state.

`Denoising strength` is intentionally not placed here. It is a Generation setting and should appear in the Generation card, not above the layer stack or inside selected-layer controls.

## Acceptance Criteria

- Compositing settings are not attached to standalone mask layers.
- Denoising strength is not shown in this compositing block; it belongs to Generation settings.
- Changing Smart Patch compositing settings marks existing generated results as `outdated`.
- Mask overlay visibility/color can be controlled without changing generated raster results.
