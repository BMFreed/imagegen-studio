# Current InvokeAI comparison for the Anima regional negative IMG pilot

Studio base `4bfdba711a3eec98be6caaf1cfe51d97311fabdb`, InvokeAI clean
`4875d96531ca6712b288f6e660fcbb34143408c1`. The
[Studio IMG pilot](./phase-4-anima-negative-spatial-utility-research.md) kept
both scarves red when `(red scarf)1.5` was moved between the two independently
owned regions. This control asks whether the current original Invoke denoiser
produces the requested side-specific attenuation on those same frozen inputs.
The [historical Invoke control](./phase-4-regional-guidance-anima-invoke-control-research.md)
used earlier source, positive-only TXT and Euler. This experiment targets the
actual signed-negative Heun IMG case.

## Fresh source trace and CPU control

`frontend/webv2/src/features/generation/core/canvas/compileCanvasGraph.ts`
grafts IMG and calls `addRegionalGuidance.ts`. It connects each signed masked
prompt as a separate conditioning source. `app/invocations/text_encoder/anima_text_encoder.py::_encode_prompt`
uses the original parser and weighted T5 tokenizer in
`backend/anima/prompt_weighting.py` along with Qwen3. The current
`app/invocations/anima/anima_denoise.py::_run_diffusion` owns CFG, distinct banks
for each sign, mask selection, initial latent/noise blend and Heun calls.
`backend/anima/regional_prompting.py`, `backend/util/mask.py` and
`backend/anima/anima_transformer_patch.py` own binary permissions and apply them
on even blocks. Odd blocks see the complete active bank. The global negative
keeps image-wide support on even blocks too.

The bounded CPU control executes the current Invoke and installed Studio
operators on the exact captured alpha and authored prompts. Local negative
masks match bit for bit in both assignments. The baseline has only the global
negative and no negative mask. Cleaned texts, spans, Qwen IDs/mask and weighted
T5 token inputs also agree for all four fixed texts. Current Studio's positive
mask expands global support when the two halves consume the entire background.
Invoke leaves the global positive closed in that case because every query has
its own regional positive. The difference is 524,288 allowed query/key pairs
in the positive mask. Studio's private background-only mode matches the native
Invoke positive mask bit for bit on this input.

`backend/anima/scheduler_driver.py` and `backend/flux/schedulers.py` use the
same physical Heun window as Studio for this fixed plan. An independent reading
of `anima_denoise.py::_get_sigmas` and the actual blend shows an initial sigma of
0.75 in Invoke. Studio uses the first native Heun sigma, about 0.73097. The same
seeded CPU FP32 noise was reproduced. `app/invocations/vae/anima_image_to_latents.py`
uses ambient RNG for its VAE posterior, while Studio separately seeds that
draw. These facts are input/operation differences. The CPU test contains no
trained denoising, and the posterior comparison is source inspection.

## Original-denoiser visual control

The checkout has no matching application environment. On the installed
InvokeAI 6.14.3 Python, importing the current invocation reaches the application
database dependency and fails at missing SQLAlchemy. The signed Studio runtime
also lacks standalone Einops. Current checkout Diffusers and Transformers
requirements differ from both installed environments. Preserve those preflight
failures and use the signed Studio libraries plus the existing read-only Einops
package for a controlled source comparison.

Reuse the exact original Anima checkpoint layout and backbone in
`backend/anima/checkpoint_layout.py`, `backend/anima/anima_transformer.py` and the
registry caller `backend/model_manager/load/model_loaders/anima.py`. The probe
uses the original standalone layout/prefix logic and binds the 685 persistent
tensors and generated RoPE buffers. It executes the unmodified body of
`_run_diffusion` and its relevant methods with small ports for model residency,
conditioning/tensor storage and progress. The original regional operators,
even-block patch and Heun driver execute on CUDA. Application setup and registry
execution are outside this source control.

Hold the exact normalized Studio source posterior, Qwen weights/tokenizer, Wan
VAE and untiled PNG conversion. Studio's zero-strength image owner performs
the deterministic source encode without any denoising. For each fixed raw
prompt, use the original Invoke parser and weighted T5 tokenization. Compute
Qwen hidden states with the shared pinned encoder and compare to the installed
Studio encoder result. The original Invoke backbone computes its own LLM
Adapter contexts and predictions. Use the original initial blend and mask
policy for every donor case. The three-case design uses the previous mask
assets, seed 123, 512², strength 0.5, Heun20 and CFG 4. Retain the original
rubric, literal ROIs and independent blind assessment, without tuning from
output pixels.

## Result

The CPU control passed in 3.435 s. The current original denoiser completed
all three CUDA cases in 45.191 s under the 12 GiB/600 s scope and the 0.75 CUDA
allocator fraction. It measured 19 positive and 19 negative transformer calls
per case and ten logical progress updates. The actual even-block positive
mask closed global support and the actual local negative columns selected
the correct half. The loader verified 685 persistent tensors and three FP32
RoPE buffers. All four prompts agree in Qwen hidden states with the shared
encoder, as well as in cleaned text, IDs and T5 weights. The cgroup peak was
11,059,855,360 bytes including file cache, with zero allowed swap and no OOM.
Torch measured 6,795,410,944 CUDA bytes allocated and 6,947,864,576 reserved.

The blind observer and root both saw two coherent white cats with intact,
predominantly red scarves on both sides in all three Invoke frames. The
baseline passes. Both treatment criteria fail, as in Studio. The source-defined
red regions have 2,845 pixels each.

| Run                           | Baseline left / right | Left negative left / right | Right negative left / right |
| ----------------------------- | --------------------: | -------------------------: | --------------------------: |
| Studio                        |         2,845 / 2,840 |              2,845 / 2,842 |               2,844 / 2,840 |
| Current Invoke source control |         2,845 / 2,840 |              2,845 / 2,841 |               2,845 / 2,840 |

Each treated scarf has exactly the control count under both implementations.
The two Invoke treatments differ by at most one classified red pixel on either
side, far below the prespecified 15-point effect. The implementations produced
different images (more than 224,000 changed RGB pixels per matched pair), with
some different decoration and linework. The failed red-attenuation criterion
is shared by the original denoiser and Studio in this fixed case.

The matched negative masks rule out a discrepancy in the measured mask and
token inputs. The different positive-mask policy and source preblend do not
rescue the fixed effect in the original denoiser. Their isolated contributions
remain unresolved because this control compares the original backbone and
multiple numerical operations together. The measured paths offer no verified
behavioral fix to port for this case. The one-scene result leaves other inputs,
packaged Invoke behavior and human acceptance open. Production behavior and
all eight promise statuses retain their prior scope.

## Retained evidence

The exact run is `runs/anima-negative-invoke-control/20261118-r1` in the artifact
root. It retains the CPU evidence, preflight import failures, three PNGs, native
mask and scheduler observations, exact source and input pins in
`native-contract.json`, and the blind key, per-engine counts and assessment.
Native execution uses the original denoiser source on pinned shared dependencies.
An independent read-only audit rehashed the 51 source and 102 input pins and
verified the original method binding, all three mask/Heun receipts and decoded
RGB, ICC and physical process exit. It used retained evidence without doing
another trained run. The two owned raw import/cache and short scratch paths
were removed after exit and dependency verification. The compacted payload
archive has four entries and SHA-256
`cb20b4d36569bbbd03ebfb0cd09ce6933bd7e0ca95f705058382d03f19661fad`.
