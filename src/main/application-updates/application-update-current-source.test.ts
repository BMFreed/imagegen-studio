/**
 * Real tiny regular files and synthetic non-runnable AppImage headers. This exercises captured
 * FD/path/byte consistency, not Electron ASAR discovery, loaded V8 identity or signature
 * equivalence. Invoke4875 rasterSnapshotCapture.ts and
 * engine/generationComposite/prepareCanvasInvocation callers supply capture/revalidation; the
 * existing staging owner supplies held-FD/anchored-file checks. Nothing executes an AppImage,
 * starts a worker or touches ordinary application data.
 */
import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { fstatSync, readdirSync, readFileSync, readlinkSync, writeFileSync } from 'node:fs'
import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test, type TestContext } from 'node:test'

import type { ApplicationReleaseManifest } from './application-release.js'
import type { VerifiedApplicationArtifact } from './electron-update-checker.js'

import { canonicalRuntimeReleaseJson } from '../runtime/runtime-release.js'
import {
  AppUpdateCurrentSourceError,
  captureApplicationUpdateCurrentSource,
  stageVerifiedApplicationArtifact,
} from './application-update-staging.js'

const sha512 = (bytes: Buffer) => createHash('sha512').update(bytes).digest('base64')

type Fixture = Awaited<ReturnType<typeof fixture>>

function image(marker: number) {
  const bytes = Buffer.alloc(4096, marker)
  bytes.fill(0, 0, 64)
  bytes.set([127, 69, 76, 70, 2, 1, 1, 0, 65, 73, 2])
  bytes.writeUInt16LE(3, 16)
  bytes.writeUInt16LE(62, 18)
  bytes.writeUInt32LE(1, 20)
  bytes.writeUInt16LE(64, 52)
  return bytes
}
async function fixture(t: Pick<TestContext, 'after'>) {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'igs-current-source-'))
  const applications = path.join(root, 'Applications')
  const runtime = path.join(root, 'runtime')
  await fs.mkdir(applications, { mode: 0o700 })
  await fs.mkdir(runtime, { mode: 0o700 })
  const currentAppImage = path.join(applications, 'Current.AppImage')
  const archivePath = path.join(runtime, 'app.asar')
  const executablePath = path.join(runtime, 'electron')
  const oldBytes = image(17)
  await fs.writeFile(currentAppImage, oldBytes, { mode: 0o755 })
  await fs.chmod(currentAppImage, 0o755)
  await fs.writeFile(archivePath, 'Owned tiny physical archive bytes.', { mode: 0o600 })
  await fs.writeFile(executablePath, 'Owned tiny executable observation, never executed.', {
    mode: 0o600,
  })
  const archive = await fs.open(archivePath, 'r')
  const executable = await fs.open(executablePath, 'r')
  const captures: ReturnType<typeof captureApplicationUpdateCurrentSource>[] = []
  const extraHandles: fs.FileHandle[] = []
  const input = {
    archiveFd: archive.fd,
    archivePath,
    currentAppImage,
    executableFd: executable.fd,
    executablePath,
  }
  const capture = () => {
    const value = captureApplicationUpdateCurrentSource(input)
    captures.push(value)
    return value
  }
  t.after(async () => {
    for (const value of captures) {
      value.dispose()
    }
    for (const handle of [archive, executable, ...extraHandles]) {
      await handle.close().catch(() => undefined)
    }
    await fs.rm(root, { force: true, recursive: true })
  })
  return {
    applications,
    archive,
    archivePath,
    capture,
    currentAppImage,
    executable,
    executablePath,
    extraHandles,
    input,
    oldBytes,
    root,
    runtime,
  }
}

async function witness(file: string) {
  const info = await fs.lstat(file, { bigint: true })
  return {
    ctimeNs: info.ctimeNs,
    dev: info.dev,
    ino: info.ino,
    mode: info.mode,
    mtimeNs: info.mtimeNs,
    nlink: info.nlink,
    sha512: sha512(await fs.readFile(file)),
    size: info.size,
  }
}
function ownedDescriptors(f: Fixture) {
  return readdirSync('/proc/self/fd').filter((fd) => {
    try {
      return readlinkSync(`/proc/self/fd/${fd}`).startsWith(f.root + path.sep)
    } catch {
      return false
    }
  }).length
}
const changed = (error: unknown) => error instanceof AppUpdateCurrentSourceError

async function packagedRuntimeModes(f: Fixture) {
  // Real producer R1 exposes archive0664 and resources0775; preserve those bit patterns.
  await fs.chmod(f.runtime, 0o775)
  await fs.chmod(f.archivePath, 0o664)
  await fs.chmod(f.executablePath, 0o775)
}

async function signedArtifact(f: Fixture): Promise<VerifiedApplicationArtifact> {
  const body = image(41)
  const filename = path.join(f.root, 'Next.AppImage')
  await fs.writeFile(filename, body, { mode: 0o600 })
  const notes = canonicalRuntimeReleaseJson('Owned source-guard transaction fixture.')
  const manifest: ApplicationReleaseManifest = {
    appId: 'studio.imagegen.desktop',
    artifact: { filename: path.basename(filename), sha512: sha512(body), sizeBytes: body.length },
    compatibility: {
      cpuWorkerProtocolVersion: '1',
      databaseMigrations: [],
      inferenceWorkerProtocolVersion: '1',
      projectSchemaVersion: 1,
      runtimeValidation: 'after-restart',
    },
    releaseId: 'owned-source-guard',
    releaseNotesSha256: createHash('sha256').update(notes).digest('hex'),
    schemaVersion: 1,
    scope: 'application-release',
    target: { arch: 'x64', format: 'AppImage', os: 'linux' },
    version: '0.2.0',
  }
  const payload = canonicalRuntimeReleaseJson(manifest)
  const { privateKey } = generateKeyPairSync('ed25519')
  return Object.freeze({
    authority: Object.freeze({
      envelope: canonicalRuntimeReleaseJson({
        keyId: 'owned-source-key',
        payload: payload.toString('base64'),
        schemaVersion: 1,
        signature: sign(null, payload, privateKey).toString('base64'),
      }).toString('utf8'),
      releaseNotesJson: notes.toString('utf8'),
    }),
    manifest,
    path: filename,
    verifyCompleteSnapshot: async () =>
      assert.equal(sha512(await fs.readFile(filename)), manifest.artifact.sha512),
  })
}

test('capture is synchronous; complete memoizes full snapshots and never changes borrowed offsets or closes them', async (t) => {
  const f = await fixture(t)
  const before = await Promise.all(
    [f.currentAppImage, f.archivePath, f.executablePath].map(witness),
  )
  const archiveByte = Buffer.alloc(1)
  const executableByte = Buffer.alloc(1)
  await f.archive.read(archiveByte, 0, 1, null)
  await f.executable.read(executableByte, 0, 1, null)
  const baselineFds = ownedDescriptors(f)
  const capture = f.capture()
  assert.equal(Object.isFrozen(capture), true)
  assert.equal(ownedDescriptors(f), baselineFds + 6)
  const complete = capture.complete()
  assert.equal(capture.complete(), complete)
  const cap = await complete
  assert.equal(Object.isFrozen(cap), true)
  assert.equal(Object.isFrozen(cap.currentImage.identity), true)
  assert.equal(cap.currentAppImage, f.currentAppImage)
  assert.equal(cap.currentImage.sha512, sha512(f.oldBytes))
  await cap.verifyCompleteSnapshot()
  cap.assertCurrentSnapshot()
  await f.archive.read(archiveByte, 0, 1, null)
  await f.executable.read(executableByte, 0, 1, null)
  assert.equal(archiveByte[0], readFileSync(f.archivePath)[1])
  assert.equal(executableByte[0], readFileSync(f.executablePath)[1])
  assert.deepEqual(
    await Promise.all([f.currentAppImage, f.archivePath, f.executablePath].map(witness)),
    before,
  )
  cap.dispose()
  capture.dispose()
  cap.dispose()
  assert.equal(ownedDescriptors(f), baselineFds)
  assert.equal(fstatSync(f.archive.fd).isFile(), true)
  assert.equal(fstatSync(f.executable.fd).isFile(), true)
  assert.throws(() => cap.assertCurrentSnapshot(), changed)
  await assert.rejects(cap.verifyCompleteSnapshot(), changed)
})

for (const member of ['currentAppImage', 'archivePath', 'executablePath'] as const) {
  for (const fault of ['bytes', 'same-byte-inode'] as const) {
    for (const at of ['before-complete', 'after-complete'] as const) {
      test(`${member}/${fault}/${at} permanently refuses without rebase`, async (t) => {
        const f = await fixture(t)
        const captured = f.capture()
        const cap = at === 'after-complete' ? await captured.complete() : null
        const filename = f[member]
        const bytes = await fs.readFile(filename)
        if (fault === 'same-byte-inode') {
          await fs.rename(filename, path.join(f.root, 'retained-original'))
          await fs.writeFile(filename, bytes, {
            mode: member === 'currentAppImage' ? 0o755 : 0o600,
          })
          if (member === 'currentAppImage') {
            await fs.chmod(filename, 0o755)
          }
        } else {
          const changedBytes = Buffer.from(bytes)
          changedBytes[changedBytes.length - 1] ^= 1
          await fs.writeFile(filename, changedBytes)
        }
        const foreign = await witness(filename)
        if (cap) {
          await assert.rejects(cap.verifyCompleteSnapshot(), changed)
          assert.throws(cap.assertCurrentSnapshot, changed)
        } else {
          const first = captured.complete()
          assert.equal(captured.complete(), first)
          await assert.rejects(first, changed)
        }
        assert.deepEqual(await witness(filename), foreign)
        await fs.writeFile(filename, bytes)
        await (cap
          ? assert.rejects(cap.verifyCompleteSnapshot(), changed)
          : assert.rejects(captured.complete(), changed))
      })
    }
  }
}

test('borrowed FD closure/reuse refuses the captured capability and preserves the foreign descriptor', async (t) => {
  const f = await fixture(t)
  await packagedRuntimeModes(f)
  const cap = await f.capture().complete()
  const originalFd = f.archive.fd
  await f.archive.close()
  const foreign = path.join(f.root, 'foreign-file')
  await fs.writeFile(foreign, 'Foreign file retained after FD reuse.', { mode: 0o600 })
  const replacement = await fs.open(foreign, 'r')
  f.extraHandles.push(replacement)
  assert.equal(replacement.fd, originalFd)
  const before = await witness(foreign)
  await assert.rejects(cap.verifyCompleteSnapshot(), changed)
  cap.dispose()
  assert.equal((await replacement.stat()).isFile(), true)
  assert.deepEqual(await witness(foreign), before)
})

test('packaged runtime group-write bits are frozen consistency observations, not mutable-stage permission rules', async (t) => {
  const f = await fixture(t)
  await packagedRuntimeModes(f)
  const before = await Promise.all([f.archivePath, f.executablePath].map(witness))
  const captured = f.capture()
  const source = await captured.complete()
  await source.verifyCompleteSnapshot()
  source.assertCurrentSnapshot()
  assert.equal((await fs.stat(f.runtime)).mode & 0o777, 0o775)
  assert.equal((await fs.stat(f.archivePath)).mode & 0o777, 0o664)
  assert.equal((await fs.stat(f.executablePath)).mode & 0o777, 0o775)
  assert.deepEqual(await Promise.all([f.archivePath, f.executablePath].map(witness)), before)
  // Both modes are individually admissible at capture; changing the captured one still refuses.
  await fs.chmod(f.archivePath, 0o644)
  assert.throws(source.assertCurrentSnapshot, changed)
  await assert.rejects(source.verifyCompleteSnapshot(), changed)
})

for (const member of ['archivePath', 'executablePath', 'runtime'] as const) {
  test(`world-write runtime ${member} refuses without owned-FD leaks`, async (t) => {
    const f = await fixture(t)
    await packagedRuntimeModes(f)
    await fs.chmod(f[member], member === 'runtime' ? 0o777 : 0o666)
    const baseline = ownedDescriptors(f)
    assert.throws(f.capture, changed)
    assert.equal(ownedDescriptors(f), baseline)
    assert.equal((await f.archive.stat()).isFile(), true)
    assert.equal((await f.executable.stat()).isFile(), true)
  })
}

test('group-write runtime support does not relax the current AppImage or its mutable parent', async (t) => {
  const f = await fixture(t)
  await packagedRuntimeModes(f)
  await fs.chmod(f.applications, 0o775)
  assert.throws(f.capture, changed)
  await fs.chmod(f.applications, 0o700)
  await fs.chmod(f.currentAppImage, 0o775)
  assert.throws(f.capture, changed)
})

test('dispose during a pending positional read rejects and closes only duplicates after settlement', async (t) => {
  const f = await fixture(t)
  const baseline = ownedDescriptors(f)
  const capture = f.capture()
  const cap = await capture.complete()
  const verification = cap.verifyCompleteSnapshot()
  capture.dispose()
  cap.dispose()
  await assert.rejects(verification, changed)
  assert.equal(ownedDescriptors(f), baseline)
  assert.equal((await f.archive.stat()).isFile(), true)
  assert.equal((await f.executable.stat()).isFile(), true)
})

for (const fault of [
  'wrong-borrowed-fd',
  'missing-borrowed-fd',
  'symlink',
  'hardlink',
  'directory',
  'writable-runtime',
  'parent-replacement',
] as const) {
  test(`capture refuses unsafe ${fault} and leaks no owned descriptors`, async (t) => {
    const f = await fixture(t)
    switch (fault) {
      case 'hardlink': {
        await fs.link(f.archivePath, path.join(f.root, 'archive-alias'))
        break
      }
      case 'missing-borrowed-fd': {
        f.input.archiveFd = undefined as unknown as number
        break
      }
      case 'parent-replacement': {
        await fs.rename(f.runtime, path.join(f.root, 'retained-runtime'))
        await fs.mkdir(f.runtime, { mode: 0o700 })

        break
      }
      case 'writable-runtime': {
        await fs.chmod(f.archivePath, 0o666)
        break
      }
      case 'wrong-borrowed-fd': {
        f.input.archiveFd = f.executable.fd
        break
      }
      default: {
        const held = path.join(f.root, 'retained-archive')
        await fs.rename(f.archivePath, held)
        await (fault === 'symlink'
          ? fs.symlink(held, f.archivePath)
          : fs.mkdir(f.archivePath, { mode: 0o700 }))
      }
    }
    const baseline = ownedDescriptors(f)
    assert.throws(f.capture, changed)
    assert.equal(ownedDescriptors(f), baseline)
    assert.equal((await f.archive.stat()).isFile(), true)
    assert.equal((await f.executable.stat()).isFile(), true)
  })
}

test('current source substitution refuses before any new stage or candidate exists', async (t) => {
  const f = await fixture(t)
  const artifact = await signedArtifact(f)
  const currentSource = await f.capture().complete()
  await fs.appendFile(f.archivePath, ' changed')
  const current = await witness(f.currentAppImage)
  await assert.rejects(
    stageVerifiedApplicationArtifact({
      artifact,
      currentAppImage: f.currentAppImage,
      currentSource,
    }),
  )
  assert.deepEqual(await fs.readdir(f.applications), ['Current.AppImage'])
  assert.deepEqual(await witness(f.currentAppImage), current)
})

test('last synchronous close callback cannot substitute source before actual activation rename', async (t) => {
  const f = await fixture(t)
  const artifact = await signedArtifact(f)
  const currentSource = await f.capture().complete()
  const staged = await stageVerifiedApplicationArtifact({
    artifact,
    currentAppImage: f.currentAppImage,
    currentSource,
  })
  const backed = await staged.prepareBackup()
  const current = await witness(f.currentAppImage)
  let closeChecks = 0
  await assert.rejects(
    backed.activate(() => {
      if (++closeChecks === 2) {
        writeFileSync(f.archivePath, 'Own post-await source mutation.')
      }
    }),
  )
  assert.equal(closeChecks, 2)
  assert.deepEqual(await witness(f.currentAppImage), current)
  assert.equal((await fs.lstat(backed.backupPath)).isFile(), true)
  assert.equal((await fs.lstat(backed.candidatePath)).isFile(), true)
})

for (const consumer of ['rollback', 'handoff'] as const) {
  test(`legitimate activation consumes old source guard before ${consumer}`, async (t) => {
    const f = await fixture(t)
    await packagedRuntimeModes(f)
    const artifact = await signedArtifact(f)
    const currentSource = await f.capture().complete()
    const staged = await stageVerifiedApplicationArtifact({
      artifact,
      currentAppImage: f.currentAppImage,
      currentSource,
    })
    const active = await (await staged.prepareBackup()).activate(() => undefined)
    await assert.rejects(currentSource.verifyCompleteSnapshot(), changed)
    await active.verifyCompleteSnapshot()
    if (consumer === 'rollback') {
      const restored = await active.rollback()
      await restored.verifyCompleteSnapshot()
      assert.equal(sha512(await fs.readFile(f.currentAppImage)), sha512(f.oldBytes))
    } else {
      let calls = 0
      await active.handoffRelaunch(() => {
        calls++
        return true
      })
      assert.equal(calls, 1)
    }
  })
}

for (const missing of ['archiveFd', 'executableFd'] as const) {
  test(`missing ${missing} refuses even when a fresh pathname open would admit 0755 files`, async (t) => {
    const f = await fixture(t)
    await fs.chmod(f.archivePath, 0o755)
    await fs.chmod(f.executablePath, 0o755)
    f.input[missing] = undefined as unknown as number
    assert.throws(() => f.capture(), changed)
    assert.equal(fstatSync(f.archive.fd).isFile(), true)
    assert.equal(fstatSync(f.executable.fd).isFile(), true)
  })
}

for (const replaced of [false, true]) {
  test(`expected-current binding ${replaced ? 'refuses a replacement' : 'admits unchanged source'} while upstream verifier remains green`, async (t) => {
    const f = await fixture(t)
    const observed = await f.capture().complete()
    const artifact = await signedArtifact(f)
    // A controlled upstream currency port isolates the actual downstream expected-image consumer.
    // Files, source observation, signed candidate and staging/publication owner remain real.
    const currentSource = Object.freeze({
      ...observed,
      assertCurrentSnapshot: () => undefined,
      verifyCompleteSnapshot: async () => undefined,
    })
    if (replaced) {
      await fs.rename(f.currentAppImage, path.join(f.root, 'original-current.AppImage'))
      await fs.writeFile(f.currentAppImage, f.oldBytes, { mode: 0o755 })
      await fs.chmod(f.currentAppImage, 0o755)
      assert.notEqual(
        String((await fs.stat(f.currentAppImage, { bigint: true })).ino),
        observed.currentImage.identity.ino,
      )
    }
    let outcome = 'admitted'
    try {
      await stageVerifiedApplicationArtifact({
        artifact,
        currentAppImage: f.currentAppImage,
        currentSource,
      })
    } catch (error) {
      assert.equal((error as { code?: unknown }).code, 'UNSAFE')
      outcome = 'refused'
    }
    t.diagnostic(`actual expected-current stage consumer: ${outcome}`)
    assert.equal(outcome, replaced ? 'refused' : 'admitted')
    if (replaced) {
      assert.deepEqual(await fs.readdir(f.applications), ['Current.AppImage'])
    }
  })
}
