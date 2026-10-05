import assert from 'node:assert/strict'
import test from 'node:test'

import { AnimaFlowSamplingPlanError } from './anima-flow-sampling-plan.js'
import { AnimaPromptWeightingError } from './anima-prompt-weighting.js'
import {
  AnimaWorkerRequestError,
  type AnimaWorkerRequestInput,
  buildAnimaWorkerRequest,
} from './anima-worker-request.js'
import { IGS_SRGB_ICC_SHA256 } from './color-profile.js'

// Boundary: the actual assembler, both existing compilers and finite peer qualification.
// Neighbors vary one mode/method/seed, file identity, source field or advertisement.
// Mutations must expose wrong routing, lost weighting, seed 0 replacement, shared caller state,
// missing capability gates, malformed envelopes or an oversized UTF-8 protocol line.
const READY = {
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

function input(): AnimaWorkerRequestInput {
  return {
    bbox: { height: 256, width: 256, x: -80, y: 96 },
    loras: [],
    mode: 'txt2img',
    model: {
      architecture: 'anima-base-1.0',
      checkpoint: { byteSize: 100, path: '/models/checkpoint.safetensors', sha256: 'a'.repeat(64) },
      qwen3Encoder: { byteSize: 200, path: '/models/qwen.safetensors', sha256: 'b'.repeat(64) },
      vae: { byteSize: 300, path: '/models/vae.safetensors', sha256: 'c'.repeat(64) },
    },
    output: { pngPath: '/scratch/request/result.png', stagingRoot: '/scratch/request' },
    prompts: { negative: '(bad:0.5)', positive: '𐐀 (cat:2) dog++' },
    requestId: 'anima-0',
    sampling: { guidanceScale: 4.5, scheduler: 'euler', seed: 0, steps: 4, strength: null },
    target: {
      byteSize: 1024,
      height: 256,
      iccSha256: IGS_SRGB_ICC_SHA256,
      path: '/scratch/request/target.png',
      sha256: 'd'.repeat(64),
      width: 256,
    },
  }
}

function invalid(value: unknown): void {
  assert.throws(
    () => buildAnimaWorkerRequest(value, READY),
    (error) => error instanceof AnimaWorkerRequestError && error.code === 'INVALID_REQUEST',
  )
}

test('assembler produces a strict original-Anima command with real compiled Unicode weighting in both signs', () => {
  const source = input()
  const original = structuredClone(source)
  const request = buildAnimaWorkerRequest(source, READY)
  assert.equal(request.type, 'generate-anima-txt2img')
  assert.equal(request.protocolVersion, '1')
  assert.equal(request.requestId, 'anima-0')
  assert.deepEqual(Object.keys(request).sort(), ['job', 'protocolVersion', 'requestId', 'type'])
  assert.deepEqual(Object.keys(request.job).sort(), [
    'bbox',
    'loras',
    'model',
    'output',
    'prompts',
    'sampling',
    'schemaVersion',
    'target',
  ])
  assert.equal(request.job.schemaVersion, 1)
  assert.deepEqual(request.job.prompts.positive, {
    cleanedText: '𐐀 cat dog',
    spans: [
      { end: 2, start: 0, weight: 1 },
      { end: 5, start: 2, weight: 2 },
      { end: 6, start: 5, weight: 1 },
      { end: 9, start: 6, weight: 1.1 ** 2 },
    ],
    version: 'anima-prompt-weighting-v1',
  })
  assert.deepEqual(request.job.prompts.negative, {
    cleanedText: 'bad',
    spans: [{ end: 3, start: 0, weight: 0.5 }],
    version: 'anima-prompt-weighting-v1',
  })
  assert.deepEqual(source, original)
  assert.deepEqual(request.job.model, source.model)
  assert.deepEqual(request.job.bbox, source.bbox)
  assert.deepEqual(request.job.target, source.target)
  assert.equal(request.job.sampling.seed, 0)
  assert.equal(request.job.sampling.stepSeed, 0)
  assert.equal(request.job.sampling.posteriorSeed, null)
  assert.equal(request.job.sampling.version, 'anima-flow-denoising-v1')
  assert.equal(Object.keys(request.job.sampling).length, 17)
})

test('all six methods use their explicit typed plan and both request modes', () => {
  for (const scheduler of ['euler', 'heun', 'dpmpp_2m', 'dpmpp_2m_sde', 'er_sde', 'lcm'] as const) {
    for (const mode of ['txt2img', 'img2img'] as const) {
      const source = {
        ...input(),
        mode,
        sampling: { ...input().sampling, scheduler, strength: mode === 'txt2img' ? null : 0.5 },
      }
      const request = buildAnimaWorkerRequest(source, READY)
      const plan = request.job.sampling
      assert.equal(request.type, `generate-anima-${mode}`)
      assert.equal(plan.mode, mode)
      assert.equal(plan.scheduler, scheduler)
      assert.equal(plan.width, 256)
      assert.equal(plan.height, 256)
      assert.equal(plan.steps, 4)
      assert.equal(plan.strength, source.sampling.strength)
      assert.equal(plan.guidanceScale, 4.5)
      assert.equal(
        plan.totalSteps,
        scheduler === 'heun' ? (mode === 'txt2img' ? 7 : 3) : mode === 'txt2img' ? 4 : 2,
      )
      assert.equal(plan.beginIndex, mode === 'txt2img' ? 0 : scheduler === 'heun' ? 4 : 2)
      assert.equal(plan.posteriorSeed, mode === 'img2img' ? 0x9e_37_79_b9 : null)
      assert.equal(plan.sigmas.at(-1), 0)
    }
  }
})

test('concrete requests get independently compiled seeds, clipped LCM grids and VAE-only strength zero', () => {
  const source = {
    ...input(),
    mode: 'img2img',
    sampling: { ...input().sampling, scheduler: 'lcm', strength: 0.5 },
  }
  const first = buildAnimaWorkerRequest(source, READY)
  const second = buildAnimaWorkerRequest(
    { ...source, sampling: { ...source.sampling, seed: 123 } },
    READY,
  )
  assert.equal(first.job.sampling.stepSeed, 0)
  assert.equal(second.job.sampling.seed, 123)
  assert.equal(second.job.sampling.stepSeed, 123)
  assert.equal(second.job.sampling.posteriorSeed, (123 ^ 0x9e_37_79_b9) >>> 0)
  assert.notEqual(first.job.sampling, second.job.sampling)
  assert.notEqual(first.job.prompts, second.job.prompts)
  assert.deepEqual(first.job.sampling.sigmas, [0.75, 0.5, 0])
  assert.deepEqual(first.job.sampling.timesteps, [750, 500])
  const zero = buildAnimaWorkerRequest(
    { ...source, sampling: { ...source.sampling, strength: 0 } },
    READY,
  )
  assert.equal(zero.type, 'generate-anima-img2img')
  assert.equal(zero.job.sampling.totalSteps, 0)
  assert.deepEqual(zero.job.sampling.timesteps, [])
  assert.deepEqual(zero.job.sampling.sigmas, [0])
})

test('assembler preserves ordered signed and enabled-zero LoRA identities', () => {
  const source = {
    ...input(),
    loras: [
      { byteSize: 400, path: '/models/negative.safetensors', sha256: 'e'.repeat(64), weight: -0.8 },
      { byteSize: 500, path: '/models/zero.safetensors', sha256: 'f'.repeat(64), weight: 0 },
      { byteSize: 600, path: '/models/positive.safetensors', sha256: '1'.repeat(64), weight: 1.2 },
    ],
  }
  assert.deepEqual(buildAnimaWorkerRequest(source, READY).job.loras, source.loras)
})

test('later caller edits cannot change any nested command field or compiled plan', () => {
  const source = {
    ...input(),
    loras: [
      { byteSize: 100, path: '/models/lora.safetensors', sha256: 'f'.repeat(64), weight: -1 },
    ],
  }
  const request = buildAnimaWorkerRequest(source, READY)
  const captured = JSON.stringify(request)
  Object.assign(source, { mode: 'img2img', requestId: 'other' })
  Object.assign(source.bbox, { width: 512, x: 10 })
  Object.assign(source.model.checkpoint, { path: '/other', sha256: '0'.repeat(64) })
  Object.assign(source.target, { byteSize: 10, path: '/other' })
  Object.assign(source.output, { pngPath: '/other', stagingRoot: '/other' })
  Object.assign(source.prompts, { negative: 'other', positive: 'other' })
  Object.assign(source.sampling, { scheduler: 'heun', seed: 123, strength: 1 })
  Object.assign(source.loras[0], { path: '/other', weight: 1 })
  source.loras.push({ ...source.loras[0] })
  assert.equal(JSON.stringify(request), captured)
  for (const object of [
    request,
    request.job,
    request.job.bbox,
    request.job.model,
    request.job.model.checkpoint,
    request.job.model.qwen3Encoder,
    request.job.model.vae,
    request.job.target,
    request.job.output,
    request.job.prompts,
    request.job.prompts.positive,
    request.job.prompts.positive.spans,
    ...request.job.prompts.positive.spans,
    request.job.sampling,
    request.job.sampling.sigmas,
    request.job.sampling.timesteps,
    request.job.loras,
    ...request.job.loras,
  ]) {
    assert.equal(Object.isFrozen(object), true)
  }
})

test('older, future, incomplete or non-CUDA peers cannot produce even a neutral Anima request', () => {
  for (const ready of [
    null,
    undefined,
    true,
    1,
    '0.11.0',
    [],
    { ...READY, workerVersion: '0.10.0' },
    { ...READY, workerVersion: '0.12.0' },
    { ...READY, runtimeProfile: 'cpu' },
    { ...READY, protocolVersion: '2' },
    ...READY.capabilities.map((removed) => ({
      ...READY,
      capabilities: READY.capabilities.filter((value) => value !== removed),
    })),
  ]) {
    assert.throws(
      () => buildAnimaWorkerRequest(input(), ready),
      (error) => error instanceof AnimaWorkerRequestError && error.code === 'INFERENCE_UNAVAILABLE',
    )
  }
})

test('missing, extra, inherited and nonplain top-level fields refuse before compilation', () => {
  for (const key of Object.keys(input())) {
    const omitted = { ...input() } as Record<string, unknown>
    delete omitted[key]
    invalid(omitted)
  }
  for (const value of [
    null,
    [],
    1,
    false,
    'txt2img',
    { ...input(), schemaVersion: 1 },
    { ...input(), [Symbol('extra')]: true },
    Object.create(input()),
    new (class {
      constructor() {
        Object.assign(this, input())
      }
    })(),
  ]) {
    invalid(value)
  }
  assert.equal(
    buildAnimaWorkerRequest(Object.assign(Object.create(null), input()), READY).type,
    'generate-anima-txt2img',
  )
})

test('nested accessor fields and accessor LoRA array entries never execute', () => {
  let reads = 0
  const accessor = {
    negative: '',
    get positive() {
      reads += 1
      return 'cat'
    },
  }
  invalid({ ...input(), prompts: accessor })
  const values: unknown[] = []
  Object.defineProperty(values, '0', {
    configurable: true,
    enumerable: true,
    get() {
      reads += 1
      return {}
    },
  })
  invalid({ ...input(), loras: values })
  invalid({
    ...input(),
    model: {
      ...input().model,
      get checkpoint() {
        reads += 1
        return input().model.checkpoint
      },
    },
  })
  assert.equal(reads, 0)
})

test('neutral or nonneutral SD-only options, alternate architectures and duplicate sampling inputs refuse', () => {
  for (const option of [
    { clipSkip: 1 },
    { cfgRescale: 0 },
    { cfgRescale: 0.5 },
    { vaePrecision: 'Auto' },
    { vaePrecision: 'FP32' },
    { vae: null },
    { embeddings: { negative: [], positive: [] } },
  ]) {
    invalid({ ...input(), ...option })
  }
  invalid({ ...input(), model: { ...input().model, architecture: 'anima-3.8b' } })
  invalid({ ...input(), model: { ...input().model, predictionType: null } })
  invalid({ ...input(), sampling: { ...input().sampling, width: 256 } })
  invalid({ ...input(), sampling: { ...input().sampling, cfgScale: 4.5 } })
  invalid({
    ...input(),
    model: {
      ...input().model,
      checkpoint: { ...input().model.checkpoint, predictionType: 'epsilon' },
    },
  })
})

test('model files, effective LoRAs and output assets must have distinct paths', () => {
  invalid({ ...input(), model: { ...input().model, vae: input().model.qwen3Encoder } })
  invalid({
    ...input(),
    model: {
      ...input().model,
      checkpoint: { ...input().model.checkpoint, path: input().target.path },
    },
  })
  const lora = { ...input().model.checkpoint, path: '/models/lora.safetensors', weight: -0.5 }
  invalid({ ...input(), loras: [lora, { ...lora, weight: 0 }] })
  invalid({ ...input(), loras: [{ ...lora, path: input().model.vae.path }] })
  invalid({ ...input(), loras: [{ ...lora, path: input().target.path }] })
  invalid({ ...input(), loras: [{ ...lora, path: input().output.pngPath }] })
})

test('strict dense LoRA arrays refuse missing entries, subclasses, nonfinite weights and added fields', () => {
  const lora = { ...input().model.checkpoint, path: '/models/lora.safetensors', weight: 0 }
  for (const loras of [
    null,
    {},
    [null],
    Array.from({ length: 1 }),
    new (class extends Array {})(),
    Object.assign([lora], { extra: true }),
    [{ ...lora, weight: Infinity }],
    [{ ...lora, weight: '1' }],
    [{ ...lora, enabled: true }],
  ]) {
    invalid({ ...input(), loras })
  }
})

test('target dimensions and pinned ICC identity must match the selected bbox', () => {
  for (const changed of [
    { width: 512 },
    { height: 512 },
    { iccSha256: 'a'.repeat(64) },
    { byteSize: 0 },
    { byteSize: 32 * 1024 * 1024 + 1 },
  ]) {
    invalid({ ...input(), target: { ...input().target, ...changed } })
  }
  assert.equal(
    buildAnimaWorkerRequest(
      { ...input(), target: { ...input().target, byteSize: 32 * 1024 * 1024 } },
      READY,
    ).job.target.byteSize,
    32 * 1024 * 1024,
  )
})

test('request identity, file hashes, sizes and canonical Unicode paths obey protocol bounds', () => {
  for (const requestId of ['', '.bad', 'a\n', 'a'.repeat(129), 1]) {
    invalid({ ...input(), requestId })
  }
  assert.equal(
    buildAnimaWorkerRequest({ ...input(), requestId: 'A'.repeat(128) }, READY).requestId.length,
    128,
  )
  for (const changed of [
    { sha256: 'A'.repeat(64) },
    { sha256: 'f'.repeat(63) },
    { byteSize: true },
    { byteSize: 0 },
    { byteSize: 1.5 },
    { byteSize: Number.MAX_SAFE_INTEGER + 1 },
    { path: 'models/a' },
    { path: '/models//a' },
    { path: '/models/./a' },
    { path: '/models/../a' },
    { path: '/models/a\0' },
    { path: '/models/a/' },
    { path: '/' },
    { path: '/\uD800' },
    { path: `/${'𐐀'.repeat(4096)}` },
  ]) {
    invalid({
      ...input(),
      model: { ...input().model, checkpoint: { ...input().model.checkpoint, ...changed } },
    })
  }
  const request = buildAnimaWorkerRequest(
    {
      ...input(),
      model: {
        ...input().model,
        checkpoint: {
          ...input().model.checkpoint,
          byteSize: Number.MAX_SAFE_INTEGER,
          path: `/${'𐐀'.repeat(4095)}`,
        },
      },
    },
    READY,
  )
  assert.equal(Array.from(request.job.model.checkpoint.path).length, 4096)
  assert.equal(request.job.model.checkpoint.byteSize, Number.MAX_SAFE_INTEGER)
})

test('target and result filenames are distinct direct children of the one captured staging root', () => {
  for (const changed of [
    { pngPath: '/scratch/request/target.png' },
    { pngPath: '/scratch/request/other.jpg' },
    { pngPath: '/scratch/request/child/result.png' },
    { stagingRoot: '/scratch/other' },
    { stagingRoot: '/scratch/request/' },
  ]) {
    invalid({ ...input(), output: { ...input().output, ...changed } })
  }
  invalid({ ...input(), target: { ...input().target, path: '/scratch/request/other.jpg' } })
  const alternateInput = {
    ...input(),
    output: { ...input().output, pngPath: '/scratch/request/generated-42.png' },
    target: { ...input().target, path: '/scratch/request/source-42.png' },
  }
  assert.doesNotThrow(() => buildAnimaWorkerRequest(alternateInput, READY))
  const alternate = buildAnimaWorkerRequest(alternateInput, READY)
  assert.equal(alternate.job.target.path, '/scratch/request/source-42.png')
  assert.equal(alternate.job.output.pngPath, '/scratch/request/generated-42.png')
})

test('both staging PNG roles reject extension-only basenames and preserve valid hidden and ordinary neighbors', () => {
  for (const role of ['target', 'output'] as const) {
    const withName = (name: string): AnimaWorkerRequestInput => {
      const source = input()
      return role === 'target'
        ? { ...source, target: { ...source.target, path: `/scratch/request/${name}` } }
        : { ...source, output: { ...source.output, pngPath: `/scratch/request/${name}` } }
    }
    invalid(withName('.png'))
    for (const name of ['.source.png', '..png', 'canvas.png']) {
      const source = withName(name)
      assert.doesNotThrow(() => buildAnimaWorkerRequest(source, READY))
      const request = buildAnimaWorkerRequest(source, READY)
      assert.equal(
        role === 'target' ? request.job.target.path : request.job.output.pngPath,
        `/scratch/request/${name}`,
      )
    }
  }
})

test('bbox coordinates remain signed-int32 bounded while the plan compiler owns aligned geometry', () => {
  for (const changed of [{ x: -2_147_483_648 }, { y: 2_147_483_648 }, { x: 1.5 }, { y: NaN }]) {
    invalid({ ...input(), bbox: { ...input().bbox, ...changed } })
  }
  assert.equal(
    buildAnimaWorkerRequest(
      { ...input(), bbox: { ...input().bbox, x: -2_147_483_647, y: 2_147_483_647 } },
      READY,
    ).job.bbox.x,
    -2_147_483_647,
  )
  for (const changed of [
    { width: 56 },
    { height: 257 },
    { width: 2056 },
    { height: 2048, width: 2048 },
  ]) {
    assert.throws(
      () =>
        buildAnimaWorkerRequest(
          {
            ...input(),
            bbox: { ...input().bbox, ...changed },
            target: { ...input().target, ...changed },
          },
          READY,
        ),
      AnimaFlowSamplingPlanError,
    )
  }
})

test('the authoritative flow compiler rejects wrong seed, method, scalar or mode-strength interpretation', () => {
  for (const changed of [
    { seed: -1 },
    { seed: 2 ** 32 },
    { seed: true },
    { seed: 1.5 },
    { steps: 201 },
    { guidanceScale: 0 },
    { guidanceScale: Infinity },
    { scheduler: 'euler_a' },
    { strength: 0 },
  ]) {
    assert.throws(
      () =>
        buildAnimaWorkerRequest(
          { ...input(), sampling: { ...input().sampling, ...changed } },
          READY,
        ),
      AnimaFlowSamplingPlanError,
    )
  }
  for (const strength of [null, -0.1, 1.1, true]) {
    assert.throws(
      () =>
        buildAnimaWorkerRequest(
          { ...input(), mode: 'img2img', sampling: { ...input().sampling, strength } },
          READY,
        ),
      AnimaFlowSamplingPlanError,
    )
  }
  invalid({ ...input(), mode: 'outpaint' })
})

test('real prompt compiler refuses unsupported text without dropping or truncating attention', () => {
  for (const positive of [
    '(cat:abc)',
    '<embedding>',
    '{cat|dog}',
    'cat.swap(dog)',
    '\uD800',
    'a'.repeat(16_385),
    '𐐀'.repeat(4097),
  ]) {
    assert.throws(
      () => buildAnimaWorkerRequest({ ...input(), prompts: { negative: '', positive } }, READY),
      AnimaPromptWeightingError,
    )
  }
  const maximum = buildAnimaWorkerRequest(
    { ...input(), prompts: { negative: '', positive: '𐐀'.repeat(4096) } },
    READY,
  )
  assert.equal(new TextEncoder().encode(maximum.job.prompts.positive.cleanedText).length, 16_384)
  assert.equal(maximum.job.prompts.positive.spans[0].end, 4096)
  invalid({ ...input(), prompts: { negative: '', positive: 1 } })
})

test('aggregate compiled-span size obeys the unchanged 64 KiB JSONL ceiling including its newline', () => {
  const valid = buildAnimaWorkerRequest(input(), READY)
  const shortSize = new TextEncoder().encode(`${JSON.stringify(valid)}\n`).length
  assert.ok(shortSize < 64 * 1024)
  const noisyText = 'a+ b '.repeat(2500)
  assert.ok(new TextEncoder().encode(noisyText).length < 16_384)
  invalid({ ...input(), prompts: { negative: '', positive: noisyText } })
  const lora = { ...input().model.checkpoint, weight: 0 }
  invalid({
    ...input(),
    loras: Array.from({ length: 6 }, (_, index) => ({
      ...lora,
      path: `/models/${index}/${'𐐀'.repeat(3000)}`,
    })),
  })
  const crowded = {
    ...input(),
    loras: Array.from({ length: 100 }, (_, index) => ({
      ...lora,
      path: `/models/${index}/${'p'.repeat(450)}`,
    })),
  }
  const base = buildAnimaWorkerRequest(crowded, READY)
  const remaining = 64 * 1024 - new TextEncoder().encode(`${JSON.stringify(base)}\n`).length
  assert.ok(remaining > 0 && remaining < 16_000)
  let acceptedLength = 0
  let refusedLength = 16_384
  let previous: ReturnType<typeof buildAnimaWorkerRequest> | null = null
  while (refusedLength - acceptedLength > 1) {
    const length = Math.floor((acceptedLength + refusedLength) / 2)
    try {
      const request = buildAnimaWorkerRequest(
        {
          ...crowded,
          prompts: { ...crowded.prompts, positive: 'x'.repeat(length) },
        },
        READY,
      )
      assert.ok(new TextEncoder().encode(`${JSON.stringify(request)}\n`).length <= 64 * 1024)
      previous = request
      acceptedLength = length
    } catch (error) {
      assert.ok(error instanceof AnimaWorkerRequestError && error.code === 'INVALID_REQUEST')
      refusedLength = length
    }
  }
  assert.ok(previous)
  assert.equal(new TextEncoder().encode(`${JSON.stringify(previous)}\n`).length, 64 * 1024)
  invalid({ ...crowded, prompts: { ...crowded.prompts, positive: 'x'.repeat(refusedLength) } })
})
