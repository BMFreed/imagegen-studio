# Source-anchored Illustrious regional reference utility

Application base `37ee67d81725ecc118a9938173bceeaa6ad4bbdf`. The earlier
[reference utility experiment](./phase-4-regional-reference-utility-research.md)
failed its ordinary TXT scene controls. A subsequent 1024px trial remained
inconclusive and the [common-runtime CLIP comparison](./phase-4-ordinary-invoke-conditioning-research.md)
found exact equality for that prompt. The present experiment asks whether an
opaque source gives a stable geometry control for reference-guided recoloring.
It addresses IMG utility for one fixed case. The causes of the old TXT outcomes
remain unresolved.

## Source and owned path

Re-read clean InvokeAI `4875d96531ca6712b288f6e660fcbb34143408c1`.
`frontend/webv2/src/features/generation/core/graph.ts::buildSDGraph` provides
the base SD graph. `core/canvas/compileCanvasGraph.ts::graftImageToImage`
encodes the composited source at denoising size and sets the range from strength.
`core/canvas/addRegionalGuidance.ts::addRegionalGuidance` preserves the original
reference, its owning mask, method, weight and range in the `ip_adapter` graph.
`invokeai/app/invocations/sd/ip_adapter.py::IPAdapterInvocation.invoke` resolves
the checkpoint's ViT-H encoder and adapter. `sd/denoise_latents.py` prepares
image embeddings before acquiring the large model, then attaches the preprocessed
mask to the adapter data. `backend/stable_diffusion/diffusion/shared_invokeai_diffusion.py`
passes the per-step scales, masks and signed image embeddings into attention.
`unet_attention_patcher.py::apply_ip_adapter_attention` owns the temporary
processors and restores the original processors on exit.

The engineering runner reuses the installed Python and worker from the
[signed engine checkpoint](./phase-5-packaged-installed-engine-research.md).
Its private Project and database use the real Raster and reference imports,
Save/reopen, capture, preparation and installed request transport. The signed
slot has LaMa. The existing regional resource verifier reads the exact adapter
and ViT-H group from the protected shared store. No weights or environment
copies are needed. This diagnostic uses a direct Main/worker path. AppImage
UI admission, durable queue publication and shipping Setup are outside its scope.

## Frozen controls

The exact official Illustrious XL v0.1 checkpoint is SHA-256
`3e15ba00387db678ab4a099f75771c4f5ac67fda9e7100a01d263eaf30145aa9`.
The retained red and blue reference cards have the same geometry, alpha and
sRGB ICC. Exactly 66,870 fill pixels differ, from RGB `(210,40,36)` to
`(28,94,214)`. The opaque source substitutes `(128,128,128)` at exactly those
positions and preserves every other RGBA value. Each job uses the same source,
512×512 bbox at `(0,0)`, seed 123, Euler/Normal 30, strength 0.5, CFG 5,
Rescale 0, embedded FP16 VAE and the same global text. The IMG window is
expected to contain 16 steps on the leading Euler grid. No LoRA or TI is used.

The ordinary Project recipe is authored with `regions: []`. Both reference
recipes use the same full-coverage image-only owner. The intended difference
within the pair is the reference image. The preregistered visual gate requires
all three images to retain a coherent centered head, front pose, two ears and
two eyes. The ordinary head must have no clearly dominant saturated red or blue.
The regional outputs must make the head visibly red and blue respectively.
Background-only or accessory color fails. Ambiguity is inconclusive. The
reference pair can establish recoloring in this fixed case. The full-cover mask
does not test spatial confinement. Review writes neutral observations before key
reveal, with fixed source-defined head and background ROIs as corroboration.

## Native result

The preregistration has SHA-256
`1ce6ffa37e50e465308a83162cf06c6ccee1b6564b14e98048d3939ad174dfab`.
All three calls used the exact opaque source PNG with SHA-256
`636c9337dd4fcf0afdd5d0f4b0c2756f410f9e11bbdd3f77dd74a879b31b68e7`.
The requests share their image, settings and model. After accounting for
document revision, temporary paths and reference identity, the regional pair
also shares its mask, text coverage and generation recipe. Both Project
reference assets decode to the corresponding source card. The 77 installed file
pins and 17 signed configuration pins verify before and after execution.

Mechanical execution passed. Three workers completed 16 progress events each
and physically exited. The aggregate cgroup completed in 120.936 s with a
12 GiB limit, zero allowed swap and no OOM events. Its peak was 5,829,619,712
bytes, including file cache. The RTX 4080 with driver `615.71.09` reported the
following maximum readings for the exact worker PIDs at one-second sampling.

| Case      | Matched GPU samples | Highest VRAM reading |
| --------- | ------------------: | -------------------: |
| Ordinary  |                  18 |            8,168 MiB |
| Red card  |                  32 |            8,852 MiB |
| Blue card |                  32 |            8,460 MiB |

## Visual result · NOT_QUALIFIED

An independent observer viewed only the three randomly numbered original PNGs.
The first descriptions recorded the head, eyes, ears, background, contour and
color before the case mapping was revealed. Root then inspected the same PNGs.
All three preserve the centered frontal head, two ears and two eyes. They show
small contour artifacts, especially the ordinary control. The ordinary head
remains sufficiently neutral for the control to pass.

| Case      | Visible head fill | Geometry | Recolor criterion    |
| --------- | ----------------- | -------- | -------------------- |
| Ordinary  | Olive-gray        | PASS     | Neutral control PASS |
| Red card  | Muted mauve-gray  | PASS     | FAIL                 |
| Blue card | Muted slate-gray  | PASS     | FAIL                 |

Each output differs in decoded pixels. In the 51,878-pixel head core, zero
pixels in any case have red or blue at least 30 code values above both other
channels. The red-card mean is `(116.66,113.72,121.48)` and the blue-card mean
is `(104.89,108.37,117.09)`. The largest visible change is a muted hue shift.
That fails the preregistered goal of a visibly red versus visibly blue head.
The source resolves the geometry control for this one seed. Utility across
scenes, spatial confinement, capacity and human acceptance remain open.
All eight product promises stay **«Пока не обещать»**.

## Evidence and checks

The seven focused files passed 128 tests, with zero failures and zero skips.
Typecheck, production build and scoped ESLint/formatting/diff checks passed.
The build emitted its chunk size warning. The new runner is in the normal app
typecheck. A separate read-only audit verified all 27 `.igs` members, the PNGs,
resource and source pins, cgroup receipts, and the closed private SQLite. The
private DB has 25 tables and 30 migrations. Integrity and foreign keys pass, and
generation, acceptance and install tables are empty. Request receipts retain
the base job and captured regional input. The temporary serialized regional
wire payload and individual CUDA samples are outside the retained readback.

All three original outputs, source, masks, contract, saved Projects,
captured targets, worker requests and receipts, blind key and visual findings
are retained under `runs/regional-reference-img-utility/20261118-r1` in the
artifact root. `retained-payloads.tar.gz` preserves 24 verified owned payload
entries with SHA-256
`3c9d5a0f8a50ef83219418515f0e0964acdf154cf0c694f565bdf2e66ba6c199`.
After process exit and dependency checks, removing the four raw Project,
native scratch, cache and compilation scratch directories reclaimed about
11.8 MiB after retention.
