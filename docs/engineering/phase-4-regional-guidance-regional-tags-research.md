# Fixed regional tag-form prompt control

## Question and preregistration

Base: clean `51396c51cc7051bdfe83b6cd528bb40280e3f310`. The
[installed Invoke comparison](./phase-4-regional-guidance-invoke-tagged-research.md)
reproduced the same conservative 1 PASS / 3 INCONCLUSIVE hair-color outcome as
Studio. Native text/mask consumption passed. That supplies no reason to rewrite
attention, but leaves useful visual assignment unqualified.

This separately declared experiment changes only the two regional positive
strings, keeping the count-tag global text and all other sampling inputs:

| Role                   | Previous literal                | New fixed literal             |
| ---------------------- | ------------------------------- | ----------------------------- |
| Red regional positive  | `one woman with long red hair`  | `1girl, long hair, red hair`  |
| Blue regional positive | `one woman with long blue hair` | `1girl, long hair, blue hair` |

This bundles the regional count token and phrase/word-order representation;
it does not isolate a single color token or prove an age interpretation.
The [exact author model card](https://huggingface.co/OnomaAIResearch/Illustrious-xl-early-release-v0/blob/dca0dac303e6dc4b0c31d8001bc685b89b5d0204/README.md)
contains tagged single-character examples and describes Danbooru training.
It does not endorse this exact red/blue regional pair or guarantee success.
This is one experimental input candidate, not a production prompt rewrite.

Contract `regional-prompt-tags-v1`, SHA-256
`2012779e26e304aa22440de7d2d13ff4b4c812c04bc2ed03404a977c65cf51ef`,
is frozen before execution. Evidence owner:
`~/.codex/artifacts/imagegen-studio/runs/regional-guidance-regional-tags/20261105-red-blue`.
Four new genuine saved/reopened Main cases: seed123 assignment/swapped, then
seed124 assignment/swapped. No additional ordinary, repeat or Invoke requests.
The four retained natural-regional Studio originals are controls; no rerun.
No prompt/seed/model/settings change, retry or variant search follows viewing.

Global positive remains:

> 2girls, anime illustration of two women standing apart side by side, waist-up, simple clothing, plain light gray background, coherent daylight

Keep the exact official epsilon checkpoint SHA-256
`3e15ba00387db678ab4a099f75771c4f5ac67fda9e7100a01d263eaf30145aa9`,
1024², bbox `(-13,5)`, Euler/Normal30, CFG5, rescale0,
Main-resolved scaled-linear/false-ZTSNR/leading and embedded explicit FP16 VAE.
Local/global negatives remain empty. No TI/LoRA/references or quality tags.
Binary full-height halves at x512 retain fixed mask owners/order/revisions;
assignment maps red left/blue right, swapped exchanges only those strings.
Both global supports are Everywhere, both pools `current-canvas`, negative-first
CFG and existing `invoke-canvas-v1` composition unchanged.
Fresh documents have new operational document/owner/request IDs; equivalence
with retained controls concerns inference inputs and mask planes, not those IDs.

## Sources and ownership

Consulted current clean InvokeAI `a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd`:
`features/generation/core/canvas/addRegionalGuidance.ts`, its
`compileCanvasGraph.ts` caller and `app/invocations/text_encoder/compel.py`.
The original literal regional text goes to prompt/style and the existing
dual-CLIP Compel path. Invoke adds no count/color rewrite. Existing mask and
conditioning associations remain the implementation basis.

Adapt only the fixed qualification profiles of the existing
[Main producer](../../src/main/projects/test-fixtures/regional-guidance-character-visual-probe.ts)
and [runner](../../scripts/qualify-regional-character-visual.mts), preserving all
three previous profiles. A fixed per-profile text pair supplies the new input;
no arbitrary prompt override or new inference mechanism is introduced.
Save/reopen, capture, target composition, ModelService resolution, concrete
planner item and complete detached recipe retain their existing owners.
The standard txt2img request lease feeds the existing regional client and
verified result reader. No new dispatcher, public schema, queue or publisher.

## Fixed assessment and evidence scope

Randomize eight full originals: four new tag-form and four retained natural-form
regional outputs. An independent image-only observer describes count, sides,
hair colors and defects before key reveal. ROOT applies the same conservative
narrow criterion: exactly two distinct head/body associations, one per half,
predominantly identifiable red-left/blue-right for assignment and the reverse
for swapped at both seeds. Missing/extra/fused figures or clear wrong association
fail; ambiguous shades/count/position are inconclusive. Pink-only, lavender/gray
or teal ambiguity is not silently relabelled primary red/blue. Record unfinished
drawing and anatomy; minor fingers do not redefine the count/color gate.

All four must pass for the finite association gate. This does not establish
exact ages, full prompt compliance, general visual quality or human acceptance.
The earlier full ordinary gate remains inconclusive. Changed pixels alone do
not pass; outside-mask pixel equality is not required.

Only source/input hashes, complete Main handoffs, response correlation,
30 scalar progress events per request, original PNG metadata/RGB and physical
worker exits are newly observed. No new numerical attention/CLIP oracle,
70-site witness or independent native PT-to-RGB lineage is claimed here.

## Execution and retention

ROOT completes exactly four fresh Main/regional requests in **217.733 seconds**,
without failed or extra native attempts. All four original 1024² sRGB PNGs and
120 scalar progress events are retained. Workers exit and the owned unit ends
without remaining PIDs. No ordinary, repeat or Invoke call is added.

The serial envelope was aggregate host memory at most 12 GiB, zero swap,
1,800-second unit and 600 seconds per request. Observed unit memory peak is
2,556,633,088 bytes; swap peak zero. Installed worker0.14.0, runtime/configuration
and original weights are reused without copies, provisioning or an
allocator-fraction claim. This is not an RSS/VRAM capacity qualification.

The new jobs match retained controls in checkpoint, global prompts, bbox,
target-byte identity, sampling, resources and VAE policy. Region coverage planes,
negative prompts and embedding lists match. Only the declared regional strings
and legitimate operational IDs/paths differ. Source/input hashes and complete
Main handoffs preserve this association.

The independent observer described all eight originals before key reveal;
ROOT then applied the fixed conservative rubric:

| Case               | New blind ID | Visible left / right hair                                | Narrow verdict |
| ------------------ | ------------ | -------------------------------------------------------- | -------------- |
| Seed123 assignment | 04           | Long coral/salmon red-pink / long periwinkle blue-violet | INCONCLUSIVE   |
| Seed123 swapped    | 01           | Cobalt blue / raspberry pink-red                         | INCONCLUSIVE   |
| Seed124 assignment | 07           | Vivid red / deep navy-cobalt blue                        | PASS           |
| Seed124 swapped    | 06           | Pale blue/periwinkle-lavender / warm red-auburn          | INCONCLUSIVE   |

The new narrow gate remains **1 PASS / 0 FAIL / 3 INCONCLUSIVE**, overall
**NOT_QUALIFIED**. All four count/separation subcriteria pass. Natural-form
controls, IDs02/08/03/05 in the same case order, retain the same conservative
aggregate. No red/pink or blue/violet/lavender ambiguity is silently promoted
to unequivocal primary color. This is ROOT's bounded AI assessment informed by
independent blind descriptions, not human ground truth. ROOT had already seen
the old natural-form originals; ROOT self-review is not independent blindness.

Tag-form images visibly change hair length and pose, including a rear-view
seed124-swapped pair. The new seed123-swapped image has a conspicuous bright
vertical light band near x512, as well as colored strokes near hands/wrists.
This artifact is retained; its unique cause is not established. Faint unfinished
anatomy and simplified hands persist. Do not present the lexical change as a
general quality improvement, an algorithm repair or an accepted prompt rewrite.
Human acceptance and the earlier complete ordinary gate remain open.

During this checkpoint the user explicitly chose to keep **official Illustrious
v0.1** as the target for subsequent visual acceptance. No substitute checkpoint
is selected or downloaded. Further work must respect that choice and declare
its next scene/sampling question separately; no extra candidate follows this
four-request attempt.

Actual full `pnpm run typecheck`, explicit `.mts` typing, separate scoped ESLint,
Prettier and diff checks pass. Source review confirms that the exact candidate
is not author-endorsed and that all earlier profile constants/overloads/shared
helpers are preserved. No fresh Main unit-suite or native semantic mutation is
claimed for this input-only control.

All originals, source/input descriptors, four Main packages/targets/handoffs,
blind observations and dependencies are retained. Fresh process identity,
unit/shared-interpreter and incoming-dependency gates precede retention.
All 11 exact owned payload entries are archived and byte-verified before
disposal: **344,064 allocated bytes removed** in the deletion-only interval.
This is ROOT lifecycle evidence, separate from an independent retained-data
review. Historical evidence, privacy backups and shared inputs remain
protected. Current permissions, frozen-work independence and Regional
provenance/Compare/preset exclusions stay intact. No UI, durable-queue, Anima,
capacity or release qualification follows. PP-001/007/008 stay **«Пока не обещать»**.
