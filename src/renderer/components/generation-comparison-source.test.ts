import type {
  ProjectAcceptedResultView,
  ProjectRasterLayerView,
  ProjectSmartPatchLayerView,
  ProjectTab,
} from '../../shared/api.js'
import { createEmptyProjectDocumentV1 } from '../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'

import { smartPatchVariantMetadataFixture } from '../../main/projects/test-fixtures/smart-patch-variant.js'
import {
  captureGenerationComparisonSource,
  type GenerationComparisonData,
  GenerationComparisonReader,
  generationComparisonReplyMatches,
  type GenerationComparisonSource,
  generationComparisonSourceCurrent,
} from './generation-comparison-source.js'

function fixture() {
  const document = createEmptyProjectDocumentV1({ title: 'Compare owners.igs' })
  const projectKey = `project-v1-${'a'.repeat(64)}`
  const activeId = randomUUID()
  const otherId = randomUUID()
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
      { id: otherId, name: 'Same pixels, other provenance' },
    ],
    status: 'outdated',
    visible: false,
  }
  const accepted = (id: string): ProjectAcceptedResultView => ({
    acceptedAt: '2026-10-22T00:00:00.000Z',
    height: 5,
    imageUrl: imageUrl(id),
    layerId: id,
    layerName: 'Accepted result',
    modelFileSha256: 'd'.repeat(64),
    modelName: 'Missing checkpoint',
    modelVersionName: 'Frozen version',
    seed: 0,
    width: 7,
  })
  const tab: ProjectTab = {
    acceptedResults: [accepted(activeId), accepted(otherId)],
    autosaveError: null,
    canRedo: false,
    canUndo: true,
    dirty: true,
    documentId: document.documentId,
    documentRevision: document.documentRevision,
    generationDraft: document.generationDraft,
    id: projectKey,
    lastActualSeedSnapshot: 0,
    layers: [patch],
    primaryBbox: document.primaryBbox,
    title: document.title,
  }
  const raster: ProjectRasterLayerView = {
    blendMode: 'normal',
    height: 5,
    id: activeId,
    imageUrl: imageUrl(activeId),
    kind: 'raster',
    locked: true,
    name: 'Converted result',
    opacity: 1,
    resultComparisonSourceKind: 'smart-patch',
    resultPresetSourceKind: 'raster',
    transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: -19, y: 31 },
    visible: false,
    width: 7,
  }
  return { activeId, imageUrl, otherId, patch, raster, tab }
}

function response(source: GenerationComparisonSource) {
  return {
    ...structuredClone(source.request),
    currentMode: null,
    generationConfiguration:
      smartPatchVariantMetadataFixture('illustrious').generationProvenance.generationConfiguration,
    modeUnavailableReason: 'Image engine is not installed.',
    resultId:
      source.request.owner.kind === 'raster'
        ? source.request.owner.layerId
        : source.request.owner.variantId,
  }
}

const settle = () => new Promise<void>((resolve) => setImmediate(resolve))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, reject, resolve }
}

test('comparison captures only an actual active accepted member without changing hidden/locked Patch state', () => {
  const { activeId, patch, tab } = fixture()
  const before = structuredClone(tab)
  const source = captureGenerationComparisonSource(tab, patch.id)!
  assert.ok(source)
  assert.equal(source.kind, 'smart-patch')
  assert.deepEqual(source.request.owner, {
    kind: 'smart-patch-variant',
    layerId: patch.id,
    variantId: activeId,
  })
  assert.equal(source.request.assetSha256, 'b'.repeat(64))
  assert.deepEqual(tab, before)
  patch.activeRasterSubLayerId = randomUUID()
  assert.equal(captureGenerationComparisonSource(tab, patch.id), null)
  patch.activeRasterSubLayerId = null
  assert.equal(captureGenerationComparisonSource(tab, patch.id), null)
  patch.activeRasterSubLayerId = activeId
  tab.acceptedResults = []
  assert.equal(captureGenerationComparisonSource(tab, patch.id), null)
})

test('source identity invalidates for equal pixels under another active result, owner, hash, revision or Project', () => {
  const { otherId, patch, tab } = fixture()
  const source = captureGenerationComparisonSource(tab, patch.id)!
  assert.equal(generationComparisonSourceCurrent(source, tab), true)
  patch.activeRasterSubLayerId = otherId
  assert.equal(
    captureGenerationComparisonSource(tab, patch.id)!.request.assetSha256,
    source.request.assetSha256,
  )
  assert.equal(generationComparisonSourceCurrent(source, tab), false)
  patch.activeRasterSubLayerId =
    source.request.owner.kind === 'smart-patch-variant' ? source.request.owner.variantId : null
  for (const changed of [
    { ...tab, id: `project-v1-${'d'.repeat(64)}` },
    { ...tab, documentId: randomUUID() },
    { ...tab, documentRevision: randomUUID() },
    { ...tab, layers: [{ ...patch, id: randomUUID() }] },
    { ...tab, layers: [] },
    { ...tab, acceptedResults: [] },
    {
      ...tab,
      acceptedResults: tab.acceptedResults.map((result) => ({
        ...result,
        imageUrl: result.imageUrl.replace('b'.repeat(64), 'e'.repeat(64)),
      })),
    },
  ]) {
    assert.equal(generationComparisonSourceCurrent(source, changed), false)
  }
})

test('converted comparison capability is independent of preset capability; absent ordinary marker remains compatible', () => {
  const { raster, tab } = fixture()
  tab.layers = [raster]
  const before = structuredClone(tab)
  assert.equal(captureGenerationComparisonSource(tab, raster.id)?.kind, 'smart-patch')
  assert.deepEqual(tab, before)
  raster.resultPresetSourceKind = 'smart-patch'
  raster.resultComparisonSourceKind = 'raster'
  assert.equal(captureGenerationComparisonSource(tab, raster.id)?.kind, 'raster')
  delete raster.resultComparisonSourceKind
  assert.equal(captureGenerationComparisonSource(tab, raster.id)?.kind, 'raster')
  raster.imageUrl = raster.imageUrl.replace('b'.repeat(64), 'e'.repeat(64))
  assert.equal(captureGenerationComparisonSource(tab, raster.id), null)
  raster.imageUrl = before.layers[0].kind !== 'smart-patch' ? before.layers[0].imageUrl : ''
  raster.generationSettingsUnavailableReason = 'Unsupported generation data.'
  assert.equal(captureGenerationComparisonSource(tab, raster.id), null)
  delete raster.generationSettingsUnavailableReason
  tab.acceptedResults = []
  assert.equal(captureGenerationComparisonSource(tab, raster.id), null)
})

test('Smart reply guard correlates every request identity and refuses ordinary Size or private context', () => {
  const { patch, tab } = fixture()
  const source = captureGenerationComparisonSource(tab, patch.id)!
  const data = response(source)
  assert.equal(generationComparisonReplyMatches(source, data), true)
  for (const crossed of [
    { ...data, documentId: randomUUID() },
    { ...data, documentRevision: randomUUID() },
    { ...data, assetSha256: 'e'.repeat(64) },
    { ...data, resultId: randomUUID() },
    { ...data, owner: { ...data.owner, layerId: randomUUID() } },
    { ...data, owner: { ...data.owner, variantId: randomUUID() } },
    { ...data, layerSourceContext: {} },
    {
      ...data,
      generationConfiguration: {
        ...data.generationConfiguration,
        size: { height: 256, width: 256 },
      },
    },
  ]) {
    assert.equal(generationComparisonReplyMatches(source, crossed), false)
  }
  source.kind = 'raster'
  assert.equal(generationComparisonReplyMatches(source, data), false)
})

test('reader waits for acknowledged Project drafts and clones the request before asynchronous use', async () => {
  const { patch, tab } = fixture()
  const source = captureGenerationComparisonSource(tab, patch.id)!
  const captured = structuredClone(source)
  const calls: GenerationComparisonSource[] = []
  const successes: unknown[] = []
  const reader = new GenerationComparisonReader({
    onState: (data) => {
      if (data) {
        successes.push(data)
      }
    },
    read: async (request) => {
      calls.push(request)
      return response(request)
    },
  })
  reader.change(source, true)
  await settle()
  assert.equal(calls.length, 0)
  reader.change(source)
  source.request.owner.layerId = randomUUID()
  await settle()
  assert.deepEqual(calls[0], captured)
  assert.equal(successes.length, 1)
  reader.dispose()
})

for (const oldOutcome of ['success', 'error'] as const) {
  test(`reader suppresses stale ${oldOutcome} after close/reopen and edit/Undo ABA`, async () => {
    const { patch, tab } = fixture()
    const source = captureGenerationComparisonSource(tab, patch.id)!
    const held = deferred<unknown>()
    const calls: GenerationComparisonSource[] = []
    const successes: unknown[] = []
    const errors: string[] = []
    const reader = new GenerationComparisonReader({
      onState: (data, error) => {
        if (data) {
          successes.push(data)
        }
        if (error) {
          errors.push(error)
        }
      },
      read: async (request) => {
        calls.push(request)
        return calls.length === 1 ? await held.promise : response(request)
      },
    })
    reader.change(source)
    reader.change(null)
    reader.change({ ...source, request: { ...source.request, documentRevision: randomUUID() } })
    reader.change(source)
    if (oldOutcome === 'success') {
      held.resolve(response(source))
    } else {
      held.reject(new Error('Stale worker failure'))
    }
    await settle()
    assert.equal(calls.length, 2)
    assert.deepEqual(calls[0], calls[1])
    assert.equal(successes.length, 1)
    assert.deepEqual(errors, [])
    reader.dispose()
  })
}

test('reader refuses crossed current replies and suppresses disposed or navigated failures', async () => {
  const { patch, tab } = fixture()
  const source = captureGenerationComparisonSource(tab, patch.id)!
  const errors: string[] = []
  const reader = new GenerationComparisonReader({
    onState: (data, error) => {
      assert.equal(data, null)
      if (error) {
        errors.push(error)
      }
    },
    read: async (request) => ({ ...response(request), resultId: randomUUID() }),
  })
  reader.change(source)
  await settle()
  assert.match(errors[0], /different saved result/)
  reader.dispose()
  for (const dispose of [false, true]) {
    const held = deferred<unknown>()
    const published: unknown[] = []
    const detached = new GenerationComparisonReader({
      onState: (data, error) => {
        if (data || error) {
          published.push([data, error])
        }
      },
      read: async () => await held.promise,
    })
    detached.change(source)
    if (dispose) {
      detached.dispose()
    } else {
      detached.change(null)
    }
    held.reject(new Error('Old document failure'))
    await settle()
    assert.deepEqual(published, [])
    detached.dispose()
  }
})

test('validated baseline stays immutable and readable across current-side settling, then clears for another equal-pixel owner', async () => {
  const { otherId, patch, tab } = fixture()
  const source = captureGenerationComparisonSource(tab, patch.id)!
  const frozen = response(source)
  const withMode = { ...frozen, currentMode: 'img2img', modeUnavailableReason: null }
  const state: { data: GenerationComparisonData | null; loading: boolean } = {
    data: null,
    loading: false,
  }
  let calls = 0
  const reader = new GenerationComparisonReader({
    onState: (data, _error, pending) => {
      state.data = data
      state.loading = pending
    },
    read: async () => {
      calls += 1
      return withMode
    },
  })
  reader.change(source)
  await settle()
  assert.equal(state.data?.data.currentMode, 'img2img')
  const next = { ...source, request: { ...source.request, documentRevision: randomUUID() } }
  reader.change(next, true)
  assert.equal(calls, 1)
  assert.equal(state.loading, true)
  assert.deepEqual(state.data?.data.generationConfiguration, frozen.generationConfiguration)
  assert.equal(state.data?.data.currentMode, null)
  assert.equal(state.data?.data.modeUnavailableReason, 'Waiting for draft changes…')
  if (state.data?.kind === 'smart-patch') {
    assert.equal(state.data.data.documentRevision, source.request.documentRevision)
  }
  assert.equal(withMode.currentMode, 'img2img')
  assert.equal(withMode.modeUnavailableReason, null)
  patch.activeRasterSubLayerId = otherId
  const other = captureGenerationComparisonSource(tab, patch.id)!
  assert.equal(other.request.assetSha256, source.request.assetSha256)
  reader.change(other, true)
  assert.equal(state.data, null)
  reader.dispose()
})
