import { ANIMA_PROMPT_INTERPRETATION } from '../../shared/projects/anima-prompt-weighting.js'

import { createHash } from 'node:crypto'
import { lstat, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { BoundSmartPatchAnimaRegionalInput } from './project-smart-patch-regional-input.js'

import {
  bindSmartPatchAnimaRegionalExecution,
  capturePreparedSmartPatchAnimaRegionalInput,
} from './project-smart-patch-regional-input.js'
import { canonicalRegionalDirectory, withinRegionalPath } from './regional-worker-request.js'
import { ProjectWorkerError } from './worker-client.js'

export interface SmartPatchRegionalWorkerWire {
  bundle: { byteSize: number; path: string; sha256: string }
  protocolVersion: '1'
  reportProgress?: true
  requestId: string
  stagingRoot: string
  type: 'execute-anima-smart-patch-regional'
}

const MAX_BUNDLE_BYTES = 1024 * 1024
const MAX_ALPHA_BYTES = 64 * 1024 * 1024
const MAX_LINE_BYTES = 64 * 1024
const BUNDLE = 'smart-regional.json'

/** Own the complete semantic input before the first asynchronous file operation. */
export function captureSmartPatchRegionalWorkerInput(
  input: BoundSmartPatchAnimaRegionalInput,
): BoundSmartPatchAnimaRegionalInput {
  try {
    const { execution, ...prepared } = structuredClone(input)
    const owned = bindSmartPatchAnimaRegionalExecution(
      capturePreparedSmartPatchAnimaRegionalInput(prepared),
      execution,
    )
    if (owned.promptInterpretation !== ANIMA_PROMPT_INTERPRETATION) {
      invalid('Public Smart regions require the frozen Invoke fragment interpretation.')
    }
    return owned
  } catch (error) {
    if (error instanceof ProjectWorkerError) {
      throw error
    }
    invalid('The complete frozen Smart regional input is invalid or unsupported.')
  }
}

/**
 * Invoke4875 joins regional conditioning to the already prepared INP job. Studio materializes that
 * same complete input in the existing Smart processor root, reusing the established regional
 * descriptor format. The caller retains this entire root through physical inference/CPU exit; this
 * helper creates no nested Canvas lease and never removes another owner's inputs.
 */
export async function prepareSmartPatchRegionalWorkerRequest(
  input: BoundSmartPatchAnimaRegionalInput,
  reportProgress = true,
): Promise<SmartPatchRegionalWorkerWire> {
  const captured = captureSmartPatchRegionalWorkerInput(input)
  if (typeof reportProgress !== 'boolean') {
    invalid('Smart regional progress must be explicitly enabled or disabled.')
  }
  const request = captured.execution
  const root = request.output.stagingRoot
  const images = [
    request.output.pngPath,
    request.latentKeepMask.path,
    ...(request.modelSource ? [request.modelSource.path] : []),
  ]
  const resources = [
    request.inference.model.checkpoint.path,
    request.inference.model.qwen3Encoder.path,
    request.inference.model.vae.path,
    ...request.inference.loras.map((resource) => resource.path),
  ]
  if (
    new Set(images).size !== images.length ||
    images.some((image) => path.dirname(image) !== root || path.extname(image) !== '.png') ||
    resources.some((resource) => resource === root || withinRegionalPath(root, resource))
  ) {
    invalid('Smart regional inputs/output/resources differ from their original staging roles.')
  }
  const identity = await canonicalRegionalDirectory(root)
  const files: { bytes: Buffer; path: string }[] = []
  let alphaBytes = 0
  const regions = captured.recipe.regions.map((region, index) => {
    const bytes = Buffer.from(region.coverage.alpha)
    alphaBytes += bytes.length
    if (alphaBytes > MAX_ALPHA_BYTES) {
      invalid('Smart regional alpha exceeds its existing 64 MiB transport bound.')
    }
    const file = path.join(root, `regional-${index}.alpha8`)
    files.push({ bytes, path: file })
    return {
      ...region,
      coverage: { ...region.coverage, alpha: { $alpha8: descriptor(file, bytes) } },
    }
  })
  const bytes = Buffer.from(
    JSON.stringify({ ...captured, recipe: { ...captured.recipe, regions } }),
    'utf8',
  )
  if (bytes.length > MAX_BUNDLE_BYTES) {
    invalid('Smart regional bundle exceeds the existing 1 MiB metadata bound.')
  }
  const bundlePath = path.join(root, BUNDLE)
  files.push({ bytes, path: bundlePath })
  const wire: SmartPatchRegionalWorkerWire = {
    bundle: descriptor(bundlePath, bytes),
    protocolVersion: '1',
    ...(reportProgress ? { reportProgress: true } : {}),
    requestId: request.requestId,
    stagingRoot: root,
    type: 'execute-anima-smart-patch-regional',
  }
  if (Buffer.byteLength(`${JSON.stringify(wire)}\n`, 'utf8') > MAX_LINE_BYTES) {
    invalid('Smart regional descriptor exceeds the existing 64 KiB wire bound.')
  }
  const protectedPaths = new Set([...images, ...resources])
  if (files.some((file) => protectedPaths.has(file.path))) {
    invalid('Smart regional sidecars collide with original job inputs or output.')
  }
  // Finish all bounded planning and collision checks before the first write. A later I/O failure
  // belongs to the existing root owner, which preserves scratch until physical exit settles.
  for (const file of files) {
    try {
      await lstat(file.path)
      throw new ProjectWorkerError('INVALID_PATH', 'A Smart regional sidecar already exists.')
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
        throw error
      }
    }
  }
  await assertRoot(root, identity)
  for (const file of files) {
    await assertRoot(root, identity)
    await writeFile(file.path, file.bytes, { flag: 'wx', mode: 0o600 })
  }
  await assertRoot(root, identity)
  return Object.freeze({ ...wire, bundle: Object.freeze(wire.bundle) })
}

function descriptor(file: string, bytes: Buffer) {
  return {
    byteSize: bytes.length,
    path: file,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  }
}

async function assertRoot(
  root: string,
  identity: Awaited<ReturnType<typeof canonicalRegionalDirectory>>,
): Promise<void> {
  const current = await canonicalRegionalDirectory(root)
  if (current.dev !== identity.dev || current.ino !== identity.ino) {
    throw new ProjectWorkerError('INVALID_PATH', 'The Smart regional operation root was replaced.')
  }
}

function invalid(message: string): never {
  throw new ProjectWorkerError('INVALID_REQUEST', message)
}
