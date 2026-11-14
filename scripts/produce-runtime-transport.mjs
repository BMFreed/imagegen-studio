/** Build-time only. Explicit externally trusted keys; no downloads, installs or key generation. */
import { createPrivateKey } from 'node:crypto'
import { constants } from 'node:fs'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { produceRuntimeTransport } from '../src/main/runtime/runtime-release-transport.ts'

export function transportArguments(argv) {
  const names = [
    'payload-dir',
    'runtime-envelope',
    'trusted-keys',
    'publisher-key',
    'publisher-key-id',
    'app-version',
    'output-dir',
  ]
  const args = Object.create(null)
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i]?.slice(2)
    if (
      !argv[i]?.startsWith('--') ||
      !names.includes(name) ||
      Object.hasOwn(args, name) ||
      !argv[i + 1] ||
      argv[i + 1].startsWith('--')
    )
      throw new Error('Provide each explicit runtime transport input exactly once.')
    args[name] = argv[i + 1]
  }
  if (Object.keys(args).length !== names.length)
    throw new Error('All runtime transport inputs, including publisher identity, are required.')
  for (const name of names.filter((n) => !['publisher-key-id', 'app-version'].includes(n))) {
    if (!path.isAbsolute(args[name]) || path.resolve(args[name]) !== args[name])
      throw new Error('Runtime transport paths must be canonical and absolute.')
  }
  return args
}

async function readInput(filename, maximum, secret = false) {
  if ((await fs.realpath(filename)) !== filename)
    throw new Error('Runtime transport inputs must not be symlinked.')
  const before = await fs.lstat(filename, { bigint: true })
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.size > BigInt(maximum) ||
    (secret &&
      ((before.mode & 0o77n) !== 0n || (process.getuid && before.uid !== BigInt(process.getuid()))))
  )
    throw new Error('Runtime transport input type, size or private-key ownership is invalid.')
  const handle = await fs.open(
    filename,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  )
  const id = (s) => [s.dev, s.ino, s.mode, s.size, s.mtimeNs, s.ctimeNs].join(':')
  try {
    if (id(await handle.stat({ bigint: true })) !== id(before))
      throw new Error('Transport input changed.')
    const bytes = await handle.readFile()
    if (
      BigInt(bytes.length) !== before.size ||
      id(await handle.stat({ bigint: true })) !== id(before) ||
      id(await fs.lstat(filename, { bigint: true })) !== id(before)
    )
      throw new Error('Transport input changed.')
    return bytes
  } finally {
    await handle.close()
  }
}

async function main() {
  const args = transportArguments(process.argv.slice(2))
  const secret = await readInput(args['publisher-key'], 16 * 1024, true)
  let publisherPrivateKey
  try {
    publisherPrivateKey = createPrivateKey(secret)
  } catch {
    throw new Error('Cannot read the explicitly provided publisher private key.')
  } finally {
    secret.fill(0)
  }
  const trustedKeys = JSON.parse(
    (await readInput(args['trusted-keys'], 128 * 1024)).toString('utf8'),
  )
  const result = await produceRuntimeTransport({
    outputDirectory: args['output-dir'],
    publisherKeyId: args['publisher-key-id'],
    publisherPrivateKey,
    release: {
      directory: args['payload-dir'],
      envelope: await readInput(args['runtime-envelope'], 1024 ** 2),
      appVersion: args['app-version'],
      trustedKeys,
    },
  })
  console.log(
    JSON.stringify({
      scope: 'runtime-transport',
      manifest: result.manifest,
      directory: result.directory,
      installed: false,
    }),
  )
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    // No key material, parser input, environment or traceback is written to the build receipt.
    console.error(
      JSON.stringify({
        outcome: 'FAIL',
        code: typeof error?.code === 'string' ? error.code : 'RUNTIME_TRANSPORT_FAILED',
        message: error instanceof Error ? error.message : 'Runtime transport production failed.',
      }),
    )
    process.exitCode = 1
  })
}
