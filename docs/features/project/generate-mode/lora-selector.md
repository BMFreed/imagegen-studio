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

Trigger matching is case-insensitive, treats spaces and underscores as equivalent, prefers longest phrases, and does not match inside longer words. Identical normalized phrases from multiple active LoRAs aggregate into one range. A restrained violet contextual decoration keeps active trigger phrases distinct from the green editor focus state and blue embedding resources. Its tooltip is explicitly labeled `LoRA` and lists the phrase plus every active LoRA source.

Embedding decorations take precedence when ranges overlap. Missing or ambiguous embedding diagnostics take precedence over LoRA context.

## Autocomplete

Active phrases appear in the first autocomplete section, ahead of embeddings and Danbooru tags. Choosing one inserts text at the current search fragment and records no resource link. Missing and disabled LoRAs contribute neither suggestions nor decoration.

## Validation and persistence

LoRA trigger text never blocks Apply or Generate merely because its source LoRA is disabled, missing, or removed. Presets and prompt provenance store only the text; the actual LoRA stack continues to persist independently with resource metadata and weights.

## Production coverage (27.09.2026)

Electron Project now selects an exact installed LoRA version through the verified
main-process model registry. The selector shows the resource preview, version,
model family and that version's trigger words; it searches those fields and marks
already-added resources. Known incompatible versions cannot be newly selected;
unknown family is explicitly labelled. One resource has one stack entry. Choosing
another version is an explicit remove/add operation; changing Model Manager's
Default never changes an existing Project ref.

New entries start enabled at weight 0.7, matching the prototype. Weight and enabled
edits use serialized draft updates; add/remove and Save flush those updates first.
The document accepts finite weights, including negative and very small values;
this is persistence support, not a claim that every value is suitable for inference.
Invalid input is shown locally and cannot be saved; blur restores the last valid
value. Missing/corrupt versions retain their exact saved identity and can still be
disabled or removed. Model changes preserve the stack and show local compatibility
warnings. LoRA actions preserve both prompt text and embedding sidecars.

The stack participates in dirty state, document shadow recovery and explicit
`.igs` Save/reopen. A transferred LoRA can be explicitly linked to the same exact
installed CivitAI model/version/file, hash and family. Main verifies the file;
only local registry IDs change. Weight, enabled state, copied metadata and
prompts remain unchanged. Opening or refreshing never performs this link.
The row offers `Link installed version` only for one ready exact catalog match.
Missing/corrupt or ambiguous matches need repair; a known incompatible family
cannot be substituted. Unknown family may stay unknown on both sides: linking
it does not establish inference compatibility.

Duplicate detection uses local and portable resource identity, so transferred
rows are marked Added in the selector too. Existing duplicates are preserved
and must be explicitly resolved before linking. A late response after any
Project edit, row removal or close/reopen is rejected. Trigger highlighting/
autocomplete, presets and actual inference/preflight remain unimplemented. Evidence and test
boundaries: [Phase 2A research](../../../engineering/phase-2a-project-storage-research.md#project-lora-stack-validation).

Portable relinking evidence: [LoRA relink review](../../../engineering/phase-2a-project-storage-research.md#portable-lora-relinking-validation).
