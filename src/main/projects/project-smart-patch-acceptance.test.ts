import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import {
  createEmptyProjectDocumentV1,
  type IgsSmartPatchLayerV1,
} from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import type { ProjectSmartPatchAcceptanceOptions } from './project-smart-patch-acceptance.js'
import type { SmartPatchWorldCandidateFixture } from './test-fixtures/smart-patch-world-candidate.js'

import { GenerationOrchestrator } from './generation-orchestrator.js'
import { GenerationProcessor } from './generation-processor.js'
import { readIgsPackage, saveIgsPackage } from './igs-package.js'
import { ProjectAutosaveLeaseRegistry, type ProjectAutosaveOptions } from './project-autosave.js'
import { ProjectGenerationClose } from './project-generation-close.js'
import { ProjectGenerationOperationGate } from './project-generation-operation-gate.js'
import { ProjectIndexRepository } from './project-index.js'
import { encodeProjectMaskPng } from './project-mask.js'
import { readProjectPlaceholders } from './project-placeholders.js'
import { ProjectService } from './project-service.js'
import { ProjectShadowStore } from './project-shadow.js'
import { ProjectSmartPatchAcceptance } from './project-smart-patch-acceptance.js'
import { SmartPatchAcceptanceJournalRepository } from './smart-patch-acceptance-journal.js'
import { withSmartPatchWorldCandidateFixture } from './test-fixtures/smart-patch-world-candidate.js'
import { createSourceOutputWorkerOwner } from './test-fixtures/source-output-worker.js'

const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
type Family = 'anima' | 'illustrious'
type Fixture = Awaited<ReturnType<typeof prepareFixture>>

/**
 * Real SQL, Project service/coordinator, portable files, source CPU child and Add owner. Model
 * output is declared literal staging input; native inference is separately exercised in
 * project-smart-patch-execution.test.ts. Failure collaborators are injected only at named
 * boundaries.
 */
async function fixture(family: Family, use: (f: Fixture) => Promise<void>) {
  await withSmartPatchWorldCandidateFixture(family, async (base) => {
    const f = await prepareFixture(base)
    try {
      await use(f)
    } finally {
      f.setBeforeCommit(undefined)
      await f.cpu.cleanup()
      for (const service of f.services) {
        for (const tab of service.getOpenTabs()) {
          await service.discardAndClose(tab.id)
        }
      }
    }
  })
}
async function prepareFixture(base: SmartPatchWorldCandidateFixture) {
  const context = base.material.manifest.context
  const document = createEmptyProjectDocumentV1({
    documentId: context.documentId,
    documentRevision: context.documentRevision,
    title: 'Durable Patch Add',
  })
  document.primaryBbox = { ...context.bbox }
  const patch: IgsSmartPatchLayerV1 = {
    activeRasterSubLayerId: null,
    blendMode: 'normal',
    boundingBox: { ...context.bbox },
    coherenceSettings: { ...context.coherenceSettings },
    generationDraft: structuredClone(context.generationDraft),
    id: context.layerId,
    internalResolution: { ...context.internalResolution },
    kind: 'smart-patch',
    locked: false,
    mask: structuredClone(context.mask),
    maskSettings: { ...context.maskSettings },
    name: 'Exact target',
    opacity: 1,
    rasterSubLayers: [],
    visible: true,
  }
  const sourceBytes = base.material.files['source.png']
  const sourceId = context.sourceLayerIds[0]
  const source = {
    asset: {
      bytes: sourceBytes.length,
      height: 128,
      path: `assets/layers/${sourceId}.png`,
      sha256: digest(sourceBytes),
      width: 128,
    },
    blendMode: 'normal' as const,
    id: sourceId,
    kind: 'raster' as const,
    locked: false,
    name: 'Below source',
    opacity: 1,
    transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: context.bbox.x, y: context.bbox.y },
    visible: true,
  }
  document.layers = [patch, source]
  const assets = {
    [source.asset.path]: { bytes: sourceBytes },
    ...(patch.mask.asset
      ? { [patch.mask.asset.path]: { bytes: encodeProjectMaskPng(Uint8Array.of(1), 1, 1) } }
      : {}),
  }
  await saveIgsPackage(base.projectPath, {
    assets,
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
  // Workspace catalog is a declared fixture precondition: the real package stays at the exact
  // frozen queue path. No production import/adoption behavior is reimplemented here.
  await base.database.db
    .updateTable('project_workspace')
    .set({ directory_path: base.root })
    .where('id', '=', workspace.id)
    .execute()
  await repository.indexSaved(base.projectPath, workspace.id)
  // Default-workspace discovery is a declared catalog collaborator, independent from acceptance.
  // Index validation, package loading, Service editing and recovery stay real.
  repository.ensureDefaultWorkspace = async () => ({ ...workspace, directoryPath: base.root })
  const shadow = new ProjectShadowStore(path.join(base.root, 'autosave'))
  let beforeCommit: ProjectAutosaveOptions['beforeEditCommit']
  const services: ProjectService[] = []
  const newService = () => {
    const service = new ProjectService({
      autosaveOptions: {
        beforeEditCommit: async (d) => beforeCommit?.(d),
        debounceMs: 60_000,
        leaseRegistry: new ProjectAutosaveLeaseRegistry(),
      },
      dataRoot: base.root,
      repository,
      roots: {
        placeholdersDir: path.resolve('src/main/projects/placeholders'),
        scratchDir: base.scratch,
      },
      shadow,
    })
    services.push(service)
    return service
  }
  const service = newService()
  const opened = await service.open(base.nomination.localProjectKey)
  assert.equal(opened.kind, 'opened')
  const tabId = base.nomination.localProjectKey
  const candidate = await base.publish()
  const gate = new ProjectGenerationOperationGate()
  const models = { ...base.models, ...base.modelService }
  const orchestrator = new GenerationOrchestrator(
    service,
    repository,
    models,
    base.queue,
    base.staging,
    new GenerationProcessor(base.queue, base.staging, models, base.scratch),
    base.scratch,
  )
  const journal = new SmartPatchAcceptanceJournalRepository(base.database.db)
  const cpu = await createSourceOutputWorkerOwner(base)
  const worker = await cpu.start(new AbortController().signal)
  const input = {
    candidateIds: [candidate.candidateId],
    expectedAvailableIds: [candidate.candidateId],
    expectedUnfinishedJobIds: [base.siblingId],
    focusedCandidateId: candidate.candidateId,
    worker,
  }
  const options: ProjectSmartPatchAcceptanceOptions = {
    gate,
    journal,
    normalStaging: base.staging,
    orchestrator,
    projects: service,
    queue: base.queue,
    staging: base.patch,
  }
  const sql = async () => ({
    cursor: await base.database.db.selectFrom('generation_seed_cursor').selectAll().execute(),
    receipts: await base.database.db
      .selectFrom('generation_candidate_receipt')
      .selectAll()
      .execute(),
  })
  return {
    base,
    candidate,
    cpu,
    gate,
    input,
    journal,
    newService,
    options,
    orchestrator,
    service,
    services,
    setBeforeCommit: (hook: ProjectAutosaveOptions['beforeEditCommit']) => {
      beforeCommit = hook
    },
    shadow,
    sql,
    tabId,
  }
}

for (const family of ['illustrious', 'anima'] as const) {
  test(`durable ${family} Add entry cancels reviewed sibling, owns pixels before tombstone and remains one Undo through explicit Save/reopen`, async () => {
    await fixture(family, async (f) => {
      const owner = f.service.getOpenDocumentForAcceptance(f.tabId)!
      const before = structuredClone(owner.document)
      const saved = await readFile(f.base.projectPath)
      const immutable = await f.sql()
      let completed = 0
      const accept = new ProjectSmartPatchAcceptance({
        ...f.options,
        journal: {
          ...f.journal,
          abandon: f.journal.abandon.bind(f.journal),
          complete: async (handoff) => {
            const recovery = await f.shadow.inspect({
              projectPath: f.base.projectPath,
              savedPackage: await readIgsPackage(f.base.projectPath),
            })
            assert.equal(
              recovery.status,
              'recoverable',
              'Shadow must precede irreversible result tombstones.',
            )
            assert.equal(owner.document.layers[0].kind, 'smart-patch')
            assert.equal((await f.base.patch.listVerifiedCandidates(f.tabId)).length, 1)
            completed++
            await f.journal.complete(handoff)
          },
          read: f.journal.read.bind(f.journal),
          record: f.journal.record.bind(f.journal),
        },
      })
      const result = await accept.accept(f.tabId, f.input)
      assert.equal(result.kind, 'accepted')
      assert.equal(completed, 1)
      assert.equal(accept.hasPendingHandoff(f.tabId), false)
      const current = owner.document.layers[0]
      assert.ok(current.kind === 'smart-patch')
      assert.equal(current.rasterSubLayers.length, 1)
      assert.equal(current.activeRasterSubLayerId, result.variantIds[0])
      assert.deepEqual(current.boundingBox, (before.layers[0] as IgsSmartPatchLayerV1).boundingBox)
      assert.deepEqual(current.rasterSubLayers[0].bbox, f.candidate.bbox)
      const provenance = current.rasterSubLayers[0].generationProvenance
      assert.equal(provenance.kind, `${family}-smart-patch`)
      assert.equal(provenance.generationConfiguration.sampling.actualSeed, 0)
      assert.equal((await readFile(f.base.projectPath)).equals(saved), true, 'Add does not Save.')
      assert.deepEqual(
        await f.sql(),
        immutable,
        'Add cannot rewrite seed cursor or completed receipt.',
      )
      assert.equal((await f.base.queue.getManagerEntry(f.base.siblingId)).status, 'canceled')
      assert.deepEqual(await f.base.patch.listVerifiedCandidates(f.tabId), [])
      assert.equal(await f.journal.read(f.tabId, before.documentId), null)
      const repeated = await accept.accept(f.tabId, f.input)
      assert.equal(repeated.kind, 'already-accepted')
      assert.deepEqual(repeated.variantIds, result.variantIds)
      await f.service.undo(f.tabId)
      assert.deepEqual(owner.document.layers, before.layers)
      assert.equal(owner.canUndo, false)
      await f.service.redo(f.tabId)
      await f.service.save(f.tabId)
      const archive = await readIgsPackage(f.base.projectPath)
      assert.equal(
        (await archive.readMember(current.rasterSubLayers[0].asset.path)).equals(
          f.base.outputBytes,
        ),
        true,
      )
      await f.service.close(f.tabId)
      const reopened = await f.service.open(f.tabId)
      assert.equal(reopened.kind, 'opened')
      const stored = f.service.getOpenDocumentForAcceptance(f.tabId)!.document.layers[0]
      assert.ok(stored.kind === 'smart-patch')
      assert.deepEqual(stored.rasterSubLayers, current.rasterSubLayers)
    })
  })
}

test('post-shadow interruption retains intent, candidates and close fence; new owner reconciles without reappending', async () => {
  await fixture('illustrious', async (f) => {
    const accept = new ProjectSmartPatchAcceptance({
      ...f.options,
      afterDurableShadow: async () => {
        throw new Error('controlled post-shadow interruption')
      },
    })
    await assert.rejects(accept.accept(f.tabId, f.input), /controlled post-shadow/)
    assert.equal(accept.hasPendingHandoff(f.tabId), true)
    assert.equal((await f.base.patch.listVerifiedCandidates(f.tabId)).length, 1)
    const before = structuredClone(f.service.getOpenDocumentForAcceptance(f.tabId)!.document)
    const close = new ProjectGenerationClose(
      f.service,
      { orchestrator: f.orchestrator, queue: f.base.queue, staging: f.base.staging },
      f.gate,
      (tab) => accept.hasPendingHandoff(tab),
    )
    await assert.rejects(
      close.close(f.tabId, { confirmCloseImpact: true, discardDocument: true }),
      { code: 'PROJECT_ACCEPTANCE_PENDING' },
    )
    const fresh = f.newService()
    await fresh.resolveRecovery(f.tabId, 'recover')
    // Fresh lease registry simulates process restart. No physical process kill is claimed.
    const newAccept = new ProjectSmartPatchAcceptance({ ...f.options, projects: fresh })
    assert.equal(await newAccept.reconcile(f.tabId), 'cleaned')
    const restored = fresh.getOpenDocumentForAcceptance(f.tabId)!.document
    const { documentRevision: oldRevision, ...oldContent } = before
    const { documentRevision: newRevision, ...newContent } = restored
    assert.notEqual(newRevision, oldRevision, 'Recovery deliberately creates a fresh revision.')
    assert.deepEqual(newContent, oldContent)
    assert.deepEqual(await f.base.patch.listVerifiedCandidates(f.tabId), [])
    assert.equal(await f.journal.read(f.tabId, before.documentId), null)
    assert.equal((await newAccept.accept(f.tabId, f.input)).kind, 'already-accepted')
  })
})

test('lost intent acknowledgement before apply preserves pixels and retry abandons absent lineage before one Add', async () => {
  await fixture('illustrious', async (f) => {
    let fail = true
    const accept = new ProjectSmartPatchAcceptance({
      ...f.options,
      journal: {
        abandon: f.journal.abandon.bind(f.journal),
        complete: f.journal.complete.bind(f.journal),
        read: f.journal.read.bind(f.journal),
        record: async (value) => {
          await f.journal.record(value)
          if (fail) {
            fail = false
            throw new Error('controlled lost journal acknowledgement')
          }
        },
      },
    })
    await assert.rejects(accept.accept(f.tabId, f.input), /controlled lost journal/)
    const owner = f.service.getOpenDocumentForAcceptance(f.tabId)!
    assert.equal((owner.document.layers[0] as IgsSmartPatchLayerV1).rasterSubLayers.length, 0)
    assert.equal((await f.base.patch.listVerifiedCandidates(f.tabId)).length, 1)
    assert.ok(await f.journal.read(f.tabId, owner.document.documentId))
    const retried = await accept.accept(f.tabId, { ...f.input, expectedUnfinishedJobIds: [] })
    assert.equal(retried.kind, 'accepted')
    assert.equal((owner.document.layers[0] as IgsSmartPatchLayerV1).rasterSubLayers.length, 1)
  })
})

test('unconfirmed shadow cannot tombstone staged pixels; exact saved package later proves recovery', async () => {
  await fixture('illustrious', async (f) => {
    const owner = f.service.getOpenDocumentForAcceptance(f.tabId)!
    const originalFlush = owner.flush.bind(owner)
    owner.flush = async () => null
    const accept = new ProjectSmartPatchAcceptance(f.options)
    try {
      await assert.rejects(accept.accept(f.tabId, f.input), {
        code: 'SMART_PATCH_ACCEPTANCE_SHADOW_UNCONFIRMED',
      })
    } finally {
      owner.flush = originalFlush
    }
    assert.equal((await f.base.patch.listVerifiedCandidates(f.tabId)).length, 1)
    assert.ok(await f.journal.read(f.tabId, owner.document.documentId))
    await f.service.save(f.tabId)
    assert.equal(await accept.reconcile(f.tabId), 'cleaned')
    assert.equal(owner.dirty, false)
    assert.deepEqual(await f.base.patch.listVerifiedCandidates(f.tabId), [])
  })
})

test('lost completion acknowledgement after atomic tombstones retries with durable witness after queue prune', async () => {
  await fixture('anima', async (f) => {
    let fail = true
    const accept = new ProjectSmartPatchAcceptance({
      ...f.options,
      journal: {
        abandon: f.journal.abandon.bind(f.journal),
        complete: async (value) => {
          await f.journal.complete(value)
          if (fail) {
            fail = false
            throw new Error('controlled lost completion acknowledgement')
          }
        },
        read: f.journal.read.bind(f.journal),
        record: f.journal.record.bind(f.journal),
      },
    })
    await assert.rejects(accept.accept(f.tabId, f.input), /controlled lost completion/)
    await f.base.queue.pruneTerminal(['completed', 'canceled'])
    assert.equal(accept.hasPendingHandoff(f.tabId), true)
    assert.equal(await accept.reconcile(f.tabId), 'cleaned')
    assert.equal(
      (f.service.getOpenDocumentForAcceptance(f.tabId)!.document.layers[0] as IgsSmartPatchLayerV1)
        .rasterSubLayers.length,
      1,
    )
    assert.deepEqual(await f.base.patch.listVerifiedCandidates(f.tabId), [])
  })
})

for (const state of ['hidden', 'locked', 'orphaned'] as const) {
  test(`${state} exact target refuses Add before cancellation, intent or consumption`, async () => {
    await fixture('illustrious', async (f) => {
      const owner = f.service.getOpenDocumentForAcceptance(f.tabId)!
      const d = structuredClone(owner.document)
      if (state === 'orphaned') {
        d.layers = d.layers.filter((l) => l.id !== f.candidate.payload.context.layerId)
      } else if (state === 'hidden') {
        d.layers[0].visible = false
      } else {
        d.layers[0].locked = true
      }
      await owner.applyDocument(d)
      const before = structuredClone(owner.document)
      const accept = new ProjectSmartPatchAcceptance(f.options)
      await assert.rejects(accept.accept(f.tabId, f.input), {
        code: state === 'orphaned' ? 'SMART_PATCH_TARGET_ORPHANED' : 'SMART_PATCH_TARGET_BLOCKED',
      })
      assert.deepEqual(owner.document, before)
      assert.equal((await f.base.queue.getManagerEntry(f.base.siblingId)).status, 'pending')
      assert.equal(await f.journal.read(f.tabId, before.documentId), null)
      assert.equal((await f.base.patch.listVerifiedCandidates(f.tabId)).length, 1)
      assert.equal(accept.hasPendingHandoff(f.tabId), false)
    })
  })
}

test('changed live blur accepts immutable frozen output as outdated without retargeting current authoring', async () => {
  await fixture('illustrious', async (f) => {
    const owner = f.service.getOpenDocumentForAcceptance(f.tabId)!
    const d = structuredClone(owner.document)
    const layer = d.layers[0] as IgsSmartPatchLayerV1
    layer.maskSettings = { ...layer.maskSettings!, blur: 17 }
    layer.boundingBox = { ...layer.boundingBox, x: 500 }
    await owner.applyDocument(d)
    const accept = new ProjectSmartPatchAcceptance(f.options)
    await accept.accept(f.tabId, f.input)
    const actual = owner.document.layers[0] as IgsSmartPatchLayerV1
    assert.equal(actual.maskSettings!.blur, 17)
    assert.equal(actual.boundingBox.x, 500)
    assert.deepEqual(actual.rasterSubLayers[0].bbox, f.candidate.bbox)
    assert.deepEqual(
      actual.rasterSubLayers[0].generationProvenance.layerSourceContext.maskBlur,
      f.candidate.payload.context.maskSettings.blur,
    )
  })
})

test('a late candidate during cancellation forces renewed review with no intent, append or consumption', async () => {
  await fixture('illustrious', async (f) => {
    const claimed = await f.base.queue.claimNextPendingSmartPatch()
    assert.ok(claimed)
    const root = await mkdtemp(path.join(f.base.scratch, 'smart-patch-request-'))
    const outputPath = path.join(root, 'world-result.png')
    await writeFile(outputPath, f.base.outputBytes, { mode: 0o600 })
    const accept = new ProjectSmartPatchAcceptance({
      ...f.options,
      orchestrator: {
        cancelSmartPatchAcceptanceJobs: async () => {
          // Controlled completion race; actual SQL/staging publication remains the production owner.
          await f.base.patch.publishGenerationCandidate({
            actualSeed: 1,
            expectedProvisionalRoot: root,
            expectedStatusSequence: claimed.item.statusSequence,
            output: {
              byteSize: f.base.outputBytes.length,
              colorSpace: 'srgb',
              height: 128,
              iccSha256: IGS_SRGB_ICC_SHA256,
              path: outputPath,
              sha256: digest(f.base.outputBytes),
              width: 128,
            },
            provisionalOutputPath: outputPath,
            queueItemId: claimed.item.id,
          })
        },
        fenceProjectGeneration: f.orchestrator.fenceProjectGeneration.bind(f.orchestrator),
        releaseProjectGenerationFence: f.orchestrator.releaseProjectGenerationFence.bind(
          f.orchestrator,
        ),
      },
    })
    await assert.rejects(accept.accept(f.tabId, f.input), {
      code: 'SMART_PATCH_ACCEPTANCE_SELECTION_STALE',
    })
    const owner = f.service.getOpenDocumentForAcceptance(f.tabId)!
    assert.equal((owner.document.layers[0] as IgsSmartPatchLayerV1).rasterSubLayers.length, 0)
    assert.equal(await f.journal.read(f.tabId, owner.document.documentId), null)
    assert.equal((await f.base.patch.listVerifiedCandidates(f.tabId)).length, 2)
    assert.equal(accept.hasPendingHandoff(f.tabId), false)
  })
})

test('partial or altered immutable lineage keeps intent, candidate and generation fence for explicit repair', async () => {
  await fixture('illustrious', async (f) => {
    const accept = new ProjectSmartPatchAcceptance({
      ...f.options,
      afterDurableShadow: async () => {
        throw new Error('controlled post-shadow interruption')
      },
    })
    await assert.rejects(accept.accept(f.tabId, f.input))
    const owner = f.service.getOpenDocumentForAcceptance(f.tabId)!
    const d = structuredClone(owner.document)
    const variant = (d.layers[0] as IgsSmartPatchLayerV1).rasterSubLayers[0]
    variant.bbox.x++
    variant.generationProvenance.layerSourceContext.bbox.x++
    await owner.applyDocument(d)
    await assert.rejects(accept.reconcile(f.tabId), { code: 'SMART_PATCH_ACCEPTANCE_CONFLICT' })
    assert.ok(await f.journal.read(f.tabId, owner.document.documentId))
    assert.equal((await f.base.patch.listVerifiedCandidates(f.tabId)).length, 1)
    assert.equal(accept.hasPendingHandoff(f.tabId), true)
  })
})

test('real precommit edit race retains intent and candidate while refusing the stale append', async () => {
  await fixture('illustrious', async (f) => {
    const owner = f.service.getOpenDocumentForAcceptance(f.tabId)!
    let once = true
    f.setBeforeCommit(async () => {
      if (once) {
        once = false
        await f.service.updateSmartPatchLayer(f.tabId, f.candidate.payload.context.layerId, {
          kind: 'lock',
          locked: true,
        })
      }
    })
    const accept = new ProjectSmartPatchAcceptance(f.options)
    await assert.rejects(accept.accept(f.tabId, f.input), { code: 'EDIT_CONFLICT' })
    assert.equal((owner.document.layers[0] as IgsSmartPatchLayerV1).rasterSubLayers.length, 0)
    assert.equal((await f.base.patch.listVerifiedCandidates(f.tabId)).length, 1)
    assert.equal(accept.hasPendingHandoff(f.tabId), true)
    f.setBeforeCommit(undefined)
    assert.equal(await accept.reconcile(f.tabId), 'none')
    assert.equal(await f.journal.read(f.tabId, owner.document.documentId), null)
  })
})

test('accepted/staged overlap without a journal is fenced instead of silently consuming or claiming replay', async () => {
  await fixture('illustrious', async (f) => {
    const plan = await f.service.prepareSmartPatchVariantAcceptance(f.tabId, {
      acceptedAt: '2026-10-15T12:00:00.000Z',
      candidateIds: f.input.candidateIds,
      expectedAvailableIds: f.input.expectedAvailableIds,
      focusedCandidateId: f.input.focusedCandidateId,
      staging: f.base.patch,
      worker: f.input.worker,
    })
    const variant = plan.proposedVariants[0].variant
    await f.service.appendSmartPatchVariants(
      f.tabId,
      {
        acceptedVariants: [variant],
        activeVariantId: variant.id,
        documentId: plan.documentId,
        expectedDocumentRevision: plan.documentRevision,
        targetLayerId: plan.layerId,
      },
      { [variant.asset.path]: { sourcePath: f.candidate.assetPath } },
    )
    const accept = new ProjectSmartPatchAcceptance(f.options)
    assert.equal(await accept.hasUnjournaledOverlap(f.tabId), true)
    await assert.rejects(accept.reconcile(f.tabId), { code: 'SMART_PATCH_ACCEPTANCE_PENDING' })
    await assert.rejects(accept.accept(f.tabId, f.input), {
      code: 'SMART_PATCH_ACCEPTANCE_PENDING',
    })
    assert.equal((await f.base.patch.listVerifiedCandidates(f.tabId)).length, 1)
    assert.equal((await f.base.queue.getManagerEntry(f.base.siblingId)).status, 'pending')
    assert.equal(accept.hasPendingHandoff(f.tabId), true)
    assert.equal(await f.journal.read(f.tabId, plan.documentId), null)
  })
})

test('caller mutations before the admission await cannot replace selected IDs or reviewed cancellation jobs', async () => {
  await fixture('illustrious', async (f) => {
    const accept = new ProjectSmartPatchAcceptance(f.options)
    const input = {
      ...f.input,
      candidateIds: [...f.input.candidateIds],
      expectedAvailableIds: [...f.input.expectedAvailableIds],
      expectedUnfinishedJobIds: [...f.input.expectedUnfinishedJobIds],
    }
    const adding = accept.accept(f.tabId, input)
    input.candidateIds[0] = randomUUID()
    input.expectedAvailableIds.length = 0
    input.expectedUnfinishedJobIds.length = 0
    const result = await adding
    assert.equal(result.kind, 'accepted')
    assert.equal((await f.base.queue.getManagerEntry(f.base.siblingId)).status, 'canceled')
    const variant = (
      f.service.getOpenDocumentForAcceptance(f.tabId)!.document.layers[0] as IgsSmartPatchLayerV1
    ).rasterSubLayers[0]
    assert.equal(
      variant.generationProvenance.executionResultContext.candidateId,
      f.candidate.candidateId,
    )
  })
})

test('an unsynced actual shadow retains the intent and pixels until a confirmed retry', async () => {
  await fixture('illustrious', async (f) => {
    const owner = f.service.getOpenDocumentForAcceptance(f.tabId)!
    const flush = owner.flush.bind(owner)
    owner.flush = async () => {
      const commit = await flush()
      assert.ok(commit)
      return { ...commit, directorySynced: false }
    }
    const accept = new ProjectSmartPatchAcceptance(f.options)
    try {
      await assert.rejects(accept.accept(f.tabId, f.input), {
        code: 'SMART_PATCH_ACCEPTANCE_SHADOW_UNCONFIRMED',
      })
    } finally {
      owner.flush = flush
    }
    assert.equal((await f.base.patch.listVerifiedCandidates(f.tabId)).length, 1)
    assert.ok(await f.journal.read(f.tabId, owner.document.documentId))
    assert.equal(accept.hasPendingHandoff(f.tabId), true)
    assert.equal(await accept.reconcile(f.tabId), 'cleaned')
    assert.deepEqual(await f.base.patch.listVerifiedCandidates(f.tabId), [])
  })
})

test('a fence acknowledgement failure retains recovery protection and a successful retry can release it', async () => {
  await fixture('illustrious', async (f) => {
    let fail = true
    const accept = new ProjectSmartPatchAcceptance({
      ...f.options,
      orchestrator: {
        cancelSmartPatchAcceptanceJobs: f.orchestrator.cancelSmartPatchAcceptanceJobs.bind(
          f.orchestrator,
        ),
        fenceProjectGeneration: async (tab) => {
          await f.orchestrator.fenceProjectGeneration(tab)
          if (fail) {
            fail = false
            throw new Error('controlled fence acknowledgement failure')
          }
        },
        releaseProjectGenerationFence: f.orchestrator.releaseProjectGenerationFence.bind(
          f.orchestrator,
        ),
      },
    })
    await assert.rejects(accept.accept(f.tabId, f.input), /controlled fence acknowledgement/)
    assert.equal(accept.hasPendingHandoff(f.tabId), true)
    assert.equal((await f.base.queue.getManagerEntry(f.base.siblingId)).status, 'pending')
    assert.equal((await f.base.patch.listVerifiedCandidates(f.tabId)).length, 1)
    assert.equal(await accept.reconcile(f.tabId), 'none')
    assert.equal(accept.hasPendingHandoff(f.tabId), false)
  })
})

test('absent-lineage abandonment restores its intent when a real Redo races the SQL acknowledgement', async () => {
  await fixture('illustrious', async (f) => {
    const interrupted = new ProjectSmartPatchAcceptance({
      ...f.options,
      afterDurableShadow: async () => {
        throw new Error('controlled post-shadow interruption')
      },
    })
    await assert.rejects(interrupted.accept(f.tabId, f.input))
    const owner = f.service.getOpenDocumentForAcceptance(f.tabId)!
    await f.service.undo(f.tabId)
    await owner.flush()
    let race = true
    const accept = new ProjectSmartPatchAcceptance({
      ...f.options,
      journal: {
        abandon: async (handoff) => {
          if (race) {
            race = false
            await f.service.redo(f.tabId)
          }
          await f.journal.abandon(handoff)
        },
        complete: f.journal.complete.bind(f.journal),
        read: f.journal.read.bind(f.journal),
        record: f.journal.record.bind(f.journal),
      },
    })
    await assert.rejects(accept.reconcile(f.tabId), { code: 'PROJECT_DOCUMENT_CHANGED' })
    assert.ok(
      await f.journal.read(f.tabId, owner.document.documentId),
      'Changed document cannot lose its durable cleanup intent.',
    )
    assert.equal((await f.base.patch.listVerifiedCandidates(f.tabId)).length, 1)
    assert.equal(accept.hasPendingHandoff(f.tabId), true)
    assert.equal(await accept.reconcile(f.tabId), 'cleaned')
    assert.equal((owner.document.layers[0] as IgsSmartPatchLayerV1).rasterSubLayers.length, 1)
  })
})

test('a late pruned receipt can be qualified on retry without widening the reviewed result set', async () => {
  await fixture('illustrious', async (f) => {
    const claimed = await f.base.queue.claimNextPendingSmartPatch()
    assert.ok(claimed)
    const root = await mkdtemp(path.join(f.base.scratch, 'smart-patch-request-'))
    const outputPath = path.join(root, 'world-result.png')
    await writeFile(outputPath, f.base.outputBytes, { mode: 0o600 })
    let race = true
    const accept = new ProjectSmartPatchAcceptance({
      ...f.options,
      orchestrator: {
        cancelSmartPatchAcceptanceJobs: async (scope) => {
          if (race) {
            race = false
            await f.base.patch.publishGenerationCandidate({
              actualSeed: 1,
              expectedProvisionalRoot: root,
              expectedStatusSequence: claimed.item.statusSequence,
              output: {
                byteSize: f.base.outputBytes.length,
                colorSpace: 'srgb',
                height: 128,
                iccSha256: IGS_SRGB_ICC_SHA256,
                path: outputPath,
                sha256: digest(f.base.outputBytes),
                width: 128,
              },
              provisionalOutputPath: outputPath,
              queueItemId: claimed.item.id,
            })
            await f.base.queue.pruneTerminal(['completed'])
          }
          await f.orchestrator.cancelSmartPatchAcceptanceJobs(scope)
        },
        fenceProjectGeneration: f.orchestrator.fenceProjectGeneration.bind(f.orchestrator),
        releaseProjectGenerationFence: f.orchestrator.releaseProjectGenerationFence.bind(
          f.orchestrator,
        ),
      },
    })
    await assert.rejects(accept.accept(f.tabId, f.input), { code: 'QUEUE_INPUT_INVALID' })
    assert.equal(accept.hasPendingHandoff(f.tabId), true)
    await assert.rejects(accept.accept(f.tabId, f.input), { code: 'SMART_PATCH_SELECTION_STALE' })
    assert.equal(accept.hasPendingHandoff(f.tabId), false)
    const owner = f.service.getOpenDocumentForAcceptance(f.tabId)!
    assert.equal((owner.document.layers[0] as IgsSmartPatchLayerV1).rasterSubLayers.length, 0)
    assert.equal(await f.journal.read(f.tabId, owner.document.documentId), null)
    assert.equal((await f.base.patch.listVerifiedCandidates(f.tabId)).length, 2)
  })
})

test('idempotent Add chooses its canonical original owner when a valid historical Patch copy also exists', async () => {
  await fixture('illustrious', async (f) => {
    const accept = new ProjectSmartPatchAcceptance(f.options)
    const first = await accept.accept(f.tabId, f.input)
    const owner = f.service.getOpenDocumentForAcceptance(f.tabId)!
    const d = structuredClone(owner.document)
    const original = d.layers[0] as IgsSmartPatchLayerV1
    const copy = structuredClone(original)
    copy.id = randomUUID()
    copy.mask.id = randomUUID()
    // The copied mask is empty so this precondition needs no new current-mask ownership file.
    copy.mask = { asset: null, id: copy.mask.id, revision: 0 }
    const variant = copy.rasterSubLayers[0]
    variant.id = randomUUID()
    variant.asset.path = `assets/layers/${variant.id}.png`
    copy.activeRasterSubLayerId = variant.id
    copy.name = 'Historical hierarchy copy'
    d.layers.push(copy)
    await owner.applyDocument(d, { [variant.asset.path]: { bytes: f.base.outputBytes } })
    const before = structuredClone(owner.document)
    const replay = await accept.accept(f.tabId, f.input)
    assert.equal(replay.kind, 'already-accepted')
    assert.deepEqual(replay.variantIds, first.variantIds)
    assert.equal(replay.layerId, original.id)
    assert.deepEqual(owner.document, before)
    assert.deepEqual(await f.base.patch.listVerifiedCandidates(f.tabId), [])
  })
})
