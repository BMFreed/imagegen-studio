import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'

import type { PreparedOutpaintGeneration } from './generation-queue.js'

import { GenerationAcceptanceJournalRepository } from './generation-acceptance-journal.js'
import { GenerationStagingRepository } from './generation-staging.js'
import { readIgsPackage } from './igs-package.js'
import { ProjectAutosaveCoordinator, ProjectAutosaveLeaseRegistry } from './project-autosave.js'
import { ProjectGenerationAcceptance } from './project-generation-acceptance.js'
import { ProjectGenerationOperationGate } from './project-generation-operation-gate.js'
import { prepareNormalOutpaintGeneration } from './project-generation-preparation.js'
import { ProjectSession } from './project-session.js'
import { ProjectShadowStore } from './project-shadow.js'
import { animaFixturePng } from './test-fixtures/anima-batch.js'
import { animaProvisionalOutput } from './test-fixtures/anima-staging.js'
import {
  enqueueOutpaintConsumerBatch,
  type OutpaintConsumerFixture,
  withOutpaintConsumerFixture,
} from './test-fixtures/outpaint-consumers.js'
import { requireRasterLayer } from './test-fixtures/require-raster-layer.js'

async function publish(
  fixture: OutpaintConsumerFixture,
  items: readonly PreparedOutpaintGeneration[] = [fixture.outpaintPrepared],
) {
  const batch = await enqueueOutpaintConsumerBatch(fixture, { items })
  const candidates = []
  for (const item of batch.items) {
    const claim = await fixture.queue.claimNextPending()
    assert.ok(claim)
    assert.equal(claim.item.id, item.id)
    const output = await animaProvisionalOutput(fixture, {
      prefix: claim.payload.kind.startsWith('anima') ? 'anima-request-' : 'illustrious-request-',
    })
    const candidate = await fixture.staging.publishGenerationCandidate({
      ...output,
      actualSeed: claim.payload.workerJob.sampling.seed,
      expectedStatusSequence: claim.item.statusSequence,
      queueItemId: claim.item.id,
    })
    const completed = await fixture.queue.getManagerEntry(item.id)
    assert.equal(completed.status, 'completed')
    await fixture.queue.deleteTerminal(item.id, completed.statusSequence)
    candidates.push(candidate)
  }
  return candidates
}

function ownerOptions(fixture: OutpaintConsumerFixture) {
  const roots = {
    placeholdersDir: path.resolve('src/main/projects/placeholders'),
    scratchDir: fixture.scratch,
  }
  const shadow = new ProjectShadowStore(path.join(fixture.root, 'outpaint-shadow'))
  return { roots, shadow }
}

for (const family of ['illustrious', 'anima'] as const) {
  test(`${family} pruned-queue contribution recovers, Adds, Undoes/Redoes and Saves exact frozen provenance through real owners`, async () => {
    await withOutpaintConsumerFixture(family, async (fixture) => {
      const [candidate] = await publish(fixture)
      const staging = new GenerationStagingRepository(fixture.database.db, fixture.root)
      assert.equal((await staging.recoverAfterRestart()).invalidCount, 0)
      assert.deepEqual(await staging.listVerifiedCandidates(candidate.localProjectKey), [candidate])
      const { roots, shadow } = ownerOptions(fixture)
      let owner = await ProjectAutosaveCoordinator.open(fixture.projectPath, roots, shadow, {
        debounceMs: 60_000,
        leaseRegistry: new ProjectAutosaveLeaseRegistry(),
      })
      let recovered: ProjectAutosaveCoordinator | undefined
      try {
        const before = owner.document
        const later = structuredClone(before)
        later.generationDraft.positivePrompt.text = '{later|edited} draft'
        await owner.applyDocument(later, {}, { expectedDocumentRevision: before.documentRevision })
        const current = structuredClone(owner.document)
        const journal = new GenerationAcceptanceJournalRepository(fixture.database.db)
        const acceptance = new ProjectGenerationAcceptance({
          documents: { getOpenDocument: () => owner },
          gate: new ProjectGenerationOperationGate(),
          journal,
          orchestrator: {
            cancelAcceptanceJobs: async () => {
              throw new Error('No jobs remain after prune.')
            },
            fenceProjectGeneration: async () => {},
            releaseProjectGenerationFence: () => {},
          },
          queue: fixture.queue,
          staging,
        })
        const result = await acceptance.accept(
          candidate.localProjectKey,
          [candidate.candidateId],
          null,
          [candidate.candidateId],
        )
        assert.equal(result.kind, 'accepted')
        assert.equal(owner.document.layers.length, 1)
        const layer = owner.document.layers[0]
        const provenance = structuredClone(requireRasterLayer(layer).generationProvenance!)
        assert.equal(provenance.kind, `${family}-outpaint`)
        assert.ok(
          provenance.kind === 'anima-outpaint' || provenance.kind === 'illustrious-outpaint',
        )
        assert.equal(provenance.generationConfiguration.mode, 'outpaint')
        assert.equal(provenance.generationConfiguration.sampling.actualSeed, candidate.actualSeed)
        assert.equal(
          provenance.generationConfiguration.positivePrompt.text,
          'frozen outpaint (cat:1.5)',
        )
        assert.equal(provenance.executionResultContext.output.outputMode, 'contribution')
        assert.equal(provenance.layerSourceContext.outpaint.keepMask.byteSize, 64 * 64)
        assert.equal(JSON.stringify(provenance).includes(fixture.root), false)
        assert.equal(JSON.stringify(provenance).includes('nativePlan'), false)
        assert.deepEqual(owner.document.primaryBbox, current.primaryBbox)
        assert.equal(requireRasterLayer(layer).transform.x, candidate.bbox.x)
        assert.equal(requireRasterLayer(layer).transform.y, candidate.bbox.y)
        assert.equal(owner.document.generationDraft.positivePrompt.text, '{later|edited} draft')
        assert.deepEqual(await readFile(fixture.projectPath), fixture.originalProjectBytes)
        await owner.undo()
        assert.equal(owner.document.layers.length, 0)
        assert.equal(owner.document.generationDraft.positivePrompt.text, '{later|edited} draft')
        await owner.redo()
        assert.deepEqual(
          requireRasterLayer(owner.document.layers[0]).generationProvenance,
          provenance,
        )
        await owner.flush()
        const recovery = await ProjectAutosaveCoordinator.inspectRecovery(
          fixture.projectPath,
          shadow,
        )
        assert.equal(recovery.status, 'recoverable')
        if (recovery.status === 'recoverable') {
          assert.deepEqual(
            requireRasterLayer(recovery.document.layers[0]).generationProvenance,
            provenance,
          )
        }
        // A fresh lease registry explicitly simulates a new Main process after a crash.
        recovered = await ProjectAutosaveCoordinator.recover(fixture.projectPath, roots, shadow, {
          debounceMs: 60_000,
          leaseRegistry: new ProjectAutosaveLeaseRegistry(),
        })
        assert.deepEqual(
          requireRasterLayer(recovered.document.layers[0]).generationProvenance,
          provenance,
        )
        assert.equal((await recovered.save()).committed, true)
        const saved = await readIgsPackage(fixture.projectPath)
        assert.deepEqual(
          requireRasterLayer(saved.project.layers[0]).generationProvenance,
          provenance,
        )
        assert.deepEqual(
          await saved.readMember(requireRasterLayer(layer).asset.path),
          fixture.outputBytes,
        )
        assert.deepEqual(
          requireRasterLayer(
            (await ProjectSession.open(fixture.projectPath, roots)).document.layers[0],
          ).generationProvenance,
          provenance,
        )
        assert.deepEqual(await staging.listVerifiedCandidates(candidate.localProjectKey), [])
        assert.equal(await journal.read(candidate.localProjectKey, candidate.documentId), null)
      } finally {
        if (recovered) {
          if (recovered.dirty) {
            recovered = await recovered.discardChanges(roots)
          }
          await recovered.close()
        }
        if (owner.dirty) {
          owner = await owner.discardChanges(roots)
        }
        await owner.close()
      }
    })
  })

  test(`${family} a later selected corrupt contribution refuses all Add effects and retains its valid neighbor`, async () => {
    await withOutpaintConsumerFixture(family, async (fixture) => {
      const [good, bad] = await publish(fixture, [
        fixture.outpaintPrepared,
        fixture.outpaintPrepared,
      ])
      const { roots, shadow } = ownerOptions(fixture)
      const owner = await ProjectAutosaveCoordinator.open(fixture.projectPath, roots, shadow, {
        debounceMs: 60_000,
        leaseRegistry: new ProjectAutosaveLeaseRegistry(),
      })
      try {
        const original = structuredClone(owner.document)
        await writeFile(bad.assetPath, await animaFixturePng(0))
        const journal = new GenerationAcceptanceJournalRepository(fixture.database.db)
        const calls = { canceled: 0, discarded: 0, journaled: 0 }
        const acceptance = new ProjectGenerationAcceptance({
          documents: { getOpenDocument: () => owner },
          gate: new ProjectGenerationOperationGate(),
          journal: {
            ...journal,
            abandon: async () => {
              calls.journaled++
            },
            complete: async () => {
              calls.journaled++
            },
            read: journal.read.bind(journal),
            record: async () => {
              calls.journaled++
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
            discardSessions: async (projectKey, sessionIds) => {
              calls.discarded++
              return await fixture.staging.discardSessions(projectKey, sessionIds)
            },
            listVerifiedCandidates: fixture.staging.listVerifiedCandidates.bind(fixture.staging),
            readVerifiedCandidatePng: fixture.staging.readVerifiedCandidatePng.bind(
              fixture.staging,
            ),
          },
        })
        await assert.rejects(
          acceptance.accept(good.localProjectKey, [good.candidateId, bad.candidateId], null, [
            good.candidateId,
            bad.candidateId,
          ]),
          { code: 'ACCEPTANCE_SELECTION_STALE' },
        )
        assert.deepEqual(calls, { canceled: 0, discarded: 0, journaled: 0 })
        assert.deepEqual(owner.document, original)
        assert.equal(owner.dirty, false)
        assert.equal(await journal.read(good.localProjectKey, good.documentId), null)
        assert.deepEqual(await readFile(fixture.projectPath), fixture.originalProjectBytes)
        assert.deepEqual(
          (await fixture.staging.listVerifiedCandidates(good.localProjectKey)).map(
            (candidate) => candidate.candidateId,
          ),
          [good.candidateId],
        )
        await writeFile(bad.assetPath, fixture.outputBytes)
        assert.equal((await fixture.staging.listVerifiedCandidates(good.localProjectKey)).length, 2)
      } finally {
        await owner.close()
      }
    })
  })
}

test('mixed-family outpaint candidates from independent batches Add as one grouped Project mutation', async () => {
  await withOutpaintConsumerFixture('anima', async (fixture) => {
    const target = structuredClone(fixture.target)
    target.generationDraft.model = {
      ...fixture.prepared.context.model.checkpoint.reference,
      baseModelFamily: 'illustrious',
      predictionType: 'epsilon',
    }
    const opposite = await prepareNormalOutpaintGeneration({
      modelService: fixture.outpaintModels,
      target,
    })
    const [anima] = await publish(fixture)
    const [illustrious] = await publish(fixture, [opposite])
    const { roots, shadow } = ownerOptions(fixture)
    let owner = await ProjectAutosaveCoordinator.open(fixture.projectPath, roots, shadow, {
      debounceMs: 60_000,
      leaseRegistry: new ProjectAutosaveLeaseRegistry(),
    })
    try {
      const acceptance = new ProjectGenerationAcceptance({
        documents: { getOpenDocument: () => owner },
        gate: new ProjectGenerationOperationGate(),
        journal: new GenerationAcceptanceJournalRepository(fixture.database.db),
        orchestrator: {
          cancelAcceptanceJobs: async () => {
            throw new Error('No unfinished work.')
          },
          fenceProjectGeneration: async () => {},
          releaseProjectGenerationFence: () => {},
        },
        queue: fixture.queue,
        staging: fixture.staging,
      })
      const ids = [anima.candidateId, illustrious.candidateId]
      assert.equal(
        (await acceptance.accept(anima.localProjectKey, ids, illustrious.candidateId, ids)).kind,
        'accepted',
      )
      assert.deepEqual(
        owner.document.layers.map((layer) => requireRasterLayer(layer).generationProvenance?.kind),
        ['anima-outpaint', 'illustrious-outpaint'],
      )
      assert.deepEqual(
        owner.document.layers.map((layer) => layer.visible),
        [false, true],
      )
      const frozen = structuredClone(owner.document.layers)
      await owner.undo()
      assert.equal(owner.document.layers.length, 0)
      await owner.redo()
      assert.deepEqual(owner.document.layers, frozen)
      assert.equal((await owner.save()).committed, true)
      assert.deepEqual((await readIgsPackage(fixture.projectPath)).project.layers, frozen)
    } finally {
      if (owner.dirty) {
        owner = await owner.discardChanges(roots)
      }
      await owner.close()
    }
  })
})
