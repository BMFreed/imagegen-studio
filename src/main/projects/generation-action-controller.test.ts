import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import { GenerationBatchPlanError } from '../../shared/projects/generation-batch-plan.js'
import type { ProjectGenerationActionState } from '../../shared/projects/project-generation-actions.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { crc32, deflateSync } from 'node:zlib'

import type { AppDatabase } from '../db/database.js'
import type { GenerationWorkerTransport } from './generation-processor.js'
import type { GenerationQueueTestHooks } from './generation-queue.js'
import type { GenerationWorkerClient } from './generation-worker-client.js'
import type {
  IllustriousTxt2ImgRequestV1,
  InferenceWorkerReady,
} from './illustrious-txt2img-job.js'
import type { ProjectWorkerClient } from './worker-client.js'

import { openAppDatabase } from '../db/database.js'
import { CivitaiClient } from '../models/civitai-client.js'
import { CivitaiTokenStore, type SafeStorageAdapter } from '../models/civitai-token-store.js'
import { ModelRepository } from '../models/model-repository.js'
import { ModelService } from '../models/model-service.js'
import {
  ProjectGenerationActionController,
  toProjectGenerationActionApiError,
} from './generation-action-controller.js'
import { GenerationDispatchCoordinator } from './generation-dispatch-coordinator.js'
import { GenerationOrchestrator } from './generation-orchestrator.js'
import { GenerationProcessor } from './generation-processor.js'
import { GenerationQueueRepository } from './generation-queue.js'
import { GenerationStagingRepository } from './generation-staging.js'
import { IllustriousJobError } from './illustrious-txt2img-job.js'
import { ProjectAutosaveLeaseRegistry } from './project-autosave.js'
import { ProjectGenerationClose } from './project-generation-close.js'
import { ProjectGenerationOperationGate } from './project-generation-operation-gate.js'
import { GenerationPreparationError } from './project-generation-preparation.js'
import { ProjectIndexRepository } from './project-index.js'
import { ProjectService } from './project-service.js'
import { ProjectShadowStore } from './project-shadow.js'

const migrations = path.resolve('src/main/db/migrations')
const placeholders = path.resolve('src/main/projects/placeholders')
const iccPath = path.resolve('worker-python/src/imagegen_worker/srgb.icc')
const storage: SafeStorageAdapter = {
  decryptStringAsync: async () => ({ result: '', shouldReEncrypt: false }),
  encryptStringAsync: async () => Buffer.alloc(0),
  getSelectedStorageBackend: () => 'gnome_libsecret',
  isAsyncEncryptionAvailable: async () => true,
}

type ControlledWorker = GenerationWorkerTransport &
  Pick<ProjectWorkerClient, 'composeTarget'> & { ready: GenerationWorkerClient['ready'] }

type Fixture = {
  closeOwner: ProjectGenerationClose
  controller: ProjectGenerationActionController
  database: AppDatabase
  dispatch: GenerationDispatchCoordinator
  documentId: string
  packagePath: string
  processor: GenerationProcessor
  projects: ProjectService
  queue: GenerationQueueRepository
  root: string
  runtime: ControlledRuntime
  staging: GenerationStagingRepository
  tabId: string
}

class ControlledRuntime {
  admissionCount = 0
  available = true
  beforeAdmission: (() => Promise<void>) | null = null
  beforeCompose: (() => Promise<void>) | null = null
  beforeGenerate: (() => Promise<void>) | null = null
  closedCount = 0
  closeFailures = 0
  composedTargets: Parameters<ProjectWorkerClient['composeTarget']>[0][] = []
  generated: IllustriousTxt2ImgRequestV1[] = []
  leaseCount = 0
  preparationClosedCount = 0
  preparationCloseFailures = 0
  preparationCount = 0
  preparationHeld = false
  ready: InferenceWorkerReady = {
    capabilities: ['illustrious-txt2img', 'target-composition'],
    protocolVersion: '1',
    runtimeProfile: 'linux-nvidia',
    workerVersion: '0.2.0',
  }
  private activeReady: InferenceWorkerReady | null = null
  private held = false

  constructor(
    private readonly target: Buffer,
    private readonly output: Buffer,
  ) {}

  async getStatus(): Promise<null> {
    return null
  }

  async readQualifiedInferenceReady(): Promise<InferenceWorkerReady | null> {
    return this.available ? structuredClone(this.activeReady ?? this.ready) : null
  }

  async retryUnconfirmedGenerationExit(): Promise<boolean> {
    return !this.held && !this.preparationHeld
  }

  async withGenerationAdmission<T>(
    scratchBasePath: string,
    use: (ready: InferenceWorkerReady) => Promise<T>,
  ): Promise<T | null> {
    this.admissionCount += 1
    if (!this.available) {
      return null
    }
    if (this.activeReady) {
      const ready = structuredClone(this.activeReady)
      await this.beforeAdmission?.()
      return await use(ready)
    }
    return await this.withGenerationWorker(scratchBasePath, async (worker) => {
      await this.beforeAdmission?.()
      return await use(structuredClone(worker.ready))
    })
  }

  async withGenerationPreparation<T>(
    scratchBasePath: string,
    use: (preparation: {
      inferenceReady: InferenceWorkerReady
      targetWorker: Pick<ProjectWorkerClient, 'composeTarget'>
    }) => Promise<T>,
  ): Promise<T | null> {
    if (!this.available) {
      return null
    }
    if (!this.activeReady) {
      return await this.withGenerationWorker(scratchBasePath, async (worker) =>
        use({ inferenceReady: structuredClone(worker.ready), targetWorker: worker }),
      )
    }
    assert.equal(this.preparationHeld, false, 'only one CPU preparation may be active')
    this.preparationHeld = true
    this.preparationCount += 1
    const inferenceReady = structuredClone(this.activeReady)
    try {
      return await use({
        inferenceReady,
        targetWorker: { composeTarget: (input) => this.composeTarget(input) },
      })
    } finally {
      if (this.preparationCloseFailures > 0) {
        this.preparationCloseFailures -= 1
        throw Object.assign(new Error('controlled unconfirmed CPU preparation exit'), {
          code: 'WORKER_EXIT_UNCONFIRMED',
        })
      }
      this.preparationHeld = false
      this.preparationClosedCount += 1
    }
  }

  async withGenerationWorker<T>(
    _scratchBasePath: string,
    use: (worker: ControlledWorker) => Promise<T>,
  ): Promise<T | null> {
    if (!this.available) {
      return null
    }
    assert.equal(this.held, false, 'composition and dispatch must not nest runtime leases')
    this.held = true
    this.leaseCount += 1
    let closed = false
    const worker: ControlledWorker = {
      close: async () => {
        if (!closed && this.closeFailures > 0) {
          this.closeFailures -= 1
          throw Object.assign(new Error('controlled unconfirmed worker exit'), {
            code: 'WORKER_EXIT_UNCONFIRMED',
          })
        }
        if (!closed) {
          closed = true
          this.closedCount += 1
          this.held = false
          this.activeReady = null
        }
      },
      composeTarget: (input) => this.composeTarget(input),
      generate: async (request) => {
        this.generated.push(request)
        await this.beforeGenerate?.()
        await writeFile(request.job.output.pngPath, this.output, { flag: 'wx', mode: 0o600 })
        return {
          outputPath: request.job.output.pngPath,
          protocolVersion: '1',
          requestId: request.requestId,
          seed: request.job.sampling.seed,
          type: 'generation-done',
        }
      },
      ready: { ...structuredClone(this.ready), pythonVersion: '3.12.0' },
    }
    this.activeReady = structuredClone(worker.ready)
    try {
      return await use(worker)
    } finally {
      await worker.close()
      this.held = false
      this.activeReady = null
    }
  }

  private async composeTarget(input: Parameters<ProjectWorkerClient['composeTarget']>[0]) {
    this.composedTargets.push(structuredClone(input))
    await this.beforeCompose?.()
    await writeFile(input.targetPngPath, this.target, { flag: 'wx', mode: 0o600 })
    return {
      composite: {
        byteSize: this.target.length,
        colorSpace: 'srgb' as const,
        height: 64,
        iccSha256: IGS_SRGB_ICC_SHA256,
        path: input.targetPngPath,
        sha256: sha256(this.target),
        width: 64,
      },
      mode: 'txt2img' as const,
      rect: { ...input.bbox },
    }
  }
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function chunk(name: string, data: Buffer): Buffer {
  const tag = Buffer.from(name, 'ascii')
  const result = Buffer.alloc(data.length + 12)
  result.writeUInt32BE(data.length, 0)
  tag.copy(result, 4)
  data.copy(result, 8)
  result.writeUInt32BE(crc32(Buffer.concat([tag, data])), data.length + 8)
  return result
}

async function png(opaque: boolean): Promise<Buffer> {
  const profile = await readFile(iccPath)
  assert.equal(sha256(profile), IGS_SRGB_ICC_SHA256)
  const header = Buffer.alloc(13)
  header.writeUInt32BE(64, 0)
  header.writeUInt32BE(64, 4)
  header[8] = 8
  header[9] = 6
  const rows = Buffer.alloc(64 * (1 + 64 * 4))
  if (opaque) {
    for (let row = 0; row < 64; row += 1) {
      for (let column = 0; column < 64; column += 1) {
        const pixel = row * 257 + 1 + column * 4
        rows[pixel] = 36
        rows[pixel + 1] = 93
        rows[pixel + 2] = 180
        rows[pixel + 3] = 255
      }
    }
  }
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', header),
    chunk('iCCP', Buffer.concat([Buffer.from('sRGB\0\0'), deflateSync(profile)])),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function signal() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

async function withFixture(
  run: (fixture: Fixture) => Promise<void>,
  queueHooks: GenerationQueueTestHooks = {},
): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-generation-actions-'))
  const database = openAppDatabase(root, migrations)
  let controller: ProjectGenerationActionController | undefined
  try {
    const scratch = path.join(root, 'scratch')
    await mkdir(scratch, { mode: 0o700 })
    const index = new ProjectIndexRepository(database.db)
    const projects = new ProjectService({
      autosaveOptions: { debounceMs: 0, leaseRegistry: new ProjectAutosaveLeaseRegistry() },
      dataRoot: root,
      repository: index,
      roots: { placeholdersDir: placeholders, scratchDir: scratch },
      shadow: new ProjectShadowStore(path.join(root, 'autosave')),
    })
    const models = new ModelRepository(database.db)
    // ModelService still rehashes exact managed bytes; this fixture substitutes only the heavy
    // structural SDXL tensor qualification, which has independent production tests.
    const modelService = new ModelService(
      models,
      new CivitaiClient(),
      new CivitaiTokenStore(storage, root),
      undefined,
      undefined,
      async () => {},
    )
    const checkpoint = Buffer.from('exact local checkpoint for action-controller tests')
    const managedPath = path.join(root, 'checkpoint.safetensors')
    await writeFile(managedPath, checkpoint)
    const installed = await models.publishVerifiedInstallation({
      primary: {
        file: {
          managedPath,
          originalFilename: 'checkpoint.safetensors',
          sha256: sha256(checkpoint),
          sizeBytes: checkpoint.length,
          verifiedAt: '2026-09-30T00:00:00.000Z',
        },
        resource: {
          displayName: 'Controller checkpoint',
          source: { kind: 'civitai', modelId: 42 },
          sourceMetadata: {},
          type: 'checkpoint',
        },
        version: {
          baseModelFamily: 'illustrious',
          format: 'safetensors',
          name: 'v1',
          predictionType: 'epsilon',
          source: {
            expectedSha256: sha256(checkpoint),
            fileId: 22,
            kind: 'civitai',
            versionId: 21,
          },
          sourceMetadata: {},
        },
      },
    })
    const tab = await projects.create({ height: 64, title: 'Generate actions', width: 64 })
    const reference = await modelService.resolveGenerationCheckpoint(
      installed.resourceId,
      installed.versionId,
    )
    await projects.setGenerationModel(tab.id, reference)
    await projects.updateGenerationDraft(tab.id, {
      kind: 'positive-prompt',
      text: '{red|blue} lantern',
    })
    await projects.updateGenerationDraft(tab.id, {
      kind: 'negative-prompt',
      text: '{blur|noise}',
    })
    await projects.updateGenerationDraft(tab.id, {
      kind: 'sampling-pair',
      sampler: 'DPM++ 2M',
      scheduler: 'Karras',
    })
    await projects.updateGenerationDraft(tab.id, { kind: 'sampling-steps', value: 24 })
    await projects.updateGenerationDraft(tab.id, { kind: 'sampling-cfg-scale', value: 7.5 })
    await projects.updateGenerationDraft(tab.id, { kind: 'seed', policy: 'fixed', value: 42 })
    await projects.updateGenerationDraft(tab.id, {
      kind: 'dynamic-prompt',
      value: { maxPrompts: 100, seedBehavior: 'per-prompt' },
    })
    await projects.save(tab.id)
    const packagePath = (await index.listProjects())[0].canonicalPath
    const documentId = projects.getOpenDocumentId(tab.id)
    assert.ok(documentId)
    const queue = new GenerationQueueRepository(database.db, root, queueHooks)
    const staging = new GenerationStagingRepository(database.db, root)
    await queue.recoverAfterRestart()
    await staging.recoverAfterRestart()
    const processor = new GenerationProcessor(queue, staging, modelService, scratch)
    const orchestrator = new GenerationOrchestrator(
      projects,
      index,
      modelService,
      queue,
      staging,
      processor,
      scratch,
    )
    const runtime = new ControlledRuntime(await png(false), await png(true))
    const dispatch = new GenerationDispatchCoordinator(runtime, orchestrator, processor, scratch)
    const gate = new ProjectGenerationOperationGate()
    const closeOwner = new ProjectGenerationClose(projects, { orchestrator, queue, staging }, gate)
    controller = new ProjectGenerationActionController({
      dispatch,
      gate,
      models: modelService,
      orchestrator,
      processor,
      projects,
      queue,
      runtime,
      scratchBasePath: scratch,
      staging,
    })
    await run({
      closeOwner,
      controller,
      database,
      dispatch,
      documentId,
      packagePath,
      processor,
      projects,
      queue,
      root,
      runtime,
      staging,
      tabId: tab.id,
    })
  } finally {
    await controller?.shutdown()
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
}

async function waitForState(
  controller: ProjectGenerationActionController,
  tabId: string,
  condition: (state: ProjectGenerationActionState) => boolean,
): Promise<ProjectGenerationActionState> {
  return await new Promise<ProjectGenerationActionState>((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe()
      reject(new Error('Expected Generate state transition was not published.'))
    }, 10_000)
    const inspect = async () => {
      try {
        const state = await controller.getState(tabId)
        if (condition(state)) {
          clearTimeout(timer)
          unsubscribe()
          resolve(state)
        }
      } catch (error) {
        clearTimeout(timer)
        unsubscribe()
        reject(error)
      }
    }
    const unsubscribe = controller.onChanged(() => void inspect())
    void inspect()
  })
}

async function createSiblingProject(fixture: Fixture) {
  const source = fixture.projects.getOpenDocumentForAcceptance(fixture.tabId)!.document
  const sibling = await fixture.projects.create({ height: 64, title: 'Sibling Project', width: 64 })
  const owner = fixture.projects.getOpenDocumentForAcceptance(sibling.id)!
  await owner.applyDocument({
    ...owner.document,
    generationDraft: structuredClone(source.generationDraft),
  })
  await fixture.projects.save(sibling.id)
  return { documentId: owner.document.documentId, packagePath: owner.filePath, tabId: sibling.id }
}

async function holdCurrentGeneration(fixture: Fixture) {
  const entered = signal()
  const release = signal()
  fixture.runtime.beforeGenerate = async () => {
    if (fixture.runtime.generated.length === 1) {
      entered.resolve()
      await release.promise
    }
  }
  const result = await fixture.controller.generate(fixture.tabId, {
    documentId: fixture.documentId,
    iterations: 1,
  })
  assert.equal(result.kind, 'queued')
  if (result.kind !== 'queued') {
    throw new Error('The initial batch was not queued.')
  }
  await entered.promise
  return { release, result }
}

test('busy Generate publishes a sibling frozen Project before the held inference finishes', async () => {
  await withFixture(async (fixture) => {
    const sibling = await createSiblingProject(fixture)
    await fixture.projects.setPrimaryBbox(sibling.tabId, { height: 64, width: 64, x: 123, y: -456 })
    await fixture.projects.updateGenerationDraft(sibling.tabId, {
      kind: 'positive-prompt',
      text: 'captured sibling prompt',
    })
    await fixture.projects.updateGenerationDraft(sibling.tabId, {
      kind: 'negative-prompt',
      text: '',
    })
    await fixture.projects.updateGenerationDraft(sibling.tabId, {
      kind: 'seed',
      policy: 'fixed',
      value: 0,
    })
    const { release: releaseWorker } = await holdCurrentGeneration(fixture)
    const entered = signal()
    const releaseComposition = signal()
    fixture.runtime.beforeCompose = async () => {
      entered.resolve()
      await releaseComposition.promise
    }
    try {
      const leases = fixture.runtime.leaseCount
      const original = await fixture.controller.getQueue()
      const saved = await readFile(fixture.packagePath)
      const pending = fixture.controller.generate(sibling.tabId, { ...sibling, iterations: 1 })
      await entered.promise
      assert.equal(fixture.runtime.generated.length, 1)
      assert.equal(
        fixture.runtime.leaseCount,
        leases,
        'CPU preparation does not reserve another GPU child',
      )
      assert.equal(fixture.runtime.preparationCount, 1)
      await assert.rejects(
        fixture.controller.generate(sibling.tabId, { ...sibling, iterations: 1 }),
        { code: 'GENERATION_BUSY' },
      )
      await fixture.projects.updateGenerationDraft(sibling.tabId, {
        kind: 'positive-prompt',
        text: 'later edited sibling',
      })
      await fixture.projects.updateGenerationDraft(sibling.tabId, {
        kind: 'seed',
        policy: 'fixed',
        value: 99,
      })
      await fixture.projects.setPrimaryBbox(sibling.tabId, {
        height: 64,
        width: 64,
        x: -987,
        y: 654,
      })
      await fixture.projects.save(sibling.tabId)
      releaseComposition.resolve()
      const queued = await pending
      assert.equal(queued.kind, 'queued')
      if (queued.kind !== 'queued') {
        return
      }
      assert.equal(queued.jobIds.length, 1)
      const frozen = await fixture.queue.loadVerifiedInput(queued.jobIds[0])
      assert.equal(frozen.item.status, 'pending')
      assert.equal(frozen.payload.context.documentId, sibling.documentId)
      assert.equal(frozen.payload.context.prompts.positive, 'captured sibling prompt')
      assert.equal(frozen.payload.context.sampling.seed, 0)
      assert.deepEqual(frozen.payload.context.bbox, { height: 64, width: 64, x: 123, y: -456 })
      assert.deepEqual(await readFile(frozen.targetPath), await png(false))
      const after = await fixture.controller.getQueue()
      assert.equal(after.counts.running, 1)
      assert.equal(after.counts.pending, original.counts.pending + 1)
      assert.equal(fixture.runtime.generated.length, 1)
      assert.equal(fixture.runtime.preparationClosedCount, 1)
      assert.equal(fixture.runtime.preparationHeld, false)
      assert.deepEqual(await readFile(fixture.packagePath), saved)
      assert.equal(
        await fixture.staging.readLastActualSeed(sibling.tabId, sibling.documentId),
        null,
      )
      releaseWorker.resolve()
      await waitForState(
        fixture.controller,
        sibling.tabId,
        (state) => state.phase === 'idle' && state.jobs.length === 0,
      )
      assert.equal(fixture.runtime.generated.length, 5)
      assert.equal(fixture.runtime.generated.at(-1)!.job.sampling.seed, 0)
      assert.equal(
        fixture.runtime.generated.at(-1)!.job.prompts.positive,
        'captured sibling prompt',
      )
      assert.equal((await fixture.staging.listVerifiedCandidates(sibling.tabId)).length, 1)
    } finally {
      releaseComposition.resolve()
      releaseWorker.resolve()
    }
  })
})

const rescaleReady: InferenceWorkerReady = {
  capabilities: [
    'illustrious-txt2img',
    'denoising-progress',
    'candidate-thumbnails',
    'illustrious-cfg-rescale',
  ],
  protocolVersion: '1',
  runtimeProfile: 'linux-nvidia',
  workerVersion: '0.5.0',
}

test('Generate gates CFG Rescale before composition and freezes the supported value through concurrent draft edits and completion', async () => {
  await withFixture(async (fixture) => {
    const { controller, documentId, projects, queue, runtime, staging, tabId } = fixture
    await projects.updateGenerationDraft(tabId, { kind: 'positive-prompt', text: 'a lantern' })
    await projects.updateGenerationDraft(tabId, { kind: 'negative-prompt', text: 'blur' })
    assert.equal((await controller.getState(tabId)).cfgRescaleSupported, false)
    await projects.updateGenerationDraft(tabId, { kind: 'cfg-rescale', value: 0.3 })
    const saved = await readFile(fixture.packagePath)
    await assert.rejects(controller.generate(tabId, { documentId, iterations: 1 }), {
      code: 'INFERENCE_UNAVAILABLE',
    })
    assert.equal(runtime.composedTargets.length, 0)
    assert.equal((await controller.getQueue()).items.length, 0)
    assert.deepEqual(await staging.listVerifiedCandidates(tabId), [])
    runtime.ready = structuredClone(rescaleReady)
    assert.equal(
      (await controller.getState(tabId)).cfgRescaleSupported,
      true,
      'available before first Generate',
    )
    const entered = signal()
    const release = signal()
    runtime.beforeCompose = async () => {
      entered.resolve()
      await release.promise
    }
    try {
      const pending = controller.generate(tabId, { documentId, iterations: 1 })
      await entered.promise
      await projects.updateGenerationDraft(tabId, { kind: 'cfg-rescale', value: 0.9 })
      release.resolve()
      const queued = await pending
      assert.equal(queued.kind, 'queued')
      if (queued.kind !== 'queued') {
        throw new Error('expected durable batch')
      }
      await waitForState(controller, tabId, (state) => state.phase === 'idle')
      const frozen = await queue.loadVerifiedInput(queued.jobIds[0])
      assert.equal(frozen.item.status, 'completed')
      assert.equal(frozen.payload.context.sampling.cfgRescale, 0.3)
      assert.equal(frozen.payload.workerJob.sampling.cfgRescale, 0.3)
      assert.equal(runtime.generated[0].job.sampling.cfgRescale, 0.3)
      const candidates = await staging.listVerifiedCandidates(tabId)
      assert.equal(candidates.length, 1)
      assert.equal(JSON.parse(candidates[0].frozenPayloadJson).context.sampling.cfgRescale, 0.3)
      assert.equal(
        projects.getOpenDocumentForAcceptance(tabId)!.document.generationDraft.cfgRescale,
        0.9,
      )
      assert.deepEqual(await readFile(fixture.packagePath), saved)
    } finally {
      release.resolve()
    }
  })
})

test('Retry gates the current worker before publication and uses the prior frozen rescale instead of a later draft', async () => {
  await withFixture(async (fixture) => {
    const { controller, documentId, projects, runtime, tabId } = fixture
    await projects.updateGenerationDraft(tabId, { kind: 'positive-prompt', text: 'a lantern' })
    await projects.updateGenerationDraft(tabId, { kind: 'negative-prompt', text: 'blur' })
    runtime.ready = structuredClone(rescaleReady)
    await projects.updateGenerationDraft(tabId, { kind: 'cfg-rescale', value: 0.3 })
    runtime.beforeGenerate = async () => {
      throw new Error('controlled initial inference failure')
    }
    const initial = await controller.generate(tabId, { documentId, iterations: 1 })
    assert.equal(initial.kind, 'queued')
    await waitForState(controller, tabId, (state) => state.phase === 'idle')
    const source = (await controller.getQueue()).items[0]
    assert.equal(source.status, 'failed')
    await projects.updateGenerationDraft(tabId, { kind: 'cfg-rescale', value: 0.9 })
    runtime.beforeGenerate = null
    runtime.ready = {
      ...rescaleReady,
      capabilities: ['illustrious-txt2img'],
      workerVersion: '0.2.0',
    }
    await assert.rejects(controller.retryJob(source), { code: 'INFERENCE_UNAVAILABLE' })
    const unchanged = await controller.getQueue()
    assert.equal(unchanged.items.length, 1)
    assert.equal(unchanged.items[0].statusSequence, source.statusSequence)
    assert.equal(runtime.generated.length, 1)
    runtime.ready = structuredClone(rescaleReady)
    await controller.retryJob(source)
    await waitForState(controller, tabId, (state) => state.phase === 'idle')
    assert.equal(runtime.generated.length, 2)
    assert.equal(runtime.generated[1].job.sampling.cfgRescale, 0.3)
    assert.equal(
      (await controller.getQueue()).items.filter((item) => item.status === 'completed').length,
      1,
    )
  })
})

test('busy same-Project Generate keeps unreviewed work and publishes replacement before canceling it', async () => {
  await withFixture(async (fixture) => {
    const { release, result: first } = await holdCurrentGeneration(fixture)
    try {
      const leases = fixture.runtime.leaseCount
      const saved = await readFile(fixture.packagePath)
      const review = await fixture.controller.generate(fixture.tabId, {
        documentId: fixture.documentId,
        iterations: 1,
      })
      assert.equal(review.kind, 'confirmation-required')
      if (review.kind !== 'confirmation-required') {
        return
      }
      assert.deepEqual(review.candidateIds, [])
      assert.deepEqual(review.unfinishedJobIds, [...first.jobIds].sort())
      assert.equal(fixture.runtime.preparationCount, 0)
      assert.equal(fixture.runtime.leaseCount, leases)
      assert.equal(fixture.runtime.generated.length, 1)
      await fixture.projects.updateGenerationDraft(fixture.tabId, {
        kind: 'positive-prompt',
        text: 'new replacement',
      })
      await fixture.projects.updateGenerationDraft(fixture.tabId, {
        kind: 'negative-prompt',
        text: '',
      })
      const cancel = fixture.processor.cancelAndWait.bind(fixture.processor)
      let reviewedOldCancellation = false
      fixture.processor.cancelAndWait = async (id) => {
        if (first.jobIds.includes(id)) {
          const page = await fixture.controller.getQueue()
          const replacement = page.items.filter((item) => !first.jobIds.includes(item.id))
          assert.equal(
            replacement.length,
            1,
            'replacement is durable before destructive cancellation',
          )
          assert.equal(replacement[0].status, 'pending')
          reviewedOldCancellation = true
        }
        return await cancel(id)
      }
      const replacement = await fixture.controller.generate(fixture.tabId, {
        confirmation: {
          candidateIds: review.candidateIds,
          unfinishedJobIds: review.unfinishedJobIds,
        },
        documentId: fixture.documentId,
        iterations: 1,
      })
      assert.equal(replacement.kind, 'queued')
      assert.equal(reviewedOldCancellation, true)
      release.resolve()
      await waitForState(
        fixture.controller,
        fixture.tabId,
        (state) => state.phase === 'idle' && state.jobs.length === 0,
      )
      const page = await fixture.controller.getQueue()
      assert.ok(
        page.items
          .filter((item) => first.jobIds.includes(item.id))
          .every((item) => item.status === 'canceled'),
      )
      assert.equal(page.counts.completed, 1)
      assert.equal(fixture.runtime.preparationCount, 1)
      assert.equal(fixture.runtime.preparationClosedCount, 1)
      assert.deepEqual(await readFile(fixture.packagePath), saved)
    } finally {
      release.resolve()
    }
  })
})

test('completion during busy Generate composition requires a fresh exact replacement confirmation', async () => {
  await withFixture(async (fixture) => {
    const { release: releaseWorker, result: first } = await holdCurrentGeneration(fixture)
    const entered = signal()
    const releaseComposition = signal()
    try {
      const review = await fixture.controller.generate(fixture.tabId, {
        documentId: fixture.documentId,
        iterations: 1,
      })
      assert.equal(review.kind, 'confirmation-required')
      if (review.kind !== 'confirmation-required') {
        return
      }
      fixture.runtime.beforeCompose = async () => {
        entered.resolve()
        await releaseComposition.promise
      }
      const pending = fixture.controller.generate(fixture.tabId, {
        confirmation: {
          candidateIds: review.candidateIds,
          unfinishedJobIds: review.unfinishedJobIds,
        },
        documentId: fixture.documentId,
        iterations: 1,
      })
      await entered.promise
      releaseWorker.resolve()
      await waitForState(
        fixture.controller,
        fixture.tabId,
        (state) =>
          state.phase === 'preparing' && state.runningJobId === null && state.jobs.length === 3,
      )
      const candidates = await fixture.staging.listVerifiedCandidates(fixture.tabId)
      assert.equal(candidates.length, 1)
      releaseComposition.resolve()
      const nextReview = await pending
      assert.equal(nextReview.kind, 'confirmation-required')
      if (nextReview.kind !== 'confirmation-required') {
        return
      }
      assert.deepEqual(nextReview.candidateIds, [candidates[0].candidateId])
      assert.deepEqual(nextReview.unfinishedJobIds, first.jobIds.slice(1).sort())
      const page = await fixture.controller.getQueue()
      assert.equal(page.items.length, 4, 'changed review prevents publication of any replacement')
      assert.equal(page.counts.canceled, 0)
      assert.ok(
        (await fixture.staging.listVerifiedCandidates(fixture.tabId)).some(
          (item) => item.candidateId === candidates[0].candidateId,
        ),
      )
    } finally {
      releaseComposition.resolve()
      releaseWorker.resolve()
    }
  })
})

test('busy Generate preparation refusals retain old work, candidate bytes and the actual seed', async (t) => {
  for (const failure of ['runtime', 'checkpoint', 'capacity', 'composition'] as const) {
    await t.test(failure, async () => {
      await withFixture(async (fixture) => {
        const { release, review: failed } = await holdRunningSibling(fixture)
        const source = await fixture.queue.loadVerifiedInput(failed.id)
        const checkpoint = await readFile(source.payload.context.model.managedPath)
        try {
          const page = await fixture.controller.getQueue()
          const saved = await readFile(fixture.packagePath)
          const candidates = await fixture.staging.listVerifiedCandidates(fixture.tabId)
          const candidateBytes = await Promise.all(
            candidates.map((item) => readFile(item.assetPath)),
          )
          const cursor = await fixture.staging.readLastActualSeed(fixture.tabId, fixture.documentId)
          const reviewed = await fixture.controller.generate(fixture.tabId, {
            documentId: fixture.documentId,
            iterations: 1,
          })
          assert.equal(reviewed.kind, 'confirmation-required')
          if (reviewed.kind !== 'confirmation-required') {
            return
          }
          switch (failure) {
            case 'capacity': {
              fixture.staging.preflightBatchCapacity = async () => {
                throw Object.assign(new Error('controlled generation capacity refusal'), {
                  code: 'STAGING_CAPACITY_EXCEEDED',
                })
              }

              break
            }
            case 'checkpoint': {
              await writeFile(
                source.payload.context.model.managedPath,
                'corrupted busy Generate checkpoint',
              )

              break
            }
            case 'runtime': {
              fixture.runtime.available = false

              break
            }
            default: {
              fixture.runtime.beforeCompose = async () => {
                throw Object.assign(new Error('controlled CPU composition refusal'), {
                  code: 'WORKER_REQUEST_FAILED',
                })
              }
            }
          }
          const leases = fixture.runtime.leaseCount
          await assert.rejects(
            fixture.controller.generate(fixture.tabId, {
              confirmation: {
                candidateIds: reviewed.candidateIds,
                unfinishedJobIds: reviewed.unfinishedJobIds,
              },
              documentId: fixture.documentId,
              iterations: 1,
            }),
            {
              code:
                failure === 'runtime'
                  ? 'GENERATION_RUNTIME_UNAVAILABLE'
                  : failure === 'checkpoint'
                    ? 'MODEL_FILE_CORRUPT'
                    : failure === 'capacity'
                      ? 'STAGING_CAPACITY_EXCEEDED'
                      : 'WORKER_REQUEST_FAILED',
            },
          )
          assert.deepEqual(await fixture.controller.getQueue(), page)
          assert.equal(fixture.runtime.leaseCount, leases)
          assert.equal(fixture.runtime.generated.length, 2)
          assert.deepEqual(await fixture.staging.listVerifiedCandidates(fixture.tabId), candidates)
          assert.deepEqual(
            await Promise.all(candidates.map((item) => readFile(item.assetPath))),
            candidateBytes,
          )
          assert.deepEqual(await readFile(fixture.packagePath), saved)
          assert.equal(
            await fixture.staging.readLastActualSeed(fixture.tabId, fixture.documentId),
            cursor,
          )
          assert.equal((await fixture.controller.getState(fixture.tabId)).phase, 'processing')
        } finally {
          fixture.runtime.available = true
          await writeFile(source.payload.context.model.managedPath, checkpoint)
          release.resolve()
        }
        await waitForState(
          fixture.controller,
          fixture.tabId,
          (state) => state.phase === 'idle' && state.jobs.length === 0,
        )
        assert.equal(fixture.runtime.generated.length, 4, 'refused Generate never joins dispatch')
      })
    })
  }
})

test('busy Generate rechecks a document replaced at the same local Project path', async () => {
  await withFixture(async (fixture) => {
    const sibling = await createSiblingProject(fixture)
    const { release: releaseWorker } = await holdCurrentGeneration(fixture)
    const entered = signal()
    const releaseComposition = signal()
    fixture.runtime.beforeCompose = async () => {
      entered.resolve()
      await releaseComposition.promise
    }
    try {
      const page = await fixture.controller.getQueue()
      const pending = fixture.controller.generate(sibling.tabId, {
        documentId: sibling.documentId,
        iterations: 1,
      })
      await entered.promise
      await fixture.projects.close(sibling.tabId)
      const other = await fixture.projects.create({
        height: 64,
        title: 'Replacement identity',
        width: 64,
      })
      await fixture.projects.save(other.id)
      const replacementPath = fixture.projects.getOpenDocumentForAcceptance(other.id)!.filePath
      await copyFile(replacementPath, sibling.packagePath)
      assert.equal((await fixture.projects.open(sibling.tabId)).kind, 'opened')
      assert.notEqual(fixture.projects.getOpenDocumentId(sibling.tabId), sibling.documentId)
      releaseComposition.resolve()
      await assert.rejects(pending, { code: 'GENERATION_DOCUMENT_CHANGED' })
      assert.deepEqual(await fixture.controller.getQueue(), page)
      assert.equal(fixture.runtime.generated.length, 1)
      assert.equal(fixture.runtime.preparationClosedCount, 1)
    } finally {
      releaseComposition.resolve()
      releaseWorker.resolve()
    }
  })
})

test('a concurrent worker-exit fence survives busy Generate composition and a later refusal', async (t) => {
  for (const refusal of ['blocked-recheck', 'late-composition'] as const) {
    await t.test(refusal, async () => {
      await withFixture(async (fixture) => {
        const sibling = await createSiblingProject(fixture)
        const { release: releaseWorker } = await holdCurrentGeneration(fixture)
        const entered = signal()
        const releaseComposition = signal()
        fixture.runtime.beforeCompose = async () => {
          entered.resolve()
          await releaseComposition.promise
          if (refusal === 'late-composition') {
            throw Object.assign(new Error('controlled later CPU refusal'), {
              code: 'WORKER_REQUEST_FAILED',
            })
          }
        }
        try {
          const page = await fixture.controller.getQueue()
          const running = page.items.find((item) => item.status === 'running')!
          const pending = fixture.controller.generate(sibling.tabId, {
            documentId: sibling.documentId,
            iterations: 1,
          })
          await entered.promise
          fixture.runtime.closeFailures = 2
          await assert.rejects(
            fixture.controller.cancelJob({
              id: running.id,
              statusSequence: running.statusSequence,
            }),
            { code: 'WORKER_EXIT_UNCONFIRMED' },
          )
          assert.equal((await fixture.controller.getState(sibling.tabId)).phase, 'blocked')
          releaseComposition.resolve()
          await assert.rejects(pending, {
            code: refusal === 'blocked-recheck' ? 'GENERATION_BLOCKED' : 'WORKER_REQUEST_FAILED',
          })
          const state = await fixture.controller.getState(sibling.tabId)
          assert.equal(state.phase, 'blocked')
          assert.equal(
            state.error?.code,
            'WORKER_EXIT_UNCONFIRMED',
            'late refusal cannot clear the existing recovery fence',
          )
          assert.equal((await fixture.controller.getQueue()).items.length, page.items.length)
          assert.equal(fixture.runtime.generated.length, 1)
          const requested = (await fixture.controller.getQueue()).items.find(
            (item) => item.id === running.id,
          )!
          await fixture.controller.cancelJob({
            id: requested.id,
            statusSequence: requested.statusSequence,
          })
        } finally {
          releaseComposition.resolve()
          releaseWorker.resolve()
        }
      })
    })
  }
})

test('shutdown during busy Generate preparation refuses publication before canceling active inference', async () => {
  await withFixture(async (fixture) => {
    const sibling = await createSiblingProject(fixture)
    const { release: releaseWorker } = await holdCurrentGeneration(fixture)
    const entered = signal()
    const releaseComposition = signal()
    fixture.runtime.beforeCompose = async () => {
      entered.resolve()
      await releaseComposition.promise
    }
    try {
      const page = await fixture.controller.getQueue()
      const pending = fixture.controller.generate(sibling.tabId, {
        documentId: sibling.documentId,
        iterations: 1,
      })
      await entered.promise
      const stopping = fixture.controller.shutdown()
      releaseComposition.resolve()
      await assert.rejects(pending, { code: 'GENERATION_CLOSED' })
      await stopping
      const after = await fixture.queue.listManagerPage()
      assert.equal(after.items.length, page.items.length)
      assert.equal(after.counts.running, 0)
      assert.equal(fixture.runtime.generated.length, 1)
      assert.equal(fixture.runtime.preparationHeld, false)
      assert.equal(fixture.runtime.preparationClosedCount, 1)
    } finally {
      releaseComposition.resolve()
      releaseWorker.resolve()
    }
  })
})

test('confirmed Project close waits its busy Generate gate and cancels the new pending batch only', async () => {
  await withFixture(async (fixture) => {
    const sibling = await createSiblingProject(fixture)
    const { release: releaseWorker, result: first } = await holdCurrentGeneration(fixture)
    const entered = signal()
    const releaseComposition = signal()
    fixture.runtime.beforeCompose = async () => {
      entered.resolve()
      await releaseComposition.promise
    }
    try {
      const saved = await readFile(sibling.packagePath)
      const pending = fixture.controller.generate(sibling.tabId, {
        documentId: sibling.documentId,
        iterations: 1,
      })
      await entered.promise
      const closing = fixture.closeOwner.close(sibling.tabId, {
        confirmCloseImpact: true,
        discardDocument: false,
      })
      assert.equal(fixture.projects.getOpenDocumentId(sibling.tabId), sibling.documentId)
      releaseComposition.resolve()
      const queued = await pending
      assert.equal(queued.kind, 'queued')
      await closing
      assert.equal(fixture.projects.getOpenDocumentId(sibling.tabId), null)
      assert.deepEqual(await fixture.queue.listUnfinishedByProject(sibling.tabId), [])
      assert.deepEqual(await fixture.staging.listVerifiedCandidates(sibling.tabId), [])
      const page = await fixture.controller.getQueue()
      assert.ok(
        page.items
          .filter((item) => !first.jobIds.includes(item.id))
          .every((item) => item.status === 'canceled'),
      )
      assert.equal(page.items.find((item) => item.id === first.jobIds[0])!.status, 'running')
      assert.equal(
        fixture.runtime.generated.length,
        1,
        'closing sibling leaves the original inference alive',
      )
      assert.deepEqual(await readFile(sibling.packagePath), saved)
    } finally {
      releaseComposition.resolve()
      releaseWorker.resolve()
    }
  })
})

test('CPU preparation exit failure after durable publication keeps pending work fenced from dispatch', async () => {
  await withFixture(async (fixture) => {
    const sibling = await createSiblingProject(fixture)
    const { release, result: first } = await holdCurrentGeneration(fixture)
    try {
      const page = await fixture.controller.getQueue()
      const saved = await readFile(sibling.packagePath)
      fixture.runtime.preparationCloseFailures = 1
      await assert.rejects(
        fixture.controller.generate(sibling.tabId, {
          documentId: sibling.documentId,
          iterations: 1,
        }),
        { code: 'WORKER_EXIT_UNCONFIRMED' },
      )
      assert.equal(fixture.runtime.preparationHeld, true, 'unconfirmed CPU exit retains its owner')
      const state = await fixture.controller.getState(sibling.tabId)
      assert.equal(state.phase, 'blocked')
      assert.equal(state.error?.code, 'WORKER_EXIT_UNCONFIRMED')
      const after = await fixture.controller.getQueue()
      const pending = after.items.filter((item) => !first.jobIds.includes(item.id))
      assert.equal(pending.length, 4, 'all admitted outputs remain durable pending metadata')
      assert.ok(pending.every((item) => item.status === 'pending'))
      assert.equal(after.counts.running, page.counts.running)
      assert.equal(fixture.runtime.generated.length, 1)
      assert.deepEqual(await readFile(sibling.packagePath), saved)
      assert.deepEqual(await fixture.staging.listVerifiedCandidates(sibling.tabId), [])
      assert.equal(
        await fixture.staging.readLastActualSeed(sibling.tabId, sibling.documentId),
        null,
      )
      release.resolve()
      await waitForState(
        fixture.controller,
        fixture.tabId,
        (current) =>
          current.phase === 'blocked' && current.runningJobId === null && current.jobs.length === 3,
      )
      await assert.rejects(fixture.controller.shutdown(), { code: 'WORKER_EXIT_UNCONFIRMED' })
      fixture.runtime.preparationHeld = false
      await fixture.controller.shutdown()
      assert.equal(
        fixture.runtime.generated.length,
        1,
        'settled running neighbor cannot dispatch the fenced batch',
      )
      const restarted = new GenerationQueueRepository(fixture.database.db, fixture.root)
      await restarted.recoverAfterRestart()
      const recovered = await restarted.listManagerPage()
      assert.ok(
        recovered.items
          .filter((item) => pending.some((entry) => entry.id === item.id))
          .every((item) => item.status === 'canceled'),
      )
      assert.equal(
        (await fixture.staging.listVerifiedCandidates(fixture.tabId)).length,
        1,
        'the valid neighbor completion remains recoverable',
      )
      assert.deepEqual(await readFile(sibling.packagePath), saved)
    } finally {
      // The controlled runtime exposes an exit signal instead of owning a real subprocess.
      // RuntimeManager's subprocess tests verify that only observed exit releases this owner.
      fixture.runtime.preparationHeld = false
      release.resolve()
    }
  })
})

test('Generate freezes expanded pairs, drains real queue to staging, and does not write .igs', async () => {
  await withFixture(async (fixture) => {
    const before = await readFile(fixture.packagePath)
    const entered = signal()
    const release = signal()
    fixture.runtime.beforeGenerate = async () => {
      entered.resolve()
      await release.promise
    }
    const result = await fixture.controller.generate(fixture.tabId, {
      documentId: fixture.documentId,
      iterations: 1,
    })
    assert.equal(result.kind, 'queued')
    if (result.kind !== 'queued') {
      return
    }
    assert.equal(result.jobIds.length, 4)
    await entered.promise
    const during = await waitForState(
      fixture.controller,
      fixture.tabId,
      (state) => state.runningJobId === result.jobIds[0] && state.jobs.length === 4,
    )
    assert.equal(during.jobs[0].status, 'running')
    assert.deepEqual(
      during.jobs.slice(1).map((job) => [job.status, job.statusSequence]),
      [
        ['pending', 0],
        ['pending', 0],
        ['pending', 0],
      ],
    )
    assert.deepEqual(
      during.jobs.map((job) => job.seed),
      [42, 43, 44, 45],
    )
    assert.deepEqual(
      during.jobs.map((job) => job.prompt),
      ['red lantern', 'red lantern', 'blue lantern', 'blue lantern'],
    )
    const frozen = await Promise.all(result.jobIds.map((id) => fixture.queue.loadVerifiedInput(id)))
    assert.deepEqual(
      frozen.map((item) => item.payload.context.prompts.negative),
      ['blur', 'noise', 'blur', 'noise'],
    )
    assert.deepEqual(await readFile(fixture.packagePath), before)
    release.resolve()
    await waitForState(
      fixture.controller,
      fixture.tabId,
      (state) => state.phase === 'idle' && state.jobs.length === 0,
    )
    const candidates = await fixture.staging.listVerifiedCandidates(fixture.tabId)
    assert.equal(candidates.length, 4)
    assert.equal(fixture.runtime.generated.length, 4)
    assert.equal(fixture.runtime.closedCount, fixture.runtime.leaseCount)
    assert.deepEqual(await readFile(fixture.packagePath), before)
  })
})

test('Keep preserves candidates and exact reviewed replacement tombstones only those sessions', async () => {
  await withFixture(async (fixture) => {
    const request = { documentId: fixture.documentId, iterations: 1 }
    const first = await fixture.controller.generate(fixture.tabId, request)
    assert.equal(first.kind, 'queued')
    await waitForState(
      fixture.controller,
      fixture.tabId,
      (state) => state.phase === 'idle' && state.jobs.length === 0,
    )
    const original = await fixture.staging.listVerifiedCandidates(fixture.tabId)
    assert.equal(original.length, 4)
    const review = await fixture.controller.generate(fixture.tabId, request)
    assert.equal(review.kind, 'confirmation-required')
    if (review.kind !== 'confirmation-required') {
      return
    }
    assert.deepEqual(review.candidateIds, original.map((item) => item.candidateId).sort())
    assert.deepEqual(review.unfinishedJobIds, [])
    assert.equal((await fixture.staging.listVerifiedCandidates(fixture.tabId)).length, 4)
    const stale = await fixture.controller.generate(fixture.tabId, {
      ...request,
      confirmation: { candidateIds: [randomUUID()], unfinishedJobIds: [] },
    })
    assert.deepEqual(stale, review)
    await fixture.projects.updateGenerationDraft(fixture.tabId, {
      kind: 'sampling-pair',
      sampler: 'DPM++ 2M',
      scheduler: null,
    })
    await assert.rejects(
      fixture.controller.generate(fixture.tabId, {
        ...request,
        confirmation: {
          candidateIds: review.candidateIds,
          unfinishedJobIds: review.unfinishedJobIds,
        },
      }),
      { code: 'GENERATION_SAMPLING_UNSUPPORTED' },
    )
    assert.deepEqual(
      (await fixture.staging.listVerifiedCandidates(fixture.tabId)).map((item) => item.candidateId),
      original.map((item) => item.candidateId),
      'failed preparation must not delete reviewed temporary results',
    )
    await fixture.projects.updateGenerationDraft(fixture.tabId, {
      kind: 'sampling-pair',
      sampler: 'DPM++ 2M',
      scheduler: 'Karras',
    })
    const replaced = await fixture.controller.generate(fixture.tabId, {
      ...request,
      confirmation: {
        candidateIds: review.candidateIds,
        unfinishedJobIds: review.unfinishedJobIds,
      },
    })
    assert.equal(replaced.kind, 'queued')
    await waitForState(
      fixture.controller,
      fixture.tabId,
      (state) => state.phase === 'idle' && state.jobs.length === 0,
    )
    const now = await fixture.staging.listVerifiedCandidates(fixture.tabId)
    assert.equal(now.length, 4)
    assert.ok(now.every((item) => !review.candidateIds.includes(item.candidateId)))
  })
})

test('a known queue publication refusal retains the exact reviewed PNG and candidate', async () => {
  let batchCommit = 0
  await withFixture(
    async (fixture) => {
      const request = { documentId: fixture.documentId, iterations: 1 }
      const first = await fixture.controller.generate(fixture.tabId, request)
      assert.equal(first.kind, 'queued')
      await waitForState(
        fixture.controller,
        fixture.tabId,
        (state) => state.phase === 'idle' && state.jobs.length === 0,
      )
      const original = await fixture.staging.listVerifiedCandidates(fixture.tabId)
      assert.equal(original.length, 4)
      const pngBefore = await readFile(original[0].assetPath)
      const review = await fixture.controller.generate(fixture.tabId, request)
      assert.equal(review.kind, 'confirmation-required')
      if (review.kind !== 'confirmation-required') {
        return
      }
      await assert.rejects(
        fixture.controller.generate(fixture.tabId, {
          ...request,
          confirmation: {
            candidateIds: review.candidateIds,
            unfinishedJobIds: review.unfinishedJobIds,
          },
        }),
      )
      assert.deepEqual(
        (await fixture.staging.listVerifiedCandidates(fixture.tabId)).map(
          (item) => item.candidateId,
        ),
        original.map((item) => item.candidateId),
      )
      assert.deepEqual(await readFile(original[0].assetPath), pngBefore)
      assert.deepEqual(
        await fixture.queue.listUnfinishedByProjectDocument(fixture.tabId, fixture.documentId),
        [],
      )
    },
    {
      beforeBatchCommit: async () => {
        batchCommit += 1
        if (batchCommit === 2) {
          throw new Error('known queue refusal before batch commit')
        }
      },
    },
  )
})

test('failed old-result cleanup cancels the newly admitted batch and fences another Generate', async () => {
  await withFixture(async (fixture) => {
    const request = { documentId: fixture.documentId, iterations: 1 }
    await fixture.controller.generate(fixture.tabId, request)
    await waitForState(
      fixture.controller,
      fixture.tabId,
      (state) => state.phase === 'idle' && state.jobs.length === 0,
    )
    const original = await fixture.staging.listVerifiedCandidates(fixture.tabId)
    const review = await fixture.controller.generate(fixture.tabId, request)
    assert.equal(review.kind, 'confirmation-required')
    if (review.kind !== 'confirmation-required') {
      return
    }
    fixture.staging.discardSessions = async () => {
      throw new Error('simulated staging cleanup failure')
    }
    await assert.rejects(
      fixture.controller.generate(fixture.tabId, {
        ...request,
        confirmation: {
          candidateIds: review.candidateIds,
          unfinishedJobIds: review.unfinishedJobIds,
        },
      }),
      { code: 'GENERATION_REPLACEMENT_UNCERTAIN' },
    )
    const state = await fixture.controller.getState(fixture.tabId)
    assert.equal(state.phase, 'blocked')
    assert.deepEqual(state.jobs, [])
    assert.deepEqual(
      (await fixture.staging.listVerifiedCandidates(fixture.tabId)).map((item) => item.candidateId),
      original.map((item) => item.candidateId),
    )
    await assert.rejects(fixture.controller.generate(fixture.tabId, request), {
      code: 'GENERATION_BLOCKED',
    })
  })
})

test('Project edits during a paused runtime lease cannot replace the captured draft', async () => {
  await withFixture(async (fixture) => {
    const entered = signal()
    const release = signal()
    fixture.runtime.beforeCompose = async () => {
      entered.resolve()
      await release.promise
    }
    const pending = fixture.controller.generate(fixture.tabId, {
      documentId: fixture.documentId,
      iterations: 1,
    })
    await entered.promise
    await fixture.projects.updateGenerationDraft(fixture.tabId, {
      kind: 'positive-prompt',
      text: 'a later edited prompt',
    })
    await fixture.projects.updateGenerationDraft(fixture.tabId, {
      kind: 'dynamic-prompt',
      value: { maxPrompts: 1, seedBehavior: 'per-iteration' },
    })
    release.resolve()
    const result = await pending
    assert.equal(result.kind, 'queued')
    if (result.kind !== 'queued') {
      return
    }
    assert.equal(result.jobIds.length, 4, 'the captured dynamic settings remain effective')
    const frozen = await Promise.all(result.jobIds.map((id) => fixture.queue.loadVerifiedInput(id)))
    assert.deepEqual(
      frozen.map((item) => item.payload.context.prompts.positive),
      ['red lantern', 'red lantern', 'blue lantern', 'blue lantern'],
    )
    assert.deepEqual(
      frozen.map((item) => item.payload.context.sampling.seed),
      [42, 43, 44, 45],
    )
  })
})

test('Project input is captured before an asynchronous replacement-impact read', async () => {
  await withFixture(async (fixture) => {
    const entered = signal()
    const release = signal()
    const readUnfinished = fixture.queue.listUnfinishedByProjectDocument.bind(fixture.queue)
    fixture.queue.listUnfinishedByProjectDocument = async (...args) => {
      entered.resolve()
      await release.promise
      return await readUnfinished(...args)
    }
    const pending = fixture.controller.generate(fixture.tabId, {
      documentId: fixture.documentId,
      iterations: 1,
    })
    await entered.promise
    await fixture.projects.updateGenerationDraft(fixture.tabId, {
      kind: 'positive-prompt',
      text: 'edited while results were being read',
    })
    release.resolve()
    const result = await pending
    assert.equal(result.kind, 'queued')
    if (result.kind !== 'queued') {
      return
    }
    const frozen = await fixture.queue.loadVerifiedInput(result.jobIds[0])
    assert.equal(frozen.payload.context.prompts.positive, 'red lantern')
  })
})

test('current Cancel requires its exact running ID and awaits worker exit', async () => {
  await withFixture(async (fixture) => {
    const entered = signal()
    fixture.runtime.beforeGenerate = async () => {
      entered.resolve()
      await new Promise<void>(() => undefined)
    }
    const result = await fixture.controller.generate(fixture.tabId, {
      documentId: fixture.documentId,
      iterations: 1,
    })
    assert.equal(result.kind, 'queued')
    await entered.promise
    const running = await waitForState(
      fixture.controller,
      fixture.tabId,
      (state) => state.runningJobId !== null,
    )
    await assert.rejects(
      fixture.controller.cancelCurrent(fixture.tabId, fixture.documentId, randomUUID()),
      { code: 'GENERATION_NO_CURRENT_JOB' },
    )
    assert.equal(fixture.runtime.closedCount, 1, 'admission worker already exited')
    const canceled = await fixture.controller.cancelCurrent(
      fixture.tabId,
      fixture.documentId,
      running.runningJobId!,
    )
    assert.ok(canceled.jobs.every((job) => job.id !== running.runningJobId))
    assert.ok(fixture.runtime.closedCount >= 2, 'cancel awaited inference worker exit')
    assert.equal((await fixture.staging.listVerifiedCandidates(fixture.tabId)).length, 0)
  })
})

test('unavailable runtime refuses safely without publishing or deleting prior results', async () => {
  await withFixture(async (fixture) => {
    fixture.runtime.available = false
    await assert.rejects(
      fixture.controller.generate(fixture.tabId, {
        documentId: fixture.documentId,
        iterations: 1,
      }),
      { code: 'GENERATION_RUNTIME_UNAVAILABLE' },
    )
    const state = await fixture.controller.getState(fixture.tabId)
    assert.equal(state.phase, 'idle')
    assert.equal(state.error?.code, 'GENERATION_RUNTIME_UNAVAILABLE')
    assert.deepEqual(state.jobs, [])
    assert.deepEqual(await fixture.staging.listVerifiedCandidates(fixture.tabId), [])
  })
})

test('generation state never echoes worker paths from a failed request', async () => {
  await withFixture(async (fixture) => {
    fixture.runtime.beforeCompose = async () => {
      throw Object.assign(new Error('private path /home/person/secret.safetensors'), {
        code: 'WORKER_REQUEST_FAILED',
      })
    }
    await assert.rejects(
      fixture.controller.generate(fixture.tabId, {
        documentId: fixture.documentId,
        iterations: 1,
      }),
      { code: 'WORKER_REQUEST_FAILED' },
    )
    const state = await fixture.controller.getState(fixture.tabId)
    assert.equal(state.phase, 'idle')
    assert.equal(state.error?.code, 'WORKER_REQUEST_FAILED')
    assert.ok(!state.error?.message.includes('/home/person/'))
    assert.deepEqual(state.jobs, [])
  })
})

test('Generate IPC error projection retains actionable owned refusals and hides arbitrary paths', () => {
  assert.deepEqual(
    toProjectGenerationActionApiError(
      new GenerationBatchPlanError('BATCH_TOO_LARGE', 'The planned jobs exceed the limit.'),
    ),
    { code: 'BATCH_TOO_LARGE', message: 'The planned jobs exceed the limit.' },
  )
  assert.deepEqual(
    toProjectGenerationActionApiError(
      new GenerationPreparationError('GENERATION_SAMPLING_UNSUPPORTED', 'Choose a sampler.'),
    ),
    { code: 'GENERATION_SAMPLING_UNSUPPORTED', message: 'Choose a sampler.' },
  )
  assert.deepEqual(
    toProjectGenerationActionApiError(
      new IllustriousJobError('GENERATION_TARGET_UNSUPPORTED', 'Use a supported target.'),
    ),
    { code: 'GENERATION_TARGET_UNSUPPORTED', message: 'Use a supported target.' },
  )
  assert.deepEqual(
    toProjectGenerationActionApiError(
      Object.assign(new Error('private /home/person/weights.safetensors'), {
        code: 'WORKER_REQUEST_FAILED',
      }),
    ),
    {
      code: 'WORKER_REQUEST_FAILED',
      message: 'The image runtime could not complete this generation request.',
    },
  )
  assert.deepEqual(
    toProjectGenerationActionApiError(new Error('private /home/person/weights.safetensors')),
    {
      code: 'GENERATION_FAILED',
      message: 'Generation could not continue. Review the settings and try again.',
    },
  )
})

test('shutdown fences a paused preparation before any queue publication', async () => {
  await withFixture(async (fixture) => {
    const entered = signal()
    const release = signal()
    fixture.runtime.beforeCompose = async () => {
      entered.resolve()
      await release.promise
    }
    const pending = fixture.controller.generate(fixture.tabId, {
      documentId: fixture.documentId,
      iterations: 1,
    })
    await entered.promise
    const stopping = fixture.controller.shutdown()
    release.resolve()
    await assert.rejects(pending, { code: 'GENERATION_CLOSED' })
    await stopping
    assert.deepEqual(
      await fixture.queue.listUnfinishedByProjectDocument(fixture.tabId, fixture.documentId),
      [],
    )
    assert.equal((await fixture.controller.getState(fixture.tabId)).phase, 'closed')
  })
})

async function makeFailedSource(fixture: Fixture) {
  fixture.runtime.beforeGenerate = async () => {
    if (fixture.runtime.generated.length === 1) {
      throw new Error('controlled first-job failure')
    }
  }
  const result = await fixture.controller.generate(fixture.tabId, {
    documentId: fixture.documentId,
    iterations: 1,
  })
  assert.equal(result.kind, 'queued')
  await waitForState(
    fixture.controller,
    fixture.tabId,
    (state) => state.phase === 'idle' && state.jobs.length === 0,
  )
  const page = await fixture.controller.getQueue()
  assert.equal(page.counts.failed, 1)
  assert.equal(page.counts.completed, 3)
  const source = page.items.find((item) => item.status === 'failed')!
  fixture.runtime.beforeGenerate = null
  return { id: source.id, statusSequence: source.statusSequence }
}

async function holdRunningSibling(fixture: Fixture) {
  const entered = signal()
  const release = signal()
  fixture.runtime.beforeGenerate = async () => {
    if (fixture.runtime.generated.length === 1) {
      throw new Error('controlled first-job failure')
    }
    if (fixture.runtime.generated.length === 2) {
      entered.resolve()
      await release.promise
    }
  }
  const generated = await fixture.controller.generate(fixture.tabId, {
    documentId: fixture.documentId,
    iterations: 1,
  })
  assert.equal(generated.kind, 'queued')
  await entered.promise
  const page = await fixture.controller.getQueue()
  const source = page.items.find((item) => item.status === 'failed')!
  assert.ok(source)
  assert.equal(page.counts.running, 1)
  assert.equal(page.counts.pending, 2)
  return { release, review: { id: source.id, statusSequence: source.statusSequence } }
}

test('Retry admits its real frozen queue copy while a sibling worker is running without a second lease', async () => {
  await withFixture(async (fixture) => {
    const { release, review } = await holdRunningSibling(fixture)
    try {
      const source = await fixture.queue.loadVerifiedInput(review.id)
      const originalRows = (await fixture.controller.getQueue()).items.map((item) => item.id)
      const saved = await readFile(fixture.packagePath)
      const candidates = await fixture.staging.listVerifiedCandidates(fixture.tabId)
      const cursor = await fixture.staging.readLastActualSeed(fixture.tabId, fixture.documentId)
      const leases = fixture.runtime.leaseCount
      await fixture.projects.updateGenerationDraft(fixture.tabId, {
        kind: 'positive-prompt',
        text: 'edited while the neighbor worker is running',
      })
      await fixture.projects.updateGenerationDraft(fixture.tabId, {
        kind: 'seed',
        policy: 'fixed',
        value: 99,
      })
      const document = fixture.projects.getOpenDocumentForAcceptance(fixture.tabId)
      await fixture.controller.retryJob(review)
      const page = await fixture.controller.getQueue()
      const retry = page.items.find((item) => !originalRows.includes(item.id))!
      assert.ok(retry)
      assert.equal(retry.status, 'pending', 'Retry is durable before the held worker finishes')
      assert.equal(page.counts.running, 1)
      assert.equal(page.counts.pending, 3)
      assert.equal(fixture.runtime.generated.length, 2, 'the current worker alone owns inference')
      assert.equal(fixture.runtime.leaseCount, leases, 'metadata admission starts no CUDA child')
      const copied = await fixture.queue.loadVerifiedInput(retry.id)
      assert.deepEqual(copied.payload, source.payload)
      assert.deepEqual(await readFile(copied.targetPath), await readFile(source.targetPath))
      assert.notEqual(retry.stagingSessionId, source.item.stagingSessionId)
      assert.equal(
        page.items.find((item) => item.id === review.id)!.statusSequence,
        review.statusSequence + 1,
      )
      assert.deepEqual(fixture.projects.getOpenDocumentForAcceptance(fixture.tabId), document)
      assert.deepEqual(await readFile(fixture.packagePath), saved)
      assert.deepEqual(await fixture.staging.listVerifiedCandidates(fixture.tabId), candidates)
      assert.deepEqual(
        await fixture.staging.readLastActualSeed(fixture.tabId, fixture.documentId),
        cursor,
      )
      const generationReview = await fixture.controller.generate(fixture.tabId, {
        documentId: fixture.documentId,
        iterations: 1,
      })
      assert.equal(generationReview.kind, 'confirmation-required')
      assert.equal(fixture.runtime.preparationCount, 0, 'unconfirmed replacement starts no CPU job')
      await assert.rejects(fixture.controller.retryJob(review), {
        code: 'GENERATION_INVALID_REQUEST',
      })
      release.resolve()
      await waitForState(
        fixture.controller,
        fixture.tabId,
        (state) => state.phase === 'idle' && state.jobs.length === 0,
      )
      assert.equal(fixture.runtime.generated.length, 5)
      const last = fixture.runtime.generated.at(-1)!
      assert.equal(last.job.prompts.positive, 'red lantern')
      assert.equal(last.job.sampling.seed, 42)
      assert.deepEqual(last.job.bbox, { height: 64, width: 64, x: 0, y: 0 })
      assert.equal((await fixture.controller.getQueue()).counts.completed, 4)
      assert.equal((await fixture.staging.listVerifiedCandidates(fixture.tabId)).length, 4)
    } finally {
      release.resolve()
    }
  })
})

test('a successful Retry publication after actual dispatch observed idle wakes the finishing drain', async () => {
  await withFixture(async (fixture) => {
    const entered = signal()
    const release = signal()
    const runNext = fixture.dispatch.runNext.bind(fixture.dispatch)
    let heldIdle = false
    fixture.dispatch.runNext = async () => {
      const result = await runNext()
      if (result.kind === 'idle' && !heldIdle) {
        heldIdle = true
        entered.resolve()
        await release.promise
      }
      return result
    }
    fixture.runtime.beforeGenerate = async () => {
      if (fixture.runtime.generated.length === 1) {
        throw new Error('controlled first-job failure')
      }
    }
    try {
      await fixture.controller.generate(fixture.tabId, {
        documentId: fixture.documentId,
        iterations: 1,
      })
      await entered.promise
      assert.equal((await fixture.controller.getState(fixture.tabId)).phase, 'processing')
      const source = (await fixture.controller.getQueue()).items.find(
        (item) => item.status === 'failed',
      )!
      await fixture.controller.retryJob({ id: source.id, statusSequence: source.statusSequence })
      assert.equal((await fixture.controller.getQueue()).counts.pending, 1)
      assert.equal(fixture.runtime.generated.length, 4)
      release.resolve()
      await waitForState(
        fixture.controller,
        fixture.tabId,
        (state) => state.phase === 'idle' && state.jobs.length === 0,
      )
      assert.equal(fixture.runtime.generated.length, 5)
      assert.equal((await fixture.controller.getQueue()).counts.completed, 4)
    } finally {
      release.resolve()
    }
  })
})

test('busy Retry capacity refusal preserves the source and worker while the existing drain continues', async () => {
  await withFixture(async (fixture) => {
    const { release, review } = await holdRunningSibling(fixture)
    try {
      const before = await fixture.controller.getQueue()
      const cursor = await fixture.staging.readLastActualSeed(fixture.tabId, fixture.documentId)
      const leases = fixture.runtime.leaseCount
      fixture.staging.preflightBatchCapacity = async () => {
        throw Object.assign(new Error('controlled busy capacity refusal'), {
          code: 'STAGING_CAPACITY_EXCEEDED',
        })
      }
      await assert.rejects(fixture.controller.retryJob(review), {
        code: 'STAGING_CAPACITY_EXCEEDED',
      })
      assert.deepEqual(await fixture.controller.getQueue(), before)
      assert.equal(fixture.runtime.leaseCount, leases)
      assert.equal(fixture.runtime.generated.length, 2)
      assert.deepEqual(
        await fixture.staging.readLastActualSeed(fixture.tabId, fixture.documentId),
        cursor,
      )
      release.resolve()
      await waitForState(
        fixture.controller,
        fixture.tabId,
        (state) => state.phase === 'idle' && state.jobs.length === 0,
      )
      assert.equal(fixture.runtime.generated.length, 4, 'refused Retry cannot enter the drain')
      assert.equal((await fixture.controller.getQueue()).counts.completed, 3)
    } finally {
      release.resolve()
    }
  })
})

test('busy Retry runtime and checkpoint refusals preserve the reviewed source and existing drain', async (t) => {
  for (const failure of ['runtime', 'checkpoint'] as const) {
    await t.test(failure, async () => {
      await withFixture(async (fixture) => {
        const { release, review } = await holdRunningSibling(fixture)
        const source = await fixture.queue.loadVerifiedInput(review.id)
        const checkpoint = await readFile(source.payload.context.model.managedPath)
        try {
          const before = await fixture.controller.getQueue()
          const leases = fixture.runtime.leaseCount
          const saved = await readFile(fixture.packagePath)
          const cursor = await fixture.staging.readLastActualSeed(fixture.tabId, fixture.documentId)
          if (failure === 'runtime') {
            fixture.runtime.available = false
            await assert.rejects(fixture.controller.retryJob(review), {
              code: 'GENERATION_RUNTIME_UNAVAILABLE',
            })
          } else {
            await writeFile(source.payload.context.model.managedPath, 'corrupted busy weights')
            await assert.rejects(fixture.controller.retryJob(review))
          }
          assert.deepEqual(await fixture.controller.getQueue(), before)
          assert.equal(fixture.runtime.leaseCount, leases)
          assert.equal(fixture.runtime.generated.length, 2)
          assert.deepEqual(await readFile(fixture.packagePath), saved)
          assert.deepEqual(
            await fixture.staging.readLastActualSeed(fixture.tabId, fixture.documentId),
            cursor,
          )
        } finally {
          fixture.runtime.available = true
          await writeFile(source.payload.context.model.managedPath, checkpoint)
          release.resolve()
        }
        await waitForState(
          fixture.controller,
          fixture.tabId,
          (state) => state.phase === 'idle' && state.jobs.length === 0,
        )
        assert.equal(fixture.runtime.generated.length, 4)
      })
    })
  }
})

test('a concurrent worker-exit fence survives busy Retry recheck and later nonblocking refusal', async (t) => {
  for (const refusal of ['blocked-recheck', 'late-capacity'] as const) {
    await t.test(refusal, async () => {
      await withFixture(async (fixture) => {
        const { release: releaseWorker, review } = await holdRunningSibling(fixture)
        const entered = signal()
        const releaseAdmission = signal()
        fixture.runtime.beforeAdmission = async () => {
          entered.resolve()
          await releaseAdmission.promise
          if (refusal === 'late-capacity') {
            throw Object.assign(new Error('controlled late nonblocking refusal'), {
              code: 'STAGING_CAPACITY_EXCEEDED',
            })
          }
        }
        try {
          const page = await fixture.controller.getQueue()
          const running = page.items.find((item) => item.status === 'running')!
          const saved = await readFile(fixture.packagePath)
          const cursor = await fixture.staging.readLastActualSeed(fixture.tabId, fixture.documentId)
          const retry = fixture.controller.retryJob(review)
          await entered.promise
          fixture.runtime.closeFailures = 2
          await assert.rejects(
            fixture.controller.cancelJob({
              id: running.id,
              statusSequence: running.statusSequence,
            }),
            { code: 'WORKER_EXIT_UNCONFIRMED' },
          )
          assert.equal((await fixture.controller.getState(fixture.tabId)).phase, 'blocked')
          releaseAdmission.resolve()
          await assert.rejects(retry, {
            code:
              refusal === 'blocked-recheck' ? 'GENERATION_BLOCKED' : 'STAGING_CAPACITY_EXCEEDED',
          })
          const state = await fixture.controller.getState(fixture.tabId)
          assert.equal(state.phase, 'blocked', 'a later refusal cannot release a recovery fence')
          assert.equal(state.error?.code, 'WORKER_EXIT_UNCONFIRMED')
          const after = await fixture.controller.getQueue()
          assert.equal(after.items.length, page.items.length, 'the Retry cannot publish')
          assert.equal(
            after.items.find((item) => item.id === review.id)!.statusSequence,
            review.statusSequence,
          )
          assert.equal(fixture.runtime.generated.length, 2, 'the drain cannot claim another job')
          assert.deepEqual(await readFile(fixture.packagePath), saved)
          assert.deepEqual(
            await fixture.staging.readLastActualSeed(fixture.tabId, fixture.documentId),
            cursor,
          )
          const requested = after.items.find((item) => item.id === running.id)!
          await fixture.controller.cancelJob({
            id: requested.id,
            statusSequence: requested.statusSequence,
          })
          assert.equal((await fixture.controller.getState(fixture.tabId)).phase, 'blocked')
        } finally {
          releaseAdmission.resolve()
          releaseWorker.resolve()
        }
      })
    })
  }
})

test('shutdown during busy Retry copy waits admission, refuses publication and cancels the active worker', async () => {
  const entered = signal()
  const releaseCopy = signal()
  await withFixture(
    async (fixture) => {
      const { release: releaseWorker, review } = await holdRunningSibling(fixture)
      try {
        const before = await fixture.controller.getQueue()
        const rows = await fixture.database.db
          .selectFrom('generation_queue_item')
          .selectAll()
          .orderBy('id', 'asc')
          .execute()
        const saved = await readFile(fixture.packagePath)
        const cursor = await fixture.staging.readLastActualSeed(fixture.tabId, fixture.documentId)
        const leases = fixture.runtime.leaseCount
        const retry = fixture.controller.retryJob(review)
        await entered.promise
        const admissions = fixture.runtime.admissionCount
        await assert.rejects(fixture.controller.retryJob(review), { code: 'GENERATION_BUSY' })
        assert.equal(
          fixture.runtime.admissionCount,
          admissions,
          'a concurrent second Retry refuses before metadata admission',
        )
        assert.equal(fixture.runtime.leaseCount, leases)
        assert.deepEqual(
          await fixture.database.db
            .selectFrom('generation_queue_item')
            .selectAll()
            .orderBy('id', 'asc')
            .execute(),
          rows,
          'neither held Retry nor the refused click may consume its source before publication',
        )
        const stopping = fixture.controller.shutdown()
        assert.equal(fixture.runtime.generated.length, 2)
        releaseCopy.resolve()
        await assert.rejects(retry, { code: 'QUEUE_PROJECT_CLOSING' })
        await stopping
        const page = await fixture.controller
          .getQueue()
          .catch(() => fixture.queue.listManagerPage())
        assert.equal(page.items.length, before.items.length)
        assert.equal(
          page.items.find((item) => item.id === review.id)!.statusSequence,
          review.statusSequence,
        )
        assert.equal(page.counts.running, 0)
        assert.equal(fixture.runtime.generated.length, 2, 'no next job starts during shutdown')
        assert.deepEqual(await readFile(fixture.packagePath), saved)
        assert.deepEqual(
          await fixture.staging.readLastActualSeed(fixture.tabId, fixture.documentId),
          cursor,
        )
      } finally {
        releaseCopy.resolve()
        releaseWorker.resolve()
      }
    },
    {
      afterRetryInputPublish: async () => {
        entered.resolve()
        await releaseCopy.promise
      },
    },
  )
})

test('confirmed close waits busy Retry admission and cancels the running worker plus its new pending copy', async () => {
  const entered = signal()
  const releaseCopy = signal()
  await withFixture(
    async (fixture) => {
      const { release: releaseWorker, review } = await holdRunningSibling(fixture)
      try {
        const saved = await readFile(fixture.packagePath)
        const retry = fixture.controller.retryJob(review)
        await entered.promise
        const closing = fixture.closeOwner.close(fixture.tabId, {
          confirmCloseImpact: true,
          discardDocument: false,
        })
        assert.equal(fixture.projects.getOpenDocumentId(fixture.tabId), fixture.documentId)
        releaseCopy.resolve()
        await retry
        await closing
        assert.equal(fixture.projects.getOpenDocumentId(fixture.tabId), null)
        assert.deepEqual(await fixture.queue.listUnfinishedByProject(fixture.tabId), [])
        assert.deepEqual(await fixture.staging.listVerifiedCandidates(fixture.tabId), [])
        assert.equal(fixture.runtime.generated.length, 2)
        const page = await fixture.queue.listManagerPage()
        assert.equal(page.items.length, 5)
        assert.equal(page.counts.failed, 1)
        assert.equal(page.counts.canceled, 4)
        assert.deepEqual(await readFile(fixture.packagePath), saved)
      } finally {
        releaseCopy.resolve()
        releaseWorker.resolve()
      }
    },
    {
      afterRetryInputPublish: async () => {
        entered.resolve()
        await releaseCopy.promise
      },
    },
  )
})

test('Queue Manager Retry uses frozen operation and preserves old candidates and saved document', async () => {
  await withFixture(async (fixture) => {
    const review = await makeFailedSource(fixture)
    const before = await fixture.staging.listVerifiedCandidates(fixture.tabId)
    const saved = await readFile(fixture.packagePath)
    await fixture.projects.updateGenerationDraft(fixture.tabId, {
      kind: 'positive-prompt',
      text: 'current edited prompt',
    })
    await fixture.projects.updateGenerationDraft(fixture.tabId, {
      kind: 'seed',
      policy: 'fixed',
      value: 99,
    })
    await fixture.controller.retryJob(review)
    await waitForState(
      fixture.controller,
      fixture.tabId,
      (state) => state.phase === 'idle' && state.jobs.length === 0,
    )
    const retried = fixture.runtime.generated.at(-1)!
    assert.equal(retried.job.prompts.positive, 'red lantern')
    assert.equal(retried.job.sampling.seed, 42)
    assert.deepEqual(retried.job.bbox, { height: 64, width: 64, x: 0, y: 0 })
    const candidates = await fixture.staging.listVerifiedCandidates(fixture.tabId)
    assert.equal(candidates.length, 4)
    assert.ok(
      before.every((old) => candidates.some((item) => item.candidateId === old.candidateId)),
    )
    assert.deepEqual(await readFile(fixture.packagePath), saved)
    assert.equal(
      fixture.projects.getOpenTabs()[0].generationDraft.positivePrompt.text,
      'current edited prompt',
    )
    const page = await fixture.controller.getQueue()
    assert.equal(page.counts.failed, 1, 'retry retains source history')
    assert.equal(page.counts.completed, 4)
    assert.ok(page.items.every((item) => item.projectName === 'Generate actions'))
    await assert.rejects(fixture.controller.retryJob(review), {
      code: 'GENERATION_INVALID_REQUEST',
    })
    assert.equal(
      (await fixture.controller.getQueue()).items.length,
      5,
      'one reviewed source creates one attempt',
    )
  })
})

test('Queue Manager Retry refuses a different document reopened at the same path', async () => {
  await withFixture(async (fixture) => {
    const review = await makeFailedSource(fixture)
    const leases = fixture.runtime.leaseCount
    const original = await fixture.database.db
      .selectFrom('generation_queue_item')
      .selectAll()
      .execute()
    await fixture.projects.close(fixture.tabId)
    const second = await fixture.projects.create({
      height: 64,
      title: 'Replacement document',
      width: 64,
    })
    await fixture.projects.save(second.id)
    const index = new ProjectIndexRepository(fixture.database.db)
    const secondPath = (await index.getProject(second.id))!.canonicalPath
    await copyFile(secondPath, fixture.packagePath)
    const opened = await fixture.projects.open(fixture.tabId)
    assert.equal(opened.kind, 'opened')
    assert.notEqual(fixture.projects.getOpenDocumentId(fixture.tabId), fixture.documentId)
    await assert.rejects(fixture.controller.retryJob(review), {
      code: 'GENERATION_DOCUMENT_CHANGED',
    })
    assert.equal(
      fixture.runtime.leaseCount,
      leases,
      'identity refusal precedes runtime reservation',
    )
    assert.deepEqual(
      await fixture.database.db.selectFrom('generation_queue_item').selectAll().execute(),
      original,
    )
  })
})

test('Queue Manager history and terminal cleanup work without runtime and preserve candidate bytes and seed', async () => {
  await withFixture(async (fixture) => {
    const review = await makeFailedSource(fixture)
    const candidates = await fixture.staging.listVerifiedCandidates(fixture.tabId)
    const pngs = await Promise.all(candidates.map((candidate) => readFile(candidate.assetPath)))
    const seed = await fixture.staging.readLastActualSeed(fixture.tabId, fixture.documentId)
    const document = fixture.projects.getOpenDocumentForAcceptance(fixture.tabId)
    const saved = await readFile(fixture.packagePath)
    fixture.runtime.available = false
    await assert.rejects(fixture.controller.retryJob(review), {
      code: 'GENERATION_RUNTIME_UNAVAILABLE',
    })
    const page = await fixture.controller.getQueue()
    assert.equal(
      page.items.find((item) => item.id === review.id)!.statusSequence,
      review.statusSequence,
    )
    await fixture.controller.deleteJob(review)
    assert.equal(await fixture.controller.pruneQueue(['completed', 'failed', 'canceled']), 3)
    assert.equal((await fixture.controller.getQueue()).items.length, 0)
    assert.deepEqual(
      await fixture.staging.readLastActualSeed(fixture.tabId, fixture.documentId),
      seed,
    )
    assert.deepEqual(fixture.projects.getOpenDocumentForAcceptance(fixture.tabId), document)
    assert.deepEqual(await readFile(fixture.packagePath), saved)
    assert.deepEqual(
      await Promise.all(candidates.map((candidate) => readFile(candidate.assetPath))),
      pngs,
    )
    assert.equal((await fixture.staging.listVerifiedCandidates(fixture.tabId)).length, 3)
  })
})

test('Queue Manager pending Cancel is scoped to the reviewed revision and leaves the running neighbor alive', async () => {
  await withFixture(async (fixture) => {
    const entered = signal()
    fixture.runtime.beforeGenerate = async () => {
      entered.resolve()
      await new Promise<void>(() => undefined)
    }
    await fixture.controller.generate(fixture.tabId, {
      documentId: fixture.documentId,
      iterations: 1,
    })
    await entered.promise
    const page = await fixture.controller.getQueue()
    const pending = page.items.find((item) => item.status === 'pending')!
    const running = page.items.find((item) => item.status === 'running')!
    const leases = fixture.runtime.closedCount
    await fixture.controller.cancelJob({ id: pending.id, statusSequence: pending.statusSequence })
    const after = await fixture.controller.getQueue()
    assert.equal(after.items.find((item) => item.id === pending.id)!.status, 'canceled')
    assert.equal(after.items.find((item) => item.id === running.id)!.status, 'running')
    assert.equal(
      fixture.runtime.closedCount,
      leases,
      'pending cancellation must not close the neighbor worker',
    )
    await assert.rejects(
      fixture.controller.cancelJob({ id: running.id, statusSequence: running.statusSequence - 1 }),
      { code: 'QUEUE_STATUS_CONFLICT' },
    )
    assert.equal(
      (await fixture.controller.getQueue()).items.find((item) => item.id === running.id)!
        .cancelRequested,
      false,
    )
  })
})

test('Queue Manager Retry preflight refusal retains source revision and existing staging', async () => {
  await withFixture(async (fixture) => {
    const review = await makeFailedSource(fixture)
    const before = await fixture.controller.getQueue()
    const candidates = await fixture.staging.listVerifiedCandidates(fixture.tabId)
    // Controlled storage refusal at the subordinate capacity boundary; real retry publication
    // and source CAS remain the subjects, not a fake retry implementation.
    fixture.staging.preflightBatchCapacity = async () => {
      throw Object.assign(new Error('controlled capacity refusal'), {
        code: 'STAGING_CAPACITY_EXCEEDED',
      })
    }
    await assert.rejects(fixture.controller.retryJob(review), { code: 'STAGING_CAPACITY_EXCEEDED' })
    assert.deepEqual(await fixture.controller.getQueue(), before)
    assert.deepEqual(
      (await fixture.staging.listVerifiedCandidates(fixture.tabId)).map((item) => item.candidateId),
      candidates.map((item) => item.candidateId),
    )
  })
})

test('shutdown during durable Retry copy prevents publication and waits admission', async () => {
  const entered = signal()
  const release = signal()
  await withFixture(
    async (fixture) => {
      const review = await makeFailedSource(fixture)
      const before = await fixture.queue.listManagerPage()
      const retry = fixture.controller.retryJob(review)
      await entered.promise
      const stopped = fixture.controller.shutdown()
      release.resolve()
      await assert.rejects(retry, { code: 'QUEUE_PROJECT_CLOSING' })
      await stopped
      assert.deepEqual(await fixture.queue.listManagerPage(), before)
    },
    {
      afterRetryInputPublish: async () => {
        entered.resolve()
        await release.promise
      },
    },
  )
})

test('confirmed Project close shares Retry gate and cancels its late admitted job before closing', async () => {
  const entered = signal()
  const release = signal()
  await withFixture(
    async (fixture) => {
      const review = await makeFailedSource(fixture)
      const saved = await readFile(fixture.packagePath)
      const retry = fixture.controller.retryJob(review)
      await entered.promise
      const closing = fixture.closeOwner.close(fixture.tabId, {
        confirmCloseImpact: true,
        discardDocument: false,
      })
      assert.equal(fixture.projects.getOpenDocumentId(fixture.tabId), fixture.documentId)
      assert.equal(
        (await fixture.staging.listVerifiedCandidates(fixture.tabId)).length,
        3,
        'close must wait the admitted operation',
      )
      release.resolve()
      await retry
      await closing
      assert.equal(fixture.projects.getOpenDocumentId(fixture.tabId), null)
      assert.deepEqual(await fixture.queue.listUnfinishedByProject(fixture.tabId), [])
      assert.deepEqual(await fixture.staging.listVerifiedCandidates(fixture.tabId), [])
      assert.deepEqual(
        await readFile(fixture.packagePath),
        saved,
        'confirmed staging loss still does not Save document changes',
      )
    },
    {
      afterRetryInputPublish: async () => {
        entered.resolve()
        await release.promise
      },
    },
  )
})

test('Retry verifies installed checkpoint again before consuming the reviewed source', async () => {
  await withFixture(async (fixture) => {
    const review = await makeFailedSource(fixture)
    const source = await fixture.queue.loadVerifiedInput(review.id)
    const before = await fixture.controller.getQueue()
    await writeFile(source.payload.context.model.managedPath, 'corrupted replacement weights')
    await assert.rejects(fixture.controller.retryJob(review))
    assert.deepEqual(await fixture.controller.getQueue(), before)
    assert.equal(fixture.runtime.generated.length, 4)
    assert.equal((await fixture.staging.listVerifiedCandidates(fixture.tabId)).length, 3)
  })
})

test('Retry consumes retained verified PNG bytes instead of reopening the display pathname', async () => {
  await withFixture(async (fixture) => {
    const review = await makeFailedSource(fixture)
    const load = fixture.queue.loadVerifiedRetryInput.bind(fixture.queue)
    fixture.queue.loadVerifiedRetryInput = async (id) => ({
      ...(await load(id)),
      targetPath: path.join(fixture.root, 'not-a-retained-file.png'),
    })
    await fixture.controller.retryJob(review)
    await waitForState(
      fixture.controller,
      fixture.tabId,
      (state) => state.phase === 'idle' && state.jobs.length === 0,
    )
    assert.equal(fixture.runtime.generated.at(-1)!.job.prompts.positive, 'red lantern')
    assert.equal((await fixture.staging.listVerifiedCandidates(fixture.tabId)).length, 4)
  })
})

test('Queue Manager may retry cancel after unconfirmed exit without releasing the running slot early', async () => {
  await withFixture(async (fixture) => {
    const entered = signal()
    fixture.runtime.beforeGenerate = async () => {
      entered.resolve()
      await new Promise<void>(() => undefined)
    }
    await fixture.controller.generate(fixture.tabId, {
      documentId: fixture.documentId,
      iterations: 1,
    })
    await entered.promise
    const running = (await fixture.controller.getQueue()).items.find(
      (item) => item.status === 'running',
    )!
    fixture.runtime.closeFailures = 2
    await assert.rejects(
      fixture.controller.cancelJob({ id: running.id, statusSequence: running.statusSequence }),
      { code: 'WORKER_EXIT_UNCONFIRMED' },
    )
    const requested = (await fixture.controller.getQueue()).items.find(
      (item) => item.id === running.id,
    )!
    assert.equal(requested.status, 'running')
    assert.equal(requested.cancelRequested, true)
    assert.equal(
      fixture.runtime.generated.length,
      1,
      'no pending neighbor takes the unconfirmed worker slot',
    )
    await fixture.controller.cancelJob({
      id: requested.id,
      statusSequence: requested.statusSequence,
    })
    assert.equal(
      (await fixture.controller.getQueue()).items.find((item) => item.id === running.id)!.status,
      'canceled',
    )
    assert.equal(fixture.runtime.generated.length, 1)
  })
})
