# Anima festival stall subject placement

The [scarf comparison](./phase-4-anima-equal-scarf-weight-research.md) found
both colors at the larger blue weight and still missed the joint subject and
scene criterion. This experiment fixes a new two-seed scene. The two subjects
have distinct silhouettes, so their spatial assignment can be judged from
their actual shapes on a shared display shelf.

## Fixed experiment

Studio base `011e250df59f1cb054d64f5350be166ed3f9a91c`. Read the clean
InvokeAI checkout at `4875d96531ca6712b288f6e660fcbb34143408c1`.
`invokeai/frontend/webv2/src/features/generation/core/canvas/compileCanvasGraph.ts`
invokes `addRegionalGuidance.ts::addRegionalGuidance` with each region and its
own mask. The positive collector receives the resulting conditionings.
`invokeai/app/invocations/text_encoder/anima_text_encoder.py::_encode_prompt`
uses the original text for ordinary neutral weighting and supplies the model's
T5 weights for authored emphasis. These regional texts are plain text.
`invokeai/app/invocations/anima/anima_denoise.py` computes and loads the
image token grid and uses separate positive and negative masks.
`invokeai/backend/anima/regional_prompting.py` gives global positive text the
mask complement and leaves global negative text image-wide. The caller patches
alternating transformer blocks through `anima_transformer_patch.py`.

Use the same installed signed worker and Cyberfalafel Anima, Qwen3, and Wan
VAE resource bodies as the earlier comparison. Each request uses TXT,
512×512 with Canvas origin (−13, 5), Euler 20, CFG 4, Auto VAE and the same
transparent target. Run seed 123 ordinary, assigned and swapped, then the
same triplet at 124. Both ordinary Projects author an empty Regional Guidance
list. Both regional cases at each seed retain the same two region and mask
identities and reverse only the two local texts.

- Global positive `anime illustration of a Japanese festival stall, one continuous wooden display shelf across the lower foreground, open display space, visible backdrop, medium wide shot`
- Global negative `(blur)0.75, noise`
- First local subject `a red paper lantern with curved ribs and a small tassel`
- Second local subject `a white fox festival mask with pointed ears and red markings`

The two opaque Alpha8 regions occupy `[32, 224) × [64, 352)` and
`[288, 480) × [64, 352)` in processing coordinates. The existing 32×32
nearest-neighbor attention grid gives 216 active cells per region, zero
overlap and 592 exclusive global positive cells on even blocks. The runner
checks the complete projected alpha body, the literal neutral compiled spans,
and equal normalized base requests within each seed. Save/reopen and capture
use the actual Project and Main fixtures.

The preregistered ordinary gate calls for a readable stall with one
continuous wooden display shelf. The regional gate requires a separate
recognizable lantern and fox mask on their assigned sides, both visibly
reversed by the swap, with no intrusive duplicate, subject collapse, seam,
or broken shelf. The figures are identified by silhouette and details.
Score the full shuffled original images before revealing the mapping.
Ambiguity is inconclusive. Both seeds and all four regional images are
required. There are six allowed jobs and no after-view tuning. The exact
contract SHA-256 is
`1ce8da7b232d90ba39a21ccf2e4bc766dcc555be1c8f2836bf9ab56dad1c3fb8`.

## Native execution

All six requests completed 20 steps each on the existing signed CUDA worker.
The unit closed normally in 332.634 seconds, with a 12 GiB aggregate group
memory peak, zero swap and zero OOM events. The maximum sampled worker VRAM
was 7,026 MiB on the RTX 4080. The native fence verified 77 installed engine
files, 17 signed configuration files and the pinned model bodies. Each seed
has one genuine ordinary no-region request and two stable mask assignments.

Execution-owner readback rechecked the neutral compiled texts, normalized
requests, projected Alpha8 bodies, six distinct decoded PNGs and all 120
progress events. Each Project reopened after Save. The readback matched six
closed SQLite copies with 30 migrations each and six saved Projects with
38 members altogether. Each inference worker and the controller had exited.
An independent readback verified the same closed SQLite and Project copies,
the fixed six base requests and literal mask assignments, the six distinct
decoded outputs and the seven physical exits. It inspected the retained
evidence without running inference again.

## Blind visual result

Both readers described all six shuffled full PNGs before the mapping was
revealed. They agreed on the two subjects, their sides, whether they read as
separate objects, and the recognizable stall. Neither reader saw a sharp mask
boundary. The small hanging light in the seed 123 ordinary image is ambiguous
and has no bearing on the ordinary scene gate.

| Seed | Ordinary                                          | Lantern left, mask right                                                                 | Mask left, lantern right                                                                                         |
| ---- | ------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 123  | Coherent stall with a continuous counter.         | Two red paper lanterns and no fox mask. The stall survives.                              | The separate mask and lantern occupy the requested sides on a wood block. The stall and backdrop disappear.      |
| 124  | Coherent frontal stall with a continuous counter. | The fox face is attached to the giant lantern. A wooden stall remains visible behind it. | Separate mask and lantern on the expected sides. A recognizable close stall and continuous front counter remain. |

Both ordinary scene controls, two of four regional placements and one of
four joint regional cases passed. The complete gate remains **NOT_QUALIFIED**.
Both swaps place the two intended identities on the requested sides. The
reverse assignment misses the intended pair at both seeds. Human visual
acceptance remains open.

## Checks and retained evidence

All 238 focused tests, typecheck, scoped ESLint and the shared application
build passed. The first bounded check launcher lacked the pnpm binary on
PATH and did not reach the checks. Its logs remain beside the successful
unit's receipts. The older scarf profiles keep their original fixed
prompts, masks, requests and match assertions. The change adds a third
qualification profile and the matching saved-Project fixture branch.

The six originals, paired comparison, blind reports and their reveal,
preregistration, receipts and verified saved Project copies are in
`runs/anima-festival-stall/20261121-r1` under the artifact root. The
compressed archive retains 63 verified entries. Cleanup reclaimed
72,261,632 allocated bytes across five exact idle paths. All 95 sealed
evidence files, including the independent audit, verified after disposal.
Replay uses
[`qualify-installed-anima-background-visual.mts`](../../scripts/qualify-installed-anima-background-visual.mts)
with the exact contract and a new owned run directory. The unit limit is
12 GiB, zero swap and 600 seconds. The eight promise statuses remain
**«Пока не обещать»**.
