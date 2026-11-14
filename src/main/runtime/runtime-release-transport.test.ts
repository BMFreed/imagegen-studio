/**
 * Source check: InvokeAI 4875d96531ca6712b288f6e660fcbb34143408c1,
 * scripts/family_e2e/bundle.py:332,387 and **main**.py:261, model_hash.py:208 and
 * ModelOnDisk.hash:124. The producer keeps Studio's create-only output contract from
 * produce-runtime-wheelhouse.py; these tests never qualify an installed runtime or publisher.
 */
import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, type KeyObject, sign } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  readlink,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { test } from 'node:test'
import * as yauzl from 'yauzl'
import * as yazl from 'yazl'

import {
  produceRuntimeTransport,
  RuntimeTransportError,
  verifyRuntimeTransport,
} from './runtime-release-transport.js'
import {
  canonicalRuntimeReleaseJson,
  PINNED_RUNTIME_CONFIG_FILES,
  RuntimeReleaseError,
  type RuntimeReleaseFile,
  type RuntimeReleaseManifest,
  runtimeReleaseRequirements,
  type RuntimeReleaseSelection,
} from './runtime-release.js'

type TransportManifest = Awaited<ReturnType<typeof verifyRuntimeTransport>>['manifest']
const APP_VERSION = '1.0.0'
const KEY_ID = 'fixture-publisher'
const OUTPUT_FILES = ['runtime-payload.zip', 'runtime-release.json', 'runtime-transport.json']
const configFixture = process.env.IGS_RUNTIME_RELEASE_CONFIG_FIXTURE
const actualConfig = { skip: !configFixture }
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

type Keys = ReturnType<typeof keyring>

function keyring() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  return {
    privateKey,
    trustedKeys: { [KEY_ID]: publicKey.export({ format: 'pem', type: 'spki' }).toString() },
  }
}

function seal(value: unknown, keys: Keys, keyId = KEY_ID): Buffer {
  const payload = canonicalRuntimeReleaseJson(value)
  return canonicalRuntimeReleaseJson({
    keyId,
    payload: payload.toString('base64'),
    schemaVersion: 1,
    signature: sign(null, payload, keys.privateKey).toString('base64'),
  })
}

function descriptor(name: string, bytes: Buffer, executable = false): RuntimeReleaseFile {
  return {
    executable,
    kind: 'file',
    path: name,
    sha256: digest(bytes),
    sizeBytes: bytes.length,
  }
}

/** Synthetic executable/wheel identities test packaging only and are never executed/imported. */
function runtimeManifest(): RuntimeReleaseManifest {
  const wheel = descriptor(
    'wheels/imagegen_worker-0.1.0-py3-none-any.whl',
    Buffer.from('synthetic worker wheel; packaging test only'),
  )
  const base: RuntimeReleaseManifest = {
    appVersion: APP_VERSION,
    configPath: 'config',
    files: [],
    host: {
      arch: 'x64',
      cudaVersion: '12.6',
      glibcMinimum: '2.28',
      gpuArchitectures: ['sm_89'],
      minimumNvidiaDriver: '560.0',
      os: 'linux',
    },
    lockSha256: 'a'.repeat(64),
    profile: 'linux-nvidia',
    python: {
      buildId: 'cpython-3.12.13-linux-x86_64',
      executable: 'python/bin/python3.12',
      version: '3.12.13',
    },
    releaseId: 'transport-fixture',
    requiredFreeBytes: 16 * 1024 ** 2,
    requirementsPath: 'requirements.txt',
    schemaVersion: 1,
    uv: { executable: 'uv/uv', version: '0.11.11' },
    wheels: [
      {
        distribution: 'imagegen-worker',
        path: wheel.path,
        sha256: wheel.sha256,
        sizeBytes: wheel.sizeBytes,
        version: '0.1.0',
      },
    ],
    worker: {
      cpuVersion: '0.1.0',
      distribution: 'imagegen-worker',
      distributionVersion: '0.1.0',
      inferenceVersion: '0.14.0',
      protocolVersion: '1',
    },
  }
  return {
    ...base,
    files: [
      descriptor('python/bin/python3.12', Buffer.from('synthetic Python; never executed'), true),
      descriptor('uv/uv', Buffer.from('synthetic uv; never executed'), true),
      wheel,
      descriptor('requirements.txt', Buffer.from(runtimeReleaseRequirements(base))),
      ...Object.entries(PINNED_RUNTIME_CONFIG_FILES).map(([name, sha256]) => ({
        executable: false,
        kind: 'file' as const,
        path: `config/${name}`,
        sha256,
        sizeBytes: 1,
      })),
    ],
  }
}

function transportManifest(
  manifest: RuntimeReleaseManifest,
  innerEnvelope: Buffer,
  archive: Buffer,
): TransportManifest {
  return {
    appVersion: APP_VERSION,
    artifact: {
      filename: 'runtime-payload.zip',
      format: 'zip-v1',
      sha256: digest(archive),
      sizeBytes: archive.length,
    },
    entryCount: manifest.files.length,
    expandedRegularBytes: manifest.files.reduce(
      (sum, entry) => sum + (entry.kind === 'file' ? entry.sizeBytes : 0),
      0,
    ),
    profile: 'linux-nvidia',
    releaseId: manifest.releaseId,
    runtimeEnvelopeSha256: digest(innerEnvelope),
    runtimeManifestSha256: digest(canonicalRuntimeReleaseJson(manifest)),
    schemaVersion: 1,
    scope: 'runtime-transport',
  }
}

function rejectedBy(...codes: string[]) {
  return (error: unknown) => {
    assert.ok(error instanceof RuntimeTransportError || error instanceof RuntimeReleaseError)
    assert.ok(codes.includes(error.code), `Expected ${codes.join(' or ')}, received ${error.code}`)
    return true
  }
}
const invalid = rejectedBy('RUNTIME_TRANSPORT_INVALID')
const changed = rejectedBy('RUNTIME_TRANSPORT_CHANGED')
const storage = rejectedBy('RUNTIME_TRANSPORT_STORAGE')
const untrusted = rejectedBy('RUNTIME_RELEASE_UNTRUSTED')

async function withWork(use: (work: string) => Promise<void>) {
  const work = await mkdtemp(path.join(os.tmpdir(), 'igs-runtime-transport-'))
  try {
    await use(work)
  } finally {
    await rm(work, { force: true, recursive: true })
  }
}

async function absent(filename: string) {
  await assert.rejects(lstat(filename), { code: 'ENOENT' })
}

async function writeZip(filename: string, entries: [string, Buffer, number][]) {
  const archive = new yazl.ZipFile()
  for (const [name, bytes, mode] of entries) {
    archive.addBuffer(bytes, name, { compress: false, mode })
  }
  archive.end()
  await pipeline(archive.outputStream, createWriteStream(filename, { flags: 'wx', mode: 0o600 }))
}

/**
 * A descriptor-only fixture: archive members are deliberately not an expanded runtime. The
 * transport verifier authenticates opaque archive bytes; a future extraction owner must verify
 * member semantics before the existing release verifier/assembler can use expanded files.
 */
async function withTransport(
  use: (fixture: {
    directory: string
    innerEnvelope: Buffer
    keys: Keys
    manifest: TransportManifest
    runtime: RuntimeReleaseManifest
    work: string
  }) => Promise<void>,
) {
  await withWork(async (work) => {
    const directory = path.join(work, 'transport')
    await mkdir(directory, { mode: 0o700 })
    const keys = keyring()
    const runtime = runtimeManifest()
    const innerEnvelope = seal(runtime, keys)
    await writeZip(path.join(directory, 'runtime-payload.zip'), [
      ['opaque-fixture.txt', Buffer.from('No expanded-payload qualification'), 0o10_0600],
    ])
    const manifest = transportManifest(
      runtime,
      innerEnvelope,
      await readFile(path.join(directory, 'runtime-payload.zip')),
    )
    await writeFile(path.join(directory, 'runtime-release.json'), innerEnvelope, { flag: 'wx' })
    await writeFile(path.join(directory, 'runtime-transport.json'), seal(manifest, keys), {
      flag: 'wx',
    })
    await use({ directory, innerEnvelope, keys, manifest, runtime, work })
  })
}

const verify = (directory: string, keys: Keys) =>
  verifyRuntimeTransport({ appVersion: APP_VERSION, directory, trustedKeys: keys.trustedKeys })

test('transport verification authenticates exact descriptor/archive bytes without an expanded source', async () => {
  await withTransport(async (f) => {
    const result = await verify(f.directory, f.keys)
    assert.equal(result.directory, f.directory)
    assert.deepEqual(result.manifest, f.manifest)
    assert.deepEqual(result.runtimeManifest, f.runtime)
    await result.verifyCompleteTransportSnapshot()
    assert.deepEqual((await readdir(f.directory)).sort(), OUTPUT_FILES)
  })
})

test('transport publisher trust, signature and application binding refuse without config fixtures', async (t) => {
  for (const kind of ['untrusted-key', 'wrong-key', 'signature', 'application'] as const) {
    await t.test(kind, async () =>
      withTransport(async (f) => {
        if (kind === 'signature') {
          const sealed = JSON.parse(
            (await readFile(path.join(f.directory, 'runtime-transport.json'))).toString(),
          )
          sealed.signature = Buffer.alloc(64).toString('base64')
          await writeFile(path.join(f.directory, 'runtime-transport.json'), JSON.stringify(sealed))
        }
        await assert.rejects(
          verifyRuntimeTransport({
            appVersion: kind === 'application' ? '2.0.0' : APP_VERSION,
            directory: f.directory,
            trustedKeys:
              kind === 'untrusted-key'
                ? {}
                : kind === 'wrong-key'
                  ? keyring().trustedKeys
                  : f.keys.trustedKeys,
          }),
          kind === 'application' ? rejectedBy('RUNTIME_RELEASE_INVALID_MANIFEST') : untrusted,
        )
      }),
    )
  }
})

test('publisher private key must match an explicitly trusted Ed25519 identity before output creation', async (t) => {
  for (const kind of [
    'unknown-key-id',
    'wrong-private-key',
    'wrong-algorithm',
    'untrusted-release',
    'bad-inner-signature',
  ] as const) {
    await t.test(kind, async () =>
      withWork(async (work) => {
        const keys = keyring()
        let publisherPrivateKey: KeyObject = keys.privateKey
        let trustedKeys: Readonly<Record<string, string>> = keys.trustedKeys
        let innerEnvelope = seal(runtimeManifest(), keys)
        if (kind === 'wrong-private-key') {
          publisherPrivateKey = keyring().privateKey
        }
        if (kind === 'wrong-algorithm') {
          const ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
          publisherPrivateKey = ec.privateKey
          trustedKeys = {
            [KEY_ID]: ec.publicKey.export({ format: 'pem', type: 'spki' }).toString(),
          }
        }
        if (kind === 'untrusted-release') {
          trustedKeys = {}
        }
        if (kind === 'bad-inner-signature') {
          const sealed = JSON.parse(innerEnvelope.toString())
          sealed.signature = Buffer.alloc(64).toString('base64')
          innerEnvelope = Buffer.from(JSON.stringify(sealed))
        }
        const outputDirectory = path.join(work, 'must-not-be-created')
        await assert.rejects(
          produceRuntimeTransport({
            outputDirectory,
            publisherKeyId: kind === 'unknown-key-id' ? 'unknown-publisher' : KEY_ID,
            publisherPrivateKey,
            release: {
              appVersion: APP_VERSION,
              directory: path.join(work, 'missing-source-must-not-be-opened-before-trust'),
              envelope: innerEnvelope,
              trustedKeys,
            },
          }),
          untrusted,
        )
        await absent(outputDirectory)
        assert.deepEqual(await readdir(work), [])
      }),
    )
  }
})

test('signed malformed transport metadata and mismatched runtime identities fail closed', async (t) => {
  const cases: [string, (value: TransportManifest) => void][] = [
    ['schema', (m) => Reflect.set(m, 'schemaVersion', 2)],
    ['scope', (m) => Reflect.set(m, 'scope', 'full-engine')],
    ['unknown-field', (m) => Reflect.set(m, 'downloadUrl', 'https://example.invalid')],
    ['profile', (m) => Reflect.set(m, 'profile', 'cpu')],
    ['release-binding', (m) => Reflect.set(m, 'releaseId', 'different-runtime')],
    ['format', (m) => Reflect.set(m.artifact, 'format', 'tar')],
    ['artifact-path', (m) => Reflect.set(m.artifact, 'filename', '../runtime-payload.zip')],
    ['artifact-hash', (m) => Reflect.set(m.artifact, 'sha256', 'not-a-digest')],
    ['artifact-size', (m) => Reflect.set(m.artifact, 'sizeBytes', 0)],
    ['entry-count', (m) => Reflect.set(m, 'entryCount', m.entryCount + 1)],
    ['expanded-size', (m) => Reflect.set(m, 'expandedRegularBytes', m.expandedRegularBytes + 1)],
    ['missing-inner-binding', (m) => Reflect.deleteProperty(m, 'runtimeEnvelopeSha256')],
  ]
  for (const [name, mutate] of cases) {
    await t.test(name, async () =>
      withTransport(async (f) => {
        mutate(f.manifest)
        await writeFile(path.join(f.directory, 'runtime-transport.json'), seal(f.manifest, f.keys))
        await assert.rejects(verify(f.directory, f.keys), invalid)
      }),
    )
  }
})

test('artifact hash/size and both inner-document digest bindings are checked against actual bytes', async (t) => {
  for (const kind of [
    'artifact-bytes',
    'artifact-size',
    'declared-sha',
    'declared-size',
    'inner-envelope',
    'inner-manifest',
  ] as const) {
    await t.test(kind, async () =>
      withTransport(async (f) => {
        const archive = path.join(f.directory, 'runtime-payload.zip')
        if (kind === 'artifact-bytes') {
          const bytes = await readFile(archive)
          bytes[0] ^= 1
          await writeFile(archive, bytes)
        } else if (kind === 'artifact-size') {
          await writeFile(archive, Buffer.concat([await readFile(archive), Buffer.from('extra')]))
        } else {
          if (kind === 'declared-sha') {
            Reflect.set(f.manifest.artifact, 'sha256', 'b'.repeat(64))
          }
          if (kind === 'declared-size') {
            Reflect.set(f.manifest.artifact, 'sizeBytes', f.manifest.artifact.sizeBytes + 1)
          }
          if (kind === 'inner-envelope') {
            Reflect.set(f.manifest, 'runtimeEnvelopeSha256', 'b'.repeat(64))
          }
          if (kind === 'inner-manifest') {
            Reflect.set(f.manifest, 'runtimeManifestSha256', 'b'.repeat(64))
          }
          await writeFile(
            path.join(f.directory, 'runtime-transport.json'),
            seal(f.manifest, f.keys),
          )
        }
        await assert.rejects(verify(f.directory, f.keys), changed)
      }),
    )
  }
})

test('a trusted outer publisher cannot replace inner signature trust or exact runtime validation', async (t) => {
  for (const kind of ['inner-key', 'inner-signature', 'inner-manifest'] as const) {
    await t.test(kind, async () =>
      withTransport(async (f) => {
        let inner = seal(f.runtime, kind === 'inner-key' ? keyring() : f.keys)
        if (kind === 'inner-signature') {
          const sealed = JSON.parse(inner.toString())
          sealed.signature = Buffer.alloc(64).toString('base64')
          inner = Buffer.from(JSON.stringify(sealed))
        }
        if (kind === 'inner-manifest') {
          Reflect.set(f.runtime.worker, 'inferenceVersion', '0.1.0')
          inner = seal(f.runtime, f.keys)
        }
        Reflect.set(f.manifest, 'runtimeEnvelopeSha256', digest(inner))
        Reflect.set(
          f.manifest,
          'runtimeManifestSha256',
          digest(canonicalRuntimeReleaseJson(f.runtime)),
        )
        await writeFile(path.join(f.directory, 'runtime-release.json'), inner)
        await writeFile(path.join(f.directory, 'runtime-transport.json'), seal(f.manifest, f.keys))
        await assert.rejects(
          verify(f.directory, f.keys),
          kind === 'inner-manifest' ? rejectedBy('RUNTIME_RELEASE_INVALID_MANIFEST') : untrusted,
        )
      }),
    )
  }
})

test('only the exact three ordinary output files constitute a published transport', async (t) => {
  for (const kind of [
    'missing-archive',
    'missing-inner',
    'missing-outer',
    'extra-file',
    'extra-directory',
    'incomplete',
    'symlink-file',
    'symlink-root',
  ] as const) {
    await t.test(kind, async () =>
      withTransport(async (f) => {
        let directory = f.directory
        if (kind.startsWith('missing-')) {
          const name =
            kind === 'missing-archive'
              ? OUTPUT_FILES[0]
              : kind === 'missing-inner'
                ? OUTPUT_FILES[1]
                : OUTPUT_FILES[2]
          await rm(path.join(directory, name))
        }
        if (kind === 'extra-file' || kind === 'incomplete') {
          await writeFile(
            path.join(directory, kind === 'incomplete' ? '.incomplete' : 'extra.txt'),
            'unpublished',
          )
        }
        if (kind === 'extra-directory') {
          await mkdir(path.join(directory, 'extra'))
        }
        if (kind === 'symlink-file') {
          const target = path.join(f.work, 'outside.zip')
          await rename(path.join(directory, OUTPUT_FILES[0]), target)
          const before = await readFile(target)
          await symlink(target, path.join(directory, OUTPUT_FILES[0]))
          await assert.rejects(verify(directory, f.keys), storage)
          assert.deepEqual(await readFile(target), before)
          return
        }
        if (kind === 'symlink-root') {
          directory = path.join(f.work, 'alias')
          await symlink(f.directory, directory)
        }
        await assert.rejects(verify(directory, f.keys), storage)
      }),
    )
  }
})

test('complete transport snapshots refuse equal-byte inode replacement and later membership changes', async (t) => {
  for (const kind of ['archive-inode', 'inner-inode', 'outer-inode', 'extra-file'] as const) {
    await t.test(kind, async () =>
      withTransport(async (f) => {
        const verified = await verify(f.directory, f.keys)
        if (kind === 'extra-file') {
          await writeFile(path.join(f.directory, 'late-extra'), 'unexpected')
        } else {
          const name =
            kind === 'archive-inode'
              ? OUTPUT_FILES[0]
              : kind === 'inner-inode'
                ? OUTPUT_FILES[1]
                : OUTPUT_FILES[2]
          const original = path.join(f.directory, name)
          const replacement = path.join(f.work, 'replacement')
          await writeFile(replacement, await readFile(original), { flag: 'wx', mode: 0o600 })
          await rename(replacement, original)
        }
        await assert.rejects(verified.verifyCompleteTransportSnapshot(), changed)
      }),
    )
  }
})

async function sourceInventory(directory: string, relative = ''): Promise<unknown[]> {
  const entries: unknown[] = []
  for (const name of (await readdir(path.join(directory, relative))).sort()) {
    const logical = path.posix.join(relative, name)
    const filename = path.join(directory, logical)
    const info = await lstat(filename, { bigint: true })
    const entry = {
      ctimeNs: info.ctimeNs.toString(),
      dev: info.dev.toString(),
      ino: info.ino.toString(),
      mode: info.mode.toString(),
      mtimeNs: info.mtimeNs.toString(),
      path: logical,
      size: info.size.toString(),
    }
    if (info.isDirectory()) {
      entries.push(entry, ...(await sourceInventory(directory, logical)))
    } else if (info.isSymbolicLink()) {
      entries.push({ ...entry, target: await readlink(filename) })
    } else {
      assert.ok(info.isFile())
      entries.push({ ...entry, sha256: digest(await readFile(filename)) })
    }
  }
  return entries
}

async function withPayload(
  use: (fixture: {
    directory: string
    keys: Keys
    manifest: RuntimeReleaseManifest
    selection: RuntimeReleaseSelection
    work: string
  }) => Promise<void>,
) {
  assert.ok(
    configFixture,
    'Actual 17-file config fixture is required for producer filesystem tests',
  )
  await withWork(async (work) => {
    const directory = path.join(work, 'source')
    const original = runtimeManifest()
    const files: RuntimeReleaseManifest['files'][number][] = []
    for (const entry of original.files) {
      assert.equal(entry.kind, 'file')
      if (entry.kind !== 'file') {
        throw new Error('Literal fixture contains regular files only')
      }
      let bytes: Buffer
      if (entry.path.startsWith('config/')) {
        bytes = await readFile(path.join(configFixture, entry.path.slice(7)))
        assert.equal(digest(bytes), entry.sha256, `Actual pinned config required: ${entry.path}`)
      } else {
        switch (entry.path) {
          case 'python/bin/python3.12': {
            bytes = Buffer.from('synthetic Python; never executed')

            break
          }
          case 'requirements.txt': {
            bytes = Buffer.from(runtimeReleaseRequirements(original))

            break
          }
          case 'uv/uv': {
            bytes = Buffer.from('synthetic uv; never executed')

            break
          }
          default: {
            bytes = Buffer.from('synthetic worker wheel; packaging test only')
          }
        }
      }
      const destination = path.join(directory, entry.path)
      await mkdir(path.dirname(destination), { mode: 0o700, recursive: true })
      await writeFile(destination, bytes, { flag: 'wx', mode: entry.executable ? 0o700 : 0o600 })
      files.push({ ...entry, sizeBytes: bytes.length })
    }
    for (const [name, bytes] of [
      ['python/lib/empty.py', Buffer.alloc(0)],
      ['python/share/terminfo/2/2621A', Buffer.from('UPPER')],
      ['python/share/terminfo/2/2621a', Buffer.from('lower')],
    ] as const) {
      const destination = path.join(directory, name)
      await mkdir(path.dirname(destination), { mode: 0o700, recursive: true })
      await writeFile(destination, bytes, { flag: 'wx', mode: 0o600 })
      files.push(descriptor(name, bytes))
    }
    await symlink('python3.12', path.join(directory, 'python/bin/python3'))
    files.push({ kind: 'symlink', path: 'python/bin/python3', target: 'python3.12' })
    const manifest = { ...original, files }
    const keys = keyring()
    await use({
      directory,
      keys,
      manifest,
      selection: {
        appVersion: APP_VERSION,
        directory,
        envelope: seal(manifest, keys),
        trustedKeys: keys.trustedKeys,
      },
      work,
    })
  })
}

test(
  'producer packages exact verified source bytes, modes, empty files and Python link text without source mutation',
  actualConfig,
  async () => {
    await withPayload(async (f) => {
      const before = await sourceInventory(f.directory)
      const outputDirectory = path.join(f.work, 'delivery')
      const produced = await produceRuntimeTransport({
        outputDirectory,
        publisherKeyId: KEY_ID,
        publisherPrivateKey: f.keys.privateKey,
        release: f.selection,
      })
      assert.deepEqual(await sourceInventory(f.directory), before)
      assert.deepEqual((await readdir(outputDirectory)).sort(), OUTPUT_FILES)
      assert.deepEqual(
        await readFile(path.join(outputDirectory, 'runtime-release.json')),
        f.selection.envelope,
      )
      assert.deepEqual(produced.runtimeManifest, f.manifest)
      const archiveBytes = await readFile(path.join(outputDirectory, 'runtime-payload.zip'))
      assert.deepEqual(
        produced.manifest,
        transportManifest(f.manifest, f.selection.envelope, archiveBytes),
      )
      await produced.verifyCompleteTransportSnapshot()

      const archive = await yauzl.openPromise(path.join(outputDirectory, 'runtime-payload.zip'), {
        autoClose: false,
        lazyEntries: true,
      })
      const seen = new Set<string>()
      try {
        for await (const entry of archive.eachEntry()) {
          assert.ok(!seen.has(entry.fileName), `Duplicate ZIP member: ${entry.fileName}`)
          seen.add(entry.fileName)
          const expected = f.manifest.files.find((item) => item.path === entry.fileName)
          assert.ok(expected, `Unlisted ZIP member: ${entry.fileName}`)
          const chunks: Buffer[] = []
          for await (const chunk of await archive.openReadStreamPromise(entry)) {
            chunks.push(Buffer.from(chunk))
          }
          const bytes = Buffer.concat(chunks)
          const mode = entry.externalFileAttributes >>> 16
          if (expected.kind === 'symlink') {
            assert.equal(mode, 0o12_0777)
            assert.deepEqual(bytes, Buffer.from(expected.target, 'utf8'))
            assert.notDeepEqual(bytes, await readFile(path.join(f.directory, expected.path)))
          } else {
            assert.equal(mode, expected.executable ? 0o10_0700 : 0o10_0600)
            assert.equal(bytes.length, expected.sizeBytes)
            assert.equal(digest(bytes), expected.sha256)
            assert.deepEqual(bytes, await readFile(path.join(f.directory, expected.path)))
          }
        }
      } finally {
        archive.close()
      }
      assert.deepEqual([...seen].sort(), f.manifest.files.map((entry) => entry.path).sort())
      assert.ok(
        seen.has('python/share/terminfo/2/2621A') && seen.has('python/share/terminfo/2/2621a'),
      )
      assert.deepEqual((await verify(outputDirectory, f.keys)).manifest, produced.manifest)
      const publishedBefore = await sourceInventory(outputDirectory)
      await assert.rejects(
        produceRuntimeTransport({
          outputDirectory,
          publisherKeyId: KEY_ID,
          publisherPrivateKey: f.keys.privateKey,
          release: f.selection,
        }),
        storage,
      )
      assert.deepEqual(await sourceInventory(outputDirectory), publishedBefore)
      assert.deepEqual(await sourceInventory(f.directory), before)
    })
  },
)

test(
  'same-length source drift rejects the archive stream and preserves an incomplete output before a restored neighbor succeeds',
  { ...actualConfig, timeout: 20_000 },
  async () => {
    await withPayload(async (f) => {
      const python = path.join(f.directory, 'python/bin/python3.12')
      const original = await readFile(python)
      const modified = Buffer.from(original)
      modified[0] ^= 1
      assert.equal(modified.length, original.length)
      const failedOutput = path.join(f.work, 'source-drift')
      let beforeArchiveCalls = 0
      let deadline: NodeJS.Timeout | undefined
      try {
        // Node's test runner treats unhandled stream errors/rejections as failures. The rejection
        // and healthy neighbor must both settle in this process; no process error handler masks it.
        await assert.rejects(
          Promise.race([
            produceRuntimeTransport({
              beforeArchive: async () => {
                beforeArchiveCalls++
                await writeFile(python, modified)
              },
              outputDirectory: failedOutput,
              publisherKeyId: KEY_ID,
              publisherPrivateKey: f.keys.privateKey,
              release: f.selection,
            }),
            new Promise<never>((_resolve, reject) => {
              deadline = setTimeout(
                () => reject(new Error('Source-drift archive did not reject within five seconds')),
                5000,
              )
            }),
          ]),
          changed,
        )
        assert.equal(beforeArchiveCalls, 1)
        assert.ok((await lstat(path.join(failedOutput, '.incomplete'))).isFile())
        await absent(path.join(failedOutput, 'runtime-transport.json'))
        await assert.rejects(verify(failedOutput, f.keys), storage)
      } finally {
        if (deadline) {
          clearTimeout(deadline)
        }
        await writeFile(python, original)
      }
      assert.deepEqual(await readFile(python), original)
      const healthyOutput = path.join(f.work, 'restored-source')
      const healthy = await produceRuntimeTransport({
        outputDirectory: healthyOutput,
        publisherKeyId: KEY_ID,
        publisherPrivateKey: f.keys.privateKey,
        release: f.selection,
      })
      await healthy.verifyCompleteTransportSnapshot()
      await absent(path.join(healthyOutput, '.incomplete'))
      assert.deepEqual((await readdir(healthyOutput)).sort(), OUTPUT_FILES)
      const archive = await yauzl.openPromise(path.join(healthyOutput, 'runtime-payload.zip'), {
        autoClose: false,
        lazyEntries: true,
      })
      let restoredMemberSeen = false
      try {
        for await (const entry of archive.eachEntry()) {
          if (entry.fileName !== 'python/bin/python3.12') {
            continue
          }
          assert.equal(restoredMemberSeen, false)
          restoredMemberSeen = true
          const chunks: Buffer[] = []
          for await (const chunk of await archive.openReadStreamPromise(entry)) {
            chunks.push(Buffer.from(chunk))
          }
          assert.deepEqual(Buffer.concat(chunks), original)
        }
      } finally {
        archive.close()
      }
      assert.equal(restoredMemberSeen, true)
    })
  },
)

test(
  'producer refuses source/output aliases, overlap and existing destinations without changing owned or foreign bytes',
  actualConfig,
  async (t) => {
    for (const kind of [
      'source-symlink',
      'source-file-symlink',
      'output-symlink',
      'output-parent-symlink',
      'existing-output',
      'output-inside-source',
      'source-inside-output',
    ] as const) {
      await t.test(kind, async () =>
        withPayload(async (f) => {
          let release = f.selection
          let outputDirectory = path.join(f.work, 'delivery')
          const foreign = path.join(f.work, 'foreign')
          await mkdir(foreign, { mode: 0o700 })
          await writeFile(path.join(foreign, 'keep.txt'), 'preserve foreign bytes', { flag: 'wx' })
          if (kind === 'source-symlink') {
            const alias = path.join(f.work, 'source-alias')
            await symlink(f.directory, alias)
            release = { ...release, directory: alias }
          }
          if (kind === 'source-file-symlink') {
            const target = path.join(foreign, 'uv-target')
            await writeFile(target, 'foreign uv target must not be read or changed', { flag: 'wx' })
            await rm(path.join(f.directory, 'uv/uv'))
            await symlink(target, path.join(f.directory, 'uv/uv'))
          }
          if (kind === 'output-symlink') {
            await symlink(foreign, outputDirectory)
          }
          if (kind === 'output-parent-symlink') {
            const alias = path.join(f.work, 'parent-alias')
            await symlink(foreign, alias)
            outputDirectory = path.join(alias, 'must-not-be-created')
          }
          if (kind === 'existing-output') {
            await mkdir(outputDirectory, { mode: 0o700 })
            await writeFile(path.join(outputDirectory, 'keep.txt'), 'existing destination', {
              flag: 'wx',
            })
          }
          if (kind === 'output-inside-source') {
            outputDirectory = path.join(f.directory, 'new-delivery')
          }
          if (kind === 'source-inside-output') {
            outputDirectory = f.work
          }
          const sourceBefore = await sourceInventory(f.directory)
          const foreignBefore = await sourceInventory(foreign)
          await assert.rejects(
            produceRuntimeTransport({
              outputDirectory,
              publisherKeyId: KEY_ID,
              publisherPrivateKey: f.keys.privateKey,
              release,
            }),
            rejectedBy('RUNTIME_TRANSPORT_STORAGE', 'RUNTIME_RELEASE_INVALID_STORAGE'),
          )
          assert.deepEqual(await sourceInventory(f.directory), sourceBefore)
          assert.deepEqual(await sourceInventory(foreign), foreignBefore)
          if (kind === 'existing-output') {
            assert.equal(
              await readFile(path.join(outputDirectory, 'keep.txt'), 'utf8'),
              'existing destination',
            )
            assert.deepEqual(await readdir(outputDirectory), ['keep.txt'])
          }
          if (
            kind === 'output-inside-source' ||
            kind === 'source-symlink' ||
            kind === 'source-file-symlink'
          ) {
            await absent(outputDirectory)
          }
          if (kind === 'output-parent-symlink') {
            await absent(path.join(foreign, 'must-not-be-created'))
          }
        }),
      )
    }
  },
)
