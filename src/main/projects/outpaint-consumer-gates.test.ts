import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'

import type { GenerationWorkerTransport } from './generation-processor.js'
import type { VerifiedGenerationCandidate } from './generation-staging.js'
import type { OutpaintConsumerFixture } from './test-fixtures/outpaint-consumers.js'

import { GenerationAcceptanceJournalRepository } from './generation-acceptance-journal.js'
import {
  ProjectGenerationActionController,
  toProjectGenerationActionApiError,
} from './generation-action-controller.js'
import { GenerationProcessor } from './generation-processor.js'
import { isQueuedOutpaint, parseFrozenGenerationPayloadV1 } from './generation-queue.js'
import {
  GenerationStagingRepository,
  parseFrozenGenerationCandidatePayloadV1,
} from './generation-staging.js'
import { ProjectAutosaveCoordinator, ProjectAutosaveLeaseRegistry } from './project-autosave.js'
import { ProjectGenerationAcceptance } from './project-generation-acceptance.js'
import { ProjectGenerationOperationGate } from './project-generation-operation-gate.js'
import { provenanceFromVerifiedRasterCandidate } from './project-generation-provenance.js'
import { localProjectRecoveryKey } from './project-identity.js'
import { ProjectShadowStore } from './project-shadow.js'
import { ANIMA_BATCH_READY } from './test-fixtures/anima-batch.js'
import { animaProvisionalOutput, enqueueAnimaStagingBatch } from './test-fixtures/anima-staging.js'
import {
  enqueueOutpaintConsumerBatch,
  withOutpaintConsumerFixture,
} from './test-fixtures/outpaint-consumers.js'

const sha = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex')

function refusingActionOwner(fixture: OutpaintConsumerFixture) {
  const counters = { admitted: 0, canceled: 0, dispatched: 0, drafts: 0 }
  const refusal = async (): Promise<never> => {
    throw new Error('Outpaint must refuse before model resolution or preparation.')
  }
  const key = localProjectRecoveryKey(fixture.projectPath)
  const controller = new ProjectGenerationActionController({
    dispatch: {
      runNext: async () => {
        counters.dispatched++
        return { kind: 'idle' }
      },
      shutdown: async () => {},
    },
    gate: new ProjectGenerationOperationGate(),
    models: {
      ...fixture.outpaintModels,
      resolveVerifiedGenerationAnimaBundleForPlan: refusal,
      resolveVerifiedGenerationCheckpointForPlan: refusal,
    },
    orchestrator: { enqueuePreparedBatch: refusal },
    processor: {
      cancelAndWait: async (id) => {
        counters.canceled++
        return await fixture.queue.cancel(id)
      },
      onChanged: () => () => {},
    },
    projects: {
      getOpenDocumentId: (tabId) => (tabId === key ? fixture.target.documentId : null),
      withCapturedNormalGenerationInput: async () => {
        counters.drafts++
        return await refusal()
      },
    },
    queue: fixture.queue,
    runtime: {
      getStatus: async () => ({}),
      readQualifiedInferenceReady: async () => ANIMA_BATCH_READY,
      withGenerationAdmission: async (_scratch, use) => {
        counters.admitted++
        return await use(ANIMA_BATCH_READY)
      },
      withGenerationPreparation: refusal,
    },
    scratchBasePath: fixture.scratch,
    staging: fixture.staging,
  })
  return { controller, counters }
}

for (const family of ['illustrious', 'anima'] as const) {
  // Boundary: actual queue/preparation/fs/processor + action owner. The transport is controlled;
  // the invariant is no RGB inference/resource/scratch fallthrough and no Retry publication.
  test(`${family} internal outpaint dispatch and public Retry refuse before scratch, resource or worker calls`, async () => {
    await withOutpaintConsumerFixture(family, async (fixture) => {
      const { items } = await enqueueOutpaintConsumerBatch(fixture)
      const scratchBefore = await readdir(fixture.scratch)
      let generated = 0
      let closed = 0
      let resolved = 0
      const refusal = async (): Promise<never> => {
        resolved++
        throw new Error('Outpaint dispatch reached an ordinary model resolver.')
      }
      const processor = new GenerationProcessor(
        fixture.queue,
        fixture.staging,
        {
          ...fixture.outpaintModels,
          resolveVerifiedGenerationAnimaBundleForPlan: refusal,
          resolveVerifiedGenerationCheckpointForPlan: refusal,
        },
        path.join(fixture.scratch, 'unusable-unmaterialized-dispatch-root'),
      )
      const transport: GenerationWorkerTransport = {
        close: async () => {
          closed++
        },
        generate: async () => {
          generated++
          assert.fail('Outpaint was dispatched as ordinary RGB.')
        },
        ready: ANIMA_BATCH_READY,
      }
      assert.deepEqual(await processor.runOne(transport), {
        kind: 'failed',
        queueItemId: items[0].id,
      })
      const failed = await fixture.queue.getManagerEntry(items[0].id)
      assert.equal(failed.operation, `${family}-outpaint`)
      assert.equal(failed.error?.code, 'GENERATION_OUTPAINT_UNAVAILABLE')
      const failureRow = await fixture.database.db
        .selectFrom('generation_queue_item')
        .select('error_message')
        .where('id', '=', failed.id)
        .executeTakeFirstOrThrow()
      assert.match(failureRow.error_message ?? '', /Normal outpaint dispatch/)
      assert.equal(failed.details?.sampling.denoisingStrength, 0.5)
      assert.equal(generated, 0)
      assert.equal(resolved, 0)
      assert.equal(closed, 0)
      assert.deepEqual(await readdir(fixture.scratch), scratchBefore)
      const owner = refusingActionOwner(fixture)
      const before = await fixture.queue.listManagerPage()
      try {
        await assert.rejects(
          owner.controller.retryJob({ id: failed.id, statusSequence: failed.statusSequence }),
          (error: unknown) => {
            assert.equal(
              toProjectGenerationActionApiError(error).code,
              'GENERATION_RUNTIME_UNAVAILABLE',
            )
            return true
          },
        )
        assert.deepEqual(owner.counters, { admitted: 0, canceled: 0, dispatched: 0, drafts: 0 })
        assert.deepEqual(await fixture.queue.listManagerPage(), before)
        assert.deepEqual(await readdir(fixture.scratch), scratchBefore)
        assert.deepEqual(await readFile(fixture.projectPath), fixture.originalProjectBytes)
        assert.equal(await fixture.staging.hasPublicationReceipt(failed.id), false)
      } finally {
        await owner.controller.shutdown()
      }
    })
  })

  // Neighbor: ordinary Anima publication remains genuine. Internal outpaint capacity is only
  // metadata sizing; public parser/publication must refuse even a well-formed persisted payload.
  test(`${family} outpaint capacity is explicit and publication rejects before reading output or reserving a receipt`, async () => {
    await withOutpaintConsumerFixture(family, async (fixture) => {
      const { items } = await enqueueOutpaintConsumerBatch(fixture)
      const verified = await fixture.queue.loadVerifiedInput(items[0].id)
      assert.ok(isQueuedOutpaint(verified.payload))
      assert.equal(
        parseFrozenGenerationPayloadV1(JSON.stringify(verified.payload)).kind,
        `${family}-outpaint`,
      )
      assert.throws(
        () => parseFrozenGenerationCandidatePayloadV1(JSON.stringify(verified.payload)),
        { code: 'STAGING_OUTPAINT_UNAVAILABLE' },
      )
      const preflight = {
        entries: [
          { frozenPayloadJson: JSON.stringify(verified.payload), queueItemId: randomUUID() },
        ],
        localProjectKey: localProjectRecoveryKey(fixture.projectPath),
        projectPath: fixture.projectPath,
        stagingSessionId: randomUUID(),
      }
      const before = await fixture.queue.listManagerPage()
      await fixture.staging.preflightInternalOutpaintBatchCapacity(preflight)
      await assert.rejects(fixture.staging.preflightBatchCapacity(preflight), {
        code: 'STAGING_OUTPAINT_UNAVAILABLE',
      })
      const collateral = { ...preflight, stagingSessionId: items[0].stagingSessionId }
      await assert.rejects(fixture.staging.preflightInternalOutpaintBatchCapacity(collateral), {
        code: 'STAGING_INPUT_INVALID',
      })
      assert.deepEqual(await fixture.queue.listManagerPage(), before)
      const claimed = await fixture.queue.claimNextPending()
      assert.equal(claimed?.item.id, items[0].id)
      const files = await readdir(fixture.scratch)
      await assert.rejects(
        fixture.staging.publishGenerationCandidate({
          actualSeed: 0,
          expectedProvisionalRoot: path.join(fixture.scratch, 'never-materialized'),
          expectedStatusSequence: claimed.item.statusSequence,
          provisionalOutputPath: path.join(fixture.scratch, 'never-materialized', 'result.png'),
          queueItemId: claimed.item.id,
        }),
        { code: 'STAGING_OUTPAINT_UNAVAILABLE' },
      )
      assert.equal(await fixture.staging.hasPublicationReceipt(claimed.item.id), false)
      assert.equal((await fixture.queue.getManagerEntry(claimed.item.id)).status, 'running')
      assert.deepEqual(await readdir(fixture.scratch), files)
      const canceled = await fixture.queue.cancel(claimed.item.id)
      await fixture.queue.acknowledgeCanceledRunning(claimed.item.id, canceled.statusSequence)
      const ordinary = await enqueueAnimaStagingBatch(fixture)
      const ordinaryClaim = await fixture.queue.claimNextPending()
      assert.equal(ordinaryClaim?.item.id, ordinary.items[0].id)
      const ordinaryFrozen = await fixture.queue.loadVerifiedInput(ordinary.items[0].id)
      await assert.rejects(
        fixture.staging.preflightInternalOutpaintBatchCapacity({
          ...preflight,
          entries: [
            {
              frozenPayloadJson: JSON.stringify(ordinaryFrozen.payload),
              queueItemId: randomUUID(),
            },
          ],
        }),
        { code: 'STAGING_INPUT_INVALID' },
      )
      const candidate = await fixture.staging.publishGenerationCandidate({
        ...(await animaProvisionalOutput(fixture)),
        actualSeed: 0,
        expectedStatusSequence: ordinaryClaim.item.statusSequence,
        queueItemId: ordinaryClaim.item.id,
      })
      assert.equal(candidate.actualSeed, 0)
      assert.equal(
        (await fixture.staging.listVerifiedCandidates(candidate.localProjectKey)).length,
        1,
      )
    })
  })

  test(`${family} injected outpaint candidates cannot form provenance or mutate Add, journal, cancellation and cleanup`, async () => {
    await withOutpaintConsumerFixture(family, async (fixture) => {
      const { items } = await enqueueOutpaintConsumerBatch(fixture)
      const frozen = await fixture.queue.loadVerifiedInput(items[0].id)
      const json = JSON.stringify(frozen.payload)
      const candidate: VerifiedGenerationCandidate = {
        actualSeed: 0,
        assetPath: path.join(fixture.root, 'unread-output.png'),
        bbox: fixture.target.bbox,
        candidateId: items[0].id,
        completedAt: '2026-10-06T12:00:00.000Z',
        completionOrder: 1,
        documentId: fixture.target.documentId,
        documentRevision: fixture.target.documentRevision,
        frozenPayloadJson: json,
        frozenPayloadSha256: sha(json),
        image: {
          ...frozen.payload.context.target,
          byteSize: fixture.outputBytes.length,
          sha256: sha(fixture.outputBytes),
        },
        localProjectKey: items[0].localProjectKey,
        projectPath: fixture.projectPath,
        queueItemId: items[0].id,
        stagingSessionId: items[0].stagingSessionId,
      }
      assert.throws(
        () =>
          provenanceFromVerifiedRasterCandidate({
            acceptedAt: '2026-10-06T12:01:00.000Z',
            candidate,
            imagePngBytes: fixture.outputBytes,
          }),
        { code: 'PROVENANCE_MODEL_UNSUPPORTED' },
      )
      const owner = await ProjectAutosaveCoordinator.open(
        fixture.projectPath,
        {
          placeholdersDir: path.resolve('src/main/projects/placeholders'),
          scratchDir: fixture.scratch,
        },
        new ProjectShadowStore(path.join(fixture.root, 'shadow')),
        { debounceMs: 60_000, leaseRegistry: new ProjectAutosaveLeaseRegistry() },
      )
      const journal = new GenerationAcceptanceJournalRepository(fixture.database.db)
      const calls = { canceled: 0, discarded: 0, journaled: 0, readPixels: 0 }
      const acceptance = new ProjectGenerationAcceptance({
        documents: { getOpenDocument: () => owner },
        gate: new ProjectGenerationOperationGate(),
        journal: {
          abandon: async (handoff) => {
            calls.journaled++
            await journal.abandon(handoff)
          },
          complete: async (handoff) => {
            calls.journaled++
            await journal.complete(handoff)
          },
          read: async (key, id) => {
            calls.journaled++
            return await journal.read(key, id)
          },
          record: async (handoff) => {
            calls.journaled++
            await journal.record(handoff)
          },
        },
        orchestrator: {
          cancelAcceptanceJobs: async () => {
            calls.canceled++
          },
          fenceProjectGeneration: async () => {},
          releaseProjectGenerationFence: () => {},
        },
        queue: fixture.queue,
        staging: {
          discardSessions: async (key, sessions) => {
            calls.discarded++
            return await fixture.staging.discardSessions(key, sessions)
          },
          listVerifiedCandidates: async () => [candidate], // Malicious future consumer, not real staging publication.
          readVerifiedCandidatePng: async () => {
            calls.readPixels++
            return fixture.outputBytes
          },
        },
      })
      try {
        const original = owner.document
        await assert.rejects(
          acceptance.accept(
            candidate.localProjectKey,
            [candidate.candidateId],
            null,
            [candidate.candidateId],
            [items[0].id],
          ),
          { code: 'ACCEPTANCE_OUTPAINT_UNAVAILABLE' },
        )
        assert.deepEqual(calls, { canceled: 0, discarded: 0, journaled: 0, readPixels: 0 })
        assert.deepEqual(owner.document, original)
        assert.equal(owner.dirty, false)
        assert.equal(await journal.read(candidate.localProjectKey, candidate.documentId), null)
        assert.equal((await fixture.queue.getManagerEntry(items[0].id)).status, 'pending')
        assert.deepEqual(await readFile(fixture.projectPath), fixture.originalProjectBytes)
      } finally {
        await owner.close()
      }
    })
  })

  test(`${family} completed and restart-reserved outpaint manifests stay hidden while ordinary historical candidates recover`, async () => {
    await withOutpaintConsumerFixture(family, async (fixture) => {
      const ordinary = await enqueueAnimaStagingBatch(fixture)
      const claim = await fixture.queue.claimNextPending()
      assert.equal(claim?.item.id, ordinary.items[0].id)
      const neighbor = await fixture.staging.publishGenerationCandidate({
        ...(await animaProvisionalOutput(fixture)),
        actualSeed: 0,
        expectedStatusSequence: claim.item.statusSequence,
        queueItemId: claim.item.id,
      })
      const parent = path.dirname(path.dirname(path.dirname(neighbor.assetPath)))
      const sourceManifest = JSON.parse(
        await readFile(
          path.join(path.dirname(path.dirname(neighbor.assetPath)), 'manifest.json'),
          'utf8',
        ),
      ) as { candidates: Record<string, unknown>[] }
      const receipt = await fixture.database.db
        .selectFrom('generation_candidate_receipt')
        .selectAll()
        .where('candidate_id', '=', neighbor.candidateId)
        .executeTakeFirstOrThrow()
      const key = neighbor.localProjectKey
      for (const status of ['completed', 'reserved'] as const) {
        const { items, stagingSessionId } = await enqueueOutpaintConsumerBatch(fixture)
        const claimed = await fixture.queue.claimNextPending()
        assert.equal(claimed?.item.id, items[0].id)
        const frozen = await fixture.queue.loadVerifiedInput(items[0].id)
        const json = JSON.stringify(frozen.payload)
        const sessionRoot = path.join(parent, stagingSessionId)
        await mkdir(path.join(sessionRoot, 'assets'), { mode: 0o700, recursive: true })
        await copyFile(neighbor.assetPath, path.join(sessionRoot, 'assets', `${items[0].id}.png`))
        const entry = {
          ...sourceManifest.candidates[0],
          actualSeed: status === 'completed' ? 79 : 93,
          candidateId: items[0].id,
          completionOrder: status === 'completed' ? 2 : 3,
          expectedStatusSequence: claimed.item.statusSequence,
          frozenPayloadJson: json,
          frozenPayloadSha256: sha(json),
          image: { ...neighbor.image, relativePath: `assets/${items[0].id}.png` },
          queueItemId: items[0].id,
          stagingSessionId,
        }
        await writeFile(
          path.join(sessionRoot, 'manifest.json'),
          JSON.stringify({
            candidates: [entry],
            localProjectKey: key,
            schemaVersion: 1,
            stagingSessionId,
          }),
          { mode: 0o600 },
        )
        await fixture.database.db
          .insertInto('generation_candidate_receipt')
          .values({
            ...receipt,
            actual_seed: status === 'completed' ? 79 : 93,
            candidate_id: items[0].id,
            completed_at: status === 'completed' ? receipt.completed_at : null,
            completion_order: status === 'completed' ? 2 : 3,
            expected_status_sequence: claimed.item.statusSequence,
            frozen_payload_sha256: sha(json),
            queue_item_id: items[0].id,
            staging_session_id: stagingSessionId,
            status,
          })
          .execute()
        await (status === 'completed'
          ? fixture.database.db
              .updateTable('generation_queue_item')
              .set({
                finished_at: receipt.completed_at,
                status: 'completed',
                status_sequence: claimed.item.statusSequence + 1,
              })
              .where('id', '=', items[0].id)
              .execute()
          : fixture.queue.recoverAfterRestart())
      }
      const reopened = new GenerationStagingRepository(fixture.database.db, fixture.root)
      const recovered = await reopened.recoverAfterRestart()
      assert.equal(recovered.invalidCount, 2)
      assert.equal(recovered.reconciledCount, 0)
      assert.deepEqual(
        (await reopened.listVerifiedCandidates(key)).map((candidate) => candidate.candidateId),
        [neighbor.candidateId],
      )
      assert.equal(await reopened.readLastActualSeed(key, fixture.target.documentId), 0)
      assert.deepEqual(
        await reopened.readVerifiedCandidatePng({
          candidateId: neighbor.candidateId,
          imageSha256: neighbor.image.sha256,
          localProjectKey: key,
          stagingSessionId: neighbor.stagingSessionId,
        }),
        fixture.outputBytes,
      )
      assert.deepEqual(await readFile(fixture.projectPath), fixture.originalProjectBytes)
    })
  })
}
