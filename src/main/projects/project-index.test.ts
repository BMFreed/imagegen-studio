import {
  ACCEPTED_RESULT_HISTORY_PAGE_SIZE,
  type AcceptedResultHistoryCursor,
} from '../../shared/projects/accepted-result-history.js'
import { createEmptyProjectDocumentV1 } from '../../shared/projects/project-schema.js'

import Database from 'better-sqlite3'
import { sql } from 'kysely'
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  symlink,
  utimes,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test, { type TestContext } from 'node:test'
import * as yauzl from 'yauzl'

import { type AppDatabase, initializeAppDatabase, openAppDatabase } from '../db/database.js'
import { readIgsPackage, saveIgsPackage } from './igs-package.js'
import { ProjectArchiveWitnesses } from './project-archive-witnesses.js'
import { localProjectRecoveryKey } from './project-identity.js'
import {
  ProjectIndexError,
  ProjectIndexRepository,
  type ProjectWorkspaceRecord,
  UNCATEGORIZED_WORKSPACE_ID,
} from './project-index.js'
import { readProjectPlaceholders } from './project-placeholders.js'
import { ProjectSession } from './project-session.js'
import {
  acceptedOutputPngFixture,
  acceptedRasterProvenanceFixture,
} from './test-fixtures/accepted-provenance.js'
import { requireRasterLayer } from './test-fixtures/require-raster-layer.js'

const migrations = path.resolve('src/main/db/migrations')
const placeholdersDir = path.resolve('src/main/projects/placeholders')
const testValidatorIdentity = 'a'.repeat(64)
const durableWitnessKey = 'project-archive-witnesses-v1'

function trackArchiveMemberReads(t: TestContext): string[] {
  const reads: string[] = []
  const open = yauzl.ZipFile.prototype.openReadStreamPromise
  t.mock.method(
    yauzl.ZipFile.prototype,
    'openReadStreamPromise',
    function (this: yauzl.ZipFile, ...args: Parameters<typeof open>) {
      reads.push(args[0].fileName)
      return open.apply(this, args)
    },
  )
  return reads
}

async function withSavedResultProject(
  run: (context: {
    database: AppDatabase
    directory: string
    index: ProjectIndexRepository
    session: ProjectSession
    workspace: ProjectWorkspaceRecord
  }) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'igs-saved-results-index-'))
  const database = openAppDatabase(directory, migrations)
  try {
    const index = new ProjectIndexRepository(database.db)
    const workspace = await index.ensureDefaultWorkspace(directory)
    const session = await ProjectSession.create(
      path.join(workspace.directoryPath, 'Generated.igs'),
      'Saved results',
      {
        placeholdersDir,
        scratchDir: path.join(directory, 'scratch'),
      },
    )
    const originalOutput = await acceptedOutputPngFixture()
    const currentAsset = await acceptedOutputPngFixture(16, 16)
    const sources = {} as Record<string, { bytes: Buffer }>
    const layers = [0, 1, 2].map((position) => {
      const id = randomUUID()
      const assetPath = `assets/layers/${id}.png`
      sources[assetPath] = { bytes: currentAsset }
      const provenance = acceptedRasterProvenanceFixture(session.document, originalOutput, {
        height: 8,
        width: 8,
        x: -24,
        y: 48,
      })
      provenance.generationConfiguration.sampling.actualSeed = position === 0 ? 0 : 0xff_ff_ff_ff
      if (position === 1) {
        provenance.executionResultContext.acceptedAt = '2026-09-30T10:01:00.000Z'
      }
      return {
        asset: {
          bytes: currentAsset.length,
          height: 16,
          path: assetPath,
          sha256: createHash('sha256').update(currentAsset).digest('hex'),
          width: 16,
        },
        blendMode: 'normal' as const,
        ...(position < 2 ? { generationProvenance: provenance } : {}),
        id,
        kind: 'raster' as const,
        locked: false,
        name: position < 2 ? `Accepted ${position + 1}` : 'Imported image',
        opacity: 1,
        transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: -24, y: 48 },
        visible: position === 0,
      }
    })
    session.applyDocument({ ...session.document, layers })
    await session.save({ assets: sources })
    await index.indexSaved(session.filePath, workspace.id)
    await run({ database, directory, index, session, workspace })
  } finally {
    await database.close()
    await rm(directory, { force: true, recursive: true })
  }
}

test('saved result index copies generation metadata and keeps current assets separate through rescan and reopen', async () => {
  await withSavedResultProject(async ({ database, directory, index, session, workspace }) => {
    const projectId = session.localRecoveryKey
    const [parent] = await index.listProjects()
    const rows = await index.listSavedAcceptedResults(projectId)
    assert.equal(rows.length, 2)
    assert.deepEqual(
      rows.map((row) => row.layerId),
      [session.document.layers[1].id, session.document.layers[0].id],
    )
    for (const row of rows) {
      const layer = session.document.layers.find((item) => item.id === row.layerId)!
      const provenance = requireRasterLayer(layer).generationProvenance!
      assert.deepEqual(row, {
        acceptedAt: provenance.executionResultContext.acceptedAt,
        actualSeed: provenance.generationConfiguration.sampling.actualSeed,
        assetBytes: requireRasterLayer(layer).asset.bytes,
        assetHeight: 16,
        assetPath: requireRasterLayer(layer).asset.path,
        assetSha256: requireRasterLayer(layer).asset.sha256,
        assetWidth: 16,
        canonicalPath: session.filePath,
        documentId: session.document.documentId,
        documentRevision: session.document.documentRevision,
        fileFingerprint: parent.fileFingerprint,
        layerId: layer.id,
        layerName: layer.name,
        localProjectKey: projectId,
        modelFileSha256: provenance.generationConfiguration.model.fileSha256,
        modelName: provenance.generationConfiguration.model.displayName,
        modelVersionName: provenance.generationConfiguration.model.versionName,
        outputHeight: 8,
        outputWidth: 8,
        projectTitle: session.document.title,
      })
      assert.equal('imageUrl' in row, false)
      assert.equal('generationProvenance' in row, false)
    }
    await index.scanWorkspace(workspace.id)
    assert.deepEqual(await index.listSavedAcceptedResults(projectId), rows)
    await database.db
      .deleteFrom('project_accepted_result_index')
      .where('local_project_key', '=', projectId)
      .execute()
    assert.deepEqual(await index.listSavedAcceptedResults(projectId), [])
    await index.scanWorkspace(workspace.id)
    assert.deepEqual(await index.listSavedAcceptedResults(projectId), rows)
    const secondary = openAppDatabase(directory, migrations)
    try {
      assert.deepEqual(
        await new ProjectIndexRepository(secondary.db).listSavedAcceptedResults(projectId),
        rows,
      )
    } finally {
      await secondary.close()
    }
    assert.equal(
      (await database.db.selectFrom('project_accepted_result_index').selectAll().execute()).length,
      2,
    )
    assert.deepEqual(await index.listSavedAcceptedResults('invalid-project'), [])
    assert.deepEqual(await index.listSavedAcceptedResults(`project-v1-${'f'.repeat(64)}`), [])
  })
})

test('global saved-result paging exposes the saved catalog through the real index owner', async () => {
  await withSavedResultProject(async ({ index, session }) => {
    const page = await index.listSavedAcceptedResultsPage()
    assert.equal(page.totalCount, 2)
    assert.equal(page.items.length, 2)
    assert.equal(page.nextCursor, null)
    assert.deepEqual(page.items, await index.listSavedAcceptedResults(session.localRecoveryKey))
    assert.deepEqual(
      await index.getSavedAcceptedResult(session.localRecoveryKey, session.document.layers[0].id),
      page.items[1],
    )
    assert.equal(
      await index.getSavedAcceptedResult(session.localRecoveryKey, session.document.layers[2].id),
      null,
    )
    assert.equal(await index.getSavedAcceptedResult('bad-project', randomUUID()), null)
    assert.equal(await index.getSavedAcceptedResult(session.localRecoveryKey, 'bad-layer'), null)
    assert.equal(await index.getSavedAcceptedResult(session.localRecoveryKey, randomUUID()), null)
  })
})

test('global catalog pages preserve copies, tied timestamps and strict continuation over three SQLite pages', async () => {
  await withSavedResultProject(async ({ database, directory, index, session, workspace }) => {
    const baseLayer = session.document.layers[0]
    const layers = Array.from({ length: 57 }, (_, position) => ({
      ...baseLayer,
      id: randomUUID(),
      name: `Accepted pagination ${position}`,
    }))
    session.applyDocument({ ...session.document, layers })
    await session.save()
    await index.indexSaved(session.filePath, workspace.id)
    const copiedPath = path.join(workspace.directoryPath, 'Copied catalog project.igs')
    await copyFile(session.filePath, copiedPath)
    await index.indexSaved(copiedPath, workspace.id)
    const copiedKey = localProjectRecoveryKey(copiedPath)
    const expected = [
      ...(await index.listSavedAcceptedResults(session.localRecoveryKey)),
      ...(await index.listSavedAcceptedResults(copiedKey)),
    ].sort(
      (left, right) =>
        right.acceptedAt.localeCompare(left.acceptedAt) ||
        left.localProjectKey.localeCompare(right.localProjectKey) ||
        left.layerId.localeCompare(right.layerId),
    )
    const first = await index.listSavedAcceptedResultsPage()
    assert.equal(first.totalCount, 114)
    assert.equal(first.items.length, ACCEPTED_RESULT_HISTORY_PAGE_SIZE)
    assert.ok(first.nextCursor)
    const mutableCursor = { ...first.nextCursor }
    const nextPagePromise = index.listSavedAcceptedResultsPage(mutableCursor)
    mutableCursor.acceptedAt = '2000-01-01T00:00:00.000Z'
    mutableCursor.projectKey = `project-v1-${'f'.repeat(64)}`
    mutableCursor.layerId = randomUUID()
    const second = await nextPagePromise
    assert.equal(second.totalCount, 114)
    assert.equal(second.items.length, ACCEPTED_RESULT_HISTORY_PAGE_SIZE)
    assert.ok(second.nextCursor)
    const secondary = openAppDatabase(directory, migrations)
    try {
      const third = await new ProjectIndexRepository(secondary.db).listSavedAcceptedResultsPage(
        second.nextCursor,
      )
      assert.equal(third.totalCount, 114)
      assert.equal(third.items.length, 14)
      assert.equal(third.nextCursor, null)
      const actual = [...first.items, ...second.items, ...third.items]
      assert.deepEqual(actual, expected)
      assert.equal(new Set(actual.map((row) => `${row.localProjectKey}:${row.layerId}`)).size, 114)
      assert.equal(new Set(actual.map((row) => row.documentId)).size, 1)
      assert.equal(new Set(actual.map((row) => row.localProjectKey)).size, 2)
    } finally {
      await secondary.close()
    }
    // The global-order migration must not change either copy's portable source or ownership.
    assert.deepEqual(await readFile(copiedPath), await readFile(session.filePath))
    assert.equal(
      (await database.db.selectFrom('project_accepted_result_index').selectAll().execute()).length,
      114,
    )
  })
})

test('catalog keyset survives a deleted anchor and excludes newer inserts until a fresh first page', async () => {
  await withSavedResultProject(async ({ index, session, workspace }) => {
    const baseLayer = session.document.layers[0]
    const layers = Array.from({ length: 61 }, (_, position) => ({
      ...baseLayer,
      id: randomUUID(),
      name: `Accepted cursor ${position}`,
    }))
    session.applyDocument({ ...session.document, layers })
    await session.save()
    await index.indexSaved(session.filePath, workspace.id)
    const first = await index.listSavedAcceptedResultsPage()
    assert.ok(first.nextCursor)
    const expectedRemainder = (
      await index.listSavedAcceptedResults(session.localRecoveryKey)
    ).slice(50)
    const newLayer = {
      ...baseLayer,
      generationProvenance: {
        ...requireRasterLayer(baseLayer).generationProvenance!,
        executionResultContext: {
          ...requireRasterLayer(baseLayer).generationProvenance!.executionResultContext,
          acceptedAt: '2026-10-02T15:00:00.000Z',
        },
      },
      id: randomUUID(),
      name: 'Newer accepted result',
    }
    session.applyDocument({
      ...session.document,
      layers: [...layers.filter((layer) => layer.id !== first.nextCursor!.layerId), newLayer],
    })
    await session.save()
    await index.indexSaved(session.filePath, workspace.id)
    assert.equal(
      await index.getSavedAcceptedResult(session.localRecoveryKey, first.nextCursor.layerId),
      null,
    )
    const continued = await index.listSavedAcceptedResultsPage(first.nextCursor)
    assert.equal(continued.totalCount, 61)
    assert.equal(continued.nextCursor, null)
    assert.deepEqual(
      continued.items.map((row) => row.layerId),
      expectedRemainder.map((row) => row.layerId),
    )
    assert.equal(
      continued.items.some((row) => row.layerId === newLayer.id),
      false,
    )
    const refreshed = await index.listSavedAcceptedResultsPage()
    assert.equal(refreshed.items[0].layerId, newLayer.id)
    assert.equal(refreshed.totalCount, 61)
  })
})

test('catalog count and items share one SQLite snapshot across an independent writer', async () => {
  await withSavedResultProject(async ({ database, index, session }) => {
    const expected = await index.listSavedAcceptedResults(session.localRecoveryKey)
    const writer = new Database(database.filePath, { fileMustExist: true })
    let changedAfterCount = false
    const racedIndex = new ProjectIndexRepository(
      database.db.withPlugin({
        transformQuery: ({ node }) => node,
        async transformResult({ result }) {
          if (!changedAfterCount && result.rows.length === 1 && 'totalCount' in result.rows[0]) {
            changedAfterCount = true
            writer
              .prepare('UPDATE project_index SET trashed_at = ? WHERE local_project_key = ?')
              .run('2026-10-02T16:00:00.000Z', session.localRecoveryKey)
          }
          return result
        },
      }),
    )
    try {
      const page = await racedIndex.listSavedAcceptedResultsPage()
      assert.equal(changedAfterCount, true)
      assert.equal(page.totalCount, 2)
      assert.deepEqual(page.items, expected)
      assert.equal(page.nextCursor, null)
      assert.deepEqual(await racedIndex.listSavedAcceptedResultsPage(), {
        items: [],
        nextCursor: null,
        totalCount: 0,
      })
      assert.equal(
        await racedIndex.getSavedAcceptedResult(session.localRecoveryKey, expected[0].layerId),
        null,
      )
    } finally {
      writer.close()
    }
  })
})

test('global catalog and exact lookup reject invalid cursors and filter every parent eligibility boundary', async () => {
  await withSavedResultProject(async ({ database, index, session, workspace }) => {
    const expected = await index.listSavedAcceptedResults(session.localRecoveryKey)
    const validCursor = {
      acceptedAt: expected[0].acceptedAt,
      layerId: expected[0].layerId,
      projectKey: expected[0].localProjectKey,
    }
    for (const bad of [
      {},
      { ...validCursor, acceptedAt: 'today' },
      { ...validCursor, layerId: 'bad-id' },
      { ...validCursor, canonicalPath: session.filePath },
    ]) {
      await assert.rejects(index.listSavedAcceptedResultsPage(bad as AcceptedResultHistoryCursor), {
        code: 'INDEX_CURSOR_INVALID',
      })
    }
    assert.equal((await index.listSavedAcceptedResultsPage(null)).totalCount, 2)
    for (const values of [
      { file_health: 'corrupt' as const },
      { file_health: 'missing' as const },
      { file_health: 'unsupported_schema' as const },
      { trashed_at: '2026-10-02T16:00:00.000Z' },
      { document_id: randomUUID() },
      { document_revision: randomUUID() },
      { file_fingerprint: null },
    ]) {
      await database.db
        .updateTable('project_index')
        .set(values)
        .where('local_project_key', '=', session.localRecoveryKey)
        .execute()
      assert.deepEqual(await index.listSavedAcceptedResultsPage(), {
        items: [],
        nextCursor: null,
        totalCount: 0,
      })
      assert.equal(
        await index.getSavedAcceptedResult(session.localRecoveryKey, expected[0].layerId),
        null,
      )
      await database.db
        .updateTable('project_index')
        .set({ trashed_at: null })
        .where('local_project_key', '=', session.localRecoveryKey)
        .execute()
      await index.indexSaved(session.filePath, workspace.id)
      assert.deepEqual((await index.listSavedAcceptedResultsPage()).items, expected)
    }
  })
})

test('catalog metadata reads the verified index snapshot without opening closed saved Project files', async () => {
  await withSavedResultProject(async ({ index, session, workspace }) => {
    const expected = await index.listSavedAcceptedResults(session.localRecoveryKey)
    await rm(session.filePath)
    assert.deepEqual((await index.listSavedAcceptedResultsPage()).items, expected)
    assert.deepEqual(
      await index.getSavedAcceptedResult(session.localRecoveryKey, expected[0].layerId),
      expected[0],
    )
    await index.scanWorkspace(workspace.id)
    assert.deepEqual(await index.listSavedAcceptedResultsPage(), {
      items: [],
      nextCursor: null,
      totalCount: 0,
    })
    assert.equal(
      await index.getSavedAcceptedResult(session.localRecoveryKey, expected[0].layerId),
      null,
    )
  })
})

test('saved result replacement follows saved owning layers and ignores unsaved document changes', async () => {
  await withSavedResultProject(async ({ database, index, session, workspace }) => {
    const projectId = session.localRecoveryKey
    const saved = session.document
    const before = await index.listSavedAcceptedResults(projectId)
    session.applyDocument({ ...saved, layers: saved.layers.slice(1), title: 'Unsaved removal' })
    await index.scanWorkspace(workspace.id)
    assert.deepEqual(await index.listSavedAcceptedResults(projectId), before)
    session.applyDocument(saved)
    assert.deepEqual(await index.listSavedAcceptedResults(projectId), before)
    session.applyDocument({ ...saved, layers: saved.layers.slice(1), title: 'Saved removal' })
    await session.save()
    await index.indexSaved(session.filePath, workspace.id)
    const after = await index.listSavedAcceptedResults(projectId)
    assert.equal(after.length, 1)
    assert.equal(after[0].layerId, saved.layers[1].id)
    assert.equal(after[0].projectTitle, 'Saved removal')
    assert.equal(after[0].documentRevision, session.document.documentRevision)
    assert.equal(
      (await database.db.selectFrom('project_accepted_result_index').selectAll().execute()).length,
      1,
    )
    await index.indexSaved(session.filePath, workspace.id)
    assert.deepEqual(await index.listSavedAcceptedResults(projectId), after)

    // Replacing a file at the same path replaces its document ownership and removes all old rows.
    const placeholders = await readProjectPlaceholders(placeholdersDir, 'empty')
    await saveIgsPackage(session.filePath, {
      assets: {},
      preview: { ...placeholders, rect: null, status: 'empty' },
      project: createEmptyProjectDocumentV1({ title: 'Replacement document' }),
    })
    await index.scanWorkspace(workspace.id)
    assert.deepEqual(await index.listSavedAcceptedResults(projectId), [])
    assert.deepEqual(
      await database.db.selectFrom('project_accepted_result_index').selectAll().execute(),
      [],
    )
  })
})

test('portable copies and repeated candidate provenance remain separate saved owning-layer identities', async () => {
  await withSavedResultProject(async ({ index, session, workspace }) => {
    const firstLayer = session.document.layers[0]
    const duplicateId = randomUUID()
    const copiedLayer = { ...firstLayer, id: duplicateId, name: 'Duplicated accepted layer' }
    session.applyDocument({
      ...session.document,
      layers: [copiedLayer, ...session.document.layers],
    })
    await session.save()
    await index.indexSaved(session.filePath, workspace.id)
    assert.equal((await index.listSavedAcceptedResults(session.localRecoveryKey)).length, 3)
    const copyPath = path.join(workspace.directoryPath, 'Copy.igs')
    await copyFile(session.filePath, copyPath)
    await index.scanWorkspace(workspace.id)
    const copyKey = localProjectRecoveryKey(copyPath)
    const source = await index.listSavedAcceptedResults(session.localRecoveryKey)
    const copied = await index.listSavedAcceptedResults(copyKey)
    assert.equal(copied.length, 3)
    assert.deepEqual(
      copied.map((row) => row.layerId),
      source.map((row) => row.layerId),
    )
    assert.ok(
      copied.every(
        (row) =>
          row.documentId === session.document.documentId &&
          row.localProjectKey !== session.localRecoveryKey,
      ),
    )
    await rename(copyPath, path.join(workspace.directoryPath, 'Moved.igs'))
    await index.scanWorkspace(workspace.id)
    assert.deepEqual(await index.listSavedAcceptedResults(copyKey), [])
    assert.equal(
      (
        await index.listSavedAcceptedResults(
          localProjectRecoveryKey(path.join(workspace.directoryPath, 'Moved.igs')),
        )
      ).length,
      3,
    )
    assert.deepEqual(await index.listSavedAcceptedResults(session.localRecoveryKey), source)
  })
})

test('unhealthy and trashed sources retain rebuildable rows but do not expose saved history', async () => {
  await withSavedResultProject(async ({ database, index, session, workspace }) => {
    const projectId = session.localRecoveryKey
    const goodBytes = await readFile(session.filePath)
    const modifiedAt = new Date('2026-01-01T00:00:00.000Z')
    await utimes(session.filePath, modifiedAt, modifiedAt)
    await index.scanWorkspace(workspace.id)
    const original = await index.listSavedAcceptedResults(projectId)
    const before = await stat(session.filePath, { bigint: true })
    const corruptBytes = Buffer.from(goodBytes)
    corruptBytes.fill(0, 0, 4) // Damage the first ZIP local file header.
    await writeFile(session.filePath, corruptBytes)
    await utimes(session.filePath, modifiedAt, modifiedAt)
    const after = await stat(session.filePath, { bigint: true })
    assert.equal(after.ino, before.ino)
    assert.equal(after.size, before.size)
    assert.equal(after.mtimeNs, before.mtimeNs)
    const [corrupt] = await index.scanWorkspace(workspace.id)
    assert.equal(corrupt.fileHealth, 'corrupt')
    assert.deepEqual(await readFile(session.filePath), corruptBytes)
    assert.deepEqual(await index.listSavedAcceptedResults(projectId), [])
    assert.equal(
      (await database.db.selectFrom('project_accepted_result_index').selectAll().execute()).length,
      2,
    )
    await writeFile(session.filePath, goodBytes)
    const [healthy] = await index.scanWorkspace(workspace.id)
    assert.equal(healthy.fileHealth, 'ready')
    assert.equal(healthy.documentRevision, session.document.documentRevision)
    assert.deepEqual(await readFile(session.filePath), goodBytes)
    const repaired = await index.listSavedAcceptedResults(projectId)
    assert.deepEqual(
      repaired.map(({ fileFingerprint: _, ...row }) => row),
      original.map(({ fileFingerprint: _, ...row }) => row),
    )
    await rm(session.filePath)
    await index.scanWorkspace(workspace.id)
    assert.deepEqual(await index.listSavedAcceptedResults(projectId), [])
    await writeFile(session.filePath, goodBytes)
    await index.scanWorkspace(workspace.id)
    assert.equal((await index.listSavedAcceptedResults(projectId)).length, 2)
    await database.db
      .updateTable('project_index')
      .set({ trashed_at: '2026-10-02T10:00:00.000Z' })
      .where('local_project_key', '=', projectId)
      .execute()
    await index.indexSaved(session.filePath, workspace.id)
    assert.deepEqual(await index.listSavedAcceptedResults(projectId), [])
    assert.ok(
      (
        await database.db
          .selectFrom('project_index')
          .select('trashed_at')
          .where('local_project_key', '=', projectId)
          .executeTakeFirstOrThrow()
      ).trashed_at,
    )
    await database.db
      .updateTable('project_index')
      .set({ document_revision: randomUUID(), trashed_at: null })
      .where('local_project_key', '=', projectId)
      .execute()
    assert.deepEqual(await index.listSavedAcceptedResults(projectId), [])
    await index.scanWorkspace(workspace.id)
    assert.equal((await index.listSavedAcceptedResults(projectId)).length, 2)
  })
})

test('deleting all derived rows is repaired from the verified saved file without changing the source', async () => {
  await withSavedResultProject(async ({ database, index, session, workspace }) => {
    const bytes = await readFile(session.filePath)
    const rows = await index.listSavedAcceptedResults(session.localRecoveryKey)
    await database.db.deleteFrom('project_accepted_result_index').execute()
    await database.db.deleteFrom('project_index').execute()
    assert.deepEqual(await index.listSavedAcceptedResults(session.localRecoveryKey), [])
    await index.scanWorkspace(workspace.id)
    assert.deepEqual(await index.listSavedAcceptedResults(session.localRecoveryKey), rows)
    assert.deepEqual(await readFile(session.filePath), bytes)
  })
})

test('durable Home witness rebuilds lost accepted rows after a database restart without opening PNG members', async (t) => {
  await withSavedResultProject(async ({ database, directory, session, workspace }) => {
    const memberReads = trackArchiveMemberReads(t)
    const projectId = session.localRecoveryKey
    const rasterPath = requireRasterLayer(session.document.layers[0]).asset.path
    const savedBytes = await readFile(session.filePath)
    const index = new ProjectIndexRepository(database.db, testValidatorIdentity)
    const [first] = await index.scanWorkspace(workspace.id)
    assert.equal(first.fileHealth, 'ready')
    assert.ok(memberReads.includes(rasterPath), 'First discovery validates actual Raster bytes.')
    const savedRows = await index.listSavedAcceptedResults(projectId)
    assert.equal(savedRows.length, 2)

    await database.db
      .deleteFrom('project_accepted_result_index')
      .where('local_project_key', '=', projectId)
      .execute()
    await database.close()

    const reopened = openAppDatabase(directory, migrations)
    try {
      const restarted = new ProjectIndexRepository(reopened.db, testValidatorIdentity)
      assert.deepEqual(await restarted.listSavedAcceptedResults(projectId), [])
      memberReads.length = 0
      const [rebuilt] = await restarted.scanWorkspace(workspace.id)
      assert.deepEqual(rebuilt, first)
      assert.deepEqual(
        [...new Set(memberReads)].sort(),
        ['manifest.json', 'mimetype', 'project.json'],
        'The actual scan reads portable metadata without opening a Raster or preview stream.',
      )
      assert.deepEqual(await restarted.listSavedAcceptedResults(projectId), savedRows)
      assert.deepEqual(await readFile(session.filePath), savedBytes)

      memberReads.length = 0
      const opened = await ProjectSession.open(session.filePath, {
        placeholdersDir,
        scratchDir: path.join(directory, 'scratch'),
      })
      assert.equal(opened.document.documentRevision, first.documentRevision)
      assert.ok(memberReads.includes(rasterPath), 'Interactive Open still validates the Raster.')
    } finally {
      await reopened.close()
    }
  })
})

test('durable Home witness parses the captured archive during a temporary workspace directory replacement', async (t) => {
  await withSavedResultProject(async ({ database, directory, session, workspace }) => {
    const projectId = session.localRecoveryKey
    const filePath = session.filePath
    const savedBytes = await readFile(filePath)
    const expectedDigest = createHash('sha256').update(savedBytes).digest('hex')
    const index = new ProjectIndexRepository(database.db, testValidatorIdentity)
    const [first] = await index.scanWorkspace(workspace.id)
    const savedRows = await index.listSavedAcceptedResults(projectId)
    assert.equal(savedRows.length, 2)

    const alternateDirectory = await mkdtemp(path.join(directory, 'alternate-workspace-'))
    const alternatePath = path.join(alternateDirectory, path.basename(filePath))
    const aside = path.join(directory, 'workspace-aside')
    await copyFile(filePath, alternatePath)
    const alternate = await ProjectSession.open(alternatePath, {
      placeholdersDir,
      scratchDir: path.join(directory, 'scratch'),
    })
    alternate.applyDocument({ ...alternate.document, layers: [], title: 'Alternate revision' })
    await alternate.save()
    const alternateBytes = await readFile(alternatePath)
    assert.notDeepEqual(alternateBytes, savedBytes)
    const originalEntry = await stat(filePath, { bigint: true })

    await database.db.deleteFrom('project_accepted_result_index').execute()
    await database.close()

    let originalMoved = false
    let replacementActive = false
    let restoredAtArchiveRead = false
    async function restoreWorkspace() {
      if (replacementActive) {
        await rename(workspace.directoryPath, alternateDirectory)
        replacementActive = false
      }
      if (originalMoved) {
        await rename(aside, workspace.directoryPath)
        originalMoved = false
      }
    }

    const contains = ProjectArchiveWitnesses.prototype.contains
    t.mock.method(
      ProjectArchiveWitnesses.prototype,
      'contains',
      async function (this: ProjectArchiveWitnesses, digest: string) {
        const known = await contains.call(this, digest)
        if (known) {
          assert.equal(digest, expectedDigest)
          await rename(workspace.directoryPath, aside)
          originalMoved = true
          await rename(alternateDirectory, workspace.directoryPath)
          replacementActive = true
        }
        return known
      },
    )
    const open = yauzl.ZipFile.prototype.openReadStreamPromise
    t.mock.method(
      yauzl.ZipFile.prototype,
      'openReadStreamPromise',
      async function (this: yauzl.ZipFile, ...args: Parameters<typeof open>) {
        if (replacementActive && args[0].fileName === 'mimetype') {
          assert.deepEqual(await readFile(filePath), alternateBytes)
          // The ZIP source is already open. Restore the path before the scan can finish.
          await restoreWorkspace()
          restoredAtArchiveRead = true
        }
        return await open.apply(this, args)
      },
    )

    const reopened = openAppDatabase(directory, migrations)
    try {
      const restarted = new ProjectIndexRepository(reopened.db, testValidatorIdentity)
      assert.deepEqual(await restarted.listSavedAcceptedResults(projectId), [])
      const [rebuilt] = await restarted.scanWorkspace(workspace.id)
      assert.ok(restoredAtArchiveRead, 'The on-disk pathname changed after the witness lookup.')
      assert.deepEqual(rebuilt, first)
      assert.deepEqual(await restarted.listSavedAcceptedResults(projectId), savedRows)
      assert.deepEqual(await readFile(filePath), savedBytes)
      assert.deepEqual(await readFile(alternatePath), alternateBytes)
      const restoredEntry = await stat(filePath, { bigint: true })
      assert.equal(restoredEntry.ino, originalEntry.ino)
      assert.equal(restoredEntry.ctimeNs, originalEntry.ctimeNs)
    } finally {
      await restoreWorkspace()
      await reopened.close()
    }
  })
})

test('durable Home witness refuses a same-size Raster rewrite with the original inode and mtime', async (t) => {
  await withSavedResultProject(async ({ database, directory, session, workspace }) => {
    const projectId = session.localRecoveryKey
    const filePath = session.filePath
    const rasterPath = requireRasterLayer(session.document.layers[0]).asset.path
    const originalTime = new Date('2026-01-01T00:00:00.000Z')
    await utimes(filePath, originalTime, originalTime)
    const index = new ProjectIndexRepository(database.db, testValidatorIdentity)
    const [first] = await index.scanWorkspace(workspace.id)
    assert.equal(first.fileHealth, 'ready')
    const savedRows = await index.listSavedAcceptedResults(projectId)
    assert.equal(savedRows.length, 2)
    const before = await stat(filePath, { bigint: true })
    const savedBytes = await readFile(filePath)
    const rasterBytes = await (await readIgsPackage(filePath)).readMember(rasterPath)
    const corrupted = Buffer.from(savedBytes)
    // Project Save stores assets uncompressed. Change a Raster body and preserve the ZIP headers.
    const rasterOffset = corrupted.indexOf(rasterBytes)
    assert.ok(rasterOffset > 0)
    assert.equal(corrupted[rasterOffset], 0x89)
    corrupted[rasterOffset] = 0

    await database.close()
    await writeFile(filePath, corrupted)
    await utimes(filePath, originalTime, originalTime)
    const after = await stat(filePath, { bigint: true })
    assert.equal(after.ino, before.ino)
    assert.equal(after.size, before.size)
    assert.equal(after.mtimeNs, before.mtimeNs)

    const memberReads = trackArchiveMemberReads(t)
    const reopened = openAppDatabase(directory, migrations)
    try {
      const restarted = new ProjectIndexRepository(reopened.db, testValidatorIdentity)
      const [broken] = await restarted.scanWorkspace(workspace.id)
      assert.equal(broken.fileHealth, 'corrupt')
      assert.ok(memberReads.some((name) => name.startsWith('assets/layers/')))
      assert.deepEqual(await restarted.listSavedAcceptedResults(projectId), [])
      assert.deepEqual(await readFile(filePath), corrupted)
    } finally {
      await reopened.close()
    }

    await writeFile(filePath, savedBytes)
    const repairedDb = openAppDatabase(directory, migrations)
    try {
      const repaired = new ProjectIndexRepository(repairedDb.db, testValidatorIdentity)
      const [record] = await repaired.scanWorkspace(workspace.id)
      assert.equal(record.fileHealth, 'ready')
      assert.equal(record.documentRevision, first.documentRevision)
      assert.deepEqual(
        await repaired.listSavedAcceptedResults(projectId),
        savedRows.map((row) => ({ ...row, fileFingerprint: record.fileFingerprint })),
      )
      assert.deepEqual(await readFile(filePath), savedBytes)
    } finally {
      await repairedDb.close()
    }
  })
})

for (const [label, invalidValue] of [
  [
    'another validator identity',
    (digest: string) => JSON.stringify({ sha256: [digest], validator: 'b'.repeat(64) }),
  ],
  ['malformed JSON', () => '{'],
] as const) {
  test(`durable Home witness falls back to full PNG validation for ${label}`, async (t) => {
    await withSavedResultProject(async ({ database, directory, session, workspace }) => {
      const projectId = session.localRecoveryKey
      const savedBytes = await readFile(session.filePath)
      const rasterPath = requireRasterLayer(session.document.layers[0]).asset.path
      const index = new ProjectIndexRepository(database.db, testValidatorIdentity)
      await index.scanWorkspace(workspace.id)
      const savedRows = await index.listSavedAcceptedResults(projectId)
      assert.equal(savedRows.length, 2)
      const digest = createHash('sha256').update(savedBytes).digest('hex')
      const { numUpdatedRows } = await database.db
        .updateTable('app_metadata')
        .set({ value: invalidValue(digest) })
        .where('key', '=', durableWitnessKey)
        .executeTakeFirst()
      assert.equal(numUpdatedRows, 1n, 'The first scan persisted a witness to replace.')
      await database.close()

      const memberReads = trackArchiveMemberReads(t)
      const reopened = openAppDatabase(directory, migrations)
      try {
        const restarted = new ProjectIndexRepository(reopened.db, testValidatorIdentity)
        const [revalidated] = await restarted.scanWorkspace(workspace.id)
        assert.equal(revalidated.fileHealth, 'ready')
        assert.ok(memberReads.includes(rasterPath), 'The actual parser opened the Raster stream.')
        assert.deepEqual(await restarted.listSavedAcceptedResults(projectId), savedRows)
        assert.deepEqual(await readFile(session.filePath), savedBytes)
      } finally {
        await reopened.close()
      }
    })
  })
}

test('failed derived row insertion rolls back the Home revision and every saved-history replacement', async () => {
  await withSavedResultProject(async ({ database, index, session, workspace }) => {
    const beforeParent = await index.getProject(session.localRecoveryKey)
    const beforeRows = await index.listSavedAcceptedResults(session.localRecoveryKey)
    const baseLayer = session.document.layers[0]
    const manyLayers = Array.from({ length: 101 }, (_, position) => ({
      ...baseLayer,
      id: randomUUID(),
      name: `Accepted chunk ${position}`,
    }))
    session.applyDocument({
      ...session.document,
      layers: manyLayers,
      title: 'Saved despite index failure',
    })
    await session.save()
    // One insertion batch succeeds before the next statement fails; no earlier rows may escape.
    await sql
      .raw(
        `CREATE TRIGGER reject_saved_result_insert BEFORE INSERT ON project_accepted_result_index
      WHEN NEW.layer_id = '${manyLayers[100].id}'
      BEGIN SELECT RAISE(ABORT, 'injected saved result index failure'); END`,
      )
      .execute(database.db)
    await assert.rejects(
      index.indexSaved(session.filePath, workspace.id),
      /injected saved result index failure/,
    )
    assert.deepEqual(await index.getProject(session.localRecoveryKey), beforeParent)
    assert.deepEqual(await index.listSavedAcceptedResults(session.localRecoveryKey), beforeRows)
    assert.equal(
      (await readIgsPackage(session.filePath)).project.title,
      'Saved despite index failure',
    )
    await sql`DROP TRIGGER reject_saved_result_insert`.execute(database.db)
    await index.scanWorkspace(workspace.id)
    const repaired = await index.listSavedAcceptedResults(session.localRecoveryKey)
    assert.equal(repaired.length, 101)
    assert.deepEqual(
      repaired.map((row) => row.layerId),
      manyLayers.map((layer) => layer.id).sort(),
    )
    assert.ok(
      repaired.every(
        (row) =>
          row.projectTitle === 'Saved despite index failure' &&
          row.documentRevision === session.document.documentRevision,
      ),
    )
  })
})

test('a lost application database rebuilds saved accepted history solely from portable workspace files', async () => {
  await withSavedResultProject(async ({ database, directory, index, session, workspace }) => {
    const savedBytes = await readFile(session.filePath)
    const rows = await index.listSavedAcceptedResults(session.localRecoveryKey)
    await database.close()
    await rm(path.join(directory, 'database'), { force: true, recursive: true })
    const rebuiltDatabase = openAppDatabase(directory, migrations)
    try {
      const rebuiltIndex = new ProjectIndexRepository(rebuiltDatabase.db)
      await rebuiltIndex.ensureDefaultWorkspace(directory)
      assert.deepEqual(await rebuiltIndex.listSavedAcceptedResults(session.localRecoveryKey), [])
      await rebuiltIndex.scanWorkspace(workspace.id)
      assert.deepEqual(await rebuiltIndex.listSavedAcceptedResults(session.localRecoveryKey), rows)
      assert.deepEqual(await readFile(session.filePath), savedBytes)
    } finally {
      await rebuiltDatabase.close()
    }
  })
})

test('a lost Home index rebuilds from a saved .igs in the same workspace and its preview metadata', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'igs-index-'))
  try {
    const firstDb = openAppDatabase(directory, migrations)
    const firstIndex = new ProjectIndexRepository(firstDb.db)
    const workspace = await firstIndex.ensureDefaultWorkspace(directory)
    const filePath = path.join(workspace.directoryPath, 'My Project.igs')
    const session = await ProjectSession.create(filePath, 'A portable Project', {
      placeholdersDir,
      scratchDir: path.join(directory, 'scratch'),
    })
    session.applyDocument({ ...session.document, title: 'Renamed Project' })
    await session.save()
    const indexed = await firstIndex.indexSaved(filePath, workspace.id)
    assert.equal(indexed.displayName, 'Renamed Project')
    assert.equal(indexed.previewStatus, 'empty')
    const saved = await readIgsPackage(filePath)
    const thumbnailSha256 = createHash('sha256')
      .update(await saved.readMember('preview/thumbnail.webp'))
      .digest('hex')
    assert.equal(indexed.thumbnailSha256, thumbnailSha256)
    assert.ok(indexed.fileFingerprint)
    assert.equal(
      (await firstIndex.getProject(indexed.localProjectKey))?.thumbnailSha256,
      thumbnailSha256,
    )
    assert.equal(await firstIndex.getProject(`project-v1-${'0'.repeat(64)}`), null)
    assert.equal(indexed.documentRevision, session.document.documentRevision)
    await firstIndex.markOpened(session.filePath)
    assert.ok((await firstIndex.indexSaved(filePath, workspace.id)).lastOpenedAt)
    await firstDb.close()

    await rm(path.join(directory, 'database'), { force: true, recursive: true })
    const rebuiltDb = openAppDatabase(directory, migrations)
    try {
      const rebuilt = new ProjectIndexRepository(rebuiltDb.db)
      await rebuilt.ensureDefaultWorkspace(directory)
      const rows = await rebuilt.scanWorkspace(UNCATEGORIZED_WORKSPACE_ID)
      assert.equal(rows.length, 1)
      assert.equal(rows[0].fileHealth, 'ready')
      assert.equal(rows[0].documentId, session.document.documentId)
      assert.equal(rows[0].documentRevision, session.document.documentRevision)
      assert.equal(rows[0].previewStatus, 'empty')
      assert.equal(rows[0].thumbnailSha256, thumbnailSha256)
      assert.ok(rows[0].fileFingerprint)
      assert.deepEqual([rows[0].bboxWidth, rows[0].bboxHeight], [1024, 1024])
    } finally {
      await rebuiltDb.close()
    }
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
})

test('thumbnail migration preserves an existing v3 Home row and rescan fills derived preview identity', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'igs-index-migrate-'))
  try {
    const legacyMigrations = path.join(directory, 'legacy-migrations')
    await mkdir(legacyMigrations)
    for (const name of ['0001_app_metadata.sql', '0002_models.sql', '0003_projects.sql']) {
      await copyFile(path.join(migrations, name), path.join(legacyMigrations, name))
    }
    const legacy = openAppDatabase(directory, legacyMigrations)
    await legacy.close()

    const workspacePath = path.join(directory, 'workspaces', 'Uncategorized')
    await mkdir(workspacePath, { recursive: true })
    const filePath = path.join(workspacePath, 'Legacy Project.igs')
    const session = await ProjectSession.create(filePath, 'Legacy Project', {
      placeholdersDir,
      scratchDir: path.join(directory, 'scratch'),
    })
    const file = await stat(filePath, { bigint: true })
    const projectId = localProjectRecoveryKey(filePath)
    const openedAt = '2025-01-02T03:04:05.000Z'
    const sqlite = new Database(path.join(directory, 'database', 'app.sqlite'))
    try {
      sqlite
        .prepare(
          `INSERT INTO project_workspace
           (id, display_name, directory_path, color, is_default, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run('uncategorized', 'Uncategorized', workspacePath, 'teal', 1, openedAt, openedAt)
      sqlite
        .prepare(
          `INSERT INTO project_index
           (local_project_key, canonical_path, workspace_id, document_id, document_revision,
            display_name, search_name, bbox_width, bbox_height, preview_status, file_health,
            diagnostic_code, file_size_bytes, file_mtime_ns, last_opened_at, trashed_at, indexed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          projectId,
          filePath,
          'uncategorized',
          session.document.documentId,
          session.document.documentRevision,
          session.document.title,
          'legacy project',
          session.document.primaryBbox.width,
          session.document.primaryBbox.height,
          'empty',
          'ready',
          null,
          Number(file.size),
          file.mtimeNs.toString(),
          openedAt,
          null,
          openedAt,
        )
    } finally {
      sqlite.close()
    }

    const upgraded = await initializeAppDatabase(directory, migrations)
    try {
      const index = new ProjectIndexRepository(upgraded.db)
      const before = await index.getProject(projectId)
      assert.equal(before?.thumbnailSha256, null)
      assert.equal(before?.fileFingerprint, null)
      assert.equal(before?.lastOpenedAt, openedAt)
      const [after] = await index.scanWorkspace('uncategorized')
      assert.equal(after.localProjectKey, projectId)
      assert.ok(after.thumbnailSha256)
      assert.ok(after.fileFingerprint)
      assert.equal(after.lastOpenedAt, openedAt)
    } finally {
      await upgraded.close()
    }
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
})

test('Home rescan diagnoses corrupt and missing files without inventing Project content', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'igs-index-health-'))
  const database = openAppDatabase(directory, migrations)
  try {
    const index = new ProjectIndexRepository(database.db)
    const workspace = await index.ensureDefaultWorkspace(directory)
    const invalidPath = path.join(workspace.directoryPath, 'Broken.igs')
    await writeFile(invalidPath, Buffer.from('not a zip package'))
    const corrupt = await index.scanWorkspace(workspace.id)
    assert.equal(corrupt.length, 1)
    assert.equal(corrupt[0].fileHealth, 'corrupt')
    assert.equal(corrupt[0].documentId, null)
    assert.equal(corrupt[0].previewStatus, null)
    assert.equal(corrupt[0].thumbnailSha256, null)
    assert.equal(corrupt[0].fileFingerprint, null)
    await rm(invalidPath)
    const missing = await index.scanWorkspace(workspace.id)
    assert.equal(missing.length, 1)
    assert.equal(missing[0].fileHealth, 'missing')
    assert.equal(missing[0].diagnosticCode, 'FILE_MISSING')
    assert.equal(missing[0].thumbnailSha256, null)
    assert.equal(missing[0].fileFingerprint, null)
  } finally {
    await database.close()
    await rm(directory, { force: true, recursive: true })
  }
})

test('a project cannot be indexed under a workspace containing a different file path', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'igs-index-scope-'))
  const database = openAppDatabase(directory, migrations)
  try {
    const index = new ProjectIndexRepository(database.db)
    const workspace = await index.ensureDefaultWorkspace(directory)
    const externalPath = path.join(directory, 'outside.igs')
    await ProjectSession.create(externalPath, 'Outside', {
      placeholdersDir,
      scratchDir: path.join(directory, 'scratch'),
    })
    await assert.rejects(index.indexSaved(externalPath, workspace.id), {
      code: 'INDEX_OUTSIDE_WORKSPACE',
    })
    assert.deepEqual(await index.listProjects(), [])
  } finally {
    await database.close()
    await rm(directory, { force: true, recursive: true })
  }
})

test('rescan does not mark a Project created after the directory snapshot as missing', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'igs-index-race-'))
  const database = openAppDatabase(directory, migrations)
  try {
    const base = new ProjectIndexRepository(database.db)
    const workspace = await base.ensureDefaultWorkspace(directory)
    await ProjectSession.create(path.join(workspace.directoryPath, 'First.igs'), 'First', {
      placeholdersDir,
      scratchDir: path.join(directory, 'scratch'),
    })
    class ConcurrentCreateIndex extends ProjectIndexRepository {
      private inserted = false

      override async indexSaved(filePath: string, workspaceId: string) {
        const result = await super.indexSaved(filePath, workspaceId)
        if (!this.inserted) {
          this.inserted = true
          const second = await ProjectSession.create(
            path.join(workspace.directoryPath, 'Second.igs'),
            'Second',
            { placeholdersDir, scratchDir: path.join(directory, 'scratch') },
          )
          await super.indexSaved(second.filePath, workspaceId)
        }
        return result
      }
    }
    const rows = await new ConcurrentCreateIndex(database.db).scanWorkspace(workspace.id)
    assert.deepEqual(
      rows.map((row) => [row.displayName, row.fileHealth]),
      [
        ['First', 'ready'],
        ['Second', 'ready'],
      ],
    )
  } finally {
    await database.close()
    await rm(directory, { force: true, recursive: true })
  }
})

test('a file removed after readdir becomes missing without aborting the workspace scan', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'igs-index-vanished-'))
  const database = openAppDatabase(directory, migrations)
  try {
    const base = new ProjectIndexRepository(database.db)
    const workspace = await base.ensureDefaultWorkspace(directory)
    const filePath = path.join(workspace.directoryPath, 'Transient.igs')
    await ProjectSession.create(filePath, 'Transient', {
      placeholdersDir,
      scratchDir: path.join(directory, 'scratch'),
    })
    await base.indexSaved(filePath, workspace.id)
    class FileVanishedDuringScan extends ProjectIndexRepository {
      override async indexSaved(pathToCheck: string, workspaceId: string) {
        await rm(pathToCheck)
        return await super.indexSaved(pathToCheck, workspaceId)
      }
    }
    const rows = await new FileVanishedDuringScan(database.db).scanWorkspace(workspace.id)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].fileHealth, 'missing')
    assert.equal(rows[0].diagnosticCode, 'FILE_MISSING')
  } finally {
    await database.close()
    await rm(directory, { force: true, recursive: true })
  }
})

test('a transient atomic replacement during scan is not reported as Project corruption', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'igs-index-transient-'))
  const database = openAppDatabase(directory, migrations)
  try {
    const base = new ProjectIndexRepository(database.db)
    const workspace = await base.ensureDefaultWorkspace(directory)
    const session = await ProjectSession.create(
      path.join(workspace.directoryPath, 'Working.igs'),
      'Working',
      { placeholdersDir, scratchDir: path.join(directory, 'scratch') },
    )
    await base.indexSaved(session.filePath, workspace.id)
    class InterruptedScan extends ProjectIndexRepository {
      override async indexSaved(): Promise<never> {
        throw new ProjectIndexError('INDEX_FILE_CHANGED', 'Injected concurrent Save.')
      }
    }
    const rows = await new InterruptedScan(database.db).scanWorkspace(workspace.id)
    assert.equal(rows[0].fileHealth, 'ready')
    assert.equal(rows[0].diagnosticCode, null)
  } finally {
    await database.close()
    await rm(directory, { force: true, recursive: true })
  }
})

test('a concurrent Save after a missing-file observation keeps the rebuilt index healthy', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'igs-index-recreated-'))
  const database = openAppDatabase(directory, migrations)
  try {
    const base = new ProjectIndexRepository(database.db)
    const workspace = await base.ensureDefaultWorkspace(directory)
    const filePath = path.join(workspace.directoryPath, 'Working.igs')
    await ProjectSession.create(filePath, 'Original', {
      placeholdersDir,
      scratchDir: path.join(directory, 'scratch'),
    })
    await base.indexSaved(filePath, workspace.id)
    await rm(filePath)
    class RecreatedDuringScan extends ProjectIndexRepository {
      override async indexUnhealthy(pathToCheck: string, workspaceId: string, code: string) {
        assert.equal(code, 'FILE_MISSING')
        await ProjectSession.create(pathToCheck, 'Replacement', {
          placeholdersDir,
          scratchDir: path.join(directory, 'scratch'),
        })
        await super.indexSaved(pathToCheck, workspaceId)
        await super.indexUnhealthy(pathToCheck, workspaceId, code)
      }
    }
    const rows = await new RecreatedDuringScan(database.db).scanWorkspace(workspace.id)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].displayName, 'Replacement')
    assert.equal(rows[0].fileHealth, 'ready')
    assert.equal(rows[0].diagnosticCode, null)
  } finally {
    await database.close()
    await rm(directory, { force: true, recursive: true })
  }
})

test('a repaired package after a corrupt-file observation is not indexed as corrupt', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'igs-index-repaired-'))
  const database = openAppDatabase(directory, migrations)
  try {
    const base = new ProjectIndexRepository(database.db)
    const workspace = await base.ensureDefaultWorkspace(directory)
    const filePath = path.join(workspace.directoryPath, 'Working.igs')
    await ProjectSession.create(filePath, 'Original', {
      placeholdersDir,
      scratchDir: path.join(directory, 'scratch'),
    })
    await base.indexSaved(filePath, workspace.id)
    await writeFile(filePath, Buffer.from('broken ZIP'))
    class RepairedDuringScan extends ProjectIndexRepository {
      override async indexUnhealthy(pathToCheck: string, workspaceId: string, code: string) {
        assert.notEqual(code, 'FILE_MISSING')
        await rm(pathToCheck)
        await ProjectSession.create(pathToCheck, 'Repaired', {
          placeholdersDir,
          scratchDir: path.join(directory, 'scratch'),
        })
        await super.indexSaved(pathToCheck, workspaceId)
        await super.indexUnhealthy(pathToCheck, workspaceId, code)
      }
    }
    const rows = await new RepairedDuringScan(database.db).scanWorkspace(workspace.id)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].displayName, 'Repaired')
    assert.equal(rows[0].fileHealth, 'ready')
    assert.equal(rows[0].diagnosticCode, null)
  } finally {
    await database.close()
    await rm(directory, { force: true, recursive: true })
  }
})

test('a missing workspace reports a recoverable workspace error and preserves index rows', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'igs-index-workspace-missing-'))
  const database = openAppDatabase(directory, migrations)
  try {
    const index = new ProjectIndexRepository(database.db)
    const workspace = await index.ensureDefaultWorkspace(directory)
    const filePath = path.join(workspace.directoryPath, 'Working.igs')
    await ProjectSession.create(filePath, 'Working', {
      placeholdersDir,
      scratchDir: path.join(directory, 'scratch'),
    })
    await index.indexSaved(filePath, workspace.id)
    await rename(workspace.directoryPath, `${workspace.directoryPath}-offline`)
    await assert.rejects(index.scanWorkspace(workspace.id), { code: 'WORKSPACE_UNAVAILABLE' })
    const rows = await index.listProjects(workspace.id)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].fileHealth, 'ready')
  } finally {
    await database.close()
    await rm(directory, { force: true, recursive: true })
  }
})

test('a workspace replaced by a symlink cannot index an external Project', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'igs-index-symlink-'))
  const database = openAppDatabase(directory, migrations)
  try {
    const index = new ProjectIndexRepository(database.db)
    const workspace = await index.ensureDefaultWorkspace(directory)
    const outside = path.join(directory, 'outside')
    await mkdir(outside)
    await ProjectSession.create(path.join(outside, 'External.igs'), 'External', {
      placeholdersDir,
      scratchDir: path.join(directory, 'scratch'),
    })
    await rename(workspace.directoryPath, `${workspace.directoryPath}-old`)
    await symlink(outside, workspace.directoryPath, 'dir')
    await assert.rejects(index.scanWorkspace(workspace.id), { code: 'WORKSPACE_UNAVAILABLE' })
    assert.deepEqual(await index.listProjects(), [])
  } finally {
    await database.close()
    await rm(directory, { force: true, recursive: true })
  }
})
