import type { ModelInstallJobView } from '../../shared/api.js'

import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { link, lstat, mkdir, open, readdir, unlink } from 'node:fs/promises'
import path from 'node:path'

import type { CivitaiFileChoice, CivitaiImportPreview } from './civitai-client.js'
import type { ModelDownloader, VerifiedStagedModelFile } from './model-downloader.js'
import type {
  AnimaDependencyRole,
  InstalledModelFile,
  InstalledModelVersion,
  ModelDependencyInput,
  StoredModelInstallJob,
  VerifiedLocalModelFile,
  VerifiedModelArtifact,
} from './model-repository.js'
import type { ModelRepository } from './model-repository.js'
import type { ModelService } from './model-service.js'

import {
  ANIMA_BASE_1_0_CHECKPOINT,
  ANIMA_QWEN3_0_6B_ENCODER,
  ANIMA_QWEN_IMAGE_VAE,
  ANIMA_SOURCE_LICENSE,
  type AnimaArtifact,
  isPinnedAnimaBaseCheckpoint,
} from './anima-manifest.js'
import { supportedModelFileExtension } from './civitai-client.js'
import { ModelDownloadError } from './model-downloader.js'
import { ModelServiceError } from './model-service.js'

type FilePreview = Extract<CivitaiImportPreview, { kind: 'select-file' }>
type ArtifactRole = 'primary' | AnimaDependencyRole

type TerminalInstallUpdate = {
  errorCode?: string | null
  errorMessage?: string | null
  status: 'canceled' | 'failed'
}

interface QueuedInstall {
  acceptedAnimaLicense: boolean
  controller: AbortController
  file: CivitaiFileChoice
  jobId: string
  preview: FilePreview
  previewId: string
  repairVersionId: string | null
  token: string
}

interface PreparedFile {
  artifact: VerifiedModelArtifact
  createdPath: boolean
  role: ArtifactRole
}

export class ModelInstallCoordinator {
  private readonly cancellationOperations = new Set<Promise<unknown>>()
  private closing = false
  private readonly committingJobs = new Set<string>()
  private readonly controllers = new Map<string, AbortController>()
  private readonly lastProgressAt = new Map<string, number>()
  private readonly listeners = new Set<(job: ModelInstallJobView) => void>()
  private readonly modelRoot: string
  private readonly preparationOperations = new Set<Promise<unknown>>()
  private readonly preparingSources = new Set<string>()
  private readonly progressOwners = new Map<string, object>()
  private readonly progressWrites = new Map<string, Promise<void>>()
  private pumpFailure: unknown = null
  private pumpOperation: Promise<void> | null = null
  private readonly queued: QueuedInstall[] = []
  private running = false
  private shutdownOperation: Promise<void> | null = null
  private readonly stagingRoot: string
  private storageMutation = false
  private storageMutationOperation: Promise<unknown> | null = null
  private readonly terminalUpdates = new Map<
    string,
    { retireController: boolean; update: TerminalInstallUpdate }
  >()

  constructor(
    private readonly repository: ModelRepository,
    private readonly modelService: ModelService,
    private readonly downloader: ModelDownloader,
    appDataRoot: string,
  ) {
    this.modelRoot = path.join(appDataRoot, 'models')
    this.stagingRoot = path.join(this.modelRoot, '.staging')
  }

  async cancelInstall(jobId: string): Promise<ModelInstallJobView> {
    this.assertAcceptingWork()
    const operation = Promise.resolve().then(() => this.cancelInstallOne(jobId))
    return await this.trackOperation(this.cancellationOperations, operation)
  }

  getCloseImpact(): {
    activeJobCount: number
    committingJobCount: number
    preparingInstallCount: number
    storageMutationActive: boolean
  } {
    return {
      activeJobCount: new Set([...this.controllers.keys(), ...this.terminalUpdates.keys()]).size,
      committingJobCount: this.committingJobs.size,
      preparingInstallCount: this.preparingSources.size,
      storageMutationActive: this.storageMutation,
    }
  }

  async initialize(): Promise<void> {
    await this.ensureDirectories()
    await this.repository.failInterruptedInstallJobs()
    for (const name of await readdir(this.stagingRoot)) {
      if (/^[a-f0-9-]{36}\.part$/i.test(name)) {
        await unlink(path.join(this.stagingRoot, name))
      }
    }
    await this.removeOrphanedManagedFiles()
  }

  async listJobs(): Promise<ModelInstallJobView[]> {
    return (await this.repository.listInstallJobs()).map(toJobView)
  }

  onChanged(listener: (job: ModelInstallJobView) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Invoke4875 model_install.stop + download.stop, called through model_manager/Invoker/API
   * shutdown: close admission, settle admitted preparation/download/commit work, then clean pending
   * jobs before SQLite closes. The existing serial pump remains the sole installer.
   */
  shutdown(): Promise<void> {
    this.closing = true
    for (const [jobId, controller] of this.controllers) {
      if (!this.committingJobs.has(jobId)) {
        controller.abort()
      }
    }
    if (!this.shutdownOperation) {
      const operation = Promise.resolve().then(() => this.shutdownOne())
      this.shutdownOperation = operation
      void operation.catch(() => {
        if (this.shutdownOperation === operation) {
          this.shutdownOperation = null
        }
      })
    }
    return this.shutdownOperation
  }

  async startInstall(
    previewId: string,
    fileId: number,
    acceptedAnimaLicense: boolean,
  ): Promise<ModelInstallJobView> {
    this.assertAcceptingWork()
    if (this.storageMutation) {
      throw new ModelServiceError(
        'MODEL_STORAGE_BUSY',
        'Resource removal is in progress. Try again after it finishes.',
      )
    }
    if (!Number.isSafeInteger(fileId) || fileId <= 0) {
      throw new ModelServiceError('MODEL_INVALID_FILE', 'Select a valid model file.')
    }
    const { preview } = this.modelService.getPreviewSession(previewId)
    const file = preview.files.find((choice) => choice.fileId === fileId)
    if (!file) {
      throw new ModelServiceError('MODEL_INVALID_FILE', 'The selected file is not in the preview.')
    }
    const source = `${preview.modelId}:${preview.versionId}:${fileId}`
    if (this.preparingSources.has(source)) {
      throw new ModelServiceError(
        'MODEL_INSTALL_IN_PROGRESS',
        'This file is already in the install queue.',
      )
    }
    this.preparingSources.add(source)
    const operation = Promise.resolve()
      .then(() => this.startInstallPrepared(previewId, preview, file, acceptedAnimaLicense))
      .finally(() => {
        this.preparingSources.delete(source)
      })
    return await this.trackOperation(this.preparationOperations, operation)
  }

  /** Invoke exclusive claim adapted to the single existing content-addressed installer. */
  async withIdleStorageMutation<T>(work: () => Promise<T>): Promise<T> {
    this.assertAcceptingWork()
    if (
      this.storageMutation ||
      this.preparingSources.size ||
      this.running ||
      this.controllers.size ||
      this.queued.length
    ) {
      throw new ModelServiceError(
        'MODEL_STORAGE_BUSY',
        'Finish or cancel model installations before removing a resource.',
      )
    }
    this.storageMutation = true
    const operation = Promise.resolve()
      .then(work)
      .finally(() => {
        this.storageMutation = false
        this.storageMutationOperation = null
      })
    this.storageMutationOperation = operation
    return await operation
  }

  private assertAcceptingWork(): void {
    if (this.closing) {
      throw new ModelServiceError(
        'MODEL_APP_CLOSING',
        'The application is closing. Model storage operations are unavailable.',
      )
    }
  }

  private async cancelInstallOne(jobId: string): Promise<ModelInstallJobView> {
    if (this.committingJobs.has(jobId)) {
      throw new ModelServiceError(
        'MODEL_COMMIT_IN_PROGRESS',
        'This installation has finished verification and is being published.',
      )
    }
    const controller = this.controllers.get(jobId)
    if (!controller) {
      throw new ModelServiceError('MODEL_JOB_NOT_ACTIVE', 'This installation is not active.')
    }
    controller.abort()
    if (this.terminalUpdates.has(jobId)) {
      await this.flushTerminalUpdate(jobId)
      await this.emitJob(jobId)
      return this.requireJob(jobId)
    }
    const queuedIndex = this.queued.findIndex((item) => item.jobId === jobId)
    if (queuedIndex >= 0) {
      this.queued.splice(queuedIndex, 1)
      await this.writeTerminalUpdate(jobId, { status: 'canceled' }, true)
      await this.emitJob(jobId)
    }
    return this.requireJob(jobId)
  }

  private async downloadArtifact(
    job: QueuedInstall,
    role: ArtifactRole,
    input: {
      bearerToken?: string
      expectedBytes: number | null
      expectedSha256: string | null
      onProgress: (bytes: number, total: number | null) => void
      source: 'anima-huggingface' | 'civitai'
      url: string
    },
  ): Promise<VerifiedStagedModelFile> {
    await this.repository.updateInstallArtifact(job.jobId, role, { status: 'downloading' })
    const result = await this.downloader.download({
      bearerToken: input.bearerToken,
      expectedBytes: input.expectedBytes,
      expectedSha256: input.expectedSha256,
      onProgress: (progress) => input.onProgress(progress.downloadedBytes, progress.totalBytes),
      signal: job.controller.signal,
      source: input.source,
      stagingDirectory: this.stagingRoot,
      url: input.url,
    })
    try {
      await this.repository.updateInstallArtifact(job.jobId, role, {
        downloadedBytes: result.sizeBytes,
        status: 'verifying',
        tempPath: result.stagingPath,
      })
    } catch (error) {
      await unlink(result.stagingPath).catch(() => undefined)
      throw error
    }
    return result
  }

  private async emitJob(jobId: string): Promise<void> {
    const job = await this.requireJob(jobId)
    for (const listener of this.listeners) {
      try {
        listener(job)
      } catch {
        // Renderer event delivery cannot roll back a committed installation.
      }
    }
  }

  private async ensureDirectories(): Promise<void> {
    for (const directory of [this.modelRoot, this.stagingRoot]) {
      await mkdir(directory, { mode: 0o700, recursive: true })
      const entry = await lstat(directory)
      if (!entry.isDirectory() || entry.isSymbolicLink()) {
        throw new ModelServiceError('MODEL_INVALID_STORAGE', 'Managed model storage is invalid.')
      }
    }
  }

  private async findReadyCompanion(
    role: AnimaDependencyRole,
    sha256: string,
  ): Promise<string | null> {
    const verified = await this.modelService.findVerifiedFileByHash(sha256, role)
    if (!verified) {
      return null
    }
    const installed = await this.repository.listInstalled()
    for (const resource of installed) {
      if (resource.type !== role) {
        continue
      }
      for (const version of resource.versions) {
        if (version.file.id === verified.id) {
          return version.id
        }
      }
    }
    return null
  }

  private async flushTerminalUpdate(
    jobId: string,
  ): Promise<StoredModelInstallJob['status'] | undefined> {
    const pending = this.terminalUpdates.get(jobId)
    if (!pending) {
      return
    }
    const job = (await this.repository.listInstallJobs()).find((item) => item.id === jobId)
    if (!job) {
      throw new ModelServiceError('MODEL_JOB_NOT_FOUND', 'The install job was not found.')
    }
    // A transaction may have committed before its acknowledgment failed. Never
    // overwrite a real terminal outcome or repeat an illegal terminal transition.
    const terminal = ['canceled', 'completed', 'failed'].includes(job.status)
    if (!terminal) {
      await this.repository.updateInstallJob(jobId, pending.update)
    }
    if (this.terminalUpdates.get(jobId) === pending) {
      this.terminalUpdates.delete(jobId)
      if (pending.retireController) {
        this.controllers.delete(jobId)
      }
    }
    return terminal ? job.status : pending.update.status
  }

  private async isFileVerified(file: InstalledModelFile): Promise<boolean> {
    if (file.status !== 'ready') {
      return false
    }
    try {
      const stat = await lstat(file.managedPath)
      return (
        stat.isFile() &&
        !stat.isSymbolicLink() &&
        stat.size === file.sizeBytes &&
        (await hashFile(file.managedPath)) === file.sha256
      )
    } catch {
      return false
    }
  }

  private async isVersionVerified(
    version: InstalledModelVersion,
    resourceType: FilePreview['resourceType'],
  ): Promise<boolean> {
    if (!(await this.isFileVerified(version.file))) {
      return false
    }
    if (resourceType !== 'checkpoint' || version.baseModelFamily !== 'anima') {
      return true
    }
    const installed = await this.repository.listInstalled()
    for (const companion of [ANIMA_QWEN3_0_6B_ENCODER, ANIMA_QWEN_IMAGE_VAE]) {
      const role = companionRole(companion)
      const dependencyId = version.dependencyVersionIds[role]
      const dependencyResource = installed.find((resource) =>
        resource.versions.some((item) => item.id === dependencyId),
      )
      const dependency = dependencyResource?.versions.find((item) => item.id === dependencyId)
      if (
        !dependency ||
        dependencyResource?.type !== role ||
        dependencyResource.source.kind !== 'supported_dependency' ||
        dependency.baseModelFamily !== 'anima' ||
        dependency.file.sha256 !== companion.sha256 ||
        !(await this.isFileVerified(dependency.file))
      ) {
        return false
      }
    }
    return true
  }

  private async prepareCompanion(
    source: AnimaArtifact,
    staged: VerifiedStagedModelFile,
    createdPaths: string[],
  ): Promise<PreparedFile> {
    const { created, managedPath } = await this.publishContentAddressed(staged, '.safetensors')
    if (created) {
      createdPaths.push(managedPath)
    }
    const role = companionRole(source)
    const fileName = path.basename(source.path)
    return {
      artifact: {
        file: {
          managedPath,
          originalFilename: fileName,
          sha256: staged.sha256,
          sizeBytes: staged.sizeBytes,
          verifiedAt: new Date().toISOString(),
        },
        resource: {
          displayName: role === 'vae' ? 'Anima Qwen Image VAE' : 'Anima Qwen3 0.6B Encoder',
          source: { key: companionSourceKey(source), kind: 'supported_dependency' },
          sourceMetadata: { license: ANIMA_SOURCE_LICENSE.id },
          type: role,
        },
        version: {
          baseModelFamily: 'anima',
          format: 'SafeTensor',
          name: fileName,
          source: {
            expectedSha256: source.sha256,
            kind: 'supported_dependency',
            revision: source.revision,
          },
          sourceMetadata: { path: source.path, repository: source.repository },
        },
      },
      createdPath: created,
      role,
    }
  }

  private async preparePrimary(
    preview: FilePreview,
    file: CivitaiFileChoice,
    staged: VerifiedStagedModelFile,
    createdPaths: string[],
  ): Promise<PreparedFile> {
    const extension = supportedModelFileExtension(preview.resourceType, file.name)
    if (!extension) {
      throw new ModelServiceError('MODEL_INVALID_FILE', 'The selected model file is unsupported.')
    }
    const { created, managedPath } = await this.publishContentAddressed(staged, extension)
    if (created) {
      createdPaths.push(managedPath)
    }
    const verifiedAt = new Date().toISOString()
    return {
      artifact: {
        file: {
          managedPath,
          originalFilename: file.name,
          sha256: staged.sha256,
          sizeBytes: staged.sizeBytes,
          verifiedAt,
        },
        resource: {
          creator: preview.author,
          description: preview.description,
          displayName: preview.modelName,
          previewUrl: preview.previewImageUrl,
          source: { kind: 'civitai', modelId: preview.modelId },
          sourceCheckedAt: verifiedAt,
          sourceMetadata: {},
          type: preview.resourceType,
        },
        version: {
          baseModelFamily: preview.baseModelFamily,
          format: extension === '.safetensors' ? (file.format ?? 'SafeTensor') : 'PyTorch',
          name: preview.versionName,
          predictionType:
            preview.resourceType === 'checkpoint'
              ? this.modelService.qualifiedPredictionTypeForVerifiedCheckpoint({
                  baseModelFamily: preview.baseModelFamily,
                  sha256: staged.sha256,
                  sizeBytes: staged.sizeBytes,
                })
              : null,
          source: {
            expectedSha256: file.sha256,
            fileId: file.fileId,
            kind: 'civitai',
            versionId: preview.versionId,
          },
          sourceMetadata: {
            baseModel: preview.baseModel,
            previewImageUrl: preview.previewImageUrl,
            trainedWords: preview.trainedWords,
            ...(preview.resourceType === 'checkpoint' &&
            preview.baseModelFamily === 'anima' &&
            isPinnedAnimaBaseCheckpoint(staged.sha256)
              ? { license: ANIMA_SOURCE_LICENSE.id }
              : {}),
          },
        },
      },
      createdPath: created,
      role: 'primary',
    }
  }

  private async publishContentAddressed(
    staged: VerifiedStagedModelFile,
    extension: '.pt' | '.pth' | '.safetensors',
  ): Promise<{ created: boolean; managedPath: string }> {
    const hashDirectory = path.join(this.modelRoot, staged.sha256.slice(0, 2))
    await mkdir(hashDirectory, { mode: 0o700, recursive: true })
    const directory = await lstat(hashDirectory)
    if (!directory.isDirectory() || directory.isSymbolicLink()) {
      throw new ModelServiceError('MODEL_INVALID_STORAGE', 'Managed model storage is invalid.')
    }
    const managedPath = path.join(hashDirectory, `${staged.sha256}${extension}`)
    try {
      await link(staged.stagingPath, managedPath)
      await syncDirectory(hashDirectory)
      return { created: true, managedPath }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error
      }
      const stat = await lstat(managedPath)
      if (!stat.isFile() || stat.isSymbolicLink()) {
        throw new ModelServiceError('MODEL_HASH_COLLISION', 'An existing managed file is invalid.')
      }
      if (stat.size !== staged.sizeBytes || (await hashFile(managedPath)) !== staged.sha256) {
        // Keep the old, possibly shared path untouched until the SQLite group commit. A late
        // failure can then remove this new file without making a failed repair usable.
        const replacementPath = path.join(
          hashDirectory,
          `${staged.sha256}-repair-${randomUUID()}${extension}`,
        )
        await link(staged.stagingPath, replacementPath)
        await syncDirectory(hashDirectory)
        return { created: true, managedPath: replacementPath }
      }
      return { created: false, managedPath }
    }
  }

  private pump(): Promise<void> {
    if (this.pumpOperation) {
      return this.pumpOperation
    }
    if (this.closing || this.queued.length === 0) {
      return Promise.resolve()
    }
    const operation = Promise.resolve()
      .then(() => this.pumpOne())
      .finally(() => {
        this.running = false
        if (this.pumpOperation === operation) {
          this.pumpOperation = null
        }
        if (!this.closing && this.queued.length > 0) {
          void this.pump()
        }
      })
    this.running = true
    this.pumpOperation = operation
    void operation.catch((error: unknown) => {
      this.pumpFailure = error
    })
    return operation
  }

  private async pumpOne(): Promise<void> {
    while (!this.closing && this.queued.length > 0) {
      const next = this.queued.shift()!
      if (next.controller.signal.aborted) {
        await this.writeTerminalUpdate(next.jobId, { status: 'canceled' }, true).catch(
          () => undefined,
        )
        continue
      }
      await this.run(next)
    }
  }

  private queueProgress(jobId: string, bytesDownloaded: number, totalBytes: number | null): void {
    const owner = this.progressOwners.get(jobId)
    if (!owner) {
      return
    }
    const now = Date.now()
    if (now - (this.lastProgressAt.get(jobId) ?? 0) < 250) {
      return
    }
    this.lastProgressAt.set(jobId, now)
    const prior = this.progressWrites.get(jobId) ?? Promise.resolve()
    const next = prior
      .then(async () => {
        if (this.progressOwners.get(jobId) !== owner) {
          return
        }
        const job = (await this.repository.listInstallJobs()).find((item) => item.id === jobId)
        if (
          this.progressOwners.get(jobId) !== owner ||
          !job ||
          job.status !== 'downloading' ||
          bytesDownloaded < job.bytesDownloaded
        ) {
          return
        }
        await this.repository.updateInstallJob(jobId, {
          bytesDownloaded,
          status: 'downloading',
          totalBytes: job.totalBytes ?? totalBytes,
        })
        await this.emitJob(jobId)
      })
      .catch(() => undefined)
    this.progressWrites.set(jobId, next)
  }

  private async removeOrphanedManagedFiles(): Promise<void> {
    const referenced = new Set(
      (await this.repository.listInstalled()).flatMap((resource) =>
        resource.versions.map((version) => version.file.managedPath),
      ),
    )
    for (const prefix of await readdir(this.modelRoot)) {
      if (!/^[a-f0-9]{2}$/i.test(prefix)) {
        continue
      }
      const directory = path.join(this.modelRoot, prefix)
      const info = await lstat(directory)
      if (!info.isDirectory() || info.isSymbolicLink()) {
        continue
      }
      for (const name of await readdir(directory)) {
        if (
          !/^[a-f0-9]{64}(?:-repair-[a-f0-9-]{36})?\.(?:safetensors|pth|pt)$/i.test(name) ||
          name.slice(0, 2) !== prefix
        ) {
          continue
        }
        const filePath = path.join(directory, name)
        if (referenced.has(filePath)) {
          continue
        }
        const file = await lstat(filePath)
        if (file.isFile() && !file.isSymbolicLink()) {
          await unlink(filePath)
        }
      }
    }
  }

  private async requireJob(jobId: string): Promise<ModelInstallJobView> {
    const job = (await this.repository.listInstallJobs()).find((item) => item.id === jobId)
    if (!job) {
      throw new ModelServiceError('MODEL_JOB_NOT_FOUND', 'The install job was not found.')
    }
    return toJobView(job)
  }

  private async retireProgress(jobId: string): Promise<void> {
    this.progressOwners.delete(jobId)
    await this.progressWrites.get(jobId)
  }

  private async run(job: QueuedInstall): Promise<void> {
    this.progressOwners.set(job.jobId, {})
    const staging: string[] = []
    const createdPaths: string[] = []
    let published = false
    let downloadedTotal = 0
    const prepared: PreparedFile[] = []
    try {
      await this.updateJob(job.jobId, { status: 'downloading' })
      const installed = await this.repository.listInstalled()
      const versions = installed.flatMap((resource) => resource.versions)
      const repairVersion = versions.find((version) => version.id === job.repairVersionId)
      if (job.repairVersionId && !repairVersion) {
        throw new ModelServiceError(
          'MODEL_REPAIR_FAILED',
          'The model version to repair is missing.',
        )
      }
      const expectedPrimaryHash = job.file.sha256 ?? repairVersion?.file.sha256 ?? null
      const reusablePrimary = expectedPrimaryHash
        ? await this.modelService.findVerifiedFileByHash(expectedPrimaryHash)
        : null
      let primary: VerifiedStagedModelFile
      if (reusablePrimary) {
        primary = {
          sha256: reusablePrimary.sha256,
          sizeBytes: reusablePrimary.sizeBytes,
          stagingPath: reusablePrimary.managedPath,
        }
      } else {
        // A reuse-only plan may have lost its verified local file while queued. Refuse a
        // new download unless source metadata, the pinned manifest, or exact repair identity
        // still supplies a known size; a renderer preview is not authoritative here.
        requireKnownDownloadSize(
          job.preview.resourceType === 'checkpoint' &&
            job.preview.baseModelFamily === 'anima' &&
            isPinnedAnimaBaseCheckpoint(job.file.sha256)
            ? ANIMA_BASE_1_0_CHECKPOINT.sizeBytes
            : (repairVersion?.file.sizeBytes ?? job.file.sizeEstimateBytes),
          job.preview.resourceType === 'checkpoint' && job.preview.baseModelFamily === 'anima',
        )
        primary = await this.downloadArtifact(job, 'primary', {
          bearerToken: job.token,
          expectedBytes:
            job.preview.resourceType === 'checkpoint' && job.preview.baseModelFamily === 'anima'
              ? isPinnedAnimaBaseCheckpoint(job.file.sha256)
                ? ANIMA_BASE_1_0_CHECKPOINT.sizeBytes
                : (repairVersion?.file.sizeBytes ?? null)
              : (repairVersion?.file.sizeBytes ?? null),
          expectedSha256: expectedPrimaryHash,
          onProgress: (bytes, total) =>
            this.queueProgress(job.jobId, downloadedTotal + bytes, total),
          source: 'civitai',
          url: job.file.downloadUrl,
        })
        staging.push(primary.stagingPath)
        downloadedTotal += primary.sizeBytes
      }
      if (
        job.preview.resourceType === 'checkpoint' &&
        job.preview.baseModelFamily === 'anima' &&
        isPinnedAnimaBaseCheckpoint(primary.sha256) &&
        !job.acceptedAnimaLicense
      ) {
        throw new ModelServiceError(
          'ANIMA_LICENSE_NOT_ACKNOWLEDGED',
          'The downloaded file is CircleStone Anima Base 1.0; acknowledge its license before installing.',
        )
      }
      prepared.push(await this.preparePrimary(job.preview, job.file, primary, createdPaths))
      await this.repository.updateInstallArtifact(job.jobId, 'primary', {
        status: 'ready',
        tempPath: null,
      })

      const companionVersionIds = new Map<AnimaDependencyRole, string>()
      const dependencyRepairs = new Map<
        AnimaDependencyRole,
        { file: VerifiedLocalModelFile; role: AnimaDependencyRole; versionId: string }
      >()

      for (const companion of job.preview.resourceType === 'checkpoint' &&
      job.preview.baseModelFamily === 'anima'
        ? [ANIMA_QWEN3_0_6B_ENCODER, ANIMA_QWEN_IMAGE_VAE]
        : []) {
        const role = companionRole(companion)
        const linkedVersionId = repairVersion?.dependencyVersionIds[role]
        const linkedVersion = versions.find((version) => version.id === linkedVersionId)
        if (repairVersion && (!linkedVersion || linkedVersion.file.sha256 !== companion.sha256)) {
          throw new ModelServiceError(
            'ANIMA_MISSING_DEPENDENCY',
            `The installed Anima ${role} link cannot be repaired.`,
          )
        }
        const readyVersionId = linkedVersion
          ? (await this.isFileVerified(linkedVersion.file))
            ? linkedVersion.id
            : null
          : await this.findReadyCompanion(role, companion.sha256)
        if (readyVersionId) {
          companionVersionIds.set(role, readyVersionId)
          await this.repository.updateInstallArtifact(job.jobId, role, { status: 'ready' })
          continue
        }
        const reusable = await this.modelService.findVerifiedFileByHash(companion.sha256, role)
        let result: VerifiedStagedModelFile
        if (reusable) {
          result = {
            sha256: reusable.sha256,
            sizeBytes: reusable.sizeBytes,
            stagingPath: reusable.managedPath,
          }
        } else {
          result = await this.downloadArtifact(job, role, {
            expectedBytes: companion.sizeBytes,
            expectedSha256: companion.sha256,
            onProgress: (bytes) => this.queueProgress(job.jobId, downloadedTotal + bytes, null),
            source: 'anima-huggingface',
            url: companion.url,
          })
          staging.push(result.stagingPath)
          downloadedTotal += result.sizeBytes
        }
        const preparedCompanion = await this.prepareCompanion(companion, result, createdPaths)
        const repairCompanion =
          linkedVersion ??
          installed
            .filter((resource) => resource.type === role)
            .flatMap((resource) => resource.versions)
            .find((version) => version.file.sha256 === companion.sha256)
        if (repairCompanion) {
          dependencyRepairs.set(role, {
            file: preparedCompanion.artifact.file,
            role,
            versionId: repairCompanion.id,
          })
          companionVersionIds.set(role, repairCompanion.id)
        } else {
          prepared.push(preparedCompanion)
        }
        await this.repository.updateInstallArtifact(job.jobId, role, {
          status: 'ready',
          tempPath: null,
        })
      }

      await this.retireProgress(job.jobId)
      if (job.controller.signal.aborted) {
        throw new ModelDownloadError('DOWNLOAD_CANCELED', 'The download was canceled.')
      }
      await this.updateJob(job.jobId, {
        bytesDownloaded: downloadedTotal,
        status: 'verifying',
        ...(job.preview.resourceType === 'checkpoint' && job.preview.baseModelFamily === 'anima'
          ? { totalBytes: downloadedTotal }
          : {}),
      })
      const primaryArtifact = prepared.find((item) => item.role === 'primary')?.artifact
      if (!primaryArtifact) {
        throw new ModelServiceError('MODEL_INSTALL_FAILED', 'The model file was not prepared.')
      }
      const dependencies: ModelDependencyInput[] = []
      if (job.preview.resourceType === 'checkpoint' && job.preview.baseModelFamily === 'anima') {
        for (const companion of [ANIMA_QWEN3_0_6B_ENCODER, ANIMA_QWEN_IMAGE_VAE]) {
          const role = companionRole(companion)
          const preparedCompanion = prepared.find((item) => item.role === role)
          if (preparedCompanion) {
            dependencies.push({ artifact: preparedCompanion.artifact, role })
          } else {
            const existingVersionId = companionVersionIds.get(role)
            if (!existingVersionId) {
              throw new ModelServiceError(
                'ANIMA_MISSING_DEPENDENCY',
                `Required Anima ${role} is missing.`,
              )
            }
            dependencies.push({
              existingVersionId,
              ...(dependencyRepairs.has(role)
                ? { repairFile: dependencyRepairs.get(role)!.file }
                : {}),
              role,
            })
          }
        }
      }
      if (staging.length > 0) {
        // Finalize owned links before SQLite exposes the verified managed inode.
        // A later staging unlink would change its ctime during exact selection.
        for (const staged of staging) {
          await unlink(staged)
        }
        await syncDirectory(this.stagingRoot)
        staging.length = 0
      }
      if (job.controller.signal.aborted) {
        throw new ModelDownloadError('DOWNLOAD_CANCELED', 'The download was canceled.')
      }
      this.committingJobs.add(job.jobId)
      await (repairVersion
        ? this.repository.repairVerifiedVersion({
            dependencyRepairs: [...dependencyRepairs.values()],
            file: primaryArtifact.file,
            jobId: job.jobId,
            versionId: repairVersion.id,
          })
        : this.repository.publishVerifiedInstallation({
            dependencies,
            jobId: job.jobId,
            primary: primaryArtifact,
          }))
      published = true
      if (createdPaths.some((filePath) => path.basename(filePath).includes('-repair-'))) {
        await this.removeOrphanedManagedFiles().catch(() => undefined)
      }
      await this.emitJob(job.jobId)
      this.modelService.forgetPreview(job.previewId)
    } catch (error) {
      await this.retireProgress(job.jobId)
      if (!published) {
        const canceled =
          job.controller.signal.aborted ||
          (error instanceof ModelDownloadError && error.code === 'DOWNLOAD_CANCELED')
        const safeError = publicInstallError(error)
        const status = await this.writeTerminalUpdate(job.jobId, {
          errorCode: canceled ? 'DOWNLOAD_CANCELED' : safeError.code,
          errorMessage: canceled ? 'The installation was canceled.' : safeError.message,
          status: canceled ? 'canceled' : 'failed',
        }).catch(() => undefined)
        if (status === 'completed') {
          published = true
        }
        await this.emitJob(job.jobId).catch(() => undefined)
      }
    } finally {
      await this.retireProgress(job.jobId)
      this.committingJobs.delete(job.jobId)
      this.progressWrites.delete(job.jobId)
      this.lastProgressAt.delete(job.jobId)
      for (const staged of staging) {
        await unlink(staged).catch(() => undefined)
      }
      if (!published && !this.terminalUpdates.has(job.jobId)) {
        for (const created of createdPaths) {
          await unlink(created).catch(() => undefined)
        }
      }
      this.controllers.delete(job.jobId)
    }
  }

  private async shutdownOne(): Promise<void> {
    // Caller-visible validation/cancellation failures do not mean that work is
    // still running. Join their complete operations without awaiting this barrier
    // from inside any tracked operation.
    await Promise.allSettled([
      ...this.preparationOperations,
      ...this.cancellationOperations,
      ...(this.storageMutationOperation ? [this.storageMutationOperation] : []),
    ])
    await this.pumpOperation?.catch(() => undefined)

    for (const job of this.queued.splice(0)) {
      job.controller.abort()
      this.terminalUpdates.set(job.jobId, {
        retireController: true,
        update: { status: 'canceled' },
      })
    }
    // Like Invoke's pending-job sweep, include durable rows from an admitted
    // preparation whose create/update acknowledgment failed before enqueue.
    for (const job of await this.repository.listInstallJobs()) {
      if (
        ['downloading', 'verifying', 'waiting'].includes(job.status) &&
        !this.terminalUpdates.has(job.id)
      ) {
        this.terminalUpdates.set(job.id, {
          retireController: true,
          update: { status: 'canceled' },
        })
      }
    }
    let failed = false
    let failure: unknown
    for (const jobId of this.terminalUpdates.keys()) {
      try {
        await this.flushTerminalUpdate(jobId)
        await this.emitJob(jobId)
      } catch (error) {
        failed = true
        failure ??= error
      }
    }
    if (failed) {
      throw failure
    }
    if (this.pumpFailure) {
      throw this.pumpFailure
    }
    if (
      this.running ||
      this.preparationOperations.size ||
      this.cancellationOperations.size ||
      this.storageMutation ||
      this.controllers.size ||
      this.progressWrites.size
    ) {
      throw new ModelServiceError(
        'MODEL_APP_CLOSING',
        'The application is closing. Model storage work has not finished.',
      )
    }
  }

  private async startInstallPrepared(
    previewId: string,
    preview: FilePreview,
    file: CivitaiFileChoice,
    acceptedAnimaLicense: boolean,
  ): Promise<ModelInstallJobView> {
    this.assertAcceptingWork()
    const { fileId } = file
    const needsAnimaCompanions =
      preview.resourceType === 'checkpoint' && preview.baseModelFamily === 'anima'
    const isPinnedBase = needsAnimaCompanions && isPinnedAnimaBaseCheckpoint(file.sha256)
    const token = await this.modelService.requireToken()
    this.assertAcceptingWork()
    await this.modelService.civitai.validateToken(token)
    // Check live attempts before the catalog so a concurrent publish cannot leave us with
    // a stale catalog result and a completed job. The source claim prevents new admissions.
    const inProgress = (await this.repository.listInstallJobs()).some(
      (job) =>
        ['downloading', 'verifying', 'waiting'].includes(job.status) &&
        job.civitaiModelId === preview.modelId &&
        job.civitaiVersionId === preview.versionId &&
        job.civitaiFileId === fileId,
    )
    if (inProgress) {
      throw new ModelServiceError(
        'MODEL_INSTALL_IN_PROGRESS',
        'This file is already in the install queue.',
      )
    }

    const duplicate = await this.repository.findExactFileDuplicate({
      civitai: { fileId, modelId: preview.modelId, versionId: preview.versionId },
    })
    const installed = await this.repository.listInstalled()
    const exactVersion = installed
      .flatMap((resource) => resource.versions)
      .find((version) => version.id === duplicate?.versionId)
    if (duplicate && !exactVersion) {
      throw new ModelServiceError('MODEL_INSTALL_FAILED', 'The installed version is unavailable.')
    }
    if (file.sha256 && exactVersion && file.sha256 !== exactVersion.file.sha256) {
      throw new ModelServiceError(
        'MODEL_SOURCE_CHANGED',
        'CivitAI changed the hash for this file. Verify its source before repairing.',
      )
    }
    const reusablePrimary = await this.modelService.findVerifiedFileByHash(
      file.sha256 ?? exactVersion?.file.sha256 ?? '',
    )
    const primarySizeBytes = requireKnownDownloadSize(
      isPinnedBase
        ? ANIMA_BASE_1_0_CHECKPOINT.sizeBytes
        : (exactVersion?.file.sizeBytes ?? reusablePrimary?.sizeBytes ?? file.sizeEstimateBytes),
      needsAnimaCompanions,
    )
    if (needsAnimaCompanions && !acceptedAnimaLicense) {
      throw new ModelServiceError(
        'ANIMA_LICENSE_NOT_ACKNOWLEDGED',
        'Acknowledge the CircleStone terms for the required Anima components before installing.',
      )
    }
    if (exactVersion && (await this.isVersionVerified(exactVersion, preview.resourceType))) {
      throw new ModelServiceError(
        'MODEL_ALREADY_INSTALLED',
        'This exact model file is already installed.',
      )
    }
    const companions = needsAnimaCompanions ? [ANIMA_QWEN3_0_6B_ENCODER, ANIMA_QWEN_IMAGE_VAE] : []
    this.assertAcceptingWork()
    const jobId = await this.repository.createInstallJob({
      artifacts: [
        {
          expectedSha256: file.sha256,
          expectedSizeBytes: isPinnedBase ? ANIMA_BASE_1_0_CHECKPOINT.sizeBytes : null,
          role: 'primary',
          source: { fileId, kind: 'civitai_file' },
        },
        ...companions.map((artifact) => ({
          expectedSha256: artifact.sha256,
          expectedSizeBytes: artifact.sizeBytes,
          role: companionRole(artifact),
          source: {
            key: companionSourceKey(artifact),
            kind: 'supported_dependency' as const,
          },
        })),
      ],
      baseModelFamily: preview.baseModelFamily,
      civitaiFileId: fileId,
      civitaiModelId: preview.modelId,
      civitaiVersionId: preview.versionId,
      displayName: preview.modelName,
      resourceType: preview.resourceType,
      versionName: preview.versionName,
    })
    let enqueued = false
    try {
      this.assertAcceptingWork()
      const totalBytes = needsAnimaCompanions
        ? (reusablePrimary ? 0 : primarySizeBytes) +
          (
            await Promise.all(
              companions.map(async (item) =>
                (await this.findReadyCompanion(companionRole(item), item.sha256))
                  ? 0
                  : item.sizeBytes,
              ),
            )
          ).reduce((sum, size) => sum + size, 0)
        : null
      this.assertAcceptingWork()
      await this.repository.updateInstallJob(jobId, { status: 'waiting', totalBytes })
      this.assertAcceptingWork()
      const controller = new AbortController()
      this.controllers.set(jobId, controller)
      this.queued.push({
        acceptedAnimaLicense,
        controller,
        file,
        jobId,
        preview,
        previewId,
        repairVersionId: exactVersion?.id ?? null,
        token,
      })
      enqueued = true
      try {
        await this.emitJob(jobId)
      } finally {
        void this.pump()
      }
      return this.requireJob(jobId)
    } catch (error) {
      if (!enqueued) {
        const safe = publicInstallError(error)
        await this.writeTerminalUpdate(
          jobId,
          {
            errorCode: this.closing ? 'DOWNLOAD_CANCELED' : safe.code,
            errorMessage: this.closing ? 'The installation was canceled.' : safe.message,
            status: this.closing ? 'canceled' : 'failed',
          },
          true,
        ).catch(() => undefined)
        await this.emitJob(jobId).catch(() => undefined)
      }
      throw error
    }
  }

  private trackOperation<T>(operations: Set<Promise<unknown>>, operation: Promise<T>): Promise<T> {
    operations.add(operation)
    void operation.then(
      () => operations.delete(operation),
      () => operations.delete(operation),
    )
    return operation
  }

  private async updateJob(
    jobId: string,
    input: {
      bytesDownloaded?: number
      status: 'completed' | 'downloading' | 'verifying'
      totalBytes?: number
    },
  ): Promise<void> {
    await this.repository.updateInstallJob(jobId, input)
    await this.emitJob(jobId)
  }

  private async writeTerminalUpdate(
    jobId: string,
    update: TerminalInstallUpdate,
    retireController = false,
  ): Promise<StoredModelInstallJob['status'] | undefined> {
    this.terminalUpdates.set(jobId, { retireController, update })
    return await this.flushTerminalUpdate(jobId)
  }
}

function requireKnownDownloadSize(sizeBytes: number | null, needsAnimaCompanions: boolean): number {
  if (!Number.isSafeInteger(sizeBytes) || (sizeBytes ?? 0) < 1) {
    throw new ModelServiceError(
      needsAnimaCompanions ? 'ANIMA_SIZE_UNKNOWN' : 'MODEL_SIZE_UNKNOWN',
      needsAnimaCompanions
        ? 'CivitAI must provide the checkpoint download size before installation.'
        : 'CivitAI must provide a valid download size before installation.',
    )
  }
  return sizeBytes!
}

function companionRole(artifact: AnimaArtifact): AnimaDependencyRole {
  return artifact.role === 'qwen3-encoder' ? 'qwen3_encoder' : 'vae'
}

function companionSourceKey(artifact: AnimaArtifact): string {
  return `anima:${artifact.role}:${artifact.sha256}`
}

function toJobView(job: StoredModelInstallJob): ModelInstallJobView {
  return {
    bytesDownloaded: job.bytesDownloaded,
    error:
      job.errorCode && job.errorMessage ? { code: job.errorCode, message: job.errorMessage } : null,
    id: job.id,
    modelName: job.displayName,
    status: job.status,
    totalBytes: job.totalBytes,
    versionName: job.versionName,
  }
}

function publicInstallError(error: unknown): { code: string; message: string } {
  if (error instanceof ModelDownloadError || error instanceof ModelServiceError) {
    return { code: error.code, message: error.message }
  }
  return { code: 'MODEL_INSTALL_FAILED', message: 'The model could not be installed.' }
}

async function hashFile(filePath: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk)
  }
  return hash.digest('hex')
}

async function syncDirectory(directory: string): Promise<void> {
  const handle = await open(directory, 'r')
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}
