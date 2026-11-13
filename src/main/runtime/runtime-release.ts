import { createHash, createPublicKey, verify } from 'node:crypto'
import { type BigIntStats, constants } from 'node:fs'
import { lstat, open, opendir, readlink, realpath } from 'node:fs/promises'
import path from 'node:path'

const MAX_MANIFEST_BYTES = 1024 * 1024
const MAX_ENTRIES = 100_000
const MAX_FILE_BYTES = 32 * 1024 ** 3
const MAX_TOTAL_BYTES = 64 * 1024 ** 3
const HASH = /^[a-f0-9]{64}$/
const IDENTIFIER = /^[A-Z0-9][\w.+-]{0,127}$/i
const VERSION = /^[A-Z0-9][\w.+!-]{0,127}$/i

/** Exact worker-python/inference_config.py pins; this is not an optional fixture override. */
export const PINNED_RUNTIME_CONFIG_FILES: Readonly<Record<string, string>> = Object.freeze({
  'model_index.json': '6d7b93508390ab91ac5bfbe4aeb4dc2d83f7bb1b05fb069d714b5b0c75f70d44',
  'scheduler/scheduler_config.json':
    'af3e45a949aff8b8341ab8b811429ec03fee857a700a1d9477363e4fff9666e2',
  'text_encoder/config.json': '39b8b2e4b1949e36969caa425b6c81c68bace99198dd9078ce05d16ad401fe7f',
  'text_encoder_2/config.json': 'a892d1c3a69a7e9247a24de2bc1d5891e3109a54696e53be20093af671072c34',
  'tokenizer/merges.txt': '9fd691f7c8039210e0fced15865466c65820d09b63988b0174bfe25de299051a',
  'tokenizer/special_tokens_map.json':
    'c4864a9376a8401918425bed71fc14fc0e81f9b59ec45c1cf96cccb2df508eac',
  'tokenizer/tokenizer_config.json':
    '19d7b034cb0cc3ce9766c2231373ab8aa8991fc72e2c8f76558bfaae3de0d563',
  'tokenizer/vocab.json': 'e089ad92ba36837a0d31433e555c8f45fe601ab5c221d4f607ded32d9f7a4349',
  'tokenizer_2/merges.txt': '9fd691f7c8039210e0fced15865466c65820d09b63988b0174bfe25de299051a',
  'tokenizer_2/special_tokens_map.json':
    'f118ab3a983206e4f32583448de6bd6aae4ee21869135cef1f5848a753cdaab6',
  'tokenizer_2/tokenizer_config.json':
    'c9d23941f76a41cbd50eda9290f57be7828f0a7a677939e9ef181f7e12bd1bdf',
  'tokenizer_2/vocab.json': 'e089ad92ba36837a0d31433e555c8f45fe601ab5c221d4f607ded32d9f7a4349',
  'unet/config.json': '30ebc70750223e59006f7f2b4e1e6c102570aa19a9c4ae3e1fbe7591332dbae6',
  'vae/config.json': '0b331c8ac22ded5f9997a144a575c1d113d6169aff262c353f39015bd24a6264',
  'vae_1_0/config.json': '89a914a415bc3211fe15306c5b1d89774d928d6cc6c91dc8e86208710829355c',
  'vae_decoder/config.json': '89a914a415bc3211fe15306c5b1d89774d928d6cc6c91dc8e86208710829355c',
  'vae_encoder/config.json': '89a914a415bc3211fe15306c5b1d89774d928d6cc6c91dc8e86208710829355c',
})

export interface RuntimeReleaseFile {
  readonly executable: boolean
  readonly kind: 'file'
  readonly path: string
  readonly sha256: string
  readonly sizeBytes: number
}

export interface RuntimeReleaseSymlink {
  readonly kind: 'symlink'
  readonly path: string
  readonly target: string
}

export interface RuntimeReleaseWheel {
  readonly distribution: string
  readonly path: string
  readonly sha256: string
  readonly sizeBytes: number
  readonly version: string
}

export interface RuntimeReleaseManifest {
  readonly appVersion: string
  readonly configPath: 'config'
  readonly files: readonly (RuntimeReleaseFile | RuntimeReleaseSymlink)[]
  readonly host: Readonly<{
    arch: 'x64'
    cudaVersion: string
    glibcMinimum: string
    gpuArchitectures: readonly string[]
    minimumNvidiaDriver: string
    os: 'linux'
  }>
  readonly lockSha256: string
  readonly profile: 'linux-nvidia'
  readonly python: Readonly<{
    buildId: string
    executable: 'python/bin/python3.12'
    version: '3.12.13'
  }>
  readonly releaseId: string
  readonly requiredFreeBytes: number
  readonly requirementsPath: 'requirements.txt'
  readonly schemaVersion: 1
  readonly uv: Readonly<{ executable: 'uv/uv'; version: string }>
  readonly wheels: readonly RuntimeReleaseWheel[]
  readonly worker: Readonly<{
    cpuVersion: '0.1.0'
    distribution: 'imagegen-worker'
    distributionVersion: '0.1.0'
    inferenceVersion: '0.14.0'
    protocolVersion: '1'
  }>
}

/** Main's separately trusted keyring; neither keys nor artifact paths arrive from renderer IPC. */
export interface RuntimeReleaseSelection {
  readonly appVersion: string
  readonly directory: string
  readonly envelope: Buffer
  readonly trustedKeys: Readonly<Record<string, string>>
}

export interface VerifiedRuntimeRelease {
  readonly directory: string
  readonly manifest: RuntimeReleaseManifest
  /** Rehash the complete inventory and refuse inode/metadata replacement, even with equal bytes. */
  verifyCompletePayloadSnapshot: () => Promise<void>
}

interface EntrySnapshot {
  readonly identity: string
  readonly path: string
  readonly sha256?: string
  readonly target?: string
}

export class RuntimeReleaseError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'RuntimeReleaseError'
  }
}

/** Sorted-key JSON byte identity, with bounded depth and no unsupported/lossy JSON values. */
export function canonicalRuntimeReleaseJson(value: unknown): Buffer {
  const active = new Set<object>()
  const visit = (node: unknown, depth: number): unknown => {
    if (depth > 64) {
      invalid('The runtime manifest is too deeply nested.')
    }
    if (node === null || typeof node === 'string' || typeof node === 'boolean') {
      return node
    }
    if (typeof node === 'number') {
      if (!Number.isSafeInteger(node)) {
        invalid('Runtime manifest numbers must be safe integers.')
      }
      return node
    }
    if (typeof node !== 'object' || active.has(node)) {
      invalid('The runtime manifest is not JSON metadata.')
    }
    active.add(node)
    let result: unknown
    if (Array.isArray(node)) {
      if (
        node.length > MAX_ENTRIES ||
        Object.keys(node).length !== node.length ||
        Object.keys(node).some((key, index) => key !== String(index))
      ) {
        invalid('Runtime manifest arrays must be finite and dense.')
      }
      result = node.map((entry) => visit(entry, depth + 1))
    } else {
      const record = object(node)
      result = Object.fromEntries(
        Object.keys(record)
          .sort()
          .map((key) => [key, visit(record[key], depth + 1)]),
      )
    }
    active.delete(node)
    return result
  }
  const bytes = Buffer.from(JSON.stringify(visit(value, 0)), 'utf8')
  if (bytes.length < 1 || bytes.length > MAX_MANIFEST_BYTES) {
    invalid('The runtime manifest exceeds its byte limit.')
  }
  return bytes
}

/** Exact offline hashed membership; no URLs, editable installs, indexes, markers or source builds. */
export function runtimeReleaseRequirements(
  manifest: Pick<RuntimeReleaseManifest, 'wheels'>,
): string {
  return [...manifest.wheels]
    .sort((a, b) =>
      compare(normalizeDistribution(a.distribution), normalizeDistribution(b.distribution)),
    )
    .map(
      (wheel) =>
        `${normalizeDistribution(wheel.distribution)}==${wheel.version} --hash=sha256:${wheel.sha256}\n`,
    )
    .join('')
}

/**
 * Fresh Invoke4875/launcher c267 checksum-before-use and complete staging ownership adaptation.
 * Signed canonical envelope/inventory are Studio's disclosed release contract, absent upstream. No
 * artifact is opened, executed or extracted before externally trusted Ed25519 verification.
 */
export async function verifyRuntimeRelease(
  selection: RuntimeReleaseSelection,
): Promise<VerifiedRuntimeRelease> {
  if (typeof selection !== 'object' || selection === null) {
    invalid('A trusted Main runtime release selection is required.')
  }
  const directory = selection.directory
  const appVersion = selection.appVersion
  if (
    !Buffer.isBuffer(selection.envelope) ||
    selection.envelope.length < 1 ||
    selection.envelope.length > MAX_MANIFEST_BYTES
  ) {
    invalid('The runtime release envelope exceeds its byte limit.')
  }
  const envelope = Buffer.from(selection.envelope)
  let raw: unknown
  try {
    raw = JSON.parse(envelope.toString('utf8'))
  } catch {
    invalid('The runtime release envelope is invalid JSON.')
  }
  const sealed = object(raw)
  exact(sealed, ['schemaVersion', 'keyId', 'payload', 'signature'])
  if (
    sealed['schemaVersion'] !== 1 ||
    typeof sealed['keyId'] !== 'string' ||
    !IDENTIFIER.test(sealed['keyId'])
  ) {
    invalid('The runtime release envelope identity is invalid.')
  }
  const payload = base64(sealed['payload'])
  const signature = base64(sealed['signature'])
  if (payload.length > MAX_MANIFEST_BYTES || signature.length !== 64) {
    invalid('The runtime release signature or payload size is invalid.')
  }
  const keyId = sealed['keyId']
  if (!selection.trustedKeys || !Object.hasOwn(selection.trustedKeys, keyId)) {
    trust('The runtime release signing key is not trusted.')
  }
  const publicPem = selection.trustedKeys[keyId]
  if (typeof publicPem !== 'string' || publicPem.length > 16 * 1024) {
    trust('The trusted runtime key is invalid.')
  }
  try {
    const key = createPublicKey(publicPem)
    if (key.asymmetricKeyType !== 'ed25519' || !verify(null, payload, key, signature)) {
      trust('The runtime release signature is invalid.')
    }
  } catch (error) {
    if (error instanceof RuntimeReleaseError) {
      throw error
    }
    trust('The runtime release signature could not be verified.')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(payload.toString('utf8'))
  } catch {
    invalid('The signed runtime payload is invalid JSON.')
  }
  if (!payload.equals(canonicalRuntimeReleaseJson(parsed))) {
    invalid('The signed runtime payload is not canonical JSON.')
  }
  const manifest = validateManifest(parsed, appVersion)
  if (
    typeof directory !== 'string' ||
    !path.isAbsolute(directory) ||
    path.resolve(directory) !== directory
  ) {
    storage('The release payload directory must be canonical and absolute.')
  }
  let baseline: readonly EntrySnapshot[]
  try {
    baseline = await inspectPayload(directory, manifest)
  } catch (error) {
    throw payloadError(error)
  }
  return Object.freeze({
    directory,
    manifest,
    async verifyCompletePayloadSnapshot() {
      let current: readonly EntrySnapshot[]
      try {
        current = await inspectPayload(directory, manifest)
      } catch (error) {
        throw payloadError(error)
      }
      if (JSON.stringify(current) !== JSON.stringify(baseline)) {
        changed('The verified runtime payload was replaced or changed.')
      }
    },
  })
}

function validateManifest(value: unknown, appVersion: string): RuntimeReleaseManifest {
  const manifest = object(value)
  exact(manifest, [
    'schemaVersion',
    'releaseId',
    'appVersion',
    'profile',
    'python',
    'uv',
    'worker',
    'host',
    'lockSha256',
    'requirementsPath',
    'configPath',
    'wheels',
    'files',
    'requiredFreeBytes',
  ])
  if (
    manifest['schemaVersion'] !== 1 ||
    manifest['profile'] !== 'linux-nvidia' ||
    !identifier(manifest['releaseId']) ||
    !identifier(manifest['appVersion']) ||
    manifest['appVersion'] !== appVersion ||
    manifest['requirementsPath'] !== 'requirements.txt' ||
    manifest['configPath'] !== 'config' ||
    !digest(manifest['lockSha256'])
  ) {
    invalid('The runtime release is incompatible with this application.')
  }
  const python = object(manifest['python'])
  exact(python, ['version', 'buildId', 'executable'])
  if (
    python['version'] !== '3.12.13' ||
    python['executable'] !== 'python/bin/python3.12' ||
    !identifier(python['buildId'])
  ) {
    invalid('The runtime release Python identity is unsupported.')
  }
  const uv = object(manifest['uv'])
  exact(uv, ['version', 'executable'])
  if (uv['executable'] !== 'uv/uv' || !identifier(uv['version'])) {
    invalid('The runtime release uv identity is invalid.')
  }
  const worker = object(manifest['worker'])
  exact(worker, [
    'distribution',
    'distributionVersion',
    'cpuVersion',
    'inferenceVersion',
    'protocolVersion',
  ])
  if (
    worker['distribution'] !== 'imagegen-worker' ||
    worker['distributionVersion'] !== '0.1.0' ||
    worker['cpuVersion'] !== '0.1.0' ||
    worker['inferenceVersion'] !== '0.14.0' ||
    worker['protocolVersion'] !== '1'
  ) {
    invalid('The runtime release worker identities are unsupported.')
  }
  const host = object(manifest['host'])
  exact(host, [
    'os',
    'arch',
    'glibcMinimum',
    'cudaVersion',
    'minimumNvidiaDriver',
    'gpuArchitectures',
  ])
  if (
    host['os'] !== 'linux' ||
    host['arch'] !== 'x64' ||
    ![host['glibcMinimum'], host['cudaVersion'], host['minimumNvidiaDriver']].every(
      (entry) => typeof entry === 'string' && /^\d+(?:\.\d+){1,3}$/.test(entry),
    ) ||
    !Array.isArray(host['gpuArchitectures']) ||
    !host['gpuArchitectures'].length ||
    host['gpuArchitectures'].length > 64 ||
    !host['gpuArchitectures'].every(
      (entry: unknown) => typeof entry === 'string' && /^[\w.+-]{1,32}$/.test(entry),
    ) ||
    new Set(host['gpuArchitectures']).size !== host['gpuArchitectures'].length
  ) {
    invalid('The runtime release host requirements are invalid.')
  }
  if (
    !Array.isArray(manifest['files']) ||
    !manifest['files'].length ||
    manifest['files'].length > MAX_ENTRIES ||
    !Array.isArray(manifest['wheels']) ||
    !manifest['wheels'].length ||
    manifest['wheels'].length > MAX_ENTRIES
  ) {
    invalid('A complete finite runtime payload is required.')
  }
  const files = new Map<string, RuntimeReleaseFile | RuntimeReleaseSymlink>()
  let totalBytes = 0
  for (const raw of manifest['files']) {
    const entry = object(raw)
    const name = entry['path']
    // This profile is Linux-only. CPython's terminfo contains distinct names such as 2621A/2621a;
    // preserve the exact Path namespace used by Invoke rather than imposing Windows case folding.
    if (!relativePath(name) || files.has(name)) {
      invalid('Runtime payload paths must be unique safe relative paths.')
    }
    if (entry['kind'] === 'file') {
      exact(entry, ['path', 'kind', 'sha256', 'sizeBytes', 'executable'])
      if (
        !digest(entry['sha256']) ||
        !fileSize(entry['sizeBytes']) ||
        typeof entry['executable'] !== 'boolean'
      ) {
        invalid('Runtime payload file identity is invalid.')
      }
      totalBytes += entry['sizeBytes']
      if (totalBytes > MAX_TOTAL_BYTES) {
        invalid('The runtime payload exceeds its total byte limit.')
      }
      files.set(name, entry as unknown as RuntimeReleaseFile)
    } else if (entry['kind'] === 'symlink') {
      exact(entry, ['path', 'kind', 'target'])
      if (
        !name.startsWith('python/') ||
        typeof entry['target'] !== 'string' ||
        !entry['target'] ||
        entry['target'].length > 1024 ||
        /[\\\0]/.test(entry['target']) ||
        path.posix.isAbsolute(entry['target']) ||
        !resolveLink(name, entry['target']).startsWith('python/')
      ) {
        invalid('Only internal relative Python symlinks are allowed.')
      }
      files.set(name, entry as unknown as RuntimeReleaseSymlink)
    } else {
      invalid('Runtime payload entry kinds are invalid.')
    }
  }
  const directories = expectedDirectories(files)
  for (const [name, entry] of files) {
    for (const parent of parents(name)) {
      if (files.has(parent)) {
        invalid('A runtime payload entry cannot be an ancestor directory.')
      }
    }
    if (entry.kind === 'symlink') {
      let target = resolveLink(name, entry.target)
      const seen = new Set([name])
      while (files.get(target)?.kind === 'symlink') {
        if (seen.has(target)) {
          invalid('Runtime Python symlinks cannot form a cycle.')
        }
        seen.add(target)
        const next = files.get(target) as RuntimeReleaseSymlink
        target = resolveLink(target, next.target)
      }
      if (!target.startsWith('python/') || (!files.has(target) && !directories.has(target))) {
        invalid('Runtime Python symlinks must resolve inside the complete payload.')
      }
    }
  }
  const distributions = new Set<string>()
  const wheelPaths = new Set<string>()
  for (const raw of manifest['wheels']) {
    const wheel = object(raw)
    exact(wheel, ['path', 'distribution', 'version', 'sha256', 'sizeBytes'])
    const name = wheel['path']
    if (
      typeof name !== 'string' ||
      !/^wheels\/\w[\w.+-]*\.whl$/.test(name) ||
      !identifier(wheel['distribution']) ||
      typeof wheel['version'] !== 'string' ||
      !VERSION.test(wheel['version']) ||
      !digest(wheel['sha256']) ||
      !positiveSize(wheel['sizeBytes'], MAX_FILE_BYTES)
    ) {
      invalid('The release requires exact wheel artifacts, never source distributions.')
    }
    const distribution = normalizeDistribution(wheel['distribution'])
    const entry = files.get(name)
    if (
      distributions.has(distribution) ||
      wheelPaths.has(name) ||
      entry?.kind !== 'file' ||
      entry.executable ||
      entry.sha256 !== wheel['sha256'] ||
      entry.sizeBytes !== wheel['sizeBytes']
    ) {
      invalid('Release wheel membership is incomplete, duplicated or inconsistent.')
    }
    distributions.add(distribution)
    wheelPaths.add(name)
  }
  if (
    manifest['files'].some(
      (entry: RuntimeReleaseFile | RuntimeReleaseSymlink) =>
        entry.path.startsWith('wheels/') && !wheelPaths.has(entry.path),
    )
  ) {
    invalid('Every wheelhouse member must be an exact declared wheel.')
  }
  const workerWheel = manifest['wheels'].find(
    (entry: RuntimeReleaseWheel) => normalizeDistribution(entry.distribution) === 'imagegen-worker',
  ) as RuntimeReleaseWheel | undefined
  if (!workerWheel || workerWheel.version !== '0.1.0') {
    invalid('The exact worker wheel is missing.')
  }
  for (const name of ['python/bin/python3.12', 'uv/uv', 'requirements.txt']) {
    const entry = files.get(name)
    if (
      entry?.kind !== 'file' ||
      entry.sizeBytes < 1 ||
      entry.executable !== (name !== 'requirements.txt')
    ) {
      invalid('The release is missing an exact executable or requirements file.')
    }
  }
  if ((files.get('requirements.txt') as RuntimeReleaseFile).sizeBytes > MAX_MANIFEST_BYTES) {
    invalid('The exact offline requirements exceed their byte limit.')
  }
  const config = [...files.keys()].filter((name) => name.startsWith('config/'))
  if (
    config.length !== Object.keys(PINNED_RUNTIME_CONFIG_FILES).length ||
    Object.entries(PINNED_RUNTIME_CONFIG_FILES).some(([name, hash]) => {
      const entry = files.get(`config/${name}`)
      return entry?.kind !== 'file' || entry.executable || entry.sha256 !== hash
    })
  ) {
    invalid('The release must contain the exact complete pinned inference configuration.')
  }
  if (
    !positiveSize(manifest['requiredFreeBytes'], Number.MAX_SAFE_INTEGER) ||
    manifest['requiredFreeBytes'] < totalBytes
  ) {
    invalid('The release free-space requirement is invalid or below its payload footprint.')
  }
  return deepFreeze(structuredClone(manifest)) as unknown as RuntimeReleaseManifest
}

async function inspectPayload(
  directory: string,
  manifest: RuntimeReleaseManifest,
): Promise<readonly EntrySnapshot[]> {
  const root = await lstat(directory, { bigint: true })
  if (!root.isDirectory() || root.isSymbolicLink() || (await realpath(directory)) !== directory) {
    storage('The release payload root is not a canonical directory.')
  }
  const entries = new Map(manifest.files.map((entry) => [entry.path, entry]))
  const directories = expectedDirectories(entries)
  const observed = new Map<string, BigIntStats>([['', root]])
  const links = new Map<string, string>()
  let count = 0
  const visit = async (relative: string): Promise<void> => {
    const parent = path.join(directory, relative)
    const handle = await opendir(parent)
    for await (const item of handle) {
      if (++count > MAX_ENTRIES) {
        storage('The release payload has too many entries.')
      }
      const name = relative ? `${relative}/${item.name}` : item.name
      const absolute = path.join(directory, name)
      const info = await lstat(absolute, { bigint: true })
      observed.set(name, info)
      if (info.isDirectory() && !info.isSymbolicLink()) {
        if (!directories.has(name) || (await realpath(absolute)) !== absolute) {
          storage(`Unexpected runtime payload directory: ${name}.`)
        }
        await visit(name)
      } else {
        const expected = entries.get(name)
        if (!expected) {
          storage(`Unexpected runtime payload entry: ${name}.`)
        }
        if (expected.kind === 'symlink') {
          if (!info.isSymbolicLink()) {
            storage(`Runtime Python link was replaced: ${name}.`)
          }
          const target = await readlink(absolute)
          if (target !== expected.target) {
            changed(`Runtime Python link differs from its signed identity: ${name}.`)
          }
          links.set(name, target)
        } else if (!info.isFile() || info.isSymbolicLink()) {
          storage(`Runtime payload is not a regular file: ${name}.`)
        }
      }
    }
  }
  await visit('')
  for (const name of entries.keys()) {
    if (!observed.has(name)) {
      storage(`Runtime release file is missing: ${name}.`)
    }
  }
  for (const name of directories) {
    if (!observed.has(name)) {
      storage(`Runtime release directory is missing: ${name}.`)
    }
  }
  const snapshots: EntrySnapshot[] = []
  for (const [name, info] of observed) {
    const expected = entries.get(name)
    if (expected?.kind === 'file') {
      const actual = await hashRegularFile(directory, expected, info)
      if (
        expected.path === 'requirements.txt' &&
        actual.text !== runtimeReleaseRequirements(manifest)
      ) {
        invalid(
          'Offline requirements must exactly match the signed wheel hashes without directives or URLs.',
        )
      }
      snapshots.push({ identity: statIdentity(info), path: name, sha256: actual.sha256 })
    } else if (expected?.kind === 'symlink') {
      const resolved = await realpath(path.join(directory, name))
      if (!within(path.join(directory, 'python'), resolved)) {
        storage('A runtime Python symlink escaped its complete payload.')
      }
      snapshots.push({ identity: statIdentity(info), path: name, target: links.get(name)! })
    } else {
      snapshots.push({ identity: statIdentity(info), path: name })
    }
  }
  for (const [name, before] of observed) {
    const after = await lstat(path.join(directory, name), { bigint: true })
    if (statIdentity(before) !== statIdentity(after)) {
      changed('The runtime payload changed during verification.')
    }
  }
  if ((await realpath(directory)) !== directory) {
    changed('The release payload root changed during verification.')
  }
  return snapshots.sort((a, b) => compare(a.path, b.path))
}

async function hashRegularFile(
  directory: string,
  expected: RuntimeReleaseFile,
  atPath: BigIntStats,
): Promise<{ sha256: string; text?: string }> {
  const absolute = path.join(directory, expected.path)
  const file = await open(
    absolute,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  )
  try {
    const before = await file.stat({ bigint: true })
    if (
      !before.isFile() ||
      statIdentity(before) !== statIdentity(atPath) ||
      before.size !== BigInt(expected.sizeBytes) ||
      ((before.mode & 0o111n) !== 0n) !== expected.executable
    ) {
      changed(`Runtime release file differs from its signed identity: ${expected.path}.`)
    }
    const hash = createHash('sha256')
    const chunk = Buffer.allocUnsafe(1024 * 1024)
    const text: Buffer[] = []
    let total = 0
    for (;;) {
      const { bytesRead } = await file.read(chunk, 0, chunk.length, null)
      if (!bytesRead) {
        break
      }
      total += bytesRead
      if (total > expected.sizeBytes) {
        changed('The runtime release file grew during verification.')
      }
      hash.update(chunk.subarray(0, bytesRead))
      if (expected.path === 'requirements.txt') {
        text.push(Buffer.from(chunk.subarray(0, bytesRead)))
      }
    }
    const digest = hash.digest('hex')
    const after = await file.stat({ bigint: true })
    const current = await lstat(absolute, { bigint: true })
    if (
      total !== expected.sizeBytes ||
      digest !== expected.sha256 ||
      statIdentity(before) !== statIdentity(after) ||
      statIdentity(before) !== statIdentity(current)
    ) {
      changed(`Runtime release file differs from its signed identity: ${expected.path}.`)
    }
    return {
      sha256: digest,
      ...(expected.path === 'requirements.txt'
        ? { text: Buffer.concat(text).toString('utf8') }
        : {}),
    }
  } finally {
    await file.close()
  }
}

function expectedDirectories(
  entries: ReadonlyMap<string, RuntimeReleaseFile | RuntimeReleaseSymlink>,
): Set<string> {
  return new Set([...entries.keys()].flatMap(parents))
}
function parents(name: string): string[] {
  const result: string[] = []
  for (let parent = path.posix.dirname(name); parent !== '.'; parent = path.posix.dirname(parent)) {
    result.push(parent)
  }
  return result
}
function resolveLink(name: string, target: string): string {
  return path.posix.normalize(path.posix.join(path.posix.dirname(name), target))
}
function normalizeDistribution(name: string): string {
  return name.toLowerCase().replaceAll(/[-_.]+/g, '-')
}
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
function relativePath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 1024 &&
    /^[\w.+-]+(?:\/[\w.+-]+)*$/.test(value) &&
    value.split('/').every((part) => part !== '.' && part !== '..')
  )
}
function within(parent: string, child: string): boolean {
  const rel = path.relative(parent, child)
  return !!rel && !rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel)
}
function statIdentity(info: BigIntStats): string {
  return [info.dev, info.ino, info.mode, info.size, info.mtimeNs, info.ctimeNs].join(':')
}
function positiveSize(value: unknown, max: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= max
}
function fileSize(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= MAX_FILE_BYTES
  )
}
function identifier(value: unknown): value is string {
  return typeof value === 'string' && IDENTIFIER.test(value)
}
function digest(value: unknown): value is string {
  return typeof value === 'string' && HASH.test(value)
}
function object(value: unknown): Record<string, unknown> {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    ![null, Object.prototype].includes(Object.getPrototypeOf(value))
  ) {
    invalid('The runtime manifest must contain plain JSON objects.')
  }
  return value as Record<string, unknown>
}
function exact(value: Record<string, unknown>, keys: readonly string[]): void {
  if (Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) {
    invalid('The runtime release contains unknown or missing fields.')
  }
}
function base64(value: unknown): Buffer {
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > MAX_MANIFEST_BYTES * 2 ||
    !/^(?:[A-Z0-9+/]{4})*(?:[A-Z0-9+/]{2}==|[A-Z0-9+/]{3}=)?$/i.test(value)
  ) {
    invalid('The release envelope contains invalid base64.')
  }
  const bytes = Buffer.from(value, 'base64')
  if (bytes.toString('base64') !== value) {
    invalid('The release envelope base64 is not canonical.')
  }
  return bytes
}
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) {
      deepFreeze(child)
    }
    Object.freeze(value)
  }
  return value
}
function payloadError(error: unknown): RuntimeReleaseError {
  return error instanceof RuntimeReleaseError
    ? error
    : new RuntimeReleaseError(
        'RUNTIME_RELEASE_INVALID_STORAGE',
        'The complete runtime payload could not be verified.',
      )
}
function invalid(message: string): never {
  throw new RuntimeReleaseError('RUNTIME_RELEASE_INVALID_MANIFEST', message)
}
function trust(message: string): never {
  throw new RuntimeReleaseError('RUNTIME_RELEASE_UNTRUSTED', message)
}
function storage(message: string): never {
  throw new RuntimeReleaseError('RUNTIME_RELEASE_INVALID_STORAGE', message)
}
function changed(message: string): never {
  throw new RuntimeReleaseError('RUNTIME_RELEASE_PAYLOAD_CHANGED', message)
}
