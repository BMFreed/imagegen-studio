import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import {
  createEmptyProjectDocumentV1,
  type IgsProjectDocumentV1,
} from '../../shared/projects/project-schema.js'

import { sql } from 'kysely'
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
): Promise<T> {
  return await withIllustriousTxt2ImgRequest({
    modelService: {
      // ModelService's real exact-byte verification is covered by the request-boundary tests.
      resolveVerifiedGenerationCheckpointForPlan: async (reference) => ({
        managedPath: prepared.context.model.managedPath,
        reference,
      }),
    },
    prepared,
    ready,
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
