import { createHash } from 'node:crypto'
import { lstat, realpath } from 'node:fs/promises'
import path from 'node:path'

import { resolveProjectLocationKey } from './project-location-registry.js'

export { refreshProjectLocationRegistry } from './project-location-registry.js'

export class ProjectIdentityError extends Error {
  constructor(
    readonly code: 'PROJECT_INVALID_PATH' | 'PROJECT_PATH_UNAVAILABLE',
    message: string,
  ) {
    super(message)
    this.name = 'ProjectIdentityError'
  }
}

/**
 * Resolve one local `.igs` identity before opening a tab or locating recovery. The document ID
 * inside the package is portable; this path identity is not.
 */
export async function canonicalProjectPath(
  filePath: string,
  options: { allowNewFile?: boolean } = {},
): Promise<string> {
  if (!filePath || path.extname(filePath).toLowerCase() !== '.igs') {
    throw new ProjectIdentityError('PROJECT_INVALID_PATH', 'Choose an .igs project file.')
  }
  const absolute = path.resolve(filePath)
  try {
    return await realpath(absolute)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || !options.allowNewFile) {
      throw new ProjectIdentityError(
        'PROJECT_PATH_UNAVAILABLE',
        'The project path is not available.',
      )
    }
  }

  // A dangling symlink must not become a new writable project target.
  try {
    await lstat(absolute)
    throw new ProjectIdentityError('PROJECT_PATH_UNAVAILABLE', 'The project path is not available.')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }
  try {
    return path.join(await realpath(path.dirname(absolute)), path.basename(absolute))
  } catch {
    throw new ProjectIdentityError(
      'PROJECT_PATH_UNAVAILABLE',
      'The project workspace is not available.',
    )
  }
}

export function localProjectRecoveryKey(canonicalPath: string): string {
  return resolveProjectLocationKey(canonicalPath, rawPathDerivedProjectRecoveryKey(canonicalPath))
}

/** Initial compatibility identity; relocation preserves this key independently of current path. */
export function rawPathDerivedProjectRecoveryKey(canonicalPath: string): string {
  if (!path.isAbsolute(canonicalPath) || path.normalize(canonicalPath) !== canonicalPath) {
    throw new ProjectIdentityError('PROJECT_INVALID_PATH', 'The project path is not canonical.')
  }
  return `project-v1-${createHash('sha256').update(canonicalPath).digest('hex')}`
}
