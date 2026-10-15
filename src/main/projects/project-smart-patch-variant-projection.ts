import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import {
  IGS_GENERATION_PNG_MAX_BYTES,
  type IgsSmartPatchVariantV1,
  parseSmartPatchVariantV1,
} from '../../shared/projects/project-schema.js'
import { activePromptEmbeddingRefs } from '../../shared/projects/prompt-embeddings.js'

import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'

import type { VerifiedSmartPatchCandidateRead } from './smart-patch-generation-staging.js'

import { validateSrgbPngStream } from './igs-package.js'
import { localProjectRecoveryKey } from './project-identity.js'
import { decodeDerivedProjectMaskPng } from './project-mask.js'
import { parseFrozenQueuedSmartPatchV1 } from './smart-patch-queued-generation.js'
import { decodeTargetPngAlpha } from './target-png-mode.js'

export class SmartPatchVariantProjectionError extends Error {
  readonly code = 'SMART_PATCH_VARIANT_INVALID'

  constructor(message: string) {
    super(message)
    this.name = 'SmartPatchVariantProjectionError'
  }
}

const digest = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex')
const refuse = (): never => {
  throw new SmartPatchVariantProjectionError(
    'The Smart Patch candidate cannot form an exact portable variant proposal.',
  )
}

/** Proposed metadata only. No accepted document, history, receipt or staging state is changed. */
export async function projectVerifiedSmartPatchVariant(input: {
  acceptedAt: string
  read: VerifiedSmartPatchCandidateRead
  variantId: string
}): Promise<IgsSmartPatchVariantV1> {
  // Capture bytes as well as metadata before PNG validation can yield.
  const acceptedAt = input.acceptedAt
  const variantId = input.variantId
  const candidate = structuredClone(input.read.candidate)
  const imageBytes = Buffer.from(input.read.imagePngBytes)
  const maskBytes = Buffer.from(input.read.finalMaskPngBytes)
  try {
    const payload = parseFrozenQueuedSmartPatchV1(JSON.parse(candidate.frozenSmartPatchPayloadJson))
    const { context, files } = payload
    const image = candidate.image
    const finalMask = files['final-contribution-mask.png']
    if (
      digest(candidate.frozenSmartPatchPayloadJson) !== candidate.frozenPayloadSha256 ||
      !isDeepStrictEqual(candidate.payload, payload) ||
      candidate.kind !== 'smart-patch-world-candidate' ||
      candidate.candidateId !== candidate.queueItemId ||
      candidate.localProjectKey !== localProjectRecoveryKey(candidate.projectPath) ||
      candidate.localProjectKey !== context.projectKey ||
      candidate.documentId !== context.documentId ||
      candidate.documentRevision !== context.documentRevision ||
      !isDeepStrictEqual(candidate.bbox, context.bbox) ||
      candidate.actualSeed !== payload.item.item.seed ||
      image.width !== context.bbox.width ||
      image.height !== context.bbox.height ||
      image.iccSha256 !== IGS_SRGB_ICC_SHA256 ||
      imageBytes.length !== image.byteSize ||
      digest(imageBytes) !== image.sha256 ||
      maskBytes.length !== finalMask.byteSize ||
      digest(maskBytes) !== finalMask.sha256 ||
      !isDeepStrictEqual(
        { ...finalMask },
        {
          byteSize: candidate.finalContributionMask.byteSize,
          height: candidate.finalContributionMask.height,
          sha256: candidate.finalContributionMask.sha256,
          width: candidate.finalContributionMask.width,
        },
      )
    ) {
      refuse()
    }
    await validateSrgbPngStream(
      (async function* () {
        yield imageBytes
      })(),
      'world-result.png',
      IGS_GENERATION_PNG_MAX_BYTES,
      2048,
    )
    if (
      imageBytes.readUInt32BE(16) !== image.width ||
      imageBytes.readUInt32BE(20) !== image.height ||
      imageBytes[25] !== 6
    ) {
      refuse()
    }
    const expectedAlpha = decodeDerivedProjectMaskPng(maskBytes, finalMask)
    const actualAlpha = decodeTargetPngAlpha(imageBytes, image.width, image.height)
    if (!actualAlpha.equals(expectedAlpha)) {
      refuse()
    }
    const draft = context.generationDraft
    const prompts = payload.item.item.prompts
    const commonConfiguration = {
      loras: structuredClone(draft.loras),
      mode: payload.mode,
      model: structuredClone(draft.model),
    }
    const sampling = {
      actualSeed: candidate.actualSeed,
      ...(payload.mode !== 'txt2img'
        ? { denoisingStrength: draft.sampling.denoisingStrength }
        : {}),
      requestedSeedPolicy: draft.seed.policy,
      // The private concrete-item payload does not freeze the actual batch planner behavior.
    }
    const generationConfiguration =
      payload.item.family === 'anima'
        ? {
            ...commonConfiguration,
            anima: {
              architecture: payload.item.inference.model.architecture,
              checkpointByteSize: payload.item.inference.model.checkpoint.byteSize,
              qwen3Encoder: {
                byteSize: payload.item.inference.model.qwen3Encoder.byteSize,
                sha256: payload.item.inference.model.qwen3Encoder.sha256,
              },
              vae: {
                byteSize: payload.item.inference.model.vae.byteSize,
                sha256: payload.item.inference.model.vae.sha256,
              },
            },
            cfgRescale: 0,
            negativePrompt: { embeddingRefs: [], text: prompts.negative },
            positivePrompt: { embeddingRefs: [], text: prompts.positive },
            sampling: {
              ...sampling,
              animaMethod: payload.item.inference.sampling.scheduler,
              cfgScale: payload.item.inference.sampling.guidanceScale,
              steps: payload.item.inference.sampling.steps,
            },
            vaePrecision: 'Auto',
          }
        : {
            ...commonConfiguration,
            cfgRescale: payload.item.inference.sampling.cfgRescale,
            model: {
              ...draft.model,
              predictionType: payload.item.inference.checkpoint.predictionType,
            },
            negativePrompt: {
              embeddingRefs: activePromptEmbeddingRefs(
                prompts.negative,
                draft.negativePrompt.embeddingRefs,
              ),
              text: prompts.negative,
            },
            positivePrompt: {
              embeddingRefs: activePromptEmbeddingRefs(
                prompts.positive,
                draft.positivePrompt.embeddingRefs,
              ),
              text: prompts.positive,
            },
            sampling: {
              ...sampling,
              cfgScale: payload.item.inference.sampling.cfgScale,
              invokeScheduler: payload.item.inference.sampling.scheduler,
              ...(payload.item.inference.sampling.noiseProfile
                ? { noiseProfile: structuredClone(payload.item.inference.sampling.noiseProfile) }
                : {}),
              sampler: draft.sampling.sampler,
              scheduler: draft.sampling.scheduler,
              steps: payload.item.inference.sampling.steps,
            },
            vae: structuredClone(draft.vae),
            vaePrecision: payload.item.inference.vaePrecision ?? 'Auto',
          }
    return parseSmartPatchVariantV1({
      asset: {
        bytes: image.byteSize,
        height: image.height,
        path: `assets/layers/${variantId}.png`,
        sha256: image.sha256,
        width: image.width,
      },
      bbox: { ...candidate.bbox },
      generationProvenance: {
        executionResultContext: {
          acceptedAt,
          candidateId: candidate.candidateId,
          completedAt: candidate.completedAt,
          output: {
            ...image,
            colorSpace: 'srgb',
            contributionAlpha8: {
              byteSize: actualAlpha.length,
              height: image.height,
              sha256: digest(actualAlpha),
              width: image.width,
            },
            format: 'png',
            outputMode: 'contribution',
          },
          queueItemId: candidate.queueItemId,
        },
        generationConfiguration,
        kind: payload.kind,
        layerSourceContext: {
          bbox: { ...context.bbox },
          coherenceSettings: structuredClone(context.coherenceSettings),
          generationDraft: structuredClone(draft),
          internalResolution: { ...context.internalResolution },
          layerId: context.layerId,
          mask: structuredClone(context.mask),
          maskBlur: context.maskSettings.blur,
          preparedInputs: {
            finalContributionMask: { ...finalMask },
            latentKeepMask: { ...files['latent-keep-mask.png'] },
            modelSource: files['model-source.png'] ? { ...files['model-source.png'] } : null,
          },
          sourceDocumentId: context.documentId,
          sourceDocumentRevision: context.documentRevision,
          sourceLayerIds: [...context.sourceLayerIds],
          sourceTarget: { ...files['source.png'] },
        },
        schemaVersion: 1,
      },
      id: variantId,
      name: `Generated ${candidate.completionOrder}`,
    })
  } catch (error) {
    if (error instanceof SmartPatchVariantProjectionError) {
      throw error
    }
    return refuse()
  }
}
