import {
  createEmptyProjectDocumentV1,
  type IgsProjectDocumentV1,
  type IgsRasterLayerV1,
  parseProjectDocumentV1,
} from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'

import { projectAcceptedResults } from './project-accepted-results.js'
import { parseProjectLayerImageUrl, resolveProjectLayerAsset } from './project-layer-resource.js'
import {
  acceptedOutputPngFixture,
  acceptedRasterProvenanceFixture,
} from './test-fixtures/accepted-provenance.js'

const projectId = `project-v1-${'a'.repeat(64)}`
const ids = [1, 2, 3, 4].map(
  (number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`,
)

async function documentFixture(): Promise<IgsProjectDocumentV1> {
  const empty = createEmptyProjectDocumentV1({ title: 'Accepted projection subject' })
  const png = await acceptedOutputPngFixture(8, 16)
  const bbox = { height: 16, width: 8, x: 21, y: -13 }
  const provenance = acceptedRasterProvenanceFixture(empty, png, bbox)
  provenance.executionResultContext.acceptedAt = '2026-10-01T10:00:00.000Z'
  provenance.generationConfiguration.sampling.actualSeed = 0
  const layer = (id: string): IgsRasterLayerV1 => ({
    asset: {
      bytes: png.length,
      height: 16,
      path: `assets/layers/${id}.png`,
      sha256: createHash('sha256').update(png).digest('hex'),
      width: 8,
    },
    blendMode: 'normal',
    generationProvenance: structuredClone(provenance),
    id,
    kind: 'raster',
    locked: false,
    name: 'Accepted original',
    opacity: 1,
    transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 21, y: -13 },
    visible: true,
  })
  const oldest = layer(ids[2])
  oldest.generationProvenance!.executionResultContext.acceptedAt = '2026-09-30T10:00:00.000Z'
  oldest.generationProvenance!.generationConfiguration.sampling.actualSeed = 17
  const renamedHidden = layer(ids[1])
  renamedHidden.name = 'Current renamed layer'
  renamedHidden.visible = false
  renamedHidden.opacity = 0.3
  renamedHidden.asset.width = 16
  renamedHidden.asset.height = 32
  renamedHidden.transform = { rotationDegrees: 90, scaleX: 5, scaleY: 2, x: -900, y: 300 }
  const imported = layer(ids[3])
  delete imported.generationProvenance
  imported.name = 'Imported image without generation provenance'
  return parseProjectDocumentV1({
    ...empty,
    generationDraft: {
      ...empty.generationDraft,
      model: {
        ...provenance.generationConfiguration.model,
        displayName: 'A different current checkpoint',
        fileSha256: 'c'.repeat(64),
        versionName: 'Current version, not the frozen version',
      },
      seed: { policy: 'fixed', value: 913 },
    },
    lastActualSeedSnapshot: 777,
    // Deliberately unrelated to acceptance time/order; shared candidate origin is not identity.
    layers: [oldest, renamedHidden, imported, layer(ids[0])],
  })
}

function freezeDeep(value: unknown): void {
  if (typeof value !== 'object' || value === null) {
    return
  }
  Object.freeze(value)
  for (const child of Object.values(value)) {
    freezeDeep(child)
  }
}

test('accepted projection uses layer identities and frozen actual metadata, with stable newest-first order', async () => {
  const document = await documentFixture()
  const before = JSON.stringify(document)
  freezeDeep(document)
  const results = projectAcceptedResults(projectId, document)
  assert.deepEqual(
    results.map((result) => result.layerId),
    [ids[0], ids[1], ids[2]],
  )
  assert.equal(new Set(results.map((result) => result.layerId)).size, 3)
  assert.equal(results[1].layerName, 'Current renamed layer')
  assert.deepEqual(
    results.map((result) => result.seed),
    [0, 0, 17],
  )
  for (const result of results) {
    assert.equal(result.modelName, 'Verified checkpoint')
    assert.equal(result.modelVersionName, 'v1')
    assert.equal(result.modelFileSha256, 'a'.repeat(64))
    assert.equal(result.width, 8)
    assert.equal(result.height, 16)
    const request = parseProjectLayerImageUrl(result.imageUrl)
    assert.ok(request)
    assert.equal(request.tabId, projectId)
    assert.equal(request.layerId, result.layerId)
    assert.ok(resolveProjectLayerAsset(document, request))
    assert.deepEqual(Object.keys(result).sort(), [
      'acceptedAt',
      'height',
      'imageUrl',
      'layerId',
      'layerName',
      'modelFileSha256',
      'modelName',
      'modelVersionName',
      'seed',
      'width',
    ])
  }
  assert.equal(JSON.stringify(document), before)
  // Caller edits the detached projection, never the immutable saved record.
  results[0].modelName = 'Local display mutation'
  assert.equal(JSON.stringify(document), before)
})

test('projection follows current document membership and resource revision without inventing imported history', async () => {
  const document = await documentFixture()
  const before = projectAcceptedResults(projectId, document)
  const reordered = parseProjectDocumentV1({ ...document, layers: [...document.layers].reverse() })
  assert.deepEqual(projectAcceptedResults(projectId, reordered), before)
  const removed = parseProjectDocumentV1({
    ...document,
    documentRevision: '00000000-0000-4000-8000-000000000099',
    layers: document.layers.filter((layer) => layer.id !== ids[0]),
  })
  const after = projectAcceptedResults(projectId, removed)
  assert.deepEqual(
    after.map((result) => result.layerId),
    [ids[1], ids[2]],
  )
  const oldRequest = parseProjectLayerImageUrl(before[1].imageUrl)!
  assert.equal(resolveProjectLayerAsset(removed, oldRequest), null)
  assert.ok(resolveProjectLayerAsset(removed, parseProjectLayerImageUrl(after[0].imageUrl)!))
  const importedOnly = parseProjectDocumentV1({
    ...document,
    layers: document.layers.filter((layer) => layer.id === ids[3]),
  })
  assert.deepEqual(projectAcceptedResults(projectId, importedOnly), [])
  assert.deepEqual(
    projectAcceptedResults(projectId, createEmptyProjectDocumentV1({ title: 'Empty neighbor' })),
    [],
  )
})
