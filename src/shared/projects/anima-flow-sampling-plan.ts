import { compileAnimaEulerDenoisingPlan } from './anima-euler-plan.js'
import {
  type AnimaSamplingPlan,
  AnimaSamplingPlanError,
  compileAnimaSamplingPlan,
} from './anima-sampling-plan.js'

export type AnimaFlowScheduler = 'dpmpp_2m_sde' | 'dpmpp_2m' | 'er_sde' | 'euler' | 'heun' | 'lcm'

export type AnimaFlowSamplingPlan = AnimaFlowSamplingPlanFields &
  (
    | { readonly mode: 'img2img'; readonly strength: number }
    | { readonly mode: 'txt2img'; readonly strength: null }
  )

interface AnimaFlowSamplingPlanFields extends Omit<
  AnimaSamplingPlan,
  'mode' | 'scheduler' | 'strength' | 'version'
> {
  readonly scheduler: AnimaFlowScheduler
  readonly stepSeed: number
  readonly version: 'anima-flow-denoising-v1'
}

export class AnimaFlowSamplingPlanError extends Error {
  readonly code = 'GENERATION_SAMPLING_UNSUPPORTED'

  constructor(message: string) {
    super(message)
    this.name = 'AnimaFlowSamplingPlanError'
  }
}

const INPUT_FIELDS = [
  'mode',
  'width',
  'height',
  'steps',
  'seed',
  'guidanceScale',
  'strength',
  'scheduler',
]

/**
 * Internal original-Anima flow plans; this does not admit a public job.
 *
 * Existing deterministic plans retain their native grids. DPM++ 2M SDE shares the deterministic DPM
 * grid; ER-SDE and Flow LCM consume an explicit float32 Euler shift-3 grid. Every method clips its
 * full authored-N grid, without rebuilding fewer steps. The worker passes terminal-inclusive sigmas
 * to ER-SDE and excludes terminal zero for LCM. This deliberately corrects Invoke's rebuilt LCM
 * grid and shift-1 default, but does not promise distilled-LCM image quality. stepSeed owns
 * scheduler noise independently of diffusion and VAE-posterior noise streams.
 */
export function compileAnimaFlowSamplingPlan(input: unknown): AnimaFlowSamplingPlan {
  const fields = captureFields(input)
  const scheduler = fields['scheduler']
  if (
    scheduler !== 'euler' &&
    scheduler !== 'heun' &&
    scheduler !== 'dpmpp_2m' &&
    scheduler !== 'dpmpp_2m_sde' &&
    scheduler !== 'er_sde' &&
    scheduler !== 'lcm'
  ) {
    throw new AnimaFlowSamplingPlanError('Anima flow scheduler is unsupported.')
  }
  const deterministicScheduler =
    scheduler === 'dpmpp_2m_sde'
      ? 'dpmpp_2m'
      : scheduler === 'er_sde' || scheduler === 'lcm'
        ? 'euler'
        : scheduler
  let base
  try {
    base = compileAnimaSamplingPlan({ ...fields, scheduler: deterministicScheduler })
  } catch (error) {
    if (error instanceof AnimaSamplingPlanError) {
      throw new AnimaFlowSamplingPlanError(error.message)
    }
    throw error
  }
  const identity = {
    scheduler,
    stepSeed: base.seed,
    version: 'anima-flow-denoising-v1' as const,
  } satisfies Pick<AnimaFlowSamplingPlanFields, 'scheduler' | 'stepSeed' | 'version'>
  if (scheduler !== 'er_sde' && scheduler !== 'lcm') {
    return Object.freeze({ ...base, ...identity })
  }
  const full = compileAnimaEulerDenoisingPlan({
    guidanceScale: base.guidanceScale,
    height: base.height,
    mode: 'txt2img',
    seed: base.seed,
    steps: base.steps,
    strength: null,
    width: base.width,
  }).sigmas.map((sigma) => Math.fround(sigma))
  const sigmas = base.totalSteps === 0 ? [0] : full.slice(base.startStep)
  const timesteps = sigmas.slice(0, -1).map((sigma) => Math.fround(sigma * 1000))
  // A nonempty clipped timestep grid retains its leading sigma and terminal zero.
  const initialSigma =
    timesteps.length === 0 ? 0 : base.mode === 'txt2img' || base.strength === 1 ? 1 : sigmas.at(0)!
  return Object.freeze({
    ...base,
    ...identity,
    beginIndex: base.startStep,
    initialSigma,
    sigmas: Object.freeze(sigmas),
    timesteps: Object.freeze(timesteps),
    totalSteps: timesteps.length,
  })
}

function captureFields(input: unknown): Record<string, unknown> {
  if (
    typeof input !== 'object' ||
    input === null ||
    Array.isArray(input) ||
    (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null)
  ) {
    throw new AnimaFlowSamplingPlanError('Anima flow input must be a plain object.')
  }
  const keys = Reflect.ownKeys(input)
  const descriptors = Object.getOwnPropertyDescriptors(input)
  if (
    keys.length !== INPUT_FIELDS.length ||
    keys.some((key) => typeof key !== 'string' || !INPUT_FIELDS.includes(key))
  ) {
    throw new AnimaFlowSamplingPlanError('Anima flow input fields are unsupported.')
  }
  const captured: Record<string, unknown> = {}
  for (const key of INPUT_FIELDS) {
    const descriptor = descriptors[key]
    if (!descriptor || !('value' in descriptor)) {
      throw new AnimaFlowSamplingPlanError('Anima flow input must contain plain values.')
    }
    captured[key] = descriptor.value
  }
  return captured
}
