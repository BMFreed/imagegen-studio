# Validation And Error States

## Feature

Generate must surface errors and warnings close to the controls or entities that caused them.

## Reference

Reference: InvokeAI local settings warnings and Forge prompt warning ideas, adapted to ImageGen Studio's project UI.

## ImageGen Studio Decision

Prefer local, actionable warnings over global error banners.

Global app errors are reserved for worker/app-level failures. Prompt, model-resource, bbox and layer warnings should live near the affected UI.

## States

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
- regional guidance images unsupported for current model.

## Placement Rules

- prompt diagnostics live in the prompt editor status area;
- missing/incompatible LoRA warnings live on LoRA rows and selector rows;
- missing/incompatible embedding warnings live on embedding rows and selector rows;
- bbox validity warnings live near bbox controls and canvas handles;
- Smart Patch `outdated` status lives on the layer row and selected-layer controls;
- worker unavailable/failed state can appear in global status and in Generate action area;
- regional guidance compatibility warnings live on regional guidance entity rows/settings.
- candidate staging errors live in StagingArea.

## Blocking Rules

Block generation when:

- no compatible model is selected;
- worker is unavailable;
- bbox/internal resolution cannot produce a valid worker request;
- required source assets for Smart Patch regeneration are missing.

Warn but allow generation when:

- prompt diagnostics are non-fatal;
- LoRA/embedding compatibility is uncertain but resource exists;
- dynamic prompt expansion is large but within configured limits.

## Acceptance Criteria

- Warnings are local to the affected control/entity.
- Definite invalid worker requests block generation.
- Non-fatal prompt diagnostics do not block generation.
- User can understand why `Generate` is disabled when it is disabled.
