import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import type {
  IgsProjectDocumentV1,
  IgsRasterLayerV1,
  IgsSmartPatchLayerV1,
} from '../../shared/projects/project-schema.js'
import type { ProjectSmartPatchGenerateOptions } from '../../shared/projects/smart-patch-public-generation.js'
import { isProjectSmartPatchResultsSnapshot } from '../../shared/projects/smart-patch-public-generation.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import type { GenerationWorkerTransport } from './generation-processor.js'
import type { InferenceWorkerReady } from './illustrious-txt2img-job.js'
import type { SmartPatchExecutionPreparationWorker } from './project-smart-patch-execution.js'
import type { SmartPatchExecutionRequest } from './smart-patch-execution-request.js'
import type { SmartPatchInferenceTransport } from './smart-patch-generation-processor.js'

import { ProjectGenerationActionController } from './generation-action-controller.js'
import { GenerationDispatchCoordinator } from './generation-dispatch-coordinator.js'
import { GenerationOrchestrator } from './generation-orchestrator.js'
import { GenerationProcessor } from './generation-processor.js'
import { readIgsPackage } from './igs-package.js'
import { ProjectAutosaveLeaseRegistry } from './project-autosave.js'
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
import { inspectTemporaryRecovery } from './project-temporary-recovery.js'
import { SmartPatchAcceptanceJournalRepository } from './smart-patch-acceptance-journal.js'
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
    return this.available ? await use(structuredClone(this.ready)) : null
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
) {
  await withSmartPatchQueueFixture(family, async (base) => {
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
  })
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
    staging,
    withWorker: async (use) => (actionWorkerAvailable ? await use(worker) : null),
  })
  const close = new ProjectGenerationClose(
    service,
    { orchestrator, queue: base.queue, staging: lifecycle },
    gate,
    (tabId) => acceptance.hasPendingHandoff(tabId),
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
