import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isGenerationDenoisingProgress,
  isGenerationProgressSnapshot,
  progressForJob,
} from './generation-progress.js'

const current = {
  documentId: '03f775fa-7436-4ab9-8432-8f0718759369',
  jobId: '486d1d64-3c68-41eb-bf60-377392a422e8',
  projectKey: `project-v1-${'a'.repeat(64)}`,
  statusSequence: 1,
  step: 1,
  totalSteps: 399,
}
const snapshot = { current, revision: 1 }
const job = {
  cancelRequested: false,
  documentId: current.documentId,
  id: current.jobId,
  projectKey: current.projectKey,
  status: 'running',
  statusSequence: 1,
}

test('progress wire guards bound real evaluations and refuse unrelated fields and unsafe identities', () => {
  assert.ok(isGenerationDenoisingProgress({ step: 399, totalSteps: 399 }))
  assert.ok(isGenerationProgressSnapshot(snapshot))
  assert.ok(isGenerationProgressSnapshot({ current: null, revision: 0 }))
  for (const value of [
    { step: 0, totalSteps: 24 },
    { step: 25, totalSteps: 24 },
    { step: 1, totalSteps: 401 },
    { step: 1.5, totalSteps: 24 },
    { outputPath: '/private/file.png', step: 1, totalSteps: 24 },
  ]) {
    assert.equal(isGenerationDenoisingProgress(value), false)
  }
  for (const value of [
    { ...snapshot, revision: -1 },
    { ...snapshot, revision: Number.MAX_SAFE_INTEGER + 1 },
    { ...snapshot, current: { ...current, projectKey: '/home/private' } },
    { ...snapshot, current: { ...current, jobId: 'wrong' } },
    { ...snapshot, current: { ...current, requestId: 'untrusted' } },
  ]) {
    assert.equal(isGenerationProgressSnapshot(value), false)
  }
})

test('progress projection requires exact running job, sequence and both Project identities', () => {
  assert.deepEqual(progressForJob(snapshot, job), current)
  for (const changed of [
    { ...job, id: 'other' },
    { ...job, statusSequence: 2 },
    { ...job, projectKey: `project-v1-${'b'.repeat(64)}` },
    { ...job, documentId: 'f7de0bb3-76e2-4f0b-88ca-936c4772a904' },
    { ...job, status: 'completed' },
    { ...job, status: 'pending' },
    { ...job, cancelRequested: true },
  ]) {
    assert.equal(progressForJob(snapshot, changed), null)
  }
  assert.equal(progressForJob({ current: null, revision: 2 }, job), null)
})
