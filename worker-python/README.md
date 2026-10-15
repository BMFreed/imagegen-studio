# ImageGen Studio Python worker

This package contains the Phase 2A image-import/derivative subprocess and a **separate, narrow development inference entrypoint**. The default `python -I -m imagegen_worker` stays version `0.1.0`, `derivatives-only`, with Pillow-only default dependencies and no generation capability. There is no packaged Linux/NVIDIA inference runtime or installer yet; this package alone must not satisfy the production runtime activation gate.

The [normal outpaint foundation](../docs/engineering/phase-2c-outpaint-conditioning-research.md)
adds internal `outpaint_conditioning` and `lama_infill` helpers. Exact Invoke
Gaussian weighted maximum/fade masks consume copied RGBA and explicit Main
policy; a hash-bound local TorchScript loader performs LaMa infill without
downloads. OpenCV headless5.0.0.93 is pinned only in the inference extra.
These helpers feed the explicit outpaint commands introduced in worker `0.12.0`
described below; public mixed-alpha Generate remains closed.
The [internal Illustrious masked adapter](../docs/engineering/phase-2c-illustrious-outpaint-research.md)
adds `sdxl_outpaint`: the existing native img2img loop captures original latents,
one CPU noise draw and the selected schedule. Mandatory callbacks restore
protected source before each subsequent model/scheduler evaluation and before
final decode, even without a progress listener. The initial five schedulers and both
prediction types have native CPU oracle tests; a separate trained CUDA script
checks the internal path. The [internal Anima adapter](../docs/engineering/phase-2c-anima-outpaint-research.md)
adds `generate_anima_outpaint` through the existing six-method flow executor,
with a request-local original/noise/mask closure. The threshold uses inverse-shifted
linear time; protected source uses shifted sigma. Restoration follows completed
user steps, skipping Heun predictors. Weighted prompts, LoRA and seeded streams
use the shared path. The [internal execution checkpoint](../docs/engineering/phase-2c-outpaint-execution-research.md)
connects both adapters to strict worker commands, distinct ready capabilities and
exclusive RGBA contribution publication. Public mixed-alpha Generate/Retry,
first-setup LaMa installation and installed/release qualification remain open.

Run locally with the app-managed development Python selected by `.python-version`:

```bash
uv sync --locked
uv run python -I -m imagegen_worker
uv run ruff format --check src tests
uv run ruff check src tests
uv run basedpyright src tests
uv run pytest
```

The worker is long-lived. It writes one JSON object per line to stdout and reads one command per line from stdin. Stdout carries protocol messages only. It emits `ready` immediately with `protocolVersion: "1"`, `workerVersion: "0.1.0"`, `pythonVersion`, `runtimeProfile: "derivatives-only"`, and `capabilities: ["image-derivatives", "import-normalization", "preview-composition", "resource-preview", "self-test", "target-composition", "smart-patch-preparation", "smart-patch-fade", "smart-patch-conditioning", "smart-patch-model-source", "smart-patch-output-composition"]`. Main must reject incompatible versions/profiles, require the operation's capability before dispatch and impose its own startup/request deadlines.

The five executable image-operation command shapes are:

```json
{"type":"self-test","protocolVersion":"1","requestId":"check-1"}
{"type":"derive-image","protocolVersion":"1","requestId":"preview-1","input":{"path":"/absolute/immutable/visible-composite.png","sha256":"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef","colorSpace":"srgb"},"output":{"stagingRoot":"/absolute/app-managed/staging","mergedPngPath":"/absolute/app-managed/staging/preview/merged.png","thumbnailWebpPath":"/absolute/app-managed/staging/preview/thumbnail.webp"},"thumbnailMaxSide":256}
{"type":"normalize-import","protocolVersion":"1","requestId":"import-1","input":{"path":"/absolute/imported/source.png","sha256":"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"},"output":{"stagingRoot":"/absolute/app-managed/staging","normalizedPngPath":"/absolute/app-managed/staging/layer.png","originalIccPath":"/absolute/app-managed/staging/original.icc"}}
{"type":"compose-preview","protocolVersion":"1","requestId":"compose-1","layers":[{"path":"/absolute/frozen/layer.png","sha256":"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef","width":1024,"height":1024,"opacity":1,"blendMode":"normal","transform":{"x":0,"y":0,"scaleX":1,"scaleY":1,"rotationDegrees":0}}],"output":{"stagingRoot":"/absolute/app-managed/staging","mergedPngPath":"/absolute/app-managed/staging/preview/merged.png","thumbnailWebpPath":"/absolute/app-managed/staging/preview/thumbnail.webp"},"thumbnailMaxSide":256}
{"type":"compose-target","protocolVersion":"1","requestId":"target-1","layers":[{"path":"/absolute/frozen/layer.png","sha256":"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef","width":1024,"height":1024,"opacity":1,"blendMode":"normal","transform":{"x":0,"y":0,"scaleX":1,"scaleY":1,"rotationDegrees":0}}],"bbox":{"x":0,"y":0,"width":1024,"height":1024},"output":{"stagingRoot":"/absolute/app-managed/staging","targetPngPath":"/absolute/app-managed/staging/target.png"}}
```

`self-test-result` confirms only Pillow PNG/WebP round trips and an sRGB ICC transform. `derivative-done` carries `requestId`, `protocolVersion`, and `merged`/`thumbnail` metadata `{byteSize,width,height,sha256,colorSpace:"srgb"}`. `import-done` carries `sourceFormat: "PNG" | "JPEG" | "WEBP"`, `normalized` image metadata of the same shape, and `originalIcc: {byteSize,sha256} | null`. Main already knows the nominated paths and must inspect/validate actual output before publication. `error` carries `requestId` (or `null` for malformed input), `code`, and safe `message`. No command writes `.igs` or SQLite or publishes final Project assets.

`preview-done` carries `status: "rendered" | "empty"`, `rect: {x,y,width,height} | null` in integer world coordinates, and `merged`/`thumbnail` artifact metadata or `null` for an empty result. Main supplies visible, nonzero-opacity layers top-first. The worker checks each source's SHA-256, declared dimensions and PNG/WebP format. Untagged source RGB pixels follow the `.igs` v1 sRGB rule; an embedded ICC must be the pinned sRGB profile, and PNG color chunks must be sRGB-compatible. Both preview outputs always embed the pinned sRGB profile. The worker composes bottom-to-top using source-over, multiply, screen or overlay with layer opacity, scale and rotation; fully transparent pixels do not enlarge the preview rect. An empty preview writes no output files. Main supplies a unique staging directory and makes the decision to store an empty placeholder in the `.igs`.

`target-done` carries `mode: "txt2img" | "outpaint" | "img2img"`, the exact requested world-space bbox as `rect`, and `composite` metadata `{byteSize,width,height,sha256,colorSpace:"srgb"}`. `compose-target` uses the same frozen top-first raster layer shape and verification as `compose-preview`, but always writes an exact-size, 8-bit RGBA sRGB PNG for the finite bbox, including transparent pixels. It does not crop or downsample. Final alpha determines the mode: all zero is `txt2img`, all 255 is `img2img`, and any other coverage (including partial alpha) is `outpaint`. Even an empty layer stack writes a transparent target PNG. The provisional limit is 2,048 pixels per side and 4 million target pixels; exceeding either returns `IMAGE_TOO_LARGE` before publication. This command is a raster-only generation-input foundation; it does not enqueue a job, implement masks or Smart Patch, perform inference, or mutate `.igs`.

The default parser also recognizes the versioned `generate-illustrious-txt2img` request described in the [worker contract](../docs/specs/05-worker-protocol.md) and the [request research note](../docs/engineering/phase-2b-illustrious-request-research.md). It retains every validated field in a typed command, but the **default derivatives entrypoint still returns `INFERENCE_UNAVAILABLE` before filesystem access**. The DTO bounds an 8-aligned bbox, UTF-8 prompts (16 KiB each), CFG (1–30), Steps (1–200), uint32 seed, supported Invoke scheduler key, exact model/target metadata and distinct main-nominated PNG paths. These are provisional operational/transport bounds, not model limits.

## Qualified inference development entrypoint

The separate [Anima loader foundation](../docs/engineering/phase-2c-anima-qualification-research.md)
in `inference_anima.py` loads the original Anima Base 1.0 checkpoint and exact
pinned Qwen3/VAE companions offline. It uses native CosmosTransformer3DModel,
AnimaTextConditioner, Qwen3Model and **AutoencoderKLWan**, explicit local configs,
verified immutable safetensors snapshots and complete strict native state
checks. Unknown model branches, unsafe paths, changed identities, non-finite
weights or loading overflow fail. Small native CPU tests and a separate real
trained-weight default-profile CPU load qualify this loader boundary only.
It adds no denoising, job request, ready capability or Generate route;
Anima generation remains explicitly unavailable. InvokeAI source
snapshot and exact evidence are recorded in the research note.

The separate [Anima conditioning foundation](../docs/engineering/phase-2c-anima-conditioning-research.md)
adds strict `anima-prompt-weighting-v1` validation, exact bundled local Qwen3/T5
tokenizers and `encode_anima_conditioning_pair` in `anima_conditioning.py`.
The TS compiler owns syntax; Python encodes cleaned text and maps complete T5
offsets to character weights, applying them once after the native adapter.
Both signs, Unicode, special tokens, truncation and precision/finite guards
have native tests and semantic mutations; a separate trained-weight CPU probe
confirms conditioning behavior. Asset licenses/notice ship in the wheel.
This conditioning checkpoint itself added no Anima worker command/capability.
Subsequent Euler, LoRA and six-method foundations reach the qualified worker 0.11
entrypoint below; family-aware editor handoff, queue/Retry/provenance and release
runtime remain open.

The [Anima Euler foundation](../docs/engineering/phase-2c-anima-euler-research.md)
adds `generate_anima_euler` in `anima_euler.py`, consuming TS's immutable
`anima-euler-denoising-v1` plan. It performs the original raw-sigma Euler/CFG loop,
native Wan posterior sampling and per-channel encode/decode normalization, with
scoped pre-clamp finite guards and odd-latent zero padding/cropping. Source pixels
normalize in F32 before casting. Independent CPU seed streams, including the
versioned img2img posterior seed, preserve replay and strength-one txt2img noise.
Strength zero uses only VAE encode/decode. The helper returns exact-size sRGB
pixels; it does not publish a candidate, update a Project or expose a command.
The optional inference extra now pins torchvision 0.22.1, needed by native Cosmos
padding-mask resize, and the helper checks that version. Pillow-only defaults
remain unchanged. Native tests and real trained RTX 4080 controls qualify
256×256/three-step execution separately from UI/queue or release readiness.
Other Anima schedulers, LoRA, advanced options, cache/tiling memory management
and full output-size/release qualification remain pending before admission.

`python -I -m imagegen_worker.inference_main` is a distinct JSON-lines process. It sends `ready` only after Linux, Python 3.12, NVIDIA CUDA, exact tested dependency versions and an **explicit, complete local** SDXL config pass startup qualification. Set `IGS_SDXL_CONFIG_DIR` to a directory containing the pinned component configuration from [`stabilityai/stable-diffusion-xl-base-1.0` revision `462165984030d82259a11f4367a4eed129e94a7b`](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/tree/462165984030d82259a11f4367a4eed129e94a7b). The worker checks the complete 17-file set and each SHA-256 before ready, again before every job and after single-file loading. Extra files, including tokenizer overrides, are rejected. These files are **not** bundled; the runtime installer must deliver them after the distribution/licensing decision. Missing/changed config, missing packages, incompatible versions or unavailable CUDA means exit code 78 without a `ready` message.

The tested dependency gate includes Torch `2.7.1` (CUDA build), Diffusers `0.40.0`, Transformers `5.5.4`, Accelerate `1.14.0`, safetensors `0.8.0`, torchsde `0.2.6`, Compel `2.4.0`, Pillow `12.2.0`, torchvision `0.22.1`, tokenizers `0.22.2`, NumPy `2.5.3` and OpenCV headless `5.0.0.93`. `uv.lock` pins an optional `inference` extra; the default derivative environment remains Pillow-only. Development inference uses `uv sync --locked --extra inference`. Release deployment still needs a verified app-owned Python/CUDA wheelhouse and exact installed-package check. The entrypoint forces Hugging Face and Transformers offline mode, supplies the verified local directory as `config=` to `StableDiffusionXLPipeline.from_single_file`, and passes `local_files_only=True`. This avoids Diffusers' possible network fallback when no explicit local config is supplied.

Inference worker `0.10.0` adds `illustrious-embeddings` for both qualified normal modes. Optional `job.embeddings` is `{positive:[{token,path,sha256,byteSize}],negative:[...]}`; omitted input remains neutral for older ordinary jobs. Only standalone safetensors with exactly `clip_l` and `clip_g` tensors are qualified: full widths 768/1280, paired one-dimensional singleton vectors or `[N,width]`, matching N from 1 to 300 and F16/BF16/F32. Metadata is inert. Single-encoder embeddings, pickle/bin files, other tensor names, partial or extra states and non-finite tensors fail explicitly. A bounded no-follow snapshot validates the exact declared hash/size, header, contiguous payload, shape and per-prompt active-vector budget before native loading; each file is read once even when both signs refer to it. Native loading receives verified in-memory tensors rather than reopening paths, validates finiteness again after the encoder dtype conversion and checks that every loaded row survived unchanged.

Literal matching is case-sensitive, observes ASCII word boundaries at word-like literal edges and selects longer overlapping literals first. Every effective binding must occur in its sign's concrete prompt, and one literal cannot select two files within the same sign. The same literal can bind different files across positive and negative prompts. Worker-only aliases avoid both tokenizer vocabulary and normalized original text collisions; they never replace saved text or returned provenance. Both public encoder loaders receive tensor lists once, and Compel's textual-inversion manager expands all vector IDs without Invoke's 75-position truncation. Before either encoder runs, both signs pass the actual pinned Compel parser and sentence/weight/token chunker; repetitions plus ordinary text must fit four 77-position chunks (up to 300 content positions). All expanded vectors preserve attention weights. CLIP hidden conditioning retains every accepted chunk; pinned native CLIP2 pooled conditioning uses its first 77-token window, as in the preceding normal-mode pipeline. These are operational limits, not model capacity claims. Anima embedding inference is not qualified.

Inference worker `0.9.0` advertises `illustrious-external-vae` in addition to the previous normal-mode capabilities. `job.vae` is either null for Embedded or `{path,sha256,byteSize}` for an exact managed standalone VAE; absent legacy input remains Embedded. The worker reads one canonical, no-follow, hash/size-verified safetensors snapshot. Only standalone native Diffusers or unprefixed original LDM encoder/decoder/quantization tensors are qualified. Pinned native conversion must preserve every tensor and match the complete native AutoencoderKL key set and shapes; mixed naming, partial states, ignored extras, unsupported dtypes, non-finite tensors and FP16 loading overflow fail explicitly with no successful candidate. The public `AutoencoderKL.from_single_file` receives the verified tensor dictionary and the pinned local `vae` config, and its returned module is supplied as `vae=` to the public normal-mode pipeline loader. Both img2img encoding and both modes' decoding therefore use that exact module, including the existing Auto/FP16/FP32 policy and finite-output hooks. Safetensors metadata cannot override SDXL scaling (`0.13025`) or the native Auto force-upcast policy. Structural matching does not infer model training lineage; main owns source applicability. The bounded snapshot permits 32 MiB of header plus at most the actual native state element count times four bytes (334,615,452 tensor bytes for the pinned SDXL architecture), not an arbitrary larger VAE. Alternative Anima VAE loading remains outside this checkpoint.

The JSONL loop explicitly collects unreachable Python cycles after a request processor returns and before publishing its terminal response. This prevents dead native pipelines from retaining GPU tensors across sequential requests in one child, while preserving live ownership and the CUDA allocator's reusable cache. This is a worker lifetime guarantee; it does not promise an application model cache, release packaging or a maximum supported GPU resolution.

Worker `0.13.0` adds `illustrious-euler` for ordinary Illustrious/NoobAI Euler in
txt2img, opaque img2img and existing normal outpaint. The strict wire key `euler`
constructs the pinned native `EulerDiscreteScheduler` with the frozen prediction
type; `euler_a` retains `EulerAncestralDiscreteScheduler`. Startup requires both
classes before advertising inference. Anima's flow Euler remains separate.
In the `0.13.0` boundary the existing scheduler config is preserved; that
checkpoint added no zero-SNR override, timestep-spacing override or automatic
interpretation of checkpoint markers.
Real CPU solver tests compare the production-selected first Euler step to an
independent ODE equation, preserve deterministic replay, distinguish ancestral
noise, and exercise source/strength/progress and protected-source restoration.
These tests do not establish trained-model quality or the author's full recipe;
current execution evidence is recorded in the
[Euler research note](../docs/engineering/phase-2c-euler-research.md).

Worker `0.14.0` adds `illustrious-noise-profile`. The optional strict
`job.sampling.noiseProfile` object has exactly `schemaVersion:1`,
`baseSchedule:"sdxl-scaled-linear-v1"`, boolean `rescaleBetasZeroSnr` and
`timestepSpacing:"leading"|"linspace"|"trailing"`. A present malformed or partial
profile refuses; absence retains the historical loader-scheduler configuration.
The named profile fixes 1000 training timesteps, scaled-linear betas from
0.00085 to 0.012 and steps offset 1. The worker constructs that base explicitly,
uses the frozen checkpoint prediction type, and applies the requested rescale
and spacing through the pinned native scheduler. Loader-specific trained betas,
alternate sigma policies and offsets cannot replace captured profile semantics.
Main owns exact SHA/size policy and its assumed-versus-manual labels; the worker
does not infer a profile from NoobAI/CivitAI labels or checkpoint metadata.

Pinned DPM++ SDE has no native zero-terminal-SNR rescale implementation. Its
normal and Karras variants therefore refuse a true rescale profile with
`GENERATION_SAMPLING_UNSUPPORTED` before config/assets/LaMa/checkpoint loading;
false remains supported. Euler, Euler a and both DPM++ 2M variants use native
rescaling, including the finite terminal-alpha clamp. Spacing preserves each
method's native behavior: DPM++ 2M Karras derives its sigma grid from the full
training schedule, so spacing does not alter that grid. The control does not
introduce a second Karras algorithm or promise equivalent grids across methods.
Native CPU tests validate actual beta-derived alphas, sigmas, timesteps and
finite steps across both objectives and supported profile combinations, with
independent Euler-grid and zero-SNR equations. These tests do not establish the
full author recipe or trained CUDA output quality.

After qualification, `ready` has `workerVersion:"0.14.0"`, `runtimeProfile:"linux-nvidia"`, `capabilities:["illustrious-txt2img","target-composition","denoising-progress","candidate-thumbnails","illustrious-cfg-rescale","illustrious-img2img","illustrious-lora","illustrious-vae-precision","illustrious-external-vae","illustrious-embeddings","illustrious-outpaint","illustrious-euler","illustrious-noise-profile","smart-patch-execution"]`, `protocolVersion:"1"` and `pythonVersion`. On a GPU with native CUDA BF16, the same ready additionally advertises `anima-txt2img`, `anima-img2img`, `anima-lora`, `anima-prompt-weighting`, `anima-flow-sampling` and `anima-outpaint`; a false or failed BF16 probe withholds only those six capabilities. The accepted commands are `generate-illustrious-txt2img`, `generate-illustrious-img2img`, `generate-illustrious-outpaint`, `generate-anima-txt2img`, `generate-anima-img2img`, `generate-anima-outpaint`, `compose-target` and private `execute-smart-patch` DTOs. Anima requests independently require native BF16; there is no CPU/FP16 fallback. Target composition uses the existing strict parser and Pillow compositor in this same qualified child; it neither starts another worker nor bypasses startup qualification. Other derivative commands remain unavailable in this entrypoint. During Illustrious generation, the public Diffusers `callback_on_step_end` sends exact `{type:"generation-progress",protocolVersion:"1",requestId,step,totalSteps}` messages without requesting or changing tensors. `step` counts completed denoising evaluations from 1; `totalSteps` is the actual initialized scheduler timestep count, constant for the job and bounded by 400 and twice the requested Steps. The pinned second-order DPMSolverSDE scheduler has `2 * Steps - 1` evaluations. Progress does not include loading, conditioning, image decoding, PNG publication or main-process staging validation, so its final step is not candidate completion. `generation-done` returns its exact `requestId`, `protocolVersion:"1"`, the main-nominated `outputPath` and actual uint32 `seed`; errors return correlated safe `error` messages. Each protocol line is flushed immediately to the original binary stdout even while library output is redirected to stderr. Older app clients reject the new worker version during startup instead of receiving messages their terminal-only transport cannot parse. Cancellation remains process termination by main, not a worker cancel command.

### Private Smart Patch world output (CPU worker 0.1.0 source snapshot)

The [private world-output scope](../docs/engineering/phase-4-smart-patch-world-output-research.md)
adds `compose-smart-patch-output` / `smart-patch-output-composed` to the default
derivatives-only CPU entrypoint, requiring `smart-patch-output-composition`.
This marker is not an inference worker0.14.0 capability. Older CPU payloads without
it refuse before dispatch; no installed-runtime upgrade is implied.

The request carries verified processing RGB `image`, numeric world GENERATE
`contributionMask` and `output:{stagingRoot,pngPath}`. Each image reference is
`{path,sha256,byteSize,width,height}`. Inputs/output are distinct direct PNG children
of one canonical owned `0700` operation stage; the owned scratch base may retain `0775`.
Pillow BICUBIC resizes only generated RGB, then the already final world alpha is
attached unchanged. Identity-size RGB, including pixels under alpha0, is preserved.
No source pasteback, second fade, mask inversion or latent-mask reconstruction is
performed. Exclusive pinned-sRGB RGBA8 publication and inode-aware rollback retain
the existing input/output ownership contract.

The correlated reply contains `output:{byteSize,colorSpace:'srgb',height,sha256,width}`.
Main independently consumes actual RGBA/ICC/hash/dimensions and compares decoded
alpha exactly with its frozen final contribution mask. `capture.executeAndCompose`
returns detached `worldContribution`, placed using frozen `context.bbox`; no world
position enters the CPU wire request. Preparation, native inference, composition
and readback share one drained lease, including callback failure and unconfirmed
worker-exit retention. Existing `capture.execute` processing RGB stays unchanged.
No public Generate, durable job/queue/batch/candidate/receipt, accepted variant,
`.igs`/provenance/preset/Compare or UI change follows. Queue integration and
immutable acceptance remain next; checks and limits belong to the linked research.

### Previous private Smart Patch execution bridge (worker 0.14.0 source snapshot)

The [private execution bridge](../docs/engineering/phase-4-smart-patch-execution-bridge-research.md)
accepts frozen four-way world mode, independent internal resolution, prepared
RGB/null and exact numeric latent KEEP, plus family-specific verified resources
and one concrete prompt pair/uint32 seed. Existing native family loaders and
VAE/denoising execute without repeating source classification, LaMa or coherence;
all255 KEEP retains masked mode and fully protected latents. The correlated
`smart-patch-executed` reply describes an exclusively published processing RGB
PNG, which Main independently verifies and consumes inside the capture lease.
Process failure/timeout must confirm physical exit before cleanup; unconfirmed
exit retains staging, including after callback failure.

This capability belongs to the current source snapshot. An installed0.14.0
payload without `smart-patch-execution` is fenced before dispatch and is not
upgraded by these source changes. This private command creates no public
Generate action, dynamic expansion, actual-seed cursor update, durable job,
candidate/receipt/thumbnail, world contribution, accepted variant or `.igs` edit.
Executed evidence and qualification limits belong to the linked research note;
normal commands and the default CPU worker were unchanged at that checkpoint.
The later world-output scope above adds only private CPU composition.

### Internal outpaint commands (worker 0.12.0)

`generate-illustrious-outpaint` and `generate-anima-outpaint` are distinct outer
operations. Each extends its family's existing img2img job with strict
`conditioning` and local `infillResource` fields. Anima retains the captured
`anima-flow-denoising-v1` img2img plan and both compiled prompt signs unchanged;
outpaint does not introduce another solver or schedule.

Conditioning binds the bbox, source PNG/hash/byte size/dimensions/pinned ICC,
raw alpha8 keep-mask/hash/size/dimensions and fixed policy. Policy version `1`
requires edge radius `16`, fade distance `16`, minimum denoise `0`, LaMa infill,
`gaussian-weighted-max` mask blur and `contribution` output. The exact infill
resource is role `outpaint-infill`, size `205669692` and SHA-256
`344c77bbcb158f17dd143070d1e789f38a66c04202311ae3a258ef66667a9ea9`.
Its normalized absolute path must be distinct from every image/family resource
and cannot be a direct staging child. Main supplies its shared installed-resource path.

At execution, the worker reads the declared source size plus at most one overflow
sentinel through a regular no-follow descriptor, checks its hash and before/after
descriptor/path identity, validates the full PNG stream/CRC and independently
rederives the frozen raw alpha. Only mixed-alpha pinned-sRGB RGBA PNG is accepted.
The exact local LaMa snapshot loads and infills on CPU before any family model
loads; absent, changed, linked or nonregular files refuse without a download
fallback. The existing family masked executor receives the resulting RGB infill
and derived keep mask. Its RGB result becomes an RGBA contribution with faded
alpha, published exclusively with the pinned ICC and optional alpha-preserving
thumbnail. Ordinary txt2img/img2img continue to publish RGB.

This is an internal worker/Main execution and persistence checkpoint. Worker
completion remains provisional and does not itself accept a layer or Save a
project. Public mixed-alpha Generate/Retry, automatic first-setup LaMa delivery
and installed/release qualification remain closed.

### Qualified ordinary original Anima commands (worker 0.12.0)

[Worker entrypoint research](../docs/engineering/phase-2c-anima-worker-entrypoint-research.md)
and the [typed TS assembler](../src/shared/projects/anima-worker-request.ts)
define `generate-anima-txt2img` / `generate-anima-img2img` under protocol `1`.
Their exact `job` has `schemaVersion:1`, `model`, `bbox`, `target`, `prompts`,
`sampling`, `loras` and `output`. Model architecture is `anima-base-1.0`, with
three distinct exact checkpoint/Qwen3/VAE path/hash/size refs. The target is
pinned-sRGB RGBA PNG; fully transparent means txt2img and fully opaque means
img2img. Mixed alpha requires the distinct outpaint command described above.
Target/bbox/plan dimensions must agree.
Target and result are distinct normalized direct `.png` children of the nominated
staging root; every model/LoRA/image path is distinct. Extension-only basename
`.png` is rejected; hidden names such as `.source.png` remain valid.

TS compiles both concrete prompts to `anima-prompt-weighting-v1` and all six
native methods to `anima-flow-denoising-v1`. The latter captures the full selected
schedule, clipping, seed/posterior/step domains and actual evaluation count.
Python validates/captures those compiled values, loads the exact original native
bundle in CUDA BF16, applies ordered signed ordinary LoRAs and uses the existing
weighted flow image boundary. Raw prompts or duplicate sampling values, SD-only
advanced fields, embeddings and alternate VAE replacement are not wire fields.
Each JSONL request remains within 64 KiB including the terminal LF. Anima
progress uses the same message shape and captured actual plan evaluations, up to
399 for Heun; strength zero produces no denoising progress.

Source pixels come from one verified snapshot whose actual length and SHA-256
must match the captured target. Both families use the same exclusive provisional
PNG publisher and optional thumbnail policy. Success creates no SQLite job,
accepted layer, `.igs` record or durable candidate. The internal outpaint
checkpoint separately connects Main admission/dispatch/staging and portable
acceptance. Public mixed-alpha Generate/Retry, first-setup auxiliary installation
and installed/release qualification remain open; worker-only trained probes do
not establish full product readiness or quality.

The same inference child creates an optional candidate thumbnail from the exact sRGB RGB or RGBA image written to the required PNG, preserving contribution alpha. It copies the image, keeps its aspect ratio without upscaling, limits each side to 256 pixels, and encodes WebP at quality 80 with LANCZOS resampling and the pinned sRGB ICC profile. The deterministic provisional path is `command.output_path + ".thumb.webp"` (for example, `result.png.thumb.webp`). After a complete file write, a byte check of at most 256 KiB, exclusive publication and directory sync, `generation-done` may include `thumbnail:{outputPath,sha256,byteSize,width,height}`. It never replaces an existing cache path. Thumbnail encoding, size or filesystem failure suppresses that metadata and removes the worker's partial cache while preserving the completed full PNG and its normal `generation-done`. Main still validates all supplied metadata and owns eventual cache publication/cleanup. The optional thumbnail does not change frozen requests, queue state, candidate acceptance, `.igs`, or actual-seed behavior; full candidate PNGs remain authoritative.

Main can call `GenerationWorkerClient.composeTarget` before generation under one runtime lease. It uses the shared derivative-client target verifier for canonical staging/source paths, source hashes, exact bbox, actual PNG dimensions/hash/ICC and pixel-derived alpha mode. The client admits one composition or generation at a time, checks the correlated completion type, bounds both request and response lines, and retains the existing deadline/confirmed-exit policy. Missing `target-composition` refuses that operation before sending; the existing generation capability is still usable. A protocol/output mismatch or correlated worker error closes the inference transport. See the [target transport checkpoint](../docs/engineering/phase-2b-inference-target-composition.md) for evidence and remaining Generate/runtime gaps.

Ordinary Illustrious inference accepts a transparent target for txt2img or a fully opaque target for img2img, with an exact-hash pinned-sRGB PNG and a same-hash single-file checkpoint that main has already qualified as Illustrious. Mixed alpha requires the distinct internal outpaint command above. Img2img freezes denoising strength from 0 to 1; strength 0 performs the selected native VAE roundtrip without denoising, not pixel identity. The worker independently rehashes the checkpoint before and after loading, verifies target bytes/dimensions/ICC/alpha, and writes a pinned-sRGB RGB PNG exclusively at the main-nominated provisional path. Its scheduler matrix is explicit: `euler`, `euler_a`, `dpmpp_2m`, `dpmpp_2m_k`, `dpmpp_sde`, `dpmpp_sde_k` with `epsilon` or `v_prediction` frozen per checkpoint; parsed legacy `sample` is rejected before loading. The requested seed creates the initial latents and is returned as the actual seed. For `dpmpp_sde(_k)`, the Brownian noise sampler also uses the job's actual seed, as in Invoke's per-job override. Both prompt signs use Invoke's default SDXL original/target time IDs of 1024×1024 and zero crop, even when output dimensions differ; pixel parity against Invoke is not yet established.

The worker builds positive and negative embeddings independently for both SDXL CLIP encoders with Compel, including pooled CLIP2 output, weighted syntax, long prompts and zero embeddings for empty text. It translates common unambiguous `(tag:1.2)` weights to Compel's `(tag)1.2`; signed, exponent or ambiguous colon forms fail explicitly because Compel would not preserve the apparent weight. It also refuses unresolved resource, dynamic, compositional and LoRA markup; exact bound embedding literals are rewritten before this syntax check. A provisional four-chunk (4 × 77-token) ceiling bounds conditioning; it is not a model or Invoke capacity claim. Unequal positive/negative lengths are zero-padded; a scoped PyTorch UNet pre-hook passes the corresponding padding attention mask during the pinned Diffusers 0.40 SDXL call and removes itself afterward. A missing or mismatched UNet invocation fails explicitly. This verifies the padding boundary, not pixel parity with Invoke. The current DTO freezes ordinary Kohya LoRAs, CFG Rescale, VAE precision, external VAE and img2img strength; the internal outpaint command uses this captured family input. LoRAs use exact managed snapshots and complete native target qualification before public pinned PEFT loading; unsupported adapter algorithms fail explicitly. Regions, authored masks, reference images and workflow graphs remain outside this worker checkpoint, so it does not establish the full MVP pipeline. The worker reloads the exact checkpoint for every job; model caching and its performance remain unmeasured gaps. Public mixed-alpha Generate/Retry and release runtime remain closed.

Composition uses Pillow's affine resampling and 8-bit channel arithmetic. Pixel-edge antialiasing and rounding may differ by one channel value from the interactive Konva canvas. Preview rasters are at most 2,048 px on either side; `rect` continues to describe the world-space coverage when the image is downsampled. Very small visible content that cannot be represented at this bounded resolution is an explicit worker error, not an `empty` result. The worker decodes one layer at a time and rejects requests with more than 256 layers or 128 million aggregate source pixels. These are provisional safety guards, not measured product capacity. Main falls back to `preview.status=unavailable` for nonempty Projects when composition cannot complete.

`normalize-import` accepts frozen PNG, JPEG, or WebP bytes. If an ICC profile is embedded, the worker validates it, converts color pixels to sRGB with Pillow ImageCms using perceptual intent, preserves alpha, and writes **exact original ICC bytes** to the nominated `.icc` staging path. Main can then store those bytes as layer metadata in `.igs`; it must not convert image pixels itself. Untagged RGB, grayscale, and palette images are interpreted as sRGB; untagged CMYK is rejected. Malformed/oversized ICC profiles fail explicitly. The normalized PNG embeds the bundled sRGB ICC profile.

The worker bundles a fixed 588-byte `srgb.icc` instead of generating a profile at startup: lcms-generated profiles contain creation-time bytes and change hash. The package and main-process boundary pin SHA-256 `113f72e7a61626408bf3c95ddbb295aea396a2bbf7c8644b4f373994cc25a3b1`; an output with a different embedded ICC is rejected even if the worker reports `colorSpace: "srgb"`. The ICC header's declared profile length must match its embedded bytes, so a padded or malformed source profile fails before publication.

For `derive-image`, main must supply a frozen, canonical, absolute **pre-normalized sRGB** PNG composite and its SHA-256. The compositor must emit a profileless composite; this command refuses an embedded input ICC profile and does not transform pixel colors. Both derivative outputs embed the standard sRGB ICC profile. Both operations read a bounded source byte snapshot and reject a changed hash. Output paths must be distinct, nonexistent, canonical, have the proper extensions, and lie beneath an existing canonical staging root. The worker writes temporary files beside each target and publishes each with an exclusive hard link; a failed group is cleaned up. Main should allocate a unique staging directory per request and discard incomplete staging after a crash. A returned `derivative-done` or `import-done` is not a Save commit.

Provisional defensive ceilings are 64 KiB per command line, 256 MiB source file, 4 MiB embedded ICC profile, 16,384 pixels on either side, 64 million decoded pixels, and thumbnail side 32–1,024. They are implementation guards, **not** measured Project capacity or the final product limits. Source errors leave existing project files untouched. Main owns placeholder selection for empty Projects or unavailable worker, Save/recovery, timeouts/cancellation, and cleanup of staging after process crashes.

The non-sRGB test fixture `tests/fixtures/AdobeRGB1998.icc` comes from the `colord-data` profile set (`data/profiles/*`, Richard Hughes, CC0-1.0); its SHA-256 is `59b0418391ee14b5edc84ece59a51bedbfc10ef912cf038490c2bd0ff48fd1da`.
