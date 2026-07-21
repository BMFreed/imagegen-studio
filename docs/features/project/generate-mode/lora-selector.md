# LoRA Selector and Trigger Phrases

## LoRA stack

`GenerationLoraStack` owns only the structured LoRA stack: resource identity, enabled state, weight, missing state, add, and remove. The LoRA stack remains separate generation/provenance metadata.

## Trigger phrases are plain text

Selecting a LoRA trigger completion inserts ordinary prompt text. Prompt state does not store `sourceLoraIds` or any other LoRA ownership link. Consequently:

- disabling a LoRA removes its contextual highlight and suggestions but never changes prompt text;
- enabling it again restores matching highlights;
- removing a LoRA removes contextual highlight/suggestions but never changes text;
- no orphan-trigger dialog or pending resolution state exists;
- a trigger phrase without a matching active LoRA remains valid ordinary text.

Only LoRAs in the current generation draft that are enabled and not missing participate in suggestions and highlighting.

## Matching and presentation

Trigger matching is case-insensitive, treats spaces and underscores as equivalent, prefers longest phrases, and does not match inside longer words. Identical normalized phrases from multiple active LoRAs aggregate into one range. The restrained green contextual decoration communicates active support; its tooltip lists the phrase and every active LoRA source.

Embedding decorations take precedence when ranges overlap. Missing or ambiguous embedding diagnostics take precedence over LoRA context.

## Autocomplete

Active phrases appear in the first autocomplete section, ahead of embeddings and Danbooru tags. Choosing one inserts text at the current search fragment and records no resource link. Missing and disabled LoRAs contribute neither suggestions nor decoration.

## Validation and persistence

LoRA trigger text never blocks Apply or Generate merely because its source LoRA is disabled, missing, or removed. Presets and prompt provenance store only the text; the actual LoRA stack continues to persist independently with resource metadata and weights.
