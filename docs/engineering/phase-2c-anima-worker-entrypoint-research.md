# Phase 2C — Anima worker entrypoint

## Scope and risk before implementation

Continue clean `master` `553bf52` after the
[six-method numerical foundation](./phase-2c-anima-flow-sampling-research.md).
This checkpoint supports PP-004/PP-005 by exposing original Anima txt2img and
opaque img2img through the qualified long-lived inference worker. A typed TS
assembler compiles concrete positive/negative prompts and sampling inputs;
Python captures that exact versioned interpretation and executes the actual
offline loader, weighted conditioning, signed ordinary LoRAs and native solvers.

This is high risk: malformed or stale input can change pixels, a filesystem
failure can publish an incomplete provisional output, and shared protocol changes
can break existing Illustrious jobs. Read the research/review protocols before
editing. This slice does not change Project UI, `.igs`, durable queue operations,
Retry, acceptance or immutable provenance. Main's current Anima admission refusal
remains in place; a worker command is not a completed end-user generation flow.

## Confirmed data path and existing gates

Invoke checkout remains pinned to `9e1540962bcca7f8fa668d7d8e02cf79d75fda3b`.
Its Anima path uses Qwen/T5, rectified-flow sampling and the Wan VAE. The accepted
[generation settings contract](../features/project/generate-mode/generation-settings.md)
does not require inventing CLIP Skip, CFG Rescale, external VAE or ordinary manual
VAE precision algorithms for Anima. Keep the pinned companion contract and
original architecture. Anima Turbo/new variants and Base few-step LCM quality
remain outside this qualification.

Current Main preparation admits only Illustrious. Its batch planner freezes raw
prompts and per-item seed; future Anima batch integration must compile both signs
and a fresh sampling plan for every concrete prompt/seed. The recorded enabled-LoRA
schema and normal-generation validation, durable queue SQL operation CHECK,
worker request DTO and accepted configuration each have independent Illustrious-only gates. Expanding only one
gate would produce a misleading partially admitted job; they remain unchanged
here. Exact Anima bundle and LoRA qualification services already exist separately.

The actual worker route is `inference_main.main` → bounded JSONL parse →
`process_inference_request` → captured Anima command → target verification →
strict original loader → shared weighted flow image boundary → atomic provisional
PNG and best-effort thumbnail → correlated progress/done/error. Library stdout
must stay on stderr. Main still owns input/output directories and eventual
candidate publication; the worker does not create SQLite rows or `.igs` records.

The extracted target validator previously compared the declared size only with
`stat()` before opening the snapshot. Verification must also compare the actual
snapshot length with that declared size: replacement between the two operations
can otherwise satisfy the hash of the new bytes while retaining an inconsistent
size. Prove this with a controlled interleaving that still calls the actual
filesystem reader; preserve the hash and alpha/profile checks. This is a narrow
guard in the shared generation boundary, not a rewrite of general derivatives.

## Versioned wire and ownership

Two commands, `generate-anima-txt2img` and `generate-anima-img2img`, use outer
protocol `1`, a request ID and `job.schemaVersion=1`. Required job fields:

- `model`: architecture `anima-base-1.0`, exact `checkpoint`, `qwen3Encoder` and
  `vae`, each with absolute normalized path, lowercase SHA-256 and positive size;
- `bbox`, exact sRGB RGBA `target` path/hash/size/dimensions/ICC identity;
- `prompts.positive` and `.negative`: compiled `anima-prompt-weighting-v1` values;
- `sampling`: immutable `anima-flow-denoising-v1`, including seed domains and full
  selected clipped sigma/timestep arrays;
- ordered effective `loras` with exact file path/hash/size and finite signed weight;
- `output.stagingRoot` and distinct direct-child `.png` output path.

Mode must agree with command type. Target/bbox/sampling dimensions must agree.
All shapes are exact; missing or extra fields, old envelopes, unsupported methods,
non-neutral or neutral SD-only advanced fields and embeddings fail explicitly.
Python does not reinterpret attention syntax or infer a generation mode.
TS captures caller values before compiling/returning the request; later caller
edits cannot change any compiled prompt, file identity, seed or output path.

Inference worker `0.11.0` preserves the full `0.10.0` Illustrious capability set.
Anima additionally requires all five explicit strings: `anima-txt2img`,
`anima-img2img`, `anima-lora`, `anima-prompt-weighting`, `anima-flow-sampling`.
Shared TS qualification accepts only the finite known worker versions; Anima
support requires exact qualified `0.11.0` plus all five strings. A missing Anima
advertisement does not erase valid Illustrious capabilities. Ready includes the
five Anima strings only when the supplied qualified runtime supports native CUDA
BF16; request execution checks that hardware invariant again. Older/unknown peers
do not gain Anima by advertising strings. Derivatives-only remains incapable of
inference and refuses even a well-formed Anima command.

## Parameter registry

| Parameter           | Existing owner/source                             | Bound and failure                                                                                                                                                          |
| ------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JSONL               | Worker `MAX_MESSAGE_BYTES` and current transport  | 64 KiB UTF-8 line; TS rejects an oversized serialized request, no prompt truncation or new wire ceiling                                                                    |
| Request ID/path     | Existing worker grammar/path policy               | ID 1–128 ASCII characters; path 1–4096, absolute normalized, no traversal/symlinks at execution                                                                            |
| Geometry            | Existing Anima plan and compositor                | 64–2048 sides aligned to 8, at most 4M pixels; bbox origins bounded by signed-int32 magnitude                                                                              |
| Target              | Existing generation PNG policy                    | At most 32 MiB, exact size/hash/pinned ICC, RGBA transparent for txt2img or fully opaque for img2img; mixed alpha refuses                                                  |
| Prompt/conditioning | Existing weighting compiler and native tokenizers | 16 KiB UTF-8 concrete prompt per sign; Qwen 8192/T5 512 token policy unchanged; compiled span payload also obeys aggregate JSONL bound                                     |
| Sampling            | Existing immutable six-method plan                | Steps 1–200, CFG 1–30, uint32 seed including 0, strength 0–1; at most 399 Heun evaluations, exact captured arrays                                                          |
| Models/LoRA         | Existing strict native loader/adapter profile     | Exact three distinct bundle files, pinned Qwen/VAE; complete shape-derived loader limits, finite ordered signed adapters; no checkpoint allowlist or new rank/resource cap |
| Compute             | Existing trained Anima evidence                   | CUDA BF16, no CPU/FP16 fallback; unsupported BF16 withholds Anima advertisement and refuses the request, while Illustrious startup remains available                       |
| Output              | Existing provisional publication policy           | New direct staging child, complete sRGB PNG with exclusive link+sync; storage failure reports error, no successful partial PNG                                             |

Startup qualifies pinned dependency versions, required original Anima/native
solver symbols and bundled tokenizers offline before advertising support. No
installed model, existing native environment or Invoke source is modified.
VRAM, model size and disk space are external constraints: actual OOM/load/write
failure refuses; this checkpoint does not qualify maximum dimensions or a minimum
supported GPU capacity. Models are request-owned, with existing adapter/VAE/RNG
restoration and post-request collection; caching/offload/tiling are separate work.

## Verification and failure plan

Test the real TS assembler and Python parser together, preserving neutral and
weighted Unicode prompts, seed 0, all methods, clipping and file captures. Reject
mode/geometry/version/seed drift, missing companions, illegal paths/duplicates,
extra advanced fields and unsupported peers before ML or filesystem publication.
Keep every legacy Illustrious capability behavior and schema unchanged.

At the actual inference entrypoint, verify real target files, exact loaded native
models, correlated progress/done, sRGB PNG/thumbnail and neighboring txt2img/
opaque img2img. Explicitly describe any scaled native constructor, CPU placement
or controlled error used by tests; a mocked generated image is not native inference
evidence. Run a separate bounded trained NVIDIA JSONL subprocess with actual TS
requests after source freeze, including weighting/LoRA and failure → next request.

Failures must never overwrite existing output or target/model bytes. Exercise
changed target/model identities, unsafe staging/symlinks, solver/progress failure,
publication refusal and next-request recovery. Output is provisional: process
termination after publication but before done can leave an orphan for Main's
existing scratch cleanup; it must not become a durable candidate by itself.

Execute isolated semantic mutations of request identity/mode, compiled weighting,
family routing, step seed, progress, output validation and capability admission.
Count executed behavioral assertion failures only; restore green controls and
record imported source hashes. Run relevant full TS/Python checks, offline wheel
contents, local links and source-aware review. Update PP matrix/body and roadmap
together without increasing the public readiness status.

Artifacts: `~/.codex/artifacts/imagegen-studio/anima-worker-entrypoint-2026-10-05/`.

## Remaining boundaries

Family-aware Project controls and full frozen Anima Main admission/batch/queue/
Retry/accepted provenance remain the next integration steps. Runtime installation
and Linux/NVIDIA release qualification remain open. No full PP-004/PP-005 promise
is closed by this worker-only checkpoint.

The source-aware settings audit also found a concrete required editor handoff:
family-agnostic attention Increase turns `(word:2)` into `(word:2)+`, which the
Anima compiler correctly rejects as conflicting operators. Existing Anima
authoring controls, appropriate native-method representation in portable sampler/
scheduler fields and family-switch diagnostics must be completed before opening
Project admission. Prototype global Illustrious sampler arrays and ungated mock
Advanced controls are gaps, not Anima inference evidence. The existing generic
progress schema already permits 400 completed evaluations; authored sampling
Steps remain bounded to 200. Future Anima Main handoff must correlate the captured
actual plan count (Heun up to 399) with request ownership rather than treating
requested Steps as the completed evaluation count.

## Executed evidence and source-aware review

The final worker source is version `0.11.0`; Main/Project admission remains
unchanged. Artifact paths below are relative to the directory recorded above.
The existing numerical compiler/helpers and vendored ER bytes retain their
previous qualified hashes; this checkpoint connects their execution to the
strict worker boundary.

- Final application suite: **1280 passed, zero failures/skips**, in `app-final.log`.
  Full prototype/application TypeScript checks and global ESLint passed.
- Python default environment: **383 passed, 390 optional native-ML skips**;
  the existing native environment with CUDA hidden ran **773 passed, zero skips**.
  Ruff and strict basedpyright passed. Default skips are not native evidence;
  `python/default-final.log`, `python/native-final.log` and
  `python/final-evidence.json` preserve the separate runs.
- Final focused TS contract run: **33 passed**, with full typecheck and scoped
  lint/format checks. After the filename correction, the complete isolated TS
  campaign was repeated: **27/27 semantic mutations killed by executed assertion
  failures**, baseline/restored **34 passed** (33 subject tests plus an active
  imported-module path/hash guard), zero collection errors/skips. The earlier
  26-mutant campaign is archived under `main/before-suffix-guard/`; current
  `main/final-report.json` and `main/mutation-report.json` use final source bytes.
- Python's isolated campaign: **11/11 semantic mutations killed**, native
  baseline/restored **38 passed**, no collection errors/skips and exact copied
  source restoration. Cases cover mode, prompt weights, signed adapters, family
  dispatch, step seed, progress identity, BF16 advertisement, exclusive output,
  sync rollback, snapshot length and target hash. This campaign used the original
  frozen TS dependency; Python sources stayed unchanged. After the narrow TS
  filename correction, `python/post-ts-closure.log` verifies the actual
  cross-language/native/publication cohort again: **38 passed, zero skips**.
- Actual worker/native tests use complete original-key safetensors and real
  Qwen3/T5/Cosmos/conditioner/Wan modules at explicitly reduced width/layer
  counts on CPU/F32. The trusted test collaborator changes architecture/device
  and companion pinning; it never replaces generated pixels. Native helper
  equality is a handoff oracle; independent solver algebra remains in the
  unchanged numerical tests. Shared filesystem tests exercise actual image
  encoding, exclusive output, directory-sync rollback and optional-cache failure.
- Trained NVIDIA probe: **10 outputs and two expected errors in one actual
  JSONL inference child**, exit 0. Six methods run at 256×256, N3 except ER-SDE N5;
  Heun reports five evaluations. Weighted positive/global-negative prompts,
  signed trained backbone Kohya weight −0.5, opaque img2img and fixed replay are
  verified. The signed adapter changes pixels; its next neutral request restores
  exact baseline PNG/pixels. Both pre-execution refusals have zero progress and
  are immediately followed by valid requests. All output PNG/ICC/WEBP metadata,
  model inputs and original source hashes were verified.
- `trained-jsonl/report.json` and `network.strace` retain actual ready, correlated
  messages, output identities and network syscalls. There are no Internet connect
  syscalls; local loopback binding and NVIDIA AF_UNIX probes are not downloads.
  NVIDIA driver resident-memory samples for the inference PID observed 6150 MiB;
  this is not an allocator peak or a minimum/maximum supported GPU qualification.
- Offline wheel builds successfully. `wheel-verification.json` compares all
  **38 package source/assets files** byte-for-byte, including new modules,
  tokenizer data and vendor licenses/notices. This is package-content evidence,
  not installation or activation of a release runtime.

Two concrete defects were closed with actual red behavior:

1. Replacement between target `stat()` and verified snapshot read retained a
   stale declared size. The test still calls the actual filesystem reader and
   supplies the replacement's correct hash. Before the new snapshot-length
   guard, model loading was reached and returned `GENERATION_WORKER_FAILED`;
   after the guard, the request returns `GENERATION_INPUT_CHANGED` before ML or
   output. The initial filename-fixture/setup issue is excluded from this red
   evidence; `python/final-evidence.json` records the valid red/green run.
2. Independent cross-language review found TS accepted an extension-only `.png`
   basename while Python `Path.suffix` refused it. Both target/output now refuse
   that name; `.source.png`, `..png` and ordinary named PNGs remain accepted.
   `main/png-suffix-before.json`, `main/png-suffix-red.log` and
   `main/png-suffix-after.json` retain real assembler/parser red/green controls.

The second finding arrived after the trained run. Its exact original source
hashes remain in `trained-jsonl/gpu-original-source-freeze.json` and the trained
report. Only the TS filename guard and its test subsequently changed; all Python,
ML and numerical source bytes remain identical. Under the final TS compiler,
`reference/final-builder-command-equivalence.json` regenerates all **12 recorded
commands** and verifies identical serialized wire bytes, including the same
forged-plan edit. The comparison reconstructs serialization from retained command
objects and unchanged child request code; no separate stdin byte log was retained.
`source-freeze.json`, `main/python-source-review.json` and
`reference/final-source-review.json` record final hashes and independent review.
Review was source-aware, not blind; both final passes have no remaining concrete
worker finding. The reports distinguish directly rerun evidence from the sibling
check results they cite.

No new model installation, weight/environment modification, Project Anima
admission, SQLite job, Retry, accepted provenance or `.igs` behavior is inferred
from this evidence. The GPU errors are pre-execution refusals, not a new
mid-denoise process-cancellation test. Image quality, Base few-step LCM/Turbo,
full sizes, caching/offload and installable Linux/NVIDIA runtime remain open.
