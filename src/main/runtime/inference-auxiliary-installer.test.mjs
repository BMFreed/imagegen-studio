import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import filesystemPromises from 'node:fs/promises'
import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  readlink,
  realpath,
  rename,
  rm,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { promisify } from 'node:util'

import {
  AuxiliaryArtifactInstaller,
  createLamaAuxiliaryInstaller,
} from './inference-auxiliary-installer.ts'
import { verifyInferenceAuxiliaryFile } from './inference-auxiliary-resources.ts'
import { LAMA_OUTPAINT_ARTIFACT } from './lama-manifest.ts'

const bytes = Buffer.from('synthetic owner fixture, not trained LaMa weights')
const hash = (value) => createHash('sha256').update(value).digest('hex')

/** The HTTP producer is substituted; installer, filesystem and exact-byte verifier stay real. */
async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'igs-auxiliary-install-'))
  const resources = path.join(root, 'inference-resources')
  await mkdir(resources, { mode: 0o700 })
  for (const name of ['models', 'projects', 'cache', 'runtime']) {
    await mkdir(path.join(root, name))
    await writeFile(path.join(root, name, 'keep.txt'), name)
  }
  const manifest = {
    filename: 'big-lama.pt',
    role: 'outpaint-infill',
    sha256: hash(bytes),
    sizeBytes: bytes.length,
    source: 'invoke-lama',
    url: LAMA_OUTPAINT_ARTIFACT.url,
  }
  const calls = []
  const downloader = {
    async download(input) {
      calls.push(input)
      return await stage(input, bytes)
    },
  }
  const installer = new AuxiliaryArtifactInstaller({
    downloader,
    manifest,
    resourcesDirectory: resources,
  })
  return {
    calls,
    downloader,
    installer,
    manifest,
    resources,
    root,
    target: path.join(resources, manifest.filename),
    async cleanup() {
      await rm(root, { force: true, recursive: true })
    },
    async assertNeighbors() {
      for (const name of ['models', 'projects', 'cache', 'runtime']) {
        assert.equal(await readFile(path.join(root, name, 'keep.txt'), 'utf8'), name)
      }
    },
  }
}

async function stage(input, actual, reported = {}) {
  const stagingPath = path.join(input.stagingDirectory, `${randomUUID()}.part`)
  await writeFile(stagingPath, actual, { flag: 'wx', mode: 0o600 })
  input.onProgress?.({ downloadedBytes: actual.length, totalBytes: input.expectedBytes })
  return { sha256: hash(actual), sizeBytes: actual.length, stagingPath, ...reported }
}

test('auxiliary owner publishes independently verified bytes and reuses exact installed bytes without HTTP', async () => {
  const f = await fixture()
  try {
    const preview = await f.installer.preview()
    assert.equal(preview.scope, 'auxiliary-weights')
    assert.equal(preview.installed, false)
    assert.equal(preview.requiredDownloadBytes, bytes.length)
    assert.deepEqual(preview.artifact, {
      filename: 'big-lama.pt',
      role: 'outpaint-infill',
      sha256: hash(bytes),
      sizeBytes: bytes.length,
    })
    assert.equal(Object.isFrozen(preview), true)
    assert.equal(Object.isFrozen(preview.artifact), true)
    const progress = []
    const installed = await f.installer.install(preview.planId, {
      onProgress: (value) => progress.push(value),
    })
    assert.deepEqual(installed, {
      byteSize: bytes.length,
      managedPath: f.target,
      reused: false,
      role: 'outpaint-infill',
      sha256: hash(bytes),
    })
    assert.ok((await readFile(f.target)).equals(bytes))
    await verifyInferenceAuxiliaryFile({
      byteSize: bytes.length,
      managedPath: f.target,
      sha256: hash(bytes),
    })
    assert.equal(f.calls.length, 1)
    assert.equal(f.calls[0].source, 'invoke-lama')
    assert.equal(f.calls[0].url, LAMA_OUTPAINT_ARTIFACT.url)
    assert.equal(f.calls[0].expectedBytes, bytes.length)
    assert.equal(f.calls[0].expectedSha256, hash(bytes))
    assert.equal(f.calls[0].bearerToken, undefined)
    assert.equal(progress.at(-1).downloadedBytes, bytes.length)
    assert.deepEqual(await readdir(f.resources), ['big-lama.pt'])
    const again = await f.installer.preview()
    assert.equal(again.installed, true)
    assert.equal(again.requiredDownloadBytes, 0)
    assert.equal((await f.installer.install(again.planId)).reused, true)
    assert.equal(f.calls.length, 1)
    await f.assertNeighbors()
  } finally {
    await f.cleanup()
  }
})

test('opaque plans refuse forged, expired, repeated and foreign ids before any storage or download effect', async () => {
  const f = await fixture()
  try {
    let now = 10
    const owner = new AuxiliaryArtifactInstaller({
      clock: () => now,
      downloader: f.downloader,
      manifest: f.manifest,
      planTtlMs: 20,
      resourcesDirectory: f.resources,
    })
    const expired = await owner.preview()
    now = 30
    await assert.rejects(owner.install(expired.planId), { code: 'AUXILIARY_INVALID_PLAN' })
    await assert.rejects(owner.install('forged'), { code: 'AUXILIARY_INVALID_PLAN' })
    const foreign = await f.installer.preview()
    await assert.rejects(owner.install(foreign.planId), { code: 'AUXILIARY_INVALID_PLAN' })
    assert.deepEqual(await readdir(f.resources), [])
    assert.equal(f.calls.length, 0)
    const valid = await owner.preview()
    await owner.install(valid.planId)
    await assert.rejects(owner.install(valid.planId), { code: 'AUXILIARY_INVALID_PLAN' })
    assert.equal(f.calls.length, 1)
    await f.assertNeighbors()
  } finally {
    await f.cleanup()
  }
})

test('installer captures trusted manifest and rechecks actual installed bytes after preview', async () => {
  const f = await fixture()
  try {
    await writeFile(f.target, bytes)
    const preview = await f.installer.preview()
    assert.equal(preview.installed, true)
    f.manifest.filename = 'evil.pt'
    f.manifest.sha256 = '0'.repeat(64)
    f.manifest.sizeBytes = 1
    f.manifest.url = 'https://evil.example/weights'
    await writeFile(f.target, Buffer.alloc(bytes.length, 11))
    await assert.rejects(f.installer.install(preview.planId), { code: 'AUXILIARY_PLAN_CHANGED' })
    assert.equal(f.calls.length, 0)
    const repair = await f.installer.preview()
    assert.equal(repair.requiredDownloadBytes, bytes.length)
    assert.equal((await f.installer.install(repair.planId)).reused, false)
    assert.equal(f.calls.length, 1)
    assert.equal(f.calls[0].expectedSha256, hash(bytes))
    assert.equal(f.calls[0].expectedBytes, bytes.length)
    assert.equal(f.calls[0].url, LAMA_OUTPAINT_ARTIFACT.url)
    assert.ok((await readFile(f.target)).equals(bytes))
    assert.deepEqual(await readdir(f.resources), ['big-lama.pt'])
    await f.assertNeighbors()
  } finally {
    await f.cleanup()
  }
})

test('concurrent previews cannot exceed the bounded private plan store', async () => {
  const f = await fixture()
  try {
    const previews = await Promise.allSettled(
      Array.from({ length: 40 }, async () => await f.installer.preview()),
    )
    assert.equal(previews.filter((value) => value.status === 'fulfilled').length, 32)
    const failures = previews.filter((value) => value.status === 'rejected')
    assert.equal(failures.length, 8)
    assert.ok(failures.every((value) => value.reason.code === 'AUXILIARY_PLAN_LIMIT'))
    assert.deepEqual(await readdir(f.resources), [])
    assert.equal(f.calls.length, 0)
  } finally {
    await f.cleanup()
  }
})

test('invalid Main clock and expiry overflow cannot create an immortal installation plan', async (t) => {
  for (const now of [
    NaN,
    Infinity,
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
    Number.MAX_SAFE_INTEGER,
  ]) {
    await t.test(String(now), async () => {
      const f = await fixture()
      try {
        const owner = new AuxiliaryArtifactInstaller({
          clock: () => now,
          downloader: f.downloader,
          manifest: f.manifest,
          planTtlMs: 1,
          resourcesDirectory: f.resources,
        })
        await assert.rejects(owner.preview(), { code: 'AUXILIARY_INVALID_CLOCK' })
        assert.deepEqual(await readdir(f.resources), [])
        assert.equal(f.calls.length, 0)
      } finally {
        await f.cleanup()
      }
    })
  }
})

test('missing installed resource after a reuse preview requires a fresh download-volume preview', async () => {
  const f = await fixture()
  try {
    await writeFile(f.target, bytes)
    const preview = await f.installer.preview()
    await rm(f.target)
    await assert.rejects(f.installer.install(preview.planId), { code: 'AUXILIARY_PLAN_CHANGED' })
    assert.equal(f.calls.length, 0)
    const repair = await f.installer.preview()
    assert.equal(repair.requiredDownloadBytes, bytes.length)
    assert.equal((await f.installer.install(repair.planId)).reused, false)
    assert.equal(f.calls.length, 1)
    assert.ok((await readFile(f.target)).equals(bytes))
  } finally {
    await f.cleanup()
  }
})

test('an artifact installed after preview reduces the download budget and is reused without HTTP', async () => {
  const f = await fixture()
  try {
    const plan = await f.installer.preview()
    assert.equal(plan.requiredDownloadBytes, bytes.length)
    await writeFile(f.target, bytes)
    assert.equal((await f.installer.install(plan.planId)).reused, true)
    assert.equal(f.calls.length, 0)
    assert.ok((await readFile(f.target)).equals(bytes))
  } finally {
    await f.cleanup()
  }
})

test('replacement of the reviewed root before install refuses the old plan without side effects', async () => {
  const f = await fixture()
  try {
    const plan = await f.installer.preview()
    const previous = path.join(f.root, 'reviewed-root-moved')
    await rename(f.resources, previous)
    await mkdir(f.resources, { mode: 0o700 })
    await writeFile(path.join(f.resources, 'keep.txt'), 'new root')
    await assert.rejects(f.installer.install(plan.planId), { code: 'AUXILIARY_PLAN_CHANGED' })
    assert.equal(f.calls.length, 0)
    assert.deepEqual(await readdir(previous), [])
    assert.deepEqual(await readdir(f.resources), ['keep.txt'])
    assert.equal(await readFile(path.join(f.resources, 'keep.txt'), 'utf8'), 'new root')
  } finally {
    await f.cleanup()
  }
})

test('independent verification refuses dishonest downloaded metadata and preserves existing bytes', async (t) => {
  for (const kind of [
    'wrong hash',
    'short',
    'oversized',
    'missing file',
    'foreign path',
    'symlink',
    'FIFO',
  ]) {
    await t.test(kind, async () => {
      const f = await fixture()
      const previous = Buffer.from('previous working auxiliary artifact')
      try {
        await writeFile(f.target, previous)
        const neighbor = path.join(f.root, 'neighbor.pt')
        await writeFile(neighbor, 'neighbor')
        f.downloader.download = async (input) => {
          f.calls.push(input)
          if (kind === 'foreign path') {
            return { sha256: hash(bytes), sizeBytes: bytes.length, stagingPath: neighbor }
          }
          const actual =
            kind === 'short'
              ? bytes.subarray(1)
              : kind === 'oversized'
                ? Buffer.concat([bytes, Buffer.from('extra')])
                : Buffer.alloc(bytes.length, 7)
          if (['symlink', 'FIFO', 'missing file'].includes(kind)) {
            const stagingPath = path.join(input.stagingDirectory, `${randomUUID()}.part`)
            if (kind === 'symlink') await symlink(neighbor, stagingPath)
            if (kind === 'FIFO') {
              const actualDirectory = await realpath(input.stagingDirectory)
              await promisify(execFile)('mkfifo', [
                path.join(actualDirectory, path.basename(stagingPath)),
              ])
            }
            return { sha256: hash(bytes), sizeBytes: bytes.length, stagingPath }
          }
          return await stage(input, actual, { sha256: hash(bytes), sizeBytes: bytes.length })
        }
        const plan = await f.installer.preview()
        await assert.rejects(f.installer.install(plan.planId), (error) =>
          ['GENERATION_RESOURCE_CHANGED', 'AUXILIARY_INVALID_DOWNLOAD'].includes(error.code),
        )
        // A publication-order mutation may put a FIFO at the destination. Assert its
        // regular-file kind before reading so failure diagnostics cannot block on a pipe.
        assert.ok((await lstat(f.target)).isFile(), 'Prior destination must remain a regular file')
        assert.ok((await readFile(f.target)).equals(previous))
        assert.equal(await readFile(neighbor, 'utf8'), 'neighbor')
        assert.deepEqual(await readdir(f.resources), ['big-lama.pt'])
        await f.assertNeighbors()
      } finally {
        await f.cleanup()
      }
    })
  }
})

test('cancellation, download and publication-copy failures preserve prior artifact and permit a new attempt', async (t) => {
  for (const kind of [
    'pre-canceled',
    'mid-download cancellation',
    'download error',
    'copy failure',
  ]) {
    await t.test(kind, async () => {
      const f = await fixture()
      const previous = Buffer.from('previous working resource')
      const controller = new AbortController()
      try {
        await writeFile(f.target, previous)
        const plan = await f.installer.preview()
        const normalDownload = f.downloader.download
        if (kind === 'pre-canceled') controller.abort()
        if (kind === 'mid-download cancellation') {
          f.downloader.download = async (input) => {
            const result = await normalDownload(input)
            controller.abort()
            return result
          }
        }
        if (kind === 'download error') {
          f.downloader.download = async () => {
            throw Object.assign(new Error('network'), { code: 'DOWNLOAD_FAILED' })
          }
        }
        const use = async () =>
          await assert.rejects(f.installer.install(plan.planId, { signal: controller.signal }))
        if (kind === 'copy failure') await withFailedPublicationWrite(use)
        else await use()
        assert.ok((await readFile(f.target)).equals(previous))
        assert.deepEqual(await readdir(f.resources), ['big-lama.pt'])
        f.downloader.download = normalDownload
        const retry = await f.installer.preview()
        assert.equal((await f.installer.install(retry.planId)).reused, false)
        assert.ok((await readFile(f.target)).equals(bytes))
        await f.assertNeighbors()
      } finally {
        await f.cleanup()
      }
    })
  }
})

test('two installer instances reserve the same canonical root before download and release it after failure', async () => {
  const f = await fixture()
  let release
  let active
  try {
    let entered
    let downloadCalls = 0
    const started = new Promise((resolve) => {
      entered = resolve
    })
    const blocked = new Promise((resolve) => {
      release = resolve
    })
    const normalDownload = f.downloader.download
    f.downloader.download = async (input) => {
      downloadCalls += 1
      if (downloadCalls > 1) {
        throw Object.assign(new Error('unexpected concurrent downloader entry'), {
          code: 'DOWNLOAD_FAILED',
        })
      }
      entered()
      await blocked
      throw Object.assign(new Error('controlled failure'), { code: 'DOWNLOAD_FAILED' })
    }
    const other = new AuxiliaryArtifactInstaller({
      downloader: f.downloader,
      manifest: f.manifest,
      resourcesDirectory: f.resources,
    })
    const one = await f.installer.preview()
    const two = await other.preview()
    active = f.installer.install(one.planId)
    await started
    await assert.rejects(other.install(two.planId), { code: 'AUXILIARY_INSTALL_BUSY' })
    assert.equal(downloadCalls, 1)
    release()
    await assert.rejects(active, { code: 'DOWNLOAD_FAILED' })
    assert.deepEqual(await readdir(f.resources), [])
    f.downloader.download = normalDownload
    const fresh = await other.preview()
    assert.equal((await other.install(fresh.planId)).reused, false)
    assert.ok((await readFile(f.target)).equals(bytes))
  } finally {
    release?.()
    await active?.catch(() => undefined)
    await f.cleanup()
  }
})

test('cancellation observed after atomic publication reports the committed verified result', async () => {
  const f = await fixture()
  const controller = new AbortController()
  try {
    const plan = await f.installer.preview()
    const file = await open(import.meta.filename, 'r')
    const prototype = Object.getPrototypeOf(file)
    const original = prototype.sync
    await file.close()
    let observed = false
    prototype.sync = async function (...args) {
      const result = await Reflect.apply(original, this, args)
      if ((await readlink(`/proc/self/fd/${this.fd}`).catch(() => '')) === f.resources) {
        assert.ok((await readFile(f.target)).equals(bytes))
        observed = true
        controller.abort()
      }
      return result
    }
    try {
      const result = await f.installer.install(plan.planId, { signal: controller.signal })
      assert.equal(observed, true)
      assert.equal(controller.signal.aborted, true)
      assert.equal(result.reused, false)
      await verifyInferenceAuxiliaryFile({
        byteSize: bytes.length,
        managedPath: result.managedPath,
        sha256: result.sha256,
      })
      assert.deepEqual(await readdir(f.resources), ['big-lama.pt'])
    } finally {
      prototype.sync = original
    }
  } finally {
    await f.cleanup()
  }
})

test('abandoned private work is never installed, resumed or removed and does not block a new Main owner', async () => {
  const f = await fixture()
  try {
    const abandonedName = `.outpaint-infill-${randomUUID()}`
    const abandoned = path.join(f.resources, abandonedName)
    await mkdir(abandoned, { mode: 0o700 })
    await writeFile(path.join(abandoned, 'publication.ready'), bytes)
    const fresh = new AuxiliaryArtifactInstaller({
      downloader: f.downloader,
      manifest: f.manifest,
      resourcesDirectory: f.resources,
    })
    const plan = await fresh.preview()
    assert.equal(plan.installed, false)
    assert.equal((await fresh.install(plan.planId)).reused, false)
    assert.equal(f.calls.length, 1)
    assert.ok((await readFile(path.join(abandoned, 'publication.ready'))).equals(bytes))
    assert.ok((await readFile(f.target)).equals(bytes))
    assert.deepEqual((await readdir(f.resources)).sort(), [abandonedName, 'big-lama.pt'].sort())
  } finally {
    await f.cleanup()
  }
})

test('linked and nonregular destinations are refused without touching the link target', async (t) => {
  for (const kind of ['symlink', 'FIFO', 'directory']) {
    await t.test(kind, async () => {
      const f = await fixture()
      try {
        const neighbor = path.join(f.root, 'neighbor.pt')
        await writeFile(neighbor, bytes)
        if (kind === 'symlink') await symlink(neighbor, f.target)
        if (kind === 'FIFO') await promisify(execFile)('mkfifo', [f.target])
        if (kind === 'directory') await mkdir(f.target)
        const plan = await f.installer.preview()
        assert.equal(plan.installed, false)
        await assert.rejects(f.installer.install(plan.planId), {
          code: 'AUXILIARY_INVALID_STORAGE',
        })
        assert.ok((await readFile(neighbor)).equals(bytes))
        assert.equal(f.calls.length, 0)
        await f.assertNeighbors()
      } finally {
        await f.cleanup()
      }
    })
  }
})

test('root replacement during download cannot redirect publication or cleanup into replacement storage', async () => {
  const f = await fixture()
  const displaced = path.join(f.root, 'owned-resources-moved')
  const previous = Buffer.from('old working weights')
  try {
    await writeFile(f.target, previous)
    const normal = f.downloader.download
    f.downloader.download = async (input) => {
      await rename(f.resources, displaced)
      await mkdir(f.resources, { mode: 0o700 })
      await writeFile(path.join(f.resources, 'keep.txt'), 'replacement root')
      return await normal(input)
    }
    const plan = await f.installer.preview()
    await assert.rejects(f.installer.install(plan.planId), { code: 'AUXILIARY_INVALID_STORAGE' })
    assert.deepEqual(await readdir(f.resources), ['keep.txt'])
    assert.equal(await readFile(path.join(f.resources, 'keep.txt'), 'utf8'), 'replacement root')
    assert.ok((await readFile(path.join(displaced, 'big-lama.pt'))).equals(previous))
    assert.deepEqual(await readdir(displaced), ['big-lama.pt'])
    await f.assertNeighbors()
  } finally {
    await f.cleanup()
  }
})

test('root replacement during work acquisition cannot make cleanup own a foreign work directory', async () => {
  const f = await fixture()
  const displaced = path.join(f.root, 'original-resources-moved')
  const previous = Buffer.from('previous working auxiliary bytes')
  const original = filesystemPromises.lstat
  let observed = false
  let foreignWork
  let foreignPart
  try {
    await writeFile(f.target, previous)
    filesystemPromises.lstat = async function (...args) {
      const result = await Reflect.apply(original, this, args)
      if (
        !observed &&
        typeof args[0] === 'string' &&
        /^\/proc\/self\/fd\/\d+\/\.outpaint-infill-[a-f0-9-]{36}$/.test(args[0])
      ) {
        // The created inode was read through the original root FD. Replace the visible root
        // before the candidate work directory is opened by its visible pathname.
        observed = true
        const name = path.basename(args[0])
        await rename(f.resources, displaced)
        await mkdir(f.resources, { mode: 0o700 })
        foreignWork = path.join(f.resources, name)
        await mkdir(foreignWork, { mode: 0o700 })
        await writeFile(path.join(foreignWork, 'publication.ready'), 'foreign publication')
        foreignPart = path.join(foreignWork, `${randomUUID()}.part`)
        await writeFile(foreignPart, 'foreign partial')
      }
      return result
    }
    syncBuiltinESMExports()
    const plan = await f.installer.preview()
    await assert.rejects(f.installer.install(plan.planId), { code: 'AUXILIARY_INVALID_STORAGE' })
    assert.equal(observed, true)
    assert.equal(f.calls.length, 0)
    await assert.doesNotReject(async () => {
      assert.equal(
        await readFile(path.join(foreignWork, 'publication.ready'), 'utf8'),
        'foreign publication',
      )
    })
    await assert.doesNotReject(async () => {
      assert.equal(await readFile(foreignPart, 'utf8'), 'foreign partial')
    })
    assert.ok((await readFile(path.join(displaced, 'big-lama.pt'))).equals(previous))
    await f.assertNeighbors()
  } finally {
    filesystemPromises.lstat = original
    syncBuiltinESMExports()
    await f.cleanup()
  }
})

test('failure synchronizing an atomically replaced artifact restores prior bytes and permits retry', async () => {
  const f = await fixture()
  const previous = Buffer.from('old working resource retained after fsync failure')
  const file = await open(import.meta.filename, 'r')
  const prototype = Object.getPrototypeOf(file)
  const original = prototype.sync
  await file.close()
  let failed = false
  try {
    await writeFile(f.target, previous)
    prototype.sync = async function (...args) {
      if (!failed && (await readlink(`/proc/self/fd/${this.fd}`).catch(() => '')) === f.resources) {
        assert.ok((await readFile(f.target)).equals(bytes))
        failed = true
        throw Object.assign(new Error('controlled final directory fsync failure'), { code: 'EIO' })
      }
      return await Reflect.apply(original, this, args)
    }
    const plan = await f.installer.preview()
    await assert.rejects(f.installer.install(plan.planId), { code: 'EIO' })
    assert.equal(failed, true)
    assert.ok((await readFile(f.target)).equals(previous))
    assert.deepEqual(await readdir(f.resources), ['big-lama.pt'])
    prototype.sync = original
    const retry = await f.installer.preview()
    assert.equal((await f.installer.install(retry.planId)).reused, false)
    assert.ok((await readFile(f.target)).equals(bytes))
    await f.assertNeighbors()
  } finally {
    prototype.sync = original
    await f.cleanup()
  }
})

test('final synchronization failure without a previous artifact removes the published inode and permits retry', async () => {
  const f = await fixture()
  const file = await open(import.meta.filename, 'r')
  const prototype = Object.getPrototypeOf(file)
  const original = prototype.sync
  await file.close()
  let failed = false
  try {
    prototype.sync = async function (...args) {
      if (!failed && (await readlink(`/proc/self/fd/${this.fd}`).catch(() => '')) === f.resources) {
        assert.ok((await readFile(f.target)).equals(bytes))
        failed = true
        throw Object.assign(new Error('controlled final fsync failure without previous artifact'), {
          code: 'EIO',
        })
      }
      return await Reflect.apply(original, this, args)
    }
    const plan = await f.installer.preview()
    await assert.rejects(f.installer.install(plan.planId), { code: 'EIO' })
    assert.equal(failed, true)
    await assert.rejects(lstat(f.target), { code: 'ENOENT' })
    assert.deepEqual(await readdir(f.resources), [])
    prototype.sync = original
    const retry = await f.installer.preview()
    assert.equal((await f.installer.install(retry.planId)).reused, false)
    assert.ok((await readFile(f.target)).equals(bytes))
    await f.assertNeighbors()
  } finally {
    prototype.sync = original
    await f.cleanup()
  }
})

test('rollback synchronization failure retains restored prior bytes and an independently retained backup', async () => {
  const f = await fixture()
  const previous = Buffer.from('previous bytes retained when rollback fsync fails')
  const file = await open(import.meta.filename, 'r')
  const prototype = Object.getPrototypeOf(file)
  const original = prototype.sync
  await file.close()
  let failures = 0
  try {
    await writeFile(f.target, previous)
    prototype.sync = async function (...args) {
      if ((await readlink(`/proc/self/fd/${this.fd}`).catch(() => '')) === f.resources) {
        failures += 1
        if (failures === 1) assert.ok((await readFile(f.target)).equals(bytes))
        if (failures === 2) assert.ok((await readFile(f.target)).equals(previous))
        throw Object.assign(new Error('controlled publication and rollback fsync failures'), {
          code: 'EIO',
        })
      }
      return await Reflect.apply(original, this, args)
    }
    const plan = await f.installer.preview()
    await assert.rejects(f.installer.install(plan.planId), { code: 'AUXILIARY_RECOVERY_REQUIRED' })
    assert.equal(failures, 2)
    assert.ok((await readFile(f.target)).equals(previous))
    const retained = (await readdir(f.resources)).filter((name) =>
      name.startsWith('.outpaint-infill-'),
    )
    assert.equal(retained.length, 1)
    const backup = path.join(f.resources, retained[0], 'previous.backup')
    await assert.doesNotReject(async () => {
      assert.ok((await readFile(backup)).equals(previous))
    })
    await f.assertNeighbors()
  } finally {
    prototype.sync = original
    await f.cleanup()
  }
})

test('a publication-file replacement after actual verification is rejected and prior bytes are restored', async () => {
  const f = await fixture()
  const previous = Buffer.from('previous resource retained after final verification refusal')
  const original = filesystemPromises.open
  let closes = 0
  let replaced = false
  try {
    await writeFile(f.target, previous)
    filesystemPromises.open = async function (...args) {
      const handle = await Reflect.apply(original, this, args)
      // FileHandle.close is an own instance property in Node 24; a prototype override
      // never observes this real verifier boundary. Wrap the actual opened handle.
      const close = handle.close
      handle.close = async function (...closeArgs) {
        const atPath = await readlink(`/proc/self/fd/${handle.fd}`).catch(() => '')
        const result = await Reflect.apply(close, handle, closeArgs)
        if (atPath.endsWith('/publication.ready')) {
          closes += 1
          if (closes === 2) {
            // Close #1 is the real copied file; #2 is the actual byte verifier's FD.
            replaced = true
            await unlink(atPath)
            await writeFile(atPath, Buffer.alloc(bytes.length, 9), { flag: 'wx', mode: 0o600 })
          }
        }
        return result
      }
      return handle
    }
    syncBuiltinESMExports()
    const plan = await f.installer.preview()
    await assert.rejects(f.installer.install(plan.planId), { code: 'GENERATION_RESOURCE_CHANGED' })
    assert.equal(replaced, true)
    assert.ok((await readFile(f.target)).equals(previous))
    assert.deepEqual(await readdir(f.resources), ['big-lama.pt'])
    await f.assertNeighbors()
  } finally {
    filesystemPromises.open = original
    syncBuiltinESMExports()
    await f.cleanup()
  }
})

test('an uncertain rollback preserves the prior backup and never overwrites a new destination inode', async () => {
  const f = await fixture()
  const previous = Buffer.from('old resource required for manual recovery')
  const file = await open(import.meta.filename, 'r')
  const prototype = Object.getPrototypeOf(file)
  const original = prototype.sync
  await file.close()
  let changed = false
  try {
    await writeFile(f.target, previous)
    prototype.sync = async function (...args) {
      if (
        !changed &&
        (await readlink(`/proc/self/fd/${this.fd}`).catch(() => '')) === f.resources
      ) {
        changed = true
        await rename(f.target, path.join(f.root, 'published-inode-moved.pt'))
        await writeFile(f.target, 'foreign concurrent destination', { flag: 'wx', mode: 0o600 })
        throw Object.assign(new Error('controlled post-rename directory fsync failure'), {
          code: 'EIO',
        })
      }
      return await Reflect.apply(original, this, args)
    }
    const plan = await f.installer.preview()
    await assert.rejects(f.installer.install(plan.planId), { code: 'AUXILIARY_RECOVERY_REQUIRED' })
    assert.equal(changed, true)
    assert.equal(await readFile(f.target, 'utf8'), 'foreign concurrent destination')
    const retained = (await readdir(f.resources)).filter((name) =>
      name.startsWith('.outpaint-infill-'),
    )
    assert.equal(retained.length, 1)
    const backup = path.join(f.resources, retained[0], 'previous.backup')
    assert.ok((await readFile(backup)).equals(previous))
    assert.ok((await readFile(path.join(f.root, 'published-inode-moved.pt'))).equals(bytes))
    await f.assertNeighbors()
  } finally {
    prototype.sync = original
    await f.cleanup()
  }
})

test('private download directory replacement is refused without deleting the replacement inode', async () => {
  const f = await fixture()
  let replacement
  let moved
  try {
    const normal = f.downloader.download
    f.downloader.download = async (input) => {
      replacement = await realpath(input.stagingDirectory)
      moved = `${replacement}.moved`
      await rename(replacement, moved)
      await mkdir(replacement, { mode: 0o700 })
      await writeFile(path.join(replacement, 'keep.txt'), 'replacement work')
      return await normal(input)
    }
    const plan = await f.installer.preview()
    await assert.rejects(f.installer.install(plan.planId), { code: 'AUXILIARY_INVALID_STORAGE' })
    assert.equal(await readFile(path.join(replacement, 'keep.txt'), 'utf8'), 'replacement work')
    assert.equal((await readdir(moved)).length, 0)
    await assert.rejects(lstat(f.target), { code: 'ENOENT' })
    await f.assertNeighbors()
  } finally {
    await f.cleanup()
  }
})

test('delayed cleanup replacement cannot recursively delete a foreign directory after its ownership check', async () => {
  const f = await fixture()
  const file = await open(import.meta.filename, 'r')
  const prototype = Object.getPrototypeOf(file)
  const original = prototype.stat
  await file.close()
  let workFd
  let workPath
  let moved
  let observed = false
  try {
    const normal = f.downloader.download
    f.downloader.download = async (input) => {
      const match = /^\/proc\/self\/fd\/(\d+)\/\.$/.exec(input.stagingDirectory)
      assert.ok(match)
      workFd = Number(match[1])
      workPath = await realpath(input.stagingDirectory)
      moved = `${workPath}.moved`
      return await normal(input)
    }
    prototype.stat = async function (...args) {
      const result = await Reflect.apply(original, this, args)
      if (!observed && this.fd === workFd) {
        // Actual cleanup entry lstat has completed; replace it while its original descriptor
        // remains open, immediately before the entry-based final removal.
        observed = true
        await rename(workPath, moved)
        await mkdir(workPath, { mode: 0o700 })
        await writeFile(path.join(workPath, 'foreign-must-survive.txt'), 'foreign')
        await mkdir(path.join(workPath, 'nested'))
        await writeFile(path.join(workPath, 'nested', 'keep.txt'), 'nested foreign')
      }
      return result
    }
    const plan = await f.installer.preview()
    const result = await f.installer.install(plan.planId)
    assert.equal(observed, true)
    assert.equal(result.reused, false)
    assert.ok((await readFile(f.target)).equals(bytes))
    await assert.doesNotReject(async () => {
      assert.equal(
        await readFile(path.join(workPath, 'foreign-must-survive.txt'), 'utf8'),
        'foreign',
      )
    })
    await assert.doesNotReject(async () => {
      assert.equal(
        await readFile(path.join(workPath, 'nested', 'keep.txt'), 'utf8'),
        'nested foreign',
      )
    })
    assert.deepEqual(await readdir(moved), [])
    await f.assertNeighbors()
  } finally {
    prototype.stat = original
    await f.cleanup()
  }
})

test('canonical private storage is required and parent aliases cannot create a second root reservation', async () => {
  const f = await fixture()
  try {
    assert.throws(
      () =>
        new AuxiliaryArtifactInstaller({
          downloader: f.downloader,
          manifest: f.manifest,
          resourcesDirectory: 'relative',
        }),
      { code: 'AUXILIARY_INVALID_STORAGE' },
    )
    const link = path.join(f.root, 'alias')
    await symlink(f.resources, link)
    const linked = new AuxiliaryArtifactInstaller({
      downloader: f.downloader,
      manifest: f.manifest,
      resourcesDirectory: link,
    })
    await assert.rejects(linked.preview(), { code: 'AUXILIARY_INVALID_STORAGE' })
    const parent = path.join(f.root, 'parent-alias')
    await symlink(f.root, parent)
    const aliased = new AuxiliaryArtifactInstaller({
      downloader: f.downloader,
      manifest: f.manifest,
      resourcesDirectory: path.join(parent, 'inference-resources'),
    })
    await assert.rejects(aliased.preview(), { code: 'AUXILIARY_INVALID_STORAGE' })
    assert.equal(f.calls.length, 0)
    assert.deepEqual(await readdir(f.resources), [])
  } finally {
    await f.cleanup()
  }
})

test('production factory exposes only pinned LaMa identity and refuses synthetic bytes even with honest fixture metadata', async () => {
  const f = await fixture()
  try {
    const production = createLamaAuxiliaryInstaller(f.resources, f.downloader)
    const plan = await production.preview()
    assert.equal(plan.requiredDownloadBytes, 205_669_692)
    assert.equal(
      plan.artifact.sha256,
      '344c77bbcb158f17dd143070d1e789f38a66c04202311ae3a258ef66667a9ea9',
    )
    assert.equal(plan.artifact.filename, 'big-lama.pt')
    await assert.rejects(production.install(plan.planId), { code: 'AUXILIARY_INVALID_DOWNLOAD' })
    assert.equal(f.calls[0].expectedBytes, LAMA_OUTPAINT_ARTIFACT.sizeBytes)
    assert.equal(f.calls[0].expectedSha256, LAMA_OUTPAINT_ARTIFACT.sha256)
    assert.deepEqual(await readdir(f.resources), [])
    await f.assertNeighbors()
  } finally {
    await f.cleanup()
  }
})

async function withFailedPublicationWrite(use) {
  const file = await open(import.meta.filename, 'r')
  const prototype = Object.getPrototypeOf(file)
  const original = prototype.write
  await file.close()
  let failed = false
  prototype.write = async function (...args) {
    if (
      (await readlink(`/proc/self/fd/${this.fd}`).catch(() => '')).endsWith('/publication.ready')
    ) {
      failed = true
      throw Object.assign(new Error('controlled publication copy failure'), { code: 'EIO' })
    }
    return await Reflect.apply(original, this, args)
  }
  try {
    await use()
    assert.equal(failed, true)
  } finally {
    prototype.write = original
  }
}
