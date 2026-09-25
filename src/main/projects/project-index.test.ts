import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rename, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { openAppDatabase } from '../db/database.js'
import {
  ProjectIndexError,
  ProjectIndexRepository,
  UNCATEGORIZED_WORKSPACE_ID,
} from './project-index.js'
import { ProjectSession } from './project-session.js'

const migrations = path.resolve('src/main/db/migrations')
const placeholdersDir = path.resolve('src/main/projects/placeholders')

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
      assert.deepEqual([rows[0].bboxWidth, rows[0].bboxHeight], [1024, 1024])
    } finally {
      await rebuiltDb.close()
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
    await rm(invalidPath)
    const missing = await index.scanWorkspace(workspace.id)
    assert.equal(missing.length, 1)
    assert.equal(missing[0].fileHealth, 'missing')
    assert.equal(missing[0].diagnosticCode, 'FILE_MISSING')
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
