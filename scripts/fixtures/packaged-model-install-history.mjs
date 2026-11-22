/** Stock AppImage clears finished install history from a private SQLite profile. */
import assert from 'node:assert/strict'
import { constants } from 'node:fs'
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect } from '@playwright/test'

import { openAppDatabase } from '../../src/main/db/database.ts'
import { ModelRepository } from '../../src/main/models/model-repository.ts'
import { ProjectIndexRepository } from '../../src/main/projects/project-index.ts'
import { snapshotDatabase } from './application-state-upgrade-fixture.mjs'
import { assertOfflineProjectDesktop } from './packaged-noobai-import-chooser.mjs'
import { hashInstalledFile, modelApi, openManager } from './packaged-noobai-install-ui.mjs'

const scenario = 'model-install-history'
const migrations = fileURLToPath(new URL('../../src/main/db/migrations/', import.meta.url))
const embedding = {
  modelId: 2360940,
  versionId: 2655289,
  fileId: 2542976,
  modelName: 'IllustriousPhoto Embedding',
  versionName: 'WAI v15 1152steps',
  fileName: 'illustriousphoto.safetensors',
  sizeBytes: 49_736,
  sha256: '91a95b244b8ba01d905d32ced7e3cc20eb74b4da8f519de3764505500d386c36',
}
const terminalControls = [
  { status: 'failed', code: 'FIXTURE_PROVIDER_FAILURE', message: 'Fixture provider failure.' },
  { status: 'canceled', code: 'DOWNLOAD_CANCELED', message: 'The download was canceled.' },
]

async function seedDatabase(appData, managedPath) {
  const database = openAppDatabase(appData, migrations)
  try {
    await new ProjectIndexRepository(database.db).ensureDefaultWorkspace(appData)
    const repository = new ModelRepository(database.db)
    const create = (modelId, versionId, fileId, displayName, versionName) =>
      repository.createInstallJob({
        baseModelFamily: 'illustrious',
        civitaiModelId: modelId,
        civitaiVersionId: versionId,
        civitaiFileId: fileId,
        displayName,
        versionName,
        resourceType: 'embedding',
        artifacts: [
          {
            expectedSha256: embedding.sha256,
            expectedSizeBytes: embedding.sizeBytes,
            role: 'primary',
            source: { kind: 'civitai_file', fileId },
          },
        ],
      })

    const { modelId, versionId, fileId, modelName, versionName, fileName, sha256, sizeBytes } =
      embedding
    const completed = await create(modelId, versionId, fileId, modelName, versionName)
    await repository.updateInstallJob(completed, {
      status: 'downloading',
      bytesDownloaded: sizeBytes,
    })
    await repository.updateInstallArtifact(completed, 'primary', {
      status: 'ready',
      downloadedBytes: sizeBytes,
    })
    await repository.updateInstallJob(completed, { status: 'verifying' })
    const installed = await repository.publishVerifiedInstallation({
      jobId: completed,
      primary: {
        resource: {
          source: { kind: 'civitai', modelId },
          displayName: modelName,
          sourceMetadata: {},
          type: 'embedding',
        },
        version: {
          name: versionName,
          format: 'safetensors',
          baseModelFamily: 'illustrious',
          source: { kind: 'civitai', versionId, fileId, expectedSha256: sha256 },
          sourceMetadata: { baseModel: 'NoobAI' },
        },
        file: {
          managedPath,
          originalFilename: fileName,
          sha256,
          sizeBytes,
          verifiedAt: new Date().toISOString(),
        },
      },
    })
    const jobs = [
      {
        id: completed,
        status: 'completed',
        modelName,
        versionName,
        error: null,
        bytesDownloaded: sizeBytes,
        totalBytes: sizeBytes,
      },
    ]
    for (const [offset, { status, code, message }] of terminalControls.entries()) {
      const name = `Fixture ${status} installation`
      const version = 'Fixture version'
      const id = await create(
        8_100_001 + offset,
        8_200_001 + offset,
        8_300_001 + offset,
        name,
        version,
      )
      await repository.updateInstallJob(id, { status, errorCode: code, errorMessage: message })
      jobs.push({
        id,
        status,
        modelName: name,
        versionName: version,
        error: { code, message },
        bytesDownloaded: 0,
        totalBytes: sizeBytes,
      })
    }
    return {
      installed,
      jobs: jobs.sort((a, b) => a.id.localeCompare(b.id)),
      database: database.filePath,
    }
  } finally {
    await database.close()
  }
}

async function retainDatabase({ database, root, identity }, label) {
  for (const suffix of ['-wal', '-shm', '-journal']) {
    await assert.rejects(lstat(database + suffix), { code: 'ENOENT' })
  }
  assert.equal(await realpath(database), database)
  const archived = path.join(root, `${label}.sqlite`)
  await copyFile(database, archived, constants.COPYFILE_EXCL)
  const pin = await identity(archived)
  assert.deepEqual(await identity(database), { ...pin, path: database })
  const snapshot = snapshotDatabase(archived, { closed: true })
  assert.equal(snapshot.integrityCheck, 'ok')
  assert.deepEqual(snapshot.foreignKeyCheck, [])
  return { store: { databaseFiles: [pin] }, snapshot }
}

async function assertCatalog(page, installed) {
  const catalog = await modelApi(page, 'getCatalog')
  assert.equal(catalog.length, 1)
  const [entry] = catalog
  assert.equal(entry.id, installed.resourceId)
  assert.equal(entry.defaultVersionId, installed.versionId)
  assert.equal(entry.modelId, embedding.modelId)
  assert.equal(entry.name, embedding.modelName)
  assert.equal(entry.resourceType, 'embedding')
  assert.equal(entry.versions.length, 1)
  const [version] = entry.versions
  assert.equal(version.id, installed.versionId)
  assert.equal(version.civitaiVersionId, embedding.versionId)
  assert.equal(version.civitaiFileId, embedding.fileId)
  assert.equal(version.fileSizeBytes, embedding.sizeBytes)
  assert.equal(version.sha256, embedding.sha256)
  assert.equal(version.fileStatus, 'ready')
  assert.deepEqual(await modelApi(page, 'getStorageSummary'), { totalBytes: embedding.sizeBytes })
  assert.equal((await modelApi(page, 'getTokenStatus')).kind, 'missing')
  return catalog
}

async function openQueue(page) {
  const manager = await openManager(page)
  await manager.getByRole('button', { name: /^Downloading\s*0$/ }).click()
  await expect(manager.getByText('Install Queue', { exact: true })).toBeVisible()
  return manager
}

async function assertEmptyQueue(manager) {
  await expect(manager.locator('.job-row')).toHaveCount(0)
  await expect(manager.getByText('No install jobs yet', { exact: true })).toBeVisible()
  await expect(manager.getByRole('button', { name: 'Clear finished', exact: true })).toBeDisabled()
}

export async function runPackagedModelInstallHistory({
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
    suite: 'packaged-model-install-history',
    root,
    ownedRunRoot,
    packageBefore,
    expectedPackage: proof.package,
  })
  assert.equal(await realpath(root), root)
  assert.equal(appData, path.join(root, 'data/imagegen-studio'))
  await assert.rejects(lstat(appData), { code: 'ENOENT' })
  const original = await identity(
    path.join(
      ownedRunRoot,
      'packaged-noobai-component-repair/20261121-r3/repaired-illustriousphoto.safetensors',
    ),
  )
  assert.equal(await realpath(original.path), original.path)
  assert.equal(original.sha256, embedding.sha256)
  assert.equal(original.sizeBytes, embedding.sizeBytes)

  const modelRoot = path.join(appData, 'models')
  const staging = path.join(modelRoot, '.staging')
  const managedPath = path.join(
    modelRoot,
    embedding.sha256.slice(0, 2),
    `${embedding.sha256}.safetensors`,
  )
  await mkdir(staging, { recursive: true, mode: 0o700 })
  await mkdir(path.dirname(managedPath), { mode: 0o700 })
  await copyFile(original.path, managedPath, constants.COPYFILE_EXCL)
  await chmod(managedPath, 0o600)
  const managed = await hashInstalledFile(managedPath, embedding)
  const neighborPath = path.join(staging, 'notes.part')
  await writeFile(neighborPath, 'Non-owned staging filename', { flag: 'wx', mode: 0o600 })
  const neighbor = await identity(neighborPath)

  const { installed, jobs, database } = await seedDatabase(appData, managedPath)
  const storeArgs = { root, database, identity }
  const before = await retainDatabase(storeArgs, 'before-clear')
  assert.equal(before.snapshot.schemaMigrations.length, 30)
  assert.deepEqual(
    before.snapshot.tables.model_install_job.rows.map(({ id, status }) => ({ id, status })),
    jobs.map(({ id, status }) => ({ id, status })),
  )
  assert.deepEqual(
    before.snapshot.tables.model_install_artifact.rows
      .map(({ job_id, status }) => ({ id: job_id, status }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    jobs.map(({ id, status }) => ({ id, status: status === 'completed' ? 'ready' : status })),
  )
  await writeFile(
    path.join(root, 'prepared-install-history.json'),
    JSON.stringify(
      { before: before.store, jobs, installed, managed, original, neighbor },
      null,
      2,
    ) + '\n',
    { flag: 'wx', mode: 0o600 },
  )

  const first = await launch('model-install-history')
  assert.deepEqual(
    (await modelApi(first.page, 'getInstallJobs')).sort((a, b) => a.id.localeCompare(b.id)),
    jobs,
  )
  const catalog = await assertCatalog(first.page, installed)
  const manager = await openQueue(first.page)
  const rows = manager.locator('.job-row')
  await expect(rows).toHaveCount(jobs.length)
  for (const job of jobs) {
    const row = rows.filter({ has: first.page.getByText(job.modelName, { exact: true }) })
    await expect(row.getByText(job.status, { exact: true })).toBeVisible()
  }
  await first.page.screenshot({ path: path.join(root, 'before-clear.png'), animations: 'disabled' })
  await manager.getByRole('button', { name: 'Clear finished', exact: true }).click()
  await expect(
    manager.getByText('Cleared 3 finished installations.', { exact: true }),
  ).toBeVisible()
  await assertEmptyQueue(manager)
  assert.deepEqual(await modelApi(first.page, 'getInstallJobs'), [])
  assert.deepEqual(await assertCatalog(first.page, installed), catalog)
  await first.page.screenshot({ path: path.join(root, 'after-clear.png'), animations: 'disabled' })
  await manager.getByRole('button', { name: 'Close Model Manager', exact: true }).click()
  await closeNormally(first)
  assert.ok(first.normalPhysicalExit && !first.forcedCleanup)

  const saved = await retainDatabase(storeArgs, 'after-clear')
  const expected = structuredClone(before.snapshot)
  expected.tables.model_install_job.rows = []
  expected.tables.model_install_artifact.rows = []
  assert.deepEqual(saved.snapshot, expected)
  assert.deepEqual(await hashInstalledFile(managedPath, embedding), managed)

  const second = await launch('model-install-history-restarted')
  assert.deepEqual(await modelApi(second.page, 'getInstallJobs'), [])
  assert.deepEqual(await assertCatalog(second.page, installed), catalog)
  const reopened = await openQueue(second.page)
  await assertEmptyQueue(reopened)
  assert.deepEqual(await modelApi(second.page, 'clearFinishedInstallJobs'), [])
  await second.page.screenshot({
    path: path.join(root, 'reopened-queue.png'),
    animations: 'disabled',
  })
  await reopened.getByRole('button', { name: 'Back to models', exact: true }).click()
  const resources = reopened.locator('.resource-row')
  await expect(resources).toHaveCount(1)
  await resources.getByRole('button', { name: new RegExp(embedding.modelName) }).click()
  const versionRow = reopened.locator('.version-row')
  await expect(versionRow.getByText(embedding.versionName, { exact: true })).toBeVisible()
  await expect(versionRow.getByText(/· ready$/)).toBeVisible()
  await second.page.screenshot({
    path: path.join(root, 'reopened-catalog.png'),
    animations: 'disabled',
  })
  await reopened.getByRole('button', { name: 'Close Model Manager', exact: true }).click()
  await closeNormally(second)
  assert.ok(second.normalPhysicalExit && !second.forcedCleanup)

  const restarted = await retainDatabase(storeArgs, 'after-repeat')
  assert.deepEqual(restarted.snapshot, saved.snapshot)
  assert.deepEqual(restarted.store.databaseFiles[0], {
    ...saved.store.databaseFiles[0],
    path: restarted.store.databaseFiles[0].path,
  })
  assert.deepEqual(await hashInstalledFile(managedPath, embedding), managed)
  assert.deepEqual(await identity(original.path), original)
  assert.deepEqual(await identity(neighborPath), neighbor)
  assert.deepEqual(await readdir(staging), ['notes.part'])

  return {
    saved: saved.store,
    restarted: restarted.store,
    offlineProjectResult: { before: before.store, jobs, installed, managed, original, neighbor },
  }
}
