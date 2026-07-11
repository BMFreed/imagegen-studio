# Embedding Prompt Tokens

## Feature

Textual-inversion embeddings are resource-bearing tokens inserted directly into Positive or Negative Prompt. They are not a separate generation stack or preset section.

## ImageGen Studio Decision

The prompt containing the token determines its polarity and exact position. Positive Prompt uses the embedding activation token. Negative Prompt uses `negativeToken` when available and otherwise falls back to the activation token.

The unified autocomplete searches installed compatible embeddings by display name and token. Negative metadata raises an embedding in Negative Prompt results but never silently moves it between prompts.

## Behavior

- embedding chips use a distinct resource icon and metadata tooltip;
- selecting an autocomplete result records the resource ref in the prompt token;
- manually typing embedding-like text creates a custom token unless the user selects the resource suggestion;
- manually editing an embedding token converts it to custom text because the resource link can no longer be guaranteed;
- missing recalled embeddings remain visible and block generation locally;
- a missing embedding blocks Apply only when its owning Prompt or Negative Prompt section is selected;
- accepted-result provenance freezes both the serialized prompt and structured resource-bearing tokens.

## Acceptance Criteria

- Installed embeddings are suggested in both prompt editors.
- Negative Prompt uses an explicit negative token when metadata provides one.
- There is no standalone Embeddings card or preset section.
- Resource identity and exact prompt placement have one source of truth.
