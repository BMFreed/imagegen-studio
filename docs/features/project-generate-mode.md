# Project Generate Mode

## Feature

`Generate` is the main working mode inside an opened `Project` tab.

It is not a top-level application tab and not a separate Invoke-like `Generate` page. It is a project mode for generation and local editing on the project canvas.

The mode lets the user:

- generate a new raster result into the project;
- regenerate a selected Smart Patch Layer;
- edit prompts, model settings, LoRAs, embeddings and generation parameters;
- use tag autocomplete for Danbooru-style models;
- use dynamic prompting;
- add regional guidance;
- work with canvas layers, Smart Patch Layer masks and bounding boxes;
- send the flattened project composite to `Upscale`.

## Reference

Primary reference: InvokeAI.

ImageGen Studio follows the InvokeAI-first / no-NIH policy. Generate mode should borrow Invoke's proven generation, prompt, layer and canvas workflows where they fit the ImageGen Studio product model.

Useful InvokeAI areas to adapt:

- `invokeai/frontend/web/src/features/parameters/components/Prompts` — positive/negative prompt editing, prompt actions, prompt history and dynamic prompt preview affordances.
- `invokeai/frontend/web/src/features/parameters/components/Dimensions` and `features/controlLayers/components/common/Bbox` — dimension controls, aspect ratio locking, swap dimensions, optimal size, bounding-box sizing.
- `invokeai/frontend/web/src/features/settingsAccordions/components/Generation` — model selection, LoRA stack, scheduler/steps/guidance settings and model-family-specific advanced options.
- `invokeai/frontend/web/src/features/dynamicPrompts` — prompt expansion preview, max prompts, seed behavior and parse errors.
- `invokeai/frontend/web/src/features/controlLayers/components/RegionalGuidance` — regional prompt guidance entity, adapted without IP Adapter support in MVP.
- `invokeai/frontend/web/src/features/controlLayers/components/CanvasEntityList` — layer/entity list, selected-entity action bar and add-layer menu.
- `invokeai/frontend/web/src/features/controlLayers/components/InpaintMask` — denoise/noise/compositing ideas, adapted into Smart Patch Layer instead of standalone masks.

Secondary reference: Forge / A1111-style web UI.

Forge is not the structural reference for ImageGen Studio's Generate mode, because its Gradio/tab/script model does not match our document-based editor. It still has useful prompt and resource-management details:

- prompt token counters;
- prompt bracket/weight mismatch checker;
- clear/paste/metadata recall style prompt actions;
- LoRA and textual inversion extra-network cards with preview, description, activation text, negative text, metadata, hash and base-model compatibility hints.

These details should be adapted as native Vue/Electron UI. Forge's Gradio implementation is not copied.

## ImageGen Studio Decision

Build `Generate` as an Invoke-like canvas generation mode inside `Project`, adapted to ImageGen Studio's document workflow.

Key decisions:

- no standalone app-level `Generate` tab;
- no `Launchpad`, `Viewer` or permanent Boards sidebar inside Generate;
- no `Choose Prompt Template` dropdown copied from Invoke;
- prompt templates/settings templates are handled by the Presets feature;
- no standalone inpaint mask layers;
- Smart Patch Layer owns its mask, bounding box, internal resolution and raster sub-layers;
- LoRA selector is included;
- Embeddings selector is included as a separate resource picker, not as tag autocomplete;
- LoRAs and Embeddings are separate Generation sections, not one shared `Concepts` menu;
- tag autocomplete is included for Danbooru-style prompt authoring;
- dynamic prompting is included;
- regional guidance is included as prompt guidance, but ControlNet/IP-Adapter/reference-model features are not included in this Generate scope;
- Forge-style prompt token counting, bracket checking and extra-network metadata cards are useful enough to adopt.

## Scope

MVP:

- `Generate` mode inside `Project`;
- project canvas as the central working surface;
- left settings panel for prompts and generation parameters;
- right panel for layer stack and selected-object settings;
- positive and negative prompt editors;
- Danbooru-style tag autocomplete;
- dynamic prompt preview and expansion;
- current working bounding box for generation;
- Smart Patch Layer creation, mask editing, bbox editing and regeneration;
- Raster Layer, Smart Patch Layer and Regional Guidance entities in the layer list;
- model selector for supported model families;
- LoRA selector/list;
- Embeddings selector/list;
- seed, dimensions, sampler/scheduler, steps, guidance/CFG and core SDXL-like parameters;
- VAE / clip skip / CFG rescale / prediction type metadata warnings where applicable;
- immutable generation snapshots stored in `.igs`;
- `Send Composite to Upscale`.

Post-MVP or later:

- ControlNet;
- IP-Adapter;
- reference image adapters;
- ADetailer-like postprocessing;
- Forge script/plugin ecosystem;
- multidiffusion/tiled generation;
- Hires fix as part of Generate;
- complex batch directory processing;
- full workflow graph.

Rejected for this feature:

- Invoke-style `Launchpad`;
- Invoke-style `Viewer` mode inside Generate;
- permanent Boards/sidebar gallery inside Project;
- Forge/Gradio tab layout;
- prompt styles/templates as a copied top-level dropdown;
- wildcard expansion.

## Information Architecture

`Generate` sits inside one `Project` tab:

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

The project mode bar must look different from the document tab strip. It is a compact mode switch for the opened `.igs`, not another row of document tabs.

Generate owns generation UI, but the `Canvas` remains a project entity. Upscale may show its own preview/input/result UI, but it does not create a second project document.

## Generate Layout

Recommended desktop layout:

```text
┌──────────────────────────────────────────────────────────────┐
│ App menu / global status / document tabs                     │
├──────────────────────────────────────────────────────────────┤
│ Project toolbar + Generate | Upscale                         │
├───────────────┬─────────────────────────────┬────────────────┤
│ Settings      │ Canvas                      │ Layers /       │
│               │                             │ selected item  │
│ Prompts       │ bbox handles                │                │
│ Image/BBox    │ masks                       │ layer stack    │
│ Generation    │ raster layers               │ smart patch    │
│ Dynamic       │ regional guidance regions   │ sub-layers     │
│ Compositing   │                             │ snapshots      │
│ Advanced      │                             │                │
└───────────────┴─────────────────────────────┴────────────────┘
```

The left panel contains settings for the current generation operation.

The right panel contains project structure and settings for the selected canvas entity or layer.

Canvas controls should remain close to the canvas. Layer ownership and object-specific settings should remain in the right panel so the user can always tell whether they are editing the global generation setup or a selected layer.

## Prompt Section

Generate has positive and negative prompt editors.

MVP behavior:

- positive prompt is always visible;
- negative prompt can be visible by default or collapsible, but it must be available without changing modes;
- prompt editors support multiline text, resize/expand and prompt history;
- prompt editors support Danbooru-style tag autocomplete;
- prompt editors support prompt attention syntax editing;
- prompt editors show token count for the active model/tokenizer when available;
- prompt editors show bracket/weight mismatch warnings for `()`, `[]` and `{}` style prompt syntax;
- prompt editors expose dynamic prompt preview when the prompt contains dynamic syntax;
- prompt editors can recall prompt text from generation snapshots.

The UI should not show Invoke's `Choose Prompt Template` dropdown as-is. Preset application belongs to the Presets feature.

Allowed preset-related affordances in Generate:

- `Apply Preset`;
- `Save Preset from Current Settings`;
- `Apply Settings from Snapshot`;
- missing-resource warnings after applying a preset.

These actions must be visually distinct from direct prompt editing.

### Prompt Diagnostics

Prompt syntax diagnostics are non-blocking by default.

The user can still press `Generate` when the prompt has bracket or weight warnings, because prompt parsers and model pipelines can differ. The UI should warn clearly without turning prompt writing into a rigid form-validation flow.

Diagnostics should be shown locally in the prompt editor:

- underline or otherwise mark the suspicious text range inside the editor;
- show a warning icon next to the token counter when diagnostics exist;
- open a tooltip/popover from the warning icon or highlighted range;
- use short, concrete messages:
  - `Unclosed "("`;
  - `Unexpected ")"`;
  - `Invalid weight "(tag:abc)"`;
  - `Prompt attention may not be parsed as intended`;
- distinguish severity:
  - yellow warning for suspicious but possibly valid syntax;
  - red warning for definitely broken bracket structure;
- show a pre-generation warning only when the issue is definite and still unresolved.

MVP diagnostics:

- balanced `()`, `[]` and `{}` checks;
- escaped bracket handling where prompt syntax supports it;
- basic prompt attention weight validation for common forms like `(tag:1.2)`;
- token counter integration so syntax warnings and token count live in the same prompt-status area.

Post-MVP:

- replace or extend the checker with a pipeline-aware parser if Diffusers/Invoke prompt parsing exposes enough reliable structure;
- add quick fixes only if they are predictable and do not rewrite creative prompt text unexpectedly.

## Tag Autocomplete

Generate uses the dedicated Tag Autocomplete feature for Danbooru-style prompts.

Rules:

- autocomplete works in positive and negative prompt fields;
- it inserts canonical tags, not aliases;
- it shows tag category/type and source frequency;
- it uses local usage as a ranking signal;
- it is model-aware and can be disabled or de-emphasized for models where Danbooru tags are not useful;
- it does not autocomplete embeddings;
- it does not implement wildcards.

See: `docs/features/tag-autocomplete.md`.

## Dynamic Prompting

Dynamic prompting is included in Generate.

Expected behavior adapted from Invoke:

- dynamic syntax is parsed before queueing generation;
- user can preview expanded prompts before running;
- parse errors are shown near the prompt editor;
- user can configure max expanded prompts;
- user can choose seed behavior:
  - same seed per expanded prompt where appropriate;
  - new/advanced seed per prompt where appropriate;
- generated prompt expansions are stored in the generation snapshot;
- transient expanded-prompt preview state is not persisted as project state.

Important scope rule:

Dynamic prompting does not mean wildcard files. Wildcard expansion is not supported.

## Image And Bounding Box Section

Generate needs dimension controls similar to Invoke, but with clearer ownership.

There are three related concepts:

```text
Canvas Size
= size of the whole project canvas / final composition

Current Working Bounding Box
= the active generation area before it is attached to a Smart Patch Layer

Smart Patch Layer Bounding Box
= the bbox owned by one Smart Patch Layer
```

The UI must never collapse these into one ambiguous control.

### Canvas Size

Canvas Size changes the project canvas.

Canvas Size controls should include:

- width;
- height;
- resize/crop/extend canvas actions;
- output/export size metadata where applicable.

Changing Canvas Size must not silently resize Smart Patch Layer bounding boxes.

### Current Working Bounding Box

The current working bbox is the Invoke-like generation bbox used when the user is preparing a generation operation.

It is used for:

- initial txt2img/new raster generation placement;
- creating a new Smart Patch Layer;
- setting the default area for a local patch operation;
- defining the area sent to the worker when no existing Smart Patch Layer owns the operation.

Controls:

- x/y when relevant;
- width;
- height;
- aspect ratio selector;
- swap width/height;
- lock aspect ratio;
- set optimal size for the selected model;
- fit to canvas;
- fit to selection/mask when available;
- scale before processing:
  - none;
  - auto;
  - manual internal width/height.

The canvas should also expose direct bbox handles. Numeric controls are for precision and repeatability.

### Smart Patch Layer Bounding Box

When a Smart Patch Layer is selected, bbox editing switches from the current working bbox to the selected layer's owned bbox.

The user's proposed popover pattern is a good direction:

- canvas handles remain the primary way to move/resize the bbox;
- the selected Smart Patch Layer row/action bar shows a compact `Bounding Box` button or badge;
- clicking it opens a small popover with precision settings for that layer's bbox;
- the popover uses the same mental model as the main bbox controls, but clearly labels that it edits the selected Smart Patch Layer;
- the popover should include bbox x/y/width/height, internal resolution, aspect lock, fit-to-mask, fit-to-canvas and scale-before-processing;
- changing these values marks the Smart Patch Layer as `outdated` if it already has an active raster sub-layer.

This keeps the main Generate panel from becoming overloaded while preserving precise editing for local patch work.

Hard rule: a Smart Patch Layer bbox is not a global project setting. It belongs to that layer.

## Generation Section

The Generation section is the main Invoke-like model and parameter block.

MVP controls:

- model selector;
- base model family badge;
- prediction type badge/warning where useful, such as `epsilon` or `v_prediction`;
- separate LoRAs selector and selected LoRA stack;
- separate Embeddings selector and selected embeddings stack;
- sampler/scheduler;
- steps;
- guidance/CFG;
- CFG rescale where the active model/pipeline supports it;
- seed;
- randomize seed;
- shuffle/advance seed;
- output count/iterations once queue support is available;
- model compatibility warnings for selected LoRAs/embeddings/presets.

The selected model controls which advanced fields are visible. Unsupported controls should be hidden or disabled with a clear reason.

## LoRA Selector

LoRA selection follows Invoke's compact selector/list pattern, but ImageGen Studio should not use a shared `Concepts` section name.

LoRAs get their own subsection inside `Generation`:

```text
Generation
├─ Model
├─ LoRAs
│  ├─ Add LoRA select
│  └─ selected LoRA list
├─ Embeddings
├─ Sampling
└─ Seed
```

Expected behavior:

- searchable resource picker;
- thumbnails are shown directly in dropdown rows;
- dropdown includes a search field;
- dropdown includes a `Manage Models` action that opens Model Manager;
- dropdown does not include a `Full View` action;
- filter by active model family where possible;
- show preview image when available;
- show name, version, base model family, local availability, hash/version metadata;
- show a compact info button on each dropdown row;
- clicking the info button opens the LoRA metadata popover/card;
- prevent adding the same LoRA twice to the same generation stack;
- allow enable/disable per LoRA;
- allow weight editing per LoRA;
- selected LoRAs are displayed as cards/rows below the selector, not inside the collapsed select field;
- each selected LoRA row has its own info button that opens the same metadata popover/card;
- show missing or incompatible resource warnings when settings come from a snapshot or preset.

The metadata popover/card should include:

- preview thumbnail/image;
- description;
- trigger words / activation text;
- preferred/default weight where known;
- base model family;
- version/hash metadata;
- local file size/path metadata where useful;
- compatibility warnings for the active model.

Large metadata popovers should open only from explicit info-button clicks. They should not appear on plain row hover, so the dropdown remains comfortable for fast selection.

LoRA stack is stored in generation snapshots.

## Embeddings Selector

Embeddings are a separate resource-selection feature, not tag autocomplete.

The Generate UI should expose embeddings near LoRA because both are model concepts/resources.

Embeddings get their own subsection inside `Generation`, separate from LoRAs.

Expected behavior:

- searchable embeddings picker;
- thumbnails are shown directly in dropdown rows when available;
- dropdown includes a search field;
- dropdown includes a `Manage Models` action that opens Model Manager;
- dropdown does not include a `Full View` action;
- filter by active model family where possible;
- show preview/description/metadata when available;
- show activation token and optional negative token;
- show a compact info button on each dropdown row;
- clicking the info button opens the embedding metadata popover/card;
- allow inserting the embedding token into positive prompt, negative prompt, or both;
- selected embeddings are displayed as cards/rows below the selector, not inside the collapsed select field;
- each selected embedding row has its own info button that opens the same metadata popover/card;
- record selected embeddings/resource refs in generation snapshots;
- show missing or incompatible resource warnings when recalled from snapshots/presets.

The metadata popover/card should include:

- preview thumbnail/image when available;
- description;
- activation token;
- negative token when available;
- suggested insertion target: positive, negative or both;
- base model family;
- version/hash metadata;
- local file size/path metadata where useful;
- compatibility warnings for the active model.

MVP can keep embedding weighting conservative:

- default behavior is token insertion/selection;
- explicit embedding weight UI can be added only if the worker/prompt syntax supports it reliably for the active pipeline.

## Regional Guidance

Regional guidance is included in Generate, adapted from Invoke.

ImageGen Studio scope:

- regional prompt guidance entity/layer can be added to the project;
- each regional guidance entity has its own positive prompt;
- negative prompt is supported or can be auto-filled from the global negative prompt;
- the region is editable on canvas;
- enabled regional guidance participates in the generation job;
- regional guidance state is stored in generation snapshots.

MVP exclusions:

- IP Adapter regions;
- ControlNet regions;
- regional reference images;
- complex regional model routing.

Regional guidance is a prompt-control mechanism, not a replacement for Smart Patch Layer.

## Compositing And Smart Patch Settings

Compositing settings from Invoke's inpaint/compositing UI should be adapted into Smart Patch Layer workflow.

Settings belong to the current operation or selected Smart Patch Layer, not to standalone mask layers.

Useful controls:

- denoising strength;
- mask blur;
- edge coherence / coherence mode where supported;
- edge size;
- minimum denoise where supported;
- infill method;
- noise level where supported;
- blend mode;
- opacity;
- show/hide mask overlay;
- mask overlay color/opacity.

When these settings affect an already generated Smart Patch Layer, changing them marks the layer as `outdated`.

## Advanced Section

Advanced controls should be model-aware.

Useful Invoke-like controls:

- VAE selector;
- VAE precision where relevant;
- clip skip where relevant;
- seamless X/Y;
- CFG rescale;
- color correction/compensation where supported;
- model-family-specific encoder/decoder options only when the selected pipeline needs them.

The UI should avoid exposing irrelevant controls for the current model family.

If the user selects a v-prediction model, Generate should use the model metadata to pass the correct prediction type to the worker and store it in the snapshot. This is a model compatibility behavior, not a separate user-facing generation mode.

## Refiner

SDXL Refiner can be supported as a collapsed advanced section if it is available in the worker pipeline.

It is not treated as the same category as ControlNet/IP-Adapter. Refiner is part of SDXL-like generation, while ControlNet/IP-Adapter are additional conditioning model families and stay out of this Generate scope.

If Refiner support is not ready in the first implementation slice, the section should be absent rather than shown disabled by default.

## Center Canvas Tools

Generate canvas tools should include:

- select/move;
- pan;
- zoom;
- bbox edit;
- raster layer transform;
- Smart Patch mask brush;
- Smart Patch mask eraser;
- mask visibility toggle;
- fit view / actual size;
- send composite to Upscale.

Canvas must provide direct manipulation for masks, layers and bounding boxes. Panels and popovers provide precision editing, not the only editing path.

## Right Panel: Layers And Selected Entity

Generate's right panel is project-structure first.

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

Smart Patch Layer display:

- layer status: `empty`, `ready`, `outdated`, `generating`, `failed`;
- active raster sub-layer;
- list/switcher for raster sub-layers;
- bbox size badge;
- internal resolution badge;
- regenerate action;
- bbox popover action;
- mask edit action.

Only one raster sub-layer inside a Smart Patch Layer can be active/visible at a time.

## Generate Action Behavior

Pressing `Generate` creates one or more generation jobs depending on dynamic prompting and iteration settings.

### New Raster Generation

When no Smart Patch Layer is the generation target:

- worker receives prompt/settings/model resources;
- worker receives current working bbox/dimensions;
- result is stored as a raster asset inside `.igs`;
- a new Raster Layer is added or the selected empty target layer is filled;
- generation snapshot is stored with the result.

### Smart Patch Regeneration

When a Smart Patch Layer is the generation target:

- worker receives the flattened source composite for the layer bbox;
- worker receives the layer mask;
- worker receives the layer bounding box;
- worker receives the layer internal resolution;
- worker receives prompt/settings/model resources;
- result is stored as a raster asset inside `.igs`;
- a new raster sub-layer is created inside the Smart Patch Layer;
- the new raster sub-layer becomes active;
- the Smart Patch Layer status becomes `ready`;
- previous raster sub-layers remain available but inactive.

### Regional Guidance

When enabled regional guidance entities exist:

- worker receives their region data and prompts;
- region prompts influence the generation job according to the supported Invoke-like pipeline;
- region state is stored in the generation snapshot.

If the worker cannot support regional guidance for the selected model family, Generate must show a compatibility warning before queueing the job.

## Generation Snapshots

Every generated raster result stores an immutable generation snapshot in `.igs`.

Snapshot should include:

- model identity and version/hash metadata;
- prediction type metadata;
- prompts;
- expanded dynamic prompt text where relevant;
- negative prompt;
- seed and seed behavior;
- dimensions;
- current working bbox or Smart Patch Layer bbox;
- internal resolution;
- sampler/scheduler;
- steps;
- guidance/CFG;
- LoRA stack;
- embeddings refs/tokens;
- regional guidance state used for the job;
- compositing/infill/mask settings;
- source layer/composite hash where relevant;
- worker/backend version metadata where useful.

Snapshots are used for:

- recall settings;
- create preset from image/result;
- detect missing resources;
- explain how a layer/result was produced;
- mark Smart Patch Layer results as stale when editable inputs change.

## Validation And Error States

Generate must handle:

- no model installed;
- selected model unavailable;
- selected model still downloading;
- incompatible LoRA/embedding;
- missing LoRA/embedding from snapshot/preset;
- invalid prompt dynamic syntax;
- prompt bracket mismatch warning;
- bbox outside canvas;
- bbox too small/too large;
- internal resolution unsupported by selected model;
- worker unavailable;
- generation failed;
- Smart Patch Layer outdated;
- regional guidance unsupported for current model.

Warnings should be specific and local to the control that caused them.

## Forge Findings

Adopt from Forge:

- prompt token counter;
- prompt bracket/weight mismatch checker;
- prompt clear/paste/metadata recall actions where they fit our UI;
- LoRA/embedding cards with preview, activation text, negative text, hash, description and metadata;
- resource search/filter details for extra networks.

Do not adopt for Generate MVP:

- Gradio layout;
- Forge tab split into txt2img/img2img/inpaint/sketch;
- Hires fix as a Generate subpanel;
- ControlNet/IP-Adapter/ADetailer/script ecosystem;
- prompt styles as a separate copied dropdown;
- wildcard expansion;
- batch directory processing.

Upscaling is handled by the dedicated `Upscale` project mode, not by Forge-like Hires fix inside Generate.

## Acceptance Criteria

- User can open a `.igs` Project tab and switch to `Generate`.
- Generate shows prompt, model, LoRA, embeddings, dimensions/bbox, dynamic prompt and advanced settings without `Launchpad`, `Viewer` or Boards.
- `Choose Prompt Template` is not present as an Invoke-like dropdown.
- Preset actions exist only as explicit preset actions.
- Positive/negative prompts support tag autocomplete.
- Prompt editor shows token counts and bracket mismatch warnings where tokenizer/model support is available.
- Prompt bracket/weight diagnostics are local, non-blocking by default and shown through inline highlighting plus a warning icon/popover near the token counter.
- Dynamic prompt preview works and invalid dynamic syntax is visible before generation.
- User can add LoRAs and embeddings through separate resource pickers.
- LoRA and embedding selectors are separate sections with thumbnail dropdown rows, search, `Manage Models`, no `Full View`, and explicit info buttons on both dropdown items and selected rows.
- User can create a raster generation into the project.
- User can create and regenerate a Smart Patch Layer.
- Smart Patch Layer owns its mask, bbox, internal resolution and raster sub-layers.
- Selected Smart Patch Layer exposes bbox precision editing through a compact bbox popover plus direct canvas handles.
- User can add regional guidance without enabling ControlNet/IP-Adapter features.
- Generate stores immutable generation snapshots in `.igs`.
- `Send Composite to Upscale` creates an immutable flattened composite input and switches to `Upscale`.
