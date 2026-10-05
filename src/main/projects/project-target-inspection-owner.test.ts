import assert from 'node:assert/strict'
import { existsSync, realpathSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import {
  type ProjectImageWorkerSource,
  ProjectTargetInspectionOwner,
} from './project-target-inspection-owner.js'
import { classifyTargetPngAlpha } from './target-png-mode.js'

const python = path.resolve('worker-python/.venv/bin/python')
function runtimeRoot(): string | null {
  if (!existsSync(python)) {
    return null
  }
  const actual = realpathSync(python).split(path.sep)
  const requested = python.split(path.sep)
  let common = 0
  while (actual[common] === requested[common] && common < requested.length) {
    common++
  }
  const root = requested.slice(0, common).join(path.sep)
  return root && root !== path.sep ? root : null
}
function deferred() {
  let resolve!: () => void
  return {
    promise: new Promise<void>((done) => {
      resolve = done
    }),
    resolve: () => resolve(),
  }
}

test(
  'one actual CPU child serializes reads and newest visible target runs after another tab and comparison',
  { skip: !runtimeRoot(), timeout: 30_000 },
  async () => {
    const scratch = await mkdtemp(path.join(os.tmpdir(), 'igs-target-owner-'))
    const owner = new ProjectTargetInspectionOwner({
      pythonExecutable: python,
      runtimeRoot: runtimeRoot()!,
      stagingBasePath: scratch,
    })
    const entered = deferred()
    const release = deferred()
    let active = 0
    let maximum = 0
    const callbacks: string[] = []
    const inspect = (name: string, hold = false) =>
      owner.read(
        async (provider) => {
          callbacks.push(name)
          active++
          maximum = Math.max(maximum, active)
          try {
            assert.ok(provider)
            return await provider(async (worker) => {
              const stagingRoot = path.join(scratch, name)
              await mkdir(stagingRoot)
              const targetPngPath = path.join(stagingRoot, 'target.png')
              const result = await worker.composeTarget({
                bbox: { height: 8, width: 8, x: 0, y: 0 },
                layers: [],
                stagingRoot,
                targetPngPath,
              })
              assert.equal(classifyTargetPngAlpha(await readFile(targetPngPath), 8, 8), 'txt2img')
              assert.equal(result.mode, 'txt2img')
              if (hold) {
                entered.resolve()
                await release.promise
              }
              return result.mode
            })
          } finally {
            active--
          }
        },
        name === 'comparison' ? 'comparison' : 'target',
      )
    try {
      const first = inspect('tab-A', true)
      await entered.promise
      const superseded = inspect('tab-B')
      const newest = inspect('tab-C')
      const comparison = inspect('comparison')
      assert.deepEqual(callbacks, ['tab-A'])
      release.resolve()
      assert.deepEqual(await Promise.all([first, superseded, newest, comparison]), [
        'txt2img',
        null,
        'txt2img',
        'txt2img',
      ])
      assert.equal(maximum, 1)
      assert.deepEqual(new Set(callbacks), new Set(['comparison', 'tab-A', 'tab-C']))
    } finally {
      release.resolve()
      await owner.shutdown()
      await rm(scratch, { force: true, recursive: true })
    }
  },
)

test(
  'lazy current CPU source serializes actual image actions with target reads and resolves after the preceding exit',
  { skip: !runtimeRoot(), timeout: 30_000 },
  async () => {
    const scratch = await mkdtemp(path.join(os.tmpdir(), 'igs-dynamic-image-owner-'))
    const firstRoot = path.join(scratch, 'first')
    const nextRoot = path.join(scratch, 'next')
    await mkdir(firstRoot)
    await mkdir(nextRoot)
    const source = (root: string): ProjectImageWorkerSource => ({
      environment: { CUDA_VISIBLE_DEVICES: 'must-be-cleared', LANG: 'C.UTF-8' },
      location: { pythonExecutable: python, runtimeRoot: runtimeRoot()!, stagingBasePath: root },
    })
    let selected = source(firstRoot)
    const resolved: string[] = []
    const owner = new ProjectTargetInspectionOwner(async () => {
      resolved.push(selected.location.stagingBasePath)
      return selected
    })
    const entered = deferred()
    const release = deferred()
    const completed: string[] = []
    try {
      const action = owner.useWorker(async (worker) => {
        const stagingRoot = path.join(firstRoot, 'input')
        await mkdir(stagingRoot)
        const output = path.join(stagingRoot, 'first.png')
        await worker.composeTarget({
          bbox: { height: 8, width: 8, x: 0, y: 0 },
          layers: [],
          stagingRoot,
          targetPngPath: output,
        })
        assert.equal(classifyTargetPngAlpha(await readFile(output), 8, 8), 'txt2img')
        entered.resolve()
        await release.promise
        completed.push('first')
        return 'first-action-completed'
      })
      await entered.promise
      const nextAction = owner.useWorker(async (worker) => {
        const stagingRoot = path.join(nextRoot, 'action')
        await mkdir(stagingRoot)
        const output = path.join(stagingRoot, 'target.png')
        await worker.composeTarget({
          bbox: { height: 8, width: 8, x: 0, y: 0 },
          layers: [],
          stagingRoot,
          targetPngPath: output,
        })
        assert.equal(classifyTargetPngAlpha(await readFile(output), 8, 8), 'txt2img')
        completed.push('next-action')
        return 'next-action-completed'
      })
      const nextRead = owner.read(async (provider) => {
        assert.ok(provider)
        return await provider(async (worker) => {
          const stagingRoot = path.join(nextRoot, 'read')
          await mkdir(stagingRoot)
          const output = path.join(stagingRoot, 'target.png')
          const result = await worker.composeTarget({
            bbox: { height: 8, width: 8, x: 0, y: 0 },
            layers: [],
            stagingRoot,
            targetPngPath: output,
          })
          assert.equal(classifyTargetPngAlpha(await readFile(output), 8, 8), 'txt2img')
          completed.push('next-read')
          return result.mode
        })
      })
      selected = source(nextRoot)
      assert.deepEqual(resolved, [firstRoot])
      assert.deepEqual(completed, [])
      release.resolve()
      assert.deepEqual(await Promise.all([action, nextAction, nextRead]), [
        'first-action-completed',
        'next-action-completed',
        'txt2img',
      ])
      assert.deepEqual(resolved, [firstRoot, nextRoot, nextRoot])
      assert.deepEqual(completed, ['first', 'next-action', 'next-read'])
    } finally {
      release.resolve()
      await owner.shutdown()
      await rm(scratch, { force: true, recursive: true })
    }
  },
)

test('shutdown owns pending source resolution and refuses a late CPU child', async () => {
  const entered = deferred()
  const release = deferred()
  let resolutions = 0
  const owner = new ProjectTargetInspectionOwner(async () => {
    resolutions++
    entered.resolve()
    await release.promise
    // It is intentionally invalid: after shutdown the late location must never reach startup.
    return {
      environment: {},
      location: {
        pythonExecutable: '/unavailable/python',
        runtimeRoot: '/unavailable',
        stagingBasePath: '/unavailable',
      },
    }
  })
  let stopped = false
  try {
    const action = owner.useWorker(async () => assert.fail('Shutdown must refuse this action'))
    await entered.promise
    const shutdown = owner.shutdown().then(() => {
      stopped = true
    })
    await new Promise<void>((resolve) => setImmediate(resolve))
    assert.equal(stopped, false)
    assert.equal(await owner.useWorker(async () => assert.fail('New actions are fenced')), null)
    release.resolve()
    assert.equal(await action, null)
    await shutdown
    assert.equal(stopped, true)
    assert.equal(resolutions, 1)
  } finally {
    release.resolve()
    await owner.shutdown()
  }
})

test(
  'completed actual image action preserves its result on controlled exit failure and fences another child until shutdown retry',
  { skip: !runtimeRoot(), timeout: 30_000 },
  async () => {
    const scratch = await mkdtemp(path.join(os.tmpdir(), 'igs-image-owner-exit-'))
    const owner = new ProjectTargetInspectionOwner({
      pythonExecutable: python,
      runtimeRoot: runtimeRoot()!,
      stagingBasePath: scratch,
    })
    let exits = 0
    try {
      const result = await owner.useWorker(async (worker) => {
        const close = worker.close.bind(worker)
        worker.close = async () => {
          exits++
          if (exits === 1) {
            throw new Error('Controlled first exit refusal')
          }
          await close()
        }
        const stagingRoot = path.join(scratch, 'input')
        await mkdir(stagingRoot)
        const target = path.join(stagingRoot, 'target.png')
        await worker.composeTarget({
          bbox: { height: 8, width: 8, x: 0, y: 0 },
          layers: [],
          stagingRoot,
          targetPngPath: target,
        })
        assert.equal(classifyTargetPngAlpha(await readFile(target), 8, 8), 'txt2img')
        return { completed: true, target }
      })
      assert.deepEqual(result, {
        completed: true,
        target: path.join(scratch, 'input', 'target.png'),
      })
      assert.equal(exits, 1)
      assert.equal(
        await owner.useWorker(async () => assert.fail('Unconfirmed exit must fence actions')),
        null,
      )
      assert.equal(
        await owner.read(async () => assert.fail('Unconfirmed exit must fence reads')),
        null,
      )
      assert.equal(
        await owner.useOptionalWorker(async (worker) => {
          assert.equal(worker, undefined)
          return 'placeholder-action-completed'
        }),
        'placeholder-action-completed',
      )
      assert.equal(exits, 1)
      await owner.shutdown()
      assert.equal(exits, 2)
    } finally {
      await owner.shutdown()
      await rm(scratch, { force: true, recursive: true })
    }
  },
)

test('missing dynamic CPU source lets inspection classify without worker and refuses image actions', async () => {
  const owner = new ProjectTargetInspectionOwner(async () => null)
  try {
    assert.equal(
      await owner.read(async (provider) => {
        assert.equal(provider, undefined)
        return 'unknown'
      }),
      'unknown',
    )
    assert.equal(
      await owner.useWorker(async () => assert.fail('Missing worker must not execute action')),
      null,
    )
  } finally {
    await owner.shutdown()
  }
})

for (const failedStartup of [false, true]) {
  test(`placeholder action retains close ownership with ${failedStartup ? 'failed worker startup' : 'missing runtime'}`, async () => {
    const owner = new ProjectTargetInspectionOwner(async () =>
      failedStartup
        ? {
            environment: {},
            location: {
              pythonExecutable: '/missing-runtime/python',
              runtimeRoot: '/missing-runtime',
              stagingBasePath: '/missing-runtime',
            },
          }
        : null,
    )
    const entered = deferred()
    const release = deferred()
    let stopped = false
    let completed = false
    try {
      // This callback is the owned fallback operation, not a counterfeit Project Save writer.
      const fallback = owner.useOptionalWorker(async (worker) => {
        assert.equal(worker, undefined)
        entered.resolve()
        await release.promise
        completed = true
        return 'fallback-completed'
      })
      await entered.promise
      const shutdown = owner.shutdown().then(() => {
        stopped = true
      })
      await new Promise<void>((resolve) => setImmediate(resolve))
      assert.equal(stopped, false)
      assert.equal(completed, false)
      assert.equal(
        await owner.useOptionalWorker(async () =>
          assert.fail('Closing must refuse a new fallback'),
        ),
        null,
      )
      release.resolve()
      assert.equal(await fallback, 'fallback-completed')
      await shutdown
      assert.equal(stopped, true)
      assert.equal(completed, true)
    } finally {
      release.resolve()
      await owner.shutdown()
    }
  })
}

test(
  'shutdown retains a real CPU read lease until its callback cleans up and refuses waiting or new reads',
  { skip: !runtimeRoot(), timeout: 30_000 },
  async () => {
    const scratch = await mkdtemp(path.join(os.tmpdir(), 'igs-target-shutdown-'))
    const owner = new ProjectTargetInspectionOwner({
      pythonExecutable: python,
      runtimeRoot: runtimeRoot()!,
      stagingBasePath: scratch,
    })
    const entered = deferred()
    const release = deferred()
    let callbackCleaned = false
    let stopped = false
    try {
      const read = owner.read(async (provider) => {
        assert.ok(provider)
        return provider(async (worker) => {
          const stagingRoot = path.join(scratch, 'input')
          await mkdir(stagingRoot)
          assert.equal(
            (
              await worker.composeTarget({
                bbox: { height: 8, width: 8, x: 0, y: 0 },
                layers: [],
                stagingRoot,
                targetPngPath: path.join(stagingRoot, 'target.png'),
              })
            ).mode,
            'txt2img',
          )
          entered.resolve()
          await release.promise
          await rm(stagingRoot, { recursive: true })
          callbackCleaned = true
          return 'txt2img'
        })
      })
      await entered.promise
      const waiting = owner.read(async () =>
        assert.fail('A pending read must be canceled on shutdown'),
      )
      const shutdown = owner.shutdown().then(() => {
        stopped = true
      })
      await new Promise<void>((resolve) => setImmediate(resolve))
      assert.equal(stopped, false)
      assert.equal(callbackCleaned, false)
      assert.equal(await owner.read(async () => assert.fail('New reads must be fenced')), null)
      release.resolve()
      assert.equal(await read, 'txt2img')
      assert.equal(await waiting, null)
      await shutdown
      assert.equal(callbackCleaned, true)
      assert.equal(stopped, true)
      await owner.shutdown()
    } finally {
      release.resolve()
      await owner.shutdown()
      await rm(scratch, { force: true, recursive: true })
    }
  },
)
