import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

import { smartPatchVariantMetadataFixture } from '../../main/projects/test-fixtures/smart-patch-variant.js'
import {
  createEmptyProjectDocumentV1,
  type IgsProjectDocumentV1,
  type IgsRasterLayerV1,
  type IgsSmartPatchLayerV1,
  parseProjectDocumentV1,
  projectActiveRasterContributions,
  projectAssetReferences,
  projectRasterAssets,
  projectRasterLayers,
} from './project-schema.js'

function patchDocument(family: 'anima' | 'illustrious'): {
  document: IgsProjectDocumentV1
  patch: IgsSmartPatchLayerV1
} {
  const document = createEmptyProjectDocumentV1({ title: 'Portable variants' })
  const variants = [
    smartPatchVariantMetadataFixture(family),
    smartPatchVariantMetadataFixture(family),
  ]
  const id = randomUUID()
  const maskId = randomUUID()
  for (const variant of variants) {
    variant.generationProvenance.layerSourceContext.layerId = id
    variant.generationProvenance.layerSourceContext.sourceDocumentId = document.documentId
  }
  const patch: IgsSmartPatchLayerV1 = {
    activeRasterSubLayerId: variants[1].id,
    blendMode: 'multiply',
    boundingBox: { height: 128, width: 256, x: 100, y: 200 },
    generationDraft: structuredClone(document.generationDraft),
    id,
    internalResolution: { height: 512, width: 512 },
    kind: 'smart-patch',
    locked: false,
    mask: { asset: null, id: maskId, revision: 4 },
    name: 'Accepted Patch',
    opacity: 0.75,
    rasterSubLayers: variants,
    visible: true,
  }
  document.layers = [patch]
  return { document, patch }
}

function raster(id: string = randomUUID()): IgsRasterLayerV1 {
  return {
    asset: {
      bytes: 100,
      height: 2,
      path: `assets/layers/${id}.png`,
      sha256: '8'.repeat(64),
      width: 2,
    },
    blendMode: 'normal',
    id,
    kind: 'raster',
    locked: false,
    name: 'Ordinary Raster',
    opacity: 1,
    transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: 0, y: 0 },
    visible: true,
  }
}

for (const family of ['illustrious', 'anima'] as const) {
  test(`${family} document retains every variant and historical inputs without requiring present authored geometry`, () => {
    const { document, patch } = patchDocument(family)
    const frozen = structuredClone(patch.rasterSubLayers)
    assert.deepEqual(parseProjectDocumentV1(document), document)
    patch.boundingBox = { height: 900, width: 1600, x: -900, y: -500 }
    patch.internalResolution = { height: 1024, width: 1024 }
    patch.mask = { asset: null, id: randomUUID(), revision: 0 }
    document.documentRevision = randomUUID()
    const parsed = parseProjectDocumentV1(document)
    assert.equal(parsed.layers[0]?.kind, 'smart-patch')
    assert.deepEqual(patch.rasterSubLayers, frozen)
    assert.deepEqual(projectRasterLayers(parsed), [])
    assert.deepEqual(projectRasterAssets(parsed), frozen)
    assert.deepEqual(
      projectAssetReferences(parsed),
      frozen.map(({ asset }) => asset),
    )
    assert.equal(
      projectAssetReferences(parsed).some(({ path }) => path.startsWith('assets/masks/')),
      false,
    )
  })

  test(`${family} nonempty Smart Patch refuses null or foreign active identity while empty patches require null`, () => {
    const { document, patch } = patchDocument(family)
    for (const id of [null, randomUUID()]) {
      patch.activeRasterSubLayerId = id
      assert.throws(() => parseProjectDocumentV1(document), { code: 'INVALID_PROJECT' })
    }
    patch.activeRasterSubLayerId = patch.rasterSubLayers[0].id
    assert.doesNotThrow(() => parseProjectDocumentV1(document))
    patch.rasterSubLayers = []
    assert.throws(() => parseProjectDocumentV1(document), { code: 'INVALID_PROJECT' })
    patch.activeRasterSubLayerId = null
    assert.doesNotThrow(() => parseProjectDocumentV1(document))
    assert.deepEqual(projectActiveRasterContributions(document), [])
  })

  test(`${family} copied Patch ownership retains immutable historical source rather than rewriting provenance`, () => {
    const { document, patch } = patchDocument(family)
    const history = patch.rasterSubLayers.map(({ generationProvenance }) =>
      structuredClone(generationProvenance),
    )
    assert.doesNotThrow(() => parseProjectDocumentV1(document))
    const copy = structuredClone(patch)
    copy.id = randomUUID()
    copy.mask.id = randomUUID()
    for (const variant of copy.rasterSubLayers) {
      variant.id = randomUUID()
      variant.asset.path = `assets/layers/${variant.id}.png`
    }
    copy.activeRasterSubLayerId = copy.rasterSubLayers[1].id
    document.layers.push(copy)
    const parsed = parseProjectDocumentV1(document)
    assert.deepEqual(
      (parsed.layers[1] as IgsSmartPatchLayerV1).rasterSubLayers.map(
        ({ generationProvenance }) => generationProvenance,
      ),
      history,
    )
    assert.notEqual(copy.id, history[0].layerSourceContext.layerId)
    assert.notEqual(document.documentRevision, history[0].layerSourceContext.sourceDocumentRevision)
    document.documentId = randomUUID()
    assert.notEqual(document.documentId, history[0].layerSourceContext.sourceDocumentId)
    assert.doesNotThrow(() => parseProjectDocumentV1(document))
    assert.deepEqual(
      copy.rasterSubLayers.map(({ generationProvenance }) => generationProvenance),
      history,
    )
  })

  test(`${family} active material contribution uses frozen placement and parent appearance while all variants remain owned`, () => {
    const { document, patch } = patchDocument(family)
    const above = raster()
    const below = raster()
    document.layers = [above, patch, below]
    const active = patch.rasterSubLayers[1]
    const [top, contribution, bottom] = projectActiveRasterContributions(document)
    assert.equal(top, above)
    assert.equal(bottom, below)
    assert.deepEqual(contribution, {
      asset: active.asset,
      blendMode: 'multiply',
      id: patch.id,
      kind: 'raster',
      locked: false,
      name: patch.name,
      opacity: 0.75,
      transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: active.bbox.x, y: active.bbox.y },
      visible: true,
    })
    assert.equal('generationProvenance' in contribution, false)
    assert.deepEqual(projectRasterLayers(document), [above, below])
    assert.deepEqual(
      projectRasterAssets(document).map(({ id }) => id),
      [above.id, patch.rasterSubLayers[0].id, active.id, below.id],
    )
    patch.boundingBox.x += 1000
    patch.boundingBox.width += 512
    patch.maskSettings = { blur: 0, padding: 100 }
    assert.deepEqual(projectActiveRasterContributions(document)[1], contribution)
    patch.visible = false
    patch.locked = true
    patch.opacity = 0.4
    const hidden = projectActiveRasterContributions(document)[1]
    assert.equal(hidden.visible, false)
    assert.equal(hidden.locked, true)
    assert.equal(hidden.opacity, 0.4)
    assert.deepEqual(
      projectAssetReferences(document).map(({ path }) => path),
      [above.asset.path, ...patch.rasterSubLayers.map(({ asset }) => asset.path), below.asset.path],
    )
  })
}

test('all Project layer, mask and variant identities share one namespace regardless of stack order', () => {
  for (const scenario of [
    'variant-owner',
    'variant-mask',
    'variant-variant',
    'later-raster',
    'earlier-raster',
    'later-mask',
    'later-patch',
  ] as const) {
    const { document, patch } = patchDocument('illustrious')
    const first = patch.rasterSubLayers[0]
    const duplicate = (id: string) => {
      first.id = id
      first.asset.path = `assets/layers/${id}.png`
    }
    if (scenario === 'variant-owner') {
      duplicate(patch.id)
    }
    if (scenario === 'variant-mask') {
      duplicate(patch.mask.id)
    }
    if (scenario === 'variant-variant') {
      duplicate(patch.rasterSubLayers[1].id)
    }
    if (scenario === 'later-raster') {
      document.layers.push(raster(first.id))
    }
    if (scenario === 'earlier-raster') {
      document.layers.unshift(raster(first.id))
    }
    if (scenario === 'later-mask' || scenario === 'later-patch') {
      const another = structuredClone(patch)
      another.id = scenario === 'later-patch' ? first.id : randomUUID()
      another.mask.id = scenario === 'later-mask' ? first.id : randomUUID()
      another.activeRasterSubLayerId = null
      another.rasterSubLayers = []
      document.layers.push(another)
    }
    assert.throws(() => parseProjectDocumentV1(document), { code: 'INVALID_PROJECT' }, scenario)
  }
  assert.doesNotThrow(() => parseProjectDocumentV1(patchDocument('illustrious').document))
})
