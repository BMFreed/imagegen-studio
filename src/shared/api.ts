import type { IgsProjectDocumentV1, IgsRectV1 } from './projects/project-schema.js'

import { isIllustriousSamplingDraftPair } from './projects/illustrious-scheduler.js'
import { IGS_SAFETY_CEILINGS } from './projects/project-schema.js'

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
    setPredictionType: 'models:set-prediction-type',
    startInstall: 'models:start-install',
  },
  projects: {
    acceptGenerationCandidates: 'projects:accept-generation-candidates',
    addGenerationLora: 'projects:add-generation-lora',
    cancelImport: 'projects:cancel-import',
    clearHistory: 'projects:clear-history',
    close: 'projects:close',
    create: 'projects:create',
    discardAndClose: 'projects:discard-and-close',
    finishImport: 'projects:finish-import',
    getCloseImpact: 'projects:get-close-impact',
    importRasterImage: 'projects:import-raster-image',
    list: 'projects:list',
    listGenerationResults: 'projects:list-generation-results',
    moveRasterLayer: 'projects:move-raster-layer',
    open: 'projects:open',
    prepareWindowClose: 'projects:prepare-window-close',
    rebuildPreview: 'projects:rebuild-preview',
    redo: 'projects:redo',
    relinkGenerationLora: 'projects:relink-generation-lora',
    relinkGenerationModel: 'projects:relink-generation-model',
    removeGenerationLora: 'projects:remove-generation-lora',
    resolveRecovery: 'projects:resolve-recovery',
    save: 'projects:save',
    saveGenerationCandidateImage: 'projects:save-generation-candidate-image',
    sealPromptHistory: 'projects:seal-prompt-history',
    selectImport: 'projects:select-import',
    setGenerationModel: 'projects:set-generation-model',
    setPrimaryBbox: 'projects:set-primary-bbox',
    tabsChanged: 'projects:tabs-changed',
    undo: 'projects:undo',
    updateGenerationDraft: 'projects:update-generation-draft',
    updateRasterLayer: 'projects:update-raster-layer',
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

export interface ProjectSummary {
  bbox: Pick<IgsRectV1, 'height' | 'width'> | null
  health: 'corrupt' | 'missing' | 'ready' | 'unsupported_schema'
  id: string
  previewStatus: 'empty' | 'rendered' | 'unavailable' | null
  recoveryReason?: string
  recoveryStatus: 'invalid' | 'none' | 'recoverable' | 'stale'
  thumbnailUrl: string | null
  title: string
}

export interface ProjectTab {
  autosaveError: string | null
  canRedo: boolean
  canUndo: boolean
  dirty: boolean
  generationDraft: IgsProjectDocumentV1['generationDraft']
  id: string
  lastActualSeedSnapshot: IgsProjectDocumentV1['lastActualSeedSnapshot']
  layers: ProjectRasterLayerView[]
  primaryBbox: IgsRectV1
  storageWarning?: string
  title: string
}

export interface ProjectRasterLayerView {
  blendMode: 'multiply' | 'normal' | 'overlay' | 'screen'
  height: number
  id: string
  imageUrl: string
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

export type ProjectRasterLayerChange =
  | { blendMode: ProjectRasterLayerView['blendMode']; kind: 'blend-mode' }
  | { kind: 'lock'; locked: boolean }
  | { kind: 'opacity'; opacity: number }
  | { kind: 'visibility'; visible: boolean }

export interface ProjectLoraIdentity {
  resourceId: string
  versionId: string
}

export type ProjectGenerationDraftChange =
  | (ProjectLoraIdentity & { kind: 'lora-enabled'; value: boolean })
  | (ProjectLoraIdentity & { kind: 'lora-weight'; value: number })
  | { kind: 'negative-prompt' | 'positive-prompt'; text: string }
  | { kind: 'sampling-cfg-scale'; value: number | null }
  | { kind: 'sampling-pair'; sampler: string | null; scheduler: string | null }
  | { kind: 'sampling-steps'; value: number | null }
  | { kind: 'seed'; policy: 'fixed'; value: number }
  | { kind: 'seed'; policy: 'random' | 'reuse'; value: null }

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
}

export interface ProjectGenerationResultsSnapshot {
  candidates: ProjectGenerationResultView[]
  /** Local completed seed for the currently open document, independent of candidate retention. */
  lastActualSeed: number | null
  recoveryUnavailable: boolean
}

export type ProjectCandidateExportResult =
  { fileName: string; kind: 'saved' } | { kind: 'canceled' }

export interface ProjectApi {
  acceptGenerationCandidates: (
    tabId: string,
    candidateIds: string[],
    focusedCandidateId: string | null,
    expectedAvailableIds: string[],
  ) => Promise<ApiResult<ProjectTab>>
  addGenerationLora: (
    tabId: string,
    selection: NonNullable<ProjectGenerationModelSelection>,
  ) => Promise<ApiResult<ProjectTab>>
  cancelImport: (importId: string) => Promise<ApiResult<void>>
  clearHistory: (tabId: string) => Promise<ApiResult<ProjectTab>>
  close: (tabId: string, confirmCloseImpact?: boolean) => Promise<ApiResult<void>>
  create: (options: {
    height: number
    title: string
    width: number
  }) => Promise<ApiResult<ProjectTab>>
  discardAndClose: (tabId: string, confirmCloseImpact?: boolean) => Promise<ApiResult<void>>
  finishImport: (
    importId: string,
    choice: 'copy' | 'move',
  ) => Promise<ApiResult<ProjectImportFinishResult>>
  getCloseImpact: (tabId: string) => Promise<ApiResult<ProjectCloseImpact>>
  importRasterImage: (tabId: string) => Promise<ApiResult<ProjectTab | null>>
  list: () => Promise<ApiResult<ProjectSummary[]>>
  listGenerationResults: (tabId: string) => Promise<ApiResult<ProjectGenerationResultsSnapshot>>
  moveRasterLayer: (
    tabId: string,
    layerId: string,
    targetIndex: number,
  ) => Promise<ApiResult<ProjectTab>>
  onBeforeWindowClose: (listener: () => Promise<void>, onCanceled: () => void) => () => void
  onTabsChanged: (listener: (tabs: ProjectTab[]) => void) => () => void
  open: (projectId: string) => Promise<ApiResult<ProjectOpenResult>>
  rebuildPreview: (projectId: string) => Promise<ApiResult<ProjectRebuildResult>>
  redo: (tabId: string) => Promise<ApiResult<ProjectTab>>
  relinkGenerationLora: (
    tabId: string,
    identity: ProjectLoraIdentity,
  ) => Promise<ApiResult<ProjectTab>>
  relinkGenerationModel: (tabId: string) => Promise<ApiResult<ProjectTab>>
  removeGenerationLora: (
    tabId: string,
    identity: ProjectLoraIdentity,
  ) => Promise<ApiResult<ProjectTab>>
  resolveRecovery: (
    projectId: string,
    decision: 'discard' | 'recover',
  ) => Promise<ApiResult<ProjectTab>>
  save: (tabId: string) => Promise<ApiResult<ProjectSaveResult>>
  saveGenerationCandidateImage: (
    tabId: string,
    candidateId: string,
  ) => Promise<ApiResult<ProjectCandidateExportResult>>
  sealPromptHistory: (tabId: string, historyGroupId?: string) => Promise<ApiResult<ProjectTab>>
  selectImport: () => Promise<ApiResult<ProjectImportSelection | null>>
  setGenerationModel: (
    tabId: string,
    selection: ProjectGenerationModelSelection,
  ) => Promise<ApiResult<ProjectTab>>
  setPrimaryBbox: (tabId: string, rect: IgsRectV1) => Promise<ApiResult<ProjectTab>>
  undo: (tabId: string) => Promise<ApiResult<ProjectTab>>
  updateGenerationDraft: (
    tabId: string,
    change: ProjectGenerationDraftChange,
    historyGroupId?: string,
  ) => Promise<ApiResult<ProjectTab>>
  updateRasterLayer: (
    tabId: string,
    layerId: string,
    change: ProjectRasterLayerChange,
  ) => Promise<ApiResult<ProjectTab>>
}

export type ModelResourceType = 'checkpoint' | 'embedding' | 'lora' | 'upscaler' | 'vae'

export type BaseModelFamily = 'anima' | 'illustrious'
export type ModelFileStatus = 'corrupt' | 'missing' | 'ready'
export type IllustriousPredictionType = 'epsilon' | 'v_prediction'
export interface ModelVersionView {
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
  predictionType: 'epsilon' | 'sample' | 'v_prediction' | null
  predictionTypeSource?: 'default' | 'manifest' | 'not-applicable' | 'user'
  sha256: string
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
  projects: ProjectApi
  runtime: RuntimeApi
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
  if (value.kind === 'lora-enabled' || value.kind === 'lora-weight') {
    return (
      keys.length === 4 &&
      keys.includes('value') &&
      isProjectLoraIdentity({ resourceId: value.resourceId, versionId: value.versionId }) &&
      (value.kind === 'lora-enabled'
        ? typeof value.value === 'boolean'
        : typeof value.value === 'number' && Number.isFinite(value.value))
    )
  }
  if (value.kind === 'positive-prompt' || value.kind === 'negative-prompt') {
    return (
      keys.length === 2 &&
      keys.includes('kind') &&
      keys.includes('text') &&
      typeof value.text === 'string' &&
      value.text.length <= IGS_SAFETY_CEILINGS.textBytes &&
      new TextEncoder().encode(value.text).length <= IGS_SAFETY_CEILINGS.textBytes
    )
  }
  if (value.kind === 'sampling-steps' || value.kind === 'sampling-cfg-scale') {
    if (keys.length !== 2 || !keys.includes('kind') || !keys.includes('value')) {
      return false
    }
    if (value.value === null) {
      return true
    }
    return value.kind === 'sampling-steps'
      ? typeof value.value === 'number' && Number.isSafeInteger(value.value) && value.value >= 1
      : typeof value.value === 'number' && Number.isFinite(value.value) && value.value >= 0
  }
  if (value.kind === 'sampling-pair') {
    return (
      keys.length === 3 &&
      keys.includes('kind') &&
      keys.includes('sampler') &&
      keys.includes('scheduler') &&
      isIllustriousSamplingDraftPair(value.sampler, value.scheduler)
    )
  }
  if (
    value.kind !== 'seed' ||
    keys.length !== 3 ||
    !keys.includes('policy') ||
    !keys.includes('value')
  ) {
    return false
  }
  return value.policy === 'fixed'
    ? typeof value.value === 'number' &&
        Number.isSafeInteger(value.value) &&
        value.value >= 0 &&
        value.value <= 0xff_ff_ff_ff
    : (value.policy === 'random' || value.policy === 'reuse') && value.value === null
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
    typeof value.resourceId === 'string' &&
    typeof value.versionId === 'string' &&
    uuid.test(value.resourceId) &&
    uuid.test(value.versionId)
  )
}

export function isProjectRasterLayerChange(input: unknown): input is ProjectRasterLayerChange {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return false
  }
  const value = input as Record<string, unknown>
  const keys = Object.keys(value)
  return (
    (value.kind === 'visibility' &&
      keys.length === 2 &&
      keys.includes('kind') &&
      keys.includes('visible') &&
      typeof value.visible === 'boolean') ||
    (value.kind === 'lock' &&
      keys.length === 2 &&
      keys.includes('kind') &&
      keys.includes('locked') &&
      typeof value.locked === 'boolean') ||
    (value.kind === 'opacity' &&
      keys.length === 2 &&
      keys.includes('kind') &&
      keys.includes('opacity') &&
      typeof value.opacity === 'number' &&
      Number.isFinite(value.opacity) &&
      value.opacity >= 0 &&
      value.opacity <= 1) ||
    (value.kind === 'blend-mode' &&
      keys.length === 2 &&
      keys.includes('kind') &&
      keys.includes('blendMode') &&
      typeof value.blendMode === 'string' &&
      ['multiply', 'normal', 'overlay', 'screen'].includes(value.blendMode))
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
    typeof value.resourceId === 'string' &&
    value.resourceId.trim().length > 0 &&
    new TextEncoder().encode(value.resourceId).length <= IGS_SAFETY_CEILINGS.titleBytes &&
    typeof value.versionId === 'string' &&
    value.versionId.trim().length > 0 &&
    new TextEncoder().encode(value.versionId).length <= IGS_SAFETY_CEILINGS.titleBytes
  )
}
