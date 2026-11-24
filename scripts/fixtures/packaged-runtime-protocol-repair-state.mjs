/** Historical Project and queue oracles for the incompatible-worker Repair qualification. */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { copyFile, lstat, readFile, readdir, realpath } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

import { expect } from '@playwright/test'

import { readIgsPackage } from '../../src/main/projects/igs-package.ts'
import { snapshotDatabase } from './application-state-upgrade-fixture.mjs'
import { compareStartup } from './application-state-upgrade-native.mjs'

const execute = promisify(execFile)
const historicalRevision = '6b812f93d2715af2c4f904e70093b3f9c5b09713'
const maximumFileBytes = 16 * 1024 * 1024
const backupName = /^app_backup_\d{8}-\d{6}(?:-\d+)?\.db$/
const renderedPreviewRect = { x: 0, y: 0, width: 48, height: 32 }
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

async function readOwnedFile(filename, identity) {
  assert.ok(path.isAbsolute(filename))
  assert.equal(await realpath(filename), filename)
  const stat = async () => {
    const entry = await lstat(filename, { bigint: true })
    assert.ok(entry.isFile() && entry.nlink === 1n && entry.uid === BigInt(process.getuid()))
    assert.ok(entry.size > 0n && entry.size <= BigInt(maximumFileBytes), filename)
    return entry
  }
  const before = await stat()
  const bytes = await identity(filename)
  const after = await stat()
  const fields = ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs']
  for (const field of fields) assert.equal(before[field], after[field], filename)
  assert.equal(bytes.sizeBytes, Number(before.size))
  return {
    ...bytes,
    fingerprint: fields.map((field) => before[field]).join(':'),
    mtimeNs: String(before.mtimeNs),
    mode: Number(before.mode & 0o777n),
  }
}

async function backupPaths(databaseFile) {
  const directory = path.dirname(databaseFile)
  const names = (await readdir(directory)).filter((name) => name.startsWith('app_backup_'))
  for (const name of names) assert.match(name, backupName)
  return names.map((name) => path.join(directory, name))
}

async function projectCall(page, name, ...args) {
  const result = await page.evaluate(({ name, args }) => window.api.projects[name](...args), {
    name,
    args,
  })
  assert.equal(result.ok, true, JSON.stringify(result))
  return result.value
}

// Independent decoder for the preview produced by packaged Main's installed CPU worker.
const verifyRenderedPreview = String.raw`
import hashlib, io, sys, zipfile
from PIL import Image

filename, icc = sys.argv[1:]
with zipfile.ZipFile(filename) as package:
    for member, format in [('preview/merged.png', 'PNG'), ('preview/thumbnail.webp', 'WEBP')]:
        with Image.open(io.BytesIO(package.read(member))) as image:
            assert image.format == format
            assert image.size == (48, 32)
            assert hashlib.sha256(image.info['icc_profile']).hexdigest() == icc
            assert image.convert('RGBA').tobytes() == bytes([31, 101, 197, 255]) * (48 * 32)
`

export async function prepareHistoricalProtocolRepair({
  filename,
  appData,
  root,
  identity,
  migrationHash,
  iccHash,
}) {
  const inputRoot = path.join(path.dirname(root), 'protocol-repair-inputs')
  assert.equal(filename, path.join(inputRoot, 'historical-fixture.json'))
  assert.equal(await realpath(root), root)
  assert.equal(await realpath(appData), appData)
  assert.match(migrationHash, /^[0-9a-f]{64}$/)
  const owned = (file) => readOwnedFile(file, identity)
  const fixtureReceipt = await owned(filename)
  const fixture = JSON.parse(await readFile(filename, 'utf8'))
  assert.equal(fixture.schemaVersion, 1)
  assert.equal(fixture.historicalRevision, historicalRevision)
  assert.equal(fixture.appData, appData)
  assert.deepEqual(await owned(filename), fixtureReceipt)
  const { database, project, queue, model, checkpoint29 } = fixture
  const { source, ...raster } = project.raster
  assert.equal(source.sha256, raster.asset.sha256)
  assert.equal(source.sizeBytes, raster.asset.bytes)
  assert.deepEqual(
    {
      x: raster.transform.x,
      y: raster.transform.y,
      width: raster.asset.width,
      height: raster.asset.height,
    },
    renderedPreviewRect,
  )
  assert.equal(raster.sourceIccProfile.sha256, iccHash)
  assert.equal(database.file, path.join(appData, 'database/app.sqlite'))
  assert.equal(database.checkpointFile, path.join(inputRoot, 'checkpoint-29.sqlite'))
  assert.equal(path.dirname(project.projectFile), path.join(appData, 'workspaces/Uncategorized'))
  assert.equal(path.extname(project.projectFile), '.igs')
  assert.equal(model.file.path, path.join(appData, 'models/compatibility-fixture.safetensors'))
  assert.equal(model.file.sizeBytes, 56)
  assert.match(queue.id, /^[a-f0-9-]{36}$/)
  assert.equal(queue.status, 'canceled')
  assert.equal(queue.localProjectKey, project.projectId)
  assert.equal(queue.projectPath, project.projectFile)
  const frozenDirectory = path.join(appData, 'generation-inputs', queue.id)
  const frozenNames = ['manifest.json', 'target.png']
  const frozenFiles = [
    ...frozenNames.map((name) => path.join(frozenDirectory, name)),
    model.file.path,
  ]
  const archivedPaths = [database.file, project.projectFile, ...frozenFiles]
  const archivedName = (file) => path.join('data', path.relative(path.dirname(appData), file))
  assert.deepEqual(
    checkpoint29.files.map(({ path: file }) => file).sort(),
    archivedPaths.map(archivedName).sort(),
  )
  const verifyArchiveMember = async (file, archivedFile = file) => {
    const expected = checkpoint29.files.find(
      ({ path: name }) => name === archivedName(archivedFile),
    )
    assert.equal(expected.kind, 'file')
    const actual = await owned(file)
    assert.equal(actual.sha256, expected.sha256)
    assert.equal(actual.sizeBytes, expected.sizeBytes)
    return actual
  }
  const [databaseBefore, initialProject, ...frozen] = await Promise.all(
    archivedPaths.map((file) => verifyArchiveMember(file)),
  )
  const checkpoint = await verifyArchiveMember(database.checkpointFile, database.file)
  assert.notEqual(checkpoint.fingerprint, databaseBefore.fingerprint)
  assert.equal(initialProject.sha256, project.initialProject.sha256)
  assert.equal(initialProject.sizeBytes, project.initialProject.sizeBytes)
  assert.deepEqual(await backupPaths(database.file), [])
  for (const file of [database.file, database.checkpointFile]) {
    assert.deepEqual(snapshotDatabase(file, { closed: true }), database.baseline)
  }
  const baseline = database.baseline
  assert.equal(baseline.integrityCheck, 'ok')
  assert.deepEqual(baseline.foreignKeyCheck, [])
  assert.equal(baseline.schemaMigrations.length, 29)
  assert.equal(baseline.tables.model_reference_identity, undefined)
  const { rows: index } = baseline.tables.project_index
  assert.equal(index.length, 1)
  assert.equal(index[0].local_project_key, project.projectId)
  assert.equal(index[0].canonical_path, project.projectFile)
  assert.equal(index[0].document_id, project.documentId)
  assert.equal(index[0].document_revision, project.documentRevision)
  assert.equal(index[0].preview_status, 'unavailable')
  const { rows: queued } = baseline.tables.generation_queue_item
  assert.equal(queued.length, 1)
  assert.equal(queued[0].id, queue.id)
  assert.equal(queued[0].status, queue.status)
  assert.equal(queued[0].status_sequence, queue.statusSequence)
  assert.equal(queued[0].local_project_key, project.projectId)
  assert.equal(queued[0].canonical_project_path, project.projectFile)
  assert.equal(queued[0].document_id, project.documentId)
  assert.equal(queued[0].document_revision, project.documentRevision)
  assert.ok(Object.keys(JSON.parse(queued[0].frozen_payload_json)).length)

  let upgraded
  let backup
  let saved
  const prompt = `${project.initialPrompt}\nSaved after Repair installed a compatible worker.`

  async function assertStableInputs(expectedProject) {
    assert.deepEqual(await owned(filename), fixtureReceipt)
    assert.deepEqual(await owned(database.checkpointFile), checkpoint)
    assert.deepEqual(await owned(project.projectFile), expectedProject)
    assert.deepEqual(await Promise.all(frozenFiles.map(owned)), frozen)
    assert.deepEqual((await readdir(path.dirname(frozenDirectory))).sort(), [queue.id])
    assert.deepEqual((await readdir(frozenDirectory)).sort(), frozenNames)
  }

  async function assertUpgraded() {
    assert.equal(upgraded, undefined)
    const startup = snapshotDatabase(database.file)
    const expected = structuredClone(baseline)
    const [row] = expected.tables.project_index.rows
    // The archived package body is identical on a newly owned inode.
    row.file_fingerprint = initialProject.fingerprint
    row.file_mtime_ns = initialProject.mtimeNs
    const comparison = compareStartup(expected, startup, {
      first: true,
      projectId: project.projectId,
      migrationHash,
    })
    const paths = await backupPaths(database.file)
    assert.equal(paths.length, 1)
    const [backupFile] = paths
    const backupReceipt = await owned(backupFile)
    assert.equal(backupReceipt.mode, 0o600)
    const live = await lstat(database.file)
    const original = await lstat(backupFile)
    assert.ok(live.dev !== original.dev || live.ino !== original.ino)
    assert.deepEqual(snapshotDatabase(backupFile, { closed: true }), baseline)
    const retained = path.join(root, 'startup-backup-29.sqlite')
    await copyFile(backupFile, retained, constants.COPYFILE_EXCL)
    assert.equal((await owned(retained)).sha256, backupReceipt.sha256)
    assert.deepEqual(snapshotDatabase(retained, { closed: true }), baseline)
    assert.deepEqual(await owned(backupFile), backupReceipt)
    await assertStableInputs(initialProject)
    backup = { ...backupReceipt, retained, migrations: baseline.schemaMigrations.length }
    upgraded = startup
    return { backup, comparison, historicalRevision, frozen }
  }

  async function assertPreserved({ closed = false } = {}) {
    assert.ok(upgraded, 'Read the migrated database before any Project action.')
    await assertStableInputs(saved?.receipt ?? initialProject)
    assert.deepEqual(await backupPaths(database.file), [backup.path])
    const { retained, migrations, ...backupReceipt } = backup
    assert.deepEqual(await owned(backup.path), backupReceipt)
    assert.equal((await owned(retained)).sha256, backupReceipt.sha256)
    const current = snapshotDatabase(database.file, { closed })
    const expected = structuredClone(upgraded)
    assert.equal(current.tables.project_index.rows.length, 1)
    const [row] = expected.tables.project_index.rows
    const [{ last_opened_at: lastOpened }] = current.tables.project_index.rows
    assert.ok(!Number.isNaN(Date.parse(lastOpened)))
    row.last_opened_at = lastOpened
    if (saved) {
      Object.assign(row, {
        document_revision: saved.revision,
        file_fingerprint: saved.receipt.fingerprint,
        file_mtime_ns: saved.receipt.mtimeNs,
        file_size_bytes: saved.receipt.sizeBytes,
        preview_status: 'rendered',
        preview_thumbnail_sha256: saved.thumbnailSha256,
      })
    }
    const comparison = compareStartup(expected, current, {
      first: false,
      projectId: project.projectId,
      migrationHash,
    })
    return {
      comparison,
      backupMigrations: migrations,
      frozenPayloadSha256: sha256(queued[0].frozen_payload_json),
      queueStatus: queued[0].status,
      queueStatusSequence: queued[0].status_sequence,
      project: saved?.receipt ?? initialProject,
    }
  }

  async function readTab(page) {
    const result = await projectCall(page, 'open', project.projectId)
    assert.equal(result.kind, 'opened')
    return result.tab
  }

  function checkTab(tab, expectedPrompt, expectedRevision) {
    assert.equal(tab.id, project.projectId)
    assert.equal(tab.documentId, project.documentId)
    assert.equal(tab.documentRevision, expectedRevision)
    assert.equal(tab.generationDraft.positivePrompt.text, expectedPrompt)
    assert.equal(tab.dirty, false)
    assert.equal(tab.autosaveError, null)
    assert.equal(tab.storageWarning, undefined)
    assert.equal(tab.layers.length, 1)
    const [layer] = tab.layers
    for (const field of ['id', 'name', 'visible', 'locked', 'opacity', 'blendMode', 'transform']) {
      assert.deepEqual(layer[field], raster[field], `Raster ${field}`)
    }
    assert.equal(layer.width, raster.asset.width)
    assert.equal(layer.height, raster.asset.height)
  }

  async function openProject(page) {
    const summary = await projectCall(page, 'list')
    assert.equal(summary.length, 1)
    assert.equal(summary[0].id, project.projectId)
    assert.equal(summary[0].previewStatus, saved ? 'rendered' : 'unavailable')
    await page.getByRole('button', { name: `Open ${project.projectTitle}`, exact: true }).click()
    await expect(page.getByRole('tab', { name: project.projectTitle, exact: true })).toBeVisible()
    const tab = await readTab(page)
    checkTab(
      tab,
      saved ? prompt : project.initialPrompt,
      saved?.revision ?? project.documentRevision,
    )
    return tab
  }

  async function saveProject(page, pythonExecutable) {
    assert.equal(saved, undefined)
    assert.ok(pythonExecutable.startsWith(path.join(appData, 'runtime/environments') + path.sep))
    assert.equal(path.basename(pythonExecutable), 'python')
    assert.equal(path.normalize(pythonExecutable), pythonExecutable)
    await page.getByRole('textbox', { name: 'Positive prompt', exact: true }).fill(prompt)
    await expect.poll(async () => (await readTab(page)).dirty).toBe(true)
    await page.getByRole('button', { name: 'Save Project', exact: true }).click()
    await expect.poll(async () => (await readTab(page)).dirty).toBe(false)
    const tab = await readTab(page)
    const revision = tab.documentRevision
    assert.notEqual(revision, project.documentRevision)
    checkTab(tab, prompt, revision)
    const receipt = await owned(project.projectFile)
    assert.notEqual(receipt.sha256, initialProject.sha256)
    const output = await readIgsPackage(project.projectFile)
    assert.equal(output.manifest.documentId, project.documentId)
    assert.equal(output.manifest.documentRevision, revision)
    assert.deepEqual(output.manifest.preview, { rect: renderedPreviewRect, status: 'rendered' })
    assert.equal(output.project.generationDraft.positivePrompt.text, prompt)
    assert.deepEqual(output.project.layers, [raster])
    const rasterSha256 = sha256(await output.readMember(raster.asset.path))
    assert.equal(rasterSha256, raster.asset.sha256)
    const profileSha256 = sha256(await output.readMember(raster.sourceIccProfile.path))
    assert.equal(profileSha256, iccHash)
    const thumbnailSha256 = sha256(await output.readMember('preview/thumbnail.webp'))
    await execute(
      pythonExecutable,
      ['-I', '-B', '-c', verifyRenderedPreview, project.projectFile, iccHash],
      {
        timeout: 10_000,
        maxBuffer: 256 * 1024,
      },
    )
    assert.deepEqual(await owned(project.projectFile), receipt)
    saved = { receipt, revision, thumbnailSha256 }
    await assertPreserved()
    return { ...saved, profileSha256, rasterSha256, renderedPixelsChecked: 2 * 48 * 32 }
  }

  async function assertSaved(page) {
    assert.ok(saved, 'Explicitly save the repaired Project before reopening it.')
    const tab = await openProject(page)
    await assertPreserved()
    return tab
  }

  async function retainClosed(label) {
    assert.match(label, /^[a-z][a-z0-9-]+$/)
    const state = await assertPreserved({ closed: true })
    const retainedProject = path.join(root, `${label}.igs`)
    const retainedDatabase = path.join(root, `${label}.sqlite`)
    await copyFile(project.projectFile, retainedProject, constants.COPYFILE_EXCL)
    await copyFile(database.file, retainedDatabase, constants.COPYFILE_EXCL)
    const projectFile = await owned(retainedProject)
    const databaseFile = await owned(retainedDatabase)
    assert.equal(projectFile.sha256, state.project.sha256)
    assert.deepEqual(
      snapshotDatabase(retainedDatabase, { closed: true }),
      snapshotDatabase(database.file, { closed: true }),
    )
    return { ...state, retainedProject: projectFile, retainedDatabase: databaseFile }
  }

  return {
    fixture,
    assertUpgraded,
    assertPreserved,
    openProject,
    saveProject,
    assertSaved,
    retainClosed,
  }
}
