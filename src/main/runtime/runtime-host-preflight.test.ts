/** Real filesystem/log ownership and preflight rules; command/host facts are controlled ports. */
import assert from 'node:assert/strict'
import { watch } from 'node:fs'
import * as fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import type {
  OfflineRuntimeCommand,
  OfflineRuntimeCommandResult,
} from './offline-runtime-assembly.js'
import type { RuntimeReleaseManifest } from './runtime-release.js'

import {
  hasUnconfirmedOfflineRuntimeCommands,
  runOfflineRuntimeCommand,
} from './offline-runtime-assembly.js'
import {
  preflightRuntimeHost,
  RuntimeHostPreflightError,
  type RuntimeHostPreflightOptions,
} from './runtime-host-preflight.js'

const requirements: RuntimeReleaseManifest['host'] = {
  arch: 'x64',
  cudaVersion: '12.6',
  glibcMinimum: '2.28',
  gpuArchitectures: ['sm_89'],
  minimumNvidiaDriver: '560.0',
  os: 'linux',
}
const valid = (stdout = '560.00.0, 8.9\n'): OfflineRuntimeCommandResult => ({
  code: 0,
  exitConfirmed: true,
  stderr: '',
  stdout,
})
const code =
  (expected: RuntimeHostPreflightError['code'], exitConfirmed = true) =>
  (error: unknown) => {
    assert.ok(error instanceof RuntimeHostPreflightError)
    assert.equal(error.code, expected)
    assert.equal(error.exitConfirmed, exitConfirmed)
    return true
  }
function deferred<T>() {
  let resolve!: (value: PromiseLike<T> | T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
async function withFixture(
  use: (
    options: RuntimeHostPreflightOptions,
    commands: OfflineRuntimeCommand[],
    root: string,
  ) => Promise<void>,
) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'igs-runtime-host-'))
  const logs = path.join(root, 'logs')
  await fs.mkdir(logs, { mode: 0o700 })
  const commands: OfflineRuntimeCommand[] = []
  const options: RuntimeHostPreflightOptions = {
    commandRunner: async (command) => {
      commands.push(command)
      return valid()
    },
    logDirectory: logs,
    readHost: () => ({ arch: 'x64', glibcVersion: '2.39', platform: 'linux' }),
  }
  try {
    await use(options, commands, root)
  } finally {
    if (!hasUnconfirmedOfflineRuntimeCommands()) {
      await fs.rm(root, { force: true, recursive: true })
    }
  }
}

test('exact or newer numeric floors pass through a bounded NVIDIA query with restricted environment', async (t) => {
  for (const driver of ['560.0', '560.00.0', '560.10.2', '615.27.02']) {
    await t.test(driver, async () =>
      withFixture(async (options, commands) => {
        const original = options.commandRunner!
        options.commandRunner = async (command) => {
          await original(command)
          return valid(`${driver}, 8.9\r\n`)
        }
        const receipt = await preflightRuntimeHost(requirements, options)
        assert.equal(receipt.scope, 'host-preflight')
        assert.equal(receipt.platform, 'linux')
        assert.equal(receipt.arch, 'x64')
        assert.equal(receipt.glibcVersion, '2.39')
        assert.deepEqual(receipt.gpus, [{ architecture: 'sm_89', driverVersion: driver }])
        assert.deepEqual(receipt.requirements, requirements)
        assert.equal(commands.length, 1)
        const command = commands[0]
        assert.equal(command.executable, '/usr/bin/nvidia-smi')
        assert.deepEqual(command.args, [
          '--query-gpu=driver_version,compute_cap',
          '--format=csv,noheader,nounits',
        ])
        assert.deepEqual(command.environment, { LANG: 'C', LC_ALL: 'C', PATH: '/usr/bin:/bin' })
        assert.equal(command.cwd, '/')
        assert.equal(path.basename(command.logPath), path.basename(receipt.logPath))
        assert.match(command.logPath, /^\/proc\/self\/fd\/\d+\//)
        assert.equal((await fs.stat(receipt.logPath)).mode & 0o777, 0o600)
        assert.equal(command.signal?.aborted, false)
      }),
    )
  }
})

test('non-Linux or non-x64 refuses without creating a log or running a command', async (t) => {
  for (const facts of [
    { arch: 'x64', platform: 'win32' },
    { arch: 'arm64', platform: 'linux' },
  ]) {
    await t.test(`${facts.platform}/${facts.arch}`, async () =>
      withFixture(async (options, commands) => {
        options.readHost = () => ({ ...facts, glibcVersion: '2.39' })
        await assert.rejects(
          preflightRuntimeHost(requirements, options),
          code('RUNTIME_HOST_UNSUPPORTED'),
        )
        assert.deepEqual(commands, [])
        assert.deepEqual(await fs.readdir(options.logDirectory), [])
      }),
    )
  }
})

test('unknown/musl, malformed and older libc versions fail before NVIDIA inspection', async (t) => {
  for (const glibcVersion of [null, '', 'musl', '2.9', '2.27', '2.28-preview']) {
    await t.test(String(glibcVersion), async () =>
      withFixture(async (options, commands) => {
        options.readHost = () => ({ arch: 'x64', glibcVersion, platform: 'linux' })
        await assert.rejects(
          preflightRuntimeHost(requirements, options),
          code('RUNTIME_HOST_GLIBC_UNSUPPORTED'),
        )
        assert.deepEqual(commands, [])
        assert.deepEqual(await fs.readdir(options.logDirectory), [])
      }),
    )
  }
})

test('numeric comparison treats 2.9 below 2.10 and preserves exact glibc equality', async () =>
  withFixture(async (options) => {
    const requested = { ...requirements, glibcMinimum: '2.10' }
    options.readHost = () => ({ arch: 'x64', glibcVersion: '2.9', platform: 'linux' })
    await assert.rejects(
      preflightRuntimeHost(requested, options),
      code('RUNTIME_HOST_GLIBC_UNSUPPORTED'),
    )
    options.readHost = () => ({ arch: 'x64', glibcVersion: '2.10', platform: 'linux' })
    assert.equal((await preflightRuntimeHost(requested, options)).glibcVersion, '2.10')
  }))

test('malformed requirements and extended deadlines cannot reach the process port', async (t) => {
  const changes: ((host: RuntimeReleaseManifest['host']) => void)[] = [
    (host) => Reflect.set(host, 'glibcMinimum', 'unknown'),
    (host) => Reflect.set(host, 'minimumNvidiaDriver', '99999999999999999999.0'),
    (host) => Reflect.set(host, 'cudaVersion', '12'),
    (host) => Reflect.set(host, 'gpuArchitectures', []),
    (host) => Reflect.set(host, 'gpuArchitectures', Array.from({ length: 1 })),
    (host) => Reflect.set(host, 'gpuArchitectures', ['sm_89', 'sm_89']),
  ]
  for (const [index, change] of changes.entries()) {
    await t.test(String(index), async () =>
      withFixture(async (options, commands) => {
        const changed = structuredClone(requirements)
        change(changed)
        await assert.rejects(
          preflightRuntimeHost(changed, options),
          code('RUNTIME_HOST_REQUIREMENTS_INVALID'),
        )
        assert.deepEqual(commands, [])
      }),
    )
  }
  await withFixture(async (options, commands) => {
    for (const probeDeadlineMs of [0, 3001, 1.5, NaN]) {
      await assert.rejects(
        preflightRuntimeHost(requirements, { ...options, probeDeadlineMs }),
        code('RUNTIME_HOST_REQUIREMENTS_INVALID'),
      )
    }
    assert.deepEqual(commands, [])
  })
})

test('empty, partial, banner/header, N/A and malformed GPU output never become CPU fallback', async (t) => {
  for (const stdout of [
    '',
    '\n',
    'Driver Version, Compute Capability\n',
    'GPU0 NVIDIA RTX',
    '560.0, N/A',
    'N/A, 8.9',
    '560.0, 8.9, extra',
    '560.0, 8.10',
    '560.0, 0.0',
    '560.0, 8.9\n\n560.0, 8.9',
  ]) {
    await t.test(JSON.stringify(stdout), async () =>
      withFixture(async (options) => {
        options.commandRunner = async () => valid(stdout)
        await assert.rejects(
          preflightRuntimeHost(requirements, options),
          code('RUNTIME_HOST_PROBE_FAILED'),
        )
      }),
    )
  }
})

test('every reported GPU must satisfy the signed driver floor and exact architecture allowlist', async (t) => {
  for (const [stdout, expected] of [
    ['559.99, 8.9', 'RUNTIME_HOST_DRIVER_UNSUPPORTED'],
    ['560.0, 8.9\n559.99, 8.9', 'RUNTIME_HOST_DRIVER_UNSUPPORTED'],
    ['560.0, 8.9\n560.0, 8.6', 'RUNTIME_HOST_GPU_UNSUPPORTED'],
  ] as const) {
    await t.test(stdout, async () =>
      withFixture(async (options) => {
        options.commandRunner = async () => valid(stdout)
        await assert.rejects(preflightRuntimeHost(requirements, options), code(expected))
      }),
    )
  }
  await withFixture(async (options) => {
    options.commandRunner = async () => valid('560.0, 8.9\n560.0, 10.0')
    const receipt = await preflightRuntimeHost(
      { ...requirements, gpuArchitectures: ['sm_89', 'sm_100'] },
      options,
    )
    assert.deepEqual(
      receipt.gpus.map((gpu) => gpu.architecture),
      ['sm_89', 'sm_100'],
    )
    options.commandRunner = async () => valid('560.0, 9.0')
    await assert.rejects(
      preflightRuntimeHost({ ...requirements, gpuArchitectures: ['sm_90a'] }, options),
      code('RUNTIME_HOST_GPU_UNSUPPORTED'),
    )
  })
})

test('nonzero code, excessive metadata bytes and excessive GPU rows refuse', async (t) => {
  const results = [
    { ...valid(), code: 1 },
    valid('x'.repeat(64 * 1024 + 1)),
    { ...valid(), stderr: 'x'.repeat(64 * 1024) },
    valid(Array.from({ length: 65 }, () => '560.0, 8.9').join('\n')),
  ]
  for (const [index, result] of results.entries()) {
    await t.test(String(index), async () =>
      withFixture(async (options) => {
        options.commandRunner = async () => result
        await assert.rejects(
          preflightRuntimeHost(requirements, options),
          code('RUNTIME_HOST_PROBE_FAILED'),
        )
      }),
    )
  }
})

test('receipt and requirements own detached immutable facts without claiming CUDA runtime qualification', async () =>
  withFixture(async (options) => {
    const mutable = { ...requirements, gpuArchitectures: [...requirements.gpuArchitectures] }
    const original = options.commandRunner!
    options.commandRunner = async (command) => {
      mutable.gpuArchitectures.splice(0, 1, 'sm_86')
      return original(command)
    }
    const receipt = await preflightRuntimeHost(mutable, options)
    assert.deepEqual(receipt.requirements.gpuArchitectures, ['sm_89'])
    assert.ok(
      Object.isFrozen(receipt) &&
        Object.isFrozen(receipt.requirements) &&
        Object.isFrozen(receipt.requirements.gpuArchitectures) &&
        Object.isFrozen(receipt.gpus) &&
        Object.isFrozen(receipt.gpus[0]),
    )
    assert.equal(receipt.scope, 'host-preflight')
    assert.equal('qualified' in receipt, false)
  }))

test('already canceled inspection does not create a log or run a command', async () =>
  withFixture(async (options, commands) => {
    const controller = new AbortController()
    controller.abort()
    await assert.rejects(
      preflightRuntimeHost(requirements, { ...options, signal: controller.signal }),
      code('RUNTIME_HOST_CANCELED'),
    )
    assert.deepEqual(commands, [])
    assert.deepEqual(await fs.readdir(options.logDirectory), [])
  }))

test('external cancel and three-second bounded deadline await the command physical-close contract', async (t) => {
  for (const kind of ['external', 'deadline'] as const) {
    await t.test(kind, async () =>
      withFixture(async (options) => {
        const aborted = deferred<void>()
        const closed = deferred<void>()
        const seen = deferred<OfflineRuntimeCommand>()
        const controller = new AbortController()
        options.commandRunner = async (command) => {
          seen.resolve(command)
          await new Promise<void>((resolve) => {
            const observe = () => {
              aborted.resolve()
              resolve()
            }
            command.signal?.addEventListener('abort', observe, { once: true })
            if (command.signal?.aborted) {
              observe()
            }
          })
          await closed.promise
          return valid()
        }
        const operation = preflightRuntimeHost(requirements, {
          ...options,
          probeDeadlineMs: kind === 'deadline' ? 2 : 3000,
          signal: controller.signal,
        })
        let settled = false
        void operation.then(
          () => {
            settled = true
          },
          () => {
            settled = true
          },
        )
        const assertion = assert.rejects(
          operation,
          code(kind === 'deadline' ? 'RUNTIME_HOST_TIMEOUT' : 'RUNTIME_HOST_CANCELED'),
        )
        await seen.promise
        if (kind === 'external') {
          controller.abort()
        }
        await aborted.promise
        await new Promise<void>((resolve) => setImmediate(resolve))
        assert.equal(settled, false, 'Elapsed deadline or abort is not physical exit')
        closed.resolve()
        await assertion
        assert.equal(settled, true)
      }),
    )
  }
})

test('unconfirmed exit dominates generic failure or timeout and preserves the false exit fence', async (t) => {
  for (const thrown of [false, true]) {
    await t.test(String(thrown), async () =>
      withFixture(async (options) => {
        options.commandRunner = async () => {
          if (thrown) {
            throw Object.assign(new Error('Controlled unconfirmed command'), {
              exitConfirmed: false,
            })
          }
          return { ...valid(), exitConfirmed: false }
        }
        await assert.rejects(
          preflightRuntimeHost(requirements, options),
          code('RUNTIME_HOST_EXIT_UNCONFIRMED', false),
        )
      }),
    )
  }
})

test('missing/erroring NVIDIA command and unreadable host facts fail with a stable diagnostic', async () =>
  withFixture(async (options) => {
    options.commandRunner = async () => {
      throw Object.assign(new Error('not found'), { code: 'ENOENT' })
    }
    await assert.rejects(
      preflightRuntimeHost(requirements, options),
      code('RUNTIME_HOST_PROBE_FAILED'),
    )
    options.readHost = () => {
      throw new Error('Unavailable report')
    }
    await assert.rejects(
      preflightRuntimeHost(requirements, options),
      code('RUNTIME_HOST_PROBE_FAILED'),
    )
  }))

test('relative/noncanonical/symlink log locations refuse and never write through an external directory', async (t) => {
  for (const kind of ['relative', 'noncanonical', 'symlink'] as const) {
    await t.test(kind, async () =>
      withFixture(async (options, commands, root) => {
        const external = path.join(root, 'preserved')
        await fs.mkdir(external)
        if (kind === 'relative') {
          options.logDirectory = 'relative'
        }
        if (kind === 'noncanonical') {
          options.logDirectory += '/.'
        }
        if (kind === 'symlink') {
          options.logDirectory = path.join(root, 'linked')
          await fs.symlink(external, options.logDirectory)
        }
        await assert.rejects(
          preflightRuntimeHost(requirements, options),
          code('RUNTIME_HOST_STORAGE_INVALID'),
        )
        assert.deepEqual(commands, [])
        assert.deepEqual(await fs.readdir(external), [])
      }),
    )
  }
})

test('replacing the log directory during a query cannot publish a successful receipt', async () =>
  withFixture(async (options, commands, root) => {
    const original = options.commandRunner!
    options.commandRunner = async (command) => {
      await fs.rename(options.logDirectory, path.join(root, 'prior-logs'))
      await fs.mkdir(options.logDirectory)
      return original(command)
    }
    await assert.rejects(
      preflightRuntimeHost(requirements, options),
      code('RUNTIME_HOST_STORAGE_INVALID'),
    )
    assert.equal(commands.length, 1)
  }))

test('a replaced log parent cannot redirect the actual command append into an outside file', async () =>
  withFixture(async (options, _commands, root) => {
    const outside = path.join(root, 'outside')
    const moved = path.join(root, 'owned-logs-moved')
    await fs.mkdir(outside)
    let foreignLog = ''
    options.commandRunner = async (command) => {
      await fs.rename(options.logDirectory, moved)
      await fs.symlink(outside, options.logDirectory)
      foreignLog = path.join(outside, path.basename(command.logPath))
      await fs.writeFile(foreignLog, 'Preserved outside bytes\n', { flag: 'wx' })
      return runOfflineRuntimeCommand({
        ...command,
        args: ['-e', String.raw`process.stdout.write("560.0, 8.9\n")`],
        executable: process.execPath,
      })
    }
    await assert.rejects(
      preflightRuntimeHost(requirements, options),
      code('RUNTIME_HOST_STORAGE_INVALID'),
    )
    assert.equal(await fs.readFile(foreignLog, 'utf8'), 'Preserved outside bytes\n')
    assert.match(
      await fs.readFile(path.join(moved, path.basename(foreignLog)), 'utf8'),
      /560\.0, 8\.9/,
    )
  }))

test('replacing the created log with a hardlink cannot redirect actual command output', async () =>
  withFixture(async (options, _commands, root) => {
    const foreign = path.join(root, 'preserved-foreign-file')
    await fs.writeFile(foreign, 'Preserved outside bytes\n', { flag: 'wx' })
    options.commandRunner = async (command) => {
      await fs.unlink(command.logPath)
      await fs.link(foreign, command.logPath)
      return runOfflineRuntimeCommand({
        ...command,
        args: ['-e', String.raw`process.stdout.write("560.0, 8.9\n")`],
        executable: process.execPath,
      })
    }
    const result = await preflightRuntimeHost(requirements, options).then(
      (value) => value,
      (error) => error,
    )
    assert.equal(await fs.readFile(foreign, 'utf8'), 'Preserved outside bytes\n')
    assert.ok(code('RUNTIME_HOST_PROBE_FAILED')(result))
  }))

test(
  'actual owned command cancellation forwards abort and confirms physical process exit',
  { timeout: 15_000 },
  async () =>
    withFixture(async (options, _commands, root) => {
      // An actual owned Node child, not nvidia-smi or CUDA. Only the executable is a test input;
      // command spawning, cancellation and the physical group-exit fence use the production owner.
      assert.ok(
        !/\s/.test(process.execPath),
        'Fixture shebang requires a whitespace-free Node path',
      )
      const executable = path.join(root, 'owned-nvidia-query')
      const readyFile = path.join(root, 'owned-query-ready')
      await fs.writeFile(
        executable,
        `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(readyFile)},String(process.pid));setInterval(()=>{},1000)\n`,
        { flag: 'wx', mode: 0o700 },
      )
      const ready = deferred<number>()
      const watcher = watch(root, (_event, filename) => {
        if (filename !== path.basename(readyFile)) {
          return
        }
        void fs.readFile(readyFile, 'utf8').then(
          (text) => {
            if (/^[1-9]\d*$/.test(text)) {
              ready.resolve(Number(text))
            }
          },
          () => {},
        )
      })
      let readyTimer: ReturnType<typeof setTimeout> | undefined
      const readiness = Promise.race([
        ready.promise,
        new Promise<never>((_resolve, reject) => {
          readyTimer = setTimeout(
            () => reject(new Error('Owned command did not signal readiness')),
            5000,
          )
        }),
      ])
      const controller = new AbortController()
      const operation = preflightRuntimeHost(requirements, {
        logDirectory: options.logDirectory,
        nvidiaSmiExecutable: executable,
        readHost: options.readHost,
        signal: controller.signal,
      })
      const settled = operation.then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      )
      try {
        const pid = await readiness
        controller.abort()
        const result = await settled
        assert.ok('error' in result)
        assert.ok(code('RUNTIME_HOST_CANCELED')(result.error))
        assert.throws(
          () => process.kill(pid, 0),
          (error: unknown) => error instanceof Error && 'code' in error && error.code === 'ESRCH',
        )
        assert.equal(hasUnconfirmedOfflineRuntimeCommands(), false)
      } finally {
        controller.abort()
        await settled
        clearTimeout(readyTimer)
        watcher.close()
      }
    }),
)
