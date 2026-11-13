/** Real metadata-only host gate. Run via tsx in an externally bounded4GiB/zero-swap/600s unit. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import * as fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { hasUnconfirmedOfflineRuntimeCommands } from '../src/main/runtime/offline-runtime-assembly.ts'
import { preflightRuntimeHost } from '../src/main/runtime/runtime-host-preflight.ts'

const repository = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const runRoot = path.join(os.homedir(), '.codex/artifacts/imagegen-studio/runs/runtime-host-preflight')
const requirements = Object.freeze({ os: 'linux', arch: 'x64', glibcMinimum: '2.28',
  minimumNvidiaDriver: '560.0', cudaVersion: '12.6', gpuArchitectures: Object.freeze(['sm_89']) })
const report = { schemaVersion: 1, startedAt: new Date().toISOString(), outcome: 'running', checks: [],
  qualification: 'actual-production-host-metadata-preflight', fixtureRequirements: requirements,
  requirementsScope: 'Qualification fixture only; these values do not declare a supported release matrix.',
  ports: 'Real production defaults: Node host facts, absolute /usr/bin/nvidia-smi and existing command runner.',
  negativeScope: ['No system Python, Torch, tensor execution, model/runtime download or CUDA allocation.',
    'Metadata compatibility is not a qualified artifact/driver/ABI/GPU matrix or installed inference readiness.',
    'No Main installation, signing, activation, public Setup or healthy GPU-worker close is claimed.',
    'No payload deletion; owning run retains/audits and disposes only after physical-exit/reader gates.'],
  sourceBasis: { invokeRevision: '4875d96531ca6712b288f6e660fcbb34143408c1',
    invokePaths: ['invokeai/app/util/startup_utils.py', 'invokeai/app/run_app.py',
      'invokeai/backend/util/devices.py', 'invokeai/app/services/model_manager/model_manager_default.py'],
    launcherRevision: 'c267bdb439519216b277a7a8c6ad408b9d79efce',
    launcherPaths: ['src/main/gpu-detection.ts', 'src/main/index.ts'] } }
let reportFile, payloadRoot, before
const errorSummary = (error) => ({ name: error?.name, code: error?.code,
  message: String(error?.message ?? error), exitConfirmed: error?.exitConfirmed, stack: error?.stack })

async function directory(name) {
  const stat = await fs.lstat(name)
  assert.ok(stat.isDirectory() && !stat.isSymbolicLink(), 'Expected ordinary directory')
  assert.equal(await fs.realpath(name), name, 'Directory has a symlink ancestor')
}
async function absent(name) {
  await assert.rejects(fs.lstat(name), (error) => error.code === 'ENOENT')
}
async function fileEvidence(name) {
  const handle = await fs.open(name, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const original = await handle.stat({ bigint: true })
    assert.ok(original.isFile() && original.size <= 2n * 1024n ** 2n)
    const bytes = await handle.readFile(), current = await handle.stat({ bigint: true })
    const identity = (stat) => [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(':')
    assert.equal(identity(current), identity(original))
    assert.equal(identity(await fs.lstat(name, { bigint: true })), identity(original))
    return { sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length,
      identity: identity(original), text: bytes.toString('utf8') }
  } finally { await handle.close() }
}
async function freeze() {
  const files = []
  for (const relative of ['src/main/runtime/index.ts', 'src/main/runtime/runtime-host-preflight.ts',
    'src/main/runtime/offline-runtime-assembly.ts', 'scripts/qualify-runtime-host.mjs']) {
    const evidence = await fileEvidence(path.join(repository, relative))
    files.push({ path: relative, sha256: evidence.sha256, identity: evidence.identity })
  }
  return files
}
async function boundary() {
  const group = (await fs.readFile(`/proc/${process.pid}/cgroup`, 'utf8')).trim().split('\n')
    .find((line) => line.startsWith('0::'))?.slice(3)
  assert.ok(group && group !== '/' && path.isAbsolute(group) && path.normalize(group) === group)
  const root = `/sys/fs/cgroup${group}`
  const memoryMax = (await fs.readFile(path.join(root, 'memory.max'), 'utf8')).trim()
  const swapMax = (await fs.readFile(path.join(root, 'memory.swap.max'), 'utf8')).trim()
  assert.ok(/^\d+$/.test(memoryMax) && BigInt(memoryMax) > 0n && BigInt(memoryMax) <= 4n * 1024n ** 3n)
  assert.equal(swapMax, '0')
  return { pid: process.pid, group, memoryMax, swapMax, deadlineSeconds: 600,
    deadlineOwner: 'External qualification unit; this metadata does not independently inspect its deadline.',
    physicalExitOwner: 'Production command runner awaits leader close and owned-group absence; Root verifies unit exit.' }
}
async function check(name, operation) {
  const row = { name, outcome: 'running', startedAt: new Date().toISOString() }
  report.checks.push(row)
  try { row.evidence = await operation(); row.outcome = 'PASS' } catch (error) {
    row.outcome = 'FAIL'; row.error = errorSummary(error); throw error
  } finally { row.finishedAt = new Date().toISOString() }
}
async function refusal(expected, operation) {
  let rejected
  await assert.rejects(operation, (error) => {
    rejected = errorSummary(error)
    assert.equal(error.code, expected)
    assert.equal(error.exitConfirmed, true)
    return true
  })
  assert.equal(hasUnconfirmedOfflineRuntimeCommands(), false)
  return rejected
}

async function main() {
  assert.equal(process.argv.length, 4)
  assert.equal(process.argv[2], '--report-file')
  const requested = process.argv[3]
  assert.ok(path.isAbsolute(requested) && path.normalize(requested) === requested)
  assert.ok(requested.startsWith(`${runRoot}${path.sep}`) && requested.endsWith('.json'))
  await directory(runRoot)
  await directory(path.dirname(requested))
  await absent(requested)
  reportFile = requested
  report.processBoundary = await boundary()
  before = await freeze(); report.sourceBefore = before
  const payloads = path.join(path.dirname(reportFile), 'payloads')
  try { await fs.mkdir(payloads, { mode: 0o700 }) } catch (error) {
    if (error.code !== 'EEXIST') throw error
  }
  await directory(payloads)
  payloadRoot = await fs.mkdtemp(path.join(payloads, 'actual-host-'))
  await directory(payloadRoot)
  report.payloadRoot = payloadRoot
  const names = async () => (await fs.readdir(payloadRoot)).sort()
  await check('actual-default-metadata-gate-admits-fixture-requirements', async () => {
    const receipt = await preflightRuntimeHost(requirements, { logDirectory: payloadRoot })
    assert.equal(receipt.scope, 'host-preflight'); assert.equal(receipt.platform, 'linux')
    assert.equal(receipt.arch, 'x64'); assert.match(receipt.glibcVersion, /^\d+(?:\.\d+)+$/)
    assert.deepEqual(receipt.requirements, requirements)
    assert.ok(receipt.gpus.length > 0 && receipt.gpus.length <= 64)
    assert.ok(receipt.gpus.every((gpu) => gpu.architecture === 'sm_89'))
    assert.equal(path.dirname(receipt.logPath), payloadRoot)
    const log = await fileEvidence(receipt.logPath)
    const rows = log.text.trim().split(/\r?\n/).map((line) => line.split(',').map((field) => field.trim()))
    assert.equal(rows.length, receipt.gpus.length)
    for (let index = 0; index < rows.length; index += 1) {
      assert.deepEqual(rows[index], [receipt.gpus[index].driverVersion, '8.9'])
    }
    assert.equal(hasUnconfirmedOfflineRuntimeCommands(), false)
    report.receipt = receipt
    return { receipt, log, executor: 'Production default; no commandRunner/readHost/executable override.' }
  })
  await check('actual-driver-query-refuses-unattainable-fixture-floor', async () => {
    const previous = await names()
    const error = await refusal('RUNTIME_HOST_DRIVER_UNSUPPORTED', () =>
      preflightRuntimeHost({ ...requirements, minimumNvidiaDriver: '99999.0' }, { logDirectory: payloadRoot }))
    const added = (await names()).filter((name) => !previous.includes(name)); assert.equal(added.length, 1)
    const logPath = path.join(payloadRoot, added[0]), log = await fileEvidence(logPath)
    assert.ok(log.bytes > 0); assert.match(log.text, /,\s*8\.9/)
    return { error, logPath, log, floorScope: 'Deliberate refusal control, not a supported driver floor.' }
  })
  await check('actual-Node-glibc-refuses-before-command-or-log', async () => {
    const previous = await names()
    const error = await refusal('RUNTIME_HOST_GLIBC_UNSUPPORTED', () =>
      preflightRuntimeHost({ ...requirements, glibcMinimum: '999.0' }, { logDirectory: payloadRoot }))
    assert.deepEqual(await names(), previous)
    return { error, noNewLog: true }
  })
  await check('already-canceled-gate-does-not-start-query-or-create-log', async () => {
    const previous = await names(), controller = new AbortController(); controller.abort()
    const error = await refusal('RUNTIME_HOST_CANCELED', () =>
      preflightRuntimeHost(requirements, { logDirectory: payloadRoot, signal: controller.signal }))
    assert.deepEqual(await names(), previous)
    return { error, noNewLog: true }
  })
  assert.deepEqual(await freeze(), before)
  assert.equal(hasUnconfirmedOfflineRuntimeCommands(), false)
  report.outcome = 'PASS'
}
try { await main() } catch (error) {
  report.outcome = 'FAIL'; report.error = errorSummary(error); process.exitCode = 1
} finally {
  if (before) {
    try { report.sourceAfter = await freeze(); assert.deepEqual(report.sourceAfter, before); report.sourceUnchanged = true } catch (error) {
      report.outcome = 'FAIL'; report.sourceAuditError = errorSummary(error); process.exitCode = 1
    }
  }
  report.unconfirmedCommands = hasUnconfirmedOfflineRuntimeCommands()
  if (report.unconfirmedCommands) { report.outcome = 'FAIL'; process.exitCode = 1 }
  report.finishedAt = new Date().toISOString()
  report.cleanup = { action: 'none', payloadRoot, retained: true }
  if (reportFile) await fs.writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
  process.stdout.write(`${JSON.stringify({ outcome: report.outcome, checks: report.checks.map(({ name, outcome }) => ({ name, outcome })), reportFile })}\n`)
}
