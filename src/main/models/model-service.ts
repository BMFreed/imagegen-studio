import type {
  AnimaModelBundleView,
  CheckpointNoiseProfileView,
  CivitaiTokenStatus,
  ModelCatalogItem,
  ModelImportPreview,
  ModelVersionView,
  SetCheckpointNoiseProfileChange,
} from '../../shared/api.js'
import { isCheckpointNoiseProfileChange } from '../../shared/api.js'
import {
  presetApplicationDiagnostics,
  type PresetApplicationRequest,
  type PresetApplicationTarget,
} from '../../shared/presets/preset-application.js'
import {
  defaultIllustriousNoiseProfile,
  type IllustriousNoiseProfileV1,
} from '../../shared/projects/illustrious-noise-profile.js'
import type { IgsProjectDocumentV1 } from '../../shared/projects/project-schema.js'
import {
  embeddingActivationToken,
  embeddingSourcesFromCatalog,
  type GenerationPrompt,
  getPromptEmbeddingMatches,
  type PromptEmbeddingSelection,
  reconcilePromptEmbeddings,
  sameExactPromptEmbedding,
  selectablePromptEmbeddingSources,
} from '../../shared/projects/prompt-embeddings.js'

import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat } from 'node:fs/promises'
import path from 'node:path'

import type { CivitaiImportPreview } from './civitai-client.js'
import type { CivitaiClient } from './civitai-client.js'
import type { CivitaiTokenStore } from './civitai-token-store.js'
import type { ModelPreviewCache } from './model-preview-cache.js'
import type {
  BaseModelFamily,
  CheckpointNoiseProfileOverride,
  InstalledModelFile,
  InstalledModelVersion,
  ModelPredictionType,
  ModelRepository,
  ModelResourceType as StoredResourceType,
} from './model-repository.js'

import { qualifyAnimaCheckpoint } from './anima-checkpoint-qualification.js'
import { qualifyAnimaLora } from './anima-lora-qualification.js'
import {
  ANIMA_BASE_1_0_CHECKPOINT,
  ANIMA_QWEN3_0_6B_ENCODER,
  ANIMA_QWEN_IMAGE_VAE,
  ANIMA_SOURCE_LICENSE,
  isPinnedAnimaBaseCheckpoint,
} from './anima-manifest.js'
import { validateCivitaiToken } from './civitai-token-store.js'
import { qualifyIllustriousEmbedding } from './illustrious-embedding-qualification.js'
import { qualifyIllustriousLora } from './illustrious-lora-qualification.js'
import { qualifyIllustriousVae } from './illustrious-vae-qualification.js'
import {
  CHECKPOINT_COMPATIBILITY_MANIFEST,
  type CheckpointCompatibilityFingerprint,
  qualifiedCheckpointPredictionType,
} from './model-compatibility-manifest.js'
import {
  qualifySdxlCheckpoint,
  SdxlCheckpointQualificationError,
} from './sdxl-checkpoint-qualification.js'

const PREVIEW_TTL_MS = 10 * 60_000
const PUBLICATION_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/

/** Trusted main-process collaborators; this profile is never supplied by renderer or IPC input. */
export interface AnimaGenerationQualificationProfile {
  readonly checkpointQualifier: (managedPath: string) => Promise<void>
  readonly qwen3Encoder: { readonly sha256: string; readonly sizeBytes: number }
  readonly vae: { readonly sha256: string; readonly sizeBytes: number }
}

export interface VerifiedAnimaGenerationComponent {
  byteSize: number
  localModelId: string
  localVersionId: string
  managedPath: string
  sha256: string
}

export interface VerifiedAnimaGenerationBundle {
  architecture: 'anima-base-1.0'
  checkpoint: { byteSize: number; managedPath: string; reference: ExactCheckpoint }
  qwen3Encoder: VerifiedAnimaGenerationComponent
  vae: VerifiedAnimaGenerationComponent
}

interface PreviewSession {
  expiresAt: number
  preview: Extract<CivitaiImportPreview, { kind: 'select-file' }>
}

type ExactCheckpoint = NonNullable<IgsProjectDocumentV1['generationDraft']['model']>

const ANIMA_GENERATION_QUALIFICATION_PROFILE: AnimaGenerationQualificationProfile = Object.freeze({
  checkpointQualifier: qualifyAnimaCheckpoint,
  qwen3Encoder: ANIMA_QWEN3_0_6B_ENCODER,
  vae: ANIMA_QWEN_IMAGE_VAE,
})

export class ModelServiceError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ModelServiceError'
  }
}

function publicationTime(value: string | undefined): number | null {
  if (!value || !PUBLICATION_TIMESTAMP.test(value)) {
    return null
  }
  const time = Date.parse(value)
  return Number.isFinite(time) ? time : null
}

/**
 * App-owned model catalog and import planning. URLs used to fetch weights and the token never leave
 * the main process: the renderer receives only the bounded preview projection below.
 */
export class ModelService {
  private readonly fileStatusCache = new Map<
    string,
    { fingerprint: string; sha256: string; status: 'corrupt' | 'ready' }
  >()
  private readonly fileStatusInFlight = new Map<string, Promise<'corrupt' | 'ready'>>()
  private readonly previews = new Map<string, PreviewSession>()

  constructor(
    readonly repository: ModelRepository,
    readonly civitai: CivitaiClient,
    readonly tokenStore: CivitaiTokenStore,
    _legacyCacheRoot?: string,
    private readonly compatibilityManifest: readonly CheckpointCompatibilityFingerprint[] = CHECKPOINT_COMPATIBILITY_MANIFEST,
    private readonly checkpointQualifier: (
      managedPath: string,
    ) => Promise<void> = qualifySdxlCheckpoint,
    private readonly loraQualifier: (managedPath: string) => Promise<void> = qualifyIllustriousLora,
    private readonly animaQualificationProfile: AnimaGenerationQualificationProfile = ANIMA_GENERATION_QUALIFICATION_PROFILE,
    /** Trusted Main collaborator, never configurable through IPC or Project inputs. */
    private readonly animaLoraQualifier: (managedPath: string) => Promise<void> = qualifyAnimaLora,
    private readonly resourcePreviews?: Pick<ModelPreviewCache, 'get' | 'read'>,
  ) {}

  /** Generate never silently binds a typed activation literal or guesses among exact versions. */
  async assertNoUnboundGenerationEmbeddings(input: {
    modelFamily: string | null
    negativePrompt: GenerationPrompt
    positivePrompt: GenerationPrompt
  }): Promise<void> {
    const captured = structuredClone(input)
    const sources = embeddingSourcesFromCatalog(await this.getCatalog())
    for (const prompt of [captured.positivePrompt, captured.negativePrompt]) {
      for (const match of getPromptEmbeddingMatches(prompt, sources, true, captured.modelFamily)) {
        if (match.candidates.length && match.ref?.resource.kind !== 'embedding') {
          throw new ModelServiceError(
            'MODEL_EMBEDDING_UNBOUND',
            `The embedding token ${match.token} has no exact resource reference. Select its installed version through prompt suggestions, or remove the token.`,
          )
        }
      }
    }
  }

  async checkUpdates(
    modelId: number,
  ): Promise<{ availableVersions: { id: number; name: string }[] }> {
    if (!Number.isSafeInteger(modelId) || modelId <= 0) {
      throw new ModelServiceError('MODEL_INVALID_ID', 'Invalid CivitAI model ID.')
    }
    const installed = await this.repository.listInstalled()
    const model = installed.find(
      (item) => item.source.kind === 'civitai' && item.source.modelId === modelId,
    )
    if (!model) {
      throw new ModelServiceError('MODEL_NOT_INSTALLED', 'This model is not installed.')
    }
    const token = await this.requireToken()
    const preview = await this.civitai.previewImport(`https://civitai.com/models/${modelId}`, token)
    if (preview.kind !== 'select-version') {
      throw new ModelServiceError('CIVITAI_INVALID_RESPONSE', 'CivitAI returned invalid versions.')
    }
    const datedVersions = preview.versions.map((version) => ({
      ...version,
      publicationTime: publicationTime(version.publishedAt),
    }))
    if (datedVersions.some((version) => version.publicationTime === null)) {
      throw new ModelServiceError(
        'CIVITAI_VERSION_DATE_UNKNOWN',
        'CivitAI did not provide enough publication dates to check for newer versions.',
      )
    }
    const installedIds = new Set(model.versions.map((version) => version.civitaiVersionId))
    const installedTimes = datedVersions
      .filter((version) => installedIds.has(version.id))
      .map((version) => version.publicationTime!)
    if (installedTimes.length !== installedIds.size) {
      throw new ModelServiceError(
        'CIVITAI_VERSION_DATE_UNKNOWN',
        'CivitAI no longer lists every installed version, so newer versions cannot be verified.',
      )
    }
    const newestInstalled = Math.max(...installedTimes)
    return {
      availableVersions: datedVersions
        .filter(
          (version) => !installedIds.has(version.id) && version.publicationTime! > newestInstalled,
        )
        .sort((left, right) => right.publicationTime! - left.publicationTime!)
        .map(({ id, name }) => ({ id, name })),
    }
  }

  async findVerifiedFileByHash(
    sha256: string,
    requiredType?: StoredResourceType,
  ): Promise<InstalledModelFile | null> {
    const installed = await this.repository.listInstalled()
    for (const resource of installed) {
      if (requiredType && resource.type !== requiredType) {
        continue
      }
      for (const version of resource.versions) {
        if (version.file.sha256 === sha256 && (await this.isVerifiedFile(version.file))) {
          return version.file
        }
      }
    }
    return null
  }

  forgetPreview(previewId: string): void {
    this.previews.delete(previewId)
  }

  async getCatalog(options: { buildPreviews?: boolean } = {}): Promise<ModelCatalogItem[]> {
    const installed = await this.repository.listInstalled()
    const predictionOverrides = new Map(
      (await this.repository.listPredictionOverrides()).map((override) => [
        `${override.sha256}:${override.sizeBytes}`,
        override.predictionType,
      ]),
    )
    const noiseOverrides = new Map(
      (await this.repository.listNoiseProfileOverrides()).map((override) => [
        `${override.sha256}:${override.sizeBytes}`,
        override,
      ]),
    )
    const versionsById = new Map(
      installed.flatMap((model) => model.versions.map((version) => [version.id, version] as const)),
    )
    return Promise.all(
      installed
        .filter((model) => model.source.kind === 'civitai')
        .map(async (model) => {
          const previews = new Map(
            await Promise.all(
              model.versions.map(async (version) => {
                // Historical resource URLs have no exact owner when several versions exist.
                const url = Object.hasOwn(version.sourceMetadata, 'previewImageUrl')
                  ? version.sourceMetadata.previewImageUrl
                  : model.versions.length === 1
                    ? model.previewUrl
                    : null
                return [
                  version.id,
                  await this.resourcePreview(url, options.buildPreviews === true),
                ] as const
              }),
            ),
          )
          const source = model.source
          const defaultVersion =
            model.versions.find((version) => version.id === model.defaultVersionId) ??
            model.versions[0]
          const trainedWords = defaultVersion?.sourceMetadata.trainedWords
          return {
            author: model.creator,
            defaultVersionId: model.defaultVersionId,
            description: model.description,
            id: model.id,
            modelId: source.kind === 'civitai' ? source.modelId : null,
            name: model.displayName,
            previewDataUrl: model.defaultVersionId
              ? (previews.get(model.defaultVersionId)?.previewDataUrl ?? null)
              : null,
            resourceType: model.type as ModelCatalogItem['resourceType'],
            sourceUrl:
              source.kind === 'civitai' ? `https://civitai.com/models/${source.modelId}` : null,
            thumbnailDataUrl: model.defaultVersionId
              ? (previews.get(model.defaultVersionId)?.thumbnailDataUrl ?? null)
              : null,
            trainedWords: Array.isArray(trainedWords)
              ? trainedWords.filter((word): word is string => typeof word === 'string')
              : [],
            versions: await Promise.all(
              model.versions.map(async (version): Promise<ModelVersionView> => {
                const primaryStatus = await this.catalogFileStatus(version.file)
                const prediction = this.effectivePredictionType(
                  model.type,
                  version,
                  predictionOverrides.get(`${version.file.sha256}:${version.file.sizeBytes}`) ??
                    null,
                )
                const dependencyIssues: string[] = []
                const animaComponents: Partial<Pick<AnimaModelBundleView, 'qwen3Encoder' | 'vae'>> =
                  {}
                if (model.type === 'checkpoint' && version.baseModelFamily === 'anima') {
                  for (const role of ['qwen3_encoder', 'vae'] as const) {
                    const dependencyId = version.dependencyVersionIds[role]
                    const dependency = dependencyId ? versionsById.get(dependencyId) : null
                    const dependencyResource = installed.find((candidate) =>
                      candidate.versions.some((item) => item.id === dependencyId),
                    )
                    const expected =
                      role === 'qwen3_encoder'
                        ? this.animaQualificationProfile.qwen3Encoder
                        : this.animaQualificationProfile.vae
                    if (
                      !dependency ||
                      dependencyResource?.type !== role ||
                      dependencyResource.source.kind !== 'supported_dependency' ||
                      dependency.baseModelFamily !== 'anima' ||
                      dependency.predictionType !== null ||
                      dependency.file.sha256 !== expected.sha256 ||
                      dependency.file.sizeBytes !== expected.sizeBytes ||
                      (await this.catalogFileStatus(dependency.file)) !== 'ready'
                    ) {
                      dependencyIssues.push(role)
                    } else {
                      animaComponents[role === 'qwen3_encoder' ? 'qwen3Encoder' : 'vae'] = {
                        byteSize: dependency.file.sizeBytes,
                        localModelId: dependencyResource.id,
                        localVersionId: dependency.id,
                        sha256: dependency.file.sha256,
                      }
                    }
                  }
                }
                return {
                  ...(primaryStatus === 'ready' &&
                  dependencyIssues.length === 0 &&
                  animaComponents.qwen3Encoder &&
                  animaComponents.vae
                    ? {
                        anima: {
                          architecture: 'anima-base-1.0' as const,
                          checkpointByteSize: version.file.sizeBytes,
                          qwen3Encoder: animaComponents.qwen3Encoder,
                          vae: animaComponents.vae,
                        },
                      }
                    : {}),
                  baseModelFamily: version.baseModelFamily,
                  civitaiFileId: version.civitaiFileId,
                  civitaiVersionId: version.civitaiVersionId,
                  dependencyIssues,
                  fileName: version.file.originalFilename,
                  fileSizeBytes: version.file.sizeBytes,
                  fileStatus:
                    primaryStatus === 'ready' && dependencyIssues.length > 0
                      ? 'missing'
                      : primaryStatus,
                  format: version.format,
                  id: version.id,
                  installedAt: version.createdAt,
                  name: version.name,
                  ...(model.type === 'checkpoint' && version.baseModelFamily === 'illustrious'
                    ? {
                        noiseProfile: this.effectiveNoiseProfile(
                          noiseOverrides.get(`${version.file.sha256}:${version.file.sizeBytes}`) ??
                            null,
                        ),
                      }
                    : {}),
                  predictionType: prediction.value,
                  predictionTypeSource: prediction.source,
                  previewDataUrl: previews.get(version.id)?.previewDataUrl ?? null,
                  sha256: version.file.sha256,
                  thumbnailDataUrl: previews.get(version.id)?.thumbnailDataUrl ?? null,
                  trainedWords: Array.isArray(version.sourceMetadata.trainedWords)
                    ? version.sourceMetadata.trainedWords.filter(
                        (word): word is string => typeof word === 'string',
                      )
                    : [],
                }
              }),
            ),
          } satisfies ModelCatalogItem
        }),
    )
  }

  getPreviewSession(previewId: string): PreviewSession {
    this.prunePreviewSessions()
    const session = this.previews.get(previewId)
    if (!session) {
      throw new ModelServiceError(
        'MODEL_PREVIEW_EXPIRED',
        'Refresh the import preview before installing.',
      )
    }
    return session
  }

  async getStorageSummary(): Promise<{ totalBytes: number }> {
    const installed = await this.repository.listInstalled()
    const seenInodes = new Set<string>()
    let totalBytes = 0
    for (const version of installed.flatMap((resource) => resource.versions)) {
      try {
        const file = await lstat(version.file.managedPath)
        if (!file.isFile() || file.isSymbolicLink()) {
          continue
        }
        const inode = `${file.dev}:${file.ino}`
        if (seenInodes.has(inode)) {
          continue
        }
        seenInodes.add(inode)
        totalBytes += file.size
      } catch {
        // Missing files are reported in the catalog and occupy no local storage.
      }
    }
    return { totalBytes }
  }

  async getTokenStatus(): Promise<CivitaiTokenStatus> {
    const status = await this.tokenStore.getStatus()
    if (status.kind === 'unavailable') {
      const detail =
        status.reason === 'basic_text'
          ? 'Secure token storage is unavailable: Linux selected the basic_text backend.'
          : 'Secure token storage is unavailable on this system.'
      return { detail, kind: 'unavailable' }
    }
    if (status.kind === 'missing') {
      return { detail: 'Connect a CivitAI API token to install models.', kind: 'missing' }
    }
    if (status.kind === 'unreadable') {
      return { detail: 'The saved CivitAI token could not be read.', kind: 'failed' }
    }
    try {
      const token = await this.tokenStore.readToken()
      if (!token) {
        return { detail: 'Connect a CivitAI API token to install models.', kind: 'missing' }
      }
      await this.civitai.validateToken(token)
      return { detail: 'CivitAI token is connected.', kind: 'connected' }
    } catch {
      return {
        detail: 'CivitAI token could not be verified. Check the token or connection.',
        kind: 'failed',
      }
    }
  }

  async previewImport(url: string): Promise<ModelImportPreview> {
    if (typeof url !== 'string' || url.length > 2048) {
      throw new ModelServiceError('CIVITAI_INVALID_URL', 'Enter a CivitAI model URL.')
    }
    const token = await this.requireToken()
    const preview = await this.civitai.previewImport(url, token)
    if (preview.kind === 'select-version') {
      return preview
    }

    const needsAnimaCompanions =
      preview.resourceType === 'checkpoint' && preview.baseModelFamily === 'anima'
    const files = preview.files
    const installed = await this.repository.listInstalled()
    const companionStatus = needsAnimaCompanions
      ? await Promise.all(
          [
            { artifact: ANIMA_QWEN3_0_6B_ENCODER, role: 'qwen3_encoder' as const },
            { artifact: ANIMA_QWEN_IMAGE_VAE, role: 'vae' as const },
          ].map(async ({ artifact, role }) => ({
            alreadyInstalled: (await this.findVerifiedFileByHash(artifact.sha256, role)) !== null,
            name: artifact.path.split('/').at(-1) ?? artifact.path,
            role,
            sizeBytes: artifact.sizeBytes,
          })),
        )
      : []
    const fileChoices = await Promise.all(
      files.map(async (file) => {
        const exact = await this.repository.findExactFileDuplicate({
          civitai: {
            fileId: file.fileId,
            modelId: preview.modelId,
            versionId: preview.versionId,
          },
        })
        const exactVersion = installed
          .flatMap((resource) => resource.versions)
          .find((version) => version.id === exact?.versionId)
        const primaryReady = exactVersion ? await this.isVerifiedFile(exactVersion.file) : false
        const dependenciesReady =
          !needsAnimaCompanions ||
          (exactVersion !== undefined &&
            (
              await Promise.all(
                (['qwen3_encoder', 'vae'] as const).map(async (role) => {
                  const dependencyId = exactVersion.dependencyVersionIds[role]
                  const dependency = installed.find((resource) =>
                    resource.versions.some((item) => item.id === dependencyId),
                  )
                  const dependencyVersion = dependency?.versions.find(
                    (item) => item.id === dependencyId,
                  )
                  const expectedSha =
                    role === 'qwen3_encoder'
                      ? ANIMA_QWEN3_0_6B_ENCODER.sha256
                      : ANIMA_QWEN_IMAGE_VAE.sha256
                  return (
                    dependency?.type === role &&
                    dependency.source.kind === 'supported_dependency' &&
                    dependencyVersion?.baseModelFamily === 'anima' &&
                    dependencyVersion.file.sha256 === expectedSha &&
                    (await this.isVerifiedFile(dependencyVersion.file))
                  )
                }),
              )
            ).every(Boolean))
        const alreadyInstalled = primaryReady && dependenciesReady
        const reusable =
          !alreadyInstalled && (file.sha256 || exactVersion?.file.sha256)
            ? await this.findVerifiedFileByHash(file.sha256 ?? exactVersion!.file.sha256)
            : null
        return {
          alreadyInstalled,
          fileId: file.fileId,
          format: file.format,
          license:
            needsAnimaCompanions && isPinnedAnimaBaseCheckpoint(file.sha256)
              ? {
                  name: 'CircleStone Non-Commercial License',
                  summary: 'Anima Base 1.0 is only for non-commercial, non-production use.',
                  url: ANIMA_SOURCE_LICENSE.url,
                }
              : null,
          name: file.name,
          needsRepair: !!exact && !alreadyInstalled,
          primary: file.primary,
          reusesInstalledFile: reusable !== null,
          sha256: file.sha256,
          sizeEstimateBytes:
            needsAnimaCompanions && isPinnedAnimaBaseCheckpoint(file.sha256)
              ? ANIMA_BASE_1_0_CHECKPOINT.sizeBytes
              : (exactVersion?.file.sizeBytes ?? reusable?.sizeBytes ?? file.sizeEstimateBytes),
        }
      }),
    )
    const previewId = randomUUID()
    this.prunePreviewSessions()
    this.previews.set(previewId, {
      expiresAt: Date.now() + PREVIEW_TTL_MS,
      preview: { ...preview, files },
    })
    const selectedEstimate = fileChoices.find((file) => file.primary) ?? fileChoices[0]
    const totalAdditionalBytes =
      selectedEstimate && selectedEstimate.sizeEstimateBytes !== null
        ? (selectedEstimate.alreadyInstalled || selectedEstimate.reusesInstalledFile
            ? 0
            : selectedEstimate.sizeEstimateBytes) +
          (needsAnimaCompanions
            ? companionStatus.reduce(
                (sum, companion) => sum + (companion.alreadyInstalled ? 0 : companion.sizeBytes),
                0,
              )
            : 0)
        : null
    const previewImageDataUrl =
      (await this.resourcePreview(preview.previewImageUrl))?.previewDataUrl ?? null
    return {
      author: preview.author,
      baseModel: preview.baseModel,
      baseModelFamily: preview.baseModelFamily,
      dependencies: needsAnimaCompanions ? companionStatus : [],
      description: preview.description,
      files: fileChoices,
      kind: 'select-file',
      license: selectedEstimate?.license ?? null,
      modelId: preview.modelId,
      modelName: preview.modelName,
      previewId,
      previewImageDataUrl,
      resourceType: preview.resourceType,
      totalAdditionalBytes,
      trainedWords: preview.trainedWords,
      versionId: preview.versionId,
      versionName: preview.versionName,
    }
  }

  /** Call only with a file whose bytes were hashed by the installer or this service. */
  qualifiedPredictionTypeForVerifiedCheckpoint(file: {
    baseModelFamily: BaseModelFamily | null
    sha256: string
    sizeBytes: number
  }) {
    return qualifiedCheckpointPredictionType(file, this.compatibilityManifest)
  }

  async removeToken(): Promise<CivitaiTokenStatus> {
    await this.tokenStore.removeToken()
    return this.getTokenStatus()
  }

  async requireToken(): Promise<string> {
    const token = await this.tokenStore.readToken()
    if (!token) {
      throw new ModelServiceError('CIVITAI_TOKEN_REQUIRED', 'Connect a CivitAI token first.')
    }
    return token
  }

  /** Resolve a user-picked exact checkpoint into a portable Project ref, never a renderer claim. */
  async resolveGenerationCheckpoint(
    resourceId: string,
    versionId: string,
  ): Promise<NonNullable<IgsProjectDocumentV1['generationDraft']['model']>> {
    return this.resolveGenerationResource(resourceId, versionId, 'checkpoint')
  }

  async resolveGenerationLora(
    resourceId: string,
    versionId: string,
  ): Promise<NonNullable<IgsProjectDocumentV1['generationDraft']['model']>> {
    return this.resolveGenerationResource(resourceId, versionId, 'lora')
  }

  /** Only verified registry choices create sidecars; existing copied refs remain authoring data. */
  async resolveGenerationPromptEmbeddings(input: {
    modelFamily: string | null
    prompt: GenerationPrompt
    selection?: PromptEmbeddingSelection
    text: string
  }): Promise<GenerationPrompt> {
    const captured = structuredClone(input)
    const prompt = { ...captured.prompt, text: captured.text }
    const sources = embeddingSourcesFromCatalog(await this.getCatalog())
    const candidates = selectablePromptEmbeddingSources(sources, captured.modelFamily)
    // Availability does not erase installed ownership. A missing/corrupt sibling never makes
    // another version an implicit choice; explicit completion can still choose a verified one.
    const automaticCandidates = candidates.filter((candidate) =>
      sources
        .filter(
          (source) =>
            source.token === candidate.token &&
            source.resource.baseModelFamily === 'illustrious' &&
            source.resource.predictionType === null,
        )
        .every((owner) => sameExactPromptEmbedding(owner.resource, candidate.resource)),
    )
    const verified = new Map<string, GenerationPrompt['embeddingRefs'][number]['resource']>()
    const identityKey = (ref: GenerationPrompt['embeddingRefs'][number]) =>
      JSON.stringify([ref.resource.localModelId, ref.resource.localVersionId, ref.token])
    const verify = async (ref: GenerationPrompt['embeddingRefs'][number]) => {
      const resolved = await this.resolveGenerationResourceWithFile(
        ref.resource.localModelId,
        ref.resource.localVersionId,
        'embedding',
      )
      if (
        embeddingActivationToken(resolved.originalFilename) !== ref.token ||
        !sameExactPromptEmbedding(resolved.reference, ref.resource)
      ) {
        throw new ModelServiceError(
          'MODEL_VERSION_MISMATCH',
          'The installed embedding changed while its exact token and file were being verified.',
        )
      }
      verified.set(identityKey(ref), resolved.reference)
      return resolved.reference
    }

    let selected: GenerationPrompt['embeddingRefs'][number] | undefined
    if (captured.selection) {
      const choice = captured.selection
      const candidate = candidates.find(
        (source) =>
          source.resource.localModelId === choice.resourceId &&
          source.resource.localVersionId === choice.versionId &&
          source.token === choice.token,
      )
      if (!candidate) {
        throw new ModelServiceError(
          'MODEL_EMBEDDING_SELECTION_UNAVAILABLE',
          'Choose an available Illustrious embedding version and its exact activation token.',
        )
      }
      const selectedRef = { resource: candidate.resource, token: candidate.token }
      const resource = await verify(selectedRef)
      const existing = prompt.embeddingRefs.find(
        (ref) =>
          ref.token === selectedRef.token && sameExactPromptEmbedding(ref.resource, resource),
      )
      selected = existing ?? { resource, token: candidate.token }
    }

    const reconciled = reconcilePromptEmbeddings(prompt, automaticCandidates, selected)
    if (
      selected &&
      !reconciled.embeddingRefs.some((ref) => identityKey(ref) === identityKey(selected))
    ) {
      throw new ModelServiceError(
        'MODEL_EMBEDDING_SELECTION_UNAVAILABLE',
        'The selected embedding activation token must appear in the prompt text.',
      )
    }
    for (const ref of reconciled.embeddingRefs) {
      const retained = prompt.embeddingRefs.some(
        (before) =>
          before.token === ref.token && sameExactPromptEmbedding(before.resource, ref.resource),
      )
      if (retained) {
        continue
      }
      const key = identityKey(ref)
      ref.resource = verified.get(key) ?? (await verify(ref))
    }
    return structuredClone(reconciled)
  }

  /** Select a verified managed component; this does not qualify it for inference. */
  async resolveGenerationVae(
    resourceId: string,
    versionId: string,
  ): Promise<NonNullable<IgsProjectDocumentV1['generationDraft']['vae']>> {
    return this.resolveGenerationResource(resourceId, versionId, 'vae')
  }

  /** Bind a portable Project reference to this installation only by its exact source/file identity. */
  async resolvePortableGenerationCheckpoint(
    saved: NonNullable<IgsProjectDocumentV1['generationDraft']['model']>,
  ): Promise<NonNullable<IgsProjectDocumentV1['generationDraft']['model']>> {
    return this.resolvePortableGenerationResource(saved, 'checkpoint')
  }

  async resolvePortableGenerationEmbedding(
    saved: GenerationPrompt['embeddingRefs'][number]['resource'],
  ): Promise<GenerationPrompt['embeddingRefs'][number]['resource']> {
    return this.resolvePortableGenerationResource(saved, 'embedding')
  }

  async resolvePortableGenerationLora(
    saved: NonNullable<IgsProjectDocumentV1['generationDraft']['model']>,
  ): Promise<NonNullable<IgsProjectDocumentV1['generationDraft']['model']>> {
    return this.resolvePortableGenerationResource(saved, 'lora')
  }

  async resolvePortableGenerationVae(
    saved: NonNullable<IgsProjectDocumentV1['generationDraft']['vae']>,
  ): Promise<NonNullable<IgsProjectDocumentV1['generationDraft']['vae']>> {
    return this.resolvePortableGenerationResource(saved, 'vae')
  }

  /** Qualify an exact Anima adapter independently of public generation admission. */
  async resolveVerifiedAnimaGenerationLoraForPlan(
    inputSaved: NonNullable<IgsProjectDocumentV1['generationDraft']['model']>,
  ): Promise<{ byteSize: number; managedPath: string; reference: typeof inputSaved }> {
    const saved = structuredClone(inputSaved)
    if (saved.kind !== 'lora' || saved.baseModelFamily !== 'anima') {
      throw new ModelServiceError(
        'MODEL_FAMILY_UNSUPPORTED',
        'This qualification requires an Anima LoRA.',
      )
    }
    const resolveExact = async () => {
      const resolved = await this.resolveGenerationResourceWithFile(
        saved.localModelId,
        saved.localVersionId,
        'lora',
      )
      const reference = resolved.reference
      if (reference.baseModelFamily !== 'anima') {
        throw new ModelServiceError('MODEL_FAMILY_UNSUPPORTED', 'The installed LoRA is not Anima.')
      }
      if (
        saved.localModelId !== reference.localModelId ||
        saved.localVersionId !== reference.localVersionId ||
        saved.civitaiModelId !== reference.civitaiModelId ||
        saved.civitaiVersionId !== reference.civitaiVersionId ||
        saved.civitaiFileId !== reference.civitaiFileId ||
        saved.fileSha256 !== reference.fileSha256 ||
        saved.baseModelFamily !== reference.baseModelFamily
      ) {
        throw new ModelServiceError(
          'MODEL_VERSION_MISMATCH',
          'The installed Anima LoRA no longer matches this Project exact version.',
        )
      }
      return resolved
    }
    const resolved = await resolveExact()
    if (path.extname(resolved.managedPath).toLowerCase() !== '.safetensors') {
      throw new ModelServiceError(
        'MODEL_LORA_INCOMPATIBLE',
        'Anima qualification requires a safetensors LoRA.',
      )
    }
    try {
      await this.animaLoraQualifier(resolved.managedPath)
    } catch (error) {
      throw new ModelServiceError(
        'MODEL_LORA_INCOMPATIBLE',
        error instanceof Error
          ? `The installed Anima LoRA is unsupported: ${error.message}`
          : 'The installed Anima LoRA could not be structurally qualified.',
      )
    }
    // Rehash and reread registry identity after the qualifier awaited. A changed
    // file, path, source or family must not escape in a successfully returned plan.
    const current = await resolveExact()
    if (
      current.managedPath !== resolved.managedPath ||
      current.fileSizeBytes !== resolved.fileSizeBytes
    ) {
      throw new ModelServiceError(
        'MODEL_VERSION_MISMATCH',
        'The installed Anima LoRA changed during qualification.',
      )
    }
    return { byteSize: resolved.fileSizeBytes, managedPath: resolved.managedPath, reference: saved }
  }

  /**
   * Qualify one exact Anima bundle without admitting a generation job. The copied Project reference
   * retains authored labels; dependency paths come only from its installed links.
   */
  async resolveVerifiedGenerationAnimaBundleForPlan(
    inputSaved: ExactCheckpoint,
  ): Promise<VerifiedAnimaGenerationBundle> {
    const saved = structuredClone(inputSaved)
    if (saved.kind !== 'checkpoint') {
      throw new ModelServiceError(
        'MODEL_VERSION_MISMATCH',
        'The Project resource is not a checkpoint.',
      )
    }
    if (saved.baseModelFamily !== 'anima') {
      throw new ModelServiceError(
        'MODEL_FAMILY_UNSUPPORTED',
        'This qualification requires an Anima checkpoint.',
      )
    }
    if (saved.predictionType !== null) {
      throw new ModelServiceError(
        'MODEL_PREDICTION_UNSUPPORTED',
        'Anima does not use an SDXL prediction type.',
      )
    }
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuid.test(saved.localModelId) || !uuid.test(saved.localVersionId)) {
      throw new ModelServiceError('MODEL_INVALID_ID', 'Invalid resource or version ID.')
    }
    const installed = await this.repository.listInstalled()
    const resource = installed.find((item) => item.id === saved.localModelId)
    const version = resource?.versions.find((item) => item.id === saved.localVersionId)
    if (
      resource?.type !== 'checkpoint' ||
      resource.source.kind !== 'civitai' ||
      !version ||
      version.civitaiFileId === null ||
      version.civitaiVersionId === null
    ) {
      throw new ModelServiceError(
        'MODEL_VERSION_UNAVAILABLE',
        'This Anima checkpoint version is not installed.',
      )
    }
    if (version.baseModelFamily !== 'anima') {
      throw new ModelServiceError(
        'MODEL_FAMILY_UNSUPPORTED',
        'The installed checkpoint is not Anima.',
      )
    }
    if (version.predictionType !== null) {
      throw new ModelServiceError(
        'MODEL_PREDICTION_UNSUPPORTED',
        'Anima does not use an SDXL prediction type.',
      )
    }
    if (
      saved.civitaiModelId !== resource.source.modelId ||
      saved.civitaiVersionId !== version.civitaiVersionId ||
      saved.civitaiFileId !== version.civitaiFileId ||
      saved.fileSha256 !== version.file.sha256
    ) {
      throw new ModelServiceError(
        'MODEL_VERSION_MISMATCH',
        'The installed Anima checkpoint no longer matches this Project exact version.',
      )
    }
    const verifyCheckpoint = async (): Promise<void> => {
      const status = await this.actualFileStatus(version.file, true)
      if (status !== 'ready') {
        throw new ModelServiceError(
          status === 'missing' ? 'MODEL_FILE_MISSING' : 'MODEL_FILE_CORRUPT',
          status === 'missing'
            ? 'The selected Anima checkpoint file is missing.'
            : 'The selected Anima checkpoint file failed verification.',
        )
      }
    }
    await verifyCheckpoint()
    const components: Partial<Record<'qwen3_encoder' | 'vae', VerifiedAnimaGenerationComponent>> =
      {}
    const dependencyFiles = new Map<'qwen3_encoder' | 'vae', InstalledModelFile>()
    for (const [role, expected] of [
      ['qwen3_encoder', this.animaQualificationProfile.qwen3Encoder],
      ['vae', this.animaQualificationProfile.vae],
    ] as const) {
      const dependencyId = version.dependencyVersionIds[role]
      const dependencyResource = installed.find((item) =>
        item.versions.some((candidate) => candidate.id === dependencyId),
      )
      const dependency = dependencyResource?.versions.find((item) => item.id === dependencyId)
      if (
        dependencyResource?.type !== role ||
        dependencyResource.source.kind !== 'supported_dependency' ||
        dependency?.baseModelFamily !== 'anima' ||
        dependency.predictionType !== null ||
        dependency.file.sha256 !== expected.sha256 ||
        dependency.file.sizeBytes !== expected.sizeBytes ||
        !(await this.isVerifiedFile(dependency.file))
      ) {
        throw new ModelServiceError(
          'ANIMA_DEPENDENCY_UNAVAILABLE',
          `The required pinned Anima ${role} is missing or failed verification.`,
        )
      }
      components[role] = {
        byteSize: dependency.file.sizeBytes,
        localModelId: dependencyResource.id,
        localVersionId: dependency.id,
        managedPath: dependency.file.managedPath,
        sha256: dependency.file.sha256,
      }
      dependencyFiles.set(role, dependency.file)
    }
    try {
      await this.animaQualificationProfile.checkpointQualifier(version.file.managedPath)
    } catch (error) {
      throw new ModelServiceError(
        'MODEL_CHECKPOINT_INCOMPATIBLE',
        error instanceof Error
          ? `The installed checkpoint is not a compatible Anima Base 1.0 checkpoint: ${error.message}`
          : 'The installed checkpoint could not be structurally qualified for Anima.',
      )
    }
    // Qualification awaits while another process may edit managed files. Later materialization
    // and worker loading must independently reverify these exact identities as well.
    await verifyCheckpoint()
    for (const [role, file] of dependencyFiles) {
      if (!(await this.isVerifiedFile(file))) {
        throw new ModelServiceError(
          'ANIMA_DEPENDENCY_UNAVAILABLE',
          `The required pinned Anima ${role} changed during structural qualification.`,
        )
      }
    }
    return {
      architecture: 'anima-base-1.0',
      checkpoint: {
        byteSize: version.file.sizeBytes,
        managedPath: version.file.managedPath,
        reference: saved,
      },
      qwen3Encoder: components.qwen3_encoder!,
      vae: components.vae!,
    }
  }

  /**
   * Resolve a saved exact checkpoint for a main-process generation plan, including its verified
   * file.
   */
  async resolveVerifiedGenerationCheckpointForPlan(
    saved: NonNullable<IgsProjectDocumentV1['generationDraft']['model']>,
  ): Promise<{
    managedPath: string
    noiseProfile: IllustriousNoiseProfileV1
    reference: NonNullable<IgsProjectDocumentV1['generationDraft']['model']>
  }> {
    if (saved.kind !== 'checkpoint') {
      throw new ModelServiceError(
        'MODEL_VERSION_MISMATCH',
        'The Project generation resource is not a checkpoint.',
      )
    }
    const resolved = await this.resolveGenerationResourceWithFile(
      saved.localModelId,
      saved.localVersionId,
      'checkpoint',
    )
    const reference = resolved.reference
    if (reference.baseModelFamily !== 'illustrious') {
      throw new ModelServiceError(
        'MODEL_FAMILY_UNSUPPORTED',
        'This generation path currently supports only Illustrious checkpoints.',
      )
    }
    if (
      saved.localModelId !== reference.localModelId ||
      saved.localVersionId !== reference.localVersionId ||
      saved.civitaiModelId !== reference.civitaiModelId ||
      saved.civitaiVersionId !== reference.civitaiVersionId ||
      saved.civitaiFileId !== reference.civitaiFileId ||
      saved.fileSha256 !== reference.fileSha256 ||
      saved.baseModelFamily !== reference.baseModelFamily
    ) {
      throw new ModelServiceError(
        'MODEL_VERSION_MISMATCH',
        'The installed checkpoint no longer matches this Project exact version.',
      )
    }
    if (reference.predictionType !== 'epsilon' && reference.predictionType !== 'v_prediction') {
      throw new ModelServiceError(
        'MODEL_PREDICTION_UNSUPPORTED',
        'This inference runtime supports only epsilon and v_prediction checkpoints.',
      )
    }
    try {
      await this.checkpointQualifier(resolved.managedPath)
    } catch (error) {
      throw new ModelServiceError(
        'MODEL_CHECKPOINT_INCOMPATIBLE',
        error instanceof SdxlCheckpointQualificationError
          ? `The installed checkpoint is not a compatible single-file SDXL base checkpoint: ${error.message}`
          : 'The installed checkpoint could not be structurally qualified for SDXL generation.',
      )
    }
    // Prediction type belongs to the exact installed file, not to each Project. A saved .igs
    // reference may carry an old snapshot; use the current library setting after re-hashing the
    // exact file. The returned job reference freezes the value actually used for this run.
    const predictionType = reference.predictionType
    return {
      managedPath: resolved.managedPath,
      noiseProfile: this.effectiveNoiseProfile(
        await this.repository.getNoiseProfileOverride({
          sha256: reference.fileSha256,
          sizeBytes: resolved.fileSizeBytes,
        }),
      ).effective,
      reference: { ...reference, predictionType },
    }
  }

  /** Reverify exact dual-CLIP bytes; copied names and saved custom tokens remain Project data. */
  async resolveVerifiedGenerationEmbeddingForPlan(
    inputSaved: GenerationPrompt['embeddingRefs'][number]['resource'],
  ): Promise<{ byteSize: number; managedPath: string; reference: typeof inputSaved }> {
    const saved = structuredClone(inputSaved)
    if (
      saved.kind !== 'embedding' ||
      saved.baseModelFamily !== 'illustrious' ||
      saved.predictionType !== null
    ) {
      throw new ModelServiceError(
        'MODEL_FAMILY_UNSUPPORTED',
        'Generation requires an Illustrious embedding without a prediction type.',
      )
    }
    const resolved = await this.resolveGenerationResourceWithFile(
      saved.localModelId,
      saved.localVersionId,
      'embedding',
    )
    if (!sameExactPromptEmbedding(saved, resolved.reference)) {
      throw new ModelServiceError(
        'MODEL_VERSION_MISMATCH',
        'The installed embedding no longer matches this Project exact version.',
      )
    }
    try {
      await qualifyIllustriousEmbedding(resolved.managedPath)
    } catch (error) {
      throw new ModelServiceError(
        'MODEL_EMBEDDING_INCOMPATIBLE',
        error instanceof Error
          ? `The installed embedding is unsupported: ${error.message}`
          : 'The installed embedding could not be structurally qualified.',
      )
    }
    return {
      byteSize: resolved.fileSizeBytes,
      managedPath: resolved.managedPath,
      reference: structuredClone(saved),
    }
  }

  /** Reverify the exact enabled adapter without replacing the Project's copied metadata. */
  async resolveVerifiedGenerationLoraForPlan(
    inputSaved: NonNullable<IgsProjectDocumentV1['generationDraft']['model']>,
  ): Promise<{ byteSize: number; managedPath: string; reference: typeof inputSaved }> {
    const saved = structuredClone(inputSaved)
    if (saved.kind !== 'lora' || saved.baseModelFamily !== 'illustrious') {
      throw new ModelServiceError(
        'MODEL_FAMILY_UNSUPPORTED',
        'Generation requires an Illustrious LoRA.',
      )
    }
    const resolved = await this.resolveGenerationResourceWithFile(
      saved.localModelId,
      saved.localVersionId,
      'lora',
    )
    const reference = resolved.reference
    if (
      reference.baseModelFamily !== 'illustrious' ||
      saved.localModelId !== reference.localModelId ||
      saved.localVersionId !== reference.localVersionId ||
      saved.civitaiModelId !== reference.civitaiModelId ||
      saved.civitaiVersionId !== reference.civitaiVersionId ||
      saved.civitaiFileId !== reference.civitaiFileId ||
      saved.fileSha256 !== reference.fileSha256 ||
      saved.baseModelFamily !== reference.baseModelFamily
    ) {
      throw new ModelServiceError(
        'MODEL_VERSION_MISMATCH',
        'The installed LoRA no longer matches this Project exact version.',
      )
    }
    if (path.extname(resolved.managedPath).toLowerCase() !== '.safetensors') {
      throw new ModelServiceError(
        'MODEL_LORA_INCOMPATIBLE',
        'Generation requires a safetensors LoRA.',
      )
    }
    try {
      await this.loraQualifier(resolved.managedPath)
    } catch (error) {
      throw new ModelServiceError(
        'MODEL_LORA_INCOMPATIBLE',
        error instanceof Error
          ? `The installed LoRA is unsupported: ${error.message}`
          : 'The installed LoRA could not be structurally qualified.',
      )
    }
    return {
      byteSize: resolved.fileSizeBytes,
      managedPath: resolved.managedPath,
      reference: structuredClone(saved),
    }
  }

  /** Reverify an exact standalone VAE; source applicability is not inferred from tensor shapes. */
  async resolveVerifiedGenerationVaeForPlan(
    inputSaved: NonNullable<IgsProjectDocumentV1['generationDraft']['vae']>,
  ): Promise<{ byteSize: number; managedPath: string; reference: typeof inputSaved }> {
    const saved = structuredClone(inputSaved)
    if (
      saved.kind !== 'vae' ||
      saved.baseModelFamily !== 'illustrious' ||
      saved.predictionType !== null
    ) {
      throw new ModelServiceError(
        'MODEL_FAMILY_UNSUPPORTED',
        'Generation requires an Illustrious-compatible VAE without a prediction type.',
      )
    }
    const resolved = await this.resolveGenerationResourceWithFile(
      saved.localModelId,
      saved.localVersionId,
      'vae',
    )
    const reference = resolved.reference
    if (
      saved.localModelId !== reference.localModelId ||
      saved.localVersionId !== reference.localVersionId ||
      saved.civitaiModelId !== reference.civitaiModelId ||
      saved.civitaiVersionId !== reference.civitaiVersionId ||
      saved.civitaiFileId !== reference.civitaiFileId ||
      saved.fileSha256 !== reference.fileSha256 ||
      saved.baseModelFamily !== reference.baseModelFamily ||
      saved.predictionType !== reference.predictionType
    ) {
      throw new ModelServiceError(
        'MODEL_VERSION_MISMATCH',
        'The installed VAE no longer matches this Project exact version.',
      )
    }
    try {
      await qualifyIllustriousVae(resolved.managedPath)
    } catch (error) {
      throw new ModelServiceError(
        'MODEL_VAE_INCOMPATIBLE',
        error instanceof Error
          ? `The installed VAE is unsupported: ${error.message}`
          : 'The installed VAE could not be structurally qualified.',
      )
    }
    return {
      byteSize: resolved.fileSizeBytes,
      managedPath: resolved.managedPath,
      reference: structuredClone(saved),
    }
  }

  async saveToken(token: string): Promise<CivitaiTokenStatus> {
    validateCivitaiToken(token)
    const availability = await this.tokenStore.getAvailability()
    if (!availability.available) {
      throw new ModelServiceError(
        'TOKEN_SECURE_STORAGE_UNAVAILABLE',
        'Secure CivitAI token storage is unavailable on this system.',
      )
    }
    await this.civitai.validateToken(token)
    await this.tokenStore.saveToken(token)
    return { detail: 'CivitAI token is connected.', kind: 'connected' }
  }

  async setDefaultVersion(resourceId: string, versionId: string): Promise<void> {
    if (!/^[a-f0-9-]{36}$/i.test(resourceId) || !/^[a-f0-9-]{36}$/i.test(versionId)) {
      throw new ModelServiceError('MODEL_INVALID_ID', 'Invalid resource or version ID.')
    }
    const installed = await this.repository.listInstalled()
    const resource = installed.find((item) => item.id === resourceId)
    const version = resource?.versions.find((item) => item.id === versionId)
    if (!version || !(await this.isVerifiedFile(version.file))) {
      throw new ModelServiceError(
        'MODEL_VERSION_UNAVAILABLE',
        'This model version is missing or failed verification.',
      )
    }
    if (resource?.type === 'checkpoint' && version.baseModelFamily === 'anima') {
      for (const companion of [ANIMA_QWEN3_0_6B_ENCODER, ANIMA_QWEN_IMAGE_VAE]) {
        const role = companion.role === 'qwen3-encoder' ? 'qwen3_encoder' : 'vae'
        const dependencyResource = installed.find((item) =>
          item.versions.some((candidate) => candidate.id === version.dependencyVersionIds[role]),
        )
        const dependency = dependencyResource?.versions.find(
          (item) => item.id === version.dependencyVersionIds[role],
        )
        if (
          dependencyResource?.type !== role ||
          dependencyResource.source.kind !== 'supported_dependency' ||
          !dependency ||
          dependency.baseModelFamily !== 'anima' ||
          dependency.file.sha256 !== companion.sha256 ||
          !(await this.isVerifiedFile(dependency.file))
        ) {
          throw new ModelServiceError(
            'MODEL_VERSION_UNAVAILABLE',
            `The required Anima ${role} is missing or failed verification.`,
          )
        }
      }
    }
    await this.repository.setDefaultVersion(resourceId, versionId)
  }

  async setNoiseProfile(
    resourceId: string,
    versionId: string,
    change: SetCheckpointNoiseProfileChange,
  ): Promise<void> {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuid.test(resourceId) || !uuid.test(versionId)) {
      throw new ModelServiceError('MODEL_INVALID_ID', 'Invalid resource or version ID.')
    }
    if (!isCheckpointNoiseProfileChange(change)) {
      throw new ModelServiceError(
        'MODEL_NOISE_PROFILE_INVALID',
        'Choose a supported noise setting.',
      )
    }
    const installed = await this.repository.listInstalled()
    const resource = installed.find((item) => item.id === resourceId)
    const version = resource?.versions.find((item) => item.id === versionId)
    if (resource?.type !== 'checkpoint' || version?.baseModelFamily !== 'illustrious') {
      throw new ModelServiceError(
        'MODEL_VERSION_UNAVAILABLE',
        'Choose an installed Illustrious checkpoint version.',
      )
    }
    const status = await this.actualFileStatus(version.file, true)
    if (status !== 'ready') {
      throw new ModelServiceError(
        status === 'missing' ? 'MODEL_FILE_MISSING' : 'MODEL_FILE_CORRUPT',
        'The checkpoint file must pass verification before editing its noise settings.',
      )
    }
    await this.repository.setNoiseProfileOverride({
      change,
      expectedSha256: version.file.sha256,
      expectedSizeBytes: version.file.sizeBytes,
      resourceId,
      versionId,
    })
  }

  async setPredictionType(
    resourceId: string,
    versionId: string,
    predictionType: 'epsilon' | 'v_prediction',
  ): Promise<void> {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuid.test(resourceId) || !uuid.test(versionId)) {
      throw new ModelServiceError('MODEL_INVALID_ID', 'Invalid resource or version ID.')
    }
    if (predictionType !== 'epsilon' && predictionType !== 'v_prediction') {
      throw new ModelServiceError('MODEL_PREDICTION_INVALID', 'Choose a supported prediction type.')
    }
    const installed = await this.repository.listInstalled()
    const resource = installed.find((item) => item.id === resourceId)
    const version = resource?.versions.find((item) => item.id === versionId)
    if (resource?.type !== 'checkpoint' || version?.baseModelFamily !== 'illustrious') {
      throw new ModelServiceError(
        'MODEL_VERSION_UNAVAILABLE',
        'Choose an installed Illustrious checkpoint version.',
      )
    }
    const status = await this.actualFileStatus(version.file, true)
    if (status !== 'ready') {
      throw new ModelServiceError(
        status === 'missing' ? 'MODEL_FILE_MISSING' : 'MODEL_FILE_CORRUPT',
        'The checkpoint file must pass verification before editing its prediction type.',
      )
    }
    await this.repository.setPredictionOverride({
      expectedSha256: version.file.sha256,
      expectedSizeBytes: version.file.sizeBytes,
      predictionType,
      resourceId,
      versionId,
    })
  }

  /** Authoring Apply verifies selected exact files without changing copied advisory policy. */
  async verifyPresetApplication(
    request: PresetApplicationRequest,
    current: PresetApplicationTarget,
  ): Promise<void> {
    const payload = request.payload
    const references = [
      ...(payload.model ? [payload.model] : []),
      ...(payload.vae ? [payload.vae] : []),
      ...(payload.loras ?? []).map((entry) => entry.resource),
      ...(payload.prompt?.embeddingRefs ?? []).map((entry) => entry.resource),
      ...(payload.negativePrompt?.embeddingRefs ?? []).map((entry) => entry.resource),
    ]
    const diagnostics = presetApplicationDiagnostics({
      catalog: references.length ? await this.getCatalog({ buildPreviews: false }) : null,
      current,
      payload,
      selectedSections: request.selectedSections,
    })
    const blocking = diagnostics.find((item) => item.blocking)
    if (blocking) {
      throw new ModelServiceError('MODEL_PRESET_RESOURCE_UNAVAILABLE', blocking.message)
    }
    const verified = new Set<string>()
    for (const reference of references) {
      const key = JSON.stringify([
        reference.kind,
        reference.localModelId,
        reference.localVersionId,
        reference.fileSha256,
      ])
      if (verified.has(key)) {
        continue
      }
      const resolved = await this.resolveGenerationResource(
        reference.localModelId,
        reference.localVersionId,
        reference.kind,
      )
      if (
        resolved.kind !== reference.kind ||
        resolved.fileSha256 !== reference.fileSha256 ||
        resolved.baseModelFamily !== reference.baseModelFamily ||
        resolved.civitaiModelId !== reference.civitaiModelId ||
        resolved.civitaiVersionId !== reference.civitaiVersionId ||
        resolved.civitaiFileId !== reference.civitaiFileId
      ) {
        throw new ModelServiceError(
          'MODEL_VERSION_MISMATCH',
          'The selected preset resource changed during verification.',
        )
      }
      verified.add(key)
    }
  }

  private async actualFileStatus(
    file: {
      managedPath: string
      sha256: string
      sizeBytes: number
      status: 'corrupt' | 'missing' | 'ready'
    },
    force = false,
  ): Promise<'corrupt' | 'missing' | 'ready'> {
    if (file.status === 'corrupt') {
      this.fileStatusCache.delete(file.managedPath)
      return 'corrupt'
    }
    try {
      const stat = await lstat(file.managedPath, { bigint: true })
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== BigInt(file.sizeBytes)) {
        this.fileStatusCache.delete(file.managedPath)
        return 'corrupt'
      }
      const fingerprint = `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`
      const cached = this.fileStatusCache.get(file.managedPath)
      if (!force && cached?.fingerprint === fingerprint && cached.sha256 === file.sha256) {
        return cached.status
      }
      const key = JSON.stringify([file.managedPath, fingerprint, file.sha256])
      const inFlight = this.fileStatusInFlight.get(key)
      if (!force && inFlight) {
        return await inFlight
      }
      const verification = (async (): Promise<'corrupt' | 'ready'> => {
        const hash = createHash('sha256')
        for await (const part of createReadStream(file.managedPath)) {
          hash.update(part)
        }
        const after = await lstat(file.managedPath, { bigint: true })
        const afterFingerprint = `${after.dev}:${after.ino}:${after.size}:${after.mtimeNs}:${after.ctimeNs}`
        if (afterFingerprint !== fingerprint) {
          this.fileStatusCache.delete(file.managedPath)
          return 'corrupt'
        }
        const status = hash.digest('hex') === file.sha256 ? 'ready' : 'corrupt'
        this.fileStatusCache.set(file.managedPath, {
          fingerprint,
          sha256: file.sha256,
          status,
        })
        return status
      })()
      if (!force) {
        this.fileStatusInFlight.set(key, verification)
      }
      try {
        return await verification
      } finally {
        if (this.fileStatusInFlight.get(key) === verification) {
          this.fileStatusInFlight.delete(key)
        }
      }
    } catch (error) {
      this.fileStatusCache.delete(file.managedPath)
      return (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'corrupt'
    }
  }

  /**
   * Fast browsing status. `ready` is provisional on a cold catalog: SQLite says the file was
   * verified at install and lstat still matches its size/type, but no bytes are read here. Reuse a
   * current fingerprint-matched full verification when available. Selecting an exact Project
   * version, setting a default, and planning repair must still force SHA-256 verification.
   */
  private async catalogFileStatus(
    file: InstalledModelFile,
  ): Promise<'corrupt' | 'missing' | 'ready'> {
    if (file.status === 'corrupt') {
      this.fileStatusCache.delete(file.managedPath)
      return 'corrupt'
    }
    try {
      const stat = await lstat(file.managedPath, { bigint: true })
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== BigInt(file.sizeBytes)) {
        this.fileStatusCache.delete(file.managedPath)
        return 'corrupt'
      }
      const cached = this.fileStatusCache.get(file.managedPath)
      const fingerprint = `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`
      if (cached?.fingerprint === fingerprint && cached.sha256 === file.sha256) {
        return cached.status
      }
      return file.status === 'missing' ? 'missing' : 'ready'
    } catch (error) {
      this.fileStatusCache.delete(file.managedPath)
      return (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'corrupt'
    }
  }

  private effectiveNoiseProfile(
    override: CheckpointNoiseProfileOverride | null,
  ): CheckpointNoiseProfileView {
    const defaults = defaultIllustriousNoiseProfile()
    return {
      effective: {
        ...defaults,
        rescaleBetasZeroSnr: override?.rescaleBetasZeroSnr ?? defaults.rescaleBetasZeroSnr,
        timestepSpacing: override?.timestepSpacing ?? defaults.timestepSpacing,
      },
      rescaleBetasZeroSnrSource:
        override?.rescaleBetasZeroSnr === null || override?.rescaleBetasZeroSnr === undefined
          ? 'assumed'
          : 'override',
      timestepSpacingSource: override?.timestepSpacing == null ? 'assumed' : 'override',
    }
  }

  private effectivePredictionType(
    resourceType: StoredResourceType,
    version: InstalledModelVersion,
    override: ModelPredictionType | null,
  ): {
    source: 'default' | 'manifest' | 'not-applicable' | 'user'
    value: ModelPredictionType | null
  } {
    if (resourceType !== 'checkpoint' || version.baseModelFamily !== 'illustrious') {
      return { source: 'not-applicable', value: null }
    }
    if (override) {
      return { source: 'user', value: override }
    }
    const verified = this.qualifiedPredictionTypeForVerifiedCheckpoint({
      baseModelFamily: version.baseModelFamily,
      sha256: version.file.sha256,
      sizeBytes: version.file.sizeBytes,
    })
    if (verified) {
      return { source: 'manifest', value: verified }
    }
    return { source: 'default', value: 'epsilon' }
  }

  private async isVerifiedFile(file: InstalledModelFile): Promise<boolean> {
    return (await this.actualFileStatus(file, true)) === 'ready'
  }

  private prunePreviewSessions(): void {
    const now = Date.now()
    for (const [id, session] of this.previews) {
      if (session.expiresAt <= now) {
        this.previews.delete(id)
      }
    }
  }

  private async resolveGenerationResource(
    resourceId: string,
    versionId: string,
    kind: 'checkpoint' | 'embedding' | 'lora' | 'vae',
  ): Promise<NonNullable<IgsProjectDocumentV1['generationDraft']['model']>> {
    return (await this.resolveGenerationResourceWithFile(resourceId, versionId, kind)).reference
  }

  private async resolveGenerationResourceWithFile(
    resourceId: string,
    versionId: string,
    kind: 'checkpoint' | 'embedding' | 'lora' | 'vae',
  ): Promise<{
    fileSizeBytes: number
    managedPath: string
    originalFilename: string
    reference: NonNullable<IgsProjectDocumentV1['generationDraft']['model']>
  }> {
    const label =
      kind === 'checkpoint'
        ? 'checkpoint'
        : kind === 'embedding'
          ? 'embedding'
          : kind === 'lora'
            ? 'LoRA'
            : 'VAE'
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuid.test(resourceId) || !uuid.test(versionId)) {
      throw new ModelServiceError('MODEL_INVALID_ID', 'Invalid resource or version ID.')
    }
    const installed = await this.repository.listInstalled()
    const resource = installed.find((item) => item.id === resourceId)
    const version = resource?.versions.find((item) => item.id === versionId)
    if (
      !resource ||
      resource.type !== kind ||
      resource.source.kind !== 'civitai' ||
      !version ||
      version.civitaiFileId === null ||
      version.civitaiVersionId === null
    ) {
      throw new ModelServiceError(
        'MODEL_VERSION_UNAVAILABLE',
        `This ${label} version is not installed.`,
      )
    }
    if (
      kind === 'checkpoint' &&
      version.baseModelFamily !== 'illustrious' &&
      version.baseModelFamily !== 'anima'
    ) {
      throw new ModelServiceError(
        'MODEL_FAMILY_UNSUPPORTED',
        'This checkpoint does not have a supported model family.',
      )
    }
    if (
      (kind === 'vae' || kind === 'embedding') &&
      (version.baseModelFamily !== 'illustrious' || version.predictionType !== null)
    ) {
      throw new ModelServiceError(
        'MODEL_FAMILY_UNSUPPORTED',
        kind === 'embedding'
          ? 'Embedding authoring supports only Illustrious components without a prediction type.'
          : 'External VAE selection requires an Illustrious-compatible component without a prediction type.',
      )
    }
    const status = await this.actualFileStatus(version.file, true)
    if (status !== 'ready') {
      throw new ModelServiceError(
        status === 'missing' ? 'MODEL_FILE_MISSING' : 'MODEL_FILE_CORRUPT',
        status === 'missing'
          ? `The selected ${label} file is missing.`
          : `The selected ${label} file failed verification.`,
      )
    }
    if (kind === 'checkpoint' && version.baseModelFamily === 'anima') {
      for (const [role, artifact] of [
        ['qwen3_encoder', ANIMA_QWEN3_0_6B_ENCODER],
        ['vae', ANIMA_QWEN_IMAGE_VAE],
      ] as const) {
        const dependencyId = version.dependencyVersionIds[role]
        const dependencyResource = installed.find((item) =>
          item.versions.some((candidate) => candidate.id === dependencyId),
        )
        const dependency = dependencyResource?.versions.find((item) => item.id === dependencyId)
        if (
          dependencyResource?.type !== role ||
          dependencyResource.source.kind !== 'supported_dependency' ||
          dependency?.baseModelFamily !== 'anima' ||
          dependency.file.sha256 !== artifact.sha256 ||
          !(await this.isVerifiedFile(dependency.file))
        ) {
          throw new ModelServiceError(
            'ANIMA_DEPENDENCY_UNAVAILABLE',
            `The required Anima ${role} is missing or failed verification.`,
          )
        }
      }
    }
    const prediction = this.effectivePredictionType(
      resource.type,
      version,
      kind === 'checkpoint'
        ? await this.repository.getPredictionOverride({
            sha256: version.file.sha256,
            sizeBytes: version.file.sizeBytes,
          })
        : null,
    )
    return {
      fileSizeBytes: version.file.sizeBytes,
      managedPath: version.file.managedPath,
      originalFilename: version.file.originalFilename,
      reference: {
        baseModelFamily: version.baseModelFamily,
        civitaiFileId: version.civitaiFileId,
        civitaiModelId: resource.source.modelId,
        civitaiVersionId: version.civitaiVersionId,
        displayName: resource.displayName,
        fileSha256: version.file.sha256,
        kind,
        localModelId: resource.id,
        localVersionId: version.id,
        predictionType: prediction.value,
        versionName: version.name,
      },
    }
  }

  private async resolvePortableGenerationResource(
    saved: NonNullable<IgsProjectDocumentV1['generationDraft']['model']>,
    kind: 'checkpoint' | 'embedding' | 'lora' | 'vae',
  ): Promise<NonNullable<IgsProjectDocumentV1['generationDraft']['model']>> {
    const label =
      kind === 'checkpoint'
        ? 'checkpoint'
        : kind === 'embedding'
          ? 'embedding'
          : kind === 'lora'
            ? 'LoRA'
            : 'VAE'
    if (
      saved.kind !== kind ||
      saved.civitaiModelId === null ||
      saved.civitaiVersionId === null ||
      saved.civitaiFileId === null ||
      ((kind === 'vae' || kind === 'embedding') &&
        (saved.baseModelFamily !== 'illustrious' || saved.predictionType !== null)) ||
      (kind === 'checkpoint' &&
        saved.baseModelFamily !== 'illustrious' &&
        saved.baseModelFamily !== 'anima')
    ) {
      throw new ModelServiceError(
        'MODEL_PORTABLE_IDENTITY_UNAVAILABLE',
        `This Project reference has no complete supported ${label} identity to link.`,
      )
    }
    const installed = await this.repository.listInstalled()
    const matches = installed.flatMap((resource) => {
      if (
        resource.type !== kind ||
        resource.source.kind !== 'civitai' ||
        resource.source.modelId !== saved.civitaiModelId
      ) {
        return []
      }
      return resource.versions
        .filter(
          (version) =>
            version.civitaiVersionId === saved.civitaiVersionId &&
            version.civitaiFileId === saved.civitaiFileId &&
            version.file.sha256.toLowerCase() === saved.fileSha256.toLowerCase() &&
            version.baseModelFamily === saved.baseModelFamily,
        )
        .map((version) => ({ resourceId: resource.id, versionId: version.id }))
    })
    if (matches.length !== 1) {
      throw new ModelServiceError(
        matches.length === 0
          ? 'MODEL_PORTABLE_MATCH_UNAVAILABLE'
          : 'MODEL_PORTABLE_MATCH_AMBIGUOUS',
        matches.length === 0
          ? `Install or repair this exact ${label} version before linking it to the Project.`
          : `Several installed ${label} versions match this Project reference; resolve the duplicate before linking.`,
      )
    }
    const match = matches[0]
    const resolved = await this.resolveGenerationResource(match.resourceId, match.versionId, kind)
    if (
      resolved.civitaiModelId !== saved.civitaiModelId ||
      resolved.civitaiVersionId !== saved.civitaiVersionId ||
      resolved.civitaiFileId !== saved.civitaiFileId ||
      resolved.fileSha256.toLowerCase() !== saved.fileSha256.toLowerCase() ||
      resolved.baseModelFamily !== saved.baseModelFamily
    ) {
      throw new ModelServiceError(
        'MODEL_PORTABLE_MATCH_UNAVAILABLE',
        `The installed ${label} changed while its exact identity was being verified.`,
      )
    }
    return {
      ...saved,
      localModelId: resolved.localModelId,
      localVersionId: resolved.localVersionId,
    }
  }

  private async resourcePreview(url: unknown, build = true) {
    if (typeof url !== 'string' || !url || !this.resourcePreviews) {
      return null
    }
    try {
      return await (build ? this.resourcePreviews.get(url) : this.resourcePreviews.read(url))
    } catch {
      // Optional artwork never changes resource readiness or install planning.
      return null
    }
  }
}
