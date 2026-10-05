import assert from 'node:assert/strict'
import test from 'node:test'

import { isProjectGenerationDraftChange } from '../api.js'
import {
  type AnimaFlowScheduler,
  compileAnimaFlowSamplingPlan,
} from './anima-flow-sampling-plan.js'
import {
  ANIMA_SAMPLING_METHOD_KEYS,
  ANIMA_SAMPLING_METHOD_OPTIONS,
  type AnimaSamplingMethod,
  isAnimaSamplingMethod,
} from './anima-sampling-method.js'

test('authoring registry is exactly the six existing native methods and compiles each real plan', () => {
  // Keep the prototype registry independent of native execution dependencies while
  // checking both directions of the authoritative native type at the app boundary.
  const sameNativeType: [AnimaFlowScheduler] extends [AnimaSamplingMethod]
    ? [AnimaSamplingMethod] extends [AnimaFlowScheduler]
      ? true
      : never
    : never = true
  assert.equal(sameNativeType, true)
  assert.deepEqual(ANIMA_SAMPLING_METHOD_OPTIONS, [
    { label: 'Euler', value: 'euler' },
    { label: 'Heun', value: 'heun' },
    { label: 'DPM++ 2M', value: 'dpmpp_2m' },
    { label: 'DPM++ 2M SDE', value: 'dpmpp_2m_sde' },
    { label: 'ER-SDE', value: 'er_sde' },
    { label: 'LCM', value: 'lcm' },
  ])
  for (const method of ANIMA_SAMPLING_METHOD_KEYS) {
    assert.ok(isAnimaSamplingMethod(method))
    assert.ok(isProjectGenerationDraftChange({ kind: 'anima-method', value: method }))
    const plan = compileAnimaFlowSamplingPlan({
      guidanceScale: 4,
      height: 64,
      mode: 'txt2img',
      scheduler: method,
      seed: 0,
      steps: 5,
      strength: null,
      width: 64,
    })
    assert.equal(plan.scheduler, method)
    assert.equal(plan.seed, 0)
  }
})

test('native IPC clear is explicit and aliases, future keys, primitives and extra fields refuse', () => {
  assert.ok(isProjectGenerationDraftChange({ kind: 'anima-method', value: null }))
  for (const value of [
    undefined,
    '',
    'Euler',
    'euler_a',
    'turbo',
    'constructor',
    '__proto__',
    0,
    true,
    [],
    {},
  ]) {
    assert.equal(isAnimaSamplingMethod(value), false)
    assert.equal(isProjectGenerationDraftChange({ kind: 'anima-method', value }), false)
  }
  for (const value of [
    { kind: 'anima-method' },
    { kind: 'anima-method', modelFamily: 'anima', value: 'euler' },
    { kind: 'anima-method', sampler: 'Euler', value: 'euler' },
  ]) {
    assert.equal(isProjectGenerationDraftChange(value), false)
  }
  assert.ok(
    isProjectGenerationDraftChange({
      kind: 'sampling-pair',
      sampler: 'Euler a',
      scheduler: 'Normal',
    }),
  )
})
