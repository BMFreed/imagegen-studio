import type {
  IgsProjectDocumentV1,
  IgsSmartPatchLayerV1,
} from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { readIgsPackage } from './igs-package.js'
import { ProjectAutosaveCoordinator, ProjectAutosaveLeaseRegistry } from './project-autosave.js'
import { localProjectRecoveryKey } from './project-identity.js'
import { withProjectPathLock } from './project-path-lock.js'
import { ProjectSession } from './project-session.js'
import { ProjectShadowStore } from './project-shadow.js'
import { literalSmartPatchColorPng } from './test-fixtures/smart-patch-input-material.js'
import { smartPatchVariantMetadataFixture } from './test-fixtures/smart-patch-variant.js'

const digest = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

/** Declared adoption precondition only: it does not stand in for the future public Add command. */
function storedPatch(document: IgsProjectDocumentV1) {
  const id = randomUUID()
  const variants = ['illustrious', 'anima'].map((family, index) => {
    const value = smartPatchVariantMetadataFixture(family as 'anima' | 'illustrious')
    const alpha = Uint8Array.from({ length: 35 }, (_, i) => ((i + index) % 2 ? 255 : 64))
    const bytes = literalSmartPatchColorPng(
      7,
      5,
      Array.from(alpha, (a) => [20 + index * 100, 80, 140, a]).flat(),
      4,
    )
    value.asset.bytes = bytes.length
    value.asset.sha256 = digest(bytes)
    value.generationProvenance.layerSourceContext.layerId = id
    value.generationProvenance.layerSourceContext.sourceDocumentId = document.documentId
    Object.assign(value.generationProvenance.executionResultContext.output, {
      byteSize: bytes.length,
      contributionAlpha8: { byteSize: 35, height: 5, sha256: digest(alpha), width: 7 },
      sha256: digest(bytes),
    })
    return { bytes, value }
  })
  const patch: IgsSmartPatchLayerV1 = {
    activeRasterSubLayerId: variants[1].value.id,
    blendMode: 'normal',
    boundingBox: { height: 512, width: 512, x: 100, y: 200 },
    generationDraft: structuredClone(document.generationDraft),
    id,
    internalResolution: { height: 1024, width: 1024 },
    kind: 'smart-patch',
    locked: false,
    mask: { asset: null, id: randomUUID(), revision: 0 },
    name: 'Stored Patch',
    opacity: 1,
    rasterSubLayers: variants.map(({ value }) => value),
    visible: true,
  }
  return { document: { ...document, layers: [patch] }, patch, variants }
}

async function withStorage(
  run: (f: {
    projectPath: string
    root: string
    roots: { placeholdersDir: string; scratchDir: string }
    shadow: ProjectShadowStore
    shadowRoot: string
  }) => Promise<void>,
) {
  const root = await mkdtemp(path.join(tmpdir(), 'igs-patch-variant-storage-'))
  const roots = {
    placeholdersDir: path.resolve('src/main/projects/placeholders'),
    scratchDir: path.join(root, 'scratch'),
  }
  const shadowRoot = path.join(root, 'shadow')
  const shadow = new ProjectShadowStore(shadowRoot)
  try {
    const session = await ProjectSession.create(
      path.join(root, 'Project.igs'),
      'Saved empty',
      roots,
    )
    await run({ projectPath: session.filePath, root, roots, shadow, shadowRoot })
  } finally {
    await rm(root, { force: true, recursive: true })
  }
}

// Real coordinator, shadow, package writer/loader and filesystem. Mutation: enumerate active assets
// only. Controls: Undo to empty, source caller files removed, history retained across two Saves.
test('all variant bytes survive one-step Undo/Redo, explicit Save, history retention and portable reopen', async () => {
  await withStorage(async (f) => {
    const coordinator = await ProjectAutosaveCoordinator.open(f.projectPath, f.roots, f.shadow, {
      debounceMs: 0,
    })
    const input = storedPatch(coordinator.document)
    const original = await readFile(f.projectPath)
    const sources: Record<string, { sourcePath: string }> = {}
    for (const [index, variant] of input.variants.entries()) {
      const sourcePath = path.join(f.root, `caller-${index}.png`)
      await writeFile(sourcePath, variant.bytes)
      sources[variant.value.asset.path] = { sourcePath }
    }
    await coordinator.applyDocument(input.document, sources)
    for (const { sourcePath } of Object.values(sources)) {
      await rm(sourcePath)
    }
    await coordinator.flush()
    assert.equal((await readFile(f.projectPath)).equals(original), true)
    assert.equal(
      (await ProjectAutosaveCoordinator.inspectRecovery(f.projectPath, f.shadow)).status,
      'recoverable',
    )
    await coordinator.undo()
    assert.equal(coordinator.document.layers.length, 0)
    assert.equal(coordinator.canUndo, false, 'The whole declared variant batch is one edit.')
    await coordinator.redo()
    assert.deepEqual(
      (coordinator.document.layers[0] as IgsSmartPatchLayerV1).rasterSubLayers.map((v) => v.id),
      input.patch.rasterSubLayers.map((v) => v.id),
    )
    await coordinator.save()
    const first = await readIgsPackage(f.projectPath)
    assert.equal(first.manifest.preview.status, 'unavailable')
    for (const variant of input.variants) {
      assert.equal((await first.readMember(variant.value.asset.path)).equals(variant.bytes), true)
    }

    await coordinator.applyDocument({ ...coordinator.document, layers: [] })
    await coordinator.save()
    assert.equal((await readIgsPackage(f.projectPath)).project.layers.length, 0)
    await coordinator.undo()
    for (const variant of input.variants) {
      const retained = coordinator.getCurrentAssetSource(variant.value.asset)
      assert.ok(
        retained && 'sourcePath' in retained,
        'Undo after Save must own the old image file.',
      )
      assert.equal((await readFile(retained.sourcePath)).equals(variant.bytes), true)
    }
    await coordinator.save()
    await coordinator.clearHistory()
    await coordinator.close()
    const portablePath = path.join(f.root, 'copy', 'Portable.igs')
    await mkdir(path.dirname(portablePath))
    await copyFile(f.projectPath, portablePath)
    const portable = await readIgsPackage(portablePath)
    for (const variant of input.variants) {
      assert.equal(
        (await portable.readMember(variant.value.asset.path)).equals(variant.bytes),
        true,
      )
    }
    assert.deepEqual(
      await readdir(f.roots.scratchDir),
      [],
      'No historical image files remain after clean close.',
    )
  })
})

// Simulated new process uses a fresh lease registry; no public Add or physical process crash is claimed.
test('local recovery restores active and inactive variants without implicitly saving either', async () => {
  await withStorage(async (f) => {
    const first = await ProjectAutosaveCoordinator.open(f.projectPath, f.roots, f.shadow, {
      debounceMs: 0,
    })
    const input = storedPatch(first.document)
    const saved = await readFile(f.projectPath)
    await first.applyDocument(
      input.document,
      Object.fromEntries(input.variants.map((v) => [v.value.asset.path, { bytes: v.bytes }])),
    )
    await first.flush()
    const recovered = await ProjectAutosaveCoordinator.recover(
      f.projectPath,
      f.roots,
      new ProjectShadowStore(f.shadowRoot),
      { leaseRegistry: new ProjectAutosaveLeaseRegistry() },
    )
    assert.equal(recovered.dirty, true)
    const patch = recovered.document.layers[0] as IgsSmartPatchLayerV1
    assert.deepEqual(patch.rasterSubLayers, input.patch.rasterSubLayers)
    assert.equal(patch.activeRasterSubLayerId, input.patch.activeRasterSubLayerId)
    assert.equal((await readFile(f.projectPath)).equals(saved), true)
    for (const variant of input.variants) {
      const source = recovered.getCurrentAssetSource(variant.value.asset)
      assert.ok(source && 'sourcePath' in source)
      assert.equal((await readFile(source.sourcePath)).equals(variant.bytes), true)
    }
    await recovered.save()
    await recovered.close()
    assert.equal((await readIgsPackage(f.projectPath)).project.layers.length, 1)
  })
})

test('removing a newly stored Patch during Save stays durable across its image commit', async () => {
  await withStorage(async (f) => {
    const coordinator = await ProjectAutosaveCoordinator.open(f.projectPath, f.roots, f.shadow, {
      debounceMs: 0,
    })
    const input = storedPatch(coordinator.document)
    await coordinator.applyDocument(
      input.document,
      Object.fromEntries(input.variants.map((v) => [v.value.asset.path, { bytes: v.bytes }])),
    )
    let unlock!: () => void
    let entered!: () => void
    const locked = new Promise<void>((resolve) => {
      entered = resolve
    })
    const release = new Promise<void>((resolve) => {
      unlock = resolve
    })
    const blocker = withProjectPathLock(f.projectPath, async () => {
      entered()
      await release
    })
    await locked
    const saving = coordinator.save()
    let editFailure: unknown
    try {
      await coordinator.applyDocument({ ...coordinator.document, layers: [] })
      await coordinator.flush()
      // Independent signal: flush published later empty B while writer A is held at its file lock.
      assert.equal((await readIgsPackage(f.projectPath)).project.layers.length, 0)
      const before = await ProjectAutosaveCoordinator.inspectRecovery(f.projectPath, f.shadow)
      assert.equal(
        before.status,
        'clean',
        'The later empty document still equals the old saved base.',
      )
      const manifest = JSON.parse(
        await readFile(
          path.join(f.shadowRoot, localProjectRecoveryKey(f.projectPath), 'manifest.json'),
          'utf8',
        ),
      )
      assert.equal(
        manifest.state,
        'dirty',
        'The later document remains durably recorded for the pending Save.',
      )
      assert.equal(manifest.documentRevision, coordinator.document.documentRevision)
      assert.equal(typeof manifest.committingDocument.documentRevision, 'string')
    } catch (error) {
      editFailure = error
    } finally {
      unlock()
    }
    await blocker
    const outcome = await saving
    assert.equal(
      editFailure === undefined,
      true,
      'The later shadow must not require images owned only by the pending Save.',
    )
    assert.equal(outcome.recovery.status, 'dirty')
    const saved = await readIgsPackage(f.projectPath)
    assert.equal(saved.project.layers.length, 1)
    for (const variant of input.variants) {
      assert.equal((await saved.readMember(variant.value.asset.path)).equals(variant.bytes), true)
    }
    const after = await ProjectAutosaveCoordinator.inspectRecovery(f.projectPath, f.shadow)
    assert.equal(after.status, 'recoverable')
    if (after.status === 'recoverable') {
      assert.equal(after.document.layers.length, 0)
    }
    await coordinator.save()
    await coordinator.close()
  })
})

test('new inactive false alpha is rejected by real coordinator and shadow write before publication', async () => {
  await withStorage(async (f) => {
    const coordinator = await ProjectAutosaveCoordinator.open(f.projectPath, f.roots, f.shadow, {
      debounceMs: 0,
    })
    const input = storedPatch(coordinator.document)
    input.patch.rasterSubLayers[0].generationProvenance.executionResultContext.output.contributionAlpha8.sha256 =
      '0'.repeat(64)
    const assets = Object.fromEntries(
      input.variants.map((v) => [v.value.asset.path, { bytes: v.bytes }]),
    )
    await assert.rejects(coordinator.applyDocument(input.document, assets), /alpha differs/)
    assert.equal(coordinator.document.layers.length, 0)
    assert.equal(coordinator.canUndo, false)
    await assert.rejects(
      f.shadow.write({
        dirtyAssets: assets,
        document: { ...input.document, documentRevision: randomUUID() },
        projectPath: f.projectPath,
        savedDocument: coordinator.document,
      }),
      { code: 'SHADOW_ASSET_MISMATCH' },
    )
    assert.equal(
      (await ProjectAutosaveCoordinator.inspectRecovery(f.projectPath, f.shadow)).status,
      'absent',
    )
    await coordinator.close()
  })
})

test('changing only an existing variant alpha claim cannot reuse a trusted image proof', async () => {
  await withStorage(async (f) => {
    const coordinator = await ProjectAutosaveCoordinator.open(f.projectPath, f.roots, f.shadow, {
      debounceMs: 0,
    })
    const input = storedPatch(coordinator.document)
    await coordinator.applyDocument(
      input.document,
      Object.fromEntries(input.variants.map((v) => [v.value.asset.path, { bytes: v.bytes }])),
    )
    await coordinator.save()
    const before = coordinator.document
    const forged = structuredClone(before)
    ;(
      forged.layers[0] as IgsSmartPatchLayerV1
    ).rasterSubLayers[0].generationProvenance.executionResultContext.output.contributionAlpha8.sha256 =
      '0'.repeat(64)
    await assert.rejects(coordinator.applyDocument(forged), /alpha differs/)
    assert.deepEqual(coordinator.document, before)
    await assert.rejects(
      f.shadow.write({
        document: { ...forged, documentRevision: randomUUID() },
        projectPath: f.projectPath,
        savedDocument: before,
      }),
      { code: 'SHADOW_ASSET_MISMATCH' },
    )
    await coordinator.close()
  })
})

test('recovery refuses a truthfully rehashed inactive PNG with alpha differing from its provenance', async () => {
  await withStorage(async (f) => {
    const coordinator = await ProjectAutosaveCoordinator.open(f.projectPath, f.roots, f.shadow, {
      debounceMs: 0,
    })
    const input = storedPatch(coordinator.document)
    await coordinator.applyDocument(
      input.document,
      Object.fromEntries(input.variants.map((v) => [v.value.asset.path, { bytes: v.bytes }])),
    )
    await coordinator.flush()
    const directory = path.join(f.shadowRoot, localProjectRecoveryKey(f.projectPath))
    const manifestPath = path.join(directory, 'manifest.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    const snapshot = path.join(directory, 'snapshots', manifest.snapshotId)
    const documentPath = path.join(snapshot, 'project.json')
    const document = JSON.parse(await readFile(documentPath, 'utf8')) as IgsProjectDocumentV1
    const variant = (document.layers[0] as IgsSmartPatchLayerV1).rasterSubLayers[0]
    const changed = literalSmartPatchColorPng(
      7,
      5,
      Array.from({ length: 35 }, () => [20, 80, 140, 255]).flat(),
      4,
    )
    variant.asset.bytes = changed.length
    variant.asset.sha256 = digest(changed)
    variant.generationProvenance.executionResultContext.output.byteSize = changed.length
    variant.generationProvenance.executionResultContext.output.sha256 = digest(changed)
    await writeFile(path.join(snapshot, variant.asset.path), changed)
    const record = manifest.dirtyAssets.find((a: { path: string }) => a.path === variant.asset.path)
    Object.assign(record, { bytes: changed.length, sha256: digest(changed) })
    const serialized = Buffer.from(JSON.stringify(document))
    manifest.documentHash = digest(serialized)
    await writeFile(documentPath, serialized)
    await writeFile(manifestPath, JSON.stringify(manifest))
    assert.deepEqual(await ProjectAutosaveCoordinator.inspectRecovery(f.projectPath, f.shadow), {
      reason: 'ASSET_MISMATCH',
      status: 'invalid',
    })
  })
})
