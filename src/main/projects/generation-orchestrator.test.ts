import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, realpathSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { crc32, deflateSync } from 'node:zlib'

import type { AppDatabase } from '../db/database.js'
import type { GenerationWorkerTransport } from './generation-processor.js'
import type { GenerationStagingRepository } from './generation-staging.js'
import type { IllustriousTxt2ImgRequestV1 } from './illustrious-txt2img-job.js'

import { openAppDatabase } from '../db/database.js'
import { CivitaiClient } from '../models/civitai-client.js'
import { CivitaiTokenStore, type SafeStorageAdapter } from '../models/civitai-token-store.js'
import { ModelRepository } from '../models/model-repository.js'
import { ModelService } from '../models/model-service.js'
import { recoverGenerationRepositories } from './generation-bootstrap.js'
import { GenerationOrchestrator, GenerationOrchestratorError } from './generation-orchestrator.js'
import { GenerationProcessor } from './generation-processor.js'
import { GenerationQueueRepository } from './generation-queue.js'
import { ProjectAutosaveLeaseRegistry } from './project-autosave.js'
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
  onRequest?: (request: IllustriousTxt2ImgRequestV1) => Promise<void>,
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
      assert.equal(await fixture.staging.readLastActualSeed(fixture.tabId), 42)

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
