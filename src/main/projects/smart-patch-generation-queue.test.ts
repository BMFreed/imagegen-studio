import { compileAnimaFlowSamplingPlan } from '../../shared/projects/anima-flow-sampling-plan.js'
import { isGenerationQueuePage } from '../../shared/projects/generation-queue-manager.js'
import { defaultIllustriousNoiseProfile } from '../../shared/projects/illustrious-noise-profile.js'

import type { KyselyPlugin } from 'kysely'

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import type { GenerationQueueTestHooks } from './generation-queue.js'
import type { SmartPatchExecutionModelResolver } from './project-smart-patch-execution.js'
import type { SmartPatchInputMaterial } from './smart-patch-frozen-input.js'
import type { AnimaStagingFixture } from './test-fixtures/anima-staging.js'

import { GenerationQueueRepository } from './generation-queue.js'
import { localProjectRecoveryKey } from './project-identity.js'
import { SmartPatchInputBundleRepository } from './project-smart-patch-input-bundle.js'
import { captureSmartPatchInputMaterial } from './smart-patch-frozen-input.js'
import { enqueueAnimaStagingBatch, withAnimaStagingFixture } from './test-fixtures/anima-staging.js'
import { literalSmartPatchPreparedInput } from './test-fixtures/smart-patch-input-material.js'

type Family = 'anima' | 'illustrious'
type Fixture = Omit<AnimaStagingFixture, 'queue'> & {
  material: SmartPatchInputMaterial
  models: SmartPatchExecutionModelResolver
  queue: GenerationQueueRepository
}
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const queueRoot = (f: Fixture) => path.join(f.root, 'generation-queued-inputs', 'smart-patch')
const directories = async (f: Fixture) => await readdir(queueRoot(f)).catch(() => [])

/**
 * Actual SQLite/Project/files, literal PNG inputs and a declared exact-file catalog resolver. The
 * resolver checks real file identities; these bytes are not trained model/header qualification.
 */
async function fixture(
  family: Family,
  run: (f: Fixture) => Promise<void>,
  hooks: GenerationQueueTestHooks = {},
) {
  await withAnimaStagingFixture(async (normal) => {
    const { executions, prepared } = literalSmartPatchPreparedInput(family, 'inpaint')
    prepared.context.projectKey = localProjectRecoveryKey(normal.projectPath)
    prepared.context.documentId = normal.prepared.context.documentId
    prepared.context.documentRevision = normal.prepared.context.documentRevision
    const unused = async (): Promise<never> => {
      throw new Error('An unselected resource must not resolve')
    }
    const models: SmartPatchExecutionModelResolver = {
      assertNoUnboundGenerationEmbeddings: async () => undefined,
      resolveVerifiedAnimaGenerationLoraForPlan: unused,
      resolveVerifiedGenerationAnimaBundleForPlan: unused,
      resolveVerifiedGenerationCheckpointForPlan: unused,
      resolveVerifiedGenerationEmbeddingForPlan: unused,
      resolveVerifiedGenerationLoraForPlan: unused,
      resolveVerifiedGenerationVaeForPlan: unused,
    }
    if (family === 'anima') {
      const bundle = normal.prepared.context.model
      prepared.context.generationDraft.model = structuredClone(bundle.checkpoint.reference)
      const request = executions[0].request
      assert.equal(request.family, 'anima')
      if (request.family !== 'anima') {
        assert.fail('Anima fixture request')
      }
      const component = (entry: { byteSize: number; managedPath: string; sha256: string }) => ({
        byteSize: entry.byteSize,
        path: entry.managedPath,
        sha256: entry.sha256,
      })
      request.inference = {
        ...request.inference,
        model: {
          architecture: bundle.architecture,
          checkpoint: {
            byteSize: bundle.checkpoint.byteSize,
            path: bundle.checkpoint.managedPath,
            sha256: bundle.checkpoint.reference.fileSha256,
          },
          qwen3Encoder: component(bundle.qwen3Encoder),
          vae: component(bundle.vae),
        },
      }
      models.resolveVerifiedGenerationAnimaBundleForPlan =
        normal.modelService.resolveVerifiedGenerationAnimaBundleForPlan.bind(normal.modelService)
    } else {
      const file = path.join(normal.root, 'smart-patch-checkpoint.safetensors')
      const bytes = Buffer.from('declared exact checkpoint fixture, not trained weights')
      await writeFile(file, bytes)
      const reference = prepared.context.generationDraft.model!
      reference.fileSha256 = digest(bytes)
      const request = executions[0].request
      if (request.family !== 'illustrious') {
        assert.fail('Illustrious fixture request')
      }
      request.inference.checkpoint = {
        path: file,
        predictionType: 'v_prediction',
        sha256: digest(bytes),
      }
      models.resolveVerifiedGenerationCheckpointForPlan = async (saved) => {
        const actual = await readFile(file)
        assert.equal(
          digest(actual),
          reference.fileSha256,
          'The exact managed checkpoint bytes changed',
        )
        assert.equal(saved.fileSha256, reference.fileSha256)
        return {
          managedPath: file,
          noiseProfile: defaultIllustriousNoiseProfile(),
          reference: { ...structuredClone(reference), predictionType: 'v_prediction' },
        }
      }
    }
    const second = structuredClone(executions[0])
    second.item.seed = 1
    if (second.request.family === 'anima') {
      second.request.inference = {
        ...second.request.inference,
        sampling: compileAnimaFlowSamplingPlan({
          guidanceScale: 4,
          height: 64,
          mode: 'img2img',
          scheduler: 'euler',
          seed: 1,
          steps: 3,
          strength: 0.5,
          width: 64,
        }),
      }
    } else {
      second.request.inference.sampling.seed = 1
    }
    const material = await captureSmartPatchInputMaterial(prepared, [executions[0], second])
    const queue = new GenerationQueueRepository(normal.database.db, normal.root, hooks)
    await queue.recoverAfterRestart()
    await run({ ...normal, material, models, queue })
  })
}

function admit(
  f: Fixture,
  overrides: Partial<
    Parameters<GenerationQueueRepository['enqueuePreparedSmartPatchBatch']>[0]
  > = {},
) {
  return f.queue.enqueuePreparedSmartPatchBatch({
    assertCurrent: () => undefined,
    material: f.material,
    modelService: f.models,
    projectPath: f.projectPath,
    stagingSessionId: randomUUID(),
    ...overrides,
  })
}
async function preserved(f: Fixture) {
  assert.ok(
    (await readFile(f.projectPath)).equals(f.originalProjectBytes),
    'Queue admission never changes saved .igs bytes',
  )
  assert.equal(
    (await f.database.db.selectFrom('generation_candidate_receipt').selectAll().execute()).length,
    0,
  )
  assert.equal(
    (await f.database.db.selectFrom('generation_seed_cursor').selectAll().execute()).length,
    0,
  )
}

for (const family of ['illustrious', 'anima'] as const) {
  test(`actual ${family} Smart Patch queue shares one independent bundle and reloads concrete frozen inputs after caller discard`, async () => {
    await fixture(family, async (f) => {
      const source = new SmartPatchInputBundleRepository(f.root)
      const prepared = await source.publish(f.material)
      const items = await admit(f, { material: prepared })
      assert.equal(items.length, 2)
      assert.equal(new Set(items.map((item) => item.batchId)).size, 1)
      assert.equal((await directories(f)).length, 1)
      const first = await f.queue.loadVerifiedSmartPatchInput(items[0].id)
      assert.notEqual(first.bundle.id, prepared.id, 'The queue owns an independent copy')
      await source.discard(prepared.id, prepared.manifestSha256)
      const fresh = new GenerationQueueRepository(f.database.db, f.root)
      for (const [index, item] of items.entries()) {
        const loaded = await fresh.loadVerifiedSmartPatchInput(item.id)
        assert.equal(loaded.bundle.id, first.bundle.id)
        assert.equal(loaded.payload.bundle.itemIndex, index)
        assert.equal(loaded.payload.item.item.seed, index)
        assert.deepEqual(loaded.payload.context.bbox, f.material.manifest.context.bbox)
        assert.deepEqual(loaded.payload.context.internalResolution, { height: 64, width: 64 })
        for (const [name, bytes] of Object.entries(f.material.files)) {
          assert.ok(
            loaded.bundle.files[name].equals(bytes),
            `Actual ${name} survives independently`,
          )
        }
      }
      const page = await f.queue.listManagerPage()
      assert.equal(isGenerationQueuePage(page), true)
      assert.equal(page.counts.pending, 2)
      assert.ok(page.items.every((entry) => entry.operation === `${family}-smart-patch`))
      const action = await f.queue.listUnfinishedActionJobsByProjectDocument(
        first.item.localProjectKey,
        first.payload.context.documentId,
      )
      assert.deepEqual(
        action.map((entry) => entry.seed),
        [0, 1],
      )
      assert.equal(await f.queue.hasDispatchablePending(), false)
      assert.equal(await f.queue.claimNextPending(), null)
      await preserved(f)
    })
  })
}

test('gated Smart Patch pending rows cannot block an actual ordinary neighbor claim or enter ordinary load Retry and staging', async () => {
  await fixture('illustrious', async (f) => {
    const smart = await admit(f)
    const normal = await enqueueAnimaStagingBatch({ ...f, queue: f.queue })
    assert.equal(await f.queue.hasDispatchablePending(), true)
    const claimed = await f.queue.claimNextPending()
    assert.equal(claimed?.item.id, normal.items[0].id)
    for (const item of smart) {
      assert.equal((await f.queue.getManagerEntry(item.id)).status, 'pending')
      await assert.rejects(f.queue.loadVerifiedInput(item.id), { code: 'QUEUE_INPUT_INVALID' })
      await assert.rejects(f.queue.loadVerifiedRetryInput(item.id), { code: 'QUEUE_INPUT_INVALID' })
      const canceled = await f.queue.cancel(item.id)
      await assert.rejects(f.queue.retryTerminal(item.id, canceled.statusSequence), {
        code: 'QUEUE_INPUT_INVALID',
      })
      await assert.rejects(
        f.staging.publishGenerationCandidate({
          actualSeed: 0,
          expectedProvisionalRoot: f.scratch,
          expectedStatusSequence: 1,
          provisionalOutputPath: path.join(f.scratch, 'result.png'),
          queueItemId: item.id,
        }),
        { code: 'QUEUE_INPUT_INVALID' },
      )
    }
    await preserved(f)
  })
})

test('Smart Patch queue transaction rollback admits no prefix and removes only its own unused bundle', async () => {
  await fixture(
    'illustrious',
    async (f) => {
      const source = await new SmartPatchInputBundleRepository(f.root).publish(f.material)
      await assert.rejects(admit(f), /Controlled rollback after all row inserts/)
      assert.equal(
        (await f.database.db.selectFrom('generation_queue_item').selectAll().execute()).length,
        0,
      )
      assert.deepEqual(await directories(f), [])
      assert.equal(
        (await new SmartPatchInputBundleRepository(f.root).load(source.id)).manifestSha256,
        source.manifestSha256,
      )
      await preserved(f)
    },
    {
      beforeBatchCommit: async () => {
        throw new Error('Controlled rollback after all row inserts')
      },
    },
  )
})

test('lost Smart Patch batch acknowledgement returns the complete exact committed row set', async () => {
  await fixture(
    'anima',
    async (f) => {
      const items = await admit(f)
      assert.equal(items.length, 2)
      assert.equal((await directories(f)).length, 1)
      const rows = await f.database.db.selectFrom('generation_queue_item').selectAll().execute()
      assert.deepEqual(rows.map((row) => row.id).sort(), items.map((row) => row.id).sort())
      for (const item of items) {
        await f.queue.loadVerifiedSmartPatchInput(item.id)
      }
      await preserved(f)
    },
    {
      afterBatchCommit: async () => {
        throw new Error('Controlled lost commit acknowledgement')
      },
    },
  )
})

test('Smart Patch cancellation restart and terminal pruning retain a shared bundle until the last sibling is gone', async () => {
  await fixture('illustrious', async (f) => {
    const sourceRepository = new SmartPatchInputBundleRepository(f.root)
    const source = await sourceRepository.publish(f.material)
    const items = await admit(f)
    const bundleId = (await f.queue.loadVerifiedSmartPatchInput(items[0].id)).bundle.id
    const first = await f.queue.cancel(items[0].id)
    await f.queue.deleteTerminal(first.id, first.statusSequence)
    assert.deepEqual(await directories(f), [bundleId])
    await f.queue.loadVerifiedSmartPatchInput(items[1].id)
    const fresh = new GenerationQueueRepository(f.database.db, f.root)
    const recovered = await fresh.recoverAfterRestart()
    assert.equal(recovered.canceledCount, 1)
    assert.equal((await fresh.getManagerEntry(items[1].id)).error?.code, 'APP_RESTART')
    assert.equal(await fresh.pruneTerminal(['canceled']), 1)
    assert.deepEqual(await directories(f), [])
    assert.equal((await sourceRepository.load(source.id)).manifestSha256, source.manifestSha256)
    await preserved(f)
  })
})

test('corrupted Smart Patch bundle is refused and retained through terminal pruning and restart cleanup', async () => {
  await fixture('anima', async (f) => {
    const items = await admit(f)
    const loaded = await f.queue.loadVerifiedSmartPatchInput(items[0].id)
    const source = path.join(queueRoot(f), loaded.bundle.id, 'source.png')
    await writeFile(source, Buffer.from('corrupt owned pixels'))
    await assert.rejects(f.queue.loadVerifiedSmartPatchInput(items[0].id))
    for (const item of items) {
      await f.queue.cancel(item.id)
    }
    assert.equal(await f.queue.pruneTerminal(['canceled']), 2)
    assert.equal(await readFile(source, 'utf8'), 'corrupt owned pixels')
    await new GenerationQueueRepository(f.database.db, f.root).recoverAfterRestart()
    assert.equal(await readFile(source, 'utf8'), 'corrupt owned pixels')
    await preserved(f)
  })
})

test('same-SHA resource policy change before SQL commit refuses the whole Smart Patch admission', async () => {
  await fixture('illustrious', async (f) => {
    let changed = false
    const original = f.models.resolveVerifiedGenerationCheckpointForPlan
    f.models.resolveVerifiedGenerationCheckpointForPlan = async (reference) => {
      const resolved = await original(reference)
      return changed
        ? {
            ...resolved,
            noiseProfile: { ...defaultIllustriousNoiseProfile(), timestepSpacing: 'trailing' },
          }
        : resolved
    }
    await assert.rejects(
      admit(f, {
        beforeCommit: async () => {
          changed = true
        },
      }),
      { code: 'GENERATION_RESOURCE_CHANGED' },
    )
    assert.equal(
      (await f.database.db.selectFrom('generation_queue_item').selectAll().execute()).length,
      0,
    )
    assert.deepEqual(await directories(f), [])
    await preserved(f)
  })
})

test('late current-target refusal rolls back Smart Patch admission without deleting the caller prepared bundle', async () => {
  await fixture('illustrious', async (f) => {
    let current = true
    const prepared = await new SmartPatchInputBundleRepository(f.root).publish(f.material)
    await assert.rejects(
      admit(f, {
        assertCurrent: () => {
          if (!current) {
            throw new Error('Captured target was locked or hidden')
          }
        },
        beforeCommit: async () => {
          current = false
        },
        material: prepared,
      }),
      /locked or hidden/,
    )
    assert.equal(
      (await f.database.db.selectFrom('generation_queue_item').selectAll().execute()).length,
      0,
    )
    assert.deepEqual(await directories(f), [])
    await new SmartPatchInputBundleRepository(f.root).load(prepared.id)
    await preserved(f)
  })
})

for (const committed of [false, true]) {
  test(`unreadable Smart Patch ${committed ? 'committed' : 'rolled-back'} admission keeps inputs and fences the Project until recovery`, async () => {
    await fixture('illustrious', async (f) => {
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
        throw new Error('Controlled unknown batch outcome')
      }
      const queue = new GenerationQueueRepository(f.database.db.withPlugin(plugin), f.root, {
        ...(committed ? { afterBatchCommit: loseOutcome } : { beforeBatchCommit: loseOutcome }),
      })
      await queue.recoverAfterRestart()
      await assert.rejects(admit({ ...f, queue }), { code: 'QUEUE_PUBLICATION_UNCERTAIN' })
      const rows = await f.database.db.selectFrom('generation_queue_item').selectAll().execute()
      assert.equal(rows.length, committed ? 2 : 0)
      assert.equal((await directories(f)).length, 1)
      assert.throws(() => queue.assertProjectCanEnqueue(f.material.manifest.context.projectKey), {
        code: 'QUEUE_PUBLICATION_UNCERTAIN',
      })
      assert.throws(() => queue.assertReadyForDispatch(), { code: 'QUEUE_PUBLICATION_UNCERTAIN' })
      assert.throws(() => queue.releaseProjectFence(f.material.manifest.context.projectKey), {
        code: 'QUEUE_PUBLICATION_UNCERTAIN',
      })
      denyInspection = false
      const recovery = await queue.recoverAfterRestart()
      assert.equal(recovery.canceledCount, committed ? 2 : 0)
      assert.equal(recovery.orphanedDirectoriesRemoved, committed ? 0 : 1)
      assert.equal((await directories(f)).length, committed ? 1 : 0)
      queue.releaseProjectFence(f.material.manifest.context.projectKey)
      await preserved(f)
    })
  })
}

test('another repository restart sweep cannot reclaim a queue bundle during files-first admission', async () => {
  await fixture('anima', async (f) => {
    let entered!: () => void
    const didEnter = new Promise<void>((resolve) => {
      entered = resolve
    })
    let release!: () => void
    const released = new Promise<void>((resolve) => {
      release = resolve
    })
    const pending = admit(f, {
      beforeCommit: async () => {
        entered()
        await released
      },
    })
    void pending.catch(() => undefined)
    try {
      await Promise.race([
        didEnter,
        pending.then(() => assert.fail('Admission committed before its files-first barrier')),
      ])
      assert.equal((await directories(f)).length, 1)
      const other = new GenerationQueueRepository(f.database.db, f.root)
      const recovery = await other.recoverAfterRestart()
      assert.equal(recovery.orphanedDirectoriesRemoved, 0)
      assert.equal(
        (await directories(f)).length,
        1,
        'The admitted shared input remains pinned before its SQL commit',
      )
      release()
      const items = await pending
      assert.equal(items.length, 2)
      for (const item of items) {
        await other.loadVerifiedSmartPatchInput(item.id)
      }
      await preserved(f)
    } finally {
      release()
      await Promise.allSettled([pending])
    }
  })
})

test('startup reclaims only fully verified unreferenced queue bundles and retains incomplete reservations', async () => {
  await fixture('illustrious', async (f) => {
    const source = await new SmartPatchInputBundleRepository(f.root).publish(f.material)
    const orphan = await new SmartPatchInputBundleRepository(f.root, {}, 'queue').publish(
      f.material,
    )
    const incompleteId = randomUUID()
    await mkdir(path.join(queueRoot(f), incompleteId), { mode: 0o700 })
    await writeFile(path.join(queueRoot(f), incompleteId, 'source.png'), 'incomplete reservation', {
      mode: 0o600,
    })
    const fresh = new GenerationQueueRepository(f.database.db, f.root)
    const recovery = await fresh.recoverAfterRestart()
    assert.equal(recovery.orphanedDirectoriesRemoved, 1)
    await assert.rejects(new SmartPatchInputBundleRepository(f.root, {}, 'queue').load(orphan.id), {
      code: 'SMART_PATCH_INPUT_NOT_FOUND',
    })
    assert.equal(
      await readFile(path.join(queueRoot(f), incompleteId, 'source.png'), 'utf8'),
      'incomplete reservation',
    )
    assert.equal(
      (await new SmartPatchInputBundleRepository(f.root).load(source.id)).manifestSha256,
      source.manifestSha256,
    )
    await preserved(f)
  })
})

test('Smart Patch queue captures caller material and collaborators before its first await', async () => {
  await fixture('illustrious', async (f) => {
    const expected = structuredClone(f.material.manifest)
    const input = {
      assertCurrent: () => undefined,
      material: f.material,
      modelService: f.models,
      projectPath: f.projectPath,
      stagingSessionId: randomUUID(),
    }
    const pending = f.queue.enqueuePreparedSmartPatchBatch(input)
    f.material.files['source.png'].fill(0)
    f.material.manifest.context.bbox.width = 1
    f.models.resolveVerifiedGenerationCheckpointForPlan = async () => {
      throw new Error('Late resolver alias must not run')
    }
    input.assertCurrent = () => {
      throw new Error('Late callback alias must not run')
    }
    const items = await pending
    for (const item of items) {
      const loaded = await f.queue.loadVerifiedSmartPatchInput(item.id)
      assert.deepEqual(loaded.payload.context, expected.context)
      assert.equal(loaded.bundle.files['source.png'].length, expected.files['source.png'].byteSize)
      assert.equal(digest(loaded.bundle.files['source.png']), expected.files['source.png'].sha256)
    }
    await preserved(f)
  })
})

test('Smart Patch exact reload refuses crossed row document bundle hash and item bindings', async () => {
  await fixture('anima', async (f) => {
    const [item] = await admit(f)
    const row = await f.database.db
      .selectFrom('generation_queue_item')
      .selectAll()
      .where('id', '=', item.id)
      .executeTakeFirstOrThrow()
    for (const field of ['document', 'hash', 'item'] as const) {
      const payload = JSON.parse(row.frozen_payload_json)
      if (field === 'document') {
        payload.context.documentId = randomUUID()
      }
      if (field === 'hash') {
        payload.bundle.manifestSha256 = 'f'.repeat(64)
      }
      if (field === 'item') {
        payload.bundle.itemIndex = 1
      }
      await f.database.db
        .updateTable('generation_queue_item')
        .set({ frozen_payload_json: JSON.stringify(payload) })
        .where('id', '=', item.id)
        .execute()
      await assert.rejects(f.queue.loadVerifiedSmartPatchInput(item.id))
      await f.database.db
        .updateTable('generation_queue_item')
        .set({ frozen_payload_json: row.frozen_payload_json })
        .where('id', '=', item.id)
        .execute()
      await f.queue.loadVerifiedSmartPatchInput(item.id)
    }
    await preserved(f)
  })
})
