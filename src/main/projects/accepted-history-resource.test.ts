import type { AcceptedResultHistoryReference } from '../../shared/projects/accepted-result-history.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  symlink,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { type AppDatabase, openAppDatabase } from '../db/database.js'
import {
  acceptedHistoryImageUrl,
  canPreviewSavedAcceptedResult,
  parseAcceptedHistoryImageUrl,
  readSavedAcceptedResultImage,
  reviewSavedAcceptedResult,
} from './accepted-history-resource.js'
import { readIgsPackage } from './igs-package.js'
import { ProjectIndexRepository } from './project-index.js'
import { ProjectSession } from './project-session.js'
import {
  acceptedOutputPngFixture,
  acceptedRasterProvenanceFixture,
} from './test-fixtures/accepted-provenance.js'

const migrations = path.resolve('src/main/db/migrations')
const placeholdersDir = path.resolve('src/main/projects/placeholders')

async function fixture(
  run: (context: {
    currentPixels: Buffer
    database: AppDatabase
    directory: string
    filePath: string
    index: ProjectIndexRepository
    reference: AcceptedResultHistoryReference
    restartIndex: () => Promise<ProjectIndexRepository>
    scratch: string
    session: ProjectSession
    workspaceId: string
  }) => Promise<void>,
  currentWidth = 16,
): Promise<void> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'igs-accepted-history-resource-'))
  let database = openAppDatabase(directory, migrations)
  try {
    const index = new ProjectIndexRepository(database.db)
    const workspace = await index.ensureDefaultWorkspace(directory)
    const filePath = path.join(workspace.directoryPath, 'Saved.igs')
    const scratch = path.join(directory, 'scratch')
    const session = await ProjectSession.create(filePath, 'Saved', {
      placeholdersDir,
      scratchDir: scratch,
    })
    const originalPixels = await acceptedOutputPngFixture(8, 8)
    const currentPixels = await acceptedOutputPngFixture(currentWidth, 16)
    const layerId = randomUUID()
    const assetPath = `assets/layers/${layerId}.png`
    const provenance = acceptedRasterProvenanceFixture(session.document, originalPixels, {
      height: 8,
      width: 8,
      x: 0,
      y: 0,
    })
    provenance.generationConfiguration.sampling.actualSeed = 0
    session.applyDocument({
      ...session.document,
      layers: [
        {
          asset: {
            bytes: currentPixels.length,
            height: 16,
            path: assetPath,
            sha256: createHash('sha256').update(currentPixels).digest('hex'),
            width: currentWidth,
          },
          blendMode: 'normal',
          generationProvenance: provenance,
          id: layerId,
          kind: 'raster',
          locked: false,
          name: 'Accepted result',
          opacity: 1,
          transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 0, y: 0 },
          visible: true,
        },
      ],
    })
    await session.save({ assets: { [assetPath]: { bytes: currentPixels } } })
    const project = await index.indexSaved(filePath, workspace.id)
    const row = (await index.listSavedAcceptedResults(project.localProjectKey))[0]
    assert.ok(row)
    assert.equal(row.actualSeed, 0)
    assert.equal(row.outputWidth, 8)
    assert.equal(row.assetWidth, currentWidth)
    const reference = {
      assetSha256: row.assetSha256,
      documentId: row.documentId,
      documentRevision: row.documentRevision,
      layerId: row.layerId,
      projectKey: row.localProjectKey,
    }
    await run({
      currentPixels,
      database,
      directory,
      filePath,
      index,
      reference,
      restartIndex: async () => {
        await database.close()
        database = openAppDatabase(directory, migrations)
        return new ProjectIndexRepository(database.db)
      },
      scratch,
      session,
      workspaceId: workspace.id,
    })
  } finally {
    await database.close()
    await rm(directory, { force: true, recursive: true })
  }
}

test('saved history URL is a strict, pathless process capability', () => {
  const reference = {
    assetSha256: 'a'.repeat(64),
    documentId: randomUUID(),
    documentRevision: randomUUID(),
    layerId: randomUUID(),
    projectKey: `project-v1-${'b'.repeat(64)}`,
  }
  const url = acceptedHistoryImageUrl(reference)
  assert.deepEqual(parseAcceptedHistoryImageUrl(url), reference)
  assert.equal(url.includes('/home/'), false)
  const macStart = url.lastIndexOf('/') + 1
  assert.equal(parseAcceptedHistoryImageUrl(`${url.slice(0, macStart)}${'0'.repeat(64)}.img`), null)
  assert.equal(parseAcceptedHistoryImageUrl(url.replace(reference.layerId, randomUUID())), null)
  assert.equal(parseAcceptedHistoryImageUrl(`${url}?path=/etc/passwd`), null)
  assert.equal(parseAcceptedHistoryImageUrl(`${url}#fragment`), null)
  assert.equal(parseAcceptedHistoryImageUrl(url.replace('://result/', '://user@result/')), null)
  assert.equal(parseAcceptedHistoryImageUrl(url.replace('/result/', '/RESULT/')), null)
  assert.equal(parseAcceptedHistoryImageUrl(url.replace('igs-history:', 'file:')), null)
  assert.throws(() => acceptedHistoryImageUrl({ ...reference, projectKey: '../wrong' }))
})

test('saved history streams current verified pixels but keeps original generated metadata and no document mutation', async () => {
  await fixture(async ({ currentPixels, filePath, index, reference, scratch, session }) => {
    const before = await readFile(filePath)
    const reviewed = await reviewSavedAcceptedResult(reference, index)
    assert.ok(reviewed)
    assert.equal(reviewed.outputWidth, 8)
    assert.equal(reviewed.assetWidth, 16)
    assert.equal(canPreviewSavedAcceptedResult(reviewed), true)
    const response = await readSavedAcceptedResultImage(reference, index, scratch)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-type'), 'image/png')
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), currentPixels)
    assert.deepEqual(await readFile(filePath), before)

    // A dirty working document is never an image source or navigation authority.
    session.applyDocument({ ...session.document, layers: [] })
    const stillSaved = await readSavedAcceptedResultImage(reference, index, scratch)
    assert.equal(stillSaved.status, 200)
    assert.deepEqual(Buffer.from(await stillSaved.arrayBuffer()), currentPixels)
    assert.deepEqual(
      (await readIgsPackage(filePath)).project.layers.map((layer) => layer.id),
      [reference.layerId],
    )
    let entries = await readdir(scratch)
    for (
      let attempt = 0;
      attempt < 50 && entries.some((entry) => entry.startsWith('history-response-'));
      attempt += 1
    ) {
      await new Promise((resolve) => setTimeout(resolve, 10))
      entries = await readdir(scratch)
    }
    assert.equal(
      entries.some((entry) => entry.startsWith('history-response-')),
      false,
    )
  })
})

test('saved history rejects forged identities and stale or replaced .igs sources', async () => {
  await fixture(
    async ({ currentPixels, directory, filePath, index, reference, scratch, workspaceId }) => {
      const wrongRevision = { ...reference, documentRevision: randomUUID() }
      const wrongLayer = { ...reference, layerId: randomUUID() }
      const wrongSha = { ...reference, assetSha256: '0'.repeat(64) }
      for (const changed of [wrongRevision, wrongLayer, wrongSha]) {
        assert.equal(await reviewSavedAcceptedResult(changed, index), null)
        assert.equal((await readSavedAcceptedResultImage(changed, index, scratch)).status, 404)
      }
      const original = await readFile(filePath)
      await copyFile(filePath, path.join(directory, 'replacement.igs'))
      await rename(path.join(directory, 'replacement.igs'), filePath)
      assert.equal(await reviewSavedAcceptedResult(reference, index), null)
      assert.equal((await readSavedAcceptedResultImage(reference, index, scratch)).status, 404)
      await index.indexSaved(filePath, workspaceId)
      assert.ok(await reviewSavedAcceptedResult(reference, index))
      const response = await readSavedAcceptedResultImage(reference, index, scratch)
      assert.equal(response.status, 200)
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), currentPixels)
      assert.deepEqual(await readFile(filePath), original)

      const moved = path.join(directory, 'moved.igs')
      await rename(filePath, moved)
      await symlink(moved, filePath)
      assert.equal((await lstat(filePath)).isSymbolicLink(), true)
      assert.equal(await reviewSavedAcceptedResult(reference, index), null)
      assert.equal((await readSavedAcceptedResultImage(reference, index, scratch)).status, 404)
    },
  )
})

test('portable copy has a different local capability and survives reopening the SQLite index', async () => {
  await fixture(
    async ({ currentPixels, filePath, index, reference, restartIndex, scratch, workspaceId }) => {
      const copyPath = path.join(path.dirname(filePath), 'Copy.igs')
      await copyFile(filePath, copyPath)
      const copy = await index.indexSaved(copyPath, workspaceId)
      const row = (await index.listSavedAcceptedResults(copy.localProjectKey))[0]
      assert.ok(row)
      assert.notEqual(row.localProjectKey, reference.projectKey)
      assert.equal(row.layerId, reference.layerId)
      const copyReference = { ...reference, projectKey: copy.localProjectKey }
      assert.ok(await reviewSavedAcceptedResult(copyReference, index))
      assert.notEqual(acceptedHistoryImageUrl(copyReference), acceptedHistoryImageUrl(reference))
      const response = await readSavedAcceptedResultImage(copyReference, index, scratch)
      assert.equal(response.status, 200)
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), currentPixels)
      const reopened = await restartIndex()
      assert.ok(await reviewSavedAcceptedResult(copyReference, reopened))
      const afterRestart = await readSavedAcceptedResultImage(copyReference, reopened, scratch)
      assert.equal(afterRestart.status, 200)
      assert.deepEqual(Buffer.from(await afterRestart.arrayBuffer()), currentPixels)
    },
  )
})

test('oversized current asset still reviews for navigation but receives no image preview', async () => {
  await fixture(async ({ index, reference, scratch }) => {
    const record = await reviewSavedAcceptedResult(reference, index)
    assert.ok(record)
    assert.equal(record.outputWidth, 8)
    assert.equal(record.assetWidth, 2056)
    assert.equal(canPreviewSavedAcceptedResult(record), false)
    assert.equal((await readSavedAcceptedResultImage(reference, index, scratch)).status, 413)
  }, 2056)
})

test('saved history refuses indexed metadata that no longer matches the verified source', async () => {
  await fixture(async ({ database, filePath, index, reference, scratch, workspaceId }) => {
    await database.db
      .updateTable('project_accepted_result_index')
      .set({ asset_bytes: 1 })
      .where('local_project_key', '=', reference.projectKey)
      .where('layer_id', '=', reference.layerId)
      .execute()
    assert.equal(await reviewSavedAcceptedResult(reference, index), null)
    assert.equal((await readSavedAcceptedResultImage(reference, index, scratch)).status, 404)
    await index.indexSaved(filePath, workspaceId)
    assert.ok(await reviewSavedAcceptedResult(reference, index))
  })
})

test('history preview rejects a symlinked scratch root without writing to its target', async () => {
  await fixture(async ({ directory, index, reference }) => {
    const foreign = path.join(directory, 'foreign')
    const scratchLink = path.join(directory, 'scratch-link')
    await mkdir(foreign)
    await symlink(foreign, scratchLink)
    assert.equal((await readSavedAcceptedResultImage(reference, index, scratchLink)).status, 503)
    assert.deepEqual(await readdir(foreign), [])
    assert.ok(await reviewSavedAcceptedResult(reference, index))
  })
})
