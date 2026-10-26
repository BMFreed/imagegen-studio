import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'

import { smartPatchVariantMetadataFixture } from '../../main/projects/test-fixtures/smart-patch-variant.js'
import { IGS_SAFETY_CEILINGS, isSmartPatchGenerationConfigurationV1 } from './project-schema.js'
import {
  isSmartResultComparisonData,
  isSmartResultComparisonDataForRequest,
  isSmartResultComparisonRequest,
  type SmartResultComparisonData,
  type SmartResultComparisonRequest,
} from './smart-result-comparison.js'

function fixture(family: 'anima' | 'illustrious'): SmartResultComparisonData {
  const source = smartPatchVariantMetadataFixture(family)
  return {
    assetSha256: source.asset.sha256,
    currentMode: null,
    documentId: randomUUID(),
    documentRevision: randomUUID(),
    generationConfiguration: source.generationProvenance.generationConfiguration,
    modeUnavailableReason: 'CPU worker unavailable',
    owner: { kind: 'smart-patch-variant', layerId: randomUUID(), variantId: source.id },
    resultId: source.id,
  }
}

for (const family of ['illustrious', 'anima'] as const) {
  test(`${family} strict Smart comparison envelope binds every request field and rejects private context`, () => {
    const data = fixture(family)
    const { assetSha256, documentId, documentRevision, owner } = data
    const request: SmartResultComparisonRequest = {
      assetSha256,
      documentId,
      documentRevision,
      owner,
    }
    assert.ok(isSmartResultComparisonRequest(request))
    assert.ok(isSmartResultComparisonDataForRequest(data, request))
    for (const changed of [
      { assetSha256: '0'.repeat(64) },
      { documentId: randomUUID() },
      { documentRevision: randomUUID() },
      { owner: { ...owner, layerId: randomUUID() } },
      { owner: { kind: 'raster' as const, layerId: data.resultId } },
      // Internally consistent, independently valid, but from another requested active member.
      {
        owner: {
          kind: 'smart-patch-variant' as const,
          layerId: owner.layerId,
          variantId: randomUUID(),
        },
        resultId: '',
      },
    ]) {
      if ('resultId' in changed && changed.owner?.kind === 'smart-patch-variant') {
        changed.resultId = changed.owner.variantId
      }
      const crossed = { ...data, ...changed }
      assert.ok(isSmartResultComparisonData(crossed), JSON.stringify(changed))
      assert.equal(isSmartResultComparisonDataForRequest(crossed, request), false)
    }
    for (const invalid of [
      { ...request, documentRevision: 'private' },
      { ...request, assetSha256: 'A'.repeat(64) },
      { ...request, owner: { ...owner, path: '/private' } },
      {
        ...request,
        owner: { kind: 'smart-patch-variant', layerId: data.resultId, variantId: data.resultId },
      },
      { ...request, layerSourceContext: {} },
    ]) {
      assert.equal(isSmartResultComparisonRequest(invalid), false)
    }
    for (const invalid of [
      { ...data, resultId: randomUUID() },
      { ...data, currentMode: 'inpaint', modeUnavailableReason: null },
      { ...data, currentMode: 'txt2img' },
      { ...data, modeUnavailableReason: null },
      { ...data, modeUnavailableReason: ' ' },
      { ...data, modeUnavailableReason: 'ø'.repeat(IGS_SAFETY_CEILINGS.titleBytes) },
      { ...data, layerSourceContext: {} },
      { ...data, executionResultContext: {} },
      {
        ...data,
        generationConfiguration: {
          ...data.generationConfiguration,
          size: { height: 64, width: 64 },
        },
      },
      {
        ...data,
        generationConfiguration: { ...data.generationConfiguration, managedPath: '/private' },
      },
      {
        ...data,
        generationConfiguration: {
          ...data.generationConfiguration,
          model: { ...data.generationConfiguration.model, path: '/private' },
        },
      },
      {
        ...data,
        generationConfiguration: {
          ...data.generationConfiguration,
          sampling: { ...data.generationConfiguration.sampling, sourceTarget: {} },
        },
      },
    ]) {
      assert.equal(isSmartResultComparisonData(invalid), false, JSON.stringify(invalid))
    }
    for (const currentMode of ['txt2img', 'img2img', 'outpaint'] as const) {
      assert.ok(isSmartResultComparisonData({ ...data, currentMode, modeUnavailableReason: null }))
    }
    assert.ok(isSmartPatchGenerationConfigurationV1(data.generationConfiguration))
    assert.equal(
      isSmartPatchGenerationConfigurationV1({
        ...data.generationConfiguration,
        layerSourceContext: {},
      }),
      false,
    )
  })
}
