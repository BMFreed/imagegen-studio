/** Pause a real installation controller at one precise publication boundary. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { type BigIntStats, constants } from 'node:fs'
import * as fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { createRuntimeRoots } from '../../src/main/runtime/index.js'
import {
  OFFLINE_RUNTIME_INCOMPLETE_MARKER,
  type PreparedOfflineRuntime,
} from '../../src/main/runtime/offline-runtime-assembly.js'
import {
  RUNTIME_INSTALLATION_CLAIM,
  RUNTIME_INSTALLATION_JOURNAL,
  RuntimeInstallationController,
} from '../../src/main/runtime/runtime-installation.js'

const [appData, cut, receipt] = process.argv.slice(2)
assert.equal(process.platform, 'linux')
assert.equal(process.argv.length, 5)
assert.ok(cut === 'before-publication' || cut === 'post-qualifying')

const fixtureRoot = path.dirname(path.dirname(appData))
const suiteRoot = path.join(
  os.userInfo().homedir,
  '.codex/artifacts/imagegen-studio/runs/packaged-runtime-installation-recovery',
)
assert.equal(path.dirname(path.dirname(fixtureRoot)), suiteRoot)
assert.match(path.basename(path.dirname(fixtureRoot)), /^\d{8}(?:-r[1-9]\d*)?$/)
assert.equal(path.basename(fixtureRoot), 'runtime-installation-recovery')
assert.equal(appData, path.join(fixtureRoot, 'data/imagegen-studio'))
assert.equal(path.dirname(receipt), fixtureRoot)
assert.match(path.basename(receipt), /^[a-z][a-z0-9-]*\.json$/)
assert.equal(await fs.realpath(fixtureRoot), fixtureRoot)
assert.equal(await fs.realpath(path.dirname(appData)), path.dirname(appData))
const userId = BigInt(os.userInfo().uid)

async function ownedDirectory(directory: string) {
  const entry = await fs.lstat(directory, { bigint: true })
  assert.equal(await fs.realpath(directory), directory)
  assert.ok(entry.isDirectory() && entry.uid === userId)
  return entry
}

async function requireMissing(filename: string) {
  await assert.rejects(fs.lstat(filename), { code: 'ENOENT' })
}

const fixture = await ownedDirectory(fixtureRoot)
assert.equal(fixture.mode & 0o777n, 0o700n)
await ownedDirectory(path.dirname(appData))
await requireMissing(receipt)
try {
  await fs.mkdir(appData, { mode: 0o700 })
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
    throw error
  }
}
await ownedDirectory(appData)
assert.deepEqual(await fs.readdir(appData), [], 'The installation cut requires fresh AppData.')

const roots = await createRuntimeRoots(appData)
const claimPath = path.join(roots.runtimeDir, RUNTIME_INSTALLATION_CLAIM)
const journalPath = path.join(roots.runtimeDir, RUNTIME_INSTALLATION_JOURNAL)

const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const jsonBytes = (value: unknown) => Buffer.from(`${JSON.stringify(value)}\n`)

async function writeNew(filename: string, bytes: string | Buffer, mode = 0o600) {
  const file = await fs.open(filename, 'wx', mode)
  try {
    await file.writeFile(bytes)
    await file.sync()
  } finally {
    await file.close()
  }
}

function identity(entry: BigIntStats) {
  return { device: String(entry.dev), inode: String(entry.ino), mode: String(entry.mode) }
}

async function witness(filename: string) {
  const entry = await fs.lstat(filename, { bigint: true })
  assert.ok(entry.isFile() && entry.uid === userId && entry.nlink === 1n)
  const bytes = await fs.readFile(filename)
  assert.equal(BigInt(bytes.length), entry.size)
  return { path: filename, sha256: digest(bytes), sizeBytes: bytes.length, ...identity(entry) }
}

async function createSlot(runtimeId: string) {
  const environmentRoot = path.join(roots.environmentsDir, runtimeId)
  const pythonRoot = path.join(roots.pythonDir, runtimeId)
  for (const directory of [environmentRoot, path.join(environmentRoot, 'bin'), pythonRoot]) {
    await fs.mkdir(directory, { mode: 0o700 })
  }
  return {
    environmentRoot,
    pythonExecutable: path.join(environmentRoot, 'bin/python'),
    pythonRoot,
    runtimeId,
  }
}

const previous = await createSlot('previous')
const previousFiles = [
  path.join(previous.environmentRoot, 'retained-environment.txt'),
  path.join(previous.pythonRoot, 'retained-python.txt'),
]
await writeNew(previousFiles[0], 'Previous synthetic environment bytes.\n')
await writeNew(previousFiles[1], 'Previous synthetic Python slot bytes.\n')
// The absent interpreter gives startup a deterministic repair diagnosis without a worker spawn.
const previousPointer = jsonBytes({
  pythonExecutable: previous.pythonExecutable,
  runtimeId: previous.runtimeId,
  schemaVersion: 1,
})
await writeNew(roots.pointerFile, previousPointer)

const previousPointerWitness = await witness(roots.pointerFile)
const releaseId = 'fixture-release'
let prepared: PreparedOfflineRuntime | undefined
let candidateExecutable: string | undefined

async function slotWitnesses(
  {
    environmentRoot,
    pythonExecutable,
    pythonRoot,
    runtimeId,
  }: Awaited<ReturnType<typeof createSlot>>,
  files: string[],
) {
  const markerPaths = [environmentRoot, pythonRoot].map((root) =>
    path.join(root, OFFLINE_RUNTIME_INCOMPLETE_MARKER),
  )
  for (const marker of markerPaths) {
    await requireMissing(marker)
  }
  return {
    absentMarkers: markerPaths,
    environmentIdentity: identity(await ownedDirectory(environmentRoot)),
    environmentRoot,
    files: await Promise.all(files.map(witness)),
    pythonExecutable,
    pythonIdentity: identity(await ownedDirectory(pythonRoot)),
    pythonRoot,
    runtimeId,
  }
}

async function park(expectedPhase: 'activating' | 'post-qualifying'): Promise<never> {
  assert.ok(prepared && candidateExecutable)
  const candidatePointer = jsonBytes({
    pythonExecutable: prepared.pythonExecutable,
    runtimeId: prepared.runtimeId,
    schemaVersion: 1,
  })
  const beforePublication = expectedPhase === 'activating'
  const exactPointer = beforePublication ? previousPointer : candidatePointer
  assert.deepEqual(await fs.readFile(roots.pointerFile), exactPointer)

  const bootId = (await fs.readFile('/proc/sys/kernel/random/boot_id', 'ascii')).trim()
  const procStat = await fs.readFile('/proc/self/stat', 'ascii')
  const startTicks = procStat
    .slice(procStat.lastIndexOf(') ') + 2)
    .trim()
    .split(/\s+/)[19]
  assert.match(bootId, /^[a-f0-9-]{36}$/)
  assert.match(startTicks, /^\d+$/)
  const owner = { bootId, pid: process.pid, startTicks }
  const claim = JSON.parse(await fs.readFile(claimPath, 'utf8'))
  const journal = JSON.parse(await fs.readFile(journalPath, 'utf8'))
  assert.deepEqual(claim.owner, owner)
  assert.equal(claim.schemaVersion, 1)
  assert.match(claim.attemptId, /^[a-f0-9-]{36}$/)
  assert.deepEqual(journal.owner, owner)
  assert.equal(journal.attemptId, claim.attemptId)
  assert.equal(journal.phase, expectedPhase)
  assert.equal(journal.mode, 'repair')
  assert.equal(journal.previousPointer, previousPointer.toString('base64'))
  assert.equal(journal.candidatePointer, candidatePointer.toString('base64'))

  const temporaryPointers = (await fs.readdir(roots.runtimeDir)).filter((name) =>
    /^\.runtime-metadata-[a-f0-9-]{36}\.tmp$/.test(name),
  )
  assert.equal(temporaryPointers.length, beforePublication ? 1 : 0)
  let temporaryPointer = null
  if (beforePublication) {
    const temporary = path.join(roots.runtimeDir, temporaryPointers[0])
    assert.deepEqual(await fs.readFile(temporary), candidatePointer)
    temporaryPointer = await witness(temporary)
  }
  await requireMissing(previous.pythonExecutable)
  assert.equal(await fs.readlink(prepared.pythonExecutable), candidateExecutable)
  const result = {
    cut,
    phase: expectedPhase,
    schemaVersion: 1,
    ...owner,
    appData,
    attemptId: claim.attemptId,
    candidatePointer: candidatePointer.toString('base64'),
    candidateSlot: await slotWitnesses(prepared, [candidateExecutable]),
    claim: await witness(claimPath),
    journal: await witness(journalPath),
    pointer: await witness(roots.pointerFile),
    previousPointer: previousPointer.toString('base64'),
    previousPointerWitness,
    previousSlot: await slotWitnesses(previous, previousFiles),
    pythonSymlink: { path: prepared.pythonExecutable, target: candidateExecutable },
    temporaryPointer,
  }
  const temporaryReceipt = `${receipt}.${process.pid}.tmp`
  await writeNew(temporaryReceipt, jsonBytes(result))
  await fs.link(temporaryReceipt, receipt)
  await fs.unlink(temporaryReceipt)
  const parent = await fs.open(fixtureRoot, constants.O_RDONLY | constants.O_DIRECTORY)
  try {
    await parent.sync()
  } finally {
    await parent.close()
  }
  // Abort the fixture itself if the controller never receives the expected SIGKILL.
  setTimeout(() => process.exit(124), 30_000)
  process.stdout.write('runtime-installation-cut-ready\n')
  return await new Promise<never>(() => {})
}

const controller = new RuntimeInstallationController(roots, {
  beforePointerPublish: async (publication) => {
    if (publication === 'activate' && cut === 'before-publication') {
      await park('activating')
    }
  },
})
await controller.install({
  expectedPointerSha256: digest(previousPointer),
  mode: 'repair',
  prepare: async () => {
    const slot = await createSlot('candidate')
    candidateExecutable = path.join(slot.pythonRoot, 'python')
    // This file meets preparation's path and mode checks. It contains no runnable interpreter.
    await writeNew(candidateExecutable, 'Synthetic candidate bytes: no interpreter.\n', 0o700)
    await fs.symlink(candidateExecutable, slot.pythonExecutable)
    const marker = jsonBytes({ releaseId, runtimeId: slot.runtimeId, schemaVersion: 1 })
    for (const directory of [slot.environmentRoot, slot.pythonRoot]) {
      await writeNew(path.join(directory, OFFLINE_RUNTIME_INCOMPLETE_MARKER), marker)
    }
    prepared = {
      ...slot,
      environment: {},
      logPath: path.join(roots.workerLogsDir, 'fixture-never-started.log'),
      manifestSha256: digest(Buffer.from('packaged runtime installation cut fixture')),
      releaseId,
    }
    return prepared
  },
  qualify: async (_slot, phase) => {
    if (phase === 'after-activation' && cut === 'post-qualifying') {
      await park('post-qualifying')
    }
  },
})
assert.fail('The installation controller passed the expected cut.')
