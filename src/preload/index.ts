import { ipcChannels } from '../shared/api.js'
import type {
  ApiError,
  ApiResult,
  CivitaiTokenStatus,
  ModelCatalogItem,
  ModelImportPreview,
  ModelInstallJobView,
  ProjectImportFinishResult,
  ProjectImportSelection,
  ProjectOpenResult,
  ProjectRasterLayerView,
  ProjectRebuildResult,
  ProjectSaveResult,
  ProjectSummary,
  ProjectTab,
  RuntimeStatus,
  StudioApi,
} from '../shared/api.js'
import { IGS_SAFETY_CEILINGS } from '../shared/projects/project-schema.js'
import type { IgsRectV1 } from '../shared/projects/project-schema.js'

import { contextBridge, ipcRenderer } from 'electron'

const runtimeKinds = new Set<RuntimeStatus['kind']>([
  'needs-repair',
  'not-installed',
  'ready',
  'unsupported',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isRuntimeStatus(value: unknown): value is RuntimeStatus {
  if (!isRecord(value)) {
    return false
  }

  return (
    runtimeKinds.has(value.kind as RuntimeStatus['kind']) &&
    (value.profile === 'linux-nvidia' || value.profile === null) &&
    typeof value.detail === 'string' &&
    (value.runtimeId === undefined || typeof value.runtimeId === 'string')
  )
}

function isApiError(value: unknown): value is ApiError {
  return isRecord(value) && typeof value.code === 'string' && typeof value.message === 'string'
}

function isRuntimeResult(value: unknown): value is ApiResult<RuntimeStatus> {
  if (!isRecord(value)) {
    return false
  }
  if (value.ok === true) {
    return isRuntimeStatus(value.value)
  }
  if (value.ok === false) {
    return isApiError(value.error)
  }
  return false
}

async function invokeRuntime(
  channel:
    | typeof ipcChannels.runtime.getStatus
    | typeof ipcChannels.runtime.install
    | typeof ipcChannels.runtime.repair,
): Promise<ApiResult<RuntimeStatus>> {
  try {
    const result: unknown = await ipcRenderer.invoke(channel)
    if (isRuntimeResult(result)) {
      return result
    }
    return {
      error: {
        code: 'IPC_INVALID_RESPONSE',
        message: 'The application returned an invalid runtime status.',
      },
      ok: false,
    }
  } catch {
    return {
      error: {
        code: 'IPC_UNAVAILABLE',
        message: 'The application could not reach the runtime service.',
      },
      ok: false,
    }
  }
}

function isTokenStatus(value: unknown): value is CivitaiTokenStatus {
  return (
    isRecord(value) &&
    ['connected', 'failed', 'missing', 'unavailable'].includes(String(value.kind)) &&
    typeof value.detail === 'string'
  )
}

function isModelCatalog(value: unknown): value is ModelCatalogItem[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        isRecord(item) &&
        typeof item.id === 'string' &&
        typeof item.name === 'string' &&
        Array.isArray(item.versions) &&
        item.versions.every(
          (version: unknown) =>
            isRecord(version) &&
            typeof version.id === 'string' &&
            typeof version.name === 'string' &&
            typeof version.fileName === 'string',
        ),
    )
  )
}

function isModelImportPreview(value: unknown): value is ModelImportPreview {
  if (!isRecord(value) || typeof value.modelId !== 'number') {
    return false
  }
  if (value.kind === 'select-version') {
    return Array.isArray(value.versions)
  }
  return (
    value.kind === 'select-file' &&
    typeof value.previewId === 'string' &&
    typeof value.versionId === 'number' &&
    Array.isArray(value.files) &&
    Array.isArray(value.dependencies)
  )
}

function isModelInstallJob(value: unknown): value is ModelInstallJobView {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.modelName === 'string' &&
    typeof value.versionName === 'string' &&
    typeof value.bytesDownloaded === 'number' &&
    ['canceled', 'completed', 'downloading', 'failed', 'verifying', 'waiting'].includes(
      String(value.status),
    )
  )
}

async function invokeModel<T>(
  channel: string,
  args: unknown[],
  isValue: (value: unknown) => value is T,
): Promise<ApiResult<T>> {
  try {
    const result: unknown = await ipcRenderer.invoke(channel, ...args)
    if (isRecord(result) && result.ok === true && isValue(result.value)) {
      return { ok: true, value: result.value }
    }
    if (isRecord(result) && result.ok === false && isApiError(result.error)) {
      return { error: result.error, ok: false }
    }
    return {
      error: {
        code: 'IPC_INVALID_RESPONSE',
        message: 'The model service returned an invalid response.',
      },
      ok: false,
    }
  } catch {
    return {
      error: {
        code: 'IPC_UNAVAILABLE',
        message: 'The application could not reach the model service.',
      },
      ok: false,
    }
  }
}

function isVoid(value: unknown): value is void {
  return value === undefined
}

function isProjectId(value: unknown): value is string {
  return typeof value === 'string' && /^project-v1-[a-f0-9]{64}$/.test(value)
}

function isProjectDimension(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= IGS_SAFETY_CEILINGS.rasterDimension
  )
}

function isProjectDimensions(value: unknown): value is Pick<IgsRectV1, 'height' | 'width'> {
  return isRecord(value) && isProjectDimension(value.width) && isProjectDimension(value.height)
}

function isProjectRect(value: unknown): value is IgsRectV1 {
  if (!isRecord(value)) {
    return false
  }
  const { height, width, x, y } = value
  return (
    typeof x === 'number' &&
    Number.isSafeInteger(x) &&
    Math.abs(x) <= IGS_SAFETY_CEILINGS.coordinateMagnitude &&
    typeof y === 'number' &&
    Number.isSafeInteger(y) &&
    Math.abs(y) <= IGS_SAFETY_CEILINGS.coordinateMagnitude &&
    isProjectDimension(width) &&
    isProjectDimension(height)
  )
}

function isProjectTab(value: unknown): value is ProjectTab {
  return (
    isRecord(value) &&
    isProjectId(value.id) &&
    typeof value.title === 'string' &&
    isProjectRect(value.primaryBbox) &&
    Array.isArray(value.layers) &&
    value.layers.every(isProjectRasterLayerView) &&
    typeof value.dirty === 'boolean' &&
    (value.autosaveError === null || typeof value.autosaveError === 'string') &&
    (value.storageWarning === undefined || typeof value.storageWarning === 'string')
  )
}

function isProjectRasterLayerView(value: unknown): value is ProjectRasterLayerView {
  if (!isRecord(value) || !isRecord(value.transform)) {
    return false
  }
  const transform = value.transform
  return (
    typeof value.id === 'string' &&
    /^[a-f0-9-]{36}$/i.test(value.id) &&
    typeof value.name === 'string' &&
    typeof value.imageUrl === 'string' &&
    value.imageUrl.startsWith('igs-layer://asset/') &&
    typeof value.visible === 'boolean' &&
    typeof value.locked === 'boolean' &&
    typeof value.opacity === 'number' &&
    Number.isFinite(value.opacity) &&
    value.opacity >= 0 &&
    value.opacity <= 1 &&
    ['multiply', 'normal', 'overlay', 'screen'].includes(String(value.blendMode)) &&
    isProjectDimension(value.width) &&
    isProjectDimension(value.height) &&
    ['x', 'y', 'scaleX', 'scaleY', 'rotationDegrees'].every(
      (key) => typeof transform[key] === 'number' && Number.isFinite(transform[key]),
    )
  )
}

function isProjectImportSelection(value: unknown): value is ProjectImportSelection | null {
  if (value === null) {
    return true
  }
  return (
    isRecord(value) &&
    ((value.kind === 'opened' && isProjectOpenResult(value.result)) ||
      (value.kind === 'transfer-required' &&
        typeof value.importId === 'string' &&
        /^[a-f0-9-]{36}$/i.test(value.importId) &&
        typeof value.fileName === 'string' &&
        typeof value.title === 'string'))
  )
}

function isProjectImportFinishResult(value: unknown): value is ProjectImportFinishResult {
  return (
    isRecord(value) &&
    isProjectOpenResult(value.result) &&
    typeof value.sourceRetained === 'boolean' &&
    (value.warning === undefined || typeof value.warning === 'string')
  )
}

function isProjectSummary(value: unknown): value is ProjectSummary {
  return (
    isRecord(value) &&
    isProjectId(value.id) &&
    typeof value.title === 'string' &&
    ['corrupt', 'missing', 'ready', 'unsupported_schema'].includes(String(value.health)) &&
    (value.previewStatus === null ||
      ['empty', 'rendered', 'unavailable'].includes(String(value.previewStatus))) &&
    (value.thumbnailUrl === null || isProjectThumbnailUrl(value.thumbnailUrl)) &&
    (value.bbox === null || isProjectDimensions(value.bbox)) &&
    ['invalid', 'none', 'recoverable', 'stale'].includes(String(value.recoveryStatus)) &&
    (value.recoveryReason === undefined || typeof value.recoveryReason === 'string')
  )
}

function isProjectThumbnailUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value.startsWith('igs-preview://thumbnail/')) {
    return false
  }
  try {
    const url = new URL(value)
    return (
      url.protocol === 'igs-preview:' &&
      url.hostname === 'thumbnail' &&
      /^\/project-v1-[a-f0-9]{64}\/[a-f0-9]{64}\/[a-f0-9]{64}\.webp$/.test(url.pathname) &&
      url.username === '' &&
      url.password === '' &&
      url.port === '' &&
      url.hash === '' &&
      url.search === ''
    )
  } catch {
    return false
  }
}

function isProjectOpenResult(value: unknown): value is ProjectOpenResult {
  if (!isRecord(value)) {
    return false
  }
  if (value.kind === 'opened') {
    return isProjectTab(value.tab)
  }
  return (
    value.kind === 'recovery-required' &&
    isProjectId(value.projectId) &&
    typeof value.reason === 'string' &&
    ['invalid', 'recoverable', 'stale'].includes(String(value.recoveryStatus))
  )
}

function isProjectSaveResult(value: unknown): value is ProjectSaveResult {
  return (
    isRecord(value) &&
    isProjectTab(value.tab) &&
    value.committed === true &&
    typeof value.directorySynced === 'boolean' &&
    typeof value.reloadRequired === 'boolean' &&
    ['clean', 'dirty', 'failed'].includes(String(value.recoveryStatus)) &&
    (value.recoveryError === undefined || typeof value.recoveryError === 'string') &&
    (value.indexWarning === undefined || typeof value.indexWarning === 'string')
  )
}

function isProjectRebuildResult(value: unknown): value is ProjectRebuildResult {
  return (
    isRecord(value) &&
    value.committed === true &&
    typeof value.directorySynced === 'boolean' &&
    (value.indexWarning === undefined || typeof value.indexWarning === 'string')
  )
}

async function invokeProject<T>(
  channel: string,
  args: unknown[],
  isValue: (value: unknown) => value is T,
): Promise<ApiResult<T>> {
  try {
    const result: unknown = await ipcRenderer.invoke(channel, ...args)
    if (isRecord(result) && result.ok === true && isValue(result.value)) {
      return { ok: true, value: result.value }
    }
    if (isRecord(result) && result.ok === false && isApiError(result.error)) {
      return { error: result.error, ok: false }
    }
    return {
      error: {
        code: 'IPC_INVALID_RESPONSE',
        message: 'The Project service returned an invalid response.',
      },
      ok: false,
    }
  } catch {
    return {
      error: {
        code: 'IPC_UNAVAILABLE',
        message: 'The application could not reach the Project service.',
      },
      ok: false,
    }
  }
}

const api: StudioApi = {
  models: {
    cancelInstall: (jobId) =>
      invokeModel(ipcChannels.models.cancelInstall, [jobId], isModelInstallJob),
    checkUpdates: (modelId) =>
      invokeModel(
        ipcChannels.models.checkUpdates,
        [modelId],
        (value): value is { availableVersions: { id: number; name: string }[] } =>
          isRecord(value) && Array.isArray(value.availableVersions),
      ),
    getCatalog: () => invokeModel(ipcChannels.models.getCatalog, [], isModelCatalog),
    getInstallJobs: () =>
      invokeModel(
        ipcChannels.models.getInstallJobs,
        [],
        (value): value is ModelInstallJobView[] =>
          Array.isArray(value) && value.every(isModelInstallJob),
      ),
    getStorageSummary: () =>
      invokeModel(
        ipcChannels.models.getStorageSummary,
        [],
        (value): value is { totalBytes: number } =>
          isRecord(value) &&
          typeof value.totalBytes === 'number' &&
          Number.isFinite(value.totalBytes) &&
          value.totalBytes >= 0,
      ),
    getTokenStatus: () => invokeModel(ipcChannels.models.getTokenStatus, [], isTokenStatus),
    onInstallChanged(listener) {
      const handler = (_event: Electron.IpcRendererEvent, job: unknown): void => {
        if (isModelInstallJob(job)) {
          listener(job)
        }
      }
      ipcRenderer.on(ipcChannels.models.installChanged, handler)
      return () => ipcRenderer.removeListener(ipcChannels.models.installChanged, handler)
    },
    openModelFolder: () => invokeModel(ipcChannels.models.openModelFolder, [], isVoid),
    openSourceLink: (url) => invokeModel(ipcChannels.models.openSourceLink, [url], isVoid),
    previewImport: (url) =>
      invokeModel(ipcChannels.models.previewImport, [url], isModelImportPreview),
    removeToken: () => invokeModel(ipcChannels.models.removeToken, [], isTokenStatus),
    saveToken: (token) => invokeModel(ipcChannels.models.saveToken, [token], isTokenStatus),
    setDefaultVersion: (resourceId, versionId) =>
      invokeModel(ipcChannels.models.setDefaultVersion, [resourceId, versionId], isVoid),
    startInstall: (previewId, fileId, acceptedAnimaLicense) =>
      invokeModel(
        ipcChannels.models.startInstall,
        [previewId, fileId, acceptedAnimaLicense],
        isModelInstallJob,
      ),
  },
  projects: {
    cancelImport: (importId) =>
      invokeProject(ipcChannels.projects.cancelImport, [importId], isVoid),
    close: (tabId) => invokeProject(ipcChannels.projects.close, [tabId], isVoid),
    create: (options) => invokeProject(ipcChannels.projects.create, [options], isProjectTab),
    discardAndClose: (tabId) =>
      invokeProject(ipcChannels.projects.discardAndClose, [tabId], isVoid),
    finishImport: (importId, choice) =>
      invokeProject(
        ipcChannels.projects.finishImport,
        [importId, choice],
        isProjectImportFinishResult,
      ),
    importRasterImage: (tabId) =>
      invokeProject(
        ipcChannels.projects.importRasterImage,
        [tabId],
        (value): value is ProjectTab | null => value === null || isProjectTab(value),
      ),
    list: () =>
      invokeProject(
        ipcChannels.projects.list,
        [],
        (value): value is ProjectSummary[] => Array.isArray(value) && value.every(isProjectSummary),
      ),
    moveRasterLayer: (tabId, layerId, targetIndex) =>
      invokeProject(
        ipcChannels.projects.moveRasterLayer,
        [tabId, layerId, targetIndex],
        isProjectTab,
      ),
    onTabsChanged(listener) {
      const handler = (_event: Electron.IpcRendererEvent, tabs: unknown): void => {
        if (Array.isArray(tabs) && tabs.every(isProjectTab)) {
          listener(tabs)
        }
      }
      ipcRenderer.on(ipcChannels.projects.tabsChanged, handler)
      return () => ipcRenderer.removeListener(ipcChannels.projects.tabsChanged, handler)
    },
    open: (projectId) => invokeProject(ipcChannels.projects.open, [projectId], isProjectOpenResult),
    rebuildPreview: (projectId) =>
      invokeProject(ipcChannels.projects.rebuildPreview, [projectId], isProjectRebuildResult),
    resolveRecovery: (projectId, decision) =>
      invokeProject(ipcChannels.projects.resolveRecovery, [projectId, decision], isProjectTab),
    save: (tabId) => invokeProject(ipcChannels.projects.save, [tabId], isProjectSaveResult),
    selectImport: () =>
      invokeProject(ipcChannels.projects.selectImport, [], isProjectImportSelection),
    setPrimaryBbox: (tabId, rect) =>
      invokeProject(ipcChannels.projects.setPrimaryBbox, [tabId, rect], isProjectTab),
    updateRasterLayer: (tabId, layerId, change) =>
      invokeProject(ipcChannels.projects.updateRasterLayer, [tabId, layerId, change], isProjectTab),
  },
  runtime: {
    getStatus: () => invokeRuntime(ipcChannels.runtime.getStatus),
    install: () => invokeRuntime(ipcChannels.runtime.install),
    onStatusChanged(listener) {
      const handler = (_event: Electron.IpcRendererEvent, status: unknown): void => {
        if (isRuntimeStatus(status)) {
          listener(status)
        }
      }
      ipcRenderer.on(ipcChannels.runtime.statusChanged, handler)
      return () => ipcRenderer.removeListener(ipcChannels.runtime.statusChanged, handler)
    },
    repair: () => invokeRuntime(ipcChannels.runtime.repair),
  },
}

contextBridge.exposeInMainWorld('api', api)
