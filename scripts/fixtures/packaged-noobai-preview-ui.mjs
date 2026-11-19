import assert from 'node:assert/strict'
import { lstat } from 'node:fs/promises'
import path from 'node:path'

import { expect } from '@playwright/test'
import Database from 'better-sqlite3'

const controlledToken = 'owned-noobai-preview-qualification-only'
const previews = [
  {
    label: 'eps',
    modelId: 833294,
    versionId: 1022833,
    fileId: 928571,
    sha256: 'ff827fc34584853257d6de64b8bc3e34156814f6b0cfd1a5112a5e9164806df1',
    sizeBytes: 6_938_040_416,
    controlledNames: ['NoobAI EPS', 'EPS 1.1', 'noobai-eps.safetensors'],
  },
  {
    label: 'v',
    modelId: 1147756,
    versionId: 2679856,
    fileId: 2566634,
    sha256: 'edca0d656069468ce208440edda4643b8795b6dc500606bb6d0e57eb9a54c89d',
    sizeBytes: 6_938_040_794,
    controlledNames: ['Cyberfalafel V', 'V 1.2', 'cyberfalafel-v.safetensors'],
  },
]

async function modelApi(page, method, ...args) {
  const reply = await page.evaluate(({ method, args }) => window.api.models[method](...args), {
    method,
    args,
  })
  assert.ok(reply.ok, `Model API ${method} failed (${reply.error?.code ?? 'no error code'}).`)
  return reply.value
}

function modelRows(appData) {
  const database = new Database(path.join(appData, 'database/app.sqlite'), {
    fileMustExist: true,
    readonly: true,
  })
  try {
    return database
      .prepare(
        `SELECT
          (SELECT count(*) FROM model_resource) AS resources,
          (SELECT count(*) FROM model_resource_version) AS versions,
          (SELECT count(*) FROM local_model_file) AS files,
          (SELECT count(*) FROM model_install_job) AS jobs,
          (SELECT count(*) FROM model_install_artifact) AS artifacts`,
      )
      .get()
  } finally {
    database.close()
  }
}

async function assertEmpty(page, appData) {
  assert.deepEqual(await modelApi(page, 'getInstallJobs'), [])
  assert.deepEqual(await modelApi(page, 'getCatalog'), [])
  assert.deepEqual(await modelApi(page, 'getStorageSummary'), { totalBytes: 0 })
  const counts = modelRows(appData)
  assert.deepEqual(counts, { resources: 0, versions: 0, files: 0, jobs: 0, artifacts: 0 })
  return counts
}

function displayedBytes(bytes) {
  assert.ok(Number.isSafeInteger(bytes) && bytes > 0)
  const labels = ['B', 'KB', 'MB', 'GB', 'TB']
  if (bytes < 1024) return `${bytes} B`
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), labels.length - 1)
  return `${(bytes / 1024 ** index).toFixed(1)} ${labels[index]}`
}

function fileLabel(file) {
  return `${file.name} · ${displayedBytes(file.sizeEstimateBytes)}`
}

async function chooseFile(page, dialog, file) {
  await dialog.locator('.file-choice .n-base-selection').click()
  await page
    .locator('.n-base-select-option')
    .filter({ has: page.getByText(fileLabel(file), { exact: true }) })
    .click()
  await assertSelection(dialog, file)
}

async function assertSelection(dialog, file) {
  await expect(
    dialog.locator('.file-choice').getByText(fileLabel(file), { exact: true }),
  ).toBeVisible()
  await expect(
    dialog.getByText(`Estimated additional download: ${displayedBytes(file.sizeEstimateBytes)}`, {
      exact: true,
    }),
  ).toBeVisible()
}

async function previewAndCancel({ page, manager, dialog, appData, root, expected, mode }) {
  await manager.getByRole('button', { name: 'Add from CivitAI URL', exact: true }).first().click()
  const url = `https://civitai.com/models/${expected.modelId}?modelVersionId=${expected.versionId}`
  await dialog.getByPlaceholder('https://civitai.com/models/…').fill(url)
  const fetchPreview = dialog.getByRole('button', { name: 'Fetch preview', exact: true })
  await expect(fetchPreview).toBeEnabled()
  await fetchPreview.click()
  await expect(
    dialog.getByRole('button', { name: 'Open CivitAI source', exact: true }),
  ).toBeVisible()

  const preview = await modelApi(page, 'previewImport', url)
  assert.equal(preview.kind, 'select-file')
  assert.equal(preview.modelId, expected.modelId)
  assert.equal(preview.versionId, expected.versionId)
  assert.equal(preview.baseModel, 'NoobAI')
  assert.equal(preview.baseModelFamily, 'illustrious')
  assert.equal(preview.resourceType, 'checkpoint')
  assert.deepEqual(preview.dependencies, [])
  const pinned = preview.files.find(({ fileId }) => fileId === expected.fileId)
  assert.ok(pinned, 'The pinned CivitAI file must be present in the typed preview.')
  assert.equal(pinned.sha256, expected.sha256)
  assert.equal(pinned.alreadyInstalled, false)
  assert.equal(pinned.reusesInstalledFile, false)
  assert.equal(pinned.needsRepair, false)
  assert.ok(pinned.name.toLowerCase().endsWith('.safetensors'))
  assert.equal(pinned.sizeEstimateBytes, expected.sizeBytes)
  if (mode === 'controlled') {
    assert.deepEqual(
      [preview.modelName, preview.versionName, pinned.name],
      expected.controlledNames,
    )
    assert.equal(pinned.primary, false)
  }
  await expect(dialog.getByRole('heading', { name: preview.modelName, exact: true })).toBeVisible()
  await expect(
    dialog.getByText(
      `${preview.author ?? 'CivitAI'} · ${preview.versionName} · checkpoint · NoobAI`,
      { exact: true },
    ),
  ).toBeVisible()
  const decoy = preview.files.find((file) => file.fileId !== pinned.fileId)
  if (mode === 'controlled') {
    assert.ok(decoy, 'The controlled fixture must include a neighboring file.')
    assert.equal(decoy.primary, true)
    assert.equal(decoy.name, 'other-precision.safetensors')
    assert.equal(decoy.sizeEstimateBytes, 1_048_576)
    assert.equal(preview.totalAdditionalBytes, decoy.sizeEstimateBytes)
    assert.notEqual(fileLabel(decoy), fileLabel(pinned))
    await assertSelection(dialog, decoy)
  }
  await chooseFile(page, dialog, pinned)
  await expect(dialog.getByText('SHA-256 will be verified', { exact: false })).toBeVisible()
  await expect(
    dialog.getByRole('button', { name: `Install ${preview.versionName}`, exact: true }),
  ).toBeEnabled()
  const beforeCancel = await assertEmpty(page, appData)
  const screenshot = path.join(root, `noobai-${mode}-${expected.label}-preview.png`)
  await page.screenshot({ animations: 'disabled', path: screenshot })
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(manager).toBeVisible()
  const afterCancel = await assertEmpty(page, appData)

  return {
    modelId: preview.modelId,
    versionId: preview.versionId,
    fileId: pinned.fileId,
    baseModel: preview.baseModel,
    baseModelFamily: preview.baseModelFamily,
    modelName: preview.modelName,
    versionName: preview.versionName,
    fileName: pinned.name,
    sha256: pinned.sha256,
    sizeEstimateBytes: pinned.sizeEstimateBytes,
    pinnedSizeBytes: expected.sizeBytes,
    defaultDecoyFileId: mode === 'controlled' ? decoy.fileId : null,
    beforeCancel,
    afterCancel,
    screenshot,
  }
}

async function saveLiveToken(page, liveToken) {
  assert.ok(typeof liveToken === 'string' && liveToken.length > 0, 'Missing live CivitAI token.')
  let kind
  try {
    kind = await page.evaluate(async (token) => {
      const result = await window.api.models.saveToken(token)
      return result.ok ? result.value.kind : 'failed'
    }, liveToken)
  } catch {
    throw new Error('Live token setup failed in the isolated packaged profile.')
  }
  assert.equal(kind, 'connected', 'The live token must validate before preview.')
}

export async function runNoobaiPreview({ root, appData, state, closeNormally, mode, liveToken }) {
  assert.ok(mode === 'controlled' || mode === 'live')
  const { page } = state
  const home = page.getByRole('region', { name: 'Home', exact: true })
  const manager = page.getByRole('dialog', { name: 'Model Manager', exact: true })
  const dialog = page.getByRole('dialog', { name: 'Add from CivitAI URL', exact: true })
  const manage = home
    .getByRole('complementary', { name: 'Workspace navigation', exact: true })
    .getByRole('button', { name: 'Manage Models', exact: true })
  const rowsBefore = await assertEmpty(page, appData)
  const tokenPath = path.join(appData, 'secrets/civitai-token.bin')
  await assert.rejects(lstat(tokenPath), { code: 'ENOENT' })
  const results = []
  try {
    if (mode === 'live') await saveLiveToken(page, liveToken)
    await manage.click()
    await expect(manager).toBeVisible()
    if (mode === 'controlled') {
      await manager
        .getByRole('button', { name: 'Add from CivitAI URL', exact: true })
        .first()
        .click()
      await expect(dialog.getByText('CivitAI token required', { exact: true })).toBeVisible()
      await dialog.getByPlaceholder('Personal API token').fill(controlledToken)
      await dialog.getByRole('button', { name: 'Save token', exact: true }).click()
      await expect(dialog.getByPlaceholder('Personal API token')).toBeHidden()
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
      await expect(dialog).toBeHidden()
    }
    await expect(
      manager.getByRole('button', { name: 'CivitAI connected', exact: true }),
    ).toBeVisible()
    const tokenFile = await lstat(tokenPath)
    assert.ok(tokenFile.isFile() && tokenFile.size > 0 && (tokenFile.mode & 0o777) === 0o600)
    for (const expected of previews) {
      results.push(await previewAndCancel({ page, manager, dialog, appData, root, expected, mode }))
    }
    await manager.getByRole('button', { name: 'Close Model Manager', exact: true }).click()
    await expect(manager).toBeHidden()
  } finally {
    assert.equal((await modelApi(page, 'removeToken')).kind, 'missing')
    await assert.rejects(lstat(tokenPath), { code: 'ENOENT' })
  }
  const rowsBeforeClose = await assertEmpty(page, appData)
  await closeNormally(state)
  assert.equal(state.normalPhysicalExit, true)
  const rowsAfterExit = modelRows(appData)
  assert.deepEqual(rowsAfterExit, rowsBefore)
  return {
    mode,
    rowsBefore,
    rowsBeforeClose,
    rowsAfterExit,
    previews: results,
    tokenRemoved: true,
    normalPhysicalExit: true,
  }
}
