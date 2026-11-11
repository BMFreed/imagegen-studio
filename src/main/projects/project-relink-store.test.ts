import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { openAppDatabase } from '../db/database.js'
import { ProjectAutosaveLeaseRegistry } from './project-autosave.js'
import { localProjectRecoveryKey, rawPathDerivedProjectRecoveryKey } from './project-identity.js'
import { ProjectIndexRepository } from './project-index.js'
import { ProjectRelocationStore } from './project-relocation-store.js'
import { ProjectService } from './project-service.js'
import { ProjectShadowStore } from './project-shadow.js'

async function withFixture(run: (f: Awaited<ReturnType<typeof fixture>>) => Promise<void>) {
  const f = await fixture()
  try {
    await run(f)
  } finally {
    for (const tab of f.service.getOpenTabs()) {
      await f.service.discardAndClose(tab.id)
    }
    await f.database.close()
    await rm(f.root, { force: true, recursive: true })
  }
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-project-relink-'))
  const dataRoot = path.join(root, 'data')
  const directory = path.join(root, 'source')
  const targetDirectory = path.join(root, 'target')
  await mkdir(dataRoot)
  await mkdir(directory)
  await mkdir(targetDirectory)
  const database = openAppDatabase(dataRoot, path.resolve('src/main/db/migrations'))
  const repository = new ProjectIndexRepository(database.db)
  const service = new ProjectService({
    autosaveOptions: { debounceMs: 0, leaseRegistry: new ProjectAutosaveLeaseRegistry() },
    dataRoot,
    repository,
    roots: {
      placeholdersDir: path.resolve('src/main/projects/placeholders'),
      scratchDir: path.join(dataRoot, 'scratch'),
    },
    shadow: new ProjectShadowStore(path.join(dataRoot, 'autosave')),
  })
  const source = await service.addWorkspace({ color: 'blue', displayName: 'Source' }, directory)
  const target = await service.addWorkspace(
    { color: 'violet', displayName: 'Target' },
    targetDirectory,
  )
  const created = await service.create({
    height: 64,
    title: 'Relink fixture',
    width: 64,
    workspaceId: source.id,
  })
  await service.close(created.id)
  // A real prior Rename supplies a nonempty authoritative binding, independent of Home cache.
  await service.renameProject(created.id, 'Renamed relink fixture')
  await service.list(source.id)
  const original = await repository.getProject(created.id)
  assert.ok(original)
  const bytes = await readFile(original.canonicalPath)
  const candidatePath = path.join(targetDirectory, 'found.igs')
  await rename(original.canonicalPath, candidatePath)
  await service.list()
  const missing = await repository.getProject(original.localProjectKey)
  assert.ok(missing)
  assert.equal(missing.fileHealth, 'missing')
  const candidateKey = rawPathDerivedProjectRecoveryKey(candidatePath)
  assert.ok(await repository.getProject(candidateKey))
  return {
    bytes,
    candidateKey,
    candidatePath,
    database,
    dataRoot,
    missing,
    repository,
    root,
    service,
    source,
    target,
  }
}

test('Relink adopts only an unowned scanned candidate and repoints stable identity and terminal paths without package writes', async () => {
  await withFixture(async (f) => {
    const now = new Date().toISOString()
    const id = randomUUID()
    await f.database.db
      .insertInto('generation_queue_item')
      .values({
        batch_id: randomUUID(),
        canonical_project_path: f.missing.canonicalPath,
        created_at: now,
        document_id: f.missing.documentId!,
        document_revision: f.missing.documentRevision!,
        error_code: 'FIXTURE',
        error_message: 'Retained terminal storage control',
        finished_at: now,
        frozen_payload_json: '{"retained":"opaque storage control"}',
        id,
        local_project_key: f.missing.localProjectKey,
        operation: 'illustrious-txt2img',
        staging_session_id: randomUUID(),
        started_at: null,
        status: 'failed',
        status_sequence: 0,
        updated_at: now,
      })
      .execute()
    const before = await f.database.db
      .selectFrom('generation_queue_item')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow()
    let validations = 0
    await f.repository.relocations.relinkMissingProject(
      f.missing,
      f.source,
      f.target,
      f.candidatePath,
      () => undefined,
      async (saved, key) => {
        assert.equal(saved.project.documentId, f.missing.documentId)
        assert.equal(key, f.candidateKey)
        validations++
      },
    )
    assert.equal(validations, 2)
    assert.equal(await f.repository.getProject(f.candidateKey), null)
    const rebound = await f.repository.getProject(f.missing.localProjectKey)
    assert.equal(rebound?.canonicalPath, f.candidatePath)
    assert.equal(rebound?.workspaceId, f.target.id)
    assert.equal(rebound?.fileHealth, 'ready')
    assert.equal(localProjectRecoveryKey(f.candidatePath), f.missing.localProjectKey)
    assert.deepEqual(await readFile(f.candidatePath), f.bytes)
    await assert.rejects(readFile(f.missing.canonicalPath), { code: 'ENOENT' })
    assert.deepEqual(
      await f.database.db
        .selectFrom('generation_queue_item')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirstOrThrow(),
      { ...before, canonical_project_path: f.candidatePath },
    )
    assert.deepEqual(await f.repository.relocations.list(), [])
    const rows = await f.service.list()
    assert.deepEqual(
      rows.map(({ id: key }) => key),
      [f.missing.localProjectKey],
    )
  })
})

test('Relink refuses a candidate that already owns an opened local Project', async () => {
  await withFixture(async (f) => {
    assert.equal((await f.service.open(f.candidateKey)).kind, 'opened')
    await f.service.close(f.candidateKey)
    const before = await f.repository.getProject(f.candidateKey)
    const binding = await f.database.db.selectFrom('project_identity_binding').selectAll().execute()
    await assert.rejects(
      f.repository.relocations.relinkMissingProject(
        f.missing,
        f.source,
        f.target,
        f.candidatePath,
        () => undefined,
        async () => undefined,
      ),
      { code: 'PROJECT_MOVE_CONFLICT' },
    )
    assert.deepEqual(await f.repository.getProject(f.candidateKey), before)
    assert.deepEqual(
      await f.database.db.selectFrom('project_identity_binding').selectAll().execute(),
      binding,
    )
    assert.equal((await f.repository.getProject(f.missing.localProjectKey))?.fileHealth, 'missing')
    assert.deepEqual(await readFile(f.candidatePath), f.bytes)
  })
})

test('Relink final source reappearance rolls back adopted cache and binding transaction', async () => {
  await withFixture(async (f) => {
    const candidate = await f.repository.getProject(f.candidateKey)
    const bindings = await f.database.db
      .selectFrom('project_identity_binding')
      .selectAll()
      .execute()
    const fault = new ProjectRelocationStore(f.database.db, {
      beforeRelinkCommit: async () => {
        await writeFile(f.missing.canonicalPath, f.bytes)
      },
    })
    await assert.rejects(
      fault.relinkMissingProject(
        f.missing,
        f.source,
        f.target,
        f.candidatePath,
        () => undefined,
        async () => undefined,
      ),
      { code: 'PROJECT_MOVE_CONFLICT' },
    )
    assert.deepEqual(await f.repository.getProject(f.candidateKey), candidate)
    assert.deepEqual(
      await f.database.db.selectFrom('project_identity_binding').selectAll().execute(),
      bindings,
    )
    assert.deepEqual(await f.repository.getProject(f.missing.localProjectKey), f.missing)
    assert.deepEqual(await readFile(f.candidatePath), f.bytes)
    assert.deepEqual(await readFile(f.missing.canonicalPath), f.bytes)
    assert.deepEqual(await f.repository.relocations.list(), [])
  })
})
