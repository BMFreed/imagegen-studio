# Anima exact model qualification and offline loaders

Base: clean `d22e6fc9b207f9c82da315d80afc0672019565eb`, 05.10.2026.
High risk at exact resource/file identity and ML loading boundaries. This is a
Phase 2C foundation for PP-004/005/008, not an Anima generation capability.
Sources: managed-model library, worker/runtime contracts and Phase 2C roadmap.
The existing explicit Anima Generate refusal and worker 0.10.0 stay unchanged.

## Confirmed owners and source

Main already installs custom Anima checkpoints with linked pinned Qwen3/VAE,
but returns no detached component bundle and only qualifies SDXL generation.
Installation tests use sparse companion stand-ins; they do not prove ML loading.
Python owns tensor loading and conversion. Runtime owns packages/config/tokenizers,
and its baseline self-test must not require user model weights.

InvokeAI snapshot `9e1540962bcca7f8fa668d7d8e02cf79d75fda3b` supports the original
28-block Anima topology. New Qwen3.5/connector variants are not this companion
profile. Anima uses rectified flow, no SDXL prediction type. Its Qwen Image VAE
loads into native **AutoencoderKLWan**, not AutoencoderKLQwenImage.

Confirmed CPU meta-model comparisons against existing local files match:
567 converted Cosmos backbone parameters, 118 Anima conditioner parameters,
310 Qwen3 parameters and 194 Wan VAE parameters, with no missing/extra/shaped
mismatch. Pinned Diffusers 0.40.0 contains CosmosTransformer3DModel,
AnimaTextConditioner and in-memory Cosmos/Wan converters. Reuse those APIs;
do not copy Invoke's 1,073-line transformer or add einops for this foundation.

The existing local Qwen3 and VAE bytes were fully SHA-256 checked against the
manifest. Renamed basenames do not change their identity. The sanitized reference
header retains only tensor descriptors, no display or training metadata.

## Boundary and invariants

```text
Exact saved Anima Project reference
 -> Main repository + linked companion roles/source/family/hash/size
 -> current regular managed-file hashes + complete bounded checkpoint header
 -> detached Anima Base 1.0 bundle
 -> Python exact snapshots + native meta architecture/converters
 -> complete keys/shapes/dtypes/finite checks + strict actual loading
```

The bundle is internal preparation data, not a new `.igs` field or queue/IPC
command. Captured references are detached before awaits; Default cannot replace
them. Main accepts compatible custom checkpoint topology without a checkpoint
SHA allowlist. Companion identity stays pinned. Trusted constructor collaborators
permit small real-files/SQLite tests without substituting the resolver itself;
those tests do not establish official artifact hashes or native ML loading.

Python loads in memory using explicit native configs: no Hub/config discovery,
remote code or network fallback. Unknown/missing/mixed model keys and unsupported
topologies fail. Only documented bundle prefixes and regenerable exporter
buffers may be excluded; exclusions cannot remove required parameters. Exact
hash/size, canonical paths, no symlinks/nonregular files, complete model state,
finite source/converted/loaded tensors and absence of meta parameters are checks.
Structure does not prove training lineage or quality.

## Parameters and refusal

The header ceiling is the existing **32 MiB** safetensors qualification ceiling.
The original transformer has **685 tensors / 2,091,068,928 parameters**:
4,182,137,856 bytes at BF16/F16, double at FP32. Bounds for full snapshots derive
from native component schemas, supported element widths and documented export
overhead; they are not VRAM or model-quality promises. CUDA/inference capacity is
outside this CPU loader foundation.

Wrong identities, role/source/family, size/hash changes, missing/unsafe files,
invalid layout/shape/dtype, non-finite values and strict-load failures return
errors and create no queue row/candidate. Files, current Project/Undo/seed and
saved `.igs` remain owned by existing flows. Missing files use existing repair;
incompatible weights require a compatible model, never silent fallback.

## Verification plan

Obtain behavioral RED through real ModelService/SQLite before implementation.
Test original/unprefixed/bundled headers, compatible custom identities, wrong
family/shape/keys, offsets/dtypes, dependency roles/source/family/pins, actual
same-size file corruption and captured-reference stability. Native CPU loader
tests use real native constructors/converters and exact safetensors snapshots;
separate small trusted architecture fixtures from the default full topology.
Run isolated semantic mutations and restored greens for critical refusals.
Execute full app checks, Python checks and appropriate retained Electron paths.
Record executed boundaries and evidence below before commit/push.

The TS profile is reproducible with `scripts/generate-anima-checkpoint-profile.py`
using the pinned native inference environment and `worker-python/src` on
`PYTHONPATH`. It constructs native models on meta and compares every converted
reference key/shape before writing the 685-key header profile. The checked-in
8,260-byte gzip fixture contains only tensor descriptors, not weights/metadata.

Mandatory Anima weighting, tokenizer qualification, conditioning/denoising,
LoRA, queue/Retry/dispatch/provenance and release runtime remain subsequent work.
No `anima-*` ready capability or public promise completion is claimed here.

## Execution evidence and remaining gaps

Local evidence is retained under
`~/.codex/artifacts/imagegen-studio/anima-qualification-2026-10-05/`.
The independent code review was informed by this foundation scope, not a blind
user-flow audit. It reproduced acceptance of an unknown branch ending in
`.inv_freq`; Main and Python now exclude exact known rotary/position keys instead
of arbitrary suffixes. Matching exporter controls and unknown-branch refusals
cover the correction. Author self-review checks the remaining consumers and
confirms no generation/readiness route was added.

- Header RED: six tests executed before the Anima implementation; three failed
  through the actual inspector because the old SDXL qualifier required a UNet.
  Final bounded header suite: **6/6**, no skips; original, `net.` and bundled
  `model.diffusion_model.` forms, required key/shape and descriptor/payload guards.
- Exact Main resolver: **41/41**, no skips, through real ModelService,
  repository, SQLite and actual temporary bytes/hashes. Small tests replace only
  the trusted expected companion pins and checkpoint qualifier. They cover
  detached inputs, saved/source/link identity, role/family/hash/size and changes
  during awaits; production defaults are verified separately below.
  Initial missing-entrypoint RED executed **1 test, 1 failure** (`TypeError`);
  its durable record is a labeled transcription of the original tool output.
  This demonstrates feature absence, not invalid-file behavioral sensitivity.
- Main semantic mutations: **5/5 killed** (final rereads, saved hash, dependency
  source, pinned size, caller alias); isolated baseline/restored **41/41**.
  Header semantic mutations: **8/8 killed** (completeness, same-numel shape,
  contiguous offsets, duplicate JSON, inherited key, symlink, payload coverage,
  broad derived suffix); isolated baseline/restored **6/6**. Mutation failures
  are expected refusal assertions, not import/syntax/setup failures.
- Python focused native loader suite: **58/58**, no skips. Tests exercise actual
  pinned constructors, conversion, strict loading and native state values using
  scaled architecture fixtures; captured full-size schema digests separately
  qualify the default topology. Initial preimplementation collection failed
  because the module did not exist (**0 tests executed**); the labeled retained
  transcription is setup-absence evidence, not a behavioral RED claim.
  Behavioral sensitivity comes from **7 isolated semantic mutations**: SHA,
  size, full schema keys/shapes, source finite values, cast overflow and unknown
  derived branch. All seven fail intended assertions; baseline/restored focused
  controls **7/7**. The schema mutants preserve eventual native-load failure but
  lose the deliberate `GENERATION_MODEL_UNSUPPORTED` structural refusal, so
  their wrong-code assertions do not imply successful invalid-model loading.
  A preceding combined omission of both redundant trainable finite guards also
  failed its NaN refusal assertion, with its restored control passing; it is
  recorded separately, not counted as two independent mutations.
- Real default-profile Main probe: **passed**, 14.944 s, actual 4,182,275,752-byte
  custom checkpoint and exact pinned 1,192,135,096-byte Qwen3 and 253,806,246-byte
  VAE. A temporary real SQLite registry returned the exact linked bundle while
  the existing generation plan still returned `MODEL_FAMILY_UNSUPPORTED`.
  Source stat identities remained unchanged. CivitAI IDs were fixture registry
  identities; this did not exercise live installation or token/keyring storage.
- Real default-profile Python probe: **passed**, offline CPU BF16, 20.722 s,
  peak process RSS 9,003,696 KiB. Full trained weights loaded strictly into
  Cosmos **567**, conditioner **118**, Qwen3 **310** and Wan VAE **194** state
  tensors; no meta tensors, all CPU/eval, no network connection attempts and
  unchanged source stat identities. This is loading evidence, not model output
  quality, conditioning/denoising, VAE decoding or Linux/NVIDIA generation.
- App regression: **1130/1130**, no skips. Full typecheck and repository ESLint
  pass; fresh build and all **seven Electron smoke suites** pass. Those retain
  controlled-peer UI/IPC/storage coverage for existing Illustrious paths; they
  do not run an Anima job. Prototype components are unchanged.
- Full Python regression on final files: **452/452**, no skips, in the qualified
  native CPU environment. Exact package versions are checked; missing PEFT
  0.21.2 was provided only through a temporary package directory/interpreter,
  leaving both existing environments unchanged. Default Pillow-only worker
  environment: **265 passed / 187 skipped**, no failures; absence of native ML
  packages causes those recorded skips. Ruff format/lint and BasedPyright pass
  over all 31 worker source/test files. Auxiliary profile generator Ruff checks
  and affected-file Prettier checks pass. CPU checks do not qualify the release
  runtime or GPU inference. Python loader/mutation artifacts are retained in
  `~/.codex/artifacts/imagegen-studio/anima-loader-2026-10-05/`;
  full regression/environment reports are in this slice's `worker-checks/`.

The native environment also has torchvision. Diffusers Cosmos forward calls its
resize API for the padding mask, although the loader itself does not need it.
The extra tiny native forward test explicitly skips without torchvision; the
first denoising slice must qualify this dependency or a tested equivalent before
advertising Anima inference. No dependency was silently added to this loader
checkpoint. Mandatory weighting/compiler/tokenizers, actual conditioning and
denoising, LoRA, frozen job/Retry/dispatch/provenance, release packaging and model
caching remain open. Public PP-004/005/008 and Phase 2C remain incomplete.
