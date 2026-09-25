import type { ModelInstallJobView } from '../../shared/api.js'

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, open, readdir, rm, stat, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { openAppDatabase } from '../db/database.js'
import {
  ANIMA_BASE_1_0_CHECKPOINT,
  ANIMA_BASE_1_0_TOTAL_BYTES,
  ANIMA_QWEN3_0_6B_ENCODER,
  ANIMA_QWEN_IMAGE_VAE,
  type AnimaArtifact,
} from './anima-manifest.js'
import { CivitaiClient } from './civitai-client.js'
import { CivitaiTokenStore, type SafeStorageAdapter } from './civitai-token-store.js'
import {
  type ModelDownloader,
  ModelDownloadError,
  type ModelDownloadInput,
  type VerifiedStagedModelFile,
} from './model-downloader.js'
import { ModelInstallCoordinator } from './model-install-coordinator.js'
import {
  type CreateInstallArtifactInput,
  ModelRepository,
  type VerifiedModelArtifact,
} from './model-repository.js'
import { ModelService } from './model-service.js'

const migrations = path.resolve('src/main/db/migrations')
const modelUrl = 'https://civitai.com/models/42?modelVersionId=7'
const fileUrl = 'https://civitai.com/api/download/models/7?fileId=701'
const token = 'test-token'

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

function civitaiApi(): typeof fetch {
  return async (input) => {
    const pathname = new URL(String(input)).pathname
    const body =
      pathname === '/api/v1/me'
        ? { id: 1 }
        : pathname === '/api/v1/models/42'
          ? {
              id: 42,
              modelVersions: [{ baseModel: 'Anima', id: 7, name: 'Base 1.0' }],
              name: 'Anima Base',
              type: 'Checkpoint',
            }
          : {
              baseModel: 'Anima',
              files: [
                {
                  downloadUrl: fileUrl,
                  hashes: { SHA256: ANIMA_BASE_1_0_CHECKPOINT.sha256 },
                  id: 701,
                  metadata: { format: 'SafeTensor' },
                  name: 'anima-base-v1.0.safetensors',
                  primary: true,
                  sizeKB: Math.floor(ANIMA_BASE_1_0_CHECKPOINT.sizeBytes / 1024),
                },
              ],
              id: 7,
              images: [],
              modelId: 42,
              name: 'Base 1.0',
            }
    return new Response(JSON.stringify(body), {
      headers: { 'content-type': 'application/json' },
    })
  }
}

/** This fake checks the coordinator contract. Real byte hashing belongs to ModelDownloader tests. */
async function stageSparse(input: ModelDownloadInput): Promise<VerifiedStagedModelFile> {
  assert.ok(input.expectedBytes, 'A pinned Anima artifact must have an exact byte size')
  assert.ok(input.expectedSha256, 'A pinned Anima artifact must have a SHA-256 digest')
  await mkdir(input.stagingDirectory, { recursive: true })
  const stagingPath = path.join(input.stagingDirectory, `${randomUUID()}.part`)
  const file = await open(stagingPath, 'wx', 0o600)
  try {
    await file.truncate(input.expectedBytes)
  } finally {
    await file.close()
  }
  return {
    sha256: input.expectedSha256,
    sizeBytes: input.expectedBytes,
    stagingPath,
  }
}

function fakeDownloader(onDownload?: (input: ModelDownloadInput) => Promise<void>): {
  calls: ModelDownloadInput[]
  downloader: ModelDownloader
} {
  const calls: ModelDownloadInput[] = []
  const downloader = {
    async download(input: ModelDownloadInput): Promise<VerifiedStagedModelFile> {
      calls.push(input)
      await onDownload?.(input)
      return stageSparse(input)
    },
  } as unknown as ModelDownloader
  return { calls, downloader }
}

async function withHarness(
  downloader: ModelDownloader,
  run: (harness: {
    coordinator: ModelInstallCoordinator
    repository: ModelRepository
    root: string
    service: ModelService
  }) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'igs-anima-install-'))
  const database = openAppDatabase(root, migrations)
  try {
    const repository = new ModelRepository(database.db)
    const service = new ModelService(
      repository,
      new CivitaiClient(civitaiApi()),
      new CivitaiTokenStore(safeStorage(), root),
    )
    const coordinator = new ModelInstallCoordinator(repository, service, downloader, root)
    await coordinator.initialize()
    await service.saveToken(token)
    await run({ coordinator, repository, root, service })
  } finally {
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
}

async function preview(service: ModelService): Promise<string> {
  const result = await service.previewImport(modelUrl)
  assert.equal(result.kind, 'select-file')
  if (result.kind !== 'select-file') {
    throw new Error('Expected Anima file selection')
  }
  assert.equal(result.totalAdditionalBytes, ANIMA_BASE_1_0_TOTAL_BYTES)
  assert.deepEqual(
    result.dependencies.map((dependency) => dependency.role),
    ['qwen3_encoder', 'vae'],
  )
  return result.previewId
}

async function waitForTerminal(
  coordinator: ModelInstallCoordinator,
  start: () => Promise<ModelInstallJobView>,
): Promise<ModelInstallJobView> {
  let resolveTerminal!: (job: ModelInstallJobView) => void
  const terminal = new Promise<ModelInstallJobView>((resolve) => {
    resolveTerminal = resolve
  })
  const unsubscribe = coordinator.onChanged((job) => {
    if (['canceled', 'completed', 'failed'].includes(job.status)) {
      resolveTerminal(job)
    }
  })
  const timeout = setTimeout(() => {
    resolveTerminal({
      bytesDownloaded: 0,
      error: { code: 'TEST_TIMEOUT', message: 'Install did not finish' },
      id: 'timeout',
      modelName: '',
      status: 'failed',
      totalBytes: null,
      versionName: '',
    })
  }, 5000)
  try {
    const started = await start()
    const result = await terminal
    assert.equal(result.id, started.id, result.error?.message ?? '')
    return result
  } finally {
    clearTimeout(timeout)
    unsubscribe()
  }
}

async function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  let timer!: ReturnType<typeof setTimeout>
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), 5000)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

async function assertNoPublishedFiles(root: string): Promise<void> {
  const modelRoot = path.join(root, 'models')
  for (let attempt = 0; attempt < 100; attempt++) {
    const staged = await readdir(path.join(modelRoot, '.staging'))
    const managed = await Promise.all(
      [ANIMA_BASE_1_0_CHECKPOINT, ANIMA_QWEN3_0_6B_ENCODER, ANIMA_QWEN_IMAGE_VAE].map(
        async (artifact) =>
          stat(path.join(modelRoot, artifact.sha256.slice(0, 2), `${artifact.sha256}.safetensors`))
            .then(() => true)
            .catch(() => false),
      ),
    )
    if (staged.length === 0 && managed.every((exists) => !exists)) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  assert.fail('A failed or canceled Anima group left a staged or published file')
}

async function publishExistingCompanion(
  root: string,
  repository: ModelRepository,
  artifact: AnimaArtifact,
): Promise<string> {
  const role = artifact.role === 'qwen3-encoder' ? 'qwen3_encoder' : 'vae'
  const directory = path.join(root, 'models', artifact.sha256.slice(0, 2))
  await mkdir(directory, { recursive: true })
  const managedPath = path.join(directory, `${artifact.sha256}.safetensors`)
  const file = await open(managedPath, 'wx', 0o600)
  try {
    await file.truncate(artifact.sizeBytes)
  } finally {
    await file.close()
  }
  const primary: VerifiedModelArtifact = {
    file: {
      managedPath,
      originalFilename: path.basename(artifact.path),
      sha256: artifact.sha256,
      sizeBytes: artifact.sizeBytes,
      verifiedAt: new Date().toISOString(),
    },
    resource: {
      displayName: `Existing ${role}`,
      source: { key: `anima:${artifact.role}:${artifact.sha256}`, kind: 'supported_dependency' },
      sourceMetadata: {},
      type: role,
    },
    version: {
      baseModelFamily: 'anima',
      format: 'SafeTensor',
      name: path.basename(artifact.path),
      source: {
        expectedSha256: artifact.sha256,
        kind: 'supported_dependency',
        revision: artifact.revision,
      },
      sourceMetadata: {},
    },
  }
  return (await repository.publishVerifiedInstallation({ primary })).versionId
}

test('Anima group publishes one checkpoint linked to both pinned companion records', async () => {
  const { calls, downloader } = fakeDownloader()
  await withHarness(downloader, async ({ coordinator, repository, root, service }) => {
    const previewId = await preview(service)
    const job = await waitForTerminal(coordinator, () =>
      coordinator.startInstall(previewId, 701, true),
    )
    assert.equal(job.status, 'completed', job.error?.message ?? '')
    assert.equal(job.totalBytes, ANIMA_BASE_1_0_TOTAL_BYTES)
    assert.deepEqual(
      calls.map(({ bearerToken, expectedBytes, expectedSha256, source, url }) => ({
        bearerToken: bearerToken ?? null,
        expectedBytes,
        expectedSha256,
        source,
        url,
      })),
      [
        {
          bearerToken: token,
          expectedBytes: ANIMA_BASE_1_0_CHECKPOINT.sizeBytes,
          expectedSha256: ANIMA_BASE_1_0_CHECKPOINT.sha256,
          source: 'civitai',
          url: fileUrl,
        },
        ...[ANIMA_QWEN3_0_6B_ENCODER, ANIMA_QWEN_IMAGE_VAE].map((artifact) => ({
          bearerToken: null,
          expectedBytes: artifact.sizeBytes,
          expectedSha256: artifact.sha256,
          source: 'anima-huggingface',
          url: artifact.url,
        })),
      ],
    )
    const installed = await repository.listInstalled()
    assert.equal(installed.length, 3)
    const checkpoint = installed.find((item) => item.type === 'checkpoint')
    const qwen = installed.find((item) => item.type === 'qwen3_encoder')
    const vae = installed.find((item) => item.type === 'vae')
    assert.ok(checkpoint)
    assert.ok(qwen)
    assert.ok(vae)
    assert.deepEqual(checkpoint.versions[0]?.dependencyVersionIds, {
      qwen3_encoder: qwen.versions[0]?.id,
      vae: vae.versions[0]?.id,
    })
    assert.equal(checkpoint.defaultVersionId, checkpoint.versions[0]?.id)
    const persistedJob = (await repository.listInstallJobs()).find((item) => item.id === job.id)
    assert.equal(persistedJob?.status, 'completed')
    assert.deepEqual(
      persistedJob?.artifacts
        .map((artifact) => [artifact.role, artifact.status])
        .sort((left, right) => left[0].localeCompare(right[0])),
      [
        ['primary', 'ready'],
        ['qwen3_encoder', 'ready'],
        ['vae', 'ready'],
      ],
    )
    assert.ok((await stat(checkpoint.versions[0].file.managedPath)).isFile())
    assert.ok((await stat(qwen.versions[0].file.managedPath)).isFile())
    assert.ok((await stat(vae.versions[0].file.managedPath)).isFile())

    // Sparse fake files stand in for the pinned bytes. The catalog must not claim they hash-ready.
    await unlink(qwen.versions[0].file.managedPath)
    await assert.rejects(stat(qwen.versions[0].file.managedPath), { code: 'ENOENT' })
    assert.equal((await repository.listInstalled()).length, 3)
    assert.ok((await stat(checkpoint.versions[0].file.managedPath)).isFile())
  })
})

test('failed VAE download leaves neither checkpoint nor newly downloaded Qwen3 selectable', async () => {
  const { calls, downloader } = fakeDownloader(async (input) => {
    if (input.url === ANIMA_QWEN_IMAGE_VAE.url) {
      throw new ModelDownloadError('TEST_VAE_FAILED', 'Fake VAE download failed')
    }
  })
  await withHarness(downloader, async ({ coordinator, repository, root, service }) => {
    const previewId = await preview(service)
    const job = await waitForTerminal(coordinator, () =>
      coordinator.startInstall(previewId, 701, true),
    )
    assert.equal(job.status, 'failed')
    assert.equal(job.error?.code, 'TEST_VAE_FAILED')
    assert.deepEqual(
      calls.map((call) => call.url),
      [fileUrl, ANIMA_QWEN3_0_6B_ENCODER.url, ANIMA_QWEN_IMAGE_VAE.url],
    )
    assert.deepEqual(await repository.listInstalled(), [])
    assert.deepEqual(await service.getCatalog(), [])
    await assertNoPublishedFiles(root)
  })
})

test('cancel during a required companion download leaves no selectable Anima group', async () => {
  let reachedVae!: () => void
  const vaeStarted = new Promise<void>((resolve) => {
    reachedVae = resolve
  })
  const { downloader } = fakeDownloader(async (input) => {
    if (input.url !== ANIMA_QWEN_IMAGE_VAE.url) {
      return
    }
    reachedVae()
    await new Promise<void>((_resolve, reject) => {
      const canceled = () =>
        reject(new ModelDownloadError('DOWNLOAD_CANCELED', 'The download was canceled.'))
      if (input.signal?.aborted) {
        canceled()
      } else {
        input.signal?.addEventListener('abort', canceled, { once: true })
      }
    })
  })
  await withHarness(downloader, async ({ coordinator, repository, root, service }) => {
    const previewId = await preview(service)
    let resolveTerminal!: (job: ModelInstallJobView) => void
    const terminal = new Promise<ModelInstallJobView>((resolve) => {
      resolveTerminal = resolve
    })
    const unsubscribe = coordinator.onChanged((job) => {
      if (['canceled', 'completed', 'failed'].includes(job.status)) {
        resolveTerminal(job)
      }
    })
    try {
      const started = await coordinator.startInstall(previewId, 701, true)
      await withTimeout(vaeStarted, 'VAE download did not start')
      await coordinator.cancelInstall(started.id)
      const finished = await withTimeout(terminal, 'Canceled Anima job did not stop')
      assert.equal(finished.id, started.id)
      assert.equal(finished.status, 'canceled')
      assert.deepEqual(await repository.listInstalled(), [])
      assert.deepEqual(await service.getCatalog(), [])
      await assertNoPublishedFiles(root)
    } finally {
      unsubscribe()
    }
  })
})

test('verified Qwen3 companion is reused and only checkpoint plus missing VAE are downloaded', async () => {
  const { calls, downloader } = fakeDownloader()
  await withHarness(downloader, async ({ coordinator, repository, root, service }) => {
    const existingQwenId = await publishExistingCompanion(
      root,
      repository,
      ANIMA_QWEN3_0_6B_ENCODER,
    )
    const preinstalled = await repository.listInstalled()
    assert.equal(preinstalled[0]?.type, 'qwen3_encoder')
    assert.equal(preinstalled[0]?.versions[0]?.file.sha256, ANIMA_QWEN3_0_6B_ENCODER.sha256)
    assert.equal(preinstalled[0]?.versions[0]?.file.status, 'ready')
    assert.equal(
      (await stat(preinstalled[0].versions[0].file.managedPath)).size,
      ANIMA_QWEN3_0_6B_ENCODER.sizeBytes,
    )
    // ModelService normally hashes every candidate before reuse. This orchestration test uses a
    // sparse file and a fake downloader; a separate test covers real hash verification.
    const findVerified = service.findVerifiedFileByHash.bind(service)
    service.findVerifiedFileByHash = async (sha256, requiredType) =>
      sha256 === ANIMA_QWEN3_0_6B_ENCODER.sha256 &&
      (requiredType === undefined || requiredType === 'qwen3_encoder')
        ? preinstalled[0].versions[0].file
        : findVerified(sha256, requiredType)
    const result = await service.previewImport(modelUrl)
    assert.equal(result.kind, 'select-file')
    if (result.kind !== 'select-file') {
      throw new Error('Expected Anima file selection')
    }
    assert.deepEqual(
      result.dependencies.map((dependency) => [dependency.role, dependency.alreadyInstalled]),
      [
        ['qwen3_encoder', true],
        ['vae', false],
      ],
    )
    assert.equal(
      result.totalAdditionalBytes,
      ANIMA_BASE_1_0_CHECKPOINT.sizeBytes + ANIMA_QWEN_IMAGE_VAE.sizeBytes,
    )
    assert.deepEqual(
      result.dependencies.map((dependency) => [dependency.role, dependency.alreadyInstalled]),
      [
        ['qwen3_encoder', true],
        ['vae', false],
      ],
    )
    const job = await waitForTerminal(coordinator, () =>
      coordinator.startInstall(result.previewId, 701, true),
    )
    assert.equal(job.status, 'completed', job.error?.message ?? '')
    assert.equal(
      job.totalBytes,
      ANIMA_BASE_1_0_CHECKPOINT.sizeBytes + ANIMA_QWEN_IMAGE_VAE.sizeBytes,
    )
    assert.deepEqual(
      calls.map((call) => call.url),
      [fileUrl, ANIMA_QWEN_IMAGE_VAE.url],
    )
    const checkpoint = (await repository.listInstalled()).find((item) => item.type === 'checkpoint')
    assert.ok(checkpoint)
    assert.equal(checkpoint.versions[0]?.dependencyVersionIds.qwen3_encoder, existingQwenId)
    assert.equal((await repository.listInstalled()).length, 3)
  })
})

test('restart marks an interrupted Anima group failed and removes its orphaned files', async () => {
  const { downloader } = fakeDownloader()
  await withHarness(downloader, async ({ coordinator, repository, root, service }) => {
    const jobId = await repository.createInstallJob({
      artifacts: [
        {
          expectedSha256: ANIMA_BASE_1_0_CHECKPOINT.sha256,
          expectedSizeBytes: ANIMA_BASE_1_0_CHECKPOINT.sizeBytes,
          role: 'primary',
          source: { fileId: 701, kind: 'civitai_file' },
        },
        ...[ANIMA_QWEN3_0_6B_ENCODER, ANIMA_QWEN_IMAGE_VAE].map(
          (artifact): CreateInstallArtifactInput => ({
            expectedSha256: artifact.sha256,
            expectedSizeBytes: artifact.sizeBytes,
            role: artifact.role === 'qwen3-encoder' ? 'qwen3_encoder' : 'vae',
            source: {
              key: `anima:${artifact.role}:${artifact.sha256}`,
              kind: 'supported_dependency' as const,
            },
          }),
        ),
      ],
      baseModelFamily: 'anima',
      civitaiFileId: 701,
      civitaiModelId: 42,
      civitaiVersionId: 7,
      displayName: 'Anima Base',
      resourceType: 'checkpoint',
      versionName: 'Base 1.0',
    })
    await repository.updateInstallJob(jobId, { status: 'downloading' })
    const stagingPath = path.join(root, 'models', '.staging', `${randomUUID()}.part`)
    const staged = await open(stagingPath, 'wx', 0o600)
    try {
      await staged.writeFile('incomplete download')
    } finally {
      await staged.close()
    }
    await repository.updateInstallArtifact(jobId, 'primary', {
      status: 'downloading',
      tempPath: stagingPath,
    })
    const orphanDirectory = path.join(root, 'models', ANIMA_QWEN3_0_6B_ENCODER.sha256.slice(0, 2))
    await mkdir(orphanDirectory)
    const orphanPath = path.join(orphanDirectory, `${ANIMA_QWEN3_0_6B_ENCODER.sha256}.safetensors`)
    const orphan = await open(orphanPath, 'wx', 0o600)
    await orphan.close()

    const restarted = new ModelInstallCoordinator(repository, service, downloader, root)
    await restarted.initialize()
    const job = (await restarted.listJobs()).find((item) => item.id === jobId)
    assert.equal(job?.status, 'failed')
    assert.equal(job.error?.code, 'interrupted')
    assert.deepEqual(await repository.listInstalled(), [])
    assert.deepEqual(await readdir(path.join(root, 'models', '.staging')), [])
    await assert.rejects(stat(orphanPath), { code: 'ENOENT' })
    assert.deepEqual(await coordinator.listJobs(), await restarted.listJobs())
  })
})
