import type {
  ProjectAcceptedResultView,
  ProjectSmartPatchLayerView,
  ProjectTab,
} from '../../shared/api.js'
import { createEmptyProjectDocumentV1 } from '../../shared/projects/project-schema.js'
import { parseSmartResultPresetData } from '../../shared/projects/smart-result-preset.js'

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'

import { acceptedRasterProvenanceFixture } from '../../main/projects/test-fixtures/accepted-provenance.js'
import {
  captureSmartResultPresetSource,
  smartResultPresetReplyMatches,
  smartResultPresetSourceCurrent,
} from './smart-result-preset-source.js'

function fixture() {
  const document = createEmptyProjectDocumentV1({ title: 'Frozen results.igs' })
  const projectKey = `project-v1-${'a'.repeat(64)}`
  const activeId = randomUUID()
  const inactiveId = randomUUID()
  const imageUrl = (id: string, hash = 'b'.repeat(64)) =>
    `igs-layer://asset/${projectKey}/${document.documentRevision}/${id}/${hash}/${'c'.repeat(64)}.img`
  const patch: ProjectSmartPatchLayerView = {
    activeRaster: null,
    activeRasterSubLayerId: activeId,
    blendMode: 'normal',
    boundingBox: { height: 5, width: 7, x: -19, y: 31 },
    generationDraft: document.generationDraft,
    id: randomUUID(),
    internalResolution: { height: 256, width: 256 },
    kind: 'smart-patch',
    locked: true,
    mask: { asset: null, id: randomUUID(), revision: 0 },
    maskImageUrl: null,
    name: 'Hidden locked Patch',
    opacity: 1,
    rasterSubLayers: [
      { id: activeId, name: 'Active result' },
      { id: inactiveId, name: 'Inspected result' },
    ],
    status: 'outdated',
    visible: false,
  }
  const accepted = (id: string, name: string): ProjectAcceptedResultView => ({
    acceptedAt: '2026-10-22T00:00:00.000Z',
    height: 5,
    imageUrl: imageUrl(id),
    layerId: id,
    layerName: name,
    modelFileSha256: 'd'.repeat(64),
    modelName: 'Missing checkpoint',
    modelVersionName: 'Frozen version',
    seed: 0,
    width: 7,
  })
  const tab: ProjectTab = {
    acceptedResults: patch.rasterSubLayers.map(({ id, name }) => accepted(id, name)),
    autosaveError: null,
    canRedo: false,
    canUndo: true,
    dirty: true,
    documentId: document.documentId,
    documentRevision: document.documentRevision,
    generationDraft: document.generationDraft,
    id: projectKey,
    lastActualSeedSnapshot: null,
    layers: [patch],
    primaryBbox: document.primaryBbox,
    title: document.title,
  }
  const owner = { kind: 'smart-patch-variant' as const, layerId: patch.id, variantId: inactiveId }
  return { activeId, document, imageUrl, inactiveId, owner, patch, tab }
}

test('direct inactive extraction captures hidden/locked stored ownership without activation or authoring changes', () => {
  const { owner, patch, tab } = fixture()
  const before = structuredClone(tab)
  for (const status of ['outdated', 'unverified'] as const) {
    patch.status = status
    const source = captureSmartResultPresetSource(tab, owner, 'variant-action', patch.id)
    assert.ok(source)
    assert.equal(source.layerName, 'Hidden locked Patch · Inspected result')
    assert.deepEqual(source.request.owner, owner)
    assert.equal(source.request.assetSha256, 'b'.repeat(64))
    assert.notEqual(patch.activeRasterSubLayerId, owner.variantId)
  }
  patch.status = before.layers[0].kind === 'smart-patch' ? before.layers[0].status : 'outdated'
  assert.deepEqual(tab, before)
  assert.equal(captureSmartResultPresetSource(tab, owner, 'layer-menu', patch.id), null)
  assert.ok(
    captureSmartResultPresetSource(
      tab,
      { ...owner, variantId: patch.activeRasterSubLayerId! },
      'layer-menu',
      patch.id,
    ),
  )
})

test('converted Raster needs the explicit Smart preset capability independently of Compare refusal', () => {
  const { imageUrl, inactiveId, tab } = fixture()
  tab.layers = [
    {
      blendMode: 'normal',
      generationSettingsUnavailableReason: 'Smart comparison unavailable.',
      height: 5,
      id: inactiveId,
      imageUrl: imageUrl(inactiveId),
      kind: 'raster',
      locked: true,
      name: 'Converted result',
      opacity: 1,
      resultPresetSourceKind: 'smart-patch',
      transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: -19, y: 31 },
      visible: false,
      width: 7,
    },
  ]
  const before = structuredClone(tab)
  const owner = { kind: 'raster' as const, layerId: inactiveId }
  assert.ok(captureSmartResultPresetSource(tab, owner, 'layer-menu', null))
  assert.deepEqual(tab, before)
  assert.equal(captureSmartResultPresetSource(tab, owner, 'variant-action', null), null)
  const raster = tab.layers[0]
  if (raster.kind === 'smart-patch') {
    throw new Error('Expected Raster fixture')
  }
  raster.resultPresetSourceKind = 'raster'
  assert.equal(captureSmartResultPresetSource(tab, owner, 'layer-menu', null), null)
  raster.resultPresetSourceKind = 'smart-patch'
  raster.imageUrl = imageUrl(inactiveId, 'e'.repeat(64))
  assert.equal(captureSmartResultPresetSource(tab, owner, 'layer-menu', null), null)
})

test('captured source survives caller mutation and rejects stale tab/revision/selection/assets or containment', () => {
  const { owner, patch, tab } = fixture()
  const source = captureSmartResultPresetSource(tab, owner, 'variant-action', patch.id)!
  assert.ok(smartResultPresetSourceCurrent(source, tab, patch.id))
  owner.variantId = randomUUID()
  assert.notEqual(
    source.request.owner.kind === 'smart-patch-variant' && source.request.owner.variantId,
    owner.variantId,
  )
  for (const changed of [
    { ...tab, id: `project-v1-${'e'.repeat(64)}` },
    { ...tab, documentId: randomUUID() },
    { ...tab, documentRevision: randomUUID() },
    { ...tab, layers: [] },
    { ...tab, layers: [{ ...patch, id: randomUUID() }] },
    { ...tab, acceptedResults: [] },
    {
      ...tab,
      acceptedResults: tab.acceptedResults.map((row) => ({
        ...row,
        imageUrl: row.imageUrl.replace('b'.repeat(64), 'e'.repeat(64)),
      })),
    },
  ]) {
    assert.equal(smartResultPresetSourceCurrent(source, changed, patch.id), false)
  }
  assert.equal(smartResultPresetSourceCurrent(source, tab, randomUUID()), false)
  patch.name = 'Renamed after capture'
  assert.equal(source.layerName, 'Hidden locked Patch · Inspected result')
  assert.equal(smartResultPresetSourceCurrent(source, tab, patch.id), false)
})

test('Smart replies require the exact captured document/revision/current parent/result/hash and strict portable fields', () => {
  const { document, owner, patch, tab } = fixture()
  const { request } = captureSmartResultPresetSource(tab, owner, 'variant-action', patch.id)!
  const recorded = acceptedRasterProvenanceFixture(
    document,
    Buffer.from('metadata'),
    document.primaryBbox,
  ).generationConfiguration
  const source = parseSmartResultPresetData({
    ...request,
    payload: {
      guidance: { cfgScale: recorded.sampling.cfgScale, steps: recorded.sampling.steps },
      model: recorded.model,
      negativePrompt: recorded.negativePrompt,
      prompt: recorded.positivePrompt,
      sampling: { sampler: recorded.sampling.sampler, scheduler: recorded.sampling.scheduler },
    },
    resultId: owner.variantId,
    workflow: 'smartPatch',
  })
  assert.equal(smartResultPresetReplyMatches(request, source), true)
  for (const changed of [
    { ...source, documentId: randomUUID() },
    { ...source, documentRevision: randomUUID() },
    { ...source, assetSha256: 'e'.repeat(64) },
    { ...source, resultId: randomUUID() },
    { ...source, owner: { ...owner, layerId: randomUUID() } },
    { ...source, owner: { ...owner, variantId: randomUUID() } },
    { ...source, payload: { ...source.payload, seed: { policy: 'fixed', value: 0 } } },
    { ...source, payload: { ...source.payload, size: { height: 256, width: 256 } } },
    {
      ...source,
      payload: { ...source.payload, model: { ...source.payload.model, managedPath: '/private' } },
    },
    { ...source, layerSourceContext: { mask: {} } },
  ]) {
    assert.equal(smartResultPresetReplyMatches(request, changed), false)
  }
  assert.equal(smartResultPresetReplyMatches(request, source), true)
})
