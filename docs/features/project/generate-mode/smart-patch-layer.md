# Smart Patch Layer

## Feature

Smart Patch Layer is the main ImageGen Studio entity for local generative editing in `Project` / `Generate`.

It replaces standalone inpaint masks with a layer-owned model:

```text
1 Smart Patch Layer
= 1 mask
= 1 layer-owned bounding box
= 1 internal resolution
= 1 layer-owned generation draft
= N raster sub-layers
= 1 active/visible raster sub-layer
= immutable provenance per accepted raster sub-layer
```

## Reference

Reference: InvokeAI inpaint mask, canvas entity list, bbox controls and compositing settings.

ImageGen Studio adapts these ideas, but does not copy Invoke's standalone inpaint mask layer model.

## ImageGen Studio Decision

Smart Patch Layer is a self-contained generative entity. The mask, bounding box, internal resolution, generation draft, compositing settings and accepted raster results belong to the layer.

This is intentionally separate from:

- Project Canvas / document work area;
- ordinary Raster Layer transform/position.

Hard rule:

```text
Project / Canvas Size
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
- stage multiple candidates and explicitly add one or more selected candidates as raster sub-layer variants;
- store multiple raster sub-layers as result alternatives;
- keep exactly one active/visible raster sub-layer;
- mark layer `outdated` when editable inputs change after generation;
- compare active-variant provenance with current Canvas state through the shared
  layer context-menu popover;
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
- layer-owned generation draft;
- compositing settings that affect regeneration;
- `rasterSubLayers`;
- `activeRasterSubLayerId`;
- current status;
- generation provenance for each accepted raster sub-layer.

Suggested shape:

```ts
type SmartPatchLayer = {
  id: string;
  type: 'smart-patch';

  name: string;
  visible: boolean;
  opacity: number;
  blendMode?: string;

  maskAssetId: string;

  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  internalResolution: {
    width: number;
    height: number;
  };

  generationDraft: PresetPayload;

  rasterSubLayers: Array<{
    id: string;
    name: string;
    rasterAssetId: string;
    provenance: GenerationProvenance;
    sourceRevisionHash: string;
    createdAt: string;
  }>;

  activeRasterSubLayerId: string | null;

  status: 'empty' | 'ready' | 'outdated' | 'generating' | 'failed';

  createdAt: string;
  updatedAt: string;
};
```

Selecting a Smart Patch Layer binds the left generation editor to `generationDraft`. Editing normal Project generation settings must not make unrelated Smart Patch Layers outdated.

## Creation And Regeneration Flow

The layer exists before the first generation:

```text
Add Smart Patch Layer
→ create empty layer-owned mask, bbox, internal resolution and generation draft
→ edit mask/bbox/settings
→ Generate temporary candidates
→ Add N as Variants
→ accepted anchor candidate becomes active
```

Regeneration freezes a source composite from compositing layers beneath the target Smart Patch Layer inside its bbox. The target layer's current active variant is excluded from its own generation input, preventing cumulative self-regeneration artifacts. Layers above remain visible in final Project preview but are not part of the patch source input.

## Layer-Owned Bounding Box

Smart Patch Layer Bounding Box is not the same thing as Project Canvas or Raster Layer transform.

It defines the project-space area sent to the worker for this layer's local generation.

Product bbox controls:

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
- each accepted raster sub-layer stores its own immutable generation provenance;
- mask/bbox/internal resolution are current layer-owned state, not separate per-sub-layer editable revisions.

If the user needs to preserve an alternate mask/bbox/internal-resolution state, they duplicate the whole Smart Patch Layer.

`Duplicate Layer` is also the canonical reuse action for Smart Patch geometry and
layer-owned processing state. A preset created from an accepted variant copies
only reusable generation configuration; it does not copy the mask, bbox,
internal resolution, compositing state or source identities. Smart Patch
`internalResolution` must not become generic preset `Size` implicitly.

Variant provenance still records identities/hashes for this layer/source context
so the app can explain the run and derive `outdated`. Those fields are excluded
from the read-only `Compare generation settings` diff: that popover compares how
the image was generated, not whether two Smart Patch Layers have the same shape
or mask.

## Layer Row Display

Smart Patch Layer should be visually distinct from a normal Raster Layer.

Layer stack row:

```text
visibility | mask thumbnail | active raster thumbnail | name + status | switch variants | lock | delete
```

Rules:

- mask thumbnail shows the layer-owned mask;
- active raster thumbnail shows the currently visible generated result;
- mask thumbnail comes before active raster thumbnail to match the Photoshop-like mental model where the mask is visually tied to the layer's visible pixels;
- `status` shows whether the active raster result matches current mask/bbox/internal resolution/settings;
- `switch variants` opens a compact persistent variants browser for this Smart Patch Layer;
- saved variants are not expanded into a vertical thumbnail list under the layer row by default.

## GenerationResults

Smart Patch regeneration can produce several results in one action.

Rules:

- every completed result first remains a temporary staging candidate;
- focus controls canvas preview while checkbox selection controls which candidates will be kept;
- `Add N as Variants` commits only selected candidates into `.igs`;
- the accepted anchor candidate becomes the active visible variant;
- other accepted candidates become inactive variants;
- the previous active variant remains stored but becomes inactive;
- only one permanent raster sub-layer can be active/visible at a time;
- unselected candidates are discarded when staging closes;
- accepted variants can be managed later through Smart Patch variant controls;
- each accepted raster sub-layer stores immutable generation provenance.

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
- layer-owned prompt/settings/model resources used by regeneration;
- source composite revision/hash beneath the Smart Patch Layer.

## Vue Prototype Coverage

The `smart-patch` scenario contains a self-contained Smart Patch with owned bbox, internal size, generation draft, mask revision, three accepted variants and one active variant. The mixed compositing stack displays mask before active raster, exposes variant switching and keeps only the active variant in the visual composite.

The prototype supports adding an empty Smart Patch, selecting its layer-owned generation draft, deterministic mask revision/outdated transitions, deterministic fit-to-mask, generating temporary candidates, multi-accepting them as variants and switching the active accepted variant. These persistent actions participate in Project undo/redo.

The current details card only reads mask revision, bbox size, internal size and active variant. General bbox dragging, numeric precision editing, internal-size editing, mask painting, compositing controls, source-composite hashing and outpainting auto-expand are not implemented. `generating`/`failed` are represented in mock state and staging, not driven by a production worker.

The prototype also does not expose the shared `Compare generation settings`
context action or provenance popover. Its current `outdated` flag is a simplified
mock and does not substitute for `Generated with` / `Current Canvas` comparison.

## Acceptance Criteria

- Smart Patch Layer is documented as its own Generate feature.
- Project Canvas, Raster Layer transform and Smart Patch Layer bbox are explicitly separate.
- Smart Patch Layer owns its mask, bbox, internal resolution, compositing settings and raster sub-layers.
- Smart Patch Layer owns the generation draft used by its regeneration workflow.
- Standalone inpaint mask layers are not part of MVP.
- Only one raster sub-layer inside one Smart Patch Layer can be active/visible at a time.
- Smart Patch regeneration can generate several temporary candidates and explicitly persist one or more selected candidates as variants.
- Changing layer-owned editable inputs marks existing generated output `outdated`.
- Smart Patch comparison uses active-variant provenance against current Canvas
  state and never compares two variant provenance records.
