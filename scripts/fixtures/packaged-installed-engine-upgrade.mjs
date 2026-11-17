/** Join the retained installed slot to a fresh historical producer, through the ordinary AppImage. */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { constants } from 'node:fs'
import { copyFile, lstat, readFile, readdir, realpath } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

import { expect } from '@playwright/test'

import { snapshotDatabase } from './application-state-upgrade-fixture.mjs'
import { compareStartup } from './application-state-upgrade-native.mjs'

const execute = promisify(execFile)
const historicalRevision = '6b812f93d2715af2c4f904e70093b3f9c5b09713'
const expectedRaster = { width: 48, height: 32, x: 0, y: 0 }
const exactTransform = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotationDegrees: 0 }
const backupName = /^app_backup_\d{8}-\d{6}(?:-\d+)?\.db$/

function inside(parent, filename) {
  return (
    path.isAbsolute(filename) &&
    path.normalize(filename) === filename &&
    filename.startsWith(`${parent}${path.sep}`)
  )
}

async function regular(filename, limit) {
  assert.equal(await realpath(filename), filename)
  const file = await lstat(filename)
  assert.ok(file.isFile() && file.nlink === 1 && file.size > 0 && file.size <= limit, filename)
  return file
}

async function backups(databasePath) {
  const directory = path.dirname(databasePath)
  const names = (await readdir(directory)).filter((name) => name.startsWith('app_backup_'))
  for (const name of names) assert.match(name, backupName)
  return names.map((name) => path.join(directory, name)).sort()
}

export async function readHistoricalUpgrade({ filename, engine, outputRoot, appImage, identity }) {
  const run = path.dirname(filename)
  assert.ok(inside(engine.run, run))
  assert.equal(filename, path.join(run, 'historical-fixture.json'))
  assert.equal(outputRoot, path.join(run, 'native'))
  await regular(filename, 8 * 1024 * 1024)
  const fixtureBefore = await identity(filename)
  const fixture = JSON.parse(await readFile(filename, 'utf8'))
  assert.deepEqual(await identity(filename), fixtureBefore)
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.historicalRevision, historicalRevision)
  assert.equal(fixture.appData, engine.dataRoot)
  assert.equal(fixture.runtime.kind, 'installed-engine')
  assert.equal(fixture.runtime.runtimeId, engine.runtimeId)
  assert.equal(fixture.runtime.pythonExecutable, engine.pythonExecutable)
  const python = path.join(
    engine.dataRoot,
    'runtime',
    'environments',
    engine.runtimeId,
    'bin/python',
  )
  assert.equal(engine.pythonExecutable, python)
  assert.ok(inside(path.join(engine.dataRoot, 'runtime'), await realpath(python)))

  const previousReportPath = path.join(engine.run, 'native/report.json')
  await regular(previousReportPath, 8 * 1024 * 1024)
  const previousReport = await identity(previousReportPath)
  const previous = JSON.parse(await readFile(previousReport.path, 'utf8'))
  assert.deepEqual(await identity(previousReport.path), previousReport)
  assert.equal(previous.outcome, 'PASS')
  assert.equal(previous.fullMvpAccepted, false)
  assert.equal(previous.packagedInstalledRuntime.runtimeId, engine.runtimeId)
  assert.deepEqual(previous.packageBefore, previous.packageAfter)
  assert.deepEqual(await identity(appImage), previous.packageBefore)

  const { database, project } = fixture
  assert.equal(database.file, path.join(engine.dataRoot, 'database/app.sqlite'))
  assert.ok(inside(run, database.checkpointFile))
  const active = await regular(database.file, 16 * 1024 * 1024)
  const checkpoint = await regular(database.checkpointFile, 16 * 1024 * 1024)
  assert.ok(active.dev !== checkpoint.dev || active.ino !== checkpoint.ino)
  assert.deepEqual(await backups(database.file), [])
  for (const file of [database.file, database.checkpointFile]) {
    const state = snapshotDatabase(file, { closed: true })
    assert.deepEqual(state, database.baseline)
    assert.equal(state.schemaMigrations.length, 29)
    assert.equal(state.tables.model_reference_identity, undefined)
    assert.equal(state.integrityCheck, 'ok')
    assert.deepEqual(state.foreignKeyCheck, [])
    assert.equal(state.tables.project_index.rows.length, 1)
    const [row] = state.tables.project_index.rows
    assert.equal(row.local_project_key, project.projectId)
    assert.equal(row.canonical_path, project.projectFile)
    assert.equal(row.document_id, project.documentId)
    assert.equal(row.document_revision, project.documentRevision)
    assert.equal(row.preview_status, 'unavailable')
  }

  const workspace = path.join(engine.dataRoot, 'workspaces/Uncategorized')
  assert.ok(inside(workspace, project.projectFile))
  assert.equal(path.dirname(project.projectFile), workspace)
  assert.equal(path.extname(project.projectFile), '.igs')
  await regular(project.projectFile, 16 * 1024 * 1024)
  const initialProject = await identity(project.projectFile)
  assert.equal(initialProject.sizeBytes, project.initialProject.sizeBytes)
  assert.equal(initialProject.sha256, project.initialProject.sha256)
  const { source, ...raster } = project.raster
  assert.equal(raster.kind, 'raster')
  assert.equal(raster.visible, true)
  assert.equal(raster.opacity, 1)
  assert.equal(raster.blendMode, 'normal')
  assert.deepEqual(raster.transform, exactTransform)
  assert.equal(raster.asset.width, expectedRaster.width)
  assert.equal(raster.asset.height, expectedRaster.height)
  assert.equal(raster.asset.path, `assets/layers/${raster.id}.png`)
  assert.match(raster.asset.sha256, /^[0-9a-f]{64}$/)
  assert.ok(inside(run, source.path))
  await regular(source.path, 1024 * 1024)
  const sourceBefore = await identity(source.path)
  assert.equal(sourceBefore.sha256, source.sha256)
  assert.equal(sourceBefore.sizeBytes, source.sizeBytes)

  return {
    fixture,
    initialProject,
    raster,
    python,
    inputs: [fixtureBefore, previousReport, await identity(database.checkpointFile), sourceBefore],
  }
}

async function projectCall(page, name, ...args) {
  const result = await page.evaluate(({ name, args }) => window.api.projects[name](...args), {
    name,
    args,
  })
  assert.equal(result.ok, true, JSON.stringify(result))
  return result.value
}

function assertTab(tab, project, raster, prompt, revision) {
  assert.equal(tab.id, project.projectId)
  assert.equal(tab.documentId, project.documentId)
  assert.equal(tab.documentRevision, revision)
  assert.equal(tab.generationDraft.positivePrompt.text, prompt)
  assert.equal(tab.dirty, false)
  assert.equal(tab.autosaveError, null)
  assert.equal(tab.storageWarning, undefined)
  assert.equal(tab.layers.length, 1)
  const [layer] = tab.layers
  for (const field of ['id', 'name', 'opacity', 'blendMode', 'visible', 'locked', 'transform']) {
    assert.deepEqual(layer[field], raster[field], `Raster ${field}`)
  }
  assert.equal(layer.width, raster.asset.width)
  assert.equal(layer.height, raster.asset.height)
}

async function openProject(page, project) {
  await page.getByRole('button', { name: `Open ${project.projectTitle}`, exact: true }).click()
  await expect(page.getByRole('tab', { name: project.projectTitle, exact: true })).toBeVisible()
  const opened = await projectCall(page, 'open', project.projectId)
  assert.equal(opened.kind, 'opened')
  return opened.tab
}

function compareAfterProjectAction(before, after, allowedColumns) {
  const index = 'project_index'
  const { [index]: beforeIndex, ...beforeTables } = before.tables
  const { [index]: afterIndex, ...afterTables } = after.tables
  assert.deepEqual({ ...before, tables: beforeTables }, { ...after, tables: afterTables })
  assert.deepEqual(beforeIndex.columns, afterIndex.columns)
  assert.equal(beforeIndex.rows.length, 1)
  assert.equal(afterIndex.rows.length, 1)
  const [oldRow] = beforeIndex.rows
  const [newRow] = afterIndex.rows
  const changes = Object.keys(oldRow)
    .filter((name) => oldRow[name] !== newRow[name])
    .sort()
  assert.ok(
    changes.every((name) => allowedColumns.includes(name)),
    JSON.stringify(changes),
  )
  return { changes, row: newRow }
}

// Pillow decodes the finished ordinary zipfile independently of the worker's compositor/protocol.
// All pixels in this finite opaque fixture have a single expected RGBA value.
const readPreview = String.raw`
import hashlib, io, json, sys, zipfile
from PIL import Image

filename, raster, icc_hash = sys.argv[1:]
profile = 'assets/profiles/' + icc_hash + '.icc'
with zipfile.ZipFile(filename) as package:
    members = package.infolist()
    expected = {'mimetype', 'manifest.json', 'project.json', 'preview/merged.png',
                'preview/thumbnail.webp', raster, profile}
    assert len(members) == len(expected) and {item.filename for item in members} == expected
    assert all(item.file_size <= 1024 * 1024 for item in members)
    assert package.testzip() is None
    manifest = json.loads(package.read('manifest.json'))
    project = json.loads(package.read('project.json'))
    assert hashlib.sha256(package.read(profile)).hexdigest() == icc_hash
    hashes = {}
    for name, format in [(raster, 'PNG'), ('preview/merged.png', 'PNG'), ('preview/thumbnail.webp', 'WEBP')]:
        data = package.read(name)
        with Image.open(io.BytesIO(data)) as image:
            assert image.size == (48, 32) and image.format == format
            assert hashlib.sha256(image.info['icc_profile']).hexdigest() == icc_hash
            assert image.convert('RGBA').tobytes() == bytes([31, 101, 197, 255]) * (48 * 32)
        hashes[name] = hashlib.sha256(data).hexdigest()
    print(json.dumps(dict(manifest=manifest, project=project, hashes=hashes,
                          sourceProfileSha256=icc_hash, checkedPixels=48 * 32 * 3)))
`

export async function runHistoricalUpgrade({
  history,
  launch,
  readPorts,
  closeNormally,
  retainOwnStore,
  root,
  migrationHash,
  iccHash,
  identity,
  records,
}) {
  const { fixture, raster, python, initialProject } = history
  const { database, project } = fixture
  const startupArgs = { projectId: project.projectId, migrationHash }
  const first = await launch('first')
  const initialPorts = await readPorts(first)
  assert.equal(initialPorts.projects.value.length, 1)
  assert.equal(initialPorts.projects.value[0].id, project.projectId)
  assert.equal(initialPorts.projects.value[0].previewStatus, 'unavailable')
  const startup = snapshotDatabase(database.file)
  const firstStartup = compareStartup(database.baseline, startup, { ...startupArgs, first: true })
  const paths = await backups(database.file)
  assert.equal(paths.length, 1)
  const [backupPath] = paths
  const backupEntry = await regular(backupPath, 16 * 1024 * 1024)
  assert.equal(backupEntry.mode & 0o777, 0o600)
  const current = await lstat(database.file)
  assert.ok(backupEntry.dev !== current.dev || backupEntry.ino !== current.ino)
  const backupState = snapshotDatabase(backupPath, { closed: true })
  assert.deepEqual(backupState, database.baseline)
  const backupBefore = await identity(backupPath)
  const savedBackupPath = path.join(root, 'startup-backup-29.sqlite')
  await copyFile(backupPath, savedBackupPath, constants.COPYFILE_EXCL)
  assert.deepEqual(snapshotDatabase(savedBackupPath, { closed: true }), backupState)
  assert.equal((await identity(savedBackupPath)).sha256, backupBefore.sha256)
  assert.deepEqual(await identity(backupPath), backupBefore)
  assert.deepEqual(await identity(project.projectFile), initialProject)
  records.push({
    name: 'Packaged Main creates an exact pre-migration backup and upgrades DB 29 to 30',
    firstStartup,
  })

  const firstTab = await openProject(first.page, project)
  assertTab(firstTab, project, raster, project.initialPrompt, project.documentRevision)
  const prompt = `${project.initialPrompt}\nSaved after verified installed-engine startup.`
  await first.page.getByRole('textbox', { name: 'Positive prompt', exact: true }).fill(prompt)
  await expect
    .poll(async () => (await projectCall(first.page, 'open', project.projectId)).tab.dirty)
    .toBe(true)
  await first.page.getByRole('button', { name: 'Save Project', exact: true }).click()
  await expect
    .poll(async () => (await projectCall(first.page, 'open', project.projectId)).tab.dirty)
    .toBe(false)
  const savedTab = (await projectCall(first.page, 'open', project.projectId)).tab
  assert.notEqual(savedTab.documentRevision, project.documentRevision)
  assertTab(savedTab, project, raster, prompt, savedTab.documentRevision)
  const [summary] = await projectCall(first.page, 'list')
  assert.equal(summary.id, project.projectId)
  assert.equal(
    summary.previewStatus,
    'rendered',
    'Save must produce the actual worker preview, without placeholders.',
  )
  await closeNormally(first)
  const saved = await retainOwnStore('after-first-close')
  assert.equal(saved.project.path, initialProject.path)
  assert.notEqual(saved.project.sha256, initialProject.sha256)
  const { stdout } = await execute(
    python,
    [
      '-I',
      '-B',
      '-c',
      readPreview,
      path.join(root, saved.retainedProject),
      raster.asset.path,
      iccHash,
    ],
    { timeout: 10_000, maxBuffer: 256 * 1024 },
  )
  const preview = JSON.parse(stdout)
  assert.equal(preview.manifest.documentId, project.documentId)
  assert.equal(preview.manifest.documentRevision, savedTab.documentRevision)
  assert.deepEqual(preview.manifest.preview, { rect: expectedRaster, status: 'rendered' })
  assert.equal(preview.project.documentId, project.documentId)
  assert.equal(preview.project.documentRevision, savedTab.documentRevision)
  assert.equal(preview.project.generationDraft.positivePrompt.text, prompt)
  assert.deepEqual(preview.project.layers, [raster])
  assert.equal(preview.hashes[raster.asset.path], raster.asset.sha256)
  const savedDatabase = snapshotDatabase(database.file, { closed: true })
  const saveComparison = compareAfterProjectAction(startup, savedDatabase, [
    'document_revision',
    'file_fingerprint',
    'file_mtime_ns',
    'file_size_bytes',
    'indexed_at',
    'last_opened_at',
    'preview_status',
    'preview_thumbnail_sha256',
  ])
  assert.equal(saveComparison.row.document_revision, savedTab.documentRevision)
  assert.equal(saveComparison.row.preview_status, 'rendered')
  assert.equal(
    saveComparison.row.preview_thumbnail_sha256,
    preview.hashes['preview/thumbnail.webp'],
  )
  assert.equal(saveComparison.row.file_size_bytes, saved.project.sizeBytes)
  records.push({
    name: 'Explicit packaged Save uses the installed CPU image worker and preserves exact source pixels',
    preview,
  })

  const second = await launch('restarted')
  const reopenedPorts = await readPorts(second)
  assert.equal(reopenedPorts.projects.value.length, 1)
  assert.equal(reopenedPorts.projects.value[0].id, project.projectId)
  assert.equal(reopenedPorts.projects.value[0].previewStatus, 'rendered')
  const secondStartup = compareStartup(savedDatabase, snapshotDatabase(database.file), {
    ...startupArgs,
    first: false,
  })
  const reopened = await openProject(second.page, project)
  assertTab(reopened, project, raster, prompt, savedTab.documentRevision)
  await closeNormally(second)
  const restarted = await retainOwnStore('after-restarted-close')
  assert.deepEqual(restarted.project, saved.project)
  const reopenComparison = compareAfterProjectAction(
    savedDatabase,
    snapshotDatabase(database.file, { closed: true }),
    ['indexed_at', 'last_opened_at'],
  )
  assert.deepEqual(await backups(database.file), [backupPath])
  assert.deepEqual(await identity(backupPath), backupBefore)
  assert.deepEqual(snapshotDatabase(backupPath, { closed: true }), backupState)
  for (const input of history.inputs) assert.deepEqual(await identity(input.path), input)

  return {
    saved,
    restarted,
    historicalUpgrade: {
      historicalRevision,
      firstStartup,
      secondStartup,
      saveComparison,
      reopenComparison,
      backup: {
        ...backupBefore,
        retained: savedBackupPath,
        migrations: backupState.schemaMigrations.length,
      },
      installedCpuPreview: {
        checkedPixels: preview.checkedPixels,
        hashes: preview.hashes,
        sourceProfileSha256: preview.sourceProfileSha256,
      },
    },
  }
}
