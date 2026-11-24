/** Register one verified borrowed checkpoint in an owned, already repaired DB29 profile. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open, readFile, readlink, realpath } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { openAppDatabase } from '../../src/main/db/database.ts'
import { ModelRepository } from '../../src/main/models/model-repository.ts'

import { snapshotDatabase } from './application-state-upgrade-fixture.mjs'
import { verifyPackagedTrainedSources } from './packaged-installed-models.mjs'

const repo = path.resolve(import.meta.dirname, '../..')
const runs = path.join(os.homedir(), '.codex/artifacts/imagegen-studio/runs')
const originalDescriptor = path.join(
  runs,
  'packaged-installed-engine/20261118/trained-noobai-eps-r5/trained-fixture.json',
)
const originalDescriptorHash = '89be70a78e62364c449ec82409ad6fcb39e7710c938a36ca5488959ba9127c1b'
const modelHash = 'ff827fc34584853257d6de64b8bc3e34156814f6b0cfd1a5112a5e9164806df1'
const modelPath = path.join(
  runs,
  'packaged-noobai-install/20261119/install/data/imagegen-studio/models/ff',
  `${modelHash}.safetensors`,
)
const byteSize = 6_938_040_416

async function readOwnedRegular(file, maxBytes) {
  assert.equal(await realpath(file), file)
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const entry = await handle.stat({ bigint: true })
    assert.ok(entry.isFile() && entry.uid === BigInt(process.getuid()) && entry.nlink === 1n)
    assert.ok(entry.size > 0n && entry.size <= BigInt(maxBytes))
    const body = await handle.readFile()
    assert.equal(BigInt(body.length), entry.size)
    const current = await lstat(file, { bigint: true })
    for (const field of ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs']) {
      assert.equal(current[field], entry[field])
    }
    return body
  } finally {
    await handle.close()
  }
}

/**
 * Tests use InvokeAI 4875d965 model_install_default.py register_path → _register, called by the
 * orphan scan, as the borrowed-file pattern. Reuse Studio's existing verified-file receipt and
 * ModelRepository publication.
 */
export async function prepareRepairedTrainedModel({ dataRoot, root }) {
  const run = path.dirname(root)
  assert.equal(path.dirname(run), path.join(runs, 'packaged-runtime-setup'))
  assert.equal(path.basename(root), 'protocol-repair')
  const state = path.join(run, 'protocol-repair-state')
  const inputs = path.join(run, 'protocol-repair-inputs')
  for (const directory of [root, state, inputs, dataRoot]) {
    assert.equal(await realpath(directory), directory)
    const stat = await lstat(directory)
    assert.ok(stat.isDirectory() && stat.uid === process.getuid(), directory)
  }
  const profile = JSON.parse(await readOwnedRegular(path.join(inputs, 'profile.json'), 16_384))
  assert.equal(profile.schemaVersion, 1)
  assert.equal(profile.appData, dataRoot)
  assert.ok(dataRoot.startsWith(path.join(runs, 'packaged-installed-engine') + path.sep))
  for (const namespace of ['mount', 'user']) {
    const procNamespace = namespace === 'mount' ? 'mnt' : namespace
    assert.match(profile.hostNamespace[namespace], new RegExp(`^${procNamespace}:\\[\\d+\\]$`))
    assert.notEqual(
      await readlink(`/proc/self/ns/${procNamespace}`),
      profile.hostNamespace[namespace],
    )
  }
  const mounts = (await readFile('/proc/self/mountinfo', 'utf8'))
    .split('\n')
    .map((line) => line.split(' '))
    .filter((entry) => entry[4] === dataRoot)
  assert.equal(mounts.length, 1)
  assert.ok(mounts[0][5].split(',').includes('rw'))
  const [staged, alias] = await Promise.all(
    [state, dataRoot].map((directory) => lstat(directory, { bigint: true })),
  )
  assert.deepEqual([alias.dev, alias.ino], [staged.dev, staged.ino])

  const runtime = path.join(dataRoot, 'runtime')
  const pointerBytes = await readOwnedRegular(path.join(runtime, 'current-runtime.json'), 8192)
  const pointer = JSON.parse(pointerBytes)
  const journal = JSON.parse(
    await readOwnedRegular(path.join(runtime, 'runtime-installation.json'), 65_536),
  )
  assert.equal(journal.mode, 'repair')
  assert.equal(journal.phase, 'complete')
  assert.equal(journal.candidatePointer, pointerBytes.toString('base64'))
  assert.equal(pointer.schemaVersion, 1)
  assert.match(pointer.runtimeId, /^release-[0-9a-f-]{36}$/)
  assert.equal(journal.prepared.runtimeId, pointer.runtimeId)
  assert.notEqual(pointer.runtimeId, profile.runtimeId)

  const bytes = await readOwnedRegular(originalDescriptor, 16_384)
  assert.equal(createHash('sha256').update(bytes).digest('hex'), originalDescriptorHash)
  const original = JSON.parse(bytes)
  const { family, model } = original
  assert.equal(family, 'illustrious')
  assert.equal(original.profile, 'noobai-eps')
  assert.equal(original.files.length, 1)
  assert.equal(original.files[0].path, modelPath)
  assert.equal(original.files[0].sha256, modelHash)
  assert.equal(original.files[0].byteSize, byteSize)
  assert.equal(model.ref.fileSha256, modelHash)
  assert.equal(model.ref.predictionType, 'epsilon')
  assert.deepEqual(model.dependencies, {})
  const status = await lstat(modelPath, { bigint: true })
  assert.ok(status.isFile() && status.uid === BigInt(process.getuid()) && status.nlink === 1n)
  const fields = ['dev', 'ino', 'mode', 'nlink', 'size', 'mtimeNs', 'ctimeNs']
  const source = {
    ...original.files[0],
    // The offloaded model can be remounted with another device number. Pin the
    // actual identity across this run and compare bytes against the retained SHA.
    stat: Object.fromEntries(fields.map((field) => [field, String(status[field])])),
  }
  await verifyPackagedTrainedSources([source])

  const databaseFile = path.join(dataRoot, 'database/app.sqlite')
  const baselineFile = path.join(root, 'after-repair-reopen.sqlite')
  for (const file of [databaseFile, baselineFile]) await readOwnedRegular(file, 8 * 1024 ** 2)
  const before = snapshotDatabase(databaseFile, { closed: true })
  assert.deepEqual(before, snapshotDatabase(baselineFile, { closed: true }))
  assert.equal(before.integrityCheck, 'ok')
  assert.deepEqual(before.foreignKeyCheck, [])
  assert.equal(before.schemaMigrations.length, 30)
  assert.equal(before.tables.project_index.rows.length, 1)
  assert.equal(before.tables.generation_queue_item.rows.length, 1)
  const [prior] = before.tables.generation_queue_item.rows
  assert.equal(prior.status, 'canceled')
  assert.deepEqual(before.tables.generation_candidate_receipt.rows, [])
  const tables = ['model_resource', 'model_resource_version', 'local_model_file']
  assert.ok(
    !before.tables.model_resource.rows.some(
      ({ civitai_model_id }) => civitai_model_id === model.ref.civitaiModelId,
    ),
  )
  assert.ok(
    !before.tables.local_model_file.rows.some(
      ({ managed_path, sha256 }) => managed_path === source.path || sha256 === source.sha256,
    ),
  )

  const { civitaiModelId, civitaiVersionId, civitaiFileId } = model.ref
  const database = openAppDatabase(dataRoot, path.join(repo, 'src/main/db/migrations'))
  let publication
  try {
    assert.equal(database.filePath, databaseFile)
    const repository = new ModelRepository(database.db)
    publication = await repository.publishVerifiedInstallation({
      primary: {
        file: {
          managedPath: source.path,
          originalFilename: 'NoobAI-XL-100_percent_EPS.safetensors',
          sha256: source.sha256,
          sizeBytes: source.byteSize,
          verifiedAt: new Date().toISOString(),
        },
        resource: {
          creator: 'L_A_X',
          displayName: model.name,
          type: 'checkpoint',
          source: { kind: 'civitai', modelId: civitaiModelId },
          sourceMetadata: { qualificationPrecondition: true },
        },
        version: {
          baseModelFamily: family,
          format: 'safetensors',
          name: model.versionName,
          predictionType: null,
          source: {
            kind: 'civitai',
            expectedSha256: source.sha256,
            versionId: civitaiVersionId,
            fileId: civitaiFileId,
          },
          sourceMetadata: { qualificationPrecondition: true },
        },
      },
      dependencies: [],
    })
    assert.deepEqual(publication.dependencyVersionIds, {})
    const selected = (await repository.listInstalled()).find(
      ({ id }) => id === publication.resourceId,
    )
    assert.equal(selected.defaultVersionId, publication.versionId)
    assert.equal(selected.versions.length, 1)
    const [version] = selected.versions
    assert.equal(version.id, publication.versionId)
    assert.equal(version.predictionType, null)
    assert.equal(version.file.managedPath, source.path)
    assert.equal(version.file.sha256, source.sha256)
    assert.equal(version.file.sizeBytes, source.byteSize)
  } finally {
    await database.close()
  }

  const after = snapshotDatabase(databaseFile, { closed: true })
  const newIds = [publication.resourceId, publication.versionId, publication.fileId]
  const inserted = {}
  for (const [index, table] of tables.entries()) {
    const rows = after.tables[table].rows
    const newId = newIds[index]
    const [newRow, ...extra] = rows.filter(({ id }) => id === newId)
    assert.ok(newRow && !extra.length, table)
    assert.ok(
      before.tables[table].rows.every(({ id }) => id !== newId),
      table,
    )
    inserted[table] = newRow
    after.tables[table].rows = rows.filter(({ id }) => id !== newId)
  }
  assert.deepEqual(after, before)

  return {
    fixture: {
      family,
      profile: original.profile,
      appData: dataRoot,
      runtimeId: pointer.runtimeId,
      files: [source],
      model: {
        ...model,
        resourceId: publication.resourceId,
        versionId: publication.versionId,
        ref: {
          ...model.ref,
          localModelId: publication.resourceId,
          localVersionId: publication.versionId,
        },
      },
    },
    source,
    registration: { published: publication, inserted },
    prior,
  }
}
