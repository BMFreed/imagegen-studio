import {
  APPLICATION_UPDATE_NOTES_MAX_LENGTH,
  isApplicationUpdateSnapshot,
} from '../../shared/application-updates.js'

import type { AppUpdater } from 'electron-updater'

import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  type ApplicationUpdateCheckResult,
  ApplicationUpdateService,
} from './application-update-service.js'
import { createElectronUpdateChecker } from './electron-update-checker.js'

const current = '0.1.0-dev.1'
const available = (releaseNotes?: ApplicationUpdateCheckResult['updateInfo']['releaseNotes']) => ({
  isUpdateAvailable: true,
  updateInfo: { releaseNotes, version: '0.1.0' },
})
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

test('construction and status reads do not create a checker, check metadata or grant install authority', async () => {
  let factories = 0
  const service = new ApplicationUpdateService(current, true, () => {
    factories += 1
    return { checkForUpdates: async () => available() }
  })
  const first = service.getStatus()
  assert.equal(first.status, 'idle')
  first.currentVersion = '9.9.9'
  await Promise.resolve()
  assert.equal(factories, 0)
  assert.equal(service.getStatus().currentVersion, current)
  assert.equal((await service.check()).status, 'available')
  assert.equal(factories, 1)
})

test('unconfigured check remains unavailable without constructing or invoking a native updater', async () => {
  const service = new ApplicationUpdateService(current, false, () => {
    throw new Error('must not construct')
  })
  assert.equal(service.getStatus().status, 'unavailable')
  assert.equal((await service.check()).status, 'unavailable')
})

test('overlapping explicit checks share the held native operation and copied final projection', async () => {
  const entered = deferred<void>()
  const complete = deferred<ApplicationUpdateCheckResult>()
  let checks = 0
  const service = new ApplicationUpdateService(current, true, () => ({
    checkForUpdates: () => {
      checks += 1
      entered.resolve()
      return complete.promise
    },
  }))
  const one = service.check()
  await entered.promise
  const two = service.check()
  assert.equal(service.getStatus().status, 'checking')
  assert.equal(checks, 1)
  complete.resolve(available('Release notes'))
  const [a, b] = await Promise.all([one, two])
  assert.deepEqual(a, b)
  a.releaseNotes = 'mutated observer'
  assert.equal(service.getStatus().releaseNotes, 'Release notes')
  assert.equal(b.releaseNotes, 'Release notes')
})

test('network failure is a bounded visible error and another explicit check can succeed', async () => {
  let checks = 0
  const service = new ApplicationUpdateService(current, true, () => ({
    checkForUpdates: async () => {
      if (++checks === 1) {
        throw new Error('https://private.invalid/token /private/cache')
      }
      return available()
    },
  }))
  const failure = await service.check()
  assert.equal(failure.status, 'error')
  assert.equal(JSON.stringify(failure).includes('private'), false)
  assert.equal((await service.check()).status, 'available')
  assert.equal(checks, 2)
})

test('synchronous checker construction failure settles completely and permits a new explicit attempt', async () => {
  let factories = 0
  const service = new ApplicationUpdateService(current, true, () => {
    if (++factories === 1) {
      throw new Error('constructor failed')
    }
    return { checkForUpdates: async () => available() }
  })
  assert.equal((await service.check()).status, 'error')
  assert.equal((await service.check()).status, 'available')
  assert.equal(factories, 2)
})

test('native no-update result stays up-to-date without exposing irrelevant remote notes or private fields', async () => {
  const service = new ApplicationUpdateService(current, true, () => ({
    checkForUpdates: async () => ({
      isUpdateAvailable: false,
      updateInfo: { path: '/private/file', releaseNotes: '<b>older</b>', version: '0.0.1' },
    }),
  }))
  assert.deepEqual(await service.check(), {
    availableVersion: null,
    currentVersion: current,
    downloadedBytes: null,
    notesTruncated: false,
    releaseNotes: null,
    status: 'up-to-date',
    totalBytes: null,
  })
})

test('available notes preserve literal text and multi-release order with a bounded Unicode projection', async () => {
  let notes: ApplicationUpdateCheckResult['updateInfo']['releaseNotes'] = [
    { note: '<img src=x onerror=alert(1)>', version: '0.1.0' },
    { note: null, version: '0.0.9' },
  ]
  const service = new ApplicationUpdateService(current, true, () => ({
    checkForUpdates: async () => available(notes),
  }))
  assert.equal((await service.check()).releaseNotes, '0.1.0\n<img src=x onerror=alert(1)>\n\n0.0.9')
  notes = `${'a'.repeat(APPLICATION_UPDATE_NOTES_MAX_LENGTH - 1)}😀tail`
  const bounded = await service.check()
  assert.equal(bounded.notesTruncated, true)
  assert.equal(bounded.releaseNotes, 'a'.repeat(APPLICATION_UPDATE_NOTES_MAX_LENGTH - 1))
  assert.equal(isApplicationUpdateSnapshot(bounded), true)
})

test('invalid native metadata never becomes an available public update', async (t) => {
  for (const result of [
    null,
    { isUpdateAvailable: 'yes', updateInfo: { version: '0.1.0' } },
    { isUpdateAvailable: true, updateInfo: { version: '/tmp/private' } },
    { isUpdateAvailable: true, updateInfo: { version: current } },
    {
      isUpdateAvailable: true,
      updateInfo: { releaseNotes: [{ note: 3, version: '0.1.0' }], version: '0.1.0' },
    },
  ]) {
    await t.test(JSON.stringify(result), async () => {
      const service = new ApplicationUpdateService(current, true, () => ({
        checkForUpdates: async () => result as ApplicationUpdateCheckResult | null,
      }))
      assert.equal((await service.check()).status, 'error')
    })
  }
})

test('Invoke adapter disables automatic native actions before check and exposes no installer', async () => {
  let checked = false
  let errorListener: ((error: Error) => void) | null = null
  const driver = {
    allowDowngrade: true,
    allowPrerelease: true,
    autoDownload: true,
    autoInstallOnAppQuit: true,
    autoRunAppAfterInstall: true,
    checkForUpdates: async () => {
      assert.equal(driver.autoDownload, false)
      assert.equal(driver.autoInstallOnAppQuit, false)
      assert.equal(driver.autoRunAppAfterInstall, false)
      assert.equal(driver.allowPrerelease, false)
      assert.equal(driver.allowDowngrade, false)
      checked = true
      return available()
    },
    logger: console,
    on: (event: string, listener: (error: Error) => void) => {
      assert.equal(event, 'error')
      errorListener = listener
    },
  }
  const checker = createElectronUpdateChecker(driver as unknown as AppUpdater)
  assert.equal(checked, false)
  assert.deepEqual(Object.keys(checker).sort(), ['checkForUpdates', 'downloadUpdate'])
  assert.ok(errorListener)
  await checker.checkForUpdates()
  assert.equal(checked, true)
})

test('download needs the exact version from an explicit successful check, never an idle getter', async () => {
  let downloads = 0
  let factories = 0
  const service = new ApplicationUpdateService(current, true, () => {
    factories += 1
    return {
      checkForUpdates: async () => available('Selected notes'),
      downloadUpdate: async () => {
        downloads += 1
        return { sizeBytes: 19 }
      },
    }
  })
  assert.equal((await service.download('0.1.0')).status, 'idle')
  assert.equal(factories, 0)
  await service.check()
  for (const version of ['0.2.0', current, '/private/file', '']) {
    assert.equal((await service.download(version)).status, 'available')
  }
  assert.equal(downloads, 0)
  const result = await service.download('0.1.0')
  assert.deepEqual(result, {
    availableVersion: '0.1.0',
    currentVersion: current,
    downloadedBytes: 19,
    notesTruncated: false,
    releaseNotes: 'Selected notes',
    status: 'downloaded',
    totalBytes: 19,
  })
  assert.equal(isApplicationUpdateSnapshot(result), true)
  assert.equal(downloads, 1)
})

test('unconfigured download never creates the native updater or changes unavailable state', async () => {
  const service = new ApplicationUpdateService(current, false, () => {
    throw new Error('must not construct')
  })
  assert.equal((await service.download('0.1.0')).status, 'unavailable')
})

test('a new check immediately retires native old-available metadata, including no-update and failed checks', async () => {
  let result: Promise<ApplicationUpdateCheckResult> = Promise.resolve(available())
  let downloads = 0
  const service = new ApplicationUpdateService(current, true, () => ({
    checkForUpdates: () => result,
    downloadUpdate: async () => {
      downloads += 1
      return { sizeBytes: 9 }
    },
  }))
  await service.check()
  const complete = deferred<ApplicationUpdateCheckResult>()
  result = complete.promise
  const check = service.check()
  assert.equal((await service.download('0.1.0')).status, 'checking')
  assert.equal(downloads, 0)
  complete.resolve({ isUpdateAvailable: false, updateInfo: { version: current } })
  assert.equal((await check).status, 'up-to-date')
  assert.equal((await service.download('0.1.0')).status, 'up-to-date')
  assert.equal(downloads, 0)

  result = Promise.resolve(available())
  await service.check()
  result = Promise.reject(new Error('private metadata network failure'))
  assert.equal((await service.check()).status, 'error')
  assert.equal((await service.download('0.1.0')).status, 'error')
  assert.equal(downloads, 0)
})

test('a newer available check requires its own version and never downloads a stale selected release', async () => {
  let version = '0.1.0'
  let downloads = 0
  const service = new ApplicationUpdateService(current, true, () => ({
    checkForUpdates: async () => ({ isUpdateAvailable: true, updateInfo: { version } }),
    downloadUpdate: async () => {
      downloads += 1
      return { sizeBytes: 10 }
    },
  }))
  await service.check()
  version = '0.2.0'
  await service.check()
  const stale = await service.download('0.1.0')
  assert.equal(stale.availableVersion, '0.2.0')
  assert.equal(stale.status, 'available')
  assert.equal(downloads, 0)
  assert.equal((await service.download('0.2.0')).status, 'downloaded')
  assert.equal(downloads, 1)
})

test('held downloads coalesce copied final results and block metadata changes without hiding progress', async () => {
  const entered = deferred<void>()
  const complete = deferred<{ sizeBytes: number }>()
  let checks = 0
  let downloads = 0
  const service = new ApplicationUpdateService(current, true, () => ({
    checkForUpdates: async () => {
      checks += 1
      return available('Stable notes')
    },
    downloadUpdate: (onProgress) => {
      downloads += 1
      onProgress({ downloadedBytes: 12, totalBytes: 30 })
      entered.resolve()
      return complete.promise
    },
  }))
  await service.check()
  const one = service.download('0.1.0')
  await entered.promise
  const two = service.download('0.1.0')
  const wrong = await service.download('0.2.0')
  const currentDownload = await service.check()
  assert.equal(wrong.status, 'downloading')
  assert.equal(currentDownload.status, 'downloading')
  assert.equal(currentDownload.downloadedBytes, 12)
  assert.equal(currentDownload.totalBytes, 30)
  assert.equal(isApplicationUpdateSnapshot(currentDownload), true)
  currentDownload.downloadedBytes = 29
  assert.equal(service.getStatus().downloadedBytes, 12)
  assert.equal(checks, 1)
  assert.equal(downloads, 1)
  complete.resolve({ sizeBytes: 30 })
  const [a, b] = await Promise.all([one, two])
  assert.deepEqual(a, b)
  a.releaseNotes = 'observer edit'
  a.downloadedBytes = 1
  assert.equal(b.releaseNotes, 'Stable notes')
  assert.equal(b.downloadedBytes, 30)
  assert.equal(service.getStatus().releaseNotes, 'Stable notes')
  assert.equal(service.getStatus().downloadedBytes, 30)
})

test('invalid or retired native progress cannot replace a later check or another download', async () => {
  let report!: (progress: { downloadedBytes: number; totalBytes: number }) => void
  let complete = deferred<{ sizeBytes: number }>()
  const entered = deferred<void>()
  const service = new ApplicationUpdateService(current, true, () => ({
    checkForUpdates: async () => available(),
    downloadUpdate: (onProgress) => {
      report = onProgress
      entered.resolve()
      return complete.promise
    },
  }))
  await service.check()
  const first = service.download('0.1.0')
  await entered.promise
  report({ downloadedBytes: 1, totalBytes: 10 })
  for (const p of [
    { downloadedBytes: -1, totalBytes: 10 },
    { downloadedBytes: 11, totalBytes: 10 },
    { downloadedBytes: 1, totalBytes: 0 },
    { downloadedBytes: 0.5, totalBytes: 10 },
    { downloadedBytes: Number.NaN, totalBytes: 10 },
    { downloadedBytes: 1, totalBytes: Number.POSITIVE_INFINITY },
    { downloadedBytes: 1, totalBytes: Number.MAX_SAFE_INTEGER + 1 },
  ]) {
    report(p)
    assert.equal(service.getStatus().downloadedBytes, 1)
    assert.equal(service.getStatus().totalBytes, 10)
  }
  const oldReport = report
  complete.resolve({ sizeBytes: 10 })
  await first
  oldReport({ downloadedBytes: 9, totalBytes: 10 })
  assert.equal(service.getStatus().status, 'downloaded')
  assert.equal(service.getStatus().downloadedBytes, 10)
  await service.check()
  oldReport({ downloadedBytes: 8, totalBytes: 10 })
  assert.equal(service.getStatus().status, 'available')
  assert.equal(service.getStatus().downloadedBytes, null)

  complete = deferred<{ sizeBytes: number }>()
  const second = service.download('0.1.0')
  await Promise.resolve()
  oldReport({ downloadedBytes: 7, totalBytes: 10 })
  assert.equal(service.getStatus().downloadedBytes, null)
  complete.resolve({ sizeBytes: 11 })
  assert.equal((await second).downloadedBytes, 11)
})

test('a synchronous download failure returns a private bounded retryable outcome with selected notes', async () => {
  let attempts = 0
  const service = new ApplicationUpdateService(current, true, () => ({
    checkForUpdates: async () => available('Release notes'),
    downloadUpdate: () => {
      if (++attempts === 1) {
        throw new Error('https://private.invalid/token /private/cache')
      }
      return Promise.resolve({ sizeBytes: 15 })
    },
  }))
  await service.check()
  const failed = await service.download('0.1.0')
  assert.equal(failed.status, 'download-error')
  assert.equal(failed.releaseNotes, 'Release notes')
  assert.equal(failed.availableVersion, '0.1.0')
  assert.equal(failed.downloadedBytes, null)
  assert.equal(failed.totalBytes, null)
  assert.equal(JSON.stringify(failed).includes('private'), false)
  assert.equal(isApplicationUpdateSnapshot(failed), true)
  assert.equal((await service.download('0.1.0')).status, 'downloaded')
  assert.equal(attempts, 2)
})

test('every downloaded-state action invokes native final verification again instead of trusting an old snapshot', async () => {
  let attempts = 0
  const service = new ApplicationUpdateService(current, true, () => ({
    checkForUpdates: async () => available(),
    downloadUpdate: async () => {
      attempts += 1
      if (attempts === 2) {
        throw new Error('cached file changed')
      }
      return { sizeBytes: 21 }
    },
  }))
  await service.check()
  assert.equal((await service.download('0.1.0')).status, 'downloaded')
  assert.equal((await service.download('0.1.0')).status, 'download-error')
  assert.equal((await service.download('0.1.0')).status, 'downloaded')
  assert.equal(attempts, 3)
})

test('missing native capability and invalid verified-size receipts never advertise downloaded state', async (t) => {
  for (const sizeBytes of [
    0,
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    await t.test(String(sizeBytes), async () => {
      const service = new ApplicationUpdateService(current, true, () => ({
        checkForUpdates: async () => available(),
        downloadUpdate: async () => ({ sizeBytes }),
      }))
      await service.check()
      const result = await service.download('0.1.0')
      assert.equal(result.status, 'download-error')
      assert.equal(result.downloadedBytes, null)
      assert.equal(result.totalBytes, null)
    })
  }
  const service = new ApplicationUpdateService(current, true, () => ({
    checkForUpdates: async () => available(),
  }))
  await service.check()
  assert.equal((await service.download('0.1.0')).status, 'download-error')
})
