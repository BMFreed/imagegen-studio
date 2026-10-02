import {
  type AcceptedResultHistoryReference,
  isAcceptedResultHistoryReference,
} from '../../shared/projects/accepted-result-history.js'
import {
  IGS_GENERATION_PNG_MAX_BYTES,
  IgsSchemaError,
} from '../../shared/projects/project-schema.js'

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'

import type { ProjectIndexRepository, ProjectSavedAcceptedResultRecord } from './project-index.js'

import { IgsPackageError, type IgsPackageReadResult, readIgsPackage } from './igs-package.js'
import { canonicalProjectPath, localProjectRecoveryKey } from './project-identity.js'
import { withProjectPathLock } from './project-path-lock.js'

const secret = randomBytes(32)
const resourcePath =
  /^igs-history:\/\/result\/(project-v1-[a-f0-9]{64})\/([a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12})\/([a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12})\/([a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12})\/([a-f0-9]{64})\/([a-f0-9]{64})\.img$/

type Repository = Pick<
  ProjectIndexRepository,
  'getProject' | 'getSavedAcceptedResult' | 'workspaceById'
>
type VerifiedResult = { archive: IgsPackageReadResult; record: ProjectSavedAcceptedResultRecord }

/** Opaque process-lifetime URL for one saved layer. It contains no local filesystem path. */
export function acceptedHistoryImageUrl(reference: AcceptedResultHistoryReference): string {
  if (!validReference(reference)) {
    throw new Error('The saved result identity is invalid.')
  }
  return `igs-history://result/${reference.projectKey}/${reference.documentId}/${reference.documentRevision}/${reference.layerId}/${reference.assetSha256}/${signature(reference)}.img`
}

export function parseAcceptedHistoryImageUrl(input: string): AcceptedResultHistoryReference | null {
  if (typeof input !== 'string') {
    return null
  }
  const match = resourcePath.exec(input)
  if (!match) {
    return null
  }
  const [, projectKey, documentId, documentRevision, layerId, assetSha256, mac] = match
  if (!projectKey || !documentId || !documentRevision || !layerId || !assetSha256 || !mac) {
    return null
  }
  const reference = { assetSha256, documentId, documentRevision, layerId, projectKey }
  if (!timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(signature(reference), 'hex'))) {
    return null
  }
  return reference
}

/** Only current assets within the preview budget get a URL; oversized saved results can navigate. */
export function canPreviewSavedAcceptedResult(record: ProjectSavedAcceptedResultRecord): boolean {
  return (
    Number.isSafeInteger(record.assetBytes) &&
    record.assetBytes > 0 &&
    record.assetBytes <= IGS_GENERATION_PNG_MAX_BYTES &&
    Number.isSafeInteger(record.assetWidth) &&
    record.assetWidth > 0 &&
    record.assetWidth <= 2048 &&
    Number.isSafeInteger(record.assetHeight) &&
    record.assetHeight > 0 &&
    record.assetHeight <= 2048
  )
}

/** Recheck the indexed identity against a verified saved package; never read an open dirty tab. */
export async function reviewSavedAcceptedResult(
  reference: AcceptedResultHistoryReference,
  repository: Repository,
): Promise<ProjectSavedAcceptedResultRecord | null> {
  if (!validReference(reference)) {
    return null
  }
  const candidate = await repository.getSavedAcceptedResult(reference.projectKey, reference.layerId)
  if (
    !candidate ||
    !sameReference(candidate, reference) ||
    !safeCanonicalPath(candidate.canonicalPath)
  ) {
    return null
  }
  return await withProjectPathLock(
    candidate.canonicalPath,
    async () =>
      (await reviewSavedAcceptedResultLocked(reference, repository, candidate.canonicalPath))
        ?.record ?? null,
  )
}

/** Serve only a verified saved asset. The resource never uses shadow or staging pixels. */
export async function readSavedAcceptedResultImage(
  request: AcceptedResultHistoryReference,
  repository: Repository,
  scratchRoot: string,
): Promise<Response> {
  if (!validReference(request)) {
    return unavailable(404)
  }
  try {
    const candidate = await repository.getSavedAcceptedResult(request.projectKey, request.layerId)
    if (
      !candidate ||
      !sameReference(candidate, request) ||
      !safeCanonicalPath(candidate.canonicalPath)
    ) {
      return unavailable(404)
    }
    return await withProjectPathLock(candidate.canonicalPath, async () => {
      const verified = await reviewSavedAcceptedResultLocked(
        request,
        repository,
        candidate.canonicalPath,
      )
      if (!verified) {
        return unavailable(404)
      }
      const { archive, record } = verified
      if (!canPreviewSavedAcceptedResult(record)) {
        return unavailable(413)
      }
      if (!(await safeScratchRoot(scratchRoot))) {
        return unavailable(503)
      }
      const response = await streamVerifiedSavedImage(archive, record, scratchRoot)
      if ((await fileFingerprint(record.canonicalPath)) !== record.fileFingerprint) {
        await response.body?.cancel()
        return unavailable(404)
      }
      return response
    })
  } catch (error) {
    return unavailable(isUnavailableSource(error) ? 404 : 503)
  }
}

async function reviewSavedAcceptedResultLocked(
  reference: AcceptedResultHistoryReference,
  repository: Repository,
  lockedPath: string,
): Promise<VerifiedResult | null> {
  const record = await repository.getSavedAcceptedResult(reference.projectKey, reference.layerId)
  const project = await repository.getProject(reference.projectKey)
  if (
    !record ||
    !project ||
    !sameReference(record, reference) ||
    record.canonicalPath !== lockedPath ||
    project.canonicalPath !== lockedPath ||
    project.fileHealth !== 'ready' ||
    !project.fileFingerprint ||
    project.fileFingerprint !== record.fileFingerprint ||
    project.documentId !== reference.documentId ||
    project.documentRevision !== reference.documentRevision
  ) {
    return null
  }
  const workspace = await repository.workspaceById(project.workspaceId)
  try {
    const workspaceStat = await lstat(workspace.directoryPath)
    if (
      !workspaceStat.isDirectory() ||
      workspaceStat.isSymbolicLink() ||
      (await realpath(workspace.directoryPath)) !== workspace.directoryPath ||
      path.dirname(lockedPath) !== workspace.directoryPath ||
      (await canonicalProjectPath(lockedPath)) !== lockedPath ||
      localProjectRecoveryKey(lockedPath) !== reference.projectKey ||
      (await fileFingerprint(lockedPath)) !== record.fileFingerprint
    ) {
      return null
    }
    const archive = await readIgsPackage(lockedPath)
    const document = archive.project
    const layer = document.layers.find((item) => item.id === reference.layerId)
    const provenance = layer?.generationProvenance
    if (
      document.documentId !== reference.documentId ||
      document.documentRevision !== reference.documentRevision ||
      !layer ||
      !provenance ||
      layer.name !== record.layerName ||
      layer.asset.path !== record.assetPath ||
      layer.asset.sha256 !== record.assetSha256 ||
      layer.asset.bytes !== record.assetBytes ||
      layer.asset.width !== record.assetWidth ||
      layer.asset.height !== record.assetHeight ||
      provenance.executionResultContext.acceptedAt !== record.acceptedAt ||
      provenance.executionResultContext.output.width !== record.outputWidth ||
      provenance.executionResultContext.output.height !== record.outputHeight ||
      provenance.generationConfiguration.sampling.actualSeed !== record.actualSeed ||
      provenance.generationConfiguration.model.fileSha256 !== record.modelFileSha256 ||
      provenance.generationConfiguration.model.displayName !== record.modelName ||
      provenance.generationConfiguration.model.versionName !== record.modelVersionName ||
      (await fileFingerprint(lockedPath)) !== record.fileFingerprint
    ) {
      return null
    }
    return { archive, record }
  } catch (error) {
    if (isUnavailableSource(error)) {
      return null
    }
    throw error
  }
}

/** Extract from the already verified archive once, then stream the disposable copy. */
async function streamVerifiedSavedImage(
  archive: IgsPackageReadResult,
  record: ProjectSavedAcceptedResultRecord,
  scratchRoot: string,
): Promise<Response> {
  const directory = await mkdtemp(path.join(scratchRoot, 'history-response-'))
  const isWebp = record.assetPath.endsWith('.webp')
  const destination = path.join(directory, isWebp ? 'image.webp' : 'image.png')
  try {
    await archive.extractMemberToFile(record.assetPath, destination)
    const source = createReadStream(destination)
    source.once('close', () => {
      void rm(directory, { force: true, recursive: true })
    })
    return new Response(Readable.toWeb(source) as ReadableStream<Uint8Array>, {
      headers: {
        'access-control-allow-origin': '*',
        'cache-control': 'no-store',
        'content-length': String(record.assetBytes),
        'content-type': isWebp ? 'image/webp' : 'image/png',
        'x-content-type-options': 'nosniff',
      },
    })
  } catch (error) {
    await rm(directory, { force: true, recursive: true })
    throw error
  }
}

function sameReference(
  record: ProjectSavedAcceptedResultRecord,
  reference: AcceptedResultHistoryReference,
): boolean {
  return (
    record.localProjectKey === reference.projectKey &&
    record.documentId === reference.documentId &&
    record.documentRevision === reference.documentRevision &&
    record.layerId === reference.layerId &&
    record.assetSha256 === reference.assetSha256
  )
}

function validReference(value: AcceptedResultHistoryReference): boolean {
  return isAcceptedResultHistoryReference(value)
}

function safeCanonicalPath(value: string): boolean {
  return (
    typeof value === 'string' &&
    path.isAbsolute(value) &&
    path.normalize(value) === value &&
    path.extname(value).toLowerCase() === '.igs'
  )
}

async function fileFingerprint(filePath: string): Promise<string> {
  const entry = await lstat(filePath, { bigint: true })
  if (!entry.isFile() || entry.isSymbolicLink()) {
    throw new IgsPackageError('INVALID_PACKAGE', 'The saved Project file is unsafe.')
  }
  return `${entry.dev}:${entry.ino}:${entry.size}:${entry.mtimeNs}:${entry.ctimeNs}`
}

async function safeScratchRoot(scratchRoot: string): Promise<boolean> {
  if (!path.isAbsolute(scratchRoot) || path.normalize(scratchRoot) !== scratchRoot) {
    return false
  }
  await mkdir(scratchRoot, { recursive: true })
  const entry = await lstat(scratchRoot)
  return (
    entry.isDirectory() && !entry.isSymbolicLink() && (await realpath(scratchRoot)) === scratchRoot
  )
}

function isUnavailableSource(error: unknown): boolean {
  return (
    error instanceof IgsPackageError ||
    error instanceof IgsSchemaError ||
    ['ELOOP', 'ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException)?.code ?? '')
  )
}

function signature(reference: AcceptedResultHistoryReference): string {
  return createHmac('sha256', secret)
    .update(
      `${reference.projectKey}:${reference.documentId}:${reference.documentRevision}:${reference.layerId}:${reference.assetSha256}`,
    )
    .digest('hex')
}

function unavailable(status: 404 | 413 | 503): Response {
  return new Response(
    status === 413 ? 'Saved result is too large for preview.' : 'Saved result image unavailable.',
    { status },
  )
}
