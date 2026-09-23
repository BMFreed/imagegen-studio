# Regional Guidance

## Feature

Regional guidance lets the user apply prompt and image guidance to a specific canvas region during generation.

In ImageGen Studio this is represented as a **Regional Guidance Layer**.

## Reference

Reference: InvokeAI Regional Guidance entities.

Useful Invoke source areas:

- `features/controlLayers/components/RegionalGuidance/RegionalGuidance.tsx` — entity row/container with preview, title, badges and common actions;
- `features/controlLayers/components/RegionalGuidance/RegionalGuidanceEntityList.tsx` — grouped regional guidance entity list;
- `features/controlLayers/components/RegionalGuidance/RegionalGuidanceSettings.tsx` — settings composition;
- `features/controlLayers/components/RegionalGuidance/RegionalGuidanceAddPromptsIPAdapterButtons.tsx` — `Prompt`, `Negative Prompt`, `Reference Image` add actions;
- `features/controlLayers/components/RegionalGuidance/RegionalGuidancePositivePrompt.tsx` and `RegionalGuidanceNegativePrompt.tsx` — per-region prompt editors;
- `features/controlLayers/konva/CanvasEntity/CanvasEntityAdapterRegionalGuidance.ts` — canvas adapter and region rendering.

## ImageGen Studio Decision

Include regional prompt guidance in Generate for Illustrious and Anima. Regional
reference images are available for Illustrious/SDXL only in the MVP; the chosen
Invoke-like Anima pipeline has no compatible regional image-adapter path.

Do not include generic IP Adapter or ControlNet region features in MVP.

Regional guidance images are a narrow exception inside this feature. They may use an Invoke-like regional reference image mechanism internally, but the product does not expose generic IP-Adapter, ControlNet or arbitrary reference-adapter workflows in MVP.

Invoke's `auto-negative` (using a region's positive prompt as negative
conditioning outside its mask) is excluded for **both** supported families. The
ImageGen Studio `Use global negative prompt` option has a different meaning: at
Generate time it resolves the current global negative text for that region,
instead of copying text when the switch is changed.

Regional guidance is a prompt-control mechanism, not a replacement for Smart Patch Layer.

The region/mask is inseparable from the Regional Guidance Layer. It is not a standalone mask layer and cannot be reused by other regional guidance layers or Smart Patch Layers.

## Scope

MVP:

- add Regional Guidance Layer;
- edit its layer-owned region/mask on canvas;
- region has its own positive prompt;
- negative prompt can be entered for a region or inherited from the current
  global negative prompt when the job is frozen;
- attach one or more regional guidance images with Illustrious/SDXL;
- show regional guidance image thumbnails in the entity/settings UI;
- remove/reorder regional guidance images;
- enable/disable region;
- include enabled regional guidance in generation jobs;
- keep regional guidance in the live Project document for future jobs, but exclude it from accepted-result provenance, settings comparison and result-derived presets;
- disable unsupported controls with a clear reason and reject a frozen job
  containing unsupported regional inputs before enqueue.

Post-MVP:

- more advanced regional weighting;
- region presets;
- region copy/merge operations if they prove useful.

Rejected for MVP:

- standalone IP Adapter regions outside Regional Guidance;
- standalone ControlNet regions;
- standalone regional masks;
- sharing one regional mask between several Regional Guidance Layers;
- complex regional model routing;
- Invoke-style inverse-mask `auto-negative` for either model family.

## UI Behavior

Regional Guidance appears in the layer/entity stack as `Regional Guidance Layer`.

It should follow Invoke's interaction model closely:

```text
Regional Guidance Layer
├─ layer header: preview, name, status badges, common actions
├─ + Prompt
├─ + Negative Prompt
└─ + Reference Image
```

It should expose:

- name;
- visibility/enabled state;
- layer-owned region/mask shape;
- positive prompt;
- negative prompt behavior;
- regional guidance image thumbnails;
- add/remove/reorder image actions;
- compatibility status;
- delete/duplicate actions where useful.

The region/mask should be directly editable on canvas. Numeric precision controls can live in selected-entity settings if needed.

Canvas tools for the selected Regional Guidance Layer:

- `Transform Region` moves/scales/rotates the layer-owned region/mask;
- Lasso, Polygon Lasso, Brush and Eraser edit the layer-owned region/mask;
- no Bounding Box tool is shown, because Regional Guidance Layer does not own a generation bbox;
- no `Fit BBox to Mask` / `Fit Patch BBox to Mask` action is shown for the same reason.

Prompt and reference-image blocks are optional per layer:

- if no prompt/reference block exists, show compact `+ Prompt`, `+ Negative Prompt`, `+ Reference Image` actions;
- when a block exists, keep it visible inline under the layer header, Invoke-style; selection must not mount/unmount the editor or change row geometry;
- positive/negative prompts use the same prompt editor behavior as the main prompt where possible, including tag autocomplete and prompt diagnostics;
- regional reference images show thumbnails and metadata controls, but this remains a Regional Guidance feature rather than a generic IP-Adapter browser;
- with Anima selected, `+ Reference Image` explains that regional references
  are unsupported. If an existing Project already contains enabled regional
  references, Generate is blocked until the images are removed, the region is
  disabled or the model is changed; the worker never silently ignores them.

## Ownership Model

Suggested shape:

```ts
type RegionalGuidanceLayer = {
  id: string;
  type: 'regional-guidance';

  name: string;
  enabled: boolean;
  locked: boolean;
  opacity: number;

  maskAssetId: string;
  regionObjects: CanvasRegionObject[];

  positivePrompt: string | null;
  negativePrompt: string | null;
  useGlobalNegativePrompt: boolean;

  referenceImages: Array<{
    id: string;
    assetId: string;
    weight?: number;
    metadata?: RegionalReferenceImageMetadata;
  }>;

  compatibilityStatus: 'ok' | 'warning' | 'unsupported';
};
```

Rules:

- one Regional Guidance Layer owns one editable region/mask;
- a regional mask is not a top-level layer;
- a regional mask is not shared with Smart Patch Layer;
- a regional mask is not shared with another Regional Guidance Layer;
- duplicate creates a new layer with a copied region/mask, prompts and reference images;
- deleting the layer deletes/removes its regional guidance state from the project.

## Worker Behavior

When enabled regional guidance entities exist:

- worker receives their region data and prompts;
- worker receives compatible regional guidance image asset refs and metadata;
- region prompts influence the generation job according to the supported Invoke-like pipeline;
- the global negative text is resolved for inheriting regions in the frozen job;
- accepted-result provenance excludes all Regional Guidance state, even when it
  affected inference.

Known unsupported model/region combinations are rejected before enqueue with an
actionable explanation. Anima regional reference images are one such combination.
Anima regional **negative** text is an implementation acceptance gate: Invoke
builds the conditioning node but its current denoiser does not apply a separate
mask to the negative pass. Do not claim spatially scoped negative behavior until
the worker implements and validates it with real Anima generations. Positive
regional prompts remain available independently. Until that gate passes, an
Anima job with an explicit or inherited regional negative prompt is rejected
before enqueue with an actionable explanation; it must not silently become a
global negative prompt.

## Vue Prototype Coverage

The `regional-guidance` scenario includes an entity with an owned mock region, positive prompt, automatic global-negative setting, one reference-image record and a compatibility warning.

The right panel supports add, select, enable/disable, lock, duplicate and delete. Raster, Smart Patch and Regional Guidance rows share a common surface with consistent hover/selection states. Every region shows its existing inline prompt, negative prompt and reference-image blocks regardless of selection, with `+ Prompt`, `+ Negative Prompt` and `+ Reference Image` actions. Text edits, the global-negative switch and reference add/remove participate in Project history. Uploaded image previews remain in-memory data URLs in this prototype.

Opacity lives in the shared properties bar above the stack. For Regional Guidance it controls the mock region overlay's display opacity, not guidance strength. The canvas exposes Transform Region, Lasso, Polygon Lasso, Brush and Eraser and correctly omits Bounding Box actions. Region painting/transforms remain deterministic mock state.

Not yet implemented in the Vue prototype:

- the full shared prompt-editor feature set (regional inputs are plain textareas);
- reference-image reordering, resource metadata/weight controls and durable asset persistence;
- production mask painting/transforms and worker request construction;
- family-specific UI gating for Anima regional reference images and
  pre-enqueue rejection of unsupported regional inputs; the mock currently
  shows only a generic compatibility warning;
- production verification that accepting a result excludes regional inputs from
  provenance (the mock snapshot does not prove the worker/storage path).

## Acceptance Criteria

- User can add/select/toggle/duplicate/delete a Regional Guidance Layer, edit its prompts and add/remove reference images in the prototype; production mask editing and durable resources remain product scope.
- Regional Guidance Layer owns its region/mask, prompts and reference images.
- Regional guidance masks are not standalone or shared.
- User can attach regional guidance images to a Regional Guidance Layer with a
  compatible Illustrious/SDXL model; Anima explains and blocks the incompatibility.
- Enabled regional guidance participates in generation jobs.
- Unsupported regional inputs cannot be silently ignored or enqueued.
- Invoke-style inverse-mask auto-negative is absent for both model families;
  `Use global negative prompt` remains an explicit inheritance choice.
- Generic ControlNet/IP-Adapter regional features are not exposed in MVP.
