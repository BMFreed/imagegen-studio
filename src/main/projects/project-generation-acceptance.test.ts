import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import { IGS_SAFETY_CEILINGS } from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import type { VerifiedGenerationCandidate } from './generation-staging.js'
import type { ProjectGenerationAcceptanceOptions } from './project-generation-acceptance.js'

import { readIgsPackage } from './igs-package.js'
import { ProjectAutosaveCoordinator, ProjectAutosaveLeaseRegistry } from './project-autosave.js'
import { ProjectGenerationAcceptance } from './project-generation-acceptance.js'
import { ProjectGenerationOperationGate } from './project-generation-operation-gate.js'
import { localProjectRecoveryKey } from './project-identity.js'
import { ProjectSession } from './project-session.js'
import { ProjectShadowStore } from './project-shadow.js'
import { acceptedOutputPngFixture } from './test-fixtures/accepted-provenance.js'

const placeholdersDir = path.resolve('src/main/projects/placeholders')
const bbox = { height: 8, width: 8, x: -24, y: 48 }
const sha256 = (bytes: string | Buffer): string => createHash('sha256').update(bytes).digest('hex')

async function candidate(
  projectPath: string,
  documentId: string,
  documentRevision: string,
  assetPath: string,
  bytes: Buffer,
  completionOrder: number,
): Promise<VerifiedGenerationCandidate> {
  const id = randomUUID()
  const checkpoint = {
    baseModelFamily: 'illustrious',
    civitaiFileId: 23,
    civitaiModelId: 21,
    civitaiVersionId: 22,
    displayName: 'Verified checkpoint',
    fileSha256: 'a'.repeat(64),
    kind: 'checkpoint',
    localModelId: randomUUID(),
    localVersionId: randomUUID(),
    predictionType: 'epsilon',
    versionName: 'v1',
  }
  const prompts = { negative: 'blur', positive: 'a red lantern' }
  const sampling = {
    cfgScale: 7.5,
    invokeScheduler: 'dpmpp_2m_k',
    requestedSeedPolicy: 'fixed',
    sampler: 'DPM++ 2M',
    scheduler: 'Karras',
    seed: 42,
    steps: 24,
  }
  const target = {
    byteSize: bytes.length,
    colorSpace: 'srgb',
    format: 'png',
    height: bbox.height,
    iccSha256: IGS_SRGB_ICC_SHA256,
    sha256: sha256(bytes),
    width: bbox.width,
  }
  const frozenPayloadJson = JSON.stringify({
    context: {
      bbox,
      documentId,
      documentRevision,
      kind: 'normal-txt2img-preparation',
      model: { managedPath: '/private/checkpoint.safetensors', reference: checkpoint },
      prompts,
      sampling,
      schemaVersion: 1,
      target,
    },
    kind: 'illustrious-txt2img',
    originRequestId: randomUUID(),
    schemaVersion: 1,
    workerJob: {
      bbox,
      checkpoint: {
        path: '/private/checkpoint.safetensors',
        predictionType: checkpoint.predictionType,
        sha256: checkpoint.fileSha256,
      },
      prompts,
      sampling: {
        cfgScale: sampling.cfgScale,
        scheduler: sampling.invokeScheduler,
        seed: sampling.seed,
        steps: sampling.steps,
      },
      schemaVersion: 1,
      target: {
        byteSize: target.byteSize,
        height: target.height,
        iccSha256: target.iccSha256,
        sha256: target.sha256,
        width: target.width,
      },
    },
  })
  await writeFile(assetPath, bytes)
  return {
    actualSeed: 42,
    assetPath,
    bbox: { ...bbox },
    candidateId: id,
    completedAt: '2026-09-29T10:00:00.000Z',
    completionOrder,
    documentId,
    documentRevision,
    frozenPayloadJson,
    frozenPayloadSha256: sha256(frozenPayloadJson),
    image: {
      byteSize: bytes.length,
      height: bbox.height,
      iccSha256: IGS_SRGB_ICC_SHA256,
      sha256: sha256(bytes),
      width: bbox.width,
    },
    localProjectKey: localProjectRecoveryKey(projectPath),
    projectPath,
    queueItemId: id,
    stagingSessionId: randomUUID(),
  }
}

async function withFixture(
  run: (fixture: Awaited<ReturnType<typeof createFixture>>) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-acceptance-'))
  try {
    await run(await createFixture(root))
  } finally {
    await rm(root, { force: true, recursive: true })
  }
}

async function createFixture(root: string) {
  const roots = { placeholdersDir, scratchDir: path.join(root, 'scratch') }
  const session = await ProjectSession.create(path.join(root, 'Project.igs'), 'Project', roots)
  const projectPath = session.filePath
  const tabId = localProjectRecoveryKey(projectPath)
  const shadow = new ProjectShadowStore(path.join(root, 'shadow'))
  let owner: ProjectAutosaveCoordinator | null = await ProjectAutosaveCoordinator.attach(
    session,
    roots,
    shadow,
    { debounceMs: 60_000 },
  )
  const output = await acceptedOutputPngFixture()
  const first = await candidate(
    projectPath,
    session.document.documentId,
    session.document.documentRevision,
    path.join(root, 'first.png'),
    output,
    1,
  )
  const second = await candidate(
    projectPath,
    session.document.documentId,
    session.document.documentRevision,
    path.join(root, 'second.png'),
    output,
    2,
  )
  let candidates = [first, second]
  let unfinished = 0
  let fenced = false
  const discarded: string[][] = []
  const gate = new ProjectGenerationOperationGate()
  const options: ProjectGenerationAcceptanceOptions = {
    documents: { getOpenDocument: (key) => (key === tabId ? owner : null) },
    gate,
    now: () => '2026-09-29T10:01:00.000Z',
    orchestrator: {
      fenceProjectGeneration: async () => {
        fenced = true
      },
      releaseProjectGenerationFence: () => {
        fenced = false
      },
    },
    queue: { listUnfinishedByProject: async () => Array.from({ length: unfinished }) },
    staging: {
      discardSessions: async (_key, ids) => {
        const target = new Set(ids)
        discarded.push([...target])
        candidates = candidates.filter((item) => !target.has(item.stagingSessionId))
        return { cleanupDeferred: false, discardedSessionCount: target.size }
      },
      listVerifiedCandidates: async () => [...candidates],
      readVerifiedCandidatePng: async (request) => {
        const entry = candidates.find(
          (item) =>
            item.candidateId === request.candidateId &&
            item.stagingSessionId === request.stagingSessionId &&
            item.image.sha256 === request.imageSha256,
        )
        return entry ? await readFile(entry.assetPath) : null
      },
    },
  }
  return {
    get availableIds() {
      return candidates
        .filter(
          (item) =>
            item.documentId === owner?.document.documentId && item.projectPath === projectPath,
        )
        .map((item) => item.candidateId)
    },
    get candidates() {
      return candidates
    },
    discarded,
    get fenced() {
      return fenced
    },
    first,
    gate,
    options,
    output,
    get owner() {
      return owner
    },
    projectPath,
    roots,
    second,
    setCandidates(value: VerifiedGenerationCandidate[]) {
      candidates = value
    },
    setOwner(value: ProjectAutosaveCoordinator | null) {
      owner = value
    },
    setUnfinished(value: number) {
      unfinished = value
    },
    shadow,
    tabId,
  }
}

test('multi-session Add durably stores ordered Raster Layers before targeted staging discard', async () => {
  await withFixture(async (fixture) => {
    const savedBefore = await readFile(fixture.projectPath)
    const acceptance = new ProjectGenerationAcceptance(fixture.options)
    const accepted = await acceptance.accept(
      fixture.tabId,
      [fixture.second.candidateId, fixture.first.candidateId],
      fixture.second.candidateId,
      fixture.availableIds,
    )
    assert.equal(accepted.kind, 'accepted')
    assert.deepEqual(await readFile(fixture.projectPath), savedBefore)
    assert.equal(fixture.owner?.dirty, true)
    assert.deepEqual(fixture.discarded, [
      [fixture.first.stagingSessionId, fixture.second.stagingSessionId],
    ])
    assert.deepEqual(fixture.candidates, [])
    const layers = fixture.owner.document.layers
    assert.equal(layers.length, 2)
    assert.deepEqual(
      layers.map((layer) => layer.generationProvenance?.executionResultContext.candidateId),
      [fixture.first.candidateId, fixture.second.candidateId],
    )
    assert.deepEqual(
      layers.map((layer) => layer.visible),
      [false, true],
    )
    assert.deepEqual(
      layers.map((layer) => [layer.transform.x, layer.transform.y]),
      [
        [-24, 48],
        [-24, 48],
      ],
    )
    assert.equal(layers[0]?.generationProvenance?.generationConfiguration.sampling.actualSeed, 42)
    assert.equal(
      (await ProjectAutosaveCoordinator.inspectRecovery(fixture.projectPath, fixture.shadow))
        .status,
      'recoverable',
    )
    assert.equal(fixture.fenced, false)
    const saved = await fixture.owner.save()
    assert.equal(saved.committed, true)
    const packageContent = await readIgsPackage(fixture.projectPath)
    assert.equal(packageContent.project.layers.length, 2)
    assert.deepEqual(await packageContent.readMember(layers[0].asset.path), fixture.output)
    assert.deepEqual(await packageContent.readMember(layers[1].asset.path), fixture.output)
    assert.deepEqual(
      await acceptance.accept(
        fixture.tabId,
        [fixture.first.candidateId, fixture.second.candidateId],
        null,
        fixture.availableIds,
      ),
      {
        documentRevision: fixture.owner.document.documentRevision,
        kind: 'already-accepted',
        layerIds: [layers[0].id, layers[1].id],
      },
    )
    assert.equal(fixture.owner.document.layers.length, 2)
  })
})

test('unfinished job and mismatched document reject Add before any layer or tombstone', async () => {
  await withFixture(async (fixture) => {
    const acceptance = new ProjectGenerationAcceptance(fixture.options)
    fixture.setUnfinished(1)
    assert.equal(await acceptance.reconcile(fixture.tabId), 'none')
    assert.equal(fixture.fenced, false)
    await assert.rejects(
      acceptance.accept(fixture.tabId, [fixture.first.candidateId], null, fixture.availableIds),
      {
        code: 'ACCEPTANCE_UNFINISHED_JOBS',
      },
    )
    assert.equal(fixture.fenced, false)
    fixture.setUnfinished(0)
    fixture.first.documentId = randomUUID()
    await assert.rejects(
      acceptance.accept(fixture.tabId, [fixture.first.candidateId], null, fixture.availableIds),
      {
        code: 'PROJECT_DOCUMENT_CHANGED',
      },
    )
    assert.deepEqual(fixture.discarded, [])
    assert.equal(fixture.owner!.document.layers.length, 0)
  })
})

test('accepting current results preserves an orphan from an earlier document at the same path', async () => {
  await withFixture(async (fixture) => {
    const orphan = await candidate(
      fixture.projectPath,
      randomUUID(),
      randomUUID(),
      path.join(path.dirname(fixture.projectPath), 'orphan.png'),
      fixture.output,
      3,
    )
    fixture.setCandidates([...fixture.candidates, orphan])
    const acceptance = new ProjectGenerationAcceptance(fixture.options)
    assert.equal(
      (
        await acceptance.accept(
          fixture.tabId,
          [fixture.first.candidateId],
          null,
          fixture.availableIds,
        )
      ).kind,
      'accepted',
    )
    assert.deepEqual(
      fixture.candidates.map((item) => item.candidateId),
      [orphan.candidateId],
    )
    assert.deepEqual(fixture.discarded, [
      [fixture.first.stagingSessionId, fixture.second.stagingSessionId],
    ])
    assert.equal(fixture.owner!.document.layers.length, 1)
  })
})

test('Add rejects a stale all-results snapshot before editing or clearing unseen candidates', async () => {
  await withFixture(async (fixture) => {
    const confirmedIds = fixture.availableIds
    const later = await candidate(
      fixture.projectPath,
      fixture.owner!.document.documentId,
      fixture.owner!.document.documentRevision,
      path.join(path.dirname(fixture.projectPath), 'later-unseen.png'),
      fixture.output,
      3,
    )
    fixture.setCandidates([...fixture.candidates, later])
    const acceptance = new ProjectGenerationAcceptance(fixture.options)
    const before = fixture.owner!.document.documentRevision
    await assert.rejects(
      acceptance.accept(fixture.tabId, [fixture.first.candidateId], null, confirmedIds),
      { code: 'ACCEPTANCE_SELECTION_STALE' },
    )
    assert.equal(fixture.owner!.document.documentRevision, before)
    assert.equal(fixture.owner!.document.layers.length, 0)
    assert.deepEqual(fixture.discarded, [])
    assert.deepEqual(
      fixture.candidates.map((item) => item.candidateId),
      [fixture.first.candidateId, fixture.second.candidateId, later.candidateId],
    )
    assert.equal(fixture.fenced, false)
    assert.equal(
      (
        await acceptance.accept(
          fixture.tabId,
          [fixture.first.candidateId],
          null,
          fixture.availableIds,
        )
      ).kind,
      'accepted',
    )
    assert.deepEqual(fixture.candidates, [])
  })
})

test('interrupted handoff with unfinished work retains its fence and candidate bytes', async () => {
  await withFixture(async (fixture) => {
    const acceptance = new ProjectGenerationAcceptance({
      ...fixture.options,
      afterDurableShadow: async () => {
        throw new Error('stop after shadow')
      },
    })
    await assert.rejects(
      acceptance.accept(fixture.tabId, [fixture.first.candidateId], null, fixture.availableIds),
    )
    fixture.setUnfinished(1)
    await assert.rejects(acceptance.reconcile(fixture.tabId), {
      code: 'ACCEPTANCE_UNFINISHED_JOBS',
    })
    assert.equal(fixture.fenced, true)
    assert.equal(fixture.candidates.length, 2)
    assert.deepEqual(fixture.discarded, [])
  })
})

test('uninspectable recovery storage keeps generation admission fenced', async () => {
  await withFixture(async (fixture) => {
    const acceptance = new ProjectGenerationAcceptance({
      ...fixture.options,
      staging: {
        ...fixture.options.staging,
        listVerifiedCandidates: async () => {
          throw new Error('storage inspection failed')
        },
      },
    })
    await assert.rejects(acceptance.reconcile(fixture.tabId), /storage inspection failed/)
    assert.equal(fixture.fenced, true)
    assert.equal(acceptance.hasPendingHandoff(fixture.tabId), true)
    assert.deepEqual(fixture.discarded, [])
    assert.equal(fixture.owner!.document.layers.length, 0)
  })
})

test('retry after durable-shadow cleanup failure is idempotent and preserves later sessions', async () => {
  await withFixture(async (fixture) => {
    let failOnce = true
    const acceptance = new ProjectGenerationAcceptance({
      ...fixture.options,
      afterDurableShadow: async () => {
        if (failOnce) {
          failOnce = false
          throw new Error('simulated crash after shadow commit')
        }
      },
    })
    await assert.rejects(
      acceptance.accept(fixture.tabId, [fixture.first.candidateId], null, fixture.availableIds),
      /simulated crash/,
    )
    assert.equal(acceptance.hasPendingHandoff(fixture.tabId), true)
    assert.equal(fixture.fenced, true)
    assert.equal(fixture.owner!.document.layers.length, 1)
    assert.equal(
      (await ProjectAutosaveCoordinator.inspectRecovery(fixture.projectPath, fixture.shadow))
        .status,
      'recoverable',
    )
    await assert.rejects(
      acceptance.accept(fixture.tabId, [fixture.second.candidateId], null, fixture.availableIds),
      {
        code: 'ACCEPTANCE_HANDOFF_PENDING',
      },
    )
    assert.equal(fixture.fenced, true, 'a different selection must not lift the pending Add fence')
    assert.equal(acceptance.hasPendingHandoff(fixture.tabId), true)
    assert.deepEqual(fixture.discarded, [])
    // Even if another session appears due to a caller violating the retained fence, retry may
    // tombstone only the IDs captured by the original operation.
    const later = await candidate(
      fixture.projectPath,
      fixture.owner!.document.documentId,
      fixture.owner!.document.documentRevision,
      path.join(path.dirname(fixture.projectPath), 'later.png'),
      fixture.output,
      3,
    )
    fixture.setCandidates([...fixture.candidates, later])
    const result = await acceptance.accept(
      fixture.tabId,
      [fixture.first.candidateId],
      null,
      fixture.availableIds,
    )
    assert.equal(result.kind, 'already-accepted')
    assert.deepEqual(
      fixture.candidates.map((item) => item.candidateId),
      [later.candidateId],
    )
    assert.deepEqual(fixture.discarded, [
      [fixture.first.stagingSessionId, fixture.second.stagingSessionId],
    ])
    assert.equal(fixture.owner!.document.layers.length, 1)
    assert.equal(fixture.fenced, false)
    assert.equal(acceptance.hasPendingHandoff(fixture.tabId), false)
  })
})

test('a clean retry tombstones only after the exact saved package is reverified', async () => {
  await withFixture(async (fixture) => {
    let failOnce = true
    const acceptance = new ProjectGenerationAcceptance({
      ...fixture.options,
      afterDurableShadow: async () => {
        if (failOnce) {
          failOnce = false
          throw new Error('interrupted after shadow')
        }
      },
    })
    await assert.rejects(
      acceptance.accept(fixture.tabId, [fixture.first.candidateId], null, fixture.availableIds),
    )
    assert.equal((await fixture.owner!.save()).committed, true)
    assert.equal(fixture.owner!.dirty, false)
    assert.equal(await fixture.owner!.flush(), null)
    assert.equal(
      (
        await acceptance.accept(
          fixture.tabId,
          [fixture.first.candidateId],
          null,
          fixture.availableIds,
        )
      ).kind,
      'already-accepted',
    )
    assert.deepEqual(fixture.candidates, [])
    assert.equal(fixture.fenced, false)
  })
})

test('a clean retry retains staged bytes if its saved package cannot be verified', async () => {
  await withFixture(async (fixture) => {
    const acceptance = new ProjectGenerationAcceptance({
      ...fixture.options,
      afterDurableShadow: async () => {
        throw new Error('interrupted after shadow')
      },
    })
    await assert.rejects(
      acceptance.accept(fixture.tabId, [fixture.first.candidateId], null, fixture.availableIds),
    )
    assert.equal((await fixture.owner!.save()).committed, true)
    await writeFile(fixture.projectPath, 'broken package')
    await assert.rejects(
      acceptance.accept(fixture.tabId, [fixture.first.candidateId], null, fixture.availableIds),
      {
        code: 'ACCEPTANCE_SHADOW_UNCONFIRMED',
      },
    )
    assert.equal(fixture.fenced, true)
    assert.equal(acceptance.hasPendingHandoff(fixture.tabId), true)
    assert.equal(fixture.candidates.length, 2)
    assert.deepEqual(fixture.discarded, [])
  })
})

test('an ordinary edit after Add commits cannot change the revision being handed to recovery', async () => {
  await withFixture(async (fixture) => {
    const owner = fixture.owner!
    const proxy = {
      applyDocument: async (...args: Parameters<typeof owner.applyDocument>) => {
        const applied = await owner.applyDocument(...args)
        const changed = structuredClone(owner.document)
        changed.title = 'Concurrent title edit'
        await owner.applyDocument(
          changed,
          {},
          {
            expectedDocumentRevision: applied.documentRevision,
          },
        )
        return applied
      },
      get dirty() {
        return owner.dirty
      },
      get document() {
        return owner.document
      },
      get filePath() {
        return owner.filePath
      },
      flush: () => owner.flush(),
    }
    const acceptance = new ProjectGenerationAcceptance({
      ...fixture.options,
      documents: { getOpenDocument: (key) => (key === fixture.tabId ? proxy : null) },
    })
    await assert.rejects(
      acceptance.accept(fixture.tabId, [fixture.first.candidateId], null, fixture.availableIds),
      {
        code: 'ACCEPTANCE_CONFLICT',
      },
    )
    assert.equal(owner.document.title, 'Concurrent title edit')
    assert.equal(owner.document.layers.length, 1)
    assert.equal(fixture.fenced, true)
    assert.equal(acceptance.hasPendingHandoff(fixture.tabId), true)
    assert.deepEqual(fixture.candidates, [fixture.first, fixture.second])
    assert.deepEqual(fixture.discarded, [])
    assert.equal(await acceptance.reconcile(fixture.tabId), 'cleaned')
    assert.deepEqual(fixture.candidates, [])
    assert.equal(fixture.fenced, false)
  })
})

test('an ordinary edit during shadow flush cannot be mistaken for the accepted revision', async () => {
  await withFixture(async (fixture) => {
    const owner = fixture.owner!
    let edited = false
    const proxy = {
      applyDocument: (...args: Parameters<typeof owner.applyDocument>) =>
        owner.applyDocument(...args),
      get dirty() {
        return owner.dirty
      },
      get document() {
        return owner.document
      },
      get filePath() {
        return owner.filePath
      },
      flush: async () => {
        if (!edited) {
          edited = true
          const changed = structuredClone(owner.document)
          changed.title = 'Edit before shadow flush'
          await owner.applyDocument(
            changed,
            {},
            {
              expectedDocumentRevision: changed.documentRevision,
            },
          )
        }
        return await owner.flush()
      },
    }
    const acceptance = new ProjectGenerationAcceptance({
      ...fixture.options,
      documents: { getOpenDocument: (key) => (key === fixture.tabId ? proxy : null) },
    })
    await assert.rejects(
      acceptance.accept(fixture.tabId, [fixture.first.candidateId], null, fixture.availableIds),
      {
        code: 'ACCEPTANCE_SHADOW_UNCONFIRMED',
      },
    )
    assert.equal(owner.document.title, 'Edit before shadow flush')
    assert.equal(fixture.fenced, true)
    assert.equal(acceptance.hasPendingHandoff(fixture.tabId), true)
    assert.deepEqual(fixture.discarded, [])
  })
})

test('Add preflights a valid document near the JSON ceiling before editing, then admits a neighbor', async () => {
  await withFixture(async (fixture) => {
    const acceptance = new ProjectGenerationAcceptance(fixture.options)
    await acceptance.accept(fixture.tabId, [fixture.first.candidateId], null, fixture.availableIds)
    const base = structuredClone(fixture.owner!.document)
    const template = base.layers[0]
    const largeLayers = Array.from({ length: 8 }, (_, index) => {
      const layer = structuredClone(template)
      layer.id = randomUUID()
      layer.generationProvenance!.executionResultContext.candidateId = randomUUID()
      layer.name = `Large accepted layer ${index}`
      layer.generationProvenance!.generationConfiguration.positivePrompt.text = 'p'.repeat(
        1_040_000,
      )
      layer.generationProvenance!.generationConfiguration.negativePrompt.text = 'n'.repeat(
        1_040_000,
      )
      return layer
    })
    const projected = { ...base, layers: largeLayers }
    const targetBytes = IGS_SAFETY_CEILINGS.projectJsonBytes - 256
    const extra = targetBytes - Buffer.byteLength(JSON.stringify(projected), 'utf8')
    assert.ok(extra > 0 && extra < 8 * 2 * 8576, 'test document can approach the ceiling')
    let remaining = extra
    for (const layer of largeLayers) {
      for (const prompt of [
        layer.generationProvenance!.generationConfiguration.positivePrompt,
        layer.generationProvenance!.generationConfiguration.negativePrompt,
      ]) {
        const add = Math.min(remaining, 8576)
        prompt.text += 'x'.repeat(add)
        remaining -= add
      }
    }
    assert.equal(remaining, 0)
    assert.equal(Buffer.byteLength(JSON.stringify(projected), 'utf8'), targetBytes)
    await fixture.owner!.applyDocument(
      projected,
      {},
      {
        expectedDocumentRevision: base.documentRevision,
      },
    )
    const closeToLimit = fixture.owner!.document.documentRevision
    const next = await candidate(
      fixture.projectPath,
      fixture.owner!.document.documentId,
      closeToLimit,
      path.join(path.dirname(fixture.projectPath), 'next.png'),
      fixture.output,
      3,
    )
    fixture.setCandidates([next])
    const discardsBefore = fixture.discarded.length
    await assert.rejects(
      acceptance.accept(fixture.tabId, [next.candidateId], null, fixture.availableIds),
      {
        code: 'ACCEPTANCE_PACKAGE_LIMIT',
      },
    )
    assert.equal(fixture.owner!.document.documentRevision, closeToLimit)
    assert.equal(fixture.owner!.document.layers.length, 8)
    assert.deepEqual(
      fixture.candidates.map((item) => item.candidateId),
      [next.candidateId],
    )
    assert.equal(fixture.discarded.length, discardsBefore)
    assert.equal(fixture.fenced, false)

    // A few kilobytes below the ceiling, the same result is still accepted through a real shadow.
    const smaller = structuredClone(fixture.owner!.document)
    smaller.layers[0].generationProvenance!.generationConfiguration.positivePrompt.text =
      smaller.layers[0].generationProvenance!.generationConfiguration.positivePrompt.text.slice(
        0,
        -8000,
      )
    await fixture.owner!.applyDocument(
      smaller,
      {},
      {
        expectedDocumentRevision: closeToLimit,
      },
    )
    assert.equal(
      (await acceptance.accept(fixture.tabId, [next.candidateId], null, fixture.availableIds)).kind,
      'accepted',
    )
    assert.equal(fixture.owner!.document.layers.length, 9)
    assert.deepEqual(fixture.candidates, [])
  })
})

test('recovered shadow can finish tombstones before new Generate admission', async () => {
  await withFixture(async (fixture) => {
    const acceptance = new ProjectGenerationAcceptance({
      ...fixture.options,
      afterDurableShadow: async () => {
        throw new Error('process interruption')
      },
    })
    await assert.rejects(
      acceptance.accept(fixture.tabId, [fixture.first.candidateId], null, fixture.availableIds),
    )
    const restarted = await ProjectAutosaveCoordinator.recover(
      fixture.projectPath,
      fixture.roots,
      fixture.shadow,
      { debounceMs: 60_000, leaseRegistry: new ProjectAutosaveLeaseRegistry() },
    )
    fixture.setOwner(restarted)
    const later = await candidate(
      fixture.projectPath,
      restarted.document.documentId,
      restarted.document.documentRevision,
      path.join(path.dirname(fixture.projectPath), 'later-recovery.png'),
      fixture.output,
      3,
    )
    fixture.setCandidates([...fixture.candidates, later])
    const recoveredAcceptance = new ProjectGenerationAcceptance(fixture.options)
    assert.equal(await recoveredAcceptance.reconcile(fixture.tabId), 'cleaned')
    assert.deepEqual(
      fixture.candidates.map((item) => item.candidateId),
      [fixture.second.candidateId, later.candidateId],
    )
    assert.deepEqual(fixture.discarded, [[fixture.first.stagingSessionId]])
    assert.equal(restarted.document.layers.length, 1)
    assert.equal(fixture.fenced, false)
  })
})

test('gate serializes Add and close operations even if the first operation fails', async () => {
  const gate = new ProjectGenerationOperationGate()
  const events: string[] = []
  let started!: () => void
  const entered = new Promise<void>((resolve) => {
    started = resolve
  })
  let release!: () => void
  const hold = new Promise<void>((resolve) => {
    release = resolve
  })
  const add = gate.run('project', async () => {
    events.push('add-start')
    started()
    await hold
    events.push('add-end')
    throw new Error('add failed')
  })
  const close = gate.run('project', async () => {
    events.push('close')
  })
  await entered
  assert.deepEqual(events, ['add-start'])
  release()
  await assert.rejects(add, /add failed/)
  await close
  assert.deepEqual(events, ['add-start', 'add-end', 'close'])
  await gate.drain('project')
})
