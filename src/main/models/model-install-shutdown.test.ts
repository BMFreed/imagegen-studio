/**
 * Invoke4875 model_install_default.stop + download_default.stop join actual callbacks before
 * callers dispose SQLite. These tests use real Studio storage/downloader with controlled I/O
 * completion, not a pre-completed install or an assertion that Abort was merely requested.
 */
import type { ModelInstallJobView } from '../../shared/api.js'

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { openAppDatabase } from '../db/database.js'
import { CivitaiClient } from './civitai-client.js'
import { CivitaiTokenStore, type SafeStorageAdapter } from './civitai-token-store.js'
import { ModelDownloader, type ModelDownloadInput } from './model-downloader.js'
import { ModelInstallCoordinator } from './model-install-coordinator.js'
import { ModelRepository } from './model-repository.js'
import { ModelService } from './model-service.js'

const migrations = path.resolve('src/main/db/migrations')
const bytes = Buffer.from('Owned shutdown upscaler bytes; no model execution or weights needed.')
const hash = createHash('sha256').update(bytes).digest('hex')
const code = (expected: string) => (error: unknown) =>
  error instanceof Error && 'code' in error && error.code === expected

function signal() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function observed<T>(operation: Promise<T>) {
  const result = { settled: false }
  void operation.then(
    () => {
      result.settled = true
    },
    () => {
      result.settled = true
    },
  )
  return result
}

async function pending(result: { settled: boolean }, message: string) {
  // Callers first await an independently observed entered/canceled I/O boundary. Let all
  // already-ready promise continuations run; elapsed wall-clock time is not the evidence.
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(result.settled, false, message)
}

async function terminalJob(coordinator: ModelInstallCoordinator, jobId: string) {
  let done!: (job: ModelInstallJobView) => void
  const result = new Promise<ModelInstallJobView>((resolve) => {
    done = resolve
  })
  const inspect = (job: ModelInstallJobView) => {
    if (job.id === jobId && ['canceled', 'completed', 'failed'].includes(job.status)) {
      done(job)
    }
  }
  const unsubscribe = coordinator.onChanged(inspect)
  try {
    for (const job of await coordinator.listJobs()) {
      inspect(job)
    }
    return await result
  } finally {
    unsubscribe()
  }
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

/** Actual metadata parser, with only provider responses controlled. */
const metadata: typeof fetch = async (input) => {
  const pathname = new URL(String(input)).pathname
  const model = /^\/api\/v1\/models\/(42|43)$/.exec(pathname)
  const version = /^\/api\/v1\/model-versions\/(7|8)$/.exec(pathname)
  let body: object = { id: 1 }
  if (model) {
    const modelId = Number(model[1])
    body = {
      id: modelId,
      modelVersions: [{ baseModel: 'Any', id: modelId === 42 ? 7 : 8, name: 'Exact' }],
      name: `Owned shutdown upscaler ${modelId}`,
      type: 'Upscaler',
    }
  } else if (version) {
    const versionId = Number(version[1])
    const fileId = versionId * 100 + 1
    body = {
      baseModel: 'Any',
      files: [
        {
          downloadUrl: `https://civitai.com/api/download/models/${versionId}?fileId=${fileId}`,
          hashes: { SHA256: hash },
          id: fileId,
          metadata: { format: 'PickleTensor' },
          name: 'owned-shutdown-upscaler.pth',
          primary: true,
          sizeKB: bytes.length / 1024,
        },
      ],
      id: versionId,
      images: [],
      modelId: versionId === 7 ? 42 : 43,
      name: 'Exact',
    }
  }
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
}

type JobPatch = Parameters<ModelRepository['updateInstallJob']>[1]
type Hooks = {
  afterCreate?: (jobId: string) => Promise<void>
  beforeBodyCancel?: () => Promise<void>
  beforeCanceledWrite?: (jobId: string) => Promise<void>
  beforeProgressWrite?: (jobId: string) => Promise<void>
  beforePublish?: () => Promise<void>
  beforeToken?: () => Promise<void>
  transfer: 'complete' | 'held'
}

async function withInstaller(
  run: (f: {
    callbacks: NonNullable<ModelDownloadInput['onProgress']>[]
    calls: {
      bodyCancels: number
      downloads: number
      jobReads: number
      jobWrites: [string, JobPatch['status']][]
      tokens: number
    }
    coordinator: ModelInstallCoordinator
    finishTransfer: () => void
    hold: () => { entered: ReturnType<typeof signal>; release: ReturnType<typeof signal> }
    hooks: Hooks
    preview: (modelId?: 42 | 43) => Promise<string>
    repository: ModelRepository
    root: string
  }) => Promise<void>,
) {
  const root = await mkdtemp(path.join(tmpdir(), 'igs-install-shutdown-'))
  const database = openAppDatabase(root, migrations)
  const repository = new ModelRepository(database.db)
  const service = new ModelService(
    repository,
    new CivitaiClient(metadata),
    new CivitaiTokenStore(safeStorage(), root),
  )
  const hooks: Hooks = { transfer: 'complete' }
  const releases: (() => void)[] = []
  const callbacks: NonNullable<ModelDownloadInput['onProgress']>[] = []
  const completions: (() => void)[] = []
  const calls = {
    bodyCancels: 0,
    downloads: 0,
    jobReads: 0,
    jobWrites: [] as [string, JobPatch['status']][],
    tokens: 0,
  }
  const nativeToken = service.requireToken.bind(service)
  service.requireToken = async () => {
    calls.tokens++
    await hooks.beforeToken?.()
    return nativeToken()
  }
  const nativeCreate = repository.createInstallJob.bind(repository)
  repository.createInstallJob = async (input) => {
    const id = await nativeCreate(input)
    await hooks.afterCreate?.(id)
    return id
  }
  const nativeUpdate = repository.updateInstallJob.bind(repository)
  repository.updateInstallJob = async (id, input) => {
    if (input.status === 'canceled') {
      await hooks.beforeCanceledWrite?.(id)
    }
    if (input.status === 'downloading' && (input.bytesDownloaded ?? 0) > 0) {
      await hooks.beforeProgressWrite?.(id)
    }
    await nativeUpdate(id, input)
    calls.jobWrites.push([id, input.status])
  }
  const nativeList = repository.listInstallJobs.bind(repository)
  repository.listInstallJobs = async () => {
    calls.jobReads++
    return nativeList()
  }
  const nativePublish = repository.publishVerifiedInstallation.bind(repository)
  repository.publishVerifiedInstallation = async (input) => {
    await hooks.beforePublish?.()
    return nativePublish(input)
  }
  const downloader = new ModelDownloader({
    resolveAddresses: async () => ['1.1.1.1'],
    transport: async () => {
      calls.downloads++
      const held = hooks.transfer === 'held'
      const body = new ReadableStream<Uint8Array>({
        cancel: async () => {
          calls.bodyCancels++
          await hooks.beforeBodyCancel?.()
        },
        start(controller) {
          controller.enqueue(held ? bytes.subarray(0, 16) : bytes)
          if (!held) {
            controller.close()
          } else {
            completions.push(() => {
              controller.enqueue(bytes.subarray(16))
              controller.close()
            })
          }
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
  const nativeDownload = downloader.download.bind(downloader)
  downloader.download = async (input) => {
    if (input.onProgress) {
      callbacks.push(input.onProgress)
    }
    return nativeDownload(input)
  }
  const coordinator = new ModelInstallCoordinator(repository, service, downloader, root)
  try {
    await coordinator.initialize()
    await service.saveToken('owned-shutdown-test-token')
    await run({
      callbacks,
      calls,
      coordinator,
      finishTransfer: () => {
        const finish = completions.shift()
        assert.ok(finish, 'Expected a held fixture transfer')
        finish()
      },
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
          throw new Error('Expected owned shutdown preview')
        }
        return value.previewId
      },
      repository,
      root,
    })
  } finally {
    hooks.afterCreate = undefined
    hooks.beforeBodyCancel = undefined
    hooks.beforeCanceledWrite = undefined
    hooks.beforeProgressWrite = undefined
    hooks.beforePublish = undefined
    hooks.beforeToken = undefined
    for (const release of releases) {
      release()
    }
    await coordinator.shutdown()
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
}

test(
  'close impact is read-only and shutdown of an idle installer fences new admission',
  { timeout: 5000 },
  async () => {
    await withInstaller(async (f) => {
      assert.deepEqual(f.coordinator.getCloseImpact(), {
        activeJobCount: 0,
        committingJobCount: 0,
        preparingInstallCount: 0,
        storageMutationActive: false,
      })
      const preview = await f.preview()
      await f.coordinator.shutdown()
      await f.coordinator.shutdown()
      const tokens = f.calls.tokens
      await assert.rejects(
        f.coordinator.startInstall(preview, 701, false),
        code('MODEL_APP_CLOSING'),
      )
      let removalEntered = false
      await assert.rejects(
        f.coordinator.withIdleStorageMutation(async () => {
          removalEntered = true
        }),
        code('MODEL_APP_CLOSING'),
      )
      assert.equal(removalEntered, false)
      assert.equal(f.calls.tokens, tokens)
      assert.equal(f.calls.downloads, 0)
      assert.deepEqual(await f.repository.listInstallJobs(), [])
    })
  },
)

test(
  'shutdown joins an accepted preparation before its controller exists and refuses late enqueue',
  { timeout: 5000 },
  async () => {
    await withInstaller(async (f) => {
      const preview = await f.preview()
      const held = f.hold()
      f.hooks.beforeToken = async () => {
        held.entered.resolve()
        await held.release.promise
      }
      const starting = f.coordinator.startInstall(preview, 701, false)
      const refused = assert.rejects(starting, code('MODEL_APP_CLOSING'))
      await held.entered.promise
      assert.equal(f.coordinator.getCloseImpact().preparingInstallCount, 1)
      assert.equal(f.coordinator.getCloseImpact().activeJobCount, 0)
      assert.deepEqual(await f.repository.listInstallJobs(), [])
      const stopping = f.coordinator.shutdown()
      const stopped = observed(stopping)
      await pending(
        stopped,
        'Preparation still owns service/storage after shutdown admission closes.',
      )
      held.release.resolve()
      await refused
      await stopping
      assert.equal(f.calls.downloads, 0)
      assert.deepEqual(await f.repository.listInstallJobs(), [])
      assert.equal(f.coordinator.getCloseImpact().preparingInstallCount, 0)
    })
  },
)

test(
  'reading live close impact neither aborts installation nor prevents a later install',
  { timeout: 5000 },
  async () => {
    await withInstaller(async (f) => {
      const preview = await f.preview()
      const secondPreview = await f.preview(43)
      const read = f.hold()
      f.hooks.transfer = 'held'
      f.hooks.beforeProgressWrite = async () => {
        read.entered.resolve()
      }
      const first = await f.coordinator.startInstall(preview, 701, false)
      await read.entered.promise
      assert.equal(f.coordinator.getCloseImpact().activeJobCount, 1)
      assert.equal(f.calls.bodyCancels, 0)
      f.finishTransfer()
      assert.equal((await terminalJob(f.coordinator, first.id)).status, 'completed')
      f.hooks.transfer = 'complete'
      const second = await f.coordinator.startInstall(secondPreview, 801, false)
      assert.equal((await terminalJob(f.coordinator, second.id)).status, 'completed')
      await f.coordinator.shutdown()
      assert.equal((await f.repository.listInstalled()).length, 2)
    })
  },
)

test(
  'a row created during accepted preparation is durably canceled without starting a transfer',
  { timeout: 5000 },
  async () => {
    await withInstaller(async (f) => {
      const preview = await f.preview()
      const held = f.hold()
      f.hooks.afterCreate = async () => {
        held.entered.resolve()
        await held.release.promise
      }
      const starting = f.coordinator.startInstall(preview, 701, false)
      const refused = assert.rejects(starting, code('MODEL_APP_CLOSING'))
      await held.entered.promise
      assert.equal((await f.repository.listInstallJobs()).length, 1)
      const stopping = f.coordinator.shutdown()
      const stopped = observed(stopping)
      await pending(
        stopped,
        'The created row must be terminalized before installer drain completes.',
      )
      held.release.resolve()
      await refused
      await stopping
      const jobs = await f.repository.listInstallJobs()
      assert.deepEqual(
        jobs.map((job) => job.status),
        ['canceled'],
      )
      assert.equal(
        jobs[0]?.artifacts.every((artifact) => artifact.status === 'canceled'),
        true,
      )
      assert.equal(f.calls.downloads, 0)
      assert.deepEqual(await f.repository.listInstalled(), [])
      assert.deepEqual(await readdir(path.join(f.root, 'models/.staging')), [])
    })
  },
)

test(
  'running and queued installs cancel durably only after real downloader body cleanup settles',
  { timeout: 5000 },
  async () => {
    await withInstaller(async (f) => {
      const firstPreview = await f.preview()
      const secondPreview = await f.preview(43)
      const read = f.hold()
      const cleanup = f.hold()
      f.hooks.transfer = 'held'
      f.hooks.beforeProgressWrite = async () => {
        read.entered.resolve()
      }
      f.hooks.beforeBodyCancel = async () => {
        cleanup.entered.resolve()
        await cleanup.release.promise
      }
      const first = await f.coordinator.startInstall(firstPreview, 701, false)
      await read.entered.promise
      const second = await f.coordinator.startInstall(secondPreview, 801, false)
      assert.equal(f.calls.downloads, 1)
      assert.equal(f.coordinator.getCloseImpact().activeJobCount, 2)
      assert.equal(
        (await f.repository.listInstallJobs()).find((job) => job.id === second.id)?.status,
        'waiting',
      )
      const stopping = f.coordinator.shutdown()
      const duplicate = f.coordinator.shutdown()
      const stopped = observed(stopping)
      const duplicateStopped = observed(duplicate)
      await cleanup.entered.promise
      await pending(stopped, 'Abort acknowledgement is not downloader reader/file cleanup.')
      await pending(duplicateStopped, 'Duplicate shutdown must join the same pending drain.')
      assert.equal(f.calls.bodyCancels, 1)
      assert.equal((await readdir(path.join(f.root, 'models/.staging'))).length, 1)
      cleanup.release.resolve()
      await Promise.all([stopping, duplicate])
      const jobs = await f.repository.listInstallJobs()
      assert.deepEqual(
        jobs.map((job) => job.status),
        ['canceled', 'canceled'],
      )
      for (const jobId of [first.id, second.id]) {
        assert.equal(
          f.calls.jobWrites.filter(([id, status]) => id === jobId && status === 'canceled').length,
          1,
        )
      }
      assert.equal(
        f.calls.downloads,
        1,
        'Queued work must not reach native transfer after shutdown.',
      )
      assert.deepEqual(await readdir(path.join(f.root, 'models/.staging')), [])
      assert.deepEqual(await f.repository.listInstalled(), [])
      assert.equal(f.coordinator.getCloseImpact().activeJobCount, 0)
    })
  },
)

test(
  'shutdown drains pending progress and ignores a retired callback after actual cleanup',
  { timeout: 5000 },
  async () => {
    await withInstaller(async (f) => {
      const preview = await f.preview()
      const progress = f.hold()
      const cleanup = f.hold()
      f.hooks.transfer = 'held'
      f.hooks.beforeProgressWrite = async () => {
        progress.entered.resolve()
        await progress.release.promise
      }
      f.hooks.beforeBodyCancel = async () => {
        cleanup.entered.resolve()
      }
      await f.coordinator.startInstall(preview, 701, false)
      await progress.entered.promise
      const stopping = f.coordinator.shutdown()
      const stopped = observed(stopping)
      await cleanup.entered.promise
      await pending(stopped, 'A queued progress repository operation still owns SQLite.')
      progress.release.resolve()
      await stopping
      assert.deepEqual(
        (await f.repository.listInstallJobs()).map((job) => job.status),
        ['canceled'],
      )
      const reads = f.calls.jobReads
      const writes = f.calls.jobWrites.length
      f.callbacks[0]?.({ downloadedBytes: 32, totalBytes: bytes.length })
      await new Promise<void>((resolve) => setImmediate(resolve))
      assert.equal(
        f.calls.jobReads,
        reads,
        'A retired progress callback must not touch the closed owner.',
      )
      assert.equal(f.calls.jobWrites.length, writes)
    })
  },
)

test(
  'publication already committing wins shutdown and its verified bytes remain installed',
  { timeout: 5000 },
  async () => {
    await withInstaller(async (f) => {
      const preview = await f.preview()
      const held = f.hold()
      f.hooks.beforePublish = async () => {
        held.entered.resolve()
        await held.release.promise
      }
      const job = await f.coordinator.startInstall(preview, 701, false)
      await held.entered.promise
      assert.equal(f.coordinator.getCloseImpact().committingJobCount, 1)
      await assert.rejects(f.coordinator.cancelInstall(job.id), code('MODEL_COMMIT_IN_PROGRESS'))
      const stopping = f.coordinator.shutdown()
      const stopped = observed(stopping)
      await pending(stopped, 'A verified publication must finish before shared SQLite can close.')
      held.release.resolve()
      await stopping
      assert.deepEqual(
        (await f.repository.listInstallJobs()).map((item) => item.status),
        ['completed'],
      )
      const installed = await f.repository.listInstalled()
      assert.equal(installed.length, 1)
      const file = installed[0]?.versions[0]?.file
      assert.ok(file)
      assert.equal(file.sha256, hash)
      assert.ok((await readFile(file.managedPath)).equals(bytes))
      assert.deepEqual(await readdir(path.join(f.root, 'models/.staging')), [])
      assert.equal(f.coordinator.getCloseImpact().committingJobCount, 0)
    })
  },
)

test(
  'shutdown waits for an admitted exclusive storage mutation and blocks its replacement',
  { timeout: 5000 },
  async () => {
    await withInstaller(async (f) => {
      const held = f.hold()
      const marker = path.join(f.root, 'storage-mutation-finished')
      const mutation = f.coordinator.withIdleStorageMutation(async () => {
        held.entered.resolve()
        await held.release.promise
        await f.repository.listInstallJobs()
        await writeFile(marker, 'settled actual storage owner')
        return 42
      })
      await held.entered.promise
      assert.equal(f.coordinator.getCloseImpact().storageMutationActive, true)
      const stopping = f.coordinator.shutdown()
      const stopped = observed(stopping)
      await pending(
        stopped,
        'An accepted Remove/storage callback still owns filesystem and SQLite.',
      )
      let entered = false
      await assert.rejects(
        f.coordinator.withIdleStorageMutation(async () => {
          entered = true
        }),
        code('MODEL_APP_CLOSING'),
      )
      assert.equal(entered, false)
      held.release.resolve()
      assert.equal(await mutation, 42)
      await stopping
      assert.equal(await readFile(marker, 'utf8'), 'settled actual storage owner')
      assert.equal(f.coordinator.getCloseImpact().storageMutationActive, false)
    })
  },
)

test(
  'an explicit queued cancellation already writing its terminal row remains part of shutdown',
  { timeout: 5000 },
  async () => {
    await withInstaller(async (f) => {
      const firstPreview = await f.preview()
      const secondPreview = await f.preview(43)
      const read = f.hold()
      const held = f.hold()
      f.hooks.transfer = 'held'
      f.hooks.beforeProgressWrite = async () => {
        read.entered.resolve()
      }
      await f.coordinator.startInstall(firstPreview, 701, false)
      await read.entered.promise
      const second = await f.coordinator.startInstall(secondPreview, 801, false)
      f.hooks.beforeCanceledWrite = async (id) => {
        if (id === second.id) {
          held.entered.resolve()
          await held.release.promise
        }
      }
      const canceled = f.coordinator.cancelInstall(second.id)
      await held.entered.promise
      const stopping = f.coordinator.shutdown()
      const stopped = observed(stopping)
      await pending(
        stopped,
        'Dequeued cancellation still has a pending durable row/event operation.',
      )
      held.release.resolve()
      assert.equal((await canceled).status, 'canceled')
      await stopping
      assert.deepEqual(
        (await f.repository.listInstallJobs()).map((job) => job.status),
        ['canceled', 'canceled'],
      )
      assert.equal(f.calls.downloads, 1)
      assert.equal(
        f.calls.jobWrites.filter(([id, status]) => id === second.id && status === 'canceled')
          .length,
        1,
      )
    })
  },
)

test(
  'failed durable shutdown cancellation refuses success and is retried without reopening admission',
  { timeout: 5000 },
  async () => {
    await withInstaller(async (f) => {
      const firstPreview = await f.preview()
      const secondPreview = await f.preview(43)
      const read = f.hold()
      f.hooks.transfer = 'held'
      f.hooks.beforeProgressWrite = async () => {
        read.entered.resolve()
      }
      await f.coordinator.startInstall(firstPreview, 701, false)
      await read.entered.promise
      const second = await f.coordinator.startInstall(secondPreview, 801, false)
      let fail = true
      f.hooks.beforeCanceledWrite = async (id) => {
        if (id === second.id && fail) {
          throw new Error('Controlled durable terminalization failure')
        }
      }
      await assert.rejects(f.coordinator.shutdown(), /Controlled durable terminalization failure/)
      await assert.rejects(
        f.coordinator.startInstall(secondPreview, 801, false),
        code('MODEL_APP_CLOSING'),
      )
      assert.notEqual(
        (await f.repository.listInstallJobs()).find((job) => job.id === second.id)?.status,
        'canceled',
      )
      fail = false
      await f.coordinator.shutdown()
      assert.deepEqual(
        (await f.repository.listInstallJobs()).map((job) => job.status),
        ['canceled', 'canceled'],
      )
      assert.deepEqual(await f.repository.listInstalled(), [])
      assert.deepEqual(await readdir(path.join(f.root, 'models/.staging')), [])
    })
  },
)
