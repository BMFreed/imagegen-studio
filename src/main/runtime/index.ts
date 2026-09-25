import type { ApiResult, RuntimeStatus } from '../../shared/api.js'

import { constants } from 'node:fs'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

const POINTER_SCHEMA_VERSION = 1
const MAX_POINTER_BYTES = 16 * 1024
const RUNTIME_ID_PATTERN = /^[a-z0-9][\w.-]{0,127}$/i

export interface RuntimeRoots {
  appDataDir: string
  cacheDir: string
  downloadsDir: string
  environmentsDir: string
  logsDir: string
  pointerFile: string
  pythonDir: string
  runtimeDir: string
  uvCacheDir: string
  workerLogsDir: string
}

export interface RuntimeHost {
  arch: string
  platform: NodeJS.Platform
}

interface ActiveRuntimePointer {
  pythonExecutable: string
  runtimeId: string
  schemaVersion: number
}

type PointerRead =
  { kind: 'invalid' } | { kind: 'missing' } | { kind: 'valid'; value: ActiveRuntimePointer }

export class RuntimeManager {
  private readonly host: RuntimeHost
  private readonly listeners = new Set<(status: RuntimeStatus) => void>()
  private previousStatus: RuntimeStatus | null = null
  private readonly roots: RuntimeRoots

  constructor(
    roots: RuntimeRoots,
    host: RuntimeHost = { arch: process.arch, platform: process.platform },
  ) {
    this.roots = roots
    this.host = host
  }

  async getStatus(): Promise<ApiResult<RuntimeStatus>> {
    let status: RuntimeStatus
    if (this.host.platform !== 'linux' || this.host.arch !== 'x64') {
      status = {
        detail: 'The first release supports Linux x64 with an NVIDIA GPU.',
        kind: 'unsupported',
        profile: null,
      }
    } else {
      let pointer: PointerRead
      try {
        pointer = await readPointer(this.roots)
      } catch {
        return {
          error: {
            code: 'RUNTIME_STATUS_UNAVAILABLE',
            message: 'Cannot inspect the application runtime.',
          },
          ok: false,
        }
      }

      if (pointer.kind === 'missing') {
        status = {
          detail:
            'The Linux/NVIDIA runtime has not been installed. GPU compatibility is checked during setup.',
          kind: 'not-installed',
          profile: 'linux-nvidia',
        }
      } else if (pointer.kind === 'invalid') {
        status = {
          detail: 'The installed runtime metadata or Python executable is missing or invalid.',
          kind: 'needs-repair',
          profile: 'linux-nvidia',
        }
      } else {
        // A pointer and an executable are not a successful worker self-test.
        status = {
          detail: 'The runtime exists, but this application version cannot verify its worker yet.',
          kind: 'needs-repair',
          profile: 'linux-nvidia',
          runtimeId: pointer.value.runtimeId,
        }
      }
    }

    if (this.previousStatus && JSON.stringify(this.previousStatus) !== JSON.stringify(status)) {
      for (const listener of this.listeners) {
        try {
          listener(status)
        } catch {
          // A failed event consumer must not turn a successful status query into an IPC error.
        }
      }
    }
    this.previousStatus = status
    return { ok: true, value: status }
  }

  async install(): Promise<ApiResult<RuntimeStatus>> {
    return {
      error: {
        code: 'RUNTIME_INSTALL_UNAVAILABLE',
        message:
          'Runtime installation will be available after the verified installer is implemented.',
      },
      ok: false,
    }
  }

  onStatusChanged(listener: (status: RuntimeStatus) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async repair(): Promise<ApiResult<RuntimeStatus>> {
    return {
      error: {
        code: 'RUNTIME_INSTALL_UNAVAILABLE',
        message: 'Runtime repair will be available after the verified installer is implemented.',
      },
      ok: false,
    }
  }
}

/**
 * Creates only app-owned directories. The caller passes Electron's userData path; no path here is
 * derived from PATH, a project file, or renderer input.
 */
export async function createRuntimeRoots(appDataDirectory: string): Promise<RuntimeRoots> {
  if (!path.isAbsolute(appDataDirectory)) {
    throw new Error('The application data directory must be absolute.')
  }

  await fs.mkdir(appDataDirectory, { recursive: true })
  const appDataDir = await fs.realpath(appDataDirectory)

  async function addDirectory(parent: string, name: string): Promise<string> {
    const directory = path.join(parent, name)
    try {
      await fs.mkdir(directory)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error
      }
    }

    // A pre-existing symlink must not move runtime operations outside userData.
    const entry = await fs.lstat(directory)
    if (
      !entry.isDirectory() ||
      entry.isSymbolicLink() ||
      (await fs.realpath(directory)) !== directory
    ) {
      throw new Error(`Invalid application data directory: ${name}`)
    }
    return directory
  }

  const runtimeDir = await addDirectory(appDataDir, 'runtime')
  const pythonDir = await addDirectory(runtimeDir, 'python')
  const environmentsDir = await addDirectory(runtimeDir, 'environments')
  const cacheDir = await addDirectory(appDataDir, 'cache')
  const uvCacheDir = await addDirectory(cacheDir, 'uv')
  const downloadsDir = await addDirectory(cacheDir, 'runtime-downloads')
  const logsDir = await addDirectory(appDataDir, 'logs')
  const workerLogsDir = await addDirectory(logsDir, 'worker')

  return {
    appDataDir,
    cacheDir,
    downloadsDir,
    environmentsDir,
    logsDir,
    pointerFile: path.join(runtimeDir, 'current-runtime.json'),
    pythonDir,
    runtimeDir,
    uvCacheDir,
    workerLogsDir,
  }
}

function isWithin(parent: string, target: string): boolean {
  const relative = path.relative(parent, target)
  return (
    relative !== '' &&
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  )
}

async function readPointer(roots: RuntimeRoots): Promise<PointerRead> {
  let handle: fs.FileHandle
  try {
    // NOFOLLOW prevents a pointer symlink from reading an arbitrary user file.
    handle = await fs.open(
      roots.pointerFile,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    )
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { kind: 'missing' }
    }
    if ((error as NodeJS.ErrnoException).code === 'ELOOP') {
      return { kind: 'invalid' }
    }
    throw error
  }

  try {
    const entry = await handle.stat()
    if (!entry.isFile() || entry.size > MAX_POINTER_BYTES) {
      return { kind: 'invalid' }
    }

    // Bound the actual read as well as stat(): another process may grow the file
    // after the size check, and a corrupt pointer must not exhaust the main process.
    const bytes = Buffer.alloc(MAX_POINTER_BYTES + 1)
    let totalRead = 0
    while (totalRead < bytes.length) {
      const { bytesRead } = await handle.read(bytes, totalRead, bytes.length - totalRead, totalRead)
      if (bytesRead === 0) {
        break
      }
      totalRead += bytesRead
    }
    if (totalRead > MAX_POINTER_BYTES) {
      return { kind: 'invalid' }
    }
    const contents = bytes.subarray(0, totalRead).toString('utf8')

    let parsed: unknown
    try {
      parsed = JSON.parse(contents)
    } catch {
      return { kind: 'invalid' }
    }
    if (typeof parsed !== 'object' || parsed === null) {
      return { kind: 'invalid' }
    }

    const pointer = parsed as Partial<ActiveRuntimePointer>
    if (
      pointer.schemaVersion !== POINTER_SCHEMA_VERSION ||
      typeof pointer.runtimeId !== 'string' ||
      !RUNTIME_ID_PATTERN.test(pointer.runtimeId) ||
      pointer.runtimeId === '.' ||
      pointer.runtimeId === '..' ||
      typeof pointer.pythonExecutable !== 'string' ||
      !path.isAbsolute(pointer.pythonExecutable)
    ) {
      return { kind: 'invalid' }
    }

    const environmentDir = path.join(roots.environmentsDir, pointer.runtimeId)
    const expectedPython = path.join(environmentDir, 'bin', 'python')
    if (path.normalize(pointer.pythonExecutable) !== expectedPython) {
      return { kind: 'invalid' }
    }

    try {
      const environment = await fs.lstat(environmentDir)
      if (!environment.isDirectory() || environment.isSymbolicLink()) {
        return { kind: 'invalid' }
      }
      if ((await fs.realpath(environmentDir)) !== environmentDir) {
        return { kind: 'invalid' }
      }

      const executable = await fs.realpath(expectedPython)
      if (!isWithin(roots.runtimeDir, executable) || !(await fs.stat(executable)).isFile()) {
        return { kind: 'invalid' }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { kind: 'invalid' }
      }
      throw error
    }

    return {
      kind: 'valid',
      value: {
        pythonExecutable: expectedPython,
        runtimeId: pointer.runtimeId,
        schemaVersion: POINTER_SCHEMA_VERSION,
      },
    }
  } finally {
    await handle.close()
  }
}
