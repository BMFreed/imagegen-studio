import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'

import { smartPatchVariantMetadataFixture } from '../../main/projects/test-fixtures/smart-patch-variant.js'
import {
  createEmptyProjectDocumentV1,
  IGS_SAFETY_CEILINGS,
  type IgsRegionalGuidanceV1,
  type IgsSmartPatchLayerV1,
  isProjectRegionalGuidanceV1,
  parseProjectDocumentV1,
  projectActiveRasterContributions,
  projectAssetReferences,
  projectOwnedIds,
} from './project-schema.js'
import {
  assertRegionalGuidanceGenerationAvailable,
  getRegionalGuidanceGenerationUnavailableReason,
  isProjectRegionalGuidanceChange,
  isProjectRegionalGuidanceDocumentOwner,
  isProjectRegionalGuidanceHistoryGroupId,
  isProjectRegionalGuidanceOwner,
  isProjectRegionalGuidancePromptChange,
  isProjectRegionalGuidancePromptChangeForOwner,
  RegionalGuidanceGenerationError,
} from './regional-guidance.js'

test('regional seal IDs accept the portable owner UUID shape while rejecting other namespaces and malformed focus IDs', () => {
  for (const regionId of [randomUUID(), '00000000-0000-0000-0000-000000000000']) {
    const owner = { documentId: randomUUID(), documentRevision: randomUUID(), regionId }
    const historyGroupId = `regional:${regionId}:positive:${randomUUID()}`
    assert.equal(isProjectRegionalGuidanceOwner(owner), true)
    assert.equal(isProjectRegionalGuidanceHistoryGroupId(historyGroupId), true)
    assert.equal(
      isProjectRegionalGuidancePromptChangeForOwner(
        { historyGroupId, kind: 'text', polarity: 'positive', text: 'copied owner' },
        owner,
      ),
      true,
    )
  }
  for (const value of [
    null,
    undefined,
    randomUUID(),
    'ordinary:anything',
    `regional:${randomUUID()}:unknown:${randomUUID()}`,
    `regional:${randomUUID()}:positive:00000000-0000-0000-0000-000000000000`,
    `regional:${randomUUID()}:positive:${randomUUID()}:extra`,
    { historyGroupId: randomUUID() },
  ]) {
    assert.equal(isProjectRegionalGuidanceHistoryGroupId(value), false)
  }
})

function region(): IgsRegionalGuidanceV1 {
  return {
    enabled: true,
    id: randomUUID(),
    locked: false,
    mask: { asset: null, id: randomUUID(), revision: 0 },
    name: 'Regional Guidance',
    overlayOpacity: 0.5,
  }
}

test('strict optional regional collection preserves legacy absence and explicit emptiness without material assets', () => {
  const document = createEmptyProjectDocumentV1({ title: 'Regional schema' })
  assert.equal(Object.hasOwn(document, 'regionalGuidance'), false)
  assert.deepEqual(parseProjectDocumentV1(document), document)
  assert.equal(Object.hasOwn(parseProjectDocumentV1(document), 'regionalGuidance'), false)
  assert.deepEqual(
    parseProjectDocumentV1({ ...document, regionalGuidance: [] }).regionalGuidance,
    [],
  )
  const value = { ...document, regionalGuidance: [region()] }
  assert.deepEqual(parseProjectDocumentV1(value), value)
  assert.deepEqual(projectActiveRasterContributions(value), [])
  assert.deepEqual(projectAssetReferences(value), [])
  assert.throws(() => parseProjectDocumentV1({ ...document, regionalGuidance: null }), {
    code: 'INVALID_PROJECT',
  })
})

test('regional schema and DTO guard refuse unsupported authored inputs rather than stripping them', () => {
  const value = region()
  const document = createEmptyProjectDocumentV1({ title: 'Strict regional fields' })
  assert.equal(isProjectRegionalGuidanceV1(value), true)
  const invalid: unknown[] = [
    { ...value, kind: 'regional-guidance' },
    { ...value, positivePrompt: { embeddingRefs: [], text: 'unsupported' } },
    { ...value, negativePrompt: null },
    { ...value, useGlobalNegativePrompt: true },
    { ...value, referenceImages: [] },
    { ...value, boundingBox: document.primaryBbox },
    { ...value, regionObjects: [] },
    { ...value, compatibilityStatus: 'ok' },
    { ...value, mask: { ...value.mask, asset: { path: 'assets/masks/future.png' } } },
    { ...value, mask: { ...value.mask, revision: -1 } },
    { ...value, mask: { ...value.mask, bounds: document.primaryBbox } },
    { ...value, mask: { ...value.mask, id: 'not-a-uuid' } },
    { ...value, id: 'not-a-uuid' },
    { ...value, enabled: 1 },
    { ...value, locked: null },
    { ...value, name: '' },
    { ...value, name: ' \n\t' },
    { ...value, name: 'я'.repeat(513) },
    ...[NaN, Infinity, -0.01, 1.01, null].map((overlayOpacity) => ({ ...value, overlayOpacity })),
  ]
  for (const input of invalid) {
    assert.equal(isProjectRegionalGuidanceV1(input), false)
    assert.throws(() => parseProjectDocumentV1({ ...document, regionalGuidance: [input] }), {
      code: 'INVALID_PROJECT',
    })
  }
  for (const overlayOpacity of [0, 0.5, 1]) {
    assert.equal(isProjectRegionalGuidanceV1({ ...value, overlayOpacity }), true)
  }
  assert.equal(isProjectRegionalGuidanceV1({ ...value, name: 'я'.repeat(512) }), true)
})

test('regional collection borrows the explicit defensive array ceiling without changing legacy layer limits', () => {
  const document = createEmptyProjectDocumentV1({ title: 'Defensive region count' })
  const regions = Array.from({ length: IGS_SAFETY_CEILINGS.archiveEntries }, region)
  assert.equal(
    parseProjectDocumentV1({ ...document, regionalGuidance: regions }).regionalGuidance?.length,
    IGS_SAFETY_CEILINGS.archiveEntries,
  )
  assert.throws(
    () => parseProjectDocumentV1({ ...document, regionalGuidance: [...regions, region()] }),
    { code: 'INVALID_PROJECT' },
  )
})

test('current owner namespace rejects every regional cross-owner collision while preserving historical provenance IDs', () => {
  const document = createEmptyProjectDocumentV1({ title: 'Every owned UUID' })
  const variant = smartPatchVariantMetadataFixture('illustrious')
  const patch: IgsSmartPatchLayerV1 = {
    activeRasterSubLayerId: variant.id,
    blendMode: 'normal',
    boundingBox: { ...document.primaryBbox },
    generationDraft: structuredClone(document.generationDraft),
    id: randomUUID(),
    internalResolution: { height: 256, width: 256 },
    kind: 'smart-patch',
    locked: false,
    mask: { asset: null, id: randomUUID(), revision: 0 },
    name: 'Owned Smart Patch',
    opacity: 1,
    rasterSubLayers: [variant],
    visible: true,
  }
  const rasterId = randomUUID()
  document.layers = [
    patch,
    {
      asset: {
        bytes: 100,
        height: 2,
        path: `assets/layers/${rasterId}.png`,
        sha256: 'a'.repeat(64),
        width: 2,
      },
      blendMode: 'normal',
      id: rasterId,
      kind: 'raster',
      locked: false,
      name: 'Raster',
      opacity: 1,
      transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 0, y: 0 },
      visible: true,
    },
  ]
  const first = region()
  document.regionalGuidance = [first]
  const ids = projectOwnedIds(document)
  assert.deepEqual(ids, [patch.id, patch.mask.id, variant.id, rasterId, first.id, first.mask.id])
  assert.doesNotThrow(() => parseProjectDocumentV1(document))
  for (const occupied of ids) {
    for (const field of ['entity', 'mask'] as const) {
      const duplicate = region()
      if (field === 'entity') {
        duplicate.id = occupied
      } else {
        duplicate.mask.id = occupied
      }
      assert.throws(
        () => parseProjectDocumentV1({ ...document, regionalGuidance: [first, duplicate] }),
        { code: 'INVALID_PROJECT' },
      )
    }
  }
  const ownCollision = region()
  ownCollision.mask.id = ownCollision.id
  assert.throws(() => parseProjectDocumentV1({ ...document, regionalGuidance: [ownCollision] }), {
    code: 'INVALID_PROJECT',
  })
  const historical = region()
  historical.id = variant.generationProvenance.layerSourceContext.layerId
  historical.mask.id = variant.generationProvenance.layerSourceContext.mask.id
  assert.doesNotThrow(() =>
    parseProjectDocumentV1({ ...document, regionalGuidance: [first, historical] }),
  )
})

test('regional command guards accept only exact owners and one supported change', () => {
  const owner = { documentId: randomUUID(), documentRevision: randomUUID() }
  const target = { ...owner, regionId: randomUUID() }
  assert.equal(isProjectRegionalGuidanceDocumentOwner(owner), true)
  assert.equal(isProjectRegionalGuidanceOwner(target), true)
  assert.equal(isProjectRegionalGuidanceDocumentOwner(target), false)
  assert.equal(isProjectRegionalGuidanceOwner(owner), false)
  for (const input of [
    null,
    { ...owner, extra: true },
    { ...owner, documentId: 'bad' },
    { ...owner, documentRevision: undefined },
  ]) {
    assert.equal(isProjectRegionalGuidanceDocumentOwner(input), false)
  }
  for (const input of [null, { ...target, extra: true }, { ...target, regionId: 'bad' }]) {
    assert.equal(isProjectRegionalGuidanceOwner(input), false)
  }
  for (const input of [
    { kind: 'rename', name: 'Region' },
    { enabled: false, kind: 'enabled' },
    { kind: 'lock', locked: true },
    { kind: 'overlay-opacity', overlayOpacity: 0 },
    { kind: 'overlay-opacity', overlayOpacity: 1 },
  ]) {
    assert.equal(isProjectRegionalGuidanceChange(input), true)
  }
  for (const input of [
    { kind: 'rename', name: ' ' },
    { kind: 'rename', name: 'я'.repeat(513) },
    { enabled: false, kind: 'enabled', locked: false },
    { kind: 'lock', locked: 0 },
    { kind: 'overlay-opacity', overlayOpacity: NaN },
    { kind: 'overlay-opacity', overlayOpacity: 2 },
    { kind: 'positive-prompt', text: 'unsupported' },
  ]) {
    assert.equal(isProjectRegionalGuidanceChange(input), false)
  }
})

test('all enabled regions refuse new generation regardless of selection, empty mask, lock or overlay opacity', () => {
  const document = createEmptyProjectDocumentV1({ title: 'Eligibility only' })
  assert.equal(getRegionalGuidanceGenerationUnavailableReason(document), null)
  assert.doesNotThrow(() => assertRegionalGuidanceGenerationAvailable(document))
  const value = region()
  for (const enabled of [false, true]) {
    for (const locked of [false, true]) {
      for (const overlayOpacity of [0, 0.5, 1]) {
        const input = { regionalGuidance: [{ ...value, enabled, locked, overlayOpacity }] }
        const before = structuredClone(input)
        if (enabled) {
          assert.equal(
            getRegionalGuidanceGenerationUnavailableReason(input),
            'Regional Guidance generation is not available yet. Disable or delete all enabled regions before generating.',
          )
          assert.throws(
            () => assertRegionalGuidanceGenerationAvailable(input),
            (error: unknown) =>
              error instanceof RegionalGuidanceGenerationError &&
              error.code === 'GENERATION_REGIONAL_GUIDANCE_UNSUPPORTED',
          )
        } else {
          assert.equal(getRegionalGuidanceGenerationUnavailableReason(input), null)
          assert.doesNotThrow(() => assertRegionalGuidanceGenerationAvailable(input))
        }
        assert.deepEqual(input, before)
      }
    }
  }
  assert.notEqual(
    getRegionalGuidanceGenerationUnavailableReason({
      regionalGuidance: [{ ...value, enabled: false }, region()],
    }),
    null,
  )
})

test('regional prompt schema preserves absent and empty blocks and validates its own embedding roles', () => {
  const document = createEmptyProjectDocumentV1({ title: 'Regional prompts' })
  const value = region()
  const empty = { embeddingRefs: [], text: '' }
  const ref = {
    resource: {
      baseModelFamily: 'illustrious',
      civitaiFileId: null,
      civitaiModelId: null,
      civitaiVersionId: null,
      displayName: 'Imported exact embedding',
      fileSha256: 'a'.repeat(64),
      kind: 'embedding',
      localModelId: randomUUID(),
      localVersionId: randomUUID(),
      predictionType: null,
      versionName: 'Saved version',
    },
    token: '<saved>',
  }
  const exact = { embeddingRefs: [ref], text: '  {red|blue}, <saved>\n(soft:1.2)  ' }
  assert.equal(
    Object.hasOwn(
      parseProjectDocumentV1({ ...document, regionalGuidance: [value] }).regionalGuidance![0],
      'prompts',
    ),
    false,
  )
  for (const prompts of [
    { negative: null, positive: empty, useGlobalNegativePrompt: true },
    { negative: empty, positive: null, useGlobalNegativePrompt: false },
    { negative: exact, positive: empty, useGlobalNegativePrompt: true },
  ]) {
    const input = { ...value, prompts }
    assert.equal(isProjectRegionalGuidanceV1(input), true)
    assert.deepEqual(
      parseProjectDocumentV1({ ...document, regionalGuidance: [input] }).regionalGuidance![0],
      input,
    )
  }
  const valid = { negative: exact, positive: null, useGlobalNegativePrompt: false }
  for (const prompts of [
    null,
    {},
    { negative: null, positive: null, useGlobalNegativePrompt: true },
    { negative: null, positive: empty, useGlobalNegativePrompt: false },
    { negative: empty, positive: null },
    { ...valid, extra: true },
    { ...valid, negative: { ...exact, extra: true } },
    { ...valid, negative: { ...exact, text: 'я'.repeat(IGS_SAFETY_CEILINGS.textBytes / 2 + 1) } },
    ...['checkpoint', 'lora', 'vae'].map((kind) => ({
      ...valid,
      negative: { ...exact, embeddingRefs: [{ ...ref, resource: { ...ref.resource, kind } }] },
    })),
  ]) {
    // Boolean assertions keep malformed or oversized inputs out of failure output.
    assert.equal(isProjectRegionalGuidanceV1({ ...value, prompts }), false)
    assert.throws(
      () => parseProjectDocumentV1({ ...document, regionalGuidance: [{ ...value, prompts }] }),
      { code: 'INVALID_PROJECT' },
    )
  }
})

test('regional prompt command guards enforce exact shapes and region plus polarity history ownership', () => {
  const owner = { documentId: randomUUID(), documentRevision: randomUUID(), regionId: randomUUID() }
  const group = `regional:${owner.regionId}:positive:${randomUUID()}`
  const text = { historyGroupId: group, kind: 'text', polarity: 'positive', text: '' }
  const selection = { resourceId: randomUUID(), token: '<saved>', versionId: randomUUID() }
  for (const change of [
    { kind: 'block', polarity: 'positive', present: true },
    { kind: 'block', polarity: 'negative', present: false },
    text,
    { kind: 'text', polarity: 'negative', text: '{bad syntax is still authored data' },
    { ...text, embeddingSelection: selection },
    { kind: 'negative-source', useGlobalNegativePrompt: true },
  ]) {
    assert.equal(isProjectRegionalGuidancePromptChange(change), true)
    assert.equal(isProjectRegionalGuidancePromptChangeForOwner(change, owner), true)
    assert.equal(isProjectRegionalGuidanceChange(change), false)
  }
  assert.equal(
    isProjectRegionalGuidancePromptChangeForOwner(text, { ...owner, regionId: randomUUID() }),
    false,
  )
  for (const change of [
    null,
    { ...text, extra: true },
    { ...text, polarity: 'negative' },
    { ...text, historyGroupId: randomUUID() },
    { ...text, historyGroupId: `regional:${owner.regionId}:positive:not-a-uuid` },
    { ...text, text: 'x'.repeat(IGS_SAFETY_CEILINGS.textBytes + 1) },
    { ...text, embeddingRefs: [] },
    { ...text, embeddingSelection: { ...selection, extra: true } },
    { ...text, embeddingSelection: { ...selection, resourceId: 'untrusted' } },
    { ...text, embeddingSelection: { ...selection, token: ' ' } },
    { kind: 'block', polarity: 'positive', present: 1 },
    { historyGroupId: group, kind: 'block', polarity: 'positive', present: true },
    { historyGroupId: group, kind: 'negative-source', useGlobalNegativePrompt: false },
  ]) {
    assert.equal(isProjectRegionalGuidancePromptChange(change), false)
    assert.equal(isProjectRegionalGuidancePromptChangeForOwner(change, owner), false)
  }
})
