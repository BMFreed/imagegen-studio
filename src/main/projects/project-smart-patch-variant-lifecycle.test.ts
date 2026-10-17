import type { ProjectSmartPatchVariantChange } from '../../shared/api.js'
import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import type {
  IgsProjectDocumentV1,
  IgsSmartPatchLayerV1,
} from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, realpathSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { inflateSync } from 'node:zlib'

import { openAppDatabase } from '../db/database.js'
import { readIgsPackage } from './igs-package.js'
import { ProjectAutosaveLeaseRegistry, type ProjectAutosaveOptions } from './project-autosave.js'
import { ProjectIndexRepository } from './project-index.js'
import { ProjectService } from './project-service.js'
import { ProjectShadowStore } from './project-shadow.js'
import { fixtureMaskPng, paintedPatchFixture } from './test-fixtures/project-mask.js'
import { literalSmartPatchColorPng } from './test-fixtures/smart-patch-input-material.js'
import { smartPatchVariantMetadataFixture } from './test-fixtures/smart-patch-variant.js'
import { ProjectWorkerClient } from './worker-client.js'

const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const sourcePython = path.resolve('worker-python/.venv/bin/python')

function sourceRuntimeRoot(): string | null {
  if (!existsSync(sourcePython)) {
    return null
  }
  const actual = realpathSync(sourcePython).split(path.sep)
  const requested = sourcePython.split(path.sep)
  let common = 0
  while (actual[common] === requested[common] && common < requested.length) {
    common++
  }
  const root = requested.slice(0, common).join(path.sep)
  return root && root !== path.sep ? root : null
}

function patch(document: IgsProjectDocumentV1, layerId: string): IgsSmartPatchLayerV1 {
  const found = document.layers.find(({ id }) => id === layerId)
  assert.ok(found?.kind === 'smart-patch')
  return found
}

/**
 * Real SQLite/migrations, service, coordinator, image validation, shadow and ZIP writer/loader.
 * Private adoption is solely the declared existing-variant precondition; no public Add is claimed.
 */
async function withVariants(
  run: (fixture: {
    newService: () => ProjectService
    owner: NonNullable<ReturnType<ProjectService['getOpenDocumentForAcceptance']>>
    patchId: string
    root: string
    service: ProjectService
    setBeforeCommit: (hook: ProjectAutosaveOptions['beforeEditCommit']) => void
    shadow: ProjectShadowStore
    sourceBytes: Buffer
    tabId: string
    variants: { bytes: Buffer; value: ReturnType<typeof smartPatchVariantMetadataFixture> }[]
  }) => Promise<void>,
) {
  const root = await mkdtemp(path.join(tmpdir(), 'igs-patch-variant-lifecycle-'))
  const database = openAppDatabase(root, path.resolve('src/main/db/migrations'))
  const shadow = new ProjectShadowStore(path.join(root, 'autosave'))
  const services: ProjectService[] = []
  let beforeCommit: ProjectAutosaveOptions['beforeEditCommit']
  const newService = () => {
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
    services.push(service)
    return service
  }
  const service = newService()
  try {
    let tab = await service.create({ height: 256, title: 'Stored variant lifecycle', width: 256 })
    tab = await service.updateGenerationDraft(tab.id, {
      kind: 'positive-prompt',
      text: 'Independent normal generation inputs',
    })
    tab = await service.addSmartPatchLayer(tab.id)
    const neighborId = tab.layers[0].id
    tab = await service.addSmartPatchLayer(tab.id)
    const patchId = tab.layers[0].id
    const owner = service.getOpenDocumentForAcceptance(tab.id)!
    const first = smartPatchVariantMetadataFixture('illustrious')
    const sourceBytes = literalSmartPatchColorPng(
      7,
      5,
      Array.from({ length: 35 }, () => [9, 8, 7, 255]).flat(),
      4,
    )
    const baseline = first.generationProvenance.layerSourceContext
    const authored = paintedPatchFixture(owner.document)
    authored.id = patchId
    authored.name = 'Variant owner'
    authored.boundingBox = { ...baseline.bbox }
    authored.internalResolution = { ...baseline.internalResolution }
    authored.generationDraft = structuredClone(baseline.generationDraft)
    const neighbor = structuredClone(patch(owner.document, neighborId))
    await owner.applyDocument(
      { ...owner.document, layers: [authored, neighbor] },
      { [authored.mask.asset!.path]: { bytes: fixtureMaskPng() } },
    )
    const variants = Array.from({ length: 3 }, (_, index) => {
      const value = index === 0 ? first : smartPatchVariantMetadataFixture('illustrious')
      const alpha = Uint8Array.from({ length: 35 }, (_, i) => (i === index ? 128 : 255))
      const bytes = literalSmartPatchColorPng(
        7,
        5,
        Array.from(alpha, (a) => [20 + index * 70, 80, 140, a]).flat(),
        4,
      )
      value.name = `Stored ${index + 1}`
      value.asset.bytes = bytes.length
      value.asset.sha256 = digest(bytes)
      Object.assign(value.generationProvenance.layerSourceContext, {
        generationDraft: structuredClone(authored.generationDraft),
        layerId: patchId,
        mask: structuredClone(authored.mask),
        sourceDocumentId: owner.document.documentId,
        sourceDocumentRevision: owner.document.documentRevision,
        sourceTarget: {
          byteSize: sourceBytes.length,
          height: 5,
          sha256: digest(sourceBytes),
          width: 7,
        },
      })
      Object.assign(value.generationProvenance.executionResultContext.output, {
        byteSize: bytes.length,
        contributionAlpha8: { byteSize: 35, height: 5, sha256: digest(alpha), width: 7 },
        sha256: digest(bytes),
      })
      return { bytes, value }
    })
    const callerSources: Record<string, { sourcePath: string }> = {}
    for (const [index, variant] of variants.entries()) {
      const sourcePath = path.join(root, `caller-${index}.png`)
      await writeFile(sourcePath, variant.bytes)
      callerSources[variant.value.asset.path] = { sourcePath }
    }
    await service.appendSmartPatchVariants(
      tab.id,
      {
        acceptedVariants: variants.map(({ value }) => value),
        activeVariantId: variants[0].value.id,
        documentId: owner.document.documentId,
        expectedDocumentRevision: owner.document.documentRevision,
        targetLayerId: patchId,
      },
      callerSources,
    )
    for (const { sourcePath } of Object.values(callerSources)) {
      await rm(sourcePath)
    }
    await service.save(tab.id)
    await service.clearHistory(tab.id)
    await run({
      newService,
      owner,
      patchId,
      root,
      service,
      setBeforeCommit: (hook) => {
        beforeCommit = hook
      },
      shadow,
      sourceBytes,
      tabId: tab.id,
      variants,
    })
  } finally {
    beforeCommit = undefined
    if (ProjectWorkerClient.hasUnconfirmedExit()) {
      await database.close()
      process.emitWarning(
        `Retaining test assets until the owned image worker confirms exit: ${root}`,
      )
    } else {
      for (const current of services.reverse()) {
        for (const tab of current.getOpenTabs()) {
          await current.discardAndClose(tab.id)
        }
      }
      await database.close()
      await rm(root, { force: true, recursive: true })
    }
  }
}

function identity(document: IgsProjectDocumentV1) {
  return { documentId: document.documentId, documentRevision: document.documentRevision }
}

// Boundary: real user-command service through normal history. Mutation: replace metadata when
// selecting, rename the whole Patch, omit history, or create history for a normalized no-op.
test('select and trimmed rename change only their owned display field and each consume exactly one Undo', async () => {
  await withVariants(async (f) => {
    const before = structuredClone(f.owner.document)
    const select: ProjectSmartPatchVariantChange = {
      ...identity(before),
      kind: 'select',
      variantId: f.variants[1].value.id,
    }
    await f.service.updateSmartPatchVariant(f.tabId, f.patchId, select)
    const selected = patch(f.owner.document, f.patchId)
    assert.deepEqual(selected, {
      ...patch(before, f.patchId),
      activeRasterSubLayerId: select.variantId,
    })
    assert.deepEqual(f.owner.document.generationDraft, before.generationDraft)
    assert.deepEqual(f.owner.document.layers[1], before.layers[1])
    assert.equal((await f.service.undo(f.tabId)).canUndo, false)
    assert.deepEqual(f.owner.document.layers, before.layers)
    await f.service.redo(f.tabId)
    await f.service.save(f.tabId)
    await f.service.clearHistory(f.tabId)
    const current = structuredClone(f.owner.document)
    await f.service.updateSmartPatchVariant(f.tabId, f.patchId, {
      ...identity(current),
      kind: 'select',
      variantId: select.variantId,
    })
    assert.deepEqual(f.owner.document, current)
    assert.equal(f.owner.canUndo, false)
    assert.equal(f.owner.dirty, false)

    await f.service.updateSmartPatchVariant(f.tabId, f.patchId, {
      ...identity(current),
      kind: 'rename',
      name: '  Lantern alternative  ',
      variantId: select.variantId,
    })
    const expected = structuredClone(patch(current, f.patchId))
    expected.rasterSubLayers[1].name = 'Lantern alternative'
    assert.deepEqual(patch(f.owner.document, f.patchId), expected)
    assert.equal((await f.service.undo(f.tabId)).canUndo, false)
    assert.deepEqual(f.owner.document.layers, current.layers)
    await f.service.redo(f.tabId)
    await f.service.save(f.tabId)
    await f.service.clearHistory(f.tabId)
    const renamed = structuredClone(f.owner.document)
    await f.service.updateSmartPatchVariant(f.tabId, f.patchId, {
      ...identity(renamed),
      kind: 'rename',
      name: ' Lantern alternative ',
      variantId: select.variantId,
    })
    assert.deepEqual(f.owner.document, renamed)
    assert.equal(f.owner.canUndo, false)
    assert.equal(f.owner.dirty, false)
  })
})

// All three positions are the finite ordered-list domain for active deletion. The neighboring
// case deletes an inactive item; mutation: always choose first/last, reset authoring or lose bytes.
for (const activeIndex of [0, 1, 2]) {
  test(`active deletion at index ${activeIndex} chooses the next-at-index or prior last and restores after Save`, async () => {
    await withVariants(async (f) => {
      await f.service.updateSmartPatchVariant(f.tabId, f.patchId, {
        ...identity(f.owner.document),
        kind: 'select',
        variantId: f.variants[activeIndex].value.id,
      })
      await f.service.save(f.tabId)
      await f.service.clearHistory(f.tabId)
      const before = structuredClone(f.owner.document)
      await f.service.updateSmartPatchVariant(f.tabId, f.patchId, {
        ...identity(before),
        kind: 'delete',
        variantId: f.variants[activeIndex].value.id,
      })
      const expected = structuredClone(patch(before, f.patchId))
      expected.rasterSubLayers.splice(activeIndex, 1)
      expected.activeRasterSubLayerId =
        expected.rasterSubLayers[Math.min(activeIndex, expected.rasterSubLayers.length - 1)].id
      assert.deepEqual(patch(f.owner.document, f.patchId), expected)
      await f.service.save(f.tabId)
      const deleted = await readIgsPackage(f.owner.filePath)
      assert.deepEqual(patch(deleted.project, f.patchId), expected)
      assert.equal((await f.service.undo(f.tabId)).canUndo, false)
      assert.deepEqual(f.owner.document.layers, before.layers)
      // The caller PNGs no longer exist and the newest ZIP no longer owns this member.
      const retained = f.owner.getCurrentAssetSource(f.variants[activeIndex].value.asset)
      assert.ok(retained && 'sourcePath' in retained)
      assert.equal(
        (await readFile(retained.sourcePath)).equals(f.variants[activeIndex].bytes),
        true,
      )
      await f.service.save(f.tabId)
      await f.service.close(f.tabId)
      const reopened = await f.service.open(f.tabId)
      assert.equal(reopened.kind, 'opened')
      const restored = await readIgsPackage(f.owner.filePath)
      assert.deepEqual(patch(restored.project, f.patchId), patch(before, f.patchId))
      for (const variant of f.variants) {
        assert.equal(
          (await restored.readMember(variant.value.asset.path)).equals(variant.bytes),
          true,
        )
      }
    })
  })
}

test('inactive then final deletion preserve active identity, authoring, nonempty mask and the neighboring owner', async () => {
  await withVariants(async (f) => {
    const before = structuredClone(f.owner.document)
    for (const index of [1, 2, 0]) {
      await f.service.clearHistory(f.tabId)
      const preceding = structuredClone(f.owner.document)
      await f.service.updateSmartPatchVariant(f.tabId, f.patchId, {
        ...identity(preceding),
        kind: 'delete',
        variantId: f.variants[index].value.id,
      })
      const actual = patch(f.owner.document, f.patchId)
      const expected = structuredClone(patch(preceding, f.patchId))
      expected.rasterSubLayers = expected.rasterSubLayers.filter(
        ({ id }) => id !== f.variants[index].value.id,
      )
      expected.activeRasterSubLayerId = expected.rasterSubLayers.length
        ? f.variants[0].value.id
        : null
      assert.deepEqual(actual, expected)
      assert.deepEqual(f.owner.document.layers[1], before.layers[1])
      assert.deepEqual(f.owner.document.generationDraft, before.generationDraft)
      assert.equal((await f.service.undo(f.tabId)).canUndo, false)
      assert.deepEqual(f.owner.document.layers, preceding.layers)
      await f.service.redo(f.tabId)
    }
    await f.service.save(f.tabId)
    await f.service.close(f.tabId)
    const reopened = await f.service.open(f.tabId)
    assert.equal(reopened.kind, 'opened')
    const stored = await readIgsPackage(f.owner.filePath)
    const empty = patch(stored.project, f.patchId)
    assert.deepEqual(empty.rasterSubLayers, [])
    assert.equal(empty.activeRasterSubLayerId, null)
    assert.deepEqual(empty.mask, patch(before, f.patchId).mask)
    assert.equal((await stored.readMember(empty.mask.asset!.path)).equals(fixtureMaskPng()), true)
  })
})

test('locked refuses all mutations; hidden allows them, and invalid/stale/foreign owners leave the real document and history untouched', async () => {
  await withVariants(async (f) => {
    const variantId = f.variants[1].value.id
    const rejects = async (change: unknown, layerId = f.patchId) => {
      const before = structuredClone(f.owner.document)
      const canUndo = f.owner.canUndo
      await assert.rejects(
        f.service.updateSmartPatchVariant(
          f.tabId,
          layerId,
          change as ProjectSmartPatchVariantChange,
        ),
      )
      assert.deepEqual(f.owner.document, before)
      assert.equal(f.owner.canUndo, canUndo)
    }
    const base = {
      ...identity(f.owner.document),
      kind: 'rename' as const,
      name: 'Valid',
      variantId,
    }
    for (const change of [
      { ...base, documentId: randomUUID() },
      { ...base, documentRevision: randomUUID() },
      { ...base, variantId: randomUUID() },
      { ...base, name: '' },
      { ...base, name: ' \n\t ' },
      { ...base, name: 'é'.repeat(513) },
      { ...base, kind: 'delete', sourcePath: '/unowned/file.png' },
    ]) {
      await rejects(change)
    }
    await rejects(base, randomUUID())
    await f.service.updateSmartPatchLayer(f.tabId, f.patchId, { kind: 'lock', locked: true })
    await f.service.clearHistory(f.tabId)
    for (const change of [
      { kind: 'select' as const },
      { kind: 'rename' as const, name: 'Locked name' },
      { kind: 'delete' as const },
    ]) {
      await rejects({ ...identity(f.owner.document), ...change, variantId })
    }
    await f.service.updateSmartPatchLayer(f.tabId, f.patchId, { kind: 'lock', locked: false })
    await f.service.updateSmartPatchLayer(f.tabId, f.patchId, {
      kind: 'visibility',
      visible: false,
    })
    await f.service.clearHistory(f.tabId)
    await f.service.updateSmartPatchVariant(f.tabId, f.patchId, {
      ...identity(f.owner.document),
      kind: 'rename',
      name: 'é'.repeat(512),
      variantId,
    })
    assert.equal(patch(f.owner.document, f.patchId).rasterSubLayers[1].name, 'é'.repeat(512))
    await f.service.updateSmartPatchVariant(f.tabId, f.patchId, {
      ...identity(f.owner.document),
      kind: 'select',
      variantId,
    })
    assert.equal(patch(f.owner.document, f.patchId).activeRasterSubLayerId, variantId)
    await f.service.updateSmartPatchVariant(f.tabId, f.patchId, {
      ...identity(f.owner.document),
      kind: 'delete',
      variantId: f.variants[2].value.id,
    })
    assert.equal(patch(f.owner.document, f.patchId).visible, false)
  })
})

test(
  'a late command cannot commit across a real concurrent edit and retry uses fresh document identity',
  { timeout: 15_000 },
  async () => {
    await withVariants(async (f) => {
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
      const old = identity(f.owner.document)
      const variantId = f.variants[1].value.id
      const changing = f.service.updateSmartPatchVariant(f.tabId, f.patchId, {
        ...old,
        kind: 'rename',
        name: 'Late stale edit',
        variantId,
      })
      await Promise.race([
        started,
        changing.then(() => assert.fail('The controlled commit must enter before completion.')),
      ])
      try {
        await f.service.updateGenerationDraft(f.tabId, {
          kind: 'positive-prompt',
          text: 'Concurrent normal edit',
        })
      } finally {
        release()
      }
      await assert.rejects(changing, { code: 'EDIT_CONFLICT' })
      assert.equal(patch(f.owner.document, f.patchId).rasterSubLayers[1].name, 'Stored 2')
      assert.equal(f.owner.document.generationDraft.positivePrompt.text, 'Concurrent normal edit')
      assert.equal((await f.service.undo(f.tabId)).canUndo, false)
      await f.service.updateSmartPatchVariant(f.tabId, f.patchId, {
        ...identity(f.owner.document),
        kind: 'rename',
        name: 'Fresh edit',
        variantId,
      })
      assert.equal(patch(f.owner.document, f.patchId).rasterSubLayers[1].name, 'Fresh edit')
    })
  },
)

test('local service recovery restores a deleted selection and renamed inactive variant without implicitly saving', async () => {
  await withVariants(async (f) => {
    const saved = await readFile(f.owner.filePath)
    await f.service.updateSmartPatchVariant(f.tabId, f.patchId, {
      ...identity(f.owner.document),
      kind: 'select',
      variantId: f.variants[1].value.id,
    })
    await f.service.updateSmartPatchVariant(f.tabId, f.patchId, {
      ...identity(f.owner.document),
      kind: 'rename',
      name: 'Recovered alternate',
      variantId: f.variants[2].value.id,
    })
    await f.service.updateSmartPatchVariant(f.tabId, f.patchId, {
      ...identity(f.owner.document),
      kind: 'delete',
      variantId: f.variants[0].value.id,
    })
    await f.service.flushAutosave(f.tabId)
    const expected = structuredClone(f.owner.document)
    // Fresh service/lease owner simulates a new process; this does not claim a physical crash.
    const fresh = f.newService()
    const recovered = await fresh.resolveRecovery(f.tabId, 'recover')
    assert.equal(recovered.dirty, true)
    assert.deepEqual(fresh.getOpenDocumentForAcceptance(f.tabId)!.document.layers, expected.layers)
    assert.equal((await readFile(f.owner.filePath)).equals(saved), true)
    await fresh.save(f.tabId)
    const stored = await readIgsPackage(f.owner.filePath)
    assert.deepEqual(stored.project.layers, expected.layers)
    for (const variant of f.variants.slice(1)) {
      assert.equal((await stored.readMember(variant.value.asset.path)).equals(variant.bytes), true)
    }
    await fresh.close(f.tabId)
  })
})

// Boundary: revision-bound read-only service diagnostics. Mutation: equate missing worker to
// freshness, overlook known authored changes, mutate provenance or dirty the document on inspection.
test('missing-worker inspection is read-only, reports known changes separately, and rejects stale requested snapshots', async () => {
  await withVariants(async (f) => {
    const before = structuredClone(f.owner.document)
    const inspection = await f.service.getSmartPatchVariants(
      f.tabId,
      f.patchId,
      before.documentId,
      before.documentRevision,
    )
    assert.deepEqual(
      inspection.variants.map(({ changedInputs, id, sourceVerified, status }) => ({
        changedInputs,
        id,
        sourceVerified,
        status,
      })),
      f.variants.map(({ value }) => ({
        changedInputs: [],
        id: value.id,
        sourceVerified: false,
        status: 'unverified',
      })),
    )
    assert.equal(inspection.resourcesChecked, false)
    assert.equal(typeof inspection.sourceUnavailableReason, 'string')
    assert.deepEqual(f.owner.document, before)
    assert.equal(f.owner.dirty, false)
    assert.equal(f.owner.canUndo, false)
    inspection.variants[0].changedInputs.push('bbox')
    assert.deepEqual(f.owner.document, before, 'Returned diagnostics never alias stored metadata.')

    await f.service.updateSmartPatchLayer(f.tabId, f.patchId, {
      kind: 'bounding-box',
      rect: { ...patch(before, f.patchId).boundingBox, x: 15 },
    })
    const changed = structuredClone(f.owner.document)
    const outdated = await f.service.getSmartPatchVariants(
      f.tabId,
      f.patchId,
      changed.documentId,
      changed.documentRevision,
    )
    assert.deepEqual(
      outdated.variants.map(({ changedInputs, sourceVerified, status }) => ({
        changedInputs,
        sourceVerified,
        status,
      })),
      f.variants.map(() => ({
        changedInputs: ['bbox'],
        sourceVerified: false,
        status: 'outdated',
      })),
    )
    await assert.rejects(
      f.service.getSmartPatchVariants(
        f.tabId,
        f.patchId,
        before.documentId,
        before.documentRevision,
      ),
    )
    await assert.rejects(
      f.service.getSmartPatchVariants(f.tabId, f.patchId, randomUUID(), changed.documentRevision),
    )
    assert.deepEqual(f.owner.document, changed)
  })
})

/**
 * Controlled compositor output is the only fake: service capture, byte verification and revision
 * fencing remain real. This tests freshness/late replies, not actual CPU composition correctness.
 */
function sourceWorker(
  bytes: Buffer,
  beforeReply: () => Promise<void> = async () => undefined,
): Pick<ProjectWorkerClient, 'composeTarget'> {
  return {
    composeTarget: async (input) => {
      await beforeReply()
      await writeFile(input.targetPngPath, bytes)
      return {
        composite: {
          byteSize: bytes.length,
          colorSpace: 'srgb',
          height: 5,
          iccSha256: IGS_SRGB_ICC_SHA256,
          path: input.targetPngPath,
          sha256: digest(bytes),
          width: 7,
        },
        mode: 'img2img',
        rect: { ...input.bbox },
      }
    },
  }
}

test('verified source freshness is independent of catalog availability and controlled source contrast detects actual byte identity', async () => {
  await withVariants(async (f) => {
    const before = structuredClone(f.owner.document)
    const inspect = (bytes: Buffer) =>
      f.service.getSmartPatchVariants(
        f.tabId,
        f.patchId,
        before.documentId,
        before.documentRevision,
        sourceWorker(bytes),
        [],
      )
    const matching = await inspect(f.sourceBytes)
    assert.equal(matching.resourcesChecked, true)
    assert.ok(matching.resourceDiagnostics.some(({ code }) => code === 'RESOURCE_MISSING'))
    assert.equal(matching.sourceUnavailableReason, null)
    assert.deepEqual(
      matching.variants.map(({ changedInputs, sourceVerified, status }) => ({
        changedInputs,
        sourceVerified,
        status,
      })),
      f.variants.map(() => ({ changedInputs: [], sourceVerified: true, status: 'ready' })),
    )
    const different = literalSmartPatchColorPng(
      7,
      5,
      Array.from({ length: 35 }, () => [90, 8, 7, 255]).flat(),
      4,
    )
    const contrast = await inspect(different)
    assert.deepEqual(
      contrast.variants.map(({ changedInputs, sourceVerified, status }) => ({
        changedInputs,
        sourceVerified,
        status,
      })),
      f.variants.map(() => ({
        changedInputs: ['source-composite'],
        sourceVerified: true,
        status: 'outdated',
      })),
    )
    assert.deepEqual(f.owner.document, before)
    assert.equal(f.owner.dirty, false)
    assert.equal(f.owner.canUndo, false)
  })
})

test(
  'late source inspection refuses its captured revision after a concurrent normal edit without publishing stale diagnostics',
  { timeout: 15_000 },
  async () => {
    await withVariants(async (f) => {
      let entered!: () => void
      let release!: () => void
      let completed = false
      const started = new Promise<void>((resolve) => {
        entered = resolve
      })
      const hold = new Promise<void>((resolve) => {
        release = resolve
      })
      const before = structuredClone(f.owner.document)
      const reading = f.service.getSmartPatchVariants(
        f.tabId,
        f.patchId,
        before.documentId,
        before.documentRevision,
        sourceWorker(f.sourceBytes, async () => {
          entered()
          await hold
          completed = true
        }),
      )
      await Promise.race([
        started,
        reading.then(() => assert.fail('The controlled source callback must actually enter.')),
      ])
      let changed!: IgsProjectDocumentV1
      try {
        await f.service.updateGenerationDraft(f.tabId, {
          kind: 'positive-prompt',
          text: 'Changed during source inspection',
        })
        changed = structuredClone(f.owner.document)
      } finally {
        release()
      }
      await assert.rejects(reading, { code: 'EDIT_CONFLICT' })
      assert.equal(
        completed,
        true,
        'The controlled source reply actually crossed the delayed boundary.',
      )
      assert.deepEqual(f.owner.document, changed)
      assert.deepEqual(patch(f.owner.document, f.patchId), patch(before, f.patchId))
      assert.equal(
        (await f.service.undo(f.tabId)).canUndo,
        false,
        'The read added no history step.',
      )
      const control = await f.service.getSmartPatchVariants(
        f.tabId,
        f.patchId,
        f.owner.document.documentId,
        f.owner.document.documentRevision,
        sourceWorker(f.sourceBytes),
      )
      assert.ok(control.variants.every(({ status }) => status === 'ready'))
    })
  },
)

test('ordinary source failure yields explicit unverified diagnostics but an unconfirmed worker exit remains a refusal', async () => {
  await withVariants(async (f) => {
    const before = structuredClone(f.owner.document)
    const ordinary = await f.service.getSmartPatchVariants(
      f.tabId,
      f.patchId,
      before.documentId,
      before.documentRevision,
      {
        composeTarget: async () => {
          throw new Error('Controlled unavailable source')
        },
      },
    )
    assert.ok(
      ordinary.variants.every(
        ({ sourceVerified, status }) => status === 'unverified' && !sourceVerified,
      ),
    )
    assert.equal(typeof ordinary.sourceUnavailableReason, 'string')
    await assert.rejects(
      f.service.getSmartPatchVariants(
        f.tabId,
        f.patchId,
        before.documentId,
        before.documentRevision,
        {
          composeTarget: async () => {
            throw Object.assign(new Error('Controlled unconfirmed worker exit'), {
              code: 'WORKER_EXIT_UNCONFIRMED',
            })
          },
        },
      ),
      { code: 'WORKER_EXIT_UNCONFIRMED' },
    )
    assert.deepEqual(f.owner.document, before)
    assert.equal(f.owner.canUndo, false)
    assert.equal(f.owner.dirty, false)
  })
})

/** Independent 7x5 PNG byte decoder only, with literal expected RGBA below; no compositor oracle. */
function sourceRgba(png: Buffer): Buffer {
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  const compressed: Buffer[] = []
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset)
    const name = png.toString('ascii', offset + 4, offset + 8)
    const bytes = png.subarray(offset + 8, offset + 8 + length)
    if (name === 'IHDR') {
      assert.equal(bytes.readUInt32BE(0), 7)
      assert.equal(bytes.readUInt32BE(4), 5)
      assert.equal(bytes[8], 8)
      assert.equal(bytes[9], 6)
    }
    if (name === 'IDAT') {
      compressed.push(bytes)
    }
    offset += length + 12
  }
  const stride = 7 * 4
  const rows = inflateSync(Buffer.concat(compressed), { maxOutputLength: (stride + 1) * 5 })
  assert.equal(rows.length, (stride + 1) * 5)
  const rgba = Buffer.alloc(stride * 5)
  for (let row = 0; row < 5; row++) {
    const filter = rows[row * (stride + 1)]
    assert.ok(filter <= 4)
    for (let column = 0; column < stride; column++) {
      const at = row * stride + column
      const left = column >= 4 ? rgba[at - 4] : 0
      const up = row > 0 ? rgba[at - stride] : 0
      const upperLeft = row > 0 && column >= 4 ? rgba[at - stride - 4] : 0
      let predictor = 0
      if (filter === 1) {
        predictor = left
      }
      if (filter === 2) {
        predictor = up
      }
      if (filter === 3) {
        predictor = Math.floor((left + up) / 2)
      }
      if (filter === 4) {
        const estimate = left + up - upperLeft
        const a = Math.abs(estimate - left)
        const b = Math.abs(estimate - up)
        const c = Math.abs(estimate - upperLeft)
        predictor = a <= b && a <= c ? left : b <= c ? up : upperLeft
      }
      rgba[at] = (rows[row * (stride + 1) + column + 1] + predictor) & 255
    }
  }
  return rgba
}

// Boundary: real service -> captured below-target assets -> actual independent source CPU child ->
// verified PNG identity -> read-only freshness. Mutation: include the target/above stack, omit the
// lower source, classify absent source as ready, or key freshness only by authored fields/revision.
test(
  'actual CPU source inspection ignores target presentation and higher pixels but detects a changed lower Raster',
  { skip: !sourceRuntimeRoot(), timeout: 30_000 },
  async () => {
    await withVariants(async (f) => {
      const stagingBasePath = path.join(f.root, 'scratch')
      await mkdir(stagingBasePath, { recursive: true })
      const worker = await ProjectWorkerClient.start(
        { pythonExecutable: sourcePython, runtimeRoot: sourceRuntimeRoot()!, stagingBasePath },
        { environment: { CUDA_VISIBLE_DEVICES: '', LANG: 'C.UTF-8' }, requestTimeoutMs: 10_000 },
      )
      try {
        // Actual import and image normalization own these literal Raster preconditions.
        const lowerInput = path.join(f.root, 'literal-lower-source.png')
        const aboveInput = path.join(f.root, 'literal-above-source.png')
        await writeFile(lowerInput, f.sourceBytes)
        await writeFile(
          aboveInput,
          literalSmartPatchColorPng(
            7,
            5,
            Array.from({ length: 35 }, () => [221, 30, 100, 255]).flat(),
            4,
          ),
        )
        const lowerId = (await f.service.importRasterImage(f.tabId, lowerInput, worker)).layers[0]
          .id
        const aboveId = (await f.service.importRasterImage(f.tabId, aboveInput, worker)).layers[0]
          .id
        const setup = structuredClone(f.owner.document)
        const lower = setup.layers.find(({ id }) => id === lowerId)
        const above = setup.layers.find(({ id }) => id === aboveId)
        assert.ok(lower?.kind === 'raster' && above?.kind === 'raster')
        const target = patch(setup, f.patchId)
        lower.transform = { ...lower.transform, x: target.boundingBox.x, y: target.boundingBox.y }
        above.transform = { ...above.transform, x: target.boundingBox.x, y: target.boundingBox.y }
        setup.layers = [
          above,
          target,
          lower,
          ...setup.layers.filter(({ id }) => ![aboveId, f.patchId, lowerId].includes(id)),
        ]
        await f.owner.applyDocument(setup)
        await rm(lowerInput)
        await rm(aboveInput)
        const baseline = await f.service.withCapturedSmartPatchGenerationInput(
          f.tabId,
          f.patchId,
          async (capture) => await capture.composeSource(worker),
        )
        assert.equal(baseline.sourceAlpha, 'opaque')
        assert.deepEqual(
          sourceRgba(baseline.source.bytes),
          Buffer.from(Array.from({ length: 35 }, () => [9, 8, 7, 255]).flat()),
          'Whole actual source RGBA is the literal lower Raster; target and higher images are excluded.',
        )
        const declared = structuredClone(f.owner.document)
        for (const variant of patch(declared, f.patchId).rasterSubLayers) {
          Object.assign(variant.generationProvenance.layerSourceContext, {
            sourceDocumentRevision: declared.documentRevision,
            sourceLayerIds: [...baseline.context.sourceLayerIds],
            sourceTarget: {
              byteSize: baseline.source.byteSize,
              height: baseline.source.height,
              sha256: baseline.source.sha256,
              width: baseline.source.width,
            },
          })
        }
        // This is declared fixture setup before inspection, not a provenance editing command.
        await f.owner.applyDocument(declared)
        await f.service.save(f.tabId)
        await f.service.clearHistory(f.tabId)
        const frozen = structuredClone(
          patch(f.owner.document, f.patchId).rasterSubLayers.map(
            ({ generationProvenance }) => generationProvenance,
          ),
        )
        const inspect = async (status: 'outdated' | 'ready') => {
          const document = structuredClone(f.owner.document)
          const canUndo = f.owner.canUndo
          const dirty = f.owner.dirty
          const result = await f.service.getSmartPatchVariants(
            f.tabId,
            f.patchId,
            document.documentId,
            document.documentRevision,
            worker,
            [],
          )
          assert.equal(
            result.sourceUnavailableReason,
            null,
            'An actual source failure cannot pass as readiness.',
          )
          assert.deepEqual(
            result.variants.map(({ changedInputs, sourceVerified, status }) => ({
              changedInputs,
              sourceVerified,
              status,
            })),
            f.variants.map(() => ({
              changedInputs: status === 'ready' ? [] : ['source-composite'],
              sourceVerified: true,
              status,
            })),
          )
          assert.deepEqual(f.owner.document, document)
          assert.equal(f.owner.canUndo, canUndo)
          assert.equal(f.owner.dirty, dirty)
          assert.deepEqual(
            patch(f.owner.document, f.patchId).rasterSubLayers.map(
              ({ generationProvenance }) => generationProvenance,
            ),
            frozen,
          )
        }
        await inspect('ready')
        await f.service.updateSmartPatchVariant(f.tabId, f.patchId, {
          ...identity(f.owner.document),
          kind: 'select',
          variantId: f.variants[1].value.id,
        })
        await inspect('ready')
        await f.service.updateSmartPatchLayer(f.tabId, f.patchId, {
          kind: 'visibility',
          visible: false,
        })
        await inspect('ready')
        await f.service.updateSmartPatchLayer(f.tabId, f.patchId, { kind: 'lock', locked: true })
        await inspect('ready')
        await f.service.updateGenerationDraft(f.tabId, {
          kind: 'positive-prompt',
          text: 'Unrelated normal source inspection control',
        })
        await inspect('ready')
        await f.service.updateRasterLayer(f.tabId, aboveId, { kind: 'opacity', opacity: 0.5 })
        await inspect('ready')
        await f.service.updateRasterLayer(f.tabId, lowerId, { kind: 'visibility', visible: false })
        const empty = await f.service.withCapturedSmartPatchGenerationInput(
          f.tabId,
          f.patchId,
          async (capture) => await capture.composeSource(worker),
        )
        assert.equal(empty.sourceAlpha, 'transparent')
        assert.deepEqual(sourceRgba(empty.source.bytes), Buffer.alloc(35 * 4))
        await inspect('outdated')
        await f.service.undo(f.tabId)
        await inspect('ready')
      } finally {
        // close() resolves only after the production client's observed physical child exit;
        // cleanup of the service/temp assets happens outside this callback, after this barrier.
        await worker.close()
      }
    })
  },
)
