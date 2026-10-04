import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import { GENERATION_THUMBNAIL_MAX_BYTES } from '../../shared/projects/generation-thumbnail.js'
import { IGS_GENERATION_PNG_MAX_BYTES } from '../../shared/projects/project-schema.js'

import { sql } from 'kysely'
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { crc32, deflateSync } from 'node:zlib'

import type { IllustriousTxt2ImgRequestV1 } from './illustrious-txt2img-job.js'
import type { PreparedNormalTxt2Img } from './project-generation-preparation.js'

import { openAppDatabase } from '../db/database.js'
import { GenerationAcceptanceJournalRepository } from './generation-acceptance-journal.js'
import { GenerationQueueRepository } from './generation-queue.js'
import { GENERATION_STAGING_LIMITS } from './generation-staging-limits.js'
import {
  GenerationStagingRepository,
  parseFrozenGenerationCandidatePayloadV1,
  type VerifiedGenerationCandidate,
} from './generation-staging.js'
import { readIgsPackage, validateSrgbPngStream } from './igs-package.js'
import { workerEmbeddings } from './illustrious-generation-embeddings.js'
import { withIllustriousTxt2ImgRequest } from './illustrious-txt2img-job.js'
import { ProjectAutosaveCoordinator, ProjectAutosaveLeaseRegistry } from './project-autosave.js'
import { ProjectCandidateImageExporter } from './project-candidate-image-export.js'
import { ProjectGenerationAcceptance } from './project-generation-acceptance.js'
import { ProjectGenerationOperationGate } from './project-generation-operation-gate.js'
import {
  parseGenerationResultThumbnailUrl,
  ProjectGenerationResultResource,
} from './project-generation-result-resource.js'
import { localProjectRecoveryKey } from './project-identity.js'
import { ProjectSession } from './project-session.js'
import { ProjectShadowStore } from './project-shadow.js'
import { capturedEmbeddingFieldsFixture } from './test-fixtures/generation-embeddings.js'

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
  color: readonly [number, number, number] = [37, 94, 181],
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
          scanlines[offset] = color[0]
          scanlines[offset + 1] = color[1]
          scanlines[offset + 2] = color[2]
          if (channels === 4) {
            scanlines[offset + 3] = 255
          }
        } else {
          scanlines.writeUInt16BE(color[0] * 257, offset)
          scanlines.writeUInt16BE(color[1] * 257, offset + 2)
          scanlines.writeUInt16BE(color[2] * 257, offset + 4)
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
  dimensions = bbox,
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
    dimensions,
  )
  const document = project.document
  const targetBytes = await srgbPng(dimensions.width, dimensions.height, false)
  const modelBytes = Buffer.from('exact model bytes for staging fixture')
  const checkpointPath = path.join(root, 'checkpoint.safetensors')
  await writeFile(checkpointPath, modelBytes)
  return {
    outputBytes: await srgbPng(dimensions.width, dimensions.height, true),
    prepared: {
      context: {
        bbox: dimensions,
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
          height: dimensions.height,
          iccSha256: IGS_SRGB_ICC_SHA256,
          sha256: sha256(targetBytes),
          width: dimensions.width,
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
  workerReady = ready,
): Promise<T> {
  return await withIllustriousTxt2ImgRequest({
    modelService: {
      assertNoUnboundGenerationEmbeddings: async () => {},
      resolveVerifiedGenerationCheckpointForPlan: async (reference) => ({
        managedPath: prepared.context.model.managedPath,
        reference,
      }),
      resolveVerifiedGenerationEmbeddingForPlan: async (reference) => {
        const entry = [
          ...(prepared.context.embeddings?.positive ?? []),
          ...(prepared.context.embeddings?.negative ?? []),
        ].find((embedding) => embedding.reference.localVersionId === reference.localVersionId)
        assert.ok(entry, 'request verifier must receive an active frozen identity')
        return { byteSize: entry.byteSize, managedPath: entry.managedPath, reference }
      },
      resolveVerifiedGenerationLoraForPlan: async () => {
        throw new Error('This fixture has no active LoRAs.')
      },
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
  thumbnailBytes?: Buffer,
  transformThumbnail?: (thumbnail: Record<string, unknown>) => unknown,
): Promise<VerifiedGenerationCandidate> {
  let published: VerifiedGenerationCandidate | null = null
  await enqueueAndClaim(
    root,
    queue,
    candidate.prepared,
    candidate.projectPath,
    async (request, claim) => {
      await writeFile(request.job.output.pngPath, candidate.outputBytes)
      const thumbnail = thumbnailBytes
        ? {
            byteSize: thumbnailBytes.length,
            height: 128,
            outputPath: `${request.job.output.pngPath}.thumb.webp`,
            sha256: sha256(thumbnailBytes),
            width: 256,
          }
        : undefined
      if (thumbnailBytes) {
        await writeFile(`${request.job.output.pngPath}.thumb.webp`, thumbnailBytes, { mode: 0o600 })
      }
      published = await staging.publishIllustriousTxt2Img({
        actualSeed,
        expectedProvisionalRoot: request.job.output.stagingRoot,
        expectedStatusSequence: claim.item.statusSequence,
        provisionalOutputPath: request.job.output.pngPath,
        queueItemId: claim.item.id,
        thumbnail: thumbnail && transformThumbnail ? transformThumbnail(thumbnail) : thumbnail,
      })
    },
  )
  assert.ok(published)
  return published
}

test('real staging publication and recovered payload preserve concrete embedding refs and refuse crossed operational wire', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-embedding-staging-'))
  const database = openAppDatabase(root, migrations)
  try {
    const queue = new GenerationQueueRepository(database.db, root)
    const staging = new GenerationStagingRepository(database.db, root)
    await queue.recoverAfterRestart()
    await staging.recoverAfterRestart()
    const source = await fixture(root)
    const captured = capturedEmbeddingFieldsFixture(root)
    Object.assign(source.prepared.context, captured)
    const embeddingReady = {
      ...ready,
      capabilities: [
        'illustrious-txt2img',
        'denoising-progress',
        'candidate-thumbnails',
        'illustrious-cfg-rescale',
        'illustrious-img2img',
        'illustrious-lora',
        'illustrious-vae-precision',
        'illustrious-external-vae',
        'illustrious-embeddings',
      ],
      workerVersion: '0.10.0',
    }
    await inRequestLease(
      root,
      source.prepared,
      async (request) => {
        const item = await queue.enqueueIllustriousTxt2Img({
          prepared: source.prepared,
          projectPath: source.projectPath,
          request,
          stagingSessionId: randomUUID(),
        })
        const claim = await queue.claimNextPending()
        assert.equal(claim!.item.id, item.id)
        await writeFile(request.job.output.pngPath, source.outputBytes)
        await staging.publishIllustriousTxt2Img({
          actualSeed: 42,
          expectedProvisionalRoot: request.job.output.stagingRoot,
          expectedStatusSequence: claim!.item.statusSequence,
          provisionalOutputPath: request.job.output.pngPath,
          queueItemId: item.id,
        })
      },
      embeddingReady,
    )
    const [published] = await staging.listVerifiedCandidates(
      localProjectRecoveryKey(source.projectPath),
    )
    const payload = parseFrozenGenerationCandidatePayloadV1(published.frozenPayloadJson)
    assert.deepEqual(payload.context.embeddingRefs, captured.embeddingRefs)
    assert.deepEqual(payload.context.embeddings, captured.embeddings)
    assert.deepEqual(payload.workerJob.embeddings, workerEmbeddings(captured))
    assert.deepEqual(await readFile(published.assetPath), source.outputBytes)
    const recovered = new GenerationStagingRepository(database.db, root)
    await recovered.recoverAfterRestart()
    assert.deepEqual(
      (await recovered.listVerifiedCandidates(published.localProjectKey))[0],
      published,
    )
    for (const change of [
      (value: typeof payload) => {
        value.workerJob.embeddings!.positive[0].token = '<worker-alias>'
      },
      (value: typeof payload) => {
        value.workerJob.embeddings!.positive[0].byteSize += 1
      },
      (value: typeof payload) => {
        value.workerJob.embeddings!.positive[0].sha256 = 'd'.repeat(64)
      },
      (value: typeof payload) => {
        value.context.embeddingRefs!.negative = []
      },
      (value: typeof payload) => {
        value.context.embeddings!.positive = []
      },
      (value: typeof payload) => {
        delete value.context.embeddings
      },
    ]) {
      const crossed = structuredClone(payload)
      change(crossed)
      assert.throws(() => parseFrozenGenerationCandidatePayloadV1(JSON.stringify(crossed)), {
        code: 'STAGING_INPUT_INVALID',
      })
    }
  } finally {
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
})

async function batchCapacityFixture(root: string, escapedMetadata = false) {
  const database = openAppDatabase(root, migrations)
  const queue = new GenerationQueueRepository(database.db, root)
  const staging = new GenerationStagingRepository(database.db, root)
  await queue.recoverAfterRestart()
  await staging.recoverAfterRestart()
  const source = await fixture(root)
  if (escapedMetadata) {
    source.prepared.context.model.reference.displayName = '\\'.repeat(60_000)
  }
  // Derive the exact frozen bytes from the real queue serializer, then remove this fixture's
  // terminal source attempt. Capacity checks never insert the planned batch rows themselves.
  const frozenPayloadJson = await inRequestLease(root, source.prepared, async (request) => {
    const item = await queue.enqueueIllustriousTxt2Img({
      prepared: source.prepared,
      projectPath: source.projectPath,
      request,
      stagingSessionId: randomUUID(),
    })
    await queue.loadVerifiedInput(item.id)
    const row = await database.db
      .selectFrom('generation_queue_item')
      .selectAll()
      .where('id', '=', item.id)
      .executeTakeFirstOrThrow()
    await queue.cancel(item.id)
    assert.equal(await queue.pruneTerminal(['canceled']), 1)
    return row.frozen_payload_json
  })
  return { database, frozenPayloadJson, queue, source, staging }
}

function batchCapacityInput(projectPath: string, frozenPayloadJson: string, count = 1) {
  return {
    entries: Array.from({ length: count }, () => ({
      frozenPayloadJson,
      queueItemId: randomUUID(),
    })),
    localProjectKey: localProjectRecoveryKey(projectPath),
    projectPath,
    stagingSessionId: randomUUID(),
  }
}

async function batchCapacityState(
  database: ReturnType<typeof openAppDatabase>,
  root: string,
  projectPath: string,
) {
  return {
    candidates: await database.db.selectFrom('generation_candidate_receipt').selectAll().execute(),
    cursor: await database.db.selectFrom('generation_seed_cursor').selectAll().execute(),
    paths: (
      await readdir(path.join(root, 'recovery', 'generation-staging'), { recursive: true })
    ).sort(),
    project: await readFile(projectPath),
    queue: await database.db.selectFrom('generation_queue_item').selectAll().execute(),
    tombstones: await database.db
      .selectFrom('generation_staging_discarded_session')
      .selectAll()
      .execute(),
  }
}

test('batch capacity allows 64 real small payloads and rejects escaped aggregate overflow without publishing', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-staging-capacity-'))
  const data = await batchCapacityFixture(root)
  try {
    const before = await batchCapacityState(data.database, root, data.source.projectPath)
    await data.staging.preflightBatchCapacity(
      batchCapacityInput(
        data.source.projectPath,
        data.frozenPayloadJson,
        GENERATION_STAGING_LIMITS.candidates,
      ),
    )
    assert.deepEqual(await batchCapacityState(data.database, root, data.source.projectPath), before)
    const escapedRoot = await mkdtemp(path.join(os.tmpdir(), 'igs-staging-capacity-escaped-'))
    const escaped = await batchCapacityFixture(escapedRoot, true)
    try {
      const input = batchCapacityInput(escaped.source.projectPath, escaped.frozenPayloadJson, 64)
      const rawBytes = Buffer.byteLength(escaped.frozenPayloadJson, 'utf8') * input.entries.length
      assert.ok(
        Buffer.byteLength(escaped.frozenPayloadJson, 'utf8') <
          GENERATION_STAGING_LIMITS.frozenPayloadBytes,
      )
      assert.ok(rawBytes < GENERATION_STAGING_LIMITS.manifestBytes)
      const escapedBefore = await batchCapacityState(
        escaped.database,
        escapedRoot,
        escaped.source.projectPath,
      )
      await assert.rejects(escaped.staging.preflightBatchCapacity(input), {
        code: 'STAGING_INPUT_INVALID',
      })
      assert.deepEqual(
        await batchCapacityState(escaped.database, escapedRoot, escaped.source.projectPath),
        escapedBefore,
      )
    } finally {
      await escaped.database.close()
      await rm(escapedRoot, { force: true, recursive: true })
    }
  } finally {
    await data.database.close()
    await rm(root, { force: true, recursive: true })
  }
})

test('batch capacity respects exact serialized manifest bytes including maximum completion metadata', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-staging-capacity-border-'))
  const data = await batchCapacityFixture(root)
  try {
    const published = await publishOne(root, data.queue, data.staging, data.source, 42)
    const manifest = JSON.parse(
      await readFile(
        path.join(
          root,
          'recovery',
          'generation-staging',
          published.localProjectKey,
          published.stagingSessionId,
          'manifest.json',
        ),
        'utf8',
      ),
    ) as { candidates: Record<string, unknown>[] }
    const actualEntry = manifest.candidates[0]
    const input = batchCapacityInput(data.source.projectPath, data.frozenPayloadJson, 64)
    // Start with a manifest actually written by publication; replace only the fresh identities,
    // supplied frozen contexts and future completion fields whose lengths are not yet known.
    const expectedBytes = () =>
      Buffer.byteLength(
        JSON.stringify({
          candidates: input.entries.map((entry) => ({
            ...actualEntry,
            actualSeed: 0xff_ff_ff_ff,
            candidateId: entry.queueItemId,
            completedAt: new Date(8_640_000_000_000_000).toISOString(),
            completionOrder: Number.MAX_SAFE_INTEGER,
            expectedStatusSequence: Number.MAX_SAFE_INTEGER,
            frozenPayloadJson: entry.frozenPayloadJson,
            frozenPayloadSha256: sha256(Buffer.from(entry.frozenPayloadJson, 'utf8')),
            image: {
              ...(actualEntry.image as Record<string, unknown>),
              byteSize: IGS_GENERATION_PNG_MAX_BYTES,
              relativePath: `assets/${entry.queueItemId}.png`,
              sha256: 'f'.repeat(64),
            },
            queueItemId: entry.queueItemId,
            stagingSessionId: input.stagingSessionId,
          })),
          localProjectKey: input.localProjectKey,
          schemaVersion: 1,
          stagingSessionId: input.stagingSessionId,
        }),
        'utf8',
      )
    const remaining = GENERATION_STAGING_LIMITS.manifestBytes - expectedBytes()
    const perEntry = Math.floor(remaining / input.entries.length)
    const remainder = remaining % input.entries.length
    input.entries.forEach((entry, index) => {
      const payload = JSON.parse(entry.frozenPayloadJson) as {
        context: { model: { reference: { displayName: string } } }
      }
      payload.context.model.reference.displayName += 'x'.repeat(
        perEntry + (index < remainder ? 1 : 0),
      )
      entry.frozenPayloadJson = JSON.stringify(payload)
      assert.ok(
        Buffer.byteLength(entry.frozenPayloadJson, 'utf8') <=
          GENERATION_STAGING_LIMITS.frozenPayloadBytes,
      )
    })
    assert.equal(expectedBytes(), GENERATION_STAGING_LIMITS.manifestBytes)
    const before = await batchCapacityState(data.database, root, data.source.projectPath)
    await data.staging.preflightBatchCapacity(input)
    const payload = JSON.parse(input.entries[0].frozenPayloadJson) as {
      context: { model: { reference: { displayName: string } } }
    }
    payload.context.model.reference.displayName += 'x'
    input.entries[0].frozenPayloadJson = JSON.stringify(payload)
    assert.equal(expectedBytes(), GENERATION_STAGING_LIMITS.manifestBytes + 1)
    await assert.rejects(data.staging.preflightBatchCapacity(input), {
      code: 'STAGING_INPUT_INVALID',
    })
    assert.deepEqual(await batchCapacityState(data.database, root, data.source.projectPath), before)
  } finally {
    await data.database.close()
    await rm(root, { force: true, recursive: true })
  }
})

test('batch capacity rejects empty oversized invalid and unrecovered inputs without reserving candidates', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-staging-capacity-input-'))
  const data = await batchCapacityFixture(root)
  try {
    const input = batchCapacityInput(data.source.projectPath, data.frozenPayloadJson)
    const before = await batchCapacityState(data.database, root, data.source.projectPath)
    await assert.rejects(
      new GenerationStagingRepository(data.database.db, root).preflightBatchCapacity(input),
      {
        code: 'STAGING_NOT_RECONCILED',
      },
    )
    const invalidInputs = [
      { ...input, entries: [] },
      batchCapacityInput(input.projectPath, data.frozenPayloadJson, 65),
      { ...input, entries: [input.entries[0], input.entries[0]] },
      { ...input, entries: [{ frozenPayloadJson: '{}', queueItemId: randomUUID() }] },
      {
        ...input,
        entries: [{ frozenPayloadJson: ' '.repeat(128 * 1024 + 1), queueItemId: randomUUID() }],
      },
      {
        ...input,
        entries: [{ frozenPayloadJson: data.frozenPayloadJson, queueItemId: 'not-a-job' }],
      },
      { ...input, projectPath: 'Project.igs' },
      { ...input, localProjectKey: localProjectRecoveryKey(path.join(root, 'Other.igs')) },
      { ...input, stagingSessionId: '../session' },
    ]
    for (const invalid of invalidInputs) {
      await assert.rejects(data.staging.preflightBatchCapacity(invalid), {
        code: 'STAGING_INPUT_INVALID',
      })
    }
    assert.deepEqual(await batchCapacityState(data.database, root, data.source.projectPath), before)
  } finally {
    await data.database.close()
    await rm(root, { force: true, recursive: true })
  }
})

test('batch capacity rejects known queue receipt tombstone and orphan disk sessions without cleanup', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-staging-capacity-fresh-'))
  const data = await batchCapacityFixture(root)
  try {
    const input = batchCapacityInput(data.source.projectPath, data.frozenPayloadJson)
    await inRequestLease(root, data.source.prepared, async (request) => {
      const item = await data.queue.enqueueIllustriousTxt2Img({
        prepared: data.source.prepared,
        projectPath: input.projectPath,
        request,
        stagingSessionId: input.stagingSessionId,
      })
      for (const canceled of [false, true]) {
        if (canceled) {
          await data.queue.cancel(item.id)
        }
        const before = await batchCapacityState(data.database, root, input.projectPath)
        await assert.rejects(data.staging.preflightBatchCapacity(input), {
          code: 'STAGING_INPUT_INVALID',
        })
        await assert.rejects(
          data.staging.preflightBatchCapacity({
            ...input,
            entries: [{ ...input.entries[0], queueItemId: item.id }],
            stagingSessionId: randomUUID(),
          }),
          { code: 'STAGING_INPUT_INVALID' },
        )
        assert.deepEqual(await batchCapacityState(data.database, root, input.projectPath), before)
      }
      await data.queue.pruneTerminal(['canceled'])
    })
    const receiptId = randomUUID()
    await data.database.db
      .insertInto('generation_candidate_receipt')
      .values({
        actual_seed: 42,
        candidate_id: receiptId,
        canonical_project_path: input.projectPath,
        completed_at: null,
        expected_status_sequence: 1,
        frozen_payload_sha256: sha256(Buffer.from(data.frozenPayloadJson)),
        image_byte_size: 100,
        image_sha256: 'a'.repeat(64),
        local_project_key: input.localProjectKey,
        queue_item_id: receiptId,
        reserved_at: new Date().toISOString(),
        staging_session_id: input.stagingSessionId,
        status: 'reserved',
      })
      .execute()
    for (const completed of [false, true]) {
      if (completed) {
        await data.database.db
          .updateTable('generation_candidate_receipt')
          .set({ completed_at: new Date().toISOString(), status: 'completed' })
          .execute()
      }
      const before = await batchCapacityState(data.database, root, input.projectPath)
      await assert.rejects(data.staging.preflightBatchCapacity(input), {
        code: 'STAGING_INPUT_INVALID',
      })
      await assert.rejects(
        data.staging.preflightBatchCapacity({
          ...input,
          entries: [{ ...input.entries[0], queueItemId: receiptId }],
          stagingSessionId: randomUUID(),
        }),
        { code: 'STAGING_INPUT_INVALID' },
      )
      assert.deepEqual(await batchCapacityState(data.database, root, input.projectPath), before)
    }
    await data.database.db.deleteFrom('generation_candidate_receipt').execute()
    await data.database.db
      .insertInto('generation_staging_discarded_session')
      .values({
        discarded_at: new Date().toISOString(),
        local_project_key: input.localProjectKey,
        staging_session_id: input.stagingSessionId,
      })
      .execute()
    const tombstoneBefore = await batchCapacityState(data.database, root, input.projectPath)
    await assert.rejects(data.staging.preflightBatchCapacity(input), {
      code: 'STAGING_INPUT_INVALID',
    })
    assert.deepEqual(
      await batchCapacityState(data.database, root, input.projectPath),
      tombstoneBefore,
    )
    const projectRoot = path.join(root, 'recovery', 'generation-staging', input.localProjectKey)
    await mkdir(projectRoot, { mode: 0o700 })
    for (const diskCase of ['empty', 'invalid', 'dangling']) {
      const fresh = { ...input, stagingSessionId: randomUUID() }
      const sessionRoot = path.join(projectRoot, fresh.stagingSessionId)
      if (diskCase === 'dangling') {
        await symlink(path.join(root, 'missing-session'), sessionRoot)
      } else {
        await mkdir(sessionRoot, { mode: 0o700 })
        if (diskCase === 'invalid') {
          await writeFile(path.join(sessionRoot, 'manifest.json'), '{}')
        }
      }
      const before = await batchCapacityState(data.database, root, input.projectPath)
      await assert.rejects(data.staging.preflightBatchCapacity(fresh), {
        code: 'STAGING_INPUT_INVALID',
      })
      assert.deepEqual(await batchCapacityState(data.database, root, input.projectPath), before)
    }
  } finally {
    await data.database.close()
    await rm(root, { force: true, recursive: true })
  }
})

test('batch capacity refuses unsafe existing ancestors without changing permissions', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-staging-capacity-permissions-'))
  const data = await batchCapacityFixture(root)
  try {
    const input = batchCapacityInput(data.source.projectPath, data.frozenPayloadJson)
    const recoveryRoot = path.join(root, 'recovery')
    const stagingRoot = path.join(recoveryRoot, 'generation-staging')
    const projectRoot = path.join(stagingRoot, input.localProjectKey)
    await mkdir(projectRoot, { mode: 0o700 })
    for (const directory of [root, recoveryRoot, stagingRoot, projectRoot]) {
      await chmod(directory, 0o755)
      const before = await batchCapacityState(data.database, root, input.projectPath)
      await assert.rejects(data.staging.preflightBatchCapacity(input), {
        code: 'STAGING_STORAGE_UNSAFE',
      })
      assert.equal((await stat(directory)).mode & 0o777, 0o755)
      assert.deepEqual(await batchCapacityState(data.database, root, input.projectPath), before)
      await chmod(directory, 0o700)
    }
    await data.staging.preflightBatchCapacity(input)
    // Existing recovery retains permission hardening; only admission uses validation alone.
    await chmod(root, 0o755)
    await data.staging.recoverAfterRestart()
    assert.equal((await stat(root)).mode & 0o777, 0o700)
  } finally {
    await data.database.close()
    await rm(root, { force: true, recursive: true })
  }
})

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
        assert.equal(
          await staging.readLastActualSeed(claim.item.localProjectKey, prepared.context.documentId),
          null,
        )
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
        assert.equal(
          await staging.readLastActualSeed(claim.item.localProjectKey, prepared.context.documentId),
          65_535,
        )
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
    assert.equal(
      await recovered.readLastActualSeed(projectKey, prepared.context.documentId),
      65_535,
    )
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
        assert.equal(
          await staging.readLastActualSeed(localProjectKey, prepared.context.documentId),
          null,
        )
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
    assert.equal(
      await restarted.readLastActualSeed(localProjectKey, prepared.context.documentId),
      9001,
    )
    assert.deepEqual(await restarted.recoverAfterRestart(), { invalidCount: 0, reconciledCount: 0 })
    assert.equal(
      await restarted.readLastActualSeed(localProjectKey, prepared.context.documentId),
      9001,
    )
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
        assert.equal(
          await staging.readLastActualSeed(projectKey, prepared.context.documentId),
          null,
        )
        assert.deepEqual(await staging.listVerifiedCandidates(projectKey), [])
        await sql`DROP TRIGGER fail_candidate_completion`.execute(first.db)
      },
    )
    await first.close()
    const second = openAppDatabase(root, migrations)
    await new GenerationQueueRepository(second.db, root).recoverAfterRestart()
    const recovered = new GenerationStagingRepository(second.db, root)
    assert.deepEqual(await recovered.recoverAfterRestart(), { invalidCount: 0, reconciledCount: 1 })
    assert.equal(await recovered.readLastActualSeed(projectKey, prepared.context.documentId), 8080)
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
      assert.equal(
        await recovered.readLastActualSeed(localProjectKey, prepared.context.documentId),
        null,
      )
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
      assert.equal(
        await staging.readLastActualSeed(claim.item.localProjectKey, prepared.context.documentId),
        null,
      )
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
        assert.equal(
          await staging.readLastActualSeed(claim.item.localProjectKey, prepared.context.documentId),
          null,
        )
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
    assert.equal(
      await staging.readLastActualSeed(
        completedA.localProjectKey,
        projectA.prepared.context.documentId,
      ),
      111,
    )
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
    assert.equal(
      await restarted.readLastActualSeed(
        completedA.localProjectKey,
        projectA.prepared.context.documentId,
      ),
      111,
    )

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
    assert.equal(
      await restarted.readLastActualSeed(
        completedA.localProjectKey,
        projectA.prepared.context.documentId,
      ),
      444,
    )
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

test('interrupted Add journal consumes its captured sessions and preserves newer or orphan results', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-staging-add-restart-'))
  try {
    const first = openAppDatabase(root, migrations)
    const queue = new GenerationQueueRepository(first.db, root)
    const staging = new GenerationStagingRepository(first.db, root)
    await queue.recoverAfterRestart()
    await staging.recoverAfterRestart()
    const project = await fixture(root)
    const published = await publishOne(root, queue, staging, project, 42)
    const unchecked = await publishOne(root, queue, staging, project, 43)
    const journal = new GenerationAcceptanceJournalRepository(first.db)
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
      cancelAcceptanceJobs: async () => assert.fail('Unexpected sibling cancellation'),
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
      journal,
      orchestrator,
      queue,
      staging,
    })
    await assert.rejects(
      interrupted.accept(key, [published.candidateId], null, [
        published.candidateId,
        unchecked.candidateId,
      ]),
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
      [published.candidateId, unchecked.candidateId],
    )
    assert.ok(await journal.read(key, project.prepared.context.documentId))
    await first.close()

    const second = openAppDatabase(root, migrations)
    const restartedQueue = new GenerationQueueRepository(second.db, root)
    await restartedQueue.recoverAfterRestart()
    const restartedStaging = new GenerationStagingRepository(second.db, root)
    await restartedStaging.recoverAfterRestart()
    const later = await publishOne(root, restartedQueue, restartedStaging, project, 44)
    const orphan = await publishOne(
      root,
      restartedQueue,
      restartedStaging,
      {
        ...project,
        prepared: {
          ...project.prepared,
          context: { ...project.prepared.context, documentId: randomUUID() },
        },
      },
      45,
    )
    const restartedJournal = new GenerationAcceptanceJournalRepository(second.db)
    owner = await ProjectAutosaveCoordinator.recover(project.projectPath, roots, shadow, {
      debounceMs: 60_000,
      leaseRegistry: new ProjectAutosaveLeaseRegistry(),
    })
    const recovered = new ProjectGenerationAcceptance({
      documents: { getOpenDocument: (id) => (id === key ? owner : null) },
      gate: new ProjectGenerationOperationGate(),
      journal: restartedJournal,
      orchestrator,
      queue: restartedQueue,
      staging: restartedStaging,
    })
    assert.equal(await recovered.reconcile(key), 'cleaned')
    assert.equal(fenced, false)
    assert.deepEqual(
      (await restartedStaging.listVerifiedCandidates(key)).map((item) => item.candidateId),
      [later.candidateId, orphan.candidateId],
    )
    assert.equal(await restartedJournal.read(key, project.prepared.context.documentId), null)
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
    assert.equal(
      await recovered.readLastActualSeed(
        published.localProjectKey,
        candidate.prepared.context.documentId,
      ),
      901,
    )
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
    assert.equal(
      await restarted.readLastActualSeed(
        published.localProjectKey,
        candidate.prepared.context.documentId,
      ),
      707,
    )
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
    const resource = new ProjectGenerationResultResource(
      staging,
      (projectKey) => (projectKey === published.localProjectKey ? published.documentId : null),
      queue,
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

test('Seed cursor follows the document at a reused Project path and survives pruning, discard and restart', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-seed-document-'))
  const first = openAppDatabase(root, migrations)
  try {
    const queue = new GenerationQueueRepository(first.db, root)
    const staging = new GenerationStagingRepository(first.db, root)
    await queue.recoverAfterRestart()
    await staging.recoverAfterRestart()
    const original = await fixture(root)
    const oldDocumentId = original.prepared.context.documentId
    const oldCandidate = await publishOne(root, queue, staging, original, 111)
    const key = oldCandidate.localProjectKey
    assert.equal(await staging.readLastActualSeed(key, oldDocumentId), 111)

    // The path key is unchanged but the saved .igs is now a different document. The old seed
    // must not become the replacement Project's Reuse value, even while its candidate remains.
    await rm(original.projectPath)
    const replacement = await fixture(root)
    const newDocumentId = (await readIgsPackage(replacement.projectPath)).project.documentId
    assert.notEqual(newDocumentId, oldDocumentId)
    assert.equal(await staging.readLastActualSeed(key, newDocumentId), null)
    assert.equal(await staging.readLastActualSeed(key, oldDocumentId), 111)

    await publishOne(root, queue, staging, replacement, 222)
    assert.equal(await staging.readLastActualSeed(key, newDocumentId), 222)
    assert.equal(await staging.readLastActualSeed(key, oldDocumentId), null)
    assert.equal(await queue.pruneTerminal(['completed']), 2)
    assert.equal(await staging.readLastActualSeed(key, newDocumentId), 222)
    await staging.discardProject(key)
    assert.equal(await staging.readLastActualSeed(key, newDocumentId), 222)
    await first.close()

    const second = openAppDatabase(root, migrations)
    try {
      await new GenerationQueueRepository(second.db, root).recoverAfterRestart()
      const restarted = new GenerationStagingRepository(second.db, root)
      await restarted.recoverAfterRestart()
      assert.equal(await restarted.readLastActualSeed(key, newDocumentId), 222)
      assert.equal(await restarted.readLastActualSeed(key, oldDocumentId), null)
      assert.deepEqual(await restarted.listVerifiedCandidates(key), [])
    } finally {
      await second.close()
    }
  } finally {
    await first.close().catch(() => undefined)
    await rm(root, { force: true, recursive: true })
  }
})

test('migration trusts only a legacy cursor with matching completed receipt and queue document', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-seed-cursor-migration-'))
  try {
    const legacyMigrations = path.join(root, 'legacy-migrations')
    await mkdir(legacyMigrations)
    for (const file of await readdir(migrations)) {
      if (file.endsWith('.sql') && file < '0009_generation_seed_document.sql') {
        await copyFile(path.join(migrations, file), path.join(legacyMigrations, file))
      }
    }
    const old = openAppDatabase(root, legacyMigrations)
    const documentId = randomUUID()
    const candidateId = randomUUID()
    const unknownCandidateId = randomUUID()
    const sessionId = randomUUID()
    const pathWithEvidence = path.join(root, 'Known.igs')
    const pathWithoutEvidence = path.join(root, 'Unknown.igs')
    const knownKey = localProjectRecoveryKey(pathWithEvidence)
    const unknownKey = localProjectRecoveryKey(pathWithoutEvidence)
    const now = new Date().toISOString()
    try {
      await sql`
        INSERT INTO generation_queue_item
          (id, batch_id, local_project_key, canonical_project_path, document_id,
           document_revision, staging_session_id, operation, status, status_sequence,
           frozen_payload_json, error_code, error_message, created_at, updated_at,
           started_at, finished_at)
        VALUES
          (${candidateId}, ${randomUUID()}, ${knownKey}, ${pathWithEvidence}, ${documentId},
           ${randomUUID()}, ${sessionId}, 'illustrious-txt2img', 'completed', 2,
           '{}', NULL, NULL, ${now}, ${now}, ${now}, ${now})
      `.execute(old.db)
      await sql`
        INSERT INTO generation_candidate_receipt
          (completion_order, candidate_id, queue_item_id, expected_status_sequence,
           local_project_key, canonical_project_path, staging_session_id,
           frozen_payload_sha256, image_sha256, image_byte_size, actual_seed,
           status, reserved_at, completed_at)
        VALUES
          (1, ${candidateId}, ${candidateId}, 1, ${knownKey}, ${pathWithEvidence}, ${sessionId},
           ${sha256(Buffer.from('{}'))}, ${'a'.repeat(64)}, 100, 42, 'completed', ${now}, ${now})
      `.execute(old.db)
      // Receipts outlive pruned queue rows, so this otherwise matching legacy cursor
      // cannot be assigned to any document during migration.
      await sql`
        INSERT INTO generation_candidate_receipt
          (completion_order, candidate_id, queue_item_id, expected_status_sequence,
           local_project_key, canonical_project_path, staging_session_id,
           frozen_payload_sha256, image_sha256, image_byte_size, actual_seed,
           status, reserved_at, completed_at)
        VALUES
          (2, ${unknownCandidateId}, ${unknownCandidateId}, 1, ${unknownKey},
           ${pathWithoutEvidence}, ${randomUUID()}, ${sha256(Buffer.from('{}'))},
           ${'b'.repeat(64)}, 100, 99, 'completed', ${now}, ${now})
      `.execute(old.db)
      await sql`
        INSERT INTO generation_seed_cursor
          (local_project_key, completion_order, candidate_id, actual_seed, updated_at)
        VALUES (${knownKey}, 1, ${candidateId}, 42, ${now}),
               (${unknownKey}, 2, ${unknownCandidateId}, 99, ${now})
      `.execute(old.db)
    } finally {
      await old.close()
    }

    const upgraded = openAppDatabase(root, migrations)
    try {
      const cursors = await upgraded.db
        .selectFrom('generation_seed_cursor')
        .select(['local_project_key', 'document_id'])
        .orderBy('local_project_key')
        .execute()
      assert.deepEqual(
        cursors,
        [
          { document_id: documentId, local_project_key: knownKey },
          { document_id: null, local_project_key: unknownKey },
        ].sort((a, b) => a.local_project_key.localeCompare(b.local_project_key)),
      )
      const staging = new GenerationStagingRepository(upgraded.db, root)
      await staging.recoverAfterRestart()
      assert.equal(await staging.readLastActualSeed(knownKey, documentId), 42)
      assert.equal(await staging.readLastActualSeed(knownKey, randomUUID()), null)
      assert.equal(await staging.readLastActualSeed(unknownKey, randomUUID()), null)
      await assert.rejects(staging.readLastActualSeed(knownKey, 'not-a-document-id'), {
        code: 'STAGING_INPUT_INVALID',
      })
    } finally {
      await upgraded.close()
    }
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

// Boundary: real queue → staging publication → signed resource → filesystem verification.
// Invariant: a worker thumbnail is optional presentation cache and cannot replace PNG authority.
// Neighbor: absent/invalid derivatives keep the same durable candidate/seed/portable .igs.
// Mutation: serve the cache without checking current source identity/tombstone visibility.
test('worker thumbnail cache is bounded, signed, rebuildable and survives operational history pruning', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-staging-thumbnail-'))
  const database = openAppDatabase(root, migrations)
  try {
    const queue = new GenerationQueueRepository(database.db, root)
    const staging = new GenerationStagingRepository(database.db, root)
    await queue.recoverAfterRestart()
    await staging.recoverAfterRestart()
    const source = await fixture(root, 'Large Project.igs', { ...bbox, height: 384, width: 768 })
    const originalIgs = await readFile(source.projectPath)
    const webp = await readFile(
      path.resolve('src/main/projects/test-fixtures/candidate-thumbnail-256x128.webp'),
    )
    const published = await publishOne(root, queue, staging, source, 17, webp)
    assert.deepEqual(published.thumbnail, {
      byteSize: webp.length,
      height: 128,
      sha256: sha256(webp),
      width: 256,
    })
    assert.deepEqual(published.image, {
      byteSize: source.outputBytes.length,
      height: 384,
      iccSha256: IGS_SRGB_ICC_SHA256,
      sha256: sha256(source.outputBytes),
      width: 768,
    })
    const sessionPath = path.dirname(path.dirname(published.assetPath))
    const manifestBytes = await readFile(path.join(sessionPath, 'manifest.json'))
    const manifest = JSON.parse(manifestBytes.toString('utf8'))
    assert.equal(Object.hasOwn(manifest, 'thumbnail'), false)
    assert.equal(Object.hasOwn(manifest.candidates[0], 'thumbnail'), false)
    assert.equal(manifestBytes.toString('utf8').includes('.thumb.webp'), false)
    const receipt = await database.db
      .selectFrom('generation_candidate_receipt')
      .selectAll()
      .where('candidate_id', '=', published.candidateId)
      .executeTakeFirstOrThrow()
    assert.equal(receipt.image_sha256, published.image.sha256)
    assert.equal(receipt.image_byte_size, source.outputBytes.length)
    let openDocument: string | null = published.documentId
    const resource = new ProjectGenerationResultResource(staging, () => openDocument, queue)
    const snapshot = await resource.list(published.localProjectKey)
    const view = snapshot.candidates[0]
    assert.ok(view.thumbnailUrl)
    assert.equal(view.thumbnailUrl.includes(root), false)
    assert.deepEqual(parseGenerationResultThumbnailUrl(view.thumbnailUrl), {
      candidateId: published.candidateId,
      imageSha256: published.image.sha256,
      localProjectKey: published.localProjectKey,
      stagingSessionId: published.stagingSessionId,
      thumbnailSha256: sha256(webp),
    })
    assert.deepEqual(await resource.readThumbnail(view.thumbnailUrl), webp)
    assert.deepEqual(await resource.readImage(view.imageUrl), source.outputBytes)
    assert.equal(source.outputBytes.readUInt32BE(16), 768)
    assert.equal(source.outputBytes.readUInt32BE(20), 384)
    const exportPath = path.join(root, 'exported-full-result.png')
    const exporter = new ProjectCandidateImageExporter(
      staging,
      () => openDocument,
      async () => ({
        canceled: false,
        filePath: exportPath,
      }),
    )
    assert.deepEqual(await exporter.save(published.localProjectKey, published.candidateId), {
      fileName: 'exported-full-result.png',
      kind: 'saved',
    })
    assert.deepEqual(await readFile(exportPath), source.outputBytes)
    for (const forged of [
      view.thumbnailUrl.replace(published.image.sha256, 'f'.repeat(64)),
      view.thumbnailUrl.replace(sha256(webp), 'f'.repeat(64)),
      view.thumbnailUrl.replace(published.candidateId, randomUUID()),
      view.thumbnailUrl.replace('thumbnail/', 'asset/'),
      `${view.thumbnailUrl}?path=${root}`,
      `${view.thumbnailUrl}#hash`,
      view.thumbnailUrl.replace('igs-staging:', 'file:'),
    ]) {
      assert.equal(parseGenerationResultThumbnailUrl(forged), null)
      assert.equal(await resource.readThumbnail(forged), null)
    }
    openDocument = null
    assert.equal(await resource.readThumbnail(view.thumbnailUrl), null)
    openDocument = published.documentId
    await queue.pruneTerminal(['completed'])
    assert.deepEqual(await resource.readThumbnail(view.thumbnailUrl), webp)
    assert.deepEqual(await resource.readImage(view.imageUrl), source.outputBytes)
    assert.equal(
      await staging.readLastActualSeed(published.localProjectKey, published.documentId),
      17,
    )
    assert.deepEqual(await readFile(source.projectPath), originalIgs)
    await queue.recoverAfterRestart()
    const restarted = new GenerationStagingRepository(database.db, root)
    assert.deepEqual(await restarted.recoverAfterRestart(), { invalidCount: 0, reconciledCount: 0 })
    const restored = await restarted.listVerifiedCandidates(published.localProjectKey)
    assert.equal(restored.length, 1)
    assert.deepEqual(restored[0].thumbnail, published.thumbnail)
    const cacheRoot = path.join(sessionPath, 'thumbnail-cache')
    await rm(cacheRoot, { recursive: true })
    assert.equal(
      (await restarted.listVerifiedCandidates(published.localProjectKey))[0].thumbnail,
      undefined,
    )
    assert.equal(await resource.readThumbnail(view.thumbnailUrl), null)
    assert.deepEqual(await resource.readImage(view.imageUrl), source.outputBytes)
  } finally {
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
})

test('invalid optional worker thumbnails cannot reject a valid completed PNG candidate', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-staging-thumbnail-refusal-'))
  const database = openAppDatabase(root, migrations)
  try {
    const queue = new GenerationQueueRepository(database.db, root)
    const staging = new GenerationStagingRepository(database.db, root)
    await queue.recoverAfterRestart()
    await staging.recoverAfterRestart()
    const source = await fixture(root, 'Large Project.igs', { ...bbox, height: 384, width: 768 })
    const webp = await readFile(
      path.resolve('src/main/projects/test-fixtures/candidate-thumbnail-256x128.webp'),
    )
    const variants: readonly [Buffer, (metadata: Record<string, unknown>) => unknown][] = [
      [webp, () => null],
      [webp, (metadata) => ({ ...metadata, outputPath: path.join(root, 'unowned.webp') })],
      [webp, (metadata) => ({ ...metadata, sha256: 'f'.repeat(64) })],
      [webp, (metadata) => ({ ...metadata, height: 127 })],
      [webp, (metadata) => ({ ...metadata, width: 257 })],
      [webp, (metadata) => ({ ...metadata, byteSize: 0 })],
      [webp, (metadata) => ({ ...metadata, byteSize: GENERATION_THUMBNAIL_MAX_BYTES + 1 })],
      [webp, (metadata) => ({ ...metadata, byteSize: webp.length - 1 })],
      [
        Buffer.alloc(GENERATION_THUMBNAIL_MAX_BYTES + 1),
        (metadata) => ({ ...metadata, byteSize: webp.length }),
      ],
      [source.outputBytes, (metadata) => metadata],
      [webp.subarray(0, 24), (metadata) => metadata],
    ]
    for (const [bytes, transform] of variants) {
      const published = await publishOne(root, queue, staging, source, 0, bytes, transform)
      assert.equal(published.thumbnail, undefined)
      assert.equal((await queue.getManagerEntry(published.queueItemId))?.status, 'completed')
      assert.deepEqual(
        await staging.readVerifiedCandidatePng({
          candidateId: published.candidateId,
          imageSha256: published.image.sha256,
          localProjectKey: published.localProjectKey,
          stagingSessionId: published.stagingSessionId,
        }),
        source.outputBytes,
      )
    }
    assert.equal(
      (await staging.listVerifiedCandidates(localProjectRecoveryKey(source.projectPath))).length,
      variants.length,
    )
    assert.equal(
      await staging.readLastActualSeed(
        localProjectRecoveryKey(source.projectPath),
        source.prepared.context.documentId,
      ),
      0,
    )
  } finally {
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
})

test('fresh thumbnail GET refuses changed cache, symlinks and a durably discarded candidate', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-staging-thumbnail-fresh-'))
  const database = openAppDatabase(root, migrations)
  try {
    const queue = new GenerationQueueRepository(database.db, root)
    const staging = new GenerationStagingRepository(database.db, root, {
      beforeSessionCleanup: async () => {
        throw new Error('retain thumbnail bytes after durable tombstone')
      },
    })
    await queue.recoverAfterRestart()
    await staging.recoverAfterRestart()
    const source = await fixture(root, 'Large Project.igs', { ...bbox, height: 384, width: 768 })
    const webp = await readFile(
      path.resolve('src/main/projects/test-fixtures/candidate-thumbnail-256x128.webp'),
    )
    const published = await publishOne(root, queue, staging, source, 42, webp)
    const resource = new ProjectGenerationResultResource(staging, () => published.documentId, queue)
    const view = (await resource.list(published.localProjectKey)).candidates[0]
    assert.ok(view.thumbnailUrl)
    const cacheRoot = path.join(path.dirname(path.dirname(published.assetPath)), 'thumbnail-cache')
    const metadataPath = path.join(cacheRoot, `${published.candidateId}.json`)
    const thumbnailPath = path.join(cacheRoot, `${published.candidateId}.webp`)
    const originalMetadata = await readFile(metadataPath)
    const metadata = JSON.parse(originalMetadata.toString('utf8'))
    await writeFile(
      metadataPath,
      JSON.stringify({ ...metadata, sourceImageSha256: 'f'.repeat(64) }),
    )
    assert.equal(await resource.readThumbnail(view.thumbnailUrl), null)
    assert.equal(
      (await resource.list(published.localProjectKey)).candidates[0].thumbnailUrl,
      undefined,
    )
    assert.deepEqual(await resource.readImage(view.imageUrl), source.outputBytes)
    await writeFile(metadataPath, originalMetadata)
    await writeFile(thumbnailPath, Buffer.from('corrupt cached image'))
    assert.equal(await resource.readThumbnail(view.thumbnailUrl), null)
    assert.deepEqual(await resource.readImage(view.imageUrl), source.outputBytes)
    await rm(thumbnailPath)
    const unowned = path.join(root, 'unowned.webp')
    await writeFile(unowned, webp, { mode: 0o600 })
    await symlink(unowned, thumbnailPath)
    assert.equal(await resource.readThumbnail(view.thumbnailUrl), null)
    await rm(thumbnailPath)
    await writeFile(thumbnailPath, webp, { mode: 0o600 })
    assert.deepEqual(await resource.readThumbnail(view.thumbnailUrl), webp)
    // Keep the valid cache and its original source binding intact, but replace the real PNG
    // with another valid sRGB image of the same dimensions. Cache existence cannot authorize
    // bytes after the candidate's authoritative source changed at its existing path.
    const replacementPng = await srgbPng(768, 384, true, false, 8, 4, [181, 94, 37])
    assert.notEqual(sha256(replacementPng), published.image.sha256)
    await validateSrgbPngStream(
      (async function* () {
        yield replacementPng
      })(),
      'replacement.png',
      IGS_GENERATION_PNG_MAX_BYTES,
      2048,
    )
    await writeFile(published.assetPath, replacementPng)
    assert.deepEqual(await readFile(thumbnailPath), webp)
    assert.deepEqual(await readFile(metadataPath), originalMetadata)
    assert.equal(await resource.readThumbnail(view.thumbnailUrl), null)
    assert.equal(await resource.readImage(view.imageUrl), null)
    await writeFile(published.assetPath, source.outputBytes)
    assert.deepEqual(await resource.readThumbnail(view.thumbnailUrl), webp)
    assert.deepEqual(await resource.readImage(view.imageUrl), source.outputBytes)
    const discarded = await staging.discardProject(published.localProjectKey)
    assert.deepEqual(discarded, { cleanupDeferred: true, discardedSessionCount: 1 })
    assert.deepEqual(await readFile(thumbnailPath), webp)
    assert.equal(await resource.readThumbnail(view.thumbnailUrl), null)
    assert.equal(await resource.readImage(view.imageUrl), null)
    assert.equal((await resource.list(published.localProjectKey)).candidates.length, 0)
    assert.equal(
      await staging.readLastActualSeed(published.localProjectKey, published.documentId),
      42,
    )
  } finally {
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
})
