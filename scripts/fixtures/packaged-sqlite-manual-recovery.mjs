// Recovery procedure: InvokeAI 4875d96531ca6712b288f6e660fcbb34143408c1,
// docs/src/content/docs/start-here/upgrading.mdx:59–97.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { constants } from 'node:fs'
import { copyFile, lstat, mkdir, readFile, readdir, realpath, rename } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { expect } from '@playwright/test'

import { openAppDatabase } from '../../src/main/db/database.ts'
import { ProjectIndexRepository } from '../../src/main/projects/project-index.ts'
import { ProjectSession } from '../../src/main/projects/project-session.ts'
import { snapshotDatabase } from './application-state-upgrade-fixture.mjs'
import { compareStartup } from './application-state-upgrade-native.mjs'
import { assertOfflineProjectDesktop } from './packaged-noobai-import-chooser.mjs'

const execute = promisify(execFile)
const migrations = fileURLToPath(new URL('../../src/main/db/migrations/', import.meta.url))
const placeholdersDir = fileURLToPath(
  new URL('../../src/main/projects/placeholders/', import.meta.url),
)
const title = 'Manual SQLite recovery control'
const filename = 'Manual SQLite recovery control.igs'
const beforeMarker = {
  key: 'qualification.manual-recovery.before',
  value: 'The selected pre-migration backup contains this row.',
}
const walMarker = {
  key: 'qualification.manual-recovery.after',
  value: 'This committed row is present only in the set-aside current database.',
}
const sqlSuffixes = ['', '-wal', '-shm']
const backupName = /^app_backup_\d{8}-\d{6}(?:-\d+)?\.db$/

async function witness(file, identity) {
  assert.equal(await realpath(file), file)
  const entry = await lstat(file, { bigint: true })
  assert.ok(entry.isFile() && entry.uid === BigInt(process.getuid()) && entry.nlink === 1n)
  const bytes = await identity(file)
  const after = await lstat(file, { bigint: true })
  assert.equal(BigInt(bytes.sizeBytes), entry.size)
  for (const key of ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'])
    assert.equal(after[key], entry[key])
  return {
    ...bytes,
    device: String(entry.dev),
    inode: String(entry.ino),
    mode: Number(entry.mode & 0o777n),
    mtimeNs: String(entry.mtimeNs),
  }
}

async function noSidecars(database) {
  for (const suffix of ['-wal', '-shm', '-journal']) {
    await assert.rejects(lstat(database + suffix), { code: 'ENOENT' })
  }
}

async function backups(database) {
  const dir = path.dirname(database)
  const names = (await readdir(dir)).filter((name) => name.startsWith('app_backup_')).sort()
  assert.ok(names.every((name) => backupName.test(name)))
  return names.map((name) => path.join(dir, name))
}

async function retainBackup(root, name, source, identity) {
  const destination = path.join(root, name)
  await copyFile(source.path, destination, constants.COPYFILE_EXCL)
  const retained = await witness(destination, identity)
  assert.equal(retained.sha256, source.sha256)
  assert.equal(retained.sizeBytes, source.sizeBytes)
  assert.notEqual(retained.inode, source.inode)
  return retained
}

async function seed(root, appData) {
  await assert.rejects(lstat(appData), { code: 'ENOENT' })
  await mkdir(appData, { recursive: true, mode: 0o700 })
  const previousMigrations = path.join(root, 'schema-29-migrations')
  await mkdir(previousMigrations, { mode: 0o700 })
  const names = (await readdir(migrations)).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort()
  assert.deepEqual(
    names.map((name) => Number(name.slice(0, 4))),
    Array.from({ length: 30 }, (_, index) => index + 1),
  )
  const migrationName = '0030_model_reference_identity.sql'
  assert.equal(names.at(-1), migrationName)
  for (const name of names.slice(0, -1)) {
    await copyFile(
      path.join(migrations, name),
      path.join(previousMigrations, name),
      constants.COPYFILE_EXCL,
    )
  }
  const store = openAppDatabase(appData, previousMigrations)
  try {
    const repository = new ProjectIndexRepository(store.db)
    const workspace = await repository.ensureDefaultWorkspace(appData)
    assert.equal(workspace.directoryPath, path.join(appData, 'workspaces/Uncategorized'))
    const projectPath = path.join(workspace.directoryPath, filename)
    const session = await ProjectSession.create(projectPath, title, {
      placeholdersDir,
      scratchDir: path.join(root, 'seed-scratch'),
    })
    const project = await repository.indexSaved(projectPath, workspace.id)
    assert.equal(project.documentId, session.document.documentId)
    await store.db.insertInto('app_metadata').values(beforeMarker).execute()
    return { database: store.filePath, migrationName, project, projectPath }
  } finally {
    await store.close()
  }
}

async function observeProject(state, readPorts, project) {
  const ports = await readPorts(state)
  assert.equal(ports.projects.value.length, 1)
  assert.equal(ports.projects.value[0].id, project.localProjectKey)
  assert.equal(ports.projects.value[0].title, title)
  await expect(
    state.page
      .getByRole('region', { name: 'Home', exact: true })
      .getByRole('button', { name: `Open ${title}`, exact: true }),
  ).toBeVisible()
}

// The bounded local fixture child leaves real WAL frames after physical exit. Python closes no
// SQLite connection here. The only abrupt exit is this synthetic marker writer.
const markerWriter = [
  'import os, sqlite3, sys',
  'from pathlib import Path',
  'db = sqlite3.connect(Path(sys.argv[1]).as_uri() + "?mode=rw", uri=True)',
  'assert db.execute("PRAGMA journal_mode").fetchone() == ("wal",)',
  'db.execute("PRAGMA wal_autocheckpoint=0")',
  'db.execute("PRAGMA synchronous=FULL")',
  'db.execute("INSERT INTO app_metadata (key, value) VALUES (?, ?)", sys.argv[2:4])',
  'db.commit()',
  'print(os.getpid(), flush=True)',
  'os._exit(0)',
].join('\n')

function expectedWalSnapshot(before) {
  const expected = structuredClone(before)
  const metadata = expected.tables.app_metadata.rows
  assert.ok(!metadata.some(({ key }) => key === walMarker.key))
  metadata.push(walMarker)
  metadata.sort((a, b) => (a.key > b.key ? 1 : -1))
  return expected
}

export async function runPackagedSqliteManualRecovery({
  root,
  appData,
  ownedRunRoot,
  packageBefore,
  launch,
  readPorts,
  closeNormally,
  retainOwnStore,
  identity,
}) {
  const proof = JSON.parse(
    await readFile(path.join(path.dirname(root), 'package-proof.json'), 'utf8'),
  )
  assert.equal(proof.schemaVersion, 1)
  await assertOfflineProjectDesktop({
    scenario: 'sqlite-manual-recovery',
    suite: 'packaged-sqlite-manual-recovery',
    root,
    ownedRunRoot,
    packageBefore,
    expectedPackage: proof.package,
  })
  assert.equal(await realpath(root), root)
  assert.equal(appData, path.join(root, 'data/imagegen-studio'))
  const { database, migrationName, project, projectPath } = await seed(root, appData)
  const migrationHash = (await identity(path.join(migrations, migrationName))).sha256
  const comparisonOptions = { first: true, projectId: project.localProjectKey, migrationHash }
  await noSidecars(database)
  assert.deepEqual(await backups(database), [])
  const base = snapshotDatabase(database, { closed: true })
  assert.equal(base.schemaMigrations.length, 29)
  assert.deepEqual(base.tables.app_metadata.rows, [beforeMarker])
  const projectBefore = await witness(projectPath, identity)

  const first = await launch('sqlite-before-manual-recovery')
  await observeProject(first, readPorts, project)
  await closeNormally(first)
  assert.ok(first.normalPhysicalExit && !first.forcedCleanup)
  await noSidecars(database)
  const saved = await retainOwnStore('before-manual-recovery', filename)
  const originalMain = await witness(database, identity)
  const upgraded = snapshotDatabase(database, { closed: true })
  const firstComparison = compareStartup(base, upgraded, comparisonOptions)
  const namedBackups = await backups(database)
  assert.equal(namedBackups.length, 1)
  const [selectedPath] = namedBackups
  const selected = await witness(selectedPath, identity)
  assert.equal(selected.mode, 0o600)
  assert.notEqual(selected.inode, originalMain.inode)
  assert.deepEqual(snapshotDatabase(selectedPath, { closed: true }), base)
  assert.deepEqual(await witness(projectPath, identity), projectBefore)

  // The most recent name is deliberately a newer schema. Choose the actual pre-migration copy.
  const decoyPath = path.join(path.dirname(database), 'app_backup_99991231-235959.db')
  await copyFile(database, decoyPath, constants.COPYFILE_EXCL)
  const decoy = await witness(decoyPath, identity)
  assert.notEqual(decoy.sha256, selected.sha256)
  assert.deepEqual(snapshotDatabase(decoyPath, { closed: true }), upgraded)
  assert.deepEqual(await backups(database), [selectedPath, decoyPath])

  const { stdout } = await execute(
    '/usr/bin/python3',
    ['-I', '-c', markerWriter, database, walMarker.key, walMarker.value],
    { timeout: 10_000, maxBuffer: 1024 },
  )
  assert.match(stdout.trim(), /^[1-9]\d*$/)
  assert.deepEqual(await witness(database, identity), originalMain)
  const current = []
  for (const suffix of sqlSuffixes) {
    const file = await witness(database + suffix, identity)
    assert.ok(file.sizeBytes > (suffix === '-wal' ? 32 : 0))
    current.push(file)
  }
  const preservedDirectory = path.join(root, 'set-aside-current-database')
  await mkdir(preservedDirectory, { mode: 0o700 })
  assert.equal(
    (await lstat(preservedDirectory, { bigint: true })).dev.toString(),
    originalMain.device,
  )
  const preserved = []
  for (const file of current) {
    assert.deepEqual(await witness(file.path, identity), file)
    const destination = path.join(preservedDirectory, path.basename(file.path))
    await assert.rejects(lstat(destination), { code: 'ENOENT' })
    await rename(file.path, destination)
    const moved = await witness(destination, identity)
    assert.deepEqual(moved, { ...file, path: destination })
    preserved.push(moved)
  }
  await noSidecars(database)
  await assert.rejects(lstat(database), { code: 'ENOENT' })

  // Open only disposable copies. SQLite can edit the shared-memory index even for a readonly
  // connection, and the set-aside raw trio is part of the evidence.
  const readbackDirectory = path.join(root, 'wal-readback')
  await mkdir(readbackDirectory, { mode: 0o700 })
  const copiedMain = path.join(readbackDirectory, 'app.sqlite')
  for (const file of preserved) {
    await copyFile(
      file.path,
      path.join(readbackDirectory, path.basename(file.path)),
      constants.COPYFILE_EXCL,
    )
  }
  assert.deepEqual(snapshotDatabase(copiedMain), expectedWalSnapshot(upgraded))
  for (const file of preserved) assert.deepEqual(await witness(file.path, identity), file)

  await copyFile(selectedPath, database, constants.COPYFILE_EXCL)
  const restore = await witness(database, identity)
  assert.equal(restore.sha256, selected.sha256)
  assert.equal(restore.mode, 0o600)
  assert.notEqual(restore.inode, selected.inode)
  assert.notEqual(restore.inode, originalMain.inode)
  assert.deepEqual(snapshotDatabase(database, { closed: true }), base)

  const second = await launch('sqlite-after-manual-recovery')
  await observeProject(second, readPorts, project)
  await closeNormally(second)
  assert.ok(second.normalPhysicalExit && !second.forcedCleanup)
  await noSidecars(database)
  const restarted = await retainOwnStore('after-manual-recovery', filename)
  assert.deepEqual(restarted.project, saved.project)
  assert.deepEqual(await witness(projectPath, identity), projectBefore)
  const recovered = snapshotDatabase(database, { closed: true })
  const secondComparison = compareStartup(base, recovered, comparisonOptions)
  assert.deepEqual(recovered.tables.app_metadata.rows, [beforeMarker])
  const finalNames = await backups(database)
  assert.equal(finalNames.length, 3)
  assert.equal(finalNames.at(-1), decoyPath)
  const [newPath, ...others] = finalNames.filter(
    (item) => ![selectedPath, decoyPath].includes(item),
  )
  assert.ok(newPath && others.length === 0)
  const newBackup = await witness(newPath, identity)
  assert.equal(newBackup.mode, 0o600)
  assert.notEqual(newBackup.inode, selected.inode)
  assert.deepEqual(snapshotDatabase(newPath, { closed: true }), base)
  assert.deepEqual(await witness(selectedPath, identity), selected)
  assert.deepEqual(await witness(decoyPath, identity), decoy)
  for (const file of preserved) assert.deepEqual(await witness(file.path, identity), file)
  const retainedBackups = {
    selected: await retainBackup(root, 'selected-backup-29.sqlite', selected, identity),
    remigration: await retainBackup(root, 'remigration-backup-29.sqlite', newBackup, identity),
    decoy: await retainBackup(root, 'decoy-backup-30.sqlite', decoy, identity),
  }

  return {
    saved,
    restarted,
    offlineProjectResult: {
      beforeMarker,
      decoy,
      firstComparison,
      markerWriterPid: Number(stdout.trim()),
      newBackup,
      preserved,
      projectBefore,
      restore,
      retainedBackups,
      secondComparison,
      selected,
      walMarker,
    },
  }
}
