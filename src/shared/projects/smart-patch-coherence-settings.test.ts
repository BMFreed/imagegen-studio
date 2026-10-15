import assert from 'node:assert/strict'
import test from 'node:test'
import * as v from 'valibot'

import { isProjectSmartPatchLayerChange } from '../api.js'
import {
  createEmptyProjectDocumentV1,
  type IgsRasterLayerV1,
  type IgsSmartPatchLayerV1,
  parseProjectDocumentV1,
} from './project-schema.js'
import {
  isSmartPatchCoherenceSettings,
  resolveSmartPatchCoherenceSettings,
  SMART_PATCH_COHERENCE_EDGE_MAX,
  SMART_PATCH_DEFAULT_COHERENCE_SETTINGS,
  SmartPatchCoherenceSettingsSchema,
} from './smart-patch-coherence-settings.js'

const documentId = 'f1099bf4-05ea-44d8-b5de-6884ece7ba45'
const documentRevision = '6ea21a66-41e5-43ee-80e2-e9837b7c0eb8'

const validProfiles = [
  { edgeSize: 0, minimumDenoise: 0, mode: 'Gaussian Blur' },
  { edgeSize: 16, minimumDenoise: 0, mode: 'Gaussian Blur' },
  { edgeSize: 1024, minimumDenoise: 1, mode: 'Box Blur' },
  { edgeSize: 7, minimumDenoise: 0.375, mode: 'Staged' },
]

const invalidProfiles: unknown[] = [
  null,
  [],
  {},
  { edgeSize: 16, mode: 'Gaussian Blur' },
  { minimumDenoise: 0, mode: 'Gaussian Blur' },
  { edgeSize: 16, minimumDenoise: 0 },
  ...['Gaussian', 'gaussian blur', 'box', 'staged', 0, null].map((mode) => ({
    edgeSize: 16,
    minimumDenoise: 0,
    mode,
  })),
  ...[-1, 0.5, 1025, NaN, Infinity, '16', true].map((edgeSize) => ({
    edgeSize,
    minimumDenoise: 0,
    mode: 'Gaussian Blur',
  })),
  ...[-0.01, 1.01, NaN, Infinity, -Infinity, '0', true].map((minimumDenoise) => ({
    edgeSize: 16,
    minimumDenoise,
    mode: 'Gaussian Blur',
  })),
  { edgeSize: 16, minimumDenoise: 0, mode: 'Gaussian Blur', padding: 8 },
]

test('production coherence schema and guard retain exact modes, independent endpoints and fractional minimum', () => {
  assert.equal(SMART_PATCH_COHERENCE_EDGE_MAX, 1024)
  for (const profile of validProfiles) {
    assert.deepEqual(v.parse(SmartPatchCoherenceSettingsSchema, profile), profile)
    assert.equal(isSmartPatchCoherenceSettings(profile), true)
  }
  for (const profile of invalidProfiles) {
    assert.equal(v.safeParse(SmartPatchCoherenceSettingsSchema, profile).success, false)
    assert.equal(isSmartPatchCoherenceSettings(profile), false)
  }
})

test('legacy coherence resolution and explicit resolution return detached profiles without modifying defaults', () => {
  assert.ok(Object.isFrozen(SMART_PATCH_DEFAULT_COHERENCE_SETTINGS))
  assert.deepEqual(SMART_PATCH_DEFAULT_COHERENCE_SETTINGS, {
    edgeSize: 16,
    minimumDenoise: 0,
    mode: 'Gaussian Blur',
  })
  const legacy = resolveSmartPatchCoherenceSettings(undefined)
  legacy.edgeSize = 0
  legacy.minimumDenoise = 1
  legacy.mode = 'Staged'
  assert.deepEqual(resolveSmartPatchCoherenceSettings(undefined), {
    edgeSize: 16,
    minimumDenoise: 0,
    mode: 'Gaussian Blur',
  })
  const explicit = { edgeSize: 31, minimumDenoise: 0.375, mode: 'Box Blur' as const }
  const resolved = resolveSmartPatchCoherenceSettings(explicit)
  resolved.edgeSize = 1024
  resolved.mode = 'Staged'
  assert.deepEqual(explicit, { edgeSize: 31, minimumDenoise: 0.375, mode: 'Box Blur' })
})

test('actual coherence edit API requires exactly a whole strict profile and both captured document identities', () => {
  const change = {
    documentId,
    documentRevision,
    kind: 'coherence-settings',
    value: { edgeSize: 16, minimumDenoise: 0, mode: 'Gaussian Blur' },
  }
  for (const value of validProfiles) {
    assert.equal(isProjectSmartPatchLayerChange({ ...change, value }), true)
  }
  for (const value of invalidProfiles) {
    assert.equal(isProjectSmartPatchLayerChange({ ...change, value }), false)
  }
  for (const invalid of [
    { ...change, documentId: 'invalid' },
    { ...change, documentRevision: 'invalid' },
    { ...change, documentId: undefined },
    { ...change, documentRevision: undefined },
    { kind: change.kind, value: change.value },
    { ...change, layerId: documentId },
    { ...change, extra: true },
  ]) {
    assert.equal(isProjectSmartPatchLayerChange(invalid), false)
  }
  assert.equal(isProjectSmartPatchLayerChange({ kind: 'lock', locked: false }), true)
})

function portablePatchFixture() {
  const document = createEmptyProjectDocumentV1({
    documentId,
    documentRevision,
    primaryBbox: { height: 256, width: 256, x: 0, y: 0 },
    title: 'Coherence schema boundary',
  })
  const patch: IgsSmartPatchLayerV1 = {
    activeRasterSubLayerId: null,
    blendMode: 'normal',
    boundingBox: { height: 256, width: 256, x: -3, y: 11 },
    generationDraft: structuredClone(document.generationDraft),
    id: '8ef6efdb-fdd1-4fce-87f0-d889866f199d',
    internalResolution: { height: 384, width: 256 },
    kind: 'smart-patch',
    locked: false,
    mask: { asset: null, id: 'e09c69aa-dee3-4bf8-87d1-84ed1d0c4e60', revision: 0 },
    name: 'Legacy profile absence',
    opacity: 1,
    rasterSubLayers: [],
    visible: true,
  }
  return { document, patch }
}

test('actual portable document parser keeps legacy coherence absence without adding defaults', () => {
  const { document, patch } = portablePatchFixture()
  const legacy = { ...document, layers: [patch] }
  assert.deepEqual(parseProjectDocumentV1(legacy), legacy)
  assert.equal(Object.hasOwn(parseProjectDocumentV1(legacy).layers[0], 'coherenceSettings'), false)
})

test('actual portable document parser roundtrips explicit coherence profiles and rejects Raster ownership', () => {
  const { document, patch } = portablePatchFixture()
  for (const coherenceSettings of validProfiles) {
    const explicit = { ...document, layers: [{ ...patch, coherenceSettings }] }
    assert.deepEqual(parseProjectDocumentV1(explicit), explicit)
  }
  for (const coherenceSettings of invalidProfiles) {
    assert.throws(
      () => parseProjectDocumentV1({ ...document, layers: [{ ...patch, coherenceSettings }] }),
      { code: 'INVALID_PROJECT' },
    )
  }
  const rasterId = 'b8468727-804a-4522-a3e7-c5145967e43f'
  const raster: IgsRasterLayerV1 = {
    asset: {
      bytes: 80,
      height: 2,
      path: `assets/layers/${rasterId}.png`,
      sha256: 'a'.repeat(64),
      width: 2,
    },
    blendMode: 'normal',
    id: rasterId,
    kind: 'raster',
    locked: false,
    name: 'Raster cannot own Patch coherence',
    opacity: 1,
    transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 0, y: 0 },
    visible: true,
  }
  assert.throws(
    () =>
      parseProjectDocumentV1({
        ...document,
        layers: [{ ...raster, coherenceSettings: validProfiles[1] }],
      }),
    { code: 'INVALID_PROJECT' },
  )
})
