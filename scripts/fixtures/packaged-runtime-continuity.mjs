/** Exercise one installed engine through two successive stock AppImages. */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { constants } from 'node:fs'
import { copyFile, lstat, mkdir, readFile, readdir, realpath } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

import { expect } from '@playwright/test'

import { snapshotDatabase } from './application-state-upgrade-fixture.mjs'
import { compareArchiveWitnessMetadata } from './application-state-upgrade-native.mjs'

const execute = promisify(execFile)
const historicalReportSha256 = '7f6bfbf04134a862e4fa1364a0f175eff8bac32eb5cd45612a3e47484a8fe976'
const renderRect = { x: 0, y: 0, width: 48, height: 32 }

// Decode all three planes independently of the app and its compositor.
const readArchive = String.raw`
import hashlib, io, json, sys, zipfile
from PIL import Image

filename, profile_hash = sys.argv[1:]
digest = lambda data: hashlib.sha256(data).hexdigest()
profile_member = 'assets/profiles/' + profile_hash + '.icc'
with zipfile.ZipFile(filename) as package:
    members = package.infolist()
    assert len(members) == 7 and all(item.file_size <= 1024 * 1024 for item in members)
    assert package.testzip() is None
    document = json.loads(package.read('project.json'))
    manifest = json.loads(package.read('manifest.json'))
    raster, = document['layers']
    assert raster['kind'] == 'raster'
    raster_member = raster['asset']['path']
    planes = {raster_member: 'PNG', 'preview/merged.png': 'PNG', 'preview/thumbnail.webp': 'WEBP'}
    assert {item.filename for item in members} == {'mimetype', 'manifest.json', 'project.json',
                                                   profile_member, *planes}
    assert digest(package.read(profile_member)) == profile_hash
    assert {item['path'] for item in manifest['members']} == {'project.json', profile_member, *planes}
    for item in manifest['members']:
        data = package.read(item['path'])
        assert digest(data) == item['sha256'] and len(data) == item['bytes']
    hashes = {}
    for member, image_format in planes.items():
        data = package.read(member)
        with Image.open(io.BytesIO(data)) as image:
            assert image.format == image_format and image.size == (48, 32)
            assert digest(image.info['icc_profile']) == profile_hash
            assert image.convert('RGBA').tobytes() == bytes([31, 101, 197, 255]) * (48 * 32)
        hashes[member] = digest(data)
    print(json.dumps(dict(document=document, manifest=manifest, hashes=hashes, checkedPixels=4608)))
`

async function regularOwned(filename) {
  assert.equal(await realpath(filename), filename)
  const stat = await lstat(filename)
  assert.ok(
    stat.isFile() && stat.uid === process.getuid() && stat.nlink === 1 && stat.size <= 1024 * 1024,
    filename,
  )
}

async function projectTab(page, id) {
  const result = await page.evaluate((project) => window.api.projects.open(project), id)
  assert.equal(result.ok, true, JSON.stringify(result))
  assert.equal(result.value.kind, 'opened')
  return result.value.tab
}

function assertReady({ runtime, catalog }, runtimeId) {
  assert.equal(runtime.value.kind, 'ready')
  assert.equal(runtime.value.runtimeId, runtimeId)
  assert.equal(runtime.value.profile, 'linux-nvidia')
  assert.equal(runtime.value.outpaintInfill, 'ready')
  assert.deepEqual(catalog.value, [])
}

function assertOpened(tab, id, document) {
  assert.equal(tab.id, id)
  assert.equal(tab.documentId, document.documentId)
  assert.equal(tab.documentRevision, document.documentRevision)
  assert.deepEqual(tab.generationDraft, document.generationDraft)
  assert.equal(tab.dirty, false)
  assert.equal(tab.autosaveError, null)
  assert.equal(tab.storageWarning, undefined)
  assert.equal(tab.layers.length, 1)
  assert.equal(tab.layers[0].id, document.layers[0].id)
}

function readDatabase(store, id, revision) {
  const [database] = store.databaseFiles
  assert.equal(store.databaseFiles.length, 1)
  const { tables, schema, schemaMigrations, integrityCheck, foreignKeyCheck } = snapshotDatabase(
    database.path,
    { closed: true },
  )
  assert.equal(integrityCheck, 'ok')
  assert.deepEqual(foreignKeyCheck, [])
  const { project_index: index, ...remaining } = tables
  const [row] = index.rows
  assert.equal(index.rows.length, 1)
  assert.equal(row.local_project_key, id)
  assert.equal(row.document_revision, revision)
  assert.equal(row.preview_status, 'rendered')
  assert.equal(row.file_size_bytes, store.project.sizeBytes)
  for (const table of [
    'generation_queue_item',
    'generation_candidate_receipt',
    'generation_seed_cursor',
    'project_accepted_result_index',
  ]) {
    assert.deepEqual(tables[table].rows, [], table)
  }
  return { logicalStablePart: { schema, schemaMigrations, tables: remaining }, project: row }
}

export async function runPackagedRuntimeContinuity({
  continuity,
  engine,
  root,
  launch,
  readPorts,
  closeNormally,
  retainOwnStore,
  identity,
}) {
  assert.deepEqual(await identity(continuity.successor.path), continuity.successor)
  const historical = path.join(engine.run, 'historical-upgrade-r2/native')
  const reportPath = path.join(historical, 'report.json')
  await regularOwned(reportPath)
  const priorReport = await identity(reportPath)
  assert.equal(priorReport.sha256, historicalReportSha256)
  const report = JSON.parse(await readFile(reportPath, 'utf8'))
  assert.deepEqual(await identity(reportPath), priorReport)
  assert.equal(report.outcome, 'PASS')
  const reference = report.historicalUpgrade.installedCpuPreview
  assert.equal(reference.checkedPixels, 4608)
  const { retainedProject, project } = report.stores.saved
  assert.equal(retainedProject, 'after-first-close.igs')
  const originalPath = path.join(historical, retainedProject)
  await regularOwned(originalPath)
  const originalFile = await identity(originalPath)
  assert.deepEqual(originalFile, { ...project, path: originalPath })

  async function inspect(filename) {
    await regularOwned(filename)
    const { stdout } = await execute(
      engine.pythonExecutable,
      ['-I', '-B', '-c', readArchive, filename, reference.sourceProfileSha256],
      { timeout: 15_000, maxBuffer: 256 * 1024 },
    )
    const value = JSON.parse(stdout)
    assert.deepEqual(value.manifest.preview, { rect: renderRect, status: 'rendered' })
    assert.equal(value.manifest.documentId, value.document.documentId)
    assert.equal(value.manifest.documentRevision, value.document.documentRevision)
    assert.deepEqual(value.hashes, reference.hashes)
    assert.equal(value.checkedPixels, reference.checkedPixels)
    return value
  }
  const before = await inspect(originalPath)
  const workspace = path.join(engine.dataRoot, 'workspaces/Uncategorized')
  const readMetadata = () =>
    snapshotDatabase(path.join(engine.dataRoot, 'database/app.sqlite')).tables.app_metadata
  await mkdir(workspace, { recursive: true, mode: 0o700 })
  assert.equal(await realpath(workspace), workspace)
  assert.deepEqual(await readdir(workspace), [])
  const filename = path.join(workspace, 'Runtime continuity test.igs')
  await copyFile(originalPath, filename, constants.COPYFILE_EXCL)
  await regularOwned(filename)
  assert.deepEqual(await identity(filename), { ...originalFile, path: filename })

  const title = before.document.title
  const idFor = (ports) => {
    assert.equal(ports.projects.value.length, 1)
    const [entry] = ports.projects.value
    assert.equal(entry.title, title)
    assert.equal(entry.health, 'ready')
    assert.equal(entry.recoveryStatus, 'none')
    assert.equal(entry.previewStatus, 'rendered')
    return entry.id
  }

  async function editAndSave(state, id, document, prompt, checkpoint) {
    const { page } = state
    state.discardOwnedProjectId = id
    await page.getByRole('button', { name: `Open ${title}`, exact: true }).click()
    await expect(page.getByRole('tab', { name: title, exact: true })).toBeVisible()
    assertOpened(await projectTab(page, id), id, document)
    await page.getByRole('textbox', { name: 'Positive prompt', exact: true }).fill(prompt)
    await expect
      .poll(async () => {
        const tab = await projectTab(page, id)
        return [tab.dirty, tab.generationDraft.positivePrompt.text]
      })
      .toEqual([true, prompt])
    await page.getByRole('button', { name: 'Save Project', exact: true }).click()
    await expect.poll(async () => (await projectTab(page, id)).dirty).toBe(false)
    const tab = await projectTab(page, id)
    assert.notEqual(tab.documentRevision, document.documentRevision)
    const expected = {
      ...document,
      documentRevision: tab.documentRevision,
      generationDraft: {
        ...document.generationDraft,
        positivePrompt: { ...document.generationDraft.positivePrompt, text: prompt },
      },
    }
    assertOpened(tab, id, expected)
    await closeNormally(state)
    const store = await retainOwnStore(checkpoint)
    const stored = await inspect(path.join(root, store.retainedProject))
    assert.deepEqual(stored.document, expected)
    assert.deepEqual(await identity(filename), store.project)
    return { store, stored, database: readDatabase(store, id, tab.documentRevision) }
  }

  const first = await launch('first')
  const previousPorts = await readPorts(first)
  assertReady(previousPorts, engine.runtimeId)
  const id = idFor(previousPorts)
  const previousMetadata = readMetadata()
  const prior = await editAndSave(
    first,
    id,
    before.document,
    'Runtime continuity fixture saved on the previous build.',
    'after-first-close',
  )
  assert.notEqual(prior.store.project.sha256, originalFile.sha256)
  const priorClosed = prior.database.logicalStablePart
  assert.deepEqual(previousMetadata.columns, priorClosed.tables.app_metadata.columns)
  const priorSaveDelta = compareArchiveWitnessMetadata(
    previousMetadata.rows,
    priorClosed.tables.app_metadata.rows,
    { archiveSha256: prior.store.project.sha256 },
  )

  const restarted = await launch('restarted', continuity.successor.path)
  const currentPorts = await readPorts(restarted)
  assertReady(currentPorts, engine.runtimeId)
  assert.equal(idFor(currentPorts), id)
  assert.deepEqual(await identity(filename), prior.store.project)
  const restartMetadata = readMetadata()
  assert.deepEqual(restartMetadata.columns, priorClosed.tables.app_metadata.columns)
  const restartDelta = compareArchiveWitnessMetadata(
    priorClosed.tables.app_metadata.rows,
    restartMetadata.rows,
    { archiveSha256: prior.store.project.sha256 },
  )
  const current = await editAndSave(
    restarted,
    id,
    prior.stored.document,
    'Runtime continuity fixture saved on the current build.',
    'after-restarted-close',
  )
  assert.notEqual(current.store.project.sha256, prior.store.project.sha256)
  const currentClosed = current.database.logicalStablePart
  const currentSaveDelta = compareArchiveWitnessMetadata(
    restartMetadata.rows,
    currentClosed.tables.app_metadata.rows,
    {
      archiveSha256: current.store.project.sha256,
      archiveValidator: restartDelta?.validator,
    },
  )
  assert.deepEqual(currentClosed, {
    ...priorClosed,
    tables: {
      ...priorClosed.tables,
      app_metadata: {
        ...priorClosed.tables.app_metadata,
        rows: currentClosed.tables.app_metadata.rows,
      },
    },
  })
  assert.deepEqual(await identity(originalPath), originalFile)
  assert.deepEqual(await identity(reportPath), priorReport)
  assert.deepEqual(await identity(continuity.successor.path), continuity.successor)

  return {
    saved: prior.store,
    restarted: current.store,
    packagedRuntimeContinuity: {
      projectId: id,
      originalFile,
      priorReport,
      runtimeId: engine.runtimeId,
      successor: continuity.successor,
      runtimeStatuses: [previousPorts.runtime.value, currentPorts.runtime.value],
      revisions: [before.document, prior.stored.document, current.stored.document].map(
        ({ documentRevision }) => documentRevision,
      ),
      sourceProfileSha256: reference.sourceProfileSha256,
      hashes: current.stored.hashes,
      checkedPixelsPerSave: current.stored.checkedPixels,
      checkedDatabaseTables: Object.keys(currentClosed.tables).length + 1,
      archiveWitnessDeltas: { priorSaveDelta, restartDelta, currentSaveDelta },
    },
  }
}
