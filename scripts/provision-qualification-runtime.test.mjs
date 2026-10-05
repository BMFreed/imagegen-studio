/** Refusal checks through the real CLI; no dependency install, source copy, ML imports or GPU. */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import * as fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const script = path.resolve(import.meta.dirname, 'provision-qualification-runtime.mjs')
const shellLiteral = (value) => `'${value.replaceAll("'", "'\\''")}'`
const metadataProgram = (metadata, invoked) =>
  `#!/bin/sh\nprintf 'invoked\\n' >> ${shellLiteral(invoked)}\nprintf '%s\\n' ${shellLiteral(JSON.stringify(metadata))}\n`

async function fixture(run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'igs-provision-refusal-'))
  const python = path.join(root, 'python')
  const config = path.join(root, 'config')
  const uv = path.join(root, 'uv')
  const pythonInvoked = path.join(root, 'python-invoked')
  const uvInvoked = path.join(root, 'uv-invoked')
  await fs.mkdir(path.join(python, 'bin'), { recursive: true })
  await fs.mkdir(config)
  // Only a controlled invalid metadata producer; it cannot reach install/qualification.
  await fs.writeFile(
    path.join(python, 'bin', 'python3.12'),
    metadataProgram({ version: '3.11.0', prefix: python }, pythonInvoked),
    { mode: 0o700 },
  )
  await fs.writeFile(
    uv,
    `#!/bin/sh\nprintf 'invoked\\n' >> ${shellLiteral(uvInvoked)}\nexit 92\n`,
    { mode: 0o700 },
  )
  const appData = path.join(root, 'app-data')
  const report = path.join(root, 'report.json')
  const args = [
    '--app-data',
    appData,
    '--runtime-id',
    'refusal-test',
    '--managed-python',
    python,
    '--sdxl-config',
    config,
    '--uv',
    uv,
    '--report',
    report,
    '--activate',
  ]
  try {
    await run({ root, python, pythonInvoked, uvInvoked, appData, report, args })
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
}

async function refused(args) {
  let refusal
  await assert.rejects(exec(process.execPath, [script, ...args], { timeout: 15_000 }), (error) => {
    assert.equal(error.code, 1)
    assert.equal(error.stdout, '')
    refusal = error
    return true
  })
  return refusal
}

async function notInvoked(marker, action) {
  const invoked = await fs.lstat(marker).then(
    () => true,
    (error) => {
      if (error.code === 'ENOENT') {
        return false
      }
      throw error
    },
  )
  assert.equal(invoked, false, `${action} must not execute before this guard refuses`)
}

test('Provisioning refuses an existing app-data tree before touching its active pointer', async () => {
  await fixture(async ({ appData, report, pythonInvoked, uvInvoked, args }) => {
    const runtime = path.join(appData, 'runtime')
    await fs.mkdir(runtime, { recursive: true })
    const pointer = path.join(runtime, 'current-runtime.json')
    const original = '{"schemaVersion":1,"runtimeId":"already-active"}\n'
    await fs.writeFile(pointer, original)
    const refusal = await refused(args)
    await notInvoked(pythonInvoked, 'Existing-target Python metadata')
    await notInvoked(uvInvoked, 'Existing-target uv')
    assert.equal(await fs.readFile(pointer, 'utf8'), original)
    assert.deepEqual(await fs.readdir(runtime), ['current-runtime.json'])
    await assert.rejects(fs.lstat(report), { code: 'ENOENT' })
    assert.match(refusal.stderr, /Refusing existing path:/)
  })
})

test('Provisioning refuses reused report and noncanonical parent without creating app data', async () => {
  await fixture(async ({ root, appData, report, pythonInvoked, uvInvoked, args }) => {
    await fs.writeFile(report, 'previous evidence\n')
    const reportRefusal = await refused(args)
    await notInvoked(pythonInvoked, 'Existing-report Python metadata')
    await notInvoked(uvInvoked, 'Existing-report uv')
    assert.equal(await fs.readFile(report, 'utf8'), 'previous evidence\n')
    await assert.rejects(fs.lstat(appData), { code: 'ENOENT' })
    assert.match(reportRefusal.stderr, /Refusing existing path:/)
    await fs.unlink(report)
    const linkedParent = path.join(root, 'linked')
    await fs.symlink(root, linkedParent)
    const linkedArgs = [...args]
    linkedArgs[1] = path.join(linkedParent, 'app-data')
    const parentRefusal = await refused(linkedArgs)
    await notInvoked(pythonInvoked, 'Noncanonical-parent Python metadata')
    await notInvoked(uvInvoked, 'Noncanonical-parent uv')
    await assert.rejects(fs.lstat(appData), { code: 'ENOENT' })
    await assert.rejects(fs.lstat(report), { code: 'ENOENT' })
    assert.match(parentRefusal.stderr, /Expected a canonical directory:/)
  })
})

test('A new isolated target reaches the actual source-version gate and preserves its failure report', async () => {
  await fixture(async ({ appData, report, pythonInvoked, uvInvoked, args }) => {
    const refusal = await refused(args)
    await notInvoked(uvInvoked, 'Wrong-version uv')
    assert.equal(await fs.readFile(pythonInvoked, 'utf8'), 'invoked\n')
    await assert.rejects(fs.lstat(appData), { code: 'ENOENT' })
    const evidence = JSON.parse(await fs.readFile(report, 'utf8'))
    assert.equal(evidence.status, 'failed')
    assert.equal(evidence.activated, false)
    assert.equal(evidence.appData, appData)
    assert.equal(evidence.confirmedWorkerExit, true)
    assert.match(evidence.error, /standalone managed CPython 3\.12\.13/)
    assert.match(refusal.stderr, /standalone managed CPython 3\.12\.13/)
  })
})

test('A correct Python version with an external base prefix is refused before source capture', async () => {
  await fixture(async ({ python, appData, report, pythonInvoked, uvInvoked, args }) => {
    await fs.writeFile(
      path.join(python, 'bin', 'python3.12'),
      metadataProgram({ version: '3.12.13', prefix: '/external-python' }, pythonInvoked),
      { mode: 0o700 },
    )
    const refusal = await refused(args)
    await notInvoked(uvInvoked, 'External-prefix uv')
    assert.equal(await fs.readFile(pythonInvoked, 'utf8'), 'invoked\n')
    await assert.rejects(fs.lstat(appData), { code: 'ENOENT' })
    const evidence = JSON.parse(await fs.readFile(report, 'utf8'))
    assert.equal(evidence.status, 'failed')
    assert.equal(evidence.activated, false)
    assert.match(refusal.stderr, /standalone managed CPython 3\.12\.13/)
  })
})

test('correct source metadata reaches the controlled uv refusal before any installation', async () => {
  await fixture(async ({ python, appData, report, pythonInvoked, uvInvoked, args }) => {
    await fs.writeFile(
      path.join(python, 'bin', 'python3.12'),
      metadataProgram({ version: '3.12.13', prefix: python }, pythonInvoked),
      { mode: 0o700 },
    )
    await refused(args)
    assert.equal(await fs.readFile(pythonInvoked, 'utf8'), 'invoked\n')
    assert.equal(await fs.readFile(uvInvoked, 'utf8'), 'invoked\n')
    await assert.rejects(fs.lstat(appData), { code: 'ENOENT' })
    const evidence = JSON.parse(await fs.readFile(report, 'utf8'))
    assert.equal(evidence.status, 'failed')
    assert.equal(evidence.activated, false)
  })
})

test('Relative destinations, unsafe runtime IDs and missing required options are refused before work', async () => {
  await fixture(async ({ appData, report, pythonInvoked, uvInvoked, args }) => {
    const relative = [...args]
    relative[1] = 'relative-app-data'
    const relativeRefusal = await refused(relative)
    const unsafe = [...args]
    unsafe[3] = '../active'
    const unsafeRefusal = await refused(unsafe)
    const missingRefusal = await refused([])
    await notInvoked(pythonInvoked, 'Invalid-arguments Python metadata')
    await notInvoked(uvInvoked, 'Invalid-arguments uv')
    await assert.rejects(fs.lstat(appData), { code: 'ENOENT' })
    await assert.rejects(fs.lstat(report), { code: 'ENOENT' })
    assert.match(relativeRefusal.stderr, /absolute normalized path/)
    assert.match(unsafeRefusal.stderr, /runtime ID is invalid/)
    assert.match(missingRefusal.stderr, /Required argument: --app-data/)
  })
})
