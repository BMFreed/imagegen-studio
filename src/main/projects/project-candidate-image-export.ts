import type { ProjectCandidateExportResult } from '../../shared/api.js'

import { randomUUID } from 'node:crypto'
import { link, open, unlink } from 'node:fs/promises'
import path from 'node:path'

import type {
  GenerationStagingRepository,
  VerifiedGenerationCandidate,
} from './generation-staging.js'

const projectKeyPattern = /^project-v1-[a-f0-9]{64}$/
const candidateIdPattern =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i

export interface CandidateImageDestinationSelection {
  canceled: boolean
  filePath?: string
}

type CandidateImageStaging = Pick<
  GenerationStagingRepository,
  'listVerifiedCandidates' | 'readVerifiedCandidatePng'
>

export class ProjectCandidateImageExportError extends Error {
  constructor(
    readonly code:
      | 'CANDIDATE_EXPORT_DESTINATION_INVALID'
      | 'CANDIDATE_EXPORT_EXISTS'
      | 'CANDIDATE_EXPORT_NOT_FOUND'
      | 'CANDIDATE_EXPORT_UNAVAILABLE'
      | 'CANDIDATE_EXPORT_WRITE_FAILED'
      | 'PROJECT_DOCUMENT_CHANGED'
      | 'PROJECT_NOT_OPEN',
    message: string,
  ) {
    super(message)
    this.name = 'ProjectCandidateImageExportError'
  }
}

/**
 * Export raw candidate pixels without mutating the Project or staging. The destination callback is
 * Electron's native Save dialog in production, and an injected choice in filesystem tests.
 */
export class ProjectCandidateImageExporter {
  constructor(
    private readonly staging: CandidateImageStaging | null,
    private readonly getOpenDocumentId: (localProjectKey: string) => string | null,
    private readonly chooseDestination: (
      defaultFileName: string,
    ) => Promise<CandidateImageDestinationSelection>,
  ) {}

  async save(tabId: string, candidateId: string): Promise<ProjectCandidateExportResult> {
    if (!projectKeyPattern.test(tabId) || !candidateIdPattern.test(candidateId)) {
      throw new ProjectCandidateImageExportError(
        'CANDIDATE_EXPORT_NOT_FOUND',
        'This generation result is unavailable.',
      )
    }
    const documentId = this.requireOpenDocument(tabId)
    const staging = this.requireStaging()
    const candidate = findCandidate(await staging.listVerifiedCandidates(tabId), tabId, candidateId)
    if (!candidate) {
      throw new ProjectCandidateImageExportError(
        'CANDIDATE_EXPORT_NOT_FOUND',
        'This generation result is no longer available.',
      )
    }

    const selection = await this.chooseDestination(`generation-${candidateId.slice(0, 8)}.png`)
    if (selection.canceled) {
      return { kind: 'canceled' }
    }
    const destinationPath = validateDestination(selection.filePath)

    // A Save dialog may remain open while the Project closes, changes identity at this path, or
    // discards the staging session. Reacquire the candidate from main-owned recovery afterward.
    if (this.requireOpenDocument(tabId) !== documentId) {
      throw new ProjectCandidateImageExportError(
        'PROJECT_DOCUMENT_CHANGED',
        'The open Project changed while choosing where to save the image.',
      )
    }
    const current = findCandidate(await staging.listVerifiedCandidates(tabId), tabId, candidateId)
    if (
      !current ||
      current.stagingSessionId !== candidate.stagingSessionId ||
      current.image.sha256 !== candidate.image.sha256 ||
      current.image.byteSize !== candidate.image.byteSize
    ) {
      throw new ProjectCandidateImageExportError(
        'CANDIDATE_EXPORT_NOT_FOUND',
        'This generation result changed or was discarded. Refresh Results and try again.',
      )
    }
    const bytes = await staging.readVerifiedCandidatePng({
      candidateId,
      imageSha256: current.image.sha256,
      localProjectKey: tabId,
      stagingSessionId: current.stagingSessionId,
    })
    if (!bytes) {
      throw new ProjectCandidateImageExportError(
        'CANDIDATE_EXPORT_NOT_FOUND',
        'This generation result could not be verified. The destination was not changed.',
      )
    }
    if (this.requireOpenDocument(tabId) !== documentId) {
      throw new ProjectCandidateImageExportError(
        'PROJECT_DOCUMENT_CHANGED',
        'The open Project changed before the image could be saved.',
      )
    }

    await writeCandidateImageCreateOnly(destinationPath, bytes)
    return { fileName: path.basename(destinationPath), kind: 'saved' }
  }

  private requireOpenDocument(tabId: string): string {
    const documentId = this.getOpenDocumentId(tabId)
    if (!documentId) {
      throw new ProjectCandidateImageExportError(
        'PROJECT_NOT_OPEN',
        'Open the Project before saving a generation result.',
      )
    }
    return documentId
  }

  private requireStaging(): CandidateImageStaging {
    if (!this.staging) {
      throw new ProjectCandidateImageExportError(
        'CANDIDATE_EXPORT_UNAVAILABLE',
        'Generation recovery is unavailable. Repair it before saving a candidate image.',
      )
    }
    return this.staging
  }
}

/** Create-only publication avoids replacing a file that appeared after the native Save dialog. */
export async function writeCandidateImageCreateOnly(
  destinationPath: string,
  bytes: Buffer,
  options: { beforePublish?: () => Promise<void> } = {},
): Promise<void> {
  const directoryPath = path.dirname(destinationPath)
  const temporaryPath = path.join(directoryPath, `.igs-candidate-${randomUUID()}.tmp`)
  let published = false
  try {
    const temporary = await open(temporaryPath, 'wx', 0o600)
    try {
      await temporary.writeFile(bytes)
      await temporary.sync()
    } finally {
      await temporary.close()
    }
    await options.beforePublish?.()
    await link(temporaryPath, destinationPath)
    published = true
    try {
      const directory = await open(directoryPath, 'r')
      try {
        await directory.sync()
      } finally {
        await directory.close()
      }
    } catch (error) {
      // Publication already committed. A post-commit fsync failure cannot be returned as a failed
      // export or retried without risking a false overwrite of the file the user now owns.
      process.emitWarning(`Candidate image directory sync failed: ${String(error)}`)
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new ProjectCandidateImageExportError(
        'CANDIDATE_EXPORT_EXISTS',
        'A file with that name already exists. Choose a different filename.',
      )
    }
    throw new ProjectCandidateImageExportError(
      'CANDIDATE_EXPORT_WRITE_FAILED',
      'The candidate image could not be written. The destination was not changed.',
    )
  } finally {
    await unlink(temporaryPath).catch((error: unknown) => {
      if (published || (error as NodeJS.ErrnoException).code !== 'ENOENT') {
        process.emitWarning(`Candidate image temporary cleanup failed: ${String(error)}`)
      }
    })
  }
}

function findCandidate(
  candidates: VerifiedGenerationCandidate[],
  localProjectKey: string,
  candidateId: string,
): VerifiedGenerationCandidate | undefined {
  return candidates.find(
    (candidate) =>
      candidate.localProjectKey === localProjectKey && candidate.candidateId === candidateId,
  )
}

function validateDestination(filePath: unknown): string {
  if (
    typeof filePath !== 'string' ||
    !path.isAbsolute(filePath) ||
    path.resolve(filePath) !== filePath
  ) {
    throw new ProjectCandidateImageExportError(
      'CANDIDATE_EXPORT_DESTINATION_INVALID',
      'Choose an absolute .png filename for the generation result.',
    )
  }
  // Linux Save dialogs can return the typed basename without appending the selected filter.
  const extension = path.extname(filePath)
  if (extension === '') {
    return `${filePath}.png`
  }
  if (extension.toLowerCase() !== '.png') {
    throw new ProjectCandidateImageExportError(
      'CANDIDATE_EXPORT_DESTINATION_INVALID',
      'Choose a .png filename for the generation result.',
    )
  }
  return filePath
}
