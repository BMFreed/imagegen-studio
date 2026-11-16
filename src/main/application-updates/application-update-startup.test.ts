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
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test, type TestContext } from 'node:test'

import type { ApplicationReleaseTrust } from './application-release.js'
import type { VerifiedApplicationArtifact } from './electron-update-checker.js'

import { canonicalRuntimeReleaseJson } from '../runtime/runtime-release.js'
import { verifyApplicationReleaseAuthority } from './application-release.js'
import {
  type ApplicationUpdateCurrentSource,
  inspectRetainedApplicationUpdate,
  stageVerifiedApplicationArtifact,
} from './application-update-staging.js'

const sha512 = (bytes: Buffer) => createHash('sha512').update(bytes).digest('base64')
const unverified = { status: 'retained', targetAuthentication: 'unverified' }
const verified = { status: 'retained', targetAuthentication: 'verified' }
const names = { envelope: 'release-envelope.json', releaseNotes: 'release-notes.json' } as const

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

function release(body: Buffer, notes: unknown = 'Owned offline startup fixture; never executed.') {
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
    schemaVersion: 1,
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
    verifyCompleteSnapshot: async () => undefined,
  })
}

async function fixture(t: Pick<TestContext, 'after'>, notes?: unknown, paddedEnvelope = false) {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'igs-app-update-startup-'))
  const applications = path.join(root, 'applications')
  const cache = path.join(root, 'cache')
  await fs.mkdir(applications, { mode: 0o700 })
  await fs.mkdir(cache, { mode: 0o700 })
  const currentAppImage = path.join(applications, 'Current.AppImage')
  const source = path.join(cache, 'next.AppImage')
  const oldBytes = image(17)
  const newBytes = image(41)
  const releaseData = release(newBytes, notes)
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
  assert.deepEqual(await inspect(f, overrides), expected)
  assert.deepEqual(
    await inventory(f.root),
    before,
    'Inspection preserves all owned fixture bytes and identities.',
  )
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
