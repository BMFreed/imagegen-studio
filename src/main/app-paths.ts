import { lstatSync, mkdirSync, realpathSync } from 'node:fs'
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
}
