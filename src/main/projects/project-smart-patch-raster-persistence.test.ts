import { isAcceptedResultHistoryPage } from '../../shared/projects/accepted-result-history.js'
import { isProjectAcceptedResultView } from '../../shared/projects/project-accepted-results.js'
import {
  type IgsRasterLayerV1,
  isSmartPatchRasterLayer,
  parseProjectDocumentV1,
} from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { openAppDatabase } from '../db/database.js'
import { readIgsPackage, saveIgsPackage } from './igs-package.js'
import { ProjectAutosaveLeaseRegistry } from './project-autosave.js'
import { ProjectIndexRepository } from './project-index.js'
import { readProjectPlaceholders } from './project-placeholders.js'
import { ProjectService } from './project-service.js'
import { ProjectShadowStore } from './project-shadow.js'
import { literalSmartPatchColorPng } from './test-fixtures/smart-patch-input-material.js'
import { smartPatchVariantMetadataFixture } from './test-fixtures/smart-patch-variant.js'

const digest = (bytes: Buffer | Uint8Array) => createHash('sha256').update(bytes).digest('hex')
type Family = 'anima' | 'illustrious'
type Mode = 'img2img' | 'inpaint' | 'outpaint' | 'txt2img'

/** Declared accepted-layer setup; these checks qualify portable/storage consumers, not Add. */
function literalRaster(family: Family, mode: Mode, width = 7, height = 5) {
  const variant = smartPatchVariantMetadataFixture(family)
  const alpha = Uint8Array.from({ length: width * height }, (_, i) => [0, 64, 128, 192, 255][i % 5])
  const png = literalSmartPatchColorPng(
    width,
    height,
    Array.from(alpha, (a) => [23, 47, 91, a]).flat(),
    4,
  )
  const provenance = variant.generationProvenance
  Reflect.set(provenance.generationConfiguration, 'mode', mode)
  if (mode === 'txt2img') {
    Reflect.deleteProperty(provenance.generationConfiguration.sampling, 'denoisingStrength')
    provenance.layerSourceContext.preparedInputs.modelSource = null
  }
  const source = provenance.layerSourceContext
  Object.assign(source.bbox, { height, width })
  Object.assign(source.sourceTarget, { height, width })
  Object.assign(source.preparedInputs.finalContributionMask, { height, width })
  Object.assign(provenance.executionResultContext.output, {
    byteSize: png.length,
    height,
    sha256: digest(png),
    width,
  })
  Object.assign(provenance.executionResultContext.output.contributionAlpha8, {
    byteSize: alpha.length,
    height,
    sha256: digest(alpha),
    width,
  })
  const layer: IgsRasterLayerV1 = {
    asset: { ...variant.asset, bytes: png.length, height, sha256: digest(png), width },
    blendMode: 'normal',
    generationProvenance: provenance,
    id: variant.id,
    kind: 'raster',
    locked: false,
    name: 'Recovered Smart contribution',
    opacity: 1,
    transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: source.bbox.x, y: source.bbox.y },
    visible: true,
  }
  return { layer, png }
}

async function withProject(
  run: (f: {
    owner: NonNullable<ReturnType<ProjectService['getOpenDocumentForAcceptance']>>
    root: string
    service: ProjectService
    shadow: ProjectShadowStore
    tabId: string
  }) => Promise<void>,
) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-smart-raster-persistence-'))
  const database = openAppDatabase(root, path.resolve('src/main/db/migrations'))
  const shadow = new ProjectShadowStore(path.join(root, 'autosave'))
  const service = new ProjectService({
    autosaveOptions: { debounceMs: 60_000, leaseRegistry: new ProjectAutosaveLeaseRegistry() },
    dataRoot: root,
    repository: new ProjectIndexRepository(database.db),
    roots: {
      placeholdersDir: path.resolve('src/main/projects/placeholders'),
      scratchDir: path.join(root, 'scratch'),
    },
    shadow,
  })
  try {
    const tab = await service.create({ height: 64, title: 'Converted Smart storage', width: 64 })
    const owner = service.getOpenDocumentForAcceptance(tab.id)!
    await service.clearHistory(tab.id)
    await run({ owner, root, service, shadow, tabId: tab.id })
  } finally {
    for (const tab of service.getOpenTabs()) {
      await service.discardAndClose(tab.id)
    }
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
}

for (const family of ['illustrious', 'anima'] as const) {
  for (const mode of ['txt2img', 'img2img', 'inpaint', 'outpaint'] as const) {
    test(`${family} converted ${mode} Raster retains exact 7×5 world pixels and Smart lineage through history, shadow and Save/reopen`, async () => {
      await withProject(async ({ owner, service, shadow, tabId }) => {
        const { layer, png } = literalRaster(family, mode)
        const original = await readFile(owner.filePath)
        const before = structuredClone(owner.document)
        await owner.applyDocument(
          { ...before, layers: [layer] },
          { [layer.asset.path]: { bytes: png } },
          { expectedDocumentRevision: before.documentRevision },
        )
        const accepted = structuredClone(owner.document)
        assert.equal(isSmartPatchRasterLayer(accepted.layers[0]), true)
        assert.deepEqual(accepted.layers[0], layer)
        assert.deepEqual(accepted.generationDraft, before.generationDraft)
        assert.deepEqual(accepted.primaryBbox, before.primaryBbox)
        assert.ok((await readFile(owner.filePath)).equals(original), 'Adoption must not Save.')
        const tab = service.getOpenTabs()[0]
        assert.equal(tab.acceptedResults.length, 1)
        assert.equal(isProjectAcceptedResultView(tab.acceptedResults[0]), true)
        assert.equal(
          tab.layers[0].kind === 'smart-patch'
            ? undefined
            : tab.layers[0].resultComparisonSourceKind,
          'smart-patch',
        )
        assert.equal(
          tab.layers[0].kind === 'smart-patch'
            ? undefined
            : tab.layers[0].generationSettingsUnavailableReason,
          undefined,
        )
        await assert.rejects(service.getRasterGenerationData(tabId, before.documentId, layer.id), {
          code: 'PROJECT_COMPARISON_UNSUPPORTED',
        })
        const comparison = await service.getSmartResultComparisonData(tabId, {
          assetSha256: layer.asset.sha256,
          documentId: tab.documentId,
          documentRevision: tab.documentRevision,
          owner: { kind: 'raster', layerId: layer.id },
        })
        assert.deepEqual(
          comparison.generationConfiguration,
          layer.generationProvenance?.generationConfiguration,
        )
        assert.equal(Object.hasOwn(comparison.generationConfiguration, 'size'), false)
        assert.equal(comparison.currentMode, null)
        assert.deepEqual(owner.document, accepted, 'Compare must not mutate the adopted Raster.')
        await service.undo(tabId)
        assert.equal(owner.document.layers.length, 0)
        assert.equal(owner.canUndo, false, 'Setup adoption should be one history entry.')
        await service.redo(tabId)
        assert.deepEqual(owner.document.layers[0], layer)
        assert.equal(owner.canRedo, false)
        const commit = await owner.flush()
        assert.equal(commit?.directorySynced, true)
        const recovered = await shadow.inspect({
          projectPath: owner.filePath,
          savedPackage: await readIgsPackage(owner.filePath),
        })
        assert.equal(recovered.status, 'recoverable')
        if (recovered.status !== 'recoverable') {
          assert.fail('The actual shadow must recover the accepted Raster.')
        }
        assert.deepEqual(recovered.document.layers[0], layer)
        await service.save(tabId)
        const archive = await readIgsPackage(owner.filePath)
        assert.deepEqual(archive.project.layers[0], layer)
        assert.ok(
          (await archive.readMember(layer.asset.path)).equals(png),
          'Save must preserve every PNG byte.',
        )
        const history = await service.getAcceptedResultHistory()
        assert.equal(history.items.length, 1)
        assert.equal(isAcceptedResultHistoryPage(history), true)
        assert.equal(history.items[0].width, 7)
        assert.equal(history.items[0].height, 5)
        assert.equal(history.items[0].layerId, layer.id)
        await service.discardAndClose(tabId)
        const reopened = await service.open(tabId)
        assert.equal(reopened.kind, 'opened')
        assert.deepEqual(service.getOpenDocumentForAcceptance(tabId)?.document.layers[0], layer)
      })
    })
  }
}

test('a one-pixel converted Raster remains visible in Project and saved history without ordinary generation Size', async () => {
  await withProject(async ({ owner, service, tabId }) => {
    const { layer, png } = literalRaster('anima', 'inpaint', 1, 1)
    await owner.applyDocument(
      { ...owner.document, layers: [layer] },
      { [layer.asset.path]: { bytes: png } },
    )
    assert.equal(isProjectAcceptedResultView(service.getOpenTabs()[0].acceptedResults[0]), true)
    await service.save(tabId)
    const history = await service.getAcceptedResultHistory()
    assert.equal(isAcceptedResultHistoryPage(history), true)
    assert.equal(history.items[0].width, 1)
    assert.equal(history.items[0].height, 1)
    assert.deepEqual((await readIgsPackage(owner.filePath)).project.layers[0], layer)
  })
})

test('metadata-only alpha tampering on a converted Raster is refused before adoption and leaves its valid neighbor unchanged', async () => {
  await withProject(async ({ owner }) => {
    const { layer, png } = literalRaster('illustrious', 'inpaint')
    await owner.applyDocument(
      { ...owner.document, layers: [layer] },
      { [layer.asset.path]: { bytes: png } },
    )
    const valid = structuredClone(owner.document)
    const changed = structuredClone(valid)
    const converted = changed.layers[0]
    assert.ok(isSmartPatchRasterLayer(converted))
    converted.generationProvenance.executionResultContext.output.contributionAlpha8.sha256 =
      '0'.repeat(64)
    await assert.rejects(owner.applyDocument(changed), /alpha|Smart Patch/i)
    assert.deepEqual(owner.document, valid)
    await owner.applyDocument({ ...valid, layers: [{ ...layer, name: 'Ordinary Raster rename' }] })
    assert.equal(owner.document.layers[0].name, 'Ordinary Raster rename')
  })
})

test('portable Smart Raster rejects crossed output asset identities but permits later ordinary transforms without rewriting source bbox', async () => {
  await withProject(async ({ owner, root }) => {
    const { layer, png } = literalRaster('anima', 'outpaint')
    const proposal = { ...owner.document, layers: [layer] }
    for (const key of ['bytes', 'width', 'height', 'sha256'] as const) {
      const changed = structuredClone(proposal)
      Reflect.set(
        changed.layers[0].asset,
        key,
        key === 'sha256' ? '0'.repeat(64) : changed.layers[0].asset[key] + 1,
      )
      assert.throws(() => parseProjectDocumentV1(changed), { code: 'INVALID_PROJECT' })
    }
    const transformed = structuredClone(proposal)
    transformed.layers[0].transform = {
      rotationDegrees: 13,
      scaleX: 2,
      scaleY: 0.5,
      x: 500,
      y: -300,
    }
    assert.deepEqual(parseProjectDocumentV1(transformed).layers, transformed.layers)
    const invalidAlpha = structuredClone(proposal)
    const raster = invalidAlpha.layers[0]
    assert.ok(isSmartPatchRasterLayer(raster))
    raster.generationProvenance.executionResultContext.output.contributionAlpha8.sha256 =
      '0'.repeat(64)
    const placeholders = await readProjectPlaceholders(
      path.resolve('src/main/projects/placeholders'),
      'unavailable',
    )
    await assert.rejects(
      saveIgsPackage(path.join(root, 'invalid.igs'), {
        assets: { [layer.asset.path]: { bytes: png } },
        preview: { ...placeholders, rect: proposal.primaryBbox, status: 'unavailable' },
        project: invalidAlpha,
      }),
      /alpha|Smart Patch/i,
    )
  })
})
