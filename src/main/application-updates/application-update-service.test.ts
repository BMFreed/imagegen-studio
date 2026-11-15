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
    notesTruncated: false,
    releaseNotes: null,
    status: 'up-to-date',
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

test('Invoke adapter disables automatic native actions before check and exposes only checking', async () => {
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
  assert.deepEqual(Object.keys(checker), ['checkForUpdates'])
  assert.ok(errorListener)
  await checker.checkForUpdates()
  assert.equal(checked, true)
})
