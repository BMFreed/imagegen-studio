import { isModelRemovalReview } from '../../shared/model-removal.js'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { openAppDatabase } from '../db/database.js'
import { GenerationQueueRepository } from '../projects/generation-queue.js'
import { ModelRemovalService } from './model-removal-service.js'
import { ModelRepository, type VerifiedModelArtifact } from './model-repository.js'

const migrations = path.resolve('src/main/db/migrations')
const errorCode = (value: string) => (error: unknown) =>
  error instanceof Error && 'code' in error && error.code === value

function artifact(root: string, versionId = 201, outside = false): VerifiedModelArtifact {
  const bytes = Buffer.from(`Owned content-addressed removal service fixture ${versionId}`)
  const hash = createHash('sha256').update(bytes).digest('hex')
  const managedPath = outside
    ? path.join(root, 'foreign-owned-control.safetensors')
    : path.join(root, 'models', hash.slice(0, 2), `${hash}.safetensors`)
  mkdirSync(path.dirname(managedPath), { recursive: true })
  writeFileSync(managedPath, bytes)
  return {
    file: {
      managedPath,
      originalFilename: path.basename(managedPath),
      sha256: hash,
      sizeBytes: bytes.length,
      verifiedAt: '2026-11-13T00:00:00.000Z',
    },
    resource: {
      displayName: 'Owned removal service resource',
      source: { kind: 'civitai', modelId: 101 },
      sourceMetadata: {},
      type: 'checkpoint',
    },
    version: {
      baseModelFamily: 'illustrious',
      format: 'safetensors',
      name: `Exact ${versionId}`,
      source: { expectedSha256: hash, fileId: versionId + 1000, kind: 'civitai', versionId },
      sourceMetadata: {},
    },
  }
}

async function withService(
  run: (fixture: {
    app: ReturnType<typeof openAppDatabase>
    repository: ModelRepository
    root: string
    service: ModelRemovalService
  }) => Promise<void>,
) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'igs-removal-service-'))
  const app = openAppDatabase(root, migrations)
  const repository = new ModelRepository(app.db)
  const queue = new GenerationQueueRepository(app.db, root)
  await queue.recoverAfterRestart()
  const service = new ModelRemovalService(repository, path.join(root, 'models'), () => queue)
  try {
    await run({ app, repository, root, service })
  } finally {
    await app.close()
    rmSync(root, { force: true, recursive: true })
  }
}

test('actual service removal unlinks every captured managed version and leaves no installed row or weight', async () => {
  await withService(async ({ app, repository, root, service }) => {
    const first = artifact(root)
    const second = artifact(root, 202)
    const installed = await repository.publishVerifiedInstallation({ primary: first })
    await repository.publishVerifiedInstallation({ primary: second })
    const review = await service.reviewRemoval(installed.resourceId)
    assert.equal(isModelRemovalReview(review), true)
    assert.deepEqual(
      { ...review, token: 'opaque' },
      {
        fileCount: 2,
        name: first.resource.displayName,
        pendingJobs: 0,
        resourceId: installed.resourceId,
        runningJobs: 0,
        sharedFileCount: 0,
        token: 'opaque',
        versionCount: 2,
      },
    )
    await service.removeLocalResource(review.token)
    assert.equal(existsSync(first.file.managedPath), false)
    assert.equal(existsSync(second.file.managedPath), false)
    assert.deepEqual(await repository.listInstalled(), [])
    assert.equal(
      (await app.db.selectFrom('model_reference_identity').selectAll().execute()).length,
      2,
    )
  })
})

test('reviewing and canceling at the caller has no filesystem or registry side effect', async () => {
  await withService(async ({ app, repository, root, service }) => {
    const value = artifact(root)
    const bytes = readFileSync(value.file.managedPath)
    const installed = await repository.publishVerifiedInstallation({ primary: value })
    const before = await repository.listInstalled()
    const review = await service.reviewRemoval(installed.resourceId)
    assert.equal(review.resourceId, installed.resourceId)
    // Cancel has no destructive service call; it is intentionally not a storage operation.
    assert.deepEqual(await repository.listInstalled(), before)
    assert.deepEqual(readFileSync(value.file.managedPath), bytes)
    assert.deepEqual(await app.db.selectFrom('model_reference_identity').selectAll().execute(), [])
  })
})

test('a newer successful review replaces the previous token without letting the old token clear it', async () => {
  await withService(async ({ repository, root, service }) => {
    const value = artifact(root)
    const installed = await repository.publishVerifiedInstallation({ primary: value })
    const old = await service.reviewRemoval(installed.resourceId)
    const latest = await service.reviewRemoval(installed.resourceId)
    assert.notEqual(old.token, latest.token)
    await assert.rejects(service.removeLocalResource(old.token), errorCode('MODEL_REMOVAL_STALE'))
    assert.equal(existsSync(value.file.managedPath), true)
    await service.removeLocalResource(latest.token)
    assert.equal(existsSync(value.file.managedPath), false)
  })
})

test('a changed Default after review consumes the stale attempt while preserving all bytes and registry', async () => {
  await withService(async ({ app, repository, root, service }) => {
    const first = artifact(root)
    const second = artifact(root, 202)
    const one = await repository.publishVerifiedInstallation({ primary: first })
    const two = await repository.publishVerifiedInstallation({ primary: second })
    const review = await service.reviewRemoval(one.resourceId)
    await repository.setDefaultVersion(one.resourceId, two.versionId)
    const before = await repository.listInstalled()
    await assert.rejects(
      service.removeLocalResource(review.token),
      errorCode('MODEL_REMOVAL_FAILED'),
    )
    await assert.rejects(
      service.removeLocalResource(review.token),
      errorCode('MODEL_REMOVAL_STALE'),
    )
    assert.deepEqual(await repository.listInstalled(), before)
    assert.equal(existsSync(first.file.managedPath), true)
    assert.equal(existsSync(second.file.managedPath), true)
    assert.deepEqual(await app.db.selectFrom('model_reference_identity').selectAll().execute(), [])
    await service.removeLocalResource((await service.reviewRemoval(one.resourceId)).token)
    assert.deepEqual(await repository.listInstalled(), [])
  })
})

test('unreviewed, malformed and reused removal tokens refuse without touching an unrelated file', async () => {
  await withService(async ({ repository, root, service }) => {
    const control = path.join(root, 'unrelated-control')
    writeFileSync(control, 'never remove this control')
    await assert.rejects(
      service.removeLocalResource(randomUUID()),
      errorCode('MODEL_REMOVAL_STALE'),
    )
    await assert.rejects(service.removeLocalResource(control), errorCode('MODEL_REMOVAL_STALE'))
    await assert.rejects(service.reviewRemoval(control), errorCode('MODEL_INVALID_ID'))
    await assert.rejects(service.reviewRemoval(randomUUID()), errorCode('MODEL_NOT_FOUND'))
    const installed = await repository.publishVerifiedInstallation({ primary: artifact(root) })
    const review = await service.reviewRemoval(installed.resourceId)
    await service.removeLocalResource(review.token)
    await assert.rejects(
      service.removeLocalResource(review.token),
      errorCode('MODEL_REMOVAL_STALE'),
    )
    assert.equal(readFileSync(control, 'utf8'), 'never remove this control')
  })
})

test('a registry path outside the managed root is refused without unregistering or deleting it', async () => {
  await withService(async ({ repository, root, service }) => {
    const value = artifact(root, 201, true)
    const bytes = readFileSync(value.file.managedPath)
    const installed = await repository.publishVerifiedInstallation({ primary: value })
    const before = await repository.listInstalled()
    await assert.rejects(
      service.reviewRemoval(installed.resourceId),
      errorCode('MODEL_INVALID_STORAGE'),
    )
    assert.deepEqual(await repository.listInstalled(), before)
    assert.deepEqual(readFileSync(value.file.managedPath), bytes)
  })
})

for (const ancestor of ['model-root', 'hash-prefix'] as const) {
  test(`a symlink ${ancestor} ancestor is refused without following it into other fixture bytes`, async () => {
    await withService(async ({ repository, root, service }) => {
      const value = artifact(root)
      const bytes = readFileSync(value.file.managedPath)
      const installed = await repository.publishVerifiedInstallation({ primary: value })
      const from =
        ancestor === 'model-root' ? path.join(root, 'models') : path.dirname(value.file.managedPath)
      const to = path.join(root, `owned-outside-${ancestor}`)
      renameSync(from, to)
      symlinkSync(to, from, 'dir')
      const before = await repository.listInstalled()
      await assert.rejects(
        service.reviewRemoval(installed.resourceId),
        errorCode('MODEL_INVALID_STORAGE'),
      )
      assert.equal(lstatSync(from).isSymbolicLink(), true)
      assert.deepEqual(readFileSync(value.file.managedPath), bytes)
      assert.deepEqual(await repository.listInstalled(), before)
    })
  })
}

test('a symlink replacing the reviewed file refuses before unlink and leaves its destination intact', async () => {
  await withService(async ({ app, repository, root, service }) => {
    const value = artifact(root)
    const original = readFileSync(value.file.managedPath)
    const installed = await repository.publishVerifiedInstallation({ primary: value })
    const review = await service.reviewRemoval(installed.resourceId)
    const destination = path.join(root, 'owned-outside-file')
    writeFileSync(destination, original)
    unlinkSync(value.file.managedPath)
    symlinkSync(destination, value.file.managedPath)
    const before = await repository.listInstalled()
    await assert.rejects(
      service.removeLocalResource(review.token),
      errorCode('MODEL_INVALID_STORAGE'),
    )
    assert.equal(lstatSync(value.file.managedPath).isSymbolicLink(), true)
    assert.deepEqual(readFileSync(destination), original)
    assert.deepEqual(await repository.listInstalled(), before)
    assert.deepEqual(await app.db.selectFrom('model_reference_identity').selectAll().execute(), [])
  })
})

test('a nonregular reviewed path is refused without recursive deletion of its child', async () => {
  await withService(async ({ repository, root, service }) => {
    const value = artifact(root)
    const installed = await repository.publishVerifiedInstallation({ primary: value })
    const review = await service.reviewRemoval(installed.resourceId)
    unlinkSync(value.file.managedPath)
    mkdirSync(value.file.managedPath)
    const child = path.join(value.file.managedPath, 'keep')
    writeFileSync(child, 'owned nonregular control')
    const before = await repository.listInstalled()
    await assert.rejects(
      service.removeLocalResource(review.token),
      errorCode('MODEL_INVALID_STORAGE'),
    )
    assert.equal(readFileSync(child, 'utf8'), 'owned nonregular control')
    assert.deepEqual(await repository.listInstalled(), before)
  })
})

test('an absent legitimate managed prefix permits explicit removal of already-missing bytes', async () => {
  await withService(async ({ repository, root, service }) => {
    const value = artifact(root)
    const installed = await repository.publishVerifiedInstallation({ primary: value })
    rmSync(path.dirname(value.file.managedPath), { recursive: true })
    const review = await service.reviewRemoval(installed.resourceId)
    await service.removeLocalResource(review.token)
    assert.deepEqual(await repository.listInstalled(), [])
    assert.equal(existsSync(value.file.managedPath), false)
  })
})

test('full-footprint failure after the repository snapshot but before first unlink preserves other bytes and requires fresh review', async () => {
  await withService(async ({ app, repository, root, service }) => {
    const one = await repository.publishVerifiedInstallation({ primary: artifact(root) })
    await repository.publishVerifiedInstallation({ primary: artifact(root, 202) })
    const review = await service.reviewRemoval(one.resourceId)
    const before = await repository.listInstalled()
    const original = repository.removeLocalResource.bind(repository)
    let changedPath = ''
    let protectedPath = ''
    let changedBytes: Buffer = Buffer.alloc(0)
    // A controlled collaborator seam changes real filesystem state after the genuine repository
    // snapshot/transaction check. The real service preflight and unlink callback remain subjects.
    repository.removeLocalResource = (id, expected, remove) =>
      original(id, expected, async (files) => {
        assert.equal(files.length, 2)
        protectedPath = files[0].managedPath
        changedPath = files[1].managedPath
        changedBytes = readFileSync(changedPath)
        unlinkSync(changedPath)
        mkdirSync(changedPath)
        await remove(files)
      })
    await assert.rejects(
      service.removeLocalResource(review.token),
      errorCode('MODEL_INVALID_STORAGE'),
    )
    assert.equal(
      existsSync(protectedPath),
      true,
      'No first unlink before complete footprint validation',
    )
    assert.deepEqual(await repository.listInstalled(), before)
    assert.deepEqual(await app.db.selectFrom('model_reference_identity').selectAll().execute(), [])
    await assert.rejects(
      service.removeLocalResource(review.token),
      errorCode('MODEL_REMOVAL_STALE'),
    )
    repository.removeLocalResource = original
    rmSync(changedPath, { recursive: true })
    writeFileSync(changedPath, changedBytes)
    await service.removeLocalResource((await service.reviewRemoval(one.resourceId)).token)
    assert.deepEqual(await repository.listInstalled(), [])
  })
})
