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
const mergedResourcePath =
  /^\/(project-v1-[a-f0-9]{64})\/([a-f0-9]{64})\/([a-f0-9]{64})\/([a-f0-9]{64})\.png$/
const thumbnailMemberPath = 'preview/thumbnail.webp'
const mergedMemberPath = 'preview/merged.png'
const thumbnailLimit = 16 * 1024 * 1024

export interface ProjectThumbnailResourceRequest {
  projectId: string
  thumbnailSha256: string
}

export interface ProjectMergedPreviewResourceRequest extends ProjectThumbnailResourceRequest {
  fileFingerprintSha256: string
}

type PreviewRepository = Partial<Pick<ProjectIndexRepository, 'getProjectForPreview'>> &
  Pick<ProjectIndexRepository, 'getProject' | 'workspaceById'>

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

/** Full saved pixels need their package version: a thumbnail can survive preview-only Save. */
export function projectMergedPreviewImageUrl(
  projectId: string,
  thumbnailSha256: string,
  fileFingerprint: string,
): string {
  if (
    !projectIdPattern.test(projectId) ||
    !sha256Pattern.test(thumbnailSha256) ||
    typeof fileFingerprint !== 'string' ||
    fileFingerprint.length === 0
  ) {
    throw new Error('The Project preview identity is invalid.')
  }
  const request = {
    fileFingerprintSha256: fingerprintSha256(fileFingerprint),
    projectId,
    thumbnailSha256,
  }
  return `igs-preview://merged/${projectId}/${thumbnailSha256}/${request.fileFingerprintSha256}/${mergedSignature(request)}.png`
}

export function parseProjectMergedPreviewImageUrl(
  input: string,
): ProjectMergedPreviewResourceRequest | null {
  let parsed: URL
  try {
    parsed = new URL(input)
  } catch {
    return null
  }
  if (
    parsed.protocol !== 'igs-preview:' ||
    parsed.hostname !== 'merged' ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.search ||
    parsed.hash
  ) {
    return null
  }
  const match = mergedResourcePath.exec(parsed.pathname)
  if (!match) {
    return null
  }
  const [, projectId, thumbnailSha256, fileFingerprintSha256, mac] = match
  if (!projectId || !thumbnailSha256 || !fileFingerprintSha256 || !mac) {
    return null
  }
  const request = { fileFingerprintSha256, projectId, thumbnailSha256 }
  if (!timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(mergedSignature(request), 'hex'))) {
    return null
  }
  return request
}

/** Serve only the current indexed package's embedded preview, using a disposable SHA cache. */
export async function readProjectThumbnail(
  request: ProjectThumbnailResourceRequest,
  repository: PreviewRepository,
  cacheRoot: string,
): Promise<Response> {
  return await readIndexedPreview(request, repository, { cacheRoot, kind: 'thumbnail' })
}

/** Read the mandatory saved PNG through the same indexed/path/lifecycle authority, without a cache. */
export async function readProjectMergedPreview(
  request: ProjectMergedPreviewResourceRequest,
  repository: PreviewRepository,
): Promise<Response> {
  if (!sha256Pattern.test(request.fileFingerprintSha256)) {
    return unavailable(404, 'merged')
  }
  return await readIndexedPreview(request, repository, {
    fileFingerprintSha256: request.fileFingerprintSha256,
    kind: 'merged',
  })
}

async function readIndexedPreview(
  request: ProjectThumbnailResourceRequest,
  repository: PreviewRepository,
  resource:
    { cacheRoot: string; kind: 'thumbnail' } | { fileFingerprintSha256: string; kind: 'merged' },
): Promise<Response> {
  const unavailableResponse = (status: 404 | 503) => unavailable(status, resource.kind)
  if (!projectIdPattern.test(request.projectId) || !sha256Pattern.test(request.thumbnailSha256)) {
    return unavailableResponse(404)
  }
  let record: ProjectIndexRecord | null
  try {
    record = repository.getProjectForPreview
      ? await repository.getProjectForPreview(request.projectId)
      : await repository.getProject(request.projectId)
  } catch {
    return unavailableResponse(503)
  }
  if (
    !record ||
    record.fileHealth !== 'ready' ||
    !record.fileFingerprint ||
    record.thumbnailSha256 !== request.thumbnailSha256 ||
    (resource.kind === 'merged' &&
      fingerprintSha256(record.fileFingerprint) !== resource.fileFingerprintSha256)
  ) {
    return unavailableResponse(404)
  }
  try {
    const workspace = await repository.workspaceById(record.workspaceId)
    const canonical = await canonicalProjectPath(record.canonicalPath)
    if (
      canonical !== record.canonicalPath ||
      path.dirname(canonical) !== workspace.directoryPath ||
      localProjectRecoveryKey(canonical) !== request.projectId
    ) {
      return unavailableResponse(404)
    }
    return await withProjectPathLock(canonical, async () => {
      // A positive delete commit can win this lock after the initial lookup. Re-read its
      // authority before any cache/package bytes; begin/finish delete use this same lock.
      const current = repository.getProjectForPreview
        ? await repository.getProjectForPreview(request.projectId)
        : await repository.getProject(request.projectId)
      if (
        !current ||
        current.fileHealth !== 'ready' ||
        current.canonicalPath !== canonical ||
        current.workspaceId !== record.workspaceId ||
        !current.fileFingerprint ||
        current.fileFingerprint !== record.fileFingerprint ||
        current.thumbnailSha256 !== request.thumbnailSha256 ||
        (resource.kind === 'merged' &&
          fingerprintSha256(current.fileFingerprint) !== resource.fileFingerprintSha256) ||
        (await fileFingerprint(canonical)) !== current.fileFingerprint
      ) {
        return unavailableResponse(404)
      }
      const cacheDirectory =
        resource.kind === 'thumbnail'
          ? await safeCacheDirectory(resource.cacheRoot).catch(() => null)
          : null
      const cachePath = cacheDirectory
        ? path.join(cacheDirectory, `${request.thumbnailSha256}.webp`)
        : null
      let bytes = cachePath ? await readVerifiedCache(cachePath, request.thumbnailSha256) : null
      if (!bytes) {
        const archive = await readIgsPackage(canonical)
        const member = archive.manifest.members.find((entry) => entry.path === thumbnailMemberPath)
        if (member?.sha256 !== request.thumbnailSha256) {
          return unavailableResponse(404)
        }
        if (
          resource.kind === 'merged' &&
          (archive.project.documentId !== current.documentId ||
            archive.project.documentRevision !== current.documentRevision)
        ) {
          return unavailableResponse(404)
        }
        bytes = await archive.readMember(
          resource.kind === 'thumbnail' ? thumbnailMemberPath : mergedMemberPath,
        )
        if (cachePath) {
          await archive.extractMemberToFile(thumbnailMemberPath, cachePath).catch(() => undefined)
        }
      }
      if ((await fileFingerprint(canonical)) !== current.fileFingerprint) {
        return unavailableResponse(404)
      }
      return new Response(new Uint8Array(bytes), {
        headers: {
          'cache-control': 'no-store',
          'content-type': resource.kind === 'thumbnail' ? 'image/webp' : 'image/png',
          'x-content-type-options': 'nosniff',
        },
      })
    })
  } catch {
    return unavailableResponse(503)
  }
}

function signature(request: ProjectThumbnailResourceRequest): string {
  return createHmac('sha256', secret)
    .update(`${request.projectId}:${request.thumbnailSha256}`)
    .digest('hex')
}

function mergedSignature(request: ProjectMergedPreviewResourceRequest): string {
  return createHmac('sha256', secret)
    .update(
      `merged:${request.projectId}:${request.thumbnailSha256}:${request.fileFingerprintSha256}`,
    )
    .digest('hex')
}

function fingerprintSha256(fingerprint: string): string {
  return createHash('sha256').update(fingerprint).digest('hex')
}

function unavailable(status: 404 | 503, kind: 'merged' | 'thumbnail'): Response {
  const label = kind === 'thumbnail' ? 'Project thumbnail' : 'Project preview'
  return new Response(status === 404 ? `${label} not found.` : `${label} unavailable.`, {
    status,
  })
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
