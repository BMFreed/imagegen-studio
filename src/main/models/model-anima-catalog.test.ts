import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { openAppDatabase } from '../db/database.js'
import { CivitaiClient } from './civitai-client.js'
import { CivitaiTokenStore } from './civitai-token-store.js'
import { ModelRepository, type VerifiedModelArtifact } from './model-repository.js'
import { ModelService } from './model-service.js'

const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')

/** Real repository, dependency rows and files; only the trusted multi-GB pins use tiny substitutes. */
async function withCatalogFixture(
  use: (source: {
    bytes: { checkpoint: Buffer; qwen3_encoder: Buffer; vae: Buffer }
    database: ReturnType<typeof openAppDatabase>
    first: { fileId: string; resourceId: string; versionId: string }
    illustrious: { resourceId: string; versionId: string }
    paths: { checkpoint: string; qwen3_encoder: string; vae: string }
    qwen: { resourceId: string; versionId: string }
    repository: ModelRepository
    root: string
    service: ModelService
    vae: { resourceId: string; versionId: string }
  }) => Promise<void>,
) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-native-catalog-'))
  const database = openAppDatabase(root, path.resolve('src/main/db/migrations'))
  try {
    const repository = new ModelRepository(database.db)
    const bytes = {
      checkpoint: Buffer.from('trusted tiny Anima checkpoint'),
      qwen3_encoder: Buffer.from('trusted tiny Qwen3 encoder'),
      vae: Buffer.from('trusted tiny Anima VAE'),
    }
    const paths = {
      checkpoint: path.join(root, 'checkpoint.safetensors'),
      qwen3_encoder: path.join(root, 'qwen.safetensors'),
      vae: path.join(root, 'vae.safetensors'),
    }
    await Promise.all(
      (Object.keys(bytes) as (keyof typeof bytes)[]).map((role) =>
        writeFile(paths[role], bytes[role]),
      ),
    )
    const component = (role: 'qwen3_encoder' | 'vae'): VerifiedModelArtifact => ({
      file: {
        managedPath: paths[role],
        originalFilename: `${role}.safetensors`,
        sha256: sha(bytes[role]),
        sizeBytes: bytes[role].length,
        verifiedAt: '2026-10-05T00:00:00.000Z',
      },
      resource: {
        displayName: role,
        source: { key: `test/${role}`, kind: 'supported_dependency' },
        sourceMetadata: {},
        type: role,
      },
      version: {
        baseModelFamily: 'anima',
        format: 'SafeTensor',
        name: 'exact-v1',
        predictionType: null,
        source: {
          expectedSha256: sha(bytes[role]),
          kind: 'supported_dependency',
          revision: 'pinned-v1',
        },
        sourceMetadata: {},
      },
    })
    const qwen = await repository.publishVerifiedInstallation({
      primary: component('qwen3_encoder'),
    })
    const vae = await repository.publishVerifiedInstallation({ primary: component('vae') })
    const checkpoint = (family: 'anima' | 'illustrious'): VerifiedModelArtifact => ({
      file: {
        managedPath: paths.checkpoint,
        originalFilename: 'checkpoint.safetensors',
        sha256: sha(bytes.checkpoint),
        sizeBytes: bytes.checkpoint.length,
        verifiedAt: '2026-10-05T00:00:00.000Z',
      },
      resource: {
        displayName: `${family} checkpoint`,
        source: { kind: 'civitai', modelId: family === 'anima' ? 42 : 43 },
        sourceMetadata: {},
        type: 'checkpoint',
      },
      version: {
        baseModelFamily: family,
        format: 'SafeTensor',
        name: 'exact-v1',
        predictionType: null,
        source: {
          expectedSha256: sha(bytes.checkpoint),
          fileId: 701,
          kind: 'civitai',
          versionId: 7,
        },
        sourceMetadata: {},
      },
    })
    const first = await repository.publishVerifiedInstallation({
      dependencies: [
        { existingVersionId: qwen.versionId, role: 'qwen3_encoder' },
        { existingVersionId: vae.versionId, role: 'vae' },
      ],
      primary: checkpoint('anima'),
    })
    const illustrious = await repository.publishVerifiedInstallation({
      primary: checkpoint('illustrious'),
    })
    const service = new ModelService(
      repository,
      new CivitaiClient(),
      new CivitaiTokenStore(
        {
          decryptStringAsync: async () => ({ result: '', shouldReEncrypt: false }),
          encryptStringAsync: async () => Buffer.alloc(0),
          getSelectedStorageBackend: () => 'gnome_libsecret',
          isAsyncEncryptionAvailable: async () => true,
        },
        root,
      ),
      undefined,
      undefined,
      undefined,
      undefined,
      {
        checkpointQualifier: async () => {},
        qwen3Encoder: { sha256: sha(bytes.qwen3_encoder), sizeBytes: bytes.qwen3_encoder.length },
        vae: { sha256: sha(bytes.vae), sizeBytes: bytes.vae.length },
      },
    )
    await use({ bytes, database, first, illustrious, paths, qwen, repository, root, service, vae })
  } finally {
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
}

test('catalog exposes exact portable Anima companion bindings from real dependency rows without paths or Illustrious expansion', async () => {
  await withCatalogFixture(async (source) => {
    const before = await source.repository.listInstalled()
    const catalog = await source.service.getCatalog()
    assert.equal(catalog.length, 2, 'supported dependency resources stay hidden')
    const version = catalog.find((item) => item.id === source.first.resourceId)!.versions[0]
    assert.equal(version.fileStatus, 'ready')
    assert.deepEqual(version.dependencyIssues, [])
    assert.deepEqual(version.anima, {
      architecture: 'anima-base-1.0',
      checkpointByteSize: source.bytes.checkpoint.length,
      qwen3Encoder: {
        byteSize: source.bytes.qwen3_encoder.length,
        localModelId: source.qwen.resourceId,
        localVersionId: source.qwen.versionId,
        sha256: sha(source.bytes.qwen3_encoder),
      },
      vae: {
        byteSize: source.bytes.vae.length,
        localModelId: source.vae.resourceId,
        localVersionId: source.vae.versionId,
        sha256: sha(source.bytes.vae),
      },
    })
    assert.ok(!JSON.stringify(catalog).includes(source.root), 'managed paths never cross this DTO')
    const legacy = catalog.find((item) => item.id === source.illustrious.resourceId)!.versions[0]
    assert.equal(Object.hasOwn(legacy, 'anima'), false)
    assert.equal(legacy.predictionType, 'epsilon')
    version.anima.vae.sha256 = 'd'.repeat(64)
    assert.equal(
      (await source.service.getCatalog()).find((item) => item.id === source.first.resourceId)!
        .versions[0].anima!.vae.sha256,
      sha(source.bytes.vae),
      'returned metadata does not mutate the owner',
    )
    assert.deepEqual(await source.repository.listInstalled(), before)
    assert.deepEqual(await readFile(source.paths.vae), source.bytes.vae)
  })
})

test('missing and invalid exact companion rows omit the bundle while preserving the neighboring Illustrious version', async () => {
  for (const scenario of [
    'missing-file',
    'wrong-size',
    'marked-corrupt',
    'marked-missing',
    'wrong-sha',
    'wrong-family',
    'prediction-type',
    'wrong-role',
    'wrong-resource-type',
    'wrong-source',
    'unlinked',
    'wrong-pinned-size',
  ] as const) {
    await withCatalogFixture(async (source) => {
      const db = source.database.db
      const neighborBefore = (await source.service.getCatalog()).find(
        (item) => item.id === source.illustrious.resourceId,
      )
      switch (scenario) {
        case 'marked-corrupt':
        case 'marked-missing': {
          await db
            .updateTable('local_model_file')
            .set({ status: scenario === 'marked-corrupt' ? 'corrupt' : 'missing' })
            .where('resource_version_id', '=', source.vae.versionId)
            .execute()
          break
        }
        case 'missing-file': {
          await rm(source.paths.vae)
          break
        }
        case 'prediction-type': {
          await db
            .updateTable('model_resource_version')
            .set({ prediction_type: 'epsilon' })
            .where('id', '=', source.vae.versionId)
            .execute()
          break
        }
        case 'unlinked': {
          await db
            .deleteFrom('model_version_dependency')
            .where('checkpoint_version_id', '=', source.first.versionId)
            .where('role', '=', 'vae')
            .execute()
          break
        }
        case 'wrong-family': {
          await db
            .updateTable('model_resource_version')
            .set({ base_model_family: 'illustrious' })
            .where('id', '=', source.vae.versionId)
            .execute()
          break
        }
        case 'wrong-pinned-size': {
          await writeFile(source.paths.vae, Buffer.concat([source.bytes.vae, Buffer.from('x')]))
          await db
            .updateTable('local_model_file')
            .set({ size_bytes: source.bytes.vae.length + 1 })
            .where('resource_version_id', '=', source.vae.versionId)
            .execute()
          break
        }
        case 'wrong-resource-type': {
          await db
            .updateTable('model_resource')
            .set({ type: 'qwen3_encoder' })
            .where('id', '=', source.vae.resourceId)
            .execute()
          break
        }
        case 'wrong-role': {
          await db
            .updateTable('model_version_dependency')
            .set({ component_version_id: source.qwen.versionId })
            .where('checkpoint_version_id', '=', source.first.versionId)
            .where('role', '=', 'vae')
            .execute()
          break
        }
        case 'wrong-sha': {
          await db
            .updateTable('local_model_file')
            .set({ sha256: 'e'.repeat(64) })
            .where('resource_version_id', '=', source.vae.versionId)
            .execute()
          break
        }
        case 'wrong-size': {
          await writeFile(source.paths.vae, Buffer.concat([source.bytes.vae, Buffer.from('x')]))
          break
        }
        case 'wrong-source': {
          await db
            .updateTable('model_resource')
            .set({ civitai_model_id: 99, source_kind: 'civitai' })
            .where('id', '=', source.vae.resourceId)
            .execute()
          break
        }
      }
      const changed = await source.service.getCatalog()
      const native = changed.find((item) => item.id === source.first.resourceId)!.versions[0]
      assert.equal(native.fileStatus, 'missing', scenario)
      assert.deepEqual(native.dependencyIssues, ['vae'], scenario)
      assert.equal(Object.hasOwn(native, 'anima'), false, scenario)
      assert.deepEqual(
        changed.find((item) => item.id === source.illustrious.resourceId),
        neighborBefore,
        scenario,
      )
    })
  }
})

test('catalog preserves its fast provisional boundary and reuses detected full-verification failures', async () => {
  await withCatalogFixture(async (source) => {
    const catalog = await source.service.getCatalog()
    const selected = catalog.find((item) => item.id === source.first.resourceId)!
    const version = selected.versions[0]
    const reference = {
      baseModelFamily: 'anima' as const,
      civitaiFileId: version.civitaiFileId,
      civitaiModelId: selected.modelId,
      civitaiVersionId: version.civitaiVersionId,
      displayName: selected.name,
      fileSha256: version.sha256,
      kind: 'checkpoint' as const,
      localModelId: selected.id,
      localVersionId: version.id,
      predictionType: null,
      versionName: version.name,
    }
    const tampered = Buffer.from(source.bytes.vae)
    tampered[0] ^= 0xff
    await writeFile(source.paths.vae, tampered)
    assert.ok(
      (await source.service.getCatalog()).find((item) => item.id === source.first.resourceId)!
        .versions[0].anima,
      'cold catalog does not claim full byte requalification',
    )
    await assert.rejects(source.service.resolveVerifiedGenerationAnimaBundleForPlan(reference), {
      code: 'ANIMA_DEPENDENCY_UNAVAILABLE',
    })
    const detected = (await source.service.getCatalog()).find(
      (item) => item.id === source.first.resourceId,
    )!.versions[0]
    assert.equal(detected.fileStatus, 'missing')
    assert.deepEqual(detected.dependencyIssues, ['vae'])
    assert.equal(Object.hasOwn(detected, 'anima'), false)
  })
})
