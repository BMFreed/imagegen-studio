# Phase 2B: Illustrious txt2img request boundary

Base: clean `06d7e02`. Risk: medium. This slice changes the main-to-worker
request contract and ephemeral scratch files, but does not enqueue a job,
publish a candidate, mutate `.igs`/SQLite or enable inference. Expected behavior
comes from [PP-005](../product-promises.md#pp-005-принятый-результат-хранит-настройки-генерации),
the [worker contract](../specs/05-worker-protocol.md) and
[queue frozen-job rule](../features/queue-manager.md#frozen-job-rule).

## Checked reference and current path

At local InvokeAI `9e1540962bcc`, Illustrious follows the SDXL path: the
frontend graph loads a single-file model, obtains dual-CLIP prompt conditioning,
generates latent noise, denoises, then decodes through VAE. The source paths are
`invokeai/frontend/web/src/features/nodes/util/graph/generation/buildSDXLGraph.ts`,
`invokeai/backend/model_manager/load/model_loaders/stable_diffusion.py` and
`invokeai/backend/stable_diffusion/schedulers/schedulers.py`. Invoke accepts
one scheduler key, not our two UI strings. Its denoise invocation requires
CFG at least 1; SDXL noise dimensions are multiples of 8. Unknown scheduler
names can fall back inside Invoke's scheduler helper, so our business logic
must reject unknown pairs before any worker dispatch.

The current Project draft allows nullable sampler/scheduler and CFG from 0.
The existing main preparation captures a real `.igs` target and exact model,
but it is not a worker request. This slice recognizes five explicit
sampler/scheduler pairs from the prototype and records the corresponding Invoke
key. Both nulls remain a valid **unresolved preparation**, while an incomplete
or unknown pair is rejected before image composition. The qualified request
requires an explicit pair, CFG ≥ 1, target dimensions divisible by 8, a
known prediction type and an actual `linux-nvidia`/`illustrious-txt2img`
capability with the reserved inference worker version `0.2.0`. There is no
silent sampling default or prediction-type fallback. That version is a gate
for this pending request shape, not an available runtime release.

The first wire shape is `generate-illustrious-txt2img` / `schemaVersion: 1`:
exact checkpoint path/hash/prediction type, frozen sRGB target PNG
path/hash/ICC/size, world-space bbox, plain prompts, Steps/CFG/uint32 seed,
qualified Invoke scheduler key and a main-nominated provisional PNG output.
Main copies the preparatory context and bytes before the first await, force
rechecks the exact model with ModelService, materializes the PNG in a unique
scratch lease and removes the lease after the callback. This lease is **not**
durable input storage for SQLite enqueue or staging recovery.

The Pillow-only development worker parses the same strict shape and responds
`INFERENCE_UNAVAILABLE` without reading inputs or creating output. Its ready
message stays `derivatives-only`; main refuses this profile before allocating
scratch. A future inference worker must implement loading, prompt conditioning,
denoising, output verification and a CUDA self-test before claiming the
generation capability.

## Limits, failures and verification

| Guard                                                                             | Source or status                                                                                                                                               |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2,048 px per side, 4 million pixels, 32 MiB target PNG, bounded world coordinates | Existing `compose-target` / main worker guards; defensive rather than measured model capacity.                                                                 |
| Width/height divisible by 8 and CFG ≥ 1                                           | Checked Invoke SDXL noise and denoise requirements; qualified request only, not `.igs` draft authoring.                                                        |
| Steps 1–200 and CFG 1–30                                                          | Provisional local-work ceiling for the first request boundary, not an Invoke or model limit; reject before worker I/O.                                         |
| 16 KiB UTF-8 bytes per prompt, 64 KiB JSON line                                   | Provisional first transport bound; the existing worker has a 64 KiB line ceiling. Oversize is an explicit error.                                               |
| `epsilon`, `v_prediction` or `sample` prediction type                             | Exact non-null metadata required. Current ordinary CivitAI install records `null`, so real model qualification or explicit metadata confirmation remains open. |

[Project integration tests](../../src/main/projects/project-generation-preparation.test.ts)
enter through a real copied `.igs`, SQLite catalog, model file and Python
`compose-target`. They verify the capability refusal before scratch I/O,
unsupported settings, exact-file recheck, source mutation during an await,
temporary-file cleanup and a real TS JSON request parsed by the Python
subprocess. [Python protocol tests](../../worker-python/tests/test_generation_protocol.py)
exercise strict fields and parser refusal without filesystem effects. These
checks do not establish inference, a release runtime, queue semantics or
candidate publication.
