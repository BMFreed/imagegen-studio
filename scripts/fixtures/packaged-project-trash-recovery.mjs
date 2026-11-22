/** Reconcile positive Project Trash delete authority through packaged Main startup. */
import assert from 'node:assert/strict'
import { constants } from 'node:fs'
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect } from '@playwright/test'

import { openAppDatabase } from '../../src/main/db/database.ts'
import { ProjectIndexRepository } from '../../src/main/projects/project-index.ts'
import { ProjectSession } from '../../src/main/projects/project-session.ts'
import { ProjectTrashStore } from '../../src/main/projects/project-trash-store.ts'
import { snapshotDatabase } from './application-state-upgrade-fixture.mjs'
import { assertOfflineProjectDesktop } from './packaged-noobai-import-chooser.mjs'

const scenario = 'trash-recovery'
const migrations = fileURLToPath(new URL('../../src/main/db/migrations/', import.meta.url))
const placeholdersDir = fileURLToPath(
  new URL('../../src/main/projects/placeholders/', import.meta.url),
)
const replacementDiagnostic =
  'The Project file or its workspace changed. No replacement file will be deleted.'
const titles = {
  present: 'Committed with source present',
  unlinked: 'Committed after unlink',
  changed: 'Committed with changed occupant',
  ordinary: 'Ordinary Trash control',
  neighbor: 'Active neighbor control',
}

async function retainedDatabase(database, root, name, identity) {
  for (const suffix of ['-wal', '-shm', '-journal']) {
    await assert.rejects(lstat(database + suffix), { code: 'ENOENT' })
  }
  assert.equal(await realpath(database), database)
  const retained = path.join(root, `${name}.sqlite`)
  const original = await identity(database)
  await copyFile(database, retained, constants.COPYFILE_EXCL)
  const pin = await identity(retained)
  assert.deepEqual(pin, { ...original, path: retained })
  const snapshot = snapshotDatabase(retained, { closed: true })
  assert.equal(snapshot.integrityCheck, 'ok')
  assert.deepEqual(snapshot.foreignKeyCheck, [])
  assert.equal(snapshot.schemaMigrations.length, 30)
  return { pin, snapshot }
}

async function fileWitness(filename, identity) {
  const stat = await lstat(filename, { bigint: true })
  assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1n)
  return {
    ...(await identity(filename)),
    device: stat.dev.toString(),
    inode: stat.ino.toString(),
    mtimeNs: stat.mtimeNs.toString(),
    ctimeNs: stat.ctimeNs.toString(),
  }
}

async function seed(root, appData, identity) {
  await assert.rejects(lstat(appData), { code: 'ENOENT' })
  await mkdir(appData, { recursive: true, mode: 0o700 })
  const input = path.join(root, 'prepared-inputs')
  const scratchDir = path.join(root, 'seed-scratch')
  await mkdir(input, { mode: 0o700 })
  const database = openAppDatabase(appData, migrations)
  try {
    const repository = new ProjectIndexRepository(database.db)
    const workspace = await repository.ensureDefaultWorkspace(appData)
    assert.equal(workspace.directoryPath, path.join(appData, 'workspaces/Uncategorized'))
    const projects = {}
    for (const [name, title] of Object.entries(titles)) {
      const filename = path.join(workspace.directoryPath, `${name}.igs`)
      const session = await ProjectSession.create(filename, title, { placeholdersDir, scratchDir })
      const project = await repository.indexSaved(filename, workspace.id)
      assert.equal(project.documentId, session.document.documentId)
      const retained = path.join(input, `${name}.igs`)
      await copyFile(filename, retained, constants.COPYFILE_EXCL)
      projects[name] = {
        project,
        original: await fileWitness(filename, identity),
        retained: await identity(retained),
      }
    }
    const guard = () => undefined
    for (const name of ['present', 'unlinked', 'changed', 'ordinary']) {
      const project = projects[name].project
      await repository.trash.moveToTrash(project, workspace, guard)
      const entry = await repository.trash.get(project.localProjectKey)
      assert.equal(entry.state, 'trashed')
      projects[name].authority =
        name === 'ordinary'
          ? entry
          : await repository.trash.beginPermanentDelete(
              project.localProjectKey,
              entry.trashId,
              guard,
            )
    }

    let reachedFinalize = false
    const interrupted = new ProjectTrashStore(database.db, {
      beforeFinalize: async (record) => {
        assert.equal(record.deletionId, projects.unlinked.authority.deletionId)
        await assert.rejects(lstat(record.canonicalPath), { code: 'ENOENT' })
        reachedFinalize = true
        throw new Error('Fixture stops after the owned unlink and parent sync')
      },
    })
    const pending = await interrupted.finishPermanentDelete(projects.unlinked.authority)
    assert.equal(reachedFinalize, true)
    assert.equal(pending.kind, 'pending')
    assert.equal(
      (await repository.trash.get(projects.unlinked.project.localProjectKey)).state,
      'deleting',
    )

    const foreignPath = path.join(input, 'foreign-source.igs')
    const foreign = await ProjectSession.create(foreignPath, 'Foreign replacement control', {
      placeholdersDir,
      scratchDir,
    })
    const originalAside = path.join(input, 'changed-original-inode.igs')
    const changed = projects.changed.project.canonicalPath
    await rename(changed, originalAside)
    const preservedOriginal = await fileWitness(originalAside, identity)
    assert.equal(preservedOriginal.inode, projects.changed.original.inode)
    assert.equal(preservedOriginal.sha256, projects.changed.original.sha256)
    await copyFile(foreignPath, changed, constants.COPYFILE_EXCL)
    const replacement = await fileWitness(changed, identity)
    assert.notEqual(replacement.inode, preservedOriginal.inode)
    assert.notEqual(replacement.sha256, preservedOriginal.sha256)
    const foreignSource = await identity(foreignPath)
    assert.equal(replacement.sha256, foreignSource.sha256)
    const sentinelFile = path.join(workspace.directoryPath, 'Keep this file.txt')
    await writeFile(sentinelFile, 'A neighboring non-Project file survives startup.\n', {
      flag: 'wx',
      mode: 0o600,
    })
    return {
      database: database.filePath,
      projects,
      workspace,
      replacement,
      foreignSource,
      foreignDocumentId: foreign.document.documentId,
      preservedOriginal,
      sentinel: await fileWitness(sentinelFile, identity),
    }
  } finally {
    await database.close()
  }
}

function assertRecoveredSnapshot(before, actual, prepared) {
  const completedIds = [prepared.projects.present, prepared.projects.unlinked]
    .map(({ project }) => project.localProjectKey)
    .sort()
  const changedId = prepared.projects.changed.project.localProjectKey
  const neighborId = prepared.projects.neighbor.project.localProjectKey
  const expected = structuredClone(before)
  expected.tables.project_file_lifecycle.rows = expected.tables.project_file_lifecycle.rows.filter(
    ({ local_project_key }) => !completedIds.includes(local_project_key),
  )
  expected.tables.project_identity_binding.rows =
    expected.tables.project_identity_binding.rows.filter(
      ({ local_project_key }) => !completedIds.includes(local_project_key),
    )
  assert.deepEqual(expected.tables.project_identity_retired_key.rows, [])
  expected.tables.project_identity_retired_key.rows = completedIds.map((local_project_key) => ({
    local_project_key,
  }))
  const pending = expected.tables.project_file_lifecycle.rows.find(
    ({ local_project_key }) => local_project_key === changedId,
  )
  const neighbor = expected.tables.project_index.rows.find(
    ({ local_project_key }) => local_project_key === neighborId,
  )
  const observedPending = actual.tables.project_file_lifecycle.rows.find(
    ({ local_project_key }) => local_project_key === changedId,
  )
  const observedNeighbor = actual.tables.project_index.rows.find(
    ({ local_project_key }) => local_project_key === neighborId,
  )
  for (const [original, observed] of [
    [pending.updated_at, observedPending?.updated_at],
    [neighbor.indexed_at, observedNeighbor?.indexed_at],
  ]) {
    assert.ok(
      typeof observed === 'string' && Number.isFinite(Date.parse(observed)) && observed >= original,
    )
  }
  pending.updated_at = observedPending.updated_at
  pending.deletion_error = replacementDiagnostic
  neighbor.indexed_at = observedNeighbor.indexed_at
  assert.deepEqual(actual, expected)
  return {
    completedIds,
    pendingUpdatedAt: pending.updated_at,
    neighborIndexedAt: neighbor.indexed_at,
  }
}

async function assertFileOutcomes(prepared, identity) {
  const { projects, preservedOriginal, replacement, sentinel, workspace } = prepared
  for (const { original } of [projects.present, projects.unlinked]) {
    await assert.rejects(lstat(original.path), { code: 'ENOENT' })
  }
  for (const pin of [
    preservedOriginal,
    replacement,
    sentinel,
    projects.ordinary.original,
    projects.neighbor.original,
  ]) {
    assert.deepEqual(await fileWitness(pin.path, identity), pin)
  }
  for (const { retained } of Object.values(projects)) {
    assert.deepEqual(await identity(retained.path), retained)
  }
  assert.deepEqual(await identity(prepared.foreignSource.path), prepared.foreignSource)
  assert.deepEqual(
    (await readdir(workspace.directoryPath)).sort(),
    ['changed.igs', 'Keep this file.txt', 'neighbor.igs', 'ordinary.igs'].sort(),
  )
}

async function verifyHome(state, prepared, root, readPorts, label) {
  const { page } = state
  const { projects } = prepared
  const ports = await readPorts(state)
  assert.deepEqual(
    ports.projects.value.map(({ id }) => id),
    [projects.neighbor.project.localProjectKey],
  )
  const home = page.getByRole('region', { name: 'Home', exact: true })
  const navigation = home.getByLabel('Workspace navigation', { exact: true })
  await expect(
    home.getByRole('button', { name: `Open ${titles.neighbor}`, exact: true }),
  ).toBeVisible()
  await expect(home.getByText('Foreign replacement control', { exact: true })).toHaveCount(0)
  await page.screenshot({
    path: path.join(root, `${label}-active-home.png`),
    animations: 'disabled',
  })

  await page.getByRole('button', { name: 'List view', exact: true }).click()
  await navigation.getByRole('button', { name: /^Trash(?:\s+\d+)?$/ }).click()
  await expect(home.getByRole('heading', { name: 'Trash', exact: true })).toBeVisible()
  const trash = await page.evaluate(() => window.api.projects.listTrash())
  assert.equal(trash.ok, true)
  const actual = trash.value
    .map(({ id, title, trashId, deletionStatus, deletionError }) => ({
      id,
      title,
      trashId,
      deletionStatus,
      deletionError,
    }))
    .sort((a, b) => a.title.localeCompare(b.title))
  assert.deepEqual(
    actual,
    ['changed', 'ordinary'].map((name) => ({
      id: projects[name].project.localProjectKey,
      title: titles[name],
      trashId: projects[name].authority.trashId,
      deletionStatus: name === 'changed' ? 'deleting' : 'trashed',
      deletionError: name === 'changed' ? replacementDiagnostic : null,
    })),
  )
  const changed = home.locator(`[data-project-id="${projects.changed.project.localProjectKey}"]`)
  await expect(changed.getByText('Deletion pending', { exact: true })).toBeVisible()
  await expect(changed.getByText(replacementDiagnostic, { exact: true })).toBeVisible()
  await expect(
    changed.getByRole('button', { name: `Restore ${titles.changed}`, exact: true }),
  ).toBeDisabled()
  await expect(
    home.getByRole('button', { name: `Restore ${titles.ordinary}`, exact: true }),
  ).toBeEnabled()
  await page.screenshot({ path: path.join(root, `${label}-trash.png`), animations: 'disabled' })

  const restore = await page.evaluate(
    ({ id, trashId }) => window.api.projects.restoreProject(id, trashId),
    {
      id: projects.changed.project.localProjectKey,
      trashId: projects.changed.authority.trashId,
    },
  )
  assert.equal(restore.ok, false)
  assert.equal(restore.error.code, 'PROJECT_TRASH_DELETE_PENDING')
  await changed
    .getByRole('button', { name: `Delete ${titles.changed} permanently`, exact: true })
    .click()
  const dialog = page.getByRole('dialog', { name: 'Delete Project Permanently', exact: true })
  await expect(dialog.getByText(replacementDiagnostic, { exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Retry Delete', exact: true })).toBeEnabled()
  await page.screenshot({
    path: path.join(root, `${label}-retry-dialog.png`),
    animations: 'disabled',
  })
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(dialog).toBeHidden()
  return { trash: actual, restoreRefusal: restore.error }
}

export async function runPackagedProjectTrashRecovery({
  root,
  appData,
  ownedRunRoot,
  packageBefore,
  launch,
  readPorts,
  closeNormally,
  identity,
}) {
  const proof = JSON.parse(
    await readFile(path.join(path.dirname(root), 'package-proof.json'), 'utf8'),
  )
  assert.equal(proof.schemaVersion, 1)
  await assertOfflineProjectDesktop({
    scenario,
    suite: 'packaged-project-trash-recovery',
    root,
    ownedRunRoot,
    packageBefore,
    expectedPackage: proof.package,
  })
  assert.equal(await realpath(root), root)
  assert.equal(appData, path.join(root, 'data/imagegen-studio'))
  const prepared = await seed(root, appData, identity)
  const before = await retainedDatabase(prepared.database, root, 'before-startup', identity)
  const initialLifecycle = before.snapshot.tables.project_file_lifecycle.rows
  assert.deepEqual(initialLifecycle.map(({ state }) => state).sort(), [
    'deleting',
    'deleting',
    'deleting',
    'trashed',
  ])
  assert.equal(before.snapshot.tables.project_index.rows.length, 2)
  // Fresh paths use derived keys. Explicit bindings are allocated on relocation or path reuse.
  assert.deepEqual(before.snapshot.tables.project_identity_binding.rows, [])
  await writeFile(
    path.join(root, 'prepared-trash-authority.json'),
    JSON.stringify({ prepared, before: before.pin }, null, 2) + '\n',
    { flag: 'wx', mode: 0o600 },
  )

  const first = await launch('project-trash-recovery')
  const firstHome = await verifyHome(first, prepared, root, readPorts, 'startup')
  await assertFileOutcomes(prepared, identity)
  await closeNormally(first)
  assert.ok(first.normalPhysicalExit && !first.forcedCleanup)
  const saved = await retainedDatabase(prepared.database, root, 'after-startup', identity)
  const recovered = assertRecoveredSnapshot(before.snapshot, saved.snapshot, prepared)

  const second = await launch('project-trash-recovery-restarted')
  const secondHome = await verifyHome(second, prepared, root, readPorts, 'restarted')
  assert.deepEqual(secondHome, firstHome)
  await assertFileOutcomes(prepared, identity)
  await closeNormally(second)
  assert.ok(second.normalPhysicalExit && !second.forcedCleanup)
  const restarted = await retainedDatabase(prepared.database, root, 'after-repeat', identity)
  const repeated = assertRecoveredSnapshot(before.snapshot, restarted.snapshot, prepared)
  assert.deepEqual(repeated.completedIds, recovered.completedIds)
  assert.ok(repeated.pendingUpdatedAt >= recovered.pendingUpdatedAt)
  assert.ok(repeated.neighborIndexedAt >= recovered.neighborIndexedAt)
  await assertFileOutcomes(prepared, identity)

  return {
    saved: { databaseFiles: [saved.pin] },
    restarted: { databaseFiles: [restarted.pin] },
    offlineProjectResult: {
      before: { databaseFiles: [before.pin] },
      prepared,
      recovered,
      repeated,
      home: secondHome,
    },
  }
}
