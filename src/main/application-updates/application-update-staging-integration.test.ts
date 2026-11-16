import type { ApplicationUpdateInstallPreview } from '../../shared/application-updates.js'

import { DownloadedUpdateHelper } from 'electron-updater/out/DownloadedUpdateHelper.js'
import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { lstatSync, readFileSync } from 'node:fs'
import * as fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { canonicalRuntimeReleaseJson } from '../runtime/runtime-release.js'
import { ApplicationUpdateService } from './application-update-service.js'
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
) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'igs-staging-consumer-'))
  t.after(() => fs.rm(root, { force: true, recursive: true }))
  const parent = path.join(root, 'Applications')
  await fs.mkdir(parent, { mode: 0o700 })
  const currentAppImage = path.join(parent, 'Current.AppImage')
  await fs.writeFile(currentAppImage, image(5), { mode: 0o755 })
  await fs.chmod(currentAppImage, 0o755)
  const body = image(7)
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
    version: '0.2.0',
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
    version: '0.2.0',
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
          version: '0.1.0',
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
      await fs.writeFile(filename, body)
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
    '0.1.0',
    true,
    () => createElectronUpdateChecker(updater),
    target ? currentAppImage : null,
    assertApplicationClosed,
    readInstallImpact,
    scheduleApplicationRelaunch,
  )
  return { body, currentAppImage, parent, root, service, updater }
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
    if (['missing-close', 'missing-current-path', 'missing-scheduler'].includes(lane)) {
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
