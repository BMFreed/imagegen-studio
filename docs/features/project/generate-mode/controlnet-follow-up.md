# ControlNet Follow-Up

## Feature

Post-MVP ControlNet support for Generate mode.

ControlNet is not part of the MVP Generate scope. This document records the first ControlNet workflows ImageGen Studio should consider after MVP, without reopening generic ControlNet/IP-Adapter feature families for the initial release.

## Scope

Post-MVP priority:

- tiled upscale;
- pose control;
- depth control;
- Canny / contour control.

Other ControlNet types should be added only when a real user workflow proves they are needed. Do not expand the scope into a broad ControlNet catalog by default.

## Reference

Use both InvokeAI and Forge as references, but for different reasons.

InvokeAI is the better architectural reference:

- ControlNet-like guidance is represented as a canvas entity/layer;
- the layer is rasterized into a control image for the generation graph;
- compatibility warnings and model-family limits are handled close to generation setup;
- ControlNet, T2I Adapter and Control LoRA are grouped behind the broader Control Layer concept.

Useful Invoke source areas:

- `invokeai/frontend/web/src/features/controlLayers/components/ControlLayer`;
- `invokeai/frontend/web/src/features/controlLayers/store/filters.ts`;
- `invokeai/frontend/web/src/features/nodes/util/graph/generation/addControlAdapters.ts`;
- `invokeai/app/invocations/controlnet.py`.

Forge is the better feature-surface reference:

- multiple ControlNet units;
- explicit preprocessor selection;
- preprocessor preview;
- Pixel Perfect behavior;
- Control Weight;
- timestep / guidance start-end range;
- Control Mode;
- Resize Mode;
- tiled upscale oriented ControlNet workflows.

Useful Forge source areas:

- `extensions-builtin/sd_forge_controlnet/scripts/controlnet.py`;
- `extensions-builtin/sd_forge_controlnet/lib_controlnet/controlnet_ui/controlnet_ui_group.py`.

## Product Decision

MVP keeps generic ControlNet out of Generate mode.

After MVP, ImageGen Studio may introduce a document-native ControlNet workflow. It should not copy Forge's Gradio UI directly, but it should preserve Forge's practical ControlNet controls where they matter for the four priority workflows.

Preferred direction:

- keep ControlNet as project/canvas-aware guidance, not as a disconnected settings block;
- keep controls compact by default, with advanced controls available per ControlNet entry;
- support multiple ControlNet entries only when the selected workflow needs it;
- show generated/preprocessed control images clearly before generation;
- keep ControlNet results reproducible in generation snapshots and `.igs` project state.

## Priority Workflows

### Tiled Upscale

Goal: upscale an image while preserving local detail and avoiding obvious tiling seams.

Expected capabilities:

- select an existing raster/composite image as source;
- generate or reuse a tile/control image where applicable;
- choose an upscale model/workflow;
- configure strength/denoise and tile-related controls;
- preview enough information to understand what will be sent to generation;
- save outputs through `GenerationResults` as persistent project results.

This is the highest-priority ControlNet follow-up because it connects directly to the `Upscale` project mode.

### Pose Control

Goal: keep or transfer character pose while changing prompt, style, outfit or scene.

Expected capabilities:

- use an image as pose reference;
- generate a pose control image via OpenPose/DW OpenPose-style preprocessing;
- control body/face/hands where supported;
- adjust control weight and start/end range;
- preview the pose map before generation;
- store the control image and settings in the project.

### Depth Control

Goal: preserve scene depth, perspective and large 3D structure while changing image content.

Expected capabilities:

- use an image as depth reference;
- generate a depth map via a Depth Anything / depth preprocessor-style pipeline;
- adjust control weight and start/end range;
- preview the depth map before generation;
- store the control image and settings in the project.

### Canny / Contour Control

Goal: preserve silhouettes, hard edges and important composition lines.

Expected capabilities:

- use an image as contour reference;
- generate a Canny/edge map;
- expose low/high threshold controls when useful;
- adjust control weight and start/end range;
- preview the edge map before generation;
- store the control image and settings in the project.

## Not In MVP

Do not add these to MVP:

- generic ControlNet layer/entity;
- generic IP-Adapter feature family;
- broad preprocessor browser;
- ControlNet unit stack;
- ControlNet Tile upscale;
- OpenPose / pose control;
- Depth ControlNet;
- Canny / contour ControlNet.

Regional Guidance images remain the only MVP exception, and they belong to the Regional Guidance feature rather than a generic adapter workflow.

## Acceptance Criteria

Post-MVP implementation is acceptable when:

- each supported workflow has a clear source image/control image relationship;
- the user can preview or inspect the generated control image before generation;
- ControlNet settings are saved in `.igs` and generation snapshots;
- unsupported model-family combinations show clear warnings;
- ControlNet does not require the user to use a node editor for the basic workflows above;
- additional ControlNet types are not added without a concrete workflow need.
