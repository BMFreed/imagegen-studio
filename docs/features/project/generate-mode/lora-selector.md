# LoRA Selector

## Feature

The LoRA selector lets the user add and configure LoRAs for the current Generate operation.

## Reference

Primary reference: InvokeAI compact LoRA selector/list.

Secondary reference: Forge extra-network metadata cards.

## ImageGen Studio Decision

LoRAs get their own subsection inside `Generation`.

Do not use a shared `Concepts` section name.

```text
Generation
├─ Model
├─ LoRAs
│  ├─ Add LoRA select
│  └─ selected LoRA list
├─ Embeddings
├─ Sampling
└─ Seed
```

## Scope

MVP:

- searchable LoRA picker;
- thumbnails directly in dropdown rows;
- search field inside dropdown;
- `Manage Models` action inside dropdown;
- no `Full View` action inside dropdown;
- active model family filtering where possible;
- duplicate prevention inside the same LoRA stack;
- selected LoRA rows below the selector;
- enable/disable per selected LoRA;
- weight editing per selected LoRA;
- explicit info button on dropdown rows;
- explicit info button on selected LoRA rows;
- metadata popover/card opened only by clicking the info button;
- missing/incompatible resource warnings when recalled from accepted results or presets.

Post-MVP:

- richer sorting and pinning;
- compare LoRA previews;
- custom preferred weight overrides.

## Dropdown Row

Each dropdown row should show:

- thumbnail;
- display name;
- short subtitle such as trigger words or source URL/domain where useful;
- base model family badge;
- local status / missing status;
- compatibility warning badge if needed;
- size/version/hash metadata when space allows;
- compact info button.

The dropdown should remain optimized for choosing, not browsing. Large metadata should not open on plain hover.

## Selected LoRA Row

Selected LoRAs are displayed as cards/rows below the selector, not inside the collapsed select field.

Each selected row should include:

- name;
- enable/disable toggle;
- weight slider/input;
- remove action;
- compatibility warning if applicable;
- info button.

Only the info button opens the metadata popover/card.

## LoRA Application And Trigger Words

Adding a LoRA through the UI applies the LoRA resource and its weight automatically to the generation job.

Conceptually this is equivalent to the common prompt token form:

```text
<lora:LoRA_Name:Weight>
```

But in ImageGen Studio this should be represented as structured generation state, not as user-authored prompt text. The prompt editor should not require the user to manually type the LoRA attachment token after they have selected the LoRA in the UI.

Rules:

- selected LoRA resource id/version and weight are stored in the LoRA stack;
- the worker receives the selected LoRA stack as structured job input;
- exported metadata may include an A1111-style token for compatibility when useful;
- changing the weight in the selected LoRA row updates the structured LoRA stack;
- removing or disabling the selected LoRA removes/disables the structured LoRA attachment;
- disabling is non-destructive and never opens the trigger-phrase lifecycle dialog.

Secondary trigger words are different. They are normal prompt words/phrases supplied by the LoRA author, and the user chooses whether to add them to the prompt.

Rules for secondary trigger words:

- trigger phrases must be visible from the selected LoRA row through the explicit info button;
- trigger words should also be available from the dropdown row's info button;
- enabled, non-missing selected LoRAs contribute their trigger phrases to unified autocomplete in both prompt fields;
- selecting a suggestion creates a source-linked LoRA trigger token, but selecting the LoRA itself never inserts prompt text;
- removing the final source of an inserted trigger asks whether to keep it as prompt text, remove it, or cancel;
- disabling the final source keeps the linked token unchanged so the LoRA can be re-enabled without prompt churn;
- the UI should make clear that these words are optional prompt guidance, not the LoRA attachment itself.

## Metadata Popover

The metadata popover/card should include:

- preview thumbnail/image;
- description;
- trigger words / activation text;
- preferred/default weight where known;
- base model family;
- version/hash metadata;
- local file size/path metadata where useful;
- compatibility warnings for the active model.

The popover should not block normal dropdown selection. It opens by explicit click and can be dismissed without changing selection.

## Provenance Behavior

LoRA stack is stored in immutable provenance of accepted generated results.

Each LoRA provenance entry should include:

- resource id;
- model/version/hash metadata available at generation time;
- weight;
- enabled state;
- compatibility metadata/warnings where useful.

## Acceptance Criteria

- User can search and add LoRAs from a thumbnail dropdown.
- Dropdown includes `Manage Models` and excludes `Full View`.
- Selected LoRAs appear below the selector.
- Info buttons exist on both dropdown rows and selected rows.
- Metadata popover opens only by explicit info-button click.
- Adding a LoRA in the UI applies the LoRA resource and weight without requiring the user to type `<lora:...:...>` manually.
- Secondary trigger phrases are visible through metadata and unified autocomplete and are never inserted automatically.
- LoRA stack is stored in accepted-result provenance.
