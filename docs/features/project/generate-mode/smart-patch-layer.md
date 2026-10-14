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

## Production checkpoint: empty document foundation

[Foundation evidence](../../../engineering/phase-4-smart-patch-foundation-research.md)
qualifies the real `+ Patch` command, top-of-stack creation, independently owned
bbox/internal resolution/generation draft, selection, targeted editing,
Undo/Redo, `.igs` Save/reopen and local crash recovery without an ML runtime.
The empty mask is an explicit document descriptor
`{ id: UUID, revision: 0, asset: null }`, not fabricated pixels or a shared layer.
Production uses `kind: 'smart-patch'`; the suggested full-MVP shape below is a
product model, not the current persistence schema.

Empty masks contribute no asset references. Patches without accepted variants
contribute no compositing pixels or accepted-history records. The later owned-mask
authoring extension below admits painted masks; nonempty raster sub-layers and
active variants remain unsupported. Patch Generate, Apply Preset and Save Current
as Preset show explicit unavailable reasons; Manage Presets stays available.
Generation/variants, staleness, comparison and preset projection remain subsequent
phase-4 slices.

## Production checkpoint: owned mask authoring

[Owned-mask authoring](../../../engineering/phase-4-smart-patch-mask-authoring-research.md)
implements Brush, Eraser, Lasso, Polygon Lasso, Add/Subtract, overlay visibility
and Clear through captured renderer gestures and an authoritative Main CPU
rasterizer. It does not require an ML runtime or model. A completed gesture creates
one Project Undo step; a cancelled or unchanged gesture creates no mask revision.
The original empty descriptor remains valid. Clear retains the mask identity and
increments its revision, with `asset: null` and no `bounds`; cleared revisions may
be greater than zero.

A painted mask stores `asset: { path, sha256, bytes, width, height }` and integer
world-space `bounds: { x, y, width, height }`. One mask pixel is one project pixel;
bounds are independent of the Patch bbox and internal resolution. Assets use
`assets/masks/<mask-id>/<sha256>.png`, canonical white RGBA8 with linear alpha8
coverage. Transparent means outside the mask, opaque means fully covered; soft
coverage is preserved. Main creates pixels/paths and validates ownership, hashes,
dimensions, PNG structure and tight nonempty coverage before publishing. The PNG
reader accepts at most 256 IDAT chunks and refuses the 257th before adding another
data view; the current Main encoder writes one IDAT chunk. This bounds chunk-object
allocation in addition to encoded byte and decoded pixel limits. The renderer
shows a provisional gesture and scales the stored PNG for its mask
thumbnail; this is not a new preview worker or generated Raster output.

Main refuses stale identities/revisions, locked or hidden targets, invalid pixels
and edits beyond the finite CPU limits without a document/history commit. Existing
asset ownership retains prior mask bytes for Undo/Redo, explicit Save and local
recovery. Eight real Service cases, full app regression (3751 PASS), affected
checks after IDAT hardening (176 PASS), and 33 native UI/recovery checks pass.
Five semantic RED/neighbor GREEN pairs have byte-exact restoration. Bounded
typecheck/lint/build pass; counts, actual boundary and excluded attempts are
recorded in the authoring checkpoint. This qualifies the declared authoring slice.

`Transform Mask` and `Fit Patch BBox to Mask` remain required MVP work in the next
slice. Smart Patch inpaint/generation, accepted variants, staleness, compositing,
Regional Guidance and Patch preset application remain pending. Public promise
statuses are unchanged.

## Reference

Reference: InvokeAI inpaint mask, canvas entity list, bbox controls and compositing settings.

ImageGen Studio adapts these ideas, but does not copy Invoke's standalone inpaint mask layer model.

The selected mask overlay remains a viewer inspection state even when its layer
is hidden or locked; editing is disabled in those states and Pan/overlay toggle
remain available. The selector is labeled `Lasso operation`: Brush always adds,
Eraser subtracts, and Lasso/Polygon use its captured Add/Subtract choice.

## ImageGen Studio Decision

Smart Patch Layer is a self-contained generative entity. The mask, bounding box, internal resolution, generation draft, compositing settings and accepted raster results belong to the layer.

This is intentionally separate from:

- the unbounded Project Canvas and its project-owned primary generation bbox;
- ordinary Raster Layer transform/position.

Hard rule:

```text
Primary Generation BBox
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

  generationDraft: PresetPayload

  rasterSubLayers: Array<{
    id: string
    name: string
    rasterAssetId: string
    provenance: GenerationProvenance
    sourceRevisionHash: string
    createdAt: string
  }>

  activeRasterSubLayerId: string | null

  status: 'empty' | 'ready' | 'outdated' | 'generating' | 'failed'

  createdAt: string
  updatedAt: string
}
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

Smart Patch Layer Bounding Box is not the same thing as the project-owned primary generation bbox or Raster Layer transform. Both bboxes live in the unbounded Project Canvas coordinate space.

It defines the project-space area sent to the worker for this layer's local generation.

Product bbox controls:

- direct canvas handles;
- compact `Bounding Box` button/badge in selected-layer controls;
- popover for exact x/y/width/height;
- internal resolution width/height;
- aspect lock;
- `Fit Patch BBox to Mask`, exposed primarily in the Smart Patch contextual left toolbar;
- fit to the primary generation bbox where useful;
- scale before processing.

Changing layer bbox or internal resolution marks the layer `outdated` if it already has an active raster sub-layer.

The bbox can extend beyond all existing raster content. Smart Patch outpainting and acceptance do not expand Project Canvas, because it has no fixed bounds; they do not transform existing Raster Layer pixels. The previous auto-expand rule is retired.

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

The current details card only reads mask revision, bbox size, internal size and active variant. General bbox dragging, numeric precision editing, internal-size editing, mask painting, compositing controls and source-composite hashing are not implemented. The finite Project Canvas frame in the prototype remains a gap against the unbounded-canvas contract. `generating`/`failed` are represented in mock state and staging, not driven by a production worker.

The prototype also does not expose the shared `Compare generation settings`
context action or provenance popover. Its current `outdated` flag is a simplified
mock and does not substitute for `Generated with` / `Current Canvas` comparison.

## Acceptance Criteria

- Smart Patch Layer is documented as its own Generate feature.
- Unbounded Project Canvas, primary generation bbox, Raster Layer transform and Smart Patch Layer bbox are explicitly separate.
- Smart Patch Layer owns its mask, bbox, internal resolution, compositing settings and raster sub-layers.
- Smart Patch Layer owns the generation draft used by its regeneration workflow.
- Standalone inpaint mask layers are not part of MVP.
- Only one raster sub-layer inside one Smart Patch Layer can be active/visible at a time.
- Smart Patch regeneration can generate several temporary candidates and explicitly persist one or more selected candidates as variants.
- Changing layer-owned editable inputs marks existing generated output `outdated`.
- Smart Patch comparison uses active-variant provenance against current Canvas
  state and never compares two variant provenance records.
