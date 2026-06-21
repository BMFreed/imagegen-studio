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
- Regional Guidance Layer.

Not included:

- standalone Inpaint Mask layer;
- Control Layer;
- IP Adapter layer;
- permanent Boards/project gallery.

Layer stack behavior:

- add raster layer;
- add Smart Patch Layer;
- add Regional Guidance Layer;
- reorder layers/entities;
- rename;
- duplicate;
- delete;
- visibility toggle;
- lock where useful;
- opacity;
- blend mode;
- selected-entity action bar.

## Layer Row Controls

Use the same row-control layout for Raster Layer, Smart Patch Layer and Regional Guidance Layer unless a layer type has a strong reason to differ.

Base row order:

```text
visibility | thumbnail/preview | name + status | secondary actions | lock | delete
```

Rules:

- the visibility button is shown to the left of the layer thumbnail/preview, Photoshop-style;
- do not place the visibility button in the right-side common action cluster like Invoke does;
- warning/status icons stay near the layer name/status area;
- Regional Guidance Layer keeps an Invoke-like warning icon for compatibility or missing/unsupported setup warnings;
- lock is supported for layers where editing/moving/deleting should be preventable;
- delete is supported from the row actions;
- destructive delete should use the app's normal confirm/undo policy once that policy is defined;
- right-side actions should remain compact and type-specific, while visibility remains visually tied to the thumbnail.

## Smart Patch Layer Display

Smart Patch Layer display should include:

- layer status: `empty`, `ready`, `outdated`, `generating`, `failed`;
- mask thumbnail;
- active raster sub-layer thumbnail;
- variant count badge/action;
- bbox size badge;
- internal resolution badge;
- regenerate action;
- bbox popover action;
- mask edit action.

Smart Patch Layer row order:

```text
visibility | mask thumbnail | active raster thumbnail | name + status | switch variants | lock | delete
```

The mask thumbnail comes before the active raster thumbnail so the row reads like a Photoshop-style masked layer: visibility, mask, visible/generated pixels, then name and actions.

The `switch variants` action should use a clear cycle/swap-style icon and expose a tooltip such as `Switch variant`. If multiple variants exist, pair it with a variant count where space allows.

The layer row should stay compact. Do not expand saved raster sub-layer variants into a vertical thumbnail list under the Smart Patch Layer by default.

Use [GenerationResults](./generation-results.md) as the richer browser for newly generated Smart Patch variants. Smart Patch selected-layer controls may also expose a compact variants action/list, but the default layer stack row stays compact: mask thumbnail, active raster thumbnail and variant count/action, not a full list of variants.

Only one raster sub-layer inside a Smart Patch Layer can be active/visible at a time.

The detailed Smart Patch Layer ownership model is documented in [Smart Patch Layer](./smart-patch-layer.md).

## Regional Guidance Layer Display

Regional Guidance Layer display should follow Invoke's Regional Guidance entity layout closely:

- grouped `Regional Guidance` section in the layer stack;
- layer row with preview, name, status badges and common actions;
- layer-owned region/mask preview;
- inline `+ Prompt`, `+ Negative Prompt` and `+ Reference Image` actions;
- positive prompt block when present;
- negative prompt block when present;
- regional reference image thumbnails when present;
- compatibility warning when the active model/worker cannot use regional guidance or regional guidance images.

Regional Guidance Layer owns its region/mask. The mask is not a standalone layer and is not shared with Smart Patch Layer or other Regional Guidance Layers.

## Acceptance Criteria

- User can manage Raster Layer, Smart Patch Layer and Regional Guidance Layer from the layer stack.
- Standalone inpaint masks are not exposed.
- Visibility toggle is placed left of the thumbnail/preview for all layer rows.
- Warning/status icons, lock and delete actions are available in layer rows.
- Smart Patch Layer status and active raster sub-layer are visible.
- Smart Patch Layer row shows both mask thumbnail and active raster thumbnail, in that order.
- Regional Guidance Layer prompt/reference-image controls are visible inline in the layer stack.
- Regional Guidance Layer mask ownership is explicit and non-shared.
- Smart Patch row exposes a switch-variants action/count instead of expanding variants inline by default.
- Only one raster sub-layer inside one Smart Patch Layer can be active at a time.
- Denoising strength is not displayed above the layer stack; it belongs to Generation settings.
