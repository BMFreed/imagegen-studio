import type {
  ProjectSmartPatchLayerView,
  ProjectSmartPatchVariantChange,
  ProjectTab,
} from '../../shared/api.js'
import { createEmptyProjectDocumentV1 } from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  captureSmartPatchVariantOwner,
  smartPatchVariantOwnerAfterFlush,
} from './smart-patch-variant-owner.js'

function fixture() {
  const document = createEmptyProjectDocumentV1({ title: 'Variants' })
  const layer: ProjectSmartPatchLayerView = {
    activeRaster: null,
    activeRasterSubLayerId: 'variant-a',
    blendMode: 'normal',
    boundingBox: document.primaryBbox,
    generationDraft: structuredClone(document.generationDraft),
    id: 'patch',
    internalResolution: { height: 512, width: 512 },
    kind: 'smart-patch',
    locked: false,
    mask: { asset: null, id: 'mask', revision: 0 },
    maskImageUrl: null,
    name: 'Patch',
    opacity: 1,
    rasterSubLayers: [
      { id: 'variant-a', name: 'First' },
      { id: 'variant-b', name: 'Second' },
    ],
    status: 'unverified',
    visible: true,
  }
  const tab: ProjectTab = {
    acceptedResults: [],
    autosaveError: null,
    canRedo: false,
    canUndo: true,
    dirty: true,
    documentId: document.documentId,
    documentRevision: document.documentRevision,
    generationDraft: document.generationDraft,
    id: 'tab',
    lastActualSeedSnapshot: document.lastActualSeedSnapshot,
    layers: [layer],
    primaryBbox: document.primaryBbox,
    title: document.title,
  }
  const change: ProjectSmartPatchVariantChange = {
    documentId: tab.documentId,
    documentRevision: tab.documentRevision,
    kind: 'delete',
    variantId: 'variant-b',
  }
  return { change, layer, tab }
}

test('variant commands retain the reviewed owner through a no-op draft flush', () => {
  const { change, tab } = fixture()
  const before = structuredClone(tab)
  const owner = captureSmartPatchVariantOwner(tab, 'patch', change)
  assert.ok(owner)
  assert.equal(smartPatchVariantOwnerAfterFlush(owner, structuredClone(tab)), true)
  assert.deepEqual(tab, before)
})

test('a draft acknowledgment with a new revision requires a fresh user command even if visible DTO data matches', () => {
  const { change, tab } = fixture()
  const owner = captureSmartPatchVariantOwner(tab, 'patch', change)
  assert.ok(owner)
  const acknowledged = { ...tab, documentRevision: 'new-draft-revision' }
  assert.equal(smartPatchVariantOwnerAfterFlush(owner, acknowledged), false)
  const retry = captureSmartPatchVariantOwner(acknowledged, 'patch', {
    ...change,
    documentRevision: acknowledged.documentRevision,
  })
  assert.ok(retry)
  assert.equal(smartPatchVariantOwnerAfterFlush(retry, acknowledged), true)
})

test('foreign documents, tabs and stale browser revisions never inherit a variant command', () => {
  const { change, tab } = fixture()
  const owner = captureSmartPatchVariantOwner(tab, 'patch', change)
  assert.ok(owner)
  assert.equal(
    captureSmartPatchVariantOwner(tab, 'patch', { ...change, documentRevision: 'stale' }),
    null,
  )
  assert.equal(
    captureSmartPatchVariantOwner(tab, 'patch', { ...change, documentId: 'foreign' }),
    null,
  )
  assert.equal(smartPatchVariantOwnerAfterFlush(owner, { ...tab, documentId: 'foreign' }), false)
  assert.equal(smartPatchVariantOwnerAfterFlush(owner, { ...tab, id: 'other-tab' }), false)
  assert.equal(smartPatchVariantOwnerAfterFlush(owner, undefined), false)
})

test('locking or removing the reviewed member during flush refuses the mutation without selecting a fallback', () => {
  const { change, layer, tab } = fixture()
  const owner = captureSmartPatchVariantOwner(tab, 'patch', change)
  assert.ok(owner)
  layer.locked = true
  assert.equal(smartPatchVariantOwnerAfterFlush(owner, tab), false)
  assert.equal(captureSmartPatchVariantOwner(tab, 'patch', change), null)
  layer.locked = false
  layer.rasterSubLayers = layer.rasterSubLayers.filter(({ id }) => id !== change.variantId)
  assert.equal(smartPatchVariantOwnerAfterFlush(owner, tab), false)
  assert.equal(layer.activeRasterSubLayerId, 'variant-a')
})

test('hidden Patch variants remain editable and the final stored member remains addressable', () => {
  const { change, layer, tab } = fixture()
  layer.visible = false
  layer.rasterSubLayers = layer.rasterSubLayers.filter(({ id }) => id === change.variantId)
  layer.activeRasterSubLayerId = change.variantId
  const owner = captureSmartPatchVariantOwner(tab, 'patch', change)
  assert.ok(owner)
  assert.equal(smartPatchVariantOwnerAfterFlush(owner, tab), true)
})
