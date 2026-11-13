import type { ModelRemovalReview } from '../../shared/model-removal.js'
import { isModelRemovalId } from '../../shared/model-removal.js'

import { randomUUID } from 'node:crypto'
import { closeSync, fsyncSync, lstatSync, openSync, unlinkSync } from 'node:fs'
import path from 'node:path'

import type { GenerationQueueRepository, QueueResourceUsage } from '../projects/generation-queue.js'
import type { QueuedResourceRemovalTarget } from '../projects/queue-resource-usage.js'
import type { InstalledModel, InstalledModelFile, ModelRepository } from './model-repository.js'

import { GenerationQueueError } from '../projects/generation-queue.js'
import { ModelServiceError } from './model-service.js'

/**
 * Invoke delete/claim adaptation (4875d965): captured target, managed individual files before
 * registry. Studio's caller holds the existing admission, queue and install owners. No recursive
 * delete, Trash, retained weight or independent queue.
 */
export class ModelRemovalService {
  private captured: {
    model: InstalledModel
    target: QueuedResourceRemovalTarget
    token: string
    usage: QueueResourceUsage
  } | null = null

  constructor(
    private readonly repository: ModelRepository,
    private readonly modelRoot: string,
    private readonly getQueue: () => Pick<
      GenerationQueueRepository,
      'inspectResourceUsage' | 'withResourceRemoval'
    >,
  ) {}

  async removeLocalResource(token: string, cancelPending = false): Promise<void> {
    const captured = this.captured
    if (!isModelRemovalId(token) || !captured || captured.token !== token) {
      throw new ModelServiceError(
        'MODEL_REMOVAL_STALE',
        'Review this resource again before removing it.',
      )
    }
    // A failed attempt requires a fresh review, including partial filesystem failure.
    this.captured = null
    let cancellationsCommitted = false
    try {
      const inspection = await this.repository.inspectLocalResourceRemoval(
        captured.model.id,
        captured.model,
      )
      const target = this.removalTarget(inspection.model, inspection.files)
      if (JSON.stringify(target) !== JSON.stringify(captured.target)) {
        throw new ModelServiceError(
          'MODEL_REMOVAL_STALE',
          'The resource file ownership changed. Review removal again.',
        )
      }
      for (const version of inspection.model.versions) {
        this.checkPath(version.file)
      }
      await this.getQueue().withResourceRemoval(
        target,
        captured.usage.pending,
        cancelPending,
        async () => {
          // This callback is entered only after the pending-only transaction commits.
          cancellationsCommitted = cancelPending && captured.usage.pending.length > 0
          await this.repository.removeLocalResource(
            captured.model.id,
            captured.model,
            async (files) => {
              // Check the complete footprint before the first unlink. A later OS failure
              // can still leave a partial removal; registry rollback preserves exact retry.
              for (const file of files) {
                this.checkPath(file)
              }
              for (const file of files) {
                this.checkPath(file)
                try {
                  unlinkSync(file.managedPath)
                } catch (error) {
                  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                    throw error
                  }
                }
                let descriptor: number
                try {
                  descriptor = openSync(path.dirname(file.managedPath), 'r')
                } catch (error) {
                  if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                    continue
                  }
                  throw error
                }
                try {
                  fsyncSync(descriptor)
                } finally {
                  closeSync(descriptor)
                }
              }
            },
          )
        },
      )
    } catch (error) {
      if (error instanceof ModelServiceError) {
        if (cancellationsCommitted) {
          throw new ModelServiceError(
            error.code,
            `${captured.usage.pending.length} reviewed pending jobs were canceled. ${error.message}`,
          )
        }
        throw error
      }
      if (error instanceof GenerationQueueError) {
        throw new ModelServiceError('MODEL_REMOVAL_USAGE_CHANGED', error.message)
      }
      throw new ModelServiceError(
        'MODEL_REMOVAL_FAILED',
        `${cancellationsCommitted ? `${captured.usage.pending.length} reviewed pending jobs were canceled. ` : ''}Removal did not complete. Some files may already be absent. Refresh Models, review the resource and retry; Project and Preset settings were not changed.`,
      )
    }
  }

  async reviewRemoval(resourceId: string): Promise<ModelRemovalReview> {
    if (!isModelRemovalId(resourceId)) {
      throw new ModelServiceError('MODEL_INVALID_ID', 'Invalid resource ID.')
    }
    const all = await this.repository.listInstalled()
    if (!all.some((model) => model.id === resourceId)) {
      throw new ModelServiceError('MODEL_NOT_FOUND', 'This resource is no longer installed.')
    }
    const { files, model } = await this.repository.inspectLocalResourceRemoval(resourceId)
    const paths = new Set(model.versions.map((item) => item.file.managedPath))
    for (const version of model.versions) {
      this.checkPath(version.file)
    }
    const target = this.removalTarget(model, files)
    let usage: QueueResourceUsage
    try {
      usage = await this.getQueue().inspectResourceUsage(target)
    } catch {
      throw new ModelServiceError(
        'MODEL_REMOVAL_USAGE_UNAVAILABLE',
        'Resource use could not be verified. Check the generation queue before removing this resource.',
      )
    }
    const token = randomUUID()
    this.captured = { model: structuredClone(model), target, token, usage: structuredClone(usage) }
    return {
      fileCount: paths.size,
      name: model.displayName,
      pendingJobs: usage.pending.length,
      resourceId,
      runningJobs: usage.running.length,
      sharedFileCount: paths.size - files.length,
      token,
      versionCount: model.versions.length,
    }
  }

  private checkPath(file: InstalledModelFile): void {
    const unsafe = () =>
      new ModelServiceError(
        'MODEL_INVALID_STORAGE',
        'Managed model storage changed or is invalid. Refresh Models and review removal again; earlier files may already be absent.',
      )
    if (!path.isAbsolute(this.modelRoot) || path.resolve(this.modelRoot) !== this.modelRoot) {
      throw unsafe()
    }
    const relative = path.relative(this.modelRoot, file.managedPath)
    if (
      !/^[a-f0-9]{2}\/[a-f0-9]{64}(?:-repair-[a-f0-9-]{36})?\.(?:safetensors|pth|pt)$/.test(
        relative,
      ) ||
      relative.slice(0, 2) !== file.sha256.slice(0, 2) ||
      !path.basename(relative).startsWith(file.sha256)
    ) {
      throw unsafe()
    }
    // Refuse every symlink ancestor, including app data ancestors, rather than
    // following a valid-looking model prefix into another filesystem namespace.
    let ancestor = path.parse(this.modelRoot).root
    for (const part of path.dirname(file.managedPath).slice(ancestor.length).split(path.sep)) {
      ancestor = path.join(ancestor, part)
      try {
        const info = lstatSync(ancestor)
        if (!info.isDirectory() || info.isSymbolicLink()) {
          throw unsafe()
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return
        }
        throw error
      }
    }
    try {
      const info = lstatSync(file.managedPath)
      if (!info.isFile() || info.isSymbolicLink()) {
        throw unsafe()
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }
  }

  private removalTarget(
    model: InstalledModel,
    files: InstalledModelFile[],
  ): QueuedResourceRemovalTarget {
    return {
      resourceId: model.id,
      unsharedPaths: files.map((file) => path.resolve(file.managedPath)).sort(),
      versionIds: model.versions.map((version) => version.id).sort(),
    }
  }
}
