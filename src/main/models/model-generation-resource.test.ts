import type { IgsProjectDocumentV1 } from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import type { CheckpointCompatibilityFingerprint } from './model-compatibility-manifest.js'

import { openAppDatabase } from '../db/database.js'
import { CivitaiClient } from './civitai-client.js'
import { CivitaiTokenStore, type SafeStorageAdapter } from './civitai-token-store.js'
import {
  type ModelPredictionType,
  ModelRepository,
  type VerifiedModelArtifact,
} from './model-repository.js'
import { ModelService } from './model-service.js'

type ExactCheckpoint = NonNullable<IgsProjectDocumentV1['generationDraft']['model']>

const migrations = path.resolve('src/main/db/migrations')
const storage: SafeStorageAdapter = {
  decryptStringAsync: async () => ({ result: '', shouldReEncrypt: false }),
  encryptStringAsync: async () => Buffer.alloc(0),
  getSelectedStorageBackend: () => 'gnome_libsecret',
  isAsyncEncryptionAvailable: async () => true,
}

async function withInstalledCheckpoints(
  run: (context: {
    firstBytes: Buffer
    firstPath: string
    firstRef: ExactCheckpoint
    repository: ModelRepository
    root: string
    secondPath: string
    secondRef: ExactCheckpoint
    service: ModelService
    setFirstStoredPredictionType: (value: ModelPredictionType | null) => Promise<void>
  }) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-generation-resource-'))
  const database = openAppDatabase(root, migrations)
  try {
    const repository = new ModelRepository(database.db)
    const fixtureModels: readonly { bytes: Buffer; predictionType: ModelPredictionType }[] = [
      { bytes: Buffer.from('verified checkpoint version 7'), predictionType: 'epsilon' },
      { bytes: Buffer.from('verified checkpoint version 8'), predictionType: 'v_prediction' },
    ]
    const testManifest: readonly CheckpointCompatibilityFingerprint[] = fixtureModels.map(
      ({ bytes, predictionType }) => ({
        baseModelFamily: 'illustrious',
        predictionType,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        sizeBytes: bytes.length,
      }),
    )
    const service = new ModelService(
      repository,
      new CivitaiClient(),
      new CivitaiTokenStore(storage, root),
      undefined,
      testManifest,
    )
    const modelsDir = path.join(root, 'models')
    await mkdir(modelsDir)

    async function install(
      civitaiVersionId: number,
      civitaiFileId: number,
      predictionType: 'epsilon' | 'v_prediction',
    ): Promise<{ bytes: Buffer; path: string; ref: ExactCheckpoint }> {
      const bytes = Buffer.from(`verified checkpoint version ${civitaiVersionId}`)
      const managedPath = path.join(modelsDir, `${civitaiVersionId}.safetensors`)
      await writeFile(managedPath, bytes)
      const sha256 = createHash('sha256').update(bytes).digest('hex')
      const artifact: VerifiedModelArtifact = {
        file: {
          managedPath,
          originalFilename: `${civitaiVersionId}.safetensors`,
          sha256,
          sizeBytes: bytes.length,
          verifiedAt: '2026-09-28T00:00:00.000Z',
        },
        resource: {
          displayName: 'Installed Illustrious checkpoint',
          source: { kind: 'civitai', modelId: 42 },
          sourceMetadata: {},
          type: 'checkpoint',
        },
        version: {
          baseModelFamily: 'illustrious',
          format: 'safetensors',
          name: `v${civitaiVersionId}`,
          predictionType,
          source: {
            expectedSha256: sha256,
            fileId: civitaiFileId,
            kind: 'civitai',
            versionId: civitaiVersionId,
          },
          sourceMetadata: {},
        },
      }
      const installed = await repository.publishVerifiedInstallation({ primary: artifact })
      return {
        bytes,
        path: managedPath,
        ref: await service.resolveGenerationCheckpoint(installed.resourceId, installed.versionId),
      }
    }

    const first = await install(7, 701, 'epsilon')
    const second = await install(8, 801, 'v_prediction')
    await database.db
      .updateTable('model_resource_version')
      .set({ prediction_type: null })
      .where('id', '=', first.ref.localVersionId)
      .execute()
    await run({
      firstBytes: first.bytes,
      firstPath: first.path,
      firstRef: first.ref,
      repository,
      root,
      secondPath: second.path,
      secondRef: second.ref,
      service,
      setFirstStoredPredictionType: async (value) => {
        await database.db
          .updateTable('model_resource_version')
          .set({ prediction_type: value })
          .where('id', '=', first.ref.localVersionId)
          .execute()
      },
    })
  } finally {
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
}

test('generation plan resolves the saved exact checkpoint after Default changes', async () => {
  await withInstalledCheckpoints(
    async ({ firstBytes, firstPath, firstRef, repository, secondPath, secondRef, service }) => {
      await service.setDefaultVersion(firstRef.localModelId, secondRef.localVersionId)
      const saved = {
        ...firstRef,
        displayName: 'Older saved label',
        versionName: 'Older version name',
      }
      const resolved = await service.resolveVerifiedGenerationCheckpointForPlan(saved)

      assert.equal(
        (await repository.listInstalled()).find((item) => item.id === firstRef.localModelId)
          ?.defaultVersionId,
        secondRef.localVersionId,
      )
      assert.equal(resolved.managedPath, firstPath)
      assert.notEqual(resolved.managedPath, secondPath)
      assert.deepEqual(await readFile(resolved.managedPath), firstBytes)
      assert.deepEqual(resolved.reference, firstRef)
      assert.equal(
        (await repository.listInstalled())
          .flatMap((item) => item.versions)
          .find((item) => item.id === firstRef.localVersionId)?.predictionType,
        null,
      )
      assert.equal(
        (
          await service.resolveVerifiedGenerationCheckpointForPlan({
            ...firstRef,
            predictionType: null,
          })
        ).reference.predictionType,
        'epsilon',
      )
      assert.deepEqual(saved, {
        ...firstRef,
        displayName: 'Older saved label',
        versionName: 'Older version name',
      })
    },
  )
})

test('generation plan refuses an unlisted file or a stored prediction conflicting with exact bytes', async () => {
  await withInstalledCheckpoints(
    async ({ firstRef, repository, root, service, setFirstStoredPredictionType }) => {
      const unqualified = new ModelService(
        repository,
        new CivitaiClient(),
        new CivitaiTokenStore(storage, root),
        undefined,
        [],
      )
      await assert.rejects(unqualified.resolveVerifiedGenerationCheckpointForPlan(firstRef), {
        code: 'MODEL_PREDICTION_UNQUALIFIED',
      })
      await setFirstStoredPredictionType('v_prediction')
      await assert.rejects(service.resolveVerifiedGenerationCheckpointForPlan(firstRef), {
        code: 'MODEL_VERSION_MISMATCH',
      })
    },
  )
})

test('generation plan rejects a saved checkpoint whose exact version fields differ', async () => {
  await withInstalledCheckpoints(async ({ firstRef, secondRef, service }) => {
    const mismatches: [string, ExactCheckpoint][] = [
      ['local version', { ...firstRef, localVersionId: secondRef.localVersionId }],
      ['CivitAI model', { ...firstRef, civitaiModelId: 43 }],
      ['CivitAI version', { ...firstRef, civitaiVersionId: 8 }],
      ['CivitAI file', { ...firstRef, civitaiFileId: 801 }],
      ['file hash', { ...firstRef, fileSha256: '0'.repeat(64) }],
      ['model family', { ...firstRef, baseModelFamily: 'anima' }],
      ['prediction type', { ...firstRef, predictionType: 'v_prediction' }],
      ['resource kind', { ...firstRef, kind: 'lora' }],
    ]
    for (const [field, saved] of mismatches) {
      await assert.rejects(
        service.resolveVerifiedGenerationCheckpointForPlan(saved),
        { code: 'MODEL_VERSION_MISMATCH', name: 'ModelServiceError' },
        field,
      )
    }

    await assert.rejects(
      service.resolveVerifiedGenerationCheckpointForPlan({
        ...firstRef,
        localModelId: randomUUID(),
      }),
      { code: 'MODEL_VERSION_UNAVAILABLE', name: 'ModelServiceError' },
    )
  })
})

test('generation plan rehashes managed bytes and rejects corrupt or missing checkpoints', async () => {
  await withInstalledCheckpoints(async ({ firstBytes, firstPath, firstRef, service }) => {
    assert.equal(
      (await service.resolveVerifiedGenerationCheckpointForPlan(firstRef)).managedPath,
      firstPath,
    )

    await writeFile(firstPath, Buffer.alloc(firstBytes.length, 0x58))
    await assert.rejects(service.resolveVerifiedGenerationCheckpointForPlan(firstRef), {
      code: 'MODEL_FILE_CORRUPT',
      name: 'ModelServiceError',
    })

    await writeFile(firstPath, firstBytes)
    assert.equal(
      (await service.resolveVerifiedGenerationCheckpointForPlan(firstRef)).managedPath,
      firstPath,
    )
    await unlink(firstPath)
    await assert.rejects(service.resolveVerifiedGenerationCheckpointForPlan(firstRef), {
      code: 'MODEL_FILE_MISSING',
      name: 'ModelServiceError',
    })
  })
})
