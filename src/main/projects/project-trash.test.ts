import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readdir, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { openAppDatabase } from '../db/database.js'
import { ProjectAutosaveLeaseRegistry } from './project-autosave.js'
import { ProjectIndexRepository } from './project-index.js'
import { parseProjectThumbnailImageUrl, readProjectThumbnail } from './project-preview-resource.js'
import { ProjectService } from './project-service.js'
import { ProjectSession } from './project-session.js'
import { ProjectShadowStore } from './project-shadow.js'
import {
  acceptedOutputPngFixture,
  acceptedRasterProvenanceFixture,
} from './test-fixtures/accepted-provenance.js'

const migrations = path.resolve('src/main/db/migrations')
const createInput = { height: 64, title: 'Trash fixture', width: 64 }
type Fixture = Awaited<ReturnType<typeof fixture>>

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-project-trash-'))
  const dataRoot = path.join(root, 'data')
  const directory = path.join(root, 'workspace')
  await mkdir(dataRoot)
  await mkdir(directory)
  const database = openAppDatabase(dataRoot, migrations)
  const repository = new ProjectIndexRepository(database.db)
  const roots = {
    placeholdersDir: path.resolve('src/main/projects/placeholders'),
    scratchDir: path.join(dataRoot, 'scratch'),
  }
  const services: ProjectService[] = []
  const makeService = () => {
    const service = new ProjectService({
      autosaveOptions: { debounceMs: 0, leaseRegistry: new ProjectAutosaveLeaseRegistry() },
      dataRoot,
      repository,
      roots,
      shadow: new ProjectShadowStore(path.join(dataRoot, 'autosave')),
    })
    services.push(service)
    return service
  }
  const service = makeService()
  const workspace = await service.addWorkspace(
    { color: 'blue', displayName: 'Trash workspace' },
    directory,
  )
  return {
    async cleanup() {
      for (const owner of services) {
        for (const tab of owner.getOpenTabs()) {
          await owner.discardAndClose(tab.id)
        }
      }
      await database.close()
      await rm(root, { force: true, recursive: true })
    },
    database,
    dataRoot,
    directory,
    makeService,
    repository,
    root,
    roots,
    service,
    workspace,
  }
}
async function withFixture(run: (f: Fixture) => Promise<void>) {
  const f = await fixture()
  try {
    await run(f)
  } finally {
    await f.cleanup()
  }
}
async function closedProject(f: Fixture) {
  const tab = await f.service.create({ ...createInput, workspaceId: f.workspace.id })
  await f.service.close(tab.id)
  const record = await f.repository.getProject(tab.id)
  assert.ok(record)
  return record
}
async function acceptedProject(f: Fixture) {
  const session = await ProjectSession.create(
    path.join(f.directory, 'accepted.igs'),
    'Accepted Trash fixture',
    f.roots,
  )
  const bytes = await acceptedOutputPngFixture()
  const id = randomUUID()
  const assetPath = `assets/layers/${id}.png`
  session.applyDocument({
    ...session.document,
    layers: [
      {
        asset: {
          bytes: bytes.length,
          height: 8,
          path: assetPath,
          sha256: createHash('sha256').update(bytes).digest('hex'),
          width: 8,
        },
        blendMode: 'normal',
        generationProvenance: acceptedRasterProvenanceFixture(session.document, bytes, {
          height: 8,
          width: 8,
          x: 0,
          y: 0,
        }),
        id,
        kind: 'raster',
        locked: false,
        name: 'Saved accepted layer',
        opacity: 1,
        transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 0, y: 0 },
        visible: false,
      },
    ],
  })
  await session.save({ assets: { [assetPath]: { bytes } } })
  const [project] = await f.service.list(f.workspace.id)
  assert.ok(project)
  return { project, session }
}

test('Trash survives derived-index loss and unregister/re-Add, then restores exact canonical identity without changing package bytes', async () => {
  await withFixture(async (f) => {
    const record = await closedProject(f)
    const bytes = await readFile(record.canonicalPath)
    const neighbor = await f.service.create({ ...createInput, title: 'Default neighbor' })
    await f.service.close(neighbor.id)
    await f.service.trashProject(record.localProjectKey)
    assert.deepEqual(
      (await f.service.list()).map(({ id }) => id),
      [neighbor.id],
    )
    const [trashed] = await f.service.listTrash()
    assert.equal(trashed.id, record.localProjectKey)
    assert.equal(trashed.fileName, path.basename(record.canonicalPath))
    assert.equal(trashed.originalWorkspaceDirectoryPath, f.directory)
    assert.equal(
      (await f.service.listWorkspaces()).find(({ id }) => id === f.workspace.id)!.projectCount,
      0,
    )
    await f.repository.indexSaved(record.canonicalPath, f.workspace.id)
    assert.equal(await f.repository.getProject(record.localProjectKey), null)
    await f.database.db
      .deleteFrom('project_index')
      .where('local_project_key', '=', record.localProjectKey)
      .execute()
    assert.deepEqual(await f.service.list(f.workspace.id), [])
    assert.equal(await f.repository.getProject(record.localProjectKey), null)
    await f.service.removeWorkspace(f.workspace.id)
    assert.equal((await f.service.listTrash()).length, 1)
    const readded = await f.service.addWorkspace(
      { color: 'teal', displayName: 'Re-added original' },
      f.directory,
    )
    assert.notEqual(readded.id, f.workspace.id)
    assert.deepEqual(await f.service.list(readded.id), [])
    await f.service.restoreProject(record.localProjectKey, trashed.trashId)
    assert.deepEqual(await f.service.listTrash(), [])
    assert.deepEqual(
      (await f.service.list(readded.id)).map(({ id }) => id),
      [record.localProjectKey],
    )
    assert.deepEqual(await readFile(record.canonicalPath), bytes)
    const opened = await f.service.open(record.localProjectKey)
    assert.equal(opened.kind, 'opened')
    await f.service.close(record.localProjectKey)
  })
})

test('Restore refuses missing original registration and does not silently use a same-named folder or Uncategorized', async () => {
  await withFixture(async (f) => {
    const record = await closedProject(f)
    await f.service.trashProject(record.localProjectKey)
    const [entry] = await f.service.listTrash()
    await f.service.removeWorkspace(f.workspace.id)
    await assert.rejects(f.service.selectImport(record.canonicalPath), { code: 'PROJECT_TRASHED' })
    const other = path.join(f.root, 'other')
    await mkdir(other)
    await f.service.addWorkspace({ color: 'green', displayName: 'Trash workspace' }, other)
    await assert.rejects(f.service.restoreProject(entry.id, entry.trashId), {
      code: 'PROJECT_NOT_FOUND',
    })
    assert.equal((await f.service.listTrash())[0].trashId, entry.trashId)
    assert.deepEqual(await f.service.list(), [])
    assert.deepEqual(await readdir(other), [])
    assert.equal((await readFile(record.canonicalPath)).length > 0, true)
  })
})

test('Trash rejects clean and dirty live ownership even when its cached index row was lost', async () => {
  await withFixture(async (f) => {
    const tab = await f.service.create({ ...createInput, workspaceId: f.workspace.id })
    const record = (await f.repository.getProject(tab.id))!
    const bytes = await readFile(record.canonicalPath)
    await assert.rejects(f.service.trashProject(tab.id), { code: 'PROJECT_ALREADY_OPEN' })
    await f.service.setPrimaryBbox(tab.id, { height: 64, width: 64, x: 7, y: -9 })
    await f.database.db
      .deleteFrom('project_index')
      .where('local_project_key', '=', tab.id)
      .execute()
    await assert.rejects(f.service.trashProject(tab.id), { code: 'PROJECT_ALREADY_OPEN' })
    assert.deepEqual(await f.service.listTrash(), [])
    assert.equal(f.service.getOpenTabs()[0].dirty, true)
    assert.deepEqual(await readFile(record.canonicalPath), bytes)
    await f.service.discardAndClose(tab.id)
  })
})

test('authoritative Trash blocks Open, known-file import, rebuild and accepted history while allowing read-only Trash thumbnail', async () => {
  await withFixture(async (f) => {
    const { project } = await acceptedProject(f)
    assert.equal((await f.service.getAcceptedResultHistory()).totalCount, 1)
    await f.service.trashProject(project.id)
    await f.database.db
      .updateTable('project_index')
      .set({ trashed_at: null })
      .where('local_project_key', '=', project.id)
      .execute()
    assert.equal(await f.repository.getProject(project.id), null)
    assert.equal((await f.service.getAcceptedResultHistory()).totalCount, 0)
    assert.deepEqual(await f.repository.listSavedAcceptedResults(project.id), [])
    await assert.rejects(f.service.open(project.id), { code: 'PROJECT_TRASHED' })
    await assert.rejects(
      f.service.rebuildPreview(project.id, {
        composePreview: async () => {
          throw new Error('Must not call compositor')
        },
      }),
      { code: 'PROJECT_TRASHED' },
    )
    const [entry] = await f.service.listTrash()
    await assert.rejects(f.service.selectImport(path.join(f.directory, 'accepted.igs')), {
      code: 'PROJECT_TRASHED',
    })
    assert.ok(entry.thumbnailUrl)
    const request = parseProjectThumbnailImageUrl(entry.thumbnailUrl)
    assert.ok(request)
    assert.equal(
      (await readProjectThumbnail(request, f.repository, path.join(f.root, 'thumbnail-cache')))
        .status,
      200,
    )
    const committed = await f.repository.trash.beginPermanentDelete(
      entry.id,
      entry.trashId,
      () => undefined,
    )
    assert.equal(
      (await readProjectThumbnail(request, f.repository, path.join(f.root, 'thumbnail-cache')))
        .status,
      404,
    )
    assert.deepEqual(await f.repository.trash.finishPermanentDelete(committed), { kind: 'deleted' })
  })
})

test('permanent deletion removes only the selected managed package and lifecycle; queue/recovery/non-project data survive', async () => {
  await withFixture(async (f) => {
    const record = await closedProject(f)
    const queueId = randomUUID()
    const now = new Date().toISOString()
    await f.database.db
      .insertInto('generation_queue_item')
      .values({
        batch_id: randomUUID(),
        canonical_project_path: record.canonicalPath,
        created_at: now,
        document_id: record.documentId!,
        document_revision: record.documentRevision!,
        error_code: 'FIXTURE',
        error_message: 'Opaque retained terminal fixture',
        finished_at: now,
        frozen_payload_json: '{}',
        id: queueId,
        local_project_key: record.localProjectKey,
        operation: 'illustrious-txt2img',
        staging_session_id: randomUUID(),
        started_at: null,
        status: 'failed',
        status_sequence: 0,
        updated_at: now,
      })
      .execute()
    const queueBefore = await f.database.db
      .selectFrom('generation_queue_item')
      .selectAll()
      .execute()
    const recovery = path.join(f.dataRoot, 'autosave', 'retained-companion')
    await mkdir(recovery, { recursive: true })
    await writeFile(path.join(recovery, 'keep.bin'), 'Recovery companion is separately owned')
    await writeFile(path.join(f.directory, 'keep.txt'), 'Non-project file')
    await f.service.trashProject(record.localProjectKey)
    const [entry] = await f.service.listTrash()
    assert.deepEqual(await f.service.deleteProjectPermanently(entry.id, entry.trashId), {
      kind: 'deleted',
    })
    await assert.rejects(readFile(record.canonicalPath), { code: 'ENOENT' })
    assert.deepEqual(await f.service.listTrash(), [])
    assert.deepEqual(await f.service.list(f.workspace.id), [])
    assert.deepEqual(
      await f.database.db.selectFrom('generation_queue_item').selectAll().execute(),
      queueBefore,
    )
    assert.equal(
      await readFile(path.join(recovery, 'keep.bin'), 'utf8'),
      'Recovery companion is separately owned',
    )
    assert.equal(await readFile(path.join(f.directory, 'keep.txt'), 'utf8'), 'Non-project file')
  })
})

test('Restore verifies portable document identity before reindexing a replaced Trash path', async () => {
  await withFixture(async (f) => {
    const record = await closedProject(f)
    await f.service.trashProject(record.localProjectKey)
    const [entry] = await f.service.listTrash()
    const backup = path.join(f.root, 'original.bin')
    await rename(record.canonicalPath, backup)
    const foreign = await ProjectSession.create(record.canonicalPath, 'Foreign occupant', f.roots)
    const foreignBytes = await readFile(foreign.filePath)
    await assert.rejects(f.service.restoreProject(entry.id, entry.trashId), {
      code: 'INDEX_FILE_CHANGED',
    })
    assert.deepEqual(await readFile(record.canonicalPath), foreignBytes)
    assert.equal((await f.service.listTrash())[0].trashId, entry.trashId)
    assert.deepEqual(await f.service.list(f.workspace.id), [])
    await unlink(record.canonicalPath)
    await rename(backup, record.canonicalPath)
    await f.service.restoreProject(entry.id, entry.trashId)
    assert.equal((await f.service.list(f.workspace.id))[0].id, entry.id)
  })
})

test('stale Trash identities cannot restore or permanently delete a newer Trash cycle', async () => {
  await withFixture(async (f) => {
    const record = await closedProject(f)
    await f.service.trashProject(record.localProjectKey)
    const [first] = await f.service.listTrash()
    await f.service.restoreProject(first.id, first.trashId)
    await f.service.trashProject(first.id)
    const [second] = await f.service.listTrash()
    assert.notEqual(second.trashId, first.trashId)
    const bytes = await readFile(record.canonicalPath)
    await assert.rejects(f.service.restoreProject(first.id, first.trashId), {
      code: 'PROJECT_TRASH_CONFLICT',
    })
    await assert.rejects(f.service.deleteProjectPermanently(first.id, first.trashId), {
      code: 'PROJECT_TRASH_CONFLICT',
    })
    assert.deepEqual(await readFile(record.canonicalPath), bytes)
    assert.equal((await f.service.listTrash())[0].trashId, second.trashId)
  })
})

test('a missing indexed Project can enter Trash but Restore refusal preserves authority and permanent missing-file deletion finalizes safely', async () => {
  await withFixture(async (f) => {
    const record = await closedProject(f)
    await unlink(record.canonicalPath)
    const [missing] = await f.service.list(f.workspace.id)
    assert.equal(missing.health, 'missing')
    await f.service.trashProject(missing.id)
    const [entry] = await f.service.listTrash()
    assert.equal(entry.health, 'missing')
    await assert.rejects(f.service.restoreProject(entry.id, entry.trashId))
    assert.equal((await f.service.listTrash())[0].trashId, entry.trashId)
    assert.deepEqual(await f.service.deleteProjectPermanently(entry.id, entry.trashId), {
      kind: 'deleted',
    })
    assert.deepEqual(await f.service.listTrash(), [])
  })
})

test('startup recovery finishes positive deletion before scanning an unregistered original folder', async () => {
  await withFixture(async (f) => {
    const record = await closedProject(f)
    await f.service.trashProject(record.localProjectKey)
    const [entry] = await f.service.listTrash()
    await f.repository.trash.beginPermanentDelete(entry.id, entry.trashId, () => undefined)
    await f.service.removeWorkspace(f.workspace.id)
    const restarted = f.makeService()
    await restarted.initialize()
    await assert.rejects(readFile(record.canonicalPath), { code: 'ENOENT' })
    assert.deepEqual(await restarted.listTrash(), [])
    const readded = await restarted.addWorkspace(
      { color: 'green', displayName: 'Original after recovery' },
      f.directory,
    )
    assert.deepEqual(await restarted.list(readded.id), [])
  })
})
