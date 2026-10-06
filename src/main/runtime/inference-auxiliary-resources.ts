import { createHash } from 'node:crypto'
import { type BigIntStats, constants } from 'node:fs'
import { lstat, mkdir, open, realpath } from 'node:fs/promises'
import path from 'node:path'

import { LAMA_OUTPAINT_ARTIFACT } from './lama-manifest.js'

export interface VerifiedOutpaintInfill {
  readonly byteSize: number
  readonly managedPath: string
  readonly role: 'outpaint-infill'
  readonly sha256: string
}

/** Internal Main collaborator; neither renderer paths nor download/discovery are accepted. */
export interface OutpaintInfillResolver {
  resolveVerifiedOutpaintInfill: () => Promise<VerifiedOutpaintInfill>
}

export class InferenceAuxiliaryResourceError extends Error {
  constructor(
    readonly code: 'GENERATION_RESOURCE_CHANGED' | 'INVALID_INFERENCE_RESOURCE_ROOT',
    message: string,
  ) {
    super(message)
    this.name = 'InferenceAuxiliaryResourceError'
  }
}

export class InferenceAuxiliaryResources implements OutpaintInfillResolver {
  constructor(private readonly resourcesDirectory: string) {
    assertCanonicalPath(resourcesDirectory)
  }

  async resolveVerifiedOutpaintInfill(): Promise<VerifiedOutpaintInfill> {
    const root = await canonicalDirectory(this.resourcesDirectory)
    const managedPath = outpaintInfillResourcePath(root)
    await verifyInferenceAuxiliaryFile({
      byteSize: LAMA_OUTPAINT_ARTIFACT.sizeBytes,
      managedPath,
      sha256: LAMA_OUTPAINT_ARTIFACT.sha256,
    })
    await canonicalDirectory(this.resourcesDirectory)
    return Object.freeze({
      byteSize: LAMA_OUTPAINT_ARTIFACT.sizeBytes,
      managedPath,
      role: LAMA_OUTPAINT_ARTIFACT.role,
      sha256: LAMA_OUTPAINT_ARTIFACT.sha256,
    })
  }
}

/** Durable shared resources deliberately live outside runtime environments and clearable cache. */
export async function createInferenceAuxiliaryResourceRoot(
  appDataDirectory: string,
): Promise<string> {
  const parent = await canonicalDirectory(appDataDirectory)
  const directory = path.join(parent, 'inference-resources')
  await mkdir(directory, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'EEXIST') {
      throw error
    }
  })
  await canonicalDirectory(parent)
  return await canonicalDirectory(directory)
}

/** Fixed installed destination, useful to the future installer and isolated qualification. */
export function outpaintInfillResourcePath(resourcesDirectory: string): string {
  assertCanonicalPath(resourcesDirectory)
  return path.join(resourcesDirectory, LAMA_OUTPAINT_ARTIFACT.filename)
}

/**
 * Descriptor-backed verifier for a bounded exact local artifact. The production resolver above
 * supplies only the fixed LaMa manifest; this generic primitive does not install/register
 * resources.
 */
export async function verifyInferenceAuxiliaryFile(input: {
  byteSize: number
  managedPath: string
  sha256: string
}): Promise<void> {
  const { byteSize, managedPath, sha256 } = input
  if (
    !Number.isSafeInteger(byteSize) ||
    byteSize < 1 ||
    byteSize > LAMA_OUTPAINT_ARTIFACT.sizeBytes ||
    typeof sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(sha256)
  ) {
    throw changed('The auxiliary resource identity is invalid.')
  }
  try {
    assertCanonicalPath(managedPath)
    if ((await realpath(managedPath)) !== managedPath) {
      throw changed('The auxiliary resource path is linked.')
    }
    const file = await open(
      managedPath,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    )
    try {
      const before = await file.stat({ bigint: true })
      if (!before.isFile() || before.size !== BigInt(byteSize)) {
        throw changed('The auxiliary resource is not the expected regular file.')
      }
      const digest = createHash('sha256')
      const buffer = Buffer.allocUnsafe(Math.min(byteSize + 1, 1024 * 1024))
      let size = 0
      while (true) {
        const { bytesRead } = await file.read(
          buffer,
          0,
          Math.min(buffer.length, byteSize - size + 1),
          null,
        )
        if (bytesRead === 0) {
          break
        }
        size += bytesRead
        if (size > byteSize) {
          throw changed('The auxiliary resource grew during verification.')
        }
        digest.update(buffer.subarray(0, bytesRead))
      }
      const after = await file.stat({ bigint: true })
      const atPath = await lstat(managedPath, { bigint: true })
      if (
        size !== byteSize ||
        digest.digest('hex') !== sha256 ||
        !sameIdentity(before, after) ||
        !sameIdentity(before, atPath) ||
        !atPath.isFile() ||
        (await realpath(managedPath)) !== managedPath
      ) {
        throw changed('The exact auxiliary resource changed during verification.')
      }
    } finally {
      await file.close()
    }
  } catch (error) {
    if (
      error instanceof InferenceAuxiliaryResourceError &&
      error.code === 'GENERATION_RESOURCE_CHANGED'
    ) {
      throw error
    }
    throw changed('The exact auxiliary resource is unavailable.')
  }
}

function assertCanonicalPath(value: string): void {
  if (typeof value !== 'string' || !path.isAbsolute(value) || path.resolve(value) !== value) {
    throw new InferenceAuxiliaryResourceError(
      'INVALID_INFERENCE_RESOURCE_ROOT',
      'Inference resource storage must be canonical and absolute.',
    )
  }
}

async function canonicalDirectory(directory: string): Promise<string> {
  assertCanonicalPath(directory)
  try {
    const entry = await lstat(directory)
    if (
      !entry.isDirectory() ||
      entry.isSymbolicLink() ||
      (await realpath(directory)) !== directory
    ) {
      throw new Error('Invalid directory.')
    }
    return directory
  } catch {
    throw new InferenceAuxiliaryResourceError(
      'INVALID_INFERENCE_RESOURCE_ROOT',
      'Inference resource storage is not an unlinked directory.',
    )
  }
}

function sameIdentity(first: BigIntStats, second: BigIntStats): boolean {
  return (
    first.dev === second.dev &&
    first.ino === second.ino &&
    first.size === second.size &&
    first.mtimeNs === second.mtimeNs &&
    first.ctimeNs === second.ctimeNs
  )
}

function changed(message: string): InferenceAuxiliaryResourceError {
  return new InferenceAuxiliaryResourceError('GENERATION_RESOURCE_CHANGED', message)
}
