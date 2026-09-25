import type { IgsRectV1 } from './projects/project-schema.js'

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
    startInstall: 'models:start-install',
  },
  projects: {
    cancelImport: 'projects:cancel-import',
    close: 'projects:close',
    create: 'projects:create',
    discardAndClose: 'projects:discard-and-close',
    finishImport: 'projects:finish-import',
    list: 'projects:list',
    open: 'projects:open',
    resolveRecovery: 'projects:resolve-recovery',
    save: 'projects:save',
    selectImport: 'projects:select-import',
    setPrimaryBbox: 'projects:set-primary-bbox',
    tabsChanged: 'projects:tabs-changed',
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
  title: string
}

export interface ProjectTab {
  autosaveError: string | null
  dirty: boolean
  id: string
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

export interface ProjectApi {
  cancelImport: (importId: string) => Promise<ApiResult<void>>
  close: (tabId: string) => Promise<ApiResult<void>>
  create: (options: {
    height: number
    title: string
    width: number
  }) => Promise<ApiResult<ProjectTab>>
  discardAndClose: (tabId: string) => Promise<ApiResult<void>>
  finishImport: (
    importId: string,
    choice: 'copy' | 'move',
  ) => Promise<ApiResult<ProjectImportFinishResult>>
  list: () => Promise<ApiResult<ProjectSummary[]>>
  onTabsChanged: (listener: (tabs: ProjectTab[]) => void) => () => void
  open: (projectId: string) => Promise<ApiResult<ProjectOpenResult>>
  resolveRecovery: (
    projectId: string,
    decision: 'discard' | 'recover',
  ) => Promise<ApiResult<ProjectTab>>
  save: (tabId: string) => Promise<ApiResult<ProjectSaveResult>>
  selectImport: () => Promise<ApiResult<ProjectImportSelection | null>>
  setPrimaryBbox: (tabId: string, rect: IgsRectV1) => Promise<ApiResult<ProjectTab>>
}

export type ModelResourceType = 'checkpoint' | 'embedding' | 'lora' | 'upscaler' | 'vae'
export type BaseModelFamily = 'anima' | 'illustrious'
export type ModelFileStatus = 'corrupt' | 'missing' | 'ready'

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
  sha256: string
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

declare global {
  interface Window {
    api: StudioApi
  }
}
