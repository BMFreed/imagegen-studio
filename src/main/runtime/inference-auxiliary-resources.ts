import { createHash } from 'node:crypto'
import { type BigIntStats, constants } from 'node:fs'
import { lstat, mkdir, open, realpath } from 'node:fs/promises'
import path from 'node:path'

import { LAMA_OUTPAINT_ARTIFACT } from './lama-manifest.js'
import {
  REGIONAL_REFERENCE_ADAPTER_ARTIFACT,
  REGIONAL_REFERENCE_VISION_CONFIG_ARTIFACT,
  REGIONAL_REFERENCE_VISION_DIRECTORY,
  REGIONAL_REFERENCE_VISION_MODEL_ARTIFACT,
  type RegionalReferenceResourceRole,
} from './regional-reference-manifest.js'

export type InferenceAuxiliaryResourceRole = 'outpaint-infill' | RegionalReferenceResourceRole

export interface VerifiedRegionalReferenceResource<Role extends RegionalReferenceResourceRole> {
  readonly byteSize: number
  readonly managedPath: string
  readonly role: Role
  readonly sha256: string
}

export interface VerifiedRegionalReferenceResources {
  readonly adapter: VerifiedRegionalReferenceResource<'regional-reference-adapter'>
  readonly visionConfig: VerifiedRegionalReferenceResource<'regional-reference-vision-config'>
  readonly visionModel: VerifiedRegionalReferenceResource<'regional-reference-vision-model'>
}

/** Fixed engine resources only; no renderer paths, discovery, or implicit installation. */
export interface RegionalReferenceResourceResolver {
  resolveVerifiedRegionalReferenceResources: () => Promise<VerifiedRegionalReferenceResources>
}

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

export class InferenceAuxiliaryResources
  implements OutpaintInfillResolver, RegionalReferenceResourceResolver
{
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

  async resolveVerifiedRegionalReferenceResources(): Promise<VerifiedRegionalReferenceResources> {
    const root = await canonicalDirectory(this.resourcesDirectory)
    const descriptor = <Role extends RegionalReferenceResourceRole>(
      directory: string,
      manifest: {
        readonly filename: string
        readonly role: Role
        readonly sha256: string
        readonly sizeBytes: number
      },
    ): VerifiedRegionalReferenceResource<Role> =>
      Object.freeze({
        byteSize: manifest.sizeBytes,
        managedPath: path.join(directory, manifest.filename),
        role: manifest.role,
        sha256: manifest.sha256,
      })
    try {
      const vision = await canonicalDirectory(regionalReferenceVisionResourcePath(root))
      const result = Object.freeze({
        adapter: descriptor(root, REGIONAL_REFERENCE_ADAPTER_ARTIFACT),
        visionConfig: descriptor(vision, REGIONAL_REFERENCE_VISION_CONFIG_ARTIFACT),
        visionModel: descriptor(vision, REGIONAL_REFERENCE_VISION_MODEL_ARTIFACT),
      })
      const entries = Object.values(result)
      await verifyInferenceAuxiliaryFiles(
        entries.map((entry) => ({
          ...entry,
          maximumBytes: auxiliaryArtifactMaximumBytes(entry.role),
        })),
      )
      await canonicalDirectory(root)
      await canonicalDirectory(vision)
      return result
    } catch {
      throw changed('The exact regional reference inference resources are unavailable or changed.')
    }
  }
}

/** The same whole-group fence applies to fresh resolution and durable frozen Retry. */
export async function verifyInferenceAuxiliaryFiles(
  entries: readonly {
    byteSize: number
    managedPath: string
    maximumBytes: number
    sha256: string
  }[],
): Promise<void> {
  try {
    const before = await Promise.all(
      entries.map((entry) => lstat(entry.managedPath, { bigint: true })),
    )
    // Hash serially, then recheck the entire group after the final awaited byte verification.
    for (const entry of entries) {
      await verifyInferenceAuxiliaryFile(entry, entry.maximumBytes)
    }
    for (const [index, entry] of entries.entries()) {
      const after = await lstat(entry.managedPath, { bigint: true })
      if (!after.isFile() || !sameIdentity(before[index], after)) {
        throw changed('The regional reference resources changed during verification.')
      }
    }
  } catch (error) {
    if (error instanceof InferenceAuxiliaryResourceError) {
      throw error
    }
    throw changed('The exact regional reference resources are unavailable or changed.')
  }
}

/** Separate role bounds preserve the existing LaMa verifier/installer ceiling. */
export function auxiliaryArtifactMaximumBytes(role: InferenceAuxiliaryResourceRole): number {
  switch (role) {
    case 'outpaint-infill': {
      return LAMA_OUTPAINT_ARTIFACT.sizeBytes
    }
    case 'regional-reference-adapter': {
      return REGIONAL_REFERENCE_ADAPTER_ARTIFACT.sizeBytes
    }
    case 'regional-reference-vision-config': {
      return REGIONAL_REFERENCE_VISION_CONFIG_ARTIFACT.sizeBytes
    }
    case 'regional-reference-vision-model': {
      return REGIONAL_REFERENCE_VISION_MODEL_ARTIFACT.sizeBytes
    }
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

/** Canonical local-only Transformers directory, separate from runtime environments/cache. */
export function regionalReferenceVisionResourcePath(resourcesDirectory: string): string {
  assertCanonicalPath(resourcesDirectory)
  return path.join(resourcesDirectory, REGIONAL_REFERENCE_VISION_DIRECTORY)
}

export async function createRegionalReferenceVisionResourceRoot(
  resourcesDirectory: string,
): Promise<string> {
  const parent = await canonicalDirectory(resourcesDirectory)
  const directory = regionalReferenceVisionResourcePath(parent)
  await mkdir(directory, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'EEXIST') {
      throw error
    }
  })
  await canonicalDirectory(parent)
  return await canonicalDirectory(directory)
}

/**
 * Descriptor-backed verifier for a bounded exact local artifact. The production resolver above
 * supplies only fixed engine manifests; this generic primitive does not install/register
 * resources.
 */
export async function verifyInferenceAuxiliaryFile(
  input: {
    byteSize: number
    managedPath: string
    sha256: string
  },
  maximumBytes: number = LAMA_OUTPAINT_ARTIFACT.sizeBytes,
): Promise<void> {
  const { byteSize, managedPath, sha256 } = input
  if (
    !Number.isSafeInteger(byteSize) ||
    byteSize < 1 ||
    !Number.isSafeInteger(maximumBytes) ||
    maximumBytes < 1 ||
    byteSize > maximumBytes ||
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
