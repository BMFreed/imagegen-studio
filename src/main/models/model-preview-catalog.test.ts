import type { ModelCatalogItem, ModelVersionView } from '../../shared/api.js'

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import type { AppDatabase } from '../db/database.js'
import type { SafeStorageAdapter } from './civitai-token-store.js'
import type { ModelPreviewCache } from './model-preview-cache.js'
import type { PublishedInstallation, VerifiedModelArtifact } from './model-repository.js'

import { openAppDatabase } from '../db/database.js'
import { CivitaiClient } from './civitai-client.js'
import { CivitaiTokenStore } from './civitai-token-store.js'
import { ModelRepository } from './model-repository.js'
import { ModelService } from './model-service.js'

const migrations = path.resolve('src/main/db/migrations')
const FIRST_URL = 'https://image.civitai.com/first-version.png'
const SECOND_URL = 'https://image.civitai.com/second-version.png'

// The codec/cache is an external collaborator here. These distinguish its products; these
// tests make no assertions about decoding, image quality or derivative persistence.
const FIRST_ARTWORK = {
  previewDataUrl: 'data:image/png;base64,Zmlyc3QtcHJldmlldw==',
  thumbnailDataUrl: 'data:image/png;base64,Zmlyc3QtdGh1bWJuYWls',
}
const SECOND_ARTWORK = {
  previewDataUrl: 'data:image/png;base64,c2Vjb25kLXByZXZpZXc=',
  thumbnailDataUrl: 'data:image/png;base64,c2Vjb25kLXRodW1ibmFpbA==',
}

const safeStorage: SafeStorageAdapter = {
  decryptStringAsync: async () => ({ result: '', shouldReEncrypt: false }),
  encryptStringAsync: async () => Buffer.alloc(0),
  getSelectedStorageBackend: () => 'gnome_libsecret',
  isAsyncEncryptionAvailable: async () => true,
}

interface Harness {
  database: AppDatabase
  repository: ModelRepository
  restart: () => Promise<void>
  root: string
  service: (
    previews?: Partial<Pick<ModelPreviewCache, 'read'>> & Pick<ModelPreviewCache, 'get'>,
  ) => ModelService
}

async function withCatalog(run: (harness: Harness) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'igs-resource-preview-catalog-'))
  let database = openAppDatabase(root, migrations)
  let repository = new ModelRepository(database.db)
  const offlineTransport: typeof fetch = async () => {
    assert.fail('Installed catalog projection must not fetch CivitAI metadata or tokens')
  }
  try {
    await run({
      get database() {
        return database
      },
      get repository() {
        return repository
      },
      restart: async () => {
        await database.close()
        database = openAppDatabase(root, migrations)
        repository = new ModelRepository(database.db)
      },
      root,
      service: (previews) =>
        new ModelService(
          repository,
          new CivitaiClient(offlineTransport),
          new CivitaiTokenStore(safeStorage, root),
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          previews ? { get: previews.get, read: previews.read ?? previews.get } : undefined,
        ),
    })
  } finally {
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
}

async function publishVersion(
  harness: Harness,
  options: {
    resourcePreviewUrl: string | null
    sourceMetadata: Record<string, unknown>
    versionId: number
  },
): Promise<PublishedInstallation> {
  const filename = `catalog-only-version-${options.versionId}.safetensors`
  const directory = path.join(harness.root, 'models')
  await mkdir(directory, { mode: 0o700, recursive: true })
  const managedPath = path.join(directory, filename)
  // Deliberately not ML weights: exercise registry hashing/identity, never inference qualification.
  const bytes = Buffer.from(`registry fixture ${options.versionId}`)
  await writeFile(managedPath, bytes, { mode: 0o600 })
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const artifact: VerifiedModelArtifact = {
    file: {
      managedPath,
      originalFilename: filename,
      sha256,
      sizeBytes: bytes.length,
      verifiedAt: '2026-10-13T00:00:00.000Z',
    },
    resource: {
      displayName: 'Catalog-only resource',
      previewUrl: options.resourcePreviewUrl,
      source: { kind: 'civitai', modelId: 42 },
      sourceMetadata: {},
      type: 'lora',
    },
    version: {
      baseModelFamily: 'illustrious',
      format: 'safetensors',
      name: `v${options.versionId}`,
      predictionType: null,
      source: {
        expectedSha256: sha256,
        fileId: options.versionId * 100 + 1,
        kind: 'civitai',
        versionId: options.versionId,
      },
      sourceMetadata: options.sourceMetadata,
    },
  }
  return harness.repository.publishVerifiedInstallation({ primary: artifact })
}

function exactVersion(resource: ModelCatalogItem, id: string): ModelVersionView {
  const version = resource.versions.find((candidate) => candidate.id === id)
  assert.ok(version, `Expected installed version ${id}`)
  return version
}

function artwork(view: ModelCatalogItem | ModelVersionView) {
  return { previewDataUrl: view.previewDataUrl, thumbnailDataUrl: view.thumbnailDataUrl }
}

const knownPreviews: Partial<Pick<ModelPreviewCache, 'read'>> & Pick<ModelPreviewCache, 'get'> = {
  get: async (url) => {
    if (url === FIRST_URL) {
      return FIRST_ARTWORK
    }
    if (url === SECOND_URL) {
      return SECOND_ARTWORK
    }
    assert.fail(`Unexpected preview ownership: ${url}`)
  },
}

test('catalog artwork follows each exact version and the selected default, preserving portable refs', async () => {
  await withCatalog(async (harness) => {
    const first = await publishVersion(harness, {
      resourcePreviewUrl: FIRST_URL,
      sourceMetadata: { previewImageUrl: FIRST_URL, trainedWords: ['first trigger'] },
      versionId: 7,
    })
    const second = await publishVersion(harness, {
      resourcePreviewUrl: SECOND_URL,
      sourceMetadata: { previewImageUrl: SECOND_URL, trainedWords: ['second trigger'] },
      versionId: 8,
    })
    assert.equal(second.resourceId, first.resourceId)
    const installedBefore = await harness.repository.listInstalled()
    assert.equal(installedBefore[0]?.previewUrl, SECOND_URL)
    assert.equal(installedBefore[0]?.defaultVersionId, first.versionId)

    const service = harness.service(knownPreviews)
    const firstReference = await service.resolveGenerationLora(first.resourceId, first.versionId)
    const secondReference = await service.resolveGenerationLora(second.resourceId, second.versionId)
    const [before] = await service.getCatalog()
    assert.ok(before)
    assert.deepEqual(artwork(before), FIRST_ARTWORK)
    assert.deepEqual(artwork(exactVersion(before, first.versionId)), FIRST_ARTWORK)
    assert.deepEqual(artwork(exactVersion(before, second.versionId)), SECOND_ARTWORK)
    assert.deepEqual(before.trainedWords, ['first trigger'])
    assert.deepEqual(exactVersion(before, second.versionId).trainedWords, ['second trigger'])
    assert.equal(exactVersion(before, first.versionId).fileStatus, 'ready')
    assert.equal(exactVersion(before, second.versionId).fileStatus, 'ready')

    await service.setDefaultVersion(first.resourceId, second.versionId)
    const [after] = await service.getCatalog()
    assert.ok(after)
    assert.equal(after.defaultVersionId, second.versionId)
    assert.deepEqual(artwork(after), SECOND_ARTWORK)
    assert.deepEqual(after.versions, before.versions)
    assert.deepEqual(after.trainedWords, ['second trigger'])
    assert.deepEqual(
      await service.resolveGenerationLora(first.resourceId, first.versionId),
      firstReference,
    )
    assert.deepEqual(
      await service.resolveGenerationLora(second.resourceId, second.versionId),
      secondReference,
    )
    const installedAfter = await harness.repository.listInstalled()
    assert.deepEqual(installedAfter[0]?.versions, installedBefore[0]?.versions)
    for (const version of installedAfter[0].versions) {
      const bytes = await readFile(version.file.managedPath)
      assert.equal(createHash('sha256').update(bytes).digest('hex'), version.file.sha256)
    }
  })
})

test('exact-version preview source identity survives closing and reopening SQLite', async () => {
  await withCatalog(async (harness) => {
    const first = await publishVersion(harness, {
      resourcePreviewUrl: FIRST_URL,
      sourceMetadata: { previewImageUrl: FIRST_URL },
      versionId: 7,
    })
    const second = await publishVersion(harness, {
      resourcePreviewUrl: SECOND_URL,
      sourceMetadata: { previewImageUrl: SECOND_URL },
      versionId: 8,
    })
    await harness.service().setDefaultVersion(first.resourceId, second.versionId)
    await harness.restart()
    const installed = await harness.repository.listInstalled()
    assert.equal(installed[0]?.defaultVersionId, second.versionId)
    assert.equal(
      installed[0]?.versions.find((version) => version.id === first.versionId)?.sourceMetadata
        .previewImageUrl,
      FIRST_URL,
    )
    assert.equal(
      installed[0]?.versions.find((version) => version.id === second.versionId)?.sourceMetadata
        .previewImageUrl,
      SECOND_URL,
    )
    const [resource] = await harness.service(knownPreviews).getCatalog()
    assert.ok(resource)
    assert.deepEqual(artwork(resource), SECOND_ARTWORK)
    assert.deepEqual(artwork(exactVersion(resource, first.versionId)), FIRST_ARTWORK)
    assert.deepEqual(artwork(exactVersion(resource, second.versionId)), SECOND_ARTWORK)
  })
})

for (const failure of ['no-image', 'cache-error', 'no-collaborator'] as const) {
  test(`${failure} artwork leaves a ready exact version selectable without borrowing a sibling preview`, async () => {
    await withCatalog(async (harness) => {
      const first = await publishVersion(harness, {
        resourcePreviewUrl: FIRST_URL,
        sourceMetadata: { previewImageUrl: FIRST_URL },
        versionId: 7,
      })
      const second = await publishVersion(harness, {
        resourcePreviewUrl: SECOND_URL,
        sourceMetadata: { previewImageUrl: SECOND_URL },
        versionId: 8,
      })
      const before = await harness.repository.listInstalled()
      const expectedReference = await harness
        .service()
        .resolveGenerationLora(first.resourceId, first.versionId)
      const calls: string[] = []
      const service = harness.service(
        failure === 'no-collaborator'
          ? undefined
          : {
              get: async (url) => {
                calls.push(url)
                if (url === SECOND_URL) {
                  return SECOND_ARTWORK
                }
                assert.equal(url, FIRST_URL)
                if (failure === 'cache-error') {
                  throw new Error('External artwork unavailable')
                }
                return null
              },
            },
      )
      const [resource] = await service.getCatalog()
      assert.ok(resource)
      assert.deepEqual(artwork(resource), { previewDataUrl: null, thumbnailDataUrl: null })
      assert.deepEqual(artwork(exactVersion(resource, first.versionId)), {
        previewDataUrl: null,
        thumbnailDataUrl: null,
      })
      assert.deepEqual(
        artwork(exactVersion(resource, second.versionId)),
        failure === 'no-collaborator'
          ? { previewDataUrl: null, thumbnailDataUrl: null }
          : SECOND_ARTWORK,
      )
      assert.ok(resource.versions.every((version) => version.fileStatus === 'ready'))
      assert.deepEqual(
        await service.resolveGenerationLora(first.resourceId, first.versionId),
        expectedReference,
      )
      assert.deepEqual(await harness.repository.listInstalled(), before)
      assert.deepEqual(calls.sort(), failure === 'no-collaborator' ? [] : [FIRST_URL, SECOND_URL])
    })
  })
}

test('legacy single-version artwork is usable but becomes unowned when another legacy version is installed', async () => {
  await withCatalog(async (harness) => {
    const first = await publishVersion(harness, {
      resourcePreviewUrl: FIRST_URL,
      sourceMetadata: {},
      versionId: 7,
    })
    const calls: string[] = []
    const service = harness.service({
      get: async (url) => {
        calls.push(url)
        return knownPreviews.get(url)
      },
    })
    const [single] = await service.getCatalog()
    assert.ok(single)
    assert.deepEqual(artwork(single), FIRST_ARTWORK)
    assert.deepEqual(artwork(exactVersion(single, first.versionId)), FIRST_ARTWORK)
    assert.deepEqual(calls, [FIRST_URL])

    await publishVersion(harness, {
      resourcePreviewUrl: SECOND_URL,
      sourceMetadata: {},
      versionId: 8,
    })
    calls.length = 0
    const [multiple] = await service.getCatalog()
    assert.ok(multiple)
    assert.deepEqual(artwork(multiple), { previewDataUrl: null, thumbnailDataUrl: null })
    assert.ok(multiple.versions.every((version) => version.fileStatus === 'ready'))
    assert.deepEqual(multiple.versions.map(artwork), [
      { previewDataUrl: null, thumbnailDataUrl: null },
      { previewDataUrl: null, thumbnailDataUrl: null },
    ])
    assert.deepEqual(calls, [])
  })
})

test('explicitly absent exact-version artwork never adopts the historical resource preview', async () => {
  await withCatalog(async (harness) => {
    const first = await publishVersion(harness, {
      resourcePreviewUrl: SECOND_URL,
      sourceMetadata: { previewImageUrl: null },
      versionId: 7,
    })
    const service = harness.service({
      get: async () => assert.fail('An explicitly absent version image has no source to fetch'),
    })
    const [resource] = await service.getCatalog()
    assert.ok(resource)
    assert.deepEqual(artwork(resource), { previewDataUrl: null, thumbnailDataUrl: null })
    assert.deepEqual(artwork(exactVersion(resource, first.versionId)), {
      previewDataUrl: null,
      thumbnailDataUrl: null,
    })
    assert.equal(exactVersion(resource, first.versionId).fileStatus, 'ready')
    assert.equal(
      (await service.resolveGenerationLora(first.resourceId, first.versionId)).localVersionId,
      first.versionId,
    )
  })
})

test('operational catalog reads cannot start optional artwork builds; UI can request them', async () => {
  await withCatalog(async (harness) => {
    const first = await publishVersion(harness, {
      resourcePreviewUrl: FIRST_URL,
      sourceMetadata: { previewImageUrl: FIRST_URL },
      versionId: 7,
    })
    let builds = 0
    let reads = 0
    const service = harness.service({
      get: async (url) => {
        assert.equal(url, FIRST_URL)
        builds++
        return FIRST_ARTWORK
      },
      read: async (url) => {
        assert.equal(url, FIRST_URL)
        reads++
        return null
      },
    })
    assert.equal((await service.getCatalog())[0]?.previewDataUrl, null)
    assert.equal(builds, 0)
    const ref = await service.resolveGenerationLora(first.resourceId, first.versionId)
    assert.equal(ref.localVersionId, first.versionId)
    assert.equal(builds, 0, 'Prepare resource resolution must never wait on source downloads')
    assert.ok(reads > 0)
    assert.equal(
      (await service.getCatalog({ buildPreviews: true }))[0]?.previewDataUrl,
      FIRST_ARTWORK.previewDataUrl,
    )
    assert.equal(builds, 1)
  })
})

test('a resource without a selected default never borrows its first version artwork', async () => {
  await withCatalog(async (harness) => {
    const first = await publishVersion(harness, {
      resourcePreviewUrl: FIRST_URL,
      sourceMetadata: { previewImageUrl: FIRST_URL },
      versionId: 7,
    })
    await harness.database.db
      .updateTable('model_resource')
      .set({ default_version_id: null })
      .where('id', '=', first.resourceId)
      .execute()
    const resource = (await harness.service(knownPreviews).getCatalog())[0]
    assert.ok(resource)
    assert.equal(resource.defaultVersionId, null)
    assert.deepEqual(artwork(resource), { previewDataUrl: null, thumbnailDataUrl: null })
    assert.deepEqual(artwork(exactVersion(resource, first.versionId)), FIRST_ARTWORK)
    assert.equal(exactVersion(resource, first.versionId).fileStatus, 'ready')
  })
})
