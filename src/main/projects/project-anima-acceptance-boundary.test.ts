import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'

import type { PreparedNormalTxt2Img } from './project-generation-preparation.js'

import { GenerationAcceptanceJournalRepository } from './generation-acceptance-journal.js'
import { withIllustriousTxt2ImgRequest } from './illustrious-txt2img-job.js'
import { ProjectAutosaveCoordinator, ProjectAutosaveLeaseRegistry } from './project-autosave.js'
import { ProjectGenerationAcceptance } from './project-generation-acceptance.js'
import { ProjectGenerationOperationGate } from './project-generation-operation-gate.js'
import { provenanceFromVerifiedRasterCandidate } from './project-generation-provenance.js'
import { localProjectRecoveryKey } from './project-identity.js'
import { ProjectShadowStore } from './project-shadow.js'
import {
  animaProvisionalOutput,
  type AnimaStagingFixture,
  enqueueAnimaStagingBatch,
  withAnimaStagingFixture,
} from './test-fixtures/anima-staging.js'
import { requireRasterLayer } from './test-fixtures/require-raster-layer.js'

/** Real legacy request + queue + staging, with the same declared tiny exact-file resolver seam. */
async function publishIllustriousNeighbor(fixture: AnimaStagingFixture) {
  const context = fixture.prepared.context
  const prepared: PreparedNormalTxt2Img = {
    context: {
      bbox: context.bbox,
      documentId: context.documentId,
      documentRevision: context.documentRevision,
      kind: 'normal-txt2img-preparation',
      model: {
        managedPath: context.model.checkpoint.managedPath,
        reference: {
          ...context.model.checkpoint.reference,
          baseModelFamily: 'illustrious',
          displayName: 'Tiny Illustrious publication collaborator',
          predictionType: 'epsilon',
        },
      },
      prompts: { negative: 'blur', positive: 'frozen Illustrious neighbor' },
      sampling: {
        cfgScale: 7.5,
        invokeScheduler: 'dpmpp_2m_k',
        requestedSeedPolicy: 'fixed',
        sampler: 'DPM++ 2M',
        scheduler: 'Karras',
        seed: 42,
        steps: 4,
      },
      schemaVersion: 1,
      target: context.target,
    },
    targetPngBytes: fixture.prepared.targetPngBytes,
  }
  return await withIllustriousTxt2ImgRequest({
    modelService: {
      assertNoUnboundGenerationEmbeddings: async () => {},
      resolveVerifiedGenerationCheckpointForPlan: async (reference) => ({
        managedPath: prepared.context.model.managedPath,
        reference,
      }),
      resolveVerifiedGenerationEmbeddingForPlan: async () => {
        throw new Error('This neighbor selects no embeddings.')
      },
      resolveVerifiedGenerationLoraForPlan: async () => {
        throw new Error('This neighbor selects no LoRA.')
      },
      resolveVerifiedGenerationVaeForPlan: async () => {
        throw new Error('This neighbor selects no external VAE.')
      },
    },
    prepared,
    ready: {
      capabilities: ['illustrious-txt2img'],
      protocolVersion: '1',
      runtimeProfile: 'linux-nvidia',
      workerVersion: '0.2.0',
    },
    scratchBasePath: fixture.scratch,
    use: async (request) => {
      const item = await fixture.queue.enqueueIllustriousTxt2Img({
        prepared,
        projectPath: fixture.projectPath,
        request,
        stagingSessionId: randomUUID(),
      })
      const claim = await fixture.queue.claimNextPending()
      assert.equal(claim?.item.id, item.id)
      await writeFile(request.job.output.pngPath, fixture.outputBytes, { mode: 0o600 })
      return await fixture.staging.publishIllustriousTxt2Img({
        actualSeed: 42,
        expectedProvisionalRoot: request.job.output.stagingRoot,
        expectedStatusSequence: claim.item.statusSequence,
        provisionalOutputPath: request.job.output.pngPath,
        queueItemId: item.id,
      })
    },
  })
}

test('real mixed Anima and Illustrious Add validates every selected candidate before journal, document or sibling cancellation and commits one grouped edit', async () => {
  await withAnimaStagingFixture(async (fixture) => {
    const illustrious = await publishIllustriousNeighbor(fixture)
    const first = await enqueueAnimaStagingBatch(fixture)
    const claim = await fixture.queue.claimNextPending()
    assert.ok(claim)
    const anima = await fixture.staging.publishGenerationCandidate({
      ...(await animaProvisionalOutput(fixture)),
      actualSeed: 0,
      expectedStatusSequence: claim.item.statusSequence,
      queueItemId: claim.item.id,
    })
    const siblings = await enqueueAnimaStagingBatch(fixture)
    const key = localProjectRecoveryKey(fixture.projectPath)
    const roots = {
      placeholdersDir: path.resolve('src/main/projects/placeholders'),
      scratchDir: fixture.scratch,
    }
    const owner = await ProjectAutosaveCoordinator.open(
      fixture.projectPath,
      roots,
      new ProjectShadowStore(path.join(fixture.root, 'shadow')),
      { debounceMs: 60_000, leaseRegistry: new ProjectAutosaveLeaseRegistry() },
    )
    const journal = new GenerationAcceptanceJournalRepository(fixture.database.db)
    let fenced = false
    let cancellations = 0
    let discards = 0
    const acceptance = new ProjectGenerationAcceptance({
      documents: { getOpenDocument: (tabId) => (tabId === key ? owner : null) },
      gate: new ProjectGenerationOperationGate(),
      journal,
      now: () => '2026-10-05T12:00:00.000Z',
      orchestrator: {
        cancelAcceptanceJobs: async (_tabId, documentId, sessionIds, ids) => {
          cancellations += 1
          assert.equal(fenced, true)
          assert.equal(documentId, owner.document.documentId)
          for (const id of ids) {
            const item = first.items.find((entry) => entry.id === id)
            assert.ok(item && sessionIds.includes(item.stagingSessionId))
            await fixture.queue.cancel(id, item.statusSequence)
          }
        },
        fenceProjectGeneration: async () => {
          fenced = true
        },
        releaseProjectGenerationFence: () => {
          fenced = false
        },
      },
      queue: fixture.queue,
      staging: {
        discardSessions: async (tabId, sessionIds) => {
          discards += 1
          return await fixture.staging.discardSessions(tabId, sessionIds)
        },
        listVerifiedCandidates: (tabId) => fixture.staging.listVerifiedCandidates(tabId),
        readVerifiedCandidatePng: (input) => fixture.staging.readVerifiedCandidatePng(input),
      },
    })
    try {
      const original = structuredClone(owner.document)
      const beforeRows = await fixture.database.db
        .selectFrom('generation_queue_item')
        .selectAll()
        .orderBy('id')
        .execute()
      const availableIds = [anima.candidateId, illustrious.candidateId]
      const expectedSiblingIds = first.items.slice(1).map((item) => item.id)
      // These jobs share a separate fresh session. They are not siblings of either staged
      // candidate and must never be canceled by acceptance of those previous sessions.
      const unrelatedJobIds = siblings.items.map((item) => item.id)
      // Corrupt the second selected image on the real staging filesystem. A valid first result
      // must not partially commit the grouped Add, cancel siblings, or destroy recovery data.
      await writeFile(anima.assetPath, Buffer.from('corrupt second candidate'))
      for (const ids of [[anima.candidateId], [illustrious.candidateId, anima.candidateId]]) {
        await assert.rejects(
          acceptance.accept(key, ids, ids[0], availableIds, expectedSiblingIds),
          { code: 'ACCEPTANCE_SELECTION_STALE' },
        )
        assert.deepEqual(owner.document, original)
        assert.equal(owner.dirty, false)
        assert.equal(fenced, false)
        assert.equal(cancellations, 0)
        assert.equal(discards, 0)
        assert.equal(await journal.read(key, original.documentId), null)
        assert.deepEqual(
          await fixture.database.db
            .selectFrom('generation_queue_item')
            .selectAll()
            .orderBy('id')
            .execute(),
          beforeRows,
        )
        assert.deepEqual(await fixture.staging.listVerifiedCandidates(key), [illustrious])
        assert.deepEqual(await readFile(anima.assetPath), Buffer.from('corrupt second candidate'))
        assert.deepEqual(await readFile(illustrious.assetPath), fixture.outputBytes)
        assert.deepEqual(await readFile(fixture.projectPath), fixture.originalProjectBytes)
      }
      await writeFile(anima.assetPath, fixture.outputBytes)
      assert.deepEqual(await fixture.staging.listVerifiedCandidates(key), [illustrious, anima])
      const frozenAnima = provenanceFromVerifiedRasterCandidate({
        acceptedAt: '2026-10-05T12:00:00.000Z',
        candidate: anima,
        imagePngBytes: fixture.outputBytes,
      })
      assert.equal(frozenAnima.kind, 'anima-txt2img')
      const accepted = await acceptance.accept(
        key,
        [illustrious.candidateId, anima.candidateId],
        anima.candidateId,
        availableIds,
        expectedSiblingIds,
      )
      assert.equal(accepted.kind, 'accepted')
      assert.equal(owner.document.layers.length, 2)
      assert.equal(
        requireRasterLayer(owner.document.layers[0]).generationProvenance?.kind,
        'illustrious-txt2img',
      )
      assert.equal(
        requireRasterLayer(owner.document.layers[0]).generationProvenance?.executionResultContext
          .candidateId,
        illustrious.candidateId,
      )
      assert.deepEqual(
        requireRasterLayer(owner.document.layers[1]).generationProvenance,
        frozenAnima,
      )
      assert.equal(owner.dirty, true)
      assert.equal(cancellations, 1)
      assert.equal(discards, 1)
      assert.equal(fenced, false)
      await owner.undo()
      assert.equal(owner.document.layers.length, 0, 'mixed Add owns one grouped Undo step')
      await owner.redo()
      assert.deepEqual(
        requireRasterLayer(owner.document.layers[1]).generationProvenance,
        frozenAnima,
      )
      assert.deepEqual(
        (await fixture.queue.listUnfinishedByIds(unrelatedJobIds)).map((item) => item.id).sort(),
        unrelatedJobIds.sort(),
      )
      assert.deepEqual(
        await readFile(fixture.projectPath),
        fixture.originalProjectBytes,
        'Add commits recovery, and explicit Save still owns portable file changes',
      )
    } finally {
      await (owner.dirty ? (await owner.discardChanges(roots)).close() : owner.close())
    }
  })
})
