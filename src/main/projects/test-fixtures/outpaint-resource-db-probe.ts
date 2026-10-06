import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

import type { OutpaintInfillResolver } from '../../runtime/inference-auxiliary-resources.js'
import type { OutpaintConsumerFixture } from './outpaint-consumers.js'

import { withOutpaintConsumerFixture } from './outpaint-consumers.js'

const family = process.argv[2]
if (family !== 'illustrious' && family !== 'anima') {
  throw new Error('Expected a supported family.')
}
// A pending SQLite connection acquisition alone does not keep Node alive. The parent owns a hard
// child timeout; this timer keeps a deadlocked probe observable until that parent terminates it.
const keepAlive = setInterval(() => {}, 1000)

try {
  await withOutpaintConsumerFixture(family, async (fixture) => {
    let registryCalls = 0
    let infillCalls = 0
    const registryQuery = async () => {
      await fixture.database.db.selectFrom('generation_queue_item').select('id').execute()
    }
    const models: OutpaintConsumerFixture['outpaintModels'] = {
      ...fixture.outpaintModels,
      async resolveVerifiedGenerationAnimaBundleForPlan(reference) {
        assert.equal(this, models)
        registryCalls++
        await registryQuery()
        return await fixture.outpaintModels.resolveVerifiedGenerationAnimaBundleForPlan(reference)
      },
      async resolveVerifiedGenerationCheckpointForPlan(reference) {
        assert.equal(this, models)
        registryCalls++
        await registryQuery()
        return await fixture.outpaintModels.resolveVerifiedGenerationCheckpointForPlan(reference)
      },
    }
    const infill: OutpaintInfillResolver = {
      async resolveVerifiedOutpaintInfill() {
        assert.equal(this, infill)
        infillCalls++
        await registryQuery()
        return await fixture.infillResolver.resolveVerifiedOutpaintInfill()
      },
    }
    const admission = async (count: number) => {
      const before = { infillCalls, registryCalls }
      const rows = await fixture.queue.enqueuePreparedOutpaintBatch({
        infillResolver: infill,
        items: Array.from({ length: count }, () => fixture.outpaintPrepared),
        modelService: models,
        preflight: async () => {},
        projectPath: fixture.projectPath,
        stagingSessionId: randomUUID(),
      })
      return {
        counts: {
          infill: infillCalls - before.infillCalls,
          registry: registryCalls - before.registryCalls,
          rows: rows.length,
        },
        rows,
      }
    }
    const first = await admission(32)
    const original = await fixture.queue.loadVerifiedInput(first.rows[0].id)
    const canceled = await fixture.queue.cancel(first.rows[0].id, first.rows[0].statusSequence)
    const beforeRetry = { infillCalls, registryCalls }
    const retried = await fixture.queue.retryPreparedOutpaintTerminal(
      canceled.id,
      canceled.statusSequence,
      {
        infillResolver: infill,
        modelService: models,
        preflight: async () => {},
      },
    )
    const retryCounts = {
      infill: infillCalls - beforeRetry.infillCalls,
      registry: registryCalls - beforeRetry.registryCalls,
    }
    const restored = await fixture.queue.loadVerifiedInput(retried.id)
    const second = await admission(1)
    process.stdout.write(
      `${JSON.stringify({
        family,
        firstAdmission: first.counts,
        newAdmission: second.counts,
        retry: {
          ...retryCounts,
          freshId: retried.id !== canceled.id,
          sameFrozenPayload: JSON.stringify(restored.payload) === JSON.stringify(original.payload),
        },
      })}\n`,
    )
  })
} finally {
  clearInterval(keepAlive)
}
