# Invoke regional source comparison

## Question and reference boundary

ImageGen base: clean `a88a58321ce5a9261024d50369d3056fb6388c07`.
Reference: clean local Invoke `a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd`,
including the active webv2 graph producer and SDXL backend. This comparison
follows the [global text experiment](./phase-4-regional-guidance-composition-research.md).
It checks an existing reference implementation before proposing another
composition mechanism or selecting public defaults.

Invoke's graph collects global conditioning first, then independently encoded
masked regional prompts. It does not automatically prepend global text to each
regional prompt. Both implementations concatenate a token bank and restrict
spatial access at cross-attention. Source similarity is not runtime equivalence
or evidence that Invoke produces a qualified apple/mug scene.

## Source-backed mapping

| Boundary | Invoke source behavior | ImageGen comparison |
| --- | --- | --- |
| Text graph | Global prompt/style collected first; nonempty regional text encoded independently. | Same basic bank design; texts remain separate. |
| Empty regional prompt | Empty positive/negative nodes are omitted. | Private present-empty positives and effective empty negatives retain 77-row zero streams. |
| Mask eligibility | Normal Canvas producer includes enabled mask-bearing layers. | The previous empty-mask carrier was an explicit research construction, not an ordinary Invoke graph. |
| Pool | First available pool, replaced by each unmasked conditioning: last unmasked wins. | Explicit signed source IDs; with a single unmasked global input, select that same global pool. |
| CLIP/Compel | Penultimate non-normalized states, sentence splitting, no truncation, zero-on-empty and zero alignment padding. | Same stated options; numerical agreement must be executed. |
| Canvas alpha | `AlphaMaskToTensorInvocation.invoke` first binarizes PNG alpha with `> 0`. | Our named private profile preserves bytes then applies `>=128`; alpha 1/127 differ. |
| Lower mask preparation | Float threshold `>0.5`, nearest resize, repeated 2×2 ceil/max pooling. | Compare the full Canvas alpha stage, not normalized floats alone; opaque 0/255 masks are a common-input lane. |
| Attention mask | Additive finite `0/-10000`, combined with prior padding bias. | Boolean hard permissions and all-masked refusal; deliberate safety/numerical differences remain explicit. |
| Initial noise | Config defaults to FP32 draws before compute-dtype conversion. | Current private CUDA native path draws CPU FP16 noise. Same seed does not imply equal noise. |
| Legacy initialization | `scheduler.add_noise(zero_latents, noise, first_timestep)`. | Native Diffusers `init_noise_sigma` initialization; compare actual initial latent separately. |
| Scheduler | Invocation derives scheduler from stored configuration. | Strict detached Main-resolved versioned beta/spacing policy; normalize before attributing output differences. |

Source owners are retained under their exact paths and full hashes:
`app/invocations/sd/denoise_latents.py`, `app/invocations/mask.py`,
`app/invocations/text_encoder/compel.py`, `app/invocations/latent_noise.py`,
`backend/stable_diffusion/diffusion/{conditioning_data,regional_prompt_data,custom_atttention}.py`,
`backend/stable_diffusion/diffusers_pipeline.py`, and active webv2 generation
graph/Canvas producers. Paths here are relative to `invokeai/` in the pinned
Invoke source tree. The source license and project dependency declaration are
retained with the snapshot. The executed snapshot contains twenty-one files;
the Compel graph source is retained separately as supplementary context, with
its own manifest. No third-party algorithm is transplanted into production code.

`autoNegative` is a separate optional inverted-mask branch and defaults false.
It remains off and excluded by our product contract. Wrong-grid and all-masked
refusals are not removed merely to match reference behavior. No source finding
alone justifies silently changing the existing named threshold, empty-stream
semantics, noise policy or public admission.

## Executable comparison design

Use the existing qualified ImageGen runtime: Torch 2.7.1, Diffusers 0.40.0,
Transformers 5.5.4 and Compel 2.4.0. The pinned Invoke checkout declares different
application dependencies, including Diffusers 0.41.0. Execute original selected
AST definitions with unchanged bodies in owned test namespaces, verified by full
file and definition hashes. This qualifies **Invoke operator source on a common
runtime**, not an installed Invoke application or its complete runtime.

Only IO/configuration adapters surround the original algorithms. Original
dataclasses, concat, mask conversion, pooling and attention execute unchanged;
the actual no-IP-Adapter helper is retained. Namespace slots and native state
restore on exit. Masks supplied to Invoke normalization are owned copies because
its float conversion may write in place.

First compare CPU FP32 and CUDA FP16 numerical boundaries: global-only and two
regions, overlap, unequal lengths/padding, odd rectangular grids, explicit zero
and absent masks, alpha 0/1/127/128/255, and pool order. Check values at native
projections/SDPA/output after checking assembly and permissions. Distinguish
common-input agreement from deliberate policy differences. A spatial-omission
mutation in an isolated ImageGen checkout must turn the reference comparison RED
while a global-only control remains GREEN, then restore both.

A separate zero-model diagnostic executes original Invoke noise functions and
the original legacy initial `add_noise` assignment. It uses fixed seeds 123/124,
20/30-step common leading schedulers and identical raw noise for the isolated
scaling comparison. This separates random draws from initialization policy.

After lower checks, execute one trained matched pair, two native calls maximum:
the existing private output and the original Invoke conditioning/mask/processor
operators on the common native Diffusers loop. Reuse the genuine historical Main
`seed124-swapped` recipe, two opaque halves, no carrier, exact official
Illustrious v0.1 epsilon weights, global pool, 1024², thirty Euler steps and CFG 5.
Keep model components, contexts, pools, time IDs, scheduler and actual initial
latent matched. The common loop retains our existing noise policy in both lanes;
Invoke's different ordinary defaults remain separately measured.

Reference processors have a separate test-only try/finally owner; they do not
pass as an admitted production processor. Original production reservations,
encoding, value guards, native Euler/VAE and PNG publication remain in use.
Source graph negative padding is carried explicitly at the processor boundary.
Record all seventy cross-attention consumers per step, native transitions,
preservation and independently reopened PNGs. Record prediction/PT/RGB differences
without automatically claiming visual success or full Invoke-app equivalence.

## Executed result

ROOT completed **33 distinct pytest cases: 30 operator cases and 3 trained-pair
selections**, with 20 warnings and no failures, errors or skips. The trained
aggregate consumes records only; there were exactly **two trained native calls**.
Scoped Ruff lint/format and strict basedpyright pass for all three new Python
files. No production implementation, Main, protocol or UI files changed.

All **38 measured small attention-output comparisons are exact**, on CPU FP32
and CUDA FP16. The spatial-omission mutation uses an isolated source checkout:
4 GREEN → 2 semantic RED + 2 global controls GREEN → 4 restored GREEN. Native
output maximum absolute differences are 0.53569746 CPU and 0.53564453 CUDA;
the entire isolated source set restores byte-for-byte. These twelve mutation
executions are separate from the thirty-three normal cases.

The trained pair uses the unchanged historical genuine Main `seed124-swapped`
recipe, not a fresh Main producer. It exercises the exact official Illustrious
v0.1 file, production loading journal, shared-readonly zero-resource encoding,
1024², thirty Main-leading Euler steps, CFG 5 and manual-FP16 embedded VAE.
Both lanes retain the same actual initial latent, encoded contexts, pools,
micro-conditioning, scheduler configuration and timeline. The Invoke-source
lane executes its original concat, graph padding, Canvas mask, mask pyramid and
custom attention operators, including its omitted empty regional negatives.

**All thirty prediction tensors, original native image values and reopened RGB
bytes match exactly.** There are zero changed native-image values, RGB channels
or pixels. RGB SHA-256 is
`c07df849210ed00c9fc55523c438a23a710ce5975bb1017cfc6d9707c0becc2f`;
native FP16 image SHA-256 is
`e019d5dd710db741a49ac31b3611793ade9c39a9c4daa30b5cc40bb893fd7be3`.
Sixty original UNet/Euler transitions and two VAE decodes are observed. Both
lanes cover all seventy cross-attention sites per step (4,200 cross-site
observations in total); the source lane additionally observes 2,100 self-attention
calls. All 140 source-lane processors restore to the original identities.
Borrowed tensor/storage/config/tokenizer state, call slots, RNG and reservations
pass the existing streaming preservation checks.

The identical output still puts the malformed apple left and the mug right,
despite the swapped regional assignment. This is a bounded ROOT image
observation, not a new blinded or human visual acceptance. Earlier visual
qualification remains **NOT_QUALIFIED**. Replacing our attention machinery with
these Invoke operators does not repair this fixed example; it gives no basis
for a new production attention implementation or a public composition default.

## Separate noise and initialization evidence

The zero-model source diagnostic confirms an independent ordinary-path difference.
For seeds 123/124 and shape `[1,4,128,128]`, source-default FP32 noise draws cast
to FP16 differ from native CPU FP16 draws, with RMS differences about 1.419/1.412.
Invoke's explicitly selected legacy FP16 noise option agrees with the FP16 draw;
the source default is FP32. These are actual original source functions executed
on the common runtime, not observations of a running Invoke application.

With the raw noise held equal, original Invoke legacy `add_noise(zeros, noise,
first_timestep)` also differs from native Diffusers initialization. At 20 steps,
first sigma is 11.02833557 versus native `init_noise_sigma` 11.07358074; at 30,
11.47685051 versus 11.52033424. Maximum initial-latent differences are
0.1875/0.21875. Both trained comparison lanes deliberately use the common native
initialization, so exact trained equality does not erase these measured default
differences or qualify source-default image quality.

The next causal comparison can hold this now-checked conditioning/attention
fixed while varying only source-default noise draws and legacy initialization.
It needs a separately frozen finite experiment; there is no reason to rewrite
attention or tune prompts/seeds to a desired image first.

## Evidence and diagnostic boundaries

The retained run contains source manifests/archives, exact original Invoke files
and AST fingerprints, contracts, complete commands, JUnit/resource records,
source-noise observations, loading journal, per-step/operator records, both
original PNGs and bounded FP16 output snapshots. The helper loads original AST
bodies/decorators into an owned namespace; it does not import an installed Invoke
application. The historical Main, checkpoint, native sources, configs and runtime
remain explicit external reproduction dependencies.

Host Python 3.13 and runtime Python 3.12 produce different AST dumps for empty
fields. Their twenty-one source files are byte-identical; fingerprints were
regenerated with runtime Python **3.12.13 before regional differential/trained
calls**. The separate zero-model noise diagnostic had already run against the
original file-hash snapshot, which remains retained. Both manifests and the
chronology clarification survive. Typing-only annotations/casts correct the
initial 7 operator and 11 trained diagnostics; normalized semantic AST equality
is retained. There were no failed native requests or raised execution ceilings.

Independent operator and trained-harness reviews are CLEAN within source-only
scopes. They read, rather than rerun, ROOT's runtime assertions. Retained-byte
audit is also CLEAN: independent PNG decoding and FP16-to-RGB quantization
confirm both outputs, and all retained metadata/content, counters, source/AST
pins and dependency records reconcile. It does not certify live runtime or
physical cleanup. Final documentation/source mapping is ROOT-checked separately.

## Limits and lifecycle

Evidence owner: `runs/regional-guidance-invoke-parity/20261031-source-operators/`.
One compatible runtime/catalog is reused. No additional model/environment copy,
download or Invoke installation is planned. Small numerical units use 3 GiB;
trained units use 12 GiB, zero unit swap, 600 seconds and CUDA allocator fraction
0.75, serially. New compact proof targets 160 MiB; prior required proof remains
an explicit historical compact-budget exception.

At the trained factor-two grid K231, the source FP16 expanded mask occupies
18,923,520 elements / 37,847,040 bytes. It is not our one-byte Boolean allocation;
the production element/budget contract is unchanged. Capacity and whole-application
latency are not inferred from these payload calculations.

The trained unit completed in 150.691 seconds, with host cgroup peak
7,897,444,352 bytes and zero swap. Per-request CUDA allocated peaks are
9,625,660,928 / 9,629,693,952 bytes; reserved peak is 12,238,979,072 bytes.
The cgroup peak sample is largely checkpoint file cache; it is not a measured
simultaneous anonymous-memory peak or a full-application capacity promise.

All **1,478 temporary payload entries** are retained in a verified 18,816,103-byte
archive: 1,405 regular files, 73 directories, no links or special nodes. Content
bytes total 43,306,282; all 1,397 restored mutation-checkout source files match.
Both original PNGs also remain directly accessible outside that archive. A
fresh exact-inventory, physical-exit/source-restoration and incoming-reference
gate preceded disposal of only this run's payload directory. All nine recorded
owned units are idle. Inaccessible preexisting desktop-service handles remain
an explicit gate limitation. After the restart, their age check uses the earliest
resumed native unit rather than the older source snapshot; the first stricter
gate refused and performed no cleanup.

The measured deletion-only reduction is **46,698,496 allocated bytes**. Protected
historical inputs, source snapshots, weights, configs and reusable runtime remain.
Lifecycle is `retained`, with an empty live-payload list; final source contains
1,399 files, six baseline deltas/four additions. Qualification-to-final changes
only the three documentation files; all three Python files remain exact. This
run stays below its 160 MiB compact target; the artifact root remains about
14 GiB, with required historical proof pinned for the open visual diagnosis.

Public NEW refusal, frozen
Retry independence, Smart target-only permissions, provenance exclusions and
PP-001/007/008 **«Пока не обещать»** remain unchanged. This adds no durable Main
candidate, Add/Save, Anima regional execution or generic SDXL product family.
