import type {
  ProjectLayerView,
  ProjectRasterLayerView,
  ProjectSmartPatchLayerView,
} from '../../shared/api.js'
import { createEmptyProjectDocumentV1 } from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { fitTargetBounds } from './project-canvas-geometry.js'
import { rasterLayerViews, selectedSmartPatchLayer } from './project-layer-context.js'

function raster(id: string, x: number): ProjectRasterLayerView {
  return {
    blendMode: 'normal',
    height: 48,
    id,
    imageUrl: `imagegen://assets/${id}.img`,
    locked: false,
    name: id,
    opacity: 1,
    transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x, y: -8 },
    visible: true,
    width: 64,
  }
}
function patch(): ProjectSmartPatchLayerView {
  return {
    activeRasterSubLayerId: null,
    blendMode: 'normal',
    boundingBox: { height: 384, width: 384, x: 4000, y: -4000 },
    generationDraft: createEmptyProjectDocumentV1({ title: 'Owned empty patch' }).generationDraft,
    id: 'patch-owner',
    internalResolution: { height: 768, width: 768 },
    kind: 'smart-patch',
    locked: false,
    mask: { asset: null, id: '027bfaaa-ff12-4d21-a0a5-8d48e88dd8f2', revision: 0 },
    maskImageUrl: null,
    name: 'Empty patch',
    opacity: 1,
    rasterSubLayers: [],
    status: 'empty',
    visible: true,
  }
}

test('real Canvas fit uses visible raster pixels and never a visible empty patch as a raster', () => {
  const top = raster('top', 128)
  const bottom = raster('bottom', -32)
  const empty = patch()
  const layers: ProjectLayerView[] = [top, empty, bottom]
  const before = structuredClone(layers)
  const projected = rasterLayerViews(layers)
  assert.deepEqual(
    projected.map(({ id }) => id),
    ['top', 'bottom'],
  )
  assert.equal(projected[0], top)
  assert.equal(projected[1], bottom)
  assert.deepEqual(fitTargetBounds(projected, { height: 1024, width: 1024, x: 0, y: 0 }), {
    bottom: 40,
    left: -32,
    right: 192,
    top: -8,
  })
  assert.deepEqual(
    layers,
    before,
    'Reading the Canvas projection cannot alter the owned patch or normal layers.',
  )
})

test('a patch-only canvas retains normal bbox fallback without inventing a raster image URL', () => {
  const empty = patch()
  const bbox = { height: 256, width: 320, x: -100, y: 37 }
  assert.deepEqual(rasterLayerViews([empty]), [])
  assert.deepEqual(fitTargetBounds(rasterLayerViews([empty]), bbox), {
    bottom: 293,
    left: -100,
    right: 220,
    top: 37,
  })
})

test('patch editor ownership follows only an acknowledged exact layer selection, independently of Raster selection', () => {
  const empty = patch()
  const normal = raster('normal-owner', 0)
  const layers: ProjectLayerView[] = [normal, empty]
  assert.equal(selectedSmartPatchLayer(layers, empty.id), empty)
  assert.equal(selectedSmartPatchLayer(layers, normal.id), null)
  assert.equal(selectedSmartPatchLayer(layers, 'removed-or-other-document-owner'), null)
  assert.equal(selectedSmartPatchLayer(layers, null), null)
  assert.equal(selectedSmartPatchLayer([normal], empty.id), null)
})
