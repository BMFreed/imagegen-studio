import type { ModelImportPreview, ModelInstallJobView } from '../../shared/api.js'
import type { GenerationPrompt } from '../../shared/projects/prompt-embeddings.js'

import Database from 'better-sqlite3'
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import {
  chmod,
  lstat,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import type { CheckpointCompatibilityFingerprint } from './model-compatibility-manifest.js'

import { openAppDatabase } from '../db/database.js'
import { ANIMA_BASE_1_0_CHECKPOINT, ANIMA_BASE_1_0_TOTAL_BYTES } from './anima-manifest.js'
import { CivitaiClient } from './civitai-client.js'
import { CivitaiTokenStore, type SafeStorageAdapter } from './civitai-token-store.js'
import { ModelDownloader } from './model-downloader.js'
import { ModelInstallCoordinator } from './model-install-coordinator.js'
import { ModelRepository, type VerifiedModelArtifact } from './model-repository.js'
import { ModelService } from './model-service.js'
import {
  illustriousEmbeddingFixture,
  publishIllustriousEmbeddingFixture,
} from './test-fixtures/illustrious-embedding.js'
import {
  illustriousLoraFixture,
  publishIllustriousLoraFixture,
} from './test-fixtures/illustrious-lora.js'
import {
  illustriousVaeFixture,
  publishIllustriousVaeFixture,
} from './test-fixtures/illustrious-vae.js'

const migrations = path.resolve('src/main/db/migrations')
const MODEL_URL = 'https://civitai.com/models/42?modelVersionId=7'
const SELECTED_FILE_URL = 'https://civitai.com/api/download/models/7?fileId=701'
const OTHER_FILE_URL = 'https://civitai.com/api/download/models/7?fileId=702'
const TOKEN = 'test-secret-token'
const PUBLIC_ADDRESSES = async () => ['1.1.1.1']

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function safeStorage(): SafeStorageAdapter {
  return {
    decryptStringAsync: async (ciphertext) => ({
      result: ciphertext.toString('utf8').slice('encrypted:'.length),
      shouldReEncrypt: false,
    }),
    encryptStringAsync: async (plainText) => Buffer.from(`encrypted:${plainText}`),
    getSelectedStorageBackend: () => 'gnome_libsecret',
    isAsyncEncryptionAvailable: async () => true,
  }
}

function civitaiApi(options: {
  family?: 'Anima' | 'Illustrious' | 'NoobAI' | 'SDXL 1.0'
  fileHash?: string
  fileSizeKB?: number | string | null
  fileUrl?: string
  includeThirdVersion?: boolean
  omitSecondPublishedAt?: boolean
  previewImageUrl?: string
  requests: { authorization: string | null; pathname: string }[]
  secondVersionHash?: string
  secondVersionPreviewImageUrl?: string
  secondVersionTrainedWords?: string[]
  type?: 'Checkpoint' | 'LORA' | 'TextualInversion' | 'Upscaler' | 'VAE'
}): typeof fetch {
  const family = options.family ?? 'Illustrious'
  const version = {
    baseModel: family,
    files: [
      {
        downloadUrl: options.fileUrl ?? SELECTED_FILE_URL,
        hashes: { SHA256: options.fileHash ?? 'a'.repeat(64) },
        id: 701,
        metadata: { format: 'SafeTensor' },
        name: 'selected.safetensors',
        primary: true,
        sizeKB: 'fileSizeKB' in options ? options.fileSizeKB : 1,
      },
      {
        downloadUrl: OTHER_FILE_URL,
        hashes: { SHA256: 'b'.repeat(64) },
        id: 702,
        name: 'other.safetensors',
        sizeKB: 2,
      },
    ],
    id: 7,
    images: options.previewImageUrl ? [{ url: options.previewImageUrl }] : [],
    modelId: 42,
    name: 'v1',
    trainedWords: ['portrait'],
  }
  const model = {
    creator: { username: 'artist' },
    id: 42,
    modelVersions: [
      { baseModel: family, id: 7, name: 'v1', publishedAt: '2025-01-01T00:00:00.000Z' },
      ...(options.includeThirdVersion
        ? [{ baseModel: family, id: 9, name: 'v3', publishedAt: '2025-03-01T00:00:00.000Z' }]
        : []),
      ...(options.secondVersionHash
        ? [
            {
              baseModel: family,
              id: 8,
              name: 'v2',
              publishedAt: options.omitSecondPublishedAt ? undefined : '2025-02-01T00:00:00.000Z',
            },
          ]
        : []),
    ],
    name: 'Portrait Model',
    type: options.type ?? 'Checkpoint',
  }
  return async (input, init) => {
    const url = new URL(String(input))
    options.requests.push({
      authorization: new Headers(init?.headers).get('Authorization'),
      pathname: url.pathname,
    })
    const files = version.files.map((file, index) =>
      index === 0 ? { ...file, sizeKB: 'fileSizeKB' in options ? options.fileSizeKB : 1 } : file,
    )
    const body =
      url.pathname === '/api/v1/models/42'
        ? model
        : url.pathname === '/api/v1/model-versions/8'
          ? {
              ...version,
              files: [
                {
                  ...files[0],
                  downloadUrl: 'https://civitai.com/api/download/models/8?fileId=801',
                  hashes: { SHA256: options.secondVersionHash },
                  id: 801,
                  name: 'new-version.safetensors',
                },
              ],
              id: 8,
              images: options.secondVersionPreviewImageUrl
                ? [{ url: options.secondVersionPreviewImageUrl }]
                : [],
              name: 'v2',
              trainedWords: options.secondVersionTrainedWords ?? ['portrait v2'],
            }
          : { ...version, files }
    return new Response(JSON.stringify(url.pathname === '/api/v1/me' ? { id: 1 } : body), {
      headers: { 'content-type': 'application/json' },
    })
  }
}

async function withModelHarness(
  api: typeof fetch,
  downloader: ModelDownloader,
  run: (harness: {
    coordinator: ModelInstallCoordinator
    databaseFile: string
    repository: ModelRepository
    root: string
    service: ModelService
  }) => Promise<void>,
  compatibilityManifest?: readonly CheckpointCompatibilityFingerprint[],
): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'igs-model-flow-'))
  const database = openAppDatabase(root, migrations)
  try {
    const repository = new ModelRepository(database.db)
    const service = new ModelService(
      repository,
      new CivitaiClient(api),
      new CivitaiTokenStore(safeStorage(), root),
      undefined,
      compatibilityManifest,
      async () => {}, // Install/identity tests use arbitrary small bytes; real preflight has its own tests.
    )
    const coordinator = new ModelInstallCoordinator(repository, service, downloader, root)
    await coordinator.initialize()
    await service.saveToken(TOKEN)
    await run({ coordinator, databaseFile: database.filePath, repository, root, service })
  } finally {
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
}

function selectedFilePreview(
  preview: ModelImportPreview,
): Extract<ModelImportPreview, { kind: 'select-file' }> {
  assert.equal(preview.kind, 'select-file')
  if (preview.kind !== 'select-file') {
    throw new Error('Expected a file preview')
  }
  return preview
}

async function waitForTerminalJob(
  coordinator: ModelInstallCoordinator,
  start: () => Promise<ModelInstallJobView>,
  expectedJobId?: string,
): Promise<ModelInstallJobView> {
  let complete!: (job: ModelInstallJobView) => void
  const terminal = new Promise<ModelInstallJobView>((resolve) => {
    complete = resolve
  })
  const unsubscribe = coordinator.onChanged((job) => {
    if (
      (!expectedJobId || job.id === expectedJobId) &&
      ['canceled', 'completed', 'failed'].includes(job.status)
    ) {
      complete(job)
    }
  })
  const timeout = setTimeout(
    () =>
      complete({
        bytesDownloaded: 0,
        error: { code: 'TEST_TIMEOUT', message: 'Install did not reach a terminal state' },
        id: 'timeout',
        modelName: '',
        status: 'failed',
        totalBytes: null,
        versionName: '',
      }),
    5000,
  )
  try {
    await start()
    const result = await terminal
    assert.notEqual(result.id, 'timeout', result.error?.message ?? '')
    return result
  } finally {
    clearTimeout(timeout)
    unsubscribe()
  }
}

// Production boundary: real API parsing -> service preview -> coordinator -> SQLite/filesystem.
// Remote API/download transports, OS secret-storage adapter and checkpoint qualification are fixtures.
// Neighboring control below changes only sizeKB; removing the coordinator guard must fail these.
for (const { label, sizeKB, type } of [
  { label: 'missing', sizeKB: undefined },
  { label: 'zero', sizeKB: 0 },
  { label: 'negative', sizeKB: -1 },
  { label: 'rounded to zero bytes', sizeKB: 0.000_01 },
  { label: 'unsafe byte count', sizeKB: Number.MAX_SAFE_INTEGER },
  { label: 'overflowed byte count', sizeKB: Number.MAX_VALUE },
  { label: 'LoRA missing', sizeKB: undefined, type: 'LORA' as const },
  { label: 'embedding missing', sizeKB: undefined, type: 'TextualInversion' as const },
  { label: 'VAE missing', sizeKB: undefined, type: 'VAE' as const },
  { label: 'upscaler missing', sizeKB: undefined, type: 'Upscaler' as const },
]) {
  test(`CivitAI ${label} size refuses installation before jobs, downloads or publication`, async () => {
    const bytes = Buffer.from('file that must never download without a known size')
    let downloadCount = 0
    const requests: { authorization: string | null; pathname: string }[] = []
    const downloader = new ModelDownloader({
      resolveAddresses: PUBLIC_ADDRESSES,
      transport: async () => {
        downloadCount++
        return new Response(bytes, {
          headers: { 'content-type': 'application/octet-stream' },
        })
      },
    })
    await withModelHarness(
      civitaiApi({ fileHash: sha256(bytes), fileSizeKB: sizeKB, requests, type }),
      downloader,
      async ({ coordinator, databaseFile, repository, root, service }) => {
        const preview = selectedFilePreview(await service.previewImport(MODEL_URL))
        assert.equal(preview.files[0]?.sizeEstimateBytes, null)
        assert.equal(preview.totalAdditionalBytes, null)
        await assert.rejects(
          waitForTerminalJob(coordinator, () =>
            coordinator.startInstall(preview.previewId, 701, false),
          ),
          {
            code: 'MODEL_SIZE_UNKNOWN',
            message: 'CivitAI must provide a valid download size before installation.',
          },
        )
        assert.equal(downloadCount, 0)
        assert.deepEqual(await coordinator.listJobs(), [])
        assert.deepEqual(await repository.listInstalled(), [])
        assert.deepEqual(await readdir(path.join(root, 'models')), ['.staging'])
        assert.deepEqual(await readdir(path.join(root, 'models', '.staging')), [])
        const stored = new Database(databaseFile, { readonly: true })
        try {
          for (const table of ['model_install_job', 'model_install_artifact', 'local_model_file']) {
            assert.equal(
              stored.prepare<[], { count: number }>(`SELECT COUNT(*) AS count FROM ${table}`).get()
                ?.count,
              0,
            )
          }
        } finally {
          stored.close()
        }
      },
    )
  })
}

for (const sizeKB of [null, '10.5']) {
  test(`malformed CivitAI size ${JSON.stringify(sizeKB)} rejects metadata without an install side effect`, async () => {
    let downloadCount = 0
    const requests: { authorization: string | null; pathname: string }[] = []
    await withModelHarness(
      civitaiApi({ fileSizeKB: sizeKB, requests }),
      new ModelDownloader({
        resolveAddresses: PUBLIC_ADDRESSES,
        transport: async () => {
          downloadCount++
          return new Response('unexpected download')
        },
      }),
      async ({ coordinator, repository, root, service }) => {
        await assert.rejects(service.previewImport(MODEL_URL), {
          code: 'CIVITAI_VERSION_MISMATCH',
        })
        assert.equal(downloadCount, 0)
        assert.deepEqual(await coordinator.listJobs(), [])
        assert.deepEqual(await repository.listInstalled(), [])
        assert.deepEqual(await readdir(path.join(root, 'models')), ['.staging'])
      },
    )
  })
}

test('CivitAI fractional size is displayed before install without becoming an exact byte integrity bound', async () => {
  const bytes = Buffer.from('valid bytes whose length differs from the rounded source estimate')
  const requests: { authorization: string | null; pathname: string }[] = []
  const estimate = Math.round(10.5001 * 1024)
  let downloadCount = 0
  await withModelHarness(
    civitaiApi({ fileHash: sha256(bytes), fileSizeKB: 10.5001, requests }),
    new ModelDownloader({
      resolveAddresses: PUBLIC_ADDRESSES,
      transport: async () => {
        downloadCount++
        return new Response(bytes, {
          headers: {
            'content-length': String(bytes.length),
            'content-type': 'application/octet-stream',
          },
        })
      },
    }),
    async ({ coordinator, repository, service }) => {
      const preview = selectedFilePreview(await service.previewImport(MODEL_URL))
      assert.equal(preview.files[0]?.sizeEstimateBytes, estimate)
      assert.equal(preview.totalAdditionalBytes, estimate)
      assert.notEqual(estimate, bytes.length)
      const job = await waitForTerminalJob(coordinator, () =>
        coordinator.startInstall(preview.previewId, 701, false),
      )
      assert.equal(job.status, 'completed', job.error?.message ?? '')
      assert.equal(downloadCount, 1)
      const installed = (await repository.listInstalled())[0]?.versions[0]?.file
      assert.equal(installed?.sizeBytes, bytes.length)
      assert.ok(installed)
      assert.deepEqual(await readFile(installed.managedPath), bytes)
      const artifact = (await repository.listInstallJobs())[0]?.artifacts[0]
      assert.equal(artifact?.expectedSizeBytes, null)
    },
  )
})

for (const action of ['repair', 'reuse'] as const) {
  test(`CivitAI ${action} can use known exact bytes when source size disappears`, async () => {
    const bytes = Buffer.from('known exact bytes retained independently from the source size')
    let downloadCount = 0
    const apiOptions: Parameters<typeof civitaiApi>[0] = {
      fileHash: sha256(bytes),
      fileSizeKB: 1,
      requests: [],
      secondVersionHash: sha256(bytes),
    }
    await withModelHarness(
      civitaiApi(apiOptions),
      new ModelDownloader({
        resolveAddresses: PUBLIC_ADDRESSES,
        transport: async () => {
          downloadCount++
          return new Response(bytes, {
            headers: { 'content-type': 'application/octet-stream' },
          })
        },
      }),
      async ({ coordinator, repository, service }) => {
        const firstPreview = selectedFilePreview(await service.previewImport(MODEL_URL))
        const firstJob = await waitForTerminalJob(coordinator, () =>
          coordinator.startInstall(firstPreview.previewId, 701, false),
        )
        assert.equal(firstJob.status, 'completed', firstJob.error?.message ?? '')
        const before = (await repository.listInstalled())[0]
        const originalVersion = before?.versions[0]
        assert.ok(originalVersion)
        if (action === 'repair') {
          await rm(originalVersion.file.managedPath)
        }
        apiOptions.fileSizeKB = undefined
        const preview = selectedFilePreview(
          await service.previewImport(
            action === 'repair' ? MODEL_URL : 'https://civitai.com/models/42?modelVersionId=8',
          ),
        )
        assert.equal(preview.files[0]?.sizeEstimateBytes, bytes.length)
        assert.equal(preview.files[0]?.needsRepair, action === 'repair')
        assert.equal(preview.files[0]?.reusesInstalledFile, action === 'reuse')
        assert.equal(preview.totalAdditionalBytes, action === 'repair' ? bytes.length : 0)
        const job = await waitForTerminalJob(coordinator, () =>
          coordinator.startInstall(preview.previewId, action === 'repair' ? 701 : 801, false),
        )
        assert.equal(job.status, 'completed', job.error?.message ?? '')
        assert.equal(downloadCount, action === 'repair' ? 2 : 1)
        const after = (await repository.listInstalled())[0]
        assert.equal(after?.id, before?.id)
        assert.equal(after?.defaultVersionId, before?.defaultVersionId)
        assert.equal(after?.versions.length, action === 'repair' ? 1 : 2)
        assert.equal(
          after?.versions.find((version) => version.civitaiVersionId === 7)?.id,
          originalVersion.id,
        )
        assert.deepEqual(await readFile(originalVersion.file.managedPath), bytes)
      },
    )
  })
}

test('missing-source-size reuse refuses a local file corrupted after preview before any new job or download', async () => {
  const bytes = Buffer.from('verified local file for reuse must be rechecked by the backend')
  let downloadCount = 0
  const apiOptions: Parameters<typeof civitaiApi>[0] = {
    fileHash: sha256(bytes),
    requests: [],
    secondVersionHash: sha256(bytes),
  }
  await withModelHarness(
    civitaiApi(apiOptions),
    new ModelDownloader({
      resolveAddresses: PUBLIC_ADDRESSES,
      transport: async () => {
        downloadCount++
        return new Response(bytes, {
          headers: { 'content-type': 'application/octet-stream' },
        })
      },
    }),
    async ({ coordinator, repository, service }) => {
      const firstPreview = selectedFilePreview(await service.previewImport(MODEL_URL))
      await waitForTerminalJob(coordinator, () =>
        coordinator.startInstall(firstPreview.previewId, 701, false),
      )
      apiOptions.fileSizeKB = undefined
      const preview = selectedFilePreview(
        await service.previewImport('https://civitai.com/models/42?modelVersionId=8'),
      )
      assert.equal(preview.files[0]?.reusesInstalledFile, true)
      const localFile = (await repository.listInstalled())[0]?.versions[0]?.file
      assert.ok(localFile)
      await writeFile(localFile.managedPath, Buffer.alloc(bytes.length, '!'))
      await assert.rejects(
        waitForTerminalJob(coordinator, () =>
          coordinator.startInstall(preview.previewId, 801, false),
        ),
        { code: 'MODEL_SIZE_UNKNOWN' },
      )
      assert.equal(downloadCount, 1)
      assert.equal((await coordinator.listJobs()).length, 1)
      assert.equal((await repository.listInstalled())[0]?.versions.length, 1)
      const corruptPreview = selectedFilePreview(
        await service.previewImport('https://civitai.com/models/42?modelVersionId=8'),
      )
      assert.equal(corruptPreview.files[0]?.reusesInstalledFile, false)
      assert.equal(corruptPreview.files[0]?.sizeEstimateBytes, null)
    },
  )
})

test('a queued reuse-only install refuses downloading if its verified local file disappears', async () => {
  const bytes = Buffer.from('verified local file for the queued reuse boundary')
  const apiOptions: Parameters<typeof civitaiApi>[0] = {
    fileHash: sha256(bytes),
    requests: [],
    secondVersionHash: sha256(bytes),
  }
  let releaseBlocker!: () => void
  let blockerStarted!: () => void
  const blocked = new Promise<void>((resolve) => {
    releaseBlocker = resolve
  })
  const downloadStarted = new Promise<void>((resolve) => {
    blockerStarted = resolve
  })
  const downloadedUrls: string[] = []
  await withModelHarness(
    civitaiApi(apiOptions),
    new ModelDownloader({
      resolveAddresses: PUBLIC_ADDRESSES,
      transport: async (input) => {
        const url = String(input)
        downloadedUrls.push(url)
        if (url === OTHER_FILE_URL) {
          blockerStarted()
          await blocked
        }
        return new Response(bytes, {
          headers: { 'content-type': 'application/octet-stream' },
        })
      },
    }),
    async ({ coordinator, repository, root, service }) => {
      const firstPreview = selectedFilePreview(await service.previewImport(MODEL_URL))
      const firstJob = await waitForTerminalJob(coordinator, () =>
        coordinator.startInstall(firstPreview.previewId, 701, false),
      )
      assert.equal(firstJob.status, 'completed', firstJob.error?.message ?? '')
      const localFile = (await repository.listInstalled())[0]?.versions[0]?.file
      assert.ok(localFile)
      apiOptions.fileSizeKB = undefined
      const preview = selectedFilePreview(
        await service.previewImport('https://civitai.com/models/42?modelVersionId=8'),
      )
      assert.equal(preview.files[0]?.reusesInstalledFile, true)
      assert.equal(preview.totalAdditionalBytes, 0)
      const blockerPreview = selectedFilePreview(await service.previewImport(MODEL_URL))
      await coordinator.startInstall(blockerPreview.previewId, 702, false)
      await downloadStarted
      const queuedJob = await coordinator.startInstall(preview.previewId, 801, false)
      assert.equal(queuedJob.status, 'waiting')
      await rm(localFile.managedPath)
      const finished = await waitForTerminalJob(
        coordinator,
        async () => {
          releaseBlocker()
          return queuedJob
        },
        queuedJob.id,
      )
      assert.equal(finished.status, 'failed')
      assert.equal(finished.error?.code, 'MODEL_SIZE_UNKNOWN')
      assert.deepEqual(downloadedUrls, [SELECTED_FILE_URL, OTHER_FILE_URL])
      assert.equal((await repository.listInstalled())[0]?.versions.length, 1)
      assert.deepEqual(await readdir(path.join(root, 'models', '.staging')), [])
    },
  )
})

test('exact preview file installs into managed storage, survives DB reopen, and never stores a token or URL', async () => {
  const bytes = Buffer.from('verified checkpoint content')
  const requests: { authorization: string | null; pathname: string }[] = []
  const downloadRequests: { authorization: string | null; url: string }[] = []
  const downloader = new ModelDownloader({
    resolveAddresses: PUBLIC_ADDRESSES,
    transport: async (url, init) => {
      downloadRequests.push({
        authorization: new Headers(init?.headers).get('Authorization'),
        url: String(url),
      })
      return new Response(bytes, {
        headers: {
          'content-length': String(bytes.length),
          'content-type': 'application/octet-stream',
        },
      })
    },
  })
  await withModelHarness(
    civitaiApi({ fileHash: sha256(bytes), requests }),
    downloader,
    async ({ coordinator, databaseFile, repository, root, service }) => {
      const preview = selectedFilePreview(await service.previewImport(MODEL_URL))
      assert.deepEqual(
        preview.files.map((file) => file.fileId),
        [701, 702],
      )
      assert.equal(preview.files[0]?.sha256, sha256(bytes))
      assert.doesNotMatch(JSON.stringify(preview), /test-secret-token|\/api\/download\/models\//)
      await assert.rejects(coordinator.startInstall(preview.previewId, 999, false), {
        code: 'MODEL_INVALID_FILE',
      })

      const job = await waitForTerminalJob(coordinator, () =>
        coordinator.startInstall(preview.previewId, 701, false),
      )
      assert.equal(job.status, 'completed', job.error?.message ?? '')
      assert.deepEqual(downloadRequests, [
        { authorization: `Bearer ${TOKEN}`, url: SELECTED_FILE_URL },
      ])
      assert.deepEqual(
        requests.map((request) => request.pathname),
        ['/api/v1/me', '/api/v1/models/42', '/api/v1/model-versions/7', '/api/v1/me'],
      )

      const installed = await repository.listInstalled()
      assert.equal(installed.length, 1)
      assert.equal(installed[0]?.source.kind, 'civitai')
      assert.equal(installed[0]?.versions[0]?.civitaiVersionId, 7)
      assert.equal(installed[0]?.versions[0]?.civitaiFileId, 701)
      assert.equal(installed[0]?.versions[0]?.file.status, 'ready')
      assert.equal(installed[0]?.versions[0]?.predictionType, null)
      assert.equal(installed[0]?.defaultVersionId, installed[0]?.versions[0]?.id)
      const managedFile = installed[0]?.versions[0]?.file.managedPath
      assert.ok(managedFile?.startsWith(path.join(root, 'models') + path.sep))
      assert.deepEqual(await readFile(managedFile), bytes)
      assert.equal((await stat(managedFile)).mode & 0o777, 0o600)
      assert.equal((await service.getCatalog())[0]?.versions[0]?.civitaiFileId, 701)

      const rawDatabase = new Database(databaseFile, { readonly: true })
      try {
        for (const table of [
          'model_resource',
          'model_resource_version',
          'local_model_file',
          'model_install_job',
          'model_install_artifact',
        ]) {
          const rows = rawDatabase.prepare(`SELECT * FROM ${table}`).all()
          assert.doesNotMatch(JSON.stringify(rows), /test-secret-token|\/api\/download\/models\//)
        }
      } finally {
        rawDatabase.close()
      }

      const reopened = openAppDatabase(root, migrations)
      try {
        const afterRestart = await new ModelRepository(reopened.db).listInstalled()
        assert.equal(afterRestart[0]?.versions[0]?.file.sha256, sha256(bytes))
        assert.deepEqual(afterRestart[0]?.versions[0]?.file.managedPath, managedFile)
      } finally {
        await reopened.close()
      }
    },
  )
})

test('CivitAI install stores manifest prediction only for the exact verified checkpoint bytes', async () => {
  const bytes = Buffer.from('verified manifest fixture checkpoint')
  const digest = sha256(bytes)
  const manifest: readonly CheckpointCompatibilityFingerprint[] = [
    {
      baseModelFamily: 'illustrious',
      predictionType: 'epsilon',
      sha256: digest,
      sizeBytes: bytes.length,
    },
  ]
  const downloader = new ModelDownloader({
    resolveAddresses: PUBLIC_ADDRESSES,
    transport: async () =>
      new Response(bytes, { headers: { 'content-type': 'application/octet-stream' } }),
  })
  await withModelHarness(
    civitaiApi({ fileHash: digest, requests: [] }),
    downloader,
    async ({ coordinator, repository, service }) => {
      const preview = selectedFilePreview(await service.previewImport(MODEL_URL))
      const job = await waitForTerminalJob(coordinator, () =>
        coordinator.startInstall(preview.previewId, 701, false),
      )
      assert.equal(job.status, 'completed', job.error?.message ?? '')
      const [resource] = await repository.listInstalled()
      const version = resource.versions[0]
      assert.equal(version.predictionType, 'epsilon')
      assert.equal(version.file.sha256, digest)
      const saved = await service.resolveGenerationCheckpoint(resource.id, version.id)
      const planned = await service.resolveVerifiedGenerationCheckpointForPlan({
        ...saved,
        predictionType: null,
      })
      assert.equal(planned.reference.predictionType, 'epsilon')
    },
    manifest,
  )
})

test('a newer CivitAI version installs beside the first and changes default only on explicit selection', async () => {
  const firstBytes = Buffer.from('first checkpoint version')
  const secondBytes = Buffer.from('second checkpoint version')
  const firstImageUrl = 'https://image.civitai.com/first-exact-version.png'
  const secondImageUrl = 'https://image.civitai.com/second-exact-version.png'
  const requests: { authorization: string | null; pathname: string }[] = []
  const downloader = new ModelDownloader({
    resolveAddresses: PUBLIC_ADDRESSES,
    transport: async (url) =>
      new Response(String(url).includes('/models/8?') ? secondBytes : firstBytes, {
        headers: { 'content-type': 'application/octet-stream' },
      }),
  })
  await withModelHarness(
    civitaiApi({
      fileHash: sha256(firstBytes),
      previewImageUrl: firstImageUrl,
      requests,
      secondVersionHash: sha256(secondBytes),
      secondVersionPreviewImageUrl: secondImageUrl,
      secondVersionTrainedWords: ['cinematic light', 'portrait v2'],
    }),
    downloader,
    async ({ coordinator, repository, root, service }) => {
      const choices = await service.previewImport('https://civitai.com/models/42')
      assert.equal(choices.kind, 'select-version')
      if (choices.kind === 'select-version') {
        assert.deepEqual(
          choices.versions.map((version) => version.id),
          [7, 8],
        )
      }
      const firstPreview = selectedFilePreview(await service.previewImport(MODEL_URL))
      assert.equal(firstPreview.previewImageDataUrl, null)
      const firstJob = await waitForTerminalJob(coordinator, () =>
        coordinator.startInstall(firstPreview.previewId, 701, false),
      )
      assert.equal(firstJob.status, 'completed')
      assert.equal(
        (await repository.listInstalled())[0]?.versions[0]?.sourceMetadata['previewImageUrl'],
        firstImageUrl,
      )
      assert.deepEqual((await service.checkUpdates(42)).availableVersions, [{ id: 8, name: 'v2' }])

      const secondPreview = selectedFilePreview(
        await service.previewImport('https://civitai.com/models/42?modelVersionId=8'),
      )
      assert.equal(secondPreview.previewImageDataUrl, null)
      const secondJob = await waitForTerminalJob(coordinator, () =>
        coordinator.startInstall(secondPreview.previewId, 801, false),
      )
      assert.equal(secondJob.status, 'completed')
      const installed = await repository.listInstalled()
      assert.equal(installed.length, 1)
      const resource = installed[0]
      assert.deepEqual(
        resource.versions.map((version) => version.civitaiVersionId),
        [7, 8],
      )
      const firstVersion = resource.versions.find((version) => version.civitaiVersionId === 7)!
      const secondVersion = resource.versions.find((version) => version.civitaiVersionId === 8)!
      assert.equal(resource.defaultVersionId, firstVersion.id)
      assert.equal(resource.previewUrl, secondImageUrl)
      assert.equal(firstVersion.sourceMetadata['previewImageUrl'], firstImageUrl)
      assert.equal(secondVersion.sourceMetadata['previewImageUrl'], secondImageUrl)
      assert.ok(requests.every((request) => request.pathname.startsWith('/api/v1/')))
      assert.deepEqual((await service.getCatalog())[0]?.trainedWords, ['portrait'])
      const exactVersionTriggers = (await service.getCatalog())[0]?.versions
      assert.deepEqual(
        exactVersionTriggers?.find((version) => version.id === firstVersion.id)?.trainedWords,
        ['portrait'],
      )
      assert.deepEqual(
        exactVersionTriggers?.find((version) => version.id === secondVersion.id)?.trainedWords,
        ['cinematic light', 'portrait v2'],
      )
      assert.deepEqual(await readFile(firstVersion.file.managedPath), firstBytes)
      assert.deepEqual(await readFile(secondVersion.file.managedPath), secondBytes)
      assert.deepEqual((await service.checkUpdates(42)).availableVersions, [])

      await service.setDefaultVersion(resource.id, secondVersion.id)
      assert.deepEqual((await service.getCatalog())[0]?.trainedWords, [
        'cinematic light',
        'portrait v2',
      ])
      const reopened = openAppDatabase(root, migrations)
      try {
        const afterRestart = (await new ModelRepository(reopened.db).listInstalled())[0]
        assert.equal(afterRestart?.defaultVersionId, secondVersion.id)
        assert.deepEqual(
          afterRestart?.versions.map((version) => version.id),
          [firstVersion.id, secondVersion.id],
        )
        assert.deepEqual(
          afterRestart?.versions.map((version) => version.sourceMetadata['previewImageUrl']),
          [firstImageUrl, secondImageUrl],
        )
      } finally {
        await reopened.close()
      }
    },
  )
})

test('update check ignores older uninstalled versions and finds only later published versions', async () => {
  const bytes = Buffer.from('installed second version')
  const requests: { authorization: string | null; pathname: string }[] = []
  const downloader = new ModelDownloader({
    resolveAddresses: PUBLIC_ADDRESSES,
    transport: async () =>
      new Response(bytes, { headers: { 'content-type': 'application/octet-stream' } }),
  })
  await withModelHarness(
    civitaiApi({
      fileHash: sha256(Buffer.from('older first version')),
      includeThirdVersion: true,
      requests,
      secondVersionHash: sha256(bytes),
    }),
    downloader,
    async ({ coordinator, service }) => {
      const secondPreview = selectedFilePreview(
        await service.previewImport('https://civitai.com/models/42?modelVersionId=8'),
      )
      const job = await waitForTerminalJob(coordinator, () =>
        coordinator.startInstall(secondPreview.previewId, 801, false),
      )
      assert.equal(job.status, 'completed', job.error?.message ?? '')
      assert.deepEqual((await service.checkUpdates(42)).availableVersions, [{ id: 9, name: 'v3' }])
    },
  )
})

test('update check fails closed when the installed version has no publication date', async () => {
  const bytes = Buffer.from('installed second version without release date')
  const requests: { authorization: string | null; pathname: string }[] = []
  const downloader = new ModelDownloader({
    resolveAddresses: PUBLIC_ADDRESSES,
    transport: async () =>
      new Response(bytes, { headers: { 'content-type': 'application/octet-stream' } }),
  })
  await withModelHarness(
    civitaiApi({
      includeThirdVersion: true,
      omitSecondPublishedAt: true,
      requests,
      secondVersionHash: sha256(bytes),
    }),
    downloader,
    async ({ coordinator, service }) => {
      const secondPreview = selectedFilePreview(
        await service.previewImport('https://civitai.com/models/42?modelVersionId=8'),
      )
      const job = await waitForTerminalJob(coordinator, () =>
        coordinator.startInstall(secondPreview.previewId, 801, false),
      )
      assert.equal(job.status, 'completed', job.error?.message ?? '')
      await assert.rejects(service.checkUpdates(42), { code: 'CIVITAI_VERSION_DATE_UNKNOWN' })
    },
  )
})

test('setDefaultVersion rejects a same-size corrupted candidate without changing the existing default', async () => {
  const firstBytes = Buffer.from('first verified checkpoint')
  const secondBytes = Buffer.from('second verified checkpoint')
  const requests: { authorization: string | null; pathname: string }[] = []
  const downloader = new ModelDownloader({
    resolveAddresses: PUBLIC_ADDRESSES,
    transport: async (url) =>
      new Response(String(url).includes('/models/8?') ? secondBytes : firstBytes, {
        headers: { 'content-type': 'application/octet-stream' },
      }),
  })
  await withModelHarness(
    civitaiApi({
      fileHash: sha256(firstBytes),
      requests,
      secondVersionHash: sha256(secondBytes),
    }),
    downloader,
    async ({ coordinator, repository, service }) => {
      const firstPreview = selectedFilePreview(await service.previewImport(MODEL_URL))
      assert.equal(
        (
          await waitForTerminalJob(coordinator, () =>
            coordinator.startInstall(firstPreview.previewId, 701, false),
          )
        ).status,
        'completed',
      )
      const secondPreview = selectedFilePreview(
        await service.previewImport('https://civitai.com/models/42?modelVersionId=8'),
      )
      assert.equal(
        (
          await waitForTerminalJob(coordinator, () =>
            coordinator.startInstall(secondPreview.previewId, 801, false),
          )
        ).status,
        'completed',
      )
      const resource = (await repository.listInstalled())[0]
      assert.ok(resource)
      const first = resource.versions.find((version) => version.civitaiVersionId === 7)
      const second = resource.versions.find((version) => version.civitaiVersionId === 8)
      assert.ok(first)
      assert.ok(second)
      assert.equal(resource.defaultVersionId, first.id)

      await writeFile(second.file.managedPath, Buffer.alloc(secondBytes.length, 0x58))
      assert.equal((await stat(second.file.managedPath)).size, secondBytes.length)
      await assert.rejects(service.setDefaultVersion(resource.id, second.id), {
        code: 'MODEL_VERSION_UNAVAILABLE',
      })
      assert.equal((await repository.listInstalled())[0]?.defaultVersionId, first.id)

      await service.setDefaultVersion(resource.id, first.id)
      assert.equal((await repository.listInstalled())[0]?.defaultVersionId, first.id)
      await writeFile(second.file.managedPath, secondBytes)
      await service.setDefaultVersion(resource.id, second.id)
      assert.equal((await repository.listInstalled())[0]?.defaultVersionId, second.id)
    },
  )
})

test('a second version with identical verified bytes reuses the managed file without downloading again', async () => {
  const bytes = Buffer.from('shared checkpoint bytes for two versions')
  const downloads: string[] = []
  const requests: { authorization: string | null; pathname: string }[] = []
  const downloader = new ModelDownloader({
    resolveAddresses: PUBLIC_ADDRESSES,
    transport: async (url) => {
      downloads.push(String(url))
      return new Response(bytes, {
        headers: { 'content-type': 'application/octet-stream' },
      })
    },
  })
  await withModelHarness(
    civitaiApi({
      fileHash: sha256(bytes),
      requests,
      secondVersionHash: sha256(bytes),
    }),
    downloader,
    async ({ coordinator, repository, root, service }) => {
      const firstPreview = selectedFilePreview(await service.previewImport(MODEL_URL))
      const firstJob = await waitForTerminalJob(coordinator, () =>
        coordinator.startInstall(firstPreview.previewId, 701, false),
      )
      assert.equal(firstJob.status, 'completed', firstJob.error?.message ?? '')
      const initial = (await repository.listInstalled())[0]
      assert.ok(initial)
      const firstVersionId = initial.versions[0]?.id
      const initialDefaultId = initial.defaultVersionId
      assert.ok(firstVersionId)
      assert.equal(initialDefaultId, firstVersionId)

      const secondPreview = selectedFilePreview(
        await service.previewImport('https://civitai.com/models/42?modelVersionId=8'),
      )
      assert.equal(secondPreview.files[0]?.alreadyInstalled, false)
      assert.equal(secondPreview.files[0]?.reusesInstalledFile, true)
      assert.equal(secondPreview.totalAdditionalBytes, 0)
      const secondJob = await waitForTerminalJob(coordinator, () =>
        coordinator.startInstall(secondPreview.previewId, 801, false),
      )
      assert.equal(secondJob.status, 'completed', secondJob.error?.message ?? '')
      assert.deepEqual(downloads, [SELECTED_FILE_URL])

      const resources = await repository.listInstalled()
      assert.equal(resources.length, 1)
      const resource = resources[0]
      assert.equal(resource.versions.length, 2)
      assert.equal(resource.defaultVersionId, initialDefaultId)
      const first = resource.versions.find((version) => version.civitaiVersionId === 7)
      const second = resource.versions.find((version) => version.civitaiVersionId === 8)
      assert.ok(first)
      assert.ok(second)
      assert.notEqual(first.id, second.id)
      assert.notEqual(first.file.id, second.file.id)
      assert.equal(first.file.managedPath, second.file.managedPath)
      assert.deepEqual(await readFile(first.file.managedPath), bytes)

      const reopened = openAppDatabase(root, migrations)
      try {
        const persisted = (await new ModelRepository(reopened.db).listInstalled())[0]
        assert.equal(persisted?.defaultVersionId, firstVersionId)
        assert.deepEqual(
          persisted?.versions.map((version) => version.civitaiVersionId),
          [7, 8],
        )
      } finally {
        await reopened.close()
      }
    },
  )
})

test('storage summary counts shared model bytes once, includes managed dependencies, and excludes missing files', async () => {
  const requests: { authorization: string | null; pathname: string }[] = []
  const downloader = new ModelDownloader({ resolveAddresses: PUBLIC_ADDRESSES })
  await withModelHarness(
    civitaiApi({ requests }),
    downloader,
    async ({ repository, root, service }) => {
      const sharedBytes = Buffer.from('same checkpoint bytes registered for two source versions')
      const companionBytes = Buffer.from('managed Anima encoder bytes')
      const missingBytes = Buffer.from('model bytes that will be removed')
      const sharedPath = path.join(root, 'models', 'shared.safetensors')
      const companionPath = path.join(root, 'models', 'encoder.safetensors')
      const missingPath = path.join(root, 'models', 'missing.safetensors')
      await Promise.all([
        writeFile(sharedPath, sharedBytes),
        writeFile(companionPath, companionBytes),
        writeFile(missingPath, missingBytes),
      ])
      const verifiedAt = '2026-09-25T12:00:00.000Z'
      const checkpoint = (
        versionId: number,
        fileId: number,
        filePath: string,
        bytes: Buffer,
      ): VerifiedModelArtifact => ({
        file: {
          managedPath: filePath,
          originalFilename: path.basename(filePath),
          sha256: sha256(bytes),
          sizeBytes: bytes.length,
          verifiedAt,
        },
        resource: {
          displayName: 'Shared checkpoint',
          source: { kind: 'civitai', modelId: 42 },
          sourceMetadata: {},
          type: 'checkpoint',
        },
        version: {
          baseModelFamily: 'illustrious',
          format: 'SafeTensor',
          name: `v${versionId}`,
          source: {
            expectedSha256: sha256(bytes),
            fileId,
            kind: 'civitai',
            versionId,
          },
          sourceMetadata: {},
        },
      })
      assert.deepEqual(await service.getStorageSummary(), { totalBytes: 0 })

      await repository.publishVerifiedInstallation({
        primary: checkpoint(7, 701, sharedPath, sharedBytes),
      })
      assert.deepEqual(await service.getStorageSummary(), { totalBytes: sharedBytes.length })
      await repository.publishVerifiedInstallation({
        primary: checkpoint(8, 801, sharedPath, sharedBytes),
      })
      assert.deepEqual(await service.getStorageSummary(), { totalBytes: sharedBytes.length })

      await repository.publishVerifiedInstallation({
        primary: {
          file: {
            managedPath: companionPath,
            originalFilename: 'encoder.safetensors',
            sha256: sha256(companionBytes),
            sizeBytes: companionBytes.length,
            verifiedAt,
          },
          resource: {
            displayName: 'Anima encoder',
            source: { key: 'anima/qwen3-test', kind: 'supported_dependency' },
            sourceMetadata: {},
            type: 'qwen3_encoder',
          },
          version: {
            baseModelFamily: 'anima',
            format: 'SafeTensor',
            name: 'test revision',
            source: {
              expectedSha256: sha256(companionBytes),
              kind: 'supported_dependency',
              revision: 'test-revision',
            },
            sourceMetadata: {},
          },
        },
      })
      assert.deepEqual(await service.getStorageSummary(), {
        totalBytes: sharedBytes.length + companionBytes.length,
      })

      await repository.publishVerifiedInstallation({
        primary: checkpoint(9, 901, missingPath, missingBytes),
      })
      assert.deepEqual(await service.getStorageSummary(), {
        totalBytes: sharedBytes.length + companionBytes.length + missingBytes.length,
      })
      await rm(missingPath)
      assert.deepEqual(await service.getStorageSummary(), {
        totalBytes: sharedBytes.length + companionBytes.length,
      })
    },
  )
})

// Actual CivitAI parser -> service -> coordinator -> managed bytes/SQLite -> repair and reopen.
// The external source/download, secret store and ML qualification are fixtures; no inference runs.
for (const family of ['Illustrious', 'NoobAI'] as const) {
  test(`${family} missing-file repair preserves exact source identity, default and prediction override`, async () => {
    const bytes = Buffer.from('checkpoint bytes to restore after deletion')
    let downloadCount = 0
    const requests: { authorization: string | null; pathname: string }[] = []
    const downloader = new ModelDownloader({
      resolveAddresses: PUBLIC_ADDRESSES,
      transport: async () => {
        downloadCount++
        return new Response(bytes, {
          headers: { 'content-type': 'application/octet-stream' },
        })
      },
    })
    await withModelHarness(
      civitaiApi({ family, fileHash: sha256(bytes), requests }),
      downloader,
      async ({ coordinator, repository, root, service }) => {
        const firstPreview = selectedFilePreview(await service.previewImport(MODEL_URL))
        assert.equal(firstPreview.baseModel, family)
        assert.equal(firstPreview.baseModelFamily, 'illustrious')
        const firstJob = await waitForTerminalJob(coordinator, () =>
          coordinator.startInstall(firstPreview.previewId, 701, false),
        )
        assert.equal(firstJob.status, 'completed', firstJob.error?.message ?? '')
        const before = (await repository.listInstalled())[0]
        assert.ok(before)
        const originalVersion = before.versions[0]
        assert.ok(originalVersion)
        assert.equal(originalVersion.baseModelFamily, 'illustrious')
        assert.equal(originalVersion.sourceMetadata['baseModel'], family)
        assert.equal(originalVersion.predictionType, null)
        assert.equal(
          (await service.resolveGenerationCheckpoint(before.id, originalVersion.id)).predictionType,
          'epsilon',
        )
        await service.setPredictionType(before.id, originalVersion.id, 'v_prediction')
        const reference = await service.resolveGenerationCheckpoint(before.id, originalVersion.id)
        assert.equal(reference.predictionType, 'v_prediction')
        await rm(originalVersion.file.managedPath)

        const repairPreview = selectedFilePreview(await service.previewImport(MODEL_URL))
        assert.equal(repairPreview.baseModel, family)
        assert.equal(repairPreview.baseModelFamily, 'illustrious')
        assert.equal(repairPreview.files[0]?.alreadyInstalled, false)
        assert.equal(repairPreview.files[0]?.needsRepair, true)
        assert.equal(repairPreview.files[0]?.reusesInstalledFile, false)
        const repairedJob = await waitForTerminalJob(coordinator, () =>
          coordinator.startInstall(repairPreview.previewId, 701, false),
        )
        assert.equal(repairedJob.status, 'completed', repairedJob.error?.message ?? '')
        assert.equal(downloadCount, 2)

        const after = (await repository.listInstalled())[0]
        assert.ok(after)
        assert.equal(after.id, before.id)
        assert.equal(after.defaultVersionId, before.defaultVersionId)
        assert.equal(after.versions.length, 1)
        assert.equal(after.versions[0]?.id, originalVersion.id)
        assert.equal(after.versions[0]?.file.id, originalVersion.file.id)
        assert.equal(after.versions[0]?.file.managedPath, originalVersion.file.managedPath)
        assert.equal(after.versions[0]?.baseModelFamily, 'illustrious')
        assert.equal(after.versions[0]?.sourceMetadata['baseModel'], family)
        assert.equal(after.versions[0]?.civitaiVersionId, 7)
        assert.equal(after.versions[0]?.civitaiFileId, 701)
        assert.equal(after.versions[0]?.file.sha256, sha256(bytes))
        assert.deepEqual(await readFile(originalVersion.file.managedPath), bytes)
        assert.equal((await service.getCatalog())[0]?.versions[0]?.fileStatus, 'ready')
        assert.deepEqual(
          await service.resolveGenerationCheckpoint(before.id, originalVersion.id),
          reference,
        )

        const reopened = openAppDatabase(root, migrations)
        try {
          const reopenedRepository = new ModelRepository(reopened.db)
          const [persisted] = await reopenedRepository.listInstalled()
          assert.ok(persisted)
          assert.equal(persisted.id, before.id)
          assert.equal(persisted.defaultVersionId, before.defaultVersionId)
          assert.equal(persisted.versions.length, 1)
          const restored = persisted.versions[0]
          assert.ok(restored)
          assert.equal(restored.id, originalVersion.id)
          assert.equal(restored.baseModelFamily, 'illustrious')
          assert.deepEqual(restored.sourceMetadata, originalVersion.sourceMetadata)
          assert.equal(restored.civitaiVersionId, 7)
          assert.equal(restored.civitaiFileId, 701)
          assert.equal(restored.file.id, originalVersion.file.id)
          assert.equal(restored.file.sha256, sha256(bytes))
          assert.equal(restored.file.sizeBytes, bytes.length)
          assert.equal(
            await reopenedRepository.getPredictionOverride(restored.file),
            'v_prediction',
          )
          assert.deepEqual(await readFile(restored.file.managedPath), bytes)
        } finally {
          await reopened.close()
        }
      },
    )
  })
}

// Actual source parser -> controlled HTTP -> installer/SQLite -> real Main component qualifiers.
// Finite ordinary LoRA and dual-CLIP tensors / VAE anchors are header-compatible preflight fixtures;
// they are not trained components or complete ML models, and no inference runs in these tests.
for (const component of [
  {
    errorCode: 'MODEL_LORA_INCOMPATIBLE',
    healthy: () => illustriousLoraFixture(),
    invalid: () => {
      const bytes = illustriousLoraFixture()
      const headerLength = Number(bytes.readBigUInt64LE())
      const header = bytes.subarray(8, 8 + headerLength).toString('utf8')
      // Keep ranks, values and offsets; only the pinned module target changes.
      assert.match(header, /down_blocks_1/)
      Buffer.from(header.replaceAll('down_blocks_1', 'down_blocks_9')).copy(bytes, 8)
      return bytes
    },
    kind: 'lora',
    sourceType: 'LORA',
  },
  {
    errorCode: 'MODEL_EMBEDDING_INCOMPATIBLE',
    healthy: () => illustriousEmbeddingFixture(),
    invalid: () => {
      const bytes = illustriousEmbeddingFixture()
      const headerLength = Number(bytes.readBigUInt64LE())
      const header = JSON.parse(bytes.subarray(8, 8 + headerLength).toString('utf8')) as Record<
        string,
        { data_offsets: [number, number]; dtype: string; shape: number[] }
      >
      const clipG = header.clip_g
      const extraVector = bytes.subarray(
        8 + headerLength + clipG.data_offsets[0],
        8 + headerLength + clipG.data_offsets[1],
      )
      // Keep both encoder widths/dtypes and contiguous complete ranges; only paired count differs.
      clipG.shape[0] = 2
      clipG.data_offsets[1] += extraVector.length
      const json = Buffer.from(JSON.stringify(header))
      const padded = Buffer.concat([json, Buffer.alloc((8 - (json.length % 8)) % 8, 0x20)])
      const prefix = Buffer.alloc(8)
      prefix.writeBigUInt64LE(BigInt(padded.length))
      return Buffer.concat([prefix, padded, bytes.subarray(8 + headerLength), extraVector])
    },
    kind: 'embedding',
    sourceType: 'TextualInversion',
  },
  {
    errorCode: 'MODEL_VAE_INCOMPATIBLE',
    healthy: () => illustriousVaeFixture('diffusers'),
    invalid: () =>
      illustriousVaeFixture('diffusers', (header) => {
        header['quant_conv.bias'] = header['quant_conv.weight']
        delete header['quant_conv.weight']
      }),
    kind: 'vae',
    sourceType: 'VAE',
  },
] as const) {
  test(`NoobAI ${component.kind} source install, real Prepare qualifier, exact repair and reopen preserve component identity`, async () => {
    const bytes = component.healthy()
    const invalidBytes = component.invalid()
    const requests: { authorization: string | null; pathname: string }[] = []
    const downloads: { authorization: string | null; url: string }[] = []
    await withModelHarness(
      civitaiApi({
        family: 'NoobAI',
        fileHash: sha256(bytes),
        fileSizeKB: bytes.length / 1024,
        requests,
        secondVersionHash: sha256(invalidBytes),
        secondVersionTrainedWords: ['source version two'],
        type: component.sourceType,
      }),
      new ModelDownloader({
        resolveAddresses: PUBLIC_ADDRESSES,
        transport: async (url, init) => {
          downloads.push({
            authorization: new Headers(init?.headers).get('Authorization'),
            url: String(url),
          })
          return new Response(
            new Uint8Array(String(url).includes('/models/8?') ? invalidBytes : bytes),
            { headers: { 'content-type': 'application/octet-stream' } },
          )
        },
      }),
      async ({ coordinator, repository, root, service }) => {
        type Reference = Awaited<ReturnType<ModelService['resolveGenerationLora']>>
        const selectExact = async (
          owner: ModelService,
          resourceId: string,
          versionId: string,
          token: string,
        ): Promise<Reference> => {
          if (component.kind === 'lora') {
            return owner.resolveGenerationLora(resourceId, versionId)
          }
          if (component.kind === 'vae') {
            return owner.resolveGenerationVae(resourceId, versionId)
          }
          const authored = await owner.resolveGenerationPromptEmbeddings({
            modelFamily: 'illustrious',
            prompt: { embeddingRefs: [], text: '' },
            selection: { resourceId, token, versionId },
            text: `a red ceramic cup, ${token}`,
          })
          assert.equal(authored.embeddingRefs.length, 1)
          assert.equal(authored.embeddingRefs[0].token, token)
          return authored.embeddingRefs[0].resource
        }
        const prepare = (owner: ModelService, saved: Reference) =>
          component.kind === 'lora'
            ? owner.resolveVerifiedGenerationLoraForPlan(saved)
            : component.kind === 'vae'
              ? owner.resolveVerifiedGenerationVaeForPlan(saved)
              : owner.resolveVerifiedGenerationEmbeddingForPlan(saved)

        const preview = selectedFilePreview(await service.previewImport(MODEL_URL))
        assert.equal(preview.resourceType, component.kind)
        assert.equal(preview.baseModel, 'NoobAI')
        assert.equal(preview.baseModelFamily, 'illustrious')
        assert.equal('companions' in preview, false)
        const installed = await waitForTerminalJob(coordinator, () =>
          coordinator.startInstall(preview.previewId, 701, false),
        )
        assert.equal(installed.status, 'completed', installed.error?.message ?? '')
        const firstInstalled = await repository.listInstalled()
        assert.equal(firstInstalled.length, 1)
        const [resource] = firstInstalled
        assert.equal(resource.versions.length, 1)
        const first = resource.versions[0]
        assert.equal(resource.type, component.kind)
        assert.deepEqual(resource.source, { kind: 'civitai', modelId: 42 })
        assert.equal(resource.defaultVersionId, first.id)
        assert.equal(first.civitaiVersionId, 7)
        assert.equal(first.civitaiFileId, 701)
        assert.equal(first.predictionType, null)
        assert.deepEqual(first.sourceMetadata, {
          baseModel: 'NoobAI',
          previewImageUrl: null,
          trainedWords: ['portrait'],
        })
        assert.ok(first.file.managedPath.startsWith(path.join(root, 'models') + path.sep))
        assert.equal(first.file.sha256, sha256(bytes))
        assert.equal(first.file.sizeBytes, bytes.length)
        assert.deepEqual(await readFile(first.file.managedPath), bytes)
        const selected = await selectExact(service, resource.id, first.id, '<selected>')
        assert.deepEqual(selected, {
          baseModelFamily: 'illustrious',
          civitaiFileId: 701,
          civitaiModelId: 42,
          civitaiVersionId: 7,
          displayName: 'Portrait Model',
          fileSha256: sha256(bytes),
          kind: component.kind,
          localModelId: resource.id,
          localVersionId: first.id,
          predictionType: null,
          versionName: 'v1',
        })
        const saved = {
          ...selected,
          displayName: 'Copied Project component',
          versionName: 'Copied v1',
        }
        const healthy = await prepare(service, saved)
        assert.equal(healthy.byteSize, bytes.length)
        assert.equal(healthy.managedPath, first.file.managedPath)
        assert.deepEqual(healthy.reference, saved)
        assert.notEqual(healthy.reference, saved)

        // Source applicability and verified installation deliberately do not imply Prepare support.
        const laterPreview = selectedFilePreview(
          await service.previewImport('https://civitai.com/models/42?modelVersionId=8'),
        )
        const laterInstall = await waitForTerminalJob(coordinator, () =>
          coordinator.startInstall(laterPreview.previewId, 801, false),
        )
        assert.equal(laterInstall.status, 'completed', laterInstall.error?.message ?? '')
        const afterVersionInstalled = await repository.listInstalled()
        assert.equal(afterVersionInstalled.length, 1)
        const [afterVersion] = afterVersionInstalled
        assert.equal(afterVersion.versions.length, 2)
        assert.equal(afterVersion.id, resource.id)
        assert.equal(afterVersion.defaultVersionId, first.id)
        const later = afterVersion.versions.find((item) => item.civitaiVersionId === 8)
        assert.ok(later)
        assert.equal(later.civitaiFileId, 801)
        assert.equal(later.predictionType, null)
        assert.deepEqual(later.sourceMetadata, {
          baseModel: 'NoobAI',
          previewImageUrl: null,
          trainedWords: ['source version two'],
        })
        const invalid = await selectExact(service, resource.id, later.id, '<new-version>')
        assert.equal(invalid.fileSha256, sha256(invalidBytes))
        assert.deepEqual(await readFile(later.file.managedPath), invalidBytes)
        await assert.rejects(prepare(service, invalid), { code: component.errorCode })
        await service.setDefaultVersion(resource.id, later.id)
        const afterDefaultInstalled = await repository.listInstalled()
        assert.equal(afterDefaultInstalled.length, 1)
        assert.equal(afterDefaultInstalled[0].versions.length, 2)
        assert.equal(afterDefaultInstalled[0].defaultVersionId, later.id)
        assert.deepEqual(await prepare(service, saved), healthy)
        for (const change of [
          { civitaiModelId: 43 },
          { civitaiVersionId: 8 },
          { civitaiFileId: 801 },
          { fileSha256: sha256(invalidBytes) },
          { localVersionId: later.id },
        ]) {
          await assert.rejects(prepare(service, { ...saved, ...change }), {
            code: 'MODEL_VERSION_MISMATCH',
          })
        }

        await rm(first.file.managedPath)
        await assert.rejects(prepare(service, saved), { code: 'MODEL_FILE_MISSING' })
        const repairPreview = selectedFilePreview(await service.previewImport(MODEL_URL))
        assert.equal(repairPreview.files[0]?.needsRepair, true)
        const repaired = await waitForTerminalJob(coordinator, () =>
          coordinator.startInstall(repairPreview.previewId, 701, false),
        )
        assert.equal(repaired.status, 'completed', repaired.error?.message ?? '')
        const afterRepairInstalled = await repository.listInstalled()
        assert.equal(afterRepairInstalled.length, 1)
        assert.equal(afterRepairInstalled[0].versions.length, 2)
        assert.equal(afterRepairInstalled[0].defaultVersionId, later.id)
        assert.deepEqual(await prepare(service, saved), healthy)
        assert.deepEqual(downloads, [
          { authorization: `Bearer ${TOKEN}`, url: SELECTED_FILE_URL },
          {
            authorization: `Bearer ${TOKEN}`,
            url: 'https://civitai.com/api/download/models/8?fileId=801',
          },
          { authorization: `Bearer ${TOKEN}`, url: SELECTED_FILE_URL },
        ])
        assert.ok(requests.every((request) => request.authorization === `Bearer ${TOKEN}`))

        const reopened = openAppDatabase(root, migrations)
        try {
          const freshRepository = new ModelRepository(reopened.db)
          const reopenedInstalled = await freshRepository.listInstalled()
          assert.equal(reopenedInstalled.length, 1)
          const [persisted] = reopenedInstalled
          assert.equal(persisted.id, resource.id)
          assert.equal(persisted.type, component.kind)
          assert.equal(persisted.defaultVersionId, later.id)
          assert.equal(persisted.versions.length, 2)
          const restored = persisted.versions.find((item) => item.id === first.id)
          assert.ok(restored)
          assert.equal(restored.file.id, first.file.id)
          assert.equal(restored.file.managedPath, first.file.managedPath)
          assert.equal(restored.file.sha256, first.file.sha256)
          assert.equal(restored.file.sizeBytes, bytes.length)
          assert.equal(restored.civitaiVersionId, 7)
          assert.equal(restored.civitaiFileId, 701)
          assert.equal(restored.predictionType, null)
          assert.deepEqual(restored.sourceMetadata, first.sourceMetadata)
          const fresh = new ModelService(freshRepository, service.civitai, service.tokenStore)
          assert.deepEqual(await prepare(fresh, saved), healthy)
          await assert.rejects(prepare(fresh, invalid), { code: component.errorCode })
        } finally {
          await reopened.close()
        }
      },
    )
  })
}

// Boundary: actual import parser -> install/repair coordinator -> SQLite/managed bytes -> exact resolver.
// Small integrity fixtures are deliberately not ML-loadable VAEs; no inference is exercised here.
for (const family of ['Illustrious', 'SDXL 1.0'] as const) {
  test(`standalone VAE ${family} install, side-by-side default and exact repair preserve source identity after reopen`, async () => {
    const bytes = Buffer.from('external VAE integrity fixture version one')
    const newerBytes = Buffer.from('external VAE integrity fixture version two')
    const requests: { authorization: string | null; pathname: string }[] = []
    let downloadCount = 0
    const downloader = new ModelDownloader({
      resolveAddresses: PUBLIC_ADDRESSES,
      transport: async (url) => {
        downloadCount++
        return new Response(String(url).includes('/models/8?') ? newerBytes : bytes, {
          headers: { 'content-type': 'application/octet-stream' },
        })
      },
    })
    await withModelHarness(
      civitaiApi({
        family,
        fileHash: sha256(bytes),
        fileSizeKB: bytes.length / 1024,
        requests,
        secondVersionHash: sha256(newerBytes),
        type: 'VAE',
      }),
      downloader,
      async ({ coordinator, repository, root, service }) => {
        const preview = selectedFilePreview(await service.previewImport(MODEL_URL))
        assert.equal(preview.resourceType, 'vae')
        assert.equal(preview.baseModel, family)
        assert.equal(preview.baseModelFamily, 'illustrious')
        assert.equal('companions' in preview, false)
        assert.equal(preview.totalAdditionalBytes, bytes.length)
        const job = await waitForTerminalJob(coordinator, () =>
          coordinator.startInstall(preview.previewId, 701, false),
        )
        assert.equal(job.status, 'completed', job.error?.message ?? '')
        const before = (await repository.listInstalled())[0]
        assert.ok(before)
        const first = before.versions[0]
        assert.ok(first)
        assert.equal(before.type, 'vae')
        assert.equal(first.baseModelFamily, 'illustrious')
        assert.equal(first.sourceMetadata['baseModel'], family)
        assert.equal(first.predictionType, null)
        assert.deepEqual(await readFile(first.file.managedPath), bytes)
        const reference = await service.resolveGenerationVae(before.id, first.id)
        assert.equal(reference.kind, 'vae')
        assert.equal(reference.fileSha256, sha256(bytes))
        assert.equal(reference.predictionType, null)

        const newerPreview = selectedFilePreview(
          await service.previewImport('https://civitai.com/models/42?modelVersionId=8'),
        )
        const newerJob = await waitForTerminalJob(coordinator, () =>
          coordinator.startInstall(newerPreview.previewId, 801, false),
        )
        assert.equal(newerJob.status, 'completed', newerJob.error?.message ?? '')
        const afterVersion = (await repository.listInstalled())[0]
        assert.ok(afterVersion)
        const newer = afterVersion.versions.find((item) => item.civitaiVersionId === 8)
        assert.ok(newer)
        assert.equal(afterVersion.defaultVersionId, first.id)
        await service.setDefaultVersion(before.id, newer.id)
        assert.deepEqual(await service.resolveGenerationVae(before.id, first.id), reference)

        await rm(first.file.managedPath)
        await assert.rejects(service.resolveGenerationVae(before.id, first.id), {
          code: 'MODEL_FILE_MISSING',
        })
        const repair = selectedFilePreview(await service.previewImport(MODEL_URL))
        assert.equal(repair.files[0]?.needsRepair, true)
        const repaired = await waitForTerminalJob(coordinator, () =>
          coordinator.startInstall(repair.previewId, 701, false),
        )
        assert.equal(repaired.status, 'completed', repaired.error?.message ?? '')
        assert.equal(downloadCount, 3)
        assert.deepEqual(await service.resolveGenerationVae(before.id, first.id), reference)
        const reopened = openAppDatabase(root, migrations)
        try {
          const [persisted] = await new ModelRepository(reopened.db).listInstalled()
          assert.ok(persisted)
          assert.equal(persisted.id, before.id)
          assert.equal(persisted.defaultVersionId, newer.id)
          assert.equal(persisted.versions.length, 2)
          const restored = persisted.versions.find((item) => item.id === first.id)
          assert.ok(restored)
          assert.equal(restored.file.sha256, sha256(bytes))
          assert.equal(restored.file.id, first.file.id)
          assert.equal(restored.sourceMetadata['baseModel'], family)
          assert.equal(restored.predictionType, null)
          assert.deepEqual(await readFile(restored.file.managedPath), bytes)
        } finally {
          await reopened.close()
        }
      },
    )
  })
}

// Boundary: actual download/integrity, install coordinator, filesystem, SQLite and
// exact selector. Only source bytes and the pre-commit observation timing are
// controlled. Normal install versus repair is the neighboring case; restoring
// staging cleanup after catalog/event publication must fail these assertions.
for (const operation of ['install', 'repair'] as const) {
  test(`${operation} finalizes only owned staging links before exact VAE catalog publication`, async () => {
    const requests: { authorization: string | null; pathname: string }[] = []
    const bytes = Buffer.from('VAE finalized staging publication fixture')
    await withModelHarness(
      civitaiApi({ fileHash: sha256(bytes), requests, type: 'VAE' }),
      new ModelDownloader({
        resolveAddresses: PUBLIC_ADDRESSES,
        transport: async () => new Response(bytes),
      }),
      async ({ coordinator, repository, root, service }) => {
        let priorManagedPath: string | null = null
        let priorVersionId: string | null = null
        if (operation === 'repair') {
          const first = selectedFilePreview(await service.previewImport(MODEL_URL))
          const installed = await waitForTerminalJob(coordinator, () =>
            coordinator.startInstall(first.previewId, 701, false),
          )
          assert.equal(installed.status, 'completed', installed.error?.message ?? '')
          const version = (await repository.listInstalled())[0]?.versions[0]
          assert.ok(version)
          priorManagedPath = version.file.managedPath
          priorVersionId = version.id
          await writeFile(priorManagedPath, Buffer.from('corrupted existing VAE'))
        }
        const stagingDirectory = path.join(root, 'models', '.staging')
        const neighbor = `${randomUUID()}.part`
        const neighborBytes = Buffer.from('unrelated staging owner')
        await writeFile(path.join(stagingDirectory, neighbor), neighborBytes)
        const snapshots: {
          installedPaths: string[]
          jobStatus: string | undefined
          links: bigint
          managedPath: string
          stagingNames: string[]
        }[] = []
        const observePublication = async (managedPath: string, jobId: string | undefined) => {
          snapshots.push({
            installedPaths: (await repository.listInstalled()).flatMap((resource) =>
              resource.versions.map((version) => version.file.managedPath),
            ),
            jobStatus: (await coordinator.listJobs()).find((job) => job.id === jobId)?.status,
            links: (await lstat(managedPath, { bigint: true })).nlink,
            managedPath,
            stagingNames: await readdir(stagingDirectory),
          })
        }
        const publish = repository.publishVerifiedInstallation.bind(repository)
        repository.publishVerifiedInstallation = async (input) => {
          await observePublication(input.primary.file.managedPath, input.jobId)
          return publish(input)
        }
        const repair = repository.repairVerifiedVersion.bind(repository)
        repository.repairVerifiedVersion = async (input) => {
          await observePublication(input.file.managedPath, input.jobId)
          return repair(input)
        }
        const preview = selectedFilePreview(await service.previewImport(MODEL_URL))
        assert.equal(preview.files[0]?.needsRepair, operation === 'repair')
        const job = await waitForTerminalJob(coordinator, () =>
          coordinator.startInstall(preview.previewId, 701, false),
        )
        assert.equal(job.status, 'completed', job.error?.message ?? '')
        assert.equal(snapshots.length, 1)
        const before = snapshots[0]
        assert.ok(before)
        assert.deepEqual(before.stagingNames, [neighbor])
        assert.equal(before.links, 1n)
        assert.equal(before.jobStatus, 'verifying')
        assert.deepEqual(before.installedPaths, priorManagedPath ? [priorManagedPath] : [])
        if (priorManagedPath) {
          assert.notEqual(before.managedPath, priorManagedPath)
        }
        const [resource] = await repository.listInstalled()
        const version = resource?.versions[0]
        assert.ok(resource && version)
        if (priorVersionId) {
          assert.equal(version.id, priorVersionId)
        }
        const selected = await service.resolveGenerationVae(resource.id, version.id)
        assert.equal(selected.fileSha256, sha256(bytes))
        assert.equal(selected.kind, 'vae')
        assert.deepEqual(await readFile(version.file.managedPath), bytes)
        assert.equal((await lstat(version.file.managedPath, { bigint: true })).nlink, 1n)
        assert.deepEqual(await readFile(path.join(stagingDirectory, neighbor)), neighborBytes)
      },
    )
  })
}

test('cancel after managed-link preparation stays cancellable before catalog publication', async () => {
  const requests: { authorization: string | null; pathname: string }[] = []
  const bytes = Buffer.from('VAE final pre-publication cancel fixture')
  await withModelHarness(
    civitaiApi({ fileHash: sha256(bytes), requests, type: 'VAE' }),
    new ModelDownloader({
      resolveAddresses: PUBLIC_ADDRESSES,
      transport: async () => new Response(bytes),
    }),
    async ({ coordinator, repository, root, service }) => {
      const update = repository.updateInstallJob.bind(repository)
      let cancellationObserved = false
      repository.updateInstallJob = async (jobId, input) => {
        await update(jobId, input)
        if (input.status === 'verifying') {
          const managedPath = path.join(
            root,
            'models',
            sha256(bytes).slice(0, 2),
            `${sha256(bytes)}.safetensors`,
          )
          assert.equal((await lstat(managedPath, { bigint: true })).nlink, 2n)
          assert.deepEqual(await repository.listInstalled(), [])
          await coordinator.cancelInstall(jobId)
          cancellationObserved = true
        }
      }
      const preview = selectedFilePreview(await service.previewImport(MODEL_URL))
      const job = await waitForTerminalJob(coordinator, () =>
        coordinator.startInstall(preview.previewId, 701, false),
      )
      assert.equal(cancellationObserved, true)
      assert.equal(job.status, 'canceled')
      assert.equal(job.error?.code, 'DOWNLOAD_CANCELED')
      assert.deepEqual(await repository.listInstalled(), [])
    },
  )
})

test('own staging unlink failure refuses catalog publication through the existing failed-install path', async () => {
  const requests: { authorization: string | null; pathname: string }[] = []
  const bytes = Buffer.from('VAE actual staging unlink refusal fixture')
  const downloader = new ModelDownloader({
    resolveAddresses: PUBLIC_ADDRESSES,
    transport: async () => new Response(bytes),
  })
  const download = downloader.download.bind(downloader)
  downloader.download = async (input) => {
    const verified = await download(input)
    await chmod(input.stagingDirectory, 0o500)
    return verified
  }
  await withModelHarness(
    civitaiApi({ fileHash: sha256(bytes), requests, type: 'VAE' }),
    downloader,
    async ({ coordinator, repository, root, service }) => {
      try {
        const preview = selectedFilePreview(await service.previewImport(MODEL_URL))
        const job = await waitForTerminalJob(coordinator, () =>
          coordinator.startInstall(preview.previewId, 701, false),
        )
        assert.equal(job.status, 'failed')
        assert.equal(job.error?.code, 'MODEL_INSTALL_FAILED')
        assert.deepEqual(await repository.listInstalled(), [])
      } finally {
        await chmod(path.join(root, 'models', '.staging'), 0o700)
      }
    },
  )
})

test('VAE exact selection rejects another resource kind, missing identity, unsupported catalog fields and tampered bytes', async () => {
  const requests: { authorization: string | null; pathname: string }[] = []
  const bytes = Buffer.from('standalone VAE reverified integrity fixture')
  await withModelHarness(
    civitaiApi({ fileHash: sha256(bytes), requests, type: 'VAE' }),
    new ModelDownloader({
      resolveAddresses: PUBLIC_ADDRESSES,
      transport: async () => new Response(bytes),
    }),
    async ({ coordinator, databaseFile, repository, root, service }) => {
      const preview = selectedFilePreview(await service.previewImport(MODEL_URL))
      const job = await waitForTerminalJob(coordinator, () =>
        coordinator.startInstall(preview.previewId, 701, false),
      )
      assert.equal(job.status, 'completed', job.error?.message ?? '')
      const [resource] = await repository.listInstalled()
      assert.ok(resource)
      const version = resource.versions[0]
      assert.ok(version)
      assert.equal((await service.resolveGenerationVae(resource.id, version.id)).kind, 'vae')
      await assert.rejects(service.resolveGenerationCheckpoint(resource.id, version.id), {
        code: 'MODEL_VERSION_UNAVAILABLE',
      })
      await assert.rejects(service.resolveGenerationLora(resource.id, version.id), {
        code: 'MODEL_VERSION_UNAVAILABLE',
      })
      await assert.rejects(service.resolveGenerationVae(resource.id, randomUUID()), {
        code: 'MODEL_VERSION_UNAVAILABLE',
      })
      await assert.rejects(service.resolveGenerationVae('invalid-resource-id', version.id), {
        code: 'MODEL_INVALID_ID',
      })
      const sqlite = new Database(databaseFile)
      try {
        for (const fields of [
          { family: 'anima', prediction: null },
          { family: null, prediction: null },
          { family: 'illustrious', prediction: 'epsilon' },
        ]) {
          sqlite
            .prepare(
              'UPDATE model_resource_version SET base_model_family = ?, prediction_type = ? WHERE id = ?',
            )
            .run(fields.family, fields.prediction, version.id)
          await assert.rejects(service.resolveGenerationVae(resource.id, version.id), {
            code: 'MODEL_FAMILY_UNSUPPORTED',
          })
        }
        sqlite
          .prepare(
            "UPDATE model_resource_version SET base_model_family = 'illustrious', prediction_type = NULL WHERE id = ?",
          )
          .run(version.id)
      } finally {
        sqlite.close()
      }
      const dependencyPath = path.join(root, 'anima-pinned-vae.safetensors')
      await writeFile(dependencyPath, bytes)
      const dependency = await repository.publishVerifiedInstallation({
        primary: {
          file: {
            ...version.file,
            managedPath: dependencyPath,
            originalFilename: 'anima-pinned-vae.safetensors',
          },
          resource: {
            displayName: 'Pinned Anima VAE',
            source: { key: 'anima/vae', kind: 'supported_dependency' },
            sourceMetadata: {},
            type: 'vae',
          },
          version: {
            baseModelFamily: 'anima',
            format: 'SafeTensor',
            name: 'Pinned companion',
            source: {
              expectedSha256: sha256(bytes),
              kind: 'supported_dependency',
              revision: 'pinned',
            },
            sourceMetadata: {},
          },
        },
      })
      await assert.rejects(
        service.resolveGenerationVae(dependency.resourceId, dependency.versionId),
        {
          code: 'MODEL_VERSION_UNAVAILABLE',
        },
      )
      await writeFile(version.file.managedPath, Buffer.alloc(bytes.length, 0x78))
      await assert.rejects(service.resolveGenerationVae(resource.id, version.id), {
        code: 'MODEL_FILE_CORRUPT',
      })
      assert.equal(
        (await service.getCatalog()).find((item) => item.id === resource.id)?.versions[0]
          ?.fileStatus,
        'corrupt',
      )
    },
  )
})

test('generation checkpoint resolution rejects wrong types, unknown versions, unsupported families and changed bytes', async () => {
  const requests: { authorization: string | null; pathname: string }[] = []
  await withModelHarness(
    civitaiApi({ requests }),
    new ModelDownloader(),
    async ({ databaseFile, repository, root, service }) => {
      const publish = async (
        modelId: number,
        versionId: number,
        type: 'checkpoint' | 'lora',
        family: 'anima' | 'illustrious' | null,
      ) => {
        const bytes = Buffer.from(`verified ${type} ${modelId}/${versionId}`)
        const managedPath = path.join(root, `${modelId}-${versionId}.safetensors`)
        await writeFile(managedPath, bytes)
        const digest = sha256(bytes)
        const published = await repository.publishVerifiedInstallation({
          primary: {
            file: {
              managedPath,
              originalFilename: `${modelId}-${versionId}.safetensors`,
              sha256: digest,
              sizeBytes: bytes.length,
              verifiedAt: new Date().toISOString(),
            },
            resource: {
              displayName: `${type} ${modelId}`,
              source: { kind: 'civitai', modelId },
              sourceMetadata: {},
              type,
            },
            version: {
              baseModelFamily: family,
              format: 'SafeTensor',
              name: `v${versionId}`,
              source: {
                expectedSha256: digest,
                fileId: versionId + 700,
                kind: 'civitai',
                versionId,
              },
              sourceMetadata: {},
            },
          },
        })
        return { bytes, managedPath, published }
      }
      const good = await publish(100, 10, 'checkpoint', 'illustrious')
      const lora = await publish(101, 11, 'lora', 'illustrious')
      const loraRef = await service.resolveGenerationLora(
        lora.published.resourceId,
        lora.published.versionId,
      )
      assert.equal(loraRef.kind, 'lora')
      assert.equal(loraRef.fileSha256, sha256(lora.bytes))
      await assert.rejects(
        service.resolveGenerationLora(good.published.resourceId, good.published.versionId),
        { code: 'MODEL_VERSION_UNAVAILABLE' },
      )
      await assert.rejects(
        service.resolveGenerationLora(lora.published.resourceId, good.published.versionId),
        { code: 'MODEL_VERSION_UNAVAILABLE' },
      )
      const animaLora = await publish(104, 14, 'lora', 'anima')
      assert.equal(
        (
          await service.resolveGenerationLora(
            animaLora.published.resourceId,
            animaLora.published.versionId,
          )
        ).baseModelFamily,
        'anima',
      )
      await writeFile(lora.managedPath, Buffer.alloc(lora.bytes.length, 0x78))
      await assert.rejects(
        service.resolveGenerationLora(lora.published.resourceId, lora.published.versionId),
        { code: 'MODEL_FILE_CORRUPT' },
      )
      await rm(lora.managedPath)
      await assert.rejects(
        service.resolveGenerationLora(lora.published.resourceId, lora.published.versionId),
        { code: 'MODEL_FILE_MISSING' },
      )
      const unclassified = await publish(102, 12, 'checkpoint', 'illustrious')
      const unpinnedAnima = await publish(103, 13, 'checkpoint', 'illustrious')
      // Simulate a legacy or metadata-incomplete installed row; new selections must reject it.
      const sqlite = new Database(databaseFile)
      try {
        sqlite
          .prepare('UPDATE model_resource_version SET base_model_family = NULL WHERE id = ?')
          .run(unclassified.published.versionId)
        sqlite
          .prepare("UPDATE model_resource_version SET base_model_family = 'anima' WHERE id = ?")
          .run(unpinnedAnima.published.versionId)
      } finally {
        sqlite.close()
      }
      const exact = await service.resolveGenerationCheckpoint(
        good.published.resourceId,
        good.published.versionId,
      )
      assert.equal(exact.fileSha256, sha256(good.bytes))
      assert.equal(exact.predictionType, 'epsilon')
      await assert.rejects(
        service.resolveGenerationCheckpoint(good.published.resourceId, lora.published.versionId),
        { code: 'MODEL_VERSION_UNAVAILABLE' },
      )
      await assert.rejects(
        service.resolveGenerationCheckpoint(lora.published.resourceId, lora.published.versionId),
        { code: 'MODEL_VERSION_UNAVAILABLE' },
      )
      await assert.rejects(
        service.resolveGenerationCheckpoint(
          unclassified.published.resourceId,
          unclassified.published.versionId,
        ),
        { code: 'MODEL_FAMILY_UNSUPPORTED' },
      )
      await assert.rejects(
        service.resolveGenerationCheckpoint(
          unpinnedAnima.published.resourceId,
          unpinnedAnima.published.versionId,
        ),
        { code: 'ANIMA_DEPENDENCY_UNAVAILABLE' },
      )
      await writeFile(good.managedPath, Buffer.concat([good.bytes, Buffer.from('x')]))
      const wrongSize = (await service.getCatalog()).find(
        (item) => item.id === good.published.resourceId,
      )
      assert.equal(wrongSize?.versions[0]?.fileStatus, 'corrupt')
      await writeFile(good.managedPath, good.bytes)
      await writeFile(good.managedPath, Buffer.alloc(good.bytes.length, 0x78))
      // Browsing is stat-only on a cold fingerprint; exact selection must detect same-size edits.
      const provisional = (await service.getCatalog()).find(
        (item) => item.id === good.published.resourceId,
      )
      assert.equal(provisional?.versions[0]?.fileStatus, 'ready')
      await assert.rejects(
        service.resolveGenerationCheckpoint(good.published.resourceId, good.published.versionId),
        { code: 'MODEL_FILE_CORRUPT' },
      )
      const verified = (await service.getCatalog()).find(
        (item) => item.id === good.published.resourceId,
      )
      assert.equal(verified?.versions[0]?.fileStatus, 'corrupt')
      await rm(good.managedPath)
      await assert.rejects(
        service.resolveGenerationCheckpoint(good.published.resourceId, good.published.versionId),
        { code: 'MODEL_FILE_MISSING' },
      )
    },
  )
})

for (const kind of ['checkpoint', 'lora', 'vae'] as const) {
  test(`portable ${kind} linking requires the same CivitAI file identity and bytes, then verifies the installed file`, async () => {
    const requests: { authorization: string | null; pathname: string }[] = []
    await withModelHarness(
      civitaiApi({ requests }),
      new ModelDownloader(),
      async ({ databaseFile, repository, root, service }) => {
        const resolvePortable =
          kind === 'checkpoint'
            ? service.resolvePortableGenerationCheckpoint.bind(service)
            : kind === 'lora'
              ? service.resolvePortableGenerationLora.bind(service)
              : service.resolvePortableGenerationVae.bind(service)
        const resolveSelected =
          kind === 'checkpoint'
            ? service.resolveGenerationCheckpoint.bind(service)
            : kind === 'lora'
              ? service.resolveGenerationLora.bind(service)
              : service.resolveGenerationVae.bind(service)
        const bytes = Buffer.from('portable illustrious checkpoint bytes')
        const managedPath = path.join(root, 'portable.safetensors')
        await writeFile(managedPath, bytes)
        const digest = sha256(bytes)
        const published = await repository.publishVerifiedInstallation({
          primary: {
            file: {
              managedPath,
              originalFilename: 'portable.safetensors',
              sha256: digest,
              sizeBytes: bytes.length,
              verifiedAt: new Date().toISOString(),
            },
            resource: {
              displayName: 'Destination checkpoint',
              source: { kind: 'civitai', modelId: 427 },
              sourceMetadata: {},
              type: kind,
            },
            version: {
              baseModelFamily: 'illustrious',
              format: 'SafeTensor',
              name: 'Destination version',
              predictionType: kind === 'vae' ? null : 'v_prediction',
              source: {
                expectedSha256: digest,
                fileId: 882,
                kind: 'civitai',
                versionId: 881,
              },
              sourceMetadata: {},
            },
          },
        })
        const local = await resolveSelected(published.resourceId, published.versionId)
        const portable = {
          ...local,
          displayName: 'Original checkpoint name',
          localModelId: randomUUID(),
          localVersionId: randomUUID(),
          predictionType: null,
          versionName: 'Original version name',
        }
        assert.deepEqual(await resolvePortable(portable), {
          ...portable,
          localModelId: local.localModelId,
          localVersionId: local.localVersionId,
        })
        for (const mismatch of [
          { ...portable, civitaiModelId: 428 },
          { ...portable, civitaiVersionId: 880 },
          { ...portable, civitaiFileId: 883 },
          { ...portable, fileSha256: 'f'.repeat(64) },
        ]) {
          await assert.rejects(resolvePortable(mismatch), {
            code: 'MODEL_PORTABLE_MATCH_UNAVAILABLE',
          })
        }
        await assert.rejects(resolvePortable({ ...portable, baseModelFamily: 'anima' }), {
          code:
            kind === 'vae'
              ? 'MODEL_PORTABLE_IDENTITY_UNAVAILABLE'
              : 'MODEL_PORTABLE_MATCH_UNAVAILABLE',
        })
        if (kind === 'vae') {
          for (const unsupported of [
            { ...portable, baseModelFamily: null },
            { ...portable, predictionType: 'epsilon' as const },
          ]) {
            await assert.rejects(resolvePortable(unsupported), {
              code: 'MODEL_PORTABLE_IDENTITY_UNAVAILABLE',
            })
          }
        }
        await assert.rejects(resolvePortable({ ...portable, civitaiFileId: null }), {
          code: 'MODEL_PORTABLE_IDENTITY_UNAVAILABLE',
        })
        await assert.rejects(
          resolvePortable({ ...portable, kind: kind === 'checkpoint' ? 'lora' : 'checkpoint' }),
          { code: 'MODEL_PORTABLE_IDENTITY_UNAVAILABLE' },
        )
        if (kind === 'lora') {
          const sqlite = new Database(databaseFile)
          try {
            sqlite
              .prepare('UPDATE model_resource_version SET base_model_family = NULL WHERE id = ?')
              .run(published.versionId)
            const unknownFamily = { ...portable, baseModelFamily: null }
            assert.deepEqual(await resolvePortable(unknownFamily), {
              ...unknownFamily,
              localModelId: local.localModelId,
              localVersionId: local.localVersionId,
            })
            sqlite
              .prepare(
                "UPDATE model_resource_version SET base_model_family = 'illustrious' WHERE id = ?",
              )
              .run(published.versionId)
          } finally {
            sqlite.close()
          }
        }
        await writeFile(managedPath, Buffer.alloc(bytes.length, 0x78))
        await assert.rejects(resolvePortable(portable), {
          code: 'MODEL_FILE_CORRUPT',
        })
        await rm(managedPath)
        await assert.rejects(resolvePortable(portable), {
          code: 'MODEL_FILE_MISSING',
        })
      },
    )
  })
}

test('repair atomically replaces a same-size corrupted file and preserves its resource and version identity', async () => {
  const bytes = Buffer.from('checkpoint bytes with intact size')
  const corruptBytes = Buffer.alloc(bytes.length, 0x58)
  const requests: { authorization: string | null; pathname: string }[] = []
  let downloadCount = 0
  const downloader = new ModelDownloader({
    resolveAddresses: PUBLIC_ADDRESSES,
    transport: async () => {
      downloadCount++
      return new Response(bytes, {
        headers: { 'content-type': 'application/octet-stream' },
      })
    },
  })
  await withModelHarness(
    civitaiApi({ fileHash: sha256(bytes), requests }),
    downloader,
    async ({ coordinator, repository, service }) => {
      const firstPreview = selectedFilePreview(await service.previewImport(MODEL_URL))
      assert.equal(
        (
          await waitForTerminalJob(coordinator, () =>
            coordinator.startInstall(firstPreview.previewId, 701, false),
          )
        ).status,
        'completed',
      )
      const before = (await repository.listInstalled())[0]
      assert.ok(before)
      const originalVersion = before.versions[0]
      assert.ok(originalVersion)
      assert.equal((await service.getCatalog())[0]?.versions[0]?.fileStatus, 'ready')
      await writeFile(originalVersion.file.managedPath, corruptBytes)
      assert.equal((await stat(originalVersion.file.managedPath)).size, bytes.length)
      assert.notDeepEqual(await readFile(originalVersion.file.managedPath), bytes)
      assert.equal((await service.getCatalog())[0]?.versions[0]?.fileStatus, 'ready')

      const repairPreview = selectedFilePreview(await service.previewImport(MODEL_URL))
      assert.equal((await service.getCatalog())[0]?.versions[0]?.fileStatus, 'corrupt')
      assert.equal(repairPreview.files[0]?.alreadyInstalled, false)
      assert.equal(repairPreview.files[0]?.needsRepair, true)
      assert.equal(repairPreview.files[0]?.reusesInstalledFile, false)
      const repairedJob = await waitForTerminalJob(coordinator, () =>
        coordinator.startInstall(repairPreview.previewId, 701, false),
      )
      assert.equal(repairedJob.status, 'completed', repairedJob.error?.message ?? '')
      assert.equal(downloadCount, 2)

      const after = (await repository.listInstalled())[0]
      assert.ok(after)
      assert.equal(after.id, before.id)
      assert.equal(after.defaultVersionId, before.defaultVersionId)
      assert.equal(after.versions.length, 1)
      assert.equal(after.versions[0]?.id, originalVersion.id)
      assert.equal(after.versions[0]?.file.id, originalVersion.file.id)
      const repairedFile = after.versions[0]?.file
      assert.ok(repairedFile)
      assert.notEqual(repairedFile.managedPath, originalVersion.file.managedPath)
      assert.deepEqual(await readFile(repairedFile.managedPath), bytes)
      await assert.rejects(stat(originalVersion.file.managedPath), { code: 'ENOENT' })
      assert.equal((await service.getCatalog())[0]?.versions[0]?.fileStatus, 'ready')
    },
  )
})

test('preview distinguishes a missing exact version from a different version reusing the same verified bytes', async () => {
  const bytes = Buffer.from('shared checkpoint bytes')
  const requests: { authorization: string | null; pathname: string }[] = []
  const downloader = new ModelDownloader({
    resolveAddresses: PUBLIC_ADDRESSES,
    transport: async () =>
      new Response(bytes, { headers: { 'content-type': 'application/octet-stream' } }),
  })
  await withModelHarness(
    civitaiApi({
      fileHash: sha256(bytes),
      requests,
      secondVersionHash: sha256(bytes),
    }),
    downloader,
    async ({ coordinator, repository, service }) => {
      const firstPreview = selectedFilePreview(await service.previewImport(MODEL_URL))
      const firstJob = await waitForTerminalJob(coordinator, () =>
        coordinator.startInstall(firstPreview.previewId, 701, false),
      )
      assert.equal(firstJob.status, 'completed')
      const installed = (await repository.listInstalled())[0]
      assert.equal(installed?.versions.length, 1)
      const managedPath = installed?.versions[0]?.file.managedPath
      assert.ok(managedPath)

      const exact = selectedFilePreview(await service.previewImport(MODEL_URL))
      assert.equal(exact.files[0]?.alreadyInstalled, true)
      assert.equal(exact.files[0]?.needsRepair, false)
      assert.equal(exact.files[0]?.reusesInstalledFile, false)
      const otherVersionUrl = 'https://civitai.com/models/42?modelVersionId=8'
      const otherVersion = selectedFilePreview(await service.previewImport(otherVersionUrl))
      assert.equal(otherVersion.files[0]?.fileId, 801)
      assert.equal(otherVersion.files[0]?.alreadyInstalled, false)
      assert.equal(otherVersion.files[0]?.needsRepair, false)
      assert.equal(otherVersion.files[0]?.reusesInstalledFile, true)
      assert.equal(otherVersion.totalAdditionalBytes, 0)

      await rm(managedPath)
      const missingExact = selectedFilePreview(await service.previewImport(MODEL_URL))
      assert.equal(missingExact.files[0]?.alreadyInstalled, false)
      assert.equal(missingExact.files[0]?.needsRepair, true)
      assert.equal(missingExact.files[0]?.reusesInstalledFile, false)
      const noLongerReusable = selectedFilePreview(await service.previewImport(otherVersionUrl))
      assert.equal(noLongerReusable.files[0]?.alreadyInstalled, false)
      assert.equal(noLongerReusable.files[0]?.needsRepair, false)
      assert.equal(noLongerReusable.files[0]?.reusesInstalledFile, false)
      assert.ok((noLongerReusable.totalAdditionalBytes ?? 0) > 0)
    },
  )
})

test('a CivitAI hash mismatch leaves a failed job but no selectable model or staged file', async () => {
  const requests: { authorization: string | null; pathname: string }[] = []
  const downloader = new ModelDownloader({
    resolveAddresses: PUBLIC_ADDRESSES,
    transport: async () =>
      new Response('wrong bytes', {
        headers: { 'content-type': 'application/octet-stream' },
      }),
  })
  await withModelHarness(
    civitaiApi({ fileHash: 'f'.repeat(64), requests }),
    downloader,
    async ({ coordinator, repository, root, service }) => {
      const preview = selectedFilePreview(await service.previewImport(MODEL_URL))
      const job = await waitForTerminalJob(coordinator, () =>
        coordinator.startInstall(preview.previewId, 701, false),
      )
      assert.equal(job.status, 'failed')
      assert.equal(job.error?.code, 'DOWNLOAD_HASH_MISMATCH')
      assert.deepEqual(await repository.listInstalled(), [])
      assert.deepEqual(await readdir(path.join(root, 'models', '.staging')), [])

      const reopened = openAppDatabase(root, migrations)
      try {
        assert.deepEqual(await new ModelRepository(reopened.db).listInstalled(), [])
      } finally {
        await reopened.close()
      }
    },
  )
})

test('preview rejects a file-specific download URL that identifies a different file', async () => {
  const requests: { authorization: string | null; pathname: string }[] = []
  const downloader = new ModelDownloader({ resolveAddresses: PUBLIC_ADDRESSES })
  await withModelHarness(
    civitaiApi({
      fileUrl: OTHER_FILE_URL,
      requests,
    }),
    downloader,
    async ({ coordinator, repository, service }) => {
      await assert.rejects(service.previewImport(MODEL_URL), {
        code: 'CIVITAI_INVALID_FILE_URL',
      })
      assert.deepEqual(await coordinator.listJobs(), [])
      assert.deepEqual(await repository.listInstalled(), [])
    },
  )
})

test('catalog reports an installed file missing after it disappears from managed storage', async () => {
  const bytes = Buffer.from('checkpoint that will be removed')
  const requests: { authorization: string | null; pathname: string }[] = []
  const downloader = new ModelDownloader({
    resolveAddresses: PUBLIC_ADDRESSES,
    transport: async () =>
      new Response(bytes, { headers: { 'content-type': 'application/octet-stream' } }),
  })
  await withModelHarness(
    civitaiApi({ fileHash: sha256(bytes), requests }),
    downloader,
    async ({ coordinator, repository, service }) => {
      const preview = selectedFilePreview(await service.previewImport(MODEL_URL))
      const job = await waitForTerminalJob(coordinator, () =>
        coordinator.startInstall(preview.previewId, 701, false),
      )
      assert.equal(job.status, 'completed')
      const managedFile = (await repository.listInstalled())[0]?.versions[0]?.file.managedPath
      assert.ok(managedFile)
      await rm(managedFile)
      assert.equal((await service.getCatalog())[0]?.versions[0]?.fileStatus, 'missing')
    },
  )
})

test('cancel after observed download progress removes the partial file and never publishes a model', async () => {
  const requests: { authorization: string | null; pathname: string }[] = []
  const downloader = new ModelDownloader({
    resolveAddresses: PUBLIC_ADDRESSES,
    transport: async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(stream) {
            stream.enqueue(new TextEncoder().encode('part of a checkpoint'))
          },
        }),
        { headers: { 'content-type': 'application/octet-stream' } },
      ),
  })
  await withModelHarness(
    civitaiApi({ fileHash: 'c'.repeat(64), requests }),
    downloader,
    async ({ coordinator, repository, root, service }) => {
      const preview = selectedFilePreview(await service.previewImport(MODEL_URL))
      let sawProgress!: (job: ModelInstallJobView) => void
      let sawTerminal!: (job: ModelInstallJobView) => void
      const progress = new Promise<ModelInstallJobView>((resolve) => {
        sawProgress = resolve
      })
      const terminal = new Promise<ModelInstallJobView>((resolve) => {
        sawTerminal = resolve
      })
      const unsubscribe = coordinator.onChanged((job) => {
        if (job.status === 'downloading' && job.bytesDownloaded > 0) {
          sawProgress(job)
        }
        if (['canceled', 'completed', 'failed'].includes(job.status)) {
          sawTerminal(job)
        }
      })
      const timeout = setTimeout(() => {
        const failure: ModelInstallJobView = {
          bytesDownloaded: 0,
          error: { code: 'TEST_TIMEOUT', message: 'Download did not progress or stop' },
          id: 'timeout',
          modelName: '',
          status: 'failed',
          totalBytes: null,
          versionName: '',
        }
        sawProgress(failure)
        sawTerminal(failure)
      }, 5000)
      try {
        const started = await coordinator.startInstall(preview.previewId, 701, false)
        const progressed = await progress
        assert.equal(progressed.id, started.id, progressed.error?.message ?? '')
        await coordinator.cancelInstall(started.id)
        const finished = await terminal
        assert.equal(finished.id, started.id, finished.error?.message ?? '')
        assert.equal(finished.status, 'canceled')
        assert.equal(finished.error?.code, 'DOWNLOAD_CANCELED')
        assert.deepEqual(await repository.listInstalled(), [])
        assert.deepEqual(await readdir(path.join(root, 'models', '.staging')), [])

        const reopened = openAppDatabase(root, migrations)
        try {
          assert.deepEqual(await new ModelRepository(reopened.db).listInstalled(), [])
        } finally {
          await reopened.close()
        }
      } finally {
        clearTimeout(timeout)
        unsubscribe()
      }
    },
  )
})

test('mixed Anima file preview attributes Base license by exact file and discloses companions', async () => {
  const requests: { authorization: string | null; pathname: string }[] = []
  let downloadCount = 0
  const downloader = new ModelDownloader({
    resolveAddresses: PUBLIC_ADDRESSES,
    transport: async () => {
      downloadCount++
      throw new Error('Download should not start')
    },
  })
  await withModelHarness(
    civitaiApi({
      family: 'Anima',
      fileHash: ANIMA_BASE_1_0_CHECKPOINT.sha256,
      requests,
    }),
    downloader,
    async ({ coordinator, repository, service }) => {
      const preview = selectedFilePreview(await service.previewImport(MODEL_URL))
      assert.equal(preview.baseModelFamily, 'anima')
      assert.match(preview.license?.summary ?? '', /non-commercial, non-production/)
      assert.equal(preview.files[0]?.license?.name, 'CircleStone Non-Commercial License')
      assert.equal(preview.files[1]?.license, null)
      assert.equal(preview.totalAdditionalBytes, ANIMA_BASE_1_0_TOTAL_BYTES)
      assert.deepEqual(
        preview.dependencies.map((dependency) => dependency.role),
        ['qwen3_encoder', 'vae'],
      )
      assert.deepEqual(
        preview.files.map((file) => file.fileId),
        [701, 702],
      )
      await assert.rejects(coordinator.startInstall(preview.previewId, 701, false), {
        code: 'ANIMA_LICENSE_NOT_ACKNOWLEDGED',
      })
      assert.equal(downloadCount, 0)
      assert.deepEqual(await coordinator.listJobs(), [])
      assert.deepEqual(await repository.listInstalled(), [])
    },
  )
})

test('Illustrious preview omits Anima companion checks and their download sizes', async () => {
  const requests: { authorization: string | null; pathname: string }[] = []
  const downloader = new ModelDownloader({ resolveAddresses: PUBLIC_ADDRESSES })
  await withModelHarness(
    civitaiApi({ fileSizeKB: 3, requests }),
    downloader,
    async ({ service }) => {
      const companionLookups: string[] = []
      const originalLookup = service.findVerifiedFileByHash.bind(service)
      service.findVerifiedFileByHash = async (hash, requiredType) => {
        if (requiredType === 'qwen3_encoder' || requiredType === 'vae') {
          companionLookups.push(requiredType)
        }
        return originalLookup(hash, requiredType)
      }

      const preview = selectedFilePreview(await service.previewImport(MODEL_URL))
      assert.equal(preview.baseModelFamily, 'illustrious')
      assert.deepEqual(preview.dependencies, [])
      assert.equal(preview.license, null)
      assert.deepEqual(companionLookups, [])
      assert.equal(preview.totalAdditionalBytes, preview.files[0]?.sizeEstimateBytes)
    },
  )
})

test('generation LoRA planning verifies exact registry bytes, structure and family while preserving copied metadata', async () => {
  await withModelHarness(
    civitaiApi({ requests: [] }),
    new ModelDownloader(),
    async ({ repository, root, service }) => {
      const first = await publishIllustriousLoraFixture(repository, root, 8100, 8101)
      const other = await publishIllustriousLoraFixture(repository, root, 8100, 8102, 0.25)
      const selected = await service.resolveGenerationLora(first.resourceId, first.versionId)
      const saved = {
        ...selected,
        displayName: 'Copied Project title',
        predictionType: 'epsilon' as const,
        versionName: 'Copied exact version',
      }
      await service.setDefaultVersion(other.resourceId, other.versionId)
      const planned = await service.resolveVerifiedGenerationLoraForPlan(saved)
      assert.equal(planned.managedPath, first.managedPath)
      assert.equal(planned.byteSize, first.bytes.length)
      assert.deepEqual(planned.reference, saved)
      assert.notEqual(planned.reference, saved)
      saved.displayName = 'Later Project edit'
      assert.equal(planned.reference.displayName, 'Copied Project title')
      for (const change of [
        { civitaiFileId: 999 },
        { civitaiVersionId: 999 },
        { civitaiModelId: 999 },
        { fileSha256: 'f'.repeat(64) },
        { localVersionId: other.versionId },
      ]) {
        await assert.rejects(
          service.resolveVerifiedGenerationLoraForPlan({ ...selected, ...change }),
          { code: 'MODEL_VERSION_MISMATCH' },
        )
      }
      await assert.rejects(
        service.resolveVerifiedGenerationLoraForPlan({ ...selected, baseModelFamily: 'anima' }),
        { code: 'MODEL_FAMILY_UNSUPPORTED' },
      )
      await assert.rejects(
        service.resolveVerifiedGenerationLoraForPlan({ ...selected, kind: 'checkpoint' }),
        { code: 'MODEL_FAMILY_UNSUPPORTED' },
      )
      await writeFile(first.managedPath, Buffer.alloc(first.bytes.length, 0))
      await assert.rejects(service.resolveVerifiedGenerationLoraForPlan(selected), {
        code: 'MODEL_FILE_CORRUPT',
      })
      await writeFile(first.managedPath, first.bytes)
      assert.equal(
        (await service.resolveVerifiedGenerationLoraForPlan(selected)).byteSize,
        first.bytes.length,
      )
      await rm(first.managedPath)
      await assert.rejects(service.resolveVerifiedGenerationLoraForPlan(selected), {
        code: 'MODEL_FILE_MISSING',
      })
      const invalidBytes = Buffer.from('hash-verified unsupported adapter')
      const invalid = await publishIllustriousLoraFixture(repository, root, 8200, 8201)
      // Change both actual registered content and expected digest through a new installed version;
      // exact-file verification succeeds, so structural qualification owns the refusal.
      const managedPath = path.join(root, 'unsupported.safetensors')
      await writeFile(managedPath, invalidBytes)
      const digest = sha256(invalidBytes)
      const broken = await repository.publishVerifiedInstallation({
        primary: {
          file: {
            managedPath,
            originalFilename: 'unsupported.safetensors',
            sha256: digest,
            sizeBytes: invalidBytes.length,
            verifiedAt: '2026-10-02T00:00:00.000Z',
          },
          resource: {
            displayName: 'Unsupported adapter',
            source: { kind: 'civitai', modelId: 8300 },
            sourceMetadata: {},
            type: 'lora',
          },
          version: {
            baseModelFamily: 'illustrious',
            format: 'safetensors',
            name: 'v8301',
            source: { expectedSha256: digest, fileId: 9301, kind: 'civitai', versionId: 8301 },
            sourceMetadata: {},
          },
        },
      })
      const unsupported = await service.resolveGenerationLora(broken.resourceId, broken.versionId)
      await assert.rejects(service.resolveVerifiedGenerationLoraForPlan(unsupported), {
        code: 'MODEL_LORA_INCOMPATIBLE',
      })
      const neighbor = await service.resolveGenerationLora(invalid.resourceId, invalid.versionId)
      assert.equal(
        (await service.resolveVerifiedGenerationLoraForPlan(neighbor)).managedPath,
        invalid.managedPath,
      )
    },
  )
})

// Production boundary: ModelService -> actual SQLite registry -> managed bytes -> header preflight.
// Neighboring controls change one identity, file byte, shape or library Default at a time.
test('generation VAE planning freezes exact standalone identity, bytes and copied metadata rather than library Default', async () => {
  await withModelHarness(
    civitaiApi({ requests: [] }),
    new ModelDownloader(),
    async ({ repository, root, service }) => {
      const first = await publishIllustriousVaeFixture(repository, root, 9100, 9101)
      const second = await publishIllustriousVaeFixture(repository, root, 9100, 9102, 'diffusers')
      const selected = await service.resolveGenerationVae(first.resourceId, first.versionId)
      const saved = {
        ...selected,
        displayName: 'Copied VAE title',
        versionName: 'Copied VAE version',
      }
      await service.setDefaultVersion(second.resourceId, second.versionId)
      const planned = await service.resolveVerifiedGenerationVaeForPlan(saved)
      assert.equal(planned.managedPath, first.managedPath)
      assert.equal(planned.byteSize, first.bytes.length)
      assert.deepEqual(planned.reference, saved)
      assert.notEqual(planned.reference, saved)
      saved.displayName = 'Edited after planning'
      assert.equal(planned.reference.displayName, 'Copied VAE title')
      for (const change of [
        { civitaiFileId: 999 },
        { civitaiVersionId: 999 },
        { civitaiModelId: 999 },
        { civitaiFileId: null },
        { fileSha256: 'f'.repeat(64) },
        { localVersionId: second.versionId },
      ]) {
        await assert.rejects(
          service.resolveVerifiedGenerationVaeForPlan({ ...selected, ...change }),
          {
            code: 'MODEL_VERSION_MISMATCH',
          },
        )
      }
      for (const change of [
        { kind: 'checkpoint' as const },
        { baseModelFamily: 'anima' as const },
        { baseModelFamily: null },
        { predictionType: 'epsilon' as const },
      ]) {
        await assert.rejects(
          service.resolveVerifiedGenerationVaeForPlan({ ...selected, ...change }),
          {
            code: 'MODEL_FAMILY_UNSUPPORTED',
          },
        )
      }
      const tampered = Buffer.from(first.bytes)
      tampered[tampered.length - 1] = 1 // Same size and valid header: only exact byte hashing finds it.
      await writeFile(first.managedPath, tampered)
      await assert.rejects(service.resolveVerifiedGenerationVaeForPlan(selected), {
        code: 'MODEL_FILE_CORRUPT',
      })
      await writeFile(first.managedPath, first.bytes)
      assert.equal(
        (await service.resolveVerifiedGenerationVaeForPlan(selected)).byteSize,
        first.bytes.length,
      )
      await writeFile(first.managedPath, Buffer.concat([first.bytes, Buffer.from([0])]))
      await assert.rejects(service.resolveVerifiedGenerationVaeForPlan(selected), {
        code: 'MODEL_FILE_CORRUPT',
      })
      await rm(first.managedPath)
      await assert.rejects(service.resolveVerifiedGenerationVaeForPlan(selected), {
        code: 'MODEL_FILE_MISSING',
      })
      const invalid = await publishIllustriousVaeFixture(
        repository,
        root,
        9200,
        9201,
        'ldm',
        (header) => {
          const quantizer = header['post_quant_conv.weight'] as { shape: number[] }
          quantizer.shape = [8, 2, 1, 1] // Same payload length and registered digest, wrong latent profile.
        },
      )
      const wrongShape = await service.resolveGenerationVae(invalid.resourceId, invalid.versionId)
      await assert.rejects(service.resolveVerifiedGenerationVaeForPlan(wrongShape), {
        code: 'MODEL_VAE_INCOMPATIBLE',
      })
      const accepted = await service.resolveGenerationVae(second.resourceId, second.versionId)
      assert.equal(
        (await service.resolveVerifiedGenerationVaeForPlan(accepted)).managedPath,
        second.managedPath,
      )
    },
  )
})

test('VAE install and exact repair enter generation preflight through the real coordinator and registry', async () => {
  const bytes = illustriousVaeFixture('diffusers')
  const digest = sha256(bytes)
  let downloads = 0
  const downloader = new ModelDownloader({
    resolveAddresses: PUBLIC_ADDRESSES,
    transport: async () => {
      downloads++
      return new Response(new Uint8Array(bytes), {
        headers: { 'content-type': 'application/octet-stream' },
      })
    },
  })
  await withModelHarness(
    civitaiApi({ fileHash: digest, fileSizeKB: bytes.length / 1024, requests: [], type: 'VAE' }),
    downloader,
    async ({ coordinator, repository, service }) => {
      const preview = selectedFilePreview(await service.previewImport(MODEL_URL))
      const installed = await waitForTerminalJob(coordinator, () =>
        coordinator.startInstall(preview.previewId, 701, false),
      )
      assert.equal(installed.status, 'completed', installed.error?.message ?? 'VAE install failed')
      const resource = (await repository.listInstalled())[0]
      const version = resource.versions[0]
      const saved = await service.resolveGenerationVae(resource.id, version.id)
      assert.equal(
        (await service.resolveVerifiedGenerationVaeForPlan(saved)).byteSize,
        bytes.length,
      )
      const tampered = Buffer.from(bytes)
      tampered[tampered.length - 1] = 1
      await writeFile(version.file.managedPath, tampered)
      await assert.rejects(service.resolveVerifiedGenerationVaeForPlan(saved), {
        code: 'MODEL_FILE_CORRUPT',
      })
      const repairPreview = selectedFilePreview(await service.previewImport(MODEL_URL))
      const repaired = await waitForTerminalJob(coordinator, () =>
        coordinator.startInstall(repairPreview.previewId, 701, false),
      )
      assert.equal(repaired.status, 'completed', repaired.error?.message ?? 'VAE repair failed')
      const after = await service.resolveVerifiedGenerationVaeForPlan(saved)
      assert.deepEqual(after.reference, saved)
      assert.equal(after.byteSize, bytes.length)
      assert.equal(sha256(await readFile(after.managedPath)), digest)
      assert.equal(downloads, 2)
    },
  )
})

// Production boundary: real catalog, SQLite identities, managed bytes and ModelService resolution.
// These fixtures exercise authoring, not ML tensor qualification or live CivitAI access.
test('embedding authoring installs through the coordinator and binds the filename token in either polarity', async () => {
  const bytes = illustriousEmbeddingFixture()
  await withModelHarness(
    civitaiApi({ fileHash: sha256(bytes), requests: [], type: 'TextualInversion' }),
    new ModelDownloader({
      resolveAddresses: PUBLIC_ADDRESSES,
      transport: async () => new Response(new Uint8Array(bytes)),
    }),
    async ({ coordinator, repository, root, service }) => {
      const preview = selectedFilePreview(await service.previewImport(MODEL_URL))
      const job = await waitForTerminalJob(coordinator, () =>
        coordinator.startInstall(preview.previewId, 701, false),
      )
      assert.equal(job.status, 'completed', job.error?.message ?? '')
      const [installed] = await repository.listInstalled()
      assert.equal(installed.type, 'embedding')
      const version = installed.versions[0]
      const before: GenerationPrompt = { embeddingRefs: [], text: '' }
      for (const text of ['portrait, <selected>', '<selected>, low quality']) {
        const actual = await service.resolveGenerationPromptEmbeddings({
          modelFamily: 'illustrious',
          prompt: before,
          text,
        })
        assert.equal(actual.text, text)
        assert.deepEqual(actual.embeddingRefs, [
          {
            resource: {
              baseModelFamily: 'illustrious',
              civitaiFileId: 701,
              civitaiModelId: 42,
              civitaiVersionId: 7,
              displayName: 'Portrait Model',
              fileSha256: sha256(bytes),
              kind: 'embedding',
              localModelId: installed.id,
              localVersionId: version.id,
              predictionType: null,
              versionName: 'v1',
            },
            token: '<selected>',
          },
        ])
        const reopened = openAppDatabase(root, migrations)
        try {
          const fresh = new ModelService(
            new ModelRepository(reopened.db),
            service.civitai,
            service.tokenStore,
          )
          assert.deepEqual(
            await fresh.resolveGenerationPromptEmbeddings({
              modelFamily: null,
              prompt: before,
              text,
            }),
            actual,
          )
        } finally {
          await reopened.close()
        }
      }
      assert.deepEqual(
        await service.resolveGenerationPromptEmbeddings({
          modelFamily: null,
          prompt: before,
          text: 'portrait, Portrait Model',
        }),
        { embeddingRefs: [], text: 'portrait, Portrait Model' },
      )
      assert.deepEqual(before, { embeddingRefs: [], text: '' })
    },
  )
})

test('embedding authoring preserves copied refs through rename, Default change and same-token ambiguity', async () => {
  await withModelHarness(
    civitaiApi({ requests: [] }),
    new ModelDownloader(),
    async ({ databaseFile, repository, root, service }) => {
      const first = await publishIllustriousEmbeddingFixture(repository, root, 9400, 9401)
      const linked = await service.resolveGenerationPromptEmbeddings({
        modelFamily: null,
        prompt: { embeddingRefs: [], text: '' },
        text: '<clean-style>, <clean-style>',
      })
      assert.equal(linked.embeddingRefs.length, 1)
      assert.equal(linked.embeddingRefs[0].resource.localVersionId, first.versionId)
      linked.embeddingRefs[0].resource.displayName = 'Copied Project name'
      linked.embeddingRefs[0].resource.versionName = 'Copied Project version'
      const saved = structuredClone(linked)
      const second = await publishIllustriousEmbeddingFixture(
        repository,
        root,
        9400,
        9402,
        'clean-style.safetensors',
        0.25,
      )
      await service.setDefaultVersion(second.resourceId, second.versionId)
      const sqlite = new Database(databaseFile)
      try {
        sqlite
          .prepare('UPDATE model_resource SET display_name = ? WHERE id = ?')
          .run('Renamed library name', first.resourceId)
      } finally {
        sqlite.close()
      }
      assert.deepEqual(
        await service.resolveGenerationPromptEmbeddings({
          modelFamily: 'illustrious',
          prompt: linked,
          text: linked.text,
        }),
        saved,
      )
      assert.deepEqual(
        await service.resolveGenerationPromptEmbeddings({
          modelFamily: null,
          prompt: { embeddingRefs: [], text: '' },
          text: '<clean-style>',
        }),
        { embeddingRefs: [], text: '<clean-style>' },
      )
      const retained = await service.resolveGenerationPromptEmbeddings({
        modelFamily: null,
        prompt: linked,
        selection: {
          resourceId: first.resourceId,
          token: '<clean-style>',
          versionId: first.versionId,
        },
        text: linked.text,
      })
      assert.deepEqual(retained, saved)
      const replaced = await service.resolveGenerationPromptEmbeddings({
        modelFamily: null,
        prompt: linked,
        selection: {
          resourceId: second.resourceId,
          token: '<clean-style>',
          versionId: second.versionId,
        },
        text: linked.text,
      })
      assert.equal(replaced.embeddingRefs.length, 1)
      assert.equal(replaced.embeddingRefs[0].resource.localVersionId, second.versionId)
      assert.equal(replaced.embeddingRefs[0].resource.fileSha256, sha256(second.bytes))
      assert.equal(replaced.embeddingRefs[0].resource.displayName, 'Renamed library name')
      assert.deepEqual(linked, saved)
    },
  )
})

test('embedding authoring verifies IDs and canonical registry token rather than renderer aliases or other resource kinds', async () => {
  await withModelHarness(
    civitaiApi({ requests: [] }),
    new ModelDownloader(),
    async ({ repository, root, service }) => {
      const embedding = await publishIllustriousEmbeddingFixture(repository, root, 9410, 9411)
      const lora = await publishIllustriousLoraFixture(repository, root, 9420, 9421)
      const prompt: GenerationPrompt = { embeddingRefs: [], text: '' }
      for (const selection of [
        {
          resourceId: embedding.resourceId,
          token: '<source-search-phrase>',
          versionId: embedding.versionId,
        },
        {
          resourceId: embedding.resourceId,
          token: '<Embedding 9410>',
          versionId: embedding.versionId,
        },
        { resourceId: embedding.resourceId, token: '<clean-style>', versionId: randomUUID() },
        { resourceId: lora.resourceId, token: '<clean-style>', versionId: lora.versionId },
      ]) {
        for (const text of [selection.token, '<clean-style>']) {
          await assert.rejects(
            service.resolveGenerationPromptEmbeddings({
              modelFamily: null,
              prompt,
              selection,
              text,
            }),
            { code: 'MODEL_EMBEDDING_SELECTION_UNAVAILABLE' },
          )
        }
      }
      await assert.rejects(
        service.resolveGenerationPromptEmbeddings({
          modelFamily: null,
          prompt,
          selection: {
            resourceId: embedding.resourceId,
            token: '<clean-style>',
            versionId: embedding.versionId,
          },
          text: 'unrelated text',
        }),
        { code: 'MODEL_EMBEDDING_SELECTION_UNAVAILABLE' },
      )
      await assert.rejects(
        service.resolveGenerationPromptEmbeddings({
          modelFamily: 'anima',
          prompt,
          selection: {
            resourceId: embedding.resourceId,
            token: '<clean-style>',
            versionId: embedding.versionId,
          },
          text: '<clean-style>',
        }),
        { code: 'MODEL_EMBEDDING_SELECTION_UNAVAILABLE' },
      )
      assert.deepEqual(
        await service.resolveGenerationPromptEmbeddings({
          modelFamily: 'anima',
          prompt,
          text: '<clean-style>',
        }),
        { embeddingRefs: [], text: '<clean-style>' },
      )
      assert.deepEqual(prompt, { embeddingRefs: [], text: '' })
    },
  )
})

for (const failure of ['missing', 'same-size corruption'] as const) {
  test(`embedding authoring rehashes a newly auto-linked file after its advisory catalog snapshot: ${failure}`, async () => {
    await withModelHarness(
      civitaiApi({ requests: [] }),
      new ModelDownloader(),
      async ({ repository, root, service }) => {
        const fixture = await publishIllustriousEmbeddingFixture(repository, root, 9430, 9431)
        const originalCatalog = service.getCatalog.bind(service)
        service.getCatalog = async () => {
          const catalog = await originalCatalog()
          assert.equal(catalog[0].versions[0].fileStatus, 'ready')
          await (failure === 'missing'
            ? rm(fixture.managedPath)
            : writeFile(fixture.managedPath, Buffer.alloc(fixture.bytes.length, 0x78)))
          return catalog
        }
        const prompt: GenerationPrompt = { embeddingRefs: [], text: 'previous durable text' }
        await assert.rejects(
          service.resolveGenerationPromptEmbeddings({
            modelFamily: null,
            prompt,
            text: '<clean-style>',
          }),
          { code: failure === 'missing' ? 'MODEL_FILE_MISSING' : 'MODEL_FILE_CORRUPT' },
        )
        assert.deepEqual(prompt, { embeddingRefs: [], text: 'previous durable text' })
      },
    )
  })
}

test('embedding authoring preserves a missing saved token and prunes only after its last literal occurrence disappears', async () => {
  await withModelHarness(
    civitaiApi({ requests: [] }),
    new ModelDownloader(),
    async ({ repository, root, service }) => {
      const fixture = await publishIllustriousEmbeddingFixture(repository, root, 9440, 9441)
      const linked = await service.resolveGenerationPromptEmbeddings({
        modelFamily: null,
        prompt: { embeddingRefs: [], text: '' },
        text: '<clean-style>',
      })
      linked.embeddingRefs[0].token = 'legacy-token'
      linked.text = 'legacy-token, legacy-token'
      const saved = structuredClone(linked)
      await rm(fixture.managedPath)
      assert.deepEqual(
        await service.resolveGenerationPromptEmbeddings({
          modelFamily: 'anima',
          prompt: linked,
          text: 'legacy-token',
        }),
        { ...saved, text: 'legacy-token' },
      )
      assert.deepEqual(
        await service.resolveGenerationPromptEmbeddings({
          modelFamily: null,
          prompt: linked,
          text: 'legacy-tokenized',
        }),
        { embeddingRefs: [], text: 'legacy-tokenized' },
      )
      assert.deepEqual(
        await service.resolveGenerationPromptEmbeddings({
          modelFamily: null,
          prompt: linked,
          text: '',
        }),
        { embeddingRefs: [], text: '' },
      )
      assert.deepEqual(linked, saved)
    },
  )
})

for (const change of [
  { code: 'MODEL_FAMILY_UNSUPPORTED', column: 'base_model_family', value: 'anima' },
  { code: 'MODEL_FAMILY_UNSUPPORTED', column: 'prediction_type', value: 'epsilon' },
  { code: 'MODEL_VERSION_MISMATCH', column: 'civitai_file_id', value: 999_999 },
] as const) {
  test(`embedding authoring refuses registry ${change.column} changes during explicit verification`, async () => {
    await withModelHarness(
      civitaiApi({ requests: [] }),
      new ModelDownloader(),
      async ({ databaseFile, repository, root, service }) => {
        const fixture = await publishIllustriousEmbeddingFixture(repository, root, 9450, 9451)
        const originalCatalog = service.getCatalog.bind(service)
        service.getCatalog = async () => {
          const catalog = await originalCatalog()
          const sqlite = new Database(databaseFile)
          try {
            sqlite
              .prepare(`UPDATE model_resource_version SET ${change.column} = ? WHERE id = ?`)
              .run(change.value, fixture.versionId)
          } finally {
            sqlite.close()
          }
          return catalog
        }
        await assert.rejects(
          service.resolveGenerationPromptEmbeddings({
            modelFamily: null,
            prompt: { embeddingRefs: [], text: '' },
            selection: {
              resourceId: fixture.resourceId,
              token: '<clean-style>',
              versionId: fixture.versionId,
            },
            text: '<clean-style>',
          }),
          { code: change.code },
        )
      },
    )
  })
}

test('embedding authoring rechecks the registry filename after catalog projection', async () => {
  await withModelHarness(
    civitaiApi({ requests: [] }),
    new ModelDownloader(),
    async ({ databaseFile, repository, root, service }) => {
      const fixture = await publishIllustriousEmbeddingFixture(repository, root, 9460, 9461)
      const originalCatalog = service.getCatalog.bind(service)
      service.getCatalog = async () => {
        const catalog = await originalCatalog()
        const sqlite = new Database(databaseFile)
        try {
          sqlite
            .prepare(
              'UPDATE local_model_file SET original_filename = ? WHERE resource_version_id = ?',
            )
            .run('another-token.safetensors', fixture.versionId)
        } finally {
          sqlite.close()
        }
        return catalog
      }
      await assert.rejects(
        service.resolveGenerationPromptEmbeddings({
          modelFamily: null,
          prompt: { embeddingRefs: [], text: '' },
          selection: {
            resourceId: fixture.resourceId,
            token: '<clean-style>',
            versionId: fixture.versionId,
          },
          text: '<clean-style>',
        }),
        { code: 'MODEL_VERSION_MISMATCH' },
      )
    },
  )
})

test('embedding portable relink verifies exact source identity and bytes while changing only local IDs', async () => {
  await withModelHarness(
    civitaiApi({ requests: [] }),
    new ModelDownloader(),
    async ({ repository, root, service }) => {
      const fixture = await publishIllustriousEmbeddingFixture(repository, root, 9470, 9471)
      const linked = await service.resolveGenerationPromptEmbeddings({
        modelFamily: null,
        prompt: { embeddingRefs: [], text: '' },
        text: '<clean-style>',
      })
      const saved = {
        ...linked.embeddingRefs[0].resource,
        displayName: 'Copied portable display',
        localModelId: randomUUID(),
        localVersionId: randomUUID(),
        versionName: 'Copied portable version',
      }
      const relinked = await service.resolvePortableGenerationEmbedding(saved)
      assert.deepEqual(relinked, {
        ...saved,
        localModelId: fixture.resourceId,
        localVersionId: fixture.versionId,
      })
      assert.notEqual(relinked, saved)
      for (const change of [
        { civitaiModelId: 0 },
        { civitaiVersionId: 0 },
        { civitaiFileId: 0 },
        { fileSha256: 'f'.repeat(64) },
      ]) {
        await assert.rejects(service.resolvePortableGenerationEmbedding({ ...saved, ...change }), {
          code: 'MODEL_PORTABLE_MATCH_UNAVAILABLE',
        })
      }
      for (const change of [
        { kind: 'lora' as const },
        { baseModelFamily: 'anima' as const },
        { predictionType: 'epsilon' as const },
        { civitaiFileId: null },
      ]) {
        await assert.rejects(service.resolvePortableGenerationEmbedding({ ...saved, ...change }), {
          code: 'MODEL_PORTABLE_IDENTITY_UNAVAILABLE',
        })
      }
      await writeFile(fixture.managedPath, Buffer.alloc(fixture.bytes.length, 0))
      await assert.rejects(service.resolvePortableGenerationEmbedding(saved), {
        code: 'MODEL_FILE_CORRUPT',
      })
      await rm(fixture.managedPath)
      await assert.rejects(service.resolvePortableGenerationEmbedding(saved), {
        code: 'MODEL_FILE_MISSING',
      })
    },
  )
})

test('embedding Generate admission refuses known unbound tokens without silently creating refs', async () => {
  await withModelHarness(
    civitaiApi({ requests: [] }),
    new ModelDownloader(),
    async ({ repository, root, service }) => {
      const fixture = await publishIllustriousEmbeddingFixture(repository, root, 9480, 9481)
      const plain: GenerationPrompt = { embeddingRefs: [], text: 'ordinary portrait' }
      const typed: GenerationPrompt = { embeddingRefs: [], text: '<clean-style>' }
      await service.assertNoUnboundGenerationEmbeddings({
        modelFamily: 'illustrious',
        negativePrompt: plain,
        positivePrompt: plain,
      })
      for (const positive of [true, false]) {
        await assert.rejects(
          service.assertNoUnboundGenerationEmbeddings({
            modelFamily: null,
            negativePrompt: positive ? plain : typed,
            positivePrompt: positive ? typed : plain,
          }),
          { code: 'MODEL_EMBEDDING_UNBOUND' },
        )
      }
      assert.deepEqual(typed, { embeddingRefs: [], text: '<clean-style>' })
      const linked = await service.resolveGenerationPromptEmbeddings({
        modelFamily: null,
        prompt: plain,
        text: typed.text,
      })
      await service.assertNoUnboundGenerationEmbeddings({
        modelFamily: 'illustrious',
        negativePrompt: plain,
        positivePrompt: linked,
      })
      await publishIllustriousEmbeddingFixture(
        repository,
        root,
        9480,
        9482,
        'clean-style.safetensors',
        0.25,
      )
      await assert.rejects(
        service.assertNoUnboundGenerationEmbeddings({
          modelFamily: null,
          negativePrompt: plain,
          positivePrompt: typed,
        }),
        { code: 'MODEL_EMBEDDING_UNBOUND' },
      )
      await rm(fixture.managedPath)
      await assert.rejects(
        service.assertNoUnboundGenerationEmbeddings({
          modelFamily: 'anima',
          negativePrompt: typed,
          positivePrompt: plain,
        }),
        { code: 'MODEL_EMBEDDING_UNBOUND' },
      )
      await service.assertNoUnboundGenerationEmbeddings({
        modelFamily: null,
        negativePrompt: plain,
        positivePrompt: { embeddingRefs: [], text: '<Clean-style>, <not-installed>' },
      })
    },
  )
})

test('embedding authoring captures caller input before asynchronous catalog verification', async () => {
  await withModelHarness(
    civitaiApi({ requests: [] }),
    new ModelDownloader(),
    async ({ repository, root, service }) => {
      const fixture = await publishIllustriousEmbeddingFixture(repository, root, 9490, 9491)
      let release!: () => void
      const pause = new Promise<void>((resolve) => {
        release = resolve
      })
      const originalCatalog = service.getCatalog.bind(service)
      service.getCatalog = async () => {
        await pause
        return originalCatalog()
      }
      const input = {
        modelFamily: null,
        prompt: { embeddingRefs: [], text: 'previous text' } as GenerationPrompt,
        selection: {
          resourceId: fixture.resourceId,
          token: '<clean-style>',
          versionId: fixture.versionId,
        },
        text: '<clean-style>',
      }
      const resolution = service.resolveGenerationPromptEmbeddings(input)
      input.selection.versionId = randomUUID()
      input.prompt.text = 'later caller edit'
      input.text = 'unrelated later text'
      release()
      const settled = await Promise.allSettled([resolution])
      assert.ok(
        settled[0].status === 'fulfilled',
        'Captured input must resolve despite later caller edits.',
      )
      const actual = settled[0].value
      assert.equal(actual.text, '<clean-style>')
      assert.equal(actual.embeddingRefs[0].resource.localVersionId, fixture.versionId)
      assert.equal(input.prompt.text, 'later caller edit')
    },
  )
})

for (const unavailable of ['missing', 'corrupt'] as const) {
  test(`embedding authoring does not guess a same-token version when another installed owner becomes ${unavailable}`, async () => {
    await withModelHarness(
      civitaiApi({ requests: [] }),
      new ModelDownloader(),
      async ({ repository, root, service }) => {
        const first = await publishIllustriousEmbeddingFixture(repository, root, 9500, 9501)
        const existing = await service.resolveGenerationPromptEmbeddings({
          modelFamily: null,
          prompt: { embeddingRefs: [], text: '' },
          text: '<clean-style>',
        })
        const second = await publishIllustriousEmbeddingFixture(
          repository,
          root,
          9500,
          9502,
          'clean-style.safetensors',
          0.25,
        )
        if (unavailable === 'missing') {
          await rm(first.managedPath)
        } else {
          await writeFile(first.managedPath, Buffer.alloc(first.bytes.length, 0))
          // Catalog browsing is provisional; explicit verification observes same-size corruption.
          await assert.rejects(
            service.resolveGenerationPromptEmbeddings({
              modelFamily: null,
              prompt: { embeddingRefs: [], text: '' },
              selection: {
                resourceId: first.resourceId,
                token: '<clean-style>',
                versionId: first.versionId,
              },
              text: '<clean-style>',
            }),
            { code: 'MODEL_FILE_CORRUPT' },
          )
        }
        const catalog = await service.getCatalog()
        assert.equal(
          catalog[0].versions.find((version) => version.id === first.versionId)?.fileStatus,
          unavailable,
        )
        assert.equal(
          catalog[0].versions.find((version) => version.id === second.versionId)?.fileStatus,
          'ready',
        )
        const unbound: GenerationPrompt = { embeddingRefs: [], text: 'previous text' }
        assert.deepEqual(
          await service.resolveGenerationPromptEmbeddings({
            modelFamily: null,
            prompt: unbound,
            text: '<clean-style>',
          }),
          { embeddingRefs: [], text: '<clean-style>' },
        )
        assert.deepEqual(
          await service.resolveGenerationPromptEmbeddings({
            modelFamily: null,
            prompt: existing,
            text: existing.text,
          }),
          existing,
        )
        const chosen = await service.resolveGenerationPromptEmbeddings({
          modelFamily: null,
          prompt: unbound,
          selection: {
            resourceId: second.resourceId,
            token: '<clean-style>',
            versionId: second.versionId,
          },
          text: '<clean-style>',
        })
        assert.equal(chosen.embeddingRefs.length, 1)
        assert.equal(chosen.embeddingRefs[0].resource.localVersionId, second.versionId)
      },
    )
  })
}

test('embedding inference resolves a real coordinator installation, preserving exact version and copied metadata through rename and Default', async () => {
  const bytes = illustriousEmbeddingFixture(0.125, { vectors: 3 })
  await withModelHarness(
    civitaiApi({
      fileHash: sha256(bytes),
      fileSizeKB: bytes.length / 1024,
      requests: [],
      type: 'TextualInversion',
    }),
    new ModelDownloader({
      resolveAddresses: PUBLIC_ADDRESSES,
      transport: async () => new Response(new Uint8Array(bytes)),
    }),
    async ({ coordinator, databaseFile, repository, root, service }) => {
      const preview = selectedFilePreview(await service.previewImport(MODEL_URL))
      assert.equal(
        (
          await waitForTerminalJob(coordinator, () =>
            coordinator.startInstall(preview.previewId, 701, false),
          )
        ).status,
        'completed',
      )
      const authored = await service.resolveGenerationPromptEmbeddings({
        modelFamily: 'illustrious',
        prompt: { embeddingRefs: [], text: '' },
        text: '<selected>',
      })
      const saved = {
        ...authored.embeddingRefs[0].resource,
        displayName: 'Copied result name',
        versionName: 'Copied result version',
      }
      const later = await publishIllustriousEmbeddingFixture(
        repository,
        root,
        42,
        8,
        'selected.safetensors',
        0.25,
      )
      await service.setDefaultVersion(later.resourceId, later.versionId)
      const sql = new Database(databaseFile)
      try {
        sql
          .prepare('UPDATE model_resource SET display_name = ? WHERE id = ?')
          .run('Renamed library', saved.localModelId)
        sql
          .prepare(
            'UPDATE local_model_file SET original_filename = ? WHERE resource_version_id = ?',
          )
          .run('renamed.safetensors', saved.localVersionId)
      } finally {
        sql.close()
      }
      const resolved = await service.resolveVerifiedGenerationEmbeddingForPlan(saved)
      assert.deepEqual(resolved.reference, saved)
      assert.notEqual(resolved.reference, saved)
      assert.equal(resolved.byteSize, bytes.length)
      assert.deepEqual(await readFile(resolved.managedPath), bytes)
      assert.notEqual(resolved.managedPath, later.managedPath)
      const reopened = openAppDatabase(root, migrations)
      try {
        const fresh = new ModelService(
          new ModelRepository(reopened.db),
          new CivitaiClient(),
          new CivitaiTokenStore(safeStorage(), root),
        )
        assert.deepEqual(await fresh.resolveVerifiedGenerationEmbeddingForPlan(saved), resolved)
      } finally {
        await reopened.close()
      }
    },
  )
})

test('embedding inference rejects forged exact source/family/kind/prediction while preserving a saved custom literal resource', async () => {
  await withModelHarness(
    civitaiApi({ requests: [] }),
    new ModelDownloader(),
    async ({ repository, root, service }) => {
      await publishIllustriousEmbeddingFixture(repository, root, 9700, 9701)
      const prompt = await service.resolveGenerationPromptEmbeddings({
        modelFamily: 'illustrious',
        prompt: { embeddingRefs: [], text: '' },
        text: '<clean-style>',
      })
      const saved = {
        ...prompt.embeddingRefs[0].resource,
        displayName: 'Copied custom legacy resource',
      }
      await assert.doesNotReject(service.resolveVerifiedGenerationEmbeddingForPlan(saved))
      for (const change of [
        { civitaiModelId: 0 },
        { civitaiVersionId: 0 },
        { civitaiFileId: 0 },
        { fileSha256: 'f'.repeat(64) },
        { localModelId: randomUUID() },
        { localVersionId: randomUUID() },
      ]) {
        await assert.rejects(
          service.resolveVerifiedGenerationEmbeddingForPlan({ ...saved, ...change }),
        )
      }
      for (const change of [
        { kind: 'lora' as const },
        { baseModelFamily: 'anima' as const },
        { predictionType: 'epsilon' as const },
      ]) {
        await assert.rejects(
          service.resolveVerifiedGenerationEmbeddingForPlan({ ...saved, ...change }),
          { code: 'MODEL_FAMILY_UNSUPPORTED' },
        )
      }
    },
  )
})

test('embedding inference rehashes current bytes and refuses missing, resized, corrupt and linked files without substituting an installed neighbor', async () => {
  await withModelHarness(
    civitaiApi({ requests: [] }),
    new ModelDownloader(),
    async ({ repository, root, service }) => {
      const fixture = await publishIllustriousEmbeddingFixture(repository, root, 9710, 9711)
      const authored = await service.resolveGenerationPromptEmbeddings({
        modelFamily: null,
        prompt: { embeddingRefs: [], text: '' },
        text: '<clean-style>',
      })
      const saved = authored.embeddingRefs[0].resource
      const original = structuredClone(saved)
      await publishIllustriousEmbeddingFixture(
        repository,
        root,
        9710,
        9712,
        'clean-style.safetensors',
        0.25,
      )
      await writeFile(fixture.managedPath, illustriousEmbeddingFixture(0.25))
      await assert.rejects(service.resolveVerifiedGenerationEmbeddingForPlan(saved), {
        code: 'MODEL_FILE_CORRUPT',
      })
      await writeFile(fixture.managedPath, fixture.bytes.subarray(1))
      await assert.rejects(service.resolveVerifiedGenerationEmbeddingForPlan(saved), {
        code: 'MODEL_FILE_CORRUPT',
      })
      await rm(fixture.managedPath)
      await assert.rejects(service.resolveVerifiedGenerationEmbeddingForPlan(saved), {
        code: 'MODEL_FILE_MISSING',
      })
      const target = path.join(root, 'same-exact-target.safetensors')
      await writeFile(target, fixture.bytes)
      await symlink(target, fixture.managedPath)
      await assert.rejects(service.resolveVerifiedGenerationEmbeddingForPlan(saved), {
        code: 'MODEL_FILE_CORRUPT',
      })
      assert.deepEqual(saved, original)
    },
  )
})

test('embedding inference refuses verified but unsupported weights while authoring stays an identity-only boundary', async () => {
  await withModelHarness(
    civitaiApi({ requests: [] }),
    new ModelDownloader(),
    async ({ repository, root, service }) => {
      await publishIllustriousEmbeddingFixture(
        repository,
        root,
        9720,
        9721,
        'unsupported.safetensors',
        0.125,
        {
          editHeader: (header) => {
            delete header.clip_g
          },
        },
      )
      const authored = await service.resolveGenerationPromptEmbeddings({
        modelFamily: null,
        prompt: { embeddingRefs: [], text: '' },
        text: '<unsupported>',
      })
      assert.equal(authored.embeddingRefs.length, 1)
      await assert.rejects(
        service.resolveVerifiedGenerationEmbeddingForPlan(authored.embeddingRefs[0].resource),
        { code: 'MODEL_EMBEDDING_INCOMPATIBLE' },
      )
      await publishIllustriousEmbeddingFixture(
        repository,
        root,
        9722,
        9723,
        'supported.safetensors',
        0.125,
        { singleton: true },
      )
      const supported = await service.resolveGenerationPromptEmbeddings({
        modelFamily: null,
        prompt: { embeddingRefs: [], text: '' },
        text: '<supported>',
      })
      await assert.doesNotReject(
        service.resolveVerifiedGenerationEmbeddingForPlan(supported.embeddingRefs[0].resource),
      )
    },
  )
})

test('embedding inference snapshots caller identity and copied metadata before asynchronous registry verification', async () => {
  await withModelHarness(
    civitaiApi({ requests: [] }),
    new ModelDownloader(),
    async ({ repository, root, service }) => {
      const fixture = await publishIllustriousEmbeddingFixture(repository, root, 9730, 9731)
      const authored = await service.resolveGenerationPromptEmbeddings({
        modelFamily: null,
        prompt: { embeddingRefs: [], text: '' },
        text: '<clean-style>',
      })
      const saved = authored.embeddingRefs[0].resource
      const snapshot = structuredClone(saved)
      let release!: () => void
      const pause = new Promise<void>((resolve) => {
        release = resolve
      })
      const list = repository.listInstalled.bind(repository)
      repository.listInstalled = async () => {
        await pause
        return list()
      }
      const resolution = service.resolveVerifiedGenerationEmbeddingForPlan(saved)
      saved.localVersionId = randomUUID()
      saved.displayName = 'Later caller mutation'
      release()
      const outcome = await Promise.allSettled([resolution])
      assert.equal(outcome[0].status, 'fulfilled')
      if (outcome[0].status !== 'fulfilled') {
        throw new Error('Captured exact resource did not resolve.')
      }
      assert.deepEqual(outcome[0].value.reference, snapshot)
      assert.equal(outcome[0].value.managedPath, fixture.managedPath)
      assert.equal(saved.displayName, 'Later caller mutation')
    },
  )
})

test('embedding inference admission honors longer saved custom literals but refuses an uncovered canonical occurrence in either polarity', async () => {
  await withModelHarness(
    civitaiApi({ requests: [] }),
    new ModelDownloader(),
    async ({ repository, root, service }) => {
      await publishIllustriousEmbeddingFixture(repository, root, 9740, 9741)
      const authored = await service.resolveGenerationPromptEmbeddings({
        modelFamily: 'illustrious',
        prompt: { embeddingRefs: [], text: '' },
        text: '<clean-style>',
      })
      const custom = { resource: authored.embeddingRefs[0].resource, token: '<clean-style>x' }
      const bound = { embeddingRefs: [custom], text: 'portrait <clean-style>x' }
      const plain = { embeddingRefs: [], text: 'ordinary prompt' }
      for (const polarity of ['positivePrompt', 'negativePrompt'] as const) {
        const input = {
          modelFamily: 'illustrious',
          negativePrompt: plain,
          [polarity]: bound,
          positivePrompt: plain,
        }
        await assert.doesNotReject(service.assertNoUnboundGenerationEmbeddings(input))
        await assert.rejects(
          service.assertNoUnboundGenerationEmbeddings({
            ...input,
            [polarity]: { ...bound, text: '<clean-style>x <clean-style>' },
          }),
          { code: 'MODEL_EMBEDDING_UNBOUND' },
        )
      }
    },
  )
})
