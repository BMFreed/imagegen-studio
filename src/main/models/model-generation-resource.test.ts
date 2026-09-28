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

// These identity and override scenarios use deliberately tiny non-model files. The real
// safetensors preflight is exercised through ModelService in sdxl-checkpoint-qualification.test.
const skipCheckpointQualification = async (): Promise<void> => {}

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
      skipCheckpointQualification,
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
            predictionType: 'v_prediction',
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

test('unlisted Illustrious defaults to epsilon and plans from the current file setting', async () => {
  await withInstalledCheckpoints(async ({ firstRef, repository, root, service }) => {
    const unqualified = new ModelService(
      repository,
      new CivitaiClient(),
      new CivitaiTokenStore(storage, root),
      undefined,
      [],
      skipCheckpointQualification,
    )
    const savedWithoutPrediction = { ...firstRef, predictionType: null }
    const unlisted =
      await unqualified.resolveVerifiedGenerationCheckpointForPlan(savedWithoutPrediction)
    assert.equal(unlisted.reference.predictionType, 'epsilon')
    assert.equal(savedWithoutPrediction.predictionType, null)
    const unlistedVersion = (await unqualified.getCatalog())
      .flatMap((item) => item.versions)
      .find((version) => version.id === firstRef.localVersionId)
    assert.deepEqual(
      {
        predictionType: unlistedVersion?.predictionType,
        predictionTypeSource: unlistedVersion?.predictionTypeSource,
      },
      { predictionType: 'epsilon', predictionTypeSource: 'default' },
    )

    await service.setPredictionType(firstRef.localModelId, firstRef.localVersionId, 'v_prediction')
    assert.equal(
      (await service.resolveVerifiedGenerationCheckpointForPlan(firstRef)).reference.predictionType,
      'v_prediction',
    )
    assert.equal(
      (await service.resolveVerifiedGenerationCheckpointForPlan(savedWithoutPrediction)).reference
        .predictionType,
      'v_prediction',
    )
    assert.equal(
      (
        await unqualified.resolveVerifiedGenerationCheckpointForPlan({
          ...firstRef,
          predictionType: 'epsilon',
        })
      ).reference.predictionType,
      'v_prediction',
    )
    assert.equal(firstRef.predictionType, 'epsilon')
    assert.equal(savedWithoutPrediction.predictionType, null)
  })
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

test('prediction edit follows exact bytes across versions without changing saved snapshots or evidence', async () => {
  await withInstalledCheckpoints(
    async ({ firstBytes, firstRef, repository, root, secondRef, service }) => {
      const duplicatePath = path.join(root, 'models', 'duplicate.safetensors')
      await writeFile(duplicatePath, firstBytes)
      const duplicate = await repository.publishVerifiedInstallation({
        primary: {
          file: {
            managedPath: duplicatePath,
            originalFilename: 'duplicate.safetensors',
            sha256: firstRef.fileSha256,
            sizeBytes: firstBytes.length,
            verifiedAt: '2026-09-28T00:00:00.000Z',
          },
          resource: {
            displayName: 'Same bytes from another source',
            source: { kind: 'civitai', modelId: 43 },
            sourceMetadata: {},
            type: 'checkpoint',
          },
          version: {
            baseModelFamily: 'illustrious',
            format: 'safetensors',
            name: 'duplicate',
            predictionType: 'v_prediction',
            source: {
              expectedSha256: firstRef.fileSha256,
              fileId: 901,
              kind: 'civitai',
              versionId: 9,
            },
            sourceMetadata: {},
          },
        },
      })
      const legacyNull = { ...firstRef, predictionType: null }
      const withoutManifest = new ModelService(
        repository,
        new CivitaiClient(),
        new CivitaiTokenStore(storage, root),
        undefined,
        [],
        skipCheckpointQualification,
      )
      for (const id of [firstRef.localVersionId, duplicate.versionId]) {
        const catalogVersion = (await withoutManifest.getCatalog())
          .flatMap((item) => item.versions)
          .find((version) => version.id === id)
        assert.equal(catalogVersion?.predictionType, 'epsilon')
        assert.equal(catalogVersion?.predictionTypeSource, 'default')
      }

      await service.setPredictionType(
        firstRef.localModelId,
        firstRef.localVersionId,
        'v_prediction',
      )
      assert.equal(
        await repository.getPredictionOverride({
          sha256: firstRef.fileSha256,
          sizeBytes: firstBytes.length,
        }),
        'v_prediction',
      )
      assert.equal(
        (await service.resolveGenerationCheckpoint(firstRef.localModelId, firstRef.localVersionId))
          .predictionType,
        'v_prediction',
      )
      assert.equal(
        (await service.resolveGenerationCheckpoint(duplicate.resourceId, duplicate.versionId))
          .predictionType,
        'v_prediction',
      )
      assert.equal(
        (
          await service.resolveGenerationCheckpoint(
            secondRef.localModelId,
            secondRef.localVersionId,
          )
        ).predictionType,
        'v_prediction',
      )
      const catalogVersions = (await service.getCatalog()).flatMap((item) => item.versions)
      for (const versionId of [firstRef.localVersionId, duplicate.versionId]) {
        const catalogVersion = catalogVersions.find((version) => version.id === versionId)
        assert.equal(catalogVersion?.predictionType, 'v_prediction')
        assert.equal(catalogVersion?.predictionTypeSource, 'user')
      }
      assert.equal(
        (await service.resolveVerifiedGenerationCheckpointForPlan(firstRef)).reference
          .predictionType,
        'v_prediction',
      )
      assert.equal(
        (await service.resolveVerifiedGenerationCheckpointForPlan(legacyNull)).reference
          .predictionType,
        'v_prediction',
      )
      assert.equal(legacyNull.predictionType, null)
      assert.equal(firstRef.predictionType, 'epsilon')

      await service.setPredictionType(duplicate.resourceId, duplicate.versionId, 'epsilon')
      assert.equal(
        (await service.resolveGenerationCheckpoint(firstRef.localModelId, firstRef.localVersionId))
          .predictionType,
        'epsilon',
      )
      assert.equal(
        (
          await service.resolveVerifiedGenerationCheckpointForPlan({
            ...firstRef,
            predictionType: 'v_prediction',
          })
        ).reference.predictionType,
        'epsilon',
      )
      assert.equal(
        (
          await service.resolveGenerationCheckpoint(
            secondRef.localModelId,
            secondRef.localVersionId,
          )
        ).predictionType,
        'v_prediction',
      )
      assert.equal(
        (await repository.listInstalled())
          .flatMap((item) => item.versions)
          .find((version) => version.id === firstRef.localVersionId)?.predictionType,
        null,
      )
    },
  )
})

test('prediction edit rejects invalid IDs, unsupported resources, and corrupt exact files', async () => {
  await withInstalledCheckpoints(
    async ({ firstBytes, firstPath, firstRef, repository, root, service }) => {
      const makeFile = async (filename: string, bytes: Buffer) => {
        const managedPath = path.join(root, 'models', filename)
        await writeFile(managedPath, bytes)
        return {
          managedPath,
          originalFilename: filename,
          sha256: createHash('sha256').update(bytes).digest('hex'),
          sizeBytes: bytes.length,
          verifiedAt: '2026-09-28T00:00:00.000Z',
        }
      }
      const loraFile = await makeFile('lora.safetensors', Buffer.from('a verified lora'))
      const lora = await repository.publishVerifiedInstallation({
        primary: {
          file: loraFile,
          resource: {
            displayName: 'LoRA',
            source: { kind: 'civitai', modelId: 44 },
            sourceMetadata: {},
            type: 'lora',
          },
          version: {
            baseModelFamily: 'illustrious',
            format: 'safetensors',
            name: 'v1',
            source: {
              expectedSha256: loraFile.sha256,
              fileId: 4401,
              kind: 'civitai',
              versionId: 44,
            },
            sourceMetadata: {},
          },
        },
      })
      const animaFile = await makeFile('anima.safetensors', Buffer.from('anima checkpoint'))
      const dependency = async (role: 'qwen3_encoder' | 'vae'): Promise<VerifiedModelArtifact> => {
        const file = await makeFile(`${role}.safetensors`, Buffer.from(`anima ${role}`))
        return {
          file,
          resource: {
            displayName: role,
            source: { key: `anima/${role}`, kind: 'supported_dependency' },
            sourceMetadata: {},
            type: role,
          },
          version: {
            baseModelFamily: 'anima',
            format: 'safetensors',
            name: 'v1',
            source: {
              expectedSha256: file.sha256,
              kind: 'supported_dependency',
              revision: 'v1',
            },
            sourceMetadata: {},
          },
        }
      }
      const anima = await repository.publishVerifiedInstallation({
        dependencies: [
          { artifact: await dependency('qwen3_encoder'), role: 'qwen3_encoder' },
          { artifact: await dependency('vae'), role: 'vae' },
        ],
        primary: {
          file: animaFile,
          resource: {
            displayName: 'Anima',
            source: { kind: 'civitai', modelId: 45 },
            sourceMetadata: {},
            type: 'checkpoint',
          },
          version: {
            baseModelFamily: 'anima',
            format: 'safetensors',
            name: 'v1',
            source: {
              expectedSha256: animaFile.sha256,
              fileId: 4501,
              kind: 'civitai',
              versionId: 45,
            },
            sourceMetadata: {},
          },
        },
      })

      await assert.rejects(
        service.setPredictionType(firstRef.localModelId, randomUUID(), 'epsilon'),
        {
          code: 'MODEL_VERSION_UNAVAILABLE',
          name: 'ModelServiceError',
        },
      )
      await assert.rejects(service.setPredictionType(lora.resourceId, lora.versionId, 'epsilon'), {
        code: 'MODEL_VERSION_UNAVAILABLE',
        name: 'ModelServiceError',
      })
      await assert.rejects(
        service.setPredictionType(anima.resourceId, anima.versionId, 'epsilon'),
        {
          code: 'MODEL_VERSION_UNAVAILABLE',
          name: 'ModelServiceError',
        },
      )
      await assert.rejects(
        service.setPredictionType(
          firstRef.localModelId,
          firstRef.localVersionId,
          'sample' as 'epsilon',
        ),
        { code: 'MODEL_PREDICTION_INVALID', name: 'ModelServiceError' },
      )

      await writeFile(firstPath, Buffer.alloc(firstBytes.length, 0x58))
      await assert.rejects(
        service.setPredictionType(firstRef.localModelId, firstRef.localVersionId, 'v_prediction'),
        { code: 'MODEL_FILE_CORRUPT', name: 'ModelServiceError' },
      )
      assert.equal(
        await repository.getPredictionOverride({
          sha256: firstRef.fileSha256,
          sizeBytes: firstBytes.length,
        }),
        null,
      )
    },
  )
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
