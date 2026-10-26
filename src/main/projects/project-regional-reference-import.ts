import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import {
  IGS_SAFETY_CEILINGS,
  type IgsProjectAssetRefV1,
  type IgsRegionalGuidanceReferenceImageV1,
} from '../../shared/projects/project-schema.js'

import { constants } from 'node:fs'
import { mkdtemp, open, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { ProjectWorkerClient } from './worker-client.js'

import {
  type IgsAssetSource,
  regionalReferenceMembers,
  verifyRegionalReferenceAssetSource,
} from './igs-package.js'
import { canonicalDirectory, freezeAuthorizedSource } from './raster-import.js'

export interface PreparedRegionalReferenceImport {
  assetSources: Record<string, IgsAssetSource>
  dispose: () => Promise<void>
  reference: IgsRegionalGuidanceReferenceImageV1
}

/** Main-authorized source and staging only; never publishes a Project edit. */
export async function prepareRegionalReferenceImport(input: {
  assertCurrent: () => void
  authorizedSourcePath: string
  name: string
  referenceId: string
  stagingBasePath: string
  worker: Pick<ProjectWorkerClient, 'createImportThumbnail' | 'normalizeImport'>
}): Promise<PreparedRegionalReferenceImport> {
  const base = await canonicalDirectory(input.stagingBasePath)
  input.assertCurrent()
  const root = await mkdtemp(path.join(base, 'regional-reference-import-'))
  let transferred = false
  try {
    input.assertCurrent()
    const source = path.join(root, 'source.bin')
    const inputSha256 = await freezeAuthorizedSource(input.authorizedSourcePath, source)
    input.assertCurrent()
    const imagePath = path.join(root, 'normalized.png')
    const iccPath = path.join(root, 'original.icc')
    const normalized = await input.worker.normalizeImport({
      inputPath: source,
      inputSha256,
      normalizedPngPath: imagePath,
      originalIccPath: iccPath,
      stagingRoot: root,
    })
    input.assertCurrent()
    if (
      normalized.normalized.path !== imagePath ||
      normalized.normalized.colorSpace !== 'srgb' ||
      normalized.normalized.iccSha256 !== IGS_SRGB_ICC_SHA256 ||
      !['JPEG', 'PNG', 'WEBP'].includes(normalized.sourceFormat) ||
      (normalized.originalIcc && normalized.originalIcc.path !== iccPath)
    ) {
      throw new Error('The regional reference normalizer returned an unexpected output.')
    }
    const prefix = `assets/regional-references/${input.referenceId}/`
    const descriptor = (image: typeof normalized.normalized, suffix: string) => ({
      bytes: image.byteSize,
      height: image.height,
      path: `${prefix}${image.sha256}.${suffix}`,
      sha256: image.sha256,
      width: image.width,
    })
    const asset = descriptor(normalized.normalized, 'png')
    await verifyRegionalReferenceAssetSource({ sourcePath: imagePath }, asset, 'image')
    input.assertCurrent()
    const thumbnailPath = path.join(root, 'thumbnail.webp')
    const thumbnail = await input.worker.createImportThumbnail({
      inputPath: imagePath,
      inputSha256: asset.sha256,
      stagingRoot: root,
      thumbnailWebpPath: thumbnailPath,
    })
    input.assertCurrent()
    if (
      thumbnail.path !== thumbnailPath ||
      thumbnail.colorSpace !== 'srgb' ||
      thumbnail.iccSha256 !== IGS_SRGB_ICC_SHA256
    ) {
      throw new Error('The regional reference thumbnail returned an unexpected output.')
    }
    const reference: IgsRegionalGuidanceReferenceImageV1 = {
      asset,
      id: input.referenceId,
      name: input.name,
      sourceFormat: normalized.sourceFormat,
      thumbnail: descriptor(thumbnail, 'webp'),
      ...(normalized.originalIcc
        ? {
            sourceIccProfile: {
              bytes: normalized.originalIcc.byteSize,
              path: `assets/profiles/${normalized.originalIcc.sha256}.icc`,
              sha256: normalized.originalIcc.sha256,
            },
          }
        : {}),
    }
    const assetSources: Record<string, IgsAssetSource> = {
      [asset.path]: { sourcePath: imagePath },
      [reference.thumbnail.path]: { sourcePath: thumbnailPath },
      ...(reference.sourceIccProfile
        ? { [reference.sourceIccProfile.path]: { sourcePath: iccPath } }
        : {}),
    }
    for (const { member, role } of regionalReferenceMembers(reference)) {
      await verifyRegionalReferenceAssetSource(assetSources[member.path], member, role)
      input.assertCurrent()
    }
    transferred = true
    return { assetSources, dispose: () => rm(root, { force: true, recursive: true }), reference }
  } finally {
    if (!transferred) {
      await rm(root, { force: true, recursive: true }).catch((error: unknown) =>
        process.emitWarning(`Regional reference staging cleanup failed: ${String(error)}`),
      )
    }
  }
}

/** Copy one exact immutable source without buffering multiple originals during duplication. */
export async function copyRegionalReferenceSource(
  source: IgsAssetSource,
  destination: string,
  member: IgsProjectAssetRefV1,
  role: 'image' | 'profile' | 'thumbnail',
): Promise<void> {
  if ('bytes' in source) {
    if (source.bytes.length !== member.bytes) {
      throw new Error('The regional reference source changed.')
    }
    await writeFile(destination, source.bytes, { flag: 'wx', mode: 0o600 })
  } else {
    const reader = await open(
      source.sourcePath,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    )
    try {
      const before = await reader.stat({ bigint: true })
      if (
        !before.isFile() ||
        before.size !== BigInt(member.bytes) ||
        member.bytes > IGS_SAFETY_CEILINGS.memberBytes
      ) {
        throw new Error('The regional reference source changed.')
      }
      const writer = await open(destination, 'wx', 0o600)
      try {
        const chunk = Buffer.allocUnsafe(1024 * 1024)
        let count = 0
        while (count < member.bytes) {
          const { bytesRead } = await reader.read(
            chunk,
            0,
            Math.min(chunk.length, member.bytes - count),
            null,
          )
          if (!bytesRead) {
            throw new Error('The regional reference source was truncated.')
          }
          let written = 0
          while (written < bytesRead) {
            written += (await writer.write(chunk, written, bytesRead - written)).bytesWritten
          }
          count += bytesRead
        }
        const after = await reader.stat({ bigint: true })
        if (
          before.size !== after.size ||
          before.mtimeNs !== after.mtimeNs ||
          before.ctimeNs !== after.ctimeNs
        ) {
          throw new Error('The regional reference source changed during copy.')
        }
        await writer.sync()
      } finally {
        await writer.close()
      }
    } finally {
      await reader.close()
    }
  }
  await verifyRegionalReferenceAssetSource({ sourcePath: destination }, member, role)
}
