# Phase 2C: Illustrious LoRA

## Scope and risk

Continue Phase 2C from clean `master` at
`912aba9a3fd582ea26dcf5e414fd4d6ff5c3b1a5`.
[PP-005](../product-promises.md#pp-005-принятый-результат-хранит-настройки-генерации),
PP-008 and the [LoRA contract](../features/project/generate-mode/lora-selector.md)
require exact resources, frozen generation inputs and immutable accepted settings.
This is high risk: model-file qualification, worker transport, durable queue/Retry
and portable result metadata change together.

The bounded slice applies ordinary Kohya LoRA to Illustrious txt2img and opaque
img2img. Standard UNet and both text-encoder targets are included; SGM and
Diffusers UNet naming need explicit qualification. Anima and other adapter
algorithms remain separate work. Unsupported files must fail explicitly before
enqueue rather than lose unrecognized tensors silently.

## Confirmed before implementation

- Project already persists exact installed versions, enabled state and finite
  signed weights. Newly added rows have weight 0.7. Default changes never replace
  an existing ref. Unknown-family and missing entries remain usable for authoring.
  Generate currently rejects every enabled LoRA.
- The prototype freezes the whole configured stack, including disabled entries.
  Preserve this reusable configuration in provenance. Operational inputs are a
  separately verified enabled subset, in the same order. A disabled missing file
  must not be opened or block inference. Enabled weight 0 remains an enabled,
  verified resource; it is not a disabled row.
- Exact resource verification already checks regular managed files, size and SHA.
  It does not establish adapter algorithm, target modules or tensor dimensions.
  Header qualification must precede enqueue; Python independently checks actual
  converted tensors against the loaded modules before applying them.
- Pinned Diffusers 0.40.0 requires PEFT for native SDXL LoRA loading. Existing
  inference pins and the local Invoke environment contain no PEFT. An isolated
  `peft==0.21.2` installation imports with the existing pinned Torch 2.7.1,
  Transformers 5.5.4, Accelerate 1.14.0 and Safetensors 0.8.0.
- An executed CPU research probe loaded native adapters into seven real modules:
  UNet attention and 3×3 convolutions, plus both CLIP attention and MLP layers.
  Weights 0, 1, -0.5, 0.0001 and 1e-10 preserve their native scale and agree with
  the closed-form low-rank update. Fusion/unfusion/unload controls also pass.
  This establishes an API choice, not full generation readiness.
- Local Digital Art Illustrious weights contain ordinary Kohya UNet/CLIP1/CLIP2
  pairs and alpha tensors. Another local file with a plausible artistic name is
  actually Anima. Names are not compatibility evidence.
- Diffusers' pinned SGM mapper drops SGM keys when mixed naming is detected.
  Reject such files instead of relying on that lossy branch.

## Owned path and invariants

Project stack -> frozen draft/target -> exact installed file and bounded header
qualification -> typed preparation -> request/batch admission -> durable queue
-> qualified worker 0.7.0 -> native adapters before text conditioning and
denoising -> verified staging -> explicit Add -> full copied stack in immutable
provenance -> explicit Save/reopen and read-only comparison.

New contexts record both `loraStack` and the verified enabled `loras`, even when
empty; strict validation checks their identity/weight/order agreement. Historical
absence means unknown configuration, not a recorded empty stack. Worker requests
carry only actual enabled resources, exact path/hash/size and weight. Empty new
wire fields may be removed from a disposable request for a qualified older peer;
nonempty adapters require the new capability. Frozen storage remains unchanged.

Reverify exact files at materialization/admission/Retry/dispatch and in Python.
No default/version substitution or mutable Project read may alter a queued job.
Portable metadata contains copied resource identity, enabled state and weight,
never managed paths. Disabled references retain the draft's portable string IDs;
their missing state must not make Add fail. Regional Guidance stays excluded.

## Parameters and failure coverage

- Existing document bounds: 10,000 resource entries and 16 MiB project JSON are
  defensive archive ceilings, not measured inference capacity.
- Existing request line limit 64 KiB and stored-payload limit 128 KiB continue to
  bound each job; full stack and enabled subset count toward these limits.
  No unsupported claim of a measured maximum number of simultaneous adapters.
- Use the existing 32 MiB safetensors header ceiling. Verify descriptor dtype,
  sizes, offsets, pair/rank/target shapes and complete recognized key coverage.
  Reused parameter values need refusal tests, not a new arbitrary adapter limit.
- Authoring accepts finite signed weights. Native floating-point inference can
  underflow very small updates or fail for extreme magnitudes; successful
  finite output remains required. Do not clamp or silently rewrite the draft.
- Missing/corrupt/exchanged files, incompatible family, unsupported algorithm or
  naming, active duplicates and old capabilities are explicit refusals. Late
  draft/default edits, worker failure, Cancel and Retry preserve the original
  queued stack and leave `.igs` unchanged until explicit acceptance/Save.

## Verification plan

Use actual bounded safetensors files, model SQLite registry and queue entry
points; add neighboring disabled/zero/negative/duplicate/legacy controls. Verify
Retry and accepted metadata through Add and the real `.igs` loader. Compare
ordered portable identity/enabled/weight; missing checks apply to enabled refs.
Check actual native tiny CPU adapters and a local NVIDIA checkpoint with real
LoRA weights, replay and weight/source controls. Separately exercise built
Electron selection -> frozen queue -> controlled inference response -> Add ->
Save/reopen/comparison, with screenshots inspected in context.

Execute isolated semantic mutations at resource, freeze, transport, loader,
weight, conditioning and portable comparison boundaries, then restore green
baselines. Run applicable TS/Vue/Python/full application/prototype checks and
record actual counts, source/build hashes and remaining limitations before
delivery. This section is a plan; it is not evidence that these checks passed.

## Executed evidence

Artifacts:
~/.codex/artifacts/imagegen-studio/lora-2026-10-02/.
This is implementation self-review with a separate focused TS handoff review,
not a blind audit of the application. The delivery manifest records final source,
report and built Electron hashes.

| Boundary                     | Executed result                                                                                                                                                                                                      | Practical limit                                                                                               |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Full application             | pnpm run app:test: 881 passed, zero failed/skipped (app-tests.log)                                                                                                                                                   | Actual SQLite/files/CPU composition and transport; controlled ML responses in TS integration tests            |
| Full prototype               | pnpm run prototype:test: 167 passed (prototype-tests.log)                                                                                                                                                            | Prototype regression does not prove production persistence                                                    |
| Full pinned Python           | 227 passed, zero skips (worker/restored-full-python.log)                                                                                                                                                             | Isolated interpreter uses local pinned ML plus temporary PEFT; not release installation                       |
| Actual native CPU ML         | 25 new real-component cases plus duplicate-header refusal: CLIP subsets/projection, UNet Linear/Conv, multiple adapters, ranks/alpha, signed/zero/tiny weights, conditioning/denoising/replay/overflow               | Small initialized components establish semantics, not image quality                                           |
| Actual adapter qualification | Digital Art: 986 targets / 1,972 weights, UNet 722 / CLIP1 72 / CLIP2 192, rank 16 / alpha 8 (worker/real-qualification.json)                                                                                        | One actual adapter with exact SHA/size                                                                        |
| Pinned TS profile            | Generator reproduces 1,058 native targets / 1,850 aliases; copied actual tensor header and eight qualifier tests pass                                                                                                | Architecture/format facts do not certify CivitAI family lineage                                               |
| Actual local NVIDIA          | Eight production calls: empty, zero, 0.7, replay, 0.35, -0.5, img2img empty/active; all six pixel controls pass (gpu/report.json)                                                                                    | One checkpoint/adapter, RTX 4080, 128x128, Steps 4, seed 42, epsilon; no general quality/v-pred qualification |
| Native built Electron        | 33 checks, 45 PNGs, 11 viewport checks, zero page errors (native-final/native-report.json); exact selection, disabled missing file, late weight/Default edits, actual Cancel/exit/Retry, Add1/Save/reopen/comparison | Controlled inference peer; GPU evidence is separate                                                           |
| Native comparison regression | Seven checks, zero page errors (native-comparison/native-comparison-report.json)                                                                                                                                     | Legacy/read-only regression with controlled fixtures                                                          |
| Focused TS review            | 15 qualification/admission/Retry/transport tests pass, no confirmed production defect (ui/read-only-review/)                                                                                                         | Same task context; not a blind reviewer                                                                       |

Typecheck, full lint, app build, Python Ruff/BasedPyright, script checks and changed
file formatting pass. Python lint/format ran from worker-python with its explicit
pyproject.toml configuration, including the two new root scripts. Four new authoring/comparison PNGs were opened and inspected
at 1380x900 and 900x620 using ui-audit: version/weight/missing feedback is readable;
copied stack and long SHA wrap inside a bounded comparison; close/footer remain
reachable. No new layout defect was observed in this area. This is not a new full
UI audit or accessibility certification.

### Semantic mutations

All **36 isolated source-copy mutants** were killed, with restored green
baselines and unchanged live source hashes:

- 17 backend: qualifier invocation, copied metadata, disabled/zero/signed freeze,
  duplicate identity, context/wire and staging agreement, capability guards, final
  batch/dispatch revalidation, full portable stack and legacy absence.
  Baseline/restored 199/199 (backend/mutation-report.json).
- Eight Python: absolute/clamped weights, alpha replaced by rank, skipped SHA,
  dropped unknown tensors, adapters after Compel, lost finite-output guard and
  overflowed native tensor. Restored 227/227 (worker/mutations.json).
- Seven comparison: current replacing frozen, invented legacy empty, disabled-file
  availability, dropped weight/enabled/portable identity and sorted order.
  Baseline/restored 18/18 (ui/mutations/summary.json).
- Four TS qualifier: rank/dimensions, finite alpha, mixed namespace and duplicate
  target aliases. Baseline/restored 8/8 (research/qualifier-mutations.json).

### Findings and retained failures

Actual CPU research disproved the assumption that the general native loader
always preserves isolated text-encoder subsets and per-module alpha. Public
component loaders now receive canonical keys and safe metadata derived from
every verified target/rank/alpha. File metadata is ignored; actual loaded tensors
and scales are checked before Compel. No custom weight patch, fusion or cache was
introduced.

Initial lint ran before owner formatting; generated numeric separators and root
script typing/imports were corrected. Verified logs retain the earlier failures.
Three native harness errors were corrected without weakening product assertions:

1. The drafted scenario attempted Retry from completed history. It now actually
   cancels the held job and waits for terminal state and confirmed child exit.
2. An unknown-family CivitAI fixture contradicted the install contract; publish
   correctly refused it before Electron startup (native.log). The disabled
   fixture now installs as Illustrious, then loses its file after disable.
   Unknown/foreign-family disabled portable refs remain covered in TS tests.
3. After successful LoRA Cancel/Retry/completion, the harness used plural
   "Add 1 as Layers" instead of the existing singular accessible label
   (native-verified.log). The corrected fresh full run passed.

### Remaining boundaries

Ordinary Kohya support is narrower than every Invoke adapter algorithm. Anima,
LoCon middle factors/alternative convolution factorization, LoHa, LoKr, DoRA and
other formats remain open and are explicitly refused. Native conversion does
not resolve the Diffusers-spelled add_embedding_linear_2 alias; its qualified
SGM spelling is available. The checked-in profile is generated from pinned
architecture/modules/converters, not handwritten guesses.

Authoring retains finite weights without clamping. Small updates can underflow
in native precision; extreme weights/tensors can explicitly fail a job.
Installation/family metadata alone proves neither actual loadability nor image
quality. Release packaging, larger targets/multiple real-adapter GPU qualification,
Anima, remaining options, inpaint/outpaint, embeddings, result-to-preset and Smart
Patch remain open. PP-005/PP-008 readiness and Phase 2B/2C completion are unchanged.

## Sources

Reference checkout ~/Work/sources/InvokeAI/ was rechecked at
9e1540962bcca7f8fa668d7d8e02cf79d75fda3b; its adapter algorithms are broader than
this first slice. API decisions were verified against local Diffusers 0.40.0 /
PEFT 0.21.2 source and executed components, with
[official adapter documentation](https://huggingface.co/docs/diffusers/main/using-diffusers/loading_adapters)
as background. The generator records config/reference hashes in its output.
The compressed test header contains tensor descriptors only; author/training
metadata and reusable weights were omitted.
