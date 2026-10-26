import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isProjectSmartPatchAcceptRequest,
  isProjectSmartPatchRasterAcceptRequest,
  isProjectSmartPatchResultsSnapshot,
  type ProjectSmartPatchRasterAcceptRequest,
  type ProjectSmartPatchResultsSnapshot,
} from './smart-patch-public-generation.js'

const documentId = '00000000-0000-4000-8000-000000000001'
const documentRevision = '00000000-0000-4000-8000-000000000002'
const layerId = '00000000-0000-4000-8000-000000000003'
const candidateId = '00000000-0000-4000-8000-000000000004'
const otherCandidateId = '00000000-0000-4000-8000-000000000005'
const stagingSessionId = '00000000-0000-4000-8000-000000000006'

function request(): ProjectSmartPatchRasterAcceptRequest {
  return {
    candidateIds: [candidateId],
    documentId,
    documentRevision,
    expectedAvailableIds: [candidateId, otherCandidateId],
    expectedUnfinishedJobIds: [],
    focusedCandidateId: candidateId,
    kind: 'smart-patch-raster',
    layerId,
  }
}

test('Raster acceptance is an explicit reviewed command and never admits renderer assets or provenance', () => {
  const input = request()
  assert.equal(isProjectSmartPatchRasterAcceptRequest(input), true)
  assert.equal(isProjectSmartPatchAcceptRequest(input), false)
  assert.equal(isProjectSmartPatchRasterAcceptRequest({ ...input, kind: 'smart-patch' }), false)
  for (const extra of [
    { assetPath: '/outside/result.png' },
    { imagePngBytes: new Uint8Array([1, 2, 3]) },
    { bbox: { height: 128, width: 128, x: 0, y: 0 } },
    { generationProvenance: {} },
  ]) {
    assert.equal(isProjectSmartPatchRasterAcceptRequest({ ...input, ...extra }), false)
  }
})

test('Raster review requires unique selected identities from the reviewed set and a selected anchor', () => {
  const input = request()
  assert.equal(isProjectSmartPatchRasterAcceptRequest({ ...input, focusedCandidateId: null }), true)
  for (const change of [
    { candidateIds: [] },
    { candidateIds: [candidateId, candidateId] },
    { expectedAvailableIds: [otherCandidateId] },
    { expectedAvailableIds: [candidateId, candidateId] },
    { expectedUnfinishedJobIds: [otherCandidateId, otherCandidateId] },
    { focusedCandidateId: otherCandidateId },
  ]) {
    assert.equal(isProjectSmartPatchRasterAcceptRequest({ ...input, ...change }), false)
  }
})

function snapshot(): ProjectSmartPatchResultsSnapshot {
  const target = {
    disposition: 'orphaned' as const,
    documentId,
    layerId,
    layerName: null,
    unavailableReason: 'The original Smart Patch is missing.',
  }
  return {
    candidates: [
      {
        ...target,
        actualSeed: 0,
        bbox: { height: 7, width: 1, x: -19, y: 31 },
        candidateId,
        completedAt: '2026-10-22T00:00:00.000Z',
        completionOrder: 1,
        imageUrl: `igs-smart-staging://asset/project-v1-${'a'.repeat(64)}/${stagingSessionId}/${candidateId}/${'b'.repeat(64)}/${'c'.repeat(64)}.png`,
        kind: 'smart-patch-world-candidate',
        queueItemId: candidateId,
        rasterConversionUnavailableReason: null,
        stagingSessionId,
      },
    ],
    documentId,
    documentRevision,
    kind: 'smart-patch-results',
    lastActualSeed: 0,
    recoveryUnavailable: false,
    targets: [{ ...target, unfinishedJobIds: [] }],
  }
}

test('Raster availability stays distinct from Variant disposition and supports exact small world bounds', () => {
  const input = snapshot()
  assert.equal(isProjectSmartPatchResultsSnapshot(input), true)
  assert.equal(
    isProjectSmartPatchResultsSnapshot({ ...input, documentId: otherCandidateId }),
    false,
  )
  for (const disposition of ['available', 'blocked', 'foreign-document'] as const) {
    const unavailableReason =
      disposition === 'available' ? null : 'This target cannot be converted.'
    const current = {
      ...input,
      candidates: input.candidates.map((candidate) => ({
        ...candidate,
        disposition,
        unavailableReason,
      })),
      targets: input.targets.map((target) => ({ ...target, disposition, unavailableReason })),
    }
    assert.equal(isProjectSmartPatchResultsSnapshot(current), false)
    current.candidates[0].rasterConversionUnavailableReason = 'Raster conversion is unavailable.'
    assert.equal(isProjectSmartPatchResultsSnapshot(current), true)
  }
  assert.equal(
    isProjectSmartPatchResultsSnapshot({
      ...input,
      candidates: input.candidates.map((candidate) => ({
        ...candidate,
        rasterConversionUnavailableReason: '',
      })),
    }),
    false,
  )
})
