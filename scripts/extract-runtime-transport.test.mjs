import assert from 'node:assert/strict'
import { test } from 'node:test'

import { extractionArguments } from './extract-runtime-transport.mjs'

const args = [
  '--transport-dir',
  '/owned/transport',
  '--trusted-keys',
  '/trusted/keys.json',
  '--app-version',
  '1.0.0',
  '--output-dir',
  '/owned/new-output',
]

test('extraction CLI requires explicit external trust and a canonical new-output selection', () => {
  assert.equal(extractionArguments(args)['output-dir'], '/owned/new-output')
  for (const invalid of [
    args.slice(2),
    [...args, '--trusted-keys', '/alternate'],
    [...args, '--download-url', 'https://example.invalid'],
    args.map((s) => (s === '/owned/transport' ? '../input' : s)),
    ['--output-dir'],
  ]) {
    assert.throws(() => extractionArguments(invalid))
  }
})
