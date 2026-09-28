import Database from 'better-sqlite3'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { openAppDatabase } from '../db/database.js'
import {
  type AnimaDependencyRole,
  ModelRepository,
  type VerifiedModelArtifact,
} from './model-repository.js'

const migrations = path.resolve('src/main/db/migrations')

function createFile(root: string, name: string): VerifiedModelArtifact['file'] {
  const folder = path.join(root, 'models')
  mkdirSync(folder, { recursive: true })
  const managedPath = path.join(folder, name)
  const bytes = Buffer.from(`verified model content: ${name}`)
  writeFileSync(managedPath, bytes)
  return {
    managedPath,
    originalFilename: name,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    sizeBytes: bytes.length,
    verifiedAt: new Date('2026-09-25T12:00:00.000Z').toISOString(),
  }
}

function civitaiArtifact(
  root: string,
  modelId: number,
  versionId: number,
  fileId: number,
  type: 'checkpoint' | 'lora' = 'checkpoint',
  family: 'anima' | 'illustrious' = 'illustrious',
): VerifiedModelArtifact {
  const file = createFile(root, `${modelId}-${versionId}-${fileId}.safetensors`)
  return {
    file,
    resource: {
      creator: 'CivitAI author',
      displayName: `Model ${modelId}`,
      source: { kind: 'civitai', modelId },
      sourceMetadata: { modelId, tags: ['test'] },
      type,
    },
    version: {
      baseModelFamily: family,
      format: 'safetensors',
      name: `v${versionId}`,
      predictionType: null,
      source: { expectedSha256: file.sha256, fileId, kind: 'civitai', versionId },
      sourceMetadata: { fileId, versionId },
    },
  }
}

function dependencyArtifact(
  root: string,
  role: AnimaDependencyRole,
  revision: string,
): VerifiedModelArtifact {
  const file = createFile(root, `${role}-${revision}.safetensors`)
  return {
    file,
    resource: {
      displayName: `Anima ${role}`,
      source: { key: `anima/${role}`, kind: 'supported_dependency' },
      sourceMetadata: { role },
      type: role,
    },
    version: {
      baseModelFamily: 'anima',
      format: 'safetensors',
      name: revision,
      source: { expectedSha256: file.sha256, kind: 'supported_dependency', revision },
      sourceMetadata: { revision },
    },
  }
}

test('verified installation survives reopen with exact CivitAI file identity and default', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'igs-model-repo-'))
  try {
    const first = openAppDatabase(root, migrations)
    const repository = new ModelRepository(first.db)
    const artifact = civitaiArtifact(root, 100, 200, 300)
    const published = await repository.publishVerifiedInstallation({ primary: artifact })
    assert.equal(
      (
        await repository.findExactFileDuplicate({
          civitai: { fileId: 300, modelId: 100, versionId: 200 },
        })
      )?.versionId,
      published.versionId,
    )
    assert.equal(
      (await repository.findExactFileDuplicate({ sha256: artifact.file.sha256 }))?.matchedBy,
      'sha256',
    )
    await first.close()

    const reopened = openAppDatabase(root, migrations)
    const installed = await new ModelRepository(reopened.db).listInstalled()
    assert.equal(installed.length, 1)
    assert.equal(installed[0]?.defaultVersionId, published.versionId)
    assert.deepEqual(installed[0]?.source, { kind: 'civitai', modelId: 100 })
    assert.deepEqual(installed[0]?.sourceMetadata, { modelId: 100, tags: ['test'] })
    assert.equal(installed[0]?.versions[0]?.id, published.versionId)
    assert.equal(installed[0]?.versions[0]?.civitaiVersionId, 200)
    assert.equal(installed[0]?.versions[0]?.civitaiFileId, 300)
    assert.equal(installed[0]?.versions[0]?.file.status, 'ready')
    assert.equal(installed[0]?.versions[0]?.file.sha256, artifact.file.sha256)
    await reopened.close()

    const sqlite = new Database(first.filePath)
    const migrationCount = sqlite
      .prepare<[], { count: number }>('SELECT count(*) AS count FROM schema_migrations')
      .get()
    assert.equal(migrationCount?.count, 7)
    sqlite.close()
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})

test('side-by-side versions preserve exact references and default changes only on request', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'igs-model-versions-'))
  try {
    const app = openAppDatabase(root, migrations)
    const repository = new ModelRepository(app.db)
    const first = await repository.publishVerifiedInstallation({
      primary: civitaiArtifact(root, 1, 11, 111),
    })
    const second = await repository.publishVerifiedInstallation({
      primary: civitaiArtifact(root, 1, 12, 112),
    })
    const other = await repository.publishVerifiedInstallation({
      primary: civitaiArtifact(root, 2, 21, 221),
    })

    let models = await repository.listInstalled()
    const model = models.find((entry) => entry.id === first.resourceId)
    assert.equal(model?.versions.length, 2)
    assert.equal(model?.defaultVersionId, first.versionId)
    assert.deepEqual(
      model?.versions.map((version) => version.id),
      [first.versionId, second.versionId],
    )

    await assert.rejects(repository.setDefaultVersion(other.resourceId, second.versionId))
    assert.equal(
      (await repository.listInstalled()).find((entry) => entry.id === other.resourceId)
        ?.defaultVersionId,
      other.versionId,
    )

    await repository.setDefaultVersion(first.resourceId, second.versionId)
    models = await repository.listInstalled()
    const changed = models.find((entry) => entry.id === first.resourceId)
    assert.equal(changed?.defaultVersionId, second.versionId)
    assert.deepEqual(
      changed?.versions.map((version) => version.id),
      [first.versionId, second.versionId],
    )
    await app.close()
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})

test('prediction override follows exact checkpoint bytes across versions and SQLite reopen', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'igs-model-prediction-'))
  try {
    const app = openAppDatabase(root, migrations)
    const repository = new ModelRepository(app.db)
    const firstArtifact = civitaiArtifact(root, 1, 11, 111)
    const duplicateArtifact = civitaiArtifact(root, 2, 22, 222)
    const sameBytes = readFileSync(firstArtifact.file.managedPath)
    writeFileSync(duplicateArtifact.file.managedPath, sameBytes)
    duplicateArtifact.file.sha256 = firstArtifact.file.sha256
    duplicateArtifact.file.sizeBytes = firstArtifact.file.sizeBytes
    duplicateArtifact.version.source = {
      expectedSha256: firstArtifact.file.sha256,
      fileId: 222,
      kind: 'civitai',
      versionId: 22,
    }
    const differentArtifact = civitaiArtifact(root, 3, 33, 333)
    const first = await repository.publishVerifiedInstallation({ primary: firstArtifact })
    const duplicate = await repository.publishVerifiedInstallation({ primary: duplicateArtifact })
    const different = await repository.publishVerifiedInstallation({ primary: differentArtifact })
    const loraArtifact = civitaiArtifact(root, 4, 44, 444, 'lora')
    const lora = await repository.publishVerifiedInstallation({ primary: loraArtifact })
    const exact = { sha256: firstArtifact.file.sha256, sizeBytes: firstArtifact.file.sizeBytes }
    assert.equal(await repository.getPredictionOverride(exact), null)
    assert.deepEqual(await repository.listPredictionOverrides(), [])

    const saved = await repository.setPredictionOverride({
      expectedSha256: exact.sha256,
      expectedSizeBytes: exact.sizeBytes,
      predictionType: 'v_prediction',
      resourceId: first.resourceId,
      versionId: first.versionId,
    })
    assert.equal(saved.predictionType, 'v_prediction')
    assert.equal(await repository.getPredictionOverride(exact), 'v_prediction')
    assert.equal(
      await repository.getPredictionOverride({
        sha256: differentArtifact.file.sha256,
        sizeBytes: differentArtifact.file.sizeBytes,
      }),
      null,
    )
    assert.equal((await repository.listPredictionOverrides()).length, 1)
    // The version column remains untouched evidence; both exact-byte owners use one override.
    assert.deepEqual(
      (await repository.listInstalled()).flatMap((resource) =>
        resource.versions.map((version) => version.predictionType),
      ),
      [null, null, null, null],
    )

    const input = {
      expectedSha256: exact.sha256,
      expectedSizeBytes: exact.sizeBytes,
      predictionType: 'sample' as const,
      resourceId: duplicate.resourceId,
      versionId: duplicate.versionId,
    }
    for (const stale of [
      { ...input, resourceId: first.resourceId },
      { ...input, expectedSha256: '0'.repeat(64) },
      { ...input, expectedSizeBytes: exact.sizeBytes + 1 },
      { ...input, resourceId: different.resourceId, versionId: different.versionId },
      {
        ...input,
        expectedSha256: loraArtifact.file.sha256,
        expectedSizeBytes: loraArtifact.file.sizeBytes,
        resourceId: lora.resourceId,
        versionId: lora.versionId,
      },
    ]) {
      await assert.rejects(repository.setPredictionOverride(stale), /exact ready Illustrious/)
    }
    assert.equal(await repository.getPredictionOverride(exact), 'v_prediction')
    await repository.setPredictionOverride(input)
    assert.equal(await repository.getPredictionOverride(exact), 'sample')
    assert.equal((await repository.listPredictionOverrides()).length, 1)
    await app.close()

    const reopened = openAppDatabase(root, migrations)
    try {
      const reloaded = new ModelRepository(reopened.db)
      assert.equal(await reloaded.getPredictionOverride(exact), 'sample')
      assert.deepEqual(
        (await reloaded.listPredictionOverrides()).map((item) => item.sha256),
        [exact.sha256],
      )
    } finally {
      await reopened.close()
    }
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})

test('distinct CivitAI versions may share verified bytes without sharing version identity', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'igs-model-shared-bytes-'))
  try {
    const app = openAppDatabase(root, migrations)
    const repository = new ModelRepository(app.db)
    const firstArtifact = civitaiArtifact(root, 8, 81, 811)
    const first = await repository.publishVerifiedInstallation({ primary: firstArtifact })
    const secondArtifact = civitaiArtifact(root, 8, 82, 822)
    secondArtifact.file = { ...firstArtifact.file }
    secondArtifact.version.source = {
      expectedSha256: firstArtifact.file.sha256,
      fileId: 822,
      kind: 'civitai',
      versionId: 82,
    }
    const second = await repository.publishVerifiedInstallation({ primary: secondArtifact })

    assert.notEqual(first.versionId, second.versionId)
    assert.notEqual(first.fileId, second.fileId)
    assert.equal(first.resourceId, second.resourceId)
    let model = (await repository.listInstalled()).find((entry) => entry.id === first.resourceId)
    assert.equal(model?.defaultVersionId, first.versionId)
    assert.deepEqual(
      model?.versions.map(({ civitaiFileId, civitaiVersionId, file }) => ({
        civitaiFileId,
        civitaiVersionId,
        managedPath: file.managedPath,
      })),
      [
        { civitaiFileId: 811, civitaiVersionId: 81, managedPath: firstArtifact.file.managedPath },
        { civitaiFileId: 822, civitaiVersionId: 82, managedPath: firstArtifact.file.managedPath },
      ],
    )
    assert.equal(
      (
        await repository.findExactFileDuplicate({
          civitai: { fileId: 822, modelId: 8, versionId: 82 },
          sha256: firstArtifact.file.sha256,
        })
      )?.versionId,
      second.versionId,
    )
    await repository.setDefaultVersion(first.resourceId, second.versionId)
    await app.close()

    const reopened = openAppDatabase(root, migrations)
    model = (await new ModelRepository(reopened.db).listInstalled()).find(
      (entry) => entry.id === first.resourceId,
    )
    assert.equal(model?.defaultVersionId, second.versionId)
    assert.deepEqual(
      model?.versions.map((version) => version.id),
      [first.versionId, second.versionId],
    )
    await reopened.close()
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})

test('exact-version repair restores missing bytes without changing identity and completes its job atomically', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'igs-model-repair-'))
  try {
    const app = openAppDatabase(root, migrations)
    const repository = new ModelRepository(app.db)
    const artifact = civitaiArtifact(root, 9, 91, 911)
    const published = await repository.publishVerifiedInstallation({ primary: artifact })
    const originalBytes = readFileSync(artifact.file.managedPath)
    rmSync(artifact.file.managedPath)
    await app.db
      .updateTable('local_model_file')
      .set({ status: 'missing' })
      .where('id', '=', published.fileId)
      .execute()

    const recoveredPath = path.join(root, 'models', 'recovered.safetensors')
    writeFileSync(recoveredPath, originalBytes)
    const repairedFile = {
      ...artifact.file,
      managedPath: recoveredPath,
      originalFilename: 'recovered.safetensors',
      verifiedAt: '2026-09-26T12:00:00.000Z',
    }
    const jobId = await repository.createInstallJob({
      artifacts: [{ role: 'primary', source: { fileId: 911, kind: 'civitai_file' } }],
      baseModelFamily: 'illustrious',
      civitaiFileId: 911,
      civitaiModelId: 9,
      civitaiVersionId: 91,
      displayName: 'Model 9',
      resourceType: 'checkpoint',
      versionName: 'v91',
    })
    await repository.updateInstallJob(jobId, { status: 'downloading' })
    await repository.updateInstallArtifact(jobId, 'primary', { status: 'downloading' })
    await repository.updateInstallArtifact(jobId, 'primary', { status: 'verifying' })
    await repository.updateInstallArtifact(jobId, 'primary', { status: 'ready' })
    await repository.updateInstallJob(jobId, { status: 'verifying' })

    const wrongFile = createFile(root, 'wrong-repair.safetensors')
    await assert.rejects(
      repository.repairVerifiedVersion({ file: wrongFile, jobId, versionId: published.versionId }),
      /does not match the installed version hash and size/,
    )
    const linkPath = path.join(root, 'models', 'repair-link.safetensors')
    symlinkSync(recoveredPath, linkPath)
    await assert.rejects(
      repository.repairVerifiedVersion({
        file: { ...repairedFile, managedPath: linkPath },
        jobId,
        versionId: published.versionId,
      }),
      /missing or has changed size/,
    )
    await assert.rejects(
      repository.repairVerifiedVersion({ file: repairedFile, jobId, versionId: 'unknown' }),
      /Exact model version does not exist/,
    )
    const unrelatedJobId = await repository.createInstallJob({
      artifacts: [{ role: 'primary', source: { fileId: 912, kind: 'civitai_file' } }],
      baseModelFamily: 'illustrious',
      civitaiFileId: 912,
      civitaiModelId: 9,
      civitaiVersionId: 92,
      displayName: 'Model 9',
      resourceType: 'checkpoint',
      versionName: 'v92',
    })
    await repository.updateInstallJob(unrelatedJobId, { status: 'downloading' })
    await repository.updateInstallArtifact(unrelatedJobId, 'primary', { status: 'downloading' })
    await repository.updateInstallArtifact(unrelatedJobId, 'primary', { status: 'verifying' })
    await repository.updateInstallArtifact(unrelatedJobId, 'primary', { status: 'ready' })
    await repository.updateInstallJob(unrelatedJobId, { status: 'verifying' })
    await assert.rejects(
      repository.repairVerifiedVersion({
        file: repairedFile,
        jobId: unrelatedJobId,
        versionId: published.versionId,
      }),
      /source identity does not match/,
    )
    assert.equal(
      (await repository.listInstallJobs()).find((job) => job.id === jobId)?.status,
      'verifying',
    )
    let version = (await repository.listInstalled())[0]?.versions[0]
    assert.equal(version?.file.status, 'missing')
    assert.equal(version?.file.managedPath, artifact.file.managedPath)

    await repository.repairVerifiedVersion({
      file: repairedFile,
      jobId,
      versionId: published.versionId,
    })
    await app.close()

    const reopened = openAppDatabase(root, migrations)
    const reopenedRepository = new ModelRepository(reopened.db)
    const model = (await reopenedRepository.listInstalled())[0]
    version = model?.versions[0]
    assert.equal(model?.id, published.resourceId)
    assert.equal(model?.defaultVersionId, published.versionId)
    assert.equal(version?.id, published.versionId)
    assert.equal(version?.file.id, published.fileId)
    assert.equal(version?.file.status, 'ready')
    assert.equal(version?.file.managedPath, recoveredPath)
    assert.equal(version?.file.sha256, artifact.file.sha256)
    assert.equal(version?.file.verifiedAt, repairedFile.verifiedAt)
    assert.deepEqual(version?.sourceMetadata, artifact.version.sourceMetadata)
    const jobs = await reopenedRepository.listInstallJobs()
    assert.equal(jobs.find((job) => job.id === jobId)?.status, 'completed')
    assert.equal(jobs.find((job) => job.id === unrelatedJobId)?.status, 'verifying')
    await reopened.close()
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})

test('incomplete or missing Anima dependency never publishes a selectable checkpoint', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'igs-model-anima-fail-'))
  try {
    const app = openAppDatabase(root, migrations)
    const repository = new ModelRepository(app.db)
    const checkpoint = civitaiArtifact(root, 3, 31, 331, 'checkpoint', 'anima')
    const encoder = dependencyArtifact(root, 'qwen3_encoder', 'pinned-revision')
    const vae = dependencyArtifact(root, 'vae', 'pinned-revision')

    await assert.rejects(
      repository.publishVerifiedInstallation({
        dependencies: [{ artifact: encoder, role: 'qwen3_encoder' }],
        primary: checkpoint,
      }),
      /requires both/,
    )
    rmSync(vae.file.managedPath)
    await assert.rejects(
      repository.publishVerifiedInstallation({
        dependencies: [
          { artifact: encoder, role: 'qwen3_encoder' },
          { artifact: vae, role: 'vae' },
        ],
        primary: checkpoint,
      }),
    )
    assert.deepEqual(await repository.listInstalled(), [])
    await app.close()
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})

test('Anima group publishes atomically and reuses ready shared companions', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'igs-model-anima-ready-'))
  try {
    const app = openAppDatabase(root, migrations)
    const repository = new ModelRepository(app.db)
    const encoder = dependencyArtifact(root, 'qwen3_encoder', 'pinned-revision')
    const vae = dependencyArtifact(root, 'vae', 'pinned-revision')
    const first = await repository.publishVerifiedInstallation({
      dependencies: [
        { artifact: encoder, role: 'qwen3_encoder' },
        { artifact: vae, role: 'vae' },
      ],
      primary: civitaiArtifact(root, 4, 41, 441, 'checkpoint', 'anima'),
    })
    assert.ok(first.dependencyVersionIds.qwen3_encoder)
    assert.ok(first.dependencyVersionIds.vae)

    const second = await repository.publishVerifiedInstallation({
      dependencies: [
        { existingVersionId: first.dependencyVersionIds.qwen3_encoder, role: 'qwen3_encoder' },
        { existingVersionId: first.dependencyVersionIds.vae, role: 'vae' },
      ],
      primary: civitaiArtifact(root, 5, 51, 551, 'checkpoint', 'anima'),
    })
    assert.deepEqual(second.dependencyVersionIds, first.dependencyVersionIds)
    const models = await repository.listInstalled()
    assert.equal(models.length, 4)
    assert.equal(
      models.find((model) => model.id === second.resourceId)?.versions[0]?.dependencyVersionIds.vae,
      first.dependencyVersionIds.vae,
    )
    const animaFile = models.find((model) => model.id === first.resourceId)?.versions[0]?.file
    assert.ok(animaFile)
    await assert.rejects(
      repository.setPredictionOverride({
        expectedSha256: animaFile.sha256,
        expectedSizeBytes: animaFile.sizeBytes,
        predictionType: 'epsilon',
        resourceId: first.resourceId,
        versionId: first.versionId,
      }),
      /exact ready Illustrious/,
    )
    await app.close()
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})

test('Anima checkpoint repair rolls back dependency repair when the final job identity fails', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'igs-model-anima-repair-'))
  try {
    const app = openAppDatabase(root, migrations)
    const repository = new ModelRepository(app.db)
    const checkpoint = civitaiArtifact(root, 64, 641, 6411, 'checkpoint', 'anima')
    const encoder = dependencyArtifact(root, 'qwen3_encoder', 'pinned-revision')
    const vae = dependencyArtifact(root, 'vae', 'pinned-revision')
    const published = await repository.publishVerifiedInstallation({
      dependencies: [
        { artifact: encoder, role: 'qwen3_encoder' },
        { artifact: vae, role: 'vae' },
      ],
      primary: checkpoint,
    })
    const vaeId = published.dependencyVersionIds.vae
    assert.ok(vaeId)
    const before = (await repository.listInstalled())
      .flatMap((resource) => resource.versions)
      .find((version) => version.id === vaeId)
    assert.ok(before)
    await app.db
      .updateTable('local_model_file')
      .set({ status: 'corrupt' })
      .where('resource_version_id', '=', vaeId)
      .execute()
    const recoveredPath = path.join(root, 'models', 'recovered-vae.safetensors')
    writeFileSync(recoveredPath, readFileSync(vae.file.managedPath))
    const recovered = {
      ...vae.file,
      managedPath: recoveredPath,
      originalFilename: 'recovered-vae.safetensors',
    }
    const wrongJobId = await repository.createInstallJob({
      artifacts: [
        { role: 'primary', source: { fileId: 6412, kind: 'civitai_file' } },
        { role: 'vae', source: { key: 'anima/vae', kind: 'supported_dependency' } },
      ],
      baseModelFamily: 'anima',
      civitaiFileId: 6412,
      civitaiModelId: 64,
      civitaiVersionId: 641,
      displayName: 'Model 64',
      resourceType: 'checkpoint',
      versionName: 'v641',
    })
    await repository.updateInstallJob(wrongJobId, { status: 'downloading' })
    for (const role of ['primary', 'vae'] as const) {
      await repository.updateInstallArtifact(wrongJobId, role, { status: 'downloading' })
      await repository.updateInstallArtifact(wrongJobId, role, { status: 'verifying' })
      await repository.updateInstallArtifact(wrongJobId, role, { status: 'ready' })
    }
    await repository.updateInstallJob(wrongJobId, { status: 'verifying' })
    const repair = {
      dependencyRepairs: [{ file: recovered, role: 'vae' as const, versionId: vaeId }],
      file: checkpoint.file,
      versionId: published.versionId,
    }
    await assert.rejects(
      repository.repairVerifiedVersion({ ...repair, jobId: wrongJobId }),
      /source identity does not match/,
    )
    const rolledBack = (await repository.listInstalled())
      .flatMap((resource) => resource.versions)
      .find((version) => version.id === vaeId)
    assert.equal(rolledBack?.file.status, 'corrupt')
    assert.equal(rolledBack.file.managedPath, before.file.managedPath)
    assert.equal(
      (await repository.listInstallJobs()).find((job) => job.id === wrongJobId)?.status,
      'verifying',
    )

    await repository.repairVerifiedVersion(repair)
    const repaired = (await repository.listInstalled())
      .flatMap((resource) => resource.versions)
      .find((version) => version.id === vaeId)
    assert.equal(repaired?.file.status, 'ready')
    assert.equal(repaired.file.managedPath, recoveredPath)
    await app.close()
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})

test('a late SQLite conflict rolls back every new member of an Anima install group', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'igs-model-anima-rollback-'))
  try {
    const app = openAppDatabase(root, migrations)
    const repository = new ModelRepository(app.db)
    const originalEncoder = dependencyArtifact(root, 'qwen3_encoder', 'pinned-revision')
    const vae = dependencyArtifact(root, 'vae', 'pinned-revision')
    await repository.publishVerifiedInstallation({
      dependencies: [
        { artifact: originalEncoder, role: 'qwen3_encoder' },
        { artifact: vae, role: 'vae' },
      ],
      primary: civitaiArtifact(root, 6, 61, 661, 'checkpoint', 'anima'),
    })
    const encoder = dependencyArtifact(root, 'qwen3_encoder', 'new-revision')
    await assert.rejects(
      repository.publishVerifiedInstallation({
        dependencies: [
          { artifact: encoder, role: 'qwen3_encoder' },
          { artifact: vae, role: 'vae' },
        ],
        primary: civitaiArtifact(root, 7, 71, 771, 'checkpoint', 'anima'),
      }),
      /UNIQUE constraint failed: model_resource_version/,
    )
    const installed = await repository.listInstalled()
    assert.equal(installed.length, 3)
    assert.equal(installed.find((model) => model.type === 'qwen3_encoder')?.versions.length, 1)
    assert.equal(
      installed.some((model) => model.source.kind === 'civitai' && model.source.modelId === 7),
      false,
    )
    await app.close()
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})

test('install jobs persist only safe source identities and require verified artifacts before completion', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'igs-model-jobs-'))
  try {
    const app = openAppDatabase(root, migrations)
    const repository = new ModelRepository(app.db)
    const jobId = await repository.createInstallJob({
      artifacts: [
        {
          expectedSizeBytes: 42,
          role: 'primary',
          source: { fileId: 771, kind: 'civitai_file' },
        },
      ],
      baseModelFamily: 'illustrious',
      civitaiFileId: 771,
      civitaiModelId: 7,
      civitaiVersionId: 71,
      displayName: 'Portrait model',
      resourceType: 'checkpoint',
      versionName: 'v1',
    })
    await repository.updateInstallJob(jobId, { bytesDownloaded: 10, status: 'downloading' })
    await repository.updateInstallArtifact(jobId, 'primary', {
      downloadedBytes: 10,
      status: 'downloading',
      tempPath: path.join(root, 'partial-download'),
    })
    await repository.updateInstallArtifact(jobId, 'primary', {
      downloadedBytes: 42,
      status: 'verifying',
    })
    await repository.updateInstallJob(jobId, { bytesDownloaded: 42, status: 'verifying' })
    await assert.rejects(
      repository.updateInstallJob(jobId, { status: 'completed' }),
      /all artifacts are ready/,
    )
    await repository.updateInstallArtifact(jobId, 'primary', { status: 'ready' })
    await repository.updateInstallJob(jobId, { status: 'completed' })
    await assert.rejects(repository.updateInstallJob(jobId, { status: 'downloading' }))
    await app.close()

    const reopened = openAppDatabase(root, migrations)
    const persisted = await new ModelRepository(reopened.db).listInstallJobs()
    assert.equal(persisted.length, 1)
    assert.equal(persisted[0]?.id, jobId)
    assert.equal(persisted[0]?.status, 'completed')
    assert.equal(persisted[0]?.artifacts[0]?.status, 'ready')
    assert.equal(persisted[0]?.artifacts[0]?.tempPath, path.join(root, 'partial-download'))
    assert.deepEqual(persisted[0]?.artifacts[0]?.source, { fileId: 771, kind: 'civitai_file' })
    await reopened.close()

    const sqlite = new Database(app.filePath)
    const raw = sqlite
      .prepare<[], { preview_payload_json: string; source_identity: string }>(
        'SELECT preview_payload_json, source_identity FROM model_install_job JOIN model_install_artifact ON model_install_artifact.job_id = model_install_job.id',
      )
      .get()
    assert.ok(raw)
    assert.equal(raw.source_identity, 'civitai:file:771')
    assert.deepEqual(JSON.parse(raw.preview_payload_json), {
      baseModelFamily: 'illustrious',
      displayName: 'Portrait model',
      resourceType: 'checkpoint',
      versionName: 'v1',
    })
    sqlite.close()
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})

test('startup marks unfinished install jobs interrupted while completed jobs remain intact', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'igs-model-interrupted-'))
  try {
    const first = openAppDatabase(root, migrations)
    const repository = new ModelRepository(first.db)
    const activeId = await repository.createInstallJob({
      artifacts: [{ role: 'primary', source: { fileId: 881, kind: 'civitai_file' } }],
      baseModelFamily: 'anima',
      civitaiFileId: 881,
      civitaiModelId: 8,
      civitaiVersionId: 81,
      displayName: 'Interrupted model',
      resourceType: 'lora',
      versionName: 'v1',
    })
    await repository.updateInstallJob(activeId, { bytesDownloaded: 17, status: 'downloading' })
    await repository.updateInstallArtifact(activeId, 'primary', {
      downloadedBytes: 17,
      status: 'downloading',
    })
    await first.close()

    const reopened = openAppDatabase(root, migrations)
    const afterRestart = new ModelRepository(reopened.db)
    assert.equal(await afterRestart.failInterruptedInstallJobs(), 1)
    assert.equal(await afterRestart.failInterruptedInstallJobs(), 0)
    const [job] = await afterRestart.listInstallJobs()
    assert.equal(job?.id, activeId)
    assert.equal(job?.status, 'failed')
    assert.equal(job?.errorCode, 'interrupted')
    assert.equal(job?.artifacts[0]?.status, 'failed')
    assert.equal(job?.artifacts[0]?.errorCode, 'interrupted')
    await reopened.close()
  } finally {
    rmSync(root, { force: true, recursive: true })
  }
})
