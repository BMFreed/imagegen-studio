import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isProjectDocumentId,
  isProjectGenerateOptions,
  isProjectGenerateResult,
  isProjectGenerationActionState,
  type ProjectGenerationActionState,
} from './project-generation-actions.js'

const documentId = '00000000-0000-4000-8000-000000000001'
const id = '00000000-0000-4000-8000-000000000002'
const batchId = '00000000-0000-4000-8000-000000000003'

test('generation document identity accepts the portable .igs UUID domain without replacing it with a local project key', () => {
  for (const documentId of [
    'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA',
    '00000000-0000-0000-0000-000000000000',
  ]) {
    assert.equal(isProjectDocumentId(documentId), true)
    assert.equal(isProjectGenerateOptions({ documentId, iterations: 1 }), true)
    assert.equal(isProjectGenerationActionState({ ...pendingState(), documentId }), true)
    assert.equal(
      isProjectGenerateResult({
        candidateIds: [id],
        documentId,
        kind: 'confirmation-required',
        unfinishedJobIds: [],
      }),
      true,
    )
  }
  assert.equal(isProjectDocumentId(`project-v1-${'0'.repeat(64)}`), false)
})

function pendingState(): ProjectGenerationActionState {
  return {
    cfgRescaleSupported: false,
    documentId,
    embeddingsSupported: false,
    error: null,
    externalVaeSupported: false,
    img2imgSupported: false,
    jobs: [
      {
        batchId,
        createdAt: '2026-09-30T12:00:00.000Z',
        id,
        prompt: 'a lantern',
        seed: 0,
        status: 'pending',
        statusSequence: 0,
      },
    ],
    phase: 'processing',
    runningJobId: null,
    vaePrecisionSupported: false,
  }
}

test('action state validates native Anima support without breaking older advisory responses', () => {
  assert.equal(isProjectGenerationActionState(pendingState()), true)
  for (const animaSupported of [false, true]) {
    assert.equal(isProjectGenerationActionState({ ...pendingState(), animaSupported }), true)
  }
  for (const animaSupported of [null, 0, 'true', {}]) {
    assert.equal(isProjectGenerationActionState({ ...pendingState(), animaSupported }), false)
  }
  assert.equal(
    isProjectGenerationActionState({ ...pendingState(), animaModelPath: '/private' }),
    false,
  )
})

test('Generate wire accepts integer iterations and exact reviewed identities, never paths or duplicate loss sets', () => {
  for (const iterations of [1, 4, 100]) {
    assert.equal(isProjectGenerateOptions({ documentId, iterations }), true)
  }
  assert.equal(
    isProjectGenerateOptions({
      confirmation: { candidateIds: [id], unfinishedJobIds: [] },
      documentId,
      iterations: 4,
    }),
    true,
  )
  for (const options of [
    { documentId, iterations: 0 },
    { documentId, iterations: 101 },
    { documentId, iterations: 1.5 },
    { documentId, iterations: '4' },
    { iterations: 4 },
    { documentId, iterations: 4, outputPath: '/tmp/result.png' },
    { confirmation: { candidateIds: [id, id], unfinishedJobIds: [] }, documentId, iterations: 4 },
    { confirmation: { candidateIds: [id], unfinishedJobIds: ['bad'] }, documentId, iterations: 4 },
  ]) {
    assert.equal(isProjectGenerateOptions(options), false)
  }
})

test('queue wire preserves seed and sequence zero and correlates the only running row', () => {
  const state = pendingState()
  assert.equal(isProjectGenerationActionState(state), true)
  state.jobs[0].status = 'running'
  state.jobs[0].statusSequence = 1
  assert.equal(isProjectGenerationActionState(state), false)
  state.runningJobId = id
  assert.equal(isProjectGenerationActionState(state), true)
  state.runningJobId = batchId
  assert.equal(isProjectGenerationActionState(state), false)
  state.runningJobId = id
  state.jobs.push({ ...state.jobs[0], id: batchId })
  assert.equal(isProjectGenerationActionState(state), false)
})

test('queue wire refuses oversized concrete prompt bytes and undeclared progress', () => {
  const state = pendingState()
  state.jobs[0].prompt = '💡'.repeat(4096)
  assert.equal(isProjectGenerationActionState(state), true)
  state.jobs[0].prompt += '💡'
  assert.equal(isProjectGenerationActionState(state), false)
  assert.equal(isProjectGenerationActionState({ ...pendingState(), progress: 0.5 }), false)
  assert.equal(
    isProjectGenerationActionState({
      ...pendingState(),
      jobs: [pendingState().jobs[0], pendingState().jobs[0]],
    }),
    false,
  )
})

test('action state accepts only an explicit boolean rescale capability without exposing the ready payload', () => {
  for (const cfgRescaleSupported of [false, true]) {
    assert.equal(isProjectGenerationActionState({ ...pendingState(), cfgRescaleSupported }), true)
  }
  for (const cfgRescaleSupported of [undefined, null, 0, 'true']) {
    assert.equal(isProjectGenerationActionState({ ...pendingState(), cfgRescaleSupported }), false)
  }
  assert.equal(
    isProjectGenerationActionState({ ...pendingState(), ready: { runtimeRoot: '/private' } }),
    false,
  )
})

test('action state requires an explicit boolean VAE Precision capability', () => {
  for (const vaePrecisionSupported of [false, true]) {
    assert.equal(isProjectGenerationActionState({ ...pendingState(), vaePrecisionSupported }), true)
  }
  for (const vaePrecisionSupported of [undefined, null, 0, 'true']) {
    assert.equal(
      isProjectGenerationActionState({ ...pendingState(), vaePrecisionSupported }),
      false,
    )
  }
  const legacy = { ...pendingState() } as Partial<ProjectGenerationActionState>
  delete legacy.vaePrecisionSupported
  assert.equal(isProjectGenerationActionState(legacy), false)
})

test('action state requires an explicit boolean external VAE capability', () => {
  for (const externalVaeSupported of [false, true]) {
    assert.equal(isProjectGenerationActionState({ ...pendingState(), externalVaeSupported }), true)
  }
  for (const externalVaeSupported of [undefined, null, 0, 'true']) {
    assert.equal(isProjectGenerationActionState({ ...pendingState(), externalVaeSupported }), false)
  }
  const legacy = { ...pendingState() } as Partial<ProjectGenerationActionState>
  delete legacy.externalVaeSupported
  assert.equal(isProjectGenerationActionState(legacy), false)
})

test('Generate response needs actual bounded admission or a nonempty exact loss review', () => {
  const queued = { batchId, documentId, jobIds: [id], kind: 'queued', truncated: false }
  assert.equal(isProjectGenerateResult(queued), true)
  assert.equal(isProjectGenerateResult({ ...queued, jobIds: [] }), false)
  assert.equal(isProjectGenerateResult({ ...queued, jobIds: [id, id] }), false)
  const review = {
    candidateIds: [id],
    documentId,
    kind: 'confirmation-required',
    unfinishedJobIds: [],
  }
  assert.equal(isProjectGenerateResult(review), true)
  assert.equal(isProjectGenerateResult({ ...review, candidateIds: [] }), false)
  assert.equal(isProjectGenerateResult({ ...review, acceptedLayerIds: [id] }), false)
})

test('action state requires an explicit boolean embedding capability', () => {
  const state = pendingState()
  assert.ok(isProjectGenerationActionState({ ...state, embeddingsSupported: true }))
  const { embeddingsSupported: _ignored, ...missing } = state
  assert.equal(isProjectGenerationActionState(missing), false)
  for (const embeddingsSupported of [undefined, null, 1, 'true']) {
    assert.equal(isProjectGenerationActionState({ ...state, embeddingsSupported }), false)
  }
})
