/** Explicit live installation from the closed profile recovered after the R4 Main-death cut. */
import assert from 'node:assert/strict'
import { constants } from 'node:fs'
import { copyFile, lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { expect } from '@playwright/test'
import Database from 'better-sqlite3'

import { snapshotDatabase } from './application-state-upgrade-fixture.mjs'
import { assertOfflineProjectDesktop } from './packaged-noobai-import-chooser.mjs'
import {
  assertCompletedSql,
  assertInstalledCatalog,
  connectToken,
  hashInstalledFile,
  inspectSqlite,
  modelApi,
  openManager,
  reviewLiveVaeInstall,
  waitForTerminal,
} from './packaged-noobai-install-ui.mjs'

const scenario = 'model-install-retry'
const interruption = 'packaged-model-install-interruption/20261122-r4/model-install-interruption'
const oldJobId = '79badbfd-494f-4dff-94d3-7bbf847242d4'
const oldArtifactId = '66f6963c-d020-47a2-bbf7-3a5b24f4c9ed'
const interrupted = {
  code: 'interrupted',
  message: 'Installation was interrupted when the application closed.',
}
const model = {
  modelId: 1219546,
  versionId: 1594319,
  fileId: 1494323,
  sizeBytes: 334_640_988,
  sha256: 'fc7d6b12b37b12759e30b1109068a4bb2a0a84e79ab01262cc5af6b89a783ec6',
}
const oldJob = {
  id: oldJobId,
  modelName: 'sdxl-vae-anime-test',
  versionName: 'beta-120000',
  status: 'failed',
  error: interrupted,
  bytesDownloaded: 401,
  totalBytes: model.sizeBytes,
}
const sourceBytes = {
  sizeBytes: 368_640,
  sha256: '301ebe7a149a247ed77b905c802c415e85800fd30a5d32fc6b3491fcc5e40895',
}
const active = new Set(['waiting', 'downloading', 'verifying'])

async function assertClosed(database) {
  for (const suffix of ['-wal', '-shm', '-journal']) {
    await assert.rejects(lstat(database + suffix), { code: 'ENOENT' })
  }
}

async function retainClosed(database, filename, identity) {
  await assertClosed(database)
  assert.ok((await lstat(database)).isFile())
  const pin = await identity(database)
  await copyFile(database, filename, constants.COPYFILE_EXCL)
  assert.deepEqual(await identity(filename), { ...pin, path: filename })
  return { databaseFiles: [{ ...pin, path: filename }] }
}

async function seedProfile(appData, ownedRunRoot, identity) {
  const source = path.join(ownedRunRoot, interruption, 'after-repeat.sqlite')
  assert.equal(await realpath(source), source)
  const sourceInfo = await lstat(source)
  assert.ok(sourceInfo.isFile() && sourceInfo.uid === process.getuid() && sourceInfo.nlink === 1)
  await assertClosed(source)
  assert.deepEqual(await identity(source), { path: source, ...sourceBytes })

  const old = snapshotDatabase(source, { closed: true })
  assert.equal(old.integrityCheck, 'ok')
  assert.deepEqual(old.foreignKeyCheck, [])
  assert.equal(old.schemaMigrations.length, 30)
  for (const table of [
    'project_index',
    'generation_queue_item',
    'model_resource',
    'model_resource_version',
    'local_model_file',
    'model_version_dependency',
  ]) {
    assert.deepEqual(old.tables[table].rows, [], table)
  }
  const [job] = old.tables.model_install_job.rows
  assert.equal(old.tables.model_install_job.rows.length, 1)
  assert.deepEqual(
    [
      job.id,
      job.civitai_model_id,
      job.civitai_model_version_id,
      job.civitai_file_id,
      job.status,
      job.bytes_downloaded,
      job.total_bytes,
      job.error_code,
      job.error_message,
    ],
    [
      oldJobId,
      model.modelId,
      model.versionId,
      model.fileId,
      'failed',
      401,
      model.sizeBytes,
      interrupted.code,
      interrupted.message,
    ],
  )
  assert.deepEqual(JSON.parse(job.preview_payload_json), {
    baseModelFamily: 'illustrious',
    displayName: oldJob.modelName,
    resourceType: 'vae',
    versionName: oldJob.versionName,
  })
  assert.deepEqual(old.tables.model_install_artifact.rows, [
    {
      id: oldArtifactId,
      job_id: oldJobId,
      role: 'primary',
      source_kind: 'civitai_file',
      source_identity: `civitai:file:${model.fileId}`,
      expected_size_bytes: null,
      expected_sha256: model.sha256,
      downloaded_bytes: 0,
      status: 'failed',
      temp_path: null,
      error_code: interrupted.code,
      error_message: interrupted.message,
    },
  ])

  const [workspace] = old.tables.project_workspace.rows
  assert.equal(old.tables.project_workspace.rows.length, 1)
  assert.equal(workspace.id, 'uncategorized')
  assert.equal(workspace.is_default, 1)
  assert.equal(
    workspace.directory_path,
    path.join(ownedRunRoot, interruption, 'data/imagegen-studio/workspaces/Uncategorized'),
  )
  await assert.rejects(lstat(appData), { code: 'ENOENT' })
  const database = path.join(appData, 'database/app.sqlite')
  const directory = path.join(appData, 'workspaces/Uncategorized')
  await mkdir(path.dirname(database), { recursive: true, mode: 0o700 })
  await mkdir(directory, { recursive: true, mode: 0o700 })
  assert.equal(await realpath(directory), directory)
  assert.equal(await realpath(path.dirname(database)), path.dirname(database))
  await copyFile(source, database, constants.COPYFILE_EXCL)
  assert.deepEqual(await identity(database), { path: database, ...sourceBytes })

  // A private empty workspace follows the new profile. The retained install rows stay untouched.
  const db = new Database(database, { fileMustExist: true })
  try {
    const changed = db
      .prepare(
        'UPDATE project_workspace SET directory_path = ? WHERE id = ? AND directory_path = ? AND is_default = 1',
      )
      .run(directory, workspace.id, workspace.directory_path)
    assert.equal(changed.changes, 1)
  } finally {
    db.close()
  }
  await assertClosed(database)
  const baseline = snapshotDatabase(database, { closed: true })
  workspace.directory_path = directory
  assert.deepEqual(baseline, old)
  return { database, source: { path: source, ...sourceBytes }, baseline }
}

async function showQueue(page, manager, completed) {
  await manager.getByRole('button', { name: /^Downloading\s*0$/ }).click()
  await expect(manager.getByText('Install Queue', { exact: true })).toBeVisible()
  const rows = manager.locator('.job-row')
  await expect(rows).toHaveCount(completed ? 2 : 1)
  for (const status of completed ? ['failed', 'completed'] : ['failed']) {
    const row = rows.filter({ has: page.getByText(status, { exact: true }) })
    await expect(row).toHaveCount(1)
    await expect(row.getByText(oldJob.modelName, { exact: true })).toBeVisible()
    await expect(row.getByText(oldJob.versionName, { exact: true })).toBeVisible()
    if (status === 'failed') {
      await expect(row.getByText(interrupted.message, { exact: true })).toBeVisible()
    }
    await expect(row.getByRole('button', { name: 'Cancel', exact: true })).toHaveCount(0)
  }
}

function assertOnlyInstallationAdded(baseline, observed, jobId) {
  const expected = structuredClone(baseline)
  const additions = {
    model_install_job: (row) => row.id === jobId,
    model_install_artifact: (row) => row.job_id === jobId,
    model_resource: () => true,
    model_resource_version: () => true,
    local_model_file: () => true,
  }
  for (const [table, isAddition] of Object.entries(additions)) {
    const rows = observed.tables[table].rows
    assert.equal(rows.filter(isAddition).length, 1, table)
    assert.deepEqual(
      rows.filter((row) => !isAddition(row)),
      baseline.tables[table].rows,
      table,
    )
    expected.tables[table].rows = rows
  }
  assert.deepEqual(observed, expected)
}

export async function runPackagedModelInstallRetry({
  root,
  appData,
  ownedRunRoot,
  packageBefore,
  identity,
  launch,
  liveToken,
  closeNormally,
}) {
  const proof = JSON.parse(
    await readFile(path.join(path.dirname(root), 'package-proof.json'), 'utf8'),
  )
  assert.equal(proof.schemaVersion, 1)
  await assertOfflineProjectDesktop({
    scenario,
    suite: 'packaged-model-install-retry',
    root,
    ownedRunRoot,
    packageBefore,
    expectedPackage: proof.package,
  })
  assert.equal(await realpath(root), root)
  assert.equal(appData, path.join(root, 'data/imagegen-studio'))
  assert.equal(await realpath(path.dirname(appData)), path.dirname(appData))
  const { database, source, baseline: before } = await seedProfile(appData, ownedRunRoot, identity)
  const seed = await retainClosed(database, path.join(root, 'before-review.sqlite'), identity)
  const tokenPath = path.join(appData, 'secrets/civitai-token.bin')
  const staging = path.join(appData, 'models/.staging')
  const run = await launch('first')
  const page = run.page
  const baseline = { sql: inspectSqlite(appData), jobs: [oldJob], checkpoints: [] }
  const assertUnchangedReview = async () => {
    assert.deepEqual(inspectSqlite(appData), baseline.sql)
    assert.deepEqual(snapshotDatabase(database), before)
    assert.deepEqual(await modelApi(page, 'getInstallJobs'), baseline.jobs)
    assert.deepEqual(await modelApi(page, 'getCatalog'), [])
    assert.deepEqual(await modelApi(page, 'getStorageSummary'), { totalBytes: 0 })
    assert.deepEqual(await readdir(staging), [])
  }
  await assertUnchangedReview()
  assert.equal((await modelApi(page, 'getTokenStatus')).kind, 'missing')
  await assert.rejects(lstat(tokenPath), { code: 'ENOENT' })
  const timelinePath = path.join(root, 'model-install-progress.ndjson')
  await writeFile(timelinePath, '', { flag: 'wx', mode: 0o600 })
  const record = (event) => writeFile(timelinePath, `${JSON.stringify(event)}\n`, { flag: 'a' })
  let reviewed
  let installation
  let confirmationIssued = false
  try {
    await connectToken(page, liveToken)
    const tokenFile = await lstat(tokenPath)
    assert.ok(tokenFile.isFile() && tokenFile.size > 0 && (tokenFile.mode & 0o777) === 0o600)
    const firstReview = await reviewLiveVaeInstall(page)
    const { manager } = firstReview
    for (const [field, expected] of Object.entries(model)) {
      assert.equal(firstReview.artifactIdentity[field], expected, field)
    }
    await firstReview.dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(firstReview.dialog).toBeHidden()
    await assertUnchangedReview()
    await showQueue(page, manager, false)
    await page.screenshot({
      path: path.join(root, 'after-cancel-queue.png'),
      animations: 'disabled',
    })
    await manager.getByRole('button', { name: 'Back to models', exact: true }).click()
    reviewed = await reviewLiveVaeInstall(page, manager)
    assert.deepEqual(reviewed.artifactIdentity, firstReview.artifactIdentity)
    assert.equal(reviewed.fileName, firstReview.fileName)
    assert.equal(reviewed.modelName, oldJob.modelName)
    assert.equal(reviewed.versionName, oldJob.versionName)
    await assertUnchangedReview()
    await record({ status: 'reviewed', canceledReviewPreserved: true, fileId: model.fileId })
    const startedAt = Date.now()
    confirmationIssued = true
    await reviewed.confirm.click()
    installation = await waitForTerminal(page, reviewed, startedAt, 210_000, record, baseline.jobs)
    assert.notEqual(installation.id, oldJobId)
    await expect(reviewed.dialog).toBeHidden()
  } finally {
    if (!page.isClosed()) {
      try {
        if (confirmationIssued && !installation) {
          const freshJobs = (await modelApi(page, 'getInstallJobs')).filter(
            ({ id }) => id !== oldJobId,
          )
          assert.ok(freshJobs.length <= 1)
          const [job] = freshJobs
          if (job && active.has(job.status)) {
            assert.equal(job.modelName, reviewed.modelName)
            assert.equal(job.versionName, reviewed.versionName)
            const canceled = await modelApi(page, 'cancelInstall', job.id).catch(() => null)
            await record({
              status: 'timeout-settlement',
              jobId: job.id,
              outcome: canceled?.status ?? 'unknown',
            })
          }
        }
      } finally {
        assert.equal((await modelApi(page, 'removeToken')).kind, 'missing')
        await assert.rejects(lstat(tokenPath), { code: 'ENOENT' })
      }
    }
  }

  const artifactIdentity = reviewed.artifactIdentity
  const installed = await assertCompletedSql(
    appData,
    artifactIdentity,
    installation.id,
    baseline.sql,
  )
  const published = await hashInstalledFile(installed.managedPath, artifactIdentity)
  const catalog = await assertInstalledCatalog(
    page,
    installed,
    artifactIdentity,
    reviewed,
    installation.id,
    baseline,
  )
  await showQueue(page, reviewed.manager, true)
  await page.screenshot({
    path: path.join(root, 'first-install-queue.png'),
    animations: 'disabled',
  })
  await reviewed.manager.getByRole('button', { name: 'Close Model Manager', exact: true }).click()
  await closeNormally(run)
  assert.ok(run.normalPhysicalExit && !run.forcedCleanup)
  const firstDb = path.join(root, 'after-install.sqlite')
  const saved = await retainClosed(database, firstDb, identity)
  assertOnlyInstallationAdded(before, snapshotDatabase(firstDb, { closed: true }), installation.id)

  const reopened = await launch('restarted')
  assert.equal((await modelApi(reopened.page, 'getTokenStatus')).kind, 'missing')
  await assert.rejects(lstat(tokenPath), { code: 'ENOENT' })
  const reopenedInstall = await assertCompletedSql(
    appData,
    artifactIdentity,
    installation.id,
    baseline.sql,
  )
  assert.deepEqual(reopenedInstall, installed)
  assert.deepEqual(
    await assertInstalledCatalog(
      reopened.page,
      reopenedInstall,
      artifactIdentity,
      reviewed,
      installation.id,
      baseline,
    ),
    catalog,
  )
  const manager = await openManager(reopened.page)
  await showQueue(reopened.page, manager, true)
  await reopened.page.screenshot({
    path: path.join(root, 'reopened-install-queue.png'),
    animations: 'disabled',
  })
  await manager.getByRole('button', { name: 'Back to models', exact: true }).click()
  const resource = manager.locator('.resource-row')
  await expect(resource).toHaveCount(1)
  await expect(resource.getByText(reviewed.modelName, { exact: true })).toBeVisible()
  await expect(resource.getByText('Installed', { exact: true })).toBeVisible()
  await reopened.page.screenshot({
    path: path.join(root, 'reopened-catalog.png'),
    animations: 'disabled',
  })
  await manager.getByRole('button', { name: 'Close Model Manager', exact: true }).click()
  await closeNormally(reopened)
  assert.ok(reopened.normalPhysicalExit && !reopened.forcedCleanup)
  const secondDb = path.join(root, 'after-repeat.sqlite')
  const restarted = await retainClosed(database, secondDb, identity)
  assert.deepEqual(restarted.databaseFiles[0], { ...saved.databaseFiles[0], path: secondDb })
  assert.deepEqual(await hashInstalledFile(installed.managedPath, artifactIdentity), published)
  await assertClosed(source.path)
  assert.deepEqual(await identity(source.path), source)

  return {
    saved,
    restarted,
    offlineProjectResult: {
      source,
      seed,
      preservedFailedJob: oldJob,
      preservedFailedArtifactId: oldArtifactId,
      artifactIdentity,
      installation,
      published,
      catalog,
      canceledReviewPreserved: true,
    },
  }
}
