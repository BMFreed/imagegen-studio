import {
  GENERATION_THUMBNAIL_MAX_BYTES,
  GENERATION_THUMBNAIL_MAX_SIDE,
} from '../../shared/projects/generation-thumbnail.js'
import type {
  ProjectSmartPatchResultsSnapshot,
  ProjectSmartPatchResultTarget,
} from '../../shared/projects/smart-patch-public-generation.js'

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

import type { GenerationQueueRepository } from './generation-queue.js'
import type { ProjectService } from './project-service.js'
import type {
  SmartPatchGenerationStagingRepository,
  VerifiedSmartPatchWorldCandidate,
} from './smart-patch-generation-staging.js'

const secret = randomBytes(32)
const projectKey = /^project-v1-[a-f0-9]{64}$/
const resourcePath =
  /^\/(project-v1-[a-f0-9]{64})\/([a-f0-9-]{36})\/([a-f0-9-]{36})\/([a-f0-9]{64})\/([a-f0-9]{64})\.png$/
const thumbnailPath =
  /^\/(project-v1-[a-f0-9]{64})\/([a-f0-9-]{36})\/([a-f0-9-]{36})\/([a-f0-9]{64})\/([a-f0-9]{64})\/([a-f0-9]{64})\.png$/
const MAX_CACHED_THUMBNAILS = 64
export interface SmartPatchResultResourceOptions {
  /** Main's decoder receives only authoritative verified bounded PNGs; cache is disposable. */
  makeThumbnail?: (bytes: Buffer, size: { height: number; width: number }) => Buffer
  projects: Pick<ProjectService, 'getOpenDocumentForAcceptance'>
  queue: Pick<GenerationQueueRepository, 'listUnfinishedSmartPatchJobsByProject'> | null
  readLastActualSeed: ((tabId: string, documentId: string) => Promise<number | null>) | null
  staging: Pick<
    SmartPatchGenerationStagingRepository,
    'listVerifiedCandidates' | 'readVerifiedCandidate'
  > | null
}

type Owner = NonNullable<ReturnType<ProjectService['getOpenDocumentForAcceptance']>>

export class SmartPatchPublicResultError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'SmartPatchPublicResultError'
  }
}

/** Dedicated signed world contributions; ordinary Raster discovery never receives these records. */
export class ProjectSmartPatchResultResource {
  private readonly thumbnails = new Map<string, { bytes: Buffer; sha256: string }>()
  constructor(private readonly options: SmartPatchResultResourceOptions) {}

  async list(tabId: string): Promise<ProjectSmartPatchResultsSnapshot> {
    const owner = this.owner(tabId)
    const { documentId, documentRevision } = owner.document
    const epoch = owner.documentEpoch
    const current = () => {
      if (
        this.owner(tabId) !== owner ||
        owner.documentEpoch !== epoch ||
        owner.document.documentRevision !== documentRevision
      ) {
        throw new SmartPatchPublicResultError(
          'PROJECT_DOCUMENT_CHANGED',
          'The Project changed while reading Smart Patch results. Refresh to review them.',
        )
      }
    }
    const empty: ProjectSmartPatchResultsSnapshot = {
      candidates: [],
      documentId,
      documentRevision,
      kind: 'smart-patch-results',
      lastActualSeed: null,
      recoveryUnavailable: true,
      targets: [],
    }
    if (!this.options.staging || !this.options.queue || !this.options.readLastActualSeed) {
      return empty
    }
    const candidates = await this.options.staging.listVerifiedCandidates(tabId)
    current()
    const jobs = await this.options.queue.listUnfinishedSmartPatchJobsByProject(tabId)
    current()
    const lastActualSeed = await this.options.readLastActualSeed(tabId, documentId)
    current()
    const thumbnailUrls = new Map<string, string>()
    if (this.options.makeThumbnail) {
      for (const candidate of candidates.slice(-MAX_CACHED_THUMBNAILS)) {
        const cached = await this.thumbnail(candidate)
        current()
        if (cached) {
          thumbnailUrls.set(
            candidate.candidateId,
            `igs-smart-staging://thumbnail/${candidate.localProjectKey}/${candidate.stagingSessionId}/${candidate.candidateId}/${candidate.image.sha256}/${cached.sha256}/${thumbnailSignature(candidate, cached.sha256)}.png`,
          )
        }
      }
    }
    const targets = new Map<string, ProjectSmartPatchResultTarget>()
    const target = (sourceDocumentId: string, layerId: string) => {
      const key = `${sourceDocumentId}:${layerId}`
      let value = targets.get(key)
      if (!value) {
        value = {
          ...smartPatchResultDisposition(owner, sourceDocumentId, layerId),
          documentId: sourceDocumentId,
          layerId,
          unfinishedJobIds: [],
        }
        targets.set(key, value)
      }
      return value
    }
    const views = candidates
      .filter(
        (candidate) =>
          candidate.localProjectKey === tabId && candidate.projectPath === owner.filePath,
      )
      .map((candidate) => {
        const scope = target(candidate.documentId, candidate.payload.context.layerId)
        return {
          actualSeed: candidate.actualSeed,
          bbox: candidate.bbox,
          candidateId: candidate.candidateId,
          completedAt: candidate.completedAt,
          completionOrder: candidate.completionOrder,
          disposition: scope.disposition,
          documentId: candidate.documentId,
          imageUrl: smartPatchCandidateImageUrl(candidate),
          kind: 'smart-patch-world-candidate' as const,
          layerId: scope.layerId,
          layerName: scope.layerName,
          queueItemId: candidate.queueItemId,
          stagingSessionId: candidate.stagingSessionId,
          unavailableReason: scope.unavailableReason,
          ...(thumbnailUrls.has(candidate.candidateId)
            ? { thumbnailUrl: thumbnailUrls.get(candidate.candidateId)! }
            : {}),
        }
      })
    for (const job of jobs) {
      if (job.localProjectKey === tabId && job.projectPath === owner.filePath) {
        target(job.documentId, job.layerId).unfinishedJobIds.push(job.id)
      }
    }
    current()
    return {
      ...empty,
      candidates: views,
      lastActualSeed,
      recoveryUnavailable: false,
      targets: [...targets.values()],
    }
  }

  async readImage(input: string): Promise<Buffer | null> {
    const request = parseSmartPatchCandidateImageUrl(input)
    if (!request || !this.options.staging) {
      return null
    }
    const owner = this.options.projects.getOpenDocumentForAcceptance(request.tabId)
    if (!owner) {
      return null
    }
    const documentId = owner.document.documentId
    const candidate = (await this.options.staging.listVerifiedCandidates(request.tabId)).find(
      (entry) =>
        entry.candidateId === request.candidateId &&
        entry.stagingSessionId === request.stagingSessionId &&
        entry.image.sha256 === request.imageSha256 &&
        entry.localProjectKey === request.tabId &&
        entry.projectPath === owner.filePath,
    )
    if (
      !candidate ||
      !timingSafeEqual(Buffer.from(request.mac, 'hex'), Buffer.from(signature(candidate), 'hex'))
    ) {
      return null
    }
    const read = await this.options.staging.readVerifiedCandidate({
      candidateId: candidate.candidateId,
      documentId: candidate.documentId,
      frozenPayloadSha256: candidate.frozenPayloadSha256,
      imageSha256: candidate.image.sha256,
      localProjectKey: candidate.localProjectKey,
      stagingSessionId: candidate.stagingSessionId,
    })
    return this.options.projects.getOpenDocumentForAcceptance(request.tabId) === owner &&
      owner.document.documentId === documentId
      ? (read?.imagePngBytes ?? null)
      : null
  }

  async readThumbnail(input: string): Promise<Buffer | null> {
    let url: URL
    try {
      url = new URL(input)
    } catch {
      return null
    }
    if (
      url.protocol !== 'igs-smart-staging:' ||
      url.hostname !== 'thumbnail' ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash
    ) {
      return null
    }
    const match = thumbnailPath.exec(url.pathname)
    if (!match || !this.options.staging) {
      return null
    }
    const [, tabId, sessionId, candidateId, sourceSha, thumbSha, mac] = match
    const owner = this.options.projects.getOpenDocumentForAcceptance(tabId)
    if (!owner) {
      return null
    }
    const documentId = owner.document.documentId
    const candidate = (await this.options.staging.listVerifiedCandidates(tabId)).find(
      (entry) =>
        entry.candidateId === candidateId &&
        entry.stagingSessionId === sessionId &&
        entry.image.sha256 === sourceSha &&
        entry.projectPath === owner.filePath,
    )
    if (
      !candidate ||
      !timingSafeEqual(
        Buffer.from(mac, 'hex'),
        Buffer.from(thumbnailSignature(candidate, thumbSha), 'hex'),
      )
    ) {
      return null
    }
    const cache = await this.thumbnail(candidate)
    return cache?.sha256 === thumbSha &&
      this.options.projects.getOpenDocumentForAcceptance(tabId) === owner &&
      owner.document.documentId === documentId
      ? Buffer.from(cache.bytes)
      : null
  }

  private owner(tabId: string): Owner {
    const owner = projectKey.test(tabId)
      ? this.options.projects.getOpenDocumentForAcceptance(tabId)
      : null
    if (!owner) {
      throw new SmartPatchPublicResultError(
        'PROJECT_NOT_OPEN',
        'Open the Project before viewing Smart Patch results.',
      )
    }
    return owner
  }

  private async thumbnail(candidate: VerifiedSmartPatchWorldCandidate) {
    const key = signature(candidate)
    const previous = this.thumbnails.get(key)
    if (previous) {
      return previous
    }
    if (!this.options.makeThumbnail || !this.options.staging) {
      return null
    }
    const read = await this.options.staging.readVerifiedCandidate({
      candidateId: candidate.candidateId,
      documentId: candidate.documentId,
      frozenPayloadSha256: candidate.frozenPayloadSha256,
      imageSha256: candidate.image.sha256,
      localProjectKey: candidate.localProjectKey,
      stagingSessionId: candidate.stagingSessionId,
    })
    if (!read) {
      return null
    }
    try {
      const scale = Math.min(
        1,
        GENERATION_THUMBNAIL_MAX_SIDE / Math.max(candidate.image.width, candidate.image.height),
      )
      const width = Math.max(1, Math.round(candidate.image.width * scale))
      const height = Math.max(1, Math.round(candidate.image.height * scale))
      const bytes = this.options.makeThumbnail(read.imagePngBytes, { height, width })
      if (
        bytes.length > GENERATION_THUMBNAIL_MAX_BYTES ||
        bytes.length < 33 ||
        !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
        bytes.readUInt32BE(16) !== width ||
        bytes.readUInt32BE(20) !== height
      ) {
        return null
      }
      const cached = {
        bytes: Buffer.from(bytes),
        sha256: createHash('sha256').update(bytes).digest('hex'),
      }
      if (this.thumbnails.size >= MAX_CACHED_THUMBNAILS) {
        this.thumbnails.delete(this.thumbnails.keys().next().value!)
      }
      this.thumbnails.set(key, cached)
      return cached
    } catch {
      return null
    }
  }
}

export function smartPatchResultDisposition(
  owner: Owner,
  documentId: string,
  layerId: string,
): Pick<ProjectSmartPatchResultTarget, 'disposition' | 'layerName' | 'unavailableReason'> {
  if (owner.document.documentId !== documentId) {
    return {
      disposition: 'foreign-document',
      layerName: null,
      unavailableReason:
        'This result belongs to an earlier document at this Project path. Export or discard it; it cannot be added to the current document.',
    }
  }
  const layer = owner.document.layers.find((entry) => entry.id === layerId)
  if (layer?.kind !== 'smart-patch') {
    return {
      disposition: 'orphaned',
      layerName: null,
      unavailableReason:
        'The original Smart Patch is missing. Add as Variant is unavailable. Save Candidate Image or discard; Raster conversion is not available yet.',
    }
  }
  if (layer.locked || !layer.visible) {
    return {
      disposition: 'blocked',
      layerName: layer.name,
      unavailableReason:
        'Unlock and show the original Smart Patch before adding variants. Its temporary results remain available.',
    }
  }
  return { disposition: 'available', layerName: layer.name, unavailableReason: null }
}

export function smartPatchCandidateImageUrl(candidate: VerifiedSmartPatchWorldCandidate): string {
  return `igs-smart-staging://asset/${candidate.localProjectKey}/${candidate.stagingSessionId}/${candidate.candidateId}/${candidate.image.sha256}/${signature(candidate)}.png`
}

export function parseSmartPatchCandidateImageUrl(input: string) {
  try {
    const url = new URL(input)
    if (
      url.protocol !== 'igs-smart-staging:' ||
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
    return match
      ? {
          candidateId: match[3],
          imageSha256: match[4],
          mac: match[5],
          stagingSessionId: match[2],
          tabId: match[1],
        }
      : null
  } catch {
    return null
  }
}

function signature(candidate: VerifiedSmartPatchWorldCandidate): string {
  return createHmac('sha256', secret)
    .update(
      JSON.stringify([
        candidate.localProjectKey,
        candidate.documentId,
        candidate.payload.context.layerId,
        candidate.stagingSessionId,
        candidate.candidateId,
        candidate.image.sha256,
        candidate.frozenPayloadSha256,
      ]),
    )
    .digest('hex')
}

function thumbnailSignature(candidate: VerifiedSmartPatchWorldCandidate, sha256: string): string {
  return createHmac('sha256', secret)
    .update(`thumbnail:${signature(candidate)}:${sha256}`)
    .digest('hex')
}
