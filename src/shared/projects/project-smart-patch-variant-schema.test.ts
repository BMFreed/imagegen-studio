import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

import { smartPatchVariantMetadataFixture } from '../../main/projects/test-fixtures/smart-patch-variant.js'
import {
  createEmptyProjectDocumentV1,
  type IgsSmartPatchVariantV1,
  isRasterGenerationConfigurationV1,
  parseProjectDocumentV1,
  parseSmartPatchGenerationProvenanceV1,
  parseSmartPatchVariantV1,
} from './project-schema.js'

for (const family of ['illustrious', 'anima'] as const) {
  for (const mode of ['txt2img', 'img2img', 'inpaint', 'outpaint'] as const) {
    test(`${family} standalone Smart Patch ${mode} keeps world placement separate from reusable settings`, () => {
      const variant = smartPatchVariantMetadataFixture(family)
      const provenance = variant.generationProvenance
      Reflect.set(provenance.generationConfiguration, 'mode', mode)
      if (mode === 'txt2img') {
        Reflect.deleteProperty(provenance.generationConfiguration.sampling, 'denoisingStrength')
        provenance.layerSourceContext.preparedInputs.modelSource = null
      }
      const before = structuredClone(variant)
      assert.deepEqual(parseSmartPatchVariantV1(variant), before)
      assert.deepEqual(parseSmartPatchGenerationProvenanceV1(provenance), provenance)
      assert.equal('size' in provenance.generationConfiguration, false)
      assert.equal('seedBehavior' in provenance.generationConfiguration.sampling, false)
      assert.equal(
        provenance.layerSourceContext.generationDraft.dynamicPrompt?.seedBehavior,
        'per-prompt',
      )
      assert.equal(provenance.executionResultContext.output.width, 7)
      assert.equal(provenance.layerSourceContext.internalResolution.width, 64)
      assert.deepEqual(variant, before)
    })
  }

  test(`${family} standalone Smart Patch rejects mismatched immutable placement and output identities`, () => {
    const changes: ((variant: IgsSmartPatchVariantV1) => void)[] = [
      (variant) => {
        variant.bbox.x++
      },
      (variant) => {
        variant.bbox.width++
      },
      (variant) => {
        variant.asset.bytes++
      },
      (variant) => {
        variant.asset.width++
      },
      (variant) => {
        variant.asset.height++
      },
      (variant) => {
        variant.asset.sha256 = '0'.repeat(64)
      },
      (variant) => {
        variant.asset.path = `assets/layers/${randomUUID()}.png`
      },
      (variant) => {
        variant.asset.path = `assets/layers/${variant.id}.webp`
      },
      (variant) => {
        variant.generationProvenance.layerSourceContext.sourceTarget.width++
      },
      (variant) => {
        variant.generationProvenance.executionResultContext.output.width++
      },
      (variant) => {
        variant.generationProvenance.executionResultContext.output.contributionAlpha8.width++
      },
      (variant) => {
        variant.generationProvenance.executionResultContext.output.contributionAlpha8.byteSize++
      },
      (variant) => {
        variant.generationProvenance.executionResultContext.queueItemId = randomUUID()
      },
      (variant) => {
        variant.generationProvenance.layerSourceContext.preparedInputs.modelSource = null
      },
      (variant) => {
        variant.generationProvenance.layerSourceContext.preparedInputs.modelSource!.width++
      },
      (variant) => {
        variant.generationProvenance.layerSourceContext.preparedInputs.latentKeepMask.width++
      },
      (variant) => {
        variant.generationProvenance.layerSourceContext.preparedInputs.finalContributionMask
          .height++
      },
      (variant) => {
        variant.generationProvenance.layerSourceContext.sourceLayerIds.push(
          variant.generationProvenance.layerSourceContext.layerId,
        )
      },
      (variant) => {
        variant.generationProvenance.layerSourceContext.sourceLayerIds.push(
          variant.generationProvenance.layerSourceContext.mask.id,
        )
      },
      (variant) => {
        variant.generationProvenance.layerSourceContext.sourceLayerIds.push(
          ...variant.generationProvenance.layerSourceContext.sourceLayerIds,
        )
      },
      (variant) => {
        variant.generationProvenance.layerSourceContext.generationDraft.model!.fileSha256 =
          '0'.repeat(64)
      },
      (variant) => {
        variant.generationProvenance.layerSourceContext.generationDraft.model!.baseModelFamily =
          family === 'anima' ? 'illustrious' : 'anima'
      },
      (variant) => {
        Reflect.set(
          variant.generationProvenance.executionResultContext.output,
          'outputMode',
          'full-composite',
        )
      },
      (variant) => {
        Reflect.deleteProperty(
          variant.generationProvenance.executionResultContext.output,
          'contributionAlpha8',
        )
      },
      (variant) => {
        Reflect.deleteProperty(
          variant.generationProvenance.generationConfiguration.sampling,
          'denoisingStrength',
        )
      },
    ]
    for (const [index, change] of changes.entries()) {
      const variant = smartPatchVariantMetadataFixture(family)
      change(variant)
      assert.throws(
        () => parseSmartPatchVariantV1(variant),
        { code: 'INVALID_PROJECT' },
        `mismatch ${index}`,
      )
    }
    assert.doesNotThrow(() => parseSmartPatchVariantV1(smartPatchVariantMetadataFixture(family)))
  })

  test(`${family} standalone Smart Patch rejects private operational data in every provenance group`, () => {
    for (const [field, value] of [
      ['regionalGuidance', []],
      ['projectPath', '/private/project.igs'],
      ['managedPath', '/private/model.safetensors'],
      ['scratchPath', '/private/scratch'],
      ['compiledPrompt', { weights: [1] }],
    ] as const) {
      const fixture = smartPatchVariantMetadataFixture(family)
      const groups = [
        fixture,
        fixture.generationProvenance,
        fixture.generationProvenance.generationConfiguration,
        fixture.generationProvenance.layerSourceContext,
        fixture.generationProvenance.executionResultContext,
        fixture.generationProvenance.layerSourceContext.generationDraft,
        fixture.generationProvenance.layerSourceContext.preparedInputs.modelSource!,
      ]
      for (const group of groups) {
        Reflect.set(group, field, value)
        assert.throws(() => parseSmartPatchVariantV1(fixture), { code: 'INVALID_PROJECT' }, field)
        Reflect.deleteProperty(group, field)
      }
      assert.doesNotThrow(() => parseSmartPatchVariantV1(fixture))
    }
    for (const field of ['size', 'internalResolution', 'boundingBox']) {
      const fixture = smartPatchVariantMetadataFixture(family)
      Reflect.set(fixture.generationProvenance.generationConfiguration, field, {
        height: 64,
        width: 64,
      })
      assert.throws(() => parseSmartPatchVariantV1(fixture), { code: 'INVALID_PROJECT' })
    }
    for (const field of ['padding', 'visible', 'locked', 'lastActualSeedSnapshot', 'projectKey']) {
      const fixture = smartPatchVariantMetadataFixture(family)
      Reflect.set(fixture.generationProvenance.layerSourceContext, field, 1)
      assert.throws(() => parseSmartPatchVariantV1(fixture), { code: 'INVALID_PROJECT' })
    }
  })

  test(`${family} standalone Smart Patch accepts complete uint32 seeds and preserves unspecified planner behavior`, () => {
    for (const seed of [0, 0xff_ff_ff_ff]) {
      const variant = smartPatchVariantMetadataFixture(family)
      variant.generationProvenance.generationConfiguration.sampling.actualSeed = seed
      const parsed = parseSmartPatchVariantV1(variant)
      assert.equal(parsed.generationProvenance.generationConfiguration.sampling.actualSeed, seed)
      assert.equal(
        'seedBehavior' in parsed.generationProvenance.generationConfiguration.sampling,
        false,
      )
      for (const behavior of ['per-iteration', 'per-prompt'] as const) {
        variant.generationProvenance.generationConfiguration.sampling.seedBehavior = behavior
        assert.equal(
          parseSmartPatchVariantV1(variant).generationProvenance.generationConfiguration.sampling
            .seedBehavior,
          behavior,
        )
      }
    }
    for (const seed of [-1, 0x1_00_00_00_00, 0.5, Number.NaN]) {
      const variant = smartPatchVariantMetadataFixture(family)
      variant.generationProvenance.generationConfiguration.sampling.actualSeed = seed
      assert.throws(() => parseSmartPatchVariantV1(variant), { code: 'INVALID_PROJECT' })
    }
  })

  test(`${family} standalone Smart Patch metadata does not admit variants into production documents`, () => {
    const variant = smartPatchVariantMetadataFixture(family)
    const source = variant.generationProvenance.layerSourceContext
    const document = createEmptyProjectDocumentV1({ title: 'Still an empty Smart Patch' })
    const patch = {
      activeRasterSubLayerId: null,
      blendMode: 'normal',
      boundingBox: source.bbox,
      generationDraft: source.generationDraft,
      id: source.layerId,
      internalResolution: source.internalResolution,
      kind: 'smart-patch',
      locked: false,
      mask: source.mask,
      name: 'Smart Patch',
      opacity: 1,
      rasterSubLayers: [],
      visible: true,
    }
    const raw = { ...document, layers: [patch] }
    assert.doesNotThrow(() => parseProjectDocumentV1(raw))
    assert.doesNotThrow(() => parseSmartPatchVariantV1(variant))
    Reflect.set(patch, 'rasterSubLayers', [variant])
    assert.throws(() => parseProjectDocumentV1(raw), { code: 'INVALID_PROJECT' })
    patch.rasterSubLayers = []
    Reflect.set(patch, 'activeRasterSubLayerId', variant.id)
    assert.throws(() => parseProjectDocumentV1(raw), { code: 'INVALID_PROJECT' })
    assert.equal(
      isRasterGenerationConfigurationV1(variant.generationProvenance.generationConfiguration),
      false,
    )
  })
}

test('standalone Smart Patch world geometry permits one pixel independently of internal latent grids', () => {
  const variant = smartPatchVariantMetadataFixture('illustrious')
  for (const target of [
    variant.bbox,
    variant.asset,
    variant.generationProvenance.layerSourceContext.bbox,
    variant.generationProvenance.layerSourceContext.sourceTarget,
    variant.generationProvenance.layerSourceContext.preparedInputs.finalContributionMask,
    variant.generationProvenance.executionResultContext.output,
    variant.generationProvenance.executionResultContext.output.contributionAlpha8,
  ]) {
    target.width = 1
    target.height = 1
  }
  variant.generationProvenance.executionResultContext.output.contributionAlpha8.byteSize = 1
  assert.equal(parseSmartPatchVariantV1(variant).bbox.width, 1)
  for (const width of [0, 2049, 1.5]) {
    const changed = structuredClone(variant)
    changed.bbox.width = width
    assert.throws(() => parseSmartPatchVariantV1(changed), { code: 'INVALID_PROJECT' })
  }
  variant.generationProvenance.layerSourceContext.internalResolution.width = 63
  assert.throws(() => parseSmartPatchVariantV1(variant), { code: 'INVALID_PROJECT' })
})

test('standalone Anima component identities contain bytes and hash without fabricated registry UUIDs', () => {
  const variant = smartPatchVariantMetadataFixture('anima')
  if (variant.generationProvenance.kind !== 'anima-smart-patch') {
    assert.fail('Anima fixture')
  }
  const components = variant.generationProvenance.generationConfiguration.anima
  assert.deepEqual(Object.keys(components.qwen3Encoder).sort(), ['byteSize', 'sha256'])
  assert.deepEqual(Object.keys(components.vae).sort(), ['byteSize', 'sha256'])
  assert.doesNotThrow(() => parseSmartPatchVariantV1(variant))
  for (const name of ['qwen3Encoder', 'vae'] as const) {
    for (const field of ['localModelId', 'localVersionId', 'path']) {
      Reflect.set(components[name], field, randomUUID())
      assert.throws(() => parseSmartPatchVariantV1(variant), { code: 'INVALID_PROJECT' })
      Reflect.deleteProperty(components[name], field)
    }
  }
  const source = variant.generationProvenance.layerSourceContext
  source.internalResolution.width = 56
  source.preparedInputs.latentKeepMask.width = 7
  source.preparedInputs.modelSource!.width = 56
  assert.throws(() => parseSmartPatchVariantV1(variant), { code: 'INVALID_PROJECT' })
})

test('standalone Smart Patch inpaint does not relax normal Raster configuration modes', () => {
  const variant = smartPatchVariantMetadataFixture('illustrious')
  const configuration = {
    ...variant.generationProvenance.generationConfiguration,
    size: { height: 64, width: 64 },
  }
  assert.equal(isRasterGenerationConfigurationV1(configuration), false)
  Reflect.set(configuration, 'mode', 'img2img')
  assert.equal(isRasterGenerationConfigurationV1(configuration), true)
})
