/** Stock AppImage qualification for one exact, live CivitAI install and local catalog reopen. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open, readdir, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

import { expect } from '@playwright/test'
import Database from 'better-sqlite3'

const identity = {
  modelId: 833294,
  versionId: 1022833,
  fileId: 928571,
  sha256: 'ff827fc34584853257d6de64b8bc3e34156814f6b0cfd1a5112a5e9164806df1',
  sizeBytes: 6_938_040_416,
}
const providerPage = `https://civitai.com/models/${identity.modelId}?modelVersionId=${identity.versionId}`
const expectedSizeLabel = '6.5 GB'
const active = new Set(['waiting', 'downloading', 'verifying'])

function safeCode(value) {
  return typeof value === 'string' && /^[A-Z0-9_]{1,80}$/.test(value) ? value : null
}

async function modelApi(page, method, ...args) {
  const result = await page.evaluate(({ method, args }) => window.api.models[method](...args), {
    method,
    args,
  })
  assert.ok(result.ok, `Model API ${method} failed (${safeCode(result.error?.code) ?? 'unknown'}).`)
  return result.value
}

function inspectSqlite(appData) {
  const db = new Database(path.join(appData, 'database/app.sqlite'), {
    fileMustExist: true,
    readonly: true,
  })
  try {
    return db.transaction(() => ({
      integrity: db.pragma('integrity_check', { simple: true }),
      foreignKeys: db.pragma('foreign_key_check'),
      resourceCount: db.prepare('SELECT count(*) FROM model_resource').pluck().get(),
      versionCount: db.prepare('SELECT count(*) FROM model_resource_version').pluck().get(),
      fileCount: db.prepare('SELECT count(*) FROM local_model_file').pluck().get(),
      dependencyCount: db.prepare('SELECT count(*) FROM model_version_dependency').pluck().get(),
      catalog: db
        .prepare(
          `
        SELECT
          r.id AS resourceId, r.source_kind AS sourceKind, r.civitai_model_id AS modelId,
          r.type, r.default_version_id AS defaultVersionId,
          v.id AS localVersionId, v.civitai_model_version_id AS versionId,
          v.civitai_file_id AS fileId, v.base_model_family AS family,
          v.expected_sha256 AS expectedSha256,
          f.managed_path AS managedPath, f.size_bytes AS sizeBytes, f.sha256, f.status
        FROM model_resource r
        JOIN model_resource_version v ON v.model_resource_id = r.id
        JOIN local_model_file f ON f.resource_version_id = v.id
      `,
        )
        .all(),
      jobs: db
        .prepare(
          `
        SELECT id, civitai_model_id AS modelId, civitai_model_version_id AS versionId,
          civitai_file_id AS fileId, status, bytes_downloaded AS bytesDownloaded,
          total_bytes AS totalBytes, error_code AS errorCode
        FROM model_install_job
      `,
        )
        .all(),
      artifacts: db
        .prepare(
          `
        SELECT job_id AS jobId, role, source_kind AS sourceKind,
          expected_sha256 AS expectedSha256, downloaded_bytes AS downloadedBytes,
          status, temp_path AS tempPath, error_code AS errorCode
        FROM model_install_artifact
      `,
        )
        .all(),
    }))()
  } finally {
    db.close()
  }
}

function assertSqliteIntegrity(snapshot) {
  assert.equal(snapshot.integrity, 'ok')
  assert.deepEqual(snapshot.foreignKeys, [])
}

async function assertEmpty(page, appData) {
  assert.deepEqual(await modelApi(page, 'getInstallJobs'), [])
  assert.deepEqual(await modelApi(page, 'getCatalog'), [])
  assert.deepEqual(await modelApi(page, 'getStorageSummary'), { totalBytes: 0 })
  const sql = inspectSqlite(appData)
  assertSqliteIntegrity(sql)
  assert.deepEqual(
    [sql.resourceCount, sql.versionCount, sql.fileCount, sql.dependencyCount],
    [0, 0, 0, 0],
  )
  assert.deepEqual([sql.catalog, sql.jobs, sql.artifacts], [[], [], []])
  return sql
}

async function openManager(page) {
  await page
    .getByRole('region', { name: 'Home', exact: true })
    .getByRole('complementary', { name: 'Workspace navigation', exact: true })
    .getByRole('button', { name: 'Manage Models', exact: true })
    .click()
  const manager = page.getByRole('dialog', { name: 'Model Manager', exact: true })
  await expect(manager).toBeVisible()
  return manager
}

async function connectToken(page, liveToken) {
  assert.ok(typeof liveToken === 'string' && liveToken.length > 0, 'Missing live CivitAI token.')
  let status
  try {
    status = await page.evaluate(async (token) => {
      const result = await window.api.models.saveToken(token)
      return result.ok ? result.value.kind : 'failed'
    }, liveToken)
  } catch {
    throw new Error('Live token setup failed in the isolated packaged profile.')
  }
  assert.ok(status === 'connected', 'The live CivitAI token must validate before installation.')
}

async function reviewExactFile(page, manager) {
  await manager.getByRole('button', { name: 'Add from CivitAI URL', exact: true }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Add from CivitAI URL', exact: true })
  await dialog.getByPlaceholder('https://civitai.com/models/…').fill(providerPage)
  const fetchPreview = dialog.getByRole('button', { name: 'Fetch preview', exact: true })
  await expect(fetchPreview).toBeEnabled()
  await fetchPreview.click()
  await expect(
    dialog.getByRole('button', { name: 'Open CivitAI source', exact: true }),
  ).toBeVisible({ timeout: 30_000 })

  const preview = await modelApi(page, 'previewImport', providerPage)
  assert.equal(preview.kind, 'select-file')
  assert.equal(preview.modelId, identity.modelId)
  assert.equal(preview.versionId, identity.versionId)
  assert.equal(preview.baseModel, 'NoobAI')
  assert.equal(preview.baseModelFamily, 'illustrious')
  assert.equal(preview.resourceType, 'checkpoint')
  assert.deepEqual(preview.dependencies, [])
  const file = preview.files.find(({ fileId }) => fileId === identity.fileId)
  assert.ok(file, 'The exact EPS file is absent from the live CivitAI version.')
  assert.equal(file.sha256, identity.sha256)
  assert.equal(file.sizeEstimateBytes, identity.sizeBytes)
  assert.equal(file.alreadyInstalled, false)
  assert.equal(file.reusesInstalledFile, false)
  assert.equal(file.needsRepair, false)
  assert.ok(file.name.toLowerCase().endsWith('.safetensors'))

  const label = `${file.name} · ${expectedSizeLabel}`
  const fileChoice = dialog.locator('.file-choice')
  await fileChoice.locator('.n-base-selection').click()
  await page
    .locator('.n-base-select-option')
    .filter({ has: page.getByText(label, { exact: true }) })
    .click()
  await expect(fileChoice.getByText(label, { exact: true })).toBeVisible()
  await expect(
    dialog.getByText(`Estimated additional download: ${expectedSizeLabel}`, { exact: true }),
  ).toBeVisible()
  await expect(dialog.getByText('SHA-256 will be verified', { exact: false })).toBeVisible()
  const confirm = dialog.getByRole('button', {
    name: `Install ${preview.versionName}`,
    exact: true,
  })
  await expect(confirm).toBeEnabled()
  return {
    confirm,
    dialog,
    fileName: file.name,
    modelName: preview.modelName,
    versionName: preview.versionName,
  }
}

function jobMatches(job, reviewed) {
  return job.modelName === reviewed.modelName && job.versionName === reviewed.versionName
}

async function waitForTerminal(page, reviewed, startedAt, timeout, record) {
  const deadline = Date.now() + timeout
  let id
  let maxProgress = 0
  let lastStatus
  let lastSample = 0
  while (Date.now() < deadline) {
    const [job, ...unexpected] = await modelApi(page, 'getInstallJobs')
    assert.deepEqual(unexpected, [], 'Only the single reviewed install may be admitted.')
    if (job) {
      assert.ok(
        jobMatches(job, reviewed),
        'The admitted job must match the reviewed model/version.',
      )
      assert.equal(job.id, id ?? job.id, 'The live install changed its durable job ID.')
      id = job.id
      const elapsedMs = Date.now() - startedAt
      maxProgress = Math.max(maxProgress, job.bytesDownloaded)
      if (job.status !== lastStatus || elapsedMs - lastSample >= 10_000) {
        await record({
          elapsedMs,
          jobId: job.id,
          status: job.status,
          bytesDownloaded: job.bytesDownloaded,
          totalBytes: job.totalBytes,
          code: safeCode(job.error?.code),
        })
        lastStatus = job.status
        lastSample = elapsedMs
      }
      if (!active.has(job.status)) {
        assert.equal(
          job.status,
          'completed',
          `CivitAI install stopped (${safeCode(job.error?.code) ?? 'unknown'}).`,
        )
        return { id, maxProgress, elapsedMs }
      }
    }
    await delay(700)
  }
  await record({
    elapsedMs: Date.now() - startedAt,
    jobId: id ?? null,
    status: 'qualification-timeout',
    maxProgress,
  })
  throw new Error('Timed out waiting for the exact CivitAI installation to finish.')
}

function fileIdentity(stat) {
  return {
    device: stat.dev.toString(),
    inode: stat.ino.toString(),
    bytes: Number(stat.size),
    links: Number(stat.nlink),
    mode: Number(stat.mode & 0o777n),
    modifiedNs: stat.mtimeNs.toString(),
    changedNs: stat.ctimeNs.toString(),
  }
}

async function hashInstalledFile(filename) {
  assert.equal(await realpath(filename), filename)
  const handle = await open(
    filename,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  )
  try {
    const info = await handle.stat({ bigint: true })
    const before = fileIdentity(info)
    assert.ok(info.isFile())
    assert.equal(info.uid, BigInt(process.getuid()))
    assert.equal(before.bytes, identity.sizeBytes)
    assert.equal(before.links, 1)
    assert.equal(before.mode, 0o600)
    assert.deepEqual(fileIdentity(await lstat(filename, { bigint: true })), before)
    const hash = createHash('sha256')
    for await (const part of handle.createReadStream({ autoClose: false })) hash.update(part)
    const sha256 = hash.digest('hex')
    assert.equal(sha256, identity.sha256)
    assert.deepEqual(fileIdentity(await handle.stat({ bigint: true })), before)
    assert.deepEqual(fileIdentity(await lstat(filename, { bigint: true })), before)
    assert.equal(await realpath(filename), filename)
    return { ...before, path: filename, sha256 }
  } finally {
    await handle.close()
  }
}

async function assertCompletedSql(appData, jobId) {
  const sql = inspectSqlite(appData)
  assertSqliteIntegrity(sql)
  const managedPath = path.join(
    appData,
    'models',
    identity.sha256.slice(0, 2),
    `${identity.sha256}.safetensors`,
  )
  assert.deepEqual(
    [sql.resourceCount, sql.versionCount, sql.fileCount, sql.dependencyCount],
    [1, 1, 1, 0],
  )
  assert.equal(sql.catalog.length, 1)
  const { resourceId, localVersionId, ...published } = sql.catalog[0]
  assert.deepEqual(published, {
    sourceKind: 'civitai',
    modelId: identity.modelId,
    type: 'checkpoint',
    defaultVersionId: localVersionId,
    versionId: identity.versionId,
    fileId: identity.fileId,
    family: 'illustrious',
    expectedSha256: identity.sha256,
    managedPath,
    sizeBytes: identity.sizeBytes,
    sha256: identity.sha256,
    status: 'ready',
  })
  assert.equal(sql.jobs.length, 1)
  const { totalBytes, ...job } = sql.jobs[0]
  assert.ok(totalBytes === null || totalBytes === identity.sizeBytes)
  assert.deepEqual(job, {
    id: jobId,
    modelId: identity.modelId,
    versionId: identity.versionId,
    fileId: identity.fileId,
    status: 'completed',
    bytesDownloaded: identity.sizeBytes,
    errorCode: null,
  })
  assert.deepEqual(sql.artifacts, [
    {
      jobId,
      role: 'primary',
      sourceKind: 'civitai_file',
      expectedSha256: identity.sha256,
      downloadedBytes: identity.sizeBytes,
      status: 'ready',
      tempPath: null,
      errorCode: null,
    },
  ])
  assert.deepEqual(await readdir(path.join(appData, 'models/.staging')), [])
  return { sql, resourceId, localVersionId, managedPath }
}

async function assertInstalledCatalog(page, installed, reviewed, jobId) {
  const catalog = await modelApi(page, 'getCatalog')
  assert.equal(catalog.length, 1)
  const [resource] = catalog
  assert.equal(resource.id, installed.resourceId)
  assert.equal(resource.modelId, identity.modelId)
  assert.equal(resource.resourceType, 'checkpoint')
  assert.equal(resource.defaultVersionId, installed.localVersionId)
  assert.equal(resource.versions.length, 1)
  const [version] = resource.versions
  assert.equal(version.id, installed.localVersionId)
  assert.equal(version.civitaiVersionId, identity.versionId)
  assert.equal(version.civitaiFileId, identity.fileId)
  assert.equal(version.baseModelFamily, 'illustrious')
  assert.equal(version.fileName, reviewed.fileName)
  assert.equal(version.fileSizeBytes, identity.sizeBytes)
  assert.equal(version.sha256, identity.sha256)
  assert.equal(version.fileStatus, 'ready')
  assert.equal(version.predictionType, 'epsilon')
  assert.equal(version.predictionTypeSource, 'default')
  assert.deepEqual(version.dependencyIssues, [])
  const jobs = await modelApi(page, 'getInstallJobs')
  assert.equal(jobs.length, 1)
  assert.ok(jobMatches(jobs[0], reviewed))
  assert.equal(jobs[0].id, jobId)
  assert.equal(jobs[0].status, 'completed')
  assert.equal(jobs[0].bytesDownloaded, identity.sizeBytes)
  assert.equal(jobs[0].error, null)
  assert.deepEqual(await modelApi(page, 'getStorageSummary'), { totalBytes: identity.sizeBytes })
  return {
    resourceId: resource.id,
    localVersionId: version.id,
    fileStatus: version.fileStatus,
    predictionType: version.predictionType,
    predictionTypeSource: version.predictionTypeSource,
  }
}

export async function runNoobaiInstall({
  root,
  appData,
  state,
  closeNormally,
  launch,
  liveToken,
  downloadTimeoutMs = 420_000,
}) {
  assert.ok(Number.isSafeInteger(downloadTimeoutMs) && downloadTimeoutMs > 0)
  const page = state.page
  const tokenPath = path.join(appData, 'secrets/civitai-token.bin')
  const timelinePath = path.join(root, 'model-install-progress.ndjson')
  await writeFile(timelinePath, '', { flag: 'wx', mode: 0o600 })
  const record = (event) => writeFile(timelinePath, `${JSON.stringify(event)}\n`, { flag: 'a' })
  const emptyBefore = await assertEmpty(page, appData)
  await assert.rejects(lstat(tokenPath), { code: 'ENOENT' })
  let reviewed
  let confirmationIssued = false
  let installation
  let manager
  try {
    await connectToken(page, liveToken)
    const tokenFile = await lstat(tokenPath)
    assert.ok(tokenFile.isFile() && tokenFile.size > 0 && (tokenFile.mode & 0o777) === 0o600)
    manager = await openManager(page)
    await expect(
      manager.getByRole('button', { name: 'CivitAI connected', exact: true }),
    ).toBeVisible()
    reviewed = await reviewExactFile(page, manager)
    assert.deepEqual(await assertEmpty(page, appData), emptyBefore)
    await record({ status: 'reviewed', source: providerPage, fileId: identity.fileId })
    const startedAt = Date.now()
    confirmationIssued = true
    await reviewed.confirm.click()
    installation = await waitForTerminal(page, reviewed, startedAt, downloadTimeoutMs, record)
    await expect(reviewed.dialog).toBeHidden()
  } finally {
    if (confirmationIssued && !installation && !page.isClosed()) {
      const jobs = await modelApi(page, 'getInstallJobs').catch(() => [])
      if (jobs.length === 1 && jobMatches(jobs[0], reviewed) && active.has(jobs[0].status)) {
        const canceled = await modelApi(page, 'cancelInstall', jobs[0].id).catch(() => null)
        await record({
          status: 'timeout-settlement',
          jobId: jobs[0].id,
          outcome: canceled?.status ?? 'unknown',
        })
      }
    }
    assert.equal((await modelApi(page, 'removeToken')).kind, 'missing')
    await assert.rejects(lstat(tokenPath), { code: 'ENOENT' })
  }

  const installed = await assertCompletedSql(appData, installation.id)
  const published = await hashInstalledFile(installed.managedPath)
  const catalog = await assertInstalledCatalog(page, installed, reviewed, installation.id)
  await expect(manager.locator('.job-row').getByText('completed', { exact: true })).toBeVisible()
  await manager.getByRole('button', { name: 'Back to models', exact: true }).click()
  await expect(
    manager.locator('.resource-row').getByText(reviewed.modelName, { exact: true }),
  ).toBeVisible()
  const installScreenshot = path.join(root, 'noobai-eps-installed.png')
  await page.screenshot({ animations: 'disabled', path: installScreenshot })
  await manager.getByRole('button', { name: 'Close Model Manager', exact: true }).click()
  await closeNormally(state)
  assert.equal(state.normalPhysicalExit, true)
  assert.deepEqual((await assertCompletedSql(appData, installation.id)).sql, installed.sql)

  const reopened = await launch('noobai-eps-reopened')
  assert.equal((await modelApi(reopened.page, 'getTokenStatus')).kind, 'missing')
  await assert.rejects(lstat(tokenPath), { code: 'ENOENT' })
  const reopenedCatalog = await assertInstalledCatalog(
    reopened.page,
    installed,
    reviewed,
    installation.id,
  )
  assert.deepEqual(reopenedCatalog, catalog)
  const reopenedManager = await openManager(reopened.page)
  await expect(
    reopenedManager.locator('.resource-row').getByText(reviewed.modelName, { exact: true }),
  ).toBeVisible()
  const reopenedScreenshot = path.join(root, 'noobai-eps-reopened.png')
  await reopened.page.screenshot({ animations: 'disabled', path: reopenedScreenshot })
  await reopenedManager.getByRole('button', { name: 'Close Model Manager', exact: true }).click()
  await closeNormally(reopened)
  assert.equal(reopened.normalPhysicalExit, true)
  assert.deepEqual((await assertCompletedSql(appData, installation.id)).sql, installed.sql)
  const { path: managedPath, sha256, ...installedFile } = published
  assert.deepEqual(fileIdentity(await lstat(managedPath, { bigint: true })), installedFile)
  assert.equal(await realpath(managedPath), managedPath)
  return {
    providerPage,
    modelIdentity: identity,
    reviewed: {
      modelName: reviewed.modelName,
      versionName: reviewed.versionName,
      fileName: reviewed.fileName,
    },
    installation,
    published,
    catalog,
    sqlite: installed.sql,
    tokenRemoved: true,
    credentiallessCatalogReopen: true,
    normalPhysicalExits: 2,
    screenshots: [installScreenshot, reopenedScreenshot],
    timelinePath,
  }
}
