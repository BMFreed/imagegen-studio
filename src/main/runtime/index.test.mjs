import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, test } from 'node:test'

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
