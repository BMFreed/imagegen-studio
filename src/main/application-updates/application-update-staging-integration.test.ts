import { DownloadedUpdateHelper } from 'electron-updater/out/DownloadedUpdateHelper.js'
import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
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
 * Only native metadata HTTP and transfer are controlled. Parser/cache/signature/service/FS are
 * real.
 */
async function fixture(
  t: { after: (cleanup: () => Promise<void>) => void },
  signed = true,
  target = true,
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
