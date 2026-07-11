# Generation Settings

## Feature

Generation settings define the model and core inference parameters for the current Generate operation.

## Reference

Reference: InvokeAI Generation and Advanced settings accordions.

ImageGen Studio adapts Invoke's controls, but not Invoke's separate lower `Advanced` accordion.

## ImageGen Studio Decision

Use an Invoke-like model-aware settings panel, adapted to ImageGen Studio's supported model families and worker protocol.

Project does not ask the user to choose Text to Image or Image to Image. The runtime generation path is derived from visible raster/mask content in the current target area when the job is frozen.

Normal Project Canvas generation uses a project-owned generation draft. Each Smart Patch Layer owns its own generation draft; selecting a Smart Patch Layer binds the settings panel to that layer, so edits only affect and potentially mark that layer `outdated`.

LoRAs remain structured generation resources. Embeddings live inside the positive or negative structured prompt as resource-bearing tokens.

All generation-related advanced controls live inside the `Generation` card's own `Advanced Options` area. Do not create a separate Invoke-like `Advanced` dropdown/accordion below `Generation`.

## Scope

Product MVP controls:

- model selector;
- model version selector for the selected model;
- base model family badge;
- prediction type badge/warning where useful, such as `epsilon` or `v_prediction`;
- separate LoRAs selector and selected LoRA stack;
- unified prompt autocomplete for embeddings and active LoRA trigger phrases;
- sampler/scheduler;
- steps;
- guidance/CFG;
- denoising strength, visible but disabled with a reason when the current target has no raster input or the selected model does not support it;
- seed;
- randomize seed;
- shuffle/advance seed;
- images per click beside `Generate` in the fixed action bar immediately below the `Create` tab rather than duplicated inside the settings card;
- model compatibility warnings for selected LoRAs/embeddings/presets.

`Generation > Advanced Options` controls:

- VAE selector;
- VAE precision where relevant, preferably `Auto` by default with manual precision only as an advanced troubleshooting/performance control;
- CFG rescale where the active model/pipeline supports it;
- clip skip where relevant;
- model-family-specific encoder/decoder options only when the selected pipeline needs them.

Rejected for MVP:

- separate Invoke-like `Advanced` dropdown/accordion outside `Generation`;
- seamless X/Y toggles as generic Generate controls;
- generic color correction/compensation as a Generate control.

## Project Settings Order

The compact Project panel uses this stable order: Preset actions, Size, Prompt, Negative Prompt, LoRAs, Generation and contextual Smart Patch compositing. The Add LoRA control stays above selected rows; embeddings are inserted through each prompt's inline autocomplete.

The UI does not display a persistent txt2img/img2img label such as `Canvas content`. The derived request type is frozen into queue/provenance data; only contextual reasons such as disabled denoising are exposed to the user.

If color matching is needed later, design it as a Smart Patch/compositing behavior such as `Match source colors`, not as an always-visible global generation toggle.

## Vue Prototype Coverage

The current Project settings stack implements:

- one-shot Preset actions;
- Size before Prompt/Negative Prompt;
- structured positive/negative prompt editors;
- the shared LoRA stack;
- model selection;
- a read-only selected model version field;
- sampler, scheduler, steps, CFG and Denoising Strength;
- images-per-click as an integer input from 1 through 100 in the fixed Generate bar;
- an `Advanced Options` disclosure containing VAE and VAE precision controls.

The VAE and precision selects currently validate composition only and are not wired back into the Project generation draft. The prototype does not yet expose seed/randomize/shuffle, CFG rescale, clip skip, editable model-version selection or model-family/prediction badges. These remain product requirements, not claims about current interactive coverage.

Selecting a Smart Patch binds the visible settings to its layer-owned draft. Denoising stays visible and is disabled with an explanation when the effective target has no raster input. The prototype uses deterministic layer coverage metadata for this decision because it has no pixel compositor.

## Model-Aware Visibility

The selected model controls which fields are visible.

Unsupported controls should be hidden or disabled with a clear reason.

The selected model version is project-local state in the product model. The current prototype displays it as a disabled readout. A production `Version` select populated from Model Manager's installed versions remains required.

Rules:

- new selections default to the latest installed/default version from Model Manager;
- existing `.igs` projects preserve their exact selected version;
- changing the version in Generate updates the current project settings and future jobs for that project;
- changing Model Manager's default version must not silently rewrite open projects, presets or accepted-result provenance;
- if the exact version used by a project is missing, show a missing-resource warning and offer to open Model Manager.

If the user selects a v-prediction model, Generate should use the model metadata to pass the correct prediction type to the worker and store it in accepted-result provenance. This is a model compatibility behavior, not a separate user-facing generation mode.

## Acceptance Criteria

- User can select a model and configure core sampling parameters.
- Project derives txt2img/img2img/inpaint/outpaint from the frozen target-area composite rather than a manual workflow toggle.
- Normal generation and each Smart Patch Layer have correctly scoped generation drafts.
- Product implementation lets the user select an installed version; the current prototype only displays the selected version.
- Unsupported controls are not shown as generic always-on clutter.
- Prediction type metadata is passed to the worker and stored in accepted-result provenance.
- LoRAs have a structured stack; embeddings are prompt tokens and have no standalone section.
- Denoising strength is shown in Generation settings, not above or inside the layer stack.
- Denoising strength stays visible but explains its disabled state when the current target has no applicable raster input.
- Model-aware secondary controls live in `Generation > Advanced Options`; current prototype coverage is limited to visible VAE and VAE precision controls.
- A separate Invoke-like `Advanced` accordion is not implemented.
- Seamless X/Y and generic color compensation are excluded from MVP Generate settings.
