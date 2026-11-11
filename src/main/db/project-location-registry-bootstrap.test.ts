import Database from 'better-sqlite3'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  localProjectRecoveryKey,
  rawPathDerivedProjectRecoveryKey,
} from '../projects/project-identity.js'
import { refreshProjectLocationRegistry } from '../projects/project-location-registry.js'
import { openAppDatabase } from './database.js'

const migrations = path.resolve('src/main/db/migrations')
const temporaryRoot = () => mkdtemp(path.join(os.tmpdir(), 'igs-location-bootstrap-'))

test('database bootstrap loads moved locations before returning and last close releases their snapshot', async () => {
  const root = await temporaryRoot()
  const original = path.join(root, 'original.igs')
  const moved = path.join(root, 'moved.igs')
  const key = rawPathDerivedProjectRecoveryKey(original)
  let owner: ReturnType<typeof openAppDatabase> | undefined
  try {
    owner = openAppDatabase(root, migrations)
    await owner.db
      .insertInto('project_identity_binding')
      .values({ canonical_path: moved, document_id: randomUUID(), local_project_key: key })
      .execute()
    refreshProjectLocationRegistry(owner.db)
    assert.equal(localProjectRecoveryKey(moved), key)
    await owner.close()
    await owner.close()
    assert.equal(localProjectRecoveryKey(moved), rawPathDerivedProjectRecoveryKey(moved))
    owner = openAppDatabase(root, migrations)
    assert.equal(localProjectRecoveryKey(moved), key)
    assert.throws(() => localProjectRecoveryKey(original), { code: 'PROJECT_PATH_UNAVAILABLE' })
  } finally {
    await owner?.close()
    await rm(root, { force: true, recursive: true })
  }
})

test('secondary database close preserves shared locations and the remaining raw owner can refresh after a commit', async () => {
  const root = await temporaryRoot()
  const old = path.join(root, 'old.igs')
  const moved = path.join(root, 'moved.igs')
  const again = path.join(root, 'again.igs')
  const key = rawPathDerivedProjectRecoveryKey(old)
  const first = openAppDatabase(root, migrations)
  let second: ReturnType<typeof openAppDatabase> | undefined
  try {
    await first.db
      .insertInto('project_identity_binding')
      .values({ canonical_path: moved, document_id: randomUUID(), local_project_key: key })
      .execute()
    refreshProjectLocationRegistry(first.db)
    second = openAppDatabase(root, migrations)
    await second.close()
    assert.equal(localProjectRecoveryKey(moved), key)
    await first.db
      .updateTable('project_identity_binding')
      .set({ canonical_path: again })
      .where('local_project_key', '=', key)
      .execute()
    refreshProjectLocationRegistry(first.db)
    assert.equal(localProjectRecoveryKey(again), key)
    second = openAppDatabase(root, migrations)
    await first.close()
    assert.equal(localProjectRecoveryKey(again), key)
    await second.db
      .updateTable('project_identity_binding')
      .set({ canonical_path: moved })
      .where('local_project_key', '=', key)
      .execute()
    refreshProjectLocationRegistry(second.db)
    assert.equal(localProjectRecoveryKey(moved), key)
    await second.close()
    assert.equal(localProjectRecoveryKey(moved), rawPathDerivedProjectRecoveryKey(moved))
  } finally {
    await second?.close()
    await first.close()
    await rm(root, { force: true, recursive: true })
  }
})

test('conflicting bootstrap refuses the new owner and preserves the already active database snapshot', async () => {
  const firstRoot = await temporaryRoot()
  const secondRoot = await temporaryRoot()
  const original = path.join(firstRoot, 'original.igs')
  const firstPath = path.join(firstRoot, 'first.igs')
  const secondPath = path.join(firstRoot, 'second.igs')
  const key = rawPathDerivedProjectRecoveryKey(original)
  const documentId = randomUUID()
  const first = openAppDatabase(firstRoot, migrations)
  let second: ReturnType<typeof openAppDatabase> | undefined
  try {
    await first.db
      .insertInto('project_identity_binding')
      .values({ canonical_path: firstPath, document_id: documentId, local_project_key: key })
      .execute()
    refreshProjectLocationRegistry(first.db)
    second = openAppDatabase(secondRoot, migrations)
    // Prepare an independently committed conflicting profile while its published snapshot is empty.
    await second.db
      .insertInto('project_identity_binding')
      .values({ canonical_path: secondPath, document_id: documentId, local_project_key: key })
      .execute()
    await second.close()
    assert.throws(() => openAppDatabase(secondRoot, migrations), {
      code: 'PROJECT_PATH_UNAVAILABLE',
    })
    assert.equal(localProjectRecoveryKey(firstPath), key)
    assert.equal(localProjectRecoveryKey(secondPath), rawPathDerivedProjectRecoveryKey(secondPath))
  } finally {
    await second?.close()
    await first.close()
    await rm(firstRoot, { force: true, recursive: true })
    await rm(secondRoot, { force: true, recursive: true })
  }
})

test('historical migration checkout through0027 bootstraps without an identity table or changed path hashes', async () => {
  const root = await temporaryRoot()
  const migrationDirectory = path.join(root, 'legacy-migrations')
  await mkdir(migrationDirectory)
  let owner: ReturnType<typeof openAppDatabase> | undefined
  try {
    for (const name of await readdir(migrations)) {
      if (/^\d{4}_/.test(name) && Number(name.slice(0, 4)) <= 27) {
        await copyFile(path.join(migrations, name), path.join(migrationDirectory, name))
      }
    }
    owner = openAppDatabase(root, migrationDirectory)
    const file = path.join(root, 'legacy.igs')
    assert.equal(localProjectRecoveryKey(file), rawPathDerivedProjectRecoveryKey(file))
    refreshProjectLocationRegistry(owner.db)
    assert.equal(localProjectRecoveryKey(file), rawPathDerivedProjectRecoveryKey(file))
  } finally {
    await owner?.close()
    await rm(root, { force: true, recursive: true })
  }
})

test('corrupt persisted identity is rejected during bootstrap before any lookup owner is published', async () => {
  const root = await temporaryRoot()
  const owner = openAppDatabase(root, migrations)
  const file = path.join(root, 'invalid.igs')
  const rawKey = rawPathDerivedProjectRecoveryKey(file)
  try {
    await owner.close()
    const sqlite = new Database(owner.filePath, { fileMustExist: true })
    try {
      sqlite.pragma('ignore_check_constraints = ON')
      sqlite
        .prepare(
          'INSERT INTO project_identity_binding(local_project_key,canonical_path,document_id) VALUES (?,?,?)',
        )
        .run(rawKey, file, 'invalid-document-id')
    } finally {
      sqlite.close()
    }
    assert.throws(() => openAppDatabase(root, migrations), { code: 'PROJECT_PATH_UNAVAILABLE' })
    assert.equal(localProjectRecoveryKey(file), rawKey)
  } finally {
    await owner.close()
    await rm(root, { force: true, recursive: true })
  }
})

test('invalid secondary snapshot of the same database blocks stale cached identity until repair', async () => {
  const root = await temporaryRoot()
  const original = path.join(root, 'original.igs')
  const moved = path.join(root, 'moved.igs')
  const key = rawPathDerivedProjectRecoveryKey(original)
  const documentId = randomUUID()
  const owner = openAppDatabase(root, migrations)
  try {
    await owner.db
      .insertInto('project_identity_binding')
      .values({ canonical_path: moved, document_id: documentId, local_project_key: key })
      .execute()
    refreshProjectLocationRegistry(owner.db)
    await owner.db
      .updateTable('project_identity_binding')
      .set({ document_id: 'invalid-document' })
      .where('local_project_key', '=', key)
      .execute()
    assert.throws(() => openAppDatabase(root, migrations), { code: 'PROJECT_PATH_UNAVAILABLE' })
    assert.throws(() => localProjectRecoveryKey(moved), { code: 'PROJECT_PATH_UNAVAILABLE' })
    await owner.db
      .updateTable('project_identity_binding')
      .set({ document_id: documentId })
      .where('local_project_key', '=', key)
      .execute()
    refreshProjectLocationRegistry(owner.db)
    assert.equal(localProjectRecoveryKey(moved), key)
  } finally {
    await owner.close()
    await rm(root, { force: true, recursive: true })
  }
})

test('an installed0028 identity table cannot silently disappear into legacy hash fallback', async () => {
  const root = await temporaryRoot()
  const owner = openAppDatabase(root, migrations)
  try {
    await owner.db.schema.dropTable('project_identity_binding').execute()
    assert.throws(() => refreshProjectLocationRegistry(owner.db), {
      code: 'PROJECT_PATH_UNAVAILABLE',
    })
    assert.throws(() => localProjectRecoveryKey(path.join(root, 'ordinary.igs')), {
      code: 'PROJECT_PATH_UNAVAILABLE',
    })
    await owner.close()
    assert.throws(() => openAppDatabase(root, migrations), { code: 'PROJECT_PATH_UNAVAILABLE' })
  } finally {
    await owner.close()
    await rm(root, { force: true, recursive: true })
  }
})

test('retired key reservations survive cold reopen and secondary close alongside fresh active ownership', async () => {
  const root = await temporaryRoot()
  const file = path.join(root, 'deleted.igs')
  const retired = rawPathDerivedProjectRecoveryKey(file)
  let owner = openAppDatabase(root, migrations)
  let second: ReturnType<typeof openAppDatabase> | undefined
  try {
    await owner.db
      .insertInto('project_identity_retired_key')
      .values({ local_project_key: retired })
      .execute()
    refreshProjectLocationRegistry(owner.db)
    assert.throws(() => localProjectRecoveryKey(file), { code: 'PROJECT_PATH_UNAVAILABLE' })
    await owner.close()
    owner = openAppDatabase(root, migrations)
    assert.throws(() => localProjectRecoveryKey(file), { code: 'PROJECT_PATH_UNAVAILABLE' })
    second = openAppDatabase(root, migrations)
    await owner.close()
    assert.throws(() => localProjectRecoveryKey(file), { code: 'PROJECT_PATH_UNAVAILABLE' })
    const { ensureProjectLocationIdentity } =
      await import('../projects/project-location-registry.js')
    const replacement = await ensureProjectLocationIdentity(second.db, file, randomUUID())
    assert.notEqual(replacement, retired)
    assert.equal(localProjectRecoveryKey(file), replacement)
    await second.close()
    owner = openAppDatabase(root, migrations)
    assert.equal(localProjectRecoveryKey(file), replacement)
    assert.deepEqual(
      await owner.db.selectFrom('project_identity_retired_key').selectAll().execute(),
      [{ local_project_key: retired }],
    )
  } finally {
    await second?.close()
    await owner.close()
    await rm(root, { force: true, recursive: true })
  }
})

test('malformed retired identity is rejected at bootstrap without publishing fallback ownership', async () => {
  const root = await temporaryRoot()
  const owner = openAppDatabase(root, migrations)
  try {
    await owner.db
      .insertInto('project_identity_retired_key')
      .values({ local_project_key: 'not-a-project-key' })
      .execute()
    await owner.close()
    assert.throws(() => openAppDatabase(root, migrations), { code: 'PROJECT_PATH_UNAVAILABLE' })
    const file = path.join(root, 'unrelated.igs')
    assert.equal(localProjectRecoveryKey(file), rawPathDerivedProjectRecoveryKey(file))
  } finally {
    await owner.close()
    await rm(root, { force: true, recursive: true })
  }
})
