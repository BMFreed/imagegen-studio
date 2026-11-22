/** Real CivitAI download and Main-death recovery in an owned stock AppImage profile. */
import assert from 'node:assert/strict'
import { constants } from 'node:fs'
import {
  copyFile,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

import { expect } from '@playwright/test'

import { snapshotDatabase } from './application-state-upgrade-fixture.mjs'
import { assertOfflineProjectDesktop } from './packaged-noobai-import-chooser.mjs'
import { connectToken, inspectSqlite, reviewLiveVaeInstall } from './packaged-noobai-install-ui.mjs'

const scenario = 'model-install-interruption'
const artifact = {
  modelId: 1219546,
  versionId: 1594319,
  fileId: 1494323,
  sizeBytes: 334_640_988,
  sha256: 'fc7d6b12b37b12759e30b1109068a4bb2a0a84e79ab01262cc5af6b89a783ec6',
}
const interrupted = {
  code: 'interrupted',
  message: 'Installation was interrupted when the application closed.',
}
const active = new Set(['waiting', 'downloading', 'verifying'])
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const partName = new RegExp(`^${uuid.source.slice(1, -1)}\\.part$`)
const jobTable = 'model_install_job'
const artifactTable = 'model_install_artifact'

async function modelCall(page, method, ...args) {
  const result = await page.evaluate(({ method, args }) => window.api.models[method](...args), {
    method,
    args,
  })
  assert.equal(result.ok, true, `Packaged model IPC failed: ${method}.`)
  return result.value
}

async function onlyJob(page, reviewed) {
  const jobs = await modelCall(page, 'getInstallJobs')
  assert.ok(jobs.length <= 1, 'Only the exact reviewed job may be admitted.')
  const [job] = jobs
  if (job) {
    assert.match(job.id, uuid)
    assert.equal(job.modelName, reviewed.modelName)
    assert.equal(job.versionName, reviewed.versionName)
  }
  return job
}

async function waitForAdmission(page, reviewed) {
  const deadline = Date.now() + 50_000
  while (Date.now() < deadline) {
    const job = await onlyJob(page, reviewed)
    if (job) {
      assert.ok(active.has(job.status), 'The download settled before Main-death admission.')
      return job
    }
    await delay(25)
  }
  assert.fail('The real CivitAI request did not admit its exact job before the deadline.')
}

async function ownedPart(staging) {
  assert.equal(await realpath(staging), staging)
  const names = await readdir(staging)
  if (names.length === 0) return null
  assert.equal(names.length, 1)
  assert.match(names[0], partName)
  const filename = path.join(staging, names[0])
  const entry = await lstat(filename, { bigint: true })
  assert.ok(entry.isFile() && entry.uid === BigInt(process.getuid()) && entry.nlink === 1n)
  assert.equal(await realpath(filename), filename)
  assert.ok(entry.size < BigInt(artifact.sizeBytes), 'The cut requires an incomplete part.')
  return {
    filename,
    device: String(entry.dev),
    inode: String(entry.ino),
    sizeBytes: Number(entry.size),
  }
}

async function waitForPartialDownload(page, reviewed, admitted, staging) {
  const deadline = Date.now() + 50_000
  while (Date.now() < deadline) {
    const job = await onlyJob(page, reviewed)
    assert.equal(job?.id, admitted.id)
    assert.ok(active.has(job.status), 'The download settled without the required partial witness.')
    const part = await ownedPart(staging)
    if (job.status === 'downloading' && job.bytesDownloaded > 0 && part?.sizeBytes > 0) {
      return part
    }
    await delay(25)
  }
  assert.fail('The real body did not produce positive partial bytes and a durable downloading row.')
}

function assertUnpublished(sql) {
  assert.equal(sql.integrity, 'ok')
  assert.deepEqual(sql.foreignKeys, [])
  assert.deepEqual(
    [sql.resourceCount, sql.versionCount, sql.fileCount, sql.dependencyCount],
    [0, 0, 0, 0],
  )
  assert.deepEqual(sql.catalog, [])
}

function assertLiveRow(sql, id, part) {
  assertUnpublished(sql)
  const [job, ...otherJobs] = sql.jobs
  assert.deepEqual(otherJobs, [])
  assert.deepEqual(job, {
    id,
    modelId: artifact.modelId,
    versionId: artifact.versionId,
    fileId: artifact.fileId,
    status: 'downloading',
    bytesDownloaded: job?.bytesDownloaded,
    totalBytes: artifact.sizeBytes,
    errorCode: null,
  })
  assert.ok(job.bytesDownloaded > 0 && job.bytesDownloaded <= part.sizeBytes)
  assert.deepEqual(sql.artifacts, [
    {
      jobId: id,
      role: 'primary',
      sourceKind: 'civitai_file',
      expectedSha256: artifact.sha256,
      downloadedBytes: 0,
      status: 'downloading',
      tempPath: null,
      errorCode: null,
    },
  ])
  return job
}

async function retainCrashStore(database, root, appData, identity, liveToken) {
  const retainedDatabase = path.join(root, 'after-crash.sqlite')
  const cloneDirectory = path.join(appData, 'crash-sqlite-readback')
  await mkdir(cloneDirectory, { mode: 0o700 })
  const clone = path.join(cloneDirectory, 'app.sqlite')
  const pins = []
  for (const suffix of ['', '-wal', '-shm']) {
    const file = database + suffix
    const stat = await lstat(file)
    assert.ok(stat.isFile() && stat.uid === process.getuid() && stat.nlink === 1)
    assert.equal(await realpath(file), file)
    assert.ok(stat.size > 0 && stat.size <= 16 * 1024 * 1024)
    assert.ok(!(await readFile(file)).includes(liveToken), 'Do not retain raw credential bytes.')
    const before = await identity(file)
    await copyFile(file, retainedDatabase + suffix, constants.COPYFILE_EXCL)
    const retained = await identity(retainedDatabase + suffix)
    assert.deepEqual(retained, { ...before, path: retainedDatabase + suffix })
    await copyFile(retainedDatabase + suffix, clone + suffix, constants.COPYFILE_EXCL)
    assert.deepEqual(await identity(file), before)
    pins.push(retained)
  }
  // The SQLite reader may update SHM. It sees only the disposable clone's companions.
  const snapshot = snapshotDatabase(clone)
  for (const pin of pins) assert.deepEqual(await identity(pin.path), pin)
  assert.equal(snapshot.integrityCheck, 'ok')
  assert.deepEqual(snapshot.foreignKeyCheck, [])
  return { snapshot, databaseFiles: pins }
}

async function retainPartPrefix(part, root, identity) {
  const limit = Math.min(64 * 1024, part.sizeBytes)
  const handle = await open(
    part.filename,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  )
  try {
    const stat = await handle.stat({ bigint: true })
    assert.equal(String(stat.dev), part.device)
    assert.equal(String(stat.ino), part.inode)
    assert.equal(Number(stat.size), part.sizeBytes)
    assert.ok(stat.isFile() && stat.uid === BigInt(process.getuid()) && stat.nlink === 1n)
    const prefix = Buffer.alloc(limit)
    assert.equal((await handle.read(prefix, 0, prefix.length, 0)).bytesRead, prefix.length)
    const filename = path.join(root, 'after-crash.part-prefix.bin')
    await writeFile(filename, prefix, { flag: 'wx', mode: 0o600 })
    return await identity(filename)
  } finally {
    await handle.close()
  }
}

async function retainClosed(database, filename, identity) {
  for (const suffix of ['-wal', '-shm', '-journal']) {
    await assert.rejects(lstat(database + suffix), { code: 'ENOENT' })
  }
  await copyFile(database, filename, constants.COPYFILE_EXCL)
  const pin = await identity(filename)
  assert.deepEqual(await identity(database), { ...pin, path: database })
  return { databaseFiles: [pin] }
}

function assertRecoveryDelta(crashSnapshot, snapshot) {
  const expected = structuredClone(crashSnapshot)
  const [job, ...jobs] = expected.tables[jobTable].rows
  const [input, ...artifacts] = expected.tables[artifactTable].rows
  assert.deepEqual(jobs, [])
  assert.deepEqual(artifacts, [])
  const [recovered] = snapshot.tables[jobTable].rows
  assert.ok(Date.parse(recovered?.updated_at) > Date.parse(job.updated_at))
  Object.assign(job, {
    status: 'failed',
    updated_at: recovered.updated_at,
    error_code: interrupted.code,
    error_message: interrupted.message,
  })
  Object.assign(input, {
    status: job.status,
    error_code: interrupted.code,
    error_message: interrupted.message,
  })
  assert.deepEqual(snapshot, expected)
}

async function inspectRecovered({ page }, reviewed, job, root, name) {
  assert.deepEqual(await modelCall(page, 'getCatalog'), [])
  assert.deepEqual(await modelCall(page, 'getStorageSummary'), { totalBytes: 0 })
  assert.equal((await modelCall(page, 'getTokenStatus')).kind, 'missing')
  assert.deepEqual(await onlyJob(page, reviewed), {
    id: job.id,
    modelName: reviewed.modelName,
    versionName: reviewed.versionName,
    status: 'failed',
    error: interrupted,
    bytesDownloaded: job.bytesDownloaded,
    totalBytes: job.totalBytes,
  })
  await page
    .getByRole('region', { name: 'Home', exact: true })
    .getByRole('complementary', { name: 'Workspace navigation', exact: true })
    .getByRole('button', { name: 'Manage Models', exact: true })
    .click()
  const manager = page.getByRole('dialog', { name: 'Model Manager', exact: true })
  await expect(manager).toBeVisible()
  await manager.getByRole('button', { name: /^Downloading\s*0$/ }).click()
  await expect(manager.getByText('Install Queue', { exact: true })).toBeVisible()
  const row = manager.locator('.job-row')
  await expect(row).toHaveCount(1)
  await expect(row.getByText(reviewed.modelName, { exact: true })).toBeVisible()
  await expect(row.getByText(reviewed.versionName, { exact: true })).toBeVisible()
  await expect(row.getByText('failed', { exact: true })).toBeVisible()
  await expect(row.getByText(interrupted.message, { exact: true })).toBeVisible()
  await expect(row.getByRole('button', { name: 'Cancel', exact: true })).toHaveCount(0)
  await page.screenshot({ path: path.join(root, `${name}-queue.png`) })
  await manager.getByRole('button', { name: 'Back to models', exact: true }).click()
  await expect(manager.getByText('No models installed yet', { exact: true })).toBeVisible()
  await manager.getByRole('button', { name: 'Close Model Manager', exact: true }).click()
  await expect(manager).toBeHidden()
}

export async function runPackagedModelInstallInterruption({
  root,
  appData,
  ownedRunRoot,
  packageBefore,
  identity,
  launch,
  liveToken,
  closeNormally,
  crashForRecovery,
}) {
  const proof = JSON.parse(
    await readFile(path.join(path.dirname(root), 'package-proof.json'), 'utf8'),
  )
  assert.equal(proof.schemaVersion, 1)
  await assertOfflineProjectDesktop({
    scenario,
    suite: 'packaged-model-install-interruption',
    root,
    ownedRunRoot,
    packageBefore,
    expectedPackage: proof.package,
  })
  assert.equal(await realpath(root), root)
  assert.equal(appData, path.join(root, 'data/imagegen-studio'))
  const database = path.join(appData, 'database/app.sqlite')
  const modelRoot = path.join(appData, 'models')
  const staging = path.join(modelRoot, '.staging')
  const tokenPath = path.join(appData, 'secrets/civitai-token.bin')
  const assertNoCredential = () => assert.rejects(lstat(tokenPath), { code: 'ENOENT' })
  const first = await launch('first')
  const { page } = first
  await assertNoCredential()
  assert.deepEqual(await modelCall(page, 'getInstallJobs'), [])
  assert.deepEqual(await modelCall(page, 'getCatalog'), [])
  assert.deepEqual(await readdir(staging), [])
  const baseline = snapshotDatabase(database)
  assert.equal(baseline.schemaMigrations.length, 30)
  let reviewed
  let admitted
  let beforeCut
  let crash
  try {
    await connectToken(page, liveToken)
    reviewed = await reviewLiveVaeInstall(page)
    for (const [field, expected] of Object.entries(artifact)) {
      assert.equal(reviewed.artifactIdentity[field], expected)
    }
    await reviewed.confirm.click()
    admitted = await waitForAdmission(page, reviewed)
    // Main captures the token on admission. Remove its persisted copy before the deliberate fault.
    assert.equal((await modelCall(page, 'removeToken')).kind, 'missing')
    await assertNoCredential()
    const observed = await waitForPartialDownload(page, reviewed, admitted, staging)
    crash = await crashForRecovery(first, async () => {
      const sql = inspectSqlite(appData)
      const part = await ownedPart(staging)
      assert.ok(part && part.sizeBytes >= observed.sizeBytes)
      assert.equal(part.filename, observed.filename)
      assert.equal(part.device, observed.device)
      assert.equal(part.inode, observed.inode)
      const job = assertLiveRow(sql, admitted.id, part)
      beforeCut = { job, part }
    })
  } finally {
    if (!crash && !page.isClosed()) {
      try {
        if (reviewed) {
          const current = await onlyJob(page, reviewed)
          if (current && active.has(current.status)) {
            await modelCall(page, 'cancelInstall', current.id)
          }
        }
      } finally {
        assert.equal((await modelCall(page, 'removeToken')).kind, 'missing')
        await assertNoCredential()
      }
    }
  }
  assert.ok(first.crashPhysicalExit && !first.normalPhysicalExit && !first.forcedCleanup)
  assert.ok(crash.scopeExit.confirmed && crash.intent.mainOnly)
  await assertNoCredential()
  const part = await ownedPart(staging)
  assert.ok(part && part.sizeBytes >= beforeCut.part.sizeBytes)
  assert.equal(part.filename, beforeCut.part.filename)
  assert.equal(part.device, beforeCut.part.device)
  assert.equal(part.inode, beforeCut.part.inode)
  assert.deepEqual(await readdir(modelRoot), ['.staging'])
  const prefix = await retainPartPrefix(part, root, identity)
  const crashStore = await retainCrashStore(database, root, appData, identity, liveToken)
  const [retainedJob, ...jobs] = crashStore.snapshot.tables[jobTable].rows
  const [retainedInput, ...inputs] = crashStore.snapshot.tables[artifactTable].rows
  assert.deepEqual(jobs, [])
  assert.deepEqual(inputs, [])
  assert.deepEqual(
    [
      retainedJob.id,
      retainedJob.civitai_model_id,
      retainedJob.civitai_model_version_id,
      retainedJob.civitai_file_id,
      retainedJob.status,
      retainedJob.error_code,
    ],
    [admitted.id, artifact.modelId, artifact.versionId, artifact.fileId, 'downloading', null],
  )
  assert.ok(
    retainedJob.bytes_downloaded >= beforeCut.job.bytesDownloaded &&
      retainedJob.bytes_downloaded <= part.sizeBytes,
  )
  assert.equal(retainedJob.total_bytes, artifact.sizeBytes)
  assert.deepEqual(
    [
      retainedInput.job_id,
      retainedInput.role,
      retainedInput.source_kind,
      retainedInput.status,
      retainedInput.expected_sha256,
      retainedInput.downloaded_bytes,
      retainedInput.temp_path,
      retainedInput.error_code,
    ],
    [admitted.id, 'primary', 'civitai_file', 'downloading', artifact.sha256, 0, null, null],
  )
  const expectedCrash = structuredClone(baseline)
  expectedCrash.tables[jobTable].rows = [retainedJob]
  expectedCrash.tables[artifactTable].rows = [retainedInput]
  assert.deepEqual(crashStore.snapshot, expectedCrash)

  const recoveredJob = {
    id: retainedJob.id,
    bytesDownloaded: retainedJob.bytes_downloaded,
    totalBytes: retainedJob.total_bytes,
  }
  const assertRemoved = async () => {
    assert.deepEqual(await readdir(modelRoot), ['.staging'])
    assert.deepEqual(await readdir(staging), [])
    await assert.rejects(lstat(part.filename), { code: 'ENOENT' })
    await assertNoCredential()
  }
  const recovered = await launch('recovered')
  await assertRemoved()
  await inspectRecovered(recovered, reviewed, recoveredJob, root, 'recovered')
  await closeNormally(recovered)
  const recoveredDb = path.join(root, 'after-recovery.sqlite')
  const saved = await retainClosed(database, recoveredDb, identity)
  assertRecoveryDelta(crashStore.snapshot, snapshotDatabase(recoveredDb, { closed: true }))

  const next = await launch('restarted')
  await assertRemoved()
  await inspectRecovered(next, reviewed, recoveredJob, root, 'restarted')
  await closeNormally(next)
  await assertRemoved()
  const restartedDb = path.join(root, 'after-repeat.sqlite')
  const restarted = await retainClosed(database, restartedDb, identity)
  assert.deepEqual(restarted.databaseFiles[0], {
    ...saved.databaseFiles[0],
    path: restartedDb,
  })
  return {
    saved,
    restarted,
    offlineProjectResult: {
      artifact,
      job: recoveredJob,
      beforeCut,
      afterCrash: { part, prefix, databaseFiles: crashStore.databaseFiles },
      recovery: { failure: interrupted, exactPartRemoved: true, repeatDatabaseIdentical: true },
    },
  }
}
