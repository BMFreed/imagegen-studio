import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import {
  GENERATION_THUMBNAIL_MAX_BYTES,
  GENERATION_THUMBNAIL_MAX_SIDE,
} from '../../shared/projects/generation-thumbnail.js'
import { IGS_GENERATION_PNG_MAX_BYTES } from '../../shared/projects/project-schema.js'

import type { Kysely, Selectable } from 'kysely'

import { sql } from 'kysely'
import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { link, lstat, mkdir, open, readdir, realpath, rename, rm, unlink } from 'node:fs/promises'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import * as v from 'valibot'

import type { DB, GenerationCandidateReceipt, GenerationQueueItem } from '../db/database.types.js'

import {
  FrozenIllustriousPayloadSchema as FrozenPayloadSchema,
  GenerationQueueRepository,
} from './generation-queue.js'
import { GENERATION_STAGING_LIMITS } from './generation-staging-limits.js'
import { validateSrgbPngStream, validateSrgbWebpStream } from './igs-package.js'
import { frozenLoraFieldsAgree } from './illustrious-generation-loras.js'
import { localProjectRecoveryKey } from './project-identity.js'

const MAX_IMAGE_BYTES = IGS_GENERATION_PNG_MAX_BYTES
const MAX_FROZEN_PAYLOAD_BYTES = GENERATION_STAGING_LIMITS.frozenPayloadBytes
const MAX_MANIFEST_BYTES = GENERATION_STAGING_LIMITS.manifestBytes
const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
const PROJECT_KEY_PATTERN = /^project-v1-[a-f0-9]{64}$/
const SHA256_PATTERN = /^[a-f0-9]{64}$/
const MAX_THUMBNAIL_METADATA_BYTES = 4096

const UuidSchema = v.pipe(v.string(), v.uuid())
const Sha256Schema = v.pipe(v.string(), v.regex(SHA256_PATTERN))
const SafeUIntSchema = v.pipe(v.number(), v.safeInteger(), v.minValue(0))
const ThumbnailMetadataSchema = v.strictObject({
  byteSize: v.pipe(SafeUIntSchema, v.minValue(1), v.maxValue(GENERATION_THUMBNAIL_MAX_BYTES)),
  height: v.pipe(SafeUIntSchema, v.minValue(1), v.maxValue(GENERATION_THUMBNAIL_MAX_SIDE)),
  sha256: Sha256Schema,
  width: v.pipe(SafeUIntSchema, v.minValue(1), v.maxValue(GENERATION_THUMBNAIL_MAX_SIDE)),
})
const WorkerThumbnailSchema = v.strictObject({
  ...ThumbnailMetadataSchema.entries,
  outputPath: v.pipe(v.string(), v.nonEmpty()),
})
const ThumbnailCacheMetadataSchema = v.strictObject({
  schemaVersion: v.literal(1),
  sourceImageSha256: Sha256Schema,
  thumbnail: ThumbnailMetadataSchema,
})
const Uint32Schema = v.pipe(SafeUIntSchema, v.maxValue(0xff_ff_ff_ff))
const CandidateEntrySchema = v.strictObject({
  actualSeed: Uint32Schema,
  candidateId: UuidSchema,
  completedAt: v.pipe(v.string(), v.nonEmpty()),
  completionOrder: v.pipe(SafeUIntSchema, v.minValue(1)),
  documentId: UuidSchema,
  documentRevision: UuidSchema,
  expectedStatusSequence: SafeUIntSchema,
  frozenPayloadJson: v.pipe(v.string(), v.maxBytes(MAX_FROZEN_PAYLOAD_BYTES)),
  frozenPayloadSha256: Sha256Schema,
  image: v.strictObject({
    byteSize: v.pipe(SafeUIntSchema, v.minValue(1), v.maxValue(MAX_IMAGE_BYTES)),
    height: v.pipe(SafeUIntSchema, v.minValue(8), v.maxValue(2048)),
    iccSha256: v.literal(IGS_SRGB_ICC_SHA256),
    relativePath: v.pipe(v.string(), v.nonEmpty()),
    sha256: Sha256Schema,
    width: v.pipe(SafeUIntSchema, v.minValue(8), v.maxValue(2048)),
  }),
  localProjectKey: v.pipe(v.string(), v.regex(PROJECT_KEY_PATTERN)),
  projectPath: v.pipe(v.string(), v.nonEmpty()),
  queueItemId: UuidSchema,
  stagingSessionId: UuidSchema,
})
const SessionManifestSchema = v.strictObject({
  candidates: v.pipe(
    v.array(CandidateEntrySchema),
    v.maxLength(GENERATION_STAGING_LIMITS.candidates),
  ),
  localProjectKey: v.pipe(v.string(), v.regex(PROJECT_KEY_PATTERN)),
  schemaVersion: v.literal(1),
  stagingSessionId: UuidSchema,
})

export interface VerifiedGenerationCandidate {
  actualSeed: number
  assetPath: string
  bbox: { height: number; width: number; x: number; y: number }
  candidateId: string
  completedAt: string
  completionOrder: number
  documentId: string
  documentRevision: string
  frozenPayloadJson: string
  frozenPayloadSha256: string
  image: { byteSize: number; height: number; iccSha256: string; sha256: string; width: number }
  localProjectKey: string
  projectPath: string
  queueItemId: string
  stagingSessionId: string
  /** Rebuildable presentation cache; never part of the authoritative manifest or receipt. */
  thumbnail?: v.InferOutput<typeof ThumbnailMetadataSchema>
}
export interface GenerationStagingTestHooks {
  /** Crash window after a discard tombstone commits, before its candidate files are removed. */
  afterDiscardTombstone?: () => Promise<void>
  /** Crash window after manifest fsync, before the SQLite completion transaction. */
  afterManifestPublish?: () => Promise<void>
  /** A deletion failure after the tombstone must keep the candidate hidden for startup retry. */
  beforeSessionCleanup?: () => Promise<void>
}
export interface GenerationStagingBatchCapacityInput {
  entries: readonly { frozenPayloadJson: string; queueItemId: string }[]
  localProjectKey: string
  projectPath: string
  stagingSessionId: string
}
export type FrozenGenerationCandidatePayloadV1 = v.InferOutput<typeof FrozenPayloadSchema>
type CandidateEntry = v.InferOutput<typeof CandidateEntrySchema>
type FrozenPayload = FrozenGenerationCandidatePayloadV1
type SessionManifest = v.InferOutput<typeof SessionManifestSchema>

export class GenerationStagingError extends Error {
  constructor(
    readonly code:
      | 'STAGING_INPUT_INVALID'
      | 'STAGING_NOT_RECONCILED'
      | 'STAGING_OUTPUT_INVALID'
      | 'STAGING_STATUS_CONFLICT'
      | 'STAGING_STORAGE_UNSAFE',
    message: string,
  ) {
    super(message)
    this.name = 'GenerationStagingError'
  }
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/**
 * App-owned recovery for completed, still-unaccepted generation images. A receipt is reserved
 * before file publication; only a validated manifest and completed receipt may be exposed.
 */
export class GenerationStagingRepository {
  private pendingOperation: Promise<void> = Promise.resolve()
  private reconciled = false

  constructor(
    private readonly db: Kysely<DB>,
    private readonly dataRoot: string,
    private readonly testHooks: GenerationStagingTestHooks = {},
  ) {
    if (!path.isAbsolute(dataRoot) || path.resolve(dataRoot) !== dataRoot) {
      throw new GenerationStagingError(
        'STAGING_STORAGE_UNSAFE',
        'Application data root is invalid.',
      )
    }
  }

  /** Reject dispatch before startup has reconciled previous publication attempts. */
  assertReadyForPublication(): void {
    this.requireReconciled()
  }

  /**
   * End every old staging session owned by this local Project. The caller must first fence new
   * enqueue and confirm that this Project's unfinished workers have stopped. Tombstones commit
   * before cleanup, so a crash or deletion failure cannot resurrect a discarded candidate.
   */
  async discardProject(localProjectKey: string): Promise<{
    cleanupDeferred: boolean
    discardedSessionCount: number
  }> {
    if (!PROJECT_KEY_PATTERN.test(localProjectKey)) {
      throw new GenerationStagingError('STAGING_INPUT_INVALID', 'Project identity is invalid.')
    }
    return await this.serialize(async () => {
      this.requireReconciled()
      const root = await this.ensureStagingRoot()
      const projectRoot = path.join(root, localProjectKey)
      const diskSessions = new Set<string>()
      if (await exists(projectRoot)) {
        await checkPrivateDirectory(projectRoot)
        for (const name of await readdir(projectRoot)) {
          if (UUID_PATTERN.test(name)) {
            diskSessions.add(name)
          }
        }
      }
      const sessions = await this.db.transaction().execute(async (transaction) => {
        const queue = await transaction
          .selectFrom('generation_queue_item')
          .select('staging_session_id')
          .where('local_project_key', '=', localProjectKey)
          .execute()
        const receipts = await transaction
          .selectFrom('generation_candidate_receipt')
          .select('staging_session_id')
          .where('local_project_key', '=', localProjectKey)
          .execute()
        const previouslyDiscarded = await transaction
          .selectFrom('generation_staging_discarded_session')
          .select('staging_session_id')
          .where('local_project_key', '=', localProjectKey)
          .execute()
        const all = new Set([
          ...diskSessions,
          ...queue.map((row) => row.staging_session_id),
          ...receipts.map((row) => row.staging_session_id),
          ...previouslyDiscarded.map((row) => row.staging_session_id),
        ])
        for (const stagingSessionId of all) {
          if (!UUID_PATTERN.test(stagingSessionId)) {
            throw new GenerationStagingError(
              'STAGING_STORAGE_UNSAFE',
              'The Project has an invalid staging session identity.',
            )
          }
        }
        if (all.size > 0) {
          await transaction
            .insertInto('generation_staging_discarded_session')
            .values(
              [...all].map((stagingSessionId) => ({
                discarded_at: new Date().toISOString(),
                local_project_key: localProjectKey,
                staging_session_id: stagingSessionId,
              })),
            )
            .onConflict((conflict) =>
              conflict.columns(['local_project_key', 'staging_session_id']).doNothing(),
            )
            .execute()
        }
        return all
      })
      await this.testHooks.afterDiscardTombstone?.()
      const cleanupDeferred = !(await this.cleanupDiscardedSessions(
        root,
        localProjectKey,
        sessions,
      ))
      return { cleanupDeferred, discardedSessionCount: sessions.size }
    })
  }

  /**
   * Consume exactly the sessions captured by a completed Project handoff. New results published
   * after that capture must remain visible. Tombstones commit before best-effort asset cleanup.
   */
  async discardSessions(
    localProjectKey: string,
    stagingSessionIds: readonly string[],
  ): Promise<{ cleanupDeferred: boolean; discardedSessionCount: number }> {
    if (
      !PROJECT_KEY_PATTERN.test(localProjectKey) ||
      stagingSessionIds.some((id) => !UUID_PATTERN.test(id))
    ) {
      throw new GenerationStagingError(
        'STAGING_INPUT_INVALID',
        'Staging session identity is invalid.',
      )
    }
    return await this.serialize(async () => {
      this.requireReconciled()
      const sessions = new Set(stagingSessionIds)
      if (sessions.size === 0) {
        return { cleanupDeferred: false, discardedSessionCount: 0 }
      }
      const root = await this.ensureStagingRoot()
      await this.db.transaction().execute(async (transaction) => {
        const ids = [...sessions]
        const discardedAt = new Date().toISOString()
        for (let index = 0; index < ids.length; index += 400) {
          await transaction
            .insertInto('generation_staging_discarded_session')
            .values(
              ids.slice(index, index + 400).map((stagingSessionId) => ({
                discarded_at: discardedAt,
                local_project_key: localProjectKey,
                staging_session_id: stagingSessionId,
              })),
            )
            .onConflict((conflict) =>
              conflict.columns(['local_project_key', 'staging_session_id']).doNothing(),
            )
            .execute()
        }
      })
      await this.testHooks.afterDiscardTombstone?.()
      const cleanupDeferred = !(await this.cleanupDiscardedSessions(
        root,
        localProjectKey,
        sessions,
      ))
      return { cleanupDeferred, discardedSessionCount: sessions.size }
    })
  }

  /**
   * A processor may fail a running job only when publication definitely never reserved a receipt.
   * If this lookup fails, the processor must keep the job for restart reconciliation.
   */
  async hasPublicationReceipt(queueItemId: string): Promise<boolean> {
    assertUuid(queueItemId)
    return await this.serialize(async () => {
      this.requireReconciled()
      return (await this.receiptFor(queueItemId)) !== undefined
    })
  }

  /** Queue history may have been pruned; only the independent manifest and receipt are needed. */
  async listVerifiedCandidates(localProjectKey: string): Promise<VerifiedGenerationCandidate[]> {
    if (!PROJECT_KEY_PATTERN.test(localProjectKey)) {
      throw new GenerationStagingError('STAGING_INPUT_INVALID', 'Project identity is invalid.')
    }
    return await this.serialize(
      async () => await this.listVerifiedCandidatesUnlocked(localProjectKey),
    )
  }

  /**
   * Check a fresh batch before its queue inputs become visible. This reserves nothing: the caller
   * must serialize admission through publication. Future completions keep the exact frozen strings
   * and identities; only their unknown metadata is represented at its largest serialized size.
   */
  async preflightBatchCapacity(input: GenerationStagingBatchCapacityInput): Promise<void> {
    this.requireReconciled()
    if (
      !Array.isArray(input.entries) ||
      input.entries.length < 1 ||
      input.entries.length > GENERATION_STAGING_LIMITS.candidates ||
      typeof input.localProjectKey !== 'string' ||
      !PROJECT_KEY_PATTERN.test(input.localProjectKey) ||
      typeof input.projectPath !== 'string' ||
      !path.isAbsolute(input.projectPath) ||
      path.resolve(input.projectPath) !== input.projectPath ||
      localProjectRecoveryKey(input.projectPath) !== input.localProjectKey ||
      typeof input.stagingSessionId !== 'string' ||
      !UUID_PATTERN.test(input.stagingSessionId) ||
      input.entries.some(
        (entry) =>
          typeof entry?.queueItemId !== 'string' ||
          !UUID_PATTERN.test(entry.queueItemId) ||
          typeof entry.frozenPayloadJson !== 'string',
      ) ||
      new Set(input.entries.map((entry) => entry.queueItemId)).size !== input.entries.length
    ) {
      throw new GenerationStagingError(
        'STAGING_INPUT_INVALID',
        'The batch staging input is invalid.',
      )
    }
    // Preserve the admission decision even if a caller retains and changes the input array while
    // serialized storage work is waiting. Payload strings themselves are immutable primitives.
    const planned = {
      entries: input.entries.map((entry) => ({ ...entry })),
      localProjectKey: input.localProjectKey,
      projectPath: input.projectPath,
      stagingSessionId: input.stagingSessionId,
    }
    return await this.serialize(async () => {
      this.requireReconciled()
      if ((await realpath(planned.projectPath).catch(() => null)) !== planned.projectPath) {
        throw new GenerationStagingError('STAGING_INPUT_INVALID', 'The batch Project path changed.')
      }
      const candidates: CandidateEntry[] = planned.entries.map((entry) => {
        const payload = parseFrozenPayload(entry.frozenPayloadJson)
        const candidate: CandidateEntry = {
          actualSeed: 0xff_ff_ff_ff,
          candidateId: entry.queueItemId,
          // ECMAScript Date supports signed six-digit years: its longest ISO output is 27 bytes.
          completedAt: new Date(8_640_000_000_000_000).toISOString(),
          completionOrder: Number.MAX_SAFE_INTEGER,
          documentId: payload.context.documentId,
          documentRevision: payload.context.documentRevision,
          expectedStatusSequence: Number.MAX_SAFE_INTEGER,
          frozenPayloadJson: entry.frozenPayloadJson,
          frozenPayloadSha256: sha256(Buffer.from(entry.frozenPayloadJson, 'utf8')),
          image: {
            byteSize: MAX_IMAGE_BYTES,
            height: payload.context.bbox.height,
            iccSha256: IGS_SRGB_ICC_SHA256,
            relativePath: `assets/${entry.queueItemId}.png`,
            sha256: 'f'.repeat(64),
            width: payload.context.bbox.width,
          },
          localProjectKey: planned.localProjectKey,
          projectPath: planned.projectPath,
          queueItemId: entry.queueItemId,
          stagingSessionId: planned.stagingSessionId,
        }
        validateEntry(candidate)
        return candidate
      })
      const manifest: SessionManifest = {
        candidates,
        localProjectKey: planned.localProjectKey,
        schemaVersion: 1,
        stagingSessionId: planned.stagingSessionId,
      }
      if (
        Buffer.byteLength(JSON.stringify(manifest), 'utf8') > MAX_MANIFEST_BYTES ||
        !v.safeParse(SessionManifestSchema, manifest).success
      ) {
        throw new GenerationStagingError(
          'STAGING_INPUT_INVALID',
          'The batch staging manifest is too large.',
        )
      }

      const ids = planned.entries.map((entry) => entry.queueItemId)
      const [queued, receipt, discarded] = await Promise.all([
        this.db
          .selectFrom('generation_queue_item')
          .select('id')
          .where((eb) =>
            eb.or([eb('staging_session_id', '=', planned.stagingSessionId), eb('id', 'in', ids)]),
          )
          .executeTakeFirst(),
        this.db
          .selectFrom('generation_candidate_receipt')
          .select('candidate_id')
          .where((eb) =>
            eb.or([
              eb('staging_session_id', '=', planned.stagingSessionId),
              eb('candidate_id', 'in', ids),
              eb('queue_item_id', 'in', ids),
            ]),
          )
          .executeTakeFirst(),
        this.db
          .selectFrom('generation_staging_discarded_session')
          .select('staging_session_id')
          .where('staging_session_id', '=', planned.stagingSessionId)
          .executeTakeFirst(),
      ])
      if (queued || receipt || discarded) {
        throw new GenerationStagingError(
          'STAGING_INPUT_INVALID',
          'The batch staging session or job identity was already used.',
        )
      }

      const recoveryRoot = path.join(await this.canonicalDataRoot(false), 'recovery')
      const stagingRoot = path.join(recoveryRoot, 'generation-staging')
      await checkPrivateDirectory(recoveryRoot, false)
      await checkPrivateDirectory(stagingRoot, false)
      const projectRoot = path.join(stagingRoot, planned.localProjectKey)
      const existingProjectRoot = await lstat(projectRoot).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') {
          return null
        }
        throw error
      })
      if (existingProjectRoot) {
        await checkPrivateDirectory(projectRoot, false)
        const sessionRoot = path.join(projectRoot, planned.stagingSessionId)
        const existingSession = await lstat(sessionRoot).catch((error: NodeJS.ErrnoException) => {
          if (error.code === 'ENOENT') {
            return null
          }
          throw error
        })
        if (existingSession) {
          throw new GenerationStagingError(
            'STAGING_INPUT_INVALID',
            'The batch staging session path already exists.',
          )
        }
      }
    })
  }

  /**
   * Publish only a completed worker output for an exact running attempt. The provisional PNG must
   * be result.png in the main-owned scratch request directory, not an arbitrary path.
   */
  async publishIllustriousTxt2Img(input: {
    actualSeed: number
    expectedProvisionalRoot: string
    expectedStatusSequence: number
    provisionalOutputPath: string
    queueItemId: string
    thumbnail?: unknown
  }): Promise<VerifiedGenerationCandidate> {
    assertUuid(input.queueItemId)
    if (!isUint32(input.actualSeed) || !isSafeUInt(input.expectedStatusSequence)) {
      throw new GenerationStagingError(
        'STAGING_INPUT_INVALID',
        'The completion metadata is invalid.',
      )
    }
    return await this.serialize(async () => {
      this.requireReconciled()
      const queue = new GenerationQueueRepository(this.db, this.dataRoot)
      const verified = await queue.loadVerifiedInput(input.queueItemId)
      if (
        verified.item.status !== 'running' ||
        verified.item.statusSequence !== input.expectedStatusSequence
      ) {
        throw new GenerationStagingError('STAGING_STATUS_CONFLICT', 'The job is no longer running.')
      }
      const row = await this.db
        .selectFrom('generation_queue_item')
        .selectAll()
        .where('id', '=', input.queueItemId)
        .executeTakeFirstOrThrow()
      if (row.error_code !== null) {
        throw new GenerationStagingError('STAGING_STATUS_CONFLICT', 'The job was canceled.')
      }
      const frozenPayloadJson = row.frozen_payload_json
      if (
        Buffer.byteLength(frozenPayloadJson, 'utf8') > MAX_FROZEN_PAYLOAD_BYTES ||
        !isDeepStrictEqual(parseFrozenPayload(frozenPayloadJson), verified.payload)
      ) {
        throw new GenerationStagingError('STAGING_INPUT_INVALID', 'The frozen job changed.')
      }
      const outputPath = await this.verifiedProvisionalPath(
        input.expectedProvisionalRoot,
        input.provisionalOutputPath,
      )
      const outputBytes = await readStableFile(outputPath, MAX_IMAGE_BYTES)
      await validateOutputPng(outputBytes, verified.payload.context.bbox)
      const outputSha256 = sha256(outputBytes)
      const payloadSha256 = sha256(Buffer.from(frozenPayloadJson, 'utf8'))
      const receipt = await this.reserveReceipt({
        actualSeed: input.actualSeed,
        canonicalProjectPath: row.canonical_project_path,
        expectedStatusSequence: input.expectedStatusSequence,
        imageByteSize: outputBytes.length,
        imageSha256: outputSha256,
        localProjectKey: row.local_project_key,
        payloadSha256,
        queueItemId: input.queueItemId,
        stagingSessionId: row.staging_session_id,
      })
      const entry: CandidateEntry = {
        actualSeed: input.actualSeed,
        candidateId: input.queueItemId,
        completedAt: receipt.reserved_at,
        completionOrder: receipt.completion_order!,
        documentId: row.document_id,
        documentRevision: row.document_revision,
        expectedStatusSequence: input.expectedStatusSequence,
        frozenPayloadJson,
        frozenPayloadSha256: payloadSha256,
        image: {
          byteSize: outputBytes.length,
          height: verified.payload.context.bbox.height,
          iccSha256: IGS_SRGB_ICC_SHA256,
          relativePath: `assets/${input.queueItemId}.png`,
          sha256: outputSha256,
          width: verified.payload.context.bbox.width,
        },
        localProjectKey: row.local_project_key,
        projectPath: row.canonical_project_path,
        queueItemId: input.queueItemId,
        stagingSessionId: row.staging_session_id,
      }
      const sessionPath = await this.publishFiles(entry, outputBytes)
      await this.testHooks.afterManifestPublish?.()
      await this.commitCompletion(entry, 'live')
      // A derivative failure cannot turn a durable, validated PNG completion into a failed job.
      // This stays under the session gate, so discard cannot race publication and leave a cache.
      await this.publishThumbnailCache(entry, sessionPath, outputPath, input.thumbnail).catch(
        () => undefined,
      )
      const candidate = toVerifiedCandidate(entry, sessionPath)
      const cache = await this.readThumbnailCache(candidate, sessionPath).catch(() => null)
      return cache ? { ...candidate, thumbnail: cache.metadata } : candidate
    })
  }

  async readLastActualSeed(localProjectKey: string, documentId: string): Promise<number | null> {
    if (!PROJECT_KEY_PATTERN.test(localProjectKey) || !UUID_PATTERN.test(documentId)) {
      throw new GenerationStagingError('STAGING_INPUT_INVALID', 'Project identity is invalid.')
    }
    return await this.serialize(async () => {
      this.requireReconciled()
      const row = await this.db
        .selectFrom('generation_seed_cursor')
        .select(['actual_seed'])
        .where('local_project_key', '=', localProjectKey)
        .where('document_id', '=', documentId)
        .executeTakeFirst()
      return row?.actual_seed ?? null
    })
  }

  /** Copy only a currently visible, verified PNG while serialized with staging discard. */
  async readVerifiedCandidatePng(input: {
    candidateId: string
    imageSha256: string
    localProjectKey: string
    stagingSessionId: string
  }): Promise<Buffer | null> {
    if (
      !PROJECT_KEY_PATTERN.test(input.localProjectKey) ||
      !UUID_PATTERN.test(input.candidateId) ||
      !UUID_PATTERN.test(input.stagingSessionId) ||
      !SHA256_PATTERN.test(input.imageSha256)
    ) {
      throw new GenerationStagingError('STAGING_INPUT_INVALID', 'Candidate identity is invalid.')
    }
    return await this.serialize(async () => {
      const candidate = (await this.listVerifiedCandidatesUnlocked(input.localProjectKey)).find(
        (entry) =>
          entry.candidateId === input.candidateId &&
          entry.stagingSessionId === input.stagingSessionId &&
          entry.image.sha256 === input.imageSha256,
      )
      if (!candidate) {
        return null
      }
      // The list verified the image; the second stable read prevents a changed file from being
      // served between that verification and the byte copy returned to the protocol handler.
      const bytes = await readStableFile(candidate.assetPath, MAX_IMAGE_BYTES).catch(() => null)
      return bytes &&
        bytes.length === candidate.image.byteSize &&
        sha256(bytes) === candidate.image.sha256
        ? bytes
        : null
    })
  }

  /** A fresh cache read remains subordinate to the currently visible authoritative candidate. */
  async readVerifiedCandidateThumbnail(input: {
    candidateId: string
    imageSha256: string
    localProjectKey: string
    stagingSessionId: string
    thumbnailSha256: string
  }): Promise<Buffer | null> {
    if (
      !PROJECT_KEY_PATTERN.test(input.localProjectKey) ||
      !UUID_PATTERN.test(input.candidateId) ||
      !UUID_PATTERN.test(input.stagingSessionId) ||
      !SHA256_PATTERN.test(input.imageSha256) ||
      !SHA256_PATTERN.test(input.thumbnailSha256)
    ) {
      throw new GenerationStagingError('STAGING_INPUT_INVALID', 'Candidate identity is invalid.')
    }
    return await this.serialize(async () => {
      const candidate = (await this.listVerifiedCandidatesUnlocked(input.localProjectKey)).find(
        (entry) =>
          entry.candidateId === input.candidateId &&
          entry.stagingSessionId === input.stagingSessionId &&
          entry.image.sha256 === input.imageSha256,
      )
      if (!candidate || candidate.thumbnail?.sha256 !== input.thumbnailSha256) {
        return null
      }
      const sessionPath = path.dirname(path.dirname(candidate.assetPath))
      const cache = await this.readThumbnailCache(candidate, sessionPath).catch(() => null)
      return cache?.metadata.sha256 === input.thumbnailSha256 ? cache.bytes : null
    })
  }

  /**
   * Must run after queue.recoverAfterRestart(). An APP_RESTART transition is the only canceled
   * attempt that may be completed from a valid already-published manifest.
   */
  async recoverAfterRestart(): Promise<{ invalidCount: number; reconciledCount: number }> {
    return await this.serialize(async () => {
      this.reconciled = false
      const root = await this.ensureStagingRoot()
      let invalidCount = 0
      let reconciledCount = 0
      const scanned = await this.scanEntries(root)
      invalidCount += scanned.invalidManifestCount
      for (const { entry, sessionPath } of scanned.entries) {
        const verified = await this.verifyEntry(entry, sessionPath).catch(() => null)
        if (!verified) {
          invalidCount += 1
          continue
        }
        const receipt = await this.receiptFor(entry.candidateId)
        if (!receipt || !receiptMatches(receipt, entry)) {
          invalidCount += 1
          continue
        }
        if (receipt.status === 'reserved') {
          const row = await this.queueRow(entry.queueItemId)
          if (
            !row ||
            row.status !== 'canceled' ||
            row.error_code !== 'APP_RESTART' ||
            row.status_sequence !== entry.expectedStatusSequence + 1 ||
            !queueRowMatches(row, entry)
          ) {
            invalidCount += 1
            continue
          }
          await this.commitCompletion(entry, 'restart')
          reconciledCount += 1
        } else if (receipt.status === 'completed') {
          const row = await this.queueRow(entry.queueItemId)
          if (row && (row.status !== 'completed' || !queueRowMatches(row, entry))) {
            invalidCount += 1
          }
        } else {
          invalidCount += 1
        }
      }
      // A close may have committed its tombstones immediately before a crash. Cleanup is best
      // effort; the tombstones remain authoritative even when a file cannot be removed yet.
      await this.cleanupAllDiscardedSessions(root)
      this.reconciled = true
      return { invalidCount, reconciledCount }
    })
  }

  private async canonicalDataRoot(hardenPermissions = true): Promise<string> {
    const canonical = await realpath(this.dataRoot).catch(() => null)
    if (!canonical) {
      throw new GenerationStagingError('STAGING_STORAGE_UNSAFE', 'Application storage is missing.')
    }
    await checkPrivateDirectory(canonical, hardenPermissions)
    return canonical
  }

  private async cleanupAllDiscardedSessions(root: string): Promise<void> {
    const rows = await this.db
      .selectFrom('generation_staging_discarded_session')
      .select(['local_project_key', 'staging_session_id'])
      .execute()
    const projects = new Map<string, Set<string>>()
    for (const row of rows) {
      const sessions = projects.get(row.local_project_key) ?? new Set<string>()
      sessions.add(row.staging_session_id)
      projects.set(row.local_project_key, sessions)
    }
    for (const [localProjectKey, sessions] of projects) {
      await this.cleanupDiscardedSessions(root, localProjectKey, sessions)
    }
  }

  private async cleanupDiscardedSessions(
    root: string,
    localProjectKey: string,
    sessions: ReadonlySet<string>,
  ): Promise<boolean> {
    const projectRoot = path.join(root, localProjectKey)
    if (!(await exists(projectRoot))) {
      return true
    }
    try {
      await checkPrivateDirectory(projectRoot)
    } catch {
      return false
    }
    let clean = true
    for (const sessionId of sessions) {
      if (!UUID_PATTERN.test(sessionId)) {
        clean = false
        continue
      }
      const sessionRoot = path.join(projectRoot, sessionId)
      if (!(await exists(sessionRoot))) {
        continue
      }
      try {
        await checkPrivateDirectory(sessionRoot)
        await this.testHooks.beforeSessionCleanup?.()
        await rm(sessionRoot, { force: true, recursive: true })
        await syncDirectory(projectRoot)
      } catch {
        clean = false
      }
    }
    return clean
  }

  private async commitCompletion(entry: CandidateEntry, source: 'live' | 'restart'): Promise<void> {
    await this.db.transaction().execute(async (transaction) => {
      const discarded = await transaction
        .selectFrom('generation_staging_discarded_session')
        .select('staging_session_id')
        .where('local_project_key', '=', entry.localProjectKey)
        .where('staging_session_id', '=', entry.stagingSessionId)
        .executeTakeFirst()
      if (discarded) {
        throw new GenerationStagingError(
          'STAGING_STATUS_CONFLICT',
          'The staging session was discarded.',
        )
      }
      const receipt = await transaction
        .selectFrom('generation_candidate_receipt')
        .selectAll()
        .where('candidate_id', '=', entry.candidateId)
        .executeTakeFirst()
      if (!receipt || receipt.status !== 'reserved' || !receiptMatches(receipt, entry)) {
        throw new GenerationStagingError(
          'STAGING_STATUS_CONFLICT',
          'The completion receipt changed.',
        )
      }
      const row = await transaction
        .selectFrom('generation_queue_item')
        .selectAll()
        .where('id', '=', entry.queueItemId)
        .executeTakeFirst()
      const expectedSequence =
        source === 'live' ? entry.expectedStatusSequence : entry.expectedStatusSequence + 1
      if (
        !row ||
        !queueRowMatches(row, entry) ||
        row.status_sequence !== expectedSequence ||
        (source === 'live'
          ? row.status !== 'running' || row.error_code !== null
          : row.status !== 'canceled' || row.error_code !== 'APP_RESTART')
      ) {
        throw new GenerationStagingError(
          'STAGING_STATUS_CONFLICT',
          'The job was canceled or changed before completion.',
        )
      }
      const now = new Date().toISOString()
      const updatedQueue = await transaction
        .updateTable('generation_queue_item')
        .set({
          error_code: null,
          error_message: null,
          finished_at: entry.completedAt,
          status: 'completed',
          status_sequence: sql<number>`status_sequence + 1`,
          updated_at: now,
        })
        .where('id', '=', entry.queueItemId)
        .where('status', '=', row.status)
        .where('status_sequence', '=', expectedSequence)
        .executeTakeFirst()
      if (Number(updatedQueue.numUpdatedRows) !== 1) {
        throw new GenerationStagingError(
          'STAGING_STATUS_CONFLICT',
          'The job changed during completion.',
        )
      }
      const updatedReceipt = await transaction
        .updateTable('generation_candidate_receipt')
        .set({ completed_at: entry.completedAt, status: 'completed' })
        .where('candidate_id', '=', entry.candidateId)
        .where('status', '=', 'reserved')
        .executeTakeFirst()
      if (Number(updatedReceipt.numUpdatedRows) !== 1) {
        throw new GenerationStagingError(
          'STAGING_STATUS_CONFLICT',
          'The completion receipt changed during commit.',
        )
      }
      await sql`
        INSERT INTO generation_seed_cursor
          (local_project_key, document_id, completion_order, candidate_id, actual_seed, updated_at)
        VALUES
          (${entry.localProjectKey}, ${entry.documentId}, ${entry.completionOrder}, ${entry.candidateId},
           ${entry.actualSeed}, ${now})
        ON CONFLICT(local_project_key) DO UPDATE SET
          document_id = excluded.document_id,
          completion_order = excluded.completion_order,
          candidate_id = excluded.candidate_id,
          actual_seed = excluded.actual_seed,
          updated_at = excluded.updated_at
        WHERE excluded.completion_order > generation_seed_cursor.completion_order
      `.execute(transaction)
    })
  }

  private async ensureStagingRoot(): Promise<string> {
    const dataRoot = await this.canonicalDataRoot()
    const recoveryRoot = path.join(dataRoot, 'recovery')
    const stagingRoot = path.join(recoveryRoot, 'generation-staging')
    await ensurePrivateDirectory(recoveryRoot)
    await ensurePrivateDirectory(stagingRoot)
    return stagingRoot
  }

  private async isDiscardedSession(
    localProjectKey: string,
    stagingSessionId: string,
  ): Promise<boolean> {
    const row = await this.db
      .selectFrom('generation_staging_discarded_session')
      .select('staging_session_id')
      .where('local_project_key', '=', localProjectKey)
      .where('staging_session_id', '=', stagingSessionId)
      .executeTakeFirst()
    return row !== undefined
  }

  private async listVerifiedCandidatesUnlocked(
    localProjectKey: string,
  ): Promise<VerifiedGenerationCandidate[]> {
    this.requireReconciled()
    const root = await this.ensureStagingRoot()
    const projectPath = path.join(root, localProjectKey)
    if (!(await exists(projectPath))) {
      return []
    }
    await checkPrivateDirectory(projectPath)
    const candidates: VerifiedGenerationCandidate[] = []
    const scanned = await this.scanEntries(root, localProjectKey)
    for (const { entry, sessionPath } of scanned.entries) {
      if (await this.isDiscardedSession(entry.localProjectKey, entry.stagingSessionId)) {
        continue
      }
      const receipt = await this.receiptFor(entry.candidateId)
      if (!receipt || receipt.status !== 'completed' || !receiptMatches(receipt, entry)) {
        continue
      }
      const row = await this.queueRow(entry.queueItemId)
      if (row && (row.status !== 'completed' || !queueRowMatches(row, entry))) {
        continue
      }
      const verified = await this.verifyEntry(entry, sessionPath).catch(() => null)
      if (verified) {
        candidates.push(verified)
      }
    }
    return candidates.sort((a, b) => a.completionOrder - b.completionOrder)
  }

  private async publishFiles(entry: CandidateEntry, outputBytes: Buffer): Promise<string> {
    const root = await this.ensureStagingRoot()
    const projectRoot = path.join(root, entry.localProjectKey)
    const sessionRoot = path.join(projectRoot, entry.stagingSessionId)
    const assetsRoot = path.join(sessionRoot, 'assets')
    await ensurePrivateDirectory(projectRoot)
    await ensurePrivateDirectory(sessionRoot)
    await ensurePrivateDirectory(assetsRoot)
    const assetPath = path.join(assetsRoot, `${entry.candidateId}.png`)
    if (await exists(assetPath)) {
      const existing = await readStableFile(assetPath, MAX_IMAGE_BYTES)
      if (!existing.equals(outputBytes)) {
        throw new GenerationStagingError(
          'STAGING_OUTPUT_INVALID',
          'The candidate output already exists with different pixels.',
        )
      }
    } else {
      const temporary = path.join(assetsRoot, `.tmp-${randomUUID()}`)
      let linked = false
      try {
        await writeDurableFile(temporary, outputBytes)
        await link(temporary, assetPath)
        linked = true
        // The final asset must have a single durable directory entry before a manifest can
        // refer to it. Otherwise a crash can restore the temporary hardlink and invalidate it.
        await unlink(temporary)
        await syncDirectory(assetsRoot)
      } catch (error) {
        if (!linked) {
          await unlink(temporary).catch(() => undefined)
        }
        throw error
      }
    }

    const manifestPath = path.join(sessionRoot, 'manifest.json')
    const manifest = (await this.readSessionManifest(manifestPath)) ?? {
      candidates: [],
      localProjectKey: entry.localProjectKey,
      schemaVersion: 1,
      stagingSessionId: entry.stagingSessionId,
    }
    if (
      manifest.localProjectKey !== entry.localProjectKey ||
      manifest.stagingSessionId !== entry.stagingSessionId
    ) {
      throw new GenerationStagingError('STAGING_STORAGE_UNSAFE', 'The staging session changed.')
    }
    const existing = manifest.candidates.find(
      (candidate) => candidate.candidateId === entry.candidateId,
    )
    if (existing) {
      entry.completedAt = existing.completedAt
      if (!isDeepStrictEqual(existing, entry)) {
        throw new GenerationStagingError(
          'STAGING_OUTPUT_INVALID',
          'The candidate manifest already has different completion data.',
        )
      }
      return sessionRoot
    }
    const next: SessionManifest = { ...manifest, candidates: [...manifest.candidates, entry] }
    const bytes = Buffer.from(JSON.stringify(next), 'utf8')
    if (bytes.length > MAX_MANIFEST_BYTES || !v.safeParse(SessionManifestSchema, next).success) {
      throw new GenerationStagingError(
        'STAGING_INPUT_INVALID',
        'The staging manifest is too large.',
      )
    }
    const temporary = path.join(sessionRoot, `.manifest-${randomUUID()}.tmp`)
    try {
      await writeDurableFile(temporary, bytes)
      await rename(temporary, manifestPath)
      await syncDirectory(sessionRoot)
    } finally {
      await unlink(temporary).catch(() => undefined)
    }
    return sessionRoot
  }

  private async publishThumbnailCache(
    entry: CandidateEntry,
    sessionPath: string,
    provisionalOutputPath: string,
    thumbnail: unknown,
  ): Promise<void> {
    const parsed = v.safeParse(WorkerThumbnailSchema, thumbnail)
    if (!parsed.success || parsed.output.outputPath !== `${provisionalOutputPath}.thumb.webp`) {
      return
    }
    const { outputPath, ...metadata } = parsed.output
    const bytes = await readStableFile(outputPath, GENERATION_THUMBNAIL_MAX_BYTES)
    await validateThumbnailBytes(bytes, metadata, entry.image)
    const cacheRoot = path.join(sessionPath, 'thumbnail-cache')
    await ensurePrivateDirectory(cacheRoot)
    const temporaryImagePath = path.join(cacheRoot, `${entry.candidateId}-${randomUUID()}.webp`)
    const temporaryMetadataPath = path.join(cacheRoot, `${entry.candidateId}-${randomUUID()}.json`)
    try {
      await writeDurableFile(temporaryImagePath, bytes)
      await writeDurableFile(
        temporaryMetadataPath,
        Buffer.from(
          JSON.stringify({
            schemaVersion: 1,
            sourceImageSha256: entry.image.sha256,
            thumbnail: metadata,
          }),
          'utf8',
        ),
      )
      await rename(temporaryImagePath, path.join(cacheRoot, `${entry.candidateId}.webp`))
      await rename(temporaryMetadataPath, path.join(cacheRoot, `${entry.candidateId}.json`))
      await syncDirectory(cacheRoot)
    } finally {
      await rm(temporaryImagePath, { force: true }).catch(() => undefined)
      await rm(temporaryMetadataPath, { force: true }).catch(() => undefined)
    }
  }

  private async queueRow(id: string) {
    return await this.db
      .selectFrom('generation_queue_item')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst()
  }

  private async readSessionManifest(manifestPath: string): Promise<SessionManifest | null> {
    if (!(await exists(manifestPath))) {
      return null
    }
    const bytes = await readStableFile(manifestPath, MAX_MANIFEST_BYTES)
    let value: unknown
    try {
      value = JSON.parse(bytes.toString('utf8')) as unknown
    } catch {
      throw new GenerationStagingError('STAGING_INPUT_INVALID', 'The staging manifest is invalid.')
    }
    const parsed = v.safeParse(SessionManifestSchema, value)
    if (!parsed.success) {
      throw new GenerationStagingError('STAGING_INPUT_INVALID', 'The staging manifest is invalid.')
    }
    const seen = new Set<string>()
    for (const entry of parsed.output.candidates) {
      if (seen.has(entry.candidateId)) {
        throw new GenerationStagingError(
          'STAGING_INPUT_INVALID',
          'The staging manifest has duplicates.',
        )
      }
      if (
        entry.localProjectKey !== parsed.output.localProjectKey ||
        entry.stagingSessionId !== parsed.output.stagingSessionId
      ) {
        throw new GenerationStagingError(
          'STAGING_INPUT_INVALID',
          'The candidate belongs to a different staging session.',
        )
      }
      seen.add(entry.candidateId)
      validateEntry(entry)
    }
    return parsed.output
  }

  private async readThumbnailCache(
    candidate: Pick<VerifiedGenerationCandidate, 'candidateId' | 'image'>,
    sessionPath: string,
  ): Promise<{
    bytes: Buffer
    metadata: v.InferOutput<typeof ThumbnailMetadataSchema>
  } | null> {
    const cacheRoot = path.join(sessionPath, 'thumbnail-cache')
    await checkPrivateDirectory(cacheRoot, false)
    const metadataBytes = await readStableFile(
      path.join(cacheRoot, `${candidate.candidateId}.json`),
      MAX_THUMBNAIL_METADATA_BYTES,
    )
    const parsed = v.safeParse(
      ThumbnailCacheMetadataSchema,
      JSON.parse(metadataBytes.toString('utf8')),
    )
    if (!parsed.success || parsed.output.sourceImageSha256 !== candidate.image.sha256) {
      return null
    }
    const bytes = await readStableFile(
      path.join(cacheRoot, `${candidate.candidateId}.webp`),
      GENERATION_THUMBNAIL_MAX_BYTES,
    )
    await validateThumbnailBytes(bytes, parsed.output.thumbnail, candidate.image)
    return { bytes, metadata: parsed.output.thumbnail }
  }

  private async receiptFor(candidateId: string) {
    return await this.db
      .selectFrom('generation_candidate_receipt')
      .selectAll()
      .where('candidate_id', '=', candidateId)
      .executeTakeFirst()
  }

  private requireReconciled(): void {
    if (!this.reconciled) {
      throw new GenerationStagingError(
        'STAGING_NOT_RECONCILED',
        'Generation staging must be reconciled before use.',
      )
    }
  }

  private async reserveReceipt(input: {
    actualSeed: number
    canonicalProjectPath: string
    expectedStatusSequence: number
    imageByteSize: number
    imageSha256: string
    localProjectKey: string
    payloadSha256: string
    queueItemId: string
    stagingSessionId: string
  }): Promise<Selectable<GenerationCandidateReceipt>> {
    return await this.db.transaction().execute(async (transaction) => {
      const discarded = await transaction
        .selectFrom('generation_staging_discarded_session')
        .select('staging_session_id')
        .where('local_project_key', '=', input.localProjectKey)
        .where('staging_session_id', '=', input.stagingSessionId)
        .executeTakeFirst()
      if (discarded) {
        throw new GenerationStagingError(
          'STAGING_STATUS_CONFLICT',
          'The staging session was discarded.',
        )
      }
      const row = await transaction
        .selectFrom('generation_queue_item')
        .selectAll()
        .where('id', '=', input.queueItemId)
        .executeTakeFirst()
      if (
        !row ||
        row.status !== 'running' ||
        row.error_code !== null ||
        row.status_sequence !== input.expectedStatusSequence ||
        row.canonical_project_path !== input.canonicalProjectPath ||
        row.local_project_key !== input.localProjectKey ||
        row.staging_session_id !== input.stagingSessionId
      ) {
        throw new GenerationStagingError('STAGING_STATUS_CONFLICT', 'The job is no longer running.')
      }
      const existing = await transaction
        .selectFrom('generation_candidate_receipt')
        .selectAll()
        .where('candidate_id', '=', input.queueItemId)
        .executeTakeFirst()
      if (existing) {
        if (
          existing.status !== 'reserved' ||
          existing.actual_seed !== input.actualSeed ||
          existing.expected_status_sequence !== input.expectedStatusSequence ||
          existing.image_byte_size !== input.imageByteSize ||
          existing.image_sha256 !== input.imageSha256 ||
          existing.frozen_payload_sha256 !== input.payloadSha256 ||
          existing.canonical_project_path !== input.canonicalProjectPath ||
          existing.local_project_key !== input.localProjectKey ||
          existing.staging_session_id !== input.stagingSessionId
        ) {
          throw new GenerationStagingError(
            'STAGING_STATUS_CONFLICT',
            'This completion attempt has a different reservation.',
          )
        }
        return existing
      }
      const now = new Date().toISOString()
      const inserted = await transaction
        .insertInto('generation_candidate_receipt')
        .values({
          actual_seed: input.actualSeed,
          candidate_id: input.queueItemId,
          canonical_project_path: input.canonicalProjectPath,
          completed_at: null,
          expected_status_sequence: input.expectedStatusSequence,
          frozen_payload_sha256: input.payloadSha256,
          image_byte_size: input.imageByteSize,
          image_sha256: input.imageSha256,
          local_project_key: input.localProjectKey,
          queue_item_id: input.queueItemId,
          reserved_at: now,
          staging_session_id: input.stagingSessionId,
          status: 'reserved',
        })
        .returningAll()
        .executeTakeFirstOrThrow()
      if (!Number.isSafeInteger(inserted.completion_order) || inserted.completion_order! < 1) {
        throw new GenerationStagingError(
          'STAGING_STORAGE_UNSAFE',
          'The completion order could not be reserved.',
        )
      }
      return inserted
    })
  }

  private async scanEntries(
    root: string,
    onlyProjectKey?: string,
  ): Promise<{
    entries: { entry: CandidateEntry; sessionPath: string }[]
    invalidManifestCount: number
  }> {
    const entries: { entry: CandidateEntry; sessionPath: string }[] = []
    let invalidManifestCount = 0
    const projectNames = onlyProjectKey ? [onlyProjectKey] : await readdir(root)
    for (const projectName of projectNames) {
      if (!PROJECT_KEY_PATTERN.test(projectName)) {
        continue
      }
      const projectRoot = path.join(root, projectName)
      if (!(await exists(projectRoot))) {
        continue
      }
      await checkPrivateDirectory(projectRoot)
      for (const sessionName of await readdir(projectRoot)) {
        if (!UUID_PATTERN.test(sessionName)) {
          continue
        }
        if (await this.isDiscardedSession(projectName, sessionName)) {
          continue
        }
        const sessionRoot = path.join(projectRoot, sessionName)
        await checkPrivateDirectory(sessionRoot)
        let manifest: SessionManifest | null
        try {
          manifest = await this.readSessionManifest(path.join(sessionRoot, 'manifest.json'))
        } catch (error) {
          if (error instanceof GenerationStagingError && error.code === 'STAGING_STORAGE_UNSAFE') {
            throw error
          }
          invalidManifestCount += 1
          continue
        }
        if (!manifest) {
          continue
        }
        if (manifest.localProjectKey !== projectName || manifest.stagingSessionId !== sessionName) {
          invalidManifestCount += 1
          continue
        }
        for (const entry of manifest.candidates) {
          entries.push({ entry, sessionPath: sessionRoot })
        }
      }
    }
    return { entries, invalidManifestCount }
  }

  private async serialize<T>(operation: () => Promise<T>): Promise<T> {
    const prior = this.pendingOperation
    let release!: () => void
    this.pendingOperation = new Promise<void>((resolve) => {
      release = resolve
    })
    await prior
    try {
      return await operation()
    } finally {
      release()
    }
  }

  private async verifiedProvisionalPath(
    expectedProvisionalRoot: string,
    provisionalOutputPath: string,
  ): Promise<string> {
    if (
      !path.isAbsolute(expectedProvisionalRoot) ||
      path.resolve(expectedProvisionalRoot) !== expectedProvisionalRoot ||
      provisionalOutputPath !== path.join(expectedProvisionalRoot, 'result.png')
    ) {
      throw new GenerationStagingError(
        'STAGING_OUTPUT_INVALID',
        'The provisional output path is invalid.',
      )
    }
    const dataRoot = await this.canonicalDataRoot()
    const scratch = path.join(dataRoot, 'scratch')
    await ensurePrivateDirectory(scratch)
    const canonicalStage = await realpath(expectedProvisionalRoot).catch(() => null)
    if (
      canonicalStage !== expectedProvisionalRoot ||
      !isStrictChild(scratch, canonicalStage) ||
      !path.basename(canonicalStage).startsWith('illustrious-request-')
    ) {
      throw new GenerationStagingError(
        'STAGING_OUTPUT_INVALID',
        'The provisional output is outside the application scratch area.',
      )
    }
    await checkPrivateDirectory(canonicalStage)
    return provisionalOutputPath
  }

  private async verifyEntry(
    entry: CandidateEntry,
    sessionPath: string,
  ): Promise<VerifiedGenerationCandidate> {
    validateEntry(entry)
    const assetsRoot = path.join(sessionPath, 'assets')
    await checkPrivateDirectory(assetsRoot)
    const assetPath = path.join(assetsRoot, `${entry.candidateId}.png`)
    const bytes = await readStableFile(assetPath, MAX_IMAGE_BYTES)
    const payload = parseFrozenPayload(entry.frozenPayloadJson)
    await validateOutputPng(bytes, payload.context.bbox)
    if (
      bytes.length !== entry.image.byteSize ||
      sha256(bytes) !== entry.image.sha256 ||
      payload.context.documentId !== entry.documentId ||
      payload.context.documentRevision !== entry.documentRevision ||
      payload.context.bbox.width !== entry.image.width ||
      payload.context.bbox.height !== entry.image.height
    ) {
      throw new GenerationStagingError('STAGING_OUTPUT_INVALID', 'The candidate output changed.')
    }
    const candidate = toVerifiedCandidate(entry, sessionPath)
    const cache = await this.readThumbnailCache(candidate, sessionPath).catch(() => null)
    return cache ? { ...candidate, thumbnail: cache.metadata } : candidate
  }
}

/** Parse a candidate's operational payload with the same strict checks as staging recovery. */
export function parseFrozenGenerationCandidatePayloadV1(
  json: string,
): FrozenGenerationCandidatePayloadV1 {
  return parseFrozenPayload(json)
}

function parseFrozenPayload(json: string): FrozenPayload {
  if (Buffer.byteLength(json, 'utf8') > MAX_FROZEN_PAYLOAD_BYTES) {
    throw new GenerationStagingError(
      'STAGING_INPUT_INVALID',
      'The frozen candidate context is too large.',
    )
  }
  let value: unknown
  try {
    value = JSON.parse(json) as unknown
  } catch {
    throw new GenerationStagingError(
      'STAGING_INPUT_INVALID',
      'The frozen candidate context is invalid.',
    )
  }
  const parsed = v.safeParse(FrozenPayloadSchema, value)
  if (!parsed.success) {
    throw new GenerationStagingError(
      'STAGING_INPUT_INVALID',
      'The frozen candidate context is invalid.',
    )
  }
  const payload = parsed.output
  const { context, workerJob } = payload
  if (
    (context.kind === 'normal-img2img-preparation' &&
      (!('denoisingStrength' in workerJob.sampling) ||
        context.sampling.denoisingStrength !== workerJob.sampling.denoisingStrength)) ||
    !frozenLoraFieldsAgree(context, workerJob.loras) ||
    !isDeepStrictEqual(context.bbox, workerJob.bbox) ||
    !isDeepStrictEqual(context.prompts, workerJob.prompts) ||
    context.model.managedPath !== workerJob.checkpoint.path ||
    context.model.reference.fileSha256 !== workerJob.checkpoint.sha256 ||
    context.model.reference.predictionType !== workerJob.checkpoint.predictionType ||
    (context.sampling.cfgRescale ?? 0) !== (workerJob.sampling.cfgRescale ?? 0) ||
    context.sampling.cfgScale !== workerJob.sampling.cfgScale ||
    context.sampling.invokeScheduler !== workerJob.sampling.scheduler ||
    context.sampling.seed !== workerJob.sampling.seed ||
    context.sampling.steps !== workerJob.sampling.steps ||
    context.target.byteSize !== workerJob.target.byteSize ||
    context.target.sha256 !== workerJob.target.sha256 ||
    context.target.width !== workerJob.target.width ||
    context.target.height !== workerJob.target.height ||
    context.bbox.width !== context.target.width ||
    context.bbox.height !== context.target.height ||
    !path.isAbsolute(context.model.managedPath) ||
    path.resolve(context.model.managedPath) !== context.model.managedPath
  ) {
    throw new GenerationStagingError(
      'STAGING_INPUT_INVALID',
      'The frozen candidate context changed.',
    )
  }
  return payload
}

function validateEntry(entry: CandidateEntry): void {
  if (
    entry.candidateId !== entry.queueItemId ||
    entry.image.relativePath !== `assets/${entry.candidateId}.png` ||
    !path.isAbsolute(entry.projectPath) ||
    path.resolve(entry.projectPath) !== entry.projectPath ||
    localProjectRecoveryKey(entry.projectPath) !== entry.localProjectKey ||
    sha256(Buffer.from(entry.frozenPayloadJson, 'utf8')) !== entry.frozenPayloadSha256
  ) {
    throw new GenerationStagingError('STAGING_INPUT_INVALID', 'The candidate manifest changed.')
  }
  const payload = parseFrozenPayload(entry.frozenPayloadJson)
  if (
    payload.context.documentId !== entry.documentId ||
    payload.context.documentRevision !== entry.documentRevision ||
    payload.context.bbox.width !== entry.image.width ||
    payload.context.bbox.height !== entry.image.height
  ) {
    throw new GenerationStagingError('STAGING_INPUT_INVALID', 'The candidate context changed.')
  }
}

function receiptMatches(
  receipt: Selectable<GenerationCandidateReceipt>,
  entry: CandidateEntry,
): boolean {
  return (
    receipt.completion_order === entry.completionOrder &&
    receipt.candidate_id === entry.candidateId &&
    receipt.queue_item_id === entry.queueItemId &&
    receipt.expected_status_sequence === entry.expectedStatusSequence &&
    receipt.local_project_key === entry.localProjectKey &&
    receipt.canonical_project_path === entry.projectPath &&
    receipt.staging_session_id === entry.stagingSessionId &&
    receipt.reserved_at === entry.completedAt &&
    (receipt.status === 'completed'
      ? receipt.completed_at === entry.completedAt
      : receipt.status === 'reserved' && receipt.completed_at === null) &&
    receipt.frozen_payload_sha256 === entry.frozenPayloadSha256 &&
    receipt.image_sha256 === entry.image.sha256 &&
    receipt.image_byte_size === entry.image.byteSize &&
    receipt.actual_seed === entry.actualSeed
  )
}

function queueRowMatches(row: Selectable<GenerationQueueItem>, entry: CandidateEntry): boolean {
  return (
    row.id === entry.queueItemId &&
    row.operation === parseFrozenPayload(entry.frozenPayloadJson).kind &&
    row.local_project_key === entry.localProjectKey &&
    row.staging_session_id === entry.stagingSessionId &&
    row.canonical_project_path === entry.projectPath &&
    row.document_id === entry.documentId &&
    row.document_revision === entry.documentRevision &&
    sha256(Buffer.from(row.frozen_payload_json, 'utf8')) === entry.frozenPayloadSha256
  )
}

function toVerifiedCandidate(
  entry: CandidateEntry,
  sessionPath: string,
): VerifiedGenerationCandidate {
  return {
    actualSeed: entry.actualSeed,
    assetPath: path.join(sessionPath, entry.image.relativePath),
    bbox: parseFrozenPayload(entry.frozenPayloadJson).context.bbox,
    candidateId: entry.candidateId,
    completedAt: entry.completedAt,
    completionOrder: entry.completionOrder,
    documentId: entry.documentId,
    documentRevision: entry.documentRevision,
    frozenPayloadJson: entry.frozenPayloadJson,
    frozenPayloadSha256: entry.frozenPayloadSha256,
    image: {
      byteSize: entry.image.byteSize,
      height: entry.image.height,
      iccSha256: entry.image.iccSha256,
      sha256: entry.image.sha256,
      width: entry.image.width,
    },
    localProjectKey: entry.localProjectKey,
    projectPath: entry.projectPath,
    queueItemId: entry.queueItemId,
    stagingSessionId: entry.stagingSessionId,
  }
}

async function validateOutputPng(
  bytes: Buffer,
  bbox: { height: number; width: number },
): Promise<void> {
  try {
    await validateSrgbPngStream(
      (async function* () {
        yield bytes
      })(),
      'result.png',
      MAX_IMAGE_BYTES,
      Math.max(bbox.width, bbox.height),
    )
  } catch {
    throw new GenerationStagingError(
      'STAGING_OUTPUT_INVALID',
      'The output is not a valid sRGB PNG.',
    )
  }
  if (
    bytes.length < 26 ||
    bytes.readUInt32BE(16) !== bbox.width ||
    bytes.readUInt32BE(20) !== bbox.height ||
    bytes[24] !== 8 ||
    (bytes[25] !== 2 && bytes[25] !== 6) ||
    !hasIccProfile(bytes)
  ) {
    throw new GenerationStagingError(
      'STAGING_OUTPUT_INVALID',
      'The output dimensions or color profile do not match the frozen job.',
    )
  }
}

function hasIccProfile(png: Buffer): boolean {
  let offset = 8
  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset)
    if (png.toString('ascii', offset + 4, offset + 8) === 'iCCP') {
      return true
    }
    offset += length + 12
  }
  return false
}

async function ensurePrivateDirectory(directory: string): Promise<void> {
  let created = false
  try {
    await mkdir(directory, { mode: 0o700 })
    created = true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error
    }
  }
  await checkPrivateDirectory(directory)
  if (created) {
    await syncDirectory(path.dirname(directory))
  }
}

async function checkPrivateDirectory(directory: string, hardenPermissions = true): Promise<void> {
  let handle
  try {
    handle = await open(
      directory,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    )
  } catch {
    throw new GenerationStagingError('STAGING_STORAGE_UNSAFE', 'Generation storage is unsafe.')
  }
  try {
    const atDescriptor = await handle.stat({ bigint: true })
    const atPath = await lstat(directory, { bigint: true })
    if (
      !atDescriptor.isDirectory() ||
      atPath.isSymbolicLink() ||
      atDescriptor.dev !== atPath.dev ||
      atDescriptor.ino !== atPath.ino ||
      (process.getuid?.() !== undefined && atDescriptor.uid !== BigInt(process.getuid()))
    ) {
      throw new GenerationStagingError('STAGING_STORAGE_UNSAFE', 'Generation storage is unsafe.')
    }
    if ((atDescriptor.mode & 0o77n) !== 0n) {
      if (!hardenPermissions) {
        throw new GenerationStagingError('STAGING_STORAGE_UNSAFE', 'Generation storage is unsafe.')
      }
      await handle.chmod(0o700)
    }
  } finally {
    await handle.close()
  }
}

async function readStableFile(filePath: string, maxBytes: number): Promise<Buffer> {
  let handle
  try {
    handle = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  } catch {
    throw new GenerationStagingError('STAGING_OUTPUT_INVALID', 'The candidate file is unavailable.')
  }
  try {
    const before = await handle.stat({ bigint: true })
    if (
      !before.isFile() ||
      before.size < 1n ||
      before.size > BigInt(maxBytes) ||
      before.nlink !== 1n ||
      (process.getuid?.() !== undefined && before.uid !== BigInt(process.getuid()))
    ) {
      throw new GenerationStagingError('STAGING_OUTPUT_INVALID', 'The candidate file is unsafe.')
    }
    // The extra byte detects growth without letting readFile allocate past the checked ceiling.
    const buffer = Buffer.alloc(Number(before.size) + 1)
    let length = 0
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length)
      if (bytesRead === 0) {
        break
      }
      length += bytesRead
    }
    const bytes = buffer.subarray(0, length)
    const after = await handle.stat({ bigint: true })
    const atPath = await lstat(filePath, { bigint: true })
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ctimeNs !== after.ctimeNs ||
      before.dev !== atPath.dev ||
      before.ino !== atPath.ino ||
      atPath.isSymbolicLink() ||
      bytes.length !== Number(before.size)
    ) {
      throw new GenerationStagingError('STAGING_OUTPUT_INVALID', 'The candidate file changed.')
    }
    return bytes
  } finally {
    await handle.close()
  }
}

async function validateThumbnailBytes(
  bytes: Buffer,
  metadata: v.InferOutput<typeof ThumbnailMetadataSchema>,
  source: { height: number; width: number },
): Promise<void> {
  const actual = await validateSrgbWebpStream(
    (async function* () {
      yield bytes
    })(),
    'candidate-thumbnail.webp',
    GENERATION_THUMBNAIL_MAX_BYTES,
    GENERATION_THUMBNAIL_MAX_SIDE,
  )
  if (
    bytes.length !== metadata.byteSize ||
    sha256(bytes) !== metadata.sha256 ||
    actual.width !== metadata.width ||
    actual.height !== metadata.height ||
    actual.width > source.width ||
    actual.height > source.height ||
    Math.abs(
      actual.width -
        source.width *
          Math.min(1, GENERATION_THUMBNAIL_MAX_SIDE / Math.max(source.width, source.height)),
    ) > 1 ||
    Math.abs(
      actual.height -
        source.height *
          Math.min(1, GENERATION_THUMBNAIL_MAX_SIDE / Math.max(source.width, source.height)),
    ) > 1
  ) {
    throw new GenerationStagingError('STAGING_OUTPUT_INVALID', 'The candidate thumbnail changed.')
  }
}

async function writeDurableFile(filePath: string, bytes: Buffer): Promise<void> {
  const handle = await open(filePath, 'wx', 0o600)
  try {
    await handle.writeFile(bytes)
    await handle.sync()
  } finally {
    await handle.close()
  }
}

async function syncDirectory(directory: string): Promise<void> {
  const handle = await open(
    directory,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  )
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await lstat(filePath)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false
    }
    throw error
  }
}

function isStrictChild(parent: string, child: string | null): child is string {
  return child !== null && child.startsWith(`${parent}${path.sep}`)
}

function isSafeUInt(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0
}

function isUint32(value: number): boolean {
  return isSafeUInt(value) && value <= 0xff_ff_ff_ff
}

function assertUuid(value: string): void {
  if (!UUID_PATTERN.test(value)) {
    throw new GenerationStagingError('STAGING_INPUT_INVALID', 'The queue item ID is invalid.')
  }
}
