/**
 * Invoke4875 install_staging_ledger's durable marker/PID-start claim adaptation. Runtime slots stay
 * at their final paths; a pointer is published only between two caller-owned, physically closed
 * qualification phases. No slot is collected.
 */
import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import * as fs from 'node:fs/promises'
import path from 'node:path'

import type { RuntimeRoots } from './index.js'
import type { PreparedOfflineRuntime } from './offline-runtime-assembly.js'

import { OFFLINE_RUNTIME_INCOMPLETE_MARKER } from './offline-runtime-assembly.js'

export const RUNTIME_INSTALLATION_JOURNAL = 'runtime-installation.json'
export const RUNTIME_INSTALLATION_CLAIM = '.igs-runtime-install.claim.json'
export const RUNTIME_INSTALLATION_RECOVERY_CLAIM = '.igs-runtime-install-recovery.claim.json'
const MAX_METADATA_BYTES = 64 * 1024
const MAX_POINTER_BYTES = 16 * 1024
const ID = /^[a-z0-9][\w.-]{0,127}$/i
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
const activeRoots = new Set<string>()

export interface RuntimeInstallationInput {
  /** Undefined omits only this additional preview guard; execution always captures a pointer. */
  expectedPointerSha256?: string | null
  mode: 'install' | 'repair'
  prepare: () => Promise<PreparedOfflineRuntime>
  /** Must return only after all workers started by that phase physically exited. */
  qualify: (
    prepared: PreparedOfflineRuntime,
    phase: 'after-activation' | 'before-activation',
  ) => Promise<void>
  signal?: AbortSignal
}

export interface RuntimeInstallationTestHooks {
  /** Source of a controlled concurrent publisher in filesystem integration tests. */
  beforePointerPublish?: (phase: 'activate' | 'rollback') => Promise<void>
}

export interface RuntimeInstallationResult {
  previousRuntimeId?: string
  runtimeId: string
}

interface DirectoryIdentity {
  dev: bigint
  ino: bigint
}

interface ProcessIdentity {
  bootId: string
  pid: number
  startTicks: string
}

interface Claim {
  attemptId: string
  owner: ProcessIdentity
  schemaVersion: 1
}

type Phase =
  | 'activated'
  | 'activating'
  | 'complete'
  | 'failed'
  | 'post-qualifying'
  | 'prepared'
  | 'preparing'
  | 'qualifying'
  | 'recovery-required'
  | 'rolled-back'

interface PreparedIdentity {
  environmentRoot: string
  manifestSha256: string
  pythonExecutable: string
  pythonRoot: string
  releaseId: string
  runtimeId: string
}

interface Journal extends Claim {
  candidatePointer: string | null
  mode: 'install' | 'repair'
  phase: Phase
  prepared: PreparedIdentity | null
  previousPointer: string | null
}

export class RuntimeInstallationError extends Error {
  constructor(
    readonly code:
      | 'RUNTIME_INSTALL_BUSY'
      | 'RUNTIME_INSTALL_CANCELED'
      | 'RUNTIME_INSTALL_FAILED'
      | 'RUNTIME_INSTALL_POINTER_CHANGED'
      | 'RUNTIME_INSTALL_PREPARATION_INVALID'
      | 'RUNTIME_INSTALL_RECOVERY_REQUIRED'
      | 'RUNTIME_INSTALL_STORAGE_INVALID',
    message: string,
    readonly recoveryRequired = false,
    readonly exitConfirmed = true,
  ) {
    super(message)
    this.name = 'RuntimeInstallationError'
  }
}

/** The caller owns admission/worker fences; old slots remain safe for already held CPU leases. */
export class RuntimeInstallationController {
  private readonly hooks: RuntimeInstallationTestHooks
  private readonly roots: RuntimeRoots
  private readonly storageIdentities = new Map<string, DirectoryIdentity>()

  constructor(roots: RuntimeRoots, hooks: RuntimeInstallationTestHooks = {}) {
    this.roots = Object.freeze({ ...roots })
    this.hooks = Object.freeze({ ...hooks })
  }

  async install(input: RuntimeInstallationInput): Promise<RuntimeInstallationResult> {
    input = Object.freeze({ ...input })
    if (
      (input.mode !== 'install' && input.mode !== 'repair') ||
      typeof input.prepare !== 'function' ||
      typeof input.qualify !== 'function'
    ) {
      invalidPreparation()
    }
    if (
      input.expectedPointerSha256 !== undefined &&
      input.expectedPointerSha256 !== null &&
      !/^[a-f0-9]{64}$/.test(input.expectedPointerSha256)
    ) {
      invalidPreparation()
    }
    return this.exclusive(async () => {
      await this.recoverInternal()
      canceled(input.signal)
      const claim: Claim = {
        attemptId: randomUUID(),
        owner: await processIdentity(process.pid),
        schemaVersion: 1,
      }
      await publishClaim(this.claimPath(), claim, false, this.runtimeIdentity())
      let retainClaim = false
      let journal: Journal | undefined
      let published = false
      try {
        const previous = await this.pointer()
        if (
          input.expectedPointerSha256 !== undefined &&
          (previous === null ? null : digest(previous)) !== input.expectedPointerSha256
        ) {
          pointerChanged()
        }
        journal = {
          ...claim,
          candidatePointer: null,
          mode: input.mode,
          phase: 'preparing',
          prepared: null,
          previousPointer: encode(previous),
        }
        await this.persist(journal)
        const supplied = await input.prepare()
        const prepared = Object.freeze({
          ...supplied,
          environment: Object.freeze({ ...supplied.environment }),
        })
        if (prepared.runtimeId === runtimeIdOf(previous)) {
          invalidPreparation()
        }
        await this.assertPrepared(prepared)
        journal.prepared = preparedIdentity(prepared)
        journal.candidatePointer = encode(pointerBytes(prepared))
        journal.phase = 'qualifying'
        await this.persist(journal)
        canceled(input.signal)
        await input.qualify(prepared, 'before-activation')
        canceled(input.signal)
        await this.assertPrepared(prepared)
        journal.phase = 'prepared'
        await this.persist(journal)
        await this.assertPointer(previous)
        journal.phase = 'activating'
        await this.persist(journal)
        // Both markers belong to this fresh slot. An error cannot publish half-complete inputs.
        await this.removeMarkers(prepared)
        canceled(input.signal)
        await this.assertPointer(previous)
        await this.publishPointer(decode(journal.candidatePointer), previous, 'activate')
        published = true
        journal.phase = 'activated'
        await this.persist(journal)
        journal.phase = 'post-qualifying'
        await this.persist(journal)
        canceled(input.signal)
        await input.qualify(prepared, 'after-activation')
        canceled(input.signal)
        await this.assertPointer(decode(journal.candidatePointer))
        journal.phase = 'complete'
        await this.persist(journal)
        const previousRuntimeId = runtimeIdOf(previous)
        return {
          runtimeId: prepared.runtimeId,
          ...(previousRuntimeId ? { previousRuntimeId } : {}),
        }
      } catch (error) {
        if (unconfirmed(error)) {
          retainClaim = true
          if (journal) {
            journal.phase = 'recovery-required'
            await this.persist(journal).catch(() => {})
          }
          throw recoveryRequired(false)
        }
        try {
          if (journal) {
            if (published) {
              await this.rollback(journal)
            }
            journal.phase = published ? 'rolled-back' : 'failed'
            await this.persist(journal)
          }
        } catch {
          retainClaim = true
          if (journal) {
            journal.phase = 'recovery-required'
            await this.persist(journal).catch(() => {})
          }
          throw recoveryRequired()
        }
        if (error instanceof RuntimeInstallationError) {
          throw error
        }
        throw new RuntimeInstallationError(
          'RUNTIME_INSTALL_FAILED',
          'The new runtime did not qualify. Previous runtime files were not changed.',
        )
      } finally {
        if (!retainClaim) {
          await dropClaim(this.claimPath(), claim, this.runtimeIdentity())
        }
      }
    })
  }

  async readPointerSha256(): Promise<string | null> {
    await this.assertStorage()
    const bytes = await this.pointer()
    return bytes === null ? null : digest(bytes)
  }

  async recover(): Promise<'none' | 'recovered'> {
    return this.exclusive(() => this.recoverInternal())
  }

  private async assertPointer(expected: Buffer | null): Promise<void> {
    if (!sameBytes(await this.pointer(), expected)) {
      pointerChanged()
    }
  }

  private async assertPrepared(prepared: PreparedOfflineRuntime): Promise<void> {
    if (
      !validId(prepared.runtimeId) ||
      !validId(prepared.releaseId) ||
      !/^[a-f0-9]{64}$/.test(prepared.manifestSha256) ||
      prepared.environmentRoot !== path.join(this.roots.environmentsDir, prepared.runtimeId) ||
      prepared.pythonRoot !== path.join(this.roots.pythonDir, prepared.runtimeId) ||
      prepared.pythonExecutable !== path.join(prepared.environmentRoot, 'bin', 'python')
    ) {
      invalidPreparation()
    }
    for (const directory of [
      prepared.environmentRoot,
      prepared.pythonRoot,
      path.dirname(prepared.pythonExecutable),
    ]) {
      if (
        (await fs.realpath(directory)) !== directory ||
        !(await fs.lstat(directory)).isDirectory()
      ) {
        invalidPreparation()
      }
    }
    const resolved = await fs.realpath(prepared.pythonExecutable)
    if (
      !(inside(prepared.environmentRoot, resolved) || inside(prepared.pythonRoot, resolved)) ||
      !(await fs.stat(prepared.pythonExecutable)).isFile()
    ) {
      invalidPreparation()
    }
    await fs.access(prepared.pythonExecutable, constants.X_OK)
    await this.marker(prepared.environmentRoot, prepared)
    await this.marker(prepared.pythonRoot, prepared)
  }
  private async assertStorage(): Promise<void> {
    if (
      this.roots.pointerFile !== path.join(this.roots.runtimeDir, 'current-runtime.json') ||
      this.roots.runtimeDir !== path.join(this.roots.appDataDir, 'runtime') ||
      this.roots.environmentsDir !== path.join(this.roots.runtimeDir, 'environments') ||
      this.roots.pythonDir !== path.join(this.roots.runtimeDir, 'python')
    ) {
      unsafe()
    }
    try {
      for (const directory of [
        this.roots.appDataDir,
        this.roots.runtimeDir,
        this.roots.environmentsDir,
        this.roots.pythonDir,
      ]) {
        const actual = await fs.lstat(directory, { bigint: true })
        if (
          !path.isAbsolute(directory) ||
          path.resolve(directory) !== directory ||
          (await fs.realpath(directory)) !== directory ||
          !actual.isDirectory()
        ) {
          unsafe()
        }
        const before = this.storageIdentities.get(directory)
        if (before && (before.dev !== actual.dev || before.ino !== actual.ino)) {
          unsafe()
        }
        this.storageIdentities.set(directory, { dev: actual.dev, ino: actual.ino })
      }
    } catch {
      unsafe()
    }
  }

  private claimPath(): string {
    return path.join(this.roots.runtimeDir, RUNTIME_INSTALLATION_CLAIM)
  }

  private async exclusive<T>(work: () => Promise<T>): Promise<T> {
    await this.assertStorage()
    if (activeRoots.has(this.roots.runtimeDir)) {
      busy()
    }
    activeRoots.add(this.roots.runtimeDir)
    try {
      return await work()
    } finally {
      activeRoots.delete(this.roots.runtimeDir)
    }
  }

  private journalPath(): string {
    return path.join(this.roots.runtimeDir, RUNTIME_INSTALLATION_JOURNAL)
  }

  private async marker(root: string, prepared: PreparedOfflineRuntime): Promise<Buffer> {
    const bytes = await readBounded(
      path.join(root, OFFLINE_RUNTIME_INCOMPLETE_MARKER),
      MAX_METADATA_BYTES,
    )
    let value: unknown
    try {
      value = bytes === null ? null : JSON.parse(bytes.toString('utf8'))
    } catch {
      invalidPreparation()
    }
    if (
      !record(value) ||
      keys(value) !== 'releaseId,runtimeId,schemaVersion' ||
      value.schemaVersion !== 1 ||
      value.runtimeId !== prepared.runtimeId ||
      value.releaseId !== prepared.releaseId
    ) {
      invalidPreparation()
    }
    return bytes!
  }

  private async persist(journal: Journal): Promise<void> {
    await this.assertStorage()
    await atomicReplace(this.journalPath(), jsonBytes(journal), this.runtimeIdentity())
  }

  private async pointer(): Promise<Buffer | null> {
    await this.assertStorage()
    return readBounded(this.roots.pointerFile, MAX_POINTER_BYTES, this.runtimeIdentity())
  }

  private async publishPointer(
    bytes: Buffer | null,
    expected: Buffer | null,
    phase: 'activate' | 'rollback',
  ): Promise<void> {
    const guard = async () => {
      await this.hooks.beforePointerPublish?.(phase)
      await this.assertPointer(expected)
    }
    await (bytes === null
      ? removeMetadata(this.roots.pointerFile, this.runtimeIdentity(), guard)
      : atomicReplace(this.roots.pointerFile, bytes, this.runtimeIdentity(), guard))
  }

  private async recoverInternal(): Promise<'none' | 'recovered'> {
    const existingSweep = await readBounded(
      path.join(this.roots.runtimeDir, RUNTIME_INSTALLATION_RECOVERY_CLAIM),
      MAX_METADATA_BYTES,
      this.runtimeIdentity(),
    )
    if (existingSweep !== null) {
      const sweepOwner = parseClaim(existingSweep)
      if (await processIsLive(sweepOwner.owner)) {
        busy()
      }
      throw recoveryRequired()
    }
    const claimBytes = await readBounded(
      this.claimPath(),
      MAX_METADATA_BYTES,
      this.runtimeIdentity(),
    )
    const journalBytes = await readBounded(
      this.journalPath(),
      MAX_METADATA_BYTES,
      this.runtimeIdentity(),
    )
    const claim = claimBytes === null ? null : parseClaim(claimBytes)
    const journal = journalBytes === null ? null : parseJournal(journalBytes, this.roots)
    if (claim === null && (journal === null || terminal(journal.phase))) {
      return 'none'
    }
    const owner = claim?.owner ?? journal?.owner
    if (!owner || !journal || (claim && !sameClaim(claim, journal))) {
      throw recoveryRequired()
    }
    if (await processIsLive(owner)) {
      busy()
    }
    // Only this short sweep guard reclaims a stale install claim. A damaged or interrupted
    // recovery guard itself is never removed merely because its timestamp/PID looks old.
    const sweep: Claim = {
      attemptId: randomUUID(),
      owner: await processIdentity(process.pid),
      schemaVersion: 1,
    }
    const sweepPath = path.join(this.roots.runtimeDir, RUNTIME_INSTALLATION_RECOVERY_CLAIM)
    await publishClaim(sweepPath, sweep, true, this.runtimeIdentity())
    try {
      const currentClaim = await readBounded(
        this.claimPath(),
        MAX_METADATA_BYTES,
        this.runtimeIdentity(),
      )
      const currentJournal = await readBounded(
        this.journalPath(),
        MAX_METADATA_BYTES,
        this.runtimeIdentity(),
      )
      if (
        !sameBytes(currentClaim, claimBytes) ||
        !sameBytes(currentJournal, journalBytes) ||
        (await processIsLive(owner))
      ) {
        throw recoveryRequired()
      }
      if (!terminal(journal.phase)) {
        if (!['activated', 'activating', 'prepared'].includes(journal.phase)) {
          throw recoveryRequired()
        }
        const candidate = decode(journal.candidatePointer)
        const previous = decode(journal.previousPointer)
        const current = await this.pointer()
        if (candidate !== null && sameBytes(current, candidate)) {
          await this.rollback(journal)
        } else if (!sameBytes(current, previous)) {
          throw recoveryRequired()
        }
        journal.phase = candidate !== null ? 'rolled-back' : 'failed'
        await this.persist(journal)
      }
      if (claim) {
        await dropClaim(this.claimPath(), claim, this.runtimeIdentity())
      }
      return 'recovered'
    } finally {
      await dropClaim(sweepPath, sweep, this.runtimeIdentity())
    }
  }

  private async removeMarkers(prepared: PreparedOfflineRuntime): Promise<void> {
    for (const directory of [prepared.environmentRoot, prepared.pythonRoot]) {
      await this.marker(directory, prepared)
      await fs.unlink(path.join(directory, OFFLINE_RUNTIME_INCOMPLETE_MARKER))
      await syncDirectory(directory)
    }
  }

  private async rollback(journal: Journal): Promise<void> {
    const candidate = decode(journal.candidatePointer)
    if (candidate === null) {
      throw recoveryRequired()
    }
    await this.assertPointer(candidate)
    await this.publishPointer(decode(journal.previousPointer), candidate, 'rollback')
  }

  private runtimeIdentity(): DirectoryIdentity {
    return this.storageIdentities.get(this.roots.runtimeDir)!
  }
}

function preparedIdentity(value: PreparedOfflineRuntime): PreparedIdentity {
  const { environmentRoot, manifestSha256, pythonExecutable, pythonRoot, releaseId, runtimeId } =
    value
  return { environmentRoot, manifestSha256, pythonExecutable, pythonRoot, releaseId, runtimeId }
}
function pointerBytes(value: PreparedOfflineRuntime): Buffer {
  return jsonBytes({
    pythonExecutable: value.pythonExecutable,
    runtimeId: value.runtimeId,
    schemaVersion: 1,
  })
}
function validId(value: unknown): value is string {
  return typeof value === 'string' && ID.test(value) && value !== '.' && value !== '..'
}
function inside(root: string, file: string): boolean {
  const relative = path.relative(root, file)
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}
function digest(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}
function jsonBytes(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value)}\n`)
}
function encode(bytes: Buffer | null): string | null {
  return bytes === null ? null : bytes.toString('base64')
}
function decode(value: string | null): Buffer | null {
  return value === null ? null : Buffer.from(value, 'base64')
}
function sameBytes(a: Buffer | null, b: Buffer | null): boolean {
  return a === null ? b === null : b !== null && a.equals(b)
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function keys(value: Record<string, unknown>): string {
  return Object.keys(value).sort().join(',')
}
function validOwner(value: unknown): value is ProcessIdentity {
  return (
    record(value) &&
    keys(value) === 'bootId,pid,startTicks' &&
    typeof value.bootId === 'string' &&
    UUID.test(value.bootId) &&
    Number.isSafeInteger(value.pid) &&
    (value.pid as number) > 0 &&
    (value.pid as number) <= 2_147_483_647 &&
    typeof value.startTicks === 'string' &&
    /^\d{1,24}$/.test(value.startTicks)
  )
}
function parseClaim(bytes: Buffer): Claim {
  let value: unknown
  try {
    value = JSON.parse(bytes.toString('utf8'))
  } catch {
    throw recoveryRequired()
  }
  if (
    !record(value) ||
    keys(value) !== 'attemptId,owner,schemaVersion' ||
    value.schemaVersion !== 1 ||
    typeof value.attemptId !== 'string' ||
    !UUID.test(value.attemptId) ||
    !validOwner(value.owner)
  ) {
    throw recoveryRequired()
  }
  return value as unknown as Claim
}
function parseJournal(bytes: Buffer, roots: RuntimeRoots): Journal {
  let value: unknown
  try {
    value = JSON.parse(bytes.toString('utf8'))
  } catch {
    throw recoveryRequired()
  }
  if (
    !record(value) ||
    keys(value) !==
      'attemptId,candidatePointer,mode,owner,phase,prepared,previousPointer,schemaVersion' ||
    value.schemaVersion !== 1 ||
    typeof value.attemptId !== 'string' ||
    !UUID.test(value.attemptId) ||
    !validOwner(value.owner) ||
    !['install', 'repair'].includes(value.mode as string) ||
    ![
      'activated',
      'activating',
      'complete',
      'failed',
      'post-qualifying',
      'prepared',
      'preparing',
      'qualifying',
      'recovery-required',
      'rolled-back',
    ].includes(value.phase as string)
  ) {
    throw recoveryRequired()
  }
  for (const field of ['previousPointer', 'candidatePointer'] as const) {
    const item = value[field]
    if (
      item !== null &&
      (typeof item !== 'string' ||
        item.length > MAX_POINTER_BYTES * 2 ||
        Buffer.from(item, 'base64').toString('base64') !== item ||
        Buffer.from(item, 'base64').length > MAX_POINTER_BYTES)
    ) {
      throw recoveryRequired()
    }
  }
  if (
    [
      'activated',
      'activating',
      'complete',
      'post-qualifying',
      'prepared',
      'qualifying',
      'rolled-back',
    ].includes(value.phase as string) &&
    value.prepared === null
  ) {
    throw recoveryRequired()
  }
  if (value.prepared !== null) {
    const p = value.prepared
    if (
      !record(p) ||
      keys(p) !==
        'environmentRoot,manifestSha256,pythonExecutable,pythonRoot,releaseId,runtimeId' ||
      !validId(p.runtimeId) ||
      !validId(p.releaseId) ||
      typeof p.manifestSha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(p.manifestSha256) ||
      p.environmentRoot !== path.join(roots.environmentsDir, p.runtimeId) ||
      p.pythonRoot !== path.join(roots.pythonDir, p.runtimeId) ||
      p.pythonExecutable !== path.join(roots.environmentsDir, p.runtimeId, 'bin', 'python') ||
      value.candidatePointer !== encode(pointerBytes(p as unknown as PreparedOfflineRuntime))
    ) {
      throw recoveryRequired()
    }
  } else if (value.candidatePointer !== null) {
    throw recoveryRequired()
  }
  return value as unknown as Journal
}
function sameClaim(a: Claim, b: Claim): boolean {
  return (
    a.attemptId === b.attemptId &&
    a.owner.pid === b.owner.pid &&
    a.owner.startTicks === b.owner.startTicks &&
    a.owner.bootId === b.owner.bootId
  )
}
function terminal(phase: Phase): boolean {
  return phase === 'complete' || phase === 'failed' || phase === 'rolled-back'
}
function runtimeIdOf(bytes: Buffer | null): string | undefined {
  try {
    const value: unknown = bytes === null ? null : JSON.parse(bytes.toString('utf8'))
    return record(value) && validId(value.runtimeId) ? value.runtimeId : undefined
  } catch {
    return undefined
  }
}
function canceled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new RuntimeInstallationError(
      'RUNTIME_INSTALL_CANCELED',
      'Runtime installation was canceled. Previous runtime files were not changed.',
    )
  }
}
function unconfirmed(error: unknown): boolean {
  return (
    record(error) &&
    (error.exitConfirmed === false ||
      error.code === 'WORKER_EXIT_UNCONFIRMED' ||
      error.code === 'RUNTIME_ASSEMBLY_EXIT_UNCONFIRMED')
  )
}
function busy(): never {
  throw new RuntimeInstallationError('RUNTIME_INSTALL_BUSY', 'Another runtime operation is active.')
}
function unsafe(): never {
  throw new RuntimeInstallationError(
    'RUNTIME_INSTALL_STORAGE_INVALID',
    'Runtime storage is unavailable or changed.',
  )
}
function pointerChanged(): never {
  throw new RuntimeInstallationError(
    'RUNTIME_INSTALL_POINTER_CHANGED',
    'Runtime selection changed. Review installation again.',
  )
}
function invalidPreparation(): never {
  throw new RuntimeInstallationError(
    'RUNTIME_INSTALL_PREPARATION_INVALID',
    'The prepared runtime does not describe a fresh complete owned slot.',
  )
}
function recoveryRequired(exitConfirmed = true): RuntimeInstallationError {
  return new RuntimeInstallationError(
    'RUNTIME_INSTALL_RECOVERY_REQUIRED',
    'Runtime installation recovery requires review. Retained slots and metadata were preserved.',
    true,
    exitConfirmed,
  )
}

async function processIdentity(pid: number): Promise<ProcessIdentity> {
  const [bootId, stat] = await Promise.all([
    fs.readFile('/proc/sys/kernel/random/boot_id', 'ascii'),
    fs.readFile(`/proc/${pid}/stat`, 'ascii'),
  ])
  const startTicks = stat
    .slice(stat.lastIndexOf(')') + 1)
    .trim()
    .split(/\s+/)[19]
  const result = { bootId: bootId.trim(), pid, startTicks }
  if (!validOwner(result)) {
    throw recoveryRequired()
  }
  return result
}
async function processIsLive(owner: ProcessIdentity): Promise<boolean> {
  try {
    const current = await processIdentity(owner.pid)
    return current.bootId === owner.bootId && current.startTicks === owner.startTicks
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false
    }
    throw recoveryRequired()
  }
}
async function withDirectory<T>(
  filePath: string,
  expected: DirectoryIdentity | undefined,
  use: (anchoredPath: string, check: () => Promise<void>, handle: fs.FileHandle) => Promise<T>,
): Promise<T> {
  const parent = path.dirname(filePath)
  const handle = await fs.open(
    parent,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  )
  try {
    const opened = await handle.stat({ bigint: true })
    const check = async () => {
      const current = await fs.lstat(parent, { bigint: true })
      if (
        !current.isDirectory() ||
        current.isSymbolicLink() ||
        (await fs.realpath(parent)) !== parent ||
        current.dev !== opened.dev ||
        current.ino !== opened.ino ||
        (expected && (opened.dev !== expected.dev || opened.ino !== expected.ino))
      ) {
        unsafe()
      }
    }
    await check()
    return await use(
      path.join(`/proc/self/fd/${handle.fd}`, path.basename(filePath)),
      check,
      handle,
    )
  } finally {
    await handle.close().catch(() => {
      process.emitWarning('Runtime metadata directory handle closure could not be confirmed.')
    })
  }
}

async function readBounded(
  filePath: string,
  maximum: number,
  expected?: DirectoryIdentity,
): Promise<Buffer | null> {
  return withDirectory(filePath, expected, async (anchored, check) => {
    let handle: fs.FileHandle
    try {
      handle = await fs.open(
        anchored,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      )
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null
      }
      unsafe()
    }
    try {
      const before = await handle.stat({ bigint: true })
      if (!before.isFile() || before.size > BigInt(maximum)) {
        unsafe()
      }
      const bytes = Buffer.alloc(Number(before.size) + 1)
      let offset = 0
      while (offset < bytes.length) {
        const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset)
        if (bytesRead === 0) {
          break
        }
        offset += bytesRead
      }
      const after = await handle.stat({ bigint: true })
      const named = await fs.lstat(anchored, { bigint: true })
      if (
        offset !== Number(before.size) ||
        before.dev !== after.dev ||
        before.ino !== after.ino ||
        before.size !== after.size ||
        before.mtimeNs !== after.mtimeNs ||
        before.ctimeNs !== after.ctimeNs ||
        named.isSymbolicLink() ||
        named.dev !== before.dev ||
        named.ino !== before.ino
      ) {
        unsafe()
      }
      await check()
      return bytes.subarray(0, offset)
    } finally {
      await handle.close()
    }
  })
}

async function atomicReplace(
  destination: string,
  bytes: Buffer,
  expected?: DirectoryIdentity,
  guard?: () => Promise<void>,
): Promise<void> {
  if (bytes.length > MAX_METADATA_BYTES) {
    unsafe()
  }
  await readBounded(destination, MAX_METADATA_BYTES, expected)
  await withDirectory(destination, expected, async (anchored, check, directory) => {
    const temporary = path.join(path.dirname(anchored), `.runtime-metadata-${randomUUID()}.tmp`)
    try {
      const file = await fs.open(temporary, 'wx', 0o600)
      try {
        await file.writeFile(bytes)
        await file.sync()
      } finally {
        await file.close()
      }
      await guard?.()
      await check()
      await fs.rename(temporary, anchored)
      await syncHandle(directory)
    } finally {
      await fs.unlink(temporary).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') {
          process.emitWarning('Runtime metadata temporary cleanup failed.')
        }
      })
    }
  })
}

async function publishClaim(
  destination: string,
  claim: Claim,
  recovery = false,
  expected?: DirectoryIdentity,
): Promise<void> {
  await withDirectory(destination, expected, async (anchored, check, directory) => {
    const temporary = path.join(path.dirname(anchored), `.runtime-claim-${randomUUID()}.tmp`)
    try {
      const file = await fs.open(temporary, 'wx', 0o600)
      try {
        await file.writeFile(jsonBytes(claim))
        await file.sync()
      } finally {
        await file.close()
      }
      await check()
      try {
        await fs.link(temporary, anchored)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
          if (recovery) {
            throw recoveryRequired()
          }
          busy()
        }
        throw error
      }
      await syncHandle(directory)
    } finally {
      await fs.unlink(temporary).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') {
          process.emitWarning('Runtime claim temporary cleanup failed.')
        }
      })
    }
  })
}

async function dropClaim(
  destination: string,
  expected: Claim,
  directory?: DirectoryIdentity,
): Promise<void> {
  const actual = await readBounded(destination, MAX_METADATA_BYTES, directory)
  if (actual === null || !sameClaim(parseClaim(actual), expected)) {
    throw recoveryRequired()
  }
  await removeMetadata(destination, directory)
}

async function removeMetadata(
  destination: string,
  expected?: DirectoryIdentity,
  guard?: () => Promise<void>,
): Promise<void> {
  await withDirectory(destination, expected, async (anchored, check, directory) => {
    await guard?.()
    await check()
    await fs.unlink(anchored)
    await syncHandle(directory)
  })
}

async function syncHandle(handle: fs.FileHandle): Promise<void> {
  // As in Invoke's marker writer, a post-rename fsync warning cannot undo publication.
  await handle.sync().catch(() => {
    process.emitWarning('Runtime metadata directory sync could not be confirmed.')
  })
}

async function syncDirectory(directory: string): Promise<void> {
  // Marker removal is still before pointer publication: failure must abort activation.
  const file = await fs.open(
    directory,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  )
  try {
    await file.sync()
  } finally {
    await file.close()
  }
}
