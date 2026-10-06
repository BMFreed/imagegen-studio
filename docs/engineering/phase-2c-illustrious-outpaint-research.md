# Internal Illustrious masked denoising

Date: 06.10.2026. Research base: `9d43f539e67b479b4af4c13427343f3c7ee14c19`.
Invoke source: `9e1540962bcca7f8fa668d7d8e02cf79d75fda3b`, local checkout
`/home/user/Work/sources/InvokeAI`. Numerical dependency: Diffusers0.40.0.

## Scope and invariant

This continues the [alpha/LaMa foundation](./phase-2c-outpaint-conditioning-research.md)
for [PP-008](../product-promises.md#pp-008-генерация-меняет-проект-только-по-явному-решению).
The internal ordinary four-channel Illustrious pipeline consumes the frozen
LaMa RGB and fractional latent keep mask. Each actual denoising evaluation
must pass the same protected-source merge to both UNet and scheduler. The
original document image remains untouched; output alpha belongs to the
separate contribution helper. This is a medium-risk numerical/shared-loop
change, not an extension of high-risk durable jobs or portable provenance.

Public Generate still refuses mixed alpha for both families. No worker command,
capability, queue union, accepted record, publisher or release-runtime activation
changes. Anima, authored masks, Regional Guidance and Smart Patch are outside
this implementation. SDXL names denote Illustrious's architecture; they do not
add base SDXL as a supported product family.

## Actual source semantics

The selected default Invoke path is `_old_invoke` in `denoise_latents.py`;
its `AddsMaskGuidance` in `diffusers_pipeline.py` uses generation mask `G`,
opposite to the alpha-derived keep mask `K`. Main freezes raw alpha/policy;
Python computes coherence and normalizes the processed latent keep-mask bytes
to `K` in F32. Invoke inverts in F32, then casts `G = 1 - K` to the
model dtype. Before each evaluation at actual `t`, protected source is
`R(t) = scheduler.add_noise(originalLatents, frozenNoise, t)`, and the input is
`where(G > t / num_train_timesteps, candidateLatents, R(t))`. Final restoration
uses `where(G > 0, finalLatents, originalLatents)` before VAE decode.

The arithmetic order is observable in FP16: keep byte1 and timestep996 at
training scale1000 cause the strict generation-mask comparison to preserve,
while the algebraically equivalent keep-mask/complement formula generates.
Tests execute the external old method to verify the actual half threshold;
mathematical equivalence alone is insufficient.

Ordinary img2img's selected training-time window and replayable CPU RNG streams
remain unchanged. Initial noise is drawn once; the same tensor is used for all
protected-source reconstruction. No `init_noise_sigma` scaling is introduced.
Zero selected timesteps still perform the native VAE roundtrip without UNet
evaluation. Protected decoded pixels are a VAE reconstruction, not a claim of
RGB identity with the original document image.

## Native integration and rejected alternatives

`outpaint_pipeline_class` extends the existing native img2img subclass. It
captures copied mask, encoded source, noise and selected schedule per call.
The first input already equals the noised source. After each scheduler step,
the mandatory callback prepares protected source for the **next actual**
timestep before Diffusers scales or duplicates model input. The resulting
latents are also the scheduler's next sample. The last callback restores fully
protected latents before decoding. DPM++ SDE callbacks run at every actual
evaluation, including second-order intermediate evaluations; native `add_noise`
uses the solver's advanced index, matching the source algorithm's semantics.

A progress-only callback is insufficient: masking must run without a progress
listener. Masking only UNet input is also insufficient: scheduler state must
consume the same merged sample. The tests check both inputs independently.
Copying the whole upstream loop, using a specialized nine-channel checkpoint,
or inventing another inference backend is unnecessary here.

Input mode/grid/dimensions, one-image topology, finite latent tensors and callback
sequence are guarded. Reentrant calls refuse. `finally` clears capture after
success, error and cancellation; independent source/mask snapshots prevent caller
edits from changing a running call. Shared ordinary txt2img/img2img behavior is
covered by neighboring regressions. Hash-bound resource loading, VAE precision,
finite VAE hooks and contribution alpha remain the caller's responsibilities.

## Evidence and limits

Artifact root:
`/home/user/.codex/artifacts/imagegen-studio/illustrious-outpaint-2026-10-06/`.
The checks below inspect the implementation tree based on the research commit.
The delivery manifest records final source identities and the delivered commit.

CPU tests use real tiny native UNet/VAE and all five admitted schedulers, with
epsilon/v_prediction and strength0/.2/.75/1. Their numerical oracle executes
the external hash-pinned `AddsMaskGuidance` source. Only its batch-repeat plumbing
is supplied by a Torch facade; its mask arithmetic is unchanged. These are
not trained-quality tests. A separate trained script enters Main's actual
snapshot factory, verified local CPU LaMa, actual CUDA Illustrious and the RGBA
contribution helper. It bypasses public dispatch/publication deliberately.

The trained run uses one qualified epsilon checkpoint, 256×128, four requested
steps, plain prompts, built-in Auto VAE and no LoRA/embedding/external VAE.
Replay, changed seed, unmasked/black and zero/white comparisons check numerical
effects; all five schedulers are exercised. Config, package, source, input and
checkpoint identities are captured in its report. This does not qualify
production installation, larger dimensions, visual quality, public acceptance,
recovery, Save/reopen or the full combinations of options.

| Boundary               | Executed result                                                                                                                                             | Limit                                                                                                 |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Native numerical tests | 57/57, zero skips; 40 oracle cases: five schedulers × two prediction types × four strengths; actual UNet, scheduler sample and decoder inputs               | Tiny real native models; external source is required for oracle cases                                 |
| Neighboring controls   | New masked tests plus existing native img2img/CFG tests: 60/60, zero skips                                                                                  | Shared native-loop regression, not a public outpaint job                                              |
| Trained internal CUDA  | 11/11 cases; replay equal, all-black equals ordinary img2img, all-white equals zero-strength VAE; seed/mixed-mask ablations change pixels; all five methods | One epsilon Illustrious checkpoint, 256×128/four steps; default VAE, no adapters, no installed worker |
| Semantic mutations     | 12/12 detected by behavioral test failures; each restored selected test passes in the same scratch path; full original/post-audit controls57/57             | Test sensitivity for selected defects, not completeness                                               |
| Full regression        | App1671/1671, Python875/875; zero failures/skips                                                                                                            | Existing controlled inference tests remain controlled                                                 |
| Static/build           | Full TS typecheck/lint/app build; Python Ruff format/check and strict BasedPyright including trained script                                                 | Development tooling, not release-runtime installation                                                 |

Trained checkpoint: `bismuthIllustrious_v80.safetensors`,
6,938,040,706bytes, SHA256
`749cb493aada2e5d522ae87b53219b8783096135b0a1c7168366c7692c80c632`.
Managed artifact copy used; original user checkpoint was not modified.
LaMa: 205,669,692bytes, SHA256
`344c77bbcb158f17dd143070d1e789f38a66c04202311ae3a258ef66667a9ea9`.
RTX4080/CUDA12.6; Torch2.7.1, Diffusers0.40.0, Transformers5.5.4,
Compel2.4.0, Pillow12.2.0. `trained-run/report.json` pins all17 config files,
actual implementation sources and inputs, progress and output pixel hashes.
Peak allocated CUDA memory was7,358,724,096bytes for this small execution;
this is not a capacity estimate for full-size generation.

Logs: `python-tests.log`, `app-tests.log`, `trained.log`,
`trained-run/report.json`, `mutations/report.json`, `mutations/driver.log`,
per-mutant red/restored logs, `typecheck.log`, `lint.log`, `build.log`,
`python-lint.log`, `python-format.log`, `python-types.log`, `gpu-script-types.log`.
The original installed runtime's `inference.py` remains byte-identical:
`ee0d356a9d2f9f255b6f1ef36bcdae90c46f210934ed8e25a798adf051a602d7`.

Source-aware peer review found two concrete gaps during implementation: FP16
inversion ordering and missing scheduler-sample assertions in the first oracle.
Both were corrected before the final CPU/trained/mutation evidence. This was
a source-aware review, not a blind audit. Initial static checks caught smoke
import ordering/line length and typed callback arguments; these were fixed.
The initial oracle lacked optional `einops` in the locked dependency graph;
only batch-repeat plumbing was replaced, retaining external mask arithmetic.
Existing TorchSDE boundary warnings, Diffusers VAE casting notices and build
chunk-size warning remain warnings; executed checks completed successfully.

## Next boundaries

Implement Anima masked denoising next, with its shifted sigma mixture and
inverse-shifted linear-time thresholds, checking all six admitted methods and
completed user-step semantics including Heun. Then extend frozen/durable jobs,
Main auxiliary materialization/Retry, worker capability/transport, RGBA publisher/
staging and portable provenance/comparison together. Preserve temporary-only
completion, explicit Add, original layers/bbox, recovery and Save/reopen before
lifting public refusal. Empty contribution after alpha downsampling remains a
concrete integration case from the preceding foundation.

The accepted LaMa first-engine delivery decision is unchanged: show full size
before installation; Main downloads, caches and verifies; worker loads verified
local bytes. No auxiliary installer or release delivery is implemented here.
PP-005/007/008 readiness and phase2C completion remain unchanged.
