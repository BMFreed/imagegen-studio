import type {
  IgsProjectDocumentV1,
  IgsSmartPatchLayerV1,
  IgsSmartPatchVariantV1,
} from '../../shared/projects/project-schema.js'
import {
  createEmptyProjectDocumentV1,
  IGS_SAFETY_CEILINGS,
  parseProjectDocumentV1,
} from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { openAppDatabase } from '../db/database.js'
import { readIgsPackage } from './igs-package.js'
import { ProjectAutosaveLeaseRegistry, type ProjectAutosaveOptions } from './project-autosave.js'
import { ProjectIndexRepository } from './project-index.js'
import { ProjectService } from './project-service.js'
import { ProjectShadowStore } from './project-shadow.js'
import {
  projectSmartPatchAdoptionDocument,
  projectSmartPatchVariantHandoffProof,
  type SmartPatchAdoptionRequest,
} from './project-smart-patch-adoption.js'
import { literalSmartPatchColorPng } from './test-fixtures/smart-patch-input-material.js'
import { smartPatchVariantMetadataFixture } from './test-fixtures/smart-patch-variant.js'

type Family = 'anima' | 'illustrious'
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

/** Literal image/provenance preconditions only; candidate qualification belongs to the acceptor. */
function literalVariant(
  document: IgsProjectDocumentV1,
  layerId: string,
  family: Family,
  index = 0,
) {
  const value = smartPatchVariantMetadataFixture(family)
  const alpha = Uint8Array.from({ length: 35 }, (_, i) => (i === index % 35 ? 128 : 0))
  const bytes = literalSmartPatchColorPng(
    7,
    5,
    Array.from(alpha, (a) => [20 + index, 80, 140, a]).flat(),
    4,
  )
  value.asset.bytes = bytes.length
  value.asset.sha256 = digest(bytes)
  value.name = `Literal ${family} variant ${index}`
  value.generationProvenance.layerSourceContext.layerId = layerId
  value.generationProvenance.layerSourceContext.sourceDocumentId = document.documentId
  value.generationProvenance.layerSourceContext.sourceDocumentRevision = document.documentRevision
  Object.assign(value.generationProvenance.executionResultContext.output, {
    byteSize: bytes.length,
    contributionAlpha8: { byteSize: 35, height: 5, sha256: digest(alpha), width: 7 },
    sha256: digest(bytes),
  })
  return { bytes, value }
}

function emptyPatch(document: IgsProjectDocumentV1): IgsSmartPatchLayerV1 {
  return {
    activeRasterSubLayerId: null,
    blendMode: 'normal',
    boundingBox: { height: 256, width: 256, x: 0, y: 0 },
    generationDraft: structuredClone(document.generationDraft),
    id: randomUUID(),
    internalResolution: { height: 256, width: 256 },
    kind: 'smart-patch',
    locked: false,
    mask: { asset: null, id: randomUUID(), revision: 0 },
    name: 'Owned Patch',
    opacity: 1,
    rasterSubLayers: [],
    visible: true,
  }
}

function request(
  document: IgsProjectDocumentV1,
  patch: IgsSmartPatchLayerV1,
  variants: IgsSmartPatchVariantV1[],
): SmartPatchAdoptionRequest {
  return {
    acceptedVariants: variants,
    activeVariantId: variants.at(-1)!.id,
    documentId: document.documentId,
    expectedDocumentRevision: document.documentRevision,
    targetLayerId: patch.id,
  }
}

async function withService(
  run: (f: {
    root: string
    service: ProjectService
    setBeforeCommit: (hook: ProjectAutosaveOptions['beforeEditCommit']) => void
    shadow: ProjectShadowStore
  }) => Promise<void>,
) {
  const root = await mkdtemp(path.join(tmpdir(), 'igs-patch-adoption-'))
  const database = openAppDatabase(root, path.resolve('src/main/db/migrations'))
  const shadow = new ProjectShadowStore(path.join(root, 'autosave'))
  let beforeCommit: ProjectAutosaveOptions['beforeEditCommit']
  const service = new ProjectService({
    autosaveOptions: {
      beforeEditCommit: async (document) => beforeCommit?.(document),
      debounceMs: 60_000,
      leaseRegistry: new ProjectAutosaveLeaseRegistry(),
    },
    dataRoot: root,
    repository: new ProjectIndexRepository(database.db),
    roots: {
      placeholdersDir: path.resolve('src/main/projects/placeholders'),
      scratchDir: path.join(root, 'scratch'),
    },
    shadow,
  })
  try {
    await run({
      root,
      service,
      setBeforeCommit: (hook) => {
        beforeCommit = hook
      },
      shadow,
    })
  } finally {
    beforeCommit = undefined
    for (const tab of service.getOpenTabs()) {
      await service.discardAndClose(tab.id)
    }
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
}

async function prepareBatch(
  f: { root: string; service: ProjectService },
  tabId: string,
  layerId: string,
  families: Family[],
) {
  const owner = f.service.getOpenDocumentForAcceptance(tabId)!
  const variants = families.map((family, index) =>
    literalVariant(owner.document, layerId, family, index),
  )
  const sources: Record<string, { sourcePath: string }> = {}
  for (const [index, variant] of variants.entries()) {
    const sourcePath = path.join(f.root, `${randomUUID()}-${index}.png`)
    await writeFile(sourcePath, variant.bytes)
    sources[variant.value.asset.path] = { sourcePath }
  }
  const patch = owner.document.layers.find(({ id }) => id === layerId)
  assert.ok(patch?.kind === 'smart-patch')
  return {
    input: request(
      owner.document,
      patch,
      variants.map(({ value }) => value),
    ),
    owner,
    sources,
    variants,
  }
}

for (const family of ['illustrious', 'anima'] as const) {
  test(`real private ${family} adoption retains prior variants, changes one active owner and is one Undo with shadow/Save/reopen`, async () => {
    await withService(async (f) => {
      let tab = await f.service.create({ height: 256, title: `Adopt ${family}`, width: 256 })
      tab = await f.service.addSmartPatchLayer(tab.id)
      const patchId = tab.layers[0].id
      const old = await prepareBatch(f, tab.id, patchId, [family])
      await f.service.appendSmartPatchVariants(tab.id, old.input, old.sources)
      await f.service.save(tab.id)
      await f.service.clearHistory(tab.id)
      const savedBefore = await readFile(old.owner.filePath)
      const fresh = await prepareBatch(f, tab.id, patchId, [family, family])
      const before = structuredClone(fresh.owner.document)
      // The latest authored geometry intentionally differs from the frozen accepted world bbox.
      assert.notDeepEqual(
        before.layers[0].kind === 'smart-patch' ? before.layers[0].boundingBox : null,
        fresh.variants[0].value.bbox,
      )
      const applied = await f.service.appendSmartPatchVariants(tab.id, fresh.input, fresh.sources)
      assert.equal(applied.kind, 'adopted')
      const actual = fresh.owner.document.layers[0]
      assert.ok(actual.kind === 'smart-patch')
      assert.deepEqual(actual.rasterSubLayers, [
        old.variants[0].value,
        ...fresh.variants.map(({ value }) => value),
      ])
      assert.equal(actual.activeRasterSubLayerId, fresh.input.activeVariantId)
      assert.deepEqual(actual.boundingBox, (before.layers[0] as IgsSmartPatchLayerV1).boundingBox)
      assert.equal((await readFile(old.owner.filePath)).equals(savedBefore), true)
      for (const source of Object.values(fresh.sources)) {
        await rm(source.sourcePath)
      }
      await f.service.flushAutosave(tab.id)
      const shadow = await f.shadow.inspect({
        projectPath: old.owner.filePath,
        savedPackage: await readIgsPackage(old.owner.filePath),
      })
      assert.equal(shadow.status, 'recoverable')
      const undone = await f.service.undo(tab.id)
      assert.equal(undone.canUndo, false, 'The entire appended batch consumes one history step.')
      assert.deepEqual(old.owner.document.layers, before.layers)
      await f.service.redo(tab.id)
      assert.equal(
        projectSmartPatchVariantHandoffProof(old.owner.document, fresh.input),
        'complete',
      )
      await f.service.save(tab.id)
      const archive = await readIgsPackage(old.owner.filePath)
      const stored = archive.project.layers[0]
      assert.ok(stored.kind === 'smart-patch')
      assert.equal(stored.activeRasterSubLayerId, fresh.input.activeVariantId)
      for (const variant of [...old.variants, ...fresh.variants]) {
        assert.equal(
          (await archive.readMember(variant.value.asset.path)).equals(variant.bytes),
          true,
        )
      }
      await f.service.close(tab.id)
      const reopened = await f.service.open(tab.id)
      assert.equal(reopened.kind, 'opened')
      if (reopened.kind !== 'opened') {
        throw new Error('Saved variant Project must reopen.')
      }
      const view = reopened.tab.layers[0]
      assert.ok(view.kind === 'smart-patch')
      assert.equal(view.rasterSubLayers.length, 3)
      assert.equal(view.activeRasterSubLayerId, fresh.input.activeVariantId)
      assert.ok(view.activeRaster)
      assert.deepEqual(view.activeRaster.transform, {
        rotationDegrees: 0,
        scaleX: 1,
        scaleY: 1,
        x: -19,
        y: 31,
      })
    })
  })
}

test('complete replay neither rewinds active selection nor edits a locked hidden changed owner', async () => {
  await withService(async (f) => {
    let tab = await f.service.create({ height: 256, title: 'Replay stored', width: 256 })
    tab = await f.service.addSmartPatchLayer(tab.id)
    const batch = await prepareBatch(f, tab.id, tab.layers[0].id, ['illustrious', 'anima'])
    await f.service.appendSmartPatchVariants(tab.id, batch.input, batch.sources)
    const edited = structuredClone(batch.owner.document)
    const patch = edited.layers[0] as IgsSmartPatchLayerV1
    patch.activeRasterSubLayerId = batch.variants[0].value.id
    patch.boundingBox.x += 24
    patch.mask.revision += 1
    patch.locked = true
    patch.visible = false
    patch.rasterSubLayers[0].name = 'Renamed stored variant'
    await batch.owner.applyDocument(edited)
    await f.service.clearHistory(tab.id)
    const before = structuredClone(batch.owner.document)
    const replay = await f.service.appendSmartPatchVariants(tab.id, batch.input)
    assert.equal(replay.kind, 'already-adopted')
    assert.equal(batch.owner.canUndo, false)
    assert.deepEqual(batch.owner.document, before)
    assert.equal(projectSmartPatchVariantHandoffProof(before, batch.input), 'complete')
  })
})

test('fresh adoption refuses locked or hidden exact targets and foreign documents without a history edit', async () => {
  await withService(async (f) => {
    let tab = await f.service.create({ height: 256, title: 'Blocked adoption', width: 256 })
    tab = await f.service.addSmartPatchLayer(tab.id)
    const batch = await prepareBatch(f, tab.id, tab.layers[0].id, ['illustrious'])
    await f.service.clearHistory(tab.id)
    for (const change of [
      { kind: 'lock' as const, locked: true },
      { kind: 'visibility' as const, visible: false },
    ]) {
      await f.service.updateSmartPatchLayer(tab.id, batch.input.targetLayerId, change)
      const before = structuredClone(batch.owner.document)
      await assert.rejects(
        f.service.appendSmartPatchVariants(
          tab.id,
          { ...batch.input, expectedDocumentRevision: before.documentRevision },
          batch.sources,
        ),
        { code: 'SMART_PATCH_TARGET_BLOCKED' },
      )
      assert.deepEqual(batch.owner.document, before)
      await f.service.undo(tab.id)
    }
    await assert.rejects(
      f.service.appendSmartPatchVariants(
        tab.id,
        { ...batch.input, documentId: randomUUID() },
        batch.sources,
      ),
      { code: 'SMART_PATCH_ADOPTION_INVALID' },
    )
    assert.equal(batch.owner.canUndo, false)
    const control = await f.service.appendSmartPatchVariants(
      tab.id,
      { ...batch.input, expectedDocumentRevision: batch.owner.document.documentRevision },
      batch.sources,
    )
    assert.equal(control.kind, 'adopted')
  })
})

test('a real concurrent edit during source adoption cannot publish the stale variant batch', async () => {
  await withService(async (f) => {
    let tab = await f.service.create({ height: 256, title: 'Late document edit', width: 256 })
    tab = await f.service.addSmartPatchLayer(tab.id)
    const batch = await prepareBatch(f, tab.id, tab.layers[0].id, ['anima'])
    let entered!: () => void
    let release!: () => void
    const started = new Promise<void>((resolve) => {
      entered = resolve
    })
    const hold = new Promise<void>((resolve) => {
      release = resolve
    })
    f.setBeforeCommit(async () => {
      f.setBeforeCommit(undefined)
      entered()
      await hold
    })
    const appending = f.service.appendSmartPatchVariants(tab.id, batch.input, batch.sources)
    await started
    await f.service.updateSmartPatchLayer(tab.id, batch.input.targetLayerId, {
      kind: 'lock',
      locked: true,
    })
    release()
    await assert.rejects(appending, { code: 'EDIT_CONFLICT' })
    const patch = batch.owner.document.layers[0] as IgsSmartPatchLayerV1
    assert.equal(patch.rasterSubLayers.length, 0)
    assert.equal(patch.locked, true)
    await f.service.undo(tab.id)
    const control = await f.service.appendSmartPatchVariants(
      tab.id,
      { ...batch.input, expectedDocumentRevision: batch.owner.document.documentRevision },
      batch.sources,
    )
    assert.equal(control.kind, 'adopted')
  })
})

test('caller mutation after the real precommit signal cannot replace proposed metadata or source identities', async () => {
  await withService(async (f) => {
    let tab = await f.service.create({ height: 256, title: 'Captured adoption inputs', width: 256 })
    tab = await f.service.addSmartPatchLayer(tab.id)
    const batch = await prepareBatch(f, tab.id, tab.layers[0].id, ['illustrious'])
    const expected = structuredClone(batch.input.acceptedVariants)
    let entered!: () => void
    let release!: () => void
    const started = new Promise<void>((resolve) => {
      entered = resolve
    })
    const hold = new Promise<void>((resolve) => {
      release = resolve
    })
    f.setBeforeCommit(async () => {
      f.setBeforeCommit(undefined)
      entered()
      await hold
    })
    const appending = f.service.appendSmartPatchVariants(tab.id, batch.input, batch.sources)
    await started
    batch.input.acceptedVariants[0].name = 'Caller attempted replacement'
    batch.input.activeVariantId = randomUUID()
    Object.values(batch.sources)[0].sourcePath = path.join(f.root, 'missing.png')
    release()
    await appending
    const patch = batch.owner.document.layers[0] as IgsSmartPatchLayerV1
    assert.deepEqual(patch.rasterSubLayers, expected)
    assert.equal(patch.activeRasterSubLayerId, expected[0].id)
  })
})

test('handoff proof distinguishes absent, partial, changed and duplicate accepted identities while ignoring display edits', () => {
  const document = createEmptyProjectDocumentV1({ title: 'Proof state matrix' })
  const patch = emptyPatch(document)
  document.layers = [patch]
  const values = ['illustrious', 'anima'].map(
    (family, index) => literalVariant(document, patch.id, family as Family, index).value,
  )
  const input = request(document, patch, values)
  assert.equal(projectSmartPatchVariantHandoffProof(document, input), 'absent')
  const complete = projectSmartPatchAdoptionDocument(document, input).document
  assert.equal(projectSmartPatchVariantHandoffProof(complete, input), 'complete')
  const partial = structuredClone(complete)
  const target = partial.layers[0] as IgsSmartPatchLayerV1
  target.rasterSubLayers.pop()
  target.activeRasterSubLayerId = values[0].id
  assert.equal(projectSmartPatchVariantHandoffProof(partial, input), 'changed')
  const changed = structuredClone(complete)
  ;(
    changed.layers[0] as IgsSmartPatchLayerV1
  ).rasterSubLayers[0].generationProvenance.executionResultContext.acceptedAt =
    '2026-10-15T10:02:00.000Z'
  assert.equal(projectSmartPatchVariantHandoffProof(changed, input), 'changed')
  const duplicate = structuredClone(complete)
  const other = emptyPatch(duplicate)
  const copied = structuredClone(values[0])
  copied.id = randomUUID()
  copied.asset.path = `assets/layers/${copied.id}.png`
  copied.generationProvenance.layerSourceContext.layerId = other.id
  other.rasterSubLayers = [copied]
  other.activeRasterSubLayerId = copied.id
  duplicate.layers.push(other)
  assert.equal(projectSmartPatchVariantHandoffProof(duplicate, input), 'changed')
  assert.throws(() => projectSmartPatchAdoptionDocument(duplicate, input), {
    code: 'SMART_PATCH_ADOPTION_CONFLICT',
  })
  assert.equal(projectSmartPatchVariantHandoffProof({ ...complete, layers: [] }, input), 'absent')
})

test('historical copied Patch variants preserve original handoff proof without blocking unrelated new adoption', () => {
  const document = createEmptyProjectDocumentV1({ title: 'Historical copied variants' })
  const original = emptyPatch(document)
  const unrelated = emptyPatch(document)
  document.layers = [original, unrelated]
  const value = literalVariant(document, original.id, 'illustrious').value
  const originalRequest = request(document, original, [value])
  const accepted = projectSmartPatchAdoptionDocument(document, originalRequest).document
  const copied = emptyPatch(accepted)
  const historical = structuredClone(value)
  historical.id = randomUUID()
  historical.asset.path = `assets/layers/${historical.id}.png`
  historical.name = 'Historical copy with unchanged provenance'
  copied.rasterSubLayers = [historical]
  copied.activeRasterSubLayerId = historical.id
  const withCopy = parseProjectDocumentV1({ ...accepted, layers: [...accepted.layers, copied] })
  assert.deepEqual(historical.generationProvenance, value.generationProvenance)
  assert.equal(projectSmartPatchVariantHandoffProof(withCopy, originalRequest), 'complete')
  const next = literalVariant(withCopy, unrelated.id, 'anima').value
  const nextRequest = request(withCopy, unrelated, [next])
  const proposed = projectSmartPatchAdoptionDocument(withCopy, nextRequest)
  assert.equal(proposed.kind, 'adopted')
  assert.deepEqual(proposed.document.layers[0], withCopy.layers[0])
  assert.deepEqual(proposed.document.layers[2], withCopy.layers[2])

  const copiedOnly = structuredClone(withCopy)
  const formerOwner = copiedOnly.layers[0] as IgsSmartPatchLayerV1
  formerOwner.rasterSubLayers = []
  formerOwner.activeRasterSubLayerId = null
  assert.equal(
    projectSmartPatchVariantHandoffProof(copiedOnly, originalRequest),
    'changed',
    'A historical copy still prevents a second Add of the same accepted candidate.',
  )
  const twoCreationClaims = structuredClone(withCopy)
  ;(
    twoCreationClaims.layers[2] as IgsSmartPatchLayerV1
  ).rasterSubLayers[0].generationProvenance.layerSourceContext.layerId = copied.id
  assert.equal(projectSmartPatchVariantHandoffProof(twoCreationClaims, originalRequest), 'changed')
  assert.equal(
    projectSmartPatchAdoptionDocument(twoCreationClaims, nextRequest).kind,
    'adopted',
    'A conflict in another historical candidate does not change this new candidate identity.',
  )
})

test('prospective package preflight refuses total asset and JSON ceilings before source adoption and admits their neighbor', () => {
  const document = createEmptyProjectDocumentV1({ title: 'Declared finite package limits' })
  const patch = emptyPatch(document)
  document.layers = [patch]
  const value = literalVariant(document, patch.id, 'illustrious').value
  const input = request(document, patch, [value])
  const largeReferences = Array.from({ length: 4 }, () => {
    const id = randomUUID()
    return {
      asset: {
        bytes: IGS_SAFETY_CEILINGS.memberBytes,
        height: 1,
        path: `assets/layers/${id}.png`,
        sha256: 'f'.repeat(64),
        width: 1,
      },
      blendMode: 'normal' as const,
      id,
      kind: 'raster' as const,
      locked: false,
      name: 'Metadata-only package ceiling precondition',
      opacity: 1,
      transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 0, y: 0 },
      visible: true,
    }
  })
  assert.throws(
    () =>
      projectSmartPatchAdoptionDocument(
        { ...document, layers: [patch, ...largeReferences] },
        input,
      ),
    { code: 'SMART_PATCH_ADOPTION_LIMIT' },
  )
  assert.equal(
    projectSmartPatchAdoptionDocument(
      { ...document, layers: [patch, ...largeReferences.slice(1)] },
      input,
    ).kind,
    'adopted',
  )
  const largeVariants = Array.from({ length: 8 }, (_, index) => {
    const variant = literalVariant(document, patch.id, 'illustrious', index).value
    variant.generationProvenance.generationConfiguration.positivePrompt.text = 'p'.repeat(
      IGS_SAFETY_CEILINGS.textBytes,
    )
    variant.generationProvenance.layerSourceContext.generationDraft.positivePrompt.text =
      'a'.repeat(IGS_SAFETY_CEILINGS.textBytes)
    return variant
  })
  assert.throws(
    () => projectSmartPatchAdoptionDocument(document, request(document, patch, largeVariants)),
    { code: 'SMART_PATCH_ADOPTION_LIMIT' },
  )
  assert.equal(
    projectSmartPatchAdoptionDocument(document, request(document, patch, largeVariants.slice(1)))
      .kind,
    'adopted',
  )
})
