/**
 * A local HTTP fixture for the existing actual-AppImage smoke owner. Invoke launcher c267bdb4
 * updater.ts7/16 uses electron-updater6.6.2 checkForUpdates; this helper observes that real
 * consumer without replacing Main or its API. It owns no app process, installer, publisher identity
 * or shipping trust.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open, readFile, readdir, realpath } from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'

import { expect } from '@playwright/test'

const availableVersion = '0.1.0'
const releaseNotes = [
  'Qualification release notes remain literal text.',
  '<script>globalThis.__imagegenUnexpectedUpdateNotes = true</script>',
  '<img src=x onerror="globalThis.__imagegenUnexpectedUpdateNotes = true">',
].join('\n')
const artifactName = 'app-update-check-not-installable.AppImage'
// Deliberately non-installable bytes. Download integrity is tested; binary
// compatibility, publisher authenticity and installation are separate gates.
const artifactBytes = Buffer.alloc(2 * 1024 * 1024, 'qualification-only-not-an-executable\n')
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')

function deferred() {
  let resolve
  const promise = new Promise((accept) => {
    resolve = accept
  })
  return { promise, resolve }
}

function assertSnapshot(snapshot, status, currentVersion) {
  assert.deepEqual(Object.keys(snapshot).sort(), [
    'availableVersion',
    'currentVersion',
    'downloadedBytes',
    'notesTruncated',
    'releaseNotes',
    'status',
    'totalBytes',
  ])
  assert.equal(snapshot.currentVersion, currentVersion)
  assert.equal(snapshot.status, status)
  assert.equal(snapshot.notesTruncated, false)
  if (['available', 'downloading', 'downloaded', 'download-error'].includes(status)) {
    assert.equal(snapshot.availableVersion, availableVersion)
    assert.equal(snapshot.releaseNotes, releaseNotes)
  } else {
    assert.equal(snapshot.availableVersion, null)
    assert.equal(snapshot.releaseNotes, null)
  }
  if (status === 'downloaded') {
    assert.equal(snapshot.downloadedBytes, artifactBytes.length)
    assert.equal(snapshot.totalBytes, artifactBytes.length)
  } else if (status !== 'downloading') {
    assert.equal(snapshot.downloadedBytes, null)
    assert.equal(snapshot.totalBytes, null)
  }
}

async function readStatus(page) {
  const result = await page.evaluate(() => globalThis.api.applicationUpdates.getStatus())
  assert.equal(result.ok, true, JSON.stringify(result))
  return result.value
}

async function openDialog(page) {
  await page.getByRole('button', { name: 'Help menu', exact: true }).click()
  await page.getByText('Check for Updates…', { exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Application Updates', exact: true })
  await expect(dialog).toBeVisible()
  return dialog
}

async function closeDialog(dialog) {
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(dialog).not.toBeVisible()
}

async function screenshotSettled(page, dialog, filename) {
  await expect.poll(() => dialog.evaluate((element) => {
    let current = element
    while (current) {
      if (Number.parseFloat(getComputedStyle(current).opacity) < 0.999) {
        return false
      }
      current = current.parentElement
    }
    return true
  })).toBe(true)
  await page.screenshot({ path: filename })
}

async function projectIdentity(root) {
  const directory = path.join(root, 'data/imagegen-studio/workspaces/Uncategorized')
  assert.equal(await realpath(directory), directory)
  const members = (await readdir(directory)).filter((name) => name.endsWith('.igs'))
  assert.equal(members.length, 1)
  const filename = path.join(directory, members[0])
  const stat = await lstat(filename)
  assert.ok(stat.isFile() && !stat.isSymbolicLink())
  const bytes = await readFile(filename)
  return { path: filename, sizeBytes: bytes.length, sha256: sha(bytes) }
}

async function resizeRendererViewport(page, width, height) {
  // Electron's Chromium CDP has no Browser.getWindowForTarget. Exercise the
  // packaged renderer's CSS viewport; physical native window resize is not
  // qualified by this emulation. Restore the observed original dimensions.
  const previous = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
  await page.setViewportSize({ width, height })
  await expect.poll(() => page.evaluate(() => ({ width: innerWidth, height: innerHeight })))
    .toEqual({ width, height })
  return async () => { await page.setViewportSize(previous) }
}

export async function createApplicationUpdateCheckSmoke({ mode, port = 0, root, currentVersion }) {
  assert.ok(mode === 'feed' || mode === 'unavailable' || mode === 'download')
  assert.ok(Number.isSafeInteger(port) && port >= 0 && port <= 65535)
  assert.equal(currentVersion, '0.1.0-dev.1')
  const requests = []
  const checks = []
  const viewportEvidence = { kind: 'packaged renderer CSS viewport emulation', width: 900, height: 620, nativeWindowResizeQualified: false }
  const active = new Set()
  let feedMode = 'current'
  let held = null
  let heldArtifact = null
  let artifactMode = 'healthy'
  let afterChecksArtifactCount = null
  let cacheRestoration = null
  let serverClosed = false
  let stopPromise = null
  let afterChecksMetadataCount = null
  let projectBefore = null
  let projectAfter = null

  function metadata() {
    const version = feedMode === 'current' ? currentVersion : availableVersion
    return [
      `version: ${JSON.stringify(version)}`,
      'files:',
      `  - url: ${artifactName}`,
      `    sha512: ${createHash('sha512').update(artifactBytes).digest('base64')}`,
      `    size: ${artifactBytes.length}`,
      `releaseNotes: ${JSON.stringify(releaseNotes)}`,
      'releaseDate: "2026-11-15T00:00:00.000Z"',
      '',
    ].join('\n')
  }

  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname
    const kind =
      pathname === '/latest-linux.yml'
        ? 'metadata'
        : pathname === `/${artifactName}` || pathname.endsWith('.blockmap')
          ? 'artifact'
          : 'other'
    const entry = {
      sequence: requests.length + 1,
      method: request.method,
      path: pathname,
      kind,
      feedMode,
      artifactMode,
      range: request.headers.range ?? null,
      finished: false,
      closed: false,
    }
    requests.push(entry)
    active.add(response)
    response.once('finish', () => {
      entry.finished = true
    })
    response.once('close', () => {
      entry.closed = true
      active.delete(response)
    })
    if (kind === 'artifact') {
      // A mutation may cause a real download. Its harmless matching body lets
      // that task settle; the immutable request counter is asserted after close.
      if (request.headers.range) {
        response.writeHead(416)
        response.end()
        return
      }
      response.writeHead(200, {
        'content-type': 'application/octet-stream',
        'content-length': artifactBytes.length,
      })
      if (artifactMode === 'held') {
        assert.equal(heldArtifact, null)
        let offset = 0
        const chunkSize = 64 * 1024
        const timer = setInterval(() => {
          if (response.destroyed || response.writableEnded || offset >= artifactBytes.length / 2) {
            clearInterval(timer)
            return
          }
          const end = Math.min(offset + chunkSize, artifactBytes.length / 2)
          response.write(artifactBytes.subarray(offset, end))
          offset = end
        }, 100)
        response.once('close', () => clearInterval(timer))
        heldArtifact = () => {
          clearInterval(timer)
          if (!response.destroyed && !response.writableEnded) response.end(artifactBytes.subarray(offset))
        }
      } else if (artifactMode === 'corrupt') {
        const corrupt = Buffer.from(artifactBytes)
        corrupt[0] ^= 1
        response.end(corrupt)
      } else {
        response.end(artifactBytes)
      }
      return
    }
    if (kind !== 'metadata') {
      response.writeHead(404)
      response.end()
      return
    }
    const selectedMode = feedMode
    const body = metadata()
    const respond = () => {
      if (response.destroyed || response.writableEnded) return
      if (selectedMode === 'transport-error') {
        request.socket.destroy()
        return
      }
      if (selectedMode === 'http-error') {
        response.writeHead(503, { 'content-type': 'text/plain' })
        response.end('Controlled update-check HTTP error.')
        return
      }
      response.writeHead(200, { 'content-type': 'application/yaml' })
      response.end(selectedMode === 'malformed' ? 'version: [invalid\nfiles: [' : body)
    }
    if (held && !held.respond) {
      held.respond = respond
      held.entered.resolve()
    } else {
      respond()
    }
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', reject)
      resolve()
    })
  })
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const metadataCount = () => requests.filter((entry) => entry.kind === 'metadata').length
  const artifactCount = () => requests.filter((entry) => entry.kind === 'artifact').length
  const record = (name, snapshot, extra = {}) => checks.push({ name, snapshot, ...extra })

  function holdNext() {
    assert.equal(held, null)
    held = { entered: deferred(), respond: null }
    return held.entered.promise
  }
  function releaseHeld() {
    const current = held
    held = null
    current?.respond?.()
    const artifact = heldArtifact
    heldArtifact = null
    artifact?.()
  }
  async function terminal(page, status) {
    let snapshot
    await expect
      .poll(async () => {
        snapshot = await readStatus(page)
        return snapshot.status
      })
      .toBe(status)
    assertSnapshot(snapshot, status, currentVersion)
    return snapshot
  }

  async function settledDownload(page, expected, name, extra = {}) {
    let state
    await expect.poll(async () => {
      state = await readStatus(page)
      return state.status
    }).toMatch(/^(downloaded|download-error)$/)
    // Retain the observed terminal state before checking it. A removed verifier
    // must fail on its actual false success, not on waiting for an error forever.
    record(name, state, { ...extra, metadataRequests: metadataCount(), artifactRequests: artifactCount() })
    assertSnapshot(state, expected, currentVersion)
    return state
  }

  async function assertStartup(page) {
    const snapshot = await readStatus(page)
    assertSnapshot(snapshot, mode === 'unavailable' ? 'unavailable' : 'idle', currentVersion)
    assert.equal(
      requests.length,
      0,
      'Startup and read-only status must not contact the update feed.',
    )
    record('Actual startup/getStatus performs no update request', snapshot)
  }

  async function ownCachedArtifact() {
    // Exact qualification-only cache name from its bundled app-update.yml;
    // AppAdapter.getAppCacheDir on Linux uses our isolated XDG_CACHE_HOME.
    // Chromium/font caches under that root are unrelated to this mutation.
    const cacheRoot = path.join(root, 'cache')
    const cache = path.join(cacheRoot, 'igs-aud-updater')
    const pending = path.join(cache, 'pending')
    for (const directory of [cacheRoot, cache, pending]) {
      const info = await lstat(directory)
      assert.ok(info.isDirectory() && !info.isSymbolicLink())
      assert.equal(await realpath(directory), directory)
    }
    assert.deepEqual((await readdir(pending)).sort(), [artifactName, 'update-info.json'].sort())
    const filename = path.join(pending, artifactName)
    const info = await lstat(filename)
    assert.ok(info.isFile() && !info.isSymbolicLink())
    assert.equal(await realpath(filename), filename)
    return filename
  }

  async function assertHealthyCache() {
    const filename = await ownCachedArtifact()
    const bytes = await readFile(filename)
    assert.ok(bytes.equals(artifactBytes), 'Native pending cache must contain the exact healthy fixture bytes.')
    return { path: filename, sizeBytes: bytes.length, sha256: sha(bytes) }
  }

  async function corruptOwnCache() {
    const before = await assertHealthyCache()
    const handle = await open(before.path, constants.O_RDWR | constants.O_NOFOLLOW)
    try {
      const info = await handle.stat()
      assert.ok(info.isFile() && info.size === artifactBytes.length)
      const first = Buffer.alloc(1)
      const read = await handle.read(first, 0, 1, 0)
      assert.equal(read.bytesRead, 1)
      first[0] ^= 1
      const written = await handle.write(first, 0, 1, 0)
      assert.equal(written.bytesWritten, 1)
      await handle.sync()
      assert.equal((await handle.stat()).size, before.sizeBytes)
    } finally {
      await handle.close()
    }
    const bytes = await readFile(before.path)
    assert.notEqual(sha(bytes), before.sha256)
    return { before, corruptedSha256: sha(bytes) }
  }

  async function runDownloads(page, initialDialog) {
    let dialog = initialDialog
    let state = await terminal(page, 'up-to-date')
    assert.equal(metadataCount(), 1)
    assert.equal(artifactCount(), 0)
    feedMode = 'available'
    await dialog.getByRole('button', { name: 'Check again', exact: true }).click()
    state = await terminal(page, 'available')
    await expect(dialog.getByRole('button', { name: 'Download', exact: true })).toBeEnabled()
    assert.equal(metadataCount(), 2)
    assert.equal(artifactCount(), 0, 'Checking available metadata must not download the artifact.')
    const wrong = await page.evaluate(() => globalThis.api.applicationUpdates.download('9.9.9'))
    assert.equal(wrong.ok, true, JSON.stringify(wrong))
    assertSnapshot(wrong.value, 'available', currentVersion)
    assert.equal(artifactCount(), 0)
    record('Available check and stale-version Download preserve explicit transfer intent', state)

    artifactMode = 'corrupt'
    await dialog.getByRole('button', { name: 'Download', exact: true }).click()
    state = await settledDownload(page, 'download-error', 'Observed actual native digest result')
    await expect(dialog).toContainText('Could not download or verify the update. Try downloading again.')
    assert.ok(artifactCount() > 0)
    await expect.poll(() => active.size).toBe(0)
    record('Actual native SHA512 mismatch gives a visible retryable Download failure', state)

    artifactMode = 'held'
    const artifactsBeforeHeld = artifactCount()
    await dialog.getByRole('button', { name: 'Retry download', exact: true }).click()
    await expect.poll(() => heldArtifact !== null).toBe(true)
    await expect.poll(async () => (await readStatus(page)).downloadedBytes).toBeGreaterThan(0)
    state = await readStatus(page)
    assertSnapshot(state, 'downloading', currentVersion)
    assert.ok(state.downloadedBytes < state.totalBytes)
    await expect(dialog).toContainText('Downloading and verifying…')
    await expect(dialog.getByRole('button', { name: 'Check again', exact: true })).toBeDisabled()
    assert.ok(artifactCount() > artifactsBeforeHeld)
    const heldRequestCount = artifactCount()
    await page.evaluate(() => {
      globalThis.__imagegenPackageDownloads = Promise.all([
        globalThis.api.applicationUpdates.download('0.1.0'),
        globalThis.api.applicationUpdates.download('0.1.0'),
      ])
    })
    const whileDownloading = await page.evaluate(() => globalThis.api.applicationUpdates.check())
    assert.equal(whileDownloading.ok, true, JSON.stringify(whileDownloading))
    assertSnapshot(whileDownloading.value, 'downloading', currentVersion)
    assert.equal(metadataCount(), 2, 'Check while downloading must not replace selected native metadata.')
    await closeDialog(dialog)
    dialog = await openDialog(page)
    await expect(dialog).toContainText('Downloading and verifying…')
    assert.equal(metadataCount(), 2)
    assert.equal(artifactCount(), heldRequestCount, 'Duplicate Download must share the accepted transfer.')
    const restore = await resizeRendererViewport(page, 900, 620)
    try {
      await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeInViewport()
      await screenshotSettled(page, dialog, path.join(root, 'application-updates-download-progress-900x620.png'))
    } finally {
      await restore()
    }
    record('Real native byte progress survives dismissal/reopen and duplicate Download/check calls', state)
    artifactMode = 'healthy'
    releaseHeld()
    state = await settledDownload(page, 'downloaded', 'Observed held native transfer completion')
    const duplicates = await page.evaluate(async () => {
      try { return await globalThis.__imagegenPackageDownloads }
      finally { delete globalThis.__imagegenPackageDownloads }
    })
    for (const result of duplicates) {
      assert.equal(result.ok, true, JSON.stringify(result))
      assertSnapshot(result.value, 'downloaded', currentVersion)
    }
    await expect(dialog).toContainText('Download completed')
    await expect(dialog).toContainText('Installation is not available in this build.')
    assert.equal(await dialog.getByRole('button', { name: /install|restart/i }).count(), 0)
    const healthy = await assertHealthyCache()
    record('Completed native transfer and final file verification preserve no-install authority', state, { healthy })

    const mutation = await corruptOwnCache()
    const beforeCacheCheck = artifactCount()
    await dialog.getByRole('button', { name: 'Download again', exact: true }).click()
    state = await settledDownload(page, 'download-error', 'Observed final verification of mutated same-process cache', mutation)
    await expect(dialog).toContainText('Download failed')
    assert.equal(artifactCount(), beforeCacheCheck, 'Same-process native cache verification must not hide a new transfer.')
    record('Same-size cached-byte mutation is rejected by final readback after native cache reuse', state, mutation)

    await dialog.getByRole('button', { name: 'Retry download', exact: true }).click()
    state = await settledDownload(page, 'downloaded', 'Observed healthy cache restoration retry')
    assert.ok(artifactCount() > beforeCacheCheck, 'Explicit retry must replace rejected cache with fresh native transfer.')
    cacheRestoration = await assertHealthyCache()
    assert.equal(cacheRestoration.sha256, mutation.before.sha256)
    const restoreCompleted = await resizeRendererViewport(page, 900, 620)
    try {
      await screenshotSettled(page, dialog, path.join(root, 'application-updates-download-completed-900x620.png'))
    } finally { await restoreCompleted() }
    record('Explicit healthy retry restores exact cached bytes after integrity rejection', state, { cacheRestoration })
    await expect.poll(() => active.size).toBe(0)
    await closeDialog(dialog)
  }

  async function run(page) {
    projectBefore = await projectIdentity(root)
    assert.equal(requests.length, 0)
    let dialog = await openDialog(page)
    if (mode === 'unavailable') {
      const snapshot = await terminal(page, 'unavailable')
      await expect(dialog).toContainText('Update checking is not available in this build.')
      await dialog.getByRole('button', { name: 'Check again', exact: true }).click()
      assertSnapshot(await readStatus(page), 'unavailable', currentVersion)
      assert.equal(requests.length, 0)
      await screenshotSettled(page, dialog, path.join(root, 'application-updates-unavailable.png'))
      record(
        'Actual default Help/check/retry stays unavailable without a publisher or network request',
        snapshot,
      )
      await closeDialog(dialog)
    } else if (mode === 'download') {
      await runDownloads(page, dialog)
    } else {
      let snapshot = await terminal(page, 'up-to-date')
      await expect(dialog).toContainText('ImageGen Studio is up to date.')
      assert.equal(metadataCount(), 1)
      record('Explicit Help check reads current-version metadata', snapshot)

      const entered = holdNext()
      await dialog.getByRole('button', { name: 'Check again', exact: true }).click()
      await expect.poll(() => held?.respond !== null).toBe(true)
      await entered
      assertSnapshot(await readStatus(page), 'checking', currentVersion)
      await expect(dialog.getByRole('button', { name: 'Check again', exact: true })).toBeDisabled()
      await page.evaluate(() => {
        globalThis.__imagegenPackageUpdateChecks = Promise.all([
          globalThis.api.applicationUpdates.check(),
          globalThis.api.applicationUpdates.check(),
        ])
      })
      // This subsequent real getter is an IPC fence after both explicit invokes.
      assertSnapshot(await readStatus(page), 'checking', currentVersion)
      assert.equal(metadataCount(), 2)
      releaseHeld()
      const duplicates = await page.evaluate(async () => {
        try {
          return await globalThis.__imagegenPackageUpdateChecks
        } finally {
          delete globalThis.__imagegenPackageUpdateChecks
        }
      })
      for (const result of duplicates) {
        assert.equal(result.ok, true, JSON.stringify(result))
        assertSnapshot(result.value, 'up-to-date', currentVersion)
      }
      snapshot = await terminal(page, 'up-to-date')
      assert.equal(metadataCount(), 2)
      record('Held real metadata response and two duplicate public checks coalesce', snapshot, {
        publicReplies: duplicates.length,
      })

      feedMode = 'available'
      const availableEntered = holdNext()
      await dialog.getByRole('button', { name: 'Check again', exact: true }).click()
      await expect.poll(() => held?.respond !== null).toBe(true)
      await availableEntered
      assertSnapshot(await readStatus(page), 'checking', currentVersion)
      await closeDialog(dialog)
      assertSnapshot(await readStatus(page), 'checking', currentVersion)
      dialog = await openDialog(page)
      await expect(dialog).toContainText('Checking for updates…')
      releaseHeld()
      snapshot = await terminal(page, 'available')
      await expect(dialog).toContainText(availableVersion)
      await expect(dialog.getByRole('region', { name: 'Release notes', exact: true })).toHaveText(
        releaseNotes,
      )
      assert.equal(await dialog.locator('script, img').count(), 0)
      assert.equal(await page.evaluate(() => globalThis.__imagegenUnexpectedUpdateNotes), undefined)
      await expect(dialog).toContainText(
        'Installation is not available in this build.',
      )
      await expect(dialog.getByRole('button', { name: 'Download', exact: true })).toBeEnabled()
      assert.equal(
        await dialog.getByRole('button', { name: /install|restart/i }).count(),
        0,
      )
      assert.equal(metadataCount(), 3)
      await screenshotSettled(page, dialog, path.join(root, 'application-updates-available.png'))
      const restore = await resizeRendererViewport(page, 900, 620)
      try {
        await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeInViewport()
        await expect(
          dialog.getByRole('button', { name: 'Check again', exact: true }),
        ).toBeInViewport()
        await screenshotSettled(page, dialog, path.join(root, 'application-updates-available-900x620.png'))
      } finally {
        await restore()
      }
      record(
        'Pending dismissal/reopen keeps Main work; literal HTML notes stay text with no installer action',
        snapshot,
      )

      for (const fault of ['http-error', 'malformed', 'transport-error']) {
        feedMode = fault
        await dialog.getByRole('button', { name: 'Check again', exact: true }).click()
        snapshot = await terminal(page, 'error')
        await expect(dialog).toContainText(
          'Could not check for updates. Check your connection and try again.',
        )
        await expect(dialog.getByRole('button', { name: 'Check again', exact: true })).toBeEnabled()
        record(`Controlled ${fault} gives a visible retryable result`, snapshot)
        feedMode = 'available'
        await dialog.getByRole('button', { name: 'Check again', exact: true }).click()
        snapshot = await terminal(page, 'available')
        await expect(dialog).toContainText('A new version is available.')
        record(`Explicit healthy retry after ${fault}`, snapshot)
      }
      // Chromium may retry a GET whose reused socket closes without headers.
      // Count those actual controlled transport attempts without inventing a
      // replacement retry policy; every other explicit check remains exact.
      const transportAttempts = requests.filter(
        (entry) => entry.kind === 'metadata' && entry.feedMode === 'transport-error',
      ).length
      assert.ok(transportAttempts >= 1)
      assert.equal(metadataCount(), 8 + transportAttempts)
      await closeDialog(dialog)
    }
    afterChecksMetadataCount = metadataCount()
    afterChecksArtifactCount = artifactCount()
    projectAfter = await projectIdentity(root)
    assert.deepEqual(
      projectAfter,
      projectBefore,
      'Manual checks must preserve the actual saved .igs bytes.',
    )
  }

  async function assertRestart(page) {
    const snapshot = await readStatus(page)
    assertSnapshot(snapshot, mode === 'unavailable' ? 'unavailable' : 'idle', currentVersion)
    assert.equal(
      metadataCount(),
      afterChecksMetadataCount,
      'Ordinary close/restart/getStatus must not check for updates.',
    )
    record('New actual app lifetime resets transient status without a network check', snapshot)
    assert.equal(artifactCount(), afterChecksArtifactCount, 'Ordinary close/restart must not download or install cached bytes.')
    if (mode === 'download') {
      const dialog = await openDialog(page)
      await terminal(page, 'available')
      assert.equal(metadataCount(), afterChecksMetadataCount + 1)
      const beforeRestartDownload = artifactCount()
      await dialog.getByRole('button', { name: 'Download', exact: true }).click()
      const completed = await settledDownload(page, 'downloaded', 'Observed restarted explicit cached revalidation')
      assert.equal(artifactCount(), beforeRestartDownload, 'Restarted native cached download must rehash and reuse healthy bytes.')
      assert.deepEqual(await assertHealthyCache(), cacheRestoration)
      await expect(dialog).toContainText('Download completed')
      await closeDialog(dialog)
      afterChecksMetadataCount = metadataCount()
      record('Explicit restarted Download revalidates healthy native cache without an artifact request', completed)
    }
  }

  function snapshot() {
    return {
      mode,
      viewportEvidence,
      feedPort: address.port,
      controlledTransportFault:
        'This fixture destroys its own HTTP socket; host-wide offline is not qualified.',
      metadataRequests: metadataCount(),
      explicitCheckSequences: mode === 'feed' ? 9 : mode === 'download' ? 3 : 2,
      artifactRequests: requests.filter((entry) => entry.kind === 'artifact').length,
      otherRequests: requests.filter((entry) => entry.kind === 'other').length,
      activeResponses: active.size,
      serverClosed,
      requests: structuredClone(requests),
      checks: structuredClone(checks),
      projectBefore,
      projectAfter,
      cacheRestoration,
      artifactFixture: { sizeBytes: artifactBytes.length, sha256: sha(artifactBytes), installable: false },
      scope:
        mode === 'download'
          ? 'Real packaged Main/preload/UI/native download, progress and saved-cache integrity on controlled non-installable bytes. No Main mocks, installer, publisher authenticity or binary compatibility qualification.'
          : 'Real packaged Main/preload/UI and electron-updater metadata requests to a controlled local feed. No Main service mocks, automatic downloads, installer, shipping trust or binary-update qualification.',
    }
  }
  async function stop() {
    if (!stopPromise) {
      releaseHeld()
      stopPromise = new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error)
          else {
            serverClosed = true
            resolve()
          }
        })
        server.closeIdleConnections?.()
      })
    }
    await stopPromise
  }
  function finalize() {
    assert.equal(
      serverClosed,
      true,
      'Observe closed app lifetimes and a drained fixture before absence assertions.',
    )
    assert.equal(active.size, 0)
    assert.equal(metadataCount(), afterChecksMetadataCount)
    assert.equal(artifactCount(), afterChecksArtifactCount)
    if (mode !== 'download') {
      assert.equal(artifactCount(), 0, 'Manual application update checks must never request an update artifact.')
    } else {
      assert.ok(cacheRestoration)
      assert.equal(checks.some((entry) => entry.name.includes('cached-byte mutation')), true)
    }
    assert.equal(requests.filter((entry) => entry.kind === 'other').length, 0)
    assert.equal(
      requests.filter((entry) => entry.kind === 'metadata').every((entry) => entry.closed),
      true,
    )
    assert.deepEqual(projectAfter, projectBefore)
    return snapshot()
  }
  return { assertStartup, run, assertRestart, releaseHeld, stop, finalize, snapshot }
}
