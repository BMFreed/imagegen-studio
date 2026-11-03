import assert from 'node:assert/strict'
import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process'
import { once } from 'node:events'
import { lstat, mkdir, readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'

import type { InferenceWorkerOwner } from './inference-worker-ownership.js'

import {
  captureInferenceWorkerOwner,
  captureInferenceWorkerOwnerValue,
  serializeRegionalTransportOwner,
} from './inference-worker-ownership.js'
import { prepareRegionalWorkerRequest } from './regional-worker-request.js'
import { createRegionalQueueFixture } from './test-fixtures/regional-queue.js'

const linux = { skip: process.platform !== 'linux' }
const ownershipError = { code: 'WORKER_VERSION_MISMATCH' }

/** A real CPU-only child supplies identity; no inference runtime or fake /proc reader is used. */
async function withChild(
  run: (child: ChildProcessWithoutNullStreams) => Promise<void>,
): Promise<void> {
  const child = spawn(
    process.execPath,
    ['-e', String.raw`process.stdout.write("ready\n");process.stdin.resume()`],
    {
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  )
  const exited = once(child, 'exit')
  let readyTimer: ReturnType<typeof setTimeout> | undefined
  try {
    const [bytes] = await Promise.race([
      once(child.stdout, 'data'),
      new Promise<never>((_, reject) => {
        readyTimer = setTimeout(
          () => reject(new Error('Owned CPU fixture did not become ready.')),
          3000,
        )
      }),
    ])
    clearTimeout(readyTimer)
    assert.equal(String(bytes), 'ready\n')
    await run(child)
  } finally {
    clearTimeout(readyTimer)
    child.stdin.end()
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        exited,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            child.kill('SIGKILL')
            reject(new Error('Owned CPU identity fixture did not close normally.'))
          }, 3000)
        }),
      ])
    } finally {
      clearTimeout(timer)
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL')
        await exited
      }
    }
  }
}

function pidOf(child: ChildProcessWithoutNullStreams): number {
  assert.ok(child.pid)
  return child.pid
}

function statIdentity(text: string): { parentPid: number; startTicks: string } {
  const fields = text
    .slice(text.lastIndexOf(')') + 2)
    .trim()
    .split(/\s+/)
  return { parentPid: Number(fields[1]), startTicks: fields[19] }
}

test(
  'inference owner captures the actual live CPU child and current Main identity',
  linux,
  async () => {
    await withChild(async (child) => {
      const pid = pidOf(child)
      const captured = await captureInferenceWorkerOwner(pid)
      const main = statIdentity(await readFile(`/proc/${process.pid}/stat`, 'utf8'))
      const worker = statIdentity(await readFile(`/proc/${pid}/stat`, 'utf8'))
      assert.equal(worker.parentPid, process.pid)
      assert.deepEqual(captured, {
        bootId: (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim(),
        main: { pid: process.pid, startTicks: main.startTicks },
        worker: { pid, startTicks: worker.startTicks },
      })
      assert.ok(Object.isFrozen(captured) && Object.isFrozen(captured.main))
      assert.ok(Object.isFrozen(captured.worker))
      await assert.rejects(captureInferenceWorkerOwner(process.pid), ownershipError)
    })
  },
)

test('inference owner refuses the same actual child after its confirmed exit', linux, async () => {
  let exitedPid = 0
  await withChild(async (child) => {
    exitedPid = pidOf(child)
    assert.equal((await captureInferenceWorkerOwner(exitedPid)).worker.pid, exitedPid)
  })
  await assert.rejects(captureInferenceWorkerOwner(exitedPid), ownershipError)
})

test(
  'private inference owner values detach, freeze and allow equal valid start ticks',
  linux,
  async () => {
    await withChild(async (child) => {
      const original = await captureInferenceWorkerOwner(pidOf(child))
      const supplied = structuredClone(original) as {
        bootId: string
        main: { pid: number; startTicks: string }
        worker: { pid: number; startTicks: string }
      }
      supplied.worker.startTicks = supplied.main.startTicks
      const captured = captureInferenceWorkerOwnerValue(supplied)
      assert.equal(captured.worker.startTicks, captured.main.startTicks)
      supplied.worker.pid = supplied.main.pid
      assert.notEqual(captured.worker.pid, supplied.worker.pid)
      assert.ok(Object.isFrozen(captured) && Object.isFrozen(captured.main))
      assert.ok(Object.isFrozen(captured.worker))
    })
  },
)

test(
  'private inference owner rejects malformed or expanded identities before any transport',
  linux,
  async () => {
    await withChild(async (child) => {
      const good = await captureInferenceWorkerOwner(pidOf(child))
      const hidden = Object.defineProperty({ ...good }, 'hidden', { value: true })
      const symbolic = { ...good, [Symbol('extra owner key')]: true }
      let getterCalls = 0
      const accessor = Object.defineProperty({ ...good }, 'bootId', {
        get: () => {
          getterCalls += 1
          return good.bootId
        },
      })
      const invalid: unknown[] = [
        null,
        [],
        { ...good, unexpected: true },
        { ...good, bootId: good.bootId.toUpperCase() },
        { ...good, bootId: 'not-a-boot-id' },
        { ...good, main: { ...good.main, path: '/proc/self' } },
        { ...good, worker: { ...good.worker, pid: good.main.pid } },
        { ...good, worker: { ...good.worker, pid: true } },
        { ...good, worker: { ...good.worker, pid: 1 } },
        { ...good, worker: { ...good.worker, pid: 2.5 } },
        { ...good, worker: { ...good.worker, startTicks: '0' } },
        { ...good, worker: { ...good.worker, startTicks: '01' } },
        { ...good, worker: { ...good.worker, startTicks: '+1' } },
        { ...good, worker: { ...good.worker, startTicks: '18446744073709551616' } },
        { ...good, worker: { pid: good.worker.pid } },
        hidden,
        symbolic,
        accessor,
      ]
      for (const value of invalid) {
        assert.throws(() => captureInferenceWorkerOwnerValue(value), ownershipError)
      }
      assert.equal(getterCalls, 0, 'Strict ownership parsing must not execute supplied accessors.')
    })
  },
)

test(
  'regional transport ownership marker binds the real lease inode and detached actual child',
  linux,
  async () => {
    const f = await createRegionalQueueFixture()
    try {
      const scratch = path.join(f.root, 'transport-scratch')
      await mkdir(scratch, { mode: 0o700 })
      await withChild(async (child) => {
        const original = await captureInferenceWorkerOwner(pidOf(child))
        const supplied = structuredClone(original) as {
          bootId: string
          main: { pid: number; startTicks: string }
          worker: { pid: number; startTicks: string }
        }
        const preparing = prepareRegionalWorkerRequest(f.input, scratch, supplied)
        supplied.worker.startTicks = (BigInt(supplied.worker.startTicks) + 1n).toString()
        const lease = await preparing
        try {
          const directory = await lstat(lease.wire.stagingRoot, { bigint: true })
          const marker = await readFile(`${lease.wire.stagingRoot}/.owner-v1.json`)
          assert.deepEqual(JSON.parse(marker.toString('utf8')), {
            kind: 'regional-transport-owner-v1',
            schemaVersion: 1,
            ...original,
            directory: { device: directory.dev.toString(), inode: directory.ino.toString() },
          })
          assert.equal(marker.equals(serializeRegionalTransportOwner(original, directory)), true)
          const entry = await lstat(`${lease.wire.stagingRoot}/.owner-v1.json`)
          assert.equal(entry.isSymbolicLink(), false)
          assert.equal(entry.nlink, 1)
          assert.equal(entry.mode & 0o777, 0o600)
          assert.ok(marker.length <= 4096)
          assert.ok(
            (await readFile(lease.request.job.target.path)).equals(f.prepared.targetPngBytes),
          )
        } finally {
          await lease.dispose()
        }
        assert.deepEqual(await readdir(scratch), [])
      })
    } finally {
      await f.close()
    }
  },
)

test(
  'invalid private ownership refuses before publishing even a partial lease',
  linux,
  async () => {
    const f = await createRegionalQueueFixture()
    try {
      const scratch = path.join(f.root, 'transport-scratch')
      await mkdir(scratch, { mode: 0o700 })
      await withChild(async (child) => {
        const owner = await captureInferenceWorkerOwner(pidOf(child))
        const before = (await readdir(scratch)).sort()
        const invalid = { ...owner, worker: owner.main }
        await assert.rejects(
          prepareRegionalWorkerRequest(f.input, scratch, invalid),
          ownershipError,
        )
        assert.deepEqual((await readdir(scratch)).sort(), before)
      })
    } finally {
      await f.close()
    }
  },
)

test('ownership marker keeps bigint precision and refuses invalid directory identities', () => {
  const owner: InferenceWorkerOwner = {
    bootId: '12345678-1234-1234-1234-123456789abc',
    main: { pid: 2, startTicks: '18446744073709551615' },
    worker: { pid: 3, startTicks: '1' },
  }
  const directory = { dev: 9_007_199_254_740_993n, ino: 18_446_744_073_709_551_615n }
  const marker = JSON.parse(serializeRegionalTransportOwner(owner, directory).toString('utf8')) as {
    directory: { device: string; inode: string }
  }
  assert.deepEqual(marker.directory, {
    device: '9007199254740993',
    inode: '18446744073709551615',
  })
  assert.throws(() => serializeRegionalTransportOwner(owner, { dev: -1n, ino: 1n }), ownershipError)
  assert.throws(
    () => serializeRegionalTransportOwner(owner, { dev: 1n, ino: 18_446_744_073_709_551_616n }),
    ownershipError,
  )
})
