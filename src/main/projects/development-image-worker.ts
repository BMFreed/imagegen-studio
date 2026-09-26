import { existsSync, realpathSync } from 'node:fs'
import path from 'node:path'

import type { ProjectWorkerLocation } from './worker-client.js'

/**
 * Local source-checkout adapter for the derivatives-only worker. It is never enabled in a packaged
 * application and never establishes Linux/NVIDIA runtime readiness.
 */
export function developmentImageWorkerLocation(input: {
  isPackaged: boolean
  mainDirectory: string
  nodeEnv: string | undefined
  scratchDirectory: string
  smokeOptIn: string | undefined
}): ProjectWorkerLocation | null {
  if (
    input.isPackaged ||
    (input.nodeEnv !== 'development' && !(input.nodeEnv === 'test' && input.smokeOptIn === '1'))
  ) {
    return null
  }

  const pythonExecutable = path.resolve(input.mainDirectory, '../../worker-python/.venv/bin/python')
  if (!existsSync(pythonExecutable)) {
    return null
  }

  let resolvedExecutable: string
  try {
    resolvedExecutable = realpathSync(pythonExecutable)
  } catch {
    return null
  }

  let runtimeRoot = path.dirname(pythonExecutable)
  while (!isWithin(runtimeRoot, resolvedExecutable)) {
    const parent = path.dirname(runtimeRoot)
    if (parent === runtimeRoot) {
      return null
    }
    runtimeRoot = parent
  }
  if (runtimeRoot === path.parse(runtimeRoot).root) {
    return null
  }
  return {
    pythonExecutable,
    runtimeRoot,
    stagingBasePath: input.scratchDirectory,
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
