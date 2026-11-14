/**
 * Trusted local transport qualification/tooling only; no keys from renderer, downloads or
 * execution.
 */
import { constants } from 'node:fs'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { extractRuntimeTransport } from '../src/main/runtime/runtime-release-extraction.ts'

export function extractionArguments(argv) {
  const names = ['transport-dir', 'trusted-keys', 'app-version', 'output-dir']
  const args = Object.create(null)
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.slice(2)
    if (
      !argv[i]?.startsWith('--') ||
      !names.includes(key) ||
      Object.hasOwn(args, key) ||
      !argv[i + 1] ||
      argv[i + 1].startsWith('--')
    )
      throw new Error('Provide each explicit extraction input exactly once.')
    args[key] = argv[i + 1]
  }
  if (Object.keys(args).length !== names.length)
    throw new Error(
      'Transport, external trusted keyring, app version and new output directory are required.',
    )
  for (const key of ['transport-dir', 'trusted-keys', 'output-dir']) {
    if (!path.isAbsolute(args[key]) || path.resolve(args[key]) !== args[key])
      throw new Error('Extraction paths must be canonical and absolute.')
  }
  return args
}

async function main() {
  const args = extractionArguments(process.argv.slice(2))
  const filename = args['trusted-keys']
  if ((await fs.realpath(filename)) !== filename)
    throw new Error('Trusted keyring path must not be symlinked.')
  const file = await fs.open(
    filename,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  )
  let trustedKeys
  try {
    const before = await file.stat({ bigint: true })
    if (!before.isFile() || before.size > 128n * 1024n)
      throw new Error('Trusted keyring must be a bounded regular file.')
    const bytes = Buffer.alloc(Number(before.size))
    let offset = 0
    while (offset < bytes.length) {
      const result = await file.read(bytes, offset, bytes.length - offset, null)
      if (!result.bytesRead) throw new Error('Trusted keyring changed.')
      offset += result.bytesRead
    }
    const id = (s) => [s.dev, s.ino, s.mode, s.size, s.mtimeNs, s.ctimeNs].join(':')
    if (
      id(await file.stat({ bigint: true })) !== id(before) ||
      id(await fs.lstat(filename, { bigint: true })) !== id(before)
    )
      throw new Error('Trusted keyring changed.')
    trustedKeys = JSON.parse(bytes.toString('utf8'))
  } finally {
    await file.close()
  }
  const result = await extractRuntimeTransport({
    appVersion: args['app-version'],
    transportDirectory: args['transport-dir'],
    outputDirectory: args['output-dir'],
    trustedKeys,
  })
  console.log(
    JSON.stringify({
      outcome: 'PASS',
      scope: 'verified-runtime-extraction',
      payloadDirectory: result.directory,
      installed: false,
    }),
  )
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(
      JSON.stringify({
        outcome: 'FAIL',
        code: typeof error?.code === 'string' ? error.code : 'RUNTIME_EXTRACTION_FAILED',
        message: error instanceof Error ? error.message : 'Runtime extraction failed.',
      }),
    )
    process.exitCode = 1
  })
}
