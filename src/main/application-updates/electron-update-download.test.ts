import type { UpdateInfoAndProvider } from 'electron-updater/out/AppUpdater.js'
import type { ResolvedUpdateFileInfo } from 'electron-updater/out/types.js'

import { DownloadedUpdateHelper } from 'electron-updater/out/DownloadedUpdateHelper.js'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { createElectronUpdateChecker, VerifiedAppImageUpdater } from './electron-update-checker.js'

const body = Buffer.alloc(2 * 1024 * 1024 + 37, 19)
const digest = (bytes: Buffer) => createHash('sha512').update(bytes).digest('base64')
/** Native transfer is a controlled port; native cache and final file checks are real. */
class FixtureUpdater extends VerifiedAppImageUpdater {
  downloadCalls = 0
  files: ResolvedUpdateFileInfo[] = [descriptor()]
  readonly helper: DownloadedUpdateHelper
  nativeFailure = false
  returned: string[] | null = null
  transfers = 0

  constructor(readonly root: string) {
    super(null, { version: '0.1.0' })
    this.helper = new DownloadedUpdateHelper(path.join(root, 'cache'))
    this.downloadedUpdateHelper = this.helper
    this.updateInfoAndProvider = {
      info: {
        files: [this.files[0].info],
        path: 'studio-0.2.0.AppImage',
        releaseDate: '2026-11-15T00:00:00Z',
        sha512: digest(body),
        version: '0.2.0',
      },
      provider: { resolveFiles: () => this.files } as unknown as UpdateInfoAndProvider['provider'],
    }
    createElectronUpdateChecker(this)
  }

  override async downloadUpdate(): Promise<string[]> {
    this.downloadCalls += 1
    if (this.nativeFailure) {
      throw new Error('native controlled failure')
    }
    if (this.returned) {
      return this.returned
    }
    const selected = this.files[0]
    const info = this.updateInfoAndProvider!.info
    const filename = path.join(this.helper.cacheDirForPendingUpdate, 'studio-0.2.0.AppImage')
    const cached = await this.helper.validateDownloadedPath(filename, info, selected, this._logger)
    if (cached) {
      return [cached]
    }
    this.transfers += 1
    await fs.mkdir(this.helper.cacheDirForPendingUpdate, { recursive: true })
    await fs.writeFile(filename, body)
    this.emit('download-progress', {
      bytesPerSecond: body.length,
      delta: body.length,
      percent: 100,
      total: body.length,
      transferred: body.length,
    })
    await this.helper.setDownloadedFile(
      filename,
      null,
      info,
      selected,
      path.basename(filename),
      true,
    )
    return [filename]
  }
}

function descriptor(url = 'https://updates.invalid/studio-0.2.0.AppImage') {
  return { info: { sha512: digest(body), size: body.length, url }, url: new URL(url) }
}

async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'igs-app-download-'))
  t.after(() => fs.rm(root, { force: true, recursive: true }))
  return new FixtureUpdater(root)
}

test('explicit adapter download verifies actual bytes, forwards native progress and hides paths', async (t) => {
  const updater = await fixture(t)
  const checker = createElectronUpdateChecker(updater)
  const progress: unknown[] = []
  const result = await checker.downloadUpdate!((p) => progress.push(p))
  assert.deepEqual(result, { sizeBytes: body.length })
  assert.deepEqual(progress, [{ downloadedBytes: body.length, totalBytes: body.length }])
  assert.equal(updater.transfers, 1)
  assert.equal(updater.listenerCount('download-progress'), 0)
  assert.equal(updater.autoDownload, false)
  assert.equal(updater.autoInstallOnAppQuit, false)
  assert.equal(updater.autoRunAppAfterInstall, false)
  assert.equal(updater.disableDifferentialDownload, false)
})

test('same-process native cache bypass is caught, invalidated and explicitly retried', async (t) => {
  const updater = await fixture(t)
  await updater.downloadVerified(() => {})
  assert.equal(updater.transfers, 1)
  const filename = path.join(updater.helper.cacheDirForPendingUpdate, 'studio-0.2.0.AppImage')
  await fs.writeFile(filename, Buffer.alloc(body.length, 20))
  await assert.rejects(
    updater.downloadVerified(() => {}),
    /integrity verification failed/,
  )
  assert.equal(updater.transfers, 1, 'native same-process cache returned the changed file')
  assert.equal(updater.helper.file, null)
  assert.deepEqual(await fs.readdir(updater.helper.cacheDirForPendingUpdate), [])
  assert.deepEqual(await updater.downloadVerified(() => {}), { sizeBytes: body.length })
  assert.equal(updater.transfers, 2)
  assert.equal(updater.listenerCount('download-progress'), 0)
})

test('descriptor admission refuses ambiguous, missing and invalid integrity before native transfer', async (t) => {
  for (const files of [
    [],
    [descriptor(), descriptor('https://updates.invalid/other.AppImage')],
    [descriptor('https://updates.invalid/studio.deb')],
    [descriptor('https://updates.invalid/studio.appimage')],
    [{ ...descriptor(), info: { ...descriptor().info, sha512: 'wrong' } }],
    [{ ...descriptor(), info: { ...descriptor().info, sha512: digest(body).replace(/=+$/, '') } }],
    [{ ...descriptor(), info: { ...descriptor().info, size: 0 } }],
    [{ ...descriptor(), info: { ...descriptor().info, size: Number.POSITIVE_INFINITY } }],
    [{ ...descriptor(), info: { ...descriptor().info, size: Number.MAX_SAFE_INTEGER + 1 } }],
  ]) {
    await t.test(JSON.stringify(files.map((f) => f.info)), async (sub) => {
      const updater = await fixture(sub)
      updater.files = files
      await assert.rejects(updater.downloadVerified(() => {}))
      assert.equal(updater.downloadCalls, 0)
      assert.equal(updater.listenerCount('download-progress'), 0)
    })
  }
})

test('wrong returned path or extra files never becomes a completed download', async (t) => {
  const updater = await fixture(t)
  await updater.downloadVerified(() => {})
  const outside = path.join(updater.root, 'outside.AppImage')
  await fs.writeFile(outside, body)
  updater.returned = [outside]
  await assert.rejects(
    updater.downloadVerified(() => {}),
    /Unexpected application download path/,
  )
  assert.ok((await fs.readFile(outside)).equals(body))
  updater.returned = [outside, outside]
  await assert.rejects(
    updater.downloadVerified(() => {}),
    /Unexpected application download result/,
  )
  assert.equal(updater.listenerCount('download-progress'), 0)
})

test('same-size replacement and truncated files fail final validation', async (t) => {
  for (const bytes of [Buffer.alloc(body.length, 0), body.subarray(1)]) {
    await t.test(String(bytes.length), async (sub) => {
      const updater = await fixture(sub)
      await updater.downloadVerified(() => {})
      const filename = path.join(updater.helper.cacheDirForPendingUpdate, 'studio-0.2.0.AppImage')
      await fs.writeFile(filename, bytes)
      updater.returned = [filename]
      await assert.rejects(updater.downloadVerified(() => {}))
      assert.equal(updater.helper.file, null)
    })
  }
})

test('file symlinks are refused and cleanup does not remove their external target', async (t) => {
  const updater = await fixture(t)
  await updater.downloadVerified(() => {})
  const filename = path.join(updater.helper.cacheDirForPendingUpdate, 'studio-0.2.0.AppImage')
  const outside = path.join(updater.root, 'outside.AppImage')
  await fs.writeFile(outside, body)
  await fs.unlink(filename)
  await fs.symlink(outside, filename)
  updater.returned = [filename]
  await assert.rejects(
    updater.downloadVerified(() => {}),
    /invalid type or size/,
  )
  assert.ok((await fs.readFile(outside)).equals(body))
})

test('symlink cache roots and their contents are refused and preserved', async (t) => {
  const updater = await fixture(t)
  await updater.downloadVerified(() => {})
  const pending = updater.helper.cacheDirForPendingUpdate
  const outside = path.join(updater.root, 'outside-directory')
  await fs.rename(pending, outside)
  await fs.symlink(outside, pending)
  updater.returned = [path.join(pending, 'studio-0.2.0.AppImage')]
  await assert.rejects(
    updater.downloadVerified(() => {}),
    /Invalid application download cache/,
  )
  assert.ok((await fs.readFile(path.join(outside, 'studio-0.2.0.AppImage'))).equals(body))
  assert.equal((await fs.lstat(pending)).isSymbolicLink(), true)
})

test('native transfer errors remove only the operation progress listener and do not claim success', async (t) => {
  const updater = await fixture(t)
  updater.nativeFailure = true
  await assert.rejects(
    updater.downloadVerified(() => {}),
    /native controlled failure/,
  )
  assert.equal(updater.listenerCount('download-progress'), 0)
  assert.equal(updater.helper.file, null)
})

test('pre-existing symlink pending cache cannot let native invalidation delete external files', async (t) => {
  const updater = await fixture(t)
  const external = path.join(updater.root, 'external-fixture')
  await fs.mkdir(external)
  await fs.writeFile(path.join(external, 'update-info.json'), 'malformed JSON')
  const sentinel = path.join(external, 'sentinel.txt')
  await fs.writeFile(sentinel, 'must survive native cache admission')
  await fs.mkdir(updater.helper.cacheDir)
  await fs.symlink(external, updater.helper.cacheDirForPendingUpdate)
  await assert.rejects(updater.downloadVerified(() => {}))
  const exists = await fs.access(sentinel).then(
    () => true,
    () => false,
  )
  assert.equal(exists, true, 'Native invalidation must not delete the external sentinel.')
  assert.equal(
    updater.downloadCalls,
    0,
    'Unsafe cache must be refused before native transfer/cache access.',
  )
  assert.equal(await fs.readFile(sentinel, 'utf8'), 'must survive native cache admission')
})
