import type { SetCheckpointNoiseProfileChange } from '../../shared/api.js'
import type { IllustriousNoiseProfileV1 } from '../../shared/projects/illustrious-noise-profile.js'

import type { Kysely, Transaction } from 'kysely'

import { randomUUID } from 'node:crypto'
import { lstatSync } from 'node:fs'
import path from 'node:path'

import type { DB } from '../db/database.types.js'

export type ModelResourceType =
  'checkpoint' | 'embedding' | 'lora' | 'qwen3_encoder' | 'upscaler' | 'vae'
export type BaseModelFamily = 'anima' | 'illustrious'
export type ModelPredictionType = 'epsilon' | 'sample' | 'v_prediction'
export type ModelFileStatus = 'corrupt' | 'missing' | 'ready'
export type AnimaDependencyRole = 'qwen3_encoder' | 'vae'

export type ModelSource =
  { key: string; kind: 'supported_dependency' } | { kind: 'civitai'; modelId: number }

export type ModelVersionSource =
  | { expectedSha256: string; kind: 'supported_dependency'; revision: string }
  | { expectedSha256?: string | null; fileId: number; kind: 'civitai'; versionId: number }

export interface ModelResourceDraft {
  creator?: string | null
  description?: string | null
  displayName: string
  previewUrl?: string | null
  source: ModelSource
  sourceCheckedAt?: string | null
  sourceMetadata: Record<string, unknown>
  type: ModelResourceType
}

export interface ModelVersionDraft {
  baseModelFamily: BaseModelFamily | null
  format: string
  name: string
  /** Remains null until an authoritative model probe has identified it. */
  predictionType?: ModelPredictionType | null
  source: ModelVersionSource
  sourceMetadata: Record<string, unknown>
}

/** The installer has already downloaded and hashed this managed file. */
export interface VerifiedLocalModelFile {
  managedPath: string
  originalFilename: string
  sha256: string
  sizeBytes: number
  verifiedAt: string
}

export interface VerifiedModelArtifact {
  file: VerifiedLocalModelFile
  resource: ModelResourceDraft
  version: ModelVersionDraft
}

export type ModelDependencyInput =
  | { artifact: VerifiedModelArtifact; existingVersionId?: never; role: AnimaDependencyRole }
  | { artifact?: never; existingVersionId: string; repairFile?: never; role: AnimaDependencyRole }
  | {
      artifact?: never
      existingVersionId: string
      repairFile: VerifiedLocalModelFile
      role: AnimaDependencyRole
    }

export interface PublishVerifiedInstallationInput {
  dependencies?: ModelDependencyInput[]
  jobId?: string
  primary: VerifiedModelArtifact
}

export interface PublishedInstallation {
  dependencyVersionIds: Partial<Record<AnimaDependencyRole, string>>
  fileId: string
  resourceId: string
  versionId: string
}

export interface RepairVerifiedVersionInput {
  dependencyRepairs?: {
    file: VerifiedLocalModelFile
    role: AnimaDependencyRole
    versionId: string
  }[]
  file: VerifiedLocalModelFile
  /** A CivitAI install job for precisely this resource/version/file, if one exists. */
  jobId?: string
  versionId: string
}

export interface InstalledModelFile {
  id: string
  managedPath: string
  originalFilename: string
  sha256: string
  sizeBytes: number
  status: ModelFileStatus
  verifiedAt: string
}

export interface InstalledModelVersion {
  baseModelFamily: BaseModelFamily | null
  civitaiFileId: number | null
  civitaiVersionId: number | null
  createdAt: string
  dependencyVersionIds: Partial<Record<AnimaDependencyRole, string>>
  expectedSha256: string | null
  file: InstalledModelFile
  format: string
  id: string
  name: string
  predictionType: ModelPredictionType | null
  sourceMetadata: Record<string, unknown>
  sourceRevision: string | null
}

export interface InstalledModel {
  creator: string | null
  defaultVersionId: string | null
  description: string | null
  displayName: string
  id: string
  previewUrl: string | null
  source: ModelSource
  sourceCheckedAt: string | null
  sourceMetadata: Record<string, unknown>
  type: ModelResourceType
  versions: InstalledModelVersion[]
}

export interface ExactFileLookup {
  civitai?: { fileId: number; modelId: number; versionId: number }
  sha256?: string
}

export interface ExactFileDuplicate {
  fileId: string
  managedPath: string
  matchedBy: 'civitai_identity' | 'sha256'
  resourceId: string
  status: ModelFileStatus
  versionId: string
}

export interface CheckpointPredictionOverride {
  predictionType: ModelPredictionType
  sha256: string
  sizeBytes: number
  updatedAt: string
}

export interface SetPredictionOverrideInput {
  expectedSha256: string
  expectedSizeBytes: number
  predictionType: ModelPredictionType
  resourceId: string
  versionId: string
}

export interface CheckpointNoiseProfileOverride {
  rescaleBetasZeroSnr: boolean | null
  sha256: string
  sizeBytes: number
  timestepSpacing: IllustriousNoiseProfileV1['timestepSpacing'] | null
  updatedAt: string
}

export interface SetNoiseProfileOverrideInput {
  change: SetCheckpointNoiseProfileChange
  expectedSha256: string
  expectedSizeBytes: number
  resourceId: string
  versionId: string
}

export type ModelInstallJobStatus =
  'canceled' | 'completed' | 'downloading' | 'failed' | 'verifying' | 'waiting'

export type ModelInstallArtifactStatus =
  'canceled' | 'downloading' | 'failed' | 'ready' | 'verifying' | 'waiting'

export type InstallArtifactSource =
  { fileId: number; kind: 'civitai_file' } | { key: string; kind: 'supported_dependency' }

export interface CreateInstallArtifactInput {
  expectedSha256?: string | null
  expectedSizeBytes?: number | null
  role: 'primary' | AnimaDependencyRole
  source: InstallArtifactSource
}

/** Deliberately excludes URLs and arbitrary source JSON to avoid persisting credentials. */
export interface CreateModelInstallJobInput {
  artifacts: CreateInstallArtifactInput[]
  baseModelFamily: BaseModelFamily | null
  civitaiFileId: number
  civitaiModelId: number
  civitaiVersionId: number
  displayName: string
  resourceType: ModelResourceType
  versionName: string
}

export interface UpdateInstallJobInput {
  bytesDownloaded?: number
  errorCode?: string | null
  errorMessage?: string | null
  status: ModelInstallJobStatus
  totalBytes?: number | null
}

export interface UpdateInstallArtifactInput {
  downloadedBytes?: number
  errorCode?: string | null
  errorMessage?: string | null
  status: ModelInstallArtifactStatus
  tempPath?: string | null
}

export interface StoredModelInstallArtifact {
  downloadedBytes: number
  errorCode: string | null
  errorMessage: string | null
  expectedSha256: string | null
  expectedSizeBytes: number | null
  id: string
  role: 'primary' | AnimaDependencyRole
  source: InstallArtifactSource
  status: ModelInstallArtifactStatus
  tempPath: string | null
}

export interface StoredModelInstallJob {
  artifacts: StoredModelInstallArtifact[]
  baseModelFamily: BaseModelFamily | null
  bytesDownloaded: number
  civitaiFileId: number
  civitaiModelId: number
  civitaiVersionId: number
  createdAt: string
  displayName: string
  errorCode: string | null
  errorMessage: string | null
  id: string
  resourceType: ModelResourceType
  status: ModelInstallJobStatus
  totalBytes: number | null
  updatedAt: string
  versionName: string
}

type DbExecutor = Kysely<DB> | Transaction<DB>

const sha256Pattern = /^[0-9a-f]{64}$/i

const jobTransitions: Record<ModelInstallJobStatus, readonly ModelInstallJobStatus[]> = {
  canceled: [],
  completed: [],
  downloading: ['verifying', 'failed', 'canceled'],
  failed: [],
  verifying: ['completed', 'failed', 'canceled'],
  waiting: ['downloading', 'failed', 'canceled'],
}

const artifactTransitions: Record<
  ModelInstallArtifactStatus,
  readonly ModelInstallArtifactStatus[]
> = {
  canceled: [],
  downloading: ['verifying', 'failed', 'canceled'],
  failed: [],
  ready: [],
  verifying: ['ready', 'failed', 'canceled'],
  waiting: ['downloading', 'ready', 'failed', 'canceled'],
}

function sourceKey(source: ModelSource): string {
  if (source.kind === 'civitai') {
    assertPositiveId(source.modelId, 'CivitAI model ID')
    return `civitai:model:${source.modelId}`
  }
  if (!source.key.trim()) {
    throw new Error('Supported dependency source key is required')
  }
  return `supported:${source.key}`
}

export class ModelRepository {
  constructor(private readonly db: Kysely<DB>) {}

  async createInstallJob(input: CreateModelInstallJobInput): Promise<string> {
    assertPositiveId(input.civitaiModelId, 'CivitAI model ID')
    assertPositiveId(input.civitaiVersionId, 'CivitAI version ID')
    assertPositiveId(input.civitaiFileId, 'CivitAI file ID')
    if (!input.displayName.trim() || !input.versionName.trim()) {
      throw new Error('Install job model and version names are required')
    }
    if (
      input.artifacts.length === 0 ||
      input.artifacts.filter((artifact) => artifact.role === 'primary').length !== 1 ||
      new Set(input.artifacts.map((artifact) => artifact.role)).size !== input.artifacts.length
    ) {
      throw new Error('Install job needs one primary artifact and unique dependency roles')
    }
    const primaryArtifact = input.artifacts.find((artifact) => artifact.role === 'primary')!
    if (
      primaryArtifact.source.kind !== 'civitai_file' ||
      primaryArtifact.source.fileId !== input.civitaiFileId
    ) {
      throw new Error('Primary install artifact must match the selected CivitAI file')
    }
    for (const artifact of input.artifacts) {
      installSourceIdentity(artifact.source)
      if (artifact.expectedSizeBytes !== undefined && artifact.expectedSizeBytes !== null) {
        if (!Number.isSafeInteger(artifact.expectedSizeBytes) || artifact.expectedSizeBytes <= 0) {
          throw new Error('Expected artifact size must be a positive integer')
        }
      }
      if (artifact.expectedSha256) {
        normalizeSha256(artifact.expectedSha256, 'Expected artifact hash')
      }
    }
    const jobId = randomUUID()
    const now = new Date().toISOString()
    const allSizesKnown = input.artifacts.every((artifact) => artifact.expectedSizeBytes != null)
    const totalBytes = allSizesKnown
      ? input.artifacts.reduce((sum, artifact) => sum + artifact.expectedSizeBytes!, 0)
      : null
    if (totalBytes !== null && !Number.isSafeInteger(totalBytes)) {
      throw new Error('Total install bytes exceed the safe integer range')
    }
    const previewPayload = JSON.stringify({
      baseModelFamily: input.baseModelFamily,
      displayName: input.displayName,
      resourceType: input.resourceType,
      versionName: input.versionName,
    })
    await this.db.transaction().execute(async (trx) => {
      await trx
        .insertInto('model_install_job')
        .values({
          bytes_downloaded: 0,
          civitai_file_id: input.civitaiFileId,
          civitai_model_id: input.civitaiModelId,
          civitai_model_version_id: input.civitaiVersionId,
          created_at: now,
          error_code: null,
          error_message: null,
          id: jobId,
          preview_payload_json: previewPayload,
          status: 'waiting',
          total_bytes: totalBytes,
          updated_at: now,
        })
        .execute()
      for (const artifact of input.artifacts) {
        await trx
          .insertInto('model_install_artifact')
          .values({
            downloaded_bytes: 0,
            error_code: null,
            error_message: null,
            expected_sha256: artifact.expectedSha256
              ? normalizeSha256(artifact.expectedSha256, 'Expected artifact hash')
              : null,
            expected_size_bytes: artifact.expectedSizeBytes ?? null,
            id: randomUUID(),
            job_id: jobId,
            role: artifact.role,
            source_identity: installSourceIdentity(artifact.source),
            source_kind: artifact.source.kind,
            status: 'waiting',
            temp_path: null,
          })
          .execute()
      }
    })
    return jobId
  }

  async failInterruptedInstallJobs(): Promise<number> {
    return this.db.transaction().execute(async (trx) => {
      const active = await trx
        .selectFrom('model_install_job')
        .select('id')
        .where('status', 'in', ['waiting', 'downloading', 'verifying'])
        .execute()
      if (active.length === 0) {
        return 0
      }
      const ids = active.map((job) => job.id)
      const now = new Date().toISOString()
      await trx
        .updateTable('model_install_job')
        .set({
          error_code: 'interrupted',
          error_message: 'Installation was interrupted when the application closed.',
          status: 'failed',
          updated_at: now,
        })
        .where('id', 'in', ids)
        .execute()
      await trx
        .updateTable('model_install_artifact')
        .set({
          error_code: 'interrupted',
          error_message: 'Installation was interrupted when the application closed.',
          status: 'failed',
        })
        .where('job_id', 'in', ids)
        .where('status', 'in', ['waiting', 'downloading', 'verifying'])
        .execute()
      return ids.length
    })
  }

  async findExactFileDuplicate(input: ExactFileLookup): Promise<ExactFileDuplicate | null> {
    if (!input.civitai && !input.sha256) {
      throw new Error('A CivitAI identity or SHA-256 is required for duplicate lookup')
    }
    const query = this.db
      .selectFrom('local_model_file as file')
      .innerJoin('model_resource_version as version', 'version.id', 'file.resource_version_id')
      .innerJoin('model_resource as resource', 'resource.id', 'version.model_resource_id')
      .select([
        'resource.id as resourceId',
        'version.id as versionId',
        'file.id as fileId',
        'file.managed_path as managedPath',
        'file.status as status',
      ])
    if (input.civitai) {
      const { fileId, modelId, versionId } = input.civitai
      assertPositiveId(modelId, 'CivitAI model ID')
      assertPositiveId(versionId, 'CivitAI version ID')
      assertPositiveId(fileId, 'CivitAI file ID')
      const identityMatch = await query
        .where('resource.civitai_model_id', '=', modelId)
        .where('version.civitai_model_version_id', '=', versionId)
        .where('version.civitai_file_id', '=', fileId)
        .executeTakeFirst()
      if (identityMatch) {
        return {
          ...identityMatch,
          matchedBy: 'civitai_identity',
          status: identityMatch.status as ModelFileStatus,
        }
      }
    }
    if (input.sha256) {
      const hashMatch = await query
        .where('file.sha256', '=', normalizeSha256(input.sha256, 'Duplicate lookup hash'))
        .executeTakeFirst()
      if (hashMatch) {
        return { ...hashMatch, matchedBy: 'sha256', status: hashMatch.status as ModelFileStatus }
      }
    }
    return null
  }

  async getNoiseProfileOverride(file: {
    sha256: string
    sizeBytes: number
  }): Promise<CheckpointNoiseProfileOverride | null> {
    const row = await this.db
      .selectFrom('checkpoint_noise_profile_override')
      .selectAll()
      .where('sha256', '=', normalizeSha256(file.sha256, 'Checkpoint override hash'))
      .where('size_bytes', '=', file.sizeBytes)
      .executeTakeFirst()
    return row ? this.noiseProfileOverrideFromRow(row) : null
  }

  async getPredictionOverride(file: {
    sha256: string
    sizeBytes: number
  }): Promise<ModelPredictionType | null> {
    const sha256 = normalizeSha256(file.sha256, 'Checkpoint override hash')
    if (!Number.isSafeInteger(file.sizeBytes) || file.sizeBytes <= 0) {
      throw new Error('Checkpoint override size must be a positive safe integer')
    }
    const row = await this.db
      .selectFrom('checkpoint_prediction_override')
      .select('prediction_type')
      .where('sha256', '=', sha256)
      .where('size_bytes', '=', file.sizeBytes)
      .executeTakeFirst()
    return (row?.prediction_type as ModelPredictionType | undefined) ?? null
  }

  async listInstalled(): Promise<InstalledModel[]> {
    const rows = await this.db
      .selectFrom('model_resource as resource')
      .innerJoin('model_resource_version as version', 'version.model_resource_id', 'resource.id')
      .innerJoin('local_model_file as file', 'file.resource_version_id', 'version.id')
      .select([
        'resource.id as resourceId',
        'resource.source_kind as sourceKind',
        'resource.source_key as sourceKey',
        'resource.civitai_model_id as civitaiModelId',
        'resource.type as resourceType',
        'resource.display_name as displayName',
        'resource.creator as creator',
        'resource.description as description',
        'resource.preview_url as previewUrl',
        'resource.source_metadata_json as resourceMetadata',
        'resource.source_checked_at as sourceCheckedAt',
        'resource.default_version_id as defaultVersionId',
        'version.id as versionId',
        'version.version_name as versionName',
        'version.civitai_model_version_id as civitaiVersionId',
        'version.civitai_file_id as civitaiFileId',
        'version.created_at as versionCreatedAt',
        'version.source_revision as sourceRevision',
        'version.base_model_family as family',
        'version.format as format',
        'version.prediction_type as predictionType',
        'version.expected_sha256 as expectedSha256',
        'version.source_metadata_json as versionMetadata',
        'file.id as fileId',
        'file.managed_path as managedPath',
        'file.original_filename as originalFilename',
        'file.size_bytes as sizeBytes',
        'file.sha256 as sha256',
        'file.status as fileStatus',
        'file.verified_at as verifiedAt',
      ])
      .orderBy('resource.display_name')
      .orderBy('version.created_at')
      .execute()
    const dependencies = await this.db.selectFrom('model_version_dependency').selectAll().execute()
    const dependencyMap = new Map<string, Partial<Record<AnimaDependencyRole, string>>>()
    for (const dependency of dependencies) {
      const roles = dependencyMap.get(dependency.checkpoint_version_id) ?? {}
      roles[dependency.role as AnimaDependencyRole] = dependency.component_version_id
      dependencyMap.set(dependency.checkpoint_version_id, roles)
    }

    const resources = new Map<string, InstalledModel>()
    for (const row of rows) {
      let resource = resources.get(row.resourceId)
      if (!resource) {
        const source: ModelSource =
          row.sourceKind === 'civitai'
            ? { kind: 'civitai', modelId: row.civitaiModelId! }
            : { key: row.sourceKey.slice('supported:'.length), kind: 'supported_dependency' }
        resource = {
          creator: row.creator,
          defaultVersionId: row.defaultVersionId,
          description: row.description,
          displayName: row.displayName,
          id: row.resourceId,
          previewUrl: row.previewUrl,
          source,
          sourceCheckedAt: row.sourceCheckedAt,
          sourceMetadata: fromJson(row.resourceMetadata),
          type: row.resourceType as ModelResourceType,
          versions: [],
        }
        resources.set(row.resourceId, resource)
      }
      resource.versions.push({
        baseModelFamily: row.family as BaseModelFamily | null,
        civitaiFileId: row.civitaiFileId,
        civitaiVersionId: row.civitaiVersionId,
        createdAt: row.versionCreatedAt,
        dependencyVersionIds: dependencyMap.get(row.versionId) ?? {},
        expectedSha256: row.expectedSha256,
        file: {
          id: row.fileId,
          managedPath: row.managedPath,
          originalFilename: row.originalFilename,
          sha256: row.sha256,
          sizeBytes: row.sizeBytes,
          status: row.fileStatus as ModelFileStatus,
          verifiedAt: row.verifiedAt,
        },
        format: row.format,
        id: row.versionId,
        name: row.versionName,
        predictionType: row.predictionType as ModelPredictionType | null,
        sourceMetadata: fromJson(row.versionMetadata),
        sourceRevision: row.sourceRevision,
      })
    }
    return [...resources.values()]
  }

  async listInstallJobs(): Promise<StoredModelInstallJob[]> {
    const jobs = await this.db
      .selectFrom('model_install_job')
      .selectAll()
      .orderBy('created_at', 'desc')
      .execute()
    const artifacts = await this.db.selectFrom('model_install_artifact').selectAll().execute()
    const artifactMap = new Map<string, StoredModelInstallArtifact[]>()
    for (const artifact of artifacts) {
      const group = artifactMap.get(artifact.job_id) ?? []
      group.push({
        downloadedBytes: artifact.downloaded_bytes,
        errorCode: artifact.error_code,
        errorMessage: artifact.error_message,
        expectedSha256: artifact.expected_sha256,
        expectedSizeBytes: artifact.expected_size_bytes,
        id: artifact.id,
        role: artifact.role as 'primary' | AnimaDependencyRole,
        source: parseInstallSourceIdentity(artifact.source_kind, artifact.source_identity),
        status: artifact.status as ModelInstallArtifactStatus,
        tempPath: artifact.temp_path,
      })
      artifactMap.set(artifact.job_id, group)
    }
    return jobs.map((job) => {
      const preview = fromJson(job.preview_payload_json)
      return {
        artifacts: artifactMap.get(job.id) ?? [],
        baseModelFamily: preview.baseModelFamily as BaseModelFamily | null,
        bytesDownloaded: job.bytes_downloaded,
        civitaiFileId: job.civitai_file_id,
        civitaiModelId: job.civitai_model_id,
        civitaiVersionId: job.civitai_model_version_id,
        createdAt: job.created_at,
        displayName: preview.displayName as string,
        errorCode: job.error_code,
        errorMessage: job.error_message,
        id: job.id,
        resourceType: preview.resourceType as ModelResourceType,
        status: job.status as ModelInstallJobStatus,
        totalBytes: job.total_bytes,
        updatedAt: job.updated_at,
        versionName: preview.versionName as string,
      }
    })
  }

  async listNoiseProfileOverrides(): Promise<CheckpointNoiseProfileOverride[]> {
    const rows = await this.db.selectFrom('checkpoint_noise_profile_override').selectAll().execute()
    return rows.map((row) => this.noiseProfileOverrideFromRow(row))
  }

  async listPredictionOverrides(): Promise<CheckpointPredictionOverride[]> {
    const rows = await this.db
      .selectFrom('checkpoint_prediction_override')
      .select(['prediction_type', 'sha256', 'size_bytes', 'updated_at'])
      .orderBy('sha256')
      .execute()
    return rows.map((row) => ({
      predictionType: row.prediction_type as ModelPredictionType,
      sha256: row.sha256,
      sizeBytes: row.size_bytes,
      updatedAt: row.updated_at,
    }))
  }

  async publishVerifiedInstallation(
    input: PublishVerifiedInstallationInput,
  ): Promise<PublishedInstallation> {
    validateArtifact(input.primary)
    const dependencies = input.dependencies ?? []
    const isAnimaCheckpoint =
      input.primary.resource.type === 'checkpoint' &&
      input.primary.version.baseModelFamily === 'anima'
    if (isAnimaCheckpoint) {
      if (
        dependencies.length !== 2 ||
        new Set(dependencies.map((dependency) => dependency.role)).size !== 2 ||
        !dependencies.some((dependency) => dependency.role === 'qwen3_encoder') ||
        !dependencies.some((dependency) => dependency.role === 'vae')
      ) {
        throw new Error('Anima checkpoint requires both Qwen3 encoder and VAE')
      }
    } else if (dependencies.length > 0) {
      throw new Error('Only an Anima checkpoint can declare model dependencies')
    }
    for (const dependency of dependencies) {
      if ('artifact' in dependency && dependency.artifact) {
        if (
          dependency.artifact.resource.type !== dependency.role ||
          dependency.artifact.version.baseModelFamily !== 'anima'
        ) {
          throw new Error(`Invalid ${dependency.role} dependency artifact`)
        }
        validateArtifact(dependency.artifact)
      }
    }

    return this.db.transaction().execute(async (trx) => {
      const now = new Date().toISOString()
      const dependencyVersionIds: Partial<Record<AnimaDependencyRole, string>> = {}
      for (const dependency of dependencies) {
        if (dependency.existingVersionId) {
          if (dependency.repairFile) {
            await repairAnimaDependency(
              trx,
              dependency.existingVersionId,
              dependency.role,
              dependency.repairFile,
            )
          }
          await requireReadyDependency(trx, dependency.existingVersionId, dependency.role)
          dependencyVersionIds[dependency.role] = dependency.existingVersionId
        } else if (dependency.artifact) {
          const published = await publishArtifact(trx, dependency.artifact, now)
          dependencyVersionIds[dependency.role] = published.versionId
        }
      }
      const primary = await publishArtifact(trx, input.primary, now)
      for (const dependency of dependencies) {
        const componentVersionId = dependencyVersionIds[dependency.role]
        if (!componentVersionId) {
          throw new Error(`Required ${dependency.role} dependency was not published`)
        }
        await trx
          .insertInto('model_version_dependency')
          .values({
            checkpoint_version_id: primary.versionId,
            component_version_id: componentVersionId,
            role: dependency.role,
          })
          .execute()
      }
      if (input.jobId) {
        const job = await trx
          .selectFrom('model_install_job')
          .select('status')
          .where('id', '=', input.jobId)
          .executeTakeFirst()
        const artifacts = await trx
          .selectFrom('model_install_artifact')
          .select('status')
          .where('job_id', '=', input.jobId)
          .execute()
        if (
          job?.status !== 'verifying' ||
          artifacts.length === 0 ||
          artifacts.some((artifact) => artifact.status !== 'ready')
        ) {
          throw new Error('Install job is not ready for catalog publication')
        }
        await trx
          .updateTable('model_install_job')
          .set({ status: 'completed', updated_at: now })
          .where('id', '=', input.jobId)
          .execute()
      }
      return { ...primary, dependencyVersionIds }
    })
  }

  async repairVerifiedVersion(input: RepairVerifiedVersionInput): Promise<void> {
    const verifiedHash = assertVerifiedFile(input.file)
    await this.db.transaction().execute(async (trx) => {
      const target = await trx
        .selectFrom('model_resource_version as version')
        .innerJoin('model_resource as resource', 'resource.id', 'version.model_resource_id')
        .innerJoin('local_model_file as file', 'file.resource_version_id', 'version.id')
        .select([
          'resource.civitai_model_id as civitaiModelId',
          'resource.type as resourceType',
          'version.base_model_family as family',
          'version.civitai_model_version_id as civitaiVersionId',
          'version.civitai_file_id as civitaiFileId',
          'version.expected_sha256 as expectedSha256',
          'file.id as fileId',
          'file.sha256 as sha256',
          'file.size_bytes as sizeBytes',
        ])
        .where('version.id', '=', input.versionId)
        .executeTakeFirst()
      if (!target) {
        throw new Error('Exact model version does not exist for repair')
      }
      if (
        verifiedHash !== target.sha256 ||
        (target.expectedSha256 !== null && verifiedHash !== target.expectedSha256) ||
        input.file.sizeBytes !== target.sizeBytes
      ) {
        throw new Error('Repair file does not match the installed version hash and size')
      }
      await assertSharedManagedPathCompatible(trx, input.file, verifiedHash, target.fileId)

      if (target.resourceType === 'checkpoint' && target.family === 'anima') {
        const dependencies = await trx
          .selectFrom('model_version_dependency')
          .select(['role', 'component_version_id'])
          .where('checkpoint_version_id', '=', input.versionId)
          .execute()
        if (dependencies.length !== 2) {
          throw new Error('Anima checkpoint has incomplete dependencies')
        }
        const repairs = input.dependencyRepairs ?? []
        if (new Set(repairs.map((repair) => repair.role)).size !== repairs.length) {
          throw new Error('Duplicate Anima dependency repair role')
        }
        for (const repair of repairs) {
          if (
            !dependencies.some(
              (dependency) =>
                dependency.role === repair.role &&
                dependency.component_version_id === repair.versionId,
            )
          ) {
            throw new Error('Anima dependency repair does not match the checkpoint link')
          }
          await repairAnimaDependency(trx, repair.versionId, repair.role, repair.file)
        }
        for (const dependency of dependencies) {
          await requireReadyDependency(
            trx,
            dependency.component_version_id,
            dependency.role as AnimaDependencyRole,
          )
        }
      } else if (input.dependencyRepairs?.length) {
        throw new Error('Only an Anima checkpoint may repair dependencies')
      }

      const now = new Date().toISOString()
      if (input.jobId) {
        const job = await trx
          .selectFrom('model_install_job')
          .select(['status', 'civitai_model_id', 'civitai_model_version_id', 'civitai_file_id'])
          .where('id', '=', input.jobId)
          .executeTakeFirst()
        const artifacts = await trx
          .selectFrom('model_install_artifact')
          .select('status')
          .where('job_id', '=', input.jobId)
          .execute()
        if (
          job?.status !== 'verifying' ||
          artifacts.length === 0 ||
          artifacts.some((artifact) => artifact.status !== 'ready')
        ) {
          throw new Error('Install job is not ready for exact-version repair')
        }
        if (
          job.civitai_model_id !== target.civitaiModelId ||
          job.civitai_model_version_id !== target.civitaiVersionId ||
          job.civitai_file_id !== target.civitaiFileId
        ) {
          throw new Error('Install job source identity does not match the repaired version')
        }
      }

      await trx
        .updateTable('local_model_file')
        .set({
          managed_path: input.file.managedPath,
          original_filename: input.file.originalFilename,
          sha256: verifiedHash,
          size_bytes: input.file.sizeBytes,
          status: 'ready',
          verified_at: input.file.verifiedAt,
        })
        .where('id', '=', target.fileId)
        .execute()
      if (input.jobId) {
        await trx
          .updateTable('model_install_job')
          .set({ status: 'completed', updated_at: now })
          .where('id', '=', input.jobId)
          .execute()
      }
    })
  }

  async setDefaultVersion(resourceId: string, versionId: string): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      const target = await trx
        .selectFrom('model_resource_version as version')
        .innerJoin('model_resource as resource', 'resource.id', 'version.model_resource_id')
        .innerJoin('local_model_file as file', 'file.resource_version_id', 'version.id')
        .select([
          'resource.type as type',
          'version.base_model_family as family',
          'file.status as status',
          'file.managed_path as managedPath',
          'file.size_bytes as sizeBytes',
        ])
        .where('resource.id', '=', resourceId)
        .where('version.id', '=', versionId)
        .executeTakeFirst()
      if (!target || target.status !== 'ready') {
        throw new Error('Default version must be a ready version of this resource')
      }
      const file = lstatSync(target.managedPath)
      if (!file.isFile() || file.isSymbolicLink() || file.size !== target.sizeBytes) {
        throw new Error('Default version file is missing or has changed size')
      }
      if (target.type === 'checkpoint' && target.family === 'anima') {
        const dependencies = await trx
          .selectFrom('model_version_dependency')
          .select(['role', 'component_version_id'])
          .where('checkpoint_version_id', '=', versionId)
          .execute()
        if (dependencies.length !== 2) {
          throw new Error('Anima checkpoint has incomplete dependencies')
        }
        for (const dependency of dependencies) {
          await requireReadyDependency(
            trx,
            dependency.component_version_id,
            dependency.role as AnimaDependencyRole,
          )
        }
      }
      await trx
        .updateTable('model_resource')
        .set({ default_version_id: versionId, updated_at: new Date().toISOString() })
        .where('id', '=', resourceId)
        .execute()
    })
  }

  async setNoiseProfileOverride(input: SetNoiseProfileOverrideInput): Promise<void> {
    const sha256 = normalizeSha256(input.expectedSha256, 'Checkpoint noise override hash')
    if (!Number.isSafeInteger(input.expectedSizeBytes) || input.expectedSizeBytes <= 0) {
      throw new Error('Checkpoint noise override size must be a positive safe integer')
    }
    const change = input.change
    if (!(
      (change.kind === 'rescale-betas-zero-snr' &&
        (change.value === null || typeof change.value === 'boolean')) ||
      (change.kind === 'timestep-spacing' &&
        (change.value === null || ['leading', 'linspace', 'trailing'].includes(change.value)))
    )) {
      throw new Error('Unsupported checkpoint noise setting')
    }
    await this.db.transaction().execute(async (trx) => {
      const target = await trx
        .selectFrom('model_resource_version as version')
        .innerJoin('model_resource as resource', 'resource.id', 'version.model_resource_id')
        .innerJoin('local_model_file as file', 'file.resource_version_id', 'version.id')
        .select([
          'resource.type as resourceType',
          'version.base_model_family as family',
          'file.status as fileStatus',
        ])
        .where('resource.id', '=', input.resourceId)
        .where('version.id', '=', input.versionId)
        .where('file.sha256', '=', sha256)
        .where('file.size_bytes', '=', input.expectedSizeBytes)
        .executeTakeFirst()
      if (
        target?.resourceType !== 'checkpoint' ||
        target.family !== 'illustrious' ||
        target.fileStatus !== 'ready'
      ) {
        throw new Error('Noise override requires this exact ready Illustrious checkpoint')
      }
      const updatedAt = new Date().toISOString()
      const update =
        change.kind === 'rescale-betas-zero-snr'
          ? { rescale_betas_zero_snr: change.value === null ? null : Number(change.value) }
          : { timestep_spacing: change.value }
      await trx
        .insertInto('checkpoint_noise_profile_override')
        .values({
          rescale_betas_zero_snr: null,
          sha256,
          size_bytes: input.expectedSizeBytes,
          timestep_spacing: null,
          updated_at: updatedAt,
          ...update,
        })
        .onConflict((conflict) =>
          conflict
            .columns(['sha256', 'size_bytes'])
            .doUpdateSet({ ...update, updated_at: updatedAt }),
        )
        .execute()
    })
  }

  async setPredictionOverride(
    input: SetPredictionOverrideInput,
  ): Promise<CheckpointPredictionOverride> {
    const sha256 = normalizeSha256(input.expectedSha256, 'Checkpoint override hash')
    if (!Number.isSafeInteger(input.expectedSizeBytes) || input.expectedSizeBytes <= 0) {
      throw new Error('Checkpoint override size must be a positive safe integer')
    }
    if (!['epsilon', 'sample', 'v_prediction'].includes(input.predictionType)) {
      throw new Error('Unsupported checkpoint prediction type')
    }
    return this.db.transaction().execute(async (trx) => {
      const target = await trx
        .selectFrom('model_resource_version as version')
        .innerJoin('model_resource as resource', 'resource.id', 'version.model_resource_id')
        .innerJoin('local_model_file as file', 'file.resource_version_id', 'version.id')
        .select([
          'resource.type as resourceType',
          'version.base_model_family as family',
          'file.status as fileStatus',
        ])
        .where('resource.id', '=', input.resourceId)
        .where('version.id', '=', input.versionId)
        .where('file.sha256', '=', sha256)
        .where('file.size_bytes', '=', input.expectedSizeBytes)
        .executeTakeFirst()
      if (
        target?.resourceType !== 'checkpoint' ||
        target.family !== 'illustrious' ||
        target.fileStatus !== 'ready'
      ) {
        throw new Error('Prediction override requires this exact ready Illustrious checkpoint')
      }
      const updatedAt = new Date().toISOString()
      await trx
        .insertInto('checkpoint_prediction_override')
        .values({
          prediction_type: input.predictionType,
          sha256,
          size_bytes: input.expectedSizeBytes,
          updated_at: updatedAt,
        })
        .onConflict((conflict) =>
          conflict.columns(['sha256', 'size_bytes']).doUpdateSet({
            prediction_type: input.predictionType,
            updated_at: updatedAt,
          }),
        )
        .execute()
      return {
        predictionType: input.predictionType,
        sha256,
        sizeBytes: input.expectedSizeBytes,
        updatedAt,
      }
    })
  }

  async updateInstallArtifact(
    jobId: string,
    role: 'primary' | AnimaDependencyRole,
    input: UpdateInstallArtifactInput,
  ): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      const artifact = await trx
        .selectFrom('model_install_artifact as artifact')
        .innerJoin('model_install_job as job', 'job.id', 'artifact.job_id')
        .select([
          'artifact.id as id',
          'artifact.status as status',
          'artifact.downloaded_bytes as downloadedBytes',
          'artifact.temp_path as tempPath',
          'job.status as jobStatus',
        ])
        .where('artifact.job_id', '=', jobId)
        .where('artifact.role', '=', role)
        .executeTakeFirst()
      if (!artifact) {
        throw new Error('Install artifact does not exist')
      }
      if (['canceled', 'completed', 'failed'].includes(artifact.jobStatus)) {
        throw new Error('Cannot update an artifact of a terminal install job')
      }
      const previous = artifact.status as ModelInstallArtifactStatus
      if (previous !== input.status && !artifactTransitions[previous].includes(input.status)) {
        throw new Error(`Invalid artifact transition from ${previous} to ${input.status}`)
      }
      const downloadedBytes = input.downloadedBytes ?? artifact.downloadedBytes
      assertNonNegativeBytes(downloadedBytes, 'Downloaded artifact bytes')
      if (downloadedBytes < artifact.downloadedBytes) {
        throw new Error('Downloaded artifact bytes cannot decrease')
      }
      if (
        input.tempPath !== undefined &&
        input.tempPath !== null &&
        !path.isAbsolute(input.tempPath)
      ) {
        throw new Error('Temporary artifact path must be absolute')
      }
      await trx
        .updateTable('model_install_artifact')
        .set({
          downloaded_bytes: downloadedBytes,
          error_code: input.errorCode ?? null,
          error_message: input.errorMessage ?? null,
          status: input.status,
          temp_path: input.tempPath === undefined ? artifact.tempPath : input.tempPath,
        })
        .where('id', '=', artifact.id)
        .execute()
    })
  }

  async updateInstallJob(jobId: string, input: UpdateInstallJobInput): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      const job = await trx
        .selectFrom('model_install_job')
        .select(['status', 'bytes_downloaded', 'total_bytes'])
        .where('id', '=', jobId)
        .executeTakeFirst()
      if (!job) {
        throw new Error('Install job does not exist')
      }
      const previous = job.status as ModelInstallJobStatus
      if (previous !== input.status && !jobTransitions[previous].includes(input.status)) {
        throw new Error(`Invalid install job transition from ${previous} to ${input.status}`)
      }
      if (jobTransitions[previous].length === 0) {
        throw new Error('A terminal install job cannot be changed')
      }
      const bytesDownloaded = input.bytesDownloaded ?? job.bytes_downloaded
      assertNonNegativeBytes(bytesDownloaded, 'Downloaded job bytes')
      if (bytesDownloaded < job.bytes_downloaded) {
        throw new Error('Downloaded job bytes cannot decrease')
      }
      const totalBytes = input.totalBytes === undefined ? job.total_bytes : input.totalBytes
      if (totalBytes !== null) {
        assertNonNegativeBytes(totalBytes, 'Total job bytes')
      }
      if (input.status === 'completed') {
        const artifacts = await trx
          .selectFrom('model_install_artifact')
          .select('status')
          .where('job_id', '=', jobId)
          .execute()
        if (artifacts.length === 0 || artifacts.some((artifact) => artifact.status !== 'ready')) {
          throw new Error('Install job cannot complete before all artifacts are ready')
        }
      }
      await trx
        .updateTable('model_install_job')
        .set({
          bytes_downloaded: bytesDownloaded,
          error_code: input.errorCode ?? null,
          error_message: input.errorMessage ?? null,
          status: input.status,
          total_bytes: totalBytes,
          updated_at: new Date().toISOString(),
        })
        .where('id', '=', jobId)
        .execute()
      if (input.status === 'failed' || input.status === 'canceled') {
        await trx
          .updateTable('model_install_artifact')
          .set({ error_code: input.errorCode ?? null, status: input.status })
          .where('job_id', '=', jobId)
          .where('status', 'in', ['waiting', 'downloading', 'verifying'])
          .execute()
      }
    })
  }

  private noiseProfileOverrideFromRow(row: {
    rescale_betas_zero_snr: number | null
    sha256: string
    size_bytes: number
    timestep_spacing: string | null
    updated_at: string
  }): CheckpointNoiseProfileOverride {
    return {
      rescaleBetasZeroSnr:
        row.rescale_betas_zero_snr === null ? null : row.rescale_betas_zero_snr === 1,
      sha256: row.sha256,
      sizeBytes: row.size_bytes,
      timestepSpacing: row.timestep_spacing as CheckpointNoiseProfileOverride['timestepSpacing'],
      updatedAt: row.updated_at,
    }
  }
}

function assertNonNegativeBytes(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`)
  }
}

function installSourceIdentity(source: InstallArtifactSource): string {
  if (source.kind === 'civitai_file') {
    assertPositiveId(source.fileId, 'CivitAI file ID')
    return `civitai:file:${source.fileId}`
  }
  if (!/^[\w/@.#:-]+$/.test(source.key)) {
    throw new Error('Supported dependency source identity must be a non-secret manifest key')
  }
  return `supported:${source.key}`
}

function parseInstallSourceIdentity(kind: string, identity: string): InstallArtifactSource {
  if (kind === 'civitai_file') {
    const match = /^civitai:file:([1-9]\d*)$/.exec(identity)
    if (!match) {
      throw new Error('Stored CivitAI file identity is invalid')
    }
    return { fileId: Number(match[1]), kind }
  }
  if (kind === 'supported_dependency' && identity.startsWith('supported:')) {
    return { key: identity.slice('supported:'.length), kind }
  }
  throw new Error('Stored install artifact source identity is invalid')
}

function assertPositiveId(id: number, label: string): void {
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error(`${label} must be a positive integer`)
  }
}

function normalizeSha256(value: string, label: string): string {
  if (!sha256Pattern.test(value)) {
    throw new Error(`${label} must be a 64-character SHA-256 digest`)
  }
  return value.toLowerCase()
}

function toJson(value: Record<string, unknown>): string {
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    throw new Error('Source metadata must be a JSON object')
  }
  const json = JSON.stringify(value)
  if (!json || JSON.parse(json) === null || Array.isArray(JSON.parse(json))) {
    throw new Error('Source metadata must be a JSON object')
  }
  return json
}

function fromJson(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value)
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('Stored source metadata is not a JSON object')
  }
  return parsed as Record<string, unknown>
}

function assertVerifiedFile(file: VerifiedLocalModelFile): string {
  if (!path.isAbsolute(file.managedPath)) {
    throw new Error('Managed model path must be absolute')
  }
  if (
    file.originalFilename.length === 0 ||
    path.basename(file.originalFilename) !== file.originalFilename
  ) {
    throw new Error('Original model filename must not include directories')
  }
  if (!Number.isSafeInteger(file.sizeBytes) || file.sizeBytes <= 0) {
    throw new Error('Verified model size must be a positive integer')
  }
  if (Number.isNaN(Date.parse(file.verifiedAt))) {
    throw new TypeError('Verification timestamp must be an ISO date')
  }
  const actualStat = lstatSync(file.managedPath)
  if (!actualStat.isFile() || actualStat.isSymbolicLink() || actualStat.size !== file.sizeBytes) {
    throw new Error('Verified managed model file is missing or has changed size')
  }
  return normalizeSha256(file.sha256, 'Verified model hash')
}

function validateArtifact(artifact: VerifiedModelArtifact): void {
  if (
    !artifact.resource.displayName.trim() ||
    !artifact.version.name.trim() ||
    !artifact.version.format.trim()
  ) {
    throw new Error('Resource and version display fields are required')
  }
  if (artifact.resource.source.kind !== artifact.version.source.kind) {
    throw new Error('Resource and version source kinds differ')
  }
  if (artifact.resource.source.kind === 'supported_dependency') {
    if (
      !['qwen3_encoder', 'vae'].includes(artifact.resource.type) ||
      artifact.version.baseModelFamily !== 'anima'
    ) {
      throw new Error('Only Anima Qwen3 and VAE are supported dependencies')
    }
  } else if (
    artifact.resource.type === 'qwen3_encoder' ||
    (artifact.resource.type === 'vae' &&
      (artifact.version.baseModelFamily !== 'illustrious' ||
        (artifact.version.predictionType !== undefined &&
          artifact.version.predictionType !== null))) ||
    (artifact.resource.type !== 'upscaler' && artifact.version.baseModelFamily === null)
  ) {
    throw new Error('CivitAI resource type or base model family is unsupported')
  }
  sourceKey(artifact.resource.source)
  toJson(artifact.resource.sourceMetadata)
  toJson(artifact.version.sourceMetadata)
  const actualHash = assertVerifiedFile(artifact.file)
  if (artifact.version.source.kind === 'civitai') {
    assertPositiveId(artifact.version.source.versionId, 'CivitAI version ID')
    assertPositiveId(artifact.version.source.fileId, 'CivitAI file ID')
    if (
      artifact.version.source.expectedSha256 &&
      normalizeSha256(artifact.version.source.expectedSha256, 'Expected source hash') !== actualHash
    ) {
      throw new Error('Verified model hash does not match the source hash')
    }
  } else {
    if (!artifact.version.source.revision.trim()) {
      throw new Error('Supported dependency revision is required')
    }
    if (
      normalizeSha256(artifact.version.source.expectedSha256, 'Expected dependency hash') !==
      actualHash
    ) {
      throw new Error('Verified dependency hash does not match its manifest')
    }
  }
}

async function publishArtifact(
  executor: Transaction<DB>,
  artifact: VerifiedModelArtifact,
  now: string,
): Promise<{ fileId: string; resourceId: string; versionId: string }> {
  const verifiedHash = assertVerifiedFile(artifact.file)
  await assertSharedManagedPathCompatible(executor, artifact.file, verifiedHash)
  const key = sourceKey(artifact.resource.source)
  const existingResource = await executor
    .selectFrom('model_resource')
    .selectAll()
    .where('source_key', '=', key)
    .executeTakeFirst()
  let resourceId = existingResource?.id
  const civitaiModelId =
    artifact.resource.source.kind === 'civitai' ? artifact.resource.source.modelId : null

  if (existingResource) {
    if (
      existingResource.source_kind !== artifact.resource.source.kind ||
      existingResource.civitai_model_id !== civitaiModelId ||
      existingResource.type !== artifact.resource.type
    ) {
      throw new Error('Source identity conflicts with an existing model resource')
    }
    await executor
      .updateTable('model_resource')
      .set({
        creator: artifact.resource.creator ?? null,
        description: artifact.resource.description ?? null,
        display_name: artifact.resource.displayName,
        preview_url: artifact.resource.previewUrl ?? null,
        source_checked_at: artifact.resource.sourceCheckedAt ?? now,
        source_metadata_json: toJson(artifact.resource.sourceMetadata),
        updated_at: now,
      })
      .where('id', '=', existingResource.id)
      .execute()
  } else {
    resourceId = randomUUID()
    await executor
      .insertInto('model_resource')
      .values({
        civitai_model_id: civitaiModelId,
        created_at: now,
        creator: artifact.resource.creator ?? null,
        default_version_id: null,
        description: artifact.resource.description ?? null,
        display_name: artifact.resource.displayName,
        id: resourceId,
        preview_url: artifact.resource.previewUrl ?? null,
        source_checked_at: artifact.resource.sourceCheckedAt ?? now,
        source_key: key,
        source_kind: artifact.resource.source.kind,
        source_metadata_json: toJson(artifact.resource.sourceMetadata),
        type: artifact.resource.type,
        updated_at: now,
      })
      .execute()
  }

  if (!resourceId) {
    throw new Error('Model resource ID could not be resolved')
  }

  const source = artifact.version.source
  const versionId = randomUUID()
  const fileId = randomUUID()
  await executor
    .insertInto('model_resource_version')
    .values({
      base_model_family: artifact.version.baseModelFamily,
      civitai_file_id: source.kind === 'civitai' ? source.fileId : null,
      civitai_model_version_id: source.kind === 'civitai' ? source.versionId : null,
      created_at: now,
      expected_sha256:
        source.kind === 'supported_dependency'
          ? normalizeSha256(source.expectedSha256, 'Expected dependency hash')
          : source.expectedSha256
            ? normalizeSha256(source.expectedSha256, 'Expected source hash')
            : null,
      format: artifact.version.format,
      id: versionId,
      model_resource_id: resourceId,
      prediction_type: artifact.version.predictionType ?? null,
      source_metadata_json: toJson(artifact.version.sourceMetadata),
      source_revision: source.kind === 'supported_dependency' ? source.revision : null,
      updated_at: now,
      version_name: artifact.version.name,
    })
    .execute()
  await executor
    .insertInto('local_model_file')
    .values({
      id: fileId,
      managed_path: artifact.file.managedPath,
      original_filename: artifact.file.originalFilename,
      resource_version_id: versionId,
      sha256: verifiedHash,
      size_bytes: artifact.file.sizeBytes,
      status: 'ready',
      verified_at: artifact.file.verifiedAt,
    })
    .execute()

  if (existingResource?.default_version_id === null || !existingResource) {
    await executor
      .updateTable('model_resource')
      .set({ default_version_id: versionId, updated_at: now })
      .where('id', '=', resourceId)
      .execute()
  }

  return { fileId, resourceId, versionId }
}

async function assertSharedManagedPathCompatible(
  executor: DbExecutor,
  file: VerifiedLocalModelFile,
  sha256: string,
  exceptFileId?: string,
): Promise<void> {
  const owners = await executor
    .selectFrom('local_model_file')
    .select(['id', 'sha256', 'size_bytes'])
    .where('managed_path', '=', file.managedPath)
    .execute()
  if (
    owners.some(
      (owner) =>
        owner.id !== exceptFileId &&
        (owner.sha256 !== sha256 || owner.size_bytes !== file.sizeBytes),
    )
  ) {
    throw new Error('Managed model path is already assigned to different file bytes')
  }
}

async function repairAnimaDependency(
  executor: DbExecutor,
  versionId: string,
  role: AnimaDependencyRole,
  file: VerifiedLocalModelFile,
): Promise<void> {
  const verifiedHash = assertVerifiedFile(file)
  const target = await executor
    .selectFrom('model_resource_version as version')
    .innerJoin('model_resource as resource', 'resource.id', 'version.model_resource_id')
    .innerJoin('local_model_file as local', 'local.resource_version_id', 'version.id')
    .select([
      'resource.source_kind as sourceKind',
      'resource.type as resourceType',
      'version.base_model_family as family',
      'version.expected_sha256 as expectedSha256',
      'local.id as fileId',
      'local.sha256 as sha256',
      'local.size_bytes as sizeBytes',
    ])
    .where('version.id', '=', versionId)
    .executeTakeFirst()
  if (
    !target ||
    target.sourceKind !== 'supported_dependency' ||
    target.resourceType !== role ||
    target.family !== 'anima' ||
    target.sha256 !== verifiedHash ||
    (target.expectedSha256 !== null && target.expectedSha256 !== verifiedHash) ||
    target.sizeBytes !== file.sizeBytes
  ) {
    throw new Error(`Repair file does not match the exact Anima ${role} dependency`)
  }
  await assertSharedManagedPathCompatible(executor, file, verifiedHash, target.fileId)
  await executor
    .updateTable('local_model_file')
    .set({
      managed_path: file.managedPath,
      original_filename: file.originalFilename,
      sha256: verifiedHash,
      size_bytes: file.sizeBytes,
      status: 'ready',
      verified_at: file.verifiedAt,
    })
    .where('id', '=', target.fileId)
    .execute()
}

async function requireReadyDependency(
  executor: DbExecutor,
  versionId: string,
  role: AnimaDependencyRole,
): Promise<void> {
  const existing = await executor
    .selectFrom('model_resource_version as version')
    .innerJoin('model_resource as resource', 'resource.id', 'version.model_resource_id')
    .innerJoin('local_model_file as file', 'file.resource_version_id', 'version.id')
    .select([
      'resource.type as type',
      'version.base_model_family as family',
      'file.status as status',
      'file.managed_path as managedPath',
      'file.size_bytes as sizeBytes',
    ])
    .where('version.id', '=', versionId)
    .executeTakeFirst()
  if (
    !existing ||
    existing.type !== role ||
    existing.family !== 'anima' ||
    existing.status !== 'ready'
  ) {
    throw new Error(`Required ${role} dependency is not installed and ready`)
  }
  const file = lstatSync(existing.managedPath)
  if (!file.isFile() || file.isSymbolicLink() || file.size !== existing.sizeBytes) {
    throw new Error(`Required ${role} dependency file is missing or has changed size`)
  }
}
