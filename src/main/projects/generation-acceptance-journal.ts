import type { IgsRasterLayerV1 } from '../../shared/projects/project-schema.js'
import {
  createEmptyProjectDocumentV1,
  IGS_SAFETY_CEILINGS,
  parseProjectDocumentV1,
  projectRasterLayers,
} from '../../shared/projects/project-schema.js'

import type { Kysely, Selectable, Transaction } from 'kysely'

import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'

import type { DB, GenerationAcceptanceJournal } from '../db/database.types.js'

import { localProjectRecoveryKey } from './project-identity.js'

const projectKeyPattern = /^project-v1-[a-f0-9]{64}$/
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
const MAX_ACCEPTED_PER_OPERATION = 64
// Match staging discard batches while keeping each statement far below SQLite binding ceilings.
const SESSION_BATCH_SIZE = 400
const handoffKeys = [
  'acceptedLayers',
  'documentId',
  'localProjectKey',
  'operationId',
  'projectPath',
  'stagingSessionIds',
]

export interface GenerationAcceptanceHandoff {
  acceptedLayers: IgsRasterLayerV1[]
  documentId: string
  localProjectKey: string
  operationId: string
  projectPath: string
  stagingSessionIds: string[]
}

type JournalDatabase = Kysely<DB> | Transaction<DB>

type JournalRow = Selectable<GenerationAcceptanceJournal>
export class GenerationAcceptanceJournalError extends Error {
  constructor(
    readonly code:
      | 'ACCEPTANCE_JOURNAL_CONFLICT'
      | 'ACCEPTANCE_JOURNAL_INPUT_INVALID'
      | 'ACCEPTANCE_JOURNAL_INVALID',
    message: string,
  ) {
    super(message)
    this.name = 'GenerationAcceptanceJournalError'
  }
}

/**
 * Main-only intent storage. Pixels remain in staging/shadow. Call complete only after the owner
 * proves the recorded assets and provenance durable; tombstones and intent removal commit
 * together.
 */
export class GenerationAcceptanceJournalRepository {
  constructor(private readonly db: Kysely<DB>) {}

  async abandon(input: GenerationAcceptanceHandoff): Promise<void> {
    const handoff = parseHandoff(input)
    await this.db.transaction().execute(async (transaction) => {
      const row = await readPending(transaction, handoff.localProjectKey, handoff.documentId)
      if (!row) {
        return
      }
      requireSameHandoff(row, handoff)
      await deleteExact(transaction, row)
    })
  }

  async complete(input: GenerationAcceptanceHandoff): Promise<void> {
    const handoff = parseHandoff(input)
    await this.db.transaction().execute(async (transaction) => {
      const row = await readPending(transaction, handoff.localProjectKey, handoff.documentId)
      if (!row) {
        // A retry may follow a committed transaction and interrupted filesystem cleanup. Absence
        // alone is never proof that every captured session was durably discarded.
        for (
          let offset = 0;
          offset < handoff.stagingSessionIds.length;
          offset += SESSION_BATCH_SIZE
        ) {
          const sessions = handoff.stagingSessionIds.slice(offset, offset + SESSION_BATCH_SIZE)
          const tombstones = await transaction
            .selectFrom('generation_staging_discarded_session')
            .select('staging_session_id')
            .where('local_project_key', '=', handoff.localProjectKey)
            .where('staging_session_id', 'in', sessions)
            .execute()
          if (tombstones.length !== sessions.length) {
            throw conflict()
          }
        }
        return
      }
      requireSameHandoff(row, handoff)
      const discardedAt = new Date().toISOString()
      for (
        let offset = 0;
        offset < handoff.stagingSessionIds.length;
        offset += SESSION_BATCH_SIZE
      ) {
        await transaction
          .insertInto('generation_staging_discarded_session')
          .values(
            handoff.stagingSessionIds
              .slice(offset, offset + SESSION_BATCH_SIZE)
              .map((stagingSessionId) => ({
                discarded_at: discardedAt,
                local_project_key: handoff.localProjectKey,
                staging_session_id: stagingSessionId,
              })),
          )
          .onConflict((onConflict) =>
            onConflict.columns(['local_project_key', 'staging_session_id']).doNothing(),
          )
          .execute()
      }
      await deleteExact(transaction, row)
    })
  }

  async read(
    localProjectKey: string,
    documentId: string,
  ): Promise<GenerationAcceptanceHandoff | null> {
    validateIdentity(localProjectKey, documentId)
    const row = await readPending(this.db, localProjectKey, documentId)
    return row ? handoffFromRow(row) : null
  }

  async record(input: GenerationAcceptanceHandoff): Promise<void> {
    const handoff = parseHandoff(input)
    const payloadJson = JSON.stringify(handoff)
    await this.db.transaction().execute(async (transaction) => {
      const existing = await readPending(transaction, handoff.localProjectKey, handoff.documentId)
      if (existing) {
        requireSameHandoff(existing, handoff)
        return
      }
      const operation = await transaction
        .selectFrom('generation_acceptance_journal')
        .select('operation_id')
        .where('operation_id', '=', handoff.operationId)
        .executeTakeFirst()
      if (operation) {
        throw conflict()
      }
      await transaction
        .insertInto('generation_acceptance_journal')
        .values({
          canonical_project_path: handoff.projectPath,
          document_id: handoff.documentId,
          local_project_key: handoff.localProjectKey,
          operation_id: handoff.operationId,
          payload_json: payloadJson,
          recorded_at: new Date().toISOString(),
        })
        .execute()
    })
  }
}

async function readPending(
  db: JournalDatabase,
  localProjectKey: string,
  documentId: string,
): Promise<JournalRow | undefined> {
  return await db
    .selectFrom('generation_acceptance_journal')
    .selectAll()
    .where('local_project_key', '=', localProjectKey)
    .where('document_id', '=', documentId)
    .executeTakeFirst()
}

async function deleteExact(db: Transaction<DB>, row: JournalRow): Promise<void> {
  const removed = await db
    .deleteFrom('generation_acceptance_journal')
    .where('local_project_key', '=', row.local_project_key)
    .where('document_id', '=', row.document_id)
    .where('operation_id', '=', row.operation_id)
    .where('canonical_project_path', '=', row.canonical_project_path)
    .where('payload_json', '=', row.payload_json)
    .returning('operation_id')
    .executeTakeFirst()
  if (!removed) {
    throw conflict()
  }
}

function requireSameHandoff(row: JournalRow, handoff: GenerationAcceptanceHandoff): void {
  if (!isDeepStrictEqual(handoffFromRow(row), handoff)) {
    throw conflict()
  }
}

function handoffFromRow(row: JournalRow): GenerationAcceptanceHandoff {
  try {
    if (Buffer.byteLength(row.payload_json, 'utf8') > IGS_SAFETY_CEILINGS.projectJsonBytes) {
      throw new Error('Oversized intent')
    }
    const handoff = parseHandoff(JSON.parse(row.payload_json))
    if (
      row.local_project_key !== handoff.localProjectKey ||
      row.document_id !== handoff.documentId ||
      row.operation_id !== handoff.operationId ||
      row.canonical_project_path !== handoff.projectPath
    ) {
      throw new Error('Intent identity changed')
    }
    return handoff
  } catch {
    throw new GenerationAcceptanceJournalError(
      'ACCEPTANCE_JOURNAL_INVALID',
      'The pending acceptance record is invalid. Its staging results were preserved.',
    )
  }
}

function parseHandoff(input: unknown): GenerationAcceptanceHandoff {
  try {
    const json = JSON.stringify(input)
    if (!json || Buffer.byteLength(json, 'utf8') > IGS_SAFETY_CEILINGS.projectJsonBytes) {
      throw new Error('Oversized intent')
    }
    const raw = JSON.parse(json) as GenerationAcceptanceHandoff
    if (
      !raw ||
      typeof raw !== 'object' ||
      Array.isArray(raw) ||
      !isDeepStrictEqual(Object.keys(raw).sort(), handoffKeys) ||
      typeof raw.operationId !== 'string' ||
      !uuidPattern.test(raw.operationId) ||
      typeof raw.projectPath !== 'string' ||
      !path.isAbsolute(raw.projectPath) ||
      path.normalize(raw.projectPath) !== raw.projectPath ||
      path.extname(raw.projectPath).toLowerCase() !== '.igs' ||
      localProjectRecoveryKey(raw.projectPath) !== raw.localProjectKey ||
      !Array.isArray(raw.acceptedLayers) ||
      raw.acceptedLayers.length < 1 ||
      raw.acceptedLayers.length > MAX_ACCEPTED_PER_OPERATION ||
      !Array.isArray(raw.stagingSessionIds) ||
      raw.stagingSessionIds.length < 1 ||
      raw.stagingSessionIds.length > IGS_SAFETY_CEILINGS.archiveEntries ||
      raw.stagingSessionIds.some((id) => typeof id !== 'string' || !uuidPattern.test(id)) ||
      new Set(raw.stagingSessionIds).size !== raw.stagingSessionIds.length
    ) {
      throw new Error('Invalid intent')
    }
    validateIdentity(raw.localProjectKey, raw.documentId)
    // Reuse the portable format parser rather than keeping a second layer/provenance schema.
    const document = parseProjectDocumentV1({
      ...createEmptyProjectDocumentV1({
        documentId: raw.documentId,
        documentRevision: raw.operationId,
        title: 'Acceptance intent',
      }),
      layers: raw.acceptedLayers,
    })
    const acceptedLayers = projectRasterLayers(document)
    if (acceptedLayers.length !== document.layers.length) {
      throw new Error('Only accepted Raster outputs can enter this journal.')
    }
    const candidateIds = new Set<string>()
    for (const layer of acceptedLayers) {
      const provenance = layer.generationProvenance
      const output = provenance?.executionResultContext.output
      const candidateId = provenance?.executionResultContext.candidateId
      if (
        !provenance ||
        !output ||
        !candidateId ||
        candidateIds.has(candidateId) ||
        candidateId !== provenance.executionResultContext.queueItemId ||
        provenance.layerSourceContext.sourceDocumentId !== raw.documentId ||
        layer.asset.path !== `assets/layers/${layer.id}.png` ||
        layer.asset.bytes !== output.byteSize ||
        layer.asset.sha256 !== output.sha256 ||
        layer.asset.width !== output.width ||
        layer.asset.height !== output.height
      ) {
        throw new Error('Invalid accepted output')
      }
      candidateIds.add(candidateId)
    }
    return {
      acceptedLayers,
      documentId: raw.documentId,
      localProjectKey: raw.localProjectKey,
      operationId: raw.operationId,
      projectPath: raw.projectPath,
      stagingSessionIds: raw.stagingSessionIds,
    }
  } catch {
    throw new GenerationAcceptanceJournalError(
      'ACCEPTANCE_JOURNAL_INPUT_INVALID',
      'The acceptance handoff is invalid. Its staging results were preserved.',
    )
  }
}

function validateIdentity(localProjectKey: string, documentId: string): void {
  if (
    typeof localProjectKey !== 'string' ||
    !projectKeyPattern.test(localProjectKey) ||
    typeof documentId !== 'string' ||
    !uuidPattern.test(documentId)
  ) {
    throw new GenerationAcceptanceJournalError(
      'ACCEPTANCE_JOURNAL_INPUT_INVALID',
      'The acceptance Project identity is invalid.',
    )
  }
}

function conflict(): GenerationAcceptanceJournalError {
  return new GenerationAcceptanceJournalError(
    'ACCEPTANCE_JOURNAL_CONFLICT',
    'The pending acceptance differs from this operation. Its staging results were preserved.',
  )
}
