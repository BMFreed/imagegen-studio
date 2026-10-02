import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import { GENERATION_BATCH_JOB_LIMIT } from '../../shared/projects/generation-batch-policy.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, realpathSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { crc32, deflateSync } from 'node:zlib'

import type { AppDatabase } from '../db/database.js'
import type { QualifiedGenerationBatchItem } from './generation-orchestrator.js'
import type { GenerationWorkerTransport } from './generation-processor.js'
import type { GenerationStagingRepository } from './generation-staging.js'
import type { IllustriousGenerationRequestV1 } from './illustrious-txt2img-job.js'

import { openAppDatabase } from '../db/database.js'
import { CivitaiClient } from '../models/civitai-client.js'
import { CivitaiTokenStore, type SafeStorageAdapter } from '../models/civitai-token-store.js'
import { ModelRepository } from '../models/model-repository.js'
import { ModelService } from '../models/model-service.js'
import { GenerationAcceptanceJournalRepository } from './generation-acceptance-journal.js'
import { recoverGenerationRepositories } from './generation-bootstrap.js'
import { GenerationOrchestrator, GenerationOrchestratorError } from './generation-orchestrator.js'
import { GenerationProcessor } from './generation-processor.js'
import { GenerationQueueRepository } from './generation-queue.js'
import { readIgsPackage } from './igs-package.js'
import { withIllustriousTxt2ImgRequest } from './illustrious-txt2img-job.js'
import { ProjectAutosaveLeaseRegistry } from './project-autosave.js'
import { ProjectGenerationAcceptance } from './project-generation-acceptance.js'
import { ProjectGenerationOperationGate } from './project-generation-operation-gate.js'
import { ProjectGenerationResultResource } from './project-generation-result-resource.js'
import { ProjectIndexRepository } from './project-index.js'
import { ProjectService } from './project-service.js'
import { ProjectShadowStore } from './project-shadow.js'
import { ProjectWorkerClient } from './worker-client.js'

const migrations = path.resolve('src/main/db/migrations')
const placeholders = path.resolve('src/main/projects/placeholders')
const devPython = path.resolve('worker-python/.venv/bin/python')
const iccPath = path.resolve('worker-python/src/imagegen_worker/srgb.icc')
const storage: SafeStorageAdapter = {
  decryptStringAsync: async () => ({ result: '', shouldReEncrypt: false }),
  encryptStringAsync: async () => Buffer.alloc(0),
  getSelectedStorageBackend: () => 'gnome_libsecret',
  isAsyncEncryptionAvailable: async () => true,
}
const qualifiedReady = {
  capabilities: ['illustrious-txt2img'],
  protocolVersion: '1',
  runtimeProfile: 'linux-nvidia',
  workerVersion: '0.2.0',
}

type Fixture = {
  database: AppDatabase
  modelService: ModelService
  orchestrator: GenerationOrchestrator
  outputBytes: Buffer
  processor: GenerationProcessor
  projectIndex: ProjectIndexRepository
  projects: ProjectService
  queue: GenerationQueueRepository
  root: string
  staging: GenerationStagingRepository
  tabId: string
  worker: ProjectWorkerClient
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function devRuntimeRoot(): string | null {
  if (!existsSync(devPython)) {
    return null
  }
  const executableParts = realpathSync(devPython).split(path.sep)
  const requestedParts = devPython.split(path.sep)
  let common = 0
  while (
    common < executableParts.length &&
    common < requestedParts.length &&
    executableParts[common] === requestedParts[common]
  ) {
    common++
  }
  const root = requestedParts.slice(0, common).join(path.sep) || path.sep
  return root === path.sep ? null : root
}

/** A small on-disk safetensors file with the real SDXL anchor shapes, not a model-service stub. */
function structuralSdxlFixture(): Buffer {
  const anchors: readonly [string, readonly number[]][] = [
    ['model.diffusion_model.input_blocks.0.0.weight', [320, 4, 3, 3]],
    ['model.diffusion_model.input_blocks.4.1.transformer_blocks.0.attn2.to_k.weight', [640, 2048]],
    ['model.diffusion_model.out.2.weight', [4, 320, 3, 3]],
    ['conditioner.embedders.0.transformer.text_model.encoder.layers.0.layer_norm1.weight', [768]],
    ['conditioner.embedders.1.model.ln_final.weight', [1280]],
    ['first_stage_model.encoder.conv_in.weight', [128, 3, 3, 3]],
    ['first_stage_model.decoder.conv_out.weight', [3, 128, 3, 3]],
  ]
  const header: Record<string, { data_offsets: [number, number]; dtype: string; shape: number[] }> =
    {}
  let offset = 0
  for (const [key, shape] of anchors) {
    const length = shape.reduce((product, dimension) => product * dimension, 1) * 2
    header[key] = { data_offsets: [offset, offset + length], dtype: 'F16', shape: [...shape] }
    offset += length
  }
  const headerBytes = Buffer.from(JSON.stringify(header), 'utf8')
  const file = Buffer.alloc(8 + headerBytes.length + offset)
  file.writeBigUInt64LE(BigInt(headerBytes.length))
  headerBytes.copy(file, 8)
  return file
}

function pngChunk(name: string, bytes: Buffer): Buffer {
  const tag = Buffer.from(name, 'ascii')
  const chunk = Buffer.alloc(bytes.length + 12)
  chunk.writeUInt32BE(bytes.length, 0)
  tag.copy(chunk, 4)
  bytes.copy(chunk, 8)
  chunk.writeUInt32BE(crc32(Buffer.concat([tag, bytes])), bytes.length + 8)
  return chunk
}

async function opaqueSrgbPng(): Promise<Buffer> {
  const profile = await readFile(iccPath)
  assert.equal(sha256(profile), IGS_SRGB_ICC_SHA256)
  const side = 64
  const header = Buffer.alloc(13)
  header.writeUInt32BE(side, 0)
  header.writeUInt32BE(side, 4)
  header[8] = 8
  header[9] = 6
  const scanlines = Buffer.alloc((1 + side * 4) * side)
  for (let row = 0; row < side; row += 1) {
    for (let column = 0; column < side; column += 1) {
      const pixel = row * (1 + side * 4) + 1 + column * 4
      scanlines[pixel] = 36
      scanlines[pixel + 1] = 93
      scanlines[pixel + 2] = 180
      scanlines[pixel + 3] = 255
    }
  }
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    pngChunk('IHDR', header),
    pngChunk('iCCP', Buffer.concat([Buffer.from('sRGB\0\0'), deflateSync(profile)])),
    pngChunk('IDAT', deflateSync(scanlines)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

async function withFixture(run: (fixture: Fixture) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-generation-orchestrator-'))
  const database = openAppDatabase(root, migrations)
  let worker: ProjectWorkerClient | undefined
  try {
    const scratch = path.join(root, 'scratch')
    await mkdir(scratch)
    const projectIndex = new ProjectIndexRepository(database.db)
    const projects = new ProjectService({
      autosaveOptions: { debounceMs: 0, leaseRegistry: new ProjectAutosaveLeaseRegistry() },
      dataRoot: root,
      repository: projectIndex,
      roots: { placeholdersDir: placeholders, scratchDir: scratch },
      shadow: new ProjectShadowStore(path.join(root, 'autosave')),
    })
    const modelRepository = new ModelRepository(database.db)
    const modelService = new ModelService(
      modelRepository,
      new CivitaiClient(),
      new CivitaiTokenStore(storage, root),
    )
    const checkpointBytes = structuralSdxlFixture()
    const modelPath = path.join(root, 'checkpoint.safetensors')
    await writeFile(modelPath, checkpointBytes)
    const modelSha256 = sha256(checkpointBytes)
    const installed = await modelRepository.publishVerifiedInstallation({
      primary: {
        file: {
          managedPath: modelPath,
          originalFilename: 'checkpoint.safetensors',
          sha256: modelSha256,
          sizeBytes: checkpointBytes.length,
          verifiedAt: '2026-09-28T00:00:00.000Z',
        },
        resource: {
          displayName: 'Structurally qualified fixture',
          source: { kind: 'civitai', modelId: 840 },
          sourceMetadata: {},
          type: 'checkpoint',
        },
        version: {
          baseModelFamily: 'illustrious',
          format: 'safetensors',
          name: 'v1',
          predictionType: 'epsilon',
          source: { expectedSha256: modelSha256, fileId: 842, kind: 'civitai', versionId: 841 },
          sourceMetadata: {},
        },
      },
    })
    const tab = await projects.create({ height: 64, title: 'Orchestrator fixture', width: 64 })
    const model = await modelService.resolveGenerationCheckpoint(
      installed.resourceId,
      installed.versionId,
    )
    await projects.setGenerationModel(tab.id, model)
    await projects.updateGenerationDraft(tab.id, { kind: 'positive-prompt', text: 'blue lantern' })
    await projects.updateGenerationDraft(tab.id, { kind: 'negative-prompt', text: 'blur' })
    await projects.updateGenerationDraft(tab.id, {
      kind: 'sampling-pair',
      sampler: 'DPM++ 2M',
      scheduler: 'Karras',
    })
    await projects.updateGenerationDraft(tab.id, { kind: 'sampling-steps', value: 24 })
    await projects.updateGenerationDraft(tab.id, { kind: 'sampling-cfg-scale', value: 7.5 })
    await projects.updateGenerationDraft(tab.id, { kind: 'seed', policy: 'fixed', value: 42 })
    worker = await ProjectWorkerClient.start(
      {
        pythonExecutable: devPython,
        runtimeRoot: devRuntimeRoot()!,
        stagingBasePath: scratch,
      },
      { requestTimeoutMs: 15_000 },
    )
    const { queue, staging } = await recoverGenerationRepositories(database, root)
    const processor = new GenerationProcessor(queue, staging, modelService, scratch)
    const orchestrator = new GenerationOrchestrator(
      projects,
      projectIndex,
      modelService,
      queue,
      staging,
      processor,
      scratch,
    )
    await run({
      database,
      modelService,
      orchestrator,
      outputBytes: await opaqueSrgbPng(),
      processor,
      projectIndex,
      projects,
      queue,
      root,
      staging,
      tabId: tab.id,
      worker,
    })
  } finally {
    await worker?.close()
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
}

function inferenceTransport(
  outputBytes: Buffer,
  onRequest?: (request: IllustriousGenerationRequestV1) => Promise<void>,
): GenerationWorkerTransport {
  return {
    close: async () => undefined,
    generate: async (request) => {
      await onRequest?.(request)
      await writeFile(request.job.output.pngPath, outputBytes, { flag: 'wx', mode: 0o600 })
      return {
        outputPath: request.job.output.pngPath,
        protocolVersion: '1',
        requestId: request.requestId,
        seed: request.job.sampling.seed,
        type: 'generation-done',
      }
    },
    ready: { ...qualifiedReady, capabilities: [...qualifiedReady.capabilities] },
  }
}

function signal() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function currentDocumentId(fixture: Fixture): string {
  const documentId = fixture.projects.getOpenDocumentId(fixture.tabId)
  assert.ok(documentId)
  return documentId
}

/** One genuine qualified target lease, with already planned concrete seeds/prompts. */
async function withQualifiedBatch<T>(
  fixture: Fixture,
  seeds: readonly number[],
  use: (items: QualifiedGenerationBatchItem[]) => Promise<T>,
): Promise<T> {
  const prepared = await fixture.projects.prepareNormalTxt2ImgContext(
    fixture.tabId,
    fixture.worker,
    fixture.modelService,
  )
  return await withIllustriousTxt2ImgRequest({
    modelService: fixture.modelService,
    prepared,
    ready: qualifiedReady,
    scratchBasePath: path.join(fixture.root, 'scratch'),
    use: async (request) => {
      const items = seeds.map((seed, index) => {
        const context = structuredClone(prepared.context)
        context.sampling.seed = seed
        context.prompts.positive = `blue lantern ${index}`
        const job = structuredClone(request)
        job.requestId = randomUUID()
        job.job.sampling.seed = seed
        job.job.prompts = { ...context.prompts }
        return { prepared: { context, targetPngBytes: prepared.targetPngBytes }, request: job }
      })
      return await use(items)
    },
  })
}

test(
  'qualified batch creates real sibling scope through completion, early Add and portable Save',
  { skip: !devRuntimeRoot() },
  async () => {
    await withFixture(async (fixture) => {
      const indexed = await fixture.projectIndex.getProject(fixture.tabId)
      assert.ok(indexed)
      const packageBefore = await readFile(indexed.canonicalPath)
      const batch = await withQualifiedBatch(
        fixture,
        [42, 43, 44],
        async (items) => await fixture.orchestrator.enqueueBatch(fixture.tabId, items),
      )
      const neighbor = await withQualifiedBatch(
        fixture,
        [71, 72],
        async (items) => await fixture.orchestrator.enqueueBatch(fixture.tabId, items),
      )
      assert.equal(batch.length, 3)
      assert.equal(new Set(batch.map((item) => item.batchId)).size, 1)
      assert.equal(new Set(batch.map((item) => item.stagingSessionId)).size, 1)
      assert.notEqual(neighbor[0].stagingSessionId, batch[0].stagingSessionId)
      for (let index = 0; index < batch.length; index++) {
        const verified = await fixture.queue.loadVerifiedInput(batch[index].id)
        assert.equal(verified.payload.context.sampling.seed, 42 + index)
        assert.equal(verified.payload.context.prompts.positive, `blue lantern ${index}`)
      }
      const transport = inferenceTransport(fixture.outputBytes)
      const completed = await fixture.orchestrator.runNext(transport)
      assert.equal(completed.kind, 'completed')
      const resource = new ProjectGenerationResultResource(
        fixture.staging,
        (key) => fixture.projects.getOpenDocumentId(key),
        fixture.queue,
      )
      const snapshot = await resource.list(fixture.tabId)
      assert.equal(snapshot.candidates.length, 1)
      assert.equal(snapshot.candidates[0].queueItemId, batch[0].id)
      assert.deepEqual(
        snapshot.unfinishedSiblingJobIds,
        batch.slice(1).map((item) => item.id),
      )
      const acceptance = new ProjectGenerationAcceptance({
        documents: { getOpenDocument: (key) => fixture.projects.getOpenDocumentForAcceptance(key) },
        gate: new ProjectGenerationOperationGate(),
        journal: new GenerationAcceptanceJournalRepository(fixture.database.db),
        orchestrator: fixture.orchestrator,
        queue: fixture.queue,
        staging: fixture.staging,
      })
      const selected = snapshot.candidates[0].candidateId
      assert.equal(
        (
          await acceptance.accept(
            fixture.tabId,
            [selected],
            selected,
            [selected],
            snapshot.unfinishedSiblingJobIds,
          )
        ).kind,
        'accepted',
      )
      assert.deepEqual(await readFile(indexed.canonicalPath), packageBefore)
      assert.deepEqual(
        (await fixture.queue.listUnfinishedByProject(fixture.tabId)).map((item) => item.id),
        neighbor.map((item) => item.id),
      )
      assert.deepEqual(await fixture.staging.listVerifiedCandidates(fixture.tabId), [])
      for (const item of batch.slice(1)) {
        assert.equal((await fixture.queue.loadVerifiedInput(item.id)).item.status, 'canceled')
      }
      const save = await fixture.projects.save(fixture.tabId, fixture.worker)
      assert.equal(save.committed, true)
      const saved = await readIgsPackage(indexed.canonicalPath)
      assert.equal(saved.project.layers.length, 1)
      const layer = saved.project.layers[0]
      assert.equal(layer.generationProvenance?.generationConfiguration.sampling.actualSeed, 42)
      assert.equal(layer.generationProvenance?.executionResultContext.candidateId, selected)
      assert.deepEqual(await saved.readMember(layer.asset.path), fixture.outputBytes)
      await fixture.projects.setPrimaryBbox(fixture.tabId, {
        height: 64,
        width: 64,
        x: 128,
        y: 128,
      })
      const later = await withQualifiedBatch(
        fixture,
        [99],
        async (items) => await fixture.orchestrator.enqueueBatch(fixture.tabId, items),
      )
      assert.equal(later[0].status, 'pending')
    })
  },
)

test(
  'batch admission freezes caller data before the asynchronous model verification',
  { skip: !devRuntimeRoot() },
  async () => {
    await withFixture(async (fixture) => {
      await withQualifiedBatch(fixture, [42, 43], async (items) => {
        const original = fixture.modelService.resolveVerifiedGenerationCheckpointForPlan.bind(
          fixture.modelService,
        )
        let changed = false
        fixture.modelService.resolveVerifiedGenerationCheckpointForPlan = async (reference) => {
          if (!changed) {
            changed = true
            items[0].prepared.context.prompts.positive = 'caller replaced prompt'
            items[0].request.job.prompts.positive = 'caller replaced prompt'
            items[0].prepared.targetPngBytes.fill(0)
            items.reverse()
          }
          return await original(reference)
        }
        const queued = await fixture.orchestrator.enqueueBatch(fixture.tabId, items)
        assert.equal(changed, true)
        assert.equal(queued.length, 2)
        const frozen = await fixture.queue.loadVerifiedInput(queued[0].id)
        assert.equal(frozen.payload.context.prompts.positive, 'blue lantern 0')
        assert.equal(frozen.payload.context.sampling.seed, 42)
        assert.notEqual((await readFile(frozen.targetPath))[0], 0)
      })
    })
  },
)

test(
  'batch admission rejects empty and mixed-document groups without queue publication',
  { skip: !devRuntimeRoot() },
  async () => {
    await withFixture(async (fixture) => {
      await assert.rejects(fixture.orchestrator.enqueueBatch(fixture.tabId, []), {
        code: 'GENERATION_BATCH_INVALID',
      })
      await withQualifiedBatch(fixture, [42, 43], async (items) => {
        items[1].prepared.context.documentId = randomUUID()
        await assert.rejects(fixture.orchestrator.enqueueBatch(fixture.tabId, items), {
          code: 'PROJECT_DOCUMENT_CHANGED',
        })
      })
      assert.deepEqual(await fixture.queue.listUnfinishedByProject(fixture.tabId), [])
    })
  },
)

test(
  'a document reassigned after atomic batch commit cancels exactly that group',
  { skip: !devRuntimeRoot() },
  async () => {
    await withFixture(async (fixture) => {
      const neighbor = await fixture.orchestrator.enqueueOne(
        fixture.tabId,
        fixture.worker,
        inferenceTransport(fixture.outputBytes),
      )
      const enqueue = fixture.queue.enqueueIllustriousGenerationBatch.bind(fixture.queue)
      let published: string[] = []
      fixture.queue.enqueueIllustriousGenerationBatch = async (input) => {
        const queued = await enqueue(input)
        published = queued.map((item) => item.id)
        await fixture.database.db
          .updateTable('project_index')
          .set({ document_id: randomUUID() })
          .where('local_project_key', '=', fixture.tabId)
          .execute()
        return queued
      }
      await withQualifiedBatch(fixture, [42, 43, 44], async (items) => {
        await assert.rejects(fixture.orchestrator.enqueueBatch(fixture.tabId, items), {
          code: 'PROJECT_DOCUMENT_CHANGED',
        })
      })
      assert.equal(published.length, 3)
      for (const id of published) {
        assert.equal((await fixture.queue.loadVerifiedInput(id)).item.status, 'canceled')
      }
      assert.equal((await fixture.queue.loadVerifiedInput(neighbor.id)).item.status, 'pending')
      assert.deepEqual(await fixture.staging.listVerifiedCandidates(fixture.tabId), [])
    })
  },
)

test(
  'unconfirmed batch cancellation preserves its fence until confirmed Project close',
  { skip: !devRuntimeRoot() },
  async () => {
    await withFixture(async (fixture) => {
      const enqueue = fixture.queue.enqueueIllustriousGenerationBatch.bind(fixture.queue)
      const cancel = fixture.processor.cancelAndWait.bind(fixture.processor)
      fixture.queue.enqueueIllustriousGenerationBatch = async (input) => {
        const queued = await enqueue(input)
        await fixture.database.db
          .updateTable('project_index')
          .set({ document_id: randomUUID() })
          .where('local_project_key', '=', fixture.tabId)
          .execute()
        return queued
      }
      fixture.processor.cancelAndWait = async () => {
        throw new Error('worker exit unconfirmed')
      }
      await withQualifiedBatch(fixture, [42, 43], async (items) => {
        await assert.rejects(fixture.orchestrator.enqueueBatch(fixture.tabId, items), {
          code: 'CANCELLATION_UNCERTAIN',
        })
      })
      assert.throws(() => fixture.orchestrator.releaseProjectGenerationFence(fixture.tabId), {
        code: 'CANCELLATION_UNCERTAIN',
      })
      assert.equal((await fixture.queue.listUnfinishedByProject(fixture.tabId)).length, 2)
      fixture.processor.cancelAndWait = cancel
      await fixture.orchestrator.cancelProjectJobs(fixture.tabId)
      assert.deepEqual(await fixture.queue.listUnfinishedByProject(fixture.tabId), [])
      assert.throws(() => fixture.orchestrator.releaseProjectGenerationFence(fixture.tabId), {
        code: 'PROJECT_GENERATION_CLOSING',
      })
    })
  },
)

// A concurrent queue owner prepares actual qualified frozen inputs; only the historical document
// or session identity is varied. This does not substitute the cancellation or SQLite boundary.
async function enqueueScopedFixture(
  fixture: Fixture,
  queue: GenerationQueueRepository,
  documentId: string,
  stagingSessionId: string,
  projectPath?: string,
) {
  const prepared = await fixture.projects.prepareNormalTxt2ImgContext(
    fixture.tabId,
    fixture.worker,
    fixture.modelService,
  )
  prepared.context.documentId = documentId
  const indexed = await fixture.projectIndex.getProject(fixture.tabId)
  assert.ok(indexed)
  return await withIllustriousTxt2ImgRequest({
    modelService: fixture.modelService,
    prepared,
    ready: qualifiedReady,
    scratchBasePath: path.join(fixture.root, 'scratch'),
    use: async (request) =>
      await queue.enqueueIllustriousTxt2Img({
        prepared,
        projectPath: projectPath ?? indexed.canonicalPath,
        request,
        stagingSessionId,
      }),
  })
}

test(
  'acceptance cancellation requires a fence and exact document/session/job ownership',
  { skip: !devRuntimeRoot() },
  async () => {
    await withFixture(async (fixture) => {
      const transport = inferenceTransport(fixture.outputBytes)
      const documentId = currentDocumentId(fixture)
      await assert.rejects(
        fixture.orchestrator.cancelAcceptanceJobs(fixture.tabId, documentId, [], []),
        { code: 'PROJECT_NOT_FENCED' },
      )
      const completed = await fixture.orchestrator.enqueueOne(
        fixture.tabId,
        fixture.worker,
        transport,
      )
      assert.equal((await fixture.orchestrator.runNext(transport)).kind, 'completed')
      const pending = await fixture.orchestrator.enqueueOne(
        fixture.tabId,
        fixture.worker,
        transport,
      )
      const otherSession = await fixture.orchestrator.enqueueOne(
        fixture.tabId,
        fixture.worker,
        transport,
      )
      const foreignDocument = await enqueueScopedFixture(
        fixture,
        fixture.queue,
        randomUUID(),
        pending.stagingSessionId,
      )
      const otherPath = path.join(fixture.root, 'Other.igs')
      await writeFile(otherPath, 'foreign project fixture')
      const foreignProject = await enqueueScopedFixture(
        fixture,
        fixture.queue,
        documentId,
        pending.stagingSessionId,
        otherPath,
      )
      await fixture.orchestrator.fenceProjectGeneration(fixture.tabId)
      const before = await fixture.database.db
        .selectFrom('generation_queue_item')
        .selectAll()
        .orderBy('id')
        .execute()
      await assert.rejects(
        fixture.orchestrator.cancelAcceptanceJobs(
          fixture.tabId,
          randomUUID(),
          [pending.stagingSessionId],
          [pending.id],
        ),
        { code: 'PROJECT_DOCUMENT_CHANGED' },
      )
      for (const foreign of [otherSession, foreignDocument, foreignProject]) {
        await assert.rejects(
          fixture.orchestrator.cancelAcceptanceJobs(
            fixture.tabId,
            documentId,
            [pending.stagingSessionId],
            [pending.id, foreign.id],
          ),
          { code: 'CANCELLATION_UNCERTAIN' },
        )
      }
      await assert.rejects(
        fixture.orchestrator.cancelAcceptanceJobs(
          fixture.tabId,
          documentId,
          [pending.stagingSessionId],
          [],
        ),
        { code: 'CANCELLATION_UNCERTAIN' },
      )
      assert.deepEqual(
        await fixture.database.db
          .selectFrom('generation_queue_item')
          .selectAll()
          .orderBy('id')
          .execute(),
        before,
      )
      // Cancellation ownership comes from the open document, even if the disk-derived index is stale.
      await fixture.database.db
        .updateTable('project_index')
        .set({ document_id: randomUUID() })
        .where('local_project_key', '=', fixture.tabId)
        .execute()
      await fixture.orchestrator.cancelAcceptanceJobs(
        fixture.tabId,
        documentId,
        [pending.stagingSessionId],
        [pending.id, completed.id],
      )
      assert.equal((await fixture.queue.loadVerifiedInput(pending.id)).item.status, 'canceled')
      for (const foreign of [otherSession, foreignDocument, foreignProject]) {
        assert.equal((await fixture.queue.loadVerifiedInput(foreign.id)).item.status, 'pending')
      }
      assert.equal((await fixture.staging.listVerifiedCandidates(fixture.tabId)).length, 1)
      fixture.orchestrator.releaseProjectGenerationFence(fixture.tabId)
    })
  },
)

test(
  'acceptance cancellation waits for running worker exit, ignores late done, and releases admission',
  { skip: !devRuntimeRoot() },
  async () => {
    await withFixture(async (fixture) => {
      assert.equal(typeof fixture.orchestrator.cancelAcceptanceJobs, 'function')
      const dispatched = signal()
      const lateDone = signal()
      const doneReturned = signal()
      const closing = signal()
      const exited = signal()
      const base = inferenceTransport(fixture.outputBytes, async () => {
        dispatched.resolve()
        await lateDone.promise
      })
      const transport: GenerationWorkerTransport = {
        ...base,
        close: async () => {
          closing.resolve()
          await exited.promise
        },
        generate: async (request) => {
          const response = await base.generate(request)
          doneReturned.resolve()
          return response
        },
      }
      const running = await fixture.orchestrator.enqueueOne(
        fixture.tabId,
        fixture.worker,
        transport,
      )
      const pending = await fixture.orchestrator.enqueueOne(
        fixture.tabId,
        fixture.worker,
        transport,
      )
      const unrelated = await fixture.orchestrator.enqueueOne(
        fixture.tabId,
        fixture.worker,
        transport,
      )
      const run = fixture.orchestrator.runNext(transport)
      await dispatched.promise
      await fixture.orchestrator.fenceProjectGeneration(fixture.tabId)
      let settled = false
      const sessions = [running.stagingSessionId, pending.stagingSessionId]
      const ids = [running.id, pending.id]
      const cancel = fixture.orchestrator.cancelAcceptanceJobs(
        fixture.tabId,
        currentDocumentId(fixture),
        sessions,
        ids,
      )
      // The caller cannot widen the confirmed set by mutating its arrays while exit is awaited.
      sessions.push(unrelated.stagingSessionId)
      ids.push(unrelated.id)
      void cancel.then(() => {
        settled = true
      })
      await closing.promise
      assert.equal(settled, false)
      const duplicate = fixture.orchestrator.cancelAcceptanceJobs(
        fixture.tabId,
        currentDocumentId(fixture),
        [pending.stagingSessionId, running.stagingSessionId],
        [pending.id, running.id],
      )
      await assert.rejects(
        fixture.orchestrator.cancelAcceptanceJobs(
          fixture.tabId,
          currentDocumentId(fixture),
          [unrelated.stagingSessionId],
          [unrelated.id],
        ),
        { code: 'CANCELLATION_UNCERTAIN' },
      )
      await assert.rejects(fixture.orchestrator.cancelProjectJobs(fixture.tabId), {
        code: 'CANCELLATION_UNCERTAIN',
      })
      assert.throws(() => fixture.orchestrator.releaseProjectGenerationFence(fixture.tabId), {
        code: 'CANCELLATION_UNCERTAIN',
      })
      assert.equal((await fixture.queue.loadVerifiedInput(running.id)).item.status, 'running')
      lateDone.resolve()
      await doneReturned.promise
      assert.deepEqual(await fixture.staging.listVerifiedCandidates(fixture.tabId), [])
      exited.resolve()
      await cancel
      await duplicate
      assert.deepEqual(await run, { kind: 'canceled', queueItemId: running.id })
      for (const item of [running, pending]) {
        assert.equal((await fixture.queue.loadVerifiedInput(item.id)).item.status, 'canceled')
      }
      assert.equal((await fixture.queue.loadVerifiedInput(unrelated.id)).item.status, 'pending')
      assert.deepEqual(await fixture.staging.listVerifiedCandidates(fixture.tabId), [])
      fixture.orchestrator.releaseProjectGenerationFence(fixture.tabId)
      const next = await fixture.orchestrator.enqueueOne(
        fixture.tabId,
        fixture.worker,
        inferenceTransport(fixture.outputBytes),
      )
      assert.equal(next.status, 'pending')
    })
  },
)

test(
  'acceptance cancellation allows a confirmed running job to finish naturally during its scope read',
  { skip: !devRuntimeRoot() },
  async () => {
    await withFixture(async (fixture) => {
      assert.equal(typeof fixture.orchestrator.cancelAcceptanceJobs, 'function')
      const dispatched = signal()
      const done = signal()
      const listed = signal()
      const continueRead = signal()
      let closeCalls = 0
      const transport = inferenceTransport(fixture.outputBytes, async () => {
        dispatched.resolve()
        await done.promise
      })
      transport.close = async () => {
        closeCalls += 1
      }
      const queued = await fixture.orchestrator.enqueueOne(fixture.tabId, fixture.worker, transport)
      const run = fixture.orchestrator.runNext(transport)
      await dispatched.promise
      await fixture.orchestrator.fenceProjectGeneration(fixture.tabId)
      const list = fixture.queue.listUnfinishedByProjectDocument.bind(fixture.queue)
      let reads = 0
      fixture.queue.listUnfinishedByProjectDocument = async (...args) => {
        const snapshot = await list(...args)
        if (++reads === 1) {
          listed.resolve()
          await continueRead.promise
        }
        return snapshot
      }
      const cancel = fixture.orchestrator.cancelAcceptanceJobs(
        fixture.tabId,
        currentDocumentId(fixture),
        [queued.stagingSessionId],
        [queued.id],
      )
      await listed.promise
      done.resolve()
      const completed = await run
      assert.equal(completed.kind, 'completed')
      assert.equal('queueItemId' in completed && completed.queueItemId, queued.id)
      continueRead.resolve()
      await cancel
      assert.equal(closeCalls, 0)
      assert.equal((await fixture.queue.loadVerifiedInput(queued.id)).item.status, 'completed')
      assert.equal((await fixture.staging.listVerifiedCandidates(fixture.tabId)).length, 1)
      fixture.orchestrator.releaseProjectGenerationFence(fixture.tabId)
    })
  },
)

test(
  'acceptance cancellation retains an uncertain worker fence until the same scope retries successfully',
  { skip: !devRuntimeRoot() },
  async () => {
    await withFixture(async (fixture) => {
      assert.equal(typeof fixture.orchestrator.cancelAcceptanceJobs, 'function')
      const dispatched = signal()
      let attempts = 0
      const transport: GenerationWorkerTransport = {
        close: async () => {
          if (++attempts === 1) {
            throw new Error('exit unconfirmed')
          }
        },
        generate: async () => {
          dispatched.resolve()
          return await new Promise<never>(() => undefined)
        },
        ready: { ...qualifiedReady, capabilities: [...qualifiedReady.capabilities] },
      }
      const running = await fixture.orchestrator.enqueueOne(
        fixture.tabId,
        fixture.worker,
        transport,
      )
      const run = fixture.orchestrator.runNext(transport)
      const failedRun = assert.rejects(run, { code: 'WORKER_EXIT_UNCONFIRMED' })
      await dispatched.promise
      await fixture.orchestrator.fenceProjectGeneration(fixture.tabId)
      const documentId = currentDocumentId(fixture)
      await assert.rejects(
        fixture.orchestrator.cancelAcceptanceJobs(
          fixture.tabId,
          documentId,
          [running.stagingSessionId],
          [running.id],
        ),
        /exit unconfirmed/,
      )
      await failedRun
      assert.throws(() => fixture.orchestrator.releaseProjectGenerationFence(fixture.tabId), {
        code: 'CANCELLATION_UNCERTAIN',
      })
      await assert.rejects(
        fixture.orchestrator.cancelAcceptanceJobs(fixture.tabId, documentId, [], []),
        { code: 'CANCELLATION_UNCERTAIN' },
      )
      assert.throws(() => fixture.orchestrator.reopenProjectGeneration(fixture.tabId), {
        code: 'PROJECT_GENERATION_CLOSING',
      })
      assert.equal((await fixture.queue.loadVerifiedInput(running.id)).item.status, 'running')
      await fixture.orchestrator.cancelAcceptanceJobs(
        fixture.tabId,
        documentId,
        [running.stagingSessionId],
        [running.id],
      )
      assert.equal(attempts, 2)
      assert.equal((await fixture.queue.loadVerifiedInput(running.id)).item.status, 'canceled')
      fixture.orchestrator.releaseProjectGenerationFence(fixture.tabId)
      assert.equal(
        (
          await fixture.orchestrator.enqueueOne(
            fixture.tabId,
            fixture.worker,
            inferenceTransport(fixture.outputBytes),
          )
        ).status,
        'pending',
      )
    })
  },
)

test(
  'acceptance cancellation rechecks newly unconfirmed jobs before its first mutation',
  { skip: !devRuntimeRoot() },
  async () => {
    await withFixture(async (fixture) => {
      assert.equal(typeof fixture.orchestrator.cancelAcceptanceJobs, 'function')
      const concurrent = new GenerationQueueRepository(fixture.database.db, fixture.root)
      await concurrent.recoverAfterRestart()
      const pending = await fixture.orchestrator.enqueueOne(
        fixture.tabId,
        fixture.worker,
        inferenceTransport(fixture.outputBytes),
      )
      const documentId = currentDocumentId(fixture)
      await fixture.orchestrator.fenceProjectGeneration(fixture.tabId)
      const list = fixture.queue.listUnfinishedByProjectDocument.bind(fixture.queue)
      let added: Awaited<ReturnType<typeof enqueueScopedFixture>> | undefined
      fixture.queue.listUnfinishedByProjectDocument = async (...args) => {
        const snapshot = await list(...args)
        if (!added) {
          added = await enqueueScopedFixture(
            fixture,
            concurrent,
            documentId,
            pending.stagingSessionId,
          )
        }
        return snapshot
      }
      await assert.rejects(
        fixture.orchestrator.cancelAcceptanceJobs(
          fixture.tabId,
          documentId,
          [pending.stagingSessionId],
          [pending.id],
        ),
        { code: 'CANCELLATION_UNCERTAIN' },
      )
      assert.ok(added)
      assert.equal((await fixture.queue.loadVerifiedInput(pending.id)).item.status, 'pending')
      assert.equal((await fixture.queue.loadVerifiedInput(added.id)).item.status, 'pending')
      assert.throws(() => fixture.orchestrator.releaseProjectGenerationFence(fixture.tabId), {
        code: 'CANCELLATION_UNCERTAIN',
      })
      await fixture.orchestrator.cancelAcceptanceJobs(
        fixture.tabId,
        documentId,
        [pending.stagingSessionId],
        [pending.id, added.id],
      )
      fixture.orchestrator.releaseProjectGenerationFence(fixture.tabId)
    })
  },
)

test(
  'acceptance cancellation refuses newly unconfirmed jobs after awaiting worker exit',
  { skip: !devRuntimeRoot() },
  async () => {
    await withFixture(async (fixture) => {
      assert.equal(typeof fixture.orchestrator.cancelAcceptanceJobs, 'function')
      const concurrent = new GenerationQueueRepository(fixture.database.db, fixture.root)
      await concurrent.recoverAfterRestart()
      const dispatched = signal()
      const closing = signal()
      const exited = signal()
      const transport: GenerationWorkerTransport = {
        close: async () => {
          closing.resolve()
          await exited.promise
        },
        generate: async () => {
          dispatched.resolve()
          return await new Promise<never>(() => undefined)
        },
        ready: { ...qualifiedReady, capabilities: [...qualifiedReady.capabilities] },
      }
      const running = await fixture.orchestrator.enqueueOne(
        fixture.tabId,
        fixture.worker,
        transport,
      )
      const run = fixture.orchestrator.runNext(transport)
      await dispatched.promise
      await fixture.orchestrator.fenceProjectGeneration(fixture.tabId)
      const documentId = currentDocumentId(fixture)
      const cancel = fixture.orchestrator.cancelAcceptanceJobs(
        fixture.tabId,
        documentId,
        [running.stagingSessionId],
        [running.id],
      )
      const refused = assert.rejects(cancel, { code: 'CANCELLATION_UNCERTAIN' })
      await closing.promise
      const added = await enqueueScopedFixture(
        fixture,
        concurrent,
        documentId,
        running.stagingSessionId,
      )
      exited.resolve()
      await refused
      assert.deepEqual(await run, { kind: 'canceled', queueItemId: running.id })
      assert.equal((await fixture.queue.loadVerifiedInput(added.id)).item.status, 'pending')
      assert.throws(() => fixture.orchestrator.releaseProjectGenerationFence(fixture.tabId), {
        code: 'CANCELLATION_UNCERTAIN',
      })
      await fixture.orchestrator.cancelAcceptanceJobs(
        fixture.tabId,
        documentId,
        [running.stagingSessionId],
        [running.id, added.id],
      )
      fixture.orchestrator.releaseProjectGenerationFence(fixture.tabId)
    })
  },
)

test(
  'open Project generates through real composition, qualified model, durable queue and staging',
  { skip: !devRuntimeRoot() },
  async () => {
    await withFixture(async (fixture) => {
      const transport = inferenceTransport(fixture.outputBytes, async (request) => {
        assert.equal(request.job.prompts.positive, 'blue lantern')
        assert.equal(request.job.checkpoint.predictionType, 'epsilon')
        assert.equal(request.job.bbox.width, 64)
      })
      const indexed = await fixture.projectIndex.getProject(fixture.tabId)
      assert.ok(indexed)
      assert.ok(indexed.documentId)
      const originalIgs = await readFile(indexed.canonicalPath)
      const enqueued = await fixture.orchestrator.enqueueOne(
        fixture.tabId,
        fixture.worker,
        transport,
      )
      const frozen = await fixture.queue.loadVerifiedInput(enqueued.id)
      assert.equal(frozen.item.status, 'pending')
      assert.equal(frozen.payload.context.documentId, indexed.documentId)
      assert.equal(frozen.payload.context.prompts.positive, 'blue lantern')
      assert.equal(frozen.payload.context.sampling.seed, 42)
      const processed = await fixture.orchestrator.runNext(transport)
      assert.equal(processed.kind, 'completed')
      if (processed.kind !== 'completed') {
        throw new Error('The qualified job was not completed.')
      }
      assert.equal(processed.queueItemId, enqueued.id)
      assert.equal(processed.candidate.actualSeed, 42)
      assert.deepEqual(await readFile(indexed.canonicalPath), originalIgs)
      assert.equal(await fixture.staging.readLastActualSeed(fixture.tabId, indexed.documentId), 42)

      // Reopen the same SQLite/filesystem state: completion is recoverable without accepting it
      // into the portable Project package.
      const { staging: reopenedStaging } = await recoverGenerationRepositories(
        fixture.database,
        fixture.root,
      )
      const candidates = await reopenedStaging.listVerifiedCandidates(fixture.tabId)
      assert.equal(candidates.length, 1)
      assert.equal(candidates[0]?.candidateId, enqueued.id)
      assert.equal(candidates[0]?.image.sha256, sha256(fixture.outputBytes))
    })
  },
)

test(
  'Reuse rejects an empty Project cursor and freezes the completed local seed in the durable queue',
  { skip: !devRuntimeRoot() },
  async () => {
    await withFixture(async (fixture) => {
      const transport = inferenceTransport(fixture.outputBytes)
      await fixture.projects.updateGenerationDraft(fixture.tabId, {
        kind: 'seed',
        policy: 'reuse',
        value: null,
      })
      await assert.rejects(
        fixture.orchestrator.enqueueOne(fixture.tabId, fixture.worker, transport),
        { code: 'GENERATION_SEED_UNAVAILABLE' },
      )
      assert.deepEqual(
        await fixture.database.db.selectFrom('generation_queue_item').selectAll().execute(),
        [],
      )

      await fixture.projects.updateGenerationDraft(fixture.tabId, {
        kind: 'seed',
        policy: 'fixed',
        value: 0,
      })
      await fixture.orchestrator.enqueueOne(fixture.tabId, fixture.worker, transport)
      assert.equal((await fixture.orchestrator.runNext(transport)).kind, 'completed')
      const indexed = await fixture.projectIndex.getProject(fixture.tabId)
      assert.ok(indexed?.documentId)
      assert.equal(await fixture.staging.readLastActualSeed(fixture.tabId, indexed.documentId), 0)

      await fixture.projects.updateGenerationDraft(fixture.tabId, {
        kind: 'seed',
        policy: 'reuse',
        value: null,
      })
      const reused = await fixture.orchestrator.enqueueOne(fixture.tabId, fixture.worker, transport)
      const frozen = await fixture.queue.loadVerifiedInput(reused.id)
      assert.equal(frozen.payload.context.sampling.requestedSeedPolicy, 'reuse')
      assert.equal(frozen.payload.context.sampling.seed, 0)

      await fixture.projects.updateGenerationDraft(fixture.tabId, {
        kind: 'seed',
        policy: 'fixed',
        value: 99,
      })
      await fixture.orchestrator.enqueueOne(fixture.tabId, fixture.worker, transport)
      assert.equal((await fixture.orchestrator.runNext(transport)).kind, 'completed')
      assert.equal((await fixture.orchestrator.runNext(transport)).kind, 'completed')
      assert.equal(await fixture.staging.readLastActualSeed(fixture.tabId, indexed.documentId), 99)
      const stillFrozen = await fixture.queue.loadVerifiedInput(reused.id)
      assert.equal(stillFrozen.payload.context.sampling.requestedSeedPolicy, 'reuse')
      assert.equal(stillFrozen.payload.context.sampling.seed, 0)
    })
  },
)

test(
  'Project close fence preserves pending work until confirmation, then cancels only its jobs',
  { skip: !devRuntimeRoot() },
  async () => {
    await withFixture(async (fixture) => {
      const transport = inferenceTransport(fixture.outputBytes)
      const queued = await fixture.orchestrator.enqueueOne(fixture.tabId, fixture.worker, transport)
      await fixture.orchestrator.fenceProjectGeneration(fixture.tabId)
      assert.equal((await fixture.queue.loadVerifiedInput(queued.id)).item.status, 'pending')
      await assert.rejects(
        fixture.orchestrator.enqueueOne(fixture.tabId, fixture.worker, transport),
        (error: unknown) =>
          error instanceof GenerationOrchestratorError &&
          error.code === 'PROJECT_GENERATION_CLOSING',
      )
      assert.deepEqual(await fixture.orchestrator.runNext(transport), { kind: 'idle' })

      // A declined close lifts admission without touching the durable input or its worker slot.
      fixture.orchestrator.releaseProjectGenerationFence(fixture.tabId)
      assert.equal((await fixture.queue.loadVerifiedInput(queued.id)).item.status, 'pending')
      await fixture.orchestrator.fenceProjectGeneration(fixture.tabId)
      await fixture.orchestrator.cancelProjectJobs(fixture.tabId)
      assert.equal((await fixture.queue.loadVerifiedInput(queued.id)).item.status, 'canceled')
      await assert.rejects(
        async () => fixture.orchestrator.releaseProjectGenerationFence(fixture.tabId),
        (error: unknown) =>
          error instanceof GenerationOrchestratorError &&
          error.code === 'PROJECT_GENERATION_CLOSING',
      )

      assert.throws(() => fixture.orchestrator.reopenProjectGeneration(fixture.tabId), {
        code: 'PROJECT_GENERATION_CLOSING',
      })
      assert.throws(() => fixture.orchestrator.completeProjectGenerationClose(fixture.tabId), {
        code: 'PROJECT_GENERATION_CLOSING',
      })

      await fixture.projects.save(fixture.tabId, fixture.worker)
      await fixture.projects.close(fixture.tabId)
      fixture.orchestrator.completeProjectGenerationClose(fixture.tabId)
      assert.throws(() => fixture.orchestrator.reopenProjectGeneration(fixture.tabId), {
        code: 'PROJECT_NOT_OPEN',
      })
      const reopened = await fixture.projects.open(fixture.tabId)
      assert.equal(reopened.kind, 'opened')
      fixture.orchestrator.reopenProjectGeneration(fixture.tabId)
      const next = await fixture.orchestrator.enqueueOne(fixture.tabId, fixture.worker, transport)
      assert.equal((await fixture.queue.loadVerifiedInput(next.id)).item.status, 'pending')
      assert.notEqual(next.stagingSessionId, queued.stagingSessionId)
    })
  },
)

test(
  'Project close retains its fence and running slot after unconfirmed worker exit, then retries',
  { skip: !devRuntimeRoot() },
  async () => {
    await withFixture(async (fixture) => {
      let entered!: () => void
      const dispatched = new Promise<void>((resolve) => {
        entered = resolve
      })
      let closeAttempts = 0
      const transport: GenerationWorkerTransport = {
        close: async () => {
          closeAttempts += 1
          if (closeAttempts === 1) {
            throw new Error('worker exit was not confirmed')
          }
        },
        generate: async () => {
          entered()
          return await new Promise<never>(() => undefined)
        },
        ready: { ...qualifiedReady, capabilities: [...qualifiedReady.capabilities] },
      }
      const queued = await fixture.orchestrator.enqueueOne(fixture.tabId, fixture.worker, transport)
      const run = fixture.orchestrator.runNext(transport)
      const failedRun = assert.rejects(run, {
        code: 'WORKER_EXIT_UNCONFIRMED',
      })
      await dispatched
      await assert.rejects(
        fixture.orchestrator.closeProjectGeneration(fixture.tabId),
        /worker exit was not confirmed/,
      )
      await failedRun
      const uncertain = await fixture.queue.loadVerifiedInput(queued.id)
      assert.equal(uncertain.item.status, 'running')
      assert.equal(uncertain.item.cancelRequested, true)
      await assert.rejects(
        fixture.orchestrator.enqueueOne(fixture.tabId, fixture.worker, transport),
        { code: 'PROJECT_GENERATION_CLOSING' },
      )
      assert.deepEqual(await fixture.staging.listVerifiedCandidates(fixture.tabId), [])

      await fixture.orchestrator.closeProjectGeneration(fixture.tabId)
      assert.equal((await fixture.queue.loadVerifiedInput(queued.id)).item.status, 'canceled')
      assert.equal(closeAttempts, 2)
    })
  },
)

test(
  'an indexed Project identity mismatch blocks enqueue before a worker request',
  {
    skip: !devRuntimeRoot(),
  },
  async () => {
    await withFixture(async (fixture) => {
      const actual = await fixture.projectIndex.getProject(fixture.tabId)
      assert.ok(actual)
      await fixture.database.db
        .updateTable('project_index')
        .set({ document_id: '00000000-0000-4000-8000-000000000000' })
        .where('local_project_key', '=', fixture.tabId)
        .execute()
      const transport = inferenceTransport(fixture.outputBytes, async () => {
        assert.fail('an identity mismatch must not reach inference')
      })
      await assert.rejects(
        fixture.orchestrator.enqueueOne(fixture.tabId, fixture.worker, transport),
        (error: unknown) =>
          error instanceof GenerationOrchestratorError && error.code === 'PROJECT_DOCUMENT_CHANGED',
      )
      assert.equal((await fixture.staging.listVerifiedCandidates(fixture.tabId)).length, 0)
      assert.deepEqual(
        await fixture.database.db.selectFrom('generation_queue_item').selectAll().execute(),
        [],
      )
    })
  },
)

test(
  'a derivative-only transport cannot enqueue a generated result',
  {
    skip: !devRuntimeRoot(),
  },
  async () => {
    await withFixture(async (fixture) => {
      const transport = inferenceTransport(fixture.outputBytes)
      transport.ready.capabilities = []
      await assert.rejects(
        fixture.orchestrator.enqueueOne(fixture.tabId, fixture.worker, transport),
        (error: unknown) =>
          error instanceof Error &&
          /not qualified|not.*capabil|not.*Illustrious/.test(error.message),
      )
      assert.deepEqual(
        await fixture.database.db.selectFrom('generation_queue_item').selectAll().execute(),
        [],
      )
    })
  },
)

test(
  'dispatch waits for post-enqueue Project validation and a closed tab cancels its row',
  {
    skip: !devRuntimeRoot(),
  },
  async () => {
    await withFixture(async (fixture) => {
      let published!: () => void
      let release!: () => void
      const publication = new Promise<void>((resolve) => {
        published = resolve
      })
      const held = new Promise<void>((resolve) => {
        release = resolve
      })
      const queue = new GenerationQueueRepository(fixture.database.db, fixture.root, {
        afterInputPublish: async () => {
          published()
          await held
        },
      })
      await queue.recoverAfterRestart()
      const processor = new GenerationProcessor(
        queue,
        fixture.staging,
        fixture.modelService,
        path.join(fixture.root, 'scratch'),
      )
      const orchestrator = new GenerationOrchestrator(
        fixture.projects,
        fixture.projectIndex,
        fixture.modelService,
        queue,
        fixture.staging,
        processor,
        path.join(fixture.root, 'scratch'),
      )
      const transport = inferenceTransport(fixture.outputBytes, async () => {
        assert.fail('a closed Project must not reach inference')
      })
      const enqueue = orchestrator.enqueueOne(fixture.tabId, fixture.worker, transport)
      await publication
      const dispatch = orchestrator.runNext(transport)
      try {
        await fixture.projects.discardAndClose(fixture.tabId)
      } finally {
        release()
      }
      await assert.rejects(
        enqueue,
        (error: unknown) =>
          error instanceof GenerationOrchestratorError && error.code === 'PROJECT_NOT_OPEN',
      )
      assert.deepEqual(await dispatch, { kind: 'idle' })
      const rows = await fixture.database.db
        .selectFrom('generation_queue_item')
        .selectAll()
        .execute()
      assert.equal(rows.length, 1)
      assert.equal(rows[0]?.status, 'canceled')
      assert.equal(rows[0]?.error_code, 'USER_CANCELED')
      assert.deepEqual(await fixture.staging.listVerifiedCandidates(fixture.tabId), [])
    })
  },
)

test(
  'an unreconciled queue cannot compose or publish a Project job',
  {
    skip: !devRuntimeRoot(),
  },
  async () => {
    await withFixture(async (fixture) => {
      const queue = new GenerationQueueRepository(fixture.database.db, fixture.root)
      const processor = new GenerationProcessor(
        queue,
        fixture.staging,
        fixture.modelService,
        path.join(fixture.root, 'scratch'),
      )
      const orchestrator = new GenerationOrchestrator(
        fixture.projects,
        fixture.projectIndex,
        fixture.modelService,
        queue,
        fixture.staging,
        processor,
        path.join(fixture.root, 'scratch'),
      )
      await assert.rejects(
        orchestrator.enqueueOne(
          fixture.tabId,
          fixture.worker,
          inferenceTransport(fixture.outputBytes),
        ),
        {
          code: 'QUEUE_NOT_RECONCILED',
        },
      )
      assert.deepEqual(
        await fixture.database.db.selectFrom('generation_queue_item').selectAll().execute(),
        [],
      )
    })
  },
)

test(
  'prepared batch plans concrete pairs through completion, early Add and portable seed behavior',
  { skip: !devRuntimeRoot() },
  async () => {
    await withFixture(async (fixture) => {
      await fixture.projects.updateGenerationDraft(fixture.tabId, {
        kind: 'positive-prompt',
        text: '{red|blue} lantern',
      })
      await fixture.projects.updateGenerationDraft(fixture.tabId, {
        kind: 'negative-prompt',
        text: '{blur|noise}',
      })
      await fixture.projects.updateGenerationDraft(fixture.tabId, {
        kind: 'seed',
        policy: 'fixed',
        value: 0xff_ff_ff_fe,
      })
      const prepared = await fixture.projects.prepareNormalTxt2ImgContext(
        fixture.tabId,
        fixture.worker,
        fixture.modelService,
      )
      const indexed = await fixture.projectIndex.getProject(fixture.tabId)
      assert.ok(indexed)
      const before = await readFile(indexed.canonicalPath)
      const admitted = await fixture.orchestrator.enqueuePreparedBatch(
        fixture.tabId,
        prepared,
        {
          iterations: 2,
          maxPrompts: 3,
          seedBehavior: 'per-prompt',
        },
        inferenceTransport(fixture.outputBytes),
      )
      assert.equal(admitted.plan.truncated, true)
      assert.equal(admitted.items.length, 6)
      assert.equal(new Set(admitted.items.map((item) => item.batchId)).size, 1)
      const expected = [
        ['red lantern', 'blur', 0xff_ff_ff_fe],
        ['red lantern', 'blur', 0xff_ff_ff_ff],
        ['red lantern', 'noise', 0],
        ['red lantern', 'noise', 1],
        ['blue lantern', 'blur', 2],
        ['blue lantern', 'blur', 3],
      ]
      for (const [index, item] of admitted.items.entries()) {
        const { payload } = await fixture.queue.loadVerifiedInput(item.id)
        assert.deepEqual(
          [
            payload.context.prompts.positive,
            payload.context.prompts.negative,
            payload.context.sampling.seed,
          ],
          expected[index],
        )
        assert.equal(payload.context.sampling.requestedSeedPolicy, 'fixed')
        assert.equal(payload.context.sampling.seedBehavior, 'per-prompt')
        assert.equal(Object.hasOwn(payload.workerJob.sampling, 'seedBehavior'), false)
      }
      const completed = await fixture.orchestrator.runNext(inferenceTransport(fixture.outputBytes))
      assert.equal(completed.kind, 'completed')
      const resource = new ProjectGenerationResultResource(
        fixture.staging,
        (key) => fixture.projects.getOpenDocumentId(key),
        fixture.queue,
      )
      const snapshot = await resource.list(fixture.tabId)
      assert.equal(snapshot.unfinishedSiblingJobIds.length, 5)
      const selected = snapshot.candidates[0].candidateId
      const acceptance = new ProjectGenerationAcceptance({
        documents: { getOpenDocument: (key) => fixture.projects.getOpenDocumentForAcceptance(key) },
        gate: new ProjectGenerationOperationGate(),
        journal: new GenerationAcceptanceJournalRepository(fixture.database.db),
        orchestrator: fixture.orchestrator,
        queue: fixture.queue,
        staging: fixture.staging,
      })
      assert.equal(
        (
          await acceptance.accept(
            fixture.tabId,
            [selected],
            selected,
            [selected],
            snapshot.unfinishedSiblingJobIds,
          )
        ).kind,
        'accepted',
      )
      assert.deepEqual(await readFile(indexed.canonicalPath), before)
      assert.equal((await fixture.projects.save(fixture.tabId, fixture.worker)).committed, true)
      const saved = await readIgsPackage(indexed.canonicalPath)
      const provenance = saved.project.layers[0].generationProvenance
      assert.ok(provenance)
      assert.equal(provenance.generationConfiguration.sampling.seedBehavior, 'per-prompt')
      assert.equal(provenance.generationConfiguration.sampling.actualSeed, 0xff_ff_ff_fe)
      assert.equal(provenance.generationConfiguration.positivePrompt.text, 'red lantern')
      assert.equal(provenance.generationConfiguration.negativePrompt.text, 'blur')
      assert.equal(saved.project.generationDraft.positivePrompt.text, '{red|blue} lantern')
      assert.deepEqual(
        await saved.readMember(saved.project.layers[0].asset.path),
        fixture.outputBytes,
      )
    })
  },
)

test(
  'prepared batch uses one Random base and per-iteration uint32 seeds',
  { skip: !devRuntimeRoot() },
  async () => {
    await withFixture(async (fixture) => {
      await fixture.projects.updateGenerationDraft(fixture.tabId, {
        kind: 'positive-prompt',
        text: '{red|blue}',
      })
      await fixture.projects.updateGenerationDraft(fixture.tabId, {
        kind: 'seed',
        policy: 'random',
        value: null,
      })
      let picks = 0
      const prepared = await fixture.projects.prepareNormalTxt2ImgContext(
        fixture.tabId,
        fixture.worker,
        fixture.modelService,
        () => {
          picks++
          return 0xff_ff_ff_ff
        },
      )
      const admitted = await fixture.orchestrator.enqueuePreparedBatch(
        fixture.tabId,
        prepared,
        { iterations: 2, maxPrompts: 4, seedBehavior: 'per-iteration' },
        inferenceTransport(fixture.outputBytes),
      )
      assert.equal(picks, 1)
      assert.deepEqual(
        admitted.plan.items.map((item) => item.seed),
        [0xff_ff_ff_ff, 0, 0xff_ff_ff_ff, 0],
      )
      for (const item of admitted.items) {
        const { payload } = await fixture.queue.loadVerifiedInput(item.id)
        assert.equal(payload.context.sampling.requestedSeedPolicy, 'random')
        assert.equal(payload.context.sampling.seedBehavior, 'per-iteration')
      }
    })
  },
)

test(
  'prepared batch snapshots caller options metadata and target before qualification awaits',
  { skip: !devRuntimeRoot() },
  async () => {
    await withFixture(async (fixture) => {
      await fixture.projects.updateGenerationDraft(fixture.tabId, {
        kind: 'positive-prompt',
        text: '{red|blue}',
      })
      const prepared = await fixture.projects.prepareNormalTxt2ImgContext(
        fixture.tabId,
        fixture.worker,
        fixture.modelService,
      )
      const options = { iterations: 2, maxPrompts: 4, seedBehavior: 'per-prompt' as const }
      const resolve = fixture.modelService.resolveVerifiedGenerationCheckpointForPlan.bind(
        fixture.modelService,
      )
      let changed = false
      fixture.modelService.resolveVerifiedGenerationCheckpointForPlan = async (reference) => {
        if (!changed) {
          changed = true
          prepared.context.prompts.positive = 'caller changed'
          prepared.context.sampling.seed = 10
          prepared.targetPngBytes.fill(0)
          options.iterations = 50
        }
        return await resolve(reference)
      }
      const admitted = await fixture.orchestrator.enqueuePreparedBatch(
        fixture.tabId,
        prepared,
        options,
        inferenceTransport(fixture.outputBytes),
      )
      assert.equal(changed, true)
      assert.equal(admitted.items.length, 4)
      const { payload, targetPath } = await fixture.queue.loadVerifiedInput(admitted.items[0].id)
      assert.equal(payload.context.prompts.positive, 'red')
      assert.equal(payload.context.sampling.seed, 42)
      assert.ok((await readFile(targetPath)).some((byte) => byte !== 0))
    })
  },
)

test(
  'prepared batch rejects malformed syntax and excessive count before qualification',
  { skip: !devRuntimeRoot() },
  async () => {
    await withFixture(async (fixture) => {
      const prepared = await fixture.projects.prepareNormalTxt2ImgContext(
        fixture.tabId,
        fixture.worker,
        fixture.modelService,
      )
      let calls = 0
      fixture.modelService.resolveVerifiedGenerationCheckpointForPlan = async () => {
        calls++
        throw new Error('qualification must not start')
      }
      prepared.context.prompts.positive = '{red|blue'
      await assert.rejects(
        fixture.orchestrator.enqueuePreparedBatch(
          fixture.tabId,
          prepared,
          { iterations: 1, maxPrompts: 4, seedBehavior: 'per-prompt' },
          inferenceTransport(fixture.outputBytes),
        ),
        { code: 'PROMPT_INVALID' },
      )
      prepared.context.prompts.positive = 'red'
      await assert.rejects(
        fixture.orchestrator.enqueuePreparedBatch(
          fixture.tabId,
          prepared,
          { iterations: Number.MAX_SAFE_INTEGER, maxPrompts: 4, seedBehavior: 'per-prompt' },
          inferenceTransport(fixture.outputBytes),
        ),
        { code: 'BATCH_TOO_LARGE' },
      )
      assert.equal(calls, 0)
      assert.deepEqual(await fixture.queue.listUnfinishedByProject(fixture.tabId), [])
    })
  },
)

test(
  'prepared batch enforces the measured policy at its exact boundary before qualification',
  { skip: !devRuntimeRoot() },
  async () => {
    await withFixture(async (fixture) => {
      const prepared = await fixture.projects.prepareNormalTxt2ImgContext(
        fixture.tabId,
        fixture.worker,
        fixture.modelService,
      )
      assert.equal(GENERATION_BATCH_JOB_LIMIT, 32)
      const resolve = fixture.modelService.resolveVerifiedGenerationCheckpointForPlan.bind(
        fixture.modelService,
      )
      let calls = 0
      fixture.modelService.resolveVerifiedGenerationCheckpointForPlan = async (reference) => {
        calls++
        return await resolve(reference)
      }
      const options = {
        iterations: GENERATION_BATCH_JOB_LIMIT + 1,
        maxJobs: 64,
        maxPrompts: 1,
        seedBehavior: 'per-iteration' as const,
      }
      await assert.rejects(
        fixture.orchestrator.enqueuePreparedBatch(
          fixture.tabId,
          prepared,
          options,
          inferenceTransport(fixture.outputBytes),
        ),
        { code: 'BATCH_TOO_LARGE' },
      )
      assert.equal(calls, 0)
      assert.deepEqual(await fixture.queue.listUnfinishedByProject(fixture.tabId), [])
      options.iterations = GENERATION_BATCH_JOB_LIMIT
      const admitted = await fixture.orchestrator.enqueuePreparedBatch(
        fixture.tabId,
        prepared,
        options,
        inferenceTransport(fixture.outputBytes),
      )
      assert.equal(admitted.items.length, GENERATION_BATCH_JOB_LIMIT)
      assert.ok(calls > 0)
      assert.equal(new Set(admitted.items.map((item) => item.batchId)).size, 1)
      assert.equal(
        (await fixture.queue.listUnfinishedByProject(fixture.tabId)).length,
        GENERATION_BATCH_JOB_LIMIT,
      )
    })
  },
)

test(
  'prepared batch checks transport envelope for a later concrete prompt pair',
  { skip: !devRuntimeRoot() },
  async () => {
    await withFixture(async (fixture) => {
      const longAlternative = String.fromCharCode(92).repeat(16_370)
      await fixture.projects.updateGenerationDraft(fixture.tabId, {
        kind: 'positive-prompt',
        text: `{ok|${longAlternative}}`,
      })
      await fixture.projects.updateGenerationDraft(fixture.tabId, {
        kind: 'negative-prompt',
        text: `{ok|${longAlternative}}`,
      })
      const prepared = await fixture.projects.prepareNormalTxt2ImgContext(
        fixture.tabId,
        fixture.worker,
        fixture.modelService,
      )
      let enqueueCalls = 0
      const enqueue = fixture.queue.enqueueIllustriousGenerationBatch.bind(fixture.queue)
      fixture.queue.enqueueIllustriousGenerationBatch = async (input) => {
        enqueueCalls++
        return await enqueue(input)
      }
      await assert.rejects(
        fixture.orchestrator.enqueuePreparedBatch(
          fixture.tabId,
          prepared,
          { iterations: 1, maxPrompts: 4, seedBehavior: 'per-prompt' },
          inferenceTransport(fixture.outputBytes),
        ),
        { code: 'GENERATION_PARAMETER_UNSUPPORTED' },
      )
      assert.equal(enqueueCalls, 0)
      assert.deepEqual(await fixture.queue.listUnfinishedByProject(fixture.tabId), [])
    })
  },
)

test(
  'prepared batch reuses a completed zero seed without another Random choice',
  { skip: !devRuntimeRoot() },
  async () => {
    await withFixture(async (fixture) => {
      const first = await fixture.orchestrator.enqueueOne(
        fixture.tabId,
        fixture.worker,
        inferenceTransport(fixture.outputBytes),
      )
      const transport = inferenceTransport(fixture.outputBytes)
      const generate = transport.generate.bind(transport)
      transport.generate = async (request) => {
        const done = await generate(request)
        assert.ok(done && typeof done === 'object' && !Array.isArray(done))
        return { ...done, seed: 0 }
      }
      assert.equal((await fixture.orchestrator.runNext(transport)).kind, 'completed')
      assert.equal((await fixture.queue.loadVerifiedInput(first.id)).item.status, 'completed')
      const lastSeed = await fixture.staging.readLastActualSeed(
        fixture.tabId,
        currentDocumentId(fixture),
      )
      assert.equal(lastSeed, 0)
      await fixture.projects.updateGenerationDraft(fixture.tabId, {
        kind: 'seed',
        policy: 'reuse',
        value: null,
      })
      await fixture.projects.updateGenerationDraft(fixture.tabId, {
        kind: 'positive-prompt',
        text: '{red|blue}',
      })
      let picks = 0
      const prepared = await fixture.projects.prepareNormalTxt2ImgContext(
        fixture.tabId,
        fixture.worker,
        fixture.modelService,
        () => {
          picks++
          return 42
        },
        lastSeed,
      )
      const admitted = await fixture.orchestrator.enqueuePreparedBatch(
        fixture.tabId,
        prepared,
        { iterations: 2, maxPrompts: 4, seedBehavior: 'per-prompt' },
        transport,
      )
      assert.equal(picks, 0)
      assert.deepEqual(
        admitted.plan.items.map((item) => item.seed),
        [0, 1, 2, 3],
      )
      assert.notEqual(admitted.items[0].stagingSessionId, first.stagingSessionId)
      assert.equal(
        (await fixture.queue.loadVerifiedInput(admitted.items[0].id)).payload.context.sampling
          .requestedSeedPolicy,
        'reuse',
      )
    })
  },
)

test(
  'prepared batch refuses literal escaped braces unsupported by the current worker before qualification',
  { skip: !devRuntimeRoot() },
  async () => {
    await withFixture(async (fixture) => {
      await fixture.projects.updateGenerationDraft(fixture.tabId, {
        kind: 'positive-prompt',
        text: `${String.fromCharCode(92)}{literal${String.fromCharCode(92)}}`,
      })
      const prepared = await fixture.projects.prepareNormalTxt2ImgContext(
        fixture.tabId,
        fixture.worker,
        fixture.modelService,
      )
      let calls = 0
      fixture.modelService.resolveVerifiedGenerationCheckpointForPlan = async () => {
        calls++
        throw new Error('must refuse before qualification')
      }
      await assert.rejects(
        fixture.orchestrator.enqueuePreparedBatch(
          fixture.tabId,
          prepared,
          { iterations: 1, maxPrompts: 4, seedBehavior: 'per-prompt' },
          inferenceTransport(fixture.outputBytes),
        ),
        { code: 'GENERATION_PROMPT_UNSUPPORTED' },
      )
      assert.equal(calls, 0)
      assert.deepEqual(await fixture.queue.listUnfinishedByProject(fixture.tabId), [])
    })
  },
)
