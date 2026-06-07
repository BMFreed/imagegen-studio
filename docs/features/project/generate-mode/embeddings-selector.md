# Embeddings Selector

## Feature

The Embeddings selector lets the user select textual inversion embeddings and insert their tokens into prompts.

## Reference

Primary reference: InvokeAI resource selector pattern.

Secondary reference: Forge textual inversion extra-network cards.

## ImageGen Studio Decision

Embeddings are a separate resource-selection feature, not tag autocomplete.

Embeddings get their own subsection inside `Generation`, separate from LoRAs.

## Scope

MVP:

- searchable embeddings picker;
- thumbnails directly in dropdown rows when available;
- search field inside dropdown;
- `Manage Models` action inside dropdown;
- no `Full View` action inside dropdown;
- active model family filtering where possible;
- activation token display;
- negative token display when available;
- insertion target: positive, negative or both;
- selected embedding rows below the selector;
- explicit info button on dropdown rows;
- explicit info button on selected embedding rows;
- metadata popover/card opened only by clicking the info button;
- missing/incompatible resource warnings when recalled from snapshots or presets.

Post-MVP:

- explicit embedding weight UI if the worker/prompt syntax supports it reliably for the active pipeline;
- richer token insertion modes;
- embedding preview comparison.

## Dropdown Row

Each dropdown row should show:

- thumbnail if available;
- display name;
- activation token;
- negative token marker if available;
- base model family badge;
- local status / missing status;
- compatibility warning badge if needed;
- compact info button.

Large metadata should not open on plain hover.

## Selected Embedding Row

Selected embeddings are displayed as cards/rows below the selector, not inside the collapsed select field.

Each selected row should include:

- name;
- activation token;
- selected insertion target;
- enable/disable toggle if useful;
- remove action;
- compatibility warning if applicable;
- info button.

Only the info button opens the metadata popover/card.

## Metadata Popover

The metadata popover/card should include:

- preview thumbnail/image when available;
- description;
- activation token;
- negative token when available;
- suggested insertion target: positive, negative or both;
- base model family;
- version/hash metadata;
- local file size/path metadata where useful;
- compatibility warnings for the active model.

## Snapshot Behavior

Selected embeddings/resource refs are stored in generation snapshots.

Each embedding snapshot entry should include:

- resource id;
- model/version/hash metadata available at generation time;
- activation token used;
- negative token used if applicable;
- insertion target;
- compatibility metadata/warnings where useful.

## Acceptance Criteria

- User can search and add embeddings from a thumbnail dropdown.
- Dropdown includes `Manage Models` and excludes `Full View`.
- Selected embeddings appear below the selector.
- Info buttons exist on both dropdown rows and selected rows.
- Metadata popover opens only by explicit info-button click.
- Embedding refs/tokens are stored in generation snapshots.
