import type {
  ProjectGenerationResultsSnapshot,
  ProjectGenerationResultView,
} from '../../shared/api.js'

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

import type { GenerationStagingRepository } from './generation-staging.js'

const secret = randomBytes(32)
const projectKeyPattern = /^project-v1-[a-f0-9]{64}$/
const resourcePath =
  /^\/(project-v1-[a-f0-9]{64})\/([a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})\/([a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})\/([a-f0-9]{64})\/([a-f0-9]{64})\.png$/

export interface GenerationResultImageRequest {
  candidateId: string
  imageSha256: string
  localProjectKey: string
  stagingSessionId: string
}

export class ProjectGenerationResultResourceError extends Error {
  readonly code = 'PROJECT_NOT_OPEN'

  constructor() {
    super('Open the Project before viewing its generation results.')
    this.name = 'ProjectGenerationResultResourceError'
  }
}

/** Keep resource reads behind staging's serialized verification/discard boundary. */
export class ProjectGenerationResultResource {
  constructor(
    private readonly staging: Pick<
      GenerationStagingRepository,
      'listVerifiedCandidates' | 'readVerifiedCandidatePng'
    > | null,
    private readonly getOpenDocumentId: (localProjectKey: string) => string | null,
  ) {}

  async list(localProjectKey: string): Promise<ProjectGenerationResultsSnapshot> {
    this.requireOpenDocumentId(localProjectKey)
    if (!this.staging) {
      return { candidates: [], recoveryUnavailable: true }
    }
    const candidates = await this.staging.listVerifiedCandidates(localProjectKey)
    const openDocumentId = this.requireOpenDocumentId(localProjectKey)
    return {
      candidates: candidates
        .filter((candidate) => candidate.localProjectKey === localProjectKey)
        .map((candidate): ProjectGenerationResultView => ({
          actualSeed: candidate.actualSeed,
          bbox: candidate.bbox,
          candidateId: candidate.candidateId,
          completedAt: candidate.completedAt,
          completionOrder: candidate.completionOrder,
          imageUrl: imageUrl({
            candidateId: candidate.candidateId,
            imageSha256: candidate.image.sha256,
            localProjectKey,
            stagingSessionId: candidate.stagingSessionId,
          }),
          queueItemId: candidate.queueItemId,
          sourceDocumentMismatch: candidate.documentId !== openDocumentId,
          stagingSessionId: candidate.stagingSessionId,
        })),
      recoveryUnavailable: false,
    }
  }

  async readImage(input: string): Promise<Buffer | null> {
    const request = parseGenerationResultImageUrl(input)
    if (!request || !this.staging) {
      return null
    }
    const openDocumentId = this.getOpenDocumentId(request.localProjectKey)
    if (!openDocumentId) {
      return null
    }
    const bytes = await this.staging.readVerifiedCandidatePng(request)
    return this.getOpenDocumentId(request.localProjectKey) === openDocumentId ? bytes : null
  }

  private requireOpenDocumentId(localProjectKey: string): string {
    const documentId = projectKeyPattern.test(localProjectKey)
      ? this.getOpenDocumentId(localProjectKey)
      : null
    if (!documentId) {
      throw new ProjectGenerationResultResourceError()
    }
    return documentId
  }
}

export function parseGenerationResultImageUrl(input: string): GenerationResultImageRequest | null {
  let parsed: URL
  try {
    parsed = new URL(input)
  } catch {
    return null
  }
  if (
    parsed.protocol !== 'igs-staging:' ||
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
  const [, localProjectKey, stagingSessionId, candidateId, imageSha256, mac] = match
  if (!localProjectKey || !stagingSessionId || !candidateId || !imageSha256 || !mac) {
    return null
  }
  const request = { candidateId, imageSha256, localProjectKey, stagingSessionId }
  const expected = signature(request)
  if (!timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(expected, 'hex'))) {
    return null
  }
  return request
}

/** An opaque process-lifetime URL. The renderer receives no staging or Project file paths. */
function imageUrl(request: GenerationResultImageRequest): string {
  const mac = signature(request)
  return `igs-staging://asset/${request.localProjectKey}/${request.stagingSessionId}/${request.candidateId}/${request.imageSha256}/${mac}.png`
}

function signature(request: GenerationResultImageRequest): string {
  return createHmac('sha256', secret)
    .update(
      `${request.localProjectKey}\0${request.stagingSessionId}\0${request.candidateId}\0${request.imageSha256}`,
    )
    .digest('hex')
}
