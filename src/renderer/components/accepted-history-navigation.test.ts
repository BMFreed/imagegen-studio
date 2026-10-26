import type {
  ProjectRasterLayerView,
  ProjectSmartPatchLayerView,
  ProjectTab,
} from '../../shared/api.js'
import type { AcceptedResultHistoryReference } from '../../shared/projects/accepted-result-history.js'
import { createEmptyProjectDocumentV1 } from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'

import {
  acceptedHistoryLayerAvailable,
  resolveAcceptedHistoryTarget,
  smartPatchVariantFocusAvailable,
} from './accepted-history-navigation.js'

function fixture() {
  const reference: AcceptedResultHistoryReference = {
    assetSha256: 'b'.repeat(64),
    documentId: randomUUID(),
    documentRevision: randomUUID(),
    layerId: randomUUID(),
    projectKey: `project-v1-${'a'.repeat(64)}`,
  }
  const currentRevision = randomUUID()
  const imageUrl = `igs-layer://asset/${reference.projectKey}/${currentRevision}/${reference.layerId}/${reference.assetSha256}/${'c'.repeat(64)}.img`
  const layer: ProjectRasterLayerView = {
    blendMode: 'normal',
    height: 16,
    id: reference.layerId,
    imageUrl,
    locked: true,
    name: 'Hidden accepted layer',
    opacity: 0.4,
    transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: -10, y: 20 },
    visible: false,
    width: 16,
  }
  const tab: Pick<
    ProjectTab,
    'acceptedResults' | 'documentId' | 'documentRevision' | 'id' | 'layers'
  > = {
    acceptedResults: [
      {
        acceptedAt: '2026-10-02T00:00:00.000Z',
        height: 8,
        imageUrl,
        layerId: reference.layerId,
        layerName: 'Hidden accepted layer',
        modelFileSha256: 'd'.repeat(64),
        modelName: 'Illustrious',
        modelVersionName: 'v1',
        seed: 0,
        width: 8,
      },
    ],
    documentId: reference.documentId,
    documentRevision: currentRevision,
    id: reference.projectKey,
    layers: [layer],
  }
  return { layer, reference, tab }
}

// Production boundary: the guard used by App and ProjectView before transient layer focus.
// Hidden/locked layers and dirty revisions remain valid; exact ownership and pixels are required.
test('accepted history navigation preserves current tab state and allows a dirty revision', () => {
  const { reference, tab } = fixture()
  const before = structuredClone(tab)
  assert.equal(acceptedHistoryLayerAvailable(tab, reference), true)
  assert.deepEqual(tab, before)
})

test('accepted history navigation refuses missing owners and neighboring documents or assets', () => {
  const { layer, reference, tab } = fixture()
  for (const changed of [
    { ...tab, id: `project-v1-${'e'.repeat(64)}` },
    { ...tab, documentId: randomUUID() },
    { ...tab, layers: [] },
    { ...tab, acceptedResults: [] },
    { ...tab, acceptedResults: [{ ...tab.acceptedResults[0], layerId: randomUUID() }] },
    {
      ...tab,
      layers: [
        {
          ...layer,
          imageUrl: layer.imageUrl.replace(reference.assetSha256, 'e'.repeat(64)),
        },
      ],
    },
  ]) {
    assert.equal(acceptedHistoryLayerAvailable(changed, reference), false)
  }
  for (const imageUrl of [
    layer.imageUrl.replace(reference.layerId, randomUUID()),
    layer.imageUrl.replace(reference.projectKey, `project-v1-${'e'.repeat(64)}`),
    layer.imageUrl.replace(reference.assetSha256, 'e'.repeat(64)),
    `${layer.imageUrl}?asset=other`,
    'igs-staging://asset/other.png',
  ]) {
    assert.equal(
      acceptedHistoryLayerAvailable(
        {
          ...tab,
          acceptedResults: [{ ...tab.acceptedResults[0], imageUrl }],
          layers: [{ ...layer, imageUrl }],
        },
        reference,
      ),
      false,
    )
  }
})

test('accepted history navigation never treats an empty Smart Patch as an accepted Raster owner', () => {
  const { layer, reference, tab } = fixture()
  const patch: ProjectSmartPatchLayerView = {
    activeRaster: null,
    activeRasterSubLayerId: null,
    blendMode: 'normal',
    boundingBox: { height: 256, width: 256, x: 0, y: 0 },
    generationDraft: createEmptyProjectDocumentV1({ title: 'Empty patch' }).generationDraft,
    id: layer.id,
    internalResolution: { height: 512, width: 512 },
    kind: 'smart-patch',
    locked: false,
    mask: { asset: null, id: randomUUID(), revision: 0 },
    maskImageUrl: null,
    name: 'Empty patch',
    opacity: 1,
    rasterSubLayers: [],
    status: 'empty',
    visible: true,
  }
  assert.equal(acceptedHistoryLayerAvailable({ ...tab, layers: [patch] }, reference), false)
  // A stale view carrying an old Raster URL still cannot change the entity's ownership.
  const staleView = { ...patch, imageUrl: layer.imageUrl }
  assert.equal(acceptedHistoryLayerAvailable({ ...tab, layers: [staleView] }, reference), false)
  assert.equal(acceptedHistoryLayerAvailable(tab, reference), true)
})

function nestedFixture() {
  const { layer, reference, tab } = fixture()
  const activeId = randomUUID()
  const patch: ProjectSmartPatchLayerView = {
    activeRaster: {
      ...layer,
      id: randomUUID(),
      imageUrl: layer.imageUrl.replace(reference.layerId, activeId),
    },
    activeRasterSubLayerId: activeId,
    blendMode: 'normal',
    boundingBox: { height: 5, width: 7, x: -19, y: 31 },
    generationDraft: createEmptyProjectDocumentV1({ title: 'Nested history' }).generationDraft,
    id: randomUUID(),
    internalResolution: { height: 64, width: 64 },
    kind: 'smart-patch',
    locked: true,
    mask: { asset: null, id: randomUUID(), revision: 0 },
    maskImageUrl: null,
    name: 'Hidden locked parent',
    opacity: 0.4,
    rasterSubLayers: [
      { id: activeId, name: 'Different active variant' },
      { id: reference.layerId, name: layer.name },
    ],
    status: 'outdated',
    visible: false,
  }
  patch.activeRaster = {
    ...patch.activeRaster!,
    id: patch.id,
    imageUrl: layer.imageUrl.replace(reference.layerId, patch.id),
    name: patch.name,
  }
  tab.layers = [patch]
  return { patch, reference, tab }
}

test('history resolves an inactive stored result to its current parent without activating or editing it', () => {
  const { patch, reference, tab } = nestedFixture()
  const before = structuredClone(tab)
  assert.deepEqual(resolveAcceptedHistoryTarget(tab, reference), {
    kind: 'smart-patch-variant',
    layerId: patch.id,
    variantId: reference.layerId,
  })
  assert.equal(acceptedHistoryLayerAvailable(tab, reference), true)
  assert.notEqual(patch.activeRasterSubLayerId, reference.layerId)
  assert.deepEqual(tab, before)
  const ordinary = fixture()
  assert.deepEqual(resolveAcceptedHistoryTarget(ordinary.tab, ordinary.reference), {
    kind: 'raster',
    layerId: ordinary.layer.id,
  })
})

test('history refuses stale resource revisions, deleted variants and duplicate current owners', () => {
  const { patch, reference, tab } = nestedFixture()
  for (const changed of [
    { ...tab, documentRevision: randomUUID() },
    { ...tab, layers: [{ ...patch, rasterSubLayers: patch.rasterSubLayers.slice(0, 1) }] },
    {
      ...tab,
      layers: [patch, { ...patch, id: randomUUID(), mask: { ...patch.mask, id: randomUUID() } }],
    },
    {
      ...tab,
      acceptedResults: [{ ...tab.acceptedResults[0], imageUrl: patch.activeRaster!.imageUrl }],
    },
    { ...tab, acceptedResults: [{ ...tab.acceptedResults[0], layerName: 'Old name' }] },
  ]) {
    assert.equal(resolveAcceptedHistoryTarget(changed, reference), null)
  }
  assert.ok(resolveAcceptedHistoryTarget(tab, reference))
})

test('browser focus binds the exact current owner, document revision and saved result pixels', () => {
  const { patch, reference, tab } = nestedFixture()
  const request = {
    assetSha256: reference.assetSha256,
    documentId: tab.documentId,
    documentRevision: tab.documentRevision,
    layerId: patch.id,
    requestId: 7,
    tabId: tab.id,
    variantId: reference.layerId,
  }
  const before = structuredClone(tab)
  assert.equal(smartPatchVariantFocusAvailable(tab, patch.id, request), true)
  for (const changed of [
    { ...request, documentRevision: randomUUID() },
    { ...request, documentId: randomUUID() },
    { ...request, layerId: randomUUID() },
    { ...request, tabId: `project-v1-${'e'.repeat(64)}` },
    { ...request, variantId: patch.activeRasterSubLayerId! },
    { ...request, assetSha256: 'e'.repeat(64) },
  ]) {
    assert.equal(smartPatchVariantFocusAvailable(tab, patch.id, changed), false)
  }
  assert.deepEqual(tab, before)
})
