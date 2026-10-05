import type { IgsProjectDocumentV1 } from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { openAppDatabase } from '../db/database.js'
import { CivitaiClient } from './civitai-client.js'
import { CivitaiTokenStore, type SafeStorageAdapter } from './civitai-token-store.js'
import { ModelRepository, type VerifiedModelArtifact } from './model-repository.js'
import { type AnimaGenerationQualificationProfile, ModelService } from './model-service.js'

type ExactCheckpoint = NonNullable<IgsProjectDocumentV1['generationDraft']['model']>

const migrations = path.resolve('src/main/db/migrations')
const storage: SafeStorageAdapter = {
  decryptStringAsync: async () => ({ result: '', shouldReEncrypt: false }),
  encryptStringAsync: async () => Buffer.alloc(0),
  getSelectedStorageBackend: () => 'gnome_libsecret',
  isAsyncEncryptionAvailable: async () => true,
}

const checkpointBytes = Buffer.from(
  'supported Anima structure represented by a qualifier collaborator',
)
const qwenBytes = Buffer.from('small exact pinned Qwen fixture')
const vaeBytes = Buffer.from('small exact pinned VAE fixture')

type AnimaHarness = {
  database: ReturnType<typeof openAppDatabase>
  first: { managedPath: string; saved: ExactCheckpoint }
  profile: AnimaGenerationQualificationProfile
  qualifierCalls: string[]
  qwen: { managedPath: string; resourceId: string; versionId: string }
  repository: ModelRepository
  root: string
  second: { managedPath: string; saved: ExactCheckpoint }
  service: ModelService
  vae: { managedPath: string; resourceId: string; versionId: string }
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/**
 * The trusted companion profile substitutes tiny exact reference bytes for the multi-GB release
 * files. SQLite, dependency links, regular-file checks and SHA rereads use production code. The
 * narrow checkpoint qualifier only asserts its input; actual default Anima header/native loading
 * qualification is covered separately, rather than claimed by these service-boundary scenarios.
 */
async function withAnimaBundle(run: (context: AnimaHarness) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-anima-bundle-'))
  const database = openAppDatabase(root, migrations)
  try {
    const repository = new ModelRepository(database.db)
    const qualifierCalls: string[] = []
    const profile: AnimaGenerationQualificationProfile = {
      checkpointQualifier: async (managedPath) => {
        qualifierCalls.push(managedPath)
        const bytes = await readFile(managedPath)
        assert.ok(bytes.subarray(0, checkpointBytes.length).equals(checkpointBytes))
      },
      qwen3Encoder: { sha256: sha256(qwenBytes), sizeBytes: qwenBytes.length },
      vae: { sha256: sha256(vaeBytes), sizeBytes: vaeBytes.length },
    }
    const service = new ModelService(
      repository,
      new CivitaiClient(),
      new CivitaiTokenStore(storage, root),
      undefined,
      undefined,
      undefined,
      undefined,
      profile,
    )
    const modelsDir = path.join(root, 'models')
    await mkdir(modelsDir)

    async function component(role: 'qwen3_encoder' | 'vae', bytes: Buffer) {
      const managedPath = path.join(modelsDir, `${role}.safetensors`)
      await writeFile(managedPath, bytes)
      const artifact: VerifiedModelArtifact = {
        file: {
          managedPath,
          originalFilename: `${role}.safetensors`,
          sha256: sha256(bytes),
          sizeBytes: bytes.length,
          verifiedAt: '2026-10-05T00:00:00.000Z',
        },
        resource: {
          displayName: `Pinned fixture ${role}`,
          source: { key: `anima-fixture:${role}`, kind: 'supported_dependency' },
          sourceMetadata: {},
          type: role,
        },
        version: {
          baseModelFamily: 'anima',
          format: 'safetensors',
          name: 'Pinned fixture',
          predictionType: null,
          source: {
            expectedSha256: sha256(bytes),
            kind: 'supported_dependency',
            revision: 'fixture-v1',
          },
          sourceMetadata: {},
        },
      }
      const published = await repository.publishVerifiedInstallation({ primary: artifact })
      return {
        artifact,
        managedPath,
        resourceId: published.resourceId,
        versionId: published.versionId,
      }
    }
    const qwen = await component('qwen3_encoder', qwenBytes)
    const vae = await component('vae', vaeBytes)

    async function checkpoint(versionId: number, fileId: number) {
      const bytes = Buffer.concat([checkpointBytes, Buffer.from(` version ${versionId}`)])
      const managedPath = path.join(modelsDir, `anima-${versionId}.safetensors`)
      await writeFile(managedPath, bytes)
      const published = await repository.publishVerifiedInstallation({
        dependencies: [
          { existingVersionId: qwen.versionId, role: 'qwen3_encoder' },
          { existingVersionId: vae.versionId, role: 'vae' },
        ],
        primary: {
          file: {
            managedPath,
            originalFilename: `anima-${versionId}.safetensors`,
            sha256: sha256(bytes),
            sizeBytes: bytes.length,
            verifiedAt: '2026-10-05T00:00:00.000Z',
          },
          resource: {
            displayName: 'Current custom Anima label',
            source: { kind: 'civitai', modelId: 42 },
            sourceMetadata: {},
            type: 'checkpoint',
          },
          version: {
            baseModelFamily: 'anima',
            format: 'safetensors',
            name: `Current v${versionId}`,
            predictionType: null,
            source: { expectedSha256: sha256(bytes), fileId, kind: 'civitai', versionId },
            sourceMetadata: {},
          },
        },
      })
      const saved: ExactCheckpoint = {
        baseModelFamily: 'anima',
        civitaiFileId: fileId,
        civitaiModelId: 42,
        civitaiVersionId: versionId,
        displayName: 'Previously saved custom Anima label',
        fileSha256: sha256(bytes),
        kind: 'checkpoint',
        localModelId: published.resourceId,
        localVersionId: published.versionId,
        predictionType: null,
        versionName: `Previously saved v${versionId}`,
      }
      return { managedPath, saved }
    }
    const first = await checkpoint(7, 701)
    const second = await checkpoint(8, 801)
    await run({
      database,
      first,
      profile,
      qualifierCalls,
      qwen,
      repository,
      root,
      second,
      service,
      vae,
    })
  } finally {
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
}

test('Anima bundle qualification resolves exact links after Default changes and preserves copied labels', async () => {
  await withAnimaBundle(
    async ({ first, qualifierCalls, qwen, repository, second, service, vae }) => {
      await repository.setDefaultVersion(first.saved.localModelId, second.saved.localVersionId)
      const before = await repository.listInstalled()
      const bundle = await service.resolveVerifiedGenerationAnimaBundleForPlan(first.saved)
      assert.deepEqual(bundle, {
        architecture: 'anima-base-1.0',
        checkpoint: {
          byteSize: (await readFile(first.managedPath)).length,
          managedPath: first.managedPath,
          reference: first.saved,
        },
        qwen3Encoder: {
          byteSize: qwenBytes.length,
          localModelId: qwen.resourceId,
          localVersionId: qwen.versionId,
          managedPath: qwen.managedPath,
          sha256: sha256(qwenBytes),
        },
        vae: {
          byteSize: vaeBytes.length,
          localModelId: vae.resourceId,
          localVersionId: vae.versionId,
          managedPath: vae.managedPath,
          sha256: sha256(vaeBytes),
        },
      })
      assert.notEqual(bundle.checkpoint.reference, first.saved)
      assert.deepEqual(qualifierCalls, [first.managedPath])
      assert.deepEqual(await repository.listInstalled(), before)
      assert.deepEqual(await repository.listInstallJobs(), [])
    },
  )
})

test('Anima bundle qualification captures the saved identity before its first await', async () => {
  await withAnimaBundle(async ({ first, service }) => {
    const captured = structuredClone(first.saved)
    const pending = service.resolveVerifiedGenerationAnimaBundleForPlan(first.saved)
    Object.assign(first.saved, {
      displayName: 'Changed while awaiting the catalog',
      fileSha256: '0'.repeat(64),
      localVersionId: randomUUID(),
      predictionType: 'epsilon',
    })
    const bundle = await pending
    assert.deepEqual(bundle.checkpoint.reference, captured)
    assert.equal(bundle.checkpoint.managedPath, first.managedPath)
  })
})

test('Anima bundle qualification refuses mismatched saved source/file fields and unsupported family semantics', async () => {
  await withAnimaBundle(async ({ first, qualifierCalls, service }) => {
    const cases: { code: string; fields: Partial<ExactCheckpoint> }[] = [
      { code: 'MODEL_VERSION_MISMATCH', fields: { civitaiModelId: 43 } },
      { code: 'MODEL_VERSION_MISMATCH', fields: { civitaiVersionId: 8 } },
      { code: 'MODEL_VERSION_MISMATCH', fields: { civitaiFileId: 702 } },
      { code: 'MODEL_VERSION_MISMATCH', fields: { fileSha256: '0'.repeat(64) } },
      { code: 'MODEL_VERSION_UNAVAILABLE', fields: { localModelId: randomUUID() } },
      { code: 'MODEL_VERSION_UNAVAILABLE', fields: { localVersionId: randomUUID() } },
      { code: 'MODEL_INVALID_ID', fields: { localVersionId: 'invalid-local-id' } },
      { code: 'MODEL_VERSION_MISMATCH', fields: { kind: 'lora' } },
      { code: 'MODEL_FAMILY_UNSUPPORTED', fields: { baseModelFamily: 'illustrious' } },
      { code: 'MODEL_FAMILY_UNSUPPORTED', fields: { baseModelFamily: null } },
      { code: 'MODEL_PREDICTION_UNSUPPORTED', fields: { predictionType: 'epsilon' } },
      { code: 'MODEL_PREDICTION_UNSUPPORTED', fields: { predictionType: 'v_prediction' } },
    ]
    for (const { code, fields } of cases) {
      await assert.rejects(
        service.resolveVerifiedGenerationAnimaBundleForPlan({ ...first.saved, ...fields }),
        { code },
        JSON.stringify(fields),
      )
    }
    assert.deepEqual(qualifierCalls, [])
  })
})

for (const role of ['checkpoint', 'qwen3_encoder', 'vae'] as const) {
  for (const failure of [
    'same-size corruption',
    'wrong size',
    'missing file',
    'symbolic link',
    'directory',
  ] as const) {
    test(`Anima bundle qualification rejects ${role} ${failure} after a previous successful verification`, async () => {
      await withAnimaBundle(async ({ first, qualifierCalls, qwen, root, service, vae }) => {
        await service.resolveVerifiedGenerationAnimaBundleForPlan(first.saved)
        qualifierCalls.length = 0
        const managedPath =
          role === 'checkpoint'
            ? first.managedPath
            : role === 'qwen3_encoder'
              ? qwen.managedPath
              : vae.managedPath
        const bytes = await readFile(managedPath)
        if (failure === 'same-size corruption') {
          await writeFile(managedPath, Buffer.alloc(bytes.length, 0x78))
        } else if (failure === 'wrong size') {
          await writeFile(managedPath, Buffer.concat([bytes, Buffer.from('x')]))
        } else {
          await unlink(managedPath)
          if (failure === 'symbolic link') {
            const otherPath = path.join(root, 'same-exact-bytes.safetensors')
            await writeFile(otherPath, bytes)
            await symlink(otherPath, managedPath)
          } else if (failure === 'directory') {
            await mkdir(managedPath)
          }
        }
        await assert.rejects(service.resolveVerifiedGenerationAnimaBundleForPlan(first.saved), {
          code:
            role === 'checkpoint'
              ? failure === 'missing file'
                ? 'MODEL_FILE_MISSING'
                : 'MODEL_FILE_CORRUPT'
              : 'ANIMA_DEPENDENCY_UNAVAILABLE',
        })
        assert.deepEqual(qualifierCalls, [])
      })
    })
  }
}

for (const role of ['qwen3_encoder', 'vae'] as const) {
  for (const failure of [
    'unlinked',
    'role',
    'source',
    'family',
    'prediction',
    'pinned hash',
    'pinned size',
  ] as const) {
    test(`Anima bundle qualification rejects ${role} ${failure} registry mismatch`, async () => {
      await withAnimaBundle(async ({ database, first, qualifierCalls, qwen, service, vae }) => {
        const component = role === 'qwen3_encoder' ? qwen : vae
        switch (failure) {
          case 'family':
          case 'prediction': {
            await database.db
              .updateTable('model_resource_version')
              .set(
                failure === 'family'
                  ? { base_model_family: 'illustrious' }
                  : { prediction_type: 'epsilon' },
              )
              .where('id', '=', component.versionId)
              .execute()

            break
          }
          case 'role': {
            await database.db
              .updateTable('model_resource')
              .set({ type: role === 'qwen3_encoder' ? 'vae' : 'qwen3_encoder' })
              .where('id', '=', component.resourceId)
              .execute()

            break
          }
          case 'source': {
            await database.db
              .updateTable('model_resource')
              .set({ civitai_model_id: role === 'qwen3_encoder' ? 50 : 51, source_kind: 'civitai' })
              .where('id', '=', component.resourceId)
              .execute()

            break
          }
          case 'unlinked': {
            await database.db
              .deleteFrom('model_version_dependency')
              .where('checkpoint_version_id', '=', first.saved.localVersionId)
              .where('role', '=', role)
              .execute()

            break
          }
          default: {
            await database.db
              .updateTable('local_model_file')
              .set(failure === 'pinned hash' ? { sha256: '0'.repeat(64) } : { size_bytes: 12_345 })
              .where('resource_version_id', '=', component.versionId)
              .execute()
          }
        }
        await assert.rejects(service.resolveVerifiedGenerationAnimaBundleForPlan(first.saved), {
          code: 'ANIMA_DEPENDENCY_UNAVAILABLE',
        })
        assert.deepEqual(qualifierCalls, [])
      })
    })
  }
}

test('Anima bundle qualification does not substitute another linked version when exact checkpoint bytes fail', async () => {
  await withAnimaBundle(async ({ first, repository, second, service }) => {
    await repository.setDefaultVersion(first.saved.localModelId, second.saved.localVersionId)
    await unlink(first.managedPath)
    await assert.rejects(service.resolveVerifiedGenerationAnimaBundleForPlan(first.saved), {
      code: 'MODEL_FILE_MISSING',
    })
    const healthy = await service.resolveVerifiedGenerationAnimaBundleForPlan(second.saved)
    assert.equal(healthy.checkpoint.managedPath, second.managedPath)
  })
})

test('Anima bundle qualification maps structural refusal without altering installed records', async () => {
  await withAnimaBundle(async ({ first, profile, repository, root }) => {
    const service = new ModelService(
      repository,
      new CivitaiClient(),
      new CivitaiTokenStore(storage, root),
      undefined,
      undefined,
      undefined,
      undefined,
      {
        ...profile,
        checkpointQualifier: async () => {
          throw new Error('missing transformer tensor')
        },
      },
    )
    const before = await repository.listInstalled()
    await assert.rejects(service.resolveVerifiedGenerationAnimaBundleForPlan(first.saved), {
      code: 'MODEL_CHECKPOINT_INCOMPATIBLE',
      message: /missing transformer tensor/,
    })
    assert.deepEqual(await repository.listInstalled(), before)
  })
})

for (const role of ['checkpoint', 'qwen3_encoder', 'vae'] as const) {
  test(`Anima bundle qualification detects same-size ${role} changes during its qualifier await`, async () => {
    await withAnimaBundle(async ({ first, profile, qwen, repository, root, vae }) => {
      const managedPath =
        role === 'checkpoint'
          ? first.managedPath
          : role === 'qwen3_encoder'
            ? qwen.managedPath
            : vae.managedPath
      const service = new ModelService(
        repository,
        new CivitaiClient(),
        new CivitaiTokenStore(storage, root),
        undefined,
        undefined,
        undefined,
        undefined,
        {
          ...profile,
          checkpointQualifier: async (checkpointPath) => {
            await profile.checkpointQualifier(checkpointPath)
            const bytes = await readFile(managedPath)
            await writeFile(managedPath, Buffer.alloc(bytes.length, 0x78))
          },
        },
      )
      await assert.rejects(service.resolveVerifiedGenerationAnimaBundleForPlan(first.saved), {
        code: role === 'checkpoint' ? 'MODEL_FILE_CORRUPT' : 'ANIMA_DEPENDENCY_UNAVAILABLE',
      })
    })
  })
}

test('Anima production profile rejects small companion stand-ins that the explicit test profile permits', async () => {
  await withAnimaBundle(async ({ first, repository, root, service }) => {
    await service.resolveVerifiedGenerationAnimaBundleForPlan(first.saved)
    const productionService = new ModelService(
      repository,
      new CivitaiClient(),
      new CivitaiTokenStore(storage, root),
    )
    await assert.rejects(
      productionService.resolveVerifiedGenerationAnimaBundleForPlan(first.saved),
      { code: 'ANIMA_DEPENDENCY_UNAVAILABLE' },
    )
  })
})

for (const role of ['qwen3Encoder', 'vae'] as const) {
  test(`Anima bundle qualification requires the pinned ${role} size even when managed bytes verify`, async () => {
    await withAnimaBundle(async ({ first, profile, repository, root }) => {
      const service = new ModelService(
        repository,
        new CivitaiClient(),
        new CivitaiTokenStore(storage, root),
        undefined,
        undefined,
        undefined,
        undefined,
        { ...profile, [role]: { ...profile[role], sizeBytes: profile[role].sizeBytes + 1 } },
      )
      await assert.rejects(service.resolveVerifiedGenerationAnimaBundleForPlan(first.saved), {
        code: 'ANIMA_DEPENDENCY_UNAVAILABLE',
      })
    })
  })
}

test('Anima bundle qualification refuses a real installed checkpoint without pinned dependencies', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-anima-qualification-'))
  const database = openAppDatabase(root, migrations)
  try {
    const repository = new ModelRepository(database.db)
    const service = new ModelService(
      repository,
      new CivitaiClient(),
      new CivitaiTokenStore(storage, root),
    )
    const bytes = Buffer.from('exact custom Anima checkpoint without companions')
    const managedPath = path.join(root, 'models', 'custom-anima.safetensors')
    await mkdir(path.dirname(managedPath))
    await writeFile(managedPath, bytes)
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    const published = await repository.publishVerifiedInstallation({
      primary: {
        file: {
          managedPath,
          originalFilename: 'custom-anima.safetensors',
          sha256,
          sizeBytes: bytes.length,
          verifiedAt: '2026-10-05T00:00:00.000Z',
        },
        resource: {
          displayName: 'Custom Anima',
          source: { kind: 'civitai', modelId: 42 },
          sourceMetadata: {},
          type: 'checkpoint',
        },
        version: {
          baseModelFamily: 'illustrious',
          format: 'safetensors',
          name: 'v1',
          predictionType: null,
          source: { expectedSha256: sha256, fileId: 701, kind: 'civitai', versionId: 7 },
          sourceMetadata: {},
        },
      },
    })
    // Simulate an incomplete legacy Anima row; current installation refuses this state.
    await database.db
      .updateTable('model_resource_version')
      .set({ base_model_family: 'anima', prediction_type: null })
      .where('id', '=', published.versionId)
      .execute()
    const saved: ExactCheckpoint = {
      baseModelFamily: 'anima',
      civitaiFileId: 701,
      civitaiModelId: 42,
      civitaiVersionId: 7,
      displayName: 'Saved custom Anima',
      fileSha256: sha256,
      kind: 'checkpoint',
      localModelId: published.resourceId,
      localVersionId: published.versionId,
      predictionType: null,
      versionName: 'Saved v1',
    }
    await assert.rejects(service.resolveVerifiedGenerationAnimaBundleForPlan(saved), {
      code: 'ANIMA_DEPENDENCY_UNAVAILABLE',
    })
    assert.equal((await repository.listInstalled()).length, 1)
  } finally {
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
})
