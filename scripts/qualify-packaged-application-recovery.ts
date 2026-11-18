import { IGS_SCHEMA_VERSION } from '../src/shared/projects/project-schema.js'

/** Owned native fixture for fresh-path recovery. Signing is ephemeral and qualification-only. */
import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, mkdir, open, readdir, readFile, realpath, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {
  type ApplicationReleaseAuthority,
  type ApplicationReleaseTrust,
  verifyApplicationReleaseAuthority,
} from '../src/main/application-updates/application-release.js'
import { acquireApplicationUpdateAdmission } from '../src/main/application-updates/application-update-admission.js'
import {
  captureApplicationUpdateCurrentSource,
  inspectRetainedApplicationUpdate,
  publishVerifiedApplicationRecovery,
  stageVerifiedApplicationArtifact,
} from '../src/main/application-updates/application-update-staging.js'
import { INFERENCE_WORKER_PROTOCOL_VERSION } from '../src/main/projects/generation-worker-client.js'
import { CPU_WORKER_PROTOCOL_VERSION } from '../src/main/projects/worker-client.js'
import { canonicalRuntimeReleaseJson } from '../src/main/runtime/runtime-release.js'

const artifactRoot = path.join(os.homedir(), '.codex/artifacts/imagegen-studio')
const [phase, run, ...extra] = process.argv.slice(2)
assert.ok((phase === 'publish' || phase === 'verify') && run && !extra.length)
assert.equal(await realpath(run), run)
assert.equal(path.dirname(run), path.join(artifactRoot, 'runs/packaged-application-recovery'))
assert.equal((await lstat(run)).uid, process.geteuid!())

const rendererReport = path.join(run, 'native/report.json')
const output = path.join(run, 'publication.json')
const applications = path.join(run, 'applications')
const originalAppImage = path.join(applications, 'Studio.AppImage')
const destinationAppImage = path.join(applications, 'Studio-Recovered.AppImage')
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`
const writeReceipt = (filename: string, value: unknown) =>
  writeFile(filename, json(value), { flag: 'wx', mode: 0o600 })

async function witness(filename: string) {
  const id = async () => {
    const entry = await lstat(filename, { bigint: true })
    assert.ok(entry.isFile() && !entry.isSymbolicLink() && entry.nlink === 1n)
    assert.equal(await realpath(filename), filename)
    return {
      identity: [
        entry.dev,
        entry.ino,
        entry.uid,
        entry.gid,
        entry.mode,
        entry.mtimeNs,
        entry.ctimeNs,
      ].map(String),
      mode: Number(entry.mode & 0o7777n),
      sizeBytes: Number(entry.size),
    }
  }
  const before = await id()
  const hex = createHash('sha256')
  const base64 = createHash('sha512')
  for await (const chunk of createReadStream(filename)) {
    hex.update(chunk)
    base64.update(chunk)
  }
  assert.deepEqual(await id(), before)
  return { path: filename, ...before, sha256: hex.digest('hex'), sha512: base64.digest('base64') }
}

function imageReceipt(file: Awaited<ReturnType<typeof witness>>) {
  return { path: file.path, sha256: file.sha256, sizeBytes: file.sizeBytes }
}

async function stageBodies(directory: string) {
  const info = await lstat(directory, { bigint: true })
  assert.ok(info.isDirectory() && (info.mode & 0o7777n) === 0o700n)
  const entries = (await readdir(directory)).sort()
  assert.deepEqual(entries, [
    'journal.json',
    'previous.AppImage',
    'release-envelope.json',
    'release-notes.json',
  ])
  return {
    directory,
    entries: await Promise.all(entries.map((name) => witness(path.join(directory, name)))),
    identity: [info.dev, info.ino, info.mode, info.uid, info.gid].map(String),
  }
}

async function pinnedSource() {
  const sourceRun = path.join(artifactRoot, 'runs/packaged-installed-engine/20261118')
  const earlier = JSON.parse(await readFile(path.join(sourceRun, 'native/report.json'), 'utf8'))
  assert.equal(earlier.outcome, 'PASS')
  assert.deepEqual(earlier.packageBefore, earlier.packageAfter)
  const filename = path.join(sourceRun, 'package/imagegen-studio-0.1.0-dev.1-x86_64.AppImage')
  const source = await witness(filename)
  assert.deepEqual(imageReceipt(source), earlier.packageBefore)
  assert.equal(source.sha256, 'b92cd007299479a6d8c582a5bf8ca06808d5353833026e61b3435c8e8f1f89ed')
  assert.equal(source.mode, 0o755)
  return source
}

async function authorityFor(source: Awaited<ReturnType<typeof witness>>) {
  const directory = path.resolve(import.meta.dirname, '../src/main/db/migrations')
  const migrations = (await readdir(directory)).filter((file) => file.endsWith('.sql')).sort()
  assert.equal(migrations.length, 30)
  const databaseMigrations = await Promise.all(
    migrations.map(async (name) => ({
      name,
      sha256: sha256(await readFile(path.join(directory, name))),
    })),
  )
  const keyId = 'owned-recovery-qualification'
  const keys = generateKeyPairSync('ed25519')
  const trust: ApplicationReleaseTrust = {
    compatibility: {
      cpuWorkerProtocolVersion: CPU_WORKER_PROTOCOL_VERSION,
      databaseMigrations,
      inferenceWorkerProtocolVersion: INFERENCE_WORKER_PROTOCOL_VERSION,
      projectSchemaVersion: IGS_SCHEMA_VERSION,
    },
    trustedKeys: { [keyId]: keys.publicKey.export({ format: 'pem', type: 'spki' }).toString() },
  }
  const releaseNotesJson = canonicalRuntimeReleaseJson('Owned recovery qualification').toString(
    'utf8',
  )
  const payload = canonicalRuntimeReleaseJson({
    appId: 'studio.imagegen.desktop',
    artifact: {
      filename: path.basename(source.path),
      sha512: source.sha512,
      sizeBytes: source.sizeBytes,
    },
    compatibility: { ...trust.compatibility, runtimeValidation: 'after-restart' },
    releaseId: keyId,
    releaseNotesSha256: sha256(Buffer.from(releaseNotesJson)),
    schemaVersion: 1,
    scope: 'application-release',
    target: { arch: 'x64', format: 'AppImage', os: 'linux' },
    version: '0.1.0-dev.1',
  })
  const authority: ApplicationReleaseAuthority = {
    envelope: canonicalRuntimeReleaseJson({
      keyId,
      payload: payload.toString('base64'),
      schemaVersion: 1,
      signature: sign(null, payload, keys.privateKey).toString('base64'),
    }).toString('utf8'),
    releaseNotesJson,
  }
  return { authority, manifest: verifyApplicationReleaseAuthority(authority, trust), trust }
}

async function qualifyPublication() {
  const source = await pinnedSource()
  const { authority, manifest, trust } = await authorityFor(source)
  await mkdir(applications, { mode: 0o700 })
  const old = Buffer.alloc(4096, 0x37)
  old.fill(0, 0, 64)
  old.set([0x7f, 69, 76, 70, 2, 1, 1, 0, 65, 73, 2])
  old.writeUInt16LE(3, 16)
  old.writeUInt16LE(62, 18)
  old.writeUInt32LE(1, 20)
  old.writeUInt16LE(64, 52)
  // Controlled predecessor A is inspected by staging and never executed.
  await writeFile(originalAppImage, old, { flag: 'wx', mode: 0o755 })
  const handle = await open(originalAppImage, 'r')
  const captured = captureApplicationUpdateCurrentSource({
    archiveFd: handle.fd,
    archivePath: originalAppImage,
    currentAppImage: originalAppImage,
    executableFd: handle.fd,
    executablePath: originalAppImage,
  })
  let stagingDirectory
  try {
    const currentSource = await captured.complete()
    const admission = acquireApplicationUpdateAdmission(originalAppImage)
    try {
      const staged = await stageVerifiedApplicationArtifact({
        artifact: {
          authority,
          manifest,
          path: source.path,
          verifyCompleteSnapshot: async () => assert.deepEqual(await witness(source.path), source),
        },
        currentAppImage: originalAppImage,
        currentSource,
      })
      const backed = await staged.prepareBackup()
      const activated = await backed.activate(() => admission.assertHeld())
      stagingDirectory = activated.stagingDirectory
      assert.equal((await readFile(activated.backupPath)).compare(old), 0)
    } finally {
      admission.release()
    }
  } finally {
    captured.dispose()
    await handle.close()
  }

  const original = await witness(originalAppImage)
  assert.equal(original.sha512, source.sha512)
  const retained = await stageBodies(stagingDirectory)
  const oldLock = await witness(`${stagingDirectory}.lock`)
  assert.equal(oldLock.sizeBytes, 0)
  assert.equal(oldLock.mode, 0o600)
  const originalObservation = await inspectRetainedApplicationUpdate({
    currentAppImage: originalAppImage,
    currentVersion: manifest.version,
    readTrust: async () => trust,
  })
  assert.deepEqual(originalObservation, {
    runtimeAuthentication: 'unverified',
    status: 'retained',
    targetAuthentication: 'verified',
  })
  const publication = await publishVerifiedApplicationRecovery({
    authority,
    destinationAppImage,
    originalAppImage,
    sourceAppImage: source.path,
    trust,
  })
  assert.deepEqual(publication, { destinationAppImage, manifest })
  const recovered = await witness(destinationAppImage)
  assert.equal(recovered.mode, 0o755)
  assert.equal(recovered.sha512, source.sha512)
  assert.equal(new Set([original.identity[1], recovered.identity[1], source.identity[1]]).size, 3)
  assert.deepEqual(await stageBodies(stagingDirectory), retained)
  assert.deepEqual(await witness(originalAppImage), original)
  assert.deepEqual(await witness(source.path), source)
  assert.deepEqual(
    await inspectRetainedApplicationUpdate({
      currentAppImage: destinationAppImage,
      currentVersion: manifest.version,
      readTrust: async () => trust,
    }),
    { status: 'none' },
  )
  const applicationMembers = (await readdir(applications)).sort()
  assert.deepEqual(
    applicationMembers,
    [
      path.basename(stagingDirectory),
      `${path.basename(stagingDirectory)}.lock`,
      path.basename(originalAppImage),
      path.basename(destinationAppImage),
    ].sort(),
  )
  await writeReceipt(output, {
    applicationMembers,
    authority,
    oldLock,
    original: imageReceipt(original),
    originalObservation,
    originalPins: original,
    outcome: 'PASS',
    recovered: imageReceipt(recovered),
    recoveredPins: recovered,
    retained,
    source,
    trust,
  })
}

async function qualifyAfterNative() {
  const proof = JSON.parse(await readFile(output, 'utf8'))
  const native = JSON.parse(await readFile(rendererReport, 'utf8'))
  assert.equal(proof.outcome, 'PASS')
  assert.equal(proof.original.path, originalAppImage)
  assert.equal(proof.recovered.path, destinationAppImage)
  assert.equal(native.outcome, 'PASS')
  assert.equal(native.lifetimes.length, 2)
  assert.ok(
    native.lifetimes.every((item: { normalPhysicalExit: boolean }) => item.normalPhysicalExit),
  )
  assert.deepEqual(native.packageBefore, proof.original)
  assert.deepEqual(native.packageAfter, proof.original)
  const { original, recovered } = native.recoveryPublication
  assert.deepEqual(original.bytes, proof.original)
  assert.deepEqual(recovered.bytes, proof.recovered)
  assert.deepEqual(
    native.lifetimes.map((item: { applicationImage: unknown }) => item.applicationImage),
    [original, recovered],
  )
  assert.deepEqual(
    native.lifetimes.map(
      (item: { applicationRecoveryStatus: unknown }) => item.applicationRecoveryStatus,
    ),
    [{ runtime: 'unverified', status: 'required', target: 'unverified' }, { status: 'clear' }],
  )
  assert.deepEqual(await witness(originalAppImage), proof.originalPins)
  assert.deepEqual(await witness(destinationAppImage), proof.recoveredPins)
  assert.deepEqual(await pinnedSource(), proof.source)
  assert.deepEqual((await readdir(applications)).sort(), proof.applicationMembers)
  assert.deepEqual(await stageBodies(proof.retained.directory), proof.retained)
  assert.deepEqual(await witness(`${proof.retained.directory}.lock`), proof.oldLock)
  await writeReceipt(path.join(run, 'post-native.json'), {
    imagesAndOriginalSourceUnchanged: true,
    nativeReportSha256: sha256(await readFile(rendererReport)),
    outcome: 'PASS',
    retainedStageUnchanged: true,
  })
}

await (phase === 'publish' ? qualifyPublication() : qualifyAfterNative())
