import assert from 'node:assert/strict'
import test from 'node:test'

import { ANIMA_BATCH_READY } from '../../main/projects/test-fixtures/anima-batch.js'
import {
  AnimaWorkerRequestError,
  buildAnimaWorkerRequest,
  captureCompiledAnimaWorkerRequest,
} from './anima-worker-request.js'
import { IGS_SRGB_ICC_SHA256 } from './color-profile.js'

function request(scheduler = 'heun', strength: number | null = null) {
  return buildAnimaWorkerRequest(
    {
      bbox: { height: 64, width: 64, x: -80, y: 96 },
      loras: [{ byteSize: 1, path: '/models/lora', sha256: 'e'.repeat(64), weight: -0.7 }],
      mode: strength === null ? 'txt2img' : 'img2img',
      model: {
        architecture: 'anima-base-1.0',
        checkpoint: { byteSize: 1, path: '/models/checkpoint', sha256: 'a'.repeat(64) },
        qwen3Encoder: { byteSize: 2, path: '/models/qwen', sha256: 'b'.repeat(64) },
        vae: { byteSize: 3, path: '/models/vae', sha256: 'c'.repeat(64) },
      },
      output: { pngPath: '/scratch/request/result.png', stagingRoot: '/scratch/request' },
      prompts: { negative: '(bad:0.5)', positive: '𐐀 (cat:2) dog++' },
      requestId: 'compiled-anima',
      sampling: { guidanceScale: 4.5, scheduler, seed: 0, steps: 3, strength },
      target: {
        byteSize: 1024,
        height: 64,
        iccSha256: IGS_SRGB_ICC_SHA256,
        path: '/scratch/request/target.png',
        sha256: 'd'.repeat(64),
        width: 64,
      },
    },
    ANIMA_BATCH_READY,
  )
}

// Boundary: actual wire capturer, not a locally redeclared predicate. Recomputed six-method plans
// and canonical Unicode spans retain compiled attention and reject coherent-looking corruption.
test('compiled command capture preserves both weighted signs and canonical native plans across every method and clipping', () => {
  for (const method of ['euler', 'heun', 'dpmpp_2m', 'dpmpp_2m_sde', 'er_sde', 'lcm']) {
    for (const strength of [null, 0, 0.5, 1]) {
      const source = structuredClone(request(method, strength))
      const captured = captureCompiledAnimaWorkerRequest(source, ANIMA_BATCH_READY)
      assert.deepEqual(captured, source)
      assert.notEqual(captured, source)
      assert.equal(captured.job.prompts.positive.spans[1].weight, 2)
      assert.equal(captured.job.prompts.negative.spans[0].weight, 0.5)
      assert.equal(
        captured.job.sampling.totalSteps,
        strength === 0
          ? 0
          : method === 'heun'
            ? strength === 0.5
              ? 3
              : 5
            : strength === 0.5
              ? 2
              : 3,
      )
      Object.assign(source.job.prompts.positive, { spans: [] })
      assert.equal(captured.job.prompts.positive.spans.length, 4)
      assert.ok(Object.isFrozen(captured.job.sampling.timesteps))
      assert.ok(Object.isFrozen(captured.job.prompts.positive.spans[0]))
    }
  }
})

test('compiled command capture rejects changed full native interpretation even when scalar policy stays valid', () => {
  for (const key of [
    'totalSteps',
    'beginIndex',
    'startStep',
    'stepSeed',
    'posteriorSeed',
    'initialSigma',
    'version',
    'mode',
    'height',
  ]) {
    const source = structuredClone(request('heun', 0.5))
    Object.assign(source.job.sampling, {
      [key]: key === 'version' ? 'other' : key === 'mode' ? 'txt2img' : 99,
    })
    assert.throws(
      () => captureCompiledAnimaWorkerRequest(source, ANIMA_BATCH_READY),
      AnimaWorkerRequestError,
      key,
    )
  }
  for (const array of ['sigmas', 'timesteps'] as const) {
    const source = structuredClone(request('heun', 0.5))
    Object.assign(source.job.sampling, { [array]: [0] })
    assert.throws(
      () => captureCompiledAnimaWorkerRequest(source, ANIMA_BATCH_READY),
      AnimaWorkerRequestError,
    )
  }
  const neighbor = request('heun', 0.5)
  assert.equal(
    captureCompiledAnimaWorkerRequest(neighbor, ANIMA_BATCH_READY).job.sampling.totalSteps,
    3,
  )
})

test('compiled spans reject UTF16 offsets, gaps, overlaps, nonfinite or uncoalesced weights, version and invalid Unicode', () => {
  for (const change of [
    { spans: [{ end: 10, start: 0, weight: 1 }] },
    { spans: [{ end: 9, start: 1, weight: 2 }] },
    {
      spans: [
        { end: 5, start: 0, weight: 2 },
        { end: 9, start: 4, weight: 1 },
      ],
    },
    { spans: [{ end: 9, start: 0, weight: Number.NaN }] },
    {
      spans: [
        { end: 5, start: 0, weight: 2 },
        { end: 9, start: 5, weight: 2 },
      ],
    },
    { spans: [] },
    { version: 'other' },
    { cleanedText: '\uD800', spans: [{ end: 1, start: 0, weight: 2 }] },
  ]) {
    const source = structuredClone(request())
    Object.assign(source.job.prompts.positive, change)
    assert.throws(
      () => captureCompiledAnimaWorkerRequest(source, ANIMA_BATCH_READY),
      AnimaWorkerRequestError,
    )
  }
  const empty = structuredClone(request())
  Object.assign(empty.job.prompts.negative, { cleanedText: '', spans: [] })
  assert.equal(
    captureCompiledAnimaWorkerRequest(empty, ANIMA_BATCH_READY).job.prompts.negative.cleanedText,
    '',
  )
})

test('compiled capture refuses unsupported plain fields and accessors without invoking them', () => {
  const source = structuredClone(request())
  let calls = 0
  Object.defineProperty(source.job.sampling, 'seed', {
    enumerable: true,
    get: () => {
      calls++
      return 0
    },
  })
  assert.throws(
    () => captureCompiledAnimaWorkerRequest(source, ANIMA_BATCH_READY),
    AnimaWorkerRequestError,
  )
  assert.equal(calls, 0)
  const extra = { ...request(), unexpected: true }
  assert.throws(
    () => captureCompiledAnimaWorkerRequest(extra, ANIMA_BATCH_READY),
    AnimaWorkerRequestError,
  )
})

test('compiled capture enforces the actual weighted final UTF8 line ceiling and current complete peer support', () => {
  const source = structuredClone(request())
  Object.assign(source.job.prompts.positive, {
    cleanedText: 'x'.repeat(2048),
    spans: Array.from({ length: 2048 }, (_, index) => ({
      end: index + 1,
      start: index,
      weight: index % 2,
    })),
  })
  assert.throws(() => captureCompiledAnimaWorkerRequest(source, ANIMA_BATCH_READY), /64 KiB/)
  for (const capability of ANIMA_BATCH_READY.capabilities.filter((entry) =>
    entry.startsWith('anima-'),
  )) {
    assert.throws(
      () =>
        captureCompiledAnimaWorkerRequest(request(), {
          ...ANIMA_BATCH_READY,
          capabilities: ANIMA_BATCH_READY.capabilities.filter((entry) => entry !== capability),
        }),
      (error) => error instanceof AnimaWorkerRequestError && error.code === 'INFERENCE_UNAVAILABLE',
    )
  }
  assert.deepEqual(captureCompiledAnimaWorkerRequest(request(), ANIMA_BATCH_READY), request())
})
