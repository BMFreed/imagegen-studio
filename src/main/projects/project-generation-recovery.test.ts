import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import type { IgsProjectDocumentV1 } from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rename, rm, stat, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import type { PreparedNormalTxt2Img } from './project-generation-preparation.js'

import { openAppDatabase } from '../db/database.js'
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
import { ProjectGenerationOperationGate } from './project-generation-operation-gate.js'
import {
  ProjectGenerationRecovery,
  reconcileOpenedProjectGeneration,
} from './project-generation-recovery.js'
import { ProjectIndexRepository } from './project-index.js'
import { readProjectPlaceholders } from './project-placeholders.js'
import { ProjectService } from './project-service.js'
import { ProjectShadowStore } from './project-shadow.js'
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
  const newService = () =>
    new ProjectService({
      autosaveOptions: { debounceMs: 0, leaseRegistry: new ProjectAutosaveLeaseRegistry() },
      dataRoot: root,
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

test('A missing recovery decision never discards otherwise valid Project staging', async () => {
  const f = await fixture()
  try {
    await f.shadow.discard(f.aPath)
    await assert.rejects(f.owner().recovery.resolve(f.a.id, 'discard'), {
      code: 'PROJECT_RECOVERY_UNAVAILABLE',
    })
    assert.equal((await f.staging.listVerifiedCandidates(f.a.id)).length, 2)
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
