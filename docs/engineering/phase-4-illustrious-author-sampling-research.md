# Ordinary Illustrious author-sampling control

## Source and hypothesis

Base: clean `596bf212f3a99f5f7645efef79d5c4d18793d06c`.
The ordinary and same-terminal VAE controls leave the extra mug at seed 124
unexplained. Neither established an inference defect or justified a precision
default change.

The [official model card at the exact retained revision](https://huggingface.co/OnomaAIResearch/Illustrious-xl-early-release-v0/blob/dca0dac303e6dc4b0c31d8001bc685b89b5d0204/README.md)
recommends Euler a, 20–28 steps and CFG 5–7.5 for Illustrious XL v0.1. It describes
the checkpoint as an untuned illustration base, without aesthetic preference
tuning or a default style. Quality tags are supported; this experiment does not
add them. The exact 16,918-byte card is retained with SHA-256
`0205e7c1d93c5c4fd6a2045ebf9ae3cd333684074385130d5b9e5aef3e051b45`.
No assumption about a tuned model's visual quality follows from this source.

The previous ordinary control used Euler/30/CFG 5. Freeze one **author sampling
candidate: Euler a/28/CFG 5**, with the same still-life text, empty negative and
seeds 123/124. This is a bundled sampling comparison; it cannot isolate the
sampler from step count or stochastic-step policy. No prompt, seed, sampler or
step sweep follows a failure in this attempt.

## Existing Invoke and Studio owners

Current clean Invoke: `a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd`.
Read its actual scheduler map, original `DenoiseLatentsInvocation.init_scheduler`
and callers, noise producer/device policy, text producer and active graph.
Paths under `invokeai/` are retained with hashes:

- `backend/stable_diffusion/schedulers/schedulers.py`: Euler a maps to native
  `EulerAncestralDiscreteScheduler`.
- `app/invocations/sd/denoise_latents.py`: the original scheduler initializer
  returns a separate generator on the compute device, seeded with all seed bits
  flipped; the actual denoising caller forwards it to `scheduler.step`.
- `app/invocations/latent_noise.py` and `backend/util/devices.py`: default seeded
  CPU FP32 initial noise, converted to compute dtype.
- `app/invocations/text_encoder/compel.py` and frontend generation graph:
  independent global dual-CLIP conditioning, same text into prompt/style,
  exact-empty negative zeros, global pool and ordinary micro-conditioning.

Studio's **ordinary** `inference.generate_illustrious_txt2img` already supports
Euler a through `select_inference_scheduler`. Use this owner and its original
native loop, VAE, finite checks and exclusive PNG publisher. The private regional
owner still admits only Euler; this control neither widens it nor falsely labels
an Euler run as Euler a.

Original Invoke noise and scheduler-initializer definitions supply test-only
input/step-kwargs adapters. Preserve their compute bodies and check the actual
private generator identity, device and consumption. Native `init_noise_sigma`
initialization remains fixed from the earlier comparison. This is source-operator
adaptation on the common runtime, not complete installed Invoke execution or its
legacy initialization. No production implementation or default changes.

## Input authority and acceptance

Reuse the two exact historical genuine Main `seed123-baseline` and
`seed124-baseline` prompt/item/target handoffs unchanged. Their disabled owners
produce complete `regions == []` recipes with no TI or other adapters.
The **new experiment contract** authors Euler a/28 sampling commands. It does
not claim these settings were saved/reopened in the historical Main documents,
whose authored sampling remains historical. No new Main persistence, queue or
transport qualification is claimed.

Keep official epsilon checkpoint SHA-256
`3e15ba00387db678ab4a099f75771c4f5ac67fda9e7100a01d263eaf30145aa9`,
1024², origin (-13,5), CFG rescale zero, manual FP16 embedded VAE, source FP32
initial-noise draw and Main-resolved false-ZTSNR/leading policy. Require original
loader/reader/converter/live-component association and unmodified target bytes.

At consumption, check actual original ancestral scheduler, all 28 native UNet
and Euler transitions, seventy original cross-attention sites each step with
native `None` masks, source step generator, correct global contexts/pools/time
IDs and one K77 prompt pair/three CLIP forwards/zero TI. Check actual initial and
terminal latent associations, finite VAE output, native PT-to-PNG quantization,
ICC/dimensions/completion correlation, RNG and method/namespace restoration.

View both new PNGs anonymously alongside retained ordinary controls. The
predeclared scene criteria are one recognizable red apple and one blue mug,
plausible support/geometry and coherent table/background without extra mugs or
fruit. Ordinary text prescribes no side. A numerical change is not visual PASS;
record partial or inconclusive outcomes without promoting defaults, general
quality or regional assignment/reversal.

## Preparation evidence

The run-owned probe passes scoped Ruff and strict basedpyright. Independent
source review is CLEAN at probe SHA-256
`95c8f78d4ad3b18cb1452330f7da69bb7c82fd52f16c3210aab37eccdb3e02ec`.
Review identified a potential cold-CLIP graph false-RED: pinned Transformers
installs capture hooks lazily during the first forward. The probe now invokes
that exact native installer on both text submodels before the preserved
baseline, with zero additional forwards. Its source and native caller are
retained/pinned, and checked after execution.

Source/card/Main/comparator/self preflight and actual runtime qualification
pass without loading models. Full checkpoint-byte verification also passes.
A CPU-only check executes the original Invoke noise/scheduler initializer and
native ancestral scheduler on a small tensor with a fixed synthetic prediction.
For seeds 123/124, source noise and the literal 28-step grid match; the private
xor generator advances, preserves global RNG, and a deliberately wrong
unflipped generator changes terminal values. These are model-free stochastic
seam checks, not trained CUDA or image qualification.

Two actual trained cases and their visual assessment remain pending at this
preparation checkpoint. Serial continuation uses distinct labels, verifies
free VRAM against the declared allocator envelope before starting, and refuses
automatic model retries. An existing separate Invoke session is preserved.

## Bounds and pending result

Evidence owner: `runs/regional-guidance-author-sampling/20261102-euler-a-28/`.
`author-sampling-contract.json` freezes exact source/input pins, two-request
ceiling and both historical comparators before native execution. No additional
model/runtime download or copy is needed. Run the two requests in separate
serial units, each bounded by 12 GiB host, zero unit swap, 600 seconds and CUDA
allocator fraction 0.75. Verify real device headroom before each heavy run;
preserve any other running Invoke session. Small checks use 3 GiB.

Compact target is 120 MiB. Retain required PNG/native/source/command evidence and
confirm physical exit/source and readers before disposing only owned payloads.
Historical inputs and the compatible source/config/runtime remain protected.
Execution and visual findings are pending.

Public enabled-region NEW refusal, frozen Retry independence, Smart target-only
permissions and Regional provenance/Compare/preset exclusions remain unchanged.
PP-001/007/008 stay **«Пока не обещать»**. No Anima or generic SDXL capability,
durable Main candidate, Add/Save or quality guarantee is added.

## Completed continuation — 3 November 2026

Execution resumed from clean `3b54556ab2dd62dbb9b36c38bbf343d1a6b28525`
after the user freed VRAM. Invoke remained clean at the revision recorded above.
The two fixed cases now pass through the actual ordinary entry point, original
trained components, ancestral loop, VAE and exclusive RGB publication:
**2 PASS, 10 warnings**, with 56 UNet calls, 56 Euler transitions, 3,920 original
attention-site observations, two completed decodes and two published PNGs.
Each case encodes one K77 pair with three CLIP forwards and zero TI loads/resizes.
The loading journals independently connect every checkpoint-backed destination
to the retained exact file. ROOT executed the assertions; source review alone
does not certify these runtime results.

One earlier diagnostic is excluded from acceptance: **1 failed selection,
5 warnings**, after all 28 UNet/Euler steps but before the original VAE decode.
The observer assumed a named `z` argument, whereas the pinned Diffusers forward
wrapper exposes positional arguments. During unwinding, a strict tokenizer-state
assertion masked that `KeyError`: the cold pooled Compel tokenizer had set its
truncation configuration. No PNG was published by this attempt.

The run-owned probe now observes the actual positional latent and delegates the
unchanged original decode. Before taking its strict preserved-state baseline,
it calls the original Compel tokenization on both tokenizers, with zero extra
encoder forwards. Only padding/truncation changes are admitted during this
preparation; all other serialized state must remain exact. The complete strict
tokenizer/model/storage/graph/RNG checks remain after preparation. A CPU-only
preflight confirms the native wrapper signature and the pooled tokenizer's
truncation change without loading models.

Before retrying, `author-sampling-recovery-contract.json` explicitly raised the
total ceiling from two to **three actual requests**: the excluded diagnostic and
the two unchanged acceptance seeds. It preserves the original contract and
candidate, with no seed/prompt/settings search. Independent recovery-delta
review is CLEAN, source-only, at probe SHA-256
`3dee39a9a7528f49c0a2113b3ae30210e63f9d22dd6499d2d774ec19eed3fe46`
and recovery-contract SHA-256
`26f46dbebed3252551fb8bda2a617315819144320e2c65ecfe711a1b5c965264`.
The corrected seed123 exactly reproduces the diagnostic's initial preparation,
contexts, all 28 predictions/latent transitions, 1,960 sites and stochastic draws.
Thus this observer repair introduces no measured pre-decode trajectory change.
Total execution accounting, including the excluded diagnostic, is 84 UNet and
84 Euler calls; completed native decode/publication remains two.

Both passing cases preserve the asserted source state/storage, module and
tokenizer graphs, global RNG, original method/observer slots and namespaces.
Their units finish physically empty, use zero unit swap and stay within the
declared envelope: maximum accepted host `MemoryPeak` 7,865,012,224 bytes,
CUDA allocated peak 9,615,542,784 and reserved peak 12,176,064,512 bytes.
These are observations for these serial requests, not a general capacity bound.

## Finite visual result

ROOT viewed all four original PNGs; a separate reader described four randomized
copies without prompts, seed labels or the assignment key. Reopened candidate
RGB changes 3,108,135 channels at seed123 and 3,114,866 at seed124 relative to
the pinned ordinary controls. Every candidate RGB channel matches independent
quantization of that request's original native image. Numerical change alone
does not establish scene quality.

- **Seed123: FAIL** against the frozen blue-mug criterion. The malformed empty
  foreground recess is gone and both objects are separately supported, but the
  mug is predominantly white, with a blue decorative band and blue contents.
- **Seed124: bounded PASS** for the declared ordinary-scene criterion: one blue
  mug and one red apple, separately supported, with no extra mug or fruit. The
  previous extra white mug is absent. A large basin and a cropped metal vessel
  remain unrequested; the criterion did not prohibit other kinds of tableware.

The finite aggregate is **NOT_QUALIFIED: 1 PASS / 1 FAIL**. Independent anonymous
descriptions support object counts and geometry; they are not a human acceptance
decision. Human acceptance remains pending. This is partial improvement under a
bundled sampling intervention, not a proof that sampler choice alone caused it.
No production default changes and no regional assignment/reversal acceptance
follow. Do not repeat a model run or tune the prompt to conceal this outcome.

The next diagnostic choice concerns ordinary scene/style calibration for this
untuned base, rather than another regional mechanism. Any continuation must
start from current Invoke sources and predeclare its single comparison; this
attempt supplies no basis for changing regional composition or public admission.

## Retained evidence and release

The same run owner retains `execution-summary.json`, both passing reports and
their loading/JUnit/log/resource companions, the excluded diagnostic with its
full exception chain, both original contracts, probe before/after bytes, exact
Invoke/native source pins, CPU preflights, `visual-verdict.json`, anonymous
descriptions/key and all four display PNGs. The record-only retained-result audit
is CLEAN: it independently decodes the PNGs and reconciles counters, contrasts
and diagnostic/recovery trajectories; it does not rerun the model or certify
visual quality.

ROOT's fresh release gate checks 13 recorded units/groups, 1,404 source members
with only these three finalization documents permitted to change, completed
reader declarations and incoming payload references. No candidate users are
found among accessible same-UID handles; inaccessible preexisting desktop
services are explicitly excluded in `release-gates-r2.json`, rather than claimed
as a complete OS census. Source weights, the compatible runtime, offline config,
historical Main/ordinary inputs and their reciprocal dependencies remain pinned.

All 18 disposable payload entries (11 regular files and seven directories)
are retained in `retained-payloads-r1.tar.gz`, SHA-256
`840457ff907db264a75b4f3d858e48052e28cf3c49f1de96550ea7efdef70f42`.
Full archive read-back verifies metadata/content against the inventory; a fresh
exact live inventory and physical/reader/dependency gate precede deletion.
Only this run's owned `payloads` tree is removed, with **14,962,688 allocated
bytes reclaimed during the deletion-only interval**. Live report paths inside
that tree are now historical replay pointers; required native image/terminal
bytes survive in the archive, and display PNGs remain directly readable.
Lifecycle is `retained`, with no live payloads. This release adds no model copy,
environment or provisioned dependency and leaves the existing public limits
unchanged.
