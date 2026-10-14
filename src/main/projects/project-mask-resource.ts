import type {
  IgsProjectDocumentV1,
  IgsSmartPatchMaskAssetV1,
} from '../../shared/projects/project-schema.js'

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

import { type IgsAssetSource, readIgsPackage } from './igs-package.js'
import { readProjectMaskSource } from './project-mask.js'

const secret = randomBytes(32)
const resourcePath =
  /^\/(project-v1-[a-f0-9]{64})\/([a-f0-9-]{36})\/([a-f0-9-]{36})\/([a-f0-9-]{36})\/(0|[1-9]\d*)\/([a-f0-9]{64})\/([a-f0-9]{64})\.png$/

export interface ProjectMaskResourceRequest {
  assetSha256: string
  documentRevision: string
  layerId: string
  maskId: string
  maskRevision: number
  tabId: string
}

/** Signed process-lifetime capability; the renderer never supplies a filesystem/member path. */
export function projectMaskImageUrl(request: ProjectMaskResourceRequest): string {
  return `igs-mask://asset/${request.tabId}/${request.documentRevision}/${request.layerId}/${request.maskId}/${request.maskRevision}/${request.assetSha256}/${signature(request)}.png`
}

export function parseProjectMaskImageUrl(input: string): ProjectMaskResourceRequest | null {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    return null
  }
  if (
    url.protocol !== 'igs-mask:' ||
    url.hostname !== 'asset' ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash
  ) {
    return null
  }
  const match = resourcePath.exec(url.pathname)
  if (!match) {
    return null
  }
  const [, tabId, documentRevision, layerId, maskId, revision, assetSha256, mac] = match
  if (!tabId || !documentRevision || !layerId || !maskId || !revision || !assetSha256 || !mac) {
    return null
  }
  const maskRevision = Number(revision)
  if (!Number.isSafeInteger(maskRevision)) {
    return null
  }
  const request = { assetSha256, documentRevision, layerId, maskId, maskRevision, tabId }
  if (!timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(signature(request), 'hex'))) {
    return null
  }
  return request
}

export function resolveProjectMaskAsset(
  document: IgsProjectDocumentV1,
  request: ProjectMaskResourceRequest,
): IgsSmartPatchMaskAssetV1 | null {
  if (document.documentRevision !== request.documentRevision) {
    return null
  }
  const layer = document.layers.find((item) => item.id === request.layerId)
  if (
    layer?.kind !== 'smart-patch' ||
    layer.mask.id !== request.maskId ||
    layer.mask.revision !== request.maskRevision ||
    layer.mask.asset?.sha256 !== request.assetSha256
  ) {
    return null
  }
  return layer.mask.asset
}

export async function streamSavedProjectMask(
  packagePath: string,
  member: IgsSmartPatchMaskAssetV1,
): Promise<Response> {
  const archive = await readIgsPackage(packagePath)
  const found = archive.project.layers.some(
    (layer) =>
      layer.kind === 'smart-patch' &&
      layer.mask.asset?.path === member.path &&
      layer.mask.asset.sha256 === member.sha256 &&
      layer.mask.asset.bytes === member.bytes &&
      layer.mask.asset.width === member.width &&
      layer.mask.asset.height === member.height,
  )
  if (!found) {
    return new Response('Mask asset is not in the saved Project.', { status: 404 })
  }
  const bytes = await archive.readMember(member.path)
  if (
    bytes.length !== member.bytes ||
    createHash('sha256').update(bytes).digest('hex') !== member.sha256
  ) {
    throw new Error('The saved mask asset differs from its reference.')
  }
  return maskResponse(bytes)
}

export async function streamStagedProjectMask(
  source: IgsAssetSource,
  member: IgsSmartPatchMaskAssetV1,
): Promise<Response> {
  return maskResponse(await readProjectMaskSource(source, member))
}

function maskResponse(bytes: Buffer): Response {
  return new Response(Uint8Array.from(bytes), {
    headers: {
      'access-control-allow-origin': '*',
      'cache-control': 'no-store',
      'content-length': String(bytes.length),
      'content-type': 'image/png',
      'x-content-type-options': 'nosniff',
    },
  })
}

function signature(request: ProjectMaskResourceRequest): string {
  return createHmac('sha256', secret)
    .update(
      [
        request.tabId,
        request.documentRevision,
        request.layerId,
        request.maskId,
        request.maskRevision,
        request.assetSha256,
      ].join(':'),
    )
    .digest('hex')
}
