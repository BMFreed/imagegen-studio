import type {
  ProjectLayerView,
  ProjectRasterLayerView,
  ProjectSmartPatchLayerView,
} from '../../shared/api.js'
import {
  createEmptyProjectDocumentV1,
  type IgsRegionalGuidanceV1,
} from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { fitTargetBounds } from './project-canvas-geometry.js'
import {
  rasterLayerViews,
  resolveSelectedProjectEntity,
  selectedSmartPatchLayer,
} from './project-layer-context.js'

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
    activeRaster: null,
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

test('global entity selection distinguishes regions without selecting owned masks or accepted variants', () => {
  const normal = raster('91d60edf-6f11-4cbe-9403-67791156732a', 0)
  const smart = patch()
  smart.id = '09f79dbe-f221-4cde-b870-6368cc4b3bec'
  const variantId = '7e3c5f06-2349-4f0b-8adb-b92c266b925e'
  smart.rasterSubLayers = [{ id: variantId, name: 'Accepted variant' }]
  smart.activeRasterSubLayerId = variantId
  smart.activeRaster = raster(smart.id, 0)
  smart.status = 'unverified'
  const region = {
    enabled: true,
    id: 'ab201a5c-d7be-49f7-a2e1-06dd5514b13c',
    locked: true,
    mask: { asset: null, id: 'e1dc0ab9-dd1a-44a8-acbf-5ab9ba8d7c92', revision: 0 },
    name: 'Regional Guidance',
    overlayOpacity: 0,
  } satisfies IgsRegionalGuidanceV1
  const tab = { layers: [normal, smart], regionalGuidance: [region] }
  const before = structuredClone(tab)

  assert.deepEqual(resolveSelectedProjectEntity(tab, normal.id), {
    kind: 'compositing-layer',
    layer: normal,
  })
  assert.deepEqual(resolveSelectedProjectEntity(tab, smart.id), {
    kind: 'compositing-layer',
    layer: smart,
  })
  assert.deepEqual(resolveSelectedProjectEntity(tab, region.id), {
    kind: 'regional-guidance',
    region,
  })
  assert.equal(selectedSmartPatchLayer(tab.layers, region.id), null)
  for (const id of [region.mask.id, smart.mask.id, variantId, 'removed-owner', null]) {
    assert.equal(resolveSelectedProjectEntity(tab, id), null)
  }
  assert.equal(resolveSelectedProjectEntity({ layers: tab.layers }, region.id), null)
  assert.equal(
    resolveSelectedProjectEntity({ layers: tab.layers, regionalGuidance: [] }, region.id),
    null,
  )
  assert.deepEqual(tab, before, 'Selection does not change drafts, pixels or region metadata.')
})

test('Canvas projects only the active stored pixels at frozen placement with the Patch owner appearance', () => {
  const owner = patch()
  owner.activeRasterSubLayerId = 'active-variant'
  owner.rasterSubLayers = [
    { id: 'inactive-variant', name: 'Older contribution' },
    { id: 'active-variant', name: 'Active contribution' },
  ]
  owner.status = 'unverified'
  owner.blendMode = 'multiply'
  owner.locked = true
  owner.opacity = 0.375
  owner.activeRaster = raster(owner.id, -32)
  const top = raster('higher-owner', 128)
  const bottom = raster('lower-owner', 256)
  const before = structuredClone(owner)
  const projected = rasterLayerViews([top, owner, bottom])
  assert.deepEqual(
    projected.map(({ id }) => id),
    ['higher-owner', owner.id, 'lower-owner'],
  )
  assert.deepEqual(projected[1], {
    ...owner.activeRaster,
    blendMode: 'multiply',
    locked: true,
    name: owner.name,
    opacity: 0.375,
  })
  assert.deepEqual(fitTargetBounds([projected[1]], owner.boundingBox), {
    bottom: 40,
    left: -32,
    right: 32,
    top: -8,
  })
  assert.equal(selectedSmartPatchLayer([owner], projected[1].id), owner)
  assert.deepEqual(owner, before, 'Display does not turn a Patch into a new Raster owner.')

  const edited = structuredClone(owner)
  edited.boundingBox = { height: 1024, width: 1024, x: -900, y: 900 }
  edited.mask.revision += 1
  assert.deepEqual(rasterLayerViews([edited]), [projected[1]])
  edited.visible = false
  assert.equal(rasterLayerViews([edited])[0]!.visible, false)
  assert.deepEqual(fitTargetBounds(rasterLayerViews([edited]), owner.boundingBox), {
    bottom: -3616,
    left: 4000,
    right: 4384,
    top: -4000,
  })
})
