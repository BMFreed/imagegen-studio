import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { copyFile, lstat, mkdir, readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

import { expect } from '@playwright/test'

import { readIgsPackage } from '../../src/main/projects/igs-package.ts'

import { snapshotDatabase } from './application-state-upgrade-fixture.mjs'
import {
  assertFrozen,
  assertPortableConfiguration,
  assertWorkerExited,
  createAndAuthor,
  expectCatalog,
  inspectArchive,
  retainGeneration,
  runningWorker,
  setInput,
} from './packaged-installed-trained-generation.mjs'

const execute = promisify(execFile)
const sha256 = (data) => createHash('sha256').update(data).digest('hex')
const control = {
  targetSha256: '5e772deab1dd7f2624a541cf6584981d193acc7b83c4e4238200ebb4d67bb58d',
  outputSha256: 'b7a812342329445a0061608beed72d90cba527d53498619e8ce636f88becedeb',
  outputPixelSha256: 'e4c63ccbf468d39643e73ad43ed3b3c1bb08f5821524f9526c78602a28b5e3e0',
}

async function call(page, area, method, ...args) {
  const response = await page.evaluate(
    async ({ area, method, args }) => await globalThis.api[area][method](...args),
    { area, method, args },
  )
  assert.equal(response.ok, true, JSON.stringify(response))
  return response.value
}

async function readTab(page, id) {
  const opened = await call(page, 'projects', 'open', id)
  assert.equal(opened.kind, 'opened')
  return opened.tab
}

const projectTab = (page, project) => page.getByRole('tab', { name: project.title, exact: true })

async function openFromHome(page, project) {
  await page.getByRole('button', { name: 'Open Home', exact: true }).click()
  await expect(page.getByRole('tab', { name: 'Home', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
    { timeout: 60_000 },
  )
  await page
    .getByRole('region', { name: 'Home', exact: true })
    .getByRole('button', { name: `Open ${project.title}`, exact: true })
    .click({ timeout: 60_000 })
  await expect(projectTab(page, project)).toHaveAttribute('aria-selected', 'true', {
    timeout: 60_000,
  })
  return await readTab(page, project.id)
}

async function saveProject(page, project, revision) {
  await page.getByRole('button', { name: 'Save Project', exact: true }).click()
  await expect.poll(async () => (await readTab(page, project.id)).dirty).toBe(false)
  const saved = await readTab(page, project.id)
  assert.equal(saved.documentRevision, revision)
  return saved
}

async function packageWitness(filename) {
  assert.equal(await realpath(filename), filename)
  const entry = await lstat(filename)
  assert.ok(entry.isFile() && entry.uid === process.getuid() && entry.nlink === 1)
  assert.ok(entry.size > 0 && entry.size <= 8 * 1024 * 1024)
  const bytes = await readFile(filename)
  assert.equal(bytes.length, entry.size)
  return { path: filename, sha256: sha256(bytes), sizeBytes: bytes.length }
}

async function retainPackage(source, destination) {
  const original = await packageWitness(source)
  await copyFile(source, destination, constants.COPYFILE_EXCL)
  const copy = await packageWitness(destination)
  assert.deepEqual(copy, { ...original, path: destination })
  assert.deepEqual(await packageWitness(source), original)
  return { original, copy }
}

async function sampleWorkerCuda(worker) {
  const { stdout } = await execute(
    '/usr/bin/nvidia-smi',
    ['--query-compute-apps=pid,used_gpu_memory', '--format=csv,noheader,nounits'],
    { timeout: 2000, maxBuffer: 32 * 1024 },
  )
  for (const line of stdout.split('\n')) {
    const match = /^\s*(\d+),\s*(\d+)\s*$/.exec(line)
    if (!match || Number(match[1]) !== worker.pid || Number(match[2]) <= 0) continue
    try {
      const stat = await readFile(`/proc/${worker.pid}/stat`, 'utf8')
      if (stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19] === worker.startTicks) {
        return { pid: worker.pid, startTicks: worker.startTicks, usedMiB: Number(match[2]) }
      }
    } catch (error) {
      if (!['ENOENT', 'ESRCH'].includes(error.code)) throw error
    }
  }
  return null
}

async function verifyEntry(state, fixture) {
  assert.equal(fixture.family, 'illustrious')
  assert.equal(fixture.profile, 'noobai-eps')
  expectCatalog(await call(state.page, 'models', 'getCatalog'), fixture, 'epsilon')
  const status = await call(state.page, 'runtime', 'getStatus')
  assert.equal(status.kind, 'ready')
  assert.equal(status.profile, 'linux-nvidia')
  assert.equal(status.runtimeId, fixture.runtimeId)
  return status
}

async function runJob({
  state,
  trained,
  requested,
  projectFile,
  prior,
  historicalRow,
  root,
  bindWorker,
  evidenceName = `trained-${state.version === '0.2.0' ? 'b' : 'c'}-generation`,
}) {
  const { page } = state
  const { fixture, databasePath } = trained
  const { project, tab } = requested
  await expect(page.locator('input[aria-label="Images per click"]')).toHaveValue('1')
  assert.ok(!(historicalRow && prior))
  const priorRow = prior?.row ?? historicalRow
  const priorRows = priorRow ? [priorRow] : []
  const priorReceipts = prior ? [prior.receipt] : []
  const initial = snapshotDatabase(databasePath).tables
  assert.deepEqual(initial.generation_queue_item.rows, priorRows)
  assert.deepEqual(initial.generation_candidate_receipt.rows, priorReceipts)
  const initialResults = await call(page, 'projects', 'listGenerationResults', project.id)
  assert.equal(initialResults.recoveryUnavailable, false)
  assert.deepEqual(initialResults.candidates, [])
  assert.deepEqual(initialResults.unfinishedSiblingJobIds, [])

  await page.evaluate(() => {
    globalThis.signedQualificationProgress = []
    globalThis.api.projects.onGenerationProgress((event) =>
      globalThis.signedQualificationProgress.push(event),
    )
  })
  const generate = page.getByRole('button', { name: 'Generate', exact: true })
  await expect(generate).toBeEnabled({ timeout: 120_000 })
  await generate.click()

  let row
  let worker
  let enrolled = false
  const gpuSamples = []
  await expect
    .poll(
      async () => {
        const rows = snapshotDatabase(databasePath).tables.generation_queue_item.rows
        assert.deepEqual(
          rows.filter((item) => item.id === priorRow?.id),
          priorRows,
        )
        const newRows = rows.filter((item) => item.id !== priorRow?.id)
        assert.ok(newRows.length <= 1, 'Generate must admit exactly one new job.')
        row = newRows[0]
        if (!row) {
          const error = page
            .locator('.project-notices .n-alert')
            .filter({ hasText: 'Project action failed' })
          if (await error.isVisible())
            throw new Error(`Packaged Generate was refused: ${await error.innerText()}`)
          return 'awaiting-admission'
        }
        if (row.status === 'pending') return row.status
        if (row.status !== 'running') return row.status
        const current = await runningWorker({ mainPid: state.pid, checks: state.checks }, trained)
        if (current) {
          if (worker) assert.deepEqual(current, worker)
          worker = current
          if (!enrolled) {
            await bindWorker(state)
            const check = state.checks.at(-1)
            enrolled = check.processIdentities.some(
              ({ pid, start }) => pid === worker.pid && start === worker.startTicks,
            )
          }
          const sample = await sampleWorkerCuda(worker)
          if (sample) gpuSamples.push(sample)
        }
        return row.status
      },
      { timeout: 150_000, intervals: [100, 250, 500] },
    )
    .not.toMatch(/^(awaiting-admission|pending|running)$/)
  assert.equal(row.status, 'completed', JSON.stringify(row))
  assert.ok(
    worker && enrolled && gpuSamples.length,
    'Observe an enrolled installed worker on CUDA.',
  )
  await assertWorkerExited(worker)

  const results = await call(page, 'projects', 'listGenerationResults', project.id)
  assert.equal(results.recoveryUnavailable, false)
  assert.equal(results.lastActualSeed, 0)
  assert.deepEqual(results.unfinishedSiblingJobIds, [])
  assert.equal(results.candidates.length, 1)
  const [candidate] = results.candidates
  const frozen = assertFrozen(row, requested, fixture, projectFile)
  if (prior) {
    assert.notEqual(row.id, prior.row.id)
    assert.notEqual(row.staging_session_id, prior.row.staging_session_id)
    assert.notEqual(candidate.candidateId, prior.candidate.candidateId)
    assert.notDeepEqual(
      [worker.pid, worker.startTicks],
      [prior.worker.pid, prior.worker.startTicks],
    )
  }
  const receipts = snapshotDatabase(databasePath).tables.generation_candidate_receipt.rows
  assert.deepEqual(
    receipts.filter((item) => item.queue_item_id === priorRow?.id),
    priorReceipts,
  )
  assert.equal(receipts.length, priorReceipts.length + 1)
  const receipt = receipts.find((item) => item.queue_item_id === row.id)
  assert.ok(receipt)
  const evidence = path.join(root, evidenceName)
  await mkdir(evidence, { mode: 0o700 })
  await retainGeneration({
    row,
    candidate,
    frozen,
    receipt,
    root: evidence,
    dataRoot: fixture.appData,
  })
  assert.equal(frozen.context.target.sha256, control.targetSha256)
  assert.equal(receipt.image_sha256, control.outputSha256)
  if (prior) {
    // The same saved Project, draft, installed runtime and catalog survive the relaunch.
    const { originRequestId, ...execution } = frozen
    const { originRequestId: priorRequestId, ...priorExecution } = JSON.parse(
      prior.row.frozen_payload_json,
    )
    assert.match(originRequestId, /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/)
    assert.match(priorRequestId, /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/)
    assert.notEqual(originRequestId, priorRequestId)
    assert.deepEqual(execution, priorExecution)
    for (const name of ['target.png', 'candidate.png']) {
      const bytes = await readFile(path.join(evidence, name))
      assert.ok(
        bytes.equals(await readFile(path.join(prior.evidence, name))),
        `${name} changed after update.`,
      )
    }
  }
  const progress = await page.evaluate(
    (id) => globalThis.signedQualificationProgress.filter(({ current }) => current?.jobId === id),
    row.id,
  )
  assert.deepEqual([...new Set(progress.map(({ current }) => current.step))], [1, 2, 3])
  for (const { current } of progress) {
    assert.equal(current.projectKey, project.id)
    assert.equal(current.documentId, tab.documentId)
    assert.equal(current.statusSequence, receipt.expected_status_sequence)
    assert.equal(current.totalSteps, 3)
  }
  return { row, candidate, receipt, progress, worker, gpuSamples, evidence }
}

async function createSavedProject(state, trained, root, savedName) {
  const { page } = state
  const { fixture } = trained
  await page.getByRole('button', { name: 'Open Home', exact: true }).click()
  const requested = await createAndAuthor(page, fixture, root, 1)
  const { project } = requested
  requested.tab = await saveProject(page, project, requested.tab.documentRevision)
  const projectRows = snapshotDatabase(trained.databasePath).tables.project_index.rows
  const projectFile = projectRows.find(
    (row) => row.local_project_key === project.id,
  )?.canonical_path
  assert.ok(projectFile)
  assert.equal(path.dirname(projectFile), path.join(fixture.appData, 'workspaces/Uncategorized'))
  assert.equal(path.extname(projectFile), '.igs')
  const saved = await retainPackage(projectFile, path.join(root, savedName))
  const { project: savedProject } = await readIgsPackage(saved.copy.path)
  assert.equal(savedProject.documentId, requested.tab.documentId)
  assert.equal(savedProject.documentRevision, requested.tab.documentRevision)
  assert.deepEqual(savedProject.layers, [])
  return { requested, projectFile, saved }
}

export async function runSignedTrainedBefore({ state, trained, root, bindWorker }) {
  assert.equal(state.version, '0.2.0')
  const { page } = state
  const status = await verifyEntry(state, trained.fixture)
  const { requested, projectFile, saved } = await createSavedProject(
    state,
    trained,
    root,
    'trained-after-b-save.igs',
  )
  const { project } = requested
  const job = await runJob({ state, trained, requested, projectFile, root, bindWorker })
  const generated = await readTab(page, project.id)
  assert.equal(generated.dirty, false)
  assert.equal(generated.documentRevision, requested.tab.documentRevision)
  assert.deepEqual(generated.layers, [])
  assert.deepEqual(await packageWitness(projectFile), saved.original)
  await projectTab(page, project)
    .getByRole('button', { name: `Close ${project.title}`, exact: true })
    .click()
  await page
    .getByRole('dialog', { name: 'Close Project', exact: true })
    .getByRole('button', { name: 'Discard Candidates and Close', exact: true })
    .click()
  await expect(projectTab(page, project)).toBeHidden()
  const tables = snapshotDatabase(trained.databasePath).tables
  assert.deepEqual(tables.generation_queue_item.rows, [job.row])
  assert.deepEqual(tables.generation_candidate_receipt.rows, [job.receipt])
  assert.ok(
    tables.generation_staging_discarded_session.rows.some(
      (row) =>
        row.local_project_key === project.id &&
        row.staging_session_id === job.row.staging_session_id,
    ),
  )
  assert.deepEqual(await packageWitness(projectFile), saved.original)
  return { ...job, status, requested, projectId: project.id, projectFile, saved }
}

export async function runSignedTrainedAfter({
  state,
  trained,
  root,
  before,
  bindWorker,
  otherProjectTitle,
}) {
  assert.equal(state.version, '0.3.0')
  const { page } = state
  const { fixture } = trained
  const { project, tab: beforeTab } = before.requested
  const { projectFile } = before
  const status = await verifyEntry(state, fixture)
  assert.deepEqual(status, before.status)
  assert.deepEqual(await packageWitness(projectFile), before.saved.original)
  const tab = await openFromHome(page, project)
  assert.equal(tab.documentId, beforeTab.documentId)
  assert.equal(tab.documentRevision, beforeTab.documentRevision)
  assert.equal(tab.dirty, false)
  assert.deepEqual(tab.layers, [])
  assert.deepEqual(tab.generationDraft, beforeTab.generationDraft)
  // Batch size belongs to the live tab and returns to its default on reopen.
  await setInput(page, 'Images per click', 1)
  const requested = { ...before.requested, tab }
  const job = await runJob({
    state,
    trained,
    requested,
    projectFile,
    prior: before,
    root,
    bindWorker,
  })
  return await acceptAndReopen({
    state,
    trained,
    root,
    requested,
    projectFile,
    initialPackage: before.saved.original,
    savedName: 'trained-after-c-save.igs',
    status,
    job,
    otherProjectTitle,
  })
}

export async function runRepairedTrainedGeneration({
  state,
  trained,
  root,
  bindWorker,
  otherProjectTitle,
  prior,
}) {
  assert.equal(prior.status, 'canceled')
  const status = await verifyEntry(state, trained.fixture)
  const { requested, projectFile, saved } = await createSavedProject(
    state,
    trained,
    root,
    'trained-after-repair-before-generation.igs',
  )
  const job = await runJob({
    state,
    trained,
    requested,
    projectFile,
    historicalRow: prior,
    root,
    bindWorker,
    evidenceName: 'trained-after-repair-generation',
  })
  const accepted = await acceptAndReopen({
    state,
    trained,
    root,
    requested,
    projectFile,
    initialPackage: saved.original,
    savedName: 'trained-after-repair-accepted.igs',
    status,
    job,
    otherProjectTitle,
  })
  const tables = snapshotDatabase(trained.databasePath).tables
  const queue = tables.generation_queue_item.rows
  assert.equal(queue.length, 2)
  assert.deepEqual(
    queue.find(({ id }) => id === prior.id),
    prior,
  )
  assert.deepEqual(
    queue.find(({ id }) => id === job.row.id),
    job.row,
  )
  assert.deepEqual(tables.generation_candidate_receipt.rows, [job.receipt])
  const [result, ...otherResults] = tables.project_accepted_result_index.rows
  assert.equal(otherResults.length, 0)
  assert.equal(result.local_project_key, accepted.projectId)
  assert.equal(result.document_revision, accepted.reopenedRevision)
  assert.equal(result.model_file_sha256, trained.fixture.model.ref.fileSha256)
  return { ...accepted, beforeGeneration: saved, historicalQueueRow: prior, acceptedIndex: result }
}

async function acceptAndReopen({
  state,
  trained,
  root,
  requested,
  projectFile,
  initialPackage,
  savedName,
  status,
  job,
  otherProjectTitle,
}) {
  const { page } = state
  const { fixture } = trained
  const { project, tab } = requested
  assert.deepEqual(await packageWitness(projectFile), initialPackage)
  assert.deepEqual((await readTab(page, project.id)).layers, [])

  await page.getByRole('button', { name: 'Add 1 as Layer', exact: true }).click()
  await expect.poll(async () => (await readTab(page, project.id)).layers.length).toBe(1)
  const accepted = await readTab(page, project.id)
  assert.equal(accepted.dirty, true)
  const [layer] = accepted.layers
  const acceptedData = await call(
    page,
    'projects',
    'getRasterGenerationData',
    project.id,
    tab.documentId,
    layer.id,
  )
  assertPortableConfiguration(acceptedData.generationConfiguration, requested, fixture)
  assert.deepEqual(await packageWitness(projectFile), initialPackage)
  await expect
    .poll(
      async () => (await call(page, 'projects', 'listGenerationResults', project.id)).candidates,
    )
    .toEqual([])
  const savedTab = await saveProject(page, project, accepted.documentRevision)
  assert.deepEqual(savedTab.generationDraft, tab.generationDraft)
  const saved = await retainPackage(projectFile, path.join(root, savedName))
  assert.notEqual(saved.original.sha256, initialPackage.sha256)
  const { stdout } = await execute(
    trained.python,
    [
      '-I',
      '-B',
      '-c',
      inspectArchive,
      saved.copy.path,
      path.join(job.evidence, 'target.png'),
      path.join(job.evidence, 'candidate.png'),
      JSON.parse(job.row.frozen_payload_json).context.target.iccSha256,
    ],
    { timeout: 10_000, maxBuffer: 256 * 1024 },
  )
  const { manifest, project: stored, ...images } = JSON.parse(stdout)
  assert.equal(images.outputSha256, job.receipt.image_sha256)
  assert.equal(images.outputPixelSha256, control.outputPixelSha256)
  assert.equal(stored.documentRevision, savedTab.documentRevision)
  assert.equal(stored.documentId, tab.documentId)
  assert.equal(stored.lastActualSeedSnapshot, 0)
  const [storedLayer] = stored.layers
  assert.equal(storedLayer.id, layer.id)
  const provenance = storedLayer.generationProvenance
  assert.equal(provenance.kind, 'illustrious-txt2img')
  assert.deepEqual(provenance.generationConfiguration, acceptedData.generationConfiguration)
  assert.equal(provenance.layerSourceContext.sourceDocumentRevision, tab.documentRevision)
  assert.equal(provenance.layerSourceContext.sourceTargetSha256, control.targetSha256)
  assert.equal(provenance.executionResultContext.queueItemId, job.row.id)
  assert.equal(provenance.executionResultContext.candidateId, job.candidate.candidateId)
  assert.equal(provenance.executionResultContext.output.sha256, control.outputSha256)
  assert.equal(manifest.preview.status, 'rendered')

  await projectTab(page, project)
    .getByRole('button', { name: `Close ${project.title}`, exact: true })
    .click()
  await expect(projectTab(page, project)).toBeHidden()
  // Close removes the tab before the asynchronous Home list refresh releases the action.
  await expect(
    page
      .getByRole('tab', { name: otherProjectTitle, exact: true })
      .getByRole('button', { name: `Close ${otherProjectTitle}`, exact: true }),
  ).toBeEnabled({ timeout: 60_000 })
  const reopened = await openFromHome(page, project)
  assert.equal(reopened.dirty, false)
  assert.equal(reopened.documentId, tab.documentId)
  assert.equal(reopened.documentRevision, stored.documentRevision)
  assert.equal(reopened.layers.length, 1)
  assert.equal(reopened.layers[0].id, layer.id)
  assert.deepEqual(
    await call(page, 'projects', 'getRasterGenerationData', project.id, tab.documentId, layer.id),
    acceptedData,
  )
  assert.deepEqual(
    (await call(page, 'projects', 'listGenerationResults', project.id)).candidates,
    [],
  )
  assert.deepEqual(await packageWitness(projectFile), saved.original)
  return {
    ...job,
    status,
    projectId: project.id,
    projectFile,
    saved,
    images,
    provenance,
    reopenedRevision: reopened.documentRevision,
  }
}
