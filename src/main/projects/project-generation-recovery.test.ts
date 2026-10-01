import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import type { IgsProjectDocumentV1 } from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rename, rm, stat, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import type { PreparedNormalTxt2Img } from './project-generation-preparation.js'
import type { ProjectServiceOptions } from './project-service.js'

import { openAppDatabase } from '../db/database.js'
import { GenerationAcceptanceJournalRepository } from './generation-acceptance-journal.js'
import { GenerationOrchestrator } from './generation-orchestrator.js'
import { GenerationProcessor } from './generation-processor.js'
import { GenerationQueueRepository } from './generation-queue.js'
import {
  GenerationStagingRepository,
  type GenerationStagingTestHooks,
} from './generation-staging.js'
import { readIgsPackage, saveIgsPackage } from './igs-package.js'
import { withIllustriousTxt2ImgRequest } from './illustrious-txt2img-job.js'
import { ProjectAutosaveLeaseRegistry } from './project-autosave.js'
import { ProjectGenerationAcceptance } from './project-generation-acceptance.js'
import { ProjectGenerationOperationGate } from './project-generation-operation-gate.js'
import {
  ProjectGenerationRecovery,
  reconcileOpenedProjectGeneration,
} from './project-generation-recovery.js'
import { ProjectGenerationResultResource } from './project-generation-result-resource.js'
import { ProjectIndexRepository } from './project-index.js'
import { readProjectPlaceholders } from './project-placeholders.js'
import { ProjectService } from './project-service.js'
import { ProjectShadowStore } from './project-shadow.js'
import {
  inspectTemporaryRecovery as inspectTemporaryRecoveryStore,
  type ProjectTemporaryRecoveryInspection,
} from './project-temporary-recovery.js'
import {
  acceptedOutputPngFixture,
  acceptedRasterProvenanceFixture,
} from './test-fixtures/accepted-provenance.js'

const migrations = path.resolve('src/main/db/migrations')
const placeholdersDir = path.resolve('src/main/projects/placeholders')
const ready = {
  capabilities: ['illustrious-txt2img'],
  protocolVersion: '1',
  runtimeProfile: 'linux-nvidia',
  workerVersion: '0.2.0',
}
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')

function signal() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

async function bounded<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out: ${label}`)), 3000)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

async function fixture(hooks: GenerationStagingTestHooks = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-generation-recovery-'))
  const database = openAppDatabase(root, migrations)
  const roots = { placeholdersDir, scratchDir: path.join(root, 'scratch') }
  await mkdir(roots.scratchDir, { mode: 0o700, recursive: true })
  const repository = new ProjectIndexRepository(database.db)
  const shadow = new ProjectShadowStore(path.join(root, 'autosave'))
  const queue = new GenerationQueueRepository(database.db, root)
  const staging = new GenerationStagingRepository(database.db, root, hooks)
  await queue.recoverAfterRestart()
  await staging.recoverAfterRestart()
  const newService = (
    inspectTemporaryRecovery: (
      projectKey: string,
    ) => Promise<ProjectTemporaryRecoveryInspection> = (key) =>
      inspectTemporaryRecoveryStore(staging, key),
    openImportedProject?: ProjectServiceOptions['openImportedProject'],
  ) =>
    new ProjectService({
      autosaveOptions: { debounceMs: 0, leaseRegistry: new ProjectAutosaveLeaseRegistry() },
      dataRoot: root,
      inspectTemporaryRecovery,
      openImportedProject,
      readLastActualSeed: (key, documentId) => staging.readLastActualSeed(key, documentId),
      repository,
      roots,
      shadow,
    })
  const service = newService()
  const a = await service.create({ height: 64, title: 'Discard target', width: 64 })
  const b = await service.create({ height: 64, title: 'Keep neighbor', width: 64 })
  await service.close(a.id)
  await service.close(b.id)
  const aPath = (await repository.getProject(a.id))!.canonicalPath
  const bPath = (await repository.getProject(b.id))!.canonicalPath
  const pixels = await acceptedOutputPngFixture(64, 64)
  const base = (await readIgsPackage(aPath)).project
  const layerId = randomUUID()
  const assetPath = `assets/layers/${layerId}.png`
  const acceptedDocument: IgsProjectDocumentV1 = {
    ...base,
    documentRevision: randomUUID(),
    lastActualSeedSnapshot: 0,
    layers: [
      {
        asset: {
          bytes: pixels.length,
          height: 64,
          path: assetPath,
          sha256: hash(pixels),
          width: 64,
        },
        blendMode: 'normal',
        generationProvenance: acceptedRasterProvenanceFixture(base, pixels, base.primaryBbox),
        id: layerId,
        kind: 'raster',
        locked: false,
        name: 'Saved accepted image',
        opacity: 1,
        transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 0, y: 0 },
        visible: true,
      },
    ],
  }
  await saveIgsPackage(aPath, {
    assets: { [assetPath]: { bytes: pixels } },
    preview: {
      ...(await readProjectPlaceholders(placeholdersDir, 'unavailable')),
      rect: base.primaryBbox,
      status: 'unavailable',
    },
    project: acceptedDocument,
  })
  await service.list()
  const savedA = await readFile(aPath)
  const savedB = await readFile(bPath)
  const modelBytes = Buffer.from('controlled exact checkpoint bytes')
  const managedPath = path.join(root, 'checkpoint.safetensors')
  await writeFile(managedPath, modelBytes)
  const reference: NonNullable<IgsProjectDocumentV1['generationDraft']['model']> = {
    baseModelFamily: 'illustrious',
    civitaiFileId: 22,
    civitaiModelId: 20,
    civitaiVersionId: 21,
    displayName: 'Fixture checkpoint',
    fileSha256: hash(modelBytes),
    kind: 'checkpoint',
    localModelId: randomUUID(),
    localVersionId: randomUUID(),
    predictionType: 'epsilon',
    versionName: '1',
  }
  const models = {
    resolveVerifiedGenerationCheckpointForPlan: async () => ({ managedPath, reference }),
  }
  const prepared = (document: IgsProjectDocumentV1, seed: number): PreparedNormalTxt2Img => ({
    context: {
      bbox: document.primaryBbox,
      documentId: document.documentId,
      documentRevision: document.documentRevision,
      kind: 'normal-txt2img-preparation',
      model: { managedPath, reference },
      prompts: { negative: 'blur', positive: 'a frozen blue lantern' },
      sampling: {
        cfgScale: 7.5,
        invokeScheduler: 'dpmpp_2m_k',
        requestedSeedPolicy: 'fixed',
        sampler: 'DPM++ 2M',
        scheduler: 'Karras',
        seed,
        steps: 24,
      },
      schemaVersion: 1,
      target: {
        byteSize: pixels.length,
        colorSpace: 'srgb',
        format: 'png',
        height: 64,
        iccSha256: IGS_SRGB_ICC_SHA256,
        sha256: hash(pixels),
        width: 64,
      },
    },
    targetPngBytes: pixels,
  })
  const enqueue = async (
    projectPath: string,
    document: IgsProjectDocumentV1,
    seed: number,
    publish = true,
  ) => {
    const input = prepared(document, seed)
    return await withIllustriousTxt2ImgRequest({
      modelService: models,
      prepared: input,
      ready,
      scratchBasePath: roots.scratchDir,
      use: async (request) => {
        const item = await queue.enqueueIllustriousTxt2Img({
          prepared: input,
          projectPath,
          request,
          stagingSessionId: randomUUID(),
        })
        if (publish) {
          const claim = await queue.claimNextPending()
          assert.equal(claim?.item.id, item.id)
          await writeFile(request.job.output.pngPath, pixels)
          await staging.publishIllustriousTxt2Img({
            actualSeed: seed,
            expectedProvisionalRoot: request.job.output.stagingRoot,
            expectedStatusSequence: claim.item.statusSequence,
            provisionalOutputPath: request.job.output.pngPath,
            queueItemId: item.id,
          })
        }
        return item
      },
    })
  }
  const oldA = await enqueue(aPath, { ...acceptedDocument, documentId: randomUUID() }, 111)
  const currentA = await enqueue(aPath, acceptedDocument, 0)
  const neighbor = await enqueue(bPath, (await readIgsPackage(bPath)).project, 222)
  const dirtyDocument = {
    ...acceptedDocument,
    documentRevision: randomUUID(),
    primaryBbox: { ...acceptedDocument.primaryBbox, x: 99 },
  }
  await shadow.write({
    document: dirtyDocument,
    projectPath: aPath,
    savedDocument: acceptedDocument,
  })
  const gate = new ProjectGenerationOperationGate()
  const owner = (documents = service, store = staging) => {
    const processor = new GenerationProcessor(queue, store, models, roots.scratchDir)
    const orchestrator = new GenerationOrchestrator(
      documents,
      repository,
      models,
      queue,
      store,
      processor,
      roots.scratchDir,
    )
    const recovery = new ProjectGenerationRecovery(
      documents,
      { orchestrator, staging: store },
      gate,
    )
    return { orchestrator, recovery }
  }
  const inspectShadow = async () =>
    await shadow.inspect({ projectPath: aPath, savedPackage: await readIgsPackage(aPath) })
  return {
    a,
    acceptedDocument,
    aPath,
    b,
    bPath,
    currentA,
    database,
    dirtyDocument,
    dispose: async () => {
      await database.close().catch(() => undefined)
      await rm(root, { force: true, recursive: true })
    },
    enqueue,
    gate,
    inspectShadow,
    models,
    neighbor,
    newService,
    oldA,
    owner,
    queue,
    root,
    roots,
    savedA,
    savedB,
    service,
    shadow,
    staging,
  }
}

// Boundary: actual saved .igs + recovered staging -> Home/Open/explicit recovery owner.
// Invariant: completed temporary results require a decision without becoming document edits.
// Controls: missing/clean shadow, open tab, neighboring Project and accepted saved assets.
// Mutations: bypass temporary presence in Open; mark a staging-only Recover dirty; skip tombstones.
test('Home and ordinary Open require a decision for valid staging without a document shadow', async () => {
  const f = await fixture()
  try {
    await f.shadow.discard(f.aPath)
    const documents = f.newService((key) => inspectTemporaryRecoveryStore(f.staging, key))
    const summary = (await documents.list()).find((item) => item.id === f.a.id)
    assert.equal(summary?.recoveryStatus, 'recoverable')
    const result = await f.owner(documents).recovery.open(f.a.id)
    assert.equal(result.kind, 'recovery-required')
    assert.equal(documents.getOpenTabs().length, 0)
    assert.equal((await f.staging.listVerifiedCandidates(f.a.id)).length, 2)
    assert.deepEqual(await readFile(f.aPath), f.savedA)
  } finally {
    await f.dispose()
  }
})

test('staging-only Recover opens the saved document cleanly, retains candidates and creates no Undo', async () => {
  const f = await fixture()
  try {
    await f.shadow.discard(f.aPath)
    const documents = f.newService((key) => inspectTemporaryRecoveryStore(f.staging, key))
    const { recovery } = f.owner(documents)
    const tab = await recovery.resolve(f.a.id, 'recover')
    assert.equal(tab.dirty, false)
    assert.equal(tab.canUndo, false)
    assert.equal(tab.documentId, f.acceptedDocument.documentId)
    assert.deepEqual(tab.primaryBbox, f.acceptedDocument.primaryBbox)
    assert.deepEqual(
      tab.layers.map((layer) => layer.id),
      f.acceptedDocument.layers.map((layer) => layer.id),
    )
    assert.equal((await f.staging.listVerifiedCandidates(f.a.id)).length, 2)
    assert.equal(
      (await documents.list()).find((item) => item.id === f.a.id)?.recoveryStatus,
      'none',
    )
    const reopened = await recovery.open(f.a.id)
    assert.equal(reopened.kind, 'opened')
    assert.equal(documents.getOpenTabs().length, 1)
    await assert.rejects(recovery.resolve(f.a.id, 'recover'), { code: 'PROJECT_ALREADY_OPEN' })
    assert.deepEqual(await readFile(f.aPath), f.savedA)
    await documents.close(f.a.id)
  } finally {
    await f.dispose()
  }
})

test('staging-only Discard removes all source-document sessions and preserves saved accepted layers', async () => {
  const f = await fixture()
  try {
    await f.shadow.discard(f.aPath)
    const documents = f.newService((key) => inspectTemporaryRecoveryStore(f.staging, key))
    const queueBefore = await f.database.db
      .selectFrom('generation_queue_item')
      .selectAll()
      .orderBy('id')
      .execute()
    const tab = await f.owner(documents).recovery.resolve(f.a.id, 'discard')
    assert.equal(tab.dirty, false)
    assert.deepEqual(
      tab.layers.map((layer) => layer.id),
      f.acceptedDocument.layers.map((layer) => layer.id),
    )
    assert.deepEqual(await f.staging.listVerifiedCandidates(f.a.id), [])
    assert.equal((await f.staging.listVerifiedCandidates(f.b.id)).length, 1)
    assert.equal(await f.staging.readLastActualSeed(f.a.id, tab.documentId), 0)
    assert.deepEqual(
      await f.database.db.selectFrom('generation_queue_item').selectAll().orderBy('id').execute(),
      queueBefore,
    )
    assert.deepEqual(await readFile(f.aPath), f.savedA)
    assert.deepEqual(await readFile(f.bPath), f.savedB)
    await documents.close(f.a.id)
  } finally {
    await f.dispose()
  }
})

test('Save-before-crash clean shadow still requires temporary recovery and Recover preserves the saved revision', async () => {
  const f = await fixture()
  try {
    await f.shadow.discard(f.aPath)
    const tab = await f.owner().recovery.resolve(f.a.id, 'recover')
    await f.service.setPrimaryBbox(f.a.id, { ...tab.primaryBbox, x: 7 })
    await f.service.save(f.a.id)
    assert.equal((await f.inspectShadow()).status, 'clean')
    const saved = await readFile(f.aPath)
    const savedDocument = (await readIgsPackage(f.aPath)).project
    // A new process owns a fresh lease registry. Do not gracefully close the crashed owner:
    // graceful close clears this clean marker, unlike termination after the durable Save.
    const restarted = f.newService()
    const { recovery } = f.owner(restarted)
    assert.equal(
      (await restarted.list()).find((item) => item.id === f.a.id)?.recoveryStatus,
      'recoverable',
    )
    assert.equal((await recovery.open(f.a.id)).kind, 'recovery-required')
    const recovered = await recovery.resolve(f.a.id, 'recover')
    assert.equal(recovered.dirty, false)
    assert.equal(recovered.canUndo, false)
    assert.deepEqual(recovered.primaryBbox, savedDocument.primaryBbox)
    assert.equal(recovered.lastActualSeedSnapshot, 0)
    assert.equal((await f.staging.listVerifiedCandidates(f.a.id)).length, 2)
    assert.deepEqual(await readFile(f.aPath), saved)
    await restarted.close(f.a.id)
    await f.service.close(f.a.id)
  } finally {
    await f.dispose()
  }
})

test('saved pending acceptance reconciles after staging-only Recover without duplicating or resurrecting accepted results', async () => {
  const f = await fixture()
  let restarted: ProjectService | undefined
  let dirtyRestart: ProjectService | undefined
  try {
    await f.shadow.discard(f.aPath)
    const { orchestrator, recovery } = f.owner()
    await recovery.resolve(f.a.id, 'recover')
    const journal = new GenerationAcceptanceJournalRepository(f.database.db)
    const interrupted = new ProjectGenerationAcceptance({
      afterDurableShadow: async () => {
        throw new Error('controlled interruption after actual accepted shadow commit')
      },
      documents: { getOpenDocument: (id) => f.service.getOpenDocumentForAcceptance(id) },
      gate: f.gate,
      journal,
      orchestrator,
      queue: f.queue,
      staging: f.staging,
    })
    await assert.rejects(
      interrupted.accept(f.a.id, [f.currentA.id], null, [f.currentA.id]),
      /controlled interruption/,
    )
    assert.ok(await journal.read(f.a.id, f.acceptedDocument.documentId))
    const afterAdd = f.service.getOpenTabs().find((item) => item.id === f.a.id)!
    assert.equal(afterAdd.acceptedResults.length, 2)
    const generatedLayer = f.service
      .getOpenDocumentForAcceptance(f.a.id)!
      .document.layers.find(
        (layer) => layer.generationProvenance?.executionResultContext.candidateId === f.currentA.id,
      )!
    assert.equal(
      afterAdd.acceptedResults.find((result) => result.layerId === generatedLayer.id)!.seed,
      0,
    )
    assert.equal((await f.service.undo(f.a.id)).acceptedResults.length, 1)
    assert.equal((await f.staging.listVerifiedCandidates(f.a.id)).length, 2)
    const redone = await f.service.redo(f.a.id)
    assert.deepEqual(
      redone.acceptedResults.map((result) => result.layerId),
      afterAdd.acceptedResults.map((result) => result.layerId),
    )
    await f.service.flushAutosave(f.a.id)
    // A fresh process owner reconstructs history from the genuine accepted dirty shadow.
    dirtyRestart = f.newService()
    assert.equal((await f.owner(dirtyRestart).recovery.open(f.a.id)).kind, 'recovery-required')
    const recoveredDirty = await f.owner(dirtyRestart).recovery.resolve(f.a.id, 'recover')
    assert.equal(recoveredDirty.dirty, true)
    assert.deepEqual(
      recoveredDirty.acceptedResults.map((result) => result.layerId),
      redone.acceptedResults.map((result) => result.layerId),
    )
    assert.equal(
      recoveredDirty.acceptedResults.find((result) => result.layerId === generatedLayer.id)!.seed,
      0,
    )
    assert.deepEqual(await readFile(f.aPath), f.savedA)
    await dirtyRestart.save(f.a.id)
    assert.equal((await f.inspectShadow()).status, 'clean')
    const savedBytes = await readFile(f.aPath)
    const savedLayers = (await readIgsPackage(f.aPath)).project.layers
    assert.equal(savedLayers.length, 2)

    // Simulate a fresh process owner; the actual journal/shadow/package remain on disk.
    restarted = f.newService()
    const openedOwner = f.owner(restarted)
    assert.equal((await openedOwner.recovery.open(f.a.id)).kind, 'recovery-required')
    const tab = await openedOwner.recovery.resolve(f.a.id, 'recover')
    assert.equal(tab.dirty, false)
    assert.equal(tab.canUndo, false)
    assert.deepEqual(
      tab.acceptedResults.map((result) => result.layerId),
      redone.acceptedResults.map((result) => result.layerId),
    )
    const resumed = new ProjectGenerationAcceptance({
      documents: { getOpenDocument: (id) => restarted!.getOpenDocumentForAcceptance(id) },
      gate: f.gate,
      journal,
      orchestrator: openedOwner.orchestrator,
      queue: f.queue,
      staging: f.staging,
    })
    assert.equal(
      await reconcileOpenedProjectGeneration(f.a.id, false, openedOwner.orchestrator, resumed),
      null,
    )
    assert.equal(await journal.read(f.a.id, tab.documentId), null)
    assert.deepEqual(restarted.getOpenDocumentForAcceptance(f.a.id)!.document.layers, savedLayers)
    assert.deepEqual(
      (await f.staging.listVerifiedCandidates(f.a.id)).map((candidate) => candidate.candidateId),
      [f.oldA.id],
    )
    assert.equal((await f.staging.listVerifiedCandidates(f.b.id)).length, 1)
    assert.deepEqual(await readFile(f.aPath), savedBytes)
    assert.equal(await f.queue.pruneTerminal(['completed']), 3)
    assert.equal(restarted.getOpenTabs()[0].acceptedResults.length, 2)
    // A repeated reconciliation has no new document or cleanup effect.
    assert.equal(
      await reconcileOpenedProjectGeneration(f.a.id, true, openedOwner.orchestrator, resumed),
      null,
    )
    assert.deepEqual(await readFile(f.aPath), savedBytes)
  } finally {
    await restarted?.close(f.a.id).catch(() => undefined)
    await dirtyRestart?.close(f.a.id).catch(() => undefined)
    await f.service.close(f.a.id).catch(() => undefined)
    await f.dispose()
  }
})

test('recovery presence survives queue prune and broken thumbnail, while corrupt PNGs and tombstones are excluded', async () => {
  const f = await fixture()
  try {
    await f.shadow.discard(f.aPath)
    const candidates = await f.staging.listVerifiedCandidates(f.a.id)
    const old = candidates.find((candidate) => candidate.candidateId === f.oldA.id)!
    const current = candidates.find((candidate) => candidate.candidateId === f.currentA.id)!
    const currentBytes = await readFile(current.assetPath)
    const cache = path.join(path.dirname(path.dirname(current.assetPath)), 'thumbnail-cache')
    await mkdir(cache, { mode: 0o700 })
    await writeFile(path.join(cache, `${current.candidateId}.json`), '{broken JSON', {
      mode: 0o600,
    })
    await writeFile(path.join(cache, `${current.candidateId}.webp`), 'invalid optional thumbnail', {
      mode: 0o600,
    })
    assert.equal(await f.queue.pruneTerminal(['completed']), 3)
    assert.deepEqual(await inspectTemporaryRecoveryStore(f.staging, f.a.id), {
      completedCandidateCount: 2,
      kind: 'available',
    })
    const documents = f.newService()
    assert.equal(
      (await documents.list()).find((item) => item.id === f.a.id)?.recoveryStatus,
      'recoverable',
    )
    await writeFile(old.assetPath, 'corrupt authoritative PNG', { mode: 0o600 })
    assert.deepEqual(await inspectTemporaryRecoveryStore(f.staging, f.a.id), {
      completedCandidateCount: 1,
      kind: 'available',
    })
    await writeFile(current.assetPath, 'corrupt authoritative PNG', { mode: 0o600 })
    assert.deepEqual(await inspectTemporaryRecoveryStore(f.staging, f.a.id), {
      completedCandidateCount: 0,
      kind: 'available',
    })
    assert.equal(
      (await documents.list()).find((item) => item.id === f.a.id)?.recoveryStatus,
      'none',
    )
    assert.equal((await documents.open(f.a.id)).kind, 'opened')
    await documents.close(f.a.id)
    await writeFile(current.assetPath, currentBytes, { mode: 0o600 })
    await f.staging.discardSessions(f.a.id, [current.stagingSessionId])
    assert.deepEqual(await inspectTemporaryRecoveryStore(f.staging, f.a.id), {
      completedCandidateCount: 0,
      kind: 'available',
    })
    assert.equal((await f.staging.listVerifiedCandidates(f.b.id)).length, 1)
    assert.deepEqual(await readFile(f.aPath), f.savedA)
  } finally {
    await f.dispose()
  }
})

test('old-document-only recovery opens the current saved document and retains an orphan with Add disabled', async () => {
  const f = await fixture()
  try {
    await f.shadow.discard(f.aPath)
    const current = (await f.staging.listVerifiedCandidates(f.a.id)).find(
      (candidate) => candidate.candidateId === f.currentA.id,
    )!
    await f.staging.discardSessions(f.a.id, [current.stagingSessionId])
    assert.equal(
      (await f.service.list()).find((item) => item.id === f.a.id)?.recoveryStatus,
      'recoverable',
    )
    const tab = await f.owner().recovery.resolve(f.a.id, 'recover')
    const results = new ProjectGenerationResultResource(
      f.staging,
      (key) => f.service.getOpenDocumentId(key),
      f.queue,
    )
    const snapshot = await results.list(f.a.id)
    assert.equal(tab.documentId, f.acceptedDocument.documentId)
    assert.equal(tab.dirty, false)
    assert.equal(snapshot.candidates.length, 1)
    assert.equal(snapshot.candidates[0].candidateId, f.oldA.id)
    assert.equal(snapshot.candidates[0].sourceDocumentMismatch, true)
    assert.equal(snapshot.lastActualSeed, 0)
    assert.deepEqual(await readFile(f.aPath), f.savedA)
    await f.service.close(f.a.id)
  } finally {
    await f.dispose()
  }
})

test('unavailable temporary storage is explicit on Home but saved Open and Save stay usable without deleting results', async () => {
  const f = await fixture()
  let projectRoot: string | undefined
  try {
    await f.shadow.discard(f.aPath)
    assert.equal((await f.owner().recovery.open(f.a.id)).kind, 'recovery-required')
    const candidate = (await f.staging.listVerifiedCandidates(f.a.id))[0]
    projectRoot = path.dirname(path.dirname(path.dirname(candidate.assetPath)))
    await rename(projectRoot, `${projectRoot}.retained`)
    await symlink(`${projectRoot}.retained`, projectRoot)
    const summary = (await f.service.list()).find((item) => item.id === f.a.id)!
    assert.equal(summary.recoveryStatus, 'unavailable')
    assert.match(summary.recoveryReason!, /cannot be inspected.*kept/)
    assert.ok(summary.recoveryReason!.length <= 512)
    await assert.rejects(
      f.owner().recovery.resolve(f.a.id, 'discard'),
      (error: unknown) => error instanceof Error && error.message === summary.recoveryReason,
    )
    const opened = await f.owner().recovery.open(f.a.id)
    assert.equal(opened.kind, 'opened')
    if (opened.kind !== 'opened') {
      throw new Error('The saved Project was not reviewable.')
    }
    assert.equal(opened.tab.storageWarning, summary.recoveryReason)
    await f.service.setPrimaryBbox(f.a.id, { ...opened.tab.primaryBbox, x: 5 })
    assert.equal((await f.service.save(f.a.id)).committed, true)
    assert.equal((await readIgsPackage(f.aPath)).project.primaryBbox.x, 5)
    await f.service.close(f.a.id)
    await rm(projectRoot)
    await rename(`${projectRoot}.retained`, projectRoot)
    projectRoot = undefined
    assert.equal((await f.staging.listVerifiedCandidates(f.a.id)).length, 2)
    assert.equal((await f.staging.listVerifiedCandidates(f.b.id)).length, 1)
  } finally {
    if (projectRoot) {
      await rm(projectRoot)
      await rename(`${projectRoot}.retained`, projectRoot)
    }
    await f.dispose()
  }
})

test('dirty document Recover remains reviewable when the temporary storage owner is unavailable', async () => {
  const f = await fixture()
  try {
    const documents = f.newService((key) => inspectTemporaryRecoveryStore(null, key))
    const owner = new ProjectGenerationRecovery(documents, null, f.gate)
    const summary = (await documents.list()).find((item) => item.id === f.a.id)!
    assert.equal(summary.recoveryStatus, 'recoverable')
    assert.match(summary.recoveryReason!, /Unsaved.*cannot be inspected/)
    await assert.rejects(owner.resolve(f.a.id, 'discard'), {
      code: 'PROJECT_GENERATION_RECOVERY_UNAVAILABLE',
    })
    const recovered = await owner.resolve(f.a.id, 'recover')
    assert.equal(recovered.dirty, true)
    assert.equal(recovered.primaryBbox.x, 99)
    assert.match(recovered.storageWarning!, /cannot be inspected.*kept/)
    assert.equal((await f.staging.listVerifiedCandidates(f.a.id)).length, 2)
    assert.deepEqual(await readFile(f.aPath), f.savedA)
    await documents.discardAndClose(f.a.id)
  } finally {
    await f.dispose()
  }
})

test('invalid and stale document shadows take precedence; missing or corrupt saved files cannot authorize discard', async () => {
  const f = await fixture()
  try {
    const manifestPath = path.join(f.root, 'autosave', f.a.id, 'manifest.json')
    const manifest = await readFile(manifestPath)
    await writeFile(manifestPath, '{invalid JSON', { mode: 0o600 })
    assert.equal(
      (await f.service.list()).find((item) => item.id === f.a.id)?.recoveryStatus,
      'invalid',
    )
    const invalid = await f.owner().recovery.open(f.a.id)
    assert.equal(invalid.kind, 'recovery-required')
    if (invalid.kind === 'recovery-required') {
      assert.equal(invalid.recoveryStatus, 'invalid')
    }
    await assert.rejects(f.owner().recovery.resolve(f.a.id, 'recover'), {
      code: 'PROJECT_RECOVERY_UNAVAILABLE',
    })
    await writeFile(manifestPath, manifest, { mode: 0o600 })
    const parsed = JSON.parse(manifest.toString()) as { documentId: string }
    parsed.documentId = randomUUID()
    await writeFile(manifestPath, JSON.stringify(parsed), { mode: 0o600 })
    assert.equal(
      (await f.service.list()).find((item) => item.id === f.a.id)?.recoveryStatus,
      'stale',
    )
    await assert.rejects(f.owner().recovery.resolve(f.a.id, 'recover'), {
      code: 'PROJECT_RECOVERY_UNAVAILABLE',
    })
    await rename(f.aPath, `${f.aPath}.retained`)
    assert.equal((await f.service.list()).find((item) => item.id === f.a.id)?.health, 'missing')
    await assert.rejects(f.owner().recovery.resolve(f.a.id, 'discard'), {
      code: 'PROJECT_NOT_READY',
    })
    await writeFile(f.aPath, 'not an IGS package')
    assert.equal((await f.service.list()).find((item) => item.id === f.a.id)?.health, 'corrupt')
    await assert.rejects(f.owner().recovery.resolve(f.a.id, 'discard'), {
      code: 'PROJECT_NOT_READY',
    })
    assert.equal((await f.staging.listVerifiedCandidates(f.a.id)).length, 2)
    assert.deepEqual(await readFile(manifestPath), Buffer.from(JSON.stringify(parsed)))
    assert.deepEqual(
      await f.database.db.selectFrom('generation_staging_discarded_session').selectAll().execute(),
      [],
    )
  } finally {
    await f.dispose()
  }
})

test('managed import Open and closed preview rebuild respect the fresh temporary recovery decision', async () => {
  const f = await fixture()
  try {
    await f.shadow.discard(f.aPath)
    const imported = await f.service.selectImport(f.aPath)
    assert.equal(imported.kind, 'opened')
    if (imported.kind === 'opened') {
      assert.equal(imported.result.kind, 'recovery-required')
    }
    assert.equal(f.service.getOpenTabs().length, 0)
    let composed = false
    await assert.rejects(
      f.service.rebuildPreview(f.a.id, {
        composePreview: async () => {
          composed = true
          throw new Error('A pending decision must be checked before invoking the worker.')
        },
      }),
      { code: 'PROJECT_RECOVERY_REQUIRED' },
    )
    assert.equal(composed, false)
    assert.deepEqual(await readFile(f.aPath), f.savedA)
  } finally {
    await f.dispose()
  }
})

test('recovery revalidates a tab opened during asynchronous storage inspection before deleting anything', async () => {
  const f = await fixture()
  const inspected = signal()
  const resume = signal()
  let documents: ProjectService | undefined
  let discarding: Promise<unknown> | undefined
  try {
    await f.shadow.discard(f.aPath)
    let holdFirstInspection = true
    documents = f.newService(async (key) => {
      const state = await inspectTemporaryRecoveryStore(f.staging, key)
      if (holdFirstInspection) {
        holdFirstInspection = false
        inspected.resolve()
        await resume.promise
      }
      return state
    })
    let discarded = false
    discarding = documents.resolveRecovery(f.a.id, 'discard', async () => {
      discarded = true
      await f.staging.discardProject(f.a.id)
    })
    const refused = assert.rejects(discarding, { code: 'PROJECT_ALREADY_OPEN' })
    await bounded(inspected.promise, 'recovery inspection paused')
    const opened = await documents.resolveRecovery(f.a.id, 'recover')
    assert.equal(opened.dirty, false)
    resume.resolve()
    await bounded(refused, 'stale discard refused')
    assert.equal(discarded, false)
    assert.equal(documents.getOpenTabs().length, 1)
    assert.equal((await f.staging.listVerifiedCandidates(f.a.id)).length, 2)
    assert.equal((await f.staging.listVerifiedCandidates(f.b.id)).length, 1)
    assert.deepEqual(await readFile(f.aPath), f.savedA)
  } finally {
    resume.resolve()
    await bounded(Promise.allSettled(discarding ? [discarding] : []), 'stale operation exits')
    await documents?.close(f.a.id).catch(() => undefined)
    await f.dispose()
  }
})

test('external copy finishes its managed Open through the same main recovery owner', async () => {
  const f = await fixture()
  let documents: ProjectService | undefined
  try {
    const sourcePath = path.join(f.root, 'external-source.igs')
    await writeFile(sourcePath, f.savedA, { mode: 0o600 })
    const routedKeys: string[] = []
    let recovery: ProjectGenerationRecovery
    documents = f.newService(
      (key) => inspectTemporaryRecoveryStore(f.staging, key),
      (key) => {
        routedKeys.push(key)
        return recovery.open(key)
      },
    )
    recovery = f.owner(documents).recovery
    const selected = await documents.selectImport(sourcePath)
    assert.equal(selected.kind, 'transfer-required')
    if (selected.kind !== 'transfer-required') {
      throw new Error('Expected a real transfer selection')
    }
    const copied = await documents.finishImport(selected.importId, 'copy')
    assert.equal(copied.result.kind, 'opened')
    if (copied.result.kind === 'opened') {
      assert.notEqual(copied.result.tab.id, f.a.id)
      assert.equal(copied.result.tab.documentId, f.acceptedDocument.documentId)
      assert.equal(copied.result.tab.dirty, false)
      assert.deepEqual(routedKeys, [copied.result.tab.id])
      await documents.close(copied.result.tab.id)
    }
    assert.deepEqual(await readFile(sourcePath), f.savedA)
    assert.equal((await f.staging.listVerifiedCandidates(f.a.id)).length, 2)
    assert.equal((await f.staging.listVerifiedCandidates(f.b.id)).length, 1)
  } finally {
    await f.dispose()
  }
})

test('managed import waits for the actual recovery owner to finish durable Project discard', async () => {
  const tombstoned = signal()
  const finishDiscard = signal()
  const importRequested = signal()
  const f = await fixture({
    afterDiscardTombstone: async () => {
      tombstoned.resolve()
      await finishDiscard.promise
    },
  })
  let documents: ProjectService | undefined
  let discarded: Promise<unknown> | undefined
  let imported: Promise<unknown> | undefined
  try {
    await f.shadow.discard(f.aPath)
    let recovery: ProjectGenerationRecovery
    documents = f.newService(
      (key) => inspectTemporaryRecoveryStore(f.staging, key),
      (key) => {
        importRequested.resolve()
        return recovery.open(key)
      },
    )
    recovery = f.owner(documents).recovery
    discarded = recovery.resolve(f.a.id, 'discard')
    await bounded(tombstoned.promise, 'durable discard reached')
    const selection = documents.selectImport(f.aPath)
    imported = selection
    await bounded(importRequested.promise, 'managed import reached the shared owner gate')
    assert.equal(documents.getOpenTabs().length, 0)
    assert.equal(
      (await f.database.db.selectFrom('generation_staging_discarded_session').selectAll().execute())
        .length,
      2,
    )
    finishDiscard.resolve()
    await bounded(discarded, 'recovery discard finished')
    const opened = await bounded(selection, 'managed import finished after discard')
    assert.equal(opened.kind, 'opened')
    if (opened.kind === 'opened') {
      assert.equal(opened.result.kind, 'opened')
      if (opened.result.kind === 'opened') {
        assert.equal(opened.result.tab.dirty, false)
        assert.equal(opened.result.tab.documentId, f.acceptedDocument.documentId)
      }
    }
    assert.equal(documents.getOpenTabs().length, 1)
    assert.deepEqual(await f.staging.listVerifiedCandidates(f.a.id), [])
    assert.equal((await f.staging.listVerifiedCandidates(f.b.id)).length, 1)
    assert.deepEqual(await readFile(f.aPath), f.savedA)
  } finally {
    finishDiscard.resolve()
    await bounded(Promise.allSettled([discarded, imported].filter(Boolean)), 'held operations exit')
    await documents?.close(f.a.id).catch(() => undefined)
    await f.dispose()
  }
})

// Boundary: actual main IPC owner -> ProjectService -> gate/orchestrator/queue/staging -> shadow/IGS.
// Invariant: confirmed Discard hides every Project session before erasing its dirty shadow/opening saved.
// Controls: Recover, invalid/already-open requests, another Project, accepted layers/seed/queue history.
// Mutations: skip project tombstones; erase shadow before staging; ignore a failed durable discard.
test('Discard Recovery removes all Project sessions, keeps saved accepted pixels, neighbor, seed and queue history', async () => {
  const f = await fixture()
  try {
    const pendingA = await f.enqueue(f.aPath, f.acceptedDocument, 12, false)
    const pendingB = await f.enqueue(f.bPath, (await readIgsPackage(f.bPath)).project, 34, false)
    const { orchestrator, recovery } = f.owner()
    const tab = await recovery.resolve(f.a.id, 'discard')
    orchestrator.reopenProjectGeneration(f.a.id)
    assert.equal(tab.dirty, false)
    assert.equal(tab.primaryBbox.x, 0)
    assert.equal(tab.layers[0]?.id, f.acceptedDocument.layers[0].id)
    assert.equal((await f.inspectShadow()).status, 'absent')
    assert.deepEqual(await f.staging.listVerifiedCandidates(f.a.id), [])
    assert.deepEqual(
      (await f.staging.listVerifiedCandidates(f.b.id)).map((item) => item.queueItemId),
      [f.neighbor.id],
    )
    assert.equal(await f.staging.readLastActualSeed(f.a.id, f.acceptedDocument.documentId), 0)
    for (const item of [f.oldA, f.currentA, f.neighbor]) {
      assert.equal((await f.queue.getManagerEntry(item.id)).status, 'completed')
    }
    assert.equal((await f.queue.getManagerEntry(pendingA.id)).status, 'canceled')
    assert.equal((await f.queue.getManagerEntry(pendingB.id)).status, 'pending')
    assert.deepEqual(await readFile(f.aPath), f.savedA)
    assert.deepEqual(await readFile(f.bPath), f.savedB)
    await f.service.close(f.a.id)
  } finally {
    await f.dispose()
  }
})

test('Recover keeps dirty document and every temporary session; unavailable staging prevents Discard before shadow deletion', async () => {
  const f = await fixture()
  try {
    const unavailable = new ProjectGenerationRecovery(f.service, null, f.gate)
    await assert.rejects(unavailable.resolve(f.a.id, 'discard'), {
      code: 'PROJECT_GENERATION_RECOVERY_UNAVAILABLE',
    })
    assert.equal((await f.inspectShadow()).status, 'recoverable')
    assert.equal((await f.staging.listVerifiedCandidates(f.a.id)).length, 2)
    const tab = await unavailable.resolve(f.a.id, 'recover')
    assert.equal(tab.dirty, true)
    assert.equal(tab.primaryBbox.x, 99)
    assert.equal((await f.staging.listVerifiedCandidates(f.a.id)).length, 2)
    await assert.rejects(f.owner().recovery.resolve(f.a.id, 'discard'), {
      code: 'PROJECT_ALREADY_OPEN',
    })
    assert.equal((await f.staging.listVerifiedCandidates(f.a.id)).length, 2)
    await f.service.discardAndClose(f.a.id)
  } finally {
    await f.dispose()
  }
})

test('A stale staging-only decision refuses after the last candidate vanishes and preserves neighboring recovery', async () => {
  const f = await fixture()
  try {
    await f.shadow.discard(f.aPath)
    assert.equal((await f.owner().recovery.open(f.a.id)).kind, 'recovery-required')
    await f.staging.discardProject(f.a.id)
    const before = await f.database.db
      .selectFrom('generation_staging_discarded_session')
      .selectAll()
      .execute()
    await assert.rejects(f.owner().recovery.resolve(f.a.id, 'discard'), {
      code: 'PROJECT_RECOVERY_UNAVAILABLE',
    })
    assert.deepEqual(await f.staging.listVerifiedCandidates(f.a.id), [])
    assert.equal((await f.staging.listVerifiedCandidates(f.b.id)).length, 1)
    assert.deepEqual(
      await f.database.db.selectFrom('generation_staging_discarded_session').selectAll().execute(),
      before,
    )
    const result = await f.owner().recovery.open(f.a.id)
    assert.equal(result.kind, 'opened')
    await f.service.close(f.a.id)
    assert.deepEqual(await readFile(f.aPath), f.savedA)
  } finally {
    await f.dispose()
  }
})

test('Unsafe staging fails before shadow deletion or success, and restoring storage allows explicit retry', async () => {
  const f = await fixture()
  try {
    const candidate = (await f.staging.listVerifiedCandidates(f.a.id))[0]
    const projectRoot = path.dirname(path.dirname(path.dirname(candidate.assetPath)))
    const retained = `${projectRoot}.retained`
    await rename(projectRoot, retained)
    await symlink(retained, projectRoot)
    const { recovery } = f.owner()
    await assert.rejects(recovery.resolve(f.a.id, 'discard'), { code: 'STAGING_STORAGE_UNSAFE' })
    assert.equal(f.service.getOpenTabs().length, 0)
    assert.equal((await f.inspectShadow()).status, 'recoverable')
    assert.deepEqual(await readFile(f.aPath), f.savedA)
    await rm(projectRoot)
    await rename(retained, projectRoot)
    assert.equal((await f.staging.listVerifiedCandidates(f.a.id)).length, 2)
    const tab = await recovery.resolve(f.a.id, 'discard')
    assert.equal(tab.dirty, false)
    assert.deepEqual(await f.staging.listVerifiedCandidates(f.a.id), [])
    await f.service.close(f.a.id)
  } finally {
    await f.dispose()
  }
})

test('Crash after tombstones retains the dirty shadow, never resurrects pixels, and restart retry finishes Discard', async () => {
  let fail = true
  const f = await fixture({
    afterDiscardTombstone: async () => {
      if (fail) {
        throw new Error('Crash after durable tombstones')
      }
    },
  })
  try {
    const candidates = await f.staging.listVerifiedCandidates(f.a.id)
    await assert.rejects(
      f.owner().recovery.resolve(f.a.id, 'discard'),
      /Crash after durable tombstones/,
    )
    assert.equal(f.service.getOpenTabs().length, 0)
    assert.equal((await f.inspectShadow()).status, 'recoverable')
    assert.deepEqual(await f.staging.listVerifiedCandidates(f.a.id), [])
    assert.ok((await stat(candidates[0].assetPath)).size > 0, 'crash precedes physical cleanup')
    fail = false
    await f.database.close()
    const restartedDatabase = openAppDatabase(f.root, migrations)
    try {
      const restartedQueue = new GenerationQueueRepository(restartedDatabase.db, f.root)
      const restartedStaging = new GenerationStagingRepository(restartedDatabase.db, f.root)
      await restartedQueue.recoverAfterRestart()
      await restartedStaging.recoverAfterRestart()
      assert.deepEqual(await restartedStaging.listVerifiedCandidates(f.a.id), [])
      await assert.rejects(stat(candidates[0].assetPath), { code: 'ENOENT' })
      const index = new ProjectIndexRepository(restartedDatabase.db)
      const documents = new ProjectService({
        autosaveOptions: { leaseRegistry: new ProjectAutosaveLeaseRegistry() },
        dataRoot: f.root,
        repository: index,
        roots: f.roots,
        shadow: f.shadow,
      })
      const processor = new GenerationProcessor(
        restartedQueue,
        restartedStaging,
        f.models,
        f.roots.scratchDir,
      )
      const orchestrator = new GenerationOrchestrator(
        documents,
        index,
        f.models,
        restartedQueue,
        restartedStaging,
        processor,
        f.roots.scratchDir,
      )
      const recovery = new ProjectGenerationRecovery(
        documents,
        { orchestrator, staging: restartedStaging },
        new ProjectGenerationOperationGate(),
      )
      const tab = await recovery.resolve(f.a.id, 'discard')
      orchestrator.reopenProjectGeneration(f.a.id)
      assert.equal(tab.dirty, false)
      assert.equal((await f.inspectShadow()).status, 'absent')
      assert.equal((await restartedStaging.listVerifiedCandidates(f.b.id)).length, 1)
      assert.equal(
        await restartedStaging.readLastActualSeed(f.a.id, f.acceptedDocument.documentId),
        0,
      )
      assert.deepEqual(await readFile(f.aPath), f.savedA)
      await documents.close(f.a.id)
    } finally {
      await restartedDatabase.close()
    }
  } finally {
    await f.dispose()
  }
})

test('Unconfirmed running worker exit refuses Discard before any session tombstone or document loss', async () => {
  const f = await fixture()
  try {
    const running = await f.enqueue(f.aPath, f.acceptedDocument, 12, false)
    assert.equal((await f.queue.claimNextPending())?.item.id, running.id)
    await assert.rejects(f.owner().recovery.resolve(f.a.id, 'discard'), {
      code: 'WORKER_EXIT_UNCONFIRMED',
    })
    assert.equal((await f.queue.getManagerEntry(running.id)).status, 'running')
    assert.equal((await f.staging.listVerifiedCandidates(f.a.id)).length, 2)
    assert.equal((await f.inspectShadow()).status, 'recoverable')
    assert.equal(f.service.getOpenTabs().length, 0)
    assert.deepEqual(await readFile(f.aPath), f.savedA)
    assert.equal(
      (await f.database.db.selectFrom('generation_staging_discarded_session').selectAll().execute())
        .length,
      0,
    )
  } finally {
    await f.dispose()
  }
})

test('The shared Project gate prevents a neighboring open from overtaking durable discard and shadow deletion', async () => {
  let signal!: () => void
  let resume!: () => void
  const started = new Promise<void>((resolve) => {
    signal = resolve
  })
  const resumed = new Promise<void>((resolve) => {
    resume = resolve
  })
  const f = await fixture({
    afterDiscardTombstone: async () => {
      signal()
      await resumed
    },
  })
  try {
    const { recovery } = f.owner()
    const first = recovery.resolve(f.a.id, 'discard')
    await started
    let secondSettled = false
    const second = recovery.open(f.a.id).then((result) => {
      secondSettled = true
      return result
    })
    await new Promise<void>((resolve) => setImmediate(resolve))
    assert.equal(secondSettled, false)
    assert.equal(f.service.getOpenTabs().length, 0)
    assert.equal((await f.inspectShadow()).status, 'recoverable')
    assert.equal(
      (
        await f.database.db
          .selectFrom('generation_staging_discarded_session')
          .selectAll()
          .where('local_project_key', '=', f.a.id)
          .execute()
      ).length,
      2,
    )
    resume()
    assert.equal((await first).dirty, false)
    assert.equal((await second).kind, 'opened')
    assert.equal(secondSettled, true)
    assert.equal((await f.inspectShadow()).status, 'absent')
    await f.service.close(f.a.id)
  } finally {
    resume()
    await f.dispose()
  }
})

test('Recover after failed Discard stays reviewable with an explicit warning and never lifts the unsafe generation fence', async () => {
  const f = await fixture()
  try {
    const { orchestrator, recovery } = f.owner()
    const candidate = (await f.staging.listVerifiedCandidates(f.a.id))[0]
    const projectRoot = path.dirname(path.dirname(path.dirname(candidate.assetPath)))
    const retained = `${projectRoot}.retained`
    await rename(projectRoot, retained)
    await symlink(retained, projectRoot)
    await assert.rejects(recovery.resolve(f.a.id, 'discard'), { code: 'STAGING_STORAGE_UNSAFE' })
    await rm(projectRoot)
    await rename(retained, projectRoot)
    const tab = await recovery.resolve(f.a.id, 'recover')
    const warning = await reconcileOpenedProjectGeneration(f.a.id, false, orchestrator, null)
    assert.equal(tab.dirty, true)
    assert.equal(tab.primaryBbox.x, 99)
    assert.match(warning!, /Project is open for review/)
    assert.equal(f.service.getOpenTabs()[0]?.documentId, tab.documentId)
    assert.equal((await f.staging.listVerifiedCandidates(f.a.id)).length, 2)
    assert.throws(() => orchestrator.reopenProjectGeneration(f.a.id), {
      code: 'PROJECT_GENERATION_CLOSING',
    })
    assert.deepEqual(await readFile(f.aPath), f.savedA)
    await f.service.discardAndClose(f.a.id)
    assert.equal(
      await reconcileOpenedProjectGeneration(f.b.id, true, orchestrator, null),
      null,
      'a neighboring healthy document has no warning',
    )
  } finally {
    await f.dispose()
  }
})

test('Physical cleanup failure reports deferred files only after durable discard and resumes on startup', async () => {
  const f = await fixture({
    beforeSessionCleanup: async () => {
      throw new Error('Disk refuses file removal')
    },
  })
  try {
    const candidates = await f.staging.listVerifiedCandidates(f.a.id)
    const tab = await f.owner().recovery.resolve(f.a.id, 'discard')
    assert.match(tab.storageWarning!, /discarded.*files still need cleanup/)
    assert.equal((await f.inspectShadow()).status, 'absent')
    assert.deepEqual(await f.staging.listVerifiedCandidates(f.a.id), [])
    assert.ok((await stat(candidates[0].assetPath)).size > 0)
    await f.service.close(f.a.id)
    const restarted = new GenerationStagingRepository(f.database.db, f.root)
    await restarted.recoverAfterRestart()
    await assert.rejects(stat(candidates[0].assetPath), { code: 'ENOENT' })
    assert.equal((await restarted.listVerifiedCandidates(f.b.id)).length, 1)
    assert.deepEqual(await readFile(f.aPath), f.savedA)
  } finally {
    await f.dispose()
  }
})
