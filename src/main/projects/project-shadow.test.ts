import type { IgsProjectDocumentV1 } from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { type IgsAssetSource, readIgsPackage, saveIgsPackage } from './igs-package.js'
import { readProjectPlaceholders } from './project-placeholders.js'
import { ProjectSession } from './project-session.js'
import { ProjectShadowStore } from './project-shadow.js'

const placeholdersDir = path.resolve('src/main/projects/placeholders')
const raster = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGO06bnDwMDAxMDAwMDAAAATOgGonVuaBAAAAABJRU5ErkJggg==',
  'base64',
)
const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')

async function withProject(
  run: (context: {
    autosaveRoot: string
    directory: string
    projectPath: string
    savedDocument: IgsProjectDocumentV1
    session: ProjectSession
    store: ProjectShadowStore
  }) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'igs-shadow-'))
  try {
    const projectPath = path.join(directory, 'project.igs')
    const session = await ProjectSession.create(projectPath, 'Saved', {
      placeholdersDir,
      scratchDir: path.join(directory, 'scratch'),
    })
    const autosaveRoot = path.join(directory, 'app-data', 'autosave')
    await run({
      autosaveRoot,
      directory,
      projectPath: session.filePath,
      savedDocument: session.document,
      session,
      store: new ProjectShadowStore(autosaveRoot),
    })
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
}

function edit(savedDocument: IgsProjectDocumentV1, title: string): IgsProjectDocumentV1 {
  return {
    ...savedDocument,
    documentRevision: randomUUID(),
    title,
  }
}

function rasterLayer(id: string): IgsProjectDocumentV1['layers'][number] {
  return {
    asset: {
      bytes: raster.length,
      height: 2,
      path: `assets/layers/${id}.png`,
      sha256: sha256(raster),
      width: 2,
    },
    blendMode: 'normal',
    id,
    kind: 'raster',
    locked: false,
    name: 'Raster',
    opacity: 1,
    transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 0, y: 0 },
    visible: true,
  }
}

test('a new shadow-store instance recovers dirty data from disk without changing the saved package', async () => {
  await withProject(async ({ autosaveRoot, projectPath, savedDocument, session, store }) => {
    const originalPackage = await readFile(projectPath)
    session.applyDocument({ ...session.document, title: 'Recovered title' })
    const document = session.document
    const committed = await store.write({ document, projectPath, savedDocument })
    assert.equal(committed.documentRevision, document.documentRevision)
    assert.equal(committed.baseDocumentRevision, savedDocument.documentRevision)
    assert.equal(committed.directorySynced, true)
    assert.deepEqual(await readFile(projectPath), originalPackage)

    const restarted = new ProjectShadowStore(autosaveRoot)
    const inspection = await restarted.inspect({
      projectPath,
      savedPackage: await readIgsPackage(projectPath),
    })
    assert.equal(inspection.status, 'recoverable')
    if (inspection.status !== 'recoverable') {
      return
    }
    assert.deepEqual(inspection.document, document)
    assert.deepEqual(inspection.dirtyAssets, {})
    assert.equal((await readIgsPackage(projectPath)).project.title, 'Saved')

    assert.deepEqual(await restarted.markClean(projectPath, document.documentRevision), {
      cleaned: false,
      directorySynced: true,
    })
    assert.equal(
      (
        await restarted.inspect({
          projectPath,
          savedPackage: await readIgsPackage(projectPath),
        })
      ).status,
      'recoverable',
    )
    await session.save()
    assert.deepEqual(
      await restarted.inspect({ projectPath, savedPackage: await readIgsPackage(projectPath) }),
      { status: 'clean' },
    )
    assert.deepEqual(await restarted.markClean(projectPath, document.documentRevision), {
      cleaned: true,
      directorySynced: true,
    })
    assert.deepEqual(
      await restarted.inspect({
        projectPath,
        savedPackage: await readIgsPackage(projectPath),
      }),
      { status: 'clean' },
    )
    assert.equal((await readIgsPackage(projectPath)).project.title, 'Recovered title')
  })
})

test('a Save-only seed snapshot can replace the base hash without hiding a later edit', async () => {
  await withProject(async ({ projectPath, savedDocument, store }) => {
    const committingDocument = { ...savedDocument, lastActualSeedSnapshot: 73 }
    const laterEdit = edit(savedDocument, 'Later edit')
    await assert.rejects(
      store.write({
        committingDocument: { ...committingDocument, title: 'Not metadata' },
        document: laterEdit,
        projectPath,
        savedDocument,
      }),
      { code: 'SHADOW_INVALID_REQUEST' },
    )
    await store.write({ committingDocument, document: laterEdit, projectPath, savedDocument })
    const placeholders = await readProjectPlaceholders(placeholdersDir, 'empty')
    await saveIgsPackage(projectPath, {
      preview: { ...placeholders, rect: null, status: 'empty' },
      project: committingDocument,
    })
    const inspection = await store.inspect({
      projectPath,
      savedPackage: await readIgsPackage(projectPath),
    })
    assert.equal(inspection.status, 'recoverable')
    if (inspection.status === 'recoverable') {
      assert.equal(inspection.document.title, 'Later edit')
    }
  })
})

test('same-named copies in separate workspaces retain independent document recovery', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'igs-shadow-workspaces-'))
  try {
    const firstWorkspace = path.join(directory, 'first')
    const secondWorkspace = path.join(directory, 'second')
    await mkdir(firstWorkspace)
    await mkdir(secondWorkspace)
    const firstPath = path.join(firstWorkspace, 'Portrait.igs')
    const secondPath = path.join(secondWorkspace, 'Portrait.igs')
    await ProjectSession.create(firstPath, 'Saved', {
      placeholdersDir,
      scratchDir: path.join(directory, 'scratch'),
    })
    await copyFile(firstPath, secondPath)

    const firstSaved = await readIgsPackage(firstPath)
    const secondSaved = await readIgsPackage(secondPath)
    assert.equal(firstSaved.project.documentId, secondSaved.project.documentId)
    const firstEdit = edit(firstSaved.project, 'First workspace edit')
    const secondEdit = edit(secondSaved.project, 'Second workspace edit')
    const autosaveRoot = path.join(directory, 'app-data', 'autosave')
    const store = new ProjectShadowStore(autosaveRoot)
    await store.write({
      document: firstEdit,
      projectPath: firstPath,
      savedDocument: firstSaved.project,
    })
    await store.write({
      document: secondEdit,
      projectPath: secondPath,
      savedDocument: secondSaved.project,
    })
    const reopened = new ProjectShadowStore(autosaveRoot)
    const firstRecovery = await reopened.inspect({
      projectPath: firstPath,
      savedPackage: firstSaved,
    })
    const secondRecovery = await reopened.inspect({
      projectPath: secondPath,
      savedPackage: secondSaved,
    })
    assert.equal(firstRecovery.status, 'recoverable')
    assert.equal(secondRecovery.status, 'recoverable')
    if (firstRecovery.status === 'recoverable' && secondRecovery.status === 'recoverable') {
      assert.equal(firstRecovery.document.title, 'First workspace edit')
      assert.equal(secondRecovery.document.title, 'Second workspace edit')
    }
    assert.equal((await readIgsPackage(firstPath)).project.title, 'Saved')
    assert.equal((await readIgsPackage(secondPath)).project.title, 'Saved')
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
})

test('new raster bytes are staged only when referenced and are checked on recovery', async () => {
  await withProject(async ({ autosaveRoot, directory, projectPath, savedDocument, store }) => {
    const id = randomUUID()
    const assetPath = `assets/layers/${id}.png`
    const sourcePath = path.join(directory, 'immutable-raster.png')
    const originalIcc = Buffer.alloc(128)
    originalIcc.writeUInt32BE(originalIcc.length, 0)
    originalIcc.write('acsp', 36, 'ascii')
    const profilePath = `assets/profiles/${sha256(originalIcc)}.icc`
    await writeFile(sourcePath, raster)
    const document: IgsProjectDocumentV1 = {
      ...edit(savedDocument, 'Imported layer'),
      layers: [
        {
          asset: {
            bytes: raster.length,
            height: 2,
            path: assetPath,
            sha256: sha256(raster),
            width: 2,
          },
          blendMode: 'normal',
          id,
          kind: 'raster',
          locked: false,
          name: 'Raster',
          opacity: 1,
          sourceIccProfile: {
            bytes: originalIcc.length,
            path: profilePath,
            sha256: sha256(originalIcc),
          },
          transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 0, y: 0 },
          visible: true,
        },
      ],
    }
    await store.write({
      dirtyAssets: { [assetPath]: { sourcePath }, [profilePath]: { bytes: originalIcc } },
      document,
      projectPath,
      savedDocument,
    })
    const restarted = new ProjectShadowStore(autosaveRoot)
    const savedPackage = await readIgsPackage(projectPath)
    const recovered = await restarted.inspect({ projectPath, savedPackage })
    assert.equal(recovered.status, 'recoverable')
    if (recovered.status !== 'recoverable') {
      return
    }
    assert.deepEqual(Object.keys(recovered.dirtyAssets), [assetPath, profilePath])
    const stagedPath = recovered.dirtyAssets[assetPath]
    assert.ok(stagedPath && 'sourcePath' in stagedPath)
    assert.notEqual(stagedPath.sourcePath, sourcePath)
    assert.deepEqual(await readFile(stagedPath.sourcePath), raster)
    const stagedProfile = recovered.dirtyAssets[profilePath]
    assert.ok(stagedProfile && 'sourcePath' in stagedProfile)
    assert.deepEqual(await readFile(stagedProfile.sourcePath), originalIcc)
    assert.equal(savedPackage.project.layers.length, 0)

    await writeFile(stagedPath.sourcePath, Buffer.from('corrupted'))
    assert.deepEqual(await restarted.inspect({ projectPath, savedPackage }), {
      reason: 'ASSET_MISMATCH',
      status: 'invalid',
    })
    await rm(stagedPath.sourcePath)
    assert.deepEqual(await restarted.inspect({ projectPath, savedPackage }), {
      reason: 'ASSET_MISSING',
      status: 'invalid',
    })
  })
})

test('an unchanged saved raster is not duplicated in a document-only shadow', async () => {
  await withProject(async ({ autosaveRoot, projectPath, session, store }) => {
    const id = randomUUID()
    const assetPath = `assets/layers/${id}.png`
    session.applyDocument({
      ...session.document,
      layers: [
        {
          asset: {
            bytes: raster.length,
            height: 2,
            path: assetPath,
            sha256: sha256(raster),
            width: 2,
          },
          blendMode: 'normal',
          id,
          kind: 'raster',
          locked: false,
          name: 'Saved raster',
          opacity: 1,
          transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 0, y: 0 },
          visible: true,
        },
      ],
    })
    await session.save({ assets: { [assetPath]: { bytes: raster } } })
    const savedDocument = session.document
    const document = edit(savedDocument, 'Title changed, raster unchanged')
    const commit = await store.write({ document, projectPath, savedDocument })
    const snapshotRoot = path.join(autosaveRoot, commit.localRecoveryKey, 'snapshots')
    const [snapshotId] = await readdir(snapshotRoot)
    assert.deepEqual(await readdir(path.join(snapshotRoot, snapshotId)), ['project.json'])
    const result = await new ProjectShadowStore(autosaveRoot).inspect({
      projectPath,
      savedPackage: await readIgsPackage(projectPath),
    })
    assert.equal(result.status, 'recoverable')
    if (result.status === 'recoverable') {
      assert.deepEqual(result.dirtyAssets, {})
      assert.equal(result.document.layers[0]?.asset.path, assetPath)
    }
  })
})

test('an interrupted second snapshot leaves the previous committed recovery available', async () => {
  await withProject(async ({ autosaveRoot, projectPath, savedDocument, store }) => {
    const first = edit(savedDocument, 'First edit')
    const second = edit(savedDocument, 'Second edit')
    const firstCommit = await store.write({ document: first, projectPath, savedDocument })
    const manifestPath = path.join(autosaveRoot, firstCommit.localRecoveryKey, 'manifest.json')
    const committedManifest = await readFile(manifestPath)
    await assert.rejects(
      store.write(
        { document: second, projectPath, savedDocument },
        {
          beforeManifestCommit: async () => {
            throw new Error('simulated process interruption')
          },
        },
      ),
      /simulated process interruption/,
    )
    assert.deepEqual(await readFile(manifestPath), committedManifest)
    const recovered = await new ProjectShadowStore(autosaveRoot).inspect({
      projectPath,
      savedPackage: await readIgsPackage(projectPath),
    })
    assert.equal(recovered.status, 'recoverable')
    if (recovered.status === 'recoverable') {
      assert.equal(recovered.document.title, 'First edit')
    }
  })
})

test('stale saved base and unsupported or malformed manifests are diagnosed', async () => {
  await withProject(async ({ autosaveRoot, projectPath, savedDocument, store }) => {
    const document = edit(savedDocument, 'Shadow title')
    const written = await store.write({ document, projectPath, savedDocument })
    const manifestPath = path.join(autosaveRoot, written.localRecoveryKey, 'manifest.json')
    const session = await ProjectSession.open(projectPath, {
      placeholdersDir,
      scratchDir: path.join(path.dirname(projectPath), 'scratch'),
    })
    session.applyDocument({ ...session.document, title: 'Saved later' })
    await session.save()
    const savedPackage = await readIgsPackage(projectPath)
    assert.deepEqual(await store.inspect({ projectPath, savedPackage }), {
      reason: 'BASE_DOCUMENT_CHANGED',
      status: 'stale',
    })
    await writeFile(manifestPath, JSON.stringify({ shadowVersion: 99, state: 'dirty' }))
    assert.deepEqual(await store.inspect({ projectPath, savedPackage }), {
      reason: 'SHADOW_VERSION_UNSUPPORTED',
      status: 'invalid',
    })
    await writeFile(manifestPath, '{bad json')
    assert.deepEqual(await store.inspect({ projectPath, savedPackage }), {
      reason: 'MANIFEST_INVALID',
      status: 'invalid',
    })
  })
})

test('Save A cannot clean a newer shadow B, and clean/discard are local-only', async () => {
  await withProject(async ({ autosaveRoot, directory, projectPath, savedDocument, store }) => {
    const first = edit(savedDocument, 'In-flight Save A')
    const later = edit(savedDocument, 'Later edit B')
    await store.write({ document: first, projectPath, savedDocument })
    await store.write({ document: later, projectPath, savedDocument })
    assert.deepEqual(await store.markClean(projectPath, first.documentRevision), {
      cleaned: false,
      directorySynced: true,
    })
    const afterFailedClean = await store.inspect({
      projectPath,
      savedPackage: await readIgsPackage(projectPath),
    })
    assert.equal(afterFailedClean.status, 'recoverable')
    if (afterFailedClean.status === 'recoverable') {
      assert.equal(afterFailedClean.document.title, 'Later edit B')
    }

    const copyPath = path.join(directory, 'portable-copy.igs')
    await copyFile(projectPath, copyPath)
    assert.deepEqual(
      await store.inspect({
        projectPath: copyPath,
        savedPackage: await readIgsPackage(copyPath),
      }),
      { status: 'absent' },
    )

    await store.discard(projectPath)
    assert.deepEqual(
      await store.inspect({
        projectPath,
        savedPackage: await readIgsPackage(projectPath),
      }),
      { status: 'absent' },
    )
    assert.equal((await readIgsPackage(projectPath)).project.title, 'Saved')
    assert.deepEqual(await readdir(autosaveRoot), [])
  })
})

test('a missing or incorrect dirty asset cannot replace valid recovery', async () => {
  await withProject(async ({ autosaveRoot, projectPath, savedDocument, store }) => {
    const first = edit(savedDocument, 'Recoverable')
    await store.write({ document: first, projectPath, savedDocument })
    const id = randomUUID()
    const assetPath = `assets/layers/${id}.png`
    const withAsset: IgsProjectDocumentV1 = {
      ...edit(savedDocument, 'Broken later edit'),
      layers: [
        {
          asset: {
            bytes: raster.length,
            height: 2,
            path: assetPath,
            sha256: sha256(raster),
            width: 2,
          },
          blendMode: 'normal',
          id,
          kind: 'raster',
          locked: false,
          name: 'Raster',
          opacity: 1,
          transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 0, y: 0 },
          visible: true,
        },
      ],
    }
    await assert.rejects(store.write({ document: withAsset, projectPath, savedDocument }), {
      code: 'SHADOW_INVALID_REQUEST',
    })
    await assert.rejects(
      store.write({
        dirtyAssets: { [assetPath]: { bytes: Buffer.from('wrong raster') } },
        document: withAsset,
        projectPath,
        savedDocument,
      }),
      { code: 'SHADOW_ASSET_MISMATCH' },
    )
    const recovered = await new ProjectShadowStore(autosaveRoot).inspect({
      projectPath,
      savedPackage: await readIgsPackage(projectPath),
    })
    assert.equal(recovered.status, 'recoverable')
    if (recovered.status === 'recoverable') {
      assert.equal(recovered.document.title, 'Recoverable')
    }
  })
})

test('Save transition recovers B from exact S or A, including an asset removed by A', async () => {
  await withProject(async ({ autosaveRoot, projectPath, session, store }) => {
    const oldLayer = rasterLayer(randomUUID())
    session.applyDocument({ ...session.document, layers: [oldLayer] })
    await session.save({ assets: { [oldLayer.asset.path]: { bytes: raster } } })
    const savedS = session.document
    session.applyDocument({ ...savedS, layers: [], title: 'A removes the raster' })
    const committingA = session.document
    const newLayer = rasterLayer(randomUUID())
    const dirtyB: IgsProjectDocumentV1 = {
      ...edit(savedS, 'B retains old and adds new'),
      layers: [oldLayer, newLayer],
    }
    await assert.rejects(
      store.write({
        committingDocument: committingA,
        dirtyAssets: { [newLayer.asset.path]: { bytes: raster } },
        document: dirtyB,
        projectPath,
        savedDocument: savedS,
      }),
      { code: 'SHADOW_INVALID_REQUEST' },
    )
    const committedShadow = await store.write({
      committingDocument: committingA,
      dirtyAssets: {
        [newLayer.asset.path]: { bytes: raster },
        [oldLayer.asset.path]: { bytes: raster },
      },
      document: dirtyB,
      projectPath,
      savedDocument: savedS,
    })
    assert.equal(committedShadow.committingDocumentRevision, committingA.documentRevision)
    const restarted = new ProjectShadowStore(autosaveRoot)
    const before = await restarted.inspect({
      projectPath,
      savedPackage: await readIgsPackage(projectPath),
    })
    assert.equal(before.status, 'recoverable')
    if (before.status !== 'recoverable') {
      return
    }
    assert.deepEqual(Object.keys(before.dirtyAssets), [newLayer.asset.path])
    assert.deepEqual(before.document, dirtyB)

    const savedPackageBytes = await readFile(projectPath)
    const emptyPreview = await readProjectPlaceholders(placeholdersDir, 'empty')
    await assert.rejects(
      saveIgsPackage(
        projectPath,
        { preview: { ...emptyPreview, rect: null, status: 'empty' }, project: committingA },
        {
          beforeRename: async () => {
            throw new Error('interrupted before package commit')
          },
        },
      ),
      /interrupted before package commit/,
    )
    assert.deepEqual(await readFile(projectPath), savedPackageBytes)
    assert.equal(
      (
        await restarted.inspect({
          projectPath,
          savedPackage: await readIgsPackage(projectPath),
        })
      ).status,
      'recoverable',
    )

    await session.save()
    const savedA = await readIgsPackage(projectPath)
    assert.deepEqual(savedA.project, committingA)
    const after = await restarted.inspect({ projectPath, savedPackage: savedA })
    assert.equal(after.status, 'recoverable')
    if (after.status !== 'recoverable') {
      return
    }
    assert.deepEqual(
      Object.keys(after.dirtyAssets),
      [newLayer.asset.path, oldLayer.asset.path].sort(),
    )
    const manifestPath = path.join(autosaveRoot, committedShadow.localRecoveryKey, 'manifest.json')
    const validManifest = await readFile(manifestPath)
    const incompleteManifest = JSON.parse(validManifest.toString('utf8')) as Record<string, unknown>
    const committing = incompleteManifest.committingDocument as Record<string, unknown>
    committing.requiredAssetPaths = []
    await writeFile(manifestPath, JSON.stringify(incompleteManifest))
    assert.deepEqual(await restarted.inspect({ projectPath, savedPackage: savedA }), {
      reason: 'MANIFEST_INVALID',
      status: 'invalid',
    })
    await writeFile(manifestPath, validManifest)
    for (const assetPath of Object.keys(after.dirtyAssets)) {
      const stagedSource: IgsAssetSource | undefined = after.dirtyAssets[assetPath]
      assert.ok(stagedSource && 'sourcePath' in stagedSource)
      assert.deepEqual(await readFile(stagedSource.sourcePath), raster)
    }
    const recovered = await ProjectSession.open(projectPath, {
      placeholdersDir,
      scratchDir: path.join(path.dirname(projectPath), 'scratch-recovered'),
    })
    recovered.applyDocument(after.document)
    await recovered.save({ assets: after.dirtyAssets })
    const reopened = await readIgsPackage(projectPath)
    assert.equal(reopened.project.layers.length, 2)
    assert.deepEqual(await reopened.readMember(oldLayer.asset.path), raster)
    assert.deepEqual(await reopened.readMember(newLayer.asset.path), raster)
  })
})

test('a Save transition never treats an arbitrary later package as its frozen target', async () => {
  await withProject(async ({ autosaveRoot, projectPath, savedDocument, session, store }) => {
    session.applyDocument({ ...savedDocument, title: 'Committing A' })
    const committingA = session.document
    const dirtyB = edit(savedDocument, 'Uncommitted B')
    const written = await store.write({
      committingDocument: committingA,
      document: dirtyB,
      projectPath,
      savedDocument,
    })
    await session.save()
    assert.equal(
      (
        await new ProjectShadowStore(autosaveRoot).inspect({
          projectPath,
          savedPackage: await readIgsPackage(projectPath),
        })
      ).status,
      'recoverable',
    )

    const manifestPath = path.join(autosaveRoot, written.localRecoveryKey, 'manifest.json')
    const validManifest = await readFile(manifestPath)
    const manifest = JSON.parse(validManifest.toString('utf8')) as Record<string, unknown>
    const committing = manifest.committingDocument as Record<string, unknown>
    committing.documentHash = '0'.repeat(64)
    await writeFile(manifestPath, JSON.stringify(manifest))
    assert.deepEqual(
      await new ProjectShadowStore(autosaveRoot).inspect({
        projectPath,
        savedPackage: await readIgsPackage(projectPath),
      }),
      { reason: 'BASE_DOCUMENT_CHANGED', status: 'stale' },
    )
    await writeFile(manifestPath, validManifest)

    session.applyDocument({ ...session.document, title: 'Unrelated C' })
    await session.save()
    assert.deepEqual(
      await new ProjectShadowStore(autosaveRoot).inspect({
        projectPath,
        savedPackage: await readIgsPackage(projectPath),
      }),
      { reason: 'BASE_DOCUMENT_CHANGED', status: 'stale' },
    )
  })
})

test('exact undo to S remains recoverable after in-flight Save A removes its asset', async () => {
  await withProject(async ({ autosaveRoot, projectPath, session, store }) => {
    const retainedLayer = rasterLayer(randomUUID())
    session.applyDocument({ ...session.document, layers: [retainedLayer] })
    await session.save({ assets: { [retainedLayer.asset.path]: { bytes: raster } } })
    const savedS = session.document

    session.applyDocument({ ...savedS, layers: [], title: 'A removes raster' })
    const committingA = session.document
    session.applyDocument(savedS)
    const undoB = session.document
    assert.deepEqual(undoB, savedS)

    const shadow = await store.write({
      committingDocument: committingA,
      dirtyAssets: { [retainedLayer.asset.path]: { bytes: raster } },
      document: undoB,
      projectPath,
      savedDocument: savedS,
    })
    assert.equal(shadow.documentRevision, savedS.documentRevision)
    const restarted = new ProjectShadowStore(autosaveRoot)
    assert.deepEqual(
      await restarted.inspect({ projectPath, savedPackage: await readIgsPackage(projectPath) }),
      { status: 'clean' },
    )

    // The frozen A can still complete after B undoes it in the live session.
    await saveIgsPackage(projectPath, {
      preview: {
        ...(await readProjectPlaceholders(placeholdersDir, 'empty')),
        rect: null,
        status: 'empty',
      },
      project: committingA,
    })
    const savedA = await readIgsPackage(projectPath)
    assert.deepEqual(savedA.project, committingA)
    assert.deepEqual(await restarted.markClean(projectPath, committingA.documentRevision), {
      cleaned: false,
      directorySynced: true,
    })
    const after = await restarted.inspect({ projectPath, savedPackage: savedA })
    assert.equal(after.status, 'recoverable')
    if (after.status !== 'recoverable') {
      return
    }
    assert.deepEqual(after.document, savedS)
    assert.deepEqual(Object.keys(after.dirtyAssets), [retainedLayer.asset.path])

    const recovered = await ProjectSession.open(projectPath, {
      placeholdersDir,
      scratchDir: path.join(path.dirname(projectPath), 'scratch-undo-recovered'),
    })
    recovered.applyDocument(after.document)
    await recovered.save({ assets: after.dirtyAssets })
    const reopened = await readIgsPackage(projectPath)
    assert.deepEqual(reopened.project.layers, [retainedLayer])
    assert.deepEqual(await reopened.readMember(retainedLayer.asset.path), raster)
  })
})
