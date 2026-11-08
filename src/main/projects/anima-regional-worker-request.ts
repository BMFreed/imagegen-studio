import { ANIMA_PROMPT_INTERPRETATION } from '../../shared/projects/anima-prompt-weighting.js'
import {
  type AnimaWorkerRequest,
  captureCompiledAnimaWorkerRequest,
} from '../../shared/projects/anima-worker-request.js'

import { lstat, realpath } from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'

import type { CurrentCanvasRegionalRecipe } from './project-current-canvas-regional-recipe.js'

import {
  captureInferenceWorkerOwnerValue,
  type InferenceWorkerOwner,
} from './inference-worker-ownership.js'
import {
  compileCurrentCanvasAnimaRegionalPrompts,
  type CompiledCurrentCanvasAnimaRegionalPrompt,
} from './project-current-canvas-anima-regional-input.js'
import {
  canonicalRegionalDirectory,
  prepareOwnedRegionalWorkerRequest,
  type RegionalWorkerLease,
  withinRegionalPath,
} from './regional-worker-request.js'
import { classifyTargetPngAlpha } from './target-png-mode.js'
import { ProjectWorkerError, readSmartPatchPreparationOutput } from './worker-client.js'

export type { CompiledCurrentCanvasAnimaRegionalPrompt } from './project-current-canvas-anima-regional-input.js'
export const ANIMA_REGIONAL_COMPOSITION_PROFILE = 'invoke-krea2-global-support-v1' as const
export interface AnimaRegionalWorkerInput {
  compiledPrompts: CompiledCurrentCanvasAnimaRegionalPrompt[]
  compositionProfile: typeof ANIMA_REGIONAL_COMPOSITION_PROFILE
  promptInterpretation: typeof ANIMA_PROMPT_INTERPRETATION
  recipe: CurrentCanvasRegionalRecipe
  request: AnimaWorkerRequest
}

// This is a syntax-validation profile only. Admission and dispatch independently qualify the
// actual peer. The ordinary assembler remains the single owner of request/flow-plan validation.
const VALIDATION_PROFILE = {
  capabilities: [
    'illustrious-txt2img',
    'denoising-progress',
    'candidate-thumbnails',
    'illustrious-cfg-rescale',
    'illustrious-img2img',
    'illustrious-lora',
    'illustrious-vae-precision',
    'illustrious-external-vae',
    'illustrious-embeddings',
    'anima-txt2img',
    'anima-img2img',
    'anima-lora',
    'anima-prompt-weighting',
    'anima-flow-sampling',
  ],
  protocolVersion: '1',
  runtimeProfile: 'linux-nvidia',
  workerVersion: '0.11.0',
}

/** Detach Main's complete recipe, then check exact compiled/source/ordinary-command agreement. */
export function captureAnimaRegionalWorkerInput(
  input: AnimaRegionalWorkerInput,
): AnimaRegionalWorkerInput {
  try {
    const captured = structuredClone(input)
    if (
      !captured ||
      Object.keys(captured).sort().join(',') !==
        'compiledPrompts,compositionProfile,promptInterpretation,recipe,request' ||
      captured.compositionProfile !== ANIMA_REGIONAL_COMPOSITION_PROFILE ||
      captured.promptInterpretation !== ANIMA_PROMPT_INTERPRETATION
    ) {
      invalid()
    }
    const request = captureCompiledAnimaWorkerRequest(captured.request, VALIDATION_PROFILE)
    const { recipe } = captured
    const compiled = compileCurrentCanvasAnimaRegionalPrompts(recipe)
    if (
      request.type !== 'generate-anima-txt2img' ||
      request.job.loras.length !== 0 ||
      request.job.bbox.width > 512 ||
      request.job.bbox.height > 512 ||
      !isDeepStrictEqual(recipe.bbox, request.job.bbox) ||
      recipe.item.seed !== request.job.sampling.seed ||
      recipe.item.iteration !== 0 ||
      recipe.item.promptPairIndex !== 0 ||
      recipe.regions.length < 1 ||
      recipe.regions.some((region) => region.positive === null || region.positive.text === '') ||
      !isDeepStrictEqual(compiled, captured.compiledPrompts) ||
      !isDeepStrictEqual(request.job.prompts, {
        negative: compiled[1].prompt,
        positive: compiled[0].prompt,
      })
    ) {
      invalid()
    }
    return { ...captured, request: structuredClone(request) }
  } catch (error) {
    if (error instanceof ProjectWorkerError) {
      throw error
    }
    invalid()
  }
}

/** Invoke ae06c1bd per-source conditioning adapted through the existing owned lease. */
export async function prepareAnimaRegionalWorkerRequest(
  input: AnimaRegionalWorkerInput,
  scratchBasePath: string,
  owner?: InferenceWorkerOwner,
): Promise<RegionalWorkerLease<AnimaWorkerRequest>> {
  const captured = captureAnimaRegionalWorkerInput(input)
  const capturedOwner = owner === undefined ? undefined : captureInferenceWorkerOwnerValue(owner)
  const baseIdentity = await canonicalRegionalDirectory(scratchBasePath)
  for (const resource of [
    captured.request.job.model.checkpoint,
    captured.request.job.model.qwen3Encoder,
    captured.request.job.model.vae,
  ]) {
    if (withinRegionalPath(scratchBasePath, resource.path) || resource.path === scratchBasePath) {
      invalid()
    }
    const entry = await lstat(resource.path, { bigint: true })
    if (
      !entry.isFile() ||
      entry.isSymbolicLink() ||
      entry.size !== BigInt(resource.byteSize) ||
      (await realpath(resource.path)) !== resource.path
    ) {
      invalid()
    }
  }
  const target = captured.request.job.target
  const targetBytes = await readSmartPatchPreparationOutput(
    target.path,
    { ...target, colorSpace: 'srgb' },
    'source',
  )
  if (classifyTargetPngAlpha(targetBytes, target.width, target.height) !== 'txt2img') {
    invalid()
  }
  return await prepareOwnedRegionalWorkerRequest({
    base: scratchBasePath,
    baseIdentity,
    materialize: async (request, alpha) => ({
      compiledPrompts: captured.compiledPrompts,
      compositionProfile: captured.compositionProfile,
      promptInterpretation: captured.promptInterpretation,
      recipe: {
        ...captured.recipe,
        regions: await Promise.all(
          captured.recipe.regions.map(async (region, index) => ({
            ...region,
            coverage: {
              ...region.coverage,
              alpha: await alpha(region.coverage.alpha, `region-${index}.alpha8`),
            },
          })),
        ),
      },
      request,
      schemaVersion: 1,
    }),
    owner: capturedOwner,
    request: captured.request,
    targetBytes,
    type: 'execute-current-canvas-anima-regional',
  })
}
function invalid(): never {
  throw new ProjectWorkerError(
    'INVALID_REQUEST',
    'The frozen Anima regional input is invalid or unsupported.',
  )
}
