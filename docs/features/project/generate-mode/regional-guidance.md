# Regional Guidance

## Feature

Regional guidance lets the user apply prompt and image guidance to a specific canvas region during generation.

## Reference

Reference: InvokeAI Regional Guidance entities.

## ImageGen Studio Decision

Include regional prompt guidance and regional guidance images in Generate.

Do not include generic IP Adapter or ControlNet region features in MVP.

Regional guidance images are a narrow exception inside this feature. They may use an Invoke-like regional reference image mechanism internally, but the product does not expose generic IP-Adapter, ControlNet or arbitrary reference-adapter workflows in MVP.

Regional guidance is a prompt-control mechanism, not a replacement for Smart Patch Layer.

## Scope

MVP:

- add regional guidance entity/layer;
- edit region on canvas;
- region has its own positive prompt;
- negative prompt is supported or can be auto-filled from the global negative prompt;
- attach one or more regional guidance images;
- show regional guidance image thumbnails in the entity/settings UI;
- remove/reorder regional guidance images;
- enable/disable region;
- include enabled regional guidance in generation jobs;
- store regional guidance state in generation snapshots;
- show compatibility warning if worker/model family does not support it.

Post-MVP:

- more advanced regional weighting;
- region presets;
- region copy/merge operations if they prove useful.

Rejected for MVP:

- standalone IP Adapter regions outside Regional Guidance;
- standalone ControlNet regions;
- complex regional model routing.

## UI Behavior

Regional Guidance appears in the layer/entity stack.

It should expose:

- name;
- visibility/enabled state;
- region bbox/shape;
- positive prompt;
- negative prompt behavior;
- regional guidance image thumbnails;
- add/remove/reorder image actions;
- compatibility status;
- delete/duplicate actions where useful.

The region should be directly editable on canvas. Numeric precision controls can live in selected-entity settings if needed.

## Worker Behavior

When enabled regional guidance entities exist:

- worker receives their region data and prompts;
- worker receives regional guidance image asset refs and metadata;
- region prompts influence the generation job according to the supported Invoke-like pipeline;
- region state is stored in the generation snapshot.

If the worker cannot support regional guidance or regional guidance images for the selected model family, Generate must show a compatibility warning before queueing the job.

## Acceptance Criteria

- User can add and edit a regional guidance entity.
- User can attach regional guidance images to a regional guidance entity.
- Enabled regional guidance participates in generation jobs.
- Unsupported regional guidance shows a compatibility warning.
- Generic ControlNet/IP-Adapter regional features are not exposed in MVP.
