# PP-006 Supporting Contract: Presets

This document is the canonical supporting contract for
[PP-006: Настройки генерации можно сохранять и переиспользовать](../product-promises.md#pp-006-настройки-генерации-можно-сохранять-и-переиспользовать).
It translates the general user-facing promise into preset ownership, create,
edit, apply, validation, resource-diagnostic, prototype and acceptance rules.

## Current production boundary

[Storage/API checkpoint](../engineering/phase-3-preset-storage-research.md) implements
strict portable definitions, SQLite CRUD/duplicate, deleted records, restore before
30 elapsed UTC days, automatic startup/hourly expiry and typed native IPC.
That checkpoint covers storage/API independently of the UI and Project reuse flows.
[Production Manager checkpoint](../engineering/phase-3-preset-manager-research.md)
now connects the approved three-column manual create/edit editor, Included
sections, duplicate, Deleted/Restore and unsaved-change guards to the native API.
Its execution evidence and limitations are recorded in that checkpoint.
[Project Apply](../engineering/phase-3-preset-apply-research.md) connects the detached
preview, selected-section diagnostics and one Main history mutation.
[Save Current](../engineering/phase-3-preset-save-current-research.md) now connects
Project settings to a detached source draft in the same manager; its actual
qualification results and limits are recorded in that checkpoint.
[New Project customization](../engineering/phase-3-new-project-preset-research.md)
connects a detached active Text to Image copy to the shared editor and initializes
the generation draft before the first `.igs` write, with a clean new history.
Its actual qualification results and limits belong to that checkpoint.
[Accepted Raster result](../engineering/phase-3-result-preset-research.md) connects
saved portable settings and one concrete expanded prompt pair to detached creation.
[Project Apply Models handoff](../engineering/phase-3-preset-model-handoff-research.md)
connects selected-resource diagnostics to exact category/version browsing and
returns to the same edited Apply draft after catalog refresh.
[Smart accepted result sources](../engineering/phase-4-smart-patch-result-preset-research.md)
connect active and exact inactive variants plus converted Smart Rasters to the
same detached editor through a strict worker-independent read. The separate
[Smart settings Compare](../engineering/phase-4-smart-patch-compare-research.md)
route is implemented with scoped native qualification recorded in the linked checkpoint; preset extraction
is preserved. [Smart-target Apply](../engineering/phase-4-smart-patch-preset-apply-research.md)
now implements the finite selected-Patch boundary described below. Qualification
passes 363 focused/neighbor tests (including 33 shared/renderer/control and 18 real
Main tests), 12 native checks, typecheck, lint and a fresh build. Native R4 covers
both families, one Undo/Redo, actual Save/loader/reopen and 900×620 layout/keyboard,
with normal physical exit and retained final SQLite. A staged-review semantic
mutation detects the omitted guard and restores to GREEN. Portable fixtures do
not qualify installed Smart Apply→inference or release; other handoff contexts
remain separate work. Prototype flows are not production persistence evidence,
and PP-006 remains unavailable as a complete user flow.

## Feature

Presets let the user save and reuse generation settings without treating them as a hidden workflow graph.

A preset is an editable user template made from explicit sections of generation state: plain-text positive and negative prompts with sidecar embedding refs, model, LoRAs, project size, sampler and scheduler, steps and CFG, denoising strength when applicable, seed policy and VAE. Embeddings are owned by their prompt section rather than a separate preset section.

## Reference

Primary UI reference: InvokeAI prompt-template selector shape, adapted for project-level presets.

Storage/reference behavior: existing ImageGen Studio preset model in `docs/specs/03-data-storage.md`.

Current visual and interaction sources of truth live in `docs/prototype-app`:

- `?prototype=preset-manager` — app-level browse, create and edit surface;
- `?prototype=apply-preset` — Project-scoped editable partial-apply preview;
- `?prototype=save-preset` — Preset Manager opened with a transient draft from the current project.

## ImageGen Studio Decision

Presets participate in [PP-005](../product-promises.md#pp-005-принятый-результат-хранит-настройки-генерации) only as editable consumers of accepted-result provenance. A preset is never the persistence mechanism or historical evidence for a Raster Layer / Smart Patch variant: provenance remains immutable inside `.igs`, while `Create Preset from Result` copies reusable sections into a detached draft.

Use an Invoke-like compact preset launcher in `Project` / `Create`, but do not copy Invoke's `Choose Prompt Template` behavior directly.

The control is not a persistent "selected preset" field. It is an action launcher:

- it lives near the top of the left Generate settings panel, above the prompt editor;
- it can search and choose a preset quickly;
- it can show which sections a preset contains;
- it opens an apply preview before mutating the project;
- it supports partial apply as a first-class workflow.

Selecting a preset must not silently overwrite current settings. The user must see what will be applied and can choose which sections to copy via a master `Select all sections` checkbox or individual section checkboxes.

Applying a preset copies values into the current Project generation draft or selected Smart Patch Layer generation draft. The resulting mutation is a normal project undo step. The project does not retain a selected-preset identity, link or synchronization after apply.

## Project UI

The left Generate panel should include a compact preset block:

```text
Preset
[ Apply preset... ] [ Manage ] [ Save current ]
```

The teleported chooser opened by `Apply preset...` should include:

- search input;
- preset rows with name and short section badges;
- workflow/type badge when useful, for example `Text to Image`, `Image to Image`, `Smart Patch`;
- warning badge when required resources are missing;

`Manage Presets` and `Save Current as Preset` remain visible sibling actions with explicit tooltips; they are not entries hidden in the chooser.

Workflow labels use plain, human-facing wording in Title Case as standalone labels:

```text
Text to Image
Image to Image
Smart Patch
```

These are user-facing labels for the `workflow_type` catalog value (`txt2img`, `img2img`, `inpaint` from `docs/specs/03-data-storage.md`). Internal `workflow_type` tokens are never shown in the UI. When the same term acts as a compound adjective in a sentence (for example `text-to-image generation`), use hyphens per standard English convention; as a standalone label it is written space-separated.

Section badges should use plain user-facing labels:

```text
Prompt
Negative
Model
LoRA
Size
Steps
Seed
VAE
```

Avoid technical wording like `payload`, `workflow_type`, `resource ref` or `provenance schema` in the user-facing chooser.

## Apply Preview

Clicking a preset row in the Project / Generate chooser opens the dedicated `Apply Preset` modal.

Apply preview is a Project-scoped surface. It is reached from the Project / Generate preset action after the user has already chosen a preset. It is not opened from the Preset Manager. The preview must show the current project as its backdrop so the user can see what they are applying into.

The preset chooser itself is not repeated inside the apply preview. By the time the preview opens, the preset is already chosen and its name is shown in the preview header. Re-showing the chooser would duplicate the selection step.

The preview shows:

- preset name;
- optional description (as a distinct block from the dialog instruction text);
- included sections;
- resource warnings;
- a compact `Current` to `Apply` comparison for the values that will be copied;
- section checkboxes for partial apply.

Each section is an accordion row. Expanding it exposes the same generation-value controls used by the Preset Manager, but edits are made against a detached application draft. They affect only the values about to be copied into the current project; they never update the stored preset. A changed section can be reset independently, and `Reset all` restores every value from the source preset without changing the section selection.

The modal initially keeps all sections collapsed. For ordinary Project Canvas targets, all sections present in the source preset are shown with a per-row `Apply` checkbox; all are selected by default except `Size` and `Seed`. Smart targets omit Size entirely. Deselecting a section disables its fields but preserves the edited draft value so reselecting it restores editing without data loss.

The header makes this ownership boundary explicit: its persistent subtitle says that the user is customizing a temporary copy for the current project and that the saved preset will not change. An adjacent info tooltip additionally explains that Apply copies selected settings, does not update the saved preset and does not create a live link between the project and preset. Critical ownership information must not exist only inside the tooltip.

The section toolbar provides a single adaptive `Expand all` / `Collapse all` action plus `Reset all`. Expansion state is presentation-only and does not affect selected sections or edited values.

`Edit original` is a tertiary action next to the preset metadata, not a competing footer action. It leaves Apply and opens the source preset in Preset Manager. If the application draft or its selection mask changed, the transition requires confirmation and explicitly discards those temporary changes; Apply edits are never transferred implicitly into the saved preset.

Primary actions:

- `Apply`;
- `Cancel`.

`Cancel` discards the detached draft and selection mask without changing either the project or the saved preset.

There is no separate `Apply All` button. The preview keeps a single primary `Apply` action plus a `Cancel`. Above the section list, a single `Select all sections` master checkbox toggles every section checkbox. The master checkbox shows an indeterminate state when only some sections are selected. Selecting every section with the master checkbox is the equivalent of the old `Apply All` flow, but the choice is visible in the section list rather than hidden behind a second button.

Partial apply is a normal workflow, not an advanced escape hatch. Users often need only a style prompt, LoRA stack or default generation bounding-box size from a preset while keeping the current model and other generation settings.

Validation only checks selected sections. If the user applies only prompt text, missing model or LoRA resources in the preset must not block the action.

For list-like sections, selection and content remain distinct. A selected empty LoRA stack means “clear the project's LoRAs”; a deselected LoRA section means “leave the project's LoRAs unchanged”. `Apply` is disabled when no section is selected.

### Selected Smart Patch target

The [finite Smart-target checkpoint](../engineering/phase-4-smart-patch-preset-apply-research.md)
connects the same detached preview to the selected Smart Patch's generation draft
through dedicated `getSmartPatchPresetApplicationReview` and
`applySmartPatchPreset` APIs. Target context identifies the Project and Patch;
the current values come from that Patch, not the Project Canvas draft. Ownership
is captured before asynchronous preset loading. Main's ephemeral review token
binds the exact coordinator, monotonic document epoch, reviewed revision and
layer from the fixed preview through staged commit. Edit→Undo, close/reopen or a
replacement review cannot retarget an old Apply. The review/token is never
persisted in `.igs`, the preset or provenance.

All preset workflows are eligible for this target. The workflow badge is advisory:
it neither changes generation mode nor supplies sections absent from the source.
Smart preview and Select all omit Size; a forged request selecting Size refuses.
An unselected source Size is not applied or validated as a selected section.
A size-only preset explains that no sections are available and cannot Apply.
Preset Size never changes the Smart bbox or internal resolution. Seed starts
deselected; explicit selection copies only policy/value, without resolving a seed
or advancing the operational cursor.

Selected-only validation uses the current Patch model family and exact selected
resources, without an ML runtime. Missing selected resources block visibly;
deselection permits a valid remaining selection. Hidden targets remain editable;
locked targets refuse with the unlock explanation. Pending Project or sibling
Patch draft synchronization blocks opening/submitting Smart Apply. This path
does not flush drafts or seal prompt history to make itself available.

Only the reviewed Patch generation draft may change. A changed Apply creates one
Undo step; a no-op adds none, and neither implies Save. Source preset, Project
draft/primary bbox, other Patch drafts, mask/bbox/internal resolution,
coherence/compositing, variants/active member, accepted pixels/provenance, frozen
jobs/queue, seed cursor and Model Manager policies stay unchanged. Derived
freshness may reflect authored settings. Ordinary Project Apply, result-preset
creation and settings Compare retain their separate behavior. The finite
qualification above does not complete PP-006.

## New Project Preset Customization

Home `New Project` reuses `PresetPayloadEditor` rather than copying Apply controls. The Generation preset select contains active Text to Image presets only. Choosing one creates a detached temporary payload for the new project; editing it never changes the saved preset. The source is copied once, so later catalog changes do not replace customized values or reset their selection mask.

The customization differs from Apply where project creation needs an initial generation area:

- all source sections are shown and initially collapsed;
- `Size` supplies the initial default generation bounding-box dimensions on the infinite Canvas. The current finite-Canvas prototype still labels this field `Canvas`; it does not yet demonstrate the infinite-Canvas behavior;
- all other source sections use `Use` checkboxes and are selected by default except `Seed`;
- per-section reset, `Reset all` and `Expand all` / `Collapse all` preserve the current selection mask;
- a missing selected resource shows an amber warning but does not block `Create Project`; the project can be created and repaired before generation;
- choosing `No preset` restores default generation bounding-box dimensions of
  1024 × 1024 and removes the temporary generation payload. The finite-Canvas
  prototype still presents these as Canvas fields.

The production [New Project checkpoint](../engineering/phase-3-new-project-preset-research.md)
connects this flow to the typed Create command. `Size` is mandatory and labeled
`Generation area`; a source without Size gets a detached 1024 × 1024 fallback.
Each other section keeps its copied value when Use is off. Validation and raw
input validity consider only used sections, so an invalid deselected field does
not block creation. Missing selected resources produce an amber warning and stay
copied for repair before generation; they do not become a Create-time admission
gate. Prediction/noise metadata remain advisory and never override library policy.

Top-level Create width/height own the initial bbox dimensions. A supplied payload
Size must match them exactly; conflicting values are refused before publication.
The selected settings initialize the fresh document before its first `.igs`
write, rather than applying a preset afterward. The new Project has no Apply
undo step or saved-preset link. Create errors keep the temporary form for retry;
Cancel/reopen discards it. The ordinary No preset path retains its existing
positive geometry contract and default generation settings.

Qualification has passed 221 focused tests and nine built Electron scenarios,
including actual first-package data, index failure/rediscovery and restart.
Typecheck, lint, build and visual checks are recorded separately in the checkpoint.
This initialization flow does not qualify
accepted-result projection, Models handoff or Smart Patch sources/targets.

## Save Current As Preset

`Save Current as Preset` opens the Preset Manager in create mode. The current project is copied into an editable transient preset definition and shown as a pinned `Draft` row. The draft is not part of the catalog, filters, sorting or workflow counts, and no record or ID exists until the user clicks `Create Preset`.

The full manager editor is available before creation, including name, optional description, tags/favorite, workflow, Included controls and every generation value. A source banner keeps the originating project name and summary visible. Cancelling returns to the project without persisting anything.

Default included fields in a project-derived definition contain the main reusable generation settings, but seed remains absent until explicitly included. Accidentally preserving a fixed seed can make future generations feel repetitive.

The production [Save Current checkpoint](../engineering/phase-3-preset-save-current-research.md)
connects the compact Project sibling action to this manager lifecycle. The source
name and summary are captured once and remain unchanged while the detached
definition is edited. Successful Create converts the pinned draft into a normal
record and removes its source banner; cancelling a project-derived draft closes
the manager and returns to the Project. Manual New Preset retains its normal
cancel/selection behavior. Failed Create keeps the same draft and source for retry.

Save Current captures only the acknowledged current Project tab. While any
generation-draft synchronization overlay is pending, the action is disabled
with an explanatory tooltip and the App command guard also refuses capture.
This includes an explicit embedding selection: updated prompt text must not be
copied before Main has returned its chosen exact sidecar binding. The action
does not flush draft changes or seal prompt history to make itself available.
After synchronization settles, the source is captured once before the manager's
asynchronous opening/catalog reads, so later Project changes cannot rewrite it.

The source uses the current verified generation target mode: `txt2img` maps to
Text to Image, while `img2img` and `outpaint` map to Image to Image. An empty Canvas,
or a Project without visible layers of nonzero opacity, can default to Text to
Image without an ML worker. If a nonempty Canvas has no current verified mode,
Workflow remains unselected; the user must choose it explicitly before Create.
Layer count or denoising strength cannot determine a nonempty source's workflow.

Copied incomplete numeric settings remain editable. The source banner explains
that the user must complete them or turn off Included for the affected section;
Create remains disabled until the definition is valid. Invalid raw Project
input in reusable fields or unapplied bbox edits disable Save Current with a
reason so the action cannot copy a hidden previous value. Seed and dynamic batch
settings are excluded from this copy; invalid raw input in those excluded fields
does not block Save Current after any pending synchronization has settled.

Save Current copies authored prompt text (including brace templates), exact
embedding sidecars, exact model/LoRA/VAE references, signed/enabled LoRAs and
explicit reusable settings. It never expands a template into a historical
result prompt. Seed and dynamic batch settings are omitted; Size copies only
bbox width/height, without position or source/mask/layer context. This action
does not mutate the Project document, its history or seed cursor, or the model
library's prediction/noise policy. Missing references warn but remain saveable.
[New Project initialization](../engineering/phase-3-new-project-preset-research.md)
and [accepted Raster result projection](../engineering/phase-3-result-preset-research.md)
have separate production checkpoints. The
[Smart result checkpoint](../engineering/phase-4-smart-patch-result-preset-research.md)
adds accepted Smart sources without geometry or current-target inspection.

### Selected Smart Patch source

The separate [Smart draft checkpoint](../engineering/phase-4-smart-patch-current-preset-research.md)
connects Save Current to the exact acknowledged selected Patch generation draft. It
copies authored templates and exact sidecars/resources, rather than accepted
result prompts or Project Canvas settings. Capture is synchronous before Manager
and catalog reads. Workflow starts as `Smart Patch` for every Patch, including
empty-mask and variant-free sources; no current pixel-mode inspection is required.
Copying needs neither ML nor an available catalog; missing references remain
editable/saveable and matching catalog hints are advisory.

Hidden and locked Patches may be copied: this action reads settings and edits only
the detached definition. Pending synchronization for any Project/Patch owner blocks
capture without flushing drafts or sealing prompt history. Invalid raw reusable
settings block with an explanation for the selected owner. Changing selection
clears prior-owner validity; same-owner refresh preserves unpublished invalid raw
input. Excluded raw Seed/batch/geometry input does not block after synchronization
settles. Size, Seed, dynamic batch state, mask, bounds, internal resolution,
coherence/compositing, variants and provenance are not copied.
Source/execution identities remain outside the definition.
The existing editor still permits explicitly authoring generic optional sections;
this never derives Size from Patch geometry.

`Source Smart Patch` identifies both the captured Patch and Project, with model
summary and no geometry summary. Subsequent source or catalog changes cannot
replace that snapshot. Cancel allocates nothing, failed Create retains the draft
and source for retry after an actual INSERT failure, and explicit successful
Create uses existing preset storage. The Project/history/queue/cursor, accepted
pixels/provenance, `.igs` and library policy remain unchanged. Ordinary Canvas
Save Current retains its Size and mode rules.

Root execution passes **222 neighbor tests, zero failures/skips**,
typecheck r3, full lint r2 and a fresh build. The isolated wrong-owner mutation
goes GREEN (2) → semantic RED/control GREEN → restored GREEN (2), with all 1,313
archived source members byte-exact restored. The focused owner regression is
RED before the fix and GREEN after it without changing its causal assertion.
Actual `native-r2` passes **12 automated checks**, exits code 0 across two healthy
Electron lifetimes and retains two recipes after restart. Checks cover frozen
source through later authoring/catalog changes and failed INSERT/retry, exact
unchanged PNG/provenance/Project/seed/library policy/package bytes, and keyboard,
focus and layout at 1440×900 and the real 900×620 minimum. Production review R2
and final native-source R4 review of the two `useInnerText` assertions are clean;
scoped final-harness ESLint passes. Root opened six final native-r2 screenshots
(normal, minimum-width source, scrolled, restored, SQLite failure and restart)
and found no material UI defect in scope; `root-visual-review.json` is retained.
Both retention audits are clean; root completes scoped temporary-data cleanup
with retained byte evidence and 96.59 MiB reclaimed, as recorded in the checkpoint. Inference,
release and complete PP-006 remain outside this authoring qualification; public
status stays **Пока не обещать**.

The same boundary applies when a draft is created from an accepted Raster Layer
or Smart Patch variant. `Save Preset from Result` copies only portable generation
configuration from provenance. Preset `Size` means default generation bounding-box
dimensions, not the size of the infinite Canvas. It never copies a Smart Patch
mask, bounding box, internal resolution, compositing state, source revisions or
source composite identity. In particular, Smart Patch `internalResolution` must
not be mapped into preset `Size`.

Every Smart-provenance source defaults to the `Smart Patch` workflow, including
accepted variants recorded in TXT/IMG/INP/OUT modes and explicit orphan Raster
conversions. The origin determines this initial workflow; recorded mode never
turns Smart world dimensions or internal resolution into preset Size. Users can
edit the detached draft before explicit creation.

Those values are properties of a Smart Patch Layer, not generation-template
fields. When users want to reuse them, they duplicate the Smart Patch Layer;
presets remain focused on prompts, resources and generation behavior.

When the result came from dynamic prompting, `Save Preset from Result` takes that
one result's concrete expanded positive/negative prompt pair and its embedding
refs. It does not copy the authored brace template, the other expanded prompts,
`maxPrompts` or the batch's `seedBehavior`. Those batch facts remain in result
provenance; the preset describes one reusable generation configuration. The Seed
section is still omitted by default and requires the user's explicit choice.

Sampling parameters are split into two meaningful groups instead of one merged checkbox:

- `Sampler & Scheduler`;
- `Steps & CFG`.

Grouping by meaning keeps the dialog short while still letting the user save only sampling style without the step count, or vice versa.

Seed remains an ordinary explicit editor section, but it is excluded from a project-derived draft by default and carries a short explanation. Accidentally preserving a fixed seed can make future generations feel repetitive.

The Seed editor may save `Reuse`. Applying that section copies the policy, not a
seed value or a cross-project cursor. Generate then uses the last actual seed
from a completed output in the target Project; with no such seed, Generate is
disabled with a reason. `Save Preset from Result` still omits Seed by default:
its frozen actual seed and requested policy stay in immutable provenance, and
the user must explicitly include and choose a Seed policy in the editable
preset draft. This avoids silently turning a historical `Reuse` request into a
fixed reusable seed.

Suggested default:

- prompt;
- negative prompt;
- model and version;
- LoRAs and weights;
- size;
- Sampler & Scheduler;
- steps & CFG;
- VAE;
- seed policy only when the user explicitly enables it.

## Preset Manager

Full preset browsing, creation and editing happens in a dedicated app-level `Preset Manager`, not inside the small Project selector. `Apply Preset` remains Project-scoped. `Save Current as Preset` reuses the manager editor while preserving the project as the backdrop and showing its identity in the draft source banner.

Open entry points:

- `Manage Presets` in the Home sidebar Tools area;
- app menu / `Project > Presets`;
- `Manage Presets` beside the Project preset action;
- `Save Current as Preset`, which opens create mode with a project-derived draft;
- accepted-result actions like `Save Preset from Result`.

Raster and Smart Patch Layer context menus expose a separate read-only `Compare
generation settings` popover. It compares `Generated with` provenance to
`Current Canvas`, contains no Apply/Recall/preset action and does not mutate the
Project. `Save Preset from Result` remains a separate action. The prototype
implements these origins on in-memory records. Production ordinary Raster
comparison retains its existing read; active accepted Smart variants and converted
Smart Rasters use strict `getSmartResultComparisonData` against the current
**Project Canvas**, including while a Patch is selected. Smart comparison omits
the entire Size section and geometry/layer/source/execution context. Its scoped native qualification passes all 18 checks.
`Save Preset from Result` separately reads portable configuration through a
worker-independent native endpoint and opens the same detached Manager used by
Save Current. Imported/legacy images without generation
data have a disabled result action; they can use Save Current instead.

Smart sources use the active accepted variant from its layer menu, the exact
stored variant's own `Save Preset from Result` action, or the converted Raster's
menu. Inactive, hidden/locked and outdated/unverified sources remain readable;
the action does not activate a variant. The variants browser stays open beneath
the Manager, and guarded focus returns to the originating control after dismissal.
These inactive-source and worker-independent guarantees belong to preset
extraction: it needs no runtime, installed model, source PNG, draft flush or
prompt-history seal. A late reply after owner/revision/navigation changes cannot
open a stale draft. The separate
[Smart settings Compare](../engineering/phase-4-smart-patch-compare-research.md)
route supports only the active accepted variant and converted Smart Raster;
there is no inactive direct Compare action. Its optional current-Canvas mode
inspection is separate from preset extraction. At that Compare checkpoint,
Smart-target Apply, image comparison and inference were outside its slice;
the later finite Smart-target Apply checkpoint is linked above. PP-005/006 remain
**Пока не обещать**. Final comparison outcomes belong to the linked research.

`New Preset` in the manager creates a minimal manual draft with `Text to Image`, an empty name and only an empty Prompt section. A pinned `Draft` row remains visible above saved results regardless of active filters. `Cancel` discards the manual draft and returns to the previously selected preset.

The layout mirrors the Model Manager pattern:

- left workflow navigation;
- center preset list;
- right details/edit form.

The divider after workflow navigation and the divider before the editor are mouse-resizable with bounded widths. The preset list receives the remaining space, and resizing does not change filters, selection or dirty state.

Saved and Draft rows use a semantic article shell with one full-row Naive button for selection. Contextual controls are not nested inside that selection button.

The right panel is an edit form, not a read-only inspector. Unlike the Model Manager (which browses installed resources), the Preset Manager is a full editor: model and version, LoRA stack with weights, enabled state and per-row removal, project size, sampler, scheduler, steps, CFG, seed policy and VAE are all editable controls.

The left navigation owns the workflow filter: `All Presets`, `Text to Image`, `Image to Image` and `Smart Patch`. The center toolbar contains search, sort, `Favorites`, `Needs Attention` and an always-present reset action. Reset is disabled while all filters are at their defaults. There is no duplicate workflow select in the toolbar and no separate `Status` navigation section. Missing-resource visibility is a `Needs Attention` filter button in the toolbar, plus an inline warning badge on affected preset rows.

Search matches preset name, description, prompt/negative prompt and referenced model, VAE, LoRA or embedding names. It does not currently index tags. Sorting offers `Name` and `Recently updated`. Reset clears workflow, search, favorites and attention filters but intentionally preserves the selected sort order.

Editable fields:

- name;
- description;
- tags/favorite;
- workflow type;
- included sections;
- plain-text prompt and negative-prompt values, including their embedding refs;
- model and exact version;
- LoRAs, weights, enabled state and removal;
- project size;
- sampler and scheduler;
- steps and CFG;
- seed policy;
- VAE.

Not editable or representable in a preset:

- Smart Patch mask or mask asset identity;
- Smart Patch bounding box;
- Smart Patch internal resolution;
- compositing state;
- source composite or layer revision identities.

Each generation section has an `Included` control in its section header. Turning it off removes that section from the preset rather than merely disabling its editor. The storage source of truth is field presence in `PresetPayload`; the UI must not maintain a separate inclusion list.

Manager edit/create opens `Prompt`, `Model` and `LoRA` initially; other sections start collapsed. Apply and New Project preset customization start with every section collapsed.

Workflow-specific fields are conditional:

- `Denoising Strength` is available for `Image to Image` and `Smart Patch`, but not `Text to Image`;
- changing workflow to `Text to Image` removes `denoisingStrength`; switching back does not re-include it until the user explicitly enables the section;
- choosing `Fixed` seed reveals the seed value input;
- a Smart Patch preset stores reusable generation settings only, not a mask, patch bounding box, layer position or generated raster variants.

Prompt fields use visible `Prompt` and `Negative Prompt` labels. For an
Illustrious exact-file reference, the saved prediction type is advisory metadata.
Preset Apply cannot override the Model Manager setting: `epsilon` with no known
value is labeled there as an editable assumption, and `v-pred` maps to
`v_prediction` in the worker payload. An older `null` or non-null reference
stays unchanged; Prepare rehashes the exact file and resolves the current
effective type without rewriting the preset or `.igs`. Frozen job and provenance
store the actual type. Anima has no SDXL prediction type control.

### Edit Lifecycle

The manager uses an explicit save model:

- `Save Changes` is disabled while the selected preset has no unsaved edits;
- editing any included field, catalog metadata or included-state marks the preset as changed;
- selecting another preset or closing the manager with unsaved edits opens a `Save`, `Discard` or `Cancel` confirmation;
- `Delete` requires confirmation, moves the preset to `Deleted` for 30 days and explains that projects already created from it are not changed;
- `Duplicate` creates a separately named copy, selects it and leaves the original unchanged.

`Deleted` is a discoverable Preset Manager view with each preset's expiry and a
`Restore` action. A deleted preset keeps its payload and resource references
intact until expiry, but is absent from the active catalog, search, Project Apply
and New Project selection. Restore before expiry returns the same preset identity
and payload to the active catalog. After 30 days from deletion, the app permanently
removes the preset on its next cleanup run; it cannot then be restored. This is a
preset-local lifecycle, separate from Home's app-managed Project Trash. The
current Vue prototype's Delete removes an in-memory row immediately and does not
demonstrate this production soft-delete/recovery behavior.

Create mode uses the same explicit lifecycle with `Cancel`, `Not saved` and `Create Preset`. Switching presets or closing with a draft offers `Create Preset`, `Discard Draft` or `Cancel`. After creation the transient row becomes a normal selected catalog record and workflow counts update.

`Create Preset` requires a non-empty trimmed name and at least one included payload section. Drafts remain editable and visible when invalid, but the create action in both the editor footer and navigation guard is disabled until those conditions are met.

In production, a failed create/update command must leave the same draft and dirty state open so the user can retry. The current prototype does not simulate persistence failures.

The Vue/Naive prototype owns interaction states. Preset Manager uses a native Naive modal transition, closes through its explicit close action or `Esc`, and protects dirty state before completing that close. When opened over Home or Apply, the underlying surface is not interactive.

Preset import and export are not planned for MVP. The manager does not show import/export actions, and no portable preset bundle format is defined yet.

`Advanced` is not a generic saved section. `PresetPayload` has explicit optional
`cfgRescale` and `vaePrecision` fields, with independent `CFG Rescale` and
`VAE Precision` sections alongside `VAE`. Save Current copies their current
values; Save from Result copies their frozen values. Apply changes only the
sections selected by the user. An older preset without either field leaves that
Project setting unchanged. Other
advanced parameters (for example clip skip, tiling, refiner or noise multiplier)
must likewise get named fields and sections when supported, not an
`engineSpecific` bag.

Sampling is family-aware. Illustrious edits its sampler/scheduler pair; Anima
edits one optional native `animaMethod` from the six implemented flow methods.
An absent native choice is not replaced by Euler. A sampling section can contain
only the native member, and Apply copies only members present in that section:
an older pair-only preset leaves the current native choice unchanged. Switching
families retains inactive values. UI consumers use explicit declared family
metadata, never display-name inference. Unsupported Anima VAE/precision/CFG
rescale settings are explained and retained for deliberate Reset; they do not
acquire inference support from the editor. CLIP Skip is not added by this slice.
The [authoring checkpoint](../engineering/phase-2c-anima-authoring-research.md)
verifies these prototype flows. They remain in-memory mocks and do not establish
production preset storage, application or accepted-result mapping.

## Surface Ownership

Preset surfaces split by ownership so the user always has the right context for the action:

- App-level (`Preset Manager`): browse, manually create and edit presets. In its normal mode it has no current-project context.
- Project-level (`Project` / `Generate`): the compact preset action launcher and editable `Apply Preset` preview. `Save Current as Preset` is launched here and opens the shared Preset Manager editor in project-derived create mode, with the project retained as its backdrop.
- Home project creation: `New Project` may clone a Text to Image preset into a detached initialization payload through the same `PresetPayloadEditor`; this does not turn Home into a preset-editing surface.

A preset action must not require the user to jump from the project surface to the app surface (or back) just to complete it. Saving and applying happen where the settings are visible.

## Missing Resources

If a preset references a missing model, LoRA, embedding token or VAE, the UI should show the warning before apply. A missing embedding belongs to its containing Prompt or Negative Prompt section and blocks Apply only while that section is selected.

Behavior:

- `Apply` is disabled while a selected section references a missing required resource;
- `Apply` becomes available again once the user deselects the problematic section (or resolves the resource);
- Apply shows one prominent `Selected resource is missing` warning and a footer explanation while any selected section is problematic;
- Preset Manager shows a manager-level warning and affected catalog rows carry a `Missing resource` badge;
- Production Project Apply exposes `Open in Models` for each distinct diagnosed
  resource in a selected section. Its target comes from the current edited copy,
  including Prompt/Negative Prompt embedding sidecars, rather than the saved
  preset or library Default. Model Manager receives the expected exact identity;
  a matching nominal version with another SHA remains unavailable. Browsing and
  catalog refresh preserve the draft, selection, expansion and raw inputs.
  Repair removes diagnostics only when the exact reference becomes available;
  replacement remains an explicit action in Apply. Prototype buttons and other
  production contexts retain their separate integration scope.

[Production Preset Manager](../engineering/phase-4-preset-manager-models-research.md)
now offers exact `Open in Models` actions for references in its active edited draft,
including disabled LoRAs and both embedding sidecars. Unrelated unfinished name,
workflow or raw numeric input does not erase these actions. Unknown catalog state
is displayed separately and can still browse known refs. The same session/editor
stays mounted through the staged Models visit; dirty state, values, source intent,
filters and layout remain. Models input does not trigger hidden preset Save.
Repair only removes a diagnostic when the exact reference becomes available;
replacement and Save remain explicit. Deleted read-only presets and New Project
handoff are outside this finite consumer.

Presets should store enough copied display metadata to remain understandable after a resource is removed.

## Vue Prototype Coverage

The Vue/Naive prototype is authoritative for the manager/create/apply states described above. It keeps catalog records, project payload and drafts in memory and demonstrates real filtering, sorting, dirty guards, create/duplicate/delete, payload editing, reset, selection masks and apply-copy behavior. `Create Preset` assigns the mock id/timestamp only on confirmation; Apply mutates only the mock current-project payload.

Normal Preset Manager opens with `Studio Portrait Soft Light` selected, `All Presets`, no search/favorite/attention filter and `Name` sorting. The Apply route demonstrates `Cinematic Img2Img Pass` against the shared `Sample Project B.igs` project state; the save route demonstrates the project-derived `Sample Portrait Baseline` Draft.

It does not persist to SQLite or a real `.igs`, execute CQRS commands, simulate persistence failure, or complete the `Open in Models` missing-resource handoff. The compact Project / Create preset launcher itself remains specified by the Project prototype/docs; the Vue entry `?prototype=apply-preset` starts after a preset has already been chosen. Save-from-accepted-result uses a detached project-derived create intent with the accepted layer name and frozen payload. The catalog is shared across manager mounts for the current browser session; reloading resets it.

### Known PP-006 Prototype Gaps

The standalone `?prototype=apply-preset` surface already shows a prominent
`Selected resource is missing` warning before mutation, disables Apply only for
selected affected sections and has Playwright coverage for that behavior.

Project-integrated Apply now uses the same nested-resource predicates, displays
the affected selected sections and a recovery explanation, and keeps its footer
outside the scroll area. Current Project Playwright coverage checks a missing
LoRA and recovery after deselection; it does not yet exercise a prompt-owned
missing embedding in the integrated Apply flow. Deselection preserves the
current section. Size is excluded for Smart Patch targets. The finite-Canvas
mock currently resizes its Canvas on Size Apply; the product contract instead
changes default generation bounding-box dimensions without resizing the
infinite Canvas.

`Edit original` confirms leaving the temporary draft and focuses the chosen saved
preset. Regression coverage enters through the real Project picker and includes
the result-to-preset-to-Apply loop.

Remaining gaps: `Open in Models` does not yet focus/repair a missing resource;
resource availability is mock metadata, and SQLite/`.igs` persistence, command
execution, 30-day deleted-preset recovery and failure recovery remain
unimplemented. Save from Result must map a dynamic result's concrete expanded
prompt pair rather than its source batch/template in the production command;
prototype mocks do not prove that mapping. PP-006 stays `пока не обещать`.

## Rejected

- Invoke-style `Choose Prompt Template` copied as-is;
- instant apply on dropdown selection;
- keeping a live link between a project and the preset after apply;
- preset inheritance;
- preset composition;
- preset variables;
- condition-based preset application;
- a permanent large presets browser inside the Generate panel;
- a read-only preset inspector in the Preset Manager — the right panel is an editor;
- a `Status` navigation section in the Preset Manager — favorites and missing-resource filtering live in the list toolbar;
- applying a preset from the app-level Preset Manager — Apply remains Project-scoped;
- a generic `Advanced` saved section or engine-specific bag — advanced parameters become explicit named fields when supported.
- preset import/export or a portable preset bundle format in MVP.

## Acceptance Criteria

- Project / Create has a compact `Apply preset...` launcher above the prompt editor and no persistent selected-preset value.
- Selecting a preset opens apply preview instead of mutating settings immediately.
- Successful Apply creates an ordinary project generation-draft mutation/undo step and leaves no live preset identity on Project.
- New Project can customize a detached Text to Image preset payload through the shared editor; Size supplies initial default generation bounding-box dimensions, Seed is excluded by default, and missing resources warn without blocking creation.
- Apply preview is Project-scoped and reached from the Generate selector; it is not opened from the Preset Manager.
- User can apply all sections or a selected subset via per-section checkboxes plus a single `Select all sections` master checkbox (no separate `Apply All` button).
- Apply values are editable in a detached application draft, show `Current` to `Apply` comparisons and support section-level and global reset without mutating the stored preset.
- Apply clearly labels its values as a temporary copy, provides supplementary ownership help, supports `Expand all` / `Collapse all`, and offers a guarded `Edit original` path to Preset Manager.
- User can save current settings through Preset Manager create mode; the project-derived draft is fully editable and seed is excluded by default.
- Preset Manager supports a minimal manual `New Preset` draft and does not add it to catalog counts or filtering before `Create Preset`.
- Full preset editing lives in the Preset Manager, not in the small Project selector; the right panel is an editable form (model, LoRA stack with removal, sampler, steps, CFG, seed, VAE, etc.).
- Preset Manager hosts create/edit lifecycle but not Apply.
- Workflow filtering lives in the Preset Manager left navigation. Search, sort, favorites, missing-resource filtering and reset live in the list toolbar; there is no duplicate workflow select or `Status` navigation section.
- Preset search covers metadata text, prompts and referenced resource names; `Name` and `Recently updated` are the available sort modes, and reset does not change sort.
- Included sections are editable in the Preset Manager and are represented by field presence in `PresetPayload`.
- Preset Manager uses an explicit dirty/save lifecycle and protects unsaved edits when switching presets or closing.
- Deleting a preset removes it from active choices, preserves it in `Deleted` for restoration until its 30-day expiry, and does not change existing Projects; expired presets are permanently cleaned up.
- `Save Preset from Result` for a dynamic result uses that result's concrete expanded prompt pair, not its authored template or batch settings.
- Preset import/export is absent from MVP.
- Workflow labels shown to the user are `Text to Image`, `Image to Image`, `Smart Patch`; internal `workflow_type` tokens are not exposed.
- Missing resources are visible before apply and only block selected affected sections.
- Project-integrated Apply explains why `Apply` is disabled, identifies the affected selected section/resource and uses the same nested-resource detection as Preset Manager and standalone Apply.
- Project Playwright coverage must prove warnings for nested LoRA and prompt-owned embedding refs, deselection recovery and the absence of silent application.
- Applying a preset copies settings into the project and does not create a live synchronization relationship.
- Apply initially selects every available source section except Size and Seed, keeps all sections collapsed, and disables Apply for an empty selection or a missing resource in a selected section. Smart targets omit Size entirely, refuse selected Size and explain size-only sources as having no available sections.

## Production Project Apply checkpoint

[Project preset Apply](../engineering/phase-3-preset-apply-research.md) connects the
active SQLite catalog to the Project chooser and detached Apply modal. The shared
editor supports selected-only validation, Current/Apply summaries, independent
resets and a guarded Edit original path to the same production Manager. Main
rehashes selected exact resources, rejects changed destinations and copies
selected values in one Project history step. Library prediction/noise policy and
saved preset definitions stay unchanged. Missing resources can be deselected;
unsupported selected Anima values are explained. The separate
[New Project checkpoint](../engineering/phase-3-new-project-preset-research.md)
initializes selected settings before the first saved document without an Apply
history step. [Accepted Raster result checkpoint](../engineering/phase-3-result-preset-research.md)
adds an immutable result source, one concrete expanded prompt pair and only
recorded portable settings to detached creation. Unrecorded optional settings
are explained rather than replaced with defaults; Anima bundle components do not
become an external preset VAE. Seed is excluded initially and can be included
explicitly in the editor. Cancel creates no record, storage failures preserve
the draft for retry, and source/project/library ownership remains unchanged.
[Project Apply handoff checkpoint](../engineering/phase-3-preset-model-handoff-research.md)
connects diagnostics to exact Model Manager focus with a guarded return to the
same detached editor. The
[Smart source checkpoint](../engineering/phase-4-smart-patch-result-preset-research.md)
adds all three accepted Smart origins and retains the same storage lifecycle.
At that Project Apply checkpoint, Smart-target Apply was still pending. The later
[finite Smart-target Apply checkpoint](../engineering/phase-4-smart-patch-preset-apply-research.md)
qualifies the selected-Patch draft boundary above through focused and native
checks, without installed Smart Apply→inference qualification. Other
handoff contexts remain separate work and PP-006 is not complete. Actual
qualification counts and limitations belong to each checkpoint.
