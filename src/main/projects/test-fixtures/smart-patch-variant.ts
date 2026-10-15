import { IGS_SRGB_ICC_SHA256 } from '../../../shared/projects/color-profile.js'
import type {
  IgsProjectDocumentV1,
  IgsSmartPatchGenerationProvenanceV1,
  IgsSmartPatchVariantV1,
} from '../../../shared/projects/project-schema.js'

import { randomUUID } from 'node:crypto'

/** Declared portable metadata only; neither a generated image nor a parser-produced expectation. */
export function smartPatchVariantMetadataFixture(
  family: 'anima' | 'illustrious',
): IgsSmartPatchVariantV1 {
  const bbox = { height: 5, width: 7, x: -19, y: 31 }
  const model = {
    baseModelFamily: family,
    civitaiFileId: null,
    civitaiModelId: null,
    civitaiVersionId: null,
    displayName: 'Frozen checkpoint',
    fileSha256: 'a'.repeat(64),
    kind: 'checkpoint' as const,
    localModelId: randomUUID(),
    localVersionId: randomUUID(),
    predictionType: family === 'anima' ? null : ('epsilon' as const),
    versionName: 'exact version',
  }
  const prompt = { embeddingRefs: [], text: '(lantern:1.5)' }
  const negativePrompt = { embeddingRefs: [], text: 'blur' }
  const generationDraft: IgsProjectDocumentV1['generationDraft'] = {
    cfgRescale: 0,
    dynamicPrompt: { maxPrompts: 4, seedBehavior: 'per-prompt' },
    loras: [],
    model: structuredClone(model),
    negativePrompt: structuredClone(negativePrompt),
    positivePrompt: { embeddingRefs: [], text: '{lantern|moon}' },
    sampling: {
      ...(family === 'anima' ? { animaMethod: 'euler' as const } : {}),
      cfgScale: 4,
      denoisingStrength: 0.5,
      sampler: family === 'anima' ? null : 'Euler',
      scheduler: family === 'anima' ? null : 'Normal',
      steps: 4,
    },
    seed: { policy: 'fixed', value: 0 },
    vae: null,
    vaePrecision: 'Auto',
  }
  const candidateId = randomUUID()
  const maskId = randomUUID()
  const common: Pick<
    IgsSmartPatchGenerationProvenanceV1,
    'executionResultContext' | 'layerSourceContext' | 'schemaVersion'
  > = {
    executionResultContext: {
      acceptedAt: '2026-10-15T10:01:00.000Z',
      candidateId,
      completedAt: '2026-10-15T10:00:00.000Z',
      output: {
        byteSize: 192,
        colorSpace: 'srgb' as const,
        contributionAlpha8: { byteSize: 35, height: 5, sha256: 'd'.repeat(64), width: 7 },
        format: 'png' as const,
        height: 5,
        iccSha256: IGS_SRGB_ICC_SHA256,
        outputMode: 'contribution' as const,
        sha256: 'e'.repeat(64),
        width: 7,
      },
      queueItemId: candidateId,
    },
    layerSourceContext: {
      bbox: { ...bbox },
      coherenceSettings: { edgeSize: 16, minimumDenoise: 0, mode: 'Gaussian Blur' as const },
      generationDraft,
      internalResolution: { height: 64, width: 64 },
      layerId: randomUUID(),
      mask: {
        asset: {
          bytes: 96,
          height: 5,
          path: `assets/masks/${maskId}/${'9'.repeat(64)}.png`,
          sha256: '9'.repeat(64),
          width: 7,
        },
        bounds: { ...bbox },
        id: maskId,
        revision: 1,
      },
      maskBlur: 16,
      preparedInputs: {
        finalContributionMask: { byteSize: 96, height: 5, sha256: '1'.repeat(64), width: 7 },
        latentKeepMask: { byteSize: 104, height: 8, sha256: '2'.repeat(64), width: 8 },
        modelSource: { byteSize: 4096, height: 64, sha256: '3'.repeat(64), width: 64 },
      },
      sourceDocumentId: randomUUID(),
      sourceDocumentRevision: randomUUID(),
      sourceLayerIds: [randomUUID()],
      sourceTarget: { byteSize: 180, height: 5, sha256: 'b'.repeat(64), width: 7 },
    },
    schemaVersion: 1 as const,
  }
  const sampling = {
    actualSeed: 0,
    cfgScale: 4,
    denoisingStrength: 0.5,
    requestedSeedPolicy: 'fixed' as const,
    steps: 4,
  }
  const provenance: IgsSmartPatchGenerationProvenanceV1 =
    family === 'anima'
      ? {
          ...common,
          generationConfiguration: {
            anima: {
              architecture: 'anima-base-1.0',
              checkpointByteSize: 2048,
              qwen3Encoder: { byteSize: 1024, sha256: 'c'.repeat(64) },
              vae: { byteSize: 512, sha256: 'f'.repeat(64) },
            },
            cfgRescale: 0,
            loras: [],
            mode: 'inpaint',
            model: { ...model, baseModelFamily: 'anima', predictionType: null },
            negativePrompt,
            positivePrompt: prompt,
            sampling: { ...sampling, animaMethod: 'euler' },
            vaePrecision: 'Auto',
          },
          kind: 'anima-smart-patch',
        }
      : {
          ...common,
          generationConfiguration: {
            cfgRescale: 0,
            loras: [],
            mode: 'inpaint',
            model: { ...model, baseModelFamily: 'illustrious', predictionType: 'epsilon' },
            negativePrompt,
            positivePrompt: prompt,
            sampling: {
              ...sampling,
              invokeScheduler: 'euler',
              sampler: 'Euler',
              scheduler: 'Normal',
            },
            vae: null,
            vaePrecision: 'Auto',
          },
          kind: 'illustrious-smart-patch',
        }
  const id = randomUUID()
  return {
    asset: {
      bytes: 192,
      height: 5,
      path: `assets/layers/${id}.png`,
      sha256: 'e'.repeat(64),
      width: 7,
    },
    bbox,
    generationProvenance: provenance,
    id,
    name: 'Frozen contribution',
  }
}
