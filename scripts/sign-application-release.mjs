/**
 * Publisher-only, offline application-release declaration producer.
 *
 * Fresh source: InvokeAI 4875d96531ca6712b288f6e660fcbb34143408c1,
 * docs/src/content/docs/start-here/installation.mdx delegates updates to launcher
 * c267bdb439519216b277a7a8c6ad408b9d79efce, src/main/updater.ts and its caller
 * src/main/main-process-manager.ts. Neither supplies a Linux signing producer. Adapt
 * scripts/produce-runtime-transport.mjs and runtime-release-transport.ts's canonical Ed25519
 * signing caller; verify the existing application-release domain.
 *
 * Usage: pnpm exec tsx scripts/sign-application-release.mjs --manifest ABS_JSON --notes ABS_JSON
 * --artifact ABS_AppImage --private-key ABS_PEM --key-id ID --output ABS_NEW_ENVELOPE v2
 * additionally requires --runtime-directory ABS_FINAL_APP_OUT_DIR after building.
 *
 * The notes file is the raw releaseNotes JSON value, not a wrapper object. Actual artifact
 * basename, size, SHA512 and notes digest override template values. This authenticates the
 * publisher's compatibility declaration. It does not check AppImage executable format, internal
 * application version, SQL migration execution, or installed image-engine readiness. Clients
 * independently compare installed context. No network, installer, key generation, or mutation of
 * publisher inputs is involved. v2 hashes two fixed final app-directory files. Their association
 * with the artifact is the trusted publisher's declaration, not independently verified container
 * contents or loaded code.
 */
import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto'
import { constants } from 'node:fs'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { verifyApplicationRelease } from '../src/main/application-updates/application-release.ts'
import { canonicalRuntimeReleaseJson } from '../src/main/runtime/runtime-release.ts'

const MAX_JSON_BYTES = 1024 * 1024
const MAX_KEY_BYTES = 16 * 1024
const FILE_FLAGS = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
const DIRECTORY_FLAGS = FILE_FLAGS | constants.O_DIRECTORY
const identity = (info) =>
  [info.dev, info.ino, info.mode, info.size, info.mtimeNs, info.ctimeNs].join(':')

export function applicationReleaseArguments(argv) {
  const names = ['manifest', 'notes', 'artifact', 'private-key', 'key-id', 'output']
  const optional = 'runtime-directory'
  const args = Object.create(null)
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]?.slice(2)
    if (
      !argv[index]?.startsWith('--') ||
      (!names.includes(name) && name !== optional) ||
      Object.hasOwn(args, name) ||
      !argv[index + 1] ||
      argv[index + 1].startsWith('--')
    ) {
      throw new Error('Provide each explicit application release input exactly once.')
    }
    args[name] = argv[index + 1]
  }
  if (names.some((name) => !Object.hasOwn(args, name))) {
    throw new Error('All application release inputs, including raw notes JSON, are required.')
  }
  for (const name of Object.keys(args).filter((name) => name !== 'key-id')) {
    if (!path.isAbsolute(args[name]) || path.resolve(args[name]) !== args[name]) {
      throw new Error('Application release paths must be canonical and absolute.')
    }
  }
  return args
}

async function plainInput(filename, maximum, secret = false) {
  if ((await fs.realpath(filename)) !== filename) {
    throw new Error('Application release inputs must not be symlinked.')
  }
  const before = await fs.lstat(filename, { bigint: true })
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.size <= 0n ||
    before.size > BigInt(maximum) ||
    (secret &&
      ((before.mode & 0o77n) !== 0n || (process.getuid && before.uid !== BigInt(process.getuid()))))
  ) {
    throw new Error('Invalid application release input type, size or private-key ownership.')
  }
  const handle = await fs.open(filename, FILE_FLAGS)
  const unchanged = async () => {
    if (
      identity(await handle.stat({ bigint: true })) !== identity(before) ||
      identity(await fs.lstat(filename, { bigint: true })) !== identity(before) ||
      (await fs.realpath(filename)) !== filename
    ) {
      throw new Error('Application release input changed.')
    }
  }
  try {
    await unchanged()
    return { before, handle, unchanged }
  } catch (error) {
    await handle.close()
    throw error
  }
}

async function readInput(filename, maximum, secret = false) {
  const input = await plainInput(filename, maximum, secret)
  const bytes = Buffer.alloc(maximum + 1)
  try {
    let length = 0
    for (;;) {
      const { bytesRead } = await input.handle.read(bytes, length, bytes.length - length, null)
      length += bytesRead
      if (length > maximum) {
        throw new Error('Application release input exceeds its byte bound.')
      }
      if (bytesRead === 0) {
        break
      }
    }
    if (BigInt(length) !== input.before.size) {
      throw new Error('Application release input changed.')
    }
    await input.unchanged()
    return bytes.subarray(0, length)
  } catch (error) {
    bytes.fill(0)
    throw error
  } finally {
    await input.handle.close()
  }
}

async function hashInput(input) {
  const hash = createHash('sha512')
  const chunk = Buffer.allocUnsafe(1024 * 1024)
  let sizeBytes = 0
  for (;;) {
    const { bytesRead } = await input.handle.read(chunk, 0, chunk.length, sizeBytes)
    if (bytesRead === 0) {
      break
    }
    sizeBytes += bytesRead
    if (!Number.isSafeInteger(sizeBytes) || BigInt(sizeBytes) > input.before.size) {
      throw new Error('Application artifact changed.')
    }
    hash.update(chunk.subarray(0, bytesRead))
  }
  if (BigInt(sizeBytes) !== input.before.size) {
    throw new Error('Application artifact changed.')
  }
  await input.unchanged()
  return Object.freeze({ sha512: hash.digest('base64'), sizeBytes })
}

async function inspectArtifact(filename) {
  const input = await plainInput(filename, Number.MAX_SAFE_INTEGER)
  try {
    return {
      artifact: Object.freeze({ filename: path.basename(filename), ...(await hashInput(input)) }),
      close: () => input.handle.close(),
      unchanged: input.unchanged,
    }
  } catch (error) {
    await input.handle.close()
    throw error
  }
}

/** Two held final build inputs, not a container inspector or a receipt accepted as authority. */
export async function inspectApplicationReleaseRuntimeDirectory(directory) {
  const directories = []
  const inputs = []
  const unchanged = async () => {
    for (const entry of directories) {
      if (
        identity(await canonicalDirectory(entry.path)) !== identity(entry.before) ||
        identity(await entry.handle.stat({ bigint: true })) !== identity(entry.before)
      ) {
        throw new Error('The application runtime directory changed.')
      }
    }
    for (const input of inputs) {
      await input.unchanged()
    }
  }
  const close = async () => {
    await Promise.allSettled([...inputs, ...directories].map((entry) => entry.handle.close()))
  }
  try {
    for (const filename of [directory, path.join(directory, 'resources')]) {
      const before = await canonicalDirectory(filename)
      const handle = await fs.open(filename, DIRECTORY_FLAGS)
      directories.push({ before, handle, path: filename })
    }
    await unchanged()
    for (const filename of [
      path.join(directory, 'resources/app.asar'),
      path.join(directory, 'imagegen-studio'),
    ]) {
      inputs.push(await plainInput(filename, Number.MAX_SAFE_INTEGER))
    }
    await unchanged()
    const runtimeFiles = Object.freeze({
      archive: await hashInput(inputs[0]),
      executable: await hashInput(inputs[1]),
    })
    await unchanged()
    return { close, runtimeFiles, unchanged }
  } catch (error) {
    await close()
    throw error
  }
}

async function canonicalDirectory(directory) {
  const info = await fs.lstat(directory, { bigint: true })
  if (
    !info.isDirectory() ||
    info.isSymbolicLink() ||
    (await fs.realpath(directory)) !== directory
  ) {
    throw new Error('The application release output needs an existing plain parent directory.')
  }
  return info
}

/** Adapt the existing runtime transport's fd-anchored, create-only output owner. */
async function writeEnvelope(filename, bytes, assertInputs) {
  const parent = path.dirname(filename)
  const before = await canonicalDirectory(parent)
  const directory = await fs.open(parent, DIRECTORY_FLAGS)
  try {
    if (identity(await directory.stat({ bigint: true })) !== identity(before)) {
      throw new Error('Application release output parent changed.')
    }
    const sameParent = async () => {
      const visible = await canonicalDirectory(parent)
      const held = await directory.stat({ bigint: true })
      if (
        visible.dev !== before.dev ||
        visible.ino !== before.ino ||
        held.dev !== before.dev ||
        held.ino !== before.ino
      ) {
        throw new Error('Application release output parent changed.')
      }
    }
    await sameParent()
    await assertInputs()
    const anchored = path.join(`/proc/self/fd/${directory.fd}`, path.basename(filename))
    const output = await fs.open(
      anchored,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW |
        constants.O_NONBLOCK,
      0o600,
    )
    try {
      // Only the newly created file is chmodded; never change the existing parent.
      await output.chmod(0o600)
      await output.writeFile(bytes)
      await output.sync()
      await sameParent()
      const held = await output.stat({ bigint: true })
      if (
        !held.isFile() ||
        (held.mode & 0o777n) !== 0o600n ||
        held.size !== BigInt(bytes.length) ||
        identity(await fs.lstat(filename, { bigint: true })) !== identity(held)
      ) {
        throw new Error('Application release output changed.')
      }
      await directory.sync()
      await assertInputs()
    } finally {
      await output.close()
    }
  } finally {
    await directory.close()
  }
}

async function main() {
  const args = applicationReleaseArguments(process.argv.slice(2))
  const secret = await readInput(args['private-key'], MAX_KEY_BYTES, true)
  let privateKey
  try {
    privateKey = createPrivateKey(secret)
    if (privateKey.asymmetricKeyType !== 'ed25519') {
      throw new Error('The publisher key must be Ed25519.')
    }
  } finally {
    secret.fill(0)
  }
  const template = JSON.parse((await readInput(args.manifest, MAX_JSON_BYTES)).toString('utf8'))
  const releaseNotes = JSON.parse((await readInput(args.notes, MAX_JSON_BYTES)).toString('utf8'))
  const declaresRuntimeFiles = template?.schemaVersion === 2
  if (declaresRuntimeFiles !== Object.hasOwn(args, 'runtime-directory')) {
    throw new Error('Only a v2 release requires the explicit final runtime directory.')
  }
  const runtime = declaresRuntimeFiles
    ? await inspectApplicationReleaseRuntimeDirectory(args['runtime-directory'])
    : null
  let artifactInput
  try {
    artifactInput = await inspectArtifact(args.artifact)
    const { artifact } = artifactInput
    const assertInputs = async () => {
      await artifactInput.unchanged()
      await runtime?.unchanged()
    }
    await assertInputs()
    const manifest = {
      ...template,
      artifact,
      ...(runtime ? { runtimeFiles: runtime.runtimeFiles } : {}),
      releaseNotesSha256: createHash('sha256')
        .update(canonicalRuntimeReleaseJson(releaseNotes ?? null))
        .digest('hex'),
    }
    const payload = canonicalRuntimeReleaseJson(manifest)
    const envelope = canonicalRuntimeReleaseJson({
      keyId: args['key-id'],
      payload: payload.toString('base64'),
      schemaVersion: 1,
      signature: sign(null, payload, privateKey).toString('base64'),
    })
    const publicKey = createPublicKey(privateKey).export({ format: 'pem', type: 'spki' }).toString()
    // The client uses its own installed context; this checks the declaration's exact schema.
    const verified = verifyApplicationRelease(
      envelope,
      {
        trustedKeys: { [args['key-id']]: publicKey },
        compatibility: {
          cpuWorkerProtocolVersion: manifest.compatibility?.cpuWorkerProtocolVersion,
          databaseMigrations: manifest.compatibility?.databaseMigrations,
          inferenceWorkerProtocolVersion: manifest.compatibility?.inferenceWorkerProtocolVersion,
          projectSchemaVersion: manifest.compatibility?.projectSchemaVersion,
        },
      },
      { version: manifest.version, ...artifact },
      releaseNotes,
    )
    await writeEnvelope(args.output, envelope, assertInputs)
    console.log(
      JSON.stringify({
        outcome: 'PASS',
        scope: verified.scope,
        version: verified.version,
        releaseId: verified.releaseId,
        keyId: args['key-id'],
        artifact: verified.artifact,
        installed: false,
        packageFormatVerified: false,
        runtimeFilesDeclared: verified.schemaVersion === 2,
        containerContentsVerified: false,
      }),
    )
  } finally {
    try {
      await artifactInput?.close()
    } finally {
      await runtime?.close()
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    // Fixed diagnostics never print secrets, parser input, paths, URLs or tracebacks.
    console.error(
      JSON.stringify({
        outcome: 'FAIL',
        code: 'APPLICATION_RELEASE_SIGN_FAILED',
        message: 'The application release could not be signed.',
      }),
    )
    process.exitCode = 1
  })
}
