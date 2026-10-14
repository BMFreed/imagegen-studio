import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'

import path from 'node:path'

import type { FrozenGenerationTarget } from './project-generation-target.js'
import type {
  FrozenSmartPatchGenerationContext,
  FrozenSmartPatchGenerationInput,
} from './project-smart-patch-generation-input.js'
import type {
  ProjectWorkerClient,
  SmartPatchFadeInput,
  SmartPatchFadeMode,
  SmartPatchPreparationInput,
  VerifiedWorkerMask,
} from './worker-client.js'

import { decodeDerivedProjectMaskPng } from './project-mask.js'
import { readSmartPatchPreparationOutput } from './worker-client.js'

export type SmartPatchGenerationMode = SmartPatchFadeMode

export interface PreparedSmartPatchGenerationInput extends FrozenSmartPatchGenerationInput {
  effectiveMask: PreparedMaskPlane
  mode: SmartPatchGenerationMode
  processingMask: PreparedMaskPlane
  /** Internal resampling can remove tiny coverage; it does not redefine the world mode. */
  processingMaskHasCoverage: boolean
  processingSource: FrozenGenerationTarget['composite']
}

export interface PreparedMaskPlane {
  bytes: Buffer
  height: number
  sha256: string
  width: number
}

/** Pre-coherence world contribution geometry, not final masked inference conditioning. */
export interface PreparedSmartPatchContributionInput extends PreparedSmartPatchGenerationInput {
  contributionMask: PreparedMaskPlane
}

export async function prepareFrozenSmartPatchContribution(
  input: PreparedSmartPatchGenerationInput,
  stagingRoot: string,
  worker: Pick<ProjectWorkerClient, 'fadeSmartPatch'>,
): Promise<PreparedSmartPatchContributionInput> {
  const request: SmartPatchFadeInput = {
    contributionMaskPngPath: path.join(stagingRoot, 'world-contribution-mask.png'),
    effectiveMask: {
      byteSize: input.effectiveMask.bytes.length,
      height: input.effectiveMask.height,
      path: path.join(stagingRoot, 'world-mask.png'),
      sha256: input.effectiveMask.sha256,
      width: input.effectiveMask.width,
    },
    maskBlur: input.context.maskSettings.blur,
    mode: input.mode,
    source: {
      byteSize: input.source.bytes.length,
      height: input.source.height,
      path: path.join(stagingRoot, 'target.png'),
      sha256: input.source.sha256,
      width: input.source.width,
    },
    stagingRoot,
  }
  const result = structuredClone(await worker.fadeSmartPatch(structuredClone(request)))
  const contributionMask = await readMask(
    request.contributionMaskPngPath,
    result.contributionMask,
    input.context.bbox,
  )
  return { ...input, contributionMask }
}

/** Private processing files are detached caller outputs, never document mask replacements. */
export async function prepareFrozenSmartPatchInput(
  input: {
    context: FrozenSmartPatchGenerationContext
    maskPngBytes: Buffer | null
    maskPngPath: string | null
    source: FrozenGenerationTarget['composite']
    sourceAlpha: FrozenSmartPatchGenerationInput['sourceAlpha']
    stagingRoot: string
  },
  worker: Pick<ProjectWorkerClient, 'prepareSmartPatch'>,
): Promise<PreparedSmartPatchGenerationInput> {
  const { context, source, stagingRoot } = input
  const asset = context.mask.asset
  if (asset && (!input.maskPngPath || !input.maskPngBytes || !context.mask.bounds)) {
    throw new Error('The frozen owned mask is missing its verified material.')
  }
  const request: SmartPatchPreparationInput = {
    bbox: { ...context.bbox },
    internalResolution: { ...context.internalResolution },
    mask:
      asset && input.maskPngPath && context.mask.bounds
        ? {
            bounds: { ...context.mask.bounds },
            byteSize: asset.bytes,
            height: asset.height,
            path: input.maskPngPath,
            sha256: asset.sha256,
            width: asset.width,
          }
        : null,
    processingMaskPngPath: path.join(stagingRoot, 'processing-mask.png'),
    processingSourcePngPath: path.join(stagingRoot, 'processing-source.png'),
    source: {
      byteSize: source.bytes.length,
      height: source.height,
      path: path.join(stagingRoot, 'target.png'),
      sha256: source.sha256,
      width: source.width,
    },
    stagingRoot,
    worldMaskPngPath: path.join(stagingRoot, 'world-mask.png'),
  }
  const result = structuredClone(await worker.prepareSmartPatch(structuredClone(request)))
  const effectiveMask = await readMask(request.worldMaskPngPath, result.worldMask, context.bbox)
  const processingMask = await readMask(
    request.processingMaskPngPath,
    result.processingMask,
    context.internalResolution,
  )
  if (
    result.processingSource.width !== context.internalResolution.width ||
    result.processingSource.height !== context.internalResolution.height
  ) {
    throw new Error(
      'Smart Patch processing source dimensions differ from its frozen internal size.',
    )
  }
  const processingSourceBytes = await readSmartPatchPreparationOutput(
    request.processingSourcePngPath,
    result.processingSource,
    'source',
  )
  const worldAlpha = decodeDerivedProjectMaskPng(effectiveMask.bytes, effectiveMask)
  const processingAlpha = decodeDerivedProjectMaskPng(processingMask.bytes, processingMask)
  const hasEffectiveCoverage = worldAlpha.some((value) => value > 0)
  const mode: SmartPatchGenerationMode =
    input.sourceAlpha === 'transparent'
      ? 'txt2img'
      : input.sourceAlpha === 'mixed'
        ? 'outpaint'
        : hasEffectiveCoverage
          ? 'inpaint'
          : 'img2img'
  return {
    context: structuredClone(context),
    effectiveMask,
    maskPngBytes: input.maskPngBytes ? Buffer.from(input.maskPngBytes) : null,
    mode,
    processingMask,
    processingMaskHasCoverage: processingAlpha.some((value) => value > 0),
    processingSource: {
      bytes: processingSourceBytes,
      byteSize: processingSourceBytes.length,
      colorSpace: 'srgb',
      height: result.processingSource.height,
      iccSha256: IGS_SRGB_ICC_SHA256,
      sha256: result.processingSource.sha256,
      width: result.processingSource.width,
    },
    source,
    sourceAlpha: input.sourceAlpha,
  }
}

async function readMask(
  expectedPath: string,
  artifact: VerifiedWorkerMask,
  dimensions: { height: number; width: number },
): Promise<PreparedMaskPlane> {
  if (artifact.width !== dimensions.width || artifact.height !== dimensions.height) {
    throw new Error('Smart Patch numeric mask dimensions differ from its frozen plane.')
  }
  return {
    bytes: await readSmartPatchPreparationOutput(expectedPath, artifact, 'mask'),
    height: artifact.height,
    sha256: artifact.sha256,
    width: artifact.width,
  }
}
