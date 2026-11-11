import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, unlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { openAppDatabase } from '../db/database.js'
import { canonicalHomeTimestamp, fileMtimeToHomeTimestamp } from './project-home-metadata.js'
import { ProjectIndexRepository } from './project-index.js'
import { ProjectSession } from './project-session.js'

test('Home timestamp normalization accepts finite stored dates and leaves absent or invalid values unknown', () => {
  assert.equal(canonicalHomeTimestamp('2026-11-11T15:30:45+03:00'), '2026-11-11T12:30:45.000Z')
  assert.equal(canonicalHomeTimestamp('1969-12-31T23:59:59.999Z'), '1969-12-31T23:59:59.999Z')
  assert.equal(canonicalHomeTimestamp('+275760-09-13T00:00:00.000Z'), '+275760-09-13T00:00:00.000Z')
  for (const value of [
    undefined,
    null,
    false,
    0,
    {},
    '',
    'not-a-date',
    'Infinity',
    '2026'.repeat(33),
    '+275760-09-14T00:00:00.000Z',
  ]) {
    assert.equal(canonicalHomeTimestamp(value), null)
  }
})

test('filesystem nanoseconds project deterministically to truncated finite Home milliseconds', () => {
  assert.equal(fileMtimeToHomeTimestamp('0'), '1970-01-01T00:00:00.000Z')
  assert.equal(fileMtimeToHomeTimestamp('1735689600123456789'), '2025-01-01T00:00:00.123Z')
  assert.equal(fileMtimeToHomeTimestamp('-1000001'), '1969-12-31T23:59:59.999Z')
  assert.equal(fileMtimeToHomeTimestamp('-999999'), '1970-01-01T00:00:00.000Z')
  assert.equal(fileMtimeToHomeTimestamp('8640000000000000000000'), '+275760-09-13T00:00:00.000Z')
  assert.equal(fileMtimeToHomeTimestamp('-8640000000000000000000'), '-271821-04-20T00:00:00.000Z')
  for (const value of [
    null,
    undefined,
    '',
    'not-time',
    ' 1000000 ',
    '+1000000',
    '1.5',
    '1e6',
    'Infinity',
    '8640000000000001000000',
    '-8640000000000001000000',
    '1'.repeat(23),
  ]) {
    assert.equal(fileMtimeToHomeTimestamp(value), null)
  }
})

test('Home modified-time metadata is one read-only SQLite projection with optional workspace scope', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'igs-home-metadata-'))
  const database = openAppDatabase(directory, path.resolve('src/main/db/migrations'))
  try {
    const repository = new ProjectIndexRepository(database.db)
    const workspace = await repository.ensureDefaultWorkspace(directory)
    const foreignDirectory = path.join(directory, 'foreign-workspace')
    await mkdir(foreignDirectory)
    const foreignWorkspace = await repository.addWorkspace(
      { color: 'blue', displayName: 'Other workspace' },
      foreignDirectory,
    )
    const roots = {
      placeholdersDir: path.resolve('src/main/projects/placeholders'),
      scratchDir: path.join(directory, 'scratch'),
    }
    const a = await ProjectSession.create(path.join(workspace.directoryPath, 'A.igs'), 'A', roots)
    const missing = await ProjectSession.create(
      path.join(workspace.directoryPath, 'Missing.igs'),
      'Missing',
      roots,
    )
    const invalid = await ProjectSession.create(
      path.join(workspace.directoryPath, 'Invalid metadata.igs'),
      'Invalid metadata',
      roots,
    )
    const foreign = await ProjectSession.create(
      path.join(foreignDirectory, 'Foreign.igs'),
      'Foreign',
      roots,
    )
    for (const session of [a, missing, invalid]) {
      await repository.indexSaved(session.filePath, workspace.id)
    }
    await repository.indexSaved(foreign.filePath, foreignWorkspace.id)
    await unlink(missing.filePath)
    await repository.scanWorkspace(workspace.id)
    await database.db
      .updateTable('project_index')
      .set({ file_mtime_ns: '1735689600123456789' })
      .where('local_project_key', '=', a.localRecoveryKey)
      .execute()
    await database.db
      .updateTable('project_index')
      .set({ file_mtime_ns: 'not-time' })
      .where('local_project_key', '=', invalid.localRecoveryKey)
      .execute()
    await database.db
      .updateTable('project_index')
      .set({ file_mtime_ns: '-1000001' })
      .where('local_project_key', '=', foreign.localRecoveryKey)
      .execute()
    const beforeRows = await database.db
      .selectFrom('project_index')
      .selectAll()
      .orderBy('local_project_key')
      .execute()
    const beforeSchema = await database.db.selectFrom('schema_migrations').selectAll().execute()
    const beforeA = await readFile(a.filePath)
    const beforeForeign = await readFile(foreign.filePath)
    const statements: string[] = []
    const projection = new ProjectIndexRepository(
      database.db.withPlugin({
        transformQuery({ node }) {
          statements.push(node.kind)
          return node
        },
        async transformResult({ result }) {
          return result
        },
      }),
    )
    const all = await projection.listProjectModifiedTimes()
    assert.equal(
      statements.length,
      1,
      'The full metadata projection must not issue per-Project reads',
    )
    assert.equal(all.size, 4)
    assert.equal(all.get(a.localRecoveryKey), '2025-01-01T00:00:00.123Z')
    assert.equal(all.get(missing.localRecoveryKey), null)
    assert.equal(all.get(invalid.localRecoveryKey), null)
    assert.equal(all.get(foreign.localRecoveryKey), '1969-12-31T23:59:59.999Z')
    const selected = await projection.listProjectModifiedTimes(workspace.id)
    assert.equal(statements.length, 2)
    assert.deepEqual(
      [...selected.keys()].sort(),
      [a.localRecoveryKey, missing.localRecoveryKey, invalid.localRecoveryKey].sort(),
    )
    assert.deepEqual(
      await projection.listProjectModifiedTimes(foreignWorkspace.id),
      new Map([[foreign.localRecoveryKey, '1969-12-31T23:59:59.999Z']]),
    )
    assert.equal(statements.length, 3)
    assert.deepEqual(
      await database.db
        .selectFrom('project_index')
        .selectAll()
        .orderBy('local_project_key')
        .execute(),
      beforeRows,
    )
    assert.deepEqual(
      await database.db.selectFrom('schema_migrations').selectAll().execute(),
      beforeSchema,
    )
    assert.deepEqual(await readFile(a.filePath), beforeA)
    assert.deepEqual(await readFile(foreign.filePath), beforeForeign)
  } finally {
    await database.close()
    await rm(directory, { force: true, recursive: true })
  }
})
