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
- missing/incompatible resource warnings when recalled from snapshots or presets.

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

## Snapshot Behavior

LoRA stack is stored in generation snapshots.

Each LoRA snapshot entry should include:

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
- LoRA stack is stored in generation snapshots.
