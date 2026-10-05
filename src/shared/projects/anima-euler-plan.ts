export type AnimaEulerDenoisingPlan = AnimaEulerPlanFields &
  (
    | { readonly mode: 'img2img'; readonly strength: number }
    | { readonly mode: 'txt2img'; readonly strength: null }
  )

interface AnimaEulerPlanFields {
  readonly guidanceScale: number
  readonly height: number
  readonly posteriorSeed: number | null
  readonly scheduler: 'euler'
  readonly seed: number
  readonly sigmas: readonly number[]
  readonly startStep: number
  readonly steps: number
  readonly totalSteps: number
  readonly version: 'anima-euler-denoising-v1'
  readonly width: number
}

export class AnimaEulerDenoisingPlanError extends Error {
  readonly code = 'GENERATION_SAMPLING_UNSUPPORTED'

  constructor(message: string) {
    super(message)
    this.name = 'AnimaEulerDenoisingPlanError'
  }
}

const INPUT_FIELDS = ['mode', 'width', 'height', 'steps', 'seed', 'guidanceScale', 'strength']

/**
 * Internal original-Anima Invoke-default Euler schedule; this does not admit a job.
 *
 * InvokeAI 9e154096 uses fixed shift 3, raw sigma model timesteps and CPU float32 seeded noise
 * before device/dtype conversion. Euler evaluates every nonterminal sigma once. The 64..2048, 4M
 * pixels, 200 steps and CFG 1..30 bounds inherit the existing worker envelope; they are provisional
 * ceilings, not model capability. Img2img posterior sampling uses a separate, versioned seed domain
 * instead of Invoke's unseeded posterior; it must never consume the diffusion noise stream.
 */
export function compileAnimaEulerDenoisingPlan(input: unknown): AnimaEulerDenoisingPlan {
  const fields = captureFields(input)
  const mode = fields['mode']
  if (mode !== 'txt2img' && mode !== 'img2img') {
    throw new AnimaEulerDenoisingPlanError('Anima Euler mode is unsupported.')
  }
  const width = boundedInteger(fields['width'], 'width', 64, 2048)
  const height = boundedInteger(fields['height'], 'height', 64, 2048)
  if (width % 8 !== 0 || height % 8 !== 0 || width * height > 4_000_000) {
    throw new AnimaEulerDenoisingPlanError(
      'Anima Euler dimensions exceed the aligned pixel envelope.',
    )
  }
  const steps = boundedInteger(fields['steps'], 'steps', 1, 200)
  const seed = boundedInteger(fields['seed'], 'seed', 0, 0xff_ff_ff_ff)
  const guidanceScale = boundedNumber(fields['guidanceScale'], 'guidance scale', 1, 30)
  if (mode === 'txt2img' && fields['strength'] !== null) {
    throw new AnimaEulerDenoisingPlanError('Anima Euler txt2img strength must be null.')
  }
  const strength = mode === 'img2img' ? boundedNumber(fields['strength'], 'strength', 0, 1) : null
  // Preserve Invoke's IEEE-754 clipping expression: do not round boundary values.
  // Strength 0 intentionally extends its invocation with the Project no-denoise case.
  const startStep = strength === null ? 0 : Math.floor((1 - strength) * steps)
  const sigmas: number[] = []
  for (let index = startStep; index <= steps; index += 1) {
    const timestep = 1 - index / steps
    sigmas.push((3 * timestep) / (1 + 2 * timestep))
  }
  const plan = {
    guidanceScale,
    height,
    posteriorSeed: mode === 'img2img' ? (seed ^ 0x9e_37_79_b9) >>> 0 : null,
    scheduler: 'euler' as const,
    seed,
    sigmas: Object.freeze(sigmas),
    startStep,
    steps,
    totalSteps: sigmas.length - 1,
    version: 'anima-euler-denoising-v1' as const,
    width,
  }
  return Object.freeze(
    mode === 'txt2img'
      ? { ...plan, mode, strength: null }
      : { ...plan, mode, strength: strength as number },
  )
}

function captureFields(input: unknown): Record<string, unknown> {
  if (
    typeof input !== 'object' ||
    input === null ||
    Array.isArray(input) ||
    (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null)
  ) {
    throw new AnimaEulerDenoisingPlanError('Anima Euler input must be a plain object.')
  }
  const keys = Reflect.ownKeys(input)
  const descriptors = Object.getOwnPropertyDescriptors(input)
  if (
    keys.length !== INPUT_FIELDS.length ||
    keys.some((key) => typeof key !== 'string' || !INPUT_FIELDS.includes(key))
  ) {
    throw new AnimaEulerDenoisingPlanError('Anima Euler input fields are unsupported.')
  }
  const captured: Record<string, unknown> = {}
  for (const key of INPUT_FIELDS) {
    const descriptor = descriptors[key]
    if (!descriptor || !('value' in descriptor)) {
      throw new AnimaEulerDenoisingPlanError('Anima Euler input must contain plain values.')
    }
    captured[key] = descriptor.value
  }
  return captured
}

function boundedNumber(value: unknown, name: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new AnimaEulerDenoisingPlanError(`Anima Euler ${name} is outside the supported range.`)
  }
  return value
}

function boundedInteger(value: unknown, name: string, min: number, max: number): number {
  const number = boundedNumber(value, name, min, max)
  if (!Number.isSafeInteger(number)) {
    throw new AnimaEulerDenoisingPlanError(`Anima Euler ${name} must be a safe integer.`)
  }
  return number
}
