import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { crc32, deflateSync } from 'node:zlib'

import type { RegionalQueueFixture } from './test-fixtures/regional-queue.js'

import { openAppDatabase } from '../db/database.js'
import { GenerationQueueRepository } from './generation-queue.js'
import {
  GenerationStagingRepository,
  parseFrozenGenerationCandidatePayloadV1,
} from './generation-staging.js'
import { parseFrozenQueuedRegionalV1 } from './regional-queued-generation.js'
import {
  createRegionalQueueFixture,
  enqueueRegionalFixture,
  regionalFixtureSha256,
} from './test-fixtures/regional-queue.js'

const migrations = path.resolve('src/main/db/migrations')

async function claim(f: RegionalQueueFixture) {
  const item = await enqueueRegionalFixture(f)
  const verified = await f.queue.claimNextPendingRegional()
  assert.ok(verified)
  assert.equal(verified.item.id, item.id)
  return verified
}

async function publish(f: RegionalQueueFixture) {
  const verified = await claim(f)
  const candidate = await f.staging.publishRegionalCandidate({
    actualSeed: verified.payload.workerJob.sampling.seed,
    expectedStatusSequence: verified.item.statusSequence,
    pngBytes: f.outputBytes,
    queueItemId: verified.item.id,
  })
  return { candidate, verified }
}

function readIdentity(candidate: Awaited<ReturnType<typeof publish>>['candidate']) {
  return {
    candidateId: candidate.candidateId,
    imageSha256: candidate.image.sha256,
    localProjectKey: candidate.localProjectKey,
    stagingSessionId: candidate.stagingSessionId,
  }
}

/** Independently authored output bytes; this fixture performs no inference. */
async function outputPng(width: number, height: number, rgba = false): Promise<Buffer> {
  const profile = await readFile(path.resolve('worker-python/src/imagegen_worker/srgb.icc'))
  assert.equal(regionalFixtureSha256(profile), IGS_SRGB_ICC_SHA256)
  const chunk = (name: string, bytes: Buffer): Buffer => {
    const out = Buffer.alloc(12 + bytes.length)
    out.writeUInt32BE(bytes.length)
    out.write(name, 4)
    bytes.copy(out, 8)
    out.writeUInt32BE(crc32(out.subarray(4, -4)), out.length - 4)
    return out
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = rgba ? 6 : 2
  const channels = rgba ? 4 : 3
  const rows = Buffer.alloc((width * channels + 1) * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      rows.set(
        rgba ? [63, 95, 127, 255] : [63, 95, 127],
        y * (width * channels + 1) + 1 + x * channels,
      )
    }
  }
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', header),
    chunk('iCCP', Buffer.concat([Buffer.from('srgb\0\0'), deflateSync(profile)])),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

test('private regional publication owns result bytes synchronously and commits its receipt and cursor without public discovery', async () => {
  const f = await createRegionalQueueFixture()
  try {
    const verified = await claim(f)
    const ownedBefore = Buffer.from(f.outputBytes)
    const supplied = Buffer.from(f.outputBytes)
    const completion = f.staging.publishRegionalCandidate({
      actualSeed: 123,
      expectedStatusSequence: verified.item.statusSequence,
      pngBytes: supplied,
      queueItemId: verified.item.id,
    })
    supplied.fill(0)
    const candidate = await completion
    assert.ok(
      (await readFile(candidate.assetPath)).equals(ownedBefore),
      'caller mutation cannot change committed pixels',
    )
    assert.equal(candidate.actualSeed, 123)
    assert.equal(candidate.image.sha256, regionalFixtureSha256(ownedBefore))
    const regional = parseFrozenQueuedRegionalV1(candidate.frozenPayloadJson)
    assert.equal(regional.regional.sha256, verified.payload.regional.sha256)
    assert.deepEqual(await f.staging.listVerifiedRegionalCandidates(candidate.localProjectKey), [
      candidate,
    ])
    assert.deepEqual(await f.staging.listVerifiedCandidates(candidate.localProjectKey), [])
    assert.equal(await f.staging.readVerifiedCandidatePng(readIdentity(candidate)), null)
    assert.equal(
      await f.staging.readVerifiedCandidateThumbnail({
        ...readIdentity(candidate),
        thumbnailSha256: 'a'.repeat(64),
      }),
      null,
    )
    assert.ok(
      (await f.staging.readVerifiedRegionalCandidatePng(readIdentity(candidate)))?.equals(
        ownedBefore,
      ),
    )
    assert.throws(() => parseFrozenGenerationCandidatePayloadV1(candidate.frozenPayloadJson), {
      code: 'STAGING_INPUT_INVALID',
    })
    const row = await f.db
      .selectFrom('generation_queue_item')
      .selectAll()
      .where('id', '=', candidate.queueItemId)
      .executeTakeFirstOrThrow()
    const receipt = await f.db
      .selectFrom('generation_candidate_receipt')
      .selectAll()
      .where('candidate_id', '=', candidate.candidateId)
      .executeTakeFirstOrThrow()
    assert.equal(row.status, 'completed')
    assert.equal(row.status_sequence, verified.item.statusSequence + 1)
    assert.equal(receipt.status, 'completed')
    assert.equal(receipt.frozen_payload_sha256, candidate.frozenPayloadSha256)
    assert.equal(
      await f.staging.readLastActualSeed(candidate.localProjectKey, candidate.documentId),
      123,
    )
  } finally {
    await f.close()
  }
})

test('regional completion is private-row and exact-seed bound before receipt reservation', async () => {
  const f = await createRegionalQueueFixture()
  try {
    const verified = await claim(f)
    await assert.rejects(
      f.staging.publishGenerationCandidate({
        actualSeed: 123,
        expectedProvisionalRoot: f.request.job.output.stagingRoot,
        expectedStatusSequence: verified.item.statusSequence,
        provisionalOutputPath: f.request.job.output.pngPath,
        queueItemId: verified.item.id,
      }),
      { code: 'QUEUE_INPUT_INVALID' },
    )
    await assert.rejects(
      f.staging.publishRegionalCandidate({
        actualSeed: 124,
        expectedStatusSequence: verified.item.statusSequence,
        pngBytes: f.outputBytes,
        queueItemId: verified.item.id,
      }),
      { code: 'STAGING_INPUT_INVALID' },
    )
    await assert.rejects(
      f.staging.publishRegionalCandidate({
        actualSeed: 123,
        expectedStatusSequence: verified.item.statusSequence + 1,
        pngBytes: f.outputBytes,
        queueItemId: verified.item.id,
      }),
      { code: 'STAGING_STATUS_CONFLICT' },
    )
    assert.deepEqual(
      await f.db.selectFrom('generation_candidate_receipt').selectAll().execute(),
      [],
    )
    assert.equal((await f.queue.loadVerifiedRegionalInput(verified.item.id)).item.status, 'running')
  } finally {
    await f.close()
  }
})

for (const kind of ['RGBA', 'wrong-dimensions', 'wrong-ICC', 'corrupt-CRC'] as const) {
  test(`regional staging independently refuses ${kind} pixels without reserving a receipt`, async () => {
    const f = await createRegionalQueueFixture()
    try {
      const verified = await claim(f)
      let bytes =
        kind === 'RGBA'
          ? await outputPng(64, 64, true)
          : kind === 'wrong-dimensions'
            ? await outputPng(72, 64)
            : Buffer.from(f.outputBytes)
      if (kind === 'wrong-ICC') {
        // Keep the PNG structurally valid but omit the exact required ICC chunk.
        const size = bytes.readUInt32BE(33)
        assert.equal(bytes.toString('ascii', 37, 41), 'iCCP')
        bytes = Buffer.concat([bytes.subarray(0, 33), bytes.subarray(45 + size)])
      } else if (kind === 'corrupt-CRC') {
        bytes[29] ^= 1
      }
      await assert.rejects(
        f.staging.publishRegionalCandidate({
          actualSeed: 123,
          expectedStatusSequence: verified.item.statusSequence,
          pngBytes: bytes,
          queueItemId: verified.item.id,
        }),
        { code: 'STAGING_OUTPUT_INVALID' },
      )
      assert.deepEqual(
        await f.db.selectFrom('generation_candidate_receipt').selectAll().execute(),
        [],
      )
      const candidate = await f.staging.publishRegionalCandidate({
        actualSeed: 123,
        expectedStatusSequence: verified.item.statusSequence,
        pngBytes: f.outputBytes,
        queueItemId: verified.item.id,
      })
      assert.ok(
        (await readFile(candidate.assetPath)).equals(f.outputBytes),
        'healthy neighboring completion remains valid',
      )
    } finally {
      await f.close()
    }
  })
}

test('a regional manifest-first interruption reconciles through real SQLite reopen and remains private', async () => {
  const sentinel = new Error('after actual regional manifest fsync')
  const f = await createRegionalQueueFixture({
    stagingHooks: {
      afterManifestPublish: async () => {
        throw sentinel
      },
    },
  })
  let reopened: ReturnType<typeof openAppDatabase> | undefined
  try {
    const verified = await claim(f)
    await assert.rejects(
      f.staging.publishRegionalCandidate({
        actualSeed: 123,
        expectedStatusSequence: verified.item.statusSequence,
        pngBytes: f.outputBytes,
        queueItemId: verified.item.id,
      }),
      (error) => error === sentinel,
    )
    assert.deepEqual(
      await f.staging.listVerifiedRegionalCandidates(verified.item.localProjectKey),
      [],
    )
    assert.equal(
      (await f.db.selectFrom('generation_candidate_receipt').selectAll().executeTakeFirstOrThrow())
        .status,
      'reserved',
    )
    await f.database.close()
    reopened = openAppDatabase(f.dataRoot, migrations)
    const queue = new GenerationQueueRepository(reopened.db, f.dataRoot)
    const staging = new GenerationStagingRepository(reopened.db, f.dataRoot)
    assert.equal((await queue.recoverAfterRestart()).canceledCount, 1)
    assert.deepEqual(await staging.recoverAfterRestart(), { invalidCount: 0, reconciledCount: 1 })
    const [candidate] = await staging.listVerifiedRegionalCandidates(verified.item.localProjectKey)
    assert.ok(candidate)
    assert.ok(
      (await staging.readVerifiedRegionalCandidatePng(readIdentity(candidate)))?.equals(
        f.outputBytes,
      ),
    )
    assert.deepEqual(await staging.listVerifiedCandidates(candidate.localProjectKey), [])
    const row = await reopened.db
      .selectFrom('generation_queue_item')
      .selectAll()
      .where('id', '=', verified.item.id)
      .executeTakeFirstOrThrow()
    assert.equal(row.status, 'completed')
    assert.equal(row.status_sequence, verified.item.statusSequence + 2)
    assert.equal(
      (
        await reopened.db
          .selectFrom('generation_candidate_receipt')
          .selectAll()
          .executeTakeFirstOrThrow()
      ).status,
      'completed',
    )
  } finally {
    await reopened?.close()
    await f.close()
  }
})

test('user cancellation cannot be recovered as a successful regional manifest-first completion', async () => {
  const sentinel = new Error('leave manifest for canceled completion')
  const f = await createRegionalQueueFixture({
    stagingHooks: {
      afterManifestPublish: async () => {
        throw sentinel
      },
    },
  })
  try {
    const verified = await claim(f)
    await assert.rejects(
      f.staging.publishRegionalCandidate({
        actualSeed: 123,
        expectedStatusSequence: verified.item.statusSequence,
        pngBytes: f.outputBytes,
        queueItemId: verified.item.id,
      }),
      (error) => error === sentinel,
    )
    await f.queue.cancel(verified.item.id)
    await f.queue.recoverAfterRestart()
    const recovered = new GenerationStagingRepository(f.db, f.dataRoot)
    assert.deepEqual(await recovered.recoverAfterRestart(), { invalidCount: 1, reconciledCount: 0 })
    assert.deepEqual(
      await recovered.listVerifiedRegionalCandidates(verified.item.localProjectKey),
      [],
    )
    const row = await f.db
      .selectFrom('generation_queue_item')
      .selectAll()
      .where('id', '=', verified.item.id)
      .executeTakeFirstOrThrow()
    assert.equal(row.status, 'canceled')
    assert.equal(row.error_code, 'USER_CANCELED')
  } finally {
    await f.close()
  }
})

test('completed regional candidate survives queue pruning and later staging restart', async () => {
  const f = await createRegionalQueueFixture()
  try {
    const { candidate } = await publish(f)
    const row = await f.db
      .selectFrom('generation_queue_item')
      .selectAll()
      .where('id', '=', candidate.queueItemId)
      .executeTakeFirstOrThrow()
    await f.queue.deleteTerminal(row.id, row.status_sequence)
    assert.equal(
      await f.db
        .selectFrom('generation_queue_item')
        .selectAll()
        .where('id', '=', row.id)
        .executeTakeFirst(),
      undefined,
    )
    await f.queue.recoverAfterRestart()
    const reopened = new GenerationStagingRepository(f.db, f.dataRoot)
    assert.deepEqual(await reopened.recoverAfterRestart(), { invalidCount: 0, reconciledCount: 0 })
    assert.deepEqual(await reopened.listVerifiedRegionalCandidates(candidate.localProjectKey), [
      candidate,
    ])
    assert.ok(
      (await reopened.readVerifiedRegionalCandidatePng(readIdentity(candidate)))?.equals(
        f.outputBytes,
      ),
    )
    assert.deepEqual(await reopened.listVerifiedCandidates(candidate.localProjectKey), [])
  } finally {
    await f.close()
  }
})

test('discard tombstones hide regional candidates and prevent restart resurrection', async () => {
  const f = await createRegionalQueueFixture()
  try {
    const { candidate } = await publish(f)
    await f.staging.discardSessions(candidate.localProjectKey, [candidate.stagingSessionId])
    assert.deepEqual(await f.staging.listVerifiedRegionalCandidates(candidate.localProjectKey), [])
    assert.equal(await f.staging.readVerifiedRegionalCandidatePng(readIdentity(candidate)), null)
    await f.queue.recoverAfterRestart()
    const reopened = new GenerationStagingRepository(f.db, f.dataRoot)
    assert.deepEqual(await reopened.recoverAfterRestart(), { invalidCount: 0, reconciledCount: 0 })
    assert.deepEqual(await reopened.listVerifiedRegionalCandidates(candidate.localProjectKey), [])
    assert.deepEqual(await reopened.listVerifiedCandidates(candidate.localProjectKey), [])
  } finally {
    await f.close()
  }
})

test('private capacity preflight preserves the strict normal parser and leaves no queue receipt', async () => {
  const f = await createRegionalQueueFixture()
  try {
    const item = await enqueueRegionalFixture(f)
    const row = await f.db
      .selectFrom('generation_queue_item')
      .selectAll()
      .where('id', '=', item.id)
      .executeTakeFirstOrThrow()
    const planned = {
      entries: [{ frozenPayloadJson: row.frozen_payload_json, queueItemId: randomUUID() }],
      localProjectKey: item.localProjectKey,
      projectPath: f.projectPath,
      stagingSessionId: randomUUID(),
    }
    await assert.rejects(f.staging.preflightBatchCapacity(planned), {
      code: 'STAGING_INPUT_INVALID',
    })
    await f.staging.preflightRegionalBatchCapacity(planned)
    const { regional: _regional, ...base } = parseFrozenQueuedRegionalV1(row.frozen_payload_json)
    const ordinary = JSON.stringify({ ...base, kind: 'illustrious-txt2img' })
    await assert.rejects(
      f.staging.preflightRegionalBatchCapacity({
        ...planned,
        entries: [{ ...planned.entries[0], frozenPayloadJson: ordinary }],
      }),
    )
    assert.deepEqual(
      await f.db.selectFrom('generation_candidate_receipt').selectAll().execute(),
      [],
    )
    assert.equal((await f.db.selectFrom('generation_queue_item').selectAll().execute()).length, 1)
    const tooMany = {
      ...planned,
      entries: Array.from({ length: 129 }, () => ({
        frozenPayloadJson: row.frozen_payload_json,
        queueItemId: randomUUID(),
      })),
    }
    await assert.rejects(f.staging.preflightRegionalBatchCapacity(tooMany), {
      code: 'STAGING_INPUT_INVALID',
    })
  } finally {
    await f.close()
  }
})

test('normal completed neighbor remains discoverable while private publication rejects its queue row', async () => {
  const f = await createRegionalQueueFixture()
  try {
    const { candidate: regional } = await publish(f)
    const item = await f.queue.enqueueIllustriousTxt2Img({
      prepared: f.prepared,
      projectPath: f.projectPath,
      request: f.request,
      stagingSessionId: randomUUID(),
    })
    const verified = await f.queue.claimNextPending()
    assert.ok(verified)
    assert.equal(verified.item.id, item.id)
    await assert.rejects(
      f.staging.publishRegionalCandidate({
        actualSeed: 123,
        expectedStatusSequence: verified.item.statusSequence,
        pngBytes: f.outputBytes,
        queueItemId: item.id,
      }),
      { code: 'QUEUE_INPUT_INVALID' },
    )
    const scratch = path.join(f.dataRoot, 'scratch')
    await mkdir(scratch, { mode: 0o700, recursive: true })
    const stage = await mkdtemp(path.join(scratch, 'illustrious-request-'))
    const resultPath = path.join(stage, 'result.png')
    await writeFile(resultPath, f.outputBytes, { mode: 0o600 })
    const candidate = await f.staging.publishGenerationCandidate({
      actualSeed: 123,
      expectedProvisionalRoot: stage,
      expectedStatusSequence: verified.item.statusSequence,
      provisionalOutputPath: resultPath,
      queueItemId: item.id,
    })
    assert.deepEqual(await f.staging.listVerifiedCandidates(candidate.localProjectKey), [candidate])
    assert.deepEqual(await f.staging.listVerifiedRegionalCandidates(candidate.localProjectKey), [
      regional,
    ])
    assert.ok(
      (await f.staging.readVerifiedCandidatePng(readIdentity(candidate)))?.equals(f.outputBytes),
    )
    assert.equal(await f.staging.readVerifiedRegionalCandidatePng(readIdentity(candidate)), null)
  } finally {
    await f.close()
  }
})

test('changed committed regional pixels are never exposed or treated as a new completion', async () => {
  const f = await createRegionalQueueFixture()
  try {
    const { candidate } = await publish(f)
    await writeFile(candidate.assetPath, await outputPng(64, 64), { mode: 0o600 })
    assert.deepEqual(await f.staging.listVerifiedRegionalCandidates(candidate.localProjectKey), [])
    assert.equal(await f.staging.readVerifiedRegionalCandidatePng(readIdentity(candidate)), null)
    const reopened = new GenerationStagingRepository(f.db, f.dataRoot)
    assert.deepEqual(await reopened.recoverAfterRestart(), { invalidCount: 1, reconciledCount: 0 })
    assert.equal(
      (await f.db.selectFrom('generation_candidate_receipt').selectAll().executeTakeFirstOrThrow())
        .status,
      'completed',
    )
    assert.equal(
      (
        await f.db
          .selectFrom('generation_queue_item')
          .selectAll()
          .where('id', '=', candidate.queueItemId)
          .executeTakeFirstOrThrow()
      ).status,
      'completed',
    )
  } finally {
    await f.close()
  }
})
