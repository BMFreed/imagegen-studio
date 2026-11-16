/**
 * Real owned filesystem staging tests with actual canonical Ed25519 declarations. The artifact
 * revalidation callback is a controlled capability/revocation port; native provider/download
 * authenticity is qualified separately. Synthetic ELF/AppImage marker fixtures are never executed
 * or shipped. An executable permission bit on the old fixture only satisfies current-file
 * admission.
 *
 * Fresh source: InvokeAI4875d965 install_staging_ledger.py claim/marker/transfer and
 * model_install_default.py claimed-install/restore callers, no_replace.py; installation.mdx ->
 * launcher c267bdb4 updater.ts/caller; electron-updater6.6.2 AppImageUpdater.doInstall unlinks
 * before move and has no safe staging owner. The new adapter reuses Studio's
 * runtime-release-transport fd-anchored create-only pattern.
 */
import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test, type TestContext } from 'node:test'

import type { VerifiedApplicationArtifact } from './electron-update-checker.js'

import { canonicalRuntimeReleaseJson } from '../runtime/runtime-release.js'
import { verifyApplicationRelease } from './application-release.js'
import {
  type ApplicationUpdateCurrentSource,
  stageVerifiedApplicationArtifact,
} from './application-update-staging.js'

const sha512 = (bytes: Buffer) => createHash('sha512').update(bytes).digest('base64')
const filename = 'owned-studio-0.2.0-x86_64.AppImage'
const phases = ['preparing', 'prepared', 'failed']

type Fixture = Awaited<ReturnType<typeof fixture>>

type Staged = Awaited<ReturnType<typeof stageVerifiedApplicationArtifact>>

/** Complete64-byte ELF64 little-endian header and AI2 marker, without runnable program segments. */
function imageBytes(marker: number, size = 1024 + 97): Buffer {
  const bytes = Buffer.alloc(size, marker)
  bytes.fill(0, 0, 64)
  Buffer.from([0x7f, 0x45, 0x4c, 0x46]).copy(bytes)
  bytes[4] = 2
  bytes[5] = 1
  bytes[6] = 1
  bytes[8] = 0x41
  bytes[9] = 0x49
  bytes[10] = 2
  bytes.writeUInt16LE(3, 16)
  bytes.writeUInt16LE(62, 18)
  bytes.writeUInt32LE(1, 20)
  bytes.writeUInt16LE(64, 52)
  bytes.writeUInt16LE(56, 54)
  bytes.writeUInt16LE(64, 58)
  return bytes
}

function signedRelease(
  bytes: Buffer,
  descriptor: { filename?: string; sha512?: string; sizeBytes?: number } = {},
) {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const notes = 'Owned staging declaration; no installation or runtime readiness claim.'
  const compatibility = {
    cpuWorkerProtocolVersion: '1',
    databaseMigrations: [{ name: '0001_app_metadata.sql', sha256: 'a'.repeat(64) }],
    inferenceWorkerProtocolVersion: '1',
    projectSchemaVersion: 1,
  }
  const selected = {
    filename: descriptor.filename ?? filename,
    sha512: descriptor.sha512 ?? sha512(bytes),
    sizeBytes: descriptor.sizeBytes ?? bytes.length,
    version: '0.2.0',
  }
  const payload = canonicalRuntimeReleaseJson({
    appId: 'studio.imagegen.desktop',
    artifact: {
      filename: selected.filename,
      sha512: selected.sha512,
      sizeBytes: selected.sizeBytes,
    },
    compatibility: { ...compatibility, runtimeValidation: 'after-restart' },
    releaseId: 'owned-staging-release',
    releaseNotesSha256: createHash('sha256')
      .update(canonicalRuntimeReleaseJson(notes))
      .digest('hex'),
    schemaVersion: 1,
    scope: 'application-release',
    target: { arch: 'x64', format: 'AppImage', os: 'linux' },
    version: selected.version,
  })
  const envelope = canonicalRuntimeReleaseJson({
    keyId: 'owned-staging-key',
    payload: payload.toString('base64'),
    schemaVersion: 1,
    signature: sign(null, payload, privateKey).toString('base64'),
  })
  const manifest = verifyApplicationRelease(
    envelope,
    {
      compatibility,
      trustedKeys: {
        'owned-staging-key': publicKey.export({ format: 'pem', type: 'spki' }).toString(),
      },
    },
    selected,
    notes,
  )
  return {
    authority: Object.freeze({
      envelope: envelope.toString('utf8'),
      releaseNotesJson: canonicalRuntimeReleaseJson(notes).toString('utf8'),
    }),
    manifest,
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
    // Controlled v1 fixture; no native runtime authentication is claimed.
    runtimeFiles: Object.freeze({
      archive: Object.freeze({ sha512: Buffer.alloc(64).toString('base64'), sizeBytes: 1 }),
      executable: Object.freeze({ sha512: Buffer.alloc(64).toString('base64'), sizeBytes: 1 }),
    }),
    verifyCompleteSnapshot: async () => undefined,
  })
}

async function witness(file: string) {
  const bytes = await fs.readFile(file)
  const info = await fs.lstat(file, { bigint: true })
  return {
    ctimeNs: info.ctimeNs,
    identity: `${info.dev}:${info.ino}`,
    mode: Number(info.mode & 0o777n),
    mtimeNs: info.mtimeNs,
    nlink: info.nlink,
    sha512: sha512(bytes),
    sizeBytes: info.size,
    uid: info.uid,
  }
}
async function fixture(
  t: Pick<TestContext, 'after'>,
  options: {
    body?: Buffer
    descriptor?: { filename?: string; sha512?: string; sizeBytes?: number }
  } = {},
) {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'igs-app-update-staging-'))
  const parent = path.join(root, 'applications')
  const cache = path.join(root, 'native-cache')
  await fs.mkdir(parent, { mode: 0o755 })
  await fs.mkdir(cache, { mode: 0o700 })
  const currentAppImage = path.join(parent, 'owned-studio.AppImage')
  const source = path.join(cache, filename)
  const stagingDirectory = path.join(
    parent,
    `.igs-app-update-${createHash('sha256').update(path.basename(currentAppImage)).digest('hex').slice(0, 16)}`,
  )
  t.after(async () => {
    // Only this test's exact owned tree is removed; restore its deliberately changed permissions.
    for (const directory of [parent, stagingDirectory]) {
      const info = await fs.lstat(directory).catch(() => null)
      if (info?.isDirectory() && !info.isSymbolicLink()) {
        await fs.chmod(directory, 0o700)
      }
    }
    await fs.rm(root, { force: true, recursive: true })
  })
  const body = options.body ?? imageBytes(37)
  const oldBytes = imageBytes(11)
  await fs.writeFile(currentAppImage, oldBytes, { mode: 0o755 })
  await fs.writeFile(source, body, { mode: 0o755 })
  // Make the permission contract independent of the invoking test process's umask.
  await fs.chmod(parent, 0o755)
  await fs.chmod(currentAppImage, 0o755)
  await fs.chmod(source, 0o755)
  const state: { calls: number; onVerify?: (call: number) => Promise<void> } = { calls: 0 }
  const artifact: VerifiedApplicationArtifact = Object.freeze({
    ...signedRelease(body, options.descriptor),
    path: source,
    verifyCompleteSnapshot: async () => {
      state.calls += 1
      await state.onVerify?.(state.calls)
    },
  })
  const currentSource = await fixtureCurrentSource(currentAppImage)
  return {
    artifact,
    body,
    currentAppImage,
    currentSource,
    oldBytes,
    parent,
    root,
    source,
    stagingDirectory,
    state,
  }
}

async function inputs(f: Fixture, oldPath = f.currentAppImage) {
  return { old: await witness(oldPath), source: await witness(f.source) }
}

async function journal(directory: string, candidatePath?: string, phase?: string) {
  const candidates: { bytes: Buffer; file: string; value: Record<string, unknown> }[] = []
  const entries = await fs.readdir(directory, { withFileTypes: true })
  assert.ok(entries.length <= 8, 'Finite staging fixture must not accumulate an unbounded tree.')
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue
    }
    const file = path.join(directory, entry.name)
    if (file === candidatePath) {
      continue
    }
    const bytes = await fs.readFile(file)
    let value: unknown
    try {
      value = JSON.parse(bytes.toString('utf8'))
    } catch {
      continue
    }
    if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      Object.values(value).some(
        (item) => typeof item === 'string' && (phase ? item === phase : phases.includes(item)),
      )
    ) {
      candidates.push({ bytes, file, value: value as Record<string, unknown> })
    }
  }
  assert.equal(
    candidates.length,
    1,
    'One selected durable phase record must describe the owned claim.',
  )
  return candidates[0]
}

test('staging creates a fresh private candidate and prepared journal while preserving executable and cache', async (t) => {
  const f = await fixture(t, { body: imageBytes(37, 2 * 1024 * 1024 + 97) })
  const before = await inputs(f)
  const parentMode = (await fs.lstat(f.parent)).mode
  const staged = await stageVerifiedApplicationArtifact({
    artifact: f.artifact,
    currentAppImage: f.currentAppImage,
    currentSource: f.currentSource,
  })
  assert.equal(Object.isFrozen(staged), true)
  assert.equal(Object.isFrozen(staged.manifest), true)
  assert.deepEqual(staged.manifest, f.artifact.manifest)
  assert.equal(staged.stagingDirectory, f.stagingDirectory)
  assert.equal(path.dirname(staged.candidatePath), f.stagingDirectory)
  assert.equal((await fs.lstat(f.stagingDirectory)).mode & 0o777, 0o700)
  const candidate = await witness(staged.candidatePath)
  assert.equal(candidate.mode, 0o600)
  assert.equal(candidate.nlink, 1n)
  assert.equal(candidate.sha512, f.artifact.manifest.artifact.sha512)
  assert.equal(candidate.sizeBytes, BigInt(f.body.length))
  assert.notEqual(candidate.identity, before.old.identity)
  assert.notEqual(candidate.identity, before.source.identity)
  assert.equal((await fs.readFile(staged.candidatePath)).equals(f.body), true)
  assert.deepEqual(await inputs(f), before)
  assert.equal((await fs.lstat(f.parent)).mode, parentMode)
  assert.ok(
    f.state.calls >= 2,
    'The trusted artifact must be revalidated before and after copying.',
  )
  const receipt = await journal(f.stagingDirectory, staged.candidatePath)
  assert.equal(receipt.value['schemaVersion'], 2)
  for (const [member, value] of [
    ['release-envelope.json', f.artifact.authority.envelope],
    ['release-notes.json', f.artifact.authority.releaseNotesJson],
  ] as const) {
    const file = path.join(staged.stagingDirectory, member)
    assert.equal(await fs.readFile(file, 'utf8'), value)
    assert.equal((await witness(file)).mode, 0o600)
    assert.equal((await witness(file)).nlink, 1n)
  }
  assert.equal(Object.values(receipt.value).includes('prepared'), true)
  await staged.verifyCompleteSnapshot()
  assert.deepEqual(await inputs(f), before)
  assert.equal((await fs.readFile(receipt.file)).equals(receipt.bytes), true)
})

test('an unknown existing claim is refused without resuming, cleaning or changing its foreign bytes', async (t) => {
  const f = await fixture(t)
  await fs.mkdir(f.stagingDirectory, { mode: 0o700 })
  const sentinel = path.join(f.stagingDirectory, 'foreign-claim.json')
  await fs.writeFile(sentinel, '{"owner":"someone-else","phase":"prepared"}\n', { mode: 0o600 })
  const before = await inputs(f)
  const foreign = await witness(sentinel)
  await assert.rejects(
    stageVerifiedApplicationArtifact({
      artifact: f.artifact,
      currentAppImage: f.currentAppImage,
      currentSource: f.currentSource,
    }),
  )
  assert.deepEqual(await inputs(f), before)
  assert.deepEqual(await witness(sentinel), foreign)
  assert.deepEqual(await fs.readdir(f.stagingDirectory), ['foreign-claim.json'])
})

test('a second staging request cannot replace even this process previous prepared claim', async (t) => {
  const f = await fixture(t)
  const staged = await stageVerifiedApplicationArtifact({
    artifact: f.artifact,
    currentAppImage: f.currentAppImage,
    currentSource: f.currentSource,
  })
  const receipt = await journal(staged.stagingDirectory, staged.candidatePath)
  const candidate = await witness(staged.candidatePath)
  const receiptWitness = await witness(receipt.file)
  await assert.rejects(
    stageVerifiedApplicationArtifact({
      artifact: f.artifact,
      currentAppImage: f.currentAppImage,
      currentSource: f.currentSource,
    }),
  )
  assert.deepEqual(await witness(staged.candidatePath), candidate)
  assert.deepEqual(await witness(receipt.file), receiptWitness)
  await staged.verifyCompleteSnapshot()
})

test('symlinked parent, current image, source and existing claim refuse without changing their targets', async (t) => {
  for (const fault of ['parent', 'current', 'source', 'claim'] as const) {
    await t.test(fault, async (subtest) => {
      const f = await fixture(subtest)
      let currentAppImage = f.currentAppImage
      let source = f.source
      let oldPath = f.currentAppImage
      let sourcePath = f.source
      let sentinel: string | null = null
      switch (fault) {
        case 'current': {
          oldPath = path.join(f.parent, 'real-current.AppImage')
          await fs.rename(f.currentAppImage, oldPath)
          await fs.symlink(oldPath, f.currentAppImage)

          break
        }
        case 'parent': {
          const alias = path.join(f.root, 'linked-applications')
          await fs.symlink(f.parent, alias)
          currentAppImage = path.join(alias, path.basename(f.currentAppImage))

          break
        }
        case 'source': {
          sourcePath = path.join(path.dirname(f.source), 'real-cache.AppImage')
          await fs.rename(f.source, sourcePath)
          await fs.symlink(sourcePath, f.source)
          source = f.source

          break
        }
        default: {
          const foreign = path.join(f.root, 'foreign-directory')
          await fs.mkdir(foreign)
          sentinel = path.join(foreign, 'sentinel')
          await fs.writeFile(sentinel, 'Foreign directory must survive.')
          await fs.symlink(foreign, f.stagingDirectory)
        }
      }
      const before = { old: await witness(oldPath), source: await witness(sourcePath) }
      const sentinelBefore = sentinel ? await witness(sentinel) : null
      await assert.rejects(
        stageVerifiedApplicationArtifact({
          artifact: { ...f.artifact, path: source },
          currentAppImage,
          currentSource: f.currentSource,
        }),
      )
      assert.deepEqual({ old: await witness(oldPath), source: await witness(sourcePath) }, before)
      if (sentinel) {
        assert.deepEqual(await witness(sentinel), sentinelBefore)
      }
    })
  }
})

test('hardlinked or non-executable current images and direct source/current alias are refused', async (t) => {
  for (const fault of ['hardlink', 'not-executable', 'same-file'] as const) {
    await t.test(fault, async (subtest) => {
      const f = await fixture(subtest)
      let artifact = f.artifact
      if (fault === 'hardlink') {
        await fs.link(f.currentAppImage, path.join(f.root, 'another-owner.AppImage'))
      } else if (fault === 'not-executable') {
        await fs.chmod(f.currentAppImage, 0o600)
      } else {
        artifact = {
          ...f.artifact,
          ...signedRelease(f.oldBytes, { filename: path.basename(f.currentAppImage) }),
          path: f.currentAppImage,
        }
      }
      const before = await inputs(f)
      await assert.rejects(
        stageVerifiedApplicationArtifact({
          artifact,
          currentAppImage: f.currentAppImage,
          currentSource: f.currentSource,
        }),
      )
      assert.deepEqual(await inputs(f), before)
    })
  }
})

test('revoked source authority before writing preserves both inputs', async (t) => {
  const f = await fixture(t)
  const before = await inputs(f)
  f.state.onVerify = async () => {
    throw new Error('Owned capability was revoked before staging.')
  }
  await assert.rejects(
    stageVerifiedApplicationArtifact({
      artifact: f.artifact,
      currentAppImage: f.currentAppImage,
      currentSource: f.currentSource,
    }),
  )
  assert.ok(f.state.calls >= 1)
  assert.deepEqual(await inputs(f), before)
})

test('authority capture is bracketed by native revalidation and refuses changed original bytes', async (t) => {
  const f = await fixture(t)
  const before = await inputs(f)
  const artifact = { ...f.artifact, authority: { ...f.artifact.authority } }
  f.state.onVerify = async (call) => {
    if (call === 2) {
      artifact.authority = { ...artifact.authority, envelope: `${artifact.authority.envelope} ` }
    }
  }
  await assert.rejects(
    stageVerifiedApplicationArtifact({
      artifact,
      currentAppImage: f.currentAppImage,
      currentSource: f.currentSource,
    }),
  )
  assert.deepEqual(await inputs(f), before)
  await assert.rejects(fs.lstat(f.stagingDirectory), { code: 'ENOENT' })
})

test('revocation observed after the actual copy leaves a failed claim and preserves old/cache inputs', async (t) => {
  const f = await fixture(t)
  const before = await inputs(f)
  let observedCopiedBytes = false
  f.state.onVerify = async () => {
    let entries: string[]
    try {
      entries = await fs.readdir(f.stagingDirectory)
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return
      }
      throw error
    }
    assert.ok(entries.length <= 8)
    for (const name of entries) {
      const file = path.join(f.stagingDirectory, name)
      if (!(await fs.lstat(file)).isFile()) {
        continue
      }
      if ((await fs.readFile(file)).equals(f.body)) {
        observedCopiedBytes = true
        throw new Error('Owned capability was revoked after the copy.')
      }
    }
  }
  await assert.rejects(
    stageVerifiedApplicationArtifact({
      artifact: f.artifact,
      currentAppImage: f.currentAppImage,
      currentSource: f.currentSource,
    }),
  )
  assert.equal(
    observedCopiedBytes,
    true,
    'Post-copy authority must be checked against the real candidate.',
  )
  assert.deepEqual(await inputs(f), before)
  assert.equal((await fs.lstat(f.stagingDirectory)).isDirectory(), true)
  const receipt = await journal(f.stagingDirectory, undefined, 'failed')
  assert.equal(Object.values(receipt.value).includes('failed'), true)
})

test('signed source hash and exact size are enforced independently of the controlled authority port', async (t) => {
  for (const fault of ['hash', 'size'] as const) {
    await t.test(fault, async (subtest) => {
      const body = imageBytes(37)
      const descriptor =
        fault === 'hash' ? { sha512: sha512(imageBytes(38)) } : { sizeBytes: body.length + 1 }
      const f = await fixture(subtest, { body, descriptor })
      const before = await inputs(f)
      await assert.rejects(
        stageVerifiedApplicationArtifact({
          artifact: f.artifact,
          currentAppImage: f.currentAppImage,
          currentSource: f.currentSource,
        }),
      )
      assert.deepEqual(await inputs(f), before)
    })
  }
})

test('minimal Linux x64 Type2 AppImage header admission refuses other executable markers', async (t) => {
  const invalid: [string, (body: Buffer) => Buffer][] = [
    [
      'ELF magic',
      (body) => {
        body[0] = 0
        return body
      },
    ],
    [
      'ELF32',
      (body) => {
        body[4] = 1
        return body
      },
    ],
    [
      'big endian',
      (body) => {
        body[5] = 2
        return body
      },
    ],
    [
      'ELF identity version',
      (body) => {
        body[6] = 2
        return body
      },
    ],
    [
      'unsupported ELF type',
      (body) => {
        body.writeUInt16LE(1, 16)
        return body
      },
    ],
    [
      'foreign machine',
      (body) => {
        body.writeUInt16LE(183, 18)
        return body
      },
    ],
    [
      'ELF header version',
      (body) => {
        body.writeUInt32LE(2, 20)
        return body
      },
    ],
    [
      'ELF header size',
      (body) => {
        body.writeUInt16LE(63, 52)
        return body
      },
    ],
    [
      'missing AI',
      (body) => {
        body[8] = 0
        return body
      },
    ],
    [
      'wrong AI',
      (body) => {
        body[9] = 0
        return body
      },
    ],
    [
      'Type1',
      (body) => {
        body[10] = 1
        return body
      },
    ],
    ['short header', (body) => body.subarray(0, 10)],
  ]
  for (const [label, mutate] of invalid) {
    await t.test(label, async (subtest) => {
      // Each wrong header is signed honestly; refusal cannot rely on a digest mismatch.
      const f = await fixture(subtest, { body: mutate(imageBytes(37)) })
      const before = await inputs(f)
      await assert.rejects(
        stageVerifiedApplicationArtifact({
          artifact: f.artifact,
          currentAppImage: f.currentAppImage,
          currentSource: f.currentSource,
        }),
      )
      assert.deepEqual(await inputs(f), before)
    })
  }
})

test('returned capability rejects byte, permission, inode, journal and canonical-parent tampering', async (t) => {
  type Observation = { oldPath?: string; stagePath?: string }
  const faults: [string, (f: Fixture, staged: Staged) => Promise<Observation | void>][] = [
    [
      'candidate bytes',
      async (_f, staged) => {
        const bytes = await fs.readFile(staged.candidatePath)
        bytes[100] = (bytes[100] ?? 0) ^ 1
        await fs.writeFile(staged.candidatePath, bytes)
      },
    ],
    [
      'current bytes',
      async (f) => {
        const bytes = await fs.readFile(f.currentAppImage)
        bytes[100] = (bytes[100] ?? 0) ^ 1
        await fs.writeFile(f.currentAppImage, bytes)
      },
    ],
    [
      'same-byte candidate inode replacement',
      async (f, staged) => {
        const bytes = await fs.readFile(staged.candidatePath)
        await fs.rename(staged.candidatePath, path.join(f.root, 'retained-candidate.AppImage'))
        await fs.writeFile(staged.candidatePath, bytes, { mode: 0o600 })
      },
    ],
    [
      'same-byte current inode replacement',
      async (f) => {
        const bytes = await fs.readFile(f.currentAppImage)
        await fs.rename(f.currentAppImage, `${f.currentAppImage}.retained-original`)
        await fs.writeFile(f.currentAppImage, bytes, { mode: 0o755 })
        await fs.chmod(f.currentAppImage, 0o755)
      },
    ],
    [
      'candidate symlink to cache',
      async (f, staged) => {
        await fs.rename(staged.candidatePath, path.join(f.root, 'retained-candidate.AppImage'))
        await fs.symlink(f.source, staged.candidatePath)
      },
    ],
    [
      'candidate executable permission',
      async (_f, staged) => {
        await fs.chmod(staged.candidatePath, 0o755)
      },
    ],
    [
      'current executable permission revoked',
      async (f) => {
        await fs.chmod(f.currentAppImage, 0o600)
      },
    ],
    [
      'staging directory readonly',
      async (_f, staged) => {
        await fs.chmod(staged.stagingDirectory, 0o500)
      },
    ],
    [
      'journal byte change with identical JSON value',
      async (_f, staged) => {
        const receipt = await journal(staged.stagingDirectory, staged.candidatePath)
        await fs.appendFile(receipt.file, '\n')
      },
    ],
    [
      'same-byte journal inode replacement',
      async (f, staged) => {
        const receipt = await journal(staged.stagingDirectory, staged.candidatePath)
        await fs.rename(receipt.file, path.join(f.root, 'retained-journal.json'))
        await fs.writeFile(receipt.file, receipt.bytes, { mode: 0o600 })
      },
    ],
    [
      'journal symlink',
      async (f, staged) => {
        const receipt = await journal(staged.stagingDirectory, staged.candidatePath)
        const retained = path.join(f.root, 'retained-journal.json')
        await fs.rename(receipt.file, retained)
        await fs.symlink(retained, receipt.file)
      },
    ],
    [
      'parent path replaced',
      async (f, staged) => {
        const moved = path.join(f.root, 'retained-applications')
        await fs.rename(f.parent, moved)
        await fs.mkdir(f.parent, { mode: 0o755 })
        return {
          oldPath: path.join(moved, path.basename(f.currentAppImage)),
          stagePath: path.join(moved, path.basename(staged.stagingDirectory)),
        }
      },
    ],
    [
      'parent path becomes symlink to the same bytes',
      async (f, staged) => {
        const moved = path.join(f.root, 'retained-applications')
        await fs.rename(f.parent, moved)
        await fs.symlink(moved, f.parent)
        return {
          oldPath: path.join(moved, path.basename(f.currentAppImage)),
          stagePath: path.join(moved, path.basename(staged.stagingDirectory)),
        }
      },
    ],
    [
      'same-byte staging directory replacement',
      async (f, staged) => {
        const clone = path.join(f.parent, 'owned-staging-clone')
        await fs.cp(staged.stagingDirectory, clone, { preserveTimestamps: true, recursive: true })
        await fs.rename(staged.stagingDirectory, `${staged.stagingDirectory}.retained-original`)
        await fs.rename(clone, staged.stagingDirectory)
      },
    ],
  ]
  for (const member of ['release-envelope.json', 'release-notes.json']) {
    for (const fault of ['bytes', 'same-byte-inode']) {
      faults.push([
        `${member}/${fault}`,
        async (f, staged) => {
          const file = path.join(staged.stagingDirectory, member)
          const bytes = await fs.readFile(file)
          if (fault === 'same-byte-inode') {
            await fs.rename(file, path.join(f.root, `retained-${member}`))
            await fs.writeFile(file, bytes, { mode: 0o600 })
          } else {
            await fs.appendFile(file, ' ')
          }
        },
      ])
    }
  }
  for (const [label, mutate] of faults) {
    await t.test(label, async (subtest) => {
      const f = await fixture(subtest)
      const staged = await stageVerifiedApplicationArtifact({
        artifact: f.artifact,
        currentAppImage: f.currentAppImage,
        currentSource: f.currentSource,
      })
      await staged.verifyCompleteSnapshot()
      const observation = await mutate(f, staged)
      const oldPath = observation ? observation.oldPath : undefined
      const stagePath = observation ? observation.stagePath : undefined
      const beforeRefusal = await inputs(f, oldPath)
      await assert.rejects(staged.verifyCompleteSnapshot())
      assert.deepEqual(
        await inputs(f, oldPath),
        beforeRefusal,
        'Refusal must not modify the current executable or native cache.',
      )
      assert.equal((await fs.lstat(stagePath ?? staged.stagingDirectory)).isDirectory(), true)
    })
  }
})

test('an unwritable current parent is refused without chmod or partial cleanup of owned inputs', async (t) => {
  if (process.getuid?.() === 0) {
    t.skip('Root bypasses the owned readonly-directory write denial.')
    return
  }
  const f = await fixture(t)
  await fs.chmod(f.parent, 0o500)
  const before = await inputs(f)
  await assert.rejects(
    stageVerifiedApplicationArtifact({
      artifact: f.artifact,
      currentAppImage: f.currentAppImage,
      currentSource: f.currentSource,
    }),
  )
  assert.deepEqual(await inputs(f), before)
  assert.equal((await fs.lstat(f.parent)).mode & 0o777, 0o500)
  await assert.rejects(fs.lstat(f.stagingDirectory), { code: 'ENOENT' })
})

for (const fault of [
  'current',
  'candidate',
  'journal',
  'release-envelope.json',
  'release-notes.json',
  'extra-entry',
] as const) {
  test(`a ${fault} change during the last authority await cannot escape final plan guards`, async (t) => {
    const f = await fixture(t)
    const staged = await stageVerifiedApplicationArtifact({
      artifact: f.artifact,
      currentAppImage: f.currentAppImage,
      currentSource: f.currentSource,
    })
    let calls = 0
    f.state.onVerify = async () => {
      if (++calls !== 2) {
        return
      }
      if (fault === 'extra-entry') {
        await fs.writeFile(path.join(staged.stagingDirectory, 'foreign-note'), 'must be preserved')
      } else {
        const filename =
          fault === 'current'
            ? f.currentAppImage
            : fault === 'candidate'
              ? staged.candidatePath
              : path.join(staged.stagingDirectory, fault === 'journal' ? 'journal.json' : fault)
        const bytes = await fs.readFile(filename)
        bytes[bytes.length - 1] ^= 1
        await fs.writeFile(filename, bytes)
      }
    }
    await assert.rejects(staged.verifyCompleteSnapshot())
    assert.equal(calls, 2)
    f.state.onVerify = undefined
    await assert.rejects(staged.verifyCompleteSnapshot())
  })
}
