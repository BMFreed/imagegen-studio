import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'

import path from 'node:path'

import type { FrozenGenerationTarget } from './project-generation-target.js'
import type {
  ExecutedSmartPatchGenerationInput,
  SmartPatchExecutionOptions,
} from './project-smart-patch-execution.js'
import type { ProjectWorkerClient, SmartPatchOutputCompositionInput } from './worker-client.js'

import { captureSmartPatchExecutionOptions } from './project-smart-patch-execution.js'
import {
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
  const compose = input.outputWorker.composeSmartPatchOutput.bind(input.outputWorker)
  const bbox = { ...executed.context.bbox }
  const finalContribution = executed.conditioning.finalContributionMask
  const expectedContribution = {
    ...finalContribution,
    bytes: Buffer.from(finalContribution.bytes),
  }
  if (finalContribution.width !== bbox.width || finalContribution.height !== bbox.height) {
    throw new ProjectWorkerError(
      'OUTPUT_MISMATCH',
      'The frozen world contribution differs from its bbox.',
    )
  }
  const request: SmartPatchOutputCompositionInput = {
    contributionMask: {
      byteSize: expectedContribution.bytes.length,
      height: expectedContribution.height,
      path: path.join(stagingRoot, 'conditioned-world-contribution-mask.png'),
      sha256: expectedContribution.sha256,
      width: expectedContribution.width,
    },
    image: {
      byteSize: executed.output.byteSize,
      height: executed.output.height,
      path: path.join(stagingRoot, 'model-result.png'),
      sha256: executed.output.sha256,
      width: executed.output.width,
    },
    pngPath: path.join(stagingRoot, 'world-result.png'),
    stagingRoot,
  }
  await readSmartPatchModelSourceOutput(request.image.path, {
    ...request.image,
    colorSpace: 'srgb',
    iccSha256: IGS_SRGB_ICC_SHA256,
  })
  await readSmartPatchPreparationOutput(
    request.contributionMask.path,
    request.contributionMask,
    'mask',
  )
  const result = structuredClone(await compose(structuredClone(request)))
  // Adapters cannot substitute plausible metadata or a valid PNG with unrelated contribution alpha.
  // The expected alpha comes from the privately captured world plane, never the worker response.
  const bytes = await readSmartPatchWorldOutput(
    request.pngPath,
    result.output,
    expectedContribution,
  )
  return {
    ...executed,
    worldContribution: {
      bytes,
      byteSize: bytes.length,
      colorSpace: 'srgb',
      height: bbox.height,
      iccSha256: IGS_SRGB_ICC_SHA256,
      sha256: result.output.sha256,
      width: bbox.width,
    },
  }
}
