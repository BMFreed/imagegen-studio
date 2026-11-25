/** Portable .igs discovery and exact checkpoint relink through the stock Linux AppImage. */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { copyFile, lstat, readFile, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { expect } from '@playwright/test'
import Database from 'better-sqlite3'

const execute = promisify(execFile)
const runs = path.join(homedir(), '.codex/artifacts/imagegen-studio/runs')
const originalPath = path.join(
  runs,
  'packaged-installed-engine/20261118/trained-noobai-v-r2/native/after-restarted-close.igs',
)
const originalSha = '0c0c1301e8ffee7293bcd0fa35ecd8a625d555973e5255ac173bc6d007b5f4f1'
const vModelId = 1147756
const vExact = {
  versionId: 2679856,
  fileId: 2566634,
  sha256: 'edca0d656069468ce208440edda4643b8795b6dc500606bb6d0e57eb9a54c89d',
}
const vDefault = {
  versionId: 2468033,
  fileId: 2356667,
  sha256: 'e3af301ae8c62073a7d28426c2e748b6953d7d6f0ad9a7b42a88f867e8b17337',
}
const epsExact = {
  versionId: 1022833,
  fileId: 928571,
  sha256: 'ff827fc34584853257d6de64b8bc3e34156814f6b0cfd1a5112a5e9164806df1',
}
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')

function inside(directory, file) {
  const relative = path.relative(directory, file)
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

async function call(page, service, method, ...args) {
  const result = await page.evaluate(
    ({ service, method, args }) => window.api[service][method](...args),
    { service, method, args },
  )
  assert.ok(result.ok, `${service}.${method} failed (${result.error?.code ?? 'unknown'}).`)
  return result.value
}

function versionOf(resource, expected) {
  const version = resource.versions.find((entry) => entry.civitaiVersionId === expected.versionId)
  assert.ok(version)
  assert.equal(version.civitaiFileId, expected.fileId)
  assert.equal(version.sha256, expected.sha256)
  assert.equal(version.fileStatus, 'ready')
  assert.equal(version.baseModelFamily, 'illustrious')
  return version
}

async function readBindings(page) {
  const catalog = await call(page, 'models', 'getCatalog')
  assert.deepEqual(
    catalog.map(({ modelId }) => modelId).sort((left, right) => left - right),
    [833294, vModelId],
  )
  const eps = catalog.find(({ modelId }) => modelId === 833294)
  const cyberfalafel = catalog.find(({ modelId }) => modelId === vModelId)
  assert.equal(eps.versions.length, 1)
  assert.equal(cyberfalafel.versions.length, 2)
  const epsVersion = versionOf(eps, epsExact)
  const version = versionOf(cyberfalafel, vExact)
  const defaultVersion = versionOf(cyberfalafel, vDefault)
  assert.equal(eps.defaultVersionId, epsVersion.id)
  assert.equal(epsVersion.predictionType, 'epsilon')
  assert.equal(epsVersion.predictionTypeSource, 'default')
  assert.equal(cyberfalafel.defaultVersionId, defaultVersion.id)
  return {
    eps: { resourceId: eps.id, versionId: epsVersion.id },
    model: {
      name: cyberfalafel.name,
      resourceId: cyberfalafel.id,
      version: {
        id: version.id,
        name: version.name,
        predictionType: version.predictionType,
        predictionTypeSource: version.predictionTypeSource,
      },
      defaultVersionId: defaultVersion.id,
    },
  }
}

async function assertPredictionOverride(page, bindings) {
  const { model } = bindings
  if (model.version.predictionTypeSource === 'user') {
    assert.equal(model.version.predictionType, 'v_prediction')
    return
  }
  assert.equal(model.version.predictionTypeSource, 'default')
  await page.getByRole('button', { name: 'Models menu', exact: true }).click()
  await page
    .locator('.n-dropdown-option')
    .filter({ has: page.getByText('Manage Models', { exact: true }) })
    .click()
  const manager = page.getByRole('dialog', { name: 'Model Manager', exact: true })
  const resource = manager.locator('.resource-row').filter({
    has: page.getByText(model.name, { exact: true }),
  })
  await resource.getByRole('button').click()
  const row = manager.locator('.version-row').filter({
    has: page.getByText(model.version.name, { exact: true }),
  })
  const prediction = row.locator('.version-prediction')
  await expect(prediction).toContainText('Assumed default')
  await prediction.locator('.n-base-selection').click()
  await page.getByText('V-prediction', { exact: true }).last().click()
  await expect(prediction).toContainText('Chosen for this exact file', { timeout: 90_000 })
  await expect(prediction).toContainText('V-prediction')
  await manager.getByRole('button', { name: 'Close Model Manager', exact: true }).click()
  await expect(manager).toBeHidden()
}

async function readEntry(filename, name) {
  const { stdout } = await execute('/usr/bin/unzip', ['-p', filename, name], {
    encoding: 'buffer',
    maxBuffer: 1_048_576,
    timeout: 5000,
  })
  return stdout
}

async function readProject(filename) {
  assert.equal(await realpath(filename), filename)
  const project = JSON.parse((await readEntry(filename, 'project.json')).toString('utf8'))
  assert.equal(project.layers.length, 1)
  const [layer] = project.layers
  assert.equal(layer.kind, 'raster')
  assert.match(layer.asset.path, /^assets\/layers\/[a-f0-9-]+\.png$/)
  const bytes = await readEntry(filename, layer.asset.path)
  assert.equal(bytes.length, layer.asset.bytes)
  assert.equal(sha(bytes), layer.asset.sha256)
  return { project, layer, pixelsSha256: sha(bytes) }
}

function projectRecord(appData, documentId) {
  const db = new Database(path.join(appData, 'database/app.sqlite'), {
    fileMustExist: true,
    readonly: true,
  })
  try {
    const rows = db
      .prepare(
        `SELECT local_project_key AS id, canonical_path AS filename
      FROM project_index WHERE document_id = ? AND file_health = 'ready'`,
      )
      .all(documentId)
    assert.equal(rows.length, 1)
    assert.ok(inside(path.join(appData, 'workspaces'), rows[0].filename))
    return rows[0]
  } finally {
    db.close()
  }
}

async function tabFor(page, id) {
  const result = await call(page, 'projects', 'open', id)
  assert.equal(result.kind, 'opened')
  return result.tab
}

function assertAssetAndHistory(before, after) {
  assert.equal(after.project.documentId, before.project.documentId)
  assert.deepEqual(after.layer, before.layer)
  assert.equal(after.pixelsSha256, before.pixelsSha256)
}

function portablePaths(root, appData) {
  return {
    evidence: path.join(root, 'noobai-v-portable-input.igs'),
    workspace: path.join(appData, 'workspaces/Uncategorized/noobai-v-portable-input.igs'),
  }
}

async function assertPortableBytes(filename) {
  assert.equal(await realpath(filename), filename)
  const status = await lstat(filename)
  assert.ok(status.isFile() && status.uid === process.getuid())
  assert.equal(sha(await readFile(filename)), originalSha)
}

/** Stage one ordinary Project where the stock workspace scanner will discover it. */
export async function stageNoobaiPortableInput({ root, appData, candidateProfile = false }) {
  if (candidateProfile) {
    assert.equal(appData, path.join(root, 'data/imagegen-studio'))
  } else {
    assert.notEqual(root, appData)
    assert.ok(!inside(root, appData) && !inside(appData, root))
  }
  const files = portablePaths(root, appData)
  for (const directory of [root, appData, path.dirname(files.workspace)]) {
    assert.ok(inside(runs, directory))
    assert.equal(await realpath(directory), directory)
    const status = await lstat(directory)
    assert.ok(status.isDirectory() && status.uid === process.getuid())
  }
  await assertPortableBytes(originalPath)
  for (const destination of Object.values(files)) {
    await copyFile(originalPath, destination, constants.COPYFILE_EXCL)
    await assertPortableBytes(destination)
    assert.equal((await lstat(destination)).nlink, 1)
  }
  await assertPortableBytes(originalPath)
  return files
}

/**
 * InvokeAI 4875d965 uses projectFile.ts and invk/importProject.ts for portable archives, library.ts
 * and the projects.py endpoint for discovery, and model_manager.py get_by_hash backed by
 * model_records_sql.py search_by_hash. This exercises Studio's filesystem workspace and exact
 * CivitAI relink, beginning with the real Home Open action.
 */
export async function runNoobaiPortableRelink({ root, appData, state, portableInput }) {
  assert.deepEqual(portableInput, portablePaths(root, appData))
  await assertPortableBytes(portableInput.evidence)
  await assertPortableBytes(portableInput.workspace)
  const before = await readProject(portableInput.evidence)
  const saved = before.project.generationDraft.model
  const accepted = before.layer.generationProvenance.generationConfiguration.model
  assert.equal(saved.civitaiModelId, vModelId)
  assert.equal(saved.civitaiVersionId, vExact.versionId)
  assert.equal(saved.civitaiFileId, vExact.fileId)
  assert.equal(saved.fileSha256, vExact.sha256)
  assert.equal(accepted.civitaiModelId, saved.civitaiModelId)
  assert.equal(accepted.civitaiVersionId, saved.civitaiVersionId)
  assert.equal(accepted.civitaiFileId, saved.civitaiFileId)
  assert.equal(accepted.fileSha256, saved.fileSha256)
  assert.equal(accepted.predictionType, 'v_prediction')
  assert.equal(saved.predictionType, 'epsilon')

  const { page } = state
  const home = page.getByRole('region', { name: 'Home', exact: true })
  await expect(home).toBeVisible()
  await assertPredictionOverride(page, await readBindings(page))
  const bindings = await readBindings(page)
  const { model } = bindings
  assert.equal(model.version.predictionType, 'v_prediction')
  assert.equal(model.version.predictionTypeSource, 'user')
  assert.notEqual(model.resourceId, saved.localModelId)
  assert.notEqual(model.version.id, saved.localVersionId)
  assert.notEqual(model.defaultVersionId, model.version.id)

  const open = home.getByRole('button', { name: `Open ${before.project.title}`, exact: true })
  await expect(open).toBeVisible()
  const indexed = projectRecord(appData, before.project.documentId)
  assert.equal(indexed.filename, portableInput.workspace)
  await open.click()
  await expect(page.getByRole('tab', { name: before.project.title, exact: true })).toBeVisible()

  const opened = await tabFor(page, indexed.id)
  assert.deepEqual(opened.generationDraft.model, saved)
  assert.equal(opened.dirty, false)
  const link = page.getByRole('button', { name: 'Link installed version', exact: true })
  await expect(link).toBeVisible({ timeout: 90_000 })
  await link.click()
  const linked = { ...saved, localModelId: model.resourceId, localVersionId: model.version.id }
  await expect
    .poll(async () => (await tabFor(page, indexed.id)).generationDraft.model, {
      timeout: 90_000,
    })
    .toEqual(linked)
  assert.equal((await tabFor(page, indexed.id)).dirty, true)
  assert.equal(sha(await readFile(indexed.filename)), originalSha)
  await expect(link).toBeHidden()
  await expect(page.getByText('Prediction: v_prediction', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Save Project', exact: true }).click()
  await expect
    .poll(async () => (await tabFor(page, indexed.id)).dirty, {
      timeout: 90_000,
    })
    .toBe(false)
  const after = await readProject(indexed.filename)
  assert.deepEqual(after.project.generationDraft, {
    ...before.project.generationDraft,
    model: linked,
  })
  assertAssetAndHistory(before, after)
  await assertPortableBytes(originalPath)
  await assertPortableBytes(portableInput.evidence)
  return {
    bindings,
    discovery: 'uncategorized-workspace-home-open',
    documentId: before.project.documentId,
    filename: indexed.filename,
    linked,
    originPackageSha256: originalSha,
    pixelsSha256: after.pixelsSha256,
    projectId: indexed.id,
    projectTitle: before.project.title,
    savedPackageSha256: sha(await readFile(indexed.filename)),
  }
}

export async function verifyNoobaiPortableReopen({ appData, state, relink }) {
  const { page } = state
  const home = page.getByRole('region', { name: 'Home', exact: true })
  await expect(home).toBeVisible()
  assert.deepEqual(await readBindings(page), relink.bindings)
  await home.getByRole('button', { name: `Open ${relink.projectTitle}`, exact: true }).click()
  await expect(page.getByRole('tab', { name: relink.projectTitle, exact: true })).toBeVisible()
  const tab = await tabFor(page, relink.projectId)
  assert.equal(tab.documentId, relink.documentId)
  assert.equal(tab.dirty, false)
  assert.deepEqual(tab.generationDraft.model, relink.linked)
  await expect(
    page.getByRole('button', { name: 'Link installed version', exact: true }),
  ).toBeHidden()
  await expect(page.getByText('Prediction: v_prediction', { exact: true })).toBeVisible()
  const reopened = projectRecord(appData, relink.documentId)
  assert.deepEqual(reopened, { id: relink.projectId, filename: relink.filename })
  assert.equal(sha(await readFile(reopened.filename)), relink.savedPackageSha256)
  assert.equal((await readProject(reopened.filename)).pixelsSha256, relink.pixelsSha256)
  return {
    documentId: tab.documentId,
    projectId: reopened.id,
    exactVersionId: tab.generationDraft.model.localVersionId,
    defaultVersionId: relink.bindings.model.defaultVersionId,
    packageSha256: relink.savedPackageSha256,
    pixelsSha256: relink.pixelsSha256,
    dirty: tab.dirty,
  }
}
