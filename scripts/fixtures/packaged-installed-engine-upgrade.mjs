/** Join the retained installed slot to a fresh historical producer, through the ordinary AppImage. */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { constants } from 'node:fs'
import { copyFile, lstat, readFile, readdir, realpath } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

import { expect } from '@playwright/test'

import { snapshotDatabase } from './application-state-upgrade-fixture.mjs'
import {
  compareArchiveWitnessMetadata,
  compareStartup,
} from './application-state-upgrade-native.mjs'

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

export async function readHistoricalUpgrade({
  filename,
  engine,
  outputRoot,
  appImage,
  identity,
  protocolRefusal,
}) {
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
  const packageIdentity = await identity(appImage)
  if (protocolRefusal) {
    assert.deepEqual(packageIdentity, protocolRefusal.packageIdentity)
    assert.ok(inside(engine.run, previous.packageBefore.path))
    await regular(previous.packageBefore.path, 512 * 1024 ** 2)
    assert.deepEqual(await identity(previous.packageBefore.path), previous.packageBefore)
  } else assert.deepEqual(packageIdentity, previous.packageBefore)

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
  const inputs = [
    fixtureBefore,
    previousReport,
    await identity(database.checkpointFile),
    sourceBefore,
  ]
  let previewPlaceholders
  if (protocolRefusal) {
    inputs.push(packageIdentity, previous.packageBefore)
    const { queue, model, checkpoint29 } = fixture
    assert.equal(queue.status, 'canceled')
    assert.equal(queue.localProjectKey, project.projectId)
    assert.equal(queue.projectPath, project.projectFile)
    assert.match(queue.id, /^[0-9a-f-]{36}$/)
    const inputDir = path.join(engine.dataRoot, 'generation-inputs', queue.id)
    const retainedFiles = [
      path.join(inputDir, 'manifest.json'),
      path.join(inputDir, 'target.png'),
      path.join(engine.dataRoot, 'models/compatibility-fixture.safetensors'),
    ]
    assert.equal(retainedFiles[2], model.file.path)
    const dataHome = path.dirname(engine.dataRoot)
    const checkpointPin = (file) =>
      checkpoint29.files.find(
        (entry) => entry.path === path.join('data', path.relative(dataHome, file)),
      )
    assert.deepEqual(
      checkpoint29.files.map(({ path: file }) => file).sort(),
      [database.file, project.projectFile, ...retainedFiles]
        .map((file) => path.join('data', path.relative(dataHome, file)))
        .sort(),
    )
    for (const file of [database.file, database.checkpointFile, ...retainedFiles]) {
      const pin = checkpointPin(file === database.checkpointFile ? database.file : file)
      assert.equal(pin?.kind, 'file')
      await regular(file, 16 * 1024 * 1024)
      const actual = await identity(file)
      assert.equal(actual.sizeBytes, pin.sizeBytes)
      assert.equal(actual.sha256, pin.sha256)
      if (retainedFiles.includes(file)) inputs.push(actual)
    }
    const projectPin = checkpointPin(project.projectFile)
    assert.equal(projectPin?.kind, 'file')
    assert.equal(initialProject.sizeBytes, projectPin.sizeBytes)
    assert.equal(initialProject.sha256, projectPin.sha256)
    const placeholderDir = path.resolve(import.meta.dirname, '../../src/main/projects/placeholders')
    previewPlaceholders = {}
    for (const [member, name] of [
      ['preview/merged.png', 'unavailable.png'],
      ['preview/thumbnail.webp', 'unavailable.webp'],
    ]) {
      const file = path.join(placeholderDir, name)
      await regular(file, 1024 * 1024)
      const actual = await identity(file)
      inputs.push(actual)
      previewPlaceholders[member] = actual.sha256
    }
  }

  return {
    fixture,
    initialProject,
    raster,
    python,
    inputs,
    previewPlaceholders,
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

function compareAfterProjectAction(before, after, allowedColumns, archiveProof) {
  const index = 'project_index'
  const { [index]: beforeIndex, ...beforeTables } = before.tables
  const { [index]: afterIndex, ...afterTables } = after.tables
  const metadataDelta = compareArchiveWitnessMetadata(
    beforeTables.app_metadata.rows,
    afterTables.app_metadata.rows,
    archiveProof,
  )
  assert.deepEqual(
    {
      ...before,
      tables: {
        ...beforeTables,
        app_metadata: { ...beforeTables.app_metadata, rows: afterTables.app_metadata.rows },
      },
    },
    { ...after, tables: afterTables },
  )
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
  return { changes, row: newRow, metadataDelta }
}

async function compareRestoredStartup(baseline, startup, project, startupArgs) {
  const stat = await lstat(project.projectFile, { bigint: true })
  const expected = {
    file_fingerprint: `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`,
    file_mtime_ns: String(stat.mtimeNs),
  }
  const [row] = startup.tables.project_index.rows
  assert.equal(row.local_project_key, project.projectId)
  assert.equal(row.file_size_bytes, Number(stat.size))
  const before = structuredClone(baseline)
  const [beforeRow] = before.tables.project_index.rows
  const restoredProjectFile = {}
  for (const [column, value] of Object.entries(expected)) {
    assert.equal(row[column], value)
    if (beforeRow[column] !== value)
      restoredProjectFile[column] = { before: beforeRow[column], after: value }
    beforeRow[column] = value
  }
  return {
    ...compareStartup(before, startup, { ...startupArgs, first: true }),
    restoredProjectFile,
  }
}

// Pillow decodes the finished ordinary zipfile independently of the worker's compositor/protocol.
// Only the raster and rendered previews have the fixture's expected 48×32 RGBA pixels.
const readPreview = String.raw`
import hashlib, io, json, sys, zipfile
from PIL import Image

filename, raster, icc_hash, preview_status = sys.argv[1:]
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
    checked_pixels = 0
    for name, format in [(raster, 'PNG'), ('preview/merged.png', 'PNG'), ('preview/thumbnail.webp', 'WEBP')]:
        data = package.read(name)
        with Image.open(io.BytesIO(data)) as image:
            assert image.format == format
            if name == raster or preview_status == 'rendered':
                assert image.size == (48, 32)
                assert hashlib.sha256(image.info['icc_profile']).hexdigest() == icc_hash
                assert image.convert('RGBA').tobytes() == bytes([31, 101, 197, 255]) * (48 * 32)
                checked_pixels += 48 * 32
        hashes[name] = hashlib.sha256(data).hexdigest()
    print(json.dumps(dict(manifest=manifest, project=project, hashes=hashes,
                          sourceProfileSha256=icc_hash, checkedPixels=checked_pixels)))
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
  protocolRefusal,
}) {
  const { fixture, raster, python, initialProject, previewPlaceholders } = history
  assert.equal(Boolean(protocolRefusal), Boolean(previewPlaceholders))
  const { database, project } = fixture
  const previewStatus = protocolRefusal ? 'unavailable' : 'rendered'
  const startupArgs = {
    projectId: project.projectId,
    migrationHash,
    archiveSha256: initialProject.sha256,
  }
  const first = await launch('first')
  const initialPorts = await readPorts(first)
  assert.equal(initialPorts.projects.value.length, 1)
  assert.equal(initialPorts.projects.value[0].id, project.projectId)
  assert.equal(initialPorts.projects.value[0].previewStatus, 'unavailable')
  const startup = snapshotDatabase(database.file)
  const firstStartup = protocolRefusal
    ? await compareRestoredStartup(database.baseline, startup, project, startupArgs)
    : compareStartup(database.baseline, startup, { ...startupArgs, first: true })
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
  if (protocolRefusal) await protocolRefusal.assertUnavailable(first, firstTab, fixture.queue)
  const prompt = protocolRefusal
    ? `${project.initialPrompt}\nSaved with the incompatible installed engine.`
    : `${project.initialPrompt}\nSaved after verified installed-engine startup.`
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
    previewStatus,
    protocolRefusal
      ? 'A nonempty Project must Save with the unavailable preview.'
      : 'Save must produce the actual worker preview, without placeholders.',
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
      previewStatus,
    ],
    { timeout: 10_000, maxBuffer: 256 * 1024 },
  )
  const preview = JSON.parse(stdout)
  assert.equal(preview.manifest.documentId, project.documentId)
  assert.equal(preview.manifest.documentRevision, savedTab.documentRevision)
  assert.deepEqual(preview.manifest.preview, { rect: expectedRaster, status: previewStatus })
  assert.equal(preview.project.documentId, project.documentId)
  assert.equal(preview.project.documentRevision, savedTab.documentRevision)
  assert.equal(preview.project.generationDraft.positivePrompt.text, prompt)
  assert.deepEqual(preview.project.layers, [raster])
  assert.equal(preview.hashes[raster.asset.path], raster.asset.sha256)
  for (const [member, placeholderHash] of Object.entries(previewPlaceholders ?? {})) {
    assert.equal(preview.hashes[member], placeholderHash, member)
  }
  const savedDatabase = snapshotDatabase(database.file, { closed: true })
  const savedArchiveProof = {
    archiveSha256: saved.project.sha256,
    archiveValidator: firstStartup.startupDeltas.find(({ table }) => table === 'app_metadata')
      ?.validator,
  }
  const saveComparison = compareAfterProjectAction(
    startup,
    savedDatabase,
    [
      'document_revision',
      'file_fingerprint',
      'file_mtime_ns',
      'file_size_bytes',
      'indexed_at',
      'last_opened_at',
      'preview_status',
      'preview_thumbnail_sha256',
    ],
    savedArchiveProof,
  )
  savedArchiveProof.archiveValidator ??= saveComparison.metadataDelta?.validator
  assert.equal(saveComparison.row.document_revision, savedTab.documentRevision)
  assert.equal(saveComparison.row.preview_status, previewStatus)
  assert.equal(
    saveComparison.row.preview_thumbnail_sha256,
    preview.hashes['preview/thumbnail.webp'],
  )
  assert.equal(saveComparison.row.file_size_bytes, saved.project.sizeBytes)
  records.push({
    name: protocolRefusal
      ? 'Explicit packaged Save writes the unavailable preview and preserves exact source pixels'
      : 'Explicit packaged Save uses the installed CPU image worker and preserves exact source pixels',
    preview,
  })

  const second = await launch('restarted')
  const reopenedPorts = await readPorts(second)
  assert.equal(reopenedPorts.projects.value.length, 1)
  assert.equal(reopenedPorts.projects.value[0].id, project.projectId)
  assert.equal(reopenedPorts.projects.value[0].previewStatus, previewStatus)
  const secondStartup = compareStartup(savedDatabase, snapshotDatabase(database.file), {
    ...startupArgs,
    ...savedArchiveProof,
    first: false,
  })
  const reopened = await openProject(second.page, project)
  assertTab(reopened, project, raster, prompt, savedTab.documentRevision)
  if (protocolRefusal) await protocolRefusal.assertUnavailable(second, reopened, fixture.queue)
  await closeNormally(second)
  const restarted = await retainOwnStore('after-restarted-close')
  assert.deepEqual(restarted.project, saved.project)
  const reopenComparison = compareAfterProjectAction(
    savedDatabase,
    snapshotDatabase(database.file, { closed: true }),
    ['indexed_at', 'last_opened_at'],
    savedArchiveProof,
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
      [protocolRefusal ? 'unavailablePreview' : 'installedCpuPreview']: {
        checkedPixels: preview.checkedPixels,
        hashes: preview.hashes,
        sourceProfileSha256: preview.sourceProfileSha256,
      },
    },
  }
}
