import type { ModelInstallJobView } from '../../shared/api.js'

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { type AppDatabase, openAppDatabase } from '../db/database.js'
import { CivitaiClient } from './civitai-client.js'
import { CivitaiTokenStore, type SafeStorageAdapter } from './civitai-token-store.js'
import { ModelDownloader } from './model-downloader.js'
import { ModelInstallCoordinator } from './model-install-coordinator.js'
import { ModelRepository } from './model-repository.js'
import { ModelService } from './model-service.js'

const migrations = path.resolve('src/main/db/migrations')
const modelUrl = 'https://civitai.com/models/42?modelVersionId=7'
const fileUrl = 'https://civitai.com/api/download/models/7?fileId=701'
const token = 'test-secret-token'

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

function civitaiApi(
  type: 'Checkpoint' | 'Upscaler',
  fileHash: string,
  fileSizeBytes: number,
): typeof fetch {
  return async (input) => {
    const pathname = new URL(String(input)).pathname
    const body =
      pathname === '/api/v1/models/42'
        ? {
            id: 42,
            modelVersions: [
              { baseModel: type === 'Upscaler' ? 'Any' : 'Illustrious', id: 7, name: 'v1' },
            ],
            name: 'RealESRGAN x4',
            type,
          }
        : pathname === '/api/v1/model-versions/7'
          ? {
              baseModel: type === 'Upscaler' ? 'Any' : 'Illustrious',
              files: [
                {
                  downloadUrl: fileUrl,
                  hashes: { SHA256: fileHash },
                  id: 701,
                  metadata: { format: 'PickleTensor' },
                  name: 'RealESRGAN_x4plus.pth',
                  primary: true,
                  sizeKB: fileSizeBytes / 1024,
                },
              ],
              id: 7,
              images: [],
              modelId: 42,
              name: 'v1',
            }
          : { id: 1 }
    return new Response(JSON.stringify(body), {
      headers: { 'content-type': 'application/json' },
    })
  }
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
    const job = await terminal
    assert.notEqual(job.id, 'timeout', job.error?.message ?? '')
    return job
  } finally {
    clearTimeout(timeout)
    unsubscribe()
  }
}

test('CivitAI Any-family .pth upscaler is streamed into managed storage and survives restart', async () => {
  const bytes = Buffer.from('small fake upscaler bytes; integrity is tested without loading pickle')
  const hash = createHash('sha256').update(bytes).digest('hex')
  const root = await mkdtemp(path.join(tmpdir(), 'igs-upscaler-'))
  let database: AppDatabase | null = openAppDatabase(root, migrations)
  const downloadRequests: { authorization: string | null; url: string }[] = []
  const downloader = new ModelDownloader({
    resolveAddresses: async () => ['1.1.1.1'],
    transport: async (url, init) => {
      downloadRequests.push({
        authorization: new Headers(init?.headers).get('Authorization'),
        url: String(url),
      })
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes.subarray(0, 20))
          controller.enqueue(bytes.subarray(20))
          controller.close()
        },
      })
      return new Response(stream, {
        headers: { 'content-length': String(bytes.length) },
      })
    },
  })
  try {
    const repository = new ModelRepository(database.db)
    const service = new ModelService(
      repository,
      new CivitaiClient(civitaiApi('Upscaler', hash, bytes.length)),
      new CivitaiTokenStore(safeStorage(), root),
    )
    const coordinator = new ModelInstallCoordinator(repository, service, downloader, root)
    await coordinator.initialize()
    await service.saveToken(token)
    const preview = await service.previewImport(modelUrl)
    assert.equal(preview.kind, 'select-file')
    if (preview.kind !== 'select-file') {
      throw new Error('Expected an upscaler file preview')
    }
    assert.equal(preview.resourceType, 'upscaler')
    assert.equal(preview.baseModelFamily, null)
    assert.equal(preview.files[0]?.format, 'PyTorch')
    assert.equal(preview.files[0]?.sizeEstimateBytes, bytes.length)

    const job = await waitForTerminalJob(coordinator, () =>
      coordinator.startInstall(preview.previewId, 701, false),
    )
    assert.equal(job.status, 'completed', job.error?.message ?? '')
    assert.deepEqual(downloadRequests, [{ authorization: `Bearer ${token}`, url: fileUrl }])

    const installed = await repository.listInstalled()
    assert.equal(installed.length, 1)
    assert.equal(installed[0]?.type, 'upscaler')
    assert.equal(installed[0]?.versions.length, 1)
    const version = installed[0]?.versions[0]
    assert.ok(version)
    assert.equal(version.baseModelFamily, null)
    assert.equal(version.format, 'PyTorch')
    assert.equal(version.file.sha256, hash)
    assert.equal(version.file.sizeBytes, bytes.length)
    assert.equal(version.file.originalFilename, 'RealESRGAN_x4plus.pth')
    const expectedPath = path.join(root, 'models', hash.slice(0, 2), `${hash}.pth`)
    assert.equal(version.file.managedPath, expectedPath)
    assert.deepEqual(await readFile(expectedPath), bytes)
    assert.equal((await stat(expectedPath)).mode & 0o777, 0o600)
    assert.equal((await service.getCatalog())[0]?.versions[0]?.fileStatus, 'ready')

    await database.close()
    database = null
    const reopened = openAppDatabase(root, migrations)
    try {
      const restartedRepository = new ModelRepository(reopened.db)
      const restartedService = new ModelService(
        restartedRepository,
        new CivitaiClient(civitaiApi('Upscaler', hash, bytes.length)),
        new CivitaiTokenStore(safeStorage(), root),
      )
      await new ModelInstallCoordinator(
        restartedRepository,
        restartedService,
        downloader,
        root,
      ).initialize()
      const afterRestart = (await restartedRepository.listInstalled())[0]?.versions[0]
      assert.equal(afterRestart?.file.managedPath, expectedPath)
      assert.equal(afterRestart?.file.sha256, hash)
      assert.equal(afterRestart?.baseModelFamily, null)
      assert.equal(afterRestart?.format, 'PyTorch')
      assert.equal((await restartedService.getCatalog())[0]?.versions[0]?.fileStatus, 'ready')
      assert.deepEqual(await readFile(expectedPath), bytes)
    } finally {
      await reopened.close()
    }
  } finally {
    await database?.close()
    await rm(root, { force: true, recursive: true })
  }
})

test('the same .pth source is rejected when CivitAI identifies it as a checkpoint', async () => {
  const bytes = Buffer.from('checkpoint control')
  const hash = createHash('sha256').update(bytes).digest('hex')
  await assert.rejects(
    new CivitaiClient(civitaiApi('Checkpoint', hash, bytes.length)).previewImport(modelUrl, token),
    { code: 'CIVITAI_NO_SUPPORTED_FILE' },
  )
})
