import { createEmptyProjectDocumentV1 } from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { type AppDatabase, openAppDatabase } from '../db/database.js'
import { GenerationAcceptanceJournalRepository } from './generation-acceptance-journal.js'
import { ProjectGenerationAcceptanceRecovery } from './project-generation-acceptance-recovery.js'
import { ProjectGenerationAcceptance } from './project-generation-acceptance.js'
import { ProjectGenerationClose } from './project-generation-close.js'
import { ProjectGenerationOperationGate } from './project-generation-operation-gate.js'
import { releaseCanceledWindowCloseFences } from './project-generation-window-close.js'
import { localProjectRecoveryKey } from './project-identity.js'
import {
  readGenerationAcceptanceKind,
  type SmartPatchAcceptanceHandoff,
  SmartPatchAcceptanceJournalRepository,
} from './smart-patch-acceptance-journal.js'
import {
  acceptedOutputPngFixture,
  acceptedRasterProvenanceFixture,
} from './test-fixtures/accepted-provenance.js'
import { smartPatchVariantMetadataFixture } from './test-fixtures/smart-patch-variant.js'

const projectPath = '/private/projects/recovery-dispatch.igs'
const tabId = localProjectRecoveryKey(projectPath)
const migrations = path.resolve('src/main/db/migrations')

function handoff(documentId: string): SmartPatchAcceptanceHandoff {
  const variant = smartPatchVariantMetadataFixture('anima')
  const targetLayerId = variant.generationProvenance.layerSourceContext.layerId
  variant.generationProvenance.layerSourceContext.sourceDocumentId = documentId
  const stagingSessionId = randomUUID()
  return {
    acceptedVariants: [variant],
    activeVariantId: variant.id,
    documentId,
    kind: 'smart-patch-variants',
    localProjectKey: tabId,
    operationId: randomUUID(),
    projectPath,
    reviewedCandidates: [
      {
        candidateId: variant.generationProvenance.executionResultContext.candidateId,
        frozenPayloadSha256: 'a'.repeat(64),
        stagingSessionId,
      },
    ],
    schemaVersion: 1,
    stagingSessionIds: [stagingSessionId],
    targetLayerId,
  }
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

/**
 * Actual SQLite classifier/intent storage and gate; reconcile delegates are controlled routing
 * collaborators.
 */
async function withDispatcher(
  run: (f: {
    calls: string[]
    database: AppDatabase
    dispatcher: ProjectGenerationAcceptanceRecovery
    fences: Set<string>
    gate: ProjectGenerationOperationGate
    intent: SmartPatchAcceptanceHandoff
    journal: SmartPatchAcceptanceJournalRepository
    options: ConstructorParameters<typeof ProjectGenerationAcceptanceRecovery>[0]
    state: { documentId: string | null; rasterPending: boolean; smartPending: boolean }
  }) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-acceptance-dispatch-'))
  const database = openAppDatabase(root, migrations)
  const state = {
    documentId: randomUUID() as string | null,
    rasterPending: false,
    smartPending: false,
  }
  const fences = new Set<string>()
  const calls: string[] = []
  const gate = new ProjectGenerationOperationGate()
  const options: ConstructorParameters<typeof ProjectGenerationAcceptanceRecovery>[0] = {
    documents: { getOpenDocumentId: () => state.documentId },
    gate,
    orchestrator: {
      fenceProjectGeneration: async (id) => {
        calls.push('fence')
        fences.add(id)
      },
      releaseProjectGenerationFence: (id) => {
        calls.push('release')
        fences.delete(id)
      },
    },
    raster: {
      hasPendingHandoff: () => state.rasterPending,
      reconcile: async (id) => {
        calls.push('raster')
        state.rasterPending = false
        fences.delete(id)
        return 'none'
      },
    },
    readKind: (id, documentId) => readGenerationAcceptanceKind(database.db, id, documentId),
    smartPatch: {
      hasPendingHandoff: () => state.smartPending,
      hasUnjournaledOverlap: async () => false,
      reconcile: async (id) => {
        calls.push('smart')
        state.smartPending = false
        fences.delete(id)
        return 'cleaned'
      },
    },
  }
  const dispatcher = new ProjectGenerationAcceptanceRecovery(options)
  const intent = handoff(state.documentId!)
  const journal = new SmartPatchAcceptanceJournalRepository(database.db)
  try {
    await run({ calls, database, dispatcher, fences, gate, intent, journal, options, state })
  } finally {
    await database.close()
    await rm(root, { force: true, recursive: true })
  }
}

test('actual shared SQL Smart intent dispatches exactly the Smart owner without invoking Raster recovery', async () => {
  await withDispatcher(async (f) => {
    await f.journal.record(f.intent)
    f.options.smartPatch.reconcile = async (id) => {
      f.calls.push('smart')
      await f.journal.abandon(f.intent)
      f.fences.delete(id)
      return 'cleaned'
    }
    assert.equal(await f.dispatcher.reconcile(tabId), 'cleaned')
    assert.deepEqual(f.calls, ['fence', 'smart'])
    assert.equal(f.dispatcher.hasPendingHandoff(tabId), false)
    assert.equal(f.fences.has(tabId), false)
  })
})

test('legacy Raster SQL intent and absence of any intent route only to Raster recovery', async () => {
  await withDispatcher(async (f) => {
    const normal = new GenerationAcceptanceJournalRepository(f.database.db)
    const document = createEmptyProjectDocumentV1({
      documentId: f.intent.documentId,
      title: 'Raster owner',
    })
    const bytes = await acceptedOutputPngFixture()
    const provenance = acceptedRasterProvenanceFixture(document, bytes, {
      height: 8,
      width: 8,
      x: 0,
      y: 0,
    })
    const id = randomUUID()
    await normal.record({
      acceptedLayers: [
        {
          asset: {
            bytes: bytes.length,
            height: 8,
            path: `assets/layers/${id}.png`,
            sha256: provenance.executionResultContext.output.sha256,
            width: 8,
          },
          blendMode: 'normal',
          generationProvenance: provenance,
          id,
          kind: 'raster',
          locked: false,
          name: 'Normal',
          opacity: 1,
          transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 0, y: 0 },
          visible: true,
        },
      ],
      documentId: document.documentId,
      localProjectKey: tabId,
      operationId: randomUUID(),
      projectPath,
      stagingSessionIds: [randomUUID()],
    })
    assert.equal(await f.dispatcher.reconcile(tabId), 'none')
    await f.database.db.deleteFrom('generation_acceptance_journal').execute()
    assert.equal(await f.dispatcher.reconcile(tabId), 'none')
    assert.deepEqual(f.calls, ['fence', 'raster', 'fence', 'raster'])
    assert.equal(f.dispatcher.hasPendingHandoff(tabId), false)
  })
})

test('uncertain local Smart handoff chooses Smart even before a durable intent exists', async () => {
  await withDispatcher(async (f) => {
    f.state.smartPending = true
    assert.equal(f.dispatcher.hasPendingHandoff(tabId), true)
    assert.equal(await f.dispatcher.reconcile(tabId), 'cleaned')
    assert.deepEqual(f.calls, ['fence', 'smart'])
    assert.equal(f.dispatcher.hasPendingHandoff(tabId), false)
  })
})

test('classification failure retains a composite fence and prevents real Project close before staging mutation', async () => {
  await withDispatcher(async (f) => {
    await f.journal.record(f.intent)
    await f.database.db
      .updateTable('generation_acceptance_journal')
      .set({ payload_json: '{broken-json' })
      .execute()
    await assert.rejects(f.dispatcher.reconcile(tabId), {
      code: 'SMART_PATCH_ACCEPTANCE_JOURNAL_INVALID',
    })
    assert.equal(f.dispatcher.hasPendingHandoff(tabId), true)
    assert.equal(f.fences.has(tabId), true)
    assert.equal(f.calls.includes('raster') || f.calls.includes('smart'), false)
    let closed = false
    const close = new ProjectGenerationClose(
      {
        close: async () => {
          closed = true
        },
        discardAndClose: async () => {
          closed = true
        },
        getOpenTabs: () =>
          [{ dirty: false, id: tabId }] as ReturnType<
            ConstructorParameters<typeof ProjectGenerationClose>[0]['getOpenTabs']
          >,
      },
      null,
      f.gate,
      (id) => f.dispatcher.hasPendingHandoff(id),
    )
    await assert.rejects(close.getCloseImpact(tabId), { code: 'PROJECT_ACCEPTANCE_PENDING' })
    await assert.rejects(close.close(tabId, { confirmCloseImpact: true, discardDocument: false }), {
      code: 'PROJECT_ACCEPTANCE_PENDING',
    })
    releaseCanceledWindowCloseFences(
      [tabId],
      (id) => f.dispatcher.hasPendingHandoff(id),
      (id) => f.fences.delete(id),
    )
    assert.equal(f.fences.has(tabId), true)
    assert.equal(closed, false)
    // Repair is explicit; a subsequent successful routed check clears the dispatcher marker.
    await f.database.db.deleteFrom('generation_acceptance_journal').execute()
    await f.dispatcher.reconcile(tabId)
    assert.equal(f.dispatcher.hasPendingHandoff(tabId), false)
  })
})

test('owner rejection is re-fenced even when its collaborator released a Set-based fence first', async () => {
  await withDispatcher(async (f) => {
    f.options.raster.reconcile = async (id) => {
      f.calls.push('raster')
      f.fences.delete(id)
      throw new Error('controlled owner refusal')
    }
    await assert.rejects(f.dispatcher.reconcile(tabId), /controlled owner refusal/)
    assert.deepEqual(f.calls, ['fence', 'raster', 'fence'])
    assert.equal(f.fences.has(tabId), true)
    assert.equal(f.dispatcher.hasPendingHandoff(tabId), true)
  })
})

test('conflicting local or durable owners preserve the shared fence without calling either reconciler', async () => {
  await withDispatcher(async (f) => {
    await f.journal.record(f.intent)
    f.state.rasterPending = true
    await assert.rejects(f.dispatcher.reconcile(tabId), { code: 'ACCEPTANCE_RECOVERY_REQUIRED' })
    assert.equal(f.calls.includes('raster') || f.calls.includes('smart'), false)
    assert.equal(f.dispatcher.hasPendingHandoff(tabId), true)
    assert.equal(f.fences.has(tabId), true)
  })
})

test('in-flight classification is visible to close guards and concurrent callers share one routed operation', async () => {
  await withDispatcher(async (f) => {
    const entered = deferred()
    const release = deferred()
    const classify = f.options.readKind
    f.options.readKind = async (...args) => {
      entered.resolve()
      await release.promise
      return await classify(...args)
    }
    const first = f.dispatcher.reconcile(tabId)
    assert.equal(f.dispatcher.hasPendingHandoff(tabId), true)
    const second = f.dispatcher.reconcile(tabId)
    await entered.promise
    assert.equal(f.fences.has(tabId), true)
    assert.deepEqual(f.calls, ['fence'])
    release.resolve()
    assert.deepEqual(await Promise.all([first, second]), ['none', 'none'])
    assert.deepEqual(f.calls, ['fence', 'raster'])
    assert.equal(f.dispatcher.hasPendingHandoff(tabId), false)
  })
})

test(
  'dispatcher drains an admitted Add before classifying its newly recorded Smart intent without nesting gate.run',
  { timeout: 5000 },
  async () => {
    await withDispatcher(async (f) => {
      const entered = deferred()
      const release = deferred()
      const adding = f.gate.run(tabId, async () => {
        entered.resolve()
        await release.promise
        await f.journal.record(f.intent)
      })
      await entered.promise
      f.options.smartPatch.reconcile = async (id) =>
        await f.gate.run(id, async () => {
          f.calls.push('smart')
          await f.journal.abandon(f.intent)
          f.fences.delete(id)
          return 'cleaned' as const
        })
      const recovery = f.dispatcher.reconcile(tabId)
      assert.equal(f.dispatcher.hasPendingHandoff(tabId), true)
      release.resolve()
      await adding
      assert.equal(await recovery, 'cleaned')
      assert.deepEqual(f.calls, ['fence', 'smart'])
    })
  },
)

test('document replacement while classification awaits keeps recovery fenced and delegates untouched', async () => {
  await withDispatcher(async (f) => {
    const entered = deferred()
    const release = deferred()
    f.options.readKind = async () => {
      entered.resolve()
      await release.promise
      return null
    }
    const recovering = f.dispatcher.reconcile(tabId)
    await entered.promise
    f.state.documentId = randomUUID()
    release.resolve()
    await assert.rejects(recovering, { code: 'ACCEPTANCE_RECOVERY_REQUIRED' })
    assert.equal(f.calls.includes('raster') || f.calls.includes('smart'), false)
    assert.equal(f.fences.has(tabId), true)
  })
})

test('before Raster Add preserves the real Raster owner rejection of a different selection while its earlier intent is pending', async () => {
  await withDispatcher(async (f) => {
    const journal = new GenerationAcceptanceJournalRepository(f.database.db)
    const document = createEmptyProjectDocumentV1({
      documentId: f.intent.documentId,
      title: 'Pending Raster Add',
    })
    const bytes = await acceptedOutputPngFixture()
    const provenance = acceptedRasterProvenanceFixture(document, bytes, {
      height: 8,
      width: 8,
      x: 0,
      y: 0,
    })
    const id = randomUUID()
    const first = {
      asset: {
        bytes: bytes.length,
        height: 8,
        path: `assets/layers/${id}.png`,
        sha256: provenance.executionResultContext.output.sha256,
        width: 8,
      },
      blendMode: 'normal' as const,
      generationProvenance: provenance,
      id,
      kind: 'raster' as const,
      locked: false,
      name: 'Earlier accepted',
      opacity: 1,
      transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 0, y: 0 },
      visible: true,
    }
    const second = structuredClone(first)
    second.id = randomUUID()
    second.asset.path = `assets/layers/${second.id}.png`
    const selectedCandidateId = randomUUID()
    second.generationProvenance.executionResultContext.candidateId = selectedCandidateId
    second.generationProvenance.executionResultContext.queueItemId = selectedCandidateId
    const pending = {
      acceptedLayers: [first],
      documentId: document.documentId,
      localProjectKey: tabId,
      operationId: randomUUID(),
      projectPath,
      stagingSessionIds: [randomUUID()],
    }
    await journal.record(pending)
    const owner = {
      applyDocument: async () => {
        throw new Error('No adoption belongs to this selection control')
      },
      dirty: true,
      document: { ...document, layers: [first, second] },
      filePath: projectPath,
      flush: async () => null,
    }
    // The accepted document is a declared precondition. Actual Raster.accept and SQL journal
    // decide the pending-selection rule; no file or pixel handoff is claimed in this routing test.
    const raster = new ProjectGenerationAcceptance({
      documents: { getOpenDocument: () => owner },
      gate: f.gate,
      journal,
      orchestrator: {
        ...f.options.orchestrator,
        cancelAcceptanceJobs: async () => {
          throw new Error('No cancellation belongs to this control')
        },
      },
      queue: { listUnfinishedByProjectDocument: async () => [] },
      staging: {
        discardSessions: async () => ({ cleanupDeferred: false, discardedSessionCount: 0 }),
        listVerifiedCandidates: async () => [],
        readVerifiedCandidatePng: async () => null,
      },
    })
    f.options.raster = raster
    await assert.rejects(
      f.dispatcher.withRasterAdd(tabId, () =>
        raster.accept(tabId, [selectedCandidateId], null, []),
      ),
      {
        code: 'ACCEPTANCE_HANDOFF_PENDING',
      },
    )
    assert.equal(raster.hasPendingHandoff(tabId), true)
    const beforeCalls = f.calls.length
    assert.equal(await f.dispatcher.beforeRasterAdd(tabId), 'none')
    assert.deepEqual(
      f.calls.slice(beforeCalls),
      ['fence'],
      'The narrow check must not release the owner fence or reconcile its intent',
    )
    assert.equal(f.dispatcher.hasPendingHandoff(tabId), true)
    assert.equal(f.fences.has(tabId), true)
    assert.deepEqual(await journal.read(tabId, document.documentId), pending)
    await assert.rejects(raster.accept(tabId, [selectedCandidateId], null, []), {
      code: 'ACCEPTANCE_HANDOFF_PENDING',
    })
    assert.deepEqual(
      await f.database.db.selectFrom('generation_staging_discarded_session').selectAll().execute(),
      [],
    )
  })
})

test('before Raster Add preserves an unconfirmed local Raster fence without intent and releases only its own clean fence', async () => {
  await withDispatcher(async (f) => {
    f.state.rasterPending = true
    f.fences.add(tabId)
    assert.equal(await f.dispatcher.beforeRasterAdd(tabId), 'none')
    assert.deepEqual(f.calls, ['fence'])
    assert.equal(f.state.rasterPending, true)
    assert.equal(f.fences.has(tabId), true)
    f.state.rasterPending = false
    assert.equal(await f.dispatcher.beforeRasterAdd(tabId), 'none')
    assert.deepEqual(f.calls, ['fence', 'fence', 'release'])
    assert.equal(f.fences.has(tabId), false)
    assert.equal(f.dispatcher.hasPendingHandoff(tabId), false)
  })
})

test('full recovery concurrent with a narrow Raster Add check still invokes normal reconciliation after classification', async () => {
  await withDispatcher(async (f) => {
    const entered = deferred()
    const release = deferred()
    const classify = f.options.readKind
    let reads = 0
    f.options.readKind = async (...args) => {
      if (++reads === 1) {
        entered.resolve()
        await release.promise
      }
      return await classify(...args)
    }
    const before = f.dispatcher.beforeRasterAdd(tabId)
    await entered.promise
    const full = f.dispatcher.reconcile(tabId)
    release.resolve()
    assert.deepEqual(await Promise.all([before, full]), ['none', 'none'])
    assert.deepEqual(f.calls, ['fence', 'release', 'fence', 'raster'])
    assert.equal(reads, 2)
    assert.equal(f.dispatcher.hasPendingHandoff(tabId), false)
  })
})

test('an unjournaled Smart overlap selects only Smart recovery for both open and before Raster Add', async () => {
  await withDispatcher(async (f) => {
    f.options.smartPatch.hasUnjournaledOverlap = async () => true
    f.options.smartPatch.reconcile = async () => {
      f.calls.push('smart')
      throw new Error('unjournaled Smart overlap')
    }
    await assert.rejects(f.dispatcher.beforeRasterAdd(tabId), /unjournaled Smart overlap/)
    assert.equal(f.calls.includes('raster'), false)
    assert.equal(f.fences.has(tabId), true)
    assert.equal(f.dispatcher.hasPendingHandoff(tabId), true)
    await assert.rejects(f.dispatcher.reconcile(tabId), /unjournaled Smart overlap/)
    assert.equal(f.calls.filter((call) => call === 'smart').length, 2)
    assert.equal(f.calls.includes('raster'), false)
  })
})

test(
  'Main Raster Add marker admits the real gate before concurrent full recovery can classify or release a fence',
  { timeout: 5000 },
  async () => {
    await withDispatcher(async (f) => {
      const entered = deferred()
      const release = deferred()
      const adding = f.dispatcher.withRasterAdd(tabId, () =>
        f.gate.run(tabId, async () => {
          assert.equal(
            f.dispatcher.hasPendingHandoff(tabId),
            true,
            'The marker must exist before actual gate admission',
          )
          f.calls.push('add-start')
          entered.resolve()
          await release.promise
          f.calls.push('add-end')
          return 'accepted'
        }),
      )
      await entered.promise
      const recovering = f.dispatcher.reconcile(tabId)
      assert.deepEqual(f.calls, ['fence', 'release', 'add-start'])
      release.resolve()
      assert.deepEqual(await Promise.all([adding, recovering]), ['accepted', 'none'])
      assert.deepEqual(f.calls, ['fence', 'release', 'add-start', 'add-end', 'fence', 'raster'])
      assert.equal(f.dispatcher.hasPendingHandoff(tabId), false)
    })
  },
)

test(
  'a full recovery entering the narrow-check return gap completes before the Main Raster callback starts',
  { timeout: 5000 },
  async () => {
    await withDispatcher(async (f) => {
      const entered = deferred()
      const release = deferred()
      let recovery: Promise<'cleaned' | 'none'> | undefined
      let intercepted = false
      const releaseFence = f.options.orchestrator.releaseProjectGenerationFence
      f.options.orchestrator.releaseProjectGenerationFence = (id) => {
        releaseFence(id)
        if (!intercepted) {
          intercepted = true
          recovery = f.dispatcher.reconcile(tabId)
        }
      }
      f.options.raster.reconcile = async (id) =>
        await f.gate.run(id, async () => {
          f.calls.push('raster-start')
          entered.resolve()
          await release.promise
          f.calls.push('raster-end')
          f.fences.delete(id)
          return 'none' as const
        })
      const adding = f.dispatcher.withRasterAdd(tabId, () =>
        f.gate.run(tabId, async () => {
          f.calls.push('add')
          return 'accepted'
        }),
      )
      await entered.promise
      assert.equal(f.calls.includes('add'), false)
      release.resolve()
      assert.equal(await adding, 'accepted')
      assert.equal(await recovery, 'none')
      assert.ok(f.calls.indexOf('add') > f.calls.indexOf('raster-end'))
      assert.equal(f.dispatcher.hasPendingHandoff(tabId), false)
    })
  },
)

test(
  'a failed Raster callback settles the admission marker so concurrent full recovery can proceed without inheriting its error',
  { timeout: 5000 },
  async () => {
    await withDispatcher(async (f) => {
      const entered = deferred()
      const release = deferred()
      const adding = f.dispatcher.withRasterAdd(tabId, () =>
        f.gate.run(tabId, async () => {
          entered.resolve()
          await release.promise
          throw new Error('controlled Add refusal')
        }),
      )
      const refused = assert.rejects(adding, /controlled Add refusal/)
      await entered.promise
      const recovering = f.dispatcher.reconcile(tabId)
      release.resolve()
      await refused
      assert.equal(await recovering, 'none')
      assert.deepEqual(f.calls, ['fence', 'release', 'fence', 'raster'])
      assert.equal(f.dispatcher.hasPendingHandoff(tabId), false)
      assert.equal(f.fences.has(tabId), false)
    })
  },
)
