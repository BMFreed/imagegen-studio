import type { ModelInstallJobView } from '../../shared/api.js'

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { openAppDatabase } from '../db/database.js'
import { CivitaiClient } from './civitai-client.js'
import { CivitaiTokenStore } from './civitai-token-store.js'
import { ModelDownloader } from './model-downloader.js'
import { ModelInstallCoordinator } from './model-install-coordinator.js'
import { ModelRepository } from './model-repository.js'
import { ModelService } from './model-service.js'

const migrations = path.resolve('src/main/db/migrations')
const bytes = (id: number) => Buffer.from(`Owned install history model ${id}`)

function signal() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function observed(operation: Promise<unknown>) {
  const result = { settled: false }
  void operation.then(
    () => (result.settled = true),
    () => (result.settled = true),
  )
  return result
}

async function nextTurn(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve))
}

const metadata: typeof fetch = async (input) => {
  const pathname = new URL(String(input)).pathname
  if (pathname === '/api/v1/me') {
    return Response.json({ id: 1 })
  }
  const model = /^\/api\/v1\/models\/(\d+)$/.exec(pathname)
  if (model) {
    const modelId = Number(model[1])
    return Response.json({
      id: modelId,
      modelVersions: [{ baseModel: 'Any', id: modelId * 10, name: 'Exact' }],
      name: `Owned model ${modelId}`,
      type: 'Upscaler',
    })
  }
  const version = /^\/api\/v1\/model-versions\/(\d+)$/.exec(pathname)
  assert.ok(version, `Unexpected metadata route ${pathname}`)
  const versionId = Number(version[1])
  const fileId = versionId * 10
  const modelId = versionId / 10
  return Response.json({
    baseModel: 'Any',
    files: [
      {
        downloadUrl: `https://civitai.com/api/download/models/${versionId}?fileId=${fileId}`,
        hashes: { SHA256: createHash('sha256').update(bytes(modelId)).digest('hex') },
        id: fileId,
        metadata: { format: 'PickleTensor' },
        name: `owned-${fileId}.pth`,
        primary: true,
        sizeKB: bytes(modelId).length / 1024,
      },
    ],
    id: versionId,
    images: [],
    modelId,
    name: 'Exact',
  })
}

async function openInstaller() {
  const root = await mkdtemp(path.join(tmpdir(), 'igs-install-history-'))
  const database = openAppDatabase(root, migrations)
  const repository = new ModelRepository(database.db)
  const service = new ModelService(
    repository,
    new CivitaiClient(metadata),
    new CivitaiTokenStore(
      {
        decryptStringAsync: async (ciphertext) => ({
          result: ciphertext.toString('utf8'),
          shouldReEncrypt: false,
        }),
        encryptStringAsync: async (plainText) => Buffer.from(plainText),
        getSelectedStorageBackend: () => 'gnome_libsecret',
        isAsyncEncryptionAvailable: async () => true,
      },
      root,
    ),
  )
  const downloadPauses = new Map<number, ReturnType<typeof pause>>()
  const allReleases = new Set<() => void>()
  function pause() {
    const entered = signal()
    const released = signal()
    allReleases.add(released.resolve)
    return { entered, released }
  }
  const installer = new ModelInstallCoordinator(
    repository,
    service,
    new ModelDownloader({
      resolveAddresses: async () => ['1.1.1.1'],
      transport: async (input) => {
        const pathname = new URL(String(input)).pathname
        const download = /^\/api\/download\/models\/(\d+)$/.exec(pathname)
        assert.ok(download, `Unexpected file route ${pathname}`)
        const modelId = Number(download[1]) / 10
        const pause = downloadPauses.get(modelId)
        if (pause) {
          pause.entered.resolve()
          await pause.released.promise
        }
        return new Response(bytes(modelId), {
          headers: { 'content-type': 'application/octet-stream' },
        })
      },
    }),
    root,
  )
  let databaseClosed = false
  const close = async () => {
    if (!databaseClosed) {
      await installer.shutdown()
      await database.close()
      databaseClosed = true
    }
  }
  try {
    await installer.initialize()
    await service.saveToken('owned-install-history-test-token')
    return {
      close,
      database,
      async dispose() {
        for (const release of allReleases) {
          release()
        }
        await close()
        await rm(root, { force: true, recursive: true })
      },
      history: installer,
      pause,
      pauseDownload(id: number) {
        const entry = pause()
        downloadPauses.set(id, entry)
        return entry
      },
      repository,
      root,
      async seedJob(id: number, status: 'canceled' | 'failed' | 'verifying' | 'waiting') {
        const fileId = id * 100
        const jobId = await repository.createInstallJob({
          artifacts: [{ role: 'primary', source: { fileId, kind: 'civitai_file' } }],
          baseModelFamily: null,
          civitaiFileId: fileId,
          civitaiModelId: id,
          civitaiVersionId: id * 10,
          displayName: `History model ${id}`,
          resourceType: 'upscaler',
          versionName: 'Exact',
        })
        if (status === 'verifying') {
          await repository.updateInstallJob(jobId, { bytesDownloaded: 17, status: 'downloading' })
          await repository.updateInstallArtifact(jobId, 'primary', { status: 'downloading' })
          await repository.updateInstallArtifact(jobId, 'primary', { status: 'verifying' })
        }
        if (status !== 'waiting') {
          await repository.updateInstallJob(jobId, { status })
        }
        return jobId
      },
      async start(id: number) {
        const preview = await service.previewImport(
          `https://civitai.com/models/${id}?modelVersionId=${id * 10}`,
        )
        assert.equal(preview.kind, 'select-file')
        return installer.startInstall(preview.previewId, id * 100, false)
      },
    }
  } catch (error) {
    await close()
    await rm(root, { force: true, recursive: true })
    throw error
  }
}

async function completed(history: ModelInstallCoordinator, jobId: string) {
  let finish!: (job: ModelInstallJobView) => void
  const completion = new Promise<ModelInstallJobView>((resolve) => {
    finish = resolve
  })
  const inspect = (job: ModelInstallJobView) => {
    if (job.id === jobId && ['canceled', 'completed', 'failed'].includes(job.status)) {
      finish(job)
    }
  }
  const unsubscribe = history.onChanged(inspect)
  try {
    for (const job of await history.listJobs()) {
      inspect(job)
    }
    const job = await completion
    assert.equal(job.status, 'completed', job.error?.message ?? 'Expected a completed install')
    await nextTurn()
  } finally {
    unsubscribe()
  }
}

test(
  'clear finished preserves every active status, the installed catalog and on-disk bytes',
  { timeout: 5000 },
  async () => {
    const f = await openInstaller()
    try {
      const installedJob = await f.start(1)
      await completed(f.history, installedJob.id)
      const failed = await f.seedJob(2, 'failed')
      const canceled = await f.seedJob(3, 'canceled')
      await f.seedJob(4, 'waiting')
      await f.seedJob(5, 'verifying')
      const transferring = f.pauseDownload(6)
      const activeJob = await f.start(6)
      await transferring.entered.promise
      const previous = await f.repository.listInstallJobs()
      assert.deepEqual(previous.map(({ status }) => status).toSorted(), [
        'canceled',
        'completed',
        'downloading',
        'failed',
        'verifying',
        'waiting',
      ])
      const expectedRemoved = [installedJob.id, failed, canceled].toSorted()
      const expectedRemaining = previous
        .filter(({ id }) => !expectedRemoved.includes(id))
        .toSorted((left, right) => left.id.localeCompare(right.id))
      const catalog = await f.repository.listInstalled()
      const file = catalog[0]?.versions[0]?.file
      assert.ok(file)
      assert.deepEqual(await readFile(file.managedPath), bytes(1))

      assert.deepEqual((await f.history.clearFinishedJobs()).toSorted(), expectedRemoved)
      assert.deepEqual(
        (await f.repository.listInstallJobs()).toSorted((left, right) =>
          left.id.localeCompare(right.id),
        ),
        expectedRemaining,
      )
      const artifacts = await f.database.db
        .selectFrom('model_install_artifact')
        .select('job_id')
        .execute()
      assert.deepEqual(
        artifacts.map(({ job_id }) => job_id).toSorted(),
        expectedRemaining.map(({ id }) => id).toSorted(),
      )
      assert.deepEqual(await f.repository.listInstalled(), catalog)
      assert.deepEqual(await readFile(file.managedPath), bytes(1))
      assert.deepEqual(await f.history.clearFinishedJobs(), [])

      transferring.released.resolve()
      await completed(f.history, activeJob.id)
      const afterTransfer = await f.repository.listInstalled()
      assert.equal(afterTransfer.length, 2)
      await f.close()
      const reopened = openAppDatabase(f.root, migrations)
      try {
        const repository = new ModelRepository(reopened.db)
        const jobs = await repository.listInstallJobs()
        assert.deepEqual(
          jobs.map(({ id }) => id).toSorted(),
          expectedRemaining.map(({ id }) => id).toSorted(),
        )
        assert.deepEqual(await repository.listInstalled(), afterTransfer)
        assert.deepEqual(await readFile(file.managedPath), bytes(1))
      } finally {
        await reopened.close()
      }
    } finally {
      await f.dispose()
    }
  },
)

test(
  'clear finished protects a published install until its terminal event settles',
  { timeout: 5000 },
  async () => {
    const f = await openInstaller()
    try {
      const retired = await f.seedJob(1, 'failed')
      const hold = f.pause()
      const publish = f.repository.publishVerifiedInstallation.bind(f.repository)
      f.repository.publishVerifiedInstallation = async (...input) => {
        const published = await publish(...input)
        hold.entered.resolve()
        await hold.released.promise
        return published
      }
      const inPublication = await f.start(2)
      await hold.entered.promise
      assert.equal(
        (await f.repository.listInstallJobs()).find(({ id }) => id === inPublication.id)?.status,
        'completed',
      )
      assert.equal(f.history.getCloseImpact().committingJobCount, 1)
      assert.deepEqual(await f.history.clearFinishedJobs(), [retired])
      assert.deepEqual(
        (await f.repository.listInstallJobs()).map(({ id }) => id),
        [inPublication.id],
      )

      hold.released.resolve()
      await completed(f.history, inPublication.id)
      assert.equal(f.history.getCloseImpact().activeJobCount, 0)
      assert.deepEqual(await f.history.clearFinishedJobs(), [inPublication.id])
      assert.equal((await f.repository.listInstalled()).length, 1)
    } finally {
      await f.dispose()
    }
  },
)

test(
  'clear finished joins the terminal acknowledgement of a queued Cancel',
  { timeout: 5000 },
  async () => {
    const f = await openInstaller()
    try {
      const transferring = f.pauseDownload(1)
      const current = await f.start(1)
      await transferring.entered.promise
      const queued = await f.start(2)
      assert.equal(queued.status, 'waiting')
      const ack = f.pause()
      let held = false
      const list = f.repository.listInstallJobs.bind(f.repository)
      f.repository.listInstallJobs = async () => {
        const jobs = await list()
        if (!held && jobs.some(({ id, status }) => id === queued.id && status === 'canceled')) {
          held = true
          ack.entered.resolve()
          await ack.released.promise
        }
        return jobs
      }
      const cancellation = f.history.cancelInstall(queued.id)
      await ack.entered.promise
      assert.equal((await list()).find(({ id }) => id === queued.id)?.status, 'canceled')
      const clearing = f.history.clearFinishedJobs()
      const clear = observed(clearing)
      await nextTurn()
      assert.equal(clear.settled, false, 'The terminal row is still needed by the Cancel response')
      ack.released.resolve()
      assert.equal((await cancellation).status, 'canceled')
      assert.deepEqual(await clearing, [queued.id])
      assert.deepEqual(
        (await list()).map(({ id }) => id),
        [current.id],
      )
    } finally {
      await f.dispose()
    }
  },
)

test(
  'shutdown joins an admitted history clear and a later terminal row survives its snapshot',
  { timeout: 5000 },
  async () => {
    const f = await openInstaller()
    try {
      const old = await f.seedJob(1, 'failed')
      const later = await f.seedJob(2, 'waiting')
      const deleting = f.pause()
      const prune = f.repository.pruneFinishedInstallJobs.bind(f.repository)
      f.repository.pruneFinishedInstallJobs = async (jobIds) => {
        assert.deepEqual(jobIds, [old])
        deleting.entered.resolve()
        await deleting.released.promise
        return prune(jobIds)
      }
      const clearing = f.history.clearFinishedJobs()
      await deleting.entered.promise
      await f.repository.updateInstallJob(later, { status: 'failed' })
      const stopping = f.history.shutdown()
      const stopped = observed(stopping)
      await nextTurn()
      assert.equal(stopped.settled, false, 'The admitted clear still owns its SQLite write')
      await assert.rejects(f.history.clearFinishedJobs(), { code: 'MODEL_APP_CLOSING' })
      deleting.released.resolve()
      assert.deepEqual(await clearing, [old])
      await stopping
      assert.deepEqual(
        (await f.repository.listInstallJobs()).map(({ id }) => id),
        [later],
      )
    } finally {
      await f.dispose()
    }
  },
)
