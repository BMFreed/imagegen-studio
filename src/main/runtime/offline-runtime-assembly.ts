/**
 * Source check: launcher c267bdb439519216b277a7a8c6ad408b9d79efce, src/main/install-manager.ts and
 * its src/main/index.ts callers, plus src/lib/command-runner.ts / src/lib/pty-utils.ts.
 * Bootstrap/commands are adapted to immutable final slots, exact signed local wheels and confirmed
 * scope exit. InvokeAI 4875d96531ca6712b288f6e660fcbb34143408c1:
 * invokeai/app/services/model_install/install_staging_ledger.py and caller model_install_default.py
 * supply durable markers/ownership semantics. This owner never activates a pointer, repairs an
 * existing slot or collects files.
 */
import { type ChildProcess, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { constants, type Stats, writeSync } from 'node:fs'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import * as yauzl from 'yauzl'

import type { RuntimeRoots } from './index.js'
import type { RuntimeReleaseManifest, VerifiedRuntimeRelease } from './runtime-release.js'

import { canonicalRuntimeReleaseJson, runtimeReleaseRequirements } from './runtime-release.js'

export const OFFLINE_RUNTIME_INCOMPLETE_MARKER = '.igs-runtime-incomplete.json'
const RUNTIME_ID = /^[a-z0-9][\w.-]{0,127}$/i
const MAX_COMMAND_LOG_BYTES = 8 * 1024 * 1024
const MAX_STDOUT_BYTES = 2 * 1024 * 1024
const MAX_WORKER_FILE_BYTES = 16 * 1024 * 1024
const MAX_WORKER_PAYLOAD_BYTES = 64 * 1024 * 1024
const COMMAND_TIMEOUT_MS = 300_000
const TERMINATE_GRACE_MS = 5000
const CONFIRM_EXIT_MS = 10_000
interface OwnedCommandScope {
  child: ChildProcess
  closed: boolean
  groupId: number | undefined
}
const unconfirmedChildren = new Map<ChildProcess, OwnedCommandScope>()

export type OfflineRuntimeAssemblyStage = 'assembling' | 'copying' | 'verifying'

export interface OfflineRuntimeCommand {
  args: readonly string[]
  cwd: string
  environment: NodeJS.ProcessEnv
  executable: string
  logPath: string
  signal?: AbortSignal
}

export interface OfflineRuntimeCommandResult {
  code: number
  /** The executor must have observed the actual close event, not a timeout. */
  exitConfirmed: boolean
  stderr: string
  stdout: string
}

export type OfflineRuntimeCommandRunner = (
  command: OfflineRuntimeCommand,
) => Promise<OfflineRuntimeCommandResult>

export interface AssembledOfflineRuntime {
  environment: NodeJS.ProcessEnv
  environmentRoot: string
  logPath: string
  manifestSha256: string
  pythonExecutable: string
  pythonRoot: string
  releaseId: string
  runtimeId: string
}

export type PreparedOfflineRuntime = AssembledOfflineRuntime

export class OfflineRuntimeAssemblyError extends Error {
  constructor(
    readonly code:
      | 'RUNTIME_ASSEMBLY_CANCELED'
      | 'RUNTIME_ASSEMBLY_COMMAND_FAILED'
      | 'RUNTIME_ASSEMBLY_DISK_SPACE'
      | 'RUNTIME_ASSEMBLY_EXISTS'
      | 'RUNTIME_ASSEMBLY_EXIT_UNCONFIRMED'
      | 'RUNTIME_ASSEMBLY_FAILED'
      | 'RUNTIME_ASSEMBLY_PACKAGE_MISMATCH'
      | 'RUNTIME_ASSEMBLY_PAYLOAD_CHANGED'
      | 'RUNTIME_ASSEMBLY_STORAGE_INVALID',
    message: string,
    readonly retainedPaths: readonly string[] = [],
    readonly exitConfirmed = true,
  ) {
    super(message)
    this.name = 'OfflineRuntimeAssemblyError'
  }
}

export function hasUnconfirmedOfflineRuntimeCommands(): boolean {
  return unconfirmedChildren.size !== 0
}

/** A failed kill never authorizes another assembly while the owned child remains alive. */
export async function retryUnconfirmedOfflineRuntimeCommandExits(): Promise<boolean> {
  for (const scope of unconfirmedChildren.values()) {
    signalOwnedScope(scope, 'SIGKILL')
    if (await waitForScopeExit(scope, CONFIRM_EXIT_MS)) {
      unconfirmedChildren.delete(scope.child)
    }
  }
  return !hasUnconfirmedOfflineRuntimeCommands()
}

/** Fresh final paths retain incomplete markers on every failure for the Main lifecycle owner. */
export async function assembleOfflineRuntime(input: {
  commandRunner?: OfflineRuntimeCommandRunner
  onStage?: (stage: OfflineRuntimeAssemblyStage) => Promise<void> | void
  release: VerifiedRuntimeRelease
  roots: RuntimeRoots
  runtimeId: string
  signal?: AbortSignal
}): Promise<AssembledOfflineRuntime> {
  const owned: string[] = []
  const { release, roots, runtimeId, signal } = input
  const runner = input.commandRunner ?? runOfflineRuntimeCommand
  let exitConfirmed = true
  try {
    if (!RUNTIME_ID.test(runtimeId) || runtimeId === '.' || runtimeId === '..') {
      storageInvalid()
    }
    if (hasUnconfirmedOfflineRuntimeCommands()) {
      throw new OfflineRuntimeAssemblyError(
        'RUNTIME_ASSEMBLY_EXIT_UNCONFIRMED',
        'An earlier runtime command has not confirmed exit.',
        [],
        false,
      )
    }
    assertNotCanceled(signal)
    await validateRoots(roots)
    await release.verifyCompletePayloadSnapshot()
    const environmentRoot = path.join(roots.environmentsDir, runtimeId)
    const pythonRoot = path.join(roots.pythonDir, runtimeId)
    await assertAbsent(environmentRoot)
    await assertAbsent(pythonRoot)
    const volume = await fs.statfs(roots.runtimeDir, { bigint: true })
    if (volume.bavail * volume.bsize < BigInt(release.manifest.requiredFreeBytes)) {
      throw new OfflineRuntimeAssemblyError(
        'RUNTIME_ASSEMBLY_DISK_SPACE',
        'There is not enough free space for the verified runtime and its retained previous installation.',
      )
    }
    await input.onStage?.('copying')
    assertNotCanceled(signal)
    await fs.mkdir(pythonRoot, { mode: 0o700 })
    owned.push(pythonRoot)
    await writeMarker(pythonRoot, runtimeId, release.manifest.releaseId)
    await fs.mkdir(environmentRoot, { mode: 0o700 })
    owned.push(environmentRoot)
    await writeMarker(environmentRoot, runtimeId, release.manifest.releaseId)
    const bootstrap = path.join(environmentRoot, 'bootstrap')
    await fs.mkdir(bootstrap, { mode: 0o700 })
    const configRoot = path.join(environmentRoot, 'resources', 'sdxl-config')
    await fs.mkdir(configRoot, { mode: 0o700, recursive: true })
    const copied = new Map<string, string>()
    for (const entry of release.manifest.files) {
      assertNotCanceled(signal)
      const destination = copiedDestination(entry.path, pythonRoot, bootstrap, configRoot)
      await fs.mkdir(path.dirname(destination), { mode: 0o700, recursive: true })
      const source = safeJoin(release.directory, entry.path)
      if (entry.kind === 'symlink') {
        // The signed verifier permits links only inside the Python distribution.
        if (
          !entry.path.startsWith('python/') ||
          path.isAbsolute(entry.target) ||
          !isWithin(pythonRoot, path.resolve(path.dirname(destination), entry.target))
        ) {
          storageInvalid()
        }
        if ((await fs.readlink(source)) !== entry.target) {
          payloadChanged()
        }
        await fs.symlink(entry.target, destination)
      } else {
        await copyVerifiedFile(source, destination, entry)
      }
      copied.set(entry.path, destination)
    }
    // Complete source and destination snapshots are checked before executing either binary.
    await release.verifyCompletePayloadSnapshot()
    await verifyCopiedFiles(release.manifest, copied, pythonRoot)
    assertNotCanceled(signal)
    const uv = copied.get(release.manifest.uv.executable)!
    const python = copied.get(release.manifest.python.executable)!
    if (!uv || !python) {
      payloadChanged()
    }
    const pythonExecutable = path.join(environmentRoot, 'bin', 'python')
    const environment: NodeJS.ProcessEnv = {
      CUDA_VISIBLE_DEVICES: '',
      HF_DATASETS_OFFLINE: '1',
      HF_HOME: roots.cacheDir,
      HF_HUB_OFFLINE: '1',
      IGS_SDXL_CONFIG_DIR: configRoot,
      LANG: 'C.UTF-8',
      LC_ALL: 'C.UTF-8',
      PATH: '/usr/bin:/bin',
      TRANSFORMERS_OFFLINE: '1',
      UV_CACHE_DIR: path.join(bootstrap, 'uv-cache'),
      UV_OFFLINE: '1',
      UV_PYTHON_DOWNLOADS: 'never',
    }
    const logPath = path.join(roots.workerLogsDir, `runtime-assembly-${runtimeId}.log`)
    const log = await fs.open(logPath, 'wx', 0o600)
    await log.close()
    const execute = async (executable: string, args: readonly string[]) => {
      assertNotCanceled(signal)
      const result = await runner({
        args,
        cwd: bootstrap,
        environment: { ...environment },
        executable,
        logPath,
        signal,
      })
      if (!result.exitConfirmed) {
        exitConfirmed = false
        throw new OfflineRuntimeAssemblyError(
          'RUNTIME_ASSEMBLY_EXIT_UNCONFIRMED',
          'The runtime command has not confirmed exit. Its incomplete installation was retained.',
          owned,
          false,
        )
      }
      assertNotCanceled(signal)
      if (result.code !== 0) {
        throw new OfflineRuntimeAssemblyError(
          'RUNTIME_ASSEMBLY_COMMAND_FAILED',
          'Offline runtime assembly failed. The previous runtime was not changed.',
        )
      }
      return result.stdout
    }
    const uvVersion = (await execute(uv, ['--version'])).trim()
    const expectedUv = `uv ${release.manifest.uv.version}`
    if (
      uvVersion !== expectedUv &&
      !(
        uvVersion.startsWith(`${expectedUv} (`) &&
        uvVersion.endsWith(')') &&
        !/[\r\n]/.test(uvVersion)
      )
    ) {
      payloadChanged()
    }
    await verifyPythonMetadata(
      await execute(python, ['-I', '-B', '-c', PYTHON_IDENTITY]),
      release.manifest.python.version,
      pythonRoot,
      pythonRoot,
    )
    await input.onStage?.('assembling')
    assertNotCanceled(signal)
    const requirements = runtimeReleaseRequirements(release.manifest)
    const requirementsPath = path.join(bootstrap, 'verified-requirements.txt')
    const requirementsFile = await fs.open(requirementsPath, 'wx', 0o600)
    try {
      await requirementsFile.writeFile(requirements)
      await requirementsFile.sync()
    } finally {
      await requirementsFile.close()
    }
    // The final slot was freshly claimed by us and already holds its incomplete marker.
    // Preserve that owned bootstrap state rather than moving a completed venv later.
    await execute(uv, [
      '--no-config',
      '--offline',
      'venv',
      '--allow-existing',
      '--no-python-downloads',
      '--python',
      python,
      environmentRoot,
    ])
    if (!isWithin(pythonRoot, await fs.realpath(pythonExecutable))) {
      payloadChanged()
    }
    await execute(uv, [
      '--no-config',
      '--offline',
      'pip',
      'sync',
      '--no-index',
      '--no-build',
      '--require-hashes',
      '--link-mode',
      'copy',
      '--find-links',
      path.join(bootstrap, 'wheels'),
      '--python',
      pythonExecutable,
      requirementsPath,
    ])
    await execute(uv, ['--no-config', '--offline', 'pip', 'check', '--python', pythonExecutable])
    await input.onStage?.('verifying')
    const inspection = parseObject(
      await execute(pythonExecutable, ['-I', '-B', '-c', INSTALLED_INSPECTION]),
    )
    verifyPythonFields(inspection, release.manifest.python.version, environmentRoot, pythonRoot)
    const expectedWorker = await workerWheelFiles(release.manifest, copied)
    verifyInstalledDistributions(inspection, release.manifest, environmentRoot)
    if (!sameWorkerFiles(inspection.workerFiles, expectedWorker)) {
      throw new OfflineRuntimeAssemblyError(
        'RUNTIME_ASSEMBLY_PACKAGE_MISMATCH',
        'The installed worker payload differs from its verified release wheel.',
      )
    }
    const workerRoot = inspection.workerRoot
    if (typeof workerRoot !== 'string' || !isWithin(environmentRoot, workerRoot)) {
      payloadChanged()
    }
    // Recheck source and copied immutable inputs; executable commands cannot broaden the release.
    await release.verifyCompletePayloadSnapshot()
    await verifyCopiedFiles(release.manifest, copied, pythonRoot)
    assertNotCanceled(signal)
    const manifestSha256 = createHash('sha256')
      .update(canonicalRuntimeReleaseJson(release.manifest))
      .digest('hex')
    const provenance = await fs.open(
      path.join(environmentRoot, 'runtime-installation.json'),
      'wx',
      0o600,
    )
    try {
      await provenance.writeFile(
        `${JSON.stringify({ manifestSha256, packages: inspection.packages, releaseId: release.manifest.releaseId, runtimeId, schemaVersion: 1, workerFiles: expectedWorker })}\n`,
      )
      await provenance.sync()
    } finally {
      await provenance.close()
    }
    await syncDirectory(environmentRoot)
    // Assembly itself is CPU-only. The caller's explicit Linux/NVIDIA qualification
    // must see its chosen device; do not carry the bootstrap CUDA mask into it.
    const workerEnvironment = { ...environment }
    delete workerEnvironment.CUDA_VISIBLE_DEVICES
    return {
      environment: workerEnvironment,
      environmentRoot,
      logPath,
      manifestSha256,
      pythonExecutable,
      pythonRoot,
      releaseId: release.manifest.releaseId,
      runtimeId,
    }
  } catch (error) {
    if (error instanceof OfflineRuntimeAssemblyError) {
      throw new OfflineRuntimeAssemblyError(
        error.code,
        error.message,
        [...new Set([...owned, ...error.retainedPaths])],
        error.exitConfirmed && exitConfirmed,
      )
    }
    throw new OfflineRuntimeAssemblyError(
      'RUNTIME_ASSEMBLY_FAILED',
      'Offline runtime assembly did not complete. The previous runtime was not changed; any incomplete slots were retained.',
      owned,
      exitConfirmed,
    )
  }
}

const PYTHON_IDENTITY =
  'import json,platform,sys; print(json.dumps({"pythonVersion":platform.python_version(),"prefix":sys.prefix,"basePrefix":sys.base_prefix}))'
const INSTALLED_INSPECTION = String.raw`import hashlib,importlib.metadata,json,pathlib,platform,sys
worker=importlib.metadata.distribution('imagegen-worker')
root=pathlib.Path(worker.locate_file('imagegen_worker')).resolve()
packages=[]
for d in importlib.metadata.distributions():
 direct=json.loads(d.read_text('direct_url.json') or '{}')
 packages.append({'name':d.metadata['Name'],'version':d.version,'root':str(pathlib.Path(d.locate_file('')).resolve()),'direct':direct})
files={}
entries=0
total=0
for p in root.rglob('*'):
 entries+=1
 if entries>5000: raise RuntimeError('Installed worker file count exceeds its bound')
 if '__pycache__' in p.parts or p.suffix=='.pyc': continue
 if p.is_symlink(): raise RuntimeError('Installed worker contains symlink')
 if p.is_file():
  size=p.stat().st_size
  total+=size
  if size>16777216 or total>67108864: raise RuntimeError('Installed worker bytes exceed their bound')
  files[str(p.relative_to(root))]={'bytes':size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
print(json.dumps({'pythonVersion':platform.python_version(),'prefix':sys.prefix,'basePrefix':sys.base_prefix,'packages':packages,'workerRoot':str(root),'workerFiles':files}))`

type ReleaseFile = Extract<RuntimeReleaseManifest['files'][number], { kind: 'file' }>

/** Shell-free bounded command adaptation; a deadline never means a physical exit. */
export async function runOfflineRuntimeCommand(
  command: OfflineRuntimeCommand,
): Promise<OfflineRuntimeCommandResult> {
  if (!path.isAbsolute(command.executable) || !path.isAbsolute(command.cwd)) {
    storageInvalid()
  }
  assertNotCanceled(command.signal)
  const descriptor = await fs.open(
    command.logPath,
    constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  )
  let info: Stats
  try {
    info = await descriptor.stat()
  } catch (error) {
    await descriptor.close()
    throw error
  }
  if (!info.isFile() || info.size > MAX_COMMAND_LOG_BYTES) {
    await descriptor.close()
    storageInvalid()
  }
  let child: ChildProcess
  try {
    assertNotCanceled(command.signal)
    // uv may launch its interpreter. An isolated group lets cancellation fence all
    // descendants from this invocation without signaling unrelated application work.
    child = spawn(command.executable, [...command.args], {
      cwd: command.cwd,
      detached: true,
      env: command.environment,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    await descriptor.close()
    throw error
  }
  const scope: OwnedCommandScope = { child, closed: false, groupId: child.pid }
  let fault: Error | null = null
  let logBytes = info.size
  let stdoutBytes = 0
  let stderr = ''
  let stdout = ''
  let exitCode = 1
  let terminateTimer: ReturnType<typeof setTimeout> | undefined
  let confirmTimer: ReturnType<typeof setTimeout> | undefined
  let rejectUnconfirmed: ((error: Error) => void) | undefined
  let closeDescriptorPromise: Promise<void> | undefined
  const closeDescriptor = () =>
    (closeDescriptorPromise ??= (async () => {
      try {
        await descriptor.sync()
      } finally {
        await descriptor.close()
      }
    })())
  const retainUntilExit = () => {
    unconfirmedChildren.set(child, scope)
    const observe = () => {
      if (ownedScopeHasExited(scope)) {
        unconfirmedChildren.delete(child)
        void closeDescriptor().catch(() => {})
      } else {
        setTimeout(observe, 100).unref()
      }
    }
    observe()
  }
  const stop = (error: Error) => {
    fault ??= error
    if (ownedScopeHasExited(scope) || terminateTimer) {
      return
    }
    signalOwnedScope(scope, 'SIGTERM')
    terminateTimer = setTimeout(() => signalOwnedScope(scope, 'SIGKILL'), TERMINATE_GRACE_MS)
    confirmTimer = setTimeout(() => {
      if (!ownedScopeHasExited(scope)) {
        retainUntilExit()
        rejectUnconfirmed?.(
          new OfflineRuntimeAssemblyError(
            'RUNTIME_ASSEMBLY_EXIT_UNCONFIRMED',
            'A runtime command did not confirm physical exit. Its files were retained.',
            [],
            false,
          ),
        )
      }
    }, TERMINATE_GRACE_MS + CONFIRM_EXIT_MS)
  }
  const consume = (chunk: Buffer, kind: 'stderr' | 'stdout') => {
    logBytes += chunk.length
    if (logBytes > MAX_COMMAND_LOG_BYTES) {
      stop(new Error('Runtime command log exceeded its bound.'))
      return
    }
    try {
      let offset = 0
      while (offset < chunk.length) {
        offset += writeSync(descriptor.fd, chunk, offset, chunk.length - offset)
      }
    } catch (error) {
      stop(error instanceof Error ? error : new Error('Runtime command logging failed.'))
      return
    }
    if (kind === 'stdout') {
      stdoutBytes += chunk.length
      if (stdoutBytes > MAX_STDOUT_BYTES) {
        stop(new Error('Runtime command metadata exceeded its bound.'))
        return
      }
      stdout += chunk.toString('utf8')
    } else {
      stderr = (stderr + chunk.toString('utf8')).slice(-64 * 1024)
    }
  }
  child.stdout?.on('data', (chunk: Buffer) => consume(chunk, 'stdout'))
  child.stderr?.on('data', (chunk: Buffer) => consume(chunk, 'stderr'))
  child.stdout?.once('error', stop)
  child.stderr?.once('error', stop)
  const aborted = () =>
    stop(
      new OfflineRuntimeAssemblyError(
        'RUNTIME_ASSEMBLY_CANCELED',
        'Runtime installation was canceled.',
      ),
    )
  command.signal?.addEventListener('abort', aborted, { once: true })
  const deadline = setTimeout(
    () =>
      stop(
        new OfflineRuntimeAssemblyError(
          'RUNTIME_ASSEMBLY_COMMAND_FAILED',
          'A runtime command exceeded its deadline.',
        ),
      ),
    COMMAND_TIMEOUT_MS,
  )
  let deferredLogClose = false
  let checkExitTimer: ReturnType<typeof setInterval> | undefined
  try {
    if (command.signal?.aborted) {
      aborted()
    }
    return await new Promise<OfflineRuntimeCommandResult>((resolve, reject) => {
      rejectUnconfirmed = reject
      const checkExit = () => {
        if (ownedScopeHasExited(scope)) {
          unconfirmedChildren.delete(child)
          if (fault) {
            reject(fault)
          } else {
            resolve({ code: exitCode, exitConfirmed: true, stderr, stdout })
          }
        } else if (scope.closed) {
          stop(new Error('A runtime command left an owned descendant process running.'))
        }
      }
      child.once('error', (error) => {
        fault ??= error
      })
      child.once('close', (code) => {
        scope.closed = true
        exitCode = code ?? 1
        checkExit()
      })
      checkExitTimer = setInterval(checkExit, 100)
    })
  } catch (error) {
    if (error instanceof OfflineRuntimeAssemblyError && !error.exitConfirmed) {
      deferredLogClose = true
    }
    throw error
  } finally {
    clearTimeout(deadline)
    clearTimeout(terminateTimer)
    clearTimeout(confirmTimer)
    clearInterval(checkExitTimer)
    command.signal?.removeEventListener('abort', aborted)
    if (!deferredLogClose) {
      await closeDescriptor()
    }
  }
}

async function validateRoots(roots: RuntimeRoots): Promise<void> {
  if (
    roots.environmentsDir !== path.join(roots.runtimeDir, 'environments') ||
    roots.pythonDir !== path.join(roots.runtimeDir, 'python')
  ) {
    storageInvalid()
  }
  for (const directory of [
    roots.runtimeDir,
    roots.environmentsDir,
    roots.pythonDir,
    roots.workerLogsDir,
    roots.cacheDir,
  ]) {
    if (
      !path.isAbsolute(directory) ||
      path.resolve(directory) !== directory ||
      (await fs.realpath(directory)) !== directory
    ) {
      storageInvalid()
    }
    const stat = await fs.lstat(directory)
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      storageInvalid()
    }
  }
}

function copiedDestination(
  relative: string,
  pythonRoot: string,
  bootstrap: string,
  configRoot: string,
): string {
  if (relative.startsWith('python/')) {
    return safeJoin(pythonRoot, relative.slice(7))
  }
  if (relative.startsWith('config/')) {
    return safeJoin(configRoot, relative.slice(7))
  }
  return safeJoin(bootstrap, relative)
}

function safeJoin(root: string, relative: string): string {
  if (
    !relative ||
    relative.includes('\\') ||
    path.posix.isAbsolute(relative) ||
    relative.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    storageInvalid()
  }
  const result = path.join(root, relative)
  if (!isWithin(root, result)) {
    storageInvalid()
  }
  return result
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return (
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  )
}

async function assertAbsent(target: string): Promise<void> {
  try {
    await fs.lstat(target)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return
    }
    throw error
  }
  throw new OfflineRuntimeAssemblyError(
    'RUNTIME_ASSEMBLY_EXISTS',
    'The selected runtime slot already exists. Start a new install or repair attempt.',
  )
}

async function writeMarker(root: string, runtimeId: string, releaseId: string): Promise<void> {
  const file = await fs.open(path.join(root, OFFLINE_RUNTIME_INCOMPLETE_MARKER), 'wx', 0o600)
  try {
    await file.writeFile(`${JSON.stringify({ releaseId, runtimeId, schemaVersion: 1 })}\n`)
    await file.sync()
  } finally {
    await file.close()
  }
  await syncDirectory(root)
  await syncDirectory(path.dirname(root))
}

async function syncDirectory(directory: string): Promise<void> {
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

async function copyVerifiedFile(
  source: string,
  destination: string,
  expected: ReleaseFile,
): Promise<void> {
  const reader = await fs.open(
    source,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  )
  let writer: Awaited<ReturnType<typeof fs.open>> | undefined
  try {
    const before = await reader.stat({ bigint: true })
    if (!before.isFile() || before.size !== BigInt(expected.sizeBytes)) {
      payloadChanged()
    }
    writer = await fs.open(destination, 'wx', expected.executable ? 0o700 : 0o600)
    const chunk = Buffer.allocUnsafe(1024 * 1024)
    const hash = createHash('sha256')
    let count = 0
    for (;;) {
      const { bytesRead } = await reader.read(chunk, 0, chunk.length, null)
      if (!bytesRead) {
        break
      }
      count += bytesRead
      if (count > expected.sizeBytes) {
        payloadChanged()
      }
      hash.update(chunk.subarray(0, bytesRead))
      let offset = 0
      while (offset < bytesRead) {
        offset += (await writer.write(chunk, offset, bytesRead - offset)).bytesWritten
      }
    }
    const after = await reader.stat({ bigint: true })
    const atPath = await fs.lstat(source, { bigint: true })
    if (
      count !== expected.sizeBytes ||
      hash.digest('hex') !== expected.sha256 ||
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs ||
      atPath.dev !== before.dev ||
      atPath.ino !== before.ino ||
      atPath.isSymbolicLink()
    ) {
      payloadChanged()
    }
    await writer.sync()
  } finally {
    await writer?.close()
    await reader.close()
  }
}

async function verifyCopiedFiles(
  manifest: RuntimeReleaseManifest,
  copied: Map<string, string>,
  pythonRoot: string,
): Promise<void> {
  for (const entry of manifest.files) {
    const destination = copied.get(entry.path)
    if (!destination) {
      payloadChanged()
    }
    if (entry.kind === 'symlink') {
      if (
        (await fs.readlink(destination)) !== entry.target ||
        !isWithin(pythonRoot, await fs.realpath(destination))
      ) {
        payloadChanged()
      }
      continue
    }
    const file = await fs.open(
      destination,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    )
    try {
      const before = await file.stat({ bigint: true })
      if (
        !before.isFile() ||
        before.size !== BigInt(entry.sizeBytes) ||
        Boolean(Number(before.mode) & 0o111) !== entry.executable
      ) {
        payloadChanged()
      }
      const chunk = Buffer.allocUnsafe(1024 * 1024)
      const hash = createHash('sha256')
      let count = 0
      for (;;) {
        const { bytesRead } = await file.read(chunk, 0, chunk.length, null)
        if (!bytesRead) {
          break
        }
        count += bytesRead
        hash.update(chunk.subarray(0, bytesRead))
      }
      const after = await file.stat({ bigint: true })
      const atPath = await fs.lstat(destination, { bigint: true })
      if (
        count !== entry.sizeBytes ||
        hash.digest('hex') !== entry.sha256 ||
        before.dev !== after.dev ||
        before.ino !== after.ino ||
        before.size !== after.size ||
        before.mtimeNs !== after.mtimeNs ||
        before.ctimeNs !== after.ctimeNs ||
        atPath.dev !== before.dev ||
        atPath.ino !== before.ino ||
        atPath.isSymbolicLink()
      ) {
        payloadChanged()
      }
    } finally {
      await file.close()
    }
  }
}

function parseObject(text: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(text)
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return value as Record<string, unknown>
    }
  } catch {
    /* All malformed child metadata is a verification refusal. */
  }
  throw new OfflineRuntimeAssemblyError(
    'RUNTIME_ASSEMBLY_PACKAGE_MISMATCH',
    'The installed runtime metadata could not be verified.',
  )
}

function verifyPythonMetadata(
  text: string,
  version: string,
  prefix: string,
  basePrefix: string,
): void {
  verifyPythonFields(parseObject(text), version, prefix, basePrefix)
}

function verifyPythonFields(
  value: Record<string, unknown>,
  version: string,
  prefix: string,
  basePrefix: string,
): void {
  if (
    value.pythonVersion !== version ||
    value.prefix !== prefix ||
    value.basePrefix !== basePrefix
  ) {
    throw new OfflineRuntimeAssemblyError(
      'RUNTIME_ASSEMBLY_PACKAGE_MISMATCH',
      'The installed Python version or app-owned prefix differs from the release.',
    )
  }
}

function normalizedDistribution(name: string): string {
  return name.toLowerCase().replaceAll(/[-_.]+/g, '-')
}

function sameWorkerFiles(
  raw: unknown,
  expected: Record<string, { bytes: number; sha256: string }>,
): boolean {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return false
  }
  const actual = raw as Record<string, unknown>
  return (
    Object.keys(actual).length === Object.keys(expected).length &&
    Object.entries(expected).every(([name, ref]) => {
      if (!Object.hasOwn(actual, name)) {
        return false
      }
      const item = actual[name]
      return (
        typeof item === 'object' &&
        item !== null &&
        !Array.isArray(item) &&
        Object.keys(item).sort().join(',') === 'bytes,sha256' &&
        (item as Record<string, unknown>).bytes === ref.bytes &&
        (item as Record<string, unknown>).sha256 === ref.sha256
      )
    })
  )
}

function verifyInstalledDistributions(
  value: Record<string, unknown>,
  manifest: RuntimeReleaseManifest,
  environmentRoot: string,
): void {
  if (!Array.isArray(value.packages)) {
    payloadChanged()
  }
  const expected = new Map(
    manifest.wheels.map((wheel) => [normalizedDistribution(wheel.distribution), wheel.version]),
  )
  const actual = new Map<string, string>()
  for (const raw of value.packages) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      payloadChanged()
    }
    const entry = raw as Record<string, unknown>
    if (
      typeof entry.name !== 'string' ||
      typeof entry.version !== 'string' ||
      typeof entry.root !== 'string' ||
      !isWithin(environmentRoot, entry.root)
    ) {
      payloadChanged()
    }
    const name = normalizedDistribution(entry.name)
    if (actual.has(name)) {
      payloadChanged()
    }
    actual.set(name, entry.version)
    // Offline wheels need no direct_url metadata at all; reject editable/path/url provenance.
    if (
      typeof entry.direct !== 'object' ||
      entry.direct === null ||
      Array.isArray(entry.direct) ||
      Object.keys(entry.direct).length
    ) {
      payloadChanged()
    }
  }
  if (
    actual.size !== expected.size ||
    [...expected].some(([name, version]) => actual.get(name) !== version)
  ) {
    throw new OfflineRuntimeAssemblyError(
      'RUNTIME_ASSEMBLY_PACKAGE_MISMATCH',
      'Installed distribution membership differs from the exact verified release.',
    )
  }
}

async function workerWheelFiles(
  manifest: RuntimeReleaseManifest,
  copied: Map<string, string>,
): Promise<Record<string, { bytes: number; sha256: string }>> {
  const wheel = manifest.wheels.find(
    (entry) => normalizedDistribution(entry.distribution) === 'imagegen-worker',
  )
  if (!wheel) {
    payloadChanged()
  }
  const file = copied.get(wheel.path)
  if (!file) {
    payloadChanged()
  }
  const zip = await yauzl.openPromise(file, {
    autoClose: false,
    lazyEntries: true,
    strictFileNames: true,
    validateEntrySizes: true,
  })
  const entries: [string, { bytes: number; sha256: string }][] = []
  let count = 0
  let total = 0
  try {
    for await (const entry of zip.eachEntry()) {
      if (
        ++count > 5000 ||
        entry.isEncrypted() ||
        entry.fileName.includes('\\') ||
        entry.fileName.split('/').includes('..') ||
        path.posix.isAbsolute(entry.fileName)
      ) {
        payloadChanged()
      }
      if (!entry.fileName.startsWith('imagegen_worker/') || entry.fileName.endsWith('/')) {
        continue
      }
      const relative = entry.fileName.slice('imagegen_worker/'.length)
      if (
        !relative ||
        entry.uncompressedSize > MAX_WORKER_FILE_BYTES ||
        ((entry.externalFileAttributes >>> 16) & 0o17_0000) === 0o12_0000
      ) {
        payloadChanged()
      }
      const hash = createHash('sha256')
      let bytes = 0
      const stream = await zip.openReadStreamPromise(entry)
      for await (const chunk of stream) {
        bytes += (chunk as Buffer).length
        total += (chunk as Buffer).length
        if (bytes > MAX_WORKER_FILE_BYTES || total > MAX_WORKER_PAYLOAD_BYTES) {
          stream.destroy()
          payloadChanged()
        }
        hash.update(chunk as Buffer)
      }
      if (bytes !== entry.uncompressedSize || entries.some(([name]) => name === relative)) {
        payloadChanged()
      }
      entries.push([relative, { bytes, sha256: hash.digest('hex') }])
    }
  } finally {
    zip.close()
  }
  if (!entries.some(([name]) => name === '__init__.py')) {
    payloadChanged()
  }
  return Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b)))
}
function assertNotCanceled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new OfflineRuntimeAssemblyError(
      'RUNTIME_ASSEMBLY_CANCELED',
      'Runtime installation was canceled. The previous runtime was not changed.',
    )
  }
}
function storageInvalid(): never {
  throw new OfflineRuntimeAssemblyError(
    'RUNTIME_ASSEMBLY_STORAGE_INVALID',
    'App-owned runtime storage is unavailable or changed.',
  )
}

function payloadChanged(): never {
  throw new OfflineRuntimeAssemblyError(
    'RUNTIME_ASSEMBLY_PAYLOAD_CHANGED',
    'Verified runtime artifacts changed. Start a fresh install attempt.',
  )
}

function ownedScopeHasExited(scope: OwnedCommandScope): boolean {
  if (!scope.closed) {
    return false
  }
  if (scope.groupId === undefined) {
    return true
  }
  try {
    process.kill(-scope.groupId, 0)
    return false
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ESRCH'
  }
}

function signalOwnedScope(scope: OwnedCommandScope, signal: NodeJS.Signals): void {
  if (ownedScopeHasExited(scope) || scope.groupId === undefined) {
    return
  }
  try {
    process.kill(-scope.groupId, signal)
  } catch {
    /* Only actual group absence confirms exit. */
  }
}

function waitForScopeExit(scope: OwnedCommandScope, milliseconds: number): Promise<boolean> {
  return new Promise((resolve) => {
    if (ownedScopeHasExited(scope)) {
      resolve(true)
      return
    }
    const deadline = Date.now() + milliseconds
    const check = () => {
      if (ownedScopeHasExited(scope)) {
        resolve(true)
        return
      }
      if (Date.now() >= deadline) {
        resolve(false)
        return
      }
      setTimeout(check, 100)
    }
    check()
  })
}
