/** Stock AppImage qualification for one exact, live CivitAI install and local catalog reopen. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open, readdir, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

import { expect } from '@playwright/test'
import Database from 'better-sqlite3'

const profiles = {
  eps: {
    modelId: 833294,
    versionId: 1022833,
    fileId: 928571,
    sha256: 'ff827fc34584853257d6de64b8bc3e34156814f6b0cfd1a5112a5e9164806df1',
    sizeBytes: 6_938_040_416,
  },
  v: {
    modelId: 1147756,
    versionId: 2679856,
    fileId: 2566634,
    sha256: 'edca0d656069468ce208440edda4643b8795b6dc500606bb6d0e57eb9a54c89d',
    sizeBytes: 6_938_040_794,
  },
  v11: {
    modelId: 1147756,
    versionId: 2468033,
    fileId: 2356667,
    sha256: 'e3af301ae8c62073a7d28426c2e748b6953d7d6f0ad9a7b42a88f867e8b17337',
    sizeBytes: 6_938_040_794,
  },
  lora: {
    modelId: 1121001,
    versionId: 1260279,
    fileId: 1165414,
    sha256: 'c2bd847fb3859cc8ce16af6ecce291c96b36ca486999e620af9b886367ee6ee9',
    sizeBytes: 114_437_420,
    resourceType: 'lora',
    sourceBaseModel: 'Illustrious',
    author: 'obuyb404',
    sizeLabel: '109.1 MB',
  },
  embedding: {
    modelId: 2360940,
    versionId: 2655289,
    fileId: 2542976,
    sha256: '91a95b244b8ba01d905d32ced7e3cc20eb74b4da8f519de3764505500d386c36',
    sizeBytes: 49_736,
    resourceType: 'embedding',
    sourceBaseModel: 'Illustrious',
    author: 'CautionMergeAhead',
    sizeLabel: '48.6 KB',
    fileName: 'illustriousphoto.safetensors',
    activationToken: '<illustriousphoto>',
  },
  vae: {
    modelId: 1219546,
    versionId: 1594319,
    fileId: 1494323,
    sha256: 'fc7d6b12b37b12759e30b1109068a4bb2a0a84e79ab01262cc5af6b89a783ec6',
    sizeBytes: 334_640_988,
    resourceType: 'vae',
    sourceBaseModel: 'NoobAI',
    author: 'Euge_',
    sizeLabel: '319.1 MB',
    fileName: 'sdxlVaeAnimeTest_beta120000_1494323.safetensors',
    sameBytesPrimary: {
      fileId: 1494307,
      fileName: 'sdxlVaeAnimeTest_beta120000_1494307.safetensors',
    },
  },
}
const predecessors = {
  eps: [],
  v: [profiles.eps],
  v11: [profiles.eps, profiles.v],
  lora: [],
  embedding: [],
  vae: [],
}
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

export function inspectSqlite(appData) {
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
        ORDER BY r.civitai_model_id, v.civitai_model_version_id, v.civitai_file_id
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
        ORDER BY civitai_model_id, civitai_model_version_id, civitai_file_id, id
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
        ORDER BY job_id, role
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

function assertSqliteCounts(sql, resourceCount, versionCount) {
  assert.deepEqual(
    [sql.resourceCount, sql.versionCount, sql.fileCount, sql.dependencyCount],
    [resourceCount, versionCount, versionCount, 0],
  )
  assert.deepEqual(
    [sql.catalog.length, sql.jobs.length, sql.artifacts.length],
    [versionCount, versionCount, versionCount],
  )
}

function isExactSource(row, identity) {
  return (
    row.modelId === identity.modelId &&
    row.versionId === identity.versionId &&
    row.fileId === identity.fileId
  )
}

async function inspectBaseline(page, appData, profile) {
  const sql = inspectSqlite(appData)
  assertSqliteIntegrity(sql)
  const identities = predecessors[profile]
  const count = identities.length
  assertSqliteCounts(sql, count, count)
  const catalog = await modelApi(page, 'getCatalog')
  assert.equal(catalog.length, count)
  const jobs = await modelApi(page, 'getInstallJobs')
  assert.equal(jobs.length, count)
  const checkpoints = []
  for (const modelIdentity of identities) {
    const job = sql.jobs.find((row) => isExactSource(row, modelIdentity))
    assert.ok(job, 'The prior checkpoint must have a completed install job.')
    const existing = assertSqliteInstall(sql, appData, modelIdentity, job.id)
    assertCompletedJob(
      jobs.find(({ id }) => id === job.id),
      modelIdentity,
      job.id,
      null,
    )
    const version = installedCatalogVersion(catalog, sql, existing, modelIdentity, null)
    const published = await hashInstalledFile(existing.managedPath, modelIdentity)
    checkpoints.push({ modelIdentity, published, catalog: version })
  }
  await assertStorageSummary(page, sql)
  assert.deepEqual(await readdir(path.join(appData, 'models/.staging')), [])
  return { sql, jobs, checkpoints }
}

async function openManager(page) {
  await page
    .getByRole('region', { name: 'Home', exact: true })
    .getByRole('complementary', { name: 'Workspace navigation', exact: true })
    .getByRole('button', { name: 'Manage Models', exact: true })
    .click()
  const manager = page.getByRole('dialog', {
    name: 'Model Manager',
    exact: true,
  })
  await expect(manager).toBeVisible()
  return manager
}

export async function connectToken(page, liveToken) {
  assert.ok(typeof liveToken === 'string' && liveToken.length > 0, 'Missing live CivitAI token.')
  let status
  try {
    status = await page.evaluate(async (token) => {
      const result = await window.api.models.saveToken(token)
      if (result.ok) return result.value.kind
      const code = result.error?.code
      return typeof code === 'string' && /^[A-Z0-9_]{1,80}$/.test(code) ? code : 'failed'
    }, liveToken)
  } catch {
    throw new Error('Live token setup failed in the isolated packaged profile.')
  }
  assert.ok(
    status === 'connected',
    `The live CivitAI token must validate before installation (${status}).`,
  )
}

async function reviewExactFile(page, manager, providerPage, identity) {
  await manager.getByRole('button', { name: 'Add from CivitAI URL', exact: true }).first().click()
  const dialog = page.getByRole('dialog', {
    name: 'Add from CivitAI URL',
    exact: true,
  })
  await dialog.getByPlaceholder('https://civitai.com/models/…').fill(providerPage)
  const fetchPreview = dialog.getByRole('button', {
    name: 'Fetch preview',
    exact: true,
  })
  await expect(fetchPreview).toBeEnabled()
  await fetchPreview.click()
  await expect(
    dialog.getByRole('button', { name: 'Open CivitAI source', exact: true }),
  ).toBeVisible({ timeout: 30_000 })

  const preview = await modelApi(page, 'previewImport', providerPage)
  assert.equal(preview.kind, 'select-file')
  assert.equal(preview.modelId, identity.modelId)
  assert.equal(preview.versionId, identity.versionId)
  const sourceBaseModel = identity.sourceBaseModel ?? 'NoobAI'
  assert.equal(preview.baseModel, sourceBaseModel)
  assert.equal(preview.baseModelFamily, 'illustrious')
  assert.equal(preview.resourceType, identity.resourceType ?? 'checkpoint')
  if (identity.resourceType) assert.equal(preview.author, identity.author)
  assert.deepEqual(preview.dependencies, [])
  const file = preview.files.find(({ fileId }) => fileId === identity.fileId)
  assert.ok(file, 'The exact file is absent from the live CivitAI version.')
  assert.equal(file.sha256, identity.sha256)
  assert.equal(file.sizeEstimateBytes, identity.sizeBytes)
  assert.equal(file.alreadyInstalled, false)
  assert.equal(file.reusesInstalledFile, false)
  assert.equal(file.needsRepair, false)
  assert.ok(file.name.toLowerCase().endsWith('.safetensors'))
  if (identity.fileName) assert.equal(file.name, identity.fileName)

  const sizeLabel = identity.sizeLabel ?? '6.5 GB'
  const label = `${file.name} · ${sizeLabel}`
  const fileChoice = dialog.locator('.file-choice')
  const selection = fileChoice.locator('.n-base-selection')
  if (identity.sameBytesPrimary) {
    const primary = preview.files.find(({ fileId }) => fileId === identity.sameBytesPrimary.fileId)
    assert.ok(primary, 'The same-digest primary file must also be offered.')
    assert.equal(file.primary, false)
    assert.equal(primary.primary, true)
    assert.equal(primary.name, identity.sameBytesPrimary.fileName)
    assert.equal(primary.sha256, identity.sha256)
    assert.equal(primary.sizeEstimateBytes, identity.sizeBytes)
    const primaryLabel = `${primary.name} · ${sizeLabel}`
    await expect(fileChoice.getByText(primaryLabel, { exact: true })).toBeVisible()
  }
  await selection.click()
  await page
    .locator('.n-base-select-option')
    .filter({ has: page.getByText(label, { exact: true }) })
    .click()
  await expect(fileChoice.getByText(label, { exact: true })).toBeVisible()
  await expect(
    dialog.getByText(`Estimated additional download: ${sizeLabel}`, {
      exact: true,
    }),
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
    ...(identity.resourceType && { sourceBaseModel, trainedWords: preview.trainedWords }),
  }
}

export async function reviewLiveVaeInstall(page) {
  const artifactIdentity = profiles.vae
  const providerPage = `https://civitai.com/models/${artifactIdentity.modelId}?modelVersionId=${artifactIdentity.versionId}`
  const manager = await openManager(page)
  const reviewed = await reviewExactFile(page, manager, providerPage, artifactIdentity)
  return { ...reviewed, manager, artifactIdentity }
}

function jobMatches(job, reviewed) {
  return job.modelName === reviewed.modelName && job.versionName === reviewed.versionName
}

function newJobs(jobs, baselineJobs) {
  for (const knownJob of baselineJobs) {
    assert.deepEqual(
      jobs.find(({ id }) => id === knownJob.id),
      knownJob,
    )
  }
  return jobs.filter(({ id }) => !baselineJobs.some((job) => job.id === id))
}

async function waitForTerminal(page, reviewed, startedAt, timeout, record, baselineJobs) {
  const deadline = Date.now() + timeout
  let id
  let maxProgress = 0
  let lastStatus
  let lastSample = 0
  while (Date.now() < deadline) {
    const [job, ...unexpected] = newJobs(await modelApi(page, 'getInstallJobs'), baselineJobs)
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

export async function hashInstalledFile(filename, identity) {
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

function assertSqliteInstall(sql, appData, identity, jobId, sibling) {
  const managedPath = path.join(
    appData,
    'models',
    identity.sha256.slice(0, 2),
    `${identity.sha256}.safetensors`,
  )
  const row = sql.catalog.find((candidate) => isExactSource(candidate, identity))
  assert.ok(row, 'The exact file must have a durable catalog row.')
  const { resourceId, localVersionId, ...published } = row
  if (sibling) {
    assert.equal(resourceId, sibling.resourceId)
    assert.notEqual(localVersionId, sibling.localVersionId)
  }
  assert.deepEqual(published, {
    sourceKind: 'civitai',
    modelId: identity.modelId,
    type: identity.resourceType ?? 'checkpoint',
    defaultVersionId: sibling?.defaultVersionId ?? localVersionId,
    versionId: identity.versionId,
    fileId: identity.fileId,
    family: 'illustrious',
    expectedSha256: identity.sha256,
    managedPath,
    sizeBytes: identity.sizeBytes,
    sha256: identity.sha256,
    status: 'ready',
  })
  const storedJob = sql.jobs.find(({ id }) => id === jobId)
  assert.ok(storedJob, 'The completed job must have a durable queue row.')
  const { totalBytes, ...job } = storedJob
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
  assert.deepEqual(
    sql.artifacts.filter((artifact) => artifact.jobId === jobId),
    [
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
    ],
  )
  return row
}

async function assertCompletedSql(appData, identity, jobId, baseline) {
  const sql = inspectSqlite(appData)
  assertSqliteIntegrity(sql)
  const sibling = baseline.catalog.find(({ modelId }) => modelId === identity.modelId)
  assertSqliteCounts(sql, baseline.resourceCount + (sibling ? 0 : 1), baseline.versionCount + 1)
  assert.deepEqual(
    sql.catalog.filter((row) => !isExactSource(row, identity)),
    baseline.catalog,
  )
  assert.deepEqual(
    sql.jobs.filter(({ id }) => id !== jobId),
    baseline.jobs,
  )
  assert.deepEqual(
    sql.artifacts.filter((artifact) => artifact.jobId !== jobId),
    baseline.artifacts,
  )
  const row = assertSqliteInstall(sql, appData, identity, jobId, sibling)
  assert.deepEqual(await readdir(path.join(appData, 'models/.staging')), [])
  const component = identity.resourceType ? inspectPublishedComponent(appData, row, identity) : null
  return { sql, row, component, managedPath: row.managedPath }
}

function inspectPublishedComponent(appData, row, identity) {
  const db = new Database(path.join(appData, 'database/app.sqlite'), {
    fileMustExist: true,
    readonly: true,
  })
  try {
    const stored = db
      .prepare(
        `SELECT r.creator AS author, r.display_name AS modelName, v.version_name AS versionName,
          v.prediction_type AS predictionType, v.source_metadata_json AS sourceMetadata,
          f.original_filename AS fileName
        FROM model_resource r
        JOIN model_resource_version v ON v.model_resource_id = r.id
        JOIN local_model_file f ON f.resource_version_id = v.id
        WHERE r.id = ? AND v.id = ?`,
      )
      .get(row.resourceId, row.localVersionId)
    assert.ok(stored, 'The installed component metadata must have a durable row.')
    assert.equal(stored.author, identity.author)
    assert.equal(stored.predictionType, null)
    const { baseModel, trainedWords } = JSON.parse(stored.sourceMetadata)
    assert.equal(baseModel, identity.sourceBaseModel)
    assert.ok(Array.isArray(trainedWords) && trainedWords.every((word) => typeof word === 'string'))
    const { author, fileName, modelName, versionName } = stored
    const activationToken = identity.activationToken
      ? `<${path.basename(fileName, '.safetensors')}>`
      : undefined
    return {
      author,
      baseModel,
      fileName,
      modelName,
      trainedWords,
      versionName,
      ...(activationToken && { activationToken }),
    }
  } finally {
    db.close()
  }
}

function installedCatalogVersion(catalog, sql, row, identity, reviewed) {
  const resource = catalog.find(({ modelId }) => modelId === identity.modelId)
  assert.ok(resource, 'The installed resource must be present in the catalog.')
  assert.equal(resource.id, row.resourceId)
  assert.equal(resource.modelId, identity.modelId)
  assert.equal(resource.resourceType, identity.resourceType ?? 'checkpoint')
  assert.equal(resource.defaultVersionId, row.defaultVersionId)
  assert.equal(
    resource.versions.length,
    sql.catalog.filter(({ resourceId }) => resourceId === row.resourceId).length,
  )
  const version = resource.versions.find(({ id }) => id === row.localVersionId)
  assert.ok(version, 'The exact installed version must be present in the catalog.')
  assert.equal(version.civitaiVersionId, identity.versionId)
  assert.equal(version.civitaiFileId, identity.fileId)
  assert.equal(version.baseModelFamily, 'illustrious')
  if (reviewed) assert.equal(version.fileName, reviewed.fileName)
  assert.equal(version.fileSizeBytes, identity.sizeBytes)
  assert.equal(version.sha256, identity.sha256)
  assert.equal(version.fileStatus, 'ready')
  assert.equal(version.predictionType, identity.resourceType ? null : 'epsilon')
  assert.equal(version.predictionTypeSource, identity.resourceType ? 'not-applicable' : 'default')
  assert.deepEqual(version.dependencyIssues, [])
  if (identity.resourceType) {
    assert.equal(resource.author, identity.author)
    assert.equal(resource.sourceUrl, `https://civitai.com/models/${identity.modelId}`)
    assert.equal(resource.name, reviewed.modelName)
    assert.equal(version.name, reviewed.versionName)
    assert.equal(version.noiseProfile, undefined)
    assert.equal(version.anima, undefined)
    assert.deepEqual(resource.trainedWords, reviewed.trainedWords)
    assert.deepEqual(version.trainedWords, reviewed.trainedWords)
  }
  return {
    resourceId: resource.id,
    localVersionId: version.id,
    fileStatus: version.fileStatus,
    predictionType: version.predictionType,
    predictionTypeSource: version.predictionTypeSource,
  }
}

function assertCatalogNeighbors(catalog, sql, baseline) {
  for (const checkpoint of baseline.checkpoints) {
    const row = sql.catalog.find(
      ({ localVersionId }) => localVersionId === checkpoint.catalog.localVersionId,
    )
    assert.deepEqual(
      installedCatalogVersion(catalog, sql, row, checkpoint.modelIdentity, null),
      checkpoint.catalog,
    )
  }
}

function assertCompletedJob(job, identity, jobId, reviewed) {
  assert.ok(job, 'The completed install job must be visible.')
  if (reviewed) assert.ok(jobMatches(job, reviewed))
  assert.equal(job.id, jobId)
  assert.equal(job.status, 'completed')
  assert.equal(job.bytesDownloaded, identity.sizeBytes)
  assert.equal(job.error, null)
}

async function assertStorageSummary(page, sql) {
  assert.deepEqual(await modelApi(page, 'getStorageSummary'), {
    totalBytes: sql.catalog.reduce((bytes, entry) => bytes + entry.sizeBytes, 0),
  })
}

async function assertInstalledCatalog(page, installed, identity, reviewed, jobId, baseline) {
  const { sql, row, component } = installed
  if (identity.resourceType) {
    assert.deepEqual(component, {
      author: identity.author,
      baseModel: reviewed.sourceBaseModel,
      fileName: reviewed.fileName,
      modelName: reviewed.modelName,
      trainedWords: reviewed.trainedWords,
      versionName: reviewed.versionName,
      ...(identity.activationToken && { activationToken: identity.activationToken }),
    })
  }
  const catalog = await modelApi(page, 'getCatalog')
  assert.equal(catalog.length, sql.resourceCount)
  const version = installedCatalogVersion(catalog, sql, row, identity, reviewed)
  assertCatalogNeighbors(catalog, sql, baseline)
  const [job, ...unexpected] = newJobs(await modelApi(page, 'getInstallJobs'), baseline.jobs)
  assert.deepEqual(unexpected, [])
  assertCompletedJob(job, identity, jobId, reviewed)
  await assertStorageSummary(page, sql)
  return version
}

async function assertUnchangedFile(published) {
  const { path: filename, sha256, ...expected } = published
  assert.deepEqual(fileIdentity(await lstat(filename, { bigint: true })), expected)
  assert.equal(await realpath(filename), filename)
}

export async function runNoobaiInstall({
  root,
  appData,
  state,
  closeNormally,
  launch,
  liveToken,
  profile = 'eps',
  downloadTimeoutMs = 420_000,
}) {
  assert.ok(Number.isSafeInteger(downloadTimeoutMs) && downloadTimeoutMs > 0)
  assert.ok(Object.hasOwn(profiles, profile), 'Unknown NoobAI install profile.')
  const identity = profiles[profile]
  const providerPage = `https://civitai.com/models/${identity.modelId}?modelVersionId=${identity.versionId}`
  const page = state.page
  const tokenPath = path.join(appData, 'secrets/civitai-token.bin')
  const timelinePath = path.join(root, 'model-install-progress.ndjson')
  await writeFile(timelinePath, '', { flag: 'wx', mode: 0o600 })
  const record = (event) => writeFile(timelinePath, `${JSON.stringify(event)}\n`, { flag: 'a' })
  const baseline = await inspectBaseline(page, appData, profile)
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
    reviewed = await reviewExactFile(page, manager, providerPage, identity)
    assert.deepEqual(inspectSqlite(appData), baseline.sql)
    const jobs = await modelApi(page, 'getInstallJobs')
    assert.deepEqual(newJobs(jobs, baseline.jobs), [])
    const beforeCatalog = await modelApi(page, 'getCatalog')
    assert.equal(beforeCatalog.length, baseline.sql.resourceCount)
    assertCatalogNeighbors(beforeCatalog, baseline.sql, baseline)
    await assertStorageSummary(page, baseline.sql)
    await record({
      status: 'reviewed',
      source: providerPage,
      fileId: identity.fileId,
    })
    const startedAt = Date.now()
    confirmationIssued = true
    await reviewed.confirm.click()
    installation = await waitForTerminal(
      page,
      reviewed,
      startedAt,
      downloadTimeoutMs,
      record,
      baseline.jobs,
    )
    await expect(reviewed.dialog).toBeHidden()
  } finally {
    if (confirmationIssued && !installation && !page.isClosed()) {
      const jobs = await modelApi(page, 'getInstallJobs').catch(() => [])
      const target = jobs.find(
        (job) => !baseline.jobs.some(({ id }) => id === job.id) && jobMatches(job, reviewed),
      )
      if (target && active.has(target.status)) {
        const canceled = await modelApi(page, 'cancelInstall', target.id).catch(() => null)
        await record({
          status: 'timeout-settlement',
          jobId: target.id,
          outcome: canceled?.status ?? 'unknown',
        })
      }
    }
    assert.equal((await modelApi(page, 'removeToken')).kind, 'missing')
    await assert.rejects(lstat(tokenPath), { code: 'ENOENT' })
  }

  const installed = await assertCompletedSql(appData, identity, installation.id, baseline.sql)
  const published = await hashInstalledFile(installed.managedPath, identity)
  const catalog = await assertInstalledCatalog(
    page,
    installed,
    identity,
    reviewed,
    installation.id,
    baseline,
  )
  await expect(
    manager
      .locator('.job-row')
      .filter({ has: page.getByText(reviewed.modelName, { exact: true }) })
      .filter({ has: page.getByText(reviewed.versionName, { exact: true }) })
      .getByText('completed', { exact: true }),
  ).toBeVisible()
  await manager.getByRole('button', { name: 'Back to models', exact: true }).click()
  await expect(
    manager.locator('.resource-row').getByText(reviewed.modelName, { exact: true }),
  ).toBeVisible()
  const installScreenshot = path.join(root, `noobai-${profile}-installed.png`)
  await page.screenshot({ animations: 'disabled', path: installScreenshot })
  await manager.getByRole('button', { name: 'Close Model Manager', exact: true }).click()
  await closeNormally(state)
  assert.equal(state.normalPhysicalExit, true)
  assert.deepEqual(
    await assertCompletedSql(appData, identity, installation.id, baseline.sql),
    installed,
  )

  const reopened = await launch(`noobai-${profile}-reopened`)
  assert.equal((await modelApi(reopened.page, 'getTokenStatus')).kind, 'missing')
  await assert.rejects(lstat(tokenPath), { code: 'ENOENT' })
  const reopenedCatalog = await assertInstalledCatalog(
    reopened.page,
    await assertCompletedSql(appData, identity, installation.id, baseline.sql),
    identity,
    reviewed,
    installation.id,
    baseline,
  )
  assert.deepEqual(reopenedCatalog, catalog)
  const reopenedManager = await openManager(reopened.page)
  await expect(
    reopenedManager.locator('.resource-row').getByText(reviewed.modelName, { exact: true }),
  ).toBeVisible()
  const reopenedScreenshot = path.join(root, `noobai-${profile}-reopened.png`)
  await reopened.page.screenshot({
    animations: 'disabled',
    path: reopenedScreenshot,
  })
  await reopenedManager.getByRole('button', { name: 'Close Model Manager', exact: true }).click()
  await closeNormally(reopened)
  assert.equal(reopened.normalPhysicalExit, true)
  assert.deepEqual(
    await assertCompletedSql(appData, identity, installation.id, baseline.sql),
    installed,
  )
  await assertUnchangedFile(published)
  for (const checkpoint of baseline.checkpoints) await assertUnchangedFile(checkpoint.published)
  const [existingEps, existingV] = baseline.checkpoints
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
    ...(existingEps && { existingEps }),
    ...(existingV && { existingV }),
    catalog,
    ...(installed.component && { component: installed.component }),
    sqlite: installed.sql,
    tokenRemoved: true,
    credentiallessCatalogReopen: true,
    normalPhysicalExits: 2,
    screenshots: [installScreenshot, reopenedScreenshot],
    timelinePath,
  }
}
