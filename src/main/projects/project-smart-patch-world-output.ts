import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import type { IgsRectV1 } from '../../shared/projects/project-schema.js'

import { createHash } from 'node:crypto'
import path from 'node:path'

import type { FrozenGenerationTarget } from './project-generation-target.js'
import type {
  ExecutedSmartPatchGenerationInput,
  SmartPatchExecutionOptions,
} from './project-smart-patch-execution.js'
import type {
  ProjectWorkerClient,
  SmartPatchOutputCompositionInput,
  VerifiedWorkerImage,
} from './worker-client.js'

import { captureSmartPatchExecutionOptions } from './project-smart-patch-execution.js'
import {
  assertSmartPatchConditioningSize,
  assertSmartPatchProcessingSize,
  ProjectWorkerError,
  readSmartPatchModelSourceOutput,
  readSmartPatchPreparationOutput,
  readSmartPatchWorldOutput,
} from './worker-client.js'

export interface SmartPatchWorldExecutionOptions extends SmartPatchExecutionOptions {
  outputWorker: Pick<ProjectWorkerClient, 'composeSmartPatchOutput'>
}

export interface ComposedSmartPatchGenerationInput extends ExecutedSmartPatchGenerationInput {
  /** Detached bbox-size RGBA contribution; world placement remains the frozen context.bbox. */
  worldContribution: FrozenGenerationTarget['composite']
}

export interface SmartPatchWorldContributionInput {
  bbox: IgsRectV1
  contributionMaskPath: string
  finalContribution: { bytes: Buffer; height: number; sha256: string; width: number }
  image: VerifiedWorkerImage
  internalResolution: { height: number; width: number }
  outputPngPath: string
  outputWorker: Pick<ProjectWorkerClient, 'composeSmartPatchOutput'>
  stagingRoot: string
}

/** Capture every collaborator before preparation or model admission can yield. */
export function captureSmartPatchWorldExecutionOptions(
  input: SmartPatchWorldExecutionOptions,
): SmartPatchWorldExecutionOptions {
  return {
    ...captureSmartPatchExecutionOptions(input),
    outputWorker: {
      composeSmartPatchOutput: input.outputWorker.composeSmartPatchOutput.bind(input.outputWorker),
    },
  }
}

/** Called only as the final step of the same registered execution/preparation lease. */
export async function composeExecutedSmartPatchOutput(input: {
  executed: ExecutedSmartPatchGenerationInput
  outputWorker: SmartPatchWorldExecutionOptions['outputWorker']
  stagingRoot: string
}): Promise<ComposedSmartPatchGenerationInput> {
  const { executed, stagingRoot } = input
  const worldContribution = await composeSmartPatchWorldContribution({
    bbox: executed.context.bbox,
    contributionMaskPath: path.join(stagingRoot, 'conditioned-world-contribution-mask.png'),
    finalContribution: executed.conditioning.finalContributionMask,
    image: { ...executed.output, path: path.join(stagingRoot, 'model-result.png') },
    internalResolution: executed.context.internalResolution,
    outputPngPath: path.join(stagingRoot, 'world-result.png'),
    outputWorker: input.outputWorker,
    stagingRoot,
  })
  return { ...executed, worldContribution }
}

/**
 * Compose only processing RGB and already-final world alpha. Callers own admitted work, scratch,
 * startup, cancellation and physical worker exit; this boundary does not fabricate Prepared data.
 */
export async function composeSmartPatchWorldContribution(
  input: SmartPatchWorldContributionInput,
): Promise<FrozenGenerationTarget['composite']> {
  const bbox = { ...input.bbox }
  const internalResolution = { ...input.internalResolution }
  const image = { ...input.image }
  const expectedContribution = {
    bytes: Buffer.from(input.finalContribution.bytes),
    height: input.finalContribution.height,
    sha256: input.finalContribution.sha256,
    width: input.finalContribution.width,
  }
  const contributionMaskPath = input.contributionMaskPath
  const outputPngPath = input.outputPngPath
  const stagingRoot = input.stagingRoot
  const compose = input.outputWorker.composeSmartPatchOutput.bind(input.outputWorker)
  assertSmartPatchProcessingSize(bbox)
  assertSmartPatchConditioningSize(internalResolution)
  if (
    image.width !== internalResolution.width ||
    image.height !== internalResolution.height ||
    expectedContribution.width !== bbox.width ||
    expectedContribution.height !== bbox.height ||
    createHash('sha256').update(expectedContribution.bytes).digest('hex') !==
      expectedContribution.sha256
  ) {
    throw new ProjectWorkerError(
      'OUTPUT_MISMATCH',
      'Smart Patch processing RGB or final contribution differs from its frozen geometry or identity.',
    )
  }
  const nominatedPaths = [image.path, contributionMaskPath, outputPngPath]
  if (
    !path.isAbsolute(stagingRoot) ||
    path.resolve(stagingRoot) !== stagingRoot ||
    new Set(nominatedPaths).size !== nominatedPaths.length ||
    nominatedPaths.some(
      (candidate) => path.dirname(candidate) !== stagingRoot || path.extname(candidate) !== '.png',
    )
  ) {
    throw new ProjectWorkerError(
      'INVALID_PATH',
      'Smart Patch world composition needs distinct nominated stage PNGs.',
    )
  }
  const request: SmartPatchOutputCompositionInput = {
    contributionMask: {
      byteSize: expectedContribution.bytes.length,
      height: expectedContribution.height,
      path: contributionMaskPath,
      sha256: expectedContribution.sha256,
      width: expectedContribution.width,
    },
    image: {
      byteSize: image.byteSize,
      height: image.height,
      path: image.path,
      sha256: image.sha256,
      width: image.width,
    },
    pngPath: outputPngPath,
    stagingRoot,
  }
  await readSmartPatchModelSourceOutput(image.path, image)
  const actualContribution = await readSmartPatchPreparationOutput(
    request.contributionMask.path,
    request.contributionMask,
    'mask',
  )
  if (!actualContribution.equals(expectedContribution.bytes)) {
    throw new ProjectWorkerError(
      'OUTPUT_MISMATCH',
      'The staged Smart Patch contribution differs from its frozen bytes.',
    )
  }
  const result = structuredClone(await compose(structuredClone(request)))
  // Adapters cannot substitute plausible metadata or a valid PNG with unrelated contribution alpha.
  // The expected alpha comes from the privately captured world plane, never the worker response.
  const bytes = await readSmartPatchWorldOutput(
    request.pngPath,
    result.output,
    expectedContribution,
  )
  return {
    bytes,
    byteSize: bytes.length,
    colorSpace: 'srgb',
    height: bbox.height,
    iccSha256: IGS_SRGB_ICC_SHA256,
    sha256: result.output.sha256,
    width: bbox.width,
  }
}
