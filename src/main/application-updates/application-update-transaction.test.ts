/**
 * Private filesystem transaction tests. Full typed manifests and artifact revocation callbacks are
 * controlled ports; signature/provider admission is tested separately. Synthetic ELF64/AI2 fixtures
 * are never executed or shipped. Held descriptors prove ordinary POSIX file behavior, not FUSE or a
 * running packaged app. No global filesystem mocks, foreign processes or crash hooks are used.
 *
 * Fresh InvokeAI4875d965: install_staging_ledger.py claim/_write_marker/begin_transfer,
 * model_install_default.py _install_path_with_info_claimed/_restore_moved_path callers, and
 * util/no_replace.py. Durable claims, copied restoration and refusal to overwrite foreign files are
 * adapted by the production owner; these tests observe that owner through its public methods.
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
  stageVerifiedApplicationArtifact,
} from './application-update-staging.js'

const hash = (bytes: Buffer) => createHash('sha512').update(bytes).digest('base64')

type Fixture = Awaited<ReturnType<typeof fixture>>

function image(marker: number, length = 4096): Buffer {
  const bytes = Buffer.alloc(length, marker)
  bytes.fill(0, 0, 64)
  bytes.set([0x7f, 69, 76, 70, 2, 1, 1, 0, 65, 73, 2])
  bytes.writeUInt16LE(3, 16)
  bytes.writeUInt16LE(62, 18)
  bytes.writeUInt32LE(1, 20)
  bytes.writeUInt16LE(64, 52)
  bytes.writeUInt16LE(56, 54)
  bytes.writeUInt16LE(64, 58)
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
    // Controlled v1 fixture; no native runtime authentication is claimed.
    runtimeFiles: Object.freeze({
      archive: Object.freeze({ sha512: Buffer.alloc(64).toString('base64'), sizeBytes: 1 }),
      executable: Object.freeze({ sha512: Buffer.alloc(64).toString('base64'), sizeBytes: 1 }),
    }),
    verifyCompleteSnapshot: async () => undefined,
  })
}

async function witness(file: string) {
  const info = await fs.lstat(file, { bigint: true })
  return {
    ctimeNs: info.ctimeNs,
    identity: `${info.dev}:${info.ino}`,
    mode: Number(info.mode & 0o777n),
    mtimeNs: info.mtimeNs,
    nlink: info.nlink,
    sha512: hash(await fs.readFile(file)),
    sizeBytes: info.size,
  }
}

async function fixture(t: Pick<TestContext, 'after'>) {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'igs-app-update-transaction-'))
  t.after(() => fs.rm(root, { force: true, recursive: true }))
  const parent = path.join(root, 'applications')
  const cache = path.join(root, 'cache')
  await fs.mkdir(parent, { mode: 0o700 })
  await fs.mkdir(cache, { mode: 0o700 })
  const currentAppImage = path.join(parent, 'Owned.Current.AppImage')
  const source = path.join(cache, 'Owned.Next.AppImage')
  const oldBytes = image(17)
  const newBytes = image(29, 2 * 1024 * 1024 + 97)
  await fs.writeFile(currentAppImage, oldBytes, { mode: 0o755 })
  await fs.writeFile(source, newBytes, { mode: 0o755 })
  await fs.chmod(currentAppImage, 0o755)
  await fs.chmod(source, 0o755)
  const notes = 'Owned filesystem transaction; synthetic body is never executed.'
  const notesJson = canonicalRuntimeReleaseJson(notes)
  const manifest: ApplicationReleaseManifest = Object.freeze({
    appId: 'studio.imagegen.desktop',
    artifact: Object.freeze({
      filename: path.basename(source),
      sha512: hash(newBytes),
      sizeBytes: newBytes.length,
    }),
    compatibility: Object.freeze({
      cpuWorkerProtocolVersion: '1',
      databaseMigrations: Object.freeze([]),
      inferenceWorkerProtocolVersion: '1',
      projectSchemaVersion: 1,
      runtimeValidation: 'after-restart',
    }),
    releaseId: 'owned-filesystem-transaction',
    releaseNotesSha256: createHash('sha256').update(notesJson).digest('hex'),
    schemaVersion: 1,
    scope: 'application-release',
    target: Object.freeze({ arch: 'x64', format: 'AppImage', os: 'linux' }),
    version: '0.2.0',
  })
  const { privateKey } = generateKeyPairSync('ed25519')
  const payload = canonicalRuntimeReleaseJson(manifest)
  const releaseAuthority = Object.freeze({
    envelope: canonicalRuntimeReleaseJson({
      keyId: 'owned-transaction-key',
      payload: payload.toString('base64'),
      schemaVersion: 1,
      signature: sign(null, payload, privateKey).toString('base64'),
    }).toString('utf8'),
    releaseNotesJson: notesJson.toString('utf8'),
  })
  const authority: { calls: number; onVerify?: () => Promise<void>; revoked: boolean } = {
    calls: 0,
    revoked: false,
  }
  const artifact: VerifiedApplicationArtifact = Object.freeze({
    authority: releaseAuthority,
    manifest,
    path: source,
    verifyCompleteSnapshot: async () => {
      authority.calls += 1
      if (authority.revoked) {
        throw new Error('Owned artifact authority revoked.')
      }
      await authority.onVerify?.()
    },
  })
  const currentSource = await fixtureCurrentSource(currentAppImage)
  return {
    artifact,
    authority,
    currentAppImage,
    currentSource,
    manifest,
    newBytes,
    oldBytes,
    parent,
    root,
    source,
  }
}

async function prepared(f: Fixture) {
  return await stageVerifiedApplicationArtifact({
    artifact: f.artifact,
    currentAppImage: f.currentAppImage,
    currentSource: f.currentSource,
  })
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

async function reachedGate(entered: Promise<void>, operation: Promise<unknown>) {
  await Promise.race([
    entered,
    operation.then(() => {
      throw new Error('Operation settled before reaching its causal gate.')
    }),
  ])
}

async function phase(directory: string): Promise<unknown> {
  const record = JSON.parse(
    await fs.readFile(path.join(directory, 'journal.json'), 'utf8'),
  ) as Record<string, unknown>
  return record['state']
}

test('prepared backup activation rollback cycle preserves originals and uses fresh retained copies', async (t) => {
  const f = await fixture(t)
  const old = await witness(f.currentAppImage)
  const cache = await witness(f.source)
  const oldDescriptor = await fs.open(f.currentAppImage, 'r')
  let newDescriptor: fs.FileHandle | undefined
  try {
    const staged = await prepared(f)
    assert.equal(await phase(staged.stagingDirectory), 'prepared')
    const candidate = await witness(staged.candidatePath)
    const backed = await staged.prepareBackup()
    assert.equal(Object.isFrozen(backed), true)
    assert.equal(await phase(backed.stagingDirectory), 'backed-up')
    const backup = await witness(backed.backupPath)
    assert.equal(backup.sha512, old.sha512)
    assert.equal(backup.mode, 0o600)
    assert.equal(backup.nlink, 1n)
    assert.notEqual(backup.identity, old.identity)
    assert.notEqual(backup.identity, candidate.identity)
    assert.deepEqual(await witness(f.currentAppImage), old)
    assert.deepEqual(await witness(f.source), cache)
    let closeChecks = 0
    const active = await backed.activate(() => {
      closeChecks += 1
      assert.equal(
        readFileSync(f.currentAppImage).equals(f.oldBytes),
        true,
        'Old target remains at its original pathname before publication.',
      )
      if (closeChecks === 1) {
        assert.equal(
          lstatSync(staged.candidatePath).mode & 0o777,
          0o600,
          'Initial close refusal must precede executable candidate permissions.',
        )
      }
    })
    assert.ok(closeChecks >= 1)
    assert.equal(Object.isFrozen(active), true)
    assert.equal(active.currentAppImage, f.currentAppImage)
    assert.equal(await phase(active.stagingDirectory), 'activated')
    const installed = await witness(f.currentAppImage)
    assert.equal(installed.sha512, hash(f.newBytes))
    assert.equal(installed.mode, 0o755)
    assert.equal(installed.identity, candidate.identity)
    assert.equal(
      (await oldDescriptor.readFile()).equals(f.oldBytes),
      true,
      'An open old-file FD survives the real atomic pathname replacement.',
    )
    assert.deepEqual(await witness(backed.backupPath), backup)
    assert.deepEqual(await witness(f.source), cache)
    await active.verifyCompleteSnapshot()
    newDescriptor = await fs.open(f.currentAppImage, 'r')
    const rolled = await active.rollback()
    assert.equal(Object.isFrozen(rolled), true)
    assert.equal(rolled.currentAppImage, f.currentAppImage)
    assert.equal(await phase(rolled.stagingDirectory), 'rolled-back')
    const restored = await witness(f.currentAppImage)
    assert.equal(restored.sha512, old.sha512)
    assert.equal(restored.mode, 0o755)
    assert.notEqual(restored.identity, old.identity)
    assert.notEqual(restored.identity, backup.identity)
    assert.notEqual(restored.identity, installed.identity)
    assert.equal((await newDescriptor.readFile()).equals(f.newBytes), true)
    assert.deepEqual(await witness(backed.backupPath), backup)
    assert.deepEqual(await witness(f.source), cache)
    await rolled.verifyCompleteSnapshot()
  } finally {
    await newDescriptor?.close()
    await oldDescriptor.close()
  }
})

test('close-gate refusal happens before candidate chmod or target replacement', async (t) => {
  const f = await fixture(t)
  const staged = await prepared(f)
  const backed = await staged.prepareBackup()
  const before = {
    backup: await witness(backed.backupPath),
    cache: await witness(f.source),
    candidate: await witness(staged.candidatePath),
    old: await witness(f.currentAppImage),
  }
  let entered = false
  await assert.rejects(
    backed.activate(() => {
      entered = true
      assert.equal(readFileSync(f.currentAppImage).equals(f.oldBytes), true)
      assert.equal(lstatSync(staged.candidatePath).mode & 0o777, 0o600)
      throw new Error('Owned application-close guard refused.')
    }),
  )
  assert.equal(entered, true)
  assert.deepEqual(
    {
      backup: await witness(backed.backupPath),
      cache: await witness(f.source),
      candidate: await witness(staged.candidatePath),
      old: await witness(f.currentAppImage),
    },
    before,
  )
  await backed.verifyCompleteSnapshot()
  const active = await backed.activate(() => undefined)
  await active.verifyCompleteSnapshot()
})

test('a thenable close assertion is refused before changes and leaves the backed-up owner retryable', async (t) => {
  const f = await fixture(t)
  const staged = await prepared(f)
  const backed = await staged.prepareBackup()
  const before = {
    backup: await witness(backed.backupPath),
    candidate: await witness(staged.candidatePath),
    old: await witness(f.currentAppImage),
  }
  // A resolved Promise detects the forbidden async contract without an unhandled rejection.
  await assert.rejects(backed.activate(() => Promise.resolve()))
  assert.deepEqual(
    {
      backup: await witness(backed.backupPath),
      candidate: await witness(staged.candidatePath),
      old: await witness(f.currentAppImage),
    },
    before,
  )
  await backed.verifyCompleteSnapshot()
  const active = await backed.activate(() => undefined)
  await active.verifyCompleteSnapshot()
})

test('late close-state or artifact-authority changes after the initial assertion cannot publish', async (t) => {
  for (const fault of ['close-state', 'authority'] as const) {
    await t.test(fault, async (subtest) => {
      const f = await fixture(subtest)
      const backed = await (await prepared(f)).prepareBackup()
      const before = {
        backup: await witness(backed.backupPath),
        cache: await witness(f.source),
        old: await witness(f.currentAppImage),
      }
      let closeAllowed = true
      let closeAssertions = 0
      let reachedLateAuthority = false
      f.authority.onVerify = async () => {
        if (closeAssertions === 0) {
          return
        }
        reachedLateAuthority = true
        if (fault === 'close-state') {
          closeAllowed = false
        } else {
          throw new Error('Owned artifact revoked after the initial close assertion.')
        }
      }
      await assert.rejects(
        backed.activate(() => {
          closeAssertions += 1
          if (!closeAllowed) {
            throw new Error('Owned application-close state changed.')
          }
        }),
      )
      assert.equal(reachedLateAuthority, true)
      assert.ok(closeAssertions >= (fault === 'close-state' ? 2 : 1))
      assert.deepEqual(
        {
          backup: await witness(backed.backupPath),
          cache: await witness(f.source),
          old: await witness(f.currentAppImage),
        },
        before,
      )
    })
  }
})

test('activated verification and rollback no longer depend on revoked or deleted native cache authority', async (t) => {
  const f = await fixture(t)
  const staged = await prepared(f)
  const backed = await staged.prepareBackup()
  const active = await backed.activate(() => undefined)
  const backup = await witness(active.backupPath)
  const callsAfterActivation = f.authority.calls
  f.authority.revoked = true
  await fs.unlink(f.source)
  await active.verifyCompleteSnapshot()
  const rolled = await active.rollback()
  await rolled.verifyCompleteSnapshot()
  assert.equal(f.authority.calls, callsAfterActivation)
  assert.equal((await witness(f.currentAppImage)).sha512, hash(f.oldBytes))
  assert.deepEqual(await witness(rolled.backupPath), backup)
})

test('consumed capabilities and duplicate operations refuse without poisoning the current owner', async (t) => {
  const f = await fixture(t)
  const staged = await prepared(f)
  const backed = await staged.prepareBackup()
  await assert.rejects(staged.verifyCompleteSnapshot())
  await assert.rejects(staged.prepareBackup())
  await backed.verifyCompleteSnapshot()
  let duplicateCloseCalls = 0
  const active = await backed.activate(() => undefined)
  await assert.rejects(staged.verifyCompleteSnapshot())
  await assert.rejects(backed.verifyCompleteSnapshot())
  await assert.rejects(
    backed.activate(() => {
      duplicateCloseCalls += 1
    }),
  )
  assert.equal(duplicateCloseCalls, 0)
  await active.verifyCompleteSnapshot()
  const rolled = await active.rollback()
  await assert.rejects(active.verifyCompleteSnapshot())
  await assert.rejects(active.rollback())
  await rolled.verifyCompleteSnapshot()
  assert.equal(await phase(rolled.stagingDirectory), 'rolled-back')
})

test('backup preparation is exclusive while its real authority callback awaits; old-cap checks do not poison it', async (t) => {
  const f = await fixture(t)
  const staged = await prepared(f)
  const entered = deferred()
  const release = deferred()
  let held = false
  f.authority.onVerify = async () => {
    if (held) {
      return
    }
    held = true
    entered.resolve()
    await release.promise
  }
  const operation = staged.prepareBackup()
  try {
    await reachedGate(entered.promise, operation)
    assert.equal(staged.prepareBackup(), operation)
    await assert.rejects(staged.verifyCompleteSnapshot())
  } finally {
    release.resolve()
    await operation.catch(() => undefined)
  }
  const backed = await operation
  await backed.verifyCompleteSnapshot()
  assert.equal((await witness(backed.backupPath)).sha512, hash(f.oldBytes))
})

test('activation awaiting artifact authority excludes duplicate intents and obsolete verifiers without poisoning publication', async (t) => {
  const f = await fixture(t)
  const staged = await prepared(f)
  const backed = await staged.prepareBackup()
  const entered = deferred()
  const release = deferred()
  let held = false
  f.authority.onVerify = async () => {
    if (held) {
      return
    }
    held = true
    entered.resolve()
    await release.promise
  }
  const operation = backed.activate(() => undefined)
  let duplicateCloseCalls = 0
  try {
    await reachedGate(entered.promise, operation)
    assert.equal(
      backed.activate(() => {
        duplicateCloseCalls += 1
      }),
      operation,
    )
    await assert.rejects(backed.verifyCompleteSnapshot())
    await assert.rejects(staged.verifyCompleteSnapshot())
    await assert.rejects(staged.prepareBackup())
    assert.equal(duplicateCloseCalls, 0)
  } finally {
    release.resolve()
    await operation.catch(() => undefined)
  }
  const active = await operation
  await active.verifyCompleteSnapshot()
  assert.equal((await witness(f.currentAppImage)).sha512, hash(f.newBytes))
})

test('same-turn duplicate rollback and obsolete verification cannot poison the legitimate rollback owner', async (t) => {
  const f = await fixture(t)
  const backed = await (await prepared(f)).prepareBackup()
  const active = await backed.activate(() => undefined)
  const operation = active.rollback()
  void operation.catch(() => undefined)
  assert.equal(active.rollback(), operation)
  await assert.rejects(active.verifyCompleteSnapshot())
  const rolled = await operation
  await rolled.verifyCompleteSnapshot()
  assert.equal(await phase(rolled.stagingDirectory), 'rolled-back')
  assert.equal((await witness(f.currentAppImage)).sha512, hash(f.oldBytes))
})

test('foreign same-byte current inode before activation is preserved instead of overwritten', async (t) => {
  const f = await fixture(t)
  const staged = await prepared(f)
  const backed = await staged.prepareBackup()
  await fs.rename(f.currentAppImage, path.join(f.root, 'retained-original.AppImage'))
  await fs.writeFile(f.currentAppImage, f.oldBytes, { mode: 0o755 })
  await fs.chmod(f.currentAppImage, 0o755)
  const foreign = await witness(f.currentAppImage)
  const backup = await witness(backed.backupPath)
  const cache = await witness(f.source)
  await assert.rejects(backed.activate(() => undefined))
  assert.deepEqual(await witness(f.currentAppImage), foreign)
  assert.deepEqual(await witness(f.source), cache)
  assert.deepEqual(await witness(backed.backupPath), backup)
})

test('foreign same-byte current inode before rollback is preserved instead of overwritten', async (t) => {
  const f = await fixture(t)
  const backed = await (await prepared(f)).prepareBackup()
  const active = await backed.activate(() => undefined)
  await fs.rename(f.currentAppImage, path.join(f.root, 'retained-activated.AppImage'))
  await fs.writeFile(f.currentAppImage, f.newBytes, { mode: 0o755 })
  await fs.chmod(f.currentAppImage, 0o755)
  const foreign = await witness(f.currentAppImage)
  const backup = await witness(active.backupPath)
  await assert.rejects(active.rollback())
  assert.deepEqual(await witness(f.currentAppImage), foreign)
  assert.deepEqual(await witness(active.backupPath), backup)
})

test('modified or replaced backup refuses activation and rollback without repairing it silently', async (t) => {
  for (const at of ['before-activation', 'before-rollback'] as const) {
    for (const fault of ['bytes', 'same-byte-inode'] as const) {
      await t.test(`${at}/${fault}`, async (subtest) => {
        const f = await fixture(subtest)
        const backed = await (await prepared(f)).prepareBackup()
        const active = at === 'before-rollback' ? await backed.activate(() => undefined) : null
        const bytes = await fs.readFile(backed.backupPath)
        if (fault === 'same-byte-inode') {
          await fs.rename(backed.backupPath, path.join(f.root, 'retained-backup.AppImage'))
          await fs.writeFile(backed.backupPath, bytes, { mode: 0o600 })
        } else {
          bytes[100] = (bytes[100] ?? 0) ^ 1
          await fs.writeFile(backed.backupPath, bytes)
        }
        const current = await witness(f.currentAppImage)
        const backup = await witness(backed.backupPath)
        const cache = await witness(f.source)
        await assert.rejects(active ? active.rollback() : backed.activate(() => undefined))
        assert.deepEqual(await witness(f.currentAppImage), current)
        assert.deepEqual(await witness(backed.backupPath), backup)
        assert.deepEqual(await witness(f.source), cache)
      })
    }
  }
})

test('persisted signed authority remains part of activation and rollback capabilities', async (t) => {
  for (const at of ['before-activation', 'before-rollback'] as const) {
    for (const member of ['release-envelope.json', 'release-notes.json']) {
      for (const fault of ['bytes', 'same-byte-inode']) {
        await t.test(`${at}/${member}/${fault}`, async (subtest) => {
          const f = await fixture(subtest)
          const backed = await (await prepared(f)).prepareBackup()
          const active = at === 'before-rollback' ? await backed.activate(() => undefined) : null
          await (active ?? backed).verifyCompleteSnapshot()
          const filename = path.join(backed.stagingDirectory, member)
          const bytes = await fs.readFile(filename)
          if (fault === 'same-byte-inode') {
            await fs.rename(filename, path.join(f.root, `retained-${member}`))
            await fs.writeFile(filename, bytes, { mode: 0o600 })
          } else {
            await fs.appendFile(filename, ' ')
          }
          const before = {
            authority: await witness(filename),
            backup: await witness(backed.backupPath),
            cache: await witness(f.source),
            current: await witness(f.currentAppImage),
          }
          await assert.rejects(active ? active.rollback() : backed.activate(() => undefined))
          assert.deepEqual(
            {
              authority: await witness(filename),
              backup: await witness(backed.backupPath),
              cache: await witness(f.source),
              current: await witness(f.currentAppImage),
            },
            before,
          )
        })
      }
    }
  }
})
