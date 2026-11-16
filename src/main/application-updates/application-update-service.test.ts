import {
  APPLICATION_UPDATE_NOTES_MAX_LENGTH,
  isApplicationUpdateSnapshot,
} from '../../shared/application-updates.js'

import type { AppUpdater } from 'electron-updater'

import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import type { ApplicationUpdateCurrentSource } from './application-update-staging.js'
import type { VerifiedApplicationArtifact } from './electron-update-checker.js'

import {
  type ApplicationUpdateCheckResult,
  ApplicationUpdateCurrentSourceError,
  ApplicationUpdateRecoveryRequiredError,
  ApplicationUpdateService,
} from './application-update-service.js'
import { createElectronUpdateChecker } from './electron-update-checker.js'

const current = '0.1.0-dev.1'
const available = (releaseNotes?: ApplicationUpdateCheckResult['updateInfo']['releaseNotes']) => ({
  isUpdateAvailable: true,
  updateInfo: { releaseNotes, version: '0.1.0' },
})

/** Native verifier is a controlled service port here; native crypto/filesystem have their own tests. */
function artifact(
  verifyCompleteSnapshot: () => Promise<void> = async () => {},
): VerifiedApplicationArtifact {
  return {
    authority: { envelope: 'controlled-service-envelope', releaseNotesJson: 'null' },
    manifest: {
      appId: 'studio.imagegen.desktop',
      artifact: {
        filename: 'release.AppImage',
        sha512: Buffer.alloc(64).toString('base64'),
        sizeBytes: 19,
      },
      compatibility: {
        cpuWorkerProtocolVersion: '1',
        databaseMigrations: [],
        inferenceWorkerProtocolVersion: '1',
        projectSchemaVersion: 1,
        runtimeValidation: 'after-restart',
      },
      releaseId: 'service-port',
      releaseNotesSha256: '0'.repeat(64),
      schemaVersion: 1,
      scope: 'application-release',
      target: { arch: 'x64', format: 'AppImage', os: 'linux' },
      version: '0.1.0',
    },
    path: '/private/owned-cache/release.AppImage',
    verifyCompleteSnapshot,
  }
}

/** Controlled consistency port; real descriptor/byte behavior is exercised by staging tests. */
async function sourcePort(t: { after: (fn: () => Promise<void>) => void }) {
  const directory = await mkdtemp(path.join(tmpdir(), 'igs-current-source-service-'))
  t.after(() => rm(directory, { force: true, recursive: true }))
  const currentAppImage = path.join(directory, 'Current.AppImage')
  const state = { assertions: 0, fail: false, verifications: 0 }
  const source: ApplicationUpdateCurrentSource = Object.freeze({
    assertCurrentSnapshot: () => {
      state.assertions++
      if (state.fail) {
        throw new Error('/private/current-source changed')
      }
    },
    currentAppImage,
    currentImage: Object.freeze({
      identity: Object.freeze({
        ctimeNs: '0',
        dev: '1',
        gid: '0',
        ino: '1',
        mode: '33261',
        mtimeNs: '0',
        nlink: '1',
        sizeBytes: 19,
        uid: '0',
      }),
      sha512: Buffer.alloc(64).toString('base64'),
      sizeBytes: 19,
    }),
    dispose: () => {},
    // Controlled v1 fixture; no native runtime authentication is claimed.
    runtimeFiles: Object.freeze({
      archive: Object.freeze({ sha512: Buffer.alloc(64).toString('base64'), sizeBytes: 1 }),
      executable: Object.freeze({ sha512: Buffer.alloc(64).toString('base64'), sizeBytes: 1 }),
    }),
    verifyCompleteSnapshot: async () => {
      state.verifications++
      if (state.fail) {
        throw new Error('/private/current-source changed')
      }
    },
  })
  return { currentAppImage, source, state }
}

const emptyImpact = () => ({
  activeModelInstallCount: 0,
  generationStorageUnavailable: false,
  openProjectCount: 0,
  preparingModelInstallCount: 0,
  resourceRemovalActive: false,
  unacceptedResultCount: 0,
  unfinishedJobCount: 0,
  unsavedProjectCount: 0,
})

for (const fault of ['missing', 'changed'] as const) {
  test(`${fault} current source refuses Review/preflight before candidate or impact reads without retiring downloaded B`, async (t) => {
    const f = await sourcePort(t)
    let candidateReads = 0
    let impacts = 0
    const receipt = artifact(async () => {
      candidateReads++
    })
    const service = new ApplicationUpdateService(
      current,
      true,
      () => ({
        checkForUpdates: async () => ({ ...available(), verification: 'signed-release' }),
        downloadUpdate: async () => ({ sizeBytes: 19, verifiedArtifact: receipt }),
      }),
      f.currentAppImage,
      () => {},
      async () => {
        impacts++
        return emptyImpact()
      },
      () => true,
      { status: 'none' },
      fault === 'missing' ? null : f.source,
    )
    await service.check()
    assert.equal((await service.download('0.1.0')).status, 'downloaded')
    assert.equal(candidateReads, 1)
    f.state.fail = true
    for (const action of [
      () => service.reviewInstallation('0.1.0'),
      () => service.prepareInstallation('0.1.0'),
    ]) {
      await assert.rejects(action, ApplicationUpdateCurrentSourceError)
    }
    assert.equal(candidateReads, 1)
    assert.equal(impacts, 0)
    assert.equal(service.getStatus().status, 'downloaded')
    assert.equal(await service.prepareVerifiedArtifact('0.1.0'), receipt)
    assert.equal(service.getStatus().status, 'downloaded')
    assert.throws(() => service.assertCurrentSourceSnapshot(), ApplicationUpdateCurrentSourceError)
  })
}

for (const boundary of ['candidate-await', 'impact-await'] as const) {
  test(`source changes during ${boundary} refuse before close and preserve healthy candidate authority`, async (t) => {
    const f = await sourcePort(t)
    let candidateReads = 0
    let impacts = 0
    const receipt = artifact(async () => {
      if (++candidateReads === 2 && boundary === 'candidate-await') {
        f.state.fail = true
      }
    })
    const service = new ApplicationUpdateService(
      current,
      true,
      () => ({
        checkForUpdates: async () => ({ ...available(), verification: 'signed-release' }),
        downloadUpdate: async () => ({ sizeBytes: 19, verifiedArtifact: receipt }),
      }),
      f.currentAppImage,
      () => {},
      async () => {
        impacts++
        f.state.fail = true
        return emptyImpact()
      },
      () => true,
      { status: 'none' },
      f.source,
    )
    await service.check()
    await service.download('0.1.0')
    await assert.rejects(service.reviewInstallation('0.1.0'), ApplicationUpdateCurrentSourceError)
    assert.equal(impacts, boundary === 'candidate-await' ? 0 : 1)
    assert.equal(service.getStatus().status, 'downloaded')
    assert.equal(await service.prepareVerifiedArtifact('0.1.0'), receipt)
    assert.equal(service.getStatus().status, 'downloaded')
  })
}

test('stable current-source capability remains the same through Review and preflight', async (t) => {
  const f = await sourcePort(t)
  const receipt = artifact()
  let closeChecks = 0
  const service = new ApplicationUpdateService(
    current,
    true,
    () => ({
      checkForUpdates: async () => ({ ...available(), verification: 'signed-release' }),
      downloadUpdate: async () => ({ sizeBytes: 19, verifiedArtifact: receipt }),
    }),
    f.currentAppImage,
    () => {
      closeChecks++
    },
    async () => emptyImpact(),
    () => true,
    { status: 'none' },
    f.source,
  )
  await service.check()
  await service.download('0.1.0')
  assert.equal((await service.reviewInstallation('0.1.0')).installationAvailable, true)
  assert.equal(await service.prepareInstallation('0.1.0'), receipt)
  service.assertCurrentSourceSnapshot()
  assert.ok(f.state.verifications >= 6)
  assert.equal(closeChecks, 0)
})

test('preflight rechecks current sources after awaiting the healthy candidate verifier', async (t) => {
  const f = await sourcePort(t)
  let candidateReads = 0
  const receipt = artifact(async () => {
    if (++candidateReads === 2) {
      f.state.fail = true
    }
  })
  const service = new ApplicationUpdateService(
    current,
    true,
    () => ({
      checkForUpdates: async () => ({ ...available(), verification: 'signed-release' }),
      downloadUpdate: async () => ({ sizeBytes: 19, verifiedArtifact: receipt }),
    }),
    f.currentAppImage,
    () => {},
    async () => emptyImpact(),
    () => true,
    { status: 'none' },
    f.source,
  )
  await service.check()
  await service.download('0.1.0')
  await assert.rejects(service.prepareInstallation('0.1.0'), ApplicationUpdateCurrentSourceError)
  assert.equal(service.getStatus().status, 'downloaded')
  assert.equal(await service.prepareVerifiedArtifact('0.1.0'), receipt)
})

test('the final current-source assertion rejects an accidentally asynchronous port', async (t) => {
  const f = await sourcePort(t)
  const source: ApplicationUpdateCurrentSource = Object.freeze({
    ...f.source,
    assertCurrentSnapshot: async () => {},
  })
  const service = new ApplicationUpdateService(
    current,
    false,
    () => ({ checkForUpdates: async () => available() }),
    f.currentAppImage,
    null,
    null,
    null,
    { status: 'none' },
    source,
  )
  assert.throws(() => service.assertCurrentSourceSnapshot(), ApplicationUpdateCurrentSourceError)
  assert.equal(service.getStatus().status, 'unavailable')
})

for (const targetAuthentication of ['verified', 'unverified'] as const) {
  test(`retained ${targetAuthentication} startup refuses Review and preflight before artifact or impact reads`, async () => {
    let verifications = 0
    let impacts = 0
    let closeChecks = 0
    let schedules = 0
    const receipt = artifact(async () => {
      verifications++
    })
    const service = new ApplicationUpdateService(
      current,
      true,
      () => ({
        checkForUpdates: async () => ({ ...available(), verification: 'signed-release' }),
        downloadUpdate: async () => ({ sizeBytes: 19, verifiedArtifact: receipt }),
      }),
      '/private/not-inspected/Current.AppImage',
      () => {
        closeChecks++
      },
      async () => {
        impacts++
        throw new Error('/private/impact must not be reached')
      },
      () => {
        schedules++
      },
      { runtimeAuthentication: 'unverified', status: 'retained', targetAuthentication },
    )
    assert.equal(service.getStatus().status, 'idle')
    assert.equal((await service.check()).status, 'available')
    assert.equal((await service.download('0.1.0')).status, 'downloaded')
    assert.equal(verifications, 1)
    for (const action of [
      () => service.reviewInstallation('0.1.0'),
      () => service.prepareInstallation('0.1.0'),
    ]) {
      await assert.rejects(action, (error: unknown) => {
        assert.ok(error instanceof ApplicationUpdateRecoveryRequiredError)
        assert.equal(error.code, 'APPLICATION_UPDATE_RECOVERY_REQUIRED')
        assert.equal(
          error.message,
          'Application update recovery is required before installation. Your Projects remain open.',
        )
        return true
      })
    }
    assert.equal(verifications, 1)
    assert.equal(impacts, 0)
    assert.equal(closeChecks, 0)
    assert.equal(schedules, 0)
    assert.equal(service.getStatus().status, 'downloaded')
    assert.equal(JSON.stringify(service.getStatus()).includes('private'), false)
  })
}

test('signed native metadata and private artifact project no paths or install capability', async () => {
  let verifications = 0
  const receipt = artifact(async () => {
    verifications++
  })
  const service = new ApplicationUpdateService(current, true, () => ({
    checkForUpdates: async () => ({ ...available('Signed notes'), verification: 'signed-release' }),
    downloadUpdate: async () => ({ sizeBytes: 19, verifiedArtifact: receipt }),
  }))
  await assert.rejects(service.prepareVerifiedArtifact('0.1.0'))
  assert.equal((await service.check()).verification, 'signed-release')
  const snapshot = await service.download('0.1.0')
  assert.equal(snapshot.status, 'downloaded')
  assert.equal(isApplicationUpdateSnapshot(snapshot), true)
  assert.equal(JSON.stringify(snapshot).includes('private'), false)
  assert.equal(Object.hasOwn(snapshot, 'verifiedArtifact'), false)
  assert.equal(await service.prepareVerifiedArtifact('0.1.0'), receipt)
  assert.ok(verifications >= 2)
})

test('metadata-only download cannot acquire private installer handoff even if a native port offers one', async () => {
  const service = new ApplicationUpdateService(current, true, () => ({
    checkForUpdates: async () => available(),
    downloadUpdate: async () => ({ sizeBytes: 19, verifiedArtifact: artifact() }),
  }))
  await service.check()
  assert.equal((await service.download('0.1.0')).verification, 'metadata-only')
  await assert.rejects(service.prepareVerifiedArtifact('0.1.0'))
})

test('signed download refuses a missing private artifact instead of trusting downloaded bytes alone', async () => {
  const service = new ApplicationUpdateService(current, true, () => ({
    checkForUpdates: async () => ({ ...available(), verification: 'signed-release' }),
    downloadUpdate: async () => ({ sizeBytes: 19 }),
  }))
  await service.check()
  assert.equal((await service.download('0.1.0')).status, 'download-error')
  await assert.rejects(service.prepareVerifiedArtifact('0.1.0'))
})

test('new check retires an in-flight private handoff without overwriting its newer public result', async () => {
  const entered = deferred<void>()
  const release = deferred<void>()
  let calls = 0
  let checks = 0
  const receipt = artifact(async () => {
    if (++calls === 2) {
      entered.resolve()
      await release.promise
    }
  })
  const service = new ApplicationUpdateService(current, true, () => ({
    checkForUpdates: async () =>
      ++checks === 1
        ? { ...available(), verification: 'signed-release' }
        : { isUpdateAvailable: false, updateInfo: { version: current } },
    downloadUpdate: async () => ({ sizeBytes: 19, verifiedArtifact: receipt }),
  }))
  await service.check()
  await service.download('0.1.0')
  const handoff = service.prepareVerifiedArtifact('0.1.0')
  await entered.promise
  await service.check()
  release.resolve()
  await assert.rejects(handoff)
  assert.equal(service.getStatus().status, 'up-to-date')
  assert.equal(service.getStatus().verification, null)
})

test('failed private revalidation retires the artifact and requires explicit Download again', async () => {
  let invalid = false
  const receipt = artifact(async () => {
    if (invalid) {
      throw new Error('/private/cache changed')
    }
  })
  const service = new ApplicationUpdateService(current, true, () => ({
    checkForUpdates: async () => ({ ...available(), verification: 'signed-release' }),
    downloadUpdate: async () => ({ sizeBytes: 19, verifiedArtifact: receipt }),
  }))
  await service.check()
  await service.download('0.1.0')
  invalid = true
  await assert.rejects(service.prepareVerifiedArtifact('0.1.0'), /downloaded and verified again/)
  assert.equal(service.getStatus().status, 'download-error')
  assert.equal(JSON.stringify(service.getStatus()).includes('private'), false)
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
    verification: null,
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
    verification: 'metadata-only',
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
