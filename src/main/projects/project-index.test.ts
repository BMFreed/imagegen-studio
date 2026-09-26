import Database from 'better-sqlite3'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { copyFile, mkdir, mkdtemp, rename, rm, stat, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { openAppDatabase } from '../db/database.js'
import { readIgsPackage } from './igs-package.js'
import { localProjectRecoveryKey } from './project-identity.js'
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

    const upgraded = openAppDatabase(directory, migrations)
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
