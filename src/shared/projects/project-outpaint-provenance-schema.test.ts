import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

import { animaFixturePng } from '../../main/projects/test-fixtures/anima-batch.js'
import { acceptedOutpaintProvenanceFixture } from '../../main/projects/test-fixtures/outpaint-provenance.js'
import {
  compareRasterGenerationSettings,
  isRasterGenerationData,
} from './generation-settings-comparison.js'
import {
  createEmptyProjectDocumentV1,
  isRasterGenerationConfigurationV1,
  parseProjectDocumentV1,
  parseRasterGenerationProvenanceV1,
} from './project-schema.js'

async function fixture(family: 'anima' | 'illustrious') {
  const document = createEmptyProjectDocumentV1({
    primaryBbox: { height: 64, width: 64, x: -7, y: 12 },
    title: 'Portable outpaint',
  })
  const source = await animaFixturePng(128)
  const output = await animaFixturePng(255)
  const provenance = acceptedOutpaintProvenanceFixture(
    family,
    document,
    source,
    output,
    document.primaryBbox,
  )
  const id = randomUUID()
  document.layers = [
    {
      asset: {
        bytes: output.length,
        height: 64,
        path: `assets/layers/${id}.png`,
        sha256: provenance.executionResultContext.output.sha256,
        width: 64,
      },
      blendMode: 'normal',
      generationProvenance: provenance,
      id,
      kind: 'raster',
      locked: false,
      name: 'Outpaint',
      opacity: 1,
      transform: { rotationDegrees: 0, scaleX: 1, scaleY: 1, x: -7, y: 12 },
      visible: true,
    },
  ]
  return { document, provenance }
}

for (const family of ['illustrious', 'anima'] as const) {
  test(`${family} strict portable outpaint metadata binds source/mask/contribution without private operational data`, async () => {
    const { document, provenance } = await fixture(family)
    assert.deepEqual(parseRasterGenerationProvenanceV1(provenance), provenance)
    assert.deepEqual(parseProjectDocumentV1(document), document)
    assert.equal(isRasterGenerationConfigurationV1(provenance.generationConfiguration), true)
    assert.equal(provenance.generationConfiguration.mode, 'outpaint')
    assert.equal(provenance.generationConfiguration.sampling.denoisingStrength, 0.5)
    assert.equal(provenance.executionResultContext.output.outputMode, 'contribution')
    const changes: ((value: typeof provenance) => void)[] = [
      (value) => Reflect.deleteProperty(value.layerSourceContext, 'outpaint'),
      (value) =>
        Reflect.set(value.layerSourceContext.outpaint.sourceTarget, 'sha256', 'a'.repeat(64)),
      (value) => Reflect.set(value.layerSourceContext.outpaint.sourceTarget, 'width', 128),
      (value) =>
        Reflect.set(value.layerSourceContext.outpaint.sourceTarget, 'iccSha256', 'a'.repeat(64)),
      (value) => Reflect.set(value.layerSourceContext.outpaint.keepMask, 'byteSize', 64),
      (value) => Reflect.set(value.layerSourceContext.outpaint.keepMask, 'polarity', 'generate'),
      (value) => Reflect.set(value.layerSourceContext.outpaint.keepMask, 'sha256', 'invalid'),
      (value) => Reflect.set(value.layerSourceContext.outpaint.policy, 'fadeDistance', 0),
      (value) => Reflect.set(value.layerSourceContext.outpaint.policy, 'minimumDenoise', 1),
      (value) =>
        Reflect.set(value.layerSourceContext.outpaint.infillResource, 'sha256', 'a'.repeat(64)),
      (value) => Reflect.set(value.layerSourceContext.outpaint.infillResource, 'byteSize', 1),
      (value) =>
        Reflect.set(
          value.layerSourceContext.outpaint.infillResource,
          'managedPath',
          '/private/lama.pt',
        ),
      (value) => Reflect.set(value.layerSourceContext.outpaint, 'regionalGuidance', []),
      (value) => Reflect.set(value.layerSourceContext, 'sourcePngPath', '/private/source.png'),
      (value) => Reflect.set(value.executionResultContext.output, 'outputMode', 'full-composite'),
      (value) => Reflect.deleteProperty(value.executionResultContext.output, 'contributionAlpha8'),
      (value) => Reflect.set(value.executionResultContext.output.contributionAlpha8, 'byteSize', 1),
      (value) => Reflect.set(value.executionResultContext.output.contributionAlpha8, 'width', 128),
      (value) => Reflect.set(value.generationConfiguration, 'mode', 'img2img'),
      (value) =>
        Reflect.deleteProperty(value.generationConfiguration.sampling, 'denoisingStrength'),
      (value) => Reflect.set(value.generationConfiguration, 'nativePlan', { sigmas: [1, 0] }),
      (value) => Reflect.set(value.generationConfiguration, 'regionalGuidance', []),
    ]
    for (const change of changes) {
      const changed = structuredClone(provenance)
      change(changed)
      assert.throws(() => parseRasterGenerationProvenanceV1(changed), { code: 'INVALID_PROJECT' })
    }
    for (const [key, wrong] of [
      ['bytes', 1],
      ['sha256', 'a'.repeat(64)],
      ['width', 128],
      ['height', 128],
      ['path', `assets/layers/${document.layers[0].id}.webp`],
    ] as const) {
      const changed = structuredClone(document)
      Reflect.set(changed.layers[0].asset, key, wrong)
      assert.throws(() => parseProjectDocumentV1(changed), { code: 'INVALID_PROJECT' })
    }
  })

  test(`${family} outpaint comparison keeps mode/strength reusable and excludes source/policy/LaMa from transport`, async () => {
    const { document, provenance } = await fixture(family)
    const draft = structuredClone(document.generationDraft)
    draft.model = provenance.generationConfiguration.model
    draft.sampling.denoisingStrength = 0.5
    const data = {
      currentMode: 'outpaint' as const,
      documentId: document.documentId,
      generationConfiguration: structuredClone(provenance.generationConfiguration),
      layerId: document.layers[0].id,
      modeUnavailableReason: null,
    }
    assert.equal(isRasterGenerationData(data), true)
    assert.equal(
      isRasterGenerationData({ ...data, outpaint: provenance.layerSourceContext.outpaint }),
      false,
    )
    const current = {
      bbox: document.primaryBbox,
      generationDraft: draft,
      modelCatalog: null,
      modelCatalogError: null,
      reuseSeed: null,
    }
    const before = structuredClone({ current, data, provenance })
    const rows = compareRasterGenerationSettings(data, current).flatMap((section) => section.rows)
    assert.equal(rows.find((row) => row.key === 'denoisingStrength.value')?.status, 'Same')
    assert.equal(rows.find((row) => row.key === 'context.mode')?.status, 'Same')
    assert.equal(
      rows.some((row) =>
        /outpaint|mask|sourceTarget|layerSource|infill|lama|contribution/i.test(row.key),
      ),
      false,
    )
    assert.deepEqual({ current, data, provenance }, before)
    current.generationDraft.sampling.denoisingStrength = 0.25
    assert.equal(
      compareRasterGenerationSettings(data, current)
        .flatMap((section) => section.rows)
        .find((row) => row.key === 'denoisingStrength.value')?.status,
      'Changed',
    )
  })
}
