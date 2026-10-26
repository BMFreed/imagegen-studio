import type {
  IgsProjectDocumentV1,
  IgsSmartPatchMaskAssetV1,
} from '../../shared/projects/project-schema.js'

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

import { type IgsAssetSource, readIgsPackage } from './igs-package.js'
import { readProjectMaskSource } from './project-mask.js'

const secret = randomBytes(32)
const resourcePath =
  /^\/(project-v1-[a-f0-9]{64})\/([a-f0-9-]{36})\/([a-f0-9-]{36})\/([a-f0-9-]{36})\/(0|[1-9]\d*)\/([a-f0-9]{64})\/([a-f0-9]{64})\.png$/

export interface ProjectRegionalMaskResourceRequest {
  assetSha256: string
  documentRevision: string
  maskId: string
  maskRevision: number
  regionId: string
  tabId: string
}

/** Independent signed namespace. No regional request is resolved through a Smart owner. */
export function projectRegionalMaskImageUrl(request: ProjectRegionalMaskResourceRequest): string {
  return `igs-mask://regional/${request.tabId}/${request.documentRevision}/${request.regionId}/${request.maskId}/${request.maskRevision}/${request.assetSha256}/${signature(request)}.png`
}

export function parseProjectRegionalMaskImageUrl(
  input: string,
): ProjectRegionalMaskResourceRequest | null {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    return null
  }
  if (
    url.protocol !== 'igs-mask:' ||
    url.hostname !== 'regional' ||
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
  const [, tabId, documentRevision, regionId, maskId, revision, assetSha256, mac] = match
  if (!tabId || !documentRevision || !regionId || !maskId || !revision || !assetSha256 || !mac) {
    return null
  }
  const maskRevision = Number(revision)
  if (!Number.isSafeInteger(maskRevision)) {
    return null
  }
  const request = { assetSha256, documentRevision, maskId, maskRevision, regionId, tabId }
  if (!timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(signature(request), 'hex'))) {
    return null
  }
  return request
}

export function resolveProjectRegionalMaskAsset(
  document: IgsProjectDocumentV1,
  request: ProjectRegionalMaskResourceRequest,
): IgsSmartPatchMaskAssetV1 | null {
  if (document.documentRevision !== request.documentRevision) {
    return null
  }
  const region = document.regionalGuidance?.find(({ id }) => id === request.regionId)
  if (
    !region ||
    region.mask.id !== request.maskId ||
    region.mask.revision !== request.maskRevision ||
    region.mask.asset?.sha256 !== request.assetSha256
  ) {
    return null
  }
  return region.mask.asset
}

export async function streamSavedProjectRegionalMask(
  packagePath: string,
  member: IgsSmartPatchMaskAssetV1,
): Promise<Response> {
  const archive = await readIgsPackage(packagePath)
  const found = archive.project.regionalGuidance?.some(
    ({ mask }) =>
      mask.asset?.path === member.path &&
      mask.asset.sha256 === member.sha256 &&
      mask.asset.bytes === member.bytes &&
      mask.asset.width === member.width &&
      mask.asset.height === member.height,
  )
  if (!found) {
    return new Response('Regional mask asset is not in the saved Project.', { status: 404 })
  }
  return maskResponse(
    await readProjectMaskSource({ bytes: await archive.readMember(member.path) }, member),
  )
}

export async function streamStagedProjectRegionalMask(
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

function signature(request: ProjectRegionalMaskResourceRequest): string {
  return createHmac('sha256', secret)
    .update(
      [
        'igs-mask://regional',
        request.tabId,
        request.documentRevision,
        request.regionId,
        request.maskId,
        request.maskRevision,
        request.assetSha256,
      ].join(':'),
    )
    .digest('hex')
}
