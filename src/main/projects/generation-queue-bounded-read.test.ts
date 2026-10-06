import assert from 'node:assert/strict'
import { appendFile, type FileHandle, open, readFile, readlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import type { GenerationQueueRepository, QueuedGenerationItem } from './generation-queue.js'

import { enqueueAnimaStagingBatch, withAnimaStagingFixture } from './test-fixtures/anima-staging.js'
import {
  enqueueOutpaintConsumerBatch,
  withOutpaintConsumerFixture,
} from './test-fixtures/outpaint-consumers.js'

test('durable queue descriptor reads stay within captured ceilings when actual target or manifest grows after stat', async (t) => {
  for (const member of ['target.png', 'manifest.json'] as const) {
    for (const opaque of [false, true]) {
      await t.test(`ordinary Anima ${opaque ? 'img2img' : 'txt2img'} ${member}`, async () => {
        await withAnimaStagingFixture(
          async (fixture) => {
            const { items } = await enqueueAnimaStagingBatch(fixture)
            await verifyBoundedGrowth(fixture.queue, items[0], member)
          },
          { opaque },
        )
      })
    }
    for (const family of ['illustrious', 'anima'] as const) {
      await t.test(`${family} outpaint ${member}`, async () => {
        await withOutpaintConsumerFixture(family, async (fixture) => {
          const { items } = await enqueueOutpaintConsumerBatch(fixture)
          await verifyBoundedGrowth(fixture.queue, items[0], member)
        })
      })
    }
  }
})

async function verifyBoundedGrowth(
  queue: GenerationQueueRepository,
  item: QueuedGenerationItem,
  member: 'manifest.json' | 'target.png',
): Promise<void> {
  const loaded = await queue.loadVerifiedInput(item.id)
  const attacked = path.join(path.dirname(loaded.targetPath), member)
  const original = await readFile(attacked)
  // Existing operational contract: target uses exact frozen bytes; manifest has a 4096-byte ceiling.
  const ceiling = member === 'target.png' ? original.length : 4096
  const stats = { grew: false, maxRequested: 0, readBytes: 0 }
  await withConcurrentGrowth(attacked, ceiling, stats, async () => {
    await assert.rejects(queue.loadVerifiedInput(item.id), { code: 'QUEUE_INPUT_INVALID' })
  })
  assert.equal(stats.grew, true)
  assert.ok(
    stats.readBytes <= ceiling + 1,
    `Read ${stats.readBytes} bytes beyond ceiling ${ceiling}.`,
  )
  assert.ok(stats.maxRequested <= Math.min(64 * 1024, ceiling + 1))
  await writeFile(attacked, original)
  const restored = await queue.loadVerifiedInput(item.id)
  assert.deepEqual(restored.payload, loaded.payload)
  assert.equal(restored.item.statusSequence, loaded.item.statusSequence)
}

/**
 * Real OS reads and file growth; wrappers control scheduling and record actual requested/read
 * bytes.
 */
async function withConcurrentGrowth(
  attacked: string,
  ceiling: number,
  stats: { grew: boolean; maxRequested: number; readBytes: number },
  use: () => Promise<void>,
): Promise<void> {
  const handle = await open(attacked, 'r')
  const prototype = Object.getPrototypeOf(handle)
  const originalRead = Reflect.get(prototype, 'read') as FileHandle['read']
  const originalReadFile = Reflect.get(prototype, 'readFile') as FileHandle['readFile']
  await handle.close()
  const matches = async (file: FileHandle) =>
    (await readlink(`/proc/self/fd/${file.fd}`)) === attacked
  const grow = async () => {
    if (!stats.grew) {
      stats.grew = true
      await appendFile(attacked, Buffer.alloc(ceiling + 17, 71))
    }
  }
  Reflect.set(prototype, 'read', async function (this: FileHandle, ...args: unknown[]) {
    const targeted = await matches(this)
    const result = await Reflect.apply(originalRead, this, args)
    if (targeted) {
      assert.equal(typeof args[2], 'number')
      stats.maxRequested = Math.max(stats.maxRequested, args[2] as number)
      stats.readBytes += result.bytesRead
      if (result.bytesRead > 0) {
        await grow()
      }
    }
    return result
  })
  // The previous unbounded readFile path would see post-stat growth before its whole-file read.
  // Record its actual returned bytes too, so restoring that implementation kills the bound check.
  Reflect.set(prototype, 'readFile', async function (this: FileHandle, ...args: unknown[]) {
    const targeted = await matches(this)
    if (targeted) {
      await grow()
    }
    const result = await Reflect.apply(originalReadFile, this, args)
    if (targeted) {
      assert.ok(Buffer.isBuffer(result))
      stats.readBytes += result.length
      stats.maxRequested = Math.max(stats.maxRequested, result.length)
    }
    return result
  })
  try {
    await use()
  } finally {
    Reflect.set(prototype, 'read', originalRead)
    Reflect.set(prototype, 'readFile', originalReadFile)
  }
}
