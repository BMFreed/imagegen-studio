import type { ApplicationUpdateRecoverySnapshot } from '../../shared/application-updates.js'

import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { readdirSync } from 'node:fs'
import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test, type TestContext } from 'node:test'

import type { VerifiedApplicationArtifact } from './electron-update-checker.js'

import { canonicalRuntimeReleaseJson } from '../runtime/runtime-release.js'
import {
  type ApplicationReleaseTrust,
  verifyApplicationReleaseAuthority,
} from './application-release.js'
import { saveApplicationRecovery } from './application-update-recovery-action.js'

const version = '0.2.0'
const originalBytes = Buffer.from('Retained application bytes')
const required: ApplicationUpdateRecoverySnapshot = {
  runtime: 'unverified',
  status: 'required',
  target: 'unverified',
}
const host = { skip: process.platform !== 'linux' || process.arch !== 'x64' }
const unavailable = { code: 'APPLICATION_UPDATE_RECOVERY_UNAVAILABLE' }
const stale = { code: 'APPLICATION_UPDATE_RECOVERY_STALE' }

function signedImage() {
  const bytes = Buffer.alloc(256)
  bytes.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0, 0x41, 0x49, 2])
  bytes.writeUInt16LE(3, 16)
  bytes.writeUInt16LE(62, 18)
  bytes.writeUInt32LE(1, 20)
  bytes.writeUInt16LE(64, 52)
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const trust: ApplicationReleaseTrust = {
    compatibility: {
      cpuWorkerProtocolVersion: '1',
      databaseMigrations: [],
      inferenceWorkerProtocolVersion: '1',
      projectSchemaVersion: 1,
    },
    trustedKeys: {
      fixture: publicKey.export({ format: 'pem', type: 'spki' }).toString(),
    },
  }
  const releaseNotesJson = canonicalRuntimeReleaseJson('Signed fixture notes').toString()
  const declaration = canonicalRuntimeReleaseJson({
    appId: 'studio.imagegen.desktop',
    artifact: {
      filename: 'publisher-linux-x64.AppImage',
      sha512: createHash('sha512').update(bytes).digest('base64'),
      sizeBytes: bytes.length,
    },
    compatibility: { ...trust.compatibility, runtimeValidation: 'after-restart' },
    releaseId: 'fixture-release',
    releaseNotesSha256: createHash('sha256').update(releaseNotesJson).digest('hex'),
    schemaVersion: 1,
    scope: 'application-release',
    target: { arch: 'x64', format: 'AppImage', os: 'linux' },
    version,
  })
  const authority = {
    envelope: canonicalRuntimeReleaseJson({
      keyId: 'fixture',
      payload: declaration.toString('base64'),
      schemaVersion: 1,
      signature: sign(null, declaration, privateKey).toString('base64'),
    }).toString(),
    releaseNotesJson,
  }
  return { authority, bytes, manifest: verifyApplicationReleaseAuthority(authority, trust), trust }
}

async function fixture(t: TestContext) {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'igs-app-recovery-action-'))
  t.after(async () => fs.rm(root, { force: true, recursive: true }))
  const old = path.join(root, 'old')
  const selected = path.join(root, 'selected')
  const cache = path.join(root, 'cache')
  for (const directory of [old, selected, cache]) {
    await fs.mkdir(directory, { mode: 0o700 })
  }
  const originalAppImage = path.join(old, 'Original.AppImage')
  const sourceAppImage = path.join(cache, 'downloaded.AppImage')
  const destinationAppImage = path.join(selected, 'Recovered.AppImage')
  const signed = signedImage()
  await fs.writeFile(originalAppImage, originalBytes, { mode: 0o755 })
  await fs.writeFile(sourceAppImage, signed.bytes, { mode: 0o600 })
  const artifact: VerifiedApplicationArtifact = {
    authority: signed.authority,
    manifest: signed.manifest,
    path: sourceAppImage,
    verifyCompleteSnapshot: async () => {
      assert.deepEqual(await fs.readFile(sourceAppImage), signed.bytes)
    },
  }
  const calls: string[] = []
  const input: Parameters<typeof saveApplicationRecovery>[0] = {
    chooseDestination: async (suggestedName) => {
      calls.push(`choose:${suggestedName}`)
      return destinationAppImage
    },
    expectedVersion: version,
    getRecoveryStatus: () => required,
    isCurrent: () => true,
    originalAppImage,
    prepareVerifiedArtifact: async (requested) => {
      calls.push(`prepare:${requested}`)
      await artifact.verifyCompleteSnapshot()
      return artifact
    },
    readTrust: async () => {
      calls.push('trust')
      return signed.trust
    },
  }
  return {
    artifact,
    calls,
    destinationAppImage,
    input,
    originalAppImage,
    selected,
    signed,
    sourceAppImage,
  }
}

test(
  'explicit recovery reauthenticates the same download around the picker and publishes exact bytes',
  host,
  async (t) => {
    const f = await fixture(t)
    assert.deepEqual(await saveApplicationRecovery(f.input), { status: 'saved' })
    assert.deepEqual(f.calls, [
      'trust',
      `prepare:${version}`,
      `choose:ImageGen-Studio-${version}-Recovery.AppImage`,
      'trust',
      `prepare:${version}`,
    ])
    const published = await fs.stat(f.destinationAppImage)
    assert.equal(published.mode & 0o7777, 0o755)
    assert.equal(published.nlink, 1)
    assert.deepEqual(await fs.readFile(f.destinationAppImage), f.signed.bytes)
    assert.deepEqual(await fs.readFile(f.sourceAppImage), f.signed.bytes)
    assert.deepEqual(await fs.readFile(f.originalAppImage), originalBytes)
    assert.deepEqual(await fs.readdir(f.selected), ['Recovered.AppImage'])
  },
)

test(
  'recovery preserves the spelling of a local AppImage path selected by KDE',
  host,
  async (t) => {
    const f = await fixture(t)
    const originalAppImage = path.join(path.dirname(f.originalAppImage), 'Original.aPpImAgE')
    const destination = path.join(f.selected, 'Recovered.appimage')
    await fs.rename(f.originalAppImage, originalAppImage)

    assert.deepEqual(
      await saveApplicationRecovery({
        ...f.input,
        chooseDestination: async () => destination,
        originalAppImage,
      }),
      { status: 'saved' },
    )
    assert.deepEqual(await fs.readdir(f.selected), ['Recovered.appimage'])
    assert.deepEqual(await fs.readFile(destination), f.signed.bytes)
    const published = await fs.stat(destination)
    assert.equal(published.mode & 0o7777, 0o755)
    assert.equal(published.nlink, 1)
    assert.deepEqual(await fs.readFile(originalAppImage), originalBytes)
    assert.deepEqual(await fs.readFile(f.sourceAppImage), f.signed.bytes)
  },
)

test(
  'recovery still refuses a different local extension and a noncanonical download suffix',
  host,
  async (t) => {
    const f = await fixture(t)
    const unsafe = { code: 'APPLICATION_UPDATE_RECOVERY_UNSAFE' }
    await assert.rejects(
      saveApplicationRecovery({
        ...f.input,
        chooseDestination: async () => path.join(f.selected, 'Recovered.zip'),
      }),
      unsafe,
    )
    const source = path.join(path.dirname(f.sourceAppImage), 'downloaded.appimage')
    await fs.copyFile(f.sourceAppImage, source)
    const artifact = { ...f.artifact, path: source }
    await assert.rejects(
      saveApplicationRecovery({ ...f.input, prepareVerifiedArtifact: async () => artifact }),
      unsafe,
    )
    assert.deepEqual(await fs.readdir(f.selected), [])
  },
)

test('unavailable recovery, unsupported AppImage source, and malformed version never open the picker', async (t) => {
  const f = await fixture(t)
  await assert.rejects(
    saveApplicationRecovery({ ...f.input, getRecoveryStatus: () => ({ status: 'clear' }) }),
    unavailable,
  )
  await assert.rejects(
    saveApplicationRecovery({ ...f.input, getRecoveryStatus: () => ({ status: 'not-checked' }) }),
    unavailable,
  )
  await assert.rejects(saveApplicationRecovery({ ...f.input, originalAppImage: null }), unavailable)
  await assert.rejects(
    saveApplicationRecovery({ ...f.input, expectedVersion: '../wherever' }),
    unavailable,
  )
  assert.deepEqual(f.calls, [])
  assert.deepEqual(await fs.readdir(f.selected), [])
})

test('missing or wrong bundled trust and pending download refuse before the picker', async (t) => {
  const f = await fixture(t)
  await assert.rejects(
    saveApplicationRecovery({ ...f.input, readTrust: async () => null }),
    unavailable,
  )
  await assert.rejects(
    saveApplicationRecovery({ ...f.input, readTrust: async () => signedImage().trust }),
    unavailable,
  )
  await assert.rejects(
    saveApplicationRecovery({
      ...f.input,
      prepareVerifiedArtifact: async () => {
        throw new Error(f.sourceAppImage)
      },
    }),
    unavailable,
  )
  assert.ok(f.calls.every((call) => !call.startsWith('choose:')))
  assert.deepEqual(await fs.readdir(f.selected), [])
})

test('a native cancellation returns only canceled, without a second verification or any writes', async (t) => {
  const f = await fixture(t)
  assert.deepEqual(
    await saveApplicationRecovery({
      ...f.input,
      chooseDestination: async () => null,
    }),
    { status: 'canceled' },
  )
  assert.deepEqual(f.calls, ['trust', `prepare:${version}`])
  assert.deepEqual(await fs.readdir(f.selected), [])
})

test('invalidated caller, changed download identity and altered bundled trust each refuse after the picker', async (t) => {
  const f = await fixture(t)
  let live = true
  await assert.rejects(
    saveApplicationRecovery({
      ...f.input,
      chooseDestination: async () => {
        live = false
        return f.destinationAppImage
      },
      isCurrent: () => live,
    }),
    stale,
  )
  let selected = f.artifact
  await assert.rejects(
    saveApplicationRecovery({
      ...f.input,
      chooseDestination: async () => {
        selected = { ...f.artifact }
        return f.destinationAppImage
      },
      prepareVerifiedArtifact: async () => selected,
    }),
    stale,
  )
  let trust = f.signed.trust
  await assert.rejects(
    saveApplicationRecovery({
      ...f.input,
      chooseDestination: async () => {
        trust = {
          ...trust,
          trustedKeys: {
            ...trust.trustedKeys,
            successor: signedImage().trust.trustedKeys['fixture'],
          },
        }
        return f.destinationAppImage
      },
      readTrust: async () => trust,
    }),
    stale,
  )
  assert.deepEqual(await fs.readdir(f.selected), [])
})

test('picker errors do not expose private locations', async (t) => {
  const f = await fixture(t)
  await assert.rejects(
    saveApplicationRecovery({
      ...f.input,
      chooseDestination: async () => {
        throw new Error(f.destinationAppImage)
      },
    }),
    {
      code: 'APPLICATION_UPDATE_RECOVERY_SAVE_FAILED',
      message:
        'The recovery AppImage could not be saved. Choose a new AppImage path and try again.',
    },
  )
  assert.deepEqual(await fs.readdir(f.selected), [])
})

test(
  'occupied recovery destination returns the fixed publisher conflict and preserves the file',
  host,
  async (t) => {
    const f = await fixture(t)
    const existing = Buffer.from('Existing AppImage name')
    await fs.writeFile(f.destinationAppImage, existing)
    await assert.rejects(saveApplicationRecovery(f.input), {
      code: 'APPLICATION_UPDATE_RECOVERY_DESTINATION_EXISTS',
    })
    assert.deepEqual(await fs.readFile(f.destinationAppImage), existing)
    assert.deepEqual(await fs.readdir(f.selected), ['Recovered.AppImage'])
  },
)

test(
  'caller revocation while a full private copy is prepared refuses the public link',
  host,
  async (t) => {
    const f = await fixture(t)
    await assert.rejects(
      saveApplicationRecovery({
        ...f.input,
        isCurrent: () =>
          !readdirSync(f.selected).some((name) => name.startsWith('.igs-app-recovery-')),
      }),
      stale,
    )
    await assert.rejects(fs.lstat(f.destinationAppImage), { code: 'ENOENT' })
    const entries = await fs.readdir(f.selected)
    assert.equal(entries.length, 1)
    assert.match(entries[0], /^\.igs-app-recovery-/)
    const candidate = path.join(f.selected, entries[0], 'candidate.AppImage')
    assert.deepEqual(await fs.readFile(candidate), f.signed.bytes)
    const candidateStat = await fs.lstat(candidate)
    assert.equal(candidateStat.mode & 0o7777, 0o755)
    assert.equal(candidateStat.nlink, 1)
    assert.deepEqual(await fs.readFile(f.originalAppImage), originalBytes)
  },
)
