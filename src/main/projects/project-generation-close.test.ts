import type { ProjectTab } from '../../shared/api.js'

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { ProjectGenerationClose, ProjectGenerationCloseError } from './project-generation-close.js'

const TAB_ID = `project-v1-${'a'.repeat(64)}`

function closeFixture() {
  const actions: string[] = []
  const state = {
    completed: 0,
    dirty: false,
    fenced: false,
    open: true,
    unfinished: 0,
    workerExitConfirmed: true,
  }
  const close = new ProjectGenerationClose(
    {
      close: async () => {
        actions.push('document-close')
        state.open = false
      },
      discardAndClose: async () => {
        actions.push('document-discard-close')
        state.open = false
      },
      getOpenTabs: () => (state.open ? ([{ dirty: state.dirty, id: TAB_ID }] as ProjectTab[]) : []),
    },
    {
      orchestrator: {
        cancelProjectJobs: async () => {
          actions.push('cancel-jobs')
          if (!state.workerExitConfirmed) {
            throw new Error('Worker exit unconfirmed')
          }
          state.unfinished = 0
        },
        completeProjectGenerationClose: () => actions.push('complete-generation-close'),
        fenceProjectGeneration: async () => {
          state.fenced = true
          actions.push('fence')
        },
        releaseProjectGenerationFence: () => {
          state.fenced = false
          actions.push('release-fence')
        },
      },
      queue: {
        listUnfinishedByProject: async () => Array.from({ length: state.unfinished }, () => ({})),
      },
      staging: {
        discardProject: async () => {
          actions.push('discard-staging')
          state.completed = 0
        },
        listVerifiedCandidates: async () => Array.from({ length: state.completed }, () => ({})),
      },
    },
  )
  return { actions, close, state }
}

test('a late impact requires confirmation without canceling a job or discarding a candidate', async () => {
  const fixture = closeFixture()
  assert.deepEqual(await fixture.close.getCloseImpact(TAB_ID), {
    completedCandidateCount: 0,
    generationStorageUnavailable: false,
    unfinishedJobCount: 0,
  })
  fixture.state.unfinished = 1
  fixture.state.completed = 2
  await assert.rejects(
    fixture.close.close(TAB_ID, { confirmCloseImpact: false, discardDocument: false }),
    (error: unknown) =>
      error instanceof ProjectGenerationCloseError &&
      error.code === 'PROJECT_CLOSE_CONFIRMATION_REQUIRED',
  )
  assert.deepEqual(fixture.actions, ['fence', 'release-fence'])
  assert.equal(fixture.state.open, true)
  assert.equal(fixture.state.unfinished, 1)
  assert.equal(fixture.state.completed, 2)

  await fixture.close.close(TAB_ID, { confirmCloseImpact: true, discardDocument: false })
  assert.deepEqual(fixture.actions.slice(2), [
    'fence',
    'cancel-jobs',
    'discard-staging',
    'document-close',
    'complete-generation-close',
  ])
  assert.equal(fixture.state.open, false)
})

test('unconfirmed worker exit keeps the Project open and staging intact for retry', async () => {
  const fixture = closeFixture()
  fixture.state.unfinished = 1
  fixture.state.completed = 1
  fixture.state.workerExitConfirmed = false
  await assert.rejects(
    fixture.close.close(TAB_ID, { confirmCloseImpact: true, discardDocument: true }),
    /Worker exit unconfirmed/,
  )
  assert.deepEqual(fixture.actions, ['fence', 'cancel-jobs'])
  assert.equal(fixture.state.fenced, true)
  assert.equal(fixture.state.open, true)
  assert.equal(fixture.state.completed, 1)

  fixture.state.workerExitConfirmed = true
  await fixture.close.close(TAB_ID, { confirmCloseImpact: true, discardDocument: true })
  assert.deepEqual(fixture.actions.slice(2), [
    'fence',
    'cancel-jobs',
    'discard-staging',
    'document-discard-close',
    'complete-generation-close',
  ])
})

test('dirty clean-close preflight does not touch generation state', async () => {
  const fixture = closeFixture()
  fixture.state.dirty = true
  fixture.state.unfinished = 1
  await assert.rejects(
    fixture.close.close(TAB_ID, { confirmCloseImpact: true, discardDocument: false }),
    (error: unknown) =>
      error instanceof ProjectGenerationCloseError && error.code === 'PROJECT_DIRTY',
  )
  assert.deepEqual(fixture.actions, [])
  assert.equal(fixture.state.open, true)
  assert.equal(fixture.state.unfinished, 1)
})

test('unavailable generation storage requires warning but allows a close that preserves recovery', async () => {
  const actions: string[] = []
  let open = true
  const close = new ProjectGenerationClose(
    {
      close: async () => {
        actions.push('document-close')
        open = false
      },
      discardAndClose: async () => {
        actions.push('document-discard-close')
        open = false
      },
      getOpenTabs: () => (open ? ([{ dirty: false, id: TAB_ID }] as ProjectTab[]) : []),
    },
    null,
  )
  assert.deepEqual(await close.getCloseImpact(TAB_ID), {
    completedCandidateCount: 0,
    generationStorageUnavailable: true,
    unfinishedJobCount: 0,
  })
  await assert.rejects(
    close.close(TAB_ID, { confirmCloseImpact: false, discardDocument: false }),
    (error: unknown) =>
      error instanceof ProjectGenerationCloseError &&
      error.code === 'PROJECT_CLOSE_CONFIRMATION_REQUIRED',
  )
  assert.deepEqual(actions, [])
  await close.close(TAB_ID, { confirmCloseImpact: true, discardDocument: false })
  assert.deepEqual(actions, ['document-close'])
})
