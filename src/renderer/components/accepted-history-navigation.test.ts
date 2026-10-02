import type { ProjectTab } from '../../shared/api.js'
import type { AcceptedResultHistoryReference } from '../../shared/projects/accepted-result-history.js'

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
    layers: [
      {
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
      },
    ],
  }
  return { reference, tab }
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
  const { reference, tab } = fixture()
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
          ...tab.layers[0],
          imageUrl: tab.layers[0].imageUrl.replace(reference.assetSha256, 'e'.repeat(64)),
        },
      ],
    },
  ]) {
    assert.equal(acceptedHistoryLayerAvailable(changed, reference), false)
  }
  for (const imageUrl of [
    tab.layers[0].imageUrl.replace(reference.layerId, randomUUID()),
    tab.layers[0].imageUrl.replace(reference.projectKey, `project-v1-${'e'.repeat(64)}`),
    tab.layers[0].imageUrl.replace(reference.assetSha256, 'e'.repeat(64)),
    `${tab.layers[0].imageUrl}?asset=other`,
    'igs-staging://asset/other.png',
  ]) {
    assert.equal(
      acceptedHistoryLayerAvailable(
        {
          ...tab,
          acceptedResults: [{ ...tab.acceptedResults[0], imageUrl }],
          layers: [{ ...tab.layers[0], imageUrl }],
        },
        reference,
      ),
      false,
    )
  }
})
