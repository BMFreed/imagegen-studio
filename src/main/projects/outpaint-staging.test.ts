import assert from 'node:assert/strict'
import { readFile, rm, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import { openAppDatabase } from '../db/database.js'
import { GenerationQueueRepository } from './generation-queue.js'
import { GenerationStagingRepository } from './generation-staging.js'
import { animaProvisionalOutput } from './test-fixtures/anima-staging.js'
import {
  enqueueOutpaintConsumerBatch,
  withOutpaintConsumerFixture,
} from './test-fixtures/outpaint-consumers.js'
import { outpaintPngFromAlpha } from './test-fixtures/outpaint-contribution.js'

for (const family of ['illustrious', 'anima'] as const) {
  test(`${family} source-bound RGBA publication survives real queue prune and SQLite reopen`, async () => {
    await withOutpaintConsumerFixture(family, async (fixture) => {
      const { items, stagingSessionId } = await enqueueOutpaintConsumerBatch(fixture)
      const claim = await fixture.queue.claimNextPending()
      assert.equal(claim?.item.id, items[0].id)
      const verified = await fixture.queue.loadVerifiedInput(items[0].id)
      const candidate = await fixture.staging.publishGenerationCandidate({
        ...(await animaProvisionalOutput(fixture, { prefix: `${family}-request-` })),
        actualSeed: verified.payload.workerJob.sampling.seed,
        expectedStatusSequence: claim.item.statusSequence,
        queueItemId: claim.item.id,
      })
      const sessionRoot = path.dirname(path.dirname(candidate.assetPath))
      const sourcePath = path.join(sessionRoot, 'source-target.png')
      assert.deepEqual(await readFile(sourcePath), fixture.outpaintPrepared.targetPngBytes)
      const completed = await fixture.queue.getManagerEntry(claim.item.id)
      await fixture.queue.deleteTerminal(claim.item.id, completed.statusSequence)
      await assert.rejects(readFile(verified.targetPath), { code: 'ENOENT' })
      const database = openAppDatabase(fixture.root, path.resolve('src/main/db/migrations'))
      try {
        const queue = new GenerationQueueRepository(database.db, fixture.root)
        const staging = new GenerationStagingRepository(database.db, fixture.root)
        await queue.recoverAfterRestart()
        assert.deepEqual(await staging.recoverAfterRestart(), {
          invalidCount: 0,
          reconciledCount: 0,
        })
        const visible = await staging.listVerifiedCandidates(candidate.localProjectKey)
        assert.deepEqual(
          visible.map((entry) => entry.candidateId),
          [candidate.candidateId],
        )
        assert.deepEqual(
          await staging.readVerifiedCandidatePng({
            candidateId: candidate.candidateId,
            imageSha256: candidate.image.sha256,
            localProjectKey: candidate.localProjectKey,
            stagingSessionId,
          }),
          fixture.outputBytes,
        )
        await staging.discardSessions(candidate.localProjectKey, [stagingSessionId])
        assert.deepEqual(await staging.listVerifiedCandidates(candidate.localProjectKey), [])
        await assert.rejects(readFile(sourcePath), { code: 'ENOENT' })
      } finally {
        await database.close()
      }
    })
  })

  test(`${family} invalid seed, RGB, polarity, soft alpha and missing ICC fail before receipt`, async () => {
    await withOutpaintConsumerFixture(family, async (fixture) => {
      const { items } = await enqueueOutpaintConsumerBatch(fixture)
      const claim = await fixture.queue.claimNextPending()
      assert.equal(claim?.item.id, items[0].id)
      const seed = fixture.outpaintPrepared.context.sampling.seed
      const { height, width } = fixture.target.bbox
      for (const [label, bytes] of [
        [
          'rgb',
          await outpaintPngFromAlpha(Buffer.alloc(width * height, 255), width, height, {
            channels: 3,
          }),
        ],
        ['wrong-polarity', await outpaintPngFromAlpha(Buffer.alloc(width * height), width, height)],
        [
          'soft-alpha',
          await outpaintPngFromAlpha(Buffer.alloc(width * height, 128), width, height),
        ],
        [
          'missing-icc',
          await outpaintPngFromAlpha(Buffer.alloc(width * height, 255), width, height, {
            icc: false,
          }),
        ],
      ] as const) {
        await assert.rejects(
          fixture.staging.publishGenerationCandidate({
            ...(await animaProvisionalOutput(fixture, { bytes, prefix: `${family}-request-` })),
            actualSeed: seed,
            expectedStatusSequence: claim.item.statusSequence,
            queueItemId: claim.item.id,
          }),
          { code: 'STAGING_OUTPUT_INVALID' },
          label,
        )
        assert.equal(await fixture.staging.hasPublicationReceipt(claim.item.id), false)
      }
      await assert.rejects(
        fixture.staging.publishGenerationCandidate({
          ...(await animaProvisionalOutput(fixture, { prefix: `${family}-request-` })),
          actualSeed: -1,
          expectedStatusSequence: claim.item.statusSequence,
          queueItemId: claim.item.id,
        }),
        { code: 'STAGING_INPUT_INVALID' },
      )
      assert.equal(await fixture.staging.hasPublicationReceipt(claim.item.id), false)
      assert.equal((await fixture.queue.getManagerEntry(claim.item.id)).status, 'running')
    })
  })

  test(`${family} recovered contribution needs independent exact source after queue prune`, async () => {
    await withOutpaintConsumerFixture(family, async (fixture) => {
      const { items } = await enqueueOutpaintConsumerBatch(fixture)
      const claim = await fixture.queue.claimNextPending()
      const candidate = await fixture.staging.publishGenerationCandidate({
        ...(await animaProvisionalOutput(fixture, { prefix: `${family}-request-` })),
        actualSeed: fixture.outpaintPrepared.context.sampling.seed,
        expectedStatusSequence: claim!.item.statusSequence,
        queueItemId: items[0].id,
      })
      const sourcePath = path.join(
        path.dirname(path.dirname(candidate.assetPath)),
        'source-target.png',
      )
      const expected = await readFile(sourcePath)
      const terminal = await fixture.queue.getManagerEntry(candidate.queueItemId)
      await fixture.queue.deleteTerminal(candidate.queueItemId, terminal.statusSequence)
      const modified = Buffer.from(expected)
      modified[modified.length - 1] ^= 1
      await writeFile(sourcePath, modified)
      assert.deepEqual(await fixture.staging.listVerifiedCandidates(candidate.localProjectKey), [])
      await writeFile(sourcePath, expected)
      assert.equal(
        (await fixture.staging.listVerifiedCandidates(candidate.localProjectKey)).length,
        1,
      )
      await rm(sourcePath)
      const outside = path.join(fixture.root, 'external-source.png')
      await writeFile(outside, expected)
      await symlink(outside, sourcePath)
      assert.deepEqual(await fixture.staging.listVerifiedCandidates(candidate.localProjectKey), [])
      await rm(sourcePath)
      await writeFile(sourcePath, expected, { mode: 0o600 })
      assert.equal(
        (await fixture.staging.listVerifiedCandidates(candidate.localProjectKey)).length,
        1,
      )
      await rm(sourcePath)
      const reopened = new GenerationStagingRepository(fixture.database.db, fixture.root)
      assert.deepEqual(await reopened.recoverAfterRestart(), {
        invalidCount: 1,
        reconciledCount: 0,
      })
      assert.deepEqual(await reopened.listVerifiedCandidates(candidate.localProjectKey), [])
    })
  })

  test(`${family} durable source and manifest recover an interrupted completion without queue inputs`, async () => {
    await withOutpaintConsumerFixture(family, async (fixture) => {
      const { items } = await enqueueOutpaintConsumerBatch(fixture)
      const claim = await fixture.queue.claimNextPending()
      const interrupted = new GenerationStagingRepository(fixture.database.db, fixture.root, {
        afterManifestPublish: async () => {
          throw new Error('simulated crash after manifest')
        },
      })
      await interrupted.recoverAfterRestart()
      await assert.rejects(
        interrupted.publishGenerationCandidate({
          ...(await animaProvisionalOutput(fixture, { prefix: `${family}-request-` })),
          actualSeed: fixture.outpaintPrepared.context.sampling.seed,
          expectedStatusSequence: claim!.item.statusSequence,
          queueItemId: items[0].id,
        }),
        /simulated crash/,
      )
      assert.equal(await interrupted.hasPublicationReceipt(items[0].id), true)
      await fixture.queue.recoverAfterRestart()
      const recovered = new GenerationStagingRepository(fixture.database.db, fixture.root)
      assert.deepEqual(await recovered.recoverAfterRestart(), {
        invalidCount: 0,
        reconciledCount: 1,
      })
      const terminal = await fixture.queue.getManagerEntry(items[0].id)
      await fixture.queue.deleteTerminal(items[0].id, terminal.statusSequence)
      assert.equal((await recovered.listVerifiedCandidates(items[0].localProjectKey)).length, 1)
    })
  })

  test(`${family} crash after source fsync publishes no candidate and session tombstone cleans it`, async () => {
    await withOutpaintConsumerFixture(family, async (fixture) => {
      const { items, stagingSessionId } = await enqueueOutpaintConsumerBatch(fixture)
      const claim = await fixture.queue.claimNextPending()
      let sourcePath = ''
      const interrupted = new GenerationStagingRepository(fixture.database.db, fixture.root, {
        afterOutpaintSourcePublish: async () => {
          sourcePath = path.join(
            fixture.root,
            'recovery',
            'generation-staging',
            items[0].localProjectKey,
            stagingSessionId,
            'source-target.png',
          )
          assert.deepEqual(await readFile(sourcePath), fixture.outpaintPrepared.targetPngBytes)
          throw new Error('crash after independent source fsync')
        },
      })
      await interrupted.recoverAfterRestart()
      await assert.rejects(
        interrupted.publishGenerationCandidate({
          ...(await animaProvisionalOutput(fixture, { prefix: `${family}-request-` })),
          actualSeed: fixture.outpaintPrepared.context.sampling.seed,
          expectedStatusSequence: claim!.item.statusSequence,
          queueItemId: items[0].id,
        }),
        /crash after independent source/,
      )
      await fixture.queue.recoverAfterRestart()
      const reopened = new GenerationStagingRepository(fixture.database.db, fixture.root)
      assert.deepEqual(await reopened.recoverAfterRestart(), {
        invalidCount: 0,
        reconciledCount: 0,
      })
      assert.deepEqual(await reopened.listVerifiedCandidates(items[0].localProjectKey), [])
      await reopened.discardSessions(items[0].localProjectKey, [stagingSessionId])
      await assert.rejects(readFile(sourcePath), { code: 'ENOENT' })
      assert.deepEqual(await reopened.listVerifiedCandidates(items[0].localProjectKey), [])
    })
  })

  test(`${family} cancellation after source publication cannot complete receipt, seed or candidate`, async () => {
    await withOutpaintConsumerFixture(family, async (fixture) => {
      const { items, stagingSessionId } = await enqueueOutpaintConsumerBatch(fixture)
      const claim = await fixture.queue.claimNextPending()
      let cancelSequence = -1
      const late = new GenerationStagingRepository(fixture.database.db, fixture.root, {
        afterOutpaintSourcePublish: async () => {
          cancelSequence = (await fixture.queue.cancel(items[0].id)).statusSequence
        },
      })
      await late.recoverAfterRestart()
      await assert.rejects(
        late.publishGenerationCandidate({
          ...(await animaProvisionalOutput(fixture, { prefix: `${family}-request-` })),
          actualSeed: fixture.outpaintPrepared.context.sampling.seed,
          expectedStatusSequence: claim!.item.statusSequence,
          queueItemId: items[0].id,
        }),
        { code: 'STAGING_STATUS_CONFLICT' },
      )
      assert.ok(cancelSequence >= 0)
      await fixture.queue.acknowledgeCanceledRunning(items[0].id, cancelSequence)
      assert.deepEqual(await late.listVerifiedCandidates(items[0].localProjectKey), [])
      assert.equal(
        await late.readLastActualSeed(items[0].localProjectKey, fixture.target.documentId),
        null,
      )
      const receipt = await fixture.database.db
        .selectFrom('generation_candidate_receipt')
        .select('status')
        .where('candidate_id', '=', items[0].id)
        .executeTakeFirstOrThrow()
      assert.equal(receipt.status, 'reserved')
      const reopened = new GenerationStagingRepository(fixture.database.db, fixture.root)
      assert.deepEqual(await reopened.recoverAfterRestart(), {
        invalidCount: 1,
        reconciledCount: 0,
      })
      await reopened.discardSessions(items[0].localProjectKey, [stagingSessionId])
      assert.deepEqual(await reopened.listVerifiedCandidates(items[0].localProjectKey), [])
    })
  })
}
