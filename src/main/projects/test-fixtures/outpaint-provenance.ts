import type {
  IgsOutpaintRasterGenerationProvenanceV1,
  IgsProjectDocumentV1,
} from '../../../shared/projects/project-schema.js'
import { parseRasterGenerationProvenanceV1 } from '../../../shared/projects/project-schema.js'

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

import { freezeAlphaOutpaintConditioning } from '../outpaint-conditioning.js'
import { outpaintContributionAlphaIdentity } from '../outpaint-contribution.js'
import {
  acceptedAnimaProvenanceFixture,
  acceptedRasterProvenanceFixture,
} from './accepted-provenance.js'

/** Real encoded image metadata for portable-storage tests; not a verified diffusion execution. */
export function acceptedOutpaintProvenanceFixture(
  family: 'anima' | 'illustrious',
  sourceDocument: IgsProjectDocumentV1,
  source: Buffer,
  output: Buffer,
  bbox: IgsProjectDocumentV1['primaryBbox'],
): IgsOutpaintRasterGenerationProvenanceV1 {
  const base =
    family === 'anima'
      ? acceptedAnimaProvenanceFixture(sourceDocument, output, bbox, { mode: 'img2img' })
      : acceptedRasterProvenanceFixture(sourceDocument, output, bbox)
  const { context } = freezeAlphaOutpaintConditioning({
    bbox,
    sourceTargetSha256: createHash('sha256').update(source).digest('hex'),
    targetPngBytes: source,
  })
  const result = parseRasterGenerationProvenanceV1({
    ...base,
    executionResultContext: {
      ...base.executionResultContext,
      output: {
        ...base.executionResultContext.output,
        contributionAlpha8: outpaintContributionAlphaIdentity(output, bbox.width, bbox.height),
        outputMode: 'contribution',
      },
    },
    generationConfiguration: {
      ...base.generationConfiguration,
      mode: 'outpaint',
      sampling: { ...base.generationConfiguration.sampling, denoisingStrength: 0.5 },
    },
    kind: `${family}-outpaint`,
    layerSourceContext: {
      ...base.layerSourceContext,
      outpaint: {
        infillResource: context.infillResource,
        keepMask: context.keepMask,
        policy: context.policy,
        sourceTarget: context.sourceTarget,
      },
      sourceTargetSha256: context.sourceTarget.sha256,
    },
  })
  assert.ok(result.kind === 'anima-outpaint' || result.kind === 'illustrious-outpaint')
  return result
}
