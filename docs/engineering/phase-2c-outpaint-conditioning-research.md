# Normal outpaint: alpha conditioning and local LaMa foundation

Research base: `11e4b90df9d684f87eb347390756322cee44555a`, clean `master`,
06.10.2026. Internal high-risk foundation for PP-005/007/008, without a new
public Generate capability or a completed phase.

## Contract and actual sources

[Generation actions](../features/project/generate-mode/generation-actions.md)
derive normal outpaint from the final raster composite's alpha: all alpha0
means txt2img, all alpha255 means img2img, everything else means outpaint.
Uniform alpha128, layer opacity and resampling retain this approved rule,
which is stricter than Invoke's current zero/nonzero classification.

Reference: `~/Work/sources/InvokeAI`, exact commit
`9e1540962bcca7f8fa668d7d8e02cf79d75fda3b`. Shared Canvas graph
`features/nodes/util/graph/generation/addOutpaint.ts` is called by both SDXL
and Anima builders. SDXL denotes the Illustrious architecture, not a new
supported product family. Actual defaults come from controlLayers `types.ts`
and `canvasSettingsSlice.ts`, not the generic infill invocation's default.

Frozen normal policy: LaMa, Gaussian coherence radius16px, minimum denoise0,
output fade16px and output-only-masked-regions. Alpha is the fractional keep
mask: white keeps, black generates. Only LaMa's mask is binary: every alpha
below255 is a hole. No authored mask, region, specialized inpaint checkpoint
or optional Anima LLLite adapter is required or introduced here.

`create_gradient_mask.py` downsamples alpha with PIL BILINEAR to the /8 grid.
Its Gaussian coherence is a circular **weighted maximum filter**, not blur or
convolution. Radius16 becomes2 latent pixels; uint8 truncation precedes the
keep<255 support mask and NEAREST upsampling. `ExpandMaskWithFadeInvocation`
uses OpenCV DIST_L2 maskSize5 and the upstream cubic polynomial inside the
16px fade band. Beyond it the keep mask remains exactly255, avoiding alpha1
leakage. OpenCV headless5.0.0.93 is pinned in the inference extra with the
existing NumPy graph; the default dependency profile remains Pillow-only.

## Preservation and owners

Preservation means no implicit overwrite of source assets, transforms, layers
or bbox. It does **not** require retaining every originally opaque seam pixel:
coherence/fade intentionally allows a transition over that seam. Normal output
is generated RGB with inverted faded keep mask as alpha: a separate RGBA
contribution. Future explicit Add creates a Raster at the frozen bbox; far
transparent pixels preserve the underlying composition. Infilled RGB is VAE
conditioning, not a document edit or a source for paste-back.

Main's internal `freezeAlphaOutpaintConditioning` copies the already verified
target PNG/bbox, decodes owned raw alpha8, checks target SHA and freezes target,
mask, policy and pinned shared LaMa identities. It publishes no queue job or
portable record. Returned buffers are detached copies, not immutable objects;
future materialization must verify their hashes again. Normal conditioning
requires dimensions divisible by8. Generic compositor decoding retains its
original geometry; internal minimum8 does not change public inference minimum64.
Existing bounded composition ceilings are guardrails, not measured capacity.

Python copies actual PIL RGBA and owns numerical/ML execution. `load_local_lama`
requires a canonical local file and exact SHA/size, captures a regular no-follow
descriptor with before/after identity checks, then loads verified bytes as
TorchScript. No discovery, download or fallback. Missing/changed weights and
nonfinite or wrong-shaped model output fail explicitly. This internal loader
is neither a Main installer nor an advertised worker capability.

Measured asset: [Sanster/models add_big_lama](https://github.com/Sanster/models/releases/tag/add_big_lama),
asset49462813, `big-lama.pt`, **205,669,692bytes**,
SHA256 `344c77bbcb158f17dd143070d1e789f38a66c04202311ae3a258ef66667a9ea9`.
GitHub API supplied size but no digest; the hash was measured from downloaded
bytes. The shared Main manifest pins this identity. The accepted
[first-engine setup decision](../specs/07-python-runtime-management.md#общие-вспомогательные-веса-для-outpaint)
still requires upfront total size and Main-owned download/cache/verification.
No installer or installed auxiliary registry is delivered here. The LaMa
source repository provides Apache2.0 licensing; a research download alone does
not establish a release redistribution/license package for converted weights.
Retain source, conversion origin and weight attribution for first-engine delivery.

## Execution boundaries and next slices

Mixed-alpha Generate still refuses both families. Durable queue/staging and
portable provenance support four txt2img/opaque img2img kinds; the current
publisher converts output to RGB. Removing the preparation refusal alone
would fail admission or destroy contribution alpha. Infilling is insufficient.

The subsequent [Illustrious masked checkpoint](./phase-2c-illustrious-outpaint-research.md)
implements native execution with original infilled latents, one noise tensor,
protected noised-source restoration before both model and scheduler evaluation,
progressive generation-mask thresholds and final protected restoration before
VAE. Its callbacks prepare the next actual timestep and preserve the default
old Invoke mask polarity, including FP16 arithmetic ordering. That checkpoint
has separate CPU oracle and trained CUDA evidence; this foundation's evidence
table below still describes conditioning only.
The subsequent [Anima masked checkpoint](./phase-2c-anima-outpaint-research.md)
implements shifted sigma for source/noise mixture, inverse-shifted linear time
for thresholds and merge after a completed user step including Heun. Its
six-method numerical and trained evidence is recorded separately; this
foundation's evidence does not prove denoising or public integration.

Before activation, extend frozen/durable jobs, auxiliary materialization/Retry,
worker capability/transport, RGBA publication/staging and portable provenance/
comparison together. Prove temporary-only completion, explicit Add, original
layer preservation, recovery and Save/reopen through installed trained execution.
First-engine LaMa delivery and release install/repair remain separate gates.
Authored masks, Regional Guidance and Smart Patch stay phase4; regions do not
enter provenance. PP-005/007/008 readiness is unchanged.

## Evidence plan

- Real PNG decoder/factory: filters0–4, partial alpha, detached bytes/bbox,
  exact identities/policy, malformed/grid inputs and neighboring modes.
- Actual PIL conditioning/contribution compared with executed methods from
  external pinned Invoke sources; source preservation and fade cutoff checked
  independently. Tests do not reconstruct their algorithm oracle internally.
- Real local TorchScript IO with an explicitly synthetic fixture. Separate
  trained CPU smoke enters Main's factory, consumes its policy/resource and
  compares LaMa pixels with the external Invoke wrapper. Neither proves diffusion.
- Executed isolated semantic mutations for mask polarity, soft alpha, source
  alias/hash/defaults, maximum filtering, fade cutoff and output alpha; restored
  controls. Existing public mixed-alpha refusal remains tested.
- App/Python regression, TS typecheck/lint/build and Python format/lint/types.
  No UI changes or modification of the installed application runtime.

Executed results are recorded below after verification.

## Executed evidence

Artifact root:
`~/.codex/artifacts/imagegen-studio/outpaint-conditioning-2026-10-06/`.
These checks inspect the implementation tree based on the research commit;
the final evidence manifest records delivered source hashes and commit.

| Boundary                         | Executed result                                                                                                                                                                                                    | Limit                                                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Main decoder/factory             | 60/60 focused tests; combined actual target-transport, CPU Project preparation and Anima preparation 154/154, no skips                                                                                             | Internal snapshot; queue/provenance not extended                                                                  |
| Python conditioning/local loader | 45/45 focused tests; 12 exact comparisons against external pinned Invoke methods                                                                                                                                   | TorchScript fixture proves loader/forward IO, not trained quality                                                 |
| Trained local LaMa CPU           | 3/3 binary/soft-edge/uniform-soft cases; exact pixel equality with external Invoke LaMa, repeat equality, Main-derived policy/resource and alpha-mask SHA, unchanged source and correct RGBA core/fade/far support | Synthetic source, 256×128, CPU; no diffusion, UI, durable publication, installed runtime or quality qualification |
| Isolated mutations               | 14/14 detected: five TS and nine Python; restored controls 60/60 and 45/45                                                                                                                                         | Sensitivity of actual tests, not a completeness proof                                                             |
| Regression                       | App1671/1671, Python818/818, zero failed/skipped                                                                                                                                                                   | Real storage/CPU/tiny native ML; existing controlled inference fixtures remain controlled                         |
| Static/build                     | Full TS typecheck/lint/app build; Python Ruff format/check and BasedPyright including trained smoke                                                                                                                | Development dependencies, not an installed-release update                                                         |

Logs: `app-tests.log`, `python-tests-final.log`, `mutation-report.json`,
`trained-cpu-delivery/report.json`, `typecheck.log`, `lint.log`, `build.log`,
`python-lint.log`, `python-format.log`, `python-types.log`, `smoke-types.log`.
The source-aware peer review found no numerical/polarity blocker and identified
Main/Python grid agreement and modified-source NOTICE.
Both were addressed; root review also corrected Python capture to use the
same target side/pixel ceilings as Main, with two boundary tests and mutation kills; this was not a blind or executed peer audit.

Observed inherited limitation: an otherwise opaque128×128 source with a single
alpha254 pixel downsamples to all255 on the latent grid; its contribution mask
is therefore fully transparent. This is a concrete property of the source
algorithm, not a bug repaired by silently changing Invoke's default policy.
Tiny soft coverage and future empty-support job handling require explicit
qualification when masked inference is enabled.

Interim tooling failures are retained separately from green evidence: Ruff
invoked from repository root did not honor the worker-relative vendor exclusion,
so it reported unchanged byte-exact ER-SDE source. Running the documented checks
from `worker-python` preserves that exclusion. Strict checks also caught the
new smoke's import ordering, whitespace and untyped external-device/JIT seam;
these were corrected without weakening checks or altering numerical assertions.
Existing TorchSDE float-boundary warnings in the full suite remain warnings.

The subsequent [internal frozen jobs checkpoint](./phase-2c-outpaint-jobs-research.md)
adds durable mixed-alpha inputs, internal atomic admission/Retry and Main's pinned
shared LaMa resolver. Public dispatch, RGBA publication/portable provenance and
auxiliary installation remain open; this does not change the earlier numerical
evidence or public readiness.
