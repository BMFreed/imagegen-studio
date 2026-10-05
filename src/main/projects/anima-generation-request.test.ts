import type { AnimaWorkerRequest } from '../../shared/projects/anima-worker-request.js'

import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { lstat, readdir, readFile, symlink, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import { prepareAnimaGenerationBatch } from './anima-generation-batch.js'
import { withAnimaGenerationBatchRequests } from './anima-generation-request.js'
import {
  ANIMA_BATCH_READY,
  animaFixturePng,
  animaFixtureSha256,
  withAnimaBatchFixture,
} from './test-fixtures/anima-batch.js'

// Boundary: exact target bytes + real PNG/profile/alpha validation, immutable worker compiler,
// peer qualification and owned filesystem lease. Model registry/header qualification is supplied
// by an explicit resolver double here and remains covered by separate real-service integration.
// Invariant: the consumer sees all validated concrete commands, or none; callback failure removes
// only owned stage files. Neighbors vary one capability, target property, item or late resource.
// Semantic mutations: invoke the consumer on a valid prefix, omit final file recheck or remove
// cleanup. Tests are expected to distinguish those changes from valid neighboring requests.

test('Anima scoped batch leases an exact private target and distinct frozen worker commands, then cleans only its stage', async () => {
  await withAnimaBatchFixture(async ({ files, modelService, prepared, root, scratch }) => {
    const sentinel = path.join(scratch, 'keep.txt')
    await writeFile(sentinel, 'outside owned lease')
    const batch = prepareAnimaGenerationBatch({ iterations: 2, prepared })
    let requests: readonly AnimaWorkerRequest[] = []
    const result = await withAnimaGenerationBatchRequests({
      modelService,
      prepared: batch,
      ready: ANIMA_BATCH_READY,
      scratchBasePath: scratch,
      use: async (value) => {
        requests = value
        assert.equal(value.length, 8)
        assert.equal(new Set(value.map((item) => item.requestId)).size, 8)
        assert.equal(new Set(value.map((item) => item.job.output.pngPath)).size, 8)
        assert.equal(new Set(value.map((item) => item.job.target.path)).size, 1)
        const first = value[0]
        assert.equal((await lstat(first.job.output.stagingRoot)).mode & 0o777, 0o700)
        assert.equal((await lstat(first.job.target.path)).mode & 0o777, 0o600)
        assert.ok((await readFile(first.job.target.path)).equals(batch.targetPngBytes))
        for (const [index, item] of value.entries()) {
          assert.equal(path.dirname(item.job.target.path), item.job.output.stagingRoot)
          assert.equal(path.dirname(item.job.output.pngPath), item.job.output.stagingRoot)
          assert.notEqual(item.job.target.path, item.job.output.pngPath)
          assert.equal(item.type, 'generate-anima-txt2img')
          assert.deepEqual(item.job.prompts, batch.items[index].compiledPrompts)
          assert.deepEqual(item.job.sampling, batch.items[index].samplingPlan)
          assert.deepEqual(
            item.job.loras.map((lora) => lora.weight),
            [-0.7, 0, 1.2],
          )
          assert.deepEqual(
            item.job.loras.map((lora) => lora.path),
            batch.context.loras.map((lora) => lora.managedPath),
          )
          assert.ok(Object.isFrozen(item.job.model.checkpoint))
          assert.ok(Object.isFrozen(item.job.prompts.negative.spans))
          await writeFile(item.job.output.pngPath, `provisional result ${index}`, { flag: 'wx' })
        }
        assert.ok(first.job.output.stagingRoot.startsWith(`${root}${path.sep}`))
        return 'consumed'
      },
    })
    assert.equal(result, 'consumed')
    assert.ok(!existsSync(requests[0].job.output.stagingRoot))
    assert.equal(await readFile(sentinel, 'utf8'), 'outside owned lease')
    for (const [filePath, bytes] of files) {
      assert.ok((await readFile(filePath)).equals(bytes))
    }
  })
})

test('Anima callback failure removes target and outputs while preserving neighboring files', async () => {
  await withAnimaBatchFixture(async ({ files, modelService, prepared, scratch }) => {
    const sentinel = path.join(scratch, 'retained.png')
    await writeFile(sentinel, 'retained user target')
    let stage = ''
    await assert.rejects(
      withAnimaGenerationBatchRequests({
        modelService,
        prepared: prepareAnimaGenerationBatch({ iterations: 1, prepared }),
        ready: ANIMA_BATCH_READY,
        scratchBasePath: scratch,
        use: async (requests) => {
          stage = requests[0].job.output.stagingRoot
          await writeFile(requests[0].job.output.pngPath, 'partial result', { flag: 'wx' })
          throw new Error('consumer failed')
        },
      }),
      /consumer failed/,
    )
    assert.ok(!existsSync(stage))
    assert.equal(await readFile(sentinel, 'utf8'), 'retained user target')
    assert.deepEqual(await readdir(scratch), ['retained.png'])
    for (const [filePath, bytes] of files) {
      assert.ok((await readFile(filePath)).equals(bytes))
    }
  })
})

test('Anima request captures target bytes and peer advertisement before an awaited verification', async () => {
  await withAnimaBatchFixture(async ({ modelService, prepared, scratch }) => {
    const batch = prepareAnimaGenerationBatch({ iterations: 2, prepared })
    const originalBytes = Buffer.from(batch.targetPngBytes)
    const ready = structuredClone(ANIMA_BATCH_READY)
    let entered!: () => void
    const entry = new Promise<void>((resolve) => {
      entered = resolve
    })
    let release!: () => void
    const barrier = new Promise<void>((resolve) => {
      release = resolve
    })
    let first = true
    const operation = withAnimaGenerationBatchRequests({
      modelService: {
        ...modelService,
        resolveVerifiedGenerationAnimaBundleForPlan: async (reference) => {
          if (first) {
            first = false
            entered()
            await barrier
          }
          return await modelService.resolveVerifiedGenerationAnimaBundleForPlan(reference)
        },
      },
      prepared: batch,
      ready,
      scratchBasePath: scratch,
      use: async (requests) => {
        assert.equal(requests.length, 8)
        assert.equal(requests[0].job.sampling.seed, 0)
        assert.ok((await readFile(requests[0].job.target.path)).equals(originalBytes))
        return 'captured'
      },
    })
    await entry
    batch.targetPngBytes.fill(0)
    ready.capabilities.length = 0
    ready.workerVersion = '0.10.0'
    release()
    assert.equal(await operation, 'captured')
    assert.deepEqual(await readdir(scratch), [])
  })
})

test('Anima refuses all missing five Anima capabilities and legacy peers before a consumer or lease', async () => {
  await withAnimaBatchFixture(async ({ modelService, prepared, scratch }) => {
    const batch = prepareAnimaGenerationBatch({ iterations: 1, prepared })
    for (const capability of ANIMA_BATCH_READY.capabilities.filter((value) =>
      value.startsWith('anima-'),
    )) {
      let called = false
      await assert.rejects(
        withAnimaGenerationBatchRequests({
          modelService,
          prepared: batch,
          ready: {
            ...ANIMA_BATCH_READY,
            capabilities: ANIMA_BATCH_READY.capabilities.filter((value) => value !== capability),
          },
          scratchBasePath: scratch,
          use: async () => {
            called = true
          },
        }),
        { code: 'INFERENCE_UNAVAILABLE' },
      )
      assert.equal(called, false)
      assert.deepEqual(await readdir(scratch), [])
    }
    await assert.rejects(
      withAnimaGenerationBatchRequests({
        modelService,
        prepared: batch,
        ready: { ...ANIMA_BATCH_READY, workerVersion: '0.10.0' },
        scratchBasePath: scratch,
        use: async () => assert.fail('legacy peer cannot reach consumer'),
      }),
      { code: 'INFERENCE_UNAVAILABLE' },
    )
  })
})

test('Anima rebuilds supplied items and refuses omitted, reordered or altered plans atomically', async () => {
  await withAnimaBatchFixture(async ({ modelService, prepared, scratch }) => {
    const batch = prepareAnimaGenerationBatch({ iterations: 2, prepared })
    for (const mutation of ['omit', 'reverse', 'seed', 'weight', 'plan', 'truncated'] as const) {
      const forged = {
        ...structuredClone(batch),
        targetPngBytes: Buffer.from(batch.targetPngBytes),
      }
      const items = [...forged.items]
      if (mutation === 'omit') {
        items.pop()
      }
      if (mutation === 'reverse') {
        items.reverse()
      }
      if (mutation === 'seed') {
        items[0] = { ...items[0], seed: 123 }
      }
      if (mutation === 'weight') {
        items[0] = {
          ...items[0],
          compiledPrompts: {
            ...items[0].compiledPrompts,
            negative: { ...items[0].compiledPrompts.negative, spans: [] },
          },
        }
      }
      if (mutation === 'plan') {
        items[0] = { ...items[0], samplingPlan: { ...items[0].samplingPlan, stepSeed: 123 } }
      }
      const changed = {
        ...forged,
        items,
        truncated: mutation === 'truncated' ? !forged.truncated : forged.truncated,
      }
      await assert.rejects(
        withAnimaGenerationBatchRequests({
          modelService,
          prepared: changed,
          ready: ANIMA_BATCH_READY,
          scratchBasePath: scratch,
          use: async () => assert.fail('a forged batch cannot reach consumer'),
        }),
        { code: 'GENERATION_INPUT_CHANGED' },
      )
      assert.deepEqual(await readdir(scratch), [])
    }
  })
})

test('Anima validates every full escaped worker line before invoking a valid batch prefix', async () => {
  await withAnimaBatchFixture(async ({ modelService, prepared, scratch }) => {
    prepared.context.prompts.positive = `{short|${'(x:2)y'.repeat(1400)}}`
    prepared.context.generationDraft.positivePrompt.text = prepared.context.prompts.positive
    prepared.context.prompts.negative = ''
    prepared.context.generationDraft.negativePrompt.text = ''
    const batch = prepareAnimaGenerationBatch({ iterations: 1, prepared })
    assert.equal(batch.items.length, 2)
    assert.equal(batch.items[0].compiledPrompts.positive.cleanedText, 'short')
    assert.ok(Buffer.byteLength(JSON.stringify(batch.items[1].compiledPrompts)) > 64 * 1024)
    let called = false
    await assert.rejects(
      withAnimaGenerationBatchRequests({
        modelService,
        prepared: batch,
        ready: ANIMA_BATCH_READY,
        scratchBasePath: scratch,
        use: async () => {
          called = true
        },
      }),
      { code: 'INVALID_REQUEST' },
    )
    assert.equal(called, false)
    assert.deepEqual(await readdir(scratch), [])
    // Neighbor: the same authored source with an explicit one-pair prefix remains valid.
    prepared.context.dynamic.maxPrompts = 1
    prepared.context.generationDraft.dynamicPrompt!.maxPrompts = 1
    await withAnimaGenerationBatchRequests({
      modelService,
      prepared: prepareAnimaGenerationBatch({ iterations: 1, prepared }),
      ready: ANIMA_BATCH_READY,
      scratchBasePath: scratch,
      use: async (requests) => assert.equal(requests.length, 1),
    })
  })
})

test('Anima checks actual embedded profile and alpha rather than a matching metadata label', async () => {
  await withAnimaBatchFixture(async ({ modelService, prepared, scratch }) => {
    prepared.targetPngBytes = await animaFixturePng(0, Buffer.from('a different ICC profile'))
    prepared.context.target.byteSize = prepared.targetPngBytes.length
    prepared.context.target.sha256 = animaFixtureSha256(prepared.targetPngBytes)
    const batch = prepareAnimaGenerationBatch({ iterations: 1, prepared })
    await assert.rejects(
      withAnimaGenerationBatchRequests({
        modelService,
        prepared: batch,
        ready: ANIMA_BATCH_READY,
        scratchBasePath: scratch,
        use: async () => assert.fail('wrong embedded profile cannot reach consumer'),
      }),
    )
    assert.deepEqual(await readdir(scratch), [])
    const tagged = await animaFixturePng(0)
    const chunks = [tagged.subarray(0, 8)]
    for (let offset = 8; offset < tagged.length;) {
      const next = offset + tagged.readUInt32BE(offset) + 12
      if (tagged.toString('ascii', offset + 4, offset + 8) !== 'iCCP') {
        chunks.push(tagged.subarray(offset, next))
      }
      offset = next
    }
    prepared.targetPngBytes = Buffer.concat(chunks)
    prepared.context.target.byteSize = prepared.targetPngBytes.length
    prepared.context.target.sha256 = animaFixtureSha256(prepared.targetPngBytes)
    assert.throws(() => prepareAnimaGenerationBatch({ iterations: 1, prepared }), {
      code: 'GENERATION_TARGET_CHANGED',
    })
    for (const alpha of [128, 255]) {
      prepared.targetPngBytes = await animaFixturePng(alpha)
      prepared.context.target.byteSize = prepared.targetPngBytes.length
      prepared.context.target.sha256 = animaFixtureSha256(prepared.targetPngBytes)
      assert.throws(() => prepareAnimaGenerationBatch({ iterations: 1, prepared }), {
        code: 'GENERATION_TARGET_CHANGED',
      })
    }
  })
})

test('Anima reverifies bundle and ordered LoRA identities across materialization awaits', async () => {
  await withAnimaBatchFixture(async ({ modelService, prepared, scratch }) => {
    const batch = prepareAnimaGenerationBatch({ iterations: 1, prepared })
    for (const changed of ['qwen', 'vae', 'lora'] as const) {
      let bundleCalls = 0
      const drifting = {
        ...modelService,
        resolveVerifiedAnimaGenerationLoraForPlan: async (
          reference: Parameters<typeof modelService.resolveVerifiedAnimaGenerationLoraForPlan>[0],
        ) => {
          const actual = await modelService.resolveVerifiedAnimaGenerationLoraForPlan(reference)
          return changed === 'lora' && bundleCalls >= 2
            ? { ...actual, managedPath: `${actual.managedPath}.changed` }
            : actual
        },
        resolveVerifiedGenerationAnimaBundleForPlan: async (
          reference: Parameters<typeof modelService.resolveVerifiedGenerationAnimaBundleForPlan>[0],
        ) => {
          bundleCalls++
          const actual = await modelService.resolveVerifiedGenerationAnimaBundleForPlan(reference)
          if (bundleCalls >= 2 && changed !== 'lora') {
            const key = changed === 'qwen' ? 'qwen3Encoder' : 'vae'
            actual[key].localVersionId = 'changed-local-version'
          }
          return actual
        },
      }
      await assert.rejects(
        withAnimaGenerationBatchRequests({
          modelService: drifting,
          prepared: batch,
          ready: ANIMA_BATCH_READY,
          scratchBasePath: scratch,
          use: async () => assert.fail('late changed identity cannot reach consumer'),
        }),
        { code: 'GENERATION_RESOURCE_CHANGED' },
      )
      assert.equal(bundleCalls, 2)
      assert.deepEqual(await readdir(scratch), [])
    }
  })
})

test('Anima rejects target mutation or symlink replacement during the final resource await', async () => {
  await withAnimaBatchFixture(async ({ files, modelService, prepared, scratch }) => {
    const batch = prepareAnimaGenerationBatch({ iterations: 1, prepared })
    // The growth neighbor replaces the file before this reader starts. It does not claim to
    // reproduce concurrent growth between the reader's stat and its explicitly bounded reads.
    for (const mutation of ['bytes', 'growth', 'symlink'] as const) {
      let calls = 0
      const changing = {
        ...modelService,
        resolveVerifiedGenerationAnimaBundleForPlan: async (
          reference: Parameters<typeof modelService.resolveVerifiedGenerationAnimaBundleForPlan>[0],
        ) => {
          const actual = await modelService.resolveVerifiedGenerationAnimaBundleForPlan(reference)
          calls++
          if (calls === 2) {
            const [stageName] = await readdir(scratch)
            const targetPath = path.join(scratch, stageName, 'target.png')
            if (mutation === 'bytes') {
              const changed = Buffer.from(batch.targetPngBytes)
              changed[changed.length - 1] ^= 1
              await writeFile(targetPath, changed)
            } else if (mutation === 'growth') {
              await writeFile(targetPath, Buffer.concat([batch.targetPngBytes, Buffer.alloc(1)]))
            } else {
              await unlink(targetPath)
              await symlink(actual.checkpoint.managedPath, targetPath)
            }
          }
          return actual
        },
      }
      await assert.rejects(
        withAnimaGenerationBatchRequests({
          modelService: changing,
          prepared: batch,
          ready: ANIMA_BATCH_READY,
          scratchBasePath: scratch,
          use: async () =>
            assert.fail('a target changed during verification cannot reach consumer'),
        }),
        { code: 'GENERATION_INPUT_CHANGED' },
      )
      assert.equal(calls, 2)
      assert.deepEqual(await readdir(scratch), [])
      for (const [filePath, bytes] of files) {
        assert.ok((await readFile(filePath)).equals(bytes))
      }
    }
  })
})

test('Anima refuses relative and symlink scratch bases without deleting their targets', async () => {
  await withAnimaBatchFixture(async ({ modelService, prepared, root, scratch }) => {
    const sentinel = path.join(scratch, 'keep.txt')
    await writeFile(sentinel, 'retained')
    const alias = path.join(root, 'scratch-alias')
    await symlink(scratch, alias)
    for (const scratchBasePath of ['relative', alias]) {
      await assert.rejects(
        withAnimaGenerationBatchRequests({
          modelService,
          prepared: prepareAnimaGenerationBatch({ iterations: 1, prepared }),
          ready: ANIMA_BATCH_READY,
          scratchBasePath,
          use: async () => assert.fail('unsafe base cannot reach consumer'),
        }),
        { code: 'INVALID_STAGING_ROOT' },
      )
      assert.equal(await readFile(sentinel, 'utf8'), 'retained')
      assert.deepEqual(await readdir(scratch), ['keep.txt'])
    }
    assert.ok((await lstat(alias)).isSymbolicLink())
  })
})
