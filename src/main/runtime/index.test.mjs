import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, test } from 'node:test'

import { GenerationWorkerClient } from '../projects/generation-worker-client.js'

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
  workerVersion: mode === 'wrong-version' ? '0.1.0' : '0.2.0',
  runtimeProfile: 'linux-nvidia', capabilities: ['illustrious-txt2img']
}
process.on('SIGTERM', () => {
  process.exit(0)
})
process.on('exit', () => fs.appendFileSync(path.join(root, 'exits'), runtimeId + '\n'))
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
