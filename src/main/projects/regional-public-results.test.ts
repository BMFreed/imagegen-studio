import { isGenerationQueuePage } from '../../shared/projects/generation-queue-manager.js'

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'

import type { ProjectGenerationAcceptanceOptions } from './project-generation-acceptance.js'
import type { RegionalQueueFixture } from './test-fixtures/regional-queue.js'

import { openAppDatabase } from '../db/database.js'
import { GenerationAcceptanceJournalRepository } from './generation-acceptance-journal.js'
import { GenerationQueueRepository } from './generation-queue.js'
import { GenerationStagingRepository } from './generation-staging.js'
import { readIgsPackage } from './igs-package.js'
import { ProjectAutosaveCoordinator } from './project-autosave.js'
import { ProjectCandidateImageExporter } from './project-candidate-image-export.js'
import { ProjectGenerationAcceptance } from './project-generation-acceptance.js'
import { ProjectGenerationOperationGate } from './project-generation-operation-gate.js'
import { provenanceFromVerifiedRasterCandidate } from './project-generation-provenance.js'
import { ProjectGenerationResultResource } from './project-generation-result-resource.js'
import { ProjectGenerationStagingLifecycle } from './project-generation-staging-lifecycle.js'
import { localProjectRecoveryKey } from './project-identity.js'
import { ProjectSession } from './project-session.js'
import { ProjectShadowStore } from './project-shadow.js'
import {
  parseAcceptedGenerationBaseV1,
  parseFrozenQueuedRegionalInvokeV1,
  parseFrozenQueuedRegionalV1,
} from './regional-queued-generation.js'
import {
  createRegionalQueueFixture,
  enqueueRegionalFixture,
  regionalFixtureSha256,
} from './test-fixtures/regional-queue.js'
import { requireRasterLayer } from './test-fixtures/require-raster-layer.js'

const migrations = path.resolve('src/main/db/migrations')

/** Direct queue producer fixture; these tests do not claim a public Generate or native ML run. */
async function enqueuePublic(f: RegionalQueueFixture, staging = f.staging, queue = f.queue) {
  const session = randomUUID()
  return await queue.enqueueInvokeCanvasRegional({
    preflight: async (entries) =>
      await staging.preflightRegionalBatchCapacity({
        entries,
        localProjectKey: localProjectRecoveryKey(f.projectPath),
        projectPath: f.projectPath,
        stagingSessionId: session,
      }),
    prepared: f.prepared,
    projectPath: f.projectPath,
    regional: { ...f.regional, compositionProfile: 'invoke-canvas-v1' },
    request: f.request,
    stagingSessionId: session,
  })
}

async function publishPublic(f: RegionalQueueFixture) {
  const item = await enqueuePublic(f)
  const claimed = await f.queue.claimNextPendingInvokeCanvasRegional()
  assert.ok(claimed)
  assert.equal(claimed.item.id, item.id)
  return await f.staging.publishRegionalCandidate({
    actualSeed: 123,
    expectedStatusSequence: claimed.item.statusSequence,
    pngBytes: f.outputBytes,
    queueItemId: item.id,
  })
}

async function publishPrivate(f: RegionalQueueFixture) {
  await enqueueRegionalFixture(f)
  const claimed = await f.queue.claimNextPendingRegional()
  assert.ok(claimed)
  return await f.staging.publishRegionalCandidate({
    actualSeed: 123,
    expectedStatusSequence: claimed.item.statusSequence,
    pngBytes: f.outputBytes,
    queueItemId: claimed.item.id,
  })
}

test('public regional operation requires its literal profile and remains distinct from private parser and admission', async () => {
  const f = await createRegionalQueueFixture()
  try {
    const args = {
      prepared: f.prepared,
      projectPath: f.projectPath,
      regional: f.regional,
      request: f.request,
      stagingSessionId: randomUUID(),
    }
    await assert.rejects(f.queue.enqueueInvokeCanvasRegional(args), { code: 'QUEUE_INPUT_INVALID' })
    await assert.rejects(
      f.queue.enqueueCurrentCanvasRegional({
        ...args,
        regional: { ...f.regional, compositionProfile: 'invoke-canvas-v1' },
      }),
      { code: 'QUEUE_INPUT_INVALID' },
    )
    assert.equal((await f.db.selectFrom('generation_queue_item').selectAll().execute()).length, 0)
    const item = await enqueuePublic(f)
    const loaded = await f.queue.loadVerifiedRegionalInput(item.id)
    assert.equal(loaded.payload.kind, 'illustrious-regional-txt2img')
    assert.equal(loaded.input.compositionProfile, 'invoke-canvas-v1')
    const json = JSON.stringify(loaded.payload)
    assert.equal(parseFrozenQueuedRegionalInvokeV1(json).compositionProfile, 'invoke-canvas-v1')
    assert.throws(() => parseFrozenQueuedRegionalV1(json), { code: 'QUEUE_INPUT_INVALID' })
    const base = parseAcceptedGenerationBaseV1(json)
    assert.equal(base.kind, 'illustrious-txt2img')
    assert.ok(!('regional' in base) && !('compositionProfile' in base))
    assert.deepEqual(base.context, loaded.payload.context)
    const invalid = { ...loaded.payload, compositionProfile: 'later-profile' }
    assert.throws(() => parseFrozenQueuedRegionalInvokeV1(JSON.stringify(invalid)))
    const cfgOne = structuredClone(loaded.payload)
    cfgOne.workerJob.sampling.cfgScale = 1
    cfgOne.context.sampling.cfgScale = 1
    assert.throws(() => parseFrozenQueuedRegionalInvokeV1(JSON.stringify(cfgOne)))
    const legacy = await enqueueRegionalFixture(f)
    const privateInput = await f.queue.loadVerifiedRegionalInput(legacy.id)
    assert.throws(() => parseAcceptedGenerationBaseV1(JSON.stringify(privateInput.payload)))
  } finally {
    await f.close()
  }
})

test('public queue discovery, details, claims and cancellation exclude historical private rows and share the global slot', async () => {
  const f = await createRegionalQueueFixture()
  try {
    const legacy = await enqueueRegionalFixture(f)
    const item = await enqueuePublic(f)
    assert.equal(await f.queue.nextDispatchableKind(), 'regional')
    assert.equal(await f.queue.claimNextPending(), null)
    const page = await f.queue.listManagerPage()
    assert.equal(isGenerationQueuePage(page), true)
    assert.equal(page.counts.pending, 1)
    assert.deepEqual(
      page.items.map(({ id }) => id),
      [item.id],
    )
    assert.equal(page.items[0].operation, 'illustrious-regional-txt2img')
    assert.equal(page.items[0].details?.prompt, f.prepared.context.prompts.positive)
    assert.equal(page.items[0].details?.sampling.seed, 123)
    await assert.rejects(f.queue.getManagerEntry(legacy.id), { code: 'QUEUE_ITEM_NOT_FOUND' })
    const loaded = await f.queue.loadVerifiedRegionalInput(item.id)
    const actions = await f.queue.listUnfinishedActionJobsByProjectDocument(
      item.localProjectKey,
      loaded.payload.context.documentId,
    )
    assert.deepEqual(
      actions.map(({ id }) => id),
      [item.id],
    )
    const other = new GenerationQueueRepository(f.db, f.root)
    await other.recoverAfterRestart()
    // Restart cancels the two old rows. Explicit retry retains each operation's own owner.
    const canceled = await f.queue.getManagerEntry(item.id)
    assert.equal(canceled.status, 'canceled')
    const retried = await f.queue.retryInvokeCanvasRegionalTerminal(
      item.id,
      canceled.statusSequence,
    )
    assert.equal(
      (await f.queue.getManagerEntry(retried.id)).operation,
      'illustrious-regional-txt2img',
    )
    const claimed = await other.claimNextPendingInvokeCanvasRegional()
    assert.equal(claimed?.item.id, retried.id)
    assert.equal(await f.queue.claimNextPendingRegional(), null)
    assert.equal(await f.queue.claimNextPending(), null)
    const running = await f.queue.getManagerEntry(retried.id)
    await assert.rejects(f.queue.cancel(retried.id, running.statusSequence - 1), {
      code: 'QUEUE_STATUS_CONFLICT',
    })
    const cancel = await f.queue.cancel(retried.id, running.statusSequence)
    assert.equal(cancel.status, 'running')
    assert.equal(cancel.cancelRequested, true)
    await f.queue.acknowledgeCanceledRunning(retried.id, cancel.statusSequence)
    await assert.rejects(
      f.queue.retryCurrentCanvasRegionalTerminal(item.id, canceled.statusSequence),
      { code: 'QUEUE_INPUT_INVALID' },
    )
    const old = await f.queue.getRegionalQueueItem(legacy.id)
    assert.ok(old)
    await assert.rejects(f.queue.retryInvokeCanvasRegionalTerminal(legacy.id, old.statusSequence), {
      code: 'QUEUE_INPUT_INVALID',
    })
    assert.equal(await f.queue.pruneTerminal(['canceled']), 2)
    assert.ok(
      await f.queue.getRegionalQueueItem(legacy.id),
      'public Clear keeps hidden private work',
    )
    assert.deepEqual((await f.queue.listManagerPage()).items, [])
  } finally {
    await f.close()
  }
})

test('public frozen Retry survives edits, database reopen and source-row pruning with the original regional bytes', async () => {
  const f = await createRegionalQueueFixture()
  let reopened: ReturnType<typeof openAppDatabase> | undefined
  try {
    const source = await enqueuePublic(f)
    const original = await f.queue.loadVerifiedRegionalInput(source.id)
    f.regional.recipe.regions[0].positive!.text = 'later Project text'
    f.regional.recipe.regions[0].coverage.alpha.fill(0)
    f.prepared.context.sampling.seed = 777
    await f.database.close()
    reopened = openAppDatabase(f.root, migrations)
    const queue = new GenerationQueueRepository(reopened.db, f.root)
    const staging = new GenerationStagingRepository(reopened.db, f.root)
    await queue.recoverAfterRestart()
    await staging.recoverAfterRestart()
    const old = await queue.getManagerEntry(source.id)
    const retry = await queue.retryInvokeCanvasRegionalTerminal(source.id, old.statusSequence)
    await queue.deleteTerminal(source.id, old.statusSequence + 1)
    const restored = await queue.loadVerifiedRegionalInput(retry.id)
    assert.deepEqual(restored.payload, original.payload)
    assert.deepEqual(restored.input.recipe, original.input.recipe)
    assert.equal(restored.input.compositionProfile, 'invoke-canvas-v1')
    assert.notEqual(restored.targetPath, original.targetPath)
    assert.ok((await readFile(restored.targetPath)).equals(f.prepared.targetPngBytes))
    const claimed = await queue.claimNextPendingInvokeCanvasRegional()
    assert.ok(claimed)
    const candidate = await staging.publishRegionalCandidate({
      actualSeed: 123,
      expectedStatusSequence: claimed.item.statusSequence,
      pngBytes: f.outputBytes,
      queueItemId: retry.id,
    })
    const history = await queue.getManagerEntry(retry.id)
    await queue.deleteTerminal(retry.id, history.statusSequence)
    await reopened.close()
    reopened = openAppDatabase(f.root, migrations)
    const recoveredQueue = new GenerationQueueRepository(reopened.db, f.root)
    const recovered = new GenerationStagingRepository(reopened.db, f.root)
    await recoveredQueue.recoverAfterRestart()
    await recovered.recoverAfterRestart()
    assert.deepEqual(await recovered.listVerifiedCandidates(candidate.localProjectKey), [candidate])
    assert.deepEqual(await recovered.listVerifiedRegionalCandidates(candidate.localProjectKey), [])
  } finally {
    await reopened?.close()
    await f.close()
  }
})

test('public regional Results, signed PNG, export and lifecycle retain exact bytes while private results stay hidden', async () => {
  const f = await createRegionalQueueFixture()
  try {
    const legacy = await publishPrivate(f)
    const candidate = await publishPublic(f)
    const documentId = candidate.documentId
    const resource = new ProjectGenerationResultResource(f.staging, () => documentId, f.queue)
    const snapshot = await resource.list(candidate.localProjectKey)
    assert.deepEqual(
      snapshot.candidates.map(({ candidateId }) => candidateId),
      [candidate.candidateId],
    )
    assert.ok((await resource.readImage(snapshot.candidates[0].imageUrl))?.equals(f.outputBytes))
    assert.equal(
      await f.staging.readVerifiedRegionalCandidatePng({
        candidateId: candidate.candidateId,
        imageSha256: candidate.image.sha256,
        localProjectKey: candidate.localProjectKey,
        stagingSessionId: candidate.stagingSessionId,
      }),
      null,
    )
    const lifecycle = new ProjectGenerationStagingLifecycle(f.staging, {
      discardProject: async () => ({ cleanupDeferred: false, discardedSessionCount: 0 }),
      listVerifiedCandidates: async () => [],
    })
    assert.deepEqual(
      (await lifecycle.listVerifiedCandidates(candidate.localProjectKey)).map(
        ({ candidateId }) => candidateId,
      ),
      [candidate.candidateId],
    )
    assert.deepEqual(
      new Set(
        (await lifecycle.listOwnedCandidates(candidate.localProjectKey)).map(
          ({ candidateId }) => candidateId,
        ),
      ),
      new Set([candidate.candidateId, legacy.candidateId]),
    )
    const before = await readFile(f.projectPath)
    const destination = path.join(f.root, 'public-export.png')
    const exporter = new ProjectCandidateImageExporter(
      f.staging,
      () => documentId,
      async () => ({ canceled: false, filePath: destination }),
    )
    assert.equal(
      (await exporter.save(candidate.localProjectKey, candidate.candidateId)).kind,
      'saved',
    )
    assert.ok((await readFile(destination)).equals(f.outputBytes))
    assert.ok((await readFile(f.projectPath)).equals(before))
    assert.equal((await f.staging.listVerifiedCandidates(candidate.localProjectKey)).length, 1)
    const staleExporter = new ProjectCandidateImageExporter(
      f.staging,
      () => documentId,
      async () => {
        await f.staging.discardSessions(candidate.localProjectKey, [candidate.stagingSessionId])
        return { canceled: false, filePath: path.join(f.root, 'must-not-export.png') }
      },
    )
    await assert.rejects(staleExporter.save(candidate.localProjectKey, candidate.candidateId), {
      code: 'CANDIDATE_EXPORT_NOT_FOUND',
    })
    assert.equal(await resource.readImage(snapshot.candidates[0].imageUrl), null)
    assert.equal((await lifecycle.listOwnedCandidates(candidate.localProjectKey)).length, 1)
  } finally {
    await f.close()
  }
})

async function acceptanceFixture() {
  const f = await createRegionalQueueFixture()
  await rm(f.projectPath)
  const roots = {
    placeholdersDir: path.resolve('src/main/projects/placeholders'),
    scratchDir: path.join(f.root, 'scratch'),
  }
  const session = await ProjectSession.create(
    f.projectPath,
    'Regional acceptance',
    roots,
    f.prepared.context.bbox,
  )
  const shadow = new ProjectShadowStore(path.join(f.root, 'shadow'))
  const owner = await ProjectAutosaveCoordinator.attach(session, roots, shadow, {
    debounceMs: 60_000,
  })
  const region = {
    enabled: true,
    id: f.regional.recipe.regions[0].regionId,
    locked: false,
    mask: { asset: null, id: f.regional.recipe.regions[0].maskId, revision: 0 },
    name: 'Preserved authored region',
    overlayOpacity: 0.5,
  }
  await owner.applyDocument({ ...owner.document, regionalGuidance: [region] })
  await owner.save()
  f.prepared.context.documentId = owner.document.documentId
  f.prepared.context.documentRevision = owner.document.documentRevision
  f.regional.recipe.documentId = owner.document.documentId
  f.regional.recipe.documentRevision = owner.document.documentRevision
  const journal = new GenerationAcceptanceJournalRepository(f.db)
  const options: ProjectGenerationAcceptanceOptions = {
    documents: { getOpenDocument: () => owner },
    gate: new ProjectGenerationOperationGate(),
    journal,
    orchestrator: {
      cancelAcceptanceJobs: async () => assert.fail('All producer jobs have completed.'),
      fenceProjectGeneration: async (key) => {
        f.queue.fenceProject(key)
      },
      releaseProjectGenerationFence: (key) => {
        f.queue.releaseProjectFence(key)
      },
    },
    queue: f.queue,
    staging: f.staging,
  }
  return { ...f, journal, options, owner, region, roots }
}

test('mixed ordinary/public regional Add preserves authoring, grouped Undo/Redo and explicit Save with only base provenance', async () => {
  const f = await acceptanceFixture()
  try {
    const before = await readFile(f.projectPath)
    const first = await publishPublic(f)
    const item = await f.queue.enqueueIllustriousGeneration({
      prepared: f.prepared,
      projectPath: f.projectPath,
      request: f.request,
      stagingSessionId: randomUUID(),
    })
    const ordinary = await f.queue.claimNextPending()
    assert.equal(ordinary?.item.id, item.id)
    assert.ok(ordinary)
    await mkdir(f.roots.scratchDir, { mode: 0o700, recursive: true })
    const provisional = await mkdtemp(path.join(f.roots.scratchDir, 'illustrious-request-'))
    const output = path.join(provisional, 'result.png')
    await writeFile(output, f.outputBytes, { mode: 0o600 })
    const second = await f.staging.publishGenerationCandidate({
      actualSeed: 123,
      expectedProvisionalRoot: provisional,
      expectedStatusSequence: ordinary.item.statusSequence,
      provisionalOutputPath: output,
      queueItemId: item.id,
    })
    await f.owner.save()
    assert.ok(
      (await readFile(f.projectPath)).equals(before),
      'Save before Add does not accept candidates',
    )
    const available = [first.candidateId, second.candidateId]
    const acceptance = new ProjectGenerationAcceptance(f.options)
    const added = await acceptance.accept(
      first.localProjectKey,
      [second.candidateId, first.candidateId],
      second.candidateId,
      available,
    )
    assert.equal(added.kind, 'accepted')
    assert.ok((await readFile(f.projectPath)).equals(before), 'Add never implicitly Saves')
    const layers = f.owner.document.layers.map((layer) => requireRasterLayer(layer))
    assert.deepEqual(
      layers.map(({ visible }) => visible),
      [false, true],
    )
    assert.deepEqual(
      layers.map(({ transform }) => [transform.x, transform.y]),
      [
        [-13, 5],
        [-13, 5],
      ],
    )
    assert.deepEqual(f.owner.document.regionalGuidance, [f.region])
    const provenance = layers[0].generationProvenance!
    assert.equal(provenance.kind, 'illustrious-txt2img')
    assert.equal(provenance.generationConfiguration.positivePrompt.text, 'global positive')
    assert.equal(provenance.generationConfiguration.sampling.actualSeed, 123)
    assert.equal(provenance.executionResultContext.candidateId, first.candidateId)
    assert.equal(provenance.executionResultContext.output.sha256, first.image.sha256)
    assert.equal(provenance.layerSourceContext.sourceTargetSha256, f.prepared.context.target.sha256)
    const serialized = JSON.stringify(provenance)
    for (const excluded of [
      'regional positive',
      'compositionProfile',
      'invoke-canvas-v1',
      'regional.json',
      f.region.id,
      f.region.mask.id,
      f.root,
    ]) {
      assert.equal(serialized.includes(excluded), false, excluded)
    }
    assert.deepEqual(await f.staging.listVerifiedCandidates(first.localProjectKey), [])
    assert.equal(await f.journal.read(first.localProjectKey, first.documentId), null)
    await f.owner.undo()
    assert.deepEqual(f.owner.document.layers, [])
    assert.deepEqual(f.owner.document.regionalGuidance, [f.region])
    await f.owner.redo()
    assert.deepEqual(
      f.owner.document.layers.map(({ id }) => id),
      layers.map(({ id }) => id),
    )
    await f.owner.save()
    const saved = await readIgsPackage(f.projectPath)
    assert.deepEqual(saved.project.regionalGuidance, [f.region])
    assert.deepEqual(saved.project.layers, f.owner.document.layers)
    for (const layer of layers) {
      assert.ok((await saved.readMember(layer.asset.path)).equals(f.outputBytes))
    }
    const reopened = await ProjectSession.open(f.projectPath, f.roots)
    assert.deepEqual(reopened.document.layers, f.owner.document.layers)
  } finally {
    await f.owner.close()
    await f.close()
  }
})

test('public candidate payload SHA and public profile failures refuse before acceptance journal or Project mutation', async () => {
  const f = await acceptanceFixture()
  try {
    const candidate = await publishPublic(f)
    const originalDocument = structuredClone(f.owner.document)
    const changed = { ...candidate, frozenPayloadSha256: '0'.repeat(64) }
    const options: ProjectGenerationAcceptanceOptions = {
      ...f.options,
      staging: {
        discardSessions: f.staging.discardSessions.bind(f.staging),
        listVerifiedCandidates: async () => [changed],
        readVerifiedCandidatePng: f.staging.readVerifiedCandidatePng.bind(f.staging),
      },
    }
    await assert.rejects(
      new ProjectGenerationAcceptance(options).accept(
        candidate.localProjectKey,
        [candidate.candidateId],
        candidate.candidateId,
        [candidate.candidateId],
      ),
      { code: 'ACCEPTANCE_CANDIDATE_UNAVAILABLE' },
    )
    assert.equal(await f.journal.read(candidate.localProjectKey, candidate.documentId), null)
    assert.deepEqual(f.owner.document, originalDocument)
    assert.equal((await f.staging.listVerifiedCandidates(candidate.localProjectKey)).length, 1)
    const wrongProfile = candidate.frozenPayloadJson.replace('invoke-canvas-v1', 'unqualified-v1')
    changed.frozenPayloadJson = wrongProfile
    changed.frozenPayloadSha256 = regionalFixtureSha256(Buffer.from(wrongProfile))
    await assert.rejects(
      new ProjectGenerationAcceptance(options).accept(
        candidate.localProjectKey,
        [candidate.candidateId],
        candidate.candidateId,
        [candidate.candidateId],
      ),
      { code: 'QUEUE_INPUT_INVALID' },
    )
    assert.equal(await f.journal.read(candidate.localProjectKey, candidate.documentId), null)
    assert.deepEqual(f.owner.document, originalDocument)
    assert.throws(
      () =>
        provenanceFromVerifiedRasterCandidate({
          acceptedAt: candidate.completedAt,
          candidate: {
            ...candidate,
            frozenPayloadJson: candidate.frozenPayloadJson.replace(
              'invoke-canvas-v1',
              'unqualified-v1',
            ),
          },
          imagePngBytes: f.outputBytes,
        }),
      { code: 'PROVENANCE_INPUT_INVALID' },
    )
  } finally {
    await f.owner.close()
    await f.close()
  }
})
