import { ipcChannels } from '../shared/api.js'
import type { ApiError, ApiResult, RuntimeStatus, StudioApi } from '../shared/api.js'

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

const api: StudioApi = {
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
