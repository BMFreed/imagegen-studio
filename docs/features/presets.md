# Presets

## Feature

Presets let the user save and reuse generation settings without treating them as a hidden workflow graph.

A preset is an editable user template made from explicit sections of generation state: prompt, negative prompt, model, LoRAs, embeddings, project size, sampler and scheduler, steps and CFG, denoising strength when applicable, seed policy and VAE.

## Reference

Primary UI reference: InvokeAI prompt-template selector shape, adapted for project-level presets.

Storage/reference behavior: existing ImageGen Studio preset model in `docs/specs/03-data-storage.md`.

Current interactive visual references live in `docs/prototype-app`:

- `?prototype=preset-manager` — app-level browse, create and edit surface;
- `?prototype=apply-preset` — Project-scoped editable partial-apply preview;
- `?prototype=save-preset` — Preset Manager opened with a transient draft from the current project.

The standalone HTML preset prototypes are historical references and are no longer the visual source of truth.

## ImageGen Studio Decision

Use an Invoke-like compact preset selector in `Project` / `Generate`, but do not copy Invoke's `Choose Prompt Template` behavior directly.

The selector is not just a prompt-template dropdown. It is a project preset launcher:

- it lives near the top of the left Generate settings panel, above the prompt editor;
- it can search and choose presets quickly;
- it can show which sections a preset contains;
- it opens an apply preview before mutating the project;
- it supports partial apply as a first-class workflow.

Selecting a preset must not silently overwrite current settings. The user must see what will be applied and can choose which sections to copy via a master `Select all sections` checkbox or individual section checkboxes.

Applying a preset copies values into the current project state. The project does not stay linked or synchronized to the preset after apply.

## Project UI

The left Generate panel should include a compact preset block:

```text
Preset
[ Select preset...                         v ]
```

The dropdown should include:

- search input;
- preset rows with name and short section badges;
- workflow/type badge when useful, for example `Text to Image`, `Image to Image`, `Smart Patch`;
- warning badge when required resources are missing;
- `Manage Presets`;
- `Save Current as Preset`.

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
Embeddings
Size
Steps
Seed
VAE
```

Avoid technical wording like `payload`, `workflow_type`, `resource ref` or `snapshot schema` in the user-facing selector.

## Apply Preview

Clicking a preset row opens an apply preview popover or small dialog.

Apply preview is a Project-scoped surface. It is reached from the Project / Generate compact preset selector after the user has already chosen a preset. It is not opened from the Preset Manager. The preview must show the current project as its backdrop so the user can see what they are applying into.

The preset selector itself is not repeated inside the apply preview. By the time the preview opens, the preset is already chosen and its name is shown in the preview header. Re-showing the selector would duplicate the selection step.

The preview shows:

- preset name;
- optional description (as a distinct block from the dialog instruction text);
- included sections;
- resource warnings;
- a compact `Current` to `Apply` comparison for the values that will be copied;
- section checkboxes for partial apply.

Each section is an accordion row. Expanding it exposes the same generation-value controls used by the Preset Manager, but edits are made against a detached application draft. They affect only the values about to be copied into the current project; they never update the stored preset. A changed section can be reset independently, and `Reset all` restores every value from the source preset without changing the section selection.

The header makes this ownership boundary explicit: its persistent subtitle says that the user is customizing a temporary copy for the current project and that the saved preset will not change. An adjacent info tooltip additionally explains that Apply copies selected settings, does not update the saved preset and does not create a live link between the project and preset. Critical ownership information must not exist only inside the tooltip.

The section toolbar provides a single adaptive `Expand all` / `Collapse all` action plus `Reset all`. Expansion state is presentation-only and does not affect selected sections or edited values.

`Edit original` is a tertiary action next to the preset metadata, not a competing footer action. It leaves Apply and opens the source preset in Preset Manager. If the application draft or its selection mask changed, the transition requires confirmation and explicitly discards those temporary changes; Apply edits are never transferred implicitly into the saved preset.

Primary actions:

- `Apply`;
- `Cancel`.

There is no separate `Apply All` button. The preview keeps a single primary `Apply` action plus a `Cancel`. Above the section list, a single `Select all sections` master checkbox toggles every section checkbox. The master checkbox shows an indeterminate state when only some sections are selected. Selecting every section with the master checkbox is the equivalent of the old `Apply All` flow, but the choice is visible in the section list rather than hidden behind a second button.

Partial apply is a normal workflow, not an advanced escape hatch. Users often need only a style prompt, LoRA stack or size from a preset while keeping the current model or canvas settings.

Validation only checks selected sections. If the user applies only prompt text, missing model or LoRA resources in the preset must not block the action.

## Save Current As Preset

`Save Current as Preset` opens the Preset Manager in create mode. The current project is copied into an editable transient preset definition and shown as a pinned `Draft` row. The draft is not part of the catalog, filters, sorting or workflow counts, and no record or ID exists until the user clicks `Create Preset`.

The full manager editor is available before creation, including name, optional description, tags/favorite, workflow, Included controls and every generation value. A source banner keeps the originating project name and summary visible. Cancelling returns to the project without persisting anything.

Default selected sections should include the main reusable generation settings, but seed should be explicit. Accidentally preserving a fixed seed can make future generations feel repetitive.

Sampling parameters are split into two meaningful groups instead of one merged checkbox:

- `Sampler & scheduler`;
- `Steps & CFG`.

Grouping by meaning keeps the dialog short while still letting the user save only sampling style without the step count, or vice versa.

Seed remains an ordinary explicit editor section, but it is excluded from a project-derived draft by default and carries a short explanation. Accidentally preserving a fixed seed can make future generations feel repetitive.

Suggested default:

- prompt;
- negative prompt;
- model and version;
- LoRAs and weights;
- embeddings;
- size;
- sampler & scheduler;
- steps & CFG;
- VAE;
- seed policy only when the user explicitly enables it.

## Preset Manager

Full preset browsing, creation and editing happens in a dedicated app-level `Preset Manager`, not inside the small Project selector. `Apply Preset` remains Project-scoped. `Save Current as Preset` reuses the manager editor while preserving the project as the backdrop and showing its identity in the draft source banner.

Open entry points:

- app menu / `Project > Presets`;
- `Manage Presets` in the Project preset selector;
- `Save Current as Preset`, which opens create mode with a project-derived draft;
- generation result or snapshot actions like `Save Preset from Result`.

`New Preset` in the manager creates a minimal manual draft with `Text to Image`, an empty name and only an empty Prompt section. A pinned `Draft` row remains visible above saved results regardless of active filters. `Cancel` discards the manual draft and returns to the previously selected preset.

The layout mirrors the Model Manager pattern:

- left workflow navigation;
- center preset list;
- right details/edit form.

The right panel is an edit form, not a read-only inspector. Unlike the Model Manager (which browses installed resources), the Preset Manager is a full editor: model and version, LoRA stack with weights, enabled state and per-row removal, project size, sampler, scheduler, steps, CFG, seed policy and VAE are all editable controls.

The left navigation owns the workflow filter: `All Presets`, `Text to Image`, `Image to Image` and `Smart Patch`. The center toolbar contains search, sort, `Favorites`, `Needs Attention` and an always-present reset action. Reset is disabled while all filters are at their defaults. There is no duplicate workflow select in the toolbar and no separate `Status` navigation section. Missing-resource visibility is a filter pill in the toolbar, plus an inline warning badge on affected preset rows.

Editable fields:

- name;
- description;
- tags/favorite;
- workflow type;
- included sections;
- prompt and negative prompt;
- model and exact version;
- LoRAs, weights, enabled state and removal;
- embeddings;
- project size;
- sampler and scheduler;
- steps and CFG;
- seed policy;
- VAE.

Each generation section has an `Included` control in its section header. Turning it off removes that section from the preset rather than merely disabling its editor. The storage source of truth is field presence in `PresetPayload`; the UI must not maintain a separate inclusion list.

Workflow-specific fields are conditional:

- `Denoising Strength` is available for `Image to Image` and `Smart Patch`, but not `Text to Image`;
- choosing `Fixed` seed reveals the seed value input;
- a Smart Patch preset stores reusable generation settings only, not a mask, patch bounding box, layer position or generated raster variants.

Prompt fields use visible `Prompt` and `Negative Prompt` labels. Compatibility metadata such as `v-pred` may be shown compactly with an info tooltip, but must not be presented as an unexplained editable generation field.

### Edit Lifecycle

The manager uses an explicit save model:

- `Save Changes` is disabled while the selected preset has no unsaved edits;
- editing any included field, catalog metadata or included-state marks the preset as changed;
- selecting another preset or closing the manager with unsaved edits opens a `Save`, `Discard` or `Cancel` confirmation;
- `Delete` requires confirmation and explains that projects already created from the preset are not changed;
- `Duplicate` creates a separately named copy, selects it and leaves the original unchanged.

Create mode uses the same explicit lifecycle with `Cancel`, `Not saved` and `Create Preset`. Switching presets or closing with a draft offers `Create Preset`, `Discard Draft` or `Cancel`. After creation the transient row becomes a normal selected catalog record and workflow counts update.

Visual HTML prototypes may show only the clean happy path. The Vue/Naive prototype should own interaction states; the historical HTML prototype is not expected to implement form state, validation or confirmations.

Preset import and export are not planned for MVP. The manager does not show import/export actions, and no portable preset bundle format is defined yet.

`Advanced` is not a saved section in MVP. `PresetPayload` in `docs/specs/03-data-storage.md` intentionally does not include an `engineSpecific` or generic advanced bag, to avoid an unstructured escape hatch. When a concrete advanced parameter (for example clip skip, tiling, refiner or noise multiplier) is supported, it is added as an explicit named field in `PresetPayload` and an explicit named section in the editor, not folded into a generic `Advanced` group. In MVP the section is simply `VAE`.

## Surface Ownership

Preset surfaces split by ownership so the user always has the right context for the action:

- App-level (`Preset Manager`): browse, manually create and edit presets. In its normal mode it has no current-project context.
- Project-level (`Project` / `Generate`): the compact preset selector and editable `Apply Preset` preview. `Save Current as Preset` is launched here and opens the shared Preset Manager editor in project-derived create mode, with the project retained as its backdrop.

A preset action must not require the user to jump from the project surface to the app surface (or back) just to complete it. Saving and applying happen where the settings are visible.

## Missing Resources

If a preset references a missing model, LoRA, embedding or VAE, the UI should show the warning before apply.

Behavior:

- `Apply` is disabled while a selected section references a missing required resource;
- `Apply` becomes available again once the user deselects the problematic section (or resolves the resource);
- each problematic section shows an inline warning;
- warning action opens Model Manager focused on the missing resource when possible.

Presets should store enough copied display metadata to remain understandable after a resource is removed.

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

- Project / Generate has a compact preset selector above the prompt editor.
- Selecting a preset opens apply preview instead of mutating settings immediately.
- Apply preview is Project-scoped and reached from the Generate selector; it is not opened from the Preset Manager.
- User can apply all sections or a selected subset via per-section checkboxes plus a single `Select all sections` master checkbox (no separate `Apply All` button).
- Apply values are editable in a detached application draft, show `Current` to `Apply` comparisons and support section-level and global reset without mutating the stored preset.
- Apply clearly labels its values as a temporary copy, provides supplementary ownership help, supports `Expand all` / `Collapse all`, and offers a guarded `Edit original` path to Preset Manager.
- User can save current settings through Preset Manager create mode; the project-derived draft is fully editable and seed is excluded by default.
- Preset Manager supports a minimal manual `New Preset` draft and does not add it to catalog counts or filtering before `Create Preset`.
- Full preset editing lives in the Preset Manager, not in the small Project selector; the right panel is an editable form (model, LoRA stack with removal, sampler, steps, CFG, seed, VAE, etc.).
- Preset Manager hosts create/edit lifecycle but not Apply.
- Workflow filtering lives in the Preset Manager left navigation. Search, sort, favorites, missing-resource filtering and reset live in the list toolbar; there is no duplicate workflow select or `Status` navigation section.
- Included sections are editable in the Preset Manager and are represented by field presence in `PresetPayload`.
- Preset Manager uses an explicit dirty/save lifecycle and protects unsaved edits when switching presets or closing.
- Preset import/export is absent from MVP.
- Workflow labels shown to the user are `Text to Image`, `Image to Image`, `Smart Patch`; internal `workflow_type` tokens are not exposed.
- Missing resources are visible before apply and only block selected affected sections.
- Applying a preset copies settings into the project and does not create a live synchronization relationship.
