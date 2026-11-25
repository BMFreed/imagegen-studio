/** Observe the live Model Manager and Project pickers with all three official files installed. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { copyFile, lstat, mkdir, readFile, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'

import { expect } from '@playwright/test'
import Database from 'better-sqlite3'

const epsModelId = 833294
const cyberModelId = 1147756
const previousDefault = 2679856
const newDefault = 2468033
const checkpointPins = [
  {
    modelId: epsModelId,
    versionId: 1022833,
    fileId: 928571,
    sizeBytes: 6_938_040_416,
    sha256: 'ff827fc34584853257d6de64b8bc3e34156814f6b0cfd1a5112a5e9164806df1',
  },
  {
    modelId: cyberModelId,
    versionId: newDefault,
    fileId: 2356667,
    sizeBytes: 6_938_040_794,
    sha256: 'e3af301ae8c62073a7d28426c2e748b6953d7d6f0ad9a7b42a88f867e8b17337',
  },
  {
    modelId: cyberModelId,
    versionId: previousDefault,
    fileId: 2566634,
    sizeBytes: 6_938_040_794,
    sha256: 'edca0d656069468ce208440edda4643b8795b6dc500606bb6d0e57eb9a54c89d',
  },
]
const projectTitle = 'Packaged NoobAI Default qualification'
const installRuns = path.join(
  homedir(),
  '.codex/artifacts/imagegen-studio/runs/packaged-noobai-install',
)
const originalInstall = path.join(installRuns, '20261119/install')
const originalAppData = path.join(originalInstall, 'data/imagegen-studio')
const baseline = {
  path: path.join(installRuns, '20261119-r7/three-files-before-default.sqlite'),
  sizeBytes: 393_216,
  sha256: '2c401cd5e10dac9ce4bf45476bf28955a5969cd4dc42dbb4462047b9fbf52524',
}
const installationReceipt = {
  path: path.join(originalInstall, 'report.json'),
  sizeBytes: 19_806,
  sha256: '6ae3eca8e9e9085c3518a8994065991fc2d7324f640a7e04402c4865ceeebfc6',
}

function modelPath(appData, pin) {
  return path.join(appData, 'models', pin.sha256.slice(0, 2), `${pin.sha256}.safetensors`)
}

async function exactFileIdentity(file, sizeBytes) {
  assert.equal(await realpath(file), file)
  const info = await lstat(file, { bigint: true })
  assert.ok(info.isFile() && info.uid === BigInt(process.getuid()))
  assert.equal(info.size, BigInt(sizeBytes))
  return {
    path: file,
    sizeBytes,
    device: String(info.dev),
    inode: String(info.ino),
    mtimeNs: String(info.mtimeNs),
    ctimeNs: String(info.ctimeNs),
  }
}

async function pinnedInput(pin) {
  const info = await exactFileIdentity(pin.path, pin.sizeBytes)
  assert.equal(
    createHash('sha256')
      .update(await readFile(pin.path))
      .digest('hex'),
    pin.sha256,
  )
  assert.deepEqual(await exactFileIdentity(pin.path, pin.sizeBytes), info)
  return { ...info, sha256: pin.sha256 }
}

async function retainedCatalogInputs() {
  const files = []
  for (const pin of checkpointPins) {
    const identity = await exactFileIdentity(modelPath(originalAppData, pin), pin.sizeBytes)
    files.push({ ...pin, ...identity })
  }
  return {
    baseline: await pinnedInput(baseline),
    installationReceipt: await pinnedInput(installationReceipt),
    files,
  }
}

/** Copy closed SQLite only. The AppImage resolves and verifies the retained checkpoint bodies. */
export async function stageNoobaiCandidateCatalog({ root, appData }) {
  assert.equal(path.dirname(path.dirname(root)), installRuns)
  assert.equal(appData, path.join(root, 'data/imagegen-studio'))
  assert.equal(await realpath(path.dirname(appData)), path.dirname(appData))
  const retained = await retainedCatalogInputs()
  const database = path.join(appData, 'database/app.sqlite')
  const defaultWorkspace = path.join(appData, 'workspaces/Uncategorized')
  await mkdir(appData, { mode: 0o700 })
  await mkdir(path.dirname(database), { mode: 0o700 })
  await mkdir(defaultWorkspace, { recursive: true, mode: 0o700 })
  await copyFile(baseline.path, database, constants.COPYFILE_EXCL)
  await pinnedInput({ ...baseline, path: database })
  const db = new Database(database, { fileMustExist: true })
  try {
    assert.equal(db.pragma('integrity_check', { simple: true }), 'ok')
    assert.equal(db.prepare('SELECT COUNT(*) FROM project_index').pluck().get(), 0)
    assert.equal(db.prepare('SELECT COUNT(*) FROM project_workspace').pluck().get(), 1)
    const moved = db
      .prepare(
        `
      UPDATE project_workspace SET directory_path = ?
      WHERE id = 'uncategorized' AND is_default = 1 AND directory_path = ?
      `,
      )
      .run(defaultWorkspace, path.join(originalAppData, 'workspaces/Uncategorized'))
    assert.equal(moved.changes, 1)
    assert.deepEqual(db.pragma('foreign_key_check'), [])
  } finally {
    db.close()
  }
  return { database, defaultWorkspace, modelDataRoot: originalAppData, retained }
}

export async function verifyNoobaiCandidateCatalog({ retained }) {
  assert.deepEqual(await retainedCatalogInputs(), retained)
}

async function call(page, scope, method, ...args) {
  const result = await page.evaluate(
    ({ scope, method, args }) => window.api[scope][method](...args),
    { scope, method, args },
  )
  assert.ok(result.ok, `Default qualification ${scope}.${method} failed.`)
  return result.value
}

function modelRows(appData) {
  const database = new Database(path.join(appData, 'database/app.sqlite'), {
    fileMustExist: true,
    readonly: true,
  })
  try {
    return database
      .prepare(
        `
      SELECT r.id AS resourceId, r.civitai_model_id AS modelId,
        r.default_version_id AS defaultVersionId, v.id AS localVersionId,
        v.civitai_model_version_id AS versionId, v.civitai_file_id AS fileId,
        v.base_model_family AS family, v.expected_sha256 AS expectedSha256,
        f.id AS localFileId, f.managed_path AS managedPath, f.size_bytes AS sizeBytes,
        f.sha256, f.status
      FROM model_resource r
      JOIN model_resource_version v ON v.model_resource_id = r.id
      JOIN local_model_file f ON f.resource_version_id = v.id
      ORDER BY modelId, versionId, fileId
    `,
      )
      .all()
  } finally {
    database.close()
  }
}

async function observeCatalog(page, appData, cyberDefault, modelDataRoot) {
  const catalog = await call(page, 'models', 'getCatalog')
  const rows = modelRows(appData)
  assert.equal(catalog.length, 2)
  assert.equal(rows.length, checkpointPins.length)
  const cyber = catalog.find(({ modelId }) => modelId === cyberModelId)
  const eps = catalog.find(({ modelId }) => modelId === epsModelId)
  assert.ok(cyber && eps)
  assert.notEqual(cyber.id, eps.id)
  assert.equal(eps.versions.length, 1)
  assert.equal(cyber.versions.length, 2)
  for (const [index, pin] of checkpointPins.entries()) {
    const row = rows[index]
    const resource = pin.modelId === cyberModelId ? cyber : eps
    const version = resource.versions.find(
      ({ civitaiVersionId }) => civitaiVersionId === pin.versionId,
    )
    const defaultSourceVersion = pin.modelId === cyberModelId ? cyberDefault : pin.versionId
    const expectedDefault = resource.versions.find(
      ({ civitaiVersionId }) => civitaiVersionId === defaultSourceVersion,
    )
    assert.ok(version && expectedDefault)
    assert.equal(resource.resourceType, 'checkpoint')
    assert.equal(resource.defaultVersionId, expectedDefault.id)
    assert.deepEqual(
      {
        modelId: resource.modelId,
        versionId: version.civitaiVersionId,
        fileId: version.civitaiFileId,
        sizeBytes: version.fileSizeBytes,
        sha256: version.sha256,
      },
      pin,
    )
    assert.equal(version.baseModelFamily, 'illustrious')
    assert.equal(version.fileStatus, 'ready')
    assert.deepEqual(version.dependencyIssues, [])
    assert.deepEqual(row, {
      ...pin,
      resourceId: resource.id,
      defaultVersionId: expectedDefault.id,
      localVersionId: version.id,
      family: 'illustrious',
      expectedSha256: pin.sha256,
      localFileId: row.localFileId,
      managedPath: modelPath(modelDataRoot, pin),
      status: 'ready',
    })
  }
  assert.equal(new Set(rows.map(({ localVersionId }) => localVersionId)).size, rows.length)
  assert.equal(new Set(rows.map(({ localFileId }) => localFileId)).size, rows.length)
  assert.equal(new Set(rows.map(({ managedPath }) => managedPath)).size, rows.length)
  return { cyber, eps, rows }
}

async function createOwnedProject(page) {
  const projects = await call(page, 'projects', 'list')
  assert.ok(!projects.some(({ title }) => title === projectTitle))
  await page.getByRole('button', { name: 'New Project', exact: true }).first().click()
  const dialog = page.getByRole('dialog', { name: 'New Project', exact: true })
  await dialog.getByRole('textbox', { name: 'Project name', exact: true }).fill(projectTitle)
  await dialog.getByRole('button', { name: 'Create Project', exact: true }).click()
  await expect(page.getByRole('tab', { name: projectTitle, exact: true })).toBeVisible()
  const project = (await call(page, 'projects', 'list')).find(({ title }) => title === projectTitle)
  assert.ok(project)
  assert.equal(project.previewStatus, 'empty')
  return project.id
}

async function readProject(page, projectId) {
  const project = await call(page, 'projects', 'open', projectId)
  assert.equal(project.kind, 'opened')
  assert.equal(project.tab.title, projectTitle)
  return project.tab
}

async function selectModel(page, projectId, resource, sourceVersionId) {
  const expected = resource.versions.find(
    ({ civitaiVersionId }) => civitaiVersionId === sourceVersionId,
  )
  assert.ok(expected)
  const modelPicker = page.locator('[aria-label="Generation model"]')
  await expect(modelPicker).not.toHaveClass(/n-select--disabled/, { timeout: 90_000 })
  await modelPicker.click()
  await page
    .locator('.n-base-select-option')
    .filter({ has: page.getByText(resource.name, { exact: true }) })
    .click()
  const identity = {
    civitaiModelId: resource.modelId,
    civitaiVersionId: sourceVersionId,
    civitaiFileId: expected.civitaiFileId,
    localModelId: resource.id,
    localVersionId: expected.id,
    fileSha256: expected.sha256,
  }
  await expect
    .poll(async () => (await readProject(page, projectId)).generationDraft.model, {
      timeout: 90_000,
    })
    .toMatchObject(identity)
  return identity
}

async function openCyberManager(page, resource) {
  await page.getByRole('button', { name: 'Models menu', exact: true }).click()
  await page
    .locator('.n-dropdown-option')
    .filter({ has: page.getByText('Manage Models', { exact: true }) })
    .click()
  const manager = page.getByRole('dialog', { name: 'Model Manager', exact: true })
  await expect(manager).toBeVisible()
  await manager
    .locator('.resource-row')
    .filter({ has: page.getByText(resource.name, { exact: true }) })
    .getByRole('button')
    .click()
  return manager
}

function versionRow(page, manager, resource, sourceVersionId) {
  const version = resource.versions.find(
    ({ civitaiVersionId }) => civitaiVersionId === sourceVersionId,
  )
  assert.ok(version)
  return manager
    .locator('.version-row')
    .filter({ has: page.getByText(version.name, { exact: true }) })
}

async function closeManager(manager) {
  await manager.getByRole('button', { name: 'Close Model Manager', exact: true }).click()
  await expect(manager).toBeHidden()
}

export async function runNoobaiDefault({ root, appData, state, modelDataRoot = appData }) {
  const { page } = state
  const before = await observeCatalog(page, appData, previousDefault, modelDataRoot)
  const projectId = await createOwnedProject(page)
  const oldSelection = await selectModel(page, projectId, before.cyber, previousDefault)
  await page.getByRole('button', { name: 'Save Project', exact: true }).click()
  await expect.poll(async () => (await readProject(page, projectId)).dirty).toBe(false)
  const pinned = await readProject(page, projectId)

  const manager = await openCyberManager(page, before.cyber)
  const oldRow = versionRow(page, manager, before.cyber, previousDefault)
  const newRow = versionRow(page, manager, before.cyber, newDefault)
  await expect(oldRow.getByText('Default', { exact: true })).toBeVisible()
  const setDefault = newRow.getByRole('button', { name: 'Set Default', exact: true })
  await expect(setDefault).toBeEnabled()
  await setDefault.click()
  await expect(
    manager.getByText('Default version changed for new selections.', { exact: true }),
  ).toBeVisible({ timeout: 90_000 })
  await expect(newRow.getByText('Default', { exact: true })).toBeVisible()
  await expect(oldRow.getByRole('button', { name: 'Set Default', exact: true })).toBeEnabled()
  const screenshot = path.join(root, 'noobai-explicit-default.png')
  await page.screenshot({ path: screenshot })
  await closeManager(manager)

  const after = await observeCatalog(page, appData, newDefault, modelDataRoot)
  assert.deepEqual(
    after.rows,
    before.rows.map((row) =>
      row.modelId === cyberModelId
        ? { ...row, defaultVersionId: after.cyber.defaultVersionId }
        : row,
    ),
  )
  const stillPinned = await readProject(page, projectId)
  assert.deepEqual(stillPinned.generationDraft, pinned.generationDraft)
  assert.equal(stillPinned.documentRevision, pinned.documentRevision)
  assert.equal(stillPinned.dirty, false)
  await selectModel(page, projectId, after.eps, checkpointPins[0].versionId)
  const newSelection = await selectModel(page, projectId, after.cyber, newDefault)

  await page.getByRole('button', { name: `Close ${projectTitle}`, exact: true }).click()
  const close = page.getByRole('dialog', { name: 'Close Project', exact: true })
  await close.getByRole('button', { name: 'Discard Changes', exact: true }).click()
  await expect(page.getByRole('tab', { name: projectTitle, exact: true })).toBeHidden()
  return {
    beforeRows: before.rows,
    afterRows: after.rows,
    projectId,
    savedProjectRevision: pinned.documentRevision,
    oldSelection,
    newSelection,
    screenshot,
  }
}

export async function verifyNoobaiDefaultReopen({
  appData,
  state,
  selection,
  modelDataRoot = appData,
}) {
  const { page } = state
  const reopened = await observeCatalog(page, appData, newDefault, modelDataRoot)
  assert.deepEqual(reopened.rows, selection.afterRows)
  const manager = await openCyberManager(page, reopened.cyber)
  await expect(
    versionRow(page, manager, reopened.cyber, newDefault).getByText('Default', { exact: true }),
  ).toBeVisible()
  await closeManager(manager)
  await page.getByRole('button', { name: `Open ${projectTitle}`, exact: true }).click()
  const tab = page.getByRole('tab', { name: projectTitle, exact: true })
  await expect(tab).toBeVisible()
  const project = await readProject(page, selection.projectId)
  assert.equal(project.dirty, false)
  assert.equal(project.documentRevision, selection.savedProjectRevision)
  assert.deepEqual(
    Object.fromEntries(
      Object.keys(selection.oldSelection).map((key) => [key, project.generationDraft.model?.[key]]),
    ),
    selection.oldSelection,
  )
  await page.getByRole('button', { name: `Close ${projectTitle}`, exact: true }).click()
  await expect(tab).toBeHidden()
  return {
    rows: reopened.rows,
    defaultVersionId: reopened.cyber.defaultVersionId,
    oldProjectVersionId: project.generationDraft.model.localVersionId,
  }
}
