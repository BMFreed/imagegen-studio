import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { crc32, deflateSync } from 'node:zlib'

import type { AppDatabase } from '../db/database.js'
import type { GenerationWorkerTransport } from './generation-processor.js'
import type {
  IllustriousTxt2ImgRequestV1,
  InferenceWorkerReady,
} from './illustrious-txt2img-job.js'
import type { PreparedNormalTxt2Img } from './project-generation-preparation.js'

import { openAppDatabase } from '../db/database.js'
import { CivitaiClient } from '../models/civitai-client.js'
import { CivitaiTokenStore, type SafeStorageAdapter } from '../models/civitai-token-store.js'
import { ModelRepository } from '../models/model-repository.js'
import { ModelService } from '../models/model-service.js'
import { GenerationProcessor, GenerationProcessorError } from './generation-processor.js'
import { GenerationQueueRepository } from './generation-queue.js'
import { GenerationStagingRepository } from './generation-staging.js'
import { withIllustriousTxt2ImgRequest } from './illustrious-txt2img-job.js'
import { ProjectSession } from './project-session.js'

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
  generate: (request: IllustriousTxt2ImgRequestV1) => Promise<unknown>,
  ready = qualifiedReady,
  close: () => Promise<void> = async () => undefined,
): GenerationWorkerTransport {
  return { close, generate, ready }
}

async function writeDone(
  request: IllustriousTxt2ImgRequestV1,
  outputBytes: Buffer,
  actualSeed = 42,
) {
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
    const seen: IllustriousTxt2ImgRequestV1[] = []
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
    assert.equal(await fixture.staging.readLastActualSeed(item.item.localProjectKey), 65_535)
    assert.deepEqual(await readFile(path.join(fixture.root, 'Project.igs')), originalProject)
    assert.deepEqual(await readdir(path.join(fixture.root, 'scratch')), [])
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

test('failed close does not acknowledge an active cancellation', async () => {
  await withFixture(async (fixture) => {
    const id = await enqueue(fixture)
    const secondId = await enqueue(fixture)
    let enterResolve!: (request: IllustriousTxt2ImgRequestV1) => void
    const entered = new Promise<IllustriousTxt2ImgRequestV1>((resolve) => {
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
    let enterResolve!: (request: IllustriousTxt2ImgRequestV1) => void
    const entered = new Promise<IllustriousTxt2ImgRequestV1>((resolve) => {
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
