import { sql } from 'kysely'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

import {
  createRegionalQueueFixture,
  enqueueRegionalFixture,
  type RegionalQueueFixture,
} from '../projects/test-fixtures/regional-queue.js'
import { ModelRemovalService } from './model-removal-service.js'
import {
  ModelRepository,
  type PublishedInstallation,
  type VerifiedModelArtifact,
} from './model-repository.js'

type CheckpointReference = RegionalQueueFixture['prepared']['context']['model']['reference']
interface PublishedResource {
  artifact: VerifiedModelArtifact
  published: PublishedInstallation
  reference: CheckpointReference
}

const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const code = (expected: string) => (error: unknown) =>
  error instanceof Error && 'code' in error && error.code === expected

async function withUsage(
  use: (
    fixture: RegionalQueueFixture & { repository: ModelRepository; service: ModelRemovalService },
  ) => Promise<void>,
) {
  const fixture = await createRegionalQueueFixture()
  try {
    const repository = new ModelRepository(fixture.db)
    const service = new ModelRemovalService(
      repository,
      path.join(fixture.root, 'models'),
      () => fixture.queue,
    )
    await use({ ...fixture, repository, service })
  } finally {
    await fixture.close()
  }
}

async function publishResource(
  fixture: RegionalQueueFixture & { repository: ModelRepository },
  modelId: number,
  versionId = 200,
  shared?: PublishedResource,
): Promise<PublishedResource> {
  const bytes = shared
    ? readFileSync(shared.artifact.file.managedPath)
    : Buffer.from(`Owned queue/removal integration checkpoint ${modelId}/${versionId}`)
  const sha256 = digest(bytes)
  const managedPath = path.join(fixture.root, 'models', sha256.slice(0, 2), `${sha256}.safetensors`)
  mkdirSync(path.dirname(managedPath), { recursive: true })
  if (!existsSync(managedPath)) {
    writeFileSync(managedPath, bytes)
  }
  const artifact: VerifiedModelArtifact = {
    file: {
      managedPath,
      originalFilename: `owned-${modelId}-${versionId}.safetensors`,
      sha256,
      sizeBytes: bytes.length,
      verifiedAt: '2026-11-13T00:00:00.000Z',
    },
    resource: {
      displayName: `Owned removal checkpoint ${modelId}`,
      source: { kind: 'civitai', modelId },
      sourceMetadata: {},
      type: 'checkpoint',
    },
    version: {
      baseModelFamily: 'illustrious',
      format: 'safetensors',
      name: `Exact ${versionId}`,
      predictionType: 'epsilon',
      source: { expectedSha256: sha256, fileId: versionId + 1000, kind: 'civitai', versionId },
      sourceMetadata: {},
    },
  }
  const published = await fixture.repository.publishVerifiedInstallation({ primary: artifact })
  return {
    artifact,
    published,
    reference: {
      baseModelFamily: 'illustrious',
      civitaiFileId: versionId + 1000,
      civitaiModelId: modelId,
      civitaiVersionId: versionId,
      displayName: artifact.resource.displayName,
      fileSha256: sha256,
      kind: 'checkpoint',
      localModelId: published.resourceId,
      localVersionId: published.versionId,
      predictionType: 'epsilon',
      versionName: artifact.version.name,
    },
  }
}

async function enqueueFor(fixture: RegionalQueueFixture, resource: PublishedResource) {
  // Reuse the existing declared queue fixture and its real private regional admission.
  // Only bind its tiny checkpoint to the actual published catalog identity/path.
  fixture.prepared.context.model = {
    managedPath: resource.artifact.file.managedPath,
    reference: structuredClone(resource.reference),
  }
  fixture.request.job.checkpoint = {
    path: resource.artifact.file.managedPath,
    predictionType: 'epsilon',
    sha256: resource.artifact.file.sha256,
  }
  return await enqueueRegionalFixture(fixture)
}

test('a local-region TI sidecar alone requires consent before actual embedding unlink', async () => {
  await withUsage(async (fixture) => {
    const bytes = Buffer.from('Owned local regional TI descriptor; no inference weights')
    const sha256 = digest(bytes)
    const managedPath = path.join(
      fixture.root,
      'models',
      sha256.slice(0, 2),
      `${sha256}.safetensors`,
    )
    mkdirSync(path.dirname(managedPath), { recursive: true })
    writeFileSync(managedPath, bytes)
    const artifact: VerifiedModelArtifact = {
      file: {
        managedPath,
        originalFilename: 'local-ti.safetensors',
        sha256,
        sizeBytes: bytes.length,
        verifiedAt: '2026-11-13T00:00:00.000Z',
      },
      resource: {
        displayName: 'Owned local regional TI',
        source: { kind: 'civitai', modelId: 920 },
        sourceMetadata: {},
        type: 'embedding',
      },
      version: {
        baseModelFamily: 'illustrious',
        format: 'safetensors',
        name: 'Exact local TI',
        predictionType: null,
        source: { expectedSha256: sha256, fileId: 922, kind: 'civitai', versionId: 921 },
        sourceMetadata: {},
      },
    }
    const published = await fixture.repository.publishVerifiedInstallation({ primary: artifact })
    const reference = {
      baseModelFamily: 'illustrious' as const,
      civitaiFileId: 922,
      civitaiModelId: 920,
      civitaiVersionId: 921,
      displayName: artifact.resource.displayName,
      fileSha256: sha256,
      kind: 'embedding' as const,
      localModelId: published.resourceId,
      localVersionId: published.versionId,
      predictionType: null,
      versionName: artifact.version.name,
    }
    const region = fixture.regional.recipe.regions[0]
    region.positive = {
      embeddingRefs: [{ resource: reference, token: '<local-ti>' }],
      text: 'region <local-ti>',
    }
    region.embeddings = {
      negative: [],
      positive: [{ byteSize: bytes.length, managedPath, reference, token: '<local-ti>' }],
    }
    const queued = await enqueueRegionalFixture(fixture)
    const before = await fixture.db.selectFrom('generation_queue_item').selectAll().execute()
    const review = await fixture.service.reviewRemoval(published.resourceId)
    // This reaches the real removal consumer: dropping sidecar usage would
    // incorrectly cancel nothing and unlink the live embedding without consent.
    await assert.rejects(
      fixture.service.removeLocalResource(review.token),
      code('MODEL_REMOVAL_USAGE_CHANGED'),
    )
    assert.equal(existsSync(managedPath), true)
    assert.deepEqual(
      await fixture.db.selectFrom('generation_queue_item').selectAll().execute(),
      before,
    )
    const fresh = await fixture.service.reviewRemoval(published.resourceId)
    assert.equal(fresh.pendingJobs, 1)
    await fixture.service.removeLocalResource(fresh.token, true)
    assert.equal(existsSync(managedPath), false)
    const after = await fixture.db
      .selectFrom('generation_queue_item')
      .selectAll()
      .where('id', '=', queued.id)
      .executeTakeFirstOrThrow()
    assert.equal(after.status, 'canceled')
    assert.equal(after.error_code, 'USER_CANCELED')
  })
})

async function queueRows(fixture: RegionalQueueFixture) {
  return await fixture.db.selectFrom('generation_queue_item').selectAll().orderBy('id').execute()
}

async function row(fixture: RegionalQueueFixture, id: string) {
  return await fixture.db
    .selectFrom('generation_queue_item')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirstOrThrow()
}

function queueFiles(fixture: RegionalQueueFixture, ids: readonly string[]) {
  const result: Record<string, string> = {}
  const visit = (directory: string, prefix: string) => {
    for (const name of readdirSync(directory).sort()) {
      const file = path.join(directory, name)
      const relative = `${prefix}/${name}`
      const info = lstatSync(file)
      if (info.isSymbolicLink()) {
        result[relative] = `symlink:${readlinkSync(file)}`
      } else if (info.isDirectory()) {
        visit(file, relative)
      } else {
        assert.equal(info.isFile(), true)
        result[relative] = `${info.size}:${digest(readFileSync(file))}`
      }
    }
  }
  for (const id of [...ids].sort()) {
    visit(path.join(fixture.root, 'generation-inputs', id), id)
  }
  return result
}

async function claimOnlyPending(fixture: RegionalQueueFixture, id: string) {
  // A genuine queue claim is the running-state control. No worker/model loading is invoked.
  const claimed = await fixture.queue.claimNextPendingRegional()
  assert.ok(claimed)
  assert.equal(claimed.item.id, id)
  assert.equal(claimed.item.status, 'running')
}

test('review counts only affected pending jobs and no cancellation is possible without explicit consent', async () => {
  await withUsage(async (f) => {
    const affected = await publishResource(f, 101)
    const unrelated = await publishResource(f, 102)
    const running = await enqueueFor(f, unrelated)
    await claimOnlyPending(f, running.id)
    await enqueueFor(f, affected)
    await enqueueFor(f, affected)
    await enqueueFor(f, unrelated)
    const before = await queueRows(f)
    const files = queueFiles(
      f,
      before.map((entry) => entry.id),
    )
    const review = await f.service.reviewRemoval(affected.published.resourceId)
    assert.equal(review.pendingJobs, 2)
    assert.equal(review.runningJobs, 0)
    assert.equal(review.sharedFileCount, 0)
    assert.deepEqual(Object.keys(review).sort(), [
      'fileCount',
      'name',
      'pendingJobs',
      'resourceId',
      'runningJobs',
      'sharedFileCount',
      'token',
      'versionCount',
    ])
    await assert.rejects(
      f.service.removeLocalResource(review.token),
      code('MODEL_REMOVAL_USAGE_CHANGED'),
    )
    assert.deepEqual(await queueRows(f), before)
    assert.deepEqual(
      queueFiles(
        f,
        before.map((entry) => entry.id),
      ),
      files,
    )
    assert.equal(existsSync(affected.artifact.file.managedPath), true)
    await assert.rejects(
      f.service.removeLocalResource(review.token, true),
      code('MODEL_REMOVAL_STALE'),
    )
  })
})

test('confirmed removal cancels only affected pending rows and preserves an unrelated running job and all frozen inputs', async () => {
  await withUsage(async (f) => {
    const affected = await publishResource(f, 101)
    const unrelated = await publishResource(f, 102)
    const running = await enqueueFor(f, unrelated)
    await claimOnlyPending(f, running.id)
    const pending = [await enqueueFor(f, affected), await enqueueFor(f, affected)]
    const neighbor = await enqueueFor(f, unrelated)
    const before = await queueRows(f)
    const inputs = queueFiles(
      f,
      before.map((entry) => entry.id),
    )
    const review = await f.service.reviewRemoval(affected.published.resourceId)
    await f.service.removeLocalResource(review.token, true)
    for (const item of pending) {
      const after = await row(f, item.id)
      const original = before.find((entry) => entry.id === item.id)
      assert.ok(original)
      assert.equal(after.status, 'canceled')
      assert.equal(after.error_code, 'USER_CANCELED')
      assert.equal(after.status_sequence, original.status_sequence + 1)
      assert.equal(after.frozen_payload_json, original.frozen_payload_json)
      assert.ok(after.finished_at)
    }
    assert.deepEqual(
      await row(f, running.id),
      before.find((entry) => entry.id === running.id),
    )
    assert.deepEqual(
      await row(f, neighbor.id),
      before.find((entry) => entry.id === neighbor.id),
    )
    assert.deepEqual(
      queueFiles(
        f,
        before.map((entry) => entry.id),
      ),
      inputs,
    )
    assert.equal(existsSync(affected.artifact.file.managedPath), false)
    assert.equal(existsSync(unrelated.artifact.file.managedPath), true)
    assert.deepEqual(
      (await f.repository.listInstalled()).map((entry) => entry.id),
      [unrelated.published.resourceId],
    )
  })
})

test('a running alias with retained shared bytes is unrelated while the retired binding pending job is canceled', async () => {
  await withUsage(async (f) => {
    const affected = await publishResource(f, 101)
    const alias = await publishResource(f, 102, 201, affected)
    const running = await enqueueFor(f, alias)
    await claimOnlyPending(f, running.id)
    const pending = await enqueueFor(f, affected)
    const beforeRunning = await row(f, running.id)
    const review = await f.service.reviewRemoval(affected.published.resourceId)
    assert.equal(review.sharedFileCount, 1)
    assert.equal(review.pendingJobs, 1)
    assert.equal(review.runningJobs, 0)
    await f.service.removeLocalResource(review.token, true)
    assert.equal((await row(f, pending.id)).status, 'canceled')
    assert.deepEqual(await row(f, running.id), beforeRunning)
    assert.equal(digest(readFileSync(alias.artifact.file.managedPath)), alias.artifact.file.sha256)
    assert.deepEqual(
      (await f.repository.listInstalled()).map((entry) => entry.id),
      [alias.published.resourceId],
    )
  })
})

test('matching running work blocks removal without requesting a running cancellation', async () => {
  await withUsage(async (f) => {
    const affected = await publishResource(f, 101)
    const unrelated = await publishResource(f, 102)
    const running = await enqueueFor(f, affected)
    await claimOnlyPending(f, running.id)
    await enqueueFor(f, unrelated)
    const before = await queueRows(f)
    const review = await f.service.reviewRemoval(affected.published.resourceId)
    assert.equal(review.runningJobs, 1)
    assert.equal(review.pendingJobs, 0)
    await assert.rejects(
      f.service.removeLocalResource(review.token, true),
      code('MODEL_REMOVAL_USAGE_CHANGED'),
    )
    assert.deepEqual(await queueRows(f), before)
    assert.equal((await row(f, running.id)).error_code, null)
    assert.equal(existsSync(affected.artifact.file.managedPath), true)
  })
})

test('a genuine pending-to-running claim after review invalidates removal before cancel or unlink', async () => {
  await withUsage(async (f) => {
    const affected = await publishResource(f, 101)
    const pending = await enqueueFor(f, affected)
    const review = await f.service.reviewRemoval(affected.published.resourceId)
    assert.equal(review.pendingJobs, 1)
    await claimOnlyPending(f, pending.id)
    const claimed = await queueRows(f)
    await assert.rejects(
      f.service.removeLocalResource(review.token, true),
      code('MODEL_REMOVAL_USAGE_CHANGED'),
    )
    assert.deepEqual(await queueRows(f), claimed)
    assert.equal(existsSync(affected.artifact.file.managedPath), true)
    assert.equal((await f.repository.listInstalled()).length, 1)
  })
})

test('new affected pending work cannot silently expand consent and requires a fresh explicit review', async () => {
  await withUsage(async (f) => {
    const affected = await publishResource(f, 101)
    const first = await enqueueFor(f, affected)
    const review = await f.service.reviewRemoval(affected.published.resourceId)
    const second = await enqueueFor(f, affected)
    const before = await queueRows(f)
    await assert.rejects(
      f.service.removeLocalResource(review.token, true),
      code('MODEL_REMOVAL_USAGE_CHANGED'),
    )
    assert.deepEqual(await queueRows(f), before)
    assert.equal(existsSync(affected.artifact.file.managedPath), true)
    const renewed = await f.service.reviewRemoval(affected.published.resourceId)
    assert.equal(renewed.pendingJobs, 2)
    await f.service.removeLocalResource(renewed.token, true)
    assert.equal((await row(f, first.id)).status, 'canceled')
    assert.equal((await row(f, second.id)).status, 'canceled')
    assert.equal(existsSync(affected.artifact.file.managedPath), false)
  })
})

test('changed target Default is refused before canceling the previously reviewed pending set', async () => {
  await withUsage(async (f) => {
    const first = await publishResource(f, 101)
    const second = await publishResource(f, 101, 201)
    await enqueueFor(f, first)
    const review = await f.service.reviewRemoval(first.published.resourceId)
    await f.repository.setDefaultVersion(first.published.resourceId, second.published.versionId)
    const before = await queueRows(f)
    const models = await f.repository.listInstalled()
    await assert.rejects(f.service.removeLocalResource(review.token, true), (error: unknown) => {
      assert.equal(code('MODEL_REMOVAL_FAILED')(error), true)
      assert.ok(error instanceof Error)
      assert.doesNotMatch(error.message, /reviewed pending jobs were canceled/)
      return true
    })
    assert.deepEqual(await queueRows(f), before)
    assert.deepEqual(await f.repository.listInstalled(), models)
    assert.equal(existsSync(first.artifact.file.managedPath), true)
    assert.equal(existsSync(second.artifact.file.managedPath), true)
  })
})

test('a newly shared unlink footprint is refused before cancel despite an unchanged target model', async () => {
  await withUsage(async (f) => {
    const affected = await publishResource(f, 101)
    await enqueueFor(f, affected)
    const review = await f.service.reviewRemoval(affected.published.resourceId)
    const targetBefore = (await f.repository.listInstalled()).find(
      (entry) => entry.id === affected.published.resourceId,
    )
    await publishResource(f, 102, 201, affected)
    assert.deepEqual(
      (await f.repository.listInstalled()).find(
        (entry) => entry.id === affected.published.resourceId,
      ),
      targetBefore,
    )
    const before = await queueRows(f)
    await assert.rejects(
      f.service.removeLocalResource(review.token, true),
      code('MODEL_REMOVAL_STALE'),
    )
    assert.deepEqual(await queueRows(f), before)
    assert.equal(existsSync(affected.artifact.file.managedPath), true)
    assert.equal((await f.repository.listInstalled()).length, 2)
  })
})

test('unknown active JSON blocks both new review and a previous token instead of implying unrelated usage', async () => {
  await withUsage(async (f) => {
    const affected = await publishResource(f, 101)
    const unrelated = await publishResource(f, 102)
    await enqueueFor(f, affected)
    const other = await enqueueFor(f, unrelated)
    const review = await f.service.reviewRemoval(affected.published.resourceId)
    const original = await row(f, other.id)
    await f.db
      .updateTable('generation_queue_item')
      .set({ frozen_payload_json: '{}' })
      .where('id', '=', other.id)
      .execute()
    const broken = await queueRows(f)
    await assert.rejects(
      f.service.reviewRemoval(affected.published.resourceId),
      code('MODEL_REMOVAL_USAGE_UNAVAILABLE'),
    )
    await assert.rejects(
      f.service.removeLocalResource(review.token, true),
      code('MODEL_REMOVAL_USAGE_CHANGED'),
    )
    assert.deepEqual(await queueRows(f), broken)
    assert.equal(existsSync(affected.artifact.file.managedPath), true)
    await f.db
      .updateTable('generation_queue_item')
      .set({ frozen_payload_json: original.frozen_payload_json })
      .where('id', '=', other.id)
      .execute()
    assert.equal((await f.service.reviewRemoval(affected.published.resourceId)).pendingJobs, 1)
  })
})

test('corrupt regional sidecar cannot establish that an otherwise unrelated checkpoint is unused', async () => {
  await withUsage(async (f) => {
    const selected = await publishResource(f, 101)
    const unrelated = await publishResource(f, 102)
    const other = await enqueueFor(f, unrelated)
    const metadataPath = path.join(f.root, 'generation-inputs', other.id, 'regional.json')
    const metadata = readFileSync(metadataPath)
    const corrupted = Buffer.from(metadata)
    corrupted[0] ^= 1
    writeFileSync(metadataPath, corrupted)
    const before = await queueRows(f)
    try {
      await assert.rejects(
        f.service.reviewRemoval(selected.published.resourceId),
        code('MODEL_REMOVAL_USAGE_UNAVAILABLE'),
      )
      assert.deepEqual(await queueRows(f), before)
      assert.equal(existsSync(selected.artifact.file.managedPath), true)
    } finally {
      writeFileSync(metadataPath, metadata)
    }
    const review = await f.service.reviewRemoval(selected.published.resourceId)
    assert.equal(review.pendingJobs, 0)
    assert.equal(review.runningJobs, 0)
  })
})

test('registry failure after approved pending cancellation and actual unlink keeps canceled jobs and retry inputs', async () => {
  await withUsage(async (f) => {
    const affected = await publishResource(f, 101)
    const unrelated = await publishResource(f, 102)
    const pending = await enqueueFor(f, affected)
    const other = await enqueueFor(f, unrelated)
    const inputs = queueFiles(f, [pending.id, other.id])
    const otherBefore = await row(f, other.id)
    const models = await f.repository.listInstalled()
    await sql`CREATE TRIGGER owned_remove_failure BEFORE DELETE ON model_resource BEGIN SELECT RAISE(ABORT, 'owned removal registry failure'); END`.execute(
      f.db,
    )
    const review = await f.service.reviewRemoval(affected.published.resourceId)
    await assert.rejects(f.service.removeLocalResource(review.token, true), (error: unknown) => {
      assert.equal(code('MODEL_REMOVAL_FAILED')(error), true)
      assert.ok(error instanceof Error)
      assert.match(error.message, /1 reviewed pending jobs were canceled/)
      return true
    })
    assert.equal((await row(f, pending.id)).status, 'canceled')
    assert.deepEqual(await row(f, other.id), otherBefore)
    assert.deepEqual(queueFiles(f, [pending.id, other.id]), inputs)
    assert.equal(existsSync(affected.artifact.file.managedPath), false)
    assert.equal(existsSync(unrelated.artifact.file.managedPath), true)
    assert.deepEqual(await f.repository.listInstalled(), models)
    assert.deepEqual(await f.db.selectFrom('model_reference_identity').selectAll().execute(), [])
    await sql`DROP TRIGGER owned_remove_failure`.execute(f.db)
    const retry = await f.service.reviewRemoval(affected.published.resourceId)
    assert.equal(retry.pendingJobs, 0)
    await f.service.removeLocalResource(retry.token)
    assert.equal((await row(f, pending.id)).status, 'canceled')
    assert.deepEqual(queueFiles(f, [pending.id, other.id]), inputs)
  })
})

test('actual callback storage refusal after committed consent reports canceled jobs without fabricating rollback', async () => {
  await withUsage(async (f) => {
    const affected = await publishResource(f, 101)
    const pending = await enqueueFor(f, affected)
    const review = await f.service.reviewRemoval(affected.published.resourceId)
    const inputs = queueFiles(f, [pending.id])
    const models = await f.repository.listInstalled()
    const remove = f.repository.removeLocalResource.bind(f.repository)
    const backup = path.join(f.root, 'owned-removal-weight-backup')
    let substituted = false
    // Wrap the real repository callback after its snapshot check and after queue consent commit.
    // The actual service's path preflight sees a nonregular file; no replacement storage is used.
    f.repository.removeLocalResource = async (resourceId, expected, unlink) =>
      remove(resourceId, expected, async (files) => {
        renameSync(affected.artifact.file.managedPath, backup)
        mkdirSync(affected.artifact.file.managedPath)
        substituted = true
        await unlink(files)
      })
    try {
      await assert.rejects(f.service.removeLocalResource(review.token, true), (error: unknown) => {
        assert.equal(code('MODEL_INVALID_STORAGE')(error), true)
        assert.ok(error instanceof Error)
        assert.match(error.message, /1 reviewed pending jobs were canceled/)
        return true
      })
    } finally {
      f.repository.removeLocalResource = remove
      if (substituted) {
        rmSync(affected.artifact.file.managedPath, { recursive: true })
        renameSync(backup, affected.artifact.file.managedPath)
      }
    }
    assert.equal((await row(f, pending.id)).status, 'canceled')
    assert.deepEqual(await f.repository.listInstalled(), models)
    assert.deepEqual(queueFiles(f, [pending.id]), inputs)
    assert.equal(
      digest(readFileSync(affected.artifact.file.managedPath)),
      affected.artifact.file.sha256,
    )
    assert.deepEqual(await f.db.selectFrom('model_reference_identity').selectAll().execute(), [])
  })
})
