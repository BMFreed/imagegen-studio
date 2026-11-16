/**
 * Private handoff tests use real owned files and the existing transaction. The typed artifact
 * authority and synchronous scheduler are controlled ports. No Electron process or AppImage is
 * launched here; true is only a helper-handshake result, never application-start evidence.
 *
 * Fresh InvokeAI4875d96531ca6712b288f6e660fcbb34143408c1: install_staging_ledger.py
 * claim/_write_marker, model_install_default.py claimed install -> _restore_moved_path callers, and
 * util/no_replace.py. Preserve durable intent and ambiguous material rather than retrying or
 * replacing foreign paths. Electron's absent safe Invoke/launcher restart adapter is qualified
 * separately by the production native adapter and Root's native fixture.
 */
import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { lstatSync, readFileSync } from 'node:fs'
import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test, type TestContext } from 'node:test'

import type { ApplicationReleaseManifest } from './application-release.js'
import type { VerifiedApplicationArtifact } from './electron-update-checker.js'

import { canonicalRuntimeReleaseJson } from '../runtime/runtime-release.js'
import {
  type ApplicationUpdateCurrentSource,
  AppUpdateRelaunchError,
  stageVerifiedApplicationArtifact,
} from './application-update-staging.js'

const sha = (bytes: Buffer) => createHash('sha512').update(bytes).digest('base64')

function image(marker: number) {
  const bytes = Buffer.alloc(8192, marker)
  bytes.fill(0, 0, 64)
  bytes.set([127, 69, 76, 70, 2, 1, 1, 0, 65, 73, 2])
  bytes.writeUInt16LE(3, 16)
  bytes.writeUInt16LE(62, 18)
  bytes.writeUInt32LE(1, 20)
  bytes.writeUInt16LE(64, 52)
  return bytes
}

/**
 * Explicit controlled source port for the legacy private transaction matrix, not a native source
 * observation.
 */
async function fixtureCurrentSource(
  currentAppImage: string,
): Promise<ApplicationUpdateCurrentSource> {
  const info = await fs.lstat(currentAppImage, { bigint: true })
  return Object.freeze({
    assertCurrentSnapshot: () => undefined,
    currentAppImage,
    currentImage: Object.freeze({
      identity: Object.freeze({
        ctimeNs: String(info.ctimeNs),
        dev: String(info.dev),
        gid: String(info.gid),
        ino: String(info.ino),
        mode: String(info.mode),
        mtimeNs: String(info.mtimeNs),
        nlink: String(info.nlink),
        sizeBytes: Number(info.size),
        uid: String(info.uid),
      }),
      sha512: createHash('sha512')
        .update(await fs.readFile(currentAppImage))
        .digest('base64'),
      sizeBytes: Number(info.size),
    }),
    dispose: () => undefined,
    verifyCompleteSnapshot: async () => undefined,
  })
}

async function witness(filename: string) {
  const info = await fs.lstat(filename, { bigint: true })
  return {
    ctimeNs: info.ctimeNs,
    dev: info.dev,
    ino: info.ino,
    mode: Number(info.mode & 0o7777n),
    mtimeNs: info.mtimeNs,
    sha512: sha(await fs.readFile(filename)),
    size: info.size,
  }
}

async function fixture(t: Pick<TestContext, 'after'>) {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'igs-app-relaunch-'))
  t.after(() => fs.rm(root, { force: true, recursive: true }))
  const applications = path.join(root, 'applications')
  const cache = path.join(root, 'cache')
  await fs.mkdir(applications, { mode: 0o700 })
  await fs.mkdir(cache, { mode: 0o700 })
  const currentAppImage = path.join(applications, 'Current.AppImage')
  const source = path.join(cache, 'next.AppImage')
  const oldBytes = image(11)
  const newBytes = image(23)
  await fs.writeFile(currentAppImage, oldBytes, { mode: 0o755 })
  await fs.writeFile(source, newBytes, { mode: 0o755 })
  await fs.chmod(currentAppImage, 0o755)
  await fs.chmod(source, 0o755)
  const notesJson = canonicalRuntimeReleaseJson('Owned relaunch fixture; never executed.')
  const manifest: ApplicationReleaseManifest = {
    appId: 'studio.imagegen.desktop',
    artifact: { filename: 'next.AppImage', sha512: sha(newBytes), sizeBytes: newBytes.length },
    compatibility: {
      cpuWorkerProtocolVersion: '1',
      databaseMigrations: [],
      inferenceWorkerProtocolVersion: '1',
      projectSchemaVersion: 1,
      runtimeValidation: 'after-restart',
    },
    releaseId: 'owned-relaunch-fixture',
    releaseNotesSha256: createHash('sha256').update(notesJson).digest('hex'),
    schemaVersion: 1,
    scope: 'application-release',
    target: { arch: 'x64', format: 'AppImage', os: 'linux' },
    version: '0.2.0',
  }
  const { privateKey } = generateKeyPairSync('ed25519')
  const payload = canonicalRuntimeReleaseJson(manifest)
  const releaseAuthority = Object.freeze({
    envelope: canonicalRuntimeReleaseJson({
      keyId: 'owned-relaunch-key',
      payload: payload.toString('base64'),
      schemaVersion: 1,
      signature: sign(null, payload, privateKey).toString('base64'),
    }).toString('utf8'),
    releaseNotesJson: notesJson.toString('utf8'),
  })
  const authority = { calls: 0, revoked: false }
  const artifact: VerifiedApplicationArtifact = {
    authority: releaseAuthority,
    manifest,
    path: source,
    verifyCompleteSnapshot: async () => {
      authority.calls++
      assert.equal(authority.revoked, false, 'Owned native artifact authority was revoked.')
    },
  }
  const currentSource = await fixtureCurrentSource(currentAppImage)
  const staged = await stageVerifiedApplicationArtifact({
    artifact,
    currentAppImage,
    currentSource,
  })
  const backup = await staged.prepareBackup()
  const active = await backup.activate(() => undefined)
  return { active, authority, backup, currentAppImage, newBytes, oldBytes, root, source, staged }
}

async function journalState(stagingDirectory: string) {
  return (
    JSON.parse(await fs.readFile(path.join(stagingDirectory, 'journal.json'), 'utf8')) as {
      state: string
    }
  ).state
}

async function noFailedMarker(stagingDirectory: string) {
  await assert.rejects(fs.access(path.join(stagingDirectory, 'failed.json')), { code: 'ENOENT' })
}

test('handoff observes durable relaunch intent and exact executable while preserving target, backup and cache', async (t) => {
  const f = await fixture(t)
  const before = {
    backup: await witness(f.active.backupPath),
    current: await witness(f.currentAppImage),
    source: await witness(f.source),
  }
  let calls = 0
  await f.active.handoffRelaunch((target) => {
    calls++
    assert.equal(target, f.currentAppImage)
    assert.equal(lstatSync(target).mode & 0o7777, 0o755)
    assert.equal(sha(readFileSync(target)), sha(f.newBytes))
    assert.equal(sha(readFileSync(f.active.backupPath)), sha(f.oldBytes))
    const journal = JSON.parse(
      readFileSync(path.join(f.active.stagingDirectory, 'journal.json'), 'utf8'),
    ) as { state: string }
    assert.equal(journal.state, 'relaunching')
    return true
  })
  assert.equal(calls, 1)
  assert.deepEqual(
    {
      backup: await witness(f.active.backupPath),
      current: await witness(f.currentAppImage),
      source: await witness(f.source),
    },
    before,
  )
  assert.equal(await journalState(f.active.stagingDirectory), 'relaunching')
  await assert.rejects(f.active.verifyCompleteSnapshot())
  await assert.rejects(f.active.rollback())
  await assert.rejects(
    f.active.handoffRelaunch(() => {
      calls++
      return true
    }),
  )
  assert.equal(calls, 1)
  await noFailedMarker(f.active.stagingDirectory)
})

test('same-turn handoff requests coalesce once and obsolete operations cannot poison the handoff', async (t) => {
  const f = await fixture(t)
  let calls = 0
  let duplicateCalls = 0
  const operation = f.active.handoffRelaunch(() => {
    calls++
    return true
  })
  assert.equal(
    f.active.handoffRelaunch(() => {
      duplicateCalls++
      return true
    }),
    operation,
  )
  await Promise.all([
    assert.rejects(f.active.rollback()),
    assert.rejects(f.active.verifyCompleteSnapshot()),
    assert.rejects(f.backup.activate(() => undefined)),
    assert.rejects(f.staged.verifyCompleteSnapshot()),
  ])
  await operation
  assert.equal(calls, 1)
  assert.equal(duplicateCalls, 0)
  await noFailedMarker(f.active.stagingDirectory)
})

test('handoff after activation uses owned snapshots even when native cache is deleted and revoked', async (t) => {
  const f = await fixture(t)
  const callsAfterActivation = f.authority.calls
  const backup = await witness(f.active.backupPath)
  f.authority.revoked = true
  await fs.unlink(f.source)
  let calls = 0
  await f.active.handoffRelaunch((target) => {
    assert.equal(target, f.currentAppImage)
    calls++
    return true
  })
  assert.equal(calls, 1)
  assert.equal(f.authority.calls, callsAfterActivation)
  assert.deepEqual(await witness(f.active.backupPath), backup)
  assert.equal((await witness(f.currentAppImage)).sha512, sha(f.newBytes))
})

for (const fault of ['false', 'void', 'promise', 'rejected-promise', 'throw'] as const) {
  test(`${fault} scheduler result is uncertain, preserves recovery files and cannot be retried or rolled back`, async (t) => {
    const f = await fixture(t)
    const before = {
      backup: await witness(f.active.backupPath),
      current: await witness(f.currentAppImage),
      source: await witness(f.source),
    }
    let calls = 0
    await assert.rejects(
      f.active.handoffRelaunch(() => {
        calls++
        if (fault === 'throw') {
          throw new Error('Controlled scheduler failure; helper state is unknown.')
        }
        if (fault === 'promise') {
          return Promise.resolve(true)
        }
        if (fault === 'rejected-promise') {
          return Promise.reject(new Error('Controlled async scheduler refusal.'))
        }
        if (fault === 'false') {
          return false
        }
        return undefined
      }),
      (error: unknown) => error instanceof AppUpdateRelaunchError && error.outcome === 'uncertain',
    )
    assert.equal(calls, 1)
    assert.deepEqual(
      {
        backup: await witness(f.active.backupPath),
        current: await witness(f.currentAppImage),
        source: await witness(f.source),
      },
      before,
    )
    assert.equal(await journalState(f.active.stagingDirectory), 'relaunching')
    await assert.rejects(f.active.rollback())
    await assert.rejects(
      f.active.handoffRelaunch(() => {
        calls++
        return true
      }),
    )
    assert.equal(calls, 1)
  })
}

for (const fault of [
  'current-same-bytes',
  'backup-same-bytes',
  'backup-bytes',
  'journal',
  'release-envelope.json',
  'release-notes.json',
] as const) {
  test(`${fault} tamper refuses before the relaunch scheduler and retains the foreign material`, async (t) => {
    const f = await fixture(t)
    switch (fault) {
      case 'backup-bytes': {
        const bytes = await fs.readFile(f.active.backupPath)
        bytes[100] = (bytes[100] ?? 0) ^ 1
        await fs.writeFile(f.active.backupPath, bytes)

        break
      }
      case 'journal': {
        const journal = path.join(f.active.stagingDirectory, 'journal.json')
        await fs.appendFile(journal, '\n')

        break
      }
      case 'release-envelope.json':
      case 'release-notes.json': {
        const filename = path.join(f.active.stagingDirectory, fault)
        const bytes = await fs.readFile(filename)
        await fs.rename(filename, path.join(f.root, `retained-${fault}`))
        await fs.writeFile(filename, bytes, { mode: 0o600 })

        break
      }
      default: {
        const filename = fault === 'current-same-bytes' ? f.currentAppImage : f.active.backupPath
        const bytes = await fs.readFile(filename)
        await fs.rename(filename, path.join(f.root, 'retained-foreign-source.AppImage'))
        await fs.writeFile(filename, bytes, {
          mode: fault === 'current-same-bytes' ? 0o755 : 0o600,
        })
      }
    }
    const before = {
      backup: await witness(f.active.backupPath),
      current: await witness(f.currentAppImage),
      source: await witness(f.source),
    }
    let calls = 0
    await assert.rejects(
      f.active.handoffRelaunch(() => {
        calls++
        return true
      }),
      (error: unknown) =>
        error instanceof AppUpdateRelaunchError && error.outcome === 'not-attempted',
    )
    assert.equal(calls, 0)
    assert.deepEqual(
      {
        backup: await witness(f.active.backupPath),
        current: await witness(f.currentAppImage),
        source: await witness(f.source),
      },
      before,
    )
  })
}

test('explicit copied rollback remains available before any relaunch attempt', async (t) => {
  const f = await fixture(t)
  const result = await f.active.rollback()
  await result.verifyCompleteSnapshot()
  assert.equal((await witness(f.currentAppImage)).sha512, sha(f.oldBytes))
  let calls = 0
  await assert.rejects(
    f.active.handoffRelaunch(() => {
      calls++
      return true
    }),
  )
  assert.equal(calls, 0)
  await noFailedMarker(result.stagingDirectory)
})
