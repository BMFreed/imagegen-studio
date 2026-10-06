import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import {
  type IgsRasterGenerationProvenanceV1,
  parseRasterGenerationProvenanceV1,
} from '../../shared/projects/project-schema.js'

import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'

import type { VerifiedGenerationCandidate } from './generation-staging.js'

import {
  GenerationStagingError,
  parseFrozenGenerationCandidatePayloadV1,
} from './generation-staging.js'
import { localProjectRecoveryKey } from './project-identity.js'

export class ProjectGenerationProvenanceError extends Error {
  constructor(
    readonly code:
      | 'PROVENANCE_INPUT_INVALID'
      | 'PROVENANCE_MODEL_UNSUPPORTED'
      | 'PROVENANCE_OUTPUT_CHANGED'
      | 'PROVENANCE_SOURCE_CHANGED',
    message: string,
  ) {
    super(message)
    this.name = 'ProjectGenerationProvenanceError'
  }
}

/**
 * Derive portable provenance only at acceptance. The candidate's operational payload is parsed
 * through staging's strict schema; no managed model, scratch or output file path is projected.
 * `imagePngBytes` must come from staging's verified candidate read, not a renderer-supplied file.
 */
export function provenanceFromVerifiedRasterCandidate(input: {
  acceptedAt: string
  candidate: VerifiedGenerationCandidate
  imagePngBytes: Buffer
}): IgsRasterGenerationProvenanceV1 {
  const { candidate, imagePngBytes } = input
  if (!Buffer.isBuffer(imagePngBytes)) {
    throw new ProjectGenerationProvenanceError(
      'PROVENANCE_OUTPUT_CHANGED',
      'The accepted candidate image is unavailable.',
    )
  }
  if (
    createHash('sha256').update(candidate.frozenPayloadJson).digest('hex') !==
    candidate.frozenPayloadSha256
  ) {
    throw new ProjectGenerationProvenanceError(
      'PROVENANCE_INPUT_INVALID',
      'The frozen generation context changed.',
    )
  }
  let payload: ReturnType<typeof parseFrozenGenerationCandidatePayloadV1>
  try {
    payload = parseFrozenGenerationCandidatePayloadV1(candidate.frozenPayloadJson)
  } catch (error) {
    if (error instanceof GenerationStagingError && error.code === 'STAGING_OUTPAINT_UNAVAILABLE') {
      throw new ProjectGenerationProvenanceError(
        'PROVENANCE_MODEL_UNSUPPORTED',
        'Normal outpaint accepted RGBA provenance is not integrated yet.',
      )
    }
    throw new ProjectGenerationProvenanceError(
      'PROVENANCE_INPUT_INVALID',
      'The frozen generation context is invalid.',
    )
  }
  const { context } = payload
  let sourceKey: string
  try {
    sourceKey = localProjectRecoveryKey(candidate.projectPath)
  } catch {
    throw new ProjectGenerationProvenanceError(
      'PROVENANCE_SOURCE_CHANGED',
      'The candidate Project identity is invalid.',
    )
  }
  if (
    candidate.candidateId !== candidate.queueItemId ||
    candidate.localProjectKey !== sourceKey ||
    candidate.documentId !== context.documentId ||
    candidate.documentRevision !== context.documentRevision ||
    !isDeepStrictEqual(candidate.bbox, context.bbox)
  ) {
    throw new ProjectGenerationProvenanceError(
      'PROVENANCE_SOURCE_CHANGED',
      'The candidate no longer matches its frozen Project source.',
    )
  }
  // Staging verifies this reported seed against its durable completion receipt. It may
  // legitimately differ from the planned seed in the frozen request.
  if (
    !Number.isSafeInteger(candidate.actualSeed) ||
    candidate.actualSeed < 0 ||
    candidate.actualSeed > 0xff_ff_ff_ff
  ) {
    throw new ProjectGenerationProvenanceError(
      'PROVENANCE_INPUT_INVALID',
      'The reported worker seed is invalid.',
    )
  }
  if (
    candidate.image.byteSize !== imagePngBytes.length ||
    candidate.image.sha256 !== createHash('sha256').update(imagePngBytes).digest('hex') ||
    candidate.image.iccSha256 !== IGS_SRGB_ICC_SHA256 ||
    candidate.image.width !== context.bbox.width ||
    candidate.image.height !== context.bbox.height
  ) {
    throw new ProjectGenerationProvenanceError(
      'PROVENANCE_OUTPUT_CHANGED',
      'The candidate output no longer matches its verified image.',
    )
  }

  try {
    const common = {
      executionResultContext: {
        acceptedAt: input.acceptedAt,
        candidateId: candidate.candidateId,
        completedAt: candidate.completedAt,
        output: {
          byteSize: candidate.image.byteSize,
          colorSpace: 'srgb',
          format: 'png',
          height: candidate.image.height,
          iccSha256: candidate.image.iccSha256,
          sha256: candidate.image.sha256,
          width: candidate.image.width,
        },
        queueItemId: candidate.queueItemId,
      },
      layerSourceContext: {
        bbox: { ...candidate.bbox },
        sourceDocumentId: candidate.documentId,
        sourceDocumentRevision: candidate.documentRevision,
        sourceTargetSha256: payload.context.target.sha256,
      },
      schemaVersion: 1,
    }
    if (payload.kind === 'anima-txt2img' || payload.kind === 'anima-img2img') {
      const context = payload.context
      const component = (snapshot: {
        byteSize: number
        localModelId: string
        localVersionId: string
        sha256: string
      }) => ({
        byteSize: snapshot.byteSize,
        localModelId: snapshot.localModelId,
        localVersionId: snapshot.localVersionId,
        sha256: snapshot.sha256,
      })
      return parseRasterGenerationProvenanceV1({
        ...common,
        generationConfiguration: {
          anima: {
            architecture: context.model.architecture,
            checkpointByteSize: context.model.checkpoint.byteSize,
            qwen3Encoder: component(context.model.qwen3Encoder),
            vae: component(context.model.vae),
          },
          ...(context.cfgRescale !== undefined ? { cfgRescale: context.cfgRescale } : {}),
          ...(context.vaePrecision !== undefined ? { vaePrecision: context.vaePrecision } : {}),
          loras: structuredClone(context.loraStack),
          mode: payload.kind === 'anima-img2img' ? 'img2img' : 'txt2img',
          model: { ...context.model.checkpoint.reference },
          negativePrompt: { embeddingRefs: [], text: context.prompts.negative },
          positivePrompt: { embeddingRefs: [], text: context.prompts.positive },
          sampling: {
            ...(context.kind === 'anima-img2img-preparation'
              ? { denoisingStrength: context.sampling.denoisingStrength }
              : {}),
            actualSeed: candidate.actualSeed,
            animaMethod: context.sampling.animaMethod,
            cfgScale: context.sampling.cfgScale,
            requestedSeedPolicy: context.sampling.requestedSeedPolicy,
            seedBehavior: context.sampling.seedBehavior,
            steps: context.sampling.steps,
          },
          size: { height: context.bbox.height, width: context.bbox.width },
        },
        kind: payload.kind,
      })
    }
    const context = payload.context
    return parseRasterGenerationProvenanceV1({
      ...common,
      generationConfiguration: {
        ...(context.vae !== undefined
          ? { vae: context.vae === null ? null : { ...context.vae.reference } }
          : {}),
        ...(context.vaePrecision !== undefined ? { vaePrecision: context.vaePrecision } : {}),
        ...(context.loraStack !== undefined ? { loras: structuredClone(context.loraStack) } : {}),
        ...(context.sampling.cfgRescale !== undefined
          ? { cfgRescale: context.sampling.cfgRescale }
          : {}),
        mode: context.kind === 'normal-img2img-preparation' ? 'img2img' : 'txt2img',
        model: { ...context.model.reference },
        negativePrompt: {
          embeddingRefs: (context.embeddings?.negative ?? []).map(({ reference, token }) => ({
            resource: structuredClone(reference),
            token,
          })),
          text: context.prompts.negative,
        },
        positivePrompt: {
          embeddingRefs: (context.embeddings?.positive ?? []).map(({ reference, token }) => ({
            resource: structuredClone(reference),
            token,
          })),
          text: context.prompts.positive,
        },
        sampling: {
          ...(context.kind === 'normal-img2img-preparation'
            ? { denoisingStrength: context.sampling.denoisingStrength }
            : {}),
          actualSeed: candidate.actualSeed,
          cfgScale: context.sampling.cfgScale,
          invokeScheduler: context.sampling.invokeScheduler,
          requestedSeedPolicy: context.sampling.requestedSeedPolicy,
          ...(context.sampling.seedBehavior ? { seedBehavior: context.sampling.seedBehavior } : {}),
          sampler: context.sampling.sampler,
          scheduler: context.sampling.scheduler,
          steps: context.sampling.steps,
        },
        size: { height: context.bbox.height, width: context.bbox.width },
      },
      kind:
        context.kind === 'normal-img2img-preparation'
          ? 'illustrious-img2img'
          : 'illustrious-txt2img',
    })
  } catch {
    throw new ProjectGenerationProvenanceError(
      'PROVENANCE_INPUT_INVALID',
      'The candidate cannot form a valid accepted provenance record.',
    )
  }
}
