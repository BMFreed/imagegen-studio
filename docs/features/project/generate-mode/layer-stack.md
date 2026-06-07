# Layer Stack

## Feature

The layer stack represents project structure in Generate.

## Reference

Reference: InvokeAI Canvas Entity List and selected-entity action bar.

## ImageGen Studio Decision

Use a project-structure-first right panel.

No permanent Boards/gallery sidebar is shown inside Project. Project organization belongs to Home.

## Scope

MVP layer/entity types:

- Raster Layer;
- Smart Patch Layer;
- Regional Guidance.

Not included:

- standalone Inpaint Mask layer;
- Control Layer;
- IP Adapter layer;
- permanent Boards/project gallery.

Layer stack behavior:

- add raster layer;
- add Smart Patch Layer;
- add Regional Guidance;
- reorder layers/entities;
- rename;
- duplicate;
- delete;
- visibility toggle;
- lock where useful;
- opacity;
- blend mode;
- selected-entity action bar.

## Smart Patch Layer Display

Smart Patch Layer display should include:

- layer status: `empty`, `ready`, `outdated`, `generating`, `failed`;
- active raster sub-layer;
- list/switcher for permanent raster sub-layer variants;
- bbox size badge;
- internal resolution badge;
- regenerate action;
- bbox popover action;
- mask edit action.

Only one raster sub-layer inside a Smart Patch Layer can be active/visible at a time.

The detailed Smart Patch Layer ownership model is documented in [Smart Patch Layer](./smart-patch-layer.md).

## Acceptance Criteria

- User can manage Raster Layer, Smart Patch Layer and Regional Guidance entities from the layer stack.
- Standalone inpaint masks are not exposed.
- Smart Patch Layer status and active raster sub-layer are visible.
- Smart Patch permanent variants are visible in the Smart Patch Layer variants list.
- Only one raster sub-layer inside one Smart Patch Layer can be active at a time.
- Denoising strength is not displayed above the layer stack; it belongs to Generation settings.
