import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

import type { ProjectRasterLayerView, ProjectSmartPatchLayerView } from '../api.js'

import { projectLayerImageUrl } from '../../main/projects/project-layer-resource.js'
import {
  generationTargetSignature,
  hashGenerationTargetSignature,
  isProjectGenerationTargetState,
} from './project-generation-target-state.js'
import { createEmptyProjectDocumentV1 } from './project-schema.js'

test('target fingerprint captures every raster pixel input and ignores editor-only signed revisions', async () => {
  const layer: ProjectRasterLayerView = {
    blendMode: 'normal',
    height: 64,
    id: randomUUID(),
    imageUrl: '',
    locked: false,
    name: 'Raster',
    opacity: 1,
    transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 0, y: 0 },
    visible: true,
    width: 64,
  }
  const url = (sha = 'a'.repeat(64)) =>
    projectLayerImageUrl(`project-v1-${'b'.repeat(64)}`, randomUUID(), layer.id, sha)
  layer.imageUrl = url()
  const tab = {
    documentId: randomUUID(),
    layers: [layer],
    primaryBbox: { height: 64, width: 64, x: 0, y: 0 },
  }
  const original = generationTargetSignature(tab)!
  const before = structuredClone(tab)
  const editorOnly = structuredClone(tab)
  editorOnly.layers[0].name = 'Renamed'
  editorOnly.layers[0].locked = true
  editorOnly.layers[0].imageUrl = url()
  assert.equal(generationTargetSignature(editorOnly), original)
  for (const mutate of [
    (value: typeof tab) => {
      value.documentId = randomUUID()
    },
    (value: typeof tab) => {
      value.primaryBbox.x = -1
    },
    (value: typeof tab) => {
      value.layers[0].transform.rotationDegrees = 1
    },
    (value: typeof tab) => {
      value.layers[0].transform.scaleX = 2
    },
    (value: typeof tab) => {
      value.layers[0].opacity = 0.5
    },
    (value: typeof tab) => {
      value.layers[0].blendMode = 'screen'
    },
    (value: typeof tab) => {
      value.layers[0].height = 128
    },
    (value: typeof tab) => {
      value.layers[0].imageUrl = url('c'.repeat(64))
    },
    (value: typeof tab) => {
      value.layers[0].visible = false
    },
  ]) {
    const changed = structuredClone(tab)
    mutate(changed)
    assert.notEqual(generationTargetSignature(changed), original)
  }
  assert.equal(
    generationTargetSignature({ ...tab, layers: [{ ...layer, imageUrl: 'unavailable' }] }),
    null,
  )
  assert.equal(
    generationTargetSignature({
      ...tab,
      layers: [{ ...layer, imageUrl: 'unavailable', visible: false }],
    }),
    generationTargetSignature({ ...tab, layers: [] }),
  )
  assert.match(await hashGenerationTargetSignature(original), /^[a-f0-9]{64}$/)
  assert.deepEqual(tab, before)
})

test('raw Project target fingerprints include only the active stored Patch pixels and parent appearance', () => {
  const base = createEmptyProjectDocumentV1({ title: 'Stored Patch pixels' })
  const ownerId = randomUUID()
  const variantId = randomUUID()
  const imageUrl = (sha = 'a'.repeat(64)) =>
    projectLayerImageUrl(`project-v1-${'b'.repeat(64)}`, base.documentRevision, ownerId, sha)
  const activeRaster: ProjectRasterLayerView = {
    blendMode: 'normal',
    height: 5,
    id: ownerId,
    imageUrl: imageUrl(),
    locked: false,
    name: 'Stored Patch',
    opacity: 1,
    transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: -19, y: 31 },
    visible: true,
    width: 7,
  }
  const patch: ProjectSmartPatchLayerView = {
    activeRaster,
    activeRasterSubLayerId: variantId,
    blendMode: 'normal',
    boundingBox: { height: 128, width: 128, x: 100, y: 200 },
    generationDraft: base.generationDraft,
    id: ownerId,
    internalResolution: { height: 64, width: 64 },
    kind: 'smart-patch',
    locked: false,
    mask: { asset: null, id: randomUUID(), revision: 0 },
    maskImageUrl: null,
    name: 'Stored Patch',
    opacity: 1,
    rasterSubLayers: [{ id: variantId, name: 'Frozen pixels' }],
    status: 'unverified',
    visible: true,
  }
  const tab = { ...base, layers: [patch] }
  const original = generationTargetSignature(tab)
  assert.equal(original, generationTargetSignature({ ...tab, layers: [activeRaster] }))
  assert.notEqual(original, generationTargetSignature({ ...tab, layers: [] }))
  const edited = structuredClone(tab)
  edited.layers[0].boundingBox.x += 64
  edited.layers[0].mask.revision += 1
  edited.layers[0].rasterSubLayers.push({ id: randomUUID(), name: 'Inactive alternative' })
  assert.equal(generationTargetSignature(edited), original)
  edited.layers[0].activeRaster!.imageUrl = imageUrl('c'.repeat(64))
  assert.notEqual(generationTargetSignature(edited), original)
  edited.layers[0].activeRaster!.imageUrl = imageUrl()
  edited.layers[0].opacity = 0.5
  assert.notEqual(generationTargetSignature(edited), original)
  edited.layers[0].visible = false
  assert.equal(generationTargetSignature(edited), generationTargetSignature({ ...tab, layers: [] }))
})

test('target state validates exact typed mode and unavailable pairing without paths or forged scalars', () => {
  const known = {
    documentId: randomUUID(),
    mode: 'img2img',
    targetKey: 'a'.repeat(64),
    unavailableReason: null,
  }
  assert.equal(isProjectGenerationTargetState(known), true)
  assert.equal(
    isProjectGenerationTargetState({
      ...known,
      mode: null,
      unavailableReason: 'Worker unavailable',
    }),
    true,
  )
  for (const invalid of [
    { ...known, mode: new Object('img2img') },
    { ...known, mode: ['img2img'] },
    { ...known, mode: 1 },
    { ...known, mode: null },
    { ...known, unavailableReason: 'unexpected' },
    { ...known, mode: null, unavailableReason: ' ' },
    { ...known, mode: null, unavailableReason: 'x'.repeat(513) },
    { ...known, targetKey: 'bad' },
    { ...known, sourcePath: '/tmp/source.png' },
  ]) {
    assert.equal(isProjectGenerationTargetState(invalid), false)
  }
})
