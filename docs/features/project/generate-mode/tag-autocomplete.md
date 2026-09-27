# Prompt Autocomplete

## Decision

Autocomplete runs inside the shared plain-text CodeMirror editor. It combines contextual trigger phrases from the current enabled LoRA stack, installed embeddings, and the prototype Danbooru tag source without converting any result into a chip.

Automatic completion starts after two normalized characters. The search fragment is the current top-level phrase, so spaces and `_` remain equivalent while typing multi-word aliases such as `rim l`. Users can explicitly browse with the prompt action-rail button or `Ctrl/Cmd+Space`; an empty explicit query shows local resources immediately.

## Sections and ranking

Sections always use this order:

1. `Active LoRA triggers`;
2. `Embeddings`;
3. `Danbooru tags`.

Each section returns at most five results and the combined list at most twelve. Exact and prefix matches rank above contains matches. Contextual LoRA phrases rank ahead of Danbooru tags. Embeddings marked for negative use receive a small ranking preference in Negative Prompt.

Only LoRAs in the current generation draft with `enabled === true` and without `missing: true` contribute suggestions. Equivalent phrases from multiple LoRAs are aggregated. Danbooru suggestions appear only after the two-character threshold.

## Applying a completion

Completion replaces the current search fragment at the caret inside the top-level phrase; adjacent prompt text is not rewritten.

- LoRA trigger: inserts ordinary text and saves no LoRA source metadata.
- Danbooru tag: inserts canonical text and saves no Danbooru metadata.
- Embedding: inserts the polarity-appropriate activation token and adds one resource/token entry to `embeddingRefs` through a CodeMirror `StateEffect`.

Positive Prompt uses `activationToken`. Negative Prompt uses `negativeToken` when present, otherwise `activationToken`. Repeated selection of the same resource/token does not duplicate the sidecar ref.

## Presentation

CodeMirror completion sections provide group headings. The tooltip layer is teleported under `document.body` with fixed positioning, so suggestion lists remain visible outside Project panels, Preset Manager scroll areas, Apply Preset, and New Project modals.

## Persistence boundary

Autocomplete is an authoring aid, not a stored annotation system. Prompt persistence contains plain text plus embedding refs only. LoRA phrase ownership and Danbooru ranking/category/post-count metadata are recomputed context and are never stored with prompt text. The current tag list is an in-memory prototype; the production SQLite tag index is outside this iteration.

## Production coverage (27.09.2026)

Electron implements the Active LoRA triggers section for both prompt polarities:
exact-version phrases, normalized multi-word suffix search, two-character typing
threshold, Ctrl+Space browsing, keyboard/mouse selection, local Undo/Redo and
plain-text Save. A missing, corrupt, disabled or unlinked version contributes no
suggestions. The popup is rendered outside the settings scroll container and
shares its styling with the prototype. The production embedding and Danbooru
sections, action rail and onboarding hint are still pending.
[Validation](../../../engineering/project-lora-prompt-research.md).
