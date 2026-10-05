/** Actual qualification CLI preflight/filesystem checks; no Electron, model copy or ML execution. */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import * as fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const repository = path.dirname(import.meta.dirname)
const script = path.join(repository, 'scripts/qualify-installed-generation.mjs')

async function fixture(use) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'igs-qualification-preflight-'))
  const appData = path.join(root, 'data/imagegen-studio')
  const artifacts = path.join(root, 'artifacts')
  const runtimeId = 'controlled-preflight'
  const executable = path.join(appData, 'runtime/environments', runtimeId, 'bin/python')
  const invoked = path.join(root, 'worker-invoked')
  await fs.mkdir(path.dirname(executable), { recursive: true })
  // A minimum marker/pointer fixture, not a qualified runtime. If a bug starts this sentinel
  // instead of stopping at the deliberately invalid image size, it exits without loading ML.
  await fs.writeFile(executable, `#!/bin/sh\nprintf 'invoked\\n' > '${invoked}'\nexit 93\n`, {
    mode: 0o700,
  })
  const marker = JSON.stringify({ status: 'passed', appData, runtimeId })
  const pointer = JSON.stringify({ schemaVersion: 1, runtimeId, pythonExecutable: executable })
  await fs.writeFile(path.join(appData, 'qualification-runtime.json'), marker)
  await fs.writeFile(path.join(appData, 'runtime/current-runtime.json'), pointer)
  const input = { schemaVersion: 1, appData, artifacts, side: 65, steps: 2 }
  const fixturePath = path.join(root, 'fixture.json')
  async function run() {
    await fs.writeFile(fixturePath, JSON.stringify(input))
    let refusal
    await assert.rejects(
      exec(process.execPath, ['--import', 'tsx', script, '--fixture', fixturePath], {
        cwd: repository,
        timeout: 15_000,
      }),
      (error) => {
        assert.equal(error.code, 1)
        refusal = error
        return true
      },
    )
    await assert.rejects(fs.lstat(invoked), { code: 'ENOENT' })
    assert.equal(
      await fs.readFile(path.join(appData, 'qualification-runtime.json'), 'utf8'),
      marker,
    )
    assert.equal(
      await fs.readFile(path.join(appData, 'runtime/current-runtime.json'), 'utf8'),
      pointer,
    )
    return refusal
  }
  try {
    await use({ root, appData, artifacts, input, run })
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
}

test('fresh canonical destinations reserve a failed preflight report without starting the worker', async () => {
  // Boundary: actual CLI setup and report writer. Neighbor: directory/report refusals below.
  // The image size intentionally stops the real CLI after preflight, before any catalog/ML work.
  await fixture(async ({ appData, artifacts, run }) => {
    await run()
    assert.equal(await fs.realpath(path.join(appData, 'models')), path.join(appData, 'models'))
    assert.equal(await fs.realpath(artifacts), artifacts)
    const evidence = JSON.parse(await fs.readFile(path.join(artifacts, 'report.json'), 'utf8'))
    assert.equal(evidence.status, 'failed')
    assert.deepEqual(evidence.models, [])
    assert.deepEqual(evidence.generations, [])
    assert.equal(evidence.appData, appData)
    assert.match(evidence.error, /AssertionError/)
    await assert.rejects(fs.lstat(path.join(artifacts, 'electron-main.log')), { code: 'ENOENT' })
  })
})

test('a redirected models destination refuses before reserving or writing any report', async () => {
  // Mutation: omit the canonical models guard and publish a report for an unsafe destination.
  await fixture(async ({ root, appData, artifacts, run }) => {
    const external = path.join(root, 'external-models')
    await fs.mkdir(external)
    await fs.writeFile(path.join(external, 'sentinel'), 'unrelated model directory\n')
    await fs.symlink(external, path.join(appData, 'models'))
    const refusal = await run()
    assert.deepEqual(await fs.readdir(external), ['sentinel'])
    assert.equal(
      await fs.readFile(path.join(external, 'sentinel'), 'utf8'),
      'unrelated model directory\n',
    )
    await assert.rejects(fs.lstat(path.join(artifacts, 'report.json')), { code: 'ENOENT' })
    assert.match(refusal.stderr, /canonical directory/)
  })
})

test('a redirected artifacts destination refuses before publishing an external report', async () => {
  // Mutation: allow an artifacts symlink and create a new report in its unrelated target.
  await fixture(async ({ root, artifacts, run }) => {
    const external = path.join(root, 'external-artifacts')
    await fs.mkdir(external)
    await fs.writeFile(path.join(external, 'sentinel'), 'unrelated artifacts directory\n')
    await fs.symlink(external, artifacts)
    const refusal = await run()
    assert.deepEqual(await fs.readdir(external), ['sentinel'])
    assert.equal(
      await fs.readFile(path.join(external, 'sentinel'), 'utf8'),
      'unrelated artifacts directory\n',
    )
    await assert.rejects(fs.lstat(path.join(external, 'report.json')), { code: 'ENOENT' })
    assert.match(refusal.stderr, /canonical directory/)
  })
})

test('a redirected artifacts parent refuses before creating a directory outside the fixture', async () => {
  // Mutation: recursively mkdir through an unchecked parent, creating an external output dir.
  await fixture(async ({ root, input, run }) => {
    const external = path.join(root, 'external-parent')
    const linked = path.join(root, 'linked-parent')
    await fs.mkdir(external)
    await fs.writeFile(path.join(external, 'sentinel'), 'unrelated parent\n')
    await fs.symlink(external, linked)
    input.artifacts = path.join(linked, 'outputs')
    const refusal = await run()
    assert.deepEqual(await fs.readdir(external), ['sentinel'])
    assert.equal(await fs.readFile(path.join(external, 'sentinel'), 'utf8'), 'unrelated parent\n')
    assert.match(refusal.stderr, /canonical directory/)
  })
})

test('an existing report refuses without replacing previous qualification evidence', async () => {
  // Mutation: replace exclusive report reservation with truncating open/write.
  await fixture(async ({ artifacts, run }) => {
    await fs.mkdir(artifacts)
    const report = path.join(artifacts, 'report.json')
    await fs.writeFile(report, 'previous qualification evidence\n')
    const refusal = await run()
    assert.equal(await fs.readFile(report, 'utf8'), 'previous qualification evidence\n')
    assert.deepEqual(await fs.readdir(artifacts), ['report.json'])
    assert.match(refusal.stderr, /EEXIST/)
  })
})

test('a report symlink refuses without truncating its unrelated target', async () => {
  await fixture(async ({ root, artifacts, run }) => {
    await fs.mkdir(artifacts)
    const external = path.join(root, 'unrelated-report.json')
    await fs.writeFile(external, 'unrelated evidence outside the artifacts directory\n')
    await fs.symlink(external, path.join(artifacts, 'report.json'))
    const refusal = await run()
    assert.equal(
      await fs.readFile(external, 'utf8'),
      'unrelated evidence outside the artifacts directory\n',
    )
    assert.equal((await fs.lstat(path.join(artifacts, 'report.json'))).isSymbolicLink(), true)
    assert.match(refusal.stderr, /EEXIST/)
  })
})
