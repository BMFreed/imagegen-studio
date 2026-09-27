import type { ModelImportPreview, ModelInstallJobView } from '../../shared/api.js'

import Database from 'better-sqlite3'
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { openAppDatabase } from '../db/database.js'
import { ANIMA_BASE_1_0_CHECKPOINT, ANIMA_BASE_1_0_TOTAL_BYTES } from './anima-manifest.js'
import { CivitaiClient } from './civitai-client.js'
import { CivitaiTokenStore, type SafeStorageAdapter } from './civitai-token-store.js'
import { ModelDownloader } from './model-downloader.js'
import { ModelInstallCoordinator } from './model-install-coordinator.js'
import { ModelRepository, type VerifiedModelArtifact } from './model-repository.js'
import { ModelService } from './model-service.js'

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
  family?: 'Anima' | 'Illustrious'
  fileHash?: string
  fileSizeKB?: number
  fileUrl?: string
  includeThirdVersion?: boolean
  omitSecondPublishedAt?: boolean
  requests: { authorization: string | null; pathname: string }[]
  secondVersionHash?: string
  secondVersionTrainedWords?: string[]
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
        sizeKB: options.fileSizeKB ?? 1,
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
    images: [],
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
    type: 'Checkpoint',
  }
  return async (input, init) => {
    const url = new URL(String(input))
    options.requests.push({
      authorization: new Headers(init?.headers).get('Authorization'),
      pathname: url.pathname,
    })
    const body =
      url.pathname === '/api/v1/models/42'
        ? model
        : url.pathname === '/api/v1/model-versions/8'
          ? {
              ...version,
              files: [
                {
                  ...version.files[0],
                  downloadUrl: 'https://civitai.com/api/download/models/8?fileId=801',
                  hashes: { SHA256: options.secondVersionHash },
                  id: 801,
                  name: 'new-version.safetensors',
                },
              ],
              id: 8,
              name: 'v2',
              trainedWords: options.secondVersionTrainedWords ?? ['portrait v2'],
            }
          : version
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
): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'igs-model-flow-'))
  const database = openAppDatabase(root, migrations)
  try {
    const repository = new ModelRepository(database.db)
    const service = new ModelService(
      repository,
      new CivitaiClient(api),
      new CivitaiTokenStore(safeStorage(), root),
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
): Promise<ModelInstallJobView> {
  let complete!: (job: ModelInstallJobView) => void
  const terminal = new Promise<ModelInstallJobView>((resolve) => {
    complete = resolve
  })
  const unsubscribe = coordinator.onChanged((job) => {
    if (['canceled', 'completed', 'failed'].includes(job.status)) {
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

test('a newer CivitAI version installs beside the first and changes default only on explicit selection', async () => {
  const firstBytes = Buffer.from('first checkpoint version')
  const secondBytes = Buffer.from('second checkpoint version')
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
      const firstJob = await waitForTerminalJob(coordinator, () =>
        coordinator.startInstall(firstPreview.previewId, 701, false),
      )
      assert.equal(firstJob.status, 'completed')
      assert.deepEqual((await service.checkUpdates(42)).availableVersions, [{ id: 8, name: 'v2' }])

      const secondPreview = selectedFilePreview(
        await service.previewImport('https://civitai.com/models/42?modelVersionId=8'),
      )
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
      assert.deepEqual((await service.getCatalog())[0]?.trainedWords, ['portrait'])
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

test('repairing a missing managed file preserves the exact CivitAI version and default selection', async () => {
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
    civitaiApi({ fileHash: sha256(bytes), requests }),
    downloader,
    async ({ coordinator, repository, service }) => {
      const firstPreview = selectedFilePreview(await service.previewImport(MODEL_URL))
      const firstJob = await waitForTerminalJob(coordinator, () =>
        coordinator.startInstall(firstPreview.previewId, 701, false),
      )
      assert.equal(firstJob.status, 'completed', firstJob.error?.message ?? '')
      const before = (await repository.listInstalled())[0]
      assert.ok(before)
      const originalVersion = before.versions[0]
      assert.ok(originalVersion)
      await rm(originalVersion.file.managedPath)

      const repairPreview = selectedFilePreview(await service.previewImport(MODEL_URL))
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
      assert.deepEqual(await readFile(originalVersion.file.managedPath), bytes)
      assert.equal((await service.getCatalog())[0]?.versions[0]?.fileStatus, 'ready')
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
      assert.equal(exact.predictionType, null)
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
        { code: 'ANIMA_UNSUPPORTED_CHECKPOINT' },
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

test('portable checkpoint linking requires the same CivitAI file identity and bytes, then verifies the installed file', async () => {
  const requests: { authorization: string | null; pathname: string }[] = []
  await withModelHarness(
    civitaiApi({ requests }),
    new ModelDownloader(),
    async ({ repository, root, service }) => {
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
            type: 'checkpoint',
          },
          version: {
            baseModelFamily: 'illustrious',
            format: 'SafeTensor',
            name: 'Destination version',
            predictionType: 'v_prediction',
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
      const local = await service.resolveGenerationCheckpoint(
        published.resourceId,
        published.versionId,
      )
      const portable = {
        ...local,
        displayName: 'Original checkpoint name',
        localModelId: randomUUID(),
        localVersionId: randomUUID(),
        predictionType: null,
        versionName: 'Original version name',
      }
      assert.deepEqual(await service.resolvePortableGenerationCheckpoint(portable), {
        ...portable,
        localModelId: local.localModelId,
        localVersionId: local.localVersionId,
      })
      for (const mismatch of [
        { ...portable, civitaiModelId: 428 },
        { ...portable, civitaiVersionId: 880 },
        { ...portable, civitaiFileId: 883 },
        { ...portable, fileSha256: 'f'.repeat(64) },
        { ...portable, baseModelFamily: 'anima' as const },
      ]) {
        await assert.rejects(service.resolvePortableGenerationCheckpoint(mismatch), {
          code: 'MODEL_PORTABLE_MATCH_UNAVAILABLE',
        })
      }
      await assert.rejects(
        service.resolvePortableGenerationCheckpoint({ ...portable, civitaiFileId: null }),
        { code: 'MODEL_PORTABLE_IDENTITY_UNAVAILABLE' },
      )
      await writeFile(managedPath, Buffer.alloc(bytes.length, 0x78))
      await assert.rejects(service.resolvePortableGenerationCheckpoint(portable), {
        code: 'MODEL_FILE_CORRUPT',
      })
      await rm(managedPath)
      await assert.rejects(service.resolvePortableGenerationCheckpoint(portable), {
        code: 'MODEL_FILE_MISSING',
      })
    },
  )
})

test('repair replaces a same-size corrupted file and preserves its resource and version identity', async () => {
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
      assert.equal(after.versions[0]?.file.managedPath, originalVersion.file.managedPath)
      assert.deepEqual(await readFile(originalVersion.file.managedPath), bytes)
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

test('Anima preview discloses its license and dependencies, and install rejects missing acknowledgement', async () => {
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
      assert.equal(preview.totalAdditionalBytes, ANIMA_BASE_1_0_TOTAL_BYTES)
      assert.deepEqual(
        preview.dependencies.map((dependency) => dependency.role),
        ['qwen3_encoder', 'vae'],
      )
      assert.deepEqual(
        preview.files.map((file) => file.fileId),
        [701],
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
