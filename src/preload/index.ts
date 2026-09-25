import { ipcChannels } from '../shared/api.js'
import type {
  ApiError,
  ApiResult,
  CivitaiTokenStatus,
  ModelCatalogItem,
  ModelImportPreview,
  ModelInstallJobView,
  RuntimeStatus,
  StudioApi,
} from '../shared/api.js'

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
