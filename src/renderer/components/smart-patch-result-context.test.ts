import type {
  ProjectRasterLayerView,
  ProjectSmartPatchLayerView,
  ProjectSmartPatchResultView,
} from '../../shared/api.js'
import { createEmptyProjectDocumentV1 } from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  smartPatchCandidateHasTarget,
  smartPatchPreviewRasters,
} from './smart-patch-result-context.js'

function raster(id: string): ProjectRasterLayerView {
  return {
    blendMode: 'normal',
    height: 10,
    id,
    imageUrl: `image:${id}`,
    locked: false,
    name: id,
    opacity: 1,
    transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 0, y: 0 },
    visible: true,
    width: 10,
  }
}
function fixture() {
  const document = createEmptyProjectDocumentV1({ title: 'Smart preview' })
  const patch: ProjectSmartPatchLayerView = {
    activeRaster: raster('patch'),
    activeRasterSubLayerId: 'old',
    blendMode: 'multiply',
    boundingBox: { height: 100, width: 100, x: 200, y: 200 },
    generationDraft: document.generationDraft,
    id: 'patch',
    internalResolution: { height: 512, width: 512 },
    kind: 'smart-patch',
    locked: false,
    mask: { asset: null, id: 'mask', revision: 0 },
    maskImageUrl: null,
    name: 'Patch',
    opacity: 0.4,
    rasterSubLayers: [{ id: 'old', name: 'Old' }],
    status: 'unverified',
    visible: true,
  }
  const candidate: ProjectSmartPatchResultView = {
    actualSeed: 0,
    bbox: { height: 20, width: 30, x: -30, y: -20 },
    candidateId: 'candidate',
    completedAt: '2026-10-17T00:00:00.000Z',
    completionOrder: 1,
    disposition: 'available',
    documentId: document.documentId,
    imageUrl: 'smart:candidate',
    kind: 'smart-patch-world-candidate',
    layerId: patch.id,
    layerName: patch.name,
    queueItemId: 'job',
    stagingSessionId: 'session',
    unavailableReason: null,
  }
  return { candidate, document, layers: [raster('above'), patch, raster('below')], patch }
}
test('Smart preview replaces only its own stored contribution at the current parent stack position with frozen world bounds', () => {
  const { candidate, document, layers, patch } = fixture()
  const before = structuredClone(layers)
  const display = smartPatchPreviewRasters(layers, candidate, document.documentId)
  assert.deepEqual(
    display.map(({ id }) => id),
    ['above', 'patch', 'below'],
  )
  assert.deepEqual(display[1], {
    ...raster('patch'),
    blendMode: 'multiply',
    height: 20,
    imageUrl: 'smart:candidate',
    name: 'Patch',
    opacity: 0.4,
    transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: -30, y: -20 },
    width: 30,
  })
  assert.deepEqual(layers, before)
  assert.equal(patch.activeRaster?.imageUrl, 'image:patch')
})
test('an empty Patch still reserves its exact stack position for a temporary result', () => {
  const { candidate, document, layers, patch } = fixture()
  patch.activeRaster = null
  patch.activeRasterSubLayerId = null
  patch.rasterSubLayers = []
  assert.deepEqual(
    smartPatchPreviewRasters(layers, null, document.documentId).map(({ id }) => id),
    ['above', 'below'],
  )
  assert.deepEqual(
    smartPatchPreviewRasters(layers, candidate, document.documentId).map(({ id }) => id),
    ['above', 'patch', 'below'],
  )
})
test('an orphaned or foreign-document result never substitutes a neighboring Patch even when an ID collides', () => {
  const { candidate, document, layers } = fixture()
  const foreign = { ...candidate, documentId: 'another-document' }
  assert.equal(smartPatchCandidateHasTarget(layers, foreign, document.documentId), false)
  assert.equal(
    smartPatchPreviewRasters(layers, foreign, document.documentId)[1]?.imageUrl,
    'image:patch',
  )
  const orphan = { ...candidate, layerId: 'missing-patch' }
  assert.equal(smartPatchCandidateHasTarget(layers, orphan, document.documentId), false)
  assert.equal(
    smartPatchPreviewRasters(layers, orphan, document.documentId)[1]?.imageUrl,
    'image:patch',
  )
})
test('current hidden, locked, opacity and blend state applies to the preview without changing candidate pixels or metadata', () => {
  const { candidate, document, layers, patch } = fixture()
  patch.visible = false
  patch.locked = true
  patch.opacity = 0.2
  patch.blendMode = 'screen'
  const before = structuredClone(candidate)
  assert.deepEqual(smartPatchPreviewRasters(layers, candidate, document.documentId)[1], {
    ...raster('patch'),
    blendMode: 'screen',
    height: 20,
    imageUrl: 'smart:candidate',
    locked: true,
    name: 'Patch',
    opacity: 0.2,
    transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: -30, y: -20 },
    visible: false,
    width: 30,
  })
  assert.deepEqual(candidate, before)
})
