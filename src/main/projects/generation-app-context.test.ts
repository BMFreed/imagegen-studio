import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { openAppDatabase } from '../db/database.js'
import { InferenceAuxiliaryResourceError } from '../runtime/inference-auxiliary-resources.js'
import { toProjectGenerationActionApiError } from './generation-action-controller.js'
import { createGenerationAppContext } from './generation-app-context.js'

const migrations = path.resolve('src/main/db/migrations')

async function withDatabase(
  run: (dataRoot: string, database: ReturnType<typeof openAppDatabase>) => Promise<void>,
): Promise<void> {
  const dataRoot = await mkdtemp(path.join(os.tmpdir(), 'imagegen-generation-context-'))
  const database = openAppDatabase(dataRoot, migrations)
  try {
    await run(dataRoot, database)
  } finally {
    await database.close()
    await rm(dataRoot, { force: true, recursive: true })
  }
}

function dependencies(dataRoot: string, database: ReturnType<typeof openAppDatabase>) {
  return {
    database,
    dataRoot,
    modelService: {
      assertNoUnboundGenerationEmbeddings: async () => {},
      resolveVerifiedGenerationCheckpointForPlan: async () => {
        throw new Error('No model should be resolved during bootstrap.')
      },
      resolveVerifiedGenerationEmbeddingForPlan: async () => {
        throw new Error('No embedding is configured in this fixture.')
      },
      resolveVerifiedGenerationLoraForPlan: async () => {
        throw new Error('This fixture has no active LoRAs.')
      },
      resolveVerifiedGenerationVaeForPlan: async () => {
        throw new Error('This fixture does not select an external VAE.')
      },
    },
    projectIndex: { getProject: async () => null },
    projectService: {
      getOpenDocumentId: () => null,
      getOpenTabs: () => [],
      prepareNormalGenerationContext: async () => {
        throw new Error('No Project should be prepared during bootstrap.')
      },
    },
    scratchBasePath: path.join(dataRoot, 'scratch'),
  }
}

test('startup retains the same recovered queue and both staging stores without starting inference or claiming runtime readiness', async () => {
  await withDatabase(async (dataRoot, database) => {
    // The model and Project stubs throw if construction accidentally starts an inference run.
    const context = await createGenerationAppContext(dependencies(dataRoot, database))
    assert.deepEqual(context.availability, { kind: 'storage-recovered' })
    assert.equal(context.recoveryFailure, null)

    const first = context.requireRecoveredServices()
    const second = context.requireRecoveredServices()
    assert.strictEqual(first, second)
    assert.strictEqual(first.queue, second.queue)
    assert.strictEqual(first.staging, second.staging)
    assert.strictEqual(first.smartPatchStaging, second.smartPatchStaging)
    assert.strictEqual(first.processor, second.processor)
    assert.strictEqual(first.orchestrator, second.orchestrator)
    assert.doesNotThrow(() => first.queue.assertReadyForDispatch())
    assert.doesNotThrow(() => first.staging.assertReadyForPublication())
    assert.doesNotThrow(() => first.smartPatchStaging.assertReadyForPublication())
    assert.deepEqual(
      await first.smartPatchStaging.listVerifiedCandidates(`project-v1-${'a'.repeat(64)}`),
      [],
    )
    assert.equal(await first.queue.claimNextPending(), null)

    // This startup-only context has no active worker or Generate entry point to drain.
    // Shutdown closes admission; a future dispatch owner must await worker exit separately.
    context.shutdown()
    context.shutdown()
    assert.deepEqual(context.availability, { kind: 'closed' })
    assert.throws(() => context.requireRecoveredServices(), {
      code: 'GENERATION_CONTEXT_CLOSED',
    })
  })
})

test('unsafe staging recovery leaves generation unavailable without disabling the database', async () => {
  await withDatabase(async (dataRoot, database) => {
    const outside = await mkdtemp(path.join(os.tmpdir(), 'imagegen-outside-staging-'))
    try {
      await mkdir(path.join(dataRoot, 'recovery'))
      await symlink(outside, path.join(dataRoot, 'recovery', 'generation-staging'))
      const context = await createGenerationAppContext(dependencies(dataRoot, database))
      assert.deepEqual(context.availability, { kind: 'recovery-failed' })
      assert.equal((context.recoveryFailure as { code?: string }).code, 'STAGING_STORAGE_UNSAFE')
      assert.throws(() => context.requireRecoveredServices(), {
        code: 'GENERATION_STORAGE_UNAVAILABLE',
      })
      assert.deepEqual(await database.db.selectFrom('app_metadata').selectAll().execute(), [])
      context.shutdown()
      assert.deepEqual(context.availability, { kind: 'closed' })
    } finally {
      await rm(outside, { force: true, recursive: true })
    }
  })
})

// Boundary: actual startup SQLite/storage recovery. A helper failure must not become a storage failure.
for (const kind of ['missing', 'corrupt', 'linked-root', 'file-root'] as const) {
  test(`LaMa ${kind} refuses outpaint only while normal generation storage recovers`, async () => {
    await withDatabase(async (dataRoot, database) => {
      const resources = path.join(dataRoot, 'inference-resources')
      const outside = await mkdtemp(path.join(os.tmpdir(), 'imagegen-outside-infill-'))
      try {
        switch (kind) {
          case 'corrupt': {
            await mkdir(resources)
            await writeFile(path.join(resources, 'big-lama.pt'), 'wrong weights')

            break
          }
          case 'file-root': {
            await writeFile(resources, 'preserve this foreign file')

            break
          }
          case 'linked-root': {
            await symlink(outside, resources)

            break
          }
          // No default
        }
        const context = await createGenerationAppContext(dependencies(dataRoot, database))
        assert.deepEqual(context.availability, { kind: 'storage-recovered' })
        assert.equal(context.recoveryFailure, null)
        const services = context.requireRecoveredServices()
        assert.doesNotThrow(() => services.queue.assertReadyForDispatch())
        assert.doesNotThrow(() => services.staging.assertReadyForPublication())
        assert.equal(await services.queue.claimNextPending(), null)
        await assert.rejects(services.infillResolver.resolveVerifiedOutpaintInfill(), {
          code: 'GENERATION_RESOURCE_CHANGED',
        })
        assert.deepEqual(await database.db.selectFrom('app_metadata').selectAll().execute(), [])
        context.shutdown()
      } finally {
        await rm(outside, { force: true, recursive: true })
      }
    })
  })
}

test('auxiliary resource refusals expose a concrete outpaint repair action without private paths', () => {
  for (const code of ['GENERATION_RESOURCE_CHANGED', 'INVALID_INFERENCE_RESOURCE_ROOT'] as const) {
    const projected = toProjectGenerationActionApiError(
      new InferenceAuxiliaryResourceError(code, 'private /home/person/big-lama.pt'),
    )
    assert.equal(projected.code, 'GENERATION_RESOURCE_CHANGED')
    assert.match(projected.message, /LaMa/)
    assert.match(projected.message, /Ordinary generation and Save remain available/)
    assert.ok(!projected.message.includes('/home/person'))
  }
  assert.ok(
    !toProjectGenerationActionApiError(
      Object.assign(new Error('private /home/person/big-lama.pt'), {
        code: 'GENERATION_RESOURCE_CHANGED',
      }),
    ).message.includes('/home/person'),
  )
})
