import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'

import { sql } from 'kysely'
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { crc32, deflateSync } from 'node:zlib'

import type { IllustriousTxt2ImgRequestV1 } from './illustrious-txt2img-job.js'
import type { PreparedNormalTxt2Img } from './project-generation-preparation.js'

import { openAppDatabase } from '../db/database.js'
import { GenerationQueueRepository } from './generation-queue.js'
import {
  GenerationStagingRepository,
  type VerifiedGenerationCandidate,
} from './generation-staging.js'
import { readIgsPackage, validateSrgbPngStream } from './igs-package.js'
import { withIllustriousTxt2ImgRequest } from './illustrious-txt2img-job.js'
import { ProjectAutosaveCoordinator, ProjectAutosaveLeaseRegistry } from './project-autosave.js'
import { ProjectGenerationAcceptance } from './project-generation-acceptance.js'
import { ProjectGenerationOperationGate } from './project-generation-operation-gate.js'
import { ProjectGenerationResultResource } from './project-generation-result-resource.js'
import { localProjectRecoveryKey } from './project-identity.js'
import { ProjectSession } from './project-session.js'
import { ProjectShadowStore } from './project-shadow.js'

const migrations = path.resolve('src/main/db/migrations')
const placeholders = path.resolve('src/main/projects/placeholders')
const iccPath = path.resolve('worker-python/src/imagegen_worker/srgb.icc')
const bbox = { height: 64, width: 64, x: -24, y: 48 }
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

async function srgbPng(
  width: number,
  height: number,
  opaque: boolean,
  invalidFilter = false,
  bitDepth: 16 | 8 = 8,
  channels: 3 | 4 = 4,
): Promise<Buffer> {
  const profile = await readFile(iccPath)
  assert.equal(sha256(profile), IGS_SRGB_ICC_SHA256)
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = bitDepth
  ihdr[9] = channels === 4 ? 6 : 2
  const bytesPerChannel = bitDepth / 8
  const rowBytes = 1 + width * channels * bytesPerChannel
  const scanlines = Buffer.alloc(rowBytes * height)
  if (invalidFilter) {
    scanlines[0] = 5
  }
  if (opaque) {
    for (let row = 0; row < height; row += 1) {
      for (let col = 0; col < width; col += 1) {
        const offset = row * rowBytes + 1 + col * channels * bytesPerChannel
        if (bitDepth === 8) {
          scanlines[offset] = 37
          scanlines[offset + 1] = 94
          scanlines[offset + 2] = 181
          if (channels === 4) {
            scanlines[offset + 3] = 255
          }
        } else {
          scanlines.writeUInt16BE(37 * 257, offset)
          scanlines.writeUInt16BE(94 * 257, offset + 2)
          scanlines.writeUInt16BE(181 * 257, offset + 4)
          if (channels === 4) {
            scanlines.writeUInt16BE(65_535, offset + 6)
          }
        }
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

async function fixture(
  root: string,
  basename = 'Project.igs',
): Promise<{
  outputBytes: Buffer
  prepared: PreparedNormalTxt2Img
  projectPath: string
}> {
  await mkdir(path.join(root, 'scratch'), { mode: 0o700, recursive: true })
  const project = await ProjectSession.create(
    path.join(root, basename),
    'Candidate fixture',
    { placeholdersDir: placeholders, scratchDir: path.join(root, 'scratch') },
    bbox,
  )
  const document = project.document
  const targetBytes = await srgbPng(bbox.width, bbox.height, false)
  const modelBytes = Buffer.from('exact model bytes for staging fixture')
  const checkpointPath = path.join(root, 'checkpoint.safetensors')
  await writeFile(checkpointPath, modelBytes)
  return {
    outputBytes: await srgbPng(bbox.width, bbox.height, true),
    prepared: {
      context: {
        bbox,
        documentId: document.documentId,
        documentRevision: document.documentRevision,
        kind: 'normal-txt2img-preparation',
        model: {
          managedPath: checkpointPath,
          reference: {
            baseModelFamily: 'illustrious',
            civitaiFileId: 22,
            civitaiModelId: 20,
            civitaiVersionId: 21,
            displayName: 'Fixture checkpoint',
            fileSha256: sha256(modelBytes),
            kind: 'checkpoint',
            localModelId: randomUUID(),
            localVersionId: randomUUID(),
            predictionType: 'epsilon',
            versionName: '1',
          },
        },
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
    },
    projectPath: project.filePath,
  }
}

async function inRequestLease<T>(
  root: string,
  prepared: PreparedNormalTxt2Img,
  use: (request: IllustriousTxt2ImgRequestV1) => Promise<T>,
): Promise<T> {
  return await withIllustriousTxt2ImgRequest({
    modelService: {
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

async function enqueueAndClaim(
  root: string,
  queue: GenerationQueueRepository,
  prepared: PreparedNormalTxt2Img,
  projectPath: string,
  use: (
    request: IllustriousTxt2ImgRequestV1,
    claim: NonNullable<Awaited<ReturnType<GenerationQueueRepository['claimNextPending']>>>,
  ) => Promise<void>,
): Promise<string> {
  return await inRequestLease(root, prepared, async (request) => {
    const item = await queue.enqueueIllustriousTxt2Img({
      prepared,
      projectPath,
      request,
      stagingSessionId: randomUUID(),
    })
    const claim = await queue.claimNextPending()
    assert.equal(claim?.item.id, item.id)
    assert.equal(claim.item.status, 'running')
    await use(request, claim)
    return item.id
  })
}

async function publishOne(
  root: string,
  queue: GenerationQueueRepository,
  staging: GenerationStagingRepository,
  candidate: Awaited<ReturnType<typeof fixture>>,
  actualSeed: number,
): Promise<VerifiedGenerationCandidate> {
  let published: VerifiedGenerationCandidate | null = null
  await enqueueAndClaim(
    root,
    queue,
    candidate.prepared,
    candidate.projectPath,
    async (request, claim) => {
      await writeFile(request.job.output.pngPath, candidate.outputBytes)
      published = await staging.publishIllustriousTxt2Img({
        actualSeed,
        expectedProvisionalRoot: request.job.output.stagingRoot,
        expectedStatusSequence: claim.item.statusSequence,
        provisionalOutputPath: request.job.output.pngPath,
        queueItemId: claim.item.id,
      })
    },
  )
  assert.ok(published)
  return published
}

test('real PNG and frozen job become a durable candidate without changing the .igs', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-staging-valid-'))
  try {
    const database = openAppDatabase(root, migrations)
    const queue = new GenerationQueueRepository(database.db, root)
    const staging = new GenerationStagingRepository(database.db, root)
    assert.deepEqual(await staging.recoverAfterRestart(), { invalidCount: 0, reconciledCount: 0 })
    const { outputBytes, prepared, projectPath } = await fixture(root)
    const beforeProject = await readFile(projectPath)
    let publishedAsset = ''
    const queueItemId = await enqueueAndClaim(
      root,
      queue,
      prepared,
      projectPath,
      async (request, claim) => {
        assert.equal(await staging.readLastActualSeed(claim.item.localProjectKey), null)
        await writeFile(request.job.output.pngPath, outputBytes, { flag: 'wx', mode: 0o600 })
        const published = await staging.publishIllustriousTxt2Img({
          actualSeed: 65_535,
          expectedProvisionalRoot: request.job.output.stagingRoot,
          expectedStatusSequence: claim.item.statusSequence,
          provisionalOutputPath: request.job.output.pngPath,
          queueItemId: claim.item.id,
        })
        publishedAsset = published.assetPath
        assert.equal(published.actualSeed, 65_535)
        assert.equal(published.image.sha256, sha256(outputBytes))
        assert.equal(published.bbox.x, bbox.x)
        assert.equal(published.completionOrder, 1)
        assert.equal(await staging.readLastActualSeed(claim.item.localProjectKey), 65_535)
      },
    )
    assert.deepEqual(await readFile(publishedAsset), outputBytes)
    assert.deepEqual(await readFile(projectPath), beforeProject)
    assert.equal((await readIgsPackage(projectPath)).project.layers.length, 0)
    const completed = await database.db
      .selectFrom('generation_queue_item')
      .select(['status', 'status_sequence'])
      .where('id', '=', queueItemId)
      .executeTakeFirstOrThrow()
    assert.deepEqual(completed, { status: 'completed', status_sequence: 2 })
    await database.close()

    const reopened = openAppDatabase(root, migrations)
    const recovered = new GenerationStagingRepository(reopened.db, root)
    assert.deepEqual(await recovered.recoverAfterRestart(), { invalidCount: 0, reconciledCount: 0 })
    const projectKey = (
      await new GenerationQueueRepository(reopened.db, root).loadVerifiedInput(queueItemId)
    ).item.localProjectKey
    const candidates = await recovered.listVerifiedCandidates(projectKey)
    assert.equal(candidates.length, 1)
    assert.equal(candidates[0].queueItemId, queueItemId)
    assert.equal(
      (
        JSON.parse(candidates[0].frozenPayloadJson) as {
          context: { prompts: { positive: string } }
        }
      ).context.prompts.positive,
      'a frozen blue lantern',
    )
    assert.equal(await recovered.readLastActualSeed(projectKey), 65_535)
    await reopened.db.deleteFrom('generation_queue_item').where('id', '=', queueItemId).execute()
    assert.equal((await recovered.listVerifiedCandidates(projectKey)).length, 1)

    // Even after queue pruning, copying a valid A candidate into B's otherwise well-formed
    // manifest must never show A's pixels or frozen Project context in B's recovery list.
    const otherKey = localProjectRecoveryKey(path.join(root, 'Other.igs'))
    const otherSessionId = randomUUID()
    const otherSessionRoot = path.join(
      root,
      'recovery',
      'generation-staging',
      otherKey,
      otherSessionId,
    )
    await mkdir(path.join(otherSessionRoot, 'assets'), { mode: 0o700, recursive: true })
    await writeFile(path.join(otherSessionRoot, 'assets', `${queueItemId}.png`), outputBytes)
    const originalManifest = JSON.parse(
      await readFile(
        path.join(path.dirname(path.dirname(publishedAsset)), 'manifest.json'),
        'utf8',
      ),
    ) as Record<string, unknown>
    await writeFile(
      path.join(otherSessionRoot, 'manifest.json'),
      JSON.stringify({
        ...originalManifest,
        localProjectKey: otherKey,
        stagingSessionId: otherSessionId,
      }),
    )
    assert.deepEqual(await recovered.listVerifiedCandidates(otherKey), [])
    assert.deepEqual(await recovered.recoverAfterRestart(), {
      invalidCount: 1,
      reconciledCount: 0,
    })
    assert.equal((await recovered.listVerifiedCandidates(projectKey)).length, 1)
    await reopened.close()

    const prunedReopen = openAppDatabase(root, migrations)
    const independent = new GenerationStagingRepository(prunedReopen.db, root)
    assert.deepEqual(await independent.recoverAfterRestart(), {
      invalidCount: 1,
      reconciledCount: 0,
    })
    assert.deepEqual(await independent.listVerifiedCandidates(otherKey), [])
    assert.equal((await independent.listVerifiedCandidates(projectKey)).length, 1)
    const manifestPath = path.join(path.dirname(path.dirname(publishedAsset)), 'manifest.json')
    const manifest = JSON.parse((await readFile(manifestPath)).toString('utf8')) as {
      candidates: { completedAt: string }[]
    }
    manifest.candidates[0].completedAt = '2000-01-01T00:00:00.000Z'
    await writeFile(manifestPath, JSON.stringify(manifest))
    assert.deepEqual(await independent.listVerifiedCandidates(projectKey), [])
    await prunedReopen.close()
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

test('manifest-first crash recovers exact APP_RESTART attempt and seed once', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-staging-crash-'))
  try {
    const first = openAppDatabase(root, migrations)
    const queue = new GenerationQueueRepository(first.db, root)
    const staging = new GenerationStagingRepository(first.db, root, {
      afterManifestPublish: async () => {
        throw new Error('injected crash after manifest fsync')
      },
    })
    await staging.recoverAfterRestart()
    const { outputBytes, prepared, projectPath } = await fixture(root)
    let localProjectKey = ''
    const queueItemId = await enqueueAndClaim(
      root,
      queue,
      prepared,
      projectPath,
      async (request, claim) => {
        localProjectKey = claim.item.localProjectKey
        await writeFile(request.job.output.pngPath, outputBytes)
        await assert.rejects(
          staging.publishIllustriousTxt2Img({
            actualSeed: 9001,
            expectedProvisionalRoot: request.job.output.stagingRoot,
            expectedStatusSequence: claim.item.statusSequence,
            provisionalOutputPath: request.job.output.pngPath,
            queueItemId: claim.item.id,
          }),
          /injected crash after manifest fsync/,
        )
        assert.deepEqual(await staging.listVerifiedCandidates(localProjectKey), [])
        assert.equal(await staging.readLastActualSeed(localProjectKey), null)
      },
    )
    await first.close()
    const second = openAppDatabase(root, migrations)
    const restartedQueue = new GenerationQueueRepository(second.db, root)
    await restartedQueue.recoverAfterRestart()
    const canceled = await second.db
      .selectFrom('generation_queue_item')
      .select(['error_code', 'status', 'status_sequence'])
      .where('id', '=', queueItemId)
      .executeTakeFirstOrThrow()
    assert.deepEqual(canceled, {
      error_code: 'APP_RESTART',
      status: 'canceled',
      status_sequence: 2,
    })
    const restarted = new GenerationStagingRepository(second.db, root)
    assert.deepEqual(await restarted.recoverAfterRestart(), { invalidCount: 0, reconciledCount: 1 })
    assert.equal((await restarted.listVerifiedCandidates(localProjectKey)).length, 1)
    assert.equal(await restarted.readLastActualSeed(localProjectKey), 9001)
    assert.deepEqual(await restarted.recoverAfterRestart(), { invalidCount: 0, reconciledCount: 0 })
    assert.equal(await restarted.readLastActualSeed(localProjectKey), 9001)
    const receipt = await second.db
      .selectFrom('generation_candidate_receipt')
      .select(['completion_order', 'status'])
      .where('queue_item_id', '=', queueItemId)
      .executeTakeFirstOrThrow()
    assert.deepEqual(receipt, { completion_order: 1, status: 'completed' })
    await second.close()
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

test('SQLite completion abort leaves a recoverable manifest and no premature cursor', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-staging-sql-failure-'))
  try {
    const first = openAppDatabase(root, migrations)
    const queue = new GenerationQueueRepository(first.db, root)
    const staging = new GenerationStagingRepository(first.db, root)
    await staging.recoverAfterRestart()
    const { outputBytes, prepared, projectPath } = await fixture(root)
    let projectKey = ''
    const queueItemId = await enqueueAndClaim(
      root,
      queue,
      prepared,
      projectPath,
      async (request, claim) => {
        projectKey = claim.item.localProjectKey
        await sql`
          CREATE TRIGGER fail_candidate_completion
          BEFORE UPDATE OF status ON generation_queue_item
          WHEN NEW.status = 'completed'
          BEGIN SELECT RAISE(ABORT, 'injected completion SQL failure'); END
        `.execute(first.db)
        await writeFile(request.job.output.pngPath, outputBytes)
        await assert.rejects(
          staging.publishIllustriousTxt2Img({
            actualSeed: 8080,
            expectedProvisionalRoot: request.job.output.stagingRoot,
            expectedStatusSequence: claim.item.statusSequence,
            provisionalOutputPath: request.job.output.pngPath,
            queueItemId: claim.item.id,
          }),
          /injected completion SQL failure/,
        )
        const row = await first.db
          .selectFrom('generation_queue_item')
          .select(['status', 'status_sequence'])
          .where('id', '=', claim.item.id)
          .executeTakeFirstOrThrow()
        assert.deepEqual(row, { status: 'running', status_sequence: 1 })
        assert.equal(await staging.readLastActualSeed(projectKey), null)
        assert.deepEqual(await staging.listVerifiedCandidates(projectKey), [])
        await sql`DROP TRIGGER fail_candidate_completion`.execute(first.db)
      },
    )
    await first.close()
    const second = openAppDatabase(root, migrations)
    await new GenerationQueueRepository(second.db, root).recoverAfterRestart()
    const recovered = new GenerationStagingRepository(second.db, root)
    assert.deepEqual(await recovered.recoverAfterRestart(), { invalidCount: 0, reconciledCount: 1 })
    assert.equal(await recovered.readLastActualSeed(projectKey), 8080)
    assert.equal((await recovered.listVerifiedCandidates(projectKey))[0].queueItemId, queueItemId)
    await second.close()
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

test('explicit cancellation and stale restart sequence never expose a published manifest', async () => {
  for (const change of ['user-cancel', 'stale-restart-sequence'] as const) {
    const root = await mkdtemp(path.join(os.tmpdir(), 'igs-staging-canceled-'))
    try {
      const first = openAppDatabase(root, migrations)
      const queue = new GenerationQueueRepository(first.db, root)
      const staging = new GenerationStagingRepository(first.db, root, {
        afterManifestPublish: async () => {
          throw new Error('stop before SQLite completion')
        },
      })
      await staging.recoverAfterRestart()
      const { outputBytes, prepared, projectPath } = await fixture(root)
      let localProjectKey = ''
      const queueItemId = await enqueueAndClaim(
        root,
        queue,
        prepared,
        projectPath,
        async (request, claim) => {
          localProjectKey = claim.item.localProjectKey
          await writeFile(request.job.output.pngPath, outputBytes)
          await assert.rejects(
            staging.publishIllustriousTxt2Img({
              actualSeed: 17,
              expectedProvisionalRoot: request.job.output.stagingRoot,
              expectedStatusSequence: claim.item.statusSequence,
              provisionalOutputPath: request.job.output.pngPath,
              queueItemId: claim.item.id,
            }),
            /stop before SQLite completion/,
          )
          if (change === 'user-cancel') {
            await queue.cancel(claim.item.id, claim.item.statusSequence)
          }
        },
      )
      await first.close()
      const second = openAppDatabase(root, migrations)
      await new GenerationQueueRepository(second.db, root).recoverAfterRestart()
      if (change === 'stale-restart-sequence') {
        await second.db
          .updateTable('generation_queue_item')
          .set({ status_sequence: 3 })
          .where('id', '=', queueItemId)
          .execute()
      }
      const recovered = new GenerationStagingRepository(second.db, root)
      assert.deepEqual(await recovered.recoverAfterRestart(), {
        invalidCount: 1,
        reconciledCount: 0,
      })
      assert.deepEqual(await recovered.listVerifiedCandidates(localProjectKey), [])
      assert.equal(await recovered.readLastActualSeed(localProjectKey), null)
      await second.close()
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  }
})

test('cancel-requested running job cannot publish with the newer queue sequence', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-staging-cancel-request-'))
  try {
    const database = openAppDatabase(root, migrations)
    const queue = new GenerationQueueRepository(database.db, root)
    const staging = new GenerationStagingRepository(database.db, root)
    await staging.recoverAfterRestart()
    const { outputBytes, prepared, projectPath } = await fixture(root)
    await enqueueAndClaim(root, queue, prepared, projectPath, async (request, claim) => {
      const canceled = await queue.cancel(claim.item.id, claim.item.statusSequence)
      assert.equal(canceled.status, 'running')
      assert.equal(canceled.cancelRequested, true)
      assert.equal(canceled.statusSequence, claim.item.statusSequence + 1)
      await writeFile(request.job.output.pngPath, outputBytes)
      await assert.rejects(
        staging.publishIllustriousTxt2Img({
          actualSeed: 99,
          expectedProvisionalRoot: request.job.output.stagingRoot,
          expectedStatusSequence: canceled.statusSequence,
          provisionalOutputPath: request.job.output.pngPath,
          queueItemId: claim.item.id,
        }),
        { code: 'STAGING_STATUS_CONFLICT' },
      )
      assert.equal(await staging.readLastActualSeed(claim.item.localProjectKey), null)
    })
    const receipts = await database.db
      .selectFrom('generation_candidate_receipt')
      .select(({ fn }) => fn.countAll<number>().as('count'))
      .executeTakeFirstOrThrow()
    assert.equal(receipts.count, 0)
    await database.close()
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

test('corrupt, unsupported or symlinked output is excluded without moving the seed cursor', async () => {
  for (const mode of [
    'corrupt',
    'invalid-filter',
    'depth-16-rgb',
    'depth-16-rgba',
    'symlink',
  ] as const) {
    const root = await mkdtemp(path.join(os.tmpdir(), 'igs-staging-bad-'))
    try {
      const database = openAppDatabase(root, migrations)
      const queue = new GenerationQueueRepository(database.db, root)
      const staging = new GenerationStagingRepository(database.db, root)
      await staging.recoverAfterRestart()
      const { outputBytes, prepared, projectPath } = await fixture(root)
      await enqueueAndClaim(root, queue, prepared, projectPath, async (request, claim) => {
        switch (mode) {
          case 'corrupt': {
            await writeFile(request.job.output.pngPath, Buffer.from('not a PNG'))
            break
          }
          case 'depth-16-rgb':
          case 'depth-16-rgba': {
            const sixteenBit = await srgbPng(
              bbox.width,
              bbox.height,
              true,
              false,
              16,
              mode === 'depth-16-rgb' ? 3 : 4,
            )
            await validateSrgbPngStream(
              (async function* () {
                yield sixteenBit
              })(),
              'result.png',
              32 * 1024 * 1024,
              bbox.width,
            )
            await writeFile(request.job.output.pngPath, sixteenBit)
            break
          }
          case 'invalid-filter': {
            await writeFile(
              request.job.output.pngPath,
              await srgbPng(bbox.width, bbox.height, true, true),
            )
            break
          }
          case 'symlink': {
            const outside = path.join(root, 'outside.png')
            await writeFile(outside, outputBytes)
            await symlink(outside, request.job.output.pngPath)
            break
          }
        }
        await assert.rejects(
          staging.publishIllustriousTxt2Img({
            actualSeed: 45,
            expectedProvisionalRoot: request.job.output.stagingRoot,
            expectedStatusSequence: claim.item.statusSequence,
            provisionalOutputPath: request.job.output.pngPath,
            queueItemId: claim.item.id,
          }),
          { code: 'STAGING_OUTPUT_INVALID' },
        )
        assert.equal(await staging.readLastActualSeed(claim.item.localProjectKey), null)
      })
      const count = await database.db
        .selectFrom('generation_candidate_receipt')
        .select(({ fn }) => fn.countAll<number>().as('count'))
        .executeTakeFirstOrThrow()
      assert.equal(count.count, 0)
      await database.close()
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  }
})

test('a completed candidate with damaged asset disappears on reopen without .igs mutation', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-staging-asset-'))
  try {
    const first = openAppDatabase(root, migrations)
    const queue = new GenerationQueueRepository(first.db, root)
    const staging = new GenerationStagingRepository(first.db, root)
    await staging.recoverAfterRestart()
    const { outputBytes, prepared, projectPath } = await fixture(root)
    const originalProject = await readFile(projectPath)
    let assetPath = ''
    let projectKey = ''
    await enqueueAndClaim(root, queue, prepared, projectPath, async (request, claim) => {
      projectKey = claim.item.localProjectKey
      await writeFile(request.job.output.pngPath, outputBytes)
      const published = await staging.publishIllustriousTxt2Img({
        actualSeed: 123,
        expectedProvisionalRoot: request.job.output.stagingRoot,
        expectedStatusSequence: claim.item.statusSequence,
        provisionalOutputPath: request.job.output.pngPath,
        queueItemId: claim.item.id,
      })
      assetPath = published.assetPath
    })
    const unchangedSize = (await stat(assetPath)).size
    await writeFile(assetPath, Buffer.alloc(unchangedSize))
    await first.close()
    const second = openAppDatabase(root, migrations)
    const recovered = new GenerationStagingRepository(second.db, root)
    assert.deepEqual(await recovered.recoverAfterRestart(), { invalidCount: 1, reconciledCount: 0 })
    assert.deepEqual(await recovered.listVerifiedCandidates(projectKey), [])
    assert.deepEqual(await readFile(projectPath), originalProject)
    await second.close()
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

test('Project discard hides only its old sessions and preserves actual seed after reopen', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-staging-project-discard-'))
  try {
    const first = openAppDatabase(root, migrations)
    const queue = new GenerationQueueRepository(first.db, root)
    const staging = new GenerationStagingRepository(first.db, root)
    await queue.recoverAfterRestart()
    await staging.recoverAfterRestart()
    const projectA = await fixture(root)
    const projectB = await fixture(root, 'Other.igs')
    const savedA = await readFile(projectA.projectPath)
    const savedB = await readFile(projectB.projectPath)
    const completedA = await publishOne(root, queue, staging, projectA, 111)
    const completedB = await publishOne(root, queue, staging, projectB, 222)
    const pendingA = await inRequestLease(
      root,
      projectA.prepared,
      async (request) =>
        await queue.enqueueIllustriousTxt2Img({
          prepared: projectA.prepared,
          projectPath: projectA.projectPath,
          request,
          stagingSessionId: randomUUID(),
        }),
    )
    const pendingB = await inRequestLease(
      root,
      projectB.prepared,
      async (request) =>
        await queue.enqueueIllustriousTxt2Img({
          prepared: projectB.prepared,
          projectPath: projectB.projectPath,
          request,
          stagingSessionId: randomUUID(),
        }),
    )
    await queue.cancel(pendingA.id)
    assert.equal((await queue.listUnfinishedByProject(completedB.localProjectKey)).length, 1)
    assert.equal((await staging.listVerifiedCandidates(completedA.localProjectKey)).length, 1)
    const discarded = await staging.discardProject(completedA.localProjectKey)
    assert.deepEqual(discarded, { cleanupDeferred: false, discardedSessionCount: 2 })
    assert.deepEqual(await staging.listVerifiedCandidates(completedA.localProjectKey), [])
    assert.equal((await staging.listVerifiedCandidates(completedB.localProjectKey)).length, 1)
    assert.equal(await staging.readLastActualSeed(completedA.localProjectKey), 111)
    assert.equal(
      (
        await first.db
          .selectFrom('generation_queue_item')
          .select('status')
          .where('id', '=', pendingB.id)
          .executeTakeFirstOrThrow()
      ).status,
      'pending',
    )
    assert.deepEqual(await readFile(projectA.projectPath), savedA)
    assert.deepEqual(await readFile(projectB.projectPath), savedB)
    assert.equal((await stat(completedB.assetPath)).size, projectB.outputBytes.length)
    await first.close()

    const second = openAppDatabase(root, migrations)
    const restartedQueue = new GenerationQueueRepository(second.db, root)
    await restartedQueue.recoverAfterRestart()
    const restarted = new GenerationStagingRepository(second.db, root)
    assert.deepEqual(await restarted.recoverAfterRestart(), { invalidCount: 0, reconciledCount: 0 })
    assert.deepEqual(await restarted.listVerifiedCandidates(completedA.localProjectKey), [])
    assert.equal((await restarted.listVerifiedCandidates(completedB.localProjectKey)).length, 1)
    assert.equal(await restarted.readLastActualSeed(completedA.localProjectKey), 111)

    // A fresh session for the same local Project is valid after reopen. An old discarded session
    // stays forbidden even if a future queue caller accidentally reuses its UUID.
    await inRequestLease(root, projectA.prepared, async (request) => {
      const reused = await restartedQueue.enqueueIllustriousTxt2Img({
        prepared: projectA.prepared,
        projectPath: projectA.projectPath,
        request,
        stagingSessionId: completedA.stagingSessionId,
      })
      const claim = await restartedQueue.claimNextPending()
      assert.equal(claim?.item.id, reused.id)
      await writeFile(request.job.output.pngPath, projectA.outputBytes)
      await assert.rejects(
        restarted.publishIllustriousTxt2Img({
          actualSeed: 333,
          expectedProvisionalRoot: request.job.output.stagingRoot,
          expectedStatusSequence: claim.item.statusSequence,
          provisionalOutputPath: request.job.output.pngPath,
          queueItemId: reused.id,
        }),
        { code: 'STAGING_STATUS_CONFLICT' },
      )
      const cancelRequested = await restartedQueue.cancel(reused.id)
      await restartedQueue.acknowledgeCanceledRunning(reused.id, cancelRequested.statusSequence)
    })
    await publishOne(root, restartedQueue, restarted, projectA, 444)
    assert.equal((await restarted.listVerifiedCandidates(completedA.localProjectKey)).length, 1)
    assert.equal(await restarted.readLastActualSeed(completedA.localProjectKey), 444)
    await second.close()
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

test('targeted acceptance tombstones only captured sessions and preserves newer candidates', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-staging-targeted-discard-'))
  try {
    const firstDatabase = openAppDatabase(root, migrations)
    const queue = new GenerationQueueRepository(firstDatabase.db, root)
    const staging = new GenerationStagingRepository(firstDatabase.db, root)
    await queue.recoverAfterRestart()
    await staging.recoverAfterRestart()
    const project = await fixture(root)
    const accepted = await publishOne(root, queue, staging, project, 101)
    const unselected = await publishOne(root, queue, staging, project, 102)
    const before = await readFile(project.projectPath)
    assert.notEqual(accepted.stagingSessionId, unselected.stagingSessionId)
    assert.deepEqual(
      await staging.discardSessions(accepted.localProjectKey, [accepted.stagingSessionId]),
      { cleanupDeferred: false, discardedSessionCount: 1 },
    )
    assert.deepEqual(
      (await staging.listVerifiedCandidates(accepted.localProjectKey)).map(
        (item) => item.candidateId,
      ),
      [unselected.candidateId],
    )
    const later = await publishOne(root, queue, staging, project, 103)
    assert.deepEqual(
      await staging.discardSessions(accepted.localProjectKey, [accepted.stagingSessionId]),
      { cleanupDeferred: false, discardedSessionCount: 1 },
    )
    assert.deepEqual(
      (await staging.listVerifiedCandidates(accepted.localProjectKey)).map(
        (item) => item.candidateId,
      ),
      [unselected.candidateId, later.candidateId],
    )
    assert.deepEqual(await readFile(project.projectPath), before)
    await firstDatabase.close()

    const reopenedDatabase = openAppDatabase(root, migrations)
    const recovered = new GenerationStagingRepository(reopenedDatabase.db, root)
    assert.deepEqual(await recovered.recoverAfterRestart(), { invalidCount: 0, reconciledCount: 0 })
    assert.deepEqual(
      (await recovered.listVerifiedCandidates(accepted.localProjectKey)).map(
        (item) => item.candidateId,
      ),
      [unselected.candidateId, later.candidateId],
    )
    await reopenedDatabase.close()
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

test('interrupted Add recovers its exact Raster from real shadow and SQLite staging', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-staging-add-restart-'))
  try {
    const first = openAppDatabase(root, migrations)
    const queue = new GenerationQueueRepository(first.db, root)
    const staging = new GenerationStagingRepository(first.db, root)
    await queue.recoverAfterRestart()
    await staging.recoverAfterRestart()
    const project = await fixture(root)
    const published = await publishOne(root, queue, staging, project, 42)
    const savedBefore = await readFile(project.projectPath)
    const roots = { placeholdersDir: placeholders, scratchDir: path.join(root, 'scratch') }
    const shadow = new ProjectShadowStore(path.join(root, 'shadow'))
    let owner = await ProjectAutosaveCoordinator.attach(
      await ProjectSession.open(project.projectPath, roots),
      roots,
      shadow,
      { debounceMs: 60_000 },
    )
    let fenced = false
    const orchestrator = {
      fenceProjectGeneration: async () => {
        fenced = true
      },
      releaseProjectGenerationFence: () => {
        fenced = false
      },
    }
    const key = published.localProjectKey
    const interrupted = new ProjectGenerationAcceptance({
      afterDurableShadow: async () => {
        throw new Error('interrupted after synced shadow')
      },
      documents: { getOpenDocument: (id) => (id === key ? owner : null) },
      gate: new ProjectGenerationOperationGate(),
      orchestrator,
      queue: { listUnfinishedByProject: (id) => queue.listUnfinishedByProject(id) },
      staging,
    })
    await assert.rejects(
      interrupted.accept(key, [published.candidateId], null, [published.candidateId]),
      /interrupted after synced shadow/,
    )
    assert.equal(fenced, true)
    assert.deepEqual(await readFile(project.projectPath), savedBefore)
    assert.equal(
      (await ProjectAutosaveCoordinator.inspectRecovery(project.projectPath, shadow)).status,
      'recoverable',
    )
    assert.deepEqual(
      (await staging.listVerifiedCandidates(key)).map((item) => item.candidateId),
      [published.candidateId],
    )
    await first.close()

    const second = openAppDatabase(root, migrations)
    const restartedQueue = new GenerationQueueRepository(second.db, root)
    await restartedQueue.recoverAfterRestart()
    const restartedStaging = new GenerationStagingRepository(second.db, root)
    await restartedStaging.recoverAfterRestart()
    owner = await ProjectAutosaveCoordinator.recover(project.projectPath, roots, shadow, {
      debounceMs: 60_000,
      leaseRegistry: new ProjectAutosaveLeaseRegistry(),
    })
    const recovered = new ProjectGenerationAcceptance({
      documents: { getOpenDocument: (id) => (id === key ? owner : null) },
      gate: new ProjectGenerationOperationGate(),
      orchestrator,
      queue: { listUnfinishedByProject: (id) => restartedQueue.listUnfinishedByProject(id) },
      staging: restartedStaging,
    })
    assert.equal(await recovered.reconcile(key), 'cleaned')
    assert.equal(fenced, false)
    assert.deepEqual(await restartedStaging.listVerifiedCandidates(key), [])
    assert.equal(owner.document.layers.length, 1)
    assert.equal(
      owner.document.layers[0]?.generationProvenance?.executionResultContext.candidateId,
      published.candidateId,
    )
    assert.equal((await owner.save()).committed, true)
    assert.equal((await readIgsPackage(project.projectPath)).project.layers.length, 1)
    await second.close()
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

test('tombstone committed before cleanup blocks recovery after an interrupted discard', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-staging-discard-crash-'))
  try {
    const first = openAppDatabase(root, migrations)
    const queue = new GenerationQueueRepository(first.db, root)
    const staging = new GenerationStagingRepository(first.db, root, {
      afterDiscardTombstone: async () => {
        throw new Error('injected crash before candidate cleanup')
      },
    })
    await queue.recoverAfterRestart()
    await staging.recoverAfterRestart()
    const candidate = await fixture(root)
    const published = await publishOne(root, queue, staging, candidate, 901)
    await assert.rejects(
      staging.discardProject(published.localProjectKey),
      /injected crash before candidate cleanup/,
    )
    assert.equal((await stat(published.assetPath)).size, candidate.outputBytes.length)
    const tombstone = await first.db
      .selectFrom('generation_staging_discarded_session')
      .select('staging_session_id')
      .where('local_project_key', '=', published.localProjectKey)
      .executeTakeFirstOrThrow()
    assert.equal(tombstone.staging_session_id, published.stagingSessionId)
    assert.deepEqual(await staging.listVerifiedCandidates(published.localProjectKey), [])
    await first.close()

    const second = openAppDatabase(root, migrations)
    await new GenerationQueueRepository(second.db, root).recoverAfterRestart()
    const recovered = new GenerationStagingRepository(second.db, root)
    assert.deepEqual(await recovered.recoverAfterRestart(), { invalidCount: 0, reconciledCount: 0 })
    assert.deepEqual(await recovered.listVerifiedCandidates(published.localProjectKey), [])
    assert.equal(await recovered.readLastActualSeed(published.localProjectKey), 901)
    await assert.rejects(stat(published.assetPath), { code: 'ENOENT' })
    await second.close()
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

test('failed candidate cleanup stays hidden and is retried on restart', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-staging-discard-deferred-'))
  try {
    const first = openAppDatabase(root, migrations)
    const queue = new GenerationQueueRepository(first.db, root)
    const staging = new GenerationStagingRepository(first.db, root, {
      beforeSessionCleanup: async () => {
        throw new Error('injected file deletion failure')
      },
    })
    await queue.recoverAfterRestart()
    await staging.recoverAfterRestart()
    const candidate = await fixture(root)
    const published = await publishOne(root, queue, staging, candidate, 707)
    const result = await staging.discardProject(published.localProjectKey)
    assert.deepEqual(result, { cleanupDeferred: true, discardedSessionCount: 1 })
    assert.equal((await stat(published.assetPath)).size, candidate.outputBytes.length)
    assert.deepEqual(await staging.listVerifiedCandidates(published.localProjectKey), [])
    await first.close()

    const second = openAppDatabase(root, migrations)
    await new GenerationQueueRepository(second.db, root).recoverAfterRestart()
    const restarted = new GenerationStagingRepository(second.db, root)
    assert.deepEqual(await restarted.recoverAfterRestart(), { invalidCount: 0, reconciledCount: 0 })
    assert.deepEqual(await restarted.listVerifiedCandidates(published.localProjectKey), [])
    await assert.rejects(stat(published.assetPath), { code: 'ENOENT' })
    assert.equal(await restarted.readLastActualSeed(published.localProjectKey), 707)
    await second.close()
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

test('verified image bytes are copied under staging serialization and a discarded session cannot serve them', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-staging-result-read-'))
  let allowDiscard!: () => void
  let discardStarted!: () => void
  const discardPaused = new Promise<void>((resolve) => {
    discardStarted = resolve
  })
  const resumeDiscard = new Promise<void>((resolve) => {
    allowDiscard = resolve
  })
  try {
    const database = openAppDatabase(root, migrations)
    const queue = new GenerationQueueRepository(database.db, root)
    const staging = new GenerationStagingRepository(database.db, root, {
      afterDiscardTombstone: async () => {
        discardStarted()
        await resumeDiscard
      },
      beforeSessionCleanup: async () => {
        throw new Error('retain the bytes after a durable tombstone')
      },
    })
    await queue.recoverAfterRestart()
    await staging.recoverAfterRestart()
    const candidate = await fixture(root)
    const published = await publishOne(root, queue, staging, candidate, 42)
    const identity = {
      candidateId: published.candidateId,
      imageSha256: published.image.sha256,
      localProjectKey: published.localProjectKey,
      stagingSessionId: published.stagingSessionId,
    }
    assert.deepEqual(await staging.readVerifiedCandidatePng(identity), candidate.outputBytes)
    const resource = new ProjectGenerationResultResource(staging, (projectKey) =>
      projectKey === published.localProjectKey ? published.documentId : null,
    )
    const snapshot = await resource.list(published.localProjectKey)
    assert.equal(snapshot.candidates.length, 1)
    const imageUrl = snapshot.candidates[0].imageUrl
    assert.deepEqual(await resource.readImage(imageUrl), candidate.outputBytes)
    assert.equal(
      await staging.readVerifiedCandidatePng({ ...identity, imageSha256: 'f'.repeat(64) }),
      null,
    )
    assert.equal(
      await staging.readVerifiedCandidatePng({ ...identity, stagingSessionId: randomUUID() }),
      null,
    )

    const discarding = staging.discardProject(published.localProjectKey)
    await discardPaused
    const overlappingRead = staging.readVerifiedCandidatePng(identity)
    allowDiscard()
    assert.deepEqual(await discarding, { cleanupDeferred: true, discardedSessionCount: 1 })
    assert.equal(await overlappingRead, null)
    assert.equal((await stat(published.assetPath)).size, candidate.outputBytes.length)
    assert.equal(await staging.readVerifiedCandidatePng(identity), null)
    assert.equal(await resource.readImage(imageUrl), null)
    await database.close()
  } finally {
    allowDiscard()
    await rm(root, { force: true, recursive: true })
  }
})
