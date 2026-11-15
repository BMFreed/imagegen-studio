import type { UpdateInfoAndProvider } from 'electron-updater/out/AppUpdater.js'
import type { ResolvedUpdateFileInfo } from 'electron-updater/out/types.js'

import { DownloadedUpdateHelper } from 'electron-updater/out/DownloadedUpdateHelper.js'
import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import type { ApplicationReleaseTrust } from './application-release.js'

import { canonicalRuntimeReleaseJson } from '../runtime/runtime-release.js'
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

  constructor(
    readonly root: string,
    trust: ApplicationReleaseTrust | null = null,
  ) {
    super(
      null,
      {
        baseCachePath: root,
        isPackaged: true,
        name: 'owned-native-release',
        userDataPath: root,
        version: '0.1.0',
        whenReady: async () => undefined,
      },
      trust,
    )
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
    const info = this.updateInfoAndProvider!.info
    const selected = this.updateInfoAndProvider!.provider.resolveFiles(info)[0]
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

const releaseNotes = 'Owned signed release notes remain literal text.'
const keyPair = generateKeyPairSync('ed25519')
const publicKey = keyPair.publicKey.export({ format: 'pem', type: 'spki' }).toString()
/**
 * Only the native GenericProvider HTTP response is controlled; its parser, resolver, AppUpdater
 * availability and Studio's pre-availability authentication all remain real.
 */
class SignedFixtureUpdater extends FixtureUpdater {
  metadata: UpdateInfoAndProvider['info'] & { imagegenStudioRelease?: string }
  metadataRequests = 0

  constructor(root: string, trust = releaseTrust()) {
    super(root, trust)
    this.metadata = {
      files: [{ sha512: digest(body), size: body.length, url: 'studio-0.2.0.AppImage' }],
      imagegenStudioRelease: signedEnvelope(releaseManifest()),
      path: 'studio-0.2.0.AppImage',
      releaseDate: '2026-11-15T00:00:00Z',
      releaseNotes,
      sha512: digest(body),
      version: '0.2.0',
    }
    Reflect.set(this, 'httpExecutor', {
      request: async () => {
        this.metadataRequests++
        return JSON.stringify(this.metadata)
      },
    })
    this.setFeedURL({ provider: 'generic', url: 'https://updates.invalid/' })
  }

  override isUpdaterActive(): boolean {
    return true
  }

  setReleaseVersion(version: string) {
    Reflect.set(this.metadata, 'version', version)
    this.metadata.imagegenStudioRelease = signedEnvelope(releaseManifest(version))
  }
}

function releaseTrust() {
  return {
    compatibility: {
      cpuWorkerProtocolVersion: '1',
      databaseMigrations: [{ name: '0001_app_metadata.sql', sha256: 'a'.repeat(64) }],
      inferenceWorkerProtocolVersion: '1',
      projectSchemaVersion: 1,
    },
    trustedKeys: { 'owned-native-key': publicKey },
  }
}

function releaseManifest(version = '0.2.0') {
  return {
    appId: 'studio.imagegen.desktop',
    artifact: { filename: 'studio-0.2.0.AppImage', sha512: digest(body), sizeBytes: body.length },
    compatibility: { ...releaseTrust().compatibility, runtimeValidation: 'after-restart' },
    releaseId: 'owned-native-release',
    releaseNotesSha256: createHash('sha256')
      .update(canonicalRuntimeReleaseJson(releaseNotes))
      .digest('hex'),
    schemaVersion: 1,
    scope: 'application-release',
    target: { arch: 'x64', format: 'AppImage', os: 'linux' },
    version,
  }
}

function signedEnvelope(payload: unknown) {
  const bytes = canonicalRuntimeReleaseJson(payload)
  return canonicalRuntimeReleaseJson({
    keyId: 'owned-native-key',
    payload: bytes.toString('base64'),
    schemaVersion: 1,
    signature: sign(null, bytes, keyPair.privateKey).toString('base64'),
  }).toString()
}

async function signedFixture(
  t: { after: (fn: () => Promise<void>) => void },
  trust = releaseTrust(),
) {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'igs-app-signed-download-'))
  t.after(() => fs.rm(root, { force: true, recursive: true }))
  return new SignedFixtureUpdater(root, trust)
}

test('real native metadata parsing authenticates a release before advertising or downloading it', async (t) => {
  const updater = await signedFixture(t)
  const checker = createElectronUpdateChecker(updater)
  assert.equal(updater.downloadCalls, 0)
  const checked = await checker.checkForUpdates()
  assert.equal(checked?.isUpdateAvailable, true)
  assert.equal(checked?.verification, 'signed-release')
  assert.equal(updater.metadataRequests, 1)
  assert.equal(updater.downloadCalls, 0)
  const downloaded = await updater.downloadVerified(() => {})
  assert.equal(downloaded.sizeBytes, body.length)
  const artifact = downloaded.verifiedArtifact
  assert.ok(artifact)
  assert.equal(
    artifact.path,
    path.join(updater.helper.cacheDirForPendingUpdate, 'studio-0.2.0.AppImage'),
  )
  assert.equal(Object.isFrozen(artifact), true)
  assert.equal(Object.isFrozen(artifact.manifest.compatibility.databaseMigrations), true)
  assert.equal(artifact.manifest.version, '0.2.0')
  await artifact.verifyCompleteSnapshot()
  assert.equal(updater.transfers, 1)
  assert.equal(updater.autoInstallOnAppQuit, false)
  assert.equal(updater.disableDifferentialDownload, false)
})

test('missing, untrusted or descriptor/notes-mismatched signatures never reach native transfer', async (t) => {
  for (const fault of [
    'missing',
    'signature',
    'untrusted',
    'descriptor',
    'notes',
    'version',
  ] as const) {
    await t.test(fault, async (sub) => {
      const updater = await signedFixture(sub)
      switch (fault) {
        case 'descriptor': {
          updater.metadata.files[0].size = body.length + 1
          break
        }
        case 'missing': {
          delete updater.metadata.imagegenStudioRelease
          break
        }
        case 'notes': {
          updater.metadata.releaseNotes = '<script>unsigned notes</script>'
          break
        }
        case 'signature': {
          const envelope = JSON.parse(updater.metadata.imagegenStudioRelease!)
          envelope.signature = Buffer.alloc(64).toString('base64')
          updater.metadata.imagegenStudioRelease = JSON.stringify(envelope)
          break
        }
        case 'untrusted': {
          const envelope = JSON.parse(updater.metadata.imagegenStudioRelease!)
          envelope.keyId = 'different-key'
          updater.metadata.imagegenStudioRelease = JSON.stringify(envelope)
          break
        }
        case 'version': {
          Reflect.set(updater.metadata, 'version', '0.3.0')
          break
        }
      }
      await assert.rejects(updater.checkForUpdates())
      assert.equal(updater.getVerification(), 'metadata-only')
      await assert.rejects(
        updater.downloadVerified(() => {}),
        /signed application release check/,
      )
      assert.equal(updater.downloadCalls, 0)
      assert.equal(updater.metadataRequests, 1)
    })
  }
})

test('signed native checks refuse unsigned policy fields before native availability can return no-update', async (t) => {
  for (const key of ['stagingPercentage', 'minimumSystemVersion', 'packages', 'blockMapSize']) {
    await t.test(key, async (sub) => {
      const updater = await signedFixture(sub)
      updater.setReleaseVersion('0.1.0')
      Reflect.set(
        key === 'blockMapSize' ? updater.metadata.files[0] : updater.metadata,
        key,
        key === 'stagingPercentage'
          ? 0
          : key === 'minimumSystemVersion'
            ? '999.0.0'
            : key === 'blockMapSize'
              ? 16
              : {},
      )
      await assert.rejects(
        updater.checkForUpdates(),
        /Unsupported signed application release policy/,
      )
      assert.equal(updater.downloadCalls, 0)
    })
  }
  const updater = await signedFixture(t)
  updater.setReleaseVersion('0.1.0')
  updater.metadata.imagegenStudioRelease = '{}'
  await assert.rejects(updater.checkForUpdates())
  assert.equal(updater.downloadCalls, 0)
})

test('legacy metadata-only download keeps the existing native differential policy', async (t) => {
  const updater = await fixture(t)
  updater.files[0].info.blockMapSize = 16
  assert.deepEqual(await updater.downloadVerified(() => {}), { sizeBytes: body.length })
  assert.equal(updater.disableDifferentialDownload, false)
})

test('a signed no-update or failing check revokes the native old available provider authority', async (t) => {
  for (const fail of [false, true]) {
    await t.test(String(fail), async (sub) => {
      const updater = await signedFixture(sub)
      assert.equal((await updater.checkForUpdates())?.isUpdateAvailable, true)
      const artifact = (await updater.downloadVerified(() => {})).verifiedArtifact!
      updater.setReleaseVersion('0.1.0')
      if (fail) {
        updater.metadata.imagegenStudioRelease = '{}'
      }
      if (fail) {
        await assert.rejects(updater.checkForUpdates())
      } else {
        assert.equal((await updater.checkForUpdates())?.isUpdateAvailable, false)
      }
      await assert.rejects(artifact.verifyCompleteSnapshot(), /retired/)
      await assert.rejects(
        updater.downloadVerified(() => {}),
        /signed application release check/,
      )
      assert.equal(
        updater.downloadCalls,
        1,
        'The retained native available provider cannot authorize another transfer/cache call.',
      )
    })
  }
})

test('changed signed metadata or resolved URL cannot replace the selection between Check and Download', async (t) => {
  for (const fault of ['release', 'url', 'notes'] as const) {
    await t.test(fault, async (sub) => {
      const updater = await signedFixture(sub)
      await updater.checkForUpdates()
      const source = Reflect.get(updater, 'updateInfoAndProvider') as UpdateInfoAndProvider
      if (fault === 'release') {
        Reflect.set(
          source.info,
          'imagegenStudioRelease',
          signedEnvelope({ ...releaseManifest(), releaseId: 'replacement' }),
        )
      } else if (fault === 'url') {
        source.info.files[0].url = 'https://mirror.invalid/studio-0.2.0.AppImage'
      } else {
        source.info.releaseNotes = 'Replaced unsigned notes'
      }
      await assert.rejects(updater.downloadVerified(() => {}))
      assert.equal(updater.downloadCalls, 0)
    })
  }
})

test('signed artifact revalidation rejects changed bytes and retires a failed capability', async (t) => {
  const updater = await signedFixture(t)
  await updater.checkForUpdates()
  const artifact = (await updater.downloadVerified(() => {})).verifiedArtifact!
  await fs.writeFile(artifact.path, Buffer.alloc(body.length, 20))
  await assert.rejects(artifact.verifyCompleteSnapshot())
  await fs.writeFile(artifact.path, body)
  await assert.rejects(artifact.verifyCompleteSnapshot(), /retired/)
})

test('same-byte inode replacement is refused, while a new explicit download creates its own snapshot', async (t) => {
  const updater = await signedFixture(t)
  await updater.checkForUpdates()
  const artifact = (await updater.downloadVerified(() => {})).verifiedArtifact!
  const replacement = path.join(updater.root, 'replacement.AppImage')
  await fs.writeFile(replacement, body)
  await fs.rename(replacement, artifact.path)
  await assert.rejects(artifact.verifyCompleteSnapshot(), /snapshot changed/)
  const fresh = (await updater.downloadVerified(() => {})).verifiedArtifact!
  await fresh.verifyCompleteSnapshot()
  assert.equal(
    updater.transfers,
    1,
    'Fresh explicit validation can reuse healthy native cached bytes.',
  )
})

test('new Check and failed new Download retire an older signed artifact without installing anything', async (t) => {
  const updater = await signedFixture(t)
  await updater.checkForUpdates()
  const old = (await updater.downloadVerified(() => {})).verifiedArtifact!
  await updater.checkForUpdates()
  await assert.rejects(old.verifyCompleteSnapshot(), /retired/)
  const current = (await updater.downloadVerified(() => {})).verifiedArtifact!
  updater.nativeFailure = true
  await assert.rejects(
    updater.downloadVerified(() => {}),
    /native controlled failure/,
  )
  await assert.rejects(current.verifyCompleteSnapshot(), /retired/)
  assert.equal(updater.autoInstallOnAppQuit, false)
  assert.equal(updater.autoRunAppAfterInstall, false)
})

test('native trust inputs are copied before mutable caller-owned key/context changes', async (t) => {
  const trust = releaseTrust()
  const updater = await signedFixture(t, trust)
  trust.trustedKeys['owned-native-key'] = 'changed'
  trust.compatibility.databaseMigrations[0].sha256 = 'b'.repeat(64)
  assert.equal((await updater.checkForUpdates())?.isUpdateAvailable, true)
  await (await updater.downloadVerified(() => {})).verifiedArtifact!.verifyCompleteSnapshot()
})
