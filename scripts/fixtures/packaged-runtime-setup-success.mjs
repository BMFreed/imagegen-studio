/** Full Setup, fresh-slot Repair, and rollback through the private qualification AppImage. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { constants, createReadStream } from 'node:fs'
import { link, lstat, open, readFile, readdir, realpath, statfs, unlink } from 'node:fs/promises'
import path from 'node:path'

import { expect } from '@playwright/test'

import {
  confirmRuntimeSetupReview,
  dismissRuntimeSetupReview,
  getRuntimeSetupProgress,
  getRuntimeSetupStatus,
  openRuntimeSetupReview,
  waitForRuntimeSetupError,
} from './packaged-runtime-setup-ui.mjs'

const operationTimeout = 280_000
const archiveName = 'runtime-payload.zip'
const flag = constants.O_RDONLY | constants.O_NOFOLLOW
const failureMessage =
  'Image setup could not be completed. Check runtime status before trying again.'
const repairFaultPrefix = 'IGS_SETUP_QUALIFICATION_REPAIR_FAULT '

async function shaFile(file) {
  assert.equal(await realpath(file), file)
  const hash = createHash('sha256')
  for await (const bytes of createReadStream(file, { flags: flag })) hash.update(bytes)
  return hash.digest('hex')
}

async function bytesAvailable(directory) {
  const volume = await statfs(directory, { bigint: true })
  return Number(volume.bavail * volume.bsize)
}

async function absent(file) {
  await assert.rejects(lstat(file), { code: 'ENOENT' })
}

async function fileReceipt(file, pin) {
  const info = await lstat(file)
  assert.ok(info.isFile() && info.nlink === 1, file)
  const receipt = { file, bytes: info.size, sha256: await shaFile(file) }
  if (pin) {
    assert.equal(receipt.bytes, pin.sizeBytes, file)
    assert.equal(receipt.sha256, pin.sha256, file)
  }
  return receipt
}

async function snapshotSlot(runtime, pointer) {
  assert.equal(pointer.schemaVersion, 1)
  assert.match(pointer.runtimeId, /^release-[0-9a-f-]{36}$/)
  const environment = path.join(runtime, 'environments', pointer.runtimeId)
  const python = path.join(runtime, 'python', pointer.runtimeId)
  const roots = []
  for (const directory of [environment, python]) {
    assert.equal(await realpath(directory), directory)
    const info = await lstat(directory)
    assert.ok(info.isDirectory())
    await absent(path.join(directory, '.igs-runtime-incomplete.json'))
    roots.push({ path: directory, device: info.dev, inode: info.ino })
  }
  assert.equal(pointer.pythonExecutable, path.join(environment, 'bin/python'))
  const executable = await realpath(pointer.pythonExecutable)
  assert.ok(executable.startsWith(`${python}/`), executable)
  const files = [
    executable,
    path.join(environment, 'runtime-installation.json'),
    path.join(environment, 'bootstrap/requirements.txt'),
    path.join(environment, 'lib/python3.12/site-packages/imagegen_worker/inference.py'),
  ]
  return { roots, files: await Promise.all(files.map((file) => fileReceipt(file))) }
}

async function assertReady(page, runtimeId, outpaintInfill = 'ready') {
  const status = await getRuntimeSetupStatus(page)
  assert.equal(status.kind, 'ready', JSON.stringify(status))
  assert.equal(status.profile, 'linux-nvidia')
  assert.equal(status.runtimeId, runtimeId)
  assert.equal(status.outpaintInfill, outpaintInfill)
  return status
}

function assertTransfer(request, route, input) {
  assert.deepEqual(request, {
    method: 'GET',
    route,
    range: null,
    sentBytes: input.sizeBytes,
    responseSha256: input.sha256,
    finished: true,
    closed: true,
    failure: null,
  })
}

async function observeSetup(page, mode, rollback = false, downloadRuntime = mode === 'install') {
  await page.evaluate(() => {
    const stages = []
    const stop = globalThis.api.runtime.onInstallationProgressChanged(({ operation }) => {
      if (operation && stages.at(-1) !== operation.stage) stages.push(operation.stage)
    })
    globalThis.readPackagedSetupSuccessStages = () => {
      stop()
      delete globalThis.readPackagedSetupSuccessStages
      return stages
    }
  })
  await confirmRuntimeSetupReview(page, mode)
  let terminal
  await expect
    .poll(
      async () => {
        const { operation } = await getRuntimeSetupProgress(page)
        if (operation?.mode === mode && !['running', 'cancelling'].includes(operation.state)) {
          terminal = operation
          return true
        }
        return false
      },
      { timeout: operationTimeout },
    )
    .toBe(true)
  assert.equal(terminal.state, rollback ? 'failed' : 'succeeded', JSON.stringify(terminal))
  if (rollback) {
    assert.equal(await waitForRuntimeSetupError(page, mode, failureMessage), failureMessage)
  } else {
    await expect(
      page.getByRole('dialog', {
        exact: true,
        name: mode === 'install' ? 'Set up image generation' : 'Repair image generation',
      }),
    ).toBeHidden({ timeout: 10_000 })
  }
  const stages = await page.evaluate(() => globalThis.readPackagedSetupSuccessStages())
  const required = [
    'preparing-runtime',
    ...(downloadRuntime ? ['downloading-runtime'] : []),
    'extracting-runtime',
    'installing-outpaint',
    'copying-runtime',
    'assembling-runtime',
    'checking-runtime',
    'checking-activation',
    'finalizing',
  ]
  let index = -1
  for (const stage of required) {
    index = stages.indexOf(stage, index + 1)
    assert.notEqual(index, -1, `Expected ${stage} in ${stages.join(', ')}`)
  }
  assert.equal(stages.includes('downloading-runtime'), downloadRuntime)
  return { terminal, stages }
}

async function sync(directory) {
  const descriptor = await open(directory, flag | constants.O_DIRECTORY)
  try {
    await descriptor.sync()
  } finally {
    await descriptor.close()
  }
}

export { assertReady, assertTransfer, bytesAvailable, fileReceipt, observeSetup, snapshotSlot }

async function parkOutpaint(file, destination, pin) {
  await fileReceipt(file, pin)
  // Use an exclusive same-volume link so a failure can preserve the exact source bytes.
  await link(file, destination)
  await sync(path.dirname(destination))
  await unlink(file)
  await sync(path.dirname(file))
  return await fileReceipt(destination, pin)
}

async function restoreOutpaintIfSafe(file, parked, pin, pointerFile, previous, claims) {
  const current = await readFile(pointerFile)
  if (!current.equals(previous)) return
  for (const claim of claims) {
    await absent(claim)
  }
  try {
    await lstat(file)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    await fileReceipt(parked, pin)
    await link(parked, file)
    await sync(path.dirname(file))
    await unlink(parked)
    await sync(path.dirname(parked))
  }
}

export async function runPackagedRuntimeSetupSuccess({
  root,
  dataRoot,
  inputs,
  manifest,
  transport,
  requests,
  waitForTransfers,
  verifyExpanded,
  launch,
  closeNormally,
  rollback = false,
}) {
  assert.equal(dataRoot, path.join(root, 'data/imagegen-studio'))
  const runtime = path.join(dataRoot, 'runtime')
  const pointerFile = path.join(runtime, 'current-runtime.json')
  const journalFile = path.join(runtime, 'runtime-installation.json')
  const claims = [
    '.igs-runtime-install.claim.json',
    '.igs-runtime-install-recovery.claim.json',
  ].map((name) => path.join(runtime, name))
  const downloads = path.join(dataRoot, 'cache/runtime-downloads')
  const cache = path.join(downloads, 'qualification-runtime-transport/transport')
  const outpaint = path.join(dataRoot, 'inference-resources/big-lama.pt')
  const parked = path.join(root, 'outpaint-before-repair.pt')
  const installed = await launch('setup-install')
  assert.equal((await getRuntimeSetupStatus(installed.page)).kind, 'not-installed')

  const verifyFence = async () => {
    for (const claim of claims) await absent(claim)
  }
  const reviewWithNoConsent = async (page, mode, review, check) => {
    await openRuntimeSetupReview(page, mode, review)
    await check()
    await dismissRuntimeSetupReview(page, mode)
    await check()
    await openRuntimeSetupReview(page, mode, review)
    await check()
  }
  const baseline = async () => {
    assert.deepEqual(requests, [])
    assert.equal((await getRuntimeSetupProgress(installed.page)).operation, null)
    await absent(pointerFile)
    await absent(journalFile)
    await absent(outpaint)
    await verifyFence()
    for (const folder of [
      downloads,
      path.join(runtime, 'environments'),
      path.join(runtime, 'python'),
    ]) {
      assert.deepEqual(await readdir(folder), [])
    }
  }
  const installReview = {
    releaseId: transport.releaseId,
    downloadBytes: inputs.archive.sizeBytes + inputs.lama.sizeBytes,
    runtimeRequiredFreeBytes: manifest.requiredFreeBytes,
    runtimeCached: false,
    outpaintInfillReused: false,
  }
  const verifyPublication = async (mode, terminal, previousPointer, rolledBack = false) => {
    const pointerBytes = await readFile(pointerFile)
    const pointer = JSON.parse(pointerBytes.toString('utf8'))
    const journal = JSON.parse(await readFile(journalFile, 'utf8'))
    assert.equal(journal.phase, rolledBack ? 'rolled-back' : 'complete')
    assert.equal(journal.mode, mode)
    assert.equal(journal.previousPointer, previousPointer?.toString('base64') ?? null)
    assert.equal(typeof journal.candidatePointer, 'string')
    const candidateBytes = Buffer.from(journal.candidatePointer, 'base64')
    assert.equal(candidateBytes.toString('base64'), journal.candidatePointer)
    const candidate = JSON.parse(candidateBytes.toString('utf8'))
    assert.equal(journal.prepared.runtimeId, candidate.runtimeId)
    assert.equal(journal.prepared.pythonExecutable, candidate.pythonExecutable)
    assert.deepEqual(pointerBytes, rolledBack ? previousPointer : candidateBytes)
    await verifyFence()
    const expanded = path.join(downloads, `engine-${terminal.operationId}`)
    await fileReceipt(path.join(expanded, 'runtime-release.json'), inputs.runtimeEnvelope)
    const extracted = await verifyExpanded(path.join(expanded, 'payload'), manifest)
    assert.equal(extracted.entries, transport.entryCount)
    assert.equal(extracted.regularBytes, transport.expandedRegularBytes)
    const slot = await snapshotSlot(runtime, pointer)
    const publication = { pointerBytes, pointer, journal, extracted, slot }
    if (!rolledBack) return publication
    const candidateSlot = await snapshotSlot(runtime, candidate)
    return { ...publication, candidatePointer: candidate, candidateSlot }
  }

  await reviewWithNoConsent(installed.page, 'install', installReview, baseline)
  const freeAtInstall = await bytesAvailable(runtime)
  assert.ok(freeAtInstall >= manifest.requiredFreeBytes)
  const installOperation = await observeSetup(installed.page, 'install')
  await waitForTransfers()
  assert.equal(requests.length, 2)
  assertTransfer(requests[0], '/runtime.zip', inputs.archive)
  assertTransfer(requests[1], '/big-lama.pt', inputs.lama)
  const first = await verifyPublication('install', installOperation.terminal, null)
  const setupStatus = await assertReady(installed.page, first.pointer.runtimeId)
  const cacheReceipt = await Promise.all([
    fileReceipt(path.join(cache, archiveName), inputs.archive),
    fileReceipt(path.join(cache, 'runtime-release.json'), inputs.runtimeEnvelope),
    fileReceipt(path.join(cache, 'runtime-transport.json'), inputs.transportEnvelope),
  ])
  const freeAfterInstall = await bytesAvailable(runtime)
  await closeNormally(installed)

  const setupReopened = await launch('setup-reopen')
  const reopenedSetupStatus = await assertReady(setupReopened.page, first.pointer.runtimeId)
  assert.deepEqual(await readFile(pointerFile), first.pointerBytes)
  assert.deepEqual(await snapshotSlot(runtime, first.pointer), first.slot)
  assert.equal(requests.length, 2)
  await closeNormally(setupReopened)
  assert.equal(setupReopened.normalPhysicalExit, true)
  const parkedOutpaint = await parkOutpaint(outpaint, parked, inputs.lama)

  let repairing
  let repairOperation
  let second
  let fault
  let repairedStatus
  let freeAtRepair
  let freeAfterRepair
  const repairReview = {
    ...installReview,
    downloadBytes: inputs.lama.sizeBytes,
    runtimeCached: true,
  }
  try {
    repairing = await launch('setup-repair')
    await assertReady(repairing.page, first.pointer.runtimeId, 'needs-repair')
    const noRepairConsent = async () => {
      assert.equal(requests.length, 2)
      assert.equal((await getRuntimeSetupProgress(repairing.page)).operation, null)
      assert.deepEqual(await readFile(pointerFile), first.pointerBytes)
      assert.deepEqual(JSON.parse(await readFile(journalFile, 'utf8')), first.journal)
      await absent(outpaint)
      await verifyFence()
    }
    await reviewWithNoConsent(repairing.page, 'repair', repairReview, noRepairConsent)
    freeAtRepair = await bytesAvailable(runtime)
    assert.ok(freeAtRepair >= manifest.requiredFreeBytes)
    repairOperation = await observeSetup(repairing.page, 'repair', rollback)
    await waitForTransfers()
    assert.equal(requests.length, 3)
    assertTransfer(requests[2], '/big-lama.pt', inputs.lama)
    second = await verifyPublication(
      'repair',
      repairOperation.terminal,
      first.pointerBytes,
      rollback,
    )
    const candidate = second.candidatePointer ?? second.pointer
    assert.notEqual(candidate.runtimeId, first.pointer.runtimeId)
    assert.deepEqual(await snapshotSlot(runtime, first.pointer), first.slot)
    repairedStatus = await assertReady(repairing.page, second.pointer.runtimeId)
    freeAfterRepair = await bytesAvailable(runtime)
    await closeNormally(repairing)
    if (rollback) {
      const faults = repairing.stderr
        .split('\n')
        .filter((line) => line.startsWith(repairFaultPrefix))
        .map((line) => JSON.parse(line.slice(repairFaultPrefix.length)))
      const expected = {
        attemptId: second.journal.attemptId,
        runtimeId: candidate.runtimeId,
        activePointerSha256: createHash('sha256')
          .update(Buffer.from(second.journal.candidatePointer, 'base64'))
          .digest('hex'),
        previousPointerSha256: createHash('sha256').update(first.pointerBytes).digest('hex'),
        errorCode: 'WORKER_EXITED',
        exitConfirmed: true,
        preActivationReady: true,
      }
      assert.deepEqual(faults, [expected])
      fault = faults[0]
    }
  } catch (error) {
    if (repairing && !repairing.normalPhysicalExit) {
      await closeNormally(repairing).catch(() => {})
    }
    if (repairing?.normalPhysicalExit && !repairing.forcedCleanup) {
      try {
        await restoreOutpaintIfSafe(
          outpaint,
          parked,
          inputs.lama,
          pointerFile,
          first.pointerBytes,
          claims,
        )
      } catch (restoreError) {
        throw new AggregateError(
          [error, restoreError],
          'Repair failed; the parked outpaint file was retained.',
        )
      }
    }
    throw error
  }

  const repairReopened = await launch('setup-repair-reopen')
  const reopenedRepairStatus = await assertReady(repairReopened.page, second.pointer.runtimeId)
  assert.deepEqual(await readFile(pointerFile), second.pointerBytes)
  assert.deepEqual(await snapshotSlot(runtime, second.pointer), second.slot)
  assert.deepEqual(await snapshotSlot(runtime, first.pointer), first.slot)
  if (rollback) {
    assert.deepEqual(await snapshotSlot(runtime, second.candidatePointer), second.candidateSlot)
    assert.deepEqual(JSON.parse(await readFile(journalFile, 'utf8')), second.journal)
    await verifyFence()
    await expect(repairReopened.page.getByText(failureMessage, { exact: true })).toHaveCount(0)
  }
  const installedOutpaint = await fileReceipt(outpaint, inputs.lama)
  assert.deepEqual(await fileReceipt(parked, inputs.lama), parkedOutpaint)
  assert.equal(requests.length, 3)
  await closeNormally(repairReopened)

  const serializable = ({ pointerBytes, ...entry }) => entry
  return {
    install: {
      ...installOperation,
      ...serializable(first),
      review: installReview,
      status: setupStatus,
      reopenedStatus: reopenedSetupStatus,
      freeAtConsent: freeAtInstall,
      freeAfterPublication: freeAfterInstall,
    },
    repair: {
      ...repairOperation,
      ...serializable(second),
      ...(fault ? { fault, failureMessage } : {}),
      review: repairReview,
      status: repairedStatus,
      reopenedStatus: reopenedRepairStatus,
      freeAtConsent: freeAtRepair,
      freeAfterPublication: freeAfterRepair,
    },
    cacheReceipt,
    installedOutpaint,
    parkedOutpaint,
    requests: structuredClone(requests),
  }
}
