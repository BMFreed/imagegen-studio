import { sql } from 'kysely'
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { openAppDatabase } from '../db/database.js'
import {
  type InstalledModel,
  ModelRepository,
  type VerifiedModelArtifact,
} from './model-repository.js'

const migrations = path.resolve('src/main/db/migrations')

function artifact(root: string, modelId = 100, versionId = 200): VerifiedModelArtifact {
  const bytes = Buffer.from(`Owned removal preflight fixture ${modelId}/${versionId}`)
  const managedPath = path.join(root, 'models', `${modelId}-${versionId}.safetensors`)
  mkdirSync(path.dirname(managedPath), { recursive: true })
  writeFileSync(managedPath, bytes)
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  return {
    file: {
      managedPath,
      originalFilename: path.basename(managedPath),
      sha256,
      sizeBytes: bytes.length,
      verifiedAt: '2026-11-13T00:00:00.000Z',
    },
    resource: {
      displayName: 'Owned preflight resource',
      source: { kind: 'civitai', modelId },
      sourceMetadata: { nested: { tags: ['owned'] } },
      type: 'checkpoint',
    },
    version: {
      baseModelFamily: 'illustrious',
      format: 'safetensors',
      name: `Version ${versionId}`,
      source: { expectedSha256: sha256, fileId: versionId + 100, kind: 'civitai', versionId },
      sourceMetadata: { nested: { versionId } },
    },
  }
}

function shareFile(
  target: VerifiedModelArtifact,
  source: VerifiedModelArtifact,
  versionId: number,
): VerifiedModelArtifact {
  return {
    ...target,
    file: { ...source.file },
    version: {
      ...target.version,
      source: {
        expectedSha256: source.file.sha256,
        fileId: versionId + 100,
        kind: 'civitai',
        versionId,
      },
    },
  }
}

function companion(root: string, role: 'qwen3_encoder' | 'vae'): VerifiedModelArtifact {
  const value = artifact(root, role === 'qwen3_encoder' ? 1001 : 1002)
  value.resource = {
    displayName: `Owned ${role}`,
    source: { key: `anima/${role}`, kind: 'supported_dependency' },
    sourceMetadata: {},
    type: role,
  }
  value.version = {
    baseModelFamily: 'anima',
    format: 'safetensors',
    name: 'owned-revision',
    source: {
      expectedSha256: value.file.sha256,
      kind: 'supported_dependency',
      revision: 'owned-revision',
    },
    sourceMetadata: {},
  }
  return value
}

async function withRepository(
  run: (context: {
    app: ReturnType<typeof openAppDatabase>
    repository: ModelRepository
    root: string
  }) => Promise<void>,
) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'igs-resource-remove-preflight-'))
  const app = openAppDatabase(root, migrations)
  try {
    await run({ app, repository: new ModelRepository(app.db), root })
  } finally {
    await app.close()
    rmSync(root, { force: true, recursive: true })
  }
}

async function installed(repository: ModelRepository, resourceId: string): Promise<InstalledModel> {
  const value = (await repository.listInstalled()).find((resource) => resource.id === resourceId)
  assert.ok(value)
  return value
}

async function registryState(app: ReturnType<typeof openAppDatabase>) {
  return {
    dependencies: await app.db.selectFrom('model_version_dependency').selectAll().execute(),
    files: await app.db.selectFrom('local_model_file').selectAll().execute(),
    identities: await app.db.selectFrom('model_reference_identity').selectAll().execute(),
    resources: await app.db.selectFrom('model_resource').selectAll().execute(),
    versions: await app.db.selectFrom('model_resource_version').selectAll().execute(),
  }
}

test('preflight works with SQLite query_only and absent weights without registry or identity writes', async () => {
  await withRepository(async ({ app, repository, root }) => {
    const first = artifact(root)
    const second = artifact(root, 100, 201)
    const one = await repository.publishVerifiedInstallation({ primary: first })
    await repository.publishVerifiedInstallation({ primary: second })
    const before = await registryState(app)
    const expected = await installed(repository, one.resourceId)
    // Missing weight bytes do not change the metadata authority used to review cancellation.
    unlinkSync(first.file.managedPath)
    unlinkSync(second.file.managedPath)
    const changesBefore = await sql<{ count: number }>`SELECT total_changes() AS count`.execute(
      app.db,
    )
    await sql`PRAGMA query_only = ON`.execute(app.db)
    const review = await repository.inspectLocalResourceRemoval(one.resourceId)
    const changesAfter = await sql<{ count: number }>`SELECT total_changes() AS count`.execute(
      app.db,
    )
    assert.deepEqual(review.model, expected)
    assert.deepEqual(
      review.files,
      expected.versions.map((version) => version.file),
    )
    assert.deepEqual(await registryState(app), before)
    assert.deepEqual(changesAfter.rows, changesBefore.rows)
    assert.equal(existsSync(first.file.managedPath), false)
    assert.equal(existsSync(second.file.managedPath), false)
  })
})

test('preflight deduplicates target versions and excludes a different resource shared path', async () => {
  await withRepository(async ({ repository, root }) => {
    const shared = artifact(root)
    const one = await repository.publishVerifiedInstallation({ primary: shared })
    await repository.publishVerifiedInstallation({
      primary: shareFile(artifact(root, 100, 201), shared, 201),
    })
    const beforeNeighbor = await repository.inspectLocalResourceRemoval(one.resourceId)
    assert.equal(beforeNeighbor.model.versions.length, 2)
    assert.deepEqual(beforeNeighbor.files, [beforeNeighbor.model.versions[1].file])
    // Map dedup retains the final descriptor, just as the existing destructive owner did.
    await repository.publishVerifiedInstallation({
      primary: shareFile(artifact(root, 101, 202), shared, 202),
    })
    const afterNeighbor = await repository.inspectLocalResourceRemoval(one.resourceId)
    assert.deepEqual(afterNeighbor.files, [])
    assert.equal(afterNeighbor.model.versions.length, 2)
    assert.equal(existsSync(shared.file.managedPath), true)
  })
})

test('a new shared owner changes the unlink footprint while the captured target model stays equal', async () => {
  await withRepository(async ({ repository, root }) => {
    const first = artifact(root)
    const second = artifact(root, 100, 201)
    const one = await repository.publishVerifiedInstallation({ primary: first })
    await repository.publishVerifiedInstallation({ primary: second })
    const captured = await repository.inspectLocalResourceRemoval(one.resourceId)
    assert.equal(captured.files.length, 2)
    await repository.publishVerifiedInstallation({
      primary: shareFile(artifact(root, 101, 202), first, 202),
    })
    const current = await repository.inspectLocalResourceRemoval(one.resourceId, captured.model)
    assert.deepEqual(current.model, captured.model)
    assert.deepEqual(
      current.files.map((file) => file.managedPath),
      [second.file.managedPath],
    )
    assert.notDeepEqual(current.files, captured.files)
  })
})

test('preflight preserves normalized snapshot value-CAS and refuses a changed Default or wrong owner', async () => {
  await withRepository(async ({ app, repository, root }) => {
    const one = await repository.publishVerifiedInstallation({ primary: artifact(root) })
    const two = await repository.publishVerifiedInstallation({ primary: artifact(root, 100, 201) })
    const captured = await installed(repository, one.resourceId)
    const reordered = structuredClone(captured)
    reordered.versions.reverse()
    assert.deepEqual(
      (await repository.inspectLocalResourceRemoval(one.resourceId, reordered)).model,
      captured,
    )
    await assert.rejects(repository.inspectLocalResourceRemoval(randomUUID()), /changed/)
    await assert.rejects(
      repository.inspectLocalResourceRemoval(one.resourceId, { ...captured, id: randomUUID() }),
      /changed/,
    )
    await repository.setDefaultVersion(one.resourceId, two.versionId)
    const before = await registryState(app)
    await assert.rejects(
      repository.inspectLocalResourceRemoval(one.resourceId, captured),
      /changed/,
    )
    let unlinked = false
    await assert.rejects(
      repository.removeLocalResource(one.resourceId, captured, async () => {
        unlinked = true
      }),
      /changed/,
    )
    assert.equal(unlinked, false)
    assert.deepEqual(await registryState(app), before)
  })
})

test('preflight and execution share the incoming Anima companion refusal before any mutation', async () => {
  await withRepository(async ({ app, repository, root }) => {
    const qwen = companion(root, 'qwen3_encoder')
    const vae = companion(root, 'vae')
    const q = await repository.publishVerifiedInstallation({ primary: qwen })
    const v = await repository.publishVerifiedInstallation({ primary: vae })
    const checkpoint = artifact(root)
    checkpoint.version.baseModelFamily = 'anima'
    const owner = await repository.publishVerifiedInstallation({
      dependencies: [
        { existingVersionId: q.versionId, role: 'qwen3_encoder' },
        { existingVersionId: v.versionId, role: 'vae' },
      ],
      primary: checkpoint,
    })
    const expected = await installed(repository, q.resourceId)
    const before = await registryState(app)
    await assert.rejects(
      repository.inspectLocalResourceRemoval(q.resourceId),
      /Another installed Anima checkpoint/,
    )
    let unlinked = false
    await assert.rejects(
      repository.removeLocalResource(q.resourceId, expected, async () => {
        unlinked = true
      }),
      /Another installed Anima checkpoint/,
    )
    assert.equal(unlinked, false)
    const ownReview = await repository.inspectLocalResourceRemoval(owner.resourceId)
    assert.deepEqual(
      ownReview.files.map((file) => file.managedPath),
      [checkpoint.file.managedPath],
    )
    assert.deepEqual(await registryState(app), before)
    assert.equal(existsSync(qwen.file.managedPath), true)
    assert.equal(existsSync(vae.file.managedPath), true)
  })
})

test('preflight and execution refuse incomplete file records without creating a ledger row', async () => {
  await withRepository(async ({ app, repository, root }) => {
    const one = await repository.publishVerifiedInstallation({ primary: artifact(root) })
    const two = await repository.publishVerifiedInstallation({ primary: artifact(root, 100, 201) })
    await app.db.deleteFrom('local_model_file').where('id', '=', two.fileId).execute()
    const visible = await installed(repository, one.resourceId)
    const before = await registryState(app)
    await assert.rejects(
      repository.inspectLocalResourceRemoval(one.resourceId),
      /incomplete file records/,
    )
    let unlinked = false
    await assert.rejects(
      repository.removeLocalResource(one.resourceId, visible, async () => {
        unlinked = true
      }),
      /incomplete file records/,
    )
    assert.equal(unlinked, false)
    assert.deepEqual(await registryState(app), before)
  })
})

test('returned inspection descriptors are detached from each other and from later registry reads', async () => {
  await withRepository(async ({ repository, root }) => {
    const one = await repository.publishVerifiedInstallation({ primary: artifact(root) })
    const expected = await installed(repository, one.resourceId)
    const review = await repository.inspectLocalResourceRemoval(one.resourceId)
    review.files[0].managedPath = path.join(root, 'caller-controlled-path')
    assert.equal(review.model.versions[0].file.managedPath, expected.versions[0].file.managedPath)
    review.model.versions[0].file.sha256 = '0'.repeat(64)
    review.model.versions[0].sourceMetadata['caller'] = { value: true }
    review.model.sourceMetadata['nested'] = { tags: ['caller'] }
    review.model.defaultVersionId = null
    review.model.versions[0].dependencyVersionIds.vae = randomUUID()
    assert.deepEqual(await installed(repository, one.resourceId), expected)
    assert.deepEqual(await repository.inspectLocalResourceRemoval(one.resourceId), {
      files: [expected.versions[0].file],
      model: expected,
    })
  })
})

test('an omitted destructive snapshot cannot acquire the read-only inspection shortcut', async () => {
  await withRepository(async ({ app, repository, root }) => {
    const one = await repository.publishVerifiedInstallation({ primary: artifact(root) })
    const before = await registryState(app)
    let unlinked = false
    await assert.rejects(
      repository.removeLocalResource(
        one.resourceId,
        undefined as unknown as InstalledModel,
        async () => {
          unlinked = true
        },
      ),
      /changed/,
    )
    assert.equal(unlinked, false)
    assert.deepEqual(await registryState(app), before)
  })
})
