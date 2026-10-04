# External Illustrious VAE inference

## Scope and revision

Base `b88119815eb20eeb1a6852c59d6138722d3cacd7`, clean `master`.
This high-risk Phase 2C checkpoint connects the existing exact Illustrious VAE
selection to both normal generation modes. Sources are PP-004/005/008 in
[Product promises](../product-promises.md), the
[managed library contract](../contracts/managed-model-library.md),
[generation settings](../features/project/generate-mode/generation-settings.md)
and [provenance](../features/project/generate-mode/generation-provenance.md).
It does not qualify Anima alternatives, CLIP Skip, embeddings, partial-alpha
outpaint or the complete release runtime.

## Confirmed baseline and technical qualification

The preceding resource/authoring checkpoint installs, verifies, selects and
relinks an exact VAE, but normal preparation and the renderer refuse inference.
Worker 0.8.0 loads the checkpoint's embedded VAE and already applies precision
and non-finite guards to real encode/decode. Accepted v1 records have optional
precision, but no applied VAE resource. Installed size/hash and a CivitAI base
label alone cannot prove successful loading or distinguish all SD1/SDXL
training/scaling semantics.

Confirmed: Invoke `9e1540962bcca7f8fa668d7d8e02cf79d75fda3b` routes the selected
VAE to normal encoding/decoding. Pinned Diffusers 0.40 accepts complete standalone
unprefixed original LDM or native Diffusers AutoencoderKL tensors through its
public `from_single_file` with explicit offline `vae` config. Main screens bounded
header anchors, supported floating dtypes and contiguous offsets; this is not
complete ML loading. Python converts with the pinned native converter and checks
all keys/shapes/dtypes/finite values against an actual meta-device native model.
The SDXL profile has 248 tensors and 83,653,863 elements; its maximum FP32 payload
is 334,615,452 bytes plus the existing bounded header. Source metadata cannot
replace pinned scaling `0.13025` or force-upcast policy. A native FP16 load that
overflows is rejected. Same-shaped SD1 training cannot be identified from these
weights alone; applicable source labels and explicit execution config are
independent evidence. Both formats were loaded with actual full-size weights.

## Boundary map and invariants

```text
Project exact VAE → main registry + byte/profile verification
→ detached normal preparation → strict worker DTO + durable queue
→ exact revalidation at Retry/dispatch → selected native VAE encode/decode
→ verified staging → explicit Add → portable provenance → Save/reopen/comparison
```

- Every new normal preparation records an explicit embedded choice (`null`) or
  the exact verified external VAE metadata/path/size/hash. Historical omission
  remains operational embedded, but is not invented as known provenance.
- A queued attempt and Retry never read a newer Project selection or library
  Default. Context and worker payload must agree. File replacement, missing
  bytes, unsupported structures and unavailable worker capability fail clearly.
- Main owns paths/hashes; renderer still sends resource/version IDs only.
  Unknown worker profiles fail closed. Older qualified workers can retain
  embedded behavior without receiving unsupported fields; external choices
  require the explicitly qualified new capability.
- External VAE governs both txt2img decoding and img2img encoding/decoding.
  Precision and finite guards follow the selected VAE, preserving existing
  scheduler, LoRA, prompts, seed and checkpoint behavior.
- Accepted `generationConfiguration.vae` is optional exact portable VAE or
  null, never a local file path. Omission means unavailable; explicit null means
  embedded. Comparison uses exact resource identity and actual local binding,
  preserving saved metadata and distinguishing missing resources.
- Failure does not publish success pixels, mutate the Project or fabricate
  provenance. Queue diagnostics permit repairing the exact file and Retry;
  resetting to Embedded changes only future admissions.

## Verification and alternatives

Do not silently ignore a selected VAE, reuse a mutable default, widen generic
SDXL checkpoint support or infer architecture compatibility from file size.
Use the pinned public AutoencoderKL loader with an explicit supported
configuration rather than a custom VAE implementation or remote loader fallback.

Execute real resource filesystem/SQLite qualification, preparation/queue/Retry
and worker transport tests with mismatched/tampered neighbors. Execute the
actual pinned loader and encode/decode on CPU and Linux/NVIDIA where available,
separating tiny fixtures, real model bytes and controlled JSONL peers. Acceptance
must traverse staging/provenance/Save/reopen and comparison. Native Electron
checks use fresh bundles and inspect screenshots; controlled peers do not prove
ML loading. Run isolated semantic mutations of the significant guards, restored
green baselines, required typecheck/lint/build and the relevant app checks.

## Execution evidence

Artifacts are retained under
`/home/user/.codex/artifacts/imagegen-studio/external-vae-inference-2026-10-04/`.
This is scoped implementation/self-review; no blind product audit or release
runtime certification is claimed. The final delivery seal records source,
bundle and command hashes.

- Main app suite: **979 passed, 0 failed, 0 skipped**. Models execute 140,
  frozen-pipeline focused checks 265 and portable/provenance/UI-helper checks 46;
  these sets overlap the aggregate and must not be added to it. Main boundary
  coverage includes real filesystem/SQLite, Prepare, publication, immutable
  batch/Retry/dispatch, changed/missing bytes, strict context/wire agreement,
  staging recovery, explicit Add and `.igs` Save/reopen. Model transport and
  small header/weight bytes are fixtures, not live CivitAI installation evidence.
- **38 isolated Main/portable semantic mutations detected**: 15 resource,
  15 frozen pipeline and 8 portable/capability rules. Baselines and restored
  checks are green, and assertion failures are retained. The original resource
  local-version equality-removal trial was equivalent because lookup already
  resolves that exact ID; it is retained separately and not counted as a kill.
  An initial malformed legacy mutation crashed rather than changing the intended
  value; the valid null-invention mutation replaced it and is assertion-red.
- Native Generate/Queue scenario: **35 checks, 51 PNGs, 15 viewport measurements,
  0 page errors** on the final fresh bundle. Real renderer/preload/Main and
  durable storage preserve external VAE through selected version, Default
  change, later Reset/precision edit, Cancel/Retry, Add/Save/reopen and read-only
  comparison. A new opaque accepted Raster produces an actual img2img queue
  attempt with the same exact VAE. The qualified 0.9 JSONL peer validates exact
  path/size/hash but substitutes ML/composition/output pixels.
- Six relevant final PNGs were actually opened at 1380×900 and 900×620;
  selected/reset controls and bounded comparison remain reachable. Root also
  inspected the compact selected and comparison images. The first visual pass
  found a genuine stale caption claiming Embedded while external VAE was selected.
  Conditional copy and final native assertions now distinguish both states.
  A final integration correction evaluates the external-VAE capability message
  after runtime/blocked/closed/preparing notices, preserving actionable engine
  repair/restart instructions instead of masking them with a capability warning.
  This is a local VAE check, not a full accessibility or long-name audit.
- Actual pinned public loader uses full-size VAE weights extracted locally from
  `bismuthIllustrious_v80`; original LDM/native copies have identical loaded
  tensors, pinned scaling and finite 32px CPU encode/decode. This proves loading
  these actual bytes, not a live standalone CivitAI download or all VAE families.
- Actual qualified Python JSONL worker on RTX 4080 executes **six serial GPU
  cases**: embedded/exact/altered txt2img and embedded/exact/altered img2img at
  strength 0. The source is 256×256, seed 42, two txt2img steps. Exact external
  weights reproduce Embedded pixels in both modes; deliberate encoder/decoder
  bias changes alter pixels in both. Every PNG has exact dimensions and pinned
  sRGB ICC. This is a causal integration control, not quality or capacity evidence.

- Full pinned Python suite: **334 passed, 0 failed, 0 skipped**; Pillow-only
  protocol compatibility separately executes 47 checks. Tiny native CPU models
  verify both external formats, actual encode/decode with all precision policies,
  NaN refusal and no success pixels. The checked-in JSONL lifetime regression
  uses actual native VAE/UNet/CLIP/Compel pipelines with the heavyweight checkpoint
  loader and CUDA/startup qualification substituted; previous genuine pipeline
  weak references must be dead before the next load/terminal response.
- **14 isolated Python semantic mutations detected**, including removal of
  completed-request collection; baselines and restored runs are green. Together
  with the 38 Main/portable mutations, **52 non-equivalent mutations** produce
  actual assertion failures. Counts describe the executed invariants, not
  coverage of every possible defect.
- Native neighboring desktop, Results/acceptance, saved accepted-history (14
  checks), comparison (7 checks) and older qualified 0.8 VAE authoring (10 checks)
  pass. The last refuses external VAE before composition/enqueue and preserves
  exact authoring/repair/relink. These native runs and the 35-check generation
  scenario cover all six existing app-smoke scripts; the aggregate package
  command was not run as a single invocation. Final generation/0.8 runs use the
  final renderer; earlier unaffected neighbors use the same final Main/preload.
- Required typecheck, lint, build, scoped formatting, Python Ruff/format and
  basedpyright pass. **331 local documentation targets** exist. No prototype UI
  was changed. Source/bundle freshness and exact command outcomes are retained
  in the final delivery seal.

## Findings, failures and recovery

A serial worker probe exposed an actual lifetime defect: an unreachable native
pipeline with provided external VAE remained alive after its inference frame
returned, retaining 7,063,113,728 allocated GPU bytes. On the sixth request, CLIP
transfer failed with CUDA OOM. A measured neighboring `gc.collect()` makes the
weak reference dead and reduces allocated memory to 8,519,680 bytes. Python JSONL
now collects unreachable objects after `process_inference_request` returns and
before emitting the terminal response or accepting another job. Live objects
remain owned; CUDA cache is reused, not forcibly emptied. The uninstrumented
six-case final run passes. Main's ordinary per-job lease closes its inference
child; the retention finding specifically exercises the supported persistent
Python JSONL process. It is not evidence for a new maximum VRAM budget.

The first GPU harness wrongly treated a progress line as a terminal result.
The reader now validates/drains progress before checking the terminal response;
that failure and the later genuine OOM have separate retained reports. The first
native extension reached 34 checks but then correctly found Generate disabled:
the newly opaque fixture had no Denoising Strength. Reopen also restores the
editor's default iteration count. The harness now sets strength and iterations
through real UI with observable draft/input checks; the final assertions remain
strict. The old-peer harness also initially matched an obsolete error fragment
and later encountered two legitimate missing-VAE messages (control and action
bar). It now checks the exact authoritative error and scopes the local warning
explicitly to VAE settings. Those two partial failures are retained separately;
no behavioral queue/refusal assertion was removed. A new Retry unit fixture
likewise left a dynamic negative prompt active
and produced two jobs; it now explicitly uses the intended single concrete
negative prompt. These fixture failures are not counted as passing runs.

File/profile/capability failures leave the Project and explicit saved file
untouched. Repair the exact managed version before Retry, or reset to Embedded
for future generation. Worker non-finite errors publish no successful candidate.
Recovery/acceptance/Save keep their existing boundaries. Anima alternatives,
embeddings, other modes, Smart Patch, result-to-preset and release installation
remain open. PP-004/005/008 matrix and bodies record this scoped evidence together,
retaining **Пока не обещать** and incomplete Phase 2B/2C status.
