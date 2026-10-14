import type { ProjectRasterLayerView, ProjectTab } from '../api.js'

import { IGS_SRGB_ICC_SHA256 } from './color-profile.js'
import { isProjectDocumentId } from './project-generation-actions.js'

export interface ProjectGenerationTargetState {
  documentId: string
  mode: 'img2img' | 'outpaint' | 'txt2img' | null
  targetKey: string
  unavailableReason: string | null
}

export function isGenerationTargetKey(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
}

export function isProjectGenerationTargetState(
  value: unknown,
): value is ProjectGenerationTargetState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const row = value as Record<string, unknown>
  if (
    Object.keys(row).length !== 4 ||
    !isProjectDocumentId(row['documentId']) ||
    !isGenerationTargetKey(row['targetKey'])
  ) {
    return false
  }
  return row['mode'] === null
    ? typeof row['unavailableReason'] === 'string' &&
        row['unavailableReason'].trim().length > 0 &&
        row['unavailableReason'].length <= 512
    : typeof row['mode'] === 'string' &&
        ['img2img', 'outpaint', 'txt2img'].includes(row['mode']) &&
        row['unavailableReason'] === null
}

/** Canonical pixel inputs only; signed resource revisions and editor metadata are not pixel data. */
export function generationTargetSignature(
  tab: Pick<ProjectTab, 'documentId' | 'layers' | 'primaryBbox'>,
): string | null {
  const layers = []
  for (const layer of tab.layers) {
    if (layer.kind === 'smart-patch' || !layer.visible || layer.opacity === 0) {
      continue
    }
    const digest = layerAssetDigest(layer)
    if (!digest) {
      return null
    }
    layers.push({
      assetSha256: digest,
      blendMode: layer.blendMode,
      height: layer.height,
      id: layer.id,
      opacity: layer.opacity,
      transform: {
        rotationDegrees: layer.transform.rotationDegrees,
        scaleX: layer.transform.scaleX,
        scaleY: layer.transform.scaleY,
        x: layer.transform.x,
        y: layer.transform.y,
      },
      width: layer.width,
    })
  }
  return JSON.stringify({
    bbox: {
      height: tab.primaryBbox.height,
      width: tab.primaryBbox.width,
      x: tab.primaryBbox.x,
      y: tab.primaryBbox.y,
    },
    colorSpace: 'srgb',
    documentId: tab.documentId,
    iccSha256: IGS_SRGB_ICC_SHA256,
    layers,
  })
}

export async function hashGenerationTargetSignature(signature: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(signature),
  )
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function layerAssetDigest(layer: ProjectRasterLayerView): string | null {
  const match =
    /^igs-layer:\/\/asset\/project-v1-[a-f0-9]{64}\/([\da-f-]{36})\/([\da-f-]{36})\/([a-f0-9]{64})\/[a-f0-9]{64}\.img$/.exec(
      layer.imageUrl,
    )
  return match &&
    isProjectDocumentId(match[1]) &&
    isProjectDocumentId(match[2]) &&
    match[2] === layer.id
    ? (match[3] ?? null)
    : null
}
