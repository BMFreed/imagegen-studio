import type {
  ProjectGenerationResultsSnapshot,
  ProjectGenerationResultView,
} from '../../shared/api.js'
import type { GenerationQueueEntry } from '../../shared/projects/generation-queue-manager.js'

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

import {
  GenerationQueueResultNavigator,
  queueResultCandidate,
  queueResultReference,
  resultFocusCandidate,
} from './generation-queue-result.js'

function fixture() {
  const item: GenerationQueueEntry = {
    batchId: randomUUID(),
    cancelRequested: false,
    createdAt: '2026-10-01T00:00:00.000Z',
    details: null,
    documentId: randomUUID(),
    error: null,
    finishedAt: '2026-10-01T00:00:01.000Z',
    id: randomUUID(),
    operation: 'illustrious-txt2img',
    projectKey: `project-v1-${'a'.repeat(64)}`,
    projectName: 'Portrait',
    publicationPending: false,
    stagingSessionId: randomUUID(),
    startedAt: '2026-10-01T00:00:00.000Z',
    status: 'completed',
    statusSequence: 2,
  }
  const candidateId = randomUUID()
  const candidate: ProjectGenerationResultView = {
    actualSeed: 0,
    bbox: { height: 64, width: 96, x: -10, y: 20 },
    candidateId,
    completedAt: item.finishedAt!,
    completionOrder: 1,
    imageUrl: `igs-staging://asset/${item.projectKey}/${item.stagingSessionId}/${candidateId}/${'b'.repeat(64)}/${'c'.repeat(64)}.png`,
    queueItemId: item.id,
    sourceDocumentMismatch: false,
    stagingSessionId: item.stagingSessionId,
  }
  const snapshot: ProjectGenerationResultsSnapshot = {
    candidates: [candidate],
    lastActualSeed: 0,
    recoveryUnavailable: false,
    unfinishedSiblingJobIds: [],
  }
  const reference = queueResultReference(item, candidate, item.documentId)
  return { candidate, item, reference, snapshot }
}

// Boundary: actual renderer projection and async navigator consumed by QueueManager/App/Canvas.
// Invariant: job/session/project/source identity selects one verified result without acceptance.
// Controls: missing cache/settings do not gate valid PNG; neighboring jobs/sessions do not match.
// Mutations: omit job/session matching, block orphan preview, or trust pre-await document identity.
test('Queue previews identify the exact completed result independently of cache or frozen settings', () => {
  const { candidate, item, snapshot } = fixture()
  const neighbor = fixture().candidate
  snapshot.candidates.unshift(neighbor)
  const original = structuredClone(snapshot)
  assert.equal(queueResultCandidate(item, snapshot, item.documentId), candidate)
  assert.equal(
    resultFocusCandidate(
      queueResultReference(item, candidate, item.documentId),
      snapshot.candidates,
      {
        documentId: item.documentId,
        projectKey: item.projectKey,
      },
    ),
    candidate,
  )
  assert.deepEqual(
    snapshot,
    original,
    'preview/focus projection does not mutate the candidate collection',
  )
  for (const change of [
    { id: randomUUID() },
    { stagingSessionId: randomUUID() },
    { projectKey: `project-v1-${'d'.repeat(64)}` },
  ]) {
    assert.equal(queueResultCandidate({ ...item, ...change }, snapshot, item.documentId), null)
  }
})

test('No result is invented for other statuses, pending publication, missing recovery or closed Projects', () => {
  const { item, snapshot } = fixture()
  for (const status of ['pending', 'running', 'failed', 'canceled'] as const) {
    assert.equal(queueResultCandidate({ ...item, status }, snapshot, item.documentId), null)
  }
  assert.equal(
    queueResultCandidate({ ...item, publicationPending: true }, snapshot, item.documentId),
    null,
  )
  assert.equal(queueResultCandidate(item, snapshot, null), null)
  assert.equal(queueResultCandidate(item, null, item.documentId), null)
  assert.equal(queueResultCandidate(item, { ...snapshot, candidates: [] }, item.documentId), null)
  assert.equal(
    queueResultCandidate(item, { ...snapshot, recoveryUnavailable: true }, item.documentId),
    null,
  )
})

test('Recovered source-document mismatch stays previewable but must agree with the displayed document', () => {
  const { candidate, item, snapshot } = fixture()
  const replacementDocument = randomUUID()
  assert.equal(queueResultCandidate(item, snapshot, replacementDocument), null)
  candidate.sourceDocumentMismatch = true
  assert.equal(queueResultCandidate(item, snapshot, replacementDocument), candidate)
  const reference = queueResultReference(item, candidate, replacementDocument)
  assert.equal(reference.sourceDocumentId, item.documentId)
  assert.equal(reference.openDocumentId, replacementDocument)
  assert.equal(
    resultFocusCandidate(reference, snapshot.candidates, {
      documentId: replacementDocument,
      projectKey: item.projectKey,
    }),
    candidate,
  )
  assert.equal(
    resultFocusCandidate(reference, snapshot.candidates, {
      documentId: item.documentId,
      projectKey: item.projectKey,
    }),
    null,
  )
})

test('Focus commands cannot substitute another candidate, job, session, Project or document', () => {
  const { candidate, item, reference, snapshot } = fixture()
  const open = { documentId: item.documentId, projectKey: item.projectKey }
  assert.equal(resultFocusCandidate(reference, snapshot.candidates, open), candidate)
  for (const change of [
    { candidateId: randomUUID() },
    { queueItemId: randomUUID() },
    { stagingSessionId: randomUUID() },
    { projectKey: `project-v1-${'d'.repeat(64)}` },
    { openDocumentId: randomUUID() },
    { sourceDocumentId: randomUUID() },
  ]) {
    assert.equal(resultFocusCandidate({ ...reference, ...change }, snapshot.candidates, open), null)
  }
  assert.equal(resultFocusCandidate(reference, [], open), null)
  assert.equal(resultFocusCandidate(null, snapshot.candidates, open), null)
})

function held<T>() {
  let resolve!: (value: T) => void
  let reject!: (cause: Error) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, reject, resolve }
}

test('Real async navigation rechecks the open document after its fresh Results read', async () => {
  const { item, reference, snapshot } = fixture()
  let documentId: string | null = item.documentId
  let calls = 0
  let read = held<ProjectGenerationResultsSnapshot>()
  const navigator = new GenerationQueueResultNavigator({
    canNavigate: () => true,
    getOpenDocumentId: () => documentId,
    readResults: async (projectKey) => {
      calls += 1
      assert.equal(projectKey, item.projectKey)
      return await read.promise
    },
  })
  const valid = navigator.open(reference)
  assert.equal(calls, 1, 'the actual navigator entered its dependency read')
  read.resolve(snapshot)
  const focused = await valid
  assert.equal(focused.kind, 'focused')
  for (const changedDocument of [randomUUID(), null]) {
    documentId = item.documentId
    read = held<ProjectGenerationResultsSnapshot>()
    const stale = navigator.open(reference)
    documentId = changedDocument
    read.resolve(snapshot)
    assert.equal(
      (await stale).kind,
      'unavailable',
      'late valid pixels cannot authorize a different/closed document',
    )
  }
})

test('Discard, wrong session, malformed data and recovery failure during navigation cannot focus a result', async () => {
  const { item, reference, snapshot } = fixture()
  let fresh = snapshot
  const navigator = new GenerationQueueResultNavigator({
    canNavigate: () => true,
    getOpenDocumentId: () => item.documentId,
    readResults: async () => fresh,
  })
  assert.equal((await navigator.open(reference)).kind, 'focused')
  for (const changed of [
    { ...snapshot, candidates: [] },
    { ...snapshot, candidates: [{ ...snapshot.candidates[0]!, stagingSessionId: randomUUID() }] },
    { ...snapshot, candidates: [], recoveryUnavailable: true },
  ]) {
    fresh = changed
    assert.equal((await navigator.open(reference)).kind, 'unavailable')
  }
})

test('Repeated target gets a new focus revision; closed dialog and superseded reads cannot focus', async () => {
  const { item, reference, snapshot } = fixture()
  let available = true
  let read = held<ProjectGenerationResultsSnapshot>()
  const navigator = new GenerationQueueResultNavigator({
    canNavigate: () => available,
    getOpenDocumentId: () => item.documentId,
    readResults: async () => read.promise,
  })
  const first = navigator.open(reference)
  read.resolve(snapshot)
  const initial = await first
  const repeated = await navigator.open(reference)
  assert.equal(initial.kind, 'focused')
  assert.equal(repeated.kind, 'focused')
  if (initial.kind === 'focused' && repeated.kind === 'focused') {
    assert.ok(repeated.focus.revision > initial.focus.revision)
  }
  read = held<ProjectGenerationResultsSnapshot>()
  const canceled = navigator.open(reference)
  navigator.cancel()
  read.resolve(snapshot)
  assert.equal((await canceled).kind, 'superseded')
  read = held<ProjectGenerationResultsSnapshot>()
  const superseded = navigator.open(reference)
  const newest = navigator.open(reference)
  read.resolve(snapshot)
  assert.equal((await superseded).kind, 'superseded')
  assert.equal((await newest).kind, 'focused')
  read = held<ProjectGenerationResultsSnapshot>()
  const closed = navigator.open(reference)
  available = false
  read.resolve(snapshot)
  assert.equal((await closed).kind, 'superseded')
  available = true
  read = held<ProjectGenerationResultsSnapshot>()
  const canceledFailure = navigator.open(reference)
  navigator.cancel()
  read.reject(new Error('Late stale read failure'))
  assert.equal((await canceledFailure).kind, 'superseded')
})

test('Read failure is observable and closed Project refuses before reading', async () => {
  const { reference } = fixture()
  const navigator = new GenerationQueueResultNavigator({
    canNavigate: () => true,
    getOpenDocumentId: () => reference.openDocumentId,
    readResults: async () => {
      throw new Error('Recovery read failed')
    },
  })
  await assert.rejects(navigator.open(reference), /Recovery read failed/)
  const closed = new GenerationQueueResultNavigator({
    canNavigate: () => true,
    getOpenDocumentId: () => null,
    readResults: async () => {
      assert.fail('closed Project must not read its resources')
    },
  })
  assert.equal((await closed.open(reference)).kind, 'unavailable')
})
