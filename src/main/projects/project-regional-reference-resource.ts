import type {
  IgsProjectDocumentV1,
  IgsRegionalGuidanceReferenceImageV1,
} from '../../shared/projects/project-schema.js'
import { REGIONAL_REFERENCE_LIMITS } from '../../shared/projects/project-schema.js'

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { constants } from 'node:fs'
import { open } from 'node:fs/promises'

import {
  type IgsAssetSource,
  readIgsPackage,
  verifyRegionalReferenceAssetSource,
} from './igs-package.js'

const secret = randomBytes(32)
const resourcePath =
  /^\/(project-v1-[a-f0-9]{64})\/([a-f0-9-]{36})\/([a-f0-9-]{36})\/([a-f0-9-]{36})\/([a-f0-9]{64})\/([a-f0-9]{64})\.webp$/
export interface ProjectRegionalReferenceThumbnailRequest {
  documentRevision: string
  referenceId: string
  regionId: string
  tabId: string
  thumbnailSha256: string
}

type Thumbnail = IgsRegionalGuidanceReferenceImageV1['thumbnail']

export function projectRegionalReferenceThumbnailUrl(
  request: ProjectRegionalReferenceThumbnailRequest,
): string {
  return `igs-layer://regional-reference/${request.tabId}/${request.documentRevision}/${request.regionId}/${request.referenceId}/${request.thumbnailSha256}/${signature(request)}.webp`
}

export function parseProjectRegionalReferenceThumbnailUrl(
  input: string,
): ProjectRegionalReferenceThumbnailRequest | null {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    return null
  }
  if (
    url.protocol !== 'igs-layer:' ||
    url.hostname !== 'regional-reference' ||
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
  const [, tabId, documentRevision, regionId, referenceId, thumbnailSha256, mac] = match
  if (!tabId || !documentRevision || !regionId || !referenceId || !thumbnailSha256 || !mac) {
    return null
  }
  const request = { documentRevision, referenceId, regionId, tabId, thumbnailSha256 }
  if (!timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(signature(request), 'hex'))) {
    return null
  }
  return request
}

export function resolveProjectRegionalReferenceThumbnail(
  document: IgsProjectDocumentV1,
  request: ProjectRegionalReferenceThumbnailRequest,
): Thumbnail | null {
  if (document.documentRevision !== request.documentRevision) {
    return null
  }
  const region = document.regionalGuidance?.find(({ id }) => id === request.regionId)
  const reference = region?.referenceImages?.find(({ id }) => id === request.referenceId)
  return reference?.thumbnail.sha256 === request.thumbnailSha256 ? reference.thumbnail : null
}

export async function streamSavedProjectRegionalReferenceThumbnail(
  packagePath: string,
  member: Thumbnail,
): Promise<Response> {
  const archive = await readIgsPackage(packagePath)
  const found = archive.project.regionalGuidance?.some((region) =>
    region.referenceImages?.some(
      ({ thumbnail }) =>
        thumbnail.path === member.path &&
        thumbnail.sha256 === member.sha256 &&
        thumbnail.bytes === member.bytes &&
        thumbnail.width === member.width &&
        thumbnail.height === member.height,
    ),
  )
  if (!found) {
    return new Response('Regional reference thumbnail is not in the saved Project.', {
      status: 404,
    })
  }
  return streamStagedProjectRegionalReferenceThumbnail(
    { bytes: await archive.readMember(member.path) },
    member,
  )
}

export async function streamStagedProjectRegionalReferenceThumbnail(
  source: IgsAssetSource,
  member: Thumbnail,
): Promise<Response> {
  if (
    !Number.isSafeInteger(member.bytes) ||
    member.bytes < 1 ||
    member.bytes > REGIONAL_REFERENCE_LIMITS.thumbnailBytes
  ) {
    throw new Error('The regional thumbnail exceeds its byte limit.')
  }
  let bytes: Buffer
  if ('bytes' in source) {
    if (source.bytes.length !== member.bytes) {
      throw new Error('The regional thumbnail bytes changed.')
    }
    bytes = Buffer.from(source.bytes)
  } else {
    const file = await open(
      source.sourcePath,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    )
    try {
      const before = await file.stat({ bigint: true })
      if (!before.isFile() || before.size !== BigInt(member.bytes)) {
        throw new Error('The regional thumbnail source changed.')
      }
      bytes = Buffer.alloc(member.bytes)
      let offset = 0
      while (offset < bytes.length) {
        const { bytesRead } = await file.read(bytes, offset, bytes.length - offset, offset)
        if (!bytesRead) {
          throw new Error('The regional thumbnail was truncated.')
        }
        offset += bytesRead
      }
      const after = await file.stat({ bigint: true })
      if (
        before.size !== after.size ||
        before.ctimeNs !== after.ctimeNs ||
        before.mtimeNs !== after.mtimeNs
      ) {
        throw new Error('The regional thumbnail changed during reading.')
      }
    } finally {
      await file.close()
    }
  }
  await verifyRegionalReferenceAssetSource({ bytes }, member, 'thumbnail')
  return new Response(Uint8Array.from(bytes), {
    headers: {
      'access-control-allow-origin': '*',
      'cache-control': 'no-store',
      'content-length': String(bytes.length),
      'content-type': 'image/webp',
      'x-content-type-options': 'nosniff',
    },
  })
}

function signature(request: ProjectRegionalReferenceThumbnailRequest): string {
  return createHmac('sha256', secret)
    .update(
      [
        'igs-layer://regional-reference',
        request.tabId,
        request.documentRevision,
        request.regionId,
        request.referenceId,
        request.thumbnailSha256,
      ].join(':'),
    )
    .digest('hex')
}
