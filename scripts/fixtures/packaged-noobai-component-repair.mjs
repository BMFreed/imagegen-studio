/** Live exact-file Repair from a saved Raster's Compare in the stock AppImage. */
import assert from 'node:assert/strict'
import { lstat, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

import { expect } from '@playwright/test'

import { connectToken, hashInstalledFile, inspectSqlite } from './packaged-noobai-install-ui.mjs'

async function waitForRepair(readJobs, reference) {
  const deadline = Date.now() + 45_000
  let jobId
  while (Date.now() < deadline) {
    const [job, ...unexpected] = await readJobs()
    assert.deepEqual(unexpected, [], 'Only one Repair job may be admitted.')
    if (job) {
      jobId ??= job.id
      assert.equal(job.id, jobId)
      assert.equal(job.modelName, reference.displayName)
      assert.equal(job.versionName, reference.versionName)
      if (job.status === 'completed') return job
      if (job.status === 'failed' || job.status === 'canceled') {
        const code = job.error?.code
        throw new Error(`Exact Repair stopped (${/^[A-Z_]+$/.test(code) ? code : job.status}).`)
      }
    }
    await delay(300)
  }
  throw new Error('Timed out waiting for the exact CivitAI Repair to finish.')
}

export async function runNoobaiComponentRepair({
  root,
  appData,
  first,
  launch,
  closeNormally,
  retainOwnStore,
  liveToken,
  model,
  reference,
  before,
  catalog,
  readSnapshot,
  preserveMissingDatabase,
  assertBorrowedAndProject,
  assertAccepted,
  openComparison,
  assertComparison,
  openProject,
  call,
}) {
  const { page } = first
  const readJobs = () => call(page, 'models', 'getInstallJobs')
  const tokenPath = path.join(appData, 'secrets/civitai-token.bin')
  const canonicalUrl = `https://civitai.com/models/${reference.civitaiModelId}?modelVersionId=${reference.civitaiVersionId}`
  await assert.rejects(lstat(model.path), { code: 'ENOENT' })
  await assert.rejects(lstat(tokenPath), { code: 'ENOENT' })
  const missingDatabase = await preserveMissingDatabase()

  const { comparison, embedding } = await openComparison(page, 'Missing resource')
  const generated = embedding.getByRole('button', {
    name: `Open Generated with ${reference.displayName} in Models`,
    exact: true,
  })
  const screenshot = (name) => page.screenshot({ path: path.join(root, `${name}.png`) })
  await screenshot('compare-before-repair')
  const manager = page.getByRole('dialog', { name: 'Model Manager', exact: true })
  const version = manager.locator('.version-row').filter({
    has: page.getByText(reference.versionName, { exact: true }),
  })

  const repair = version.getByRole('button', { name: 'Repair', exact: true })
  const dialog = page.getByRole('dialog', { name: 'Add from CivitAI URL', exact: true })
  const confirm = dialog.getByRole('button', {
    name: `Repair ${reference.versionName}`,
    exact: true,
  })
  async function reviewRepair() {
    await repair.click()
    await expect(dialog.getByPlaceholder('https://civitai.com/models/…')).toHaveValue(canonicalUrl)
    await expect(dialog.getByText('Repair this version', { exact: true })).toBeVisible({
      timeout: 25_000,
    })
    await expect(dialog.locator('.file-choice')).toContainText(
      /illustriousphoto\.safetensors.*Repair/i,
    )
    await expect(confirm).toBeEnabled()
  }

  let job
  try {
    await connectToken(page, liveToken)
    await generated.click()
    await expect(comparison).toBeHidden()
    await expect(manager.getByText('Compare resource unavailable', { exact: true })).toBeVisible()
    await expect(version).toHaveCount(1)
    await expect(version).toContainText('missing')
    await reviewRepair()
    await screenshot('review-exact-repair')
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(dialog).toBeHidden()
    assert.deepEqual(await readJobs(), [])
    assert.deepEqual(readSnapshot(), before)
    await assert.rejects(lstat(model.path), { code: 'ENOENT' })
    await assertBorrowedAndProject()

    await reviewRepair()
    await confirm.click()
    job = await waitForRepair(readJobs, reference)
    assert.equal(job.bytesDownloaded, model.sizeBytes)
    assert.equal(job.error, null)
    await expect(dialog).toBeHidden()
    const jobRow = manager.locator('.job-row').filter({
      has: page.getByText(reference.displayName, { exact: true }),
    })
    await expect(jobRow.getByText('completed', { exact: true })).toBeVisible()
    await expect(jobRow.getByText(reference.versionName, { exact: true })).toBeVisible()
  } finally {
    if (!page.isClosed()) {
      assert.equal((await call(page, 'models', 'removeToken')).kind, 'missing')
      await assert.rejects(lstat(tokenPath), { code: 'ENOENT' })
    }
  }

  const repaired = readSnapshot()
  const [originalFile] = before.registry.local_model_file
  const [repairedFile] = repaired.registry.local_model_file
  assert.ok(repairedFile.verified_at > originalFile.verified_at)
  assert.deepEqual(repaired, {
    ...before,
    registry: {
      ...before.registry,
      local_model_file: [{ ...originalFile, verified_at: repairedFile.verified_at }],
    },
    unusedCounts: { ...before.unusedCounts, model_install_job: 1, model_install_artifact: 1 },
  })
  const install = inspectSqlite(appData)
  assert.deepEqual(install.jobs, [
    {
      id: job.id,
      modelId: reference.civitaiModelId,
      versionId: reference.civitaiVersionId,
      fileId: reference.civitaiFileId,
      status: 'completed',
      bytesDownloaded: model.sizeBytes,
      totalBytes: model.sizeBytes,
      errorCode: null,
    },
  ])
  assert.deepEqual(install.artifacts, [
    {
      jobId: job.id,
      role: 'primary',
      sourceKind: 'civitai_file',
      expectedSha256: model.sha256,
      downloadedBytes: model.sizeBytes,
      status: 'ready',
      tempPath: null,
      errorCode: null,
    },
  ])
  const hashModel = () => hashInstalledFile(model.path, model)
  const published = await hashModel()
  assert.deepEqual(await readdir(path.join(appData, 'models/.staging')), [])
  const [initialResource] = catalog
  const [initialVersion] = initialResource.versions
  const restoredCatalog = [
    {
      ...initialResource,
      versions: [{ ...initialVersion, fileStatus: 'ready' }],
    },
  ]
  assert.deepEqual(await call(page, 'models', 'getCatalog'), restoredCatalog)

  await manager.getByRole('button', { name: 'Close Model Manager', exact: true }).click()
  await expect(manager).toBeHidden()
  await expect(comparison).toBeVisible()
  await expect(embedding).toHaveAttribute('data-status', 'Removed')
  await expect(generated).toHaveCount(0)
  const closeComparison = comparison.getByRole('button', {
    name: 'Close generation settings comparison',
    exact: true,
  })
  await expect(closeComparison).toBeFocused()
  await screenshot('compare-after-repair')
  await closeComparison.click()
  await assertAccepted(page)
  await assertBorrowedAndProject()
  await closeNormally(first)
  const saved = await retainOwnStore('after-component-repair')

  const second = await launch('reopen-after-component-repair')
  assert.equal((await call(second.page, 'runtime', 'getStatus')).kind, 'not-installed')
  assert.equal((await call(second.page, 'models', 'getTokenStatus')).kind, 'missing')
  assert.deepEqual(await call(second.page, 'models', 'getCatalog'), restoredCatalog)
  assert.deepEqual(await call(second.page, 'models', 'getInstallJobs'), [job])
  assert.deepEqual(readSnapshot(), repaired)
  await openProject(second.page)
  await assertAccepted(second.page)
  await assertComparison(second.page, 'Removed')
  await assertBorrowedAndProject()
  await closeNormally(second)
  const restarted = await retainOwnStore('restarted-after-component-repair')

  const reopened = readSnapshot()
  assert.deepEqual(reopened, {
    ...repaired,
    projects: [{ ...repaired.projects[0], last_opened_at: reopened.projects[0].last_opened_at }],
  })
  assert.ok(reopened.projects[0].last_opened_at > repaired.projects[0].last_opened_at)
  assert.deepEqual(inspectSqlite(appData), install)
  assert.deepEqual(await hashModel(), published)
  await assertBorrowedAndProject()
  await assert.rejects(lstat(tokenPath), { code: 'ENOENT' })

  const result = {
    missingDatabase,
    repaired: published,
    project: saved.project,
    resource: reference,
    job: install.jobs[0],
    artifact: install.artifacts[0],
    comparison: { before: 'Missing resource', after: 'Removed', restarted: 'Removed' },
  }
  await writeFile(path.join(root, 'repair.json'), `${JSON.stringify(result, null, 2)}\n`, {
    flag: 'wx',
  })
  return { saved, restarted, noobaiComponentRepair: result }
}
