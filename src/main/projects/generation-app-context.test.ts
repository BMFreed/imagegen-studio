import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { openAppDatabase } from '../db/database.js'
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
      resolveVerifiedGenerationCheckpointForPlan: async () => {
        throw new Error('No model should be resolved during bootstrap.')
      },
    },
    projectIndex: { getProject: async () => null },
    projectService: {
      getOpenTabs: () => [],
      prepareNormalTxt2ImgContext: async () => {
        throw new Error('No Project should be prepared during bootstrap.')
      },
    },
    scratchBasePath: path.join(dataRoot, 'scratch'),
  }
}

test('startup retains one recovered pair without starting inference or claiming runtime readiness', async () => {
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
    assert.strictEqual(first.processor, second.processor)
    assert.strictEqual(first.orchestrator, second.orchestrator)
    assert.doesNotThrow(() => first.queue.assertReadyForDispatch())
    assert.doesNotThrow(() => first.staging.assertReadyForPublication())
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
