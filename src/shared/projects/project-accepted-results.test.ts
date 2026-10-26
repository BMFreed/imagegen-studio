import assert from 'node:assert/strict'
import test from 'node:test'

import type {
  ProjectAcceptedResultView,
  ProjectRasterLayerView,
  ProjectSmartPatchLayerView,
} from '../api.js'

import {
  isProjectAcceptedResults,
  isProjectAcceptedResultView,
  projectAcceptedResultImageIdentity,
} from './project-accepted-results.js'
import { createEmptyProjectDocumentV1 } from './project-schema.js'

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

test('accepted history admits bounded Smart world dimensions without imposing model processing alignment', () => {
  for (const dimension of [1, 5, 7, 15, 2048]) {
    assert.equal(
      isProjectAcceptedResultView({ ...valid, height: dimension, width: dimension }),
      true,
    )
  }
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
    { ...valid, width: 1.5 },
  ]) {
    assert.equal(isProjectAcceptedResultView(input), false, JSON.stringify(input))
  }
})

function ownedFixture() {
  const image = projectAcceptedResultImageIdentity(valid.imageUrl)!
  const raster: ProjectRasterLayerView = {
    blendMode: 'normal',
    height: 1024,
    id: valid.layerId,
    imageUrl: valid.imageUrl,
    locked: false,
    name: valid.layerName,
    opacity: 1,
    transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 0, y: 0 },
    visible: true,
    width: 768,
  }
  const variantIds = [
    '00000000-0000-4000-8000-000000000004',
    '00000000-0000-4000-8000-000000000005',
  ]
  const patch: ProjectSmartPatchLayerView = {
    activeRaster: null,
    activeRasterSubLayerId: variantIds[0],
    blendMode: 'normal',
    boundingBox: { height: 5, width: 7, x: -19, y: 31 },
    generationDraft: createEmptyProjectDocumentV1({ title: 'Owned history' }).generationDraft,
    id: '00000000-0000-4000-8000-000000000003',
    internalResolution: { height: 64, width: 64 },
    kind: 'smart-patch',
    locked: true,
    mask: { asset: null, id: '00000000-0000-4000-8000-000000000006', revision: 0 },
    maskImageUrl: null,
    name: 'Hidden locked Patch',
    opacity: 1,
    rasterSubLayers: variantIds.map((id, index) => ({ id, name: `Stored variant ${index}` })),
    status: 'unverified',
    visible: false,
  }
  patch.activeRaster = {
    ...raster,
    id: patch.id,
    imageUrl: valid.imageUrl.replace(valid.layerId, patch.id),
    locked: true,
    name: patch.name,
    visible: false,
  }
  const results = [
    valid,
    ...patch.rasterSubLayers.map((variant) => ({
      ...valid,
      height: 5,
      imageUrl: valid.imageUrl.replace(valid.layerId, variant.id),
      layerId: variant.id,
      layerName: variant.name,
      width: 7,
    })),
  ]
  return {
    patch,
    raster,
    results,
    tab: {
      documentRevision: image.documentRevision,
      id: image.projectKey,
      layers: [raster, patch],
    },
  }
}

// Production boundary: this is the ownership predicate called by the actual preload ProjectTab guard.
test('preload ownership includes every accepted variant, independently of active, hidden and locked state', () => {
  const { results, tab } = ownedFixture()
  const before = structuredClone({ results, tab })
  assert.ok(results.length > tab.layers.length)
  assert.equal(isProjectAcceptedResults(results, tab), true)
  assert.deepEqual({ results, tab }, before)
})

test('preload ownership rejects foreign scope, parent image substitution and ambiguous variant membership', () => {
  const { patch, raster, results, tab } = ownedFixture()
  const inactive = results[2]
  for (const changed of [
    { ...inactive, layerName: patch.name },
    { ...inactive, imageUrl: patch.activeRaster!.imageUrl, layerId: patch.id },
    { ...inactive, imageUrl: patch.activeRaster!.imageUrl },
    { ...inactive, imageUrl: results[1].imageUrl },
    { ...inactive, imageUrl: inactive.imageUrl.replace(tab.id, `project-v1-${'e'.repeat(64)}`) },
    {
      ...inactive,
      imageUrl: inactive.imageUrl.replace(
        tab.documentRevision,
        '00000000-0000-4000-8000-000000000099',
      ),
    },
    { ...inactive, imageUrl: `${inactive.imageUrl}#other` },
  ]) {
    assert.equal(isProjectAcceptedResults([changed], tab), false)
  }
  assert.equal(isProjectAcceptedResults([inactive, inactive], tab), false)
  assert.equal(
    isProjectAcceptedResults([inactive], {
      ...tab,
      layers: [raster, { ...patch, rasterSubLayers: patch.rasterSubLayers.slice(0, 1) }],
    }),
    false,
  )
  assert.equal(
    isProjectAcceptedResults([inactive], {
      ...tab,
      layers: [
        raster,
        patch,
        {
          ...patch,
          id: '00000000-0000-4000-8000-000000000007',
          mask: { ...patch.mask, id: '00000000-0000-4000-8000-000000000008' },
        },
      ],
    }),
    false,
  )
  assert.equal(
    isProjectAcceptedResults(
      [{ ...valid, imageUrl: valid.imageUrl.replace('b'.repeat(64), 'e'.repeat(64)) }],
      tab,
    ),
    false,
  )
  assert.equal(isProjectAcceptedResults(results, tab), true)
})
