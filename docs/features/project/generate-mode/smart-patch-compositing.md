# Smart Patch Compositing Settings

## Feature

Smart Patch compositing settings control how local generation uses masks, infill and blending.

The broader Smart Patch Layer ownership model is documented in [Smart Patch Layer](./smart-patch-layer.md).

## Reference

Reference: InvokeAI Inpaint Mask and Compositing settings, adapted into ImageGen Studio Smart Patch Layer ownership.

## ImageGen Studio Decision

Compositing settings belong to the current operation or selected Smart Patch Layer, not to standalone mask layers.

## Scope

MVP candidates:

- mask blur;
- edge coherence / coherence mode where supported;
- edge size;
- infill method;
- noise level where supported;
- blend mode;
- opacity;
- show/hide mask overlay;
- mask overlay color/opacity.

The chosen [owned coherence slice](../../../engineering/phase-4-smart-patch-coherence-settings-research.md)
commits exactly Coherence mode/Edge size/Minimum denoise as layer-owned MVP
controls,with the already-supported Gaussian Blur/Box Blur/Staged algorithms.
Affected1927 TS/prototype180/native14 and three semantic RED/GREEN pairs PASS;
typecheck/lint/build PASS. This does not promote every remaining
infill/noise/overlay candidate or add fields to reusable presets.

Post-MVP:

- advanced mask preprocessing;
- reusable mask presets;
- more infill algorithms if worker support is good.

Rejected for MVP:

- standalone mask layers;
- shared masks reused by multiple Smart Patch Layers;
- complex mask graph/composition.

## Ownership Rules

Smart Patch Layer owns:

- mask;
- layer-owned bounding box;
- internal resolution;
- compositing settings that affect regeneration;
- raster sub-layers produced from those inputs.

If a setting affects an already generated Smart Patch Layer, changing it marks the layer as `outdated`.

The current [private Main/worker execution bridge](../../../engineering/phase-4-smart-patch-execution-bridge-research.md)
connects one owned `capture.execute` operation through exact family resource
admission, prepared-file verification, native execution, exclusive processing RGB
publication and strict Main consumption. It accepts one already concrete prompt
pair and uint32 seed, without dynamic expansion or seed-cursor effects. Worker0.14.0
must explicitly advertise `smart-patch-execution`; this is not an installed-runtime
upgrade. World mode, independent internal size and all255 latent KEEP survive the
handoff. Preparation and output remain leased through completion/consumption and,
on worker process failure or timeout, confirmed physical exit. Unconfirmed exit retains
staging even after callback failure.

That transient RGB is not a world contribution, candidate or accepted variant.
World-space composition, durable queue/batch and immutable acceptance remain
separate; `.igs`, document history, provenance/preset/Compare, UI and public
Generate are unchanged. Executed checks and qualification limits are recorded in
the linked research; no new trained-family/GPU or full Invoke pixel-parity claim
follows from the bridge implementation.

The previous [private family VAE/denoising scope](../../../engineering/phase-4-smart-patch-denoising-research.md)
consumes the prepared RGB and numeric latent KEEP with caller-owned loaded models.
TXT/IMG keep their ordinary native route; INP/OUT use the existing masked route
without source reclassification or repeated coherence/LaMa. KEEP all255 after
lost latent coverage still runs VAE and denoising, preserves the world mode and
fully protects the source latents as in Invoke. It returns a VAE reconstruction,
not new denoised detail for the lost tiny edit; there is no fallback or fabricated
coverage. Final world compositing remains separate.

Focused72 Python PASS consists of65 real tiny native family cases and seven actual
CPU protocol preparation-to-adapter cases. Six solvers/family and Illustrious
EPS/V are covered; prepared INP is world128/internal64/Euler for both families.
This is random small CPU-native evidence, not trained/installed/GPU/full Invoke
pixel parity. No Main transport/public worker command, queue, publication,
variants, schema/UI or public readiness was added at that numerical checkpoint.
The current scope above adds the worker/Main execution bridge and resource
admission; world composition and immutable variants remain next.

The previous [private model-source scope](../../../engineering/phase-4-smart-patch-model-source-research.md)
adds actual Main→worker RGB preparation after the existing six conditioning
planes. TXT returns null;IMG/INP convert processing RGBA to exact RGB without
LaMa. OUT lazily resolves pinned Main-owned LaMa and infills solely source alpha<255,
including resized uniformly0/255 processing alpha without changing world mode.
Authored/coherence masks and world contribution remain independent;full model RGB
is not pasted into the document or merged back with the source. Normal OUT's
strict mixed-alpha admission remains unchanged. Affected1937 TS/527 Python
(focused65/68),two actual
Main trained-source cases,four exact trained wholeRGB Invoke matches and three
semantic RED/GREEN pairs qualify this finite boundary. Global lint/typecheck/build
and worker Ruff/basedpyright PASS;limits are recorded in the linked note.
No selectable infill setting,UI/schema change,
diffusion/jobs/variants/provenance/preset/Compare or public readiness is added.

The settled coordinate rule is:coherence edge size is in **processing pixels**,
owned mask blur is in **world project pixels**. The two radii do not share units.
The [private coherence scope](../../../engineering/phase-4-smart-patch-coherence-research.md)
is qualified by1905 affected TS/268 Python PASS,36 pinned Invoke comparisons
and four isolated semantic RED/GREEN pairs. Its frozen
caller-owned profile has Gaussian Blur/Box Blur/Staged,edge0..1024/default16 and
minimum denoise0..1/default0. These are private operation parameters,not new
persisted `.igs` settings,rendered controls or additions to reusable presets in
that algorithm checkpoint. The qualified owned slice above adds optional top-level
Patch `coherenceSettings:{mode,edgeSize,minimumDenoise}` and compact Mask controls.
Legacy absence resolves Gaussian/16/0 without injection/dirty/default no-op;
changed whole-profile edits use captured document/layer ownership and one Undo,
explicit Save/local recovery (including actual process death→Home Recover). Main default
conditioning reads the frozen OWNED profile;private override remains supported.

Conditioning combines numeric WORLD keep before resizing:INP255-authored,
OUT Pillow multiply of that keep with source alpha,TXT/IMG0. Processing BICUBIC
and latent BILINEAR reduction precede the pinned F32 weighted MAX/threshold.
Expanded processing keep projects NEAREST to world,then restores the original
binary edit core before WORLD blur. `latentMaskHasCoverage` reports lost latent
edit coverage separately. The current adapter still executes all255 KEEP with
fully protected latents; world output restoration does not invent latent edit
coverage or generated detail. Six grouped numeric outputs stay private;existing normal OUT remains
fixed Gaussian and unchanged. The algorithm checkpoint itself added no
coherence UI/persistence;the subsequent owned slice is described above.

Owned `maskSettings.blur` is an integer project-pixel value0..512, default16.
The painted mask remains immutable; the generation/compositing snapshot must
freeze and consume blur,and a changed blur can stale an accepted variant.
The [private contribution scope](../../../engineering/phase-4-smart-patch-contribution-fade-research.md)
qualifies its private CPU consumer:affected1888 TS/203 Python PASS,including50
fade cases/21 pinned Invoke comparisons,and three semantic RED/neighbor GREEN
pairs;typecheck/lint/build/global Python checks PASS,exit/cleanup confirmed. Soft authored
alpha stays in conditioning inputs,but nonzero pixels seed full/binary output
core. TXT/IMG use whole-bbox core,INP uses authored clipped coverage,and OUT uses
its union with source alpha<255. Blur0 gives binary core;positive blur gives
external Invoke distance/curve fade in world project pixels. It does not blur
painted coverage or attenuate contribution within a soft painted core.
Owned `maskSettings.padding` is an integer Fit margin0..512, default8. Padding
does not process pixels or stale a result by itself; a later Fit that changes
bbox changes the generation input. Overlay visibility/color/opacity are viewer
state and do not change accepted pixels or generation staleness.

The existing production settings UI/persistence and Fit are qualified by the
[settings checkpoint](../../../engineering/phase-4-smart-patch-mask-settings-research.md).
The [private Main/CPU input capture](../../../engineering/phase-4-smart-patch-generation-capture-research.md)
is qualified by focused14/affected1852 tests and actual CPU composition;
it records whole owned mask and source RGBA/source alpha without applying blur or
implementing inpaint. The previous [effective-mask/internal-size preparation](../../../engineering/phase-4-smart-patch-mask-preparation-research.md)
checkpoint derives zero-padded bbox-local numeric generate coverage, resizes numeric
coverage and sRGB source independently with BICUBIC, and retains world-derived
mode with `processingMaskHasCoverage` reporting. Final focused33 TS/Python24 and
three isolated semantic RED/neighbor GREEN pairs and affected1871 TS/125 Python
pass; required typecheck/lint/build pass, physical exit and temporary-copy
cleanup are confirmed in the checkpoint.
It does not apply blur/fade/coherence or prepare latent conditioning.

Internal resolution may differ from world-space bbox size. The current
contribution scope computes project-pixel fade directly from world planes,
independently of the existing internal-size preparation outputs;nonuniform
internal scaling therefore does
not change this geometric fade distance. Invoke's scaled `addInpaint` graph
expands/fades at processing size and then resizes the mask back,so full scaled
pixel parity is not claimed. That contribution helper is pre-coherence geometry.
The qualified private coherence scope above adds processing-space edge expansion
and projected world contribution. The later model-source scope above qualifies
private source-only LaMa; the numerical family adapter qualifies private
VAE/denoising. The current bridge adds resource admission and transport; final
world compositing remains a subsequent owner. Full scaled Invoke pixel parity is not claimed.

Current-operation compositing settings can be used before a Smart Patch Layer exists. Once a Smart Patch Layer is created, the relevant settings are copied into the layer-owned state.

`Denoising strength` is intentionally not placed here. It is a Generation setting and should appear in the Generation card, not above the layer stack or inside selected-layer controls.

## Vue Prototype Coverage

The prototype preserves the ownership boundary and keeps Denoising Strength in the Generation card. It renders the shared Coherence, Edge size and Minimum denoise controls with mock owned-profile edits and history. Blur, padding, infill, overlay color/opacity and the remaining compositing controls are still prototype gaps.

Existing prototype variants become outdated on the already-supported deterministic mask/bbox/generation inputs. Their provenance and staleness comparison do not yet consume `coherenceSettings`, so these three controls do not qualify acceptance or outdated derivation. Production has no accepted Smart Patch variants yet.

Private model-source/LaMa preparation and numerical VAE/denoising add no prototype controls or generated
variant behavior;existing variant mocks do not qualify source/infill or acceptance.

## Acceptance Criteria

- Compositing settings are not attached to standalone mask layers.
- Denoising strength is not shown in this compositing block; it belongs to Generation settings.
- Changing Smart Patch compositing settings marks existing generated results as `outdated`.
- Mask overlay visibility/color can be controlled without changing generated raster results.
