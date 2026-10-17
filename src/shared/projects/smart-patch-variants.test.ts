import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'

import type { ModelCatalogItem } from '../api.js'
import type { IgsSmartPatchLayerV1 } from './project-schema.js'

import { smartPatchVariantMetadataFixture } from '../../main/projects/test-fixtures/smart-patch-variant.js'
import {
  isProjectSmartPatchVariantChange,
  isProjectSmartPatchVariantsInspection,
  smartPatchResourceDiagnostics,
} from './smart-patch-variants.js'

function fixture() {
  const variant = smartPatchVariantMetadataFixture('illustrious')
  const context = variant.generationProvenance.layerSourceContext
  const patch: IgsSmartPatchLayerV1 = {
    activeRasterSubLayerId: variant.id,
    blendMode: 'normal',
    boundingBox: context.bbox,
    generationDraft: structuredClone(context.generationDraft),
    id: context.layerId,
    internalResolution: context.internalResolution,
    kind: 'smart-patch',
    locked: false,
    mask: context.mask,
    name: 'Stored Patch',
    opacity: 1,
    rasterSubLayers: [variant],
    visible: true,
  }
  const ref = patch.generationDraft.model!
  const catalog: ModelCatalogItem[] = [
    {
      author: null,
      defaultVersionId: ref.localVersionId,
      description: null,
      id: ref.localModelId,
      modelId: ref.civitaiModelId,
      name: ref.displayName,
      previewDataUrl: null,
      resourceType: 'checkpoint',
      sourceUrl: null,
      trainedWords: [],
      versions: [
        {
          baseModelFamily: ref.baseModelFamily,
          civitaiFileId: ref.civitaiFileId,
          civitaiVersionId: ref.civitaiVersionId,
          dependencyIssues: [],
          fileName: 'fixture.safetensors',
          fileSizeBytes: 1,
          fileStatus: 'ready',
          format: 'safetensors',
          id: ref.localVersionId,
          installedAt: '2026-10-16T10:00:00.000Z',
          name: ref.versionName,
          predictionType: ref.predictionType,
          sha256: ref.fileSha256,
          trainedWords: [],
        },
      ],
    },
  ]
  return { catalog, context, patch, ref, variant }
}

test('variant commands retain exact document/member identity and reject foreign/path/invalid UTF-8-size data', () => {
  const base = { documentId: randomUUID(), documentRevision: randomUUID(), variantId: randomUUID() }
  for (const kind of ['select', 'delete']) {
    assert.equal(isProjectSmartPatchVariantChange({ ...base, kind }), true)
    assert.equal(isProjectSmartPatchVariantChange({ ...base, kind, name: 'extra' }), false)
  }
  assert.equal(
    isProjectSmartPatchVariantChange({ ...base, kind: 'rename', name: 'a'.repeat(1024) }),
    true,
  )
  for (const name of ['', '  ', 'a'.repeat(1025), '😀'.repeat(257)]) {
    assert.equal(isProjectSmartPatchVariantChange({ ...base, kind: 'rename', name }), false)
  }
  for (const value of [
    { ...base, documentId: 'foreign', kind: 'delete' },
    { ...base, documentRevision: null, kind: 'delete' },
    { ...base, kind: 'delete', path: '/tmp/arbitrary.png' },
    { ...base, kind: 'adopt' },
  ]) {
    assert.equal(isProjectSmartPatchVariantChange(value), false)
  }
})

test('preload inspection contract rejects a ready claim without verified pixels and duplicate member replies', () => {
  const inspection = {
    documentId: randomUUID(),
    documentRevision: randomUUID(),
    layerId: randomUUID(),
    resourceDiagnostics: [],
    resourcesChecked: false,
    sourceUnavailableReason: 'Source not checked',
    variants: [
      { changedInputs: [], id: randomUUID(), sourceVerified: false, status: 'unverified' },
    ],
  }
  assert.equal(isProjectSmartPatchVariantsInspection(inspection), true)
  const variant = inspection.variants[0]
  assert.equal(
    isProjectSmartPatchVariantsInspection({
      ...inspection,
      variants: [{ ...variant, status: 'ready' }],
    }),
    false,
  )
  assert.equal(
    isProjectSmartPatchVariantsInspection({ ...inspection, variants: [variant, variant] }),
    false,
  )
  assert.equal(
    isProjectSmartPatchVariantsInspection({
      ...inspection,
      variants: [{ ...variant, changedInputs: ['mask'], status: 'outdated' }],
    }),
    true,
  )
  assert.equal(
    isProjectSmartPatchVariantsInspection({
      ...inspection,
      variants: [{ ...variant, changedInputs: ['mask', 'mask'], status: 'outdated' }],
    }),
    false,
  )
})

test('current resource availability is independent of stored pixels and never auto-relinks equal files', () => {
  const { catalog, patch } = fixture()
  const before = structuredClone(patch)
  assert.deepEqual(smartPatchResourceDiagnostics(patch, catalog), [])
  assert.ok(
    smartPatchResourceDiagnostics(patch, []).some(({ code }) => code === 'RESOURCE_MISSING'),
  )
  assert.ok(
    smartPatchResourceDiagnostics(patch, null).every(({ code }) => code !== 'RESOURCE_MISSING'),
  )
  assert.ok(
    smartPatchResourceDiagnostics(patch, null).some(({ code }) => code === 'CATALOG_UNAVAILABLE'),
  )
  const relinked = structuredClone(catalog)
  relinked[0].id = randomUUID()
  assert.ok(
    smartPatchResourceDiagnostics(patch, relinked).some(({ code }) => code === 'RESOURCE_MISSING'),
  )
  catalog[0].versions[0].fileStatus = 'corrupt'
  assert.ok(
    smartPatchResourceDiagnostics(patch, catalog).some(({ code }) => code === 'RESOURCE_CORRUPT'),
  )
  assert.deepEqual(patch, before)
})

test('inactive LoRAs/embedding tokens are retained without becoming required resources', () => {
  const { catalog, patch, ref } = fixture()
  const lora = { ...ref, kind: 'lora' as const, localModelId: randomUUID(), predictionType: null }
  const embedding = {
    ...ref,
    kind: 'embedding' as const,
    localModelId: randomUUID(),
    predictionType: null,
  }
  patch.generationDraft.loras = [{ enabled: false, resource: lora, weight: 0.7 }]
  patch.generationDraft.positivePrompt = {
    embeddingRefs: [{ resource: embedding, token: 'not-used' }],
    text: 'literal',
  }
  assert.deepEqual(smartPatchResourceDiagnostics(patch, catalog), [])
  patch.generationDraft.loras[0].enabled = true
  assert.ok(
    smartPatchResourceDiagnostics(patch, catalog).some(({ code }) => code === 'RESOURCE_MISSING'),
  )
  patch.generationDraft.loras = []
  patch.generationDraft.positivePrompt.text = '<embedding:not-used>'
  assert.ok(
    smartPatchResourceDiagnostics(patch, catalog).some(({ code }) => code === 'RESOURCE_MISSING'),
  )
})

test('large valid resource stacks aggregate duplicates and keep bounded inspection replies with explicit truncation', () => {
  const { catalog, patch, ref } = fixture()
  const lora = { ...ref, kind: 'lora' as const, localModelId: randomUUID(), predictionType: null }
  patch.generationDraft.loras = Array.from({ length: 10_000 }, () => ({
    enabled: true,
    resource: lora,
    weight: 0.7,
  }))
  assert.deepEqual(
    smartPatchResourceDiagnostics(patch, catalog).map(({ code }) => code),
    ['RESOURCE_MISSING'],
  )
  patch.generationDraft.loras = patch.generationDraft.loras.map((entry, index) => ({
    ...entry,
    resource: { ...entry.resource, localVersionId: `distinct-version-${index}` },
  }))
  const resourceDiagnostics = smartPatchResourceDiagnostics(patch, catalog)
  assert.equal(resourceDiagnostics.length, 10_000)
  assert.equal(resourceDiagnostics.at(-1)?.code, 'DIAGNOSTICS_TRUNCATED')
  assert.equal(
    isProjectSmartPatchVariantsInspection({
      documentId: randomUUID(),
      documentRevision: randomUUID(),
      layerId: patch.id,
      resourceDiagnostics,
      resourcesChecked: true,
      sourceUnavailableReason: null,
      variants: [],
    }),
    true,
  )
})
