import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import type {
  GenerationDenoisingProgress,
  GenerationProgressSnapshot,
} from '../../shared/projects/generation-progress.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { crc32, deflateSync } from 'node:zlib'

import type { AppDatabase } from '../db/database.js'
import type { GenerationWorkerLease } from './generation-dispatch-coordinator.js'
import type {
  GenerationDispatchModelResolver,
  GenerationWorkerRequest,
  GenerationWorkerTransport,
} from './generation-processor.js'
import type {
  FrozenQueuedIllustriousGenerationV1,
  VerifiedQueuedInput,
} from './generation-queue.js'
import type {
  IllustriousGenerationRequestV1,
  InferenceWorkerReady,
} from './illustrious-txt2img-job.js'
import type { PreparedNormalTxt2Img } from './project-generation-preparation.js'

import { openAppDatabase } from '../db/database.js'
import { CivitaiClient } from '../models/civitai-client.js'
import { CivitaiTokenStore, type SafeStorageAdapter } from '../models/civitai-token-store.js'
import { ModelRepository } from '../models/model-repository.js'
import { ModelService } from '../models/model-service.js'
import { publishIllustriousLoraFixture } from '../models/test-fixtures/illustrious-lora.js'
import { publishIllustriousVaeFixture } from '../models/test-fixtures/illustrious-vae.js'
import { prepareAnimaGenerationBatch } from './anima-generation-batch.js'
import { withAnimaGenerationBatchRequests } from './anima-generation-request.js'
import { GenerationAcceptanceJournalRepository } from './generation-acceptance-journal.js'
import {
  GenerationDispatchCoordinator,
  GenerationDispatchError,
} from './generation-dispatch-coordinator.js'
import { GenerationProcessor, GenerationProcessorError } from './generation-processor.js'
import { GenerationQueueRepository } from './generation-queue.js'
import { GenerationStagingRepository } from './generation-staging.js'
import { GenerationWorkerClient, GenerationWorkerError } from './generation-worker-client.js'
import { readIgsPackage } from './igs-package.js'
import { workerLoras } from './illustrious-generation-loras.js'
import { workerVae } from './illustrious-generation-vae.js'
import {
  withIllustriousGenerationRequest,
  withIllustriousTxt2ImgRequest,
} from './illustrious-txt2img-job.js'
import { ProjectAutosaveCoordinator, ProjectAutosaveLeaseRegistry } from './project-autosave.js'
import { ProjectGenerationAcceptance } from './project-generation-acceptance.js'
import { ProjectGenerationOperationGate } from './project-generation-operation-gate.js'
import { localProjectRecoveryKey } from './project-identity.js'
import { ProjectSession } from './project-session.js'
import { ProjectShadowStore } from './project-shadow.js'
import { ANIMA_BATCH_READY, withAnimaBatchFixture } from './test-fixtures/anima-batch.js'
import { requireRasterLayer } from './test-fixtures/require-raster-layer.js'

const migrations = path.resolve('src/main/db/migrations')
const placeholders = path.resolve('src/main/projects/placeholders')
const iccPath = path.resolve('worker-python/src/imagegen_worker/srgb.icc')
const bbox = { height: 64, width: 64, x: -24, y: 48 }
const qualifiedReady: InferenceWorkerReady = {
  capabilities: ['illustrious-txt2img'],
  protocolVersion: '1',
  runtimeProfile: 'linux-nvidia',
  workerVersion: '0.2.0',
}
const storage: SafeStorageAdapter = {
  decryptStringAsync: async () => ({ result: '', shouldReEncrypt: false }),
  encryptStringAsync: async () => Buffer.alloc(0),
  getSelectedStorageBackend: () => 'gnome_libsecret',
  isAsyncEncryptionAvailable: async () => true,
}

type Fixture = {
  database: AppDatabase
  modelService: ModelService
  outputBytes: Buffer
  prepared: PreparedNormalTxt2Img
  processor: GenerationProcessor
  queue: GenerationQueueRepository
  root: string
  staging: GenerationStagingRepository
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
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

async function srgbPng(opaque: boolean): Promise<Buffer> {
  const profile = await readFile(iccPath)
  assert.equal(sha256(profile), IGS_SRGB_ICC_SHA256)
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(bbox.width, 0)
  ihdr.writeUInt32BE(bbox.height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const scanlines = Buffer.alloc((1 + bbox.width * 4) * bbox.height)
  if (opaque) {
    for (let row = 0; row < bbox.height; row += 1) {
      for (let column = 0; column < bbox.width; column += 1) {
        const pixel = row * (1 + bbox.width * 4) + 1 + column * 4
        scanlines[pixel] = 37
        scanlines[pixel + 1] = 94
        scanlines[pixel + 2] = 181
        scanlines[pixel + 3] = 255
      }
    }
  }
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    pngChunk('IHDR', ihdr),
    pngChunk('iCCP', Buffer.concat([Buffer.from('sRGB\0\0'), deflateSync(profile)])),
    pngChunk('IDAT', deflateSync(scanlines)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

async function withFixture(run: (fixture: Fixture) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-generation-processor-'))
  const database = openAppDatabase(root, migrations)
  try {
    const scratch = path.join(root, 'scratch')
    await mkdir(scratch, { mode: 0o700 })
    const project = await ProjectSession.create(
      path.join(root, 'Project.igs'),
      'Processor fixture',
      { placeholdersDir: placeholders, scratchDir: scratch },
      bbox,
    )
    const repository = new ModelRepository(database.db)
    const modelService = new ModelService(
      repository,
      new CivitaiClient(),
      new CivitaiTokenStore(storage, root),
      undefined,
      undefined,
      async () => {}, // Processor tests use a fake transport and a tiny checkpoint fixture.
    )
    const modelBytes = Buffer.from('exact local checkpoint for processor tests')
    const modelPath = path.join(root, 'checkpoint.safetensors')
    await writeFile(modelPath, modelBytes)
    const modelSha256 = sha256(modelBytes)
    const installed = await repository.publishVerifiedInstallation({
      primary: {
        file: {
          managedPath: modelPath,
          originalFilename: 'checkpoint.safetensors',
          sha256: modelSha256,
          sizeBytes: modelBytes.length,
          verifiedAt: '2026-09-28T00:00:00.000Z',
        },
        resource: {
          displayName: 'Processor checkpoint',
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
            expectedSha256: modelSha256,
            fileId: 22,
            kind: 'civitai',
            versionId: 21,
          },
          sourceMetadata: {},
        },
      },
    })
    const reference = await modelService.resolveGenerationCheckpoint(
      installed.resourceId,
      installed.versionId,
    )
    const targetBytes = await srgbPng(false)
    const prepared: PreparedNormalTxt2Img = {
      context: {
        bbox,
        documentId: project.document.documentId,
        documentRevision: project.document.documentRevision,
        kind: 'normal-txt2img-preparation',
        model: { managedPath: modelPath, reference },
        prompts: { negative: 'blur', positive: 'blue lantern' },
        sampling: {
          cfgScale: 7.5,
          invokeScheduler: 'dpmpp_2m_k',
          requestedSeedPolicy: 'fixed',
          sampler: 'DPM++ 2M',
          scheduler: 'Karras',
          seed: 42,
          steps: 24,
        },
        schemaVersion: 1,
        target: {
          byteSize: targetBytes.length,
          colorSpace: 'srgb',
          format: 'png',
          height: bbox.height,
          iccSha256: IGS_SRGB_ICC_SHA256,
          sha256: sha256(targetBytes),
          width: bbox.width,
        },
      },
      targetPngBytes: targetBytes,
    }
    const queue = new GenerationQueueRepository(database.db, root)
    await queue.recoverAfterRestart()
    const staging = new GenerationStagingRepository(database.db, root)
    await staging.recoverAfterRestart()
    const processor = new GenerationProcessor(queue, staging, modelService, scratch)
    await run({
      database,
      modelService,
      outputBytes: await srgbPng(true),
      prepared,
      processor,
      queue,
      root,
      staging,
    })
  } finally {
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
}

async function enqueue(fixture: Fixture): Promise<string> {
  return await withIllustriousTxt2ImgRequest({
    modelService: fixture.modelService,
    prepared: fixture.prepared,
    ready: qualifiedReady,
    scratchBasePath: path.join(fixture.root, 'scratch'),
    use: async (request) => {
      const item = await fixture.queue.enqueueIllustriousTxt2Img({
        prepared: fixture.prepared,
        projectPath: path.join(fixture.root, 'Project.igs'),
        request,
        stagingSessionId: randomUUID(),
      })
      return item.id
    },
  })
}

function transport(
  generate: (request: IllustriousGenerationRequestV1) => Promise<unknown>,
  ready = qualifiedReady,
  close: () => Promise<void> = async () => undefined,
): GenerationWorkerTransport {
  return {
    close,
    generate: async (request) => {
      assert.ok(
        request.type === 'generate-illustrious-txt2img' ||
          request.type === 'generate-illustrious-img2img',
      )
      return await generate(request)
    },
    ready,
  }
}

function illustriousInput<T extends VerifiedQueuedInput>(
  input: T,
): T & { payload: FrozenQueuedIllustriousGenerationV1 } {
  assertIllustriousInput(input)
  return input
}

function assertIllustriousInput<T extends VerifiedQueuedInput>(
  input: T,
): asserts input is T & { payload: FrozenQueuedIllustriousGenerationV1 } {
  assert.ok(
    input.payload.kind === 'illustrious-txt2img' || input.payload.kind === 'illustrious-img2img',
  )
}

async function writeDone(request: GenerationWorkerRequest, outputBytes: Buffer, actualSeed = 42) {
  await writeFile(request.job.output.pngPath, outputBytes, { flag: 'wx', mode: 0o600 })
  return {
    outputPath: request.job.output.pngPath,
    protocolVersion: '1',
    requestId: request.requestId,
    seed: actualSeed,
    type: 'generation-done',
  }
}

test('qualified completion publishes real PNG and actual seed through SQLite staging', async () => {
  await withFixture(async (fixture) => {
    const id = await enqueue(fixture)
    const originalProject = await readFile(path.join(fixture.root, 'Project.igs'))
    const seen: IllustriousGenerationRequestV1[] = []
    const result = await fixture.processor.runOne(
      transport(async (request) => {
        seen.push(request)
        return await writeDone(request, fixture.outputBytes, 65_535)
      }),
    )
    assert.equal(result.kind, 'completed')
    assert.equal(result.queueItemId, id)
    assert.equal(seen.length, 1)
    assert.equal(seen[0]?.job.sampling.seed, 42)
    assert.notEqual(seen[0]?.requestId, id)
    const item = await fixture.queue.loadVerifiedInput(id)
    assert.equal(item.item.status, 'completed')
    const candidates = await fixture.staging.listVerifiedCandidates(item.item.localProjectKey)
    assert.equal(candidates.length, 1)
    assert.equal(candidates[0]?.actualSeed, 65_535)
    assert.equal(
      await fixture.staging.readLastActualSeed(item.item.localProjectKey, candidates[0].documentId),
      65_535,
    )
    assert.deepEqual(await readFile(path.join(fixture.root, 'Project.igs')), originalProject)
    assert.deepEqual(await readdir(path.join(fixture.root, 'scratch')), [])
  })
})

async function withAcceptance(
  fixture: Fixture,
  tabId: string,
  use: (
    owner: ProjectAutosaveCoordinator,
    acceptance: ProjectGenerationAcceptance,
  ) => Promise<void>,
): Promise<void> {
  const roots = {
    placeholdersDir: placeholders,
    scratchDir: path.join(fixture.root, 'scratch'),
  }
  let owner = await ProjectAutosaveCoordinator.open(
    path.join(fixture.root, 'Project.igs'),
    roots,
    new ProjectShadowStore(path.join(fixture.root, 'shadow')),
    { debounceMs: 60_000, leaseRegistry: new ProjectAutosaveLeaseRegistry() },
  )
  const acceptance = new ProjectGenerationAcceptance({
    documents: { getOpenDocument: (key) => (key === tabId ? owner : null) },
    gate: new ProjectGenerationOperationGate(),
    journal: new GenerationAcceptanceJournalRepository(fixture.database.db),
    orchestrator: {
      cancelAcceptanceJobs: async () => assert.fail('Unexpected sibling cancellation'),
      fenceProjectGeneration: async () => undefined,
      releaseProjectGenerationFence: () => undefined,
    },
    queue: fixture.queue,
    staging: fixture.staging,
  })
  try {
    await use(owner, acceptance)
  } finally {
    if (owner.dirty) {
      owner = await owner.discardChanges(roots)
    }
    await owner.close()
  }
}

test('completed candidates keep the actual worker seed through Add and portable Save', async (t) => {
  for (const actualSeed of [42, 0, 65_535, 0xff_ff_ff_ff]) {
    await t.test(`planned seed 42, actual seed ${actualSeed}`, async () => {
      await withFixture(async (fixture) => {
        const id = await enqueue(fixture)
        const result = await fixture.processor.runOne(
          transport(async (request) => {
            assert.equal(request.job.sampling.seed, 42)
            return await writeDone(request, fixture.outputBytes, actualSeed)
          }),
        )
        assert.equal(result.kind, 'completed')
        const { item } = await fixture.queue.loadVerifiedInput(id)
        const candidates = await fixture.staging.listVerifiedCandidates(item.localProjectKey)
        assert.equal(candidates.length, 1)
        const candidate = candidates[0]
        assert.equal(candidate.actualSeed, actualSeed)
        assert.equal(
          await fixture.staging.readLastActualSeed(item.localProjectKey, candidate.documentId),
          actualSeed,
        )
        const originalPackage = await readFile(candidate.projectPath)
        await withAcceptance(fixture, item.localProjectKey, async (owner, acceptance) => {
          const accepted = await acceptance.accept(
            item.localProjectKey,
            [candidate.candidateId],
            candidate.candidateId,
            [candidate.candidateId],
          )
          assert.equal(accepted.kind, 'accepted')
          assert.equal(owner.document.layers.length, 1)
          const layer = owner.document.layers[0]
          assert.equal(
            requireRasterLayer(layer).generationProvenance?.generationConfiguration.sampling
              .actualSeed,
            actualSeed,
          )
          assert.equal(
            requireRasterLayer(layer).generationProvenance?.executionResultContext.candidateId,
            id,
          )
          assert.equal(owner.dirty, true)
          assert.deepEqual(await readFile(candidate.projectPath), originalPackage)
          assert.deepEqual(await fixture.staging.listVerifiedCandidates(item.localProjectKey), [])
          await owner.save({ lastActualSeedSnapshot: actualSeed })
          const saved = await readIgsPackage(candidate.projectPath)
          assert.equal(
            requireRasterLayer(saved.project.layers[0])?.generationProvenance
              ?.generationConfiguration.sampling.actualSeed,
            actualSeed,
          )
          assert.equal(saved.project.lastActualSeedSnapshot, actualSeed)
          assert.deepEqual(
            await saved.readMember(requireRasterLayer(layer).asset.path),
            fixture.outputBytes,
          )
        })
      })
    })
  }
})

test('native JSONL VAE and UNet refusals reach safe stage diagnostics without changing accepted source, receipt or seed', async (t) => {
  const safeVaeMessage =
    'The VAE produced non-finite values. Choose FP32 for a new generation; Retry uses the original precision.'
  const safeUnetMessage =
    'The UNet produced non-finite values. Review the checkpoint prediction type and noise settings; Retry uses the original settings.'
  const genericMessage = 'The generation worker did not return a valid completed result.'
  for (const [workerCode, workerMessage, publicCode] of [
    [
      'GENERATION_WORKER_FAILED',
      'VAE inference produced non-finite values.',
      'GENERATION_VAE_NON_FINITE',
    ],
    [
      'GENERATION_WORKER_FAILED',
      'UNet inference produced non-finite values.',
      'GENERATION_UNET_NON_FINITE',
    ],
    [
      'GENERATION_WORKER_FAILED',
      'VAE inference produced non-finite values. /private/model.safetensors',
      'GENERATION_WORKER_FAILED',
    ],
    [
      'GENERATION_WORKER_FAILED',
      'UNet inference produced non-finite values. /private/model.safetensors',
      'GENERATION_WORKER_FAILED',
    ],
    [
      'GENERATION_WORKER_FAILED',
      'LoRA inference produced non-finite values.',
      'GENERATION_WORKER_FAILED',
    ],
    [
      'GENERATION_WORKER_FAILED',
      'Resource conditioning produced non-finite values.',
      'GENERATION_WORKER_FAILED',
    ],
    ['MODEL_LOAD_FAILED', 'VAE inference produced non-finite values.', 'GENERATION_WORKER_FAILED'],
    ['MODEL_LOAD_FAILED', 'UNet inference produced non-finite values.', 'GENERATION_WORKER_FAILED'],
  ] as const) {
    await t.test(`${workerMessage} / ${workerCode}`, async () => {
      await withFixture(async (fixture) => {
        const sourceId = await enqueue(fixture)
        assert.equal(
          (
            await fixture.processor.runOne(
              transport(async (request) => await writeDone(request, fixture.outputBytes, 65_535)),
            )
          ).kind,
          'completed',
        )
        const source = await fixture.queue.loadVerifiedInput(sourceId)
        const candidate = (
          await fixture.staging.listVerifiedCandidates(source.item.localProjectKey)
        )[0]
        await withAcceptance(fixture, source.item.localProjectKey, async (owner, acceptance) => {
          assert.equal(
            (
              await acceptance.accept(
                source.item.localProjectKey,
                [candidate.candidateId],
                candidate.candidateId,
                [candidate.candidateId],
              )
            ).kind,
            'accepted',
          )
          await owner.save({ lastActualSeedSnapshot: 65_535 })
          const documentBefore = structuredClone(owner.document)
          const historyBefore = [owner.canUndo, owner.canRedo, owner.dirty]
          const packageBefore = await readFile(candidate.projectPath)
          const acceptedAsset = requireRasterLayer(owner.document.layers[0]).asset.path
          const receiptsBefore = await fixture.database.db
            .selectFrom('generation_candidate_receipt')
            .selectAll()
            .execute()
          const cursorsBefore = await fixture.database.db
            .selectFrom('generation_seed_cursor')
            .selectAll()
            .execute()
          const acceptedIndexBefore = await fixture.database.db
            .selectFrom('project_accepted_result_index')
            .selectAll()
            .execute()
          const originalPreparation = await opaquePreparation(fixture, 0.5)
          const prepared = {
            ...originalPreparation,
            context: {
              ...originalPreparation.context,
              documentRevision: owner.document.documentRevision,
              vaePrecision: 'FP16' as const,
            },
          }
          const ready: InferenceWorkerReady = {
            ...img2imgReady,
            capabilities: [
              ...img2imgReady.capabilities,
              'illustrious-lora',
              'illustrious-vae-precision',
            ],
            workerVersion: '0.8.0',
          }
          const failed = await withIllustriousGenerationRequest({
            modelService: fixture.modelService,
            prepared,
            ready,
            scratchBasePath: path.join(fixture.root, 'scratch'),
            use: async (request) =>
              await fixture.queue.enqueueIllustriousGeneration({
                prepared,
                projectPath: candidate.projectPath,
                request,
                stagingSessionId: randomUUID(),
              }),
          })
          const frozenBefore = await fixture.queue.loadVerifiedInput(failed.id)
          const payloadBefore = structuredClone(frozenBefore.payload)
          // The accepted open Project owns its pending asset directory. The admission lease has
          // already closed; only a new processor scratch directory must disappear after refusal.
          const scratchPath = path.join(fixture.root, 'scratch')
          const scratchBefore = (await readdir(scratchPath)).sort()
          assert.ok(scratchBefore.every((name) => !name.startsWith('illustrious-request-')))
          const runtimeRoot = path.join(fixture.root, 'native-error-runtime')
          await mkdir(runtimeRoot)
          const executable = path.join(runtimeRoot, 'python')
          await writeFile(
            executable,
            String.raw`#!${process.execPath}
const ready = ${JSON.stringify({ ...ready, capabilities: [...ready.capabilities, ...(process.platform === 'linux' ? ['linux-owned-inference-v1'] : [])], pythonVersion: '3.12.13', type: 'ready' })}
process.stdout.write(JSON.stringify(ready) + '\n')
let buffer = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', chunk => {
  buffer += chunk
  while (buffer.includes('\n')) {
    const newline = buffer.indexOf('\n')
    const request = JSON.parse(buffer.slice(0, newline))
    buffer = buffer.slice(newline + 1)
    process.stdout.write(JSON.stringify({
      type: 'error', protocolVersion: '1', requestId: request.requestId,
      code: ${JSON.stringify(workerCode)}, message: ${JSON.stringify(workerMessage)}
    }) + '\n')
  }
})
`,
          )
          await chmod(executable, 0o700)
          const client = await GenerationWorkerClient.start({
            pythonExecutable: executable,
            runtimeRoot,
            scratchBasePath: path.join(fixture.root, 'scratch'),
          })
          let outputPath: string | null = null
          try {
            const result = await fixture.processor.runOne({
              close: async () => await client.close(),
              generate: async (request) => {
                assert.ok(request.type === 'generate-illustrious-img2img')
                assert.equal(request.job.vaePrecision, 'FP16')
                assert.deepEqual(
                  request.job.loras ?? [],
                  [],
                  'UNet refusal has no LoRA precondition',
                )
                assert.deepEqual(await readFile(request.job.target.path), fixture.outputBytes)
                outputPath = request.job.output.pngPath
                return await client.generate(request)
              },
              ready: client.ready,
            })
            assert.deepEqual(result, { kind: 'failed', queueItemId: failed.id })
            const after = await fixture.queue.loadVerifiedInput(failed.id)
            assert.equal(after.item.status, 'failed')
            assert.deepEqual(after.payload, payloadBefore)
            assert.deepEqual(await readFile(after.targetPath), prepared.targetPngBytes)
            const publicError = {
              code: publicCode,
              message:
                publicCode === 'GENERATION_VAE_NON_FINITE'
                  ? safeVaeMessage
                  : publicCode === 'GENERATION_UNET_NON_FINITE'
                    ? safeUnetMessage
                    : genericMessage,
            }
            assert.deepEqual((await fixture.queue.getManagerEntry(failed.id)).error, publicError)
            const page = await fixture.queue.listManagerPage()
            assert.deepEqual(page.items.find((entry) => entry.id === failed.id)?.error, publicError)
            assert.ok(!JSON.stringify(page).includes('/private/'))
            assert.ok(!JSON.stringify(page).includes('inference produced'))
            const stored = await fixture.database.db
              .selectFrom('generation_queue_item')
              .select(['error_code', 'error_message'])
              .where('id', '=', failed.id)
              .executeTakeFirstOrThrow()
            assert.deepEqual(stored, {
              error_code: publicError.code,
              error_message: publicError.message,
            })
            assert.equal(await fixture.staging.hasPublicationReceipt(failed.id), false)
            assert.deepEqual(
              await fixture.database.db
                .selectFrom('generation_candidate_receipt')
                .selectAll()
                .execute(),
              receiptsBefore,
            )
            assert.deepEqual(
              await fixture.database.db.selectFrom('generation_seed_cursor').selectAll().execute(),
              cursorsBefore,
            )
            assert.deepEqual(
              await fixture.database.db
                .selectFrom('project_accepted_result_index')
                .selectAll()
                .execute(),
              acceptedIndexBefore,
            )
            assert.deepEqual(
              await fixture.staging.listVerifiedCandidates(failed.localProjectKey),
              [],
            )
            assert.equal(
              await fixture.staging.readLastActualSeed(
                failed.localProjectKey,
                owner.document.documentId,
              ),
              65_535,
            )
            assert.deepEqual(owner.document, documentBefore)
            assert.deepEqual([owner.canUndo, owner.canRedo, owner.dirty], historyBefore)
            assert.deepEqual(await readFile(candidate.projectPath), packageBefore)
            const saved = await readIgsPackage(candidate.projectPath)
            assert.deepEqual(await saved.readMember(acceptedAsset), fixture.outputBytes)
            assert.ok(outputPath)
            await assert.rejects(readFile(outputPath), { code: 'ENOENT' })
            assert.deepEqual((await readdir(scratchPath)).sort(), scratchBefore)
          } finally {
            await client.close()
          }
        })
      })
    })
  }
})

test('untyped or unrelated typed worker failures cannot masquerade as VAE or UNet non-finite refusals', async () => {
  for (const reason of ['vae-non-finite', 'unet-non-finite'] as const) {
    for (const error of [
      Object.assign(new Error('/private/untrusted-worker-error'), {
        code: 'WORKER_REQUEST_FAILED',
        failureReason: reason,
        workerCode: 'GENERATION_WORKER_FAILED',
      }),
      new GenerationWorkerError(
        'PROTOCOL_ERROR',
        '/private/protocol-error',
        'GENERATION_WORKER_FAILED',
        reason,
      ),
      new GenerationWorkerError(
        'WORKER_REQUEST_FAILED',
        '/private/other-worker-error',
        'MODEL_LOAD_FAILED',
        reason,
      ),
    ]) {
      await withFixture(async (fixture) => {
        const id = await enqueue(fixture)
        assert.deepEqual(
          await fixture.processor.runOne(
            transport(async () => {
              throw error
            }),
          ),
          {
            kind: 'failed',
            queueItemId: id,
          },
        )
        const row = await fixture.queue.getManagerEntry(id)
        assert.equal(row.error?.code, 'GENERATION_WORKER_FAILED')
        assert.equal(
          row.error?.message,
          'The generation worker did not return a valid completed result.',
        )
        assert.ok(!JSON.stringify(row).includes('/private/'))
        assert.equal(await fixture.staging.hasPublicationReceipt(id), false)
        assert.deepEqual(await fixture.staging.listVerifiedCandidates(row.projectKey), [])
      })
    }
  }
})

test('an Anima job cannot project Illustrious VAE or UNet remedies even from a typed transport failure', async () => {
  for (const reason of ['vae-non-finite', 'unet-non-finite'] as const) {
    for (const opaque of [false, true]) {
      await withAnimaBatchFixture(
        async (source) => {
          const database = openAppDatabase(source.root, migrations)
          try {
            const projectPath = path.join(source.root, 'Project.igs')
            const project = await ProjectSession.create(
              projectPath,
              'Anima failure fixture',
              {
                placeholdersDir: placeholders,
                scratchDir: source.scratch,
              },
              source.prepared.context.bbox,
            )
            source.prepared.context.documentId = project.document.documentId
            source.prepared.context.documentRevision = project.document.documentRevision
            const batch = prepareAnimaGenerationBatch({ iterations: 1, prepared: source.prepared })
            const queue = new GenerationQueueRepository(database.db, source.root)
            const staging = new GenerationStagingRepository(database.db, source.root)
            await queue.recoverAfterRestart()
            await staging.recoverAfterRestart()
            const unsupported = async () => {
              throw new Error('The Anima dispatcher must not resolve Illustrious resources.')
            }
            const models: GenerationDispatchModelResolver = {
              ...source.modelService,
              assertNoUnboundGenerationEmbeddings: unsupported,
              resolveVerifiedGenerationCheckpointForPlan: unsupported,
              resolveVerifiedGenerationEmbeddingForPlan: unsupported,
              resolveVerifiedGenerationLoraForPlan: unsupported,
              resolveVerifiedGenerationVaeForPlan: unsupported,
            }
            const session = randomUUID()
            const [queued] = await withAnimaGenerationBatchRequests({
              modelService: source.modelService,
              prepared: batch,
              ready: ANIMA_BATCH_READY,
              scratchBasePath: source.scratch,
              use: async (requests) =>
                await queue.enqueuePreparedAnimaGenerationBatch({
                  preflight: async (entries) =>
                    await staging.preflightBatchCapacity({
                      entries,
                      localProjectKey: localProjectRecoveryKey(projectPath),
                      projectPath,
                      stagingSessionId: session,
                    }),
                  preparedBatch: batch,
                  projectPath,
                  requests,
                  stagingSessionId: session,
                }),
            })
            const processor = new GenerationProcessor(queue, staging, models, source.scratch)
            const before = structuredClone(project.document)
            const result = await processor.runOne({
              close: async () => undefined,
              generate: async (request) => {
                assert.equal(
                  request.type,
                  opaque ? 'generate-anima-img2img' : 'generate-anima-txt2img',
                )
                throw new GenerationWorkerError(
                  'WORKER_REQUEST_FAILED',
                  '/private/untrusted-anima-diagnostic',
                  'GENERATION_WORKER_FAILED',
                  reason,
                )
              },
              ready: ANIMA_BATCH_READY,
            })
            assert.deepEqual(result, { kind: 'failed', queueItemId: queued.id })
            assert.deepEqual((await queue.getManagerEntry(queued.id)).error, {
              code: 'GENERATION_WORKER_FAILED',
              message: 'The generation worker did not return a valid completed result.',
            })
            assert.ok(!JSON.stringify(await queue.listManagerPage()).includes('/private/'))
            assert.equal(await staging.hasPublicationReceipt(queued.id), false)
            assert.deepEqual(await staging.listVerifiedCandidates(queued.localProjectKey), [])
            assert.equal(
              await staging.readLastActualSeed(
                queued.localProjectKey,
                source.prepared.context.documentId,
              ),
              null,
            )
            assert.deepEqual(project.document, before)
            assert.deepEqual(await readdir(source.scratch), [])
          } finally {
            await database.close()
          }
        },
        { opaque },
      )
    }
  }
})

test('editing a published actual seed without its durable receipt cannot become a layer', async () => {
  await withFixture(async (fixture) => {
    const id = await enqueue(fixture)
    const result = await fixture.processor.runOne(
      transport(async (request) => await writeDone(request, fixture.outputBytes)),
    )
    assert.equal(result.kind, 'completed')
    const { item } = await fixture.queue.loadVerifiedInput(id)
    const [candidate] = await fixture.staging.listVerifiedCandidates(item.localProjectKey)
    assert.ok(candidate)
    const manifestPath = path.join(path.dirname(path.dirname(candidate.assetPath)), 'manifest.json')
    const originalManifest = await readFile(manifestPath)
    const manifest = JSON.parse(originalManifest.toString('utf8')) as {
      candidates: { actualSeed: number; candidateId: string }[]
    }
    const entry = manifest.candidates.find((next) => next.candidateId === id)
    assert.ok(entry)
    entry.actualSeed = 43
    await writeFile(manifestPath, JSON.stringify(manifest))
    await withAcceptance(fixture, item.localProjectKey, async (owner, acceptance) => {
      const originalDocument = structuredClone(owner.document)
      const originalPackage = await readFile(candidate.projectPath)
      await assert.rejects(acceptance.accept(item.localProjectKey, [id], id, [id]), {
        code: 'ACCEPTANCE_SELECTION_STALE',
      })
      assert.deepEqual(owner.document, originalDocument)
      assert.equal(owner.dirty, false)
      assert.deepEqual(await readFile(candidate.projectPath), originalPackage)
      assert.deepEqual(await readFile(candidate.assetPath), fixture.outputBytes)
      assert.equal(
        await fixture.staging.readLastActualSeed(item.localProjectKey, candidate.documentId),
        42,
      )
    })
    await writeFile(manifestPath, originalManifest)
    assert.equal(
      (await fixture.staging.listVerifiedCandidates(item.localProjectKey))[0]?.actualSeed,
      42,
    )
  })
})

test('app-owned dispatch closes the leased worker after a real queued completion', async () => {
  await withFixture(async (fixture) => {
    const id = await enqueue(fixture)
    let closeCount = 0
    const worker = transport(
      async (request) => await writeDone(request, fixture.outputBytes),
      qualifiedReady,
      async () => {
        closeCount += 1
      },
    )
    const runtime: GenerationWorkerLease = {
      retryUnconfirmedGenerationExit: async () => true,
      withGenerationWorker: async (_scratch, use) => {
        try {
          return await use(worker)
        } finally {
          await worker.close()
        }
      },
    }
    const coordinator = new GenerationDispatchCoordinator(
      runtime,
      {
        hasDispatchablePending: async () => await fixture.queue.hasDispatchablePending(),
        runNext: async (active) => await fixture.processor.runOne(active),
      },
      fixture.processor,
      path.join(fixture.root, 'scratch'),
    )
    const result = await coordinator.runNext()
    assert.deepEqual(
      { kind: result.kind, queueItemId: result.kind === 'idle' ? null : result.queueItemId },
      { kind: 'completed', queueItemId: id },
    )
    assert.equal(closeCount, 1)
    const queued = await fixture.queue.loadVerifiedInput(id)
    assert.equal(
      (await fixture.staging.listVerifiedCandidates(queued.item.localProjectKey)).length,
      1,
    )
    await coordinator.shutdown()
    await assert.rejects(
      coordinator.runNext(),
      (error: unknown) => error instanceof GenerationDispatchError && error.code === 'CLOSED',
    )
  })
})

test('app-owned dispatch leaves a pending row untouched when the runtime is unavailable', async () => {
  await withFixture(async (fixture) => {
    const id = await enqueue(fixture)
    const runtime: GenerationWorkerLease = {
      retryUnconfirmedGenerationExit: async () => true,
      withGenerationWorker: async () => null,
    }
    const coordinator = new GenerationDispatchCoordinator(
      runtime,
      {
        hasDispatchablePending: async () => await fixture.queue.hasDispatchablePending(),
        runNext: async () => assert.fail('An unavailable runtime cannot claim the queue.'),
      },
      fixture.processor,
      path.join(fixture.root, 'scratch'),
    )
    await assert.rejects(
      coordinator.runNext(),
      (error: unknown) =>
        error instanceof GenerationDispatchError && error.code === 'RUNTIME_UNAVAILABLE',
    )
    assert.equal((await fixture.queue.loadVerifiedInput(id)).item.status, 'pending')
    await coordinator.shutdown()
  })
})

test('app-owned shutdown cancels its in-flight job and waits for confirmed worker exit', async () => {
  await withFixture(async (fixture) => {
    const id = await enqueue(fixture)
    let enteredResolve!: () => void
    const entered = new Promise<void>((resolve) => {
      enteredResolve = resolve
    })
    let closeEnteredResolve!: () => void
    const closeEntered = new Promise<void>((resolve) => {
      closeEnteredResolve = resolve
    })
    let releaseExit!: () => void
    const exited = new Promise<void>((resolve) => {
      releaseExit = resolve
    })
    let closePromise: Promise<void> | null = null
    const worker = transport(
      async () => {
        enteredResolve()
        return await new Promise<never>(() => undefined)
      },
      qualifiedReady,
      async () => {
        closePromise ??= (async () => {
          closeEnteredResolve()
          await exited
        })()
        await closePromise
      },
    )
    const runtime: GenerationWorkerLease = {
      retryUnconfirmedGenerationExit: async () => true,
      withGenerationWorker: async (_scratch, use) => {
        try {
          return await use(worker)
        } finally {
          await worker.close()
        }
      },
    }
    const coordinator = new GenerationDispatchCoordinator(
      runtime,
      {
        hasDispatchablePending: async () => await fixture.queue.hasDispatchablePending(),
        runNext: async (active) => await fixture.processor.runOne(active),
      },
      fixture.processor,
      path.join(fixture.root, 'scratch'),
    )
    const running = coordinator.runNext()
    await entered
    await assert.rejects(
      coordinator.runNext(),
      (error: unknown) => error instanceof GenerationDispatchError && error.code === 'BUSY',
    )
    const closing = coordinator.shutdown()
    await closeEntered
    const during = await fixture.queue.loadVerifiedInput(id)
    assert.equal(during.item.status, 'running')
    assert.equal(during.item.cancelRequested, true)
    releaseExit()
    await closing
    assert.deepEqual(await running, { kind: 'canceled', queueItemId: id })
    assert.equal((await fixture.queue.loadVerifiedInput(id)).item.status, 'canceled')
  })
})

test('derivatives-only readiness cannot claim a pending job', async () => {
  await withFixture(async (fixture) => {
    const id = await enqueue(fixture)
    await assert.rejects(
      fixture.processor.runOne(
        transport(
          async () => {
            assert.fail('unqualified worker must not run')
          },
          { ...qualifiedReady, runtimeProfile: 'derivatives-only', workerVersion: '0.1.0' },
        ),
      ),
      (error: unknown) =>
        error instanceof GenerationProcessorError && error.code === 'INFERENCE_UNAVAILABLE',
    )
    assert.equal((await fixture.queue.loadVerifiedInput(id)).item.status, 'pending')
  })
})

test('current ModelService prediction override is rechecked before dispatch', async () => {
  await withFixture(async (fixture) => {
    const id = await enqueue(fixture)
    const model = fixture.prepared.context.model.reference
    await fixture.modelService.setPredictionType(
      model.localModelId,
      model.localVersionId,
      'v_prediction',
    )
    const result = await fixture.processor.runOne(
      transport(async () => {
        assert.fail('changed prediction type must block dispatch')
      }),
    )
    assert.deepEqual(result, { kind: 'failed', queueItemId: id })
    assert.equal((await fixture.queue.loadVerifiedInput(id)).item.status, 'failed')
    assert.deepEqual(await readdir(path.join(fixture.root, 'scratch')), [])
  })
})

test('mismatched worker requestId cannot publish even when it wrote a valid PNG', async () => {
  await withFixture(async (fixture) => {
    const id = await enqueue(fixture)
    let closed = false
    let closeEnteredResolve!: () => void
    const closeEntered = new Promise<void>((resolve) => {
      closeEnteredResolve = resolve
    })
    let exitResolve!: () => void
    const exited = new Promise<void>((resolve) => {
      exitResolve = resolve
    })
    const run = fixture.processor.runOne(
      transport(
        async (request) => ({
          ...(await writeDone(request, fixture.outputBytes)),
          requestId: randomUUID(),
        }),
        qualifiedReady,
        async () => {
          closeEnteredResolve()
          await exited
          closed = true
        },
      ),
    )
    await closeEntered
    assert.equal((await fixture.queue.loadVerifiedInput(id)).item.status, 'running')
    exitResolve()
    const result = await run
    assert.deepEqual(result, { kind: 'failed', queueItemId: id })
    assert.equal(closed, true)
    const item = await fixture.queue.loadVerifiedInput(id)
    assert.equal(item.item.status, 'failed')
    assert.deepEqual(await fixture.staging.listVerifiedCandidates(item.item.localProjectKey), [])
  })
})

for (const outputKind of ['missing', 'invalid'] as const) {
  test(`${outputKind} PNG fails the running row after confirmed worker exit`, async () => {
    await withFixture(async (fixture) => {
      const id = await enqueue(fixture)
      const nextId = await enqueue(fixture)
      let closeCount = 0
      const result = await fixture.processor.runOne(
        transport(
          async (request) => {
            if (outputKind === 'invalid') {
              await writeFile(request.job.output.pngPath, Buffer.from('not a PNG'), {
                flag: 'wx',
                mode: 0o600,
              })
            }
            return {
              outputPath: request.job.output.pngPath,
              protocolVersion: '1',
              requestId: request.requestId,
              seed: 42,
              type: 'generation-done',
            }
          },
          qualifiedReady,
          async () => {
            closeCount += 1
          },
        ),
      )
      assert.deepEqual(result, { kind: 'failed', queueItemId: id })
      assert.equal(closeCount, 1)
      const row = await fixture.queue.loadVerifiedInput(id)
      assert.equal(row.item.status, 'failed')
      assert.equal(await fixture.staging.hasPublicationReceipt(id), false)
      assert.deepEqual(await fixture.staging.listVerifiedCandidates(row.item.localProjectKey), [])
      assert.deepEqual(await readdir(path.join(fixture.root, 'scratch')), [])
      const next = await fixture.processor.runOne(
        transport(async (request) => await writeDone(request, fixture.outputBytes)),
      )
      assert.equal(next.kind, 'completed')
      assert.equal(next.queueItemId, nextId)
    })
  })
}

test('a durable publication receipt keeps an uncertain running row for recovery', async () => {
  await withFixture(async (fixture) => {
    const id = await enqueue(fixture)
    const staged = new GenerationStagingRepository(fixture.database.db, fixture.root, {
      afterManifestPublish: async () => {
        throw new Error('injected crash after manifest publication')
      },
    })
    await staged.recoverAfterRestart()
    const processor = new GenerationProcessor(
      fixture.queue,
      staged,
      fixture.modelService,
      path.join(fixture.root, 'scratch'),
    )
    await assert.rejects(
      processor.runOne(transport(async (request) => await writeDone(request, fixture.outputBytes))),
      (error: unknown) =>
        error instanceof GenerationProcessorError && error.code === 'PUBLICATION_UNCERTAIN',
    )
    assert.equal(await staged.hasPublicationReceipt(id), true)
    assert.equal((await fixture.queue.loadVerifiedInput(id)).item.status, 'running')
    assert.deepEqual(await readdir(path.join(fixture.root, 'scratch')), [])
  })
})

test('unreconciled staging rejects before queue claim', async () => {
  await withFixture(async (fixture) => {
    const id = await enqueue(fixture)
    const unreconciled = new GenerationStagingRepository(fixture.database.db, fixture.root)
    const processor = new GenerationProcessor(
      fixture.queue,
      unreconciled,
      fixture.modelService,
      path.join(fixture.root, 'scratch'),
    )
    await assert.rejects(
      processor.runOne(transport(async () => assert.fail('must not dispatch'))),
      { code: 'STAGING_NOT_RECONCILED' },
    )
    assert.equal((await fixture.queue.loadVerifiedInput(id)).item.status, 'pending')
  })
})

test('unreconciled queue rejects before claim', async () => {
  await withFixture(async (fixture) => {
    const id = await enqueue(fixture)
    const unreconciledQueue = new GenerationQueueRepository(fixture.database.db, fixture.root)
    const processor = new GenerationProcessor(
      unreconciledQueue,
      fixture.staging,
      fixture.modelService,
      path.join(fixture.root, 'scratch'),
    )
    await assert.rejects(
      processor.runOne(transport(async () => assert.fail('must not dispatch'))),
      { code: 'QUEUE_NOT_RECONCILED' },
    )
    assert.equal((await fixture.queue.loadVerifiedInput(id)).item.status, 'pending')
  })
})

test('cancellation between SQLite claim and local ownership prevents dispatch', async () => {
  await withFixture(async (fixture) => {
    class CancelDuringClaimQueue extends GenerationQueueRepository {
      override async claimNextPending() {
        const claimed = await super.claimNextPending()
        if (claimed) {
          await super.cancel(claimed.item.id)
        }
        return claimed
      }
    }
    const racingQueue = new CancelDuringClaimQueue(fixture.database.db, fixture.root)
    await racingQueue.recoverAfterRestart()
    const id = await enqueue(fixture)
    const processor = new GenerationProcessor(
      racingQueue,
      fixture.staging,
      fixture.modelService,
      path.join(fixture.root, 'scratch'),
    )
    let closeCount = 0
    const result = await processor.runOne(
      transport(
        async () => assert.fail('canceled claim must not dispatch'),
        qualifiedReady,
        async () => {
          closeCount += 1
        },
      ),
    )
    assert.deepEqual(result, { kind: 'canceled', queueItemId: id })
    assert.equal(closeCount, 1)
    assert.equal((await fixture.queue.loadVerifiedInput(id)).item.status, 'canceled')
  })
})

test('shutdown during claim cancels the claimed row before worker dispatch', async () => {
  await withFixture(async (fixture) => {
    let claimedResolve!: () => void
    const claimed = new Promise<void>((resolve) => {
      claimedResolve = resolve
    })
    let releaseClaim!: () => void
    const claimReleased = new Promise<void>((resolve) => {
      releaseClaim = resolve
    })
    class PausedClaimQueue extends GenerationQueueRepository {
      override async claimNextPending() {
        const item = await super.claimNextPending()
        claimedResolve()
        await claimReleased
        return item
      }
    }
    const queue = new PausedClaimQueue(fixture.database.db, fixture.root)
    await queue.recoverAfterRestart()
    const id = await enqueue(fixture)
    const processor = new GenerationProcessor(
      queue,
      fixture.staging,
      fixture.modelService,
      path.join(fixture.root, 'scratch'),
    )
    let closeCount = 0
    const run = processor.runOne(
      transport(
        async () => assert.fail('shutdown must prevent dispatch after claim'),
        qualifiedReady,
        async () => {
          closeCount += 1
        },
      ),
    )
    await claimed
    await processor.stopAndCancelActive()
    releaseClaim()
    assert.deepEqual(await run, { kind: 'canceled', queueItemId: id })
    assert.equal((await queue.loadVerifiedInput(id)).item.status, 'canceled')
    assert.equal(closeCount, 1)
    await assert.rejects(
      processor.runOne(transport(async () => assert.fail('stopped processor must not dispatch'))),
      (error: unknown) => error instanceof GenerationProcessorError && error.code === 'CLOSED',
    )
  })
})

test('Project cancellation waits for a claimed row to acquire and release its local worker owner', async () => {
  await withFixture(async (fixture) => {
    let claimedResolve!: () => void
    const claimed = new Promise<void>((resolve) => {
      claimedResolve = resolve
    })
    let releaseClaim!: () => void
    const claimGate = new Promise<void>((resolve) => {
      releaseClaim = resolve
    })
    let cancelRecorded!: () => void
    const cancellationRequested = new Promise<void>((resolve) => {
      cancelRecorded = resolve
    })
    class PausedClaimQueue extends GenerationQueueRepository {
      override async cancel(id: string, sequence?: number) {
        const item = await super.cancel(id, sequence)
        if (item.status === 'running' && item.cancelRequested) {
          cancelRecorded()
        }
        return item
      }

      override async claimNextPending() {
        const item = await super.claimNextPending()
        claimedResolve()
        await claimGate
        return item
      }
    }
    const queue = new PausedClaimQueue(fixture.database.db, fixture.root)
    await queue.recoverAfterRestart()
    const id = await enqueue(fixture)
    const processor = new GenerationProcessor(
      queue,
      fixture.staging,
      fixture.modelService,
      path.join(fixture.root, 'scratch'),
    )
    let workerExits = 0
    const run = processor.runOne(
      transport(
        async () => assert.fail('a Project close must stop a claimed job before dispatch'),
        qualifiedReady,
        async () => {
          workerExits += 1
        },
      ),
    )
    await claimed
    const cancel = processor.cancelAndWait(id)
    await cancellationRequested
    assert.equal((await queue.loadVerifiedInput(id)).item.status, 'running')
    releaseClaim()
    assert.equal((await cancel).status, 'canceled')
    assert.deepEqual(await run, { kind: 'canceled', queueItemId: id })
    assert.equal(workerExits, 1)
    const projectKey = (await queue.loadVerifiedInput(id)).item.localProjectKey
    assert.deepEqual(await fixture.staging.listVerifiedCandidates(projectKey), [])
  })
})

test('shutdown keeps running slot until worker exit is confirmed', async () => {
  await withFixture(async (fixture) => {
    const id = await enqueue(fixture)
    let enteredResolve!: () => void
    const entered = new Promise<void>((resolve) => {
      enteredResolve = resolve
    })
    let releaseExit!: () => void
    const exited = new Promise<void>((resolve) => {
      releaseExit = resolve
    })
    let closeEnteredResolve!: () => void
    const closeEntered = new Promise<void>((resolve) => {
      closeEnteredResolve = resolve
    })
    const run = fixture.processor.runOne(
      transport(
        async () => {
          enteredResolve()
          return await new Promise<never>(() => undefined)
        },
        qualifiedReady,
        async () => {
          closeEnteredResolve()
          await exited
        },
      ),
    )
    await entered
    const stopping = fixture.processor.stopAndCancelActive()
    await closeEntered
    const during = await fixture.queue.loadVerifiedInput(id)
    assert.equal(during.item.status, 'running')
    assert.equal(during.item.cancelRequested, true)
    releaseExit()
    await stopping
    assert.deepEqual(await run, { kind: 'canceled', queueItemId: id })
    assert.equal((await fixture.queue.loadVerifiedInput(id)).item.status, 'canceled')
  })
})

test('failed close does not acknowledge an active cancellation', async () => {
  await withFixture(async (fixture) => {
    const id = await enqueue(fixture)
    const secondId = await enqueue(fixture)
    let enterResolve!: (request: IllustriousGenerationRequestV1) => void
    const entered = new Promise<IllustriousGenerationRequestV1>((resolve) => {
      enterResolve = resolve
    })
    let lateDone!: (response: unknown) => void
    const workerResponse = new Promise<unknown>((resolve) => {
      lateDone = resolve
    })
    let exitAttemptResolve!: () => void
    const exitAttempt = new Promise<void>((resolve) => {
      exitAttemptResolve = resolve
    })
    let failExit!: (error: Error) => void
    const exit = new Promise<void>((_resolve, reject) => {
      failExit = reject
    })
    let closeAttempts = 0
    const run = fixture.processor.runOne(
      transport(
        async (request) => {
          enterResolve(request)
          return await workerResponse
        },
        qualifiedReady,
        async () => {
          closeAttempts += 1
          exitAttemptResolve()
          if (closeAttempts === 1) {
            await exit
          }
        },
      ),
    )
    const request = await entered
    const cancel = fixture.processor.cancel(id)
    await exitAttempt
    let runSettled = false
    void run.then(
      () => {
        runSettled = true
      },
      () => {
        runSettled = true
      },
    )
    await new Promise<void>((resolve) => setImmediate(resolve))
    assert.equal(runSettled, false)
    const during = await fixture.queue.loadVerifiedInput(id)
    assert.equal(during.item.status, 'running')
    assert.equal(during.item.cancelRequested, true)
    const runFailure = assert.rejects(
      run,
      (error: unknown) =>
        error instanceof GenerationProcessorError && error.code === 'WORKER_EXIT_UNCONFIRMED',
    )
    const cancelFailure = assert.rejects(cancel, /exit was not confirmed/)
    failExit(new Error('exit was not confirmed'))
    await cancelFailure
    await runFailure
    const after = await fixture.queue.loadVerifiedInput(id)
    assert.equal(after.item.status, 'running')
    assert.equal(after.item.cancelRequested, true)
    assert.deepEqual(await fixture.staging.listVerifiedCandidates(after.item.localProjectKey), [])
    assert.equal((await readdir(path.join(fixture.root, 'scratch'))).length, 1)
    assert.equal(await fixture.queue.claimNextPending(), null)
    await assert.rejects(
      fixture.processor.runOne(
        transport(async () => {
          assert.fail('second job must wait for confirmed exit')
        }),
      ),
      (error: unknown) => error instanceof GenerationProcessorError && error.code === 'BUSY',
    )
    assert.equal((await fixture.processor.cancel(id)).status, 'canceled')
    assert.equal(closeAttempts, 2)
    lateDone({
      outputPath: request.job.output.pngPath,
      protocolVersion: '1',
      requestId: request.requestId,
      seed: 42,
      type: 'generation-done',
    })
    assert.deepEqual(await fixture.staging.listVerifiedCandidates(after.item.localProjectKey), [])
    assert.deepEqual(await readdir(path.join(fixture.root, 'scratch')), [])
    const second = await fixture.processor.runOne(
      transport(async (nextRequest) => await writeDone(nextRequest, fixture.outputBytes)),
    )
    assert.equal(second.kind, 'completed')
    assert.equal(second.queueItemId, secondId)
  })
})

test('cancel retains the running slot until worker exit and rejects a late done', async () => {
  await withFixture(async (fixture) => {
    const id = await enqueue(fixture)
    let enterResolve!: (request: IllustriousGenerationRequestV1) => void
    const entered = new Promise<IllustriousGenerationRequestV1>((resolve) => {
      enterResolve = resolve
    })
    let doneResolve!: (value: unknown) => void
    const done = new Promise<unknown>((resolve) => {
      doneResolve = resolve
    })
    let closeResolve!: () => void
    const exited = new Promise<void>((resolve) => {
      closeResolve = resolve
    })
    let closeEnteredResolve!: () => void
    const closeEntered = new Promise<void>((resolve) => {
      closeEnteredResolve = resolve
    })
    const run = fixture.processor.runOne(
      transport(
        async (request) => {
          enterResolve(request)
          return await done
        },
        qualifiedReady,
        async () => {
          closeEnteredResolve()
          await exited
        },
      ),
    )
    const request = await entered
    const cancel = fixture.processor.cancel(id)
    await closeEntered
    doneResolve(await writeDone(request, fixture.outputBytes))
    let runSettled = false
    void run.finally(() => {
      runSettled = true
    })
    await new Promise<void>((resolve) => setImmediate(resolve))
    assert.equal(runSettled, false)
    const stillRunning = await fixture.queue.loadVerifiedInput(id)
    assert.equal(stillRunning.item.status, 'running')
    assert.equal(stillRunning.item.cancelRequested, true)
    assert.equal(await fixture.queue.claimNextPending(), null)
    closeResolve()
    assert.equal((await cancel).status, 'canceled')
    assert.deepEqual(await run, { kind: 'canceled', queueItemId: id })
    assert.deepEqual(
      await fixture.staging.listVerifiedCandidates(stillRunning.item.localProjectKey),
      [],
    )
    assert.deepEqual(await readdir(path.join(fixture.root, 'scratch')), [])
  })
})

const progressReady: InferenceWorkerReady = {
  ...qualifiedReady,
  capabilities: ['illustrious-txt2img', 'denoising-progress'],
  workerVersion: '0.3.0',
}

test('denoising progress is transient: final step does not publish or mutate frozen jobs', async () => {
  await withFixture(async (fixture) => {
    const id = await enqueue(fixture)
    let send!: (progress: GenerationDenoisingProgress) => void
    let finish!: () => void
    let entered!: () => void
    const dispatched = new Promise<void>((resolve) => {
      entered = resolve
    })
    const terminal = new Promise<void>((resolve) => {
      finish = resolve
    })
    const beforeIgs = await readFile(path.join(fixture.root, 'Project.igs'))
    let lifecycleChanges = 0
    const snapshots: GenerationProgressSnapshot[] = []
    fixture.processor.onChanged(() => {
      lifecycleChanges += 1
    })
    fixture.processor.onProgress(() => {
      throw new Error('observer failure')
    })
    fixture.processor.onProgress((snapshot) => {
      snapshots.push(snapshot)
      if (snapshot.current) {
        snapshot.current.step = 99
      }
    })
    const run = fixture.processor.runOne({
      close: async () => undefined,
      generate: async (request, onProgress) => {
        assert.ok(onProgress)
        send = onProgress
        entered()
        await terminal
        return await writeDone(request, fixture.outputBytes)
      },
      ready: progressReady,
    })
    await dispatched
    const before = await fixture.queue.loadVerifiedInput(id)
    const changesBefore = lifecycleChanges
    send({ step: 1, totalSteps: 24 })
    assert.equal(fixture.processor.getProgressSnapshot().current?.step, 1)
    const first = fixture.processor.getProgressSnapshot()
    send({ step: 1, totalSteps: 24 })
    send({ step: 0, totalSteps: 24 })
    send({ step: 2, totalSteps: 25 })
    assert.deepEqual(fixture.processor.getProgressSnapshot(), first)
    send({ step: 24, totalSteps: 24 })
    assert.equal(fixture.processor.getProgressSnapshot().current?.step, 24)
    assert.deepEqual(await fixture.queue.loadVerifiedInput(id), before)
    assert.equal(
      lifecycleChanges,
      changesBefore,
      'steps must not trigger staging/history invalidation',
    )
    assert.deepEqual(await fixture.staging.listVerifiedCandidates(before.item.localProjectKey), [])
    assert.deepEqual(await readFile(path.join(fixture.root, 'Project.igs')), beforeIgs)
    finish()
    assert.equal((await run).kind, 'completed')
    assert.equal(fixture.processor.getProgressSnapshot().current, null)
    assert.ok(fixture.processor.getProgressSnapshot().revision > first.revision)
    assert.equal(
      (await fixture.staging.listVerifiedCandidates(before.item.localProjectKey)).length,
      1,
    )
    const completed = fixture.processor.getProgressSnapshot()
    send({ step: 23, totalSteps: 24 })
    assert.deepEqual(fixture.processor.getProgressSnapshot(), completed)
    assert.equal(snapshots.length, 3)
  })
})

test('cancellation clears progress before confirmed exit and old callbacks cannot affect the next job', async () => {
  await withFixture(async (fixture) => {
    const firstId = await enqueue(fixture)
    let firstSend!: (progress: GenerationDenoisingProgress) => void
    let firstEntered!: () => void
    let closeEntered!: () => void
    let releaseExit!: () => void
    const dispatched = new Promise<void>((resolve) => {
      firstEntered = resolve
    })
    const closing = new Promise<void>((resolve) => {
      closeEntered = resolve
    })
    const exit = new Promise<void>((resolve) => {
      releaseExit = resolve
    })
    const firstRun = fixture.processor.runOne({
      close: async () => {
        closeEntered()
        await exit
      },
      generate: async (_request, onProgress) => {
        assert.ok(onProgress)
        firstSend = onProgress
        firstEntered()
        return await new Promise(() => {})
      },
      ready: progressReady,
    })
    await dispatched
    firstSend({ step: 1, totalSteps: 24 })
    const cancel = fixture.processor.cancelAndWait(firstId)
    assert.equal(fixture.processor.getProgressSnapshot().current, null)
    await closing
    firstSend({ step: 2, totalSteps: 24 })
    assert.equal(fixture.processor.getProgressSnapshot().current, null)
    assert.equal((await fixture.queue.loadVerifiedInput(firstId)).item.status, 'running')
    releaseExit()
    assert.equal((await cancel).status, 'canceled')
    assert.equal((await firstRun).kind, 'canceled')
    const secondId = await enqueue(fixture)
    let secondSend!: (progress: GenerationDenoisingProgress) => void
    let secondEntered!: () => void
    let finish!: () => void
    const secondDispatched = new Promise<void>((resolve) => {
      secondEntered = resolve
    })
    const done = new Promise<void>((resolve) => {
      finish = resolve
    })
    const secondRun = fixture.processor.runOne({
      close: async () => undefined,
      generate: async (request, onProgress) => {
        assert.ok(onProgress)
        secondSend = onProgress
        secondEntered()
        await done
        return await writeDone(request, fixture.outputBytes)
      },
      ready: progressReady,
    })
    await secondDispatched
    secondSend({ step: 1, totalSteps: 47 })
    const current = fixture.processor.getProgressSnapshot()
    assert.equal(current.current?.jobId, secondId)
    assert.equal(current.current?.step, 1)
    firstSend({ step: 3, totalSteps: 24 })
    assert.deepEqual(fixture.processor.getProgressSnapshot(), current)
    secondSend({ step: 2, totalSteps: 47 })
    assert.equal(fixture.processor.getProgressSnapshot().current?.step, 2)
    finish()
    assert.equal((await secondRun).kind, 'completed')
    assert.equal(fixture.processor.getProgressSnapshot().current, null)
  })
})

// Boundary: real processor → SQLite completion → staging cache. The peer is only inference.
// Invariant: only the explicitly qualified 0.4 peer can nominate an optional derivative.
// Neighbor: absent/malformed thumbnail keeps the same valid PNG completion; legacy extras ignored.
// Mutation: drop the capability check and accept derivative nominations from an older peer.
test('processor forwards candidate thumbnails only from the qualified finite worker capability', async () => {
  await withFixture(async (fixture) => {
    const thumbnailBytes = await readFile(
      path.resolve('src/main/projects/test-fixtures/candidate-thumbnail-64x64.webp'),
    )
    const currentReady: InferenceWorkerReady = {
      ...qualifiedReady,
      capabilities: ['illustrious-txt2img', 'denoising-progress', 'candidate-thumbnails'],
      workerVersion: '0.4.0',
    }
    const progressOnlyReady: InferenceWorkerReady = {
      ...qualifiedReady,
      capabilities: ['illustrious-txt2img', 'denoising-progress'],
      workerVersion: '0.3.0',
    }
    for (const [workerReady, mode] of [
      [qualifiedReady, 'valid'],
      [progressOnlyReady, 'valid'],
      [currentReady, 'valid'],
      [currentReady, 'malformed'],
      [currentReady, 'absent'],
    ] as const) {
      const id = await enqueue(fixture)
      const result = await fixture.processor.runOne(
        transport(async (request) => {
          const done = await writeDone(request, fixture.outputBytes)
          if (mode === 'absent') {
            return done
          }
          const outputPath = `${request.job.output.pngPath}.thumb.webp`
          await writeFile(outputPath, thumbnailBytes, { mode: 0o600 })
          return {
            ...done,
            thumbnail:
              mode === 'malformed'
                ? { outputPath, sha256: 'f'.repeat(64) }
                : {
                    byteSize: thumbnailBytes.length,
                    height: 64,
                    outputPath,
                    sha256: sha256(thumbnailBytes),
                    width: 64,
                  },
          }
        }, workerReady),
      )
      assert.equal(result.kind, 'completed')
      assert.equal(result.queueItemId, id)
      if (result.kind !== 'completed') {
        assert.fail('the valid PNG must complete independently of its optional cache')
      }
      assert.equal(
        Boolean(result.candidate.thumbnail),
        workerReady.workerVersion === '0.4.0' && mode === 'valid',
      )
      assert.deepEqual(await readFile(result.candidate.assetPath), fixture.outputBytes)
      assert.equal((await fixture.queue.getManagerEntry(id))?.status, 'completed')
      assert.equal(
        await fixture.staging.readLastActualSeed(
          result.candidate.localProjectKey,
          result.candidate.documentId,
        ),
        42,
      )
    }
    assert.deepEqual(await readdir(path.join(fixture.root, 'scratch')), [])
  })
})

const img2imgReady: InferenceWorkerReady = {
  ...qualifiedReady,
  capabilities: [
    'illustrious-txt2img',
    'denoising-progress',
    'candidate-thumbnails',
    'illustrious-cfg-rescale',
    'illustrious-img2img',
  ],
  workerVersion: '0.6.0',
}

async function opaquePreparation(fixture: Fixture, denoisingStrength: number) {
  const targetPngBytes = await srgbPng(true)
  return {
    context: {
      ...fixture.prepared.context,
      kind: 'normal-img2img-preparation' as const,
      sampling: { ...fixture.prepared.context.sampling, cfgRescale: 0, denoisingStrength },
      target: {
        ...fixture.prepared.context.target,
        byteSize: targetPngBytes.length,
        sha256: sha256(targetPngBytes),
      },
    },
    targetPngBytes,
  }
}

async function enqueueOpaque(fixture: Fixture, denoisingStrength: number) {
  const prepared = await opaquePreparation(fixture, denoisingStrength)
  return await withIllustriousGenerationRequest({
    modelService: fixture.modelService,
    prepared,
    ready: img2imgReady,
    scratchBasePath: path.join(fixture.root, 'scratch'),
    use: async (request) =>
      await fixture.queue.enqueueIllustriousGeneration({
        prepared,
        projectPath: path.join(fixture.root, 'Project.igs'),
        request,
        stagingSessionId: randomUUID(),
      }),
  })
}

test('opaque img2img keeps frozen strength through Retry, restart, Add and portable Save', async (t) => {
  for (const strength of [0, 0.65, 1]) {
    await t.test(`strength ${strength}`, async () => {
      await withFixture(async (fixture) => {
        const neighbor = await enqueue(fixture)
        await fixture.queue.cancel(neighbor)
        const original = await enqueueOpaque(fixture, strength)
        const canceled = await fixture.queue.cancel(original.id)
        // Retry copies the original opaque target and sampling, independently of later draft choices.
        let retry = await fixture.queue.retryTerminal(original.id, canceled.statusSequence)
        await fixture.queue.recoverAfterRestart()
        const recovered = await fixture.queue.loadVerifiedRetryInput(retry.id)
        assert.equal(recovered.item.status, 'canceled')
        assert.equal(recovered.payload.kind, 'illustrious-img2img')
        if (recovered.payload.kind !== 'illustrious-img2img') {
          assert.fail('wrong recovered operation')
        }
        assert.equal(recovered.payload.context.sampling.denoisingStrength, strength)
        retry = await fixture.queue.retryTerminal(retry.id, recovered.item.statusSequence)
        const frozen = illustriousInput(await fixture.queue.loadVerifiedInput(retry.id))
        assert.equal(frozen.payload.kind, 'illustrious-img2img')
        if (frozen.payload.kind !== 'illustrious-img2img') {
          assert.fail('wrong durable operation')
        }
        assert.equal(frozen.payload.context.sampling.denoisingStrength, strength)
        assert.equal(frozen.payload.workerJob.sampling.denoisingStrength, strength)
        const page = await fixture.queue.listManagerPage()
        assert.equal(
          page.items.find((item) => item.id === retry.id)?.details?.sampling.denoisingStrength,
          strength,
        )
        assert.equal(
          page.items.find((item) => item.id === neighbor)?.details?.sampling.denoisingStrength,
          undefined,
        )
        await fixture.queue.deleteTerminal(
          original.id,
          (await fixture.queue.loadVerifiedInput(original.id)).item.statusSequence,
        )
        const result = await fixture.processor.runOne(
          transport(async (request) => {
            assert.equal(request.type, 'generate-illustrious-img2img')
            if (request.type !== 'generate-illustrious-img2img') {
              assert.fail('wrong transport operation')
            }
            assert.equal(request.job.sampling.denoisingStrength, strength)
            assert.deepEqual(await readFile(request.job.target.path), await srgbPng(true))
            return await writeDone(request, fixture.outputBytes, 0)
          }, img2imgReady),
        )
        assert.equal(result.kind, 'completed')
        const completed = await fixture.queue.loadVerifiedInput(retry.id)
        // Pruned queue rows do not remove the staging context needed for acceptance.
        await fixture.queue.deleteTerminal(retry.id, completed.item.statusSequence)
        await fixture.staging.recoverAfterRestart()
        const candidates = await fixture.staging.listVerifiedCandidates(retry.localProjectKey)
        assert.equal(candidates.length, 1)
        await withAcceptance(fixture, retry.localProjectKey, async (owner, acceptance) => {
          await owner.applyDocument({
            ...owner.document,
            generationDraft: {
              ...owner.document.generationDraft,
              sampling: { ...owner.document.generationDraft.sampling, denoisingStrength: 0.2 },
            },
          })
          assert.equal(
            (await acceptance.accept(retry.localProjectKey, [retry.id], retry.id, [retry.id])).kind,
            'accepted',
          )
          await owner.save({ lastActualSeedSnapshot: 0 })
          const saved = await readIgsPackage(path.join(fixture.root, 'Project.igs'))
          const provenance = requireRasterLayer(saved.project.layers[0])?.generationProvenance
          assert.equal(provenance?.kind, 'illustrious-img2img')
          if (provenance?.kind !== 'illustrious-img2img') {
            assert.fail('wrong portable operation')
          }
          assert.equal(provenance.generationConfiguration.mode, 'img2img')
          assert.equal(provenance.generationConfiguration.sampling.denoisingStrength, strength)
          assert.equal(provenance.generationConfiguration.sampling.actualSeed, 0)
          assert.equal(provenance.generationConfiguration.cfgRescale, 0)
          assert.equal(
            provenance.layerSourceContext.sourceTargetSha256,
            frozen.payload.context.target.sha256,
          )
          assert.deepEqual(
            await saved.readMember(requireRasterLayer(saved.project.layers[0]).asset.path),
            fixture.outputBytes,
          )
        })
      })
    })
  }
})

test('opaque admission rejects old peers, crossed strength and mislabeled alpha without a visible row', async () => {
  await withFixture(async (fixture) => {
    const prepared = await opaquePreparation(fixture, 0.65)
    let materialized = false
    await assert.rejects(
      withIllustriousGenerationRequest({
        modelService: fixture.modelService,
        prepared,
        ready: qualifiedReady,
        scratchBasePath: path.join(fixture.root, 'scratch'),
        use: async () => {
          materialized = true
        },
      }),
      { code: 'INFERENCE_UNAVAILABLE' },
    )
    assert.equal(materialized, false)
    await withIllustriousGenerationRequest({
      modelService: fixture.modelService,
      prepared,
      ready: img2imgReady,
      scratchBasePath: path.join(fixture.root, 'scratch'),
      use: async (request) => {
        if (request.type !== 'generate-illustrious-img2img') {
          assert.fail('wrong request operation')
        }
        const { denoisingStrength: _strength, ...txtSampling } = request.job.sampling
        await assert.rejects(
          fixture.queue.enqueueIllustriousGeneration({
            prepared: {
              ...prepared,
              context: {
                ...prepared.context,
                kind: 'normal-txt2img-preparation',
                sampling: fixture.prepared.context.sampling,
              },
            },
            projectPath: path.join(fixture.root, 'Project.igs'),
            request: {
              ...request,
              job: { ...request.job, sampling: txtSampling },
              type: 'generate-illustrious-txt2img',
            },
            stagingSessionId: randomUUID(),
          }),
          { code: 'QUEUE_INPUT_INVALID' },
        )
        for (const denoisingStrength of [0, -0.1, 1.01, NaN]) {
          await assert.rejects(
            fixture.queue.enqueueIllustriousGeneration({
              prepared,
              projectPath: path.join(fixture.root, 'Project.igs'),
              request: {
                ...request,
                job: { ...request.job, sampling: { ...request.job.sampling, denoisingStrength } },
              },
              stagingSessionId: randomUUID(),
            }),
            { code: 'QUEUE_INPUT_INVALID' },
          )
        }
        await assert.rejects(
          fixture.queue.enqueueIllustriousGeneration({
            prepared: {
              ...prepared,
              context: { ...prepared.context, target: fixture.prepared.context.target },
              targetPngBytes: fixture.prepared.targetPngBytes,
            },
            projectPath: path.join(fixture.root, 'Project.igs'),
            request: {
              ...request,
              job: {
                ...request.job,
                target: { ...request.job.target, ...fixture.prepared.context.target },
              },
            },
            stagingSessionId: randomUUID(),
          }),
          { code: 'QUEUE_INPUT_INVALID' },
        )
      },
    })
    assert.equal((await fixture.queue.listManagerPage()).items.length, 0)
    const neighbor = await enqueue(fixture)
    assert.equal(
      (await fixture.queue.loadVerifiedInput(neighbor)).payload.kind,
      'illustrious-txt2img',
    )
  })
})

test('durable img2img reads reject crossed strength and operation even with a coherent file manifest', async () => {
  await withFixture(async (fixture) => {
    const item = await enqueueOpaque(fixture, 0.65)
    const row = await fixture.database.db
      .selectFrom('generation_queue_item')
      .selectAll()
      .where('id', '=', item.id)
      .executeTakeFirstOrThrow()
    await fixture.database.db
      .updateTable('generation_queue_item')
      .set({ operation: 'illustrious-txt2img' })
      .where('id', '=', item.id)
      .execute()
    await assert.rejects(fixture.queue.loadVerifiedInput(item.id), { code: 'QUEUE_INPUT_INVALID' })
    await fixture.database.db
      .updateTable('generation_queue_item')
      .set({ operation: row.operation })
      .where('id', '=', item.id)
      .execute()
    assert.equal(
      (await fixture.queue.loadVerifiedInput(item.id)).payload.kind,
      'illustrious-img2img',
    )
    const target = await fixture.queue.loadVerifiedInput(item.id)
    const manifestPath = path.join(path.dirname(target.targetPath), 'manifest.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    const payload = JSON.parse(row.frozen_payload_json)
    payload.context.sampling.denoisingStrength = 0.8
    const crossed = JSON.stringify(payload)
    manifest.payloadSha256 = sha256(Buffer.from(crossed))
    await fixture.database.db
      .updateTable('generation_queue_item')
      .set({ frozen_payload_json: crossed })
      .where('id', '=', item.id)
      .execute()
    await writeFile(manifestPath, JSON.stringify(manifest), { mode: 0o600 })
    await assert.rejects(fixture.queue.loadVerifiedInput(item.id), { code: 'QUEUE_INPUT_INVALID' })
    const neighbor = await enqueue(fixture)
    const claimed = await fixture.queue.claimNextPending()
    assert.equal(claimed?.item.id, neighbor)
    assert.equal(
      (await fixture.queue.listManagerPage()).items.find((entry) => entry.id === item.id)?.status,
      'failed',
    )
  })
})

const loraReady: InferenceWorkerReady = {
  ...img2imgReady,
  capabilities: [...img2imgReady.capabilities, 'illustrious-lora'],
  workerVersion: '0.7.0',
}

const precisionReady: InferenceWorkerReady = {
  ...loraReady,
  capabilities: [...loraReady.capabilities, 'illustrious-vae-precision'],
  workerVersion: '0.8.0',
}

const externalVaeReady: InferenceWorkerReady = {
  ...precisionReady,
  capabilities: [...precisionReady.capabilities, 'illustrious-external-vae'],
  workerVersion: '0.9.0',
}

// Boundary: actual SQLite queue and private input manifests -> Retry -> dispatch -> recovered
// staging -> Add -> portable .igs. Transport is controlled; it does not establish ML loading.
test('external, Embedded and unrecorded VAE choices survive both normal modes, Retry, staging recovery, Add and Save', async (t) => {
  for (const opaque of [false, true]) {
    for (const choice of ['external', 'embedded', 'legacy'] as const) {
      await t.test(`${opaque ? 'img2img' : 'txt2img'} ${choice}`, async () => {
        await withFixture(async (fixture) => {
          const file = await publishIllustriousVaeFixture(
            fixture.modelService.repository,
            fixture.root,
            800,
            801,
          )
          const selected = await fixture.modelService.resolveGenerationVae(
            file.resourceId,
            file.versionId,
          )
          const verified = await fixture.modelService.resolveVerifiedGenerationVaeForPlan(selected)
          const base = opaque ? await opaquePreparation(fixture, 0.65) : fixture.prepared
          const prepared = {
            context: structuredClone(base.context),
            targetPngBytes: Buffer.from(base.targetPngBytes),
          }
          if (choice !== 'legacy') {
            prepared.context.vae = choice === 'external' ? verified : null
          }
          const expected = choice === 'legacy' ? undefined : choice === 'external' ? selected : null
          const original = await withIllustriousGenerationRequest({
            modelService: fixture.modelService,
            prepared,
            ready: externalVaeReady,
            scratchBasePath: path.join(fixture.root, 'scratch'),
            use: async (request) => {
              assert.deepEqual(request.job.vae, workerVae(prepared.context))
              const crossed = structuredClone(request)
              crossed.job.vae = choice === 'external' ? null : workerVae({ vae: verified })
              await assert.rejects(
                fixture.queue.enqueueIllustriousGeneration({
                  prepared,
                  projectPath: path.join(fixture.root, 'Project.igs'),
                  request: crossed,
                  stagingSessionId: randomUUID(),
                }),
                { code: 'QUEUE_INPUT_INVALID' },
              )
              return await fixture.queue.enqueueIllustriousGeneration({
                prepared,
                projectPath: path.join(fixture.root, 'Project.igs'),
                request,
                stagingSessionId: randomUUID(),
              })
            },
          })
          prepared.context.vae = choice === 'external' ? null : verified
          const savedBefore = await readFile(path.join(fixture.root, 'Project.igs'))
          const canceled = await fixture.queue.cancel(original.id)
          await fixture.queue.recoverAfterRestart()
          const frozen = illustriousInput(await fixture.queue.loadVerifiedRetryInput(original.id))
          const checkRetry = async (ready: InferenceWorkerReady) =>
            await withIllustriousGenerationRequest({
              modelService: fixture.modelService,
              prepared: { context: frozen.payload.context, targetPngBytes: frozen.targetPngBytes },
              ready,
              scratchBasePath: path.join(fixture.root, 'scratch'),
              use: async (request) => {
                assert.deepEqual(request.job.vae, frozen.payload.workerJob.vae)
              },
            })
          if (choice === 'external') {
            await assert.rejects(
              fixture.queue.retryTerminal(
                original.id,
                canceled.statusSequence,
                async () => await checkRetry(precisionReady),
              ),
              { code: 'INFERENCE_UNAVAILABLE' },
            )
            assert.equal((await fixture.queue.listManagerPage()).items.length, 1)
          } else {
            await checkRetry(precisionReady)
          }
          const retried = await fixture.queue.retryTerminal(
            original.id,
            canceled.statusSequence,
            async () => await checkRetry(externalVaeReady),
          )
          const copied = illustriousInput(await fixture.queue.loadVerifiedInput(retried.id))
          assert.deepEqual(copied.payload.context.vae, frozen.payload.context.vae)
          assert.deepEqual(copied.payload.workerJob.vae, frozen.payload.workerJob.vae)
          const completed = await fixture.processor.runOne(
            transport(async (request) => {
              assert.deepEqual(request.job.vae, frozen.payload.workerJob.vae)
              assert.equal(
                request.type,
                opaque ? 'generate-illustrious-img2img' : 'generate-illustrious-txt2img',
              )
              return await writeDone(request, fixture.outputBytes, 42)
            }, externalVaeReady),
          )
          assert.equal(completed.kind, 'completed')
          const finished = illustriousInput(await fixture.queue.loadVerifiedInput(retried.id))
          await fixture.queue.deleteTerminal(retried.id, finished.item.statusSequence)
          await fixture.staging.recoverAfterRestart()
          const candidates = await fixture.staging.listVerifiedCandidates(retried.localProjectKey)
          assert.equal(candidates.length, 1)
          assert.deepEqual(
            JSON.parse(candidates[0].frozenPayloadJson).context.vae,
            frozen.payload.context.vae,
          )
          assert.deepEqual(await readFile(path.join(fixture.root, 'Project.igs')), savedBefore)
          await withAcceptance(fixture, retried.localProjectKey, async (owner, acceptance) => {
            await owner.applyDocument({
              ...owner.document,
              generationDraft: { ...owner.document.generationDraft, vae: selected },
            })
            assert.equal(
              (
                await acceptance.accept(retried.localProjectKey, [retried.id], retried.id, [
                  retried.id,
                ])
              ).kind,
              'accepted',
            )
            await owner.save()
            const saved = await readIgsPackage(path.join(fixture.root, 'Project.igs'))
            const provenance = requireRasterLayer(saved.project.layers[0])?.generationProvenance
            assert.ok(
              provenance?.kind === 'illustrious-txt2img' ||
                provenance?.kind === 'illustrious-img2img',
            )
            const configuration = provenance.generationConfiguration
            assert.deepEqual(configuration?.vae, expected)
            assert.equal(Object.hasOwn(configuration, 'vae'), choice !== 'legacy')
            assert.deepEqual(saved.project.generationDraft.vae, selected)
            assert.equal(JSON.stringify(configuration).includes(file.managedPath), false)
          })
        })
      })
    }
  }
})

test('external VAE dispatch rechecks qualified capability and exact original bytes without substituting Default', async () => {
  for (const changed of ['capability', 'bytes', 'missing'] as const) {
    await withFixture(async (fixture) => {
      const file = await publishIllustriousVaeFixture(
        fixture.modelService.repository,
        fixture.root,
        810,
        811,
      )
      const reference = await fixture.modelService.resolveGenerationVae(
        file.resourceId,
        file.versionId,
      )
      fixture.prepared.context.vae =
        await fixture.modelService.resolveVerifiedGenerationVaeForPlan(reference)
      await withIllustriousGenerationRequest({
        modelService: fixture.modelService,
        prepared: fixture.prepared,
        ready: externalVaeReady,
        scratchBasePath: path.join(fixture.root, 'scratch'),
        use: async (request) =>
          await fixture.queue.enqueueIllustriousGeneration({
            prepared: fixture.prepared,
            projectPath: path.join(fixture.root, 'Project.igs'),
            request,
            stagingSessionId: randomUUID(),
          }),
      })
      const defaultFile = await publishIllustriousVaeFixture(
        fixture.modelService.repository,
        fixture.root,
        810,
        812,
        'diffusers',
      )
      await fixture.modelService.repository.setDefaultVersion(
        defaultFile.resourceId,
        defaultFile.versionId,
      )
      if (changed === 'bytes') {
        await writeFile(file.managedPath, Buffer.alloc(file.bytes.length, 1))
      }
      if (changed === 'missing') {
        await rm(file.managedPath)
      }
      let called = 0
      const result = await fixture.processor.runOne(
        transport(
          async () => {
            called += 1
            throw new Error('External VAE should have been refused before transport.')
          },
          changed === 'capability' ? precisionReady : externalVaeReady,
        ),
      )
      assert.equal(result.kind, 'failed')
      assert.equal(called, 0)
      const item = (await fixture.queue.listManagerPage()).items[0]
      assert.equal(item.status, 'failed')
      assert.deepEqual(
        await fixture.staging.listVerifiedCandidates(
          (await fixture.queue.loadVerifiedInput(item.id)).item.localProjectKey,
        ),
        [],
      )
    })
  }
})

test('external VAE materialization refuses a coherent frozen alternate path or size after exact registry verification', async () => {
  await withFixture(async (fixture) => {
    const file = await publishIllustriousVaeFixture(
      fixture.modelService.repository,
      fixture.root,
      830,
      831,
    )
    const reference = await fixture.modelService.resolveGenerationVae(
      file.resourceId,
      file.versionId,
    )
    const verified = await fixture.modelService.resolveVerifiedGenerationVaeForPlan(reference)
    const alternatePath = path.join(fixture.root, 'identical-bytes-alternate-vae.safetensors')
    await writeFile(alternatePath, file.bytes)
    let materialized = 0
    for (const changed of ['path', 'size'] as const) {
      const prepared = {
        context: structuredClone(fixture.prepared.context),
        targetPngBytes: fixture.prepared.targetPngBytes,
      }
      prepared.context.vae = structuredClone(verified)
      if (changed === 'path') {
        prepared.context.vae.managedPath = alternatePath
      } else {
        prepared.context.vae.byteSize += 2
      }
      await assert.rejects(
        withIllustriousGenerationRequest({
          modelService: fixture.modelService,
          prepared,
          ready: externalVaeReady,
          scratchBasePath: path.join(fixture.root, 'scratch'),
          use: async () => {
            materialized += 1
          },
        }),
        /The exact VAE changed after preparation/,
      )
    }
    fixture.prepared.context.vae = verified
    await withIllustriousGenerationRequest({
      modelService: fixture.modelService,
      prepared: fixture.prepared,
      ready: externalVaeReady,
      scratchBasePath: path.join(fixture.root, 'scratch'),
      use: async () => {
        materialized += 1
      },
    })
    assert.equal(materialized, 1)
  })
})

test('durable VAE contexts refuse crossed file identity and dropped choices with a valid manifest hash, retaining legacy neighbor', async () => {
  await withFixture(async (fixture) => {
    const file = await publishIllustriousVaeFixture(
      fixture.modelService.repository,
      fixture.root,
      820,
      821,
    )
    const reference = await fixture.modelService.resolveGenerationVae(
      file.resourceId,
      file.versionId,
    )
    const verified = await fixture.modelService.resolveVerifiedGenerationVaeForPlan(reference)
    const invalidIds: string[] = []
    for (const mutate of [
      (payload: FrozenQueuedIllustriousGenerationV1) => {
        payload.context.vae = null
      },
      (payload: FrozenQueuedIllustriousGenerationV1) => {
        payload.workerJob.vae = null
      },
      (payload: FrozenQueuedIllustriousGenerationV1) => {
        delete payload.context.vae
      },
      (payload: FrozenQueuedIllustriousGenerationV1) => {
        delete payload.workerJob.vae
      },
      (payload: FrozenQueuedIllustriousGenerationV1) => {
        payload.workerJob.vae!.sha256 = 'a'.repeat(64)
      },
      (payload: FrozenQueuedIllustriousGenerationV1) => {
        payload.workerJob.vae!.byteSize += 1
      },
      (payload: FrozenQueuedIllustriousGenerationV1) => {
        payload.context.vae!.managedPath = path.join(fixture.root, 'other-vae.safetensors')
      },
      (payload: FrozenQueuedIllustriousGenerationV1) => {
        payload.context.vae!.reference.baseModelFamily = 'anima'
      },
    ]) {
      fixture.prepared.context.vae = structuredClone(verified)
      const item = await withIllustriousGenerationRequest({
        modelService: fixture.modelService,
        prepared: fixture.prepared,
        ready: externalVaeReady,
        scratchBasePath: path.join(fixture.root, 'scratch'),
        use: async (request) =>
          await fixture.queue.enqueueIllustriousGeneration({
            prepared: fixture.prepared,
            projectPath: path.join(fixture.root, 'Project.igs'),
            request,
            stagingSessionId: randomUUID(),
          }),
      })
      const input = illustriousInput(await fixture.queue.loadVerifiedInput(item.id))
      const payload = structuredClone(input.payload)
      mutate(payload)
      const changed = JSON.stringify(payload)
      const manifestPath = path.join(path.dirname(input.targetPath), 'manifest.json')
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
      manifest.payloadSha256 = sha256(Buffer.from(changed))
      await fixture.database.db
        .updateTable('generation_queue_item')
        .set({ frozen_payload_json: changed })
        .where('id', '=', item.id)
        .execute()
      await writeFile(manifestPath, JSON.stringify(manifest), { mode: 0o600 })
      await assert.rejects(fixture.queue.loadVerifiedInput(item.id), {
        code: 'QUEUE_INPUT_INVALID',
      })
      invalidIds.push(item.id)
    }
    // Explicit Embedded cannot be dropped on one side of a newly recorded job either.
    fixture.prepared.context.vae = null
    await withIllustriousGenerationRequest({
      modelService: fixture.modelService,
      prepared: fixture.prepared,
      ready: externalVaeReady,
      scratchBasePath: path.join(fixture.root, 'scratch'),
      use: async (request) => {
        delete request.job.vae
        await assert.rejects(
          fixture.queue.enqueueIllustriousGeneration({
            prepared: fixture.prepared,
            projectPath: path.join(fixture.root, 'Project.igs'),
            request,
            stagingSessionId: randomUUID(),
          }),
          { code: 'QUEUE_INPUT_INVALID' },
        )
      },
    })
    delete fixture.prepared.context.vae
    const neighbor = await enqueue(fixture)
    const claimed = await fixture.queue.claimNextPending()
    assert.equal(claimed?.item.id, neighbor)
    assert.equal(Object.hasOwn(claimed.payload.context, 'vae'), false)
    assert.equal(Object.hasOwn(claimed.payload.workerJob, 'vae'), false)
    const statuses = (await fixture.queue.listManagerPage()).items
    for (const id of invalidIds) {
      assert.equal(statuses.find((item) => item.id === id)?.status, 'failed')
    }
  })
})

// Boundary: durable main queue -> Retry -> dispatch -> verified staging -> Add -> .igs loader.
// Neighbor: each mode/policy and legacy absence. Mutants: dropped policy, mutable retry/default,
// manual legacy admission, crossed wire policy, and invented legacy Auto metadata.
test('VAE Precision policies survive both modes, Retry, recovery, Add and explicit Save without rewriting legacy absence', async (t) => {
  for (const opaque of [false, true]) {
    for (const precision of [undefined, 'Auto', 'FP16', 'FP32'] as const) {
      await t.test(`${opaque ? 'img2img' : 'txt2img'} ${precision ?? 'legacy'}`, async () => {
        await withFixture(async (fixture) => {
          const base = opaque ? await opaquePreparation(fixture, 0.65) : fixture.prepared
          const prepared = {
            context: structuredClone(base.context),
            targetPngBytes: Buffer.from(base.targetPngBytes),
          }
          if (precision !== undefined) {
            prepared.context.vaePrecision = precision
          }
          const original = await withIllustriousGenerationRequest({
            modelService: fixture.modelService,
            prepared,
            ready: precisionReady,
            scratchBasePath: path.join(fixture.root, 'scratch'),
            use: async (request) => {
              assert.equal(request.job.vaePrecision, precision)
              const crossed = structuredClone(request)
              crossed.job.vaePrecision = precision === 'FP16' ? 'FP32' : 'FP16'
              await assert.rejects(
                fixture.queue.enqueueIllustriousGeneration({
                  prepared,
                  projectPath: path.join(fixture.root, 'Project.igs'),
                  request: crossed,
                  stagingSessionId: randomUUID(),
                }),
                { code: 'QUEUE_INPUT_INVALID' },
              )
              return await fixture.queue.enqueueIllustriousGeneration({
                prepared,
                projectPath: path.join(fixture.root, 'Project.igs'),
                request,
                stagingSessionId: randomUUID(),
              })
            },
          })
          prepared.context.vaePrecision = precision === 'FP16' ? 'FP32' : 'FP16'
          const savedBefore = await readFile(path.join(fixture.root, 'Project.igs'))
          const canceled = await fixture.queue.cancel(original.id)
          await fixture.queue.recoverAfterRestart()
          const frozen = illustriousInput(await fixture.queue.loadVerifiedRetryInput(original.id))
          const checkRetry = async (ready: InferenceWorkerReady) => {
            await withIllustriousGenerationRequest({
              modelService: fixture.modelService,
              prepared: {
                context: frozen.payload.context,
                targetPngBytes: await readFile(frozen.targetPath),
              },
              ready,
              scratchBasePath: path.join(fixture.root, 'scratch'),
              use: async (request) => {
                assert.equal(request.job.vaePrecision, precision)
              },
            })
          }
          if (precision === 'FP16' || precision === 'FP32') {
            await assert.rejects(
              fixture.queue.retryTerminal(original.id, canceled.statusSequence, async () => {
                await checkRetry(loraReady)
              }),
              { code: 'INFERENCE_UNAVAILABLE' },
            )
            assert.equal((await fixture.queue.listManagerPage()).items.length, 1)
          } else {
            await checkRetry(loraReady)
          }
          const retried = await fixture.queue.retryTerminal(
            original.id,
            canceled.statusSequence,
            async () => {
              await checkRetry(precisionReady)
            },
          )
          const copied = illustriousInput(await fixture.queue.loadVerifiedInput(retried.id))
          assert.equal(copied.payload.context.vaePrecision, precision)
          assert.equal(copied.payload.workerJob.vaePrecision, precision)
          const completed = await fixture.processor.runOne(
            transport(async (request) => {
              assert.equal(request.job.vaePrecision, precision)
              assert.equal(
                request.type,
                opaque ? 'generate-illustrious-img2img' : 'generate-illustrious-txt2img',
              )
              return await writeDone(request, fixture.outputBytes, 42)
            }, precisionReady),
          )
          assert.equal(completed.kind, 'completed')
          const finished = illustriousInput(await fixture.queue.loadVerifiedInput(retried.id))
          await fixture.queue.deleteTerminal(retried.id, finished.item.statusSequence)
          await fixture.staging.recoverAfterRestart()
          const candidates = await fixture.staging.listVerifiedCandidates(retried.localProjectKey)
          assert.equal(candidates.length, 1)
          assert.equal(JSON.parse(candidates[0].frozenPayloadJson).context.vaePrecision, precision)
          assert.deepEqual(await readFile(path.join(fixture.root, 'Project.igs')), savedBefore)
          await withAcceptance(fixture, retried.localProjectKey, async (owner, acceptance) => {
            await owner.applyDocument({
              ...owner.document,
              generationDraft: { ...owner.document.generationDraft, vaePrecision: 'FP16' },
            })
            assert.equal(
              (
                await acceptance.accept(retried.localProjectKey, [retried.id], retried.id, [
                  retried.id,
                ])
              ).kind,
              'accepted',
            )
            await owner.save()
            const saved = await readIgsPackage(path.join(fixture.root, 'Project.igs'))
            const configuration = requireRasterLayer(saved.project.layers[0])?.generationProvenance
              ?.generationConfiguration
            assert.equal(configuration?.vaePrecision, precision)
            assert.equal(Object.hasOwn(configuration!, 'vaePrecision'), precision !== undefined)
            assert.equal(saved.project.generationDraft.vaePrecision, 'FP16')
          })
        })
      })
    }
  }
})

test('manual VAE Precision is refused again at dispatch with old capabilities while Auto and legacy remain usable', async () => {
  for (const precision of [undefined, 'Auto', 'FP16', 'FP32'] as const) {
    await withFixture(async (fixture) => {
      if (precision !== undefined) {
        fixture.prepared.context.vaePrecision = precision
      }
      await withIllustriousGenerationRequest({
        modelService: fixture.modelService,
        prepared: fixture.prepared,
        ready: precisionReady,
        scratchBasePath: path.join(fixture.root, 'scratch'),
        use: async (request) => {
          await fixture.queue.enqueueIllustriousGeneration({
            prepared: fixture.prepared,
            projectPath: path.join(fixture.root, 'Project.igs'),
            request,
            stagingSessionId: randomUUID(),
          })
        },
      })
      let called = 0
      const result = await fixture.processor.runOne(
        transport(async (request) => {
          called += 1
          assert.equal(request.job.vaePrecision, precision)
          return await writeDone(request, fixture.outputBytes)
        }, loraReady),
      )
      const manual = precision === 'FP16' || precision === 'FP32'
      assert.equal(result.kind, manual ? 'failed' : 'completed')
      assert.equal(called, manual ? 0 : 1)
      if (manual) {
        const row = (await fixture.queue.listManagerPage()).items[0]
        assert.equal(row.error?.code, 'GENERATION_INPUT_CHANGED')
        const input = illustriousInput(await fixture.queue.loadVerifiedInput(row.id))
        assert.deepEqual(
          await fixture.staging.listVerifiedCandidates(input.item.localProjectKey),
          [],
        )
      }
    })
  }
})

test('durable VAE Precision reads refuse hash-consistent crossed and dropped policies and still dispatch a legacy neighbor', async () => {
  await withFixture(async (fixture) => {
    const invalidIds: string[] = []
    for (const mutate of [
      (payload: FrozenQueuedIllustriousGenerationV1) => {
        payload.context.vaePrecision = 'FP16'
      },
      (payload: FrozenQueuedIllustriousGenerationV1) => {
        payload.workerJob.vaePrecision = 'FP16'
      },
      (payload: FrozenQueuedIllustriousGenerationV1) => {
        delete payload.context.vaePrecision
      },
      (payload: FrozenQueuedIllustriousGenerationV1) => {
        delete payload.workerJob.vaePrecision
      },
    ]) {
      fixture.prepared.context.vaePrecision = 'FP32'
      const item = await withIllustriousGenerationRequest({
        modelService: fixture.modelService,
        prepared: fixture.prepared,
        ready: precisionReady,
        scratchBasePath: path.join(fixture.root, 'scratch'),
        use: async (request) =>
          await fixture.queue.enqueueIllustriousGeneration({
            prepared: fixture.prepared,
            projectPath: path.join(fixture.root, 'Project.igs'),
            request,
            stagingSessionId: randomUUID(),
          }),
      })
      const input = illustriousInput(await fixture.queue.loadVerifiedInput(item.id))
      const payload = structuredClone(input.payload)
      mutate(payload)
      const changed = JSON.stringify(payload)
      const manifestPath = path.join(path.dirname(input.targetPath), 'manifest.json')
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
      manifest.payloadSha256 = sha256(Buffer.from(changed))
      await fixture.database.db
        .updateTable('generation_queue_item')
        .set({ frozen_payload_json: changed })
        .where('id', '=', item.id)
        .execute()
      await writeFile(manifestPath, JSON.stringify(manifest), { mode: 0o600 })
      await assert.rejects(fixture.queue.loadVerifiedInput(item.id), {
        code: 'QUEUE_INPUT_INVALID',
      })
      invalidIds.push(item.id)
    }
    delete fixture.prepared.context.vaePrecision
    const neighbor = await enqueue(fixture)
    const claimed = await fixture.queue.claimNextPending()
    assert.equal(claimed?.item.id, neighbor)
    assert.equal(Object.hasOwn(claimed.payload.context, 'vaePrecision'), false)
    assert.equal(Object.hasOwn(claimed.payload.workerJob, 'vaePrecision'), false)
    const statuses = (await fixture.queue.listManagerPage()).items
    for (const id of invalidIds) {
      assert.equal(statuses.find((item) => item.id === id)?.status, 'failed')
    }
  })
})

async function preparationWithLoras(fixture: Fixture, opaque = false) {
  const active = []
  for (const [index, weight] of [-0.5, 0, 1e-10].entries()) {
    const installed = await publishIllustriousLoraFixture(
      fixture.modelService.repository,
      fixture.root,
      9500 + index,
      9600 + index,
      0.125 * (index + 1),
    )
    const selected = await fixture.modelService.resolveGenerationLora(
      installed.resourceId,
      installed.versionId,
    )
    const reference = { ...selected, displayName: `Copied authored LoRA ${index}` }
    const verified = await fixture.modelService.resolveVerifiedGenerationLoraForPlan(reference)
    active.push({ ...verified, weight })
  }
  const missing = {
    ...active[0].reference,
    baseModelFamily: 'anima' as const,
    civitaiModelId: 9700,
    localModelId: 'missing disabled resource',
    localVersionId: 'missing disabled version',
  }
  const loraStack = [
    { enabled: true, resource: active[0].reference, weight: active[0].weight },
    { enabled: false, resource: missing, weight: -0.75 },
    { enabled: true, resource: active[1].reference, weight: active[1].weight },
    { enabled: true, resource: active[2].reference, weight: active[2].weight },
  ]
  const prepared = opaque
    ? await opaquePreparation(fixture, 0.65)
    : structuredClone(fixture.prepared)
  // structuredClone does not preserve Buffer identity; keep verified pixels as a Buffer.
  return {
    context: { ...prepared.context, loras: active, loraStack },
    targetPngBytes: Buffer.from(prepared.targetPngBytes),
  }
}

test('LoRA signed/zero/tiny stack survives Retry, restart, dispatch, staging recovery, Add and explicit Save', async (t) => {
  for (const opaque of [false, true]) {
    await t.test(opaque ? 'opaque img2img' : 'transparent txt2img', async () => {
      await withFixture(async (fixture) => {
        const prepared = await preparationWithLoras(fixture, opaque)
        const stack = structuredClone(prepared.context.loraStack)
        const expectedWire = workerLoras(prepared.context)
        const original = await withIllustriousGenerationRequest({
          modelService: fixture.modelService,
          prepared,
          ready: loraReady,
          scratchBasePath: path.join(fixture.root, 'scratch'),
          use: async (request) =>
            await fixture.queue.enqueueIllustriousGeneration({
              prepared,
              projectPath: path.join(fixture.root, 'Project.igs'),
              request,
              stagingSessionId: randomUUID(),
            }),
        })
        prepared.context.loraStack[0].weight = 0.9
        prepared.context.loras[0].weight = 0.9
        const canceled = await fixture.queue.cancel(original.id)
        await fixture.queue.recoverAfterRestart()
        const beforeRetry = illustriousInput(
          await fixture.queue.loadVerifiedRetryInput(original.id),
        )
        const retry = await fixture.queue.retryTerminal(
          original.id,
          canceled.statusSequence,
          async (input) => {
            assert.deepEqual(JSON.parse(input.frozenPayloadJson).context.loraStack, stack)
            await withIllustriousGenerationRequest({
              modelService: fixture.modelService,
              prepared: {
                context: beforeRetry.payload.context,
                targetPngBytes: await readFile(beforeRetry.targetPath),
              },
              ready: loraReady,
              scratchBasePath: path.join(fixture.root, 'scratch'),
              use: async (request) => {
                assert.deepEqual(request.job.loras, expectedWire)
              },
            })
          },
        )
        assert.deepEqual(beforeRetry.payload.context.loraStack, stack)
        const copied = illustriousInput(await fixture.queue.loadVerifiedInput(retry.id))
        assert.deepEqual(copied.payload.context.loraStack, stack)
        assert.deepEqual(copied.payload.workerJob.loras, expectedWire)
        const result = await fixture.processor.runOne(
          transport(async (request) => {
            assert.equal(
              request.type,
              opaque ? 'generate-illustrious-img2img' : 'generate-illustrious-txt2img',
            )
            assert.deepEqual(request.job.loras, expectedWire)
            return await writeDone(request, fixture.outputBytes, 0)
          }, loraReady),
        )
        assert.equal(result.kind, 'completed')
        const completed = await fixture.queue.loadVerifiedInput(retry.id)
        await fixture.queue.deleteTerminal(retry.id, completed.item.statusSequence)
        await fixture.staging.recoverAfterRestart()
        assert.equal(
          (await fixture.staging.listVerifiedCandidates(retry.localProjectKey)).length,
          1,
        )
        await withAcceptance(fixture, retry.localProjectKey, async (owner, acceptance) => {
          await owner.applyDocument({
            ...owner.document,
            generationDraft: { ...owner.document.generationDraft, loras: [] },
          })
          assert.equal(
            (await acceptance.accept(retry.localProjectKey, [retry.id], retry.id, [retry.id])).kind,
            'accepted',
          )
          await owner.save({ lastActualSeedSnapshot: 0 })
          const saved = await readIgsPackage(path.join(fixture.root, 'Project.igs'))
          const provenance = requireRasterLayer(saved.project.layers[0])?.generationProvenance
          assert.deepEqual(provenance?.generationConfiguration.loras, stack)
          assert.equal(provenance?.generationConfiguration.sampling.actualSeed, 0)
          assert.equal(JSON.stringify(provenance).includes(fixture.root), false)
          assert.deepEqual(saved.project.generationDraft.loras, [])
        })
      })
    })
  }
})

test('LoRA materialization, Retry preflight and dispatch refuse old capabilities and changed exact files', async () => {
  await withFixture(async (fixture) => {
    const prepared = await preparationWithLoras(fixture)
    let materialized = false
    await assert.rejects(
      withIllustriousGenerationRequest({
        modelService: fixture.modelService,
        prepared,
        ready: img2imgReady,
        scratchBasePath: path.join(fixture.root, 'scratch'),
        use: async () => {
          materialized = true
        },
      }),
      { code: 'INFERENCE_UNAVAILABLE' },
    )
    assert.equal(materialized, false)
    assert.deepEqual(await readdir(path.join(fixture.root, 'scratch')), [])
    assert.equal((await fixture.queue.listManagerPage()).items.length, 0)
    const queued = await withIllustriousGenerationRequest({
      modelService: fixture.modelService,
      prepared,
      ready: loraReady,
      scratchBasePath: path.join(fixture.root, 'scratch'),
      use: async (request) =>
        await fixture.queue.enqueueIllustriousGeneration({
          prepared,
          projectPath: path.join(fixture.root, 'Project.igs'),
          request,
          stagingSessionId: randomUUID(),
        }),
    })
    const canceled = await fixture.queue.cancel(queued.id)
    const retryInput = illustriousInput(await fixture.queue.loadVerifiedRetryInput(queued.id))
    const retry = (ready: InferenceWorkerReady) =>
      fixture.queue.retryTerminal(queued.id, canceled.statusSequence, async (input) => {
        assert.deepEqual(
          JSON.parse(input.frozenPayloadJson).context.loraStack,
          prepared.context.loraStack,
        )
        await withIllustriousGenerationRequest({
          modelService: fixture.modelService,
          prepared: {
            context: retryInput.payload.context,
            targetPngBytes: await readFile(retryInput.targetPath),
          },
          ready,
          scratchBasePath: path.join(fixture.root, 'scratch'),
          use: async () => {},
        })
      })
    await assert.rejects(retry(img2imgReady), { code: 'INFERENCE_UNAVAILABLE' })
    assert.equal((await fixture.queue.listManagerPage()).items.length, 1)
    const actual = prepared.context.loras[0]
    const originalBytes = await readFile(actual.managedPath)
    await writeFile(actual.managedPath, Buffer.alloc(originalBytes.length, 0))
    await assert.rejects(retry(loraReady), { code: 'MODEL_FILE_CORRUPT' })
    assert.equal((await fixture.queue.listManagerPage()).items.length, 1)
    await writeFile(actual.managedPath, originalBytes)
    const validRetry = await retry(loraReady)
    let dispatched = false
    const oldPeer = await fixture.processor.runOne(
      transport(async () => {
        dispatched = true
        assert.fail('old peer may not dispatch')
      }, img2imgReady),
    )
    assert.equal(oldPeer.kind, 'failed')
    assert.equal(dispatched, false)
    assert.deepEqual(await readdir(path.join(fixture.root, 'scratch')), [])
    const second = await fixture.queue.retryTerminal(
      validRetry.id,
      (await fixture.queue.loadVerifiedInput(validRetry.id)).item.statusSequence,
    )
    await writeFile(actual.managedPath, Buffer.alloc(originalBytes.length, 0))
    const changed = await fixture.processor.runOne(
      transport(async () => {
        dispatched = true
        assert.fail('changed exact adapter may not dispatch')
      }, loraReady),
    )
    assert.equal(changed.kind, 'failed')
    assert.equal(changed.queueItemId, second.id)
    assert.equal(dispatched, false)
    assert.equal((await fixture.staging.listVerifiedCandidates(second.localProjectKey)).length, 0)
    assert.deepEqual(await readdir(path.join(fixture.root, 'scratch')), [])
  })
})

test('durable LoRA reads refuse hash-consistent authored/operational/wire disagreement and continue to a valid neighbor', async () => {
  await withFixture(async (fixture) => {
    const prepared = await preparationWithLoras(fixture)
    const mutate = [
      (payload: FrozenQueuedIllustriousGenerationV1) => {
        payload.context.loraStack![0].weight = 0.9
      },
      (payload: FrozenQueuedIllustriousGenerationV1) => {
        payload.context.loras![0].weight = 0.9
      },
      (payload: FrozenQueuedIllustriousGenerationV1) => {
        payload.workerJob.loras![0].weight = 0.9
      },
      (payload: FrozenQueuedIllustriousGenerationV1) => {
        payload.workerJob.loras![0].byteSize += 1
      },
      (payload: FrozenQueuedIllustriousGenerationV1) => {
        payload.context.loraStack!.reverse()
      },
      (payload: FrozenQueuedIllustriousGenerationV1) => {
        payload.context.loraStack![0].enabled = false
      },
      (payload: FrozenQueuedIllustriousGenerationV1) => {
        payload.context.loras![0].reference.fileSha256 = 'f'.repeat(64)
      },
      (payload: FrozenQueuedIllustriousGenerationV1) => {
        delete payload.context.loraStack
      },
      (payload: FrozenQueuedIllustriousGenerationV1) => {
        delete payload.workerJob.loras
      },
    ]
    const invalidIds: string[] = []
    for (const edit of mutate) {
      const item = await withIllustriousGenerationRequest({
        modelService: fixture.modelService,
        prepared,
        ready: loraReady,
        scratchBasePath: path.join(fixture.root, 'scratch'),
        use: async (request) =>
          await fixture.queue.enqueueIllustriousGeneration({
            prepared,
            projectPath: path.join(fixture.root, 'Project.igs'),
            request,
            stagingSessionId: randomUUID(),
          }),
      })
      const verified = await fixture.queue.loadVerifiedInput(item.id)
      const row = await fixture.database.db
        .selectFrom('generation_queue_item')
        .selectAll()
        .where('id', '=', item.id)
        .executeTakeFirstOrThrow()
      const payload = JSON.parse(row.frozen_payload_json)
      edit(payload)
      const changed = JSON.stringify(payload)
      const manifestPath = path.join(path.dirname(verified.targetPath), 'manifest.json')
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
      manifest.payloadSha256 = sha256(Buffer.from(changed))
      await fixture.database.db
        .updateTable('generation_queue_item')
        .set({ frozen_payload_json: changed })
        .where('id', '=', item.id)
        .execute()
      await writeFile(manifestPath, JSON.stringify(manifest), { mode: 0o600 })
      await assert.rejects(fixture.queue.loadVerifiedInput(item.id), {
        code: 'QUEUE_INPUT_INVALID',
      })
      invalidIds.push(item.id)
    }
    const legacy = await enqueue(fixture)
    const claimed = await fixture.queue.claimNextPending()
    assert.equal(claimed?.item.id, legacy)
    assert.equal(claimed?.payload.context.loraStack, undefined)
    assert.equal(claimed?.payload.context.loras, undefined)
    assert.equal(claimed?.payload.workerJob.loras, undefined)
    const statuses = (await fixture.queue.listManagerPage()).items
    for (const id of invalidIds) {
      assert.equal(statuses.find((item) => item.id === id)?.status, 'failed')
    }
  })
})
