/** Verify packaged startup recovery of an interrupted durable queue without a worker. */
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { copyFile, lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect } from '@playwright/test'

import { openAppDatabase } from '../../src/main/db/database.ts'
import {
  GenerationQueueRepository,
  parseFrozenGenerationPayloadV1,
} from '../../src/main/projects/generation-queue.ts'
import { readIgsPackage } from '../../src/main/projects/igs-package.ts'
import { localProjectRecoveryKey } from '../../src/main/projects/project-identity.ts'
import { snapshotDatabase } from './application-state-upgrade-fixture.mjs'
import {
  assertOpened,
  regularFile,
  verifyChooserFixture,
} from './packaged-noobai-import-chooser.mjs'

const migrations = fileURLToPath(new URL('../../src/main/db/migrations/', import.meta.url))
const noRuntime = 'Use Set up in the image generation notice above before generating.'
const restartMessage = 'The application closed before this job completed.'
const tableQueue = 'generation_queue_item'
const emptyTables = [
  'generation_candidate_receipt',
  'generation_seed_cursor',
  'generation_acceptance_journal',
  'generation_staging_discarded_session',
]
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

async function readFrozenInputs(ownedRunRoot, identity) {
  const source = path.join(
    ownedRunRoot,
    'packaged-installed-engine/20261118/trained-noobai-eps-r4/native',
  )
  const sourcePins = [
    [
      'frozen-payload.json',
      2692,
      '760fe7ee5badb5d45f097a613f02f3b0be962560475a84a7c9ec1591c811274f',
    ],
    [
      'target-manifest.json',
      288,
      '2ad313754e06b1003625d47a1b3de7d3960719d6d54a4961d19250f4c88a66f6',
    ],
    ['target.png', 721, '5e772deab1dd7f2624a541cf6584981d193acc7b83c4e4238200ebb4d67bb58d'],
  ].map(([name, sizeBytes, hash]) => ({ path: path.join(source, name), sizeBytes, sha256: hash }))
  const [payloadBytes, manifest, targetPngBytes] = await Promise.all(
    sourcePins.map(async (pin) => {
      assert.equal((await regularFile(pin.path)).size, pin.sizeBytes)
      const body = await readFile(pin.path)
      assert.equal(body.length, pin.sizeBytes)
      assert.equal(sha256(body), pin.sha256)
      assert.deepEqual(await identity(pin.path), pin)
      return body
    }),
  )
  const payload = parseFrozenGenerationPayloadV1(payloadBytes.toString('utf8'))
  assert.equal(payload.kind, 'illustrious-txt2img')
  assert.equal(payload.context.vae, null)
  assert.deepEqual(payload.context.loras, [])
  assert.deepEqual(payload.context.embeddings, { positive: [], negative: [] })
  assert.deepEqual(JSON.parse(manifest.toString('utf8')), {
    queueInputVersion: 1,
    queueItemId: '1cefb4a6-51fb-4f07-b1d6-74e1003d417a',
    payloadSha256: sourcePins[0].sha256,
    targetFile: 'target.png',
    targetByteSize: sourcePins[2].sizeBytes,
    targetSha256: sourcePins[2].sha256,
  })
  return { payload, sourcePins, targetPngBytes }
}

async function prepareQueue({ appData, projectPath, project, frozen, root, mixedHistory = false }) {
  const scratch = path.join(root, 'queue-seed')
  await mkdir(scratch, { mode: 0o700 })
  const target = path.join(scratch, 'target.png')
  await writeFile(target, frozen.targetPngBytes, { flag: 'wx', mode: 0o600 })
  const model = path.join(scratch, 'absent-checkpoint.safetensors')
  await assert.rejects(lstat(model), { code: 'ENOENT' })
  const { context, workerJob } = structuredClone(frozen.payload)
  context.documentId = project.documentId
  context.documentRevision = project.documentRevision
  context.model.managedPath = model
  workerJob.checkpoint.path = model
  const database = openAppDatabase(appData, migrations)
  try {
    const queue = new GenerationQueueRepository(database.db, appData)
    assert.deepEqual(await database.db.selectFrom(tableQueue).selectAll().execute(), [])
    assert.deepEqual(await queue.recoverAfterRestart(), {
      canceledCount: 0,
      orphanedDirectoriesRemoved: 0,
    })
    async function enqueue() {
      const item = await queue.enqueueIllustriousGeneration({
        prepared: { context, targetPngBytes: frozen.targetPngBytes },
        request: {
          job: {
            ...workerJob,
            output: { pngPath: path.join(scratch, 'result.png'), stagingRoot: scratch },
            target: { ...workerJob.target, path: target },
          },
          protocolVersion: '1',
          requestId: randomUUID(),
          type: 'generate-illustrious-txt2img',
        },
        projectPath,
        stagingSessionId: randomUUID(),
      })
      const verified = await queue.loadVerifiedRetryInput(item.id)
      assert.equal(verified.item.localProjectKey, localProjectRecoveryKey(projectPath))
      assert.equal(verified.item.status, 'pending')
      assert.equal(verified.item.statusSequence, 0)
      assert.ok(verified.targetPngBytes.equals(frozen.targetPngBytes))
      return item
    }

    async function claimNext() {
      const pending = await enqueue()
      const claim = await queue.claimNextPending()
      assert.equal(claim?.item.id, pending.id)
      assert.equal(claim.item.status, 'running')
      assert.equal(claim.item.statusSequence, 1)
      return claim.item
    }

    const terminal = await enqueue()
    assert.equal((await queue.cancel(terminal.id, 0)).status, 'canceled')
    const running = await claimNext()
    if (mixedHistory) {
      const failed = await queue.failRunning(running.id, running.statusSequence, {
        code: 'FIXTURE_GENERATION_FAILED',
        message: 'Controlled failure for the keyboard history fixture.',
      })
      assert.equal(failed.status, 'failed')
      assert.equal(failed.statusSequence, 2)

      // Seed the history shape left after a completed job has no live candidate.
      // The real completion owner also publishes a candidate receipt and needs
      // generated output. This fixture is only about clearing terminal history.
      const completed = await claimNext()
      const now = new Date().toISOString()
      const updated = await database.db
        .updateTable(tableQueue)
        .set({
          finished_at: now,
          status: 'completed',
          status_sequence: completed.statusSequence + 1,
          updated_at: now,
        })
        .where('id', '=', completed.id)
        .where('status', '=', 'running')
        .where('error_code', 'is', null)
        .where('status_sequence', '=', completed.statusSequence)
        .executeTakeFirst()
      assert.equal(Number(updated.numUpdatedRows), 1)
      return { canceled: terminal.id, completed: completed.id, failed: failed.id }
    }
    const pending = await enqueue()
    return { terminal: terminal.id, running: running.id, pending: pending.id }
  } finally {
    await database.close()
  }
}

function closedSnapshot(store) {
  assert.equal(store.databaseFiles.length, 1)
  const result = snapshotDatabase(store.databaseFiles[0].path, { closed: true })
  assert.equal(result.integrityCheck, 'ok')
  assert.deepEqual(result.foreignKeyCheck, [])
  for (const table of emptyTables) assert.deepEqual(result.tables[table].rows, [], table)
  return result
}

function assertFirstRecovery(before, after, ids) {
  const rows = new Map(after.map((entry) => [entry.id, entry]))
  assert.equal(rows.size, 3)
  for (const original of before) {
    const actual = rows.get(original.id)
    assert.ok(actual)
    if (original.id === ids.terminal) {
      assert.deepEqual(actual, original)
      continue
    }
    assert.ok(Number.isFinite(Date.parse(actual.finished_at)))
    assert.deepEqual(actual, {
      ...original,
      status: 'canceled',
      status_sequence: original.status_sequence + 1,
      error_code: 'APP_RESTART',
      error_message: restartMessage,
      finished_at: actual.finished_at,
      updated_at: actual.finished_at,
    })
  }
}

async function retainInputs({ appData, ids, destination, baseline, identity }) {
  const inputRoot = path.join(appData, 'generation-inputs')
  const members = ['manifest.json', 'target.png']
  assert.deepEqual((await readdir(inputRoot)).sort(), Object.values(ids).sort())
  if (destination) await mkdir(destination, { mode: 0o700 })
  const result = []
  for (const id of Object.values(ids).sort()) {
    const item = path.join(inputRoot, id)
    assert.equal(await realpath(item), item)
    assert.deepEqual((await readdir(item)).sort(), members)
    if (destination) await mkdir(path.join(destination, id), { mode: 0o700 })
    for (const name of members) {
      const file = path.join(item, name)
      assert.ok((await regularFile(file)).size <= 1024 * 1024)
      const bytes = await readFile(file)
      if (destination) {
        const retained = path.join(destination, id, name)
        await writeFile(retained, bytes, { flag: 'wx', mode: 0o600 })
        result.push(await identity(retained))
      }
      if (baseline) {
        const expected = path.join(baseline, id, name)
        await regularFile(expected)
        assert.ok(bytes.equals(await readFile(expected)), file)
      }
    }
  }
  return result
}

async function prepareOwnedQueueProject({ root, appData, ownedRunRoot, packageBefore, identity }) {
  const proofPath = path.join(path.dirname(root), 'package-proof.json')
  assert.ok((await regularFile(proofPath)).size <= 16 * 1024)
  const proof = JSON.parse(await readFile(proofPath, 'utf8'))
  assert.equal(proof.schemaVersion, 1)
  assert.ok(proof.package.path.startsWith(`${ownedRunRoot}${path.sep}`))
  const source = await verifyChooserFixture({
    scenario: 'queue-startup-recovery',
    root,
    ownedRunRoot,
    packageBefore,
    expectedPackage: proof.package,
    identity,
  })
  assert.equal(appData, path.join(root, 'data/imagegen-studio'))
  const workspace = path.join(appData, 'workspaces/Uncategorized')
  await mkdir(workspace, { recursive: true, mode: 0o700 })
  assert.equal(await realpath(workspace), workspace)
  assert.deepEqual(await readdir(workspace), [])
  const projectPath = path.join(workspace, 'Queue startup recovery.igs')
  await copyFile(source.path, projectPath, constants.COPYFILE_EXCL)
  const initial = await regularFile(projectPath)
  assert.deepEqual(await identity(projectPath), { ...source, path: projectPath })
  const { project } = await readIgsPackage(projectPath)
  const frozen = await readFrozenInputs(ownedRunRoot, identity)
  return { source, projectPath, initial, project, frozen }
}

export async function runPackagedQueueStartupRecovery(options) {
  const { root, appData, launch, readPorts, closeNormally, retainOwnStore, identity } = options
  const { source, projectPath, initial, project, frozen } = await prepareOwnedQueueProject(options)
  const ids = await prepareQueue({ appData, projectPath, project, frozen, root })
  const before = await retainOwnStore('before-startup')
  const beforeRows = closedSnapshot(before).tables[tableQueue].rows
  assert.equal(beforeRows.length, 3)
  const originalById = Object.fromEntries(beforeRows.map((row) => [row.id, row]))
  assert.equal(originalById[ids.running].status, 'running')
  assert.equal(originalById[ids.running].status_sequence, 1)
  assert.equal(originalById[ids.pending].status, 'pending')
  assert.equal(originalById[ids.pending].status_sequence, 0)
  assert.equal(originalById[ids.terminal].status, 'canceled')
  assert.equal(originalById[ids.terminal].error_code, 'USER_CANCELED')
  const beforeInputs = path.join(root, 'before-inputs')
  const retainedBefore = await retainInputs({ appData, ids, destination: beforeInputs, identity })

  async function openAndInspect(state) {
    const { page } = state
    const ports = await readPorts(state)
    assert.equal(ports.runtime.value.kind, 'not-installed')
    assert.equal(ports.projects.value.length, 1)
    const [entry] = ports.projects.value
    assert.equal(entry.title, project.title)
    assert.equal(entry.recoveryStatus, 'none')
    await page.getByRole('button', { name: `Open ${entry.title}`, exact: true }).click()
    await assertOpened(state, entry.id)
    await page.getByRole('button', { name: 'Open Queue Manager', exact: true }).click()
    const manager = page.getByRole('dialog', { name: 'Queue Manager', exact: true })
    for (const id of Object.values(ids)) {
      const row = manager.getByTestId('queue-job-row').and(manager.locator(`[data-job-id="${id}"]`))
      await expect(row).toHaveAttribute('data-status', 'canceled')
      await expect(row.getByRole('button', { name: 'Retry job', exact: true })).toBeDisabled()
      await expect(row.getByText(noRuntime, { exact: true })).toBeVisible()
      await row.getByRole('button', { name: 'Show job details', exact: true }).click()
      const code = id === ids.terminal ? 'USER_CANCELED' : 'APP_RESTART'
      await expect(manager.getByText(code, { exact: true })).toBeVisible()
      if (code === 'APP_RESTART')
        await expect(manager.getByText(restartMessage, { exact: true })).toBeVisible()
    }
    const response = await page.evaluate(() => window.api.projects.getGenerationQueue())
    assert.equal(response.ok, true, response.error?.message)
    assert.deepEqual(response.value.counts, {
      canceled: 3,
      completed: 0,
      failed: 0,
      pending: 0,
      running: 0,
    })
    assert.equal(response.value.nextCursor, null)
    assert.equal(response.value.items.length, 3)
    assert.deepEqual(response.value.items.map(({ id }) => id).sort(), Object.values(ids).sort())
    const source = response.value.items.find(({ id }) => id === ids.running)
    assert.equal(source.statusSequence, 2)
    assert.equal(source.projectKey, entry.id)
    assert.equal(source.error.code, 'APP_RESTART')
    const refusal = await page.evaluate(
      (review) => window.api.projects.retryGenerationJob(review),
      { id: source.id, statusSequence: source.statusSequence },
    )
    assert.equal(refusal.ok, false, JSON.stringify(refusal))
    assert.equal(refusal.error.code, 'GENERATION_RUNTIME_UNAVAILABLE')
    assert.deepEqual(await page.evaluate(() => window.api.projects.getGenerationQueue()), response)
    await manager.getByRole('button', { name: 'Close Queue Manager', exact: true }).click()
    const file = await regularFile(projectPath)
    assert.deepEqual([file.dev, file.ino], [initial.dev, initial.ino])
    assert.deepEqual(await identity(projectPath), before.project)
    return { queue: response.value, refusal: refusal.error.code, projectId: entry.id }
  }

  const first = await launch('recovered-queue')
  const firstRead = await openAndInspect(first)
  await closeNormally(first)
  const saved = await retainOwnStore('after-first-startup')
  const savedDb = closedSnapshot(saved)
  assertFirstRecovery(beforeRows, savedDb.tables[tableQueue].rows, ids)
  const retainedAfter = await retainInputs({
    appData,
    ids,
    destination: path.join(root, 'after-inputs'),
    baseline: beforeInputs,
    identity,
  })
  assert.equal(savedDb.tables.project_accepted_result_index.rows.length, 1)

  const second = await launch('restarted-queue')
  const secondRead = await openAndInspect(second)
  assert.deepEqual(secondRead, firstRead)
  await closeNormally(second)
  const restarted = await retainOwnStore('after-second-startup')
  const restartedDb = closedSnapshot(restarted)
  for (const key of Object.keys(savedDb.tables)) {
    if (key !== 'project_index') assert.deepEqual(restartedDb.tables[key], savedDb.tables[key], key)
  }
  await retainInputs({ appData, ids, baseline: beforeInputs, identity })
  assert.deepEqual(saved.project, before.project)
  assert.deepEqual(restarted.project, before.project)
  assert.deepEqual(await identity(source.path), source)
  for (const pin of frozen.sourcePins) assert.deepEqual(await identity(pin.path), pin)

  return {
    saved,
    restarted,
    offlineProjectResult: {
      before,
      ids,
      project: source,
      sourcePins: frozen.sourcePins,
      firstRead,
      secondRead,
      retainedBefore,
      retainedAfter,
    },
  }
}

export async function runPackagedQueueHistoryKeyboard(options) {
  const { root, appData, launch, readPorts, closeNormally, retainOwnStore, identity } = options
  const { runPackagedQueueHistoryKeyboard: driveHistory, inspectPackagedQueueHistoryKeyboard } =
    await import('./packaged-queue-history-keyboard.mjs')
  const { source, projectPath, initial, project, frozen } = await prepareOwnedQueueProject(options)
  const ids = await prepareQueue({
    appData,
    projectPath,
    project,
    frozen,
    root,
    mixedHistory: true,
  })
  const before = await retainOwnStore('before-keyboard-history')
  const baselineRows = closedSnapshot(before).tables[tableQueue].rows
  assert.equal(baselineRows.length, 3)
  for (const [status, id] of Object.entries(ids)) {
    const row = baselineRows.find((item) => item.id === id)
    assert.equal(row?.status, status)
    assert.equal(row.status_sequence, status === 'canceled' ? 1 : 2)
    assert.ok(Number.isFinite(Date.parse(row.finished_at)))
  }
  const inputWitness = path.join(root, 'before-inputs')
  const retainedBefore = await retainInputs({ appData, ids, destination: inputWitness, identity })
  const remainingIds = { canceled: ids.canceled, failed: ids.failed }
  const sqlite = path.join(appData, 'database/app.sqlite')
  const projectId = localProjectRecoveryKey(projectPath)
  let acceptedRows

  async function inspectAcceptedProject(state) {
    const ports = await readPorts(state)
    assert.equal(ports.runtime.value.kind, 'not-installed')
    assert.equal(ports.projects.value.length, 1)
    const [entry] = ports.projects.value
    assert.equal(entry.id, projectId)
    assert.equal(entry.title, project.title)
    assert.equal(entry.recoveryStatus, 'none')
    return entry
  }

  async function openAcceptedProject(state, entry) {
    await state.page.getByRole('button', { name: `Open ${entry.title}`, exact: true }).click()
    await assertOpened(state, projectId)
  }

  function assertStore(snapshot, activeIds) {
    const active = Object.values(activeIds)
    assert.equal(snapshot.integrityCheck, 'ok')
    assert.deepEqual(snapshot.foreignKeyCheck, [])
    for (const name of emptyTables) assert.deepEqual(snapshot.tables[name].rows, [], name)
    assert.deepEqual(
      snapshot.tables[tableQueue].rows,
      baselineRows.filter((row) => active.includes(row.id)),
    )
    const accepted = snapshot.tables.project_accepted_result_index.rows
    assert.equal(accepted.length, 1)
    assert.equal(accepted[0].local_project_key, projectId)
    assert.equal(accepted[0].document_id, project.documentId)
    assert.equal(accepted[0].document_revision, project.documentRevision)
    acceptedRows ??= accepted
    assert.deepEqual(accepted, acceptedRows)
  }

  async function assertVisibleState(state, activeIds) {
    const response = await state.page.evaluate(() => window.api.projects.getGenerationQueue())
    assert.equal(response.ok, true, response.error?.message)
    assert.deepEqual(response.value.counts, {
      canceled: Number(Boolean(activeIds.canceled)),
      completed: Number(Boolean(activeIds.completed)),
      failed: Number(Boolean(activeIds.failed)),
      pending: 0,
      running: 0,
    })
    assert.equal(response.value.nextCursor, null)
    assert.deepEqual(
      response.value.items.map(({ id }) => id).sort(),
      Object.values(activeIds).sort(),
    )
    for (const [status, id] of Object.entries(activeIds)) {
      const item = response.value.items.find((entry) => entry.id === id)
      assert.equal(item.status, status)
      assert.equal(item.statusSequence, status === 'canceled' ? 1 : 2)
      assert.equal(item.projectKey, projectId)
      assert.equal(item.documentId, project.documentId)
      assert.equal(item.publicationPending, false)
    }
    assertStore(snapshotDatabase(sqlite), activeIds)
    await retainInputs({ appData, ids: activeIds, baseline: inputWitness, identity })
    const file = await regularFile(projectPath)
    assert.deepEqual([file.dev, file.ino], [initial.dev, initial.ino])
    assert.deepEqual(await identity(projectPath), before.project)
  }

  async function checkpoint(name, activeIds) {
    const store = await retainOwnStore(name)
    assertStore(closedSnapshot(store), activeIds)
    assert.deepEqual(store.project, before.project)
    assert.deepEqual(await identity(path.join(root, store.retainedProject)), {
      ...before.project,
      path: path.join(root, store.retainedProject),
    })
    return store
  }

  async function runClear({ name, mode, beforeIds, afterIds }) {
    const state = await launch(name)
    const entry = await inspectAcceptedProject(state)
    await assertVisibleState(state, beforeIds)
    const keyboard = await driveHistory({
      state,
      root,
      mode,
      beforeIds: Object.values(beforeIds),
      afterIds: Object.values(afterIds),
      assertPreserved: async () => await assertVisibleState(state, beforeIds),
      assertPruned: async () => await assertVisibleState(state, afterIds),
    })
    await assertVisibleState(state, afterIds)
    await openAcceptedProject(state, entry)
    await closeNormally(state)
    return keyboard
  }

  const completed = await runClear({
    name: 'keyboard-completed-history',
    mode: 'completed',
    beforeIds: ids,
    afterIds: remainingIds,
  })
  const afterCompleted = await checkpoint('after-completed-history', remainingIds)
  const retainedSurvivors = await retainInputs({
    appData,
    ids: remainingIds,
    destination: path.join(root, 'after-completed-inputs'),
    baseline: inputWitness,
    identity,
  })

  const failedOrCanceled = await runClear({
    name: 'keyboard-failed-canceled-history',
    mode: 'failed-or-canceled',
    beforeIds: remainingIds,
    afterIds: {},
  })
  const afterFailedOrCanceled = await checkpoint('after-failed-canceled-history', {})

  const cold = await launch('keyboard-empty-history')
  const entry = await inspectAcceptedProject(cold)
  await assertVisibleState(cold, {})
  const empty = await inspectPackagedQueueHistoryKeyboard({ state: cold, root, expectedIds: [] })
  await openAcceptedProject(cold, entry)
  await closeNormally(cold)
  const afterEmptyReopen = await checkpoint('after-empty-reopen', {})
  assert.deepEqual(await identity(source.path), source)
  for (const pin of frozen.sourcePins) assert.deepEqual(await identity(pin.path), pin)

  return {
    mode: 'mixed-terminal-history-keyboard',
    completedSeed: 'synthetic terminal row without a live candidate',
    before,
    ids,
    project: source,
    sourcePins: frozen.sourcePins,
    retainedBefore,
    afterCompleted,
    retainedSurvivors,
    afterFailedOrCanceled,
    afterEmptyReopen,
    keyboard: { completed, failedOrCanceled, empty },
  }
}
