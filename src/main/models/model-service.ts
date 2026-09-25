import type {
  CivitaiTokenStatus,
  ModelCatalogItem,
  ModelImportPreview,
  ModelVersionView,
} from '../../shared/api.js'

import { createHash, randomUUID } from 'node:crypto'
import { constants, createReadStream } from 'node:fs'
import { lstat, mkdir, open, rename, unlink } from 'node:fs/promises'
import path from 'node:path'

import type { CivitaiImportPreview } from './civitai-client.js'
import type { CivitaiClient } from './civitai-client.js'
import type { CivitaiTokenStore } from './civitai-token-store.js'
import type {
  InstalledModelFile,
  ModelRepository,
  ModelResourceType as StoredResourceType,
} from './model-repository.js'

import {
  ANIMA_BASE_1_0_CHECKPOINT,
  ANIMA_QWEN3_0_6B_ENCODER,
  ANIMA_QWEN_IMAGE_VAE,
  ANIMA_SOURCE_LICENSE,
  resolveAnimaDependencies,
} from './anima-manifest.js'
import { validateCivitaiToken } from './civitai-token-store.js'

const PREVIEW_TTL_MS = 10 * 60_000
const PUBLICATION_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/

interface PreviewSession {
  expiresAt: number
  preview: Extract<CivitaiImportPreview, { kind: 'select-file' }>
}

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
  private readonly previewImageCache = new Map<string, string | null>()
  private readonly previews = new Map<string, PreviewSession>()

  constructor(
    readonly repository: ModelRepository,
    readonly civitai: CivitaiClient,
    readonly tokenStore: CivitaiTokenStore,
    private readonly cacheRoot?: string,
  ) {}

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

  async getCatalog(): Promise<ModelCatalogItem[]> {
    const installed = await this.repository.listInstalled()
    const versionsById = new Map(
      installed.flatMap((model) => model.versions.map((version) => [version.id, version] as const)),
    )
    return Promise.all(
      installed
        .filter((model) => model.source.kind === 'civitai')
        .map(async (model) => {
          const previewUrl = model.previewUrl
          let previewDataUrl: string | null = null
          if (previewUrl) {
            if (!this.previewImageCache.has(previewUrl)) {
              this.previewImageCache.set(previewUrl, await this.readCachedPreview(previewUrl))
            }
            previewDataUrl = this.previewImageCache.get(previewUrl) ?? null
          }
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
            previewDataUrl,
            resourceType: model.type as ModelCatalogItem['resourceType'],
            sourceUrl:
              source.kind === 'civitai' ? `https://civitai.com/models/${source.modelId}` : null,
            trainedWords: Array.isArray(trainedWords)
              ? trainedWords.filter((word): word is string => typeof word === 'string')
              : [],
            versions: await Promise.all(
              model.versions.map(async (version): Promise<ModelVersionView> => {
                const primaryStatus = await this.actualFileStatus(version.file)
                const dependencyIssues: string[] = []
                if (model.type === 'checkpoint' && version.baseModelFamily === 'anima') {
                  for (const role of ['qwen3_encoder', 'vae'] as const) {
                    const dependencyId = version.dependencyVersionIds[role]
                    const dependency = dependencyId ? versionsById.get(dependencyId) : null
                    if (!dependency || (await this.actualFileStatus(dependency.file)) !== 'ready') {
                      dependencyIssues.push(role)
                    }
                  }
                }
                return {
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
                  predictionType: version.predictionType,
                  sha256: version.file.sha256,
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
    const files = needsAnimaCompanions
      ? preview.files.filter((file) => resolveAnimaDependencies(file.sha256).supported)
      : preview.files
    if (files.length === 0) {
      throw new ModelServiceError(
        'ANIMA_UNSUPPORTED_CHECKPOINT',
        'Only the verified Anima Base 1.0 checkpoint is supported in this release.',
      )
    }
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
                  const dependency = installed
                    .flatMap((resource) => resource.versions)
                    .find((version) => version.id === dependencyId)
                  const expectedSha =
                    role === 'qwen3_encoder'
                      ? ANIMA_QWEN3_0_6B_ENCODER.sha256
                      : ANIMA_QWEN_IMAGE_VAE.sha256
                  return (
                    dependency?.file.sha256 === expectedSha &&
                    (await this.isVerifiedFile(dependency.file))
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
          name: file.name,
          needsRepair: !!exact && !alreadyInstalled,
          primary: file.primary,
          reusesInstalledFile: reusable !== null,
          sha256: file.sha256,
          sizeEstimateBytes: needsAnimaCompanions
            ? ANIMA_BASE_1_0_CHECKPOINT.sizeBytes
            : file.sizeEstimateBytes,
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
    const previewImageDataUrl = await this.civitai.previewImageDataUrl(preview.previewImageUrl)
    if (preview.previewImageUrl) {
      this.previewImageCache.set(preview.previewImageUrl, previewImageDataUrl)
      if (previewImageDataUrl) {
        await this.writeCachedPreview(preview.previewImageUrl, previewImageDataUrl)
      }
    }
    return {
      author: preview.author,
      baseModel: preview.baseModel,
      baseModelFamily: preview.baseModelFamily,
      dependencies: needsAnimaCompanions ? companionStatus : [],
      description: preview.description,
      files: fileChoices,
      kind: 'select-file',
      license:
        preview.baseModelFamily === 'anima'
          ? {
              name: 'CircleStone Non-Commercial License',
              summary: 'Anima is supported only for non-commercial, non-production use.',
              url: ANIMA_SOURCE_LICENSE.url,
            }
          : null,
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
      const versions = installed.flatMap((item) => item.versions)
      for (const companion of [ANIMA_QWEN3_0_6B_ENCODER, ANIMA_QWEN_IMAGE_VAE]) {
        const role = companion.role === 'qwen3-encoder' ? 'qwen3_encoder' : 'vae'
        const dependency = versions.find((item) => item.id === version.dependencyVersionIds[role])
        if (
          !dependency ||
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

  private async isVerifiedFile(file: InstalledModelFile): Promise<boolean> {
    return (await this.actualFileStatus(file, true)) === 'ready'
  }

  private previewCacheFile(url: string): string | null {
    return this.cacheRoot
      ? path.join(
          this.cacheRoot,
          'model-source-previews',
          `${createHash('sha256').update(url).digest('hex')}.txt`,
        )
      : null
  }

  private prunePreviewSessions(): void {
    const now = Date.now()
    for (const [id, session] of this.previews) {
      if (session.expiresAt <= now) {
        this.previews.delete(id)
      }
    }
  }

  private async readCachedPreview(url: string): Promise<string | null> {
    const filePath = this.previewCacheFile(url)
    if (!filePath) {
      return null
    }
    try {
      const handle = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW)
      try {
        const stat = await handle.stat()
        if (!stat.isFile() || stat.size > 1_500_000) {
          return null
        }
        const value = await handle.readFile('utf8')
        return /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value) ? value : null
      } finally {
        await handle.close()
      }
    } catch {
      return null
    }
  }

  private async writeCachedPreview(url: string, dataUrl: string): Promise<void> {
    const filePath = this.previewCacheFile(url)
    if (!filePath || dataUrl.length > 1_500_000) {
      return
    }
    const directory = path.dirname(filePath)
    const tempPath = `${filePath}.${randomUUID()}.tmp`
    try {
      await mkdir(directory, { mode: 0o700, recursive: true })
      const dirStat = await lstat(directory)
      if (!dirStat.isDirectory() || dirStat.isSymbolicLink()) {
        return
      }
      const handle = await open(tempPath, 'wx', 0o600)
      try {
        await handle.writeFile(dataUrl, 'utf8')
        await handle.sync()
      } finally {
        await handle.close()
      }
      await rename(tempPath, filePath)
    } catch {
      // The catalog still works with a text fallback if its optional preview cache is unavailable.
    } finally {
      await unlink(tempPath).catch(() => undefined)
    }
  }
}
