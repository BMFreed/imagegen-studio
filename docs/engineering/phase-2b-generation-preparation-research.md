# Phase 2B: preparation before enqueue

Base: `9c2f54a` (clean checkout before this slice). Risk: medium. This slice
reads exact model files and a Project snapshot, but does not mutate `.igs`,
SQLite, model lifecycle or a persistent queue. Contracts: [PP-004](../product-promises.md#pp-004-управляемая-библиотека-моделей-вместо-ручной-работы-с-файлами),
[PP-005](../product-promises.md#pp-005-принятый-результат-хранит-настройки-генерации),
[Queue frozen job](../features/queue-manager.md#frozen-job-rule) and
[worker protocol](../specs/05-worker-protocol.md).

## Observed boundary

The existing `ProjectService.prepareNormalGenerationInput` enters a real open
Project. `withFrozenRasterComposition` clones its validated document before the
first filesystem await, snapshots raster assets, and `compose-target` produces
finite RGBA pixels at the frozen bbox. Main re-reads and checks output hash,
dimensions and sRGB metadata. This is raster input preparation, not inference.

The saved Project model reference pins a local resource/version, CivitAI
model/version/file, SHA-256, family and prediction type. Model Manager Default
can change independently. A catalog row marked `ready` is insufficient for a
job: the file must be force-hashed against the saved exact version in main.

The new preparation boundary joins these two verified inputs, copies the PNG
bytes, records the Project document ID/revision, bbox, prompts, Steps/CFG and
a concrete uint32 seed with its requested policy. `Fixed` uses the explicit
value; `Random` draws a new value. `Reuse` is rejected until the durable
Project-scoped last-actual-seed cursor is connected. Active LoRAs, embedding
refs, VAE, advanced options, non-txt2img target modes and nonnull sampler,
scheduler or denoising settings are rejected explicitly. Known-invalid draft
settings are rejected before invoking image composition and rechecked against
the captured document afterwards. Disabled LoRAs are
not operational inputs and do not block this narrow preparation.

The returned JSON-compatible context has a separate copied PNG byte buffer.
It has **no queue ID or staging destination** and is deliberately not a worker
DTO. The temporary target path is never retained. A later enqueue step must
materialize the bytes in app-managed storage, validate a qualified
sampler/scheduler and worker capability set, recheck the model file before
dispatch, and atomically create its queue/staging records. The current
Pillow-only worker cannot run this context.

## Failure and regression checks

- Exact model IDs/hash/family/prediction type are compared after a forced file
  hash; missing/corrupt files and a changed Default cannot silently substitute
  another version.
- Changes to Project prompt/bbox or the source target buffer after capture do
  not change the prepared context. A changed target hash is rejected.
- Unsupported input receives a typed error before any queue or Project write.
  No failed preparation updates the actual-seed cursor.

The [Project integration tests](../../src/main/projects/project-generation-preparation.test.ts)
enter through ProjectService with a real `.igs`, SQLite and the checkout image
worker when its development environment exists. The
[model resolver tests](../../src/main/models/model-generation-resource.test.ts)
use real catalog rows and files. Neither test group proves an installable
inference runtime, enqueue or candidate publication; those remain in the
[Phase 2B roadmap](../specs/01-implementation-roadmap.md#фаза-2b-очередь-и-первая-сквозная-генерация).
