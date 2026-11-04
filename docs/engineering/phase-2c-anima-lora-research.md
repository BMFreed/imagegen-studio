# Phase 2C — ordinary Anima LoRA

## Scope and risk

Internal foundation for PP004/PP005 and Phase 2C: exact managed Anima LoRA
qualification and scoped application to the existing internal Euler path. Public
Generate, capability admission, queue/Retry, wire versions and `.igs` provenance
remain unchanged. This is not a claim of a released Anima generation pipeline.

Risk is high: incorrect resource identity or adapter scaling silently changes
generation. No storage migration, resource installation or destructive operation
is added. Existing Illustrious qualification and resolution remain unchanged.

## Checked reference and data flow

- Confirmed: local InvokeAI `9e1540962bcca7f8fa668d7d8e02cf79d75fda3b` applies
  Qwen adapters before Qwen encoding and backbone/LLM Adapter adapters before
  conditioning of both prompt polarities. Ordinary scale is signed weight times
  alpha/rank, with missing alpha defaulting to rank; originals restore in finally.
  Invoke retains Kohya alpha but its PEFT normalization drops an actual alpha
  tensor when no separate alpha argument is supplied. Preserving explicit alpha
  for both ordinary formats is our stated qualification policy, not a claim
  that this Invoke PEFT branch already preserves it.
- Confirmed: pinned Diffusers 0.40.0, Transformers 5.5.4 and PEFT 0.21.2 expose
  public native adapter APIs. Anima splits the original `llm_adapter` into its
  own text conditioner. Qwen is a bare Qwen3Model in this worker.
- Confirmed: native Anima namespace conversion and actual meta modules give
  454 backbone, 61 conditioner and 196 Qwen Linear targets. Their dimensions,
  original aliases and native aliases are generated, rather than inferred from
  a handwritten list. Embeddings, normalization and VAE are outside this set.
- Confirmed: the three local Anima adapters contain two PEFT A/B files (448
  targets each) and one Kohya up/down file (280 targets). Every target matches
  actual native dimensions. None of these three files targets Qwen/conditioner.
- Confirmed: native loaders can warn and accept incomplete pairs, integer/NaN
  weights or unknown namespaces. Native success is not resource qualification.
  Strict complete qualification must precede their invocation.

Main resolves an exact Anima LoRA saved reference against SQLite, hash and byte
size, then checks its complete bounded safetensors header against the generated
profile. Python captures the exact file bytes again, checks all actual tensors
against native modules, derives PEFT configuration from those tensors, installs
adapters before prompt encoding, and removes its adapters in finally. It never
uses model-file metadata as executable configuration.

## Accepted ordinary format and invariants

The finite accepted set is ordinary Linear LoRA, with global Kohya up/down or
PEFT A/B suffix style. Both tensors must be present; rank and module dimensions
must agree. Each canonical native target occurs once. Named adapter suffixes,
mixed styles, unknown keys, DoRA/LoHA/LoKR/IA3, embeddings, convolutions and VAE
targets are refused instead of partially loading. This qualifies adapter
execution; install and broader algorithm support are separate boundaries.

Optional per-target alpha is a finite scalar. Missing alpha means rank. Generic
training metadata, including `ss_network_alpha`, is ignored, matching checked
Invoke/native behavior and the existing Illustrious policy. A rank-64 local PEFT
file has metadata alpha 32 but no alpha tensors; that fact does not inject an
unrequested configuration override.

Enabled zero weights still undergo exact qualification. Signed finite weights
are preserved. Loaded rank/alpha/tensors/scaling and closed-form native deltas
are verified. Only after those checks, native per-layer activation excludes
exactly zero scales (zero weight or alpha), avoiding `0 * Inf` in native low-rank
products. The configured resources/tensors/scaling remain present for validation.
Partial load, conditioning/denoising failure and progress callback
failure must remove every owned adapter; replay without LoRA must reproduce the
baseline. Adapter initialization must not alter the caller's global RNG streams.

## Parameters and failure boundaries

| Parameter          | Value and source                                                 | Exceeding or invalid value             |
| ------------------ | ---------------------------------------------------------------- | -------------------------------------- |
| Safetensors header | 2 bytes–32 MiB; existing LoRA envelope                           | Refuse before parsing/loading          |
| Tensor storage     | F16, BF16 or F32, complete contiguous payload                    | Refuse malformed ranges/dtype/holes    |
| Target dimensions  | Actual native meta models and pinned converter                   | Refuse missing/unknown/alias collision |
| Rank               | Positive and consistent with both tensors/native shape           | Refuse incompatible pair               |
| Alpha / weight     | Finite scalar / finite signed number                             | Refuse before native execution         |
| File identity      | Exact SHA-256/size; regular file, no symlinks, before/after stat | Input-changed error                    |
| Euler envelope     | Existing 64–2048 dimensions, 4M pixels, 1–200 steps              | Existing plan refusal unchanged        |

GPU memory remains dependent on rank, target count and simultaneous adapters;
no new VRAM ceiling or quality claim is inferred from the small native controls.

## Verification plan and neighboring controls

Use real SQLite/managed files for Main resolution, actual safetensors payloads
and native tiny Cosmos/conditioner/Qwen modules for Python execution. Compare
closed-form signed delta and both conditioning polarities; absent/zero adapters
are neighboring controls. Cover exact-byte tampering, malformed headers, alias
collisions, shape/alpha/nonfinite failures and cleanup after partial failures.
Run isolated semantic mutations, native optional-ML tests, existing Illustrious
tests and all applicable repository checks. A bounded trained GPU probe checks
the actual local adapters and baseline restoration without claiming release
readiness. Record commands, source hashes, executed/skipped counts and remaining
gaps after implementation.

Artifacts: `~/.codex/artifacts/imagegen-studio/anima-lora-2026-10-05/`.

## Remaining boundaries

Other schedulers/options, public Anima plan/context/wire admission, queue/Retry,
immutable provenance, editor integration and release qualification remain open
Phase 2C work. This slice does not substitute native loader permissiveness for
the application's qualification policy.

## Executed verification (05.10.2026)

Base checkout: clean `master` at `5eec900a392399c921deb9268df903d532197ede`.
Evidence below tests the resulting working tree. Native ML dependencies are the
existing read-only Invoke environment plus isolated PEFT 0.21.2, not an installed
or released application runtime. No Invoke source checkout, runtime packages or model
files were modified. No product decision remains open within this internal slice.

Main's 32 focused cases use real SQLite and regular files/default qualification.
They cover exact IDs/hash/size/family before and after qualifier awaits, copied
advisory metadata, Default independence, malformed complete headers and all
4977 aliases. Three checked-in real-header fixtures remove training metadata and
contain no reusable weights. A separate default Main probe qualifies all three
actual local files, with original timestamps/hash/size preserved. Temporary
registry CivitAI IDs/family are declared fixtures, not install or lineage proof.
The legacy public Illustrious resolver refuses those Anima files.

Python's 63 focused cases use actual native Cosmos, AnimaTextConditioner and Qwen
modules, real safetensors snapshots and the real TS prompt/plan compilers. Their
closed-form linear sums and independent conditioning/CFG Euler reference check
signed weights, per-target mixed rank/alpha, both polarities, stack order/effects,
txt2img/img2img, zero neighbors and exact replay. They check exact-byte tampering,
unknown/incomplete pairs and aliases, metadata ignored, tensors/scales/target sets
after native loading, global RNG, original gradient flags and model restoration.

Four concrete failures were reproduced and fixed:

- Qwen `delete_adapter` leaves empty native wrappers, and it refuses cleanup if
  injection throws before Transformers sets its loaded flag. Native unwrapping
  now runs independently of that flag, followed by cleanup of owned config and
  restoration of the original flag/gradient state. Both early and completed-load
  failure cases restore the graph and allow the next valid adapter on the same
  models. Other component cleanup still runs if one component reports a failure.
- Native zero-weight/zero-alpha updates can overflow before multiplication by
  zero. Full qualification and post-load checks still execute; exact zero scales
  then leave native per-layer activation. Finite-overflow controls for all three
  components, mixed zero/nonzero stacks and per-target alpha zero beside nonzero
  alpha return the exact expected finite baseline/active contribution.
- Strict scale verification initially evaluated `(alpha/rank)*weight`; pinned
  PEFT evaluates `weight*alpha/rank`. At rank 3/alpha 6/weight 0.7 those produce
  different floating point values. Verification now follows the actual native
  evaluation order; strict tensor/config/scaling checks remain intact.
- Qwen's native loader can share tensor storage with the supplied state dict.
  In-place corruption then changes both the loaded value and its comparison
  reference, defeating the post-load check. Passing cloned A/B tensors keeps
  captured snapshots independent. The real native corruption regression failed
  before this fix and now refuses the corrupted adapter before execution.

The independent review is source-aware, not a blind product acceptance audit.
Its two additional reproduced cleanup/overflow findings were closed through the
same real native boundary. The early RED and failed intermediate runs remain in
artifacts; infrastructure/setup failures are not counted as semantic REDs.

Final trained RTX 4080 CUDA BF16 probe: 15/15 cases pass at 256×256 and three
steps. All three local backbone adapters (PEFT rank 32, PEFT rank 64, Kohya rank 32) change pixels at weight 0.7. Enabled zero equals baseline, replay is exact,
negative weights and a mixed-format signed stack have an effect, and opaque
img2img/restoration pass. After each call, graph/config/gradient flags and
CPU/CUDA RNG restore exactly; neighboring baseline calls restore exact latents
and pixels. Full tensor equality is verified in tiny native tests. Six source
files retain their before/after identity;
no network attempt occurs. Peak allocated/reserved CUDA bytes are 6,248,779,776 /
6,320,816,128. This does not qualify image quality, all resolutions, cache/offload,
or trained Qwen/conditioner adapters. Their execution evidence is tiny native ML.

Final GPU `anima_lora.py` SHA-256:
`4b6a291be5678307f2003178a3c0862d1d35378d4c9f0e7cbab360bccb027f77`.
Final GPU report SHA-256:
`dd35107546adc5f228e99a7f8cb054a9e5036da3924ff72ba2ab29e2a57b95c8`.
Both source/profile hashes remain unchanged during that probe. The generated
profile is reproducible byte-for-byte from the pinned meta models/converter:
711 targets (454 backbone + 61 conditioner + 196 Qwen), 4977 unique aliases.
Packaged JSON SHA-256:
`920c430377002ead5fe8460b7ccd94dde7bc7f3fceed3b2316b8002546126c02`.
Fresh offline wheel inspection confirms exact current helper/Euler/profile bytes.
This is packaging inclusion, not bundled runtime installation qualification.

Aggregate commands and results:

- `pnpm run app:test`: 1203 passed, 0 failed/skipped.
- `pnpm run typecheck` and `pnpm run lint`: pass.
- `pnpm run app:smoke`: all seven existing controlled Electron smoke scripts pass.
  They preserve current application behavior, not Anima public admission.
- `uv run --frozen pytest -q` in `worker-python`: 330 passed, 294 optional-ML skips.
- Native CPU regression: 624 passed, 0 skips, 34 library warnings (30 previous
  warnings and 4 expected multiple-adapter warnings), with CUDA/Hub disabled.
- `uv run --frozen ruff check src tests`, `uv run --frozen basedpyright`: pass.
- Main isolated semantic mutations: 18/18 assertion-killed, each executes all
  32 cases; baseline/restored both pass and live source is unchanged. No syntax,
  harness or timeout kill is credited. Generator lint/types and fresh regeneration
  also pass.
- Python isolated semantic mutations: 20/20 assertion-killed, each executes all
  63 cases without skips or collection/setup errors. Baseline and restored source
  both pass 63/63. Each process records imported sandbox module paths and source
  hashes, and the final copied source/test snapshots match the live tree.

The earlier 61-case Python campaign killed 18/19 mutants. Removing `O_NOFOLLOW`
survived because its static symlink control was already refused by the canonical
path guard. A real filesystem exchange between that guard and `open` now verifies
this distinct boundary: the same-byte symlink is refused, while a regular file
remains accepted. That mutant is killed in the final 63-case campaign. The added
Qwen snapshot regression also kills clone omission by observing corrupted tensors
accepted into execution, rather than merely checking a changed error label.
Other mutations change actual signed numerical effects, conditioning timing,
stack contributions, file/target admission, cleanup or caller RNG. Cleanup failures
can cascade to other cases; the primary reproduced restoration failure is the
evidence. These 38 targeted Main/Python mutations are not exhaustive coverage.

Existing Illustrious resolver/loader behavior and protocol/capability/`.igs`
versions remain unchanged. The new Main Anima resolver has no public Generate
caller. No prototype UI changed; no prototype visual test is claimed.

Artifacts under the directory above include Main/real-header checks and mutations
in `main/`, native/aggregate check logs, `python-mutations/`, independent review
reproduction scripts/reports, `trained-gpu/report.json` and PNGs, and the final
wheel inclusion report. Local paths are development evidence, not shipped assets.
