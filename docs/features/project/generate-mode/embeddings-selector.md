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

New installed Illustrious embeddings use the literal
`<original safetensors filename stem>` in both prompt polarities. This is an
app-defined token, not CivitAI metadata. Display names and `trainedWords` are
search context; they do not define another activation token or negative alias.
Existing copied ref tokens remain unchanged.

## Resolution

After text changes, main reconciles the authored prompt with the managed library:

1. retain an existing ref while its exact token remains;
2. remove it when all literal occurrences disappear;
3. auto-link a manually typed canonical token only when one applicable installed exact version owns it and its managed file passes verification;
4. leave a collision unbound and require explicit selection, including when another installed owner is missing or corrupt;
5. preserve a recalled missing ref while its token remains;
6. prefer stored resource identity over competing activation-token matches.

Matching is case-sensitive, longest-first, and literal. Word boundaries are required only on token sides ending in a word character, so forms such as `<bad-hands-5>` work naturally.

Renderer sends text and an optional resource ID, version ID and chosen literal.
It never supplies reference metadata or paths. Main verifies exact file/source
identity before creating a sidecar, then persists text and refs as one Project
history edit. Mutable Default, display rename and a competing token owner do not
replace an existing ref. Removing every occurrence prunes it; document Undo can
restore both its text and the copied ref.

## Polarity and autocomplete

Embedding completion inserts the canonical literal in either prompt. A custom
CodeMirror `StateEffect` carries its ID-only selection to main, including when
the text was already present. Repeated selection of the same exact resource and
token preserves copied metadata and does not duplicate the sidecar.

Prototype fixtures may contain `activationToken`/`negativeToken` aliases. They
do not establish a production metadata contract. Current production authoring
supports Illustrious embeddings; Anima embedding actions are unsupported.

## Diagnostics

Resolved embeddings receive a restrained resource decoration and an explicitly labeled `Embedding` tooltip with name, version, base model, activation token, and missing state. Recalled missing embeddings use an amber warning decoration and text diagnostic. Ambiguous unbound tokens use an amber diagnostic underline and require explicit selection from autocomplete.

Missing and ambiguous embeddings block generation for the active prompt. Apply Preset and New Project validate only selected prompt sections. Deleting the literal removes its ref and blocking error automatically.

An unlinked portable ref offers explicit `Link` when the exact installed file
can be verified. Linking changes only local registry IDs; the saved token,
display/version names, hash and source identity remain copied Project data.
Model Manager provides the restore path for an unavailable exact file.

## Production authoring checkpoint (04.10.2026)

[Exact embedding authoring](../../../engineering/phase-2c-embedding-authoring-research.md)
connects installed resources to both normal Project editors, literal decorations,
diagnostics, selection and portable relink. Main checks revision and monotonic
epoch across verification and commit; late edits, edit/Undo and tab close cannot
overwrite newer state. History, shadow recovery and explicit `.igs` Save/reopen
keep prompt text and refs together.

At this authoring checkpoint no embedding weights were loaded and generation
with embedding refs refused explicitly; known unbound installed tokens also refuse before
CPU composition or enqueue. Preset integrations, Anima embedding support and
qualified embedding inference remain outside this checkpoint.

## Production inference checkpoint (04.10.2026)

[Illustrious embedding inference](../../../engineering/phase-2c-embedding-inference-research.md)
connects these exact refs to worker 0.10.0 in transparent txt2img and opaque img2img.
Both CLIP encoders receive verified paired `clip_l`/`clip_g` safetensors; singleton
and multiple vectors use the same literal binding in either prompt. The same
literal may point to different exact resources in the two polarities. Within
one polarity a literal has one binding. Matching stays case-sensitive, with
word-side boundaries and longest-first overlap selection, including saved custom
literals. Worker-private aliases never enter the draft or accepted metadata.

Every dynamic branch freezes only its effective refs. Expanded known tokens
without stored identity refuse before batch publication; Generate never auto-links
resources. Retry verifies those frozen files again, ignores unused branches and
later Project/default changes. Accepted records contain concrete prompts and
actually used refs; dynamic templates stay in the live Project draft.

Unsupported layouts/dtypes, missing/corrupt files, non-finite or overflowed values,
old workers and expanded prompts above the existing four-chunk budget fail
explicitly. Anima embeddings, Preset handoff and the release runtime remain
separate gaps. Synthetic native tensor/image checks establish mechanics, not
trained embedding quality or compatibility of every CivitAI file.
