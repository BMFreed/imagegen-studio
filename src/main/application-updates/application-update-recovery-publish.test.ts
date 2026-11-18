/** Real signed publication on a private local filesystem with non-runnable AppImage fixtures. */
import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import nodeFs from 'node:fs'
import * as fs from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test, type TestContext } from 'node:test'

import type { ApplicationReleaseTrust } from './application-release.js'

import { canonicalRuntimeReleaseJson } from '../runtime/runtime-release.js'
import { publishVerifiedApplicationRecovery } from './application-update-staging.js'

const host = { skip: process.platform !== 'linux' || process.arch !== 'x64' }
const occupied = { code: 'APPLICATION_UPDATE_RECOVERY_DESTINATION_EXISTS' }
const unsafe = { code: 'APPLICATION_UPDATE_RECOVERY_UNSAFE' }
const uncertain = { code: 'APPLICATION_UPDATE_RECOVERY_PUBLICATION_UNCERTAIN' }
const sha512 = (bytes: Buffer) => createHash('sha512').update(bytes).digest('base64')

function image(marker: number, size = 4096) {
  const bytes = Buffer.alloc(size, marker)
  bytes.fill(0, 0, 64)
  bytes.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0, 0x41, 0x49, 2])
  bytes.writeUInt16LE(3, 16)
  bytes.writeUInt16LE(62, 18)
  bytes.writeUInt32LE(1, 20)
  bytes.writeUInt16LE(64, 52)
  return bytes
}

function signRelease(bytes: Buffer) {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const trust: ApplicationReleaseTrust = {
    compatibility: {
      cpuWorkerProtocolVersion: '1',
      databaseMigrations: [],
      inferenceWorkerProtocolVersion: '1',
      projectSchemaVersion: 1,
    },
    trustedKeys: {
      'recovery-fixture': publicKey.export({ format: 'pem', type: 'spki' }).toString(),
    },
  }
  const releaseNotesJson = canonicalRuntimeReleaseJson('Owned signed recovery fixture.').toString()
  const declaration = {
    appId: 'studio.imagegen.desktop',
    artifact: {
      filename: 'publisher-0.2.0-x86_64.AppImage',
      sha512: sha512(bytes),
      sizeBytes: bytes.length,
    },
    compatibility: { ...trust.compatibility, runtimeValidation: 'after-restart' },
    releaseId: 'owned-recovery-fixture',
    releaseNotesSha256: createHash('sha256').update(releaseNotesJson).digest('hex'),
    schemaVersion: 1,
    scope: 'application-release',
    target: { arch: 'x64', format: 'AppImage', os: 'linux' },
    version: '0.2.0',
  }
  const payload = canonicalRuntimeReleaseJson(declaration)
  const envelope = canonicalRuntimeReleaseJson({
    keyId: 'recovery-fixture',
    payload: payload.toString('base64'),
    schemaVersion: 1,
    signature: sign(null, payload, privateKey).toString('base64'),
  }).toString()
  return { authority: { envelope, releaseNotesJson }, declaration, trust }
}

function stageFor(appImage: string) {
  const suffix = createHash('sha256').update(path.basename(appImage)).digest('hex').slice(0, 16)
  return path.join(path.dirname(appImage), `.igs-app-update-${suffix}`)
}

async function witness(filename: string) {
  const stat = await fs.lstat(filename, { bigint: true })
  return {
    ctime: stat.ctimeNs,
    identity: `${stat.dev}:${stat.ino}`,
    mode: Number(stat.mode & 0o7777n),
    mtime: stat.mtimeNs,
    nlink: stat.nlink,
    size: stat.size,
    ...(stat.isSymbolicLink()
      ? { link: await fs.readlink(filename) }
      : stat.isDirectory()
        ? { entries: (await fs.readdir(filename)).sort() }
        : { sha512: sha512(await fs.readFile(filename)) }),
  }
}

async function fixture(t: Pick<TestContext, 'after'>) {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'igs-app-recovery-publish-'))
  t.after(async () => fs.rm(root, { force: true, recursive: true }))
  const originalDir = path.join(root, 'retained')
  const cacheDir = path.join(root, 'cache')
  const destinationDir = path.join(root, 'selected')
  for (const dir of [originalDir, cacheDir, destinationDir]) {
    await fs.mkdir(dir, { mode: 0o700 })
  }
  const originalAppImage = path.join(originalDir, 'ImageGen.AppImage')
  const sourceAppImage = path.join(cacheDir, 'download.AppImage')
  const destinationAppImage = path.join(destinationDir, 'ImageGen-Recovered.AppImage')
  const retainedStage = stageFor(originalAppImage)
  const backup = path.join(retainedStage, 'previous.AppImage')
  const journal = path.join(retainedStage, 'journal.json')
  const body = image(41, 2 * 1024 * 1024 + 97)
  await fs.mkdir(retainedStage, { mode: 0o700 })
  for (const [file, bytes, mode] of [
    [originalAppImage, image(19), 0o755],
    [sourceAppImage, body, 0o600],
    [backup, image(13), 0o600],
    [journal, '{"state":"activated","fixture":"retained"}\n', 0o600],
  ] as const) {
    await fs.writeFile(file, bytes, { mode })
  }
  const preserved = async () =>
    Promise.all(
      [originalDir, originalAppImage, sourceAppImage, retainedStage, backup, journal].map(witness),
    )
  const signed = signRelease(body)
  return {
    body,
    declaration: signed.declaration,
    destinationDir,
    input: {
      authority: signed.authority,
      destinationAppImage,
      originalAppImage,
      sourceAppImage,
      trust: signed.trust,
    },
    preserved,
    retainedStage,
  }
}

test(
  'signed recovery publishes a fresh complete executable beside untouched recovery data',
  host,
  async (t) => {
    const f = await fixture(t)
    const before = await f.preserved()
    const { destinationAppImage, manifest } = await publishVerifiedApplicationRecovery(f.input)
    assert.equal(destinationAppImage, f.input.destinationAppImage)
    assert.deepEqual(manifest.artifact, f.declaration.artifact)
    assert.equal(manifest.version, '0.2.0')
    assert.equal(manifest.releaseId, 'owned-recovery-fixture')
    const published = await witness(destinationAppImage)
    assert.equal(published.mode, 0o755)
    assert.equal(published.nlink, 1n)
    assert.ok('sha512' in published)
    assert.equal(published.sha512, sha512(f.body))
    assert.deepEqual(await fs.readFile(destinationAppImage), f.body)
    assert.ok(!before.some((prior) => prior.identity === published.identity))
    assert.deepEqual(await f.preserved(), before)
    assert.deepEqual(await fs.readdir(f.destinationDir), [path.basename(destinationAppImage)])
    await assert.rejects(publishVerifiedApplicationRecovery(f.input), occupied)
    assert.deepEqual(await witness(destinationAppImage), published)
    assert.deepEqual(await f.preserved(), before)
  },
)

test(
  'existing files, directories and symbolic links retain their exact destination objects',
  host,
  async (t) => {
    for (const kind of ['file', 'directory', 'symbolic-link', 'dangling-link'] as const) {
      await t.test(kind, async (subtest) => {
        const f = await fixture(subtest)
        const { destinationAppImage, originalAppImage } = f.input
        if (kind === 'file') {
          await fs.writeFile(destinationAppImage, 'already present', { mode: 0o640 })
        } else if (kind === 'directory') {
          await fs.mkdir(destinationAppImage, { mode: 0o700 })
          await fs.writeFile(path.join(destinationAppImage, 'keep.txt'), 'existing contents')
        } else {
          await fs.symlink(
            kind === 'symbolic-link' ? originalAppImage : path.join(f.destinationDir, 'missing'),
            destinationAppImage,
          )
        }
        const before = await f.preserved()
        const target = await witness(destinationAppImage)
        await assert.rejects(publishVerifiedApplicationRecovery(f.input), occupied)
        assert.deepEqual(await witness(destinationAppImage), target)
        assert.deepEqual(await f.preserved(), before)
        assert.deepEqual(await fs.readdir(f.destinationDir), [path.basename(destinationAppImage)])
      })
    }
  },
)

test(
  'recovery refuses original paths, stage namespaces and unsafe destination parents',
  host,
  async (t) => {
    const f = await fixture(t)
    const { destinationAppImage, originalAppImage, sourceAppImage } = f.input
    const alias = path.join(path.dirname(f.destinationDir), 'link')
    await fs.symlink(f.destinationDir, alias)
    const before = await f.preserved()
    for (const candidate of [
      originalAppImage,
      sourceAppImage,
      path.join(f.retainedStage, 'ImageGen-Recovered.AppImage'),
      path.join(f.destinationDir, 'ImageGen-Recovered.tar'),
      path.join(alias, path.basename(destinationAppImage)),
    ]) {
      await assert.rejects(
        publishVerifiedApplicationRecovery({ ...f.input, destinationAppImage: candidate }),
        unsafe,
      )
    }
    await fs.chmod(f.destinationDir, 0o770)
    await assert.rejects(publishVerifiedApplicationRecovery(f.input), unsafe)
    assert.deepEqual(await fs.readdir(f.destinationDir), [])
    assert.deepEqual(await f.preserved(), before)
    await fs.chmod(f.destinationDir, 0o700)
    const destinationClaim = stageFor(destinationAppImage)
    await fs.mkdir(destinationClaim, { mode: 0o700 })
    await fs.writeFile(path.join(destinationClaim, 'unowned-marker'), 'keep', { mode: 0o600 })
    const claim = await witness(destinationClaim)
    await assert.rejects(publishVerifiedApplicationRecovery(f.input), unsafe)
    assert.deepEqual(await witness(destinationClaim), claim)
    assert.deepEqual(await f.preserved(), before)
    assert.deepEqual(await fs.readdir(f.destinationDir), [path.basename(destinationClaim)])
  },
)

test(
  'a dangling original AppImage symlink cannot be made live by recovery publication',
  host,
  async (t) => {
    const f = await fixture(t)
    const { destinationAppImage, originalAppImage } = f.input
    await fs.unlink(originalAppImage)
    await fs.symlink(destinationAppImage, originalAppImage)
    const before = await f.preserved()

    await assert.rejects(publishVerifiedApplicationRecovery(f.input), unsafe)

    assert.deepEqual(await f.preserved(), before)
    assert.equal(await fs.readlink(originalAppImage), destinationAppImage)
    await assert.rejects(fs.lstat(destinationAppImage), { code: 'ENOENT' })
    assert.deepEqual(await fs.readdir(f.destinationDir), [])
  },
)

test(
  'bad signature trust, signed digest, source size and AppImage header refuse publication',
  host,
  async (t) => {
    for (const fault of [
      'key',
      'digest',
      'size',
      'header',
      'source-link',
      'source-hardlink',
    ] as const) {
      await t.test(fault, async (subtest) => {
        const f = await fixture(subtest)
        const { sourceAppImage } = f.input
        switch (fault) {
          case 'digest': {
            await fs.writeFile(sourceAppImage, image(21, f.body.length))

            break
          }
          case 'header': {
            const invalid = Buffer.from(f.body)
            invalid[18] = 0
            await fs.writeFile(sourceAppImage, invalid)
            const signed = signRelease(invalid)
            f.input.authority = signed.authority
            f.input.trust = signed.trust

            break
          }
          case 'key': {
            f.input.trust = signRelease(f.body).trust

            break
          }
          case 'size': {
            await fs.truncate(sourceAppImage, f.body.length - 1)

            break
          }
          default: {
            const alias = path.join(path.dirname(sourceAppImage), 'link.AppImage')
            await (fault === 'source-link'
              ? fs.symlink(sourceAppImage, alias)
              : fs.link(sourceAppImage, alias))
            f.input.sourceAppImage = alias
          }
        }
        const before = await f.preserved()
        await assert.rejects(publishVerifiedApplicationRecovery(f.input), unsafe)
        await assert.rejects(fs.lstat(f.input.destinationAppImage), { code: 'ENOENT' })
        assert.deepEqual(await f.preserved(), before)
      })
    }
  },
)

test(
  'concurrent publishers cannot replace the first signed image or reuse its inode',
  host,
  async (t) => {
    const f = await fixture(t)
    const alternate = image(99, f.body.length)
    const alternatePath = path.join(path.dirname(f.input.sourceAppImage), 'alternate.AppImage')
    await fs.writeFile(alternatePath, alternate, { mode: 0o600 })
    const before = await f.preserved()
    const alternateBefore = await witness(alternatePath)
    const signed = signRelease(alternate)
    const results = await Promise.allSettled([
      publishVerifiedApplicationRecovery(f.input),
      publishVerifiedApplicationRecovery({
        ...f.input,
        authority: signed.authority,
        sourceAppImage: alternatePath,
        trust: signed.trust,
      }),
    ])
    const winner = results.findIndex((outcome) => outcome.status === 'fulfilled')
    assert.notEqual(winner, -1)
    const loser = results[1 - winner]
    assert.equal(loser.status, 'rejected')
    assert.equal((loser.reason as { code: string }).code, occupied.code)
    const target = await witness(f.input.destinationAppImage)
    assert.ok('sha512' in target)
    assert.equal(target.sha512, sha512(winner === 0 ? f.body : alternate))
    assert.notEqual(target.identity, alternateBefore.identity)
    assert.ok(!before.some((prior) => prior.identity === target.identity))
    assert.equal(target.nlink, 1n)
    assert.deepEqual(await witness(alternatePath), alternateBefore)
    assert.deepEqual(await f.preserved(), before)
  },
)

test(
  'publication distinguishes a late conflict from takeover after its real hardlink',
  host,
  async (t) => {
    for (const race of ['before-link', 'after-link'] as const) {
      await t.test(race, async (subtest) => {
        const f = await fixture(subtest)
        const before = await f.preserved()
        const { destinationAppImage } = f.input
        const replacement = path.join(path.dirname(f.destinationDir), 'foreign.AppImage')
        const foreignBytes = image(97)
        await fs.writeFile(replacement, foreignBytes, { mode: 0o644 })
        const foreign = await witness(replacement)
        const link = nodeFs.linkSync
        let reached = 0
        // Interpose only at this owned destination's syscall boundary. The real hardlink still
        // supplies either EEXIST or successful publication before the competing rename.
        const intercepted = subtest.mock.method(
          nodeFs,
          'linkSync',
          (from: nodeFs.PathLike, to: nodeFs.PathLike) => {
            assert.ok(typeof from === 'string' && typeof to === 'string')
            const visible = path.join(nodeFs.realpathSync(path.dirname(to)), path.basename(to))
            if (visible !== destinationAppImage) {
              return link(from, to)
            }
            reached++
            assert.equal(nodeFs.lstatSync(from).mode & 0o7777, 0o755)
            assert.deepEqual(nodeFs.readFileSync(from), f.body)
            if (race === 'before-link') {
              nodeFs.renameSync(replacement, destinationAppImage)
              return link(from, to)
            }
            link(from, to)
            nodeFs.renameSync(replacement, destinationAppImage)
          },
        )
        syncBuiltinESMExports()
        try {
          await assert.rejects(
            publishVerifiedApplicationRecovery(f.input),
            race === 'before-link' ? occupied : uncertain,
          )
        } finally {
          intercepted.mock.restore()
          syncBuiltinESMExports()
        }
        assert.equal(reached, 1)
        const observed = await witness(destinationAppImage)
        assert.ok('sha512' in observed && 'sha512' in foreign)
        assert.equal(observed.identity, foreign.identity)
        assert.equal(observed.mode, foreign.mode)
        assert.equal(observed.sha512, foreign.sha512)
        assert.deepEqual(await f.preserved(), before)
        const retained = (await fs.readdir(f.destinationDir)).filter((entry) =>
          entry.startsWith('.igs-app-recovery-'),
        )
        assert.equal(retained.length, 1)
        const directory = path.join(f.destinationDir, retained[0])
        assert.equal((await witness(directory)).mode, 0o700)
        const candidate = await witness(path.join(directory, 'candidate.AppImage'))
        assert.ok('sha512' in candidate)
        assert.equal(candidate.mode, 0o755)
        assert.equal(candidate.nlink, 1n)
        assert.equal(candidate.sha512, sha512(f.body))
      })
    }
  },
)
