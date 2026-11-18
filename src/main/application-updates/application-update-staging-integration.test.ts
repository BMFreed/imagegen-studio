import type { ApplicationUpdateInstallPreview } from '../../shared/application-updates.js'

import { DownloadedUpdateHelper } from 'electron-updater/out/DownloadedUpdateHelper.js'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { once } from 'node:events'
import { lstatSync, readFileSync } from 'node:fs'
import * as fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createInterface } from 'node:readline'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { canonicalRuntimeReleaseJson } from '../runtime/runtime-release.js'
import {
  acquireApplicationUpdateAdmission,
  ApplicationUpdateAdmissionError,
} from './application-update-admission.js'
import {
  ApplicationUpdateCurrentSourceError,
  ApplicationUpdateRecoveryRequiredError,
  ApplicationUpdateService,
} from './application-update-service.js'
import {
  type ApplicationUpdateCurrentSource,
  captureApplicationUpdateCurrentSource,
  inspectRetainedApplicationUpdate,
} from './application-update-staging.js'
import { createElectronUpdateChecker, VerifiedAppImageUpdater } from './electron-update-checker.js'

const sha = (bytes: Buffer) => createHash('sha512').update(bytes).digest('base64')
function image(fill: number): Buffer {
  const bytes = Buffer.alloc(4096, fill)
  bytes.set([0x7f, 69, 76, 70, 2, 1, 1, 0, 65, 73, 2], 0)
  bytes.writeUInt16LE(2, 16)
  bytes.writeUInt16LE(62, 18)
  bytes.writeUInt32LE(1, 20)
  bytes.writeUInt16LE(64, 52)
  return bytes
}

/**
 * Native metadata HTTP and transfer are controlled. Parser/cache/signature/service/FS are real;
 * optional Main close/impact and relaunch callbacks remain controlled where each case supplies
 * them.
 */
async function fixture(
  t: { after: (cleanup: () => Promise<void>) => void },
  signed = true,
  target = true,
  assertApplicationClosed: (() => void) | null = null,
  readInstallImpact:
    | (() => Promise<
        Omit<ApplicationUpdateInstallPreview, 'availableVersion' | 'installationAvailable'>
      >)
    | null = null,
  scheduleApplicationRelaunch: ((currentAppImage: string) => unknown) | null = null,
  sourceAvailable = true,
  release = { current: '0.1.0', from: image(5), next: '0.2.0', to: image(7) },
) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'igs-staging-consumer-'))
  const sources: Pick<ApplicationUpdateCurrentSource, 'dispose'>[] = []
  const sourceHandles: fs.FileHandle[] = []
  t.after(async () => {
    for (const source of sources) {
      source.dispose()
    }
    for (const handle of sourceHandles) {
      await handle.close()
    }
    await fs.rm(root, { force: true, recursive: true })
  })
  const parent = path.join(root, 'Applications')
  await fs.mkdir(parent, { mode: 0o700 })
  const currentAppImage = path.join(parent, 'Current.AppImage')
  await fs.writeFile(currentAppImage, release.from, { mode: 0o755 })
  await fs.chmod(currentAppImage, 0o755)
  const archivePath = path.join(root, 'owned-app.asar')
  const executablePath = path.join(root, 'owned-electron')
  await fs.writeFile(archivePath, image(11), { mode: 0o600 })
  await fs.writeFile(executablePath, image(13), { mode: 0o755 })
  const archive = await fs.open(archivePath, 'r')
  sourceHandles.push(archive)
  const executable = await fs.open(executablePath, 'r')
  sourceHandles.push(executable)
  const captureCurrentSource = async () => {
    const captured = captureApplicationUpdateCurrentSource({
      archiveFd: archive.fd,
      archivePath,
      currentAppImage,
      executableFd: executable.fd,
      executablePath,
    })
    assert.ok(captured)
    sources.push(captured)
    return await captured.complete()
  }
  const currentSource = await captureCurrentSource()
  const body = release.to
  const notes = 'Owned integration declaration.'
  const pair = generateKeyPairSync('ed25519')
  const trust = {
    compatibility: {
      cpuWorkerProtocolVersion: '1',
      databaseMigrations: [],
      inferenceWorkerProtocolVersion: '1',
      projectSchemaVersion: 1,
    },
    trustedKeys: { owned: pair.publicKey.export({ format: 'pem', type: 'spki' }).toString() },
  }
  const manifest = {
    appId: 'studio.imagegen.desktop',
    artifact: { filename: 'next.AppImage', sha512: sha(body), sizeBytes: body.length },
    compatibility: { ...trust.compatibility, runtimeValidation: 'after-restart' },
    releaseId: 'owned-stage-consumer',
    releaseNotesSha256: createHash('sha256')
      .update(canonicalRuntimeReleaseJson(notes))
      .digest('hex'),
    schemaVersion: 1,
    scope: 'application-release',
    target: { arch: 'x64', format: 'AppImage', os: 'linux' },
    version: release.next,
  }
  const payload = canonicalRuntimeReleaseJson(manifest)
  const envelope = canonicalRuntimeReleaseJson({
    keyId: 'owned',
    payload: payload.toString('base64'),
    schemaVersion: 1,
    signature: sign(null, payload, pair.privateKey).toString('base64'),
  }).toString()
  const info = {
    files: [{ sha512: sha(body), size: body.length, url: 'next.AppImage' }],
    imagegenStudioRelease: envelope,
    releaseDate: '2026-11-16T00:00:00Z',
    releaseNotes: notes,
    version: release.next,
  }
  class Updater extends VerifiedAppImageUpdater {
    readonly helper = new DownloadedUpdateHelper(path.join(root, 'cache'))
    metadataRequests = 0
    transfers = 0
    constructor() {
      super(
        null,
        {
          baseCachePath: root,
          isPackaged: true,
          name: 'owned-stage-consumer',
          userDataPath: root,
          version: release.current,
          whenReady: async () => undefined,
        },
        signed ? trust : null,
      )
      this.downloadedUpdateHelper = this.helper
      Reflect.set(this, 'httpExecutor', {
        request: async () => {
          this.metadataRequests++
          return JSON.stringify(info)
        },
      })
      this.setFeedURL({ provider: 'generic', url: 'https://updates.invalid/' })
    }
    override async downloadUpdate() {
      this.transfers++
      const source = this.updateInfoAndProvider!
      const selected = source.provider.resolveFiles(source.info)[0]
      const filename = path.join(this.helper.cacheDirForPendingUpdate, 'next.AppImage')
      await fs.mkdir(this.helper.cacheDirForPendingUpdate, { recursive: true })
      await fs.writeFile(filename, body, { mode: 0o600 })
      await this.helper.setDownloadedFile(
        filename,
        null,
        source.info,
        selected,
        'next.AppImage',
        true,
      )
      return [filename]
    }
    override isUpdaterActive() {
      return true
    }
  }
  const updater = new Updater()
  const service = new ApplicationUpdateService(
    release.current,
    true,
    () => createElectronUpdateChecker(updater),
    target ? currentAppImage : null,
    assertApplicationClosed,
    readInstallImpact,
    scheduleApplicationRelaunch,
    { status: 'none' },
    sourceAvailable ? currentSource : null,
  )
  return {
    archivePath,
    body,
    captureCurrentSource,
    currentAppImage,
    currentSource,
    executablePath,
    parent,
    root,
    service,
    trust,
    updater,
  }
}

async function identity(filename: string) {
  const s = await fs.lstat(filename, { bigint: true })
  return {
    ctime: s.ctimeNs,
    dev: s.dev,
    ino: s.ino,
    mode: s.mode,
    mtime: s.mtimeNs,
    sha512: sha(await fs.readFile(filename)),
    size: s.size,
  }
}

for (const source of ['current', 'archive', 'executable'] as const) {
  for (const change of ['bytes', 'same-byte-inode'] as const) {
    test(`${source}/${change} refuses public Review/preflight before native cache or impact reads`, async (t) => {
      let impacts = 0
      let closes = 0
      let scheduled = 0
      const f = await fixture(
        t,
        true,
        true,
        () => {
          closes++
        },
        async () => {
          impacts++
          return installImpact()
        },
        () => {
          scheduled++
          return true
        },
      )
      await f.service.check()
      await f.service.download('0.2.0')
      const receipt = await f.service.prepareVerifiedArtifact('0.2.0')
      const filename =
        source === 'current'
          ? f.currentAppImage
          : source === 'archive'
            ? f.archivePath
            : f.executablePath
      const bytes = await fs.readFile(filename)
      if (change === 'same-byte-inode') {
        await fs.rename(filename, path.join(f.root, `retained-${source}`))
        await fs.writeFile(filename, bytes, { mode: source === 'archive' ? 0o600 : 0o755 })
      } else {
        bytes[100] ^= 1
        await fs.writeFile(filename, bytes)
      }
      const changed = await identity(filename)
      // If the later native verifier were reached, this would retire B as download-error.
      await fs.writeFile(receipt.path, Buffer.alloc(f.body.length))
      for (const action of [
        () => f.service.reviewInstallation('0.2.0'),
        () => f.service.prepareInstallation('0.2.0'),
      ]) {
        await assert.rejects(action, ApplicationUpdateCurrentSourceError)
      }
      assert.equal(f.service.getStatus().status, 'downloaded')
      assert.equal(impacts, 0)
      assert.equal(closes, 0)
      assert.equal(scheduled, 0)
      assert.equal(f.updater.transfers, 1)
      assert.deepEqual(await fs.readdir(f.parent), ['Current.AppImage'])
      assert.deepEqual(await identity(filename), changed)
    })
  }
}

test('a source change during actual impact review refuses without retiring a healthy downloaded candidate', async (t) => {
  let impacts = 0
  const f = await fixture(
    t,
    true,
    true,
    () => {},
    async () => {
      impacts++
      const bytes = await fs.readFile(f.archivePath)
      bytes[100] ^= 1
      await fs.writeFile(f.archivePath, bytes)
      return installImpact()
    },
    () => true,
  )
  await f.service.check()
  await f.service.download('0.2.0')
  const receipt = await f.service.prepareVerifiedArtifact('0.2.0')
  const candidate = await identity(receipt.path)
  await assert.rejects(f.service.reviewInstallation('0.2.0'), ApplicationUpdateCurrentSourceError)
  assert.equal(impacts, 1)
  assert.equal(f.service.getStatus().status, 'downloaded')
  assert.equal(await f.service.prepareVerifiedArtifact('0.2.0'), receipt)
  assert.deepEqual(await identity(receipt.path), candidate)
  assert.deepEqual(await fs.readdir(f.parent), ['Current.AppImage'])
})

test('postclose source refusal retains the target without claiming Projects remain open', async (t) => {
  let scheduled = 0
  const f = await fixture(
    t,
    true,
    true,
    () => {},
    null,
    () => {
      scheduled++
      return true
    },
  )
  await f.service.check()
  await f.service.download('0.2.0')
  const receipt = await f.service.prepareInstallation('0.2.0')
  const original = await fs.readFile(f.currentAppImage)
  await fs.rename(f.currentAppImage, path.join(f.root, 'retained-current'))
  await fs.writeFile(f.currentAppImage, original, { mode: 0o755 })
  const replacement = await identity(f.currentAppImage)
  await assert.rejects(f.service.installAfterClose('0.2.0', receipt), (error: unknown) => {
    assert.ok(error instanceof Error)
    assert.equal(error instanceof ApplicationUpdateCurrentSourceError, false)
    assert.equal(error.message.includes('Projects remain open'), false)
    return true
  })
  assert.equal(scheduled, 0)
  assert.deepEqual(await identity(f.currentAppImage), replacement)
  assert.deepEqual(await fs.readdir(f.parent), ['Current.AppImage'])
  assert.equal(f.service.getStatus().status, 'downloaded')
})

test('missing current-source capability cannot bypass private staging or public eligibility', async (t) => {
  const f = await fixture(
    t,
    true,
    true,
    () => {},
    async () => installImpact(),
    () => true,
    false,
  )
  await f.service.check()
  await f.service.download('0.2.0')
  await assert.rejects(f.service.prepareInstallation('0.2.0'), ApplicationUpdateCurrentSourceError)
  await assert.rejects(f.service.reviewInstallation('0.2.0'), ApplicationUpdateCurrentSourceError)
  for (const action of [
    () => f.service.stageForInstallation('0.2.0'),
    () => f.service.installAfterClose('0.2.0'),
  ]) {
    await assert.rejects(action, (error: unknown) => {
      assert.ok(error instanceof Error)
      assert.equal(error.message.includes('Projects remain open'), false)
      return true
    })
  }
  assert.equal(f.service.getStatus().status, 'downloaded')
  assert.deepEqual(await fs.readdir(f.parent), ['Current.AppImage'])
})

test('signed native parser/cache artifact enters explicit service staging; Download never stages implicitly', async (t) => {
  const f = await fixture(t)
  assert.equal((await f.service.check()).verification, 'signed-release')
  assert.equal((await f.service.download('0.2.0')).status, 'downloaded')
  assert.deepEqual(await fs.readdir(f.parent), ['Current.AppImage'])
  const receipt = await f.service.prepareVerifiedArtifact('0.2.0')
  const cache = await identity(receipt.path)
  const old = await identity(f.currentAppImage)
  const publicBefore = f.service.getStatus()
  const plan = await f.service.stageForInstallation('0.2.0')
  await plan.verifyCompleteSnapshot()
  assert.ok((await fs.readFile(plan.candidatePath)).equals(f.body))
  assert.notEqual((await fs.lstat(plan.candidatePath, { bigint: true })).ino, cache.ino)
  assert.deepEqual(await identity(f.currentAppImage), old)
  assert.deepEqual(await identity(receipt.path), cache)
  assert.deepEqual(f.service.getStatus(), publicBefore)
  assert.equal(f.updater.metadataRequests, 1)
  assert.equal(f.updater.transfers, 1)
  assert.equal(JSON.stringify(publicBefore).includes(f.root), false)
})

for (const lane of ['metadata-only', 'missing-current-path'] as const) {
  test(`${lane} never grants service staging or creates a target sibling`, async (t) => {
    const f = await fixture(t, lane !== 'metadata-only', lane !== 'missing-current-path')
    await f.service.check()
    await f.service.download('0.2.0')
    await assert.rejects(f.service.stageForInstallation('0.2.0'))
    assert.deepEqual(await fs.readdir(f.parent), ['Current.AppImage'])
  })
}

test('a new Check retires a staged service capability but preserves all staged and original bytes', async (t) => {
  const f = await fixture(t)
  await f.service.check()
  await f.service.download('0.2.0')
  const plan = await f.service.stageForInstallation('0.2.0')
  const old = await identity(f.currentAppImage)
  const staged = await identity(plan.candidatePath)
  await f.service.check()
  await assert.rejects(plan.verifyCompleteSnapshot())
  assert.deepEqual(await identity(f.currentAppImage), old)
  assert.deepEqual(await identity(plan.candidatePath), staged)
})

test('service activation requires its captured Main close barrier and rollback survives a new Check', async (t) => {
  let closed = false
  const f = await fixture(t, true, true, () => {
    assert.ok(closed, 'Main close barrier incomplete')
  })
  await f.service.check()
  await f.service.download('0.2.0')
  const artifact = await f.service.prepareVerifiedArtifact('0.2.0')
  const original = await fs.readFile(f.currentAppImage)
  const originalIdentity = await identity(f.currentAppImage)
  const cached = await identity(artifact.path)
  const staged = await f.service.stageForInstallation('0.2.0')
  const backup = await staged.prepareBackup()
  await assert.rejects(
    Reflect.apply(backup.activate, backup, [() => undefined]),
    /Close application resources/,
  )
  assert.deepEqual(await identity(f.currentAppImage), originalIdentity)
  await backup.verifyCompleteSnapshot()
  closed = true
  const active = await backup.activate()
  assert.ok((await fs.readFile(f.currentAppImage)).equals(f.body))
  assert.deepEqual(await identity(artifact.path), cached)
  await f.service.check()
  await active.verifyCompleteSnapshot()
  const restored = await active.rollback()
  await restored.verifyCompleteSnapshot()
  assert.ok((await fs.readFile(f.currentAppImage)).equals(original))
  assert.notEqual((await identity(f.currentAppImage)).ino, originalIdentity.ino)
  assert.deepEqual(await identity(artifact.path), cached)
})

test('service cannot activate without a Main close assertion even with a valid signed backup', async (t) => {
  const f = await fixture(t)
  await f.service.check()
  await f.service.download('0.2.0')
  const staged = await f.service.stageForInstallation('0.2.0')
  const backup = await staged.prepareBackup()
  const old = await identity(f.currentAppImage)
  const candidate = await identity(backup.candidatePath)
  await assert.rejects(backup.activate(), /unavailable/i)
  await backup.verifyCompleteSnapshot()
  assert.deepEqual(await identity(f.currentAppImage), old)
  assert.deepEqual(await identity(backup.candidatePath), candidate)
})

const installImpact = (): Omit<
  ApplicationUpdateInstallPreview,
  'availableVersion' | 'installationAvailable'
> => ({
  activeModelInstallCount: 2,
  generationStorageUnavailable: false,
  openProjectCount: 3,
  preparingModelInstallCount: 1,
  resourceRemovalActive: true,
  unacceptedResultCount: 4,
  unfinishedJobCount: 5,
  unsavedProjectCount: 2,
})

/**
 * Fresh Invoke4875d965: status_counts/_status_counts -> get_queue_status service/router callers.
 * This boundary joins the real native signed artifact to a controlled Main impact collector.
 * Collector SQLite/staging behavior is qualified separately; it is not replaced with a pretend
 * database here. No claim of Electron renderer, network or public installation qualification.
 */
test('signed native downloaded artifact grants repeatable impact review without staging or close', async (t) => {
  let impactCalls = 0
  let closeCalls = 0
  const controlledImpact = installImpact()
  const f = await fixture(
    t,
    true,
    true,
    () => {
      closeCalls++
    },
    async () => {
      impactCalls++
      return controlledImpact
    },
  )
  await f.service.check()
  await f.service.download('0.2.0')
  const artifact = await f.service.prepareVerifiedArtifact('0.2.0')
  const before = {
    current: await identity(f.currentAppImage),
    directory: await fs.readdir(f.parent),
    public: f.service.getStatus(),
    source: await identity(artifact.path),
  }
  const first = await f.service.reviewInstallation('0.2.0')
  const second = await f.service.reviewInstallation('0.2.0')
  assert.deepEqual(first, {
    ...controlledImpact,
    availableVersion: '0.2.0',
    installationAvailable: false,
  })
  assert.deepEqual(second, first)
  assert.notEqual(first, second)
  assert.deepEqual(
    {
      current: await identity(f.currentAppImage),
      directory: await fs.readdir(f.parent),
      public: f.service.getStatus(),
      source: await identity(artifact.path),
    },
    before,
  )
  assert.equal(impactCalls, 2)
  assert.equal(closeCalls, 0)
  assert.equal(f.updater.metadataRequests, 1)
  assert.equal(f.updater.transfers, 1)
  assert.equal(JSON.stringify(first).includes(f.root), false)
})

for (const lane of [
  'metadata-only',
  'not-downloaded',
  'wrong-version',
  'missing-collector',
] as const) {
  test(`${lane} cannot inspect Main impact or prepare an installation`, async (t) => {
    let impactCalls = 0
    let closeCalls = 0
    const f = await fixture(
      t,
      lane !== 'metadata-only',
      true,
      () => {
        closeCalls++
      },
      lane === 'missing-collector'
        ? null
        : async () => {
            impactCalls++
            return installImpact()
          },
    )
    await f.service.check()
    if (lane !== 'not-downloaded') {
      await f.service.download('0.2.0')
    }
    const old = await identity(f.currentAppImage)
    await assert.rejects(f.service.reviewInstallation(lane === 'wrong-version' ? '0.3.0' : '0.2.0'))
    assert.deepEqual(await fs.readdir(f.parent), ['Current.AppImage'])
    assert.deepEqual(await identity(f.currentAppImage), old)
    assert.equal(impactCalls, 0)
    assert.equal(closeCalls, 0)
  })
}

test('new Check during impact inspection retires its preview without close or sibling publication', async (t) => {
  let enter!: () => void
  const entered = new Promise<void>((resolve) => {
    enter = resolve
  })
  let release!: (value: ReturnType<typeof installImpact>) => void
  const held = new Promise<ReturnType<typeof installImpact>>((resolve) => {
    release = resolve
  })
  let closeCalls = 0
  const f = await fixture(
    t,
    true,
    true,
    () => {
      closeCalls++
    },
    async () => {
      enter()
      return await held
    },
  )
  await f.service.check()
  await f.service.download('0.2.0')
  const artifact = await f.service.prepareVerifiedArtifact('0.2.0')
  const before = {
    current: await identity(f.currentAppImage),
    source: await identity(artifact.path),
  }
  const pending = f.service.reviewInstallation('0.2.0')
  void pending.catch(() => undefined)
  try {
    await Promise.race([
      entered,
      pending.then(() => {
        throw new Error('Preview completed before entering its held collector')
      }),
    ])
    await f.service.check()
  } finally {
    release(installImpact())
  }
  await assert.rejects(pending)
  assert.deepEqual(
    { current: await identity(f.currentAppImage), source: await identity(artifact.path) },
    before,
  )
  assert.deepEqual(await fs.readdir(f.parent), ['Current.AppImage'])
  assert.equal(closeCalls, 0)
})

test('changed native cache bytes refuse impact review before the collector runs', async (t) => {
  let impactCalls = 0
  const f = await fixture(t, true, true, null, async () => {
    impactCalls++
    return installImpact()
  })
  await f.service.check()
  await f.service.download('0.2.0')
  const artifact = await f.service.prepareVerifiedArtifact('0.2.0')
  const original = await identity(f.currentAppImage)
  const handle = await fs.open(artifact.path, 'r+')
  try {
    await handle.write(Buffer.from([42]), 0, 1, 100)
    await handle.sync()
  } finally {
    await handle.close()
  }
  await assert.rejects(f.service.reviewInstallation('0.2.0'))
  assert.equal(impactCalls, 0)
  assert.deepEqual(await identity(f.currentAppImage), original)
  assert.deepEqual(await fs.readdir(f.parent), ['Current.AppImage'])
})

/**
 * Actual native provider/parser/signature/cache/service/transaction; metadata HTTP, transfer,
 * finalized-close assertion and helper scheduling are controlled ports. Nothing is executed or
 * quit. A true scheduler result proves only the observed private handoff, not native app startup.
 */
test('private install after close joins the signed native cache to backup activation and one exact-path handoff', async (t) => {
  let closeChecks = 0
  const scheduled: string[] = []
  const f = await fixture(
    t,
    true,
    true,
    () => {
      closeChecks++
    },
    null,
    (target) => {
      scheduled.push(target)
      assert.equal(target, f.currentAppImage)
      assert.equal(lstatSync(target).mode & 0o7777, 0o755)
      assert.ok(readFileSync(target).equals(f.body))
      return true
    },
  )
  await f.service.check()
  await f.service.download('0.2.0')
  const artifact = await f.service.prepareVerifiedArtifact('0.2.0')
  const cached = await identity(artifact.path)
  const old = await fs.readFile(f.currentAppImage)
  const publicBefore = f.service.getStatus()
  await f.service.installAfterClose('0.2.0')
  assert.deepEqual(scheduled, [f.currentAppImage])
  assert.ok(closeChecks >= 2)
  assert.ok((await fs.readFile(f.currentAppImage)).equals(f.body))
  assert.deepEqual(await identity(artifact.path), cached)
  assert.deepEqual(f.service.getStatus(), publicBefore)
  const siblings = (await fs.readdir(f.parent)).filter((name) => name !== 'Current.AppImage')
  assert.equal(siblings.length, 1)
  const stage = path.join(f.parent, siblings[0])
  assert.ok((await fs.readFile(path.join(stage, 'previous.AppImage'))).equals(old))
  assert.equal((await fs.stat(path.join(stage, 'previous.AppImage'))).mode & 0o7777, 0o600)
  const journal = JSON.parse(await fs.readFile(path.join(stage, 'journal.json'), 'utf8')) as {
    state: string
  }
  assert.equal(journal.state, 'relaunching')
  await assert.rejects(fs.access(path.join(stage, 'failed.json')), { code: 'ENOENT' })
  await assert.rejects(f.service.installAfterClose('0.2.0'))
  assert.deepEqual(scheduled, [f.currentAppImage])
})

for (const lane of [
  'missing-close',
  'rejected-close',
  'async-close',
  'missing-scheduler',
  'metadata-only',
  'wrong-version',
  'not-downloaded',
  'missing-current-path',
] as const) {
  test(`${lane} refuses private install after close before staging or helper scheduling`, async (t) => {
    const scheduled: string[] = []
    const close =
      lane === 'missing-close'
        ? null
        : lane === 'rejected-close'
          ? () => {
              throw new Error('Controlled Main close barrier is not complete.')
            }
          : lane === 'async-close'
            ? () => Promise.resolve()
            : () => undefined
    const f = await fixture(
      t,
      lane !== 'metadata-only',
      lane !== 'missing-current-path',
      close,
      null,
      lane === 'missing-scheduler'
        ? null
        : (target) => {
            scheduled.push(target)
            return true
          },
    )
    await f.service.check()
    if (lane !== 'not-downloaded') {
      await f.service.download('0.2.0')
    }
    const before = await identity(f.currentAppImage)
    await assert.rejects(f.service.installAfterClose(lane === 'wrong-version' ? '0.3.0' : '0.2.0'))
    assert.deepEqual(await identity(f.currentAppImage), before)
    assert.deepEqual(await fs.readdir(f.parent), ['Current.AppImage'])
    assert.deepEqual(scheduled, [])
  })
}

test('a false helper result leaves the actual installed bytes and backup for explicit recovery, without retrying', async (t) => {
  let scheduled = 0
  const f = await fixture(
    t,
    true,
    true,
    () => undefined,
    null,
    () => {
      scheduled++
      return false
    },
  )
  await f.service.check()
  await f.service.download('0.2.0')
  const artifact = await f.service.prepareVerifiedArtifact('0.2.0')
  const cached = await identity(artifact.path)
  const old = await fs.readFile(f.currentAppImage)
  await assert.rejects(f.service.installAfterClose('0.2.0'), (error: unknown) => {
    assert.equal((error as { outcome?: string }).outcome, 'uncertain')
    return true
  })
  assert.equal(scheduled, 1)
  assert.ok((await fs.readFile(f.currentAppImage)).equals(f.body))
  assert.deepEqual(await identity(artifact.path), cached)
  const siblings = (await fs.readdir(f.parent)).filter((name) => name !== 'Current.AppImage')
  assert.equal(siblings.length, 1)
  const stage = path.join(f.parent, siblings[0])
  assert.ok((await fs.readFile(path.join(stage, 'previous.AppImage'))).equals(old))
  assert.equal(
    (JSON.parse(await fs.readFile(path.join(stage, 'journal.json'), 'utf8')) as { state: string })
      .state,
    'relaunching',
  )
  await assert.rejects(f.service.installAfterClose('0.2.0'))
  assert.equal(scheduled, 1)
})

test('eligible pre-close preparation returns exact signed authority without asserting close or creating a stage', async (t) => {
  let closeChecks = 0
  let scheduled = 0
  const f = await fixture(
    t,
    true,
    true,
    () => {
      closeChecks++
      throw new Error('The application is deliberately still open.')
    },
    async () => installImpact(),
    () => {
      scheduled++
      return true
    },
  )
  await f.service.check()
  await f.service.download('0.2.0')
  const authority = await f.service.prepareVerifiedArtifact('0.2.0')
  const before = {
    cache: await identity(authority.path),
    current: await identity(f.currentAppImage),
    public: f.service.getStatus(),
  }
  assert.equal((await f.service.reviewInstallation('0.2.0')).installationAvailable, true)
  assert.equal(await f.service.prepareInstallation('0.2.0'), authority)
  assert.equal(await f.service.prepareInstallation('0.2.0'), authority)
  assert.equal(closeChecks, 0)
  assert.equal(scheduled, 0)
  assert.deepEqual(await fs.readdir(f.parent), ['Current.AppImage'])
  assert.deepEqual(
    {
      cache: await identity(authority.path),
      current: await identity(f.currentAppImage),
      public: f.service.getStatus(),
    },
    before,
  )
})

test('a stage retained after startup blocks another public Review and preflight before impact or close', async (t) => {
  let impacts = 0
  let closeChecks = 0
  let schedules = 0
  const f = await fixture(
    t,
    true,
    true,
    () => {
      closeChecks++
    },
    async () => {
      impacts++
      return installImpact()
    },
    () => {
      schedules++
      return true
    },
  )
  await f.service.check()
  await f.service.download('0.2.0')
  assert.equal((await f.service.reviewInstallation('0.2.0')).installationAvailable, true)
  assert.equal(impacts, 1)
  const stage = await f.service.stageForInstallation('0.2.0')
  const retained = {
    candidate: await identity(stage.candidatePath),
    current: await identity(f.currentAppImage),
    journal: await fs.readFile(path.join(stage.stagingDirectory, 'journal.json')),
    members: await fs.readdir(stage.stagingDirectory),
  }
  // A new explicit download remains available; it cannot make the retained stage disposable.
  await f.service.check()
  assert.equal((await f.service.download('0.2.0')).status, 'downloaded')
  const receipt = await f.service.prepareVerifiedArtifact('0.2.0')
  await fs.writeFile(receipt.path, Buffer.alloc(f.body.length))
  for (const action of [
    () => f.service.reviewInstallation('0.2.0'),
    () => f.service.prepareInstallation('0.2.0'),
  ]) {
    await assert.rejects(action, ApplicationUpdateRecoveryRequiredError)
  }
  assert.equal(
    f.service.getStatus().status,
    'downloaded',
    'Retained admission precedes cache reads.',
  )
  assert.equal(impacts, 1)
  assert.equal(closeChecks, 0)
  assert.equal(schedules, 0)
  assert.deepEqual(
    {
      candidate: await identity(stage.candidatePath),
      current: await identity(f.currentAppImage),
      journal: await fs.readFile(path.join(stage.stagingDirectory, 'journal.json')),
      members: await fs.readdir(stage.stagingDirectory),
    },
    retained,
  )
})

for (const cut of ['before-publication', 'after-publication'] as const) {
  test(
    `SIGKILL ${cut} preserves the update and refuses signed C before close`,
    {
      skip: process.platform !== 'linux' || process.arch !== 'x64',
    },
    async (t) => {
      const a = await fixture(t)
      const oldBody = await fs.readFile(a.currentAppImage)
      await a.service.check()
      assert.equal((await a.service.download('0.2.0')).status, 'downloaded')
      const b = await a.service.prepareVerifiedArtifact('0.2.0')
      const cached = await identity(b.path)
      const fixturePath = path.join(a.root, 'interruption.json')
      await fs.writeFile(
        fixturePath,
        JSON.stringify({
          archivePath: a.archivePath,
          artifactPath: b.path,
          authority: b.authority,
          currentAppImage: a.currentAppImage,
          cut,
          executablePath: a.executablePath,
          trust: a.trust,
        }),
        { flag: 'wx', mode: 0o600 },
      )
      const childEntry = fileURLToPath(
        new URL('./test-fixtures/application-update-interruption-child.ts', import.meta.url),
      )
      const child = spawn(process.execPath, ['--import', 'tsx', childEntry, fixturePath], {
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let stderr = ''
      child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
        stderr = (stderr + chunk).slice(-32 * 1024)
      })
      const closed = once(child, 'close')
      const lines = createInterface({ input: child.stdout })
      const stageName = `.igs-app-update-${createHash('sha256').update('Current.AppImage').digest('hex').slice(0, 16)}`
      const stage = path.join(a.parent, stageName)
      const lock = `${stage}.lock`
      const published = cut === 'after-publication'
      const version = published ? '0.2.0' : '0.1.0'
      const currentBody = published ? a.body : oldBody
      const state = published ? 'activated' : 'activating'
      const files = [
        'journal.json',
        'previous.AppImage',
        'release-envelope.json',
        'release-notes.json',
      ]
      if (!published) {
        files.push('candidate.AppImage')
      }
      files.sort()
      const snapshot = async () => {
        assert.deepEqual(
          (await fs.readdir(a.parent)).sort(),
          [stageName, `${stageName}.lock`, 'Current.AppImage'].sort(),
        )
        assert.deepEqual((await fs.readdir(stage)).sort(), files)
        return await Promise.all(
          [a.currentAppImage, lock, ...files.map((file) => path.join(stage, file))].map(identity),
        )
      }
      let receipt: {
        cut: string
        lockPath: string
        pid: number
        stageDirectory: string
        startTicks: string
        type: string
      }
      let retained: Awaited<ReturnType<typeof snapshot>>
      try {
        const [line] = await Promise.race([
          once(lines, 'line', { signal: AbortSignal.timeout(10_000) }),
          closed.then(([code, signal]) => {
            assert.fail(
              `Update child exited before its cut (${String(code)}, ${String(signal)}). ${stderr}`,
            )
          }),
        ])
        receipt = JSON.parse(line as string) as typeof receipt
        assert.deepEqual(receipt, {
          cut,
          lockPath: lock,
          pid: child.pid,
          stageDirectory: stage,
          startTicks: receipt.startTicks,
          type: 'cut',
        })
        assert.match(receipt.startTicks, /^\d+$/)
        const proc = await fs.readFile(`/proc/${receipt.pid}/stat`, 'utf8')
        assert.equal(proc.slice(proc.lastIndexOf(')') + 2).split(' ')[19], receipt.startTicks)
        assert.equal(
          await fs.readFile(`/proc/${receipt.pid}/cgroup`, 'utf8'),
          await fs.readFile('/proc/self/cgroup', 'utf8'),
        )
        assert.throws(
          () => acquireApplicationUpdateAdmission(a.currentAppImage).release(),
          (error) =>
            error instanceof ApplicationUpdateAdmissionError &&
            error.code === 'APPLICATION_UPDATE_BUSY',
        )
        assert.equal(
          JSON.parse(await fs.readFile(path.join(stage, 'journal.json'), 'utf8')).state,
          state,
        )
        assert.deepEqual(await fs.readFile(a.currentAppImage), currentBody)
        assert.deepEqual(await fs.readFile(path.join(stage, 'previous.AppImage')), oldBody)
        assert.equal((await fs.stat(path.join(stage, 'previous.AppImage'))).mode & 0o7777, 0o600)
        if (!published) {
          assert.deepEqual(await fs.readFile(path.join(stage, 'candidate.AppImage')), a.body)
          assert.equal((await fs.stat(path.join(stage, 'candidate.AppImage'))).mode & 0o7777, 0o755)
        }
        retained = await snapshot()
      } finally {
        lines.close()
        if (child.exitCode === null && child.signalCode === null) {
          child.kill('SIGKILL')
        }
        const [code, signal] = await closed
        assert.equal(code, null, stderr)
        assert.equal(signal, 'SIGKILL', stderr)
      }

      await fs.readFile(`/proc/${receipt.pid}/stat`, 'utf8').then(
        (stat) =>
          assert.notEqual(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19], receipt.startTicks),
        (error: NodeJS.ErrnoException) => assert.equal(error.code, 'ENOENT'),
      )
      const nextAdmission = acquireApplicationUpdateAdmission(a.currentAppImage)
      try {
        nextAdmission.assertHeld()
      } finally {
        nextAdmission.release()
      }
      assert.deepEqual(await snapshot(), retained)
      const inspected = await inspectRetainedApplicationUpdate({
        currentAppImage: a.currentAppImage,
        currentVersion: version,
        readTrust: async () => a.trust,
      })
      const target = published ? 'verified' : 'unverified'
      assert.deepEqual(inspected, {
        runtimeAuthentication: 'unverified',
        status: 'retained',
        targetAuthentication: target,
      })

      let impactReads = 0
      let closeChecks = 0
      const schedules: string[] = []
      const close = () => {
        closeChecks++
      }
      const impact = async () => {
        impactReads++
        return installImpact()
      }
      const schedule = (targetPath: string) => {
        schedules.push(targetPath)
        return true
      }
      const c = await fixture(t, true, true, close, impact, schedule, true, {
        current: version,
        from: currentBody,
        next: '0.3.0',
        to: image(9),
      })
      const freshSource = await a.captureCurrentSource()
      for (const startup of [inspected, { status: 'none' } as const]) {
        const restarted = new ApplicationUpdateService(
          version,
          true,
          () => createElectronUpdateChecker(c.updater),
          a.currentAppImage,
          close,
          impact,
          schedule,
          startup,
          freshSource,
        )
        assert.deepEqual(
          restarted.getRecoveryStatus(),
          startup.status === 'retained'
            ? { runtime: 'unverified', status: 'required', target }
            : { status: 'clear' },
        )
        await restarted.check()
        assert.equal((await restarted.download('0.3.0')).status, 'downloaded')
        await restarted.prepareVerifiedArtifact('0.3.0')
        await assert.rejects(
          restarted.reviewInstallation('0.3.0'),
          ApplicationUpdateRecoveryRequiredError,
        )
        await assert.rejects(
          restarted.prepareInstallation('0.3.0'),
          ApplicationUpdateRecoveryRequiredError,
        )
      }
      assert.equal(impactReads, 0)
      assert.equal(closeChecks, 0)
      assert.deepEqual(schedules, [])

      if (published) {
        // An independently initialized pathname holding the exact B bytes has no old claim.
        // This is a transaction control with an observed scheduler call; the body is never run.
        assert.equal(await fs.readFile(c.currentAppImage).then(sha), b.manifest.artifact.sha512)
        await c.service.check()
        assert.equal((await c.service.download('0.3.0')).status, 'downloaded')
        assert.equal((await c.service.reviewInstallation('0.3.0')).installationAvailable, true)
        const artifact = await c.service.prepareInstallation('0.3.0')
        const admitted = acquireApplicationUpdateAdmission(c.currentAppImage)
        try {
          await c.service.installAfterClose('0.3.0', artifact)
          admitted.assertHeld()
        } finally {
          admitted.release()
        }
        assert.deepEqual(schedules, [c.currentAppImage])
        assert.equal(
          await fs.readFile(c.currentAppImage).then(sha),
          artifact.manifest.artifact.sha512,
        )
        const nextStage = path.join(c.parent, stageName)
        assert.equal(
          await fs.readFile(path.join(nextStage, 'previous.AppImage')).then(sha),
          b.manifest.artifact.sha512,
        )
        assert.equal(
          JSON.parse(await fs.readFile(path.join(nextStage, 'journal.json'), 'utf8')).state,
          'relaunching',
        )
      }
      assert.deepEqual(await snapshot(), retained)
      assert.deepEqual(await identity(b.path), cached)
      t.diagnostic(
        JSON.stringify({
          cleanBC: published,
          cut,
          exit: 'SIGKILL',
          next: 'retained-refused',
          owner: receipt,
          phase: state,
          target,
        }),
      )
    },
  )
}

for (const lane of [
  'missing-close',
  'missing-scheduler',
  'missing-current-path',
  'metadata-only',
  'wrong-version',
  'not-downloaded',
] as const) {
  test(`${lane} refuses pre-close Install eligibility without consuming the normal close barrier`, async (t) => {
    let closeChecks = 0
    let scheduled = 0
    const f = await fixture(
      t,
      lane !== 'metadata-only',
      lane !== 'missing-current-path',
      lane === 'missing-close'
        ? null
        : () => {
            closeChecks++
          },
      async () => installImpact(),
      lane === 'missing-scheduler'
        ? null
        : () => {
            scheduled++
            return true
          },
    )
    await f.service.check()
    if (lane !== 'not-downloaded') {
      await f.service.download('0.2.0')
    }
    const before = await identity(f.currentAppImage)
    await assert.rejects(
      f.service.prepareInstallation(lane === 'wrong-version' ? '0.3.0' : '0.2.0'),
    )
    assert.equal(closeChecks, 0)
    assert.equal(scheduled, 0)
    assert.deepEqual(await identity(f.currentAppImage), before)
    assert.deepEqual(await fs.readdir(f.parent), ['Current.AppImage'])
    if (lane === 'missing-current-path') {
      await assert.rejects(
        f.service.reviewInstallation('0.2.0'),
        ApplicationUpdateCurrentSourceError,
      )
    } else if (['missing-close', 'missing-scheduler'].includes(lane)) {
      assert.equal((await f.service.reviewInstallation('0.2.0')).installationAvailable, false)
    }
  })
}

test('a same-version replacement after preflight cannot be installed under the older exact capability', async (t) => {
  let closed = false
  let scheduled = 0
  const f = await fixture(
    t,
    true,
    true,
    () => assert.equal(closed, true),
    null,
    () => {
      scheduled++
      return true
    },
  )
  await f.service.check()
  await f.service.download('0.2.0')
  const reviewedArtifact = await f.service.prepareInstallation('0.2.0')
  await f.service.check()
  await f.service.download('0.2.0')
  const replacementArtifact = await f.service.prepareInstallation('0.2.0')
  assert.notEqual(replacementArtifact, reviewedArtifact)
  assert.equal(replacementArtifact.manifest.version, reviewedArtifact.manifest.version)
  assert.equal(
    replacementArtifact.manifest.artifact.sha512,
    reviewedArtifact.manifest.artifact.sha512,
    'Equal version and bytes do not revive retired native authority.',
  )
  const before = {
    cache: await identity(replacementArtifact.path),
    current: await identity(f.currentAppImage),
  }
  closed = true
  await assert.rejects(f.service.installAfterClose('0.2.0', reviewedArtifact), /selection changed/i)
  assert.equal(scheduled, 0)
  assert.deepEqual(await fs.readdir(f.parent), ['Current.AppImage'])
  assert.deepEqual(
    { cache: await identity(replacementArtifact.path), current: await identity(f.currentAppImage) },
    before,
  )
  await f.service.installAfterClose('0.2.0', replacementArtifact)
  assert.equal(scheduled, 1, 'Fresh explicit authority remains a neighboring valid control.')
  assert.ok((await fs.readFile(f.currentAppImage)).equals(f.body))
})
