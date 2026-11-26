/**
 * Real filesystem, offline Ed25519 authority and synthetic non-runnable ELF/AI2 bodies only. These
 * tests authenticate target bytes on disk; they never execute an application or establish
 * loaded-body identity, successful startup, compatibility, recovery or retirement authority. Fresh
 * InvokeAI4875d965: install_staging_ledger.py durable marker/conservative restoration and
 * model_install_default.py start/_restore_incomplete_installs callers; no_replace.py. The desktop
 * signature adapter is the disclosed existing canonical runtime-envelope verifier, not a journal
 * trust source. No production application data, network or worker is used.
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { once } from 'node:events'
import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test, type TestContext } from 'node:test'

import type {
  ApplicationReleaseRuntimeFiles,
  ApplicationReleaseTrust,
} from './application-release.js'
import type { VerifiedApplicationArtifact } from './electron-update-checker.js'

import { canonicalRuntimeReleaseJson } from '../runtime/runtime-release.js'
import { verifyApplicationReleaseAuthority } from './application-release.js'
import { acquireApplicationUpdateAdmission } from './application-update-admission.js'
import {
  type ApplicationUpdateCurrentSource,
  captureApplicationUpdateCurrentSource,
  inspectRetainedApplicationUpdate,
  stageVerifiedApplicationArtifact,
} from './application-update-staging.js'

const sha512 = (bytes: Buffer) => createHash('sha512').update(bytes).digest('base64')
const unverified = {
  runtimeAuthentication: 'unverified',
  status: 'retained',
  targetAuthentication: 'unverified',
}
const verified = {
  runtimeAuthentication: 'unverified',
  status: 'retained',
  targetAuthentication: 'verified',
}
const runtimeVerified = { ...verified, runtimeAuthentication: 'verified-publisher-declaration' }
const names = { envelope: 'release-envelope.json', releaseNotes: 'release-notes.json' } as const
const runtimeBodies = {
  archive: Buffer.from('Owned publisher-declared archive B; never loaded as V8.'),
  executable: Buffer.from('Owned publisher-declared executable B; never executed.'),
}
const declaredRuntimeFiles: ApplicationReleaseRuntimeFiles = Object.freeze({
  archive: Object.freeze({
    sha512: sha512(runtimeBodies.archive),
    sizeBytes: runtimeBodies.archive.length,
  }),
  executable: Object.freeze({
    sha512: sha512(runtimeBodies.executable),
    sizeBytes: runtimeBodies.executable.length,
  }),
})

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

function release(
  body: Buffer,
  notes: unknown = 'Owned offline startup fixture; never executed.',
  schemaVersion: 1 | 2 = 1,
) {
  const keys = generateKeyPairSync('ed25519')
  const trust: ApplicationReleaseTrust = {
    compatibility: {
      cpuWorkerProtocolVersion: '1',
      databaseMigrations: [],
      inferenceWorkerProtocolVersion: '1',
      projectSchemaVersion: 1,
    },
    trustedKeys: {
      'owned-startup-key': keys.publicKey.export({ format: 'pem', type: 'spki' }).toString(),
    },
  }
  const notesJson = canonicalRuntimeReleaseJson(notes).toString('utf8')
  const payload = {
    appId: 'studio.imagegen.desktop',
    artifact: { filename: 'next.AppImage', sha512: sha512(body), sizeBytes: body.length },
    compatibility: { ...trust.compatibility, runtimeValidation: 'after-restart' },
    releaseId: 'owned-startup-fixture',
    releaseNotesSha256: createHash('sha256').update(notesJson).digest('hex'),
    schemaVersion,
    ...(schemaVersion === 2 ? { runtimeFiles: declaredRuntimeFiles } : {}),
    scope: 'application-release',
    target: { arch: 'x64', format: 'AppImage', os: 'linux' },
    version: '0.2.0',
  }
  const envelopeFor = (
    value: unknown,
    keyId = 'owned-startup-key',
    privateKey = keys.privateKey,
  ) => {
    const bytes = canonicalRuntimeReleaseJson(value)
    return canonicalRuntimeReleaseJson({
      keyId,
      payload: bytes.toString('base64'),
      schemaVersion: 1,
      signature: sign(null, bytes, privateKey).toString('base64'),
    }).toString('utf8')
  }
  const authority = Object.freeze({ envelope: envelopeFor(payload), releaseNotesJson: notesJson })
  return {
    authority,
    envelopeFor,
    keys,
    manifest: verifyApplicationReleaseAuthority(authority, trust),
    payload,
    trust,
  }
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
    runtimeFiles: declaredRuntimeFiles,
    verifyCompleteSnapshot: async () => undefined,
  })
}

async function fixture(
  t: Pick<TestContext, 'after'>,
  notes?: unknown,
  paddedEnvelope = false,
  schemaVersion: 1 | 2 = 1,
) {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'igs-app-update-startup-'))
  const applications = path.join(root, 'applications')
  const cache = path.join(root, 'cache')
  await fs.mkdir(applications, { mode: 0o700 })
  await fs.mkdir(cache, { mode: 0o700 })
  const currentAppImage = path.join(applications, 'Current.AppImage')
  const source = path.join(cache, 'next.AppImage')
  const oldBytes = image(17)
  const newBytes = image(41)
  const releaseData = release(newBytes, notes, schemaVersion)
  const signed = {
    ...releaseData,
    authority: Object.freeze({
      ...releaseData.authority,
      envelope: paddedEnvelope
        ? releaseData.authority.envelope +
          ' '.repeat(1024 * 1024 - releaseData.authority.envelope.length)
        : releaseData.authority.envelope,
    }),
  }
  await fs.writeFile(currentAppImage, oldBytes, { mode: 0o755 })
  await fs.writeFile(source, newBytes, { mode: 0o755 })
  await fs.chmod(currentAppImage, 0o755)
  await fs.chmod(source, 0o755)
  const artifact: VerifiedApplicationArtifact = Object.freeze({
    authority: signed.authority,
    manifest: signed.manifest,
    path: source,
    verifyCompleteSnapshot: async () => {
      verifyApplicationReleaseAuthority(signed.authority, signed.trust)
      assert.equal(sha512(await fs.readFile(source)), signed.manifest.artifact.sha512)
    },
  })
  const currentSource = await fixtureCurrentSource(currentAppImage)
  const staged = await stageVerifiedApplicationArtifact({
    artifact,
    currentAppImage,
    currentSource,
  })
  const backed = await staged.prepareBackup()
  const active = await backed.activate(() => undefined)
  t.after(async () => {
    // Restore only exact owned directory permissions; never follow test-created symlinks.
    for (const directory of [applications, staged.stagingDirectory]) {
      const info = await fs.lstat(directory).catch(() => null)
      if (info?.isDirectory() && !info.isSymbolicLink()) {
        await fs.chmod(directory, 0o700)
      }
    }
    await fs.rm(root, { force: true, recursive: true })
  })
  return {
    active,
    applications,
    cache,
    currentAppImage,
    newBytes,
    oldBytes,
    root,
    signed,
    source,
    stage: staged.stagingDirectory,
  }
}

/** Tiny physical observations only: no native cache discovery or container-membership claim. */
async function loadedRuntimeSource(
  t: Pick<TestContext, 'after'>,
  f: Fixture,
  mismatch: 'archive' | 'executable' | null = null,
) {
  const directory = path.join(f.root, 'observed-runtime')
  await fs.mkdir(directory, { mode: 0o775 })
  await fs.chmod(directory, 0o775)
  const archivePath = path.join(directory, 'app.asar')
  const executablePath = path.join(directory, 'imagegen-studio')
  const observedBodies = {
    archive: Buffer.from(runtimeBodies.archive),
    executable: Buffer.from(runtimeBodies.executable),
  }
  if (mismatch) {
    observedBodies[mismatch][0] ^= 1
  }
  await fs.writeFile(archivePath, observedBodies.archive, { mode: 0o664 })
  await fs.chmod(archivePath, 0o664)
  await fs.writeFile(executablePath, observedBodies.executable, { mode: 0o775 })
  await fs.chmod(executablePath, 0o775)
  const archive = await fs.open(archivePath, 'r')
  const executable = await fs.open(executablePath, 'r')
  const capture = captureApplicationUpdateCurrentSource({
    archiveFd: archive.fd,
    archivePath,
    currentAppImage: f.currentAppImage,
    executableFd: executable.fd,
    executablePath,
  })
  t.after(async () => {
    capture.dispose()
    await archive.close()
    await executable.close()
  })
  return { archivePath, executablePath, source: await capture.complete() }
}

async function snapshot(file: string) {
  const info = await fs.lstat(file, { bigint: true })
  return {
    identity: {
      ctimeNs: String(info.ctimeNs),
      dev: String(info.dev),
      gid: String(info.gid),
      ino: String(info.ino),
      mode: String(info.mode),
      mtimeNs: String(info.mtimeNs),
      nlink: String(info.nlink),
      sizeBytes: Number(info.size),
      uid: String(info.uid),
    },
    sha512: sha512(await fs.readFile(file)),
    sizeBytes: Number(info.size),
  }
}

async function journal(f: Fixture) {
  return JSON.parse(await fs.readFile(path.join(f.stage, 'journal.json'), 'utf8')) as Record<
    string,
    unknown
  >
}
async function writeJournal(f: Fixture, value: Record<string, unknown>) {
  await fs.writeFile(path.join(f.stage, 'journal.json'), canonicalRuntimeReleaseJson(value))
}
async function replaceAuthority(f: Fixture, member: keyof typeof names, bytes: string) {
  const filename = path.join(f.stage, names[member])
  await fs.writeFile(filename, bytes)
  const value = await journal(f)
  const refs = value['authority'] as Record<string, unknown>
  const state = await snapshot(filename)
  refs[member] = { sha512: state.sha512, sizeBytes: state.sizeBytes, snapshot: state.identity }
  await writeJournal(f, value)
}

/** No-follow fixture inventory excludes atime: reads may change atime but never metadata/content. */
async function inventory(root: string): Promise<unknown[]> {
  const found: unknown[] = []
  const walk = async (filename: string) => {
    const info = await fs.lstat(filename, { bigint: true })
    const value = {
      body: info.isFile()
        ? sha512(await fs.readFile(filename))
        : info.isSymbolicLink()
          ? await fs.readlink(filename)
          : null,
      ctime: info.ctimeNs,
      dev: info.dev,
      ino: info.ino,
      mode: info.mode,
      mtime: info.mtimeNs,
      nlink: info.nlink,
      path: path.relative(root, filename),
      size: info.size,
    }
    found.push(value)
    if (info.isDirectory() && !info.isSymbolicLink()) {
      for (const member of (await fs.readdir(filename)).sort()) {
        await walk(path.join(filename, member))
      }
    }
  }
  await walk(root)
  return found
}

async function inspect(
  f: Fixture,
  overrides: Partial<Parameters<typeof inspectRetainedApplicationUpdate>[0]> = {},
) {
  return await inspectRetainedApplicationUpdate({
    currentAppImage: f.currentAppImage,
    currentVersion: '0.2.0',
    readTrust: async () => f.signed.trust,
    ...overrides,
  })
}
async function preserves(
  f: Fixture,
  expected: unknown,
  overrides: Partial<Parameters<typeof inspectRetainedApplicationUpdate>[0]> = {},
) {
  const before = await inventory(f.root)
  const observation = await inspect(f, overrides)
  assert.deepEqual(observation, expected)
  assert.deepEqual(
    await inventory(f.root),
    before,
    'Inspection preserves all owned fixture bytes and identities.',
  )
  return observation
}

test('offline activated and relaunching targets reauthenticate after native cache loss without writes', async (t) => {
  for (const phase of ['activated', 'relaunching']) {
    await t.test(phase, async (subtest) => {
      const f = await fixture(subtest)
      if (phase === 'relaunching') {
        await f.active.handoffRelaunch(() => true)
      }
      await fs.rm(f.cache, { recursive: true })
      await preserves(f, verified)
      assert.equal(sha512(await fs.readFile(f.currentAppImage)), sha512(f.newBytes))
    })
  }
})

for (const schemaVersion of [1, 2] as const) {
  const testName =
    schemaVersion === 1
      ? 'an unleased writer replaces an authenticated target while cooperating update admission stays held'
      : 'an unleased writer replaces a v2 target despite matching publisher runtime files and held admission'
  test(testName, async (t) => {
    const f = await fixture(t, undefined, false, schemaVersion)
    const runtime = schemaVersion === 2 ? await loadedRuntimeSource(t, f) : null
    const runtimeDirectory = runtime ? path.dirname(runtime.archivePath) : null
    const runtimeBefore = runtimeDirectory ? await inventory(runtimeDirectory) : null
    const overrides = runtime ? { currentSource: runtime.source } : {}
    const expected = runtime ? runtimeVerified : verified
    const replacement = path.join(f.applications, 'owned-unleased-replacement')
    const replacementBytes = image(97)
    await fs.writeFile(replacement, replacementBytes, { flag: 'wx', mode: 0o755 })
    const replacementIdentity = await snapshot(replacement)
    const targetBefore = await snapshot(f.currentAppImage)
    const retainedBefore = await inventory(f.stage)
    assert.deepEqual(await fs.readFile(f.currentAppImage), f.newBytes)
    assert.notEqual(replacementIdentity.identity.ino, targetBefore.identity.ino)
    assert.notEqual(replacementIdentity.sha512, targetBefore.sha512)

    // A separate process can publish its own file without taking the cooperating lock.
    // This controlled writer never loads or executes either synthetic image.
    const writer = spawn(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import assert from 'node:assert/strict';
       import { renameSync } from 'node:fs';
       process.once('message', (request) => {
         assert.equal(request, 'publish');
         renameSync(process.argv[1], process.argv[2]);
         process.disconnect();
       });
       process.send('waiting');`,
        replacement,
        f.currentAppImage,
      ],
      {
        cwd: f.applications,
        env: { LANG: 'C', LC_ALL: 'C' },
        killSignal: 'SIGKILL',
        stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
        timeout: 10_000,
      },
    )
    const closed = once(writer, 'close')
    let admission: ReturnType<typeof acquireApplicationUpdateAdmission> | undefined
    try {
      const [message] = await Promise.race([once(writer, 'message'), closed])
      assert.equal(
        message,
        'waiting',
        'The unleased writer is live and waiting before admission and inspection.',
      )
      admission = acquireApplicationUpdateAdmission(f.currentAppImage)
      admission.assertHeld()
      const beforePublication = await preserves(f, expected, overrides)

      writer.send('publish')
      assert.deepEqual(await closed, [0, null])
      admission.assertHeld()
      assert.throws(() => acquireApplicationUpdateAdmission(f.currentAppImage).release(), {
        code: 'APPLICATION_UPDATE_BUSY',
      })
      await assert.rejects(fs.lstat(replacement), { code: 'ENOENT' })
      assert.equal(
        (await snapshot(f.currentAppImage)).identity.ino,
        replacementIdentity.identity.ino,
      )
      assert.deepEqual(await fs.readFile(f.currentAppImage), replacementBytes)
      await preserves(f, unverified, overrides)
      assert.deepEqual(beforePublication, expected)
      assert.deepEqual(await inventory(f.stage), retainedBefore)
      if (runtimeDirectory) {
        assert.deepEqual(await inventory(runtimeDirectory), runtimeBefore)
      }
    } finally {
      admission?.release()
      if (writer.exitCode === null && writer.signalCode === null) {
        writer.kill('SIGKILL')
      }
      await closed
    }
  })
}

test('safe absent stage returns none without reading the current body or requesting trust', async (t) => {
  const f = await fixture(t)
  await fs.rename(f.stage, path.join(f.root, 'retained-stage'))
  await fs.unlink(f.currentAppImage)
  let calls = 0
  await preserves(
    f,
    { status: 'none' },
    {
      readTrust: async () => {
        calls++
        throw new Error('Trust must stay lazy.')
      },
    },
  )
  assert.equal(calls, 0)
})

test('null bundled trust retains coherent stage before touching a missing current body', async (t) => {
  const f = await fixture(t)
  await fs.unlink(f.currentAppImage)
  let calls = 0
  await preserves(f, unverified, {
    readTrust: async () => {
      calls++
      return null
    },
  })
  assert.equal(calls, 1)
})

test('absence below an unsafe parent cannot admit a fresh install or request trust', async (t) => {
  const f = await fixture(t)
  await fs.rename(f.stage, path.join(f.root, 'retained-stage'))
  await fs.chmod(f.applications, 0o777)
  let calls = 0
  await preserves(f, unverified, {
    readTrust: async () => {
      calls++
      return f.signed.trust
    },
  })
  assert.equal(calls, 0)
})

for (const fault of [
  'legacy',
  'torn',
  'missing-journal',
  'missing-authority',
  'failed-marker',
  'unknown-member',
  'preparing',
  'wrong-manifest',
  'wrong-version',
  'current-bytes',
  'current-mode',
  'current-hardlink',
  'authority-hardlink',
  'authority-symlink',
  'journal-directory',
  'backup-symlink',
  'backup-mode',
  'stage-mode',
  'parent-mode',
  'stage-symlink',
  'notes-noncanonical',
] as const) {
  test(`startup preserves ${fault} as retained unverified`, async (t) => {
    const f = await fixture(t)
    switch (fault) {
      case 'authority-hardlink': {
        await fs.link(path.join(f.stage, names.envelope), path.join(f.root, 'alias-envelope.json'))
        break
      }
      case 'authority-symlink':
      case 'backup-symlink': {
        const target = path.join(
          f.stage,
          fault === 'authority-symlink' ? names.envelope : 'previous.AppImage',
        )
        const held = path.join(f.root, 'retained-original')
        await fs.rename(target, held)
        await fs.symlink(held, target)

        break
      }
      case 'backup-mode': {
        await fs.chmod(path.join(f.stage, 'previous.AppImage'), 0o755)
        break
      }
      case 'current-bytes': {
        const bytes = Buffer.from(f.newBytes)
        bytes[100] ^= 1
        await fs.writeFile(f.currentAppImage, bytes)
        const value = await journal(f)
        const current = await snapshot(f.currentAppImage)
        value['current'] = {
          path: f.currentAppImage,
          ...current,
          sha512: f.signed.manifest.artifact.sha512,
        }
        await writeJournal(f, value)

        break
      }
      case 'current-hardlink': {
        await fs.link(f.currentAppImage, path.join(f.root, 'alias.AppImage'))
        break
      }
      case 'current-mode': {
        await fs.chmod(f.currentAppImage, 0o600)
        break
      }
      case 'failed-marker': {
        await fs.writeFile(path.join(f.stage, 'failed.json'), '{}', { mode: 0o600 })
        break
      }
      case 'journal-directory': {
        await fs.unlink(path.join(f.stage, 'journal.json'))
        await fs.mkdir(path.join(f.stage, 'journal.json'))

        break
      }
      case 'legacy':
      case 'preparing':
      case 'wrong-manifest': {
        const value = await journal(f)
        if (fault === 'legacy') {
          value['schemaVersion'] = 1
        }
        if (fault === 'preparing') {
          value['state'] = 'preparing'
        }
        if (fault === 'wrong-manifest') {
          value['manifest'] = { ...(value['manifest'] as object), version: '0.3.0' }
        }
        await writeJournal(f, value)

        break
      }
      case 'missing-authority': {
        await fs.unlink(path.join(f.stage, names.envelope))
        break
      }
      case 'missing-journal': {
        await fs.unlink(path.join(f.stage, 'journal.json'))
        break
      }
      case 'notes-noncanonical': {
        {
          await replaceAuthority(f, 'releaseNotes', `${f.signed.authority.releaseNotesJson}\n`)
          // No default
        }
        break
      }
      case 'parent-mode': {
        await fs.chmod(f.applications, 0o777)
        break
      }
      case 'stage-mode': {
        await fs.chmod(f.stage, 0o755)
        break
      }
      case 'stage-symlink': {
        const held = path.join(f.root, 'retained-stage')
        await fs.rename(f.stage, held)
        await fs.symlink(held, f.stage)

        break
      }
      case 'torn': {
        await fs.writeFile(path.join(f.stage, 'journal.json'), '{')
        break
      }
      case 'unknown-member': {
        await fs.mkdir(path.join(f.stage, 'unknown-data'))
        break
      }
    }
    await preserves(f, unverified, fault === 'wrong-version' ? { currentVersion: '0.1.0' } : {})
  })
}

for (const fault of [
  'self-signed',
  'wrong-domain',
  'unknown-key',
  'changed-notes',
  'removed-signer',
] as const) {
  test(`independent current trust refuses ${fault} even with coherent unsigned references`, async (t) => {
    const f = await fixture(t)
    switch (fault) {
      case 'changed-notes': {
        await replaceAuthority(
          f,
          'releaseNotes',
          canonicalRuntimeReleaseJson('Different unsigned notes.').toString('utf8'),
        )

        break
      }
      case 'self-signed': {
        const foreign = generateKeyPairSync('ed25519')
        await replaceAuthority(
          f,
          'envelope',
          f.signed.envelopeFor(f.signed.payload, 'owned-startup-key', foreign.privateKey),
        )

        break
      }
      case 'unknown-key': {
        await replaceAuthority(f, 'envelope', f.signed.envelopeFor(f.signed.payload, 'unknown-key'))

        break
      }
      case 'wrong-domain': {
        await replaceAuthority(
          f,
          'envelope',
          f.signed.envelopeFor({ ...f.signed.payload, scope: 'runtime-release' }),
        )

        break
      }
      // No default
    }
    const rotated = generateKeyPairSync('ed25519')
      .publicKey.export({ format: 'pem', type: 'spki' })
      .toString()
    let calls = 0
    await preserves(f, unverified, {
      readTrust: async () => {
        calls++
        return fault === 'removed-signer'
          ? { ...f.signed.trust, trustedKeys: { 'rotated-startup-key': rotated } }
          : f.signed.trust
      },
    })
    assert.equal(calls, 1, 'Coherent metadata reaches the independent signature/notes verifier.')
  })
}

for (const target of [
  'current',
  'backup',
  'journal',
  'envelope',
  'releaseNotes',
  'stage',
  'parent',
] as const) {
  test(`same-byte ${target} replacement during trust await cannot authenticate`, async (t) => {
    const f = await fixture(t)
    let afterMutation: unknown[] | undefined
    assert.deepEqual(
      await inspect(f, {
        readTrust: async () => {
          if (target === 'stage' || target === 'parent') {
            const directory = target === 'stage' ? f.stage : f.applications
            const clone = path.join(f.root, 'clone')
            await fs.cp(directory, clone, { preserveTimestamps: true, recursive: true })
            await fs.rename(directory, path.join(f.root, `retained-${target}`))
            await fs.rename(clone, directory)
          } else {
            const file =
              target === 'current'
                ? f.currentAppImage
                : path.join(
                    f.stage,
                    target === 'backup'
                      ? 'previous.AppImage'
                      : target === 'journal'
                        ? 'journal.json'
                        : names[target],
                  )
            const bytes = await fs.readFile(file)
            await fs.rename(file, path.join(f.root, `retained-${target}`))
            await fs.writeFile(file, bytes, { mode: target === 'current' ? 0o755 : 0o600 })
            if (target === 'current') {
              await fs.chmod(file, 0o755)
            }
          }
          afterMutation = await inventory(f.root)
          return f.signed.trust
        },
      }),
      unverified,
    )
    assert.ok(afterMutation)
    assert.deepEqual(await inventory(f.root), afterMutation)
  })
}

test('near-limit canonical notes and padded envelope persist separately from the bounded journal', async (t) => {
  const notes = 'n'.repeat(1024 * 1024 - 3)
  // Accepted envelope JSON whitespace is outside the signed payload. Both original files are
  // staged near their independent limits; neither raw string is embedded inside the journal.
  const f = await fixture(t, notes, true)
  assert.equal((await fs.stat(path.join(f.stage, names.envelope))).size, 1024 * 1024)
  assert.equal((await fs.stat(path.join(f.stage, names.releaseNotes))).size, 1024 * 1024 - 1)
  assert.ok((await fs.stat(path.join(f.stage, 'journal.json'))).size < 16 * 1024)
  await preserves(f, verified)
})

test('v2 retained target authenticates publisher runtime tuple', async (t) => {
  const f = await fixture(t, undefined, false, 2)
  const loaded = await loadedRuntimeSource(t, f)
  await fs.rm(f.cache, { recursive: true })
  await preserves(f, runtimeVerified, { currentSource: loaded.source })
  await loaded.source.verifyCompleteSnapshot()
})

for (const role of ['archive', 'executable'] as const) {
  test(`v2 runtime ${role} mismatch preserves verified target`, async (t) => {
    const f = await fixture(t, undefined, false, 2)
    const loaded = await loadedRuntimeSource(t, f, role)
    await loaded.source.verifyCompleteSnapshot()
    assert.notDeepEqual(loaded.source.runtimeFiles, declaredRuntimeFiles)
    await preserves(f, verified, { currentSource: loaded.source })
  })
  test(`v2 signed ${role} size mismatch preserves verified target`, async (t) => {
    const f = await fixture(t, undefined, false, 2)
    const loaded = await loadedRuntimeSource(t, f)
    const payload = {
      ...f.signed.payload,
      runtimeFiles: {
        ...declaredRuntimeFiles,
        [role]: {
          ...declaredRuntimeFiles[role],
          sizeBytes: declaredRuntimeFiles[role].sizeBytes + 1,
        },
      },
    }
    await replaceAuthority(f, 'envelope', f.signed.envelopeFor(payload))
    const record = await journal(f)
    record['manifest'] = payload
    await writeJournal(f, record)
    await preserves(f, verified, { currentSource: loaded.source })
  })
}

test('v2 missing runtime source preserves target authentication', async (t) => {
  const f = await fixture(t, undefined, false, 2)
  await preserves(f, verified)
  await preserves(f, verified, { currentSource: null })
})

test('v1 target never consults the optional runtime capability', async (t) => {
  const f = await fixture(t)
  let reads = 0
  const source = new Proxy({} as ApplicationUpdateCurrentSource, {
    get: () => {
      reads++
      throw new Error('A v1 declaration has no runtime authority.')
    },
    ownKeys: () => {
      reads++
      throw new Error('A v1 declaration has no runtime inventory.')
    },
  })
  await preserves(f, verified, { currentSource: source })
  assert.equal(reads, 0)
})

for (const fault of [
  'verify-error',
  'wrong-current-path',
  'wrong-current-snapshot',
  'async-assert',
] as const) {
  test(`v2 runtime ${fault} cannot downgrade a verified target`, async (t) => {
    const f = await fixture(t, undefined, false, 2)
    const loaded = await loadedRuntimeSource(t, f)
    const source: ApplicationUpdateCurrentSource = {
      ...loaded.source,
      ...(fault === 'verify-error'
        ? {
            verifyCompleteSnapshot: async () => {
              throw new Error('Owned observation unavailable.')
            },
          }
        : {}),
      ...(fault === 'wrong-current-path' ? { currentAppImage: f.source } : {}),
      ...(fault === 'wrong-current-snapshot'
        ? {
            currentImage: {
              ...loaded.source.currentImage,
              sha512: sha512(Buffer.from('Different outer observation.')),
            },
          }
        : {}),
      ...(fault === 'async-assert'
        ? {
            assertCurrentSnapshot: async () => {
              throw new Error('An async assertion is never admitted.')
            },
          }
        : {}),
    }
    await preserves(f, verified, { currentSource: source })
  })
}

for (const getter of ['runtimeFiles', 'archive-hash', 'assertCurrentSnapshot'] as const) {
  test(`v2 runtime ${getter} accessor refuses without reading its getter`, async (t) => {
    const f = await fixture(t, undefined, false, 2)
    const loaded = await loadedRuntimeSource(t, f)
    let reads = 0
    const source = { ...loaded.source }
    const get = () => {
      reads++
      return getter === 'assertCurrentSnapshot' ? () => undefined : declaredRuntimeFiles
    }
    if (getter === 'archive-hash') {
      const archive = { ...declaredRuntimeFiles.archive }
      Object.defineProperty(archive, 'sha512', { enumerable: true, get })
      source.runtimeFiles = { ...declaredRuntimeFiles, archive }
    } else {
      Object.defineProperty(source, getter, { enumerable: true, get })
    }
    await preserves(f, verified, { currentSource: source })
    assert.equal(reads, 0)
  })
}

for (const drift of ['tuple', 'method'] as const) {
  test(`v2 source ${drift} drift during trust await cannot rebase runtime authority`, async (t) => {
    const f = await fixture(t, undefined, false, 2)
    const loaded = await loadedRuntimeSource(t, f)
    const source = { ...loaded.source }
    if (drift === 'tuple') {
      source.runtimeFiles = {
        ...declaredRuntimeFiles,
        archive: {
          ...declaredRuntimeFiles.archive,
          sha512: sha512(Buffer.from('Earlier archive A.')),
        },
      }
    }
    await preserves(f, verified, {
      currentSource: source,
      readTrust: async () => {
        if (drift === 'tuple') {
          source.runtimeFiles = declaredRuntimeFiles
        } else {
          source.verifyCompleteSnapshot = async () => undefined
        }
        return f.signed.trust
      },
    })
  })
}

test('v2 runtime source replacement after full verify preserves target and refuses runtime authentication', async (t) => {
  const f = await fixture(t, undefined, false, 2)
  const loaded = await loadedRuntimeSource(t, f)
  let afterMutation: unknown[] | undefined
  const source: ApplicationUpdateCurrentSource = {
    ...loaded.source,
    verifyCompleteSnapshot: async () => {
      await loaded.source.verifyCompleteSnapshot()
      const bytes = await fs.readFile(loaded.archivePath)
      await fs.rename(loaded.archivePath, path.join(f.root, 'retained-observed-archive'))
      await fs.writeFile(loaded.archivePath, bytes, { mode: 0o664 })
      afterMutation = await inventory(f.root)
    },
  }
  assert.deepEqual(await inspect(f, { currentSource: source }), verified)
  assert.ok(afterMutation)
  assert.deepEqual(await inventory(f.root), afterMutation)
})

test('v2 target mutation during runtime verify still refuses both authentications', async (t) => {
  const f = await fixture(t, undefined, false, 2)
  const loaded = await loadedRuntimeSource(t, f)
  let afterMutation: unknown[] | undefined
  const source: ApplicationUpdateCurrentSource = {
    ...loaded.source,
    verifyCompleteSnapshot: async () => {
      await loaded.source.verifyCompleteSnapshot()
      await fs.appendFile(path.join(f.stage, 'journal.json'), '\n')
      afterMutation = await inventory(f.root)
    },
  }
  assert.deepEqual(await inspect(f, { currentSource: source }), unverified)
  assert.ok(afterMutation)
  assert.deepEqual(await inventory(f.root), afterMutation)
})

test('v2 final synchronous runtime assertion rejects an async return after target awaits', async (t) => {
  const f = await fixture(t, undefined, false, 2)
  const loaded = await loadedRuntimeSource(t, f)
  let calls = 0
  const source: ApplicationUpdateCurrentSource = {
    ...loaded.source,
    assertCurrentSnapshot: () => {
      if (++calls === 4) {
        return Promise.resolve()
      }
      loaded.source.assertCurrentSnapshot()
    },
  }
  await preserves(f, verified, { currentSource: source })
  assert.equal(calls, 4, 'The refusal reaches the last synchronous guard after all target awaits.')
})
