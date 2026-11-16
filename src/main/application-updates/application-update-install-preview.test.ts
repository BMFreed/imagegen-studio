import type { ProjectTab } from '../../shared/api.js'

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'

import { ProjectGenerationClose } from '../projects/project-generation-close.js'
import { ProjectGenerationStagingLifecycle } from '../projects/project-generation-staging-lifecycle.js'
import {
  createRegionalQueueFixture,
  type RegionalQueueFixture,
} from '../projects/test-fixtures/regional-queue.js'
import {
  type ApplicationUpdateInstallPreviewDependencies,
  collectApplicationUpdateInstallPreview,
} from './application-update-install-preview.js'

const tab = (id: string, dirty = false) => ({ dirty, id }) as ProjectTab
const modelImpact = () => ({
  activeJobCount: 0,
  committingJobCount: 0,
  preparingInstallCount: 0,
  storageMutationActive: false,
})

function controlled() {
  const calls: string[] = []
  const tabs = [tab('first', true), tab('second')]
  const dependencies: ApplicationUpdateInstallPreviewDependencies = {
    getModelImpact: () => {
      calls.push('models')
      return modelImpact()
    },
    getOpenTabs: () => tabs,
    getProjectImpact: async (id) => {
      calls.push(id)
      return {
        completedCandidateCount: 1,
        generationStorageUnavailable: false,
        unfinishedJobCount: 10,
      }
    },
    getQueueImpact: async () => {
      calls.push('queue')
      return { unfinishedJobCount: 3 }
    },
  }
  return { calls, dependencies, tabs }
}

async function publish(fixture: RegionalQueueFixture, projectPath: string) {
  const queued = await fixture.queue.enqueueCurrentCanvasRegional({
    prepared: fixture.prepared,
    projectPath,
    regional: fixture.regional,
    request: fixture.request,
    stagingSessionId: randomUUID(),
  })
  const claimed = await fixture.queue.claimNextPendingRegional()
  assert.ok(claimed)
  assert.equal(claimed.item.id, queued.id)
  return await fixture.staging.publishRegionalCandidate({
    actualSeed: claimed.payload.workerJob.sampling.seed,
    expectedStatusSequence: claimed.item.statusSequence,
    pngBytes: fixture.outputBytes,
    queueItemId: queued.id,
  })
}

// Real migrated SQLite, queue, candidate publication and existing Project close/staging owners.
// Project tab metadata, the absent Smart lane and model activity are controlled ports. No worker
// inference, Project Save/close or application installer is claimed by this inspection test.
test('installation review joins real global queue and open-Project staging without changing rows, candidates or invoking close commands', async () => {
  const fixture = await createRegionalQueueFixture()
  try {
    const open = await publish(fixture, fixture.projectPath)
    const otherPath = path.join(fixture.root, 'Closed.igs')
    await writeFile(otherPath, 'separate closed Project identity fixture')
    const closed = await publish(fixture, otherPath)
    for (const projectPath of [fixture.projectPath, otherPath]) {
      await fixture.queue.enqueueIllustriousGeneration({
        prepared: fixture.prepared,
        projectPath,
        request: fixture.request,
        stagingSessionId: randomUUID(),
      })
    }
    const tabs = [tab(open.localProjectKey, true)]
    const actions: string[] = []
    const forbidden = async () => {
      actions.push('destructive-command')
      throw new Error('Review must not execute close commands.')
    }
    const lifecycle = new ProjectGenerationStagingLifecycle(fixture.staging, {
      discardProject: forbidden,
      listVerifiedCandidates: async () => [],
    })
    const projectClose = new ProjectGenerationClose(
      { close: forbidden, discardAndClose: forbidden, getOpenTabs: () => tabs },
      {
        orchestrator: {
          cancelProjectJobs: forbidden,
          completeProjectGenerationClose: () => {
            actions.push('complete-close')
          },
          fenceProjectGeneration: forbidden,
          releaseProjectGenerationFence: () => {
            actions.push('release-fence')
          },
        },
        queue: fixture.queue,
        staging: lifecycle,
      },
    )
    const before = {
      candidates: await Promise.all([readFile(open.assetPath), readFile(closed.assetPath)]),
      database: await Promise.all(
        [fixture.database.filePath, `${fixture.database.filePath}-wal`].map((file) =>
          readFile(file),
        ),
      ),
      receipts: await fixture.db.selectFrom('generation_candidate_receipt').selectAll().execute(),
      rows: await fixture.db.selectFrom('generation_queue_item').selectAll().execute(),
    }
    const result = await collectApplicationUpdateInstallPreview({
      getModelImpact: () => ({
        activeJobCount: 2,
        committingJobCount: 1,
        preparingInstallCount: 1,
        storageMutationActive: true,
      }),
      getOpenTabs: () => tabs,
      getProjectImpact: (id) => projectClose.getCloseImpact(id),
      getQueueImpact: () => fixture.queue.getAppCloseImpact(),
    })
    assert.deepEqual(result, {
      activeModelInstallCount: 2,
      generationStorageUnavailable: false,
      openProjectCount: 1,
      preparingModelInstallCount: 1,
      resourceRemovalActive: true,
      unacceptedResultCount: 1,
      unfinishedJobCount: 2,
      unsavedProjectCount: 1,
    })
    assert.deepEqual(actions, [])
    assert.equal(tabs[0].dirty, true)
    assert.deepEqual(
      await fixture.db.selectFrom('generation_queue_item').selectAll().execute(),
      before.rows,
    )
    assert.deepEqual(
      await fixture.db.selectFrom('generation_candidate_receipt').selectAll().execute(),
      before.receipts,
    )
    assert.deepEqual(
      await Promise.all([readFile(open.assetPath), readFile(closed.assetPath)]),
      before.candidates,
    )
    assert.deepEqual(
      await Promise.all(
        [fixture.database.filePath, `${fixture.database.filePath}-wal`].map((file) =>
          readFile(file),
        ),
      ),
      before.database,
    )
    assert.equal((await lifecycle.listOwnedCandidates(open.localProjectKey)).length, 1)
    assert.equal((await lifecycle.listOwnedCandidates(closed.localProjectKey)).length, 1)
  } finally {
    await fixture.close()
  }
})

test('global queue is inspected before candidates and per-Project unfinished counts are never added again', async () => {
  const fixture = controlled()
  const result = await collectApplicationUpdateInstallPreview(fixture.dependencies)
  assert.deepEqual(fixture.calls, ['queue', 'first', 'second', 'models'])
  assert.equal(result.unfinishedJobCount, 3)
  assert.equal(result.unacceptedResultCount, 2)
  assert.equal(result.unsavedProjectCount, 1)
})

test('absent recovered queue makes both generation counts unknown rather than zero', async () => {
  const fixture = controlled()
  fixture.dependencies.getQueueImpact = () => null
  const result = await collectApplicationUpdateInstallPreview(fixture.dependencies)
  assert.equal(result.generationStorageUnavailable, true)
  assert.equal(result.unfinishedJobCount, null)
  assert.equal(result.unacceptedResultCount, null)
  assert.equal(result.openProjectCount, 2)
  assert.equal(result.unsavedProjectCount, 1)
})

test('unavailable per-Project staging makes both generation counts unknown even with a known queue', async () => {
  const fixture = controlled()
  fixture.dependencies.getProjectImpact = async () => ({
    completedCandidateCount: 0,
    generationStorageUnavailable: true,
    unfinishedJobCount: 0,
  })
  const result = await collectApplicationUpdateInstallPreview(fixture.dependencies)
  assert.equal(result.generationStorageUnavailable, true)
  assert.equal(result.unfinishedJobCount, null)
  assert.equal(result.unacceptedResultCount, null)
})

test('closed Projects still contribute to the global count when no Project tabs are open', async () => {
  const fixture = controlled()
  fixture.tabs.length = 0
  const result = await collectApplicationUpdateInstallPreview(fixture.dependencies)
  assert.deepEqual(fixture.calls, ['queue', 'models'])
  assert.equal(result.unfinishedJobCount, 3)
  assert.equal(result.unacceptedResultCount, 0)
  assert.equal(result.unsavedProjectCount, 0)
})

for (const change of ['added-tab', 'removed-tab', 'dirty-tab', 'model-read-tab-change'] as const) {
  test(`concurrent ${change} refuses the old tab snapshot`, async () => {
    const fixture = controlled()
    const changeTabs = () => {
      if (change === 'added-tab') {
        fixture.tabs.push(tab('third'))
      } else if (change === 'removed-tab') {
        fixture.tabs.pop()
      } else {
        fixture.tabs[0].dirty = false
      }
    }
    if (change === 'model-read-tab-change') {
      fixture.dependencies.getModelImpact = () => {
        changeTabs()
        return modelImpact()
      }
    } else {
      fixture.dependencies.getQueueImpact = async () => {
        changeTabs()
        return { unfinishedJobCount: 3 }
      }
    }
    await assert.rejects(
      collectApplicationUpdateInstallPreview(fixture.dependencies),
      /Refresh the installation review/,
    )
  })
}

test('tab reorder alone preserves the same operational snapshot', async () => {
  const fixture = controlled()
  fixture.dependencies.getQueueImpact = async () => {
    fixture.tabs.reverse()
    return { unfinishedJobCount: 3 }
  }
  assert.equal(
    (await collectApplicationUpdateInstallPreview(fixture.dependencies)).openProjectCount,
    2,
  )
})

test('duplicate Project identity refuses rather than counting the same results twice', async () => {
  const fixture = controlled()
  fixture.tabs.push(tab('first'))
  await assert.rejects(collectApplicationUpdateInstallPreview(fixture.dependencies), /unavailable/)
  assert.deepEqual(fixture.calls, [])
})

for (const source of ['queue', 'project', 'models'] as const) {
  test(`${source} inspection failure propagates without fabricating an empty impact`, async () => {
    const fixture = controlled()
    const failure = new Error('Controlled inspection failure')
    const fail = () => {
      throw failure
    }
    if (source === 'queue') {
      fixture.dependencies.getQueueImpact = fail
    } else if (source === 'project') {
      fixture.dependencies.getProjectImpact = fail
    } else {
      fixture.dependencies.getModelImpact = fail
    }
    await assert.rejects(collectApplicationUpdateInstallPreview(fixture.dependencies), failure)
  })
}

for (const source of ['queue', 'candidate', 'models', 'overflow'] as const) {
  test(`${source} invalid count refuses before returning a review`, async () => {
    const fixture = controlled()
    if (source === 'queue') {
      fixture.dependencies.getQueueImpact = async () => ({ unfinishedJobCount: -1 })
    } else if (source === 'candidate' || source === 'overflow') {
      fixture.dependencies.getProjectImpact = async () => ({
        completedCandidateCount: source === 'overflow' ? Number.MAX_SAFE_INTEGER : Number.NaN,
        generationStorageUnavailable: false,
        unfinishedJobCount: 0,
      })
    } else {
      fixture.dependencies.getModelImpact = () => ({ ...modelImpact(), activeJobCount: 0.5 })
    }
    await assert.rejects(
      collectApplicationUpdateInstallPreview(fixture.dependencies),
      /unavailable/,
    )
  })
}
