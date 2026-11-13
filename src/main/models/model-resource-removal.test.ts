import { sql } from 'kysely'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { openAppDatabase } from '../db/database.js'
import {
  type InstalledModel,
  type InstalledModelFile,
  ModelRepository,
  type VerifiedModelArtifact,
} from './model-repository.js'

const migrations = path.resolve('src/main/db/migrations')

function artifact(root: string, modelId = 100, versionId = 200): VerifiedModelArtifact {
  const bytes = Buffer.from(`Owned repository removal fixture ${modelId}/${versionId}`)
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
      displayName: 'Owned resource',
      source: { kind: 'civitai', modelId },
      sourceMetadata: { modelId },
      type: 'checkpoint',
    },
    version: {
      baseModelFamily: 'illustrious',
      format: 'safetensors',
      name: `Version ${versionId}`,
      source: { expectedSha256: sha256, fileId: versionId + 100, kind: 'civitai', versionId },
      sourceMetadata: { versionId },
    },
  }
}

function companion(
  root: string,
  role: 'qwen3_encoder' | 'vae',
  revision = 'revision-1',
): VerifiedModelArtifact {
  const value = artifact(root, role === 'vae' ? 1001 : 1002)
  value.resource = {
    displayName: `Owned ${role}`,
    source: { key: `anima/${role}`, kind: 'supported_dependency' },
    sourceMetadata: {},
    type: role,
  }
  value.version = {
    baseModelFamily: 'anima',
    format: 'safetensors',
    name: revision,
    source: { expectedSha256: value.file.sha256, kind: 'supported_dependency', revision },
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
  const root = mkdtempSync(path.join(os.tmpdir(), 'igs-resource-remove-repo-'))
  const app = openAppDatabase(root, migrations)
  try {
    await run({ app, repository: new ModelRepository(app.db), root })
  } finally {
    await app.close()
    rmSync(root, { force: true, recursive: true })
  }
}

async function removeFiles(files: InstalledModelFile[]) {
  for (const file of files) {
    try {
      unlinkSync(file.managedPath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }
  }
}

async function installed(repository: ModelRepository, id: string): Promise<InstalledModel> {
  const resource = (await repository.listInstalled()).find((candidate) => candidate.id === id)
  assert.ok(resource)
  return resource
}

test('hard removal deletes every target version/file and keeps only minimal noninstalled reference identity', async () => {
  await withRepository(async ({ app, repository, root }) => {
    const first = artifact(root)
    const second = artifact(root, 100, 201)
    const one = await repository.publishVerifiedInstallation({ primary: first })
    const two = await repository.publishVerifiedInstallation({ primary: second })
    await repository.setDefaultVersion(one.resourceId, two.versionId)
    const snapshot = await installed(repository, one.resourceId)
    const received: InstalledModelFile[][] = []
    await repository.removeLocalResource(one.resourceId, snapshot, async (files) => {
      received.push(files)
      await removeFiles(files)
    })
    assert.equal(received.length, 1)
    assert.deepEqual(
      received[0]?.map((file) => file.id).sort(),
      snapshot.versions.map((version) => version.file.id).sort(),
    )
    assert.equal(existsSync(first.file.managedPath), false)
    assert.equal(existsSync(second.file.managedPath), false)
    assert.deepEqual(await repository.listInstalled(), [])
    for (const table of [
      'model_resource',
      'model_resource_version',
      'local_model_file',
      'model_version_dependency',
    ] as const) {
      assert.deepEqual(await app.db.selectFrom(table).selectAll().execute(), [])
    }
    const identities = await app.db.selectFrom('model_reference_identity').selectAll().execute()
    assert.deepEqual(
      identities.map((row) => row.version_id).sort(),
      [one.versionId, two.versionId].sort(),
    )
    assert.ok(identities.every((row) => row.resource_id === one.resourceId))
    const columns = await sql<{
      name: string
    }>`PRAGMA table_info(model_reference_identity)`.execute(app.db)
    assert.deepEqual(
      columns.rows.map((row) => row.name).sort(),
      [
        'base_model_family',
        'civitai_file_id',
        'civitai_model_id',
        'civitai_model_version_id',
        'resource_id',
        'sha256',
        'size_bytes',
        'source_key',
        'source_kind',
        'source_revision',
        'type',
        'version_id',
      ].sort(),
    )
    assert.equal(await repository.findExactFileDuplicate({ sha256: first.file.sha256 }), null)
  })
})

test('an exact shared managed path remains on disk for a different resource and is not passed to unlink', async () => {
  await withRepository(async ({ repository, root }) => {
    const first = artifact(root)
    const second = artifact(root, 101)
    second.file = { ...first.file }
    second.version.source = {
      expectedSha256: first.file.sha256,
      fileId: 401,
      kind: 'civitai',
      versionId: 301,
    }
    const one = await repository.publishVerifiedInstallation({ primary: first })
    const two = await repository.publishVerifiedInstallation({ primary: second })
    const neighbor = await installed(repository, two.resourceId)
    await repository.removeLocalResource(
      one.resourceId,
      await installed(repository, one.resourceId),
      async (files) => {
        assert.deepEqual(files, [])
      },
    )
    assert.equal(existsSync(first.file.managedPath), true)
    assert.deepEqual(await repository.listInstalled(), [neighbor])
    await repository.removeLocalResource(two.resourceId, neighbor, removeFiles)
    assert.equal(existsSync(first.file.managedPath), false)
  })
})

test('same-path versions within one target are unlinked exactly once', async () => {
  await withRepository(async ({ repository, root }) => {
    const first = artifact(root)
    const second = artifact(root, 100, 201)
    second.file = { ...first.file }
    second.version.source = {
      expectedSha256: first.file.sha256,
      fileId: 301,
      kind: 'civitai',
      versionId: 201,
    }
    const one = await repository.publishVerifiedInstallation({ primary: first })
    await repository.publishVerifiedInstallation({ primary: second })
    await repository.removeLocalResource(
      one.resourceId,
      await installed(repository, one.resourceId),
      async (files) => {
        assert.equal(files.length, 1)
        await removeFiles(files)
      },
    )
    assert.deepEqual(await repository.listInstalled(), [])
  })
})

test('incoming Anima component ownership refuses before unlink; checkpoint deletion never collects companions', async () => {
  await withRepository(async ({ app, repository, root }) => {
    const encoder = companion(root, 'qwen3_encoder')
    const vae = companion(root, 'vae')
    const q = await repository.publishVerifiedInstallation({ primary: encoder })
    const v = await repository.publishVerifiedInstallation({ primary: vae })
    const dependencies = [
      { existingVersionId: q.versionId, role: 'qwen3_encoder' as const },
      { existingVersionId: v.versionId, role: 'vae' as const },
    ]
    const first = artifact(root)
    first.version.baseModelFamily = 'anima'
    const second = artifact(root, 101)
    second.version.baseModelFamily = 'anima'
    const one = await repository.publishVerifiedInstallation({ dependencies, primary: first })
    const two = await repository.publishVerifiedInstallation({ dependencies, primary: second })
    let called = false
    await assert.rejects(
      repository.removeLocalResource(
        q.resourceId,
        await installed(repository, q.resourceId),
        async () => {
          called = true
        },
      ),
      /Another installed Anima checkpoint/,
    )
    assert.equal(called, false)
    assert.deepEqual(await app.db.selectFrom('model_reference_identity').selectAll().execute(), [])
    await repository.removeLocalResource(
      one.resourceId,
      await installed(repository, one.resourceId),
      removeFiles,
    )
    assert.equal(existsSync(encoder.file.managedPath), true)
    assert.equal(existsSync(vae.file.managedPath), true)
    await assert.rejects(
      repository.removeLocalResource(
        q.resourceId,
        await installed(repository, q.resourceId),
        removeFiles,
      ),
      /Another installed Anima checkpoint/,
    )
    await repository.removeLocalResource(
      two.resourceId,
      await installed(repository, two.resourceId),
      removeFiles,
    )
    assert.equal((await repository.listInstalled()).length, 2)
    await repository.removeLocalResource(
      q.resourceId,
      await installed(repository, q.resourceId),
      removeFiles,
    )
    assert.equal(existsSync(vae.file.managedPath), true)
    assert.deepEqual(await app.db.selectFrom('model_version_dependency').selectAll().execute(), [])
  })
})

test('stale complete snapshot, changed Default or wrong target refuses before filesystem callback', async () => {
  await withRepository(async ({ repository, root }) => {
    const one = await repository.publishVerifiedInstallation({ primary: artifact(root) })
    const old = await installed(repository, one.resourceId)
    const two = await repository.publishVerifiedInstallation({ primary: artifact(root, 100, 201) })
    let calls = 0
    const unlink = async () => {
      calls += 1
    }
    await assert.rejects(repository.removeLocalResource(one.resourceId, old, unlink), /changed/)
    const beforeDefault = await installed(repository, one.resourceId)
    await repository.setDefaultVersion(one.resourceId, two.versionId)
    await assert.rejects(
      repository.removeLocalResource(one.resourceId, beforeDefault, unlink),
      /changed/,
    )
    await assert.rejects(
      repository.removeLocalResource('other-id', beforeDefault, unlink),
      /changed/,
    )
    assert.equal(calls, 0)
  })
})

test('filesystem callback failure rolls back registry and identity ledger', async () => {
  await withRepository(async ({ app, repository, root }) => {
    const value = artifact(root)
    const one = await repository.publishVerifiedInstallation({ primary: value })
    const before = await repository.listInstalled()
    await assert.rejects(
      repository.removeLocalResource(one.resourceId, before[0], async () => {
        throw new Error('declared unlink failure')
      }),
      /declared unlink failure/,
    )
    assert.deepEqual(await repository.listInstalled(), before)
    assert.deepEqual(await app.db.selectFrom('model_reference_identity').selectAll().execute(), [])
    assert.equal(existsSync(value.file.managedPath), true)
  })
})

test('registry failure after actual unlink leaves unchanged rows and missing bytes for exact explicit retry', async () => {
  await withRepository(async ({ app, repository, root }) => {
    const value = artifact(root)
    const one = await repository.publishVerifiedInstallation({ primary: value })
    const before = await repository.listInstalled()
    await sql
      .raw(
        "CREATE TRIGGER declared_remove_failure BEFORE DELETE ON model_resource BEGIN SELECT RAISE(ABORT, 'declared registry failure'); END",
      )
      .execute(app.db)
    await assert.rejects(
      repository.removeLocalResource(one.resourceId, before[0], removeFiles),
      /declared registry failure/,
    )
    assert.equal(existsSync(value.file.managedPath), false)
    assert.deepEqual(await repository.listInstalled(), before)
    assert.deepEqual(await app.db.selectFrom('model_reference_identity').selectAll().execute(), [])
    await sql.raw('DROP TRIGGER declared_remove_failure').execute(app.db)
    await repository.removeLocalResource(one.resourceId, before[0], removeFiles)
    assert.deepEqual(await repository.listInstalled(), [])
    assert.equal(
      (await app.db.selectFrom('model_reference_identity').selectAll().execute()).length,
      1,
    )
  })
})

test('verified exact reinstall reclaims resource/version IDs, with fresh file identity and current display metadata', async () => {
  await withRepository(async ({ repository, root }) => {
    const value = artifact(root)
    const one = await repository.publishVerifiedInstallation({ primary: value })
    await repository.removeLocalResource(
      one.resourceId,
      await installed(repository, one.resourceId),
      removeFiles,
    )
    const restored = artifact(root)
    restored.resource.displayName = 'Explicit verified reinstall'
    const two = await repository.publishVerifiedInstallation({ primary: restored })
    assert.equal(two.resourceId, one.resourceId)
    assert.equal(two.versionId, one.versionId)
    assert.notEqual(two.fileId, one.fileId)
    assert.equal(
      (await installed(repository, two.resourceId)).displayName,
      'Explicit verified reinstall',
    )
  })
})

const identityChanges = ['sha256', 'size', 'model', 'version', 'file', 'kind', 'family'] as const
for (const axis of identityChanges) {
  test(`reinstall cannot reclaim removed IDs after a changed ${axis} identity axis`, async () => {
    await withRepository(async ({ repository, root }) => {
      const original = artifact(root)
      original.resource.type = 'lora'
      const one = await repository.publishVerifiedInstallation({ primary: original })
      await repository.removeLocalResource(
        one.resourceId,
        await installed(repository, one.resourceId),
        removeFiles,
      )
      const changed = artifact(root)
      changed.resource.type = 'lora'
      assert.equal(changed.version.source.kind, 'civitai')
      if (changed.version.source.kind !== 'civitai') {
        throw new Error('Expected CivitAI fixture')
      }
      switch (axis) {
        case 'file': {
          changed.version.source.fileId = 999
          break
        }
        case 'kind': {
          changed.resource.type = 'vae'
          break
        }
        case 'model': {
          changed.resource.source = { kind: 'civitai', modelId: 999 }
          break
        }
        case 'sha256': {
          const bytes = Buffer.alloc(changed.file.sizeBytes, 3)
          writeFileSync(changed.file.managedPath, bytes)
          changed.file.sha256 = createHash('sha256').update(bytes).digest('hex')
          changed.version.source.expectedSha256 = changed.file.sha256

          break
        }
        case 'size': {
          const bytes = Buffer.from('Explicit changed fixture size')
          writeFileSync(changed.file.managedPath, bytes)
          changed.file.sizeBytes = bytes.length
          changed.file.sha256 = createHash('sha256').update(bytes).digest('hex')
          changed.version.source.expectedSha256 = changed.file.sha256

          break
        }
        case 'version': {
          changed.version.source.versionId = 999
          break
        }
        default: {
          changed.version.baseModelFamily = 'anima'
        }
      }
      const two = await repository.publishVerifiedInstallation({ primary: changed })
      assert.notEqual(two.resourceId, one.resourceId)
      assert.notEqual(two.versionId, one.versionId)
    })
  })
}

test('a new live source binding stays authoritative when an older exact version is reinstalled', async () => {
  await withRepository(async ({ repository, root }) => {
    const one = await repository.publishVerifiedInstallation({ primary: artifact(root) })
    await repository.removeLocalResource(
      one.resourceId,
      await installed(repository, one.resourceId),
      removeFiles,
    )
    const newer = await repository.publishVerifiedInstallation({
      primary: artifact(root, 100, 201),
    })
    assert.notEqual(newer.resourceId, one.resourceId)
    const restored = await repository.publishVerifiedInstallation({ primary: artifact(root) })
    assert.equal(restored.resourceId, newer.resourceId)
    assert.notEqual(restored.versionId, one.versionId)
  })
})

test('supported companion full source revision/hash binding alone can reclaim its IDs', async () => {
  await withRepository(async ({ repository, root }) => {
    const value = companion(root, 'qwen3_encoder')
    const one = await repository.publishVerifiedInstallation({ primary: value })
    await repository.removeLocalResource(
      one.resourceId,
      await installed(repository, one.resourceId),
      removeFiles,
    )
    const two = await repository.publishVerifiedInstallation({
      primary: companion(root, 'qwen3_encoder'),
    })
    assert.equal(two.resourceId, one.resourceId)
    assert.equal(two.versionId, one.versionId)
    await repository.removeLocalResource(
      two.resourceId,
      await installed(repository, two.resourceId),
      removeFiles,
    )
    const changed = await repository.publishVerifiedInstallation({
      primary: companion(root, 'qwen3_encoder', 'revision-2'),
    })
    assert.notEqual(changed.resourceId, one.resourceId)
    assert.notEqual(changed.versionId, one.versionId)
  })
})

test('same companion bytes under another supported source key do not reclaim old IDs', async () => {
  await withRepository(async ({ repository, root }) => {
    const one = await repository.publishVerifiedInstallation({
      primary: companion(root, 'qwen3_encoder'),
    })
    await repository.removeLocalResource(
      one.resourceId,
      await installed(repository, one.resourceId),
      removeFiles,
    )
    const changed = companion(root, 'qwen3_encoder')
    changed.resource.source = { key: 'anima/another-qwen3_encoder', kind: 'supported_dependency' }
    const two = await repository.publishVerifiedInstallation({ primary: changed })
    assert.notEqual(two.resourceId, one.resourceId)
    assert.notEqual(two.versionId, one.versionId)
  })
})

test('incomplete file records refuse whole-resource deletion before any filesystem action', async () => {
  await withRepository(async ({ app, repository, root }) => {
    const one = await repository.publishVerifiedInstallation({ primary: artifact(root) })
    const two = await repository.publishVerifiedInstallation({ primary: artifact(root, 100, 201) })
    await app.db.deleteFrom('local_model_file').where('id', '=', two.fileId).execute()
    let called = false
    await assert.rejects(
      repository.removeLocalResource(
        one.resourceId,
        await installed(repository, one.resourceId),
        async () => {
          called = true
        },
      ),
      /incomplete file records/,
    )
    assert.equal(called, false)
    assert.deepEqual(await app.db.selectFrom('model_reference_identity').selectAll().execute(), [])
  })
})

test('identity-only ledger survives a normal database reopen without making any resource installed', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'igs-resource-remove-reopen-'))
  let app = openAppDatabase(root, migrations)
  try {
    let repository = new ModelRepository(app.db)
    const one = await repository.publishVerifiedInstallation({ primary: artifact(root) })
    await repository.removeLocalResource(
      one.resourceId,
      await installed(repository, one.resourceId),
      removeFiles,
    )
    await app.close()
    app = openAppDatabase(root, migrations)
    repository = new ModelRepository(app.db)
    assert.deepEqual(await repository.listInstalled(), [])
    const two = await repository.publishVerifiedInstallation({ primary: artifact(root) })
    assert.equal(two.resourceId, one.resourceId)
    assert.equal(two.versionId, one.versionId)
  } finally {
    await app.close()
    rmSync(root, { force: true, recursive: true })
  }
})
