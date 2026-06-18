# Project / Generate Mode

`Generate` is the main working mode inside an opened `Project` tab.

It is not a top-level application tab and not a separate Invoke-like `Generate` page. It is a project mode for generation and local editing on the project canvas.

## Feature Map

- [Prompt editor](./prompt-editor.md)
- [Prompt diagnostics](./prompt-diagnostics.md)
- [Tag autocomplete](./tag-autocomplete.md)
- [Dynamic prompting](./dynamic-prompting.md)
- [Presets](../../presets.md)
- [Project canvas and bounding boxes](./image-and-bounding-box.md)
- [Smart Patch Layer](./smart-patch-layer.md)
- [Generation settings](./generation-settings.md)
- [LoRA selector](./lora-selector.md)
- [Embeddings selector](./embeddings-selector.md)
- [Regional guidance](./regional-guidance.md)
- [ControlNet follow-up](./controlnet-follow-up.md)
- [Smart Patch compositing settings](./smart-patch-compositing.md)
- [Canvas toolbar](./canvas-toolbar.md)
- [Canvas tools](./canvas-tools.md)
- [Layer stack](./layer-stack.md)
- [Generate action behavior](./generation-actions.md)
- [GenerationResults](./generation-results.md)
- [Generation snapshots](./generation-snapshots.md)
- [Validation and error states](./validation-and-errors.md)

## Reference

Primary reference: InvokeAI.

ImageGen Studio follows the InvokeAI-first / no-NIH policy. Generate mode should borrow Invoke's proven generation, prompt, layer and canvas workflows where they fit the ImageGen Studio product model.

Useful InvokeAI areas to adapt:

- `invokeai/frontend/web/src/features/parameters/components/Prompts` — positive/negative prompt editing, prompt actions, prompt history and dynamic prompt preview affordances.
- `invokeai/frontend/web/src/features/parameters/components/Dimensions` and `features/controlLayers/components/common/Bbox` — dimension controls, aspect ratio locking, swap dimensions, optimal size, bounding-box sizing.
- `invokeai/frontend/web/src/features/settingsAccordions/components/Generation` — model selection, LoRA stack, scheduler/steps/guidance settings and model-family-specific advanced options.
- `invokeai/frontend/web/src/features/dynamicPrompts` — prompt expansion preview, max prompts, seed behavior and parse errors.
- `invokeai/frontend/web/src/features/controlLayers/components/RegionalGuidance` — regional prompt/image guidance layer/entity with owned region/mask, prompt blocks and reference images, adapted without exposing generic IP-Adapter/ControlNet feature families.
- `invokeai/frontend/web/src/features/controlLayers/components/CanvasEntityList` — layer/entity list, selected-entity action bar and add-layer menu.
- `invokeai/frontend/web/src/features/controlLayers/components/InpaintMask` — denoise/noise/compositing ideas, adapted into Smart Patch Layer instead of standalone masks.

Secondary reference: Forge / A1111-style web UI.

Forge is not the structural reference for ImageGen Studio's Generate mode, because its Gradio/tab/script model does not match our document-based editor. It still has useful prompt and resource-management details:

- prompt token counters;
- prompt bracket/weight mismatch checker;
- clear/paste/metadata recall style prompt actions;
- LoRA and textual inversion extra-network cards with preview, description, activation text, negative text, metadata, hash and base-model compatibility hints.

These details should be adapted as native Vue/Electron UI. Forge's Gradio implementation is not copied.

## Global Decisions

- no standalone app-level `Generate` tab;
- no `Launchpad`, `Viewer` or permanent Boards sidebar inside Generate;
- no `Choose Prompt Template` dropdown copied from Invoke;
- prompt templates/settings templates are handled by the Presets feature;
- Generate uses a compact Invoke-like preset selector above the prompt editor, but selecting a preset opens apply preview and supports partial apply instead of silently overwriting settings;
- no standalone inpaint mask layers;
- Smart Patch Layer owns its mask, layer-owned bounding box, internal resolution and raster sub-layers;
- LoRAs and Embeddings are separate Generation sections, not one shared `Concepts` menu;
- VAE, VAE precision and CFG rescale live in `Generation > Advanced Options`;
- no separate Invoke-like `Advanced` accordion/dropdown below `Generation`;
- tag autocomplete is included for Danbooru-style prompt authoring;
- dynamic prompting is included;
- Regional Guidance Layer is included with an owned region/mask, regional prompts and regional guidance images, but ControlNet/IP-Adapter as general-purpose feature families are not included in this Generate scope;
- ControlNet is explicitly deferred to post-MVP; first follow-up workflows are tiled upscale, pose control, depth control and Canny/contour control;
- Regional Guidance Layer follows Invoke's inline layer-stack controls: `+ Prompt`, `+ Negative Prompt`, `+ Reference Image`;
- layer rows use Photoshop-like visibility placement: visibility button sits left of the thumbnail/preview, while warning/status, lock and delete stay in row actions/status areas;
- Project Canvas is the document work area and replaces the old idea of a global/current working bbox;
- canvas toolbar includes viewport zoom, fit view and fit Project Canvas to visible/selected Raster Layers, but does not copy Invoke's project/gallery/snapshot/session buttons;
- canvas side controls always show panel collapse buttons and `View`; layer-specific mask/region tools appear only for Smart Patch Layer and Regional Guidance Layer;
- `Fit Patch BBox to Mask` is a Smart Patch Layer contextual toolbar action, not a global canvas toolbar action, and it is not shown for Regional Guidance Layer;
- ordinary Raster Layer canvas editing is not included in MVP;
- `GenerationResults` is included for browsing and cleaning up recent generated results;
- completed generation results auto-commit into `.igs` as Raster Layers or Smart Patch raster sub-layer variants;
- Forge-style prompt token counting, bracket checking and extra-network metadata cards are useful enough to adopt.

## Layout

Recommended desktop layout:

```text
Document tab strip
├─ Home
├─ Project: portrait.igs
└─ Project: background.igs

Project: portrait.igs
├─ project mode bar: Generate | Upscale
└─ Generate mode
   ├─ left settings panel
   ├─ center canvas
   └─ right layer/settings panel
```

```text
┌──────────────────────────────────────────────────────────────┐
│ App menu / global status / document tabs                     │
├──────────────────────────────────────────────────────────────┤
│ Project toolbar + Generate | Upscale                         │
├───────────────┬─────────────────────────────┬────────────────┤
│ Settings      │ Canvas                      │ Layers /       │
│               │                             │ selected item  │
│ Presets       │ Project Canvas frame        │                │
│ Prompts       │ masks                       │ layer stack    │
│ Canvas/BBox   │ raster layers               │ smart patch    │
│ Generation    │ raster layers               │ smart patch    │
│ Dynamic       │ regional guidance regions   │ sub-layers     │
│ Compositing   │                             │ snapshots      │
└───────────────┴─────────────────────────────┴────────────────┘
```

The left panel contains settings for the current generation operation.

The right panel contains project structure and settings for the selected canvas entity or layer.

Canvas controls should remain close to the canvas. Layer ownership and object-specific settings should remain in the right panel so the user can always tell whether they are editing the global generation setup or a selected layer.

## Acceptance Criteria

- User can open a `.igs` Project tab and switch to `Generate`.
- Generate shows prompt, model, LoRA, embeddings, Project Canvas controls, Smart Patch bbox controls, dynamic prompt and advanced settings without `Launchpad`, `Viewer` or Boards.
- `Choose Prompt Template` is not present as an Invoke-like dropdown.
- Preset actions exist through the explicit compact selector/apply preview workflow described in [Presets](../../presets.md).
- Generate feature behavior is covered by the individual feature docs in this folder.
