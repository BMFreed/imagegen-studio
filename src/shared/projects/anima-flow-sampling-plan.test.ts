import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'

import {
  AnimaFlowSamplingPlanError,
  type AnimaFlowScheduler,
  compileAnimaFlowSamplingPlan,
} from './anima-flow-sampling-plan.js'
import { compileAnimaSamplingPlan } from './anima-sampling-plan.js'

// Boundary: the actual TS flow-plan compiler, with no compiler or worker substitute.
// Neighbors change scheduler, strength, seed or one capture field. Independent
// native numeric fixtures distinguish float32 sigma/model time, authored-N suffixes
// and pure-noise endpoints. Semantic mutations include scheduler aliases, omitted
// rounding, rebuilding clipped grids, altered stream seeds and mutable captures.
const BASE_INPUT = {
  guidanceScale: 4.5,
  height: 512,
  mode: 'txt2img',
  scheduler: 'euler',
  seed: 0,
  steps: 4,
  strength: null,
  width: 512,
}
const SCHEDULERS: readonly AnimaFlowScheduler[] = [
  'euler',
  'heun',
  'dpmpp_2m',
  'dpmpp_2m_sde',
  'er_sde',
  'lcm',
]
const DPM_SIGMAS = [
  0.999_666_452_407_836_9, 0.899_639_785_289_764_4, 0.749_624_788_761_138_9,
  0.499_666_541_814_804_1, 0,
]
const FLOW_SIGMAS = [1, 0.899_999_976_158_142_1, 0.75, 0.5, 0]

function plan(overrides: Record<string, unknown> = {}) {
  return compileAnimaFlowSamplingPlan({ ...BASE_INPUT, ...overrides })
}

function refuses(input: unknown): void {
  assert.throws(
    () => compileAnimaFlowSamplingPlan(input),
    (error) =>
      error instanceof AnimaFlowSamplingPlanError &&
      error.code === 'GENERATION_SAMPLING_UNSUPPORTED' &&
      error.message.length > 0,
  )
}

test('the actual flow compiler captures exactly seventeen fields with explicit Euler identity', () => {
  assert.deepEqual(compileAnimaFlowSamplingPlan(BASE_INPUT), {
    beginIndex: 0,
    guidanceScale: 4.5,
    height: 512,
    initialSigma: 1,
    mode: 'txt2img',
    posteriorSeed: null,
    scheduler: 'euler',
    seed: 0,
    sigmas: [1, 0.9, 0.75, 0.5, 0],
    startStep: 0,
    steps: 4,
    stepSeed: 0,
    strength: null,
    timesteps: [1000, 900, 750, 500],
    totalSteps: 4,
    version: 'anima-flow-denoising-v1',
    width: 512,
  })
  assert.equal(Object.keys(plan()).length, 17)
})

test('all three existing deterministic methods preserve the untouched old compiler for every authored count', () => {
  for (const scheduler of ['euler', 'heun', 'dpmpp_2m'] as const) {
    for (let steps = 1; steps <= 200; steps += 1) {
      for (const strength of [null, 0, Number.MIN_VALUE, 0.5, 0.8, 1]) {
        const input = {
          ...BASE_INPUT,
          mode: strength === null ? 'txt2img' : 'img2img',
          scheduler,
          steps,
          strength,
        }
        const previous = compileAnimaSamplingPlan(input)
        assert.deepEqual(compileAnimaFlowSamplingPlan(input), {
          ...previous,
          stepSeed: previous.seed,
          version: 'anima-flow-denoising-v1',
        })
      }
    }
  }
})

test('DPM++ 2M SDE preserves native DPM flow sigmas and integer model times', () => {
  const full = plan({ scheduler: 'dpmpp_2m_sde' })
  assert.equal(full.scheduler, 'dpmpp_2m_sde')
  assert.deepEqual(full.sigmas, DPM_SIGMAS)
  assert.deepEqual(full.timesteps, [999, 899, 749, 499])
  assert.equal(full.initialSigma, 1)
  assert.equal(full.steps, 4)
  assert.equal(full.totalSteps, 4)
  assert.equal(full.beginIndex, 0)
  const interior = plan({ mode: 'img2img', scheduler: 'dpmpp_2m_sde', strength: 0.5 })
  assert.equal(interior.beginIndex, 2)
  assert.equal(interior.startStep, 2)
  assert.equal(interior.totalSteps, 2)
  assert.deepEqual(interior.sigmas, DPM_SIGMAS.slice(2))
  assert.deepEqual(interior.timesteps, [749, 499])
  assert.equal(interior.initialSigma, 0.749_624_788_761_138_9)
  assert.notEqual(interior.initialSigma, 0.75)
})

test('DPM SDE retains deterministic native-grid parity for all authored counts and strengths', () => {
  for (let steps = 1; steps <= 200; steps += 1) {
    for (const strength of [null, 0, Number.MIN_VALUE, 0.01, 0.25, 0.5, 0.8, 1]) {
      const input = {
        ...BASE_INPUT,
        mode: strength === null ? 'txt2img' : 'img2img',
        steps,
        strength,
      }
      const reference = compileAnimaSamplingPlan({ ...input, scheduler: 'dpmpp_2m' })
      assert.deepEqual(compileAnimaFlowSamplingPlan({ ...input, scheduler: 'dpmpp_2m_sde' }), {
        ...reference,
        scheduler: 'dpmpp_2m_sde',
        stepSeed: reference.seed,
        version: 'anima-flow-denoising-v1',
      })
    }
  }
})

test('ER-SDE and Flow LCM preserve explicit fixed-shift-three float32 sigmas and native model times', () => {
  for (const scheduler of ['er_sde', 'lcm'] as const) {
    const full = plan({ scheduler })
    assert.equal(full.scheduler, scheduler)
    assert.deepEqual(full.sigmas, FLOW_SIGMAS)
    assert.deepEqual(full.timesteps, [1000, 900, 750, 500])
    assert.equal(full.totalSteps, 4)
    assert.equal(full.beginIndex, 0)
    assert.notEqual(full.sigmas[1], 0.9)
    const three = plan({ scheduler, steps: 3 })
    assert.deepEqual(three.sigmas, [1, 0.857_142_865_657_806_4, 0.600_000_023_841_857_9, 0])
    assert.deepEqual(three.timesteps, [1000, 857.142_883_300_781_2, 600])
    assert.notEqual(three.timesteps[1], three.sigmas[1] * 1000)
    assert.notEqual(three.sigmas[1], 2 / 3)
  }
})

test('all new-method authored counts match independently captured native array digests', () => {
  // Captured using actual Diffusers DPM public APIs and Invoke's native ER/Flow LCM
  // explicit-grid APIs. Each authored N=1..200 contributes terminal-inclusive
  // sigmas and then timesteps, encoded as IEEE binary64 little-endian.
  const references = {
    dpmpp_2m_sde: 'da257719d47280b6d8a2b88b03ae35a9d83ff4a92ed7b34b8ba5a3e00fb49744',
    er_sde: 'fb8943a8ffb52ceba8d3b662f0f363c50351f31b0c3cdad0dc89af507cdb093f',
    lcm: 'fb8943a8ffb52ceba8d3b662f0f363c50351f31b0c3cdad0dc89af507cdb093f',
  }
  for (const scheduler of ['dpmpp_2m_sde', 'er_sde', 'lcm'] as const) {
    const digest = createHash('sha256')
    for (let steps = 1; steps <= 200; steps += 1) {
      const compiled = plan({ scheduler, steps })
      for (const value of [...compiled.sigmas, ...compiled.timesteps]) {
        const encoded = Buffer.alloc(8)
        encoded.writeDoubleLE(value)
        digest.update(encoded)
      }
    }
    assert.equal(digest.digest('hex'), references[scheduler], scheduler)
  }
})

test('ER-SDE and LCM interior img2img clip the original grid instead of rebuilding fewer steps', () => {
  for (const scheduler of ['er_sde', 'lcm'] as const) {
    const interior = plan({ mode: 'img2img', scheduler, strength: 0.5 })
    assert.equal(interior.steps, 4)
    assert.equal(interior.startStep, 2)
    assert.equal(interior.beginIndex, 2)
    assert.equal(interior.totalSteps, 2)
    assert.equal(interior.initialSigma, 0.75)
    assert.deepEqual(interior.sigmas, [0.75, 0.5, 0])
    assert.deepEqual(interior.timesteps, [750, 500])
    assert.notDeepEqual(interior.sigmas, plan({ scheduler, steps: 2 }).sigmas)
    const third = plan({ mode: 'img2img', scheduler, steps: 3, strength: 0.5 })
    assert.equal(third.initialSigma, 0.857_142_865_657_806_4)
    assert.notEqual(third.initialSigma, 6 / 7)
  }
})

test('all six methods preserve full-strength pure noise and independent posterior and scheduler seeds', () => {
  for (const scheduler of SCHEDULERS) {
    const text = plan({ scheduler, seed: 123 })
    const image = plan({ mode: 'img2img', scheduler, seed: 123, strength: 1 })
    assert.equal(text.mode, 'txt2img')
    assert.equal(image.mode, 'img2img')
    assert.equal(image.strength, 1)
    assert.equal(image.initialSigma, 1)
    assert.equal(text.initialSigma, 1)
    assert.equal(text.posteriorSeed, null)
    assert.equal(image.posteriorSeed, 2_654_435_778)
    assert.equal(text.stepSeed, 123)
    assert.equal(image.stepSeed, 123)
    assert.equal(image.seed, text.seed)
    assert.deepEqual(image.sigmas, text.sigmas)
    assert.deepEqual(image.timesteps, text.timesteps)
    assert.equal(image.beginIndex, 0)
    assert.equal(image.totalSteps, text.totalSteps)
  }
})

test('literal and subprecision zero strengths perform no evaluations across all six methods', () => {
  for (const scheduler of SCHEDULERS) {
    for (const steps of [1, 4, 30, 200]) {
      for (const strength of [0, Number.MIN_VALUE]) {
        const zero = plan({ mode: 'img2img', scheduler, steps, strength })
        assert.equal(zero.steps, steps)
        assert.equal(zero.strength, strength)
        assert.equal(zero.startStep, steps)
        assert.equal(zero.beginIndex, scheduler === 'heun' ? 2 * steps : steps)
        assert.equal(zero.totalSteps, 0)
        assert.equal(zero.initialSigma, 0)
        assert.deepEqual(zero.sigmas, [0])
        assert.deepEqual(zero.timesteps, [])
        assert.equal(zero.stepSeed, 0)
      }
    }
  }
})

test('all authored counts preserve original positive monotone suffixes and exact evaluation counts', () => {
  for (const scheduler of SCHEDULERS) {
    for (let steps = 1; steps <= 200; steps += 1) {
      const full = plan({ scheduler, steps })
      assert.equal(full.totalSteps, scheduler === 'heun' ? 2 * steps - 1 : steps)
      assert.equal(full.sigmas.length, full.timesteps.length + 1)
      assert.equal(full.sigmas.at(-1), 0)
      for (let index = 0; index < full.totalSteps; index += 1) {
        assert.ok(full.sigmas[index] > 0 && full.sigmas[index] <= 1)
        assert.ok(full.sigmas[index] >= full.sigmas[index + 1])
        assert.ok(full.timesteps[index] >= 0 && full.timesteps[index] <= 1000)
      }
      for (const strength of [0.01, 0.25, 0.5, 0.8, 1]) {
        const clipped = plan({ mode: 'img2img', scheduler, steps, strength })
        const remaining = steps - clipped.startStep
        assert.equal(
          clipped.beginIndex,
          scheduler === 'heun' ? 2 * clipped.startStep : clipped.startStep,
        )
        assert.equal(
          clipped.totalSteps,
          remaining === 0 ? 0 : scheduler === 'heun' ? 2 * remaining - 1 : remaining,
        )
        assert.deepEqual(clipped.timesteps, full.timesteps.slice(clipped.beginIndex))
        assert.deepEqual(
          clipped.sigmas,
          remaining === 0 ? [0] : full.sigmas.slice(clipped.beginIndex),
        )
        assert.equal(
          clipped.initialSigma,
          remaining === 0 ? 0 : strength === 1 ? 1 : clipped.sigmas[0],
        )
      }
    }
  }
})

test('IEEE strength neighbors change captured begin indices without rounding', () => {
  for (const scheduler of SCHEDULERS) {
    const boundary = plan({ mode: 'img2img', scheduler, steps: 30, strength: 0.8 })
    const below = plan({ mode: 'img2img', scheduler, steps: 30, strength: 0.799_999_999_999_999_9 })
    const above = plan({ mode: 'img2img', scheduler, steps: 30, strength: 0.800_000_000_000_000_2 })
    assert.equal(boundary.startStep, 5)
    assert.equal(below.startStep, 6)
    assert.equal(boundary.beginIndex, scheduler === 'heun' ? 10 : 5)
    assert.equal(below.beginIndex, scheduler === 'heun' ? 12 : 6)
    assert.equal(boundary.totalSteps, scheduler === 'heun' ? 49 : 25)
    assert.equal(below.totalSteps, scheduler === 'heun' ? 47 : 24)
    assert.deepEqual(above.sigmas, boundary.sigmas)
    assert.deepEqual(above.timesteps, boundary.timesteps)
  }
})

test('single authored steps never invent a terminal evaluation or Heun duplicate', () => {
  for (const scheduler of SCHEDULERS) {
    const single = plan({ scheduler, steps: 1 })
    assert.equal(single.totalSteps, 1)
    assert.equal(single.beginIndex, 0)
    assert.deepEqual(
      single.sigmas,
      scheduler === 'dpmpp_2m' || scheduler === 'dpmpp_2m_sde'
        ? [0.999_666_452_407_836_9, 0]
        : [1, 0],
    )
    assert.deepEqual(
      single.timesteps,
      scheduler === 'dpmpp_2m' || scheduler === 'dpmpp_2m_sde' ? [999] : [1000],
    )
    assert.equal(single.initialSigma, 1)
  }
})

test('all captured arrays and seventeen fields are detached, frozen and JSON-portable', () => {
  for (const scheduler of SCHEDULERS) {
    const input = { ...BASE_INPUT, mode: 'img2img', scheduler, strength: 0.5 }
    const compiled = compileAnimaFlowSamplingPlan(input)
    const captured = JSON.parse(JSON.stringify(compiled))
    input.steps = 200
    input.strength = 0
    input.seed = 0xff_ff_ff_ff
    input.scheduler = 'euler'
    assert.deepEqual(compiled, captured)
    assert.ok(Object.isFrozen(compiled))
    assert.ok(Object.isFrozen(compiled.sigmas))
    assert.ok(Object.isFrozen(compiled.timesteps))
    for (const field of Object.keys(compiled)) {
      assert.equal(Reflect.set(compiled, field, null), false)
    }
    for (const array of [compiled.sigmas, compiled.timesteps]) {
      assert.equal(Reflect.set(array, '0', 17), false)
      assert.throws(() => (array as number[]).push(0), TypeError)
    }
  }
  const plainWithoutPrototype = Object.assign(Object.create(null), BASE_INPUT)
  assert.doesNotThrow(() => compileAnimaFlowSamplingPlan(plainWithoutPrototype))
  assert.deepEqual(compileAnimaFlowSamplingPlan(plainWithoutPrototype), plan())
})

test('seed zero and uint32 maximum remain literal scheduler seeds distinct from img2img posterior seeds', () => {
  for (const scheduler of SCHEDULERS) {
    assert.equal(plan({ scheduler, seed: 0 }).stepSeed, 0)
    assert.equal(plan({ scheduler, seed: 0xff_ff_ff_ff }).seed, 0xff_ff_ff_ff)
    assert.equal(plan({ scheduler, seed: 0xff_ff_ff_ff }).stepSeed, 0xff_ff_ff_ff)
    const zero = plan({ mode: 'img2img', scheduler, seed: 0, strength: 0.5 })
    const maximum = plan({ mode: 'img2img', scheduler, seed: 0xff_ff_ff_ff, strength: 0.5 })
    assert.equal(zero.posteriorSeed, 2_654_435_769)
    assert.equal(zero.stepSeed, 0)
    assert.equal(maximum.posteriorSeed, 1_640_531_526)
    assert.equal(maximum.stepSeed, 0xff_ff_ff_ff)
    assert.notEqual(zero.stepSeed, zero.posteriorSeed)
    assert.notEqual(maximum.stepSeed, maximum.posteriorSeed)
  }
})

test('dimensions, seed and CFG do not silently select or alter a method schedule', () => {
  for (const scheduler of SCHEDULERS) {
    const baseline = plan({ scheduler })
    const other = plan({
      guidanceScale: 30,
      height: 64,
      scheduler,
      seed: 0xff_ff_ff_ff,
      width: 2048,
    })
    assert.equal(other.scheduler, scheduler)
    assert.deepEqual(other.sigmas, baseline.sigmas)
    assert.deepEqual(other.timesteps, baseline.timesteps)
    assert.equal(other.stepSeed, 0xff_ff_ff_ff)
  }
})

test('the existing aligned pixel envelope and scalar endpoints remain exact for all six methods', () => {
  for (const scheduler of SCHEDULERS) {
    assert.equal(plan({ guidanceScale: 1, height: 64, scheduler, steps: 1, width: 64 }).width, 64)
    assert.equal(
      plan({ guidanceScale: 30, height: 1952, scheduler, steps: 200, width: 2048 }).height,
      1952,
    )
    assert.equal(plan({ height: 2000, scheduler, width: 2000 }).width, 2000)
    for (const [width, height] of [
      [2008, 2000],
      [2048, 1960],
      [63, 64],
      [64, 65],
      [2056, 64],
    ]) {
      refuses({ ...BASE_INPUT, height, scheduler, width })
    }
  }
})

test('mode-specific strengths and unsupported scheduler names never default or coerce', () => {
  for (const scheduler of [null, undefined, 'Euler', 'euler_a', 'dpmpp_sde', 'lcms', {}, 0]) {
    refuses({ ...BASE_INPUT, scheduler })
  }
  for (const scheduler of SCHEDULERS) {
    for (const mode of [null, undefined, 'inpaint', 'outpaint', 'TXT2IMG', 0]) {
      refuses({ ...BASE_INPUT, mode, scheduler })
    }
    for (const strength of [undefined, 0, 0.5, 1, '0.5']) {
      refuses({ ...BASE_INPUT, scheduler, strength })
    }
    for (const strength of [
      undefined,
      null,
      -Number.MIN_VALUE,
      1.000_000_000_000_000_2,
      '0.5',
      false,
    ]) {
      refuses({ ...BASE_INPUT, mode: 'img2img', scheduler, strength })
    }
  }
})

test('inherited, symbol, extra hidden and missing inputs refuse without executing any accessor', () => {
  for (const value of [null, undefined, [], 'txt2img', 0, new Date(), Object.create(BASE_INPUT)]) {
    refuses(value)
  }
  for (const key of Object.keys(BASE_INPUT)) {
    const missing: Record<string, unknown> = { ...BASE_INPUT }
    delete missing[key]
    refuses(missing)
  }
  for (const key of [
    'version',
    'sigmas',
    'timesteps',
    'startStep',
    'totalSteps',
    'initialSigma',
    'beginIndex',
    'posteriorSeed',
    'stepSeed',
    'cfgRescale',
    'mask',
  ]) {
    refuses({ ...BASE_INPUT, [key]: null })
  }
  let getterCalls = 0
  for (const field of Object.keys(BASE_INPUT)) {
    const accessor = { ...BASE_INPUT }
    Object.defineProperty(accessor, field, {
      get: () => {
        getterCalls += 1
        throw new Error('Compiler must not invoke input accessors.')
      },
    })
    refuses(accessor)
  }
  assert.equal(getterCalls, 0)
  const hidden = { ...BASE_INPUT }
  Object.defineProperty(hidden, 'nativeConfig', { enumerable: false, value: {} })
  refuses(hidden)
  refuses({ ...BASE_INPUT, [Symbol('scheduler')]: 'heun' })
  const ownHiddenField = { ...BASE_INPUT }
  Object.defineProperty(ownHiddenField, 'seed', { enumerable: false, value: 17 })
  assert.doesNotThrow(() => compileAnimaFlowSamplingPlan(ownHiddenField))
  assert.equal(compileAnimaFlowSamplingPlan(ownHiddenField).seed, 17)
})

test('complete own values do not turn a class, array or custom prototype into a plain input', () => {
  const plain = { ...BASE_INPUT }
  assert.doesNotThrow(() => compileAnimaFlowSamplingPlan(plain))
  assert.deepEqual(compileAnimaFlowSamplingPlan(plain), plan())
  for (const container of [Object.create({ inheritedMarker: true }), new (class {})(), []]) {
    const nonplain = Object.assign(container, BASE_INPUT)
    assert.equal(nonplain.mode, plain.mode)
    assert.equal(nonplain.seed, plain.seed)
    refuses(nonplain)
  }
})

for (const field of ['width', 'height', 'steps', 'seed', 'guidanceScale', 'strength']) {
  test(`${field} retains strict finite, integer and numeric range validation for all six schedulers`, () => {
    for (const scheduler of SCHEDULERS) {
      const input =
        field === 'strength'
          ? { ...BASE_INPUT, mode: 'img2img', scheduler, strength: 0.5 }
          : { ...BASE_INPUT, scheduler }
      for (const value of [NaN, Infinity, -Infinity, null, undefined, false, '1', 1n]) {
        refuses({ ...input, [field]: value })
      }
      const invalid =
        field === 'width' || field === 'height'
          ? [64.5, 56, 2056]
          : field === 'steps'
            ? [0, 1.5, 201]
            : field === 'seed'
              ? [-1, 0.5, 0x1_00_00_00_00]
              : field === 'guidanceScale'
                ? [0.999_999_999_999_999_9, 30.000_000_000_000_004]
                : [-Number.MIN_VALUE, 1.000_000_000_000_000_2]
      for (const value of invalid) {
        refuses({ ...input, [field]: value })
      }
    }
  })
}
