# Generation Settings

## Feature

Generation settings define the model and core inference parameters for the current Generate operation.

## Reference

Reference: InvokeAI Generation and Advanced settings accordions.

ImageGen Studio adapts Invoke's controls, but not Invoke's separate lower `Advanced` accordion.

## ImageGen Studio Decision

Use an Invoke-like model-aware settings panel, adapted to ImageGen Studio's supported model families and worker protocol.

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
- denoising strength;
- seed;
- randomize seed;
- shuffle/advance seed;
- output count/iterations once queue support is available;
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

If color matching is needed later, design it as a Smart Patch/compositing behavior such as `Match source colors`, not as an always-visible global generation toggle.

## Model-Aware Visibility

The selected model controls which fields are visible.

Unsupported controls should be hidden or disabled with a clear reason.

The selected model version is project-local state. Generate shows a `Version` select in the selected model card, populated from Model Manager's installed versions for that model identity.

Rules:

- new selections default to the latest installed/default version from Model Manager;
- existing `.igs` projects preserve their exact selected version;
- changing the version in Generate updates the current project settings and future jobs for that project;
- changing Model Manager's default version must not silently rewrite open projects, presets or generation snapshots;
- if the exact version used by a project is missing, show a missing-resource warning and offer to open Model Manager.

If the user selects a v-prediction model, Generate should use the model metadata to pass the correct prediction type to the worker and store it in the snapshot. This is a model compatibility behavior, not a separate user-facing generation mode.

## Acceptance Criteria

- User can select a model and configure core sampling parameters.
- User can select the installed version of the selected model.
- Unsupported controls are not shown as generic always-on clutter.
- Prediction type metadata is passed to the worker and stored in snapshots.
- LoRAs and Embeddings appear as separate sections inside Generation.
- Denoising strength is shown in Generation settings, not above or inside the layer stack.
- VAE, VAE precision and CFG rescale live in `Generation > Advanced Options`.
- A separate Invoke-like `Advanced` accordion is not implemented.
- Seamless X/Y and generic color compensation are excluded from MVP Generate settings.
