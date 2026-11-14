/**
 * Signed transport -> bounded extraction -> existing release verification. Synthetic Python/uv/
 * wheel bytes are never executed. Only complete positive payloads require the pinned config
 * fixture; trust and archive-header refusal cases remain unconditional.
 */
import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  readlink,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { test } from 'node:test'
import * as yazl from 'yazl'

import { extractRuntimeTransport } from './runtime-release-extraction.js'
import {
  RuntimeTransportError,
  type RuntimeTransportManifest,
  verifyRuntimeTransport,
} from './runtime-release-transport.js'
import {
  canonicalRuntimeReleaseJson,
  PINNED_RUNTIME_CONFIG_FILES,
  RuntimeReleaseError,
  type RuntimeReleaseFile,
  type RuntimeReleaseManifest,
  runtimeReleaseRequirements,
  verifyRuntimeRelease,
} from './runtime-release.js'

const APP_VERSION = '1.0.0'
const KEY_ID = 'extraction-fixture-key'
const ARCHIVE = 'runtime-payload.zip'
const INNER = 'runtime-release.json'
const OUTER = 'runtime-transport.json'
const configFixture = process.env.IGS_RUNTIME_RELEASE_CONFIG_FIXTURE
const actualConfig = { skip: !configFixture }
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

type Keys = ReturnType<typeof keyring>
interface ZipMember {
  bytes: Buffer
  mode: number
  name: string
}
interface Fixture {
  directory: string
  entries: ZipMember[]
  inner: Buffer
  keys: Keys
  runtime: RuntimeReleaseManifest
  work: string
}
function keyring() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  return {
    privateKey,
    trustedKeys: { [KEY_ID]: publicKey.export({ format: 'pem', type: 'spki' }).toString() },
  }
}

function seal(value: unknown, keys: Keys): Buffer {
  const payload = canonicalRuntimeReleaseJson(value)
  return canonicalRuntimeReleaseJson({
    keyId: KEY_ID,
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

async function payload(actual: boolean) {
  const python = Buffer.from('synthetic Python; never execute')
  const uv = Buffer.from('synthetic uv; never execute')
  const wheel = Buffer.from('synthetic built worker wheel; never import')
  const wheelFile = descriptor('wheels/imagegen_worker-0.1.0-py3-none-any.whl', wheel)
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
    releaseId: 'extraction-fixture',
    requiredFreeBytes: 16 * 1024 ** 2,
    requirementsPath: 'requirements.txt',
    schemaVersion: 1,
    uv: { executable: 'uv/uv', version: '0.11.11' },
    wheels: [
      {
        distribution: 'imagegen-worker',
        path: wheelFile.path,
        sha256: wheelFile.sha256,
        sizeBytes: wheelFile.sizeBytes,
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
  const ordinary: [string, Buffer, boolean][] = [
    ['python/bin/python3.12', python, true],
    ['uv/uv', uv, true],
    [wheelFile.path, wheel, false],
    ['requirements.txt', Buffer.from(runtimeReleaseRequirements(base)), false],
    ['python/lib/empty.py', Buffer.alloc(0), false],
    ['python/share/terminfo/2/2621A', Buffer.from('UPPER'), false],
    ['python/share/terminfo/2/2621a', Buffer.from('lower'), false],
  ]
  const files: RuntimeReleaseManifest['files'][number][] = []
  const entries: ZipMember[] = []
  for (const [name, bytes, executable] of ordinary) {
    files.push(descriptor(name, bytes, executable))
    entries.push({ bytes, mode: executable ? 0o10_0700 : 0o10_0600, name })
  }
  for (const [name, sha256] of Object.entries(PINNED_RUNTIME_CONFIG_FILES)) {
    let bytes: Buffer = Buffer.from('x')
    if (actual) {
      assert.ok(configFixture, 'Actual pinned17 config fixture is required')
      bytes = await readFile(path.join(configFixture, name))
      assert.equal(digest(bytes), sha256, `Actual pinned config required: ${name}`)
    }
    files.push({
      executable: false,
      kind: 'file',
      path: `config/${name}`,
      sha256,
      sizeBytes: bytes.length,
    })
    entries.push({ bytes, mode: 0o10_0600, name: `config/${name}` })
  }
  files.push({ kind: 'symlink', path: 'python/bin/python3', target: 'python3.12' })
  entries.push({ bytes: Buffer.from('python3.12'), mode: 0o12_0777, name: 'python/bin/python3' })
  return { entries, runtime: { ...base, files } }
}

async function writeZip(filename: string, entries: ZipMember[]) {
  const zip = new yazl.ZipFile()
  for (const entry of entries) {
    if (entry.name.endsWith('/')) {
      zip.addEmptyDirectory(entry.name, { mode: entry.mode })
    } else {
      zip.addBuffer(entry.bytes, entry.name, { compress: false, mode: entry.mode })
    }
  }
  zip.end({ comment: 'owned-extraction-fixture-comment', forceZip64Format: true })
  await pipeline(zip.outputStream, createWriteStream(filename, { flags: 'wx', mode: 0o600 }))
}

async function publishArchive(f: Fixture, entries = f.entries, patch?: (bytes: Buffer) => void) {
  const temporary = path.join(f.work, 'next-archive.zip')
  await writeZip(temporary, entries)
  if (patch) {
    const bytes = await readFile(temporary)
    patch(bytes)
    await writeFile(temporary, bytes)
  }
  await rename(temporary, path.join(f.directory, ARCHIVE))
  const archive = await readFile(path.join(f.directory, ARCHIVE))
  const manifest: RuntimeTransportManifest = {
    appVersion: APP_VERSION,
    artifact: {
      filename: ARCHIVE,
      format: 'zip-v1',
      sha256: digest(archive),
      sizeBytes: archive.length,
    },
    entryCount: f.runtime.files.length,
    expandedRegularBytes: f.runtime.files.reduce(
      (sum, entry) => sum + (entry.kind === 'file' ? entry.sizeBytes : 0),
      0,
    ),
    profile: 'linux-nvidia',
    releaseId: f.runtime.releaseId,
    runtimeEnvelopeSha256: digest(f.inner),
    runtimeManifestSha256: digest(canonicalRuntimeReleaseJson(f.runtime)),
    schemaVersion: 1,
    scope: 'runtime-transport',
  }
  await writeFile(path.join(f.directory, INNER), f.inner)
  await writeFile(path.join(f.directory, OUTER), seal(manifest, f.keys))
}

async function withFixture(actual: boolean, use: (f: Fixture) => Promise<void>) {
  const work = await mkdtemp(path.join(os.tmpdir(), 'igs-runtime-extraction-'))
  try {
    const directory = path.join(work, 'transport')
    await mkdir(directory, { mode: 0o700 })
    const keys = keyring()
    const content = await payload(actual)
    const f = { ...content, directory, inner: seal(content.runtime, keys), keys, work }
    await publishArchive(f)
    await use(f)
  } finally {
    await rm(work, { force: true, recursive: true })
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

function input(f: Fixture, outputDirectory = path.join(f.work, 'extracted')) {
  return {
    appVersion: APP_VERSION,
    outputDirectory,
    transportDirectory: f.directory,
    trustedKeys: f.keys.trustedKeys,
  }
}

async function absent(filename: string) {
  await assert.rejects(lstat(filename), { code: 'ENOENT' })
}

async function tree(directory: string, relative = ''): Promise<unknown[]> {
  const result: unknown[] = []
  for (const name of (await readdir(path.join(directory, relative))).sort()) {
    const logical = path.posix.join(relative, name)
    const filename = path.join(directory, logical)
    const info = await lstat(filename, { bigint: true })
    const record = {
      ctimeNs: info.ctimeNs.toString(),
      dev: info.dev.toString(),
      ino: info.ino.toString(),
      mode: info.mode.toString(),
      mtimeNs: info.mtimeNs.toString(),
      path: logical,
      size: info.size.toString(),
    }
    if (info.isDirectory()) {
      result.push(record, ...(await tree(directory, logical)))
    } else if (info.isSymbolicLink()) {
      result.push({ ...record, target: await readlink(filename) })
    } else {
      assert.ok(info.isFile())
      result.push({ ...record, sha256: digest(await readFile(filename)) })
    }
  }
  return result
}

async function ownedDescriptors(work: string): Promise<string[]> {
  const result: string[] = []
  for (const fd of await readdir('/proc/self/fd')) {
    const target = await readlink(`/proc/self/fd/${fd}`).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        return ''
      }
      throw error
    })
    if (target.startsWith(`${work}/`)) {
      result.push(`${fd}:${target}`)
    }
  }
  return result.sort()
}

function patchMemberName(bytes: Buffer, original: string, replacement: string) {
  const from = Buffer.from(original)
  const to = Buffer.from(replacement)
  assert.equal(from.length, to.length)
  let count = 0
  for (let offset = 0; (offset = bytes.indexOf(from, offset)) !== -1; offset += from.length) {
    to.copy(bytes, offset)
    count++
  }
  assert.equal(count, 2, 'Patch must reach exactly one local and central ZIP filename')
}

test('extraction requires trusted signatures before creating an output', async (t) => {
  for (const kind of [
    'untrusted-key',
    'wrong-key',
    'outer-signature',
    'inner-signature',
  ] as const) {
    await t.test(kind, async () =>
      withFixture(false, async (f) => {
        if (kind === 'outer-signature') {
          const sealed = JSON.parse((await readFile(path.join(f.directory, OUTER))).toString())
          sealed.signature = Buffer.alloc(64).toString('base64')
          await writeFile(path.join(f.directory, OUTER), JSON.stringify(sealed))
        }
        if (kind === 'inner-signature') {
          const sealed = JSON.parse(f.inner.toString())
          sealed.signature = Buffer.alloc(64).toString('base64')
          f.inner = Buffer.from(JSON.stringify(sealed))
          await publishArchive(f)
        }
        await assert.rejects(
          extractRuntimeTransport({
            ...input(f),
            trustedKeys:
              kind === 'untrusted-key'
                ? {}
                : kind === 'wrong-key'
                  ? keyring().trustedKeys
                  : f.keys.trustedKeys,
          }),
          rejectedBy('RUNTIME_RELEASE_UNTRUSTED'),
        )
        await absent(input(f).outputDirectory)
        assert.deepEqual(await ownedDescriptors(f.work), [])
      }),
    )
  }
})

test('signed malformed ZIP membership, entry types, modes and sizes refuse in preflight', async (t) => {
  for (const kind of [
    'extra',
    'missing',
    'duplicate',
    'directory',
    'traversal',
    'backslash',
    'regular-mode',
    'regular-as-link',
    'link-as-regular',
    'size',
    'compression',
    'encrypted',
    'malformed-directory',
    'link-target',
    'link-crc',
  ] as const) {
    await t.test(kind, async () =>
      withFixture(false, async (f) => {
        const entries = f.entries.map((entry) => ({ ...entry, bytes: Buffer.from(entry.bytes) }))
        const python = entries.find((entry) => entry.name === 'python/bin/python3.12')!
        const link = entries.find((entry) => entry.name === 'python/bin/python3')!
        const markerIndex = entries.findIndex((entry) => entry.name === 'python/lib/empty.py')
        let patch: ((bytes: Buffer) => void) | undefined
        if (kind === 'extra') {
          entries[markerIndex].name = 'python/unlisted-file'
        }
        if (kind === 'missing') {
          entries.splice(markerIndex, 1)
        }
        if (kind === 'duplicate') {
          entries.push({ ...python })
        }
        if (kind === 'directory') {
          entries[markerIndex] = { bytes: Buffer.alloc(0), mode: 0o04_0700, name: 'python/lib/' }
        }
        if (kind === 'traversal') {
          patch = (bytes) =>
            patchMemberName(bytes, python.name, `../${'x'.repeat(python.name.length - 3)}`)
        }
        if (kind === 'backslash') {
          patch = (bytes) => patchMemberName(bytes, python.name, python.name.replace('/', '\\'))
        }
        if (kind === 'regular-mode') {
          python.mode = 0o10_0644
        }
        if (kind === 'regular-as-link') {
          python.mode = 0o12_0777
        }
        if (kind === 'link-as-regular') {
          link.mode = 0o10_0600
        }
        if (kind === 'size') {
          python.bytes = Buffer.concat([python.bytes, Buffer.from('x')])
        }
        if (kind === 'link-target') {
          link.bytes = Buffer.from('python3.13')
          assert.equal(link.bytes.length, Buffer.byteLength('python3.12'))
        }
        if (kind === 'compression' || kind === 'encrypted') {
          patch = (bytes) => {
            const central = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
            assert.ok(central > 0)
            assert.equal(bytes.readUInt32LE(0), 0x04_03_4b_50)
            if (kind === 'compression') {
              bytes.writeUInt16LE(12, 8)
              bytes.writeUInt16LE(12, central + 10)
            } else {
              bytes.writeUInt16LE(bytes.readUInt16LE(6) | 1, 6)
              bytes.writeUInt16LE(bytes.readUInt16LE(central + 8) | 1, central + 8)
            }
          }
        }
        if (kind === 'malformed-directory') {
          patch = (bytes) => {
            const central = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
            assert.ok(central > 0)
            bytes[central] ^= 1
          }
        }
        if (kind === 'link-crc') {
          patch = (bytes) => {
            const name = Buffer.from(link.name)
            // Exact name also prefixes python3.12, so locate headers using their full name length.
            let patchedHeaders = 0
            for (let offset = 0; offset < bytes.length - 46; offset++) {
              if (
                bytes.readUInt32LE(offset) === 0x04_03_4b_50 &&
                bytes.readUInt16LE(offset + 26) === name.length &&
                bytes.subarray(offset + 30, offset + 30 + name.length).equals(name)
              ) {
                bytes.writeUInt32LE((bytes.readUInt32LE(offset + 14) ^ 1) >>> 0, offset + 14)
                patchedHeaders++
              }
              if (
                bytes.readUInt32LE(offset) === 0x02_01_4b_50 &&
                bytes.readUInt16LE(offset + 28) === name.length &&
                bytes.subarray(offset + 46, offset + 46 + name.length).equals(name)
              ) {
                bytes.writeUInt32LE((bytes.readUInt32LE(offset + 16) ^ 1) >>> 0, offset + 16)
                patchedHeaders++
              }
            }
            assert.equal(patchedHeaders, 2)
          }
        }
        await publishArchive(f, entries, patch)
        const before = await tree(f.directory)
        await assert.rejects(extractRuntimeTransport(input(f)), invalid)
        await absent(input(f).outputDirectory)
        assert.deepEqual(await tree(f.directory), before)
        assert.deepEqual(await ownedDescriptors(f.work), [])
      }),
    )
  }
})

test('implicit directories count against the existing complete-payload entry ceiling before output', async () => {
  await withFixture(false, async (f) => {
    const entries = [...f.entries]
    const files = [...f.runtime.files]
    for (let i = 0; i < 205; i++) {
      const name = `python/tree-${i}/${Array.from({ length: 500 }, () => 'x').join('/')}/empty`
      assert.ok(name.length <= 1024)
      const bytes = Buffer.alloc(0)
      files.push(descriptor(name, bytes))
      entries.push({ bytes, mode: 0o10_0600, name })
    }
    f.runtime = { ...f.runtime, files }
    f.inner = seal(f.runtime, f.keys)
    await publishArchive(f, entries)
    await assert.rejects(extractRuntimeTransport(input(f)), invalid)
    await absent(input(f).outputDirectory)
    assert.deepEqual(await ownedDescriptors(f.work), [])
  })
})

test(
  'a complete signed archive extracts into a separate exact payload and existing release verifier',
  actualConfig,
  async () => {
    await withFixture(true, async (f) => {
      const before = await tree(f.directory)
      const selected = await extractRuntimeTransport(input(f))
      assert.equal(selected.directory, path.join(input(f).outputDirectory, 'payload'))
      assert.equal(selected.appVersion, APP_VERSION)
      assert.deepEqual(selected.envelope, f.inner)
      assert.deepEqual(selected.trustedKeys, f.keys.trustedKeys)
      assert.deepEqual((await readdir(input(f).outputDirectory)).sort(), ['payload', INNER])
      assert.equal((await lstat(input(f).outputDirectory)).mode & 0o777, 0o700)
      assert.deepEqual(await readFile(path.join(input(f).outputDirectory, INNER)), f.inner)
      await absent(path.join(input(f).outputDirectory, '.incomplete'))
      const verified = await verifyRuntimeRelease(selected)
      assert.deepEqual(verified.manifest, f.runtime)
      await verified.verifyCompletePayloadSnapshot()
      for (const entry of f.runtime.files) {
        const filename = path.join(selected.directory, entry.path)
        const info = await lstat(filename)
        if (entry.kind === 'symlink') {
          assert.ok(info.isSymbolicLink())
          assert.equal(await readlink(filename), entry.target)
          assert.ok(
            (await realpath(filename)).startsWith(
              path.join(selected.directory, 'python') + path.sep,
            ),
          )
        } else {
          assert.ok(info.isFile() && !info.isSymbolicLink())
          assert.equal(info.mode & 0o777, entry.executable ? 0o700 : 0o600)
          assert.equal(info.size, entry.sizeBytes)
          assert.equal(digest(await readFile(filename)), entry.sha256)
        }
      }
      assert.deepEqual(await tree(f.directory), before)
      assert.deepEqual(await ownedDescriptors(f.work), [])
      const published = await tree(input(f).outputDirectory)
      await assert.rejects(extractRuntimeTransport(input(f)), storage)
      assert.deepEqual(await tree(input(f).outputDirectory), published)
      const python = path.join(selected.directory, 'python/bin/python3.12')
      const original = await readFile(python)
      const modified = Buffer.from(original)
      modified[0] ^= 1
      try {
        await writeFile(python, modified)
        await assert.rejects(
          verified.verifyCompletePayloadSnapshot(),
          rejectedBy('RUNTIME_RELEASE_PAYLOAD_CHANGED'),
        )
      } finally {
        await writeFile(python, original)
      }
      await (await verifyRuntimeRelease(selected)).verifyCompletePayloadSnapshot()
    })
  },
)

test(
  'regular payload hash and CRC drift with a newly signed outer identity refuse after preflight',
  actualConfig,
  async (t) => {
    for (const kind of ['sha256', 'crc32'] as const) {
      await t.test(kind, async () =>
        withFixture(true, async (f) => {
          const entries = f.entries.map((entry) => ({ ...entry, bytes: Buffer.from(entry.bytes) }))
          let patch: ((bytes: Buffer) => void) | undefined
          if (kind === 'sha256') {
            entries[0].bytes[0] ^= 1
          } else {
            patch = (bytes) => {
              const central = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
              assert.ok(central > 0)
              bytes.writeUInt32LE((bytes.readUInt32LE(14) ^ 1) >>> 0, 14)
              bytes.writeUInt32LE((bytes.readUInt32LE(central + 16) ^ 1) >>> 0, central + 16)
            }
          }
          await publishArchive(f, entries, patch)
          await assert.rejects(extractRuntimeTransport(input(f)), changed)
          assert.ok((await lstat(path.join(input(f).outputDirectory, '.incomplete'))).isFile())
          assert.deepEqual(await ownedDescriptors(f.work), [])
        }),
      )
    }
  },
)

test(
  'source comment drift and cancellation after review retain incomplete output and allow a restored neighbor',
  { ...actualConfig, timeout: 20_000 },
  async (t) => {
    for (const kind of ['source-drift', 'cancel'] as const) {
      await t.test(kind, async () =>
        withFixture(true, async (f) => {
          const archive = path.join(f.directory, ARCHIVE)
          const original = await readFile(archive)
          const controller = new AbortController()
          let hookCalls = 0
          let deadline: NodeJS.Timeout | undefined
          try {
            await assert.rejects(
              Promise.race([
                extractRuntimeTransport({
                  ...input(f),
                  beforeExtract: async () => {
                    hookCalls++
                    if (kind === 'cancel') {
                      controller.abort()
                    } else {
                      const modified = Buffer.from(original)
                      modified[modified.length - 1] ^= 1
                      await writeFile(archive, modified)
                    }
                  },
                  signal: controller.signal,
                }),
                new Promise<never>((_resolve, reject) => {
                  deadline = setTimeout(
                    () => reject(new Error('Extraction did not reject within five seconds')),
                    5000,
                  )
                }),
              ]),
              kind === 'cancel' ? rejectedBy('RUNTIME_TRANSPORT_CANCELED') : changed,
            )
            assert.equal(hookCalls, 1)
            assert.ok((await lstat(path.join(input(f).outputDirectory, '.incomplete'))).isFile())
            assert.deepEqual(await ownedDescriptors(f.work), [])
          } finally {
            if (deadline) {
              clearTimeout(deadline)
            }
            await writeFile(archive, original)
          }
          const restored = await extractRuntimeTransport(
            input(f, path.join(f.work, 'restored-neighbor')),
          )
          await (await verifyRuntimeRelease(restored)).verifyCompletePayloadSnapshot()
          assert.deepEqual(await readFile(archive), original)
          assert.deepEqual(await ownedDescriptors(f.work), [])
        }),
      )
    }
  },
)

test('unsafe storage, aliases and overlapping output preserve all source and foreign bytes', async (t) => {
  for (const kind of [
    'source-alias',
    'output-alias',
    'parent-alias',
    'existing-output',
    'inside-source',
    'source-inside-output',
  ] as const) {
    await t.test(kind, async () =>
      withFixture(false, async (f) => {
        let options = input(f)
        const foreign = path.join(f.work, 'foreign')
        await mkdir(foreign, { mode: 0o700 })
        await writeFile(path.join(foreign, 'keep.txt'), 'preserve foreign bytes')
        if (kind === 'source-alias') {
          const alias = path.join(f.work, 'source-alias')
          await symlink(f.directory, alias)
          options = { ...options, transportDirectory: alias }
        }
        if (kind === 'output-alias') {
          await symlink(foreign, options.outputDirectory)
        }
        if (kind === 'parent-alias') {
          const alias = path.join(f.work, 'parent-alias')
          await symlink(foreign, alias)
          options = { ...options, outputDirectory: path.join(alias, 'not-created') }
        }
        if (kind === 'existing-output') {
          await mkdir(options.outputDirectory, { mode: 0o700 })
          await writeFile(
            path.join(options.outputDirectory, 'keep.txt'),
            'preserve existing output',
          )
        }
        if (kind === 'inside-source') {
          options = { ...options, outputDirectory: path.join(f.directory, 'not-created') }
        }
        if (kind === 'source-inside-output') {
          options = { ...options, outputDirectory: f.work }
        }
        const beforeSource = await tree(f.directory)
        const beforeForeign = await tree(foreign)
        await assert.rejects(extractRuntimeTransport(options), storage)
        assert.deepEqual(await tree(f.directory), beforeSource)
        assert.deepEqual(await tree(foreign), beforeForeign)
        if (kind === 'source-alias' || kind === 'inside-source') {
          await absent(options.outputDirectory)
        }
        if (kind === 'parent-alias') {
          await absent(path.join(foreign, 'not-created'))
        }
        if (kind === 'existing-output') {
          assert.deepEqual(await readdir(options.outputDirectory), ['keep.txt'])
          assert.equal(
            await readFile(path.join(options.outputDirectory, 'keep.txt'), 'utf8'),
            'preserve existing output',
          )
        }
        assert.deepEqual(await ownedDescriptors(f.work), [])
      }),
    )
  }
})

test(
  'payload-root substitution before directory creation preserves the foreign tree and incomplete marker',
  { ...actualConfig, timeout: 10_000 },
  async () => {
    await withFixture(true, async (f) => {
      const options = input(f)
      const foreign = path.join(f.work, 'foreign-directory-root')
      const moved = path.join(f.work, 'owned-moved-before-directories')
      await mkdir(foreign, { mode: 0o700 })
      await writeFile(path.join(foreign, 'keep.txt'), 'foreign directory sentinel', { flag: 'wx' })
      const before = await tree(foreign)
      let hookCalls = 0
      await assert.rejects(
        extractRuntimeTransport({
          ...options,
          beforeDirectories: async () => {
            hookCalls++
            await rename(path.join(options.outputDirectory, 'payload'), moved)
            await symlink(foreign, path.join(options.outputDirectory, 'payload'))
          },
        }),
        changed,
      )
      assert.equal(hookCalls, 1)
      assert.deepEqual(await readdir(foreign), ['keep.txt'])
      assert.deepEqual(await tree(foreign), before)
      assert.equal(
        await readFile(path.join(foreign, 'keep.txt'), 'utf8'),
        'foreign directory sentinel',
      )
      assert.ok((await lstat(path.join(options.outputDirectory, 'payload'))).isSymbolicLink())
      assert.ok((await lstat(path.join(options.outputDirectory, '.incomplete'))).isFile())
      assert.deepEqual(await ownedDescriptors(f.work), [])
    })
  },
)

test(
  'payload substitution after parent checks cannot redirect the first regular-file write',
  { ...actualConfig, timeout: 10_000 },
  async () => {
    await withFixture(true, async (f) => {
      const options = input(f)
      const foreign = path.join(f.work, 'foreign-file-root')
      const moved = path.join(f.work, 'owned-moved-before-file-open')
      await mkdir(foreign, { mode: 0o700 })
      await writeFile(path.join(foreign, 'keep.txt'), 'foreign file sentinel', { flag: 'wx' })
      let attackedMember: string | null = null
      let before: unknown[] | null = null
      await assert.rejects(
        extractRuntimeTransport({
          ...options,
          beforeFileWrite: async (member) => {
            if (attackedMember !== null) {
              return
            }
            assert.equal(f.runtime.files.find((entry) => entry.path === member)?.kind, 'file')
            attackedMember = member
            // A pathname-based open would now have a complete foreign parent to traverse.
            await mkdir(path.dirname(path.join(foreign, member)), { mode: 0o700, recursive: true })
            before = await tree(foreign)
            await rename(path.join(options.outputDirectory, 'payload'), moved)
            await symlink(foreign, path.join(options.outputDirectory, 'payload'))
          },
        }),
        changed,
      )
      assert.ok(attackedMember !== null && before !== null)
      await absent(path.join(foreign, attackedMember))
      assert.deepEqual(await tree(foreign), before)
      assert.equal(await readFile(path.join(foreign, 'keep.txt'), 'utf8'), 'foreign file sentinel')
      assert.ok((await lstat(path.join(options.outputDirectory, 'payload'))).isSymbolicLink())
      assert.ok((await lstat(path.join(options.outputDirectory, '.incomplete'))).isFile())
      assert.deepEqual(await ownedDescriptors(f.work), [])
    })
  },
)

test('a canceled transport snapshot preserves CANCELED instead of relabeling it as byte drift', async () => {
  await withFixture(false, async (f) => {
    const controller = new AbortController()
    const before = await tree(f.directory)
    const verified = await verifyRuntimeTransport({
      appVersion: APP_VERSION,
      directory: f.directory,
      signal: controller.signal,
      trustedKeys: f.keys.trustedKeys,
    })
    await verified.verifyCompleteTransportSnapshot()
    controller.abort()
    await assert.rejects(
      verified.verifyCompleteTransportSnapshot(),
      rejectedBy('RUNTIME_TRANSPORT_CANCELED'),
    )
    assert.deepEqual(await tree(f.directory), before)
    assert.deepEqual(await ownedDescriptors(f.work), [])
  })
})
