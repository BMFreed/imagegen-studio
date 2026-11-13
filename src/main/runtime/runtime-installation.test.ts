import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import * as fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import type { PreparedOfflineRuntime } from './offline-runtime-assembly.js'

import { createRuntimeRoots } from './index.js'
import { OFFLINE_RUNTIME_INCOMPLETE_MARKER } from './offline-runtime-assembly.js'
import {
  RUNTIME_INSTALLATION_CLAIM,
  RUNTIME_INSTALLATION_JOURNAL,
  RUNTIME_INSTALLATION_RECOVERY_CLAIM,
  RuntimeInstallationController,
} from './runtime-installation.js'

const code = (expected: string) => (error: unknown) =>
  error instanceof Error && 'code' in error && error.code === expected
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const present = async (file: string) =>
  fs.lstat(file).then(
    () => true,
    (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        return false
      }
      throw error
    },
  )

type Fixture = Awaited<ReturnType<typeof fixture>>

async function fixture(options: { oldPointer?: Buffer | null } = {}) {
  const appData = await fs.mkdtemp(path.join(os.tmpdir(), 'igs-runtime-activation-'))
  const roots = await createRuntimeRoots(appData)
  const oldEnvironment = path.join(roots.environmentsDir, 'previous')
  const oldPython = path.join(roots.pythonDir, 'previous')
  await fs.mkdir(path.join(oldEnvironment, 'bin'), { mode: 0o700, recursive: true })
  await fs.mkdir(oldPython, { mode: 0o700 })
  await fs.writeFile(
    path.join(oldEnvironment, 'bin/python'),
    'Declared previous interpreter; never executed.',
    { mode: 0o700 },
  )
  await fs.writeFile(path.join(oldPython, 'preserved'), 'Previous Python bytes')
  for (const name of ['models', 'projects', 'presets']) {
    await fs.mkdir(path.join(appData, name), { mode: 0o700 })
    await fs.writeFile(path.join(appData, name, 'preserved'), name)
  }
  const oldPointer: Buffer | null = Object.hasOwn(options, 'oldPointer')
    ? (options.oldPointer ?? null)
    : Buffer.from(
        `${JSON.stringify({
          pythonExecutable: path.join(oldEnvironment, 'bin/python'),
          runtimeId: 'previous',
          schemaVersion: 1,
        })}\n`,
      )
  if (oldPointer !== null) {
    await fs.writeFile(roots.pointerFile, oldPointer)
  }
  const controller = new RuntimeInstallationController(roots)
  return {
    appData,
    async assertProtected() {
      assert.equal(
        await fs.readFile(path.join(oldEnvironment, 'bin/python'), 'utf8'),
        'Declared previous interpreter; never executed.',
      )
      assert.equal(
        await fs.readFile(path.join(oldPython, 'preserved'), 'utf8'),
        'Previous Python bytes',
      )
      for (const name of ['models', 'projects', 'presets']) {
        assert.equal(await fs.readFile(path.join(appData, name, 'preserved'), 'utf8'), name)
      }
    },
    claim: path.join(roots.runtimeDir, RUNTIME_INSTALLATION_CLAIM),
    cleanup: () => fs.rm(appData, { force: true, recursive: true }),
    controller,
    journal: path.join(roots.runtimeDir, RUNTIME_INSTALLATION_JOURNAL),
    oldPointer,
    async prepare(runtimeId = 'next'): Promise<PreparedOfflineRuntime> {
      const environmentRoot = path.join(roots.environmentsDir, runtimeId)
      const pythonRoot = path.join(roots.pythonDir, runtimeId)
      await fs.mkdir(environmentRoot, { mode: 0o700 })
      await fs.mkdir(path.join(environmentRoot, 'bin'), { mode: 0o700 })
      await fs.mkdir(pythonRoot, { mode: 0o700 })
      const executable = path.join(pythonRoot, 'python')
      await fs.writeFile(executable, 'Declared new interpreter; never executed.', { mode: 0o700 })
      await fs.symlink(executable, path.join(environmentRoot, 'bin/python'))
      const marker = `${JSON.stringify({ releaseId: 'fixture-release', runtimeId, schemaVersion: 1 })}\n`
      for (const root of [environmentRoot, pythonRoot]) {
        await fs.writeFile(path.join(root, OFFLINE_RUNTIME_INCOMPLETE_MARKER), marker)
      }
      return {
        environment: {},
        environmentRoot,
        logPath: path.join(roots.workerLogsDir, 'declared-fixture.log'),
        manifestSha256: 'a'.repeat(64),
        pythonExecutable: path.join(environmentRoot, 'bin/python'),
        pythonRoot,
        releaseId: 'fixture-release',
        runtimeId,
      }
    },
    roots,
  }
}
async function withFixture(
  use: (f: Fixture) => Promise<void>,
  options: Parameters<typeof fixture>[0] = {},
) {
  const f = await fixture(options)
  try {
    await use(f)
  } finally {
    await f.cleanup()
  }
}

function pointer(prepared: PreparedOfflineRuntime) {
  return Buffer.from(
    `${JSON.stringify({
      pythonExecutable: prepared.pythonExecutable,
      runtimeId: prepared.runtimeId,
      schemaVersion: 1,
    })}\n`,
  )
}

async function crashPrecondition(
  f: Fixture,
  phase: string,
  prepared: PreparedOfflineRuntime,
  options: { candidateCurrent?: boolean; liveOwner?: boolean } = {},
) {
  const owner = {
    bootId: (await fs.readFile('/proc/sys/kernel/random/boot_id', 'ascii')).trim(),
    pid: options.liveOwner ? process.pid : 2_147_483_647,
    startTicks: '1',
  }
  if (options.liveOwner) {
    owner.startTicks = (await fs.readFile(`/proc/${process.pid}/stat`, 'ascii'))
      .split(') ')[1]
      .split(' ')[19]
  }
  const claim = { attemptId: randomUUID(), owner, schemaVersion: 1 }
  const { environmentRoot, manifestSha256, pythonExecutable, pythonRoot, releaseId, runtimeId } =
    prepared
  const journal = {
    ...claim,
    candidatePointer: pointer(prepared).toString('base64'),
    mode: 'repair',
    phase,
    prepared: {
      environmentRoot,
      manifestSha256,
      pythonExecutable,
      pythonRoot,
      releaseId,
      runtimeId,
    },
    previousPointer: f.oldPointer?.toString('base64') ?? null,
  }
  await fs.writeFile(f.claim, JSON.stringify(claim))
  await fs.writeFile(f.journal, JSON.stringify(journal))
  if (options.candidateCurrent) {
    await fs.writeFile(f.roots.pointerFile, pointer(prepared))
    for (const root of [environmentRoot, pythonRoot]) {
      await fs.unlink(path.join(root, OFFLINE_RUNTIME_INCOMPLETE_MARKER))
    }
  }
  return { claim, journal }
}

test('actual controller publishes only after first qualification and confirms the active pointer before completion', async () => {
  await withFixture(async (f) => {
    const phases: string[] = []
    const prepared = await f.prepare()
    const result = await f.controller.install({
      expectedPointerSha256: digest(f.oldPointer!),
      mode: 'repair',
      prepare: async () => prepared,
      qualify: async (slot, phase) => {
        phases.push(phase)
        assert.equal(Object.isFrozen(slot), true)
        if (phase === 'before-activation') {
          assert.deepEqual(await fs.readFile(f.roots.pointerFile), f.oldPointer)
          for (const root of [slot.environmentRoot, slot.pythonRoot]) {
            assert.equal(await present(path.join(root, OFFLINE_RUNTIME_INCOMPLETE_MARKER)), true)
          }
        } else {
          assert.deepEqual(await fs.readFile(f.roots.pointerFile), pointer(slot))
          for (const root of [slot.environmentRoot, slot.pythonRoot]) {
            assert.equal(await present(path.join(root, OFFLINE_RUNTIME_INCOMPLETE_MARKER)), false)
          }
        }
      },
    })
    assert.deepEqual(result, { previousRuntimeId: 'previous', runtimeId: 'next' })
    assert.deepEqual(phases, ['before-activation', 'after-activation'])
    assert.equal(JSON.parse(await fs.readFile(f.journal, 'utf8')).phase, 'complete')
    assert.equal(await present(f.claim), false)
    await f.assertProtected()
  })
})

test('first install uses a fresh pointer and a failed post-activation startup removes only its own candidate pointer', async () => {
  await withFixture(
    async (f) => {
      const prepared = await f.prepare()
      await assert.rejects(
        f.controller.install({
          expectedPointerSha256: null,
          mode: 'install',
          prepare: async () => prepared,
          qualify: async (_slot, phase) => {
            if (phase === 'after-activation') {
              throw new Error('Declared startup failure')
            }
          },
        }),
        code('RUNTIME_INSTALL_FAILED'),
      )
      assert.equal(await present(f.roots.pointerFile), false)
      assert.equal(await present(prepared.environmentRoot), true)
      assert.equal(await present(prepared.pythonRoot), true)
      assert.equal(JSON.parse(await fs.readFile(f.journal, 'utf8')).phase, 'rolled-back')
      await f.assertProtected()
    },
    { oldPointer: null },
  )
})

test('first successful install publishes the new final slot without inventing a previous runtime', async () => {
  await withFixture(
    async (f) => {
      const prepared = await f.prepare()
      const result = await f.controller.install({
        expectedPointerSha256: null,
        mode: 'install',
        prepare: async () => prepared,
        qualify: async () => {},
      })
      assert.deepEqual(result, { runtimeId: prepared.runtimeId })
      assert.deepEqual(await fs.readFile(f.roots.pointerFile), pointer(prepared))
      assert.equal(await f.controller.recover(), 'none')
      await f.assertProtected()
    },
    { oldPointer: null },
  )
})

test('failed before-activation qualification preserves the old pointer and both fresh incomplete markers', async () => {
  await withFixture(async (f) => {
    const prepared = await f.prepare()
    await assert.rejects(
      f.controller.install({
        mode: 'repair',
        prepare: async () => prepared,
        qualify: async () => {
          throw new Error('Declared preflight failure')
        },
      }),
      code('RUNTIME_INSTALL_FAILED'),
    )
    assert.deepEqual(await fs.readFile(f.roots.pointerFile), f.oldPointer)
    for (const root of [prepared.environmentRoot, prepared.pythonRoot]) {
      assert.equal(await present(path.join(root, OFFLINE_RUNTIME_INCOMPLETE_MARKER)), true)
    }
    assert.equal(await present(f.claim), false)
    await f.assertProtected()
  })
})

test('failed post-activation startup restores exactly the previous raw pointer including a malformed repair predecessor', async () => {
  await withFixture(
    async (f) => {
      const prepared = await f.prepare()
      await assert.rejects(
        f.controller.install({
          mode: 'repair',
          prepare: async () => prepared,
          qualify: async (_slot, phase) => {
            if (phase === 'after-activation') {
              throw new Error('Declared postactivation refusal')
            }
          },
        }),
        code('RUNTIME_INSTALL_FAILED'),
      )
      assert.deepEqual(await fs.readFile(f.roots.pointerFile), f.oldPointer)
      assert.equal(await present(f.claim), false)
      await f.assertProtected()
    },
    { oldPointer: Buffer.from('preserved invalid pointer\n') },
  )
})

test('changed preview pointer refuses before preparing a slot or writing a new journal', async () => {
  await withFixture(async (f) => {
    const reviewed = await f.controller.readPointerSha256()
    const external = Buffer.from('External pointer owner\n')
    await fs.writeFile(f.roots.pointerFile, external)
    let prepared = false
    await assert.rejects(
      f.controller.install({
        expectedPointerSha256: reviewed,
        mode: 'repair',
        prepare: async () => {
          prepared = true
          return f.prepare()
        },
        qualify: async () => {},
      }),
      code('RUNTIME_INSTALL_POINTER_CHANGED'),
    )
    assert.equal(prepared, false)
    assert.equal(await present(f.journal), false)
    assert.deepEqual(await fs.readFile(f.roots.pointerFile), external)
    assert.equal(await present(f.claim), false)
  })
})

test('pointer changed during qualification is never overwritten by activation or rollback', async () => {
  await withFixture(async (f) => {
    const external = Buffer.from('External pointer change\n')
    const prepared = await f.prepare()
    await assert.rejects(
      f.controller.install({
        mode: 'repair',
        prepare: async () => prepared,
        qualify: async () => {
          await fs.writeFile(f.roots.pointerFile, external)
        },
      }),
      code('RUNTIME_INSTALL_POINTER_CHANGED'),
    )
    assert.deepEqual(await fs.readFile(f.roots.pointerFile), external)
    assert.equal(
      await present(path.join(prepared.environmentRoot, OFFLINE_RUNTIME_INCOMPLETE_MARKER)),
      true,
    )
    assert.equal(await present(f.claim), false)
    await f.assertProtected()
  })
})

test('external pointer after activation is not overwritten and retains the operation for explicit recovery', async () => {
  await withFixture(async (f) => {
    const external = Buffer.from('External postactivation selection\n')
    const prepared = await f.prepare()
    await assert.rejects(
      f.controller.install({
        mode: 'repair',
        prepare: async () => prepared,
        qualify: async (_slot, phase) => {
          if (phase === 'after-activation') {
            await fs.writeFile(f.roots.pointerFile, external)
            throw new Error('Declared failure')
          }
        },
      }),
      code('RUNTIME_INSTALL_RECOVERY_REQUIRED'),
    )
    assert.deepEqual(await fs.readFile(f.roots.pointerFile), external)
    assert.equal(await present(f.claim), true)
    assert.equal(JSON.parse(await fs.readFile(f.journal, 'utf8')).phase, 'recovery-required')
    await f.assertProtected()
  })
})

test('a last-moment pointer change after temporary sync is preserved at the actual publication boundary', async () => {
  await withFixture(async (f) => {
    const external = Buffer.from('Late pointer publisher\n')
    const prepared = await f.prepare()
    const controller = new RuntimeInstallationController(f.roots, {
      beforePointerPublish: async (phase) => {
        assert.equal(phase, 'activate')
        await fs.writeFile(f.roots.pointerFile, external)
      },
    })
    await assert.rejects(
      controller.install({
        mode: 'repair',
        prepare: async () => prepared,
        qualify: async () => {},
      }),
      code('RUNTIME_INSTALL_POINTER_CHANGED'),
    )
    assert.deepEqual(await fs.readFile(f.roots.pointerFile), external)
    assert.equal(await present(f.claim), false)
    assert.deepEqual(
      (await fs.readdir(f.roots.runtimeDir)).filter((name) => name.endsWith('.tmp')),
      [],
    )
    await f.assertProtected()
  })
})

test('rollback rechecks the pointer after its synced temporary write and never replaces a late external selection', async () => {
  await withFixture(async (f) => {
    const external = Buffer.from('Late rollback publisher\n')
    const prepared = await f.prepare()
    const controller = new RuntimeInstallationController(f.roots, {
      beforePointerPublish: async (phase) => {
        if (phase === 'rollback') {
          await fs.writeFile(f.roots.pointerFile, external)
        }
      },
    })
    await assert.rejects(
      controller.install({
        mode: 'repair',
        prepare: async () => prepared,
        qualify: async (_slot, phase) => {
          if (phase === 'after-activation') {
            throw new Error('Declared startup failure')
          }
        },
      }),
      code('RUNTIME_INSTALL_RECOVERY_REQUIRED'),
    )
    assert.deepEqual(await fs.readFile(f.roots.pointerFile), external)
    assert.equal(await present(f.claim), true)
    await f.assertProtected()
  })
})

test('cancellation before preparation and after first qualification never publishes a pointer', async (t) => {
  for (const when of ['initial', 'qualification'] as const) {
    await t.test(when, async () => {
      await withFixture(async (f) => {
        const control = new AbortController()
        let count = 0
        if (when === 'initial') {
          control.abort()
        }
        await assert.rejects(
          f.controller.install({
            mode: 'repair',
            prepare: async () => {
              count++
              return f.prepare()
            },
            qualify: async () => {
              control.abort()
            },
            signal: control.signal,
          }),
          code('RUNTIME_INSTALL_CANCELED'),
        )
        assert.equal(count, when === 'initial' ? 0 : 1)
        assert.deepEqual(await fs.readFile(f.roots.pointerFile), f.oldPointer)
        assert.equal(await present(f.claim), false)
        await f.assertProtected()
      })
    })
  }
})

test('cancellation after candidate publication rolls the exact pointer back', async () => {
  await withFixture(async (f) => {
    const control = new AbortController()
    await assert.rejects(
      f.controller.install({
        mode: 'repair',
        prepare: () => f.prepare(),
        qualify: async (_slot, phase) => {
          if (phase === 'after-activation') {
            control.abort()
          }
        },
        signal: control.signal,
      }),
      code('RUNTIME_INSTALL_CANCELED'),
    )
    assert.deepEqual(await fs.readFile(f.roots.pointerFile), f.oldPointer)
    assert.equal(JSON.parse(await fs.readFile(f.journal, 'utf8')).phase, 'rolled-back')
  })
})

test('another controller cannot enter while preparation awaits and the live claim persists', async () => {
  await withFixture(async (f) => {
    let release!: () => void
    let entered!: () => void
    const waiting = new Promise<void>((resolve) => {
      release = resolve
    })
    const started = new Promise<void>((resolve) => {
      entered = resolve
    })
    const installation = f.controller.install({
      mode: 'repair',
      prepare: async () => {
        entered()
        await waiting
        return f.prepare()
      },
      qualify: async () => {},
    })
    await started
    let secondPrepare = false
    const other = new RuntimeInstallationController(f.roots)
    await assert.rejects(
      other.install({
        mode: 'repair',
        prepare: async () => {
          secondPrepare = true
          return f.prepare('other')
        },
        qualify: async () => {},
      }),
      code('RUNTIME_INSTALL_BUSY'),
    )
    assert.equal(secondPrepare, false)
    assert.equal(await present(f.claim), true)
    release()
    await installation
    assert.equal(await present(f.claim), false)
  })
})

test('unconfirmed child exit retains claim, journal and incomplete slots instead of treating timeout as exit', async () => {
  await withFixture(async (f) => {
    const prepared = await f.prepare()
    await assert.rejects(
      f.controller.install({
        mode: 'repair',
        prepare: async () => prepared,
        qualify: async () => {
          throw Object.assign(new Error('Declared unconfirmed exit'), { exitConfirmed: false })
        },
      }),
      (error: unknown) =>
        code('RUNTIME_INSTALL_RECOVERY_REQUIRED')(error) &&
        'exitConfirmed' in (error as object) &&
        Reflect.get(error as object, 'exitConfirmed') === false,
    )
    assert.deepEqual(await fs.readFile(f.roots.pointerFile), f.oldPointer)
    assert.equal(await present(f.claim), true)
    assert.equal(JSON.parse(await fs.readFile(f.journal, 'utf8')).phase, 'recovery-required')
    await assert.rejects(
      new RuntimeInstallationController(f.roots).recover(),
      code('RUNTIME_INSTALL_BUSY'),
    )
    await f.assertProtected()
  })
})

test('new preparation cannot reuse the previous runtime ID or clear its old slot metadata', async () => {
  await withFixture(async (f) => {
    const supplied = await f.prepare()
    await assert.rejects(
      f.controller.install({
        mode: 'repair',
        prepare: async () => ({ ...supplied, runtimeId: 'previous' }),
        qualify: async () => {},
      }),
      code('RUNTIME_INSTALL_PREPARATION_INVALID'),
    )
    assert.deepEqual(await fs.readFile(f.roots.pointerFile), f.oldPointer)
    await f.assertProtected()
  })
})

test('prepared identity and environment are detached from caller-owned mutable input', async () => {
  await withFixture(async (f) => {
    const supplied = await f.prepare()
    const expected = pointer(supplied)
    await f.controller.install({
      mode: 'repair',
      prepare: async () => supplied,
      qualify: async (slot) => {
        supplied.runtimeId = 'caller-mutated'
        supplied.environment.SOURCE_MUTATION = 'unsafe'
        assert.equal(slot.runtimeId, 'next')
        assert.equal(slot.environment.SOURCE_MUTATION, undefined)
      },
    })
    assert.deepEqual(await fs.readFile(f.roots.pointerFile), expected)
  })
})

test('missing or wrong-owned incomplete markers prevent publication', async (t) => {
  for (const mode of ['missing', 'wrong-owner'] as const) {
    await t.test(mode, async () => {
      await withFixture(async (f) => {
        const prepared = await f.prepare()
        const marker = path.join(prepared.pythonRoot, OFFLINE_RUNTIME_INCOMPLETE_MARKER)
        await (mode === 'missing'
          ? fs.unlink(marker)
          : fs.writeFile(
              marker,
              JSON.stringify({
                releaseId: prepared.releaseId,
                runtimeId: 'someone-else',
                schemaVersion: 1,
              }),
            ))
        await assert.rejects(
          f.controller.install({
            mode: 'repair',
            prepare: async () => prepared,
            qualify: async () => {},
          }),
          code('RUNTIME_INSTALL_PREPARATION_INVALID'),
        )
        assert.deepEqual(await fs.readFile(f.roots.pointerFile), f.oldPointer)
        await f.assertProtected()
      })
    })
  }
})

test('a dead owner in a safe activation phase restores exactly the prior pointer and preserves both slots', async () => {
  await withFixture(async (f) => {
    const prepared = await f.prepare()
    await crashPrecondition(f, 'activated', prepared, { candidateCurrent: true })
    const result = await new RuntimeInstallationController(f.roots).recover()
    assert.equal(result, 'recovered')
    assert.deepEqual(await fs.readFile(f.roots.pointerFile), f.oldPointer)
    assert.equal(await present(prepared.environmentRoot), true)
    assert.equal(await present(prepared.pythonRoot), true)
    assert.equal(await present(f.claim), false)
    assert.equal(JSON.parse(await fs.readFile(f.journal, 'utf8')).phase, 'rolled-back')
    await f.assertProtected()
  })
})

test('safe prepublication recovery keeps the unchanged predecessor and never deletes prepared inputs', async () => {
  await withFixture(async (f) => {
    const prepared = await f.prepare()
    await crashPrecondition(f, 'activating', prepared)
    assert.equal(await f.controller.recover(), 'recovered')
    assert.deepEqual(await fs.readFile(f.roots.pointerFile), f.oldPointer)
    assert.equal(
      await present(path.join(prepared.environmentRoot, OFFLINE_RUNTIME_INCOMPLETE_MARKER)),
      true,
    )
    assert.equal(await present(f.claim), false)
  })
})

test('a completed dead-owner claim is released without undoing its already qualified pointer', async () => {
  await withFixture(async (f) => {
    const prepared = await f.prepare()
    await crashPrecondition(f, 'complete', prepared, { candidateCurrent: true })
    assert.equal(await f.controller.recover(), 'recovered')
    assert.deepEqual(await fs.readFile(f.roots.pointerFile), pointer(prepared))
    assert.equal(await present(f.claim), false)
    assert.equal(JSON.parse(await fs.readFile(f.journal, 'utf8')).phase, 'complete')
    await f.assertProtected()
  })
})

test('a journal candidate that differs from its exact prepared slot is corrupt recovery data', async () => {
  await withFixture(async (f) => {
    const prepared = await f.prepare()
    const { journal } = await crashPrecondition(f, 'activated', prepared)
    journal.candidatePointer = Buffer.from(
      JSON.stringify({
        pythonExecutable: prepared.pythonExecutable,
        runtimeId: 'other',
        schemaVersion: 1,
      }),
    ).toString('base64')
    await fs.writeFile(f.journal, JSON.stringify(journal))
    await assert.rejects(f.controller.recover(), code('RUNTIME_INSTALL_RECOVERY_REQUIRED'))
    assert.deepEqual(await fs.readFile(f.roots.pointerFile), f.oldPointer)
    assert.equal(await present(f.claim), true)
  })
})

test('recovery never overwrites an external pointer after an interrupted activation', async () => {
  await withFixture(async (f) => {
    const prepared = await f.prepare()
    await crashPrecondition(f, 'activated', prepared)
    const external = Buffer.from('External selected runtime\n')
    await fs.writeFile(f.roots.pointerFile, external)
    await assert.rejects(f.controller.recover(), code('RUNTIME_INSTALL_RECOVERY_REQUIRED'))
    assert.deepEqual(await fs.readFile(f.roots.pointerFile), external)
    assert.equal(await present(f.claim), true)
  })
})

test('an interrupted qualifying phase cannot prove orphan exit from only a dead parent PID', async () => {
  await withFixture(async (f) => {
    const prepared = await f.prepare()
    await crashPrecondition(f, 'post-qualifying', prepared, { candidateCurrent: true })
    await assert.rejects(f.controller.recover(), code('RUNTIME_INSTALL_RECOVERY_REQUIRED'))
    assert.deepEqual(await fs.readFile(f.roots.pointerFile), pointer(prepared))
    assert.equal(await present(f.claim), true)
    assert.equal(
      await present(path.join(f.roots.runtimeDir, RUNTIME_INSTALLATION_RECOVERY_CLAIM)),
      false,
    )
  })
})

test('corrupt claim or journal is retained and is never reset as an empty installation', async (t) => {
  for (const target of ['claim', 'journal'] as const) {
    await t.test(target, async () => {
      await withFixture(async (f) => {
        const file = target === 'claim' ? f.claim : f.journal
        await fs.writeFile(file, '{broken')
        await assert.rejects(f.controller.recover(), code('RUNTIME_INSTALL_RECOVERY_REQUIRED'))
        assert.equal(await fs.readFile(file, 'utf8'), '{broken')
        assert.deepEqual(await fs.readFile(f.roots.pointerFile), f.oldPointer)
      })
    })
  }
})

test('live process start identity blocks recovery, while an interrupted recovery sweep remains fail closed', async (t) => {
  await t.test('live installation', async () =>
    withFixture(async (f) => {
      const prepared = await f.prepare()
      await crashPrecondition(f, 'activated', prepared, { liveOwner: true })
      await assert.rejects(f.controller.recover(), code('RUNTIME_INSTALL_BUSY'))
      assert.deepEqual(await fs.readFile(f.roots.pointerFile), f.oldPointer)
    }),
  )
  await t.test('interrupted sweep', async () =>
    withFixture(async (f) => {
      const prepared = await f.prepare()
      const { claim } = await crashPrecondition(f, 'activated', prepared)
      const sweep = path.join(f.roots.runtimeDir, RUNTIME_INSTALLATION_RECOVERY_CLAIM)
      await fs.writeFile(sweep, JSON.stringify(claim))
      await assert.rejects(f.controller.recover(), code('RUNTIME_INSTALL_RECOVERY_REQUIRED'))
      assert.equal(await present(sweep), true)
      assert.equal(await present(f.claim), true)
    }),
  )
})

test('pointer symlinks and oversized raw pointer metadata refuse before slot preparation', async (t) => {
  for (const target of ['symlink', 'oversized'] as const) {
    await t.test(target, async () => {
      await withFixture(async (f) => {
        await fs.unlink(f.roots.pointerFile)
        const external = path.join(f.appData, 'preserved-pointer')
        await fs.writeFile(external, 'Protected external bytes')
        await (target === 'symlink'
          ? fs.symlink(external, f.roots.pointerFile)
          : fs.writeFile(f.roots.pointerFile, Buffer.alloc(16 * 1024 + 1, 1)))
        let prepared = false
        await assert.rejects(
          f.controller.install({
            mode: 'repair',
            prepare: async () => {
              prepared = true
              return f.prepare()
            },
            qualify: async () => {},
          }),
          code('RUNTIME_INSTALL_STORAGE_INVALID'),
        )
        assert.equal(prepared, false)
        assert.equal(await fs.readFile(external, 'utf8'), 'Protected external bytes')
      })
    })
  }
})

test('a replaced runtime directory cannot redirect this controller into a new inode namespace', async () => {
  await withFixture(async (f) => {
    await f.controller.readPointerSha256()
    const retained = path.join(f.appData, 'retained-runtime')
    await fs.rename(f.roots.runtimeDir, retained)
    await fs.mkdir(f.roots.runtimeDir, { mode: 0o700 })
    await fs.mkdir(f.roots.environmentsDir, { mode: 0o700 })
    await fs.mkdir(f.roots.pythonDir, { mode: 0o700 })
    await assert.rejects(f.controller.readPointerSha256(), code('RUNTIME_INSTALL_STORAGE_INVALID'))
    assert.deepEqual(await fs.readFile(path.join(retained, 'current-runtime.json')), f.oldPointer)
    assert.deepEqual(await fs.readdir(f.roots.runtimeDir), ['environments', 'python'])
  })
})
