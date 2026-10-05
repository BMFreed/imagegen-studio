import { AnimaEulerDenoisingPlanError, compileAnimaEulerDenoisingPlan } from './anima-euler-plan.js'

export type AnimaDeterministicScheduler = 'dpmpp_2m' | 'euler' | 'heun'

export type AnimaSamplingPlan = AnimaSamplingPlanFields &
  (
    | { readonly mode: 'img2img'; readonly strength: number }
    | { readonly mode: 'txt2img'; readonly strength: null }
  )

interface AnimaSamplingPlanFields {
  readonly beginIndex: number
  readonly guidanceScale: number
  readonly height: number
  readonly initialSigma: number
  readonly posteriorSeed: number | null
  readonly scheduler: AnimaDeterministicScheduler
  readonly seed: number
  readonly sigmas: readonly number[]
  readonly startStep: number
  readonly steps: number
  readonly timesteps: readonly number[]
  readonly totalSteps: number
  readonly version: 'anima-deterministic-denoising-v1'
  readonly width: number
}

export class AnimaSamplingPlanError extends Error {
  readonly code = 'GENERATION_SAMPLING_UNSUPPORTED'

  constructor(message: string) {
    super(message)
    this.name = 'AnimaSamplingPlanError'
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
 * Internal original-Anima deterministic schedules; this does not admit a job.
 *
 * InvokeAI 9e154096 and Diffusers 0.40.0 use distinct Euler, Heun and DPM++ 2M arrays. Native
 * Heun/DPM sigmas are float32; DPM model timesteps truncate the unrounded double schedule. Clipping
 * preserves authored steps and the existing IEEE strength policy; totalSteps counts actual
 * evaluations, including both Heun passes. Interior img2img uses the selected native sigma,
 * correcting Invoke's Euler preblend mismatch. Full strength remains pure seeded noise. The
 * existing Euler compiler owns scalar bounds and the independent CPU posterior seed domain.
 */
export function compileAnimaSamplingPlan(input: unknown): AnimaSamplingPlan {
  const fields = captureFields(input)
  const scheduler = fields.scheduler
  if (scheduler !== 'euler' && scheduler !== 'heun' && scheduler !== 'dpmpp_2m') {
    throw new AnimaSamplingPlanError('Anima deterministic scheduler is unsupported.')
  }
  let base
  try {
    base = compileAnimaEulerDenoisingPlan({
      guidanceScale: fields.guidanceScale,
      height: fields.height,
      mode: fields.mode,
      seed: fields.seed,
      steps: fields.steps,
      strength: fields.strength,
      width: fields.width,
    })
  } catch (error) {
    if (error instanceof AnimaEulerDenoisingPlanError) {
      throw new AnimaSamplingPlanError(error.message)
    }
    throw error
  }
  const beginIndex = scheduler === 'heun' ? 2 * base.startStep : base.startStep
  const full =
    scheduler === 'euler'
      ? {
          sigmas: [...base.sigmas],
          timesteps: base.sigmas.slice(0, -1).map((sigma) => sigma * 1000),
        }
      : nativeSchedule(scheduler, base.steps)
  // Euler is already clipped by the legacy compiler. Native schedules must keep
  // their authored full-N grid and clip at its scheduler-specific begin index.
  const sigmas =
    base.totalSteps === 0
      ? [0]
      : scheduler === 'euler'
        ? full.sigmas
        : full.sigmas.slice(beginIndex)
  const timesteps =
    base.totalSteps === 0
      ? []
      : scheduler === 'euler'
        ? full.timesteps
        : full.timesteps.slice(beginIndex)
  const totalSteps = timesteps.length
  const initialSigma =
    totalSteps === 0 ? 0 : base.mode === 'txt2img' || base.strength === 1 ? 1 : sigmas[0]
  return Object.freeze({
    ...base,
    beginIndex,
    initialSigma,
    scheduler,
    sigmas: Object.freeze(sigmas),
    timesteps: Object.freeze(timesteps),
    totalSteps,
    version: 'anima-deterministic-denoising-v1',
  })
}

function nativeSchedule(scheduler: 'dpmpp_2m' | 'heun', steps: number) {
  const sigmas: number[] = []
  const timesteps: number[] = []
  if (scheduler === 'heun') {
    // The constructor's minimum is shifted with float32 tensor operations before
    // set_timesteps uses it as a double-precision NumPy linspace endpoint.
    const minimum = Math.fround(
      Math.fround(3 * Math.fround(0.001)) / Math.fround(1 + Math.fround(2 * Math.fround(0.001))),
    )
    for (const nativeTime of linspace(1000, minimum * 1000, steps)) {
      const timestep = nativeTime / 1000
      const sigma = Math.fround((3 * timestep) / (1 + 2 * timestep))
      const nativeTimestep = Math.fround(sigma * 1000)
      sigmas.push(sigma)
      timesteps.push(nativeTimestep)
      if (sigmas.length > 1) {
        sigmas.push(sigma)
        timesteps.push(nativeTimestep)
      }
    }
  } else {
    const alphas = linspace(1, 0.001, steps + 1)
    for (let index = steps; index > 0; index -= 1) {
      const timestep = 1 - alphas[index]
      const sigma = (3 * timestep) / (1 + 2 * timestep)
      sigmas.push(Math.fround(sigma))
      // Native converts to int64 before casting sigmas to float32.
      timesteps.push(Math.trunc(sigma * 1000))
    }
  }
  sigmas.push(0)
  return { sigmas, timesteps }
}

function linspace(start: number, stop: number, count: number): number[] {
  if (count === 1) {
    return [start]
  }
  // Match NumPy float64 multiply-then-add ordering and its exact final endpoint.
  const interval = (stop - start) / (count - 1)
  return Array.from({ length: count }, (_, index) =>
    index === count - 1 ? stop : start + index * interval,
  )
}

function captureFields(input: unknown): Record<string, unknown> {
  if (
    typeof input !== 'object' ||
    input === null ||
    Array.isArray(input) ||
    (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null)
  ) {
    throw new AnimaSamplingPlanError('Anima sampling input must be a plain object.')
  }
  const keys = Reflect.ownKeys(input)
  const descriptors = Object.getOwnPropertyDescriptors(input)
  if (
    keys.length !== INPUT_FIELDS.length ||
    keys.some((key) => typeof key !== 'string' || !INPUT_FIELDS.includes(key))
  ) {
    throw new AnimaSamplingPlanError('Anima sampling input fields are unsupported.')
  }
  const captured: Record<string, unknown> = {}
  for (const key of INPUT_FIELDS) {
    const descriptor = descriptors[key]
    if (!descriptor || !('value' in descriptor)) {
      throw new AnimaSamplingPlanError('Anima sampling input must contain plain values.')
    }
    captured[key] = descriptor.value
  }
  return captured
}
