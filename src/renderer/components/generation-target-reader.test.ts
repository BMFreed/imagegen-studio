import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

import { GenerationTargetReader } from './generation-target-reader.js'

test(
  'target reader coalesces newest canvas input and refuses a late ABA response',
  { timeout: 5000 },
  async () => {
    const documentId = randomUUID()
    let enter!: () => void
    const entered = new Promise<void>((resolve) => {
      enter = resolve
    })
    let release!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    let finish!: () => void
    const finished = new Promise<void>((resolve) => {
      finish = resolve
    })
    const reads: string[] = []
    const modes: string[] = []
    const reader = new GenerationTargetReader({
      onState: (state) => {
        if (state?.mode) {
          modes.push(state.mode)
          finish()
        }
      },
      read: async (_key, owner, targetKey) => {
        reads.push(targetKey)
        if (reads.length === 1) {
          enter()
          await held
        }
        return {
          documentId: owner,
          mode: reads.length === 1 ? 'img2img' : 'txt2img',
          targetKey,
          unavailableReason: null,
        }
      },
    })
    reader.change({ documentId, projectKey: 'project', signature: 'A' })
    await entered
    reader.change({ documentId, projectKey: 'project', signature: 'B' })
    reader.change({ documentId, projectKey: 'project', signature: 'A' })
    release()
    await finished
    assert.equal(reads.length, 2)
    assert.equal(reads[0], reads[1])
    assert.deepEqual(modes, ['txt2img'])
    reader.dispose()
  },
)

test(
  'target reader refuses foreign input identity and cannot publish a late response after disposal',
  { timeout: 5000 },
  async () => {
    const documentId = randomUUID()
    let finish!: () => void
    const failed = new Promise<void>((resolve) => {
      finish = resolve
    })
    const errors: string[] = []
    const reader = new GenerationTargetReader({
      onState: (state, error) => {
        assert.equal(state, null)
        if (error) {
          errors.push(error)
          finish()
        }
      },
      read: async (_key, _owner, targetKey) => ({
        documentId: randomUUID(),
        mode: 'img2img',
        targetKey,
        unavailableReason: null,
      }),
    })
    reader.change({ documentId, projectKey: 'project', signature: 'A' })
    await failed
    assert.match(errors[0], /different inputs/)
    reader.dispose()
    let enter!: () => void
    const entered = new Promise<void>((resolve) => {
      enter = resolve
    })
    let release!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    let acknowledge!: () => void
    const returned = new Promise<void>((resolve) => {
      acknowledge = resolve
    })
    const states: unknown[] = []
    const disposed = new GenerationTargetReader({
      onState: (state) => {
        if (state) {
          states.push(state)
        }
      },
      read: async (_key, owner, targetKey) => {
        enter()
        await held
        acknowledge()
        return { documentId: owner, mode: 'img2img', targetKey, unavailableReason: null }
      },
    })
    disposed.change({ documentId, projectKey: 'project', signature: 'A' })
    await entered
    disposed.dispose()
    release()
    await returned
    await new Promise<void>((resolve) => setImmediate(resolve))
    assert.deepEqual(states, [])
  },
)
