import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

import { isProjectGenerationResultsSnapshot } from './project-generation-results.js'
import { IGS_SAFETY_CEILINGS } from './project-schema.js'

test('preload result guard requires a valid document-mismatch diagnostic', () => {
  const projectKey = `project-v1-${'a'.repeat(64)}`
  const stagingSessionId = randomUUID()
  const candidateId = randomUUID()
  const result = {
    candidates: [
      {
        actualSeed: 42,
        bbox: { height: 64, width: 64, x: -24, y: 48 },
        candidateId,
        completedAt: '2026-09-29T12:00:00.000Z',
        completionOrder: 1,
        imageUrl: `igs-staging://asset/${projectKey}/${stagingSessionId}/${candidateId}/${'b'.repeat(64)}/${'c'.repeat(64)}.png`,
        queueItemId: randomUUID(),
        sourceDocumentMismatch: false,
        stagingSessionId,
      },
    ],
    lastActualSeed: 42,
    recoveryUnavailable: false,
    unfinishedSiblingJobIds: [],
  }
  assert.equal(isProjectGenerationResultsSnapshot(result), true)
  assert.equal(
    isProjectGenerationResultsSnapshot({
      ...result,
      candidates: [{ ...result.candidates[0], sourceDocumentMismatch: true }],
    }),
    true,
  )
  const { sourceDocumentMismatch: _missing, ...withoutMismatch } = result.candidates[0]
  assert.equal(
    isProjectGenerationResultsSnapshot({ ...result, candidates: [withoutMismatch] }),
    false,
  )
  assert.equal(
    isProjectGenerationResultsSnapshot({
      ...result,
      candidates: [{ ...result.candidates[0], sourceDocumentMismatch: 'false' }],
    }),
    false,
  )
  assert.equal(
    isProjectGenerationResultsSnapshot({
      ...result,
      candidates: [
        {
          ...result.candidates[0],
          imageUrl: result.candidates[0].imageUrl.replace(candidateId, randomUUID()),
        },
      ],
    }),
    false,
  )
  assert.equal(isProjectGenerationResultsSnapshot({ ...result, recoveryUnavailable: true }), false)
  assert.equal(isProjectGenerationResultsSnapshot({ ...result, lastActualSeed: 0 }), true)
  assert.equal(isProjectGenerationResultsSnapshot({ ...result, lastActualSeed: null }), true)
  assert.equal(isProjectGenerationResultsSnapshot({ ...result, lastActualSeed: -1 }), false)
  assert.equal(
    isProjectGenerationResultsSnapshot({ ...result, lastActualSeed: 0x1_00_00_00_00 }),
    false,
  )
})

test('preload guard requires a bounded unique UUID list and never reports jobs in degraded recovery', () => {
  const jobId = randomUUID()
  const result = {
    candidates: [],
    lastActualSeed: null,
    recoveryUnavailable: false,
    unfinishedSiblingJobIds: [jobId],
  }
  assert.equal(isProjectGenerationResultsSnapshot(result), true)
  const { unfinishedSiblingJobIds: _missing, ...withoutJobs } = result
  assert.equal(isProjectGenerationResultsSnapshot(withoutJobs), false)
  for (const invalid of [
    null,
    'jobs',
    [7],
    ['not-a-uuid'],
    [jobId.toUpperCase()],
    [jobId, jobId],
  ]) {
    assert.equal(
      isProjectGenerationResultsSnapshot({ ...result, unfinishedSiblingJobIds: invalid }),
      false,
    )
  }
  const maximumJobs = Array.from({ length: IGS_SAFETY_CEILINGS.archiveEntries }, () => randomUUID())
  assert.equal(
    isProjectGenerationResultsSnapshot({ ...result, unfinishedSiblingJobIds: maximumJobs }),
    true,
  )
  assert.equal(
    isProjectGenerationResultsSnapshot({
      ...result,
      unfinishedSiblingJobIds: [...maximumJobs, randomUUID()],
    }),
    false,
  )
  assert.equal(isProjectGenerationResultsSnapshot({ ...result, recoveryUnavailable: true }), false)
  assert.equal(
    isProjectGenerationResultsSnapshot({
      ...result,
      recoveryUnavailable: true,
      unfinishedSiblingJobIds: [],
    }),
    true,
  )
})
