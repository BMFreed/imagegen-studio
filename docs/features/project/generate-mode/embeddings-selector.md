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

Every dynamic branch keeps the captured authored refs separately from its
effective concrete subset. Native jobs receive only that subset; ordinary wire
omits embeddings. Expanded known tokens
without stored identity refuse before batch publication; Generate never auto-links
resources. Retry verifies those frozen files again, ignores unused branches and
later Project/default changes. Accepted records contain concrete prompts and
actually used refs; dynamic templates stay in the live Project draft.

Unsupported layouts/dtypes, missing/corrupt files, non-finite or overflowed values,
old workers and expanded prompts above the existing four-chunk budget fail
explicitly. Anima embeddings, Preset handoff and the release runtime remain
separate gaps. Synthetic native tensor/image checks establish mechanics, not
trained embedding quality or compatibility of every CivitAI file.

## Installed trained Illustrious checkpoint (07.10.2026)

[Installed embedding qualification](../../../engineering/phase-2c-installed-embeddings-research.md)
completed eight finite cases through built Electron and the installed worker
0.12.0. The exact trained source is **IllustriousPhoto**, by
**CautionMergeAhead**, version **WAI v15 1152steps**; required creator credit is
retained in the research and fixture. Its paired F16 `clip_l [12,768]` and
`clip_g [12,1280]` tensors are compared with a separately labeled artificial
zero-tensor control. Both installed versions use `<illustriousphoto>` and real
ID-only autocomplete choices. Matched positive-only and negative-only txt2img
pairs, and weighted/repeated dual-polarity opaque img2img pairs, change decoded
pixels when only the exact trained/control weight identity changes.

The bounded cases use 256×256, three requested steps, seed `0`, Embedded VAE
with explicit FP32 and signed ordinary LoRA −0.5. Positive weighted text has
three literal occurrences, including weight 1.3; negative has two, including
weight 0.7. Each polarity keeps one deduplicated ref. Both img2img cases import
the same genuine plain txt2img PNG and use strength 0.5; native progress
observed two denoising evaluations per case. This combined tensor control does
not independently ablate CLIP L/G or attention weights.

Nine real admissions include one actual canceled original, with no completion
receipt or seed advance. After a real library Default change to the zero
control and removal of every literal from both live prompts, public Retry
retains the original trained refs, prompt text and target bytes. Explicit
Add/Save/readback/reopen preserve exact portable sidecars without model paths or
worker-private aliases. Comparison shows recorded refs as `Removed` against the
edited live prompts; known empty refs remain `Same`. The seven prior resource
rows and their Defaults are unchanged; the final catalog has eight resources
and eleven ready versions.

The shared editor now explicitly closes active or pending completion on blur.
A native authoring regression was RED before this fix and GREEN afterward;
its eleven checks use catalog-only fixtures and a controlled worker peer,
separate from trained inference. Qualification selects only from the focused
editor's `aria-controls` list and waits for actual DOM/Main text acknowledgment.

These are installed development results for one declared trained file and its
artificial control. Live CivitAI install/repair, arbitrary formats, image
quality, Anima embeddings, Preset handoff, dynamic multi-job qualification,
full conditioning-budget capacity and release qualification remain open.

## Installed dynamic subset checkpoint (09.10.2026)

[Exact EPS/V dynamic subsets](../../../engineering/phase-2c-illustrious-dynamic-embeddings-research.md)
uses both full source templates/one exact trained ref per sign and four concrete
ordinary/negative/positive/both pairs at Fixed0/per-iteration, one image each.
Authored capture, concrete native subsets and portable refs survive real current
removal, Add/Save/readback/reopen and all12 per-layer Same/Removed comparisons.
Restored maxPrompts2 retains both full authored refs while only ordinary/negative
execute. The zero-control file is not selected; Defaults remain unchanged.

Both installed negative-alias tensor-zero mutations keep ordinary GREEN and fail
same-input pixels before Add,0 accepted mutant layers. Exact43 source restoration,
physical exit and fresh4 same-input GREEN are independently checked. Raw aggregate
5802 confirms20 qualified admissions/16 finite/4 cancellations,4 saved packages/
12 layers/snapshot0; raw24/16/8 includes a separate watchdog4/0 exclusion.
This proves joint negative learned-vector sensitivity, not independent CLIP L/G,
scalar weighting, broad formats/counts/quality or Anima embedding support.
At this historical TXT checkpoint Random/uint32 boundaries were next; Preset handoff,
broader caps/seed combinations and public delivery/release stay open.

## Installed image dynamic subset checkpoint (12.10.2026)

[The finite image subset gate](../../../engineering/phase-2c-illustrious-dynamic-embeddings-image-research.md)
qualifies EPS/V × common-source IMG/normal mixed-alpha OUT at Fixed0/per-iteration:
24 admissions/completions/accepted layers,8 Save/reopen packages and8 wholeRGBA
matches against each scope's own baseline. Baseline4/prefix2 use the literal
ordinary/negative-only/positive-only/both order, with only the first two selected
in prefix. Full weighted templates and exact refs stay authored/frozen; native
and portable records contain only the effective signed subsets. Ordinary wire
omits `embeddings`. Prefix literal/resolved plans declare truncation; this gate
does not assert UI notice rendering.

Independent raw readback passes18,641 checks: all24 owning comparisons,
source layers,8 cursor/Save snapshots0, complete ZIP/member/configuration/source
context,11 old tables and43 original worker identities. Four full OUT previews
preserve222,208 source pixels. Later prompt/ref/seed37/LoRA edits remain separate
current drafts.28 visible contrasts change text and vectors together and do not
prove embedding-only causality.

118 focused tests pass0skip. Fresh Main source sensitivity gives16 semantic
RED/32 GREEN across48 executions;547 copied source members are exactly restored
and guarded-cleaned. No new installed-worker tensor mutation. Historical TXT
negative-vector and signed image tensor evidence are not counted as new.
Only256×256/Normal N3/two observed updates/exact resources are qualified.
[Installed Anima dynamic image foundation](../../../engineering/phase-2c-anima-dynamic-image-research.md) is qualified; Anima image Fixed/per-prompt80/4/16 is qualified separately; Anima image Random → Fixed32/4/16 is qualified separately; recovered Anima image Reuse is next; other permutations/geometry/formats,
scalar/per-encoder correctness, quality/fullMVP/release remain separate. Public
PP-004/005/007/008 statuses remain «Пока не обещать».

## Installed Anima dynamic image foundation

[Installed Anima dynamic image foundation](../../../engineering/phase-2c-anima-dynamic-image-research.md): Euler × common-source IMG/normal mixed-alpha OUT:20 admissions/completions/accepted layers,4 Save/reopen packages и4 own same-input wholeRGBA prefix controls. Четыре weighted positive×negative пары × две iterations; Fixed0/per-iteration seeds0/1, full authored templates и selected first-pair prefix. Полные compiled strings/spans остаются в frozen worker inputs; portable provenance содержит concrete raw weighted prompts без compiled arrays/templates/maxPrompts. Independent raw readback PASS18128:20 owning comparisons,4 cursor/Save snapshots1,11 old tables,43 worker identities и2 OUT previews/111104 protected source pixels. 75 focused tests PASS0skip;18 actual Main source executions дают4 semantic RED/14 GREEN. 34 visible joint-input contrasts не доказывают scalar-weight/tensor causality; новых installed-worker mutations нет. Только256×256/Euler N3/two actual updates/exact resources; quality/fullMVP/release не заявлены.

Последующий [Anima Fixed/per-prompt image80/4/16 gate](../../../engineering/phase-2c-anima-image-per-prompt-research.md) подтверждён отдельно. Random → Fixed32/4/16 подтверждён отдельным checkpoint; следующий finite gate — Anima image Reuse после recovery. Anima embedding actions остаются неподдерживаемыми. PP-004/005/007/008 сохраняют «Пока не обещать».

## Installed Anima image per-prompt checkpoint

[Installed Anima image per-prompt](../../../engineering/phase-2c-anima-image-per-prompt-research.md): Euler × common-source IMG/normal mixed-alpha OUT:80 admissions/completions/accepted layers,4 Save/reopen packages и16 own same-input wholeRGBA per-prompt controls. В каждом режиме genuine numeric-control4pairs×8/Fixed0/per-iteration сравнивается с4pairs×2/Fixed0/per-prompt по seeds0…7; control slots0,1,10,11,20,21,30,31. Independent raw readback PASS23682:80 owning comparisons,4 cursor/Save snapshots7,11 old tables,43 worker identities и2 OUT previews/111104 protected source pixels. Full frozen DTO сохраняется; только owner IDs и предварительно проверенный seedBehavior исключены из matching. Concrete raw weighted prompts остаются portable; templates/maxPrompts/compiled arrays — вне provenance. 98 focused tests PASS0skip;18 actual Main source executions дают2 semantic RED/16 GREEN. 64 within-pair seed contrasts, без scalar-weight/tensor causality; новых installed-worker mutations нет. Только256×256/Euler N3/two actual updates/exact resources; cap32-refusal/Random/Reuse/wrap/quality/fullMVP/release не заявлены.

Random → Fixed32/4/16 подтверждён отдельно; следующий finite gate — Anima image Reuse после recovery. Anima embedding actions остаются неподдерживаемыми. Остальные методы/форматы/геометрия/Advanced/качество/release и полный MVP остаются отдельными; PP-004/005/007/008 сохраняют «Пока не обещать».

## Installed Anima image Random → Fixed checkpoint

[Installed Anima image Random → Fixed](../../../engineering/phase-2c-anima-image-seed-replay-research.md): Euler256 IMG/normal mixed-alpha OUT,32 admissions/completions/accepted layers,4 Save/reopen packages,16 own fullRGBA Random→numeric Fixed matches. Два исходных crypto-return Main наблюдались без подмены; full DTO сохраняет raw/compiled prompts, источники и uint32 seed/step/posterior. Matching исключает только3 owner IDs и проверенную policy; per-prompt сохраняется. Independent raw readback PASS19737:32 owning comparisons,4 chronological cursor/Save snapshots,11 old tables,43 worker identities,2 OUT previews/111104 protected pixels.161 focused tests PASS0skip; actual source18/2 RED/16 GREEN. Нет новой native mutation, deliberate wrap/cap32-refusal/Reuse/quality/fullMVP/release claim. Следующий finite gate — Anima image Reuse после recovery.

Anima embedding actions остаются неподдерживаемыми; masks/Regional Guidance/Smart Patch — отдельная Phase4. Public PP-004/005/007/008 остаются «Пока не обещать».
