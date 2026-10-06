/** Actual qualification CLI preflight/filesystem checks; no Electron, model copy or ML execution. */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import * as fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { promisify } from 'node:util'

import { LAMA_OUTPAINT_ARTIFACT } from '../src/main/runtime/lama-manifest.ts'

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
  async function run(options = {}) {
    await fs.writeFile(fixturePath, JSON.stringify(input))
    let refusal
    await assert.rejects(
      exec(
        process.execPath,
        [
          '--import',
          'tsx',
          script,
          '--fixture',
          fixturePath,
          ...(options.resume ? ['--resume'] : []),
        ],
        {
          cwd: repository,
          timeout: 15_000,
        },
      ),
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

test('omitted, CFG Rescale, outpaint and VAE Precision profiles reach the neighboring size refusal without starting a worker', async () => {
  // Boundary: real CLI fixture admission. The invalid image side is a controlled stop after
  // profile validation, so accepting a profile does not launch Electron or inference.
  for (const profile of [undefined, 'cfg-rescale', 'outpaint', 'vae-precision']) {
    await fixture(async ({ artifacts, input, run }) => {
      if (profile !== undefined) input.profile = profile
      input.steps = 3
      const refusal = await run()
      assert.match(refusal.stderr, /Qualification image side must be/)
      assert.doesNotMatch(refusal.stderr, /Qualification profile must be/)
      const report = JSON.parse(await fs.readFile(path.join(artifacts, 'report.json'), 'utf8'))
      assert.equal(report.status, 'failed')
      assert.equal(report.profile, profile ?? 'default')
      assert.deepEqual(report.models, [])
      assert.deepEqual(report.generations, [])
      await assert.rejects(fs.lstat(path.join(artifacts, 'electron-main.log')), { code: 'ENOENT' })
    })
  }
})

test('unknown or malformed explicit profiles refuse before catalog and worker setup', async () => {
  // Neighbor: accepted finite profiles above. Mutation: ignore the explicit profile
  // or coerce it, silently launching the default suite instead of the requested finite scenario.
  for (const profile of [
    null,
    true,
    0,
    '',
    'default',
    'cfg_rescale',
    'vae_precision',
    'VAE-Precision',
    {},
    ['cfg-rescale'],
  ]) {
    await fixture(async ({ artifacts, input, run }) => {
      input.profile = profile
      const refusal = await run()
      assert.match(
        refusal.stderr,
        /Qualification profile must be omitted or exactly cfg-rescale, outpaint or vae-precision/,
      )
      assert.doesNotMatch(refusal.stderr, /Qualification image side must be/)
      const report = JSON.parse(await fs.readFile(path.join(artifacts, 'report.json'), 'utf8'))
      assert.equal(report.status, 'failed')
      assert.deepEqual(report.models, [])
      assert.deepEqual(report.generations, [])
      await assert.rejects(fs.lstat(path.join(artifacts, 'electron-main.log')), { code: 'ENOENT' })
    })
  }
})

test('CFG Rescale profile refuses a changed step control before preparing any model', async () => {
  // Boundary: fixed ablation conditions in the actual CLI. Mutation: accept another step count
  // and report it as the declared three-step qualification. Missing models remain a later stop.
  await fixture(async ({ artifacts, input, run }) => {
    input.profile = 'cfg-rescale'
    input.side = 64
    input.steps = 2
    const refusal = await run()
    assert.match(refusal.stderr, /CFG Rescale qualification requires exactly 3 authored steps/)
    const report = JSON.parse(await fs.readFile(path.join(artifacts, 'report.json'), 'utf8'))
    assert.equal(report.status, 'failed')
    assert.deepEqual(report.models, [])
    assert.deepEqual(report.generations, [])
    await assert.rejects(fs.lstat(path.join(artifacts, 'electron-main.log')), { code: 'ENOENT' })
  })
})

test('VAE Precision profile refuses changed geometry, steps and malformed numeric controls before catalog or worker setup', async () => {
  // Boundary: actual CLI finite-profile admission. Neighbor: exact 256/3 controls below reach
  // the selected-model preflight. Mutations: silently run the default suite, widen this profile
  // or coerce boolean/null/string parameters into the declared trained qualification controls.
  for (const [change, message] of [
    [{ side: 128 }, /VAE Precision qualification requires exactly 256 pixels/],
    [{ side: 512 }, /VAE Precision qualification requires exactly 256 pixels/],
    [{ steps: 2 }, /VAE Precision qualification requires exactly 3 authored steps/],
    [{ steps: 4 }, /VAE Precision qualification requires exactly 3 authored steps/],
    [{ side: true }, /Qualification image side must be/],
    [{ side: null }, /Qualification image side must be/],
    [{ side: '256' }, /Qualification image side must be/],
    [{ steps: true }, /AssertionError/],
    [{ steps: null }, /AssertionError/],
    [{ steps: '3' }, /AssertionError/],
  ]) {
    await fixture(async ({ appData, artifacts, input, run }) => {
      Object.assign(input, { profile: 'vae-precision', side: 256, steps: 3 }, change)
      const refusal = await run()
      assert.match(refusal.stderr, message)
      assert.doesNotMatch(refusal.stderr, /Qualification profile must be/)
      assert.doesNotMatch(refusal.stderr, /checkpoint|requires one real LoRA/)
      const report = JSON.parse(await fs.readFile(path.join(artifacts, 'report.json'), 'utf8'))
      assert.equal(report.status, 'failed')
      assert.equal(report.profile, 'vae-precision')
      assert.deepEqual(report.models, [])
      assert.deepEqual(report.generations, [])
      assert.deepEqual(await fs.readdir(path.join(appData, 'models')), [])
      await assert.rejects(fs.lstat(path.join(appData, 'database')), { code: 'ENOENT' })
      await assert.rejects(fs.lstat(path.join(artifacts, 'electron-main.log')), { code: 'ENOENT' })
    })
  }
})

test('VAE Precision exact 256/3 controls without new fixture fields reach the selected Illustrious model refusal', async () => {
  // The real CLI passes profile and numeric validation, then stops at its intentionally absent
  // checkpoint. This proves admission without copying substitute weights or starting Electron.
  await fixture(async ({ appData, artifacts, input, run }) => {
    Object.assign(input, { profile: 'vae-precision', side: 256, steps: 3 })
    const refusal = await run({ resume: true })
    assert.match(refusal.stderr, /checkpoint/)
    assert.doesNotMatch(
      refusal.stderr,
      /Qualification profile must be|Qualification image side must be|VAE Precision qualification requires/,
    )
    const report = JSON.parse(await fs.readFile(path.join(artifacts, 'report.json'), 'utf8'))
    assert.equal(report.status, 'failed')
    assert.equal(report.profile, 'vae-precision')
    assert.deepEqual(report.models, [])
    assert.deepEqual(report.generations, [])
    assert.deepEqual(await fs.readdir(path.join(appData, 'models')), [])
    await assert.rejects(fs.lstat(path.join(appData, 'database')), { code: 'ENOENT' })
    await assert.rejects(fs.lstat(path.join(artifacts, 'electron-main.log')), { code: 'ENOENT' })
  })
})

test('VAE Precision selected Illustrious resources require resume before catalog, source or worker setup', async () => {
  // Boundary: actual CLI operational gate, after valid profile/selected-family controls. These
  // incomplete model descriptors deliberately stop before any real source path or worker use.
  // Mutation: admit fresh catalogs and copy resources while claiming the six-resource reuse run.
  await fixture(async ({ appData, artifacts, input, run }) => {
    Object.assign(input, {
      profile: 'vae-precision',
      side: 256,
      steps: 3,
      illustrious: { type: 'checkpoint', family: 'illustrious' },
      illustriousLora: { type: 'lora', family: 'illustrious' },
    })
    const refusal = await run()
    assert.match(
      refusal.stderr,
      /VAE Precision qualification must resume the same six-resource catalog/,
    )
    assert.doesNotMatch(
      refusal.stderr,
      /Qualification profile must be|VAE Precision qualification requires/,
    )
    const report = JSON.parse(await fs.readFile(path.join(artifacts, 'report.json'), 'utf8'))
    assert.equal(report.status, 'failed')
    assert.equal(report.profile, 'vae-precision')
    assert.deepEqual(report.models, [])
    assert.deepEqual(report.generations, [])
    assert.deepEqual(await fs.readdir(path.join(appData, 'models')), [])
    await assert.rejects(fs.lstat(path.join(appData, 'database')), { code: 'ENOENT' })
    await assert.rejects(fs.lstat(path.join(artifacts, 'electron-main.log')), { code: 'ENOENT' })
  })
})

test('outpaint profile refuses changed geometry, steps and LaMa pins before model or worker setup', async () => {
  // Boundary: actual CLI finite profile/resource admission. Neighbor: the accepted profile above
  // reaches generic geometry validation. Mutations: expand the profile or accept an altered pin.
  for (const [change, message] of [
    [{ side: 128 }, /Outpaint qualification requires exactly 256 pixels/],
    [{ steps: 4 }, /Outpaint qualification requires exactly 3 authored steps/],
    [{ lama: null }, /requires an exact local LaMa descriptor/],
    [
      { lama: { path: '/unread-source', byteSize: 1, sha256: LAMA_OUTPAINT_ARTIFACT.sha256 } },
      /LaMa size must match/,
    ],
    [
      {
        lama: {
          path: '/unread-source',
          byteSize: LAMA_OUTPAINT_ARTIFACT.sizeBytes,
          sha256: '0'.repeat(64),
        },
      },
      /LaMa SHA-256 must match/,
    ],
    [
      {
        lama: {
          path: 'relative.pt',
          byteSize: LAMA_OUTPAINT_ARTIFACT.sizeBytes,
          sha256: LAMA_OUTPAINT_ARTIFACT.sha256,
        },
      },
      /absolute normalized read-only path/,
    ],
  ]) {
    await fixture(async ({ artifacts, input, run }) => {
      Object.assign(input, { profile: 'outpaint', side: 256, steps: 3 }, change)
      const refusal = await run()
      assert.match(refusal.stderr, message)
      const report = JSON.parse(await fs.readFile(path.join(artifacts, 'report.json'), 'utf8'))
      assert.equal(report.status, 'failed')
      assert.deepEqual(report.models, [])
      assert.deepEqual(report.generations, [])
      await assert.rejects(fs.lstat(path.join(artifacts, 'electron-main.log')), { code: 'ENOENT' })
    })
  }
})

test('outpaint exact local source verification refuses wrong bytes or symlink before catalog and preserves source', async () => {
  // This exercises the real CLI and fixed production verifier, with no ML or model fixtures.
  // Mutation: defer or omit exact source verification until after catalog copying/startup.
  for (const linked of [false, true]) {
    await fixture(async ({ root, appData, artifacts, input, run }) => {
      const source = path.join(root, 'source.pt')
      const unchanged = Buffer.from('wrong local bytes; not trained LaMa')
      await fs.writeFile(source, unchanged)
      const declared = linked ? path.join(root, 'linked.pt') : source
      if (linked) await fs.symlink(source, declared)
      Object.assign(input, {
        profile: 'outpaint',
        side: 256,
        steps: 3,
        lama: {
          path: declared,
          byteSize: LAMA_OUTPAINT_ARTIFACT.sizeBytes,
          sha256: LAMA_OUTPAINT_ARTIFACT.sha256,
        },
      })
      const refusal = await run()
      assert.match(refusal.stderr, /auxiliary resource/)
      assert.ok((await fs.readFile(source)).equals(unchanged))
      assert.deepEqual(await fs.readdir(path.join(appData, 'models')), [])
      await assert.rejects(fs.lstat(path.join(appData, 'inference-resources')), { code: 'ENOENT' })
      const report = JSON.parse(await fs.readFile(path.join(artifacts, 'report.json'), 'utf8'))
      assert.equal(report.status, 'failed')
      assert.deepEqual(report.models, [])
      assert.deepEqual(report.generations, [])
      await assert.rejects(fs.lstat(path.join(artifacts, 'electron-main.log')), { code: 'ENOENT' })
    })
  }
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
