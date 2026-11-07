# Fixed Anima visual retest after numerical corrections

## Fixed question and source

Base: `4db06561e07421706455fdbea457c51dc101d343`. Repeat the original
[scarf-placement assessment](./phase-4-regional-guidance-anima-visual-research.md)
after [fragment joining](./phase-4-anima-fragment-parity-research.md),
[rotary-buffer precision](./phase-4-anima-rotary-precision-research.md) and
[RGB precision](./phase-4-anima-rgb-quantization-research.md) corrections.
Authored prompts, weights, seeds, model, geometry and composition do not change.
The current compiled text/spans/IDs use the corrected compiler. Any image change
is a cumulative corrected-stack observation, not isolated visual causality for
one of these fixes.

Re-read current clean InvokeAI `a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd`:
`invokeai/backend/anima/{regional_prompting,conditioning_data,anima_transformer_patch}.py`,
`invokeai/app/invocations/anima/anima_denoise.py`, the native decoder
`invokeai/app/invocations/vae/anima_latents_to_image.py` and the actual generation
graph/canvas callers. Independent context preparation, global background support
on even positive blocks, unrestricted odd/negative attention and native RGB
conversion remain the existing adapted owners. No production change is needed.

## Frozen inputs and evaluation

Use the same exact trained Cyberfalafel original-Anima Base bundle and pinned
Qwen/Wan companions; no replacement or additional resources. Every request uses
512², world origin(-13,5), 20 Euler steps, CFG 4, CUDA BF16 and the original two owned
half-canvas masks with their 127/128 boundary. Seeds remain 123/124.

- Global positive: `(two white cats)1.25 on one bench`.
- Global negative: `(blur)0.75, noise`.
- Regional texts: `(red scarf)1.5, one white cat` and
  `(blue scarf)0.75, one white cat`.

For each seed compare zero regions, red-left/blue-right assignment and the exact
swapped texts. Do not equalize their different weights or edit prompts/masks.
The original visual contract/addendum are retained byte-exact. Placement requires
two recognizable separate cats with actual neck scarves on the requested sides,
with correct reversal for both seeds and no material fusion/leakage/seams.
Ordinary controls require two cats on a bench. Ambiguity/disagreement is
INCONCLUSIVE. Bench/global-scene retention in regional images is reported
separately, as before: missing bench cannot turn a previous placement PASS into
a newly invented placement FAIL, and placement PASS does not establish complete
scene preservation. Human/user acceptance remains separate.

Six unchanged full PNGs receive a new anonymous order before the first viewing
and fresh generation. An independent reader without inherited prompts, history,
seeds or mapping first describes visible objects, attributes, positions and
anomalies. ROOT then views and applies the frozen rubric; no generation tuning
follows viewing. A correctly placed image against the opposite assignment is a
free rubric-sensitivity control, not another ML request.

## Economical execution and evidence boundaries

Run: `runs/anima-visual-retest/20261108-fixed`. The pre-view retest contract SHA
is `076d11be59cba7a6de3f6fa0ff5df4f91057a29256782a5b406b4936e7a7be11`;
anonymous map SHA is
`a08037553f8b47a6ff2bac0e64d496c7caabadee84c1c8d97568178b722d0a11`.

Two visually unviewed post-RGB-correction PNGs already exist: seed123 assigned
and zero. Their complete source/input/archive/pixel bridge is verified before
reuse. Their raw prompts, sampling, masks, owner identities/revisions and bbox
match historical visual inputs exactly; compiled meaning changes as declared.
They remain prior generated images, not six newly preregistered requests.

Generate four missing comparative cases and one seed123 assigned exact repeat.
The artifact-only wrapper supplies complete freshly produced Main handoffs under
explicit seed/variant keys to the existing trained fixture/helpers. The old
`_handoff` fixes zero/swapped to 123, so 124 cases must not be cached as 123 inputs.
No recipe, compiled sidecar or sampling object is hand-edited; loader, native
encoding/Euler/Wan, original attention, preservation and PNG owners remain real.

The five fresh calls use all existing context/mask/processor/SDPA association
checks. The two reused RGB-probe records have Cosmos/Euler/VAE/RGB/state evidence,
but no all-site collections; none are invented or relabelled. The fresh repeat
bridges the differently observed harnesses through exact terminal latent,
decoded tensor and RGB hashes. Mechanical PASS never sets visual PASS.

The unchanged serial envelope is 12 GiB host, zero swap, 600 seconds/unit and CUDA
allocator fraction 0.75. Reuse original read-only weights and the existing worker
runtime; no model/environment copy or provisioning. Source pins, whole inputs,
all original/blind images, mapping, observations, controls and limitations remain
together. Executed results and retained-byte closure follow the bounded run.

## Executed result

All **five fresh native cases pass** in 148.947 bounded seconds, with zero
failures/errors/skips. The unchanged trained fixture verifies all 1,189 installed
destinations; observed fresh calls cover 200 positive/negative predictions,
100 Euler transitions and five Wan decodes. Each of the processor/dispatch/SDPA
collections contains 11,200 self/cross observations across 28 blocks. Source
hashes, independent context/mask/Euler/PNG checks and streaming borrowed-state/
RNG preservation pass. The repeat is exact in terminal latent, decoded tensor
and RGB against the reused seed123 assigned witness. Host MemoryPeak is
9,043,136,512 bytes with zero swap, within the declared envelope; no new GPU
capacity claim follows. The two prior RGB requests retain their actual earlier
80-prediction/40-transition/two-decode evidence without all-site claims.

The independent no-history reader views every full anonymous PNG before ROOT
viewing, without prompts/seeds/map. ROOT then records visible facts before
opening the mapping. Their object/accessory/position descriptions agree.
Neither is a human/user acceptance review. The six mechanical records remain
visually unclassified; the separate assessment records **NOT_QUALIFIED**.

| Case | Visible result | Original gate |
| --- | --- | --- |
| Seed123 ordinary | Two separate white cats on a wooden bench, no scarves; coherent cartoon scene. | Ordinary PASS |
| Seed124 ordinary | Two separate fluffy white cats on a wooden bench amid foliage; no scarves. | Ordinary PASS |
| Seed123 assigned | Larger left cat/red neck scarf and smaller right cat/blue neck scarf, distinct bodies. No bench. | Placement PASS |
| Seed123 swapped | Upright left cat/blue neck scarf and reclining right cat/red neck scarf, bodies distinguishable despite contact. No bench. | Placement PASS |
| Seed124 assigned | One centered white kitten with red neck scarf and a cyan ground oval; no second cat/blue scarf or bench. | Placement FAIL |
| Seed124 swapped | One centered white kitten still wearing red; no second cat/blue scarf or bench. | Placement FAIL |

Placement remains **2 PASS /2 FAIL**, both ordinary controls PASS. The original
all-four/both-seed gate fails again. All four regional images still omit the
bench; no conspicuous seam or severe fusion explains the absent subject.
Missing bench remains a separate global-scene finding rather than a new
placement requirement. Opposite-assignment controls correctly reject each
successful seed123 image without another ML call; no regional full-scene
positive control exists in this set.

The fixed inputs and current corrected stack therefore reproduce the same
qualitative limitation as the previous Studio assessment and historical direct
Invoke control. This does not identify its cause, isolate the numerical fixes,
prove whole-pipeline equivalence or justify new composition defaults. No prompt,
seed, weight, mask, step count, model or global-support tuning follows viewing.
The actual current Invoke policy still gives the global prompt only background
support on even blocks; these masks cover the canvas. That fact and the unequal
red/blue weights are possible follow-up axes, not causal conclusions.

## Retained evidence and release

Independent frozen artifact-source R1 review is CLEAN without rerunning native
execution or viewing images. The wrapper, source pins, original rubric/map,
whole handoffs, loading/live-state records, native observations and both visual
descriptions remain retained. Seven original PNGs (including repeat) and six
anonymous copies remain directly available; no image reencoding or overlays.

ROOT verifies physical exit of the one owned unit, ended readers, restored
sources and no incoming lifecycle users of the candidates. The owned short
TMPDIR is first renamed after its unit and Unix references end. All 446 archived
entries (407 regular files/39 directories, no links or special files) verify
byte-exact before release. The archive includes every fresh Main DB/package,
seven complete input copies and generated/native scratch. Restore its `inputs`
members before replaying the artifact wrapper with a new label.

Releasing only `payloads` and the duplicate loose `inputs` tree reclaims
**82,890,752 allocated bytes** during the deletion-only interval. Compact run is
about 13 MiB; original weights, repository runtime, source checkouts and parent
evidence remain protected. Retained-byte/source verification and ROOT's native
execution/physical-release measurements are distinct evidence levels.

Public Anima Regional Guidance, regional negatives/references, Smart regional,
durable regional candidates, whole-application Invoke parity and general image
quality remain separate. Regional provenance/Compare/result-derived-preset
exclusions and PP-001/005/007/008 **«Пока не обещать»** remain unchanged.
