/** Stock AppImage hard Remove of the embedding referenced by an accepted NoobAI Raster. */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { copyFile, lstat, mkdir, realpath } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

import { expect } from '@playwright/test'
import Database from 'better-sqlite3'

const execute = promisify(execFile)
const title = 'Packaged trained noobai-eps-stack-retry'
const documentId = 'cc90c48f-d641-437c-b15c-83ef44f777cc'
const revision = '1550cacb-6ef6-4c81-b522-298bf45ea90b'
const layerId = '752d6bfc-d00f-4cd3-9dab-e683e0410e2c'
const rasterSha = '16309e1db9c186d7193c45d65a404f6e49b64e678f2e6fa96432a61da610f267'
const fileId = '5d0c47c9-285f-4a65-ad1d-ff9aa164a4ef'
const reference = {
  baseModelFamily: 'illustrious',
  civitaiFileId: 2542976,
  civitaiModelId: 2360940,
  civitaiVersionId: 2655289,
  displayName: 'IllustriousPhoto Embedding',
  fileSha256: '91a95b244b8ba01d905d32ced7e3cc20eb74b4da8f519de3764505500d386c36',
  kind: 'embedding',
  localModelId: 'abb983e1-2654-42ba-a7c6-11f751be27d0',
  localVersionId: 'ca8a1a9f-7f1c-40e6-81ee-178a84a60d16',
  predictionType: null,
  versionName: 'WAI v15 1152steps',
}
const acceptedRef = { resource: reference, token: '<illustriousphoto>' }
const weightBytes = 49736
const ledger = {
  base_model_family: reference.baseModelFamily,
  civitai_file_id: reference.civitaiFileId,
  civitai_model_id: reference.civitaiModelId,
  civitai_model_version_id: reference.civitaiVersionId,
  resource_id: reference.localModelId,
  sha256: reference.fileSha256,
  size_bytes: weightBytes,
  source_key: 'civitai:model:2360940',
  source_kind: 'civitai',
  source_revision: null,
  type: reference.kind,
  version_id: reference.localVersionId,
}
const registryTables = ['model_resource', 'model_resource_version', 'local_model_file']
const unusedTables = [
  'model_version_dependency',
  'model_install_job',
  'model_install_artifact',
  'generation_queue_item',
  'generation_candidate_receipt',
  'generation_seed_cursor',
]

async function pinnedFile(expected, identity) {
  assert.equal(await realpath(expected.path), expected.path)
  const info = await lstat(expected.path)
  assert.ok(info.isFile() && info.uid === process.getuid() && info.nlink === 1, expected.path)
  assert.deepEqual(await identity(expected.path), expected)
  return info
}

async function zipMember(file, name) {
  const { stdout } = await execute('/usr/bin/unzip', ['-p', file, name], {
    encoding: 'buffer',
    timeout: 4000,
    maxBuffer: 1024 * 1024,
  })
  return stdout
}

function assertSqliteIntegrity(db) {
  assert.equal(db.pragma('integrity_check', { simple: true }), 'ok')
  assert.deepEqual(db.pragma('foreign_key_check'), [])
}

function snapshot(filename) {
  const db = new Database(filename, { fileMustExist: true, readonly: true })
  try {
    assertSqliteIntegrity(db)
    return db.transaction(() => ({
      registry: Object.fromEntries(
        registryTables.map((table) => [table, db.prepare(`SELECT * FROM ${table}`).all()]),
      ),
      ledger: db.prepare('SELECT * FROM model_reference_identity').all(),
      projects: db
        .prepare(
          `SELECT local_project_key, canonical_path, document_id, document_revision,
                  file_health, last_opened_at FROM project_index`,
        )
        .all(),
      accepted: db.prepare('SELECT * FROM project_accepted_result_index').all(),
      unusedCounts: Object.fromEntries(
        unusedTables.map((table) => [
          table,
          db.prepare(`SELECT count(*) FROM ${table}`).pluck().get(),
        ]),
      ),
    }))()
  } finally {
    db.close()
  }
}

function seedEmptyCatalog(filename, preserved, managedPath) {
  const source = new Database(preserved, { fileMustExist: true })
  const database = new Database(filename, { fileMustExist: true })
  try {
    assertSqliteIntegrity(source)
    assert.equal(database.pragma('foreign_keys', { simple: true }), 1)
    const rows = registryTables.map((table) => {
      const result = source.prepare(`SELECT * FROM ${table}`).all()
      assert.equal(result.length, 1, table)
      return result[0]
    })
    const [resource, version, file] = rows
    assert.equal(resource.id, reference.localModelId)
    assert.equal(resource.default_version_id, reference.localVersionId)
    assert.equal(resource.civitai_model_id, reference.civitaiModelId)
    assert.equal(resource.type, reference.kind)
    assert.equal(version.id, reference.localVersionId)
    assert.equal(version.model_resource_id, resource.id)
    assert.equal(version.base_model_family, reference.baseModelFamily)
    assert.equal(version.civitai_model_version_id, reference.civitaiVersionId)
    assert.equal(version.civitai_file_id, reference.civitaiFileId)
    assert.equal(version.expected_sha256, reference.fileSha256)
    assert.equal(file.id, fileId)
    assert.equal(file.resource_version_id, version.id)
    assert.equal(file.sha256, reference.fileSha256)
    assert.equal(file.size_bytes, weightBytes)
    assert.equal(file.status, 'ready')

    // Artwork is unrelated to the resource tuple and may make a fetch through Main.
    // Suppress both preview URLs in our seed so review and Compare stay offline.
    resource.preview_url = null
    version.source_metadata_json = JSON.stringify({
      ...JSON.parse(version.source_metadata_json),
      previewImageUrl: null,
    })
    file.managed_path = managedPath
    database.transaction(() => {
      for (const [index, table] of registryTables.entries()) {
        assert.equal(database.prepare(`SELECT count(*) FROM ${table}`).pluck().get(), 0, table)
        const row = rows[index]
        const columns = Object.keys(row)
        assert.ok(columns.every((name) => /^[a-z_][a-z0-9_]*$/.test(name)))
        const params = columns.map((name) => `@${name}`)
        database
          .prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${params.join(',')})`)
          .run(row)
      }
    })()
    assertSqliteIntegrity(database)
  } finally {
    database.close()
    source.close()
  }
}

async function backupLiveDatabase(filename, retained) {
  await assert.rejects(lstat(retained), { code: 'ENOENT' })
  const db = new Database(filename, { fileMustExist: true, readonly: true })
  try {
    await db.backup(retained)
  } finally {
    db.close()
  }
  // The disposable backup is closed to the app. Make independent read-back sidecar-free.
  const backup = new Database(retained, { fileMustExist: true })
  try {
    assert.equal(backup.pragma('journal_mode = DELETE', { simple: true }), 'delete')
  } finally {
    backup.close()
  }
}

async function call(page, port, method, ...args) {
  const response = await page.evaluate(
    ({ port, method, args }) => window.api[port][method](...args),
    { port, method, args },
  )
  assert.ok(response.ok, `${port}.${method} failed (${response.error?.code ?? 'unknown'}).`)
  return response.value
}

async function openProject(page) {
  const home = page.getByRole('region', { name: 'Home', exact: true })
  await home.getByRole('button', { name: `Open ${title}`, exact: true }).click()
  await expect(page.getByRole('tab', { name: title, exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
}

async function assertAccepted(page, key) {
  const data = await call(page, 'projects', 'getRasterPresetData', key, documentId, layerId)
  assert.equal(data.documentId, documentId)
  assert.equal(data.layerId, layerId)
  assert.deepEqual(data.generationConfiguration.negativePrompt.embeddingRefs, [acceptedRef])
}

async function assertComparison(page, status) {
  const project = page.getByLabel(`Project ${title}`, { exact: true })
  await project.getByRole('button', { name: 'Layer actions for Generated 1', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Compare generation settings', exact: true }).click()
  const comparison = page.getByRole('dialog', { name: 'Compare generation settings', exact: true })
  const embedding = comparison.locator('[data-setting="negativePrompt.embeddings"]')
  await expect(embedding).toHaveAttribute('data-status', status)
  await expect(embedding).toContainText(reference.fileSha256)
  await comparison
    .getByRole('button', { name: 'Close generation settings comparison', exact: true })
    .click()
  await expect(comparison).toBeHidden()
}

async function openModels(page) {
  await page.getByRole('button', { name: 'Models menu', exact: true }).click()
  await page.locator('.n-dropdown-menu').getByText('Manage Models', { exact: true }).click()
  const manager = page.getByRole('dialog', { name: 'Model Manager', exact: true })
  const row = manager.locator('.resource-row').filter({
    has: page.getByText(reference.displayName, { exact: true }),
  })
  await row.locator('.resource-select').click()
  await expect(
    manager
      .getByLabel('Model details', { exact: true })
      .locator('h2')
      .filter({ hasText: /^IllustriousPhoto Embedding$/ }),
  ).toBeVisible()
  return { manager, row }
}

export async function runNoobaiComponentRemove({
  root,
  appData,
  ownedRunRoot,
  packageBefore,
  launch,
  closeNormally,
  retainOwnStore,
  identity,
}) {
  const datedRun = path.dirname(root)
  assert.equal(path.dirname(datedRun), path.join(ownedRunRoot, 'packaged-noobai-component-remove'))
  assert.match(path.basename(datedRun), /^\d{8}(?:-r[1-9]\d*)?$/)
  assert.equal(path.basename(root), 'remove')
  assert.equal(await realpath(root), root)
  assert.equal(appData, path.join(root, 'data/imagegen-studio'))
  assert.deepEqual(packageBefore, {
    path: path.join(
      ownedRunRoot,
      'packaged-noobai-preview/20261120/package-work/live/output',
      'imagegen-studio-0.1.0-dev.1-x86_64.AppImage',
    ),
    sizeBytes: 147139886,
    sha256: '555c6a7985ef1cad3b0427d97862aa3db94da3cbf0d4ffdc7a67da5201bfc5d8',
  })
  const original = {
    path: path.join(
      ownedRunRoot,
      'packaged-installed-engine/20261118/trained-noobai-eps-stack-retry-r5/native/after-restarted-close.igs',
    ),
    sizeBytes: 361648,
    sha256: '0e5b76d742b068976f9eb3732258d02748bdbfef2024e95b017b4755712a73d6',
  }
  const originalModel = {
    path: path.join(
      path.dirname(ownedRunRoot),
      'shared/illustrious-vpred-worker-012-20261007/component-sources/illustriousphoto.safetensors',
    ),
    sizeBytes: weightBytes,
    sha256: reference.fileSha256,
  }
  const originalCatalog = {
    path: path.join(ownedRunRoot, 'packaged-noobai-install/20261120-r2/closed-catalog.sqlite'),
    sizeBytes: 368640,
    sha256: 'c6aa2c07f015851a8975c55ad5013051b99d243d05abf2dfb4a63c291999081b',
  }
  for (const artifact of [original, originalModel, originalCatalog]) {
    await pinnedFile(artifact, identity)
  }
  const historicalWal = await lstat(`${originalCatalog.path}-wal`).catch((error) => {
    if (error.code !== 'ENOENT') throw error
    return null
  })
  if (historicalWal) {
    assert.ok(historicalWal.isFile() && historicalWal.size === 0, 'Archived WAL must be empty.')
  }
  await assert.rejects(lstat(`${originalCatalog.path}-journal`), { code: 'ENOENT' })
  const ownedCatalog = { ...originalCatalog, path: path.join(root, 'cache/catalog-seed.sqlite') }
  assert.equal(await realpath(path.dirname(ownedCatalog.path)), path.dirname(ownedCatalog.path))
  await copyFile(originalCatalog.path, ownedCatalog.path, constants.COPYFILE_EXCL)
  await pinnedFile(ownedCatalog, identity)
  const projectDocument = JSON.parse(await zipMember(original.path, 'project.json'))
  assert.equal(projectDocument.title, title)
  assert.equal(projectDocument.documentId, documentId)
  assert.equal(projectDocument.documentRevision, revision)
  assert.deepEqual(projectDocument.generationDraft.negativePrompt.embeddingRefs, [])
  assert.equal(projectDocument.layers.length, 1)
  const [layer] = projectDocument.layers
  assert.equal(layer.id, layerId)
  assert.equal(layer.asset.sha256, rasterSha)
  assert.deepEqual(
    layer.generationProvenance.generationConfiguration.negativePrompt.embeddingRefs,
    [acceptedRef],
  )
  const raster = await zipMember(original.path, `assets/layers/${layerId}.png`)
  assert.equal(raster.length, 119901)
  assert.equal(createHash('sha256').update(raster).digest('hex'), rasterSha)

  const workspace = path.join(appData, 'workspaces/Uncategorized')
  const project = { ...original, path: path.join(workspace, 'Remove Resource.igs') }
  const model = {
    ...originalModel,
    path: path.join(appData, 'models/91', `${reference.fileSha256}.safetensors`),
  }
  const database = path.join(appData, 'database/app.sqlite')
  await assert.rejects(lstat(database), { code: 'ENOENT' })
  await mkdir(workspace, { recursive: true, mode: 0o700 })
  assert.equal(await realpath(workspace), workspace)
  await copyFile(original.path, project.path, constants.COPYFILE_EXCL)

  const first = await launch('review-and-remove-component')
  const { page } = first
  assert.equal((await call(page, 'runtime', 'getStatus')).kind, 'not-installed')
  assert.deepEqual(await call(page, 'models', 'getCatalog'), [])
  const emptyRegistry = snapshot(database)
  assert.ok(Object.values(emptyRegistry.registry).every((rows) => rows.length === 0))
  assert.deepEqual(emptyRegistry.ledger, [])
  assert.ok(Object.values(emptyRegistry.unusedCounts).every((count) => count === 0))
  await mkdir(path.dirname(model.path), { recursive: true, mode: 0o700 })
  assert.equal(await realpath(path.dirname(model.path)), path.dirname(model.path))
  await copyFile(originalModel.path, model.path, constants.COPYFILE_EXCL)
  const managedStat = await pinnedFile(model, identity)
  const originalStat = await pinnedFile(originalModel, identity)
  assert.notDeepEqual([managedStat.dev, managedStat.ino], [originalStat.dev, originalStat.ino])
  seedEmptyCatalog(database, ownedCatalog.path, model.path)
  await openProject(page)
  const catalog = await call(page, 'models', 'getCatalog')
  assert.equal(catalog.length, 1)
  const [resource] = catalog
  assert.equal(resource.id, reference.localModelId)
  assert.equal(resource.defaultVersionId, reference.localVersionId)
  assert.equal(resource.versions.length, 1)
  const [version] = resource.versions
  assert.equal(version.id, reference.localVersionId)
  assert.equal(version.fileStatus, 'ready')
  assert.equal(version.sha256, reference.fileSha256)
  const before = snapshot(database)
  assert.equal(before.projects.length, 1)
  const [index] = before.projects
  const key = `project-v1-${createHash('sha256').update(project.path).digest('hex')}`
  assert.equal(index.local_project_key, key)
  assert.equal(index.canonical_path, project.path)
  assert.equal(index.document_id, documentId)
  assert.equal(index.document_revision, revision)
  assert.equal(index.file_health, 'ready')
  assert.equal(before.accepted.length, 1)
  assert.equal(before.accepted[0].local_project_key, key)
  assert.equal(before.accepted[0].layer_id, layerId)
  assert.equal(before.accepted[0].asset_sha256, rasterSha)
  assert.deepEqual(before.ledger, [])
  assert.deepEqual(before.unusedCounts, emptyRegistry.unusedCounts)
  await assertAccepted(page, key)
  await assertComparison(page, 'Removed')
  const beforeDb = path.join(root, 'before-remove.sqlite')
  await backupLiveDatabase(database, beforeDb)
  assert.deepEqual(snapshot(beforeDb), before)
  const baselineDatabase = await identity(beforeDb)

  const { manager, row } = await openModels(page)
  const removeButton = manager.getByRole('button', { name: 'Remove Local Resource', exact: true })
  const dialog = page.getByRole('dialog', { name: 'Remove Local Resource', exact: true })
  const removePermanently = dialog.getByRole('button', { name: 'Remove permanently', exact: true })
  await removeButton.click()
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText(reference.displayName)
  await expect(dialog).toContainText('1 unshared managed files will be deleted.')
  await expect(dialog).toContainText('No running jobs use this resource.')
  await expect(removePermanently).toBeDisabled()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(dialog).toBeHidden()
  assert.deepEqual(snapshot(database), before)
  await pinnedFile(model, identity)
  await pinnedFile(project, identity)
  await expect(row).toBeVisible()

  await removeButton.click()
  await expect(removePermanently).toBeDisabled()
  const acknowledge = dialog.getByRole('checkbox', {
    name: 'I understand that referenced settings will become unavailable',
    exact: true,
  })
  await expect(acknowledge).not.toBeChecked()
  await acknowledge.check()
  await expect(removePermanently).toBeEnabled()
  await removePermanently.click()
  await expect(dialog).toBeHidden()
  await expect(row).toHaveCount(0)
  assert.deepEqual(await call(page, 'models', 'getCatalog'), [])
  await assert.rejects(lstat(model.path), { code: 'ENOENT' })
  const removed = snapshot(database)
  assert.deepEqual(removed, { ...before, registry: emptyRegistry.registry, ledger: [ledger] })
  await manager.getByRole('button', { name: 'Close Model Manager', exact: true }).click()
  await expect(manager).toBeHidden()
  await assertAccepted(page, key)
  await assertComparison(page, 'Missing resource')
  await pinnedFile(project, identity)
  await closeNormally(first)
  const saved = await retainOwnStore('after-component-remove')

  const second = await launch('reopen-after-component-remove')
  assert.equal((await call(second.page, 'runtime', 'getStatus')).kind, 'not-installed')
  assert.deepEqual(await call(second.page, 'models', 'getCatalog'), [])
  assert.deepEqual(snapshot(database), removed)
  await openProject(second.page)
  await assertAccepted(second.page, key)
  await assertComparison(second.page, 'Missing resource')
  await closeNormally(second)
  const restarted = await retainOwnStore('restarted-after-component-remove')
  const reopened = snapshot(database)
  assert.deepEqual(reopened, {
    ...removed,
    projects: [{ ...removed.projects[0], last_opened_at: reopened.projects[0].last_opened_at }],
  })
  assert.ok(reopened.projects[0].last_opened_at > removed.projects[0].last_opened_at)
  await assert.rejects(lstat(model.path), { code: 'ENOENT' })
  for (const artifact of [original, originalModel, originalCatalog, project]) {
    await pinnedFile(artifact, identity)
  }
  return {
    saved,
    restarted,
    noobaiComponentRemove: {
      original,
      originalModel,
      originalCatalog,
      managedPathRemoved: model.path,
      baselineDatabase,
      acceptedRef,
      rasterSha,
      before,
      removed,
      reopened,
      comparison: { before: 'Removed', after: 'Missing resource', restarted: 'Missing resource' },
    },
  }
}
