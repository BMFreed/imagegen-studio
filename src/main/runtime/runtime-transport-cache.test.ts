/**
 * InvokeAI4875d96531ca6712b288f6e660fcbb34143408c1 source/callers reread:
 * download_default.py:_do_download/_validate_url/ _reject_unsafe_redirect;
 * model_install_default.py:download_and_cache_model and its per-source lock/recheck;
 * invocation_context.py:load_remote_model and infill.py:LaMa caller. These tests exercise Studio's
 * authenticated cache adaptation with synthetic bytes, never extraction, installed readiness, real
 * DNS/HTTP, a publisher deployment or model execution.
 */
import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto'
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
  unlink,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'

import {
  ModelDownloader,
  ModelDownloadError,
  type RuntimeArtifactDownloadInput,
  type VerifiedStagedModelFile,
} from '../models/model-downloader.js'
import {
  type RuntimeTransportManifest,
  verifyRuntimeTransport,
  verifyRuntimeTransportMetadata,
} from './runtime-release-transport.js'
import {
  canonicalRuntimeReleaseJson,
  PINNED_RUNTIME_CONFIG_FILES,
  type RuntimeReleaseFile,
  type RuntimeReleaseManifest,
  runtimeReleaseRequirements,
} from './runtime-release.js'
import {
  cacheRuntimeTransport,
  type RuntimeTransportCacheInput,
} from './runtime-transport-cache.js'

const APP_VERSION = '1.0.0'
const KEY_ID = 'cache-qualification-publisher'
const SOURCE = {
  redirectOrigins: ['https://cdn.example.org'],
  url: 'https://example.org/runtime.zip',
}
const TRANSPORT_FILES = ['runtime-payload.zip', 'runtime-release.json', 'runtime-transport.json']
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
type Downloader = NonNullable<RuntimeTransportCacheInput['downloader']>
type Download = (input: RuntimeArtifactDownloadInput) => Promise<VerifiedStagedModelFile>

type Keys = ReturnType<typeof keys>
type Fixture = ReturnType<typeof signedFixture>
function keys() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  return {
    privateKey,
    trustedKeys: { [KEY_ID]: publicKey.export({ format: 'pem', type: 'spki' }).toString() },
  }
}
function seal(value: unknown, signing: Keys): Buffer {
  const payload = canonicalRuntimeReleaseJson(value)
  return canonicalRuntimeReleaseJson({
    keyId: KEY_ID,
    payload: payload.toString('base64'),
    schemaVersion: 1,
    signature: sign(null, payload, signing.privateKey).toString('base64'),
  })
}
function descriptor(name: string, bytes: Buffer, executable = false): RuntimeReleaseFile {
  return { executable, kind: 'file', path: name, sha256: digest(bytes), sizeBytes: bytes.length }
}
function runtimeManifest(): RuntimeReleaseManifest {
  const wheel = descriptor(
    'wheels/imagegen_worker-0.1.0-py3-none-any.whl',
    Buffer.from('synthetic worker wheel'),
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
      buildId: 'synthetic-cpython',
      executable: 'python/bin/python3.12',
      version: '3.12.13',
    },
    releaseId: 'cache-fixture',
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
function signedFixture() {
  const signing = keys()
  // The cache authenticates opaque archive bytes. Member semantics belong to extraction tests.
  const archive = Buffer.from('Authenticated synthetic runtime archive bytes; never extracted.')
  const runtime = runtimeManifest()
  const runtimeEnvelope = seal(runtime, signing)
  const transport: RuntimeTransportManifest = {
    appVersion: APP_VERSION,
    artifact: {
      filename: 'runtime-payload.zip',
      format: 'zip-v1',
      sha256: digest(archive),
      sizeBytes: archive.length,
    },
    entryCount: runtime.files.length,
    expandedRegularBytes: runtime.files.reduce(
      (sum, item) => sum + (item.kind === 'file' ? item.sizeBytes : 0),
      0,
    ),
    profile: 'linux-nvidia',
    releaseId: runtime.releaseId,
    runtimeEnvelopeSha256: digest(runtimeEnvelope),
    runtimeManifestSha256: digest(canonicalRuntimeReleaseJson(runtime)),
    schemaVersion: 1,
    scope: 'runtime-transport',
  }
  return {
    archive,
    runtime,
    runtimeEnvelope,
    signing,
    transport,
    transportEnvelope: seal(transport, signing),
  }
}
function input(
  f: Fixture,
  cacheDirectory: string,
  downloader?: Downloader,
): RuntimeTransportCacheInput {
  return {
    appVersion: APP_VERSION,
    cacheDirectory,
    downloader,
    runtimeEnvelope: f.runtimeEnvelope,
    source: { redirectOrigins: [...SOURCE.redirectOrigins], url: SOURCE.url },
    transportEnvelope: f.transportEnvelope,
    trustedKeys: f.signing.trustedKeys,
  }
}
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
function code(...expected: string[]) {
  return (error: unknown) => {
    assert.ok(error instanceof Error && 'code' in error, 'Expected a typed boundary refusal')
    assert.ok(
      expected.includes(String(error.code)),
      `Expected ${expected.join('/')}, received ${String(error.code)}`,
    )
    return true
  }
}
const refused = code(
  'RUNTIME_TRANSPORT_STORAGE',
  'RUNTIME_TRANSPORT_CHANGED',
  'RUNTIME_TRANSPORT_INVALID',
  'RUNTIME_RELEASE_INVALID_MANIFEST',
  'RUNTIME_RELEASE_UNTRUSTED',
  'RUNTIME_RELEASE_INVALID_STORAGE',
)
const canceled = code('RUNTIME_TRANSPORT_CANCELED', 'DOWNLOAD_CANCELED')
async function withWork(use: (work: string) => Promise<void>) {
  const work = await mkdtemp(path.join(os.tmpdir(), 'igs-runtime-cache-'))
  try {
    await use(work)
  } finally {
    await rm(work, { force: true, recursive: true })
  }
}
async function absent(filename: string) {
  await assert.rejects(lstat(filename), { code: 'ENOENT' })
}
async function tree(root: string): Promise<unknown[]> {
  const rows: unknown[] = []
  async function visit(filename: string, name: string) {
    const info = await lstat(filename, { bigint: true })
    const identity = [info.dev, info.ino, info.mode, info.size, info.mtimeNs, info.ctimeNs].join(
      ':',
    )
    if (info.isSymbolicLink()) {
      rows.push({ identity, name, target: await readlink(filename), type: 'link' })
      return
    }
    if (info.isDirectory()) {
      rows.push({ identity, name, type: 'directory' })
      for (const child of (await readdir(filename)).sort()) {
        await visit(path.join(filename, child), `${name}/${child}`)
      }
    } else {
      assert.ok(info.isFile())
      rows.push({ identity, name, sha256: digest(await readFile(filename)), type: 'file' })
    }
  }
  await visit(root, '')
  return rows
}
function downloading(f: Fixture, use?: Download) {
  const calls: RuntimeArtifactDownloadInput[] = []
  const downloader: Downloader = {
    async downloadRuntimeArtifact(request) {
      calls.push(request)
      return await (use ? use(request) : stage(request, f.archive))
    },
  }
  return { calls, downloader }
}
async function stage(
  request: RuntimeArtifactDownloadInput,
  bytes: Buffer,
): Promise<VerifiedStagedModelFile> {
  const stagingPath = path.join(request.stagingDirectory, `${randomUUID()}.part`)
  await writeFile(stagingPath, bytes, { flag: 'wx', mode: 0o600 })
  request.onProgress?.({ downloadedBytes: bytes.length, totalBytes: request.expectedBytes })
  return { sha256: digest(bytes), sizeBytes: bytes.length, stagingPath }
}
async function within<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error('Boundary did not settle while the prior owner was held')),
          milliseconds,
        )
      }),
    ])
  } finally {
    if (timer) {
      clearTimeout(timer)
    }
  }
}
async function assertNoOwnedDescriptors(work: string) {
  if (process.platform !== 'linux') {
    return
  }
  const owned: string[] = []
  for (const fd of await readdir('/proc/self/fd')) {
    let target: string
    try {
      target = await readlink(`/proc/self/fd/${fd}`)
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        continue
      }
      throw error
    }
    if (target === work || target.startsWith(work + path.sep)) {
      owned.push(`${fd}:${target}`)
    }
  }
  assert.deepEqual(
    owned,
    [],
    'Cache refusal must close all descriptors into its exact owned fixture',
  )
}

test('pure selected metadata authenticates the same signed artifact without filesystem input', () => {
  const f = signedFixture()
  const verified = verifyRuntimeTransportMetadata({
    appVersion: APP_VERSION,
    runtimeEnvelope: f.runtimeEnvelope,
    transportEnvelope: f.transportEnvelope,
    trustedKeys: f.signing.trustedKeys,
  })
  assert.deepEqual(verified.manifest, f.transport)
  assert.deepEqual(verified.runtimeManifest, f.runtime)
  assert.equal(verified.transportEnvelopeSha256, digest(f.transportEnvelope))
})

test('a cold cache publishes actual authenticated bytes and a fresh hit performs no download', async () => {
  await withWork(async (work) => {
    const f = signedFixture()
    const fake = downloading(f)
    const cache = path.join(work, 'entry')
    const progress: { downloadedBytes: number; totalBytes: number | null }[] = []
    const first = await cacheRuntimeTransport({
      ...input(f, cache, fake.downloader),
      onProgress: (p) => progress.push(p),
    })
    assert.equal(fake.calls.length, 1)
    assert.equal(fake.calls[0].expectedBytes, f.archive.length)
    assert.equal(fake.calls[0].expectedSha256, digest(f.archive))
    assert.equal(fake.calls[0].url, SOURCE.url)
    assert.deepEqual(fake.calls[0].redirectOrigins, SOURCE.redirectOrigins)
    assert.deepEqual(progress, [
      { downloadedBytes: f.archive.length, totalBytes: f.archive.length },
    ])
    assert.equal(first.directory, path.join(cache, 'transport'))
    assert.deepEqual(await readdir(cache), ['transport'])
    assert.deepEqual((await readdir(first.directory)).sort(), TRANSPORT_FILES)
    assert.equal((await lstat(cache)).mode & 0o777, 0o700)
    assert.equal((await lstat(first.directory)).mode & 0o777, 0o700)
    for (const name of TRANSPORT_FILES) {
      assert.equal((await lstat(path.join(first.directory, name))).mode & 0o777, 0o600)
    }
    assert.deepEqual(await readFile(path.join(first.directory, 'runtime-payload.zip')), f.archive)
    assert.deepEqual(
      await readFile(path.join(first.directory, 'runtime-release.json')),
      f.runtimeEnvelope,
    )
    assert.deepEqual(
      await readFile(path.join(first.directory, 'runtime-transport.json')),
      f.transportEnvelope,
    )
    await first.verifyCompleteTransportSnapshot()
    const checked = await verifyRuntimeTransport({
      appVersion: APP_VERSION,
      directory: first.directory,
      trustedKeys: f.signing.trustedKeys,
    })
    assert.deepEqual(checked.manifest, f.transport)
    const before = await tree(cache)
    const second = await cacheRuntimeTransport(input(f, cache, fake.downloader))
    await second.verifyCompleteTransportSnapshot()
    assert.equal(fake.calls.length, 1)
    assert.deepEqual(await tree(cache), before)
    await absent(path.join(cache, '.incomplete'))
  })
})

test('trust and app-version refusals precede DNS, HTTP and cache creation', async (t) => {
  for (const kind of ['outer', 'inner', 'app-version'] as const) {
    await t.test(kind, async () => {
      await withWork(async (work) => {
        const f = signedFixture()
        const cache = path.join(work, 'entry')
        let dns = 0
        let requests = 0
        const downloader = new ModelDownloader({
          resolveAddresses: async () => {
            dns++
            return ['8.8.8.8']
          },
          transport: async () => {
            requests++
            throw new Error('No network request is authorized by invalid metadata')
          },
        })
        const selected = { ...input(f, cache, downloader) }
        if (kind === 'app-version') {
          selected.appVersion = '2.0.0'
        } else {
          const original = kind === 'outer' ? f.transportEnvelope : f.runtimeEnvelope
          const envelope = JSON.parse(original.toString()) as Record<string, unknown>
          envelope['signature'] = Buffer.alloc(64).toString('base64')
          if (kind === 'outer') {
            selected.transportEnvelope = Buffer.from(JSON.stringify(envelope))
          } else {
            selected.runtimeEnvelope = Buffer.from(JSON.stringify(envelope))
          }
        }
        await assert.rejects(
          cacheRuntimeTransport(selected),
          kind === 'app-version'
            ? code('RUNTIME_RELEASE_INVALID_MANIFEST')
            : code('RUNTIME_RELEASE_UNTRUSTED'),
        )
        assert.equal(dns, 0)
        assert.equal(requests, 0)
        await absent(cache)
      })
    })
  }
})

test('invalid source selection refuses before DNS, HTTP or owned output', async (t) => {
  const sources = [
    { redirectOrigins: [], url: 'file:///runtime.zip' },
    { redirectOrigins: [], url: 'http://example.org/runtime.zip' },
    { redirectOrigins: [], url: 'https://user:secret@example.org/runtime.zip' },
    { redirectOrigins: [], url: 'https://127.0.0.1/runtime.zip' },
    { redirectOrigins: ['https://cdn.example.org/path'], url: SOURCE.url },
    { redirectOrigins: ['https://cdn.example.org', 'https://cdn.example.org/'], url: SOURCE.url },
  ]
  for (const [index, source] of sources.entries()) {
    await t.test(String(index), async () => {
      await withWork(async (work) => {
        const f = signedFixture()
        const cache = path.join(work, 'entry')
        let dns = 0
        let requests = 0
        const downloader = new ModelDownloader({
          resolveAddresses: async () => {
            dns++
            return ['8.8.8.8']
          },
          transport: async () => {
            requests++
            throw new Error('Invalid source reached HTTP')
          },
        })
        await assert.rejects(
          cacheRuntimeTransport({ ...input(f, cache, downloader), source }),
          code('DOWNLOAD_INVALID_URL', 'DOWNLOAD_INVALID_SOURCE', 'DOWNLOAD_UNSAFE_DESTINATION'),
        )
        assert.equal(dns, 0)
        assert.equal(requests, 0)
        await absent(cache)
      })
    })
  }
})

test('a lying downloader receipt cannot bless same-length wrong archive bytes or retry its incomplete entry', async () => {
  await withWork(async (work) => {
    const f = signedFixture()
    const cache = path.join(work, 'entry')
    const drifted = Buffer.from(f.archive)
    drifted[0] ^= 1
    const fake = downloading(f, async (request) => ({
      ...(await stage(request, drifted)),
      sha256: request.expectedSha256,
      sizeBytes: request.expectedBytes,
    }))
    await assert.rejects(
      cacheRuntimeTransport(input(f, cache, fake.downloader)),
      code('RUNTIME_TRANSPORT_CHANGED'),
    )
    assert.equal(fake.calls.length, 1)
    assert.ok((await lstat(path.join(cache, '.incomplete'))).isFile())
    const before = await tree(cache)
    await assert.rejects(cacheRuntimeTransport(input(f, cache, fake.downloader)), refused)
    assert.equal(fake.calls.length, 1)
    assert.deepEqual(await tree(cache), before)
  })
})

test('complete cache drift is rehashed and preserved without another download or implicit repair', async (t) => {
  for (const name of ['runtime-payload.zip', 'runtime-release.json', 'runtime-transport.json']) {
    await t.test(name, async () => {
      await withWork(async (work) => {
        const f = signedFixture()
        const fake = downloading(f)
        const cache = path.join(work, 'entry')
        const valid = await cacheRuntimeTransport(input(f, cache, fake.downloader))
        const filename = path.join(valid.directory, name)
        const original = await readFile(filename)
        const changed = Buffer.from(original)
        changed[Math.floor(changed.length / 2)] ^= 1
        await writeFile(filename, changed)
        assert.equal((await lstat(filename)).size, original.length)
        const before = await tree(cache)
        await assert.rejects(cacheRuntimeTransport(input(f, cache, fake.downloader)), refused)
        assert.equal(fake.calls.length, 1)
        assert.deepEqual(await tree(cache), before)
        await writeFile(filename, original)
        const restored = await cacheRuntimeTransport(input(f, cache, fake.downloader))
        await restored.verifyCompleteTransportSnapshot()
        assert.equal(fake.calls.length, 1)
      })
    })
  }
})

test('a valid alternate selected envelope cannot silently borrow or replace a completed cache', async (t) => {
  for (const kind of ['outer-encoding', 'other-release'] as const) {
    await t.test(kind, async () => {
      await withWork(async (work) => {
        const f = signedFixture()
        const fake = downloading(f)
        const cache = path.join(work, 'entry')
        await cacheRuntimeTransport(input(f, cache, fake.downloader))
        const selected = { ...input(f, cache, fake.downloader) }
        if (kind === 'outer-encoding') {
          const parsed = JSON.parse(f.transportEnvelope.toString()) as Record<string, unknown>
          selected.transportEnvelope = Buffer.from(JSON.stringify(parsed, null, 2))
          assert.notDeepEqual(selected.transportEnvelope, f.transportEnvelope)
        } else {
          const runtime = { ...f.runtime, releaseId: 'other-cache-release' }
          selected.runtimeEnvelope = seal(runtime, f.signing)
          selected.transportEnvelope = seal(
            {
              ...f.transport,
              releaseId: runtime.releaseId,
              runtimeEnvelopeSha256: digest(selected.runtimeEnvelope),
              runtimeManifestSha256: digest(canonicalRuntimeReleaseJson(runtime)),
            },
            f.signing,
          )
        }
        verifyRuntimeTransportMetadata(selected)
        const before = await tree(cache)
        await assert.rejects(cacheRuntimeTransport(selected), code('RUNTIME_TRANSPORT_STORAGE'))
        assert.equal(fake.calls.length, 1)
        assert.deepEqual(await tree(cache), before)
        await (
          await cacheRuntimeTransport(input(f, cache, fake.downloader))
        ).verifyCompleteTransportSnapshot()
        assert.equal(fake.calls.length, 1)
      })
    })
  }
})

test('the selected buffers, keyring and source policy are captured before awaiting entry ownership', async () => {
  await withWork(async (work) => {
    const f = signedFixture()
    const fake = downloading(f)
    const cache = path.join(work, 'entry')
    const runtimeEnvelope = Buffer.from(f.runtimeEnvelope)
    const transportEnvelope = Buffer.from(f.transportEnvelope)
    const trustedKeys = { ...f.signing.trustedKeys }
    const source = { redirectOrigins: [...SOURCE.redirectOrigins], url: SOURCE.url }
    const selected = {
      ...input(f, cache, fake.downloader),
      runtimeEnvelope,
      source,
      transportEnvelope,
      trustedKeys,
    }
    const pending = cacheRuntimeTransport(selected)
    runtimeEnvelope.fill(0)
    transportEnvelope.fill(0)
    trustedKeys[KEY_ID] = 'not a public key'
    source.url = 'file:///unselected'
    source.redirectOrigins.push('http://unselected')
    const result = await pending
    assert.equal(fake.calls.length, 1)
    assert.equal(fake.calls[0].url, SOURCE.url)
    assert.deepEqual(fake.calls[0].redirectOrigins, SOURCE.redirectOrigins)
    assert.deepEqual(
      await readFile(path.join(result.directory, 'runtime-release.json')),
      f.runtimeEnvelope,
    )
    assert.deepEqual(
      await readFile(path.join(result.directory, 'runtime-transport.json')),
      f.transportEnvelope,
    )
    await verifyRuntimeTransport({
      appVersion: APP_VERSION,
      directory: result.directory,
      trustedKeys: f.signing.trustedKeys,
    })
  })
})

test('pre-cancellation creates no cache and active cancellation retains an unusable incomplete owner', async () => {
  await withWork(async (work) => {
    const f = signedFixture()
    const pre = new AbortController()
    pre.abort()
    const fake = downloading(f)
    const unopened = path.join(work, 'pre-canceled')
    await assert.rejects(
      cacheRuntimeTransport({ ...input(f, unopened, fake.downloader), signal: pre.signal }),
      canceled,
    )
    assert.equal(fake.calls.length, 0)
    await absent(unopened)
    const active = new AbortController()
    const cache = path.join(work, 'active-canceled')
    const canceling = downloading(f, async (request) => {
      const staged = await stage(request, f.archive.subarray(0, 4))
      active.abort()
      await unlink(staged.stagingPath) // The downloader owns its partial-file cancellation cleanup.
      throw new ModelDownloadError('DOWNLOAD_CANCELED', 'Controlled active download cancellation')
    })
    await assert.rejects(
      cacheRuntimeTransport({ ...input(f, cache, canceling.downloader), signal: active.signal }),
      canceled,
    )
    assert.ok((await lstat(path.join(cache, '.incomplete'))).isFile())
    const before = await tree(cache)
    await assert.rejects(cacheRuntimeTransport(input(f, cache, canceling.downloader)), refused)
    assert.equal(canceling.calls.length, 1)
    assert.deepEqual(await tree(cache), before)
  })
})

test(
  'two first requests serialize one download and the waiter independently verifies the completed hit',
  { timeout: 10_000 },
  async () => {
    await withWork(async (work) => {
      const f = signedFixture()
      const cache = path.join(work, 'entry')
      const started = deferred()
      const release = deferred()
      const fake = downloading(f, async (request) => {
        started.resolve()
        await release.promise
        return await stage(request, f.archive)
      })
      const first = cacheRuntimeTransport(input(f, cache, fake.downloader))
      await started.promise
      const second = cacheRuntimeTransport(input(f, cache, fake.downloader))
      release.resolve()
      const [a, b] = await Promise.all([first, second])
      assert.equal(fake.calls.length, 1)
      assert.equal(a.directory, b.directory)
      await a.verifyCompleteTransportSnapshot()
      await b.verifyCompleteTransportSnapshot()
    })
  },
)

test(
  'queued B cancels promptly while A owns the entry and C cannot overtake A through B',
  { timeout: 10_000 },
  async () => {
    await withWork(async (work) => {
      const f = signedFixture()
      const cache = path.join(work, 'entry')
      const started = deferred()
      const release = deferred()
      const fake = downloading(f, async (request) => {
        started.resolve()
        await release.promise
        return await stage(request, f.archive)
      })
      const a = cacheRuntimeTransport(input(f, cache, fake.downloader))
      let c: Promise<Awaited<ReturnType<typeof cacheRuntimeTransport>>> | undefined
      try {
        await started.promise
        const controller = new AbortController()
        const b = cacheRuntimeTransport({
          ...input(f, cache, fake.downloader),
          signal: controller.signal,
        })
        const bRefusal = assert.rejects(b, canceled)
        controller.abort()
        await within(bRefusal, 1000)
        assert.equal(fake.calls.length, 1)
        let state = 'pending'
        c = cacheRuntimeTransport(input(f, cache, fake.downloader))
        c.then(
          () => {
            state = 'fulfilled'
          },
          () => {
            state = 'rejected'
          },
        )
        // Keep A physically held through ordinary event-loop/FS work; a released B gate must not
        // let C inspect incomplete A state, start another fetch, or return before A completes.
        await delay(50)
        assert.equal(state, 'pending')
        assert.equal(fake.calls.length, 1)
        release.resolve()
        const [first, last] = await Promise.all([a, c])
        assert.equal(first.directory, last.directory)
        assert.equal(fake.calls.length, 1)
        await first.verifyCompleteTransportSnapshot()
        await last.verifyCompleteTransportSnapshot()
      } finally {
        release.resolve()
        await Promise.allSettled(c ? [a, c] : [a])
      }
    })
  },
)

test('existing incomplete, foreign and symlink entries are preserved without download or recursive recovery', async (t) => {
  for (const kind of [
    'empty',
    'marker',
    'foreign-file',
    'root-link',
    'parent-link',
    'transport-link',
  ] as const) {
    await t.test(kind, async () => {
      await withWork(async (work) => {
        const f = signedFixture()
        const fake = downloading(f)
        const foreign = path.join(work, 'foreign')
        await mkdir(foreign)
        await writeFile(path.join(foreign, 'sentinel.txt'), 'foreign bytes must remain exact')
        let cache = path.join(work, 'entry')
        if (kind === 'root-link') {
          await symlink(foreign, cache)
        } else if (kind === 'parent-link') {
          await symlink(foreign, path.join(work, 'alias'))
          cache = path.join(work, 'alias', 'entry')
        } else {
          await mkdir(cache, { mode: 0o700 })
          if (kind === 'marker') {
            await writeFile(path.join(cache, '.incomplete'), 'original incomplete owner')
          }
          if (kind === 'foreign-file') {
            await writeFile(path.join(cache, 'sentinel.txt'), 'unrecognized cache data')
          }
          if (kind === 'transport-link') {
            await symlink(foreign, path.join(cache, 'transport'))
          }
        }
        const foreignBefore = await tree(foreign)
        const before =
          kind === 'parent-link' ? await tree(path.join(work, 'alias')) : await tree(cache)
        await assert.rejects(cacheRuntimeTransport(input(f, cache, fake.downloader)), refused)
        assert.equal(fake.calls.length, 0)
        assert.deepEqual(await tree(foreign), foreignBefore)
        assert.deepEqual(
          await tree(kind === 'parent-link' ? path.join(work, 'alias') : cache),
          before,
        )
      })
    })
  }
})

test('downloader-returned paths must be owned UUID partials and cannot borrow or follow foreign files', async (t) => {
  for (const kind of ['outside', 'wrong-basename', 'symlink'] as const) {
    await t.test(kind, async () => {
      await withWork(async (work) => {
        const f = signedFixture()
        const foreign = path.join(work, `${randomUUID()}.part`)
        await writeFile(foreign, f.archive, { flag: 'wx', mode: 0o600 })
        const foreignBefore = await tree(foreign)
        const cache = path.join(work, 'entry')
        const fake = downloading(f, async (request) => {
          let stagingPath = foreign
          if (kind === 'wrong-basename') {
            stagingPath = path.join(request.stagingDirectory, 'not-a-uuid.part')
            await writeFile(stagingPath, f.archive, { flag: 'wx', mode: 0o600 })
          } else if (kind === 'symlink') {
            stagingPath = path.join(request.stagingDirectory, `${randomUUID()}.part`)
            await symlink(foreign, stagingPath)
          }
          return { sha256: digest(f.archive), sizeBytes: f.archive.length, stagingPath }
        })
        await assert.rejects(
          cacheRuntimeTransport(input(f, cache, fake.downloader)),
          code('RUNTIME_TRANSPORT_STORAGE'),
        )
        assert.equal(fake.calls.length, 1)
        assert.deepEqual(await tree(foreign), foreignBefore)
        assert.ok((await lstat(path.join(cache, '.incomplete'))).isFile())
      })
    })
  }
})

test('cache-container and transport-child substitution preserve foreign data and close the held owner', async (t) => {
  for (const kind of ['container', 'transport-child'] as const) {
    await t.test(kind, async () => {
      await withWork(async (work) => {
        const f = signedFixture()
        const cache = path.join(work, 'entry')
        const foreign = path.join(work, 'foreign')
        await mkdir(foreign)
        await writeFile(path.join(foreign, 'sentinel.txt'), 'foreign bytes remain untouched')
        const foreignBefore = await tree(foreign)
        const moved = path.join(work, 'held-original')
        let partialName = ''
        const fake = downloading(f, async (request) => {
          const staged = await stage(request, f.archive)
          partialName = path.basename(staged.stagingPath)
          if (kind === 'container') {
            await rename(cache, moved)
            await symlink(foreign, cache)
          } else {
            await rename(path.join(cache, 'transport'), path.join(cache, 'held-transport'))
            await symlink(foreign, path.join(cache, 'transport'))
          }
          return staged
        })
        await assert.rejects(
          cacheRuntimeTransport(input(f, cache, fake.downloader)),
          code('RUNTIME_TRANSPORT_STORAGE'),
        )
        assert.equal(fake.calls.length, 1)
        assert.deepEqual(await tree(foreign), foreignBefore)
        const heldRoot = kind === 'container' ? moved : cache
        assert.ok((await lstat(path.join(heldRoot, '.incomplete'))).isFile())
        assert.deepEqual(await readFile(path.join(heldRoot, partialName)), f.archive)
        const heldBefore = await tree(heldRoot)
        await assert.rejects(cacheRuntimeTransport(input(f, cache, fake.downloader)), refused)
        assert.equal(fake.calls.length, 1)
        assert.deepEqual(await tree(heldRoot), heldBefore)
        assert.deepEqual(await tree(foreign), foreignBefore)
        await assertNoOwnedDescriptors(work)
      })
    })
  }
})
