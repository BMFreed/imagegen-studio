import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { openAppDatabase } from '../db/database.js'
import { CivitaiClient } from './civitai-client.js'
import { CivitaiTokenStore, type SafeStorageAdapter } from './civitai-token-store.js'
import { ModelDownloader } from './model-downloader.js'
import { ModelInstallCoordinator } from './model-install-coordinator.js'
import { ModelRepository } from './model-repository.js'
import { ModelService } from './model-service.js'

const migrations = path.resolve('src/main/db/migrations')
const bytes = Buffer.from('Owned idle-install maintenance upscaler fixture')
const hash = createHash('sha256').update(bytes).digest('hex')
const errorCode = (value: string) => (error: unknown) =>
  error instanceof Error && 'code' in error && error.code === value

function signal() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function safeStorage(): SafeStorageAdapter {
  return {
    decryptStringAsync: async (ciphertext) => ({
      result: ciphertext.toString('utf8'),
      shouldReEncrypt: false,
    }),
    encryptStringAsync: async (plainText) => Buffer.from(plainText),
    getSelectedStorageBackend: () => 'gnome_libsecret',
    isAsyncEncryptionAvailable: async () => true,
  }
}

/** No network. Genuine CivitaiClient parses this bounded provider metadata. */
const metadata: typeof fetch = async (input) => {
  const pathname = new URL(String(input)).pathname
  const model = /^\/api\/v1\/models\/(42|43)$/.exec(pathname)
  const version = /^\/api\/v1\/model-versions\/(7|8)$/.exec(pathname)
  let body: object = { id: 1 }
  if (model) {
    const modelId = Number(model[1])
    const versionId = modelId === 42 ? 7 : 8
    body = {
      id: modelId,
      modelVersions: [{ baseModel: 'Any', id: versionId, name: 'Exact' }],
      name: `Owned upscaler ${modelId}`,
      type: 'Upscaler',
    }
  } else if (version) {
    const versionId = Number(version[1])
    const modelId = versionId === 7 ? 42 : 43
    const fileId = versionId * 100 + 1
    body = {
      baseModel: 'Any',
      files: [
        {
          downloadUrl: `https://civitai.com/api/download/models/${versionId}?fileId=${fileId}`,
          hashes: { SHA256: hash },
          id: fileId,
          metadata: { format: 'PickleTensor' },
          name: 'owned-upscaler.pth',
          primary: true,
          sizeKB: bytes.length / 1024,
        },
      ],
      id: versionId,
      images: [],
      modelId,
      name: 'Exact',
    }
  }
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
}

type Hooks = { beforeDownload?: () => Promise<void>; beforeToken?: () => Promise<void> }

async function waitForIdle(coordinator: ModelInstallCoordinator) {
  const deadline = Date.now() + 5000
  for (;;) {
    try {
      await coordinator.withIdleStorageMutation(async () => {})
      return
    } catch (error) {
      if (!errorCode('MODEL_STORAGE_BUSY')(error) || Date.now() >= deadline) {
        throw error
      }
    }
    // Retry only after observing the real busy refusal. A successful actual claim is the
    // completion signal; this delay alone never establishes that an installer has stopped.
    await new Promise<void>((resolve) => setTimeout(resolve, 5))
  }
}

async function withInstaller(
  run: (f: {
    calls: { downloads: number; previews: number; tokens: number }
    coordinator: ModelInstallCoordinator
    hold: () => { entered: ReturnType<typeof signal>; release: ReturnType<typeof signal> }
    hooks: Hooks
    preview: (modelId?: 42 | 43) => Promise<string>
    repository: ModelRepository
  }) => Promise<void>,
) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-install-maintenance-'))
  const database = openAppDatabase(root, migrations)
  const repository = new ModelRepository(database.db)
  const service = new ModelService(
    repository,
    new CivitaiClient(metadata),
    new CivitaiTokenStore(safeStorage(), root),
  )
  const calls = { downloads: 0, previews: 0, tokens: 0 }
  const hooks: Hooks = {}
  const releases: (() => void)[] = []
  const originalToken = service.requireToken.bind(service)
  service.requireToken = async () => {
    calls.tokens++
    await hooks.beforeToken?.()
    return await originalToken()
  }
  const originalPreview = service.getPreviewSession.bind(service)
  service.getPreviewSession = (id) => {
    calls.previews++
    return originalPreview(id)
  }
  // The real downloader still validates source/DNS, streams, hashes, stages and handles Abort.
  const downloader = new ModelDownloader({
    resolveAddresses: async () => ['1.1.1.1'],
    transport: async () => {
      calls.downloads++
      await hooks.beforeDownload?.()
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes)
          controller.close()
        },
      })
      return new Response(body, {
        headers: {
          'content-length': String(bytes.length),
          'content-type': 'application/octet-stream',
        },
      })
    },
  })
  const coordinator = new ModelInstallCoordinator(repository, service, downloader, root)
  try {
    await coordinator.initialize()
    await service.saveToken('owned-test-token')
    await run({
      calls,
      coordinator,
      hold: () => {
        const entered = signal()
        const release = signal()
        releases.push(release.resolve)
        return { entered, release }
      },
      hooks,
      preview: async (modelId = 42) => {
        const value = await service.previewImport(
          `https://civitai.com/models/${modelId}?modelVersionId=${modelId === 42 ? 7 : 8}`,
        )
        assert.equal(value.kind, 'select-file')
        if (value.kind !== 'select-file') {
          throw new Error('Expected an owned upscaler preview')
        }
        return value.previewId
      },
      repository,
    })
  } finally {
    hooks.beforeDownload = undefined
    hooks.beforeToken = undefined
    for (const release of releases) {
      release()
    }
    for (const job of await coordinator.listJobs()) {
      if (['downloading', 'verifying', 'waiting'].includes(job.status)) {
        await coordinator.cancelInstall(job.id).catch((error: unknown) => {
          if (
            !errorCode('MODEL_JOB_NOT_ACTIVE')(error) &&
            !errorCode('MODEL_COMMIT_IN_PROGRESS')(error)
          ) {
            throw error
          }
        })
      }
    }
    await waitForIdle(coordinator)
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
}

test('startInstall reserves preparation before deferred requireToken, blocking removal with no job published yet', async () => {
  await withInstaller(async (f) => {
    const previewId = await f.preview()
    const held = f.hold()
    f.hooks.beforeToken = async () => {
      held.entered.resolve()
      await held.release.promise
    }
    const preparing = f.coordinator.startInstall(previewId, 701, false)
    await held.entered.promise
    assert.deepEqual(await f.coordinator.listJobs(), [])
    let touched = false
    await assert.rejects(
      f.coordinator.withIdleStorageMutation(async () => {
        touched = true
      }),
      errorCode('MODEL_STORAGE_BUSY'),
    )
    assert.equal(touched, false)
    assert.equal(f.calls.downloads, 0)
    held.release.resolve()
    await preparing
    await waitForIdle(f.coordinator)
    assert.equal((await f.coordinator.listJobs())[0]?.status, 'completed')
  })
})

test('held storage mutation rejects startInstall before preview metadata, validation or job creation', async () => {
  await withInstaller(async (f) => {
    const previewId = await f.preview()
    const before = { ...f.calls }
    const held = f.hold()
    const mutation = f.coordinator.withIdleStorageMutation(async () => {
      held.entered.resolve()
      await held.release.promise
    })
    await held.entered.promise
    await assert.rejects(
      f.coordinator.startInstall(previewId, 701, false),
      errorCode('MODEL_STORAGE_BUSY'),
    )
    await assert.rejects(
      f.coordinator.startInstall('not-a-preview', -1, false),
      errorCode('MODEL_STORAGE_BUSY'),
    )
    await assert.rejects(
      f.coordinator.withIdleStorageMutation(async () => assert.fail('Reentrant mutation')),
      errorCode('MODEL_STORAGE_BUSY'),
    )
    assert.deepEqual(f.calls, before)
    assert.deepEqual(await f.coordinator.listJobs(), [])
    held.release.resolve()
    await mutation
    await f.coordinator.startInstall(previewId, 701, false)
    await waitForIdle(f.coordinator)
    assert.equal((await f.coordinator.listJobs())[0]?.status, 'completed')
  })
})

test('storage callback failure releases its exclusive claim for a new mutation and actual installation', async () => {
  await withInstaller(async (f) => {
    const failure = new Error('declared filesystem callback refusal')
    await assert.rejects(
      f.coordinator.withIdleStorageMutation(async () => {
        throw failure
      }),
      (error) => error === failure,
    )
    assert.equal(await f.coordinator.withIdleStorageMutation(async () => 'released'), 'released')
    const previewId = await f.preview()
    await f.coordinator.startInstall(previewId, 701, false)
    await waitForIdle(f.coordinator)
    assert.equal((await f.repository.listInstalled()).length, 1)
  })
})

test('running download and a second queued install block removal; explicit cancellation must settle before a successful idle claim', async () => {
  await withInstaller(async (f) => {
    const firstPreview = await f.preview()
    const secondPreview = await f.preview(43)
    const held = f.hold()
    f.hooks.beforeDownload = async () => {
      held.entered.resolve()
      await held.release.promise
    }
    const first = await f.coordinator.startInstall(firstPreview, 701, false)
    await held.entered.promise
    const second = await f.coordinator.startInstall(secondPreview, 801, false)
    const jobs = await f.coordinator.listJobs()
    assert.equal(jobs.find((job) => job.id === first.id)?.status, 'downloading')
    assert.equal(jobs.find((job) => job.id === second.id)?.status, 'waiting')
    let touched = false
    await assert.rejects(
      f.coordinator.withIdleStorageMutation(async () => {
        touched = true
      }),
      errorCode('MODEL_STORAGE_BUSY'),
    )
    assert.equal(touched, false)
    await f.coordinator.cancelInstall(second.id)
    await assert.rejects(
      f.coordinator.withIdleStorageMutation(async () => {
        touched = true
      }),
      errorCode('MODEL_STORAGE_BUSY'),
    )
    await f.coordinator.cancelInstall(first.id)
    held.release.resolve()
    await waitForIdle(f.coordinator)
    assert.ok((await f.coordinator.listJobs()).every((job) => job.status === 'canceled'))
    assert.deepEqual(await f.repository.listInstalled(), [])
    assert.equal(await f.coordinator.withIdleStorageMutation(async () => 'idle'), 'idle')
  })
})
