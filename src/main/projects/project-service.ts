import type {
  ProjectCreateInput,
  ProjectEmbeddingIdentity,
  ProjectGenerationDraftChange,
  ProjectImportFinishResult,
  ProjectImportSelection,
  ProjectLoraIdentity,
  ProjectOpenResult,
  ProjectRasterLayerChange,
  ProjectRebuildResult,
  ProjectSaveResult,
  ProjectSmartPatchLayerChange,
  ProjectSmartPatchMaskEditRequest,
  ProjectSummary,
  ProjectTab,
} from '../../shared/api.js'
import {
  isProjectEmbeddingIdentity,
  isProjectGenerationDraftChange,
  isProjectRasterLayerChange,
  isProjectSmartPatchLayerChange,
  isProjectSmartPatchMaskEditRequest,
} from '../../shared/api.js'
import {
  applyPresetSections,
  parsePresetApplication,
  type PresetApplicationRequest,
  type PresetApplicationTarget,
} from '../../shared/presets/preset-application.js'
import {
  type AcceptedResultHistoryCursor,
  type AcceptedResultHistoryPage,
  type AcceptedResultHistoryReference,
  isAcceptedResultHistoryReference,
} from '../../shared/projects/accepted-result-history.js'
import { compileAnimaPromptWeighting } from '../../shared/projects/anima-prompt-weighting.js'
import {
  type AnimaWorkerRequest,
  AnimaWorkerRequestError,
} from '../../shared/projects/anima-worker-request.js'
import { planGenerationBatch } from '../../shared/projects/generation-batch-plan.js'
import { GENERATION_BATCH_JOB_LIMIT } from '../../shared/projects/generation-batch-policy.js'
import { getEffectiveDynamicPromptSettings } from '../../shared/projects/generation-dynamic-settings.js'
import type { RasterGenerationData } from '../../shared/projects/generation-settings-comparison.js'
import { supportsInferenceAnima } from '../../shared/projects/inference-worker-capabilities.js'
import {
  initializeProjectGenerationPayload,
  parseProjectCreateInput,
} from '../../shared/projects/project-create.js'
import { isProjectDocumentId } from '../../shared/projects/project-generation-actions.js'
import {
  generationTargetSignature,
  isGenerationTargetKey,
  type ProjectGenerationTargetState,
} from '../../shared/projects/project-generation-target-state.js'
import { resolveProjectMaskSettings } from '../../shared/projects/project-mask-settings.js'
import type { ProjectMaskBitmap } from '../../shared/projects/project-mask.js'
import { ProjectMaskError } from '../../shared/projects/project-mask.js'
import {
  createEmptyProjectDocumentV1,
  IGS_SAFETY_CEILINGS,
  type IgsProjectDocumentV1,
  type IgsRasterLayerV1,
  type IgsRectV1,
  IgsSchemaError,
  type IgsSmartPatchLayerV1,
  projectRasterLayers,
} from '../../shared/projects/project-schema.js'
import {
  type GenerationPrompt,
  type PromptEmbeddingSelection,
  reconcilePromptEmbeddings,
} from '../../shared/projects/prompt-embeddings.js'
import { sameResourceModel } from '../../shared/projects/resource-identity.js'

import { createHash, randomUUID } from 'node:crypto'
import { type BigIntStats, constants } from 'node:fs'
import { link, lstat, mkdir, open, realpath, unlink } from 'node:fs/promises'
import path from 'node:path'

import type { PreparedAnimaGenerationBatch } from './anima-generation-batch.js'
import type { AnimaGenerationModelResolver } from './anima-generation-preparation.js'
import type { GenerationModelResolver } from './illustrious-generation-loras.js'
import type { buildFrozenGenerationTarget } from './project-generation-target.js'
import type { ProjectIndexRepository } from './project-index.js'
import type { ProjectShadowStore } from './project-shadow.js'
import type { ProjectShadowInspection } from './project-shadow.js'
import type { ProjectTemporaryRecoveryInspection } from './project-temporary-recovery.js'
import type { ProjectWorkerClient } from './worker-client.js'

import {
  acceptedHistoryImageUrl,
  canPreviewSavedAcceptedResult,
  reviewSavedAcceptedResult,
} from './accepted-history-resource.js'
import {
  prepareAnimaGenerationBatch,
  validateAnimaBatchIterations,
} from './anima-generation-batch.js'
import {
  prepareAnimaGeneration,
  validateAnimaGenerationDraft,
} from './anima-generation-preparation.js'
import { withAnimaGenerationBatchRequests } from './anima-generation-request.js'
import { type IgsAssetSource, readIgsPackage } from './igs-package.js'
import { projectAcceptedResults } from './project-accepted-results.js'
import {
  ProjectAutosaveCoordinator,
  ProjectAutosaveError,
  type ProjectAutosaveOptions,
} from './project-autosave.js'
import {
  prepareNormalGeneration,
  prepareNormalTxt2Img,
  validateNormalGenerationDraft,
  validateNormalTxt2ImgDraft,
} from './project-generation-preparation.js'
import {
  composeFrozenGenerationTarget,
  type FrozenGenerationTarget,
} from './project-generation-target.js'
import {
  canonicalProjectPath,
  localProjectRecoveryKey,
  ProjectIdentityError,
} from './project-identity.js'
import { type ProjectIndexRecord, UNCATEGORIZED_WORKSPACE_ID } from './project-index.js'
import {
  projectLayerImageUrl,
  type ProjectLayerResourceRequest,
  resolveProjectLayerAsset,
} from './project-layer-resource.js'
import { fitProjectMaskBbox } from './project-mask-fit.js'
import {
  projectMaskImageUrl,
  type ProjectMaskResourceRequest,
  resolveProjectMaskAsset,
} from './project-mask-resource.js'
import {
  applyProjectMaskEdit,
  decodeProjectMaskPng,
  encodeProjectMaskPng,
  readProjectMaskSource,
} from './project-mask.js'
import { projectThumbnailImageUrl } from './project-preview-resource.js'
import { buildProjectPreview } from './project-preview.js'
import { withFrozenRasterComposition } from './project-raster-snapshot.js'
import {
  type ProjectRebuildPreviewInput,
  ProjectSession,
  type ProjectSessionRoots,
} from './project-session.js'
import { unavailableTemporaryRecovery } from './project-temporary-recovery.js'
import { importRasterLayer } from './raster-import.js'

export type {
  ProjectImportFinishResult,
  ProjectImportSelection,
  ProjectOpenResult,
  ProjectSaveResult,
  ProjectSummary,
  ProjectTab,
} from '../../shared/api.js'

interface PendingProjectImport {
  documentId: string
  documentRevision: string
  fileName: string
  fingerprint: string
  sourcePath: string
  title: string
}

const PROJECT_ID_PATTERN = /^project-v1-[a-f0-9]{64}$/
const MAX_PENDING_IMPORTS = 16
const COPY_CHUNK_BYTES = 1024 * 1024

export interface ProjectServiceOptions {
  /** Primarily a test seam for deterministic autosave and simulated process restart. */
  autosaveOptions?: ProjectAutosaveOptions
  dataRoot: string
  /** Main's recovered staging owner; absent in document-only consumers and tests. */
  inspectTemporaryRecovery?: (
    localProjectKey: string,
  ) => Promise<ProjectTemporaryRecoveryInspection>
  /** Import enters the same main-owned operation gate as an ordinary Home Open. */
  openImportedProject?: (projectId: string) => Promise<ProjectOpenResult>
  /** The document-scoped operational seed; unavailable recovery never blocks Project Save. */
  readLastActualSeed?: (localProjectKey: string, documentId: string) => Promise<number | null>
  /** Test seam for a post-commit source removal failure; production uses fs.unlink. */
  removeImportedSource?: (sourcePath: string) => Promise<void>
  repository: ProjectIndexRepository
  /** Main verifies new embedding choices; document-only consumers may only retain/prune refs. */
  resolvePromptEmbeddings?: (input: {
    modelFamily: string | null
    prompt: GenerationPrompt
    selection?: PromptEmbeddingSelection
    text: string
  }) => Promise<GenerationPrompt>
  roots: ProjectSessionRoots
  shadow: ProjectShadowStore
}

export class ProjectServiceError extends Error {
  constructor(
    readonly code:
      | 'PROJECT_ALREADY_OPEN'
      | 'PROJECT_COMPARISON_CHANGED'
      | 'PROJECT_CREATED_NOT_INDEXED'
      | 'PROJECT_DIRTY'
      | 'PROJECT_EMBEDDING_NOT_SELECTED'
      | 'PROJECT_EMBEDDING_RELINK_MISMATCH'
      | 'PROJECT_IDENTITY_MISMATCH'
      | 'PROJECT_IMPORT_INVALID_SOURCE'
      | 'PROJECT_IMPORT_SELECTION_MISSING'
      | 'PROJECT_IMPORT_SOURCE_CHANGED'
      | 'PROJECT_IMPORTED_NOT_INDEXED'
      | 'PROJECT_IMPORTED_NOT_OPENED'
      | 'PROJECT_INVALID_INPUT'
      | 'PROJECT_LAYER_HIDDEN'
      | 'PROJECT_LAYER_LOCKED'
      | 'PROJECT_LAYER_NOT_FOUND'
      | 'PROJECT_LORA_RELINK_MISMATCH'
      | 'PROJECT_MASK_UNAVAILABLE'
      | 'PROJECT_MODEL_NOT_SELECTED'
      | 'PROJECT_MODEL_RELINK_MISMATCH'
      | 'PROJECT_NOT_FOUND'
      | 'PROJECT_NOT_OPEN'
      | 'PROJECT_NOT_READY'
      | 'PROJECT_REBUILD_IN_PROGRESS'
      | 'PROJECT_RECOVERY_REQUIRED'
      | 'PROJECT_RECOVERY_UNAVAILABLE'
      | 'PROJECT_SAVE_IN_PROGRESS'
      | 'PROJECT_TARGET_CHANGED'
      | 'PROJECT_VAE_NOT_SELECTED'
      | 'PROJECT_VAE_RELINK_MISMATCH'
      | 'PROJECT_WORKER_UNAVAILABLE',
    message: string,
  ) {
    super(message)
    this.name = 'ProjectServiceError'
  }
}

/**
 * The Electron main process owns Project paths, document sessions and recovery decisions. Renderer
 * calls address indexed local keys, never arbitrary filesystem paths or documents.
 */
export class ProjectService {
  private initialization: Promise<void> | undefined
  private readonly opening = new Map<string, Promise<ProjectOpenResult>>()
  private readonly openTabs = new Map<string, ProjectAutosaveCoordinator>()
  private readonly pendingImports = new Map<string, PendingProjectImport>()
  private readonly rebuilding = new Map<string, Promise<unknown>>()
  private readonly saving = new Map<string, Promise<ProjectSaveResult>>()
  private readonly targetModes = new WeakMap<
    ProjectAutosaveCoordinator,
    { key: string; mode: NonNullable<ProjectGenerationTargetState['mode']> }
  >()

  constructor(private readonly options: ProjectServiceOptions) {}

  /** Resource metadata is resolved and verified in main, never supplied by the renderer. */
  async addGenerationLora(
    tabId: string,
    resource: NonNullable<IgsProjectDocumentV1['generationDraft']['model']>,
    targetLayerId?: string,
  ): Promise<ProjectTab> {
    if (resource.kind !== 'lora') {
      throw new ProjectServiceError('PROJECT_INVALID_INPUT', 'Expected a LoRA resource.')
    }
    const coordinator = this.requireTab(tabId)
    const document = coordinator.document
    const scope = generationDraftScope(document, targetLayerId)
    const draft = scope.draft
    if (draft.loras.some((lora) => sameResourceModel(lora.resource, resource))) {
      throw new ProjectServiceError(
        'PROJECT_INVALID_INPUT',
        'This LoRA is already in the stack. Remove it before choosing another version.',
      )
    }
    await coordinator.applyDocument(
      scope.replace({
        ...draft,
        loras: [...draft.loras, { enabled: true, resource, weight: 0.7 }],
      }),
      {},
      { expectedDocumentRevision: document.documentRevision },
    )
    return toTab(tabId, coordinator)
  }

  async addSmartPatchLayer(tabId: string): Promise<ProjectTab> {
    const coordinator = this.requireTab(tabId)
    const document = coordinator.document
    const patch: IgsSmartPatchLayerV1 = {
      activeRasterSubLayerId: null,
      blendMode: 'normal',
      boundingBox: structuredClone(document.primaryBbox),
      generationDraft: structuredClone(document.generationDraft),
      id: randomUUID(),
      internalResolution: {
        height: document.primaryBbox.height,
        width: document.primaryBbox.width,
      },
      kind: 'smart-patch',
      locked: false,
      mask: { asset: null, id: randomUUID(), revision: 0 },
      maskSettings: resolveProjectMaskSettings(undefined),
      name: 'New Smart Patch',
      opacity: 1,
      rasterSubLayers: [],
      visible: true,
    }
    await coordinator.applyDocument(
      { ...document, layers: [patch, ...document.layers] },
      {},
      { expectedDocumentRevision: document.documentRevision },
    )
    return toTab(tabId, coordinator)
  }

  /** Verify a detached selection against the captured document, then publish one undo step. */
  async applyPreset(
    tabId: string,
    input: PresetApplicationRequest,
    verify: (request: PresetApplicationRequest, current: PresetApplicationTarget) => Promise<void>,
  ): Promise<ProjectTab> {
    let request: PresetApplicationRequest
    try {
      request = parsePresetApplication(input)
    } catch {
      throw new ProjectServiceError(
        'PROJECT_INVALID_INPUT',
        'Choose valid preset sections to apply.',
      )
    }
    const coordinator = this.requireTab(tabId)
    const document = coordinator.document
    const epoch = coordinator.documentEpoch
    if (document.documentId !== request.documentId) {
      throw new ProjectAutosaveError(
        'EDIT_CONFLICT',
        'The destination Project changed. Reopen Apply.',
      )
    }
    const current = structuredClone({
      generationDraft: document.generationDraft,
      primaryBbox: document.primaryBbox,
    })
    // Collaborators receive their own copy; the accepted request remains immutable across await.
    await verify(structuredClone(request), current)
    if (
      this.openTabs.get(tabId) !== coordinator ||
      coordinator.documentEpoch !== epoch ||
      coordinator.document.documentRevision !== document.documentRevision
    ) {
      throw new ProjectAutosaveError(
        'EDIT_CONFLICT',
        'The Project changed while verifying preset settings. Review and apply again.',
      )
    }
    const next = applyPresetSections(document, request.payload, request.selectedSections)
    if (
      JSON.stringify(next.generationDraft) === JSON.stringify(document.generationDraft) &&
      JSON.stringify(next.primaryBbox) === JSON.stringify(document.primaryBbox)
    ) {
      return toTab(tabId, coordinator)
    }
    await coordinator.applyDocument(
      { ...document, ...next },
      {},
      { expectedDocumentRevision: document.documentRevision },
    )
    return toTab(tabId, coordinator)
  }

  /** Cancel never changes the chosen external file or the managed workspace. */
  cancelImport(importId: string): void {
    this.pendingImports.delete(importId)
  }

  async clearHistory(tabId: string): Promise<ProjectTab> {
    const coordinator = this.requireTab(tabId)
    await coordinator.clearHistory()
    return toTab(tabId, coordinator)
  }

  async close(tabId: string): Promise<void> {
    const rebuilding = this.rebuilding.get(tabId)
    if (rebuilding) {
      await rebuilding.catch(() => undefined)
    }
    const saving = this.saving.get(tabId)
    if (saving) {
      await saving.catch(() => undefined)
    }
    const coordinator = this.requireTab(tabId)
    if (coordinator.dirty) {
      throw new ProjectServiceError(
        'PROJECT_DIRTY',
        'Save or discard the Project changes before closing this tab.',
      )
    }
    await coordinator.close()
    this.openTabs.delete(tabId)
  }

  async create(input: ProjectCreateInput): Promise<ProjectTab> {
    const { generationPayload, primaryBbox, title } = parseCreateInput(input)
    await this.initialize()
    const workspace = await this.options.repository.workspaceById(UNCATEGORIZED_WORKSPACE_ID)
    // A random basename avoids path traversal, invalid filename characters and title collisions.
    // createOnly in ProjectSession still rejects an unexpected UUID collision.
    const filePath = path.join(workspace.directoryPath, `project-${randomUUID()}.igs`)
    const session = await ProjectSession.create(
      filePath,
      title,
      this.options.roots,
      primaryBbox,
      workspace.directoryPath,
      generationPayload,
    )
    // Indexing is derived. On failure the committed .igs remains in the workspace so a later
    // scan can discover it; removing the file here would lose the user's new Project.
    try {
      await this.options.repository.indexSaved(session.filePath, workspace.id)
    } catch {
      throw new ProjectServiceError(
        'PROJECT_CREATED_NOT_INDEXED',
        'The .igs file was created in Uncategorized, but Home could not index it. Retry loading Home to rediscover the file.',
      )
    }
    const coordinator = await ProjectAutosaveCoordinator.attach(
      session,
      this.options.roots,
      this.options.shadow,
      this.options.autosaveOptions,
    )
    this.openTabs.set(session.localRecoveryKey, coordinator)
    await this.markOpenedBestEffort(session.filePath)
    return {
      ...toTab(session.localRecoveryKey, coordinator),
      ...(session.creationDirectorySynced === false
        ? {
            storageWarning:
              'The Project file was created, but the filesystem did not confirm directory sync. Save again to reinforce it.',
          }
        : {}),
    }
  }

  async discardAndClose(tabId: string): Promise<void> {
    const rebuilding = this.rebuilding.get(tabId)
    if (rebuilding) {
      await rebuilding.catch(() => undefined)
    }
    const saving = this.saving.get(tabId)
    if (saving) {
      await saving.catch(() => undefined)
    }
    const coordinator = this.requireTab(tabId)
    const clean = await coordinator.discardChanges(this.options.roots)
    // discardChanges transfers the exclusive path lease to its returned coordinator.
    this.openTabs.set(tabId, clean)
    await clean.close()
    this.openTabs.delete(tabId)
  }

  /** Publish one captured gesture. Pixels and paths are created only by Main. */
  async editSmartPatchMask(
    tabId: string,
    layerId: string,
    input: ProjectSmartPatchMaskEditRequest,
  ): Promise<ProjectTab> {
    if (!isProjectSmartPatchMaskEditRequest(input)) {
      throw new ProjectServiceError('PROJECT_INVALID_INPUT', 'The mask gesture is invalid.')
    }
    const request = structuredClone(input)
    const coordinator = this.requireTab(tabId)
    const document = coordinator.document
    const epoch = coordinator.documentEpoch
    const patch = requireSmartPatch(document, layerId)
    if (
      request.documentId !== document.documentId ||
      request.documentRevision !== document.documentRevision ||
      request.maskId !== patch.mask.id ||
      request.maskRevision !== patch.mask.revision
    ) {
      throw new ProjectAutosaveError('EDIT_CONFLICT', 'The mask changed. Start a new gesture.')
    }
    if (patch.locked) {
      throw new ProjectServiceError(
        'PROJECT_LAYER_LOCKED',
        'Unlock this Smart Patch to edit its mask.',
      )
    }
    if (!patch.visible) {
      throw new ProjectServiceError(
        'PROJECT_LAYER_HIDDEN',
        'Show this Smart Patch to edit its mask.',
      )
    }
    let current: ProjectMaskBitmap | null = null
    let currentBytes: Buffer | null = null
    if (patch.mask.asset !== null) {
      if (!('bounds' in patch.mask)) {
        throw new ProjectServiceError('PROJECT_MASK_UNAVAILABLE', 'The mask has no valid bounds.')
      }
      const bytes = await readMaskAssetBytes(coordinator, patch.mask.asset)
      currentBytes = bytes
      current = {
        alpha: decodeProjectMaskPng(bytes, patch.mask.asset),
        bounds: structuredClone(patch.mask.bounds),
      }
    }
    if (
      this.openTabs.get(tabId) !== coordinator ||
      coordinator.documentEpoch !== epoch ||
      coordinator.document.documentRevision !== document.documentRevision
    ) {
      throw new ProjectAutosaveError(
        'EDIT_CONFLICT',
        'The Project changed. Start a new mask gesture.',
      )
    }
    if (request.edit.kind === 'fit-bbox') {
      if (!current) {
        throw new ProjectMaskError(
          'MASK_INPUT_INVALID',
          'Paint this Smart Patch mask before fitting its bbox.',
        )
      }
      const rect = fitProjectMaskBbox(current.bounds, patch.maskSettings)
      if (
        patch.boundingBox.x === rect.x &&
        patch.boundingBox.y === rect.y &&
        patch.boundingBox.width === rect.width &&
        patch.boundingBox.height === rect.height
      ) {
        return toTab(tabId, coordinator)
      }
      await coordinator.applyDocument(
        {
          ...document,
          layers: document.layers.map((layer) =>
            layer.id === layerId ? { ...patch, boundingBox: rect } : layer,
          ),
        },
        {},
        { expectedDocumentEpoch: epoch, expectedDocumentRevision: document.documentRevision },
      )
      return toTab(tabId, coordinator)
    }
    const rendered = applyProjectMaskEdit(current, request.edit)
    if (
      (!rendered && !current) ||
      (rendered &&
        current &&
        JSON.stringify(rendered.bounds) === JSON.stringify(current.bounds) &&
        Buffer.from(rendered.alpha).equals(Buffer.from(current.alpha)))
    ) {
      return toTab(tabId, coordinator)
    }
    const revision = patch.mask.revision + 1
    if (!Number.isSafeInteger(revision)) {
      throw new ProjectServiceError(
        'PROJECT_INVALID_INPUT',
        'The mask revision limit has been reached.',
      )
    }
    let mask: IgsSmartPatchLayerV1['mask'] = { asset: null, id: patch.mask.id, revision }
    const sources: Record<string, IgsAssetSource> = {}
    if (rendered) {
      // Valid imported PNGs may have different filters/chunking. A pixel-preserving move keeps
      // their exact immutable bytes; changed coverage alone needs a new encoding.
      const bytes =
        current &&
        currentBytes &&
        rendered.bounds.width === current.bounds.width &&
        rendered.bounds.height === current.bounds.height &&
        Buffer.from(rendered.alpha).equals(Buffer.from(current.alpha))
          ? currentBytes
          : encodeProjectMaskPng(rendered.alpha, rendered.bounds.width, rendered.bounds.height)
      const sha256 = createHash('sha256').update(bytes).digest('hex')
      const memberPath = `assets/masks/${patch.mask.id}/${sha256}.png`
      mask = {
        asset: {
          bytes: bytes.length,
          height: rendered.bounds.height,
          path: memberPath,
          sha256,
          width: rendered.bounds.width,
        },
        bounds: rendered.bounds,
        id: patch.mask.id,
        revision,
      }
      sources[memberPath] = { bytes }
    }
    await coordinator.applyDocument(
      {
        ...document,
        layers: document.layers.map((layer) => (layer.id === layerId ? { ...patch, mask } : layer)),
      },
      sources,
      { expectedDocumentEpoch: epoch, expectedDocumentRevision: document.documentRevision },
    )
    return toTab(tabId, coordinator)
  }

  /** Publish a validated copy before considering removal of the external source. */
  async finishImport(
    importId: string,
    choice: 'copy' | 'move',
  ): Promise<ProjectImportFinishResult> {
    if (choice !== 'copy' && choice !== 'move') {
      throw new ProjectServiceError('PROJECT_INVALID_INPUT', 'Choose Move or Copy.')
    }
    const selected = this.pendingImports.get(importId)
    if (!selected) {
      throw new ProjectServiceError(
        'PROJECT_IMPORT_SELECTION_MISSING',
        'Choose the Project file again before importing it.',
      )
    }
    // One selection cannot initiate two concurrent transfers or be replayed after a failure.
    this.pendingImports.delete(importId)
    const current = await inspectImportSource(selected.sourcePath).catch(() => {
      throw sourceChanged()
    })
    if (!sameImportSource(current, selected)) {
      throw sourceChanged()
    }
    const workspace = await this.options.repository.workspaceById(UNCATEGORIZED_WORKSPACE_ID)
    await assertImportWorkspace(workspace.directoryPath)
    const stagedPath = path.join(workspace.directoryPath, `.import-${randomUUID()}.tmp`)
    let destinationPath: string | undefined
    try {
      await copySelectedSource(selected, stagedPath)
      const staged = await readIgsPackage(stagedPath)
      if (
        staged.project.documentId !== selected.documentId ||
        staged.project.documentRevision !== selected.documentRevision
      ) {
        throw sourceChanged()
      }
      await assertImportWorkspace(workspace.directoryPath)
      destinationPath = await publishImportedFile(
        stagedPath,
        workspace.directoryPath,
        selected.fileName,
      )
    } finally {
      await unlink(stagedPath).catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          process.emitWarning(`Project import staging cleanup failed: ${String(error)}`)
        }
      })
    }

    // The imported .igs is already committed. An index/open failure must not delete either copy.
    if (!destinationPath) {
      throw new ProjectServiceError(
        'PROJECT_IMPORT_INVALID_SOURCE',
        'The selected Project was not copied into the workspace.',
      )
    }
    const destinationFingerprint = await sourceFingerprint(destinationPath)
    const destinationSynced = await syncImportDirectory(workspace.directoryPath)
    try {
      await this.options.repository.indexSaved(destinationPath, workspace.id)
    } catch {
      throw new ProjectServiceError(
        'PROJECT_IMPORTED_NOT_INDEXED',
        'The Project was copied into Uncategorized, but Home could not index it. The source was kept; reload Home to rediscover the imported file.',
      )
    }
    let result: ProjectOpenResult
    try {
      result = await this.openImportedProject(localProjectRecoveryKey(destinationPath))
    } catch {
      throw new ProjectServiceError(
        'PROJECT_IMPORTED_NOT_OPENED',
        'The Project was copied into Uncategorized, but could not be opened. The source was kept; reload Home and open the imported Project.',
      )
    }

    const warnings: string[] = []
    if (!destinationSynced) {
      warnings.push('The imported Project was saved, but directory sync could not be confirmed.')
    }
    let sourceRetained = true
    if (choice === 'move' && destinationSynced && result.kind === 'opened') {
      try {
        if (
          (await sourceFingerprint(selected.sourcePath)) !== selected.fingerprint ||
          (await sourceFingerprint(destinationPath)) !== destinationFingerprint
        ) {
          throw sourceChanged()
        }
        await (this.options.removeImportedSource ?? unlink)(selected.sourcePath)
        sourceRetained = false
        if (!(await syncImportDirectory(path.dirname(selected.sourcePath)))) {
          warnings.push('Source removal could not be confirmed on disk after the move.')
        }
      } catch {
        warnings.push(
          'The Project was imported, but its original file was kept. Remove it manually if no longer needed.',
        )
      }
    } else if (choice === 'move' && result.kind !== 'opened') {
      warnings.push(
        'The original file was kept because the imported Project needs recovery review.',
      )
    } else if (choice === 'move' && !destinationSynced) {
      warnings.push('The original file was kept because the imported directory was not synced.')
    }
    return {
      result,
      sourceRetained,
      ...(warnings.length ? { warning: warnings.join(' ') } : {}),
    }
  }

  async flushAutosave(tabId: string): Promise<void> {
    await this.requireTab(tabId).flush()
  }

  /** Saved catalog only; callers explicitly Refresh through the existing workspace scan. */
  async getAcceptedResultHistory(
    cursor: AcceptedResultHistoryCursor | null = null,
  ): Promise<AcceptedResultHistoryPage> {
    const page = await this.options.repository.listSavedAcceptedResultsPage(cursor)
    return {
      items: page.items.map((record) => {
        const reference: AcceptedResultHistoryReference = {
          assetSha256: record.assetSha256,
          documentId: record.documentId,
          documentRevision: record.documentRevision,
          layerId: record.layerId,
          projectKey: record.localProjectKey,
        }
        return {
          ...reference,
          acceptedAt: record.acceptedAt,
          height: record.outputHeight,
          imageUrl: canPreviewSavedAcceptedResult(record)
            ? acceptedHistoryImageUrl(reference)
            : null,
          layerName: record.layerName,
          modelFileSha256: record.modelFileSha256,
          modelName: record.modelName,
          modelVersionName: record.modelVersionName,
          projectName: record.projectTitle,
          seed: record.actualSeed,
          width: record.outputWidth,
        }
      }),
      nextCursor: page.nextCursor,
      totalCount: page.totalCount,
    }
  }

  /** Read exact current pixel mode independently of result/layer ownership or generation admission. */
  async getGenerationTargetState(
    tabId: string,
    documentId: string,
    targetKey: string,
    withWorker?: (
      use: (
        worker: Pick<ProjectWorkerClient, 'composeTarget'>,
      ) => Promise<ProjectGenerationTargetState['mode']>,
    ) => Promise<ProjectGenerationTargetState['mode']>,
  ): Promise<ProjectGenerationTargetState> {
    if (!isProjectDocumentId(documentId) || !isGenerationTargetKey(targetKey)) {
      throw new ProjectServiceError(
        'PROJECT_INVALID_INPUT',
        'The generation area owner is invalid.',
      )
    }
    const coordinator = this.requireTab(tabId)
    const assertCurrent = () => {
      const current = this.openTabs.get(tabId)
      const signature = current ? generationTargetSignature(toTab(tabId, current)) : null
      if (
        current !== coordinator ||
        current?.document.documentId !== documentId ||
        !signature ||
        createHash('sha256').update(signature).digest('hex') !== targetKey
      ) {
        throw new ProjectServiceError(
          'PROJECT_TARGET_CHANGED',
          'The generation area changed while its pixels were being read.',
        )
      }
    }
    assertCurrent()
    const cached = this.targetModes.get(coordinator)
    if (cached?.key === targetKey) {
      return { documentId, mode: cached.mode, targetKey, unavailableReason: null }
    }
    let mode: ProjectGenerationTargetState['mode'] = null
    let unavailableReason =
      'The generation area pixels are unavailable. The image worker could not compose this Canvas.'
    if (withWorker) {
      try {
        mode = await this.withCapturedNormalGenerationInput(tabId, async (capture) => {
          assertCurrent()
          return await withWorker(async (worker) => {
            assertCurrent()
            const target = await capture.composeTarget(worker)
            assertCurrent()
            return target.mode
          })
        })
      } catch (error) {
        assertCurrent()
        if (error instanceof Error) {
          unavailableReason = `The generation area pixels are unavailable. ${error.message}`.slice(
            0,
            512,
          )
        }
      }
    }
    assertCurrent()
    if (mode !== null) {
      this.targetModes.set(coordinator, { key: targetKey, mode })
    }
    return {
      documentId,
      mode,
      targetKey,
      unavailableReason: mode === null ? unavailableReason : null,
    }
  }

  /** Resolve a process-issued image capability only against a currently open document revision. */
  getLayerAsset(resource: ProjectLayerResourceRequest):
    | { filePath: string; kind: 'saved'; member: IgsRasterLayerV1['asset'] }
    | {
        kind: 'staged'
        member: IgsRasterLayerV1['asset']
        source: IgsAssetSource
      }
    | null {
    if (!PROJECT_ID_PATTERN.test(resource.tabId)) {
      return null
    }
    const coordinator = this.openTabs.get(resource.tabId)
    if (!coordinator) {
      return null
    }
    const member = resolveProjectLayerAsset(coordinator.document, resource)
    if (!member) {
      return null
    }
    const source = coordinator.getCurrentAssetSource(member)
    return source
      ? { kind: 'staged', member, source }
      : { filePath: coordinator.filePath, kind: 'saved', member }
  }

  /** Mask capabilities cannot resolve Raster assets or a different owner/revision. */
  getMaskAsset(resource: ProjectMaskResourceRequest):
    | {
        filePath: string
        kind: 'saved'
        member: NonNullable<IgsSmartPatchLayerV1['mask']['asset']>
      }
    | {
        kind: 'staged'
        member: NonNullable<IgsSmartPatchLayerV1['mask']['asset']>
        source: IgsAssetSource
      }
    | null {
    if (!PROJECT_ID_PATTERN.test(resource.tabId)) {
      return null
    }
    const coordinator = this.openTabs.get(resource.tabId)
    if (!coordinator) {
      return null
    }
    const member = resolveProjectMaskAsset(coordinator.document, resource)
    if (!member) {
      return null
    }
    const source = coordinator.getCurrentAssetSource(member)
    return source
      ? { kind: 'staged', member, source }
      : { filePath: coordinator.filePath, kind: 'saved', member }
  }

  /** Main-only acceptance owner. Never expose this coordinator or its paths through IPC. */
  getOpenDocumentForAcceptance(tabId: string): ProjectAutosaveCoordinator | null {
    return PROJECT_ID_PATTERN.test(tabId) ? (this.openTabs.get(tabId) ?? null) : null
  }

  /** Main-only identity for linking local recovery to the document actually open in this tab. */
  getOpenDocumentId(tabId: string): string | null {
    return PROJECT_ID_PATTERN.test(tabId)
      ? (this.openTabs.get(tabId)?.document.documentId ?? null)
      : null
  }

  getOpenTabs(): ProjectTab[] {
    return [...this.openTabs].map(([id, coordinator]) => toTab(id, coordinator))
  }

  /** Read portable result settings and current pixel mode without admitting a generation or edit. */
  async getRasterGenerationData(
    tabId: string,
    documentId: string,
    layerId: string,
    withWorker?: (
      use: (
        worker: Pick<ProjectWorkerClient, 'composeTarget'>,
      ) => Promise<RasterGenerationData['currentMode']>,
    ) => Promise<RasterGenerationData['currentMode']>,
  ): Promise<RasterGenerationData> {
    if (!isProjectDocumentId(documentId) || !isProjectDocumentId(layerId)) {
      throw new ProjectServiceError('PROJECT_INVALID_INPUT', 'The comparison owner is invalid.')
    }
    const coordinator = this.requireTab(tabId)
    const document = coordinator.document
    if (document.documentId !== documentId) {
      throw new ProjectServiceError(
        'PROJECT_IDENTITY_MISMATCH',
        'The comparison belongs to another Project document.',
      )
    }
    const layer = document.layers.find((candidate) => candidate.id === layerId)
    if (!layer || layer.kind !== 'raster') {
      throw new ProjectServiceError(
        'PROJECT_LAYER_NOT_FOUND',
        'This Raster Layer is not available.',
      )
    }
    const documentEpoch = coordinator.documentEpoch
    const generationConfiguration = layer.generationProvenance
      ? structuredClone(layer.generationProvenance.generationConfiguration)
      : null
    const assertCurrent = (): void => {
      const current = this.openTabs.get(tabId)
      const currentDocument = current?.document
      if (
        current !== coordinator ||
        current.documentEpoch !== documentEpoch ||
        currentDocument?.documentId !== documentId ||
        currentDocument.documentRevision !== document.documentRevision ||
        !currentDocument.layers.some((candidate) => candidate.id === layerId)
      ) {
        throw new ProjectServiceError(
          'PROJECT_COMPARISON_CHANGED',
          'The Project changed while reading generation settings. Open the comparison again.',
        )
      }
    }
    let currentMode: RasterGenerationData['currentMode'] = null
    if (withWorker) {
      try {
        const signature = generationTargetSignature(toTab(tabId, coordinator))
        if (!signature) {
          throw new Error('The generation area inputs are unavailable.')
        }
        const result = await this.getGenerationTargetState(
          tabId,
          documentId,
          createHash('sha256').update(signature).digest('hex'),
          withWorker,
        )
        assertCurrent()
        currentMode = result.mode
      } catch {
        // A changed owner is refused rather than disguised as an unavailable worker.
        assertCurrent()
      }
    }
    assertCurrent()
    return {
      currentMode,
      documentId,
      generationConfiguration,
      layerId,
      modeUnavailableReason:
        currentMode === null
          ? 'The current generation mode is unavailable. The image worker could not compose this Canvas.'
          : null,
    }
  }

  hasDirtyTabs(): boolean {
    return [...this.openTabs.values()].some((coordinator) => coordinator.dirty)
  }

  /** Add a dialog-selected image to the current document, leaving the saved .igs untouched. */
  async importRasterImage(
    tabId: string,
    authorizedSourcePath: string,
    worker: Pick<ProjectWorkerClient, 'normalizeImport'>,
  ): Promise<ProjectTab> {
    const coordinator = this.requireTab(tabId)
    await mkdir(this.options.roots.scratchDir, { recursive: true })
    const document = coordinator.document
    const prepared = await importRasterLayer({
      authorizedSourcePath,
      getDocument: () => coordinator.document,
      insertIndex: 0,
      name: rasterImportName(authorizedSourcePath),
      position: { x: document.primaryBbox.x, y: document.primaryBbox.y },
      stagingBasePath: this.options.roots.scratchDir,
      worker,
    })
    try {
      await coordinator.applyDocument(prepared.document, prepared.assetSources, {
        expectedDocumentRevision: prepared.baseDocumentRevision,
      })
      return toTab(tabId, coordinator)
    } finally {
      // Source ownership transfers to the coordinator before applyDocument resolves. A cleanup
      // failure must not report a committed document edit as a failed import.
      await prepared.dispose().catch((error: unknown) => {
        process.emitWarning(`Raster import staging cleanup failed: ${String(error)}`)
      })
    }
  }

  async initialize(): Promise<void> {
    if (!this.initialization) {
      this.initialization = (async () => {
        await this.options.repository.ensureDefaultWorkspace(this.options.dataRoot)
        await this.options.repository.scanWorkspace(UNCATEGORIZED_WORKSPACE_ID)
      })().catch((error: unknown) => {
        this.initialization = undefined
        throw error
      })
    }
    await this.initialization
  }

  async list(): Promise<ProjectSummary[]> {
    await this.initialize()
    const records = await this.options.repository.scanWorkspace(UNCATEGORIZED_WORKSPACE_ID)
    return await Promise.all(records.map(async (record) => await this.toSummary(record)))
  }

  async moveRasterLayer(tabId: string, layerId: string, targetIndex: number): Promise<ProjectTab> {
    const coordinator = this.requireTab(tabId)
    const document = coordinator.document
    if (
      !Number.isSafeInteger(targetIndex) ||
      targetIndex < 0 ||
      targetIndex >= document.layers.length
    ) {
      throw new ProjectServiceError(
        'PROJECT_INVALID_INPUT',
        'The Raster Layer position is invalid.',
      )
    }
    const index = document.layers.findIndex((layer) => layer.id === layerId)
    if (index < 0) {
      throw new ProjectServiceError(
        'PROJECT_LAYER_NOT_FOUND',
        'This Raster Layer is not available.',
      )
    }
    const layer = document.layers[index]
    if (layer.locked) {
      throw new ProjectServiceError(
        'PROJECT_LAYER_LOCKED',
        'Unlock this Raster Layer before moving it.',
      )
    }
    if (index === targetIndex) {
      return toTab(tabId, coordinator)
    }
    // The coordinator document is shared with acceptance/undo readers. Never mutate it before
    // the revision-guarded apply, or a concurrent operation can observe an uncommitted reorder.
    const layers = [...document.layers]
    layers.splice(index, 1)
    layers.splice(targetIndex, 0, layer)
    await coordinator.applyDocument(
      { ...document, layers },
      {},
      { expectedDocumentRevision: document.documentRevision },
    )
    return toTab(tabId, coordinator)
  }

  async open(projectId: string): Promise<ProjectOpenResult> {
    assertProjectId(projectId)
    const rebuilding = this.rebuilding.get(projectId)
    if (rebuilding) {
      await rebuilding.catch(() => undefined)
    }
    const existing = this.openTabs.get(projectId)
    if (existing) {
      return { kind: 'opened', tab: toTab(projectId, existing) }
    }
    const pending = this.opening.get(projectId)
    if (pending) {
      return await pending
    }
    const opening = this.openOne(projectId)
    this.opening.set(projectId, opening)
    try {
      return await opening
    } finally {
      this.opening.delete(projectId)
    }
  }

  async prepareNormalGenerationContext(
    tabId: string,
    worker: Pick<ProjectWorkerClient, 'composeTarget'>,
    modelService: GenerationModelResolver,
    randomUint32?: () => number,
    lastActualSeed?: number | null,
  ): ReturnType<typeof prepareNormalGeneration> {
    const document = this.requireTab(tabId).document
    validateNormalGenerationDraft(
      document.generationDraft,
      lastActualSeed,
      document.lastActualSeedSnapshot,
    )
    return await this.withCapturedNormalGenerationInput(tabId, async (capture) => {
      const draft = capture.document.generationDraft
      await modelService.assertNoUnboundGenerationEmbeddings({
        modelFamily: draft.model?.baseModelFamily ?? null,
        negativePrompt: draft.negativePrompt,
        positivePrompt: draft.positivePrompt,
      })
      const target = await capture.composeTarget(worker)
      return await prepareNormalGeneration({ lastActualSeed, modelService, randomUint32, target })
    })
  }

  /** Freeze the current normal-generation target entirely in main-owned bytes for a future job. */
  async prepareNormalGenerationInput(
    tabId: string,
    worker: Pick<ProjectWorkerClient, 'composeTarget'>,
  ): ReturnType<typeof buildFrozenGenerationTarget> {
    return await this.withCapturedNormalGenerationInput(tabId, (capture) =>
      capture.composeTarget(worker),
    )
  }

  /** Prepare one verified Project context; queue and worker qualification are separate gates. */
  async prepareNormalTxt2ImgContext(
    tabId: string,
    worker: Pick<ProjectWorkerClient, 'composeTarget'>,
    modelService: GenerationModelResolver,
    randomUint32?: () => number,
    lastActualSeed?: number | null,
  ): ReturnType<typeof prepareNormalTxt2Img> {
    // A known-invalid draft should explain itself even if image composition cannot start.
    const document = this.requireTab(tabId).document
    validateNormalTxt2ImgDraft(
      document.generationDraft,
      lastActualSeed,
      document.lastActualSeedSnapshot,
    )
    return await this.withCapturedNormalGenerationInput(tabId, async (capture) => {
      const draft = capture.document.generationDraft
      await modelService.assertNoUnboundGenerationEmbeddings({
        modelFamily: draft.model?.baseModelFamily ?? null,
        negativePrompt: draft.negativePrompt,
        positivePrompt: draft.positivePrompt,
      })
      const target = await capture.composeTarget(worker)
      return await prepareNormalTxt2Img({ lastActualSeed, modelService, randomUint32, target })
    })
  }

  /** Rebuild a saved derivative without silently saving document edits or touching recovery. */
  async rebuildPreview(
    projectId: string,
    worker: Pick<ProjectWorkerClient, 'composePreview'>,
  ): Promise<ProjectRebuildResult> {
    assertProjectId(projectId)
    if (this.rebuilding.has(projectId)) {
      throw new ProjectServiceError(
        'PROJECT_REBUILD_IN_PROGRESS',
        'This Project preview is already rebuilding.',
      )
    }
    const rebuilding = this.rebuildOne(projectId, worker)
    this.rebuilding.set(projectId, rebuilding)
    try {
      return await rebuilding
    } finally {
      this.rebuilding.delete(projectId)
    }
  }

  async redo(tabId: string): Promise<ProjectTab> {
    const coordinator = this.requireTab(tabId)
    await coordinator.redo()
    return toTab(tabId, coordinator)
  }

  /** Relink one saved embedding literal without rewriting copied resource metadata. */
  async relinkGenerationEmbedding(
    tabId: string,
    identity: ProjectEmbeddingIdentity,
    resolve: (
      saved: GenerationPrompt['embeddingRefs'][number]['resource'],
    ) => Promise<GenerationPrompt['embeddingRefs'][number]['resource']>,
    targetLayerId?: string,
  ): Promise<ProjectTab> {
    if (!isProjectEmbeddingIdentity(identity)) {
      throw new ProjectServiceError('PROJECT_INVALID_INPUT', 'The embedding identity is invalid.')
    }
    const coordinator = this.requireTab(tabId)
    const document = coordinator.document
    const scope = generationDraftScope(document, targetLayerId)
    const draft = scope.draft
    const documentEpoch = coordinator.documentEpoch
    const field = identity.polarity === 'positive' ? 'positivePrompt' : 'negativePrompt'
    const prompt = draft[field]
    const index = prompt.embeddingRefs.findIndex(
      (ref) =>
        ref.resource.localModelId === identity.resourceId &&
        ref.resource.localVersionId === identity.versionId &&
        ref.token === identity.token,
    )
    if (index < 0) {
      throw new ProjectServiceError(
        'PROJECT_EMBEDDING_NOT_SELECTED',
        'This exact embedding literal is no longer present in the Project prompt.',
      )
    }
    const ref = prompt.embeddingRefs[index]
    const saved = ref.resource
    if (
      saved.kind !== 'embedding' ||
      saved.baseModelFamily !== 'illustrious' ||
      saved.predictionType !== null
    ) {
      throw new ProjectServiceError(
        'PROJECT_INVALID_INPUT',
        'Only an Illustrious embedding can be linked.',
      )
    }
    const resolved = await resolve(structuredClone(saved))
    if (
      resolved.kind !== 'embedding' ||
      resolved.baseModelFamily !== saved.baseModelFamily ||
      resolved.predictionType !== saved.predictionType ||
      resolved.civitaiModelId !== saved.civitaiModelId ||
      resolved.civitaiVersionId !== saved.civitaiVersionId ||
      resolved.civitaiFileId !== saved.civitaiFileId ||
      resolved.fileSha256.toLowerCase() !== saved.fileSha256.toLowerCase()
    ) {
      throw new ProjectServiceError(
        'PROJECT_EMBEDDING_RELINK_MISMATCH',
        'The installed embedding does not match the exact Project reference.',
      )
    }
    if (
      this.openTabs.get(tabId) !== coordinator ||
      coordinator.documentEpoch !== documentEpoch ||
      coordinator.document.documentRevision !== document.documentRevision
    ) {
      throw new ProjectAutosaveError(
        'EDIT_CONFLICT',
        'The Project changed while linking its embedding.',
      )
    }
    const linked = {
      ...saved,
      localModelId: resolved.localModelId,
      localVersionId: resolved.localVersionId,
    }
    if (
      linked.localModelId === saved.localModelId &&
      linked.localVersionId === saved.localVersionId
    ) {
      return toTab(tabId, coordinator)
    }
    await coordinator.applyDocument(
      scope.replace({
        ...draft,
        [field]: {
          ...prompt,
          embeddingRefs: prompt.embeddingRefs.map((entry, current) =>
            current === index ? { ...entry, resource: linked } : entry,
          ),
        },
      }),
      {},
      {
        expectedDocumentEpoch: documentEpoch,
        expectedDocumentRevision: document.documentRevision,
      },
    )
    return toTab(tabId, coordinator)
  }

  /** Link one saved LoRA without replacing its settings or copied metadata. */
  async relinkGenerationLora(
    tabId: string,
    identity: ProjectLoraIdentity,
    resolve: (
      saved: IgsProjectDocumentV1['generationDraft']['loras'][number]['resource'],
    ) => Promise<IgsProjectDocumentV1['generationDraft']['loras'][number]['resource']>,
    targetLayerId?: string,
  ): Promise<ProjectTab> {
    const coordinator = this.requireTab(tabId)
    const document = coordinator.document
    const scope = generationDraftScope(document, targetLayerId)
    const draft = scope.draft
    const index = this.loraIndex({ ...document, generationDraft: draft }, identity)
    const lora = draft.loras[index]
    const saved = lora.resource
    const resolved = await resolve(structuredClone(saved))
    if (
      resolved.kind !== 'lora' ||
      resolved.civitaiModelId !== saved.civitaiModelId ||
      resolved.civitaiVersionId !== saved.civitaiVersionId ||
      resolved.civitaiFileId !== saved.civitaiFileId ||
      resolved.fileSha256.toLowerCase() !== saved.fileSha256.toLowerCase() ||
      resolved.baseModelFamily !== saved.baseModelFamily
    ) {
      throw new ProjectServiceError(
        'PROJECT_LORA_RELINK_MISMATCH',
        'The installed LoRA does not match the exact Project reference.',
      )
    }
    if (
      this.openTabs.get(tabId) !== coordinator ||
      coordinator.document.documentRevision !== document.documentRevision
    ) {
      throw new ProjectAutosaveError('EDIT_CONFLICT', 'The Project changed while linking its LoRA.')
    }
    if (
      draft.loras.some(
        (entry, current) => current !== index && sameResourceModel(entry.resource, resolved),
      )
    ) {
      throw new ProjectServiceError(
        'PROJECT_INVALID_INPUT',
        'This LoRA is already present in another row. Remove the duplicate before linking.',
      )
    }
    const linked = {
      ...saved,
      localModelId: resolved.localModelId,
      localVersionId: resolved.localVersionId,
    }
    if (
      saved.localModelId === linked.localModelId &&
      saved.localVersionId === linked.localVersionId
    ) {
      return toTab(tabId, coordinator)
    }
    await coordinator.applyDocument(
      scope.replace({
        ...draft,
        loras: draft.loras.map((entry, current) =>
          current === index ? { ...entry, resource: linked } : entry,
        ),
      }),
      {},
      { expectedDocumentRevision: document.documentRevision },
    )
    return toTab(tabId, coordinator)
  }

  /**
   * Resolve the current saved ref through a main-owned registry; an in-flight edit cannot win a
   * newer revision.
   */
  async relinkGenerationModel(
    tabId: string,
    resolve: (
      saved: NonNullable<IgsProjectDocumentV1['generationDraft']['model']>,
    ) => Promise<NonNullable<IgsProjectDocumentV1['generationDraft']['model']>>,
    targetLayerId?: string,
  ): Promise<ProjectTab> {
    const coordinator = this.requireTab(tabId)
    const document = coordinator.document
    const scope = generationDraftScope(document, targetLayerId)
    const draft = scope.draft
    const saved = draft.model
    if (!saved) {
      throw new ProjectServiceError(
        'PROJECT_MODEL_NOT_SELECTED',
        'Choose a checkpoint before linking an installed version.',
      )
    }
    const resolved = await resolve(saved)
    if (
      resolved.kind !== 'checkpoint' ||
      resolved.civitaiModelId !== saved.civitaiModelId ||
      resolved.civitaiVersionId !== saved.civitaiVersionId ||
      resolved.civitaiFileId !== saved.civitaiFileId ||
      resolved.fileSha256.toLowerCase() !== saved.fileSha256.toLowerCase() ||
      resolved.baseModelFamily !== saved.baseModelFamily
    ) {
      throw new ProjectServiceError(
        'PROJECT_MODEL_RELINK_MISMATCH',
        'The installed checkpoint does not match the exact Project reference.',
      )
    }
    if (
      this.openTabs.get(tabId) !== coordinator ||
      coordinator.document.documentRevision !== document.documentRevision
    ) {
      throw new ProjectAutosaveError(
        'EDIT_CONFLICT',
        'The Project changed while linking its model.',
      )
    }
    // Relink only local registry IDs. Copied display and prediction metadata are frozen Project data.
    const linked = {
      ...saved,
      localModelId: resolved.localModelId,
      localVersionId: resolved.localVersionId,
    }
    if (
      saved.localModelId === linked.localModelId &&
      saved.localVersionId === linked.localVersionId
    ) {
      return toTab(tabId, coordinator)
    }
    await coordinator.applyDocument(
      scope.replace({ ...draft, model: linked }),
      {},
      { expectedDocumentRevision: document.documentRevision },
    )
    return toTab(tabId, coordinator)
  }

  /** Verify portable VAE identity, then replace only its local registry IDs. */
  async relinkGenerationVae(
    tabId: string,
    resolve: (
      saved: NonNullable<IgsProjectDocumentV1['generationDraft']['vae']>,
    ) => Promise<NonNullable<IgsProjectDocumentV1['generationDraft']['vae']>>,
    targetLayerId?: string,
  ): Promise<ProjectTab> {
    const coordinator = this.requireTab(tabId)
    const document = coordinator.document
    const scope = generationDraftScope(document, targetLayerId)
    const draft = scope.draft
    const documentEpoch = coordinator.documentEpoch
    const saved = draft.vae
    if (!saved) {
      throw new ProjectServiceError(
        'PROJECT_VAE_NOT_SELECTED',
        'Choose an external VAE before linking an installed version.',
      )
    }
    if (saved.kind !== 'vae' || saved.baseModelFamily !== 'illustrious') {
      throw new ProjectServiceError(
        'PROJECT_INVALID_INPUT',
        'Only an Illustrious-compatible external VAE can be linked.',
      )
    }
    const resolved = await resolve(structuredClone(saved))
    if (
      resolved.kind !== 'vae' ||
      resolved.baseModelFamily !== 'illustrious' ||
      resolved.civitaiModelId !== saved.civitaiModelId ||
      resolved.civitaiVersionId !== saved.civitaiVersionId ||
      resolved.civitaiFileId !== saved.civitaiFileId ||
      resolved.fileSha256.toLowerCase() !== saved.fileSha256.toLowerCase()
    ) {
      throw new ProjectServiceError(
        'PROJECT_VAE_RELINK_MISMATCH',
        'The installed VAE does not match the exact Project reference.',
      )
    }
    if (
      this.openTabs.get(tabId) !== coordinator ||
      coordinator.documentEpoch !== documentEpoch ||
      coordinator.document.documentRevision !== document.documentRevision
    ) {
      throw new ProjectAutosaveError('EDIT_CONFLICT', 'The Project changed while linking its VAE.')
    }
    const linked = {
      ...saved,
      localModelId: resolved.localModelId,
      localVersionId: resolved.localVersionId,
    }
    if (
      saved.localModelId === linked.localModelId &&
      saved.localVersionId === linked.localVersionId
    ) {
      return toTab(tabId, coordinator)
    }
    await coordinator.applyDocument(
      scope.replace({ ...draft, vae: linked }),
      {},
      { expectedDocumentRevision: document.documentRevision },
    )
    return toTab(tabId, coordinator)
  }

  async removeGenerationLora(
    tabId: string,
    identity: ProjectLoraIdentity,
    targetLayerId?: string,
  ): Promise<ProjectTab> {
    const coordinator = this.requireTab(tabId)
    const document = coordinator.document
    const scope = generationDraftScope(document, targetLayerId)
    const draft = scope.draft
    const index = this.loraIndex({ ...document, generationDraft: draft }, identity)
    await coordinator.applyDocument(
      scope.replace({
        ...draft,
        loras: draft.loras.filter((_, current) => current !== index),
      }),
      {},
      { expectedDocumentRevision: document.documentRevision },
    )
    return toTab(tabId, coordinator)
  }

  async resolveRecovery(
    projectId: string,
    decision: 'discard' | 'recover',
    beforeDiscardRecovery?: () => Promise<void>,
  ): Promise<ProjectTab> {
    assertProjectId(projectId)
    const rebuilding = this.rebuilding.get(projectId)
    if (rebuilding) {
      await rebuilding.catch(() => undefined)
    }
    if (decision !== 'recover' && decision !== 'discard') {
      throw new ProjectServiceError('PROJECT_INVALID_INPUT', 'Choose a recovery action.')
    }
    if (this.openTabs.has(projectId)) {
      throw new ProjectServiceError(
        'PROJECT_ALREADY_OPEN',
        'Close the current Project tab before resolving recovery.',
      )
    }
    const record = await this.requireReadyRecord(projectId)
    const inspection = await ProjectAutosaveCoordinator.inspectRecovery(
      record.canonicalPath,
      this.options.shadow,
    )
    const temporary = await this.inspectTemporaryRecovery(projectId)
    // In-process consumers can open a tab while asynchronous recovery verification runs.
    // Revalidate before any destructive hook; ordinary main Open also shares the owner gate.
    if (this.openTabs.has(projectId)) {
      throw new ProjectServiceError(
        'PROJECT_ALREADY_OPEN',
        'Close the current Project tab before resolving recovery.',
      )
    }
    const pendingShadow = inspection.status !== 'absent' && inspection.status !== 'clean'
    if (!pendingShadow && !hasTemporaryRecovery(temporary)) {
      throw new ProjectServiceError(
        'PROJECT_RECOVERY_UNAVAILABLE',
        temporary.kind === 'unavailable'
          ? temporary.reason
          : 'There is no pending Project recovery to resolve.',
      )
    }
    if (decision === 'recover' && pendingShadow && inspection.status !== 'recoverable') {
      throw new ProjectServiceError(
        'PROJECT_RECOVERY_UNAVAILABLE',
        'The saved Project can be opened after discarding this invalid recovery state.',
      )
    }
    // The app-level recovery owner must durably discard temporary generation sessions before
    // removing this document shadow. Invalid/already-open requests never reach that boundary.
    if (decision === 'discard') {
      await beforeDiscardRecovery?.()
    }
    const coordinator =
      decision === 'recover' && inspection.status === 'recoverable'
        ? await ProjectAutosaveCoordinator.recover(
            record.canonicalPath,
            this.options.roots,
            this.options.shadow,
            {
              ...this.options.autosaveOptions,
              expectedCanonicalPath: record.canonicalPath,
            },
          )
        : decision === 'discard'
          ? await ProjectAutosaveCoordinator.discardRecovery(
              record.canonicalPath,
              this.options.roots,
              this.options.shadow,
              {
                ...this.options.autosaveOptions,
                expectedCanonicalPath: record.canonicalPath,
              },
            )
          : await ProjectAutosaveCoordinator.open(
              record.canonicalPath,
              this.options.roots,
              this.options.shadow,
              {
                ...this.options.autosaveOptions,
                expectedCanonicalPath: record.canonicalPath,
              },
            )
    this.openTabs.set(projectId, coordinator)
    await this.markOpenedBestEffort(record.canonicalPath)
    const tab = toTab(projectId, coordinator)
    if (temporary.kind === 'unavailable') {
      tab.storageWarning = temporary.reason
    }
    return tab
  }

  /** A preflight capability check; ordinary Open/recovery still owns document creation. */
  async reviewAcceptedResult(reference: AcceptedResultHistoryReference): Promise<boolean> {
    if (!isAcceptedResultHistoryReference(reference)) {
      throw new ProjectServiceError(
        'PROJECT_INVALID_INPUT',
        'The saved result reference is invalid.',
      )
    }
    const reviewed = { ...reference }
    return (await reviewSavedAcceptedResult(reviewed, this.options.repository)) !== null
  }

  async save(
    tabId: string,
    previewWorker?: Pick<ProjectWorkerClient, 'composePreview'>,
  ): Promise<ProjectSaveResult> {
    if (this.rebuilding.has(tabId)) {
      throw new ProjectServiceError(
        'PROJECT_REBUILD_IN_PROGRESS',
        'Wait for the Project preview rebuild to finish before saving.',
      )
    }
    if (this.saving.has(tabId)) {
      throw new ProjectServiceError('PROJECT_SAVE_IN_PROGRESS', 'This Project is already saving.')
    }
    const saving = this.saveOne(tabId, previewWorker)
    this.saving.set(tabId, saving)
    try {
      return await saving
    } finally {
      this.saving.delete(tabId)
    }
  }

  async sealPromptHistory(tabId: string, historyGroupId?: string): Promise<ProjectTab> {
    const coordinator = this.requireTab(tabId)
    await coordinator.sealHistoryGroup(historyGroupId)
    return toTab(tabId, coordinator)
  }

  /** Call only with a path returned by Electron's main-process file picker. */
  async selectImport(sourcePath: string): Promise<ProjectImportSelection> {
    await this.initialize()
    const selected = await inspectImportSource(sourcePath)
    const workspace = await this.options.repository.workspaceById(UNCATEGORIZED_WORKSPACE_ID)
    if (path.dirname(selected.sourcePath) === workspace.directoryPath) {
      await this.options.repository.indexSaved(selected.sourcePath, workspace.id)
      return {
        kind: 'opened',
        result: await this.openImportedProject(localProjectRecoveryKey(selected.sourcePath)),
      }
    }
    const importId = randomUUID()
    // A pending selection owns no copied file. Limit abandoned dialogs to bounded memory.
    if (this.pendingImports.size >= MAX_PENDING_IMPORTS) {
      this.pendingImports.delete(this.pendingImports.keys().next().value!)
    }
    this.pendingImports.set(importId, selected)
    return {
      fileName: selected.fileName,
      importId,
      kind: 'transfer-required',
      title: selected.title,
    }
  }

  /** Receives only a main-resolved registry ref; the renderer sends IDs to ModelService. */
  async setGenerationModel(
    tabId: string,
    model: IgsProjectDocumentV1['generationDraft']['model'],
    targetLayerId?: string,
  ): Promise<ProjectTab> {
    const coordinator = this.requireTab(tabId)
    const document = coordinator.document
    const scope = generationDraftScope(document, targetLayerId)
    const draft = scope.draft
    const previous = draft.model
    if (
      (previous === null && model === null) ||
      (previous !== null &&
        model !== null &&
        previous.localModelId === model.localModelId &&
        previous.localVersionId === model.localVersionId &&
        previous.fileSha256 === model.fileSha256)
    ) {
      return toTab(tabId, coordinator)
    }
    await coordinator.applyDocument(
      scope.replace({ ...draft, model }),
      {},
      { expectedDocumentRevision: document.documentRevision },
    )
    return toTab(tabId, coordinator)
  }

  /** Capture the Project before main verifies an ID-only external VAE selection. */
  async setGenerationVae(
    tabId: string,
    resolve: (() => Promise<NonNullable<IgsProjectDocumentV1['generationDraft']['vae']>>) | null,
    targetLayerId?: string,
  ): Promise<ProjectTab> {
    const coordinator = this.requireTab(tabId)
    const document = coordinator.document
    const scope = generationDraftScope(document, targetLayerId)
    const draft = scope.draft
    const documentEpoch = coordinator.documentEpoch
    const previous = draft.vae
    const vae = resolve === null ? null : await resolve()
    if (vae !== null && (vae.kind !== 'vae' || vae.baseModelFamily !== 'illustrious')) {
      throw new ProjectServiceError(
        'PROJECT_INVALID_INPUT',
        'Only an Illustrious-compatible external VAE can be selected.',
      )
    }
    if (
      this.openTabs.get(tabId) !== coordinator ||
      coordinator.documentEpoch !== documentEpoch ||
      coordinator.document.documentRevision !== document.documentRevision
    ) {
      throw new ProjectAutosaveError(
        'EDIT_CONFLICT',
        'The Project changed while selecting its VAE.',
      )
    }
    if (
      (previous === null && vae === null) ||
      (previous !== null &&
        vae !== null &&
        previous.localModelId === vae.localModelId &&
        previous.localVersionId === vae.localVersionId &&
        previous.fileSha256 === vae.fileSha256)
    ) {
      return toTab(tabId, coordinator)
    }
    await coordinator.applyDocument(
      scope.replace({ ...draft, vae }),
      {},
      { expectedDocumentRevision: document.documentRevision },
    )
    return toTab(tabId, coordinator)
  }

  async setPrimaryBbox(tabId: string, rect: IgsRectV1): Promise<ProjectTab> {
    const coordinator = this.requireTab(tabId)
    try {
      await coordinator.applyDocument({ ...coordinator.document, primaryBbox: rect })
    } catch (error) {
      if (error instanceof IgsSchemaError) {
        throw new ProjectServiceError('PROJECT_INVALID_INPUT', 'The bounding box is invalid.')
      }
      throw error
    }
    return toTab(tabId, coordinator)
  }

  async undo(tabId: string): Promise<ProjectTab> {
    const coordinator = this.requireTab(tabId)
    await coordinator.undo()
    return toTab(tabId, coordinator)
  }

  async updateGenerationDraft(
    tabId: string,
    change: ProjectGenerationDraftChange,
    historyGroupId?: string,
    targetLayerId?: string,
  ): Promise<ProjectTab> {
    if (!isProjectGenerationDraftChange(change)) {
      throw new ProjectServiceError('PROJECT_INVALID_INPUT', 'The generation setting is invalid.')
    }
    if (
      historyGroupId !== undefined &&
      change.kind !== 'positive-prompt' &&
      change.kind !== 'negative-prompt'
    ) {
      throw new ProjectServiceError(
        'PROJECT_INVALID_INPUT',
        'Only prompt edits can share a Project history group.',
      )
    }
    const coordinator = this.requireTab(tabId)
    const document = coordinator.document
    const scope = generationDraftScope(document, targetLayerId)
    const draft = scope.draft
    const documentEpoch = coordinator.documentEpoch
    let nextDraft = draft
    switch (change.kind) {
      case 'anima-method': {
        if (draft.sampling.animaMethod === (change.value ?? undefined)) {
          return toTab(tabId, coordinator)
        }
        nextDraft = { ...draft, sampling: { ...draft.sampling } }
        if (change.value === null) {
          delete nextDraft.sampling.animaMethod
        } else {
          nextDraft.sampling.animaMethod = change.value
        }
        break
      }
      case 'cfg-rescale': {
        if (draft.cfgRescale === (change.value ?? undefined)) {
          return toTab(tabId, coordinator)
        }
        nextDraft = { ...draft }
        if (change.value === null) {
          delete nextDraft.cfgRescale
        } else {
          nextDraft.cfgRescale = change.value
        }
        break
      }
      case 'denoising-strength': {
        if (draft.sampling.denoisingStrength === change.value) {
          return toTab(tabId, coordinator)
        }
        nextDraft = { ...draft, sampling: { ...draft.sampling, denoisingStrength: change.value } }
        break
      }
      case 'dynamic-prompt': {
        const before = getEffectiveDynamicPromptSettings(draft.dynamicPrompt)
        if (
          before.maxPrompts === change.value.maxPrompts &&
          before.seedBehavior === change.value.seedBehavior
        ) {
          return toTab(tabId, coordinator)
        }
        nextDraft = { ...draft, dynamicPrompt: { ...change.value } }
        break
      }
      case 'lora-enabled':
      case 'lora-weight': {
        const index = this.loraIndex({ ...document, generationDraft: draft }, change)
        const lora = draft.loras[index]
        const field = change.kind === 'lora-enabled' ? 'enabled' : 'weight'
        if (lora[field] === change.value) {
          return toTab(tabId, coordinator)
        }
        nextDraft = {
          ...draft,
          loras: draft.loras.map((entry, current) =>
            current === index ? { ...entry, [field]: change.value } : entry,
          ),
        }
        break
      }
      case 'sampling-cfg-scale': {
        if (draft.sampling.cfgScale === change.value) {
          return toTab(tabId, coordinator)
        }
        nextDraft = {
          ...draft,
          sampling: { ...draft.sampling, cfgScale: change.value },
        }
        break
      }
      case 'sampling-pair': {
        if (
          draft.sampling.sampler === change.sampler &&
          draft.sampling.scheduler === change.scheduler
        ) {
          return toTab(tabId, coordinator)
        }
        nextDraft = {
          ...draft,
          sampling: { ...draft.sampling, sampler: change.sampler, scheduler: change.scheduler },
        }
        break
      }
      case 'sampling-steps': {
        if (draft.sampling.steps === change.value) {
          return toTab(tabId, coordinator)
        }
        nextDraft = {
          ...draft,
          sampling: { ...draft.sampling, steps: change.value },
        }
        break
      }
      case 'seed': {
        if (draft.seed.policy === change.policy && draft.seed.value === change.value) {
          return toTab(tabId, coordinator)
        }
        nextDraft = {
          ...draft,
          seed: { policy: change.policy, value: change.value },
        }
        break
      }
      case 'vae-precision': {
        if (draft.vaePrecision === (change.value ?? undefined)) {
          return toTab(tabId, coordinator)
        }
        nextDraft = { ...draft }
        if (change.value === null) {
          delete nextDraft.vaePrecision
        } else {
          nextDraft.vaePrecision = change.value
        }
        break
      }
      default: {
        const field = change.kind === 'positive-prompt' ? 'positivePrompt' : 'negativePrompt'
        const before = draft[field]
        if (change.embeddingSelection && !this.options.resolvePromptEmbeddings) {
          throw new ProjectServiceError(
            'PROJECT_NOT_READY',
            'Installed embedding verification is unavailable in this Project session.',
          )
        }
        const prompt = this.options.resolvePromptEmbeddings
          ? await this.options.resolvePromptEmbeddings({
              modelFamily: draft.model?.baseModelFamily ?? null,
              prompt: structuredClone(before),
              selection: change.embeddingSelection && { ...change.embeddingSelection },
              text: change.text,
            })
          : reconcilePromptEmbeddings({ ...before, text: change.text }, [])
        if (prompt.text !== change.text) {
          throw new ProjectServiceError(
            'PROJECT_INVALID_INPUT',
            'Embedding reconciliation cannot rewrite the authored prompt text.',
          )
        }
        if (
          this.openTabs.get(tabId) !== coordinator ||
          coordinator.documentEpoch !== documentEpoch ||
          coordinator.document.documentRevision !== document.documentRevision
        ) {
          throw new ProjectAutosaveError(
            'EDIT_CONFLICT',
            'The Project changed while verifying its prompt embeddings.',
          )
        }
        if (JSON.stringify(before) === JSON.stringify(prompt)) {
          return toTab(tabId, coordinator)
        }
        nextDraft = {
          ...draft,
          [field]: prompt,
        }
      }
    }
    await coordinator.applyDocument(
      scope.replace(nextDraft),
      {},
      {
        expectedDocumentEpoch: documentEpoch,
        expectedDocumentRevision: document.documentRevision,
        historyGroupId,
      },
    )
    return toTab(tabId, coordinator)
  }

  async updateRasterLayer(
    tabId: string,
    layerId: string,
    change: ProjectRasterLayerChange,
  ): Promise<ProjectTab> {
    if (!isProjectRasterLayerChange(change)) {
      throw new ProjectServiceError('PROJECT_INVALID_INPUT', 'The Raster Layer change is invalid.')
    }
    const coordinator = this.requireTab(tabId)
    const document = coordinator.document
    const index = document.layers.findIndex((layer) => layer.id === layerId)
    if (index < 0) {
      throw new ProjectServiceError(
        'PROJECT_LAYER_NOT_FOUND',
        'This Raster Layer is not available.',
      )
    }
    const layer = document.layers[index]
    if (layer.kind !== 'raster') {
      throw new ProjectServiceError(
        'PROJECT_LAYER_NOT_FOUND',
        'This Raster Layer is not available.',
      )
    }
    if (layer.locked && (change.kind === 'opacity' || change.kind === 'blend-mode')) {
      throw new ProjectServiceError(
        'PROJECT_LAYER_LOCKED',
        'Unlock this Raster Layer before editing it.',
      )
    }
    const updated = { ...layer }
    switch (change.kind) {
      case 'blend-mode': {
        updated.blendMode = change.blendMode
        break
      }
      case 'lock': {
        updated.locked = change.locked
        break
      }
      case 'opacity': {
        updated.opacity = change.opacity
        break
      }
      case 'visibility': {
        updated.visible = change.visible
        break
      }
    }
    if (
      updated.visible === layer.visible &&
      updated.locked === layer.locked &&
      updated.opacity === layer.opacity &&
      updated.blendMode === layer.blendMode
    ) {
      return toTab(tabId, coordinator)
    }
    const layers = [...document.layers]
    layers[index] = updated
    await coordinator.applyDocument(
      { ...document, layers },
      {},
      { expectedDocumentRevision: document.documentRevision },
    )
    return toTab(tabId, coordinator)
  }

  async updateSmartPatchLayer(
    tabId: string,
    layerId: string,
    change: ProjectSmartPatchLayerChange,
  ): Promise<ProjectTab> {
    if (!isProjectSmartPatchLayerChange(change)) {
      throw new ProjectServiceError('PROJECT_INVALID_INPUT', 'The Smart Patch setting is invalid.')
    }
    const coordinator = this.requireTab(tabId)
    const document = coordinator.document
    const patch = requireSmartPatch(document, layerId)
    if (
      (change.kind === 'mask-blur' || change.kind === 'bbox-padding') &&
      (change.documentId !== document.documentId ||
        change.documentRevision !== document.documentRevision)
    ) {
      throw new ProjectAutosaveError(
        'EDIT_CONFLICT',
        'The Project changed. Edit the mask setting again.',
      )
    }
    if (patch.locked && change.kind !== 'lock' && change.kind !== 'visibility') {
      throw new ProjectServiceError(
        'PROJECT_INVALID_INPUT',
        'Unlock this Smart Patch before editing it.',
      )
    }
    const next = { ...patch }
    switch (change.kind) {
      case 'bbox-padding':
      case 'mask-blur': {
        const settings = resolveProjectMaskSettings(patch.maskSettings)
        const key = change.kind === 'mask-blur' ? 'blur' : 'padding'
        if (settings[key] === change.value) {
          return toTab(tabId, coordinator)
        }
        next.maskSettings = { ...settings, [key]: change.value }
        break
      }
      case 'blend-mode': {
        next.blendMode = change.blendMode
        break
      }
      case 'bounding-box': {
        next.boundingBox = { ...change.rect }
        break
      }
      case 'internal-resolution': {
        next.internalResolution = { ...change.size }
        break
      }
      case 'lock': {
        next.locked = change.locked
        break
      }
      case 'opacity': {
        next.opacity = change.opacity
        break
      }
      case 'visibility': {
        next.visible = change.visible
        break
      }
    }
    if (JSON.stringify(next) === JSON.stringify(patch)) {
      return toTab(tabId, coordinator)
    }
    await coordinator.applyDocument(
      {
        ...document,
        layers: document.layers.map((layer) => (layer.id === layerId ? next : layer)),
      },
      {},
      { expectedDocumentRevision: document.documentRevision },
    )
    return toTab(tabId, coordinator)
  }

  /** Capture before runtime awaits and retain frozen raster files through callback admission. */
  async withCapturedNormalGenerationInput<T>(
    tabId: string,
    use: (capture: {
      composeTarget: (
        worker: Pick<ProjectWorkerClient, 'composeTarget'>,
      ) => Promise<FrozenGenerationTarget>
      document: IgsProjectDocumentV1
    }) => Promise<T>,
  ): Promise<T> {
    const coordinator = this.requireTab(tabId)
    const document = coordinator.document
    const pendingSources = new Map(
      projectRasterLayers(document)
        .filter((layer) => layer.visible && layer.opacity > 0)
        .map(
          (layer) =>
            [
              `${layer.asset.path}:${layer.asset.sha256}`,
              coordinator.getCurrentAssetSource(layer.asset),
            ] as const,
        ),
    )
    return await withFrozenRasterComposition(
      {
        document,
        packagePath: coordinator.filePath,
        pendingSource: (asset) => pendingSources.get(`${asset.path}:${asset.sha256}`) ?? null,
        scratchBasePath: this.options.roots.scratchDir,
        stagePrefix: 'project-target-',
      },
      (composition) =>
        use({
          composeTarget: (worker) => composeFrozenGenerationTarget(composition, worker),
          // The callback can own this value without changing the private composition snapshot.
          document: structuredClone(composition.document),
        }),
    )
  }

  /**
   * Internal Anima foundation: lease captured Project inputs through qualified ephemeral requests.
   * The callback owns consumption; this boundary does not publish queue rows or accepted results.
   */
  async withPreparedAnimaGenerationBatch<T>(
    tabId: string,
    input: {
      iterations: number
      modelService: AnimaGenerationModelResolver
      randomUint32?: () => number
      ready: unknown
      worker: Pick<ProjectWorkerClient, 'composeTarget'>
    },
    use: (input: {
      preparedBatch: PreparedAnimaGenerationBatch
      requests: readonly AnimaWorkerRequest[]
    }) => Promise<T>,
  ): Promise<T> {
    // Capture caller-owned values before the raster lease, seed read or model qualification await.
    const { iterations, modelService, randomUint32, worker } = input
    const ready = structuredClone(input.ready)
    if (!supportsInferenceAnima(ready)) {
      throw new AnimaWorkerRequestError(
        'INFERENCE_UNAVAILABLE',
        'The worker has not qualified the original Anima pipeline.',
      )
    }
    validateAnimaBatchIterations(iterations)
    const document = this.requireTab(tabId).document
    // A placeholder checks the known authoring envelope without choosing or masking a Reuse seed.
    validateAnimaGenerationDraft(document.generationDraft, {
      bbox: document.primaryBbox,
      lastActualSeed: document.generationDraft.seed.policy === 'reuse' ? 0 : undefined,
      lastActualSeedSnapshot: document.lastActualSeedSnapshot,
    })
    const dynamic = getEffectiveDynamicPromptSettings(document.generationDraft.dynamicPrompt)
    const preflightBatch = planGenerationBatch({
      baseSeed: 0,
      iterations,
      maxJobs: GENERATION_BATCH_JOB_LIMIT,
      maxPrompts: dynamic.maxPrompts,
      negativePrompt: document.generationDraft.negativePrompt.text,
      positivePrompt: document.generationDraft.positivePrompt.text,
      seedBehavior: dynamic.seedBehavior,
    })
    for (const item of preflightBatch.items) {
      compileAnimaPromptWeighting(item.prompts.positive)
      compileAnimaPromptWeighting(item.prompts.negative)
    }
    return await this.withCapturedNormalGenerationInput(tabId, async (capture) => {
      const lastActualSeed =
        capture.document.generationDraft.seed.policy === 'reuse'
          ? await this.options.readLastActualSeed?.(tabId, capture.document.documentId)
          : undefined
      validateAnimaGenerationDraft(capture.document.generationDraft, {
        bbox: capture.document.primaryBbox,
        lastActualSeed,
        lastActualSeedSnapshot: capture.document.lastActualSeedSnapshot,
      })
      const target = await capture.composeTarget(worker)
      const prepared = await prepareAnimaGeneration({
        lastActualSeed,
        modelService,
        randomUint32,
        target,
      })
      const preparedBatch = prepareAnimaGenerationBatch({ iterations, prepared })
      return await withAnimaGenerationBatchRequests({
        modelService,
        prepared: preparedBatch,
        ready,
        scratchBasePath: this.options.roots.scratchDir,
        use: (requests) => use({ preparedBatch, requests }),
      })
    })
  }

  private async inspectTemporaryRecovery(
    projectId: string,
  ): Promise<ProjectTemporaryRecoveryInspection> {
    if (!this.options.inspectTemporaryRecovery) {
      return { completedCandidateCount: 0, kind: 'available' }
    }
    try {
      const inspection = await this.options.inspectTemporaryRecovery(projectId)
      return inspection.kind === 'unavailable'
        ? { ...inspection, reason: inspection.reason.slice(0, 512) }
        : inspection
    } catch (error) {
      return unavailableTemporaryRecovery(error)
    }
  }

  private loraIndex(document: IgsProjectDocumentV1, identity: ProjectLoraIdentity): number {
    const matches = document.generationDraft.loras.flatMap((lora, index) =>
      lora.resource.localModelId === identity.resourceId &&
      lora.resource.localVersionId === identity.versionId
        ? [index]
        : [],
    )
    if (matches.length !== 1) {
      throw new ProjectServiceError(
        'PROJECT_INVALID_INPUT',
        'The selected LoRA row is unavailable or ambiguous.',
      )
    }
    return matches[0]
  }

  private async markOpenedBestEffort(filePath: string): Promise<void> {
    try {
      await this.options.repository.markOpened(filePath)
    } catch {
      // Last-opened ordering is derived metadata; a valid open tab must remain usable.
    }
  }

  private async openImportedProject(projectId: string): Promise<ProjectOpenResult> {
    return await (this.options.openImportedProject?.(projectId) ?? this.open(projectId))
  }

  private async openOne(projectId: string): Promise<ProjectOpenResult> {
    const record = await this.requireReadyRecord(projectId)
    const inspection = await ProjectAutosaveCoordinator.inspectRecovery(
      record.canonicalPath,
      this.options.shadow,
    )
    const temporary = await this.inspectTemporaryRecovery(projectId)
    if (inspection.status !== 'absent' && inspection.status !== 'clean') {
      return {
        kind: 'recovery-required',
        projectId,
        reason:
          temporary.kind === 'unavailable'
            ? `${describeRecovery(inspection)} ${temporary.reason}`.slice(0, 512)
            : describeRecovery(inspection),
        recoveryStatus: inspection.status,
      }
    }
    if (hasTemporaryRecovery(temporary)) {
      return {
        kind: 'recovery-required',
        projectId,
        reason: describeTemporaryRecovery(temporary.completedCandidateCount),
        recoveryStatus: 'recoverable',
      }
    }
    const coordinator = await ProjectAutosaveCoordinator.open(
      record.canonicalPath,
      this.options.roots,
      this.options.shadow,
      {
        ...this.options.autosaveOptions,
        expectedCanonicalPath: record.canonicalPath,
      },
    )
    this.openTabs.set(projectId, coordinator)
    await this.markOpenedBestEffort(record.canonicalPath)
    const tab = toTab(projectId, coordinator)
    if (temporary.kind === 'unavailable') {
      tab.storageWarning = temporary.reason
    }
    return { kind: 'opened', tab }
  }

  private async rebuildOne(
    projectId: string,
    worker: Pick<ProjectWorkerClient, 'composePreview'>,
  ): Promise<ProjectRebuildResult> {
    await this.opening.get(projectId)?.catch(() => undefined)
    await this.saving.get(projectId)?.catch(() => undefined)
    const record = await this.requireReadyRecord(projectId)
    const coordinator = this.openTabs.get(projectId)
    if (coordinator?.dirty) {
      throw new ProjectServiceError(
        'PROJECT_DIRTY',
        'Save the Project changes before rebuilding its preview.',
      )
    }
    if (!coordinator) {
      const inspection = await ProjectAutosaveCoordinator.inspectRecovery(
        record.canonicalPath,
        this.options.shadow,
      )
      if (inspection.status !== 'absent' && inspection.status !== 'clean') {
        throw new ProjectServiceError(
          'PROJECT_RECOVERY_REQUIRED',
          'Resolve the Project recovery state before rebuilding its preview.',
        )
      }
      if (hasTemporaryRecovery(await this.inspectTemporaryRecovery(projectId))) {
        throw new ProjectServiceError(
          'PROJECT_RECOVERY_REQUIRED',
          'Resolve the temporary generation recovery before rebuilding its preview.',
        )
      }
    }
    const session = coordinator
      ? null
      : await ProjectSession.open(record.canonicalPath, this.options.roots, record.canonicalPath)
    const document = coordinator?.document ?? session!.document
    const preview = await buildProjectPreview({
      document,
      packagePath: record.canonicalPath,
      pendingSource: () => null,
      scratchBasePath: this.options.roots.scratchDir,
      worker,
    })
    const input: ProjectRebuildPreviewInput =
      preview.kind === 'rendered'
        ? { renderedPreview: preview.preview }
        : { emptyPreviewRevision: preview.documentRevision }
    const committed = coordinator
      ? await coordinator.rebuildPreview(input, {
          beforeReplace: () => {
            if (this.openTabs.get(projectId) !== coordinator) {
              throw new ProjectServiceError(
                'PROJECT_REBUILD_IN_PROGRESS',
                'The Project tab changed while its preview was rebuilding.',
              )
            }
          },
        })
      : await session!.rebuildPreview(input, {
          beforeReplace: () => {
            if (this.openTabs.has(projectId) || this.opening.has(projectId)) {
              throw new ProjectServiceError(
                'PROJECT_REBUILD_IN_PROGRESS',
                'The Project opened while its preview was rebuilding.',
              )
            }
          },
        })
    let indexWarning: string | undefined
    try {
      await this.options.repository.indexSaved(record.canonicalPath, UNCATEGORIZED_WORKSPACE_ID)
    } catch {
      indexWarning = 'The Home and saved accepted-result indexes could not be refreshed.'
    }
    if (committed.reloadRequired) {
      indexWarning = `${indexWarning ? `${indexWarning} ` : ''}Reopen the Project before editing it.`
    }
    return {
      committed: true,
      directorySynced: committed.directorySynced,
      ...(indexWarning ? { indexWarning } : {}),
    }
  }

  private async requireReadyRecord(projectId: string): Promise<ProjectIndexRecord> {
    await this.initialize()
    const records = await this.options.repository.scanWorkspace(UNCATEGORIZED_WORKSPACE_ID)
    const record = records.find((candidate) => candidate.localProjectKey === projectId)
    if (!record) {
      throw new ProjectServiceError('PROJECT_NOT_FOUND', 'This Project is not in the library.')
    }
    if (record.fileHealth !== 'ready') {
      throw new ProjectServiceError(
        'PROJECT_NOT_READY',
        `This Project cannot be opened (${record.fileHealth}).`,
      )
    }
    const workspace = await this.options.repository.workspaceById(record.workspaceId)
    const canonical = await canonicalProjectPath(record.canonicalPath)
    if (
      canonical !== record.canonicalPath ||
      path.dirname(canonical) !== workspace.directoryPath ||
      localProjectRecoveryKey(canonical) !== projectId
    ) {
      throw new ProjectServiceError(
        'PROJECT_IDENTITY_MISMATCH',
        'The Project file no longer matches its indexed location.',
      )
    }
    return record
  }

  private requireTab(tabId: string): ProjectAutosaveCoordinator {
    assertProjectId(tabId)
    const coordinator = this.openTabs.get(tabId)
    if (!coordinator) {
      throw new ProjectServiceError('PROJECT_NOT_OPEN', 'This Project tab is not open.')
    }
    return coordinator
  }

  private async saveOne(
    tabId: string,
    previewWorker?: Pick<ProjectWorkerClient, 'composePreview'>,
  ): Promise<ProjectSaveResult> {
    const coordinator = this.requireTab(tabId)
    const documentId = coordinator.document.documentId
    let renderedPreview: Awaited<ReturnType<typeof buildProjectPreview>> | undefined
    if (previewWorker) {
      const document = coordinator.document
      try {
        renderedPreview = await buildProjectPreview({
          document,
          packagePath: coordinator.filePath,
          pendingSource: (asset) => coordinator.getCurrentAssetSource(asset),
          scratchBasePath: this.options.roots.scratchDir,
          worker: previewWorker,
        })
        if (coordinator.document.documentRevision !== document.documentRevision) {
          renderedPreview = undefined
        }
      } catch {
        // Preview failure is never a reason to lose an otherwise valid document Save. Session Save
        // still checks every referenced asset and will fail if the document itself is invalid.
        console.warn('Project preview is unavailable; saving with placeholders.')
      }
    }
    let lastActualSeedSnapshot: number | undefined
    try {
      // Read as close to the package Save as possible: preview rendering can be slow enough for a
      // generation to complete while it runs. SQLite and .igs have no shared atomic transaction.
      lastActualSeedSnapshot =
        (await this.options.readLastActualSeed?.(tabId, documentId)) ?? undefined
    } catch {
      // The portable Project remains saveable when local generation recovery is unavailable.
      console.warn('Generation seed recovery is unavailable; Save retains its previous snapshot.')
    }
    if (coordinator.document.documentId !== documentId) {
      throw new ProjectServiceError(
        'PROJECT_IDENTITY_MISMATCH',
        'The Project document changed while preparing Save.',
      )
    }
    const saved = await coordinator.save(
      renderedPreview?.kind === 'rendered'
        ? { lastActualSeedSnapshot, renderedPreview: renderedPreview.preview }
        : renderedPreview?.kind === 'empty'
          ? { emptyPreviewRevision: renderedPreview.documentRevision, lastActualSeedSnapshot }
          : { lastActualSeedSnapshot },
    )
    let indexWarning: string | undefined
    try {
      await this.options.repository.indexSaved(coordinator.filePath, UNCATEGORIZED_WORKSPACE_ID)
    } catch {
      // The .igs has already committed. Reporting Save as failed would invite a second Save and
      // misstate the saved revision; a later Home scan rebuilds this derived row.
      indexWarning =
        'The Project was saved, but its Home and accepted-result indexes could not be updated.'
    }
    return {
      committed: true,
      directorySynced: saved.directorySynced,
      recoveryStatus: saved.recovery.status,
      reloadRequired: saved.reloadRequired,
      tab: toTab(tabId, coordinator),
      ...(saved.recovery.status === 'failed'
        ? { recoveryError: saved.recovery.error.message }
        : {}),
      ...(indexWarning ? { indexWarning } : {}),
    }
  }

  private async toSummary(record: ProjectIndexRecord): Promise<ProjectSummary> {
    let recoveryStatus: ProjectSummary['recoveryStatus'] = 'none'
    let recoveryReason: string | undefined
    if (record.fileHealth === 'ready' && !this.openTabs.has(record.localProjectKey)) {
      try {
        const inspection = await ProjectAutosaveCoordinator.inspectRecovery(
          record.canonicalPath,
          this.options.shadow,
        )
        const temporary = await this.inspectTemporaryRecovery(record.localProjectKey)
        if (inspection.status !== 'absent' && inspection.status !== 'clean') {
          recoveryStatus = inspection.status
          recoveryReason = describeRecovery(inspection)
          if (temporary.kind === 'unavailable') {
            recoveryReason = `${recoveryReason} ${temporary.reason}`.slice(0, 512)
          }
        } else if (hasTemporaryRecovery(temporary)) {
          recoveryStatus = 'recoverable'
          recoveryReason = describeTemporaryRecovery(temporary.completedCandidateCount)
        } else if (temporary.kind === 'unavailable') {
          recoveryStatus = 'unavailable'
          recoveryReason = temporary.reason
        }
      } catch {
        recoveryStatus = 'invalid'
        recoveryReason = 'The local recovery state could not be inspected.'
      }
      // The advisory Home read may overlap an ordinary Open while awaiting file verification.
      if (this.openTabs.has(record.localProjectKey)) {
        recoveryStatus = 'none'
        recoveryReason = undefined
      }
    }
    return {
      bbox:
        record.bboxWidth !== null && record.bboxHeight !== null
          ? { height: record.bboxHeight, width: record.bboxWidth }
          : null,
      health: record.fileHealth,
      id: record.localProjectKey,
      previewStatus: record.previewStatus,
      recoveryStatus,
      thumbnailUrl:
        record.fileHealth === 'ready' && record.thumbnailSha256
          ? projectThumbnailImageUrl(record.localProjectKey, record.thumbnailSha256)
          : null,
      title: record.displayName,
      ...(recoveryReason ? { recoveryReason } : {}),
    }
  }
}

function assertProjectId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !PROJECT_ID_PATTERN.test(value)) {
    throw new ProjectServiceError('PROJECT_INVALID_INPUT', 'The Project ID is invalid.')
  }
}

function requireSmartPatch(document: IgsProjectDocumentV1, layerId: string): IgsSmartPatchLayerV1 {
  const layer = document.layers.find((candidate) => candidate.id === layerId)
  if (!isProjectDocumentId(layerId) || layer?.kind !== 'smart-patch') {
    throw new ProjectServiceError(
      'PROJECT_LAYER_NOT_FOUND',
      'This Smart Patch is no longer available.',
    )
  }
  return layer
}

/** A captured owner: replacement never consults renderer selection or changes the normal draft. */
function generationDraftScope(document: IgsProjectDocumentV1, targetLayerId?: string) {
  if (targetLayerId === undefined) {
    return {
      draft: document.generationDraft,
      replace: (draft: IgsProjectDocumentV1['generationDraft']): IgsProjectDocumentV1 => ({
        ...document,
        generationDraft: draft,
      }),
    }
  }
  const patch = requireSmartPatch(document, targetLayerId)
  if (patch.locked) {
    throw new ProjectServiceError(
      'PROJECT_LAYER_LOCKED',
      'Unlock this Smart Patch before editing it.',
    )
  }
  return {
    draft: patch.generationDraft,
    replace: (draft: IgsProjectDocumentV1['generationDraft']): IgsProjectDocumentV1 => ({
      ...document,
      layers: document.layers.map((layer) =>
        layer.id === targetLayerId ? { ...patch, generationDraft: draft } : layer,
      ),
    }),
  }
}

function rasterImportName(sourcePath: string): string {
  const stem = path.parse(sourcePath).name
  const normalized = stem
    .replaceAll(/[\u0000-\u001F\u007F-\u009F]/gu, ' ')
    .replaceAll(/\s+/gu, ' ')
    .trim()
  const candidate = normalized || 'Imported image'
  let name = ''
  let bytes = 0
  for (const character of candidate) {
    const width = Buffer.byteLength(character, 'utf8')
    if (bytes + width > IGS_SAFETY_CEILINGS.titleBytes) {
      break
    }
    name += character
    bytes += width
  }
  return name || 'Imported image'
}

function parseCreateInput(input: unknown): {
  generationPayload?: ProjectCreateInput['generationPayload']
  primaryBbox: IgsRectV1
  title: string
} {
  try {
    const { generationPayload, height, title, width } = parseProjectCreateInput(input)
    const primaryBbox = { height, width, x: 0, y: 0 }
    initializeProjectGenerationPayload(
      createEmptyProjectDocumentV1({ primaryBbox, title }),
      generationPayload,
    )
    return { generationPayload, primaryBbox, title }
  } catch {
    throw new ProjectServiceError(
      'PROJECT_INVALID_INPUT',
      'The Project details or preset settings are invalid.',
    )
  }
}

async function readMaskAssetBytes(
  coordinator: ProjectAutosaveCoordinator,
  member: NonNullable<IgsSmartPatchLayerV1['mask']['asset']>,
): Promise<Buffer> {
  const source = coordinator.getCurrentAssetSource(member)
  if (source) {
    return readProjectMaskSource(source, member)
  }
  const saved = await readIgsPackage(coordinator.filePath)
  return readProjectMaskSource({ bytes: await saved.readMember(member.path) }, member)
}

function toTab(id: string, coordinator: ProjectAutosaveCoordinator): ProjectTab {
  const document = coordinator.document
  return {
    acceptedResults: projectAcceptedResults(id, document),
    autosaveError: coordinator.lastAutosaveError?.message ?? null,
    canRedo: coordinator.canRedo,
    canUndo: coordinator.canUndo,
    dirty: coordinator.dirty,
    documentId: document.documentId,
    documentRevision: document.documentRevision,
    generationDraft: document.generationDraft,
    id,
    lastActualSeedSnapshot: document.lastActualSeedSnapshot,
    layers: document.layers.map((layer) =>
      layer.kind === 'smart-patch'
        ? {
            ...layer,
            maskImageUrl:
              layer.mask.asset === null
                ? null
                : projectMaskImageUrl({
                    assetSha256: layer.mask.asset.sha256,
                    documentRevision: document.documentRevision,
                    layerId: layer.id,
                    maskId: layer.mask.id,
                    maskRevision: layer.mask.revision,
                    tabId: id,
                  }),
            maskSettings: resolveProjectMaskSettings(layer.maskSettings),
            status: 'empty' as const,
          }
        : {
            blendMode: layer.blendMode,
            height: layer.asset.height,
            id: layer.id,
            imageUrl: projectLayerImageUrl(
              id,
              document.documentRevision,
              layer.id,
              layer.asset.sha256,
            ),
            locked: layer.locked,
            name: layer.name,
            opacity: layer.opacity,
            transform: layer.transform,
            visible: layer.visible,
            width: layer.asset.width,
          },
    ),
    primaryBbox: document.primaryBbox,
    title: document.title,
  }
}

function describeRecovery(inspection: ProjectShadowInspection): string {
  if (inspection.status === 'recoverable') {
    return 'Unsaved Project changes are available for recovery.'
  }
  if (inspection.status === 'stale') {
    return 'Local recovery no longer matches the saved Project. Open the saved revision only after discarding recovery.'
  }
  if (inspection.status === 'invalid') {
    return `Local recovery cannot be validated (${inspection.reason}). Open the saved revision only after discarding recovery.`
  }
  return 'There is no pending Project recovery.'
}

function hasTemporaryRecovery(
  inspection: ProjectTemporaryRecoveryInspection,
): inspection is Extract<ProjectTemporaryRecoveryInspection, { kind: 'available' }> {
  return inspection.kind === 'available' && inspection.completedCandidateCount > 0
}

function describeTemporaryRecovery(completedCandidateCount: number): string {
  return `${completedCandidateCount} completed temporary generation result${completedCandidateCount === 1 ? ' is' : 's are'} available for recovery. Recover opens the saved .igs as clean and restores these temporary results without accepting them.`
}

function sourceChanged(): ProjectServiceError {
  return new ProjectServiceError(
    'PROJECT_IMPORT_SOURCE_CHANGED',
    'The selected Project file changed. Choose it again before importing.',
  )
}

function importFingerprint(entry: BigIntStats): string {
  return `${entry.dev}:${entry.ino}:${entry.size}:${entry.mtimeNs}:${entry.ctimeNs}`
}

async function sourceFingerprint(sourcePath: string): Promise<string> {
  try {
    const entry = await lstat(sourcePath, { bigint: true })
    if (!entry.isFile() || entry.isSymbolicLink() || (await realpath(sourcePath)) !== sourcePath) {
      throw new ProjectServiceError(
        'PROJECT_IMPORT_INVALID_SOURCE',
        'Choose a regular .igs file without symbolic links.',
      )
    }
    return importFingerprint(entry)
  } catch (error) {
    if (error instanceof ProjectServiceError) {
      throw error
    }
    throw new ProjectServiceError(
      'PROJECT_IMPORT_INVALID_SOURCE',
      'The selected Project file is unavailable.',
    )
  }
}

async function inspectImportSource(sourcePath: string): Promise<PendingProjectImport> {
  if (
    typeof sourcePath !== 'string' ||
    !path.isAbsolute(sourcePath) ||
    path.normalize(sourcePath) !== sourcePath ||
    path.extname(sourcePath).toLowerCase() !== '.igs'
  ) {
    throw new ProjectServiceError(
      'PROJECT_IMPORT_INVALID_SOURCE',
      'Choose a local .igs Project file.',
    )
  }
  const before = await sourceFingerprint(sourcePath)
  const project = (await readIgsPackage(sourcePath)).project
  if ((await sourceFingerprint(sourcePath)) !== before) {
    throw sourceChanged()
  }
  return {
    documentId: project.documentId,
    documentRevision: project.documentRevision,
    fileName: path.basename(sourcePath),
    fingerprint: before,
    sourcePath,
    title: project.title,
  }
}

function sameImportSource(a: PendingProjectImport, b: PendingProjectImport): boolean {
  return (
    a.sourcePath === b.sourcePath &&
    a.fingerprint === b.fingerprint &&
    a.documentId === b.documentId &&
    a.documentRevision === b.documentRevision
  )
}

async function assertImportWorkspace(directoryPath: string): Promise<void> {
  try {
    const entry = await lstat(directoryPath)
    if (
      !entry.isDirectory() ||
      entry.isSymbolicLink() ||
      (await realpath(directoryPath)) !== directoryPath
    ) {
      throw new Error('Unsafe workspace directory')
    }
  } catch {
    throw new ProjectIdentityError(
      'PROJECT_INVALID_PATH',
      'The Project workspace no longer matches its managed location.',
    )
  }
}

async function copySelectedSource(
  selected: PendingProjectImport,
  stagedPath: string,
): Promise<void> {
  const source = await open(
    selected.sourcePath,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  ).catch(() => {
    throw sourceChanged()
  })
  try {
    if (importFingerprint(await source.stat({ bigint: true })) !== selected.fingerprint) {
      throw sourceChanged()
    }
    const target = await open(stagedPath, 'wx', 0o600)
    try {
      const chunk = Buffer.allocUnsafe(COPY_CHUNK_BYTES)
      let copied = 0n
      while (true) {
        const { bytesRead } = await source.read(chunk, 0, chunk.length, null)
        if (bytesRead === 0) {
          break
        }
        copied += BigInt(bytesRead)
        let offset = 0
        while (offset < bytesRead) {
          const { bytesWritten } = await target.write(chunk, offset, bytesRead - offset)
          offset += bytesWritten
        }
      }
      const after = await source.stat({ bigint: true })
      if (
        copied !== after.size ||
        importFingerprint(after) !== selected.fingerprint ||
        (await sourceFingerprint(selected.sourcePath)) !== selected.fingerprint
      ) {
        throw sourceChanged()
      }
      await target.sync()
    } finally {
      await target.close()
    }
  } finally {
    await source.close()
  }
}

async function publishImportedFile(
  stagedPath: string,
  workspacePath: string,
  originalName: string,
): Promise<string> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const fileName = attempt === 0 ? originalName : `project-${randomUUID()}.igs`
    const destination = path.join(workspacePath, fileName)
    try {
      // A hard link publishes the fsynced staged bytes without replacing an existing Project.
      await link(stagedPath, destination)
      return destination
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error
      }
    }
  }
  throw new ProjectServiceError(
    'PROJECT_IMPORT_INVALID_SOURCE',
    'Could not choose an unused Project filename in the workspace.',
  )
}

async function syncImportDirectory(directoryPath: string): Promise<boolean> {
  try {
    const directory = await open(
      directoryPath,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    )
    try {
      await directory.sync()
    } finally {
      await directory.close()
    }
    return true
  } catch {
    return false
  }
}
