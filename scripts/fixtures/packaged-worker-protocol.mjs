import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { lstat, readFile, readdir, readlink, realpath } from 'node:fs/promises'
import path from 'node:path'

import { expect } from '@playwright/test'

import { snapshotDatabase } from './application-state-upgrade-fixture.mjs'

const protocolModule = '__init__.py'
const runtimeDetail = 'The installed Linux/NVIDIA image runtime failed its worker self-test.'
const repairReason = 'Use Repair in the image generation notice above before generating.'

function assertReadOnlyMount(mounts, target) {
  const entries = mounts.filter((entry) => entry[4] === target)
  assert.equal(entries.length, 1, target)
  assert.ok(entries[0][5].split(',').includes('ro'), target)
}

export async function readPackagedWorkerProtocol({
  filename,
  root,
  appImage,
  engineRun,
  appData,
  workerRoot,
  identity,
}) {
  const run = path.dirname(root)
  assert.ok(run.startsWith(`${engineRun}${path.sep}`))
  assert.equal(filename, path.join(run, 'protocol-fixture.json'))
  assert.equal(await realpath(filename), filename)
  const entry = await lstat(filename)
  assert.ok(
    entry.isFile() && entry.nlink === 1 && entry.uid === process.getuid() && entry.size <= 4096,
  )
  const descriptor = await identity(filename)
  const { schemaVersion, protocol, packageIdentity } = JSON.parse(await readFile(filename, 'utf8'))
  assert.equal(schemaVersion, 1)
  assert.ok(protocol === '1' || protocol === '2')
  assert.deepEqual(await identity(appImage), packageIdentity)
  const state = await lstat(path.join(run, 'state'), { bigint: true })
  const visible = await lstat(appData, { bigint: true })
  assert.ok(state.isDirectory() && state.uid === BigInt(process.getuid()))
  assert.equal(state.ino, visible.ino)
  assert.equal(state.dev, visible.dev)
  assert.equal(await realpath(appData), appData)
  const mounts = (await readFile('/proc/self/mountinfo', 'utf8'))
    .trim()
    .split('\n')
    .map((line) => line.split(' '))
  assertReadOnlyMount(mounts, path.join(appData, 'runtime/python'))
  const environments = path.join(appData, 'runtime/environments')
  assertReadOnlyMount(mounts, environments)
  const originalModule = path.join(
    run,
    'environments',
    path.relative(environments, workerRoot),
    protocolModule,
  )
  const activeModule = path.join(workerRoot, protocolModule)
  const original = await identity(originalModule)
  const active = await identity(activeModule)
  const originalBytes = await readFile(originalModule, 'utf8')
  const originalLine = 'PROTOCOL_VERSION = "1"\n'
  const alternateLine = 'PROTOCOL_VERSION = "2"  # isolated qualification value\n'
  assert.equal(originalBytes.split(originalLine).length, 2)
  assert.equal(
    await readFile(activeModule, 'utf8'),
    protocol === '2' ? originalBytes.replace(originalLine, alternateLine) : originalBytes,
  )
  if (protocol === '2') assertReadOnlyMount(mounts, activeModule)
  assert.deepEqual(await identity(filename), descriptor)
  return { protocol, packageIdentity, original, inputs: [descriptor, original, active] }
}

export async function inspectProtocolMain(pid) {
  const [argv, status, mountNamespace] = await Promise.all([
    readFile(`/proc/${pid}/cmdline`, 'utf8'),
    readFile(`/proc/${pid}/status`, 'utf8'),
    readlink(`/proc/${pid}/ns/mnt`),
  ])
  assert.equal(mountNamespace, await readlink('/proc/self/ns/mnt'))
  assert.ok(!argv.split('\0').some((arg) => /^--(?:no-sandbox|disable-.*sandbox)(?:=|$)/.test(arg)))
  assert.match(status, /^CapEff:\s*0+$/m)
  assert.match(status, /^CapAmb:\s*0+$/m)
  return { mountNamespace, sandboxDisableFlag: false }
}

async function retainedGenerationFiles(appData) {
  const entries = []
  async function visit(relative, depth) {
    assert.ok(depth <= 6 && entries.length <= 64)
    const file = path.join(appData, relative)
    const info = await lstat(file).catch((error) => {
      if (depth === 0 && error.code === 'ENOENT') return null
      throw error
    })
    if (!info) return
    if (info.isDirectory()) {
      entries.push({ relative, kind: 'directory' })
      for (const child of (await readdir(file)).sort())
        await visit(path.join(relative, child), depth + 1)
    } else {
      assert.ok(info.isFile() && info.size <= 8 * 1024 * 1024, relative)
      entries.push({
        relative,
        sha256: createHash('sha256')
          .update(await readFile(file))
          .digest('hex'),
      })
    }
  }
  for (const root of [
    'generation-inputs',
    'recovery/generation-staging',
    'recovery/smart-patch-staging',
  ]) {
    await visit(root, 0)
  }
  return entries
}

export async function assertProtocolUnavailable(state, tab, queue, appData) {
  const { page } = state
  const notice = page.getByRole('region', { name: 'Image generation status', exact: true })
  await expect(notice.getByRole('button', { name: 'Repair', exact: true })).toBeEnabled()
  const detail = notice.getByText(runtimeDetail, { exact: true })
  if (!(await detail.isVisible())) await notice.getByText('Details', { exact: true }).click()
  await expect(detail).toBeVisible()
  await expect(page.getByRole('button', { name: 'Generate', exact: true })).toBeDisabled()
  assert.equal(tab.generationDraft.model, null)
  await expect(
    page.getByText('Choose an installed model before generating.', { exact: true }),
  ).toBeVisible()
  const database = path.join(appData, 'database/app.sqlite')
  const before = snapshotDatabase(database)
  const files = await retainedGenerationFiles(appData)
  const generated = await page.evaluate(
    ({ id, documentId }) => globalThis.api.projects.generate(id, { documentId, iterations: 1 }),
    { id: tab.id, documentId: tab.documentId },
  )
  assert.equal(generated.ok, false, JSON.stringify(generated))
  assert.equal(generated.error.code, 'GENERATION_RUNTIME_UNAVAILABLE')
  let retry
  if (queue) {
    await page.getByRole('button', { name: 'Open Queue Manager', exact: true }).click()
    const manager = page.getByRole('dialog', { name: 'Queue Manager', exact: true })
    const row = manager
      .getByTestId('queue-job-row')
      .and(manager.locator(`[data-job-id="${queue.id}"]`))
    await expect(row).toHaveAttribute('data-status', 'canceled')
    await expect(row.getByRole('button', { name: 'Retry job', exact: true })).toBeDisabled()
    await expect(row.getByText(repairReason, { exact: true })).toBeVisible()
    retry = await page.evaluate((review) => globalThis.api.projects.retryGenerationJob(review), {
      id: queue.id,
      statusSequence: queue.statusSequence,
    })
    assert.equal(retry.ok, false, JSON.stringify(retry))
    assert.equal(retry.error.code, 'GENERATION_RUNTIME_UNAVAILABLE')
    await manager.getByRole('button', { name: 'Close Queue Manager', exact: true }).click()
  }
  assert.deepEqual(snapshotDatabase(database), before)
  assert.deepEqual(await retainedGenerationFiles(appData), files)
  const proof = {
    lifetime: state.name,
    generated,
    retry,
    queueRows: before.tables.generation_queue_item.rows.length,
    files,
  }
  state.protocolRefusal = proof
  return proof
}

export async function saveProtocolProject(page, tab) {
  const readTab = async () => {
    const result = await page.evaluate((id) => globalThis.api.projects.open(id), tab.id)
    assert.equal(result.ok, true, JSON.stringify(result))
    assert.equal(result.value.kind, 'opened')
    return result.value.tab
  }
  const prompt = 'Saved with an incompatible installed image worker.'
  await page.getByRole('textbox', { name: 'Positive prompt', exact: true }).fill(prompt)
  await expect.poll(async () => (await readTab()).dirty).toBe(true)
  await page.getByRole('button', { name: 'Save Project', exact: true }).click()
  await expect.poll(async () => (await readTab()).dirty).toBe(false)
  const saved = await readTab()
  assert.equal(saved.documentId, tab.documentId)
  assert.notEqual(saved.documentRevision, tab.documentRevision)
  assert.equal(saved.generationDraft.positivePrompt.text, prompt)
  assert.equal(saved.autosaveError, null)
  return saved
}

export { runtimeDetail }
