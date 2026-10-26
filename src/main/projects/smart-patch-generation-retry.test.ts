import { defaultIllustriousNoiseProfile } from '../../shared/projects/illustrious-noise-profile.js'

import type { KyselyPlugin } from 'kysely'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { readdir, readFile, rename, symlink, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import type {
  GenerationQueueTestHooks,
  QueuedGenerationItem,
  VerifiedQueuedSmartPatchInput,
} from './generation-queue.js'
import type { SmartPatchExecutionModelResolver } from './project-smart-patch-execution.js'
import type { SmartPatchQueueFixture } from './test-fixtures/smart-patch-queue.js'

import { openAppDatabase } from '../db/database.js'
import { GenerationQueueRepository } from './generation-queue.js'
import { SmartPatchInputBundleRepository } from './project-smart-patch-input-bundle.js'
import { enqueueAnimaStagingBatch } from './test-fixtures/anima-staging.js'
import { admitSmartPatch, withSmartPatchQueueFixture } from './test-fixtures/smart-patch-queue.js'

// Boundary: real SQLite and durable PNG bundles, with the shared declared exact-file resolver.
// These tests exercise frozen replay, not trained inference, CPU preparation or renderer wiring.
type Fixture = SmartPatchQueueFixture
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const queueRoot = (f: Fixture) => path.join(f.root, 'generation-queued-inputs', 'smart-patch')
const directories = async (f: Fixture) => (await readdir(queueRoot(f))).sort()
const row = (f: Fixture, id: string) =>
  f.database.db
    .selectFrom('generation_queue_item')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirstOrThrow()
const rows = (f: Fixture) =>
  f.database.db.selectFrom('generation_queue_item').selectAll().orderBy('id').execute()

function retry(
  f: Fixture,
  source: QueuedGenerationItem,
  options: Partial<
    Parameters<GenerationQueueRepository['retryPreparedSmartPatchTerminal']>[2]
  > = {},
) {
  return f.queue.retryPreparedSmartPatchTerminal(source.id, source.statusSequence, {
    assertCurrent: () => undefined,
    modelService: f.models,
    ...options,
  })
}

async function terminalSource(f: Fixture, status: 'canceled' | 'failed' = 'canceled', index = 1) {
  const items = await admitSmartPatch(f)
  for (const [position, item] of items.entries()) {
    if (position !== index) {
      await f.queue.cancel(item.id)
    }
  }
  let source: QueuedGenerationItem
  if (status === 'failed') {
    const claimed = await f.queue.claimNextPendingSmartPatch()
    assert.equal(claimed?.item.id, items[index].id)
    assert.ok(claimed)
    source = await f.queue.failRunning(claimed.item.id, claimed.item.statusSequence, {
      code: 'DECLARED_RETRY_FAILURE',
      message: 'Controlled worker failure before candidate publication.',
    })
  } else {
    source = await f.queue.cancel(items[index].id)
  }
  return {
    before: await row(f, source.id),
    items,
    source,
    verified: await f.queue.loadVerifiedSmartPatchInput(source.id),
  }
}

async function preserved(f: Fixture, receiptCount = 0) {
  assert.ok(
    (await readFile(f.projectPath)).equals(f.originalProjectBytes),
    'Retry does not save or replace the original .igs',
  )
  assert.equal(
    (await f.database.db.selectFrom('generation_candidate_receipt').selectAll().execute()).length,
    receiptCount,
  )
  assert.equal(
    (await f.database.db.selectFrom('generation_seed_cursor').selectAll().execute()).length,
    0,
    'Retry does not invent a completed actual-seed cursor',
  )
}

async function assertCopy(
  f: Fixture,
  original: VerifiedQueuedSmartPatchInput,
  actual: VerifiedQueuedSmartPatchInput,
) {
  assert.notEqual(actual.bundle.id, original.bundle.id)
  assert.equal(actual.payload.bundle.itemIndex, original.payload.bundle.itemIndex)
  assert.equal(actual.bundle.manifestSha256, original.bundle.manifestSha256)
  assert.deepEqual(actual.bundle.manifest, original.bundle.manifest)
  assert.deepEqual(actual.payload, {
    ...original.payload,
    bundle: { ...original.payload.bundle, id: actual.bundle.id },
  })
  assert.deepEqual(
    Object.keys(actual.bundle.files).sort(),
    Object.keys(original.bundle.files).sort(),
  )
  for (const [name, expected] of Object.entries(original.bundle.files)) {
    assert.ok(actual.bundle.files[name].equals(expected), `${name}: independent exact frozen bytes`)
    assert.ok(
      (await readFile(path.join(queueRoot(f), actual.bundle.id, name))).equals(expected),
      `${name}: actual published file agrees, without large Buffer failure diagnostics`,
    )
  }
  assert.ok(
    (await readFile(path.join(queueRoot(f), actual.bundle.id, 'manifest.json'))).equals(
      await readFile(path.join(queueRoot(f), original.bundle.id, 'manifest.json')),
    ),
    'The complete original manifest, including unselected siblings, is copied byte for byte',
  )
}

function barrier() {
  let release!: () => void
  const released = new Promise<void>((resolve) => {
    release = resolve
  })
  let enter!: () => void
  const entered = new Promise<void>((resolve) => {
    enter = resolve
  })
  return { enter, entered, release, released }
}

async function insertReceipt(
  f: Fixture,
  source: QueuedGenerationItem,
  status: 'completed' | 'reserved',
) {
  const original = await row(f, source.id)
  await f.database.db
    .insertInto('generation_candidate_receipt')
    .values({
      actual_seed: 1,
      candidate_id: source.id,
      canonical_project_path: source.projectPath,
      completed_at: status === 'completed' ? new Date().toISOString() : null,
      expected_status_sequence: source.statusSequence,
      frozen_payload_sha256: digest(Buffer.from(original.frozen_payload_json)),
      image_byte_size: f.outputBytes.length,
      image_sha256: digest(f.outputBytes),
      local_project_key: source.localProjectKey,
      queue_item_id: source.id,
      reserved_at: new Date().toISOString(),
      staging_session_id: source.stagingSessionId,
      status,
    })
    .execute()
}

for (const family of ['illustrious', 'anima'] as const) {
  for (const status of ['failed', 'canceled'] as const) {
    test(`${family} ${status} Smart Patch Retry copies the full bundle for one original nonzero item and survives source pruning and SQLite reopen`, async () => {
      // Boundary: terminal replay -> files -> SQL. Invariant: one fresh attempt, frozen provenance.
      // Neighbor: sibling history remains independent. Mutation: shared bundle or index reset.
      await withSmartPatchQueueFixture(family, async (f) => {
        const { before, items, source, verified } = await terminalSource(f, status)
        const retried = await retry(f, source)
        assert.equal(retried.status, 'pending')
        assert.equal(retried.statusSequence, 0)
        assert.equal(retried.cancelRequested, false)
        for (const key of ['id', 'batchId', 'stagingSessionId'] as const) {
          assert.notEqual(retried[key], source[key], `Fresh ${key}`)
          assert.match(retried[key], /^[a-f0-9-]{36}$/i)
        }
        assert.equal(retried.localProjectKey, source.localProjectKey)
        assert.equal(retried.projectPath, source.projectPath)
        assert.equal((await rows(f)).length, items.length + 1)
        const consumed = await row(f, source.id)
        assert.deepEqual(consumed, {
          ...before,
          status_sequence: before.status_sequence + 1,
          updated_at: consumed.updated_at,
        })
        const loaded = await f.queue.loadVerifiedSmartPatchInput(retried.id)
        assert.equal(loaded.payload.bundle.itemIndex, 1)
        assert.equal(loaded.payload.item.item.seed, 1)
        assert.equal(loaded.bundle.manifest.items.length, 2)
        await assertCopy(f, verified, loaded)
        const newRow = await row(f, retried.id)
        for (const key of ['document_id', 'document_revision', 'operation'] as const) {
          assert.equal(newRow[key], before[key])
        }
        assert.equal(newRow.error_code, null)
        assert.equal(newRow.error_message, null)
        assert.equal(newRow.started_at, null)
        assert.equal(newRow.finished_at, null)
        await assert.rejects(retry(f, source), { code: 'QUEUE_STATUS_CONFLICT' })
        await f.queue.deleteTerminal(source.id, consumed.status_sequence)
        assert.equal(await f.queue.pruneTerminal(['canceled']), 1)
        assert.deepEqual(await directories(f), [loaded.bundle.id])
        assert.deepEqual(
          (await rows(f)).map((entry) => entry.id),
          [retried.id],
        )

        // A separate SQLite connection and fresh repository cannot rely on caller/reader caches.
        const reopened = openAppDatabase(f.root, path.resolve('src/main/db/migrations'))
        try {
          const fresh = new GenerationQueueRepository(reopened.db, f.root)
          const recovered = await fresh.recoverAfterRestart()
          assert.equal(recovered.canceledCount, 1)
          assert.equal(recovered.orphanedDirectoriesRemoved, 0)
          const independent = await fresh.loadVerifiedSmartPatchInput(retried.id)
          assert.deepEqual(independent.bundle.manifest, verified.bundle.manifest)
          for (const [name, bytes] of Object.entries(verified.bundle.files)) {
            assert.ok(
              independent.bundle.files[name].equals(bytes),
              `${name} survives source deletion`,
            )
          }
          assert.equal((await fresh.getManagerEntry(retried.id)).error?.code, 'APP_RESTART')
          assert.equal(await fresh.hasDispatchableSmartPatchPending(), false)
          assert.equal(await fresh.claimNextPendingSmartPatch(), null)
          assert.equal((await rows(f)).length, 1, 'Restart does not autoreplay a canceled attempt')
          assert.equal(await fresh.pruneTerminal(['canceled']), 1)
          assert.deepEqual(await directories(f), [])
        } finally {
          await reopened.close()
        }
        await preserved(f)
      })
    })
  }

  test(`${family} Smart Patch Retry preserves concrete seed zero`, async () => {
    // Boundary: frozen seed -> SQL replay. Invariant: zero is a value. Neighbor: seed-one sibling.
    // Mutation: a truthiness default or seed replanning changes the concrete execution.
    await withSmartPatchQueueFixture(family, async (f) => {
      const { source, verified } = await terminalSource(f, 'canceled', 0)
      const loaded = await f.queue.loadVerifiedSmartPatchInput((await retry(f, source)).id)
      assert.equal(loaded.payload.item.item.seed, 0)
      assert.equal(loaded.payload.bundle.itemIndex, 0)
      assert.deepEqual(loaded.payload.item, verified.payload.item)
      await preserved(f)
    })
  })

  test(`${family} Smart Patch OUT Retry reuses exact frozen model-source RGB without infill or preparation`, async () => {
    // Boundary: OUT frozen files -> replay. Invariant: existing RGB needs no LaMa/reprepare.
    // Neighbor: mixed-alpha original and unselected sibling survive. Mutation: recapture today's input.
    await withSmartPatchQueueFixture(
      family,
      async (f) => {
        const { source, verified } = await terminalSource(f)
        assert.equal(verified.payload.mode, 'outpaint')
        assert.equal(verified.bundle.manifest.sourceAlpha, 'mixed')
        assert.ok(verified.bundle.files['model-source.png'])
        // Make the caller's preparation unusable; only the durable original is authoritative.
        for (const bytes of Object.values(f.material.files)) {
          bytes.fill(0)
        }
        const loaded = await f.queue.loadVerifiedSmartPatchInput((await retry(f, source)).id)
        await assertCopy(f, verified, loaded)
        assert.ok(
          loaded.bundle.files['model-source.png'].equals(verified.bundle.files['model-source.png']),
          'OUT replay preserves the exact prepared RGB without any supplied infill/CPU collaborator',
        )
        await preserved(f)
      },
      {},
      'outpaint',
    )
  })

  test(`${family} two-repository Smart Patch Retry consumes the reviewed source sequence exactly once`, async () => {
    // Boundary: concurrent files-first attempts -> SQL CAS. Invariant: one winner and one new row.
    // Neighbor: loser retains source history. Mutation: remove source CAS or consume outside insertion.
    await withSmartPatchQueueFixture(family, async (f) => {
      const gate = barrier()
      let reached = 0
      const hooks: GenerationQueueTestHooks = {
        afterRetryInputPublish: async () => {
          if (++reached === 2) {
            gate.release()
          }
          await gate.released
        },
      }
      const first = new GenerationQueueRepository(f.database.db, f.root, hooks)
      const second = new GenerationQueueRepository(f.database.db, f.root, hooks)
      await first.recoverAfterRestart()
      await second.recoverAfterRestart()
      const { before, source, verified } = await terminalSource(f)
      const attempts = [first, second].map((queue) =>
        retry({ ...f, queue }, source).catch((error: unknown) => {
          gate.release()
          throw error
        }),
      )
      const outcomes = await Promise.allSettled(attempts)
      assert.equal(reached, 2, 'Both independent copies reached the source CAS window')
      const succeeded = outcomes.filter(
        (outcome): outcome is PromiseFulfilledResult<QueuedGenerationItem> =>
          outcome.status === 'fulfilled',
      )
      assert.equal(succeeded.length, 1)
      const refused = outcomes.filter((outcome) => outcome.status === 'rejected')
      assert.equal(refused.length, 1)
      assert.equal(refused[0].reason.code, 'QUEUE_STATUS_CONFLICT')
      assert.equal((await rows(f)).length, 3)
      assert.equal((await row(f, source.id)).status_sequence, before.status_sequence + 1)
      const loaded = await first.loadVerifiedSmartPatchInput(succeeded[0].value.id)
      await assertCopy(f, verified, loaded)
      assert.deepEqual(await directories(f), [verified.bundle.id, loaded.bundle.id].sort())
      await preserved(f)
    })
  })
}

test('Smart Patch Retry requalifies selected prompts while copying the entire original plan', async () => {
  // Boundary: exact-resource preflight. Invariant: only the reviewed concrete job is requalified.
  // Neighbor: different sibling prompts remain frozen. Mutation: reverify the whole copied plan.
  await withSmartPatchQueueFixture('illustrious', async (f) => {
    const sibling = f.material.manifest.items[0]
    assert.equal(sibling.family, 'illustrious')
    if (sibling.family !== 'illustrious') {
      assert.fail('Expected Illustrious fixture')
    }
    sibling.item.prompts.positive = 'unselected sibling prompt'
    sibling.inference.prompts.positive = sibling.item.prompts.positive
    const { source, verified } = await terminalSource(f)
    let checked = 0
    const models: SmartPatchExecutionModelResolver = {
      ...f.models,
      assertNoUnboundGenerationEmbeddings: async (input) => {
        ++checked
        assert.equal(input.positivePrompt.text, verified.payload.item.item.prompts.positive)
        assert.equal(input.negativePrompt.text, verified.payload.item.item.prompts.negative)
      },
    }
    const loaded = await f.queue.loadVerifiedSmartPatchInput(
      (await retry(f, source, { modelService: models })).id,
    )
    assert.ok(checked > 0, 'The selected concrete prompt crossed real resource preflight')
    assert.equal(loaded.bundle.manifest.items[0].item.prompts.positive, 'unselected sibling prompt')
    await assertCopy(f, verified, loaded)
    await preserved(f)
  })
})

for (const hook of ['afterRetryInputPublish', 'beforeRetryCommit'] as const) {
  test(`Smart Patch Retry ${hook} interruption preserves the entire terminal source and rolls back the copy`, async () => {
    // Boundary: durable copy / SQL transaction. Invariant: no source consumption without insertion.
    // Neighbor: original sibling bundle is reloadable. Mutation: advance source before transaction.
    await withSmartPatchQueueFixture(
      'anima',
      async (f) => {
        const { before, source, verified } = await terminalSource(f, 'failed')
        await assert.rejects(retry(f, source), /Controlled Retry interruption/)
        assert.deepEqual(await row(f, source.id), before)
        assert.equal((await rows(f)).length, 2)
        assert.deepEqual(await directories(f), [verified.bundle.id])
        const retained = await f.queue.loadVerifiedSmartPatchInput(source.id)
        assert.deepEqual(retained.payload, verified.payload)
        await preserved(f)
      },
      {
        [hook]: async () => {
          throw new Error('Controlled Retry interruption')
        },
      },
    )
  })
}

test('Smart Patch Retry filesystem copy refusal leaves the original source and sequence intact', async () => {
  // Boundary: real queue namespace publication. Invariant: a failed physical copy consumes no row.
  // Neighbor: model resolution still succeeds. Mutation: consume source before publishing files.
  await withSmartPatchQueueFixture('illustrious', async (f) => {
    const { before, source, verified } = await terminalSource(f)
    const backup = `${queueRoot(f)}.copy-fault`
    let obstructed = false
    const resolve = f.models.resolveVerifiedGenerationCheckpointForPlan
    const models: SmartPatchExecutionModelResolver = {
      ...f.models,
      resolveVerifiedGenerationCheckpointForPlan: async (reference) => {
        const resolved = await resolve(reference)
        if (!obstructed) {
          // Freeze the already-read source safely aside, then force a real directory-type error.
          await rename(queueRoot(f), backup)
          obstructed = true
          await writeFile(queueRoot(f), 'Controlled directory obstruction', {
            flag: 'wx',
            mode: 0o600,
          })
        }
        return resolved
      },
    }
    try {
      await assert.rejects(retry(f, source, { modelService: models }))
      assert.equal(obstructed, true, 'The refusal occurred after successful source verification')
    } finally {
      if (obstructed) {
        await unlink(queueRoot(f))
        await rename(backup, queueRoot(f))
      }
    }
    assert.deepEqual(await row(f, source.id), before)
    assert.equal((await rows(f)).length, 2)
    assert.deepEqual(await directories(f), [verified.bundle.id])
    assert.deepEqual(
      (await f.queue.loadVerifiedSmartPatchInput(source.id)).payload,
      verified.payload,
    )
    await preserved(f)
  })
})

for (const hook of ['afterRetryInputPublish', 'beforeRetryCommit'] as const) {
  test(`Smart Patch Retry rechecks the current document after ${hook}`, async () => {
    // Boundary: close/document guard across await and commit. Invariant: late close publishes no row.
    // Neighbor: source/sibling remain retryable. Mutation: check assertCurrent only at entry.
    let current = true
    await withSmartPatchQueueFixture(
      'illustrious',
      async (f) => {
        const { before, source, verified } = await terminalSource(f)
        await assert.rejects(
          retry(f, source, {
            assertCurrent: () => {
              if (!current) {
                throw new Error('Original document closed')
              }
            },
          }),
          /Original document closed/,
        )
        assert.deepEqual(await row(f, source.id), before)
        assert.equal((await rows(f)).length, 2)
        assert.deepEqual(await directories(f), [verified.bundle.id])
        await preserved(f)
      },
      {
        [hook]: async () => {
          current = false
        },
      },
    )
  })
}

test('Smart Patch Retry respects a Project fence raised after durable copy publication', async () => {
  // Boundary: synchronous close fence after an await. Invariant: no late SQL attempt escapes close.
  // Neighbor: lifting an ordinary fence permits a fresh explicit Retry. Mutation: entry-only fence.
  await withSmartPatchQueueFixture('anima', async (f) => {
    const { before, source, verified } = await terminalSource(f)
    let fence = true
    const queue = new GenerationQueueRepository(f.database.db, f.root, {
      afterRetryInputPublish: async () => {
        if (fence) {
          queue.fenceProject(source.localProjectKey)
        }
      },
    })
    await queue.recoverAfterRestart()
    await assert.rejects(retry({ ...f, queue }, source), { code: 'QUEUE_PROJECT_CLOSING' })
    assert.deepEqual(await row(f, source.id), before)
    assert.deepEqual(await directories(f), [verified.bundle.id])
    queue.releaseProjectFence(source.localProjectKey)
    fence = false
    const retried = await retry({ ...f, queue }, source)
    assert.equal(retried.status, 'pending')
    await preserved(f)
  })
})

for (const action of ['delete', 'prune'] as const) {
  test(`Smart Patch Retry cannot resurrect history removed by a concurrent ${action}`, async () => {
    // Boundary: another repository deletes source during files-first replay. Invariant: CAS refuses.
    // Neighbor: no unreferenced retry copy survives a known rollback. Mutation: insert without CAS.
    await withSmartPatchQueueFixture('illustrious', async (f) => {
      const gate = barrier()
      const queue = new GenerationQueueRepository(f.database.db, f.root, {
        afterRetryInputPublish: async () => {
          gate.enter()
          await gate.released
        },
      })
      const other = new GenerationQueueRepository(f.database.db, f.root)
      await queue.recoverAfterRestart()
      await other.recoverAfterRestart()
      const { items, source } = await terminalSource(f)
      for (const item of items) {
        if (item.id !== source.id) {
          const canceled = await other.getManagerEntry(item.id)
          await other.deleteTerminal(item.id, canceled.statusSequence)
        }
      }
      const pending = retry({ ...f, queue }, source)
      void pending.catch(() => undefined)
      try {
        await Promise.race([gate.entered, pending.then(() => assert.fail('Retry skipped barrier'))])
        assert.equal((await directories(f)).length, 2)
        if (action === 'delete') {
          await other.deleteTerminal(source.id, source.statusSequence)
        } else {
          assert.equal(await other.pruneTerminal(['canceled']), 1)
        }
        assert.equal((await rows(f)).length, 0)
        assert.equal((await directories(f)).length, 1, 'Only the active Retry copy remains pinned')
        gate.release()
        await assert.rejects(pending, { code: 'QUEUE_STATUS_CONFLICT' })
        assert.deepEqual(await rows(f), [])
        assert.deepEqual(await directories(f), [])
        await preserved(f)
      } finally {
        gate.release()
        await Promise.allSettled([pending])
      }
    })
  })
}

test('another repository recovery cannot sweep the unpublished active Smart Patch Retry copy', async () => {
  // Boundary: files-first publication versus startup GC. Invariant: active copy is pinned globally.
  // Neighbor: terminal source remains verifiable. Mutation: omit active bundle pin before publish.
  await withSmartPatchQueueFixture('anima', async (f) => {
    const gate = barrier()
    const queue = new GenerationQueueRepository(f.database.db, f.root, {
      afterRetryInputPublish: async () => {
        gate.enter()
        await gate.released
      },
    })
    await queue.recoverAfterRestart()
    const { source, verified } = await terminalSource(f)
    const pending = retry({ ...f, queue }, source)
    void pending.catch(() => undefined)
    try {
      await Promise.race([gate.entered, pending.then(() => assert.fail('Retry skipped barrier'))])
      const before = await directories(f)
      assert.equal(before.length, 2)
      const other = new GenerationQueueRepository(f.database.db, f.root)
      assert.deepEqual(await other.recoverAfterRestart(), {
        canceledCount: 0,
        orphanedDirectoriesRemoved: 0,
      })
      assert.deepEqual(await directories(f), before)
      const copyId = before.find((id) => id !== verified.bundle.id)!
      const copy = await new SmartPatchInputBundleRepository(f.root, {}, 'queue').load(copyId)
      assert.deepEqual(copy.manifest, verified.bundle.manifest)
      await other.loadVerifiedSmartPatchInput(source.id)
      gate.release()
      const retried = await pending
      const loaded = await other.loadVerifiedSmartPatchInput(retried.id)
      assert.equal(loaded.bundle.id, copyId)
      await assertCopy(f, verified, loaded)
      await preserved(f)
    } finally {
      gate.release()
      await Promise.allSettled([pending])
    }
  })
})

test('Smart Patch Retry reconciles a lost acknowledgement only from the exact committed frozen row', async () => {
  // Boundary: SQL commit -> lost response -> durable read. Invariant: exact success is returned once.
  // Neighbor: source error/history stay frozen. Mutation: report failure or insert a second attempt.
  await withSmartPatchQueueFixture(
    'illustrious',
    async (f) => {
      const { before, source, verified } = await terminalSource(f, 'failed')
      const retried = await retry(f, source)
      assert.equal(retried.status, 'pending')
      assert.equal(retried.statusSequence, 0)
      assert.equal((await rows(f)).length, 3)
      assert.equal((await row(f, source.id)).status_sequence, before.status_sequence + 1)
      await assertCopy(f, verified, await f.queue.loadVerifiedSmartPatchInput(retried.id))
      await assert.rejects(retry(f, source), { code: 'QUEUE_STATUS_CONFLICT' })
      assert.equal((await rows(f)).length, 3)
      await preserved(f)
    },
    {
      afterRetryCommit: async () => {
        throw new Error('Controlled lost Retry acknowledgement')
      },
    },
  )
})

for (const committed of [false, true]) {
  test(`Smart Patch Retry unreadable ${committed ? 'committed' : 'rolled-back'} outcome retains its copy and fences admission until recovery`, async () => {
    // Boundary: real SQL fault and outcome inspection. Invariant: unknown outcome retains inputs.
    // Neighbor: successful restart cancels work, without autoreplay. Mutation: delete unknown copy.
    await withSmartPatchQueueFixture('anima', async (f) => {
      let denyInspection = false
      const plugin: KyselyPlugin = {
        transformQuery: ({ node }) => {
          if (
            denyInspection &&
            node.kind === 'SelectQueryNode' &&
            JSON.stringify(node).includes('generation_queue_item')
          ) {
            throw new Error('Controlled SQLite outcome inspection unavailable')
          }
          return node
        },
        transformResult: async ({ result }) => result,
      }
      const loseOutcome = async () => {
        denyInspection = true
        throw new Error('Controlled unknown Retry outcome')
      }
      const queue = new GenerationQueueRepository(f.database.db.withPlugin(plugin), f.root, {
        ...(committed ? { afterRetryCommit: loseOutcome } : { beforeRetryCommit: loseOutcome }),
      })
      await queue.recoverAfterRestart()
      const { before, source, verified } = await terminalSource(f)
      await assert.rejects(retry({ ...f, queue }, source), { code: 'QUEUE_PUBLICATION_UNCERTAIN' })
      assert.equal((await rows(f)).length, committed ? 3 : 2)
      assert.equal(
        (await row(f, source.id)).status_sequence,
        before.status_sequence + (committed ? 1 : 0),
      )
      const retained = await directories(f)
      assert.equal(retained.length, 2)
      const copiedId = retained.find((id) => id !== verified.bundle.id)!
      const copy = await new SmartPatchInputBundleRepository(f.root, {}, 'queue').load(copiedId)
      assert.deepEqual(copy.manifest, verified.bundle.manifest)
      for (const [name, bytes] of Object.entries(verified.bundle.files)) {
        assert.ok(copy.files[name].equals(bytes), `${name} is retained while SQL is unknown`)
      }
      assert.throws(() => queue.assertProjectCanEnqueue(source.localProjectKey), {
        code: 'QUEUE_PUBLICATION_UNCERTAIN',
      })
      assert.throws(() => queue.assertReadyForDispatch(), { code: 'QUEUE_PUBLICATION_UNCERTAIN' })
      assert.throws(() => queue.releaseProjectFence(source.localProjectKey), {
        code: 'QUEUE_PUBLICATION_UNCERTAIN',
      })
      denyInspection = false
      assert.deepEqual(await queue.recoverAfterRestart(), {
        canceledCount: committed ? 1 : 0,
        orphanedDirectoriesRemoved: committed ? 0 : 1,
      })
      queue.releaseProjectFence(source.localProjectKey)
      queue.assertProjectCanEnqueue(source.localProjectKey)
      assert.equal((await directories(f)).length, committed ? 2 : 1)
      assert.equal((await queue.listManagerPage()).counts.pending, 0)
      assert.equal(await queue.claimNextPendingSmartPatch(), null)
      await preserved(f)
    })
  })
}

for (const changed of ['absent', 'mismatched'] as const) {
  test(`Smart Patch Retry retains and fences a definitely committed attempt whose row becomes ${changed} before lost acknowledgement`, async () => {
    // Boundary: commit succeeded but its acknowledgement witness changed. Invariant: no false rollback.
    // Neighbor: source sequence stays consumed. Mutation: treat an absent/mismatched row as uncommitted.
    await withSmartPatchQueueFixture('illustrious', async (f) => {
      let nextId = ''
      const queue = new GenerationQueueRepository(f.database.db, f.root, {
        afterRetryCommit: async () => {
          const inserted = (await rows(f)).find((entry) => entry.status === 'pending')!
          assert.ok(inserted)
          nextId = inserted.id
          // Controlled external SQL race: bypass cleanup so the lost-ack handler owns retention.
          await (changed === 'absent'
            ? f.database.db.deleteFrom('generation_queue_item').where('id', '=', nextId).execute()
            : f.database.db
                .updateTable('generation_queue_item')
                .set({ staging_session_id: randomUUID() })
                .where('id', '=', nextId)
                .execute())
          throw new Error('Controlled changed commit witness')
        },
      })
      await queue.recoverAfterRestart()
      const { before, source } = await terminalSource(f)
      await assert.rejects(retry({ ...f, queue }, source), { code: 'QUEUE_PUBLICATION_UNCERTAIN' })
      assert.ok(nextId)
      assert.equal((await row(f, source.id)).status_sequence, before.status_sequence + 1)
      assert.equal((await rows(f)).length, changed === 'absent' ? 2 : 3)
      assert.equal((await directories(f)).length, 2, 'Uncertain committed copy is retained')
      assert.throws(() => queue.assertProjectCanEnqueue(source.localProjectKey), {
        code: 'QUEUE_PUBLICATION_UNCERTAIN',
      })
      assert.throws(() => queue.assertReadyForDispatch(), { code: 'QUEUE_PUBLICATION_UNCERTAIN' })
      assert.throws(() => queue.releaseProjectFence(source.localProjectKey), {
        code: 'QUEUE_PUBLICATION_UNCERTAIN',
      })
      assert.deepEqual(await queue.recoverAfterRestart(), {
        canceledCount: changed === 'absent' ? 0 : 1,
        orphanedDirectoriesRemoved: changed === 'absent' ? 1 : 0,
      })
      queue.releaseProjectFence(source.localProjectKey)
      await preserved(f)
    })
  })
}

test('Smart Patch Retry requires exact source rollback evidence when the retry row is absent', async () => {
  // Boundary: transaction rollback -> source outcome inspection. Invariant: source must be exact.
  // Neighbor: a normal rollback is covered separately. Mutation: absent new row alone permits GC.
  await withSmartPatchQueueFixture('anima', async (f) => {
    const { before, source } = await terminalSource(f)
    let inspecting = false
    const plugin: KyselyPlugin = {
      transformQuery: ({ node }) => node,
      transformResult: async ({ result }) => {
        // Only the independent post-rollback SELECT of the original source loses its witness.
        // Actual transaction/rollback/new-row absence remain real SQLite observations.
        if (
          inspecting &&
          result.rows.some(
            (entry) =>
              entry !== null &&
              typeof entry === 'object' &&
              'id' in entry &&
              entry.id === source.id,
          )
        ) {
          throw new Error('Controlled source rollback witness unavailable')
        }
        return result
      },
    }
    const queue = new GenerationQueueRepository(f.database.db.withPlugin(plugin), f.root, {
      beforeRetryCommit: async () => {
        inspecting = true
        throw new Error('Controlled Retry rollback with unavailable source witness')
      },
    })
    await queue.recoverAfterRestart()
    await assert.rejects(retry({ ...f, queue }, source), { code: 'QUEUE_PUBLICATION_UNCERTAIN' })
    assert.deepEqual(await row(f, source.id), before)
    assert.equal((await rows(f)).length, 2)
    assert.equal((await directories(f)).length, 2)
    assert.throws(() => queue.releaseProjectFence(source.localProjectKey), {
      code: 'QUEUE_PUBLICATION_UNCERTAIN',
    })
    inspecting = false
    assert.deepEqual(await queue.recoverAfterRestart(), {
      canceledCount: 0,
      orphanedDirectoriesRemoved: 1,
    })
    queue.releaseProjectFence(source.localProjectKey)
    await preserved(f)
  })
})

for (const timing of ['before', 'after-copy'] as const) {
  for (const status of ['reserved', 'completed'] as const) {
    test(`Smart Patch Retry refuses any ${status} receipt arriving ${timing}`, async () => {
      // Boundary: receipt lookup and SQL CAS. Invariant: any receipt forbids a new attempt.
      // Neighbor: receipt and original terminal input survive. Mutation: guard reserved receipts only.
      await withSmartPatchQueueFixture('illustrious', async (f) => {
        const { before, source, verified } = await terminalSource(f)
        const queue = new GenerationQueueRepository(
          f.database.db,
          f.root,
          timing === 'after-copy'
            ? {
                afterRetryInputPublish: async () => {
                  await insertReceipt(f, source, status)
                },
              }
            : {},
        )
        await queue.recoverAfterRestart()
        if (timing === 'before') {
          await insertReceipt(f, source, status)
        }
        await assert.rejects(retry({ ...f, queue }, source), {
          code: timing === 'before' ? 'QUEUE_PUBLICATION_UNCERTAIN' : 'QUEUE_STATUS_CONFLICT',
        })
        assert.deepEqual(await row(f, source.id), before)
        assert.equal((await rows(f)).length, 2)
        assert.deepEqual(await directories(f), [verified.bundle.id])
        const receipt = await f.database.db
          .selectFrom('generation_candidate_receipt')
          .selectAll()
          .where('queue_item_id', '=', source.id)
          .executeTakeFirstOrThrow()
        assert.equal(receipt.status, status)
        assert.equal(receipt.staging_session_id, source.stagingSessionId)
        assert.equal(receipt.frozen_payload_sha256, digest(Buffer.from(before.frozen_payload_json)))
        await preserved(f, 1)
      })
    })
  }
}

for (const damage of ['missing', 'corrupt'] as const) {
  test(`Smart Patch Retry refuses ${damage} original PNGs without consuming the terminal source`, async () => {
    // Boundary: actual fixed-role file verification. Invariant: frozen pixels cannot be substituted.
    // Neighbor: restoring the exact bytes permits replay. Mutation: trust manifest metadata alone.
    await withSmartPatchQueueFixture('anima', async (f) => {
      const { before, source, verified } = await terminalSource(f)
      const file = path.join(queueRoot(f), verified.bundle.id, 'source.png')
      const bytes = await readFile(file)
      if (damage === 'missing') {
        await unlink(file)
      } else {
        const replaced = Buffer.from(bytes)
        replaced[replaced.length - 1] ^= 1
        await writeFile(file, replaced)
      }
      await assert.rejects(retry(f, source), { code: 'QUEUE_INPUT_INVALID' })
      assert.deepEqual(await row(f, source.id), before)
      assert.equal((await rows(f)).length, 2)
      assert.deepEqual(await directories(f), [verified.bundle.id])
      await writeFile(file, bytes, { mode: 0o600 })
      const loaded = await f.queue.loadVerifiedSmartPatchInput((await retry(f, source)).id)
      await assertCopy(f, verified, loaded)
      await preserved(f)
    })
  })
}

for (const family of ['illustrious', 'anima'] as const) {
  for (const damage of ['missing', 'corrupt'] as const) {
    test(`${family} Smart Patch Retry refuses ${damage} exact model files and keeps source replayable`, async () => {
      // Boundary: real model-file requalification. Invariant: no substituted exact resource.
      // Neighbor: restoring original bytes permits replay. Mutation: reuse initial catalog readiness.
      await withSmartPatchQueueFixture(family, async (f) => {
        const { before, source, verified } = await terminalSource(f)
        const inference = verified.payload.item
        const file =
          inference.family === 'anima'
            ? inference.inference.model.checkpoint.path
            : inference.inference.checkpoint.path
        const bytes = await readFile(file)
        try {
          await (damage === 'missing'
            ? unlink(file)
            : writeFile(file, Buffer.alloc(bytes.length, 0x78)))
          await assert.rejects(retry(f, source))
          assert.deepEqual(await row(f, source.id), before)
          assert.equal((await rows(f)).length, 2)
          assert.deepEqual(await directories(f), [verified.bundle.id])
        } finally {
          await writeFile(file, bytes, { mode: 0o600 })
        }
        await retry(f, source)
        await preserved(f)
      })
    })
  }
}

test('Smart Patch Retry requalifies a same-SHA resource policy again after publishing its copy', async () => {
  // Boundary: async resource replacement -> SQL admission. Invariant: effective frozen policy is exact.
  // Neighbor: restored policy replays successfully. Mutation: only reverify before the copy await.
  let changed = false
  await withSmartPatchQueueFixture('illustrious', async (f) => {
    const { before, source, verified } = await terminalSource(f)
    const original = f.models.resolveVerifiedGenerationCheckpointForPlan
    const models: SmartPatchExecutionModelResolver = {
      ...f.models,
      resolveVerifiedGenerationCheckpointForPlan: async (reference) => {
        const resolved = await original(reference)
        return changed
          ? {
              ...resolved,
              noiseProfile: { ...defaultIllustriousNoiseProfile(), timestepSpacing: 'trailing' },
            }
          : resolved
      },
    }
    const queue = new GenerationQueueRepository(f.database.db, f.root, {
      afterRetryInputPublish: async () => {
        changed = true
      },
    })
    await queue.recoverAfterRestart()
    await assert.rejects(retry({ ...f, queue }, source, { modelService: models }), {
      code: 'GENERATION_RESOURCE_CHANGED',
    })
    assert.deepEqual(await row(f, source.id), before)
    assert.equal((await rows(f)).length, 2)
    assert.deepEqual(await directories(f), [verified.bundle.id])
    changed = false
    await retry(f, source, { modelService: models })
    await preserved(f)
  })
})

test('Smart Patch Retry refuses crossed payload and row identities before publishing a copy', async () => {
  // Boundary: strict row/bundle binding. Invariant: document/hash/index/family must agree exactly.
  // Neighbor: restoring the untouched original replays. Mutation: trust a plausible payload alone.
  await withSmartPatchQueueFixture('illustrious', async (f) => {
    const { before, source, verified } = await terminalSource(f)
    for (const field of ['document', 'revision', 'hash', 'index', 'bundle', 'family'] as const) {
      const payload = JSON.parse(before.frozen_payload_json)
      if (field === 'document') {
        payload.context.documentId = randomUUID()
      }
      if (field === 'revision') {
        payload.context.documentRevision = randomUUID()
      }
      if (field === 'hash') {
        payload.bundle.manifestSha256 = 'f'.repeat(64)
      }
      if (field === 'index') {
        payload.bundle.itemIndex = 0
      }
      if (field === 'bundle') {
        payload.bundle.id = randomUUID()
      }
      if (field === 'family') {
        payload.kind = 'anima-smart-patch'
      }
      await f.database.db
        .updateTable('generation_queue_item')
        .set({ frozen_payload_json: JSON.stringify(payload) })
        .where('id', '=', source.id)
        .execute()
      try {
        await assert.rejects(retry(f, source), { code: 'QUEUE_INPUT_INVALID' }, field)
        assert.equal((await row(f, source.id)).status_sequence, before.status_sequence)
        assert.equal((await rows(f)).length, 2)
        assert.deepEqual(await directories(f), [verified.bundle.id])
      } finally {
        await f.database.db
          .updateTable('generation_queue_item')
          .set({ frozen_payload_json: before.frozen_payload_json })
          .where('id', '=', source.id)
          .execute()
      }
    }
    for (const field of [
      'document_id',
      'document_revision',
      'local_project_key',
      'operation',
    ] as const) {
      const value =
        field === 'operation'
          ? 'anima-smart-patch'
          : field === 'local_project_key'
            ? `project-v1-${'f'.repeat(64)}`
            : randomUUID()
      await f.database.db
        .updateTable('generation_queue_item')
        .set({ [field]: value })
        .where('id', '=', source.id)
        .execute()
      try {
        await assert.rejects(retry(f, source), field)
        assert.equal((await row(f, source.id)).status_sequence, before.status_sequence)
        assert.equal((await rows(f)).length, 2)
      } finally {
        await f.database.db
          .updateTable('generation_queue_item')
          .set({ [field]: before[field] })
          .where('id', '=', source.id)
          .execute()
      }
    }
    await retry(f, source)
    await preserved(f)
  })
})

test('Smart Patch Retry CAS refuses a source payload replaced after copy publication without consuming it', async () => {
  // Boundary: original frozen SQL identity changes after verification. Invariant: exact source CAS.
  // Neighbor: semantically equal valid payload still owns its original bundle. Mutation: ID/sequence-only CAS.
  await withSmartPatchQueueFixture('anima', async (f) => {
    const { before, source, verified } = await terminalSource(f)
    const replacement = JSON.stringify(JSON.parse(before.frozen_payload_json), null, 1)
    assert.notEqual(replacement, before.frozen_payload_json)
    const queue = new GenerationQueueRepository(f.database.db, f.root, {
      afterRetryInputPublish: async () => {
        await f.database.db
          .updateTable('generation_queue_item')
          .set({ frozen_payload_json: replacement })
          .where('id', '=', source.id)
          .execute()
      },
    })
    await queue.recoverAfterRestart()
    await assert.rejects(retry({ ...f, queue }, source), { code: 'QUEUE_STATUS_CONFLICT' })
    assert.deepEqual(await row(f, source.id), { ...before, frozen_payload_json: replacement })
    assert.equal((await rows(f)).length, 2)
    assert.deepEqual(await directories(f), [verified.bundle.id])
    await f.queue.loadVerifiedSmartPatchInput(source.id)
    await preserved(f)
  })
})

test('Smart Patch Retry refuses a noncanonical original Project path', async () => {
  // Boundary: actual filesystem canonicalization. Invariant: original local identity cannot change.
  // Neighbor: the real saved Project is intact. Mutation: trust any path resolving to the same file.
  await withSmartPatchQueueFixture('anima', async (f) => {
    const { before, source, verified } = await terminalSource(f)
    const alias = path.join(f.root, 'alias.igs')
    await symlink(f.projectPath, alias)
    await f.database.db
      .updateTable('generation_queue_item')
      .set({ canonical_project_path: alias })
      .where('id', '=', source.id)
      .execute()
    await assert.rejects(retry(f, source), { code: 'QUEUE_PROJECT_IDENTITY_CHANGED' })
    assert.equal((await row(f, source.id)).status_sequence, before.status_sequence)
    assert.equal((await rows(f)).length, 2)
    assert.deepEqual(await directories(f), [verified.bundle.id])
    await f.database.db
      .updateTable('generation_queue_item')
      .set({ canonical_project_path: before.canonical_project_path })
      .where('id', '=', source.id)
      .execute()
    await unlink(alias)
    await preserved(f)
  })
})

test('Smart Patch Retry rejects pending running and completed source revisions', async () => {
  // Boundary: reviewed terminal-state admission. Invariant: only failed/canceled sources replay.
  // Neighbor: restored canceled source succeeds. Mutation: broaden status guard to any revision.
  await withSmartPatchQueueFixture('illustrious', async (f) => {
    const { before, source, verified } = await terminalSource(f)
    for (const status of ['pending', 'running', 'completed'] as const) {
      // Controlled preconditions only; the Retry operation and refusal use the real repository.
      await f.database.db
        .updateTable('generation_queue_item')
        .set({ status })
        .where('id', '=', source.id)
        .execute()
      await assert.rejects(retry(f, source), { code: 'QUEUE_STATUS_CONFLICT' })
      assert.equal((await row(f, source.id)).status_sequence, before.status_sequence)
      assert.equal((await rows(f)).length, 2)
      assert.deepEqual(await directories(f), [verified.bundle.id])
    }
    await f.database.db
      .updateTable('generation_queue_item')
      .set({ status: before.status })
      .where('id', '=', source.id)
      .execute()
    await retry(f, source)
    await preserved(f)
  })
})

test('Smart Patch Retry captures current guard and model resolver methods before its first await', async () => {
  // Boundary: mutable caller options crossing async work. Invariant: collaborators cannot retarget.
  // Neighbor: durable input remains unchanged. Mutation: read options/model methods after an await.
  await withSmartPatchQueueFixture('illustrious', async (f) => {
    const { source, verified } = await terminalSource(f)
    const models = { ...f.models }
    const options = { assertCurrent: () => undefined, modelService: models }
    const pending = f.queue.retryPreparedSmartPatchTerminal(
      source.id,
      source.statusSequence,
      options,
    )
    options.assertCurrent = () => {
      throw new Error('Late guard alias must not run')
    }
    models.resolveVerifiedGenerationCheckpointForPlan = async () => {
      throw new Error('Late resolver alias must not run')
    }
    const retried = await pending
    await assertCopy(f, verified, await f.queue.loadVerifiedSmartPatchInput(retried.id))
    await preserved(f)
  })
})

test('ordinary readers and ordinary Retry still refuse Smart Patch while an actual ordinary neighbor retries and dispatches', async () => {
  // Boundary: typed readers/Retry and shared queue. Invariant: Smart input stays with its owner.
  // Neighbor: actual normal replay and claim succeed. Mutation: admit Smart payload into ordinary flow.
  await withSmartPatchQueueFixture('illustrious', async (f) => {
    const { source } = await terminalSource(f)
    const smart = await retry(f, source)
    for (const item of [source, smart]) {
      await assert.rejects(f.queue.loadVerifiedInput(item.id), { code: 'QUEUE_INPUT_INVALID' })
      await assert.rejects(f.queue.loadVerifiedRetryInput(item.id), { code: 'QUEUE_INPUT_INVALID' })
    }
    const canceledSmart = await f.queue.cancel(smart.id)
    await assert.rejects(f.queue.retryTerminal(canceledSmart.id, canceledSmart.statusSequence), {
      code: 'QUEUE_INPUT_INVALID',
    })
    const normalItems = (await enqueueAnimaStagingBatch({ ...f, queue: f.queue })).items
    const normal = normalItems[0]
    for (const sibling of normalItems.slice(1)) {
      await f.queue.cancel(sibling.id)
    }
    await f.queue.loadVerifiedInput(normal.id)
    const canceledNormal = await f.queue.cancel(normal.id)
    await assert.rejects(retry(f, canceledNormal), { code: 'QUEUE_INPUT_INVALID' })
    const ordinary = await f.queue.retryTerminal(normal.id, canceledNormal.statusSequence)
    await f.queue.loadVerifiedRetryInput(ordinary.id)
    const pendingSmart = await retry(f, canceledSmart)
    assert.equal(await f.queue.hasDispatchablePending(), true)
    const claimed = await f.queue.claimNextPending()
    assert.equal(claimed?.item.id, ordinary.id)
    assert.equal((await f.queue.getManagerEntry(pendingSmart.id)).status, 'pending')
    await preserved(f)
  })
})
