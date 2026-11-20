/** Prepare verified test-only queue inputs after the isolated stock AppImage has recovered. */
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { copyFile, lstat, mkdir, readdir, readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { openAppDatabase } from '../../src/main/db/database.ts'
import {
  GenerationQueueRepository,
  parseFrozenGenerationPayloadV1,
} from '../../src/main/projects/generation-queue.ts'
import { readIgsPackage } from '../../src/main/projects/igs-package.ts'
import { localProjectRecoveryKey } from '../../src/main/projects/project-identity.ts'

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const migrations = fileURLToPath(new URL('../../src/main/db/migrations/', import.meta.url))
const memberNames = ['manifest.json', 'target.png']

async function assertOwnedEntry(filename, type) {
  assert.equal(await realpath(filename), filename)
  const stat = await lstat(filename)
  assert.equal(stat.uid, process.getuid())
  if (type === 'directory') assert.ok(stat.isDirectory(), filename)
  else assert.ok(stat.isFile() && stat.nlink === 1, filename)
  return stat
}

async function readRecordedQueueInput(ownedRunRoot) {
  const directory = path.join(
    ownedRunRoot,
    'packaged-installed-engine/20261118/trained-noobai-eps-stack-retry-r5/native',
  )
  const sourcePins = [
    {
      path: path.join(directory, 'frozen-payload.json'),
      sizeBytes: 6697,
      sha256: '23b7b016ef569cb44251f9615ef073024cb635eea2fb13218567db708db852c8',
    },
    {
      path: path.join(directory, 'target-manifest.json'),
      sizeBytes: 288,
      sha256: '2036e001c53ca858c3b38d7b704cf5556d860e3b52fa45e64e00547cfe1b604f',
    },
    {
      path: path.join(directory, 'target.png'),
      sizeBytes: 721,
      sha256: '5e772deab1dd7f2624a541cf6584981d193acc7b83c4e4238200ebb4d67bb58d',
    },
  ]
  const [payloadBytes, manifestBytes, targetPngBytes] = await Promise.all(
    sourcePins.map(async (pin) => {
      assert.equal((await assertOwnedEntry(pin.path, 'file')).size, pin.sizeBytes)
      const bytes = await readFile(pin.path)
      assert.equal(bytes.length, pin.sizeBytes)
      assert.equal(sha256(bytes), pin.sha256, pin.path)
      return bytes
    }),
  )
  const payload = parseFrozenGenerationPayloadV1(payloadBytes.toString('utf8'))
  assert.equal(payload.kind, 'illustrious-txt2img')
  assert.deepEqual(JSON.parse(manifestBytes.toString('utf8')), {
    payloadSha256: sourcePins[0].sha256,
    queueInputVersion: 1,
    queueItemId: 'caa65ece-6d30-42e1-b791-1f43c89bdcf8',
    targetByteSize: sourcePins[2].sizeBytes,
    targetFile: 'target.png',
    targetSha256: sourcePins[2].sha256,
  })
  return { payload, sourcePins, targetPngBytes }
}

function prepareContext({ payload, project, model, reference, slots, affected }) {
  const { context, workerJob } = structuredClone(payload)
  context.documentId = project.documentId
  context.documentRevision = project.documentRevision
  // Only the removable embedding body is installed in this fixture. The other
  // references retain their exact identity in declared, unpopulated queue-only slots.
  context.model.managedPath = path.join(slots, `${context.model.reference.fileSha256}.safetensors`)
  workerJob.checkpoint.path = context.model.managedPath
  assert.equal(context.loras.length, workerJob.loras.length)
  for (const [index, entry] of context.loras.entries()) {
    entry.managedPath = path.join(slots, `${entry.reference.fileSha256}.safetensors`)
    workerJob.loras[index].path = entry.managedPath
  }
  assert.ok(context.vae && workerJob.vae)
  context.vae.managedPath = path.join(slots, `${context.vae.reference.fileSha256}.safetensors`)
  workerJob.vae.path = context.vae.managedPath
  assert.equal(context.embeddings.negative.length, 1)
  assert.equal(context.embeddings.positive.length, 0)
  assert.equal(workerJob.embeddings.negative.length, 1)
  assert.equal(workerJob.embeddings.positive.length, 0)
  const [embedding] = context.embeddings.negative
  assert.deepEqual(embedding.reference, reference)
  assert.equal(embedding.byteSize, model.sizeBytes)
  assert.equal(reference.fileSha256, model.sha256)
  if (affected) {
    embedding.managedPath = model.path
    workerJob.embeddings.negative[0].path = model.path
  } else {
    delete context.embeddingRefs
    delete context.embeddings
    delete workerJob.embeddings
    context.prompts.negative = 'low quality'
    workerJob.prompts.negative = context.prompts.negative
  }
  return { context, workerJob }
}

/** Caller uses only its fresh, isolated appData and verifies the runtime is absent. */
export async function prepareRemoveQueueInputs({
  root,
  appData,
  ownedRunRoot,
  project,
  model,
  identity,
  key,
  reference,
}) {
  assert.equal(
    path.dirname(path.dirname(root)),
    path.join(ownedRunRoot, 'packaged-noobai-queue-remove'),
  )
  assert.equal(path.basename(root), 'remove')
  assert.equal(appData, path.join(root, 'data/imagegen-studio'))
  await assertOwnedEntry(root, 'directory')
  await assertOwnedEntry(appData, 'directory')
  assert.equal(path.dirname(project.path), path.join(appData, 'workspaces/Uncategorized'))
  assert.equal(
    model.path,
    path.join(appData, 'models', model.sha256.slice(0, 2), `${model.sha256}.safetensors`),
  )
  for (const owner of [project, model]) {
    await assertOwnedEntry(owner.path, 'file')
    assert.deepEqual(await identity(owner.path), owner)
  }
  const { project: opened } = await readIgsPackage(project.path)
  const { payload, sourcePins, targetPngBytes } = await readRecordedQueueInput(ownedRunRoot)
  const scratch = path.join(root, 'remove-queue-preparation')
  await mkdir(scratch, { mode: 0o700 })
  const targetPath = path.join(scratch, 'target.png')
  await copyFile(sourcePins[2].path, targetPath, constants.COPYFILE_EXCL)
  assert.deepEqual(await identity(targetPath), { ...sourcePins[2], path: targetPath })
  const slots = path.join(scratch, 'queue-only-model-slots')
  // An absent directory makes it impossible for these metadata-only claims to load weights.
  await assert.rejects(lstat(slots), { code: 'ENOENT' })

  const inputRoot = path.join(appData, 'generation-inputs')
  await assertOwnedEntry(inputRoot, 'directory')
  assert.deepEqual(await readdir(inputRoot), [])
  await assertOwnedEntry(path.join(appData, 'database/app.sqlite'), 'file')
  const database = openAppDatabase(appData, migrations)
  const queue = new GenerationQueueRepository(database.db, appData)
  const ownedIds = new Set()
  const claimedIds = new Set()
  try {
    assert.equal(localProjectRecoveryKey(project.path), key)
    assert.deepEqual(
      await database.db.selectFrom('generation_queue_item').selectAll().execute(),
      [],
    )
    assert.deepEqual(await queue.recoverAfterRestart(), {
      canceledCount: 0,
      orphanedDirectoriesRemoved: 0,
    })
  } catch (error) {
    await database.close()
    throw error
  }

  async function rows() {
    const result = await database.db
      .selectFrom('generation_queue_item')
      .selectAll()
      .orderBy('id', 'asc')
      .execute()
    assert.deepEqual(
      result.map(({ id }) => id),
      [...ownedIds].sort(),
    )
    return result
  }

  async function enqueue(affected) {
    assert.equal(typeof affected, 'boolean')
    const { context, workerJob } = prepareContext({
      payload,
      project: opened,
      model,
      reference,
      slots,
      affected,
    })
    const item = await queue.enqueueIllustriousGeneration({
      prepared: { context, targetPngBytes },
      request: {
        job: {
          ...workerJob,
          output: { pngPath: path.join(scratch, 'result.png'), stagingRoot: scratch },
          target: { ...workerJob.target, path: targetPath },
        },
        protocolVersion: '1',
        requestId: randomUUID(),
        type: 'generate-illustrious-txt2img',
      },
      projectPath: project.path,
      stagingSessionId: randomUUID(),
    })
    assert.ok(!ownedIds.has(item.id))
    ownedIds.add(item.id)
    const verified = await queue.loadVerifiedInput(item.id)
    assert.equal(verified.item.localProjectKey, key)
    assert.equal(verified.item.status, 'pending')
    assert.equal(verified.item.statusSequence, 0)
    assert.equal(verified.targetPath, path.join(inputRoot, item.id, 'target.png'))
    return item
  }

  async function claim(id) {
    const pending = (await rows())
      .filter((row) => row.status === 'pending')
      .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
    assert.equal(pending[0]?.id, id, 'The requested fixture claim must be next in queue order.')
    const result = await queue.claimNextPending()
    assert.ok(result && ownedIds.has(result.item.id), 'Claim only this fixture’s exact work.')
    claimedIds.add(result.item.id)
    assert.equal(result.item.id, id)
    assert.equal(result.item.status, 'running')
    return result.item
  }

  async function finish(id) {
    assert.ok(claimedIds.has(id), 'Acknowledge only a test claim that never started a worker.')
    const running = (await rows()).find((row) => row.id === id)
    assert.equal(running?.status, 'running')
    const requested = await queue.cancel(id, running.status_sequence)
    assert.equal(requested.status, 'running')
    assert.equal(requested.cancelRequested, true)
    const canceled = await queue.acknowledgeCanceledRunning(id, requested.statusSequence)
    assert.equal(canceled.status, 'canceled')
    claimedIds.delete(id)
    return canceled
  }

  async function witness() {
    const entries = await Promise.all(
      (await rows()).map(async ({ id }) => {
        await queue.loadVerifiedInput(id)
        const directory = path.join(inputRoot, id)
        await assertOwnedEntry(directory, 'directory')
        assert.deepEqual((await readdir(directory)).sort(), memberNames)
        const members = await Promise.all(
          memberNames.map(async (name) => {
            const filename = path.join(directory, name)
            await assertOwnedEntry(filename, 'file')
            const { sha256: fileHash, sizeBytes } = await identity(filename)
            return [name, { sha256: fileHash, sizeBytes }]
          }),
        )
        return [id, Object.fromEntries(members)]
      }),
    )
    return Object.fromEntries(entries)
  }

  async function retain(directory) {
    assert.equal(path.resolve(directory), directory)
    assert.ok(directory.startsWith(`${root}/`) && !directory.startsWith(`${appData}/`))
    await assertOwnedEntry(path.dirname(directory), 'directory')
    const bundles = await witness()
    await mkdir(directory, { mode: 0o700 })
    for (const [id, members] of Object.entries(bundles)) {
      const retained = path.join(directory, id)
      await mkdir(retained, { mode: 0o700 })
      for (const [name, pin] of Object.entries(members)) {
        const target = path.join(retained, name)
        await copyFile(path.join(inputRoot, id, name), target, constants.COPYFILE_EXCL)
        assert.deepEqual(await identity(target), { path: target, ...pin })
      }
    }
    return bundles
  }

  let closing
  function close() {
    closing ??= (async () => {
      try {
        for (const row of await rows()) {
          if (row.status === 'running') await finish(row.id)
          if (row.status === 'pending') {
            assert.equal((await queue.cancel(row.id, row.status_sequence)).status, 'canceled')
          }
        }
      } finally {
        await database.close()
      }
    })()
    return closing
  }

  return { claim, close, enqueue, finish, retain, rows, sourcePins, witness }
}
