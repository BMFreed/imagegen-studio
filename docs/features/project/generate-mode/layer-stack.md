# Layer Stack

## Feature

The layer stack represents project structure in Generate.

## Reference

Reference: InvokeAI Canvas Entity List and selected-entity action bar.

## ImageGen Studio Decision

Use a project-structure-first right panel.

No permanent Boards/gallery sidebar is shown inside Project. Project organization belongs to Home.

Raster Layers and Smart Patch Layers share one compositing `Layers` stack and one cross-type z-order. Regional Guidance is a separate conditioning section because it does not contribute ordinary raster pixels to visual compositing.

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
- reorder Raster and Smart Patch Layers across types inside the compositing stack;
- rename;
- duplicate;
- delete;
- visibility toggle;
- lock where useful;
- opacity;
- blend mode;
- selected-entity action bar.

Pointer reorder uses a sortable flat list backed by `@vue-dnd-kit/core`. Drag begins from the full layer selection surface after a small movement threshold; visibility and row action buttons are sibling controls and never start a drag. The insertion line and reduced-opacity source row communicate the target, and the right panel uses its own scroll container for edge auto-scroll.

One completed drop creates one grouped `Reorder layers` undo entry. No document mutation occurs during hover. `Move up` and `Move down` remain in the row overflow menu as a keyboard fallback; permanent hover arrows are not shown.

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

Rows with nested controls must not be implemented as one button containing other buttons. Use a full-height selection `NButton` for thumbnail/name/status plus sibling visibility and action buttons.

## Smart Patch Layer Display

The full product Smart Patch Layer display should include:

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

Use the compact variants browser for already accepted Smart Patch variants. [GenerationResults](./generation-results.md) is reserved for the current temporary staging session and does not become the permanent variant/history browser.

Only one raster sub-layer inside a Smart Patch Layer can be active/visible at a time.

The detailed Smart Patch Layer ownership model is documented in [Smart Patch Layer](./smart-patch-layer.md).

## Regional Guidance Layer Display

The full product Regional Guidance Layer display should follow Invoke's Regional Guidance entity layout closely:

- grouped `Regional Guidance` section in the layer stack;
- layer row with preview, name, status badges and common actions;
- layer-owned region/mask preview;
- inline `+ Prompt`, `+ Negative Prompt` and `+ Reference Image` actions;
- positive prompt block when present;
- negative prompt block when present;
- regional reference image thumbnails when present;
- compatibility warning when the active model/worker cannot use regional guidance or regional guidance images.

Regional Guidance Layer owns its region/mask. The mask is not a standalone layer and is not shared with Smart Patch Layer or other Regional Guidance Layers.

## Vue Prototype Coverage

The current right panel implements:

- a separate Regional Guidance conditioning section;
- one flat compositing stack shared by Raster and Smart Patch layers;
- selection surfaces implemented as full-height `NButton` siblings beside visibility/actions, without nested controls;
- add Raster, add Smart Patch and add Regional Guidance;
- Raster/Smart Patch visibility, lock, duplicate and delete;
- pointer DnD with a 6px activation distance, insertion indicator, source opacity and overflow `Move up` / `Move down` fallback;
- Smart Patch mask thumbnail before active-raster thumbnail, status text, variant count and a compact variant chooser;
- selected Raster readouts for opacity/blend and selected Smart Patch readouts for mask revision, bbox, internal size and active variant;
- Regional Guidance select/enable/delete and a compatibility warning.

Current limitations:

- layer rename is not exposed;
- Raster opacity and blend controls are present but not wired;
- locked state is visual/state coverage and does not yet prevent every destructive action;
- Smart Patch bbox/internal resolution/compositing precision controls are read-only or absent;
- Regional Guidance prompt/reference authoring is not inline, and reference-image add/remove/reorder is not implemented;
- destructive delete has no confirmation policy in this mock.

## Acceptance Criteria

- User can manage Raster Layer, Smart Patch Layer and Regional Guidance Layer from the layer stack.
- Raster and Smart Patch Layers share one ordered compositing stack; Regional Guidance is a separate conditioning section.
- Standalone inpaint masks are not exposed.
- Visibility toggle is placed left of the thumbnail/preview for all layer rows.
- Warning/status icons, lock and delete actions are available in layer rows.
- Smart Patch Layer status and active raster sub-layer are visible.
- Smart Patch Layer row shows both mask thumbnail and active raster thumbnail, in that order.
- Inline Regional Guidance prompt/reference-image authoring remains product scope; the current prototype shows compact entity rows plus selected-item details.
- Regional Guidance Layer mask ownership is explicit and non-shared.
- Smart Patch row exposes a switch-variants action/count instead of expanding variants inline by default.
- Layer selection and sibling actions use valid non-nested interactive semantics.
- Raster and Smart Patch Layers can be reordered by pointer DnD, with overflow move actions as the keyboard fallback.
- Only one raster sub-layer inside one Smart Patch Layer can be active at a time.
- Denoising strength is not displayed above the layer stack; it belongs to Generation settings.
