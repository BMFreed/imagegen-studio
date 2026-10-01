import assert from 'node:assert/strict'
import { ChildProcess } from 'node:child_process'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, test } from 'node:test'

import { GenerationWorkerClient } from '../projects/generation-worker-client.js'
import { GenerationAppShutdown } from '../projects/generation-app-shutdown.js'
import { openAppDatabase } from '../db/database.js'

import { createRuntimeRoots, RuntimeManager } from './index.ts'

const temporaryDirectories = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  )
})

async function temporaryRoot() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'imagegen-runtime-'))
  temporaryDirectories.push(directory)
  return directory
}

async function fixture() {
  const roots = await createRuntimeRoots(await temporaryRoot())
  const manager = new RuntimeManager(roots, { platform: 'linux', arch: 'x64' })
  return { roots, manager }
}

async function installFakeInferenceRuntime(roots, runtimeId = 'worker-2-linux-nvidia') {
  const environment = path.join(roots.environmentsDir, runtimeId)
  const executable = path.join(environment, 'bin', 'python')
  const config = path.join(environment, 'resources', 'sdxl-config')
  await fs.mkdir(path.dirname(executable), { recursive: true })
  await fs.mkdir(config, { recursive: true })
  await fs.writeFile(path.join(config, 'model_index.json'), 'pinned')
  await fs.writeFile(path.join(environment, 'mode'), 'ready')
  const child = String.raw`#!${process.execPath}
const fs = require('node:fs')
const path = require('node:path')
const runtimeId = path.basename(path.dirname(path.dirname(process.argv[1])))
const root = process.cwd()
const environment = path.join(root, 'environments', runtimeId)
const config = path.join(environment, 'resources', 'sdxl-config')
fs.appendFileSync(path.join(root, 'launches'), runtimeId + '\n')
if (process.argv.slice(2).join(' ') !== '-I -m imagegen_worker.inference_main') process.exit(21)
if (process.env.IGS_SDXL_CONFIG_DIR !== config || process.env.HF_HOME !== path.join(path.dirname(root), 'cache')) process.exit(22)
if (process.env.HF_HUB_OFFLINE !== '1' || process.env.TRANSFORMERS_OFFLINE !== '1' || process.env.HF_DATASETS_OFFLINE !== '1') process.exit(23)
if (process.env.IGS_RUNTIME_PRIVATE_TEST) process.exit(24)
if (fs.readFileSync(path.join(config, 'model_index.json'), 'utf8') !== 'pinned') process.exit(78)
const mode = fs.readFileSync(path.join(environment, 'mode'), 'utf8')
if (mode === 'no-ready') process.exit(78)
const ready = {
  type: 'ready', protocolVersion: '1', pythonVersion: '3.12.13',
  workerVersion: mode.startsWith('thumbnail-') ? '0.4.0' : mode === 'wrong-version' || mode === 'wrong-version-keepalive' ? '0.1.0' : mode.startsWith('progress-') ? '0.3.0' : '0.2.0',
  runtimeProfile: 'linux-nvidia', capabilities: mode === 'thumbnail-ready' ? ['illustrious-txt2img', 'denoising-progress', 'candidate-thumbnails'] : mode === 'thumbnail-missing-capability' ? ['illustrious-txt2img', 'denoising-progress'] : mode === 'progress-ready' ? ['illustrious-txt2img', 'denoising-progress'] : ['illustrious-txt2img']
}
process.on('SIGTERM', () => {
  process.exit(0)
})
process.on('exit', () => fs.appendFileSync(path.join(root, 'exits'), runtimeId + '\n'))
if (mode === 'wrong-version-keepalive') setInterval(() => {}, 1000)
process.stdout.write(JSON.stringify(ready) + '\n')
process.stdin.resume()
`
  await fs.writeFile(executable, child)
  await fs.chmod(executable, 0o700)
  await fs.writeFile(
    roots.pointerFile,
    JSON.stringify({ schemaVersion: 1, runtimeId, pythonExecutable: executable }),
  )
  return { config, environment, executable }
}

async function lines(file) {
  try {
    return (await fs.readFile(file, 'utf8')).trim().split('\n').filter(Boolean)
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
}

test('creates app-owned roots and reports a missing runtime without probing system Python', async () => {
  const { roots, manager } = await fixture()
  for (const directory of [
    roots.pythonDir,
    roots.environmentsDir,
    roots.uvCacheDir,
    roots.downloadsDir,
    roots.workerLogsDir,
  ]) {
    assert.equal((await fs.stat(directory)).isDirectory(), true)
    assert.equal(path.relative(roots.appDataDir, directory).startsWith('..'), false)
  }

  assert.deepEqual(await manager.getStatus(), {
    ok: true,
    value: {
      kind: 'not-installed',
      profile: 'linux-nvidia',
      detail:
        'The Linux/NVIDIA runtime has not been installed. GPU compatibility is checked during setup.',
    },
  })
})

test('runtime qualification and active advisory readiness share the 0.3.0 progress capability gate', async () => {
  const roots = await createRuntimeRoots(await temporaryRoot())
  const installed = await installFakeInferenceRuntime(roots)
  const scratch = path.join(roots.appDataDir, 'scratch')
  await fs.mkdir(scratch)
  await fs.writeFile(path.join(installed.environment, 'mode'), 'progress-ready')
  const manager = new RuntimeManager(roots, { platform: 'linux', arch: 'x64' })
  assert.equal(
    await manager.withGenerationWorker(scratch, async (worker) => {
      assert.equal(worker.ready.workerVersion, '0.3.0')
      assert.equal((await manager.getStatus()).value.kind, 'ready')
      assert.equal((await lines(path.join(roots.runtimeDir, 'launches'))).length, 2)
      return worker.ready.workerVersion
    }),
    '0.3.0',
  )
  assert.equal((await lines(path.join(roots.runtimeDir, 'exits'))).length, 2)
  await fs.writeFile(path.join(installed.environment, 'mode'), 'progress-missing-capability')
  const refusing = new RuntimeManager(roots, { platform: 'linux', arch: 'x64' })
  assert.equal(
    await refusing.withGenerationWorker(scratch, async () =>
      assert.fail('unqualified worker cannot lease'),
    ),
    null,
  )
  assert.equal((await refusing.getStatus()).value.kind, 'needs-repair')
})

test('rejects an app-owned root redirected through a symlink', async () => {
  const appData = await temporaryRoot()
  const outside = await temporaryRoot()
  await fs.symlink(outside, path.join(appData, 'runtime'))
  await assert.rejects(createRuntimeRoots(appData), /Invalid application data directory/)
  assert.deepEqual(await fs.readdir(outside), [])
})

test('a malformed or symlinked active pointer requires repair', async () => {
  const { roots, manager } = await fixture()
  await fs.writeFile(roots.pointerFile, '{invalid')
  assert.equal((await manager.getStatus()).value.kind, 'needs-repair')

  const outside = path.join(await temporaryRoot(), 'external.json')
  await fs.writeFile(outside, '{}')
  await fs.rm(roots.pointerFile)
  await fs.symlink(outside, roots.pointerFile)
  assert.equal((await manager.getStatus()).value.kind, 'needs-repair')
})

test('an oversized active pointer is rejected without reading it as runtime metadata', async () => {
  const { roots, manager } = await fixture()
  await fs.writeFile(roots.pointerFile, Buffer.alloc(16 * 1024 + 1, 'a'))
  const result = await manager.getStatus()
  assert.equal(result.ok, true)
  assert.equal(result.value.kind, 'needs-repair')
})

test('a pointer to Python outside the app-owned runtime cannot establish readiness', async () => {
  const { roots, manager } = await fixture()
  const runtimeId = 'worker-1-linux-nvidia'
  const environment = path.join(roots.environmentsDir, runtimeId)
  await fs.mkdir(path.join(environment, 'bin'), { recursive: true })
  const outside = path.join(await temporaryRoot(), 'python')
  await fs.writeFile(outside, 'not a real interpreter')
  await fs.symlink(outside, path.join(environment, 'bin', 'python'))
  await fs.writeFile(
    roots.pointerFile,
    JSON.stringify({
      schemaVersion: 1,
      runtimeId,
      pythonExecutable: path.join(environment, 'bin', 'python'),
    }),
  )
  const result = await manager.getStatus()
  assert.equal(result.ok, true)
  assert.equal(result.value.kind, 'needs-repair')
  assert.equal(result.value.runtimeId, undefined)
})

test('even an app-owned Python pointer is not ready until a worker self-test exists', async () => {
  const { roots, manager } = await fixture()
  const runtimeId = 'worker-1-linux-nvidia'
  const environment = path.join(roots.environmentsDir, runtimeId)
  await fs.mkdir(path.join(environment, 'bin'), { recursive: true })
  const python = path.join(roots.pythonDir, 'python')
  await fs.writeFile(python, 'not a real interpreter')
  await fs.symlink(python, path.join(environment, 'bin', 'python'))
  await fs.writeFile(
    roots.pointerFile,
    JSON.stringify({
      schemaVersion: 1,
      runtimeId,
      pythonExecutable: path.join(environment, 'bin', 'python'),
    }),
  )
  const result = await manager.getStatus()
  assert.equal(result.ok, true)
  assert.equal(result.value.kind, 'needs-repair')
  assert.equal(result.value.runtimeId, runtimeId)
})

test('phase-0 install and repair return typed errors without changing the active pointer', async () => {
  const { roots, manager } = await fixture()
  const before = await manager.getStatus()
  assert.equal((await manager.install()).error.code, 'RUNTIME_INSTALL_UNAVAILABLE')
  assert.equal((await manager.repair()).error.code, 'RUNTIME_INSTALL_UNAVAILABLE')
  await assert.rejects(fs.stat(roots.pointerFile), { code: 'ENOENT' })
  assert.deepEqual(await manager.getStatus(), before)
})

test('unsupported hosts do not claim the Linux/NVIDIA profile', async () => {
  const { roots } = await fixture()
  const manager = new RuntimeManager(roots, { platform: 'darwin', arch: 'arm64' })
  const result = await manager.getStatus()
  assert.equal(result.ok, true)
  assert.equal(result.value.kind, 'unsupported')
  assert.equal(result.value.profile, null)
})

test('a real app-owned subprocess must qualify and exit before status becomes ready', async () => {
  const { roots, manager } = await fixture()
  assert.equal((await manager.getStatus()).value.kind, 'not-installed')
  await installFakeInferenceRuntime(roots)
  const statuses = []
  manager.onStatusChanged((status) => statuses.push(status.kind))
  const priorSecret = process.env.IGS_RUNTIME_PRIVATE_TEST
  process.env.IGS_RUNTIME_PRIVATE_TEST = 'must-not-reach-worker'
  try {
    const result = await manager.getStatus()
    assert.equal(result.value.kind, 'ready')
    assert.equal(result.value.runtimeId, 'worker-2-linux-nvidia')
    assert.deepEqual(await lines(path.join(roots.runtimeDir, 'exits')), ['worker-2-linux-nvidia'])
    assert.deepEqual(statuses, ['ready'])
    assert.equal((await manager.getStatus()).value.kind, 'ready')
    assert.deepEqual(await lines(path.join(roots.runtimeDir, 'launches')), [
      'worker-2-linux-nvidia',
    ])
  } finally {
    if (priorSecret === undefined) delete process.env.IGS_RUNTIME_PRIVATE_TEST
    else process.env.IGS_RUNTIME_PRIVATE_TEST = priorSecret
  }
})

test('missing, symlinked and changed configs cannot keep a cached ready status', async () => {
  const { roots, manager } = await fixture()
  const installed = await installFakeInferenceRuntime(roots)
  assert.equal((await manager.getStatus()).value.kind, 'ready')
  await fs.writeFile(path.join(installed.config, 'model_index.json'), 'changed')
  assert.equal((await manager.getStatus()).value.kind, 'needs-repair')
  await fs.writeFile(path.join(installed.config, 'model_index.json'), 'pinned')
  assert.equal((await manager.getStatus()).value.kind, 'ready')
  await fs.rm(installed.config, { recursive: true })
  assert.equal((await manager.getStatus()).value.kind, 'needs-repair')
  const external = await temporaryRoot()
  await fs.symlink(external, installed.config)
  assert.equal((await manager.getStatus()).value.kind, 'needs-repair')
  await fs.rm(installed.config)
  await fs.mkdir(installed.config)
  await fs.writeFile(path.join(installed.config, 'model_index.json'), 'pinned')
  assert.equal((await manager.getStatus()).value.kind, 'ready')
  assert.equal((await lines(path.join(roots.runtimeDir, 'launches'))).length, 4)
})

test('failed worker handshake is retried and a changed pointer invalidates readiness', async () => {
  const { roots, manager } = await fixture()
  const first = await installFakeInferenceRuntime(roots)
  await fs.writeFile(path.join(first.environment, 'mode'), 'wrong-version')
  assert.equal((await manager.getStatus()).value.kind, 'needs-repair')
  await fs.writeFile(path.join(first.environment, 'mode'), 'ready')
  assert.equal((await manager.getStatus()).value.kind, 'ready')
  assert.deepEqual(await lines(path.join(roots.runtimeDir, 'launches')), [
    'worker-2-linux-nvidia',
    'worker-2-linux-nvidia',
  ])
  await installFakeInferenceRuntime(roots, 'worker-3-linux-nvidia')
  const status = await manager.getStatus()
  assert.equal(status.value.kind, 'ready')
  assert.equal(status.value.runtimeId, 'worker-3-linux-nvidia')
  assert.deepEqual(await lines(path.join(roots.runtimeDir, 'launches')), [
    'worker-2-linux-nvidia',
    'worker-2-linux-nvidia',
    'worker-3-linux-nvidia',
  ])
})

test('an app-owned pointer and config do not make an invalid interpreter or silent worker ready', async () => {
  const { roots, manager } = await fixture()
  const installed = await installFakeInferenceRuntime(roots)
  await fs.writeFile(path.join(installed.environment, 'mode'), 'no-ready')
  assert.equal((await manager.getStatus()).value.kind, 'needs-repair')
  await fs.writeFile(path.join(installed.environment, 'mode'), 'ready')
  assert.equal((await manager.getStatus()).value.kind, 'ready')
  await fs.writeFile(installed.executable, 'not a Python or protocol executable\n')
  assert.equal((await manager.getStatus()).value.kind, 'needs-repair')
  assert.deepEqual(await lines(path.join(roots.runtimeDir, 'launches')), [
    'worker-2-linux-nvidia',
    'worker-2-linux-nvidia',
  ])
})

test('qualified resolver rechecks the worker and only accepts an app-owned scratch root', async () => {
  const { roots, manager } = await fixture()
  await installFakeInferenceRuntime(roots)
  const scratch = path.join(roots.appDataDir, 'scratch')
  await fs.mkdir(scratch)
  const outside = await temporaryRoot()
  assert.equal(await manager.resolveQualifiedGenerationWorker(outside), null)
  const resolved = await manager.resolveQualifiedGenerationWorker(scratch)
  assert.equal(resolved?.runtimeId, 'worker-2-linux-nvidia')
  assert.equal(resolved?.location.scratchBasePath, scratch)
  assert.equal(
    resolved?.environment.IGS_SDXL_CONFIG_DIR,
    path.join(roots.environmentsDir, 'worker-2-linux-nvidia', 'resources', 'sdxl-config'),
  )
  assert.deepEqual(await lines(path.join(roots.runtimeDir, 'exits')), ['worker-2-linux-nvidia'])
  assert.equal((await manager.getStatus()).value.kind, 'ready')
  assert.deepEqual(await lines(path.join(roots.runtimeDir, 'launches')), [
    'worker-2-linux-nvidia',
    'worker-2-linux-nvidia',
  ])
})

test('an unconfirmed worker exit blocks every new qualification until its exit is observed', async () => {
  const roots = await createRuntimeRoots(await temporaryRoot())
  await installFakeInferenceRuntime(roots)
  const scratch = path.join(roots.appDataDir, 'scratch')
  await fs.mkdir(scratch)
  const clients = []
  let blockClose = true
  const manager = new RuntimeManager(
    roots,
    { platform: 'linux', arch: 'x64' },
    async (location, environment) => {
      const client = await GenerationWorkerClient.start(location, { environment })
      clients.push(client)
      return {
        close: async () => {
          if (blockClose) throw new Error('Worker exit has not been confirmed.')
          await client.close()
        },
      }
    },
  )
  try {
    assert.equal((await manager.getStatus()).value.kind, 'needs-repair')
    assert.deepEqual(await lines(path.join(roots.runtimeDir, 'launches')), [
      'worker-2-linux-nvidia',
    ])
    assert.equal((await manager.getStatus()).value.kind, 'needs-repair')
    assert.equal(await manager.resolveQualifiedGenerationWorker(scratch), null)
    assert.deepEqual(await lines(path.join(roots.runtimeDir, 'launches')), [
      'worker-2-linux-nvidia',
    ])
    blockClose = false
    assert.equal((await manager.getStatus()).value.kind, 'ready')
    assert.deepEqual(await lines(path.join(roots.runtimeDir, 'launches')), [
      'worker-2-linux-nvidia',
      'worker-2-linux-nvidia',
    ])
    assert.deepEqual(await lines(path.join(roots.runtimeDir, 'exits')), [
      'worker-2-linux-nvidia',
      'worker-2-linux-nvidia',
    ])
  } finally {
    blockClose = false
    await Promise.all(clients.map((client) => client.close().catch(() => undefined)))
  }
})

test('generation retry does not confirm an unclosed qualification child', async () => {
  const roots = await createRuntimeRoots(await temporaryRoot())
  await installFakeInferenceRuntime(roots)
  const scratch = path.join(roots.appDataDir, 'scratch')
  await fs.mkdir(scratch)
  const clients = []
  let blockClose = true
  const manager = new RuntimeManager(
    roots,
    { platform: 'linux', arch: 'x64' },
    async (location, environment) => {
      const client = await GenerationWorkerClient.start(location, { environment })
      clients.push(client)
      return {
        close: async () => {
          if (blockClose) throw new Error('Qualification exit remains unconfirmed.')
          await client.close()
        },
      }
    },
  )
  try {
    assert.equal(
      await manager.withGenerationWorker(scratch, async () =>
        assert.fail('An unconfirmed qualification cannot dispatch a job.'),
      ),
      null,
    )
    assert.equal(await manager.retryUnconfirmedGenerationExit(), false)
    assert.deepEqual(await lines(path.join(roots.runtimeDir, 'launches')), [
      'worker-2-linux-nvidia',
    ])
    assert.equal(
      await manager.withGenerationWorker(scratch, async () =>
        assert.fail('The previous CUDA child still owns the runtime.'),
      ),
      null,
    )
    blockClose = false
    assert.equal(await manager.retryUnconfirmedGenerationExit(), true)
    assert.deepEqual(await lines(path.join(roots.runtimeDir, 'exits')), ['worker-2-linux-nvidia'])
    assert.equal(
      await manager.withGenerationWorker(scratch, async (worker) => worker.ready.workerVersion),
      '0.2.0',
    )
    assert.equal((await lines(path.join(roots.runtimeDir, 'launches'))).length, 3)
    assert.equal((await lines(path.join(roots.runtimeDir, 'exits'))).length, 3)
  } finally {
    blockClose = false
    await Promise.all(clients.map((client) => client.close().catch(() => undefined)))
  }
})

test('failed startup child blocks runtime retry and new launches until exit is confirmed', async () => {
  const roots = await createRuntimeRoots(await temporaryRoot())
  const installed = await installFakeInferenceRuntime(roots)
  const scratch = path.join(roots.appDataDir, 'scratch')
  await fs.mkdir(scratch)
  await fs.writeFile(path.join(installed.environment, 'mode'), 'wrong-version-keepalive')
  const actualKill = ChildProcess.prototype.kill
  const stalled = new Set()
  ChildProcess.prototype.kill = function (signal) {
    if (this.spawnfile === installed.executable) {
      stalled.add(this)
      return true
    }
    return actualKill.call(this, signal)
  }
  const manager = new RuntimeManager(
    roots,
    { platform: 'linux', arch: 'x64' },
    async (location, environment) =>
      await GenerationWorkerClient.start(location, {
        environment,
        shutdownWaitMs: 25,
        startupTimeoutMs: 100,
      }),
  )
  try {
    assert.equal((await manager.getStatus()).value.kind, 'needs-repair')
    assert.deepEqual(await lines(path.join(roots.runtimeDir, 'launches')), [
      'worker-2-linux-nvidia',
    ])
    assert.equal(await manager.retryUnconfirmedGenerationExit(), false)
    assert.equal(
      await manager.withGenerationWorker(scratch, async () =>
        assert.fail('An unconfirmed startup child must block dispatch.'),
      ),
      null,
    )
    assert.equal((await manager.getStatus()).value.kind, 'needs-repair')
    assert.equal((await lines(path.join(roots.runtimeDir, 'launches'))).length, 1)

    ChildProcess.prototype.kill = actualKill
    assert.equal(await manager.retryUnconfirmedGenerationExit(), true)
    assert.equal(stalled.size, 1)
    const [startupChild] = stalled
    assert.equal(
      startupChild.exitCode !== null || startupChild.signalCode !== null,
      true,
      'retry must observe the actual subprocess exit, including SIGKILL',
    )
    assert.equal((await lines(path.join(roots.runtimeDir, 'launches'))).length, 1)
    await fs.writeFile(path.join(installed.environment, 'mode'), 'ready')
    assert.equal((await manager.getStatus()).value.kind, 'ready')
    assert.equal((await lines(path.join(roots.runtimeDir, 'launches'))).length, 2)
  } finally {
    ChildProcess.prototype.kill = actualKill
    for (const child of stalled) {
      if (child.exitCode === null && child.signalCode === null) {
        actualKill.call(child, 'SIGKILL')
      }
    }
    await GenerationWorkerClient.retryUnconfirmedStartExit().catch(() => undefined)
  }
})

test('a generation lease excludes status and resolver probes during qualification and active work', async () => {
  const roots = await createRuntimeRoots(await temporaryRoot())
  const installed = await installFakeInferenceRuntime(roots)
  const pointerBytes = await fs.readFile(roots.pointerFile)
  const scratch = path.join(roots.appDataDir, 'scratch')
  await fs.mkdir(scratch)
  let qualificationEntered
  const entered = new Promise((resolve) => {
    qualificationEntered = resolve
  })
  let resumeQualification
  const qualificationGate = new Promise((resolve) => {
    resumeQualification = resolve
  })
  let workEntered
  const working = new Promise((resolve) => {
    workEntered = resolve
  })
  let finishWork
  const workGate = new Promise((resolve) => {
    finishWork = resolve
  })
  const manager = new RuntimeManager(
    roots,
    { platform: 'linux', arch: 'x64' },
    async (location, environment) => {
      const child = await GenerationWorkerClient.start(location, { environment })
      qualificationEntered()
      await qualificationGate
      return child
    },
  )
  const generation = manager.withGenerationWorker(scratch, async (worker) => {
    assert.equal(worker.ready.workerVersion, '0.2.0')
    workEntered()
    await workGate
    return 'completed'
  })
  try {
    await entered
    const startingStatus = await Promise.race([
      manager.getStatus(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('status waited for generation')), 1000),
      ),
    ])
    assert.equal(startingStatus.value.kind, 'needs-repair')
    assert.equal(await manager.resolveQualifiedGenerationWorker(scratch), null)
    assert.deepEqual(await lines(path.join(roots.runtimeDir, 'launches')), [
      'worker-2-linux-nvidia',
    ])

    resumeQualification()
    await working
    const activeStatus = await Promise.race([
      manager.getStatus(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('status waited for active job')), 1000),
      ),
    ])
    assert.equal(activeStatus.value.kind, 'ready')
    assert.equal(await manager.resolveQualifiedGenerationWorker(scratch), null)
    assert.equal(await manager.withGenerationWorker(scratch, async () => 'second'), null)
    assert.deepEqual(await lines(path.join(roots.runtimeDir, 'launches')), [
      'worker-2-linux-nvidia',
      'worker-2-linux-nvidia',
    ])
    await fs.writeFile(path.join(installed.config, 'model_index.json'), 'changed')
    assert.equal((await manager.getStatus()).value.kind, 'needs-repair')
    assert.equal((await lines(path.join(roots.runtimeDir, 'launches'))).length, 2)
    await fs.writeFile(path.join(installed.config, 'model_index.json'), 'pinned')
    await fs.rm(roots.pointerFile)
    assert.equal((await manager.getStatus()).value.kind, 'needs-repair')
    assert.equal((await lines(path.join(roots.runtimeDir, 'launches'))).length, 2)
    await fs.writeFile(roots.pointerFile, pointerBytes)
  } finally {
    await fs.writeFile(path.join(installed.config, 'model_index.json'), 'pinned')
    await fs.writeFile(roots.pointerFile, pointerBytes)
    resumeQualification()
    finishWork()
  }
  assert.equal(await generation, 'completed')
  assert.deepEqual(await lines(path.join(roots.runtimeDir, 'exits')), [
    'worker-2-linux-nvidia',
    'worker-2-linux-nvidia',
  ])
  assert.equal((await manager.getStatus()).value.kind, 'ready')
  assert.equal((await lines(path.join(roots.runtimeDir, 'launches'))).length, 3)
})

test('shutdown fences late runtime probes and waits for an in-flight qualification before SQLite closes', async () => {
  const roots = await createRuntimeRoots(await temporaryRoot())
  await installFakeInferenceRuntime(roots)
  const scratch = path.join(roots.appDataDir, 'scratch')
  await fs.mkdir(scratch)
  let qualificationEntered
  const entered = new Promise((resolve) => {
    qualificationEntered = resolve
  })
  let releaseQualification
  const qualificationGate = new Promise((resolve) => {
    releaseQualification = resolve
  })
  const manager = new RuntimeManager(
    roots,
    { platform: 'linux', arch: 'x64' },
    async (location, environment) => {
      const child = await GenerationWorkerClient.start(location, { environment })
      qualificationEntered()
      return {
        close: async () => {
          await qualificationGate
          await child.close()
        },
      }
    },
  )
  const database = openAppDatabase(roots.appDataDir, path.resolve('src/main/db/migrations'))
  let databaseClosed = false
  const shutdown = new GenerationAppShutdown({
    closeDatabase: async () => {
      assert.deepEqual(await lines(path.join(roots.runtimeDir, 'exits')), ['worker-2-linux-nvidia'])
      await database.close()
      databaseClosed = true
    },
    context: { shutdown: () => undefined },
    coordinator: null,
    pendingJobs: null,
    runtimeExit: manager,
  })
  const firstStatus = manager.getStatus()
  let finalizing
  let lateStatus
  try {
    await entered
    finalizing = shutdown.finalize()
    lateStatus = manager.getStatus()
    assert.deepEqual(
      await Promise.race([
        lateStatus,
        new Promise((resolve) => setImmediate(() => resolve({ kind: 'still-pending' }))),
      ]),
      {
        error: {
          code: 'RUNTIME_SHUTTING_DOWN',
          message: 'The image runtime is shutting down.',
        },
        ok: false,
      },
    )
    assert.equal(await manager.resolveQualifiedGenerationWorker(scratch), null)
    assert.equal(await manager.withGenerationWorker(scratch, async () => 'late'), null)
    assert.deepEqual(await lines(path.join(roots.runtimeDir, 'launches')), [
      'worker-2-linux-nvidia',
    ])
    await new Promise((resolve) => setImmediate(resolve))
    await database.db.selectFrom('app_metadata').selectAll().execute()
    assert.equal(databaseClosed, false)
    releaseQualification()
    await firstStatus
    await finalizing
    assert.equal(databaseClosed, true)
    assert.deepEqual(await lines(path.join(roots.runtimeDir, 'launches')), [
      'worker-2-linux-nvidia',
    ])
  } finally {
    releaseQualification()
    await Promise.allSettled([firstStatus, lateStatus, finalizing].filter(Boolean))
    if (!databaseClosed) await database.close()
  }
})

test('a generation lease preserves callback failure and accepts an already canceled child', async () => {
  const { roots, manager } = await fixture()
  await installFakeInferenceRuntime(roots)
  const scratch = path.join(roots.appDataDir, 'scratch')
  await fs.mkdir(scratch)
  const original = new Error('the processor failed')
  await assert.rejects(
    manager.withGenerationWorker(scratch, async (worker) => {
      await worker.close()
      throw original
    }),
    (error) => error === original,
  )
  assert.equal(await manager.withGenerationWorker(scratch, async () => 'next'), 'next')
  assert.equal((await lines(path.join(roots.runtimeDir, 'launches'))).length, 4)
  assert.equal((await lines(path.join(roots.runtimeDir, 'exits'))).length, 4)
})

test('unconfirmed generation exit retains its lease and blocks every new CUDA process until retry', async () => {
  const { roots, manager } = await fixture()
  await installFakeInferenceRuntime(roots)
  const scratch = path.join(roots.appDataDir, 'scratch')
  await fs.mkdir(scratch)
  let client
  let blockClose = true
  try {
    await assert.rejects(
      manager.withGenerationWorker(scratch, async (worker) => {
        client = worker
        const actualClose = worker.close.bind(worker)
        worker.close = async () => {
          if (blockClose) throw new Error('exit was not confirmed')
          await actualClose()
        }
        return 'done'
      }),
      /exit was not confirmed/,
    )
    assert.equal((await manager.getStatus()).value.kind, 'needs-repair')
    assert.equal(await manager.resolveQualifiedGenerationWorker(scratch), null)
    assert.equal(await manager.withGenerationWorker(scratch, async () => 'unsafe'), null)
    assert.equal(await manager.retryUnconfirmedGenerationExit(), false)
    assert.deepEqual(await lines(path.join(roots.runtimeDir, 'launches')), [
      'worker-2-linux-nvidia',
      'worker-2-linux-nvidia',
    ])
    blockClose = false
    assert.equal(await manager.retryUnconfirmedGenerationExit(), true)
    assert.equal((await manager.getStatus()).value.kind, 'ready')
    assert.equal((await lines(path.join(roots.runtimeDir, 'launches'))).length, 3)
  } finally {
    blockClose = false
    await manager.retryUnconfirmedGenerationExit().catch(() => undefined)
    await client?.close().catch(() => undefined)
  }
})

test('runtime leases qualified 0.4.0 thumbnail peer and refuses missing capability before work', async () => {
  const roots = await createRuntimeRoots(await temporaryRoot())
  const installed = await installFakeInferenceRuntime(roots)
  const scratch = path.join(roots.appDataDir, 'scratch')
  await fs.mkdir(scratch)
  await fs.writeFile(path.join(installed.environment, 'mode'), 'thumbnail-ready')
  const manager = new RuntimeManager(roots, { platform: 'linux', arch: 'x64' })
  assert.equal(
    await manager.withGenerationWorker(scratch, async (worker) => {
      assert.equal(worker.ready.workerVersion, '0.4.0')
      assert.equal((await manager.getStatus()).value.kind, 'ready')
      return worker.ready.workerVersion
    }),
    '0.4.0',
  )
  await fs.writeFile(path.join(installed.environment, 'mode'), 'thumbnail-missing-capability')
  const refusing = new RuntimeManager(roots, { platform: 'linux', arch: 'x64' })
  assert.equal(
    await refusing.withGenerationWorker(scratch, async () =>
      assert.fail('missing capability cannot claim the worker'),
    ),
    null,
  )
  assert.equal((await refusing.getStatus()).value.kind, 'needs-repair')
})
