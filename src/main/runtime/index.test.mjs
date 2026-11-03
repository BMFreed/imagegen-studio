import assert from 'node:assert/strict'
import { ChildProcess } from 'node:child_process'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, test } from 'node:test'
import { crc32, deflateSync } from 'node:zlib'

import { GenerationWorkerClient } from '../projects/generation-worker-client.js'
import { ProjectWorkerClient } from '../projects/worker-client.js'
import { ProjectTargetInspectionOwner } from '../projects/project-target-inspection-owner.js'
import { ProjectSession } from '../projects/project-session.js'
import { readIgsPackage } from '../projects/igs-package.js'
import { GenerationAppShutdown } from '../projects/generation-app-shutdown.js'
import { openAppDatabase } from '../db/database.js'
import { GenerationDispatchCoordinator } from '../projects/generation-dispatch-coordinator.js'
import { GenerationOrchestrator } from '../projects/generation-orchestrator.js'
import { GenerationProcessor } from '../projects/generation-processor.js'
import { GenerationQueueRepository } from '../projects/generation-queue.js'
import { GenerationStagingRepository } from '../projects/generation-staging.js'

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
  // Production resolveAppPaths establishes this private root before constructing RuntimeManager.
  await fs.mkdir(path.join(roots.appDataDir, 'scratch'), { mode: 0o700 })
  const manager = new RuntimeManager(roots, { platform: 'linux', arch: 'x64' })
  return { roots, manager }
}

async function installAppOwnedProjectPointer(roots, runtimeId = 'derivatives-fixture') {
  const environment = path.join(roots.environmentsDir, runtimeId)
  const executable = path.join(environment, 'bin', 'python')
  await fs.mkdir(path.dirname(executable), { recursive: true })
  await fs.writeFile(executable, 'app-owned interpreter precondition, never executed by resolver')
  await fs.chmod(executable, 0o700)
  await fs.writeFile(
    roots.pointerFile,
    JSON.stringify({ schemaVersion: 1, runtimeId, pythonExecutable: executable }),
  )
  return { environment, executable }
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
if (process.argv.slice(2).join(' ') === '-I -m imagegen_worker') {
  const crypto = require('node:crypto')
  const mode = fs.existsSync(path.join(environment, 'cpu-mode'))
    ? fs.readFileSync(path.join(environment, 'cpu-mode'), 'utf8') : 'ready'
  if (process.env.CUDA_VISIBLE_DEVICES !== '' || process.env.IGS_SDXL_CONFIG_DIR !== config ||
      process.env.HF_HUB_OFFLINE !== '1' || process.env.HF_HOME !== path.join(path.dirname(root), 'cache')) process.exit(25)
  fs.appendFileSync(path.join(root, 'cpu-launches'), runtimeId + '\n')
  process.on('exit', () => fs.appendFileSync(path.join(root, 'cpu-exits'), runtimeId + '\n'))
  if (mode !== 'startup-hang' && mode !== 'request-hang') process.on('SIGTERM', () => process.exit(0))
  if (mode === 'bad-version-keepalive' || mode === 'request-hang' || mode === 'startup-hang' || mode === 'close-keepalive') setInterval(() => {}, 1000)
  const announce = () => {
    if (mode === 'startup-hang') return
    if (mode === 'replace-pointer') fs.writeFileSync(path.join(root, 'current-runtime.json'), '{}')
    if (mode === 'replace-config') fs.writeFileSync(path.join(config, 'model_index.json'), 'changed')
    if (mode === 'replace-executable') fs.appendFileSync(process.argv[1], '\n')
    process.stdout.write(JSON.stringify({
      type:'ready', protocolVersion:'1', pythonVersion:'3.12.13', workerVersion: mode.startsWith('bad-version') ? '9.9.9' : '0.1.0',
      runtimeProfile: 'derivatives-only', capabilities: ['image-derivatives', 'import-normalization', 'self-test',
        ...(mode === 'missing-target' ? [] : ['target-composition'])]
    }) + '\n')
  }
  if (mode === 'startup-gate') {
    const timer = setInterval(() => {
      if (fs.existsSync(path.join(root, 'cpu-release-start'))) { clearInterval(timer); announce() }
    }, 5)
  } else announce()
  process.stdin.setEncoding('utf8')
  let incoming = ''
  process.stdin.on('data', chunk => {
    incoming += chunk
    while (incoming.includes('\n')) {
      const index = incoming.indexOf('\n')
      const request = JSON.parse(incoming.slice(0, index)); incoming = incoming.slice(index + 1)
      fs.appendFileSync(path.join(root, 'cpu-requests'), request.type + '\n')
      if (request.type !== 'compose-target') process.exit(26)
      if (mode === 'request-hang') continue
      const bytes = fs.readFileSync(path.join(root, 'cpu-target.png'))
      fs.writeFileSync(request.output.targetPngPath, bytes)
      process.stdout.write(JSON.stringify({
        type:'target-done', protocolVersion:'1', requestId:request.requestId,
        rect:request.bbox, mode:'txt2img', composite:{ byteSize:bytes.length, width:2,height:2,
          sha256:crypto.createHash('sha256').update(bytes).digest('hex'), colorSpace:'srgb' }
      }) + '\n')
    }
  })
} else {
fs.appendFileSync(path.join(root, 'launches'), runtimeId + '\n')
// Explicit protocol substitute: validates the operational argv; this fake does not arm a kernel guard.
const inferenceArgs = process.argv.slice(2)
const inferenceArgsValid = process.platform === 'linux'
  ? inferenceArgs.length === 7 && JSON.stringify(inferenceArgs.slice(0, 6)) === JSON.stringify(['-I', '-m', 'imagegen_worker.owned_inference', '--parent-pid', String(process.ppid), '--scratch-base']) && require('node:path').isAbsolute(inferenceArgs[6]) && require('node:path').resolve(inferenceArgs[6]) === inferenceArgs[6]
  : inferenceArgs.join(' ') === '-I -m imagegen_worker.inference_main'
if (!inferenceArgsValid) process.exit(21)
if (process.env.IGS_SDXL_CONFIG_DIR !== config || process.env.HF_HOME !== path.join(path.dirname(root), 'cache')) process.exit(22)
if (process.env.HF_HUB_OFFLINE !== '1' || process.env.TRANSFORMERS_OFFLINE !== '1' || process.env.HF_DATASETS_OFFLINE !== '1') process.exit(23)
if (process.env.IGS_RUNTIME_PRIVATE_TEST) process.exit(24)
if (fs.readFileSync(path.join(config, 'model_index.json'), 'utf8') !== 'pinned') process.exit(78)
const mode = fs.readFileSync(path.join(environment, 'mode'), 'utf8')
if (mode === 'no-ready') process.exit(78)
const ready = {
  type: 'ready', protocolVersion: '1', pythonVersion: '3.12.13',
  workerVersion: mode.startsWith('rescale-') ? '0.5.0' : mode.startsWith('thumbnail-') ? '0.4.0' : mode === 'wrong-version' || mode === 'wrong-version-keepalive' ? '0.1.0' : mode.startsWith('progress-') ? '0.3.0' : '0.2.0',
  runtimeProfile: 'linux-nvidia', capabilities: mode === 'rescale-ready' ? ['illustrious-txt2img', 'denoising-progress', 'candidate-thumbnails', 'illustrious-cfg-rescale'] : mode === 'rescale-missing-capability' ? ['illustrious-txt2img', 'denoising-progress', 'candidate-thumbnails'] : mode === 'thumbnail-ready' ? ['illustrious-txt2img', 'denoising-progress', 'candidate-thumbnails'] : mode === 'thumbnail-missing-capability' ? ['illustrious-txt2img', 'denoising-progress'] : mode === 'progress-ready' ? ['illustrious-txt2img', 'denoising-progress'] : ['illustrious-txt2img']
}
if (mode.startsWith('smart-')) {
  ready.workerVersion = '0.14.0'
  ready.capabilities = ['illustrious-txt2img', 'denoising-progress', 'candidate-thumbnails',
    'illustrious-cfg-rescale', 'illustrious-img2img', 'illustrious-lora',
    'illustrious-vae-precision', 'illustrious-external-vae', 'illustrious-embeddings',
    'illustrious-outpaint',
    ...(mode === 'smart-missing-execution' ? [] : ['smart-patch-execution']),
    ...(mode === 'smart-missing-seed' ? [] : ['smart-patch-seed-confirmation'])]
}
if (process.platform === 'linux') ready.capabilities.push('linux-owned-inference-v1')
process.on('SIGTERM', () => {
  process.exit(0)
})
process.on('exit', () => fs.appendFileSync(path.join(root, 'exits'), runtimeId + '\n'))
if (mode === 'wrong-version-keepalive') setInterval(() => {}, 1000)
process.stdout.write(JSON.stringify(ready) + '\n')
process.stdin.on('data', data => fs.appendFileSync(path.join(root, 'requests'), data))
process.stdin.resume()
}
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

test('real empty dispatch does not qualify or spawn any installed inference worker', async () => {
  // Boundary: actual SQLite queue → orchestrator → dispatcher → RuntimeManager → real subprocess.
  // No Project/model is referenced in an empty queue; their unused dependencies are explicit.
  const { roots, manager } = await fixture()
  await installFakeInferenceRuntime(roots)
  const scratch = path.join(roots.appDataDir, 'scratch')
  await fs.mkdir(scratch, { recursive: true, mode: 0o700 })
  const database = openAppDatabase(roots.appDataDir, path.resolve('src/main/db/migrations'))
  const queue = new GenerationQueueRepository(database.db, roots.appDataDir)
  const staging = new GenerationStagingRepository(database.db, roots.appDataDir)
  await queue.recoverAfterRestart()
  await staging.recoverAfterRestart()
  const processor = new GenerationProcessor(queue, staging, {}, scratch)
  const orchestrator = new GenerationOrchestrator({}, {}, {}, queue, staging, processor, scratch)
  const dispatch = new GenerationDispatchCoordinator(manager, orchestrator, processor, scratch)
  try {
    assert.deepEqual(await dispatch.runNext(), { kind: 'idle' })
    assert.equal(
      (await lines(path.join(roots.runtimeDir, 'launches'))).length,
      0,
      'an empty durable queue must not open a qualification or inference child',
    )
    assert.notEqual(
      await manager.resolveInstalledProjectWorker(scratch),
      null,
      'healthy Save can resolve its installed CPU worker immediately after idle dispatch',
    )
  } finally {
    await dispatch.shutdown()
    await database.close()
  }
})

test('status qualification and advisory readiness use the same private scratch as actual inference', async () => {
  const { roots, manager } = await fixture()
  await installFakeInferenceRuntime(roots)
  await fs.chmod(roots.downloadsDir, 0o755)
  assert.equal((await fs.stat(roots.downloadsDir)).mode & 0o777, 0o755)
  const scratch = path.join(roots.appDataDir, 'scratch')
  const executable = path.join(roots.environmentsDir, 'worker-2-linux-nvidia', 'bin/python')
  const source = await fs.readFile(executable, 'utf8')
  const anchor = 'if (!inferenceArgsValid) process.exit(21)'
  assert.equal(source.split(anchor).length, 2)
  await fs.writeFile(
    executable,
    source.replace(
      anchor,
      `${anchor}\nif (process.argv.at(-1) !== ${JSON.stringify(scratch)} || (fs.statSync(process.argv.at(-1)).mode & 0o777) !== 0o700) process.exit(79)`,
    ),
  )
  assert.equal((await manager.getStatus()).value.kind, 'ready')
  assert.ok(await manager.readQualifiedInferenceReady())
  assert.deepEqual(await lines(path.join(roots.runtimeDir, 'launches')), ['worker-2-linux-nvidia'])
  assert.deepEqual(await lines(path.join(roots.runtimeDir, 'exits')), ['worker-2-linux-nvidia'])
  assert.equal((await fs.stat(roots.downloadsDir)).mode & 0o777, 0o755)
})

test('missing operational scratch refuses status before spawn without a downloads-directory fallback', async () => {
  const { roots, manager } = await fixture()
  await installFakeInferenceRuntime(roots)
  await fs.rmdir(path.join(roots.appDataDir, 'scratch'))
  assert.equal((await manager.getStatus()).value.kind, 'needs-repair')
  assert.equal(await manager.readQualifiedInferenceReady(), null)
  assert.deepEqual(await lines(path.join(roots.runtimeDir, 'launches')), [])
  assert.ok((await fs.stat(roots.downloadsDir)).isDirectory())
})

test('cached advisory readiness is revoked when shared scratch disappears despite intact downloads', async () => {
  const { roots, manager } = await fixture()
  await installFakeInferenceRuntime(roots)
  assert.equal((await manager.getStatus()).value.kind, 'ready')
  assert.ok(await manager.readQualifiedInferenceReady())
  const launches = await lines(path.join(roots.runtimeDir, 'launches'))
  assert.equal(launches.length, 1)
  await fs.rmdir(path.join(roots.appDataDir, 'scratch'))
  assert.ok((await fs.stat(roots.downloadsDir)).isDirectory())
  assert.equal(await manager.readQualifiedInferenceReady(), null)
  assert.equal((await manager.getStatus()).value.kind, 'needs-repair')
  assert.deepEqual(await lines(path.join(roots.runtimeDir, 'launches')), launches)
})

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

test('installed project worker resolves CPU-only offline paths without GPU qualification or ML config', async () => {
  // Boundary: real pointer/filesystem resolver. Neighbor: absent pointer. Mutation: require CUDA
  // qualification/config or inherit ambient environment before returning the CPU location.
  const roots = await createRuntimeRoots(await temporaryRoot())
  let inferenceStarts = 0
  const manager = new RuntimeManager(roots, { platform: 'linux', arch: 'x64' }, async () => {
    inferenceStarts++
    throw new Error('CPU derivatives must not qualify an inference process.')
  })
  const scratch = path.join(roots.appDataDir, 'scratch')
  await fs.mkdir(scratch, { recursive: true, mode: 0o700 })
  assert.equal(await manager.resolveInstalledProjectWorker(scratch), null)
  const installed = await installAppOwnedProjectPointer(roots)
  assert.deepEqual(await manager.resolveInstalledProjectWorker(scratch), {
    environment: {
      CUDA_VISIBLE_DEVICES: '',
      HF_DATASETS_OFFLINE: '1',
      HF_HOME: roots.cacheDir,
      HF_HUB_OFFLINE: '1',
      LANG: 'C.UTF-8',
      LC_ALL: 'C.UTF-8',
      TRANSFORMERS_OFFLINE: '1',
    },
    location: {
      pythonExecutable: installed.executable,
      runtimeRoot: roots.runtimeDir,
      stagingBasePath: scratch,
    },
  })
  await fs.mkdir(path.join(installed.environment, 'resources', 'sdxl-config'), { recursive: true })
  await fs.writeFile(
    path.join(installed.environment, 'resources', 'sdxl-config', 'model_index.json'),
    'broken ML configuration must not block Pillow derivatives',
  )
  assert.equal(
    (await manager.resolveInstalledProjectWorker(scratch))?.location.stagingBasePath,
    scratch,
  )
  assert.equal(inferenceStarts, 0)
  assert.deepEqual(await lines(path.join(roots.runtimeDir, 'launches')), [])
  assert.deepEqual(await lines(path.join(roots.runtimeDir, 'cpu-launches')), [])
})

test('installed project worker rejects external interpreter pointers and pointer symlinks', async (t) => {
  // Boundary: actual app-owned metadata and filesystem. Mutation: use the pointer path verbatim
  // or resolve a system/development Python when an installed executable is unavailable.
  for (const mode of [
    'external-pointer',
    'external-python-link',
    'pointer-link',
    'missing-python',
  ]) {
    await t.test(mode, async () => {
      const { roots, manager } = await fixture()
      const installed = await installAppOwnedProjectPointer(roots)
      const outside = await temporaryRoot()
      const externalPython = path.join(outside, 'python')
      await fs.writeFile(externalPython, 'external interpreter')
      if (mode === 'external-pointer') {
        await fs.writeFile(
          roots.pointerFile,
          JSON.stringify({
            schemaVersion: 1,
            runtimeId: 'derivatives-fixture',
            pythonExecutable: externalPython,
          }),
        )
      } else if (mode === 'pointer-link') {
        const externalPointer = path.join(outside, 'current-runtime.json')
        await fs.rename(roots.pointerFile, externalPointer)
        await fs.symlink(externalPointer, roots.pointerFile)
      } else {
        await fs.unlink(installed.executable)
        if (mode === 'external-python-link') await fs.symlink(externalPython, installed.executable)
      }
      assert.equal(await manager.resolveInstalledProjectWorker(roots.downloadsDir), null)
      assert.equal(await fs.readFile(externalPython, 'utf8'), 'external interpreter')
    })
  }
})

test('installed project worker requires canonical app-owned scratch, cache and runtime directories', async (t) => {
  // Boundary: real paths. Neighbor: unchanged directories. Mutation: accept normalized or
  // redirected paths and let a derivative client stage files outside the app-owned root.
  for (const mode of [
    'outside',
    'missing',
    'file',
    'alias',
    'traversal',
    'cache-link',
    'runtime-link',
  ]) {
    await t.test(mode, async () => {
      const { roots, manager } = await fixture()
      await installAppOwnedProjectPointer(roots)
      const scratch = path.join(roots.appDataDir, 'scratch')
      await fs.mkdir(scratch, { recursive: true, mode: 0o700 })
      assert.equal(
        (await manager.resolveInstalledProjectWorker(scratch))?.location.stagingBasePath,
        scratch,
      )
      let refusedScratch = scratch
      if (mode === 'outside') refusedScratch = await temporaryRoot()
      if (mode === 'missing') refusedScratch = path.join(scratch, 'missing')
      if (mode === 'file') {
        refusedScratch = path.join(scratch, 'file')
        await fs.writeFile(refusedScratch, '')
      }
      if (mode === 'alias') {
        refusedScratch = path.join(roots.appDataDir, 'scratch-link')
        await fs.symlink(scratch, refusedScratch)
      }
      if (mode === 'traversal') refusedScratch = `${scratch}/../scratch`
      if (mode === 'cache-link' || mode === 'runtime-link') {
        const target = mode === 'cache-link' ? roots.cacheDir : roots.runtimeDir
        const moved = `${target}-moved`
        await fs.rename(target, moved)
        await fs.symlink(moved, target)
      }
      assert.equal(await manager.resolveInstalledProjectWorker(refusedScratch), null)
    })
  }
})

test('installed project worker refuses unsupported hosts and shutdown during asynchronous resolution', async () => {
  // Boundary: runtime shutdown fence during real async pointer inspection. Mutation: check only
  // at entry and publish a late location after shutdown has stopped new worker startup.
  const { roots, manager } = await fixture()
  await installAppOwnedProjectPointer(roots)
  for (const host of [
    { platform: 'linux', arch: 'arm64' },
    { platform: 'darwin', arch: 'x64' },
  ]) {
    assert.equal(
      await new RuntimeManager(roots, host).resolveInstalledProjectWorker(roots.downloadsDir),
      null,
    )
  }
  assert.notEqual(await manager.resolveInstalledProjectWorker(roots.downloadsDir), null)
  const resolving = manager.resolveInstalledProjectWorker(roots.downloadsDir)
  manager.preventNewGenerationWork()
  assert.equal(await resolving, null)
  assert.equal(await manager.resolveInstalledProjectWorker(roots.downloadsDir), null)
})

test('installed project worker refuses an unconfirmed CPU startup owned outside RuntimeManager', async () => {
  // Boundary: actual failed ProjectWorkerClient startup and global physical-exit fence, without
  // a RuntimeManager preparation lease. Mutation: ignore failed starts owned by another client.
  const { roots, manager } = await fixture()
  const installed = await installFakeInferenceRuntime(roots)
  await fs.writeFile(path.join(installed.environment, 'cpu-mode'), 'bad-version-keepalive')
  const resolved = await manager.resolveInstalledProjectWorker(roots.downloadsDir)
  assert.notEqual(resolved, null)
  const actualKill = ChildProcess.prototype.kill
  const blocked = new Set()
  ChildProcess.prototype.kill = function (signal) {
    if (this.spawnargs.includes('imagegen_worker')) {
      blocked.add(this)
      return true
    }
    return actualKill.call(this, signal)
  }
  try {
    await assert.rejects(
      ProjectWorkerClient.start(resolved.location, {
        // The controlled peer checks this extra test resource; the production CPU worker has
        // no ML config dependency. Its bad-version response and exit handling are real JSONL.
        environment: { ...resolved.environment, IGS_SDXL_CONFIG_DIR: installed.config },
        shutdownWaitMs: 25,
      }),
      { code: 'WORKER_EXIT_UNCONFIRMED' },
    )
    assert.equal(ProjectWorkerClient.hasUnconfirmedStartExit(), true)
    assert.equal(await manager.resolveInstalledProjectWorker(roots.downloadsDir), null)
    assert.equal(await ProjectWorkerClient.retryUnconfirmedStartExit(), false)
    ChildProcess.prototype.kill = actualKill
    assert.equal(await ProjectWorkerClient.retryUnconfirmedStartExit(), true)
    assert.equal(ProjectWorkerClient.hasUnconfirmedStartExit(), false)
    assert.notEqual(await manager.resolveInstalledProjectWorker(roots.downloadsDir), null)
    assert.equal((await lines(path.join(roots.runtimeDir, 'cpu-launches'))).length, 1)
    assert.deepEqual(await lines(path.join(roots.runtimeDir, 'launches')), [])
  } finally {
    ChildProcess.prototype.kill = actualKill
    for (const child of blocked) {
      if (child.exitCode === null && child.signalCode === null) actualKill.call(child, 'SIGKILL')
    }
    await ProjectWorkerClient.retryUnconfirmedStartExit()
  }
})

test('installed project worker allows a live same-runtime GPU owner and refuses a replaced pointer', async () => {
  // Boundary: actual runtime lease plus app-owned pointer replacement. The controlled peer is
  // a lifecycle precondition, not trained CUDA evidence. Mutation: ignore the active runtime ID.
  const { roots, manager } = await fixture()
  await installFakeInferenceRuntime(roots)
  await manager.withGenerationWorker(roots.downloadsDir, async (gpu) => {
    assert.equal(
      (await manager.resolveInstalledProjectWorker(roots.downloadsDir))?.environment
        .CUDA_VISIBLE_DEVICES,
      '',
    )
    const before = structuredClone(gpu.ready)
    await installFakeInferenceRuntime(roots, 'replacement-runtime')
    assert.equal(await manager.resolveInstalledProjectWorker(roots.downloadsDir), null)
    assert.deepEqual(gpu.ready, before)
    assert.deepEqual(await lines(path.join(roots.runtimeDir, 'cpu-launches')), [])
  })
  assert.deepEqual(await lines(path.join(roots.runtimeDir, 'launches')), [
    'worker-2-linux-nvidia',
    'worker-2-linux-nvidia',
  ])
  assert.deepEqual(await lines(path.join(roots.runtimeDir, 'exits')), [
    'worker-2-linux-nvidia',
    'worker-2-linux-nvidia',
  ])
  assert.notEqual(await manager.resolveInstalledProjectWorker(roots.downloadsDir), null)
})

test('runtime qualification and active advisory readiness share the 0.3.0 progress capability gate', async () => {
  const roots = await createRuntimeRoots(await temporaryRoot())
  const installed = await installFakeInferenceRuntime(roots)
  const scratch = path.join(roots.appDataDir, 'scratch')
  await fs.mkdir(scratch, { recursive: true, mode: 0o700 })
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

test('CFG Rescale readiness is a copied verified handshake, expires or fails closed, and never probes a live CUDA lease', async () => {
  const roots = await createRuntimeRoots(await temporaryRoot())
  const installed = await installFakeInferenceRuntime(roots)
  await fs.writeFile(path.join(installed.environment, 'mode'), 'rescale-ready')
  const scratch = path.join(roots.appDataDir, 'scratch')
  await fs.mkdir(scratch, { recursive: true, mode: 0o700 })
  const manager = new RuntimeManager(roots, { platform: 'linux', arch: 'x64' })
  assert.equal(await manager.readQualifiedInferenceReady(), null)
  assert.equal((await lines(path.join(roots.runtimeDir, 'launches'))).length, 0)
  assert.equal((await manager.getStatus()).value.kind, 'ready')
  const initial = await manager.readQualifiedInferenceReady()
  assert.equal(initial.workerVersion, '0.5.0')
  assert.ok(initial.capabilities.includes('illustrious-cfg-rescale'))
  initial.capabilities.splice(0)
  assert.ok(
    (await manager.readQualifiedInferenceReady()).capabilities.includes('illustrious-cfg-rescale'),
  )
  const before = (await lines(path.join(roots.runtimeDir, 'launches'))).length
  await manager.withGenerationWorker(scratch, async () => {
    const active = (await lines(path.join(roots.runtimeDir, 'launches'))).length
    assert.equal(active, before + 2, 'one qualification and one leased child')
    assert.equal((await manager.getStatus()).value.kind, 'ready')
    assert.equal((await manager.readQualifiedInferenceReady()).workerVersion, '0.5.0')
    assert.equal((await lines(path.join(roots.runtimeDir, 'launches'))).length, active)
  })
  const nativeNow = Date.now
  try {
    Date.now = () => nativeNow() + 61_000
    assert.equal(await manager.readQualifiedInferenceReady(), null)
    assert.equal((await manager.getStatus()).value.kind, 'ready')
    assert.equal((await manager.readQualifiedInferenceReady()).workerVersion, '0.5.0')
    Date.now = () => nativeNow() + 122_000
    await fs.writeFile(path.join(installed.environment, 'mode'), 'rescale-missing-capability')
    assert.equal((await manager.getStatus()).value.kind, 'needs-repair')
    // Restore time while the preceding cache would still be valid, proving failure revoked it.
    Date.now = nativeNow
    assert.equal(await manager.readQualifiedInferenceReady(), null)
  } finally {
    Date.now = nativeNow
  }
  await installFakeInferenceRuntime(roots, 'replacement-linux-nvidia')
  assert.equal(await manager.readQualifiedInferenceReady(), null)
  assert.equal((await manager.getStatus()).value.kind, 'ready')
  assert.equal((await manager.readQualifiedInferenceReady()).workerVersion, '0.2.0')
  manager.preventNewGenerationWork()
  assert.equal(await manager.readQualifiedInferenceReady(), null)
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
  await fs.mkdir(scratch, { recursive: true, mode: 0o700 })
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
  await fs.mkdir(scratch, { recursive: true, mode: 0o700 })
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
    assert.equal(await manager.resolveInstalledProjectWorker(scratch), null)
    assert.deepEqual(await lines(path.join(roots.runtimeDir, 'launches')), [
      'worker-2-linux-nvidia',
    ])
    blockClose = false
    assert.equal((await manager.getStatus()).value.kind, 'ready')
    assert.notEqual(await manager.resolveInstalledProjectWorker(scratch), null)
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
  await fs.mkdir(scratch, { recursive: true, mode: 0o700 })
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
  await fs.mkdir(scratch, { recursive: true, mode: 0o700 })
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
  await fs.mkdir(scratch, { recursive: true, mode: 0o700 })
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
  await fs.mkdir(scratch, { recursive: true, mode: 0o700 })
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
  await fs.mkdir(scratch, { recursive: true, mode: 0o700 })
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

test('metadata-only admission reuses each qualified active peer without borrowing its lease or transport', async (t) => {
  // Boundary: real RuntimeManager and JSONL child; only the Python/CUDA implementation is replaced.
  // Invariant: admission copies ready metadata while the original worker stays owned and open.
  // Neighbor: idle admission qualifies normally. Mutation: reuse worker.ready by reference or close it.
  for (const [mode, version, capabilities] of [
    ['ready', '0.2.0', ['illustrious-txt2img']],
    ['progress-ready', '0.3.0', ['illustrious-txt2img', 'denoising-progress']],
    [
      'thumbnail-ready',
      '0.4.0',
      ['illustrious-txt2img', 'denoising-progress', 'candidate-thumbnails'],
    ],
  ]) {
    await t.test(version, async () => {
      const { roots, manager } = await fixture()
      const installed = await installFakeInferenceRuntime(roots)
      await fs.writeFile(path.join(installed.environment, 'mode'), mode)
      const scratch = path.join(roots.appDataDir, 'scratch')
      await fs.mkdir(scratch, { recursive: true, mode: 0o700 })
      const originalFailure = new Error('metadata capture failed')
      const result = await manager.withGenerationWorker(scratch, async (worker) => {
        const actualReady = worker.ready
        assert.equal((await lines(path.join(roots.runtimeDir, 'launches'))).length, 2)
        assert.equal((await lines(path.join(roots.runtimeDir, 'exits'))).length, 1)
        assert.equal(
          await manager.withGenerationAdmission(scratch, async (ready) => {
            assert.deepEqual(ready, {
              capabilities: [
                ...capabilities,
                ...(process.platform === 'linux' ? ['linux-owned-inference-v1'] : []),
              ],
              protocolVersion: '1',
              runtimeProfile: 'linux-nvidia',
              workerVersion: version,
            })
            assert.notEqual(ready, actualReady)
            assert.notEqual(ready.capabilities, actualReady.capabilities)
            ready.capabilities.push('caller-local')
            ready.workerVersion = 'caller-local'
            return 'admitted'
          }),
          'admitted',
        )
        assert.equal(worker.ready, actualReady)
        assert.deepEqual(worker.ready.capabilities, [
          ...capabilities,
          ...(process.platform === 'linux' ? ['linux-owned-inference-v1'] : []),
        ])
        assert.equal(worker.ready.workerVersion, version)
        await assert.rejects(
          manager.withGenerationAdmission(scratch, async () => {
            throw originalFailure
          }),
          (error) => error === originalFailure,
        )
        assert.equal(worker.ready, actualReady)
        assert.equal(
          await manager.withGenerationWorker(scratch, async () => 'second GPU child'),
          null,
        )
        assert.equal((await lines(path.join(roots.runtimeDir, 'launches'))).length, 2)
        assert.equal((await lines(path.join(roots.runtimeDir, 'exits'))).length, 1)
        return 'original-owner-completed'
      })
      assert.equal(result, 'original-owner-completed')
      assert.equal((await lines(path.join(roots.runtimeDir, 'exits'))).length, 2)
      assert.deepEqual(await lines(path.join(roots.runtimeDir, 'requests')), [])
    })
  }
})

test('metadata admission refuses a qualifying lease immediately and later admits its running child', async () => {
  const roots = await createRuntimeRoots(await temporaryRoot())
  await installFakeInferenceRuntime(roots)
  const scratch = path.join(roots.appDataDir, 'scratch')
  await fs.mkdir(scratch, { recursive: true, mode: 0o700 })
  let enteredQualification
  const entered = new Promise((resolve) => {
    enteredQualification = resolve
  })
  let resumeQualification
  const gate = new Promise((resolve) => {
    resumeQualification = resolve
  })
  const manager = new RuntimeManager(
    roots,
    { platform: 'linux', arch: 'x64' },
    async (location, environment) => {
      const child = await GenerationWorkerClient.start(location, { environment })
      enteredQualification()
      await gate
      return child
    },
  )
  const generation = manager.withGenerationWorker(scratch, async () => {
    assert.equal(
      await manager.withGenerationAdmission(scratch, async (ready) => ready.workerVersion),
      '0.2.0',
    )
    return 'completed'
  })
  try {
    await entered
    let timeout
    try {
      assert.equal(
        await Promise.race([
          manager.withGenerationAdmission(scratch, async () =>
            assert.fail('qualifying child cannot lend ready metadata'),
          ),
          new Promise((_, reject) => {
            timeout = setTimeout(
              () => reject(new Error('admission waited for qualification')),
              1000,
            )
          }),
        ]),
        null,
      )
    } finally {
      clearTimeout(timeout)
    }
    assert.equal(
      await manager.withGenerationPreparation(scratch, async () =>
        assert.fail('qualifying peer cannot prepare'),
      ),
      null,
    )
    assert.equal(await manager.resolveInstalledProjectWorker(scratch), null)
    assert.equal((await lines(path.join(roots.runtimeDir, 'launches'))).length, 1)
  } finally {
    resumeQualification()
  }
  assert.equal(await generation, 'completed')
  assert.equal((await lines(path.join(roots.runtimeDir, 'launches'))).length, 2)
  assert.equal((await lines(path.join(roots.runtimeDir, 'exits'))).length, 2)
})

test('metadata admission refuses a closed running child and shutdown without replacing the active owner', async (t) => {
  for (const refusal of ['closed', 'shutdown']) {
    await t.test(refusal, async () => {
      const { roots, manager } = await fixture()
      await installFakeInferenceRuntime(roots)
      const scratch = path.join(roots.appDataDir, 'scratch')
      await fs.mkdir(scratch, { recursive: true, mode: 0o700 })
      assert.equal(
        await manager.withGenerationWorker(scratch, async (worker) => {
          assert.equal(await manager.withGenerationAdmission(scratch, async () => 'ready'), 'ready')
          if (refusal === 'closed') await worker.close()
          else manager.preventNewGenerationWork()
          assert.equal(
            await manager.withGenerationAdmission(scratch, async () =>
              assert.fail('unavailable running child cannot admit metadata'),
            ),
            null,
          )
          assert.equal((await lines(path.join(roots.runtimeDir, 'launches'))).length, 2)
          assert.equal(
            await manager.withGenerationPreparation(scratch, async () =>
              assert.fail('unavailable peer cannot prepare'),
            ),
            null,
          )
          if (refusal === 'shutdown') {
            assert.equal(worker.ready.workerVersion, '0.2.0')
            assert.equal((await lines(path.join(roots.runtimeDir, 'exits'))).length, 1)
          }
          return 'owner-completed'
        }),
        'owner-completed',
      )
      assert.equal((await lines(path.join(roots.runtimeDir, 'exits'))).length, 2)
      assert.deepEqual(await lines(path.join(roots.runtimeDir, 'requests')), [])
    })
  }
})

test('idle metadata admission uses live qualification and refuses unsupported or unqualified workers', async () => {
  const { roots, manager } = await fixture()
  const scratch = path.join(roots.appDataDir, 'scratch')
  await fs.mkdir(scratch, { recursive: true, mode: 0o700 })
  assert.equal(
    await manager.withGenerationAdmission(scratch, async () => assert.fail('missing runtime')),
    null,
  )
  const installed = await installFakeInferenceRuntime(roots)
  const unsupported = new RuntimeManager(roots, { platform: 'darwin', arch: 'x64' })
  assert.equal(
    await unsupported.withGenerationAdmission(scratch, async () => assert.fail('unsupported host')),
    null,
  )
  assert.deepEqual(await lines(path.join(roots.runtimeDir, 'launches')), [])
  assert.deepEqual(await manager.withGenerationAdmission(scratch, async (ready) => ready), {
    capabilities: [
      'illustrious-txt2img',
      ...(process.platform === 'linux' ? ['linux-owned-inference-v1'] : []),
    ],
    protocolVersion: '1',
    runtimeProfile: 'linux-nvidia',
    workerVersion: '0.2.0',
  })
  assert.equal((await lines(path.join(roots.runtimeDir, 'launches'))).length, 2)
  assert.equal((await lines(path.join(roots.runtimeDir, 'exits'))).length, 2)
  await fs.writeFile(path.join(installed.environment, 'mode'), 'wrong-version')
  assert.equal(
    await manager.withGenerationAdmission(scratch, async () => assert.fail('unqualified worker')),
    null,
  )
  assert.equal((await lines(path.join(roots.runtimeDir, 'launches'))).length, 3)
  assert.equal((await lines(path.join(roots.runtimeDir, 'exits'))).length, 3)
  assert.deepEqual(await lines(path.join(roots.runtimeDir, 'requests')), [])
})

test('unconfirmed generation exit retains its lease and blocks every new CUDA process until retry', async () => {
  const { roots, manager } = await fixture()
  await installFakeInferenceRuntime(roots)
  const scratch = path.join(roots.appDataDir, 'scratch')
  await fs.mkdir(scratch, { recursive: true, mode: 0o700 })
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
    assert.equal(
      await manager.withGenerationAdmission(scratch, async () => 'unsafe metadata'),
      null,
    )
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
  await fs.mkdir(scratch, { recursive: true, mode: 0o700 })
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

async function installCpuTarget(roots) {
  // A pinned transparent RGBA image is protocol test data, not a second composition implementation.
  const chunk = (tag, payload) => {
    const name = Buffer.from(tag)
    const size = Buffer.alloc(4)
    size.writeUInt32BE(payload.length)
    const checksum = Buffer.alloc(4)
    checksum.writeUInt32BE(crc32(Buffer.concat([name, payload])))
    return Buffer.concat([size, name, payload, checksum])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(2, 0)
  header.writeUInt32BE(2, 4)
  header[8] = 8
  header[9] = 6
  const profile = await fs.readFile('worker-python/src/imagegen_worker/srgb.icc')
  await fs.writeFile(
    path.join(roots.runtimeDir, 'cpu-target.png'),
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', header),
      chunk('iCCP', Buffer.concat([Buffer.from('sRGB\0\0'), deflateSync(profile)])),
      chunk('IDAT', deflateSync(Buffer.alloc(18))),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  )
}

async function composeCpuTarget(targetWorker, scratch) {
  const stagingRoot = await fs.mkdtemp(path.join(scratch, 'target-'))
  return await targetWorker.composeTarget({
    bbox: { x: -7, y: 11, width: 2, height: 2 },
    layers: [],
    stagingRoot,
    targetPngPath: path.join(stagingRoot, 'target.png'),
  })
}

async function waitForLines(file, count) {
  const deadline = Date.now() + 3000
  while ((await lines(file)).length < count) {
    if (Date.now() > deadline) throw new Error('Subprocess did not reach the expected boundary.')
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

function deferred() {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}

test('Smart preparation refuses legacy and incomplete peers before CPU admission while ordinary preparation remains usable', async (t) => {
  // Real RuntimeManager and JSONL children; only peer capabilities and pixel composition are controlled.
  for (const mode of ['ready', 'smart-missing-execution', 'smart-missing-seed']) {
    await t.test(mode, async () => {
      const { roots, manager } = await fixture()
      const installed = await installFakeInferenceRuntime(roots)
      await fs.writeFile(path.join(installed.environment, 'mode'), mode)
      await installCpuTarget(roots)
      const scratch = path.join(roots.appDataDir, 'scratch')
      await fs.mkdir(scratch, { recursive: true, mode: 0o700 })
      const completed = await manager.withGenerationWorker(scratch, async (gpu) => {
        assert.equal(
          await manager.withSmartPatchGenerationPreparation(scratch, async () =>
            assert.fail('An unqualified Smart capability must not admit preparation.'),
          ),
          null,
        )
        assert.deepEqual(await lines(path.join(roots.runtimeDir, 'cpu-launches')), [])
        assert.equal(
          await manager.withGenerationPreparation(
            scratch,
            async ({ targetWorker }) => (await composeCpuTarget(targetWorker, scratch)).mode,
          ),
          'txt2img',
        )
        assert.equal(gpu.ready.workerVersion, mode === 'ready' ? '0.2.0' : '0.14.0')
        assert.equal((await lines(path.join(roots.runtimeDir, 'launches'))).length, 2)
        assert.equal((await lines(path.join(roots.runtimeDir, 'exits'))).length, 1)
        assert.equal((await lines(path.join(roots.runtimeDir, 'cpu-launches'))).length, 1)
        assert.equal((await lines(path.join(roots.runtimeDir, 'cpu-exits'))).length, 1)
        return 'ordinary-owner-completed'
      })
      assert.equal(completed, 'ordinary-owner-completed')
      assert.equal((await lines(path.join(roots.runtimeDir, 'exits'))).length, 2)
    })
  }
})

test('qualified Smart preparation owns one installed CUDA-hidden CPU child through its callback and confirmed exit', async () => {
  const { roots, manager } = await fixture()
  const installed = await installFakeInferenceRuntime(roots)
  await fs.writeFile(path.join(installed.environment, 'mode'), 'smart-ready')
  await installCpuTarget(roots)
  const scratch = path.join(roots.appDataDir, 'scratch')
  await fs.mkdir(scratch, { recursive: true, mode: 0o700 })
  const completed = await manager.withGenerationWorker(scratch, async (gpu) => {
    const snapshot = structuredClone(gpu.ready)
    const entered = deferred()
    const finish = deferred()
    const preparation = manager.withSmartPatchGenerationPreparation(
      scratch,
      async ({ inferenceReady, preparationWorker }) => {
        assert.equal(preparationWorker instanceof ProjectWorkerClient, true)
        assert.notEqual(inferenceReady, gpu.ready)
        assert.notEqual(inferenceReady.capabilities, gpu.ready.capabilities)
        inferenceReady.capabilities.push('caller-local')
        assert.equal((await composeCpuTarget(preparationWorker, scratch)).mode, 'txt2img')
        entered.resolve()
        await finish.promise
        return 'smart-prepared'
      },
    )
    try {
      await Promise.race([
        entered.promise,
        preparation.then(() => assert.fail('Qualified Smart preparation must enter its callback.')),
      ])
      assert.equal((await lines(path.join(roots.runtimeDir, 'cpu-launches'))).length, 1)
      assert.deepEqual(await lines(path.join(roots.runtimeDir, 'cpu-exits')), [])
      assert.equal((await lines(path.join(roots.runtimeDir, 'launches'))).length, 2)
      assert.equal((await lines(path.join(roots.runtimeDir, 'exits'))).length, 1)
      assert.equal(
        await manager.withSmartPatchGenerationPreparation(scratch, async () => 'second Smart'),
        null,
      )
      assert.equal(await manager.withGenerationPreparation(scratch, async () => 'second CPU'), null)
      assert.equal(await manager.withGenerationWorker(scratch, async () => 'second GPU'), null)
      assert.equal(
        await manager.withGenerationAdmission(scratch, async () => 'second admission'),
        null,
      )
      assert.deepEqual(gpu.ready, snapshot)
      finish.resolve()
      assert.equal(await preparation, 'smart-prepared')
      assert.equal((await lines(path.join(roots.runtimeDir, 'cpu-exits'))).length, 1)
      assert.equal((await lines(path.join(roots.runtimeDir, 'exits'))).length, 1)
      const failure = new Error('Smart callback failed.')
      await assert.rejects(
        manager.withSmartPatchGenerationPreparation(scratch, async () => {
          throw failure
        }),
        (error) => error === failure,
      )
      assert.equal((await lines(path.join(roots.runtimeDir, 'cpu-exits'))).length, 2)
      assert.equal(
        await manager.withGenerationAdmission(scratch, async () => 'same GPU remains ready'),
        'same GPU remains ready',
      )
      assert.deepEqual(gpu.ready, snapshot)
    } finally {
      finish.resolve()
      await preparation
    }
    return 'smart-owner-completed'
  })
  assert.equal(completed, 'smart-owner-completed')
  assert.equal((await lines(path.join(roots.runtimeDir, 'exits'))).length, 2)
  assert.equal(
    await manager.withSmartPatchGenerationPreparation(
      scratch,
      async ({ inferenceReady, preparationWorker }) => {
        assert.equal(inferenceReady.workerVersion, '0.14.0')
        assert.equal(preparationWorker instanceof ProjectWorkerClient, true)
        return (await composeCpuTarget(preparationWorker, scratch)).mode
      },
    ),
    'txt2img',
  )
  assert.equal((await lines(path.join(roots.runtimeDir, 'cpu-launches'))).length, 3)
  assert.equal((await lines(path.join(roots.runtimeDir, 'cpu-exits'))).length, 3)
  assert.equal(
    (await lines(path.join(roots.runtimeDir, 'launches'))).length,
    (await lines(path.join(roots.runtimeDir, 'exits'))).length,
  )
  assert.deepEqual(await lines(path.join(roots.runtimeDir, 'requests')), [])
  assert.deepEqual(await lines(path.join(roots.runtimeDir, 'cpu-requests')), [
    'compose-target',
    'compose-target',
  ])
})

test('Smart preparation refuses captured readiness when its borrowed GPU exit fails during CPU startup', async () => {
  // Both protocol children are real. Only the GPU close acknowledgment is refused; startup-gate
  // holds the CPU ready line until that failure is observed, before the Smart callback can run.
  const { roots, manager } = await fixture()
  const installed = await installFakeInferenceRuntime(roots)
  await fs.writeFile(path.join(installed.environment, 'mode'), 'smart-ready')
  await fs.writeFile(path.join(installed.environment, 'cpu-mode'), 'startup-gate')
  const scratch = path.join(roots.appDataDir, 'scratch')
  await fs.mkdir(scratch, { recursive: true, mode: 0o700 })
  const gpuEntered = deferred()
  const gpuFinish = deferred()
  let blockClose = true
  let preparation
  let callbacks = 0
  const generation = manager.withGenerationWorker(scratch, async (gpu) => {
    const close = gpu.close.bind(gpu)
    gpu.close = async () => {
      if (blockClose) throw new Error('Borrowed GPU exit remains unconfirmed.')
      await close()
    }
    gpuEntered.resolve()
    await gpuFinish.promise
  })
  const generationFailure = assert.rejects(generation, /Borrowed GPU exit remains unconfirmed/)
  try {
    await Promise.race([
      gpuEntered.promise,
      generation.then(() => assert.fail('The installed Smart peer must own the GPU lease.')),
    ])
    preparation = manager.withSmartPatchGenerationPreparation(scratch, async () => {
      callbacks++
      return 'stale-readiness-was-lent'
    })
    await waitForLines(path.join(roots.runtimeDir, 'cpu-launches'), 1)
    gpuFinish.resolve()
    await generationFailure
    assert.equal((await manager.getStatus()).value.kind, 'needs-repair')
    await fs.writeFile(path.join(roots.runtimeDir, 'cpu-release-start'), '')
    assert.equal(await preparation, null)
    assert.equal(callbacks, 0)
    assert.equal((await lines(path.join(roots.runtimeDir, 'cpu-exits'))).length, 1)
    assert.equal((await lines(path.join(roots.runtimeDir, 'launches'))).length, 2)
    assert.equal((await lines(path.join(roots.runtimeDir, 'exits'))).length, 1)
    assert.equal(await manager.retryUnconfirmedGenerationExit(), false)
    assert.equal(
      await manager.withSmartPatchGenerationPreparation(scratch, async () => 'unsafe'),
      null,
    )
    assert.equal(await manager.withGenerationWorker(scratch, async () => 'unsafe'), null)
    blockClose = false
    assert.equal(await manager.retryUnconfirmedGenerationExit(), true)
    assert.equal((await lines(path.join(roots.runtimeDir, 'exits'))).length, 2)
    assert.notEqual(await manager.resolveInstalledProjectWorker(scratch), null)
    assert.equal(ProjectWorkerClient.hasUnconfirmedExit(), false)
  } finally {
    blockClose = false
    gpuFinish.resolve()
    await fs.writeFile(path.join(roots.runtimeDir, 'cpu-release-start'), '')
    await Promise.allSettled([generation, generationFailure, preparation])
    await manager.retryUnconfirmedGenerationExit()
  }
})

test('new-generation preparation uses one CUDA-hidden target child while the actual GPU owner remains live', async () => {
  // Boundary: actual RuntimeManager, two real JSONL children and verified target composition.
  // Invariant: one CPU lease, no second GPU or inference request; copied metadata and confirmed exit.
  // Neighbor: idle preparation below. Mutation: share GPU transport or release the CPU lease early.
  const { roots, manager } = await fixture()
  await installFakeInferenceRuntime(roots)
  await installCpuTarget(roots)
  const scratch = path.join(roots.appDataDir, 'scratch')
  await fs.mkdir(scratch, { recursive: true, mode: 0o700 })
  await manager.withGenerationWorker(scratch, async (gpu) => {
    assert.equal(
      (await manager.resolveInstalledProjectWorker(scratch))?.environment.CUDA_VISIBLE_DEVICES,
      '',
    )
    const snapshot = structuredClone(gpu.ready)
    const preparation = manager.withGenerationPreparation(
      scratch,
      async ({ inferenceReady, targetWorker }) => {
        assert.notEqual(inferenceReady, gpu.ready)
        assert.notEqual(inferenceReady.capabilities, gpu.ready.capabilities)
        inferenceReady.capabilities.push('caller-local')
        inferenceReady.workerVersion = 'caller-local'
        assert.deepEqual(Object.keys(targetWorker), ['composeTarget'])
        assert.equal((await manager.getStatus()).value.kind, 'ready')
        assert.equal((await composeCpuTarget(targetWorker, scratch)).mode, 'txt2img')
        assert.equal((await lines(path.join(roots.runtimeDir, 'exits'))).length, 1)
        return 'target-prepared'
      },
    )
    assert.equal(await manager.withGenerationPreparation(scratch, async () => 'second CPU'), null)
    assert.equal(await manager.withGenerationAdmission(scratch, async () => 'metadata'), null)
    assert.equal(await preparation, 'target-prepared')
    assert.deepEqual(gpu.ready, snapshot)
    assert.equal((await lines(path.join(roots.runtimeDir, 'cpu-launches'))).length, 1)
    assert.equal((await lines(path.join(roots.runtimeDir, 'cpu-exits'))).length, 1)
    assert.deepEqual(await lines(path.join(roots.runtimeDir, 'cpu-requests')), ['compose-target'])
    assert.deepEqual(await lines(path.join(roots.runtimeDir, 'requests')), [])
    assert.equal((await lines(path.join(roots.runtimeDir, 'launches'))).length, 2)
    const original = new Error('preparation callback failed')
    await assert.rejects(
      manager.withGenerationPreparation(scratch, async () => {
        throw original
      }),
      (error) => error === original,
    )
    assert.equal((await lines(path.join(roots.runtimeDir, 'cpu-exits'))).length, 2)
  })
  assert.equal((await lines(path.join(roots.runtimeDir, 'exits'))).length, 2)
})

test('idle new-generation preparation delegates the normal GPU lease and refuses unavailable hosts', async () => {
  const { roots, manager } = await fixture()
  const scratch = path.join(roots.appDataDir, 'scratch')
  await fs.mkdir(scratch, { recursive: true, mode: 0o700 })
  assert.equal(
    await manager.withGenerationPreparation(scratch, async () => 'missing runtime'),
    null,
  )
  await installFakeInferenceRuntime(roots)
  assert.equal(
    await manager.withGenerationPreparation(scratch, async ({ inferenceReady, targetWorker }) => {
      assert.equal(targetWorker instanceof GenerationWorkerClient, true)
      const original = targetWorker.ready
      assert.notEqual(inferenceReady, original)
      inferenceReady.capabilities.push('local')
      assert.equal(original.capabilities.includes('local'), false)
      return 'idle-qualified'
    }),
    'idle-qualified',
  )
  assert.equal((await lines(path.join(roots.runtimeDir, 'launches'))).length, 2)
  assert.deepEqual(await lines(path.join(roots.runtimeDir, 'cpu-launches')), [])
  const unsupported = new RuntimeManager(roots, { platform: 'darwin', arch: 'x64' })
  assert.equal(
    await unsupported.withGenerationPreparation(scratch, async () => 'unsupported'),
    null,
  )
})

test('GPU completion during CPU startup retains captured qualification and never permits a competing GPU probe', async () => {
  const { roots, manager } = await fixture()
  const installed = await installFakeInferenceRuntime(roots)
  await installCpuTarget(roots)
  await fs.writeFile(path.join(installed.environment, 'cpu-mode'), 'startup-gate')
  const scratch = path.join(roots.appDataDir, 'scratch')
  await fs.mkdir(scratch, { recursive: true, mode: 0o700 })
  const entered = deferred(),
    finish = deferred()
  const generation = manager.withGenerationWorker(scratch, async () => {
    entered.resolve()
    await finish.promise
    return 'gpu-finished'
  })
  await entered.promise
  const preparation = manager.withGenerationPreparation(
    scratch,
    async ({ inferenceReady, targetWorker }) => {
      assert.equal(inferenceReady.workerVersion, '0.2.0')
      return (await composeCpuTarget(targetWorker, scratch)).mode
    },
  )
  try {
    await waitForLines(path.join(roots.runtimeDir, 'cpu-launches'), 1)
    finish.resolve()
    assert.equal(await generation, 'gpu-finished')
    assert.equal(await manager.withGenerationWorker(scratch, async () => 'competing GPU'), null)
    assert.equal((await manager.getStatus()).value.kind, 'needs-repair')
    assert.equal((await lines(path.join(roots.runtimeDir, 'launches'))).length, 2)
    await fs.writeFile(path.join(roots.runtimeDir, 'cpu-release-start'), '')
    assert.equal(await preparation, 'txt2img')
    assert.equal((await lines(path.join(roots.runtimeDir, 'cpu-exits'))).length, 1)
  } finally {
    finish.resolve()
    await fs.writeFile(path.join(roots.runtimeDir, 'cpu-release-start'), '')
    await Promise.allSettled([generation, preparation])
  }
})

test('busy preparation validates pointer, configuration and executable both before and after CPU startup', async (t) => {
  for (const boundary of ['before', 'after']) {
    for (const source of ['pointer', 'config', 'executable']) {
      await t.test(`${boundary} ${source}`, async () => {
        const { roots, manager } = await fixture()
        const installed = await installFakeInferenceRuntime(roots)
        const scratch = path.join(roots.appDataDir, 'scratch')
        await fs.mkdir(scratch, { recursive: true, mode: 0o700 })
        await manager.withGenerationWorker(scratch, async () => {
          if (boundary === 'before') {
            if (source === 'pointer') await fs.writeFile(roots.pointerFile, '{}')
            if (source === 'config')
              await fs.writeFile(path.join(installed.config, 'model_index.json'), 'changed')
            if (source === 'executable') await fs.appendFile(installed.executable, '\n')
          } else
            await fs.writeFile(path.join(installed.environment, 'cpu-mode'), `replace-${source}`)
          assert.equal(
            await manager.withGenerationPreparation(scratch, async () =>
              assert.fail('Changed runtime must not reach the caller'),
            ),
            null,
          )
          assert.equal(
            (await lines(path.join(roots.runtimeDir, 'cpu-launches'))).length,
            boundary === 'before' ? 0 : 1,
          )
          assert.equal(
            (await lines(path.join(roots.runtimeDir, 'cpu-exits'))).length,
            boundary === 'before' ? 0 : 1,
          )
          assert.equal((await lines(path.join(roots.runtimeDir, 'launches'))).length, 2)
        })
      })
    }
  }
})

test('a finite derivatives qualification and target capability are required for busy preparation', async (t) => {
  for (const mode of ['missing-target', 'bad-version']) {
    await t.test(mode, async () => {
      const { roots, manager } = await fixture()
      const installed = await installFakeInferenceRuntime(roots)
      const scratch = path.join(roots.appDataDir, 'scratch')
      await fs.mkdir(scratch, { recursive: true, mode: 0o700 })
      await fs.writeFile(path.join(installed.environment, 'cpu-mode'), mode)
      await manager.withGenerationWorker(scratch, async () => {
        const preparation = manager.withGenerationPreparation(scratch, async () =>
          assert.fail('Unqualified CPU worker cannot prepare a target'),
        )
        if (mode === 'bad-version')
          await assert.rejects(preparation, { code: 'WORKER_VERSION_MISMATCH' })
        else assert.equal(await preparation, null)
        assert.equal((await lines(path.join(roots.runtimeDir, 'cpu-exits'))).length, 1)
        assert.equal((await lines(path.join(roots.runtimeDir, 'launches'))).length, 2)
      })
    })
  }
})

test('shutdown promptly stops both CPU startup and an active composition without waiting for request deadlines', async (t) => {
  for (const mode of ['startup-hang', 'request-hang']) {
    await t.test(mode, { timeout: 10000 }, async () => {
      const { roots, manager } = await fixture()
      const installed = await installFakeInferenceRuntime(roots)
      await installCpuTarget(roots)
      const scratch = path.join(roots.appDataDir, 'scratch')
      await fs.mkdir(scratch, { recursive: true, mode: 0o700 })
      await fs.writeFile(path.join(installed.environment, 'cpu-mode'), mode)
      const start = ProjectWorkerClient.start
      ProjectWorkerClient.start = async (location, options) =>
        start.call(ProjectWorkerClient, location, { ...options, shutdownWaitMs: 25 })
      try {
        await manager.withGenerationWorker(scratch, async (gpu) => {
          const preparation = manager.withGenerationPreparation(scratch, async ({ targetWorker }) =>
            composeCpuTarget(targetWorker, scratch),
          )
          const refused = assert.rejects(preparation, { code: 'CLOSED' })
          await waitForLines(
            path.join(roots.runtimeDir, mode === 'startup-hang' ? 'cpu-launches' : 'cpu-requests'),
            1,
          )
          const since = Date.now()
          manager.preventNewGenerationWork()
          await refused
          assert.equal(Date.now() - since < 2000, true)
          assert.equal(
            (await lines(path.join(roots.runtimeDir, 'cpu-exits'))).length,
            0,
            'SIGKILL does not run the fake peer exit handler',
          )
          assert.equal(await manager.withGenerationPreparation(scratch, async () => 'late'), null)
          await gpu.close()
        })
        assert.equal(await manager.retryUnconfirmedGenerationExit(), true)
      } finally {
        ProjectWorkerClient.start = start
      }
    })
  }
})

test('unconfirmed CPU close retains its owner and excludes every preparation and GPU qualification until retry', async () => {
  const { roots, manager } = await fixture()
  const installed = await installFakeInferenceRuntime(roots)
  const scratch = path.join(roots.appDataDir, 'scratch')
  await fs.mkdir(scratch, { recursive: true, mode: 0o700 })
  await fs.writeFile(path.join(installed.environment, 'cpu-mode'), 'request-hang')
  const start = ProjectWorkerClient.start
  const actualKill = ChildProcess.prototype.kill
  const blocked = new Set()
  ChildProcess.prototype.kill = function (signal) {
    if (this.spawnargs.includes('imagegen_worker')) {
      blocked.add(this)
      return true
    }
    return actualKill.call(this, signal)
  }
  ProjectWorkerClient.start = async (location, options) =>
    start.call(ProjectWorkerClient, location, { ...options, shutdownWaitMs: 25 })
  try {
    await manager.withGenerationWorker(scratch, async () => {
      await assert.rejects(
        manager.withGenerationPreparation(scratch, async () => 'prepared'),
        { code: 'WORKER_EXIT_UNCONFIRMED' },
      )
      assert.equal((await manager.getStatus()).value.kind, 'needs-repair')
      assert.equal(await manager.withGenerationPreparation(scratch, async () => 'second CPU'), null)
      assert.equal(await manager.withGenerationAdmission(scratch, async () => 'metadata'), null)
    })
    assert.equal(await manager.resolveQualifiedGenerationWorker(scratch), null)
    assert.equal(await manager.withGenerationWorker(scratch, async () => 'unsafe GPU'), null)
    assert.equal(await manager.resolveInstalledProjectWorker(scratch), null)
    assert.equal(await manager.retryUnconfirmedGenerationExit(), false)
    assert.equal((await lines(path.join(roots.runtimeDir, 'launches'))).length, 2)
    assert.equal((await lines(path.join(roots.runtimeDir, 'cpu-launches'))).length, 1)
    ChildProcess.prototype.kill = actualKill
    assert.equal(await manager.retryUnconfirmedGenerationExit(), true)
    const [child] = blocked
    assert.equal(child.exitCode !== null || child.signalCode !== null, true)
    assert.equal((await manager.getStatus()).value.kind, 'ready')
    assert.notEqual(await manager.resolveInstalledProjectWorker(scratch), null)
  } finally {
    ChildProcess.prototype.kill = actualKill
    ProjectWorkerClient.start = start
    for (const child of blocked)
      if (child.exitCode === null && child.signalCode === null) actualKill.call(child, 'SIGKILL')
    await manager.retryUnconfirmedGenerationExit()
  }
})

test(
  'established Main image-owner exit fences the runtime globally while preserving completed action and placeholder Save',
  { timeout: 10_000 },
  async () => {
    // Boundary: actual image owner → established ProjectWorkerClient.close → global RuntimeManager.
    // Only the protocol peer and OS termination refusal are controlled; no fake owner/global flags.
    // Neighbor: restore real SIGKILL, observe physical exit, then qualify/admit again.
    const { roots, manager } = await fixture()
    const installed = await installFakeInferenceRuntime(roots)
    await installCpuTarget(roots)
    await fs.writeFile(path.join(installed.environment, 'cpu-mode'), 'close-keepalive')
    const scratch = path.join(roots.appDataDir, 'scratch')
    await fs.mkdir(scratch, { recursive: true, mode: 0o700 })
    const initial = await manager.resolveInstalledProjectWorker(scratch)
    assert.notEqual(initial, null)
    const owner = new ProjectTargetInspectionOwner(async () => {
      const selected = await manager.resolveInstalledProjectWorker(scratch)
      return selected
        ? {
            ...selected,
            environment: { ...selected.environment, IGS_SDXL_CONFIG_DIR: installed.config },
          }
        : null
    })
    const originalStart = ProjectWorkerClient.start
    const actualKill = ChildProcess.prototype.kill
    const blocked = new Set()
    ProjectWorkerClient.start = async (location, options) =>
      originalStart.call(ProjectWorkerClient, location, { ...options, shutdownWaitMs: 25 })
    ChildProcess.prototype.kill = function (signal) {
      if (this.spawnargs.includes('imagegen_worker')) {
        blocked.add(this)
        return false
      }
      return actualKill.call(this, signal)
    }
    try {
      const completed = await owner.useWorker((worker) => composeCpuTarget(worker, scratch))
      assert.equal(completed.mode, 'txt2img')
      const [cpu] = blocked
      assert.ok(cpu)
      assert.equal(cpu.exitCode, null)
      assert.equal(cpu.signalCode, null)
      assert.equal(await manager.resolveInstalledProjectWorker(scratch), null)
      assert.equal(await manager.readQualifiedInferenceReady(), null)
      assert.equal(
        await manager.withGenerationAdmission(scratch, async () =>
          assert.fail('Unconfirmed image exit must fence admission'),
        ),
        null,
      )
      assert.equal(
        await manager.withGenerationPreparation(scratch, async () =>
          assert.fail('Unconfirmed image exit must fence preparation'),
        ),
        null,
      )
      assert.equal(
        await manager.withGenerationWorker(scratch, async () =>
          assert.fail('Unconfirmed image exit must fence CUDA'),
        ),
        null,
      )
      assert.equal(await manager.resolveQualifiedGenerationWorker(scratch), null)
      assert.equal((await manager.getStatus()).value.kind, 'needs-repair')
      assert.equal(await manager.retryUnconfirmedGenerationExit(), false)
      await assert.rejects(
        ProjectWorkerClient.start(initial.location, {
          environment: { ...initial.environment, IGS_SDXL_CONFIG_DIR: installed.config },
        }),
        { code: 'WORKER_EXIT_UNCONFIRMED' },
      )
      const inferenceAttempt = await GenerationWorkerClient.start(
        {
          pythonExecutable: installed.executable,
          runtimeRoot: roots.runtimeDir,
          scratchBasePath: scratch,
        },
        { environment: { ...initial.environment, IGS_SDXL_CONFIG_DIR: installed.config } },
      ).then(
        (client) => ({ client, error: null }),
        (error) => ({ client: null, error }),
      )
      // Close an incorrectly admitted peer before failing the observable launch-count invariant.
      await inferenceAttempt.client?.close()
      assert.equal((await lines(path.join(roots.runtimeDir, 'cpu-launches'))).length, 1)
      assert.equal((await lines(path.join(roots.runtimeDir, 'launches'))).length, 0)
      assert.equal(inferenceAttempt.error?.code, 'WORKER_EXIT_UNCONFIRMED')
      const session = await ProjectSession.create(
        path.join(roots.appDataDir, 'fenced.igs'),
        'Before',
        { placeholdersDir: path.resolve('src/main/projects/placeholders'), scratchDir: scratch },
      )
      session.applyDocument({
        ...session.document,
        title: 'Saved with no worker during global exit fence',
      })
      const saved = await owner.useOptionalWorker(async (worker) => {
        assert.equal(worker, undefined)
        return await session.save()
      })
      assert.equal(saved.committed, true)
      assert.equal(
        (await readIgsPackage(session.filePath)).project.title,
        'Saved with no worker during global exit fence',
      )
      assert.equal((await lines(path.join(roots.runtimeDir, 'cpu-launches'))).length, 1)
      ChildProcess.prototype.kill = actualKill
      assert.equal(await manager.retryUnconfirmedGenerationExit(), true)
      assert.equal(cpu.exitCode !== null || cpu.signalCode !== null, true)
      assert.notEqual(await manager.resolveInstalledProjectWorker(scratch), null)
      assert.equal(await manager.withGenerationAdmission(scratch, async () => 'resumed'), 'resumed')
      await owner.shutdown()
    } finally {
      ChildProcess.prototype.kill = actualKill
      ProjectWorkerClient.start = originalStart
      for (const child of blocked) {
        if (child.exitCode === null && child.signalCode === null) actualKill.call(child, 'SIGKILL')
      }
      await owner.shutdown()
      await manager.retryUnconfirmedGenerationExit()
    }
  },
)

test(
  'running CPU preparation cannot mask an established Main image exit fence in advisory readiness',
  { timeout: 10_000 },
  async () => {
    const { roots, manager } = await fixture()
    const installed = await installFakeInferenceRuntime(roots)
    await installCpuTarget(roots)
    await fs.writeFile(path.join(installed.environment, 'cpu-mode'), 'close-keepalive')
    const scratch = path.join(roots.appDataDir, 'scratch')
    await fs.mkdir(scratch, { recursive: true, mode: 0o700 })
    const selected = await manager.resolveInstalledProjectWorker(scratch)
    assert.notEqual(selected, null)
    const owner = new ProjectTargetInspectionOwner(async () => ({
      ...selected,
      environment: {
        ...selected.environment,
        IGS_SDXL_CONFIG_DIR: installed.config,
        MAIN_IMAGE_CONTROL: '1',
      },
    }))
    const originalStart = ProjectWorkerClient.start
    const actualKill = ChildProcess.prototype.kill
    const blocked = new Set()
    ProjectWorkerClient.start = async (location, options) => {
      const client = await originalStart.call(ProjectWorkerClient, location, {
        ...options,
        shutdownWaitMs: 25,
      })
      if (options.environment.MAIN_IMAGE_CONTROL === '1') blocked.add(client.child)
      return client
    }
    ChildProcess.prototype.kill = function (signal) {
      return blocked.has(this) ? false : actualKill.call(this, signal)
    }
    const gpuEntered = deferred(),
      gpuFinish = deferred(),
      cpuEntered = deferred(),
      cpuFinish = deferred()
    const generation = manager.withGenerationWorker(scratch, async () => {
      gpuEntered.resolve()
      await gpuFinish.promise
    })
    let preparation
    try {
      await gpuEntered.promise
      preparation = manager.withGenerationPreparation(scratch, async ({ targetWorker }) => {
        await composeCpuTarget(targetWorker, scratch)
        cpuEntered.resolve()
        await cpuFinish.promise
      })
      await cpuEntered.promise
      assert.equal((await manager.getStatus()).value.kind, 'ready')
      assert.equal(
        (await owner.useWorker((worker) => composeCpuTarget(worker, scratch))).mode,
        'txt2img',
      )
      const [mainChild] = blocked
      assert.equal(mainChild.exitCode, null)
      assert.equal(mainChild.signalCode, null)
      assert.equal((await manager.getStatus()).value.kind, 'needs-repair')
      assert.equal(await manager.resolveInstalledProjectWorker(scratch), null)
      assert.equal(await manager.readQualifiedInferenceReady(), null)
      assert.equal((await lines(path.join(roots.runtimeDir, 'cpu-launches'))).length, 2)
      assert.equal((await lines(path.join(roots.runtimeDir, 'launches'))).length, 2)
      ChildProcess.prototype.kill = actualKill
      await owner.shutdown()
      assert.equal(mainChild.exitCode !== null || mainChild.signalCode !== null, true)
      assert.equal((await manager.getStatus()).value.kind, 'ready')
    } finally {
      ChildProcess.prototype.kill = actualKill
      ProjectWorkerClient.start = originalStart
      for (const child of blocked) {
        if (child.exitCode === null && child.signalCode === null) actualKill.call(child, 'SIGKILL')
      }
      await owner.shutdown()
      await manager.retryUnconfirmedGenerationExit()
      cpuFinish.resolve()
      await preparation
      gpuFinish.resolve()
      await generation
    }
  },
)

test('failed CPU startup remains owned and blocks new subprocesses until its physical exit is confirmed', async () => {
  const { roots, manager } = await fixture()
  const installed = await installFakeInferenceRuntime(roots)
  const scratch = path.join(roots.appDataDir, 'scratch')
  await fs.mkdir(scratch, { recursive: true, mode: 0o700 })
  await fs.writeFile(path.join(installed.environment, 'cpu-mode'), 'bad-version-keepalive')
  const start = ProjectWorkerClient.start
  const actualKill = ChildProcess.prototype.kill
  const blocked = new Set()
  ChildProcess.prototype.kill = function (signal) {
    if (this.spawnargs.includes('imagegen_worker')) {
      blocked.add(this)
      return true
    }
    return actualKill.call(this, signal)
  }
  ProjectWorkerClient.start = async (location, options) =>
    start.call(ProjectWorkerClient, location, { ...options, shutdownWaitMs: 25 })
  try {
    await manager.withGenerationWorker(scratch, async () => {
      await assert.rejects(
        manager.withGenerationPreparation(scratch, async () => 'not-qualified'),
        { code: 'WORKER_EXIT_UNCONFIRMED' },
      )
      assert.equal(ProjectWorkerClient.hasUnconfirmedStartExit(), true)
      assert.equal(await manager.resolveInstalledProjectWorker(scratch), null)
      await assert.rejects(
        ProjectWorkerClient.start({
          pythonExecutable: installed.executable,
          runtimeRoot: roots.runtimeDir,
          stagingBasePath: scratch,
        }),
        { code: 'WORKER_EXIT_UNCONFIRMED' },
      )
    })
    assert.equal(await manager.retryUnconfirmedGenerationExit(), false)
    assert.equal(await manager.withGenerationWorker(scratch, async () => 'unsafe'), null)
    assert.equal(await manager.withGenerationPreparation(scratch, async () => 'unsafe'), null)
    assert.equal((await manager.getStatus()).value.kind, 'needs-repair')
    assert.equal((await lines(path.join(roots.runtimeDir, 'cpu-launches'))).length, 1)
    ChildProcess.prototype.kill = actualKill
    assert.equal(await manager.retryUnconfirmedGenerationExit(), true)
    assert.equal(ProjectWorkerClient.hasUnconfirmedStartExit(), false)
    assert.notEqual(await manager.resolveInstalledProjectWorker(scratch), null)
    const [child] = blocked
    assert.equal(child.exitCode !== null || child.signalCode !== null, true)
  } finally {
    ChildProcess.prototype.kill = actualKill
    ProjectWorkerClient.start = start
    for (const child of blocked)
      if (child.exitCode === null && child.signalCode === null) actualKill.call(child, 'SIGKILL')
    await manager.retryUnconfirmedGenerationExit()
  }
})

test('CPU preparation cannot lend ready status after its GPU owner has an unconfirmed exit', async () => {
  // Boundary: live GPU+CPU ownership. Mutation: let the CPU status branch hide the GPU exit fence.
  const { roots, manager } = await fixture()
  await installFakeInferenceRuntime(roots)
  await installCpuTarget(roots)
  const scratch = path.join(roots.appDataDir, 'scratch')
  await fs.mkdir(scratch, { recursive: true, mode: 0o700 })
  const gpuEntered = deferred(),
    gpuFinish = deferred(),
    cpuEntered = deferred(),
    cpuFinish = deferred()
  let blocked = true
  let gpu
  const generation = manager.withGenerationWorker(scratch, async (worker) => {
    gpu = worker
    const close = worker.close.bind(worker)
    worker.close = async () => {
      if (blocked) throw new Error('GPU exit remains unconfirmed')
      await close()
    }
    gpuEntered.resolve()
    await gpuFinish.promise
  })
  const generationFailure = assert.rejects(generation, /GPU exit remains unconfirmed/)
  let preparation
  try {
    await gpuEntered.promise
    preparation = manager.withGenerationPreparation(scratch, async ({ targetWorker }) => {
      await composeCpuTarget(targetWorker, scratch)
      cpuEntered.resolve()
      await cpuFinish.promise
      return 'captured-before-GPU-exit-failure'
    })
    await cpuEntered.promise
    assert.equal((await manager.getStatus()).value.kind, 'ready')
    gpuFinish.resolve()
    await generationFailure
    assert.equal((await manager.getStatus()).value.kind, 'needs-repair')
    assert.equal(await manager.withGenerationWorker(scratch, async () => 'another GPU'), null)
    assert.equal(await manager.withGenerationPreparation(scratch, async () => 'another CPU'), null)
    assert.equal((await lines(path.join(roots.runtimeDir, 'launches'))).length, 2)
    cpuFinish.resolve()
    assert.equal(await preparation, 'captured-before-GPU-exit-failure')
    assert.equal((await manager.getStatus()).value.kind, 'needs-repair')
    blocked = false
    assert.equal(await manager.retryUnconfirmedGenerationExit(), true)
  } finally {
    blocked = false
    gpuFinish.resolve()
    cpuFinish.resolve()
    await Promise.allSettled([generation, generationFailure, preparation].filter(Boolean))
    await manager.retryUnconfirmedGenerationExit()
    await gpu?.close()
  }
})

test(
  'qualified normal close stays advisory-ready without another CUDA probe for callback and runtime-finally owners',
  { timeout: 10_000 },
  async (t) => {
    // Real installed-location resolver and JSONL child. Only close completion is held;
    // the actual close runs first, so ready really throws CLOSED during the barrier.
    for (const initiator of ['callback', 'runtime-finally']) {
      await t.test(initiator, async () => {
        const { roots, manager } = await fixture()
        const installed = await installFakeInferenceRuntime(roots)
        await fs.writeFile(path.join(installed.environment, 'mode'), 'smart-ready')
        const scratch = path.join(roots.appDataDir, 'scratch')
        await fs.mkdir(scratch, { recursive: true, mode: 0o700 })
        const closeEntered = deferred()
        const closeRelease = deferred()
        let client
        let settled = false
        const generation = manager.withGenerationWorker(scratch, async (worker) => {
          client = worker
          const close = worker.close.bind(worker)
          worker.close = async () => {
            const closing = close()
            void closing.catch(() => undefined)
            closeEntered.resolve()
            await closeRelease.promise
            await closing
          }
          if (initiator === 'callback') await worker.close()
          return 'completed'
        })
        const outcome = generation.then(
          (value) => {
            settled = true
            return { value }
          },
          (error) => {
            settled = true
            return { error }
          },
        )
        try {
          await closeEntered.promise
          assert.throws(() => client.ready, { code: 'CLOSED' })
          assert.equal(settled, false, 'Close completion still belongs to the active lease.')
          const status = await manager.getStatus()
          assert.equal(status.value.kind, 'ready')
          assert.match(status.value.detail, /separate status probe is deferred/)
          assert.equal((await lines(path.join(roots.runtimeDir, 'launches'))).length, 2)
          assert.equal(await manager.readQualifiedInferenceReady(), null)
          assert.equal(
            await manager.withGenerationAdmission(scratch, async () =>
              assert.fail('A closing child cannot lend metadata or accept new work.'),
            ),
            null,
          )
          assert.equal(await manager.resolveInstalledProjectWorker(scratch), null)
          await fs.writeFile(path.join(installed.config, 'model_index.json'), 'changed')
          assert.equal((await manager.getStatus()).value.kind, 'needs-repair')
          await fs.writeFile(path.join(installed.config, 'model_index.json'), 'pinned')
          assert.equal((await manager.getStatus()).value.kind, 'ready')
          assert.equal((await lines(path.join(roots.runtimeDir, 'launches'))).length, 2)
        } finally {
          closeRelease.resolve()
          const finished = await outcome
          assert.equal(finished.error, undefined)
          assert.equal(finished.value, 'completed')
          assert.equal((await lines(path.join(roots.runtimeDir, 'exits'))).length, 2)
        }
      })
    }
  },
)

test(
  'unexpected worker exit cannot borrow normal-close advisory readiness',
  { timeout: 10_000 },
  async () => {
    const { roots, manager } = await fixture()
    await installFakeInferenceRuntime(roots)
    const scratch = path.join(roots.appDataDir, 'scratch')
    await fs.mkdir(scratch, { recursive: true, mode: 0o700 })
    const value = await manager.withGenerationWorker(scratch, async (worker) => {
      const child = worker.child
      const exited = new Promise((resolve) => child.once('exit', resolve))
      child.kill('SIGKILL')
      await exited
      assert.throws(() => worker.ready, { code: 'CLOSED' })
      await worker.close()
      assert.equal((await manager.getStatus()).value.kind, 'needs-repair')
      assert.equal(await manager.readQualifiedInferenceReady(), null)
      assert.equal(
        await manager.withGenerationAdmission(scratch, async () =>
          assert.fail('A failed child cannot lend readiness.'),
        ),
        null,
      )
      assert.equal((await lines(path.join(roots.runtimeDir, 'launches'))).length, 2)
      assert.equal(child.exitCode !== null || child.signalCode !== null, true)
      return 'observed-unexpected-exit'
    })
    assert.equal(value, 'observed-unexpected-exit')
  },
)

test(
  'rejected normal close becomes unavailable immediately and retains the exit fence until explicit retry',
  { timeout: 10_000 },
  async () => {
    // Actual close rejects after its bounded SIGTERM/SIGKILL waits. The fixture child's
    // open stdin and intercepted own kill method keep that exact child physically alive.
    const { roots, manager } = await fixture()
    await installFakeInferenceRuntime(roots)
    const scratch = path.join(roots.appDataDir, 'scratch')
    await fs.mkdir(scratch, { recursive: true, mode: 0o700 })
    let client
    let child
    let kill
    let end
    try {
      await assert.rejects(
        manager.withGenerationWorker(scratch, async (worker) => {
          client = worker
          child = worker.child
          kill = child.kill
          end = child.stdin.end
          child.kill = () => false
          child.stdin.end = () => child.stdin
          worker.shutdownWaitMs = 25
          await assert.rejects(worker.close(), { code: 'WORKER_EXIT_UNCONFIRMED' })
          assert.equal(child.exitCode, null)
          assert.equal(child.signalCode, null)
          assert.equal((await manager.getStatus()).value.kind, 'needs-repair')
          assert.equal(await manager.readQualifiedInferenceReady(), null)
          assert.equal(
            await manager.withGenerationAdmission(scratch, async () =>
              assert.fail('Rejected normal close must immediately revoke advisory readiness.'),
            ),
            null,
          )
          return 'callback-ended-with-unconfirmed-child'
        }),
        { code: 'WORKER_EXIT_UNCONFIRMED' },
      )
      assert.equal((await manager.getStatus()).value.kind, 'needs-repair')
      assert.equal(await manager.retryUnconfirmedGenerationExit(), false)
      assert.equal(await manager.withGenerationWorker(scratch, async () => 'unsafe'), null)
      assert.equal((await lines(path.join(roots.runtimeDir, 'launches'))).length, 2)
      child.kill = kill
      child.stdin.end = end
      assert.equal(await manager.retryUnconfirmedGenerationExit(), true)
      assert.equal(child.exitCode !== null || child.signalCode !== null, true)
      assert.equal((await lines(path.join(roots.runtimeDir, 'launches'))).length, 2)
    } finally {
      if (child) {
        child.kill = kill
        child.stdin.end = end
      }
      await manager.retryUnconfirmedGenerationExit()
      await client?.close()
      if (child) assert.equal(child.exitCode !== null || child.signalCode !== null, true)
    }
  },
)
