# Private Anima scarf-placement visual assessment

## Question and fixed inputs

Base is clean `d9a09b5a2fb5a77f1417f6ceab9fbbbd95dc12e0`, after the
[trained mechanical checkpoint](./phase-4-regional-guidance-anima-trained-research.md).
The missing observation is whether recognizable subjects and their attributes
follow regional text assignments in the actual pixels. Native mask/RGB causality
alone does not establish that semantic result.

Current local InvokeAI is clean
`a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd`. Re-read
`invokeai/backend/anima/{regional_prompting,conditioning_data,anima_transformer_patch}.py`,
`invokeai/app/invocations/anima/anima_denoise.py` and
`invokeai/frontend/webv2/src/features/generation/core/canvas/addRegionalGuidance.ts`.
The existing Studio adaptation retains independent conditioning, background
global support, nearest/ceil masks and even-positive-block alternation. No
production mechanism, parser, loop, public transport, UI or persistence changes.

Use the same exact Cyberfalafel original-Anima Base file
`0fc7507b222e52ac8cc5e2826786bc4caed05223df32d17aeb05a76cb4de9941`,
pinned Qwen/Wan companions, existing repository runtime and private CUDA BF16
TXT/Euler/PNG owner. Native requests use512x512,20 Euler steps,CFG4, seeds123/124,
world origin(-13,5) and the same two independently owned half-canvas masks with
their authored127/128 boundary. Existing attention ceiling33,554,432 remains;
the two-region selection consumes25,165,824 expanded elements. No TI, LoRA,
references, dynamic prompts or regional negatives are added.

The global positive is exactly `(two white cats)1.25 on one bench`; global
negative is `(blur)0.75, noise`. Regional positive texts are exactly
`(red scarf)1.5, one white cat` and `(blue scarf)0.75, one white cat`.
Assignments exchange the entire regional texts, retaining their weights; the
comparison does not silently equalize or tune those weights.

## Frozen protocol and economical reuse

The visual contract is retained at
`runs/regional-guidance-anima-visual/20261107-scarves/visual-contract.json`,
SHA-256 `8a3945b7a08aa619100b8c92ca6e045a48349297d58abee4d461b8578896db33`.
An additional pinned pre-view/pre-generation clarification requires actual neck
scarves rather than merely colored fur/background, and distinguishes the old
mechanical mutation from a legitimate text swap.

Four original PNGs from the preceding trained checkpoint are reused byte-exact:
seed123 zero/assigned/swapped and seed124 assigned. They were generated before
this visual protocol but remained unviewed by ROOT and the independent reader.
Only seed124 zero/swapped need new native requests. The protocol and anonymous
order are frozen before any image viewing and before those two requests. This
is a retrospective-plus-prospective assessment, not a claim that all six images
were generated after preregistration. No prompt, seed, setting, mask or model
search follows viewing.

Both new handoffs must originate unchanged from real Main Save/reopen, capture,
planner, compiled sidecars and exact ModelService bundle resolution. The trained
harness's enumerated `_handoff` fixes seed123 for zero/swapped; a124 handoff must
not be relabeled under its123 cache key. An artifact-only probe supplies fresh
complete124 handoffs under explicit names to the unchanged harness owners. It
reuses native observers, streaming preservation, original Euler/Wan, independent
PNG checks and publication; it adds no generation implementation.

## Separate acceptance gates

An independent image reader first inspects six randomly numbered unchanged full
PNGs without prompts, seeds, variants, masks or mapping. Record actual subjects,
scarf colors and locations, counts, fusion/duplication, color leakage, anatomy,
bench/scene coherence and visible straight boundaries. ROOT separately inspects
the original images, then joins observations to the frozen assignment map.
These are bounded agent assessments, not human/user acceptance.

Ordinary-scene controls must show two recognizable separate white cats on one
bench. Missing or arbitrary-color scarves are allowed in ordinary controls.
Each of the four regional targets must show identifiable red/blue scarves at
the two cats' necks and requested centers on opposite sides of x256. Both seeds
must exchange scarf placement between assigned and swapped. Severe fusion,
duplicates, missing attributes, material cross-assignment leakage or obvious
mask-edge artifacts defeat full acceptance. Minor rendering quirks do not
necessarily fail. Ambiguity/disagreement is INCONCLUSIVE, never automatic PASS.
No silhouette clipping or outside-mask pixel equality is required.

A finite overall PASS requires all four placement/coherence targets and both
ordinary-scene controls. Test rubric sensitivity without another native call:
a correctly placed observed image must fail the opposite assignment requirement.
If no healthy placement exists, record the absence of a positive control.
The preceding trained wrong-mask experiment remains mechanical evidence only;
its center overlap differs from a legitimate swapped text assignment.

## Execution and result

Both new native requests pass: two tests, zero failures/errors/skips,73.418s
bounded elapsed and the declared12GiB/zero-swap/600s envelope. Original loader
installation hashes cover all1,189 destinations. The two requests record80 native
predictions and4,480 original processor/dispatch/SDPA calls in each collection;
all28 blocks, independent masks, weighted contexts, Euler/Wan/PNG and streaming
borrowed-state/RNG preservation pass. Source pins match the historical trained
records exactly. The supplemental artifact changes only a test-input collaborator
for explicit124 case names; the original123 cache remains untouched. No existing
Main/Python suites are relabeled as newly rerun. Four old PNGs/handoffs recover
exactly from the verified retained archive, including decoded RGB/ICC hashes.

The independent observer viewed all six anonymous full PNGs without prompts,
seeds or mapping. ROOT then viewed all six labeled originals and joined the
frozen mapping. Their visible-object descriptions agree. Raw native reports
retain their original `visualStatus: not-evaluated`; the separate
`visual-assessment.json` records **NOT_QUALIFIED**.

| Case | Visible result | Gate |
| --- | --- | --- |
| Seed123 ordinary | Two distinguishable touching white cats on one bench, no scarves; mild contact ambiguity, no severe fusion. | Ordinary PASS |
| Seed124 ordinary | Two separate white cats on one wooden bench with foliage. | Ordinary PASS |
| Seed123 assigned | Two cats with real neck scarves: larger white cat/red left, smaller light patched cat/blue right. No bench. | Placement PASS |
| Seed123 swapped | Two cats exchange scarf colors: blue left, red right, with separate bodies/tails. No bench. | Placement PASS |
| Seed124 assigned | One large central white cat with red scarf, blue oval under it; second cat/blue scarf and bench absent. | Placement FAIL |
| Seed124 swapped | One large central white cat still wearing red; second cat/blue scarf and bench absent. | Placement FAIL |

The decisive placement result is2 PASS/2 FAIL, with both ordinary controls PASS.
The preregistered all-four/both-seed requirement therefore fails. All four
regional images also omit the globally requested bench. The isolated cat drawings
are largely coherent, without conspicuous straight mask seams; this is different
from preserving the complete requested scene. Missing bench is recorded separately
rather than added as a post-view placement criterion. No complete-scene regional
PASS or broad quality claim follows from the successful seed123 side exchange.

Rubric controls require no additional ML call: the observed seed123 assigned
image passes red-left/blue-right and fails blue-left/red-right; the swapped image
passes the opposite pair and fails the assigned requirement. These are healthy
placement controls only; no healthy full-scene-preservation regional control
exists in this set. This is a bounded agent assessment, not human/user acceptance.

The inspected mask policy gives global context only background support on even
blocks; the two masks cover this canvas, while odd blocks remain unrestricted.
The fixed red weight1.5 also exceeds blue0.75. These facts motivate future
comparison, but this experiment does not causally isolate either as the reason
for subject collapse or lost bench. No prompt, seed, weight, mask, sampler,
step count, model or composition tuning followed viewing. The prior trained
wrong-mask mutation remains separate historical mechanical evidence and was not
rerun or mistaken for a legitimate swapped visual target.

No mechanical PASS, image hash contrast or source review substitutes for viewing.
Public Anima Regional Guidance, spatial negatives/references, Smart/durable
candidates, provenance exclusions and PP-001/005/007/008 **«Пока не обещать»**
remain unchanged for any outcome.

## Retention

This run reuses original read-only weights and the existing repository `.venv`;
no model/runtime copy or download is needed. The serial unit envelope remains
12GiB host, zero swap,600seconds and CUDA allocator fraction0.75. Those are test
conditions, not a full-model capacity promise. The new unit's host MemoryPeak is
8,891,445,248 bytes including file cache; no new GPU-peak claim is made. Four
prior images/handoffs are recovered from the pinned archive without changing
bytes. All six originals remain directly available in `retained-png`, all six
anonymous copies in `blind-png`, with whole inputs, frozen map/rubric, observations,
commands/native records and reproduction probe retained separately.

Independent pre-release source/document/retained-byte review is CLEAN within
its read-only scope:1,531 baseline/1,532 current files, three docs-only deltas,
all393 payload entries, exact six original/blind PNGs and both new SQLite/IGS
sets with23 migration hashes and exact resource/dependency/mask associations.
Four reused PNGs and handoffs match their prior archived bytes. The audit
independently decodes image data, not native execution or runtime preservation.
The original visual result remains NOT_QUALIFIED; no mutation is newly claimed.

ROOT separately repeats the one owned unit's physical-exit check, source and
reader/dependency gates, then disposes only the exact idle `payloads` tree.
The deletion-only measurement reclaims13,967,360 allocated bytes, exactly its
inventory. Its verified1,302,109-byte archive retains all393 entries; lifecycle
is `retained`, `payloads: []`. Compact image/input bytes, original weights,
repository `.venv`, shared runtime/catalog and prior evidence remain protected.
Historical pinned compact evidence exceeds the soft budget; no broad pruning.
Final release bookkeeping is ROOT self-verification after the independent audit.
