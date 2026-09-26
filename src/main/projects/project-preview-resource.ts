import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdir, open, realpath } from 'node:fs/promises'
import path from 'node:path'

import type { ProjectIndexRecord, ProjectIndexRepository } from './project-index.js'

import { readIgsPackage } from './igs-package.js'
import { canonicalProjectPath, localProjectRecoveryKey } from './project-identity.js'
import { withProjectPathLock } from './project-path-lock.js'

const secret = randomBytes(32)
const projectIdPattern = /^project-v1-[a-f0-9]{64}$/
const sha256Pattern = /^[a-f0-9]{64}$/
const resourcePath = /^\/(project-v1-[a-f0-9]{64})\/([a-f0-9]{64})\/([a-f0-9]{64})\.webp$/
const thumbnailMemberPath = 'preview/thumbnail.webp'
const thumbnailLimit = 16 * 1024 * 1024

export interface ProjectThumbnailResourceRequest {
  projectId: string
  thumbnailSha256: string
}

/** Opaque process-lifetime capability. Home never receives a local Project path. */
export function projectThumbnailImageUrl(projectId: string, thumbnailSha256: string): string {
  if (!projectIdPattern.test(projectId) || !sha256Pattern.test(thumbnailSha256)) {
    throw new Error('The Project thumbnail identity is invalid.')
  }
  return `igs-preview://thumbnail/${projectId}/${thumbnailSha256}/${signature({ projectId, thumbnailSha256 })}.webp`
}

export function parseProjectThumbnailImageUrl(
  input: string,
): ProjectThumbnailResourceRequest | null {
  let parsed: URL
  try {
    parsed = new URL(input)
  } catch {
    return null
  }
  if (
    parsed.protocol !== 'igs-preview:' ||
    parsed.hostname !== 'thumbnail' ||
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
  const [, projectId, thumbnailSha256, mac] = match
  if (!projectId || !thumbnailSha256 || !mac) {
    return null
  }
  const expected = signature({ projectId, thumbnailSha256 })
  if (!timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(expected, 'hex'))) {
    return null
  }
  return { projectId, thumbnailSha256 }
}

/** Serve only the current indexed package's embedded preview, using a disposable SHA cache. */
export async function readProjectThumbnail(
  request: ProjectThumbnailResourceRequest,
  repository: Pick<ProjectIndexRepository, 'getProject' | 'workspaceById'>,
  cacheRoot: string,
): Promise<Response> {
  if (!projectIdPattern.test(request.projectId) || !sha256Pattern.test(request.thumbnailSha256)) {
    return unavailable(404)
  }
  let record: ProjectIndexRecord | null
  try {
    record = await repository.getProject(request.projectId)
  } catch {
    return unavailable(503)
  }
  if (
    !record ||
    record.fileHealth !== 'ready' ||
    !record.fileFingerprint ||
    record.thumbnailSha256 !== request.thumbnailSha256
  ) {
    return unavailable(404)
  }
  try {
    const workspace = await repository.workspaceById(record.workspaceId)
    const canonical = await canonicalProjectPath(record.canonicalPath)
    if (
      canonical !== record.canonicalPath ||
      path.dirname(canonical) !== workspace.directoryPath ||
      localProjectRecoveryKey(canonical) !== request.projectId
    ) {
      return unavailable(404)
    }
    return await withProjectPathLock(canonical, async () => {
      if ((await fileFingerprint(canonical)) !== record.fileFingerprint) {
        return unavailable(404)
      }
      const cacheDirectory = await safeCacheDirectory(cacheRoot).catch(() => null)
      const cachePath = cacheDirectory
        ? path.join(cacheDirectory, `${request.thumbnailSha256}.webp`)
        : null
      let bytes = cachePath ? await readVerifiedCache(cachePath, request.thumbnailSha256) : null
      if (!bytes) {
        const archive = await readIgsPackage(canonical)
        const member = archive.manifest.members.find((entry) => entry.path === thumbnailMemberPath)
        if (member?.sha256 !== request.thumbnailSha256) {
          return unavailable(404)
        }
        bytes = await archive.readMember(thumbnailMemberPath)
        if (cachePath) {
          await archive.extractMemberToFile(thumbnailMemberPath, cachePath).catch(() => undefined)
        }
      }
      if ((await fileFingerprint(canonical)) !== record.fileFingerprint) {
        return unavailable(404)
      }
      return new Response(new Uint8Array(bytes), {
        headers: {
          'cache-control': 'no-store',
          'content-type': 'image/webp',
          'x-content-type-options': 'nosniff',
        },
      })
    })
  } catch {
    return unavailable(503)
  }
}

function signature(request: ProjectThumbnailResourceRequest): string {
  return createHmac('sha256', secret)
    .update(`${request.projectId}:${request.thumbnailSha256}`)
    .digest('hex')
}

function unavailable(status: 404 | 503): Response {
  return new Response(
    status === 404 ? 'Project thumbnail not found.' : 'Project thumbnail unavailable.',
    {
      status,
    },
  )
}

async function fileFingerprint(filePath: string): Promise<string> {
  const entry = await lstat(filePath, { bigint: true })
  if (!entry.isFile() || entry.isSymbolicLink()) {
    throw new Error('The indexed Project file is unsafe.')
  }
  return `${entry.dev}:${entry.ino}:${entry.size}:${entry.mtimeNs}:${entry.ctimeNs}`
}

async function safeCacheDirectory(cacheRoot: string): Promise<string> {
  if (
    !path.isAbsolute(cacheRoot) ||
    path.basename(cacheRoot) !== 'project-thumbnails' ||
    path.basename(path.dirname(cacheRoot)) !== 'previews'
  ) {
    throw new Error('The Project thumbnail cache path is invalid.')
  }
  const dataRoot = path.dirname(path.dirname(cacheRoot))
  if ((await realpath(dataRoot)) !== dataRoot) {
    throw new Error('The application data path is unsafe.')
  }
  let current = dataRoot
  for (const part of ['previews', 'project-thumbnails']) {
    current = path.join(current, part)
    await mkdir(current).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error
      }
    })
    const entry = await lstat(current)
    if (!entry.isDirectory() || entry.isSymbolicLink() || (await realpath(current)) !== current) {
      throw new Error('The Project thumbnail cache is unsafe.')
    }
  }
  return current
}

async function readVerifiedCache(filePath: string, expectedSha256: string): Promise<Buffer | null> {
  let handle
  try {
    handle = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW)
    const entry = await handle.stat()
    if (!entry.isFile() || entry.size > thumbnailLimit) {
      return null
    }
    const bytes = await handle.readFile()
    if (
      bytes.length !== entry.size ||
      createHash('sha256').update(bytes).digest('hex') !== expectedSha256
    ) {
      return null
    }
    return bytes
  } catch {
    return null
  } finally {
    await handle?.close()
  }
}
