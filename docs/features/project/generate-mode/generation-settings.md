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

LoRAs and Embeddings are separate sections. They are not grouped under one shared `Concepts` label.

All generation-related advanced controls live inside the `Generation` card's own `Advanced Options` area. Do not create a separate Invoke-like `Advanced` dropdown/accordion below `Generation`.

## Scope

MVP controls:

- model selector;
- model version selector for the selected model;
- base model family badge;
- prediction type badge/warning where useful, such as `epsilon` or `v_prediction`;
- separate LoRAs selector and selected LoRA stack;
- separate Embeddings selector and selected embeddings stack;
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

The compact Project panel uses this stable order: Preset actions, Size, Prompt, Negative Prompt, LoRAs, Embeddings, Generation and contextual Smart Patch compositing. Add LoRA and Add Embedding controls stay above their selected rows so they do not move as stacks grow.

The UI does not display a persistent txt2img/img2img label such as `Canvas content`. The derived request type is frozen into queue/provenance data; only contextual reasons such as disabled denoising are exposed to the user.

If color matching is needed later, design it as a Smart Patch/compositing behavior such as `Match source colors`, not as an always-visible global generation toggle.

## Model-Aware Visibility

The selected model controls which fields are visible.

Unsupported controls should be hidden or disabled with a clear reason.

The selected model version is project-local state. Generate shows a `Version` select in the selected model card, populated from Model Manager's installed versions for that model identity.

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
- User can select the installed version of the selected model.
- Unsupported controls are not shown as generic always-on clutter.
- Prediction type metadata is passed to the worker and stored in accepted-result provenance.
- LoRAs and Embeddings appear as separate sections inside Generation.
- Denoising strength is shown in Generation settings, not above or inside the layer stack.
- Denoising strength stays visible but explains its disabled state when the current target has no applicable raster input.
- VAE, VAE precision and CFG rescale live in `Generation > Advanced Options`.
- A separate Invoke-like `Advanced` accordion is not implemented.
- Seamless X/Y and generic color compensation are excluded from MVP Generate settings.
