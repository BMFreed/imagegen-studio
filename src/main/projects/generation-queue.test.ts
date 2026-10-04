import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import {
  GENERATION_QUEUE_PAGE_SIZE,
  isGenerationQueuePage,
} from '../../shared/projects/generation-queue-manager.js'
import {
  createEmptyProjectDocumentV1,
  IGS_SAFETY_CEILINGS,
  type IgsProjectDocumentV1,
} from '../../shared/projects/project-schema.js'

import { type KyselyPlugin, sql } from 'kysely'
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { crc32, deflateSync } from 'node:zlib'

import type { PreparedNormalTxt2Img } from './project-generation-preparation.js'

import { openAppDatabase } from '../db/database.js'
import { GenerationQueueRepository, type QueuedGenerationItem } from './generation-queue.js'
import { GenerationStagingRepository } from './generation-staging.js'
import {
  type IllustriousTxt2ImgRequestV1,
  withIllustriousTxt2ImgRequest,
} from './illustrious-txt2img-job.js'
import { localProjectRecoveryKey } from './project-identity.js'

const migrations = path.resolve('src/main/db/migrations')
const iccPath = path.resolve('worker-python/src/imagegen_worker/srgb.icc')
const ready = {
  capabilities: ['illustrious-txt2img'],
  protocolVersion: '1',
  runtimeProfile: 'linux-nvidia',
  workerVersion: '0.2.0',
}

type BatchItem = { prepared: PreparedNormalTxt2Img; request: IllustriousTxt2ImgRequestV1 }

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function pngChunk(name: string, bytes: Buffer): Buffer {
  const type = Buffer.from(name, 'ascii')
  const output = Buffer.alloc(12 + bytes.length)
  output.writeUInt32BE(bytes.length, 0)
  type.copy(output, 4)
  bytes.copy(output, 8)
  output.writeUInt32BE(crc32(Buffer.concat([type, bytes])), bytes.length + 8)
  return output
}

/** Only a fixture precondition: the subject under test is queue persistence, not PNG encoding. */
async function transparentSrgbPng(width: number, height: number): Promise<Buffer> {
  const profile = await readFile(iccPath)
  assert.equal(sha256(profile), IGS_SRGB_ICC_SHA256)
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const scanlines = Buffer.alloc((1 + width * 4) * height)
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    pngChunk('IHDR', ihdr),
    pngChunk('iCCP', Buffer.concat([Buffer.from('sRGB\0\0'), deflateSync(profile)])),
    pngChunk('IDAT', deflateSync(scanlines)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

async function opaqueSrgbPng(width: number, height: number): Promise<Buffer> {
  const profile = await readFile(iccPath)
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const scanlines = Buffer.alloc((1 + width * 4) * height)
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      scanlines[row * (1 + width * 4) + 1 + column * 4 + 3] = 255
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

async function fixture(root: string): Promise<{
  prepared: PreparedNormalTxt2Img
  projectPath: string
}> {
  const projectPath = path.join(root, 'Project.igs')
  await writeFile(projectPath, 'queue fixture path')
  const bbox = { height: 64, width: 64, x: -24, y: 48 }
  const document = createEmptyProjectDocumentV1({ primaryBbox: bbox, title: 'Queue fixture' })
  const checkpointPath = path.join(root, 'checkpoint.safetensors')
  const modelBytes = Buffer.from('exact model bytes for queue fixture')
  await writeFile(checkpointPath, modelBytes)
  const reference: NonNullable<IgsProjectDocumentV1['generationDraft']['model']> = {
    baseModelFamily: 'illustrious',
    civitaiFileId: 22,
    civitaiModelId: 20,
    civitaiVersionId: 21,
    displayName: 'Queue checkpoint',
    fileSha256: sha256(modelBytes),
    kind: 'checkpoint',
    localModelId: randomUUID(),
    localVersionId: randomUUID(),
    predictionType: 'epsilon',
    versionName: '1',
  }
  const bytes = await transparentSrgbPng(bbox.width, bbox.height)
  return {
    prepared: {
      context: {
        bbox,
        documentId: document.documentId,
        documentRevision: document.documentRevision,
        kind: 'normal-txt2img-preparation',
        model: { managedPath: checkpointPath, reference },
        prompts: { negative: 'blurry', positive: 'a frozen blue lantern' },
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
          byteSize: bytes.length,
          colorSpace: 'srgb',
          format: 'png',
          height: bbox.height,
          iccSha256: IGS_SRGB_ICC_SHA256,
          sha256: sha256(bytes),
          width: bbox.width,
        },
      },
      targetPngBytes: bytes,
    },
    projectPath,
  }
}

async function inQualifiedLease<T>(
  root: string,
  prepared: PreparedNormalTxt2Img,
  use: (request: IllustriousTxt2ImgRequestV1) => Promise<T>,
  workerReady = ready,
): Promise<T> {
  return await withIllustriousTxt2ImgRequest({
    modelService: {
      resolveVerifiedGenerationCheckpointForPlan: async (reference) => ({
        managedPath: prepared.context.model.managedPath,
        reference,
      }),
      resolveVerifiedGenerationLoraForPlan: async () => {
        throw new Error('This fixture has no active LoRAs.')
      },
      // ModelService's real exact-byte verification is covered by the request-boundary tests.
      resolveVerifiedGenerationVaeForPlan: async () => {
        throw new Error('This fixture does not select an external VAE.')
      },
    },
    prepared,
    ready: workerReady,
    scratchBasePath: path.join(root, 'scratch'),
    use,
  })
}

async function enqueueFixture(
  root: string,
  queue: GenerationQueueRepository,
  prepared: PreparedNormalTxt2Img,
  projectPath: string,
): Promise<QueuedGenerationItem> {
  return await inQualifiedLease(
    root,
    prepared,
    async (request) =>
      await queue.enqueueIllustriousTxt2Img({
        prepared,
        projectPath,
        request,
        stagingSessionId: randomUUID(),
      }),
  )
}

// Every item enters through the real qualified-request lease. Model verification remains the
// existing queue-fixture adapter; publication, SQLite, rollback and recovery are the subjects.
async function inQualifiedBatchLeases<T>(
  root: string,
  prepared: PreparedNormalTxt2Img,
  count: number,
  use: (items: BatchItem[]) => Promise<T>,
): Promise<T> {
  const items: BatchItem[] = []
  const next = async (index: number): Promise<T> => {
    if (index === count) {
      return await use(items)
    }
    const member: PreparedNormalTxt2Img = {
      context: structuredClone(prepared.context),
      targetPngBytes: prepared.targetPngBytes,
    }
    member.context.prompts.positive = `concrete prompt ${index}`
    member.context.sampling.seed = index === 0 ? 0xff_ff_ff_ff : index - 1
    return await inQualifiedLease(root, member, async (request) => {
      items.push({ prepared: member, request })
      return await next(index + 1)
    })
  }
  return await next(0)
}

test('atomic batch publishes one ordered group from immutable qualified inputs and survives restart', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-queue-atomic-batch-'))
  const database = openAppDatabase(root, migrations)
  const observer = openAppDatabase(root, migrations)
  let originalsClosed = false
  let reopened: ReturnType<typeof openAppDatabase> | undefined
  try {
    let publications = 0
    const stagedRowCounts: number[] = []
    let rowsBeforeCommit = -1
    const queue = new GenerationQueueRepository(database.db, root, {
      afterInputPublish: async () => {
        publications += 1
        stagedRowCounts.push(
          (await observer.db.selectFrom('generation_queue_item').select('id').execute()).length,
        )
      },
      beforeBatchCommit: async () => {
        rowsBeforeCommit = (
          await observer.db.selectFrom('generation_queue_item').select('id').execute()
        ).length
      },
    })
    await queue.recoverAfterRestart()
    const source = await fixture(root)
    const sessionId = randomUUID()
    let preflightCalls = 0
    const queued = await inQualifiedBatchLeases(root, source.prepared, 3, async (items) => {
      const enqueue = queue.enqueueIllustriousTxt2ImgBatch({
        items,
        preflight: async (entries) => {
          preflightCalls += 1
          assert.equal(entries.length, 3)
          assert.deepEqual(
            entries.map((entry) => JSON.parse(entry.frozenPayloadJson).context.sampling.seed),
            [0xff_ff_ff_ff, 0, 1],
          )
          assert.deepEqual(await readdir(path.join(root, 'generation-inputs')), [])
          assert.deepEqual(
            await observer.db.selectFrom('generation_queue_item').select('id').execute(),
            [],
          )
        },
        projectPath: source.projectPath,
        stagingSessionId: sessionId,
      })
      for (const member of items) {
        member.prepared.context.prompts.positive = 'caller changed prompt'
        member.request.job.prompts.positive = 'caller changed request'
      }
      source.prepared.targetPngBytes.fill(0)
      items.reverse()
      return await enqueue
    })
    assert.equal(preflightCalls, 1)
    assert.equal(publications, 3)
    assert.deepEqual(stagedRowCounts, [0, 0, 0])
    assert.equal(rowsBeforeCommit, 0)
    assert.equal(new Set(queued.map((item) => item.batchId)).size, 1)
    assert.equal(new Set(queued.map((item) => item.createdAt)).size, 1)
    assert.deepEqual(
      queued.map((item) => item.id),
      queued.map((item) => item.id).sort(),
    )
    assert.ok(
      queued.every((item) => item.stagingSessionId === sessionId && item.status === 'pending'),
    )
    assert.equal(
      (await observer.db.selectFrom('generation_queue_item').select('id').execute()).length,
      3,
    )
    for (const [index, item] of queued.entries()) {
      const loaded = await queue.loadVerifiedInput(item.id)
      assert.equal(loaded.payload.context.prompts.positive, `concrete prompt ${index}`)
      assert.equal(loaded.payload.context.sampling.seed, index === 0 ? 0xff_ff_ff_ff : index - 1)
      assert.equal(sha256(await readFile(loaded.targetPath)), loaded.payload.context.target.sha256)
    }
    const claimant = new GenerationQueueRepository(observer.db, root)
    for (const item of queued) {
      const claimed = await claimant.claimNextPending()
      assert.equal(claimed?.item.id, item.id)
      await claimant.failRunning(item.id, 1, {
        code: 'CONTROL_FAILURE',
        message: 'ordered control',
      })
    }
    await database.db
      .updateTable('generation_queue_item')
      .set({ error_code: null, error_message: null, status: 'pending', status_sequence: 0 })
      .execute()
    await observer.close()
    await database.close()
    originalsClosed = true
    reopened = openAppDatabase(root, migrations)
    const restarted = new GenerationQueueRepository(reopened.db, root)
    assert.deepEqual(await restarted.recoverAfterRestart(), {
      canceledCount: 3,
      orphanedDirectoriesRemoved: 0,
    })
    assert.deepEqual(await restarted.listUnfinishedByProject(queued[0].localProjectKey), [])
    for (const item of queued) {
      assert.equal((await restarted.loadVerifiedInput(item.id)).item.status, 'canceled')
    }
  } finally {
    await reopened?.close()
    if (!originalsClosed) {
      await observer.close()
      await database.close()
    }
    await rm(root, { force: true, recursive: true })
  }
})

test('atomic batch rejects mixed identities, duplicate requests and capacity refusal before publication', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-queue-batch-invalid-'))
  const database = openAppDatabase(root, migrations)
  try {
    const queue = new GenerationQueueRepository(database.db, root)
    await queue.recoverAfterRestart()
    const source = await fixture(root)
    await inQualifiedBatchLeases(root, source.prepared, 2, async (original) => {
      const sessionId = randomUUID()
      const enqueue = async (items: BatchItem[], preflight = async () => undefined) =>
        await queue.enqueueIllustriousTxt2ImgBatch({
          items,
          preflight,
          projectPath: source.projectPath,
          stagingSessionId: sessionId,
        })
      await assert.rejects(enqueue([]), { code: 'QUEUE_INPUT_INVALID' })
      await assert.rejects(enqueue(Array.from({ length: 65 }, () => original[0])), {
        code: 'QUEUE_INPUT_INVALID',
      })
      for (const mutate of [
        (items: BatchItem[]) => {
          items[1].request.requestId = items[0].request.requestId
        },
        (items: BatchItem[]) => {
          items[1].prepared.context.documentId = randomUUID()
        },
        (items: BatchItem[]) => {
          items[1].prepared.context.documentRevision = randomUUID()
        },
        (items: BatchItem[]) => {
          items[1].prepared.context.bbox.x += 8
          items[1].request.job.bbox.x += 8
        },
        (items: BatchItem[]) => {
          items[1].prepared.context.sampling.steps += 1
          items[1].request.job.sampling.steps += 1
        },
        (items: BatchItem[]) => {
          items[0].prepared.context.sampling.seedBehavior = 'per-prompt'
          items[1].prepared.context.sampling.seedBehavior = 'per-iteration'
        },
        (items: BatchItem[]) => {
          Object.assign(items[1].prepared.context.sampling, { seedBehavior: 'invalid' })
        },
        (items: BatchItem[]) => {
          items[1].prepared.context.model.reference.localVersionId = randomUUID()
        },
        (items: BatchItem[]) => {
          items[1].prepared.targetPngBytes = Buffer.from('different target')
        },
      ]) {
        const items = original.map((item) => ({
          prepared: {
            context: structuredClone(item.prepared.context),
            targetPngBytes: Buffer.from(item.prepared.targetPngBytes),
          },
          request: structuredClone(item.request),
        }))
        mutate(items)
        await assert.rejects(enqueue(items), { code: 'QUEUE_INPUT_INVALID' })
      }
      await assert.rejects(
        enqueue(original, async () => {
          throw new Error('capacity preflight refused')
        }),
        /capacity preflight refused/,
      )
      await assert.rejects(
        queue.enqueueIllustriousTxt2ImgBatch({
          items: original,
          preflight: undefined as unknown as (
            entries: readonly { frozenPayloadJson: string; queueItemId: string }[],
          ) => Promise<void>,
          projectPath: source.projectPath,
          stagingSessionId: sessionId,
        }),
        { code: 'QUEUE_INPUT_INVALID' },
      )
      assert.deepEqual(
        await database.db.selectFrom('generation_queue_item').select('id').execute(),
        [],
      )
      assert.deepEqual(await readdir(path.join(root, 'generation-inputs')), [])
    })
  } finally {
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
})

test('atomic batch accepts the bounded 64-item control with distinct durable IDs', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-queue-batch-limit-'))
  const database = openAppDatabase(root, migrations)
  try {
    const queue = new GenerationQueueRepository(database.db, root)
    await queue.recoverAfterRestart()
    const source = await fixture(root)
    const queued = await inQualifiedBatchLeases(
      root,
      source.prepared,
      64,
      async (items) =>
        await queue.enqueueIllustriousTxt2ImgBatch({
          items,
          preflight: async () => undefined,
          projectPath: source.projectPath,
          stagingSessionId: randomUUID(),
        }),
    )
    assert.equal(queued.length, 64)
    assert.equal(new Set(queued.map((item) => item.id)).size, 64)
    assert.equal(new Set(queued.map((item) => item.batchId)).size, 1)
    assert.deepEqual(
      (
        await database.db
          .selectFrom('generation_queue_item')
          .select('id')
          .orderBy('created_at')
          .orderBy('id')
          .execute()
      ).map((row) => row.id),
      queued.map((item) => item.id),
    )
  } finally {
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
})

test('atomic batch file/SQL/fence failures leave no partial group and preserve adjacent jobs', async (t) => {
  for (const failure of ['file', 'sql', 'fence'] as const) {
    await t.test(failure, async () => {
      const root = await mkdtemp(path.join(os.tmpdir(), `igs-queue-batch-${failure}-`))
      const database = openAppDatabase(root, migrations)
      const observer = openAppDatabase(root, migrations)
      try {
        let armed = false
        let publications = 0
        const queue = new GenerationQueueRepository(database.db, root, {
          afterInputPublish: async () => {
            if (armed && failure === 'file' && ++publications === 2) {
              throw new Error('second file publication failed')
            }
          },
          beforeBatchCommit: async () => {
            if (armed && failure === 'fence') {
              assert.equal(
                (await observer.db.selectFrom('generation_queue_item').select('id').execute())
                  .length,
                1,
              )
              queue.fenceProject(localProjectRecoveryKey(source.projectPath))
            }
          },
        })
        await queue.recoverAfterRestart()
        const source = await fixture(root)
        const neighbor = await enqueueFixture(root, queue, source.prepared, source.projectPath)
        const before = await database.db.selectFrom('generation_queue_item').selectAll().execute()
        if (failure === 'sql') {
          await sql`CREATE TRIGGER fail_second_batch_insert BEFORE INSERT ON generation_queue_item
          WHEN (SELECT COUNT(*) FROM generation_queue_item WHERE staging_session_id=NEW.staging_session_id)=1
          BEGIN SELECT RAISE(ABORT,'second batch row refused'); END`.execute(database.db)
        }
        armed = true
        await assert.rejects(
          inQualifiedBatchLeases(
            root,
            source.prepared,
            3,
            async (items) =>
              await queue.enqueueIllustriousTxt2ImgBatch({
                items,
                preflight: async () => undefined,
                projectPath: source.projectPath,
                stagingSessionId: randomUUID(),
              }),
          ),
          failure === 'file'
            ? /second file publication failed/
            : failure === 'sql'
              ? /second batch row refused/
              : { code: 'QUEUE_PROJECT_CLOSING' },
        )
        assert.deepEqual(
          await database.db.selectFrom('generation_queue_item').selectAll().execute(),
          before,
        )
        assert.deepEqual(await readdir(path.join(root, 'generation-inputs')), [neighbor.id])
        assert.equal((await queue.loadVerifiedInput(neighbor.id)).item.status, 'pending')
      } finally {
        await observer.close()
        await database.close()
        await rm(root, { force: true, recursive: true })
      }
    })
  }
})

test('atomic batch resolves a lost commit acknowledgement from exact durable rows', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-queue-batch-ack-'))
  const database = openAppDatabase(root, migrations)
  try {
    const queue = new GenerationQueueRepository(database.db, root, {
      afterBatchCommit: async () => {
        throw new Error('commit acknowledgement lost')
      },
    })
    await queue.recoverAfterRestart()
    const source = await fixture(root)
    const queued = await inQualifiedBatchLeases(
      root,
      source.prepared,
      3,
      async (items) =>
        await queue.enqueueIllustriousTxt2ImgBatch({
          items,
          preflight: async () => undefined,
          projectPath: source.projectPath,
          stagingSessionId: randomUUID(),
        }),
    )
    assert.equal(queued.length, 3)
    assert.equal(
      (await database.db.selectFrom('generation_queue_item').select('id').execute()).length,
      3,
    )
    for (const item of queued) {
      assert.equal((await queue.loadVerifiedInput(item.id)).item.status, 'pending')
    }
    queue.releaseProjectFence(queued[0].localProjectKey)
  } finally {
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
})

test('atomic batch unreadable commit outcomes retain inputs and fence admission/dispatch/release until restart recovery', async (t) => {
  for (const committed of [false, true]) {
    await t.test(committed ? 'committed' : 'rolled back', async () => {
      const root = await mkdtemp(path.join(os.tmpdir(), 'igs-queue-batch-unknown-'))
      const database = openAppDatabase(root, migrations)
      try {
        let denyInspection = false
        const plugin: KyselyPlugin = {
          transformQuery: ({ node }) => {
            if (
              denyInspection &&
              node.kind === 'SelectQueryNode' &&
              JSON.stringify(node).includes('generation_queue_item')
            ) {
              throw new Error('SQLite inspection unavailable')
            }
            return node
          },
          transformResult: async ({ result }) => result,
        }
        const loseAcknowledgement = async () => {
          denyInspection = true
          throw new Error('publication outcome unknown')
        }
        const queue = new GenerationQueueRepository(database.db.withPlugin(plugin), root, {
          afterBatchCommit: committed ? loseAcknowledgement : undefined,
          beforeBatchCommit: committed ? undefined : loseAcknowledgement,
        })
        await queue.recoverAfterRestart()
        const source = await fixture(root)
        const projectKey = localProjectRecoveryKey(source.projectPath)
        await assert.rejects(
          inQualifiedBatchLeases(
            root,
            source.prepared,
            3,
            async (items) =>
              await queue.enqueueIllustriousTxt2ImgBatch({
                items,
                preflight: async () => undefined,
                projectPath: source.projectPath,
                stagingSessionId: randomUUID(),
              }),
          ),
          { code: 'QUEUE_PUBLICATION_UNCERTAIN' },
        )
        const rows = await database.db.selectFrom('generation_queue_item').selectAll().execute()
        assert.equal(rows.length, committed ? 3 : 0)
        assert.equal((await readdir(path.join(root, 'generation-inputs'))).length, 3)
        assert.throws(() => queue.assertProjectCanEnqueue(projectKey), {
          code: 'QUEUE_PUBLICATION_UNCERTAIN',
        })
        assert.throws(() => queue.releaseProjectFence(projectKey), {
          code: 'QUEUE_PUBLICATION_UNCERTAIN',
        })
        denyInspection = false
        assert.equal(await queue.claimNextPending(), null)
        assert.throws(() => queue.releaseProjectFence(projectKey), {
          code: 'QUEUE_PUBLICATION_UNCERTAIN',
        })
        assert.deepEqual(await queue.recoverAfterRestart(), {
          canceledCount: committed ? 3 : 0,
          orphanedDirectoriesRemoved: committed ? 0 : 3,
        })
        queue.releaseProjectFence(projectKey)
        for (const row of rows) {
          assert.equal((await queue.loadVerifiedInput(row.id)).item.status, 'canceled')
        }
      } finally {
        await database.close()
        await rm(root, { force: true, recursive: true })
      }
    })
  }
})

test('claim verifies durable input before moving a pending row to running across reopen', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-generation-queue-claim-'))
  try {
    const first = openAppDatabase(root, migrations)
    const queue = new GenerationQueueRepository(first.db, root)
    const { prepared, projectPath } = await fixture(root)
    const pending = await enqueueFixture(root, queue, prepared, projectPath)
    await first.close()

    const second = openAppDatabase(root, migrations)
    const reopened = new GenerationQueueRepository(second.db, root)
    const claimed = await reopened.claimNextPending()
    assert.ok(claimed)
    assert.equal(claimed.item.id, pending.id)
    assert.equal(claimed.item.status, 'running')
    assert.equal(claimed.item.statusSequence, 1)
    assert.equal(claimed.payload.context.prompts.positive, 'a frozen blue lantern')
    assert.equal(
      sha256(await readFile(claimed.targetPath)),
      claimed.payload.workerJob.target.sha256,
    )
    assert.equal(await reopened.claimNextPending(), null)
    const row = await second.db
      .selectFrom('generation_queue_item')
      .select(['started_at', 'finished_at', 'status', 'status_sequence'])
      .where('id', '=', pending.id)
      .executeTakeFirstOrThrow()
    assert.equal(row.status, 'running')
    assert.equal(row.status_sequence, 1)
    assert.ok(row.started_at)
    assert.equal(row.finished_at, null)
    await second.close()
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

test('two repository instances cannot claim a second job while one is running', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-generation-queue-parallel-'))
  try {
    const first = openAppDatabase(root, migrations)
    const second = openAppDatabase(root, migrations)
    let enteredResolve!: (id: string) => void
    const entered = new Promise<string>((resolve) => {
      enteredResolve = resolve
    })
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const queueA = new GenerationQueueRepository(first.db, root, {
      beforeClaimUpdate: async (id) => {
        enteredResolve(id)
        await gate
      },
    })
    const queueB = new GenerationQueueRepository(second.db, root)
    const { prepared, projectPath } = await fixture(root)
    const pendingA = await enqueueFixture(root, queueB, prepared, projectPath)
    const pendingB = await enqueueFixture(root, queueB, prepared, projectPath)
    await first.db
      .updateTable('generation_queue_item')
      .set({ created_at: '2000-01-01T00:00:00.000Z' })
      .where('id', '=', pendingA.id)
      .execute()
    await first.db
      .updateTable('generation_queue_item')
      .set({ created_at: '2001-01-01T00:00:00.000Z' })
      .where('id', '=', pendingB.id)
      .execute()

    const firstClaim = queueA.claimNextPending()
    assert.equal(await entered, pendingA.id)
    // Change only ordering while A holds a verified snapshot. B can now claim a different row;
    // A must still refuse its own CAS because B already occupies the sole running slot.
    await second.db
      .updateTable('generation_queue_item')
      .set({ created_at: '2100-01-01T00:00:00.000Z' })
      .where('id', '=', pendingA.id)
      .execute()
    let running
    try {
      running = await queueB.claimNextPending()
    } finally {
      release()
    }
    assert.ok(running)
    assert.equal(running.item.id, pendingB.id)
    assert.equal(await firstClaim, null)
    assert.equal(running.item.statusSequence, 1)
    assert.equal(await queueB.claimNextPending(), null)
    const statuses = await first.db
      .selectFrom('generation_queue_item')
      .select(['id', 'status'])
      .execute()
    assert.equal(statuses.filter((item) => item.status === 'running').length, 1)
    assert.equal(statuses.filter((item) => item.status === 'pending').length, 1)

    const requested = await queueB.cancel(running.item.id, running.item.statusSequence)
    assert.equal(requested.status, 'running')
    assert.equal(requested.cancelRequested, true)
    assert.equal(requested.statusSequence, 2)
    assert.equal(await queueA.claimNextPending(), null)
    const canceled = await queueB.acknowledgeCanceledRunning(running.item.id, 2)
    assert.equal(canceled.status, 'canceled')
    assert.equal(canceled.statusSequence, 3)
    const next = await queueA.claimNextPending()
    assert.ok(next)
    assert.equal(next.item.id, pendingA.id)
    assert.equal(next.item.statusSequence, 1)
    await first.close()
    await second.close()
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

test('a Project fence blocks enqueue and dispatch while another Project remains runnable', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-generation-queue-project-fence-'))
  const database = openAppDatabase(root, migrations)
  try {
    const queue = new GenerationQueueRepository(database.db, root)
    await queue.recoverAfterRestart()
    const { prepared, projectPath } = await fixture(root)
    const otherPath = path.join(root, 'Other.igs')
    await writeFile(otherPath, 'other queue fixture path')
    const first = await enqueueFixture(root, queue, prepared, projectPath)
    const other = await enqueueFixture(root, queue, prepared, otherPath)

    queue.fenceProject(first.localProjectKey)
    await assert.rejects(enqueueFixture(root, queue, prepared, projectPath), {
      code: 'QUEUE_PROJECT_CLOSING',
    })
    const claimedOther = await queue.claimNextPending()
    assert.equal(claimedOther?.item.id, other.id)
    assert.equal((await queue.loadVerifiedInput(first.id)).item.status, 'pending')

    await queue.cancel(other.id)
    await queue.acknowledgeCanceledRunning(other.id, claimedOther.item.statusSequence + 1)
    assert.equal(await queue.claimNextPending(), null)
    queue.releaseProjectFence(first.localProjectKey)
    assert.equal((await queue.claimNextPending())?.item.id, first.id)
  } finally {
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
})

test('fencing during durable input publication leaves no queued Project job', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-generation-queue-fence-publish-'))
  const database = openAppDatabase(root, migrations)
  let entered!: () => void
  const published = new Promise<void>((resolve) => {
    entered = resolve
  })
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  try {
    const queue = new GenerationQueueRepository(database.db, root, {
      afterInputPublish: async () => {
        entered()
        await held
      },
    })
    await queue.recoverAfterRestart()
    const { prepared, projectPath } = await fixture(root)
    const enqueue = enqueueFixture(root, queue, prepared, projectPath)
    await published
    queue.fenceProject(localProjectRecoveryKey(projectPath))
    release()
    await assert.rejects(enqueue, { code: 'QUEUE_PROJECT_CLOSING' })
    assert.deepEqual(
      await database.db.selectFrom('generation_queue_item').select('id').execute(),
      [],
    )
    assert.deepEqual(await readdir(path.join(root, 'generation-inputs')), [])
  } finally {
    release()
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
})

test('a Project fence raised during input verification skips its claim and reaches another Project', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-generation-queue-fence-claim-'))
  const database = openAppDatabase(root, migrations)
  let entered!: () => void
  const verifying = new Promise<void>((resolve) => {
    entered = resolve
  })
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  let targetId = ''
  try {
    const queue = new GenerationQueueRepository(database.db, root, {
      beforeClaimUpdate: async (id) => {
        if (id === targetId) {
          entered()
          await held
        }
      },
    })
    await queue.recoverAfterRestart()
    const { prepared, projectPath } = await fixture(root)
    const otherPath = path.join(root, 'Other.igs')
    await writeFile(otherPath, 'other queue fixture path')
    const first = await enqueueFixture(root, queue, prepared, projectPath)
    targetId = first.id
    const other = await enqueueFixture(root, queue, prepared, otherPath)

    const claim = queue.claimNextPending()
    await verifying
    queue.fenceProject(first.localProjectKey)
    release()
    assert.equal((await claim)?.item.id, other.id)
    assert.equal((await queue.loadVerifiedInput(first.id)).item.status, 'pending')
  } finally {
    release()
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
})

test('cancel and worker failure enforce sequence guards across pending, running and terminal rows', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-generation-queue-cancel-'))
  try {
    const first = openAppDatabase(root, migrations)
    const queue = new GenerationQueueRepository(first.db, root)
    const { prepared, projectPath } = await fixture(root)
    const pending = await enqueueFixture(root, queue, prepared, projectPath)
    const canceledPending = await queue.cancel(pending.id, 0)
    assert.equal(canceledPending.status, 'canceled')
    assert.equal(canceledPending.statusSequence, 1)
    assert.deepEqual(await queue.cancel(pending.id, 1), canceledPending)
    await assert.rejects(queue.cancel(pending.id, 0), { code: 'QUEUE_STATUS_CONFLICT' })

    const secondPending = await enqueueFixture(root, queue, prepared, projectPath)
    const running = await queue.claimNextPending()
    assert.ok(running)
    assert.equal(running.item.id, secondPending.id)
    await assert.rejects(queue.cancel(running.item.id, 0), { code: 'QUEUE_STATUS_CONFLICT' })
    const requested = await queue.cancel(running.item.id, 1)
    assert.equal(requested.status, 'running')
    assert.equal(requested.cancelRequested, true)
    assert.equal(requested.statusSequence, 2)
    assert.deepEqual(await queue.cancel(running.item.id, 2), requested)
    await assert.rejects(queue.cancel(running.item.id, 1), { code: 'QUEUE_STATUS_CONFLICT' })
    await assert.rejects(
      queue.failRunning(running.item.id, 1, { code: 'WORKER_FAILED', message: 'Late failure.' }),
      { code: 'QUEUE_STATUS_CONFLICT' },
    )
    await assert.rejects(
      queue.failRunning(running.item.id, 2, { code: 'WORKER_FAILED', message: 'Late failure.' }),
      { code: 'QUEUE_STATUS_CONFLICT' },
    )
    await assert.rejects(queue.acknowledgeCanceledRunning(running.item.id, 1), {
      code: 'QUEUE_STATUS_CONFLICT',
    })
    const canceledRunning = await queue.acknowledgeCanceledRunning(running.item.id, 2)
    assert.equal(canceledRunning.status, 'canceled')
    assert.equal(canceledRunning.cancelRequested, false)
    assert.equal(canceledRunning.statusSequence, 3)
    assert.deepEqual(await queue.cancel(running.item.id, 3), canceledRunning)
    await assert.rejects(queue.cancel(running.item.id, 2), { code: 'QUEUE_STATUS_CONFLICT' })
    const canceledRow = await first.db
      .selectFrom('generation_queue_item')
      .select(['status', 'status_sequence', 'error_code', 'finished_at'])
      .where('id', '=', running.item.id)
      .executeTakeFirstOrThrow()
    assert.equal(canceledRow.status, 'canceled')
    assert.equal(canceledRow.status_sequence, 3)
    assert.equal(canceledRow.error_code, 'USER_CANCELED')
    assert.ok(canceledRow.finished_at)
    await first.close()
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

test('restart preserves explicit cancel request and does not revive an unfinished worker', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-generation-queue-cancel-restart-'))
  try {
    const first = openAppDatabase(root, migrations)
    const queue = new GenerationQueueRepository(first.db, root)
    const { prepared, projectPath } = await fixture(root)
    const requestedJob = await enqueueFixture(root, queue, prepared, projectPath)
    const pendingJob = await enqueueFixture(root, queue, prepared, projectPath)
    const running = await queue.claimNextPending()
    assert.ok(running)
    assert.equal(running.item.id, requestedJob.id)
    const requested = await queue.cancel(running.item.id, 1)
    assert.equal(requested.status, 'running')
    assert.equal(requested.cancelRequested, true)
    assert.equal(await queue.claimNextPending(), null)
    await first.close()

    const second = openAppDatabase(root, migrations)
    const restarted = new GenerationQueueRepository(second.db, root)
    const persistedRequest = await restarted.loadVerifiedInput(requestedJob.id)
    assert.equal(persistedRequest.item.status, 'running')
    assert.equal(persistedRequest.item.cancelRequested, true)
    assert.equal(persistedRequest.item.statusSequence, 2)
    assert.equal(await restarted.claimNextPending(), null)
    assert.deepEqual(await restarted.recoverAfterRestart(), {
      canceledCount: 2,
      orphanedDirectoriesRemoved: 0,
    })
    const rows = await second.db
      .selectFrom('generation_queue_item')
      .select(['id', 'status', 'status_sequence', 'error_code'])
      .where('id', 'in', [requestedJob.id, pendingJob.id])
      .execute()
    assert.deepEqual(
      rows.find((row) => row.id === requestedJob.id),
      {
        error_code: 'USER_CANCELED',
        id: requestedJob.id,
        status: 'canceled',
        status_sequence: 3,
      },
    )
    assert.deepEqual(
      rows.find((row) => row.id === pendingJob.id),
      {
        error_code: 'APP_RESTART',
        id: pendingJob.id,
        status: 'canceled',
        status_sequence: 1,
      },
    )
    assert.equal(await restarted.claimNextPending(), null)
    await assert.rejects(restarted.acknowledgeCanceledRunning(requestedJob.id, 2), {
      code: 'QUEUE_STATUS_CONFLICT',
    })
    await second.close()
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

test('dispatch readiness is revoked when startup recovery fails', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-generation-queue-readiness-'))
  const database = openAppDatabase(root, migrations)
  try {
    const queue = new GenerationQueueRepository(database.db, root)
    const { projectPath } = await fixture(root)
    const projectKey = localProjectRecoveryKey(projectPath)
    assert.throws(() => queue.assertReadyForDispatch(), { code: 'QUEUE_NOT_RECONCILED' })
    await assert.rejects(queue.listUnfinishedByProject(projectKey), {
      code: 'QUEUE_NOT_RECONCILED',
    })
    await queue.recoverAfterRestart()
    assert.doesNotThrow(() => queue.assertReadyForDispatch())
    assert.deepEqual(await queue.listUnfinishedByProject(projectKey), [])

    const inputRoot = path.join(root, 'generation-inputs')
    await rm(inputRoot, { recursive: true })
    await symlink(root, inputRoot, 'dir')
    await assert.rejects(queue.recoverAfterRestart(), { code: 'QUEUE_STORAGE_UNSAFE' })
    assert.throws(() => queue.assertReadyForDispatch(), { code: 'QUEUE_NOT_RECONCILED' })
    await assert.rejects(queue.listUnfinishedByProject(projectKey), {
      code: 'QUEUE_NOT_RECONCILED',
    })
  } finally {
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
})

test('unfinished Project listing isolates identities and excludes every terminal status without changing rows', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-generation-queue-project-list-'))
  const database = openAppDatabase(root, migrations)
  try {
    const queue = new GenerationQueueRepository(database.db, root)
    await queue.recoverAfterRestart()
    const first = await fixture(root)
    const secondRoot = path.join(root, 'second-project')
    await mkdir(secondRoot)
    const second = await fixture(secondRoot)

    const failed = await enqueueFixture(root, queue, first.prepared, first.projectPath)
    const failedClaim = await queue.claimNextPending()
    assert.equal(failedClaim?.item.id, failed.id)
    await queue.failRunning(failed.id, 1, {
      code: 'WORKER_FAILED',
      message: 'Fixture failure.',
    })

    const running = await enqueueFixture(root, queue, first.prepared, first.projectPath)
    const runningClaim = await queue.claimNextPending()
    assert.equal(runningClaim?.item.id, running.id)
    const requested = await queue.cancel(running.id, 1)
    assert.equal(requested.cancelRequested, true)

    const pending = await enqueueFixture(root, queue, first.prepared, first.projectPath)
    const canceled = await enqueueFixture(root, queue, first.prepared, first.projectPath)
    await queue.cancel(canceled.id)
    const completed = await enqueueFixture(root, queue, first.prepared, first.projectPath)
    await database.db
      .updateTable('generation_queue_item')
      .set({ status: 'completed' })
      .where('id', '=', completed.id)
      .execute()

    const otherPending = await enqueueFixture(root, queue, second.prepared, second.projectPath)
    const otherCanceled = await enqueueFixture(root, queue, second.prepared, second.projectPath)
    await queue.cancel(otherCanceled.id)

    const before = await database.db
      .selectFrom('generation_queue_item')
      .select(['id', 'status', 'status_sequence'])
      .orderBy('id')
      .execute()
    const firstUnfinished = await queue.listUnfinishedByProject(running.localProjectKey)
    assert.deepEqual(firstUnfinished.map((item) => item.id).sort(), [running.id, pending.id].sort())
    assert.deepEqual(
      firstUnfinished.find((item) => item.id === running.id),
      requested,
    )
    assert.deepEqual(
      (await queue.listUnfinishedByProject(otherPending.localProjectKey)).map((item) => item.id),
      [otherPending.id],
    )
    await assert.rejects(queue.listUnfinishedByProject('project-v1-invalid'), {
      code: 'QUEUE_PROJECT_IDENTITY_CHANGED',
    })
    assert.deepEqual(
      await database.db
        .selectFrom('generation_queue_item')
        .select(['id', 'status', 'status_sequence'])
        .orderBy('id')
        .execute(),
      before,
    )
  } finally {
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
})

// Production boundary: real SQLite metadata query, with durable frozen input fixtures.
// A same-path foreign document is the neighboring control; dropping document_id must fail.
test('unfinished document listing isolates same-path documents without reading frozen target files', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-generation-queue-document-list-'))
  const database = openAppDatabase(root, migrations)
  try {
    const queue = new GenerationQueueRepository(database.db, root)
    const first = await fixture(root)
    const projectKey = localProjectRecoveryKey(first.projectPath)
    const documentId = first.prepared.context.documentId
    await assert.rejects(queue.listUnfinishedByProjectDocument(projectKey, documentId), {
      code: 'QUEUE_NOT_RECONCILED',
    })
    await queue.recoverAfterRestart()
    const running = await enqueueFixture(root, queue, first.prepared, first.projectPath)
    assert.equal((await queue.claimNextPending())?.item.id, running.id)
    const pending = await enqueueFixture(root, queue, first.prepared, first.projectPath)
    const canceled = await enqueueFixture(root, queue, first.prepared, first.projectPath)
    await queue.cancel(canceled.id)
    const failed = await enqueueFixture(root, queue, first.prepared, first.projectPath)
    const completed = await enqueueFixture(root, queue, first.prepared, first.projectPath)
    await database.db
      .updateTable('generation_queue_item')
      .set({ status: 'failed' })
      .where('id', '=', failed.id)
      .execute()
    await database.db
      .updateTable('generation_queue_item')
      .set({ status: 'completed' })
      .where('id', '=', completed.id)
      .execute()
    const foreign = structuredClone(first.prepared)
    foreign.context.documentId = randomUUID()
    const samePathForeign = await enqueueFixture(root, queue, foreign, first.projectPath)
    const otherRoot = path.join(root, 'other-project')
    await mkdir(otherRoot)
    const other = await fixture(otherRoot)
    const otherProject = await enqueueFixture(root, queue, other.prepared, other.projectPath)
    await database.db
      .updateTable('generation_queue_item')
      .set({ created_at: '2026-09-30T00:00:00.000Z' })
      .where('id', 'in', [running.id, pending.id])
      .execute()
    await rm(path.join(root, 'generation-inputs', running.id, 'target.png'))
    await rm(path.join(root, 'generation-inputs', pending.id, 'target.png'))
    const before = await database.db
      .selectFrom('generation_queue_item')
      .selectAll()
      .orderBy('id')
      .execute()
    assert.deepEqual(
      (await queue.listUnfinishedByProjectDocument(projectKey, documentId)).map((item) => item.id),
      [running.id, pending.id].sort(),
    )
    assert.deepEqual(
      (await queue.listUnfinishedByProjectDocument(projectKey, foreign.context.documentId)).map(
        (item) => item.id,
      ),
      [samePathForeign.id],
    )
    assert.deepEqual(
      (
        await queue.listUnfinishedByProjectDocument(
          otherProject.localProjectKey,
          other.prepared.context.documentId,
        )
      ).map((item) => item.id),
      [otherProject.id],
    )
    await assert.rejects(queue.listUnfinishedByProjectDocument('bad-project', documentId), {
      code: 'QUEUE_PROJECT_IDENTITY_CHANGED',
    })
    await assert.rejects(queue.listUnfinishedByProjectDocument(projectKey, 'not-a-document-id'), {
      code: 'QUEUE_PROJECT_IDENTITY_CHANGED',
    })
    assert.deepEqual(
      await database.db.selectFrom('generation_queue_item').selectAll().orderBy('id').execute(),
      before,
    )
  } finally {
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
})

test('unfinished ID listing validates bounded unique IDs and merges query chunks in stable order', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-generation-queue-id-list-'))
  const database = openAppDatabase(root, migrations)
  try {
    const queue = new GenerationQueueRepository(database.db, root)
    await assert.rejects(queue.listUnfinishedByIds([]), { code: 'QUEUE_NOT_RECONCILED' })
    await queue.recoverAfterRestart()
    const first = await fixture(root)
    const pending = await enqueueFixture(root, queue, first.prepared, first.projectPath)
    const other = await enqueueFixture(root, queue, first.prepared, first.projectPath)
    const canceled = await enqueueFixture(root, queue, first.prepared, first.projectPath)
    await queue.cancel(canceled.id)
    await database.db
      .updateTable('generation_queue_item')
      .set({ created_at: '2026-09-30T00:00:00.000Z' })
      .where('id', 'in', [pending.id, other.id])
      .execute()
    const ids: string[] = Array.from({ length: IGS_SAFETY_CEILINGS.archiveEntries }, () =>
      randomUUID(),
    )
    ids[0] = other.id
    ids[600] = pending.id
    ids[9999] = canceled.id
    const before = await database.db
      .selectFrom('generation_queue_item')
      .selectAll()
      .orderBy('id')
      .execute()
    assert.deepEqual(
      (await queue.listUnfinishedByIds(ids)).map((item) => item.id),
      [pending.id, other.id].sort(),
    )
    assert.deepEqual(await queue.listUnfinishedByIds([]), [])
    await assert.rejects(queue.listUnfinishedByIds([pending.id, pending.id]), {
      code: 'QUEUE_INPUT_INVALID',
    })
    await assert.rejects(queue.listUnfinishedByIds(['not-a-job-id']), {
      code: 'QUEUE_ITEM_NOT_FOUND',
    })
    await assert.rejects(queue.listUnfinishedByIds([...ids, randomUUID()]), {
      code: 'QUEUE_INPUT_INVALID',
    })
    assert.deepEqual(
      await database.db.selectFrom('generation_queue_item').selectAll().orderBy('id').execute(),
      before,
    )
  } finally {
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
})

test('app shutdown cancels every pending row durably while preserving frozen inputs and adjacent statuses', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-generation-queue-shutdown-'))
  try {
    const first = openAppDatabase(root, migrations)
    const queue = new GenerationQueueRepository(first.db, root)
    await queue.recoverAfterRestart()
    const projectA = await fixture(root)
    const otherRoot = path.join(root, 'other-project')
    await mkdir(otherRoot)
    const projectB = await fixture(otherRoot)

    const running = await enqueueFixture(root, queue, projectA.prepared, projectA.projectPath)
    assert.equal((await queue.claimNextPending())?.item.id, running.id)
    const pendingA = await enqueueFixture(root, queue, projectA.prepared, projectA.projectPath)
    const pendingB = await enqueueFixture(root, queue, projectB.prepared, projectB.projectPath)
    const canceled = await enqueueFixture(root, queue, projectA.prepared, projectA.projectPath)
    await queue.cancel(canceled.id)
    const failed = await enqueueFixture(root, queue, projectA.prepared, projectA.projectPath)
    await first.db
      .updateTable('generation_queue_item')
      .set({ error_code: 'WORKER_FAILED', status: 'failed', status_sequence: 2 })
      .where('id', '=', failed.id)
      .execute()
    const completed = await enqueueFixture(root, queue, projectA.prepared, projectA.projectPath)
    await first.db
      .updateTable('generation_queue_item')
      .set({ status: 'completed', status_sequence: 3 })
      .where('id', '=', completed.id)
      .execute()

    const pendingIds = [pendingA.id, pendingB.id]
    const terminalIds = [running.id, canceled.id, failed.id, completed.id]
    const before = await first.db.selectFrom('generation_queue_item').selectAll().execute()
    const byIdBefore = new Map(before.map((row) => [row.id, row]))
    const frozenInputs = await Promise.all(
      pendingIds.map(async (id) => {
        const input = await queue.loadVerifiedInput(id)
        return { id, targetBytes: await readFile(input.targetPath) }
      }),
    )

    assert.equal(await queue.cancelPendingForShutdown(), 2)
    assert.equal(await queue.cancelPendingForShutdown(), 0)
    const after = await first.db.selectFrom('generation_queue_item').selectAll().execute()
    const byIdAfter = new Map(after.map((row) => [row.id, row]))
    for (const id of terminalIds) {
      assert.deepEqual(byIdAfter.get(id), byIdBefore.get(id))
    }
    for (const id of pendingIds) {
      const previous = byIdBefore.get(id)
      const next = byIdAfter.get(id)
      assert.ok(previous)
      assert.ok(next)
      assert.equal(next.status, 'canceled')
      assert.equal(next.status_sequence, previous.status_sequence + 1)
      assert.equal(next.error_code, 'USER_CANCELED')
      assert.equal(next.error_message, 'The job was canceled.')
      assert.ok(next.finished_at)
      assert.equal(next.frozen_payload_json, previous.frozen_payload_json)
    }
    for (const input of frozenInputs) {
      const verified = await queue.loadVerifiedInput(input.id)
      assert.equal(verified.item.status, 'canceled')
      assert.deepEqual(await readFile(verified.targetPath), input.targetBytes)
    }
    await first.close()

    const second = openAppDatabase(root, migrations)
    try {
      const reopened = new GenerationQueueRepository(second.db, root)
      for (const id of pendingIds) {
        const verified = await reopened.loadVerifiedInput(id)
        assert.equal(verified.item.status, 'canceled')
        assert.equal(verified.item.statusSequence, 1)
      }
      await reopened.recoverAfterRestart()
      assert.equal(await reopened.cancelPendingForShutdown(), 0)
      for (const id of pendingIds) {
        assert.equal((await reopened.loadVerifiedInput(id)).item.statusSequence, 1)
      }
    } finally {
      await second.close()
    }
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

test('app shutdown cancellation refuses unreconciled queue and failed restart recovery without changing pending rows', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-generation-queue-shutdown-readiness-'))
  const database = openAppDatabase(root, migrations)
  try {
    const queue = new GenerationQueueRepository(database.db, root)
    await queue.recoverAfterRestart()
    const { prepared, projectPath } = await fixture(root)
    const pending = await enqueueFixture(root, queue, prepared, projectPath)
    const unreconciled = new GenerationQueueRepository(database.db, root)
    await assert.rejects(unreconciled.cancelPendingForShutdown(), {
      code: 'QUEUE_NOT_RECONCILED',
    })
    assert.equal((await queue.loadVerifiedInput(pending.id)).item.status, 'pending')

    const inputRoot = path.join(root, 'generation-inputs')
    await rm(inputRoot, { recursive: true })
    await symlink(root, inputRoot, 'dir')
    await assert.rejects(queue.recoverAfterRestart(), { code: 'QUEUE_STORAGE_UNSAFE' })
    await assert.rejects(queue.cancelPendingForShutdown(), {
      code: 'QUEUE_NOT_RECONCILED',
    })
    const row = await database.db
      .selectFrom('generation_queue_item')
      .select(['status', 'status_sequence', 'error_code'])
      .where('id', '=', pending.id)
      .executeTakeFirstOrThrow()
    assert.deepEqual(row, { error_code: null, status: 'pending', status_sequence: 0 })
  } finally {
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
})

test('app shutdown cancellation wins a pending claim race without reviving the row', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-generation-queue-shutdown-race-'))
  const first = openAppDatabase(root, migrations)
  const second = openAppDatabase(root, migrations)
  let reachedClaim!: () => void
  const claimReached = new Promise<void>((resolve) => {
    reachedClaim = resolve
  })
  let releaseClaim!: () => void
  const claimGate = new Promise<void>((resolve) => {
    releaseClaim = resolve
  })
  try {
    const claimQueue = new GenerationQueueRepository(first.db, root, {
      beforeClaimUpdate: async () => {
        reachedClaim()
        await claimGate
      },
    })
    const shutdownQueue = new GenerationQueueRepository(second.db, root)
    await claimQueue.recoverAfterRestart()
    await shutdownQueue.recoverAfterRestart()
    const { prepared, projectPath } = await fixture(root)
    const pending = await enqueueFixture(root, shutdownQueue, prepared, projectPath)

    const claim = claimQueue.claimNextPending()
    await claimReached
    assert.equal(await shutdownQueue.cancelPendingForShutdown(), 1)
    releaseClaim()
    assert.equal(await claim, null)
    const row = await second.db
      .selectFrom('generation_queue_item')
      .select(['status', 'status_sequence', 'error_code'])
      .where('id', '=', pending.id)
      .executeTakeFirstOrThrow()
    assert.deepEqual(row, {
      error_code: 'USER_CANCELED',
      status: 'canceled',
      status_sequence: 1,
    })
    assert.equal((await shutdownQueue.loadVerifiedInput(pending.id)).item.status, 'canceled')
  } finally {
    releaseClaim()
    await first.close()
    await second.close()
    await rm(root, { force: true, recursive: true })
  }
})

test('failed running job records normalized error; a late failure cannot change it', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-generation-queue-worker-error-'))
  try {
    const first = openAppDatabase(root, migrations)
    const queue = new GenerationQueueRepository(first.db, root)
    const { prepared, projectPath } = await fixture(root)
    const pending = await enqueueFixture(root, queue, prepared, projectPath)
    await assert.rejects(
      queue.failRunning(pending.id, 0, { code: 'WORKER_FAILED', message: 'Failed.' }),
      { code: 'QUEUE_STATUS_CONFLICT' },
    )
    const running = await queue.claimNextPending()
    assert.ok(running)
    await assert.rejects(
      queue.failRunning(running.item.id, 0, { code: 'WORKER_FAILED', message: 'Stale failure.' }),
      { code: 'QUEUE_STATUS_CONFLICT' },
    )
    assert.equal((await queue.loadVerifiedInput(running.item.id)).item.status, 'running')
    await assert.rejects(
      queue.failRunning(running.item.id, 1, { code: 'USER_CANCELED', message: 'Spoofed.' }),
      { code: 'QUEUE_FAILURE_INVALID' },
    )
    const failed = await queue.failRunning(running.item.id, 1, {
      code: 'WORKER_FAILED',
      message: 'The worker exited.',
    })
    assert.equal(failed.status, 'failed')
    assert.equal(failed.statusSequence, 2)
    await assert.rejects(
      queue.failRunning(running.item.id, 1, { code: 'WORKER_FAILED', message: 'Late failure.' }),
      { code: 'QUEUE_STATUS_CONFLICT' },
    )
    const row = await first.db
      .selectFrom('generation_queue_item')
      .select(['status', 'status_sequence', 'error_code', 'error_message'])
      .where('id', '=', pending.id)
      .executeTakeFirstOrThrow()
    assert.deepEqual(row, {
      error_code: 'WORKER_FAILED',
      error_message: 'The worker exited.',
      status: 'failed',
      status_sequence: 2,
    })
    await first.close()
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

test('corrupt frozen input fails without claiming a slot or blocking the next valid job', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-generation-queue-claim-corrupt-'))
  try {
    const first = openAppDatabase(root, migrations)
    const queue = new GenerationQueueRepository(first.db, root)
    const { prepared, projectPath } = await fixture(root)
    const corrupt = await enqueueFixture(root, queue, prepared, projectPath)
    const valid = await enqueueFixture(root, queue, prepared, projectPath)
    await first.db
      .updateTable('generation_queue_item')
      .set({ created_at: '2000-01-01T00:00:00.000Z' })
      .where('id', '=', corrupt.id)
      .execute()
    const frozen = await queue.loadVerifiedInput(corrupt.id)
    await writeFile(frozen.targetPath, 'corrupt pixels')
    await first.close()

    const second = openAppDatabase(root, migrations)
    const reopened = new GenerationQueueRepository(second.db, root)
    const claimed = await reopened.claimNextPending()
    assert.ok(claimed)
    assert.equal(claimed.item.id, valid.id)
    assert.equal(claimed.item.status, 'running')
    const damaged = await second.db
      .selectFrom('generation_queue_item')
      .select(['status', 'status_sequence', 'error_code'])
      .where('id', '=', corrupt.id)
      .executeTakeFirstOrThrow()
    assert.deepEqual(damaged, {
      error_code: 'QUEUE_INPUT_INVALID',
      status: 'failed',
      status_sequence: 1,
    })
    assert.ok((await readdir(path.dirname(frozen.targetPath))).includes('target.png'))
    await second.close()
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

test('qualified request becomes durable input and a pending SQLite row, then cancels on restart', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-generation-queue-'))
  try {
    const first = openAppDatabase(root, migrations)
    const queue = new GenerationQueueRepository(first.db, root)
    const { prepared, projectPath } = await fixture(root)
    const sessionId = randomUUID()
    let temporaryTarget = ''
    const queued = await inQualifiedLease(root, prepared, async (request) => {
      temporaryTarget = request.job.target.path
      const enqueued = queue.enqueueIllustriousTxt2Img({
        prepared,
        projectPath,
        request,
        stagingSessionId: sessionId,
      })
      // Mutating caller-held values after the call must not change the queued snapshot.
      prepared.context.prompts.positive = 'changed after enqueue'
      prepared.targetPngBytes.fill(0)
      request.job.prompts.positive = 'also changed'
      return await enqueued
    })
    assert.equal(queued.status, 'pending')
    assert.equal(queued.stagingSessionId, sessionId)
    await assert.rejects(readFile(temporaryTarget), { code: 'ENOENT' })
    const row = await first.db
      .selectFrom('generation_queue_item')
      .selectAll()
      .where('id', '=', queued.id)
      .executeTakeFirstOrThrow()
    assert.equal(row.status, 'pending')
    assert.equal(row.local_project_key, queued.localProjectKey)
    const beforeRestart = await queue.loadVerifiedInput(queued.id)
    assert.equal(beforeRestart.payload.context.prompts.positive, 'a frozen blue lantern')
    assert.equal(beforeRestart.payload.context.sampling.requestedSeedPolicy, 'fixed')
    assert.equal(beforeRestart.payload.workerJob.sampling.seed, 42)
    assert.equal(
      sha256(await readFile(beforeRestart.targetPath)),
      beforeRestart.payload.context.target.sha256,
    )
    await first.close()

    const second = openAppDatabase(root, migrations)
    const restarted = new GenerationQueueRepository(second.db, root)
    assert.deepEqual(await restarted.recoverAfterRestart(), {
      canceledCount: 1,
      orphanedDirectoriesRemoved: 0,
    })
    const recovered = await restarted.loadVerifiedInput(queued.id)
    assert.equal(recovered.item.status, 'canceled')
    assert.equal(recovered.item.statusSequence, 1)
    assert.equal(recovered.payload.context.documentRevision, row.document_revision)
    assert.equal(
      sha256(await readFile(recovered.targetPath)),
      recovered.payload.workerJob.target.sha256,
    )
    assert.deepEqual(await restarted.recoverAfterRestart(), {
      canceledCount: 0,
      orphanedDirectoriesRemoved: 0,
    })
    await second.close()
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

test('file-first publication rejects a pre-insert failure without a dangling queue row', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-generation-queue-fail-'))
  try {
    const database = openAppDatabase(root, migrations)
    const queue = new GenerationQueueRepository(database.db, root, {
      afterInputPublish: async () => {
        throw new Error('injected database boundary failure')
      },
    })
    const { prepared, projectPath } = await fixture(root)
    await assert.rejects(
      inQualifiedLease(
        root,
        prepared,
        async (request) =>
          await queue.enqueueIllustriousTxt2Img({
            prepared,
            projectPath,
            request,
            stagingSessionId: randomUUID(),
          }),
      ),
      /injected database boundary failure/,
    )
    assert.deepEqual(await readdir(path.join(root, 'generation-inputs')), [])
    const rows = await database.db.selectFrom('generation_queue_item').select('id').execute()
    assert.equal(rows.length, 0)

    // Simulate process death after rename, before INSERT: only an unregistered private directory
    // is reclaimed on the next startup. A registered input is never removed by this sweep.
    const orphan = path.join(root, 'generation-inputs', randomUUID())
    const partial = path.join(root, 'generation-inputs', `.tmp-${randomUUID()}`)
    await mkdir(orphan)
    await mkdir(partial)
    await writeFile(path.join(orphan, 'target.png'), 'unpublished')
    assert.deepEqual(await queue.recoverAfterRestart(), {
      canceledCount: 0,
      orphanedDirectoriesRemoved: 2,
    })
    assert.deepEqual(await readdir(path.join(root, 'generation-inputs')), [])
    await database.close()
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

test('SQLite insertion failure cleans a published input and leaves no queue row', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-generation-queue-sql-fail-'))
  try {
    const database = openAppDatabase(root, migrations)
    const queue = new GenerationQueueRepository(database.db, root)
    const { prepared, projectPath } = await fixture(root)
    await sql`
      CREATE TRIGGER fail_generation_insert BEFORE INSERT ON generation_queue_item
      BEGIN SELECT RAISE(ABORT, 'injected SQLite failure'); END
    `.execute(database.db)
    await assert.rejects(
      inQualifiedLease(
        root,
        prepared,
        async (request) =>
          await queue.enqueueIllustriousTxt2Img({
            prepared,
            projectPath,
            request,
            stagingSessionId: randomUUID(),
          }),
      ),
      /injected SQLite failure/,
    )
    assert.deepEqual(await readdir(path.join(root, 'generation-inputs')), [])
    assert.deepEqual(
      await database.db.selectFrom('generation_queue_item').select('id').execute(),
      [],
    )
    await database.close()
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

test('restart cancels pending and running jobs, preserving terminal history and inputs', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-generation-queue-status-'))
  try {
    const first = openAppDatabase(root, migrations)
    const queue = new GenerationQueueRepository(first.db, root)
    const { prepared, projectPath } = await fixture(root)
    const queued = []
    for (let index = 0; index < 3; index += 1) {
      queued.push(
        await inQualifiedLease(
          root,
          prepared,
          async (request) =>
            await queue.enqueueIllustriousTxt2Img({
              prepared,
              projectPath,
              request,
              stagingSessionId: randomUUID(),
            }),
        ),
      )
    }
    await first.db
      .updateTable('generation_queue_item')
      .set({ status: 'running' })
      .where('id', '=', queued[1].id)
      .execute()
    await first.db
      .updateTable('generation_queue_item')
      .set({ error_code: 'TEST_FAILURE', status: 'failed' })
      .where('id', '=', queued[2].id)
      .execute()
    await first.close()

    const second = openAppDatabase(root, migrations)
    const restarted = new GenerationQueueRepository(second.db, root)
    assert.deepEqual(await restarted.recoverAfterRestart(), {
      canceledCount: 2,
      orphanedDirectoriesRemoved: 0,
    })
    assert.deepEqual(
      await Promise.all(
        queued.map(async (item) => (await restarted.loadVerifiedInput(item.id)).item.status),
      ),
      ['canceled', 'canceled', 'failed'],
    )
    const terminal = await restarted.loadVerifiedInput(queued[2].id)
    assert.equal(terminal.item.statusSequence, 0)
    assert.deepEqual(await restarted.recoverAfterRestart(), {
      canceledCount: 0,
      orphanedDirectoriesRemoved: 0,
    })
    await second.close()
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

test('reopen rejects missing, altered or symlinked queue inputs without changing the row', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-generation-queue-corrupt-'))
  try {
    const database = openAppDatabase(root, migrations)
    const queue = new GenerationQueueRepository(database.db, root)
    const { prepared, projectPath } = await fixture(root)
    const queued = await inQualifiedLease(
      root,
      prepared,
      async (request) =>
        await queue.enqueueIllustriousTxt2Img({
          prepared,
          projectPath,
          request,
          stagingSessionId: randomUUID(),
        }),
    )
    const verified = await queue.loadVerifiedInput(queued.id)
    await writeFile(verified.targetPath, Buffer.from('changed pixels'))
    await assert.rejects(queue.loadVerifiedInput(queued.id), { code: 'QUEUE_INPUT_INVALID' })
    const row = await database.db
      .selectFrom('generation_queue_item')
      .select('status')
      .where('id', '=', queued.id)
      .executeTakeFirstOrThrow()
    assert.equal(row.status, 'pending')
    await rm(verified.targetPath)
    await assert.rejects(queue.loadVerifiedInput(queued.id), { code: 'QUEUE_INPUT_INVALID' })
    const sentinel = path.join(root, 'outside-sentinel.png')
    await writeFile(sentinel, 'must not follow')
    await symlink(sentinel, verified.targetPath)
    await assert.rejects(queue.loadVerifiedInput(queued.id), { code: 'QUEUE_INPUT_INVALID' })
    assert.equal((await readFile(sentinel)).toString(), 'must not follow')
    await database.close()
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

test('corrupted nested payload and checkpoint mismatch are diagnosed before reading an input', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-generation-queue-payload-'))
  try {
    const database = openAppDatabase(root, migrations)
    const queue = new GenerationQueueRepository(database.db, root)
    const { prepared, projectPath } = await fixture(root)
    const queued = await inQualifiedLease(
      root,
      prepared,
      async (request) =>
        await queue.enqueueIllustriousTxt2Img({
          prepared,
          projectPath,
          request,
          stagingSessionId: randomUUID(),
        }),
    )
    const stored = await database.db
      .selectFrom('generation_queue_item')
      .select('frozen_payload_json')
      .where('id', '=', queued.id)
      .executeTakeFirstOrThrow()
    const changed = JSON.parse(stored.frozen_payload_json) as {
      context: { model: { reference: unknown } }
      workerJob: { checkpoint: { path: string } }
    }
    changed.context.model.reference = null
    await database.db
      .updateTable('generation_queue_item')
      .set({ frozen_payload_json: JSON.stringify(changed) })
      .where('id', '=', queued.id)
      .execute()
    await assert.rejects(queue.loadVerifiedInput(queued.id), { code: 'QUEUE_INPUT_INVALID' })

    const different = JSON.parse(stored.frozen_payload_json) as typeof changed
    different.workerJob.checkpoint.path = path.join(root, 'different-model.safetensors')
    await database.db
      .updateTable('generation_queue_item')
      .set({ frozen_payload_json: JSON.stringify(different) })
      .where('id', '=', queued.id)
      .execute()
    await assert.rejects(queue.loadVerifiedInput(queued.id), { code: 'QUEUE_INPUT_INVALID' })
    await database.close()
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

test('pre-existing shared generation-input directory is refused before queue insertion', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-generation-queue-permissions-'))
  try {
    const storage = path.join(root, 'generation-inputs')
    await mkdir(storage)
    await chmod(storage, 0o777)
    const database = openAppDatabase(root, migrations)
    const queue = new GenerationQueueRepository(database.db, root)
    const { prepared, projectPath } = await fixture(root)
    await assert.rejects(
      inQualifiedLease(
        root,
        prepared,
        async (request) =>
          await queue.enqueueIllustriousTxt2Img({
            prepared,
            projectPath,
            request,
            stagingSessionId: randomUUID(),
          }),
      ),
      { code: 'QUEUE_STORAGE_UNSAFE' },
    )
    assert.deepEqual(
      await database.db.selectFrom('generation_queue_item').select('id').execute(),
      [],
    )
    await database.close()
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

test('queue inputs use canonical app data storage through a symlinked root', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-generation-queue-alias-'))
  try {
    const actual = path.join(root, 'actual-data')
    const alias = path.join(root, 'data-alias')
    await mkdir(actual)
    await symlink(actual, alias)
    const database = openAppDatabase(alias, migrations)
    const queue = new GenerationQueueRepository(database.db, alias)
    const { prepared, projectPath } = await fixture(actual)
    const queued = await inQualifiedLease(
      actual,
      prepared,
      async (request) =>
        await queue.enqueueIllustriousTxt2Img({
          prepared,
          projectPath,
          request,
          stagingSessionId: randomUUID(),
        }),
    )
    const verified = await queue.loadVerifiedInput(queued.id)
    assert.equal(
      verified.targetPath,
      path.join(actual, 'generation-inputs', queued.id, 'target.png'),
    )
    await database.close()
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

test('retry consumes one terminal revision and creates a fresh frozen attempt across repository instances', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-generation-retry-'))
  const first = openAppDatabase(root, migrations)
  const second = openAppDatabase(root, migrations)
  try {
    const queueA = new GenerationQueueRepository(first.db, root)
    const queueB = new GenerationQueueRepository(second.db, root)
    await queueA.recoverAfterRestart()
    await queueB.recoverAfterRestart()
    const { prepared, projectPath } = await fixture(root)
    const originalProjectBytes = await readFile(projectPath)
    const original = await enqueueFixture(root, queueA, prepared, projectPath)
    const canceled = await queueA.cancel(original.id, original.statusSequence)
    const source = await queueA.loadVerifiedInput(original.id)
    const sourceBytes = await readFile(source.targetPath)

    // Both instances read the same terminal sequence, but the SQLite compare-and-swap permits
    // just one retry. A second click on the original is stale; it cannot spawn a duplicate.
    const attempts = await Promise.allSettled([
      queueA.retryTerminal(original.id, canceled.statusSequence),
      queueB.retryTerminal(original.id, canceled.statusSequence),
    ])
    const successful = attempts.filter((attempt) => attempt.status === 'fulfilled')
    const rejected = attempts.filter((attempt) => attempt.status === 'rejected')
    assert.equal(successful.length, 1)
    assert.equal(rejected.length, 1)
    const retry = successful[0].value
    assert.equal(rejected[0].reason.code, 'QUEUE_STATUS_CONFLICT')
    assert.equal(retry.status, 'pending')
    assert.notEqual(retry.id, original.id)
    assert.notEqual(retry.batchId, original.batchId)
    assert.notEqual(retry.stagingSessionId, original.stagingSessionId)
    assert.equal(retry.localProjectKey, original.localProjectKey)
    const retried = await queueA.loadVerifiedInput(retry.id)
    assert.deepEqual(retried.payload, source.payload)
    assert.deepEqual(await readFile(retried.targetPath), sourceBytes)
    assert.deepEqual(await readFile(projectPath), originalProjectBytes)
    assert.equal((await queueA.loadVerifiedInput(original.id)).item.status, 'canceled')
    assert.equal((await queueA.loadVerifiedInput(original.id)).item.statusSequence, 2)
    const runningRetry = await queueB.claimNextPending()
    assert.equal(runningRetry?.item.id, retry.id)
    const failedRetry = await queueB.failRunning(retry.id, runningRetry.item.statusSequence, {
      code: 'GENERATION_WORKER_FAILED',
      message: 'The worker failed.',
    })
    const next = await queueA.retryTerminal(retry.id, failedRetry.statusSequence)
    assert.equal(next.status, 'pending')
    assert.notEqual(next.id, retry.id)
    assert.deepEqual((await queueB.loadVerifiedInput(next.id)).payload, source.payload)
  } finally {
    await first.close()
    await second.close()
    await rm(root, { force: true, recursive: true })
  }
})

test('CFG Rescale is frozen through SQLite publication, restart and retry; mismatches refuse admission and durable reads', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-cfg-rescale-queue-'))
  let database = openAppDatabase(root, migrations)
  try {
    let queue = new GenerationQueueRepository(database.db, root)
    await queue.recoverAfterRestart()
    const { prepared, projectPath } = await fixture(root)
    prepared.context.sampling.cfgRescale = 0.3
    const qualified = {
      ...ready,
      capabilities: [
        'illustrious-txt2img',
        'denoising-progress',
        'candidate-thumbnails',
        'illustrious-cfg-rescale',
      ],
      workerVersion: '0.5.0',
    }
    const queued = await inQualifiedLease(
      root,
      prepared,
      async (request) => {
        const mismatch = structuredClone(request)
        mismatch.job.sampling.cfgRescale = 0.4
        await assert.rejects(
          queue.enqueueIllustriousTxt2Img({
            prepared,
            projectPath,
            request: mismatch,
            stagingSessionId: randomUUID(),
          }),
          { code: 'QUEUE_INPUT_INVALID' },
        )
        assert.equal((await queue.listManagerPage()).items.length, 0)
        return await queue.enqueueIllustriousTxt2Img({
          prepared,
          projectPath,
          request,
          stagingSessionId: randomUUID(),
        })
      },
      qualified,
    )
    prepared.context.sampling.cfgRescale = 0.9
    const original = await queue.loadVerifiedInput(queued.id)
    assert.equal(original.payload.context.sampling.cfgRescale, 0.3)
    assert.equal(original.payload.workerJob.sampling.cfgRescale, 0.3)
    await database.close()
    database = openAppDatabase(root, migrations)
    queue = new GenerationQueueRepository(database.db, root)
    await queue.recoverAfterRestart()
    const terminal = await queue.loadVerifiedInput(queued.id)
    assert.equal(terminal.item.status, 'canceled')
    const retried = await queue.retryTerminal(queued.id, terminal.item.statusSequence)
    const frozen = await queue.loadVerifiedInput(retried.id)
    assert.deepEqual(frozen.payload, original.payload)
    assert.equal(frozen.payload.context.sampling.cfgRescale, 0.3)
    const corrupted = structuredClone(frozen.payload)
    corrupted.workerJob.sampling.cfgRescale = 0.4
    await database.db
      .updateTable('generation_queue_item')
      .set({ frozen_payload_json: JSON.stringify(corrupted) })
      .where('id', '=', retried.id)
      .execute()
    await assert.rejects(queue.loadVerifiedInput(retried.id), { code: 'QUEUE_INPUT_INVALID' })
    const legacy = await fixture(root)
    legacy.prepared.context.sampling.cfgRescale = 0
    const neutral = await enqueueFixture(root, queue, legacy.prepared, legacy.projectPath)
    const savedNeutral = await queue.loadVerifiedInput(neutral.id)
    assert.equal(savedNeutral.payload.context.sampling.cfgRescale, 0)
    assert.equal(Object.hasOwn(savedNeutral.payload.workerJob.sampling, 'cfgRescale'), false)
  } finally {
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
})

test('retry refuses corrupt input and a Project fence raised before durable insertion', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-generation-retry-guards-'))
  const database = openAppDatabase(root, migrations)
  let queue: GenerationQueueRepository | null = null
  try {
    let fencedKey = ''
    queue = new GenerationQueueRepository(database.db, root, {
      afterRetryInputPublish: async () => queue?.fenceProject(fencedKey),
    })
    await queue.recoverAfterRestart()
    const { prepared, projectPath } = await fixture(root)
    const corrupt = await enqueueFixture(root, queue, prepared, projectPath)
    const canceledCorrupt = await queue.cancel(corrupt.id)
    const corruptInput = await queue.loadVerifiedInput(corrupt.id)
    await writeFile(corruptInput.targetPath, 'corrupt target')
    await assert.rejects(queue.retryTerminal(corrupt.id, canceledCorrupt.statusSequence), {
      code: 'QUEUE_INPUT_INVALID',
    })
    assert.equal(await queue.loadVerifiedInput(corrupt.id).catch(() => null), null)

    const original = await enqueueFixture(root, queue, prepared, projectPath)
    fencedKey = original.localProjectKey
    const canceled = await queue.cancel(original.id)
    await assert.rejects(queue.retryTerminal(original.id, canceled.statusSequence), {
      code: 'QUEUE_PROJECT_CLOSING',
    })
    assert.equal(
      (await database.db.selectFrom('generation_queue_item').select('id').execute()).length,
      2,
    )
    assert.deepEqual(
      (await readdir(path.join(root, 'generation-inputs'))).sort(),
      [corrupt.id, original.id].sort(),
    )
    assert.equal(
      (await queue.loadVerifiedInput(original.id)).item.statusSequence,
      canceled.statusSequence,
    )
  } finally {
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
})

test('interruption after retry file publication leaves the original terminal row and sequence intact', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-generation-retry-interrupt-'))
  const database = openAppDatabase(root, migrations)
  try {
    const queue = new GenerationQueueRepository(database.db, root, {
      afterRetryInputPublish: async () => {
        throw new Error('Simulated interruption before SQLite insertion.')
      },
    })
    await queue.recoverAfterRestart()
    const { prepared, projectPath } = await fixture(root)
    const original = await enqueueFixture(root, queue, prepared, projectPath)
    const canceled = await queue.cancel(original.id)
    await assert.rejects(queue.retryTerminal(original.id, canceled.statusSequence), {
      message: 'Simulated interruption before SQLite insertion.',
    })
    assert.deepEqual(
      await database.db
        .selectFrom('generation_queue_item')
        .select(['id', 'status', 'status_sequence'])
        .execute(),
      [{ id: original.id, status: 'canceled', status_sequence: canceled.statusSequence }],
    )
    assert.deepEqual(await readdir(path.join(root, 'generation-inputs')), [original.id])
  } finally {
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
})

test('reserved publication survives retry/prune attempts and a completed candidate survives queue deletion', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-generation-queue-receipt-'))
  const first = openAppDatabase(root, migrations)
  try {
    const queue = new GenerationQueueRepository(first.db, root)
    const staging = new GenerationStagingRepository(first.db, root, {
      afterManifestPublish: async () => {
        throw new Error('Simulated process interruption after manifest publication.')
      },
    })
    await queue.recoverAfterRestart()
    await staging.recoverAfterRestart()
    const { prepared, projectPath } = await fixture(root)
    let itemId = ''
    await inQualifiedLease(root, prepared, async (request) => {
      const item = await queue.enqueueIllustriousTxt2Img({
        prepared,
        projectPath,
        request,
        stagingSessionId: randomUUID(),
      })
      itemId = item.id
      const claimed = await queue.claimNextPending()
      assert.equal(claimed?.item.id, item.id)
      await writeFile(request.job.output.pngPath, await opaqueSrgbPng(64, 64), {
        flag: 'wx',
      })
      await assert.rejects(
        staging.publishIllustriousTxt2Img({
          actualSeed: 42,
          expectedProvisionalRoot: request.job.output.stagingRoot,
          expectedStatusSequence: claimed.item.statusSequence,
          provisionalOutputPath: request.job.output.pngPath,
          queueItemId: item.id,
        }),
        /Simulated process interruption/,
      )
    })
    await first.close()

    const second = openAppDatabase(root, migrations)
    try {
      const recoveredQueue = new GenerationQueueRepository(second.db, root)
      await recoveredQueue.recoverAfterRestart()
      const canceled = (await recoveredQueue.loadVerifiedInput(itemId)).item
      assert.equal(canceled.status, 'canceled')
      assert.equal((await recoveredQueue.getManagerEntry(itemId)).publicationPending, true)
      assert.equal((await recoveredQueue.listManagerPage()).items[0].publicationPending, true)
      await assert.rejects(recoveredQueue.retryTerminal(itemId, canceled.statusSequence), {
        code: 'QUEUE_PUBLICATION_UNCERTAIN',
      })
      await assert.rejects(recoveredQueue.deleteTerminal(itemId, canceled.statusSequence), {
        code: 'QUEUE_PUBLICATION_UNCERTAIN',
      })
      assert.equal(await recoveredQueue.pruneTerminal(['canceled']), 0)
      const recoveredStaging = new GenerationStagingRepository(second.db, root)
      assert.deepEqual(await recoveredStaging.recoverAfterRestart(), {
        invalidCount: 0,
        reconciledCount: 1,
      })
      const beforePrune = await recoveredStaging.listVerifiedCandidates(canceled.localProjectKey)
      assert.equal(beforePrune.length, 1)
      assert.equal(beforePrune[0].queueItemId, itemId)
      assert.equal((await recoveredQueue.getManagerEntry(itemId)).publicationPending, false)
      assert.equal((await recoveredQueue.getManagerEntry(itemId)).status, 'completed')
      assert.equal(await recoveredQueue.pruneTerminal(['completed']), 1)
      assert.equal(
        (await second.db.selectFrom('generation_queue_item').select('id').execute()).length,
        0,
      )
      assert.equal(
        (await recoveredStaging.listVerifiedCandidates(canceled.localProjectKey)).length,
        1,
      )
      assert.equal(
        await recoveredStaging.readLastActualSeed(
          canceled.localProjectKey,
          beforePrune[0].documentId,
        ),
        42,
      )
    } finally {
      await second.close()
    }
  } finally {
    await first.close().catch(() => undefined)
    await rm(root, { force: true, recursive: true })
  }
})

test('terminal prune reports committed rows when input cleanup fails and restart removes orphans', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-generation-queue-prune-'))
  const first = openAppDatabase(root, migrations)
  try {
    const queue = new GenerationQueueRepository(first.db, root, {
      beforePruneInputCleanup: async () => {
        throw new Error('Simulated filesystem cleanup failure.')
      },
    })
    await queue.recoverAfterRestart()
    const { prepared, projectPath } = await fixture(root)
    const canceled = await enqueueFixture(root, queue, prepared, projectPath)
    await queue.cancel(canceled.id)
    const pending = await enqueueFixture(root, queue, prepared, projectPath)
    assert.equal(await queue.pruneTerminal(['failed', 'canceled']), 1)
    assert.deepEqual(
      (await first.db.selectFrom('generation_queue_item').select('id').execute()).map(
        (row) => row.id,
      ),
      [pending.id],
    )
    assert.ok((await readdir(path.join(root, 'generation-inputs'))).includes(canceled.id))
    await first.close()

    const second = openAppDatabase(root, migrations)
    try {
      const restarted = new GenerationQueueRepository(second.db, root)
      assert.deepEqual(await restarted.recoverAfterRestart(), {
        canceledCount: 1,
        orphanedDirectoriesRemoved: 1,
      })
      assert.equal((await restarted.loadVerifiedInput(pending.id)).item.status, 'canceled')
      assert.equal(
        (await readdir(path.join(root, 'generation-inputs'))).includes(canceled.id),
        false,
      )
      await restarted.deleteTerminal(pending.id, 1)
      assert.deepEqual(await readdir(path.join(root, 'generation-inputs')), [])
    } finally {
      await second.close()
    }
  } finally {
    await first.close().catch(() => undefined)
    await rm(root, { force: true, recursive: true })
  }
})

test('a process interruption after terminal row deletion leaves only an orphan input for startup recovery', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-generation-queue-prune-crash-'))
  const first = openAppDatabase(root, migrations)
  try {
    const queue = new GenerationQueueRepository(first.db, root, {
      afterPruneCommit: async () => {
        throw new Error('Simulated crash after SQLite deletion.')
      },
    })
    await queue.recoverAfterRestart()
    const { prepared, projectPath } = await fixture(root)
    const item = await enqueueFixture(root, queue, prepared, projectPath)
    const canceled = await queue.cancel(item.id)
    await assert.rejects(queue.deleteTerminal(item.id, canceled.statusSequence), {
      message: 'Simulated crash after SQLite deletion.',
    })
    assert.deepEqual(await first.db.selectFrom('generation_queue_item').select('id').execute(), [])
    assert.ok((await readdir(path.join(root, 'generation-inputs'))).includes(item.id))
    await first.close()

    const second = openAppDatabase(root, migrations)
    try {
      const reopened = new GenerationQueueRepository(second.db, root)
      assert.deepEqual(await reopened.recoverAfterRestart(), {
        canceledCount: 0,
        orphanedDirectoriesRemoved: 1,
      })
      assert.deepEqual(await readdir(path.join(root, 'generation-inputs')), [])
    } finally {
      await second.close()
    }
  } finally {
    await first.close().catch(() => undefined)
    await rm(root, { force: true, recursive: true })
  }
})

test('manager pages real SQLite history by newest stable keys without reading frozen files', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-queue-manager-pages-'))
  const database = openAppDatabase(root, migrations)
  try {
    const queue = new GenerationQueueRepository(database.db, root)
    await assert.rejects(queue.listManagerPage(), { code: 'QUEUE_NOT_RECONCILED' })
    await queue.recoverAfterRestart()
    const { prepared, projectPath } = await fixture(root)
    const items = await inQualifiedBatchLeases(
      root,
      prepared,
      GENERATION_QUEUE_PAGE_SIZE + 7,
      async (concrete) =>
        await queue.enqueueIllustriousTxt2ImgBatch({
          items: concrete,
          preflight: async () => undefined,
          projectPath,
          stagingSessionId: randomUUID(),
        }),
    )
    const expectedCounts = { canceled: 0, completed: 0, failed: 0, pending: 0, running: 0 }
    const terminal = ['completed', 'failed', 'canceled'] as const
    for (let index = 0; index < items.length; index += 1) {
      const status = index === 0 ? 'running' : index < 5 ? 'pending' : terminal[index % 3]
      expectedCounts[status] += 1
      await database.db
        .updateTable('generation_queue_item')
        .set({
          error_code: status === 'failed' ? 'GENERATION_WORKER_FAILED' : null,
          error_message: status === 'failed' ? '/private/worker-output-path' : null,
          finished_at: status === 'pending' || status === 'running' ? null : items[index].createdAt,
          started_at: status === 'pending' ? null : items[index].createdAt,
          status,
          status_sequence: status === 'pending' ? 0 : 1,
        })
        .where('id', '=', items[index].id)
        .execute()
    }
    // The projection must work with missing PNG/checkpoint files. It is not Retry verification.
    await rm(path.join(root, 'generation-inputs'), { recursive: true })
    await rm(prepared.context.model.managedPath)
    const corrupt = items[5]
    await database.db
      .updateTable('generation_queue_item')
      .set({ frozen_payload_json: '{invalid payload' })
      .where('id', '=', corrupt.id)
      .execute()
    const first = await queue.listManagerPage(null)
    assert.equal(first.items.length, GENERATION_QUEUE_PAGE_SIZE)
    assert.ok(isGenerationQueuePage(first))
    assert.deepEqual(first.counts, expectedCounts)
    assert.ok(first.nextCursor)
    const second = await queue.listManagerPage(first.nextCursor)
    assert.equal(second.items.length, 7)
    assert.equal(second.nextCursor, null)
    assert.ok(isGenerationQueuePage(second))
    const expectedIds = items
      .map((item) => item.id)
      .sort()
      .reverse()
    const pagedIds = [...first.items, ...second.items].map((item) => item.id)
    assert.deepEqual(pagedIds, expectedIds)
    assert.equal(new Set(pagedIds).size, items.length)
    const entries = [...first.items, ...second.items]
    for (const entry of entries) {
      assert.equal(
        entry.stagingSessionId,
        items.find((item) => item.id === entry.id)?.stagingSessionId,
      )
    }
    assert.equal(entries.find((entry) => entry.id === corrupt.id)?.details, null)
    assert.equal(entries.find((entry) => entry.id === items[1].id)?.details?.sampling.seed, 0)
    assert.equal(entries.find((entry) => entry.id === items[1].id)?.statusSequence, 0)
    assert.ok(entries.every((entry) => entry.projectName === 'Project'))
    assert.ok(entries.every((entry) => !entry.publicationPending))
    assert.ok(!JSON.stringify(entries).includes('/private/worker-output-path'))
    assert.ok(!JSON.stringify(entries).includes(prepared.context.model.managedPath))
    const reviewed = await queue.getManagerEntry(corrupt.id)
    assert.equal(reviewed.details, null)
    assert.equal(reviewed.stagingSessionId, corrupt.stagingSessionId)
    assert.equal(reviewed.statusSequence, 1)
    await assert.rejects(queue.deleteTerminal(corrupt.id, 0), { code: 'QUEUE_STATUS_CONFLICT' })
    await queue.deleteTerminal(corrupt.id, reviewed.statusSequence)
    await assert.rejects(queue.getManagerEntry(corrupt.id), { code: 'QUEUE_ITEM_NOT_FOUND' })
    await assert.rejects(queue.listManagerPage({ createdAt: 'yesterday', id: randomUUID() }), {
      code: 'QUEUE_INPUT_INVALID',
    })
  } finally {
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
})

test('manager entries retain separate staging sessions for attempts of one document after terminal deletion', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-queue-manager-sessions-'))
  const database = openAppDatabase(root, migrations)
  try {
    const queue = new GenerationQueueRepository(database.db, root)
    await queue.recoverAfterRestart()
    const { prepared, projectPath } = await fixture(root)
    const first = await enqueueFixture(root, queue, prepared, projectPath)
    const neighbor = await enqueueFixture(root, queue, prepared, projectPath)
    assert.notEqual(first.stagingSessionId, neighbor.stagingSessionId)
    assert.equal(first.localProjectKey, neighbor.localProjectKey)
    const canceled = await queue.cancel(first.id, first.statusSequence)
    await rm(path.join(root, 'generation-inputs'), { recursive: true })
    await rm(prepared.context.model.managedPath)
    const page = await queue.listManagerPage()
    assert.ok(isGenerationQueuePage(page))
    for (const item of [first, neighbor]) {
      const projected = page.items.find((entry) => entry.id === item.id)
      assert.equal(projected?.stagingSessionId, item.stagingSessionId)
      assert.equal(projected?.documentId, prepared.context.documentId)
      assert.equal((await queue.getManagerEntry(item.id)).stagingSessionId, item.stagingSessionId)
    }
    await queue.deleteTerminal(first.id, canceled.statusSequence)
    const afterDelete = await queue.listManagerPage()
    assert.equal(afterDelete.items.length, 1)
    assert.equal(afterDelete.items[0].id, neighbor.id)
    assert.equal(afterDelete.items[0].stagingSessionId, neighbor.stagingSessionId)
    assert.equal(
      (await queue.getManagerEntry(neighbor.id)).stagingSessionId,
      neighbor.stagingSessionId,
    )
  } finally {
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
})

test('manager cursor excludes later insertions while counts remain app-wide across Project identities', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-queue-manager-cursor-'))
  const database = openAppDatabase(root, migrations)
  try {
    const queue = new GenerationQueueRepository(database.db, root)
    await queue.recoverAfterRestart()
    const source = await fixture(root)
    const items = await inQualifiedBatchLeases(
      root,
      source.prepared,
      GENERATION_QUEUE_PAGE_SIZE + 1,
      async (concrete) =>
        await queue.enqueueIllustriousTxt2ImgBatch({
          items: concrete,
          preflight: async () => undefined,
          projectPath: source.projectPath,
          stagingSessionId: randomUUID(),
        }),
    )
    const first = await queue.listManagerPage()
    assert.ok(first.nextCursor)
    const neighborPath = path.join(root, 'Neighbor.igs')
    await writeFile(neighborPath, 'neighbor Project path')
    const neighborPrepared: PreparedNormalTxt2Img = {
      context: structuredClone(source.prepared.context),
      targetPngBytes: source.prepared.targetPngBytes,
    }
    neighborPrepared.context.documentId = randomUUID()
    const neighbor = await enqueueFixture(root, queue, neighborPrepared, neighborPath)
    // Make the arrival definitely newer; timestamp resolution is not the pagination subject.
    await database.db
      .updateTable('generation_queue_item')
      .set({ created_at: '2999-01-01T00:00:00.000Z' })
      .where('id', '=', neighbor.id)
      .execute()
    const second = await queue.listManagerPage(first.nextCursor)
    assert.equal(second.items.length, 1)
    assert.equal(second.nextCursor, null)
    assert.deepEqual(
      [...first.items, ...second.items].map((entry) => entry.id),
      items
        .map((item) => item.id)
        .sort()
        .reverse(),
    )
    assert.equal(second.counts.pending, items.length + 1)
    const refreshed = await queue.listManagerPage()
    assert.equal(refreshed.items[0].id, neighbor.id)
    assert.equal(refreshed.items[0].projectName, 'Neighbor')
    assert.equal(refreshed.items[0].documentId, neighborPrepared.context.documentId)
    assert.notEqual(refreshed.items[0].projectKey, first.items[0].projectKey)
  } finally {
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
})

test('retry preflight sees durable new identities before CAS and refusal preserves the source revision', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-queue-retry-preflight-'))
  const database = openAppDatabase(root, migrations)
  try {
    const queue = new GenerationQueueRepository(database.db, root)
    const staging = new GenerationStagingRepository(database.db, root)
    await queue.recoverAfterRestart()
    await staging.recoverAfterRestart()
    const { prepared, projectPath } = await fixture(root)
    const original = await enqueueFixture(root, queue, prepared, projectPath)
    const canceled = await queue.cancel(original.id, original.statusSequence)
    const originalPayload = await queue.loadVerifiedInput(original.id)
    let called = 0
    await assert.rejects(
      queue.retryTerminal(original.id, canceled.statusSequence, async (input) => {
        called += 1
        assert.deepEqual(input.source, canceled)
        assert.notEqual(input.queueItemId, original.id)
        assert.notEqual(input.stagingSessionId, original.stagingSessionId)
        assert.deepEqual(
          await readFile(path.join(root, 'generation-inputs', input.queueItemId, 'target.png')),
          prepared.targetPngBytes,
        )
        assert.equal(
          await database.db
            .selectFrom('generation_queue_item')
            .select('id')
            .where('id', '=', input.queueItemId)
            .executeTakeFirst(),
          undefined,
        )
        assert.equal(
          JSON.parse(input.frozenPayloadJson).context.documentId,
          prepared.context.documentId,
        )
        throw new Error('Current document identity no longer matches.')
      }),
      { message: 'Current document identity no longer matches.' },
    )
    assert.equal(called, 1)
    assert.equal((await queue.getManagerEntry(original.id)).statusSequence, canceled.statusSequence)
    assert.deepEqual(await readdir(path.join(root, 'generation-inputs')), [original.id])
    assert.equal((await queue.listManagerPage()).counts.pending, 0)
    await assert.rejects(
      queue.retryTerminal(original.id, original.statusSequence, async () => {
        called += 1
      }),
      { code: 'QUEUE_STATUS_CONFLICT' },
    )
    assert.equal(called, 1)
    const retried = await queue.retryTerminal(
      original.id,
      canceled.statusSequence,
      async (input) => {
        called += 1
        await staging.preflightBatchCapacity({
          entries: [{ frozenPayloadJson: input.frozenPayloadJson, queueItemId: input.queueItemId }],
          localProjectKey: input.source.localProjectKey,
          projectPath: input.source.projectPath,
          stagingSessionId: input.stagingSessionId,
        })
      },
    )
    assert.equal(called, 2)
    assert.equal(retried.status, 'pending')
    assert.equal(
      (await queue.getManagerEntry(original.id)).statusSequence,
      canceled.statusSequence + 1,
    )
    assert.deepEqual((await queue.loadVerifiedInput(retried.id)).payload, originalPayload.payload)
    assert.deepEqual(
      await readFile((await queue.loadVerifiedInput(retried.id)).targetPath),
      prepared.targetPngBytes,
    )
  } finally {
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
})

test('retry resolves lost commit acknowledgement from the exact committed frozen attempt', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-queue-retry-ack-'))
  const database = openAppDatabase(root, migrations)
  try {
    const queue = new GenerationQueueRepository(database.db, root, {
      afterRetryCommit: async () => {
        throw new Error('Retry commit acknowledgement lost.')
      },
    })
    await queue.recoverAfterRestart()
    const { prepared, projectPath } = await fixture(root)
    const original = await enqueueFixture(root, queue, prepared, projectPath)
    const canceled = await queue.cancel(original.id)
    const retry = await queue.retryTerminal(original.id, canceled.statusSequence)
    assert.equal(retry.status, 'pending')
    assert.equal(
      (await queue.getManagerEntry(original.id)).statusSequence,
      canceled.statusSequence + 1,
    )
    assert.equal(
      (await queue.loadVerifiedInput(retry.id)).payload.context.sampling.seed,
      prepared.context.sampling.seed,
    )
    assert.equal((await queue.listManagerPage()).items.length, 2)
    await assert.rejects(queue.retryTerminal(original.id, canceled.statusSequence), {
      code: 'QUEUE_STATUS_CONFLICT',
    })
  } finally {
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
})

test('retry unreadable publication outcomes retain inputs and block admission and dispatch until recovery', async (t) => {
  for (const committed of [false, true]) {
    await t.test(committed ? 'committed' : 'rolled back', async () => {
      const root = await mkdtemp(path.join(os.tmpdir(), 'igs-queue-retry-unknown-'))
      const database = openAppDatabase(root, migrations)
      try {
        let denyInspection = false
        const plugin: KyselyPlugin = {
          transformQuery: ({ node }) => {
            if (
              denyInspection &&
              node.kind === 'SelectQueryNode' &&
              JSON.stringify(node).includes('generation_queue_item')
            ) {
              throw new Error('SQLite inspection unavailable')
            }
            return node
          },
          transformResult: async ({ result }) => result,
        }
        const loseAcknowledgement = async () => {
          denyInspection = true
          throw new Error('Retry publication outcome unknown')
        }
        const queue = new GenerationQueueRepository(database.db.withPlugin(plugin), root, {
          afterRetryCommit: committed ? loseAcknowledgement : undefined,
          beforeRetryCommit: committed ? undefined : loseAcknowledgement,
        })
        await queue.recoverAfterRestart()
        const { prepared, projectPath } = await fixture(root)
        const original = await enqueueFixture(root, queue, prepared, projectPath)
        const canceled = await queue.cancel(original.id)
        await assert.rejects(queue.retryTerminal(original.id, canceled.statusSequence), {
          code: 'QUEUE_PUBLICATION_UNCERTAIN',
        })
        const rows = await database.db.selectFrom('generation_queue_item').selectAll().execute()
        assert.equal(rows.length, committed ? 2 : 1)
        assert.equal((await readdir(path.join(root, 'generation-inputs'))).length, 2)
        assert.equal(
          rows.find((row) => row.id === original.id)?.status_sequence,
          canceled.statusSequence + (committed ? 1 : 0),
        )
        assert.throws(() => queue.assertProjectCanEnqueue(original.localProjectKey), {
          code: 'QUEUE_PUBLICATION_UNCERTAIN',
        })
        assert.throws(() => queue.assertReadyForDispatch(), { code: 'QUEUE_PUBLICATION_UNCERTAIN' })
        assert.throws(() => queue.releaseProjectFence(original.localProjectKey), {
          code: 'QUEUE_PUBLICATION_UNCERTAIN',
        })
        denyInspection = false
        assert.deepEqual(await queue.recoverAfterRestart(), {
          canceledCount: committed ? 1 : 0,
          orphanedDirectoriesRemoved: committed ? 0 : 1,
        })
        queue.releaseProjectFence(original.localProjectKey)
        assert.equal((await queue.listManagerPage()).counts.pending, 0)
        assert.equal(
          (await readdir(path.join(root, 'generation-inputs'))).length,
          committed ? 2 : 1,
        )
      } finally {
        await database.close()
        await rm(root, { force: true, recursive: true })
      }
    })
  }
})
