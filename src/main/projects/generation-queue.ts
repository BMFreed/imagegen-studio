import type { AnimaWorkerRequest } from '../../shared/projects/anima-worker-request.js'
import { IGS_SRGB_ICC_SHA256 } from '../../shared/projects/color-profile.js'
import { GENERATION_BATCH_JOB_LIMIT } from '../../shared/projects/generation-batch-policy.js'
import {
  GENERATION_QUEUE_PAGE_SIZE,
  isGenerationQueueCursor,
} from '../../shared/projects/generation-queue-manager.js'
import type {
  GenerationQueueCursor,
  GenerationQueueEntry,
  GenerationQueuePage,
} from '../../shared/projects/generation-queue-manager.js'
import {
  IGS_SAFETY_CEILINGS,
  RecordedGenerationLoraStackSchema,
} from '../../shared/projects/project-schema.js'

import type { Kysely, Selectable } from 'kysely'

import { sql } from 'kysely'
import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdir, mkdtemp, open, readdir, realpath, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import * as v from 'valibot'

import type { DB, GenerationQueueItem } from '../db/database.types.js'
import type { OutpaintInfillResolver } from '../runtime/inference-auxiliary-resources.js'
import type { PreparedAnimaGenerationBatch } from './anima-generation-batch.js'
import type {
  AnimaGenerationModelResolver,
  PreparedAnimaOutpaintGeneration,
} from './anima-generation-preparation.js'
import type {
  FrozenQueuedAnimaGenerationContextV1,
  FrozenQueuedAnimaGenerationV1,
  FrozenQueuedAnimaOutpaintContextV1,
  FrozenQueuedAnimaOutpaintV1,
} from './anima-queued-generation.js'
import type {
  IllustriousGenerationRequestV1,
  IllustriousImg2ImgRequestV1,
  IllustriousTxt2ImgRequestV1,
} from './illustrious-txt2img-job.js'
import type {
  FrozenNormalGenerationPreparationV1,
  FrozenNormalImg2ImgPreparationV1,
  FrozenNormalOutpaintPreparationV1,
  FrozenNormalTxt2ImgPreparationV1,
  PreparedNormalGeneration,
  PreparedNormalOutpaintGeneration,
  PreparedNormalTxt2Img,
} from './project-generation-preparation.js'

import { prepareAnimaGenerationBatch } from './anima-generation-batch.js'
import { assertFrozenAnimaOutpaintGeneration } from './anima-generation-preparation.js'
import {
  buildFrozenQueuedAnimaGenerationV1,
  buildFrozenQueuedAnimaOutpaintV1,
  FrozenQueuedAnimaGenerationSchema,
  FrozenQueuedAnimaOutpaintSchema,
  parseFrozenQueuedAnimaGenerationV1,
  parseFrozenQueuedAnimaOutpaintV1,
} from './anima-queued-generation.js'
import { GENERATION_STAGING_LIMITS } from './generation-staging-limits.js'
import { validateSrgbPngStream } from './igs-package.js'
import {
  frozenEmbeddingFieldsAgree,
  FrozenGenerationEmbeddingsSchema,
  IllustriousWorkerEmbeddingsSchema,
  PromptEmbeddingRefsSchema,
} from './illustrious-generation-embeddings.js'
import {
  reverifyFrozenGenerationEmbeddings,
  workerEmbeddings,
} from './illustrious-generation-embeddings.js'
import {
  frozenLoraFieldsAgree,
  type GenerationModelResolver,
  reverifyFrozenGenerationLoras,
  workerLoras,
} from './illustrious-generation-loras.js'
import {
  FrozenGenerationVaeSchema,
  frozenVaeFieldsAgree,
  IllustriousWorkerVaeSchema,
  reverifyFrozenGenerationVae,
  workerVae,
} from './illustrious-generation-vae.js'
import { resolveIllustriousScheduler } from './illustrious-scheduler.js'
import {
  assertFrozenAlphaOutpaintConditioning,
  FrozenAlphaOutpaintConditioningSchema,
} from './outpaint-conditioning.js'
import { canonicalProjectPath, localProjectRecoveryKey } from './project-identity.js'
import { classifyTargetPngAlpha } from './target-png-mode.js'

const MAX_TARGET_BYTES = 32 * 1024 * 1024
const MAX_PAYLOAD_BYTES = 128 * 1024
const MAX_MANIFEST_BYTES = 4096
const QUEUE_INPUT_VERSION = 1
const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
const PROJECT_KEY_PATTERN = /^project-v1-[a-f0-9]{64}$/
const SHA256_PATTERN = /^[a-f0-9]{64}$/
const UuidSchema = v.pipe(v.string(), v.uuid())
const Sha256Schema = v.pipe(v.string(), v.regex(SHA256_PATTERN))
const NonemptySchema = v.pipe(v.string(), v.nonEmpty())
const SafeUIntSchema = v.pipe(v.number(), v.safeInteger(), v.minValue(0))
const Uint32Schema = v.pipe(v.number(), v.safeInteger(), v.minValue(0), v.maxValue(0xff_ff_ff_ff))
const TargetBytesSchema = v.pipe(
  v.number(),
  v.safeInteger(),
  v.minValue(1),
  v.maxValue(MAX_TARGET_BYTES),
)
const PromptSchema = v.pipe(v.string(), v.maxBytes(16 * 1024))
const PositionSchema = v.pipe(
  v.number(),
  v.safeInteger(),
  v.minValue(-IGS_SAFETY_CEILINGS.coordinateMagnitude),
  v.maxValue(IGS_SAFETY_CEILINGS.coordinateMagnitude),
)
const TargetSideSchema = v.pipe(
  v.number(),
  v.safeInteger(),
  v.minValue(8),
  v.maxValue(2048),
  v.check((side) => side % 8 === 0),
)
const BboxSchema = v.pipe(
  v.strictObject({
    height: TargetSideSchema,
    width: TargetSideSchema,
    x: PositionSchema,
    y: PositionSchema,
  }),
  v.check((bbox) => bbox.width * bbox.height <= 4_000_000),
)
const PromptsSchema = v.strictObject({ negative: PromptSchema, positive: PromptSchema })
const PredictionTypeSchema = v.picklist(['epsilon', 'sample', 'v_prediction'])
const SchedulerKeySchema = v.picklist([
  'dpmpp_2m_k',
  'dpmpp_2m',
  'euler_a',
  'dpmpp_sde_k',
  'dpmpp_sde',
])
const ExactCheckpointSchema = v.strictObject({
  baseModelFamily: v.literal('illustrious'),
  civitaiFileId: v.nullable(SafeUIntSchema),
  civitaiModelId: v.nullable(SafeUIntSchema),
  civitaiVersionId: v.nullable(SafeUIntSchema),
  displayName: NonemptySchema,
  fileSha256: Sha256Schema,
  kind: v.literal('checkpoint'),
  localModelId: NonemptySchema,
  localVersionId: NonemptySchema,
  predictionType: PredictionTypeSchema,
  versionName: NonemptySchema,
})
const ExactLoraSchema = v.strictObject({
  ...ExactCheckpointSchema.entries,
  kind: v.literal('lora'),
  predictionType: v.nullable(PredictionTypeSchema),
})
const FrozenGenerationLorasSchema = v.pipe(
  v.array(
    v.strictObject({
      byteSize: v.pipe(v.number(), v.safeInteger(), v.minValue(1)),
      managedPath: NonemptySchema,
      reference: ExactLoraSchema,
      weight: v.pipe(v.number(), v.finite()),
    }),
  ),
  v.maxLength(IGS_SAFETY_CEILINGS.archiveEntries),
)
const WorkerLorasSchema = v.pipe(
  v.array(
    v.strictObject({
      byteSize: v.pipe(v.number(), v.safeInteger(), v.minValue(1)),
      path: NonemptySchema,
      sha256: Sha256Schema,
      weight: v.pipe(v.number(), v.finite()),
    }),
  ),
  v.maxLength(IGS_SAFETY_CEILINGS.archiveEntries),
)
const Txt2ImgFrozenContextSchema = v.strictObject({
  bbox: BboxSchema,
  documentId: UuidSchema,
  documentRevision: UuidSchema,
  embeddingRefs: v.optional(PromptEmbeddingRefsSchema),
  embeddings: v.optional(FrozenGenerationEmbeddingsSchema),
  kind: v.literal('normal-txt2img-preparation'),
  loras: v.optional(FrozenGenerationLorasSchema),
  loraStack: v.optional(RecordedGenerationLoraStackSchema),
  model: v.strictObject({ managedPath: NonemptySchema, reference: ExactCheckpointSchema }),
  prompts: PromptsSchema,
  sampling: v.strictObject({
    cfgRescale: v.optional(v.pipe(v.number(), v.finite(), v.minValue(0), v.maxValue(0.99))),
    cfgScale: v.pipe(v.number(), v.finite(), v.minValue(1), v.maxValue(30)),
    invokeScheduler: SchedulerKeySchema,
    requestedSeedPolicy: v.picklist(['fixed', 'random', 'reuse']),
    sampler: NonemptySchema,
    scheduler: NonemptySchema,
    seed: Uint32Schema,
    seedBehavior: v.optional(v.picklist(['per-iteration', 'per-prompt'])),
    steps: v.pipe(v.number(), v.safeInteger(), v.minValue(1), v.maxValue(200)),
  }),
  schemaVersion: v.literal(1),
  target: v.strictObject({
    byteSize: TargetBytesSchema,
    colorSpace: v.literal('srgb'),
    format: v.literal('png'),
    height: TargetSideSchema,
    iccSha256: v.literal(IGS_SRGB_ICC_SHA256),
    sha256: Sha256Schema,
    width: TargetSideSchema,
  }),
  vae: v.optional(v.nullable(FrozenGenerationVaeSchema)),
  vaePrecision: v.optional(v.picklist(['Auto', 'FP16', 'FP32'])),
})
const Txt2ImgWorkerJobSchema = v.strictObject({
  bbox: BboxSchema,
  checkpoint: v.strictObject({
    path: NonemptySchema,
    predictionType: PredictionTypeSchema,
    sha256: Sha256Schema,
  }),
  embeddings: v.optional(IllustriousWorkerEmbeddingsSchema),
  loras: v.optional(WorkerLorasSchema),
  prompts: PromptsSchema,
  sampling: v.strictObject({
    cfgRescale: v.optional(v.pipe(v.number(), v.finite(), v.minValue(0), v.maxValue(0.99))),
    cfgScale: v.pipe(v.number(), v.finite(), v.minValue(1), v.maxValue(30)),
    scheduler: SchedulerKeySchema,
    seed: Uint32Schema,
    steps: v.pipe(v.number(), v.safeInteger(), v.minValue(1), v.maxValue(200)),
  }),
  schemaVersion: v.literal(1),
  target: v.strictObject({
    byteSize: TargetBytesSchema,
    height: TargetSideSchema,
    iccSha256: v.literal(IGS_SRGB_ICC_SHA256),
    sha256: Sha256Schema,
    width: TargetSideSchema,
  }),
  vae: v.optional(v.nullable(IllustriousWorkerVaeSchema)),
  vaePrecision: v.optional(v.picklist(['Auto', 'FP16', 'FP32'])),
})
const Txt2ImgSourceRequestSchema = v.strictObject({
  job: v.strictObject({
    ...Txt2ImgWorkerJobSchema.entries,
    output: v.strictObject({ pngPath: NonemptySchema, stagingRoot: NonemptySchema }),
    target: v.strictObject({
      ...Txt2ImgWorkerJobSchema.entries.target.entries,
      path: NonemptySchema,
    }),
  }),
  protocolVersion: v.literal('1'),
  requestId: UuidSchema,
  type: v.literal('generate-illustrious-txt2img'),
})
const Txt2ImgFrozenPayloadSchema = v.strictObject({
  context: Txt2ImgFrozenContextSchema,
  kind: v.literal('illustrious-txt2img'),
  originRequestId: UuidSchema,
  schemaVersion: v.literal(1),
  workerJob: Txt2ImgWorkerJobSchema,
})

const DenoisingStrengthSchema = v.pipe(v.number(), v.finite(), v.minValue(0), v.maxValue(1))
const Img2ImgFrozenContextSchema = v.strictObject({
  ...Txt2ImgFrozenContextSchema.entries,
  kind: v.literal('normal-img2img-preparation'),
  sampling: v.strictObject({
    ...Txt2ImgFrozenContextSchema.entries.sampling.entries,
    denoisingStrength: DenoisingStrengthSchema,
  }),
})
const Img2ImgWorkerJobSchema = v.strictObject({
  ...Txt2ImgWorkerJobSchema.entries,
  sampling: v.strictObject({
    ...Txt2ImgWorkerJobSchema.entries.sampling.entries,
    denoisingStrength: DenoisingStrengthSchema,
  }),
})
const Img2ImgSourceRequestSchema = v.strictObject({
  ...Txt2ImgSourceRequestSchema.entries,
  job: v.strictObject({
    ...Img2ImgWorkerJobSchema.entries,
    output: Txt2ImgSourceRequestSchema.entries.job.entries.output,
    target: Txt2ImgSourceRequestSchema.entries.job.entries.target,
  }),
  type: v.literal('generate-illustrious-img2img'),
})
const FrozenContextSchema = v.variant('kind', [
  Txt2ImgFrozenContextSchema,
  Img2ImgFrozenContextSchema,
])
const SourceRequestSchema = v.variant('type', [
  Txt2ImgSourceRequestSchema,
  Img2ImgSourceRequestSchema,
])
/** Shared strict durable variants, also used after the queue row has been pruned. */
export const FrozenIllustriousPayloadSchema = v.variant('kind', [
  Txt2ImgFrozenPayloadSchema,
  v.strictObject({
    ...Txt2ImgFrozenPayloadSchema.entries,
    context: Img2ImgFrozenContextSchema,
    kind: v.literal('illustrious-img2img'),
    workerJob: Img2ImgWorkerJobSchema,
  }),
])

const FrozenIllustriousOutpaintPayloadSchema = v.strictObject({
  ...Txt2ImgFrozenPayloadSchema.entries,
  context: v.strictObject({
    ...Img2ImgFrozenContextSchema.entries,
    bbox: v.pipe(
      BboxSchema,
      v.check((bbox) => bbox.width >= 64 && bbox.height >= 64),
    ),
    conditioning: FrozenAlphaOutpaintConditioningSchema,
    kind: v.literal('normal-outpaint-preparation'),
  }),
  kind: v.literal('illustrious-outpaint'),
  workerJob: Img2ImgWorkerJobSchema,
})

/** One frozen request and context. A dispatch attempt must assign fresh output and request paths. */
export interface FrozenQueuedIllustriousTxt2ImgV1 {
  context: FrozenNormalTxt2ImgPreparationV1
  kind: 'illustrious-txt2img'
  originRequestId: string
  schemaVersion: 1
  workerJob: WorkerJobWithoutPaths
}

export interface FrozenQueuedIllustriousImg2ImgV1 extends Omit<
  FrozenQueuedIllustriousTxt2ImgV1,
  'context' | 'kind' | 'workerJob'
> {
  context: FrozenNormalImg2ImgPreparationV1
  kind: 'illustrious-img2img'
  workerJob: Omit<IllustriousImg2ImgRequestV1['job'], 'output' | 'target'> & {
    target: WorkerJobWithoutPaths['target']
  }
}
export type FrozenQueuedIllustriousGenerationV1 =
  FrozenQueuedIllustriousImg2ImgV1 | FrozenQueuedIllustriousTxt2ImgV1

export interface FrozenQueuedIllustriousOutpaintV1 extends Omit<
  FrozenQueuedIllustriousImg2ImgV1,
  'context' | 'kind'
> {
  context: FrozenNormalOutpaintPreparationV1
  kind: 'illustrious-outpaint'
}
export type PreparedOutpaintGeneration =
  PreparedAnimaOutpaintGeneration | PreparedNormalOutpaintGeneration
export type FrozenQueuedOutpaintV1 = FrozenQueuedAnimaOutpaintV1 | FrozenQueuedIllustriousOutpaintV1

export type FrozenQueuedGenerationV1 =
  FrozenQueuedAnimaGenerationV1 | FrozenQueuedIllustriousGenerationV1 | FrozenQueuedOutpaintV1

export function isQueuedOutpaint(
  payload: FrozenQueuedGenerationV1,
): payload is FrozenQueuedOutpaintV1 {
  return payload.kind === 'illustrious-outpaint' || payload.kind === 'anima-outpaint'
}
export type { FrozenQueuedAnimaOutpaintV1 } from './anima-queued-generation.js'

/** Internal operational schemas; accepted portable provenance remains separately restricted. */
export const FrozenGenerationPayloadSchema = v.variant('kind', [
  ...FrozenIllustriousPayloadSchema.options,
  ...FrozenQueuedAnimaGenerationSchema.options,
  FrozenIllustriousOutpaintPayloadSchema,
  FrozenQueuedAnimaOutpaintSchema,
])

export interface QueuedGenerationItem {
  batchId: string
  cancelRequested: boolean
  createdAt: string
  id: string
  localProjectKey: string
  projectPath: string
  stagingSessionId: string
  status: 'canceled' | 'completed' | 'failed' | 'pending' | 'running'
  statusSequence: number
}

/** Metadata-only view for the Project action bar; no target or checkpoint file is read. */
export interface QueuedGenerationActionJob {
  batchId: string
  createdAt: string
  id: string
  prompt: string
  seed: number
  status: 'pending' | 'running'
  statusSequence: number
}

export type TerminalGenerationStatus = 'canceled' | 'completed' | 'failed'

export interface VerifiedQueuedInput {
  item: QueuedGenerationItem
  payload: FrozenQueuedGenerationV1
  targetPath: string
}

export interface NormalizedQueueFailure {
  code: string
  message: string
}

export interface GenerationQueueRetryPreflightInput {
  frozenPayloadJson: string
  queueItemId: string
  source: QueuedGenerationItem
  stagingSessionId: string
}

export interface GenerationQueueTestHooks {
  /** Lost acknowledgement after the complete batch transaction committed. */
  afterBatchCommit?: () => Promise<void>
  /** Failure after durable directory publication, before SQLite insertion. */
  afterInputPublish?: () => Promise<void>
  /** Failure after terminal rows are deleted, before their inputs are reclaimed. */
  afterPruneCommit?: () => Promise<void>
  /** Lost acknowledgement after the retry transaction committed. */
  afterRetryCommit?: () => Promise<void>
  /** Failure after a retry input is durable, before its row is committed. */
  afterRetryInputPublish?: () => Promise<void>
  /** Pause or fail after all batch inserts but before their single transaction commits. */
  beforeBatchCommit?: () => Promise<void>
  /** Pause after frozen-input verification, before the cross-instance claim CAS. */
  beforeClaimUpdate?: (itemId: string) => Promise<void>
  /** Simulate a nonfatal filesystem cleanup failure after a committed prune. */
  beforePruneInputCleanup?: () => Promise<void>
  /** Failure after the retry insert but before its transaction commits. */
  beforeRetryCommit?: () => Promise<void>
}

type WorkerJobWithoutPaths = Omit<IllustriousTxt2ImgRequestV1['job'], 'output' | 'target'> & {
  target: Omit<IllustriousTxt2ImgRequestV1['job']['target'], 'path'>
}

interface InputManifestV1 {
  payloadSha256: string
  queueInputVersion: 1
  queueItemId: string
  targetByteSize: number
  targetFile: 'target.png'
  targetSha256: string
}

export class GenerationQueueError extends Error {
  constructor(
    readonly code:
      | 'QUEUE_FAILURE_INVALID'
      | 'QUEUE_INPUT_INVALID'
      | 'QUEUE_ITEM_NOT_FOUND'
      | 'QUEUE_NOT_RECONCILED'
      | 'QUEUE_PROJECT_CLOSING'
      | 'QUEUE_PROJECT_IDENTITY_CHANGED'
      | 'QUEUE_PUBLICATION_UNCERTAIN'
      | 'QUEUE_STATUS_CONFLICT'
      | 'QUEUE_STORAGE_UNSAFE',
    message: string,
  ) {
    super(message)
    this.name = 'GenerationQueueError'
  }
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/**
 * Main-owned, first-job queue checkpoint. It never dispatches work or publishes candidates. Files
 * commit first, then the SQLite row; startup removes unreferenced file commits after a crash.
 */
export class GenerationQueueRepository {
  private readonly fencedProjects = new Set<string>()
  private pendingOperation: Promise<void> = Promise.resolve()
  private readonly publicationUncertainProjects = new Set<string>()
  private reconciled = false
  private readonly root: string

  constructor(
    private readonly db: Kysely<DB>,
    dataRoot: string,
    private readonly testHooks: GenerationQueueTestHooks = {},
  ) {
    if (!path.isAbsolute(dataRoot) || path.resolve(dataRoot) !== dataRoot) {
      throw new GenerationQueueError('QUEUE_STORAGE_UNSAFE', 'Application data root is invalid.')
    }
    this.root = path.join(dataRoot, 'generation-inputs')
  }

  /** Called by the processor only after the canceled worker has actually exited. */
  async acknowledgeCanceledRunning(
    id: string,
    expectedStatusSequence: number,
  ): Promise<QueuedGenerationItem> {
    validateQueueId(id)
    validateExpectedSequence(expectedStatusSequence)
    return await this.serialize(async () => {
      const now = new Date().toISOString()
      const canceled = await this.db
        .updateTable('generation_queue_item')
        .set({
          error_message: 'The job was canceled.',
          finished_at: now,
          status: 'canceled',
          status_sequence: sql<number>`status_sequence + 1`,
          updated_at: now,
        })
        .where('id', '=', id)
        .where('status', '=', 'running')
        .where('error_code', '=', 'USER_CANCELED')
        .where('status_sequence', '=', expectedStatusSequence)
        .returningAll()
        .executeTakeFirst()
      if (canceled) {
        return toItem(canceled)
      }
      await this.requireRow(id)
      throw statusConflict()
    })
  }

  assertProjectCanEnqueue(localProjectKey: string): void {
    validateProjectKey(localProjectKey)
    if (this.publicationUncertainProjects.has(localProjectKey)) {
      throw batchPublicationUncertain()
    }
    if (this.fencedProjects.has(localProjectKey)) {
      throw new GenerationQueueError(
        'QUEUE_PROJECT_CLOSING',
        'The Project is closing and cannot accept generation jobs.',
      )
    }
  }

  /** Dispatch must use the repository instance whose startup recovery completed successfully. */
  assertReadyForDispatch(): void {
    if (!this.reconciled) {
      throw new GenerationQueueError(
        'QUEUE_NOT_RECONCILED',
        'Generation queue recovery must complete before dispatch.',
      )
    }
    if (this.publicationUncertainProjects.size > 0) {
      throw batchPublicationUncertain()
    }
  }

  /**
   * A pending job can stop immediately. A running job keeps the sole worker slot until the
   * processor observes worker exit and acknowledges cancellation.
   */
  async cancel(id: string, expectedStatusSequence?: number): Promise<QueuedGenerationItem> {
    validateQueueId(id)
    if (expectedStatusSequence !== undefined) {
      validateExpectedSequence(expectedStatusSequence)
    }
    return await this.serialize(async () => {
      for (;;) {
        const row = await this.requireRow(id)
        if (
          expectedStatusSequence !== undefined &&
          row.status_sequence !== expectedStatusSequence
        ) {
          throw statusConflict()
        }
        if (
          row.error_code === 'USER_CANCELED' &&
          (row.status === 'running' || row.status === 'canceled')
        ) {
          return toItem(row)
        }
        if (row.status !== 'pending' && row.status !== 'running') {
          return toItem(row)
        }
        if (row.error_code !== null) {
          throw statusConflict()
        }
        const running = row.status === 'running'
        const now = new Date().toISOString()
        const canceled = await this.db
          .updateTable('generation_queue_item')
          .set({
            error_code: 'USER_CANCELED',
            error_message: running ? 'Cancellation requested.' : 'The job was canceled.',
            finished_at: running ? null : now,
            status: running ? 'running' : 'canceled',
            status_sequence: sql<number>`status_sequence + 1`,
            updated_at: now,
          })
          .where('id', '=', id)
          .where('status', '=', row.status)
          .where('status_sequence', '=', row.status_sequence)
          .where('error_code', 'is', null)
          .returningAll()
          .executeTakeFirst()
        if (canceled) {
          return toItem(canceled)
        }
        if (expectedStatusSequence !== undefined) {
          throw statusConflict()
        }
      }
    })
  }

  /**
   * App shutdown calls this after dispatch has stopped and the active worker has exited. Only
   * still-pending rows are terminalized; their registered frozen inputs remain for explicit retry.
   */
  async cancelPendingForShutdown(): Promise<number> {
    return await this.serialize(async () => {
      this.assertReadyForDispatch()
      const now = new Date().toISOString()
      const canceled = await this.db
        .updateTable('generation_queue_item')
        .set({
          error_code: 'USER_CANCELED',
          error_message: 'The job was canceled.',
          finished_at: now,
          status: 'canceled',
          status_sequence: sql<number>`status_sequence + 1`,
          updated_at: now,
        })
        .where('status', '=', 'pending')
        .executeTakeFirst()
      return Number(canceled.numUpdatedRows)
    })
  }

  /**
   * Verify the oldest pending input before taking the sole running slot. The conditional SQLite
   * update also excludes a running row claimed through another repository instance.
   */
  async claimNextPending(): Promise<VerifiedQueuedInput | null> {
    return await this.serialize(async () => {
      for (;;) {
        const running = await this.db
          .selectFrom('generation_queue_item')
          .select('id')
          .where('status', '=', 'running')
          .executeTakeFirst()
        if (running) {
          return null
        }
        let pendingQuery = this.db
          .selectFrom('generation_queue_item')
          .selectAll()
          .where('status', '=', 'pending')
          .orderBy('created_at', 'asc')
          .orderBy('id', 'asc')
        if (this.fencedProjects.size > 0) {
          pendingQuery = pendingQuery.where('local_project_key', 'not in', [...this.fencedProjects])
        }
        const pending = await pendingQuery.executeTakeFirst()
        if (!pending) {
          return null
        }

        // A fence can be raised after the read and while frozen files are verified.
        if (this.fencedProjects.has(pending.local_project_key)) {
          continue
        }

        let verified: VerifiedQueuedInput
        try {
          verified = await this.verifyRow(pending)
        } catch (error) {
          if (!(error instanceof GenerationQueueError) || error.code !== 'QUEUE_INPUT_INVALID') {
            throw error
          }
          // A corrupt frozen input cannot be dispatched. Mark only the still-pending revision
          // failed, preserving its files and allowing the next valid item to progress.
          const now = new Date().toISOString()
          await this.db
            .updateTable('generation_queue_item')
            .set({
              error_code: 'QUEUE_INPUT_INVALID',
              error_message: 'The frozen queue input is invalid.',
              finished_at: now,
              status: 'failed',
              status_sequence: sql<number>`status_sequence + 1`,
              updated_at: now,
            })
            .where('id', '=', pending.id)
            .where('status', '=', 'pending')
            .where('status_sequence', '=', pending.status_sequence)
            .returning('id')
            .executeTakeFirst()
          continue
        }

        await this.testHooks.beforeClaimUpdate?.(pending.id)
        if (this.fencedProjects.has(pending.local_project_key)) {
          continue
        }
        const now = new Date().toISOString()
        const claimed = await this.db
          .updateTable('generation_queue_item')
          .set({
            error_code: null,
            error_message: null,
            started_at: now,
            status: 'running',
            status_sequence: sql<number>`status_sequence + 1`,
            updated_at: now,
          })
          .where('id', '=', pending.id)
          .where('status', '=', 'pending')
          .where('status_sequence', '=', pending.status_sequence)
          .where('frozen_payload_json', '=', pending.frozen_payload_json)
          .where(
            sql<boolean>`NOT EXISTS (
            SELECT 1 FROM generation_queue_item AS active WHERE active.status = 'running'
          )`,
          )
          .returningAll()
          .executeTakeFirst()
        if (claimed) {
          return { ...verified, item: toItem(claimed) }
        }
      }
    })
  }

  /** Delete one terminal queue row without touching its independent staging candidate. */
  async deleteTerminal(id: string, expectedStatusSequence: number): Promise<void> {
    validateQueueId(id)
    validateExpectedSequence(expectedStatusSequence)
    await this.serialize(async () => {
      this.assertReadyForDispatch()
      const root = await this.ensureRoot()
      const row = await this.requireRow(id)
      if (row.status_sequence !== expectedStatusSequence || !isTerminalStatus(row.status)) {
        throw statusConflict()
      }
      if (await this.hasReservedReceipt(id)) {
        throw publicationUncertain()
      }
      const deleted = await this.db
        .deleteFrom('generation_queue_item')
        .where('id', '=', id)
        .where('status', '=', row.status)
        .where('status_sequence', '=', expectedStatusSequence)
        .where(noReservedReceipt())
        .returning('id')
        .executeTakeFirst()
      if (!deleted) {
        throw statusConflict()
      }
      await this.testHooks.afterPruneCommit?.()
      await this.cleanupPrunedInputs(root, [id])
    })
  }

  /** Call within the qualified request's scratch lease, while its target path is still valid. */
  async enqueueIllustriousGeneration(input: {
    prepared: PreparedNormalGeneration
    projectPath: string
    request: IllustriousGenerationRequestV1
    stagingSessionId: string
  }): Promise<QueuedGenerationItem> {
    // Freeze caller-owned objects before any await, including the source Project path.
    const request = structuredClone(input.request)
    const context = structuredClone(input.prepared.context)
    const targetBytes = Buffer.from(input.prepared.targetPngBytes)
    const projectPath = input.projectPath
    const stagingSessionId = input.stagingSessionId
    validateSnapshot(context, request, targetBytes, stagingSessionId)

    return await this.serialize(async () => {
      const canonicalPath = await canonicalProjectPath(projectPath)
      if (canonicalPath !== projectPath) {
        throw new GenerationQueueError(
          'QUEUE_PROJECT_IDENTITY_CHANGED',
          'The Project path changed before queueing.',
        )
      }
      const localProjectKey = localProjectRecoveryKey(canonicalPath)
      this.assertProjectCanEnqueue(localProjectKey)
      const sourceBytes = await readStableFile(
        request.job.target.path,
        request.job.target.byteSize,
        request.job.target.sha256,
      )
      if (!sourceBytes.equals(targetBytes)) {
        throw new GenerationQueueError(
          'QUEUE_INPUT_INVALID',
          'The qualified request target differs from the frozen Project target.',
        )
      }
      await validateTargetPng(targetBytes, context)

      const id = randomUUID()
      const batchId = randomUUID()
      const now = new Date().toISOString()
      const payload = frozenPayload(context, request)
      const payloadJson = JSON.stringify(payload)
      if (Buffer.byteLength(payloadJson, 'utf8') > MAX_PAYLOAD_BYTES) {
        throw new GenerationQueueError('QUEUE_INPUT_INVALID', 'The frozen job is too large.')
      }
      parsePayload(payloadJson)
      const manifest: InputManifestV1 = {
        payloadSha256: sha256(Buffer.from(payloadJson, 'utf8')),
        queueInputVersion: QUEUE_INPUT_VERSION,
        queueItemId: id,
        targetByteSize: targetBytes.length,
        targetFile: 'target.png',
        targetSha256: sha256(targetBytes),
      }
      const root = await this.ensureRoot()
      const temporary = await mkdtemp(path.join(root, '.tmp-'))
      const published = path.join(root, id)
      let renamed = false
      try {
        await writeDurableFile(path.join(temporary, 'target.png'), targetBytes)
        await writeDurableFile(
          path.join(temporary, 'manifest.json'),
          Buffer.from(JSON.stringify(manifest), 'utf8'),
        )
        await syncDirectory(temporary)
        await rename(temporary, published)
        renamed = true
        await syncDirectory(root)
        await this.testHooks.afterInputPublish?.()
        // A close may have fenced the Project while durable input files were written. The
        // catch path removes this unreferenced directory; no pending row becomes visible.
        this.assertProjectCanEnqueue(localProjectKey)
        await this.db
          .insertInto('generation_queue_item')
          .values({
            batch_id: batchId,
            canonical_project_path: canonicalPath,
            created_at: now,
            document_id: context.documentId,
            document_revision: context.documentRevision,
            error_code: null,
            error_message: null,
            finished_at: null,
            frozen_payload_json: payloadJson,
            id,
            local_project_key: localProjectKey,
            operation: payload.kind,
            staging_session_id: stagingSessionId,
            started_at: null,
            status: 'pending',
            status_sequence: 0,
            updated_at: now,
          })
          .execute()
        return {
          batchId,
          cancelRequested: false,
          createdAt: now,
          id,
          localProjectKey,
          projectPath: canonicalPath,
          stagingSessionId,
          status: 'pending',
          statusSequence: 0,
        }
      } catch (error) {
        // A database error may have happened after a commit acknowledgement was lost. Never
        // delete a published input unless a successful read proves the row was not committed.
        let safeToRemove = !renamed
        if (renamed) {
          try {
            const committed = await this.db
              .selectFrom('generation_queue_item')
              .select('id')
              .where('id', '=', id)
              .executeTakeFirst()
            safeToRemove = !committed
          } catch {
            safeToRemove = false
          }
        }
        if (safeToRemove) {
          await rm(renamed ? published : temporary, { force: true, recursive: true }).catch(
            (cleanupError: unknown) => {
              process.emitWarning(`Generation input cleanup failed: ${String(cleanupError)}`)
            },
          )
        }
        throw error
      }
    })
  }

  /** Publish one fresh group of already qualified concrete jobs, with no partial visible batch. */
  async enqueueIllustriousGenerationBatch(input: {
    items: readonly {
      prepared: PreparedNormalGeneration
      request: IllustriousGenerationRequestV1
    }[]
    preflight: (
      entries: readonly { frozenPayloadJson: string; queueItemId: string }[],
    ) => Promise<void>
    projectPath: string
    stagingSessionId: string
  }): Promise<QueuedGenerationItem[]> {
    if (
      !Array.isArray(input.items) ||
      input.items.length < 1 ||
      input.items.length > GENERATION_STAGING_LIMITS.candidates ||
      typeof input.preflight !== 'function'
    ) {
      throw new GenerationQueueError(
        'QUEUE_INPUT_INVALID',
        'The qualified batch selection is invalid.',
      )
    }
    const projectPath = input.projectPath
    const stagingSessionId = input.stagingSessionId
    const preflight = input.preflight
    if (!Buffer.isBuffer(input.items[0]?.prepared?.targetPngBytes)) {
      throw new GenerationQueueError('QUEUE_INPUT_INVALID', 'The batch target is unavailable.')
    }
    // One shared target snapshot bounds memory independently of the number of jobs. All mutable
    // metadata and caller buffers are consumed before the first await, including the item order.
    const targetBytes = Buffer.from(input.items[0].prepared.targetPngBytes)
    const items = input.items.map((item) => {
      if (
        !Buffer.isBuffer(item?.prepared?.targetPngBytes) ||
        !item.prepared.targetPngBytes.equals(targetBytes)
      ) {
        throw new GenerationQueueError(
          'QUEUE_INPUT_INVALID',
          'A batch must share one frozen target.',
        )
      }
      const context = structuredClone(item.prepared.context)
      const request = structuredClone(item.request)
      validateSnapshot(context, request, targetBytes, stagingSessionId)
      return { context, request }
    })
    const group = comparableBatchContext(items[0].context)
    if (
      new Set(items.map((item) => item.request.requestId)).size !== items.length ||
      !batchEmbeddingFilesAgree(items.map((item) => item.context)) ||
      items.some((item) => !isDeepStrictEqual(comparableBatchContext(item.context), group))
    ) {
      throw new GenerationQueueError(
        'QUEUE_INPUT_INVALID',
        'The batch contains mixed frozen inputs.',
      )
    }

    return await this.serialize(async () => {
      this.assertReadyForDispatch()
      const canonicalPath = await canonicalProjectPath(projectPath)
      if (canonicalPath !== projectPath) {
        throw new GenerationQueueError(
          'QUEUE_PROJECT_IDENTITY_CHANGED',
          'The Project path changed before queueing.',
        )
      }
      const localProjectKey = localProjectRecoveryKey(canonicalPath)
      this.assertProjectCanEnqueue(localProjectKey)
      for (const item of items) {
        const source = await readStableFile(
          item.request.job.target.path,
          item.context.target.byteSize,
          item.context.target.sha256,
        )
        if (!source.equals(targetBytes)) {
          throw new GenerationQueueError(
            'QUEUE_INPUT_INVALID',
            'The qualified batch target changed.',
          )
        }
      }
      await validateTargetPng(targetBytes, items[0].context)
      const batchId = randomUUID()
      // IDs remain opaque random UUIDs. Canonical assignment to plan slots preserves supplied
      // order through the existing created_at/id query without synthetic timestamps or migration.
      const ids = items.map(() => randomUUID()).sort()
      const now = new Date().toISOString()
      const rows: Selectable<GenerationQueueItem>[] = items.map((item, index) => ({
        batch_id: batchId,
        canonical_project_path: canonicalPath,
        created_at: now,
        document_id: item.context.documentId,
        document_revision: item.context.documentRevision,
        error_code: null,
        error_message: null,
        finished_at: null,
        frozen_payload_json: frozenBatchPayloadJson(item.context, item.request),
        id: ids[index],
        local_project_key: localProjectKey,
        operation:
          item.context.kind === 'normal-img2img-preparation'
            ? 'illustrious-img2img'
            : 'illustrious-txt2img',
        staging_session_id: stagingSessionId,
        started_at: null,
        status: 'pending',
        status_sequence: 0,
        updated_at: now,
      }))
      await preflight(
        Object.freeze(
          rows.map((row) =>
            Object.freeze({
              frozenPayloadJson: row.frozen_payload_json,
              queueItemId: row.id,
            }),
          ),
        ),
      )
      this.assertProjectCanEnqueue(localProjectKey)
      const root = await this.ensureRoot()
      const directories: { path: string; published: boolean }[] = []
      try {
        for (const row of rows) {
          const temporary = await mkdtemp(path.join(root, '.tmp-'))
          const directory = { path: temporary, published: false }
          directories.push(directory)
          const manifest: InputManifestV1 = {
            payloadSha256: sha256(Buffer.from(row.frozen_payload_json, 'utf8')),
            queueInputVersion: QUEUE_INPUT_VERSION,
            queueItemId: row.id,
            targetByteSize: targetBytes.length,
            targetFile: 'target.png',
            targetSha256: sha256(targetBytes),
          }
          await writeDurableFile(path.join(temporary, 'target.png'), targetBytes)
          await writeDurableFile(
            path.join(temporary, 'manifest.json'),
            Buffer.from(JSON.stringify(manifest), 'utf8'),
          )
          await syncDirectory(temporary)
          const published = path.join(root, row.id)
          await rename(temporary, published)
          directory.path = published
          directory.published = true
          await syncDirectory(root)
          await this.testHooks.afterInputPublish?.()
          this.assertProjectCanEnqueue(localProjectKey)
        }
        await this.db.transaction().execute(async (transaction) => {
          this.assertProjectCanEnqueue(localProjectKey)
          // Separate small INSERTs share one transaction; SQLite binding counts stay bounded.
          for (const row of rows) {
            await transaction.insertInto('generation_queue_item').values(row).execute()
            this.assertProjectCanEnqueue(localProjectKey)
          }
          await this.testHooks.beforeBatchCommit?.()
          this.assertProjectCanEnqueue(localProjectKey)
        })
        await this.testHooks.afterBatchCommit?.()
        return rows.map(toItem)
      } catch (error) {
        if (!directories.some((directory) => directory.published)) {
          await removeUnregisteredBatchDirectories(
            directories.map((directory) => directory.path),
            root,
          )
          throw error
        }
        let committed: Selectable<GenerationQueueItem>[]
        try {
          committed = await this.db
            .selectFrom('generation_queue_item')
            .selectAll()
            .where('id', 'in', ids)
            .execute()
        } catch {
          this.publicationUncertainProjects.add(localProjectKey)
          this.fencedProjects.add(localProjectKey)
          throw batchPublicationUncertain()
        }
        if (batchRowsMatch(committed, rows)) {
          return rows.map((expected) => toItem(committed.find((row) => row.id === expected.id)!))
        }
        if (committed.length !== 0) {
          this.publicationUncertainProjects.add(localProjectKey)
          this.fencedProjects.add(localProjectKey)
          throw batchPublicationUncertain()
        }
        await removeUnregisteredBatchDirectories(
          directories.map((directory) => directory.path),
          root,
        )
        throw error
      }
    })
  }

  async enqueueIllustriousTxt2Img(input: {
    prepared: PreparedNormalTxt2Img
    projectPath: string
    request: IllustriousTxt2ImgRequestV1
    stagingSessionId: string
  }): Promise<QueuedGenerationItem> {
    if (
      input.prepared.context.kind !== 'normal-txt2img-preparation' ||
      input.request.type !== 'generate-illustrious-txt2img'
    ) {
      throw new GenerationQueueError(
        'QUEUE_INPUT_INVALID',
        'The legacy txt2img entry requires a transparent target.',
      )
    }
    return await this.enqueueIllustriousGeneration(input)
  }

  async enqueueIllustriousTxt2ImgBatch(input: {
    items: readonly { prepared: PreparedNormalTxt2Img; request: IllustriousTxt2ImgRequestV1 }[]
    preflight: (
      entries: readonly { frozenPayloadJson: string; queueItemId: string }[],
    ) => Promise<void>
    projectPath: string
    stagingSessionId: string
  }): Promise<QueuedGenerationItem[]> {
    if (
      input.items.some(
        (item) =>
          item.prepared.context.kind !== 'normal-txt2img-preparation' ||
          item.request.type !== 'generate-illustrious-txt2img',
      )
    ) {
      throw new GenerationQueueError(
        'QUEUE_INPUT_INVALID',
        'The legacy txt2img entry requires transparent targets.',
      )
    }
    return await this.enqueueIllustriousGenerationBatch(input)
  }

  /** Admit one complete qualified Anima batch using the existing files-first/atomic-SQL protocol. */
  async enqueuePreparedAnimaGenerationBatch(input: {
    beforeCommit?: () => Promise<void>
    preflight: (
      entries: readonly { frozenPayloadJson: string; queueItemId: string }[],
    ) => Promise<void>
    preparedBatch: PreparedAnimaGenerationBatch
    projectPath: string
    requests: readonly AnimaWorkerRequest[]
    stagingSessionId: string
  }): Promise<QueuedGenerationItem[]> {
    const projectPath = input.projectPath
    const stagingSessionId = input.stagingSessionId
    const preflight = input.preflight
    const beforeCommit = input.beforeCommit
    if (
      !Buffer.isBuffer(input.preparedBatch?.targetPngBytes) ||
      typeof preflight !== 'function' ||
      (beforeCommit !== undefined && typeof beforeCommit !== 'function') ||
      !v.is(UuidSchema, stagingSessionId) ||
      !Array.isArray(input.requests)
    ) {
      throw new GenerationQueueError('QUEUE_INPUT_INVALID', 'The qualified Anima batch is invalid.')
    }
    // Capture all mutable metadata and the single shared Buffer before serialized storage awaits.
    const targetBytes = Buffer.from(input.preparedBatch.targetPngBytes)
    const supplied = structuredClone({
      context: input.preparedBatch.context,
      items: input.preparedBatch.items,
      iterations: input.preparedBatch.iterations,
      truncated: input.preparedBatch.truncated,
    })
    const requests = structuredClone(input.requests)
    let payloads: FrozenQueuedAnimaGenerationV1[]
    try {
      const rebuilt = prepareAnimaGenerationBatch({
        iterations: supplied.iterations,
        prepared: { context: supplied.context, targetPngBytes: targetBytes },
      })
      if (
        !isDeepStrictEqual(rebuilt.items, supplied.items) ||
        rebuilt.truncated !== supplied.truncated ||
        requests.length !== rebuilt.items.length ||
        new Set(requests.map((request) => request.requestId)).size !== requests.length ||
        new Set(requests.map((request) => request.job.target.path)).size !== 1 ||
        new Set(requests.map((request) => request.job.output.pngPath)).size !== requests.length
      ) {
        throw new Error('The supplied batch differs from its complete captured plan.')
      }
      payloads = rebuilt.items.map((item, index) =>
        buildFrozenQueuedAnimaGenerationV1({
          context: rebuilt.context,
          item,
          request: requests[index],
        }),
      )
    } catch {
      throw new GenerationQueueError('QUEUE_INPUT_INVALID', 'The qualified Anima batch is invalid.')
    }
    const payloadJsons = payloads.map((payload) => JSON.stringify(payload))
    return await this.serialize(async () => {
      this.assertReadyForDispatch()
      const canonicalPath = await canonicalProjectPath(projectPath)
      if (canonicalPath !== projectPath) {
        throw new GenerationQueueError(
          'QUEUE_PROJECT_IDENTITY_CHANGED',
          'The Project path changed before queueing.',
        )
      }
      const localProjectKey = localProjectRecoveryKey(canonicalPath)
      this.assertProjectCanEnqueue(localProjectKey)
      for (const request of requests) {
        const bytes = await readStableFile(
          request.job.target.path,
          targetBytes.length,
          sha256(targetBytes),
        )
        if (!bytes.equals(targetBytes)) {
          throw new GenerationQueueError(
            'QUEUE_INPUT_INVALID',
            'The qualified Anima target changed.',
          )
        }
      }
      await validateTargetPng(targetBytes, payloads[0].context)
      const batchId = randomUUID()
      // IDs remain opaque random UUIDs. Canonical assignment to plan slots preserves supplied
      // order through the existing created_at/id query without synthetic timestamps or migration.
      const ids = payloads.map(() => randomUUID()).sort()
      const now = new Date().toISOString()
      const rows: Selectable<GenerationQueueItem>[] = payloads.map((payload, index) => ({
        batch_id: batchId,
        canonical_project_path: canonicalPath,
        created_at: now,
        document_id: payload.context.documentId,
        document_revision: payload.context.documentRevision,
        error_code: null,
        error_message: null,
        finished_at: null,
        frozen_payload_json: payloadJsons[index],
        id: ids[index],
        local_project_key: localProjectKey,
        operation: payload.kind,
        staging_session_id: stagingSessionId,
        started_at: null,
        status: 'pending',
        status_sequence: 0,
        updated_at: now,
      }))
      await preflight(
        Object.freeze(
          rows.map((row) =>
            Object.freeze({
              frozenPayloadJson: row.frozen_payload_json,
              queueItemId: row.id,
            }),
          ),
        ),
      )
      this.assertProjectCanEnqueue(localProjectKey)
      const root = await this.ensureRoot()
      const directories: { path: string; published: boolean }[] = []
      try {
        for (const row of rows) {
          const temporary = await mkdtemp(path.join(root, '.tmp-'))
          const directory = { path: temporary, published: false }
          directories.push(directory)
          const manifest: InputManifestV1 = {
            payloadSha256: sha256(Buffer.from(row.frozen_payload_json, 'utf8')),
            queueInputVersion: QUEUE_INPUT_VERSION,
            queueItemId: row.id,
            targetByteSize: targetBytes.length,
            targetFile: 'target.png',
            targetSha256: sha256(targetBytes),
          }
          await writeDurableFile(path.join(temporary, 'target.png'), targetBytes)
          await writeDurableFile(
            path.join(temporary, 'manifest.json'),
            Buffer.from(JSON.stringify(manifest), 'utf8'),
          )
          await syncDirectory(temporary)
          const published = path.join(root, row.id)
          await rename(temporary, published)
          directory.path = published
          directory.published = true
          await syncDirectory(root)
          await this.testHooks.afterInputPublish?.()
          this.assertProjectCanEnqueue(localProjectKey)
        }
        await this.db.transaction().execute(async (transaction) => {
          this.assertProjectCanEnqueue(localProjectKey)
          // Separate small INSERTs share one transaction; SQLite binding counts stay bounded.
          for (const row of rows) {
            await transaction.insertInto('generation_queue_item').values(row).execute()
            this.assertProjectCanEnqueue(localProjectKey)
          }
          await this.testHooks.beforeBatchCommit?.()
          await beforeCommit?.()
          this.assertProjectCanEnqueue(localProjectKey)
        })
        await this.testHooks.afterBatchCommit?.()
        return rows.map(toItem)
      } catch (error) {
        if (!directories.some((directory) => directory.published)) {
          await removeUnregisteredBatchDirectories(
            directories.map((directory) => directory.path),
            root,
          )
          throw error
        }
        let committed: Selectable<GenerationQueueItem>[]
        try {
          committed = await this.db
            .selectFrom('generation_queue_item')
            .selectAll()
            .where('id', 'in', ids)
            .execute()
        } catch {
          this.publicationUncertainProjects.add(localProjectKey)
          this.fencedProjects.add(localProjectKey)
          throw batchPublicationUncertain()
        }
        if (batchRowsMatch(committed, rows)) {
          return rows.map((expected) => toItem(committed.find((row) => row.id === expected.id)!))
        }
        if (committed.length !== 0) {
          this.publicationUncertainProjects.add(localProjectKey)
          this.fencedProjects.add(localProjectKey)
          throw batchPublicationUncertain()
        }
        await removeUnregisteredBatchDirectories(
          directories.map((directory) => directory.path),
          root,
        )
        throw error
      }
    })
  }

  /** Internal durable ownership only; this admits no worker command or portable accepted result. */
  async enqueuePreparedOutpaintBatch(input: {
    batchId?: string
    beforeCommit?: () => Promise<void>
    infillResolver: OutpaintInfillResolver
    items: readonly PreparedOutpaintGeneration[]
    modelService: AnimaGenerationModelResolver & GenerationModelResolver
    preflight: (
      entries: readonly { frozenPayloadJson: string; queueItemId: string }[],
    ) => Promise<void>
    projectPath: string
    stagingSessionId: string
  }): Promise<QueuedGenerationItem[]> {
    if (
      !Array.isArray(input.items) ||
      input.items.length < 1 ||
      input.items.length > GENERATION_BATCH_JOB_LIMIT ||
      typeof input.preflight !== 'function' ||
      !v.is(UuidSchema, input.stagingSessionId) ||
      (input.beforeCommit !== undefined && typeof input.beforeCommit !== 'function') ||
      !Buffer.isBuffer(input.items[0]?.targetPngBytes)
    ) {
      throw new GenerationQueueError(
        'QUEUE_INPUT_INVALID',
        'The internal outpaint batch is invalid.',
      )
    }
    const { beforeCommit, infillResolver, modelService, preflight, projectPath, stagingSessionId } =
      input
    const capturedBatchId = input.batchId ?? randomUUID()
    if (!v.is(UuidSchema, capturedBatchId)) {
      throw new GenerationQueueError(
        'QUEUE_INPUT_INVALID',
        'The internal outpaint batch identity is invalid.',
      )
    }
    const targetBytes = Buffer.from(input.items[0].targetPngBytes)
    const captures = input.items.map((prepared) => {
      if (
        !Buffer.isBuffer(prepared?.targetPngBytes) ||
        !prepared.targetPngBytes.equals(targetBytes)
      ) {
        throw new GenerationQueueError(
          'QUEUE_INPUT_INVALID',
          'The outpaint batch must share one source.',
        )
      }
      return { context: structuredClone(prepared.context), targetPngBytes: targetBytes }
    })
    const payloads = captures.map((prepared) => buildFrozenQueuedOutpaintV1(prepared, randomUUID()))
    const common = comparableOutpaintBatchContext(payloads[0])
    if (
      payloads.some(
        (payload) => !isDeepStrictEqual(comparableOutpaintBatchContext(payload), common),
      )
    ) {
      throw new GenerationQueueError(
        'QUEUE_INPUT_INVALID',
        'The outpaint batch mixes captured inputs.',
      )
    }
    const illustriousContexts = payloads.flatMap((payload) =>
      payload.kind === 'illustrious-outpaint' ? [payload.context] : [],
    )
    if (!batchEmbeddingFilesAgree(illustriousContexts)) {
      throw new GenerationQueueError(
        'QUEUE_INPUT_INVALID',
        'A captured embedding changed inside the outpaint batch.',
      )
    }
    const payloadJsons = payloads.map((payload) => JSON.stringify(payload))
    for (const prepared of captures) {
      if (prepared.context.kind === 'anima-outpaint-preparation') {
        await assertFrozenAnimaOutpaintGeneration(prepared.context, targetBytes)
      }
    }
    return await this.serialize(async () => {
      this.assertReadyForDispatch()
      const canonicalPath = await canonicalProjectPath(projectPath)
      if (canonicalPath !== projectPath) {
        throw new GenerationQueueError(
          'QUEUE_PROJECT_IDENTITY_CHANGED',
          'The Project path changed before queueing.',
        )
      }
      const localProjectKey = localProjectRecoveryKey(canonicalPath)
      this.assertProjectCanEnqueue(localProjectKey)
      const initialQualification = memoizedOutpaintQualification(modelService, infillResolver)
      await validateTargetPng(targetBytes, payloads[0].context)
      for (const payload of payloads) {
        await reverifyFrozenQueuedOutpaintGeneration(
          payload,
          initialQualification.models,
          initialQualification.infill,
        )
      }
      const batchId = capturedBatchId
      // IDs remain opaque random UUIDs. Canonical assignment to plan slots preserves supplied
      // order through the existing created_at/id query without synthetic timestamps or migration.
      const ids = payloads.map(() => randomUUID()).sort()
      const now = new Date().toISOString()
      const rows: Selectable<GenerationQueueItem>[] = payloads.map((payload, index) => ({
        batch_id: batchId,
        canonical_project_path: canonicalPath,
        created_at: now,
        document_id: payload.context.documentId,
        document_revision: payload.context.documentRevision,
        error_code: null,
        error_message: null,
        finished_at: null,
        frozen_payload_json: payloadJsons[index],
        id: ids[index],
        local_project_key: localProjectKey,
        operation: payload.kind,
        staging_session_id: stagingSessionId,
        started_at: null,
        status: 'pending',
        status_sequence: 0,
        updated_at: now,
      }))
      await preflight(
        Object.freeze(
          rows.map((row) =>
            Object.freeze({
              frozenPayloadJson: row.frozen_payload_json,
              queueItemId: row.id,
            }),
          ),
        ),
      )
      this.assertProjectCanEnqueue(localProjectKey)
      const root = await this.ensureRoot()
      const directories: { path: string; published: boolean }[] = []
      try {
        for (const row of rows) {
          const temporary = await mkdtemp(path.join(root, '.tmp-'))
          const directory = { path: temporary, published: false }
          directories.push(directory)
          const manifest: InputManifestV1 = {
            payloadSha256: sha256(Buffer.from(row.frozen_payload_json, 'utf8')),
            queueInputVersion: QUEUE_INPUT_VERSION,
            queueItemId: row.id,
            targetByteSize: targetBytes.length,
            targetFile: 'target.png',
            targetSha256: sha256(targetBytes),
          }
          await writeDurableFile(path.join(temporary, 'target.png'), targetBytes)
          await writeDurableFile(
            path.join(temporary, 'manifest.json'),
            Buffer.from(JSON.stringify(manifest), 'utf8'),
          )
          await syncDirectory(temporary)
          const published = path.join(root, row.id)
          await rename(temporary, published)
          directory.path = published
          directory.published = true
          await syncDirectory(root)
          await this.testHooks.afterInputPublish?.()
          this.assertProjectCanEnqueue(localProjectKey)
        }
        await beforeCommit?.()
        const finalQualification = memoizedOutpaintQualification(modelService, infillResolver)
        for (const payload of payloads) {
          await reverifyFrozenQueuedOutpaintGeneration(
            payload,
            finalQualification.models,
            finalQualification.infill,
          )
        }
        await this.db.transaction().execute(async (transaction) => {
          this.assertProjectCanEnqueue(localProjectKey)
          // Separate small INSERTs share one transaction; SQLite binding counts stay bounded.
          for (const row of rows) {
            await transaction.insertInto('generation_queue_item').values(row).execute()
            this.assertProjectCanEnqueue(localProjectKey)
          }
          await this.testHooks.beforeBatchCommit?.()
          this.assertProjectCanEnqueue(localProjectKey)
        })
        await this.testHooks.afterBatchCommit?.()
        return rows.map(toItem)
      } catch (error) {
        if (!directories.some((directory) => directory.published)) {
          await removeUnregisteredBatchDirectories(
            directories.map((directory) => directory.path),
            root,
          )
          throw error
        }
        let committed: Selectable<GenerationQueueItem>[]
        try {
          committed = await this.db
            .selectFrom('generation_queue_item')
            .selectAll()
            .where('id', 'in', ids)
            .execute()
        } catch {
          this.publicationUncertainProjects.add(localProjectKey)
          this.fencedProjects.add(localProjectKey)
          throw batchPublicationUncertain()
        }
        if (batchRowsMatch(committed, rows)) {
          return rows.map((expected) => toItem(committed.find((row) => row.id === expected.id)!))
        }
        if (committed.length !== 0) {
          this.publicationUncertainProjects.add(localProjectKey)
          this.fencedProjects.add(localProjectKey)
          throw batchPublicationUncertain()
        }
        await removeUnregisteredBatchDirectories(
          directories.map((directory) => directory.path),
          root,
        )
        throw error
      }
    })
  }

  /** A worker failure is accepted only for the exact running revision it was started for. */
  async failRunning(
    id: string,
    expectedStatusSequence: number,
    error: NormalizedQueueFailure,
  ): Promise<QueuedGenerationItem> {
    validateQueueId(id)
    validateExpectedSequence(expectedStatusSequence)
    const failure = validateNormalizedFailure(error)
    return await this.serialize(async () => {
      const now = new Date().toISOString()
      const failed = await this.db
        .updateTable('generation_queue_item')
        .set({
          error_code: failure.code,
          error_message: failure.message,
          finished_at: now,
          status: 'failed',
          status_sequence: sql<number>`status_sequence + 1`,
          updated_at: now,
        })
        .where('id', '=', id)
        .where('status', '=', 'running')
        .where('error_code', 'is', null)
        .where('status_sequence', '=', expectedStatusSequence)
        .returningAll()
        .executeTakeFirst()
      if (failed) {
        return toItem(failed)
      }
      await this.requireRow(id)
      throw statusConflict()
    })
  }

  /** Synchronous admission fence for a confirmed or pending Project close. */
  fenceProject(localProjectKey: string): void {
    validateProjectKey(localProjectKey)
    this.fencedProjects.add(localProjectKey)
  }

  /** Read one reviewed identity without requiring valid frozen input files. */
  async getManagerEntry(id: string): Promise<GenerationQueueEntry> {
    validateQueueId(id)
    return await this.serialize(async () => {
      this.assertReadyForDispatch()
      return await this.db.transaction().execute(async (transaction) => {
        const row = await transaction
          .selectFrom('generation_queue_item')
          .selectAll()
          .where('id', '=', id)
          .executeTakeFirst()
        if (!row) {
          throw new GenerationQueueError('QUEUE_ITEM_NOT_FOUND', 'The queue item was not found.')
        }
        const receipt = await transaction
          .selectFrom('generation_candidate_receipt')
          .select('queue_item_id')
          .where('queue_item_id', '=', id)
          .where('status', '=', 'reserved')
          .executeTakeFirst()
        const indexed = await transaction
          .selectFrom('project_index')
          .select('display_name')
          .where('local_project_key', '=', row.local_project_key)
          .where('document_id', '=', row.document_id)
          .where('canonical_path', '=', row.canonical_project_path)
          .executeTakeFirst()
        return toManagerEntry(row, receipt !== undefined, indexed?.display_name)
      })
    })
  }

  /**
   * Advisory metadata-only check before acquiring a runtime. Frozen input verification and the
   * cross-instance running-slot CAS remain owned by claimNextPending().
   */
  async hasDispatchablePending(): Promise<boolean> {
    return await this.serialize(async () => {
      for (;;) {
        this.assertReadyForDispatch()
        let pendingQuery = this.db
          .selectFrom('generation_queue_item')
          .select('local_project_key')
          .where('status', '=', 'pending')
          .where(
            sql<boolean>`NOT EXISTS (
            SELECT 1 FROM generation_queue_item AS active WHERE active.status = 'running'
          )`,
          )
          .orderBy('created_at', 'asc')
          .orderBy('id', 'asc')
        if (this.fencedProjects.size > 0) {
          pendingQuery = pendingQuery.where('local_project_key', 'not in', [...this.fencedProjects])
        }
        const pending = await pendingQuery.executeTakeFirst()
        this.assertReadyForDispatch()
        // Project close can raise its synchronous fence while the metadata read awaits.
        if (pending && this.fencedProjects.has(pending.local_project_key)) {
          continue
        }
        return pending !== undefined
      }
    })
  }

  /** App-wide history metadata. Neither target pixels nor checkpoint files are read. */
  async listManagerPage(cursor?: GenerationQueueCursor | null): Promise<GenerationQueuePage> {
    if (cursor !== undefined && cursor !== null && !isGenerationQueueCursor(cursor)) {
      throw new GenerationQueueError('QUEUE_INPUT_INVALID', 'The queue page cursor is invalid.')
    }
    const reviewedCursor = cursor ? { ...cursor } : null
    return await this.serialize(async () => {
      this.assertReadyForDispatch()
      return await this.db.transaction().execute(async (transaction) => {
        const counts: GenerationQueuePage['counts'] = {
          canceled: 0,
          completed: 0,
          failed: 0,
          pending: 0,
          running: 0,
        }
        const grouped = await transaction
          .selectFrom('generation_queue_item')
          .select(['status', transaction.fn.countAll<number>().as('count')])
          .groupBy('status')
          .execute()
        for (const group of grouped) {
          if (!Object.hasOwn(counts, group.status)) {
            throw new GenerationQueueError('QUEUE_INPUT_INVALID', 'The queue status is invalid.')
          }
          counts[group.status as keyof typeof counts] = Number(group.count)
        }
        let query = transaction
          .selectFrom('generation_queue_item')
          .selectAll()
          .orderBy('created_at', 'desc')
          .orderBy('id', 'desc')
          .limit(GENERATION_QUEUE_PAGE_SIZE + 1)
        if (reviewedCursor) {
          query = query.where((eb) =>
            eb.or([
              eb('created_at', '<', reviewedCursor.createdAt),
              eb.and([
                eb('created_at', '=', reviewedCursor.createdAt),
                eb('id', '<', reviewedCursor.id),
              ]),
            ]),
          )
        }
        const rows = await query.execute()
        const pageRows = rows.slice(0, GENERATION_QUEUE_PAGE_SIZE)
        const reserved =
          pageRows.length === 0
            ? []
            : await transaction
                .selectFrom('generation_candidate_receipt')
                .select('queue_item_id')
                .where(
                  'queue_item_id',
                  'in',
                  pageRows.map((row) => row.id),
                )
                .where('status', '=', 'reserved')
                .execute()
        const indexed =
          pageRows.length === 0
            ? []
            : await transaction
                .selectFrom('project_index')
                .select(['local_project_key', 'document_id', 'canonical_path', 'display_name'])
                .where('local_project_key', 'in', [
                  ...new Set(pageRows.map((row) => row.local_project_key)),
                ])
                .execute()
        const publicationPending = new Set(reserved.map((receipt) => receipt.queue_item_id))
        const last = pageRows.at(-1)
        return {
          counts,
          items: pageRows.map((row) =>
            toManagerEntry(
              row,
              publicationPending.has(row.id),
              indexed.find(
                (project) =>
                  project.local_project_key === row.local_project_key &&
                  project.document_id === row.document_id &&
                  project.canonical_path === row.canonical_project_path,
              )?.display_name,
            ),
          ),
          nextCursor:
            rows.length > GENERATION_QUEUE_PAGE_SIZE && last
              ? { createdAt: last.created_at, id: last.id }
              : null,
        }
      })
    })
  }

  /** Read every unfinished job's frozen display fields without rehashing its image payload. */
  async listUnfinishedActionJobsByProjectDocument(
    localProjectKey: string,
    documentId: string,
  ): Promise<QueuedGenerationActionJob[]> {
    validateProjectKey(localProjectKey)
    if (typeof documentId !== 'string' || !UUID_PATTERN.test(documentId)) {
      throw new GenerationQueueError(
        'QUEUE_PROJECT_IDENTITY_CHANGED',
        'The Project document identity is invalid.',
      )
    }
    return await this.serialize(async () => {
      this.assertReadyForDispatch()
      const rows = await this.db
        .selectFrom('generation_queue_item')
        .selectAll()
        .where('local_project_key', '=', localProjectKey)
        .where('document_id', '=', documentId)
        .where('status', 'in', ['pending', 'running'])
        .orderBy('created_at', 'asc')
        .orderBy('id', 'asc')
        .execute()
      return rows.map((row) => {
        const item = toItem(row)
        const payloadBytes = Buffer.from(row.frozen_payload_json, 'utf8')
        if (payloadBytes.length > MAX_PAYLOAD_BYTES) {
          throw new GenerationQueueError(
            'QUEUE_INPUT_INVALID',
            'The frozen queue payload is invalid.',
          )
        }
        const payload = parsePayload(row.frozen_payload_json)
        if (
          payload.kind !== row.operation ||
          payload.context.documentId !== row.document_id ||
          payload.context.documentRevision !== row.document_revision ||
          ((payload.kind === 'illustrious-txt2img' || payload.kind === 'illustrious-img2img') &&
            payload.workerJob.prompts.positive !== payload.context.prompts.positive) ||
          payload.workerJob.sampling.seed !== payload.context.sampling.seed ||
          (item.status !== 'pending' && item.status !== 'running')
        ) {
          throw new GenerationQueueError('QUEUE_INPUT_INVALID', 'The frozen queue context changed.')
        }
        return {
          batchId: item.batchId,
          createdAt: item.createdAt,
          id: item.id,
          prompt: payload.context.prompts.positive,
          seed: payload.context.sampling.seed,
          status: item.status,
          statusSequence: item.statusSequence,
        }
      })
    })
  }

  /** Check confirmed IDs without loading or hashing their frozen image inputs. */
  async listUnfinishedByIds(ids: readonly string[]): Promise<QueuedGenerationItem[]> {
    if (!Array.isArray(ids) || ids.length > IGS_SAFETY_CEILINGS.archiveEntries) {
      throw new GenerationQueueError('QUEUE_INPUT_INVALID', 'The queue item selection is invalid.')
    }
    const selected = [...ids]
    for (const id of selected) {
      validateQueueId(id)
    }
    if (new Set(selected).size !== selected.length) {
      throw new GenerationQueueError('QUEUE_INPUT_INVALID', 'Queue item IDs must be unique.')
    }
    return await this.serialize(async () => {
      this.assertReadyForDispatch()
      const items: QueuedGenerationItem[] = []
      // Stay below even SQLite's legacy 999-variable limit, including the two status values.
      const chunkSize = 500
      for (let offset = 0; offset < selected.length; offset += chunkSize) {
        const rows = await this.db
          .selectFrom('generation_queue_item')
          .selectAll()
          .where('id', 'in', selected.slice(offset, offset + chunkSize))
          .where('status', 'in', ['pending', 'running'])
          .orderBy('created_at', 'asc')
          .orderBy('id', 'asc')
          .execute()
        items.push(...rows.map(toItem))
      }
      return items.sort((left, right) => {
        const leftKey = `${left.createdAt}:${left.id}`
        const rightKey = `${right.createdAt}:${right.id}`
        return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0
      })
    })
  }

  /** Snapshot unfinished jobs for one local Project; the caller must recheck each row on cancel. */
  async listUnfinishedByProject(localProjectKey: string): Promise<QueuedGenerationItem[]> {
    if (typeof localProjectKey !== 'string' || !PROJECT_KEY_PATTERN.test(localProjectKey)) {
      throw new GenerationQueueError(
        'QUEUE_PROJECT_IDENTITY_CHANGED',
        'The Project identity is invalid.',
      )
    }
    return await this.serialize(async () => {
      this.assertReadyForDispatch()
      const rows = await this.db
        .selectFrom('generation_queue_item')
        .selectAll()
        .where('local_project_key', '=', localProjectKey)
        .where('status', 'in', ['pending', 'running'])
        .orderBy('created_at', 'asc')
        .orderBy('id', 'asc')
        .execute()
      return rows.map(toItem)
    })
  }

  /** Metadata-only impact snapshot: historical documents at the same path remain separate. */
  async listUnfinishedByProjectDocument(
    localProjectKey: string,
    documentId: string,
  ): Promise<QueuedGenerationItem[]> {
    validateProjectKey(localProjectKey)
    if (typeof documentId !== 'string' || !UUID_PATTERN.test(documentId)) {
      throw new GenerationQueueError(
        'QUEUE_PROJECT_IDENTITY_CHANGED',
        'The Project document identity is invalid.',
      )
    }
    return await this.serialize(async () => {
      this.assertReadyForDispatch()
      const rows = await this.db
        .selectFrom('generation_queue_item')
        .selectAll()
        .where('local_project_key', '=', localProjectKey)
        .where('document_id', '=', documentId)
        .where('status', 'in', ['pending', 'running'])
        .orderBy('created_at', 'asc')
        .orderBy('id', 'asc')
        .execute()
      return rows.map(toItem)
    })
  }

  async loadVerifiedInput(id: string): Promise<VerifiedQueuedInput> {
    validateQueueId(id)
    return await this.serialize(async () => await this.verifyRow(await this.requireRow(id)))
  }

  /** Recheck queue files. A dispatcher must separately force-hash the exact model and capability. */
  async loadVerifiedRetryInput(
    id: string,
  ): Promise<VerifiedQueuedInput & { targetPngBytes: Buffer }> {
    validateQueueId(id)
    return await this.serialize(
      async () => await this.verifyRowWithBytes(await this.requireRow(id)),
    )
  }

  /** Clear selected terminal statuses; uncertain manifest-first completions remain recoverable. */
  async pruneTerminal(statuses: readonly TerminalGenerationStatus[]): Promise<number> {
    if (statuses.some((status) => !isTerminalStatus(status))) {
      throw statusConflict()
    }
    return await this.serialize(async () => {
      this.assertReadyForDispatch()
      const selected = [...new Set(statuses)]
      if (selected.length === 0) {
        return 0
      }
      const root = await this.ensureRoot()
      const removed = await this.db
        .deleteFrom('generation_queue_item')
        .where('status', 'in', selected)
        .where(noReservedReceipt())
        .returning('id')
        .execute()
      if (removed.length > 0) {
        await this.testHooks.afterPruneCommit?.()
        await this.cleanupPrunedInputs(
          root,
          removed.map((row) => row.id),
        )
      }
      return removed.length
    })
  }

  /** Restart never resumes old work; registered inputs remain for a future explicit retry. */
  async recoverAfterRestart(): Promise<{
    canceledCount: number
    orphanedDirectoriesRemoved: number
  }> {
    this.reconciled = false
    return await this.serialize(async () => {
      const root = await this.ensureRoot()
      const now = new Date().toISOString()
      const canceled = await this.db.transaction().execute(async (transaction) => {
        const result = await transaction
          .updateTable('generation_queue_item')
          .set({
            error_code: sql<string>`CASE
              WHEN status = 'running' AND error_code = 'USER_CANCELED'
                THEN 'USER_CANCELED'
              ELSE 'APP_RESTART'
            END`,
            error_message: sql<string>`CASE
              WHEN status = 'running' AND error_code = 'USER_CANCELED'
                THEN 'The job was canceled.'
              ELSE 'The application closed before this job completed.'
            END`,
            finished_at: now,
            status: 'canceled',
            status_sequence: sql<number>`status_sequence + 1`,
            updated_at: now,
          })
          .where('status', 'in', ['pending', 'running'])
          .executeTakeFirst()
        return Number(result.numUpdatedRows)
      })
      const rows = await this.db.selectFrom('generation_queue_item').select('id').execute()
      const registered = new Set(rows.map((row) => row.id))
      let removed = 0
      for (const name of await readdir(root)) {
        if (!name.startsWith('.tmp-') && (registered.has(name) || !UUID_PATTERN.test(name))) {
          continue
        }
        const candidate = path.join(root, name)
        const entry = await lstat(candidate)
        if (!entry.isDirectory() || entry.isSymbolicLink()) {
          throw new GenerationQueueError(
            'QUEUE_STORAGE_UNSAFE',
            'Generation input storage contains an unsafe entry.',
          )
        }
        await rm(candidate, { force: true, recursive: true })
        removed += 1
      }
      if (removed > 0) {
        await syncDirectory(root)
      }
      this.reconciled = true
      this.publicationUncertainProjects.clear()
      return { canceledCount: canceled, orphanedDirectoriesRemoved: removed }
    })
  }

  /** Only a canceled close decision or a freshly opened Project may lift this fence. */
  releaseProjectFence(localProjectKey: string): void {
    validateProjectKey(localProjectKey)
    if (this.publicationUncertainProjects.has(localProjectKey)) {
      throw batchPublicationUncertain()
    }
    this.fencedProjects.delete(localProjectKey)
  }

  /** Internal Retry owns exact family/LaMa requalification; ordinary Retry cannot admit outpaint. */
  async retryPreparedOutpaintTerminal(
    id: string,
    expectedStatusSequence: number,
    options: {
      infillResolver: OutpaintInfillResolver
      modelService: AnimaGenerationModelResolver & GenerationModelResolver
      preflight: (input: GenerationQueueRetryPreflightInput) => Promise<void>
    },
  ): Promise<QueuedGenerationItem> {
    if (typeof options.preflight !== 'function') {
      throw new GenerationQueueError(
        'QUEUE_INPUT_INVALID',
        'Outpaint Retry needs capacity preflight.',
      )
    }
    const qualification = {
      infillResolver: options.infillResolver,
      modelService: options.modelService,
    }
    return await this.retryTerminalInternal(
      id,
      expectedStatusSequence,
      options.preflight,
      qualification,
    )
  }

  /**
   * Retry from the original frozen bytes, never from today's Project draft. A fresh queue item and
   * staging session keep an old candidate/receipt independent of this new attempt. The source row's
   * sequence is consumed atomically with insertion, so a stale second click cannot create another
   * retry even across repository instances.
   */
  async retryTerminal(
    id: string,
    expectedStatusSequence: number,
    preflight?: (input: GenerationQueueRetryPreflightInput) => Promise<void>,
  ): Promise<QueuedGenerationItem> {
    return await this.retryTerminalInternal(id, expectedStatusSequence, preflight)
  }

  private async cleanupPrunedInputs(root: string, ids: readonly string[]): Promise<void> {
    try {
      await this.testHooks.beforePruneInputCleanup?.()
      await removeInputDirectories(root, ids)
    } catch {
      // SQLite deletion is already durable. Report the committed outcome; startup recovery owns
      // remaining unreferenced inputs after an interrupted or denied filesystem cleanup.
      process.emitWarning('Generation queue input cleanup deferred until restart.', {
        code: 'GENERATION_INPUT_CLEANUP_DEFERRED',
      })
    }
  }

  private async ensureRoot(): Promise<string> {
    const parent = path.dirname(this.root)
    const canonicalParent = await realpath(parent)
    const parentEntry = await lstat(canonicalParent)
    if (
      !parentEntry.isDirectory() ||
      parentEntry.isSymbolicLink() ||
      (parentEntry.mode & 0o077) !== 0 ||
      (process.getuid?.() !== undefined && parentEntry.uid !== process.getuid())
    ) {
      throw new GenerationQueueError('QUEUE_STORAGE_UNSAFE', 'Application data root is unsafe.')
    }
    const privateRoot = path.join(canonicalParent, path.basename(this.root))
    await mkdir(privateRoot, { mode: 0o700, recursive: true })
    const canonical = await realpath(privateRoot)
    const entry = await lstat(privateRoot)
    if (
      canonical !== privateRoot ||
      !entry.isDirectory() ||
      entry.isSymbolicLink() ||
      (entry.mode & 0o077) !== 0 ||
      (process.getuid?.() !== undefined && entry.uid !== process.getuid())
    ) {
      throw new GenerationQueueError('QUEUE_STORAGE_UNSAFE', 'Generation input storage is unsafe.')
    }
    return canonical
  }

  private async hasReceipt(queueItemId: string): Promise<boolean> {
    return Boolean(
      await this.db
        .selectFrom('generation_candidate_receipt')
        .select('candidate_id')
        .where('queue_item_id', '=', queueItemId)
        .executeTakeFirst(),
    )
  }

  private async hasReservedReceipt(queueItemId: string): Promise<boolean> {
    return Boolean(
      await this.db
        .selectFrom('generation_candidate_receipt')
        .select('candidate_id')
        .where('queue_item_id', '=', queueItemId)
        .where('status', '=', 'reserved')
        .executeTakeFirst(),
    )
  }

  private async requireRow(id: string): Promise<Selectable<GenerationQueueItem>> {
    const row = await this.db
      .selectFrom('generation_queue_item')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst()
    if (!row) {
      throw new GenerationQueueError('QUEUE_ITEM_NOT_FOUND', 'The queue item was not found.')
    }
    return row
  }

  private async retryTerminalInternal(
    id: string,
    expectedStatusSequence: number,
    preflight?: (input: GenerationQueueRetryPreflightInput) => Promise<void>,
    outpaintQualification?: {
      infillResolver: OutpaintInfillResolver
      modelService: AnimaGenerationModelResolver & GenerationModelResolver
    },
  ): Promise<QueuedGenerationItem> {
    validateQueueId(id)
    validateExpectedSequence(expectedStatusSequence)
    return await this.serialize(async () => {
      this.assertReadyForDispatch()
      const source = await this.requireRow(id)
      if (
        source.status_sequence !== expectedStatusSequence ||
        (source.status !== 'failed' && source.status !== 'canceled')
      ) {
        throw statusConflict()
      }
      this.assertProjectCanEnqueue(source.local_project_key)
      if (await this.hasReceipt(id)) {
        throw publicationUncertain()
      }
      const canonicalPath = await canonicalProjectPath(source.canonical_project_path)
      if (
        canonicalPath !== source.canonical_project_path ||
        localProjectRecoveryKey(canonicalPath) !== source.local_project_key
      ) {
        throw new GenerationQueueError(
          'QUEUE_PROJECT_IDENTITY_CHANGED',
          'The Project path changed before retrying.',
        )
      }
      const verified = await this.verifyRow(source)
      if (isQueuedOutpaint(verified.payload)) {
        if (!outpaintQualification || !preflight) {
          throw new GenerationQueueError(
            'QUEUE_INPUT_INVALID',
            'Outpaint Retry requires its internal exact-resource owner.',
          )
        }
        await reverifyFrozenQueuedOutpaintGeneration(
          verified.payload,
          outpaintQualification.modelService,
          outpaintQualification.infillResolver,
        )
      } else if (outpaintQualification) {
        throw new GenerationQueueError('QUEUE_INPUT_INVALID', 'Expected an outpaint Retry source.')
      }
      const targetBytes = await readStableFile(
        verified.targetPath,
        verified.payload.workerJob.target.byteSize,
        verified.payload.workerJob.target.sha256,
      )
      const nextId = randomUUID()
      const nextBatchId = randomUUID()
      const nextSessionId = randomUUID()
      const now = new Date().toISOString()
      const nextRow: Selectable<GenerationQueueItem> = {
        batch_id: nextBatchId,
        canonical_project_path: canonicalPath,
        created_at: now,
        document_id: source.document_id,
        document_revision: source.document_revision,
        error_code: null,
        error_message: null,
        finished_at: null,
        frozen_payload_json: source.frozen_payload_json,
        id: nextId,
        local_project_key: source.local_project_key,
        operation: source.operation,
        staging_session_id: nextSessionId,
        started_at: null,
        status: 'pending',
        status_sequence: 0,
        updated_at: now,
      }
      const manifest: InputManifestV1 = {
        payloadSha256: sha256(Buffer.from(source.frozen_payload_json, 'utf8')),
        queueInputVersion: QUEUE_INPUT_VERSION,
        queueItemId: nextId,
        targetByteSize: targetBytes.length,
        targetFile: 'target.png',
        targetSha256: sha256(targetBytes),
      }
      const root = await this.ensureRoot()
      const temporary = await mkdtemp(path.join(root, '.tmp-'))
      const published = path.join(root, nextId)
      let renamed = false
      try {
        await writeDurableFile(path.join(temporary, 'target.png'), targetBytes)
        await writeDurableFile(
          path.join(temporary, 'manifest.json'),
          Buffer.from(JSON.stringify(manifest), 'utf8'),
        )
        await syncDirectory(temporary)
        await rename(temporary, published)
        renamed = true
        await syncDirectory(root)
        await this.testHooks.afterRetryInputPublish?.()
        this.assertProjectCanEnqueue(source.local_project_key)
        await preflight?.(
          Object.freeze({
            frozenPayloadJson: source.frozen_payload_json,
            queueItemId: nextId,
            source: Object.freeze(toItem(source)),
            stagingSessionId: nextSessionId,
          }),
        )
        this.assertProjectCanEnqueue(source.local_project_key)
        if (isQueuedOutpaint(verified.payload) && outpaintQualification) {
          await reverifyFrozenQueuedOutpaintGeneration(
            verified.payload,
            outpaintQualification.modelService,
            outpaintQualification.infillResolver,
          )
        }
        await this.db.transaction().execute(async (transaction) => {
          const consumed = await transaction
            .updateTable('generation_queue_item')
            .set({
              status_sequence: sql<number>`status_sequence + 1`,
              updated_at: now,
            })
            .where('id', '=', id)
            .where('status', '=', source.status)
            .where('status_sequence', '=', expectedStatusSequence)
            .where(
              sql<boolean>`NOT EXISTS (
                SELECT 1 FROM generation_candidate_receipt AS receipt
                WHERE receipt.queue_item_id = generation_queue_item.id
              )`,
            )
            .returning('id')
            .executeTakeFirst()
          if (!consumed) {
            throw statusConflict()
          }
          await transaction.insertInto('generation_queue_item').values(nextRow).execute()
          await this.testHooks.beforeRetryCommit?.()
          this.assertProjectCanEnqueue(source.local_project_key)
        })
        await this.testHooks.afterRetryCommit?.()
        return toItem(nextRow)
      } catch (error) {
        // A lost acknowledgement is success only when the exact immutable row is observable.
        // An unreadable or mismatched outcome retains its input and blocks further dispatch.
        if (renamed) {
          let committed: Selectable<GenerationQueueItem>[]
          try {
            committed = await this.db
              .selectFrom('generation_queue_item')
              .selectAll()
              .where('id', '=', nextId)
              .execute()
          } catch {
            this.publicationUncertainProjects.add(source.local_project_key)
            this.fencedProjects.add(source.local_project_key)
            throw batchPublicationUncertain()
          }
          if (batchRowsMatch(committed, [nextRow])) {
            return toItem(committed[0])
          }
          if (committed.length !== 0) {
            this.publicationUncertainProjects.add(source.local_project_key)
            this.fencedProjects.add(source.local_project_key)
            throw batchPublicationUncertain()
          }
        }
        await rm(renamed ? published : temporary, { force: true, recursive: true }).catch(
          (cleanupError: unknown) => {
            process.emitWarning(`Generation retry input cleanup failed: ${String(cleanupError)}`)
          },
        )
        throw error
      }
    })
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

  private async verifyRow(row: Selectable<GenerationQueueItem>): Promise<VerifiedQueuedInput> {
    const verified = await this.verifyRowWithBytes(row)
    return { item: verified.item, payload: verified.payload, targetPath: verified.targetPath }
  }

  private async verifyRowWithBytes(
    row: Selectable<GenerationQueueItem>,
  ): Promise<VerifiedQueuedInput & { targetPngBytes: Buffer }> {
    const id = row.id
    const root = await this.ensureRoot()
    const directory = path.join(root, id)
    const entry = await lstat(directory).catch(() => null)
    if (!entry?.isDirectory() || entry.isSymbolicLink()) {
      throw new GenerationQueueError(
        'QUEUE_INPUT_INVALID',
        'The queued input is missing or unsafe.',
      )
    }
    const payloadBytes = Buffer.from(row.frozen_payload_json, 'utf8')
    if (payloadBytes.length > MAX_PAYLOAD_BYTES) {
      throw new GenerationQueueError('QUEUE_INPUT_INVALID', 'The frozen queue payload is invalid.')
    }
    const payload = parsePayload(row.frozen_payload_json)
    if (
      payload.kind !== row.operation ||
      payload.context.documentId !== row.document_id ||
      payload.context.documentRevision !== row.document_revision ||
      !path.isAbsolute(row.canonical_project_path) ||
      path.resolve(row.canonical_project_path) !== row.canonical_project_path ||
      localProjectRecoveryKey(row.canonical_project_path) !== row.local_project_key
    ) {
      throw new GenerationQueueError('QUEUE_INPUT_INVALID', 'The frozen queue context changed.')
    }
    const expectedManifest: InputManifestV1 = {
      payloadSha256: sha256(payloadBytes),
      queueInputVersion: QUEUE_INPUT_VERSION,
      queueItemId: id,
      targetByteSize: payload.workerJob.target.byteSize,
      targetFile: 'target.png',
      targetSha256: payload.workerJob.target.sha256,
    }
    const manifestBytes = await readStableFile(path.join(directory, 'manifest.json'), null, null)
    if (manifestBytes.length > MAX_MANIFEST_BYTES) {
      throw new GenerationQueueError('QUEUE_INPUT_INVALID', 'The queued input manifest is invalid.')
    }
    let manifest: unknown
    try {
      manifest = JSON.parse(manifestBytes.toString('utf8'))
    } catch {
      throw new GenerationQueueError('QUEUE_INPUT_INVALID', 'The queued input manifest is invalid.')
    }
    if (!isDeepStrictEqual(manifest, expectedManifest)) {
      throw new GenerationQueueError('QUEUE_INPUT_INVALID', 'The queued input manifest changed.')
    }
    const targetPath = path.join(directory, 'target.png')
    const targetBytes = await readStableFile(
      targetPath,
      payload.workerJob.target.byteSize,
      payload.workerJob.target.sha256,
    )
    await validateTargetPng(targetBytes, payload.context)
    return { item: toItem(row), payload, targetPath, targetPngBytes: targetBytes }
  }
}

/** Strict operational parser shared by queue reload and candidate recovery. */
export function parseFrozenGenerationPayloadV1(json: string): FrozenQueuedGenerationV1 {
  if (typeof json !== 'string' || Buffer.byteLength(json, 'utf8') > MAX_PAYLOAD_BYTES) {
    throw new GenerationQueueError('QUEUE_INPUT_INVALID', 'The frozen queue payload is invalid.')
  }
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch {
    throw new GenerationQueueError('QUEUE_INPUT_INVALID', 'The frozen queue payload is invalid.')
  }
  if (typeof value === 'object' && value !== null && 'kind' in value) {
    if (value.kind === 'anima-outpaint') {
      try {
        return parseFrozenQueuedAnimaOutpaintV1(json)
      } catch {
        throw new GenerationQueueError(
          'QUEUE_INPUT_INVALID',
          'The frozen outpaint input is invalid.',
        )
      }
    }
    if (value.kind === 'illustrious-outpaint') {
      const parsed = v.safeParse(FrozenIllustriousOutpaintPayloadSchema, value)
      if (
        !parsed.success ||
        !payloadFieldsAgree(parsed.output) ||
        !outpaintContextFieldsAgree(parsed.output.context)
      ) {
        throw new GenerationQueueError(
          'QUEUE_INPUT_INVALID',
          'The frozen outpaint input is invalid.',
        )
      }
      return parsed.output
    }
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    'kind' in value &&
    (value.kind === 'anima-txt2img' || value.kind === 'anima-img2img')
  ) {
    try {
      return parseFrozenQueuedAnimaGenerationV1(json)
    } catch {
      throw new GenerationQueueError('QUEUE_INPUT_INVALID', 'The frozen queue payload is invalid.')
    }
  }
  return parseIllustriousPayload(json)
}

/** Derive concrete numerical fields only; no current public command is fabricated for outpaint. */
export function buildFrozenQueuedOutpaintV1(
  prepared: PreparedOutpaintGeneration,
  originRequestId: string,
): FrozenQueuedOutpaintV1 {
  const context = structuredClone(prepared.context)
  if (context.kind === 'anima-outpaint-preparation') {
    return buildFrozenQueuedAnimaOutpaintV1(context, originRequestId)
  }
  const { colorSpace: _space, format: _format, ...target } = context.target
  const payload = parseFrozenGenerationPayloadV1(
    JSON.stringify({
      context,
      kind: 'illustrious-outpaint',
      originRequestId,
      schemaVersion: 1,
      workerJob: {
        bbox: context.bbox,
        checkpoint: {
          path: context.model.managedPath,
          predictionType: context.model.reference.predictionType,
          sha256: context.model.reference.fileSha256,
        },
        ...(context.embeddings !== undefined ? { embeddings: workerEmbeddings(context) } : {}),
        ...(context.loras !== undefined ? { loras: workerLoras(context) } : {}),
        ...(context.vae !== undefined ? { vae: workerVae(context) } : {}),
        ...(context.vaePrecision !== undefined ? { vaePrecision: context.vaePrecision } : {}),
        prompts: context.prompts,
        sampling: {
          cfgScale: context.sampling.cfgScale,
          ...(context.sampling.cfgRescale !== undefined
            ? { cfgRescale: context.sampling.cfgRescale }
            : {}),
          denoisingStrength: context.sampling.denoisingStrength,
          scheduler: context.sampling.invokeScheduler,
          seed: context.sampling.seed,
          steps: context.sampling.steps,
        },
        schemaVersion: 1,
        target,
      },
    }),
  )
  if (payload.kind !== 'illustrious-outpaint') {
    throw new GenerationQueueError('QUEUE_INPUT_INVALID', 'Expected an Illustrious outpaint job.')
  }
  return payload
}

/** Force-qualify exact family and common infill files; neither Library Default nor draft is read. */
export async function reverifyFrozenQueuedOutpaintGeneration(
  input: FrozenQueuedOutpaintV1,
  models: AnimaGenerationModelResolver & GenerationModelResolver,
  infillResolver: OutpaintInfillResolver,
): Promise<void> {
  const parsed = parseFrozenGenerationPayloadV1(JSON.stringify(input))
  if (!isQueuedOutpaint(parsed)) {
    throw new GenerationQueueError('QUEUE_INPUT_INVALID', 'Expected a frozen outpaint job.')
  }
  if (parsed.kind === 'anima-outpaint') {
    const model = await models.resolveVerifiedGenerationAnimaBundleForPlan(
      parsed.context.model.checkpoint.reference,
    )
    if (!isDeepStrictEqual(model, parsed.context.model)) {
      throw new GenerationQueueError('QUEUE_INPUT_INVALID', 'The frozen Anima bundle changed.')
    }
    for (const entry of parsed.context.loras) {
      const actual = await models.resolveVerifiedAnimaGenerationLoraForPlan(entry.reference)
      if (
        !isDeepStrictEqual(actual, {
          byteSize: entry.byteSize,
          managedPath: entry.managedPath,
          reference: entry.reference,
        })
      ) {
        throw new GenerationQueueError('QUEUE_INPUT_INVALID', 'The frozen Anima LoRA changed.')
      }
    }
  } else {
    const model = await models.resolveVerifiedGenerationCheckpointForPlan(
      parsed.context.model.reference,
    )
    if (
      model.managedPath !== parsed.context.model.managedPath ||
      !isDeepStrictEqual(model.reference, parsed.context.model.reference)
    ) {
      throw new GenerationQueueError('QUEUE_INPUT_INVALID', 'The frozen checkpoint changed.')
    }
    await reverifyFrozenGenerationLoras(parsed.context, models)
    await reverifyFrozenGenerationVae(parsed.context, models)
    await reverifyFrozenGenerationEmbeddings(parsed.context, models)
  }
  const infill = await infillResolver.resolveVerifiedOutpaintInfill()
  if (
    infill.role !== parsed.context.conditioning.infillResource.role ||
    infill.sha256 !== parsed.context.conditioning.infillResource.sha256 ||
    infill.byteSize !== parsed.context.conditioning.infillResource.byteSize ||
    !path.isAbsolute(infill.managedPath) ||
    path.resolve(infill.managedPath) !== infill.managedPath
  ) {
    throw new GenerationQueueError(
      'QUEUE_INPUT_INVALID',
      'The frozen outpaint infill resource changed.',
    )
  }
}

function validateQueueId(id: string): void {
  if (typeof id !== 'string' || !UUID_PATTERN.test(id)) {
    throw new GenerationQueueError('QUEUE_ITEM_NOT_FOUND', 'The queue item was not found.')
  }
}
function comparableBatchContext(context: FrozenNormalGenerationPreparationV1) {
  // Concrete branches may activate different captured embeddings. Original authoring refs must
  // still agree across the group; each active projection is checked before publication.
  const { embeddings: _effectiveEmbeddings, ...common } = context
  return {
    ...common,
    prompts: { negative: '', positive: '' },
    sampling: { ...context.sampling, seed: 0 },
  }
}

/** Active subsets vary by branch, but a captured literal cannot change files within one batch. */
function batchEmbeddingFilesAgree(
  contexts: readonly (FrozenNormalGenerationPreparationV1 | FrozenNormalOutpaintPreparationV1)[],
): boolean {
  const captured = new Map<
    string,
    NonNullable<FrozenNormalGenerationPreparationV1['embeddings']>['positive'][number]
  >()
  for (const context of contexts) {
    for (const polarity of ['positive', 'negative'] as const) {
      for (const entry of context.embeddings?.[polarity] ?? []) {
        const key = JSON.stringify([polarity, entry.token])
        const prior = captured.get(key)
        if (prior && !isDeepStrictEqual(prior, entry)) {
          return false
        }
        captured.set(key, entry)
      }
    }
  }
  return true
}

function frozenPayload(
  context: FrozenNormalGenerationPreparationV1,
  request: IllustriousGenerationRequestV1,
): FrozenQueuedIllustriousGenerationV1 {
  const target = {
    byteSize: request.job.target.byteSize,
    height: request.job.target.height,
    iccSha256: request.job.target.iccSha256,
    sha256: request.job.target.sha256,
    width: request.job.target.width,
  }
  if (
    context.kind === 'normal-img2img-preparation' &&
    request.type === 'generate-illustrious-img2img'
  ) {
    const job = {
      ...(request.job.embeddings !== undefined ? { embeddings: request.job.embeddings } : {}),
      ...(request.job.loras !== undefined ? { loras: request.job.loras } : {}),
      ...(request.job.vae !== undefined ? { vae: request.job.vae } : {}),
      ...(request.job.vaePrecision !== undefined ? { vaePrecision: request.job.vaePrecision } : {}),
      bbox: request.job.bbox,
      checkpoint: request.job.checkpoint,
      prompts: request.job.prompts,
      sampling: request.job.sampling,
      schemaVersion: request.job.schemaVersion,
    }
    return {
      context,
      kind: 'illustrious-img2img',
      originRequestId: request.requestId,
      schemaVersion: 1,
      workerJob: { ...job, target },
    }
  }
  if (
    context.kind === 'normal-txt2img-preparation' &&
    request.type === 'generate-illustrious-txt2img'
  ) {
    const job = {
      ...(request.job.embeddings !== undefined ? { embeddings: request.job.embeddings } : {}),
      ...(request.job.loras !== undefined ? { loras: request.job.loras } : {}),
      ...(request.job.vae !== undefined ? { vae: request.job.vae } : {}),
      ...(request.job.vaePrecision !== undefined ? { vaePrecision: request.job.vaePrecision } : {}),
      bbox: request.job.bbox,
      checkpoint: request.job.checkpoint,
      prompts: request.job.prompts,
      sampling: request.job.sampling,
      schemaVersion: request.job.schemaVersion,
    }
    return {
      context,
      kind: 'illustrious-txt2img',
      originRequestId: request.requestId,
      schemaVersion: 1,
      workerJob: { ...job, target },
    }
  }
  throw new GenerationQueueError('QUEUE_INPUT_INVALID', 'The context and worker operation differ.')
}

function denoisingFieldsAgree(
  context: FrozenNormalGenerationPreparationV1 | FrozenNormalOutpaintPreparationV1,
  sampling: IllustriousGenerationRequestV1['job']['sampling'],
): boolean {
  return context.kind !== 'normal-txt2img-preparation'
    ? 'denoisingStrength' in sampling &&
        sampling.denoisingStrength === context.sampling.denoisingStrength
    : !('denoisingStrength' in sampling)
}

function outpaintContextFieldsAgree(
  context: FrozenNormalOutpaintPreparationV1 | FrozenQueuedAnimaOutpaintContextV1,
): boolean {
  const source = context.conditioning.sourceTarget
  return (
    isDeepStrictEqual(context.conditioning.bbox, context.bbox) &&
    source.byteSize === context.target.byteSize &&
    source.sha256 === context.target.sha256 &&
    source.iccSha256 === context.target.iccSha256 &&
    source.width === context.target.width &&
    source.height === context.target.height
  )
}

/** A fresh qualification boundary shares expensive exact-file reads, never a previous admission. */
function memoizedOutpaintQualification(
  models: AnimaGenerationModelResolver & GenerationModelResolver,
  infill: OutpaintInfillResolver,
) {
  const memoizedModels: AnimaGenerationModelResolver & GenerationModelResolver = {
    assertNoUnboundGenerationEmbeddings: models.assertNoUnboundGenerationEmbeddings.bind(models),
    resolveVerifiedAnimaGenerationLoraForPlan: memoizedResourceResolution(
      models.resolveVerifiedAnimaGenerationLoraForPlan.bind(models),
    ),
    resolveVerifiedGenerationAnimaBundleForPlan: memoizedResourceResolution(
      models.resolveVerifiedGenerationAnimaBundleForPlan.bind(models),
    ),
    resolveVerifiedGenerationCheckpointForPlan: memoizedResourceResolution(
      models.resolveVerifiedGenerationCheckpointForPlan.bind(models),
    ),
    resolveVerifiedGenerationEmbeddingForPlan: memoizedResourceResolution(
      models.resolveVerifiedGenerationEmbeddingForPlan.bind(models),
    ),
    resolveVerifiedGenerationLoraForPlan: memoizedResourceResolution(
      models.resolveVerifiedGenerationLoraForPlan.bind(models),
    ),
    resolveVerifiedGenerationVaeForPlan: memoizedResourceResolution(
      models.resolveVerifiedGenerationVaeForPlan.bind(models),
    ),
  }
  let verifiedInfill:
    ReturnType<OutpaintInfillResolver['resolveVerifiedOutpaintInfill']> | undefined
  return {
    infill: {
      resolveVerifiedOutpaintInfill: () => {
        verifiedInfill ??= infill.resolveVerifiedOutpaintInfill()
        return verifiedInfill
      },
    },
    models: memoizedModels,
  }
}

function memoizedResourceResolution<Argument, Result>(
  resolve: (reference: Argument) => Promise<Result>,
): (reference: Argument) => Promise<Result> {
  const pending = new Map<string, Promise<Result>>()
  return (reference) => {
    const key = JSON.stringify(reference)
    let result = pending.get(key)
    if (!result) {
      result = resolve(structuredClone(reference))
      pending.set(key, result)
    }
    return result
  }
}

function comparableOutpaintBatchContext(payload: FrozenQueuedOutpaintV1) {
  const { prompts: _prompts, sampling, ...context } = payload.context
  if ('embeddings' in context) {
    const { embeddings: _effective, ...authoring } = context
    return { context: authoring, kind: payload.kind, sampling: { ...sampling, seed: 0 } }
  }
  return { context, kind: payload.kind, sampling: { ...sampling, seed: 0 } }
}

function frozenBatchPayloadJson(
  context: FrozenNormalGenerationPreparationV1,
  request: IllustriousGenerationRequestV1,
): string {
  const payload = frozenPayload(context, request)
  const json = JSON.stringify(payload)
  if (Buffer.byteLength(json, 'utf8') > MAX_PAYLOAD_BYTES) {
    throw new GenerationQueueError('QUEUE_INPUT_INVALID', 'The frozen job is too large.')
  }
  parsePayload(json)
  return json
}

function batchRowsMatch(
  actual: readonly Selectable<GenerationQueueItem>[],
  expected: readonly Selectable<GenerationQueueItem>[],
): boolean {
  const keys = [
    'id',
    'batch_id',
    'canonical_project_path',
    'created_at',
    'document_id',
    'document_revision',
    'frozen_payload_json',
    'local_project_key',
    'operation',
    'staging_session_id',
  ] as const
  return (
    actual.length === expected.length &&
    expected.every((entry) => {
      const row = actual.find((item) => item.id === entry.id)
      return row !== undefined && keys.every((key) => row[key] === entry[key])
    })
  )
}

function batchPublicationUncertain(): GenerationQueueError {
  return new GenerationQueueError(
    'QUEUE_PUBLICATION_UNCERTAIN',
    'The batch publication outcome is unknown. Restart recovery is required before this Project can generate again.',
  )
}

async function removeUnregisteredBatchDirectories(
  directories: readonly string[],
  root: string,
): Promise<void> {
  try {
    for (const directory of directories) {
      await rm(directory, { force: true, recursive: true })
    }
    await syncDirectory(root)
  } catch {
    process.emitWarning('Unregistered generation batch input cleanup deferred until restart.', {
      code: 'GENERATION_INPUT_CLEANUP_DEFERRED',
    })
  }
}

function validateProjectKey(localProjectKey: string): void {
  if (typeof localProjectKey !== 'string' || !PROJECT_KEY_PATTERN.test(localProjectKey)) {
    throw new GenerationQueueError(
      'QUEUE_PROJECT_IDENTITY_CHANGED',
      'The Project identity is invalid.',
    )
  }
}

function validateExpectedSequence(sequence: number): void {
  if (!Number.isSafeInteger(sequence) || sequence < 0 || sequence >= Number.MAX_SAFE_INTEGER) {
    throw statusConflict()
  }
}

function isTerminalStatus(value: string): value is TerminalGenerationStatus {
  return value === 'canceled' || value === 'completed' || value === 'failed'
}

function noReservedReceipt() {
  return sql<boolean>`NOT EXISTS (
    SELECT 1 FROM generation_candidate_receipt AS receipt
    WHERE receipt.queue_item_id = generation_queue_item.id AND receipt.status = 'reserved'
  )`
}

function publicationUncertain(): GenerationQueueError {
  return new GenerationQueueError(
    'QUEUE_PUBLICATION_UNCERTAIN',
    'Candidate publication needs recovery before this queue item can change.',
  )
}

function statusConflict(): GenerationQueueError {
  return new GenerationQueueError(
    'QUEUE_STATUS_CONFLICT',
    'The queue item changed before this operation completed.',
  )
}

function validateNormalizedFailure(error: NormalizedQueueFailure): NormalizedQueueFailure {
  const code = error?.code
  const message = error?.message
  if (
    typeof code !== 'string' ||
    !/^[A-Z][A-Z0-9_]{0,63}$/.test(code) ||
    code === 'APP_RESTART' ||
    code === 'USER_CANCELED' ||
    typeof message !== 'string' ||
    message.length < 1 ||
    Buffer.byteLength(message, 'utf8') > 1024 ||
    /[\u0000-\u001F\u007F]/.test(message)
  ) {
    throw new GenerationQueueError('QUEUE_FAILURE_INVALID', 'The worker failure is invalid.')
  }
  return { code, message }
}

function validateSnapshot(
  context: FrozenNormalGenerationPreparationV1,
  request: IllustriousGenerationRequestV1,
  bytes: Buffer,
  stagingSessionId: string,
): void {
  if (
    !v.safeParse(FrozenContextSchema, context).success ||
    !v.safeParse(SourceRequestSchema, request).success
  ) {
    throw new GenerationQueueError('QUEUE_INPUT_INVALID', 'The qualified request is invalid.')
  }
  const target = request.job.target
  if (
    request.type !==
      (context.kind === 'normal-img2img-preparation'
        ? 'generate-illustrious-img2img'
        : 'generate-illustrious-txt2img') ||
    !denoisingFieldsAgree(context, request.job.sampling) ||
    !frozenEmbeddingFieldsAgree(context, request.job.embeddings) ||
    !frozenLoraFieldsAgree(context, request.job.loras) ||
    !frozenVaeFieldsAgree(context, request.job.vae) ||
    request.job.vaePrecision !== context.vaePrecision ||
    context.schemaVersion !== 1 ||
    request.protocolVersion !== '1' ||
    request.job.schemaVersion !== 1 ||
    !UUID_PATTERN.test(context.documentId) ||
    !UUID_PATTERN.test(context.documentRevision) ||
    !UUID_PATTERN.test(request.requestId) ||
    !UUID_PATTERN.test(stagingSessionId) ||
    !path.isAbsolute(target.path) ||
    path.resolve(target.path) !== target.path ||
    request.job.output.stagingRoot !== path.dirname(target.path) ||
    request.job.output.pngPath !== path.join(request.job.output.stagingRoot, 'result.png') ||
    !isDeepStrictEqual(request.job.bbox, context.bbox) ||
    !isDeepStrictEqual(request.job.prompts, context.prompts) ||
    request.job.checkpoint.path !== context.model.managedPath ||
    request.job.checkpoint.sha256 !== context.model.reference.fileSha256 ||
    request.job.checkpoint.predictionType !== context.model.reference.predictionType ||
    (request.job.sampling.cfgRescale ?? 0) !== (context.sampling.cfgRescale ?? 0) ||
    request.job.sampling.cfgScale !== context.sampling.cfgScale ||
    request.job.sampling.scheduler !== context.sampling.invokeScheduler ||
    request.job.sampling.seed !== context.sampling.seed ||
    request.job.sampling.steps !== context.sampling.steps ||
    target.byteSize !== context.target.byteSize ||
    target.width !== context.target.width ||
    target.height !== context.target.height ||
    target.iccSha256 !== IGS_SRGB_ICC_SHA256 ||
    target.iccSha256 !== context.target.iccSha256 ||
    target.sha256 !== context.target.sha256 ||
    !SHA256_PATTERN.test(target.sha256) ||
    bytes.length < 1 ||
    bytes.length > MAX_TARGET_BYTES ||
    bytes.length !== target.byteSize ||
    sha256(bytes) !== target.sha256
  ) {
    throw new GenerationQueueError(
      'QUEUE_INPUT_INVALID',
      'The qualified request is not frozen input.',
    )
  }
}
const parsePayload = parseFrozenGenerationPayloadV1

function parseIllustriousPayload(json: string): FrozenQueuedIllustriousGenerationV1 {
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch {
    throw new GenerationQueueError('QUEUE_INPUT_INVALID', 'The frozen queue payload is invalid.')
  }
  const parsed = v.safeParse(FrozenIllustriousPayloadSchema, value)
  if (!parsed.success || !payloadFieldsAgree(parsed.output)) {
    throw new GenerationQueueError('QUEUE_INPUT_INVALID', 'The frozen queue payload is invalid.')
  }
  return parsed.output
}

function payloadFieldsAgree(
  payload: FrozenQueuedIllustriousGenerationV1 | FrozenQueuedIllustriousOutpaintV1,
): boolean {
  const { context, workerJob } = payload
  const scheduler = resolveIllustriousScheduler(
    context.sampling.sampler,
    context.sampling.scheduler,
  )
  return (
    denoisingFieldsAgree(context, workerJob.sampling) &&
    frozenEmbeddingFieldsAgree(context, workerJob.embeddings) &&
    frozenLoraFieldsAgree(context, workerJob.loras) &&
    frozenVaeFieldsAgree(context, workerJob.vae) &&
    workerJob.vaePrecision === context.vaePrecision &&
    path.isAbsolute(context.model.managedPath) &&
    path.resolve(context.model.managedPath) === context.model.managedPath &&
    workerJob.checkpoint.path === context.model.managedPath &&
    workerJob.checkpoint.sha256 === context.model.reference.fileSha256 &&
    workerJob.checkpoint.predictionType === context.model.reference.predictionType &&
    isDeepStrictEqual(workerJob.bbox, context.bbox) &&
    isDeepStrictEqual(workerJob.prompts, context.prompts) &&
    (workerJob.sampling.cfgRescale ?? 0) === (context.sampling.cfgRescale ?? 0) &&
    workerJob.sampling.cfgScale === context.sampling.cfgScale &&
    workerJob.sampling.seed === context.sampling.seed &&
    workerJob.sampling.steps === context.sampling.steps &&
    workerJob.sampling.scheduler === context.sampling.invokeScheduler &&
    scheduler.kind === 'supported' &&
    scheduler.key === workerJob.sampling.scheduler &&
    workerJob.target.byteSize === context.target.byteSize &&
    workerJob.target.height === context.target.height &&
    workerJob.target.width === context.target.width &&
    workerJob.target.sha256 === context.target.sha256 &&
    context.target.width === context.bbox.width &&
    context.target.height === context.bbox.height
  )
}

async function validateTargetPng(
  bytes: Buffer,
  context:
    | FrozenNormalGenerationPreparationV1
    | FrozenNormalOutpaintPreparationV1
    | FrozenQueuedAnimaGenerationContextV1
    | FrozenQueuedAnimaOutpaintContextV1,
): Promise<void> {
  let actualMode: ReturnType<typeof classifyTargetPngAlpha>
  try {
    await validateSrgbPngStream(
      (async function* () {
        yield bytes
      })(),
      'target.png',
      MAX_TARGET_BYTES,
      Math.max(context.bbox.width, context.bbox.height),
    )
    actualMode = classifyTargetPngAlpha(bytes, context.bbox.width, context.bbox.height)
  } catch {
    throw new GenerationQueueError(
      'QUEUE_INPUT_INVALID',
      'The queued target is not a valid sRGB PNG.',
    )
  }
  if (
    bytes.readUInt32BE(16) !== context.bbox.width ||
    bytes.readUInt32BE(20) !== context.bbox.height ||
    bytes[25] !== 6 ||
    !hasIccProfile(bytes) ||
    actualMode !==
      (context.kind === 'normal-outpaint-preparation' ||
      context.kind === 'anima-outpaint-preparation'
        ? 'outpaint'
        : context.kind === 'normal-img2img-preparation' ||
            context.kind === 'anima-img2img-preparation'
          ? 'img2img'
          : 'txt2img')
  ) {
    throw new GenerationQueueError('QUEUE_INPUT_INVALID', 'The queued target has wrong PNG pixels.')
  }
  if ('conditioning' in context) {
    try {
      await assertFrozenAlphaOutpaintConditioning(context.conditioning, bytes)
      if (!outpaintContextFieldsAgree(context)) {
        throw new Error('The source differs.')
      }
    } catch {
      throw new GenerationQueueError(
        'QUEUE_INPUT_INVALID',
        'The frozen alpha conditioning changed.',
      )
    }
  }
}

function hasIccProfile(png: Buffer): boolean {
  let offset = 8
  while (offset + 12 <= png.length) {
    const size = png.readUInt32BE(offset)
    if (png.toString('ascii', offset + 4, offset + 8) === 'iCCP') {
      return true
    }
    offset += size + 12
  }
  return false
}

async function readStableFile(
  filePath: string,
  expectedBytes: number | null,
  expectedSha256: string | null,
): Promise<Buffer> {
  let file
  try {
    file = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  } catch {
    throw new GenerationQueueError('QUEUE_INPUT_INVALID', 'The queued input file is unavailable.')
  }
  try {
    const before = await file.stat({ bigint: true })
    if (
      !before.isFile() ||
      before.size < 1n ||
      before.size > BigInt(expectedBytes ?? MAX_MANIFEST_BYTES) ||
      (expectedBytes !== null && before.size !== BigInt(expectedBytes))
    ) {
      throw new GenerationQueueError('QUEUE_INPUT_INVALID', 'The queued input file is invalid.')
    }
    // The initial stat does not bound a later readFile(): a concurrent writer can grow the file.
    // Keep both allocation and every descriptor read within the captured ceiling plus one sentinel.
    const ceiling = expectedBytes ?? MAX_MANIFEST_BYTES
    const buffer = Buffer.allocUnsafe(ceiling + 1)
    let offset = 0
    while (offset < buffer.length) {
      const { bytesRead } = await file.read(
        buffer,
        offset,
        Math.min(64 * 1024, buffer.length - offset),
        null,
      )
      if (bytesRead === 0) {
        break
      }
      offset += bytesRead
    }
    if (offset > ceiling) {
      throw new GenerationQueueError('QUEUE_INPUT_INVALID', 'The queued input file grew.')
    }
    const bytes = buffer.subarray(0, offset)
    const after = await file.stat({ bigint: true })
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
      (expectedBytes !== null && bytes.length !== expectedBytes) ||
      (expectedSha256 !== null && sha256(bytes) !== expectedSha256)
    ) {
      throw new GenerationQueueError('QUEUE_INPUT_INVALID', 'The queued input file changed.')
    }
    return bytes
  } finally {
    await file.close()
  }
}

async function writeDurableFile(filePath: string, bytes: Buffer): Promise<void> {
  const file = await open(filePath, 'wx', 0o600)
  try {
    await file.writeFile(bytes)
    await file.sync()
  } finally {
    await file.close()
  }
}

async function syncDirectory(directory: string): Promise<void> {
  const file = await open(
    directory,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  )
  try {
    await file.sync()
  } finally {
    await file.close()
  }
}

/** The row is already gone; failure leaves only an app-owned orphan for restart recovery. */
async function removeInputDirectories(root: string, ids: readonly string[]): Promise<void> {
  for (const id of ids) {
    const candidate = path.join(root, id)
    const entry = await lstat(candidate).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        return null
      }
      throw error
    })
    if (!entry) {
      continue
    }
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      throw new GenerationQueueError(
        'QUEUE_STORAGE_UNSAFE',
        'Generation input storage contains an unsafe entry.',
      )
    }
    await rm(candidate, { force: true, recursive: true })
  }
  await syncDirectory(root)
}

function toManagerEntry(
  row: Selectable<GenerationQueueItem>,
  publicationPending: boolean,
  indexedName?: string,
): GenerationQueueEntry {
  const item = toItem(row)
  if (
    ![
      'anima-img2img',
      'anima-outpaint',
      'anima-txt2img',
      'illustrious-img2img',
      'illustrious-outpaint',
      'illustrious-txt2img',
    ].includes(row.operation) ||
    !v.is(UuidSchema, row.document_id)
  ) {
    throw new GenerationQueueError('QUEUE_INPUT_INVALID', 'The queue identity is invalid.')
  }
  const extension = path.extname(row.canonical_project_path)
  return {
    batchId: item.batchId,
    cancelRequested: item.cancelRequested,
    createdAt: item.createdAt,
    details: managerDetails(row),
    documentId: row.document_id,
    error: managerError(row),
    finishedAt: row.finished_at,
    id: item.id,
    operation: row.operation as GenerationQueueEntry['operation'],
    projectKey: item.localProjectKey,
    projectName:
      indexedName ??
      (path.basename(
        row.canonical_project_path,
        extension.toLowerCase() === '.igs' ? extension : undefined,
      ) ||
        'Untitled Project'),
    publicationPending,
    stagingSessionId: item.stagingSessionId,
    startedAt: row.started_at,
    status: item.status,
    statusSequence: item.statusSequence,
  }
}

function managerDetails(row: Selectable<GenerationQueueItem>): GenerationQueueEntry['details'] {
  try {
    if (Buffer.byteLength(row.frozen_payload_json, 'utf8') > MAX_PAYLOAD_BYTES) {
      return null
    }
    const payload = parsePayload(row.frozen_payload_json)
    if (
      payload.kind !== row.operation ||
      payload.context.documentId !== row.document_id ||
      payload.context.documentRevision !== row.document_revision
    ) {
      return null
    }
    if (
      payload.kind === 'anima-txt2img' ||
      payload.kind === 'anima-img2img' ||
      payload.kind === 'anima-outpaint'
    ) {
      const { context } = payload
      return {
        modelName: context.model.checkpoint.reference.displayName,
        modelVersion: context.model.checkpoint.reference.versionName,
        negativePrompt: context.prompts.negative,
        prompt: context.prompts.positive,
        sampling: {
          animaMethod: context.sampling.animaMethod,
          cfgScale: context.sampling.cfgScale,
          ...(context.kind !== 'anima-txt2img-preparation'
            ? { denoisingStrength: context.sampling.denoisingStrength }
            : {}),
          seed: context.sampling.seed,
          steps: context.sampling.steps,
        },
        size: { height: context.bbox.height, width: context.bbox.width },
      }
    }
    const { context } = payload
    if (
      context.sampling.sampler === null ||
      context.sampling.scheduler === null ||
      context.model.reference.predictionType === null
    ) {
      return null
    }
    return {
      modelName: context.model.reference.displayName,
      modelVersion: context.model.reference.versionName,
      negativePrompt: context.prompts.negative,
      prompt: context.prompts.positive,
      sampling: {
        ...(context.sampling.cfgRescale !== undefined
          ? { cfgRescale: context.sampling.cfgRescale }
          : {}),
        ...(context.kind !== 'normal-txt2img-preparation'
          ? { denoisingStrength: context.sampling.denoisingStrength }
          : {}),
        cfgScale: context.sampling.cfgScale,
        predictionType: context.model.reference.predictionType,
        sampler: context.sampling.sampler,
        scheduler: context.sampling.scheduler,
        seed: context.sampling.seed,
        steps: context.sampling.steps,
      },
      size: { height: context.bbox.height, width: context.bbox.width },
    }
  } catch {
    // Invalid frozen display data must not hide the status or terminal cleanup actions.
    return null
  }
}

/** Stored messages can include arbitrary worker paths. Only main-owned literals enter the DTO. */
function managerError(row: Selectable<GenerationQueueItem>): GenerationQueueEntry['error'] {
  if (row.error_code === null) {
    return null
  }
  const code = /^[A-Z][A-Z0-9_]{0,127}$/.test(row.error_code) ? row.error_code : 'GENERATION_FAILED'
  const messages: Record<string, string> = {
    APP_RESTART: 'The application closed before this job completed.',
    GENERATION_INPUT_CHANGED: 'The frozen generation input could not be verified.',
    GENERATION_OUTPAINT_UNAVAILABLE:
      'Normal outpaint dispatch and RGBA contribution publication are not integrated yet.',
    GENERATION_WORKER_FAILED: 'The generation worker did not return a valid completed result.',
    QUEUE_INPUT_INVALID: 'The frozen queue input is invalid.',
    USER_CANCELED: row.status === 'running' ? 'Cancellation requested.' : 'The job was canceled.',
  }
  return {
    code,
    message: messages[code] ?? 'The generation job could not be completed.',
  }
}

function toItem(row: Selectable<GenerationQueueItem>): QueuedGenerationItem {
  if (
    !Number.isSafeInteger(row.status_sequence) ||
    row.status_sequence < 0 ||
    row.status_sequence >= Number.MAX_SAFE_INTEGER ||
    (row.status !== 'pending' &&
      row.status !== 'running' &&
      row.status !== 'completed' &&
      row.status !== 'failed' &&
      row.status !== 'canceled')
  ) {
    throw new GenerationQueueError('QUEUE_INPUT_INVALID', 'The queue status is invalid.')
  }
  return {
    batchId: row.batch_id,
    cancelRequested: row.status === 'running' && row.error_code === 'USER_CANCELED',
    createdAt: row.created_at,
    id: row.id,
    localProjectKey: row.local_project_key,
    projectPath: row.canonical_project_path,
    stagingSessionId: row.staging_session_id,
    status: row.status,
    statusSequence: row.status_sequence,
  }
}
