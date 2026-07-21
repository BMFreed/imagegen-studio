# Embeddings in Prompts

## Model

An embedding is visually ordinary prompt text but remains a real resource dependency. Identity is stored beside the text rather than as an offset range:

```ts
interface GenerationPromptEmbeddingRef {
  resource: GenerationEmbeddingResourceRef
  token: string
}

interface GenerationPrompt {
  embeddingRefs: GenerationPromptEmbeddingRef[]
  text: string
}
```

The same resource/token pair is stored once regardless of how many times the literal appears. Refs are normalized by first appearance and then resource ID for deterministic dirty comparison.

## Resolution

After completed text changes the editor reconciles refs:

1. retain an existing ref while its exact token remains;
2. remove it when all literal occurrences disappear;
3. auto-link a manually typed exact token when exactly one installed embedding owns it;
4. report ambiguity when several installed embeddings own the same unbound token;
5. preserve a recalled missing ref while its token remains;
6. prefer stored resource identity over competing activation-token matches.

Matching is case-sensitive, longest-first, and literal. Word boundaries are required only on token sides ending in a word character, so forms such as `<bad-hands-5>` work naturally.

## Polarity and autocomplete

Embedding completion inserts `activationToken` in Positive Prompt. Negative Prompt prefers `negativeToken` when defined. The selected resource is carried through a custom CodeMirror `StateEffect` and deduplicated into `embeddingRefs`.

## Diagnostics

Resolved embeddings receive a restrained resource decoration and a tooltip with name, version, base model, activation token, and missing state. Recalled missing embeddings use an amber warning decoration and text diagnostic. Ambiguous unbound tokens use an amber diagnostic underline and require explicit selection from autocomplete.

Missing and ambiguous embeddings block generation for the active prompt. Apply Preset and New Project validate only selected prompt sections. Deleting the literal removes its ref and blocking error automatically.
