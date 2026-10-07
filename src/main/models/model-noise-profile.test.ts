import type { SetCheckpointNoiseProfileChange } from '../../shared/api.js'
import type { IllustriousNoiseProfileV1 } from '../../shared/projects/illustrious-noise-profile.js'
import type { IgsProjectDocumentV1 } from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, unlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { openAppDatabase } from '../db/database.js'
import { CivitaiClient } from './civitai-client.js'
import { CivitaiTokenStore, type SafeStorageAdapter } from './civitai-token-store.js'
import { ModelRepository, type VerifiedModelArtifact } from './model-repository.js'
import { ModelService } from './model-service.js'

type ExactCheckpoint = NonNullable<IgsProjectDocumentV1['generationDraft']['model']>
const migrations = path.resolve('src/main/db/migrations')
// Contract oracle stays independent of the implementation's default helper.
const baseline: IllustriousNoiseProfileV1 = {
  baseSchedule: 'sdxl-scaled-linear-v1',
  rescaleBetasZeroSnr: false,
  schemaVersion: 1,
  timestepSpacing: 'leading',
}
const safeStorage: SafeStorageAdapter = {
  decryptStringAsync: async () => ({ result: '', shouldReEncrypt: false }),
  encryptStringAsync: async () => Buffer.alloc(0),
  getSelectedStorageBackend: () => 'gnome_libsecret',
  isAsyncEncryptionAvailable: async () => true,
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-noise-policy-'))
  let database = openAppDatabase(root, migrations)
  let repository = new ModelRepository(database.db)
  // Structural ML qualification is controlled here; file hashing and durable policy stay real.
  const makeService = () =>
    new ModelService(
      repository,
      new CivitaiClient(),
      new CivitaiTokenStore(safeStorage, root),
      undefined,
      [],
      async () => {},
    )
  let service = makeService()
  await mkdir(path.join(root, 'models'))
  let nextFileId = 100
  async function install(
    bytes: Buffer,
    family: 'anima' | 'illustrious' = 'illustrious',
    kind: 'checkpoint' | 'lora' = 'checkpoint',
  ) {
    const fileId = nextFileId++
    const managedPath = path.join(root, 'models', `${fileId}.safetensors`)
    await writeFile(managedPath, bytes)
    const artifact: VerifiedModelArtifact = {
      file: {
        managedPath,
        originalFilename: `${fileId}.safetensors`,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        sizeBytes: bytes.length,
        verifiedAt: '2026-10-07T00:00:00.000Z',
      },
      resource: {
        displayName: `Custom checkpoint ${fileId}`,
        source: { kind: 'civitai', modelId: fileId },
        sourceMetadata: { baseModel: 'NoobAI', rescale_betas_zero_snr: true },
        type: kind,
      },
      version: {
        baseModelFamily: family,
        format: 'safetensors',
        name: `Version ${fileId}`,
        predictionType: family === 'illustrious' && kind === 'checkpoint' ? 'v_prediction' : null,
        source: { fileId, kind: 'civitai', versionId: fileId },
        sourceMetadata: { timestep_spacing: 'trailing' },
      },
    }
    const dependencies = []
    if (family === 'anima' && kind === 'checkpoint') {
      for (const role of ['qwen3_encoder', 'vae'] as const) {
        const dependencyBytes = Buffer.from(`Catalog-only Anima ${role}`)
        const dependencyPath = path.join(root, 'models', `${fileId}-${role}.safetensors`)
        await writeFile(dependencyPath, dependencyBytes)
        const sha256 = createHash('sha256').update(dependencyBytes).digest('hex')
        const dependency: VerifiedModelArtifact = {
          file: {
            managedPath: dependencyPath,
            originalFilename: `${fileId}-${role}.safetensors`,
            sha256,
            sizeBytes: dependencyBytes.length,
            verifiedAt: artifact.file.verifiedAt,
          },
          resource: {
            displayName: role,
            source: { key: `test/anima/${role}`, kind: 'supported_dependency' },
            sourceMetadata: {},
            type: role,
          },
          version: {
            baseModelFamily: 'anima',
            format: 'safetensors',
            name: 'catalog-only',
            source: { expectedSha256: sha256, kind: 'supported_dependency', revision: 'test' },
            sourceMetadata: {},
          },
        }
        dependencies.push({ artifact: dependency, role })
      }
    }
    const published = await repository.publishVerifiedInstallation({
      dependencies,
      primary: artifact,
    })
    const reference: ExactCheckpoint = {
      baseModelFamily: family,
      civitaiFileId: fileId,
      civitaiModelId: fileId,
      civitaiVersionId: fileId,
      displayName: artifact.resource.displayName,
      fileSha256: artifact.file.sha256,
      kind: 'checkpoint',
      localModelId: published.resourceId,
      localVersionId: published.versionId,
      predictionType: family === 'illustrious' ? 'v_prediction' : null,
      versionName: artifact.version.name,
    }
    return { artifact, bytes, published, reference }
  }
  return {
    async close() {
      await database.close()
      await rm(root, { force: true, recursive: true })
    },
    get database() {
      return database
    },
    install,
    async reopen() {
      await database.close()
      database = openAppDatabase(root, migrations)
      repository = new ModelRepository(database.db)
      service = makeService()
    },
    get repository() {
      return repository
    },
    get service() {
      return service
    },
  }
}

test('exact checkpoint policy keeps independent assumed defaults and passes actual values through verified generation resolution', async () => {
  const f = await fixture()
  try {
    const first = await f.install(Buffer.from('first exact model'))
    const second = await f.install(Buffer.from('second exact model'))
    const ids = [first.reference.localModelId, first.reference.localVersionId] as const
    const catalogPolicy = async () =>
      (await f.service.getCatalog()).find((item) => item.id === ids[0])?.versions[0]?.noiseProfile
    assert.deepEqual(await catalogPolicy(), {
      effective: baseline,
      rescaleBetasZeroSnrSource: 'assumed',
      timestepSpacingSource: 'assumed',
    })
    // Neither NoobAI metadata, v_prediction nor exported spacing changes these assumptions.
    assert.deepEqual(
      (await f.service.resolveVerifiedGenerationCheckpointForPlan(first.reference)).noiseProfile,
      baseline,
    )
    await f.service.setNoiseProfile(...ids, { kind: 'rescale-betas-zero-snr', value: false })
    assert.equal((await catalogPolicy())?.rescaleBetasZeroSnrSource, 'override')
    assert.equal((await catalogPolicy())?.timestepSpacingSource, 'assumed')
    await f.service.setNoiseProfile(...ids, { kind: 'rescale-betas-zero-snr', value: true })
    for (const spacing of ['linspace', 'trailing', 'leading'] as const) {
      await f.service.setNoiseProfile(...ids, { kind: 'timestep-spacing', value: spacing })
      assert.deepEqual(
        (await f.service.resolveVerifiedGenerationCheckpointForPlan(first.reference)).noiseProfile,
        {
          ...baseline,
          rescaleBetasZeroSnr: true,
          timestepSpacing: spacing,
        },
      )
    }
    await f.service.setNoiseProfile(...ids, { kind: 'timestep-spacing', value: 'trailing' })
    await f.service.setNoiseProfile(...ids, { kind: 'rescale-betas-zero-snr', value: null })
    assert.deepEqual(await catalogPolicy(), {
      effective: { ...baseline, timestepSpacing: 'trailing' },
      rescaleBetasZeroSnrSource: 'assumed',
      timestepSpacingSource: 'override',
    })
    await f.service.setNoiseProfile(...ids, { kind: 'timestep-spacing', value: null })
    assert.deepEqual(await catalogPolicy(), {
      effective: baseline,
      rescaleBetasZeroSnrSource: 'assumed',
      timestepSpacingSource: 'assumed',
    })
    assert.deepEqual(
      (await f.service.resolveVerifiedGenerationCheckpointForPlan(second.reference)).noiseProfile,
      baseline,
    )
    assert.equal(first.reference.predictionType, 'v_prediction')
    assert.equal(
      (await f.repository.listInstalled())[0]?.versions[0]?.sourceMetadata['timestep_spacing'],
      'trailing',
    )
  } finally {
    await f.close()
  }
})

test('noise policy is shared by exact SHA and size, persists across reopen, and survives exact-file repair without leaking to other bytes', async () => {
  const f = await fixture()
  try {
    const first = await f.install(Buffer.from('shared exact model'))
    const duplicate = await f.install(first.bytes)
    const other = await f.install(Buffer.from('other exact model'))
    await f.service.setNoiseProfile(first.published.resourceId, first.published.versionId, {
      kind: 'rescale-betas-zero-snr',
      value: true,
    })
    await f.service.setNoiseProfile(duplicate.published.resourceId, duplicate.published.versionId, {
      kind: 'timestep-spacing',
      value: 'trailing',
    })
    const expected = {
      ...baseline,
      rescaleBetasZeroSnr: true,
      timestepSpacing: 'trailing',
    }
    await f.reopen()
    for (const saved of [first.reference, duplicate.reference]) {
      assert.deepEqual(
        (await f.service.resolveVerifiedGenerationCheckpointForPlan(saved)).noiseProfile,
        expected,
      )
    }
    assert.deepEqual(
      (await f.service.resolveVerifiedGenerationCheckpointForPlan(other.reference)).noiseProfile,
      baseline,
    )
    assert.equal(
      await f.repository.getNoiseProfileOverride({
        sha256: first.artifact.file.sha256,
        sizeBytes: first.bytes.length + 1,
      }),
      null,
    )
    await unlink(first.artifact.file.managedPath)
    await writeFile(first.artifact.file.managedPath, first.bytes)
    await f.repository.repairVerifiedVersion({
      file: first.artifact.file,
      versionId: first.published.versionId,
    })
    assert.deepEqual(
      (await f.service.resolveVerifiedGenerationCheckpointForPlan(first.reference)).noiseProfile,
      expected,
    )
    await f.service.setNoiseProfile(duplicate.published.resourceId, duplicate.published.versionId, {
      kind: 'timestep-spacing',
      value: null,
    })
    assert.deepEqual(
      (await f.service.resolveVerifiedGenerationCheckpointForPlan(first.reference)).noiseProfile,
      { ...baseline, rescaleBetasZeroSnr: true },
    )
  } finally {
    await f.close()
  }
})

test('noise editing refuses wrong family, non-checkpoints, stale identity, malformed choices and same-size corrupt bytes without touching policy', async () => {
  const f = await fixture()
  try {
    const first = await f.install(Buffer.from('first exact checkpoint'))
    const anima = await f.install(Buffer.from('Anima checkpoint'), 'anima')
    const lora = await f.install(Buffer.from('Illustrious LoRA'), 'illustrious', 'lora')
    const change = { kind: 'rescale-betas-zero-snr', value: true } as const
    for (const target of [anima, lora]) {
      await assert.rejects(
        f.service.setNoiseProfile(target.published.resourceId, target.published.versionId, change),
        { code: 'MODEL_VERSION_UNAVAILABLE' },
      )
      assert.equal(
        (await f.service.getCatalog()).find((item) => item.id === target.published.resourceId)
          ?.versions[0]?.noiseProfile,
        undefined,
      )
    }
    for (const invalid of [
      { kind: 'timestep-spacing', value: 'custom' },
      { kind: 'rescale-betas-zero-snr', value: 1 },
      { kind: 'rescale-betas-zero-snr', other: 'untrusted', value: true },
    ]) {
      await assert.rejects(
        f.service.setNoiseProfile(
          first.published.resourceId,
          first.published.versionId,
          invalid as SetCheckpointNoiseProfileChange,
        ),
        { code: 'MODEL_NOISE_PROFILE_INVALID' },
      )
    }
    await assert.rejects(
      f.repository.setNoiseProfileOverride({
        change,
        expectedSha256: 'a'.repeat(64),
        expectedSizeBytes: first.bytes.length,
        resourceId: first.published.resourceId,
        versionId: first.published.versionId,
      }),
      /exact ready Illustrious checkpoint/,
    )
    await writeFile(first.artifact.file.managedPath, Buffer.alloc(first.bytes.length, 0x42))
    await assert.rejects(
      f.service.setNoiseProfile(first.published.resourceId, first.published.versionId, change),
      { code: 'MODEL_FILE_CORRUPT' },
    )
    assert.equal(
      await f.repository.getNoiseProfileOverride({
        sha256: first.artifact.file.sha256,
        sizeBytes: first.bytes.length,
      }),
      null,
    )
    await writeFile(first.artifact.file.managedPath, first.bytes)
    await f.service.setNoiseProfile(first.published.resourceId, first.published.versionId, change)
    assert.equal(
      (await f.service.resolveVerifiedGenerationCheckpointForPlan(first.reference)).noiseProfile
        .rescaleBetasZeroSnr,
      true,
    )
  } finally {
    await f.close()
  }
})
