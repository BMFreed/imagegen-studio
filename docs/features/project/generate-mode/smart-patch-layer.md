# Smart Patch Layer

## Feature

Smart Patch Layer is the main ImageGen Studio entity for local generative editing in `Project` / `Generate`.

It replaces standalone inpaint masks with a layer-owned model:

```text
1 Smart Patch Layer
= 1 mask
= 1 layer-owned bounding box
= 1 internal resolution
= N raster sub-layers
= 1 active/visible raster sub-layer
= 1 current generation snapshot
```

## Reference

Reference: InvokeAI inpaint mask, canvas entity list, bbox controls and compositing settings.

ImageGen Studio adapts these ideas, but does not copy Invoke's standalone inpaint mask layer model.

## ImageGen Studio Decision

Smart Patch Layer is a self-contained layer. The mask, bounding box, internal resolution, compositing settings and generated raster results belong to the layer.

This is intentionally separate from:

- Project Canvas / document work area;
- ordinary Raster Layer transform/position.

Hard rule:

```text
Project Canvas / Document Work Area
!= Smart Patch Layer Bounding Box
!= Raster Layer Transform
```

## Scope

MVP:

- create Smart Patch Layer;
- edit layer-owned mask;
- edit layer-owned bounding box;
- edit layer-owned internal resolution;
- regenerate layer;
- generate multiple results and store each completed result as a raster sub-layer variant;
- store multiple raster sub-layers as result alternatives;
- keep exactly one active/visible raster sub-layer;
- mark layer `outdated` when editable inputs change after generation;
- duplicate Smart Patch Layer when the user wants an alternate mask/bbox/internal-resolution state.

Post-MVP:

- `Duplicate & Regenerate`;
- richer compare UI for raster sub-layers;
- reusable mask assets;
- more advanced Smart Patch layer types if needed.

Rejected for MVP:

- standalone inpaint mask layers;
- one mask shared by multiple Smart Patch Layers;
- multiple masks inside one Smart Patch Layer;
- multiple visible raster sub-layers inside one Smart Patch Layer;
- full internal revision history for mask/bbox/internal resolution.

## Owned State

Smart Patch Layer owns:

- `maskAssetId`;
- `boundingBox`;
- `internalResolution`;
- compositing settings that affect regeneration;
- `rasterSubLayers`;
- `activeRasterSubLayerId`;
- current status;
- generation snapshot for each raster sub-layer.

Suggested shape:

```ts
type SmartPatchLayer = {
  id: string
  type: 'smart-patch'

  name: string
  visible: boolean
  opacity: number
  blendMode?: string

  maskAssetId: string

  boundingBox: {
    x: number
    y: number
    width: number
    height: number
  }

  internalResolution: {
    width: number
    height: number
  }

  rasterSubLayers: Array<{
    id: string
    name: string
    rasterAssetId: string
    generationSnapshot: GenerationSnapshot
    createdAt: string
  }>

  activeRasterSubLayerId: string | null

  status: 'empty' | 'ready' | 'outdated' | 'generating' | 'failed'

  createdAt: string
  updatedAt: string
}
```

## Layer-Owned Bounding Box

Smart Patch Layer Bounding Box is not the same thing as Project Canvas or Raster Layer transform.

It defines the project-space area sent to the worker for this layer's local generation.

Layer bbox controls:

- direct canvas handles;
- compact `Bounding Box` button/badge in selected-layer controls;
- popover for exact x/y/width/height;
- internal resolution width/height;
- aspect lock;
- `Fit Patch BBox to Mask`, exposed primarily in the Smart Patch contextual left toolbar;
- fit to canvas;
- scale before processing.

Changing layer bbox or internal resolution marks the layer `outdated` if it already has an active raster sub-layer.

If the bbox extends beyond Project Canvas bounds, Smart Patch outpainting should automatically expand Project Canvas to include the bbox. This canvas growth is undoable and does not transform Raster Layer pixels.

## Mask

The mask belongs to the Smart Patch Layer.

Rules:

- mask is not a top-level layer;
- mask is not shared by other Smart Patch Layers;
- mask visibility/overlay can be changed without changing generated raster pixels;
- editing mask marks existing generated result `outdated`.

Canvas tools for the selected Smart Patch Layer:

- `Transform Mask` moves/scales/rotates the layer-owned mask only;
- `Transform Mask` does not move active raster sub-layer pixels;
- `Transform Mask` does not move or resize the layer-owned Bounding Box;
- Lasso, Polygon Lasso, Brush and Eraser edit the layer-owned mask;
- Bounding Box tool edits the layer-owned Bounding Box.

## Raster Sub-Layers

Smart Patch Layer can store multiple raster sub-layers as generated result alternatives.

Rules:

- only one raster sub-layer can be active/visible at a time;
- switching active raster sub-layer changes the visible result;
- each raster sub-layer stores its own immutable generation snapshot;
- mask/bbox/internal resolution are current layer-owned state, not separate per-sub-layer editable revisions.

If the user needs to preserve an alternate mask/bbox/internal-resolution state, they duplicate the whole Smart Patch Layer.

## Layer Row Display

Smart Patch Layer should be visually distinct from a normal Raster Layer.

Layer stack row:

```text
visibility | active raster thumbnail | mask thumbnail | name + status | switch variants | lock | delete
```

Rules:

- active raster thumbnail shows the currently visible generated result;
- mask thumbnail shows the layer-owned mask;
- active raster thumbnail comes before mask thumbnail for easier visual scanning;
- `status` shows whether the active raster result matches current mask/bbox/internal resolution/settings;
- `switch variants` opens `GenerationResults` or a compact variants browser for this Smart Patch Layer;
- saved variants are not expanded into a vertical thumbnail list under the layer row by default.

## GenerationResults

Smart Patch regeneration can produce several results in one action.

Rules:

- every completed result becomes a permanent raster sub-layer variant inside `.igs`;
- `GenerationResults` shows the newest generated variants for review, activation and cleanup;
- the user may `Set Active` on one result as the active visible variant;
- only one permanent raster sub-layer can be active/visible at a time;
- unwanted variants can be deleted from `GenerationResults` or Smart Patch variant controls;
- each raster sub-layer stores its immutable generation snapshot.

See [GenerationResults](./generation-results.md).

## Status Model

States:

- `empty` — mask/bbox exist, but no raster result exists yet;
- `ready` — active raster sub-layer matches current editable inputs;
- `outdated` — editable inputs changed after the active raster sub-layer was generated;
- `generating` — generation is in progress;
- `failed` — last generation failed.

Inputs that mark a layer `outdated`:

- mask;
- bounding box;
- internal resolution;
- compositing settings that affect regeneration;
- prompt/settings/model resources used by regeneration.

## Acceptance Criteria

- Smart Patch Layer is documented as its own Generate feature.
- Project Canvas, Raster Layer transform and Smart Patch Layer bbox are explicitly separate.
- Smart Patch Layer owns its mask, bbox, internal resolution, compositing settings and raster sub-layers.
- Standalone inpaint mask layers are not part of MVP.
- Only one raster sub-layer inside one Smart Patch Layer can be active/visible at a time.
- Smart Patch regeneration can generate multiple results and persist them as permanent variants.
- Changing layer-owned editable inputs marks existing generated output `outdated`.
