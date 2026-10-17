import type { PresetApplicationRequest } from './presets/preset-application.js'
import type { PresetDefinition, PresetRecord } from './presets/preset-schema.js'
import type {
  AcceptedResultHistoryCursor,
  AcceptedResultHistoryPage,
  AcceptedResultHistoryReference,
} from './projects/accepted-result-history.js'
import type { AnimaSamplingMethod } from './projects/anima-sampling-method.js'
import type { GenerationDynamicPromptSettings } from './projects/generation-dynamic-settings.js'
import type { GenerationProgressSnapshot } from './projects/generation-progress.js'
import type {
  GenerationQueueCursor,
  GenerationQueuePage,
  GenerationQueueReview,
  GenerationQueueTerminalStatus,
} from './projects/generation-queue-manager.js'
import type { RasterGenerationData } from './projects/generation-settings-comparison.js'
import type { IllustriousNoiseProfileV1 } from './projects/illustrious-noise-profile.js'
import type { ProjectCreateInput } from './projects/project-create.js'
import type {
  ProjectGenerateOptions,
  ProjectGenerateResult,
  ProjectGenerationActionState,
} from './projects/project-generation-actions.js'
import type { ProjectGenerationTargetState } from './projects/project-generation-target-state.js'
import type { ProjectMaskSettings } from './projects/project-mask-settings.js'
import type { ProjectMaskEdit } from './projects/project-mask.js'
import type {
  IgsProjectDocumentV1,
  IgsRectV1,
  IgsSmartPatchLayerV1,
} from './projects/project-schema.js'
import type { PromptEmbeddingSelection } from './projects/prompt-embeddings.js'
import type { SmartPatchCoherenceSettings } from './projects/smart-patch-coherence-settings.js'
import type {
  ProjectSmartPatchAcceptRequest,
  ProjectSmartPatchCandidateExportRequest,
  ProjectSmartPatchDiscardRequest,
  ProjectSmartPatchDiscardResult,
  ProjectSmartPatchGenerateOptions,
  ProjectSmartPatchGenerateResult,
  ProjectSmartPatchGenerationTargetState,
  ProjectSmartPatchResultsSnapshot,
} from './projects/smart-patch-public-generation.js'
import type {
  ProjectSmartPatchVariantChange,
  ProjectSmartPatchVariantsInspection,
} from './projects/smart-patch-variants.js'

import { isAnimaSamplingMethod } from './projects/anima-sampling-method.js'
import { isGenerationDynamicPromptSettings } from './projects/generation-dynamic-settings.js'
import { isIllustriousSamplingDraftPair } from './projects/illustrious-scheduler.js'
import { PROJECT_MASK_SETTINGS_MAX } from './projects/project-mask-settings.js'
import { parseProjectMaskEdit } from './projects/project-mask.js'
import { IGS_SAFETY_CEILINGS } from './projects/project-schema.js'
import { isSmartPatchCoherenceSettings } from './projects/smart-patch-coherence-settings.js'

export type {
  PresetDefinition,
  PresetPayload,
  PresetRecord,
  PresetSectionKey,
  PresetWorkflow,
} from './presets/preset-schema.js'

export type { ProjectCreateInput } from './projects/project-create.js'

export type {
  ProjectGenerateOptions,
  ProjectGenerateResult,
  ProjectGenerationActionState,
  ProjectGenerationQueueJob,
} from './projects/project-generation-actions.js'
export type {
  ProjectSmartPatchAcceptRequest,
  ProjectSmartPatchCandidateExportRequest,
  ProjectSmartPatchDiscardRequest,
  ProjectSmartPatchDiscardResult,
  ProjectSmartPatchGenerateOptions,
  ProjectSmartPatchGenerateResult,
  ProjectSmartPatchGenerationTargetState,
  ProjectSmartPatchResultsSnapshot,
  ProjectSmartPatchResultTarget,
  ProjectSmartPatchResultView,
} from './projects/smart-patch-public-generation.js'

export type {
  ProjectSmartPatchVariantChange,
  ProjectSmartPatchVariantsInspection,
} from './projects/smart-patch-variants.js'

/** Renderer contract. System APIs remain in Electron main. */
export const ipcChannels = {
  models: {
    cancelInstall: 'models:cancel-install',
    checkUpdates: 'models:check-updates',
    getCatalog: 'models:get-catalog',
    getInstallJobs: 'models:get-install-jobs',
    getStorageSummary: 'models:get-storage-summary',
    getTokenStatus: 'models:get-token-status',
    installChanged: 'models:install-changed',
    openModelFolder: 'models:open-model-folder',
    openSourceLink: 'models:open-source-link',
    previewImport: 'models:preview-import',
    removeToken: 'models:remove-token',
    saveToken: 'models:save-token',
    setDefaultVersion: 'models:set-default-version',
    setNoiseProfile: 'models:set-noise-profile',
    setPredictionType: 'models:set-prediction-type',
    startInstall: 'models:start-install',
  },
  presets: {
    create: 'presets:create',
    duplicate: 'presets:duplicate',
    get: 'presets:get',
    list: 'presets:list',
    restore: 'presets:restore',
    softDelete: 'presets:soft-delete',
    update: 'presets:update',
  },
  projects: {
    acceptGenerationCandidates: 'projects:accept-generation-candidates',
    acceptSmartPatchVariants: 'projects:accept-smart-patch-variants',
    addGenerationLora: 'projects:add-generation-lora',
    addSmartPatchLayer: 'projects:add-smart-patch-layer',
    applyPreset: 'projects:apply-preset',
    cancelCurrentGeneration: 'projects:cancel-current-generation',
    cancelGenerationJob: 'projects:cancel-generation-job',
    cancelImport: 'projects:cancel-import',
    clearHistory: 'projects:clear-history',
    close: 'projects:close',
    create: 'projects:create',
    deleteGenerationJob: 'projects:delete-generation-job',
    discardAndClose: 'projects:discard-and-close',
    discardSmartPatchGenerationResults: 'projects:discard-smart-patch-generation-results',
    editSmartPatchMask: 'projects:edit-smart-patch-mask',
    finishImport: 'projects:finish-import',
    generate: 'projects:generate',
    generateSmartPatch: 'projects:generate-smart-patch',
    generationChanged: 'projects:generation-changed',
    generationProgress: 'projects:generation-progress',
    getAcceptedResultHistory: 'projects:get-accepted-result-history',
    getCloseImpact: 'projects:get-close-impact',
    getGenerationProgress: 'projects:get-generation-progress',
    getGenerationQueue: 'projects:get-generation-queue',
    getGenerationState: 'projects:get-generation-state',
    getGenerationTargetState: 'projects:get-generation-target-state',
    getRasterGenerationData: 'projects:get-raster-generation-data',
    getRasterPresetData: 'projects:get-raster-preset-data',
    getSmartPatchGenerationTargetState: 'projects:get-smart-patch-generation-target-state',
    getSmartPatchVariants: 'projects:get-smart-patch-variants',
    importRasterImage: 'projects:import-raster-image',
    list: 'projects:list',
    listGenerationResults: 'projects:list-generation-results',
    listSmartPatchGenerationResults: 'projects:list-smart-patch-generation-results',
    moveRasterLayer: 'projects:move-raster-layer',
    open: 'projects:open',
    prepareWindowClose: 'projects:prepare-window-close',
    pruneGenerationQueue: 'projects:prune-generation-queue',
    rebuildPreview: 'projects:rebuild-preview',
    redo: 'projects:redo',
    relinkGenerationEmbedding: 'projects:relink-generation-embedding',
    relinkGenerationLora: 'projects:relink-generation-lora',
    relinkGenerationModel: 'projects:relink-generation-model',
    relinkGenerationVae: 'projects:relink-generation-vae',
    removeGenerationLora: 'projects:remove-generation-lora',
    resolveRecovery: 'projects:resolve-recovery',
    retryGenerationJob: 'projects:retry-generation-job',
    reviewAcceptedResult: 'projects:review-accepted-result',
    save: 'projects:save',
    saveGenerationCandidateImage: 'projects:save-generation-candidate-image',
    saveSmartPatchCandidateImage: 'projects:save-smart-patch-candidate-image',
    sealPromptHistory: 'projects:seal-prompt-history',
    selectImport: 'projects:select-import',
    setGenerationModel: 'projects:set-generation-model',
    setGenerationVae: 'projects:set-generation-vae',
    setPrimaryBbox: 'projects:set-primary-bbox',
    tabsChanged: 'projects:tabs-changed',
    undo: 'projects:undo',
    updateGenerationDraft: 'projects:update-generation-draft',
    updateRasterLayer: 'projects:update-raster-layer',
    updateSmartPatchLayer: 'projects:update-smart-patch-layer',
    updateSmartPatchVariant: 'projects:update-smart-patch-variant',
    windowCloseDecisionPending: 'projects:window-close-decision-pending',
    windowCloseEditorReady: 'projects:window-close-editor-ready',
    windowCloseReady: 'projects:window-close-ready',
    windowCloseReleased: 'projects:window-close-released',
  },
  runtime: {
    getStatus: 'runtime:get-status',
    install: 'runtime:install',
    repair: 'runtime:repair',
    statusChanged: 'runtime:status-changed',
  },
} as const

export interface RuntimeStatus {
  detail: string
  kind: 'needs-repair' | 'not-installed' | 'ready' | 'unsupported'
  profile: 'linux-nvidia' | null
  runtimeId?: string
}

export interface ApiError {
  code: string
  message: string
}

export type ApiResult<T> = { error: ApiError; ok: false } | { ok: true; value: T }

export const PRESET_ERROR_CODES = [
  'IPC_INVALID_CALLER',
  'PRESET_CONFLICT',
  'PRESET_DELETED',
  'PRESET_EXPIRED',
  'PRESET_INPUT_INVALID',
  'PRESET_NOT_DELETED',
  'PRESET_NOT_FOUND',
  'PRESET_STORAGE_FAILED',
  'PRESET_STORAGE_INVALID',
  'PRESET_UNAVAILABLE',
] as const

export type PresetErrorCode = (typeof PRESET_ERROR_CODES)[number]
export interface PresetApiError {
  code: 'IPC_INVALID_RESPONSE' | 'IPC_UNAVAILABLE' | PresetErrorCode
  message: string
}
export type PresetApiResult<T> = { error: PresetApiError; ok: false } | { ok: true; value: T }

export interface PresetGetOptions {
  includeDeleted?: boolean
}
export interface PresetListOptions {
  deleted?: boolean
}

/** Storage operations only. Apply and result-to-preset retain their own Project boundaries. */
export interface PresetApi {
  create: (definition: PresetDefinition) => Promise<PresetApiResult<PresetRecord>>
  duplicate: (id: string, name?: string) => Promise<PresetApiResult<PresetRecord>>
  get: (id: string, options?: PresetGetOptions) => Promise<PresetApiResult<PresetRecord | null>>
  list: (options?: PresetListOptions) => Promise<PresetApiResult<PresetRecord[]>>
  restore: (id: string) => Promise<PresetApiResult<PresetRecord>>
  softDelete: (id: string) => Promise<PresetApiResult<PresetRecord>>
  update: (id: string, definition: PresetDefinition) => Promise<PresetApiResult<PresetRecord>>
}

export interface ProjectSummary {
  bbox: Pick<IgsRectV1, 'height' | 'width'> | null
  health: 'corrupt' | 'missing' | 'ready' | 'unsupported_schema'
  id: string
  previewStatus: 'empty' | 'rendered' | 'unavailable' | null
  recoveryReason?: string
  recoveryStatus: 'invalid' | 'none' | 'recoverable' | 'stale' | 'unavailable'
  thumbnailUrl: string | null
  title: string
}

export interface ProjectTab {
  acceptedResults: ProjectAcceptedResultView[]
  autosaveError: string | null
  canRedo: boolean
  canUndo: boolean
  dirty: boolean
  documentId: string
  documentRevision: string
  generationDraft: IgsProjectDocumentV1['generationDraft']
  id: string
  lastActualSeedSnapshot: IgsProjectDocumentV1['lastActualSeedSnapshot']
  layers: ProjectLayerView[]
  primaryBbox: IgsRectV1
  storageWarning?: string
  title: string
}

/** Read-only Project-local projection of current accepted generated Raster Layers. */
export interface ProjectAcceptedResultView {
  acceptedAt: string
  height: number
  imageUrl: string
  layerId: string
  layerName: string
  modelFileSha256: string
  modelName: string
  modelVersionName: string
  seed: number
  width: number
}

export interface ProjectRasterLayerView {
  blendMode: 'multiply' | 'normal' | 'overlay' | 'screen'
  height: number
  id: string
  imageUrl: string
  kind?: 'raster'
  locked: boolean
  name: string
  opacity: number
  transform: {
    rotationDegrees: number
    scaleX: number
    scaleY: number
    x: number
    y: number
  }
  visible: boolean
  width: number
}

/** Stored pixels and authored freshness; actual source inspection is a separate read. */
export interface ProjectSmartPatchLayerView {
  activeRaster: ProjectRasterLayerView | null
  activeRasterSubLayerId: string | null
  blendMode: ProjectRasterLayerView['blendMode']
  boundingBox: IgsRectV1
  coherenceSettings?: SmartPatchCoherenceSettings
  generationDraft: ProjectTab['generationDraft']
  id: string
  internalResolution: { height: number; width: number }
  kind: 'smart-patch'
  locked: boolean
  mask: IgsSmartPatchLayerV1['mask']
  maskImageUrl: string | null
  maskSettings?: ProjectMaskSettings
  name: string
  opacity: number
  rasterSubLayers: { id: string; name: string }[]
  status: 'empty' | 'outdated' | 'unverified'
  visible: boolean
}

export type ProjectLayerView = ProjectRasterLayerView | ProjectSmartPatchLayerView

/** Captured gesture owner and baseline. Renderer never supplies pixels or an asset path. */
export interface ProjectSmartPatchMaskEditRequest {
  documentId: string
  documentRevision: string
  edit: ProjectMaskEdit
  maskId: string
  maskRevision: number
}

export type ProjectSmartPatchLayerChange =
  | ProjectRasterLayerChange
  | {
      documentId: string
      documentRevision: string
      kind: 'bbox-padding' | 'mask-blur'
      value: number
    }
  | {
      documentId: string
      documentRevision: string
      kind: 'coherence-settings'
      value: SmartPatchCoherenceSettings
    }
  | { kind: 'bounding-box'; rect: IgsRectV1 }
  | { kind: 'internal-resolution'; size: { height: number; width: number } }

export type ProjectRasterLayerChange =
  | { blendMode: ProjectRasterLayerView['blendMode']; kind: 'blend-mode' }
  | { kind: 'lock'; locked: boolean }
  | { kind: 'opacity'; opacity: number }
  | { kind: 'visibility'; visible: boolean }

export interface ProjectLoraIdentity {
  resourceId: string
  versionId: string
}

/** Addresses a saved literal sidecar; portable local IDs need not belong to this registry. */
export type ProjectEmbeddingIdentity = PromptEmbeddingSelection & {
  polarity: 'negative' | 'positive'
}

export type ProjectGenerationDraftChange =
  | (ProjectLoraIdentity & { kind: 'lora-enabled'; value: boolean })
  | (ProjectLoraIdentity & { kind: 'lora-weight'; value: number })
  | {
      embeddingSelection?: PromptEmbeddingSelection
      kind: 'negative-prompt' | 'positive-prompt'
      text: string
    }
  | { kind: 'anima-method'; value: AnimaSamplingMethod | null }
  | { kind: 'cfg-rescale'; value: number | null }
  | { kind: 'denoising-strength'; value: number | null }
  | { kind: 'dynamic-prompt'; value: GenerationDynamicPromptSettings }
  | { kind: 'sampling-cfg-scale'; value: number | null }
  | { kind: 'sampling-pair'; sampler: string | null; scheduler: string | null }
  | { kind: 'sampling-steps'; value: number | null }
  | { kind: 'seed'; policy: 'fixed'; value: number }
  | { kind: 'seed'; policy: 'random' | 'reuse'; value: null }
  | { kind: 'vae-precision'; value: 'Auto' | 'FP16' | 'FP32' | null }

/** A renderer selection carries IDs only; main copies exact metadata from its verified registry. */
export type ProjectGenerationModelSelection = { resourceId: string; versionId: string } | null

export type ProjectImportSelection =
  | { fileName: string; importId: string; kind: 'transfer-required'; title: string }
  | { kind: 'opened'; result: ProjectOpenResult }

export interface ProjectImportFinishResult {
  result: ProjectOpenResult
  sourceRetained: boolean
  warning?: string
}

export type ProjectOpenResult =
  | { kind: 'opened'; tab: ProjectTab }
  | {
      kind: 'recovery-required'
      projectId: string
      reason: string
      recoveryStatus: 'invalid' | 'recoverable' | 'stale'
    }

export interface ProjectSaveResult {
  committed: true
  directorySynced: boolean
  indexWarning?: string
  recoveryError?: string
  recoveryStatus: 'clean' | 'dirty' | 'failed'
  reloadRequired: boolean
  tab: ProjectTab
}

export interface ProjectRebuildResult {
  committed: true
  directorySynced: boolean
  indexWarning?: string
}

export interface ProjectCloseImpact {
  completedCandidateCount: number
  generationStorageUnavailable: boolean
  unfinishedJobCount: number
}

export interface ProjectGenerationResultView {
  actualSeed: number
  bbox: IgsRectV1
  candidateId: string
  completedAt: string
  completionOrder: number
  imageUrl: string
  queueItemId: string
  sourceDocumentMismatch: boolean
  stagingSessionId: string
  /** Optional verified, rebuildable worker derivative; full PNG remains the image source. */
  thumbnailUrl?: string
}

export interface ProjectGenerationResultsSnapshot {
  candidates: ProjectGenerationResultView[]
  /** Local completed seed for the currently open document, independent of candidate retention. */
  lastActualSeed: number | null
  recoveryUnavailable: boolean
  /** Unfinished jobs in the open document's reviewed completed-result sessions. */
  unfinishedSiblingJobIds: string[]
}

export type ProjectCandidateExportResult =
  { fileName: string; kind: 'saved' } | { kind: 'canceled' }

export interface ProjectApi {
  acceptGenerationCandidates: (
    tabId: string,
    candidateIds: string[],
    focusedCandidateId: string | null,
    expectedAvailableIds: string[],
    expectedUnfinishedJobIds?: string[],
  ) => Promise<ApiResult<ProjectTab>>
  acceptSmartPatchVariants: (
    tabId: string,
    request: ProjectSmartPatchAcceptRequest,
  ) => Promise<ApiResult<ProjectTab>>
  addGenerationLora: (
    tabId: string,
    selection: NonNullable<ProjectGenerationModelSelection>,
    targetLayerId?: string,
  ) => Promise<ApiResult<ProjectTab>>
  addSmartPatchLayer: (tabId: string) => Promise<ApiResult<ProjectTab>>
  applyPreset: (tabId: string, request: PresetApplicationRequest) => Promise<ApiResult<ProjectTab>>
  cancelCurrentGeneration: (
    tabId: string,
    documentId: string,
    expectedJobId: string,
  ) => Promise<ApiResult<ProjectGenerationActionState>>
  cancelGenerationJob: (review: GenerationQueueReview) => Promise<ApiResult<void>>
  cancelImport: (importId: string) => Promise<ApiResult<void>>
  clearHistory: (tabId: string) => Promise<ApiResult<ProjectTab>>
  close: (tabId: string, confirmCloseImpact?: boolean) => Promise<ApiResult<void>>
  create: (options: ProjectCreateInput) => Promise<ApiResult<ProjectTab>>
  deleteGenerationJob: (review: GenerationQueueReview) => Promise<ApiResult<void>>
  discardAndClose: (tabId: string, confirmCloseImpact?: boolean) => Promise<ApiResult<void>>
  discardSmartPatchGenerationResults: (
    tabId: string,
    request: ProjectSmartPatchDiscardRequest,
  ) => Promise<ApiResult<ProjectSmartPatchDiscardResult>>
  editSmartPatchMask: (
    tabId: string,
    layerId: string,
    request: ProjectSmartPatchMaskEditRequest,
  ) => Promise<ApiResult<ProjectTab>>
  finishImport: (
    importId: string,
    choice: 'copy' | 'move',
  ) => Promise<ApiResult<ProjectImportFinishResult>>
  generate: (
    tabId: string,
    options: ProjectGenerateOptions,
  ) => Promise<ApiResult<ProjectGenerateResult>>
  generateSmartPatch: (
    tabId: string,
    options: ProjectSmartPatchGenerateOptions,
  ) => Promise<ApiResult<ProjectSmartPatchGenerateResult>>
  getAcceptedResultHistory: (
    cursor?: AcceptedResultHistoryCursor | null,
  ) => Promise<ApiResult<AcceptedResultHistoryPage>>
  getCloseImpact: (tabId: string) => Promise<ApiResult<ProjectCloseImpact>>
  getGenerationProgress: () => Promise<ApiResult<GenerationProgressSnapshot>>
  getGenerationQueue: (
    cursor?: GenerationQueueCursor | null,
  ) => Promise<ApiResult<GenerationQueuePage>>
  getGenerationState: (tabId: string) => Promise<ApiResult<ProjectGenerationActionState>>
  getGenerationTargetState: (
    tabId: string,
    documentId: string,
    targetKey: string,
  ) => Promise<ApiResult<ProjectGenerationTargetState>>
  getRasterGenerationData: (
    tabId: string,
    documentId: string,
    layerId: string,
  ) => Promise<ApiResult<RasterGenerationData>>
  /** Immutable accepted settings only; never inspects the current Canvas through a worker. */
  getRasterPresetData: (
    tabId: string,
    documentId: string,
    layerId: string,
  ) => Promise<ApiResult<RasterGenerationData>>
  getSmartPatchGenerationTargetState: (
    tabId: string,
    documentId: string,
    documentRevision: string,
    layerId: string,
  ) => Promise<ApiResult<ProjectSmartPatchGenerationTargetState>>
  getSmartPatchVariants: (
    tabId: string,
    layerId: string,
    documentId: string,
    documentRevision: string,
  ) => Promise<ApiResult<ProjectSmartPatchVariantsInspection>>
  importRasterImage: (tabId: string) => Promise<ApiResult<ProjectTab | null>>
  list: () => Promise<ApiResult<ProjectSummary[]>>
  listGenerationResults: (tabId: string) => Promise<ApiResult<ProjectGenerationResultsSnapshot>>
  listSmartPatchGenerationResults: (
    tabId: string,
  ) => Promise<ApiResult<ProjectSmartPatchResultsSnapshot>>
  moveRasterLayer: (
    tabId: string,
    layerId: string,
    targetIndex: number,
  ) => Promise<ApiResult<ProjectTab>>
  onBeforeWindowClose: (
    listener: (setDecisionPending: (pending: boolean) => void) => Promise<void>,
    onCanceled: () => void,
  ) => () => void
  onGenerationChanged: (listener: () => void) => () => void
  onGenerationProgress: (listener: (snapshot: GenerationProgressSnapshot) => void) => () => void
  onTabsChanged: (listener: (tabs: ProjectTab[]) => void) => () => void
  open: (projectId: string) => Promise<ApiResult<ProjectOpenResult>>
  pruneGenerationQueue: (statuses: GenerationQueueTerminalStatus[]) => Promise<ApiResult<number>>
  rebuildPreview: (projectId: string) => Promise<ApiResult<ProjectRebuildResult>>
  redo: (tabId: string) => Promise<ApiResult<ProjectTab>>
  relinkGenerationEmbedding: (
    tabId: string,
    identity: ProjectEmbeddingIdentity,
    targetLayerId?: string,
  ) => Promise<ApiResult<ProjectTab>>
  relinkGenerationLora: (
    tabId: string,
    identity: ProjectLoraIdentity,
    targetLayerId?: string,
  ) => Promise<ApiResult<ProjectTab>>
  relinkGenerationModel: (tabId: string, targetLayerId?: string) => Promise<ApiResult<ProjectTab>>
  relinkGenerationVae: (tabId: string, targetLayerId?: string) => Promise<ApiResult<ProjectTab>>
  removeGenerationLora: (
    tabId: string,
    identity: ProjectLoraIdentity,
    targetLayerId?: string,
  ) => Promise<ApiResult<ProjectTab>>
  resolveRecovery: (
    projectId: string,
    decision: 'discard' | 'recover',
  ) => Promise<ApiResult<ProjectTab>>
  retryGenerationJob: (review: GenerationQueueReview) => Promise<ApiResult<void>>
  reviewAcceptedResult: (reference: AcceptedResultHistoryReference) => Promise<ApiResult<boolean>>
  save: (tabId: string) => Promise<ApiResult<ProjectSaveResult>>
  saveGenerationCandidateImage: (
    tabId: string,
    candidateId: string,
  ) => Promise<ApiResult<ProjectCandidateExportResult>>
  saveSmartPatchCandidateImage: (
    tabId: string,
    request: ProjectSmartPatchCandidateExportRequest,
  ) => Promise<ApiResult<ProjectCandidateExportResult>>
  sealPromptHistory: (tabId: string, historyGroupId?: string) => Promise<ApiResult<ProjectTab>>
  selectImport: () => Promise<ApiResult<ProjectImportSelection | null>>
  setGenerationModel: (
    tabId: string,
    selection: ProjectGenerationModelSelection,
    targetLayerId?: string,
  ) => Promise<ApiResult<ProjectTab>>
  setGenerationVae: (
    tabId: string,
    selection: ProjectGenerationModelSelection,
    targetLayerId?: string,
  ) => Promise<ApiResult<ProjectTab>>
  setPrimaryBbox: (tabId: string, rect: IgsRectV1) => Promise<ApiResult<ProjectTab>>
  undo: (tabId: string) => Promise<ApiResult<ProjectTab>>
  updateGenerationDraft: (
    tabId: string,
    change: ProjectGenerationDraftChange,
    historyGroupId?: string,
    targetLayerId?: string,
  ) => Promise<ApiResult<ProjectTab>>
  updateRasterLayer: (
    tabId: string,
    layerId: string,
    change: ProjectRasterLayerChange,
  ) => Promise<ApiResult<ProjectTab>>
  updateSmartPatchLayer: (
    tabId: string,
    layerId: string,
    change: ProjectSmartPatchLayerChange,
  ) => Promise<ApiResult<ProjectTab>>
  updateSmartPatchVariant: (
    tabId: string,
    layerId: string,
    change: ProjectSmartPatchVariantChange,
  ) => Promise<ApiResult<ProjectTab>>
}

export type ModelResourceType = 'checkpoint' | 'embedding' | 'lora' | 'upscaler' | 'vae'

export type BaseModelFamily = 'anima' | 'illustrious'
export type ModelFileStatus = 'corrupt' | 'missing' | 'ready'
export type IllustriousPredictionType = 'epsilon' | 'v_prediction'
/** Independent user choices for exact checkpoint bytes. Null restores one assumed default. */
export type SetCheckpointNoiseProfileChange =
  | { kind: 'rescale-betas-zero-snr'; value: boolean | null }
  | { kind: 'timestep-spacing'; value: IllustriousNoiseProfileV1['timestepSpacing'] | null }

export interface CheckpointNoiseProfileView {
  effective: IllustriousNoiseProfileV1
  rescaleBetasZeroSnrSource: 'assumed' | 'override'
  timestepSpacingSource: 'assumed' | 'override'
}

/** Read-only identities of the app-pinned Anima companions; no filesystem paths cross IPC. */
export interface AnimaModelBundleView {
  architecture: 'anima-base-1.0'
  checkpointByteSize: number
  qwen3Encoder: {
    byteSize: number
    localModelId: string
    localVersionId: string
    sha256: string
  }
  vae: {
    byteSize: number
    localModelId: string
    localVersionId: string
    sha256: string
  }
}
export interface ModelVersionView {
  anima?: AnimaModelBundleView
  baseModelFamily: BaseModelFamily | null
  civitaiFileId: number | null
  civitaiVersionId: number | null
  dependencyIssues: string[]
  fileName: string
  fileSizeBytes: number
  fileStatus: ModelFileStatus
  format: string
  id: string
  installedAt: string
  name: string
  noiseProfile?: CheckpointNoiseProfileView
  predictionType: 'epsilon' | 'sample' | 'v_prediction' | null
  predictionTypeSource?: 'default' | 'manifest' | 'not-applicable' | 'user'
  /** Optional local worker derivatives; absent artwork never changes file readiness. */
  previewDataUrl?: string | null
  sha256: string
  thumbnailDataUrl?: string | null
  trainedWords: string[]
}
export interface ModelCatalogItem {
  author: string | null
  defaultVersionId: string | null
  description: string | null
  id: string
  modelId: number | null
  name: string
  previewDataUrl: string | null
  resourceType: ModelResourceType
  sourceUrl: string | null
  thumbnailDataUrl?: string | null
  trainedWords: string[]
  versions: ModelVersionView[]
}

export interface CivitaiTokenStatus {
  detail: string
  kind: 'connected' | 'failed' | 'missing' | 'unavailable'
}

export type ModelImportPreview =
  | {
      author: string | null
      baseModel: string
      baseModelFamily: BaseModelFamily | null
      dependencies: {
        alreadyInstalled: boolean
        name: string
        role: 'qwen3_encoder' | 'vae'
        sizeBytes: number
      }[]
      description: string | null
      files: {
        alreadyInstalled: boolean
        fileId: number
        format: string | null
        license: { name: string; summary: string; url: string } | null
        name: string
        needsRepair: boolean
        primary: boolean
        reusesInstalledFile: boolean
        sha256: string | null
        sizeEstimateBytes: number | null
      }[]
      kind: 'select-file'
      license: { name: string; summary: string; url: string } | null
      modelId: number
      modelName: string
      previewId: string
      previewImageDataUrl: string | null
      resourceType: ModelResourceType
      totalAdditionalBytes: number | null
      trainedWords: string[]
      versionId: number
      versionName: string
    }
  | {
      kind: 'select-version'
      modelId: number
      modelName: string
      resourceType: ModelResourceType
      versions: { baseModel: string | null; id: number; name: string }[]
    }

export interface ModelInstallJobView {
  bytesDownloaded: number
  error: ApiError | null
  id: string
  modelName: string
  status: 'canceled' | 'completed' | 'downloading' | 'failed' | 'verifying' | 'waiting'
  totalBytes: number | null
  versionName: string
}

export interface ModelApi {
  cancelInstall: (jobId: string) => Promise<ApiResult<ModelInstallJobView>>
  checkUpdates: (
    modelId: number,
  ) => Promise<ApiResult<{ availableVersions: { id: number; name: string }[] }>>
  getCatalog: () => Promise<ApiResult<ModelCatalogItem[]>>
  getInstallJobs: () => Promise<ApiResult<ModelInstallJobView[]>>
  getStorageSummary: () => Promise<ApiResult<{ totalBytes: number }>>
  getTokenStatus: () => Promise<ApiResult<CivitaiTokenStatus>>
  onInstallChanged: (listener: (job: ModelInstallJobView) => void) => () => void
  openModelFolder: () => Promise<ApiResult<void>>
  openSourceLink: (url: string) => Promise<ApiResult<void>>
  previewImport: (url: string) => Promise<ApiResult<ModelImportPreview>>
  removeToken: () => Promise<ApiResult<CivitaiTokenStatus>>
  saveToken: (token: string) => Promise<ApiResult<CivitaiTokenStatus>>
  setDefaultVersion: (resourceId: string, versionId: string) => Promise<ApiResult<void>>
  setNoiseProfile: (
    resourceId: string,
    versionId: string,
    change: SetCheckpointNoiseProfileChange,
  ) => Promise<ApiResult<void>>
  setPredictionType: (
    resourceId: string,
    versionId: string,
    predictionType: IllustriousPredictionType,
  ) => Promise<ApiResult<void>>
  startInstall: (
    previewId: string,
    fileId: number,
    acceptedAnimaLicense: boolean,
  ) => Promise<ApiResult<ModelInstallJobView>>
}

export interface RuntimeApi {
  getStatus: () => Promise<ApiResult<RuntimeStatus>>
  install: () => Promise<ApiResult<RuntimeStatus>>
  onStatusChanged: (listener: (status: RuntimeStatus) => void) => () => void
  repair: () => Promise<ApiResult<RuntimeStatus>>
}

export interface StudioApi {
  models: ModelApi
  presets: PresetApi
  projects: ProjectApi
  runtime: RuntimeApi
}

export function isCheckpointNoiseProfileChange(
  value: unknown,
): value is SetCheckpointNoiseProfileChange {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }
  const change = value as Record<string, unknown>
  if (
    Object.keys(change).length !== 2 ||
    !Object.hasOwn(change, 'kind') ||
    !Object.hasOwn(change, 'value')
  ) {
    return false
  }
  return (
    (change['kind'] === 'rescale-betas-zero-snr' &&
      (change['value'] === null || typeof change['value'] === 'boolean')) ||
    (change['kind'] === 'timestep-spacing' &&
      (change['value'] === null ||
        change['value'] === 'leading' ||
        change['value'] === 'linspace' ||
        change['value'] === 'trailing'))
  )
}

/** The renderer may edit scalar draft settings, never forge resource sidecars. */
export function isProjectGenerationDraftChange(
  input: unknown,
): input is ProjectGenerationDraftChange {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return false
  }
  const value = input as Record<string, unknown>
  const keys = Object.keys(value)
  if (value['kind'] === 'anima-method') {
    return (
      keys.length === 2 &&
      keys.includes('kind') &&
      keys.includes('value') &&
      (value['value'] === null || isAnimaSamplingMethod(value['value']))
    )
  }
  if (value['kind'] === 'vae-precision') {
    return (
      keys.length === 2 &&
      keys.includes('kind') &&
      keys.includes('value') &&
      (value['value'] === null ||
        value['value'] === 'Auto' ||
        value['value'] === 'FP16' ||
        value['value'] === 'FP32')
    )
  }
  if (value['kind'] === 'dynamic-prompt') {
    return (
      keys.length === 2 &&
      keys.includes('kind') &&
      keys.includes('value') &&
      isGenerationDynamicPromptSettings(value['value'])
    )
  }
  if (value['kind'] === 'lora-enabled' || value['kind'] === 'lora-weight') {
    return (
      keys.length === 4 &&
      keys.includes('value') &&
      isProjectLoraIdentity({ resourceId: value['resourceId'], versionId: value['versionId'] }) &&
      (value['kind'] === 'lora-enabled'
        ? typeof value['value'] === 'boolean'
        : typeof value['value'] === 'number' && Number.isFinite(value['value']))
    )
  }
  if (value['kind'] === 'positive-prompt' || value['kind'] === 'negative-prompt') {
    return (
      (keys.length === 2 ||
        (keys.length === 3 &&
          keys.includes('embeddingSelection') &&
          isPromptEmbeddingSelection(value['embeddingSelection']))) &&
      keys.includes('kind') &&
      keys.includes('text') &&
      typeof value['text'] === 'string' &&
      value['text'].length <= IGS_SAFETY_CEILINGS.textBytes &&
      new TextEncoder().encode(value['text']).length <= IGS_SAFETY_CEILINGS.textBytes
    )
  }
  if (value['kind'] === 'cfg-rescale' || value['kind'] === 'denoising-strength') {
    return (
      keys.length === 2 &&
      keys.includes('kind') &&
      keys.includes('value') &&
      (value['value'] === null ||
        (typeof value['value'] === 'number' &&
          Number.isFinite(value['value']) &&
          value['value'] >= 0 &&
          value['value'] <= (value['kind'] === 'cfg-rescale' ? 0.99 : 1)))
    )
  }
  if (value['kind'] === 'sampling-steps' || value['kind'] === 'sampling-cfg-scale') {
    if (keys.length !== 2 || !keys.includes('kind') || !keys.includes('value')) {
      return false
    }
    if (value['value'] === null) {
      return true
    }
    return value['kind'] === 'sampling-steps'
      ? typeof value['value'] === 'number' &&
          Number.isSafeInteger(value['value']) &&
          value['value'] >= 1
      : typeof value['value'] === 'number' && Number.isFinite(value['value']) && value['value'] >= 0
  }
  if (value['kind'] === 'sampling-pair') {
    return (
      keys.length === 3 &&
      keys.includes('kind') &&
      keys.includes('sampler') &&
      keys.includes('scheduler') &&
      isIllustriousSamplingDraftPair(value['sampler'], value['scheduler'])
    )
  }
  if (
    value['kind'] !== 'seed' ||
    keys.length !== 3 ||
    !keys.includes('policy') ||
    !keys.includes('value')
  ) {
    return false
  }
  return value['policy'] === 'fixed'
    ? typeof value['value'] === 'number' &&
        Number.isSafeInteger(value['value']) &&
        value['value'] >= 0 &&
        value['value'] <= 0xff_ff_ff_ff
    : (value['policy'] === 'random' || value['policy'] === 'reuse') && value['value'] === null
}

/** A completion may select installed registry IDs and its literal, never resource metadata. */
export function isPromptEmbeddingSelection(input: unknown): input is PromptEmbeddingSelection {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return false
  }
  const value = input as Record<string, unknown>
  return (
    Object.keys(value).length === 3 &&
    isProjectGenerationModelSelection({
      resourceId: value['resourceId'],
      versionId: value['versionId'],
    }) &&
    isBoundedEmbeddingToken(value['token'])
  )
}

export function isProjectEmbeddingIdentity(input: unknown): input is ProjectEmbeddingIdentity {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return false
  }
  const value = input as Record<string, unknown>
  return (
    Object.keys(value).length === 4 &&
    (value['polarity'] === 'negative' || value['polarity'] === 'positive') &&
    isProjectLoraIdentity({ resourceId: value['resourceId'], versionId: value['versionId'] }) &&
    isBoundedEmbeddingToken(value['token'])
  )
}

export function isProjectGenerationModelSelection(
  input: unknown,
): input is ProjectGenerationModelSelection {
  if (input === null) {
    return true
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return false
  }
  const value = input as Record<string, unknown>
  const keys = Object.keys(value)
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return (
    keys.length === 2 &&
    keys.includes('resourceId') &&
    keys.includes('versionId') &&
    typeof value['resourceId'] === 'string' &&
    typeof value['versionId'] === 'string' &&
    uuid.test(value['resourceId']) &&
    uuid.test(value['versionId'])
  )
}

export function isProjectRasterLayerChange(input: unknown): input is ProjectRasterLayerChange {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return false
  }
  const value = input as Record<string, unknown>
  const keys = Object.keys(value)
  return (
    (value['kind'] === 'visibility' &&
      keys.length === 2 &&
      keys.includes('kind') &&
      keys.includes('visible') &&
      typeof value['visible'] === 'boolean') ||
    (value['kind'] === 'lock' &&
      keys.length === 2 &&
      keys.includes('kind') &&
      keys.includes('locked') &&
      typeof value['locked'] === 'boolean') ||
    (value['kind'] === 'opacity' &&
      keys.length === 2 &&
      keys.includes('kind') &&
      keys.includes('opacity') &&
      typeof value['opacity'] === 'number' &&
      Number.isFinite(value['opacity']) &&
      value['opacity'] >= 0 &&
      value['opacity'] <= 1) ||
    (value['kind'] === 'blend-mode' &&
      keys.length === 2 &&
      keys.includes('kind') &&
      keys.includes('blendMode') &&
      typeof value['blendMode'] === 'string' &&
      ['multiply', 'normal', 'overlay', 'screen'].includes(value['blendMode']))
  )
}

export function isProjectSmartPatchLayerChange(
  input: unknown,
): input is ProjectSmartPatchLayerChange {
  if (isProjectRasterLayerChange(input)) {
    return true
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return false
  }
  const value = input as Record<string, unknown>
  if (value['kind'] === 'coherence-settings') {
    return (
      Object.keys(value).length === 4 &&
      ['documentId', 'documentRevision'].every(
        (key) =>
          typeof value[key] === 'string' &&
          /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value[key]),
      ) &&
      isSmartPatchCoherenceSettings(value['value'])
    )
  }
  if (value['kind'] === 'mask-blur' || value['kind'] === 'bbox-padding') {
    return (
      Object.keys(value).length === 4 &&
      ['documentId', 'documentRevision'].every(
        (key) =>
          typeof value[key] === 'string' &&
          /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value[key]),
      ) &&
      typeof value['value'] === 'number' &&
      Number.isSafeInteger(value['value']) &&
      value['value'] >= 0 &&
      value['value'] <= PROJECT_MASK_SETTINGS_MAX
    )
  }
  const size = value['kind'] === 'bounding-box' ? value['rect'] : value['size']
  if (!size || typeof size !== 'object' || Array.isArray(size)) {
    return false
  }
  const dimensions = size as Record<string, unknown>
  const validDimension = (number: unknown) =>
    typeof number === 'number' &&
    Number.isSafeInteger(number) &&
    number >= 1 &&
    number <= IGS_SAFETY_CEILINGS.rasterDimension
  if (!validDimension(dimensions['width']) || !validDimension(dimensions['height'])) {
    return false
  }
  if (value['kind'] === 'internal-resolution') {
    return Object.keys(value).length === 2 && Object.keys(dimensions).length === 2
  }
  if (value['kind'] !== 'bounding-box') {
    return false
  }
  return (
    Object.keys(value).length === 2 &&
    Object.keys(dimensions).length === 4 &&
    ['x', 'y'].every(
      (key) =>
        typeof dimensions[key] === 'number' &&
        Number.isSafeInteger(dimensions[key]) &&
        Math.abs(dimensions[key]) <= IGS_SAFETY_CEILINGS.coordinateMagnitude,
    )
  )
}

export function isProjectSmartPatchMaskEditRequest(
  input: unknown,
): input is ProjectSmartPatchMaskEditRequest {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return false
  }
  const value = input as Record<string, unknown>
  const keys = Object.keys(value)
  if (
    keys.length !== 5 ||
    !['documentId', 'documentRevision', 'edit', 'maskId', 'maskRevision'].every((key) =>
      keys.includes(key),
    ) ||
    !['documentId', 'documentRevision', 'maskId'].every(
      (key) =>
        typeof value[key] === 'string' &&
        /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value[key]),
    ) ||
    typeof value['maskRevision'] !== 'number' ||
    !Number.isSafeInteger(value['maskRevision']) ||
    value['maskRevision'] < 0
  ) {
    return false
  }
  try {
    parseProjectMaskEdit(value['edit'])
    return true
  } catch {
    return false
  }
}

function isBoundedEmbeddingToken(input: unknown): input is string {
  return (
    typeof input === 'string' &&
    input.trim().length > 0 &&
    input.length <= IGS_SAFETY_CEILINGS.titleBytes &&
    new TextEncoder().encode(input).length <= IGS_SAFETY_CEILINGS.titleBytes
  )
}

declare global {
  interface Window {
    api: StudioApi
  }
}

/** Existing portable refs can carry IDs from another installation. No metadata is accepted here. */
export function isProjectLoraIdentity(input: unknown): input is ProjectLoraIdentity {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return false
  }
  const value = input as Record<string, unknown>
  return (
    Object.keys(value).length === 2 &&
    typeof value['resourceId'] === 'string' &&
    value['resourceId'].trim().length > 0 &&
    new TextEncoder().encode(value['resourceId']).length <= IGS_SAFETY_CEILINGS.titleBytes &&
    typeof value['versionId'] === 'string' &&
    value['versionId'].trim().length > 0 &&
    new TextEncoder().encode(value['versionId']).length <= IGS_SAFETY_CEILINGS.titleBytes
  )
}
