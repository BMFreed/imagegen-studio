import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { copyFile, readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'

import type { ProjectGenerationAcceptanceOptions } from './project-generation-acceptance.js'
import type { AnimaStagingFixture } from './test-fixtures/anima-staging.js'

import { GenerationAcceptanceJournalRepository } from './generation-acceptance-journal.js'
import { readIgsPackage } from './igs-package.js'
import { projectAcceptedResults } from './project-accepted-results.js'
import { ProjectAutosaveCoordinator, ProjectAutosaveLeaseRegistry } from './project-autosave.js'
import { ProjectGenerationAcceptance } from './project-generation-acceptance.js'
import { ProjectGenerationOperationGate } from './project-generation-operation-gate.js'
import { provenanceFromVerifiedRasterCandidate } from './project-generation-provenance.js'
import { localProjectRecoveryKey } from './project-identity.js'
import { ProjectIndexRepository } from './project-index.js'
import { ProjectSession } from './project-session.js'
import { ProjectShadowStore } from './project-shadow.js'
import {
  animaProvisionalOutput,
  enqueueAnimaStagingBatch,
  withAnimaStagingFixture,
} from './test-fixtures/anima-staging.js'
import { requireRasterLayer } from './test-fixtures/require-raster-layer.js'

const rootsFor = (fixture: AnimaStagingFixture) => ({
  placeholdersDir: path.resolve('src/main/projects/placeholders'),
  scratchDir: fixture.scratch,
})

async function stagedResult(fixture: AnimaStagingFixture, actualSeed: number) {
  fixture.prepared.context.sampling.animaMethod = 'heun'
  fixture.prepared.context.generationDraft.sampling.animaMethod = 'heun'
  fixture.prepared.context.generationDraft.cfgRescale = 0
  fixture.prepared.context.generationDraft.vaePrecision = 'Auto'
  fixture.prepared.context.generationDraft.loras.push({
    enabled: false,
    resource: {
      ...fixture.prepared.context.model.checkpoint.reference,
      baseModelFamily: 'illustrious',
      displayName: 'Disabled missing neighboring family LoRA',
      kind: 'lora',
      predictionType: 'v_prediction',
    },
    weight: -0.7,
  })
  const batch = await enqueueAnimaStagingBatch(fixture)
  const claim = await fixture.queue.claimNextPending()
  assert.ok(claim)
  const candidate = await fixture.staging.publishGenerationCandidate({
    ...(await animaProvisionalOutput(fixture)),
    actualSeed,
    expectedStatusSequence: claim.item.statusSequence,
    queueItemId: claim.item.id,
  })
  const expected = provenanceFromVerifiedRasterCandidate({
    acceptedAt: '2026-10-05T13:00:00.000Z',
    candidate,
    imagePngBytes: fixture.outputBytes,
  })
  assert.ok(expected.kind === 'anima-img2img' || expected.kind === 'anima-txt2img')
  const source = JSON.parse(candidate.frozenPayloadJson).context
  assert.equal(
    expected.generationConfiguration.model.fileSha256,
    source.model.checkpoint.reference.fileSha256,
  )
  assert.equal(
    expected.generationConfiguration.anima.checkpointByteSize,
    source.model.checkpoint.byteSize,
  )
  for (const role of ['qwen3Encoder', 'vae'] as const) {
    const component = source.model[role]
    assert.deepEqual(expected.generationConfiguration.anima[role], {
      byteSize: component.byteSize,
      localModelId: component.localModelId,
      localVersionId: component.localVersionId,
      sha256: component.sha256,
    })
  }
  assert.deepEqual(expected.generationConfiguration.loras, source.loraStack)
  assert.deepEqual(expected.generationConfiguration.positivePrompt, {
    embeddingRefs: [],
    text: source.prompts.positive,
  })
  assert.deepEqual(expected.generationConfiguration.negativePrompt, {
    embeddingRefs: [],
    text: source.prompts.negative,
  })
  assert.equal(expected.generationConfiguration.sampling.actualSeed, actualSeed)
  assert.equal(expected.generationConfiguration.sampling.animaMethod, 'heun')
  const portable = JSON.stringify(expected)
  for (const excluded of [
    fixture.root,
    'managedPath',
    'cleanedText',
    'posteriorSeed',
    'regionalGuidance',
    'sampler',
    'invokeScheduler',
  ]) {
    assert.equal(portable.includes(excluded), false, excluded)
  }
  return { batch, candidate, expected }
}

async function acceptanceOwner(fixture: AnimaStagingFixture) {
  const key = localProjectRecoveryKey(fixture.projectPath)
  const roots = rootsFor(fixture)
  const shadow = new ProjectShadowStore(path.join(fixture.root, 'accepted-shadow'))
  let owner = await ProjectAutosaveCoordinator.open(fixture.projectPath, roots, shadow, {
    debounceMs: 60_000,
    leaseRegistry: new ProjectAutosaveLeaseRegistry(),
  })
  const owners = [owner]
  const journal = new GenerationAcceptanceJournalRepository(fixture.database.db)
  let fenced = false
  const options: ProjectGenerationAcceptanceOptions = {
    documents: { getOpenDocument: (tabId) => (tabId === key ? owner : null) },
    gate: new ProjectGenerationOperationGate(),
    journal,
    now: () => '2026-10-05T13:00:00.000Z',
    orchestrator: {
      cancelAcceptanceJobs: async (_tabId, documentId, sessionIds, ids) => {
        assert.equal(fenced, true)
        for (const id of ids) {
          const [item] = await fixture.queue.listUnfinishedByIds([id])
          assert.ok(item && sessionIds.includes(item.stagingSessionId))
          assert.equal(
            (await fixture.queue.loadVerifiedInput(id)).payload.context.documentId,
            documentId,
          )
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
    staging: fixture.staging,
  }
  return {
    async close() {
      for (const item of [...owners].reverse()) {
        await (item.dirty ? (await item.discardChanges(roots)).close() : item.close())
      }
    },
    journal,
    key,
    options,
    get owner() {
      return owner
    },
    async recover() {
      owner = await ProjectAutosaveCoordinator.recover(fixture.projectPath, roots, shadow, {
        debounceMs: 60_000,
        leaseRegistry: new ProjectAutosaveLeaseRegistry(),
      })
      owners.push(owner)
    },
    roots,
    shadow,
  }
}

for (const opaque of [false, true]) {
  test(`real Anima ${opaque ? 'img2img' : 'txt2img'} Add preserves frozen portable settings through grouped Undo, shadow Recover, explicit Save/reopen and derived history`, async () => {
    await withAnimaStagingFixture(
      async (fixture) => {
        const actualSeed = opaque ? 0 : 57
        const { batch, candidate, expected } = await stagedResult(fixture, actualSeed)
        const state = await acceptanceOwner(fixture)
        try {
          const index = new ProjectIndexRepository(fixture.database.db)
          const workspaceId = 'accepted-native-fixture'
          await fixture.database.db
            .insertInto('project_workspace')
            .values({
              color: 'teal',
              created_at: '2026-10-05T13:00:00.000Z',
              directory_path: fixture.root,
              display_name: 'Native accepted test workspace',
              id: workspaceId,
              is_default: 0,
              updated_at: '2026-10-05T13:00:00.000Z',
            })
            .execute()
          await index.indexSaved(fixture.projectPath, workspaceId)
          assert.deepEqual(await index.listSavedAcceptedResults(state.key), [])
          const lateDraft = structuredClone(state.owner.document)
          lateDraft.generationDraft.model = {
            ...fixture.prepared.context.model.checkpoint.reference,
          }
          lateDraft.generationDraft.positivePrompt.text = 'later Project prompt'
          lateDraft.generationDraft.negativePrompt.text = 'later negative'
          lateDraft.generationDraft.sampling.animaMethod = 'lcm'
          lateDraft.generationDraft.seed = { policy: 'fixed', value: 999 }
          await state.owner.applyDocument(lateDraft)
          const unfinished = batch.items.slice(1).map((item) => item.id)
          const accepted = await new ProjectGenerationAcceptance(state.options).accept(
            state.key,
            [candidate.candidateId],
            candidate.candidateId,
            [candidate.candidateId],
            unfinished,
          )
          assert.equal(accepted.kind, 'accepted')
          assert.deepEqual(
            requireRasterLayer(state.owner.document.layers[0]).generationProvenance,
            expected,
          )
          assert.equal(
            state.owner.document.generationDraft.positivePrompt.text,
            'later Project prompt',
          )
          assert.deepEqual(await readFile(fixture.projectPath), fixture.originalProjectBytes)
          assert.deepEqual(await fixture.staging.listVerifiedCandidates(state.key), [])
          assert.deepEqual(
            await index.listSavedAcceptedResults(state.key),
            [],
            'unsaved accepted state is not the saved global index',
          )
          assert.equal(projectAcceptedResults(state.key, state.owner.document)[0].seed, actualSeed)
          await state.owner.undo()
          assert.equal(state.owner.document.layers.length, 0)
          assert.equal(
            state.owner.document.generationDraft.positivePrompt.text,
            'later Project prompt',
          )
          await state.owner.redo()
          assert.deepEqual(
            requireRasterLayer(state.owner.document.layers[0]).generationProvenance,
            expected,
          )
          assert.deepEqual(
            await fixture.staging.listVerifiedCandidates(state.key),
            [],
            'document Undo does not resurrect staging',
          )
          await state.owner.flush()
          const recovery = await ProjectAutosaveCoordinator.inspectRecovery(
            fixture.projectPath,
            state.shadow,
          )
          assert.equal(recovery.status, 'recoverable')
          if (recovery.status === 'recoverable') {
            assert.deepEqual(
              requireRasterLayer(recovery.document.layers[0]).generationProvenance,
              expected,
            )
          }
          await state.recover()
          assert.deepEqual(
            requireRasterLayer(state.owner.document.layers[0]).generationProvenance,
            expected,
          )
          assert.equal((await state.owner.save()).committed, true)
          const saved = await readIgsPackage(fixture.projectPath)
          assert.deepEqual(
            requireRasterLayer(saved.project.layers[0]).generationProvenance,
            expected,
          )
          assert.equal(saved.project.generationDraft.sampling.animaMethod, 'lcm')
          const reopened = await ProjectSession.open(fixture.projectPath, state.roots)
          assert.deepEqual(
            requireRasterLayer(reopened.document.layers[0]).generationProvenance,
            expected,
          )
          await index.indexSaved(fixture.projectPath, workspaceId)
          const rows = await index.listSavedAcceptedResults(state.key)
          assert.equal(rows.length, 1)
          assert.equal(rows[0].actualSeed, actualSeed)
          assert.equal(rows[0].modelFileSha256, expected.generationConfiguration.model.fileSha256)
          assert.equal(
            rows[0].assetSha256,
            createHash('sha256').update(fixture.outputBytes).digest('hex'),
          )
          assert.equal(projectAcceptedResults(state.key, reopened.document)[0].seed, actualSeed)
          const copyPath = path.join(fixture.root, 'Portable Anima copy.igs')
          await copyFile(fixture.projectPath, copyPath)
          const copy = await ProjectSession.open(copyPath, state.roots)
          assert.deepEqual(
            requireRasterLayer(copy.document.layers[0]).generationProvenance,
            expected,
            'portable copies preserve recorded component registry bindings as advisory data',
          )
          await index.indexSaved(copyPath, workspaceId)
          const copyRows = await index.listSavedAcceptedResults(localProjectRecoveryKey(copyPath))
          assert.equal(copyRows.length, 1)
          assert.equal(copyRows[0].actualSeed, actualSeed)
          assert.equal(
            (await index.listSavedAcceptedResults(state.key)).length,
            1,
            'same portable layer IDs do not collapse across paths',
          )
        } finally {
          await state.close()
        }
      },
      { opaque },
    )
  })
}

test('an interrupted real Anima Add after durable shadow recovers the same native provenance and cleans the handoff exactly once', async () => {
  await withAnimaStagingFixture(async (fixture) => {
    const { batch, candidate, expected } = await stagedResult(fixture, 0)
    const state = await acceptanceOwner(fixture)
    try {
      const interrupted = new ProjectGenerationAcceptance({
        ...state.options,
        afterDurableShadow: async () => {
          throw new Error('controlled crash after durable Anima shadow')
        },
      })
      await assert.rejects(
        interrupted.accept(
          state.key,
          [candidate.candidateId],
          candidate.candidateId,
          [candidate.candidateId],
          batch.items.slice(1).map((item) => item.id),
        ),
        /controlled crash after durable Anima shadow/,
      )
      assert.ok(await state.journal.read(state.key, state.owner.document.documentId))
      assert.deepEqual(await fixture.staging.listVerifiedCandidates(state.key), [candidate])
      assert.deepEqual(await readFile(fixture.projectPath), fixture.originalProjectBytes)
      await state.recover()
      assert.deepEqual(
        requireRasterLayer(state.owner.document.layers[0]).generationProvenance,
        expected,
      )
      const restarted = new ProjectGenerationAcceptance(state.options)
      assert.equal(await restarted.reconcile(state.key), 'cleaned')
      assert.equal(await restarted.reconcile(state.key), 'none')
      assert.deepEqual(await fixture.staging.listVerifiedCandidates(state.key), [])
      assert.deepEqual(
        requireRasterLayer(state.owner.document.layers[0]).generationProvenance,
        expected,
      )
      assert.equal(state.owner.document.layers.length, 1)
      assert.equal((await state.owner.save()).committed, true)
      const saved = await readIgsPackage(fixture.projectPath)
      assert.deepEqual(requireRasterLayer(saved.project.layers[0]).generationProvenance, expected)
    } finally {
      await state.close()
    }
  })
})
