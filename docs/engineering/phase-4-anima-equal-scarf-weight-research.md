# Anima blue scarf weight with fixed background support

The [previous scene comparison](./phase-4-anima-global-background-visual-research.md)
found a bench in both inset cases. The assigned result had two red
scarves, and the swapped result had a single red-scarf cat. The red phrase
had weight 1.5 while blue had weight 0.75. This comparison raises the
blue phrase to 1.5 in both assignments to test whether the scene and
placement can pass together at seed 123.

## Fixed comparison

Studio base `578eb3fc80a2de1c93302880a8f0dc8d5c69054c`. Re-read the clean
InvokeAI checkout at `4875d96531ca6712b288f6e660fcbb34143408c1`.
`invokeai/frontend/webv2/src/features/generation/core/canvas/addRegionalGuidance.ts`
passes each positive text to a separate conditioning with its owning
mask. The Canvas graph caller in `core/canvas/compileCanvasGraph.ts`
connects the conditioning collection to Anima. The prompt parser in
`invokeai/backend/anima/prompt_weighting.py` provides the numeric ranges
used by `invokeai/app/invocations/text_encoder/anima_text_encoder.py::_encode_prompt`.
The encoder passes the cleaned text to Qwen and resolves the weighted
spans on the T5 side. `invokeai/app/invocations/anima/anima_denoise.py`
passes those weights to the adapter. The positive mask complement
comes from `invokeai/backend/anima/regional_prompting.py`.

Both 512×512 TXT requests use the same seed, Euler 20, CFG 4, Auto VAE,
global and negative texts, signed worker and exact local model bodies
as their matched historical requests. The same Alpha8 masks cover
processing rows `[64, 352)` and allocate 448 of 1,024 sampled cells to
exclusive global positive support. Raw and compiled blue conditioning
change only from `(blue scarf)0.75, one white cat` to
`(blue scarf)1.5, one white cat` and from T5 span weight 0.75 to 1.5 on
`[0, 10)`. The cleaned phrase is byte-identical.

The runner checks the exact historical input receipts before dispatch.
The comparison uses the same stable wire envelope, sampling settings,
target bytes, mask ownership and support, and red and negative text.
Per-run IDs and staging paths are removed for that comparison. The
ordinary image with an authored empty Regional Guidance list remains
the held scene control. Both historical inset PNGs and both new PNGs
are shuffled before review. Both new assignments must show two distinct
white cats on the same coherent bench, each wearing the expected neck
scarf, without a disruptive seam or visible anatomical collapse.

## Results

The two signed native jobs completed all 20 steps each. The unit exited
normally after about 119 seconds. Both Projects saved and reopened, and
their capture left the saved Project and history intact. The group reached
its 12 GiB memory limit with zero swap and zero OOM events. The maximum
sampled worker VRAM was 5,832 MiB on the RTX 4080.

Two readers agreed on the visible bench, scarf colors, orange coat and
uncertain anatomy of the miniature figure. Both read the shuffled
images before the key. One reader had seen the historical images in the
previous experiment and may have recognized them.

| Region assignment | Historical blue weight 0.75                                           | Blue weight 1.5                                                                        |
| ----------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Red left          | Two white cats with red scarves. The right pose intersects the bench. | Red and blue are on the expected necks. Both sit on one bench. The left cat is orange. |
| Blue left         | One centered white cat with a red scarf.                              | A white cat left of center wears blue. A miniature right figure has red near its ears. |

The blue scarf is visible in both new images and the bench survives.
There is no conspicuous horizontal seam in any of the four images.
The assigned case fails the two-white-cats criterion. The swapped case
has one fully readable white cat, with the second figure's anatomy and
neck scarf unclear. Joint scene and placement utility remains
**NOT_QUALIFIED** for this seed. This comparison used a test configuration.

## Checks and retention

The independent audit rehashed seven Studio and eight Invoke source
files, 77 installed worker files, 17 signed configuration files and all
5,628,217,094 borrowed model bytes. It confirmed physical exit of the
controller and both workers, checked 40 progress events, reconstructed
the mask support and compared the input receipts against the two
historical controls. It checked both saved Project and 30-migration
SQLite copies against their closed originals.

All 238 focused input, preparation, batch and wire tests passed.
Typecheck, the application build and scoped ESLint passed.

The original output PNGs, fixed requests and blind reads are in
`runs/anima-equal-scarf-weight/20261121-r1` under the artifact root.
All 23 archive entries and 57 sealed evidence files verified.
Cleanup reclaimed 29,089,792 allocated bytes across five idle paths.
Replay uses
[`qualify-installed-anima-background-visual.mts`](../../scripts/qualify-installed-anima-background-visual.mts)
with a new owned run directory, the two-case experiment contract and
the pinned previous comparison. The qualification budget is 12 GiB
with zero swap and a 600-second ceiling.
