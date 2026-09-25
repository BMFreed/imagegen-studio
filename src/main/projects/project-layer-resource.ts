import type { IgsProjectDocumentV1 } from '../../shared/projects/project-schema.js'

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { constants, createReadStream } from 'node:fs'
import { mkdir, mkdtemp, open, realpath, rm } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'

import { type IgsAssetSource, readIgsPackage } from './igs-package.js'

const secret = randomBytes(32)
const resourcePath =
  /^\/(project-v1-[a-f0-9]{64})\/([a-f0-9-]{36})\/([a-f0-9-]{36})\/([a-f0-9]{64})\/([a-f0-9]{64})\.img$/

export interface ProjectLayerResourceRequest {
  assetSha256: string
  documentRevision: string
  layerId: string
  tabId: string
}

/** An opaque, process-lifetime URL. The renderer never learns a package or asset path. */
export function projectLayerImageUrl(
  tabId: string,
  revision: string,
  layerId: string,
  assetSha256: string,
): string {
  const mac = signature({ assetSha256, documentRevision: revision, layerId, tabId })
  return `igs-layer://asset/${tabId}/${revision}/${layerId}/${assetSha256}/${mac}.img`
}

export function parseProjectLayerImageUrl(input: string): ProjectLayerResourceRequest | null {
  let parsed: URL
  try {
    parsed = new URL(input)
  } catch {
    return null
  }
  if (
    parsed.protocol !== 'igs-layer:' ||
    parsed.hostname !== 'asset' ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.search ||
    parsed.hash
  ) {
    return null
  }
  const match = resourcePath.exec(parsed.pathname)
  if (!match) {
    return null
  }
  const [, tabId, documentRevision, layerId, assetSha256, mac] = match
  if (!tabId || !documentRevision || !layerId || !assetSha256 || !mac) {
    return null
  }
  const expected = signature({ assetSha256, documentRevision, layerId, tabId })
  if (!timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(expected, 'hex'))) {
    return null
  }
  return { assetSha256, documentRevision, layerId, tabId }
}

/** Resolve only a layer in the currently open revision, then stream its verified ZIP member. */
export function resolveProjectLayerAsset(
  document: IgsProjectDocumentV1,
  request: ProjectLayerResourceRequest,
): IgsProjectDocumentV1['layers'][number]['asset'] | null {
  if (document.documentRevision !== request.documentRevision) {
    return null
  }
  const layer = document.layers.find((item) => item.id === request.layerId)
  return layer?.asset.sha256 === request.assetSha256 ? layer.asset : null
}

export async function streamSavedProjectLayer(
  packagePath: string,
  member: IgsProjectDocumentV1['layers'][number]['asset'],
  scratchRoot: string,
): Promise<Response> {
  const archive = await readIgsPackage(packagePath)
  const saved = archive.project.layers.find(
    (layer) =>
      layer.asset.path === member.path &&
      layer.asset.sha256 === member.sha256 &&
      layer.asset.bytes === member.bytes,
  )
  if (!saved) {
    return new Response('Layer asset is not in the saved Project.', { status: 404 })
  }
  await mkdir(scratchRoot, { recursive: true })
  const directory = await mkdtemp(path.join(await realpath(scratchRoot), 'layer-response-'))
  const isWebp = member.path.endsWith('.webp')
  const destination = path.join(directory, isWebp ? 'image.webp' : 'image.png')
  try {
    await archive.extractMemberToFile(member.path, destination)
    return streamedResponse(directory, destination, member)
  } catch (error) {
    await rm(directory, { force: true, recursive: true })
    throw error
  }
}

/** A current unsaved import is served only from coordinator-owned, reverified staging bytes. */
export async function streamStagedProjectLayer(
  source: IgsAssetSource,
  member: IgsProjectDocumentV1['layers'][number]['asset'],
  scratchRoot: string,
): Promise<Response> {
  await mkdir(scratchRoot, { recursive: true })
  const directory = await mkdtemp(path.join(await realpath(scratchRoot), 'layer-response-'))
  const destination = path.join(
    directory,
    member.path.endsWith('.webp') ? 'image.webp' : 'image.png',
  )
  try {
    const target = await open(destination, 'wx', 0o600)
    try {
      const hash = createHash('sha256')
      let bytes = 0
      if ('bytes' in source) {
        const data = Buffer.from(source.bytes)
        bytes = data.length
        hash.update(data)
        await target.writeFile(data)
      } else {
        const input = await open(source.sourcePath, constants.O_RDONLY | constants.O_NOFOLLOW)
        try {
          const stat = await input.stat()
          if (!stat.isFile() || stat.size !== member.bytes) {
            throw new Error('The staged layer source changed.')
          }
          const chunk = Buffer.allocUnsafe(1024 * 1024)
          while (true) {
            const { bytesRead } = await input.read(chunk, 0, chunk.length, null)
            if (bytesRead === 0) {
              break
            }
            bytes += bytesRead
            if (bytes > member.bytes) {
              throw new Error('The staged layer source grew.')
            }
            hash.update(chunk.subarray(0, bytesRead))
            let offset = 0
            while (offset < bytesRead) {
              const { bytesWritten } = await target.write(chunk, offset, bytesRead - offset)
              offset += bytesWritten
            }
          }
          const after = await input.stat()
          if (
            !after.isFile() ||
            after.size !== stat.size ||
            after.mtimeMs !== stat.mtimeMs ||
            after.ctimeMs !== stat.ctimeMs
          ) {
            throw new Error('The staged layer source changed during display preparation.')
          }
        } finally {
          await input.close()
        }
      }
      if (bytes !== member.bytes || hash.digest('hex') !== member.sha256) {
        throw new Error('The staged layer source failed integrity verification.')
      }
      await target.sync()
    } finally {
      await target.close()
    }
    return streamedResponse(directory, destination, member)
  } catch (error) {
    await rm(directory, { force: true, recursive: true })
    throw error
  }
}

function streamedResponse(
  directory: string,
  destination: string,
  member: IgsProjectDocumentV1['layers'][number]['asset'],
): Response {
  const source = createReadStream(destination)
  source.once('close', () => {
    void rm(directory, { force: true, recursive: true })
  })
  return new Response(Readable.toWeb(source) as ReadableStream<Uint8Array>, {
    headers: {
      'access-control-allow-origin': '*',
      'cache-control': 'no-store',
      'content-length': String(member.bytes),
      'content-type': member.path.endsWith('.webp') ? 'image/webp' : 'image/png',
      'x-content-type-options': 'nosniff',
    },
  })
}

function signature(parts: Omit<ProjectLayerResourceRequest, 'signature'>): string {
  return createHmac('sha256', secret)
    .update(`${parts.tabId}:${parts.documentRevision}:${parts.layerId}:${parts.assetSha256}`)
    .digest('hex')
}
