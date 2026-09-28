# Phase 2B: qualified Illustrious inference boundary

Base: `2f56ff1` (28.09.2026). Risk: **high** — accepting a wrong checkpoint,
silently changing sampling semantics, fetching undeclared assets or publishing an
unverified worker file would break PP-004/005/008. The expected path is defined
by [Worker Protocol](../specs/05-worker-protocol.md),
[managed-model contract](../contracts/managed-model-library.md) and
[Phase 2B roadmap](../specs/01-implementation-roadmap.md#фаза-2b-очередь-и-первая-сквозная-генерация).
This is an internal development checkpoint, not a released Generate flow.

## Boundary and decision

`ModelService.resolveVerifiedGenerationCheckpointForPlan()` already re-hashed
the selected exact file and froze its library-owned prediction type. It now
also reads a bounded `.safetensors` header and requires original-format SDXL
base anchors: normal four-channel UNet, both CLIP text encoders and VAE
encoder/decoder. It rejects a legacy `sample` prediction before Prepare; the
current Model Manager exposes only `epsilon` and `v_prediction`. Header shape
does **not** prove Illustrious lineage, full loadability, license or output
quality. The source family still comes from CivitAI metadata, and the worker
remains the final model-load check. A self-contained VAE is required for this
first single-file path; missing components receive an explicit preflight error.

The existing Pillow worker stays at version `0.1.0` and
`derivatives-only`, including its `INFERENCE_UNAVAILABLE` response to a
generation request. A separate `0.2.0` Linux/NVIDIA entrypoint handles only
plain-prompt Illustrious `txt2img`. Its startup requires CUDA, the exact tested
ML dependency versions and all 17 files of an explicit, content-pinned local
SDXL configuration. It forces Hugging Face/Transformers offline mode and passes
that directory as `config=` with `local_files_only=True`; no configuration or
model weights are copied from the local InvokeAI installation into this repo.
The pinned config is checked again before and after every model load, so a
long-lived process cannot reuse a changed config after its initial `ready`.

Main's separate `GenerationWorkerClient` requires a canonical app-owned runtime
executable and scratch root, exact `ready` version/profile/capability, bounded
JSON lines and correlated result paths/IDs. It confirms child exit on close;
timeout, malformed output or an unmatched response closes the transport.
Python rechecks the checkpoint hash before and after loading, the transparent
target's hash/sRGB ICC/dimensions, and an absent nominated output path. It writes
a provisional sRGB PNG exclusively; only the existing staging repository may
publish a candidate. Neither worker nor transport edits `.igs` or SQLite.

The request has no LoRA, embedding, region, mask, advanced-option, img2img or
outpaint inputs. Raw Diffusers `prompt=` differs from Invoke's dual-CLIP Compel
conditioning, so this slice rejects weighted markup and prompts exceeding 77
tokens in either CLIP tokenizer instead of silently treating them differently.
All five current scheduler keys use the frozen `epsilon`/`v_prediction`; the
SDE schedulers use Invoke's fixed Brownian sampler seed `0` while initial
latents use the job seed. Pixel-for-pixel Invoke parity is unproven. The model
reloads for each job; warm caching, progress events and release performance are
still open.

## Evidence and failure behavior

The local InvokeAI checkout was `9e1540962bcca7f8fa668d7d8e02cf79d75fda3b`.
Its SDXL single-file loader, scheduler mapping and dual-CLIP conditioning were
used as behavior references, not copied source. With a fresh empty `HF_HOME`,
offline flags and the explicit local SDXL config, Diffusers `0.40.0` loaded the
local `bismuthIllustrious_v80.safetensors` checkpoint (UNet cross-attention
dimension 2048, VAE latent channels 4). That local file's CivitAI provenance
was not established; the smoke proves executable SDXL shape and CUDA behavior,
not the complete managed-install flow.

An independent JSONL subprocess smoke generated a 128×128, two-step
`dpmpp_2m_k` image on the RTX 4080: `ready` 0.2/Linux-NVIDIA, correlated
`generation-done` with seed 42, and a 21,501-byte RGB PNG with the pinned sRGB
ICC. A second smoke exercised the actual TypeScript transport through the same
Python entrypoint and validated its PNG with the app's streaming sRGB scanner.
After the per-job config drift guard was added, the final Python JSONL GPU
smoke was repeated with a fresh empty Hugging Face cache and produced the same
correlated seed and sRGB output. The TypeScript transport was unchanged after
its combined smoke.

| Trigger                                                        | Observed or specified result                                                                                              |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Missing/changed config, ML dependency or CUDA at startup       | No `ready`; inference entrypoint exits with a nonzero status. The derivative worker remains available for Save/import.    |
| Wrong family/shape or old `sample` before enqueue              | ModelService rejects Prepare; no queue row is created.                                                                    |
| Changed checkpoint/target or nontransparent target at dispatch | Worker returns a correlated safe error; no provisional output is published.                                               |
| Worker timeout, malformed message, wrong ID/path or exit       | Transport closes and waits for observed exit before the processor may release its running slot.                           |
| Failure during provisional PNG write                           | Scratch may contain a partial temporary file; the processor's existing cleanup/restart path owns it. `.igs` is unchanged. |

| Parameter                                           | Owner and basis                                                        | Over-limit behavior / evidence                                                          |
| --------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Safetensors header ≤ 32 MiB                         | Main preflight; defensive parser bound, not model capacity             | Reject before enqueue; malformed-length and missing-anchor tests.                       |
| SDXL config: 17 pinned files                        | Python manifest from the immutable local SDXL Base 1.0 config snapshot | No `ready` or job error if missing/changed/extra; startup and config-drift tests.       |
| JSONL line ≤ 64 KiB                                 | Existing worker protocol and new TS transport                          | Reject/close on oversized request or response; real-child tests.                        |
| Plain prompt ≤ 77 tokens per CLIP tokenizer         | Model tokenizer length; provisional raw-Diffusers scope                | Explicit `GENERATION_PROMPT_UNSUPPORTED`; both-tokenizer tests.                         |
| Target ≤ 2,048 px/side, 4 MP; Steps ≤ 200; CFG 1–30 | Existing frozen-request operational bounds                             | Parser/preparation rejects; not measured model capacity.                                |
| Startup 120 s, request 30 min, shutdown 2+2 s       | New transport defaults; provisional, not measured GPU latency          | Timeouts close the child and require observed exit; real-child tests.                   |
| Checkpoint size and GPU memory                      | External model/host properties; no release bound measured              | ModelService hashes exact bytes; worker load/OOM returns safe failure and no candidate. |

The first GPU smoke used 128×128 and two denoising steps only. Larger-image
latency, VRAM and release sizing remain unknown.

Focused Python checks passed 103/103, TypeScript transport real-child checks
passed 7/7, and the full app suite passed 351/351. `pnpm run lint`,
`pnpm run typecheck`, Ruff format/check and basedpyright also passed. Isolated
semantic mutations showed red tests when the SDXL second encoder requirement,
transport exit wait, transparent-target guard or per-job config recheck was
removed; each mutation was discarded. These runs cover the dirty working tree,
not a committed/released artifact.

The Electron bootstrap does not yet create this inference client or processor;
the installer does not deliver the pinned ML runtime/config. Full Invoke-like
conditioning, LoRA, Anima, model cache, renderer Generate/Queue Manager,
staging acceptance and accepted provenance remain Phase 2B/2C work. No
production promise status changes at this checkpoint.
