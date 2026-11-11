import { sql } from 'kysely'
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { renameSync } from 'node:fs'
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { openAppDatabase } from '../db/database.js'
import { readIgsPackage, saveIgsPackage } from './igs-package.js'
import { ProjectAutosaveLeaseRegistry } from './project-autosave.js'
import { localProjectRecoveryKey, refreshProjectLocationRegistry } from './project-identity.js'
import { ProjectIndexRepository } from './project-index.js'
import { ProjectService } from './project-service.js'
import { ProjectSession } from './project-session.js'
import { ProjectShadowStore } from './project-shadow.js'
import {
  acceptedOutputPngFixture,
  acceptedRasterProvenanceFixture,
} from './test-fixtures/accepted-provenance.js'

const migrations = path.resolve('src/main/db/migrations')
const createInput = { height: 64, title: 'Management fixture', width: 64 }

type Fixture = Awaited<ReturnType<typeof fixture>>

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-workspace-management-'))
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
    { color: 'blue', displayName: 'Managed workspace' },
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

async function bytesIn(directory: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  async function walk(current: string) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name)
      if (entry.isDirectory()) {
        await walk(file)
      } else if (entry.isFile()) {
        result[path.relative(directory, file)] = createHash('sha256')
          .update(await readFile(file))
          .digest('hex')
      } else {
        throw new Error('Fixture may not hide a symlink or special file')
      }
    }
  }
  await walk(directory)
  return result
}

async function acceptedProject(f: Fixture) {
  const session = await ProjectSession.create(
    path.join(f.directory, 'accepted.igs'),
    'Accepted management fixture',
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
        name: 'Accepted saved layer',
        opacity: 1,
        transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 0, y: 0 },
        visible: false,
      },
    ],
  })
  await session.save({ assets: { [assetPath]: { bytes } } })
  const [project] = await f.service.list(f.workspace.id)
  assert.ok(project)
  return project
}

test('workspace settings persist trimmed metadata and return readback without changing portable files or live tabs', async () => {
  await withFixture(async (f) => {
    const created = await f.service.create({ ...createInput, workspaceId: f.workspace.id })
    const tabBefore = f.service.getOpenTabs()[0]
    const bytesBefore = await bytesIn(f.directory)
    const rowBefore = await f.database.db
      .selectFrom('project_workspace')
      .selectAll()
      .where('id', '=', f.workspace.id)
      .executeTakeFirstOrThrow()
    const updated = await f.service.updateWorkspace(f.workspace.id, {
      color: 'violet',
      displayName: '  Renamed workspace  ',
    })
    assert.equal(updated.id, f.workspace.id)
    assert.equal(updated.directoryPath, f.directory)
    assert.equal(updated.displayName, 'Renamed workspace')
    assert.equal(updated.color, 'violet')
    assert.equal(updated.projectCount, 1)
    assert.deepEqual(f.service.getOpenTabs(), [tabBefore])
    assert.deepEqual(await bytesIn(f.directory), bytesBefore)
    const rowAfter = await f.database.db
      .selectFrom('project_workspace')
      .selectAll()
      .where('id', '=', f.workspace.id)
      .executeTakeFirstOrThrow()
    assert.equal(rowAfter.created_at, rowBefore.created_at)
    assert.equal(rowAfter.directory_path, rowBefore.directory_path)
    await f.service.close(created.id)
    const restarted = f.makeService()
    assert.deepEqual(
      (await restarted.listWorkspaces()).find(({ id }) => id === f.workspace.id),
      updated,
    )
    assert.equal((await restarted.list(f.workspace.id))[0].workspaceId, f.workspace.id)
  })
})

test('settings guard default rename/removal, duplicate normalized names, invalid metadata and unknown identity atomically', async () => {
  await withFixture(async (f) => {
    const original = await f.service.listWorkspaces()
    await assert.rejects(
      f.service.updateWorkspace('uncategorized', {
        color: 'green',
        displayName: 'Renamed default',
      }),
      { code: 'WORKSPACE_PROTECTED' },
    )
    await assert.rejects(f.service.removeWorkspace('uncategorized'), {
      code: 'WORKSPACE_PROTECTED',
    })
    await assert.rejects(
      f.service.updateWorkspace(f.workspace.id, { color: 'green', displayName: ' uncategorized ' }),
      { code: 'WORKSPACE_NAME_EXISTS' },
    )
    for (const displayName of ['', 'x'.repeat(301)]) {
      await assert.rejects(
        f.service.updateWorkspace(f.workspace.id, { color: 'green', displayName }),
        { code: 'WORKSPACE_INVALID_INPUT' },
      )
    }
    await assert.rejects(
      f.service.updateWorkspace(f.workspace.id, { color: 'red' as 'teal', displayName: 'Valid' }),
      { code: 'WORKSPACE_INVALID_INPUT' },
    )
    for (const id of ['../workspace', randomUUID()]) {
      await assert.rejects(
        f.service.updateWorkspace(id, { color: 'green', displayName: 'No write' }),
        { code: id.startsWith('.') ? 'WORKSPACE_INVALID_INPUT' : 'WORKSPACE_UNAVAILABLE' },
      )
      await assert.rejects(f.service.removeWorkspace(id), {
        code: id.startsWith('.') ? 'WORKSPACE_INVALID_INPUT' : 'WORKSPACE_UNAVAILABLE',
      })
    }
    assert.deepEqual(await f.service.listWorkspaces(), original)
    const changedDefault = await f.service.updateWorkspace('uncategorized', {
      color: 'amber',
      displayName: 'Uncategorized',
    })
    assert.equal(changedDefault.color, 'amber')
    assert.equal(changedDefault.isDefault, true)
    assert.equal((await f.makeService().listWorkspaces())[0].color, 'amber')
    const self = await f.service.updateWorkspace(f.workspace.id, {
      color: 'teal',
      displayName: ' Managed workspace ',
    })
    assert.equal(self.displayName, 'Managed workspace')
  })
})

test('concurrent settings cannot publish duplicate normalized workspace names', async () => {
  await withFixture(async (f) => {
    const otherDirectory = path.join(f.root, 'other')
    await mkdir(otherDirectory)
    const other = await f.service.addWorkspace(
      { color: 'green', displayName: 'Other' },
      otherDirectory,
    )
    const results = await Promise.allSettled([
      f.service.updateWorkspace(f.workspace.id, { color: 'amber', displayName: 'Shared' }),
      f.service.updateWorkspace(other.id, { color: 'violet', displayName: 'shared' }),
    ])
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1)
    const rejected = results.find((result) => result.status === 'rejected')
    assert.ok(rejected?.status === 'rejected')
    assert.equal(rejected.reason.code, 'WORKSPACE_NAME_EXISTS')
    assert.equal(
      (await f.service.listWorkspaces()).filter(
        ({ displayName }) => displayName.toLowerCase() === 'shared',
      ).length,
      1,
    )
  })
})

test('missing and readonly workspace metadata stays editable and removable without filesystem writes', async () => {
  await withFixture(async (f) => {
    const project = await f.service.create({ ...createInput, workspaceId: f.workspace.id })
    await f.service.close(project.id)
    const bytes = await bytesIn(f.directory)
    await chmod(f.directory, 0o500)
    try {
      const readonly = await f.service.updateWorkspace(f.workspace.id, {
        color: 'green',
        displayName: 'Read-only metadata',
      })
      assert.equal(readonly.writable, false)
      assert.deepEqual(await bytesIn(f.directory), bytes)
    } finally {
      await chmod(f.directory, 0o700)
    }
    const disconnected = `${f.directory}.disconnected`
    await rename(f.directory, disconnected)
    const missing = await f.service.updateWorkspace(f.workspace.id, {
      color: 'amber',
      displayName: 'Missing metadata',
    })
    assert.equal(missing.availability, 'missing')
    assert.equal(missing.projectCount, 1)
    await f.service.removeWorkspace(f.workspace.id)
    assert.deepEqual(await bytesIn(disconnected), bytes)
    assert.deepEqual(await f.service.list(), [])
    assert.equal((await f.service.listWorkspaces()).length, 1)
    await assert.rejects(readdir(f.directory), { code: 'ENOENT' })
  })
})

test('registration removal rejects clean and dirty open Projects even after the derived Home row disappears', async () => {
  await withFixture(async (f) => {
    const tab = await f.service.create({ ...createInput, workspaceId: f.workspace.id })
    const source = await bytesIn(f.directory)
    await assert.rejects(f.service.removeWorkspace(f.workspace.id), {
      code: 'WORKSPACE_PROJECT_OPEN',
    })
    await f.service.setPrimaryBbox(tab.id, { height: 64, width: 64, x: 9, y: -1 })
    await f.database.db
      .deleteFrom('project_index')
      .where('local_project_key', '=', tab.id)
      .execute()
    await assert.rejects(f.service.removeWorkspace(f.workspace.id), {
      code: 'WORKSPACE_PROJECT_OPEN',
    })
    assert.equal(f.service.getOpenTabs()[0].dirty, true)
    assert.deepEqual(await bytesIn(f.directory), source)
    assert.equal((await f.service.listWorkspaces()).length, 2)
    await f.service.discardAndClose(tab.id)
    await f.service.removeWorkspace(f.workspace.id)
    assert.deepEqual(await bytesIn(f.directory), source)
    assert.equal((await f.service.listWorkspaces()).length, 1)
  })
})

test('workspace unregister clears only derived rows and re-add reconstructs accepted results while operational records and bytes survive', async () => {
  await withFixture(async (f) => {
    const project = await acceptedProject(f)
    const acceptedBefore = await f.repository.listSavedAcceptedResults(project.id)
    assert.equal(acceptedBefore.length, 1)
    const now = new Date().toISOString()
    // An opaque operational row proves storage ownership; it does not qualify executable inference.
    await f.database.db
      .insertInto('generation_queue_item')
      .values({
        batch_id: randomUUID(),
        canonical_project_path: path.join(f.directory, 'accepted.igs'),
        created_at: now,
        document_id: randomUUID(),
        document_revision: randomUUID(),
        error_code: 'FIXTURE',
        error_message: 'Retained operational fixture',
        finished_at: now,
        frozen_payload_json: '{}',
        id: randomUUID(),
        local_project_key: project.id,
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
    await mkdir(path.join(f.dataRoot, 'autosave', 'owned-recovery'), { recursive: true })
    await writeFile(
      path.join(f.dataRoot, 'autosave', 'owned-recovery', 'witness.txt'),
      'retained recovery bytes',
    )
    await writeFile(path.join(f.directory, 'unrelated.txt'), 'non-project source')
    const filesBefore = await bytesIn(f.root)
    await f.service.removeWorkspace(f.workspace.id)
    assert.deepEqual(await f.repository.listProjects(), [])
    assert.deepEqual(await f.repository.listSavedAcceptedResults(project.id), [])
    assert.deepEqual(
      await f.database.db.selectFrom('generation_queue_item').selectAll().execute(),
      queueBefore,
    )
    const workspaceBytes = await bytesIn(f.directory)
    for (const [name, sha] of Object.entries(workspaceBytes)) {
      assert.equal(sha, filesBefore[path.join('workspace', name)])
    }
    assert.equal(
      await readFile(path.join(f.dataRoot, 'autosave', 'owned-recovery', 'witness.txt'), 'utf8'),
      'retained recovery bytes',
    )
    const restored = await f.service.addWorkspace(
      { color: 'teal', displayName: 'Re-added' },
      f.directory,
    )
    assert.notEqual(restored.id, f.workspace.id)
    assert.equal(restored.projectCount, 1)
    assert.equal((await f.service.list(restored.id))[0].id, project.id)
    assert.deepEqual(await f.repository.listSavedAcceptedResults(project.id), acceptedBefore)
    assert.deepEqual(await bytesIn(f.directory), workspaceBytes)
    assert.equal((await f.service.open(project.id)).kind, 'opened')
    await f.service.close(project.id)
  })
})

test('failed workspace deletion rolls back Home and accepted-result rows as one metadata transaction', async () => {
  await withFixture(async (f) => {
    const project = await acceptedProject(f)
    const rowBefore = await f.repository.getProject(project.id)
    const acceptedBefore = await f.repository.listSavedAcceptedResults(project.id)
    const filesBefore = await bytesIn(f.directory)
    await sql
      .raw(
        "CREATE TRIGGER refuse_workspace_delete BEFORE DELETE ON project_workspace BEGIN SELECT RAISE(ABORT, 'owned workspace fault'); END",
      )
      .execute(f.database.db)
    try {
      await assert.rejects(f.service.removeWorkspace(f.workspace.id), /owned workspace fault/)
      assert.deepEqual(await f.repository.getProject(project.id), rowBefore)
      assert.deepEqual(await f.repository.listSavedAcceptedResults(project.id), acceptedBefore)
      assert.equal((await f.service.listWorkspaces()).length, 2)
      assert.deepEqual(await bytesIn(f.directory), filesBefore)
    } finally {
      await sql.raw('DROP TRIGGER refuse_workspace_delete').execute(f.database.db)
    }
    await f.service.removeWorkspace(f.workspace.id)
    assert.equal((await f.service.listWorkspaces()).length, 1)
  })
})

test('the final registry guard aborts and rolls back rows already removed inside the transaction', async () => {
  await withFixture(async (f) => {
    const project = await acceptedProject(f)
    const row = await f.repository.getProject(project.id)
    const accepted = await f.repository.listSavedAcceptedResults(project.id)
    const refusal = new Error('A Project became open at the final boundary')
    let checks = 0
    await assert.rejects(
      f.repository.removeWorkspace(f.workspace.id, () => {
        checks++
        if (checks === 3) {
          throw refusal
        }
      }),
      (error) => error === refusal,
    )
    assert.equal(checks, 3)
    assert.deepEqual(await f.repository.getProject(project.id), row)
    assert.deepEqual(await f.repository.listSavedAcceptedResults(project.id), accepted)
    assert.equal((await f.service.listWorkspaces()).length, 2)
  })
})

test('missing Home removal preserves operational identity and recovery; restored bytes reindex the same accepted Project', async () => {
  await withFixture(async (f) => {
    const retiredControl = await f.service.create({
      ...createInput,
      title: 'Retired control',
      workspaceId: f.workspace.id,
    })
    await f.service.close(retiredControl.id)
    await f.service.trashProject(retiredControl.id)
    const trash = (await f.service.listTrash()).find(({ id }) => id === retiredControl.id)
    assert.ok(trash)
    await f.service.deleteProjectPermanently(trash.id, trash.trashId)
    const project = await acceptedProject(f)
    await f.service.renameProject(project.id, 'Renamed accepted fixture')
    await f.service.list(f.workspace.id)
    const record = await f.repository.getProject(project.id)
    assert.ok(record)
    const accepted = await f.repository.listSavedAcceptedResults(project.id)
    assert.equal(accepted.length, 1)
    const original = await readFile(record.canonicalPath)
    const session = await ProjectSession.open(record.canonicalPath, f.roots)
    const shadow = new ProjectShadowStore(path.join(f.dataRoot, 'autosave'))
    await shadow.write({
      document: {
        ...session.document,
        documentRevision: randomUUID(),
        primaryBbox: { ...session.document.primaryBbox, x: 8 },
      },
      projectPath: record.canonicalPath,
      savedDocument: session.document,
    })
    const now = new Date().toISOString()
    await f.database.db
      .insertInto('generation_queue_item')
      .values({
        batch_id: randomUUID(),
        canonical_project_path: record.canonicalPath,
        created_at: now,
        document_id: session.document.documentId,
        document_revision: session.document.documentRevision,
        error_code: 'FIXTURE',
        error_message: 'Opaque retained terminal storage control',
        finished_at: now,
        frozen_payload_json: '{}',
        id: randomUUID(),
        local_project_key: project.id,
        operation: 'illustrious-txt2img',
        staging_session_id: randomUUID(),
        started_at: null,
        status: 'failed',
        status_sequence: 0,
        updated_at: now,
      })
      .execute()
    const queue = await f.database.db.selectFrom('generation_queue_item').selectAll().execute()
    const bindings = await f.database.db
      .selectFrom('project_identity_binding')
      .selectAll()
      .execute()
    const retired = await f.database.db
      .selectFrom('project_identity_retired_key')
      .selectAll()
      .execute()
    assert.ok(bindings.length > 0)
    assert.ok(retired.length > 0)
    const recoveryBytes = await bytesIn(path.join(f.dataRoot, 'autosave'))
    const retained = path.join(f.root, 'retained.igs')
    await rename(record.canonicalPath, retained)
    assert.equal((await f.service.list(f.workspace.id))[0].health, 'missing')
    await f.service.removeMissingProject(project.id)
    assert.equal(await f.repository.getProject(project.id), null)
    assert.deepEqual(await f.repository.listSavedAcceptedResults(project.id), [])
    assert.deepEqual(await f.makeService().list(f.workspace.id), [])
    assert.deepEqual(
      await f.database.db.selectFrom('generation_queue_item').selectAll().execute(),
      queue,
    )
    assert.deepEqual(
      await f.database.db.selectFrom('project_identity_binding').selectAll().execute(),
      bindings,
    )
    assert.deepEqual(
      await f.database.db.selectFrom('project_identity_retired_key').selectAll().execute(),
      retired,
    )
    assert.deepEqual(await bytesIn(path.join(f.dataRoot, 'autosave')), recoveryBytes)
    assert.deepEqual(await readFile(retained), original)
    await rename(retained, record.canonicalPath)
    const restored = (await f.service.list(f.workspace.id))[0]
    assert.equal(restored.id, project.id)
    assert.equal(restored.recoveryStatus, 'recoverable')
    const restoredRecord = await f.repository.getProject(project.id)
    assert.ok(restoredRecord)
    assert.deepEqual(
      await f.repository.listSavedAcceptedResults(project.id),
      accepted.map((result) => ({ ...result, fileFingerprint: restoredRecord.fileFingerprint })),
    )
    assert.deepEqual(await readFile(record.canonicalPath), original)
    assert.deepEqual(await bytesIn(path.join(f.dataRoot, 'autosave')), recoveryBytes)
  })
})

test('missing Home removal refuses stale missing when any file directory or dangling symlink reappears', async () => {
  await withFixture(async (f) => {
    const tab = await f.service.create({ ...createInput, workspaceId: f.workspace.id })
    await f.service.close(tab.id)
    const record = await f.repository.getProject(tab.id)
    assert.ok(record)
    const retained = path.join(f.root, 'retained.igs')
    await assert.rejects(f.service.removeMissingProject(tab.id), { code: 'PROJECT_NOT_READY' })
    await rename(record.canonicalPath, retained)
    await f.service.list(f.workspace.id)
    const missing = await f.repository.getProject(tab.id)
    const bytes = await readFile(retained)
    for (const kind of ['saved', 'corrupt', 'directory', 'symlink']) {
      if (kind === 'saved') {
        await writeFile(record.canonicalPath, bytes)
      }
      if (kind === 'corrupt') {
        await writeFile(record.canonicalPath, 'existing damaged package')
      }
      if (kind === 'directory') {
        await mkdir(record.canonicalPath)
      }
      if (kind === 'symlink') {
        await symlink(path.join(f.root, 'absent-target'), record.canonicalPath)
      }
      try {
        await assert.rejects(f.service.removeMissingProject(tab.id), { code: 'INDEX_FILE_CHANGED' })
        assert.deepEqual(await f.repository.getProject(tab.id), missing)
      } finally {
        await rm(record.canonicalPath, { recursive: true })
      }
    }
    await rename(retained, record.canonicalPath)
    assert.deepEqual(await readFile(record.canonicalPath), bytes)
  })
})

test('missing Home removal requires an available canonical parent and accepts readable readonly workspaces', async () => {
  await withFixture(async (f) => {
    const tab = await f.service.create({ ...createInput, workspaceId: f.workspace.id })
    await f.service.close(tab.id)
    const record = await f.repository.getProject(tab.id)
    assert.ok(record)
    await rename(record.canonicalPath, path.join(f.root, 'retained.igs'))
    await f.service.list(f.workspace.id)
    const before = await f.repository.getProject(tab.id)
    const disconnected = `${f.directory}-disconnected`
    await rename(f.directory, disconnected)
    try {
      await assert.rejects(f.service.removeMissingProject(tab.id), {
        code: 'WORKSPACE_UNAVAILABLE',
      })
      await symlink(disconnected, f.directory)
      await assert.rejects(f.service.removeMissingProject(tab.id), {
        code: 'WORKSPACE_UNAVAILABLE',
      })
      await rm(f.directory)
      assert.deepEqual(await f.repository.getProject(tab.id), before)
    } finally {
      await rename(disconnected, f.directory)
    }
    await chmod(f.directory, 0o000)
    try {
      await assert.rejects(f.service.removeMissingProject(tab.id), {
        code: 'WORKSPACE_UNAVAILABLE',
      })
      assert.deepEqual(await f.repository.getProject(tab.id), before)
    } finally {
      await chmod(f.directory, 0o500)
    }
    try {
      await f.service.removeMissingProject(tab.id)
      assert.equal(await f.repository.getProject(tab.id), null)
    } finally {
      await chmod(f.directory, 0o700)
    }
  })
})

test('missing Home removal refuses open Projects and rolled-back final guards keep derived rows', async () => {
  await withFixture(async (f) => {
    const tab = await f.service.create({ ...createInput, workspaceId: f.workspace.id })
    const record = await f.repository.getProject(tab.id)
    assert.ok(record)
    const retained = path.join(f.root, 'retained.igs')
    await rename(record.canonicalPath, retained)
    try {
      await f.service.list(f.workspace.id)
      await assert.rejects(f.service.removeMissingProject(tab.id), { code: 'PROJECT_NOT_READY' })
    } finally {
      await rename(retained, record.canonicalPath)
      await f.service.close(tab.id)
    }
    await rename(record.canonicalPath, retained)
    await f.service.list(f.workspace.id)
    const missing = await f.repository.getProject(tab.id)
    assert.ok(missing)
    const refusal = new Error('final closed-owner guard')
    let checks = 0
    await assert.rejects(
      f.repository.removeMissingProject(missing, () => {
        if (++checks === 4) {
          throw refusal
        }
      }),
      (error) => error === refusal,
    )
    assert.equal(checks, 4)
    assert.deepEqual(await f.repository.getProject(tab.id), missing)
    checks = 0
    await assert.rejects(
      f.repository.removeMissingProject(missing, () => {
        if (++checks === 3) {
          renameSync(retained, record.canonicalPath)
        }
      }),
      { code: 'INDEX_FILE_CHANGED' },
    )
    assert.deepEqual(await f.repository.getProject(tab.id), missing)
    assert.equal((await f.service.list(f.workspace.id))[0].health, 'ready')
  })
})

async function locateFixture(f: Fixture) {
  const project = await acceptedProject(f)
  const record = await f.repository.getProject(project.id)
  assert.ok(record)
  const saved = await readIgsPackage(record.canonicalPath)
  const shadow = new ProjectShadowStore(path.join(f.dataRoot, 'autosave'))
  await shadow.write({
    document: {
      ...saved.project,
      documentRevision: randomUUID(),
      primaryBbox: { ...saved.project.primaryBbox, x: 8 },
    },
    projectPath: record.canonicalPath,
    savedDocument: saved.project,
  })
  const shadowBytes = await bytesIn(path.join(f.dataRoot, 'autosave'))
  const bytes = await readFile(record.canonicalPath)
  const candidate = path.join(f.directory, 'Located project.igs')
  await rename(record.canonicalPath, candidate)
  const summaries = await f.service.list(f.workspace.id)
  const disposable = summaries.find(({ id }) => id !== project.id)
  assert.ok(disposable)
  assert.equal(disposable.lastOpenedAt, null)
  assert.equal(summaries.find(({ id }) => id === project.id)?.health, 'missing')
  return {
    bytes,
    candidate,
    disposable,
    project,
    record,
    saved: await readIgsPackage(candidate),
    shadow,
    shadowBytes,
  }
}

test('Locate reconnects the saved identity and real recovery without file writes or implicit Open', async () => {
  await withFixture(async (f) => {
    const p = await locateFixture(f)
    const now = new Date().toISOString()
    await f.database.db
      .insertInto('generation_queue_item')
      .values({
        batch_id: randomUUID(),
        canonical_project_path: p.record.canonicalPath,
        created_at: now,
        document_id: p.saved.project.documentId,
        document_revision: p.saved.project.documentRevision,
        error_code: 'FIXTURE',
        error_message: 'Retained terminal queue control',
        finished_at: now,
        frozen_payload_json: JSON.stringify({ retainedSource: p.record.canonicalPath }),
        id: randomUUID(),
        local_project_key: p.project.id,
        operation: 'illustrious-txt2img',
        staging_session_id: randomUUID(),
        started_at: null,
        status: 'failed',
        status_sequence: 0,
        updated_at: now,
      })
      .execute()
    const queue = await f.database.db.selectFrom('generation_queue_item').selectAll().execute()
    assert.equal(await f.service.locateProject(p.project.id, async () => p.candidate), true)
    assert.deepEqual(f.service.getOpenTabs(), [])
    assert.equal(await f.repository.getProject(p.disposable.id), null)
    const record = await f.repository.getProject(p.project.id)
    assert.equal(record?.canonicalPath, p.candidate)
    assert.equal(record?.documentRevision, p.record.documentRevision)
    const binding = await f.database.db
      .selectFrom('project_identity_binding')
      .selectAll()
      .where('local_project_key', '=', p.project.id)
      .executeTakeFirstOrThrow()
    assert.equal(binding.canonical_path, p.candidate)
    assert.deepEqual(
      await f.database.db.selectFrom('generation_queue_item').selectAll().execute(),
      queue.map((row) => ({ ...row, canonical_project_path: p.candidate })),
    )
    assert.ok(
      (await readFile(p.candidate)).equals(p.bytes),
      'Relink preserves the exact package bytes',
    )
    assert.deepEqual(await bytesIn(path.join(f.dataRoot, 'autosave')), p.shadowBytes)
    const reloaded = (await f.makeService().list(f.workspace.id))[0]
    assert.equal(reloaded.id, p.project.id)
    assert.equal(reloaded.recoveryStatus, 'recoverable')
    assert.equal((await f.repository.listSavedAcceptedResults(p.project.id)).length, 1)
    const inspection = await p.shadow.inspect({ projectPath: p.candidate, savedPackage: p.saved })
    assert.equal(inspection.status, 'recoverable')
    if (inspection.status === 'recoverable') {
      assert.equal(inspection.document.primaryBbox.x, 8)
    }
  })
})

test('Locate Cancel and wrong selected document leave both owners and shadow exact', async () => {
  await withFixture(async (f) => {
    const p = await locateFixture(f)
    const rows = await f.repository.listProjects()
    assert.equal(await f.service.locateProject(p.project.id, async () => null), false)
    assert.deepEqual(await f.repository.listProjects(), rows)
    const wrongPath = path.join(f.directory, 'Other project.igs')
    await ProjectSession.create(wrongPath, 'Different saved Project', f.roots)
    await assert.rejects(
      f.service.locateProject(p.project.id, async () => wrongPath),
      { code: 'PROJECT_MOVE_CONFLICT' },
    )
    const session = await ProjectSession.open(p.candidate, f.roots)
    session.applyDocument({
      ...session.document,
      primaryBbox: { ...session.document.primaryBbox, x: 16 },
    })
    await session.save()
    await assert.rejects(
      f.service.locateProject(p.project.id, async () => p.candidate),
      { code: 'PROJECT_MOVE_CONFLICT' },
    )
    assert.equal(
      (await f.repository.getProject(p.project.id))?.canonicalPath,
      p.record.canonicalPath,
    )
    assert.deepEqual(await bytesIn(path.join(f.dataRoot, 'autosave')), p.shadowBytes)
    assert.deepEqual(f.service.getOpenTabs(), [])
  })
})

test('Locate validates exact retained recovery base even when candidate repeats document ID and revision', async () => {
  await withFixture(async (f) => {
    const p = await locateFixture(f)
    const assetPaths = p.saved.manifest.members.filter(({ path: member }) =>
      member.startsWith('assets/'),
    )
    const assets = Object.fromEntries(
      await Promise.all(
        assetPaths.map(async ({ path: member }) => [
          member,
          { bytes: await p.saved.readMember(member) },
        ]),
      ),
    )
    await saveIgsPackage(p.candidate, {
      assets,
      preview: {
        merged: await p.saved.readMember('preview/merged.png'),
        rect: p.saved.manifest.preview.rect,
        status: p.saved.manifest.preview.status,
        thumbnail: await p.saved.readMember('preview/thumbnail.webp'),
      },
      project: { ...p.saved.project, title: 'Different document with reused revision' },
    })
    await f.service.list(f.workspace.id)
    const before = await f.repository.listProjects()
    await assert.rejects(
      f.service.locateProject(p.project.id, async () => p.candidate),
      { code: 'PROJECT_RECOVERY_UNAVAILABLE' },
    )
    assert.deepEqual(await f.repository.listProjects(), before)
    assert.deepEqual(await bytesIn(path.join(f.dataRoot, 'autosave')), p.shadowBytes)
    const keyInspection = await p.shadow.inspectByLocalKey({
      localProjectKey: p.project.id,
      savedPackage: await readIgsPackage(p.candidate),
    })
    assert.equal(keyInspection.status, 'stale')
    await assert.rejects(
      p.shadow.inspectByLocalKey({ localProjectKey: '../../foreign', savedPackage: p.saved }),
      { code: 'SHADOW_INVALID_REQUEST' },
    )
  })
})

test('Locate rolls back when another active database profile already owns the candidate location', async () => {
  await withFixture(async (f) => {
    const p = await locateFixture(f)
    const before = await f.repository.listProjects()
    const bindings = await f.database.db
      .selectFrom('project_identity_binding')
      .selectAll()
      .execute()
    const otherRoot = path.join(f.root, 'other-profile')
    await mkdir(otherRoot)
    const other = openAppDatabase(otherRoot, migrations)
    const otherKey = `project-v1-${createHash('sha256').update(randomUUID()).digest('hex')}`
    try {
      await other.db
        .insertInto('project_identity_binding')
        .values({
          canonical_path: p.candidate,
          document_id: p.saved.project.documentId,
          local_project_key: otherKey,
        })
        .execute()
      refreshProjectLocationRegistry(other.db)
      await assert.rejects(
        f.service.locateProject(p.project.id, async () => p.candidate),
        { code: 'PROJECT_PATH_UNAVAILABLE' },
      )
      assert.deepEqual(await f.repository.listProjects(), before)
      assert.deepEqual(
        await f.database.db.selectFrom('project_identity_binding').selectAll().execute(),
        bindings,
      )
      assert.equal(localProjectRecoveryKey(p.record.canonicalPath), p.project.id)
      assert.equal(localProjectRecoveryKey(p.candidate), otherKey)
      assert.deepEqual(await bytesIn(path.join(f.dataRoot, 'autosave')), p.shadowBytes)
      assert.ok((await readFile(p.candidate)).equals(p.bytes))
    } finally {
      await other.close()
    }
  })
})
