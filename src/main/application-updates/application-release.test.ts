/**
 * Actual canonical-envelope/Ed25519 and filesystem gates with ephemeral test identities. These
 * declarations never qualify installed runtime readiness, SQL execution or an installer.
 */
import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { canonicalRuntimeReleaseJson } from '../runtime/runtime-release.js'
import {
  AppReleaseError,
  loadApplicationReleaseTrust,
  verifyApplicationRelease,
} from './application-release.js'

const body = Buffer.from('Owned signed application fixture; not executable.')
const notes = 'Owned release notes.\n<script>remains literal text</script>'
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')

function keyring() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  return {
    privateKey,
    publicPem: publicKey.export({ format: 'pem', type: 'spki' }).toString(),
  }
}

function compatibility() {
  return {
    cpuWorkerProtocolVersion: '1',
    databaseMigrations: [
      { name: '0001_app_metadata.sql', sha256: 'a'.repeat(64) },
      { name: '0002_models.sql', sha256: 'b'.repeat(64) },
    ],
    inferenceWorkerProtocolVersion: '1',
    projectSchemaVersion: 1,
  }
}

function selected() {
  return {
    filename: 'imagegen-studio-0.2.0-x86_64.AppImage',
    sha512: createHash('sha512').update(body).digest('base64'),
    sizeBytes: body.length,
    version: '0.2.0',
  }
}

function manifest() {
  const file = selected()
  return {
    appId: 'studio.imagegen.desktop',
    artifact: { filename: file.filename, sha512: file.sha512, sizeBytes: file.sizeBytes },
    compatibility: { ...compatibility(), runtimeValidation: 'after-restart' },
    releaseId: 'owned-release-2',
    releaseNotesSha256: hash(canonicalRuntimeReleaseJson(notes)),
    schemaVersion: 1,
    scope: 'application-release',
    target: { arch: 'x64', format: 'AppImage', os: 'linux' },
    version: file.version,
  }
}

function trust(keys: ReturnType<typeof keyring>) {
  return { compatibility: compatibility(), trustedKeys: { 'owned-key': keys.publicPem } }
}

function seal(
  value: unknown,
  keys: ReturnType<typeof keyring>,
  payload = canonicalRuntimeReleaseJson(value),
  keyId = 'owned-key',
) {
  return canonicalRuntimeReleaseJson({
    keyId,
    payload: payload.toString('base64'),
    schemaVersion: 1,
    signature: sign(null, payload, keys.privateKey).toString('base64'),
  })
}

function rejected(error: unknown) {
  assert.ok(error instanceof AppReleaseError)
  assert.equal(error.code, 'APPLICATION_RELEASE_INVALID')
  assert.equal(error.message, 'The signed application release could not be verified.')
  return true
}

test('signed app declaration binds actual artifact and notes while retaining runtime revalidation', () => {
  const keys = keyring()
  const value = manifest()
  const verified = verifyApplicationRelease(seal(value, keys), trust(keys), selected(), notes)
  assert.deepEqual(verified, value)
  assert.equal(verified.compatibility.runtimeValidation, 'after-restart')
  assert.equal(Object.isFrozen(verified), true)
  assert.equal(Object.isFrozen(verified.artifact), true)
  assert.equal(Object.isFrozen(verified.target), true)
  assert.equal(Object.isFrozen(verified.compatibility.databaseMigrations), true)
  assert.equal(Object.isFrozen(verified.compatibility.databaseMigrations[0]), true)
  value.artifact.filename = 'changed.AppImage'
  value.compatibility.databaseMigrations[0].sha256 = 'f'.repeat(64)
  assert.equal(verified.artifact.filename, selected().filename)
  assert.equal(verified.compatibility.databaseMigrations[0].sha256, 'a'.repeat(64))
  assert.throws(() => Object.assign(verified.artifact, { filename: 'changed.AppImage' }), TypeError)
})

test('actual signature, trusted key and canonical payload are mandatory', async (t) => {
  const keys = keyring()
  const valid = seal(manifest(), keys)
  const changed = JSON.parse(valid.toString()) as Record<string, unknown>
  changed.payload = canonicalRuntimeReleaseJson({ ...manifest(), releaseId: 'changed' }).toString(
    'base64',
  )
  for (const [label, envelope, policy] of [
    ['tampered payload', Buffer.from(JSON.stringify(changed)), trust(keys)],
    ['unknown key', seal(manifest(), keys, undefined, 'unknown-key'), trust(keys)],
    ['different key', valid, trust(keyring())],
    [
      'noncanonical signed payload',
      seal(manifest(), keys, Buffer.from(JSON.stringify(manifest(), null, 2))),
      trust(keys),
    ],
    ['invalid envelope', Buffer.from('private/native/error path'), trust(keys)],
    ['oversized envelope', Buffer.alloc(1024 * 1024 + 1), trust(keys)],
  ] as const) {
    await t.test(label, () =>
      assert.throws(() => verifyApplicationRelease(envelope, policy, selected(), notes), rejected),
    )
  }
})

test('app domain, host, metadata schema and installer-free runtime policy cannot be substituted', async (t) => {
  const keys = keyring()
  const patches: [string, (value: ReturnType<typeof manifest>) => unknown][] = [
    ['runtime domain', (v) => ({ ...v, scope: 'runtime-transport' })],
    ['foreign app', (v) => ({ ...v, appId: 'foreign.app' })],
    ['unknown schema', (v) => ({ ...v, schemaVersion: 2 })],
    ['extra authority', (v) => ({ ...v, installer: '/private/installer' })],
    ['target os', (v) => ({ ...v, target: { ...v.target, os: 'win32' } })],
    ['target arch', (v) => ({ ...v, target: { ...v.target, arch: 'arm64' } })],
    ['target format', (v) => ({ ...v, target: { ...v.target, format: 'deb' } })],
    ['target extras', (v) => ({ ...v, target: { ...v.target, exec: true } })],
    ['empty release id', (v) => ({ ...v, releaseId: '' })],
    ['oversized release id', (v) => ({ ...v, releaseId: 'x'.repeat(129) })],
    ['unsafe release id', (v) => ({ ...v, releaseId: '../release' })],
    [
      'runtime ready claim',
      (v) => ({ ...v, compatibility: { ...v.compatibility, runtimeValidation: 'ready' } }),
    ],
    [
      'missing runtime check',
      (v) => {
        const { runtimeValidation: _, ...compat } = v.compatibility
        return { ...v, compatibility: compat }
      },
    ],
  ]
  for (const [label, patch] of patches) {
    await t.test(label, () =>
      assert.throws(
        () =>
          verifyApplicationRelease(seal(patch(manifest()), keys), trust(keys), selected(), notes),
        rejected,
      ),
    )
  }
})

test('signed descriptor matches version, decoded basename, canonical SHA512 and exact positive size', async (t) => {
  const keys = keyring()
  for (const [label, patch] of [
    ['version', { version: '0.3.0' }],
    ['version path', { version: '/private/0.2.0' }],
    ['different filename', { filename: 'other.AppImage' }],
    ['different hash', { sha512: Buffer.alloc(64, 3).toString('base64') }],
    ['different size', { sizeBytes: body.length + 1 }],
  ] as const) {
    await t.test(label, () =>
      assert.throws(
        () =>
          verifyApplicationRelease(
            seal(manifest(), keys),
            trust(keys),
            { ...selected(), ...patch },
            notes,
          ),
        rejected,
      ),
    )
  }
  for (const filename of [
    '../app.AppImage',
    '/private/app.AppImage',
    String.raw`dir\app.AppImage`,
    'app\0.AppImage',
    'app\n.AppImage',
    'app.appimage',
  ]) {
    await t.test('unsafe artifact filename', () => {
      const value = manifest()
      value.artifact.filename = filename
      assert.throws(
        () =>
          verifyApplicationRelease(
            seal(value, keys),
            trust(keys),
            { ...selected(), filename },
            notes,
          ),
        rejected,
      )
    })
  }
  for (const patch of [
    { sizeBytes: 0 },
    { sizeBytes: -1 },
    { sizeBytes: 1.5 },
    { sizeBytes: Number.MAX_SAFE_INTEGER + 1 },
    { sha512: 'invalid' },
    { sha512: selected().sha512.replace(/=+$/, '') },
  ]) {
    await t.test('invalid artifact integrity', () => {
      const value = JSON.parse(canonicalRuntimeReleaseJson(manifest()).toString()) as ReturnType<
        typeof manifest
      >
      Object.assign(value.artifact, patch)
      // Keep canonical key order while signing invalid values, so refusal occurs
      // in the actual consumer rather than being hidden by the producer helper.
      const envelope = seal(value, keys, Buffer.from(JSON.stringify(value)))
      assert.throws(
        () => verifyApplicationRelease(envelope, trust(keys), selected(), notes),
        rejected,
      )
    })
  }
})

test('release notes canonical digest covers structured native notes and refuses changed text', () => {
  const keys = keyring()
  assert.throws(
    () =>
      verifyApplicationRelease(seal(manifest(), keys), trust(keys), selected(), 'changed notes'),
    rejected,
  )
  const structured = [
    { note: 'first', version: '0.2.0' },
    { note: null, version: '0.1.0' },
  ]
  const value = manifest()
  value.releaseNotesSha256 = hash(canonicalRuntimeReleaseJson(structured))
  assert.equal(
    verifyApplicationRelease(seal(value, keys), trust(keys), selected(), structured).version,
    '0.2.0',
  )
  const missing = manifest()
  missing.releaseNotesSha256 = hash(canonicalRuntimeReleaseJson(null))
  assert.equal(
    verifyApplicationRelease(seal(missing, keys), trust(keys), selected(), undefined).version,
    '0.2.0',
  )
})

test('compatibility preserves every applied migration name/hash and actual protocol/schema owners', async (t) => {
  const keys = keyring()
  const value = manifest()
  value.compatibility.databaseMigrations.push({ name: '0003_projects.sql', sha256: 'c'.repeat(64) })
  assert.equal(
    verifyApplicationRelease(seal(value, keys), trust(keys), selected(), notes).compatibility
      .databaseMigrations.length,
    3,
  )
  const cases: [string, (value: ReturnType<typeof manifest>) => void][] = [
    [
      'project schema mismatch',
      (v) => {
        v.compatibility.projectSchemaVersion = 2
      },
    ],
    [
      'CPU protocol mismatch',
      (v) => {
        v.compatibility.cpuWorkerProtocolVersion = '2'
      },
    ],
    [
      'inference protocol mismatch',
      (v) => {
        v.compatibility.inferenceWorkerProtocolVersion = '2'
      },
    ],
    [
      'invalid protocol',
      (v) => {
        v.compatibility.cpuWorkerProtocolVersion = '01'
      },
    ],
    [
      'unbounded protocol',
      (v) => {
        v.compatibility.inferenceWorkerProtocolVersion = '1'.repeat(129)
      },
    ],
    [
      'changed applied hash',
      (v) => {
        v.compatibility.databaseMigrations[0].sha256 = 'f'.repeat(64)
      },
    ],
    [
      'missing applied name',
      (v) => {
        v.compatibility.databaseMigrations.shift()
      },
    ],
    [
      'same count wrong membership',
      (v) => {
        v.compatibility.databaseMigrations[0].name = '0000_foreign.sql'
      },
    ],
    [
      'duplicate migrations',
      (v) => {
        v.compatibility.databaseMigrations[1] = { ...v.compatibility.databaseMigrations[0] }
      },
    ],
    [
      'unsorted migrations',
      (v) => {
        v.compatibility.databaseMigrations.reverse()
      },
    ],
    [
      'unsafe migration name',
      (v) => {
        v.compatibility.databaseMigrations[0].name = '../0001_app.sql'
      },
    ],
    [
      'noncanonical migration hash',
      (v) => {
        v.compatibility.databaseMigrations[0].sha256 = 'A'.repeat(64)
      },
    ],
  ]
  for (const [label, patch] of cases) {
    await t.test(label, () => {
      const v = manifest()
      patch(v)
      assert.throws(
        () => verifyApplicationRelease(seal(v, keys), trust(keys), selected(), notes),
        rejected,
      )
    })
  }
})

test('trust and descriptor inputs reject private extras/accessors without executing them', () => {
  const keys = keyring()
  let reads = 0
  const descriptor = selected()
  Object.defineProperty(descriptor, 'filename', {
    enumerable: true,
    get: () => {
      reads++
      return selected().filename
    },
  })
  assert.throws(
    () => verifyApplicationRelease(seal(manifest(), keys), trust(keys), descriptor, notes),
    rejected,
  )
  const policy = trust(keys)
  Object.defineProperty(policy.trustedKeys, 'owned-key', {
    enumerable: true,
    get: () => {
      reads++
      return keys.publicPem
    },
  })
  assert.throws(
    () => verifyApplicationRelease(seal(manifest(), keys), policy, selected(), notes),
    rejected,
  )
  const migrations = compatibility()
  Object.defineProperty(migrations.databaseMigrations, '0', {
    enumerable: true,
    get: () => {
      reads++
      return compatibility().databaseMigrations[0]
    },
  })
  assert.throws(
    () =>
      verifyApplicationRelease(
        seal(manifest(), keys),
        { ...trust(keys), compatibility: migrations },
        selected(),
        notes,
      ),
    rejected,
  )
  assert.equal(reads, 0)
  assert.throws(
    () =>
      verifyApplicationRelease(
        seal(manifest(), keys),
        { ...trust(keys), key: 'private' } as ReturnType<typeof trust>,
        selected(),
        notes,
      ),
    rejected,
  )
})

async function resources(t: { after: (fn: () => Promise<void>) => void }) {
  const root = await mkdtemp(path.join(tmpdir(), 'igs-app-release-'))
  t.after(() => rm(root, { force: true, recursive: true }))
  return { filename: path.join(root, 'app-update-trust.json'), root }
}

function keyringFile(keys: ReturnType<typeof keyring>) {
  return {
    appId: 'studio.imagegen.desktop',
    keys: { 'owned-key': keys.publicPem },
    schemaVersion: 1,
  }
}

test('missing bundled keyring alone returns null; valid public configuration is copied and frozen', async (t) => {
  const f = await resources(t)
  const context = compatibility()
  assert.equal(await loadApplicationReleaseTrust(f.root, context), null)
  const keys = keyring()
  const value = keyringFile(keys)
  await writeFile(f.filename, JSON.stringify(value))
  const policy = await loadApplicationReleaseTrust(f.root, context)
  assert.ok(policy)
  assert.equal(policy.trustedKeys['owned-key'], keys.publicPem)
  assert.equal(Object.isFrozen(policy), true)
  assert.equal(Object.isFrozen(policy.trustedKeys), true)
  assert.equal(Object.isFrozen(policy.compatibility.databaseMigrations[0]), true)
  value.keys['owned-key'] = 'changed'
  context.databaseMigrations[0].sha256 = 'f'.repeat(64)
  assert.equal(policy.compatibility.databaseMigrations[0].sha256, 'a'.repeat(64))
  assert.equal(
    verifyApplicationRelease(seal(manifest(), keys), policy, selected(), notes).version,
    '0.2.0',
  )
})

test('an existing malformed or unsupported keyring never downgrades to metadata-only', async (t) => {
  const keys = keyring()
  const rsa = generateKeyPairSync('rsa', { modulusLength: 1024 })
    .publicKey.export({ format: 'pem', type: 'spki' })
    .toString()
  const cases: [string, string | Buffer][] = [
    ['malformed JSON', 'not JSON /private/configuration'],
    ['empty file', ''],
    ['wrong schema', JSON.stringify({ ...keyringFile(keys), schemaVersion: 2 })],
    ['foreign app', JSON.stringify({ ...keyringFile(keys), appId: 'foreign.app' })],
    ['unknown fields', JSON.stringify({ ...keyringFile(keys), privateSource: '/private/path' })],
    ['empty keys', JSON.stringify({ ...keyringFile(keys), keys: {} })],
    ['nonpublic value', JSON.stringify({ ...keyringFile(keys), keys: { 'owned-key': 123 } })],
    [
      'invalid key id',
      JSON.stringify({ ...keyringFile(keys), keys: { '../key': keys.publicPem } }),
    ],
    ['invalid PEM', JSON.stringify({ ...keyringFile(keys), keys: { 'owned-key': 'not a key' } })],
    ['wrong algorithm', JSON.stringify({ ...keyringFile(keys), keys: { 'owned-key': rsa } })],
    [
      'private signing material',
      JSON.stringify({
        ...keyringFile(keys),
        keys: { 'owned-key': keys.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString() },
      }),
    ],
    [
      'multiple keys in one value',
      JSON.stringify({
        ...keyringFile(keys),
        keys: { 'owned-key': keys.publicPem + keys.publicPem },
      }),
    ],
    ['oversized configuration', Buffer.alloc(1024 * 1024 + 1, 32)],
  ]
  for (const [label, bytes] of cases) {
    await t.test(label, async (sub) => {
      const f = await resources(sub)
      await writeFile(f.filename, bytes)
      await assert.rejects(loadApplicationReleaseTrust(f.root, compatibility()), rejected)
    })
  }
})

test('keyring byte budget accepts the exact boundary without an unbounded read', async (t) => {
  const f = await resources(t)
  const bytes = JSON.stringify(keyringFile(keyring()))
  await writeFile(f.filename, bytes + ' '.repeat(1024 * 1024 - Buffer.byteLength(bytes)))
  assert.ok(await loadApplicationReleaseTrust(f.root, compatibility()))
})

test('keyring and resource-directory symlinks or nonregular entries fail closed and keep targets', async (t) => {
  const f = await resources(t)
  const target = path.join(f.root, 'target.json')
  const targetBytes = JSON.stringify(keyringFile(keyring()))
  await writeFile(target, targetBytes)
  await symlink(target, f.filename)
  await assert.rejects(loadApplicationReleaseTrust(f.root, compatibility()), rejected)
  await rm(f.filename)
  await symlink(path.join(f.root, 'absent.json'), f.filename)
  await assert.rejects(loadApplicationReleaseTrust(f.root, compatibility()), rejected)
  await rm(f.filename)
  await mkdir(f.filename)
  await assert.rejects(loadApplicationReleaseTrust(f.root, compatibility()), rejected)
  const linkedResources = path.join(f.root, 'linked-resources')
  await symlink(f.root, linkedResources)
  await assert.rejects(loadApplicationReleaseTrust(linkedResources, compatibility()), rejected)
  await assert.rejects(
    loadApplicationReleaseTrust(path.join(f.root, 'missing-directory'), compatibility()),
    rejected,
  )
  assert.equal(await readFile(target, 'utf8'), targetBytes)
})
