import {
  type AnimaFlowSamplingPlan,
  compileAnimaFlowSamplingPlan,
} from '../../shared/projects/anima-flow-sampling-plan.js'
import {
  compileAnimaPromptWeighting,
  type CompiledAnimaPromptWeighting,
} from '../../shared/projects/anima-prompt-weighting.js'
import {
  planGenerationBatch,
  type PlannedGenerationBatchItem,
} from '../../shared/projects/generation-batch-plan.js'
import { GENERATION_BATCH_JOB_LIMIT } from '../../shared/projects/generation-batch-policy.js'

import {
  assertFrozenAnimaGeneration,
  type FrozenAnimaGenerationPreparationV1,
  type PreparedAnimaGeneration,
} from './anima-generation-preparation.js'

export interface PreparedAnimaGenerationBatchItem extends PlannedGenerationBatchItem {
  readonly compiledPrompts: Readonly<{
    negative: CompiledAnimaPromptWeighting
    positive: CompiledAnimaPromptWeighting
  }>
  readonly samplingPlan: AnimaFlowSamplingPlan
}

/** Ephemeral Main preparation only; no queue, Retry or accepted-result record is implied. */
export interface PreparedAnimaGenerationBatch {
  readonly context: FrozenAnimaGenerationPreparationV1
  readonly items: readonly PreparedAnimaGenerationBatchItem[]
  readonly iterations: number
  readonly targetPngBytes: Buffer
  /** The authored pair-prefix policy truncated prompts; admission never truncates jobs. */
  readonly truncated: boolean
}

export class AnimaGenerationBatchError extends Error {
  readonly code = 'GENERATION_BATCH_INVALID'

  constructor(message: string) {
    super(message)
    this.name = 'AnimaGenerationBatchError'
  }
}

/** The existing images-per-click authoring range, independent of the cap32 admission ceiling. */
export function validateAnimaBatchIterations(iterations: number): void {
  if (!Number.isSafeInteger(iterations) || iterations < 1 || iterations > 100) {
    throw new AnimaGenerationBatchError('Anima batch iterations must be between 1 and 100.')
  }
}

/**
 * Expand one captured Anima target using the real pair-prefix/seed planner and authoritative
 * compilers. No RNG, Project reread, managed-file I/O, worker handoff or durable admission occurs.
 */
export function prepareAnimaGenerationBatch(input: {
  iterations: number
  prepared: PreparedAnimaGeneration
}): PreparedAnimaGenerationBatch {
  validateAnimaBatchIterations(input.iterations)
  if (!Buffer.isBuffer(input.prepared?.targetPngBytes)) {
    throw new AnimaGenerationBatchError('The Anima batch target must be captured PNG bytes.')
  }
  const context = structuredClone(input.prepared.context)
  const targetPngBytes = Buffer.from(input.prepared.targetPngBytes)
  assertFrozenAnimaGeneration(context, targetPngBytes)
  const plan = planGenerationBatch({
    baseSeed: context.sampling.seed,
    iterations: input.iterations,
    maxJobs: GENERATION_BATCH_JOB_LIMIT,
    maxPrompts: context.dynamic.maxPrompts,
    negativePrompt: context.prompts.negative,
    positivePrompt: context.prompts.positive,
    seedBehavior: context.dynamic.seedBehavior,
  })
  const items = plan.items.map((item): PreparedAnimaGenerationBatchItem => {
    const samplingPlan = compileAnimaFlowSamplingPlan({
      guidanceScale: context.sampling.cfgScale,
      height: context.bbox.height,
      mode: context.mode,
      scheduler: context.sampling.animaMethod,
      seed: item.seed,
      steps: context.sampling.steps,
      strength: context.sampling.denoisingStrength,
      width: context.bbox.width,
    })
    return Object.freeze({
      ...item,
      compiledPrompts: Object.freeze({
        negative: compileAnimaPromptWeighting(item.prompts.negative),
        positive: compileAnimaPromptWeighting(item.prompts.positive),
      }),
      samplingPlan,
    })
  })
  return Object.freeze({
    context: freezeContext(context),
    items: Object.freeze(items),
    iterations: input.iterations,
    targetPngBytes,
    truncated: plan.truncated,
  })
}

function freezeContext<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) {
      freezeContext(child)
    }
    Object.freeze(value)
  }
  return value
}
