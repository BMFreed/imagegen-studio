import type { IgsProjectDocumentV1 } from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { openAppDatabase } from '../db/database.js'
import { qualifyAnimaLora } from './anima-lora-qualification.js'
import { CivitaiClient } from './civitai-client.js'
import { CivitaiTokenStore, type SafeStorageAdapter } from './civitai-token-store.js'
import { ModelRepository } from './model-repository.js'
import { ModelService } from './model-service.js'
import { animaLoraFixture } from './test-fixtures/anima-lora.js'

type ExactLora = NonNullable<IgsProjectDocumentV1['generationDraft']['model']>
const migrations = path.resolve('src/main/db/migrations')
const storage: SafeStorageAdapter = {
  decryptStringAsync: async () => ({ result: '', shouldReEncrypt: false }),
  encryptStringAsync: async () => Buffer.alloc(0),
  getSelectedStorageBackend: () => 'gnome_libsecret',
  isAsyncEncryptionAvailable: async () => true,
}
function digest(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

async function withLoras(
  run: (context: {
    database: ReturnType<typeof openAppDatabase>
    first: { bytes: Buffer; managedPath: string; saved: ExactLora }
    freshService: (qualifier?: (managedPath: string) => Promise<void>) => ModelService
    publish: (
      versionId: number,
      bytes?: Buffer,
    ) => Promise<{ bytes: Buffer; managedPath: string; saved: ExactLora }>
    repository: ModelRepository
    root: string
    second: { bytes: Buffer; managedPath: string; saved: ExactLora }
    service: ModelService
  }) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-anima-lora-'))
  const database = openAppDatabase(root, migrations)
  try {
    const repository = new ModelRepository(database.db)
    // The optional trusted collaborator only coordinates a real concurrent change.
    // All hashes, SQLite identities and default header qualification remain real.
    const freshService = (qualifier?: (managedPath: string) => Promise<void>) =>
      new ModelService(
        repository,
        new CivitaiClient(),
        new CivitaiTokenStore(storage, root),
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        qualifier,
      )
    const service = freshService()
    async function publish(versionId: number, bytes = animaLoraFixture()) {
      const managedPath = path.join(root, `anima-lora-${versionId}.safetensors`)
      await writeFile(managedPath, bytes)
      const published = await repository.publishVerifiedInstallation({
        primary: {
          file: {
            managedPath,
            originalFilename: path.basename(managedPath),
            sha256: digest(bytes),
            sizeBytes: bytes.length,
            verifiedAt: '2026-10-05T00:00:00.000Z',
          },
          resource: {
            displayName: 'Current Anima adapter',
            source: { kind: 'civitai', modelId: 42 },
            sourceMetadata: {},
            type: 'lora',
          },
          version: {
            baseModelFamily: 'anima',
            format: 'safetensors',
            name: `Current v${versionId}`,
            predictionType: null,
            source: {
              expectedSha256: digest(bytes),
              fileId: versionId * 100,
              kind: 'civitai',
              versionId,
            },
            sourceMetadata: {},
          },
        },
      })
      const saved: ExactLora = {
        baseModelFamily: 'anima',
        civitaiFileId: versionId * 100,
        civitaiModelId: 42,
        civitaiVersionId: versionId,
        displayName: 'Copied Project title',
        fileSha256: digest(bytes),
        kind: 'lora',
        localModelId: published.resourceId,
        localVersionId: published.versionId,
        predictionType: 'epsilon',
        versionName: `Copied v${versionId}`,
      }
      return { bytes, managedPath, saved }
    }
    const first = await publish(7)
    const second = await publish(8, animaLoraFixture(0.25))
    await run({ database, first, freshService, publish, repository, root, second, service })
  } finally {
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
}

test('Anima LoRA planning verifies the real exact managed file and preserves copied metadata independently of Default', async () => {
  await withLoras(async ({ first, repository, second, service }) => {
    await service.setDefaultVersion(second.saved.localModelId, second.saved.localVersionId)
    const before = await repository.listInstalled()
    const planned = await service.resolveVerifiedAnimaGenerationLoraForPlan(first.saved)
    assert.equal(planned.managedPath, first.managedPath)
    assert.equal(planned.byteSize, first.bytes.length)
    assert.deepEqual(planned.reference, first.saved)
    assert.notEqual(planned.reference, first.saved)
    assert.deepEqual(await repository.listInstalled(), before)
    assert.deepEqual(await repository.listInstallJobs(), [])
    first.saved.displayName = 'Later Project edit'
    assert.equal(planned.reference.displayName, 'Copied Project title')
  })
})

test('Anima LoRA planning captures exact identity and advisory labels before its first await', async () => {
  await withLoras(async ({ first, second, service }) => {
    const original = structuredClone(first.saved)
    const pending = service.resolveVerifiedAnimaGenerationLoraForPlan(first.saved)
    Object.assign(first.saved, {
      ...second.saved,
      displayName: 'Later title',
      predictionType: 'v_prediction',
    })
    const resolved = await pending
    assert.deepEqual(resolved.reference, original)
    assert.equal(resolved.managedPath, first.managedPath)
  })
})

test('Anima LoRA planning refuses every mismatched exact saved source and unrelated resource family/kind', async () => {
  await withLoras(async ({ first, second, service }) => {
    for (const fields of [
      { civitaiModelId: 43 },
      { civitaiVersionId: 8 },
      { civitaiFileId: 701 },
      { fileSha256: '0'.repeat(64) },
      { localVersionId: second.saved.localVersionId },
    ]) {
      await assert.rejects(
        service.resolveVerifiedAnimaGenerationLoraForPlan({ ...first.saved, ...fields }),
        { code: 'MODEL_VERSION_MISMATCH' },
      )
    }
    for (const fields of [{ localModelId: randomUUID() }, { localVersionId: randomUUID() }]) {
      await assert.rejects(
        service.resolveVerifiedAnimaGenerationLoraForPlan({ ...first.saved, ...fields }),
        { code: 'MODEL_VERSION_UNAVAILABLE' },
      )
    }
    await assert.rejects(
      service.resolveVerifiedAnimaGenerationLoraForPlan({
        ...first.saved,
        localVersionId: 'bad-id',
      }),
      { code: 'MODEL_INVALID_ID' },
    )
    for (const baseModelFamily of ['illustrious', null] as const) {
      await assert.rejects(
        service.resolveVerifiedAnimaGenerationLoraForPlan({ ...first.saved, baseModelFamily }),
        { code: 'MODEL_FAMILY_UNSUPPORTED' },
      )
    }
    await assert.rejects(
      service.resolveVerifiedAnimaGenerationLoraForPlan({ ...first.saved, kind: 'checkpoint' }),
      { code: 'MODEL_FAMILY_UNSUPPORTED' },
    )
    // The existing public resolver continues to refuse the now-internally-qualified Anima adapter.
    await assert.rejects(service.resolveVerifiedGenerationLoraForPlan(first.saved), {
      code: 'MODEL_FAMILY_UNSUPPORTED',
    })
  })
})

for (const failure of [
  'same-size corruption',
  'wrong size',
  'missing',
  'symbolic link',
  'directory',
] as const) {
  test(`Anima LoRA planning rejects ${failure} after a previously verified exact file`, async () => {
    await withLoras(async ({ first, root, service }) => {
      await service.resolveVerifiedAnimaGenerationLoraForPlan(first.saved)
      if (failure === 'same-size corruption') {
        await writeFile(first.managedPath, Buffer.alloc(first.bytes.length, 0x78))
      } else if (failure === 'wrong size') {
        await writeFile(first.managedPath, Buffer.concat([first.bytes, Buffer.from('x')]))
      } else {
        await unlink(first.managedPath)
        if (failure === 'symbolic link') {
          const other = path.join(root, 'same-exact-bytes.safetensors')
          await writeFile(other, first.bytes)
          await symlink(other, first.managedPath)
        } else if (failure === 'directory') {
          await mkdir(first.managedPath)
        }
      }
      await assert.rejects(service.resolveVerifiedAnimaGenerationLoraForPlan(first.saved), {
        code: failure === 'missing' ? 'MODEL_FILE_MISSING' : 'MODEL_FILE_CORRUPT',
      })
    })
  })
}

for (const family of ['illustrious', null] as const) {
  test(`Anima LoRA planning rejects the current installed ${family ?? 'unknown'} family despite matching saved bytes`, async () => {
    await withLoras(async ({ database, first, service }) => {
      await service.resolveVerifiedAnimaGenerationLoraForPlan(first.saved)
      await database.db
        .updateTable('model_resource_version')
        .set({ base_model_family: family })
        .where('id', '=', first.saved.localVersionId)
        .execute()
      await assert.rejects(service.resolveVerifiedAnimaGenerationLoraForPlan(first.saved), {
        code: 'MODEL_FAMILY_UNSUPPORTED',
      })
    })
  })
}

test('hash-verified custom unsupported bytes fail through the default structural qualifier, alongside the valid neighbor', async () => {
  await withLoras(async ({ first, publish, service }) => {
    const invalid = await publish(
      9,
      Buffer.from('custom installed Anima adapter with an unsupported safetensors payload'),
    )
    await assert.rejects(service.resolveVerifiedAnimaGenerationLoraForPlan(invalid.saved), {
      code: 'MODEL_LORA_INCOMPATIBLE',
    })
    await assert.doesNotReject(service.resolveVerifiedAnimaGenerationLoraForPlan(first.saved))
  })
})

for (const change of ['bytes', 'family', 'source', 'path'] as const) {
  test(`Anima LoRA planning reverifies ${change} after the real structural qualifier awaited`, async () => {
    await withLoras(async ({ database, first, freshService, root }) => {
      const coordinated = freshService(async (managedPath) => {
        assert.equal(managedPath, first.managedPath)
        await qualifyAnimaLora(managedPath)
        switch (change) {
          case 'bytes': {
            await writeFile(managedPath, Buffer.alloc(first.bytes.length, 0x78))

            break
          }
          case 'family': {
            await database.db
              .updateTable('model_resource_version')
              .set({ base_model_family: 'illustrious' })
              .where('id', '=', first.saved.localVersionId)
              .execute()

            break
          }
          case 'source': {
            await database.db
              .updateTable('model_resource_version')
              .set({ civitai_file_id: 999 })
              .where('id', '=', first.saved.localVersionId)
              .execute()

            break
          }
          default: {
            const other = path.join(root, 'relocated-identical-adapter.safetensors')
            await writeFile(other, first.bytes)
            await database.db
              .updateTable('local_model_file')
              .set({ managed_path: other })
              .where('resource_version_id', '=', first.saved.localVersionId)
              .execute()
          }
        }
      })
      await assert.rejects(coordinated.resolveVerifiedAnimaGenerationLoraForPlan(first.saved), {
        code:
          change === 'bytes'
            ? 'MODEL_FILE_CORRUPT'
            : change === 'family'
              ? 'MODEL_FAMILY_UNSUPPORTED'
              : 'MODEL_VERSION_MISMATCH',
      })
    })
  })
}

for (const mismatch of ['kind', 'source'] as const) {
  test(`Anima LoRA planning refuses a changed current resource ${mismatch} despite matching file bytes`, async () => {
    await withLoras(async ({ database, first, service }) => {
      await database.db
        .updateTable('model_resource')
        .set(
          mismatch === 'kind'
            ? { type: 'checkpoint' }
            : {
                civitai_model_id: null,
                source_key: 'foreign:adapter',
                source_kind: 'supported_dependency',
              },
        )
        .where('id', '=', first.saved.localModelId)
        .execute()
      await assert.rejects(service.resolveVerifiedAnimaGenerationLoraForPlan(first.saved), {
        code: 'MODEL_VERSION_UNAVAILABLE',
      })
    })
  })
}

test('a hash-verified ordinary adapter registered under another extension is explicitly refused', async () => {
  await withLoras(async ({ database, first, root, service }) => {
    const managedPath = path.join(root, 'adapter.bin')
    await writeFile(managedPath, first.bytes)
    await database.db
      .updateTable('local_model_file')
      .set({ managed_path: managedPath })
      .where('resource_version_id', '=', first.saved.localVersionId)
      .execute()
    await assert.rejects(service.resolveVerifiedAnimaGenerationLoraForPlan(first.saved), {
      code: 'MODEL_LORA_INCOMPATIBLE',
    })
  })
})
