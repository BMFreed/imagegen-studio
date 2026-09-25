/** The phase-0 renderer contract. System APIs remain in Electron main. */
export const ipcChannels = {
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

export interface RuntimeApi {
  getStatus: () => Promise<ApiResult<RuntimeStatus>>
  install: () => Promise<ApiResult<RuntimeStatus>>
  onStatusChanged: (listener: (status: RuntimeStatus) => void) => () => void
  repair: () => Promise<ApiResult<RuntimeStatus>>
}

export interface StudioApi {
  runtime: RuntimeApi
}

declare global {
  interface Window {
    api: StudioApi
  }
}
