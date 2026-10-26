import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import { GenerationBatchPlanError } from '../../shared/projects/generation-batch-plan.js'
import type { ProjectGenerationActionState } from '../../shared/projects/project-generation-actions.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { crc32, deflateSync } from 'node:zlib'

import type { AppDatabase } from '../db/database.js'
import type { GenerationWorkerTransport } from './generation-processor.js'
import type { GenerationQueueTestHooks } from './generation-queue.js'
import type { GenerationWorkerClient } from './generation-worker-client.js'
import type {
  IllustriousGenerationRequestV1,
  InferenceWorkerReady,
} from './illustrious-txt2img-job.js'
import type { ProjectWorkerClient } from './worker-client.js'

import { openAppDatabase } from '../db/database.js'
import { CivitaiClient } from '../models/civitai-client.js'
import { CivitaiTokenStore, type SafeStorageAdapter } from '../models/civitai-token-store.js'
import { ModelRepository } from '../models/model-repository.js'
import { ModelService, ModelServiceError } from '../models/model-service.js'
import { publishIllustriousEmbeddingFixture } from '../models/test-fixtures/illustrious-embedding.js'
import { publishIllustriousLoraFixture } from '../models/test-fixtures/illustrious-lora.js'
import { publishIllustriousVaeFixture } from '../models/test-fixtures/illustrious-vae.js'
import {
  ProjectGenerationActionController,
  toProjectGenerationActionApiError,
} from './generation-action-controller.js'
import { GenerationDispatchCoordinator } from './generation-dispatch-coordinator.js'
import { GenerationOrchestrator } from './generation-orchestrator.js'
import { GenerationProcessor } from './generation-processor.js'
import { GenerationQueueRepository } from './generation-queue.js'
import { GenerationStagingRepository } from './generation-staging.js'
import { readIgsPackage } from './igs-package.js'
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
  modelService: ModelService
  orchestrator: GenerationOrchestrator
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
  generated: IllustriousGenerationRequestV1[] = []
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
        assert.ok(
          request.type === 'generate-illustrious-txt2img' ||
            request.type === 'generate-illustrious-img2img',
        )
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

function regionalDocumentOwner(projects: ProjectService, tabId: string) {
  const owner = projects.getOpenDocumentForAcceptance(tabId)
  assert.ok(owner)
  return {
    documentId: owner.document.documentId,
    documentRevision: owner.document.documentRevision,
  }
}

/** Durable queue/staging evidence only; regional authoring and advisory action errors may change. */
async function regionalQueueSnapshot(f: Fixture) {
  const candidates = (await f.staging.listVerifiedCandidates(f.tabId)).sort((a, b) =>
    a.candidateId.localeCompare(b.candidateId),
  )
  return {
    candidatePixels: await Promise.all(
      candidates.map(async (candidate) => ({
        id: candidate.candidateId,
        sha256: sha256(await readFile(candidate.assetPath)),
      })),
    ),
    candidates,
    inputs: await componentPrivateTree(path.join(f.root, 'generation-inputs')),
    queue: await f.database.db
      .selectFrom('generation_queue_item')
      .selectAll()
      .orderBy('id')
      .execute(),
    receipts: await f.database.db
      .selectFrom('generation_candidate_receipt')
      .selectAll()
      .orderBy('candidate_id')
      .execute(),
    savedSha256: sha256(await readFile(f.packagePath)),
    seeds: await f.database.db
      .selectFrom('generation_seed_cursor')
      .selectAll()
      .orderBy('local_project_key')
      .orderBy('document_id')
      .execute(),
    tombstones: await f.database.db
      .selectFrom('generation_staging_discarded_session')
      .selectAll()
      .orderBy('local_project_key')
      .orderBy('staging_session_id')
      .execute(),
  }
}

async function withFixture(
  run: (fixture: Fixture) => Promise<void>,
  queueHooks: GenerationQueueTestHooks = {},
): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-generation-actions-'))
  const database = openAppDatabase(root, migrations)
  let controller: ProjectGenerationActionController | undefined
  let projects: ProjectService | undefined
  try {
    const scratch = path.join(root, 'scratch')
    await mkdir(scratch, { mode: 0o700 })
    const index = new ProjectIndexRepository(database.db)
    projects = new ProjectService({
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
      modelService,
      orchestrator,
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
    for (const tab of projects?.getOpenTabs() ?? []) {
      await projects!.flushAutosave(tab.id)
    }
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

test('unbound embedding tokens refuse Generate in either polarity before worker, composition or queue publication', async () => {
  await withFixture(async (fixture) => {
    const repository = new ModelRepository(fixture.database.db)
    await publishIllustriousEmbeddingFixture(
      repository,
      fixture.root,
      500,
      501,
      'collision.safetensors',
    )
    await publishIllustriousEmbeddingFixture(
      repository,
      fixture.root,
      500,
      502,
      'collision.safetensors',
      0.25,
    )
    const saved = await readFile(fixture.packagePath)
    for (const polarity of ['positive-prompt', 'negative-prompt'] as const) {
      await fixture.projects.updateGenerationDraft(fixture.tabId, {
        kind: 'positive-prompt',
        text: polarity === 'positive-prompt' ? 'portrait <collision>' : 'portrait',
      })
      await fixture.projects.updateGenerationDraft(fixture.tabId, {
        kind: 'negative-prompt',
        text: polarity === 'negative-prompt' ? 'blur <collision>' : 'blur',
      })
      await assert.rejects(
        fixture.controller.generate(fixture.tabId, {
          documentId: fixture.documentId,
          iterations: 1,
        }),
        { code: 'MODEL_EMBEDDING_UNBOUND' },
      )
      assert.equal(fixture.runtime.admissionCount, 0)
      assert.equal(fixture.runtime.leaseCount, 0)
      assert.equal(fixture.runtime.composedTargets.length, 0)
      assert.equal(fixture.runtime.generated.length, 0)
      assert.deepEqual(
        await fixture.queue.listUnfinishedByProjectDocument(fixture.tabId, fixture.documentId),
        [],
      )
      assert.deepEqual(await readFile(fixture.packagePath), saved)
    }
    await fixture.projects.updateGenerationDraft(fixture.tabId, {
      kind: 'negative-prompt',
      text: 'blur',
    })
    const neighbor = await fixture.controller.generate(fixture.tabId, {
      documentId: fixture.documentId,
      iterations: 1,
    })
    assert.equal(neighbor.kind, 'queued')
    assert.equal(fixture.runtime.composedTargets.length, 1)
    await waitForState(
      fixture.controller,
      fixture.tabId,
      (state) => state.phase === 'idle' && state.jobs.length === 0,
    )
    assert.equal(fixture.runtime.generated.length, 1)
  })
})

test('bound embedding refs keep the explicit unsupported refusal before acquiring a worker in either polarity', async () => {
  await withFixture(async (fixture) => {
    const installed = await publishIllustriousEmbeddingFixture(
      new ModelRepository(fixture.database.db),
      fixture.root,
      510,
      511,
    )
    const prompt = await fixture.modelService.resolveGenerationPromptEmbeddings({
      modelFamily: 'illustrious',
      prompt: { embeddingRefs: [], text: '' },
      selection: {
        resourceId: installed.resourceId,
        token: '<clean-style>',
        versionId: installed.versionId,
      },
      text: '<clean-style>',
    })
    const owner = fixture.projects.getOpenDocumentForAcceptance(fixture.tabId)!
    const draft = structuredClone(owner.document.generationDraft)
    for (const polarity of ['positivePrompt', 'negativePrompt'] as const) {
      await owner.applyDocument({
        ...owner.document,
        generationDraft: { ...draft, [polarity]: prompt },
      })
      await assert.rejects(
        fixture.controller.generate(fixture.tabId, {
          documentId: fixture.documentId,
          iterations: 1,
        }),
        { code: 'GENERATION_EMBEDDING_UNSUPPORTED' },
      )
      assert.equal(fixture.runtime.leaseCount, 0)
      assert.equal(fixture.runtime.composedTargets.length, 0)
      assert.equal(fixture.runtime.generated.length, 0)
      assert.deepEqual(
        await fixture.queue.listUnfinishedByProjectDocument(fixture.tabId, fixture.documentId),
        [],
      )
    }
  })
})

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
      assert.ok(
        frozen.payload.kind === 'illustrious-txt2img' ||
          frozen.payload.kind === 'illustrious-img2img',
      )
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

const precisionReady: InferenceWorkerReady = {
  ...rescaleReady,
  capabilities: [
    ...rescaleReady.capabilities,
    'illustrious-img2img',
    'illustrious-lora',
    'illustrious-vae-precision',
  ],
  workerVersion: '0.8.0',
}

const externalVaeReady: InferenceWorkerReady = {
  ...precisionReady,
  capabilities: [...precisionReady.capabilities, 'illustrious-external-vae'],
  workerVersion: '0.9.0',
}

// Production boundary: controller admission -> actual Project capture -> SQLite queue -> processor.
// Neighbor: Embedded succeeds with 0.8; semantic mutants admit external on 0.8 or read later draft.
test('Generate gates external VAE before composition and freezes its exact version across a batch and later Project edits', async () => {
  await withFixture(async (fixture) => {
    const { controller, documentId, modelService, projects, queue, runtime, tabId } = fixture
    const first = await publishIllustriousVaeFixture(
      modelService.repository,
      fixture.root,
      410,
      411,
    )
    const second = await publishIllustriousVaeFixture(
      modelService.repository,
      fixture.root,
      410,
      412,
      'diffusers',
    )
    const selected = await modelService.resolveGenerationVae(first.resourceId, first.versionId)
    const replacement = await modelService.resolveGenerationVae(second.resourceId, second.versionId)
    await projects.updateGenerationDraft(tabId, { kind: 'positive-prompt', text: 'a lantern' })
    await projects.updateGenerationDraft(tabId, { kind: 'negative-prompt', text: 'blur' })
    await projects.setGenerationVae(tabId, async () => selected)
    runtime.ready = structuredClone(precisionReady)
    assert.equal((await controller.getState(tabId)).externalVaeSupported, false)
    await assert.rejects(controller.generate(tabId, { documentId, iterations: 2 }), {
      code: 'INFERENCE_UNAVAILABLE',
    })
    assert.equal(runtime.composedTargets.length, 0)
    assert.equal(runtime.generated.length, 0)
    assert.equal((await controller.getQueue()).items.length, 0)
    const saved = await readFile(fixture.packagePath)
    runtime.ready = structuredClone(externalVaeReady)
    assert.equal((await controller.getState(tabId)).externalVaeSupported, true)
    const entered = signal()
    const release = signal()
    runtime.beforeCompose = async () => {
      entered.resolve()
      await release.promise
    }
    try {
      const pending = controller.generate(tabId, { documentId, iterations: 2 })
      await entered.promise
      await projects.setGenerationVae(tabId, async () => replacement)
      await modelService.repository.setDefaultVersion(second.resourceId, second.versionId)
      release.resolve()
      const result = await pending
      assert.equal(result.kind, 'queued')
      if (result.kind !== 'queued') {
        throw new Error('Expected durable external VAE batch.')
      }
      await waitForState(controller, tabId, (state) => state.phase === 'idle')
      for (const id of result.jobIds) {
        const input = await queue.loadVerifiedInput(id)
        assert.ok(
          input.payload.kind === 'illustrious-txt2img' ||
            input.payload.kind === 'illustrious-img2img',
        )
        assert.equal(input.item.status, 'completed')
        assert.deepEqual(input.payload.context.vae?.reference, selected)
        assert.deepEqual(input.payload.workerJob.vae, {
          byteSize: first.bytes.length,
          path: first.managedPath,
          sha256: selected.fileSha256,
        })
      }
      assert.deepEqual(
        runtime.generated.map((entry) => entry.job.vae),
        [
          { byteSize: first.bytes.length, path: first.managedPath, sha256: selected.fileSha256 },
          { byteSize: first.bytes.length, path: first.managedPath, sha256: selected.fileSha256 },
        ],
      )
      assert.deepEqual(
        projects.getOpenDocumentForAcceptance(tabId)!.document.generationDraft.vae,
        replacement,
      )
      assert.deepEqual(await readFile(fixture.packagePath), saved)
    } finally {
      release.resolve()
    }
  })
})

test('Generate rechecks exact external VAE bytes again at durable batch publication after scratch materialization', async () => {
  await withFixture(async (fixture) => {
    const { controller, documentId, modelService, projects, runtime, tabId } = fixture
    const file = await publishIllustriousVaeFixture(modelService.repository, fixture.root, 430, 431)
    const selected = await modelService.resolveGenerationVae(file.resourceId, file.versionId)
    await projects.updateGenerationDraft(tabId, { kind: 'positive-prompt', text: 'a lantern' })
    await projects.updateGenerationDraft(tabId, { kind: 'negative-prompt', text: 'blur' })
    await projects.setGenerationVae(tabId, async () => selected)
    runtime.ready = structuredClone(externalVaeReady)
    const verify = modelService.resolveVerifiedGenerationVaeForPlan.bind(modelService)
    let verifiedCalls = 0
    modelService.resolveVerifiedGenerationVaeForPlan = async (reference) => {
      const result = await verify(reference)
      verifiedCalls += 1
      if (verifiedCalls === 2) {
        // Preparation and scratch request have passed; only the independent publication check
        // can catch this same-size rewrite before any durable queue row is committed.
        await writeFile(file.managedPath, Buffer.alloc(file.bytes.length, 1))
      }
      return result
    }
    const saved = await readFile(fixture.packagePath)
    await assert.rejects(controller.generate(tabId, { documentId, iterations: 1 }), {
      code: 'MODEL_FILE_CORRUPT',
    })
    assert.equal(verifiedCalls, 2)
    assert.equal((await controller.getQueue()).items.length, 0)
    assert.equal(runtime.generated.length, 0)
    assert.deepEqual(await fixture.staging.listVerifiedCandidates(tabId), [])
    assert.deepEqual(await readFile(fixture.packagePath), saved)
  })
})

test('Retry rechecks external VAE capability and exact bytes without using a later Project VAE or library Default', async () => {
  await withFixture(async (fixture) => {
    const { controller, documentId, modelService, projects, runtime, tabId } = fixture
    const first = await publishIllustriousVaeFixture(
      modelService.repository,
      fixture.root,
      420,
      421,
    )
    const second = await publishIllustriousVaeFixture(
      modelService.repository,
      fixture.root,
      420,
      422,
      'diffusers',
    )
    const selected = await modelService.resolveGenerationVae(first.resourceId, first.versionId)
    const replacement = await modelService.resolveGenerationVae(second.resourceId, second.versionId)
    await projects.updateGenerationDraft(tabId, { kind: 'positive-prompt', text: 'a lantern' })
    await projects.updateGenerationDraft(tabId, { kind: 'negative-prompt', text: 'blur' })
    await projects.setGenerationVae(tabId, async () => selected)
    runtime.ready = structuredClone(externalVaeReady)
    runtime.beforeGenerate = async () => {
      throw new Error('Controlled external VAE failure.')
    }
    await controller.generate(tabId, { documentId, iterations: 1 })
    await waitForState(controller, tabId, (state) => state.phase === 'idle')
    const source = (await controller.getQueue()).items[0]
    assert.equal(source.status, 'failed')
    await projects.setGenerationVae(tabId, async () => replacement)
    await modelService.repository.setDefaultVersion(second.resourceId, second.versionId)
    runtime.beforeGenerate = null
    runtime.ready = structuredClone(precisionReady)
    await assert.rejects(controller.retryJob(source), { code: 'INFERENCE_UNAVAILABLE' })
    assert.equal((await controller.getQueue()).items.length, 1)
    assert.equal(runtime.generated.length, 1)
    runtime.ready = structuredClone(externalVaeReady)
    await writeFile(first.managedPath, Buffer.alloc(first.bytes.length, 1))
    await assert.rejects(controller.retryJob(source), { code: 'MODEL_FILE_CORRUPT' })
    assert.equal((await controller.getQueue()).items.length, 1)
    assert.equal(runtime.generated.length, 1)
    await writeFile(first.managedPath, first.bytes)
    await controller.retryJob(source)
    await waitForState(controller, tabId, (state) => state.phase === 'idle')
    assert.equal(runtime.generated.length, 2)
    assert.deepEqual(runtime.generated[1].job.vae, {
      byteSize: first.bytes.length,
      path: first.managedPath,
      sha256: selected.fileSha256,
    })
    assert.deepEqual(
      projects.getOpenDocumentForAcceptance(tabId)!.document.generationDraft.vae,
      replacement,
    )
    // Embedded uses the older runtime after the exact external resource has been reset explicitly.
    await projects.setGenerationVae(tabId, null)
    runtime.ready = structuredClone(precisionReady)
    const impact = await controller.generate(tabId, { documentId, iterations: 1 })
    assert.equal(impact.kind, 'confirmation-required')
    if (impact.kind !== 'confirmation-required') {
      throw new Error('Expected visible candidates confirmation.')
    }
    await controller.generate(tabId, {
      confirmation: {
        candidateIds: impact.candidateIds,
        unfinishedJobIds: impact.unfinishedJobIds,
      },
      documentId,
      iterations: 1,
    })
    await waitForState(controller, tabId, (state) => state.phase === 'idle')
    assert.equal(runtime.generated.at(-1)?.job.vae, null)
  })
})

test('Generate gates manual VAE Precision before composition and freezes one captured policy across a concrete batch', async () => {
  await withFixture(async (fixture) => {
    const { controller, documentId, projects, queue, runtime, tabId } = fixture
    await projects.updateGenerationDraft(tabId, { kind: 'positive-prompt', text: 'a lantern' })
    await projects.updateGenerationDraft(tabId, { kind: 'negative-prompt', text: 'blur' })
    await projects.updateGenerationDraft(tabId, { kind: 'vae-precision', value: 'FP32' })
    assert.equal((await controller.getState(tabId)).vaePrecisionSupported, false)
    const saved = await readFile(fixture.packagePath)
    await assert.rejects(controller.generate(tabId, { documentId, iterations: 2 }), {
      code: 'INFERENCE_UNAVAILABLE',
    })
    assert.equal(runtime.composedTargets.length, 0)
    assert.equal((await controller.getQueue()).items.length, 0)
    runtime.ready = structuredClone(precisionReady)
    assert.equal((await controller.getState(tabId)).vaePrecisionSupported, true)
    const entered = signal()
    const release = signal()
    runtime.beforeCompose = async () => {
      entered.resolve()
      await release.promise
    }
    try {
      const pending = controller.generate(tabId, { documentId, iterations: 2 })
      await entered.promise
      await projects.updateGenerationDraft(tabId, { kind: 'vae-precision', value: 'FP16' })
      release.resolve()
      const result = await pending
      assert.equal(result.kind, 'queued')
      if (result.kind !== 'queued') {
        throw new Error('expected durable precision batch')
      }
      assert.equal(result.jobIds.length, 2)
      await waitForState(controller, tabId, (state) => state.phase === 'idle')
      for (const id of result.jobIds) {
        const item = await queue.loadVerifiedInput(id)
        assert.ok(
          item.payload.kind === 'illustrious-txt2img' ||
            item.payload.kind === 'illustrious-img2img',
        )
        assert.equal(item.item.status, 'completed')
        assert.equal(item.payload.context.vaePrecision, 'FP32')
        assert.equal(item.payload.workerJob.vaePrecision, 'FP32')
      }
      assert.deepEqual(
        runtime.generated.map((item) => item.job.vaePrecision),
        ['FP32', 'FP32'],
      )
      assert.equal(
        projects.getOpenDocumentForAcceptance(tabId)!.document.generationDraft.vaePrecision,
        'FP16',
      )
      assert.deepEqual(await readFile(fixture.packagePath), saved)
    } finally {
      release.resolve()
    }
  })
})

test('Retry rechecks manual VAE capability and retains frozen policy after later draft edits', async () => {
  await withFixture(async (fixture) => {
    const { controller, documentId, projects, runtime, tabId } = fixture
    await projects.updateGenerationDraft(tabId, { kind: 'positive-prompt', text: 'a lantern' })
    await projects.updateGenerationDraft(tabId, { kind: 'negative-prompt', text: 'blur' })
    runtime.ready = structuredClone(precisionReady)
    await projects.updateGenerationDraft(tabId, { kind: 'vae-precision', value: 'FP32' })
    runtime.beforeGenerate = async () => {
      throw new Error('controlled precision failure')
    }
    await controller.generate(tabId, { documentId, iterations: 1 })
    await waitForState(controller, tabId, (state) => state.phase === 'idle')
    const source = (await controller.getQueue()).items[0]
    assert.equal(source.status, 'failed')
    await projects.updateGenerationDraft(tabId, { kind: 'vae-precision', value: 'FP16' })
    runtime.beforeGenerate = null
    runtime.ready = {
      ...precisionReady,
      capabilities: precisionReady.capabilities.filter(
        (item) => item !== 'illustrious-vae-precision',
      ),
      workerVersion: '0.7.0',
    }
    await assert.rejects(controller.retryJob(source), { code: 'INFERENCE_UNAVAILABLE' })
    assert.equal((await controller.getQueue()).items.length, 1)
    assert.equal(runtime.generated.length, 1)
    runtime.ready = structuredClone(precisionReady)
    await controller.retryJob(source)
    await waitForState(controller, tabId, (state) => state.phase === 'idle')
    assert.equal(runtime.generated.length, 2)
    assert.equal(runtime.generated[1].job.vaePrecision, 'FP32')
    assert.equal(
      projects.getOpenDocumentForAcceptance(tabId)!.document.generationDraft.vaePrecision,
      'FP16',
    )
  })
})

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
      assert.ok(
        frozen.payload.kind === 'illustrious-txt2img' ||
          frozen.payload.kind === 'illustrious-img2img',
      )
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
        assert.ok(
          source.payload.kind === 'illustrious-txt2img' ||
            source.payload.kind === 'illustrious-img2img',
        )
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
    assert.ok(
      frozen.every(
        (item) =>
          item.payload.kind === 'illustrious-txt2img' ||
          item.payload.kind === 'illustrious-img2img',
      ),
    )
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
    assert.ok(
      frozen.every(
        (item) =>
          item.payload.kind === 'illustrious-txt2img' ||
          item.payload.kind === 'illustrious-img2img',
      ),
    )
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
    const readUnfinished = fixture.queue.listUnfinishedNormalByProjectDocument.bind(fixture.queue)
    fixture.queue.listUnfinishedNormalByProjectDocument = async (...args) => {
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
    assert.ok(
      frozen.payload.kind === 'illustrious-txt2img' ||
        frozen.payload.kind === 'illustrious-img2img',
    )
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
    toProjectGenerationActionApiError(
      new ModelServiceError('MODEL_FILE_CORRUPT', 'private /home/person/checkpoint.safetensors'),
    ),
    {
      code: 'MODEL_FILE_CORRUPT',
      message:
        'The selected model resource could not be verified for generation. Review it in Model Manager.',
    },
  )
  assert.deepEqual(
    toProjectGenerationActionApiError(
      new ModelServiceError('MODEL_FILE_MISSING', 'private /home/person/embedding.safetensors'),
    ),
    {
      code: 'MODEL_FILE_MISSING',
      message:
        'The selected model resource could not be verified for generation. Review it in Model Manager.',
    },
  )
  assert.deepEqual(
    toProjectGenerationActionApiError(
      new ModelServiceError(
        'MODEL_CHECKPOINT_INCOMPATIBLE',
        'private /home/person/checkpoint.safetensors',
      ),
    ),
    {
      code: 'MODEL_CHECKPOINT_INCOMPATIBLE',
      message: 'The selected checkpoint could not be verified for generation.',
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
      assert.ok(
        source.payload.kind === 'illustrious-txt2img' ||
          source.payload.kind === 'illustrious-img2img',
      )
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
      assert.ok(
        copied.payload.kind === 'illustrious-txt2img' ||
          copied.payload.kind === 'illustrious-img2img',
      )
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

test('empty public dispatch and the final drain iteration never acquire a CUDA lease', async () => {
  // Boundary: real Project/controller/orchestrator/SQLite dispatch. Only ML transport is controlled.
  // Neighbor: four actual pending concrete jobs acquire four dispatch leases and publish pixels.
  await withFixture(async (fixture) => {
    assert.deepEqual(await fixture.dispatch.runNext(), { kind: 'idle' })
    assert.equal(fixture.runtime.leaseCount, 0)
    await fixture.controller.generate(fixture.tabId, {
      documentId: fixture.documentId,
      iterations: 1,
    })
    await waitForState(
      fixture.controller,
      fixture.tabId,
      (state) => state.phase === 'idle' && state.jobs.length === 0,
    )
    assert.equal(fixture.runtime.generated.length, 4)
    assert.equal(
      fixture.runtime.leaseCount,
      5,
      'one preparation lease plus four concrete jobs, no idle GPU lease',
    )
    assert.equal(fixture.runtime.closedCount, 5)
    assert.equal((await fixture.controller.getQueue()).counts.completed, 4)
    assert.equal((await fixture.staging.listVerifiedCandidates(fixture.tabId)).length, 4)
    const leases = fixture.runtime.leaseCount
    fixture.runtime.available = false
    assert.deepEqual(await fixture.dispatch.runNext(), { kind: 'idle' })
    assert.equal(
      fixture.runtime.leaseCount,
      leases,
      'idle work does not inspect an unavailable ML runtime either',
    )
  })
})

test('dispatch metadata preflight waits an admitted Project preparation before observing the real queue', async () => {
  await withFixture(async (fixture) => {
    await fixture.projects.updateGenerationDraft(fixture.tabId, {
      kind: 'positive-prompt',
      text: 'portrait',
    })
    await fixture.projects.updateGenerationDraft(fixture.tabId, {
      kind: 'negative-prompt',
      text: 'blur',
    })
    const entered = signal()
    const release = signal()
    fixture.runtime.beforeCompose = async () => {
      entered.resolve()
      await release.promise
    }
    const publishing = fixture.runtime.withGenerationWorker(
      path.join(fixture.root, 'scratch'),
      async (worker) => await fixture.orchestrator.enqueueOne(fixture.tabId, worker, worker),
    )
    let preflightSettled = false
    try {
      await entered.promise
      const preflight = fixture.orchestrator.hasDispatchablePending().then((pending) => {
        preflightSettled = true
        return pending
      })
      // An independent actual SQLite metadata read proves queue progress while preparation is held.
      assert.equal(await fixture.queue.hasDispatchablePending(), false)
      assert.equal(
        preflightSettled,
        false,
        'orchestrator must not mistake admitted-but-unpublished work for idle',
      )
      release.resolve()
      const queued = await publishing
      assert.ok(queued)
      assert.equal(await preflight, true)
      assert.equal((await fixture.queue.loadVerifiedInput(queued.id)).item.status, 'pending')
      assert.equal((await fixture.dispatch.runNext()).kind, 'completed')
      assert.equal(fixture.runtime.generated.length, 1)
      assert.equal(fixture.runtime.leaseCount, 2)
      assert.deepEqual(await fixture.dispatch.runNext(), { kind: 'idle' })
      assert.equal(fixture.runtime.leaseCount, 2)
    } finally {
      release.resolve()
      await publishing
    }
  })
})

test('shutdown while the real pending preflight awaits cannot acquire a CUDA lease or claim its jobs', async () => {
  await withFixture(async (fixture) => {
    const entered = signal()
    const release = signal()
    const preflight = fixture.orchestrator.hasDispatchablePending.bind(fixture.orchestrator)
    fixture.orchestrator.hasDispatchablePending = async () => {
      const pending = await preflight()
      assert.equal(pending, true)
      entered.resolve()
      await release.promise
      return pending
    }
    try {
      await fixture.controller.generate(fixture.tabId, {
        documentId: fixture.documentId,
        iterations: 1,
      })
      await entered.promise
      await assert.rejects(fixture.dispatch.runNext(), { code: 'BUSY' })
      const closing = fixture.controller.shutdown()
      release.resolve()
      await closing
      const page = await fixture.queue.listManagerPage()
      assert.equal(
        page.counts.pending,
        4,
        'shutdown must not claim rows behind the awaited preflight',
      )
      assert.equal(page.counts.running, 0)
      assert.equal(fixture.runtime.generated.length, 0)
      assert.equal(fixture.runtime.leaseCount, 1, 'only the completed preparation owned CUDA')
      await assert.rejects(fixture.dispatch.runNext(), { code: 'CLOSED' })
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
      const finished = await waitForState(
        fixture.controller,
        fixture.tabId,
        (state) => state.phase === 'idle',
      )
      assert.equal(
        finished.jobs.length,
        0,
        'the finishing idle drain must not strand a successful Retry publication',
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
        assert.ok(
          source.payload.kind === 'illustrious-txt2img' ||
            source.payload.kind === 'illustrious-img2img',
        )
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
    assert.ok(
      source.payload.kind === 'illustrious-txt2img' ||
        source.payload.kind === 'illustrious-img2img',
    )
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

const nativeLoraReady: InferenceWorkerReady = {
  ...rescaleReady,
  capabilities: [...rescaleReady.capabilities, 'illustrious-img2img', 'illustrious-lora'],
  workerVersion: '0.7.0',
}
async function addControllerLora(fixture: Fixture) {
  const installed = await publishIllustriousLoraFixture(
    fixture.modelService.repository,
    fixture.root,
    9800,
    9801,
  )
  const reference = await fixture.modelService.resolveGenerationLora(
    installed.resourceId,
    installed.versionId,
  )
  await fixture.projects.addGenerationLora(fixture.tabId, reference)
  await fixture.projects.updateGenerationDraft(fixture.tabId, {
    kind: 'lora-weight',
    resourceId: reference.localModelId,
    value: -0.5,
    versionId: reference.localVersionId,
  })
  await fixture.projects.updateGenerationDraft(fixture.tabId, {
    kind: 'positive-prompt',
    text: 'a lantern',
  })
  await fixture.projects.updateGenerationDraft(fixture.tabId, {
    kind: 'negative-prompt',
    text: 'blur',
  })
  return reference
}

test('Generate refuses active LoRA before composition on an older peer and freezes captured weight before draft edits', async () => {
  await withFixture(async (fixture) => {
    const { controller, documentId, projects, runtime, tabId } = fixture
    const reference = await addControllerLora(fixture)
    const saved = await readFile(fixture.packagePath)
    await assert.rejects(controller.generate(tabId, { documentId, iterations: 1 }), {
      code: 'INFERENCE_UNAVAILABLE',
    })
    assert.equal(runtime.composedTargets.length, 0)
    assert.equal((await controller.getQueue()).items.length, 0)
    runtime.ready = structuredClone(nativeLoraReady)
    runtime.beforeCompose = async () => {
      await projects.updateGenerationDraft(tabId, {
        kind: 'lora-weight',
        resourceId: reference.localModelId,
        value: 0.9,
        versionId: reference.localVersionId,
      })
      await projects.updateGenerationDraft(tabId, {
        kind: 'lora-enabled',
        resourceId: reference.localModelId,
        value: false,
        versionId: reference.localVersionId,
      })
    }
    const queued = await controller.generate(tabId, { documentId, iterations: 1 })
    assert.equal(queued.kind, 'queued')
    if (queued.kind !== 'queued') {
      assert.fail('qualified adapter must publish a job')
    }
    await waitForState(controller, tabId, (state) => state.phase === 'idle')
    const frozen = await fixture.queue.loadVerifiedInput(queued.jobIds[0])
    assert.ok(
      frozen.payload.kind === 'illustrious-txt2img' ||
        frozen.payload.kind === 'illustrious-img2img',
    )
    assert.equal(frozen.item.status, 'completed')
    assert.deepEqual(frozen.payload.context.loraStack, [
      { enabled: true, resource: reference, weight: -0.5 },
    ])
    assert.equal(runtime.generated[0]?.job.loras?.[0]?.weight, -0.5)
    assert.equal(
      projects.getOpenDocumentForAcceptance(tabId)?.document.generationDraft.loras[0]?.enabled,
      false,
    )
    assert.equal(
      projects.getOpenDocumentForAcceptance(tabId)?.document.generationDraft.loras[0]?.weight,
      0.9,
    )
    assert.deepEqual(await readFile(fixture.packagePath), saved)
  })
})

test('actual Retry controller requires native adapter capability and reverified original file while ignoring later disabled draft', async () => {
  await withFixture(async (fixture) => {
    const { controller, documentId, projects, runtime, tabId } = fixture
    const reference = await addControllerLora(fixture)
    runtime.ready = structuredClone(nativeLoraReady)
    runtime.beforeGenerate = async () => {
      throw new Error('controlled adapter job failure')
    }
    const queued = await controller.generate(tabId, { documentId, iterations: 1 })
    assert.equal(queued.kind, 'queued')
    await waitForState(controller, tabId, (state) => state.phase === 'idle')
    const source = (await controller.getQueue()).items[0]
    assert.equal(source.status, 'failed')
    const frozen = await fixture.queue.loadVerifiedInput(source.id)
    assert.ok(
      frozen.payload.kind === 'illustrious-txt2img' ||
        frozen.payload.kind === 'illustrious-img2img',
    )
    const loraPath = frozen.payload.context.loras![0].managedPath
    const bytes = await readFile(loraPath)
    await projects.updateGenerationDraft(tabId, {
      kind: 'lora-weight',
      resourceId: reference.localModelId,
      value: 0.9,
      versionId: reference.localVersionId,
    })
    await projects.updateGenerationDraft(tabId, {
      kind: 'lora-enabled',
      resourceId: reference.localModelId,
      value: false,
      versionId: reference.localVersionId,
    })
    runtime.beforeGenerate = null
    runtime.ready = structuredClone(rescaleReady)
    await assert.rejects(controller.retryJob(source), { code: 'INFERENCE_UNAVAILABLE' })
    assert.equal((await controller.getQueue()).items.length, 1)
    runtime.ready = structuredClone(nativeLoraReady)
    await writeFile(loraPath, Buffer.alloc(bytes.length, 0))
    await assert.rejects(controller.retryJob(source), { code: 'MODEL_FILE_CORRUPT' })
    assert.equal((await controller.getQueue()).items.length, 1)
    assert.equal(runtime.generated.length, 1)
    await writeFile(loraPath, bytes)
    await controller.retryJob(source)
    await waitForState(controller, tabId, (state) => state.phase === 'idle')
    assert.equal(runtime.generated.length, 2)
    assert.equal(runtime.generated[1]?.job.loras?.[0]?.weight, -0.5)
    assert.equal(runtime.generated[1]?.job.loras?.[0]?.sha256, reference.fileSha256)
    assert.equal(
      (await controller.getQueue()).items.filter((item) => item.status === 'completed').length,
      1,
    )
  })
})

const embeddingReady: InferenceWorkerReady = {
  ...externalVaeReady,
  capabilities: [...externalVaeReady.capabilities, 'illustrious-embeddings'],
  workerVersion: '0.10.0',
}

type ComponentPrivateTree = {
  children?: { name: string; tree: ComponentPrivateTree | null }[]
  mode: number
  sha256?: string
  sizeBytes?: number
}

async function embeddingPrompt(
  fixture: Fixture,
  modelId: number,
  versionId: number,
  filename: string,
  value = 0.125,
) {
  const file = await publishIllustriousEmbeddingFixture(
    fixture.modelService.repository,
    fixture.root,
    modelId,
    versionId,
    filename,
    value,
  )
  const token = `<${filename.replace(/\.safetensors$/, '')}>`
  const prompt = await fixture.modelService.resolveGenerationPromptEmbeddings({
    modelFamily: 'illustrious',
    prompt: { embeddingRefs: [], text: '' },
    selection: { resourceId: file.resourceId, token, versionId: file.versionId },
    text: token,
  })
  return { file, prompt }
}

/** Snapshot actual tiny owner files, including extra entries and permission changes. */
async function componentPrivateTree(directory: string): Promise<ComponentPrivateTree | null> {
  let stat
  try {
    stat = await lstat(directory)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }
    throw error
  }
  assert.equal(stat.isSymbolicLink(), false)
  const mode = stat.mode & 0o777
  if (stat.isDirectory()) {
    const names = (await readdir(directory)).sort()
    return {
      children: await Promise.all(
        names.map(async (name) => ({
          name,
          tree: await componentPrivateTree(path.join(directory, name)),
        })),
      ),
      mode,
    }
  }
  assert.equal(stat.isFile(), true)
  const bytes = await readFile(directory)
  return { mode, sha256: sha256(bytes), sizeBytes: bytes.length }
}

async function componentRefusalSnapshot(fixture: Fixture) {
  return {
    autosave: await componentPrivateTree(path.join(fixture.root, 'autosave')),
    candidates: (await fixture.staging.listVerifiedCandidates(fixture.tabId)).sort((a, b) =>
      a.candidateId.localeCompare(b.candidateId),
    ),
    cursor: await fixture.staging.readLastActualSeed(fixture.tabId, fixture.documentId),
    document: structuredClone(
      fixture.projects.getOpenDocumentForAcceptance(fixture.tabId)!.document,
    ),
    privateInputs: await componentPrivateTree(path.join(fixture.root, 'generation-inputs')),
    queue: await fixture.database.db
      .selectFrom('generation_queue_item')
      .selectAll()
      .orderBy('id')
      .execute(),
    receipts: await fixture.database.db
      .selectFrom('generation_candidate_receipt')
      .selectAll()
      .orderBy('candidate_id')
      .execute(),
    savedBytes: await readFile(fixture.packagePath),
    scratch: await componentPrivateTree(path.join(fixture.root, 'scratch')),
    seeds: await fixture.database.db
      .selectFrom('generation_seed_cursor')
      .selectAll()
      .orderBy('local_project_key')
      .orderBy('document_id')
      .execute(),
    staging: await componentPrivateTree(path.join(fixture.root, 'recovery', 'generation-staging')),
    tabs: structuredClone(fixture.projects.getOpenTabs()),
    tombstones: await fixture.database.db
      .selectFrom('generation_staging_discarded_session')
      .selectAll()
      .orderBy('local_project_key')
      .orderBy('staging_session_id')
      .execute(),
  }
}

// Public boundary: real controller, preparation, queue, staging, SQLite and Project owners.
// Only ML output and the component resolver's explicit refusal are controlled. The healthy
// resources pass the real Main qualifiers; these small fixtures do not claim trained inference.
for (const component of [
  {
    code: 'MODEL_LORA_INCOMPATIBLE',
    kind: 'LoRA',
    message:
      'The selected LoRA is incompatible with this image engine. Review this component in Model Manager.',
    resolver: 'resolveVerifiedGenerationLoraForPlan',
  },
  {
    code: 'MODEL_EMBEDDING_INCOMPATIBLE',
    kind: 'embedding',
    message:
      'The selected embedding is incompatible with this image engine. Review this component in Model Manager.',
    resolver: 'resolveVerifiedGenerationEmbeddingForPlan',
  },
  {
    code: 'MODEL_VAE_INCOMPATIBLE',
    kind: 'external VAE',
    message:
      'The selected external VAE is incompatible with this image engine. Review this component in Model Manager.',
    resolver: 'resolveVerifiedGenerationVaeForPlan',
  },
] as const) {
  test(`component incompatibility ${component.code} gives safe public Generate and frozen Retry diagnostics while preserving durable owners`, async () => {
    await withFixture(async (fixture) => {
      const { controller, documentId, modelService, projects, queue, runtime, staging, tabId } =
        fixture
      await projects.updateGenerationDraft(tabId, { kind: 'positive-prompt', text: 'a lantern' })
      await projects.updateGenerationDraft(tabId, { kind: 'negative-prompt', text: 'blur' })
      switch (component.kind) {
        case 'embedding': {
          const { prompt } = await embeddingPrompt(fixture, 9900, 9901, 'component.safetensors')
          const owner = projects.getOpenDocumentForAcceptance(tabId)!
          await owner.applyDocument({
            ...owner.document,
            generationDraft: { ...owner.document.generationDraft, positivePrompt: prompt },
          })
          break
        }
        case 'external VAE': {
          const installed = await publishIllustriousVaeFixture(
            modelService.repository,
            fixture.root,
            9910,
            9911,
          )
          const reference = await modelService.resolveGenerationVae(
            installed.resourceId,
            installed.versionId,
          )
          await projects.setGenerationVae(tabId, async () => reference)
          break
        }
        case 'LoRA': {
          await addControllerLora(fixture)
          break
        }
      }
      runtime.ready = structuredClone(noiseReady)
      await projects.save(tabId)
      let refusing = false
      let refusedCalls = 0
      const privateMessage = `private /home/person/${component.kind}/weights.safetensors`
      const refuseComponent = () => {
        if (refusing) {
          refusedCalls += 1
          throw new ModelServiceError(component.code, privateMessage)
        }
      }
      switch (component.resolver) {
        case 'resolveVerifiedGenerationEmbeddingForPlan': {
          const verify = modelService.resolveVerifiedGenerationEmbeddingForPlan.bind(modelService)
          modelService.resolveVerifiedGenerationEmbeddingForPlan = async (reference) => {
            refuseComponent()
            return await verify(reference)
          }
          break
        }
        case 'resolveVerifiedGenerationLoraForPlan': {
          const verify = modelService.resolveVerifiedGenerationLoraForPlan.bind(modelService)
          modelService.resolveVerifiedGenerationLoraForPlan = async (reference) => {
            refuseComponent()
            return await verify(reference)
          }
          break
        }
        case 'resolveVerifiedGenerationVaeForPlan': {
          const verify = modelService.resolveVerifiedGenerationVaeForPlan.bind(modelService)
          modelService.resolveVerifiedGenerationVaeForPlan = async (reference) => {
            refuseComponent()
            return await verify(reference)
          }
          break
        }
      }
      runtime.beforeGenerate = async () => {
        if (runtime.generated.length === 2) {
          throw new Error('Controlled second-job failure retains the first completed result.')
        }
      }
      const initial = await controller.generate(tabId, { documentId, iterations: 2 })
      assert.equal(initial.kind, 'queued')
      if (initial.kind !== 'queued') {
        assert.fail('Expected the healthy component to publish both durable jobs.')
      }
      assert.equal(initial.jobIds.length, 2)
      await waitForState(controller, tabId, (state) => state.phase === 'idle' && !state.jobs.length)
      const page = await controller.getQueue()
      assert.equal(page.counts.completed, 1)
      assert.equal(page.counts.failed, 1)
      const source = page.items.find((item) => item.status === 'failed')!
      const frozen = await queue.loadVerifiedInput(source.id)
      assert.equal(frozen.payload.kind, 'illustrious-txt2img')
      const sourceTarget = await readFile(frozen.targetPath)
      const candidates = await staging.listVerifiedCandidates(tabId)
      assert.equal(candidates.length, 1)
      assert.equal(candidates[0].actualSeed, 42)
      assert.equal(await staging.readLastActualSeed(tabId, documentId), 42)
      await projects.flushAutosave(tabId)
      const beforeGenerate = await componentRefusalSnapshot(fixture)
      assert.equal(beforeGenerate.queue.length, 2)
      assert.equal(beforeGenerate.receipts.length, 1)
      assert.equal(beforeGenerate.seeds.length, 1)
      assert.ok(beforeGenerate.privateInputs)
      assert.ok(beforeGenerate.staging)
      const impact = await controller.generate(tabId, { documentId, iterations: 1 })
      assert.equal(impact.kind, 'confirmation-required')
      if (impact.kind !== 'confirmation-required') {
        assert.fail('Expected existing candidates to require concrete replacement review.')
      }
      refusing = true
      await assert.rejects(
        controller.generate(tabId, {
          confirmation: {
            candidateIds: impact.candidateIds,
            unfinishedJobIds: impact.unfinishedJobIds,
          },
          documentId,
          iterations: 1,
        }),
        { code: component.code, message: privateMessage },
      )
      const generateError = (await controller.getState(tabId)).error
      assert.ok(generateError)
      assert.equal(refusedCalls, 1)
      assert.equal(runtime.generated.length, 2)
      assert.deepEqual(await componentRefusalSnapshot(fixture), beforeGenerate)

      // Draft removal is not a remedy for an already frozen Retry. The original selected
      // component must still be verified, then restored without composing a new target.
      const owner = projects.getOpenDocumentForAcceptance(tabId)!
      await owner.applyDocument({
        ...owner.document,
        generationDraft: {
          ...owner.document.generationDraft,
          loras: [],
          negativePrompt: { embeddingRefs: [], text: 'later negative prompt' },
          positivePrompt: { embeddingRefs: [], text: 'later unrelated prompt' },
          vae: null,
        },
      })
      await projects.updateGenerationDraft(tabId, { kind: 'seed', policy: 'fixed', value: 99 })
      await projects.setPrimaryBbox(tabId, { height: 64, width: 64, x: 123, y: -456 })
      await projects.flushAutosave(tabId)
      const beforeRetry = await componentRefusalSnapshot(fixture)
      const compositions = runtime.composedTargets.length
      await assert.rejects(controller.retryJob(source), {
        code: component.code,
        message: privateMessage,
      })
      const retryError = (await controller.getState(tabId)).error
      assert.ok(retryError)
      assert.equal(refusedCalls, 2)
      assert.equal(runtime.generated.length, 2)
      assert.equal(runtime.composedTargets.length, compositions)
      assert.deepEqual(await componentRefusalSnapshot(fixture), beforeRetry)

      refusing = false
      runtime.beforeGenerate = null
      await controller.retryJob(source)
      await waitForState(controller, tabId, (state) => state.phase === 'idle' && !state.jobs.length)
      assert.equal(runtime.generated.length, 3)
      assert.equal(runtime.composedTargets.length, compositions)
      const afterRetry = await controller.getQueue()
      assert.equal(afterRetry.items.length, 3)
      assert.equal(afterRetry.counts.completed, 2)
      assert.equal(afterRetry.counts.failed, 1)
      const retried = afterRetry.items.find((item) => !initial.jobIds.includes(item.id))!
      assert.equal(retried.status, 'completed')
      const restored = await queue.loadVerifiedInput(retried.id)
      assert.deepEqual(restored.payload.context, frozen.payload.context)
      assert.deepEqual(await readFile(restored.targetPath), sourceTarget)
      assert.deepEqual((await queue.loadVerifiedInput(source.id)).payload, frozen.payload)
      assert.deepEqual(await readFile(frozen.targetPath), sourceTarget)
      const normalizeWorkerPaths = (job: IllustriousGenerationRequestV1['job']) => ({
        ...job,
        output: { pngPath: '<worker output>', stagingRoot: '<worker staging>' },
        target: { ...job.target, path: '<worker target>' },
      })
      assert.deepEqual(
        normalizeWorkerPaths(runtime.generated[2].job),
        normalizeWorkerPaths(runtime.generated[1].job),
      )
      assert.equal(runtime.generated[2].job.sampling.seed, 43)
      const after = await componentRefusalSnapshot(fixture)
      assert.deepEqual(after.autosave, beforeRetry.autosave)
      assert.deepEqual(after.document, beforeRetry.document)
      assert.deepEqual(after.tabs, beforeRetry.tabs)
      assert.deepEqual(after.savedBytes, beforeRetry.savedBytes)
      assert.deepEqual(after.tombstones, beforeRetry.tombstones)
      assert.deepEqual(
        after.receipts.find((receipt) => receipt.candidate_id === candidates[0].candidateId),
        beforeRetry.receipts[0],
      )
      assert.deepEqual(
        after.candidates.find((candidate) => candidate.candidateId === candidates[0].candidateId),
        candidates[0],
      )
      assert.equal(after.candidates.length, 2)
      assert.equal(after.cursor, 43)
      assert.deepEqual(generateError, { code: component.code, message: component.message })
      assert.deepEqual(retryError, { code: component.code, message: component.message })
      assert.equal(generateError.message.includes('/home/person/'), false)
      assert.equal(retryError.message.includes('/home/person/'), false)
    })
  })
}

async function selectControllerComponentFile(
  fixture: Fixture,
  component: 'embedding' | 'external VAE' | 'LoRA',
) {
  const { modelService, projects, tabId } = fixture
  await projects.updateGenerationDraft(tabId, { kind: 'positive-prompt', text: 'a lantern' })
  await projects.updateGenerationDraft(tabId, { kind: 'negative-prompt', text: 'blur' })
  switch (component) {
    case 'embedding': {
      const { file, prompt } = await embeddingPrompt(fixture, 9920, 9921, 'file-owner.safetensors')
      const owner = projects.getOpenDocumentForAcceptance(tabId)!
      await owner.applyDocument({
        ...owner.document,
        generationDraft: { ...owner.document.generationDraft, positivePrompt: prompt },
      })
      return { bytes: file.bytes, managedPath: file.managedPath }
    }
    case 'external VAE': {
      const file = await publishIllustriousVaeFixture(
        modelService.repository,
        fixture.root,
        9930,
        9931,
      )
      const reference = await modelService.resolveGenerationVae(file.resourceId, file.versionId)
      await projects.setGenerationVae(tabId, async () => reference)
      return { bytes: file.bytes, managedPath: file.managedPath }
    }
    case 'LoRA': {
      const reference = await addControllerLora(fixture)
      const verified = await modelService.resolveVerifiedGenerationLoraForPlan(reference)
      return { bytes: await readFile(verified.managedPath), managedPath: verified.managedPath }
    }
  }
  assert.fail('Unsupported managed component fixture.')
}

// Actual ModelService owns both exact-byte refusals; no component resolver is replaced. Tiny
// managed fixtures pass Main's real qualifiers, while inference output remains controlled.
for (const component of ['LoRA', 'embedding', 'external VAE'] as const) {
  for (const fault of ['missing', 'corrupt'] as const) {
    test(`managed component ${component} ${fault} gives resource diagnostics through public Generate and frozen Retry without changing durable owners`, async () => {
      await withFixture(async (fixture) => {
        const { controller, documentId, projects, queue, runtime, staging, tabId } = fixture
        const ownedFile = await selectControllerComponentFile(fixture, component)
        const originalFile = await lstat(ownedFile.managedPath)
        assert.equal(originalFile.isFile(), true)
        assert.equal(originalFile.isSymbolicLink(), false)
        assert.equal(originalFile.size, ownedFile.bytes.length)
        assert.deepEqual(await readFile(ownedFile.managedPath), ownedFile.bytes)
        runtime.ready = structuredClone(noiseReady)
        await projects.save(tabId)
        runtime.beforeGenerate = async () => {
          if (runtime.generated.length === 2) {
            throw new Error('Controlled second-job failure retains the healthy first candidate.')
          }
        }
        const initial = await controller.generate(tabId, { documentId, iterations: 2 })
        assert.equal(initial.kind, 'queued')
        if (initial.kind !== 'queued') {
          assert.fail('Healthy managed components must publish jobs.')
        }
        assert.equal(initial.jobIds.length, 2)
        await waitForState(
          controller,
          tabId,
          (state) => state.phase === 'idle' && !state.jobs.length,
        )
        const healthy = await controller.getQueue()
        assert.equal(healthy.counts.completed, 1)
        assert.equal(healthy.counts.failed, 1)
        const source = healthy.items.find((item) => item.status === 'failed')!
        const frozen = await queue.loadVerifiedInput(source.id)
        const sourceTarget = await readFile(frozen.targetPath)
        const candidates = await staging.listVerifiedCandidates(tabId)
        assert.equal(candidates.length, 1)
        assert.equal(candidates[0].actualSeed, 42)
        await projects.updateGenerationDraft(tabId, { kind: 'sampling-cfg-scale', value: 8.5 })
        await projects.flushAutosave(tabId)
        const beforeGenerate = await componentRefusalSnapshot(fixture)
        assert.equal(beforeGenerate.queue.length, 2)
        assert.equal(beforeGenerate.receipts.length, 1)
        assert.equal(beforeGenerate.seeds.length, 1)
        assert.ok(beforeGenerate.autosave)
        assert.ok(beforeGenerate.privateInputs)
        assert.ok(beforeGenerate.staging)
        const impact = await controller.generate(tabId, { documentId, iterations: 1 })
        assert.equal(impact.kind, 'confirmation-required')
        if (impact.kind !== 'confirmation-required') {
          assert.fail('The completed neighboring candidate requires concrete replacement review.')
        }
        const code = fault === 'missing' ? 'MODEL_FILE_MISSING' : 'MODEL_FILE_CORRUPT'
        const backupPath = `${ownedFile.managedPath}.owned-test-backup`
        let backedUp = false
        let generateError: ProjectGenerationActionState['error'] = null
        let retryError: ProjectGenerationActionState['error'] = null
        let beforeRetry: Awaited<ReturnType<typeof componentRefusalSnapshot>> | undefined
        let compositions = runtime.composedTargets.length
        try {
          // Rename preserves the original file owner/inode. Corruption changes one payload byte
          // in a same-size replacement, so the real hash check, not size/header checks, refuses it.
          await rename(ownedFile.managedPath, backupPath)
          backedUp = true
          if (fault === 'corrupt') {
            const corrupted = Buffer.from(ownedFile.bytes)
            corrupted[corrupted.length - 1] ^= 0xff
            await writeFile(ownedFile.managedPath, corrupted, {
              flag: 'wx',
              mode: originalFile.mode & 0o777,
            })
            assert.equal((await lstat(ownedFile.managedPath)).size, originalFile.size)
          }
          await assert.rejects(
            controller.generate(tabId, {
              confirmation: {
                candidateIds: impact.candidateIds,
                unfinishedJobIds: impact.unfinishedJobIds,
              },
              documentId,
              iterations: 1,
            }),
            { code },
          )
          generateError = (await controller.getState(tabId)).error
          assert.ok(generateError)
          assert.equal(runtime.generated.length, 2)
          // New Generate may compose its owned target before exact component materialization
          // refuses it. Cleanup must preserve the durable snapshot; Retry reuses frozen pixels.
          assert.equal(runtime.composedTargets.length, compositions + 1)
          compositions = runtime.composedTargets.length
          assert.deepEqual(await componentRefusalSnapshot(fixture), beforeGenerate)

          // Today's draft no longer selects this component; frozen Retry must still inspect
          // the captured exact managed file, without replacing it or composing another target.
          const owner = projects.getOpenDocumentForAcceptance(tabId)!
          await owner.applyDocument({
            ...owner.document,
            generationDraft: {
              ...owner.document.generationDraft,
              loras: [],
              negativePrompt: { embeddingRefs: [], text: 'later negative prompt' },
              positivePrompt: { embeddingRefs: [], text: 'later unrelated prompt' },
              vae: null,
            },
          })
          await projects.updateGenerationDraft(tabId, { kind: 'seed', policy: 'fixed', value: 99 })
          await projects.setPrimaryBbox(tabId, { height: 64, width: 64, x: 123, y: -456 })
          await projects.flushAutosave(tabId)
          beforeRetry = await componentRefusalSnapshot(fixture)
          await assert.rejects(controller.retryJob(source), { code })
          retryError = (await controller.getState(tabId)).error
          assert.ok(retryError)
          assert.equal(runtime.generated.length, 2)
          assert.equal(runtime.composedTargets.length, compositions)
          assert.deepEqual(await componentRefusalSnapshot(fixture), beforeRetry)
        } finally {
          if (backedUp) {
            await rm(ownedFile.managedPath, { force: true })
            await rename(backupPath, ownedFile.managedPath)
          }
        }
        assert.deepEqual(await readFile(ownedFile.managedPath), ownedFile.bytes)
        const restoredFile = await lstat(ownedFile.managedPath)
        assert.equal(restoredFile.ino, originalFile.ino)
        assert.equal(restoredFile.dev, originalFile.dev)
        assert.equal(restoredFile.mode, originalFile.mode)
        assert.ok(beforeRetry)
        runtime.beforeGenerate = null
        await controller.retryJob(source)
        await waitForState(
          controller,
          tabId,
          (state) => state.phase === 'idle' && !state.jobs.length,
        )
        assert.equal(runtime.generated.length, 3)
        assert.equal(runtime.composedTargets.length, compositions)
        const afterRetry = await controller.getQueue()
        assert.equal(afterRetry.items.length, 3)
        assert.equal(afterRetry.counts.completed, 2)
        assert.equal(afterRetry.counts.failed, 1)
        const retried = afterRetry.items.find((item) => !initial.jobIds.includes(item.id))!
        assert.equal(retried.status, 'completed')
        const restored = await queue.loadVerifiedInput(retried.id)
        assert.deepEqual(restored.payload.context, frozen.payload.context)
        assert.deepEqual(await readFile(restored.targetPath), sourceTarget)
        assert.deepEqual((await queue.loadVerifiedInput(source.id)).payload, frozen.payload)
        assert.deepEqual(await readFile(frozen.targetPath), sourceTarget)
        const normalizeWorkerPaths = (job: IllustriousGenerationRequestV1['job']) => ({
          ...job,
          output: { pngPath: '<worker output>', stagingRoot: '<worker staging>' },
          target: { ...job.target, path: '<worker target>' },
        })
        assert.deepEqual(
          normalizeWorkerPaths(runtime.generated[2].job),
          normalizeWorkerPaths(runtime.generated[1].job),
        )
        assert.equal(runtime.generated[2].job.sampling.seed, 43)
        const after = await componentRefusalSnapshot(fixture)
        for (const field of ['autosave', 'document', 'tabs', 'savedBytes', 'tombstones'] as const) {
          assert.deepEqual(after[field], beforeRetry[field])
        }
        assert.deepEqual(
          after.receipts.find((receipt) => receipt.candidate_id === candidates[0].candidateId),
          beforeRetry.receipts[0],
        )
        assert.deepEqual(
          after.candidates.find((candidate) => candidate.candidateId === candidates[0].candidateId),
          candidates[0],
        )
        assert.equal(after.candidates.length, 2)
        assert.equal(after.cursor, 43)
        assert.ok(generateError)
        assert.ok(retryError)
        const message =
          'The selected model resource could not be verified for generation. Review it in Model Manager.'
        assert.deepEqual(generateError, { code, message })
        assert.deepEqual(retryError, { code, message })
        assert.equal(generateError.message.includes(fixture.root), false)
        assert.equal(retryError.message.includes(fixture.root), false)
      })
    })
  }
}

test('Generate freezes distinct per-polarity exact embeddings for every concrete dynamic branch through the real queue and staging', async () => {
  await withFixture(async (fixture) => {
    const positive = await embeddingPrompt(fixture, 610, 611, 'clean-style.safetensors')
    const negative = await embeddingPrompt(fixture, 620, 621, 'rough-style.safetensors', -0.3)
    const other = await embeddingPrompt(fixture, 630, 631, 'other-style.safetensors', 0.7)
    const owner = fixture.projects.getOpenDocumentForAcceptance(fixture.tabId)!
    const positiveRefs = [...positive.prompt.embeddingRefs, ...other.prompt.embeddingRefs]
    // Existing saved custom literals need no filename migration; same literal has a different
    // exact resource in the negative polarity and never aliases the positive resource.
    const negativeRefs = [
      { resource: negative.prompt.embeddingRefs[0].resource, token: '<clean-style>' },
    ]
    await owner.applyDocument({
      ...owner.document,
      generationDraft: {
        ...owner.document.generationDraft,
        negativePrompt: { embeddingRefs: negativeRefs, text: '{<clean-style>|blur}' },
        positivePrompt: {
          embeddingRefs: positiveRefs,
          text: 'portrait {<clean-style>|<other-style>}',
        },
      },
    })
    fixture.runtime.ready = structuredClone(embeddingReady)
    assert.equal((await fixture.controller.getState(fixture.tabId)).embeddingsSupported, true)
    const result = await fixture.controller.generate(fixture.tabId, {
      documentId: fixture.documentId,
      iterations: 1,
    })
    assert.equal(result.kind, 'queued')
    if (result.kind !== 'queued') {
      throw new Error('Expected qualified embedding batch.')
    }
    assert.equal(result.jobIds.length, 4)
    await fixture.projects.updateGenerationDraft(fixture.tabId, {
      kind: 'positive-prompt',
      text: 'later unrelated edit',
    })
    await fixture.modelService.repository.setDefaultVersion(
      other.file.resourceId,
      other.file.versionId,
    )
    await waitForState(fixture.controller, fixture.tabId, (state) => state.phase === 'idle')
    assert.equal(fixture.runtime.generated.length, 4)
    const candidates = await fixture.staging.listVerifiedCandidates(fixture.tabId)
    assert.equal(candidates.length, 4)
    for (const id of result.jobIds) {
      const loaded = await fixture.queue.loadVerifiedInput(id)
      assert.ok(
        loaded.payload.kind === 'illustrious-txt2img' ||
          loaded.payload.kind === 'illustrious-img2img',
      )
      const { context, workerJob } = loaded.payload
      assert.deepEqual(context.embeddingRefs, { negative: negativeRefs, positive: positiveRefs })
      const selected = context.prompts.positive.includes('<other-style>') ? other : positive
      assert.deepEqual(workerJob.embeddings?.positive, [
        {
          byteSize: selected.file.bytes.length,
          path: selected.file.managedPath,
          sha256: selected.prompt.embeddingRefs[0].resource.fileSha256,
          token: selected.prompt.embeddingRefs[0].token,
        },
      ])
      assert.deepEqual(
        workerJob.embeddings?.negative,
        context.prompts.negative === 'blur'
          ? []
          : [
              {
                byteSize: negative.file.bytes.length,
                path: negative.file.managedPath,
                sha256: negative.prompt.embeddingRefs[0].resource.fileSha256,
                token: '<clean-style>',
              },
            ],
      )
      assert.equal('embeddingPool' in loaded.payload, false)
      assert.equal('embeddingPool' in context, false)
      const candidate = candidates.find((candidate) => candidate.queueItemId === id)
      assert.ok(candidate)
      assert.equal(
        (JSON.parse(candidate.frozenPayloadJson) as { context: { prompts: { positive: string } } })
          .context.prompts.positive,
        context.prompts.positive,
      )
      assert.deepEqual(
        (JSON.parse(candidate.frozenPayloadJson) as { context: { embeddings: unknown } }).context
          .embeddings,
        context.embeddings,
      )
    }
  })
})

test('dynamic expansion cannot invent an unbound known embedding and refuses the entire batch before publication', async () => {
  await withFixture(async (fixture) => {
    await embeddingPrompt(fixture, 710, 711, 'clean-style.safetensors')
    await fixture.projects.updateGenerationDraft(fixture.tabId, {
      kind: 'positive-prompt',
      text: '<{clean|ordinary}-style>',
    })
    await fixture.projects.updateGenerationDraft(fixture.tabId, {
      kind: 'negative-prompt',
      text: '',
    })
    fixture.runtime.ready = structuredClone(embeddingReady)
    await assert.rejects(
      fixture.controller.generate(fixture.tabId, { documentId: fixture.documentId, iterations: 1 }),
      { code: 'MODEL_EMBEDDING_UNBOUND' },
    )
    assert.equal((await fixture.controller.getQueue()).items.length, 0)
    assert.equal(fixture.runtime.generated.length, 0)
    assert.deepEqual(await fixture.staging.listVerifiedCandidates(fixture.tabId), [])
    assert.equal(await fixture.staging.readLastActualSeed(fixture.tabId, fixture.documentId), null)
    assert.equal(
      fixture.projects.getOpenDocumentForAcceptance(fixture.tabId)!.document.generationDraft
        .positivePrompt.text,
      '<{clean|ordinary}-style>',
    )
  })
})

test('Generate retains the full verified embedding pool for a portable bound literal assembled by dynamic fragments', async () => {
  await withFixture(async (fixture) => {
    const selected = await embeddingPrompt(fixture, 730, 731, 'clean-style.safetensors')
    const owner = fixture.projects.getOpenDocumentForAcceptance(fixture.tabId)!
    // Ordinary UI reconciliation prunes an absent literal. A portable saved document can retain
    // this explicit exact binding: the real writer/loader accept its schema without rewriting it.
    // This is source preparation, not a fixture containing the result being tested.
    await owner.applyDocument({
      ...owner.document,
      generationDraft: {
        ...owner.document.generationDraft,
        negativePrompt: { embeddingRefs: [], text: '' },
        positivePrompt: {
          embeddingRefs: selected.prompt.embeddingRefs,
          text: 'portrait <{clean|ordinary}-style>',
        },
      },
    })
    await fixture.projects.save(fixture.tabId)
    const saved = (await readIgsPackage(fixture.packagePath)).project
    assert.equal(saved.generationDraft.positivePrompt.text, 'portrait <{clean|ordinary}-style>')
    assert.deepEqual(
      saved.generationDraft.positivePrompt.embeddingRefs,
      selected.prompt.embeddingRefs,
    )
    fixture.runtime.ready = structuredClone(embeddingReady)
    const result = await fixture.controller.generate(fixture.tabId, {
      documentId: fixture.documentId,
      iterations: 1,
    })
    assert.equal(result.kind, 'queued')
    if (result.kind !== 'queued') {
      throw new Error('Expected the explicit saved binding to qualify')
    }
    assert.equal(result.jobIds.length, 2)
    await waitForState(fixture.controller, fixture.tabId, (state) => state.phase === 'idle')
    assert.equal(fixture.runtime.generated.length, 2)
    assert.equal((await fixture.staging.listVerifiedCandidates(fixture.tabId)).length, 2)
    for (const id of result.jobIds) {
      const input = await fixture.queue.loadVerifiedInput(id)
      assert.ok(
        input.payload.kind === 'illustrious-txt2img' ||
          input.payload.kind === 'illustrious-img2img',
      )
      const { context, workerJob } = input.payload
      assert.deepEqual(context.embeddingRefs!.positive, selected.prompt.embeddingRefs)
      const activated = context.prompts.positive.includes('<clean-style>')
      assert.equal(context.embeddings!.positive.length, activated ? 1 : 0)
      assert.equal(workerJob.embeddings?.positive.length ?? 0, activated ? 1 : 0)
      if (activated) {
        assert.equal(workerJob.embeddings!.positive[0].path, selected.file.managedPath)
        assert.equal(
          workerJob.embeddings!.positive[0].sha256,
          selected.prompt.embeddingRefs[0].resource.fileSha256,
        )
      }
    }
    assert.deepEqual((await readIgsPackage(fixture.packagePath)).project, saved)
  })
})

test('embedding Retry rechecks worker qualification and exact active bytes, keeps original literals and ignores inactive branches and later draft/default', async () => {
  await withFixture(async (fixture) => {
    const selected = await embeddingPrompt(fixture, 810, 811, 'clean-style.safetensors')
    const inactive = await embeddingPrompt(fixture, 820, 821, 'other-style.safetensors', 0.9)
    const owner = fixture.projects.getOpenDocumentForAcceptance(fixture.tabId)!
    await owner.applyDocument({
      ...owner.document,
      generationDraft: {
        ...owner.document.generationDraft,
        negativePrompt: { embeddingRefs: [], text: '' },
        positivePrompt: {
          embeddingRefs: [...selected.prompt.embeddingRefs, ...inactive.prompt.embeddingRefs],
          text: '{<clean-style>|<other-style>}',
        },
      },
    })
    fixture.runtime.ready = structuredClone(embeddingReady)
    fixture.runtime.beforeGenerate = async () => {
      throw new Error('Controlled inference failure.')
    }
    await fixture.controller.generate(fixture.tabId, {
      documentId: fixture.documentId,
      iterations: 1,
    })
    await waitForState(fixture.controller, fixture.tabId, (state) => state.phase === 'idle')
    const source = (await fixture.controller.getQueue()).items.find(
      (item) => item.details?.prompt === '<clean-style>',
    )!
    assert.equal(source.status, 'failed')
    await fixture.projects.updateGenerationDraft(fixture.tabId, {
      kind: 'positive-prompt',
      text: 'different draft',
    })
    await fixture.modelService.repository.setDefaultVersion(
      inactive.file.resourceId,
      inactive.file.versionId,
    )
    fixture.runtime.beforeGenerate = null
    fixture.runtime.ready = structuredClone(externalVaeReady)
    await assert.rejects(fixture.controller.retryJob(source), { code: 'INFERENCE_UNAVAILABLE' })
    fixture.runtime.ready = structuredClone(embeddingReady)
    await writeFile(selected.file.managedPath, Buffer.alloc(selected.file.bytes.length, 1))
    await assert.rejects(fixture.controller.retryJob(source), { code: 'MODEL_FILE_CORRUPT' })
    assert.equal((await fixture.controller.getQueue()).items.length, 2)
    await writeFile(selected.file.managedPath, selected.file.bytes)
    await rm(inactive.file.managedPath)
    await fixture.controller.retryJob(source)
    await waitForState(fixture.controller, fixture.tabId, (state) => state.phase === 'idle')
    assert.equal(fixture.runtime.generated.length, 3)
    assert.equal(fixture.runtime.generated.at(-1)?.job.prompts.positive, '<clean-style>')
    assert.equal(
      fixture.runtime.generated.at(-1)?.job.embeddings?.positive[0]?.path,
      selected.file.managedPath,
    )
    assert.equal((await fixture.controller.getQueue()).items.length, 3)
    assert.equal(
      fixture.projects.getOpenDocumentForAcceptance(fixture.tabId)!.document.generationDraft
        .positivePrompt.text,
      'different draft',
    )
  })
})

test('dispatch rechecks a queued embedding changed after admission while preserving the completed neighboring job', async () => {
  await withFixture(async (fixture) => {
    const first = await embeddingPrompt(fixture, 910, 911, 'clean-style.safetensors')
    const second = await embeddingPrompt(fixture, 920, 921, 'other-style.safetensors', 0.8)
    const owner = fixture.projects.getOpenDocumentForAcceptance(fixture.tabId)!
    await owner.applyDocument({
      ...owner.document,
      generationDraft: {
        ...owner.document.generationDraft,
        negativePrompt: { embeddingRefs: [], text: '' },
        positivePrompt: {
          embeddingRefs: [...first.prompt.embeddingRefs, ...second.prompt.embeddingRefs],
          text: '{<clean-style>|<other-style>}',
        },
      },
    })
    fixture.runtime.ready = structuredClone(embeddingReady)
    const entered = signal()
    const release = signal()
    fixture.runtime.beforeGenerate = async () => {
      entered.resolve()
      await release.promise
    }
    try {
      await fixture.controller.generate(fixture.tabId, {
        documentId: fixture.documentId,
        iterations: 1,
      })
      await entered.promise
      assert.equal(fixture.runtime.generated.length, 1)
      const activePath = fixture.runtime.generated[0].job.embeddings!.positive[0].path
      const changed = activePath === first.file.managedPath ? second.file : first.file
      await writeFile(changed.managedPath, Buffer.alloc(changed.bytes.length, 1))
      release.resolve()
      await waitForState(fixture.controller, fixture.tabId, (state) => state.phase === 'idle')
      assert.equal(
        fixture.runtime.generated.length,
        1,
        'changed queued embedding must never reach heavy worker',
      )
      const page = await fixture.controller.getQueue()
      assert.equal(page.counts.completed, 1)
      assert.equal(page.counts.failed, 1)
      const candidates = await fixture.staging.listVerifiedCandidates(fixture.tabId)
      assert.equal(candidates.length, 1)
      assert.equal(candidates[0].actualSeed, fixture.runtime.generated[0].job.sampling.seed)
      assert.equal(
        await fixture.staging.readLastActualSeed(fixture.tabId, fixture.documentId),
        candidates[0].actualSeed,
      )
    } finally {
      release.resolve()
    }
  })
})

const eulerReady: InferenceWorkerReady = {
  capabilities: [
    'illustrious-txt2img',
    'target-composition',
    'denoising-progress',
    'candidate-thumbnails',
    'illustrious-cfg-rescale',
    'illustrious-img2img',
    'illustrious-lora',
    'illustrious-vae-precision',
    'illustrious-external-vae',
    'illustrious-embeddings',
    'illustrious-outpaint',
    'illustrious-euler',
  ],
  protocolVersion: '1',
  runtimeProfile: 'linux-nvidia',
  workerVersion: '0.13.0',
}

test('ordinary Euler refuses before a worker reservation and freezes selection through concurrent draft edits and completion', async () => {
  await withFixture(async (fixture) => {
    const { controller, documentId, projects, queue, runtime, staging, tabId } = fixture
    await projects.updateGenerationDraft(tabId, { kind: 'positive-prompt', text: 'a lantern' })
    await projects.updateGenerationDraft(tabId, { kind: 'negative-prompt', text: 'blur' })
    await projects.updateGenerationDraft(tabId, {
      kind: 'sampling-pair',
      sampler: 'Euler',
      scheduler: 'Normal',
    })
    const saved = await readFile(fixture.packagePath)
    const preparationsBefore = runtime.preparationCount
    const seedBefore = await staging.readLastActualSeed(tabId, documentId)
    await assert.rejects(controller.generate(tabId, { documentId, iterations: 1 }), {
      code: 'INFERENCE_UNAVAILABLE',
    })
    assert.equal(runtime.preparationCount, preparationsBefore)
    assert.equal(await staging.readLastActualSeed(tabId, documentId), seedBefore)
    assert.equal(runtime.composedTargets.length, 0)
    assert.equal((await controller.getQueue()).items.length, 0)
    assert.deepEqual(await staging.listVerifiedCandidates(tabId), [])
    runtime.ready = structuredClone(eulerReady)
    const entered = signal()
    const release = signal()
    runtime.beforeCompose = async () => {
      entered.resolve()
      await release.promise
    }
    try {
      const pending = controller.generate(tabId, { documentId, iterations: 1 })
      await entered.promise
      await projects.updateGenerationDraft(tabId, {
        kind: 'sampling-pair',
        sampler: 'Euler a',
        scheduler: 'Normal',
      })
      release.resolve()
      const queued = await pending
      assert.equal(queued.kind, 'queued')
      if (queued.kind !== 'queued') {
        throw new Error('expected durable batch')
      }
      await waitForState(controller, tabId, (state) => state.phase === 'idle')
      const frozen = await queue.loadVerifiedInput(queued.jobIds[0])
      assert.ok(
        frozen.payload.kind === 'illustrious-txt2img' ||
          frozen.payload.kind === 'illustrious-img2img',
      )
      assert.equal(frozen.item.status, 'completed')
      assert.equal(frozen.payload.context.sampling.invokeScheduler, 'euler')
      assert.equal(frozen.payload.workerJob.sampling.scheduler, 'euler')
      assert.equal(runtime.generated[0].job.sampling.scheduler, 'euler')
      const candidates = await staging.listVerifiedCandidates(tabId)
      assert.equal(candidates.length, 1)
      assert.equal(
        JSON.parse(candidates[0].frozenPayloadJson).context.sampling.invokeScheduler,
        'euler',
      )
      assert.equal(
        projects.getOpenDocumentForAcceptance(tabId)!.document.generationDraft.sampling.sampler,
        'Euler a',
      )
      assert.deepEqual(await readFile(fixture.packagePath), saved)
    } finally {
      release.resolve()
    }
  })
})

test('Euler Retry refuses legacy peers without changing the failed source and ignores later sampler edits', async () => {
  await withFixture(async (fixture) => {
    const { controller, documentId, projects, runtime, tabId } = fixture
    await projects.updateGenerationDraft(tabId, { kind: 'positive-prompt', text: 'a lantern' })
    await projects.updateGenerationDraft(tabId, { kind: 'negative-prompt', text: 'blur' })
    runtime.ready = structuredClone(eulerReady)
    await projects.updateGenerationDraft(tabId, {
      kind: 'sampling-pair',
      sampler: 'Euler',
      scheduler: 'Normal',
    })
    runtime.beforeGenerate = async () => {
      throw new Error('controlled initial inference failure')
    }
    const initial = await controller.generate(tabId, { documentId, iterations: 1 })
    assert.equal(initial.kind, 'queued')
    await waitForState(controller, tabId, (state) => state.phase === 'idle')
    const source = (await controller.getQueue()).items[0]
    assert.equal(source.status, 'failed')
    await projects.updateGenerationDraft(tabId, {
      kind: 'sampling-pair',
      sampler: 'Euler a',
      scheduler: 'Normal',
    })
    runtime.beforeGenerate = null
    runtime.ready = {
      ...eulerReady,
      capabilities: ['illustrious-txt2img'],
      workerVersion: '0.2.0',
    }
    await assert.rejects(controller.retryJob(source), { code: 'INFERENCE_UNAVAILABLE' })
    const unchanged = await controller.getQueue()
    assert.equal(unchanged.items.length, 1)
    assert.equal(unchanged.items[0].statusSequence, source.statusSequence)
    assert.equal(runtime.generated.length, 1)
    runtime.ready = structuredClone(eulerReady)
    await controller.retryJob(source)
    await waitForState(controller, tabId, (state) => state.phase === 'idle')
    assert.equal(runtime.generated.length, 2)
    assert.equal(runtime.generated[1].job.sampling.scheduler, 'euler')
    assert.equal(
      (await controller.getQueue()).items.filter((item) => item.status === 'completed').length,
      1,
    )
  })
})

const noiseReady: InferenceWorkerReady = {
  ...eulerReady,
  capabilities: [...eulerReady.capabilities, 'illustrious-noise-profile'],
  workerVersion: '0.14.0',
}

test('public noise policy admission refuses legacy before composition and freezes actual profile into durable execution', async () => {
  await withFixture(async (fixture) => {
    const { controller, documentId, modelService, projects, queue, runtime, staging, tabId } =
      fixture
    await projects.updateGenerationDraft(tabId, { kind: 'positive-prompt', text: 'a lantern' })
    await projects.updateGenerationDraft(tabId, { kind: 'negative-prompt', text: 'blur' })
    const ref = projects.getOpenDocumentForAcceptance(tabId)!.document.generationDraft.model!
    await modelService.setNoiseProfile(ref.localModelId, ref.localVersionId, {
      kind: 'rescale-betas-zero-snr',
      value: true,
    })
    await modelService.setNoiseProfile(ref.localModelId, ref.localVersionId, {
      kind: 'timestep-spacing',
      value: 'trailing',
    })
    const seedBefore = await staging.readLastActualSeed(tabId, documentId)
    const saved = await readFile(fixture.packagePath)
    await assert.rejects(controller.generate(tabId, { documentId, iterations: 1 }), {
      code: 'INFERENCE_UNAVAILABLE',
    })
    assert.equal(runtime.preparationCount, 0)
    assert.equal(runtime.composedTargets.length, 0)
    assert.equal((await controller.getQueue()).items.length, 0)
    assert.equal(await staging.readLastActualSeed(tabId, documentId), seedBefore)
    assert.ok((await readFile(fixture.packagePath)).equals(saved))
    runtime.ready = structuredClone(noiseReady)
    const queued = await controller.generate(tabId, { documentId, iterations: 1 })
    assert.equal(queued.kind, 'queued')
    if (queued.kind !== 'queued') {
      throw new Error('expected queue')
    }
    await waitForState(controller, tabId, (state) => state.phase === 'idle')
    const frozen = await queue.loadVerifiedInput(queued.jobIds[0])
    assert.ok(
      frozen.payload.kind === 'illustrious-txt2img' ||
        frozen.payload.kind === 'illustrious-img2img',
    )
    const expected = {
      baseSchedule: 'sdxl-scaled-linear-v1',
      rescaleBetasZeroSnr: true,
      schemaVersion: 1,
      timestepSpacing: 'trailing',
    }
    assert.deepEqual(frozen.payload.context.sampling.noiseProfile, expected)
    assert.deepEqual(frozen.payload.workerJob.sampling.noiseProfile, expected)
    assert.deepEqual(runtime.generated[0].job.sampling.noiseProfile, expected)
    assert.equal((await staging.listVerifiedCandidates(tabId)).length, 1)
  })
})

test('noise policy changes cause preserving public frozen Retry refusal; exact restore ignores later draft and permits retry', async () => {
  await withFixture(async (fixture) => {
    const { controller, documentId, modelService, projects, queue, runtime, staging, tabId } =
      fixture
    await projects.updateGenerationDraft(tabId, { kind: 'positive-prompt', text: 'a lantern' })
    await projects.updateGenerationDraft(tabId, { kind: 'negative-prompt', text: 'blur' })
    const ref = projects.getOpenDocumentForAcceptance(tabId)!.document.generationDraft.model!
    runtime.ready = structuredClone(noiseReady)
    await modelService.setNoiseProfile(ref.localModelId, ref.localVersionId, {
      kind: 'rescale-betas-zero-snr',
      value: true,
    })
    await modelService.setNoiseProfile(ref.localModelId, ref.localVersionId, {
      kind: 'timestep-spacing',
      value: 'trailing',
    })
    runtime.beforeGenerate = async () => {
      throw new Error('controlled failure')
    }
    const queued = await controller.generate(tabId, { documentId, iterations: 1 })
    assert.equal(queued.kind, 'queued')
    await waitForState(controller, tabId, (state) => state.phase === 'idle')
    const source = (await controller.getQueue()).items[0]
    const before = await queue.loadVerifiedRetryInput(source.id)
    const seedBefore = await staging.readLastActualSeed(tabId, documentId)
    runtime.beforeGenerate = null
    await modelService.setNoiseProfile(ref.localModelId, ref.localVersionId, {
      kind: 'timestep-spacing',
      value: 'leading',
    })
    await assert.rejects(controller.retryJob(source))
    assert.deepEqual(await queue.loadVerifiedRetryInput(source.id), before)
    assert.equal((await controller.getQueue()).items.length, 1)
    assert.equal(runtime.generated.length, 1)
    assert.equal(await staging.readLastActualSeed(tabId, documentId), seedBefore)
    assert.deepEqual(await staging.listVerifiedCandidates(tabId), [])
    await modelService.setNoiseProfile(ref.localModelId, ref.localVersionId, {
      kind: 'timestep-spacing',
      value: 'trailing',
    })
    await projects.updateGenerationDraft(tabId, {
      kind: 'sampling-pair',
      sampler: 'Euler a',
      scheduler: 'Normal',
    })
    await controller.retryJob(source)
    await waitForState(controller, tabId, (state) => state.phase === 'idle')
    assert.equal(runtime.generated.length, 2)
    assert.equal(runtime.generated[1].job.sampling.scheduler, 'dpmpp_2m_k')
    assert.equal(runtime.generated[1].job.sampling.noiseProfile?.rescaleBetasZeroSnr, true)
    assert.equal(runtime.generated[1].job.sampling.noiseProfile?.timestepSpacing, 'trailing')
  })
})

test('public Retry refuses malformed Smart Patch input before runtime acquisition and preserves ordinary Retry', async () => {
  await withFixture(async (f) => {
    const { controller, database, documentId, projects, runtime, tabId } = f
    await projects.updateGenerationDraft(tabId, {
      kind: 'positive-prompt',
      text: 'private queue gate',
    })
    runtime.beforeGenerate = async () => {
      throw new Error('Controlled terminal neighbor')
    }
    await controller.generate(tabId, { documentId, iterations: 1 })
    await waitForState(controller, tabId, (state) => state.phase === 'idle')
    const source = (await controller.getQueue()).items[0]
    assert.equal(source.status, 'failed')
    const originals = await database.db
      .selectFrom('generation_queue_item')
      .selectAll()
      .orderBy('id')
      .execute()
    const original = originals.find((row) => row.id === source.id)!
    const generated = runtime.generated.length
    const admissions = runtime.admissionCount
    const readOrdinary = f.queue.loadVerifiedRetryInput.bind(f.queue)
    let ordinaryReads = 0
    f.queue.loadVerifiedRetryInput = async (id) => {
      ordinaryReads++
      return await readOrdinary(id)
    }
    for (const operation of ['illustrious-smart-patch', 'anima-smart-patch']) {
      // The dedicated Smart parser refuses this crossed payload before any runtime acquisition.
      await database.db
        .updateTable('generation_queue_item')
        .set({ frozen_payload_json: '{}', operation })
        .where('id', '=', source.id)
        .execute()
      await assert.rejects(controller.retryJob(source), { code: 'QUEUE_INPUT_INVALID' })
      assert.equal(runtime.admissionCount, admissions)
      assert.equal(ordinaryReads, 0, 'Smart input must not enter the ordinary frozen reader')
      const rows = await database.db
        .selectFrom('generation_queue_item')
        .selectAll()
        .orderBy('id')
        .execute()
      assert.deepEqual(
        rows,
        originals.map((row) =>
          row.id === source.id ? { ...row, frozen_payload_json: '{}', operation } : row,
        ),
      )
    }
    await database.db
      .updateTable('generation_queue_item')
      .set({ frozen_payload_json: original.frozen_payload_json, operation: original.operation })
      .where('id', '=', source.id)
      .execute()
    runtime.beforeGenerate = null
    await controller.retryJob(source)
    await waitForState(controller, tabId, (state) => state.phase === 'idle')
    assert.equal(runtime.generated.length, generated + 1)
    assert.equal(ordinaryReads, 1, 'The restored ordinary neighbor still uses its own reader')
  })
})

// Boundary: public Generate -> current Main document -> eligibility, before any replacement,
// planning, seed read, model work or queue publication. The held second output makes absence of
// cancellation observable while a real candidate, receipt/cursor, running job and pending jobs exist.
for (const lockedZeroOverlay of [false, true]) {
  test(`ordinary Generate refuses an enabled unselected ${lockedZeroOverlay ? 'locked zero-overlay' : 'empty'} region before fresh work or stale replacement confirmation`, async (t) => {
    await withFixture(async (f) => {
      const entered = signal()
      const release = signal()
      f.runtime.beforeGenerate = async () => {
        if (f.runtime.generated.length === 2) {
          entered.resolve()
          await release.promise
        }
      }
      const initial = await f.controller.generate(f.tabId, {
        documentId: f.documentId,
        iterations: 1,
      })
      assert.equal(initial.kind, 'queued')
      await entered.promise
      try {
        assert.equal((await f.staging.listVerifiedCandidates(f.tabId)).length, 1)
        const review = await f.controller.generate(f.tabId, {
          documentId: f.documentId,
          iterations: 1,
        })
        assert.equal(review.kind, 'confirmation-required')
        let tab = await f.projects.addRegionalGuidance(
          f.tabId,
          regionalDocumentOwner(f.projects, f.tabId),
        )
        const regionId = tab.regionalGuidance![0].id
        if (lockedZeroOverlay) {
          tab = await f.projects.updateRegionalGuidance(
            f.tabId,
            { ...regionalDocumentOwner(f.projects, f.tabId), regionId },
            { kind: 'overlay-opacity', overlayOpacity: 0 },
          )
          tab = await f.projects.updateRegionalGuidance(
            f.tabId,
            { ...regionalDocumentOwner(f.projects, f.tabId), regionId },
            { kind: 'lock', locked: true },
          )
        }
        // An invalid dynamic prompt is a planning tripwire: regional refusal must take priority.
        await f.projects.updateGenerationDraft(f.tabId, {
          kind: 'positive-prompt',
          text: '{unfinished',
        })
        await f.projects.flushAutosave(f.tabId)
        const before = await regionalQueueSnapshot(f)
        const document = structuredClone(f.projects.getOpenDocumentForAcceptance(f.tabId)!.document)
        const counts = [
          f.runtime.leaseCount,
          f.runtime.preparationCount,
          f.runtime.admissionCount,
          f.runtime.composedTargets.length,
          f.runtime.generated.length,
        ]
        const forbidden = [
          t.mock.method(f.projects, 'withCapturedNormalGenerationInput', async () =>
            assert.fail('Enabled regions must refuse before source capture.'),
          ),
          t.mock.method(f.runtime, 'withGenerationPreparation', async () =>
            assert.fail('Enabled regions must refuse before runtime preparation.'),
          ),
          t.mock.method(f.runtime, 'withGenerationAdmission', async () =>
            assert.fail('Enabled regions must refuse before runtime admission.'),
          ),
          t.mock.method(f.runtime, 'withGenerationWorker', async () =>
            assert.fail('Enabled regions must refuse before acquiring an inference worker.'),
          ),
          t.mock.method(f.modelService, 'resolveVerifiedGenerationCheckpointForPlan', async () =>
            assert.fail('Enabled regions must refuse before model resolution.'),
          ),
          t.mock.method(f.modelService, 'assertNoUnboundGenerationEmbeddings', async () =>
            assert.fail('Enabled regions must refuse before model/prompt resource checks.'),
          ),
          t.mock.method(f.staging, 'readLastActualSeed', async () =>
            assert.fail('Enabled regions must refuse before seed cursor reads.'),
          ),
          t.mock.method(f.orchestrator, 'enqueuePreparedBatch', async () =>
            assert.fail('Enabled regions must refuse before enqueue.'),
          ),
          t.mock.method(f.queue, 'cancel', async () =>
            assert.fail('Regional refusal must not cancel existing jobs.'),
          ),
          t.mock.method(f.staging, 'discardSessions', async () =>
            assert.fail('Regional refusal must not consume candidates.'),
          ),
        ]
        try {
          for (const confirmation of [undefined, { candidateIds: [], unfinishedJobIds: [] }]) {
            await assert.rejects(
              f.controller.generate(f.tabId, {
                documentId: f.documentId,
                iterations: 1,
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
          assert.deepEqual(await regionalQueueSnapshot(f), before)
          assert.deepEqual(f.projects.getOpenDocumentForAcceptance(f.tabId)!.document, document)
          assert.deepEqual(
            [
              f.runtime.leaseCount,
              f.runtime.preparationCount,
              f.runtime.admissionCount,
              f.runtime.composedTargets.length,
              f.runtime.generated.length,
            ],
            counts,
          )
        } finally {
          t.mock.restoreAll()
        }
      } finally {
        release.resolve()
      }
      await waitForState(
        f.controller,
        f.tabId,
        (state) => state.phase === 'idle' && state.jobs.length === 0,
      )
      assert.equal(
        f.runtime.generated.length,
        4,
        'Only the original admitted work reaches inference.',
      )
    })
  })
}

test('ordinary Generate with a disabled region admits and completes the real controlled batch', async () => {
  await withFixture(async (f) => {
    let tab = await f.projects.addRegionalGuidance(
      f.tabId,
      regionalDocumentOwner(f.projects, f.tabId),
    )
    tab = await f.projects.updateRegionalGuidance(
      f.tabId,
      { ...regionalDocumentOwner(f.projects, f.tabId), regionId: tab.regionalGuidance![0].id },
      { enabled: false, kind: 'enabled' },
    )
    const document = structuredClone(f.projects.getOpenDocumentForAcceptance(f.tabId)!.document)
    const result = await f.controller.generate(f.tabId, { documentId: f.documentId, iterations: 1 })
    assert.equal(result.kind, 'queued')
    if (result.kind !== 'queued') {
      assert.fail('Disabled regions must permit actual batch admission.')
    }
    assert.equal(result.jobIds.length, 4)
    await waitForState(
      f.controller,
      f.tabId,
      (state) => state.phase === 'idle' && state.jobs.length === 0,
    )
    assert.equal(f.runtime.generated.length, 4)
    assert.ok(f.runtime.leaseCount > 0)
    assert.equal((await f.queue.listManagerPage()).counts.completed, 4)
    assert.equal((await f.staging.listVerifiedCandidates(f.tabId)).length, 4)
    assert.equal(
      (await f.database.db.selectFrom('generation_candidate_receipt').selectAll().execute()).length,
      4,
    )
    assert.deepEqual(f.projects.getOpenDocumentForAcceptance(f.tabId)!.document, document)
    assert.equal((await readIgsPackage(f.packagePath)).project.regionalGuidance, undefined)
  })
})

test('ordinary pre-SQL regional guard rolls back staged batch rows and input files while preserving reviewed neighbors', async (t) => {
  const entered = signal()
  const release = signal()
  let active: Fixture | undefined
  let armed = false
  await withFixture(
    async (f) => {
      active = f
      const initial = await f.controller.generate(f.tabId, {
        documentId: f.documentId,
        iterations: 1,
      })
      assert.equal(initial.kind, 'queued')
      await waitForState(
        f.controller,
        f.tabId,
        (state) => state.phase === 'idle' && state.jobs.length === 0,
      )
      const review = await f.controller.generate(f.tabId, {
        documentId: f.documentId,
        iterations: 1,
      })
      assert.equal(review.kind, 'confirmation-required')
      if (review.kind !== 'confirmation-required') {
        assert.fail('Existing candidates must require replacement review.')
      }
      const before = await regionalQueueSnapshot(f)
      assert.equal(before.queue.length, 4)
      assert.equal(before.candidates.length, 4)
      const cancel = f.queue.cancel.bind(f.queue)
      const discard = f.staging.discardSessions.bind(f.staging)
      const cancelSpy = t.mock.method(f.queue, 'cancel', (...args: Parameters<typeof cancel>) =>
        cancel(...args),
      )
      const discardSpy = t.mock.method(
        f.staging,
        'discardSessions',
        (...args: Parameters<typeof discard>) => discard(...args),
      )
      armed = true
      const generating = f.controller.generate(f.tabId, {
        confirmation: {
          candidateIds: review.candidateIds,
          unfinishedJobIds: review.unfinishedJobIds,
        },
        documentId: f.documentId,
        iterations: 1,
      })
      const settled = generating.then(
        (value) => ({ kind: 'resolved' as const, value }),
        (error: unknown) => ({ error, kind: 'rejected' as const }),
      )
      try {
        await Promise.race([
          entered.promise,
          generating.then(() => assert.fail('The staged batch must enter its SQL commit barrier.')),
        ])
        assert.equal(
          f.projects.getOpenDocumentForAcceptance(f.tabId)!.document.regionalGuidance?.[0].enabled,
          true,
        )
      } finally {
        release.resolve()
      }
      const outcome = await settled
      armed = false
      const after = await regionalQueueSnapshot(f)
      assert.equal(
        after.queue.length,
        before.queue.length,
        'The pre-SQL guard must prevent new durable rows, including canceled replacement jobs.',
      )
      assert.equal(outcome.kind, 'rejected')
      if (outcome.kind !== 'rejected') {
        assert.fail('The late enabled region must refuse admission.')
      }
      await assert.rejects(Promise.reject(outcome.error), {
        code: 'GENERATION_REGIONAL_GUIDANCE_UNSUPPORTED',
      })
      assert.deepEqual(
        after,
        before,
        'The real transaction and published input directories must roll back, not leave canceled rows.',
      )
      assert.equal(cancelSpy.mock.callCount(), 0)
      assert.equal(discardSpy.mock.callCount(), 0)
      assert.equal(f.runtime.generated.length, 4)
      t.mock.restoreAll()
    },
    {
      beforeBatchCommit: async () => {
        if (!armed) {
          return
        }
        assert.ok(active)
        // Deliberately bypass the public Project operation gate while the real SQL transaction is
        // held. Removing the queue's final synchronous guard must leave an observable extra batch.
        await active.projects.addRegionalGuidance(
          active.tabId,
          regionalDocumentOwner(active.projects, active.tabId),
        )
        entered.resolve()
        await release.promise
      },
    },
  )
})

test('ordinary frozen Retry survives regional add enable rename delete and Undo with original bytes seed and one source CAS', async (t) => {
  await withFixture(async (f) => {
    const review = await makeFailedSource(f)
    const frozen = await f.queue.loadVerifiedRetryInput(review.id)
    const previous = await f.staging.listVerifiedCandidates(f.tabId)
    const previousPixels = await Promise.all(
      previous.map(async (candidate) => ({
        id: candidate.candidateId,
        sha256: sha256(await readFile(candidate.assetPath)),
      })),
    )
    const oldIds = (await f.queue.listManagerPage()).items.map(({ id }) => id)
    let tab = await f.projects.addRegionalGuidance(
      f.tabId,
      regionalDocumentOwner(f.projects, f.tabId),
    )
    const regionId = tab.regionalGuidance![0].id
    for (const enabled of [false, true]) {
      tab = await f.projects.updateRegionalGuidance(
        f.tabId,
        { ...regionalDocumentOwner(f.projects, f.tabId), regionId },
        { enabled, kind: 'enabled' },
      )
    }
    tab = await f.projects.updateRegionalGuidance(
      f.tabId,
      { ...regionalDocumentOwner(f.projects, f.tabId), regionId },
      { kind: 'rename', name: 'Later regional authoring' },
    )
    await f.projects.deleteRegionalGuidance(f.tabId, {
      ...regionalDocumentOwner(f.projects, f.tabId),
      regionId,
    })
    tab = await f.projects.undo(f.tabId)
    assert.equal(tab.regionalGuidance![0].enabled, true)
    assert.equal(tab.regionalGuidance![0].name, 'Later regional authoring')
    await f.projects.updateGenerationDraft(f.tabId, {
      kind: 'positive-prompt',
      text: 'Later global prompt',
    })
    await f.projects.updateGenerationDraft(f.tabId, { kind: 'seed', policy: 'fixed', value: 991 })
    const document = structuredClone(f.projects.getOpenDocumentForAcceptance(f.tabId)!.document)
    const saved = await readFile(f.packagePath)
    const capture = t.mock.method(f.projects, 'withCapturedNormalGenerationInput', async () =>
      assert.fail('Frozen Retry cannot recapture current regions or source.'),
    )
    const preparation = t.mock.method(f.runtime, 'withGenerationPreparation', async () =>
      assert.fail('Frozen Retry cannot prepare a fresh regional job.'),
    )
    try {
      await f.controller.retryJob(review)
      const page = await f.queue.listManagerPage()
      const retry = page.items.find(({ id }) => !oldIds.includes(id))
      assert.ok(retry)
      await waitForState(
        f.controller,
        f.tabId,
        (state) => state.phase === 'idle' && state.jobs.length === 0,
      )
      const replay = await f.queue.loadVerifiedInput(retry.id)
      assert.deepEqual(replay.payload, frozen.payload)
      assert.ok((await readFile(replay.targetPath)).equals(frozen.targetPngBytes))
      assert.notEqual(retry.id, frozen.item.id)
      assert.notEqual(retry.batchId, frozen.item.batchId)
      assert.notEqual(retry.stagingSessionId, frozen.item.stagingSessionId)
      assert.equal(
        (await f.queue.getManagerEntry(review.id)).statusSequence,
        review.statusSequence + 1,
      )
      assert.equal(f.runtime.generated.at(-1)!.job.sampling.seed, 42)
      assert.equal(f.runtime.generated.at(-1)!.job.prompts.positive, 'red lantern')
      const after = await f.staging.listVerifiedCandidates(f.tabId)
      assert.equal(after.length, previous.length + 1)
      for (const old of previousPixels) {
        const retained = after.find((candidate) => candidate.candidateId === old.id)
        assert.ok(retained)
        assert.equal(sha256(await readFile(retained.assetPath)), old.sha256)
      }
      assert.deepEqual(f.projects.getOpenDocumentForAcceptance(f.tabId)!.document, document)
      assert.ok((await readFile(f.packagePath)).equals(saved))
      assert.equal(capture.mock.callCount(), 0)
      assert.equal(preparation.mock.callCount(), 0)
      await assert.rejects(f.controller.retryJob(review), { code: 'GENERATION_INVALID_REQUEST' })
      assert.equal((await f.queue.listManagerPage()).items.length, oldIds.length + 1)
    } finally {
      t.mock.restoreAll()
    }
  })
})
