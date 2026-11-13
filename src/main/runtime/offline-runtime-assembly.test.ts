import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { existsSync } from 'node:fs'
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  readlink,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import * as yazl from 'yazl'

import { createRuntimeRoots } from './index.js'
import {
  assembleOfflineRuntime,
  hasUnconfirmedOfflineRuntimeCommands,
  OFFLINE_RUNTIME_INCOMPLETE_MARKER,
  OfflineRuntimeAssemblyError,
  type OfflineRuntimeCommand,
  type OfflineRuntimeCommandResult,
  runOfflineRuntimeCommand,
} from './offline-runtime-assembly.js'
import {
  canonicalRuntimeReleaseJson,
  PINNED_RUNTIME_CONFIG_FILES,
  type RuntimeReleaseFile,
  type RuntimeReleaseManifest,
  runtimeReleaseRequirements,
  type VerifiedRuntimeRelease,
  verifyRuntimeRelease,
} from './runtime-release.js'

const configuration = process.env.IGS_RUNTIME_RELEASE_CONFIG_FIXTURE
const actualConfig = { skip: !configuration }
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const workerBytes = Buffer.from("__version__ = '0.1.0'\n")
const failure = (code: string) => (error: unknown) =>
  error instanceof OfflineRuntimeAssemblyError && error.code === code

test('default command execution captures bounded output and confirms its isolated owned process scope exit', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-offline-command-'))
  try {
    const logPath = path.join(root, 'command.log')
    await writeFile(logPath, '', { flag: 'wx', mode: 0o600 })
    const result = await runOfflineRuntimeCommand({
      args: [
        '-e',
        "process.stdout.write('owned metadata'); process.stderr.write('owned diagnostic')",
      ],
      cwd: root,
      environment: { LANG: 'C.UTF-8', PATH: '/usr/bin:/bin' },
      executable: process.execPath,
      logPath,
    })
    assert.equal(result.code, 0)
    assert.equal(result.exitConfirmed, true)
    assert.equal(result.stdout, 'owned metadata')
    assert.equal(result.stderr, 'owned diagnostic')
    const log = await readFile(logPath, 'utf8')
    assert.ok(log.includes(result.stdout) && log.includes(result.stderr))
    assert.equal(hasUnconfirmedOfflineRuntimeCommands(), false)
  } finally {
    if (!hasUnconfirmedOfflineRuntimeCommands()) {
      await rm(root, { force: true, recursive: true })
    }
  }
})

test('default command cancellation observes actual close before reporting a confirmed canceled assembly', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-offline-cancel-'))
  let safeToRemove = false
  try {
    const logPath = path.join(root, 'command.log')
    const ready = path.join(root, 'ready')
    await writeFile(logPath, '', { flag: 'wx', mode: 0o600 })
    const controller = new AbortController()
    const running = runOfflineRuntimeCommand({
      args: [
        '-e',
        "require('node:fs').writeFileSync(process.argv[1],String(process.pid)); setInterval(()=>{},1000)",
        ready,
      ],
      cwd: root,
      environment: { LANG: 'C.UTF-8', PATH: '/usr/bin:/bin' },
      executable: process.execPath,
      logPath,
      signal: controller.signal,
    })
    // Attach rejection handling before readiness polling, so a spawn error cannot
    // become an unhandled rejection or leave an owned invocation uncanceled.
    const settled = running.then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    )
    let pid: number | undefined, readinessError: unknown
    try {
      for (let attempt = 0; attempt < 100 && !existsSync(ready); attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      assert.ok(existsSync(ready), 'Owned child must reach readiness before cancellation')
      pid = Number(await readFile(ready, 'utf8'))
    } catch (error) {
      readinessError = error
    } finally {
      controller.abort()
    }
    const result = await settled
    safeToRemove =
      !hasUnconfirmedOfflineRuntimeCommands() &&
      (!('error' in result) ||
        !(result.error instanceof OfflineRuntimeAssemblyError) ||
        result.error.exitConfirmed)
    if (readinessError) {
      throw readinessError
    }
    assert.ok('error' in result)
    assert.ok(result.error instanceof OfflineRuntimeAssemblyError)
    assert.equal(result.error.code, 'RUNTIME_ASSEMBLY_CANCELED')
    assert.equal(result.error.exitConfirmed, true)
    assert.equal(hasUnconfirmedOfflineRuntimeCommands(), false)
    assert.ok(pid)
    assert.throws(
      () => process.kill(pid, 0),
      (error: unknown) => (error as NodeJS.ErrnoException).code === 'ESRCH',
    )
  } finally {
    if (safeToRemove) {
      await rm(root, { force: true, recursive: true })
    }
  }
})

async function workerWheel(): Promise<Buffer> {
  const chunks: Buffer[] = []
  const zip = new yazl.ZipFile()
  zip.addBuffer(workerBytes, 'imagegen_worker/__init__.py')
  zip.addBuffer(
    Buffer.from('Metadata-Version: 2.1\nName: imagegen-worker\nVersion: 0.1.0\n'),
    'imagegen_worker-0.1.0.dist-info/METADATA',
  )
  const result = new Promise<Buffer>((resolve, reject) => {
    zip.outputStream.on('data', (bytes: Buffer) => chunks.push(bytes))
    zip.outputStream.once('end', () => resolve(Buffer.concat(chunks)))
    zip.outputStream.once('error', reject)
  })
  zip.end()
  return await result
}

/**
 * Real signed source inventory, copies, wheel ZIP, final paths and files. Only subprocess execution
 * is controlled here; this is not uv/Python/CUDA release qualification.
 */
async function withAssembly(
  use: (fixture: {
    commands: OfflineRuntimeCommand[]
    environmentRoot: string
    inspection: Record<string, unknown>
    manifest: RuntimeReleaseManifest
    pythonRoot: string
    release: VerifiedRuntimeRelease
    root: string
    roots: Awaited<ReturnType<typeof createRuntimeRoots>>
    runner: (command: OfflineRuntimeCommand) => Promise<OfflineRuntimeCommandResult>
    source: string
  }) => Promise<void>,
): Promise<void> {
  assert.ok(configuration, 'Provide the exact read-only 17-file config fixture')
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-offline-assembly-'))
  try {
    const roots = await createRuntimeRoots(path.join(root, 'app'))
    const source = path.join(root, 'release')
    await mkdir(source)
    const payload = new Map<string, { bytes: Buffer; executable: boolean }>([
      [
        'python/bin/python3.12',
        {
          bytes: Buffer.from('declared Python binary; command transport is controlled'),
          executable: true,
        },
      ],
      [
        'uv/uv',
        {
          bytes: Buffer.from('declared uv binary; command transport is controlled'),
          executable: true,
        },
      ],
      [
        'wheels/imagegen_worker-0.1.0-py3-none-any.whl',
        { bytes: await workerWheel(), executable: false },
      ],
    ])
    for (const [name, sha256] of Object.entries(PINNED_RUNTIME_CONFIG_FILES)) {
      const bytes: Buffer = await readFile(path.join(configuration, name))
      assert.equal(
        digest(bytes),
        sha256,
        `External fixture must contain exact pinned bytes: ${name}`,
      )
      payload.set(`config/${name}`, { bytes, executable: false })
    }
    const wheel = payload.get('wheels/imagegen_worker-0.1.0-py3-none-any.whl')!.bytes
    let manifest: RuntimeReleaseManifest = {
      appVersion: '1.0.0',
      configPath: 'config',
      files: [],
      host: {
        arch: 'x64',
        cudaVersion: '12.6',
        glibcMinimum: '2.35',
        gpuArchitectures: ['sm_89'],
        minimumNvidiaDriver: '535.0',
        os: 'linux',
      },
      lockSha256: digest(Buffer.from('declared exact test graph')),
      profile: 'linux-nvidia',
      python: {
        buildId: 'declared-python-build',
        executable: 'python/bin/python3.12',
        version: '3.12.13',
      },
      releaseId: 'signed-test-release',
      requiredFreeBytes: 1024 * 1024 * 1024,
      requirementsPath: 'requirements.txt',
      schemaVersion: 1,
      uv: { executable: 'uv/uv', version: '0.11.11' },
      wheels: [
        {
          distribution: 'imagegen-worker',
          path: 'wheels/imagegen_worker-0.1.0-py3-none-any.whl',
          sha256: digest(wheel),
          sizeBytes: wheel.length,
          version: '0.1.0',
        },
      ],
      worker: {
        cpuVersion: '0.1.0',
        distribution: 'imagegen-worker',
        distributionVersion: '0.1.0',
        inferenceVersion: '0.14.0',
        protocolVersion: '1',
      },
    }
    payload.set('requirements.txt', {
      bytes: Buffer.from(runtimeReleaseRequirements(manifest)),
      executable: false,
    })
    const files: RuntimeReleaseFile[] = []
    for (const [name, item] of payload) {
      const target = path.join(source, name)
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, item.bytes, { flag: 'wx', mode: item.executable ? 0o700 : 0o600 })
      files.push({
        executable: item.executable,
        kind: 'file',
        path: name,
        sha256: digest(item.bytes),
        sizeBytes: item.bytes.length,
      })
    }
    await symlink('python3.12', path.join(source, 'python/bin/python'))
    manifest = {
      ...manifest,
      files: [...files, { kind: 'symlink', path: 'python/bin/python', target: 'python3.12' }],
    }
    const bytes = canonicalRuntimeReleaseJson(manifest)
    const keys = generateKeyPairSync('ed25519')
    const envelope = Buffer.from(
      JSON.stringify({
        keyId: 'test-key',
        payload: bytes.toString('base64'),
        schemaVersion: 1,
        signature: sign(null, bytes, keys.privateKey).toString('base64'),
      }),
    )
    const release = await verifyRuntimeRelease({
      appVersion: '1.0.0',
      directory: source,
      envelope,
      trustedKeys: {
        'test-key': keys.publicKey.export({ format: 'pem', type: 'spki' }).toString(),
      },
    })
    const environmentRoot = path.join(roots.environmentsDir, 'runtime-a')
    const pythonRoot = path.join(roots.pythonDir, 'runtime-a')
    const site = path.join(environmentRoot, 'lib/python3.12/site-packages')
    const inspection: Record<string, unknown> = {
      basePrefix: pythonRoot,
      packages: [{ direct: {}, name: 'imagegen-worker', root: site, version: '0.1.0' }],
      prefix: environmentRoot,
      pythonVersion: '3.12.13',
      workerFiles: { '__init__.py': { bytes: workerBytes.length, sha256: digest(workerBytes) } },
      workerRoot: path.join(site, 'imagegen_worker'),
    }
    const commands: OfflineRuntimeCommand[] = []
    const runner = async (command: OfflineRuntimeCommand): Promise<OfflineRuntimeCommandResult> => {
      commands.push(structuredClone({ ...command, signal: undefined }))
      let stdout = ''
      if (command.args[0] === '--version') {
        stdout = 'uv 0.11.11 (test-build 2026-11-13)\n'
      } else if (command.args.includes('venv')) {
        await mkdir(path.join(environmentRoot, 'bin'))
        await symlink(
          path.join(pythonRoot, 'bin/python3.12'),
          path.join(environmentRoot, 'bin/python'),
        )
      } else if (command.args.includes('sync')) {
        await mkdir(path.join(site, 'imagegen_worker'), { recursive: true })
        await writeFile(path.join(site, 'imagegen_worker/__init__.py'), workerBytes)
      } else if (command.args.some((value) => value.includes('importlib.metadata'))) {
        stdout = JSON.stringify(inspection)
      } else if (command.executable.endsWith('python3.12')) {
        stdout = JSON.stringify({
          basePrefix: pythonRoot,
          prefix: pythonRoot,
          pythonVersion: '3.12.13',
        })
      }
      return { code: 0, exitConfirmed: true, stderr: '', stdout }
    }
    await use({
      commands,
      environmentRoot,
      inspection,
      manifest,
      pythonRoot,
      release,
      root,
      roots,
      runner,
      source,
    })
  } finally {
    await rm(root, { force: true, recursive: true })
  }
}

test(
  'offline assembly copies exact signed inputs into fresh final slots and leaves both durable markers unpublished',
  actualConfig,
  async () => {
    await withAssembly(async (f) => {
      const previous = Buffer.from('{"previous":"known-good"}\n')
      await writeFile(f.roots.pointerFile, previous)
      const result = await assembleOfflineRuntime({
        commandRunner: f.runner,
        release: f.release,
        roots: f.roots,
        runtimeId: 'runtime-a',
      })
      assert.equal(result.environmentRoot, f.environmentRoot)
      assert.equal(result.pythonRoot, f.pythonRoot)
      assert.equal(result.pythonExecutable, path.join(f.environmentRoot, 'bin/python'))
      assert.equal(
        result.environment.IGS_SDXL_CONFIG_DIR,
        path.join(f.environmentRoot, 'resources/sdxl-config'),
      )
      assert.equal(Object.hasOwn(result.environment, 'CUDA_VISIBLE_DEVICES'), false)
      assert.equal(await readlink(path.join(f.pythonRoot, 'bin/python')), 'python3.12')
      for (const root of [f.environmentRoot, f.pythonRoot]) {
        assert.deepEqual(
          JSON.parse(await readFile(path.join(root, OFFLINE_RUNTIME_INCOMPLETE_MARKER), 'utf8')),
          { releaseId: f.manifest.releaseId, runtimeId: 'runtime-a', schemaVersion: 1 },
        )
      }
      assert.deepEqual(await readFile(f.roots.pointerFile), previous)
      await f.release.verifyCompletePayloadSnapshot()
      assert.ok(existsSync(path.join(f.environmentRoot, 'runtime-installation.json')))
    })
  },
)

test(
  'the exact command consumer is offline/no-index/no-build/hash-only and never inherits caller environment overrides',
  actualConfig,
  async () => {
    await withAssembly(async (f) => {
      await assembleOfflineRuntime({
        commandRunner: f.runner,
        release: f.release,
        roots: f.roots,
        runtimeId: 'runtime-a',
      })
      assert.equal(f.commands.length, 6)
      const sync = f.commands.find((command) => command.args.includes('sync'))!
      assert.ok(
        sync.args.includes('--require-hashes') &&
          sync.args.includes('--no-index') &&
          sync.args.includes('--no-build') &&
          sync.args.includes('--offline') &&
          sync.args.includes('--no-config'),
      )
      assert.ok(
        !sync.args.some(
          (value) =>
            value.includes('https://') ||
            value.includes('--inexact') ||
            value.includes('--editable'),
        ),
      )
      assert.equal(
        await readFile(sync.args.at(-1)!, 'utf8'),
        runtimeReleaseRequirements(f.manifest),
      )
      for (const command of f.commands) {
        assert.ok(path.isAbsolute(command.executable))
        assert.equal(command.environment.CUDA_VISIBLE_DEVICES, '')
        assert.equal(command.environment.UV_OFFLINE, '1')
        assert.equal(command.environment.UV_PYTHON_DOWNLOADS, 'never')
        assert.equal(command.environment.PATH, '/usr/bin:/bin')
        for (const key of [
          'PYTHONPATH',
          'PYTHONHOME',
          'PIP_INDEX_URL',
          'UV_INDEX',
          'UV_EXTRA_INDEX_URL',
          'UV_FIND_LINKS',
          'VIRTUAL_ENV',
          'HOME',
        ]) {
          assert.equal(Object.hasOwn(command.environment, key), false)
        }
      }
    })
  },
)

test(
  'a pre-existing environment or Python target is refused before any slot/log write or command',
  actualConfig,
  async (t) => {
    for (const target of ['environmentRoot', 'pythonRoot'] as const) {
      await t.test(target, async () =>
        withAssembly(async (f) => {
          await mkdir(f[target])
          await writeFile(path.join(f[target], 'user-data'), 'preserve')
          await assert.rejects(
            assembleOfflineRuntime({
              commandRunner: f.runner,
              release: f.release,
              roots: f.roots,
              runtimeId: 'runtime-a',
            }),
            failure('RUNTIME_ASSEMBLY_EXISTS'),
          )
          assert.equal(await readFile(path.join(f[target], 'user-data'), 'utf8'), 'preserve')
          assert.equal(
            existsSync(f[target === 'environmentRoot' ? 'pythonRoot' : 'environmentRoot']),
            false,
          )
          assert.deepEqual(await readdir(f.roots.workerLogsDir), [])
          assert.equal(f.commands.length, 0)
        }),
      )
    }
  },
)

test('a symlinked runtime root refuses rather than writing through it', actualConfig, async () => {
  await withAssembly(async (f) => {
    const original = f.roots.pythonDir
    await rm(original, { recursive: true })
    const outside = path.join(f.root, 'outside')
    await mkdir(outside)
    await symlink(outside, original)
    await assert.rejects(
      assembleOfflineRuntime({
        commandRunner: f.runner,
        release: f.release,
        roots: f.roots,
        runtimeId: 'runtime-a',
      }),
      failure('RUNTIME_ASSEMBLY_STORAGE_INVALID'),
    )
    assert.deepEqual(await readdir(outside), [])
    assert.equal(f.commands.length, 0)
  })
})

test(
  'source tampering fails the real verifier before either executable can run',
  actualConfig,
  async () => {
    await withAssembly(async (f) => {
      await writeFile(path.join(f.source, 'uv/uv'), 'changed executable')
      await assert.rejects(
        assembleOfflineRuntime({
          commandRunner: f.runner,
          release: f.release,
          roots: f.roots,
          runtimeId: 'runtime-a',
        }),
      )
      assert.equal(f.commands.length, 0)
      assert.equal(existsSync(f.environmentRoot), false)
      assert.equal(existsSync(f.pythonRoot), false)
    })
  },
)

test(
  'copied executable tampering is detected before the first command and retained with incomplete markers',
  actualConfig,
  async () => {
    await withAssembly(async (f) => {
      let snapshots = 0
      const release: VerifiedRuntimeRelease = {
        ...f.release,
        verifyCompletePayloadSnapshot: async () => {
          await f.release.verifyCompletePayloadSnapshot()
          if (++snapshots === 2) {
            await writeFile(path.join(f.pythonRoot, 'bin/python3.12'), 'tampered destination')
          }
        },
      }
      await assert.rejects(
        assembleOfflineRuntime({
          commandRunner: f.runner,
          release,
          roots: f.roots,
          runtimeId: 'runtime-a',
        }),
        failure('RUNTIME_ASSEMBLY_PAYLOAD_CHANGED'),
      )
      assert.equal(f.commands.length, 0)
      assert.ok(existsSync(path.join(f.environmentRoot, OFFLINE_RUNTIME_INCOMPLETE_MARKER)))
      assert.ok(existsSync(path.join(f.pythonRoot, OFFLINE_RUNTIME_INCOMPLETE_MARKER)))
    })
  },
)

test('disk-space preflight refuses before fresh slots are allocated', actualConfig, async () => {
  await withAssembly(async (f) => {
    const release = {
      ...f.release,
      manifest: { ...f.manifest, requiredFreeBytes: Number.MAX_SAFE_INTEGER },
    }
    await assert.rejects(
      assembleOfflineRuntime({
        commandRunner: f.runner,
        release,
        roots: f.roots,
        runtimeId: 'runtime-a',
      }),
      failure('RUNTIME_ASSEMBLY_DISK_SPACE'),
    )
    assert.equal(existsSync(f.environmentRoot), false)
    assert.equal(existsSync(f.pythonRoot), false)
    assert.equal(f.commands.length, 0)
  })
})

test(
  'cancellation before allocation and between verified bootstrap and venv creation never changes the active pointer',
  actualConfig,
  async (t) => {
    for (const when of ['before', 'assembling'] as const) {
      await t.test(when, async () =>
        withAssembly(async (f) => {
          const controller = new AbortController()
          const pointer = Buffer.from('known-good')
          await writeFile(f.roots.pointerFile, pointer)
          if (when === 'before') {
            controller.abort()
          }
          await assert.rejects(
            assembleOfflineRuntime({
              commandRunner: f.runner,
              onStage: (stage) => {
                if (stage === when) {
                  controller.abort()
                }
              },
              release: f.release,
              roots: f.roots,
              runtimeId: 'runtime-a',
              signal: controller.signal,
            }),
            failure('RUNTIME_ASSEMBLY_CANCELED'),
          )
          assert.deepEqual(await readFile(f.roots.pointerFile), pointer)
          assert.ok(!f.commands.some((command) => command.args.includes('venv')))
          assert.equal(f.commands.length, when === 'before' ? 0 : 2)
        }),
      )
    }
  },
)

test(
  'command failure or unconfirmed physical exit retains owned incomplete slots without touching previous data',
  actualConfig,
  async (t) => {
    for (const confirmed of [true, false]) {
      await t.test(`exitConfirmed=${confirmed}`, async () =>
        withAssembly(async (f) => {
          const previous = path.join(f.roots.environmentsDir, 'previous')
          await mkdir(previous)
          await writeFile(path.join(previous, 'keep'), 'working')
          await assert.rejects(
            assembleOfflineRuntime({
              commandRunner: async () => ({
                code: confirmed ? 1 : 0,
                exitConfirmed: confirmed,
                stderr: 'controlled command failure',
                stdout: '',
              }),
              release: f.release,
              roots: f.roots,
              runtimeId: 'runtime-a',
            }),
            (error: unknown) => {
              assert.ok(error instanceof OfflineRuntimeAssemblyError)
              assert.equal(
                error.code,
                confirmed ? 'RUNTIME_ASSEMBLY_COMMAND_FAILED' : 'RUNTIME_ASSEMBLY_EXIT_UNCONFIRMED',
              )
              assert.equal(error.exitConfirmed, confirmed)
              assert.deepEqual(
                new Set(error.retainedPaths),
                new Set([f.environmentRoot, f.pythonRoot]),
              )
              return true
            },
          )
          for (const root of [f.pythonRoot, f.environmentRoot]) {
            assert.ok(existsSync(path.join(root, OFFLINE_RUNTIME_INCOMPLETE_MARKER)))
          }
          assert.equal(await readFile(path.join(previous, 'keep'), 'utf8'), 'working')
        }),
      )
    }
  },
)

test(
  'wrong uv version and wrong managed Python identity refuse before dependency installation',
  actualConfig,
  async (t) => {
    for (const kind of ['uv', 'python'] as const) {
      await t.test(kind, async () =>
        withAssembly(async (f) => {
          await assert.rejects(
            assembleOfflineRuntime({
              commandRunner: async (command) => {
                const result = await f.runner(command)
                if (kind === 'uv' && command.args[0] === '--version') {
                  return { ...result, stdout: 'uv 99.0.0' }
                }
                if (kind === 'python' && command.executable.endsWith('python3.12')) {
                  return {
                    ...result,
                    stdout: JSON.stringify({
                      basePrefix: '/outside',
                      prefix: '/outside',
                      pythonVersion: '3.12.13',
                    }),
                  }
                }
                return result
              },
              release: f.release,
              roots: f.roots,
              runtimeId: 'runtime-a',
            }),
          )
          assert.ok(!f.commands.some((command) => command.args.includes('sync')))
        }),
      )
    }
  },
)

test(
  'installed package closure, direct-URL/editable provenance and worker wheel bytes are verified independently',
  actualConfig,
  async (t) => {
    const mutations: [string, (inspection: Record<string, unknown>) => void][] = [
      [
        'extra package',
        (i) =>
          (i.packages as unknown[]).push({
            direct: {},
            name: 'undeclared',
            root: '/outside',
            version: '1',
          }),
      ],
      [
        'duplicate distribution',
        (i) => (i.packages as unknown[]).push((i.packages as unknown[])[0]),
      ],
      ['version mismatch', (i) => Reflect.set((i.packages as object[])[0], 'version', '99.0.0')],
      ['missing package', (i) => Reflect.set(i, 'packages', [])],
      [
        'editable',
        (i) =>
          Reflect.set((i.packages as object[])[0], 'direct', {
            dir_info: { editable: true },
            url: 'file:///outside',
          }),
      ],
      [
        'wrong worker bytes',
        (i) =>
          Reflect.set(i, 'workerFiles', {
            '__init__.py': { bytes: workerBytes.length, sha256: 'a'.repeat(64) },
          }),
      ],
      [
        'unlisted worker file',
        (i) =>
          Reflect.set(i, 'workerFiles', {
            ...(i.workerFiles as object),
            'extra.py': { bytes: 1, sha256: 'a'.repeat(64) },
          }),
      ],
      ['wrong prefix', (i) => Reflect.set(i, 'basePrefix', '/outside')],
    ]
    for (const [name, mutate] of mutations) {
      await t.test(name, async () =>
        withAssembly(async (f) => {
          mutate(f.inspection)
          await assert.rejects(
            assembleOfflineRuntime({
              commandRunner: f.runner,
              release: f.release,
              roots: f.roots,
              runtimeId: 'runtime-a',
            }),
          )
          assert.ok(existsSync(path.join(f.environmentRoot, OFFLINE_RUNTIME_INCOMPLETE_MARKER)))
          assert.equal(existsSync(f.roots.pointerFile), false)
        }),
      )
    }
  },
)

test(
  'a copied executable must preserve its signed executable identity before it can run',
  actualConfig,
  async () => {
    await withAssembly(async (f) => {
      let snapshots = 0
      const release: VerifiedRuntimeRelease = {
        ...f.release,
        verifyCompletePayloadSnapshot: async () => {
          await f.release.verifyCompletePayloadSnapshot()
          if (++snapshots === 2) {
            await chmod(path.join(f.environmentRoot, 'bootstrap/uv/uv'), 0o600)
          }
        },
      }
      await assert.rejects(
        assembleOfflineRuntime({
          commandRunner: f.runner,
          release,
          roots: f.roots,
          runtimeId: 'runtime-a',
        }),
        failure('RUNTIME_ASSEMBLY_PAYLOAD_CHANGED'),
      )
      assert.equal(f.commands.length, 0)
    })
  },
)
