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
import { GenerationQueueRepository } from './generation-queue.js'
import {
  type IllustriousTxt2ImgRequestV1,
  withIllustriousTxt2ImgRequest,
} from './illustrious-txt2img-job.js'

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
