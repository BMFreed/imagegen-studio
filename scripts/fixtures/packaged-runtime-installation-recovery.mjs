/** Observe stock AppImage runtime recovery with a live installation owner and after its exit. */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  readlink,
  realpath,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

import { expect } from '@playwright/test'

import { ProjectSession } from '../../src/main/projects/project-session.ts'
import { createRuntimeRoots, RuntimeManager } from '../../src/main/runtime/index.ts'
import { OFFLINE_RUNTIME_INCOMPLETE_MARKER } from '../../src/main/runtime/offline-runtime-assembly.ts'
import {
  RuntimeInstallationController,
  RUNTIME_INSTALLATION_CLAIM,
  RUNTIME_INSTALLATION_JOURNAL,
  RUNTIME_INSTALLATION_RECOVERY_CLAIM,
} from '../../src/main/runtime/runtime-installation.ts'
import {
  assertOfflineProjectDesktop,
  indexSnapshot,
  regularFile,
} from './packaged-noobai-import-chooser.mjs'

const scenario = 'runtime-installation-recovery'
const projectTitle = 'Saved runtime recovery control'
const placeholdersDir = fileURLToPath(
  new URL('../../src/main/projects/placeholders/', import.meta.url),
)
const producer = fileURLToPath(new URL('./packaged-runtime-installation-cut.ts', import.meta.url))
const recoveryDetail =
  'An interrupted runtime installation requires recovery before image work can start.'
const invalidDetail = 'The installed runtime metadata or Python executable is missing or invalid.'
const unavailable = {
  error: {
    code: 'RUNTIME_INSTALL_UNAVAILABLE',
    message:
      'Verified release artifacts and a complete setup preview are not available in this build.',
  },
  ok: false,
}

async function writeJson(root, filename, value) {
  await writeFile(path.join(root, filename), JSON.stringify(value, null, 2) + '\n', {
    flag: 'wx',
    mode: 0o600,
  })
}

async function processStart(pid) {
  const stat = await readFile(`/proc/${pid}/stat`, 'ascii').catch((error) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  return stat === null
    ? null
    : stat
        .slice(stat.lastIndexOf(')') + 1)
        .trim()
        .split(/\s+/)[19]
}

async function fileWitness(filename, identity) {
  await regularFile(filename)
  const entry = await lstat(filename, { bigint: true })
  return {
    ...(await identity(filename)),
    device: String(entry.dev),
    inode: String(entry.ino),
    mode: String(entry.mode),
  }
}

async function assertSlots(roots, receipt, identity) {
  for (const rootName of ['environmentsDir', 'pythonDir']) {
    assert.deepEqual(
      (await readdir(roots[rootName])).sort(),
      [receipt.previousSlot.runtimeId, receipt.candidateSlot.runtimeId].sort(),
    )
  }
  for (const slot of [receipt.previousSlot, receipt.candidateSlot]) {
    assert.equal(slot.environmentRoot, path.join(roots.environmentsDir, slot.runtimeId))
    assert.equal(slot.pythonRoot, path.join(roots.pythonDir, slot.runtimeId))
    for (const [directory, expected] of [
      [slot.environmentRoot, slot.environmentIdentity],
      [slot.pythonRoot, slot.pythonIdentity],
    ]) {
      assert.equal(await realpath(directory), directory)
      const entry = await lstat(directory, { bigint: true })
      assert.ok(entry.isDirectory() && entry.uid === BigInt(process.getuid()))
      assert.deepEqual(
        { device: String(entry.dev), inode: String(entry.ino), mode: String(entry.mode) },
        expected,
      )
      await assert.rejects(lstat(path.join(directory, OFFLINE_RUNTIME_INCOMPLETE_MARKER)), {
        code: 'ENOENT',
      })
    }
    for (const file of slot.files) {
      assert.ok(
        [slot.environmentRoot, slot.pythonRoot].some((directory) =>
          file.path.startsWith(directory + path.sep),
        ),
      )
      assert.deepEqual(await fileWitness(file.path, identity), file)
    }
  }
  const link = receipt.pythonSymlink
  assert.equal(link.path, path.join(receipt.candidateSlot.environmentRoot, 'bin/python'))
  assert.ok(link.target.startsWith(receipt.candidateSlot.pythonRoot + path.sep))
  assert.ok((await lstat(link.path)).isSymbolicLink())
  assert.equal(await readlink(link.path), link.target)
  await assert.rejects(lstat(path.join(receipt.previousSlot.environmentRoot, 'bin/python')), {
    code: 'ENOENT',
  })
}

async function assertRuntimeState(roots, receipt, identity, recovered = false) {
  const safe = receipt.cut === 'before-publication'
  const pointer = roots.pointerFile
  const claim = path.join(roots.runtimeDir, RUNTIME_INSTALLATION_CLAIM)
  const journal = path.join(roots.runtimeDir, RUNTIME_INSTALLATION_JOURNAL)
  assert.equal(receipt.pointer.path, pointer)
  assert.equal(receipt.claim.path, claim)
  assert.equal(receipt.journal.path, journal)
  assert.deepEqual(await fileWitness(pointer, identity), receipt.pointer)
  assert.equal(
    (await readFile(pointer)).toString('base64'),
    safe ? receipt.previousPointer : receipt.candidatePointer,
  )
  const journalBody = await readFile(journal, 'utf8')
  const expectedPhase = recovered && safe ? 'rolled-back' : receipt.phase
  const parsed = JSON.parse(journalBody)
  assert.equal(parsed.phase, expectedPhase)
  assert.equal(parsed.previousPointer, receipt.previousPointer)
  assert.equal(parsed.candidatePointer, receipt.candidatePointer)
  assert.equal(parsed.attemptId, receipt.attemptId)
  assert.equal(parsed.mode, 'repair')
  assert.deepEqual(parsed.owner, {
    pid: receipt.pid,
    startTicks: receipt.startTicks,
    bootId: receipt.bootId,
  })
  if (recovered && safe) {
    await assert.rejects(lstat(claim), { code: 'ENOENT' })
  } else {
    assert.deepEqual(await fileWitness(journal, identity), receipt.journal)
    assert.deepEqual(await fileWitness(claim, identity), receipt.claim)
    assert.deepEqual(JSON.parse(await readFile(claim, 'utf8')), {
      schemaVersion: 1,
      attemptId: receipt.attemptId,
      owner: parsed.owner,
    })
  }
  await assert.rejects(lstat(path.join(roots.runtimeDir, RUNTIME_INSTALLATION_RECOVERY_CLAIM)), {
    code: 'ENOENT',
  })
  const temporaries = (await readdir(roots.runtimeDir)).filter((entry) => entry.endsWith('.tmp'))
  if (safe) {
    assert.match(
      path.basename(receipt.temporaryPointer.path),
      /^\.runtime-metadata-[a-f0-9-]+\.tmp$/,
    )
    assert.equal(path.dirname(receipt.temporaryPointer.path), roots.runtimeDir)
    assert.deepEqual(temporaries, [path.basename(receipt.temporaryPointer.path)])
    assert.deepEqual(
      await fileWitness(receipt.temporaryPointer.path, identity),
      receipt.temporaryPointer,
    )
    assert.equal(
      (await readFile(receipt.temporaryPointer.path)).toString('base64'),
      receipt.candidatePointer,
    )
  } else {
    assert.equal(receipt.temporaryPointer, null)
    assert.deepEqual(temporaries, [])
  }
  await assertSlots(roots, receipt, identity)
  return {
    pointer: receipt.pointer,
    journal: await fileWitness(journal, identity),
    journalBody,
    claim: recovered && safe ? null : receipt.claim,
    phase: parsed.phase,
    temporaryPointer: receipt.temporaryPointer,
  }
}

async function withCutInstallation(root, appData, cut, identity, observe) {
  const receiptFile = path.join(root, 'live-cut.json')
  const child = spawn(process.execPath, ['--import', 'tsx', producer, appData, cut, receiptFile], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let spawnError
  child.once('error', (error) => {
    spawnError = error
  })
  const exited = new Promise((resolve) =>
    child.once('close', (code, signal) => resolve({ code, signal })),
  )
  let output = ''
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding('utf8').on('data', (text) => {
      output = (output + text).slice(-16_384)
    })
  }
  try {
    await expect
      .poll(
        async () => {
          if (spawnError) throw spawnError
          assert.equal(child.exitCode, null, output)
          assert.equal(child.signalCode, null, output)
          if (!output.split('\n').includes('runtime-installation-cut-ready')) return false
          return await lstat(receiptFile).then(
            () => true,
            (error) => {
              if (error.code !== 'ENOENT') throw error
              return false
            },
          )
        },
        { timeout: 12_000, message: 'The live installer must publish the exact cut witness.' },
      )
      .toBe(true)
    await regularFile(receiptFile)
    const receipt = JSON.parse(await readFile(receiptFile, 'utf8'))
    assert.equal(receipt.schemaVersion, 1)
    assert.equal(receipt.cut, cut)
    assert.equal(receipt.appData, appData)
    assert.equal(receipt.phase, cut === 'before-publication' ? 'activating' : 'post-qualifying')
    const priorBytes = Buffer.from(receipt.previousPointer, 'base64')
    assert.equal(
      createHash('sha256').update(priorBytes).digest('hex'),
      receipt.previousPointerWitness.sha256,
    )
    assert.equal(priorBytes.length, receipt.previousPointerWitness.sizeBytes)
    if (cut === 'before-publication')
      assert.deepEqual(receipt.pointer, receipt.previousPointerWitness)
    else assert.notEqual(receipt.pointer.inode, receipt.previousPointerWitness.inode)
    assert.equal(receipt.pid, child.pid)
    assert.equal(
      receipt.bootId,
      (await readFile('/proc/sys/kernel/random/boot_id', 'ascii')).trim(),
    )
    assert.match(receipt.startTicks, /^\d+$/)
    const roots = await createRuntimeRoots(appData)
    async function assertOwnerAlive() {
      assert.equal(child.exitCode, null, output)
      assert.equal(child.signalCode, null, output)
      assert.equal(await processStart(child.pid), receipt.startTicks)
    }
    await assertOwnerAlive()
    const live = await assertRuntimeState(roots, receipt, identity)
    // The same well-formed journal must refuse recovery while its exact owner is alive.
    await assert.rejects(new RuntimeInstallationController(roots).recover(), {
      code: 'RUNTIME_INSTALL_BUSY',
    })
    async function reap() {
      await assertOwnerAlive()
      assert.ok(child.kill('SIGKILL'))
      const exit = await Promise.race([exited, delay(8000, null, { ref: false })])
      assert.deepEqual(exit, { code: null, signal: 'SIGKILL' })
      const remainingStart = await processStart(child.pid)
      assert.notEqual(remainingStart, receipt.startTicks)
      assert.deepEqual(await assertRuntimeState(roots, receipt, identity), live)
      await writeJson(root, 'reaped-cut.json', {
        exit,
        remainingStart,
        owner: { pid: receipt.pid, startTicks: receipt.startTicks, bootId: receipt.bootId },
        live,
        liveRecovery: 'RUNTIME_INSTALL_BUSY',
      })
    }
    assert.deepEqual(await assertRuntimeState(roots, receipt, identity), live)
    return await observe({ roots, receipt, live, assertOwnerAlive, reap })
  } finally {
    if (child.pid && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    assert.ok(
      await Promise.race([exited, delay(8000, null, { ref: false })]),
      'The owned cut producer must be reaped.',
    )
    await writeFile(path.join(root, 'cut-producer.log'), output, { flag: 'wx', mode: 0o600 })
  }
}

async function observeRepair(state, root, detail) {
  const { page } = state
  const notice = page.getByRole('region', { name: 'Image generation status', exact: true })
  await expect(
    notice.getByRole('heading', { name: 'Image generation needs repair', exact: true }),
  ).toBeVisible()
  await notice.getByText('Details', { exact: true }).click()
  await expect(notice.getByText(detail, { exact: true })).toBeVisible()
  const repair = notice.getByRole('button', { name: 'Repair', exact: true })
  await repair.click()
  await expect(notice.getByText('Action could not be completed', { exact: true })).toBeVisible()
  await expect(notice.getByText(unavailable.error.message, { exact: true })).toBeVisible()
  await expect(
    page.getByRole('dialog', { name: 'Repair image generation', exact: true }),
  ).toBeHidden()
  const observed = await page.evaluate(async () => ({
    status: await window.api.runtime.getStatus(),
    preview: await window.api.runtime.previewInstallation('repair'),
    progress: await window.api.runtime.getInstallationProgress(),
  }))
  assert.deepEqual(observed.status, {
    ok: true,
    value: { kind: 'needs-repair', profile: 'linux-nvidia', detail },
  })
  assert.deepEqual(observed.preview, unavailable)
  assert.deepEqual(observed.progress, { ok: true, value: { operation: null, revision: 0 } })
  await page.screenshot({ path: path.join(root, state.name + '-status.png') })
  return observed
}

async function observeWarmRecheck(state, root, detail, reap, verifyRuntime) {
  const { page, mainPid } = state
  const notice = page.getByRole('region', { name: 'Image generation status', exact: true })
  const check = notice.getByRole('button', { name: 'Check again', exact: true })
  const repair = notice.getByRole('button', { name: 'Repair', exact: true })
  const tab = page.getByRole('tab', { name: projectTitle, exact: true })
  await expect(check).toBeEnabled()
  await expect(repair).toBeEnabled()
  const start = await processStart(mainPid)
  assert.match(start, /^\d+$/)

  const repairPending = await repair.evaluateHandle((button) => {
    const states = []
    const observer = new MutationObserver((records) => {
      for (const record of records) states.push(record.oldValue === null)
    })
    observer.observe(button, { attributeFilter: ['disabled'], attributeOldValue: true })
    return { states, observer }
  })
  try {
    await reap()
    assert.equal(await processStart(mainPid), start)
    await check.click()
    // Both cuts must run the pending action, even when the status text remains the same.
    await expect.poll(() => repairPending.evaluate(({ states }) => states)).toEqual([true, false])
    await expect(check).toBeHidden()
    await expect(notice.getByText('Action could not be completed', { exact: true })).toBeHidden()
    await expect(notice.getByText(detail, { exact: true })).toBeVisible()
    await expect(repair).toBeEnabled()
    await expect(tab).toHaveAttribute('aria-selected', 'true')
    // Capture the state caused by the button before the independent status IPC can recover it.
    const runtime = await verifyRuntime()
    const observed = await page.evaluate(async () => ({
      status: await window.api.runtime.getStatus(),
      progress: await window.api.runtime.getInstallationProgress(),
    }))
    assert.deepEqual(observed.status, {
      ok: true,
      value: { kind: 'needs-repair', profile: 'linux-nvidia', detail },
    })
    assert.deepEqual(observed.progress, { ok: true, value: { operation: null, revision: 0 } })
    assert.equal(await processStart(mainPid), start)
    assert.deepEqual(await verifyRuntime(), runtime)
    await page.screenshot({ path: path.join(root, 'warm-recheck-status.png') })
    const result = { main: { pid: mainPid, start }, observed, runtime }
    await writeJson(root, 'warm-recheck.json', result)
    return result
  } finally {
    await repairPending.evaluate(({ observer }) => observer.disconnect()).catch(() => {})
    await repairPending.dispose()
  }
}

export async function runPackagedRuntimeInstallationRecovery({
  root,
  appData,
  ownedRunRoot,
  packageBefore,
  launch,
  closeNormally,
  retainOwnStore,
  identity,
}) {
  const cut = process.env.IMAGEGEN_RUNTIME_INSTALLATION_CUT
  assert.ok(cut === 'before-publication' || cut === 'post-qualifying')
  const warmRecheck = process.env.IMAGEGEN_RUNTIME_INSTALLATION_WARM_RECHECK === '1'
  const proof = JSON.parse(
    await readFile(path.join(path.dirname(root), 'package-proof.json'), 'utf8'),
  )
  assert.equal(proof.schemaVersion, 1)
  assert.ok(proof.package.path.startsWith(ownedRunRoot + path.sep))
  await assertOfflineProjectDesktop({
    root,
    ownedRunRoot,
    packageBefore,
    expectedPackage: proof.package,
    scenario,
    suite: 'packaged-runtime-installation-recovery',
  })
  assert.equal(await realpath(root), root)
  assert.equal(appData, path.join(root, 'data/imagegen-studio'))
  await assert.rejects(lstat(appData), { code: 'ENOENT' })
  return await withCutInstallation(root, appData, cut, identity, (owner) =>
    observeRuntimeLifetimes({
      root,
      appData,
      cut,
      launch,
      closeNormally,
      retainOwnStore,
      identity,
      warmRecheck,
      ...owner,
    }),
  )
}

async function observeRuntimeLifetimes({
  root,
  appData,
  cut,
  launch,
  closeNormally,
  retainOwnStore,
  identity,
  warmRecheck,
  roots,
  receipt,
  live,
  assertOwnerAlive,
  reap,
}) {
  const workspace = path.join(appData, 'workspaces/Uncategorized')
  await mkdir(workspace, { mode: 0o700, recursive: true })
  const filename = 'Runtime recovery.igs'
  const project = path.join(workspace, filename)
  const scratchDir = path.join(root, 'project-fixture-scratch')
  await mkdir(scratchDir, { mode: 0o700 })
  const fixture = await ProjectSession.create(project, projectTitle, {
    placeholdersDir,
    scratchDir,
  })
  const original = await fileWitness(project, identity)
  const database = path.join(appData, 'database/app.sqlite')
  const safe = cut === 'before-publication'
  const lifetimes = []
  const owner = { pid: receipt.pid, bootId: receipt.bootId, startTicks: receipt.startTicks }
  for (const name of ['live', 'first', 'reopened']) {
    const ownerAlive = name === 'live'
    if (ownerAlive) await assertOwnerAlive()
    const state = await launch(name)
    let observed
    let warm
    try {
      observed = await observeRepair(
        state,
        root,
        safe && !ownerAlive ? invalidDetail : recoveryDetail,
      )
      await state.page.getByRole('button', { name: `Open ${projectTitle}`, exact: true }).click()
      await expect(
        state.page.getByRole('tab', { name: projectTitle, exact: true }),
      ).toHaveAttribute('aria-selected', 'true')
      if (ownerAlive && warmRecheck) {
        const before = await assertRuntimeState(roots, receipt, identity)
        assert.deepEqual(before, live)
        await assertOwnerAlive()
        assert.deepEqual(await fileWitness(project, identity), original)
        await writeJson(root, 'live-app-observed.json', { owner, name, observed, after: before })
        warm = await observeWarmRecheck(
          state,
          root,
          safe ? invalidDetail : recoveryDetail,
          reap,
          async () => await assertRuntimeState(roots, receipt, identity, true),
        )
        assert.deepEqual(await fileWitness(project, identity), original)
      }
    } finally {
      await closeNormally(state)
    }
    const after = await assertRuntimeState(roots, receipt, identity, !ownerAlive || warmRecheck)
    assert.deepEqual(JSON.parse(after.journalBody), {
      ...JSON.parse(live.journalBody),
      phase: after.phase,
    })
    if (ownerAlive) assert.deepEqual(after, warm?.runtime ?? live)
    if (name === 'first' && warmRecheck) assert.deepEqual(after, lifetimes[0].after)
    if (name === 'reopened') assert.deepEqual(after, lifetimes[1].after)
    assert.deepEqual(await fileWitness(project, identity), original)
    const index = indexSnapshot(database)
    assert.deepEqual(
      { ...index, projects: index.projects.length },
      {
        accepted: [],
        jobs: 0,
        projects: 1,
        receipts: 0,
        seeds: 0,
      },
    )
    const [row] = index.projects
    assert.equal(row.documentId, fixture.document.documentId)
    assert.equal(row.revision, fixture.document.documentRevision)
    assert.equal(row.filename, project)
    assert.equal(row.health, 'ready')
    assert.equal(row.title, projectTitle)
    const saved = await retainOwnStore(`${name}-closed`, filename)
    assert.equal(saved.project.sha256, original.sha256)
    const observation = { name, observed, after, saved, index, ...(warm && { warm }) }
    lifetimes.push(observation)
    if (ownerAlive && !warmRecheck) {
      await assertOwnerAlive()
      await writeJson(root, 'live-app-observed.json', {
        owner,
        ...observation,
      })
      await reap()
    }
  }

  // A separate host RuntimeManager with no release available exposes the admission order
  // independently of the stock renderer's absent installation backend.
  let releaseReads = 0
  const manager = new RuntimeManager(roots, undefined, undefined, {
    loadRelease: async () => {
      releaseReads++
      return undefined
    },
  })
  const preview = await manager.previewInstallation('repair')
  assert.deepEqual(
    preview,
    safe
      ? unavailable
      : {
          ok: false,
          error: {
            code: 'RUNTIME_INSTALL_RECOVERY_REQUIRED',
            message: 'Recover the interrupted runtime installation before reviewing setup.',
          },
        },
  )
  assert.equal(releaseReads, safe ? 1 : 0)
  assert.deepEqual(await assertRuntimeState(roots, receipt, identity, true), lifetimes[2].after)
  const result = { cut, original, lifetimes, controlledBackend: { preview, releaseReads } }
  await writeJson(root, 'runtime-recovery-proof.json', result)
  return result
}
