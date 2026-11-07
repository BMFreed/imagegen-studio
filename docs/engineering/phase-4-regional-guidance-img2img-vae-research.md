# Private prepared-VAE regional img2img

Base: `afa0aca7f4b93a3890d27538811b6aaf40668db2`.
This slice adds a private image-encoding consumer for a caller-prepared VAE.
Public regional IMG still requires Embedded FP16. No worker capability, Main
admission, UI, queue, schema or defaults change here.

## InvokeAI mechanism and confirmed gap

Current local source: `a61ac4fb75bec78d92885bf39bcf3ed3900a9bdd`.
`generation/core/canvas/compileCanvasGraph.ts` grafts the selected VAE into image
encoding; `generation/core/graph.ts` and `app/invocations/model.py` own selection.
`app/invocations/vae/image_to_latents.py::vae_encode` converts the original
preprocessed image to the VAE compute dtype, calls original encode/posterior,
multiplies by scaling_factor, then casts the latent. `vae/latents_to_image.py`
casts the final latent before inverse scaling and original decode.

Studio already has exact selected-VAE snapshots, owned precision preparation,
borrowed state validation and Invoke-based decode. Its ordinary IMG factory
uses native prepare_latents; with force_upcast it changes the VAE dtype and
restores it to the denoiser dtype. That cannot preserve a borrowed FP32 VAE.
The new scoped adaptation binds prepare_latents only on a fresh wrapper and
calls the same native encoder/distribution directly, without recasting VAE
storage or changing configuration during borrowing. The existing independent
frozen CPU posterior-generator clone is retained, rather than Invoke's unseeded
sample. This is the established Studio determinism adaptation, not whole-Invoke
image-byte parity. The ordinary image factory is unchanged.

## Finite contract and ownership

Private CUDA profiles:

- `ordinary-canvas-euler-img2img-cuda-vae-v1`
- `ordinary-canvas-euler-ancestral-img2img-cuda-vae-v1`
- `ordinary-canvas-dpmpp-2m-img2img-cuda-vae-v1` (Normal/Karras)

The caller loads and prepares its owned Embedded/selected VAE through the
existing prepare_owned_regional_vae before the borrowed baseline. Auto uses the
loaded native policy; manual FP16/FP32 are explicit. UNet/text stay CUDA FP16.
The source stays FP32 until conversion directly to VAE dtype. Sampled latents
are scaled in VAE dtype BEFORE conversion to denoiser dtype; final denoiser
latents convert to VAE dtype BEFORE inverse scaling/decode. Initial compute-dtype
noise uses the untouched frozen CPU generator and original scheduler.add_noise.
The original selected strength window and native loop remain their owners.
Strength0 performs VAE encode/decode, without noise, UNet steps or fake progress.

One RGB image, epsilon, steps1..200, strength0..1, existing CFG/rescale,
geometry, text, resource, row and mask ceilings remain. Native untiled/unsliced
AutoencoderKL and its qualified module classes are required; offload, method
shadows, stateful substitutes and latent mean/std normalization refuse.
Selected checkpoint-to-live-component association remains a caller precondition.
VAE payload validation keeps its334,615,452-byte FP32-equivalent bound and
8Mi-element finite scans. No weight copy/rollback, cache, fallback or allocator
release promise is added. Source/latent/output tensors and library workspaces
are additional; these bounds are not measured VRAM/RSS capacity.

## Qualification plan and limits

Native small fixtures cover all precision policies, representative schedulers,
source/scale/decode cast ordering, selected resources, real exclusive PNG output,
ordinary FP16 control, source storage/config/RNG preservation and failure/fresh
recovery. Assertions must inspect original consumed values after actual PNG.
An isolated early latent-half-cast mutation must turn the FP32 target semantic
RED while the legacy FP16 control stays GREEN, then restore exactly.

A finite trained probe reuses the official Illustrious v0.1 and compatible
locked native test runtime and canonical offline configuration with Python-authored complete recipes at104x72: FP32 strength0,
FP32 strength.5, exact repeat and legacy FP16 control. No new genuine Main,
loading-fidelity, installed worker/public IMG or visual-quality qualification
is implied. There is no model/runtime copy or in-place installed-worker refresh.
Serial lower units retain3GiB/zero swap/600s; trained execution12GiB/zero swap/
600s with an explicit .75 CUDA allocator setting, not a capacity promise.

Evidence: artifact-relative
`runs/regional-guidance-img2img-vae/20261107-prepared-encode`.
Execution, independent source/data review and physical release will be recorded
separately. Public selected/FP32 IMG is the next owner after this prerequisite.
PP-001/005/007/008 remain **«Пока не обещать»**; Regional Guidance stays excluded
from accepted provenance, Compare and result-derived presets.


## Executed qualification

ROOT records **551 PASS /619 warnings**, zero failures/errors/skips in the
accepted fresh units:212 legacy IMG;45 new CUDA cases split16/15/14;51 existing
VAE matrix/refusals split18/33;238 public-worker/protocol/TXT-DPM neighbors;
four trained calls and one record-only aggregate. Intentional deselections
partition the suites without omissions. Strict Python reports0 errors/0 warnings;
scoped Ruff/format and AST checks pass. No TypeScript/Vue or UI implementation
changed, so no new Main/browser qualification is claimed.

Two combined native attempts hit the unchanged3GiB test-process ceiling and are
excluded. Fresh serial units partition the same cases within that ceiling.
The first matrix substring selector also selected invalid-encoder cases; one
new test omitted the frontend OutputError from its expected exception tuple.
The exact error class was added, preserving PROFILE_INVALID and no-native
assertions. Production behavior was unchanged; corrected45case coverage passes.

Independent source review is **CLEAN** across1515 baseline/1517 current members,
seven deltas/two additions, including the disclosed exact-class correction.
Ordinary image factory, public worker and Ready bytes remain baseline-exact.

The isolated early-latent-cast mutation runs **six selections:five GREEN /one
semantic RED**. A finite native PNG is published before the source-consumption
assertion detects scaling after FP16 rounding; legacy FP16 stays GREEN.
Restored source returns both GREEN, and all1517 source-copy/live bytes match
the phase manifest. This is a small native consumption mutation, not a trained
checkpoint mutation or a quality judgment.

The trained probe passes **five selections in75.52s** (76.952s bounded), using
one production checkpoint load and four private output calls at104x72. FP32
strength0 performs one encode/decode without noise/UNet/steps. FP32 strength.5,
its repeat and legacy FP16 consume exactly `[334,1]`: six UNet/Euler transitions
and420 original cross-attention site observations in total. All four calls
record zero borrowed VAE casts. Full source values/storage/metadata, global RNG,
method slots and reservation state are streamed and preserved.

Every published RGB byte matches independent quantization of its original
native PT result; the FP32 repeat is exact. FP32 versus legacy FP16 changes
**16,622 RGB channels /7,341 pixels**. This is the combined encoder/decoder
precision-policy contrast, not isolated encoder causality or visual acceptance.
Python-authored complete recipes and existing canonical builders are explicit;
there is no new Main capture, checkpoint-conversion fidelity witness, installed
worker refresh or public selected/FP32 IMG admission.

The existing installed runtime lacks pytest. ROOT therefore uses the existing
locked developer/native test environment, whose torch/torchvision/diffusers/
transformers/Compel/safetensors/Pillow versions match the canonical environment,
with its verified offline config and original checkpoint. No dependency is
installed or environment/model copied. The trained process explicitly sets
CUDA allocator fraction .75; recorded peaks are finite-run observations, not
a general capacity guarantee.

## Retention and handoff

Source archives, commands, all attempts, native/model-source pins, exact inputs/
PNGs, mutation/rollback and resource records are retained separately from bulky
scratch. The old Python builder source is pinned/copied and its dependency
linked reciprocally. Final retained-byte review and ROOT physical release are
recorded separately after all readers and processes end. Protected canonical
runtime/catalog/config/checkpoint and repository test environment remain.
Public selected-VAE/FP32 IMG wiring is the next separate owner.


Final retained-source/document/data review is independently **CLEAN**: all4502
entries (3039 files,1340 directories,123 literal symlinks),1517 source files,
705 local-import references and all native/mutation inputs/outputs close.
Independent PNG comparison confirms the trained repeat/combined precision
contrast; small-native mutation additionally changes99 target RGBA channels,
with exact control and restoration. This is retained-data verification, not
an independent native rerun or public-readiness certification.

ROOT separately confirms all15 bounded interpreter units exited with empty
recorded cgroups, exact source restoration, all five child tasks/readers ended,
255 lifecycle records and zero incoming disposable-child dependencies. The
private trained process and native fixtures remain in their bounded interpreter
groups; there is no separate Electron/installed-worker lifetime in this slice.
Only the exact owned payload tree is disposed: **50,290,688 allocated bytes**
reclaimed in the deletion-only interval. Protected runtimes, original model,
config/catalog, old builder and prior evidence remain.

All raw required bytes survive in `retained-payloads.tar.gz` (12,339,230 bytes),
SHA-256 `64cf19bcc036ae8e21ac50d806d41ed2e86d1ac1378d304f00357fa43d39259d`.
Historical raw paths now identify archived entries. Lifecycle is `retained`,
`payloads:[]`; source archives, manifests, commands and verdicts remain live.
This physical release is ROOT evidence under the authorized artifact lifecycle.
