import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import type {
  IgsProjectDocumentV1,
  IgsRasterLayerV1,
  IgsSmartPatchLayerV1,
} from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import type { GenerationAcceptanceHandoff } from './generation-acceptance-journal.js'
import type { SmartPatchAcceptanceCancellationScope } from './generation-orchestrator.js'
import type {
  ProjectGenerationAcceptanceOptions,
  SmartPatchOrphanRasterAcceptRequest,
} from './project-generation-acceptance.js'
import type { SmartPatchWorldCandidateFixture } from './test-fixtures/smart-patch-world-candidate.js'

import { GenerationAcceptanceJournalRepository } from './generation-acceptance-journal.js'
import { GenerationOrchestrator } from './generation-orchestrator.js'
import { GenerationProcessor } from './generation-processor.js'
import { readIgsPackage, saveIgsPackage } from './igs-package.js'
import { ProjectAutosaveLeaseRegistry } from './project-autosave.js'
import { ProjectGenerationAcceptance } from './project-generation-acceptance.js'
import { ProjectGenerationClose } from './project-generation-close.js'
import { ProjectGenerationOperationGate } from './project-generation-operation-gate.js'
import { ProjectIndexRepository } from './project-index.js'
import { readProjectPlaceholders } from './project-placeholders.js'
import { ProjectService } from './project-service.js'
import { ProjectShadowStore } from './project-shadow.js'
import { projectVerifiedSmartPatchVariant } from './project-smart-patch-variant-projection.js'
import { readGenerationAcceptanceKind } from './smart-patch-acceptance-journal.js'
import { parseSmartPatchInputMaterial } from './smart-patch-frozen-input.js'
import { animaFixturePng } from './test-fixtures/anima-batch.js'
import { animaProvisionalOutput, enqueueAnimaStagingBatch } from './test-fixtures/anima-staging.js'
import { admitSmartPatch } from './test-fixtures/smart-patch-queue.js'
import { withSmartPatchWorldCandidateFixture } from './test-fixtures/smart-patch-world-candidate.js'

const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
type Family = 'anima' | 'illustrious'
type Fixture = Awaited<ReturnType<typeof prepare>>

/**
 * Real queue/staging SQL, files, Service, coordinator and shadow; model output is a literal
 * fixture.
 */
async function fixture(family: Family, use: (f: Fixture) => Promise<void>): Promise<void> {
  await withSmartPatchWorldCandidateFixture(family, async (base) => {
    const f = await prepare(base)
    try {
      await use(f)
    } finally {
      for (const service of f.services) {
        for (const tab of service.getOpenTabs()) {
          await service.discardAndClose(tab.id)
        }
      }
    }
  })
}

async function prepare(base: SmartPatchWorldCandidateFixture) {
  const document = (await readIgsPackage(base.projectPath)).project
  const context = base.material.manifest.context
  const sourceBytes = base.material.files['source.png']
  const source: IgsRasterLayerV1 = {
    asset: {
      bytes: sourceBytes.length,
      height: 128,
      path: `assets/layers/${context.sourceLayerIds[0]}.png`,
      sha256: digest(sourceBytes),
      width: 128,
    },
    blendMode: 'normal',
    id: context.sourceLayerIds[0],
    kind: 'raster',
    locked: false,
    name: 'Saved neighbor',
    opacity: 1,
    transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: context.bbox.x, y: context.bbox.y },
    visible: true,
  }
  document.layers = [source]
  await saveIgsPackage(base.projectPath, {
    assets: { [source.asset.path]: { bytes: sourceBytes } },
    preview: {
      ...(await readProjectPlaceholders(
        path.resolve('src/main/projects/placeholders'),
        'unavailable',
      )),
      rect: context.bbox,
      status: 'unavailable',
    },
    project: document,
  })
  const repository = new ProjectIndexRepository(base.database.db)
  const workspace = await repository.ensureDefaultWorkspace(base.root)
  await base.database.db
    .updateTable('project_workspace')
    .set({ directory_path: base.root })
    .where('id', '=', workspace.id)
    .execute()
  await repository.indexSaved(base.projectPath, workspace.id)
  // Catalog discovery is a fixture collaborator. Actual index/package/Service operations stay real.
  repository.ensureDefaultWorkspace = async () => ({ ...workspace, directoryPath: base.root })
  const shadow = new ProjectShadowStore(path.join(base.root, 'raster-shadow'))
  const services: ProjectService[] = []
  const newService = () => {
    const value = new ProjectService({
      autosaveOptions: { debounceMs: 60_000, leaseRegistry: new ProjectAutosaveLeaseRegistry() },
      dataRoot: base.root,
      repository,
      roots: {
        placeholdersDir: path.resolve('src/main/projects/placeholders'),
        scratchDir: base.scratch,
      },
      shadow,
    })
    services.push(value)
    return value
  }
  const service = newService()
  const tabId = base.nomination.localProjectKey
  assert.equal((await service.open(tabId)).kind, 'opened')
  const candidate = await base.publish()
  const models = { ...base.models, ...base.modelService }
  const makeOrchestrator = (projects: ProjectService) =>
    new GenerationOrchestrator(
      projects,
      repository,
      models,
      base.queue,
      base.staging,
      new GenerationProcessor(base.queue, base.staging, models, base.scratch),
      base.scratch,
    )
  const orchestrator = makeOrchestrator(service)
  const journal = new GenerationAcceptanceJournalRepository(base.database.db)
  const optionsFor = (
    projects = service,
    generation = orchestrator,
  ): ProjectGenerationAcceptanceOptions => ({
    documents: { getOpenDocument: (key) => projects.getOpenDocumentForAcceptance(key) },
    gate: new ProjectGenerationOperationGate(),
    journal,
    orchestrator: generation,
    queue: base.queue,
    smartPatch: { orchestrator: generation, queue: base.queue, staging: base.patch },
    staging: base.staging,
  })
  const request = (): SmartPatchOrphanRasterAcceptRequest => {
    const owner = service.getOpenDocumentForAcceptance(tabId)!
    return {
      candidateIds: [candidate.candidateId],
      expectedAvailableIds: [candidate.candidateId],
      expectedOwner: {
        documentEpoch: owner.documentEpoch,
        documentId: owner.document.documentId,
        documentRevision: owner.document.documentRevision,
        layerId: context.layerId,
      },
      expectedUnfinishedJobIds: [base.siblingId],
      focusedCandidateId: candidate.candidateId,
    }
  }
  const emptyPatch = (): IgsSmartPatchLayerV1 => ({
    activeRasterSubLayerId: null,
    blendMode: 'normal',
    boundingBox: context.bbox,
    generationDraft: structuredClone(context.generationDraft),
    id: context.layerId,
    internalResolution: context.internalResolution,
    kind: 'smart-patch',
    locked: false,
    mask: { asset: null, id: context.mask.id, revision: 0 },
    name: 'Restored target',
    opacity: 1,
    rasterSubLayers: [],
    visible: true,
  })
  const publishSibling = async (
    runningClaim?: NonNullable<Awaited<ReturnType<typeof base.queue.claimNextPendingSmartPatch>>>,
  ) => {
    const claim = runningClaim ?? (await base.queue.claimNextPendingSmartPatch())
    assert.ok(claim)
    const directory = await mkdtemp(path.join(base.scratch, 'smart-patch-request-'))
    await chmod(directory, 0o700)
    const outputPath = path.join(directory, 'world-result.png')
    await writeFile(outputPath, base.outputBytes, { flag: 'wx', mode: 0o600 })
    return await base.patch.publishGenerationCandidate({
      actualSeed: claim.payload.item.item.seed,
      expectedProvisionalRoot: directory,
      expectedStatusSequence: claim.item.statusSequence,
      output: {
        byteSize: base.outputBytes.length,
        colorSpace: 'srgb',
        height: 128,
        iccSha256: IGS_SRGB_ICC_SHA256,
        path: outputPath,
        sha256: digest(base.outputBytes),
        width: 128,
      },
      provisionalOutputPath: outputPath,
      queueItemId: claim.item.id,
    })
  }
  const retryFailedSibling = async () => {
    const claim = await base.queue.claimNextPendingSmartPatch()
    assert.ok(claim)
    assert.equal(claim.item.id, base.siblingId)
    const failed = await base.queue.failRunning(claim.item.id, claim.item.statusSequence, {
      code: 'DECLARED_ORPHAN_RETRY_FAILURE',
      message: 'Controlled sibling failure before frozen Retry.',
    })
    const retried = await base.queue.retryPreparedSmartPatchTerminal(
      failed.id,
      failed.statusSequence,
      {
        assertCurrent: () => undefined,
        modelService: base.models,
      },
    )
    assert.notEqual(retried.stagingSessionId, candidate.stagingSessionId)
    return retried
  }
  return {
    base,
    candidate,
    emptyPatch,
    journal,
    makeOrchestrator,
    newService,
    optionsFor,
    orchestrator,
    publishSibling,
    request,
    retryFailedSibling,
    service,
    services,
    shadow,
    source,
    tabId,
  }
}

function raster(layer: IgsProjectDocumentV1['layers'][number] | undefined): IgsRasterLayerV1 {
  assert.ok(layer && layer.kind === 'raster')
  return layer
}

for (const family of ['illustrious', 'anima'] as const) {
  test(`${family} orphan Add preserves exact contribution/provenance, one Undo, and portable Save/reopen`, async () => {
    await fixture(family, async (f) => {
      const owner = f.service.getOpenDocumentForAcceptance(f.tabId)!
      const before = structuredClone(owner.document)
      const savedBytes = await readFile(f.base.projectPath)
      const read = await f.base.patch.readVerifiedCandidate(f.base.nomination)
      assert.ok(read)
      const expected = await projectVerifiedSmartPatchVariant({
        acceptedAt: '2026-10-22T10:00:00.000Z',
        read,
        variantId: randomUUID(),
      })
      const options = f.optionsFor()
      options.now = () => '2026-10-22T10:00:00.000Z'
      options.journal = {
        abandon: f.journal.abandon.bind(f.journal),
        complete: async (handoff) => {
          const shadow = await f.shadow.inspect({
            projectPath: f.base.projectPath,
            savedPackage: await readIgsPackage(f.base.projectPath),
          })
          assert.equal(
            shadow.status,
            'recoverable',
            'Synced accepted shadow must precede tombstones.',
          )
          assert.equal((await f.base.patch.listVerifiedCandidates(f.tabId)).length, 1)
          assert.equal(handoff.smartPatchSource?.reviewedCandidates.length, 1)
          await f.journal.complete(handoff)
        },
        read: f.journal.read.bind(f.journal),
        record: f.journal.record.bind(f.journal),
      }
      const accept = new ProjectGenerationAcceptance(options)
      const result = await accept.acceptSmartPatchOrphans(f.tabId, f.request())
      const layer = raster(owner.document.layers[0])
      assert.equal(result.kind, 'accepted')
      assert.equal(layer.id, result.layerIds[0])
      assert.deepEqual(layer.generationProvenance, expected.generationProvenance)
      assert.deepEqual(layer.transform, {
        rotationDegrees: 0,
        scaleX: 1,
        scaleY: 1,
        x: f.candidate.bbox.x,
        y: f.candidate.bbox.y,
      })
      assert.deepEqual(owner.document.layers.slice(1), before.layers)
      assert.equal(
        (await readFile(f.base.projectPath)).equals(savedBytes),
        true,
        'Add never implicitly Saves.',
      )
      assert.equal(owner.dirty, true)
      assert.equal(accept.hasPendingHandoff(f.tabId), false)
      assert.deepEqual(await f.base.patch.listVerifiedCandidates(f.tabId), [])
      assert.equal((await f.base.queue.getManagerEntry(f.base.siblingId)).status, 'canceled')
      const repeat = f.request()
      repeat.expectedUnfinishedJobIds = []
      assert.deepEqual(
        (await accept.acceptSmartPatchOrphans(f.tabId, repeat)).layerIds,
        result.layerIds,
      )
      await f.service.undo(f.tabId)
      assert.deepEqual(owner.document.layers, before.layers)
      assert.equal(owner.canUndo, false)
      assert.deepEqual(await f.base.patch.listVerifiedCandidates(f.tabId), [])
      await f.service.redo(f.tabId)
      assert.deepEqual(
        raster(owner.document.layers[0]).generationProvenance,
        expected.generationProvenance,
      )
      await f.service.save(f.tabId)
      const saved = await readIgsPackage(f.base.projectPath)
      assert.equal((await saved.readMember(layer.asset.path)).equals(f.base.outputBytes), true)
      await f.service.close(f.tabId)
      assert.equal((await f.service.open(f.tabId)).kind, 'opened')
      assert.deepEqual(
        raster(f.service.getOpenDocumentForAcceptance(f.tabId)!.document.layers[0]),
        layer,
      )
    })
  })
}

test('exact epoch and any same-ID occupant refuse before cancellation; restoring target during verified read also refuses', async () => {
  await fixture('illustrious', async (f) => {
    const owner = f.service.getOpenDocumentForAcceptance(f.tabId)!
    const original = structuredClone(owner.document)
    const stale = f.request()
    for (const occupant of [
      f.emptyPatch(),
      { ...structuredClone(f.source), id: stale.expectedOwner.layerId },
    ]) {
      await owner.applyDocument(
        { ...owner.document, layers: [occupant, ...original.layers] },
        occupant.kind === 'raster'
          ? { [occupant.asset.path]: { bytes: f.base.material.files['source.png'] } }
          : {},
      )
      await assert.rejects(
        new ProjectGenerationAcceptance(f.optionsFor()).acceptSmartPatchOrphans(
          f.tabId,
          f.request(),
        ),
        { code: 'PROJECT_DOCUMENT_CHANGED' },
      )
      await owner.undo()
    }
    await assert.rejects(
      new ProjectGenerationAcceptance(f.optionsFor()).acceptSmartPatchOrphans(f.tabId, stale),
      { code: 'PROJECT_DOCUMENT_CHANGED' },
    )
    const options = f.optionsFor()
    options.smartPatch = {
      ...options.smartPatch!,
      staging: {
        discardSessions: f.base.patch.discardSessions.bind(f.base.patch),
        listVerifiedCandidates: f.base.patch.listVerifiedCandidates.bind(f.base.patch),
        readVerifiedCandidate: async (identity) => {
          const read = await f.base.patch.readVerifiedCandidate(identity)
          await owner.applyDocument({
            ...owner.document,
            layers: [f.emptyPatch(), ...owner.document.layers],
          })
          return read
        },
      },
    }
    await assert.rejects(
      new ProjectGenerationAcceptance(options).acceptSmartPatchOrphans(f.tabId, f.request()),
      { code: 'PROJECT_DOCUMENT_CHANGED' },
    )
    assert.equal((await f.base.queue.getManagerEntry(f.base.siblingId)).status, 'pending')
    assert.equal((await f.base.patch.listVerifiedCandidates(f.tabId)).length, 1)
    assert.equal(await f.journal.read(f.tabId, owner.document.documentId), null)
  })
})

test('caller-owned request is frozen before gate admission and empty unfinished still drains Smart publication', async () => {
  await fixture('anima', async (f) => {
    await f.base.queue.cancel(f.base.siblingId)
    const options = f.optionsFor()
    let calls = 0
    options.smartPatch = {
      ...options.smartPatch!,
      orchestrator: {
        cancelSmartPatchAcceptanceJobs: async (scope) => {
          calls++
          assert.deepEqual(scope.expectedUnfinishedJobIds, [])
          await f.orchestrator.cancelSmartPatchAcceptanceJobs(scope)
        },
      },
    }
    let release!: () => void
    const blocker = options.gate.run(
      f.tabId,
      async () =>
        await new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    await Promise.resolve()
    const input = f.request()
    input.expectedUnfinishedJobIds = []
    const accepting = new ProjectGenerationAcceptance(options).acceptSmartPatchOrphans(
      f.tabId,
      input,
    )
    input.candidateIds = [randomUUID()]
    input.expectedOwner.layerId = randomUUID()
    release()
    await blocker
    await accepting
    assert.ok(calls >= 1, 'No unfinished SQL row is not proof that publication is drained.')
  })
})

test('lost intent acknowledgement preserves ALL reviewed witnesses; absent adoption recovery keeps every candidate', async () => {
  await fixture('illustrious', async (f) => {
    const second = await f.publishSibling()
    const input = f.request()
    input.expectedAvailableIds = [f.candidate.candidateId, second.candidateId]
    input.expectedUnfinishedJobIds = []
    const options = f.optionsFor()
    options.journal = {
      abandon: f.journal.abandon.bind(f.journal),
      complete: f.journal.complete.bind(f.journal),
      read: f.journal.read.bind(f.journal),
      record: async (handoff) => {
        await f.journal.record(handoff)
        throw new Error('controlled lost intent acknowledgement')
      },
    }
    const accept = new ProjectGenerationAcceptance(options)
    await assert.rejects(
      accept.acceptSmartPatchOrphans(f.tabId, input),
      /lost intent acknowledgement/,
    )
    assert.equal(accept.hasPendingHandoff(f.tabId), true)
    const handoff = await f.journal.read(f.tabId, input.expectedOwner.documentId)
    assert.ok(handoff?.smartPatchSource)
    assert.deepEqual(
      handoff.smartPatchSource.reviewedCandidates.map((w) => w.candidateId).sort(),
      [...input.expectedAvailableIds].sort(),
    )
    assert.equal(handoff.acceptedLayers.length, 1)
    assert.equal(
      await readGenerationAcceptanceKind(
        f.base.database.db,
        f.tabId,
        input.expectedOwner.documentId,
      ),
      'raster',
    )
    assert.equal(f.service.getOpenDocumentForAcceptance(f.tabId)!.document.layers.length, 1)
    const recovered = new ProjectGenerationAcceptance(f.optionsFor())
    assert.equal(await recovered.reconcile(f.tabId), 'none')
    assert.equal(await f.journal.read(f.tabId, input.expectedOwner.documentId), null)
    assert.equal((await f.base.patch.listVerifiedCandidates(f.tabId)).length, 2)
    for (const malformed of [
      { ...handoff, smartPatchSource: undefined },
      { ...handoff, smartPatchSource: { ...handoff.smartPatchSource, layerId: randomUUID() } },
      {
        ...handoff,
        smartPatchSource: {
          ...handoff.smartPatchSource,
          reviewedCandidates: [
            ...handoff.smartPatchSource.reviewedCandidates,
            handoff.smartPatchSource.reviewedCandidates[0],
          ],
        },
      },
      { ...handoff, smartPatchSource: { ...handoff.smartPatchSource, extra: true } },
    ]) {
      await assert.rejects(f.journal.record(malformed), {
        code: 'ACCEPTANCE_JOURNAL_INPUT_INVALID',
      })
    }
  })
})

test('fresh owner recovers post-shadow Add after queue pruning without a duplicate or implicit Save', async () => {
  await fixture('anima', async (f) => {
    const options = f.optionsFor()
    options.afterDurableShadow = async () => {
      throw new Error('controlled post-shadow stop')
    }
    const accept = new ProjectGenerationAcceptance(options)
    const saved = await readFile(f.base.projectPath)
    await assert.rejects(accept.acceptSmartPatchOrphans(f.tabId, f.request()), /post-shadow stop/)
    const before = raster(f.service.getOpenDocumentForAcceptance(f.tabId)!.document.layers[0])
    assert.equal(accept.hasPendingHandoff(f.tabId), true)
    const close = new ProjectGenerationClose(f.service, null, options.gate, (key) =>
      accept.hasPendingHandoff(key),
    )
    await assert.rejects(close.getCloseImpact(f.tabId), { code: 'PROJECT_ACCEPTANCE_PENDING' })
    await f.base.queue.pruneTerminal(['completed', 'canceled'])
    const service = f.newService()
    await service.resolveRecovery(f.tabId, 'recover')
    const recovery = new ProjectGenerationAcceptance(
      f.optionsFor(service, f.makeOrchestrator(service)),
    )
    assert.equal(await recovery.reconcile(f.tabId), 'cleaned')
    assert.equal(service.getOpenDocumentForAcceptance(f.tabId)!.document.layers.length, 2)
    assert.deepEqual(
      raster(service.getOpenDocumentForAcceptance(f.tabId)!.document.layers[0])
        .generationProvenance,
      before.generationProvenance,
    )
    assert.deepEqual(await f.base.patch.listVerifiedCandidates(f.tabId), [])
    assert.equal((await readFile(f.base.projectPath)).equals(saved), true)
  })
})

test('unconfirmed shadow and lost completion acknowledgement retain recovery until exact proof', async () => {
  await fixture('illustrious', async (f) => {
    const owner = f.service.getOpenDocumentForAcceptance(f.tabId)!
    const flush = owner.flush.bind(owner)
    owner.flush = async () => null
    const accept = new ProjectGenerationAcceptance(f.optionsFor())
    try {
      await assert.rejects(accept.acceptSmartPatchOrphans(f.tabId, f.request()), {
        code: 'ACCEPTANCE_SHADOW_UNCONFIRMED',
      })
    } finally {
      owner.flush = flush
    }
    assert.equal((await f.base.patch.listVerifiedCandidates(f.tabId)).length, 1)
    assert.ok(await f.journal.read(f.tabId, owner.document.documentId))
    await f.service.save(f.tabId)
    const options = f.optionsFor()
    options.journal = {
      abandon: f.journal.abandon.bind(f.journal),
      complete: async (handoff) => {
        await f.journal.complete(handoff)
        throw new Error('controlled lost completion acknowledgement')
      },
      read: f.journal.read.bind(f.journal),
      record: f.journal.record.bind(f.journal),
    }
    const lost = new ProjectGenerationAcceptance(options)
    await assert.rejects(lost.reconcile(f.tabId), /lost completion acknowledgement/)
    assert.equal(lost.hasPendingHandoff(f.tabId), true)
    assert.equal(await f.journal.read(f.tabId, owner.document.documentId), null)
    assert.deepEqual(await f.base.patch.listVerifiedCandidates(f.tabId), [])
    options.journal = f.journal
    assert.equal(await lost.reconcile(f.tabId), 'cleaned')
    assert.equal(owner.document.layers.length, 2)
  })
})

test('Redo during abandonment restores exact intent, and same-operation changed source blocks local/durable reconciliation', async () => {
  await fixture('anima', async (f) => {
    const owner = f.service.getOpenDocumentForAcceptance(f.tabId)!
    const options = f.optionsFor()
    options.afterDurableShadow = async () => {
      throw new Error('controlled handoff stop')
    }
    const accept = new ProjectGenerationAcceptance(options)
    await assert.rejects(accept.acceptSmartPatchOrphans(f.tabId, f.request()), /handoff stop/)
    const handoff = await f.journal.read(f.tabId, owner.document.documentId)
    assert.ok(handoff?.smartPatchSource)
    await f.service.undo(f.tabId)
    const originalAbandon = f.journal.abandon.bind(f.journal)
    options.journal = {
      abandon: async (value) => {
        await originalAbandon(value)
        await f.service.redo(f.tabId)
      },
      complete: f.journal.complete.bind(f.journal),
      read: f.journal.read.bind(f.journal),
      record: f.journal.record.bind(f.journal),
    }
    await assert.rejects(accept.reconcile(f.tabId), { code: 'ACCEPTANCE_RECOVERY_REQUIRED' })
    assert.deepEqual(await f.journal.read(f.tabId, owner.document.documentId), handoff)
    assert.equal((await f.base.patch.listVerifiedCandidates(f.tabId)).length, 1)
    const changed: GenerationAcceptanceHandoff = structuredClone(handoff)
    changed.smartPatchSource!.reviewedCandidates[0].frozenPayloadSha256 = 'f'.repeat(64)
    await f.base.database.db
      .updateTable('generation_acceptance_journal')
      .set({ payload_json: JSON.stringify(changed) })
      .where('operation_id', '=', handoff.operationId)
      .execute()
    options.journal = f.journal
    await assert.rejects(accept.reconcile(f.tabId), { code: 'ACCEPTANCE_RECOVERY_REQUIRED' })
    assert.equal(accept.hasPendingHandoff(f.tabId), true)
    assert.equal((await f.base.patch.listVerifiedCandidates(f.tabId)).length, 1)
  })
})

test('corrupt contribution refuses before sibling cancellation; ordinary neighboring staging survives Smart Add and remains addable', async () => {
  await fixture('anima', async (f) => {
    await writeFile(f.candidate.assetPath, Buffer.from('corrupt world contribution'))
    await assert.rejects(
      new ProjectGenerationAcceptance(f.optionsFor()).acceptSmartPatchOrphans(f.tabId, f.request()),
      { code: 'ACCEPTANCE_SELECTION_STALE' },
    )
    assert.equal((await f.base.queue.getManagerEntry(f.base.siblingId)).status, 'pending')
    await writeFile(f.candidate.assetPath, f.base.outputBytes)
    const ordinary = await enqueueAnimaStagingBatch(f.base)
    const claim = await f.base.queue.claimNextPending()
    assert.ok(claim)
    const normal = await f.base.staging.publishGenerationCandidate({
      // The Smart fixture's outputBytes is a 128px world contribution. The ordinary frozen
      // Anima job retains its independent 64px bbox and needs that fixture's canonical PNG.
      ...(await animaProvisionalOutput(f.base, { bytes: await animaFixturePng(255) })),
      actualSeed: 0,
      expectedStatusSequence: claim.item.statusSequence,
      queueItemId: claim.item.id,
    })
    assert.equal(normal.queueItemId, ordinary.items[0].id)
    const reviewedOrdinarySiblingIds = ordinary.items.slice(1).map((item) => item.id)
    const accept = new ProjectGenerationAcceptance(f.optionsFor())
    await accept.acceptSmartPatchOrphans(f.tabId, f.request())
    assert.deepEqual(
      (await f.base.staging.listVerifiedCandidates(f.tabId)).map((value) => value.candidateId),
      [normal.candidateId],
    )
    for (const id of reviewedOrdinarySiblingIds) {
      assert.equal(
        (await f.base.queue.getManagerEntry(id)).status,
        'pending',
        'Smart conversion must preserve unfinished ordinary neighbors.',
      )
    }
    const result = await accept.accept(
      f.tabId,
      [normal.candidateId],
      normal.candidateId,
      [normal.candidateId],
      reviewedOrdinarySiblingIds,
    )
    assert.equal(result.kind, 'accepted')
    for (const id of reviewedOrdinarySiblingIds) {
      assert.equal((await f.base.queue.getManagerEntry(id)).status, 'canceled')
    }
    assert.equal(f.service.getOpenDocumentForAcceptance(f.tabId)!.document.layers.length, 3)
  })
})

test('uncertain Smart cancellation retains its scope/fence and recovery drains it without adopting a layer', async () => {
  await fixture('illustrious', async (f) => {
    const options = f.optionsFor()
    let uncertain = true
    options.smartPatch = {
      ...options.smartPatch!,
      orchestrator: {
        cancelSmartPatchAcceptanceJobs: async (scope) => {
          await f.orchestrator.cancelSmartPatchAcceptanceJobs(scope)
          if (uncertain) {
            throw new Error('controlled uncertain cancellation acknowledgement')
          }
        },
      },
    }
    const accept = new ProjectGenerationAcceptance(options)
    await assert.rejects(
      accept.acceptSmartPatchOrphans(f.tabId, f.request()),
      /uncertain cancellation acknowledgement/,
    )
    assert.equal(accept.hasPendingHandoff(f.tabId), true)
    assert.equal(f.service.getOpenDocumentForAcceptance(f.tabId)!.document.layers.length, 1)
    assert.equal((await f.base.patch.listVerifiedCandidates(f.tabId)).length, 1)
    assert.equal(await f.journal.read(f.tabId, f.request().expectedOwner.documentId), null)
    uncertain = false
    assert.equal(await accept.reconcile(f.tabId), 'none')
    assert.equal(accept.hasPendingHandoff(f.tabId), false)
    const reviewed = f.request()
    reviewed.expectedUnfinishedJobIds = []
    assert.equal((await accept.acceptSmartPatchOrphans(f.tabId, reviewed)).kind, 'accepted')
  })
})

test('ordinary Raster Add refuses a competing cancellation until retained Smart drain reconciles', async () => {
  await fixture('anima', async (f) => {
    const ordinary = await enqueueAnimaStagingBatch(f.base)
    const normalClaim = await f.base.queue.claimNextPending()
    assert.ok(normalClaim)
    const normal = await f.base.staging.publishGenerationCandidate({
      ...(await animaProvisionalOutput(f.base, { bytes: await animaFixturePng(255) })),
      actualSeed: 0,
      expectedStatusSequence: normalClaim.item.statusSequence,
      queueItemId: normalClaim.item.id,
    })
    assert.equal(normal.queueItemId, ordinary.items[0].id)
    const unfinishedOrdinaryIds = ordinary.items.slice(1).map(({ id }) => id)
    assert.ok(unfinishedOrdinaryIds.length > 0, 'Ordinary Add must need its own cancellation.')
    const smartClaim = await f.base.queue.claimNextPendingSmartPatch()
    assert.ok(smartClaim)
    assert.equal(smartClaim.item.id, f.base.siblingId)
    const options = f.optionsFor()
    const accept = new ProjectGenerationAcceptance(options)
    const close = new ProjectGenerationClose(
      f.service,
      {
        orchestrator: f.orchestrator,
        queue: f.base.queue,
        staging: {
          discardProject: async (tabId) => {
            await f.base.staging.discardProject(tabId)
            await f.base.patch.discardProject(tabId)
          },
          listVerifiedCandidates: async (tabId) => [
            ...(await f.base.staging.listVerifiedCandidates(tabId)),
            ...(await f.base.patch.listVerifiedCandidates(tabId)),
          ],
        },
      },
      options.gate,
      (tabId) => accept.hasPendingHandoff(tabId),
    )
    const ordinaryAdd = () =>
      accept.accept(
        f.tabId,
        [normal.candidateId],
        normal.candidateId,
        [normal.candidateId],
        unfinishedOrdinaryIds,
      )
    await assert.rejects(accept.acceptSmartPatchOrphans(f.tabId, f.request()), {
      code: 'CANCELLATION_UNCERTAIN',
    })
    const running = await f.base.queue.getManagerEntry(smartClaim.item.id)
    assert.equal(running.status, 'running')
    assert.equal(running.cancelRequested, true)
    assert.equal(accept.hasPendingHandoff(f.tabId), true)
    await assert.rejects(ordinaryAdd(), { code: 'ACCEPTANCE_HANDOFF_PENDING' })
    assert.throws(() => f.orchestrator.releaseProjectGenerationFence(f.tabId), {
      code: 'CANCELLATION_UNCERTAIN',
    })
    await assert.rejects(close.getCloseImpact(f.tabId), { code: 'PROJECT_ACCEPTANCE_PENDING' })
    assert.deepEqual(f.service.getOpenDocumentForAcceptance(f.tabId)!.document.layers, [f.source])
    assert.equal(await f.journal.read(f.tabId, running.documentId), null)
    assert.equal((await f.base.patch.listVerifiedCandidates(f.tabId)).length, 1)
    assert.equal((await f.base.staging.listVerifiedCandidates(f.tabId)).length, 1)
    for (const id of unfinishedOrdinaryIds) {
      assert.equal((await f.base.queue.getManagerEntry(id)).status, 'pending')
    }
    // This fixture owns the real SQL claim and never started a worker. Only its explicit exit
    // acknowledgement may settle the unknown running owner; an ordinary Add cannot infer it.
    await f.base.queue.acknowledgeCanceledRunning(running.id, running.statusSequence)
    assert.equal(await accept.reconcile(f.tabId), 'none')
    assert.equal(accept.hasPendingHandoff(f.tabId), false)
    f.base.queue.assertProjectCanEnqueue(f.tabId)
    assert.deepEqual(await close.getCloseImpact(f.tabId), {
      completedCandidateCount: 2,
      generationStorageUnavailable: false,
      unfinishedJobCount: unfinishedOrdinaryIds.length,
    })
    for (const id of unfinishedOrdinaryIds) {
      assert.equal((await f.base.queue.getManagerEntry(id)).status, 'pending')
    }
    assert.deepEqual(f.service.getOpenDocumentForAcceptance(f.tabId)!.document.layers, [f.source])
    assert.equal((await ordinaryAdd()).kind, 'accepted')
    for (const id of unfinishedOrdinaryIds) {
      assert.equal((await f.base.queue.getManagerEntry(id)).status, 'canceled')
    }
    const accepted = raster(f.service.getOpenDocumentForAcceptance(f.tabId)!.document.layers[0])
    assert.equal(
      accepted.generationProvenance?.executionResultContext.candidateId,
      normal.candidateId,
    )
    assert.equal((await f.base.patch.listVerifiedCandidates(f.tabId)).length, 1)
    await close.close(f.tabId, { confirmCloseImpact: true, discardDocument: true })
    assert.equal(f.service.getOpenDocumentForAcceptance(f.tabId), null)
    assert.equal(accept.hasPendingHandoff(f.tabId), false)
    assert.deepEqual(await f.base.staging.listVerifiedCandidates(f.tabId), [])
    assert.deepEqual(await f.base.patch.listVerifiedCandidates(f.tabId), [])
  })
})

test('fresh recovery refuses an omitted unselected pruned witness and changed accepted lineage', async () => {
  await fixture('anima', async (f) => {
    const second = await f.publishSibling()
    const options = f.optionsFor()
    options.afterDurableShadow = async () => {
      throw new Error('controlled durable handoff stop')
    }
    const input = f.request()
    input.expectedAvailableIds = [f.candidate.candidateId, second.candidateId]
    input.expectedUnfinishedJobIds = []
    await assert.rejects(
      new ProjectGenerationAcceptance(options).acceptSmartPatchOrphans(f.tabId, input),
      /durable handoff stop/,
    )
    const handoff = await f.journal.read(f.tabId, input.expectedOwner.documentId)
    assert.ok(handoff?.smartPatchSource)
    const incomplete = structuredClone(handoff)
    incomplete.smartPatchSource!.reviewedCandidates =
      incomplete.smartPatchSource!.reviewedCandidates.filter(
        (w) => w.candidateId !== second.candidateId,
      )
    await f.base.queue.pruneTerminal(['completed'])
    await f.base.database.db
      .updateTable('generation_acceptance_journal')
      .set({ payload_json: JSON.stringify(incomplete) })
      .where('operation_id', '=', handoff.operationId)
      .execute()
    const recovery = new ProjectGenerationAcceptance(f.optionsFor())
    await assert.rejects(recovery.reconcile(f.tabId), {
      code: 'QUEUE_INPUT_INVALID',
    })
    assert.equal(recovery.hasPendingHandoff(f.tabId), true)
    assert.equal((await f.base.patch.listVerifiedCandidates(f.tabId)).length, 2)
    await f.base.database.db
      .updateTable('generation_acceptance_journal')
      .set({ payload_json: JSON.stringify(handoff) })
      .where('operation_id', '=', handoff.operationId)
      .execute()
    const owner = f.service.getOpenDocumentForAcceptance(f.tabId)!
    const changed = structuredClone(owner.document)
    const layer = raster(changed.layers[0])
    layer.generationProvenance!.layerSourceContext.sourceDocumentRevision = randomUUID()
    await owner.applyDocument(changed)
    const otherRecovery = new ProjectGenerationAcceptance(f.optionsFor())
    await assert.rejects(otherRecovery.reconcile(f.tabId), { code: 'ACCEPTANCE_RECOVERY_REQUIRED' })
    assert.equal((await f.base.patch.listVerifiedCandidates(f.tabId)).length, 2)
    assert.ok(await f.journal.read(f.tabId, owner.document.documentId))
  })
})

test('frozen Retry pending in a fresh session is reviewed and canceled by orphan Raster Add while other targets and ordinary jobs survive', async () => {
  await fixture('illustrious', async (f) => {
    const retry = await f.retryFailedSibling()
    const retryRow = await f.base.database.db
      .selectFrom('generation_queue_item')
      .selectAll()
      .where('id', '=', retry.id)
      .executeTakeFirstOrThrow()
    const otherManifest = structuredClone(f.base.material.manifest)
    otherManifest.context.layerId = randomUUID()
    const otherMaterial = await parseSmartPatchInputMaterial(otherManifest, f.base.material.files)
    const otherPatchJobs = await admitSmartPatch(f.base, { material: otherMaterial })
    const ordinary = await enqueueAnimaStagingBatch(f.base)
    const saved = await readFile(f.base.projectPath)
    let recorded: GenerationAcceptanceHandoff | undefined
    const options = f.optionsFor()
    options.journal = {
      abandon: f.journal.abandon.bind(f.journal),
      complete: f.journal.complete.bind(f.journal),
      read: f.journal.read.bind(f.journal),
      record: async (handoff) => {
        recorded = structuredClone(handoff)
        assert.equal(
          (await f.base.queue.getManagerEntry(retry.id)).status,
          'canceled',
          'All reviewed target sessions drain before intent creation.',
        )
        await f.journal.record(handoff)
      },
    }
    const input = f.request()
    input.expectedUnfinishedJobIds = [retry.id]
    const result = await new ProjectGenerationAcceptance(options).acceptSmartPatchOrphans(
      f.tabId,
      input,
    )
    assert.equal(result.kind, 'accepted')
    assert.equal(result.layerIds.length, 1, 'The pending Retry must never be implicitly accepted.')
    assert.ok(recorded?.smartPatchSource)
    assert.deepEqual(recorded.smartPatchSource.reviewedJobs, [
      {
        frozenPayloadSha256: digest(Buffer.from(retryRow.frozen_payload_json)),
        jobId: retry.id,
        stagingSessionId: retry.stagingSessionId,
      },
    ])
    assert.deepEqual(
      [...recorded.stagingSessionIds].sort(),
      [f.candidate.stagingSessionId, retry.stagingSessionId].sort(),
    )
    for (const item of [...otherPatchJobs, ...ordinary.items]) {
      assert.equal(
        (await f.base.queue.getManagerEntry(item.id)).status,
        'pending',
        'Another target or ordinary job is outside the reviewed cancellation scope.',
      )
    }
    const tombstones = await f.base.database.db
      .selectFrom('generation_staging_discarded_session')
      .select('staging_session_id')
      .where('local_project_key', '=', f.tabId)
      .execute()
    assert.deepEqual(
      tombstones.map((row) => row.staging_session_id).sort(),
      [...recorded.stagingSessionIds].sort(),
    )
    assert.deepEqual(await f.base.patch.listVerifiedCandidates(f.tabId), [])
    const layer = raster(f.service.getOpenDocumentForAcceptance(f.tabId)!.document.layers[0])
    assert.equal(layer.asset.sha256, f.candidate.image.sha256)
    assert.equal(
      layer.generationProvenance?.executionResultContext.candidateId,
      f.candidate.candidateId,
    )
    assert.equal((await readFile(f.base.projectPath)).equals(saved), true)
  })
})

test('pending-only Retry session has a strict frozen job witness through post-shadow restart and queue pruning', async () => {
  await fixture('anima', async (f) => {
    const retry = await f.retryFailedSibling()
    const options = f.optionsFor()
    options.afterDurableShadow = async () => {
      throw new Error('controlled pending-session handoff stop')
    }
    const input = f.request()
    input.expectedUnfinishedJobIds = [retry.id]
    const accepting = new ProjectGenerationAcceptance(options)
    await assert.rejects(
      accepting.acceptSmartPatchOrphans(f.tabId, input),
      /pending-session handoff stop/,
    )
    const handoff = await f.journal.read(f.tabId, input.expectedOwner.documentId)
    assert.ok(handoff?.smartPatchSource?.reviewedJobs?.length)
    assert.equal(handoff.smartPatchSource.reviewedJobs[0].jobId, retry.id)
    const missingJobProof = structuredClone(handoff)
    delete missingJobProof.smartPatchSource!.reviewedJobs
    await assert.rejects(f.journal.record(missingJobProof), {
      code: 'ACCEPTANCE_JOURNAL_INPUT_INVALID',
    })
    const crossedJobSession = structuredClone(handoff)
    crossedJobSession.smartPatchSource!.reviewedJobs![0].stagingSessionId = randomUUID()
    await assert.rejects(f.journal.record(crossedJobSession), {
      code: 'ACCEPTANCE_JOURNAL_INPUT_INVALID',
    })
    await f.base.queue.pruneTerminal(['completed', 'failed', 'canceled'])
    const service = f.newService()
    await service.resolveRecovery(f.tabId, 'recover')
    const recovered = new ProjectGenerationAcceptance(
      f.optionsFor(service, f.makeOrchestrator(service)),
    )
    assert.equal(await recovered.reconcile(f.tabId), 'cleaned')
    assert.equal(service.getOpenDocumentForAcceptance(f.tabId)!.document.layers.length, 2)
    assert.equal(await f.journal.read(f.tabId, input.expectedOwner.documentId), null)
    assert.deepEqual(await f.base.patch.listVerifiedCandidates(f.tabId), [])
  })
})

test('fresh-session Retry source changes before cancellation refuse without consuming the committed candidate', async () => {
  await fixture('illustrious', async (f) => {
    const retry = await f.retryFailedSibling()
    const row = await f.base.database.db
      .selectFrom('generation_queue_item')
      .selectAll()
      .where('id', '=', retry.id)
      .executeTakeFirstOrThrow()
    const changed = JSON.parse(row.frozen_payload_json)
    changed.context.layerId = randomUUID()
    let reads = 0
    const options = f.optionsFor()
    options.smartPatch = {
      ...options.smartPatch!,
      queue: {
        listSmartPatchAcceptanceSessionJobs: f.base.queue.listSmartPatchAcceptanceSessionJobs.bind(
          f.base.queue,
        ),
        listUnfinishedSmartPatchJobsByProject:
          f.base.queue.listUnfinishedSmartPatchJobsByProject.bind(f.base.queue),
        loadVerifiedSmartPatchInput: async (id) => {
          if (id === retry.id && ++reads === 2) {
            await f.base.database.db
              .updateTable('generation_queue_item')
              .set({ frozen_payload_json: JSON.stringify(changed) })
              .where('id', '=', retry.id)
              .execute()
          }
          return await f.base.queue.loadVerifiedSmartPatchInput(id)
        },
      },
    }
    const input = f.request()
    input.expectedUnfinishedJobIds = [retry.id]
    try {
      await assert.rejects(
        new ProjectGenerationAcceptance(options).acceptSmartPatchOrphans(f.tabId, input),
        { code: 'QUEUE_INPUT_INVALID' },
      )
    } finally {
      await f.base.database.db
        .updateTable('generation_queue_item')
        .set({ frozen_payload_json: row.frozen_payload_json })
        .where('id', '=', retry.id)
        .execute()
    }
    assert.equal((await f.base.queue.getManagerEntry(retry.id)).status, 'pending')
    assert.equal((await f.base.patch.listVerifiedCandidates(f.tabId)).length, 1)
    assert.equal(f.service.getOpenDocumentForAcceptance(f.tabId)!.document.layers.length, 1)
    assert.equal(await f.journal.read(f.tabId, input.expectedOwner.documentId), null)
  })
})

test('completion in a reviewed pending-only Retry session requires renewed candidate review and never silently accepts it', async () => {
  await fixture('anima', async (f) => {
    const retry = await f.retryFailedSibling()
    // The generation fence blocks new claims. Complete an already-running attempt to model
    // an actual worker finishing while its reviewed cancellation is being requested.
    const runningClaim = await f.base.queue.claimNextPendingSmartPatch()
    assert.ok(runningClaim)
    assert.equal(runningClaim.item.id, retry.id)
    const options = f.optionsFor()
    options.smartPatch = {
      ...options.smartPatch!,
      orchestrator: {
        cancelSmartPatchAcceptanceJobs: async (scope) => {
          const completed = await f.publishSibling(runningClaim)
          assert.equal(completed.candidateId, retry.id)
          await f.orchestrator.cancelSmartPatchAcceptanceJobs(scope)
        },
      },
    }
    const input = f.request()
    input.expectedUnfinishedJobIds = [retry.id]
    await assert.rejects(
      new ProjectGenerationAcceptance(options).acceptSmartPatchOrphans(f.tabId, input),
      { code: 'ACCEPTANCE_SELECTION_STALE' },
    )
    assert.equal(f.service.getOpenDocumentForAcceptance(f.tabId)!.document.layers.length, 1)
    assert.deepEqual(
      (await f.base.patch.listVerifiedCandidates(f.tabId))
        .map((candidate) => candidate.candidateId)
        .sort(),
      [f.candidate.candidateId, retry.id].sort(),
    )
    assert.equal(await f.journal.read(f.tabId, input.expectedOwner.documentId), null)
  })
})

for (const cleanup of ['delete', 'prune'] as const) {
  test(`orphan Raster Add tolerates canceled fresh Retry ${cleanup} between cancellation and reread`, async () => {
    await fixture('illustrious', async (f) => {
      const retry = await f.retryFailedSibling()
      const otherManifest = structuredClone(f.base.material.manifest)
      otherManifest.context.layerId = randomUUID()
      const material = await parseSmartPatchInputMaterial(otherManifest, f.base.material.files)
      const otherPatch = await admitSmartPatch(f.base, { material })
      const ordinary = await enqueueAnimaStagingBatch(f.base)
      const actualCancel = f.base.queue.cancel.bind(f.base.queue)
      let cleaned = false
      f.base.queue.cancel = async (...args) => {
        const canceled = await actualCancel(...args)
        if (canceled.id === retry.id && canceled.status === 'canceled' && !cleaned) {
          await (cleanup === 'delete'
            ? f.base.queue.deleteTerminal(canceled.id, canceled.statusSequence)
            : f.base.queue.pruneTerminal(['canceled']))
          cleaned = true
        }
        return canceled
      }
      try {
        const input = f.request()
        input.expectedUnfinishedJobIds = [retry.id]
        const accept = new ProjectGenerationAcceptance(f.optionsFor())
        const result = await accept.acceptSmartPatchOrphans(f.tabId, input)
        assert.equal(cleaned, true)
        assert.equal(result.kind, 'accepted')
        assert.equal(result.layerIds.length, 1)
        assert.equal(accept.hasPendingHandoff(f.tabId), false)
        assert.equal(
          await accept.reconcile(f.tabId),
          'none',
          'Recovery must not need an app restart.',
        )
        f.base.queue.assertProjectCanEnqueue(f.tabId)
        await assert.rejects(f.base.queue.getManagerEntry(retry.id), {
          code: 'QUEUE_ITEM_NOT_FOUND',
        })
        for (const item of [...otherPatch, ...ordinary.items]) {
          assert.equal((await f.base.queue.getManagerEntry(item.id)).status, 'pending')
        }
        const owner = f.service.getOpenDocumentForAcceptance(f.tabId)!
        const accepted = raster(owner.document.layers[0])
        assert.equal(accepted.asset.sha256, f.candidate.image.sha256)
        assert.equal(
          accepted.generationProvenance?.executionResultContext.candidateId,
          f.candidate.candidateId,
        )
        assert.deepEqual(owner.document.layers.slice(1), [f.source])
        assert.equal(await f.journal.read(f.tabId, owner.document.documentId), null)
        assert.deepEqual(await f.base.patch.listVerifiedCandidates(f.tabId), [])
      } finally {
        f.base.queue.cancel = actualCancel
      }
    })
  })
}

test('deleted fresh Retry retains orphan Raster cancellation fence until scoped physical drain is confirmed', async () => {
  await fixture('anima', async (f) => {
    const retry = await f.retryFailedSibling()
    const actualCancel = f.base.queue.cancel.bind(f.base.queue)
    const actualDrain = f.orchestrator.quiesceSmartPatchForProject.bind(f.orchestrator)
    let deleted = false
    let allowDrain = false
    let drainCalls = 0
    f.base.queue.cancel = async (...args) => {
      const canceled = await actualCancel(...args)
      if (canceled.id === retry.id && canceled.status === 'canceled' && !deleted) {
        await f.base.queue.deleteTerminal(canceled.id, canceled.statusSequence)
        deleted = true
      }
      return canceled
    }
    // Controlled lost physical acknowledgement at the real Orchestrator drain boundary. The
    // queue cancellation/deletion, immutable witnesses, document and recovery owners stay real.
    f.orchestrator.quiesceSmartPatchForProject = async (tabId, sessions) => {
      assert.equal(tabId, f.tabId)
      assert.deepEqual(sessions, [retry.stagingSessionId])
      drainCalls++
      await actualDrain(tabId, sessions)
      if (!allowDrain) {
        throw Object.assign(new Error('Declared missing-row physical drain uncertainty'), {
          code: 'WORKER_EXIT_UNCONFIRMED',
        })
      }
    }
    const input = f.request()
    input.expectedUnfinishedJobIds = [retry.id]
    const scopes: SmartPatchAcceptanceCancellationScope[] = []
    const options = f.optionsFor()
    options.smartPatch = {
      ...options.smartPatch!,
      orchestrator: {
        cancelSmartPatchAcceptanceJobs: async (scope) => {
          scopes.push(structuredClone(scope))
          await f.orchestrator.cancelSmartPatchAcceptanceJobs(scope)
        },
      },
    }
    const accept = new ProjectGenerationAcceptance(options)
    try {
      await assert.rejects(accept.acceptSmartPatchOrphans(f.tabId, input), {
        code: 'WORKER_EXIT_UNCONFIRMED',
      })
      assert.equal(deleted, true)
      assert.equal(drainCalls, 1)
      assert.equal(accept.hasPendingHandoff(f.tabId), true)
      assert.throws(() => f.orchestrator.releaseProjectGenerationFence(f.tabId), {
        code: 'CANCELLATION_UNCERTAIN',
      })
      assert.ok(scopes[0].reviewedJobs?.length)
      const changedHash = structuredClone(scopes[0])
      changedHash.reviewedJobs = changedHash.reviewedJobs!.map((job) => ({
        ...job,
        frozenPayloadSha256: '0'.repeat(64),
      }))
      await assert.rejects(f.orchestrator.cancelSmartPatchAcceptanceJobs(changedHash), {
        code: 'CANCELLATION_UNCERTAIN',
      })
      const missingProof = structuredClone(scopes[0])
      delete missingProof.reviewedJobs
      await assert.rejects(f.orchestrator.cancelSmartPatchAcceptanceJobs(missingProof), {
        code: 'CANCELLATION_UNCERTAIN',
      })
      assert.equal(drainCalls, 1, 'Changed or dropped job proof cannot reenter the retained drain.')
      assert.deepEqual(f.service.getOpenDocumentForAcceptance(f.tabId)!.document.layers, [f.source])
      assert.equal(await f.journal.read(f.tabId, input.expectedOwner.documentId), null)
      assert.deepEqual(
        (await f.base.patch.listVerifiedCandidates(f.tabId)).map(({ candidateId }) => candidateId),
        [f.candidate.candidateId],
      )
      await assert.rejects(accept.reconcile(f.tabId), { code: 'WORKER_EXIT_UNCONFIRMED' })
      assert.equal(accept.hasPendingHandoff(f.tabId), true)
      allowDrain = true
      assert.equal(await accept.reconcile(f.tabId), 'none')
      assert.equal(accept.hasPendingHandoff(f.tabId), false)
      f.base.queue.assertProjectCanEnqueue(f.tabId)
      assert.ok(drainCalls >= 3)
      assert.equal((await f.base.patch.listVerifiedCandidates(f.tabId)).length, 1)
      const reviewedAgain = f.request()
      reviewedAgain.expectedUnfinishedJobIds = []
      assert.equal((await accept.acceptSmartPatchOrphans(f.tabId, reviewedAgain)).kind, 'accepted')
    } finally {
      f.base.queue.cancel = actualCancel
      f.orchestrator.quiesceSmartPatchForProject = actualDrain
    }
  })
})
