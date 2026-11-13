import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import {
  chmod,
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import {
  canonicalRuntimeReleaseJson,
  PINNED_RUNTIME_CONFIG_FILES,
  RuntimeReleaseError,
  type RuntimeReleaseFile,
  type RuntimeReleaseManifest,
  runtimeReleaseRequirements,
  type RuntimeReleaseSelection,
  verifyRuntimeRelease,
} from './runtime-release.js'

const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const configFixture = process.env.IGS_RUNTIME_RELEASE_CONFIG_FIXTURE
const actualConfig = { skip: !configFixture }
const failure = (code: string, text?: RegExp) => (error: unknown) => {
  assert.ok(error instanceof RuntimeReleaseError)
  assert.equal(error.code, code)
  if (text) {
    assert.match(error.message, text)
  }
  return true
}
const invalid = failure('RUNTIME_RELEASE_INVALID_MANIFEST')
const untrusted = failure('RUNTIME_RELEASE_UNTRUSTED')

function keyring() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const trustedKeys = { 'test-key': publicKey.export({ format: 'pem', type: 'spki' }).toString() }
  return { privateKey, trustedKeys }
}

function descriptor(name: string, bytes: Buffer, executable = false) {
  return {
    executable,
    kind: 'file' as const,
    path: name,
    sha256: digest(bytes),
    sizeBytes: bytes.length,
  }
}

/** Tiny executable/wheel bytes qualify inventory only, never Python, uv or a real installed wheel. */
function manifestFixture(): RuntimeReleaseManifest {
  const wheel = descriptor(
    'wheels/imagegen_worker-0.1.0-py3-none-any.whl',
    Buffer.from('declared wheel identity fixture'),
  )
  const manifest: RuntimeReleaseManifest = {
    appVersion: '1.0.0',
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
    releaseId: 'owned-release-fixture',
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
    ...manifest,
    files: [
      descriptor('python/bin/python3.12', Buffer.from('owned Python identity fixture'), true),
      descriptor('uv/uv', Buffer.from('owned uv identity fixture'), true),
      wheel,
      descriptor('requirements.txt', Buffer.from(runtimeReleaseRequirements(manifest))),
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

function envelope(
  manifest: unknown,
  keys: ReturnType<typeof keyring>,
  payload = canonicalRuntimeReleaseJson(manifest),
): Buffer {
  return Buffer.from(
    JSON.stringify({
      keyId: 'test-key',
      payload: payload.toString('base64'),
      schemaVersion: 1,
      signature: sign(null, payload, keys.privateKey).toString('base64'),
    }),
  )
}

function selection(manifest = manifestFixture(), keys = keyring()): RuntimeReleaseSelection {
  return {
    appVersion: '1.0.0',
    directory: path.join(os.tmpdir(), 'release-must-not-be-opened-before-trust'),
    envelope: envelope(manifest, keys),
    trustedKeys: keys.trustedKeys,
  }
}

test('canonical signing bytes sort every object and refuse non-JSON, sparse and lossy values', () => {
  assert.equal(
    canonicalRuntimeReleaseJson({ a: 'é', z: [{ a: 1, b: 2 }] }).toString(),
    '{"a":"é","z":[{"a":1,"b":2}]}',
  )
  const sparse = Array.from({ length: 2 })
  Reflect.set(sparse, '0', 1)
  Reflect.set(sparse, 'x', 2)
  const cyclic: Record<string, unknown> = {}
  cyclic['same'] = cyclic
  for (const value of [
    undefined,
    NaN,
    Infinity,
    0.5,
    BigInt(1),
    { a: undefined },
    sparse,
    cyclic,
    new Map(),
  ]) {
    assert.throws(() => canonicalRuntimeReleaseJson(value), invalid)
  }
})

test('trusted key and valid signature are required before any payload directory is opened', async () => {
  const good = selection()
  await assert.rejects(verifyRuntimeRelease({ ...good, trustedKeys: {} }), untrusted)
  await assert.rejects(
    verifyRuntimeRelease({ ...good, trustedKeys: keyring().trustedKeys }),
    untrusted,
  )
  const raw = JSON.parse(good.envelope.toString())
  raw.signature = Buffer.alloc(64).toString('base64')
  await assert.rejects(
    verifyRuntimeRelease({ ...good, envelope: Buffer.from(JSON.stringify(raw)) }),
    untrusted,
  )
  raw.signature = 'not-base64'
  await assert.rejects(
    verifyRuntimeRelease({ ...good, envelope: Buffer.from(JSON.stringify(raw)) }),
    invalid,
  )
  await assert.rejects(
    verifyRuntimeRelease({ ...good, envelope: Buffer.alloc(1024 * 1024 + 1) }),
    invalid,
  )
})

test('signed noncanonical and duplicate-key payloads cannot be normalized into trusted metadata', async () => {
  const keys = keyring()
  const manifest = manifestFixture()
  const chosen = selection(manifest, keys)
  const indented = Buffer.from(JSON.stringify(manifest, null, 2))
  await assert.rejects(
    verifyRuntimeRelease({ ...chosen, envelope: envelope(manifest, keys, indented) }),
    invalid,
  )
  const duplicate = Buffer.from(
    canonicalRuntimeReleaseJson(manifest)
      .toString()
      .replace('"schemaVersion":1', '"schemaVersion":1,"schemaVersion":1'),
  )
  await assert.rejects(
    verifyRuntimeRelease({ ...chosen, envelope: envelope(manifest, keys, duplicate) }),
    invalid,
  )
  const unknown = JSON.parse(chosen.envelope.toString())
  unknown.payloadUrl = 'https://example.invalid'
  await assert.rejects(
    verifyRuntimeRelease({ ...chosen, envelope: Buffer.from(JSON.stringify(unknown)) }),
    invalid,
  )
})

test('application, worker, Python, exact config and wheel membership fail closed before filesystem use', async (t) => {
  const changes: [string, (manifest: RuntimeReleaseManifest) => void][] = [
    ['app mismatch', (m) => Reflect.set(m, 'appVersion', '2.0.0')],
    ['unknown metadata', (m) => Reflect.set(m, 'downloadUrl', 'https://example.invalid')],
    ['Python patch mismatch', (m) => Reflect.set(m.python, 'version', '3.12.14')],
    ['old inference', (m) => Reflect.set(m.worker, 'inferenceVersion', '0.12.0')],
    ['wrong CPU', (m) => Reflect.set(m.worker, 'cpuVersion', '0.14.0')],
    [
      'missing config',
      (m) =>
        Reflect.set(
          m,
          'files',
          m.files.filter((entry) => entry.path !== 'config/model_index.json'),
        ),
    ],
    [
      'unqualified config',
      (m) =>
        Reflect.set(
          m.files.find((entry) => entry.path === 'config/model_index.json')!,
          'sha256',
          'b'.repeat(64),
        ),
    ],
    ['source archive', (m) => Reflect.set(m.wheels[0], 'path', 'wheels/worker.tar.gz')],
    [
      'duplicate normalized distribution',
      (m) =>
        Reflect.set(m, 'wheels', [
          ...m.wheels,
          { ...m.wheels[0], distribution: 'ImageGen_Worker' },
        ]),
    ],
    ['wheel/file mismatch', (m) => Reflect.set(m.wheels[0], 'sha256', 'b'.repeat(64))],
    [
      'unknown wheelhouse file',
      (m) =>
        Reflect.set(m, 'files', [
          ...m.files,
          descriptor('wheels/unlisted.whl', Buffer.from('extra')),
        ]),
    ],
    [
      'external symlink',
      (m) =>
        Reflect.set(m, 'files', [
          ...m.files,
          { kind: 'symlink', path: 'python/bin/escape', target: '../../../outside' },
        ]),
    ],
    [
      'symlink elsewhere',
      (m) =>
        Reflect.set(m, 'files', [...m.files, { kind: 'symlink', path: 'uv/alias', target: 'uv' }]),
    ],
    [
      'dangling link',
      (m) =>
        Reflect.set(m, 'files', [
          ...m.files,
          { kind: 'symlink', path: 'python/bin/alias', target: 'missing' },
        ]),
    ],
    [
      'symlink cycle',
      (m) =>
        Reflect.set(m, 'files', [
          ...m.files,
          { kind: 'symlink', path: 'python/bin/a', target: 'b' },
          { kind: 'symlink', path: 'python/bin/b', target: 'a' },
        ]),
    ],
    ['traversal', (m) => Reflect.set(m.files[0], 'path', '../escape')],
    ['absolute path', (m) => Reflect.set(m.files[0], 'path', '/absolute')],
    [
      'file ancestor',
      (m) => Reflect.set(m, 'files', [...m.files, descriptor('uv/uv/child', Buffer.from('bad'))]),
    ],
    [
      'oversized file',
      (m) => {
        Reflect.set(m.files[0], 'sizeBytes', 32 * 1024 ** 3 + 1)
        Reflect.set(m, 'requiredFreeBytes', Number.MAX_SAFE_INTEGER)
      },
    ],
    [
      'oversized total',
      (m) => {
        Reflect.set(m, 'files', [
          ...m.files,
          { ...descriptor('python/large-a', Buffer.from('a')), sizeBytes: 32 * 1024 ** 3 },
          { ...descriptor('python/large-b', Buffer.from('b')), sizeBytes: 32 * 1024 ** 3 },
        ])
        Reflect.set(m, 'requiredFreeBytes', Number.MAX_SAFE_INTEGER)
      },
    ],
    ['understated space', (m) => Reflect.set(m, 'requiredFreeBytes', 1)],
  ]
  for (const [name, mutate] of changes) {
    await t.test(name, async () => {
      const manifest = manifestFixture()
      mutate(manifest)
      await assert.rejects(verifyRuntimeRelease(selection(manifest)), invalid)
    })
  }
})

test('release config pins match the authoritative current Python worker source', async () => {
  const source = await readFile(
    path.resolve('worker-python/src/imagegen_worker/inference_config.py'),
    'utf8',
  )
  const start = source.indexOf('PINNED_SDXL_FILES:')
  const body = source.slice(start, source.indexOf('\n}', start) + 2)
  const pairs = [...body.matchAll(/"([^"\n]+)":\s*(?:\(\s*)?"([a-f0-9]{64})"/g)].map((match) => [
    match[1],
    match[2],
  ])
  assert.equal(pairs.length, 17)
  assert.deepEqual(Object.fromEntries(pairs), PINNED_RUNTIME_CONFIG_FILES)
})

test('requirements are exact deterministic wheel hashes without URL/index/editable resolution', () => {
  const manifest = manifestFixture()
  assert.equal(
    runtimeReleaseRequirements(manifest),
    `imagegen-worker==0.1.0 --hash=sha256:${manifest.wheels[0].sha256}\n`,
  )
})

async function withPayload(
  use: (fixture: {
    directory: string
    keys: ReturnType<typeof keyring>
    manifest: RuntimeReleaseManifest
    selection: RuntimeReleaseSelection
    work: string
  }) => Promise<void>,
) {
  assert.ok(
    configFixture,
    'Set IGS_RUNTIME_RELEASE_CONFIG_FIXTURE to the actual pinned17-file snapshot for filesystem acceptance tests.',
  )
  const work = await mkdtemp(path.join(os.tmpdir(), 'igs-runtime-release-'))
  const directory = path.join(work, 'payload')
  const original = manifestFixture()
  const files = []
  try {
    for (const entry of original.files) {
      assert.equal(entry.kind, 'file')
      if (entry.kind !== 'file') {
        throw new Error('Literal fixture requires regular files')
      }
      const destination = path.join(directory, entry.path)
      await mkdir(path.dirname(destination), { mode: 0o700, recursive: true })
      let bytes: Buffer
      if (entry.path.startsWith('config/')) {
        bytes = await readFile(path.join(configFixture, entry.path.slice(7)))
        assert.equal(
          digest(bytes),
          entry.sha256,
          `External fixture must have exact pinned bytes: ${entry.path}`,
        )
      } else {
        switch (entry.path) {
          case 'python/bin/python3.12': {
            bytes = Buffer.from('owned Python identity fixture')
            break
          }
          case 'requirements.txt': {
            bytes = Buffer.from(runtimeReleaseRequirements(original))
            break
          }
          case 'uv/uv': {
            bytes = Buffer.from('owned uv identity fixture')
            break
          }
          default: {
            bytes = Buffer.from('declared wheel identity fixture')
          }
        }
      }
      await writeFile(destination, bytes, { flag: 'wx', mode: entry.executable ? 0o700 : 0o600 })
      files.push({ ...entry, sizeBytes: bytes.length })
    }
    const keys = keyring()
    const manifest = { ...original, files }
    await use({
      directory,
      keys,
      manifest,
      selection: { ...selection(manifest, keys), directory },
      work,
    })
  } finally {
    await rm(work, { force: true, recursive: true })
  }
}

test(
  'actual complete signed payload is verified and deeply detached before return',
  actualConfig,
  async () => {
    await withPayload(async (f) => {
      const release = await verifyRuntimeRelease(f.selection)
      assert.equal(release.directory, f.directory)
      assert.deepEqual(release.manifest, f.manifest)
      assert.ok(
        Object.isFrozen(release) &&
          Object.isFrozen(release.manifest) &&
          Object.isFrozen(release.manifest.files) &&
          Object.isFrozen(release.manifest.files[0]) &&
          Object.isFrozen(release.manifest.host.gpuArchitectures),
      )
      Reflect.set(f.manifest.python, 'buildId', 'changed-caller-object')
      assert.notEqual(release.manifest.python.buildId, f.manifest.python.buildId)
      await release.verifyCompletePayloadSnapshot()
    })
  },
)

test(
  'a complete real payload still refuses an invalid Ed25519 signature',
  actualConfig,
  async () => {
    await withPayload(async (f) => {
      const envelope = JSON.parse(f.selection.envelope.toString('utf8'))
      envelope.signature = Buffer.alloc(64).toString('base64')
      await assert.rejects(
        verifyRuntimeRelease({
          ...f.selection,
          envelope: Buffer.from(JSON.stringify(envelope)),
        }),
        untrusted,
      )
    })
  },
)

test(
  'Linux Python inventory preserves case-distinct terminfo names but rejects exact duplicate paths',
  actualConfig,
  async () => {
    await withPayload(async (f) => {
      const entries: RuntimeReleaseFile[] = []
      for (const name of ['2621A', '2621a']) {
        const filename = `python/share/terminfo/2/${name}`
        const bytes = Buffer.from(`Distinct Linux terminfo ${name}`)
        await mkdir(path.dirname(path.join(f.directory, filename)), { recursive: true })
        await writeFile(path.join(f.directory, filename), bytes, { flag: 'wx', mode: 0o600 })
        entries.push(descriptor(filename, bytes))
      }
      const manifest = { ...f.manifest, files: [...f.manifest.files, ...entries] }
      const chosen = { ...selection(manifest, f.keys), directory: f.directory }
      const verified = await verifyRuntimeRelease(chosen)
      await verified.verifyCompletePayloadSnapshot()
      await assert.rejects(
        verifyRuntimeRelease({
          ...chosen,
          envelope: envelope({ ...manifest, files: [...manifest.files, entries[0]] }, f.keys),
        }),
        invalid,
      )
    })
  },
)

test(
  'caller mutation after invocation cannot replace directory, envelope or trusted key snapshot',
  actualConfig,
  async () => {
    await withPayload(async (f) => {
      const pending = verifyRuntimeRelease(f.selection)
      f.selection.envelope.fill(0)
      Reflect.set(f.selection, 'directory', path.join(f.work, 'different'))
      Reflect.set(f.selection, 'appVersion', 'different')
      Reflect.set(f.selection.trustedKeys, 'test-key', 'bad')
      const release = await pending
      assert.equal(release.directory, f.directory)
      await release.verifyCompletePayloadSnapshot()
    })
  },
)

test(
  'missing, extra and unlisted empty directories are refused rather than treated as a complete payload',
  actualConfig,
  async (t) => {
    for (const kind of ['missing', 'extra', 'directory'] as const) {
      await t.test(kind, async () =>
        withPayload(async (f) => {
          if (kind === 'missing') {
            await rm(path.join(f.directory, 'uv/uv'))
          } else if (kind === 'extra') {
            await writeFile(path.join(f.directory, 'unexpected.txt'), 'extra')
          } else {
            await mkdir(path.join(f.directory, 'empty-unlisted-directory'))
          }
          await assert.rejects(
            verifyRuntimeRelease(f.selection),
            failure('RUNTIME_RELEASE_INVALID_STORAGE'),
          )
        }),
      )
    }
  },
)

test(
  'declared executable bit and actual file hash are checked with real files',
  actualConfig,
  async (t) => {
    for (const kind of ['permission', 'bytes'] as const) {
      await t.test(kind, async () =>
        withPayload(async (f) => {
          const executable = path.join(f.directory, 'python/bin/python3.12')
          if (kind === 'permission') {
            await chmod(executable, 0o600)
          } else {
            const bytes = await readFile(executable)
            bytes[0] ^= 1
            await writeFile(executable, bytes)
          }
          await assert.rejects(
            verifyRuntimeRelease(f.selection),
            failure('RUNTIME_RELEASE_PAYLOAD_CHANGED', /python\/bin\/python3\.12/),
          )
        }),
      )
    }
  },
)

test(
  'signed requirements cannot enable editable, URL, index or source-distribution installation',
  actualConfig,
  async (t) => {
    for (const directive of [
      '-e file:///source\n',
      '--index-url https://example.invalid\n',
      'package @ https://example.invalid/a.whl\n',
      'package==1.0\n',
    ]) {
      await t.test(directive.trim(), async () =>
        withPayload(async (f) => {
          const bytes = Buffer.from(directive)
          await writeFile(path.join(f.directory, 'requirements.txt'), bytes)
          const manifest = {
            ...f.manifest,
            files: f.manifest.files.map((entry) =>
              entry.path === 'requirements.txt' ? descriptor(entry.path, bytes) : entry,
            ),
          }
          await assert.rejects(
            verifyRuntimeRelease({ ...f.selection, envelope: envelope(manifest, f.keys) }),
            invalid,
          )
        }),
      )
    }
  },
)

test(
  'only declared internal relative Python symlinks are accepted and retargeting invalidates the snapshot',
  actualConfig,
  async () => {
    await withPayload(async (f) => {
      const clone = descriptor(
        'python/bin/clone',
        Buffer.from('owned Python identity fixture'),
        true,
      )
      await copyFile(
        path.join(f.directory, 'python/bin/python3.12'),
        path.join(f.directory, clone.path),
      )
      await symlink('python3.12', path.join(f.directory, 'python/bin/python3'))
      const manifest: RuntimeReleaseManifest = {
        ...f.manifest,
        files: [
          ...f.manifest.files,
          clone,
          { kind: 'symlink', path: 'python/bin/python3', target: 'python3.12' },
        ],
      }
      const release = await verifyRuntimeRelease({
        ...f.selection,
        envelope: envelope(manifest, f.keys),
      })
      await release.verifyCompletePayloadSnapshot()
      await rm(path.join(f.directory, 'python/bin/python3'))
      await symlink('clone', path.join(f.directory, 'python/bin/python3'))
      await assert.rejects(
        release.verifyCompletePayloadSnapshot(),
        failure('RUNTIME_RELEASE_PAYLOAD_CHANGED'),
      )
    })
  },
)

test(
  'real Python payload inventories can include exact empty package marker files',
  actualConfig,
  async () => {
    await withPayload(async (f) => {
      const marker = descriptor('python/lib/package/__init__.py', Buffer.alloc(0))
      await mkdir(path.join(f.directory, 'python/lib/package'), { recursive: true })
      await writeFile(path.join(f.directory, marker.path), Buffer.alloc(0), {
        flag: 'wx',
        mode: 0o600,
      })
      const manifest = { ...f.manifest, files: [...f.manifest.files, marker] }
      const release = await verifyRuntimeRelease({
        ...f.selection,
        envelope: envelope(manifest, f.keys),
      })
      await release.verifyCompletePayloadSnapshot()
    })
  },
)

test(
  'substituting an actual symlink for a declared file never reads or changes its external target',
  actualConfig,
  async () => {
    await withPayload(async (f) => {
      const bytes = Buffer.from('owned outside control')
      const outside = path.join(f.work, 'outside.txt')
      await writeFile(outside, bytes)
      await rm(path.join(f.directory, 'python/bin/python3.12'))
      await symlink(outside, path.join(f.directory, 'python/bin/python3.12'))
      await assert.rejects(
        verifyRuntimeRelease(f.selection),
        failure('RUNTIME_RELEASE_INVALID_STORAGE'),
      )
      assert.ok((await readFile(outside)).equals(bytes))
    })
  },
)

test(
  'complete revalidation refuses later changes and even equal-byte inode replacements',
  actualConfig,
  async (t) => {
    for (const kind of ['changed', 'equal-bytes', 'root-replaced'] as const) {
      await t.test(kind, async () =>
        withPayload(async (f) => {
          const release = await verifyRuntimeRelease(f.selection)
          if (kind === 'root-replaced') {
            const original = path.join(f.work, 'original')
            await rename(f.directory, original)
            await cp(original, f.directory, { recursive: true })
          } else {
            const destination = path.join(f.directory, 'uv/uv')
            const bytes = await readFile(destination)
            await rm(destination)
            await writeFile(destination, kind === 'changed' ? Buffer.from('different') : bytes, {
              mode: 0o700,
            })
          }
          await assert.rejects(
            release.verifyCompletePayloadSnapshot(),
            failure('RUNTIME_RELEASE_PAYLOAD_CHANGED'),
          )
        }),
      )
    }
  },
)
