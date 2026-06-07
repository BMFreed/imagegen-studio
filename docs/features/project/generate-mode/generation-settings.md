# Generation Settings

## Feature

Generation settings define the model and core inference parameters for the current Generate operation.

## Reference

Reference: InvokeAI Generation and Advanced settings accordions.

## ImageGen Studio Decision

Use an Invoke-like model-aware settings panel, adapted to ImageGen Studio's supported model families and worker protocol.

LoRAs and Embeddings are separate sections. They are not grouped under one shared `Concepts` label.

## Scope

MVP controls:

- model selector;
- base model family badge;
- prediction type badge/warning where useful, such as `epsilon` or `v_prediction`;
- separate LoRAs selector and selected LoRA stack;
- separate Embeddings selector and selected embeddings stack;
- sampler/scheduler;
- steps;
- guidance/CFG;
- denoising strength;
- CFG rescale where the active model/pipeline supports it;
- seed;
- randomize seed;
- shuffle/advance seed;
- output count/iterations once queue support is available;
- model compatibility warnings for selected LoRAs/embeddings/presets.

Advanced controls:

- VAE selector;
- VAE precision where relevant;
- clip skip where relevant;
- seamless X/Y;
- CFG rescale;
- color correction/compensation where supported;
- model-family-specific encoder/decoder options only when the selected pipeline needs them.

## Model-Aware Visibility

The selected model controls which fields are visible.

Unsupported controls should be hidden or disabled with a clear reason.

If the user selects a v-prediction model, Generate should use the model metadata to pass the correct prediction type to the worker and store it in the snapshot. This is a model compatibility behavior, not a separate user-facing generation mode.

## Acceptance Criteria

- User can select a model and configure core sampling parameters.
- Unsupported controls are not shown as generic always-on clutter.
- Prediction type metadata is passed to the worker and stored in snapshots.
- LoRAs and Embeddings appear as separate sections inside Generation.
- Denoising strength is shown in Generation settings, not above or inside the layer stack.
