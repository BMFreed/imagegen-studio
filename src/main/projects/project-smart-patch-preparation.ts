import { LAMA_OUTPAINT_IDENTITY_V1 } from '../../shared/projects/alpha-outpaint.js'
import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'

import path from 'node:path'

import type { OutpaintInfillResolver } from '../runtime/inference-auxiliary-resources.js'
import type { FrozenGenerationTarget } from './project-generation-target.js'
import type {
  FrozenSmartPatchGenerationContext,
  FrozenSmartPatchGenerationInput,
} from './project-smart-patch-generation-input.js'
import type {
  ProjectWorkerClient,
  SmartPatchCoherenceParameters,
  SmartPatchConditioningInput,
  SmartPatchFadeInput,
  SmartPatchFadeMode,
  SmartPatchModelSourceInput,
  SmartPatchPreparationInput,
  VerifiedWorkerMask,
} from './worker-client.js'

import { decodeDerivedProjectMaskPng } from './project-mask.js'
import {
  readSmartPatchModelSourceOutput,
  readSmartPatchPreparationOutput,
} from './worker-client.js'

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

export interface PreparedSmartPatchConditioningInput extends PreparedSmartPatchGenerationInput {
  coherence: SmartPatchCoherenceParameters
  conditioning: {
    expandedProcessingKeepMask: PreparedMaskPlane & { polarity: 'keep' }
    expandedWorldKeepMask: PreparedMaskPlane & { polarity: 'keep' }
    finalContributionMask: PreparedMaskPlane & { polarity: 'generate' }
    latentKeepMask: PreparedMaskPlane & { polarity: 'keep' }
    latentMaskHasCoverage: boolean
    processingKeepMask: PreparedMaskPlane & { polarity: 'keep' }
    worldKeepMask: PreparedMaskPlane & { polarity: 'keep' }
  }
}

export interface PreparedSmartPatchModelSourceInput extends PreparedSmartPatchConditioningInput {
  /** RGB at processing resolution, never a portable target or accepted output. TXT has none. */
  modelSource: FrozenGenerationTarget['composite'] | null
}

/** Only frozen OUT resolves shared infill; source alpha and numerical masks stay independent. */
export async function prepareFrozenSmartPatchModelSource(
  input: PreparedSmartPatchConditioningInput,
  stagingRoot: string,
  worker: Pick<ProjectWorkerClient, 'prepareSmartPatchModelSource'>,
  infillResolver?: OutpaintInfillResolver,
): Promise<PreparedSmartPatchModelSourceInput> {
  if (input.mode === 'txt2img') {
    return { ...input, modelSource: null }
  }
  let infillResource: SmartPatchModelSourceInput['infillResource'] = null
  if (input.mode === 'outpaint') {
    if (!infillResolver) {
      throw new Error('Smart Patch OUT requires the Main-owned LaMa resolver.')
    }
    const resolved = await infillResolver.resolveVerifiedOutpaintInfill()
    infillResource = {
      byteSize: resolved.byteSize,
      path: resolved.managedPath,
      role: resolved.role,
      sha256: resolved.sha256,
    }
    const relative = path.relative(stagingRoot, infillResource.path)
    if (
      infillResource.byteSize !== LAMA_OUTPAINT_IDENTITY_V1.byteSize ||
      infillResource.role !== LAMA_OUTPAINT_IDENTITY_V1.role ||
      infillResource.sha256 !== LAMA_OUTPAINT_IDENTITY_V1.sha256 ||
      !path.isAbsolute(infillResource.path) ||
      path.resolve(infillResource.path) !== infillResource.path ||
      relative === '' ||
      (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
    ) {
      throw new Error('Smart Patch LaMa must be the pinned resource outside disposable staging.')
    }
  }
  const outputPath = path.join(stagingRoot, 'model-source.png')
  const request: SmartPatchModelSourceInput = {
    infillResource,
    mode: input.mode,
    modelSourcePngPath: outputPath,
    source: {
      byteSize: input.processingSource.byteSize,
      height: input.context.internalResolution.height,
      path: path.join(stagingRoot, 'processing-source.png'),
      sha256: input.processingSource.sha256,
      width: input.context.internalResolution.width,
    },
    stagingRoot,
  }
  const result = structuredClone(
    await worker.prepareSmartPatchModelSource(structuredClone(request)),
  )
  const artifact = result.modelSource
  if (
    !artifact ||
    artifact.width !== input.context.internalResolution.width ||
    artifact.height !== input.context.internalResolution.height
  ) {
    throw new Error('Smart Patch model source differs from the frozen processing size.')
  }
  const bytes = await readSmartPatchModelSourceOutput(outputPath, artifact)
  return {
    ...input,
    modelSource: {
      bytes,
      byteSize: bytes.length,
      colorSpace: 'srgb',
      height: artifact.height,
      iccSha256: IGS_SRGB_ICC_SHA256,
      sha256: artifact.sha256,
      width: artifact.width,
    },
  }
}

/** Six detached numerical planes; original authored/source planes remain independently owned. */
export async function prepareFrozenSmartPatchConditioning(
  input: PreparedSmartPatchGenerationInput,
  stagingRoot: string,
  coherence: SmartPatchCoherenceParameters,
  worker: Pick<ProjectWorkerClient, 'conditionSmartPatch'>,
): Promise<PreparedSmartPatchConditioningInput> {
  const request: SmartPatchConditioningInput = {
    coherence: structuredClone(coherence),
    effectiveMask: {
      byteSize: input.effectiveMask.bytes.length,
      height: input.effectiveMask.height,
      path: path.join(stagingRoot, 'world-mask.png'),
      sha256: input.effectiveMask.sha256,
      width: input.effectiveMask.width,
    },
    expandedProcessingKeepMaskPngPath: path.join(stagingRoot, 'expanded-processing-keep-mask.png'),
    expandedWorldKeepMaskPngPath: path.join(stagingRoot, 'expanded-world-keep-mask.png'),
    finalContributionMaskPngPath: path.join(stagingRoot, 'conditioned-world-contribution-mask.png'),
    internalResolution: { ...input.context.internalResolution },
    latentKeepMaskPngPath: path.join(stagingRoot, 'latent-keep-mask.png'),
    maskBlur: input.context.maskSettings.blur,
    mode: input.mode,
    processingKeepMaskPngPath: path.join(stagingRoot, 'processing-keep-mask.png'),
    source: {
      byteSize: input.source.bytes.length,
      height: input.source.height,
      path: path.join(stagingRoot, 'target.png'),
      sha256: input.source.sha256,
      width: input.source.width,
    },
    stagingRoot,
    worldKeepMaskPngPath: path.join(stagingRoot, 'world-keep-mask.png'),
  }
  const result = structuredClone(await worker.conditionSmartPatch(structuredClone(request)))
  const worldKeepMask = await readMask(
    request.worldKeepMaskPngPath,
    result.worldKeepMask,
    input.context.bbox,
  )
  const processingKeepMask = await readMask(
    request.processingKeepMaskPngPath,
    result.processingKeepMask,
    input.context.internalResolution,
  )
  const latentDimensions = {
    height: input.context.internalResolution.height / 8,
    width: input.context.internalResolution.width / 8,
  }
  const latentKeepMask = await readMask(
    request.latentKeepMaskPngPath,
    result.latentKeepMask,
    latentDimensions,
  )
  const expandedProcessingKeepMask = await readMask(
    request.expandedProcessingKeepMaskPngPath,
    result.expandedProcessingKeepMask,
    input.context.internalResolution,
  )
  const expandedWorldKeepMask = await readMask(
    request.expandedWorldKeepMaskPngPath,
    result.expandedWorldKeepMask,
    input.context.bbox,
  )
  const finalContributionMask = await readMask(
    request.finalContributionMaskPngPath,
    result.finalContributionMask,
    input.context.bbox,
  )
  const latentAlpha = decodeDerivedProjectMaskPng(latentKeepMask.bytes, latentDimensions)
  return {
    ...input,
    coherence: structuredClone(request.coherence),
    conditioning: {
      expandedProcessingKeepMask: { ...expandedProcessingKeepMask, polarity: 'keep' },
      expandedWorldKeepMask: { ...expandedWorldKeepMask, polarity: 'keep' },
      finalContributionMask: { ...finalContributionMask, polarity: 'generate' },
      latentKeepMask: { ...latentKeepMask, polarity: 'keep' },
      latentMaskHasCoverage: latentAlpha.some((value) => value < 255),
      processingKeepMask: { ...processingKeepMask, polarity: 'keep' },
      worldKeepMask: { ...worldKeepMask, polarity: 'keep' },
    },
  }
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
