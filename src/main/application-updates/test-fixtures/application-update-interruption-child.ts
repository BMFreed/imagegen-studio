/** Drive the actual staging transaction to a selected boundary using owned, nonexecuted images. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import nodeFs from 'node:fs'
import { constants, writeSync } from 'node:fs'
import { type FileHandle, lstat, open, readFile, realpath } from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import path from 'node:path'

import type {
  ApplicationReleaseAuthority,
  ApplicationReleaseTrust,
} from '../application-release.js'

import { verifyApplicationReleaseAuthority } from '../application-release.js'
import { acquireApplicationUpdateAdmission } from '../application-update-admission.js'
import {
  captureApplicationUpdateCurrentSource,
  stageVerifiedApplicationArtifact,
} from '../application-update-staging.js'

type Cut = 'after-publication' | 'after-replace-before-journal' | 'before-publication'

type Input = {
  archivePath: string
  artifactPath: string
  authority: ApplicationReleaseAuthority
  currentAppImage: string
  cut: Cut
  executablePath: string
  trust: ApplicationReleaseTrust
}

function park(cut: Cut, stageDirectory: string, startTicks: string): never {
  const receipt = Buffer.from(
    `${JSON.stringify({
      cut,
      lockPath: `${stageDirectory}.lock`,
      pid: process.pid,
      stageDirectory,
      startTicks,
      type: 'cut',
    })}\n`,
  )
  assert.equal(writeSync(process.stdout.fd, receipt), receipt.length)
  // No transaction code, normal cleanup or relaunch runs after this witness. An unattended
  // fixture times out and exits with failure instead of holding the test's lock indefinitely.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30_000)
  writeSync(process.stderr.fd, 'Interruption fixture did not receive its expected process kill.\n')
  process.exit(2)
}

async function ownedFile(root: string, filename: string) {
  assert.equal(typeof filename, 'string')
  assert.equal(path.resolve(filename), filename)
  assert.ok(filename.startsWith(`${root}${path.sep}`))
  assert.equal(await realpath(filename), filename)
  const info = await lstat(filename, { bigint: true })
  assert.ok(
    info.isFile() &&
      info.uid === BigInt(process.geteuid!()) &&
      info.nlink === 1n &&
      (info.mode & 0o22n) === 0n,
    `Unexpected owner, type or mode for ${path.basename(filename)}.`,
  )
  return info
}

async function run() {
  assert.equal(process.platform, 'linux')
  const filename = process.argv[2]
  assert.ok(filename && process.argv.length === 3)
  const root = path.dirname(filename)
  assert.equal(await realpath(root), root)
  const rootInfo = await lstat(root)
  assert.ok(
    rootInfo.isDirectory() && rootInfo.uid === process.geteuid!() && (rootInfo.mode & 0o77) === 0,
  )
  const descriptorInfo = await ownedFile(root, filename)
  assert.ok(descriptorInfo.size <= 3n * 1024n ** 2n)
  const input = JSON.parse(await readFile(filename, 'utf8')) as Input
  assert.ok(
    input.cut === 'before-publication' ||
      input.cut === 'after-replace-before-journal' ||
      input.cut === 'after-publication',
  )
  const { archivePath, artifactPath, authority, currentAppImage, cut, executablePath, trust } =
    input
  // These borrowed descriptors are controlled file observations. The fixture never runs
  // Electron or claims that either one came from the loaded body of an application.
  for (const file of new Set([archivePath, artifactPath, currentAppImage, executablePath])) {
    await ownedFile(root, file)
  }
  const manifest = verifyApplicationReleaseAuthority(authority, trust)
  const initial = await ownedFile(root, artifactPath)
  assert.equal(initial.size, BigInt(manifest.artifact.sizeBytes))
  const id = (info: typeof initial) =>
    [info.dev, info.ino, info.mode, info.size, info.mtimeNs, info.ctimeNs].join(':')
  const verifyCompleteSnapshot = async () => {
    const digest = createHash('sha512')
    const artifact = await open(artifactPath, constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
      assert.equal(id(await artifact.stat({ bigint: true })), id(initial))
      for await (const bytes of artifact.createReadStream({ autoClose: false })) {
        digest.update(bytes)
      }
      assert.equal(digest.digest('base64'), manifest.artifact.sha512)
      assert.equal(id(await artifact.stat({ bigint: true })), id(initial))
      assert.equal(id(await ownedFile(root, artifactPath)), id(initial))
    } finally {
      await artifact.close()
    }
  }

  const stat = await readFile('/proc/self/stat', 'utf8')
  const startTicks = stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19]
  assert.match(startTicks, /^\d+$/)
  const admission = acquireApplicationUpdateAdmission(currentAppImage)
  const borrowed: FileHandle[] = []
  let capture: ReturnType<typeof captureApplicationUpdateCurrentSource> | undefined
  try {
    const borrow = async (file: string) => {
      const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
      borrowed.push(handle)
      return handle.fd
    }
    capture = captureApplicationUpdateCurrentSource({
      archiveFd: await borrow(archivePath),
      archivePath,
      currentAppImage,
      executableFd: await borrow(executablePath),
      executablePath,
    })
    const source = await capture.complete()
    const staged = await stageVerifiedApplicationArtifact({
      artifact: { authority, manifest, path: artifactPath, verifyCompleteSnapshot },
      currentAppImage,
      currentSource: source,
    })
    const backedUp = await staged.prepareBackup()
    let closeAssertions = 0
    const rename = nodeFs.renameSync
    if (cut === 'after-replace-before-journal') {
      // Park only after the real activation syscall, before the owner can sync or advance its journal.
      nodeFs.renameSync = (from, to) => {
        assert.ok(typeof from === 'string' && typeof to === 'string')
        assert.match(path.dirname(from), /^\/proc\/self\/fd\/\d+$/)
        assert.match(path.dirname(to), /^\/proc\/self\/fd\/\d+$/)
        assert.equal(nodeFs.realpathSync(from), backedUp.candidatePath)
        assert.equal(nodeFs.realpathSync(to), currentAppImage)
        assert.equal(closeAssertions, 2)
        admission.assertHeld()
        const candidate = nodeFs.lstatSync(from, { bigint: true })
        rename(from, to)
        const published = nodeFs.lstatSync(to, { bigint: true })
        assert.equal(published.dev, candidate.dev)
        assert.equal(published.ino, candidate.ino)
        park(cut, backedUp.stagingDirectory, startTicks)
      }
      syncBuiltinESMExports()
    }
    try {
      const activated = await backedUp.activate(() => {
        admission.assertHeld()
        closeAssertions++
        if (cut === 'before-publication' && closeAssertions === 2) {
          park(cut, backedUp.stagingDirectory, startTicks)
        }
      })
      assert.equal(closeAssertions, 2)
      assert.equal(
        cut,
        'after-publication',
        'Publication completed after the requested earlier cut.',
      )
      admission.assertHeld()
      park(cut, activated.stagingDirectory, startTicks)
    } finally {
      if (cut === 'after-replace-before-journal') {
        nodeFs.renameSync = rename
        syncBuiltinESMExports()
      }
    }
  } finally {
    capture?.dispose()
    admission.release()
    await Promise.all(borrowed.map((handle) => handle.close()))
  }
}

await run()
