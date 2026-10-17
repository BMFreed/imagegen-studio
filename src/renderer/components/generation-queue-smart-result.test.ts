import type {
  ProjectSmartPatchResultsSnapshot,
  ProjectSmartPatchResultView,
} from '../../shared/api.js'
import type { GenerationQueueEntry } from '../../shared/projects/generation-queue-manager.js'
import { isProjectGenerationResultsSnapshot } from '../../shared/projects/project-generation-results.js'
import { isProjectSmartPatchResultsSnapshot } from '../../shared/projects/smart-patch-public-generation.js'

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

import {
  GenerationQueueResultNavigator,
  queueResultCandidate,
  queueResultOpenReference,
  queueSmartResultCandidate,
  queueSmartResultReference,
  resultFocusCandidate,
  smartResultFocusCandidate,
} from './generation-queue-result.js'

function fixture() {
  const item: GenerationQueueEntry = {
    batchId: randomUUID(),
    cancelRequested: false,
    createdAt: '2026-10-17T00:00:00.000Z',
    details: null,
    documentId: randomUUID(),
    error: null,
    finishedAt: '2026-10-17T00:00:01.000Z',
    id: randomUUID(),
    operation: 'illustrious-smart-patch',
    projectKey: `project-v1-${'a'.repeat(64)}`,
    projectName: 'Smart queue',
    publicationPending: false,
    stagingSessionId: randomUUID(),
    startedAt: '2026-10-17T00:00:00.000Z',
    status: 'completed',
    statusSequence: 2,
  }
  const candidateId = randomUUID()
  const candidate: ProjectSmartPatchResultView = {
    actualSeed: 0,
    bbox: { height: 64, width: 64, x: -16, y: 32 },
    candidateId,
    completedAt: item.finishedAt!,
    completionOrder: 1,
    disposition: 'available',
    documentId: item.documentId,
    imageUrl: `igs-smart-staging://asset/${item.projectKey}/${item.stagingSessionId}/${candidateId}/${'b'.repeat(64)}/${'c'.repeat(64)}.png`,
    kind: 'smart-patch-world-candidate',
    layerId: randomUUID(),
    layerName: 'Exact Patch',
    queueItemId: item.id,
    stagingSessionId: item.stagingSessionId,
    unavailableReason: null,
  }
  const { disposition, documentId, layerId, layerName, unavailableReason } = candidate
  const snapshot: ProjectSmartPatchResultsSnapshot = {
    candidates: [candidate],
    documentId: item.documentId,
    documentRevision: randomUUID(),
    kind: 'smart-patch-results',
    lastActualSeed: 0,
    recoveryUnavailable: false,
    targets: [
      { disposition, documentId, layerId, layerName, unavailableReason, unfinishedJobIds: [] },
    ],
  }
  return {
    candidate,
    item,
    reference: queueSmartResultReference(item, candidate, item.documentId),
    snapshot,
  }
}
function held<T>() {
  let resolve!: (value: T) => void
  let reject!: (cause: Error) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, reject, resolve }
}

test('Smart Queue navigation reads only Smart staging and resolves an exact open or closed result without normal DTO adaptation', async () => {
  const { candidate, item, reference, snapshot } = fixture()
  assert.equal(isProjectSmartPatchResultsSnapshot(snapshot), true)
  assert.equal(isProjectGenerationResultsSnapshot(snapshot), false)
  assert.equal(queueSmartResultCandidate(item, snapshot, item.documentId), candidate)
  assert.equal(
    queueResultCandidate(
      item,
      {
        candidates: [],
        lastActualSeed: null,
        recoveryUnavailable: false,
        unfinishedSiblingJobIds: [],
      },
      item.documentId,
    ),
    null,
  )
  let smartReads = 0
  const navigator = new GenerationQueueResultNavigator({
    canContinueProjectOpen: () => true,
    canNavigate: () => true,
    getOpenDocumentId: () => item.documentId,
    readResults: async () => {
      throw new Error('A Smart result reached normal staging.')
    },
    readSmartResults: async () => {
      smartReads += 1
      return snapshot
    },
  })
  const open = await navigator.open(reference)
  assert.equal(open.kind, 'focused')
  if (open.kind === 'focused') {
    assert.equal(open.focus.layerId, candidate.layerId)
    assert.equal(
      smartResultFocusCandidate(open.focus, snapshot.candidates, {
        documentId: item.documentId,
        projectKey: item.projectKey,
      }),
      candidate,
    )
    assert.equal(
      resultFocusCandidate(open.focus, [], {
        documentId: item.documentId,
        projectKey: item.projectKey,
      }),
      null,
    )
  }
  const closed = queueResultOpenReference(item)
  assert.equal(closed?.targetKind, 'smart-patch')
  navigator.beginProjectOpen(closed)
  assert.equal((await navigator.continueProjectOpen()).kind, 'focused')
  assert.equal((await navigator.continueProjectOpen()).kind, 'superseded')
  assert.equal(smartReads, 2)
})

test('Smart result focus pins job, session, source document, target, candidate and open Project separately', () => {
  const { candidate, item, reference, snapshot } = fixture()
  const open = { documentId: item.documentId, projectKey: item.projectKey }
  for (const change of [
    { queueItemId: randomUUID() },
    { stagingSessionId: randomUUID() },
    { sourceDocumentId: randomUUID() },
    { layerId: randomUUID() },
    { candidateId: randomUUID() },
    { openDocumentId: randomUUID() },
    { projectKey: `project-v1-${'d'.repeat(64)}` },
    { targetKind: undefined },
  ]) {
    assert.equal(
      smartResultFocusCandidate({ ...reference, ...change }, snapshot.candidates, open),
      null,
    )
  }
  assert.equal(
    smartResultFocusCandidate(
      reference,
      [
        {
          ...candidate,
          imageUrl: candidate.imageUrl.replace('igs-smart-staging:', 'igs-staging:'),
        },
      ],
      open,
    ),
    null,
  )
})

test('a superseded Smart Open continuation cannot focus on late success or display a late read failure', async () => {
  const { item, snapshot } = fixture()
  let read = held<ProjectSmartPatchResultsSnapshot>()
  const navigator = new GenerationQueueResultNavigator({
    canContinueProjectOpen: () => true,
    canNavigate: () => true,
    getOpenDocumentId: () => item.documentId,
    readResults: async () => {
      throw new Error('normal')
    },
    readSmartResults: async () => await read.promise,
  })
  navigator.beginProjectOpen(queueResultOpenReference(item)!)
  const late = navigator.continueProjectOpen()
  navigator.cancelProjectOpen()
  read.resolve(snapshot)
  assert.equal((await late).kind, 'superseded')
  read = held<ProjectSmartPatchResultsSnapshot>()
  navigator.beginProjectOpen(queueResultOpenReference(item)!)
  const failure = navigator.continueProjectOpen()
  navigator.cancel()
  read.reject(new Error('obsolete failure'))
  assert.equal((await failure).kind, 'superseded')
})

test('Smart navigation rechecks the open document after await and leaves orphaned results previewable', async () => {
  const { candidate, item, reference, snapshot } = fixture()
  candidate.disposition = 'orphaned'
  candidate.unavailableReason = 'The exact Patch is missing.'
  snapshot.targets[0]!.disposition = 'orphaned'
  snapshot.targets[0]!.unavailableReason = candidate.unavailableReason
  let documentId = item.documentId
  let read = held<ProjectSmartPatchResultsSnapshot>()
  const navigator = new GenerationQueueResultNavigator({
    canContinueProjectOpen: () => true,
    canNavigate: () => true,
    getOpenDocumentId: () => documentId,
    readResults: async () => {
      throw new Error('normal')
    },
    readSmartResults: async () => await read.promise,
  })
  const pending = navigator.open(reference)
  documentId = randomUUID()
  read.resolve(snapshot)
  assert.equal((await pending).kind, 'unavailable')
  documentId = item.documentId
  read = held<ProjectSmartPatchResultsSnapshot>()
  const orphan = navigator.open(reference)
  read.resolve(snapshot)
  assert.equal((await orphan).kind, 'focused')
})

test('preload Smart snapshots reject misleading disposition, unmatched target ownership and source-swapped thumbnails', () => {
  const { candidate, snapshot } = fixture()
  const contradictory = structuredClone(snapshot)
  contradictory.candidates[0]!.unavailableReason = 'Blocked despite available.'
  assert.equal(isProjectSmartPatchResultsSnapshot(contradictory), false)
  const missingTarget = structuredClone(snapshot)
  missingTarget.targets = []
  assert.equal(isProjectSmartPatchResultsSnapshot(missingTarget), false)
  const wrongScope = structuredClone(snapshot)
  wrongScope.targets[0]!.layerId = randomUUID()
  assert.equal(isProjectSmartPatchResultsSnapshot(wrongScope), false)
  const thumbnail = structuredClone(snapshot)
  thumbnail.candidates[0]!.thumbnailUrl = candidate.imageUrl
    .replace('://asset/', '://thumbnail/')
    .replace(`/${'c'.repeat(64)}.png`, `/${'d'.repeat(64)}/${'e'.repeat(64)}.png`)
  assert.equal(isProjectSmartPatchResultsSnapshot(thumbnail), true)
  thumbnail.candidates[0]!.thumbnailUrl = thumbnail.candidates[0]!.thumbnailUrl.replace(
    'b'.repeat(64),
    'f'.repeat(64),
  )
  assert.equal(isProjectSmartPatchResultsSnapshot(thumbnail), false)
})
