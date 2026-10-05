import assert from 'node:assert/strict'
import { test } from 'node:test'

import { AnimaEulerDenoisingPlanError, compileAnimaEulerDenoisingPlan } from './anima-euler-plan.js'

// Boundary: the actual internal compiler, without worker, queue or tensor substitutes.
// Invariants: full shifted schedule, exact clipping, bounded scalars and immutable capture.
// Reference: InvokeAI 9e154096 anima_denoise.py:411-425, 584-591; the four-step values
// below are independent fractions. Strength 0 and posterior seed domains are
// deliberate Project extensions, not claims of original Invoke behavior.
// Mutants: linear sigmas, round/epsilon-adjust clipping, shortened-schedule rebuild,
// dropped terminal zero, mutable capture, unseparated posterior seed and ignored limits.
const BASE_INPUT = {
  guidanceScale: 4.5,
  height: 512,
  mode: 'txt2img',
  seed: 0,
  steps: 4,
  strength: null,
  width: 512,
}

function plan(overrides: Record<string, unknown> = {}) {
  return compileAnimaEulerDenoisingPlan({ ...BASE_INPUT, ...overrides })
}

function refuses(input: unknown): void {
  assert.throws(
    () => compileAnimaEulerDenoisingPlan(input),
    (error) =>
      error instanceof AnimaEulerDenoisingPlanError &&
      error.code === 'GENERATION_SAMPLING_UNSUPPORTED' &&
      error.message.length > 0,
  )
}

test('the internal original-Anima Euler plan preserves a complete four-step shifted schedule', () => {
  assert.deepEqual(
    compileAnimaEulerDenoisingPlan({
      guidanceScale: 4.5,
      height: 512,
      mode: 'txt2img',
      seed: 0,
      steps: 4,
      strength: null,
      width: 512,
    }),
    {
      guidanceScale: 4.5,
      height: 512,
      mode: 'txt2img',
      posteriorSeed: null,
      scheduler: 'euler',
      seed: 0,
      sigmas: [1, 0.9, 0.75, 0.5, 0],
      startStep: 0,
      steps: 4,
      strength: null,
      totalSteps: 4,
      version: 'anima-euler-denoising-v1',
      width: 512,
    },
  )
})

test('one and maximum authored step counts include terminal zero without extra evaluations', () => {
  const single = plan({ steps: 1 })
  assert.deepEqual(single.sigmas, [1, 0])
  assert.equal(single.totalSteps, 1)
  const maximum = plan({ steps: 200 })
  assert.equal(maximum.steps, 200)
  assert.equal(maximum.totalSteps, 200)
  assert.equal(maximum.sigmas.length, 201)
  assert.equal(maximum.sigmas[0], 1)
  assert.equal(maximum.sigmas.at(-1), 0)
})

test('fixed shift is independent of resolution, seed and CFG', () => {
  const baseline = plan()
  const other = plan({ guidanceScale: 30, height: 64, seed: 0xff_ff_ff_ff, width: 2048 })
  assert.deepEqual(other.sigmas, baseline.sigmas)
  assert.equal(other.width, 2048)
  assert.equal(other.height, 64)
  assert.equal(other.seed, 0xff_ff_ff_ff)
  assert.equal(other.guidanceScale, 30)
})

test('opaque img2img clips the authored schedule rather than regenerating fewer full steps', () => {
  const clipped = plan({ mode: 'img2img', strength: 0.5 })
  assert.equal(clipped.mode, 'img2img')
  assert.equal(clipped.strength, 0.5)
  assert.equal(clipped.steps, 4)
  assert.equal(clipped.startStep, 2)
  assert.equal(clipped.totalSteps, 2)
  assert.deepEqual(clipped.sigmas, [0.75, 0.5, 0])
  assert.notDeepEqual(clipped.sigmas, plan({ steps: 2 }).sigmas)
})

test('full-strength opaque img2img and txt2img have identical diffusion schedules and seeds', () => {
  const text = plan({ seed: 123 })
  const image = plan({ mode: 'img2img', seed: 123, strength: 1 })
  assert.deepEqual(image.sigmas, text.sigmas)
  assert.equal(image.startStep, 0)
  assert.equal(image.totalSteps, text.totalSteps)
  assert.equal(image.seed, text.seed)
})

test('strength zero keeps authored steps but produces only terminal zero and no evaluations', () => {
  for (const steps of [1, 4, 30, 200]) {
    const zero = plan({ mode: 'img2img', steps, strength: 0 })
    assert.equal(zero.steps, steps)
    assert.equal(zero.strength, 0)
    assert.equal(zero.startStep, steps)
    assert.equal(zero.totalSteps, 0)
    assert.deepEqual(zero.sigmas, [0])
  }
})

test('Invoke float boundary is preserved without rounding or epsilon compensation', () => {
  // Executed Python source arithmetic: .8 gives start 5; the next lower binary64
  // value gives start 6. A decimal intuition of exactly 6 would change the schedule.
  const boundary = plan({ mode: 'img2img', steps: 30, strength: 0.8 })
  const below = plan({ mode: 'img2img', steps: 30, strength: 0.799_999_999_999_999_9 })
  const above = plan({ mode: 'img2img', steps: 30, strength: 0.800_000_000_000_000_2 })
  assert.equal(boundary.startStep, 5)
  assert.equal(boundary.totalSteps, 25)
  assert.ok(Math.abs(boundary.sigmas[0] - 0.9375) < 1e-15)
  assert.equal(below.startStep, 6)
  assert.equal(below.totalSteps, 24)
  assert.ok(Math.abs(below.sigmas[0] - 12 / 13) < 1e-15)
  assert.deepEqual(above.sigmas, boundary.sigmas)
})

test('subprecision positive strength can have zero evaluations without inventing a step', () => {
  const tiny = plan({ mode: 'img2img', steps: 30, strength: Number.MIN_VALUE })
  assert.equal(tiny.strength, Number.MIN_VALUE)
  assert.equal(tiny.startStep, 30)
  assert.equal(tiny.totalSteps, 0)
  assert.deepEqual(tiny.sigmas, [0])
})

test('every allowed authored step count has decreasing bounded sigmas and exact clipped suffixes', () => {
  for (let steps = 1; steps <= 200; steps += 1) {
    const full = plan({ steps })
    assert.equal(full.sigmas.length, steps + 1)
    for (let index = 0; index < steps; index += 1) {
      assert.ok(full.sigmas[index] > full.sigmas[index + 1])
      assert.ok(full.sigmas[index] <= 1)
      assert.ok(full.sigmas[index + 1] >= 0)
    }
    for (const strength of [0, 0.01, 0.25, 0.5, 0.8, 1]) {
      const clipped = plan({ mode: 'img2img', steps, strength })
      assert.deepEqual(clipped.sigmas, full.sigmas.slice(clipped.startStep))
      assert.equal(clipped.totalSteps + clipped.startStep, steps)
      assert.equal(clipped.totalSteps, clipped.sigmas.length - 1)
    }
  }
})

test('posterior seed has a separate versioned uint32 domain at both seed endpoints', () => {
  assert.equal(plan({ seed: 0 }).posteriorSeed, null)
  const zero = plan({ mode: 'img2img', seed: 0, strength: 1 })
  const maximum = plan({ mode: 'img2img', seed: 0xff_ff_ff_ff, strength: 0 })
  assert.equal(zero.seed, 0)
  assert.equal(zero.posteriorSeed, 2_654_435_769)
  assert.equal(maximum.seed, 0xff_ff_ff_ff)
  assert.equal(maximum.posteriorSeed, 1_640_531_526)
})

test('the returned plan captures values and freezes its object and sigma array', () => {
  const input = { ...BASE_INPUT, mode: 'img2img', seed: 0, strength: 0.5 }
  const compiled = compileAnimaEulerDenoisingPlan(input)
  const captured = JSON.parse(JSON.stringify(compiled))
  input.steps = 200
  input.strength = 0
  input.seed = 0xff_ff_ff_ff
  assert.deepEqual(compiled, captured)
  assert.ok(Object.isFrozen(compiled))
  assert.ok(Object.isFrozen(compiled.sigmas))
  assert.equal(Reflect.set(compiled, 'posteriorSeed', 0), false)
  assert.equal(Reflect.set(compiled, 'seed', 17), false)
  assert.equal(Reflect.set(compiled.sigmas, '0', 1), false)
  assert.throws(() => (compiled.sigmas as number[]).push(0), TypeError)
})

test('the plain captured plan survives a lossless JSON roundtrip', () => {
  const compiled = plan({ mode: 'img2img', steps: 30, strength: 0.8 })
  assert.deepEqual(JSON.parse(JSON.stringify(compiled)), compiled)
  assert.deepEqual(
    compileAnimaEulerDenoisingPlan(Object.assign(Object.create(null), BASE_INPUT)),
    plan(),
  )
})

test('both mode-specific strength shapes are required without fallback', () => {
  for (const strength of [undefined, 0, 0.5, 1, '0.5']) {
    refuses({ ...BASE_INPUT, strength })
  }
  for (const strength of [
    undefined,
    null,
    -Number.MIN_VALUE,
    1.000_000_000_000_000_2,
    '0.5',
    false,
  ]) {
    refuses({ ...BASE_INPUT, mode: 'img2img', strength })
  }
  assert.equal(plan({ mode: 'img2img', strength: 0 }).strength, 0)
  assert.equal(plan({ mode: 'img2img', strength: 1 }).strength, 1)
})

test('aligned dimension endpoints and the four-million-pixel envelope are inclusive', () => {
  assert.equal(plan({ height: 64, width: 64 }).width, 64)
  assert.equal(plan({ height: 64, width: 2048 }).width, 2048)
  assert.equal(plan({ height: 2000, width: 2000 }).height, 2000)
  assert.equal(plan({ height: 1952, width: 2048 }).height, 1952)
  refuses({ ...BASE_INPUT, height: 2000, width: 2008 })
  refuses({ ...BASE_INPUT, height: 1960, width: 2048 })
})

for (const field of ['width', 'height']) {
  test(`${field} rejects below/above bounds, unsafe/fractional and unaligned numbers`, () => {
    for (const value of [56, 63, 65, 2049, 2056, 64.5, Number.MAX_SAFE_INTEGER + 1]) {
      refuses({ ...BASE_INPUT, [field]: value })
    }
    assert.equal(plan({ [field]: 72 })[field as 'height' | 'width'], 72)
  })
}

test('authored steps reject zero, fractions and excess while their neighboring counts pass', () => {
  for (const steps of [0, -1, 1.5, 201, Number.MAX_SAFE_INTEGER + 1]) {
    refuses({ ...BASE_INPUT, steps })
  }
  assert.equal(plan({ steps: 1 }).steps, 1)
  assert.equal(plan({ steps: 200 }).steps, 200)
})

test('diffusion seed requires a uint32 integer and preserves seed zero', () => {
  for (const seed of [-1, 0.5, 0x1_00_00_00_00, Number.MAX_SAFE_INTEGER + 1]) {
    refuses({ ...BASE_INPUT, seed })
  }
  assert.equal(plan({ seed: 0 }).seed, 0)
  assert.equal(plan({ seed: 0xff_ff_ff_ff }).seed, 0xff_ff_ff_ff)
})

test('CFG supports exact endpoints and fractions but rejects a value outside either endpoint', () => {
  assert.equal(plan({ guidanceScale: 1 }).guidanceScale, 1)
  assert.equal(plan({ guidanceScale: 4.5 }).guidanceScale, 4.5)
  assert.equal(plan({ guidanceScale: 30 }).guidanceScale, 30)
  refuses({ ...BASE_INPUT, guidanceScale: 0.999_999_999_999_999_9 })
  refuses({ ...BASE_INPUT, guidanceScale: 30.000_000_000_000_004 })
})

for (const field of ['width', 'height', 'steps', 'seed', 'guidanceScale', 'strength']) {
  test(`${field} rejects nonfinite numbers and values that would require numeric coercion`, () => {
    const base =
      field === 'strength' ? { ...BASE_INPUT, mode: 'img2img', strength: 0.5 } : BASE_INPUT
    for (const value of [
      NaN,
      Infinity,
      -Infinity,
      null,
      undefined,
      false,
      '1',
      1n,
      // eslint-disable-next-line unicorn/new-for-builtins -- A boxed number is intentionally invalid input.
      new Number(1),
    ]) {
      refuses({ ...base, [field]: value })
    }
  })
}

test('missing, extra and unsupported input fields never select a default mode or scheduler', () => {
  for (const key of Object.keys(BASE_INPUT)) {
    const missing: Record<string, unknown> = { ...BASE_INPUT }
    delete missing[key]
    refuses(missing)
  }
  for (const key of [
    'scheduler',
    'version',
    'sigmas',
    'startStep',
    'totalSteps',
    'posteriorSeed',
    'cfgRescale',
    'mask',
  ]) {
    refuses({ ...BASE_INPUT, [key]: key === 'scheduler' ? 'heun' : null })
  }
  for (const mode of [null, undefined, 'inpaint', 'outpaint', 'TXT2IMG', 0]) {
    refuses({ ...BASE_INPUT, mode })
  }
})

test('non-object, inherited, accessor and hidden extra fields refuse without evaluating getters', () => {
  for (const value of [null, undefined, [], 'txt2img', 0, new Date(), Object.create(BASE_INPUT)]) {
    refuses(value)
  }
  let getterCalls = 0
  const accessor = { ...BASE_INPUT }
  Object.defineProperty(accessor, 'steps', {
    get: () => {
      getterCalls += 1
      return 4
    },
  })
  refuses(accessor)
  assert.equal(getterCalls, 0)
  const hidden = { ...BASE_INPUT }
  Object.defineProperty(hidden, 'scheduler', { enumerable: false, value: 'heun' })
  refuses(hidden)
  refuses({ ...BASE_INPUT, [Symbol('scheduler')]: 'heun' })
})
