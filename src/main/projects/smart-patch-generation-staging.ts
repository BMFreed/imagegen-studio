import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import { IGS_GENERATION_PNG_MAX_BYTES } from '../../shared/projects/project-schema.js'

import type { Kysely, Selectable } from 'kysely'

import { sql } from 'kysely'
import { createHash, randomUUID } from 'node:crypto'
import { type BigIntStats, constants } from 'node:fs'
import { link, lstat, mkdir, open, readdir, realpath, rmdir, unlink } from 'node:fs/promises'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import * as v from 'valibot'

import type { DB, GenerationCandidateReceipt, GenerationQueueItem } from '../db/database.types.js'
import type { FrozenQueuedSmartPatchV1 } from './smart-patch-queued-generation.js'
import type { VerifiedWorkerImage } from './worker-client.js'

import { GenerationQueueRepository } from './generation-queue.js'
import { GENERATION_STAGING_LIMITS } from './generation-staging-limits.js'
import { localProjectRecoveryKey } from './project-identity.js'
import { parseFrozenQueuedSmartPatchV1 } from './smart-patch-queued-generation.js'
import { readSmartPatchPreparationOutput, readSmartPatchWorldOutput } from './worker-client.js'

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
const PROJECT = /^project-v1-[a-f0-9]{64}$/
const SHA = /^[a-f0-9]{64}$/
const IMAGE = 'world-result.png'
const MASK = 'final-contribution-mask.png'
const MANIFEST = 'manifest.json'
const integer = (minimum = 0, maximum = Number.MAX_SAFE_INTEGER) =>
  v.pipe(v.number(), v.safeInteger(), v.minValue(minimum), v.maxValue(maximum))
const uuid = v.pipe(v.string(), v.uuid())
const sha = v.pipe(v.string(), v.regex(SHA))
const imageMetadata = {
  byteSize: integer(1, IGS_GENERATION_PNG_MAX_BYTES),
  height: integer(1, 2048),
  sha256: sha,
  width: integer(1, 2048),
}
const manifestSchema = v.strictObject({
  actualSeed: integer(0, 0xff_ff_ff_ff),
  candidateId: uuid,
  completedAt: v.pipe(v.string(), v.nonEmpty()),
  completionOrder: integer(1),
  documentId: uuid,
  documentRevision: uuid,
  expectedStatusSequence: integer(),
  finalContributionMask: v.strictObject({ ...imageMetadata, relativePath: v.literal(MASK) }),
  frozenPayloadJson: v.pipe(v.string(), v.maxBytes(GENERATION_STAGING_LIMITS.frozenPayloadBytes)),
  frozenPayloadSha256: sha,
  image: v.strictObject({
    ...imageMetadata,
    iccSha256: v.literal(IGS_SRGB_ICC_SHA256),
    relativePath: v.literal(IMAGE),
  }),
  kind: v.literal('smart-patch-world-candidate'),
  localProjectKey: v.pipe(v.string(), v.regex(PROJECT)),
  projectPath: v.pipe(v.string(), v.nonEmpty()),
  queueItemId: uuid,
  schemaVersion: v.literal(1),
  stagingSessionId: uuid,
})
/** Separate target contract: this must never be returned by normal Raster staging discovery. */
export interface VerifiedSmartPatchWorldCandidate {
  actualSeed: number
  assetPath: string
  bbox: { height: number; width: number; x: number; y: number }
  candidateId: string
  completedAt: string
  completionOrder: number
  documentId: string
  documentRevision: string
  finalContributionMask: {
    byteSize: number
    height: number
    path: string
    sha256: string
    width: number
  }
  frozenPayloadSha256: string
  frozenSmartPatchPayloadJson: string
  image: { byteSize: number; height: number; iccSha256: string; sha256: string; width: number }
  kind: 'smart-patch-world-candidate'
  localProjectKey: string
  payload: FrozenQueuedSmartPatchV1
  projectPath: string
  queueItemId: string
  stagingSessionId: string
}
export interface SmartPatchGenerationCandidatePublicationInput {
  actualSeed: number
  expectedProvisionalRoot: string
  expectedStatusSequence: number
  output: VerifiedWorkerImage
  provisionalOutputPath: string
  queueItemId: string
}
/** Main nominates the exact result it reviewed; caller-owned paths are never consumed. */
export interface SmartPatchCandidateReadIdentity {
  candidateId: string
  documentId: string
  frozenPayloadSha256: string
  imageSha256: string
  localProjectKey: string
  stagingSessionId: string
}
export interface VerifiedSmartPatchCandidateRead {
  candidate: VerifiedSmartPatchWorldCandidate
  finalMaskPngBytes: Buffer
  imagePngBytes: Buffer
}
export interface SmartPatchGenerationStagingTestHooks {
  afterCompletionCommit?: () => Promise<void>
  afterDiscardTombstone?: () => Promise<void>
  afterManifestPublish?: () => Promise<void>
  afterMaskPublish?: () => Promise<void>
  afterReceiptReservation?: () => Promise<void>
  /** Runs inside the real queue/receipt/cursor completion transaction. */
  beforeCompletionCommit?: () => Promise<void>
  beforeFileSync?: (filePath: string) => Promise<void>
  beforeSessionCleanup?: () => Promise<void>
}
type Manifest = v.InferOutput<typeof manifestSchema>

type Witness = Pick<BigIntStats, 'ctimeNs' | 'dev' | 'ino' | 'mtimeNs' | 'size'>

type QualifiedFile = { path: string; witness: Witness }

type QualifiedCandidate = {
  candidate: VerifiedSmartPatchWorldCandidate
  directory: Pick<BigIntStats, 'dev' | 'ino'>
  entry: Manifest
  files: QualifiedFile[]
}
type QualifiedCandidateBytes = QualifiedCandidate & {
  finalMaskPngBytes: Buffer
  imagePngBytes: Buffer
}

export class SmartPatchGenerationStagingError extends Error {
  constructor(
    readonly code:
      | 'STAGING_INPUT_INVALID'
      | 'STAGING_NOT_RECONCILED'
      | 'STAGING_OUTPUT_INVALID'
      | 'STAGING_PUBLICATION_UNCERTAIN'
      | 'STAGING_STATUS_CONFLICT'
      | 'STAGING_STORAGE_UNSAFE',
    message: string,
  ) {
    super(message)
    this.name = 'SmartPatchGenerationStagingError'
  }
}

/** Durable private world outputs, independent of prunable queue bundles and Raster candidates. */
export class SmartPatchGenerationStagingRepository {
  private readonly hooks: SmartPatchGenerationStagingTestHooks
  private pending: Promise<void> = Promise.resolve()
  private reconciled = false
  private readonly root: string

  constructor(
    private readonly db: Kysely<DB>,
    private readonly dataRoot: string,
    hooks: SmartPatchGenerationStagingTestHooks = {},
  ) {
    if (!path.isAbsolute(dataRoot) || path.resolve(dataRoot) !== dataRoot) {
      throw unsafe('Smart Patch recovery requires an absolute canonical application root.')
    }
    this.root = path.join(dataRoot, 'recovery', 'smart-patch-staging')
    this.hooks = { ...hooks }
  }

  assertReadyForPublication(): void {
    if (!this.reconciled) {
      throw new SmartPatchGenerationStagingError(
        'STAGING_NOT_RECONCILED',
        'Smart Patch recovery must finish before publication.',
      )
    }
  }

  async discardProject(
    projectKey: string,
  ): Promise<{ cleanupDeferred: boolean; discardedSessionCount: number }> {
    validateProject(projectKey)
    return await this.serialize(async () => {
      this.assertReadyForPublication()
      await this.storageRoot()
      const projectPath = path.join(this.root, projectKey)
      const sessions = new Set<string>()
      if (await exists(projectPath)) {
        await ownedDirectory(projectPath)
        for (const name of await readdir(projectPath)) {
          if (UUID.test(name)) {
            sessions.add(name)
          }
        }
      }
      const rows = await this.db
        .selectFrom('generation_candidate_receipt')
        .select('staging_session_id')
        .where('local_project_key', '=', projectKey)
        .execute()
      const queued = await this.db
        .selectFrom('generation_queue_item')
        .select('staging_session_id')
        .where('local_project_key', '=', projectKey)
        .execute()
      for (const row of [...rows, ...queued]) {
        validateId(row.staging_session_id)
        sessions.add(row.staging_session_id)
      }
      await this.tombstone(projectKey, [...sessions])
      return {
        cleanupDeferred: !(await this.cleanupDiscarded(projectKey)),
        discardedSessionCount: sessions.size,
      }
    })
  }

  async discardSessions(
    projectKey: string,
    sessionIds: readonly string[],
  ): Promise<{ cleanupDeferred: boolean; discardedSessionCount: number }> {
    validateProject(projectKey)
    const sessions = [...new Set(sessionIds)]
    for (const id of sessions) {
      validateId(id)
    }
    return await this.serialize(async () => {
      this.assertReadyForPublication()
      await this.storageRoot()
      await this.tombstone(projectKey, sessions)
      return {
        cleanupDeferred: !(await this.cleanupDiscarded(projectKey)),
        discardedSessionCount: sessions.length,
      }
    })
  }

  async hasPublicationReceipt(id: string): Promise<boolean> {
    validateId(id)
    return await this.serialize(async () => {
      this.assertReadyForPublication()
      return (await this.receipt(id)) !== undefined
    })
  }

  async listVerifiedCandidates(projectKey: string): Promise<VerifiedSmartPatchWorldCandidate[]> {
    validateProject(projectKey)
    return await this.serialize(async () => {
      this.assertReadyForPublication()
      await this.storageRoot()
      const scanned = await this.scan(projectKey)
      const visible: VerifiedSmartPatchWorldCandidate[] = []
      for (const qualified of scanned.candidates) {
        const { entry } = qualified
        if (await this.discarded(entry.localProjectKey, entry.stagingSessionId)) {
          continue
        }
        const receipt = await this.receipt(entry.candidateId)
        const row = await this.queueRow(entry.queueItemId)
        if (
          !receipt ||
          receipt.status !== 'completed' ||
          !receiptMatches(receipt, entry) ||
          (row && (row.status !== 'completed' || !rowMatches(row, entry)))
        ) {
          continue
        }
        visible.push(qualified.candidate)
      }
      return visible.sort((left, right) => left.completionOrder - right.completionOrder)
    })
  }

  async publishGenerationCandidate(
    input: SmartPatchGenerationCandidatePublicationInput,
  ): Promise<VerifiedSmartPatchWorldCandidate> {
    // Snapshot every caller value before filesystem/queue validation can yield.
    const captured = structuredClone(input)
    validateId(captured.queueItemId)
    if (!isUInt(captured.actualSeed, 0xff_ff_ff_ff) || !isUInt(captured.expectedStatusSequence)) {
      throw invalid('Smart Patch completion identities are invalid.')
    }
    return await this.serialize(async () => {
      this.assertReadyForPublication()
      await this.storageRoot()
      const queue = new GenerationQueueRepository(this.db, this.dataRoot)
      const verified = await queue.loadVerifiedSmartPatchInput(captured.queueItemId)
      const row = await this.db
        .selectFrom('generation_queue_item')
        .selectAll()
        .where('id', '=', captured.queueItemId)
        .executeTakeFirstOrThrow()
      if (
        row.status !== 'running' ||
        row.error_code !== null ||
        row.status_sequence !== captured.expectedStatusSequence ||
        verified.item.status !== 'running' ||
        verified.item.statusSequence !== captured.expectedStatusSequence ||
        !isDeepStrictEqual(parsePayload(row.frozen_payload_json), verified.payload)
      ) {
        throw conflict('The Smart Patch job changed or was canceled before publication.')
      }
      if (captured.actualSeed !== verified.payload.item.item.seed) {
        throw invalid('The confirmed Smart Patch seed differs from its exact frozen execution.')
      }
      const maskMetadata = verified.payload.files[MASK]
      const maskBytes = Buffer.from(verified.bundle.files[MASK])
      const output = captured.output
      const outputPath = captured.provisionalOutputPath
      if (
        !output ||
        output.path !== outputPath ||
        path.basename(outputPath) !== IMAGE ||
        path.dirname(outputPath) !== captured.expectedProvisionalRoot ||
        output.width !== verified.payload.context.bbox.width ||
        output.height !== verified.payload.context.bbox.height ||
        output.colorSpace !== 'srgb' ||
        output.iccSha256 !== IGS_SRGB_ICC_SHA256
      ) {
        throw invalid('The Smart Patch output differs from its private world nomination.')
      }
      const scratch = path.join(this.dataRoot, 'scratch')
      const scratchEntry = await lstat(scratch)
      if (
        !scratchEntry.isDirectory() ||
        scratchEntry.isSymbolicLink() ||
        scratchEntry.uid !== process.getuid!() ||
        (await realpath(scratch)) !== scratch ||
        path.dirname(captured.expectedProvisionalRoot) !== scratch ||
        !/^smart-patch-request-[A-Za-z0-9]+$/.test(path.basename(captured.expectedProvisionalRoot))
      ) {
        throw unsafe('The Smart Patch result is outside its dispatch-owned scratch operation.')
      }
      await ownedDirectory(captured.expectedProvisionalRoot)
      const actualOutput = await boundedRead(outputPath, IGS_GENERATION_PNG_MAX_BYTES)
      const outputBytes = await readSmartPatchWorldOutput(outputPath, output, {
        bytes: maskBytes,
        height: maskMetadata.height,
        width: maskMetadata.width,
      })
      if (!outputBytes.equals(actualOutput.bytes)) {
        throw invalidOutput('The world contribution changed between verification reads.')
      }
      await assertWitness({ path: outputPath, witness: actualOutput.witness })
      const frozenPayloadJson = row.frozen_payload_json
      const base: Omit<Manifest, 'completedAt' | 'completionOrder'> = {
        actualSeed: captured.actualSeed,
        candidateId: row.id,
        documentId: row.document_id,
        documentRevision: row.document_revision,
        expectedStatusSequence: captured.expectedStatusSequence,
        finalContributionMask: { ...maskMetadata, relativePath: MASK },
        frozenPayloadJson,
        frozenPayloadSha256: digest(Buffer.from(frozenPayloadJson)),
        image: {
          byteSize: outputBytes.length,
          height: output.height,
          iccSha256: IGS_SRGB_ICC_SHA256,
          relativePath: IMAGE,
          sha256: digest(outputBytes),
          width: output.width,
        },
        kind: 'smart-patch-world-candidate' as const,
        localProjectKey: row.local_project_key,
        projectPath: row.canonical_project_path,
        queueItemId: row.id,
        schemaVersion: 1 as const,
        stagingSessionId: row.staging_session_id,
      }
      const sessionPath = path.join(this.root, base.localProjectKey, base.stagingSessionId)
      await this.preflightCapacity(sessionPath, base.queueItemId, {
        ...base,
        completedAt: new Date().toISOString(),
        completionOrder: Number.MAX_SAFE_INTEGER,
      })
      const reservation = await this.reserveReceipt(base)
      const entry: Manifest = {
        ...base,
        completedAt: reservation.reserved_at,
        completionOrder: reservation.completion_order!,
      }
      try {
        await this.hooks.afterReceiptReservation?.()
        parseManifest(entry)
        const candidatePath = path.join(sessionPath, entry.candidateId)
        await this.publishFiles(candidatePath, entry, outputBytes, maskBytes)
        await this.hooks.afterManifestPublish?.()
        const qualified = await this.readCandidate(candidatePath)
        if (!isDeepStrictEqual(qualified.entry, entry)) {
          throw invalidOutput('The committed Smart Patch output changed before completion.')
        }
        await this.commitCompletion(entry, 'live')
        await this.hooks.afterCompletionCommit?.()
        return qualified.candidate
      } catch (error) {
        // A lost acknowledgement is success only when the complete exact durable owner agrees.
        try {
          const candidatePath = path.join(sessionPath, base.candidateId)
          const qualified = await this.readCandidate(candidatePath)
          const receipt = await this.receipt(base.candidateId)
          const current = await this.queueRow(base.queueItemId)
          if (
            isDeepStrictEqual(qualified.entry, entry) &&
            receipt?.status === 'completed' &&
            receiptMatches(receipt, qualified.entry) &&
            current?.status === 'completed' &&
            current.status_sequence === entry.expectedStatusSequence + 1 &&
            rowMatches(current, qualified.entry)
          ) {
            return qualified.candidate
          }
        } catch {
          // Unprovable output ownership remains reserved for explicit recovery, never failed.
        }
        if (
          error instanceof SmartPatchGenerationStagingError &&
          error.code === 'STAGING_STATUS_CONFLICT'
        ) {
          throw error
        }
        throw new SmartPatchGenerationStagingError(
          'STAGING_PUBLICATION_UNCERTAIN',
          'Smart Patch publication has a receipt and needs recovery before dispatch can continue.',
        )
      }
    })
  }

  /** Copy the exact world contribution and its final mask, serialized with publication/discard. */
  async readVerifiedCandidate(
    input: SmartPatchCandidateReadIdentity,
  ): Promise<VerifiedSmartPatchCandidateRead | null> {
    // Snapshot before serialize's first await; a later caller mutation cannot retarget this read.
    const captured = {
      candidateId: input.candidateId,
      documentId: input.documentId,
      frozenPayloadSha256: input.frozenPayloadSha256,
      imageSha256: input.imageSha256,
      localProjectKey: input.localProjectKey,
      stagingSessionId: input.stagingSessionId,
    }
    validateProject(captured.localProjectKey)
    for (const id of [captured.candidateId, captured.documentId, captured.stagingSessionId]) {
      validateId(id)
    }
    if (!SHA.test(captured.imageSha256) || !SHA.test(captured.frozenPayloadSha256)) {
      throw invalid('The nominated Smart Patch candidate hashes are invalid.')
    }
    return await this.serialize(async () => {
      this.assertReadyForPublication()
      await this.storageRoot()
      if (await this.discarded(captured.localProjectKey, captured.stagingSessionId)) {
        return null
      }
      let directory = this.root
      for (const component of [
        captured.localProjectKey,
        captured.stagingSessionId,
        captured.candidateId,
      ]) {
        directory = path.join(directory, component)
        if (!(await exists(directory))) {
          return null
        }
        await ownedDirectory(directory)
      }
      let qualified: QualifiedCandidateBytes
      try {
        qualified = await this.readCandidate(directory, true)
      } catch (error) {
        if (
          error instanceof SmartPatchGenerationStagingError &&
          error.code === 'STAGING_STORAGE_UNSAFE'
        ) {
          throw error
        }
        return null
      }
      const { candidate, entry } = qualified
      if (
        candidate.candidateId !== captured.candidateId ||
        candidate.documentId !== captured.documentId ||
        candidate.frozenPayloadSha256 !== captured.frozenPayloadSha256 ||
        candidate.image.sha256 !== captured.imageSha256 ||
        candidate.localProjectKey !== captured.localProjectKey ||
        candidate.stagingSessionId !== captured.stagingSessionId
      ) {
        return null
      }
      const row = await this.queueRow(candidate.queueItemId)
      const receipt = await this.receipt(candidate.candidateId)
      if (
        !receipt ||
        receipt.status !== 'completed' ||
        !receiptMatches(receipt, entry) ||
        (row && (row.status !== 'completed' || !rowMatches(row, entry))) ||
        (await this.discarded(captured.localProjectKey, captured.stagingSessionId))
      ) {
        return null
      }
      for (const file of qualified.files) {
        await assertWitness(file)
      }
      if (!sameIdentity(qualified.directory, await ownedDirectory(directory))) {
        throw unsafe('The nominated Smart Patch candidate directory changed.')
      }
      await exactNames(directory, [MANIFEST, IMAGE, MASK])
      return {
        candidate,
        finalMaskPngBytes: Buffer.from(qualified.finalMaskPngBytes),
        imagePngBytes: Buffer.from(qualified.imagePngBytes),
      }
    })
  }

  async recoverAfterRestart(): Promise<{ invalidCount: number; reconciledCount: number }> {
    return await this.serialize(async () => {
      this.reconciled = false
      await this.storageRoot()
      const scanned = await this.scan()
      let invalidCount = scanned.invalidCount
      let reconciledCount = 0
      for (const { entry } of scanned.candidates) {
        const receipt = await this.receipt(entry.candidateId)
        if (!receipt || !receiptMatches(receipt, entry)) {
          invalidCount += 1
          continue
        }
        const row = await this.queueRow(entry.queueItemId)
        if (receipt.status === 'reserved') {
          if (
            !row ||
            row.status !== 'canceled' ||
            row.error_code !== 'APP_RESTART' ||
            row.status_sequence !== entry.expectedStatusSequence + 1 ||
            !rowMatches(row, entry)
          ) {
            invalidCount += 1
            continue
          }
          await this.commitCompletion(entry, 'restart')
          reconciledCount += 1
        } else if (
          receipt.status !== 'completed' ||
          (row && (row.status !== 'completed' || !rowMatches(row, entry)))
        ) {
          invalidCount += 1
        }
      }
      await this.cleanupDiscarded()
      this.reconciled = true
      return { invalidCount, reconciledCount }
    })
  }

  private async cleanupDiscarded(projectKey?: string): Promise<boolean> {
    let query = this.db.selectFrom('generation_staging_discarded_session').selectAll()
    if (projectKey) {
      query = query.where('local_project_key', '=', projectKey)
    }
    const discarded = await query.execute()
    let clean = true
    for (const session of discarded) {
      validateProject(session.local_project_key)
      validateId(session.staging_session_id)
      const projectPath = path.join(this.root, session.local_project_key)
      const sessionPath = path.join(projectPath, session.staging_session_id)
      if (!(await exists(sessionPath))) {
        continue
      }
      try {
        await ownedDirectory(projectPath)
        const directory = await ownedDirectory(sessionPath)
        await this.hooks.beforeSessionCleanup?.()
        for (const id of await readdir(sessionPath)) {
          if (!sameIdentity(directory, await ownedDirectory(sessionPath))) {
            throw unsafe('The discarded Smart Patch session changed.')
          }
          if (!UUID.test(id)) {
            throw unsafe('An unknown Smart Patch reservation was retained.')
          }
          const candidatePath = path.join(sessionPath, id)
          const qualified = await this.readCandidate(candidatePath)
          for (const file of qualified.files) {
            await assertWitness(file)
          }
          if (!sameIdentity(qualified.directory, await ownedDirectory(candidatePath))) {
            throw unsafe('The discarded candidate changed.')
          }
          await exactNames(candidatePath, [MANIFEST, IMAGE, MASK])
          for (const file of qualified.files) {
            if (
              !sameIdentity(directory, await ownedDirectory(sessionPath)) ||
              !sameIdentity(qualified.directory, await ownedDirectory(candidatePath))
            ) {
              throw unsafe('The discarded Smart Patch ownership changed.')
            }
            await assertWitness(file)
            await unlink(file.path)
          }
          if (!sameIdentity(qualified.directory, await ownedDirectory(candidatePath))) {
            throw unsafe('The discarded candidate directory changed.')
          }
          await rmdir(candidatePath)
        }
        if (!sameIdentity(directory, await ownedDirectory(sessionPath))) {
          throw unsafe('The discarded Smart Patch session changed.')
        }
        await rmdir(sessionPath)
        await syncDirectory(projectPath)
      } catch {
        // The tombstone already hides every member, including corrupt/incomplete reservations.
        clean = false
      }
    }
    return clean
  }

  private async commitCompletion(entry: Manifest, source: 'live' | 'restart'): Promise<void> {
    await this.db.transaction().execute(async (transaction) => {
      if (
        await transaction
          .selectFrom('generation_staging_discarded_session')
          .select('staging_session_id')
          .where('local_project_key', '=', entry.localProjectKey)
          .where('staging_session_id', '=', entry.stagingSessionId)
          .executeTakeFirst()
      ) {
        throw conflict('The Smart Patch session was discarded before completion.')
      }
      const receipt = await transaction
        .selectFrom('generation_candidate_receipt')
        .selectAll()
        .where('candidate_id', '=', entry.candidateId)
        .executeTakeFirst()
      const row = await transaction
        .selectFrom('generation_queue_item')
        .selectAll()
        .where('id', '=', entry.queueItemId)
        .executeTakeFirst()
      const sequence = entry.expectedStatusSequence + (source === 'restart' ? 1 : 0)
      if (
        !receipt ||
        receipt.status !== 'reserved' ||
        !receiptMatches(receipt, entry) ||
        !row ||
        !rowMatches(row, entry) ||
        row.status_sequence !== sequence ||
        (source === 'live'
          ? row.status !== 'running' || row.error_code !== null
          : row.status !== 'canceled' || row.error_code !== 'APP_RESTART')
      ) {
        throw conflict(
          'The Smart Patch completion no longer matches its reservation and running owner.',
        )
      }
      const now = new Date().toISOString()
      const updated = await transaction
        .updateTable('generation_queue_item')
        .set({
          error_code: null,
          error_message: null,
          finished_at: entry.completedAt,
          status: 'completed',
          status_sequence: sql<number>`status_sequence + 1`,
          updated_at: now,
        })
        .where('id', '=', row.id)
        .where('status', '=', row.status)
        .where('status_sequence', '=', sequence)
        .executeTakeFirst()
      if (Number(updated.numUpdatedRows) !== 1) {
        throw conflict('The Smart Patch queue changed during completion.')
      }
      const completed = await transaction
        .updateTable('generation_candidate_receipt')
        .set({ completed_at: entry.completedAt, status: 'completed' })
        .where('candidate_id', '=', entry.candidateId)
        .where('status', '=', 'reserved')
        .executeTakeFirst()
      if (Number(completed.numUpdatedRows) !== 1) {
        throw conflict('The Smart Patch receipt changed during completion.')
      }
      await sql`
        INSERT INTO generation_seed_cursor (local_project_key, document_id, completion_order, candidate_id, actual_seed, updated_at)
        VALUES (${entry.localProjectKey}, ${entry.documentId}, ${entry.completionOrder}, ${entry.candidateId}, ${entry.actualSeed}, ${now})
        ON CONFLICT(local_project_key) DO UPDATE SET document_id=excluded.document_id,
          completion_order=excluded.completion_order, candidate_id=excluded.candidate_id,
          actual_seed=excluded.actual_seed, updated_at=excluded.updated_at
        WHERE excluded.completion_order > generation_seed_cursor.completion_order
      `.execute(transaction)
      await this.hooks.beforeCompletionCommit?.()
    })
  }

  private async discarded(project: string, session: string): Promise<boolean> {
    return (
      (await this.db
        .selectFrom('generation_staging_discarded_session')
        .select('staging_session_id')
        .where('local_project_key', '=', project)
        .where('staging_session_id', '=', session)
        .executeTakeFirst()) !== undefined
    )
  }

  private async ensureSession(project: string, session: string): Promise<void> {
    for (const directory of [
      path.join(this.root, project),
      path.join(this.root, project, session),
    ]) {
      await mkdir(directory, { mode: 0o700 }).catch((error: unknown) => {
        if (!hasCode(error, 'EEXIST')) {
          throw error
        }
      })
      await ownedDirectory(directory)
      await syncDirectory(path.dirname(directory))
    }
  }

  private async preflightCapacity(
    sessionPath: string,
    id: string,
    planned: Manifest,
  ): Promise<void> {
    let count = 0
    let bytes = Buffer.byteLength(JSON.stringify(planned))
    if (await exists(sessionPath)) {
      await ownedDirectory(path.dirname(sessionPath))
      await ownedDirectory(sessionPath)
      for (const candidate of await readdir(sessionPath)) {
        if (!UUID.test(candidate)) {
          throw unsafe('The Smart Patch session contains an unknown reservation.')
        }
        const stored = await this.readCandidate(path.join(sessionPath, candidate))
        if (candidate !== id) {
          count += 1
          bytes += Buffer.byteLength(JSON.stringify(stored.entry))
        }
      }
    }
    if (
      count + 1 > GENERATION_STAGING_LIMITS.candidates ||
      bytes > GENERATION_STAGING_LIMITS.manifestBytes
    ) {
      throw invalid('The Smart Patch recovery session exceeds its candidate or metadata ceiling.')
    }
  }

  private async publishFiles(
    candidatePath: string,
    entry: Manifest,
    image: Buffer,
    mask: Buffer,
  ): Promise<void> {
    await this.ensureSession(entry.localProjectKey, entry.stagingSessionId)
    try {
      await mkdir(candidatePath, { mode: 0o700 })
    } catch (error) {
      if (!hasCode(error, 'EEXIST')) {
        throw error
      }
      const existing = await this.readCandidate(candidatePath)
      if (!isDeepStrictEqual(existing.entry, entry)) {
        throw invalidOutput('An existing Smart Patch candidate has different ownership.')
      }
      return
    }
    await ownedDirectory(candidatePath)
    await this.writeDurable(path.join(candidatePath, MASK), mask)
    await this.hooks.afterMaskPublish?.()
    await this.writeDurable(path.join(candidatePath, IMAGE), image)
    const temporary = path.join(candidatePath, `.manifest-${randomUUID()}.tmp`)
    await this.writeDurable(temporary, Buffer.from(JSON.stringify(entry)))
    await syncDirectory(candidatePath)
    await link(temporary, path.join(candidatePath, MANIFEST))
    await unlink(temporary)
    await syncDirectory(candidatePath)
    await syncDirectory(path.dirname(candidatePath))
  }

  private async queueRow(id: string) {
    return await this.db
      .selectFrom('generation_queue_item')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst()
  }

  private async readCandidate(
    candidatePath: string,
    includeBytes: true,
  ): Promise<QualifiedCandidateBytes>
  private async readCandidate(candidatePath: string): Promise<QualifiedCandidate>
  private async readCandidate(
    candidatePath: string,
    includeBytes = false,
  ): Promise<QualifiedCandidate | QualifiedCandidateBytes> {
    const directory = await ownedDirectory(candidatePath)
    await exactNames(candidatePath, [MANIFEST, IMAGE, MASK])
    const manifest = await boundedRead(
      path.join(candidatePath, MANIFEST),
      GENERATION_STAGING_LIMITS.manifestBytes,
    )
    let decoded: unknown
    try {
      decoded = JSON.parse(manifest.bytes.toString('utf8'))
    } catch {
      throw invalid('The Smart Patch candidate manifest is invalid JSON.')
    }
    const entry = parseManifest(decoded)
    if (
      path.basename(candidatePath) !== entry.candidateId ||
      path.basename(path.dirname(candidatePath)) !== entry.stagingSessionId ||
      path.basename(path.dirname(path.dirname(candidatePath))) !== entry.localProjectKey
    ) {
      throw unsafe('The Smart Patch candidate path and manifest disagree.')
    }
    const maskPath = path.join(candidatePath, MASK)
    const imagePath = path.join(candidatePath, IMAGE)
    const mask = await boundedRead(maskPath, entry.finalContributionMask.byteSize, true)
    const image = await boundedRead(imagePath, entry.image.byteSize, true)
    const maskBytes = await readSmartPatchPreparationOutput(
      maskPath,
      {
        byteSize: entry.finalContributionMask.byteSize,
        height: entry.finalContributionMask.height,
        path: maskPath,
        sha256: entry.finalContributionMask.sha256,
        width: entry.finalContributionMask.width,
      },
      'mask',
    )
    const imageBytes = await readSmartPatchWorldOutput(
      imagePath,
      {
        ...entry.image,
        colorSpace: 'srgb',
        path: imagePath,
      },
      {
        bytes: maskBytes,
        height: entry.finalContributionMask.height,
        width: entry.finalContributionMask.width,
      },
    )
    if (!mask.bytes.equals(maskBytes) || !image.bytes.equals(imageBytes)) {
      throw invalidOutput('The Smart Patch candidate changed during its actual-pixel verification.')
    }
    const files = [
      { path: path.join(candidatePath, MANIFEST), witness: manifest.witness },
      { path: imagePath, witness: image.witness },
      { path: maskPath, witness: mask.witness },
    ]
    for (const file of files) {
      await assertWitness(file)
    }
    if (!sameIdentity(directory, await ownedDirectory(candidatePath))) {
      throw unsafe('The Smart Patch candidate directory changed.')
    }
    await exactNames(candidatePath, [MANIFEST, IMAGE, MASK])
    const payload = parsePayload(entry.frozenPayloadJson)
    return {
      candidate: {
        actualSeed: entry.actualSeed,
        assetPath: imagePath,
        bbox: { ...payload.context.bbox },
        candidateId: entry.candidateId,
        completedAt: entry.completedAt,
        completionOrder: entry.completionOrder,
        documentId: entry.documentId,
        documentRevision: entry.documentRevision,
        finalContributionMask: {
          byteSize: entry.finalContributionMask.byteSize,
          height: entry.finalContributionMask.height,
          path: maskPath,
          sha256: entry.finalContributionMask.sha256,
          width: entry.finalContributionMask.width,
        },
        frozenPayloadSha256: entry.frozenPayloadSha256,
        frozenSmartPatchPayloadJson: entry.frozenPayloadJson,
        image: {
          byteSize: entry.image.byteSize,
          height: entry.image.height,
          iccSha256: entry.image.iccSha256,
          sha256: entry.image.sha256,
          width: entry.image.width,
        },
        kind: entry.kind,
        localProjectKey: entry.localProjectKey,
        payload,
        projectPath: entry.projectPath,
        queueItemId: entry.queueItemId,
        stagingSessionId: entry.stagingSessionId,
      },
      directory,
      entry,
      files,
      ...(includeBytes ? { finalMaskPngBytes: maskBytes, imagePngBytes: imageBytes } : {}),
    }
  }

  private async receipt(id: string) {
    return await this.db
      .selectFrom('generation_candidate_receipt')
      .selectAll()
      .where('candidate_id', '=', id)
      .executeTakeFirst()
  }

  private async reserveReceipt(
    entry: Omit<Manifest, 'completedAt' | 'completionOrder'>,
  ): Promise<Selectable<GenerationCandidateReceipt>> {
    return await this.db.transaction().execute(async (transaction) => {
      if (
        await transaction
          .selectFrom('generation_staging_discarded_session')
          .select('staging_session_id')
          .where('local_project_key', '=', entry.localProjectKey)
          .where('staging_session_id', '=', entry.stagingSessionId)
          .executeTakeFirst()
      ) {
        throw conflict('The Smart Patch session was discarded.')
      }
      const row = await transaction
        .selectFrom('generation_queue_item')
        .selectAll()
        .where('id', '=', entry.queueItemId)
        .executeTakeFirst()
      if (
        !row ||
        row.status !== 'running' ||
        row.error_code !== null ||
        row.status_sequence !== entry.expectedStatusSequence ||
        !rowMatches(row, entry)
      ) {
        throw conflict('The Smart Patch job is no longer the exact running input.')
      }
      const existing = await transaction
        .selectFrom('generation_candidate_receipt')
        .selectAll()
        .where('candidate_id', '=', entry.candidateId)
        .executeTakeFirst()
      if (existing) {
        if (
          existing.status !== 'reserved' ||
          !receiptMatches(existing, {
            ...entry,
            completedAt: existing.reserved_at,
            completionOrder: existing.completion_order!,
          })
        ) {
          throw conflict('The Smart Patch completion has a different reservation.')
        }
        return existing
      }
      const receipt = await transaction
        .insertInto('generation_candidate_receipt')
        .values({
          actual_seed: entry.actualSeed,
          candidate_id: entry.candidateId,
          canonical_project_path: entry.projectPath,
          completed_at: null,
          expected_status_sequence: entry.expectedStatusSequence,
          frozen_payload_sha256: entry.frozenPayloadSha256,
          image_byte_size: entry.image.byteSize,
          image_sha256: entry.image.sha256,
          local_project_key: entry.localProjectKey,
          queue_item_id: entry.queueItemId,
          reserved_at: new Date().toISOString(),
          staging_session_id: entry.stagingSessionId,
          status: 'reserved',
        })
        .returningAll()
        .executeTakeFirstOrThrow()
      if (!isUInt(receipt.completion_order) || receipt.completion_order < 1) {
        throw unsafe('The Smart Patch receipt order is invalid.')
      }
      return receipt
    })
  }

  private async scan(
    onlyProject?: string,
  ): Promise<{ candidates: QualifiedCandidate[]; invalidCount: number }> {
    const candidates: QualifiedCandidate[] = []
    let invalidCount = 0
    for (const project of onlyProject ? [onlyProject] : await readdir(this.root)) {
      if (!PROJECT.test(project)) {
        continue
      }
      const projectPath = path.join(this.root, project)
      if (!(await exists(projectPath))) {
        continue
      }
      await ownedDirectory(projectPath)
      for (const session of await readdir(projectPath)) {
        if (!UUID.test(session) || (await this.discarded(project, session))) {
          continue
        }
        const sessionPath = path.join(projectPath, session)
        await ownedDirectory(sessionPath)
        for (const id of await readdir(sessionPath)) {
          if (!UUID.test(id)) {
            continue
          }
          const candidatePath = path.join(sessionPath, id)
          // Unsafe path components are storage errors, not permission to follow or ignore them.
          await ownedDirectory(candidatePath)
          try {
            candidates.push(await this.readCandidate(candidatePath))
          } catch (error) {
            if (
              error instanceof SmartPatchGenerationStagingError &&
              error.code === 'STAGING_STORAGE_UNSAFE'
            ) {
              throw error
            }
            invalidCount += 1
          }
        }
      }
    }
    return { candidates, invalidCount }
  }

  private async serialize<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.pending
    let release!: () => void
    this.pending = new Promise<void>((resolve) => {
      release = resolve
    })
    await previous
    try {
      return await operation()
    } finally {
      release()
    }
  }

  private async storageRoot(): Promise<void> {
    const root = await lstat(this.dataRoot)
    if (
      !root.isDirectory() ||
      root.isSymbolicLink() ||
      root.uid !== process.getuid!() ||
      (await realpath(this.dataRoot)) !== this.dataRoot
    ) {
      throw unsafe('The application root changed.')
    }
    for (const directory of [path.dirname(this.root), this.root]) {
      let created = false
      try {
        await mkdir(directory, { mode: 0o700 })
        created = true
      } catch (error) {
        if (!hasCode(error, 'EEXIST')) {
          throw error
        }
      }
      await ownedDirectory(directory)
      if (created) {
        await syncDirectory(path.dirname(directory))
      }
    }
  }

  private async tombstone(projectKey: string, sessions: readonly string[]): Promise<void> {
    if (sessions.length === 0) {
      return
    }
    await this.db.transaction().execute(async (transaction) => {
      for (const session of sessions) {
        await transaction
          .insertInto('generation_staging_discarded_session')
          .values({
            discarded_at: new Date().toISOString(),
            local_project_key: projectKey,
            staging_session_id: session,
          })
          .onConflict((conflict) =>
            conflict.columns(['local_project_key', 'staging_session_id']).doNothing(),
          )
          .execute()
      }
    })
    await this.hooks.afterDiscardTombstone?.()
  }

  private async writeDurable(filePath: string, bytes: Buffer): Promise<void> {
    const handle = await open(
      filePath,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
      0o600,
    )
    try {
      await handle.writeFile(bytes)
      await this.hooks.beforeFileSync?.(filePath)
      await handle.sync()
    } finally {
      await handle.close()
    }
    await ownedFile(filePath)
  }
}

function parseManifest(input: unknown): Manifest {
  const parsed = v.safeParse(manifestSchema, input)
  if (!parsed.success) {
    throw invalid('The Smart Patch world candidate manifest is invalid.')
  }
  const entry = parsed.output
  const payload = parsePayload(entry.frozenPayloadJson)
  const finalMask = { ...entry.finalContributionMask }
  const { relativePath: _relativePath, ...maskMetadata } = finalMask
  if (
    entry.candidateId !== entry.queueItemId ||
    !path.isAbsolute(entry.projectPath) ||
    path.resolve(entry.projectPath) !== entry.projectPath ||
    localProjectRecoveryKey(entry.projectPath) !== entry.localProjectKey ||
    payload.context.projectKey !== entry.localProjectKey ||
    payload.context.documentId !== entry.documentId ||
    payload.context.documentRevision !== entry.documentRevision ||
    entry.actualSeed !== payload.item.item.seed ||
    digest(Buffer.from(entry.frozenPayloadJson)) !== entry.frozenPayloadSha256 ||
    entry.image.width !== payload.context.bbox.width ||
    entry.image.height !== payload.context.bbox.height ||
    !isDeepStrictEqual(maskMetadata, payload.files[MASK])
  ) {
    throw invalid('The Smart Patch candidate and frozen target disagree.')
  }
  return entry
}

function parsePayload(json: string): FrozenQueuedSmartPatchV1 {
  if (
    typeof json !== 'string' ||
    Buffer.byteLength(json) > GENERATION_STAGING_LIMITS.frozenPayloadBytes
  ) {
    throw invalid('The Smart Patch frozen payload is too large.')
  }
  try {
    return parseFrozenQueuedSmartPatchV1(JSON.parse(json))
  } catch {
    throw invalid('The frozen Smart Patch candidate payload is invalid.')
  }
}

function rowMatches(
  row: Selectable<GenerationQueueItem>,
  entry: Omit<Manifest, 'completedAt' | 'completionOrder'>,
): boolean {
  return (
    row.id === entry.queueItemId &&
    row.operation === parsePayload(entry.frozenPayloadJson).kind &&
    row.local_project_key === entry.localProjectKey &&
    row.canonical_project_path === entry.projectPath &&
    row.staging_session_id === entry.stagingSessionId &&
    row.document_id === entry.documentId &&
    row.document_revision === entry.documentRevision &&
    digest(Buffer.from(row.frozen_payload_json)) === entry.frozenPayloadSha256
  )
}

function receiptMatches(receipt: Selectable<GenerationCandidateReceipt>, entry: Manifest): boolean {
  return (
    receipt.candidate_id === entry.candidateId &&
    receipt.queue_item_id === entry.queueItemId &&
    receipt.completion_order === entry.completionOrder &&
    receipt.expected_status_sequence === entry.expectedStatusSequence &&
    receipt.local_project_key === entry.localProjectKey &&
    receipt.canonical_project_path === entry.projectPath &&
    receipt.staging_session_id === entry.stagingSessionId &&
    receipt.frozen_payload_sha256 === entry.frozenPayloadSha256 &&
    receipt.image_sha256 === entry.image.sha256 &&
    receipt.image_byte_size === entry.image.byteSize &&
    receipt.actual_seed === entry.actualSeed &&
    receipt.reserved_at === entry.completedAt &&
    (receipt.status === 'reserved'
      ? receipt.completed_at === null
      : receipt.status === 'completed' && receipt.completed_at === entry.completedAt)
  )
}

async function ownedDirectory(directory: string): Promise<BigIntStats> {
  const entry = await lstat(directory, { bigint: true })
  if (
    !entry.isDirectory() ||
    entry.isSymbolicLink() ||
    entry.uid !== BigInt(process.getuid!()) ||
    (entry.mode & 0o7777n) !== 0o700n ||
    (await realpath(directory)) !== directory
  ) {
    throw unsafe('Smart Patch recovery directories must be canonical owned0700 directories.')
  }
  return entry
}

async function ownedFile(filePath: string): Promise<BigIntStats> {
  const entry = await lstat(filePath, { bigint: true })
  if (
    !entry.isFile() ||
    entry.isSymbolicLink() ||
    entry.uid !== BigInt(process.getuid!()) ||
    (entry.mode & 0o7777n) !== 0o600n ||
    entry.nlink !== 1n
  ) {
    throw unsafe('Smart Patch recovery members must be owned0600 regular single-link files.')
  }
  return entry
}

async function boundedRead(
  filePath: string,
  ceiling: number,
  exact = false,
): Promise<{ bytes: Buffer; witness: Witness }> {
  let handle
  try {
    handle = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  } catch (error) {
    if (hasCode(error, 'ENOENT')) {
      throw invalidOutput('The Smart Patch recovery member is missing.')
    }
    throw unsafe('The Smart Patch recovery member could not be opened safely.')
  }
  try {
    const before = await handle.stat({ bigint: true })
    const nominated = await ownedFile(filePath)
    if (
      !sameIdentity(before, nominated) ||
      before.size < 1n ||
      before.size > BigInt(ceiling) ||
      (exact && before.size !== BigInt(ceiling))
    ) {
      throw invalidOutput('The Smart Patch recovery member exceeds its bounded identity.')
    }
    const bytes = Buffer.alloc(Number(before.size) + 1)
    let offset = 0
    while (offset < bytes.length) {
      const read = await handle.read(bytes, offset, bytes.length - offset, null)
      if (read.bytesRead === 0) {
        break
      }
      offset += read.bytesRead
    }
    const after = await handle.stat({ bigint: true })
    const current = await ownedFile(filePath)
    if (
      offset !== Number(before.size) ||
      !sameVersion(before, after) ||
      !sameVersion(before, current)
    ) {
      throw invalidOutput('The Smart Patch recovery member changed during its bounded read.')
    }
    return { bytes: bytes.subarray(0, offset), witness: before }
  } finally {
    await handle.close()
  }
}

async function assertWitness(file: QualifiedFile): Promise<void> {
  if (!sameVersion(await ownedFile(file.path), file.witness)) {
    throw unsafe('A qualified Smart Patch recovery member changed before consumption.')
  }
}

async function exactNames(directory: string, expected: readonly string[]): Promise<void> {
  const names = await readdir(directory)
  if (names.length !== expected.length || names.some((name) => !expected.includes(name))) {
    throw invalidOutput('The Smart Patch candidate has unexpected or missing members.')
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

function sameIdentity(
  left: Pick<BigIntStats, 'dev' | 'ino'>,
  right: Pick<BigIntStats, 'dev' | 'ino'>,
): boolean {
  return left.dev === right.dev && left.ino === right.ino
}
function sameVersion(left: Witness, right: Witness): boolean {
  return (
    sameIdentity(left, right) &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  )
}
function isUInt(value: unknown, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= maximum
}
function validateId(value: string): void {
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw invalid('The Smart Patch recovery identity is invalid.')
  }
}
function validateProject(value: string): void {
  if (typeof value !== 'string' || !PROJECT.test(value)) {
    throw invalid('The Smart Patch recovery Project is invalid.')
  }
}
function digest(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}
function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code
}
async function exists(filePath: string): Promise<boolean> {
  try {
    await lstat(filePath)
    return true
  } catch (error) {
    if (hasCode(error, 'ENOENT')) {
      return false
    }
    throw error
  }
}
function invalid(message: string) {
  return new SmartPatchGenerationStagingError('STAGING_INPUT_INVALID', message)
}
function invalidOutput(message: string) {
  return new SmartPatchGenerationStagingError('STAGING_OUTPUT_INVALID', message)
}
function unsafe(message: string) {
  return new SmartPatchGenerationStagingError('STAGING_STORAGE_UNSAFE', message)
}
function conflict(message: string) {
  return new SmartPatchGenerationStagingError('STAGING_STATUS_CONFLICT', message)
}
