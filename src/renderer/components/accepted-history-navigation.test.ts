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

import { acceptedHistoryLayerAvailable } from './accepted-history-navigation.js'

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
  const tab: Pick<ProjectTab, 'acceptedResults' | 'documentId' | 'id' | 'layers'> = {
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
