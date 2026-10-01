import assert from 'node:assert/strict'
import test from 'node:test'

import type { ProjectAcceptedResultView } from '../api.js'

import { isProjectAcceptedResultView } from './project-accepted-results.js'

const valid: ProjectAcceptedResultView = {
  acceptedAt: '2026-10-01T10:00:00.000Z',
  height: 1024,
  imageUrl: `igs-layer://asset/project-v1-${'a'.repeat(64)}/00000000-0000-4000-8000-000000000002/00000000-0000-4000-8000-000000000001/${'b'.repeat(64)}/${'c'.repeat(64)}.img`,
  layerId: '00000000-0000-4000-8000-000000000001',
  layerName: 'Accepted layer',
  modelFileSha256: 'b'.repeat(64),
  modelName: 'Frozen checkpoint',
  modelVersionName: 'Exact checkpoint version',
  seed: 0,
  width: 768,
}

test('the actual preload scalar guard preserves valid zero and upper-bound actual seeds', () => {
  assert.equal(isProjectAcceptedResultView(valid), true)
  assert.equal(isProjectAcceptedResultView({ ...valid, seed: 0xff_ff_ff_ff }), true)
})

test('the actual preload scalar guard rejects missing, malformed and out-of-contract fields', () => {
  const missingSeed: Partial<ProjectAcceptedResultView> = { ...valid }
  delete missingSeed.seed
  for (const input of [
    null,
    [],
    {},
    missingSeed,
    ...[-1, 0x1_00_00_00_00, 0.5, NaN, Infinity, null, '0'].map((seed) => ({ ...valid, seed })),
    { ...valid, acceptedAt: '2026-02-30T10:00:00.000Z' },
    { ...valid, acceptedAt: '2026-10-01T10:00:00Z' },
    { ...valid, layerId: 'not-a-layer-id' },
    { ...valid, layerName: '' },
    { ...valid, modelFileSha256: 'not-a-sha256' },
    { ...valid, modelName: '' },
    { ...valid, modelVersionName: '' },
    { ...valid, imageUrl: 'file:///private/results/output.png' },
    { ...valid, imageUrl: 'igs-layer://asset/not-a-signed-resource' },
    { ...valid, imageUrl: `${valid.imageUrl}?path=private` },
    {
      ...valid,
      imageUrl: valid.imageUrl.replace(valid.layerId, '00000000-0000-4000-8000-000000000003'),
    },
    { ...valid, width: 0 },
    { ...valid, height: 2049 },
    { ...valid, width: 15 },
  ]) {
    assert.equal(isProjectAcceptedResultView(input), false, JSON.stringify(input))
  }
})
