import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'

import { compileAnimaEulerDenoisingPlan } from './anima-euler-plan.js'
import {
  type AnimaDeterministicScheduler,
  AnimaSamplingPlanError,
  compileAnimaSamplingPlan,
} from './anima-sampling-plan.js'

// Boundary: the real internal TS compiler, without worker or scheduler substitutes.
// Independent four-step reference: Invoke's built-in Euler fixed-shift-3 fractions.
// Native Heun/DPM arrays below were independently captured through actual Diffusers
// 0.40.0 constructors/set_timesteps on CPU; no weights or scheduler mock is involved.
// Neighbors distinguish authored/evaluation counts, full/interior/zero strength,
// and actual float32 sigma versus scheduler timestep. Mutants include substituting
// Euler schedules, losing Heun duplicates, rebuilding clipped grids, rounding DPM
// timesteps after sigma cast, legacy img2img preblend and mutable captured arrays.
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

const SCHEDULERS: readonly AnimaDeterministicScheduler[] = ['euler', 'heun', 'dpmpp_2m']
const HEUN_SIGMAS = [
  1, 0.857_692_301_273_346, 0.857_692_301_273_346, 0.602_150_559_425_354, 0.602_150_559_425_354,
  0.008_928_571_827_709_675, 0.008_928_571_827_709_675, 0,
]
const HEUN_TIMESTEPS = [
  1000, 857.692_321_777_343_8, 857.692_321_777_343_8, 602.150_573_730_468_8, 602.150_573_730_468_8,
  8.928_571_701_049_805, 8.928_571_701_049_805,
]
const DPM_SIGMAS = [
  0.999_666_452_407_836_9, 0.899_639_785_289_764_4, 0.749_624_788_761_138_9,
  0.499_666_541_814_804_1, 0,
]

function plan(overrides: Record<string, unknown> = {}) {
  return compileAnimaSamplingPlan({ ...BASE_INPUT, ...overrides })
}

function refuses(input: unknown): void {
  assert.throws(
    () => compileAnimaSamplingPlan(input),
    (error) =>
      error instanceof AnimaSamplingPlanError &&
      error.code === 'GENERATION_SAMPLING_UNSUPPORTED' &&
      error.message.length > 0,
  )
}

test('the real compiler captures the complete deterministic Euler plan', () => {
  assert.deepEqual(compileAnimaSamplingPlan(BASE_INPUT), {
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
    strength: null,
    timesteps: [1000, 900, 750, 500],
    totalSteps: 4,
    version: 'anima-deterministic-denoising-v1',
    width: 512,
  })
})

test('Heun preserves the actual native float32 schedule and seven evaluations for four authored steps', () => {
  const heun = plan({ scheduler: 'heun' })
  assert.equal(heun.scheduler, 'heun')
  assert.equal(heun.steps, 4)
  assert.equal(heun.beginIndex, 0)
  assert.equal(heun.totalSteps, 7)
  assert.deepEqual(heun.sigmas, HEUN_SIGMAS)
  assert.deepEqual(heun.timesteps, HEUN_TIMESTEPS)
  assert.notEqual(heun.timesteps[3] / 1000, heun.sigmas[3])
})

test('DPM++ 2M preserves native flow sigmas and independent integer model timesteps', () => {
  const dpm = plan({ scheduler: 'dpmpp_2m' })
  assert.equal(dpm.scheduler, 'dpmpp_2m')
  assert.equal(dpm.steps, 4)
  assert.equal(dpm.totalSteps, 4)
  assert.deepEqual(dpm.sigmas, DPM_SIGMAS)
  assert.deepEqual(dpm.timesteps, [999, 899, 749, 499])
  assert.notEqual(dpm.timesteps[2] / 1000, dpm.sigmas[2])
  assert.equal(dpm.initialSigma, 1)
  assert.notEqual(dpm.initialSigma, dpm.sigmas[0])
})

test('all allowed Heun and DPM authored counts match independent actual native array digests', () => {
  // Captured independently from actual public native scheduler APIs. Each N=1..200
  // contributes its full sigmas (including terminal zero), then timesteps, all
  // encoded as IEEE binary64 little-endian. No implementation formula is mirrored.
  const references = {
    dpmpp_2m: 'da257719d47280b6d8a2b88b03ae35a9d83ff4a92ed7b34b8ba5a3e00fb49744',
    heun: 'ec86bd5fdc36ac218c4815a2070ee98614a4383f19d158b3073b9335918a5d6b',
  }
  for (const scheduler of ['heun', 'dpmpp_2m'] as const) {
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

test('native one-step schedules do not inherit Heun minimum or invent an extra terminal evaluation', () => {
  const heun = plan({ scheduler: 'heun', steps: 1 })
  assert.deepEqual(heun.sigmas, [1, 0])
  assert.deepEqual(heun.timesteps, [1000])
  assert.equal(heun.totalSteps, 1)
  const dpm = plan({ scheduler: 'dpmpp_2m', steps: 1 })
  assert.deepEqual(dpm.sigmas, [0.999_666_452_407_836_9, 0])
  assert.deepEqual(dpm.timesteps, [999])
  assert.equal(dpm.totalSteps, 1)
})

test('interior img2img uses actual clipped native sigma while preserving the full authored grid', () => {
  const heun = plan({ mode: 'img2img', scheduler: 'heun', strength: 0.5 })
  assert.equal(heun.startStep, 2)
  assert.equal(heun.beginIndex, 4)
  assert.equal(heun.steps, 4)
  assert.equal(heun.totalSteps, 3)
  assert.deepEqual(heun.sigmas, HEUN_SIGMAS.slice(4))
  assert.deepEqual(heun.timesteps, HEUN_TIMESTEPS.slice(4))
  assert.equal(heun.initialSigma, 0.602_150_559_425_354)
  const dpm = plan({ mode: 'img2img', scheduler: 'dpmpp_2m', strength: 0.5 })
  assert.equal(dpm.startStep, 2)
  assert.equal(dpm.beginIndex, 2)
  assert.equal(dpm.totalSteps, 2)
  assert.deepEqual(dpm.sigmas, DPM_SIGMAS.slice(2))
  assert.deepEqual(dpm.timesteps, [749, 499])
  assert.equal(dpm.initialSigma, 0.749_624_788_761_138_9)
  for (const selected of [heun, dpm]) {
    assert.notEqual(selected.initialSigma, 0.75)
    assert.notDeepEqual(selected.sigmas, plan({ scheduler: selected.scheduler, steps: 2 }).sigmas)
  }
})

test('every scheduler preserves full-strength pure diffusion noise and an independent posterior seed', () => {
  for (const scheduler of SCHEDULERS) {
    const text = plan({ scheduler, seed: 123 })
    const image = plan({ mode: 'img2img', scheduler, seed: 123, strength: 1 })
    assert.equal(image.mode, 'img2img')
    assert.equal(image.strength, 1)
    assert.equal(image.initialSigma, 1)
    assert.equal(text.initialSigma, 1)
    assert.equal(image.seed, text.seed)
    assert.equal(text.posteriorSeed, null)
    assert.equal(image.posteriorSeed, 2_654_435_778)
    assert.deepEqual(image.sigmas, text.sigmas)
    assert.deepEqual(image.timesteps, text.timesteps)
    assert.equal(image.totalSteps, text.totalSteps)
    assert.equal(image.beginIndex, 0)
  }
})

test('literal and subprecision zero-evaluation strengths keep only terminal zero for every scheduler', () => {
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
      }
    }
  }
})

test('all authored counts and interior strengths retain exact native suffixes and actual evaluation counts', () => {
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

test('Euler keeps the untouched legacy compiler schedule, clipping, bounds and seed policy', () => {
  for (let steps = 1; steps <= 200; steps += 1) {
    for (const strength of [null, 0, 0.5, 0.8, 1]) {
      const { scheduler: _, ...input } = {
        ...BASE_INPUT,
        mode: strength === null ? 'txt2img' : 'img2img',
        steps,
        strength,
      }
      const legacy = compileAnimaEulerDenoisingPlan(input)
      const current = compileAnimaSamplingPlan({ ...input, scheduler: 'euler' })
      assert.deepEqual(current.sigmas, legacy.sigmas)
      assert.equal(current.startStep, legacy.startStep)
      assert.equal(current.totalSteps, legacy.totalSteps)
      assert.equal(current.posteriorSeed, legacy.posteriorSeed)
      assert.deepEqual(
        current.timesteps,
        legacy.sigmas.slice(0, -1).map((sigma) => sigma * 1000),
      )
    }
  }
})

test('Invoke IEEE strength boundary changes begin indices and evaluations without rounding', () => {
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

test('captured arrays and all plan fields remain detached, frozen and JSON-portable', () => {
  for (const scheduler of SCHEDULERS) {
    const input = { ...BASE_INPUT, mode: 'img2img', scheduler, strength: 0.5 }
    const compiled = compileAnimaSamplingPlan(input)
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
  assert.deepEqual(compileAnimaSamplingPlan(Object.assign(Object.create(null), BASE_INPUT)), plan())
})

test('posterior seed keeps its independent uint32 domain at both seed endpoints', () => {
  for (const scheduler of SCHEDULERS) {
    assert.equal(plan({ scheduler, seed: 0 }).posteriorSeed, null)
    assert.equal(
      plan({ mode: 'img2img', scheduler, seed: 0, strength: 1 }).posteriorSeed,
      2_654_435_769,
    )
    assert.equal(
      plan({ mode: 'img2img', scheduler, seed: 0xff_ff_ff_ff, strength: 0 }).posteriorSeed,
      1_640_531_526,
    )
    assert.equal(plan({ scheduler, seed: 0xff_ff_ff_ff }).seed, 0xff_ff_ff_ff)
  }
})

test('all deterministic schedules are independent of dimensions, seed and CFG', () => {
  for (const scheduler of SCHEDULERS) {
    const baseline = plan({ scheduler })
    const other = plan({
      guidanceScale: 30,
      height: 64,
      scheduler,
      seed: 0xff_ff_ff_ff,
      width: 2048,
    })
    assert.deepEqual(other.sigmas, baseline.sigmas)
    assert.deepEqual(other.timesteps, baseline.timesteps)
  }
})

test('the dimension and pixel envelope accepts endpoints and refuses their neighbors', () => {
  for (const scheduler of SCHEDULERS) {
    assert.equal(plan({ height: 64, scheduler, width: 64 }).width, 64)
    assert.equal(plan({ height: 1952, scheduler, width: 2048 }).height, 1952)
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

test('scalar policy endpoints remain accepted across all three deterministic schedulers', () => {
  for (const scheduler of SCHEDULERS) {
    const minimum = plan({ guidanceScale: 1, scheduler, seed: 0, steps: 1 })
    assert.equal(minimum.guidanceScale, 1)
    assert.equal(minimum.seed, 0)
    assert.equal(minimum.steps, 1)
    const maximum = plan({ guidanceScale: 30, scheduler, seed: 0xff_ff_ff_ff, steps: 200 })
    assert.equal(maximum.guidanceScale, 30)
    assert.equal(maximum.seed, 0xff_ff_ff_ff)
    assert.equal(maximum.steps, 200)
  }
})

test('mode-specific strength never defaults or coerces and unsupported schedulers refuse', () => {
  for (const scheduler of [
    null,
    undefined,
    'Euler',
    'euler_a',
    'dpmpp_2m_sde',
    'er_sde',
    'lcm',
    {},
    0,
  ]) {
    refuses({ ...BASE_INPUT, scheduler })
  }
  for (const mode of [null, undefined, 'inpaint', 'outpaint', 'TXT2IMG', 0]) {
    refuses({ ...BASE_INPUT, mode })
  }
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
})

test('inherited, accessor, symbol, hidden and unsupported input fields refuse without getters', () => {
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
    'cfgRescale',
    'mask',
  ]) {
    refuses({ ...BASE_INPUT, [key]: null })
  }
  let getterCalls = 0
  for (const field of ['scheduler', 'steps']) {
    const accessor = { ...BASE_INPUT }
    Object.defineProperty(accessor, field, {
      get: () => {
        getterCalls += 1
        return 4
      },
    })
    refuses(accessor)
  }
  assert.equal(getterCalls, 0)
  const hidden = { ...BASE_INPUT }
  Object.defineProperty(hidden, 'nativeConfig', { enumerable: false, value: {} })
  refuses(hidden)
  refuses({ ...BASE_INPUT, [Symbol('scheduler')]: 'heun' })
})

for (const field of ['width', 'height', 'steps', 'seed', 'guidanceScale', 'strength']) {
  test(`${field} refuses nonfinite, fractional integer, out-of-envelope and coerced values`, () => {
    const base =
      field === 'strength' ? { ...BASE_INPUT, mode: 'img2img', strength: 0.5 } : BASE_INPUT
    for (const value of [NaN, Infinity, -Infinity, null, undefined, false, '1', 1n]) {
      refuses({ ...base, [field]: value })
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
      refuses({ ...base, [field]: value })
    }
  })
}
