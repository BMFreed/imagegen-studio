import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import type {
  IgsProjectDocumentV1,
  IgsRasterLayerV1,
  IgsSmartPatchLayerV1,
} from '../../shared/projects/project-schema.js'
import { isSmartPatchRasterLayer } from '../../shared/projects/project-schema.js'
import type {
  ProjectSmartPatchGenerateOptions,
  ProjectSmartPatchRasterAcceptRequest,
} from '../../shared/projects/smart-patch-public-generation.js'
import { isProjectSmartPatchResultsSnapshot } from '../../shared/projects/smart-patch-public-generation.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { type Dirent, existsSync } from 'node:fs'
import { readdir, readFile, rename, symlink, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import type { GenerationWorkerTransport } from './generation-processor.js'
import type { GenerationQueueTestHooks } from './generation-queue.js'
import type { InferenceWorkerReady } from './illustrious-txt2img-job.js'
import type { SmartPatchExecutionPreparationWorker } from './project-smart-patch-execution.js'
import type { SmartPatchExecutionRequest } from './smart-patch-execution-request.js'
import type { SmartPatchInferenceTransport } from './smart-patch-generation-processor.js'

import { GenerationAcceptanceJournalRepository } from './generation-acceptance-journal.js'
import { ProjectGenerationActionController } from './generation-action-controller.js'
import { GenerationDispatchCoordinator } from './generation-dispatch-coordinator.js'
import { GenerationOrchestrator } from './generation-orchestrator.js'
import { GenerationProcessor } from './generation-processor.js'
import { readIgsPackage } from './igs-package.js'
import { ProjectAutosaveLeaseRegistry } from './project-autosave.js'
import { ProjectGenerationAcceptanceRecovery } from './project-generation-acceptance-recovery.js'
import { ProjectGenerationAcceptance } from './project-generation-acceptance.js'
import { ProjectGenerationClose } from './project-generation-close.js'
import { ProjectGenerationOperationGate } from './project-generation-operation-gate.js'
import { ProjectGenerationStagingLifecycle } from './project-generation-staging-lifecycle.js'
import { ProjectIndexRepository } from './project-index.js'
import { ProjectService } from './project-service.js'
import { ProjectShadowStore } from './project-shadow.js'
import { ProjectSmartPatchAcceptance } from './project-smart-patch-acceptance.js'
import { ProjectSmartPatchGenerationActionController } from './project-smart-patch-generation-action-controller.js'
import { ProjectSmartPatchResultActions } from './project-smart-patch-result-actions.js'
import { ProjectSmartPatchResultResource } from './project-smart-patch-result-resource.js'
import { projectVerifiedSmartPatchVariant } from './project-smart-patch-variant-projection.js'
import { inspectTemporaryRecovery } from './project-temporary-recovery.js'
import {
  readGenerationAcceptanceKind,
  SmartPatchAcceptanceJournalRepository,
} from './smart-patch-acceptance-journal.js'
import { SmartPatchGenerationStagingRepository } from './smart-patch-generation-staging.js'
import { decodeTargetPngAlpha } from './target-png-mode.js'
import { ANIMA_BATCH_READY } from './test-fixtures/anima-batch.js'
import { enqueueAnimaStagingBatch } from './test-fixtures/anima-staging.js'
import { fixtureMaskPng, paintedPatchFixture } from './test-fixtures/project-mask.js'
import { literalSmartPatchColorPng } from './test-fixtures/smart-patch-input-material.js'
import { withSmartPatchQueueFixture } from './test-fixtures/smart-patch-queue.js'
import { createSourceOutputWorkerOwner } from './test-fixtures/source-output-worker.js'

const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const options = {
  skip: !existsSync(path.resolve('worker-python/.venv/bin/python')),
  timeout: 30_000,
}
type Family = 'anima' | 'illustrious'
const ready = {
  ...ANIMA_BATCH_READY,
  capabilities: [
    ...ANIMA_BATCH_READY.capabilities,
    'illustrious-outpaint',
    'anima-outpaint',
    'illustrious-euler',
    'illustrious-noise-profile',
    'smart-patch-execution',
    'smart-patch-seed-confirmation',
  ],
  workerVersion: '0.14.0',
}

type PublicFixture = Awaited<ReturnType<typeof publicFixture>>
/**
 * Only readiness/numerical inference/peer exit are controlled. The exact tiny model-file resolver
 * is an explicit structural/trained-weight qualification substitute. CPU source capture,
 * conditioning, preparation and world output use actual checkout Python children; Project service,
 * SQLite/migrations, queue, processor, staging, receipts and portable package owners remain real.
 * Test scheduling records the public wake request and drives the real shared dispatcher explicitly;
 * the separate native smoke owns the automatic renderer/Main admission-to-drain wiring.
 */
class ControlledSmartRuntime {
  active = 0
  afterAdmission: (() => Promise<void>) | null = null
  available = true
  beforeExecution: ((request: SmartPatchExecutionRequest) => Promise<void>) | null = null
  beforePreparation: (() => Promise<void>) | null = null
  generated: SmartPatchExecutionRequest[] = []
  maximum = 0
  ready = structuredClone(ready)

  constructor(readonly preparationWorker: SmartPatchExecutionPreparationWorker) {}

  async getStatus() {
    return null
  }
  async readQualifiedInferenceReady() {
    return structuredClone(this.ready)
  }
  async retryUnconfirmedGenerationExit() {
    return this.active === 0
  }
  async withGenerationAdmission<T>(
    _scratch: string,
    use: (ready: InferenceWorkerReady) => Promise<T>,
  ): Promise<T | null> {
    if (!this.available) {
      return null
    }
    const result = await use(structuredClone(this.ready))
    await this.afterAdmission?.()
    return result
  }

  async withGenerationPreparation<T>(
    _scratch: string,
    use: (input: {
      inferenceReady: typeof ready
      targetWorker: SmartPatchExecutionPreparationWorker
    }) => Promise<T>,
  ): Promise<T | null> {
    return this.available
      ? await use({
          inferenceReady: structuredClone(this.ready),
          targetWorker: this.preparationWorker,
        })
      : null
  }
  async withGenerationWorker<T>(
    _scratch: string,
    use: (worker: GenerationWorkerTransport) => Promise<T>,
  ): Promise<T | null> {
    if (!this.available) {
      return null
    }
    assert.equal(this.active, 0, 'The shared dispatch owns only one inference transport.')
    this.active++
    this.maximum = Math.max(this.maximum, this.active)
    const stopped = deferred()
    let closed = false
    const close = async () => {
      closed = true
      stopped.resolve()
    }
    const transport: GenerationWorkerTransport & SmartPatchInferenceTransport = {
      close,
      executeSmartPatch: async (request) => {
        this.generated.push(structuredClone(request))
        await Promise.race([this.beforeExecution?.(request) ?? Promise.resolve(), stopped.promise])
        if (closed) {
          throw new Error('The controlled inference peer confirmed exit.')
        }
        const { height, width } = request.internalResolution
        const bytes = literalSmartPatchColorPng(
          width,
          height,
          Array.from({ length: width * height }, () => [23, 47, 91]).flat(),
          3,
        )
        await writeFile(request.output.pngPath, bytes, { flag: 'wx', mode: 0o600 })
        return {
          actualSeed: request.inference.sampling.seed,
          output: {
            byteSize: bytes.length,
            colorSpace: 'srgb',
            height,
            iccSha256: IGS_SRGB_ICC_SHA256,
            path: request.output.pngPath,
            sha256: digest(bytes),
            width,
          },
        }
      },
      generate: async () => {
        throw new Error('This fixture cannot substitute normal generation.')
      },
      ready: structuredClone(this.ready),
    }
    try {
      return await use(transport)
    } finally {
      await close()
      this.active--
    }
  }
  async withSmartPatchGenerationPreparation<T>(
    _scratch: string,
    use: (input: {
      inferenceReady: typeof ready
      preparationWorker: SmartPatchExecutionPreparationWorker
    }) => Promise<T>,
  ): Promise<T | null> {
    if (!this.available) {
      return null
    }
    const inferenceReady = structuredClone(this.ready)
    await this.beforePreparation?.()
    return await use({ inferenceReady, preparationWorker: this.preparationWorker })
  }
}
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function patch(document: IgsProjectDocumentV1, layerId: string): IgsSmartPatchLayerV1 {
  const value = document.layers.find(({ id }) => id === layerId)
  assert.ok(value?.kind === 'smart-patch')
  return value
}

function raster(bytes: Buffer, bbox: IgsSmartPatchLayerV1['boundingBox']): IgsRasterLayerV1 {
  const id = randomUUID()
  return {
    asset: {
      bytes: bytes.length,
      height: bbox.height,
      path: `assets/layers/${id}.png`,
      sha256: digest(bytes),
      width: bbox.width,
    },
    blendMode: 'normal',
    id,
    kind: 'raster',
    locked: false,
    name: 'Literal lower source',
    opacity: 1,
    transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: bbox.x, y: bbox.y },
    visible: true,
  }
}
async function withPublicFixture(
  family: Family,
  run: (f: Awaited<ReturnType<typeof publicFixture>>) => Promise<void>,
  mode: 'img2img' | 'inpaint' | 'txt2img' = 'inpaint',
  queueHooks: GenerationQueueTestHooks = {},
) {
  await withSmartPatchQueueFixture(
    family,
    async (base) => {
      const f = await publicFixture(base, mode)
      try {
        await run(f)
      } finally {
        await f.controller.shutdown()
        await f.normalActions.shutdown()
        await f.dispatch.shutdown()
        await f.cpu.cleanup()
        for (const tab of f.service.getOpenTabs()) {
          await f.service.discardAndClose(tab.id)
        }
      }
    },
    queueHooks,
  )
}

async function publicFixture(
  base: Parameters<Parameters<typeof withSmartPatchQueueFixture>[1]>[0],
  mode: 'img2img' | 'inpaint' | 'txt2img',
) {
  const repository = new ProjectIndexRepository(base.database.db)
  const shadow = new ProjectShadowStore(path.join(base.root, 'public-autosave'))
  const staging = new SmartPatchGenerationStagingRepository(base.database.db, base.root)
  await staging.recoverAfterRestart()
  const lifecycle = new ProjectGenerationStagingLifecycle(base.staging, staging)
  const service = new ProjectService({
    autosaveOptions: { debounceMs: 60_000, leaseRegistry: new ProjectAutosaveLeaseRegistry() },
    dataRoot: base.root,
    inspectTemporaryRecovery: (projectKey) => inspectTemporaryRecovery(lifecycle, projectKey),
    readLastActualSeed: (tabId, documentId) => base.staging.readLastActualSeed(tabId, documentId),
    repository,
    roots: {
      placeholdersDir: path.resolve('src/main/projects/placeholders'),
      scratchDir: base.scratch,
    },
    shadow,
  })
  const tab = await service.create({ height: 64, title: 'Public Smart Patch boundary', width: 64 })
  const owner = service.getOpenDocumentForAcceptance(tab.id)!
  const document = structuredClone(owner.document)
  document.generationDraft.positivePrompt.text = 'Independent normal inputs'
  document.primaryBbox = { height: 64, width: 64, x: 400, y: -200 }
  const target = paintedPatchFixture(document)
  target.name = 'Public target'
  target.boundingBox = { height: 128, width: 128, x: -9, y: 13 }
  target.internalResolution = { height: 64, width: 64 }
  target.generationDraft = structuredClone(base.material.manifest.context.generationDraft)
  target.generationDraft.positivePrompt = { embeddingRefs: [], text: '{first|second}' }
  target.generationDraft.negativePrompt = { embeddingRefs: [], text: 'blur' }
  target.generationDraft.loras = []
  target.generationDraft.dynamicPrompt = { maxPrompts: 2, seedBehavior: 'per-prompt' }
  target.generationDraft.seed = { policy: 'fixed', value: 0 }
  target.maskSettings = { blur: 0, padding: 8 }
  target.coherenceSettings = { edgeSize: 0, minimumDenoise: 0, mode: 'Gaussian Blur' }
  if (mode !== 'inpaint') {
    target.mask = { asset: null, id: target.mask.id, revision: 0 }
  }
  const neighbor = { ...paintedPatchFixture(document), name: 'Neighbor Patch' }
  neighbor.mask = { asset: null, id: neighbor.mask.id, revision: 0 }
  neighbor.generationDraft = structuredClone(target.generationDraft)
  neighbor.boundingBox = { height: 128, width: 128, x: 300, y: 300 }
  neighbor.internalResolution = { height: 64, width: 64 }
  const sourceBytes = literalSmartPatchColorPng(
    128,
    128,
    Array.from({ length: 128 * 128 }, () => [70, 80, 90, 255]).flat(),
    4,
  )
  const lower = raster(sourceBytes, target.boundingBox)
  document.layers = mode !== 'txt2img' ? [target, lower, neighbor] : [target, neighbor]
  const assets = {
    ...(target.mask.asset ? { [target.mask.asset.path]: { bytes: fixtureMaskPng() } } : {}),
    ...(mode !== 'txt2img' ? { [lower.asset.path]: { bytes: sourceBytes } } : {}),
  }
  await owner.applyDocument(document, assets)
  await service.save(tab.id)
  await service.clearHistory(tab.id)
  const savedBytes = await readFile(owner.filePath)
  const models = { ...base.modelService, ...base.models }
  const normalProcessor = new GenerationProcessor(base.queue, base.staging, models, base.scratch)
  const orchestrator = new GenerationOrchestrator(
    service,
    repository,
    models,
    base.queue,
    base.staging,
    normalProcessor,
    base.scratch,
  )
  const cpu = await createSourceOutputWorkerOwner(base)
  const worker = await cpu.start(new AbortController().signal)
  const runtime = new ControlledSmartRuntime(worker)
  let beforeOutputReturn: (() => Promise<void>) | null = null
  let afterOutputClose: (() => void) | null = null
  const execution = orchestrator.createSmartPatchExecution(staging, {
    start: async (signal) => {
      const client = await cpu.start(signal)
      return {
        close: async () => {
          await client.close()
          afterOutputClose?.()
        },
        composeSmartPatchOutput: async (input) => {
          const result = await client.composeSmartPatchOutput(input)
          await beforeOutputReturn?.()
          return result
        },
      }
    },
  })
  const dispatch = new GenerationDispatchCoordinator(
    runtime,
    orchestrator,
    normalProcessor,
    base.scratch,
    { execution, nextPending: () => orchestrator.nextDispatchableKind() },
  )
  const gate = new ProjectGenerationOperationGate()
  const normalActions = new ProjectGenerationActionController({
    dispatch,
    gate,
    models,
    orchestrator,
    processor: normalProcessor,
    projects: service,
    queue: base.queue,
    runtime,
    scratchBasePath: base.scratch,
    staging: base.staging,
  })
  let wakes = 0
  const controller = new ProjectSmartPatchGenerationActionController({
    gate,
    models,
    orchestrator,
    projects: service,
    queue: base.queue,
    runtime,
    scratchBasePath: base.scratch,
    seedReader: base.staging,
    staging,
    wakeDispatch: () => {
      wakes++
    },
  })
  const results = new ProjectSmartPatchResultResource({
    projects: service,
    queue: base.queue,
    readLastActualSeed: (tabId, documentId) => base.staging.readLastActualSeed(tabId, documentId),
    staging,
  })
  const acceptance = new ProjectSmartPatchAcceptance({
    gate,
    journal: new SmartPatchAcceptanceJournalRepository(base.database.db),
    normalStaging: base.staging,
    orchestrator,
    projects: service,
    queue: base.queue,
    staging,
  })
  const rasterAcceptance = new ProjectGenerationAcceptance({
    documents: { getOpenDocument: (id) => service.getOpenDocumentForAcceptance(id) },
    gate,
    journal: new GenerationAcceptanceJournalRepository(base.database.db),
    orchestrator,
    queue: base.queue,
    smartPatch: { orchestrator, queue: base.queue, staging },
    staging: base.staging,
  })
  const acceptanceRecovery = new ProjectGenerationAcceptanceRecovery({
    documents: service,
    gate,
    orchestrator,
    raster: rasterAcceptance,
    readKind: (id, documentId) => readGenerationAcceptanceKind(base.database.db, id, documentId),
    smartPatch: acceptance,
  })
  let destination: { canceled: false; filePath: string } | { canceled: true } = { canceled: true }
  let actionWorkerAvailable = true
  const actions = new ProjectSmartPatchResultActions({
    acceptance,
    chooseDestination: async () => destination,
    gate,
    normalStaging: base.staging,
    orchestrator,
    projects: service,
    queue: base.queue,
    rasterAcceptance,
    staging,
    withWorker: async (use) => (actionWorkerAvailable ? await use(worker) : null),
  })
  const close = new ProjectGenerationClose(
    service,
    { orchestrator, queue: base.queue, staging: lifecycle },
    gate,
    (tabId) => acceptanceRecovery.hasPendingHandoff(tabId),
  )
  const request = (layerId = target.id): ProjectSmartPatchGenerateOptions => ({
    documentId: owner.document.documentId,
    documentRevision: owner.document.documentRevision,
    iterations: 1,
    kind: 'smart-patch',
    layerId,
  })
  return {
    acceptance,
    acceptanceRecovery,
    actions,
    base,
    close,
    controller,
    cpu,
    dispatch,
    execution,
    gate,
    lifecycle,
    models,
    neighbor,
    normalActions,
    normalProcessor,
    orchestrator,
    owner,
    rasterAcceptance,
    request,
    results,
    runtime,
    savedBytes,
    service,
    setActionWorkerAvailable: (value: boolean) => {
      actionWorkerAvailable = value
    },
    setAfterOutputClose: (hook: typeof afterOutputClose) => {
      afterOutputClose = hook
    },
    setBeforeOutputReturn: (hook: typeof beforeOutputReturn) => {
      beforeOutputReturn = hook
    },
    setDestination: (value: typeof destination) => {
      destination = value
    },
    shadow,
    staging,
    tabId: tab.id,
    target,
    wakes: () => wakes,
    worker,
  }
}

for (const family of ['illustrious', 'anima'] as const) {
  test(
    `public ${family} Random and Reuse use only confirmed cursor; canceled work never advances it`,
    options,
    async () => {
      await withPublicFixture(family, async (f) => {
        await f.service.updateGenerationDraft(
          f.tabId,
          { kind: 'seed', policy: 'reuse', value: null },
          undefined,
          f.target.id,
        )
        await assert.rejects(f.controller.generate(f.tabId, f.request()), {
          code: 'GENERATION_SEED_INVALID',
        })
        assert.deepEqual((await f.base.queue.listManagerPage()).items, [])
        await f.service.updateGenerationDraft(
          f.tabId,
          { kind: 'seed', policy: 'random', value: null },
          undefined,
          f.target.id,
        )
        const before = structuredClone(f.owner.document)
        await queued(f)
        assert.equal(await f.base.staging.readLastActualSeed(f.tabId, before.documentId), null)
        await drain(f)
        const generated = f.runtime.generated.map(({ inference }) => inference.sampling.seed)
        assert.equal(generated.length, 2)
        assert.ok(
          Number.isSafeInteger(generated[0]) && generated[0] >= 0 && generated[0] <= 0xff_ff_ff_ff,
        )
        assert.equal(generated[1], (generated[0] + 1) % 2 ** 32)
        assert.equal(
          await f.base.staging.readLastActualSeed(f.tabId, before.documentId),
          generated[1],
        )
        assert.deepEqual(f.owner.document, before)
        await f.service.updateGenerationDraft(
          f.tabId,
          { kind: 'seed', policy: 'reuse', value: null },
          undefined,
          f.target.id,
        )
        const review = await f.controller.generate(f.tabId, f.request())
        assert.equal(review.kind, 'confirmation-required')
        if (review.kind !== 'confirmation-required') {
          assert.fail('Replacement requires reviewed results.')
        }
        const replacement = await f.controller.generate(f.tabId, {
          ...f.request(),
          confirmation: {
            candidateIds: review.candidateIds,
            unfinishedJobIds: review.unfinishedJobIds,
          },
        })
        assert.equal(replacement.kind, 'queued')
        if (replacement.kind !== 'queued') {
          assert.fail('Reviewed Reuse must queue concrete work.')
        }
        for (const id of replacement.jobIds) {
          const read = await f.base.queue.loadVerifiedSmartPatchInput(id)
          const offset = replacement.jobIds.indexOf(id)
          assert.equal(read.payload.item.item.seed, (generated[1] + offset) % 2 ** 32)
          const row = await f.base.queue.getManagerEntry(id)
          await f.normalActions.cancelJob({ id, statusSequence: row.statusSequence })
        }
        assert.equal((await f.dispatch.runNext()).kind, 'idle')
        assert.equal(
          await f.base.staging.readLastActualSeed(f.tabId, before.documentId),
          generated[1],
        )
        assert.equal(f.runtime.generated.length, 2)
      })
    },
  )
}

test(
  'public Smart batch admission refuses 34 planned jobs before CPU work and preserves existing results',
  options,
  async () => {
    await withPublicFixture('illustrious', async (f) => {
      await queued(f)
      await drain(f)
      const snapshot = await f.results.list(f.tabId)
      const rows = await f.base.queue.listManagerPage()
      const document = structuredClone(f.owner.document)
      let preparations = 0
      f.runtime.beforePreparation = async () => {
        preparations++
      }
      await assert.rejects(
        f.controller.generate(f.tabId, {
          ...f.request(),
          confirmation: {
            candidateIds: snapshot.candidates.map(({ candidateId }) => candidateId),
            unfinishedJobIds: [],
          },
          iterations: 17,
        }),
        { code: 'BATCH_TOO_LARGE' },
      )
      assert.equal(preparations, 0)
      assert.deepEqual(await f.results.list(f.tabId), snapshot)
      assert.deepEqual(await f.base.queue.listManagerPage(), rows)
      assert.deepEqual(f.owner.document, document)
    })
  },
)

async function queued(f: PublicFixture, layerId = f.target.id) {
  const result = await f.controller.generate(f.tabId, f.request(layerId))
  assert.equal(result.kind, 'queued')
  assert.equal(result.targetKind, 'smart-patch')
  assert.equal(result.layerId, layerId)
  if (result.kind !== 'queued') {
    assert.fail('The public Generate must durably queue its batch.')
  }
  return result
}
async function drain(f: PublicFixture) {
  for (let count = 0; count < 16; count++) {
    const result = await f.dispatch.runNext()
    if (result.kind === 'idle') {
      return
    }
    assert.equal(result.kind, 'completed')
  }
  assert.fail('The finite public batch must drain completely.')
}

async function waitForRetryCompletion(f: PublicFixture, id: string): Promise<void> {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    const item = await f.base.queue.getManagerEntry(id)
    if (item.status === 'completed') {
      // Publication precedes physical CPU close; wait for the owning drain to settle as well.
      if ((await f.normalActions.getState(f.tabId)).phase === 'idle') {
        return
      }
    } else if (item.status === 'failed' || item.status === 'canceled') {
      assert.fail(`Retry ended ${item.status}: ${item.error?.message}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  assert.fail('The concrete retry did not complete within the bounded fixture deadline.')
}

// Boundary: public controller -> shared dispatch -> real CPU preparation/output -> signed typed
// Results. Neighbor: same literal source with null mask derives img2img; no source derives txt2img.
// Mutation: use normal draft/bbox, bypass CPU world composition, publish Raster candidates, or
// accept/save implicitly on completion.
for (const family of ['illustrious', 'anima'] as const) {
  for (const mode of ['inpaint', 'img2img', 'txt2img'] as const) {
    test(
      `public ${family} ${mode} Generate publishes exact typed world candidates without changing Project or saved package`,
      options,
      async () => {
        await withPublicFixture(
          family,
          async (f) => {
            const document = structuredClone(f.owner.document)
            const batch = await queued(f)
            assert.equal(batch.jobIds.length, 2)
            assert.equal(f.wakes(), 1)
            const pending = await f.results.list(f.tabId)
            assert.equal(isProjectSmartPatchResultsSnapshot(pending), true)
            assert.deepEqual(
              pending.targets.flatMap(({ unfinishedJobIds }) => unfinishedJobIds).sort(),
              [...batch.jobIds].sort(),
            )
            await drain(f)
            const snapshot = await f.results.list(f.tabId)
            assert.equal(isProjectSmartPatchResultsSnapshot(snapshot), true)
            assert.equal(snapshot.candidates.length, 2)
            assert.deepEqual(
              snapshot.targets.flatMap(({ unfinishedJobIds }) => unfinishedJobIds),
              [],
            )
            assert.deepEqual(
              f.runtime.generated.map(({ mode }) => mode),
              [mode, mode],
            )
            assert.deepEqual(
              f.runtime.generated.map(({ inference }) => inference.sampling.seed),
              [0, 1],
            )
            assert.equal(f.runtime.maximum, 1)
            for (const candidate of snapshot.candidates) {
              assert.equal(candidate.kind, 'smart-patch-world-candidate')
              assert.equal(candidate.layerId, f.target.id)
              assert.equal(candidate.disposition, 'available')
              assert.deepEqual(candidate.bbox, f.target.boundingBox)
              const bytes = await f.results.readImage(candidate.imageUrl)
              assert.ok(bytes)
              const alpha = decodeTargetPngAlpha(bytes, 128, 128)
              const expected = Buffer.alloc(128 * 128, mode === 'inpaint' ? 0 : 255)
              if (mode === 'inpaint') {
                // The 2×2 authored soft mask touches the first latent cell. A 128 world /
                // 64 processing / 8 latent mapping expands that cell to 16×16 world
                // pixels, even with zero coherence radius and zero final fade. The
                // original authored nonzero core lies entirely inside this literal cell.
                for (let y = 0; y < 16; y++) {
                  expected.fill(255, y * 128, y * 128 + 16)
                }
              }
              assert.deepEqual(
                alpha,
                expected,
                'Actual CPU world contribution has the literal expanded latent-cell alpha and derived source mode.',
              )
            }
            assert.deepEqual(
              await f.base.staging.listVerifiedCandidates(f.tabId),
              [],
              'Dedicated Smart pixels never become ordinary Raster candidates.',
            )
            assert.deepEqual(f.owner.document, document)
            assert.equal(f.owner.canUndo, false)
            assert.equal(f.owner.dirty, false)
            assert.deepEqual(await readFile(f.owner.filePath), f.savedBytes)
            assert.deepEqual((await readIgsPackage(f.owner.filePath)).project, document)
          },
          mode,
        )
      },
    )
  }
}

test(
  'public Generate freezes the clicked Patch before a delayed runtime lease while later owned edits remain independent',
  options,
  async () => {
    await withPublicFixture('illustrious', async (f) => {
      const started = deferred()
      const release = deferred()
      const original = structuredClone(f.owner.document)
      f.runtime.beforePreparation = async () => {
        started.resolve()
        await release.promise
      }
      const generating = f.controller.generate(f.tabId, f.request())
      await Promise.race([
        started.promise,
        generating.then(() => assert.fail('Preparation must enter the controlled barrier.')),
      ])
      try {
        await f.service.updateGenerationDraft(
          f.tabId,
          { kind: 'positive-prompt', text: 'Later owned prompt' },
          undefined,
          f.target.id,
        )
        await f.service.updateSmartPatchLayer(f.tabId, f.target.id, {
          kind: 'bounding-box',
          rect: { ...f.target.boundingBox, x: 30 },
        })
      } finally {
        release.resolve()
      }
      assert.equal((await generating).kind, 'queued')
      f.runtime.beforePreparation = null
      const changed = structuredClone(f.owner.document)
      await drain(f)
      assert.deepEqual(f.owner.document, changed)
      const [candidate] = await f.staging.listVerifiedCandidates(f.tabId)
      assert.deepEqual(candidate.payload.context.bbox, patch(original, f.target.id).boundingBox)
      assert.deepEqual(
        candidate.payload.context.generationDraft,
        patch(original, f.target.id).generationDraft,
      )
      assert.equal(
        patch(f.owner.document, f.target.id).generationDraft.positivePrompt.text,
        'Later owned prompt',
      )
      assert.deepEqual(f.owner.document.generationDraft, original.generationDraft)
      assert.deepEqual(await readFile(f.owner.filePath), f.savedBytes)
    })
  },
)

test(
  'public Add refuses a document edit committed ahead of its gate admission and a fresh reviewed click still accepts the outdated result',
  options,
  async () => {
    await withPublicFixture('illustrious', async (f) => {
      await queued(f)
      await drain(f)
      const snapshot = await f.results.list(f.tabId)
      const request = acceptRequest(f, snapshot.candidates)
      const sql = async () => ({
        journal: await f.base.database.db
          .selectFrom('generation_acceptance_journal')
          .selectAll()
          .execute(),
        queue: await f.base.queue.listManagerPage(),
        receipts: await f.base.database.db
          .selectFrom('generation_candidate_receipt')
          .selectAll()
          .execute(),
        tombstones: await f.base.database.db
          .selectFrom('generation_staging_discarded_session')
          .selectAll()
          .execute(),
      })
      const originalSql = await sql()
      const entered = deferred()
      const release = deferred()
      const addWaiting = deferred()
      const originalRun = f.gate.run
      let observeAdd = false
      // This observer exposes admission to the actual gate; it never applies an Add or edits data.
      f.gate.run = async function <T>(tabId: string, use: () => Promise<T>): Promise<T> {
        if (observeAdd) {
          addWaiting.resolve()
        }
        return (await originalRun.call(this, tabId, use)) as T
      }
      const editing = f.gate.run(f.tabId, async () => {
        entered.resolve()
        await release.promise
        await f.service.updateGenerationDraft(
          f.tabId,
          { kind: 'positive-prompt', text: 'Committed ahead of Add' },
          undefined,
          f.target.id,
        )
      })
      await entered.promise
      observeAdd = true
      const adding = f.actions.accept(f.tabId, request)
      try {
        await Promise.race([
          addWaiting.promise,
          adding.then(() => assert.fail('Add must wait behind the gated edit.')),
        ])
        release.resolve()
        await editing
        const changed = structuredClone(f.owner.document)
        await assert.rejects(adding, { code: 'PROJECT_DOCUMENT_CHANGED' })
        assert.deepEqual(f.owner.document, changed)
        assert.deepEqual(
          await sql(),
          originalSql,
          'Refused Add cannot journal, cancel, tombstone or rewrite receipts.',
        )
        assert.deepEqual((await f.results.list(f.tabId)).candidates, snapshot.candidates)
        assert.deepEqual(patch(f.owner.document, f.target.id).rasterSubLayers, [])
        assert.deepEqual(await readFile(f.owner.filePath), f.savedBytes)
      } finally {
        release.resolve()
        f.gate.run = originalRun
        await editing
      }
      await f.actions.accept(f.tabId, acceptRequest(f, snapshot.candidates))
      const accepted = patch(f.owner.document, f.target.id)
      assert.equal(accepted.generationDraft.positivePrompt.text, 'Committed ahead of Add')
      assert.equal(accepted.rasterSubLayers.length, 2)
      assert.ok(
        accepted.rasterSubLayers.every(
          ({ generationProvenance }) =>
            generationProvenance.layerSourceContext.generationDraft.positivePrompt.text ===
            '{first|second}',
        ),
      )
    })
  },
)

test(
  'public admission refuses stale, hidden, locked and legacy peers while keeping existing Smart results byte-exact',
  options,
  async () => {
    await withPublicFixture('illustrious', async (f) => {
      await queued(f)
      await drain(f)
      const candidates = await f.results.list(f.tabId)
      const original = structuredClone(f.owner.document)
      const rows = await f.base.queue.listManagerPage()
      const refuse = async (request: ProjectSmartPatchGenerateOptions) => {
        await assert.rejects(f.controller.generate(f.tabId, request))
        assert.deepEqual(await f.results.list(f.tabId), candidates)
        assert.deepEqual(await f.base.queue.listManagerPage(), rows)
      }
      await refuse({ ...f.request(), documentRevision: randomUUID() })
      await refuse({ ...f.request(), documentId: randomUUID() })
      await refuse({ ...f.request(), layerId: randomUUID() })
      for (const setting of [
        { kind: 'lock' as const, locked: true },
        { kind: 'visibility' as const, visible: false },
      ]) {
        await f.service.updateSmartPatchLayer(f.tabId, f.target.id, setting)
        const changed = structuredClone(f.owner.document)
        await assert.rejects(f.controller.generate(f.tabId, f.request()))
        assert.deepEqual(f.owner.document, changed)
        assert.deepEqual(
          (await f.results.list(f.tabId)).candidates.map(({ candidateId }) => candidateId),
          candidates.candidates.map(({ candidateId }) => candidateId),
        )
        await f.service.undo(f.tabId)
      }
      f.runtime.ready.capabilities = f.runtime.ready.capabilities.filter(
        (value) => value !== 'smart-patch-seed-confirmation',
      )
      await assert.rejects(
        f.controller.generate(f.tabId, {
          ...f.request(),
          confirmation: {
            candidateIds: candidates.candidates.map(({ candidateId }) => candidateId),
            unfinishedJobIds: [],
          },
        }),
      )
      assert.deepEqual(patch(f.owner.document, f.target.id), patch(original, f.target.id))
      assert.equal((await f.staging.listVerifiedCandidates(f.tabId)).length, 2)
    })
  },
)

test(
  'Smart replacement reviews only its exact Patch and preserves sibling candidates and unrelated normal jobs',
  options,
  async () => {
    await withPublicFixture('illustrious', async (f) => {
      await queued(f, f.neighbor.id)
      await drain(f)
      const sibling = (await f.results.list(f.tabId)).candidates
      await queued(f)
      await drain(f)
      const before = await f.results.list(f.tabId)
      const own = before.candidates.filter(({ layerId }) => layerId === f.target.id)
      // Ordinary queued input is a declared neighboring precondition, not the Smart Generate action
      // being qualified. Real request compilation/SQL own it; it must survive target replacement.
      const normalPrepared = {
        context: structuredClone(f.base.prepared.context),
        targetPngBytes: Buffer.from(f.base.prepared.targetPngBytes),
      }
      normalPrepared.context.documentId = f.owner.document.documentId
      normalPrepared.context.documentRevision = f.owner.document.documentRevision
      const normal = await enqueueAnimaStagingBatch({
        ...f.base,
        prepared: normalPrepared,
        projectPath: f.owner.filePath,
      })
      const normalSentinel = await f.base.queue.listUnfinishedNormalByProjectDocument(
        f.tabId,
        f.owner.document.documentId,
      )
      assert.ok(normalSentinel.length > 0)
      const review = await f.controller.generate(f.tabId, f.request())
      assert.equal(review.kind, 'confirmation-required')
      if (review.kind !== 'confirmation-required') {
        assert.fail('Existing own candidates require review.')
      }
      assert.deepEqual(review.candidateIds.sort(), own.map(({ candidateId }) => candidateId).sort())
      assert.deepEqual((await f.results.list(f.tabId)).candidates, before.candidates)
      const replacement = await f.controller.generate(f.tabId, {
        ...f.request(),
        confirmation: {
          candidateIds: review.candidateIds,
          unfinishedJobIds: review.unfinishedJobIds,
        },
      })
      assert.equal(replacement.kind, 'queued')
      const after = await f.results.list(f.tabId)
      assert.deepEqual(after.candidates, sibling)
      for (const candidate of sibling) {
        assert.ok(await f.results.readImage(candidate.imageUrl))
      }
      for (const candidate of own) {
        assert.equal(await f.results.readImage(candidate.imageUrl), null)
      }
      assert.deepEqual(
        await f.base.queue.listUnfinishedNormalByProjectDocument(
          f.tabId,
          f.owner.document.documentId,
        ),
        normalSentinel,
      )
      for (const item of normal.items) {
        await f.base.queue.cancel(item.id)
      }
      await drain(f)
      assert.equal((await f.results.list(f.tabId)).candidates.length, 4)
      assert.deepEqual(await readFile(f.owner.filePath), f.savedBytes)
    })
  },
)

function acceptRequest(
  f: PublicFixture,
  candidates: Awaited<ReturnType<PublicFixture['results']['list']>>['candidates'],
) {
  return {
    candidateIds: candidates.map(({ candidateId }) => candidateId),
    documentId: f.owner.document.documentId,
    documentRevision: f.owner.document.documentRevision,
    expectedAvailableIds: candidates.map(({ candidateId }) => candidateId),
    expectedUnfinishedJobIds: [] as string[],
    focusedCandidateId: candidates[0]?.candidateId ?? null,
    kind: 'smart-patch' as const,
    layerId: f.target.id,
  }
}

// Public identity-only Add -> real journal/acceptor -> shadow/history -> ZIP Save/reopen.
// Mutation: use current authoring as provenance, lose the accepted focus anchor, accept as Raster,
// or consume temporary images before the document owns their bytes.
for (const family of ['illustrious', 'anima'] as const) {
  test(
    `public ${family} Results Add owns actual world contributions in one Undo and preserves exact provenance through Save/reopen`,
    options,
    async () => {
      await withPublicFixture(family, async (f) => {
        const original = structuredClone(f.owner.document)
        await queued(f)
        await drain(f)
        const snapshot = await f.results.list(f.tabId)
        const images = new Map(
          await Promise.all(
            snapshot.candidates.map(
              async (candidate) =>
                [candidate.candidateId, await f.results.readImage(candidate.imageUrl)] as const,
            ),
          ),
        )
        const input = acceptRequest(f, snapshot.candidates)
        const added = await f.actions.accept(f.tabId, input)
        assert.equal(added.dirty, true)
        const accepted = structuredClone(f.owner.document)
        assert.equal(accepted.layers.length, original.layers.length)
        assert.deepEqual(accepted.generationDraft, original.generationDraft)
        assert.deepEqual(
          accepted.layers.filter(({ id }) => id !== f.target.id),
          original.layers.filter(({ id }) => id !== f.target.id),
        )
        const target = patch(accepted, f.target.id)
        assert.equal(target.rasterSubLayers.length, 2)
        const anchor = target.rasterSubLayers.find(
          ({ id }) => id === target.activeRasterSubLayerId,
        )!
        assert.equal(
          anchor.generationProvenance.executionResultContext.candidateId,
          input.focusedCandidateId,
        )
        for (const variant of target.rasterSubLayers) {
          const provenance = variant.generationProvenance
          assert.deepEqual(
            provenance.layerSourceContext.generationDraft,
            patch(original, f.target.id).generationDraft,
          )
          assert.deepEqual(provenance.layerSourceContext.bbox, f.target.boundingBox)
          assert.deepEqual(provenance.layerSourceContext.mask, f.target.mask)
          assert.equal(provenance.layerSourceContext.layerId, f.target.id)
          assert.ok(images.get(provenance.executionResultContext.candidateId))
        }
        assert.deepEqual((await f.results.list(f.tabId)).candidates, [])
        assert.deepEqual(await readFile(f.owner.filePath), f.savedBytes)
        assert.equal((await f.service.undo(f.tabId)).canUndo, false)
        assert.deepEqual(f.owner.document.layers, original.layers)
        await f.service.redo(f.tabId)
        assert.deepEqual(f.owner.document.layers, accepted.layers)
        await f.service.save(f.tabId)
        const saved = await readIgsPackage(f.owner.filePath)
        assert.deepEqual(patch(saved.project, f.target.id).rasterSubLayers, target.rasterSubLayers)
        for (const variant of target.rasterSubLayers) {
          assert.deepEqual(
            await saved.readMember(variant.asset.path),
            images.get(variant.generationProvenance.executionResultContext.candidateId),
          )
        }
        await f.service.close(f.tabId)
        assert.equal((await f.service.open(f.tabId)).kind, 'opened')
        assert.deepEqual(
          patch(f.service.getOpenDocumentForAcceptance(f.tabId)!.document, f.target.id),
          target,
        )
      })
    },
  )
}

test(
  'public Add to an edited eligible Patch retains frozen metadata and reports outdated without replacing current authoring',
  options,
  async () => {
    await withPublicFixture('illustrious', async (f) => {
      await queued(f)
      await drain(f)
      const original = structuredClone(f.owner.document)
      const snapshot = await f.results.list(f.tabId)
      await f.service.updateGenerationDraft(
        f.tabId,
        { kind: 'positive-prompt', text: 'New current authoring' },
        undefined,
        f.target.id,
      )
      const current = structuredClone(f.owner.document)
      await f.actions.accept(f.tabId, acceptRequest(f, snapshot.candidates))
      const target = patch(f.owner.document, f.target.id)
      assert.deepEqual(target.generationDraft, patch(current, f.target.id).generationDraft)
      for (const variant of target.rasterSubLayers) {
        assert.deepEqual(
          variant.generationProvenance.layerSourceContext.generationDraft,
          patch(original, f.target.id).generationDraft,
        )
      }
      const status = await f.service.getSmartPatchVariants(
        f.tabId,
        f.target.id,
        f.owner.document.documentId,
        f.owner.document.documentRevision,
        f.worker,
      )
      assert.ok(
        status.variants.every(
          ({ changedInputs, status }) =>
            status === 'outdated' && changedInputs.includes('generation-draft'),
        ),
      )
    })
  },
)

test(
  'a completion during replacement preparation renews the review and preserves all original results without replacement rows',
  options,
  async () => {
    await withPublicFixture('illustrious', async (f) => {
      const batch = await queued(f)
      assert.equal((await f.dispatch.runNext()).kind, 'completed')
      const review = await f.controller.generate(f.tabId, f.request())
      assert.equal(review.kind, 'confirmation-required')
      if (review.kind !== 'confirmation-required') {
        assert.fail('Expected reviewed partial batch.')
      }
      assert.equal(review.candidateIds.length, 1)
      assert.equal(review.unfinishedJobIds.length, 1)
      const entered = deferred()
      const release = deferred()
      f.runtime.beforePreparation = async () => {
        entered.resolve()
        await release.promise
      }
      const replacing = f.controller.generate(f.tabId, {
        ...f.request(),
        confirmation: {
          candidateIds: review.candidateIds,
          unfinishedJobIds: review.unfinishedJobIds,
        },
      })
      await Promise.race([
        entered.promise,
        replacing.then(() => assert.fail('Replacement must enter preparation.')),
      ])
      try {
        assert.equal((await f.dispatch.runNext()).kind, 'completed')
      } finally {
        release.resolve()
      }
      const changed = await replacing
      assert.equal(changed.kind, 'confirmation-required')
      if (changed.kind !== 'confirmation-required') {
        assert.fail('The late completion must require renewed review.')
      }
      assert.equal(changed.candidateIds.length, 2)
      assert.deepEqual(changed.unfinishedJobIds, [])
      assert.equal((await f.results.list(f.tabId)).candidates.length, 2)
      assert.deepEqual(
        (await f.base.queue.listManagerPage()).items.map(({ id }) => id).sort(),
        [...batch.jobIds].sort(),
      )
      assert.deepEqual(await readFile(f.owner.filePath), f.savedBytes)
    })
  },
)

test(
  'public Cancel waits for an admitted actual CPU output callback after physical exit and cannot publish its late candidate',
  options,
  async () => {
    await withPublicFixture('illustrious', async (f) => {
      const batch = await queued(f)
      const entered = deferred()
      const release = deferred()
      const exited = deferred()
      f.setBeforeOutputReturn(async () => {
        entered.resolve()
        await release.promise
      })
      f.setAfterOutputClose(exited.resolve)
      const running = f.dispatch.runNext()
      await Promise.race([
        entered.promise,
        running.then(() => assert.fail('Actual CPU output must enter the callback barrier.')),
      ])
      const row = (await f.base.queue.listManagerPage()).items.find(
        ({ status }) => status === 'running',
      )!
      assert.ok(batch.jobIds.includes(row.id))
      let finished = false
      const cancel = f.normalActions
        .cancelCurrent(f.tabId, f.owner.document.documentId, row.id)
        .then((result) => {
          finished = true
          return result
        })
      try {
        await exited.promise
        const pid = await f.cpu.pid()
        assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' })
        assert.equal(
          finished,
          false,
          'Physical exit cannot release the still-admitted callback lease.',
        )
        assert.equal((await f.base.queue.getManagerEntry(row.id)).status, 'running')
        assert.deepEqual((await f.results.list(f.tabId)).candidates, [])
      } finally {
        release.resolve()
      }
      await cancel
      assert.equal((await running).kind, 'canceled')
      assert.equal((await f.base.queue.getManagerEntry(row.id)).status, 'canceled')
      assert.deepEqual((await f.results.list(f.tabId)).candidates, [])
      assert.equal(
        await f.base.staging.readLastActualSeed(f.tabId, f.owner.document.documentId),
        null,
      )
      assert.deepEqual(await readdir(f.base.scratch), [])
      assert.deepEqual(await readFile(f.owner.filePath), f.savedBytes)
    })
  },
)

test(
  'public Project Close reviews Smart presence, preserves declined impact and revokes candidates only after confirmed close',
  options,
  async () => {
    await withPublicFixture('illustrious', async (f) => {
      await queued(f)
      assert.equal((await f.dispatch.runNext()).kind, 'completed')
      const before = await f.results.list(f.tabId)
      assert.deepEqual(await f.close.getCloseImpact(f.tabId), {
        completedCandidateCount: 1,
        generationStorageUnavailable: false,
        unfinishedJobCount: 1,
      })
      await assert.rejects(
        f.close.close(f.tabId, { confirmCloseImpact: false, discardDocument: false }),
        { code: 'PROJECT_CLOSE_CONFIRMATION_REQUIRED' },
      )
      assert.deepEqual(await f.results.list(f.tabId), before)
      assert.ok(await f.results.readImage(before.candidates[0].imageUrl))
      await f.close.close(f.tabId, { confirmCloseImpact: true, discardDocument: false })
      assert.equal(f.service.getOpenDocumentForAcceptance(f.tabId), null)
      assert.equal(await f.results.readImage(before.candidates[0].imageUrl), null)
      assert.deepEqual(await f.staging.listVerifiedCandidates(f.tabId), [])
      assert.deepEqual(await f.base.queue.listUnfinishedByProject(f.tabId), [])
      assert.deepEqual(await readFile(f.owner.filePath), f.savedBytes)
      assert.equal((await f.service.open(f.tabId)).kind, 'opened')
    })
  },
)

test(
  'orphaned Smart results retain signed/exportable pixels and reviewed discard without retargeting or a runtime',
  options,
  async () => {
    await withPublicFixture('illustrious', async (f) => {
      await queued(f)
      await drain(f)
      const initial = await f.results.list(f.tabId)
      const image = await f.results.readImage(initial.candidates[0].imageUrl)
      const next = structuredClone(f.owner.document)
      next.layers = next.layers.filter(({ id }) => id !== f.target.id)
      await f.owner.applyDocument(next)
      const document = structuredClone(f.owner.document)
      const orphaned = await f.results.list(f.tabId)
      assert.ok(
        orphaned.candidates.every(
          ({ disposition, unavailableReason }) =>
            disposition === 'orphaned' && typeof unavailableReason === 'string',
        ),
      )
      f.setActionWorkerAvailable(false)
      await assert.rejects(f.actions.accept(f.tabId, acceptRequest(f, orphaned.candidates)))
      assert.deepEqual(f.owner.document, document)
      assert.ok(await f.results.readImage(initial.candidates[0].imageUrl))
      const exportPath = path.join(f.base.root, 'explicit-orphan-export.png')
      f.setDestination({ canceled: false, filePath: exportPath })
      assert.equal(
        (
          await f.actions.save(f.tabId, {
            candidateId: initial.candidates[0].candidateId,
            documentId: initial.documentId,
            layerId: f.target.id,
            stagingSessionId: initial.candidates[0].stagingSessionId,
          })
        ).kind,
        'saved',
      )
      assert.deepEqual(await readFile(exportPath), image)
      await f.actions.discard(f.tabId, {
        documentId: f.owner.document.documentId,
        documentRevision: f.owner.document.documentRevision,
        expectedAvailableIds: orphaned.candidates.map(({ candidateId }) => candidateId),
        expectedUnfinishedJobIds: [],
        kind: 'smart-patch',
        layerId: f.target.id,
        sourceDocumentId: initial.documentId,
      })
      assert.deepEqual((await f.results.list(f.tabId)).candidates, [])
      assert.equal(await f.results.readImage(initial.candidates[0].imageUrl), null)
      assert.deepEqual(f.owner.document, document)
      assert.deepEqual(await readFile(f.owner.filePath), f.savedBytes)
    })
  },
)

function rasterRequest(
  f: PublicFixture,
  candidates: Awaited<ReturnType<PublicFixture['results']['list']>>['candidates'],
): ProjectSmartPatchRasterAcceptRequest {
  return { ...acceptRequest(f, candidates), kind: 'smart-patch-raster' }
}

async function orphanTarget(f: PublicFixture) {
  const next = structuredClone(f.owner.document)
  next.layers = next.layers.filter(({ id }) => id !== f.target.id)
  await f.owner.applyDocument(next)
  await f.service.save(f.tabId)
  await f.service.clearHistory(f.tabId)
}

// Public identity-only Raster action -> shared recovery admission -> actual Smart staging reads,
// Raster journal, Project shadow/history and package writer/loader. Inference is controlled above;
// the already committed world PNG is the subject, and no image engine is available during Add.
for (const family of ['illustrious', 'anima'] as const) {
  test(
    `public ${family} orphan Raster Add preserves complete world PNG/provenance, siblings, explicit Save and one Undo`,
    options,
    async () => {
      await withPublicFixture(family, async (f) => {
        await queued(f)
        await drain(f)
        await queued(f, f.neighbor.id)
        await drain(f)
        await orphanTarget(f)
        const snapshot = await f.results.list(f.tabId)
        const own = snapshot.candidates.filter(({ layerId }) => layerId === f.target.id)
        const neighbors = snapshot.candidates.filter(({ layerId }) => layerId === f.neighbor.id)
        assert.equal(own.length, 2)
        assert.ok(own.every((candidate) => candidate.rasterConversionUnavailableReason === null))
        const stored = await f.staging.listVerifiedCandidates(f.tabId)
        const reads = await Promise.all(
          own.map((candidate) => {
            const verified = stored.find((entry) => entry.candidateId === candidate.candidateId)!
            return f.staging.readVerifiedCandidate({
              candidateId: candidate.candidateId,
              documentId: candidate.documentId,
              frozenPayloadSha256: verified.frozenPayloadSha256,
              imageSha256: verified.image.sha256,
              localProjectKey: f.tabId,
              stagingSessionId: candidate.stagingSessionId,
            })
          }),
        )
        const before = structuredClone(f.owner.document)
        const saved = await readFile(f.owner.filePath)
        const inferenceCount = f.runtime.generated.length
        f.runtime.available = false
        f.setActionWorkerAvailable(false)
        const request = rasterRequest(f, own)
        const tab = await f.acceptanceRecovery.withRasterAdd(f.tabId, () =>
          f.actions.acceptRaster(f.tabId, request),
        )
        const accepted = f.owner.document.layers.filter(isSmartPatchRasterLayer)
        assert.equal(accepted.length, 2)
        assert.equal(accepted.filter((layer) => layer.visible).length, 1)
        for (const layer of accepted) {
          assert.ok(layer.kind === 'raster' && layer.generationProvenance)
          const candidateId = layer.generationProvenance.executionResultContext.candidateId
          const read = reads[own.findIndex((candidate) => candidate.candidateId === candidateId)]
          assert.ok(read)
          const projected = await projectVerifiedSmartPatchVariant({
            acceptedAt: layer.generationProvenance.executionResultContext.acceptedAt,
            read,
            variantId: layer.id,
          })
          assert.deepEqual(layer.generationProvenance, projected.generationProvenance)
          assert.deepEqual(layer.asset, projected.asset)
          assert.deepEqual(layer.transform, {
            rotationDegrees: 0,
            scaleX: 1,
            scaleY: 1,
            x: read.candidate.bbox.x,
            y: read.candidate.bbox.y,
          })
        }
        assert.deepEqual(f.owner.document.layers.slice(2), before.layers)
        assert.deepEqual(f.owner.document.generationDraft, before.generationDraft)
        assert.deepEqual(f.owner.document.primaryBbox, before.primaryBbox)
        assert.equal(tab.acceptedResults.length, 2)
        assert.deepEqual((await f.results.list(f.tabId)).candidates, neighbors)
        assert.equal(f.runtime.generated.length, inferenceCount)
        assert.ok((await readFile(f.owner.filePath)).equals(saved), 'Raster Add must not Save.')
        await f.service.undo(f.tabId)
        assert.deepEqual(f.owner.document.layers, before.layers)
        assert.equal(f.owner.canUndo, false)
        assert.deepEqual((await f.results.list(f.tabId)).candidates, neighbors)
        await f.service.redo(f.tabId)
        assert.deepEqual(f.owner.document.layers.slice(0, 2), accepted)
        await f.service.save(f.tabId)
        const archive = await readIgsPackage(f.owner.filePath)
        assert.deepEqual(archive.project.layers.slice(0, 2), accepted)
        for (const layer of accepted) {
          const read = reads.find(
            (entry) =>
              entry?.candidate.candidateId ===
              layer.generationProvenance.executionResultContext.candidateId,
          )
          assert.ok(read)
          assert.ok((await archive.readMember(layer.asset.path)).equals(read.imagePngBytes))
        }
        const staleDocument = structuredClone(f.owner.document)
        await assert.rejects(f.actions.acceptRaster(f.tabId, request))
        assert.deepEqual(f.owner.document, staleDocument)
        assert.deepEqual((await f.results.list(f.tabId)).candidates, neighbors)
      })
    },
  )
}

test(
  'public orphan Raster Add cancels a reviewed fresh Retry session without a completed candidate',
  options,
  async () => {
    await withPublicFixture('anima', async (f) => {
      const batch = await queued(f)
      assert.equal((await f.dispatch.runNext()).kind, 'completed')
      await f.normalActions.cancelJob(await f.base.queue.getManagerEntry(batch.jobIds[1]))
      const source = await f.base.queue.getManagerEntry(batch.jobIds[1])
      const retry = await f.base.queue.retryPreparedSmartPatchTerminal(
        source.id,
        source.statusSequence,
        {
          assertCurrent: () => undefined,
          modelService: f.models,
        },
      )
      assert.notEqual(retry.stagingSessionId, source.stagingSessionId)
      const sourceWitness = await f.base.database.db
        .selectFrom('generation_queue_item')
        .selectAll()
        .where('id', '=', source.id)
        .executeTakeFirstOrThrow()
      await orphanTarget(f)
      const snapshot = await f.results.list(f.tabId)
      assert.equal(snapshot.candidates.length, 1)
      assert.deepEqual(snapshot.targets[0].unfinishedJobIds, [retry.id])
      const request = rasterRequest(f, snapshot.candidates)
      request.expectedUnfinishedJobIds = [retry.id]
      f.runtime.available = false
      f.setActionWorkerAvailable(false)
      const added = await f.acceptanceRecovery.withRasterAdd(f.tabId, () =>
        f.actions.acceptRaster(f.tabId, request),
      )
      const conversions = added.layers.filter(
        (layer) =>
          layer.kind !== 'smart-patch' && layer.resultComparisonSourceKind === 'smart-patch',
      )
      assert.equal(conversions.length, 1)
      const conversion = conversions[0]
      assert.ok(conversion && conversion.kind !== 'smart-patch')
      assert.equal(conversion.resultPresetSourceKind, 'smart-patch')
      assert.equal(conversion.generationSettingsUnavailableReason, undefined)
      assert.equal((await f.base.queue.getManagerEntry(retry.id)).status, 'canceled')
      assert.deepEqual(
        await f.base.database.db
          .selectFrom('generation_queue_item')
          .selectAll()
          .where('id', '=', source.id)
          .executeTakeFirstOrThrow(),
        sourceWitness,
      )
      assert.deepEqual((await f.results.list(f.tabId)).candidates, [])
      assert.equal(f.runtime.generated.length, 1)
    })
  },
)

test(
  'public orphan Raster Add finishes when Queue Manager deletes the canceled fresh Retry during draining',
  options,
  async () => {
    await withPublicFixture('anima', async (f) => {
      const batch = await queued(f)
      assert.equal((await f.dispatch.runNext()).kind, 'completed')
      await f.normalActions.cancelJob(await f.base.queue.getManagerEntry(batch.jobIds[1]))
      const source = await f.base.queue.getManagerEntry(batch.jobIds[1])
      const retry = await f.base.queue.retryPreparedSmartPatchTerminal(
        source.id,
        source.statusSequence,
        {
          assertCurrent: () => undefined,
          modelService: f.models,
        },
      )
      await orphanTarget(f)
      const snapshot = await f.results.list(f.tabId)
      const request = rasterRequest(f, snapshot.candidates)
      request.expectedUnfinishedJobIds = [retry.id]
      const cancel = f.base.queue.cancel.bind(f.base.queue)
      let deleted = false
      f.base.queue.cancel = async (...args) => {
        const canceled = await cancel(...args)
        if (canceled.id === retry.id && canceled.status === 'canceled' && !deleted) {
          await f.base.queue.deleteTerminal(retry.id, canceled.statusSequence)
          deleted = true
        }
        return canceled
      }
      f.runtime.available = false
      f.setActionWorkerAvailable(false)
      try {
        const added = await f.acceptanceRecovery.withRasterAdd(f.tabId, () =>
          f.actions.acceptRaster(f.tabId, request),
        )
        assert.equal(deleted, true)
        assert.equal(added.acceptedResults.length, 1)
        assert.equal(f.rasterAcceptance.hasPendingHandoff(f.tabId), false)
        assert.deepEqual((await f.results.list(f.tabId)).candidates, [])
        assert.equal(await f.acceptanceRecovery.reconcile(f.tabId), 'none')
        assert.deepEqual(await f.close.getCloseImpact(f.tabId), {
          completedCandidateCount: 0,
          generationStorageUnavailable: false,
          unfinishedJobCount: 0,
        })
      } finally {
        f.base.queue.cancel = cancel
      }
    })
  },
)

// Boundary: public Retry -> real queue CAS -> automatic shared drain -> actual CPU world output.
// Neighbor: later source/target/draft edits remain authored. Mutation: regenerate today's target,
// retry an entire dynamic batch, choose today's seed, discard older results, or accept implicitly.
for (const family of ['illustrious', 'anima'] as const) {
  for (const mode of ['inpaint', 'img2img', 'txt2img'] as const) {
    test(
      `public ${family} ${mode} Retry replays one original concrete job after live edits`,
      options,
      async () => {
        await withPublicFixture(
          family,
          async (f) => {
            const batch = await queued(f)
            const source = await f.base.queue.getManagerEntry(batch.jobIds[1])
            await f.normalActions.cancelJob(source)
            const terminal = await f.base.queue.getManagerEntry(source.id)
            const frozen = await f.base.queue.loadVerifiedSmartPatchInput(source.id)
            assert.equal(frozen.payload.bundle.itemIndex, 1)
            assert.equal(frozen.payload.item.item.seed, 1)
            await drain(f)
            const older = await f.results.list(f.tabId)
            assert.equal(older.candidates.length, 1)
            const changed = structuredClone(f.owner.document)
            const target = patch(changed, f.target.id)
            target.generationDraft.positivePrompt.text = 'today, not the frozen prompt'
            target.generationDraft.seed = { policy: 'fixed', value: 997 }
            target.boundingBox.x += 200
            assert.ok(target.maskSettings)
            target.maskSettings.blur = 3
            const lower = changed.layers.find((layer) => layer.kind === 'raster')
            if (lower) {
              lower.visible = false
            }
            await f.owner.applyDocument(changed)
            const authored = structuredClone(f.owner.document)
            const history = [f.owner.canUndo, f.owner.canRedo]
            const saved = await readFile(f.owner.filePath)
            f.runtime.beforePreparation = async () => {
              assert.fail('Retry cannot prepare live source')
            }
            await f.normalActions.retryJob(terminal)
            const page = await f.base.queue.listManagerPage()
            const retry = page.items.find((item) => !batch.jobIds.includes(item.id))!
            assert.ok(retry)
            assert.equal(page.items.length, 3, 'One reviewed concrete job, not the original batch')
            await waitForRetryCompletion(f, retry.id)
            const replay = await f.base.queue.loadVerifiedSmartPatchInput(retry.id)
            assert.notEqual(retry.batchId, terminal.batchId)
            assert.notEqual(retry.stagingSessionId, terminal.stagingSessionId)
            assert.notEqual(replay.bundle.id, frozen.bundle.id)
            assert.deepEqual({ ...replay.payload, bundle: frozen.payload.bundle }, frozen.payload)
            for (const [name, bytes] of Object.entries(frozen.bundle.files)) {
              assert.ok(
                bytes.equals(replay.bundle.files[name]),
                `Frozen ${name} bytes must survive Replay`,
              )
            }
            const request = f.runtime.generated.at(-1)!
            assert.deepEqual(request.inference, frozen.payload.item.inference)
            assert.equal(request.mode, frozen.payload.mode)
            assert.equal(
              request.latentKeepMask.sha256,
              frozen.payload.files['latent-keep-mask.png'].sha256,
            )
            assert.deepEqual(request.internalResolution, frozen.payload.context.internalResolution)
            assert.equal(
              request.modelSource?.sha256 ?? null,
              frozen.payload.files['model-source.png']?.sha256 ?? null,
            )
            const after = await f.results.list(f.tabId)
            assert.equal(after.candidates.length, 2)
            assert.ok(
              after.candidates.some(
                (candidate) => candidate.candidateId === older.candidates[0].candidateId,
              ),
            )
            assert.equal(
              after.candidates.find((candidate) => candidate.queueItemId === retry.id)?.actualSeed,
              1,
            )
            assert.equal(
              (await f.base.queue.getManagerEntry(source.id)).statusSequence,
              terminal.statusSequence + 1,
            )
            assert.deepEqual(f.owner.document, authored)
            assert.deepEqual([f.owner.canUndo, f.owner.canRedo], history)
            assert.ok(
              (await readFile(f.owner.filePath)).equals(saved),
              'Retry cannot save the Project',
            )
            await assert.rejects(f.normalActions.retryJob(terminal), {
              code: 'GENERATION_INVALID_REQUEST',
            })
            assert.equal((await f.base.queue.listManagerPage()).items.length, 3)
          },
          mode,
        )
      },
    )
  }
}

for (const family of ['illustrious', 'anima'] as const) {
  test(
    `public ${family} Smart Retry refuses unavailable capabilities and exact resources without consuming source`,
    options,
    async () => {
      await withPublicFixture(family, async (f) => {
        const batch = await queued(f)
        for (const id of batch.jobIds) {
          await f.normalActions.cancelJob(await f.base.queue.getManagerEntry(id))
        }
        const source = await f.base.queue.getManagerEntry(batch.jobIds[0])
        const frozen = await f.base.queue.loadVerifiedSmartPatchInput(source.id)
        const document = structuredClone(f.owner.document)
        const cursor = await f.base.staging.readLastActualSeed(f.tabId, source.documentId)
        const assertPreserved = async () => {
          assert.deepEqual(await f.base.queue.getManagerEntry(source.id), source)
          assert.equal((await f.base.queue.listManagerPage()).items.length, 2)
          assert.deepEqual(f.owner.document, document)
          assert.equal(await f.base.staging.readLastActualSeed(f.tabId, source.documentId), cursor)
          assert.equal((await f.results.list(f.tabId)).candidates.length, 0)
        }
        f.runtime.available = false
        await assert.rejects(f.normalActions.retryJob(source), {
          code: 'GENERATION_RUNTIME_UNAVAILABLE',
        })
        await assertPreserved()
        f.runtime.available = true
        const supported = structuredClone(f.runtime.ready)
        for (const capability of [
          'smart-patch-execution',
          'smart-patch-seed-confirmation',
          ...(family === 'anima' ? ['anima-txt2img'] : []),
        ]) {
          f.runtime.ready.capabilities = supported.capabilities.filter(
            (value) => value !== capability,
          )
          await assert.rejects(f.normalActions.retryJob(source), {
            code: 'GENERATION_RUNTIME_UNAVAILABLE',
          })
          await assertPreserved()
        }
        f.runtime.ready = supported
        const checkpoint = frozen.payload.item.inference
        const checkpointPath =
          'checkpoint' in checkpoint ? checkpoint.checkpoint.path : checkpoint.model.checkpoint.path
        const bytes = await readFile(checkpointPath)
        try {
          await writeFile(checkpointPath, Buffer.from('changed exact model fixture'))
          await assert.rejects(f.normalActions.retryJob(source))
          await assertPreserved()
        } finally {
          await writeFile(checkpointPath, bytes)
        }
        await f.normalActions.retryJob(source)
        const retry = (await f.base.queue.listManagerPage()).items.find(
          (item) => !batch.jobIds.includes(item.id),
        )!
        await waitForRetryCompletion(f, retry.id)
        assert.equal((await f.results.list(f.tabId)).candidates.length, 1)
      })
    },
  )
}

test(
  'public Smart Retry during inference preserves the active owner and queues one independent replay',
  options,
  async () => {
    await withPublicFixture('illustrious', async (f) => {
      const batch = await queued(f)
      await f.normalActions.cancelJob(await f.base.queue.getManagerEntry(batch.jobIds[0]))
      const source = await f.base.queue.getManagerEntry(batch.jobIds[0])
      const entered = deferred()
      const release = deferred()
      f.runtime.beforeExecution = async () => {
        entered.resolve()
        await release.promise
      }
      f.normalActions.requestDrain()
      try {
        await entered.promise
        assert.equal(f.runtime.active, 1)
        await f.normalActions.retryJob(source)
        const retry = (await f.base.queue.listManagerPage()).items.find(
          (item) => !batch.jobIds.includes(item.id),
        )!
        assert.equal(retry.status, 'pending')
        assert.equal((await f.base.queue.getManagerEntry(batch.jobIds[1])).status, 'running')
        assert.equal(f.runtime.generated.length, 1)
        assert.equal(f.runtime.maximum, 1)
        f.runtime.beforeExecution = null
        release.resolve()
        await waitForRetryCompletion(f, retry.id)
        assert.deepEqual(
          f.runtime.generated.map((request) => request.inference.sampling.seed),
          [1, 0],
        )
        assert.equal((await f.results.list(f.tabId)).candidates.length, 2)
        assert.equal(f.runtime.maximum, 1)
      } finally {
        release.resolve()
      }
    })
  },
)

test(
  'public Smart Retry cancels its published row after a late runtime exit refusal and retains recovery fence',
  options,
  async () => {
    await withPublicFixture('illustrious', async (f) => {
      const batch = await queued(f)
      for (const id of batch.jobIds) {
        await f.normalActions.cancelJob(await f.base.queue.getManagerEntry(id))
      }
      const source = await f.base.queue.getManagerEntry(batch.jobIds[0])
      const document = structuredClone(f.owner.document)
      f.runtime.afterAdmission = async () => {
        throw Object.assign(new Error('Controlled unconfirmed exit'), {
          code: 'WORKER_EXIT_UNCONFIRMED',
        })
      }
      await assert.rejects(f.normalActions.retryJob(source), { code: 'WORKER_EXIT_UNCONFIRMED' })
      const page = await f.base.queue.listManagerPage()
      assert.equal(page.items.length, 3)
      const retry = page.items.find((item) => !batch.jobIds.includes(item.id))!
      assert.equal(retry.status, 'canceled')
      assert.equal(f.runtime.generated.length, 0)
      assert.equal((await f.normalActions.getState(f.tabId)).phase, 'blocked')
      assert.deepEqual(f.owner.document, document)
    })
  },
)

test(
  'public Smart Retry after target deletion remains orphaned and cannot retarget or accept',
  options,
  async () => {
    await withPublicFixture('illustrious', async (f) => {
      const batch = await queued(f)
      for (const id of batch.jobIds) {
        await f.normalActions.cancelJob(await f.base.queue.getManagerEntry(id))
      }
      const source = await f.base.queue.getManagerEntry(batch.jobIds[0])
      const changed = structuredClone(f.owner.document)
      changed.layers = changed.layers.filter((layer) => layer.id !== f.target.id)
      await f.owner.applyDocument(changed)
      const document = structuredClone(f.owner.document)
      await f.normalActions.retryJob(source)
      const retry = (await f.base.queue.listManagerPage()).items.find(
        (item) => !batch.jobIds.includes(item.id),
      )!
      await waitForRetryCompletion(f, retry.id)
      const results = await f.results.list(f.tabId)
      const candidate = results.candidates.find((item) => item.queueItemId === retry.id)!
      assert.equal(candidate.disposition, 'orphaned')
      await assert.rejects(f.actions.accept(f.tabId, acceptRequest(f, [candidate])))
      assert.deepEqual(f.owner.document, document)
      assert.equal((await f.results.list(f.tabId)).candidates.length, 1)
    })
  },
)

test(
  'public Smart Retry rejects a replaced open coordinator after admission and cancels only the new attempt',
  options,
  async () => {
    await withPublicFixture('illustrious', async (f) => {
      const batch = await queued(f)
      for (const id of batch.jobIds) {
        await f.normalActions.cancelJob(await f.base.queue.getManagerEntry(id))
      }
      const source = await f.base.queue.getManagerEntry(batch.jobIds[0])
      const document = structuredClone(f.owner.document)
      const original = f.service.getOpenDocumentForAcceptance.bind(f.service)
      const replacement = Object.create(f.owner) as typeof f.owner
      let replaced = false
      f.service.getOpenDocumentForAcceptance = (tabId) => (replaced ? replacement : original(tabId))
      f.runtime.afterAdmission = async () => {
        replaced = true
      }
      try {
        await assert.rejects(f.normalActions.retryJob(source), {
          code: 'GENERATION_DOCUMENT_CHANGED',
        })
        const rows = (await f.base.queue.listManagerPage()).items
        assert.equal(rows.length, 3)
        assert.equal(rows.find((item) => !batch.jobIds.includes(item.id))?.status, 'canceled')
        assert.equal(f.runtime.generated.length, 0)
        assert.deepEqual(f.owner.document, document)
      } finally {
        f.service.getOpenDocumentForAcceptance = original
      }
    })
  },
)

for (const action of ['shutdown', 'close'] as const) {
  test(
    `public Smart Retry admission settles before ${action} disposes its new job`,
    options,
    async () => {
      await withPublicFixture('illustrious', async (f) => {
        const batch = await queued(f)
        for (const id of batch.jobIds) {
          await f.normalActions.cancelJob(await f.base.queue.getManagerEntry(id))
        }
        const source = await f.base.queue.getManagerEntry(batch.jobIds[0])
        const entered = deferred()
        const release = deferred()
        f.runtime.afterAdmission = async () => {
          entered.resolve()
          await release.promise
        }
        const retry = f.normalActions.retryJob(source)
        await entered.promise
        const finish =
          action === 'shutdown'
            ? f.normalActions.shutdown()
            : f.close.close(f.tabId, { confirmCloseImpact: true, discardDocument: true })
        try {
          await assert.rejects(f.normalActions.retryJob(source), {
            code: action === 'shutdown' ? 'GENERATION_CLOSED' : 'GENERATION_BUSY',
          })
          release.resolve()
          await (action === 'shutdown'
            ? assert.rejects(retry, { code: 'GENERATION_CLOSED' })
            : retry)
          await finish
          const rows = (await f.base.queue.listManagerPage()).items
          assert.equal(rows.length, 3)
          assert.ok(rows.every((item) => item.status === 'canceled'))
          assert.equal((await f.base.queue.listUnfinishedByProject(f.tabId)).length, 0)
          assert.ok((await readFile(f.owner.filePath)).equals(f.savedBytes))
        } finally {
          release.resolve()
          await retry.catch(() => undefined)
          await finish
        }
      })
    },
  )
}

test('Smart Generate and Retry share one public admission owner', options, async () => {
  await withPublicFixture('illustrious', async (f) => {
    const batch = await queued(f)
    for (const id of batch.jobIds) {
      await f.normalActions.cancelJob(await f.base.queue.getManagerEntry(id))
    }
    const source = await f.base.queue.getManagerEntry(batch.jobIds[0])
    const entered = deferred()
    const release = deferred()
    f.runtime.afterAdmission = async () => {
      entered.resolve()
      await release.promise
    }
    const smart = new ProjectSmartPatchGenerationActionController({
      gate: f.gate,
      models: f.models,
      orchestrator: f.orchestrator,
      projects: f.service,
      queue: f.base.queue,
      runtime: f.runtime,
      scratchBasePath: f.base.scratch,
      seedReader: f.base.staging,
      staging: f.staging,
      wakeDispatch: () => f.normalActions.requestDrain(),
      withAdmission: f.normalActions.withExternalAdmission.bind(f.normalActions),
    })
    const retry = f.normalActions.retryJob(source)
    try {
      await entered.promise
      await assert.rejects(smart.generate(f.tabId, f.request()), { code: 'GENERATION_BUSY' })
      assert.equal(f.runtime.generated.length, 0)
      assert.equal((await f.base.queue.listManagerPage()).items.length, 3)
      release.resolve()
      await retry
      const next = (await f.base.queue.listManagerPage()).items.find(
        (item) => !batch.jobIds.includes(item.id),
      )!
      await waitForRetryCompletion(f, next.id)
    } finally {
      release.resolve()
      await retry.catch(() => undefined)
      await smart.shutdown()
    }
  })
})

for (const change of ['rename', 'symlink'] as const) {
  test(
    `public Smart Retry refuses Project path ${change} during admission teardown and cancels only the new row`,
    options,
    async () => {
      await withPublicFixture('illustrious', async (f) => {
        const batch = await queued(f)
        for (const id of batch.jobIds) {
          await f.normalActions.cancelJob(await f.base.queue.getManagerEntry(id))
        }
        const source = await f.base.queue.getManagerEntry(batch.jobIds[0])
        const moved = `${f.owner.filePath}.retry-moved`
        let renamed = false
        let linked = false
        f.runtime.afterAdmission = async () => {
          await rename(f.owner.filePath, moved)
          renamed = true
          if (change === 'symlink') {
            await symlink(moved, f.owner.filePath)
            linked = true
          }
        }
        try {
          await assert.rejects(f.normalActions.retryJob(source), {
            code: 'GENERATION_DOCUMENT_CHANGED',
          })
          const rows = (await f.base.queue.listManagerPage()).items
          assert.equal(rows.length, 3)
          assert.equal(rows.find((item) => !batch.jobIds.includes(item.id))?.status, 'canceled')
          assert.equal(f.runtime.generated.length, 0)
          assert.equal(
            (await f.base.queue.getManagerEntry(source.id)).statusSequence,
            source.statusSequence + 1,
          )
        } finally {
          f.runtime.afterAdmission = null
          if (linked) {
            await unlink(f.owner.filePath)
          }
          if (renamed) {
            await rename(moved, f.owner.filePath)
          }
        }
        assert.ok(
          (await readFile(f.owner.filePath)).equals(f.savedBytes),
          'Original package must be restored byte-exact',
        )
      })
    },
  )
}

function regionalSmartDocumentOwner(f: PublicFixture) {
  return {
    documentId: f.owner.document.documentId,
    documentRevision: f.owner.document.documentRevision,
  }
}

async function regionalSmartPrivateFiles(
  directory: string,
): Promise<{ path: string; sha256: string }[]> {
  const files: { path: string; sha256: string }[] = []
  let entries: Dirent[]
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return files
    }
    throw error
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      for (const child of await regionalSmartPrivateFiles(entryPath)) {
        files.push({ path: `${entry.name}/${child.path}`, sha256: child.sha256 })
      }
    } else {
      assert.equal(
        entry.isFile(),
        true,
        'The controlled input tree must contain regular files only.',
      )
      files.push({ path: entry.name, sha256: digest(await readFile(entryPath)) })
    }
  }
  return files
}

/** Current document edits are deliberately excluded; queue, receipts, cursor and old PNGs are real. */
async function regionalSmartQueueSnapshot(f: PublicFixture) {
  const candidates = (await f.staging.listVerifiedCandidates(f.tabId)).sort((a, b) =>
    a.candidateId.localeCompare(b.candidateId),
  )
  return {
    candidatePixels: await Promise.all(
      candidates.map(async (candidate) => ({
        id: candidate.candidateId,
        sha256: digest(await readFile(candidate.assetPath)),
      })),
    ),
    candidates,
    inputs: await regionalSmartPrivateFiles(
      path.join(f.base.root, 'generation-queued-inputs', 'smart-patch'),
    ),
    queue: await f.base.database.db
      .selectFrom('generation_queue_item')
      .selectAll()
      .orderBy('id')
      .execute(),
    receipts: await f.base.database.db
      .selectFrom('generation_candidate_receipt')
      .selectAll()
      .orderBy('candidate_id')
      .execute(),
    savedSha256: digest(await readFile(f.owner.filePath)),
    seeds: await f.base.database.db
      .selectFrom('generation_seed_cursor')
      .selectAll()
      .orderBy('local_project_key')
      .orderBy('document_id')
      .execute(),
    tombstones: await f.base.database.db
      .selectFrom('generation_staging_discarded_session')
      .selectAll()
      .orderBy('local_project_key')
      .orderBy('staging_session_id')
      .execute(),
  }
}

// Boundary: target-bound Generate -> actual Main regional collection -> early eligibility.
// A committed candidate plus a pending sibling prevents a false green based on an empty queue.
for (const family of ['illustrious', 'anima'] as const) {
  test(
    `public ${family} Smart Generate refuses enabled unselected empty or locked zero-overlay regions before planning and stale confirmation`,
    options,
    async (t) => {
      await withPublicFixture(family, async (f) => {
        const original = await queued(f)
        assert.equal((await f.dispatch.runNext()).kind, 'completed')
        assert.equal((await f.staging.listVerifiedCandidates(f.tabId)).length, 1)
        assert.equal((await f.base.queue.getManagerEntry(original.jobIds[1])).status, 'pending')
        const review = await f.controller.generate(f.tabId, f.request())
        assert.equal(review.kind, 'confirmation-required')
        let tab = await f.service.addRegionalGuidance(f.tabId, regionalSmartDocumentOwner(f))
        const regionId = tab.regionalGuidance![0].id
        // Detect a guard moved after planning without monkey-patching an imported pure function.
        await f.service.updateGenerationDraft(
          f.tabId,
          { kind: 'positive-prompt', text: '{unfinished' },
          undefined,
          f.target.id,
        )
        for (const lockedZeroOverlay of [false, true]) {
          if (lockedZeroOverlay) {
            tab = await f.service.updateRegionalGuidance(
              f.tabId,
              { ...regionalSmartDocumentOwner(f), regionId },
              { kind: 'overlay-opacity', overlayOpacity: 0 },
            )
            tab = await f.service.updateRegionalGuidance(
              f.tabId,
              { ...regionalSmartDocumentOwner(f), regionId },
              { kind: 'lock', locked: true },
            )
          }
          await f.service.flushAutosave(f.tabId)
          const before = await regionalSmartQueueSnapshot(f)
          const document = structuredClone(f.owner.document)
          const generated = f.runtime.generated.length
          const wakes = f.wakes()
          const forbidden = [
            t.mock.method(f.service, 'withCapturedSmartPatchGenerationInput', async () =>
              assert.fail('Enabled regions must refuse before source/mask capture.'),
            ),
            t.mock.method(f.runtime, 'withSmartPatchGenerationPreparation', async () =>
              assert.fail('Enabled regions must refuse before runtime preparation.'),
            ),
            t.mock.method(f.runtime, 'withGenerationAdmission', async () =>
              assert.fail('Enabled regions must refuse before runtime admission.'),
            ),
            t.mock.method(f.runtime, 'withGenerationWorker', async () =>
              assert.fail('Enabled regions must refuse before acquiring an inference worker.'),
            ),
            t.mock.method(f.base.staging, 'readLastActualSeed', async () =>
              assert.fail('Enabled regions must refuse before seed cursor reads.'),
            ),
            t.mock.method(f.models, 'resolveVerifiedGenerationCheckpointForPlan', async () =>
              assert.fail('Enabled regions must refuse before Illustrious resource verification.'),
            ),
            t.mock.method(f.models, 'resolveVerifiedGenerationAnimaBundleForPlan', async () =>
              assert.fail('Enabled regions must refuse before Anima resource verification.'),
            ),
            t.mock.method(f.models, 'assertNoUnboundGenerationEmbeddings', async () =>
              assert.fail('Enabled regions must refuse before prompt resource verification.'),
            ),
            t.mock.method(f.orchestrator, 'enqueuePreparedSmartPatchBatch', async () =>
              assert.fail('Enabled regions must refuse before queue publication.'),
            ),
            t.mock.method(f.orchestrator, 'cancelGenerationJob', async () =>
              assert.fail('Regional refusal must preserve pending siblings.'),
            ),
            t.mock.method(f.staging, 'discardSessions', async () =>
              assert.fail('Regional refusal must preserve completed siblings.'),
            ),
          ]
          try {
            for (const confirmation of [undefined, { candidateIds: [], unfinishedJobIds: [] }]) {
              await assert.rejects(
                f.controller.generate(f.tabId, {
                  ...f.request(),
                  ...(confirmation ? { confirmation } : {}),
                }),
                {
                  code: 'GENERATION_REGIONAL_GUIDANCE_UNSUPPORTED',
                  message:
                    'Regional Guidance generation is not available yet. Disable or delete all enabled regions before generating.',
                },
              )
            }
            for (const method of forbidden) {
              assert.equal(method.mock.callCount(), 0)
            }
            assert.deepEqual(await regionalSmartQueueSnapshot(f), before)
            assert.deepEqual(f.owner.document, document)
            assert.equal(f.runtime.generated.length, generated)
            assert.equal(f.wakes(), wakes)
          } finally {
            t.mock.restoreAll()
          }
        }
      })
    },
  )

  test(
    `public ${family} Smart Generate with a disabled region admits and completes its real controlled batch`,
    options,
    async () => {
      await withPublicFixture(family, async (f) => {
        let tab = await f.service.addRegionalGuidance(f.tabId, regionalSmartDocumentOwner(f))
        tab = await f.service.updateRegionalGuidance(
          f.tabId,
          { ...regionalSmartDocumentOwner(f), regionId: tab.regionalGuidance![0].id },
          { enabled: false, kind: 'enabled' },
        )
        const document = structuredClone(f.owner.document)
        const batch = await queued(f)
        assert.equal(batch.jobIds.length, 2)
        await drain(f)
        assert.equal(f.runtime.generated.length, 2)
        const candidates = await f.staging.listVerifiedCandidates(f.tabId)
        assert.equal(candidates.length, 2)
        assert.deepEqual(
          new Set(candidates.map(({ queueItemId }) => queueItemId)),
          new Set(batch.jobIds),
        )
        for (const id of batch.jobIds) {
          assert.equal((await f.base.queue.getManagerEntry(id)).status, 'completed')
        }
        assert.equal(
          (
            await f.base.database.db
              .selectFrom('generation_candidate_receipt')
              .selectAll()
              .execute()
          ).length,
          2,
        )
        assert.deepEqual(f.owner.document, document)
        assert.ok((await readFile(f.owner.filePath)).equals(f.savedBytes))
      })
    },
  )
}

test(
  'public Smart work frozen by SQL is not retroactively canceled when a region is added before the admission call returns',
  options,
  async () => {
    let active: PublicFixture | undefined
    let armed = false
    let additions = 0
    await withPublicFixture(
      'illustrious',
      async (f) => {
        active = f
        armed = true
        const batch = await queued(f)
        armed = false
        assert.equal(additions, 1)
        assert.equal(f.owner.document.regionalGuidance?.[0].enabled, true)
        assert.equal((await f.base.queue.listManagerPage()).counts.canceled, 0)
        for (const id of batch.jobIds) {
          const frozen = await f.base.queue.loadVerifiedSmartPatchInput(id)
          assert.equal(frozen.item.status, 'pending')
          assert.equal(Object.hasOwn(frozen.payload.context, 'regionalGuidance'), false)
        }
        await drain(f)
        assert.equal(f.runtime.generated.length, 2)
        assert.equal((await f.staging.listVerifiedCandidates(f.tabId)).length, 2)
        assert.equal((await f.base.queue.listManagerPage()).counts.canceled, 0)
        await assert.rejects(f.controller.generate(f.tabId, f.request()), {
          code: 'GENERATION_REGIONAL_GUIDANCE_UNSUPPORTED',
        })
        assert.equal((await f.base.queue.listManagerPage()).items.length, 2)
      },
      'inpaint',
      {
        afterBatchCommit: async () => {
          if (!armed) {
            return
          }
          assert.ok(active)
          additions++
          // This hook is strictly after SQL COMMIT, not a pre-commit permission withdrawal.
          await active.service.addRegionalGuidance(active.tabId, regionalSmartDocumentOwner(active))
        },
      },
    )
  },
)

test(
  'public Smart frozen Retry survives regional add enable rename delete and Undo with exact bundle bytes seed and one source CAS',
  options,
  async (t) => {
    await withPublicFixture('illustrious', async (f) => {
      const batch = await queued(f)
      const source = await f.base.queue.getManagerEntry(batch.jobIds[0])
      await f.normalActions.cancelJob(source)
      const terminal = await f.base.queue.getManagerEntry(source.id)
      const frozen = await f.base.queue.loadVerifiedSmartPatchInput(source.id)
      assert.equal(frozen.payload.item.item.seed, 0)
      await drain(f)
      const previous = await f.staging.listVerifiedCandidates(f.tabId)
      assert.equal(previous.length, 1)
      const previousPixels = await readFile(previous[0].assetPath)
      let tab = await f.service.addRegionalGuidance(f.tabId, regionalSmartDocumentOwner(f))
      const regionId = tab.regionalGuidance![0].id
      for (const enabled of [false, true]) {
        tab = await f.service.updateRegionalGuidance(
          f.tabId,
          { ...regionalSmartDocumentOwner(f), regionId },
          { enabled, kind: 'enabled' },
        )
      }
      tab = await f.service.updateRegionalGuidance(
        f.tabId,
        { ...regionalSmartDocumentOwner(f), regionId },
        { kind: 'rename', name: 'Later regional authoring' },
      )
      await f.service.deleteRegionalGuidance(f.tabId, {
        ...regionalSmartDocumentOwner(f),
        regionId,
      })
      tab = await f.service.undo(f.tabId)
      assert.equal(tab.regionalGuidance![0].enabled, true)
      assert.equal(tab.regionalGuidance![0].name, 'Later regional authoring')
      await f.service.updateGenerationDraft(
        f.tabId,
        { kind: 'positive-prompt', text: 'Current target text' },
        undefined,
        f.target.id,
      )
      await f.service.updateGenerationDraft(
        f.tabId,
        { kind: 'seed', policy: 'fixed', value: 999 },
        undefined,
        f.target.id,
      )
      const document = structuredClone(f.owner.document)
      const history = [f.owner.canUndo, f.owner.canRedo]
      const saved = await readFile(f.owner.filePath)
      const capture = t.mock.method(f.service, 'withCapturedSmartPatchGenerationInput', async () =>
        assert.fail('Frozen Smart Retry cannot capture current regional authoring.'),
      )
      const preparation = t.mock.method(
        f.runtime,
        'withSmartPatchGenerationPreparation',
        async () => assert.fail('Frozen Smart Retry cannot prepare current regional inputs.'),
      )
      try {
        await f.normalActions.retryJob(terminal)
        const page = await f.base.queue.listManagerPage()
        const retry = page.items.find(({ id }) => !batch.jobIds.includes(id))
        assert.ok(retry)
        await waitForRetryCompletion(f, retry.id)
        const replay = await f.base.queue.loadVerifiedSmartPatchInput(retry.id)
        assert.notEqual(retry.id, terminal.id)
        assert.notEqual(retry.batchId, terminal.batchId)
        assert.notEqual(retry.stagingSessionId, terminal.stagingSessionId)
        assert.notEqual(replay.bundle.id, frozen.bundle.id)
        assert.deepEqual({ ...replay.payload, bundle: frozen.payload.bundle }, frozen.payload)
        for (const [name, bytes] of Object.entries(frozen.bundle.files)) {
          assert.ok(
            bytes.equals(replay.bundle.files[name]),
            `Original ${name} bytes must survive regional edits.`,
          )
        }
        assert.deepEqual(f.runtime.generated.at(-1)!.inference, frozen.payload.item.inference)
        assert.equal(f.runtime.generated.at(-1)!.inference.sampling.seed, 0)
        assert.equal(
          (await f.base.queue.getManagerEntry(source.id)).statusSequence,
          terminal.statusSequence + 1,
        )
        const after = await f.staging.listVerifiedCandidates(f.tabId)
        assert.equal(after.length, previous.length + 1)
        const retained = after.find(({ candidateId }) => candidateId === previous[0].candidateId)
        assert.ok(retained)
        assert.ok((await readFile(retained.assetPath)).equals(previousPixels))
        assert.deepEqual(f.owner.document, document)
        assert.deepEqual([f.owner.canUndo, f.owner.canRedo], history)
        assert.ok((await readFile(f.owner.filePath)).equals(saved))
        assert.equal(capture.mock.callCount(), 0)
        assert.equal(preparation.mock.callCount(), 0)
        await assert.rejects(f.normalActions.retryJob(terminal), {
          code: 'GENERATION_INVALID_REQUEST',
        })
        assert.equal((await f.base.queue.listManagerPage()).items.length, batch.jobIds.length + 1)
      } finally {
        t.mock.restoreAll()
      }
    })
  },
)
