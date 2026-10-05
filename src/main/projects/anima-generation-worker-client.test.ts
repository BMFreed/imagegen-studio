import assert from 'node:assert/strict'
import { readFile, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import { GenerationWorkerClient, GenerationWorkerError } from './generation-worker-client.js'
import { ANIMA_BATCH_READY } from './test-fixtures/anima-batch.js'
import {
  assertNoAnimaDispatchMarker,
  readAnimaDispatchMarker,
  withAnimaDispatchClientFixture,
} from './test-fixtures/anima-dispatch.js'

// Boundary: actual child spawn, command capture, filesystem paths, JSONL parser and confirmed exit.
// The tiny peer controls inference only. No trained models or Python sampling are substituted as proof.
test('real JSONL Anima commands preserve compiled weighting, signed adapter stack and exact native counts in both modes', async () => {
  await withAnimaDispatchClientFixture(async (fixture) => {
    const client = await GenerationWorkerClient.start(fixture.location, {
      environment: { MARKER: fixture.marker },
    })
    try {
      for (const method of ['euler', 'heun', 'dpmpp_2m', 'dpmpp_2m_sde', 'er_sde', 'lcm']) {
        for (const strength of [null, 0, 0.5, 1]) {
          const request = await fixture.request(method, strength)
          const progress: { step: number; totalSteps: number }[] = []
          const response = await client.generate(request, (value) => progress.push(value))
          assert.deepEqual(response, {
            outputPath: request.job.output.pngPath,
            protocolVersion: '1',
            requestId: request.requestId,
            seed: 0,
            type: 'generation-done',
          })
          assert.deepEqual(
            progress,
            Array.from({ length: request.job.sampling.totalSteps }, (_, index) => ({
              step: index + 1,
              totalSteps: request.job.sampling.totalSteps,
            })),
          )
          const wire = (await readAnimaDispatchMarker(fixture)).at(-1)!
          assert.deepEqual(wire, request)
          assert.equal(wire.job.prompts.positive.spans[1].weight, 2)
          assert.equal(wire.job.prompts.negative.spans[0].weight, 0.5)
          assert.deepEqual(
            wire.job.loras.map((entry) => entry.weight),
            [-0.7, 0, 1.2],
          )
        }
      }
    } finally {
      await client.close()
    }
  })
})

test('real transport refuses old or incompletely qualified Anima peers before sending any command', async () => {
  for (const mode of [
    'old',
    'no-anima',
    ...ANIMA_BATCH_READY.capabilities
      .filter((entry) => entry.startsWith('anima-'))
      .map((entry) => `missing-${entry}`),
  ]) {
    await withAnimaDispatchClientFixture(async (fixture) => {
      const client = await GenerationWorkerClient.start(fixture.location, {
        environment: { MARKER: fixture.marker, MODE: mode },
      })
      try {
        await assert.rejects(
          client.generate(await fixture.request()),
          (error) =>
            error instanceof GenerationWorkerError && error.code === 'WORKER_VERSION_MISMATCH',
          mode,
        )
        await assertNoAnimaDispatchMarker(fixture)
      } finally {
        await client.close()
      }
    })
  }
})

test('real Anima transport snapshots caller values before filesystem awaits and refuses corrupt compiled interpretation before wire', async () => {
  await withAnimaDispatchClientFixture(async (fixture) => {
    const client = await GenerationWorkerClient.start(fixture.location, {
      environment: { MARKER: fixture.marker },
    })
    try {
      const request = structuredClone(await fixture.request('heun', 0.5))
      const captured = structuredClone(request)
      const pending = client.generate(request)
      Object.assign(request.job.prompts.positive, { cleanedText: 'later', spans: [] })
      Object.assign(request.job.sampling, { seed: 9, totalSteps: 1 })
      Object.assign(request.job.model.qwen3Encoder, { path: '/tmp/later' })
      await pending
      assert.deepEqual((await readAnimaDispatchMarker(fixture))[0], captured)
      const invalid = structuredClone(await fixture.request())
      Object.assign(invalid.job.sampling, { totalSteps: 3 })
      await assert.rejects(
        client.generate(invalid),
        (error) => error instanceof GenerationWorkerError && error.code === 'INVALID_REQUEST',
      )
      assert.equal((await readAnimaDispatchMarker(fixture)).length, 1)
    } finally {
      await client.close()
    }
  })
})

test('Anima transport checks all three exact file sizes, symlink companions and safe output before wire', async () => {
  for (const role of ['checkpoint', 'qwen3Encoder', 'vae'] as const) {
    await withAnimaDispatchClientFixture(async (fixture) => {
      const client = await GenerationWorkerClient.start(fixture.location, {
        environment: { MARKER: fixture.marker },
      })
      try {
        const request = await fixture.request()
        await writeFile(request.job.model[role].path, 'changed size')
        await assert.rejects(
          client.generate(request),
          (error) => error instanceof GenerationWorkerError && error.code === 'INVALID_PATH',
        )
        await assertNoAnimaDispatchMarker(fixture)
      } finally {
        await client.close()
      }
    })
  }
  await withAnimaDispatchClientFixture(async (fixture) => {
    const client = await GenerationWorkerClient.start(fixture.location, {
      environment: { MARKER: fixture.marker },
    })
    try {
      const request = structuredClone(await fixture.request())
      const alias = path.join(fixture.root, 'qwen-alias')
      await symlink(request.job.model.qwen3Encoder.path, alias)
      Object.assign(request.job.model.qwen3Encoder, { path: alias })
      await assert.rejects(
        client.generate(request),
        (error) => error instanceof GenerationWorkerError && error.code === 'INVALID_PATH',
      )
      await assertNoAnimaDispatchMarker(fixture)
    } finally {
      await client.close()
    }
  })
})

test('exact clipped Anima progress rejects wrong totals, zero-plan progress and crossed ownership at the actual exchange', async () => {
  for (const [mode, strength] of [
    ['wrong-total', 0.5],
    ['changed-total', 0.5],
    ['zero-progress', 0],
    ['crossed-progress', 0.5],
  ] as const) {
    await withAnimaDispatchClientFixture(async (fixture) => {
      const client = await GenerationWorkerClient.start(fixture.location, {
        environment: { MARKER: fixture.marker, MODE: mode },
      })
      const progress: unknown[] = []
      try {
        await assert.rejects(
          client.generate(await fixture.request('heun', strength), (value) => progress.push(value)),
          (error) => error instanceof GenerationWorkerError && error.code === 'PROTOCOL_ERROR',
          mode,
        )
        assert.equal(progress.length, mode === 'changed-total' ? 1 : 0)
      } finally {
        await client.close()
      }
    })
  }
})

test('settled exact Anima progress cannot cross or corrupt a later method and mismatched old totals close the client', async () => {
  await withAnimaDispatchClientFixture(async (fixture) => {
    const client = await GenerationWorkerClient.start(fixture.location, {
      environment: { MARKER: fixture.marker, MODE: 'stale' },
    })
    try {
      await client.generate(await fixture.request('heun'))
      const progress: unknown[] = []
      await client.generate(await fixture.request('euler', 0.5), (value) => progress.push(value))
      assert.deepEqual(progress, [
        { step: 1, totalSteps: 2 },
        { step: 2, totalSteps: 2 },
      ])
    } finally {
      await client.close()
    }
  })
  await withAnimaDispatchClientFixture(async (fixture) => {
    const client = await GenerationWorkerClient.start(fixture.location, {
      environment: { MARKER: fixture.marker, MODE: 'bad-stale' },
    })
    try {
      await client.generate(await fixture.request('heun'))
      await assert.rejects(
        client.generate(await fixture.request('euler', 0.5)),
        (error) => error instanceof GenerationWorkerError && error.code === 'PROTOCOL_ERROR',
      )
    } finally {
      await client.close()
    }
  })
})

test('Anima terminal correlation requires the exact request, output, response kind and uint32 seed', async () => {
  for (const mode of ['wrong-id', 'wrong-output', 'bad-seed', 'wrong-type']) {
    await withAnimaDispatchClientFixture(async (fixture) => {
      const client = await GenerationWorkerClient.start(fixture.location, {
        environment: { MARKER: fixture.marker, MODE: mode },
      })
      try {
        await assert.rejects(
          client.generate(await fixture.request()),
          (error) => error instanceof GenerationWorkerError && error.code === 'PROTOCOL_ERROR',
          mode,
        )
      } finally {
        await client.close()
      }
    })
  }
})

test('Anima complete progress alone times out and active close keeps one request until confirmed child exit', async () => {
  await withAnimaDispatchClientFixture(async (fixture) => {
    const client = await GenerationWorkerClient.start(fixture.location, {
      environment: { MARKER: fixture.marker, MODE: 'complete-without-done' },
      requestTimeoutMs: 80,
    })
    try {
      await assert.rejects(
        client.generate(await fixture.request()),
        (error) => error instanceof GenerationWorkerError && error.code === 'REQUEST_TIMEOUT',
      )
    } finally {
      await client.close()
    }
  })
  await withAnimaDispatchClientFixture(async (fixture) => {
    const client = await GenerationWorkerClient.start(fixture.location, {
      environment: { MARKER: fixture.marker, MODE: 'ignore-sigterm' },
      shutdownWaitMs: 40,
    })
    let observed!: () => void
    const entered = new Promise<void>((resolve) => {
      observed = resolve
    })
    const pending = client.generate(await fixture.request(), () => observed())
    const rejected = assert.rejects(
      pending,
      (error) => error instanceof GenerationWorkerError && error.code === 'CLOSED',
    )
    await entered
    await assert.rejects(
      client.generate(await fixture.request()),
      (error) => error instanceof GenerationWorkerError && error.code === 'BUSY',
    )
    await client.close()
    const pid = Number(await readFile(`${fixture.marker}.pid`, 'utf8'))
    assert.throws(
      () => process.kill(pid, 0),
      (error: unknown) =>
        !!error && typeof error === 'object' && 'code' in error && error.code === 'ESRCH',
    )
    await rejected
    await assert.rejects(
      client.generate(await fixture.request()),
      (error) => error instanceof GenerationWorkerError && error.code === 'CLOSED',
    )
    assert.equal((await readFile(fixture.marker, 'utf8')).trim().split('\n').length, 1)
  })
})
