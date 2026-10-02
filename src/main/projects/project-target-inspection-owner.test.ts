import assert from 'node:assert/strict'
import { existsSync, realpathSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { ProjectTargetInspectionOwner } from './project-target-inspection-owner.js'
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
