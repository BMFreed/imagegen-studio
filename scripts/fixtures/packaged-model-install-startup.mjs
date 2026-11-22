/** Stock AppImage startup from a prepared set of persisted install states. */
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { copyFile, lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect } from '@playwright/test'

import { openAppDatabase } from '../../src/main/db/database.ts'
import { ModelRepository } from '../../src/main/models/model-repository.ts'
import { ProjectIndexRepository } from '../../src/main/projects/project-index.ts'
import { snapshotDatabase } from './application-state-upgrade-fixture.mjs'
import { assertOfflineProjectDesktop } from './packaged-noobai-import-chooser.mjs'

const scenario = 'model-install-startup'
const migrations = fileURLToPath(new URL('../../src/main/db/migrations/', import.meta.url))
const interrupted = {
  code: 'interrupted',
  message: 'Installation was interrupted when the application closed.',
}
const canceled = {
  code: 'download_canceled',
  message: 'The download was canceled.',
}
const embedding = {
  modelId: 2360940,
  versionId: 2655289,
  fileId: 2542976,
  displayName: 'IllustriousPhoto Embedding',
  versionName: 'WAI v15 1152steps',
  filename: 'illustriousphoto.safetensors',
  sizeBytes: 49736,
  sha256: '91a95b244b8ba01d905d32ced7e3cc20eb74b4da8f519de3764505500d386c36',
}
const jobsTable = 'model_install_job'
const artifactsTable = 'model_install_artifact'
const terminalJobs = new Set(['completed', 'canceled'])
const activeArtifacts = new Set(['waiting', 'downloading', 'verifying'])
const hash = (body) => createHash('sha256').update(body).digest('hex')

async function witness(filename, identity) {
  const entry = await lstat(filename, { bigint: true })
  assert.ok(entry.isFile() && !entry.isSymbolicLink())
  assert.equal(await realpath(filename), filename)
  assert.equal(entry.uid, BigInt(process.getuid()))
  assert.equal(entry.nlink, 1n)
  return { ...(await identity(filename)), device: String(entry.dev), inode: String(entry.ino) }
}

async function retainDatabase({ database, root, identity }, name) {
  for (const suffix of ['-wal', '-shm', '-journal']) {
    await assert.rejects(lstat(database + suffix), { code: 'ENOENT' })
  }
  assert.equal(await realpath(database), database)
  const archived = path.join(root, `${name}.sqlite`)
  await copyFile(database, archived, constants.COPYFILE_EXCL)
  const pin = await identity(archived)
  assert.deepEqual(await identity(database), { ...pin, path: database })
  const snapshot = snapshotDatabase(archived, { closed: true })
  assert.equal(snapshot.integrityCheck, 'ok')
  assert.deepEqual(snapshot.foreignKeyCheck, [])
  return { store: { databaseFiles: [pin] }, snapshot }
}

async function prepareFiles({ root, appData, original, identity }) {
  const modelRoot = path.join(appData, 'models')
  const staging = path.join(modelRoot, '.staging')
  const downloadedBody = Buffer.from('Incomplete download bytes')
  const verifiedBody = Buffer.from('Unpublished verified candidate bytes')
  const sha = hash(verifiedBody)
  const prefix = sha.slice(0, 2)
  const bucket = path.join(modelRoot, prefix)
  const oldBucket = path.join(modelRoot, embedding.sha256.slice(0, 2))
  const stagedDownload = path.join(staging, `${randomUUID()}.part`)
  const stagedVerified = path.join(staging, `${randomUUID()}.part`)
  const managedOrphan = path.join(bucket, `${sha}.safetensors`)
  const repairOrphan = path.join(bucket, `${sha}-repair-${randomUUID()}.safetensors`)
  const installedPath = path.join(oldBucket, `${embedding.sha256}.safetensors`)
  for (const directory of [staging, bucket, oldBucket, path.join(modelRoot, 'zz')]) {
    await mkdir(directory, { recursive: true, mode: 0o700 })
    assert.equal(await realpath(directory), directory)
  }
  await copyFile(original.path, installedPath, constants.COPYFILE_EXCL)
  const installed = await witness(installedPath, identity)
  assert.equal(installed.sha256, embedding.sha256)
  assert.notDeepEqual([installed.device, installed.inode], [original.device, original.inode])
  const removed = [
    [stagedDownload, downloadedBody],
    [stagedVerified, verifiedBody],
    [managedOrphan, verifiedBody],
    [repairOrphan, verifiedBody],
  ]
  const kept = [
    [path.join(staging, 'notes.part'), Buffer.from('Non-owned staging filename')],
    [path.join(bucket, 'notes.safetensors'), Buffer.from('Non-owned managed filename')],
    [path.join(modelRoot, 'zz', `${sha}.safetensors`), verifiedBody],
    [path.join(root, `${sha}.safetensors`), verifiedBody],
  ]
  for (const [filename, body] of [...removed, ...kept]) {
    await writeFile(filename, body, { flag: 'wx', mode: 0o600 })
  }
  const beforeRemoval = await Promise.all(removed.map(([file]) => witness(file, identity)))
  const preserved = await Promise.all(kept.map(([file]) => witness(file, identity)))
  return { modelRoot, staging, installed, beforeRemoval, preserved, stagedDownload, stagedVerified }
}

function createJob(repository, fixture) {
  return repository.createInstallJob({
    baseModelFamily: 'illustrious',
    resourceType: fixture.resourceType,
    civitaiModelId: fixture.modelId,
    civitaiVersionId: fixture.versionId,
    civitaiFileId: fixture.fileId,
    displayName: fixture.displayName,
    versionName: fixture.versionName,
    artifacts: [
      {
        role: 'primary',
        source: { kind: 'civitai_file', fileId: fixture.fileId },
        expectedSha256: fixture.sha256,
        expectedSizeBytes: fixture.sizeBytes,
      },
    ],
  })
}

async function prepareStore({ appData, files }) {
  const database = openAppDatabase(appData, migrations)
  try {
    await new ProjectIndexRepository(database.db).ensureDefaultWorkspace(appData)
    const repository = new ModelRepository(database.db)
    const specs = [
      ['waiting', 'waiting', 'Admission waiting', null],
      ['downloading', 'downloading', 'Body partially transferred', files.stagedDownload],
      ['downloading', 'verifying', 'Staged body under verification', files.stagedVerified],
      ['verifying', 'ready', 'Managed body before publication', null],
      ['canceled', 'canceled', 'Previously canceled install', null],
    ]
    const verified = files.beforeRemoval.find(({ path: file }) => file === files.stagedVerified)
    const partial = files.beforeRemoval.find(({ path: file }) => file === files.stagedDownload)
    const completed = await createJob(repository, { ...embedding, resourceType: 'embedding' })
    await repository.updateInstallJob(completed, {
      status: 'downloading',
      bytesDownloaded: embedding.sizeBytes,
    })
    await repository.updateInstallArtifact(completed, 'primary', {
      status: 'ready',
      downloadedBytes: embedding.sizeBytes,
    })
    await repository.updateInstallJob(completed, { status: 'verifying' })
    const installed = await repository.publishVerifiedInstallation({
      jobId: completed,
      primary: {
        resource: {
          source: { kind: 'civitai', modelId: embedding.modelId },
          displayName: embedding.displayName,
          sourceMetadata: {},
          type: 'embedding',
        },
        version: {
          name: embedding.versionName,
          format: 'safetensors',
          baseModelFamily: 'illustrious',
          source: {
            kind: 'civitai',
            versionId: embedding.versionId,
            fileId: embedding.fileId,
            expectedSha256: embedding.sha256,
          },
          sourceMetadata: { baseModel: 'NoobAI' },
        },
        file: {
          managedPath: files.installed.path,
          originalFilename: embedding.filename,
          sha256: embedding.sha256,
          sizeBytes: embedding.sizeBytes,
          verifiedAt: new Date().toISOString(),
        },
      },
    })
    const matrix = [{ id: completed, job: 'completed', artifact: 'ready' }]
    for (const [offset, [job, artifact, displayName, stagingPath]] of specs.entries()) {
      const id = await createJob(repository, {
        resourceType: 'lora',
        modelId: 8_100_001 + offset,
        versionId: 8_200_001 + offset,
        fileId: 8_300_001 + offset,
        displayName,
        versionName: 'Fixture version',
        sha256: verified.sha256,
        sizeBytes: verified.sizeBytes,
      })
      if (job === 'canceled') {
        await repository.updateInstallArtifact(id, 'primary', { status: 'canceled' })
        await repository.updateInstallJob(id, {
          status: 'canceled',
          errorCode: canceled.code,
          errorMessage: canceled.message,
        })
      } else if (job !== 'waiting') {
        const bytes = artifact === 'downloading' ? partial.sizeBytes : verified.sizeBytes
        await repository.updateInstallJob(id, { status: 'downloading', bytesDownloaded: bytes })
        if (artifact === 'verifying') {
          await repository.updateInstallArtifact(id, 'primary', { status: 'downloading' })
        }
        await repository.updateInstallArtifact(id, 'primary', {
          status: artifact,
          downloadedBytes: artifact === 'downloading' ? 0 : bytes,
          tempPath: artifact === 'verifying' ? stagingPath : null,
        })
        if (job === 'verifying') await repository.updateInstallJob(id, { status: 'verifying' })
      }
      matrix.push({ id, job, artifact })
    }
    const jobs = await repository.listInstallJobs()
    assert.equal(jobs.length, matrix.length)
    for (const fixture of matrix) {
      const actual = jobs.find(({ id }) => id === fixture.id)
      assert.equal(actual.status, fixture.job)
      assert.deepEqual(
        actual.artifacts.map(({ status }) => status),
        [fixture.artifact],
      )
    }
    return { installed, matrix, jobs, database: database.filePath }
  } finally {
    await database.close()
  }
}

const expectedJobs = (jobs) =>
  jobs
    .map((job) => ({
      id: job.id,
      status: terminalJobs.has(job.status) ? job.status : 'failed',
      error:
        job.errorCode && job.errorMessage
          ? { code: job.errorCode, message: job.errorMessage }
          : job.status === 'completed'
            ? null
            : interrupted,
      modelName: job.displayName,
      versionName: job.versionName,
      bytesDownloaded: job.bytesDownloaded,
      totalBytes: job.totalBytes,
    }))
    .sort((a, b) => a.id.localeCompare(b.id))

async function inspectRenderer(page, expected, installed, root, slug) {
  const state = await page.evaluate(async () => ({
    jobs: await globalThis.api.models.getInstallJobs(),
    catalog: await globalThis.api.models.getCatalog(),
    storage: await globalThis.api.models.getStorageSummary(),
    token: await globalThis.api.models.getTokenStatus(),
    runtime: await globalThis.api.runtime.getStatus(),
  }))
  assert.ok(
    state.jobs.ok && state.catalog.ok && state.storage.ok && state.token.ok && state.runtime.ok,
  )
  assert.deepEqual(
    state.jobs.value.sort((a, b) => a.id.localeCompare(b.id)),
    expected,
  )
  assert.equal(state.storage.value.totalBytes, embedding.sizeBytes)
  assert.equal(state.token.value.kind, 'missing')
  assert.equal(state.runtime.value.kind, 'not-installed')
  assert.equal(state.catalog.value.length, 1)
  const [entry] = state.catalog.value
  assert.equal(entry.id, installed.resourceId)
  assert.equal(entry.defaultVersionId, installed.versionId)
  assert.equal(entry.modelId, embedding.modelId)
  assert.equal(entry.name, embedding.displayName)
  assert.equal(entry.resourceType, 'embedding')
  assert.equal(entry.versions.length, 1)
  const [version] = entry.versions
  assert.equal(version.id, installed.versionId)
  assert.equal(version.civitaiVersionId, embedding.versionId)
  assert.equal(version.civitaiFileId, embedding.fileId)
  assert.equal(version.fileSizeBytes, embedding.sizeBytes)
  assert.equal(version.sha256, embedding.sha256)
  assert.equal(version.fileStatus, 'ready')

  await page
    .getByRole('region', { name: 'Home', exact: true })
    .getByRole('complementary', { name: 'Workspace navigation', exact: true })
    .getByRole('button', { name: 'Manage Models', exact: true })
    .click()
  const manager = page.getByRole('dialog', { name: 'Model Manager', exact: true })
  await expect(manager).toBeVisible()
  await manager.getByRole('button', { name: /^Downloading\s*0$/ }).click()
  await expect(manager.getByText('Install Queue', { exact: true })).toBeVisible()
  const rows = manager.locator('.job-row')
  await expect(rows).toHaveCount(expected.length)
  for (const job of expected) {
    const row = rows.filter({ has: page.getByText(job.modelName, { exact: true }) })
    await expect(row.getByText(job.status, { exact: true })).toBeVisible()
    await expect(row.getByText(job.versionName, { exact: true })).toBeVisible()
    if (job.error) await expect(row.getByText(job.error.message, { exact: true })).toBeVisible()
  }
  await expect(rows.getByRole('button', { name: 'Cancel', exact: true })).toHaveCount(0)
  await page.screenshot({ path: path.join(root, `${slug}-install-queue.png`) })

  await manager.getByRole('button', { name: 'Back to models', exact: true }).click()
  const resources = manager.locator('.resource-row')
  await expect(resources).toHaveCount(1)
  await resources.getByRole('button', { name: new RegExp(embedding.displayName) }).click()
  const versionRow = manager.locator('.version-row')
  await expect(versionRow).toHaveCount(1)
  await expect(versionRow.getByText(embedding.versionName, { exact: true })).toBeVisible()
  await expect(versionRow.getByText(/· ready$/)).toBeVisible()
  await expect(versionRow.getByText('Default', { exact: true })).toBeVisible()
  await page.screenshot({ path: path.join(root, `${slug}-installed-catalog.png`) })
  await manager.getByRole('button', { name: 'Close Model Manager', exact: true }).click()
  await expect(manager).toBeHidden()
  return state
}

function assertRecoveryDelta(before, after) {
  const expected = structuredClone(before)
  const recovered = new Set()
  const actualJobs = new Map(after.tables[jobsTable].rows.map((row) => [row.id, row]))
  for (const job of expected.tables[jobsTable].rows) {
    if (terminalJobs.has(job.status)) continue
    const updatedAt = actualJobs.get(job.id)?.updated_at
    assert.ok(Date.parse(updatedAt) > Date.parse(job.updated_at), job.id)
    Object.assign(job, {
      status: 'failed',
      error_code: interrupted.code,
      error_message: interrupted.message,
      updated_at: updatedAt,
    })
    recovered.add(job.id)
  }
  for (const artifact of expected.tables[artifactsTable].rows) {
    if (recovered.has(artifact.job_id) && activeArtifacts.has(artifact.status)) {
      Object.assign(artifact, {
        status: 'failed',
        error_code: interrupted.code,
        error_message: interrupted.message,
      })
    }
  }
  assert.deepEqual(after, expected)
}

async function assertRecoveryFiles({ files, original, identity, appData }) {
  for (const entry of files.beforeRemoval) {
    await assert.rejects(lstat(entry.path), { code: 'ENOENT' }, entry.path)
  }
  for (const entry of [files.installed, original, ...files.preserved]) {
    assert.deepEqual(await witness(entry.path, identity), entry)
  }
  assert.deepEqual(await readdir(files.staging), ['notes.part'])
  await assert.rejects(lstat(path.join(appData, 'secrets/civitai-token.bin')), { code: 'ENOENT' })
}

export async function runPackagedModelInstallStartup({
  root,
  appData,
  launch,
  closeNormally,
  identity,
  packageBefore,
  ownedRunRoot,
}) {
  const proof = JSON.parse(
    await readFile(path.join(path.dirname(root), 'package-proof.json'), 'utf8'),
  )
  assert.equal(proof.schemaVersion, 1)
  assert.ok(proof.package.path.startsWith(`${ownedRunRoot}${path.sep}`))
  await assertOfflineProjectDesktop({
    scenario,
    suite: 'packaged-model-install-startup',
    root,
    ownedRunRoot,
    packageBefore,
    expectedPackage: proof.package,
  })
  assert.equal(await realpath(root), root)
  assert.equal(appData, path.join(root, 'data/imagegen-studio'))
  await mkdir(appData, { mode: 0o700 })
  const original = await witness(
    path.join(
      ownedRunRoot,
      'packaged-noobai-component-repair/20261121-r3/repaired-illustriousphoto.safetensors',
    ),
    identity,
  )
  assert.equal(original.sha256, embedding.sha256)
  assert.equal(original.sizeBytes, embedding.sizeBytes)
  const files = await prepareFiles({ root, appData, original, identity })
  const { installed, jobs, matrix, database } = await prepareStore({ appData, files })
  const storeArgs = { root, database, identity }
  const before = await retainDatabase(storeArgs, 'before-startup')
  assert.equal(before.snapshot.schemaMigrations.length, 30)
  const expected = expectedJobs(jobs)
  await writeFile(
    path.join(root, 'prepared-install-states.json'),
    JSON.stringify({ matrix, installed, files, original, before: before.store }, null, 2) + '\n',
    { flag: 'wx', mode: 0o600 },
  )

  const first = await launch('model-install-recovery')
  const initial = await inspectRenderer(first.page, expected, installed, root, 'first')
  await assertRecoveryFiles({ files, original, identity, appData })
  assert.doesNotMatch(first.stderr, /Managed model storage is unavailable/)
  await closeNormally(first)
  const saved = await retainDatabase(storeArgs, 'after-startup')
  assertRecoveryDelta(before.snapshot, saved.snapshot)

  const second = await launch('model-install-recovery-restarted')
  const reopened = await inspectRenderer(second.page, expected, installed, root, 'second')
  assert.deepEqual(reopened, initial)
  await assertRecoveryFiles({ files, original, identity, appData })
  assert.doesNotMatch(second.stderr, /Managed model storage is unavailable/)
  await closeNormally(second)
  const restarted = await retainDatabase(storeArgs, 'after-second-startup')
  assert.deepEqual(restarted.snapshot, saved.snapshot)
  assert.deepEqual(restarted.store.databaseFiles[0], {
    ...saved.store.databaseFiles[0],
    path: restarted.store.databaseFiles[0].path,
  })

  return {
    saved: saved.store,
    restarted: restarted.store,
    offlineProjectResult: { matrix, installed, first: initial, second: reopened },
  }
}
