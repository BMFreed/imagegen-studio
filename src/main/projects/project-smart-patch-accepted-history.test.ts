import { isAcceptedResultHistoryPage } from '../../shared/projects/accepted-result-history.js'
import type { AcceptedResultHistoryReference } from '../../shared/projects/accepted-result-history.js'
import { isProjectAcceptedResultView } from '../../shared/projects/project-accepted-results.js'
import {
  type IgsProjectDocumentV1,
  type IgsSmartPatchLayerV1,
  type IgsSmartPatchVariantV1,
  parseProjectDocumentV1,
} from '../../shared/projects/project-schema.js'

import { sql } from 'kysely'
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { copyFile, mkdtemp, readFile, rename, rm, symlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { openAppDatabase } from '../db/database.js'
import {
  acceptedHistoryImageUrl,
  parseAcceptedHistoryImageUrl,
  readSavedAcceptedResultImage,
  reviewSavedAcceptedResult,
} from './accepted-history-resource.js'
import { readIgsPackage } from './igs-package.js'
import { projectAcceptedResults } from './project-accepted-results.js'
import { ProjectAutosaveLeaseRegistry } from './project-autosave.js'
import { localProjectRecoveryKey } from './project-identity.js'
import { ProjectIndexRepository, UNCATEGORIZED_WORKSPACE_ID } from './project-index.js'
import {
  parseProjectLayerImageUrl,
  streamSavedProjectLayer,
  streamStagedProjectLayer,
} from './project-layer-resource.js'
import { ProjectService } from './project-service.js'
import { ProjectShadowStore } from './project-shadow.js'
import { literalSmartPatchColorPng } from './test-fixtures/smart-patch-input-material.js'
import { smartPatchVariantMetadataFixture } from './test-fixtures/smart-patch-variant.js'

type Family = 'anima' | 'illustrious'
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

/** Literal accepted-image preconditions; no inference, Queue or public Add is substituted. */
function storedVariants(family: Family, width = 7, height = 5) {
  const alpha = Uint8Array.from({ length: width * height }, (_, i) => [0, 64, 128, 255][i % 4])
  const pixels = [23, 117].map((red) =>
    literalSmartPatchColorPng(width, height, Array.from(alpha, (a) => [red, 47, 91, a]).flat(), 4),
  )
  const variants = [0, 0, 1].map((pixelIndex, index) => {
    const value = smartPatchVariantMetadataFixture(family)
    const bytes = pixels[pixelIndex]
    value.name = `Stored variant ${index + 1}`
    Object.assign(value.asset, { bytes: bytes.length, height, sha256: digest(bytes), width })
    Object.assign(value.bbox, { height, width })
    const provenance = value.generationProvenance
    const source = provenance.layerSourceContext
    Object.assign(source.bbox, { height, width })
    Object.assign(source.sourceTarget, { height, width })
    Object.assign(source.preparedInputs.finalContributionMask, { height, width })
    Object.assign(provenance.executionResultContext.output, {
      byteSize: bytes.length,
      contributionAlpha8: { byteSize: alpha.length, height, sha256: digest(alpha), width },
      height,
      sha256: digest(bytes),
      width,
    })
    provenance.generationConfiguration.sampling.actualSeed = index === 2 ? 0xff_ff_ff_ff : 0
    return { bytes, value }
  })
  // Distinct accepted owners can preserve the same candidate and exact provenance/pixels.
  variants[1].value.generationProvenance = structuredClone(variants[0].value.generationProvenance)
  return variants
}

function patch(document: IgsProjectDocumentV1, id: string): IgsSmartPatchLayerV1 {
  const layer = document.layers.find((entry) => entry.id === id)
  assert.ok(layer?.kind === 'smart-patch')
  return layer
}

function reference(row: {
  assetSha256: string
  documentId: string
  documentRevision: string
  layerId: string
  localProjectKey: string
}): AcceptedResultHistoryReference {
  return {
    assetSha256: row.assetSha256,
    documentId: row.documentId,
    documentRevision: row.documentRevision,
    layerId: row.layerId,
    projectKey: row.localProjectKey,
  }
}

async function withProject(
  family: Family,
  run: (f: {
    database: ReturnType<typeof openAppDatabase>
    emptyPatchId: string
    importedId: string
    owner: NonNullable<ReturnType<ProjectService['getOpenDocumentForAcceptance']>>
    patchId: string
    repository: ProjectIndexRepository
    root: string
    service: ProjectService
    shadow: ProjectShadowStore
    tabId: string
    variants: { bytes: Buffer; value: IgsSmartPatchVariantV1 }[]
  }) => Promise<void>,
  width = 7,
  height = 5,
) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-smart-accepted-history-'))
  const database = openAppDatabase(root, path.resolve('src/main/db/migrations'))
  const repository = new ProjectIndexRepository(database.db)
  const shadow = new ProjectShadowStore(path.join(root, 'autosave'))
  const service = new ProjectService({
    autosaveOptions: { debounceMs: 60_000, leaseRegistry: new ProjectAutosaveLeaseRegistry() },
    dataRoot: root,
    repository,
    roots: {
      placeholdersDir: path.resolve('src/main/projects/placeholders'),
      scratchDir: path.join(root, 'scratch'),
    },
    shadow,
  })
  try {
    const tab = await service.create({ height: 256, title: 'Stored variant history', width: 256 })
    const owner = service.getOpenDocumentForAcceptance(tab.id)!
    await service.clearHistory(tab.id)
    const variants = storedVariants(family, width, height)
    const patchId = randomUUID()
    const emptyPatchId = randomUUID()
    const importedId = randomUUID()
    const layer: IgsSmartPatchLayerV1 = {
      activeRasterSubLayerId: variants[0].value.id,
      blendMode: 'normal',
      boundingBox: { height: 256, width: 256, x: 500, y: -500 },
      generationDraft: {
        ...owner.document.generationDraft,
        positivePrompt: {
          embeddingRefs: [],
          text: 'Later authored prompt, not the recorded result',
        },
        seed: { policy: 'fixed', value: 913 },
      },
      id: patchId,
      internalResolution: { height: 256, width: 256 },
      kind: 'smart-patch',
      locked: true,
      mask: { asset: null, id: randomUUID(), revision: 0 },
      name: 'Current parent unrelated to historical source identity',
      opacity: 0.4,
      rasterSubLayers: variants.map(({ value }) => value),
      visible: false,
    }
    const imported = {
      asset: { ...variants[0].value.asset, path: `assets/layers/${importedId}.png` },
      blendMode: 'normal' as const,
      id: importedId,
      kind: 'raster' as const,
      locked: false,
      name: 'Imported pixels without accepted provenance',
      opacity: 1,
      transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 0, y: 0 },
      visible: true,
    }
    const document = parseProjectDocumentV1({
      ...owner.document,
      layers: [
        layer,
        {
          ...layer,
          activeRasterSubLayerId: null,
          id: emptyPatchId,
          mask: { asset: null, id: randomUUID(), revision: 0 },
          name: 'Empty neighboring Patch',
          rasterSubLayers: [],
        },
        imported,
      ],
    })
    await owner.applyDocument(document, {
      ...Object.fromEntries(variants.map(({ bytes, value }) => [value.asset.path, { bytes }])),
      [imported.asset.path]: { bytes: variants[0].bytes },
    })
    await run({
      database,
      emptyPatchId,
      importedId,
      owner,
      patchId,
      repository,
      root,
      service,
      shadow,
      tabId: tab.id,
      variants,
    })
  } finally {
    for (const tab of service.getOpenTabs()) {
      await service.discardAndClose(tab.id)
    }
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
}

for (const family of ['illustrious', 'anima'] as const) {
  // Real entry point: service tab projection plus coordinator-owned current asset resolution.
  // Mutations: active-only enumeration, candidate/hash dedup, live seed/bbox, or a mutating read.
  test(`${family} current history projects every inactive hidden/locked variant by immutable raster identity`, async () => {
    await withProject(family, async (f) => {
      const before = structuredClone(f.owner.document)
      const beforeState = [f.owner.dirty, f.owner.canUndo, f.owner.canRedo]
      const savedBytes = await readFile(f.owner.filePath)
      const results = f.service.getOpenTabs()[0].acceptedResults
      assert.deepEqual(
        results.map((result) => result.layerId),
        f.variants.map(({ value }) => value.id).sort(),
      )
      assert.equal(
        results.some(({ layerId }) => [f.emptyPatchId, f.importedId, f.patchId].includes(layerId)),
        false,
      )
      for (const { bytes, value } of f.variants) {
        const result = results.find(({ layerId }) => layerId === value.id)!
        assert.equal(isProjectAcceptedResultView(result), true)
        assert.equal(result.layerName, value.name)
        assert.equal(
          result.seed,
          value.generationProvenance.generationConfiguration.sampling.actualSeed,
        )
        assert.equal(result.width, 7)
        assert.equal(result.height, 5)
        assert.equal(result.modelName, 'Frozen checkpoint')
        assert.equal(result.modelVersionName, 'exact version')
        assert.equal(result.modelFileSha256, 'a'.repeat(64))
        const request = parseProjectLayerImageUrl(result.imageUrl)
        assert.ok(request)
        assert.equal(request.layerId, value.id)
        const asset = f.service.getLayerAsset(request)
        assert.ok(asset?.kind === 'staged')
        assert.deepEqual(asset.member, value.asset)
        const response = await streamStagedProjectLayer(
          asset.source,
          asset.member,
          path.join(f.root, 'scratch'),
        )
        assert.equal(response.status, 200)
        assert.ok(
          Buffer.from(await response.arrayBuffer()).equals(bytes),
          'The exact inactive image must be served.',
        )
      }
      assert.deepEqual(f.owner.document, before)
      assert.deepEqual([f.owner.dirty, f.owner.canUndo, f.owner.canRedo], beforeState)
      assert.ok((await readFile(f.owner.filePath)).equals(savedBytes), 'History must not Save.')
      assert.equal((await f.service.getAcceptedResultHistory()).totalCount, 0)
      await f.service.undo(f.tabId)
      assert.deepEqual(f.service.getOpenTabs()[0].acceptedResults, [])
      await f.service.redo(f.tabId)
      assert.deepEqual(
        f.service.getOpenTabs()[0].acceptedResults.map(({ layerId }) => layerId),
        results.map(({ layerId }) => layerId),
      )
      await f.owner.flush()
      const recovered = await f.shadow.inspect({
        projectPath: f.owner.filePath,
        savedPackage: await readIgsPackage(f.owner.filePath),
      })
      assert.ok(recovered.status === 'recoverable')
      assert.deepEqual(
        projectAcceptedResults(f.tabId, recovered.document),
        f.service.getOpenTabs()[0].acceptedResults,
      )
      await f.service.clearHistory(f.tabId)
      assert.equal(f.service.getOpenTabs()[0].acceptedResults.length, 3)
      assert.equal((await f.service.getAcceptedResultHistory()).totalCount, 0)
    })
  })

  // Real writer/loader/index and saved resource; dirty working assets never replace saved pixels.
  test(`${family} saved history streams exact inactive variants and survives portable reopen independently of current edits`, async () => {
    await withProject(family, async (f) => {
      const saved = await f.service.save(f.tabId)
      assert.equal(saved.indexWarning, undefined)
      const page = await f.service.getAcceptedResultHistory()
      assert.equal(isAcceptedResultHistoryPage(page), true)
      assert.equal(page.totalCount, 3)
      const before = structuredClone(f.owner.document)
      const beforeState = [f.owner.dirty, f.owner.canUndo, f.owner.canRedo]
      const savedBytes = await readFile(f.owner.filePath)
      for (const { bytes, value } of f.variants) {
        const row = await f.repository.getSavedAcceptedResult(f.tabId, value.id)
        assert.ok(row)
        assert.equal(row.layerName, value.name)
        assert.equal(row.outputWidth, 7)
        assert.equal(row.outputHeight, 5)
        assert.equal(
          row.actualSeed,
          value.generationProvenance.generationConfiguration.sampling.actualSeed,
        )
        const request = reference(row)
        assert.equal(await f.service.reviewAcceptedResult(request), true)
        const entry = page.items.find(({ layerId }) => layerId === value.id)!
        assert.deepEqual(parseAcceptedHistoryImageUrl(entry.imageUrl!), request)
        const response = await readSavedAcceptedResultImage(
          request,
          f.repository,
          path.join(f.root, 'scratch'),
        )
        assert.equal(response.status, 200)
        assert.ok(
          Buffer.from(await response.arrayBuffer()).equals(bytes),
          'Saved preview must retain exact PNG bytes.',
        )
        const current = f.service.getLayerAsset(
          parseProjectLayerImageUrl(
            f.service.getOpenTabs()[0].acceptedResults.find(({ layerId }) => layerId === value.id)!
              .imageUrl,
          )!,
        )
        assert.ok(current?.kind === 'saved')
        const currentResponse = await streamSavedProjectLayer(
          current.filePath,
          current.member,
          path.join(f.root, 'scratch'),
        )
        assert.ok(Buffer.from(await currentResponse.arrayBuffer()).equals(bytes))
      }
      assert.deepEqual(f.owner.document, before)
      assert.deepEqual([f.owner.dirty, f.owner.canUndo, f.owner.canRedo], beforeState)
      assert.ok((await readFile(f.owner.filePath)).equals(savedBytes))
      const inactive = f.variants[1]
      const inactiveRow = (await f.repository.getSavedAcceptedResult(f.tabId, inactive.value.id))!
      const removed = structuredClone(f.owner.document)
      patch(removed, f.patchId).rasterSubLayers = patch(removed, f.patchId).rasterSubLayers.filter(
        ({ id }) => id !== inactive.value.id,
      )
      await f.owner.applyDocument(removed)
      assert.equal(
        f.service
          .getOpenTabs()[0]
          .acceptedResults.some(({ layerId }) => layerId === inactive.value.id),
        false,
      )
      await f.repository.scanWorkspace(UNCATEGORIZED_WORKSPACE_ID)
      assert.deepEqual(await f.service.getAcceptedResultHistory(), page)
      const stillSaved = await readSavedAcceptedResultImage(
        reference(inactiveRow),
        f.repository,
        path.join(f.root, 'scratch'),
      )
      assert.equal(stillSaved.status, 200)
      assert.ok(Buffer.from(await stillSaved.arrayBuffer()).equals(inactive.bytes))
      await f.service.discardAndClose(f.tabId)
      assert.equal((await f.service.open(f.tabId)).kind, 'opened')
      assert.deepEqual(
        f.service.getOpenTabs()[0].acceptedResults.map(({ layerId }) => layerId),
        page.items.map(({ layerId }) => layerId),
      )
      const reopened = await readIgsPackage(f.owner.filePath)
      for (const { bytes, value } of f.variants) {
        assert.deepEqual(
          patch(reopened.project, f.patchId).rasterSubLayers.find(({ id }) => id === value.id),
          value,
        )
        assert.ok((await reopened.readMember(value.asset.path)).equals(bytes))
      }
    })
  })
}

test('nested history preserves 1px world output and maximum-length variant names without parent-name duplication', async () => {
  await withProject(
    'anima',
    async (f) => {
      const document = structuredClone(f.owner.document)
      const owner = patch(document, f.patchId)
      owner.name = 'P'.repeat(1024)
      owner.rasterSubLayers[1].name = 'V'.repeat(1024)
      await f.owner.applyDocument(document)
      await f.service.save(f.tabId)
      const local = f.service.getOpenTabs()[0].acceptedResults
      const saved = await f.service.getAcceptedResultHistory()
      assert.equal(isAcceptedResultHistoryPage(saved), true)
      assert.ok(local.every(isProjectAcceptedResultView))
      assert.ok(local.every(({ height, width }) => width === 1 && height === 1))
      assert.equal(
        local.find(({ layerId }) => layerId === f.variants[1].value.id)?.layerName,
        'V'.repeat(1024),
      )
      assert.equal(
        saved.items.find(({ layerId }) => layerId === f.variants[1].value.id)?.layerName,
        'V'.repeat(1024),
      )
    },
    1,
    1,
  )
})

test('nested saved history changes only on Save, keeps UUIDs through rename/delete and rebuilds copied tied pages', async () => {
  await withProject('illustrious', async (f) => {
    await f.service.save(f.tabId)
    const original = await f.repository.listSavedAcceptedResults(f.tabId)
    const document = structuredClone(f.owner.document)
    const target = patch(document, f.patchId)
    const renamed = target.rasterSubLayers[1]
    const provenance = structuredClone(renamed.generationProvenance)
    renamed.name = 'Renamed inactive result'
    target.name = 'Renamed parent, not result display metadata'
    await f.owner.applyDocument(document)
    await f.repository.scanWorkspace(UNCATEGORIZED_WORKSPACE_ID)
    assert.deepEqual(await f.repository.listSavedAcceptedResults(f.tabId), original)
    assert.equal(
      f.service.getOpenTabs()[0].acceptedResults.find(({ layerId }) => layerId === renamed.id)
        ?.layerName,
      renamed.name,
    )
    await f.service.save(f.tabId)
    const renamedRow = await f.repository.getSavedAcceptedResult(f.tabId, renamed.id)
    assert.ok(renamedRow)
    assert.equal(renamedRow.layerName, renamed.name)
    assert.deepEqual(
      patch(f.owner.document, f.patchId).rasterSubLayers[1].generationProvenance,
      provenance,
    )
    assert.equal(
      await f.service.reviewAcceptedResult(
        reference(original.find(({ layerId }) => layerId === renamed.id)!),
      ),
      false,
    )
    const deleted = structuredClone(f.owner.document)
    patch(deleted, f.patchId).rasterSubLayers = patch(deleted, f.patchId).rasterSubLayers.filter(
      ({ id }) => id !== renamed.id,
    )
    await f.owner.applyDocument(deleted)
    assert.ok(await f.repository.getSavedAcceptedResult(f.tabId, renamed.id))
    await f.service.save(f.tabId)
    assert.equal(await f.repository.getSavedAcceptedResult(f.tabId, renamed.id), null)

    const expanded = structuredClone(f.owner.document)
    const source = patch(expanded, f.patchId).rasterSubLayers[0]
    const variants = Array.from({ length: 57 }, (_, i) => {
      const id = randomUUID()
      return {
        ...structuredClone(source),
        asset: { ...source.asset, path: `assets/layers/${id}.png` },
        id,
        name: `Tied variant ${i}`,
      }
    })
    patch(expanded, f.patchId).rasterSubLayers = variants
    patch(expanded, f.patchId).activeRasterSubLayerId = variants[0].id
    await f.owner.applyDocument(
      expanded,
      Object.fromEntries(
        variants.map((value) => [value.asset.path, { bytes: f.variants[0].bytes }]),
      ),
    )
    await f.service.save(f.tabId)
    const copyPath = path.join(path.dirname(f.owner.filePath), 'Copied variant history.igs')
    await copyFile(f.owner.filePath, copyPath)
    await f.repository.scanWorkspace(UNCATEGORIZED_WORKSPACE_ID)
    const copyKey = localProjectRecoveryKey(copyPath)
    assert.notEqual(copyKey, f.tabId)
    const expected = [
      ...(await f.repository.listSavedAcceptedResults(f.tabId)),
      ...(await f.repository.listSavedAcceptedResults(copyKey)),
    ].sort(
      (a, b) =>
        a.localProjectKey.localeCompare(b.localProjectKey) || a.layerId.localeCompare(b.layerId),
    )
    const actual = []
    let page = await f.repository.listSavedAcceptedResultsPage()
    const sizes = []
    for (let pageIndex = 0; pageIndex < 3; pageIndex += 1) {
      assert.equal(page.totalCount, 114)
      sizes.push(page.items.length)
      actual.push(...page.items)
      if (!page.nextCursor) {
        break
      }
      assert.ok(pageIndex < 2, 'The tied catalog must terminate after exactly three pages.')
      page = await f.repository.listSavedAcceptedResultsPage(page.nextCursor)
    }
    assert.deepEqual(sizes, [50, 50, 14])
    assert.deepEqual(actual, expected)
    assert.equal(
      new Set(actual.map(({ layerId, localProjectKey }) => `${localProjectKey}:${layerId}`)).size,
      114,
    )
    const savedBytes = await readFile(f.owner.filePath)
    await f.database.db.deleteFrom('project_accepted_result_index').execute()
    await f.repository.scanWorkspace(UNCATEGORIZED_WORKSPACE_ID)
    assert.equal((await f.repository.listSavedAcceptedResultsPage()).totalCount, 114)
    assert.ok(
      (await readFile(f.owner.filePath)).equals(savedBytes),
      'Rebuilding the index cannot modify the portable source.',
    )
    const secondary = openAppDatabase(f.root, path.resolve('src/main/db/migrations'))
    try {
      assert.deepEqual(
        await new ProjectIndexRepository(secondary.db).listSavedAcceptedResults(copyKey),
        expected.filter(({ localProjectKey }) => localProjectKey === copyKey),
      )
    } finally {
      await secondary.close()
    }
  })
})

test('nested saved-resource verification binds every indexed field to the exact package variant and rejects tampering/stale paths', async () => {
  await withProject('anima', async (f) => {
    await f.service.save(f.tabId)
    const variant = f.variants[1].value
    const row = (await f.repository.getSavedAcceptedResult(f.tabId, variant.id))!
    const request = reference(row)
    const url = acceptedHistoryImageUrl(request)
    assert.deepEqual(parseAcceptedHistoryImageUrl(url), request)
    for (const changed of [
      { ...request, layerId: f.patchId },
      { ...request, layerId: f.emptyPatchId },
      { ...request, documentId: randomUUID() },
      { ...request, documentRevision: randomUUID() },
      { ...request, assetSha256: '0'.repeat(64) },
      { ...request, projectKey: `project-v1-${'f'.repeat(64)}` },
    ]) {
      assert.equal(await reviewSavedAcceptedResult(changed, f.repository), null)
      assert.equal(
        (await readSavedAcceptedResultImage(changed, f.repository, path.join(f.root, 'scratch')))
          .status,
        404,
      )
    }
    for (const changed of [
      url.replace(variant.id, f.patchId),
      url.replace(request.documentRevision, randomUUID()),
      url.replace(request.assetSha256, '0'.repeat(64)),
      `${url}?path=/etc/passwd`,
    ]) {
      assert.equal(parseAcceptedHistoryImageUrl(changed), null)
    }
    for (const changed of [
      { asset_path: f.variants[2].value.asset.path },
      { asset_bytes: 1 },
      { asset_width: 6 },
      { asset_height: 4 },
      { actual_seed: 99 },
      { output_width: 8 },
      { output_height: 6 },
      { accepted_at: '2026-10-15T10:02:00.000Z' },
      { layer_name: 'Different variant metadata' },
      { model_file_sha256: 'f'.repeat(64) },
      { model_name: 'Current model substituted for recorded model' },
      { model_version_name: 'Different version' },
    ]) {
      await f.database.db
        .updateTable('project_accepted_result_index')
        .set(changed)
        .where('local_project_key', '=', f.tabId)
        .where('layer_id', '=', variant.id)
        .execute()
      assert.equal(await reviewSavedAcceptedResult(request, f.repository), null)
      assert.equal(
        (await readSavedAcceptedResultImage(request, f.repository, path.join(f.root, 'scratch')))
          .status,
        404,
      )
      await f.repository.indexSaved(f.owner.filePath, UNCATEGORIZED_WORKSPACE_ID)
      assert.ok(await reviewSavedAcceptedResult(request, f.repository))
    }
    const replacement = path.join(f.root, 'replacement.igs')
    await copyFile(f.owner.filePath, replacement)
    await rename(replacement, f.owner.filePath)
    assert.equal(await reviewSavedAcceptedResult(request, f.repository), null)
    await f.repository.indexSaved(f.owner.filePath, UNCATEGORIZED_WORKSPACE_ID)
    assert.ok(await reviewSavedAcceptedResult(request, f.repository))
    const moved = path.join(f.root, 'moved.igs')
    await rename(f.owner.filePath, moved)
    await symlink(moved, f.owner.filePath)
    assert.equal(await reviewSavedAcceptedResult(request, f.repository), null)
    assert.equal(
      (await readSavedAcceptedResultImage(request, f.repository, path.join(f.root, 'scratch')))
        .status,
      404,
    )
    await rm(f.owner.filePath)
    await rename(moved, f.owner.filePath)
  })
})

test('a late nested-result insertion failure preserves the previous complete index while real Save commits and Refresh repairs', async () => {
  await withProject('illustrious', async (f) => {
    await f.service.save(f.tabId)
    const beforeParent = await f.repository.getProject(f.tabId)
    const beforeRows = await f.repository.listSavedAcceptedResults(f.tabId)
    const document = structuredClone(f.owner.document)
    const source = patch(document, f.patchId).rasterSubLayers[0]
    const variants = Array.from({ length: 101 }, (_, i) => {
      const id = randomUUID()
      return {
        ...structuredClone(source),
        asset: { ...source.asset, path: `assets/layers/${id}.png` },
        id,
        name: `Atomic variant ${i}`,
      }
    })
    patch(document, f.patchId).rasterSubLayers = variants
    patch(document, f.patchId).activeRasterSubLayerId = variants[0].id
    await f.owner.applyDocument(
      document,
      Object.fromEntries(
        variants.map((value) => [value.asset.path, { bytes: f.variants[0].bytes }]),
      ),
    )
    await sql
      .raw(
        `CREATE TRIGGER reject_nested_history_insert BEFORE INSERT ON project_accepted_result_index
      WHEN NEW.layer_id = '${variants[100].id}'
      BEGIN SELECT RAISE(ABORT, 'injected nested history failure'); END`,
      )
      .execute(f.database.db)
    try {
      const saved = await f.service.save(f.tabId)
      assert.equal(saved.committed, true)
      assert.match(saved.indexWarning ?? '', /saved.*indexes could not be updated/)
      assert.deepEqual(await f.repository.getProject(f.tabId), beforeParent)
      assert.deepEqual(await f.repository.listSavedAcceptedResults(f.tabId), beforeRows)
      assert.equal(
        patch((await readIgsPackage(f.owner.filePath)).project, f.patchId).rasterSubLayers.length,
        101,
      )
      assert.equal(await reviewSavedAcceptedResult(reference(beforeRows[0]), f.repository), null)
    } finally {
      await sql`DROP TRIGGER reject_nested_history_insert`.execute(f.database.db)
    }
    await f.repository.scanWorkspace(UNCATEGORIZED_WORKSPACE_ID)
    const repaired = await f.repository.listSavedAcceptedResults(f.tabId)
    assert.deepEqual(
      repaired.map(({ layerId }) => layerId),
      variants.map(({ id }) => id).sort(),
    )
    assert.ok(
      repaired.every(
        ({ documentRevision }) => documentRevision === f.owner.document.documentRevision,
      ),
    )
    assert.equal((await f.repository.listSavedAcceptedResultsPage()).totalCount, 101)
  })
})
