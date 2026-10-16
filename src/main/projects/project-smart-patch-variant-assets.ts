import type {
  IgsProjectDocumentV1,
  IgsSmartPatchVariantV1,
} from '../../shared/projects/project-schema.js'

import { constants } from 'node:fs'
import { open } from 'node:fs/promises'

import { type IgsAssetSource, verifySmartPatchVariantPng } from './igs-package.js'

export function smartPatchVariants(document: IgsProjectDocumentV1): IgsSmartPatchVariantV1[] {
  return document.layers.flatMap((layer) =>
    layer.kind === 'smart-patch' ? layer.rasterSubLayers : [],
  )
}

/** A cached pixel proof never qualifies provenance freshness or current model availability. */
export function smartPatchVariantImageIdentity(variant: IgsSmartPatchVariantV1): string {
  return JSON.stringify([
    variant.asset,
    variant.generationProvenance.executionResultContext.output.contributionAlpha8,
  ])
}

/** Read only bounded, detached bytes; a source path is never itself a pixel-validation proof. */
export async function verifySmartPatchVariantSource(
  variant: IgsSmartPatchVariantV1,
  source: IgsAssetSource,
): Promise<void> {
  if ('bytes' in source) {
    await verifySmartPatchVariantPng(variant, Buffer.from(source.bytes))
    return
  }
  const file = await open(
    source.sourcePath,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  )
  try {
    const before = await file.stat({ bigint: true })
    if (!before.isFile() || before.size !== BigInt(variant.asset.bytes)) {
      throw new Error('The Smart Patch variant source is not a matching file.')
    }
    // Allocate the declared finite size, rather than readFile() on a concurrently growing file.
    const bytes = Buffer.alloc(variant.asset.bytes)
    let position = 0
    while (position < bytes.length) {
      const { bytesRead } = await file.read(bytes, position, bytes.length - position, position)
      if (bytesRead === 0) {
        throw new Error('The Smart Patch variant source was truncated.')
      }
      position += bytesRead
    }
    const after = await file.stat({ bigint: true })
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs
    ) {
      throw new Error('The Smart Patch variant source changed during verification.')
    }
    await verifySmartPatchVariantPng(variant, bytes)
  } finally {
    await file.close()
  }
}
