import type { ModelRemovalReview } from './model-removal.js'
import type { PresetApplicationRequest } from './presets/preset-application.js'
import type { PresetDefinition, PresetRecord } from './presets/preset-schema.js'
import type {
  SmartPatchPresetApplicationRequest,
  SmartPatchPresetApplicationReview,
  SmartPatchPresetApplicationReviewRequest,
} from './presets/smart-patch-preset-application.js'
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
import type {
  ProjectImageExportRegion,
  ProjectImageExportResult,
} from './projects/project-image-export.js'
import type { ProjectMaskSettings } from './projects/project-mask-settings.js'
import type { ProjectMaskEdit } from './projects/project-mask.js'
import type {
  IgsProjectDocumentV1,
  IgsRectV1,
  IgsRegionalGuidanceReferenceImageV1,
  IgsRegionalGuidanceV1,
  IgsSmartPatchLayerV1,
} from './projects/project-schema.js'
import type { ProjectTrashDeleteResult, ProjectTrashSummary } from './projects/project-trash.js'
import type {
  ProjectWorkspaceAddInput,
  ProjectWorkspaceSummary,
} from './projects/project-workspaces.js'
import type { PromptEmbeddingSelection } from './projects/prompt-embeddings.js'
import type {
  ProjectRegionalGuidanceChange,
  ProjectRegionalGuidanceDocumentOwner,
  ProjectRegionalGuidanceOwner,
  ProjectRegionalGuidancePromptChange,
  ProjectRegionalGuidanceReferenceImageChange,
} from './projects/regional-guidance.js'
import type { SmartPatchCoherenceSettings } from './projects/smart-patch-coherence-settings.js'
import type {
  ProjectSmartPatchAcceptRequest,
  ProjectSmartPatchCandidateExportRequest,
  ProjectSmartPatchDiscardRequest,
  ProjectSmartPatchDiscardResult,
  ProjectSmartPatchGenerateOptions,
  ProjectSmartPatchGenerateResult,
  ProjectSmartPatchGenerationTargetState,
  ProjectSmartPatchRasterAcceptRequest,
  ProjectSmartPatchResultsSnapshot,
} from './projects/smart-patch-public-generation.js'
import type {
  ProjectSmartPatchVariantChange,
  ProjectSmartPatchVariantsInspection,
} from './projects/smart-patch-variants.js'
import type {
  SmartResultComparisonData,
  SmartResultComparisonRequest,
} from './projects/smart-result-comparison.js'
import type {
  SmartResultPresetData,
  SmartResultPresetRequest,
} from './projects/smart-result-preset.js'

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
export type { ProjectTrashDeleteResult, ProjectTrashSummary } from './projects/project-trash.js'
export type {
  ProjectWorkspaceAddInput,
  ProjectWorkspaceSummary,
} from './projects/project-workspaces.js'
export type {
  ProjectRegionalGuidanceChange,
  ProjectRegionalGuidanceDocumentOwner,
  ProjectRegionalGuidanceOwner,
  ProjectRegionalGuidancePromptChange,
  ProjectRegionalGuidanceReferenceImageChange,
} from './projects/regional-guidance.js'

export type {
  ProjectSmartPatchAcceptRequest,
  ProjectSmartPatchCandidateExportRequest,
  ProjectSmartPatchDiscardRequest,
  ProjectSmartPatchDiscardResult,
  ProjectSmartPatchGenerateOptions,
  ProjectSmartPatchGenerateResult,
  ProjectSmartPatchGenerationTargetState,
  ProjectSmartPatchRasterAcceptRequest,
  ProjectSmartPatchResultsSnapshot,
  ProjectSmartPatchResultTarget,
  ProjectSmartPatchResultView,
} from './projects/smart-patch-public-generation.js'
export type {
  ProjectSmartPatchVariantChange,
  ProjectSmartPatchVariantsInspection,
} from './projects/smart-patch-variants.js'

export type {
  SmartResultPresetData,
  SmartResultPresetRequest,
} from './projects/smart-result-preset.js'

/** Renderer contract. System APIs remain in Electron main. */
export const ipcChannels = {
  models: {
    cancelInstall: 'models:cancel-install',
    catalogChanged: 'models:catalog-changed',
    checkUpdates: 'models:check-updates',
    getCatalog: 'models:get-catalog',
    getInstallJobs: 'models:get-install-jobs',
    getStorageSummary: 'models:get-storage-summary',
    getTokenStatus: 'models:get-token-status',
    installChanged: 'models:install-changed',
    openModelFolder: 'models:open-model-folder',
    openSourceLink: 'models:open-source-link',
    previewImport: 'models:preview-import',
    removeLocalResource: 'models:remove-local-resource',
    removeToken: 'models:remove-token',
    reviewRemoval: 'models:review-removal',
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
    acceptSmartPatchRaster: 'projects:accept-smart-patch-raster',
    acceptSmartPatchVariants: 'projects:accept-smart-patch-variants',
    addGenerationLora: 'projects:add-generation-lora',
    addRegionalGuidance: 'projects:add-regional-guidance',
    addSmartPatchLayer: 'projects:add-smart-patch-layer',
    addWorkspace: 'projects:add-workspace',
    applyPreset: 'projects:apply-preset',
    applySmartPatchPreset: 'projects:apply-smart-patch-preset',
    cancelCurrentGeneration: 'projects:cancel-current-generation',
    cancelGenerationJob: 'projects:cancel-generation-job',
    cancelImport: 'projects:cancel-import',
    clearHistory: 'projects:clear-history',
    close: 'projects:close',
    create: 'projects:create',
    deleteGenerationJob: 'projects:delete-generation-job',
    deleteProjectPermanently: 'projects:delete-permanently',
    deleteRegionalGuidance: 'projects:delete-regional-guidance',
    discardAndClose: 'projects:discard-and-close',
    discardSmartPatchGenerationResults: 'projects:discard-smart-patch-generation-results',
    duplicateRegionalGuidance: 'projects:duplicate-regional-guidance',
    editRegionalGuidanceMask: 'projects:edit-regional-guidance-mask',
    editSmartPatchMask: 'projects:edit-smart-patch-mask',
    exportImage: 'projects:export-image',
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
    getSmartPatchPresetApplicationReview: 'projects:get-smart-patch-preset-application-review',
    getSmartPatchVariants: 'projects:get-smart-patch-variants',
    getSmartResultComparisonData: 'projects:get-smart-result-comparison-data',
    getSmartResultPresetData: 'projects:get-smart-result-preset-data',
    importRasterImage: 'projects:import-raster-image',
    importRegionalGuidanceReferenceImage: 'projects:import-regional-guidance-reference-image',
    list: 'projects:list',
    listGenerationResults: 'projects:list-generation-results',
    listSmartPatchGenerationResults: 'projects:list-smart-patch-generation-results',
    listTrash: 'projects:list-trash',
    listWorkspaces: 'projects:list-workspaces',
    locateProject: 'projects:locate',
    locateWorkspace: 'projects:locate-workspace',
    moveProject: 'projects:move-workspace',
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
    removeMissingProject: 'projects:remove-missing',
    removeWorkspace: 'projects:remove-workspace',
    renameProject: 'projects:rename',
    resolveRecovery: 'projects:resolve-recovery',
    restoreProject: 'projects:restore',
    retryGenerationJob: 'projects:retry-generation-job',
    revealProject: 'projects:reveal',
    revealWorkspace: 'projects:reveal-workspace',
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
    trashProject: 'projects:trash',
    undo: 'projects:undo',
    updateGenerationDraft: 'projects:update-generation-draft',
    updateRasterLayer: 'projects:update-raster-layer',
    updateRegionalGuidance: 'projects:update-regional-guidance',
    updateRegionalGuidancePrompt: 'projects:update-regional-guidance-prompt',
    updateRegionalGuidanceReferenceImage: 'projects:update-regional-guidance-reference-image',
    updateSmartPatchLayer: 'projects:update-smart-patch-layer',
    updateSmartPatchVariant: 'projects:update-smart-patch-variant',
    updateWorkspace: 'projects:update-workspace',
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
  kind: 'checking' | 'needs-repair' | 'not-installed' | 'ready' | 'unsupported'
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
  /** Main-owned filename at the indexed/source location; older producers may omit it. */
  fileName?: string
  health: 'corrupt' | 'missing' | 'ready' | 'unsupported_schema'
  id: string
  /** Last verified/cached Home metadata; omitted only by older message producers. */
  lastOpenedAt?: string | null
  modifiedAt?: string | null
  pendingMove?: { message: string; workspaceId: string }
  pendingRename?: { message: string; name: string }
  previewStatus: 'empty' | 'rendered' | 'unavailable' | null
  /** Saved merged PNG capability, bound to the indexed package version; older producers omit it. */
  previewUrl?: string | null
  recoveryReason?: string
  recoveryStatus: 'invalid' | 'none' | 'recoverable' | 'stale' | 'unavailable'
  thumbnailUrl: string | null
  title: string
  workspaceId: string
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
  regionalGuidance?: ProjectRegionalGuidanceLayerView[]
  relocationPending?: boolean
  storageWarning?: string
  title: string
  /** Main-owned workspace; optional for legacy tab messages. */
  workspaceId?: string
}

/** Read-only current accepted rasters: layerId is a Raster Layer or nested variant UUID. */
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
  /** Stored provenance is retained even when reusable generation settings are unsupported. */
  generationSettingsUnavailableReason?: string
  height: number
  id: string
  imageUrl: string
  kind?: 'raster'
  locked: boolean
  name: string
  opacity: number
  /** Explicit comparison capability; absent ordinary Raster views remain compatible. */
  resultComparisonSourceKind?: 'raster' | 'smart-patch'
  /** Preset extraction is independent of comparison support. */
  resultPresetSourceKind?: 'raster' | 'smart-patch'
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

/** Noncompositing owners. The signed display capability is never persisted. */
export type ProjectRegionalGuidanceLayerView = Omit<IgsRegionalGuidanceV1, 'referenceImages'> & {
  maskImageUrl?: string | null
  referenceImages?: ProjectRegionalGuidanceReferenceImageView[]
}

export type ProjectRegionalGuidanceReferenceImageView = IgsRegionalGuidanceReferenceImageV1 & {
  thumbnailUrl: string
}

/** Regional masks have no generation bbox, so Fit is never an accepted operation. */
export interface ProjectRegionalGuidanceMaskEditRequest {
  documentId: string
  documentRevision: string
  edit: Exclude<ProjectMaskEdit, { kind: 'fit-bbox' }>
  maskId: string
  maskRevision: number
}

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

export type ProjectMoveResult = { kind: 'moved' } | { kind: 'pending'; message: string }
export type ProjectRenameResult = { kind: 'pending'; message: string } | { kind: 'renamed' }

export interface ProjectApi {
  acceptGenerationCandidates: (
    tabId: string,
    candidateIds: string[],
    focusedCandidateId: string | null,
    expectedAvailableIds: string[],
    expectedUnfinishedJobIds?: string[],
  ) => Promise<ApiResult<ProjectTab>>
  acceptSmartPatchRaster: (
    tabId: string,
    request: ProjectSmartPatchRasterAcceptRequest,
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
  addRegionalGuidance: (
    tabId: string,
    owner: ProjectRegionalGuidanceDocumentOwner,
  ) => Promise<ApiResult<ProjectTab>>
  addSmartPatchLayer: (tabId: string) => Promise<ApiResult<ProjectTab>>
  addWorkspace: (
    input: ProjectWorkspaceAddInput,
  ) => Promise<ApiResult<ProjectWorkspaceSummary | null>>
  applyPreset: (tabId: string, request: PresetApplicationRequest) => Promise<ApiResult<ProjectTab>>
  applySmartPatchPreset: (
    tabId: string,
    request: SmartPatchPresetApplicationRequest,
  ) => Promise<ApiResult<ProjectTab>>
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
  deleteProjectPermanently: (
    projectId: string,
    trashId: string,
    confirmed: boolean,
  ) => Promise<ApiResult<ProjectTrashDeleteResult>>
  deleteRegionalGuidance: (
    tabId: string,
    owner: ProjectRegionalGuidanceOwner,
  ) => Promise<ApiResult<ProjectTab>>
  discardAndClose: (tabId: string, confirmCloseImpact?: boolean) => Promise<ApiResult<void>>
  discardSmartPatchGenerationResults: (
    tabId: string,
    request: ProjectSmartPatchDiscardRequest,
  ) => Promise<ApiResult<ProjectSmartPatchDiscardResult>>
  duplicateRegionalGuidance: (
    tabId: string,
    owner: ProjectRegionalGuidanceOwner,
  ) => Promise<ApiResult<ProjectTab>>
  editRegionalGuidanceMask: (
    tabId: string,
    regionId: string,
    request: ProjectRegionalGuidanceMaskEditRequest,
  ) => Promise<ApiResult<ProjectTab>>
  editSmartPatchMask: (
    tabId: string,
    layerId: string,
    request: ProjectSmartPatchMaskEditRequest,
  ) => Promise<ApiResult<ProjectTab>>
  exportImage: (
    tabId: string,
    region: ProjectImageExportRegion,
  ) => Promise<ApiResult<ProjectImageExportResult>>
  finishImport: (
    importId: string,
    choice: 'copy' | 'move',
    workspaceId?: string,
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
  getSmartPatchPresetApplicationReview: (
    tabId: string,
    request: SmartPatchPresetApplicationReviewRequest,
  ) => Promise<ApiResult<SmartPatchPresetApplicationReview>>
  getSmartPatchVariants: (
    tabId: string,
    layerId: string,
    documentId: string,
    documentRevision: string,
  ) => Promise<ApiResult<ProjectSmartPatchVariantsInspection>>
  /** Frozen accepted Smart settings versus the current Project Canvas. */
  getSmartResultComparisonData: (
    tabId: string,
    request: SmartResultComparisonRequest,
  ) => Promise<ApiResult<SmartResultComparisonData>>
  /** Frozen accepted Smart settings only; no current target or image worker is required. */
  getSmartResultPresetData: (
    tabId: string,
    request: SmartResultPresetRequest,
  ) => Promise<ApiResult<SmartResultPresetData>>
  importRasterImage: (tabId: string) => Promise<ApiResult<ProjectTab | null>>
  importRegionalGuidanceReferenceImage: (
    tabId: string,
    owner: ProjectRegionalGuidanceOwner,
  ) => Promise<ApiResult<ProjectTab | null>>
  list: (workspaceId?: string) => Promise<ApiResult<ProjectSummary[]>>
  listGenerationResults: (tabId: string) => Promise<ApiResult<ProjectGenerationResultsSnapshot>>
  listSmartPatchGenerationResults: (
    tabId: string,
  ) => Promise<ApiResult<ProjectSmartPatchResultsSnapshot>>
  listTrash: () => Promise<ApiResult<ProjectTrashSummary[]>>
  listWorkspaces: () => Promise<ApiResult<ProjectWorkspaceSummary[]>>
  locateProject: (projectId: string) => Promise<ApiResult<boolean>>
  locateWorkspace: (workspaceId: string) => Promise<ApiResult<boolean>>
  moveProject: (projectId: string, workspaceId: string) => Promise<ApiResult<ProjectMoveResult>>
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
  removeMissingProject: (projectId: string, confirmed: boolean) => Promise<ApiResult<void>>
  removeWorkspace: (workspaceId: string, confirmed: boolean) => Promise<ApiResult<void>>
  renameProject: (projectId: string, name: string) => Promise<ApiResult<ProjectRenameResult>>
  resolveRecovery: (
    projectId: string,
    decision: 'discard' | 'recover',
  ) => Promise<ApiResult<ProjectTab>>
  restoreProject: (projectId: string, trashId: string) => Promise<ApiResult<void>>
  retryGenerationJob: (review: GenerationQueueReview) => Promise<ApiResult<void>>
  revealProject: (projectId: string) => Promise<ApiResult<void>>
  revealWorkspace: (workspaceId: string) => Promise<ApiResult<void>>
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
  trashProject: (projectId: string) => Promise<ApiResult<void>>
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
  updateRegionalGuidance: (
    tabId: string,
    owner: ProjectRegionalGuidanceOwner,
    change: ProjectRegionalGuidanceChange,
  ) => Promise<ApiResult<ProjectTab>>
  updateRegionalGuidancePrompt: (
    tabId: string,
    owner: ProjectRegionalGuidanceOwner,
    change: ProjectRegionalGuidancePromptChange,
  ) => Promise<ApiResult<ProjectTab>>
  updateRegionalGuidanceReferenceImage: (
    tabId: string,
    owner: ProjectRegionalGuidanceOwner,
    change: ProjectRegionalGuidanceReferenceImageChange,
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
  updateWorkspace: (
    workspaceId: string,
    input: ProjectWorkspaceAddInput,
  ) => Promise<ApiResult<ProjectWorkspaceSummary>>
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
  onCatalogChanged: (listener: () => void) => () => void
  onInstallChanged: (listener: (job: ModelInstallJobView) => void) => () => void
  openModelFolder: () => Promise<ApiResult<void>>
  openSourceLink: (url: string) => Promise<ApiResult<void>>
  previewImport: (url: string) => Promise<ApiResult<ModelImportPreview>>
  removeLocalResource: (token: string, cancelPending?: boolean) => Promise<ApiResult<void>>
  removeToken: () => Promise<ApiResult<CivitaiTokenStatus>>
  reviewRemoval: (resourceId: string) => Promise<ApiResult<ModelRemovalReview>>
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

export function isProjectRegionalGuidanceMaskEditRequest(
  input: unknown,
): input is ProjectRegionalGuidanceMaskEditRequest {
  return isProjectSmartPatchMaskEditRequest(input) && input.edit.kind !== 'fit-bbox'
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
