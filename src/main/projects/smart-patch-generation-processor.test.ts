import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import type { SmartPatchExecutionRequest } from './smart-patch-execution-request.js'
import type {
  SmartPatchInferenceTransport,
  SmartPatchOutputWorkerOwner,
} from './smart-patch-generation-processor.js'
import type { SmartPatchQueueFixture } from './test-fixtures/smart-patch-queue.js'
import type { ProjectWorkerClient } from './worker-client.js'

import { GenerationQueueRepository } from './generation-queue.js'
import { SmartPatchGenerationProcessor } from './smart-patch-generation-processor.js'
import { SmartPatchGenerationStagingRepository } from './smart-patch-generation-staging.js'
import { OUTPAINT_READY } from './test-fixtures/outpaint-ready.js'
import { literalSmartPatchColorPng } from './test-fixtures/smart-patch-input-material.js'
import { admitSmartPatch, withSmartPatchQueueFixture } from './test-fixtures/smart-patch-queue.js'
import { createSourceOutputWorkerOwner as cpuOwner } from './test-fixtures/source-output-worker.js'

const ready = {
  ...OUTPAINT_READY,
  capabilities: [
    ...OUTPAINT_READY.capabilities,
    'illustrious-euler',
    'illustrious-noise-profile',
    'smart-patch-execution',
    'smart-patch-seed-confirmation',
  ],
  workerVersion: '0.14.0',
}
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
function uncertain(): Error & { code: string } {
  return Object.assign(new Error('Controlled unconfirmed child exit'), {
    code: 'WORKER_EXIT_UNCONFIRMED',
  })
}
async function literalInference(request: SmartPatchExecutionRequest) {
  // Native inference is the declared collaborator. Actual files, Main readers, CPU JSONL,
  // queued ownership, publication, receipts and cursor remain production boundaries.
  const { height, width } = request.internalResolution
  const bytes = literalSmartPatchColorPng(
    width,
    height,
    Array.from({ length: width * height }, () => [23, 47, 91]).flat(),
    3,
  )
  await writeFile(request.output.pngPath, bytes, { flag: 'wx', mode: 0o600 })
  return {
    actualSeed: request.inference.sampling.seed,
    output: {
      byteSize: bytes.length,
      colorSpace: 'srgb' as const,
      height,
      iccSha256: IGS_SRGB_ICC_SHA256,
      path: request.output.pngPath,
      sha256: digest(bytes),
      width,
    },
  }
}
async function setup(f: SmartPatchQueueFixture, owner: SmartPatchOutputWorkerOwner) {
  const staging = new SmartPatchGenerationStagingRepository(f.database.db, f.root)
  await staging.recoverAfterRestart()
  const [item] = await admitSmartPatch(f, {
    material: {
      ...f.material,
      manifest: { ...f.material.manifest, items: [f.material.manifest.items[0]] },
    },
  })
  const processor = new SmartPatchGenerationProcessor(f.queue, staging, f.models, f.scratch, owner)
  return { item, processor, staging }
}
async function noOutput(f: SmartPatchQueueFixture) {
  assert.deepEqual(
    await f.database.db.selectFrom('generation_candidate_receipt').selectAll().execute(),
    [],
  )
  assert.deepEqual(
    await f.database.db.selectFrom('generation_seed_cursor').selectAll().execute(),
    [],
  )
  assert.ok((await readFile(f.projectPath)).equals(f.originalProjectBytes))
}

for (const family of ['illustrious', 'anima'] as const) {
  test(`private ${family} executor publishes actual CPU world candidate and cursor independently of pruned queue inputs`, async () => {
    await withSmartPatchQueueFixture(family, async (f) => {
      const owner = await cpuOwner(f)
      const { item, processor, staging } = await setup(f, owner)
      try {
        const result = await processor.runOne({
          close: async () => undefined,
          executeSmartPatch: literalInference,
          ready,
        })
        assert.equal(result.kind, 'completed')
        if (result.kind !== 'completed') {
          assert.fail('Durable candidate required')
        }
        assert.equal(result.candidate.kind, 'smart-patch-world-candidate')
        assert.deepEqual(result.candidate.bbox, f.material.manifest.context.bbox)
        assert.equal(result.candidate.actualSeed, 0)
        assert.equal((await f.queue.getManagerEntry(item.id)).status, 'completed')
        assert.equal(
          (
            await f.database.db
              .selectFrom('generation_seed_cursor')
              .selectAll()
              .executeTakeFirstOrThrow()
          ).actual_seed,
          0,
        )
        assert.deepEqual(await f.staging.listVerifiedCandidates(item.localProjectKey), [])
        await f.queue.pruneTerminal(['completed'])
        assert.equal((await staging.listVerifiedCandidates(item.localProjectKey)).length, 1)
        const fresh = new SmartPatchGenerationStagingRepository(f.database.db, f.root)
        await fresh.recoverAfterRestart()
        assert.equal(
          (await fresh.listVerifiedCandidates(item.localProjectKey))[0].image.sha256,
          result.candidate.image.sha256,
        )
        assert.deepEqual(await readdir(f.scratch), [])
        assert.ok((await readFile(f.projectPath)).equals(f.originalProjectBytes))
        const pid = await owner.pid()
        assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' })
      } finally {
        await processor.stopAndCancelActive()
        await owner.cleanup()
      }
    })
  })
}

for (const phase of ['inference', 'startup', 'composition'] as const) {
  test(`Cancel drains admitted Smart Patch ${phase} work before releasing the SQL slot or scratch`, async () => {
    await withSmartPatchQueueFixture('illustrious', async (f) => {
      const owner = await cpuOwner(f)
      const cpuClosed = deferred()
      const entered = deferred()
      const inferenceClosed = deferred()
      const release = deferred()
      let client: ProjectWorkerClient | undefined
      const wrapped: SmartPatchOutputWorkerOwner = {
        start: async (signal) => {
          client = await owner.start(signal)
          if (phase === 'startup') {
            entered.resolve()
            await release.promise
          }
          return {
            close: async () => {
              await client!.close()
              cpuClosed.resolve()
            },
            composeSmartPatchOutput: async (input) => {
              const result = await client!.composeSmartPatchOutput(input)
              if (phase === 'composition') {
                entered.resolve()
                await release.promise
              }
              return result
            },
          }
        },
      }
      const { item, processor } = await setup(f, wrapped)
      const transport: SmartPatchInferenceTransport = {
        close: async () => {
          inferenceClosed.resolve()
        },
        executeSmartPatch: async (input) => {
          const output = await literalInference(input)
          if (phase === 'inference') {
            entered.resolve()
            await release.promise
          }
          return output
        },
        ready,
      }
      const run = processor.runOne(transport)
      try {
        await entered.promise
        let cancellationFinished = false
        const cancel = processor.cancelAndWait(item.id).then((row) => {
          cancellationFinished = true
          return row
        })
        await inferenceClosed.promise
        if (phase === 'composition') {
          await cpuClosed.promise
        }
        if (phase === 'startup') {
          await client!.close()
        }
        assert.equal(cancellationFinished, false)
        assert.equal((await f.queue.getManagerEntry(item.id)).status, 'running')
        assert.equal(
          await new GenerationQueueRepository(f.database.db, f.root).claimNextPending(),
          null,
        )
        assert.equal((await readdir(f.scratch)).length, 1)
        await noOutput(f)
        assert.equal(
          cancellationFinished,
          false,
          'Cancel must still join the held admitted operation',
        )
        assert.equal((await f.queue.getManagerEntry(item.id)).status, 'running')
        release.resolve()
        assert.equal((await cancel).status, 'canceled')
        assert.equal((await run).kind, 'canceled')
        assert.deepEqual(await readdir(f.scratch), [])
        await noOutput(f)
      } finally {
        release.resolve()
        await run.catch(() => undefined)
        await processor.stopAndCancelActive()
        await owner.cleanup()
      }
    })
  })
}

test('unconfirmed CPU exit retains the running Smart Patch owner and scratch until explicit retry confirms physical exit', async () => {
  await withSmartPatchQueueFixture('illustrious', async (f) => {
    const owner = await cpuOwner(f)
    let allowExit = false
    const { item, processor } = await setup(f, {
      start: async (signal) => {
        const client = await owner.start(signal)
        return {
          close: async () => {
            if (!allowExit) {
              throw uncertain()
            }
            await client.close()
          },
          composeSmartPatchOutput: client.composeSmartPatchOutput.bind(client),
        }
      },
    })
    try {
      await assert.rejects(
        processor.runOne({
          close: async () => undefined,
          executeSmartPatch: literalInference,
          ready,
        }),
        { code: 'WORKER_EXIT_UNCONFIRMED' },
      )
      assert.equal((await f.queue.getManagerEntry(item.id)).status, 'running')
      assert.equal((await readdir(f.scratch)).length, 1)
      await noOutput(f)
      const pid = await owner.pid()
      assert.doesNotThrow(() => process.kill(pid, 0))
      await assert.rejects(
        processor.runOne({
          close: async () => undefined,
          executeSmartPatch: literalInference,
          ready,
        }),
        { code: 'BUSY' },
      )
      allowExit = true
      assert.equal((await processor.cancelAndWait(item.id)).status, 'canceled')
      assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' })
      assert.deepEqual(await readdir(f.scratch), [])
      await noOutput(f)
    } finally {
      allowExit = true
      await processor.stopAndCancelActive()
      await owner.cleanup()
    }
  })
})

test('a synchronous unconfirmed CPU startup failure retains ownership and uses the captured startup-exit retry', async () => {
  await withSmartPatchQueueFixture('illustrious', async (f) => {
    const owner = await cpuOwner(f)
    const retained = await owner.start(new AbortController().signal)
    let allowExit = false
    const { item, processor } = await setup(f, {
      confirmUnconfirmedStartupExit: async () => {
        if (!allowExit) {
          throw uncertain()
        }
        await retained.close()
      },
      start: () => {
        throw uncertain()
      },
    })
    try {
      await assert.rejects(
        processor.runOne({
          close: async () => undefined,
          executeSmartPatch: literalInference,
          ready,
        }),
        { code: 'WORKER_EXIT_UNCONFIRMED' },
      )
      assert.equal((await f.queue.getManagerEntry(item.id)).status, 'running')
      assert.equal((await readdir(f.scratch)).length, 1)
      await noOutput(f)
      allowExit = true
      assert.equal((await processor.cancelAndWait(item.id)).status, 'canceled')
      assert.deepEqual(await readdir(f.scratch), [])
    } finally {
      allowExit = true
      await processor.stopAndCancelActive()
      await owner.cleanup()
    }
  })
})

test('old private worker refuses before claiming and wrong confirmed seed fails before CPU startup or publication', async () => {
  await withSmartPatchQueueFixture('illustrious', async (f) => {
    let starts = 0
    const { item, processor } = await setup(f, {
      start: async () => {
        starts++
        throw new Error('CPU must not start')
      },
    })
    try {
      const transport = { close: async () => undefined, executeSmartPatch: literalInference, ready }
      await assert.rejects(
        processor.runOne({
          ...transport,
          ready: {
            ...ready,
            capabilities: ready.capabilities.filter(
              (cap) => cap !== 'smart-patch-seed-confirmation',
            ),
          },
        }),
        { code: 'INFERENCE_UNAVAILABLE' },
      )
      assert.equal((await f.queue.getManagerEntry(item.id)).status, 'pending')
      const failed = await processor.runOne({
        ...transport,
        executeSmartPatch: async (input) => ({ ...(await literalInference(input)), actualSeed: 1 }),
      })
      assert.equal(failed.kind, 'failed')
      assert.equal(starts, 0)
      await noOutput(f)
    } finally {
      await processor.stopAndCancelActive()
    }
  })
})

test('Anima capability refusal cannot be bypassed by a private injected transport', async () => {
  await withSmartPatchQueueFixture('anima', async (f) => {
    let executions = 0
    const { item, processor } = await setup(f, {
      start: async () => {
        throw new Error('CPU must not start')
      },
    })
    try {
      const result = await processor.runOne({
        close: async () => undefined,
        executeSmartPatch: async (input) => {
          executions++
          return literalInference(input)
        },
        ready: {
          ...ready,
          capabilities: ready.capabilities.filter((cap) => !cap.startsWith('anima-')),
        },
      })
      assert.equal(result.kind, 'failed')
      assert.equal((await f.queue.getManagerEntry(item.id)).status, 'failed')
      assert.equal(executions, 0)
      assert.deepEqual(await readdir(f.scratch), [])
      await noOutput(f)
    } finally {
      await processor.stopAndCancelActive()
    }
  })
})

test('a replaced Smart Patch operation directory is retained instead of recursively deleting foreign contents', async () => {
  await withSmartPatchQueueFixture('illustrious', async (f) => {
    const owner = await cpuOwner(f)
    const entered = deferred()
    const release = deferred()
    let operationRoot = ''
    const { processor } = await setup(f, {
      start: async (signal) => {
        const client = await owner.start(signal)
        return {
          close: client.close.bind(client),
          composeSmartPatchOutput: async (input) => {
            const result = await client.composeSmartPatchOutput(input)
            operationRoot = input.stagingRoot
            entered.resolve()
            await release.promise
            return result
          },
        }
      },
    })
    const run = processor.runOne({
      close: async () => undefined,
      executeSmartPatch: literalInference,
      ready,
    })
    try {
      await entered.promise
      await rename(operationRoot, `${operationRoot}-retained-original`)
      await mkdir(operationRoot, { mode: 0o700 })
      await writeFile(path.join(operationRoot, 'foreign.txt'), 'must survive')
      release.resolve()
      assert.equal((await run).kind, 'failed')
      assert.equal(await readFile(path.join(operationRoot, 'foreign.txt'), 'utf8'), 'must survive')
      await noOutput(f)
    } finally {
      release.resolve()
      await run.catch(() => undefined)
      await processor.stopAndCancelActive()
      await owner.cleanup()
    }
  })
})

test('dispatch qualifies only the selected frozen Smart Patch item while its sibling remains pending', async () => {
  await withSmartPatchQueueFixture('illustrious', async (f) => {
    const owner = await cpuOwner(f)
    let prompts = 0
    f.models.assertNoUnboundGenerationEmbeddings = async () => {
      prompts++
    }
    const staging = new SmartPatchGenerationStagingRepository(f.database.db, f.root)
    await staging.recoverAfterRestart()
    const items = await admitSmartPatch(f)
    const processor = new SmartPatchGenerationProcessor(
      f.queue,
      staging,
      f.models,
      f.scratch,
      owner,
    )
    prompts = 0
    try {
      assert.equal(
        (
          await processor.runOne({
            close: async () => undefined,
            executeSmartPatch: literalInference,
            ready,
          })
        ).kind,
        'completed',
      )
      assert.equal(prompts, 1, 'One selected concrete prompt plan is qualified per dispatch')
      assert.equal((await f.queue.getManagerEntry(items[1].id)).status, 'pending')
    } finally {
      await processor.stopAndCancelActive()
      await owner.cleanup()
    }
  })
})
