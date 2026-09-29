import type { IgsProjectDocumentV1 } from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { readIgsPackage } from './igs-package.js'
import { withProjectPathLock } from './project-path-lock.js'
import { readProjectPlaceholders } from './project-placeholders.js'
import { ProjectSession } from './project-session.js'

const bundledPlaceholders = path.resolve('src/main/projects/placeholders')
const raster = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGO06bnDwMDAxMDAwMDAAAATOgGonVuaBAAAAABJRU5ErkJggg==',
  'base64',
)
const sparseRaster = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEElEQVR4nGNgQAb/GRj+AwAFDQH/OH1KHAAAAABJRU5ErkJggg==',
  'base64',
)
const transparentRaster = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAC0lEQVR4nGNgQAcAABIAAXfx+gAAAAAASUVORK5CYII=',
  'base64',
)
const croppedPixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==',
  'base64',
)
const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex')

async function withSession(
  run: (session: ProjectSession, directory: string) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'igs-session-'))
  try {
    const session = await ProjectSession.create(path.join(directory, 'project.igs'), 'First', {
      placeholdersDir: bundledPlaceholders,
      scratchDir: path.join(directory, 'scratch'),
    })
    await run(session, directory)
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
}

test('New Project, exact undo, Save and portable reopen use the actual package', async () => {
  await withSession(async (session, directory) => {
    const saved = session.document
    assert.equal(session.dirty, false)
    const changed: IgsProjectDocumentV1 = {
      ...saved,
      generationDraft: {
        ...saved.generationDraft,
        positivePrompt: { embeddingRefs: [], text: 'an evening sky' },
      },
      primaryBbox: { height: 768, width: 1024, x: -400, y: 70 },
    }
    session.applyDocument(changed)
    assert.equal(session.dirty, true)
    assert.notEqual(session.document.documentRevision, saved.documentRevision)
    session.applyDocument(saved)
    assert.equal(session.dirty, false)
    assert.equal(session.document.documentRevision, saved.documentRevision)
    session.applyDocument(changed)

    const outcome = await session.save()
    assert.deepEqual(outcome, {
      committed: true,
      directorySynced: true,
      reloadRequired: false,
    })
    assert.equal(session.dirty, false)
    const reopened = await ProjectSession.open(session.filePath, {
      placeholdersDir: bundledPlaceholders,
      scratchDir: path.join(directory, 'scratch'),
    })
    assert.deepEqual(reopened.document, session.document)
    assert.equal((await readIgsPackage(session.filePath)).manifest.preview.status, 'empty')

    const copiedPath = path.join(directory, 'portable.igs')
    await copyFile(session.filePath, copiedPath)
    const copied = await ProjectSession.open(copiedPath, {
      placeholdersDir: bundledPlaceholders,
      scratchDir: path.join(directory, 'scratch'),
    })
    assert.deepEqual(copied.document, reopened.document)
    assert.notEqual(copied.localRecoveryKey, reopened.localRecoveryKey)
    await assert.rejects(
      ProjectSession.create(session.filePath, 'Overwrite', {
        placeholdersDir: bundledPlaceholders,
        scratchDir: path.join(directory, 'scratch'),
      }),
      { code: 'EEXIST' },
    )
  })
})

test('explicit Save snapshots the actual seed without a document revision or dirty edit', async () => {
  await withSession(async (session, directory) => {
    const revision = session.document.documentRevision
    assert.equal(session.document.lastActualSeedSnapshot, null)
    await session.save({ lastActualSeedSnapshot: 4_294_967_295 })
    assert.equal(session.dirty, false)
    assert.equal(session.document.documentRevision, revision)
    assert.equal(session.document.lastActualSeedSnapshot, 4_294_967_295)
    assert.equal(
      (await readIgsPackage(session.filePath)).project.lastActualSeedSnapshot,
      4_294_967_295,
    )

    // A stale document command cannot turn operational metadata into an edit or rewind it.
    session.applyDocument({ ...session.document, lastActualSeedSnapshot: null })
    assert.equal(session.dirty, false)
    assert.equal(session.document.documentRevision, revision)
    assert.equal(session.document.lastActualSeedSnapshot, 4_294_967_295)
    await session.save()
    assert.equal(
      (await readIgsPackage(session.filePath)).project.lastActualSeedSnapshot,
      4_294_967_295,
    )

    const copiedPath = path.join(directory, 'portable-seed.igs')
    await copyFile(session.filePath, copiedPath)
    const portable = await ProjectSession.open(copiedPath, {
      placeholdersDir: bundledPlaceholders,
      scratchDir: path.join(directory, 'scratch'),
    })
    assert.equal(portable.document.lastActualSeedSnapshot, 4_294_967_295)
  })
})

test('a rejected Save cannot advance the in-memory or portable seed snapshot', async () => {
  await withSession(async (session, directory) => {
    const other = await ProjectSession.open(session.filePath, {
      placeholdersDir: bundledPlaceholders,
      scratchDir: path.join(directory, 'scratch'),
    })
    await other.save({ lastActualSeedSnapshot: 33 })
    const committed = await readFile(session.filePath)
    await assert.rejects(session.save({ lastActualSeedSnapshot: 44 }), {
      code: 'PROJECT_EXTERNAL_CHANGE',
    })
    assert.equal(session.document.lastActualSeedSnapshot, null)
    assert.equal(session.dirty, false)
    assert.deepEqual(await readFile(session.filePath), committed)
    assert.equal((await readIgsPackage(session.filePath)).project.lastActualSeedSnapshot, 33)
  })
})

test('Save without a worker keeps raster pixels and original ICC metadata in an unavailable-preview package', async () => {
  await withSession(async (session, directory) => {
    const id = randomUUID()
    const assetPath = `assets/layers/${id}.png`
    const secondId = randomUUID()
    const secondAssetPath = `assets/layers/${secondId}.png`
    const sourceIcc = Buffer.alloc(128)
    sourceIcc.writeUInt32BE(sourceIcc.length, 0)
    sourceIcc.write('acsp', 36, 'ascii')
    const profilePath = `assets/profiles/${sha256(sourceIcc)}.icc`
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
          name: 'Imported raster',
          opacity: 1,
          sourceIccProfile: {
            bytes: sourceIcc.length,
            path: profilePath,
            sha256: sha256(sourceIcc),
          },
          transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 500_000, y: 0 },
          visible: true,
        },
        {
          asset: {
            bytes: raster.length,
            height: 2,
            path: secondAssetPath,
            sha256: sha256(raster),
            width: 2,
          },
          blendMode: 'normal',
          id: secondId,
          kind: 'raster',
          locked: false,
          name: 'Distant raster',
          opacity: 1,
          transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: -500_000, y: 0 },
          visible: true,
        },
      ],
    })
    const saved = await session.save({
      assets: {
        [assetPath]: { bytes: raster },
        [profilePath]: { bytes: sourceIcc },
        [secondAssetPath]: { bytes: raster },
      },
    })
    assert.equal(saved.committed, true)
    assert.equal(session.dirty, false)
    const opened = await readIgsPackage(session.filePath)
    assert.equal(opened.project.colorSpace, 'srgb')
    assert.equal(opened.manifest.preview.status, 'unavailable')
    assert.deepEqual(opened.manifest.preview.rect, {
      height: 2,
      width: 1_000_002,
      x: -500_000,
      y: 0,
    })
    assert.deepEqual(await opened.readMember(assetPath), raster)
    assert.deepEqual(await opened.readMember(secondAssetPath), raster)
    assert.deepEqual(await opened.readMember(profilePath), sourceIcc)
    assert.ok((await opened.readMember('preview/merged.png')).length > 0)
    assert.ok((await opened.readMember('preview/thumbnail.webp')).length > 0)

    const renamed = { ...session.document, title: 'Renamed after import' }
    session.applyDocument(renamed)
    await session.save()
    const after = await readIgsPackage(session.filePath)
    assert.equal(after.project.title, 'Renamed after import')
    assert.deepEqual(await after.readMember(assetPath), raster)
    assert.deepEqual(await after.readMember(secondAssetPath), raster)
    assert.deepEqual(await after.readMember(profilePath), sourceIcc)
  })
})

test('concurrent external Save cannot overwrite newer package or clear this tab dirty state', async () => {
  await withSession(async (first, directory) => {
    const second = await ProjectSession.open(first.filePath, {
      placeholdersDir: bundledPlaceholders,
      scratchDir: path.join(directory, 'scratch'),
    })
    first.applyDocument({ ...first.document, title: 'First tab' })
    second.applyDocument({ ...second.document, title: 'Second tab' })
    await second.save()
    const committed = await readFile(first.filePath)
    await assert.rejects(first.save(), { code: 'PROJECT_EXTERNAL_CHANGE' })
    assert.equal(first.dirty, true)
    assert.deepEqual(await readFile(first.filePath), committed)
    assert.equal((await readIgsPackage(first.filePath)).project.title, 'Second tab')
  })
})

test('a failed asset validation keeps the prior package and dirty document', async () => {
  await withSession(async (session) => {
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
          name: 'New raster',
          opacity: 1,
          transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 0, y: 0 },
          visible: true,
        },
      ],
    })
    const committed = await readFile(session.filePath)
    await assert.rejects(
      session.save({
        assets: { [assetPath]: { bytes: raster.subarray(0, -4) } },
      }),
    )
    assert.equal(session.dirty, true)
    assert.deepEqual(await readFile(session.filePath), committed)
    assert.equal((await readIgsPackage(session.filePath)).project.layers.length, 0)
  })
})

test('edits arriving during Save remain dirty, and overlapping Saves for one path are refused', async () => {
  await withSession(async (session, directory) => {
    const otherTab = await ProjectSession.open(session.filePath, {
      placeholdersDir: bundledPlaceholders,
      scratchDir: path.join(directory, 'scratch'),
    })
    session.applyDocument({ ...session.document, title: 'Snapshot A' })
    const savingA = session.save()
    session.applyDocument({ ...session.document, title: 'Later edit B' })
    await assert.rejects(otherTab.save(), { code: 'PROJECT_SAVE_IN_PROGRESS' })
    assert.equal((await savingA).committed, true)
    assert.equal((await readIgsPackage(session.filePath)).project.title, 'Snapshot A')
    assert.equal(session.document.title, 'Later edit B')
    assert.equal(session.dirty, true)
    await session.save()
    assert.equal((await readIgsPackage(session.filePath)).project.title, 'Later edit B')
    assert.equal(session.dirty, false)
  })
})

test('Save freezes its document before waiting for a concurrent Home index operation', async () => {
  await withSession(async (session) => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let entered: () => void = () => undefined
    const lockEntered = new Promise<void>((resolve) => {
      entered = resolve
    })
    const scanning = withProjectPathLock(session.filePath, async () => {
      entered()
      await gate
    })
    await lockEntered
    session.applyDocument({ ...session.document, title: 'Frozen A' })
    const saving = session.save()
    session.applyDocument({ ...session.document, title: 'Later B' })
    release()
    await scanning
    await saving
    assert.equal((await readIgsPackage(session.filePath)).project.title, 'Frozen A')
    assert.equal(session.document.title, 'Later B')
    assert.equal(session.dirty, true)
  })
})

test('returning to the in-flight Save content reconciles the committed revision', async () => {
  await withSession(async (session) => {
    session.applyDocument({ ...session.document, title: 'Snapshot A' })
    const snapshotA = session.document
    const savingA = session.save()
    session.applyDocument({ ...session.document, title: 'Transient B' })
    session.applyDocument({ ...session.document, title: 'Snapshot A' })
    assert.notEqual(session.document.documentRevision, snapshotA.documentRevision)
    await savingA
    const reopened = await readIgsPackage(session.filePath)
    assert.equal(session.dirty, false)
    assert.equal(session.document.documentRevision, reopened.project.documentRevision)
    assert.equal(session.document.documentRevision, snapshotA.documentRevision)
  })
})

test('stale or disjoint derivative cannot be presented as the current Project preview', async () => {
  await withSession(async (session) => {
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
          name: 'Source',
          opacity: 1,
          transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 500_000, y: 0 },
          visible: true,
        },
      ],
    })
    await session.save({ assets: { [assetPath]: { bytes: raster } } })
    const thumbnail = (await readProjectPlaceholders(bundledPlaceholders, 'unavailable')).thumbnail
    const previousRevision = session.document.documentRevision
    session.applyDocument({ ...session.document, title: 'Changed' })
    await assert.rejects(
      session.save({
        renderedPreview: {
          documentRevision: previousRevision,
          merged: raster,
          rect: { height: 2, width: 2, x: 500_000, y: 0 },
          thumbnail,
        },
      }),
      { code: 'PROJECT_INVALID_PREVIEW' },
    )
    await assert.rejects(
      session.save({
        renderedPreview: {
          documentRevision: session.document.documentRevision,
          merged: raster,
          rect: { height: 2, width: 2, x: 0, y: 0 },
          thumbnail,
        },
      }),
      { code: 'PROJECT_INVALID_PREVIEW' },
    )
    await assert.rejects(
      session.save({
        renderedPreview: {
          documentRevision: session.document.documentRevision,
          merged: raster,
          rect: { height: 2, width: 2, x: 499_999, y: 0 },
          thumbnail,
        },
      }),
      { code: 'PROJECT_INVALID_PREVIEW' },
    )
    assert.equal(session.dirty, true)
    assert.equal((await readIgsPackage(session.filePath)).project.title, 'First')
  })
})

test('Save accepts a worker preview cropped to actual alpha bounds inside layer geometry', async () => {
  await withSession(async (session) => {
    const id = randomUUID()
    const assetPath = `assets/layers/${id}.png`
    session.applyDocument({
      ...session.document,
      layers: [
        {
          asset: {
            bytes: sparseRaster.length,
            height: 2,
            path: assetPath,
            sha256: sha256(sparseRaster),
            width: 2,
          },
          blendMode: 'normal',
          id,
          kind: 'raster',
          locked: false,
          name: 'One visible pixel',
          opacity: 1,
          transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: -10, y: 20 },
          visible: true,
        },
      ],
    })
    const revision = session.document.documentRevision
    const thumbnail = (await readProjectPlaceholders(bundledPlaceholders, 'unavailable')).thumbnail
    await session.save({
      assets: { [assetPath]: { bytes: sparseRaster } },
      renderedPreview: {
        documentRevision: revision,
        merged: croppedPixel,
        rect: { height: 1, width: 1, x: -9, y: 21 },
        thumbnail,
      },
    })
    const opened = await readIgsPackage(session.filePath)
    assert.equal(opened.project.documentRevision, revision)
    assert.equal(opened.manifest.preview.status, 'rendered')
    assert.deepEqual(opened.manifest.preview.rect, { height: 1, width: 1, x: -9, y: 21 })
    assert.deepEqual(await opened.readMember('preview/merged.png'), croppedPixel)
    assert.deepEqual(await opened.readMember(assetPath), sparseRaster)
  })
})

test('a revision-bound empty worker result survives Save with transparent raster assets', async () => {
  await withSession(async (session) => {
    const id = randomUUID()
    const assetPath = `assets/layers/${id}.png`
    session.applyDocument({
      ...session.document,
      layers: [
        {
          asset: {
            bytes: transparentRaster.length,
            height: 2,
            path: assetPath,
            sha256: sha256(transparentRaster),
            width: 2,
          },
          blendMode: 'normal',
          id,
          kind: 'raster',
          locked: false,
          name: 'Transparent layer',
          opacity: 1,
          transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 8, y: -4 },
          visible: true,
        },
      ],
    })
    const revision = session.document.documentRevision
    session.applyDocument({ ...session.document, title: 'Edited after worker snapshot' })
    await assert.rejects(
      session.save({
        assets: { [assetPath]: { bytes: transparentRaster } },
        emptyPreviewRevision: revision,
      }),
      { code: 'PROJECT_INVALID_PREVIEW' },
    )
    assert.equal((await readIgsPackage(session.filePath)).project.title, 'First')
    assert.equal(session.dirty, true)

    const actualRevision = session.document.documentRevision
    const thumbnail = (await readProjectPlaceholders(bundledPlaceholders, 'unavailable')).thumbnail
    await assert.rejects(
      session.save({
        assets: { [assetPath]: { bytes: transparentRaster } },
        emptyPreviewRevision: actualRevision,
        renderedPreview: {
          documentRevision: actualRevision,
          merged: croppedPixel,
          rect: { height: 1, width: 1, x: 8, y: -4 },
          thumbnail,
        },
      }),
      { code: 'PROJECT_INVALID_PREVIEW' },
    )
    assert.equal((await readIgsPackage(session.filePath)).project.title, 'First')
    await session.save({
      assets: { [assetPath]: { bytes: transparentRaster } },
      emptyPreviewRevision: actualRevision,
    })
    const opened = await readIgsPackage(session.filePath)
    assert.equal(opened.project.documentRevision, actualRevision)
    assert.equal(opened.manifest.preview.status, 'empty')
    assert.equal(opened.manifest.preview.rect, null)
    assert.deepEqual(await opened.readMember(assetPath), transparentRaster)

    session.applyDocument({ ...session.document, title: 'No worker available' })
    await session.save()
    const fallback = await readIgsPackage(session.filePath)
    assert.equal(fallback.manifest.preview.status, 'unavailable')
    assert.deepEqual(fallback.manifest.preview.rect, { height: 2, width: 2, x: 8, y: -4 })
    assert.deepEqual(await fallback.readMember(assetPath), transparentRaster)
  })
})

test('Rebuild Preview changes only embedded derivatives and keeps a clean session saveable', async () => {
  await withSession(async (session) => {
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
          name: 'Source',
          opacity: 1,
          transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 13, y: -9 },
          visible: true,
        },
      ],
    })
    await session.save({ assets: { [assetPath]: { bytes: raster } } })
    const before = await readIgsPackage(session.filePath)
    assert.equal(before.manifest.preview.status, 'unavailable')
    const documentBytes = await before.readMember('project.json')
    const assetBytes = await before.readMember(assetPath)
    const revision = before.project.documentRevision
    const thumbnail = (await readProjectPlaceholders(bundledPlaceholders, 'unavailable')).thumbnail

    const rebuilt = await session.rebuildPreview({
      renderedPreview: {
        documentRevision: revision,
        merged: raster,
        rect: { height: 2, width: 2, x: 13, y: -9 },
        thumbnail,
      },
    })
    assert.deepEqual(rebuilt, { committed: true, directorySynced: true, reloadRequired: false })
    assert.equal(session.dirty, false)
    assert.equal(session.document.documentRevision, revision)
    const after = await readIgsPackage(session.filePath)
    assert.equal(after.manifest.preview.status, 'rendered')
    assert.deepEqual(after.manifest.preview.rect, { height: 2, width: 2, x: 13, y: -9 })
    assert.deepEqual(await after.readMember('preview/merged.png'), raster)
    assert.deepEqual(await after.readMember('project.json'), documentBytes)
    assert.deepEqual(await after.readMember(assetPath), assetBytes)

    session.applyDocument({ ...session.document, title: 'Edited after maintenance' })
    await session.save()
    const subsequent = await readIgsPackage(session.filePath)
    assert.equal(subsequent.project.title, 'Edited after maintenance')
    assert.equal(session.dirty, false)
  })
})

test('Rebuild Preview requires an exact derivative and never falls back to a placeholder', async () => {
  await withSession(async (session) => {
    const bytes = await readFile(session.filePath)
    const projectJson = await (await readIgsPackage(session.filePath)).readMember('project.json')
    const revision = session.document.documentRevision
    await assert.rejects(session.rebuildPreview({} as never), {
      code: 'PROJECT_INVALID_PREVIEW',
    })
    await assert.rejects(session.rebuildPreview({ emptyPreviewRevision: randomUUID() }), {
      code: 'PROJECT_INVALID_PREVIEW',
    })
    assert.deepEqual(await readFile(session.filePath), bytes)
    await session.rebuildPreview({ emptyPreviewRevision: revision })
    assert.deepEqual(
      await (await readIgsPackage(session.filePath)).readMember('project.json'),
      projectJson,
    )
    assert.equal((await readIgsPackage(session.filePath)).manifest.preview.status, 'empty')
  })
})

test('Rebuild Preview rejects dirty or externally replaced documents without touching them', async () => {
  await withSession(async (session, directory) => {
    const revision = session.document.documentRevision
    const original = await readFile(session.filePath)
    session.applyDocument({ ...session.document, title: 'Unsaved edit' })
    await assert.rejects(session.rebuildPreview({ emptyPreviewRevision: revision }), {
      code: 'PROJECT_DIRTY',
    })
    assert.deepEqual(await readFile(session.filePath), original)
    session.applyDocument({ ...session.document, title: 'First' })

    const other = await ProjectSession.open(session.filePath, {
      placeholdersDir: bundledPlaceholders,
      scratchDir: path.join(directory, 'scratch'),
    })
    other.applyDocument({ ...other.document, title: 'External edit' })
    await other.save()
    const external = await readFile(session.filePath)
    await assert.rejects(session.rebuildPreview({ emptyPreviewRevision: revision }))
    assert.deepEqual(await readFile(session.filePath), external)
    assert.equal((await readIgsPackage(session.filePath)).project.title, 'External edit')
  })
})

test('Rebuild Preview aborts before replacement if the Project turns dirty or the service guard fails', async () => {
  await withSession(async (session) => {
    const revision = session.document.documentRevision
    const original = await readFile(session.filePath)
    await assert.rejects(
      session.rebuildPreview(
        { emptyPreviewRevision: revision },
        {
          beforeReplace: () => {
            throw new Error('Worker result no longer applies.')
          },
        },
      ),
      /Worker result no longer applies/,
    )
    assert.deepEqual(await readFile(session.filePath), original)

    await assert.rejects(
      session.rebuildPreview(
        { emptyPreviewRevision: revision },
        { beforeReplace: () => session.applyDocument({ ...session.document, title: 'Late edit' }) },
      ),
      { code: 'PROJECT_DIRTY' },
    )
    assert.deepEqual(await readFile(session.filePath), original)
    assert.equal(session.dirty, true)
  })
})
