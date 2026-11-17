# Anima IMG regional negative placement

Application base `fb9752f00a09681d85d4719b5759b2709efbbbf0`. The prior
[signed negative qualification](./phase-4-anima-regional-negative-research.md)
changed the negative text on one fixed owner and detected visible RGB changes.
The [positive scarf study](./phase-4-regional-guidance-anima-visual-research.md)
observed the requested exchange on one of two seeds. This experiment holds the
negative text fixed and changes its region. The question is whether red on the
scarf visibly recedes on the assigned side while the other cat retains its red
scarf.

## Source basis and execution seam

Re-read clean InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1`.
`frontend/webv2/src/features/generation/core/graph.ts::buildAnimaGraph` is
consumed by `core/canvas/compileCanvasGraph.ts`, which grafts opaque IMG and
calls `addRegionalGuidance`. `core/canvas/addRegionalGuidance.ts` connects each
regional negative and its alpha mask to the negative conditioning collector.
`app/invocations/text_encoder/anima_text_encoder.py::_encode_prompt` parses raw
attention syntax and makes Qwen/T5 conditioning. `app/invocations/anima/anima_denoise.py`
loads each polarity separately when CFG is active and keeps the global negative
image-wide. `backend/anima/regional_prompting.py::_prepare_cross_attn_mask`
applies regional permissions to the owned columns. The caller uses
`backend/anima/anima_transformer_patch.py::patch_anima_for_regional_prompting`
to mask even blocks. Odd blocks retain unmasked attention. The study's visual
gate allows spill to the peer and measures relative attenuation.

`backend/anima/scheduler_driver.py` doubles Heun's logical begin index for the
clipped IMG window. Twenty nominal steps yield 39 full evaluations, and the
strength-0.5 window starts at index 20. The expected progress total is 19.
The existing Studio authoring, prompt compiler, Main preparation and signed
regional worker transport own these behaviors. The diagnostic drives a private
Main fixture through actual Raster import, Project Save/reopen and captured
pixel composition. It invokes the exact installed worker from the
[packaged trained checkpoint](./phase-5-packaged-trained-generation-research.md).
The direct calls exercise native sampling without publishing queue candidates.

## Fixed inputs and assessment

The opaque 512×512 source duplicates the same red-scarf cat crop from the
retained seed-123 positive placement output. Its two halves are pixel-identical.
Two independent nonoverlapping masks cover the two half-canvases. Both enabled
regional positives are `one white cat wearing a scarf`. The global positive is
`two white cats wearing scarves, illustration, plain light background`, and the
global negative is `(blur)0.75, noise`. The baseline explicitly sets both local
negatives to empty. A and B put `(red scarf)1.5` on opposite owners. The
compiled literal is `red scarf` with weight 1.5 over `[0,9)`.

All three jobs use seed 123, Heun20, strength 0.5, CFG 4 and embedded Auto VAE,
without LoRA, TI or adapters. The exact Cyberfalafel anima v1.0 checkpoint is
SHA-256 `0fc7507b222e52ac8cc5e2826786bc4caed05223df32d17aeb05a76cb4de9941`.
The pinned Qwen3 and Wan VAE files are reused in place. The source and two
translated 2,845-pixel scarf cores are fixed before inference. The capped 600 s
service uses one inherited 12 GiB cgroup with zero allowed swap.

The baseline must visibly retain both separate cats and red neck scarves, with
at least 25% red in each scarf core. The red fraction counts pixels where
`R − max(G,B) ≥ 30`. Each assigned side must lose at least 15 percentage points
relative to both its own baseline and its image under the opposite assignment.
In each treatment, the selected side's loss must exceed the peer's by at least
10 points, with peer red fraction at least 25%. Fixed per-side comparisons
control for asymmetric noise on the shared seed. A blind visual assessment also
requires coherent cats, visibly selective attenuation and a visibly red peer
scarf. It records any scarf removal, color shift, seam or structural damage.
The main spatial contrast is the A/B swap with identical signed bank cardinality.
The control separately establishes that both red scarves survive IMG.

## Native result

The frozen contract SHA-256 is
`0b2b5f2bba7059deff7ea9579bbb71692f3de67eb75dd900524b49c892278f71`.
All three saved/reopened Projects use the same opaque target, with SHA-256
`fb0ffe81ee822ac0260fbf1e26cba96282ab9c54a52448a968d4b51674ecd878`.
Each case completed 19 progress events and the actual worker physically exited.
The independent literal prompt assertions verified the `red scarf` span and its
region ID for both treatments. The prior trained model receipt pins the source
hashes. The request owner re-verifies the model files before dispatch, and the
runner matches their identity, size and timestamps after completion. All 77
installed-file pins and 17 signed configuration pins match before and after.

The Linux service ran for 146.357 s. Its memory peak reached the 12 GiB cgroup
limit, including file cache, with zero allowed swap and zero OOM events.
Highest interval-sampled CUDA readings on the RTX 4080 were 6,556 MiB for the
baseline and 6,558 MiB for each treatment. This measures the chosen workload
on one host. The memory-limit observation leaves headroom undetermined.

## Visual result · NOT_QUALIFIED

An independent observer inspected only the three randomly numbered originals.
Root examined the same anonymous PNGs before reading the condition key. Every
image retains two coherent cats and a visibly red scarf on each side. Shading
and facial marks vary slightly. Neither assignment produces visible selective
red attenuation. The baseline passed and both treatment criteria failed.

| Case           | Red fraction in left scarf core | Red fraction in right scarf core |
| -------------- | ------------------------------: | -------------------------------: |
| Baseline       |                         100.00% |                           99.82% |
| Left negative  |                         100.00% |                           99.89% |
| Right negative |                          99.96% |                           99.82% |

The treated core retains exactly the baseline red-pixel count for both
assignments. The A/B contrast on either side is smaller than 0.08 percentage
points in absolute value against the 15-point criterion. The unchanged result
on that criterion coexists with distinct output pixels and correct signed
transport. It establishes an unsuccessful spatial utility case for this
source and strength. Other subjects, settings, human acceptance and capacity
remain open. All eight promises stay **«Пока не обещать»**.

The [original current Invoke denoiser comparison](./phase-4-anima-negative-invoke-control-research.md)
reproduces the same failed visual criterion on the shared normalized source
latent. CPU checks confirm exact negative permissions for both assignments.

## Verification

Eight focused files pass 342 tests with zero failures or skips. Typecheck,
production build and scoped lint/formatting/whitespace checks pass. The build
reports the renderer chunk-size warning. The Illustrious runner still refuses
an invalid run root as a CLI and can be imported without dispatching a job.

A separate read-only audit reconstructed the source and scarf cores and
checked all 27 Project members, exact opaque targets/outputs with sRGB ICC,
literal signed records and masks, and the float32 Heun sigma/timestep window
against an independent calculation. The closed private SQLite has 25 tables
and 30 migrations, with integrity and foreign keys intact and all work tables
empty. The reviewer rehashed the 77 runtime pins, 17 configuration pins and
three executed sources, and rechecked the model file identities against the
earlier receipts. The audit used retained inputs and receipts. It did not
replay the worker or retain the lower temporary wire and GPU time series.

Retained evidence is under `runs/anima-negative-visual/20261118-r1` in the
artifact root. It includes the original opaque source, its fixed scarf cores,
compiled prompt and mask handoffs, three saved `.igs` packages, targets and
output PNGs, and the separate blind observations and case key. The owned raw
payloads were compacted after physical exit and dependency checks. Archive
`retained-payloads.tar.gz` has 23 verified members and SHA-256
`92d286e491463303ef7c9e8ca6459561432bab3e593449d1b5a56b08c749f01d`.
Removal of the four owned directories reclaimed about 11.5 MiB after
retention. The retained evidence remains available for image and byte review.
