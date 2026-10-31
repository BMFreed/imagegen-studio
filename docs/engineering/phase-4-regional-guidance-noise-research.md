# Fixed noise-draw and initialization comparison

## Question and scope

Base: clean `4f1088aa90d7547d6e5a46b2b93f987303769b94`.
The [Invoke operator comparison](./phase-4-regional-guidance-invoke-parity-research.md)
found exact predictions/PT/RGB on a common start. It also measured two ordinary
path differences: source-default FP32 random draws followed by FP16 conversion,
and legacy `add_noise` initialization instead of native `init_noise_sigma`.
Their effect on the fixed scene is unknown. This experiment changes those two
factors separately, without replacing attention or choosing a product default.

This is a private test-only intervention in initial latent preparation. Original
Main recipes, model loading, conditioning, regional attention, native Euler/VAE
loop and provisional PNG publication remain their existing owners. No production
code, worker protocol, queue, persistence, renderer or public admission changes.
Runtime/IO and retained-data safety require bounded execution and lifecycle
checks; no additional model/environment or Invoke application is installed.

## Frozen experiment

Use unchanged historical genuine Main **swapped** recipes for seeds 123 and 124:
blue ceramic mug in the left region, red apple in the right region. Keep the
existing full global prompt, two opaque half masks, both global coverages
Everywhere, global pooled sources, empty negatives and negative-first CFG.
All exact-resource descriptors remain empty; no TI load or table resize.

Fixed model is official Illustrious XL v0.1 epsilon, SHA-256
`3e15ba00387db678ab4a099f75771c4f5ac67fda9e7100a01d263eaf30145aa9`,
6,938,040,760 bytes. Use 1024×1024, world origin (-13,5), thirty Euler steps,
CFG 5, zero rescale, Main schema-1 scaled-linear/false-ZTSNR/leading policy,
CUDA FP16 and the embedded manual-FP16 VAE. Reuse the qualified Torch 2.7.1 /
Diffusers 0.40.0 / Transformers 5.5.4 / Compel 2.4.0 runtime.

| Noise draw | Initialization | Both seeds |
| --- | --- | --- |
| CPU FP16 | Native `init_noise_sigma` | Reuse pinned historical controls |
| CPU FP32 → CPU FP16 | Native `init_noise_sigma` | Fresh |
| CPU FP16 | Original Invoke legacy `add_noise` | Fresh |
| CPU FP32 → CPU FP16 | Original Invoke legacy `add_noise` | Fresh |

Eight matrix cells require **six fresh trained calls maximum**. Seed 123 reuses
the original visual `matrix123-r1-seed123-swapped` record and retained PNG;
seed 124 reuses the latest exact parity `trained-pair-r1-ours` record and PNG.
Both existing 62-entry source maps match this base, share the same framework
source hashes and complete Main JSON, and record successful preservation.
Current runtime/configuration pins must agree before fresh consumption. Reuse
is historical evidence, not a fresh replay. Seed 123 has no retained raw PT
snapshot; its recorded PT hash and actual RGB can be compared, not PT RMS.

No seed search, prompt revision, step sweep, new checkpoint or additional full
trained mutation/recovery request belongs to this attempt.

## Intervention and independent checks

Temporarily wrap the exact native class `prepare_latents`, admitting only the
fresh execution wrapper with no supplied latents. First call the original native
method unchanged in every cell. This obtains a native FP16 candidate and advances
the real private CPU generator identically. The ordinary cell returns that
original candidate unchanged.

Execute the original pinned Invoke noise definitions with a local configuration
adapter selecting FP16 or source-default FP32 draw precision; compute dtype
remains FP16. Original source returns CPU FP16, then the test transfers to CUDA.
For FP32/native initialization, call original `prepare_latents` again with
explicit raw latents: it scales without another random draw. For source
initialization, execute the original legacy `add_noise` assignment with zero
CUDA latents, raw CUDA noise and the actual first timestep. Return it directly;
never divide a scaled FP16 latent to reconstruct raw noise.

The independent oracle uses a separately seeded CPU draw/cast. Native scaling
uses its existing FP32 scalar; source initialization casts sigma to a CUDA FP16
vector before multiplication and adds zeros. Check scheduler indices remain
unadvanced and actual generator state equals one native FP16 draw. Selected
batch-one latent must equal the first Euler sample; its negative-first CFG
duplication must equal the first batch-two native scale-input. Retain original
beta/grid, all-step conditioning/pool/permission checks, all seventy original
attention sites, Euler transitions, VAE and reopened PNG quantization checks.
Restore the class method slot before streaming preservation exits.

Model-free small cases must discriminate draw and initialization branches,
including neighboring controls, invalid inputs and initializer-error restoration
with a fresh successful small call. Isolated branch mutations challenge these
oracles without further trained calls. No denoising loop is copied.

## Visual interpretation and stop condition

Inspect all eight unchanged PNGs in anonymous randomized order before revealing
conditions. Record actual object counts, recognizable apple/mug, red/blue
attributes and left/right centers separately from duplication/fusion, floating
or truncated objects, malformed vessels and scene coherence.

Correct swapped placement and coherent geometry are separate observations;
ambiguous subjects are inconclusive. Swapped-only improvement would identify a
candidate for the later matched assignment/swapped gate. It cannot establish
that full gate, human acceptance, general visual quality or a product default.

If no condition succeeds, close these two noise/initialization hypotheses for
this fixed attempt and calibrate ordinary generation before another regional
mechanism change. Keep every failure; do not tune prompts or seeds afterward.

## Executed result

ROOT qualified **33 distinct pytest selections: 26 small cases, six fresh
trained requests and one zero-model aggregate**, with 40 warnings and zero
normal failures/errors/skips. Ruff lint/format and strict basedpyright pass.
One list annotation fixes the initial typing diagnostic; annotation-erased AST
equality is retained. No production file changed.

The four named sensitivity selectors were already GREEN within the small suite.
Two isolated-process namespace mutations then produced one semantic RED and one
unaffected GREEN each; restoring both helpers gave four GREEN. These are **eight
additional executions: six GREEN / two intentional RED**, without trained models,
source-file changes or a mutable checkout copy. They detect wrong draw precision
and wrong initialization at their independent numeric assertions.

Exactly six trained calls completed. The matrix's two ordinary FP16/native cells
remain explicitly historical. At every fresh preparation, the original native
candidate first matches that seed's reused first Euler sample and CFG batch-two
scale-input hashes. Current source/framework/config pins match both historical
controls. The selected initial tensor then matches the independent factor oracle
and actual consumption. Private generators advance identically, source scheduler
indices remain unadvanced through preparation, and the original class slot
restores. Existing streaming borrowed-state/RNG/reservation checks pass.

All **180 UNet / 180 Euler transitions, six VAE decodes and 12,600 original
cross-attention processor/SDPA observations** reconcile. Each request retains one
conditioning preparation, three prompt pairs, nine consumed CLIP forwards and
zero TI loads/resizes. Literal conditioning/pools/masks and scheduling stay fixed.
Independent postprocessing reopens all eight PNGs and verifies their hashes/ICC;
all six fresh PT snapshots quantize exactly to their own RGB pixels. There is no
new raw-PT RMS measurement for the historical seed-123 control.

Every one-factor contrast changes predictions from step one through step thirty
and reaches RGB. Draw contrasts change 3,112,433–3,120,715 channel bytes, with
RGB RMS 50.395–62.415; initialization contrasts change 2,909,884–2,999,369,
with RMS 7.009–20.934. These are influence measurements, not quality scores.
Changing draw precision selects a different pseudorandom realization for the
same seed; it is not merely rounding the same sampled tensor.

A closing read of the clean current Invoke checkout at `a61ac4fb…` confirms
byte equality for all five relevant source files and the executed reference.
Invoke's `choose_noise_dtype` explains FP32 as a seeded-portability choice
across Torch versions, not a visual-quality guarantee. This experiment covers
only Torch 2.7.1; cross-version portability is not independently qualified.
The legacy initialization itself carries an Invoke TODO questioning the omitted
`init_noise_sigma` path. Its current behavior is a reference to measure, not an
automatic prescription for our execution policy.

## Visible outcome

ROOT opened all eight full images. An independent observer with no parent
history saw only randomized anonymous originals and described their visible
objects before the key was revealed. These are agent observations, not human
acceptance or general visual qualification.

| Cell | Seed 123 | Seed 124 |
| --- | --- | --- |
| FP16 / native, reused | Repeated mugs, cropped left apple and malformed tools. | Floating truncated apple left; mug right. |
| FP16 / source initialization | Repeated/cropped/malformed vessels and left apple persist. | Floating truncated apple left and right mug persist. |
| FP32 / native | One blue mug left and red apple right, both supported; ambiguous foreground geometry and an extra blade-like form. | Blue mug left, central apple and extra white mug right; grounded foreground, convoluted background. |
| FP32 / source initialization | One blue/white mug left and red apple right, supported; foreground/table recess remains ambiguous. | Two mugs with central apple persist; geometry details change. |

FP32 draw therefore gives a bounded partial improvement: seed 123 has the
desired two principal subjects/sides, and seed 124 loses the unsupported apple.
It does not remove seed 124's extra mug. Source initialization alone supplies no
consistent placement/count repair. Full fixed swapped placement/count/coherence
remains **NOT_QUALIFIED: 0 PASS / 6 FAIL / 2 INCONCLUSIVE**, including the two
historical cells. The two inconclusive results have correct principal placement
but ambiguous foreground geometry. Swapped-only observations cannot qualify
assignment-to-swapped reversal regardless of their score.

No condition supplies a complete two-seed repair. Keep FP32 draw as a candidate
for ordinary-generation calibration; do not declare FP16 mathematically broken,
select a default, or add another regional attention mechanism from these samples.
Ordinary generation without regions is the next calibration boundary before
further regional mechanism changes. The two existing genuine region-disabled
Main handoffs permit a finite next comparison of two FP32/native ordinary
requests against these swapped outputs. That comparison is not executed here.
No extra ML request was added to this attempt. FP32 must not silently replace
the existing execution policy: it changes fixed-seed results.

## Evidence, bounds and delivery

Evidence owner: `runs/regional-guidance-noise/20261031-factorial/`.
Its frozen `noise-contract.json` pins all inputs, historical baselines, source
reference and six-call ceiling before execution. Selected source definitions
come from Invoke `a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd` in the preceding
verified reference snapshot. They execute on the common runtime, not an installed
Invoke application. Historical Main packages, configs, exact checkpoint, loading
journal, source snapshots and runtime remain explicit protected dependencies.

Run serially, small units within 3 GiB and trained within 12 GiB aggregate host,
zero unit swap, 600-second trained deadline and CUDA allocator fraction 0.75.
The new compact target is 160 MiB; required historical evidence remains pinned
for the open visual diagnosis. Record actual peaks, native-call counts and
diagnostic failures separately. Archive needed output/source bytes before
confirmed-idle disposable payload cleanup. Commit/push follow verification.

The trained unit completes in 405.302 seconds, within its declared envelope.
Host cgroup peak is 7,891,034,112 bytes, including about 6.97 GB file cache in
the peak sample; swap is zero. Maximum CUDA allocated/reserved bytes are
9,625,976,320 / 12,238,979,072. These are bounded-unit observations, not full
application capacity or anonymous-memory guarantees. The earlier source-hash
unit reaches its 3 GiB cgroup ceiling through file cache and exits successfully;
no ceiling is raised and no OOM/native failure is accepted.

All 34 temporary payload entries survive a verified 31,562,304-byte archive:
24 regular files, ten directories, no links/special nodes; 44,625,757 content
bytes. Fresh exact inventory, all eight physical unit exits, namespace/source
restoration and incoming-dependency checks precede disposal of only this run's
payload directory. Preexisting inaccessible desktop-service handles are an
explicit physical-gate limitation. The deletion-only reduction is
**44,707,840 allocated bytes**. All eight display and anonymous PNG originals,
contracts, reports, source archives and protected external inputs remain.
The final source set has 1,401 files, four deltas/two additions; the test stays
qualification-exact while only three documents finalize. This run remains below
its 160 MiB compact target; required historical proof stays pinned separately.

Independent source review is CLEAN within its frozen source-only scope. It does
not rerun ROOT execution. Independent archive/source-byte audit is also CLEAN:
all retained metadata/content and source pins verify. Its completed readback
also independently confirms eight PNGs, six PT-to-RGB associations and eight RGB
contrasts. Its later counter checker fails because it compares raw batch-two
UNet output with the separate guided batch-one epsilon array. ROOT identifies
that checker error and replays only corrected retained-trace reconciliation:
guided predictions compare to scheduler-input predictions, with all 180
associations and 12,600 sites consistent. No harness assertion, source byte or
ML request changes. The failed checker and corrected result remain retained;
counter reconciliation is ROOT evidence, not a completed independent runtime
qualification. Final source/document mapping
and process release are separately ROOT-checked. Public enabled-region NEW refusal, frozen
Retry independence, Smart
target-only permissions, Regional provenance/Compare/preset exclusions and
PP-001/007/008 **«Пока не обещать»** remain unchanged. This establishes no Main
candidate durability, Add/Save, Anima regional capability or generic SDXL family.
