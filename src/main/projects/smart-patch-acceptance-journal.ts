import {
  IGS_SAFETY_CEILINGS,
  type IgsSmartPatchVariantV1,
  parseSmartPatchVariantV1,
} from '../../shared/projects/project-schema.js'

import type { Kysely, Selectable, Transaction } from 'kysely'

import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'

import type { DB, GenerationAcceptanceJournal } from '../db/database.types.js'

import { localProjectRecoveryKey } from './project-identity.js'

const PROJECT_KEY = /^project-v1-[a-f0-9]{64}$/
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
const SHA256 = /^[a-f0-9]{64}$/
const MAX_ACCEPTED_PER_OPERATION = 64
const SESSION_BATCH_SIZE = 400
const HANDOFF_KEYS = [
  'acceptedVariants',
  'activeVariantId',
  'documentId',
  'kind',
  'localProjectKey',
  'operationId',
  'projectPath',
  'reviewedCandidates',
  'schemaVersion',
  'stagingSessionIds',
  'targetLayerId',
]

export interface SmartPatchAcceptanceCandidateWitness {
  candidateId: string
  frozenPayloadSha256: string
  stagingSessionId: string
}

export interface SmartPatchAcceptanceHandoff {
  acceptedVariants: IgsSmartPatchVariantV1[]
  activeVariantId: string
  documentId: string
  kind: 'smart-patch-variants'
  localProjectKey: string
  operationId: string
  projectPath: string
  reviewedCandidates: SmartPatchAcceptanceCandidateWitness[]
  schemaVersion: 1
  stagingSessionIds: string[]
  targetLayerId: string
}

export type GenerationAcceptanceKind = 'raster' | 'smart-patch-variants'
type JournalDatabase = Kysely<DB> | Transaction<DB>
type JournalRow = Selectable<GenerationAcceptanceJournal>

export class SmartPatchAcceptanceJournalError extends Error {
  constructor(
    readonly code:
      | 'SMART_PATCH_ACCEPTANCE_JOURNAL_CONFLICT'
      | 'SMART_PATCH_ACCEPTANCE_JOURNAL_INPUT_INVALID'
      | 'SMART_PATCH_ACCEPTANCE_JOURNAL_INVALID',
    message: string,
  ) {
    super(message)
    this.name = 'SmartPatchAcceptanceJournalError'
  }
}

/**
 * Smart-only immutable intent storage. Shares the SQL primary key and session tombstones with
 * Raster Add, so different target kinds cannot record concurrent intent for one Project/document.
 * The caller must prove durable accepted pixels before complete(); this class never adopts pixels.
 */
export class SmartPatchAcceptanceJournalRepository {
  constructor(private readonly db: Kysely<DB>) {}

  async abandon(input: SmartPatchAcceptanceHandoff): Promise<void> {
    const handoff = parseSmartPatchAcceptanceHandoff(input)
    await this.db.transaction().execute(async (transaction) => {
      const row = await readPending(transaction, handoff.localProjectKey, handoff.documentId)
      if (!row) {
        return
      }
      requireSameHandoff(row, handoff)
      await deleteExact(transaction, row)
    })
  }

  async complete(input: SmartPatchAcceptanceHandoff): Promise<void> {
    const handoff = parseSmartPatchAcceptanceHandoff(input)
    await this.db.transaction().execute(async (transaction) => {
      const row = await readPending(transaction, handoff.localProjectKey, handoff.documentId)
      if (!row) {
        // A lost transaction acknowledgement is successful only if every captured session is
        // already durably hidden at this exact Project key. Missing intent alone proves nothing.
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
              .map((sessionId) => ({
                discarded_at: discardedAt,
                local_project_key: handoff.localProjectKey,
                staging_session_id: sessionId,
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
  ): Promise<SmartPatchAcceptanceHandoff | null> {
    validateIdentity(localProjectKey, documentId)
    const row = await readPending(this.db, localProjectKey, documentId)
    return row ? handoffFromRow(row) : null
  }

  async record(input: SmartPatchAcceptanceHandoff): Promise<void> {
    // Snapshot all metadata before the first await. A caller cannot mutate this operation's intent.
    const handoff = parseSmartPatchAcceptanceHandoff(input)
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

/**
 * The existing table is the shared pending-intent namespace. The legacy Raster payload remains
 * unchanged; an unknown kind is never treated as an absent intent or cleanup permission.
 */
export async function readGenerationAcceptanceKind(
  db: Kysely<DB>,
  localProjectKey: string,
  documentId: string,
): Promise<GenerationAcceptanceKind | null> {
  validateIdentity(localProjectKey, documentId)
  const row = await readPending(db, localProjectKey, documentId)
  return row ? kindFromRaw(readRawRow(row)) : null
}

/** Strict creation intent; later portable copies may keep these historical source identities. */
export function parseSmartPatchAcceptanceHandoff(input: unknown): SmartPatchAcceptanceHandoff {
  try {
    const serialized = JSON.stringify(input)
    if (
      !serialized ||
      Buffer.byteLength(serialized, 'utf8') > IGS_SAFETY_CEILINGS.projectJsonBytes
    ) {
      throw new Error('Oversized intent')
    }
    const raw = JSON.parse(serialized) as SmartPatchAcceptanceHandoff
    if (
      !raw ||
      typeof raw !== 'object' ||
      Array.isArray(raw) ||
      !isDeepStrictEqual(Object.keys(raw).sort(), HANDOFF_KEYS) ||
      raw.kind !== 'smart-patch-variants' ||
      raw.schemaVersion !== 1 ||
      typeof raw.operationId !== 'string' ||
      !UUID.test(raw.operationId) ||
      typeof raw.targetLayerId !== 'string' ||
      !UUID.test(raw.targetLayerId) ||
      typeof raw.activeVariantId !== 'string' ||
      !UUID.test(raw.activeVariantId) ||
      !validProjectPath(raw.projectPath, raw.localProjectKey) ||
      !Array.isArray(raw.acceptedVariants) ||
      raw.acceptedVariants.length < 1 ||
      raw.acceptedVariants.length > MAX_ACCEPTED_PER_OPERATION ||
      !Array.isArray(raw.reviewedCandidates) ||
      raw.reviewedCandidates.length < 1 ||
      raw.reviewedCandidates.length > IGS_SAFETY_CEILINGS.archiveEntries ||
      !Array.isArray(raw.stagingSessionIds) ||
      raw.stagingSessionIds.length < 1 ||
      raw.stagingSessionIds.length > IGS_SAFETY_CEILINGS.archiveEntries ||
      raw.stagingSessionIds.some((id) => typeof id !== 'string' || !UUID.test(id)) ||
      new Set(raw.stagingSessionIds).size !== raw.stagingSessionIds.length
    ) {
      throw new Error('Invalid intent')
    }
    validateIdentity(raw.localProjectKey, raw.documentId)
    const reviewed = new Set<string>()
    const sessions = new Set(raw.stagingSessionIds)
    for (const witness of raw.reviewedCandidates) {
      if (
        !witness ||
        typeof witness !== 'object' ||
        Array.isArray(witness) ||
        !isDeepStrictEqual(Object.keys(witness).sort(), [
          'candidateId',
          'frozenPayloadSha256',
          'stagingSessionId',
        ]) ||
        typeof witness.candidateId !== 'string' ||
        !UUID.test(witness.candidateId) ||
        typeof witness.frozenPayloadSha256 !== 'string' ||
        !SHA256.test(witness.frozenPayloadSha256) ||
        typeof witness.stagingSessionId !== 'string' ||
        !sessions.has(witness.stagingSessionId) ||
        reviewed.has(witness.candidateId)
      ) {
        throw new Error('A reviewed candidate witness is invalid or outside the captured sessions')
      }
      reviewed.add(witness.candidateId)
    }
    const acceptedVariants = raw.acceptedVariants.map(parseSmartPatchVariantV1)
    const ids = new Set<string>()
    const candidateIds = new Set<string>()
    for (const variant of acceptedVariants) {
      const source = variant.generationProvenance.layerSourceContext
      const candidateId = variant.generationProvenance.executionResultContext.candidateId
      if (
        ids.has(variant.id) ||
        variant.id === raw.targetLayerId ||
        candidateIds.has(candidateId) ||
        !reviewed.has(candidateId) ||
        source.layerId !== raw.targetLayerId ||
        source.sourceDocumentId !== raw.documentId
      ) {
        throw new Error('A variant does not belong to the recorded acceptance target')
      }
      ids.add(variant.id)
      candidateIds.add(candidateId)
    }
    if (!ids.has(raw.activeVariantId)) {
      throw new Error('The active variant is not part of this Add')
    }
    return {
      acceptedVariants,
      activeVariantId: raw.activeVariantId,
      documentId: raw.documentId,
      kind: raw.kind,
      localProjectKey: raw.localProjectKey,
      operationId: raw.operationId,
      projectPath: raw.projectPath,
      reviewedCandidates: raw.reviewedCandidates,
      schemaVersion: raw.schemaVersion,
      stagingSessionIds: raw.stagingSessionIds,
      targetLayerId: raw.targetLayerId,
    }
  } catch {
    throw new SmartPatchAcceptanceJournalError(
      'SMART_PATCH_ACCEPTANCE_JOURNAL_INPUT_INVALID',
      'The Smart Patch acceptance intent is invalid. Its temporary pixels were preserved.',
    )
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

function requireSameHandoff(row: JournalRow, handoff: SmartPatchAcceptanceHandoff): void {
  if (
    kindFromRaw(readRawRow(row)) !== 'smart-patch-variants' ||
    !isDeepStrictEqual(handoffFromRow(row), handoff)
  ) {
    throw conflict()
  }
}

function handoffFromRow(row: JournalRow): SmartPatchAcceptanceHandoff {
  try {
    return parseSmartPatchAcceptanceHandoff(readRawRow(row))
  } catch {
    throw invalidStored()
  }
}

function readRawRow(row: JournalRow): Record<string, unknown> {
  try {
    if (Buffer.byteLength(row.payload_json, 'utf8') > IGS_SAFETY_CEILINGS.projectJsonBytes) {
      throw new Error('Oversized stored intent')
    }
    const raw = JSON.parse(row.payload_json) as Record<string, unknown>
    if (
      !raw ||
      typeof raw !== 'object' ||
      Array.isArray(raw) ||
      typeof raw.operationId !== 'string' ||
      !UUID.test(raw.operationId) ||
      raw.localProjectKey !== row.local_project_key ||
      raw.documentId !== row.document_id ||
      raw.operationId !== row.operation_id ||
      raw.projectPath !== row.canonical_project_path ||
      !validProjectPath(raw.projectPath, raw.localProjectKey)
    ) {
      throw new Error('Stored intent identity differs from its index')
    }
    validateIdentity(row.local_project_key, row.document_id)
    return raw
  } catch {
    throw invalidStored()
  }
}

function kindFromRaw(raw: Record<string, unknown>): GenerationAcceptanceKind {
  if (raw.kind === 'smart-patch-variants') {
    return 'smart-patch-variants'
  }
  if (!Object.hasOwn(raw, 'kind') && Array.isArray(raw.acceptedLayers)) {
    return 'raster'
  }
  throw invalidStored()
}

function validProjectPath(projectPath: unknown, localProjectKey: unknown): boolean {
  return (
    typeof projectPath === 'string' &&
    path.isAbsolute(projectPath) &&
    path.normalize(projectPath) === projectPath &&
    path.extname(projectPath).toLowerCase() === '.igs' &&
    localProjectRecoveryKey(projectPath) === localProjectKey
  )
}

function validateIdentity(localProjectKey: string, documentId: string): void {
  if (
    typeof localProjectKey !== 'string' ||
    !PROJECT_KEY.test(localProjectKey) ||
    typeof documentId !== 'string' ||
    !UUID.test(documentId)
  ) {
    throw new SmartPatchAcceptanceJournalError(
      'SMART_PATCH_ACCEPTANCE_JOURNAL_INPUT_INVALID',
      'The acceptance Project identity is invalid.',
    )
  }
}

function invalidStored(): SmartPatchAcceptanceJournalError {
  return new SmartPatchAcceptanceJournalError(
    'SMART_PATCH_ACCEPTANCE_JOURNAL_INVALID',
    'The pending acceptance intent is invalid or owned by another target kind. Temporary pixels were preserved.',
  )
}

function conflict(): SmartPatchAcceptanceJournalError {
  return new SmartPatchAcceptanceJournalError(
    'SMART_PATCH_ACCEPTANCE_JOURNAL_CONFLICT',
    'The pending acceptance differs from this Smart Patch operation. Temporary pixels were preserved.',
  )
}
