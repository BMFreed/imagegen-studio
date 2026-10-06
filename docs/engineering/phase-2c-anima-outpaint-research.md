# Internal Anima masked denoising

Date: 06.10.2026. Research base: `795b6f3529628d0dcfbb5a118837f16da1e7880e`.
Invoke source: `9e1540962bcca7f8fa668d7d8e02cf79d75fda3b`, local checkout
`/home/user/Work/sources/InvokeAI`. Diffusers0.40.0/Torch2.7.1.

## Scope, risk and invariant

Continue the [normal alpha/LaMa foundation](./phase-2c-outpaint-conditioning-research.md)
and [Illustrious masked adapter](./phase-2c-illustrious-outpaint-research.md)
for [PP-008](../product-promises.md#pp-008-генерация-меняет-проект-только-по-явному-решению).
Anima's internal six-method flow path consumes exact RGB LaMa conditioning and
the processed latent keep mask. Original normalized VAE latents and one frozen
initial noise tensor must restore protected regions at the correct noise level
after each **completed user step**, including terminal restoration before decode.
Weighted prompts, CFG, ordinary LoRA, replayable RNG streams and VAE guards remain
the existing shared execution path.

Risk is high for numerical output: wrong time domain, half precision, Heun
completion, RNG or history can silently alter source influence. Shared Euler/
native loops are the blast radius; old unmasked APIs require neighboring controls.
This slice does not change filesystem publication, queue persistence or portable
provenance. A failure returns the existing worker error and removes temporary
VAE/adapter hooks; it cannot accept a layer or modify a project.

No new public command, handshake capability, queue kind or accepted record.
Mixed-alpha Generate remains explicitly refused for both families. No model
download/discovery, alternate backend, new supported family or optional Anima
LLLite adapter. Authored masks/Regional Guidance/Smart Patch remain phase4.

## Confirmed source semantics

`AnimaDenoiseInvocation._prep_inpaint_mask` inverts the processed F32 keep mask,
resizes to the latent grid and casts to the model dtype. The selected source
uses `AnimaInpaintExtension` derived from `RectifiedFlowInpaintExtension`:

- Shifted next sigma is `s`; linear threshold time is `t = s / (3 - 2 * s)`.
- Binary generation mask is exactly
  `where(G >= t + 1e-4, 1.0, 0.0).to(dtype/device of G)`.
- Protected source mixture is `noise * s + (1 - s) * originalLatents`.
- Output is `candidate * mask + protectedSource * (1 - mask)`.

Do not substitute the Illustrious pre-step threshold, shifted sigma as threshold,
linear time for source mixture, strict `>`, `lerp`, or a direct where-select merge.
The operation ordering is observable in low precision. A real Torch control with
BF16 `G=.5` and `s=.75` gives linear `.5`; upstream `>= .5+1e-4` rounds and passes,
whereas `> .5` rejects. F32 inversion precedes the cast, as in Invoke.

`AnimaSchedulerDriver.iterations` reads Heun's `state_in_first_order` **before**
`scheduler.step`. Merge happens after the step only when the corrector completes
or next sigma is terminal zero. Other methods complete on every evaluation.
The terminal merge with `s=0` restores protected source before VAE; no unrelated
after-loop restore is needed. Public IGS progress continues to count actual
evaluations, including Heun predictors, independently from mask completion.

Source SHA256:

- `invokeai/app/invocations/anima_denoise.py`:
  `cb92470f4b329677b303fe02ab189dd1d16b6400261fdb61042f789620b37c08`.
- `invokeai/backend/rectified_flow/rectified_flow_inpaint_extension.py`:
  `a7a77d7ac6433b5ad930716bf21852a97a81960688e8670a8120e8d26f94e721`.
- `invokeai/backend/anima/scheduler_driver.py`:
  `3d2f9e3531607e2e9a42e160aefd25e8fc3aec15dab40551e04dca691408a32d`.

## Existing intentional differences retained

The existing [six-method contract](./phase-2c-anima-flow-sampling-research.md)
is the finite authority: Euler, Heun, DPM++2M, DPM++2M SDE, ER-SDE and Flow LCM.
Preserve the previously implemented initial actual sigma for interior native
schedules and LCM's authored once-shifted/clipped grid. Invoke's current LCM
driver regenerates an unshifted schedule and loses clipping; this work does not
reintroduce that behavior or claim whole-pipeline pixel parity with Invoke.
The oracle compares source mask algebra/completion against the admitted IGS
schedules. Existing zero-strength native VAE-only behavior also remains:
Invoke refuses an empty denoising interval; IGS does not draw denoising noise,
encode prompts or call the model in this case. Source pixels are not promised
identical after VAE reconstruction.

## Implementation and evidence plan

The new internal entry validates the same versioned six-method flow plan in
img2img mode, exact RGB source and exact L keep mask at /8. Per-call copied mask,
original latents and frozen noise form a local closure; no model-global mask state
or copied denoising loop. The shared executor provides a trusted capture factory;
Euler and native schedulers provide after-step sigma/completion to its transform.
Ordinary calls keep their existing behavior and five-argument denoiser collaborator.

Verify actual native transformer, scheduler sample and VAE decode inputs against
executed external source methods; no locally reconstructed mask oracle. Test all
six methods and zero/interior/full strength, low-precision threshold boundaries,
black/unmasked and white/zero controls, seed replay, source/mask snapshots, weighted
both-sign conditioning, LoRA cleanup, invalid inputs and non-finite outputs.
Execute isolated semantic mutations and restore the same test import paths.

A separate opt-in trained script enters actual TS alpha/policy freezing and
six-method/prompt compilers, exact local CPU LaMa and trained CUDA Anima bundle,
then creates a direct RGBA contribution. It deliberately bypasses public jobs
and RGB-only publication. Small target/few steps and one model bundle cannot
qualify visual quality, installed runtime, public acceptance or persistence.

Artifact root:
`/home/user/.codex/artifacts/imagegen-studio/anima-outpaint-2026-10-06/`.
Checks inspect the source tree based on the research commit. The final delivery
manifest pins delivered sources, logs and commit.

| Boundary              | Executed result                                                                                                                                                   | Limit                                                                                                          |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Native masked loop    | 49/49 new tests, zero skips; 24 oracle cases: six methods × four strengths; actual transformer inputs, native scheduler samples, final latents and decoded pixels | Real tiny native models; external pinned sources required for oracle checks                                    |
| Neighboring methods   | 196/196 before the last copy regression: 48 masked +148 existing Euler/deterministic/flow tests; final 49 included in full regression                             | Shared internal APIs, not a public outpaint job                                                                |
| BF16 source controls  | External source threshold/merge and actual request factory F32-inversion/cast comparisons; native Qwen hook tests entry-time PIL mask capture                     | Factory test supplies real BF16 tensors via executor spy; full BF16 trained pipeline is separate               |
| Trained internal CUDA | Final 16/16: all six methods, strength0/.25/.75/1, weighted positive/negative ablations, changed seed, replay without progress and endpoint controls              | One Anima bundle, 256×128/four requested steps, no LoRA, release runtime or public publication                 |
| Semantic mutations    | 13/13 killed; each restored selected control passes; original/final full controls49/49, no skips/errors                                                           | Isolated scratch modules, actual import origins/hashes enforced; selected defect sensitivity, not completeness |
| Full regression       | App1671/1671, Python924/924; zero failures/skips                                                                                                                  | Existing controlled inference tests remain controlled                                                          |
| Static/build          | Full TS typecheck/lint/app build; Python Ruff format/check and strict BasedPyright including trained script                                                       | Development tooling, not release installation/upgrade                                                          |

Replay, all-black/ordinary and all-white/zero match both returned latents and
decoded pixels. Changed seed, mixed mask and each prompt-sign weighting ablation
change decoded pixels. The final trained report pins all15 implementation files,
bundled tokenizers, exact resource identities, compiled inputs, mask and output
hashes, progress and package versions. Progress counts actual evaluations;
Heun's clipped three user steps produce five evaluations, while mask completion
is gated independently.

Qualified local managed Anima bundle:

- Checkpoint `cyberfalafelFalafel_cyberfalafelAnimaV10.safetensors`,
  4,182,275,752bytes; SHA256
  `0fc7507b222e52ac8cc5e2826786bc4caed05223df32d17aeb05a76cb4de9941`.
- Pinned Qwen3, 1,192,135,096bytes; SHA256
  `cd2a512003e2f9f3cd3c32a9c3573f820bb28c940f73c57b1ddaa983d9223eba`.
- Pinned VAE, 253,806,246bytes; SHA256
  `a70580f0213e67967ee9c95f05bb400e8fb08307e017a924bf3441223e023d1f`.

LaMa's existing local 205,669,692byte resource is unchanged; no weights downloaded.
Final trained execution: RTX4080/CUDA12.6/BF16, Python3.12.13, Torch2.7.1,
Diffusers0.40.0, Transformers5.5.4, Torchvision0.22.1. Peak allocated CUDA memory
6,122,610,176bytes is specific to this small run, not a capacity estimate.
Installed `anima_euler.py` and `anima_sampling.py` still match the research-base
files byte-for-byte. No installed application or user checkpoint was modified.

Logs: `focused-tests.log`, `neighbor-tests.log`, `focused-types.log`,
`python-tests.log`, `app-tests.log`, `smoke-preflight.log`, `trained-final.log`,
`trained-final/report.json`, `typecheck.log`, `lint.log`, `build.log`,
`python-lint.log`, `python-format.log`, `python-types.log`, `gpu-script-types.log`.
Mutation evidence: `mutations/report.json`, `mutations/audit.log`, original/final
full-control logs and per-case red/restored reports, commands and archived sources.
All scratch and repository final hashes match the frozen modules/tests; GPU and
installed runtime were excluded from mutation execution.
The CPU script preflight executed actual Main/prompt compilers and24 native
validated plans before trained loading. The earlier `trained-run` evidence is
retained separately; after the type-only collaborator compatibility correction,
all16 cases were rerun against final source in `trained-final`.

Source-aware peer review found no remaining mask-arithmetic/gating blocker.
It prompted two concrete test improvements: production F32-invert-before-BF16
capture and caller-mask mutation during real Qwen encoding, before tensor capture.
The initial optional-sixth-argument Protocol did not preserve an explicitly typed
five-argument collaborator. Original callable typing and ordinary five-argument
calls were retained; a native regression verifies that contract. Initial strict
checks also caught helper annotations/private-access handling in tests; fixed
without weakening checks. Existing TorchSDE float-boundary warnings and build
chunk-size warning remain warnings. This was a source-aware review, not a blind
audit or visual-quality qualification.

## Next coupled boundary

Before lifting mixed-alpha refusal, extend immutable frozen/durable jobs, Main
auxiliary installation/materialization/Retry, worker capabilities/transport,
RGBA publisher/staging and portable accepted settings/comparison together.
Prove temporary-only completion, explicit Add, source-layer/bbox preservation,
recovery and Save/reopen through installed trained execution. Empty contribution
after alpha downsampling is an explicit integration case. LaMa remains a
first-engine resource with upfront total size and Main-owned download/cache/hash;
no auxiliary installer or release delivery is implemented in this slice.
PP-005/007/008 public readiness and phase2C completion remain unchanged.

The subsequent [internal frozen jobs checkpoint](./phase-2c-outpaint-jobs-research.md)
adds durable mixed-alpha inputs, internal atomic admission/Retry and Main's pinned
shared LaMa resolver. Public dispatch, RGBA publication/portable provenance and
auxiliary installation remain open; this does not change the earlier numerical
evidence or public readiness.
