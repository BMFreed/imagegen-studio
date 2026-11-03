import assert from 'node:assert/strict'
import nativeFs from 'node:fs'
import fs, { lstat, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { ensureAppPaths, resolveAppPaths } from '../app-paths.js'
import { prepareRegionalWorkerRequest } from './regional-worker-request.js'
import { createRegionalQueueFixture } from './test-fixtures/regional-queue.js'

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-app-scratch-'))
  const paths = resolveAppPaths({ XDG_DATA_HOME: root })
  await mkdir(paths.dataRoot, { mode: 0o700 })
  return {
    close: () => rm(root, { force: true, recursive: true }),
    paths,
    root,
    scratch: path.join(paths.dataRoot, 'scratch'),
  }
}

test('normal app startup creates private scratch under a group-writable umask', async () => {
  const f = await fixture()
  const previous = process.umask(0o002)
  try {
    ensureAppPaths(f.paths)
    assert.equal((await stat(f.scratch)).mode & 0o777, 0o700)
    assert.ok((await stat(f.paths.databaseRoot)).isDirectory())
    ensureAppPaths(f.paths)
    assert.equal((await stat(f.scratch)).mode & 0o777, 0o700)
  } finally {
    process.umask(previous)
    await f.close()
  }
})

test('startup repairs its existing owned scratch without replacing its directory or files', async () => {
  const f = await fixture()
  try {
    await mkdir(f.scratch)
    await fs.chmod(f.scratch, 0o775)
    const sentinel = path.join(f.scratch, 'existing-owned-payload')
    await writeFile(sentinel, 'keep exact pending bytes')
    const before = await stat(f.scratch)
    ensureAppPaths(f.paths)
    const after = await stat(f.scratch)
    assert.equal(after.ino, before.ino)
    assert.equal(after.dev, before.dev)
    assert.equal(after.mode & 0o777, 0o700)
    assert.equal(await readFile(sentinel, 'utf8'), 'keep exact pending bytes')
  } finally {
    await f.close()
  }
})

for (const kind of ['symlink', 'file']) {
  test(`startup refuses ${kind} scratch without changing the neighboring target`, async () => {
    const f = await fixture()
    try {
      const target = path.join(f.root, 'neighbor')
      await mkdir(target)
      await fs.chmod(target, 0o775)
      await (kind === 'symlink'
        ? symlink(target, f.scratch)
        : writeFile(f.scratch, 'not a directory'))
      assert.throws(() => ensureAppPaths(f.paths), /scratch|directory|ENOTDIR|ELOOP/i)
      assert.equal((await stat(target)).mode & 0o777, 0o775)
      if (kind === 'symlink') {
        assert.ok((await lstat(f.scratch)).isSymbolicLink())
      } else {
        assert.equal(await readFile(f.scratch, 'utf8'), 'not a directory')
      }
    } finally {
      await f.close()
    }
  })
}

test('startup private scratch reaches the unchanged regional transport guard', async () => {
  const f = await createRegionalQueueFixture()
  const paths = resolveAppPaths({ XDG_DATA_HOME: path.join(f.root, 'app') })
  const scratch = path.join(paths.dataRoot, 'scratch')
  try {
    await mkdir(scratch, { recursive: true })
    await fs.chmod(scratch, 0o775)
    const input = {
      ...f.regional,
      compositionProfile: 'invoke-canvas-v1' as const,
      request: f.request,
    }
    await assert.rejects(prepareRegionalWorkerRequest(input, scratch), { code: 'INVALID_PATH' })
    ensureAppPaths(paths)
    const lease = await prepareRegionalWorkerRequest(input, scratch)
    assert.equal(lease.wire.type, 'execute-current-canvas-regional')
    await lease.dispose()
    assert.equal((await stat(scratch)).mode & 0o777, 0o700)
  } finally {
    await f.close()
  }
})

test('scratch replacement during permission repair cannot authorize the replacement directory', async () => {
  const f = await fixture()
  const original = nativeFs.fchmodSync
  let replaced = false
  try {
    await mkdir(f.scratch)
    await fs.chmod(f.scratch, 0o775)
    const before = await stat(f.scratch)
    nativeFs.fchmodSync = (descriptor, mode) => {
      if (!replaced && nativeFs.fstatSync(descriptor).ino === before.ino) {
        replaced = true
        nativeFs.renameSync(f.scratch, path.join(f.paths.dataRoot, 'displaced-scratch'))
        nativeFs.mkdirSync(f.scratch)
        nativeFs.chmodSync(f.scratch, 0o775)
      }
      original(descriptor, mode)
    }
    syncBuiltinESMExports()
    assert.throws(() => ensureAppPaths(f.paths), /Invalid application scratch directory/)
    assert.equal(replaced, true)
    assert.equal((await stat(f.scratch)).mode & 0o777, 0o775)
    assert.notEqual((await stat(f.scratch)).ino, before.ino)
  } finally {
    nativeFs.fchmodSync = original
    syncBuiltinESMExports()
    await f.close()
  }
})
