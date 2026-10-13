# Dynamic Prompting

## Feature

Dynamic prompting expands one authored prompt into one or more concrete prompts before queueing generation jobs.

## Reference

Reference: InvokeAI dynamic prompt components and settings.

## ImageGen Studio Decision

Include Invoke-like dynamic prompting in Generate. Do not include wildcard files.

Dynamic prompting is prompt expansion logic. It does not imply A1111 wildcard packs, external wildcard folders or wildcard autocomplete.

Dynamic prompting is reached from the positive or negative prompt toolbar. It is not a permanent settings card. The preview modal expands positive and negative prompts into concrete pairs before queueing.

## Scope

MVP:

- detect dynamic syntax in positive and negative prompt fields;
- preview expanded prompts before running;
- show parse errors near the prompt editor;
- configure max expanded prompts;
- configure seed behavior for expanded prompts;
- store the concrete expansion in accepted-result provenance.

Post-MVP:

- richer expansion diff/inspection UI;
- per-section dynamic prompt controls if needed.

Rejected:

- wildcard file expansion;
- wildcard database management;
- external wildcard pack import.
- nested brace expressions in the current prototype.

The current prototype supports non-nested brace alternatives such as `{red|green|blue}`. Multiple groups use deterministic Cartesian expansion. `maxPrompts` defaults to 100 and the combined expanded-prompts × iterations batch is capped at 100 prototype jobs.

## Seed Behavior

Seed behavior must be explicit because it changes reproducibility.

Supported modes:

- `Per iteration`: use one seed per iteration and share it across every expanded
  positive/negative prompt pair in that iteration;
- `Per prompt`: use a different seed for every prompt-pair × iteration job.

For `Fixed`, the entered seed starts the sequence. For `Random`, Generate picks
one random base seed for the batch, then advances the sequence. Seeds wrap in the
32-bit unsigned range. Queue display order remains prompt pair first, then
iteration within that pair. `Reuse` snapshots the last actual seed from a
completed output of this same Project as the base seed at Generate time, then
uses the same `Per iteration` or `Per prompt` schedule. It never searches another
Project, accepted layer provenance or prunable queue rows for a substitute. If
the Project has no completed seed, Generate is disabled with an explicit reason;
there is no silent random fallback.

The project-scoped last-actual-seed cursor advances only after a candidate
output is validated and durably committed as completed. Pending, canceled,
failed and partially written outputs do not advance it. Later discard of a
completed candidate does not erase the fact that its seed was actually used.
The cursor is operational metadata outside document dirty/undo history and
survives same-session tab switches and graceful close/reopen. Production stores
it in app-managed project recovery independently of staging manifests and queue
rows; explicit Project Save also snapshots it into `.igs`. Without Save, a newer
local cursor is not part of the portable `.igs` file.

Each queued job freezes its actual seed and its requested seed policy separately.
The selected dynamic seed behavior and requested policy are stored in
accepted-result provenance alongside the actual seed, even when the requested
policy was `Random` or `Reuse`.

## Persistence

Expanded-prompt preview state is transient UI state.

Persist:

- dynamic prompt source text;
- dynamic prompt settings;
- concrete expanded prompt used for each generation result.

Do not persist:

- loading state;
- parse error UI state beyond normal project/session diagnostics;
- full transient preview list unless it is tied to an actual generated result.

## Production Seed Reuse checkpoint

[The current internal checkpoint](../../../engineering/phase-2b-seed-reuse-research.md)
records actual seed only after durable candidate completion. Main reads that
cursor with the local Project key and open `.igs` `documentId`, then freezes
the concrete `reuse` seed before enqueue. If the local cursor is absent, the
saved `.igs` snapshot is used; if both are absent, Prepare stops explicitly.
The Results IPC exposes the local cursor and explicit Save records its snapshot
without marking the document dirty or adding Undo history. Renderer Generate and
installed dynamic batches were open at that historical checkpoint. The bounded
installed-system follow-ups below cover Anima and exact Illustrious/NoobAI EPS/V.
A packaged Linux/NVIDIA release pipeline remains unqualified.

## Production prepared-batch planning checkpoint

The [internal planner and capacity checkpoint](../../../engineering/phase-2b-batch-planning-research.md)
adds `planGenerationBatch` and `enqueuePreparedBatch`. The caller supplies one
already frozen Project preparation with a resolved Fixed/Random/Reuse base;
main snapshots it and the options before asynchronous admission. The pure
planner validates all source syntax before selecting a bounded Cartesian prefix,
uses positive outer/negative inner and pair outer/iteration inner order, and
returns an explicit `truncated` flag when `maxPrompts` selects only a prefix.
Overflow of the independent job limit refuses the whole batch instead of
silently truncating it again. Huge products are not eagerly allocated.

The initial shared prepared-batch policy is 32 jobs, selected by persistent
storage measurements. Recovery's 64-candidate ceiling and escaped-byte
preflight remain separate constraints; this is not GPU or release qualification.

The current internal grammar supports non-nested alternatives, preserves
duplicates and literal dollar text, rejects empty/single alternatives, and
retains backslash escapes. Sources and concrete strings are bounded to 16 KiB
UTF-8. The current Python worker cannot condition literal brace text, even
escaped; main explicitly refuses remaining braces before qualification. Pure
lexical preservation is not evidence of Compel/GPU support.

One common target lease qualifies the group, and every varied concrete request
is checked against the transport envelope before atomic queue publication.
New frozen contexts and accepted provenance retain the selected `seedBehavior`;
legacy records without it remain readable and unspecified. Integration tests
use real Project preparation for Fixed, one Random choice and completed Reuse
seed zero, then actual queue/staging/Add/portable Save with external inference
substituted. Seed behavior remains main metadata rather than a Python sampling
parameter.

At that planning checkpoint renderer Generate, preview/settings UI and persisted
dynamic draft options were unconnected. The following checkpoint closes preview
and draft storage only; full conditioning and release inference remain open.
The prototype's 100-job guard remains separate from production admission policy.

## Production persisted-settings and preview checkpoint

The [production preview checkpoint](../../../engineering/phase-2b-dynamic-preview-research.md)
opens one modal from either prompt toolbar. It expands the current positive and
negative source text with the real pure planner, using one iteration and the
shared 32-job cap. It displays concrete pairs, parse/byte/count errors and an
explicit warning when `maxPrompts` selects a shorter prefix. Literal braces
retained by the grammar are marked as unsupported by the current worker.
It does not select Random/Reuse seeds, call main admission or qualify a model.

`generationDraft.dynamicPrompt` stores `maxPrompts` (integer 1..100, default 100)
and `seedBehavior` (`per-iteration` by default, or `per-prompt`). These are
Project edits with Undo/Redo, recovery shadow and explicit portable Save.
Preview pairs, errors and modal visibility stay transient. Opening and closing
the preview alone preserves dirty/history, the actual seed snapshot and `.igs`
bytes. Legacy documents without settings remain readable and absent on open;
effective defaults do not create an edit or silently add the field. New documents
store an owned default object. Strict package/IPC guards reject invalid objects.

Native Electron checks cover both toolbars, four ordered pairs, truncation,
malformed text, job overflow, 32 long pairs at 900×620, Undo/Redo and actual
`.igs` Save/reopen. Real service/synchronization tests additionally cover legacy
no-ops, captured values while updates are pending and crash-shadow recovery.
Native Save with a dynamic update still pending and native busy/reload states
are not separate reproduced scenarios in this slice.

Renderer Generate, images-per-click wiring and installed conditioning were open
at this historical preview checkpoint. Successful preview expansion alone is
not a generation-readiness check; the installed-system evidence below is separate.

## Installed Anima dynamic-batch checkpoint

[The bounded installed-system qualification](../../../engineering/phase-2c-anima-dynamic-batch-research.md)
uses real renderer Generate, Main admission, SQLite queue, installed worker0.14
and portable Add/Save/readback/reopen. Four weighted positive×negative pairs with
two images use Fixed0/per-iteration seeds `0,1,0,1,0,1,0,1`; a recovered project
uses local completed0 with Reuse/per-prompt seeds0…7. Current prompt/method/seed37/
LoRA edits after admission leave frozen inputs and accepted configuration intact.

A real completed/running/pending crash preserves candidate0 and local cursor0
without a newer portable Save; reopening cancels unfinished jobs with APP_RESTART.
Recovered0 and Reuse0/1 reproduce healthy same-execution pixels. An installed
constant-noise-seed mutation causes pixel RED for seed1 before Add; restoration
and fresh0/1 reproduce healthy pixels. Three saved/reopened packages contain19
accepted layers with seed snapshots1,7,1. Independent raw SQLite/ZIP/Pillow checks
separate normal, mutant, fresh and excluded setup/partial attempts.

This finite evidence is Euler256×256/three steps/BF16 with an exact signed LoRA;
it does not qualify the Illustrious/NoobAI counterpart, Random, wrap, max32 native
inference, installed truncation, the full Fixed/per-prompt pair matrix, arbitrary
formats/quality or release. Production admission cap32 is unchanged. The seed
cursor identity contract is checked in source/integration tests; this installed
sequence alone cannot distinguish every possible global-latest cursor mutation.
The separate Illustrious/NoobAI counterpart is recorded below.

## Installed Illustrious/NoobAI dynamic-batch checkpoint

[The bounded EPS/V qualification](../../../engineering/phase-2c-illustrious-dynamic-batch-research.md)
uses the real built application, installed worker0.14 and actual SQLite/PNG/.igs.
Four weighted positive×negative pairs with two images use Fixed0/per-iteration
`0,1,0,1,0,1,0,1`; crash-recovered local0 with Reuse/per-prompt uses0…7. Current
prompt/sampler/seed37/LoRA edits preserve frozen/native/portable inputs. Same-seed
positive-only and negative-only text changes affect pixels in both objectives.

Both completed/running/pending crash cuts preserve candidate0/local0 without
changing the saved package/null snapshot; startup cancels unfinished jobs with
APP_RESTART. Recovered0 and Reuse0/1 reproduce healthy same-execution pixels.
Both installed generation-RNG constant0 mutations leave seed metadata correct,
retain GREEN0 and cause pixel RED on1 before Add/0 accepted. Byte-exact protected
restoration and fresh0/1 reproduce healthy pixels through Add2/Save/reopen.
Independent raw aggregate verifies58 admissions/42 completions/16 cancellations,
six saved/reopened packages/38 layers and snapshots1,7,1 for each objective.
A separate excluded UI selector failure admitted0 jobs; it is not inference
or mutation evidence. Original catalog/defaults/prior220 rows/source43 survive.

This evidence is256×256/three steps/CFG5, exact EPS/Euler a/non-ZTSNR or
V/Euler/ZTSNR with leading spacing, signed Digital Art−0.5 and native external
VAE FP32. This historical checkpoint has no embedding sidecars; its completed
embedding follow-up is recorded below.
Random, wrap, max32 native, installed truncation/full Fixed-per-prompt matrix,
replacement-document identity, arbitrary formats/geometry/quality and release
remain open. Production cap32 and PP statuses are unchanged. Shared flow now uses
family adapters; this slice does not rerun installed Anima ML, and its historical
evidence above is not expanded by these EPS/V results.

## Installed dynamic embedding-subset checkpoint

[Bounded EPS/V follow-up](../../../engineering/phase-2c-illustrious-dynamic-embeddings-research.md)
authors both full templates and exact trained IllustriousPhoto refs through real
focused completion. Four ordinary/negative/positive/both pairs use Fixed0,
one image each/per-iteration. Frozen context retains full authored signed refs;
each native job and accepted record keeps only the effective concrete subset.
Ordinary wire omits embeddings. Current removal and sampler/seed37/LoRA/dynamic
edits do not change execution or saved provenance. Restored maxPrompts2 uses the
same full source/refs and selects ordinary/negative, a representative ordered
2-of4 truncation, not general cap/seed-policy coverage.

Independent SQLite/raw ZIP/Pillow aggregate5802 verifies20 qualified admissions,
16 finite outputs,4 APP_RESTART,4 saved/reopened packages/12 layers/snapshots0,
all12 per-layer comparisons and prior278/catalog9/14/defaults/source43 preservation.
Both negative-alias tensor-zero mutants retain GREEN ordinary and give same-input
pixel RED before Add/0 accepted; fresh4 reproduce healthy pixels after protected
restoration/physical exit. A separate watchdog4-admission/0-output exclusion
makes raw totals24/16/8 and is not a mutation success. Qualified launcher/native/
combined limits are2/≤12/14GiB, swap0; measured combined peak~9.65GiB.

Joint CLIP L/G zeroing does not independently qualify each encoder, scalar-weight
correctness or image quality. No new Anima ML run occurred in that embedding
checkpoint. The separate seed follow-up below includes Anima; max32 native,
broader caps/truncation,
full Fixed/per-prompt combinations, replacement identity, arbitrary formats/
geometry/quality/public delivery/release and full MVP remain open.

## Installed Random and uint32 seed-boundary gate

[The bounded installed-system follow-up](../../../engineering/phase-2c-generation-seed-boundary-research.md)
qualified the bounded existing seed contract in Anima and exact Illustrious-family EPS/V.
The actual Random switch selected one original Main cryptographic base per batch;
observation returned the same producer Buffer and restored its function identity.
Only the first admitted frozen seed supplies the numerical base, independently
checked against that real pick. Later rows are checked against the ordered table.
Two selected prompt pairs with two images use base/next/base/next per iteration.
Fixed numeric replay preserves seed behavior and every native input, while saved
requested policy remains Random versus Fixed.

Fixed MAX/per-prompt uses 4294967295/0/1/2; fresh controls select the first pair
with MAX/0. Full authored templates are retained. An installed mutation changes
high-bit consumption only at the generation-noise producer, preserving declared
seed metadata; same-input pixel RED is required before Add and protected source
restoration/physical exit precede fresh controls. Current authoring edits must
preserve queued and portable values; each accepted layer has its own read-only
comparison. Valid actual completion seeds differing from scheduled seeds remain
supported by the general production receipt/provenance contract.

Independent raw SQLite/ZIP/Pillow aggregate PASS (15,006 checks) confirms 54 qualified
admissions/45 finite outputs (36 normal, 3 provisional mutant, 6 fresh)/42 accepted
saved layers/12 reopened packages/9 APP_RESTART. Raw 58/49/46/13/9 separately include
a superseded healthy EPS Random run with 4 admissions/4 outputs/4 saved layers/one
package. Two excluded setup 0/0 attempts are not semantic RED. All three high-bit
mutants gave pixel RED before Add/0 accepted; protected 43-file restoration and
fresh 6 reproduced healthy MAX/0 pixels. All 42 per-layer comparisons passed.
Original 302 queue rows/186 cursors/249 receipts, catalog 9/14/defaults and eight
original sources remain unchanged; final physical idleness is confirmed.

Cap32/bounded truncation was the next finite gate at this seed checkpoint;
the completed bounded follow-up is recorded below. The full policy/mode matrix,
arbitrary geometry/formats/quality, replacement-document identity, public delivery/
release and full MVP remain open. PP statuses remain unchanged.

## Installed cap32 and bounded truncation gate

[The bounded installed-system follow-up](../../../engineering/phase-2c-generation-batch-cap-research.md)
qualified Anima and exact Illustrious-family EPS/V TXT at 256×256/three steps.
The full four weighted positive×negative pairs × eight iterations use Fixed0/
per-iteration, with 32 outputs and no truncation. The first three pairs × two
iterations use Fixed0/per-prompt, with six outputs and explicit truncation.
Literal pair-major seeds are 0..7 per boundary pair and 0,1,2,3,4,5 for the prefix.
All 18 selected-prefix outputs match same-native-input boundary pixels at
indices 0,1,10,11,20,21. After the standard cross-Project omission of
documentId/documentRevision, only seedBehavior is excluded among generation-
setting metadata; requested Fixed policy and every executed input remain
asserted, while each actual policy/behavior is checked separately.

Independent aggregate PASS confirms 114 admissions/114 finite/114 accepted
saved layers/114 per-layer comparisons and six accepted saved/reopened packages.
Three actual confirmed 33-job UI refusals preserve all 32 temporary results,
queue/receipts/cursor/staging/private shadow/saved package and Project DTO,
including Undo/Redo availability; internal Undo-stack contents are not inspected.
The typed getGenerationState error after the UI request is an observation,
not the Generate response. Three empty pre-refusal Saves and six proof copies
are separate from the six accepted packages. Original 360 queue/202 cursors/
298 receipts, catalog9/14/defaults,43 installed source/assets and eight model
sources remain unchanged; final physical idleness is confirmed.

Five actual-source semantic mutants were killed: 204 executed tests/22 failures,
baseline/fresh restored each 52/52 GREEN, zero skipped. Negative-side
saturation, asymmetric pair order and exact negative31/32/33 are source-level
controls, distinct from installed ML evidence. Focused349/typecheck/build pass.
Earlier interrupted/excluded/partial source-harness attempts remain separately
classified in the research note and do not contribute semantic failures.

Anima ER-SDE order3 was the next finite gate at this cap checkpoint; its
[completed finite follow-up](../../../engineering/phase-2c-anima-er-sde-order3-research.md)
and later finite image-sampler checkpoints are recorded in the
[implementation roadmap](../../../specs/01-implementation-roadmap.md#installed-dynamic-img-and-out-for-illustrious).
The complete seed-policy/mode matrix, arbitrary geometry/formats/quality,
public delivery/release and full MVP remain open; PP statuses are unchanged.
Historical counts above retain their original scope.

## Installed Illustrious/NoobAI dynamic IMG and OUT gate

The [current qualification](../../../engineering/phase-2c-illustrious-dynamic-image-research.md)
has a confirmed finite gate, including independent reader PASS (10,833 checks).
Its corrected frozen R2
plan reuses each objective's source PNG across IMG/normal mixed-alpha OUT for EPS/V,
four weighted positive×negative pairs ×
two iterations, Fixed0/per-iteration and literal seeds `0,1,0,1,0,1,0,1`.
Normal N3/CFG5/strength0.5, Digital Art−0.5 and native external VAE FP32 are
fixed; two actual updates and captured target/resource ownership were observed.
Authored templates, concrete pairs, seeds and accepted settings remained frozen
after late draft edits; the later drafts survived explicit Save.

R2 produced 48 admissions/completions: 32 healthy, 8 provisional controls and
8 fresh restored, with 40 accepted layers in 8 saved/reopened packages.
The protected generation-noise-seed→0 mutation gave four seed 1 causal pixel RED
before Add, four seed 0 wholeRGBA neighbor GREEN and eight fresh restored
wholeRGBA matches. All six same-seed contrasts among four prompt pairs, including
diagonal pairs, passed in both seeds across the four scopes: 48 prompt contrasts.
Independent raw SQLite/ZIP readback composed every visible saved contribution over
its source; the four OUT previews preserved soft alpha and 222,208 protected-source
pixels. The reader also confirmed all 43 original source identities restored.

One control's original native report retains an ENODEV cleanup race while reading
the disappearing cgroup. Separate source-bound PID/start/cgroup closure evidence
confirms its native and launcher exits; the race is not a numerical mutation RED.
After that original-source reader PASS, the fresh system proof passed 820 checks.
The env/cwd cleanup-guard component refused exactly its own controlled process;
mutating only the real predicate gave semantic RED, followed by verified physical
closure and fresh original PASS. The control used its own 128 MiB, zero-swap,
20-second unit. This component test supplements the actual cleanup proof.
Guarded disposal completed for nine R0 paths (9,117,696 allocated bytes) and seven
R2 paths (7,651,328 allocated bytes), retaining all 43 original source identities.

The ENODEV repair was then applied after original-source readback and cleanup.
An isolated complete copy of the two actual subject/test files gave 30 baseline
GREEN, four semantic RED with 26 neighboring GREEN, and 30 fresh restored GREEN.
Copied inode/mode/mtime/SHA identities were restored exactly. No ML jobs were
rerun for this helper repair; the original native error and closure supplements
remain recorded separately.

The excluded first EPS IMG attempt produced/saved 8 accepted layers but the
profile failed on its all-visible assumption. Actual Add initially shows one
selected generated anchor. The qualifier now explicitly shows hidden variants
through the application UI before Save and checks that only their visibility
changed. Sticky completion-verification failure is also repaired in the shared
test driver. These are harness changes; application Add/worker/Save behavior is
unchanged. Qualified 48 completions/40 accepted remain separate from raw 56/48
including the failed first attempt; its package is not one of the eight qualified
packages and the original failure remains recorded.

## Installed Illustrious/NoobAI per-prompt IMG and OUT gate

[The finite follow-up](../../../engineering/phase-2c-illustrious-dynamic-image-per-prompt-research.md)
qualifies the same four EPS/V × common-source IMG/normal mixed-alpha OUT scopes
with four weighted positive×negative pairs × two iterations, Fixed0/per-prompt
and literal seeds `0,1,2,3,4,5,6,7`: 32 admissions/completions/accepted layers and
four saved/reopened packages. Eight first-pair seed0/1 wholeRGBA references match
the prior per-iteration reports; 16 within-pair seed contrasts isolate seed
changes. Later pairs use new seeds2…7 and have no trained same-input reference.
Cross-pair prompt causality is not claimed; the earlier per-iteration same-seed
prompt evidence remains separate.

Concrete weighted prompts, Fixed0/per-prompt and LoRA−0.5 remain frozen in
queued and accepted settings. Original templates/maxPrompts are captured in the
pre-admission draft/report; accepted provenance does not include them. Later green-bowl/grainy
prompts, Fixed37/per-iteration, maxPrompts3 and LoRA−0.25 survive Save/reopen as
current draft separately. Every accepted layer has its own comparison, and
actual Add's anchor-only visibility default remains unchanged. The qualifier
explicitly shows hidden variants before checking all saved OUT source-over
contributions. All43 native worker source identities and application bundles
remain unchanged; prior report hashes/plaintext are preserved with explicit
lineage for the four changed qualification helpers. No trained mutation/crash
jobs were added. Exact executed outcomes and limits live in the new research note.

Image Random → numeric Fixed replay, Reuse/crash, bounded MAX→0 wrap and cap32
are qualified in the separate follow-ups below, including the finite image
embedding subset gate. Broader embedding permutations, Anima image batches
and broader geometry/formats/quality remain open.
PP-004/005/007/008 remain
«Пока не обещать»; fullMVP/Invoke trained-pixel parity/public release are not claimed.

## Installed image Random → Fixed replay gate

[The finite64-job follow-up](../../../engineering/phase-2c-illustrious-image-seed-replay-research.md)
uses four EPS/V × common-source IMG/normal mixed-alpha OUT scopes, each with a
Random batch and numeric Fixed replay of four weighted positive×negative pairs
× two iterations/per-prompt. All64 admissions/completions are explicitly accepted
and saved/reopened in eight packages. All32 replay images match their Random
counterparts in wholeRGBA. Four original Main cryptographic picks are observed
without replacement; the handwritten offsets0…7 bind all later seeds.

Every accepted result retains its concrete executed prompts, actual seed,
per-prompt behavior and Random versus Fixed requested policy. Original templates
and maxPrompts remain pre-admission draft/report evidence. Later green-bowl/grainy
prompts, Fixed37/per-iteration, maxPrompts3 and LoRA−0.25 stay separate after Save.
The native comparison retains all executed context/worker fields except requested
policy and portable document identity/revision, excluding the transport envelope.
Independent SQLite/ZIP/Pillow readback checks raw rows, provenance, owning settings
comparisons, cursor/Save snapshot, source-over previews and unchanged43 worker
identities. Baseline-hook and seedBehavior harness mutations give1+4 semantic RED
with neighboring/fresh restored GREEN; no new trained mutation/crash jobs.

This qualifies only256×256/Normal N3/two progress updates and the declared sources,
resources and geometry. Its separate image Reuse/crash, bounded MAX→0 wrap and
cap32 and finite image embedding subset follow-ups are recorded below. Broader
embedding permutations, Anima image batches and broader formats/quality/release
remain open. Public promise statuses do not change.

## Installed image Reuse after crash gate

[The finite44-admission follow-up](../../../engineering/phase-2c-illustrious-image-reuse-crash-research.md)
uses four EPS/V × common-source IMG/normal mixed-alpha OUT scopes. Each Fixed B
crash cut preserves completed/running/pending raw state; Home Recover restores
the edited draft, source layer, candidate and document-scoped operational B while
the source-only explicit Save snapshot remains null. Startup cancels two
unpublished jobs with APP_RESTART. Add accepts the recovered candidate, which is
hidden before public Reuse submits B+0…B+7/per-prompt.

Independent readonly SQLite/ZIP/Pillow readback confirms44 admissions,
36 completions,8 cancellations,36 accepted saved layers and4 reopened packages
with source1 + hidden recovered1 + new8. All32 Reuse and4 crash outputs match
their own retained Fixed controls in wholeRGBA. Fixed/Reuse policies, concrete
prompts, actual seeds, LoRA/resource settings and sibling layer-source contexts
survive Add/Save/reopen and every owning comparison. Later authoring remains
separate. All11 original tables and43 worker identities are preserved.

One decoder setup3-admission/1-completion/2-cancellation attempt with1 accepted
unsaved shadow layer is excluded. Combined raw attempts47/37/10 contain36 saved
accepted layers plus1 unsaved layer. Actual Main Reuse0/stale91 tests distinguish
valid zero from absence: isolated nullish-to-truthy mutation gives4 semantic RED,
8 neighboring GREEN and12 fresh restored GREEN, without installed mutation.
This is the declared256×256/Normal N3 Reuse/crash boundary; its own run did not
exercise wrap or cap32. The separate bounded MAX→0 wrap and cap32 gates follow
below, together with the finite image embedding subset gate. Manifest-first
recovery, snapshot fallback, broader embedding permutations, Anima image, trained quality and
full release readiness remain separate.

## Installed image uint32 wrap gate

[The finite16-job MAX→0 gate](../../../engineering/phase-2c-illustrious-image-seed-wrap-research.md) uses four EPS/V × common-source IMG/normal
mixed-alpha OUT scopes. Each standalone numeric Fixed MAX and numeric Fixed0
control creates one result in its own project; the same weighted pair with
two iterations/per-prompt produces literal `[4294967295, 0]`. All16 admissions,
completions and accepted layers are saved/reopened in12 packages. All8 wrap
outputs match their own numeric controls in wholeRGBA before Add; four MAX/zero
same-prompt pixel contrasts are separate from cross-prompt effects.

Control matching preserves every executed context/worker input except portable
document identity/revision. Both requests keep Fixed/per-prompt; later prompt,
Fixed37/per-iteration and LoRA edits remain a separate current draft. All16
portable configurations and sibling source contexts, owning comparisons,12
cursor/Save snapshots, original11 tables and43 worker identities survive.
Independent raw SQLite/ZIP/Pillow readback passes 8178 checks;28 full
source keys and five bundles remain bound. After single-control Add, preview
preparation preserves the existing revision because no visibility edit is
needed; one/two-contribution source-over previews are checked independently.

Actual Main modulo mutation gives4 overflow semantic RED,8 nonoverflow
neighbors GREEN and12 fresh restored GREEN;137 focused tests pass. The
installed worker was not mutated. Previous installed TXT high-bit mutations
remain historical evidence. This gate qualifies only256×256/Normal N3/two
observed updates/exact resources and native MAX→0. Its own run did not qualify
native1/2/cross-pair wrap or cap32. The subsequent finite cap/prefix gate below
qualifies seeds0…7; MAX cross-pair wrap, image dynamic embedding subsets, Anima
image, quality/Invoke pixel parity/fullMVP/release remain separate. At this
historical checkpoint image cap32 was next; public promise statuses do not change.

## Installed image cap32 and selected-prefix gate

[The finite152-job cap gate](../../../engineering/phase-2c-illustrious-image-batch-cap-research.md) uses four EPS/V × common-source IMG/normal
mixed-alpha OUT scopes. Boundary selects four weighted pairs × eight iterations
at Fixed0/per-iteration:32 outputs with seeds0…7 in each pair. Prefix selects
the first three pairs × two iterations at Fixed0/per-prompt:6 outputs with
seeds0…5 and explicit preview/queued truncation notices. All24 prefix images
match their own boundary slots0,1,10,11,20,21 in wholeRGBA before Add. Only
seedBehavior authoring metadata and portable document IDs/revisions differ.

All152 admissions/completions/accepted layers survive eight Save/reopen
packages, with one imported source plus32 or6 accepted layers per project.
All152 exact configurations and sibling source contexts have owning read-only
comparisons; all8 cursors and Save snapshots retain last actual seed7/5.
Four real confirmed33-job replacement attempts return BATCH_TOO_LARGE before
Add and preserve every32 temporary candidates, source layer, prior queue/receipt/
cursor state and the whole paired captures/save copies. No new jobs/receipts
are admitted. Undo/Redo availability flags are checked; hidden Undo-stack
content and later historical private-tree rehash are not claimed.

Independent stdlib/Pillow readback passes 104613 recorded checks,
including all ZIP/member digests and full32/six-contribution source-over
previews, all11 old tables,43 original worker identities,34 current source keys
and five unchanged bundles. Historical R0 actual Main faults give16 semantic
RED and84 GREEN across100 executions; these subjects are byte-unchanged in R2.
Fresh deadline DI faults give4 RED and371 GREEN across375 executions. Both
536-source copies are exactly restored and guarded-cleaned; preexecution261 focused
tests pass with0skips. Original195 and pre-split259 passing suites remain
historical evidence. Resource/candidate/staging
preconditions in these Main tests are doubles; actual native UI retention
and pixel comparisons remain separate evidence. No installed-worker mutant
or new runtime/model copy is involved.

The previous R0 attempt exhausted its1800s deadline after32 actual accepted
outputs and one retained package, before all owning comparisons/reopen checks
finished; it has zero qualified stages/packages. Its unchanged report and
all original rows remain historical. The new R2 counts exclude those32; raw
across both attempts is184, with152 newly qualified here. Boundary deadlines
are explicitly2700s; prefixes retain1800s. Native12GiB/launcher2GiB/combined
14GiB, zero-swap and1600s completion poll remain unchanged.

This qualifies the stated256×256/Normal N3/two actual updates/CFG5/strength.5,
DigitalArt−.5/external native FP32 VAE and exact EPS/V IMG/LaMa OUT resources,
finite seeds0…7, cap32 and first-three-pair truncation only. MAX cross-pair
wrap, other Cartesian permutations/caps/method policies, Anima image, broader
geometry/formats, quality/Invoke pixel parity/fullMVP/release remain separate.
At this cap checkpoint image dynamic embedding subsets were next; the
completed finite subset gate is recorded below. Public promise statuses do not change.

A later [raw imported-source guard supplement](../../../engineering/phase-2c-illustrious-image-batch-cap-research.md#raw-imported-source-guard-supplement)
fixes a vacuous native-view provenance check:271 final tests pass, actual guard
sensitivity gives1 semantic RED/26 GREEN across27 executions, and the updated
guard passes all8 original raw before/after captures. Original native reports,
worker/app bytes and qualified152/8/24/4 counts remain unchanged.

## Installed image dynamic embedding subsets gate

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
[Installed Anima dynamic image foundation](../../../engineering/phase-2c-anima-dynamic-image-research.md) is qualified; Anima image Fixed/per-prompt80/4/16 is qualified separately; Anima image Random → Fixed32/4/16 is qualified separately; Recovered Anima image Reuse is qualified separately (22 admissions / 18 completions / 4 APP_RESTART / 18 accepted / 2 packages); the [MAX→0 gate](../../../engineering/phase-2c-anima-image-seed-wrap-research.md) is qualified separately (8 outputs / 6 packages / 4 own controls); Anima image cap32/prefix refusal is next. Other permutations/geometry/formats,
scalar/per-encoder correctness, quality/fullMVP/release remain separate. Public
PP-004/005/007/008 statuses remain «Пока не обещать».

## Vue Prototype Coverage

The shared preview modal parses non-nested brace alternatives directly from `GenerationPrompt.text`, produces deterministic Cartesian prompt pairs and exposes `maxPrompts` plus `per-iteration` / `per-prompt` seed behavior. Opening preview is transient; changing these settings is a Project generation-draft mutation. Nested braces and malformed expressions show local errors.

Generate flushes the active prompt edit, expands the frozen plain text, multiplies the pairs by images-per-click and blocks the action when the result exceeds 100 mock jobs. Queue items freeze each concrete prompt, the scheduled actual seed, requested seed policy and cloned positive/negative embedding refs; Danbooru and LoRA-trigger metadata are not stored. The mock completion advances a session-owned cursor only after a candidate reaches `completed`; cancel and queue pruning do not change it. Accepting a result copies its frozen actual seed, requested policy and selected seed behavior into in-memory provenance. The prototype does not execute a production worker seed scheduler or persist the cursor/provenance to `.igs` or an app-managed recovery store.

## Acceptance Criteria

- User can preview expanded prompts before generation.
- Invalid dynamic syntax is visible before queueing a job.
- Dynamic prompt settings affect the generated job list.
- `Reuse` uses the last completed actual seed of the current Project and cannot
  generate until one exists; canceled/failed jobs cannot supply that seed.
- Concrete expanded prompts are stored in accepted-result provenance.
- Wildcard expansion is not supported.

## Installed Anima dynamic image foundation

[Installed Anima dynamic image foundation](../../../engineering/phase-2c-anima-dynamic-image-research.md): Euler × common-source IMG/normal mixed-alpha OUT:20 admissions/completions/accepted layers,4 Save/reopen packages и4 own same-input wholeRGBA prefix controls. Четыре weighted positive×negative пары × две iterations; Fixed0/per-iteration seeds0/1, full authored templates и selected first-pair prefix. Полные compiled strings/spans остаются в frozen worker inputs; portable provenance содержит concrete raw weighted prompts без compiled arrays/templates/maxPrompts. Independent raw readback PASS18128:20 owning comparisons,4 cursor/Save snapshots1,11 old tables,43 worker identities и2 OUT previews/111104 protected source pixels. 75 focused tests PASS0skip;18 actual Main source executions дают4 semantic RED/14 GREEN. 34 visible joint-input contrasts не доказывают scalar-weight/tensor causality; новых installed-worker mutations нет. Только256×256/Euler N3/two actual updates/exact resources; quality/fullMVP/release не заявлены.

Последующий [Anima Fixed/per-prompt image80/4/16 gate](../../../engineering/phase-2c-anima-image-per-prompt-research.md) подтверждён отдельно. Random → Fixed32/4/16 подтверждён отдельным checkpoint; Reuse после recovery подтверждён отдельным 22/18/4/18/2 gate; [MAX→0](../../../engineering/phase-2c-anima-image-seed-wrap-research.md) подтверждён отдельным 8/6/4 gate; следующий finite gate — Anima image cap32/prefix refusal. Anima embedding actions остаются неподдерживаемыми. PP-004/005/007/008 сохраняют «Пока не обещать».

## Installed Anima image per-prompt checkpoint

[Installed Anima image per-prompt](../../../engineering/phase-2c-anima-image-per-prompt-research.md): Euler × common-source IMG/normal mixed-alpha OUT:80 admissions/completions/accepted layers,4 Save/reopen packages и16 own same-input wholeRGBA per-prompt controls. В каждом режиме genuine numeric-control4pairs×8/Fixed0/per-iteration сравнивается с4pairs×2/Fixed0/per-prompt по seeds0…7; control slots0,1,10,11,20,21,30,31. Independent raw readback PASS23682:80 owning comparisons,4 cursor/Save snapshots7,11 old tables,43 worker identities и2 OUT previews/111104 protected source pixels. Full frozen DTO сохраняется; только owner IDs и предварительно проверенный seedBehavior исключены из matching. Concrete raw weighted prompts остаются portable; templates/maxPrompts/compiled arrays — вне provenance. 98 focused tests PASS0skip;18 actual Main source executions дают2 semantic RED/16 GREEN. 64 within-pair seed contrasts, без scalar-weight/tensor causality; новых installed-worker mutations нет. Только256×256/Euler N3/two actual updates/exact resources; cap32-refusal/Random/Reuse/wrap/quality/fullMVP/release не заявлены.

Random → Fixed32/4/16 подтверждён отдельно; Reuse после recovery подтверждён отдельным 22/18/4/18/2 gate; [MAX→0](../../../engineering/phase-2c-anima-image-seed-wrap-research.md) подтверждён отдельным 8/6/4 gate; следующий finite gate — Anima image cap32/prefix refusal. Anima embedding actions остаются неподдерживаемыми. Остальные методы/форматы/геометрия/Advanced/качество/release и полный MVP остаются отдельными; PP-004/005/007/008 сохраняют «Пока не обещать».

## Installed Anima image Random → Fixed checkpoint

[Installed Anima image Random → Fixed](../../../engineering/phase-2c-anima-image-seed-replay-research.md): Euler256 IMG/normal mixed-alpha OUT,32 admissions/completions/accepted layers,4 Save/reopen packages,16 own fullRGBA Random→numeric Fixed matches. Два исходных crypto-return Main наблюдались без подмены; full DTO сохраняет raw/compiled prompts, источники и uint32 seed/step/posterior. Matching исключает только3 owner IDs и проверенную policy; per-prompt сохраняется. Independent raw readback PASS19737:32 owning comparisons,4 chronological cursor/Save snapshots,11 old tables,43 worker identities,2 OUT previews/111104 protected pixels.161 focused tests PASS0skip; actual source18/2 RED/16 GREEN. Нет новой native mutation, deliberate wrap/cap32-refusal/Reuse/quality/fullMVP/release claim. На этом checkpoint следующим был Anima image Reuse; последующие Reuse (22 admissions / 18 completions / 4 APP_RESTART / 18 accepted / 2 packages) и MAX→0 (8 outputs / 6 packages / 4 own controls) подтверждены отдельно; текущий следующий finite gate — Anima image cap32/prefix refusal.

Anima embedding actions остаются неподдерживаемыми; masks/Regional Guidance/Smart Patch — отдельная Phase4. Public PP-004/005/007/008 остаются «Пока не обещать».

## Installed Anima image uint32 wrap gate

[The finite8-output MAX→0 gate](../../../engineering/phase-2c-anima-image-seed-wrap-research.md) checks common-source IMG/normal mixed-alpha OUT, standalone FixedMAX/0 controls and public one-pair/two-iteration per-prompt MAX→0 batches. Frozen worker inputs preserve actual/step/posterior seeds and compiled weighting; eight accepted configurations/6 Save-reopened packages preserve Fixed/per-prompt, raw weighted text, actual seed and exact source/resource context. Four wrap outputs match their own full-input numeric controls in wholeRGBA;6 local cursor/explicit snapshots end atMAX for MAX controls and0 for zero/wrap. Three OUT previews preserve166656 protected source pixels. Actual Main modulo fault gives2 overflowRED/fourneighborsGREEN, then6 restoredGREEN; no new installed-worker mutation or broader cross-pair/cap32/quality/fullMVP/release claim. Next: Anima image cap32/prefix refusal.
