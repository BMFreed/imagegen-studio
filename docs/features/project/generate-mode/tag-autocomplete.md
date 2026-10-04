# Prompt Autocomplete

## Decision

Autocomplete runs inside the shared plain-text CodeMirror editor. It combines contextual trigger phrases from the current enabled LoRA stack, installed embeddings, and the prototype Danbooru tag source without converting any result into a chip.

Automatic completion starts after two normalized characters. The search fragment is the current top-level phrase, so spaces and `_` remain equivalent while typing multi-word aliases such as `rim l`. Users can explicitly browse with the prompt action-rail button or `Ctrl/Cmd+Space`; an empty explicit query shows local resources immediately.

## Sections and ranking

Sections always use this order:

1. `Active LoRA triggers`;
2. `Embeddings`;
3. `Danbooru tags`.

Each section returns at most five results and the combined list at most twelve. Exact and prefix matches rank above contains matches. Contextual LoRA phrases rank ahead of Danbooru tags. Prototype fixtures may rank negative-use aliases differently; production derives no negative alias from CivitAI `trainedWords`.

Only LoRAs in the current generation draft with `enabled === true` and without `missing: true` contribute suggestions. Equivalent phrases from multiple LoRAs are aggregated. Danbooru suggestions appear only after the two-character threshold.

## Applying a completion

Completion replaces the current search fragment at the caret inside the top-level phrase; adjacent prompt text is not rewritten.

- LoRA trigger: inserts ordinary text and saves no LoRA source metadata.
- Danbooru tag: inserts canonical text and saves no Danbooru metadata.
- Embedding: inserts `<original safetensors filename stem>` and carries its exact resource/version IDs plus literal through a CodeMirror `StateEffect`; main verifies the managed file and creates the sidecar.

Both production prompt polarities use the same canonical literal. Names, version
names and `trainedWords` aid search without changing activation text. Existing
copied ref tokens remain unchanged. Repeated selection of the same exact
resource/token does not duplicate the ref or refresh copied metadata.

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
shares its styling with the prototype. At that checkpoint embedding and Danbooru
sections were pending. The shared action rail opens the same
suggestions, and onboarding/help lists only the implemented sources.
[LoRA validation](../../../engineering/project-lora-prompt-research.md),
[action/help validation](../../../engineering/project-prompt-actions-research.md).

## Production embedding checkpoint (04.10.2026)

[Exact embedding authoring](../../../engineering/phase-2c-embedding-authoring-research.md)
adds installed Illustrious embeddings after Active LoRA triggers in both normal
Project editors. Explicit browsing works with an empty query; typing uses the
same two-character and current-fragment rules. The completion carries IDs even
for unchanged text, and serialized draft transport retains the selection when
typing continues. Main alone creates verified refs. A typed unique canonical
literal can link after verification; a collision requires explicit selection.
Missing/corrupt installed owners do not make another version an implicit choice.

Anima embedding selection is unsupported. Danbooru completion and its production
SQLite index remain pending. The authoring popup does not qualify embedding
weights for inference.
