import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rename, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { openAppDatabase } from '../db/database.js'
import {
  canonicalProjectPath,
  localProjectRecoveryKey,
  rawPathDerivedProjectRecoveryKey,
} from './project-identity.js'
import {
  ensureProjectLocationIdentity,
  hasRelocatedKeyCollision,
  refreshProjectLocationRegistry,
} from './project-location-registry.js'

const migrations = path.resolve('src/main/db/migrations')
type DatabaseOwner = ReturnType<typeof openAppDatabase>
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-location-registry-'))
  const database = openAppDatabase(root, migrations)
  const first = path.join(root, 'first.igs')
  const second = path.join(root, 'second.igs')
  const third = path.join(root, 'third.igs')
  const documentId = randomUUID()
  await writeFile(first, 'Portable bytes are outside this registry')
  const key = rawPathDerivedProjectRecoveryKey(first)
  return { database, documentId, first, key, root, second, third }
}
async function withFixture(run: (f: Awaited<ReturnType<typeof fixture>>) => Promise<void>) {
  const f = await fixture()
  try {
    await run(f)
  } finally {
    await f.database.close()
    await rm(f.root, { force: true, recursive: true })
  }
}
async function bind(
  database: DatabaseOwner,
  canonicalPath: string,
  localProjectKey: string,
  documentId: string,
) {
  await database.db
    .insertInto('project_identity_binding')
    .values({
      canonical_path: canonicalPath,
      document_id: documentId,
      local_project_key: localProjectKey,
    })
    .execute()
  refreshProjectLocationRegistry(database.db)
}

test('ordinary physical paths keep exact legacy hash and need no authoritative binding row', async () => {
  await withFixture(async (f) => {
    assert.equal(localProjectRecoveryKey(f.first), f.key)
    assert.equal(await ensureProjectLocationIdentity(f.database.db, f.first, f.documentId), f.key)
    assert.deepEqual(
      await f.database.db.selectFrom('project_identity_binding').selectAll().execute(),
      [],
    )
    assert.equal(localProjectRecoveryKey(f.first), f.key)
    assert.notEqual(localProjectRecoveryKey(f.second), f.key)
  })
})

test('active binding preserves a moved key while canonicalProjectPath remains a physical resolver', async () => {
  await withFixture(async (f) => {
    await rename(f.first, f.second)
    await bind(f.database, f.second, f.key, f.documentId)
    assert.equal(localProjectRecoveryKey(f.second), f.key)
    assert.notEqual(rawPathDerivedProjectRecoveryKey(f.second), f.key)
    assert.throws(() => localProjectRecoveryKey(f.first), { code: 'PROJECT_PATH_UNAVAILABLE' })
    await assert.rejects(canonicalProjectPath(f.first), { code: 'PROJECT_PATH_UNAVAILABLE' })
    assert.equal(await canonicalProjectPath(f.first, { allowNewFile: true }), f.first)
    const alias = path.join(f.root, 'alias.igs')
    await symlink(f.second, alias)
    assert.equal(await canonicalProjectPath(alias), f.second)
    assert.equal(localProjectRecoveryKey(await canonicalProjectPath(alias)), f.key)
  })
})

test('reusing a moved original filename creates a separate durable identity without changing moved binding', async () => {
  await withFixture(async (f) => {
    await rename(f.first, f.second)
    await bind(f.database, f.second, f.key, f.documentId)
    await writeFile(f.first, 'Another independent Project')
    const otherDocument = randomUUID()
    const otherKey = await ensureProjectLocationIdentity(f.database.db, f.first, otherDocument)
    assert.match(otherKey, /^project-v1-[a-f0-9]{64}$/)
    assert.notEqual(otherKey, f.key)
    assert.equal(localProjectRecoveryKey(f.first), otherKey)
    assert.equal(localProjectRecoveryKey(f.second), f.key)
    assert.equal(
      await ensureProjectLocationIdentity(f.database.db, f.first, otherDocument),
      otherKey,
    )
    assert.equal(
      (await f.database.db.selectFrom('project_identity_binding').selectAll().execute()).length,
      2,
    )
    await assert.rejects(ensureProjectLocationIdentity(f.database.db, f.first, randomUUID()), {
      code: 'PROJECT_PATH_UNAVAILABLE',
    })
    assert.equal(localProjectRecoveryKey(f.first), otherKey)
  })
})

test('transaction rollback leaves the published path binding unchanged', async () => {
  await withFixture(async (f) => {
    await bind(f.database, f.second, f.key, f.documentId)
    await assert.rejects(
      f.database.db.transaction().execute(async (transaction) => {
        await transaction
          .updateTable('project_identity_binding')
          .set({ canonical_path: f.third })
          .where('local_project_key', '=', f.key)
          .execute()
        throw new Error('Rollback before commit')
      }),
      /Rollback before commit/,
    )
    refreshProjectLocationRegistry(f.database.db)
    assert.equal(localProjectRecoveryKey(f.second), f.key)
    assert.equal(localProjectRecoveryKey(f.third), rawPathDerivedProjectRecoveryKey(f.third))
  })
})

test('registered location refuses invalid paths and another document without changing authority', async () => {
  await withFixture(async (f) => {
    await bind(f.database, f.second, f.key, f.documentId)
    const before = await f.database.db.selectFrom('project_identity_binding').selectAll().execute()
    for (const location of [
      'relative.igs',
      `${f.root}/a/../other.igs`,
      path.join(f.root, 'file.png'),
      `${f.root}/bad\0.igs`,
    ]) {
      await assert.rejects(ensureProjectLocationIdentity(f.database.db, location, f.documentId), {
        code: 'PROJECT_PATH_UNAVAILABLE',
      })
    }
    await assert.rejects(ensureProjectLocationIdentity(f.database.db, f.second, 'not-a-document'), {
      code: 'PROJECT_PATH_UNAVAILABLE',
    })
    await assert.rejects(ensureProjectLocationIdentity(f.database.db, f.second, randomUUID()), {
      code: 'PROJECT_PATH_UNAVAILABLE',
    })
    assert.deepEqual(
      await f.database.db.selectFrom('project_identity_binding').selectAll().execute(),
      before,
    )
  })
})

test('postcommit conflicting owner poisons lookups until its authoritative data is repaired', async () => {
  await withFixture(async (f) => {
    const otherRoot = await mkdtemp(path.join(os.tmpdir(), 'igs-location-other-'))
    const other = openAppDatabase(otherRoot, migrations)
    try {
      await bind(f.database, f.second, f.key, f.documentId)
      await other.db
        .insertInto('project_identity_binding')
        .values({ canonical_path: f.third, document_id: f.documentId, local_project_key: f.key })
        .execute()
      assert.throws(() => refreshProjectLocationRegistry(other.db), {
        code: 'PROJECT_PATH_UNAVAILABLE',
      })
      assert.throws(() => localProjectRecoveryKey(f.second), { code: 'PROJECT_PATH_UNAVAILABLE' })
      assert.throws(() => localProjectRecoveryKey(path.join(f.root, 'unbound.igs')), {
        code: 'PROJECT_PATH_UNAVAILABLE',
      })
      await other.db.deleteFrom('project_identity_binding').execute()
      refreshProjectLocationRegistry(other.db)
      assert.equal(localProjectRecoveryKey(f.second), f.key)
    } finally {
      await other.close()
      await rm(otherRoot, { force: true, recursive: true })
    }
  })
})

test('a collided retired pathname is explicit without minting an identity for an unreadable occupant', async () => {
  await withFixture(async (f) => {
    assert.equal(hasRelocatedKeyCollision(f.first), false)
    await rename(f.first, f.second)
    await bind(f.database, f.second, f.key, f.documentId)
    assert.equal(hasRelocatedKeyCollision(f.first), true)
    assert.equal(hasRelocatedKeyCollision(f.second), false)
    assert.equal(hasRelocatedKeyCollision(f.third), false)
    await writeFile(f.first, 'Corrupt bytes cannot supply a trusted document ID')
    const before = await f.database.db.selectFrom('project_identity_binding').selectAll().execute()
    assert.equal(hasRelocatedKeyCollision(f.first), true)
    assert.deepEqual(
      await f.database.db.selectFrom('project_identity_binding').selectAll().execute(),
      before,
    )
    const fresh = await ensureProjectLocationIdentity(f.database.db, f.first, randomUUID())
    assert.notEqual(fresh, f.key)
    assert.equal(hasRelocatedKeyCollision(f.first), false)
    assert.equal(localProjectRecoveryKey(f.second), f.key)
    assert.throws(() => hasRelocatedKeyCollision('relative.igs'), {
      code: 'PROJECT_PATH_UNAVAILABLE',
    })
  })
})

async function retire(database: DatabaseOwner, key: string) {
  await database.db.transaction().execute(async (transaction) => {
    await transaction
      .deleteFrom('project_identity_binding')
      .where('local_project_key', '=', key)
      .execute()
    await transaction
      .insertInto('project_identity_retired_key')
      .values({ local_project_key: key })
      .execute()
  })
  refreshProjectLocationRegistry(database.db)
}

test('retired legacy key cannot return through pathname hashing and a validated new document gets another identity', async () => {
  await withFixture(async (f) => {
    await retire(f.database, f.key)
    assert.throws(() => localProjectRecoveryKey(f.first), { code: 'PROJECT_PATH_UNAVAILABLE' })
    assert.equal(hasRelocatedKeyCollision(f.first), true)
    assert.equal(hasRelocatedKeyCollision(f.second), false)
    const replacement = await ensureProjectLocationIdentity(f.database.db, f.first, randomUUID())
    assert.notEqual(replacement, f.key)
    assert.equal(localProjectRecoveryKey(f.first), replacement)
    assert.equal(hasRelocatedKeyCollision(f.first), false)
    assert.deepEqual(
      await f.database.db.selectFrom('project_identity_retired_key').selectAll().execute(),
      [{ local_project_key: f.key }],
    )
  })
})

test('retiring a moved identity frees its current pathname while reserving its original derived key', async () => {
  await withFixture(async (f) => {
    await rename(f.first, f.second)
    await bind(f.database, f.second, f.key, f.documentId)
    await retire(f.database, f.key)
    assert.equal(localProjectRecoveryKey(f.second), rawPathDerivedProjectRecoveryKey(f.second))
    const newCurrentKey = await ensureProjectLocationIdentity(f.database.db, f.second, randomUUID())
    const newOriginalKey = await ensureProjectLocationIdentity(f.database.db, f.first, randomUUID())
    assert.notEqual(newCurrentKey, f.key)
    assert.notEqual(newOriginalKey, f.key)
    assert.notEqual(newOriginalKey, newCurrentKey)
    assert.equal(localProjectRecoveryKey(f.second), newCurrentKey)
    assert.equal(localProjectRecoveryKey(f.first), newOriginalKey)
    assert.deepEqual(
      await f.database.db.selectFrom('project_identity_retired_key').selectAll().execute(),
      [{ local_project_key: f.key }],
    )
  })
})

test('an active binding to a retired key is invalid rather than overriding its non-reuse reservation', async () => {
  await withFixture(async (f) => {
    await bind(f.database, f.second, f.key, f.documentId)
    await f.database.db
      .insertInto('project_identity_retired_key')
      .values({ local_project_key: f.key })
      .execute()
    assert.throws(() => refreshProjectLocationRegistry(f.database.db), {
      code: 'PROJECT_PATH_UNAVAILABLE',
    })
    assert.throws(() => localProjectRecoveryKey(f.second), { code: 'PROJECT_PATH_UNAVAILABLE' })
    assert.throws(() => hasRelocatedKeyCollision(f.first), { code: 'PROJECT_PATH_UNAVAILABLE' })
    await f.database.db
      .deleteFrom('project_identity_binding')
      .where('local_project_key', '=', f.key)
      .execute()
    refreshProjectLocationRegistry(f.database.db)
    assert.equal(hasRelocatedKeyCollision(f.first), true)
    assert.equal(localProjectRecoveryKey(f.second), rawPathDerivedProjectRecoveryKey(f.second))
  })
})
