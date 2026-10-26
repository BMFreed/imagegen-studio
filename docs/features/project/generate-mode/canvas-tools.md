# Canvas Tools

The current [regional reference-image owner](../../../engineering/phase-4-regional-guidance-references-research.md)
has **source implemented; finite native-r10 qualification PASS; retention/release complete**. It adds row-owned image
attachments, not a Canvas tool, compositing Raster, shared mask, region bbox or
Fit action. The established regional mask tools, gesture ownership, selected
overlay and Current Canvas/Smart geometry retain their existing contracts.
Add/remove/reorder controls must preserve selection, inline prompt mounting and
focus ownership. Disabled regions remain authorable; lock refuses attachment
mutations. A bounded full-frame thumbnail, including transparent padding, is a
display asset rather than painted Canvas pixels or inference conditioning.

Root's **118 Python checks passed, 0 failed/skipped** cover the CPU thumbnail,
import, derivative, resource-preview and protocol boundary only. They do not
qualify Canvas interaction, UI/focus, actual OS dialog selection or native
reference Save/recovery.

Root confirms **source implemented; lower-level checks and finite native-r10
qualification PASS**. Final lower checks are **Python 118 PASS**, post-lint
**typecheck-r3 PASS**, **full lint-r2 PASS**, **neighbors-r2: 952 PASS / 57 files /
0 skips**, and **fresh build-r1 PASS**. Later changes were harness-only, each with
syntax/format/scoped ESLint PASS. Earlier typecheck-r2 and neighbors-r1
950/57 preceded the final checks; neighbors-r1 predates the Save fix. The earlier
lint-r1's 196 autofixable ordering/braces errors in 16 changed files are historical,
not the final lint outcome.

The duplicate mutation records **2 GREEN → 1 semantic RED + 1 control GREEN →
2 restored GREEN**; all **1,343 mutation-source members** are restored.
Production **R2 source review is CLEAN** after the P2 Save A/B rebase fix and
external-replacement neighbor. Rebase requires full-document equality to exact
`baseDocument` or exact authorized `saveTarget`. The causal
`SAVED_PROJECT_CHANGED` assertion was unchanged when the explicit
Recover-new-revision test oracle was corrected; `save-rebase-green-r2` passed
both cases.

Final **native-r10: 12/12 PASS in 191.188 s**, script `1f5ac7ce`, with its
**R11 source review CLEAN**. The successful run uses the source-r2 archive
(1,343 members), exact script overlay and build-r1 (33 members). It observes
**882 Main calls, originals exactly once**, and **149 actual CPU children**
across two Electron lifetimes: intentional dirty SIGKILL, then healthy code 0.
Exact Main/dialog/spawn/kill/write restoration completes with zero in-flight
calls and zero page errors; root freshly confirms recorded PID/start identities
absent. Contract R1 is CLEAN source-only; final source/build/version mapping is retained.

Root actually opened **all 10 final screenshots** under `ui-audit`: 1440×900
and 900×620, reference cards, keyboard tooltips and recovered image states.
This bounded self-review found no material new reference-layout defect; it is
not independent review, full WCAG or all-compositor qualification.

Native attempts **1–9 remain FAILED**. Harness source-oracle findings R7/R8
were closed by subsequent code/reviews and successful replay; those failures
do not establish another product bug beyond the corrected Save rebase.

The OS picker result was controlled; the worker was the **actual development
CPU worker**, with no ML/catalog injection. Installed-resource transitions,
packaged-worker behavior, inference and frozen active work are not
native-qualified. Transient target/Smart-preparation outputs have metadata-only
witnesses, without raw replay. Prototype SVG/data URLs remain separate mock
behavior and do not extend this evidence boundary.

Retention **R1–R7 are CLEAN, candidate-only, READ-FINISHED**; contract **R1 is
CLEAN, source-only**. Root freshly verified source/build bytes, physical exits,
exact restoration, dependencies and all-reader completion, then released all
22 exact disposable paths: 2 unit and 20 native payloads. Measured artifact-root
allocation reduction is **216,420,352 bytes** (unit 35,950,592; native 180,469,760).
Compact evidence and external runtime/package dependencies remain protected.
Final source/build/version mapping is retained in the linked checkpoint.
PP-001/007/008 remain
**Пока не обещать**; finite qualification does not promote public readiness.

The prototype's SVG/multiple data URLs are not production ownership evidence. Enabled-region
NEW Generate refusal and frozen Retry remain independent; weights/adapters,
conditioning/inference, provenance and model-policy changes are excluded.
Earlier mask-tool evidence below retains its historical scope.

## Feature

Generate canvas tools provide direct manipulation for the primary generation bbox, masks, regional guidance regions and Smart Patch bounding boxes on an unbounded Project Canvas.

## Reference

Reference: InvokeAI canvas interaction patterns, adapted to ImageGen Studio's document-owned canvas entities. The current Vue prototype uses DOM/CSS; the production Project Canvas uses Konva, with app-owned document mutations and mask pixels.

## ImageGen Studio Decision

Canvas is the central working surface inside `Project` / `Generate`.

For the product, panels and popovers provide precision editing while direct canvas manipulation remains the primary interaction path. The Vue prototype currently validates tool availability, selection and deterministic state transitions rather than production pixel manipulation.

MVP canvas tools are scoped to generative editing primitives. ImageGen Studio does not try to become a raster editor in MVP.

## Production checkpoint: Smart Patch mask authoring

The later [Regional Guidance owned-mask checkpoint](../../../engineering/phase-4-regional-guidance-masks-research.md)
has **source implemented, lower-level checks and finite native-r7 qualification
passed**; local visuals are root-reviewed and retention/release are complete.
It reuses the same CPU tool/gesture
semantics for an explicit
regional owner: Brush, Eraser, both Lassos, Transform Region and Clear. No regional
bbox or Fit is introduced. Disabled regions stay editable, lock refuses writes,
and selected overlays use `overlayOpacity` even when disabled. Persistence/resource
integration is implemented; root's lower-level checks PASS at the exact source
and post-lint boundaries recorded in the linked research.
Final native-r7 passes all 12 checks in 157.061 s, including actual tools and
whole-alpha/geometry/history controls. Root opens all six final screenshots at
1440×900/900×620, including quarter-turn/recovered states, with no material local
finding; this is bounded self-review, not a full accessibility audit. Earlier
failures stay separate, including native3's restoration gap. All four retention
audits are CLEAN/READ-FINISHED, contract R2 is CLEAN source-only, and final
harness-scoped lint passes. Root release checks and exact cleanup are complete:
15 idle paths, 113,537,024 bytes (108.28 MiB); compact evidence remains retained. The historical Smart evidence below is unchanged.

[Owned-mask authoring](../../../engineering/phase-4-smart-patch-mask-authoring-research.md)
connects Brush, Eraser, Lasso and Polygon Lasso to captured Project/layer/mask
identities and document/mask revisions. Brush diameter is 1–512 project pixels,
default 50, with a fixed antialias edge; pressure and advanced brush engines are
outside this slice. Brush adds coverage and Eraser subtracts it; the labeled
Lasso operation selector supplies the Add/Subtract choice captured at gesture
start for Lasso/Polygon. Lasso closes on release; Polygon Lasso closes on Enter
or its first vertex and uses even-odd fill. Escape, loss of the gesture's owned
pointer capture or owner/revision changes cancel the local gesture. Polygon
keeps its session between clicks without capture; unrelated capture loss leaves
that session intact.
Hidden/locked Patch targets are not editable. Clear is an explicit mask action;
overlay visibility changes only viewing state, not document pixels or history.

The renderer's preview is provisional. Main rasterizes authoritative world-grid
coverage and publishes one completed gesture as one Undo step; exact no-op leaves
history and mask revision unchanged. Mask bounds are independent of bbox/internal
resolution. Eraser cannot expand them; empty coverage becomes a null asset.
Save/recovery reuse the existing document asset owner. Mask thumbnails scale the
stored PNG and do not invoke a worker or add Project compositing pixels.

The finite CPU profile is 4,000,000 mask pixels, at most 4096 per dimension, 32 MiB
per PNG, 256 IDAT chunks, 8192 points and 32,000,000 candidate pixel visits per edit.
Main rejects prospective allocation/work before publishing; it never silently clips a gesture
to the generation bbox or downsamples it. These are engineering ceilings, not
qualified model limits. The authoring checkpoint records full app regression 3751 PASS and affected 176
PASS after IDAT hardening; native 33 checks cover actual tools, exact PNG history,
Save/reopen and crash recovery. Five semantic RED/neighbor GREEN pairs with
byte-exact restoration and bounded typecheck/lint/build pass. Scope limits remain
those of the checkpoint; this does not qualify Patch inference or variants.
The current encoder emits one IDAT chunk; the parser refuses a 257th chunk before
accumulating its data view, bounding allocation even for a tiny bitmap split into
many compressed chunks.

## Production checkpoint: configurable owned mask settings

[Mask settings](../../../engineering/phase-4-smart-patch-mask-settings-research.md)
adds compact Mask blur/BBox padding rows to the selected Patch's Mask section.
Defaults16/8 remain the old24px margin; both parameters allow integer0..512.
Fit consumes owned values only when invoked and still rounds outward on grid8.
Changing settings does not alter bbox automatically or rewrite painted mask PNG,
mask revision, internal resolution or other layers. Values are portable layer
metadata with Undo/Redo and recovery; absent legacy fields resolve defaults
without rewriting. Inpaint blur integration remains the next pipeline owner;
this is not a currently blurred overlay or generation result.

Qualification: impacted regression1835 PASS before final UI refinement, final
affected104 PASS, built native109 checks and three semantic RED/neighbor GREEN
pairs; typecheck/lint/build PASS. Screenshots at1440×900 and900×620 were viewed.
Chronology, source/exit proof and limits are in the linked checkpoint. The Vue
prototype still lacks these fields and does not qualify production storage.

## Previous production checkpoint: Transform Mask and Fit

[Transform/Fit implementation](../../../engineering/phase-4-smart-patch-mask-transform-research.md)
adds a captured local Transform session for the selected nonempty, visible,
unlocked Smart Patch mask. Konva handles move, scale and rotate a provisional
mask preview. Apply/Enter submits one command; Cancel/Escape or owner/revision,
camera, busy or external focus changes discard the preview. Handles do not
publish per-drag document edits. On release, interactive anchors and displayed
dimensions snap to whole project pixels (minimum 1px); Main still accepts fractional
transforms. Main verifies the existing owned PNG and bakes
coverage onto the world pixel grid; one changed Apply is one Undo step and
identity/no-op leaves document/history unchanged. Bbox, internal resolution,
other layers and Raster pixels remain independent.

Unit integer translations and quarter turns preserve alpha samples exactly.
Other transforms use fixed 2×2 inverse bilinear samples, clamped interpolation
inside the source pixel-area rectangle, transparent exterior and tight cropping.
When output dimensions and alpha are unchanged, Main retains the verified PNG
bytes even for imported files with alternate valid chunk packaging. This is an
explicit CPU policy, without a claim of browser/Invoke pixel parity. Empty or
all-zero minification and limits refuse without a commit; scale is positive and
at most 10000, angle is finite within [-360,360], and existing output/work limits
remain enforced before allocation.

Fit reads the verified selected mask and changes only its owned bbox. At that
checkpoint the fixed policy added **24 project pixels per side** (blur16 + padding8),
equivalent to the current owned defaults, then rounded
left/top down and right/bottom up to grid8 for both supported families. No 64px
minimum is invented. Fit preserves mask identity/revision/pixels and internal
resolution; repeated Fit is a no-op. Configurable blur controls were added by
the newer settings checkpoint; the inpaint blur pipeline remains pending.

Qualification: impacted regression1820 PASS before terminal snapping, final
affected59 PASS, built native57 checks and three semantic RED/neighbor GREEN
pairs. Required typecheck/lint/build pass; exact timing, source/physical-exit
proof, corrected attempts and limits are in the linked checkpoint. Smart Patch inpaint/generation, accepted variants/staleness,
Regional Guidance tools and Patch presets remain open; the scope below includes
these remaining product requirements.

## Scope

Base side controls for normal generation:

- collapse left panel;
- `Pan Tool`;
- primary `Bounding Box`;
- collapse right panel.

With a Smart Patch target selected, the contextual `Bounding Box` control edits that layer's owned bbox. The primary bbox remains project state but is not the active generation target.

`Pan Tool` is not a separate `Viewer` mode. It is the default navigation/inspection tool for pan, zoom, fit view and non-editing canvas interaction.

The primary `Bounding Box` tool moves/resizes the finite normal-generation target. It can extend outside all existing image content. Project Canvas has no finite boundary to crop or grow. This tool does not crop, resample or transform Raster Layer pixels.

Contextual tools when a Smart Patch Layer is selected:

- Transform Mask;
- Lasso;
- Polygon Lasso;
- Brush;
- Eraser;
- Bounding Box;
- Fit Patch BBox to Mask.

Contextual tools when a Regional Guidance Layer is selected:

- Transform Region;
- Lasso;
- Polygon Lasso;
- Brush;
- Eraser.

Raster Layer canvas editing is not in MVP.

Post-MVP:

- more transform modes;
- alignment/snapping;
- advanced brush engines;
- raster layer transform/crop/paint if ImageGen Studio later decides to become more than a generative editing workspace;
- tiled preview/performance tooling.

## UI Rules

Canvas tools should be close to the canvas and visually distinct from project mode tabs.

Tools should not be visible in Home preview unless they actually work there. Home preview gets viewer tools only: pan, zoom, fit view and project actions.

Generate canvas tools should not create a separate `Viewer` mode.

Side toolbars/tool rails:

- tool rails are solid light vertical panels, visually distinct from the dark checkerboard canvas background;
- panel collapse controls are always available at the canvas edges;
- `Pan Tool` is always available on the left rail;
- primary `Bounding Box` is available on the left rail when no Smart Patch target is selected;
- the active bbox size/readout is a `canvas-area` overlay, not a child of a finite canvas frame; a separate canvas context menu is not present in the current prototype;
- layer-specific editing tools appear only when a compatible layer is selected;
- layer selection in the right panel drives the contextual tool rail; there are no visible prototype state tabs in the product UI;
- Smart Patch mask/bbox tools appear in the Smart Patch contextual tool rail when Smart Patch Layer is selected; its bbox tool edits the layer-owned target, not the primary bbox;
- Regional Guidance region/mask tools appear in the Regional Guidance contextual tool rail when Regional Guidance Layer is selected;
- Raster Layer selection does not show raster editing tools in MVP.

`Fit Patch BBox to Mask` is shown in the Smart Patch Layer contextual left toolbar. It is not a global canvas toolbar action.

## Transform Tools

`Transform Mask` for Smart Patch Layer:

- moves, scales and rotates the layer-owned mask;
- does not move active raster sub-layer pixels;
- does not move or resize the Smart Patch Layer Bounding Box;
- uses the layer-owned mask as the transform target.

`Fit Patch BBox to Mask` for Smart Patch Layer:

- reads the selected Smart Patch Layer's owned mask bounds;
- expands the rect by the selected Patch's owned blur+padding per side (defaults16+8=24px);
- rounds left/top outward down and right/bottom outward up to grid8 for both supported model families;
- writes the result to the selected Smart Patch Layer's owned Bounding Box;
- is not available when no Smart Patch Layer is selected.

`Transform Region` for Regional Guidance Layer:

- moves, scales and rotates the layer-owned region/mask;
- does not expose Bounding Box controls because Regional Guidance Layer does not have a generation bbox;
- uses the regional guidance region/mask as the transform target.

Regional Guidance Layer does not expose `Fit Patch BBox to Mask` or any other bbox fit-to-mask command, because it has no generation bbox.

InvokeAI image/entity transform code can be used as an implementation reference, but ImageGen Studio applies this interaction to owned masks/regions, not to raster image editing.

## Exclusions

Not in MVP:

- raster pixel painting;
- raster layer transform;
- raster crop;
- raster filters;
- full image editor behavior for ordinary Raster Layers.

## Vue Prototype Coverage

Implemented:

- one vertically centered left rail containing the settings-panel collapse, Pan and current `Crop / Resize Project Canvas` buttons plus contextual tools; the right-panel collapse button stays centered at its edge;
- context-specific Smart Patch and Regional Guidance tool rails;
- active/pressed tool state, accessible names and contextual viewport hints;
- pointer pan and viewport zoom;
- deterministic Smart Patch mask-revision/outdated transitions;
- deterministic `Fit Patch BBox to Mask` geometry update.

Simulated or not implemented:

- Brush, Eraser, Lasso, Polygon Lasso, Transform Mask and Transform Region do not create production raster/vector masks;
- bbox and crop handles are visual overlays rather than general pointer-resize implementations; the primary generation bbox is not modeled separately from the finite prototype frame;
- there is no precision bbox popover, snapping engine, rotation transform or production compositor;
- Raster Layer pixel/transform editing remains absent.

## Acceptance Criteria

- Product canvas supports direct mask/region/bbox manipulation; the Vue prototype currently validates tool selection and deterministic revision/fit transitions only.
- Precision controls exist in panels/popovers where needed.
- Generate does not expose inactive Launchpad/Viewer controls.
- Pan Tool is available as the neutral canvas navigation tool.
- Primary Bounding Box moves/resizes the normal-generation target without editing Raster Layer pixels or canvas bounds; the current finite prototype does not yet demonstrate this.
- Raster Layer canvas editing is not exposed in MVP.
- Smart Patch Layer selection shows Transform Mask, Lasso, Polygon Lasso, Brush, Eraser and Bounding Box.
- Smart Patch Layer selection shows `Fit Patch BBox to Mask` in its contextual toolbar.
- Regional Guidance Layer selection shows Transform Region, Lasso, Polygon Lasso, Brush and Eraser.
- Regional Guidance Layer selection does not show bbox actions.
- Upscale handoff controls are deferred to the future Upscale feature pass.
