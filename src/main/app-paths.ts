import {
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  realpathSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export interface AppPaths {
  cacheRoot: string
  databaseRoot: string
  dataRoot: string
  logsRoot: string
  runtimeRoot: string
}

export function resolveAppPaths(
  environment: NodeJS.ProcessEnv = process.env,
  home = os.homedir(),
): AppPaths {
  const xdgDataHome = environment.XDG_DATA_HOME
  const dataHome =
    xdgDataHome && path.isAbsolute(xdgDataHome) ? xdgDataHome : path.join(home, '.local', 'share')
  const dataRoot = path.join(dataHome, 'imagegen-studio')
  return {
    cacheRoot: path.join(dataRoot, 'cache'),
    databaseRoot: path.join(dataRoot, 'database'),
    dataRoot,
    logsRoot: path.join(dataRoot, 'logs'),
    runtimeRoot: path.join(dataRoot, 'runtime'),
  }
}

export function ensureAppPaths(paths: AppPaths): void {
  mkdirSync(paths.dataRoot, { recursive: true })
  const actualRoot = realpathSync(paths.dataRoot)
  const databaseRoot = path.join(actualRoot, 'database')
  mkdirSync(databaseRoot, { recursive: true })
  const entry = lstatSync(databaseRoot)
  if (!entry.isDirectory() || entry.isSymbolicLink()) {
    throw new Error('Invalid application database directory')
  }
  ensurePrivateScratch(path.join(actualRoot, 'scratch'))
}

/**
 * Invoke a61ac4fb uses private temporary staging (image_files_disk.py:stage_delete). Adapt that
 * isolation to the existing fixed Node scratch owner using the descriptor checks already used by
 * generation-staging.ts. Existing payloads keep their identity and bytes.
 */
function ensurePrivateScratch(directory: string): void {
  try {
    mkdirSync(directory, { mode: 0o700 })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error
    }
  }
  const descriptor = openSync(
    directory,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  )
  try {
    const captured = fstatSync(descriptor, { bigint: true })
    const assertCurrent = () => {
      const current = lstatSync(directory, { bigint: true })
      if (
        !captured.isDirectory() ||
        !current.isDirectory() ||
        current.isSymbolicLink() ||
        current.dev !== captured.dev ||
        current.ino !== captured.ino ||
        (process.getuid && captured.uid !== BigInt(process.getuid())) ||
        realpathSync(directory) !== directory
      ) {
        throw new Error('Invalid application scratch directory')
      }
    }
    assertCurrent()
    if ((captured.mode & 0o77n) !== 0n) {
      fchmodSync(descriptor, 0o700)
    }
    assertCurrent()
    if ((fstatSync(descriptor, { bigint: true }).mode & 0o777n) !== 0o700n) {
      throw new Error('Invalid application scratch permissions')
    }
  } finally {
    closeSync(descriptor)
  }
}
