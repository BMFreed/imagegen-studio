# Project Generation Workspace

Generation happens inside an opened `Project` tab. The internal/domain mode remains `generate`, and `Generate` is the primary action that enqueues work. There is no separate `Create` header or one-option mode switch.

It is not a top-level application tab and not a separate Invoke-like `Generate` page. It is a project-scoped generation and local-editing workspace.

## Feature Map

- [Project document lifecycle](../document-lifecycle.md)
- [Prompt editor](./prompt-editor.md)
- [Prompt diagnostics](./prompt-diagnostics.md)
- [Unified prompt autocomplete](./tag-autocomplete.md)
- [Dynamic prompting](./dynamic-prompting.md)
- [Presets](../../presets.md)
- [Project Canvas and Smart Patch bounds](./image-and-bounding-box.md)
- [Smart Patch Layer](./smart-patch-layer.md)
- [Generation settings](./generation-settings.md)
- [LoRA selector](./lora-selector.md)
- [Embeddings in prompts](./embeddings-selector.md)
- [Regional guidance](./regional-guidance.md)
- [ControlNet follow-up](./controlnet-follow-up.md)
- [Smart Patch compositing settings](./smart-patch-compositing.md)
- [Canvas toolbar](./canvas-toolbar.md)
- [Canvas tools](./canvas-tools.md)
- [Layer stack](./layer-stack.md)
- [Generate action behavior](./generation-actions.md)
- [GenerationResults](./generation-results.md)
- [Generation provenance](./generation-provenance.md)
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
- Generate uses a compact `Apply preset...` action launcher above the settings stack; choosing a preset opens apply preview, copies selected values and does not persist a preset identity in Project;
- no standalone inpaint mask layers;
- Smart Patch Layer owns its mask, layer-owned bounding box, internal resolution and raster sub-layers;
- LoRAs remain a structured stack, embeddings use plain text plus sidecar refs, and enabled LoRA trigger phrases are contextual plain-text matches;
- model-aware secondary controls belong in `Generation > Advanced Options`; the current prototype renders VAE and VAE precision there as non-persistent coverage controls, while CFG rescale is not yet present;
- no separate Invoke-like `Advanced` accordion/dropdown below `Generation`;
- tag autocomplete is included for Danbooru-style prompt authoring;
- dynamic prompting is included;
- Regional Guidance Layer is included with an owned region/mask, regional prompts and regional guidance images, but ControlNet/IP-Adapter as general-purpose feature families are not included in this Generate scope;
- ControlNet is explicitly deferred to post-MVP; first follow-up workflows are tiled upscale, pose control, depth control and Canny/contour control;
- Regional Guidance remains a separate conditioning section. The current prototype exposes select/enable/lock/duplicate/delete, inline `+ Prompt`, `+ Negative Prompt` and `+ Reference Image` blocks, reference add/remove and compatibility status; production mask authoring and resource persistence remain outside the prototype;
- layer rows use Photoshop-like visibility placement: visibility button sits left of the thumbnail/preview, while warning/status, lock and delete stay in row actions/status areas;
- Project Canvas is the document work area and replaces the old idea of a global/current working bbox;
- the domain mode remains `generate`; `Generate` starts generation without a redundant `Create` label or mode switch;
- txt2img/img2img/inpaint/outpaint is derived automatically from visible raster/mask content inside the frozen target area, not selected manually;
- normal generation settings belong to Project, while each Smart Patch Layer owns its own generation draft;
- viewport controls live in a compact bottom bar near the canvas: zoom, `Fit View` and context-sensitive interaction hints;
- Project Canvas numeric resize/fit actions live in the left `Size` section, while direct crop/resize manipulation is exposed as `Crop / Resize Project Canvas` in the left canvas rail;
- the Project Canvas size label is a canvas-area overlay at top-left. The current top-right rail control collapses the details panel; a separate canvas context menu has not been implemented or validated;
- the left canvas rail groups the settings-panel collapse button, `Pan Tool`, `Crop / Resize Project Canvas` and contextual tools in one vertically centered container; the right-panel collapse button remains centered at its edge. Layer-specific mask/region tools appear only for Smart Patch Layer and Regional Guidance Layer;
- `Fit Patch BBox to Mask` is a Smart Patch Layer contextual toolbar action, not a global canvas toolbar action, and it is not shown for Regional Guidance Layer;
- ordinary Raster Layer canvas editing is not included in MVP;
- `GenerationResults` is a compact floating staging strip above the bottom canvas edge with separate focused preview and multi-selection state;
- completed outputs remain temporary candidates until the user explicitly adds one or more to Project;
- accepted normal candidates become independent Raster Layers; accepted Smart Patch candidates become layer-owned variants;
- only accepted results receive immutable generation provenance and global history entries;
- Raster and Smart Patch Layer context menus expose the same read-only
  `Generated with` / `Current Canvas` provenance comparison popover;
- that comparison and `Save Preset from Result` use only portable generation
  configuration; Smart Patch mask, bbox, internal resolution and compositing are
  layer properties reused through `Duplicate Layer`;
- Queue Manager owns jobs, not result history, and staging state is not undoable;
- the Generate action area is fixed at the top of the left panel, above the scrolling settings stack; its grid keeps `Generate` plus images-per-click on the left and icon-only queue plus cancel actions on the right;
- Queue pause/resume is not exposed in the current Project scope;
- Upscale is deferred to a separate Project pass and does not block the Project generation prototype;
- Forge-style prompt token counting, bracket checking and extra-network metadata cards are useful enough to adopt.

## Layout

Recommended desktop layout:

```text
Document tab strip
├─ Home
├─ Project: portrait.igs
└─ Project: background.igs

Project: portrait.igs
└─ Generation workspace
   ├─ left settings panel
   │  ├─ fixed Generate action area
   │  └─ scrolling settings stack
   ├─ center canvas
   └─ right layer/settings panel
```

```text
┌──────────────────────────────────────────────────────────────┐
│ App menu / global status / document tabs                     │
├──────────────────────────────────────────────────────────────┤
│ Project generation workspace                                 │
├───────────────┬─────────────────────────────┬────────────────┤
│ Settings      │ Canvas                      │ Layers /       │
│               │                             │ selected item  │
│ Generate      │ Project Canvas frame        │ blend / opacity│
│               │ canvas-area overlays        │ layer stack    │
│ Preset action │ masks                       │ regional       │
│ Size          │ raster layers               │ guidance       │
│ Prompts       │ raster layers               │ smart patch    │
│ LoRA stack    │ smart patch active variants │ selected       │
│ Generation    │ regional guidance regions   │ entity details │
│               │ floating results strip      │                │
└───────────────┴─────────────────────────────┴────────────────┘
```

The left panel starts with the fixed Generate action bar and contains the scrolling generation settings. No `Create` label or one-option mode switch is rendered. A target label appears only for Smart Patch generation; a mode switch is introduced only when another real mode is designed.

The right panel contains a compact selected-entity properties bar above the stack. Raster and Regional display opacity share this location; Raster blend mode sits alongside it. Regional prompt/reference blocks and Smart Patch details remain visible inside every row regardless of selection. Selecting a layer must not change row heights or move neighboring layers. All types share the same presentation-only row component: typed Vue provide/inject supplies row state and commands, and named slots supply previews, extra actions and details. The base component has no dependency on layer types, ProjectSession or history.

Canvas controls should remain close to the canvas. Viewport controls and interaction hints live in the bottom canvas bar; canvas-area metadata/actions live as overlays near the canvas edges; layer ownership and object-specific settings remain in the right panel so the user can always tell whether they are editing the global generation setup or a selected layer.

## Prototype Coverage

The interactive Vue/Naive UI implementation is available at `?prototype=project`. It is the source of truth for current Project layout, visible labels, mock interactions and responsive behavior.

Stable query scenarios are:

- `default` — a populated clean project with Raster Layer selected;
- `smart-patch` — a selected self-contained Smart Patch with mask, bbox and accepted variants;
- `regional-guidance` — selected regional conditioning with prompt, reference image and compatibility warning;
- `staging` — completed and running queue items with multi-selected temporary candidates;
- `empty-project` — transparent canvas with no raster input and disabled denoising;
- `errors` — local model, LoRA, prompt, candidate, Smart Patch and save error states.

The prototype uses a three-panel editor shell with resizable and collapsible side panels. Generation settings are stacked cards in one independently scrolling left panel; they do not reuse the modal accordion layout. Project follows the app-wide 13px density foundation, uses 12px metadata, consistent semibold card headings and keeps the compact viewport bar flush with the bottom of the canvas workspace. Project tool rails, layer actions and Regional Guidance actions use a consistent 18px icon scale.

The central canvas is a deterministic DOM/CSS simulation rather than a Konva or raster engine. Zoom, pointer pan, tool/context switching, layer visibility, Smart Patch variant preview, staging preview and the deterministic `Fit Patch BBox to Mask` command are interactive. Crop/bbox/mask/region overlays validate placement and state transitions, but they do not yet provide production pixel painting, general handle-based geometry editing, raster transforms or a real compositor.

Current left-panel coverage is intentionally narrower than the full product scope:

| Area       | Current Vue behavior                                                                                                                                                                                                                         |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preset     | One-shot chooser opens the shared editable Apply modal; manage and save-current actions open the existing manager flows; no preset identity remains in Project.                                                                              |
| Size       | Aspect catalog, CSS preview, ratio lock, width/height, swap and deterministic fit-to-visible-layers behavior.                                                                                                                                |
| Prompts    | Shared CodeMirror 6 plain-text editor, native selection/bulk editing, phrase attention, local autocomplete, embedding refs, contextual active-LoRA highlights, copy/clear and dynamic preview.                                               |
| LoRAs      | Add, enable/disable, weight and remove. Stack changes never rewrite prompt text or open an orphan dialog.                                                                                                                                    |
| Generation | Model selection, read-only version, sampler, scheduler, steps, CFG and context-disabled denoising. VAE/precision are visible prototype controls but are not yet wired into the Project document. Seed, CFG rescale and clip skip are absent. |
| Queue      | Integer images-per-click from 1 through 100, sequential in-memory jobs, active badge, cancel-current and a compact project queue panel.                                                                                                      |

Current right-panel coverage is also explicit: Raster and Smart Patch share a flat sortable stack; Regional Guidance is separate; selection, visibility, lock, duplicate, delete, pointer reorder and overflow move actions work for compositing layers. Raster opacity/blend, regional display opacity, regional prompts/negative source and reference add/remove update session state through Project history. Opacity changes the mock region overlay; Raster compositing and full Smart Patch precision forms still require production implementation.

Undo and Redo live in the bottom viewport bar, the `Edit` menu and keyboard shortcuts. Queue progress and temporary candidate selection are deliberately excluded from document history; accepting candidates creates one grouped persistent mutation.

## Acceptance Criteria

- User can open a `.igs` Project tab and generate through the fixed action bar, backed by domain mode `generate`.
- Generate shows structured prompts, model, LoRA, Project Canvas controls, Smart Patch context, dynamic prompt preview and the currently covered advanced controls without `Launchpad`, `Viewer` or Boards.
- `Choose Prompt Template` is not present as an Invoke-like dropdown.
- Preset actions exist through the explicit action launcher/apply-preview workflow described in [Presets](../../presets.md), and Project never retains a selected preset identity.
- Project does not show a separate title/status toolbar above the workspace; project identity and dirty state belong to the document tab.
- `GenerationResults` supports focused preview plus explicit multi-selection and never auto-commits completed outputs.
- left and right panels can be resized, collapsed and restored without losing Project UI state;
- the fixed Generate action bar remains visible at the top of the left panel while stacked settings scroll independently;
- txt2img/img2img/inpaint/outpaint remain internal request-building states; the UI explains only control availability and never asks the user to choose or monitor a workflow label;
- accepted Project candidates become independent Raster Layers, while accepted Smart Patch candidates become variants owned by that layer;
- Project UI state survives document-tab switching within the prototype session;
- Upscale behavior is explicitly outside the current Project prototype pass.
- Generate feature behavior is covered by the individual feature docs in this folder.
