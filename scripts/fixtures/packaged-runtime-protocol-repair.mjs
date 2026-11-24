/** Joined historical database upgrade, installed protocol refusal and reviewed runtime Repair. */
import assert from 'node:assert/strict'
import { lstat, readFile, readdir, realpath } from 'node:fs/promises'
import path from 'node:path'

import { prepareHistoricalProtocolRepair } from './packaged-runtime-protocol-repair-state.mjs'
import {
  assertReady,
  assertTransfer,
  bytesAvailable,
  fileReceipt,
  observeSetup,
  snapshotSlot,
} from './packaged-runtime-setup-success.mjs'
import {
  dismissRuntimeSetupReview,
  getRuntimeSetupProgress,
  getRuntimeSetupStatus,
  openRuntimeSetupReview,
} from './packaged-runtime-setup-ui.mjs'
import {
  assertProtocolUnavailable,
  inspectProtocolMain,
  runtimeDetail,
} from './packaged-worker-protocol.mjs'

const repo = path.resolve(import.meta.dirname, '../..')

export async function readProtocolRepairProfile({ root, appImage, identity }) {
  const inputs = path.join(path.dirname(root), `${path.basename(root)}-inputs`)
  const state = path.join(path.dirname(root), `${path.basename(root)}-state`)
  const descriptor = path.join(inputs, 'profile.json')
  assert.equal(await realpath(descriptor), descriptor)
  const before = await identity(descriptor)
  assert.ok(before.sizeBytes <= 16 * 1024)
  const profile = JSON.parse(await readFile(descriptor, 'utf8'))
  assert.equal(profile.schemaVersion, 1)
  assert.deepEqual(profile.packageIdentity, await identity(appImage))
  assert.deepEqual(await identity(descriptor), before)
  assert.equal(await realpath(state), state)
  assert.equal(await realpath(profile.appData), profile.appData)
  assert.match(
    profile.appData,
    /\/runs\/packaged-installed-engine\/[^/]+\/payloads\/[^/]+\/data\/imagegen-studio$/,
  )
  assert.match(profile.runtimeId, /^release-[0-9a-f-]{36}$/)
  const runtime = path.join(profile.appData, 'runtime')
  const environment = path.join(runtime, 'environments', profile.runtimeId)
  const python = path.join(runtime, 'python', profile.runtimeId)
  const worker = path.join(environment, 'lib/python3.12/site-packages/imagegen_worker')
  assert.equal(profile.workerRoot, worker)
  assert.equal(profile.pythonExecutable, path.join(environment, 'bin/python'))
  const activeModule = path.join(worker, '__init__.py')
  const originalModule = path.join(inputs, 'original-protocol.py')
  const alternateModule = path.join(inputs, 'alternate-protocol.py')
  const mounts = (await readFile('/proc/self/mountinfo', 'utf8'))
    .split('\n')
    .map((line) => line.split(' '))
  const mountAt = (target, access) => {
    const [entry, ...extra] = mounts.filter((mount) => mount[4] === target)
    assert.ok(entry && extra.length === 0, target)
    assert.ok(entry[5].split(',').includes(access), target)
    return entry.slice(0, 6)
  }
  const [staged, mounted] = await Promise.all(
    [state, profile.appData].map((dir) => lstat(dir, { bigint: true })),
  )
  assert.ok(staged.isDirectory() && staged.uid === BigInt(process.getuid()))
  assert.deepEqual([mounted.dev, mounted.ino], [staged.dev, staged.ino])
  const mountProof = [
    mountAt(profile.appData, 'rw'),
    mountAt(environment, 'ro'),
    mountAt(python, 'ro'),
    mountAt(activeModule, 'ro'),
  ]
  for (const dir of [path.dirname(environment), path.dirname(python)]) {
    assert.ok(!mounts.some((entry) => entry[4] === dir), dir)
    assert.deepEqual(await readdir(dir), [profile.runtimeId])
  }
  const original = await readFile(originalModule, 'utf8')
  const expectedLine = 'PROTOCOL_VERSION = "1"\n'
  assert.equal(original.split(expectedLine).length, 2)
  const alternate = original.replace(
    expectedLine,
    'PROTOCOL_VERSION = "2"  # isolated qualification value\n',
  )
  assert.equal(await readFile(alternateModule, 'utf8'), alternate)
  assert.equal(await readFile(activeModule, 'utf8'), alternate)
  const inputPins = await Promise.all([originalModule, alternateModule, activeModule].map(identity))
  assert.equal(profile.originalModule.path, activeModule)
  assert.deepEqual(inputPins[0], { ...profile.originalModule, path: originalModule })
  assert.deepEqual(inputPins[1], profile.alternateModule)
  assert.equal(inputPins[2].sha256, inputPins[1].sha256)
  const setupPins = await Promise.all(
    [
      path.join(repo, 'src/main/db/migrations/0030_model_reference_identity.sql'),
      path.join(repo, 'worker-python/src/imagegen_worker/srgb.icc'),
    ].map(identity),
  )
  return { ...profile, activeModule, inputPins, mountProof, descriptor: before, inputs, setupPins }
}

export async function runPackagedRuntimeProtocolRepair({
  root,
  dataRoot,
  profile,
  inputs,
  manifest,
  transport,
  requests,
  waitForTransfers,
  verifyExpanded,
  launch,
  closeNormally,
}) {
  const runtime = path.join(dataRoot, 'runtime')
  const pointerFile = path.join(runtime, 'current-runtime.json')
  const journalFile = path.join(runtime, 'runtime-installation.json')
  const outpaint = path.join(dataRoot, 'inference-resources/big-lama.pt')
  const absent = (file) => assert.rejects(lstat(file), { code: 'ENOENT' })
  const fenceClear = async () => {
    for (const name of [
      '.igs-runtime-install.claim.json',
      '.igs-runtime-install-recovery.claim.json',
    ]) {
      await absent(path.join(runtime, name))
    }
  }
  const identity = async (file) => {
    const { bytes, sha256 } = await fileReceipt(file)
    return { path: file, sizeBytes: bytes, sha256 }
  }
  const history = await prepareHistoricalProtocolRepair({
    filename: path.join(profile.inputs, 'historical-fixture.json'),
    appData: dataRoot,
    root,
    identity,
    migrationHash: profile.setupPins[0].sha256,
    iccHash: profile.setupPins[1].sha256,
  })
  assert.equal(profile.appData, dataRoot)
  assert.deepEqual(await identity(pointerFile), profile.pointer)
  assert.deepEqual(await identity(journalFile), profile.journal)
  const previousBytes = await readFile(pointerFile)
  const previousJournal = await readFile(journalFile)
  const previous = JSON.parse(previousBytes)
  assert.equal(previous.runtimeId, profile.runtimeId)
  assert.equal(previous.pythonExecutable, profile.pythonExecutable)
  const previousSlot = await snapshotSlot(runtime, previous)
  const assertOldSlot = async () => {
    assert.deepEqual(await snapshotSlot(runtime, previous), previousSlot)
    assert.deepEqual(await identity(profile.activeModule), profile.inputPins[2])
    assert.deepEqual(
      await Promise.all(profile.inputPins.slice(0, 2).map(({ path: file }) => identity(file))),
      profile.inputPins.slice(0, 2),
    )
  }

  const repairing = await launch('protocol-refusal-then-repair')
  const { page } = repairing
  const firstMain = await inspectProtocolMain(repairing.mainPid)
  const startup = await history.assertUpgraded()
  const unavailable = await getRuntimeSetupStatus(page)
  assert.deepEqual(unavailable, {
    kind: 'needs-repair',
    detail: runtimeDetail,
    profile: 'linux-nvidia',
    runtimeId: profile.runtimeId,
  })
  const tab = await history.openProject(page)
  const refusal = await assertProtocolUnavailable(repairing, tab, history.fixture.queue, dataRoot)

  const review = {
    releaseId: transport.releaseId,
    downloadBytes: inputs.archive.sizeBytes + inputs.lama.sizeBytes,
    runtimeRequiredFreeBytes: manifest.requiredFreeBytes,
    runtimeCached: false,
    outpaintInfillReused: false,
  }
  const assertNoConsent = async () => {
    assert.deepEqual(requests, [])
    assert.equal((await getRuntimeSetupProgress(page)).operation, null)
    assert.deepEqual(await readFile(pointerFile), previousBytes)
    assert.deepEqual(await readFile(journalFile), previousJournal)
    await fenceClear()
    await absent(outpaint)
    for (const name of ['environments', 'python']) {
      assert.deepEqual(await readdir(path.join(runtime, name)), [previous.runtimeId])
    }
    await history.assertPreserved()
  }
  await openRuntimeSetupReview(page, 'repair', review)
  await assertNoConsent()
  await dismissRuntimeSetupReview(page, 'repair')
  await assertNoConsent()
  await openRuntimeSetupReview(page, 'repair', review)
  await assertNoConsent()
  const freeAtConsent = await bytesAvailable(runtime)
  assert.ok(freeAtConsent >= manifest.requiredFreeBytes + review.downloadBytes)
  const operation = await observeSetup(page, 'repair', false, true)
  await waitForTransfers()
  assert.equal(requests.length, 2)
  assertTransfer(requests[0], '/runtime.zip', inputs.archive)
  assertTransfer(requests[1], '/big-lama.pt', inputs.lama)
  const pointerBytes = await readFile(pointerFile)
  const pointer = JSON.parse(pointerBytes)
  const journal = JSON.parse(await readFile(journalFile, 'utf8'))
  assert.equal(journal.phase, 'complete')
  assert.equal(journal.mode, 'repair')
  assert.equal(journal.previousPointer, previousBytes.toString('base64'))
  assert.equal(journal.candidatePointer, pointerBytes.toString('base64'))
  assert.equal(journal.prepared.runtimeId, pointer.runtimeId)
  assert.equal(journal.prepared.pythonExecutable, pointer.pythonExecutable)
  assert.notEqual(pointer.runtimeId, previous.runtimeId)
  const slot = await snapshotSlot(runtime, pointer)
  const candidateProtocol = path.join(
    runtime,
    'environments',
    pointer.runtimeId,
    'lib/python3.12/site-packages/imagegen_worker/__init__.py',
  )
  assert.equal(
    await readFile(candidateProtocol, 'utf8'),
    await readFile(path.join(profile.inputs, 'original-protocol.py'), 'utf8'),
  )
  const ready = await assertReady(page, pointer.runtimeId)
  const expanded = path.join(
    dataRoot,
    'cache/runtime-downloads',
    `engine-${operation.terminal.operationId}`,
  )
  const release = await fileReceipt(
    path.join(expanded, 'runtime-release.json'),
    inputs.runtimeEnvelope,
  )
  const extracted = await verifyExpanded(path.join(expanded, 'payload'), manifest)
  assert.equal(extracted.entries, transport.entryCount)
  assert.equal(extracted.regularBytes, transport.expandedRegularBytes)
  const resource = await fileReceipt(outpaint, inputs.lama)
  const freeAfterActivation = await bytesAvailable(runtime)
  await fenceClear()
  await assertOldSlot()
  const beforeSave = await history.assertPreserved()
  const save = await history.saveProject(page, pointer.pythonExecutable)
  await closeNormally(repairing)
  const repaired = await history.retainClosed('after-repair-save')

  const reopened = await launch('protocol-repair-reopen')
  const secondMain = await inspectProtocolMain(reopened.mainPid)
  const cold = await assertReady(reopened.page, pointer.runtimeId)
  assert.deepEqual(await readFile(pointerFile), pointerBytes)
  assert.deepEqual(JSON.parse(await readFile(journalFile, 'utf8')), journal)
  assert.deepEqual(await snapshotSlot(runtime, pointer), slot)
  assert.deepEqual(await fileReceipt(outpaint, inputs.lama), resource)
  await fenceClear()
  await assertOldSlot()
  const opened = await history.assertSaved(reopened.page)
  await closeNormally(reopened)
  const restarted = await history.retainClosed('after-repair-reopen')
  assert.deepEqual(restarted.project, repaired.project)
  assert.equal(requests.length, 2)
  return {
    profile,
    firstMain,
    secondMain,
    startup,
    unavailable,
    refusal,
    review,
    operation,
    journal,
    previousSlot,
    slot,
    ready,
    cold,
    release,
    resource,
    extracted,
    freeAtConsent,
    freeAfterActivation,
    beforeSave,
    save,
    repaired,
    opened,
    restarted,
    requests: structuredClone(requests),
  }
}
