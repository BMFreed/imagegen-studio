import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import * as fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { promisify } from 'node:util'

import { transportArguments } from './produce-runtime-transport.mjs'

const args = [
  '--payload-dir',
  '/fixture/payload',
  '--runtime-envelope',
  '/fixture/envelope',
  '--trusted-keys',
  '/fixture/keys',
  '--publisher-key',
  '/fixture/private',
  '--publisher-key-id',
  'external-key',
  '--app-version',
  '1.0.0',
  '--output-dir',
  '/fixture/output',
]

test('transport CLI requires explicit publisher identity and all canonical local inputs', () => {
  assert.equal(transportArguments(args)['publisher-key-id'], 'external-key')
  for (const invalid of [
    args.slice(0, -2),
    [...args, '--unknown', 'x'],
    [...args, '--publisher-key', '/second'],
    args.map((v) => (v === '/fixture/private' ? 'relative/private' : v)),
  ]) {
    assert.throws(() => transportArguments(invalid))
  }
})

test('real CLI refuses unsafe or invalid private-key input without printing its bytes or publishing', async (t) => {
  for (const mode of [0o644, 0o600]) {
    await t.test(mode.toString(8), async () => {
      const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'igs-transport-cli-'))
      try {
        const secret = 'fixture-private-key-content-must-not-appear-in-diagnostics'
        const key = path.join(directory, 'private.pem')
        const output = path.join(directory, 'output')
        await fs.writeFile(key, secret, { mode })
        const actual = args.map((value) =>
          value === '/fixture/private' ? key : value === '/fixture/output' ? output : value,
        )
        const result = await promisify(execFile)(
          process.execPath,
          ['--import', 'tsx', 'scripts/produce-runtime-transport.mjs', ...actual],
          { timeout: 10_000, maxBuffer: 64 * 1024 },
        ).then(
          () => assert.fail('Invalid key must refuse'),
          (error) => error,
        )
        assert.equal(result.code, 1)
        assert.equal(result.stdout, '')
        const receipt = JSON.parse(result.stderr)
        assert.equal(receipt.outcome, 'FAIL')
        assert.equal(result.stderr.includes(secret), false)
        assert.equal(result.stderr.includes('BEGIN PRIVATE KEY'), false)
        await assert.rejects(fs.lstat(output), { code: 'ENOENT' })
      } finally {
        await fs.rm(directory, { force: true, recursive: true })
      }
    })
  }
})
