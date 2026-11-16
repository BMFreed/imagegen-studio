/**
 * Invoke launcher c267bdb439519216b277a7a8c6ad408b9d79efce updater.ts7/16 and
 * main-process-manager.ts167 own the upstream check/download caller. Studio adapts explicit actions
 * through its existing runtime-setup-ipc current-frame/document guard pattern. This protocol
 * accepts only the displayed version for Download, never feed/path or install capability.
 */
import { type ApiResult, ipcChannels } from '../../shared/api.js'
import {
  type ApplicationUpdateInstallPreview,
  type ApplicationUpdateSnapshot,
  isApplicationUpdateInstallPreview,
  isApplicationUpdateSnapshot,
  isApplicationUpdateVersion,
} from '../../shared/application-updates.js'

type Caller = { mainFrame: unknown }
type Request = { sender: unknown; senderFrame: unknown }
type Registrar = {
  handle: (
    channel: string,
    handler: (event: Request, ...args: unknown[]) => Promise<ApiResult<unknown>>,
  ) => void
  removeHandler?: (channel: string) => void
}
type Service = {
  check: () => Promise<ApplicationUpdateSnapshot>
  download: (availableVersion: string) => Promise<ApplicationUpdateSnapshot>
  getStatus: () => ApplicationUpdateSnapshot
  reviewInstallation: (availableVersion: string) => Promise<ApplicationUpdateInstallPreview>
}

const failure = (code: string, message: string): ApiResult<never> => ({
  error: { code, message },
  ok: false,
})
const rejected = () => failure('IPC_INVALID_CALLER', 'Application update request was rejected.')
const invalid = () =>
  failure('IPC_INVALID_RESPONSE', 'The application returned an invalid update status.')

/** Getter is read-only. The service owns deduplication, metadata and every actual network check. */
export function registerApplicationUpdateIpc(
  registrar: Registrar,
  caller: Caller,
  service: Service,
): { dispose: () => void; invalidateDocument: () => void } {
  let disposed = false
  let epoch = {}
  const channels = [
    ipcChannels.applicationUpdates.getStatus,
    ipcChannels.applicationUpdates.check,
    ipcChannels.applicationUpdates.download,
    ipcChannels.applicationUpdates.reviewInstallation,
  ]
  const invalidateDocument = () => {
    epoch = {}
  }
  for (const channel of channels) {
    registrar.handle(channel, async (event, ...args) => {
      if (
        disposed ||
        (channel === ipcChannels.applicationUpdates.download ||
        channel === ipcChannels.applicationUpdates.reviewInstallation
          ? args.length !== 1 || !isApplicationUpdateVersion(args[0])
          : args.length !== 0) ||
        event.sender !== caller ||
        event.senderFrame !== caller.mainFrame
      ) {
        return rejected()
      }
      const observedEpoch = epoch
      const current = () =>
        !disposed &&
        observedEpoch === epoch &&
        event.sender === caller &&
        event.senderFrame === caller.mainFrame
      try {
        const previewRequest = channel === ipcChannels.applicationUpdates.reviewInstallation
        const snapshot = previewRequest
          ? await service.reviewInstallation(args[0] as string)
          : channel === ipcChannels.applicationUpdates.download
            ? await service.download(args[0] as string)
            : channel === ipcChannels.applicationUpdates.check
              ? await service.check()
              : service.getStatus()
        if (!current()) {
          return rejected()
        }
        return (
          previewRequest
            ? isApplicationUpdateInstallPreview(snapshot) && snapshot.availableVersion === args[0]
            : isApplicationUpdateSnapshot(snapshot)
        )
          ? { ok: true, value: structuredClone(snapshot) }
          : invalid()
      } catch {
        if (!current()) {
          return rejected()
        }
        return failure(
          channel === ipcChannels.applicationUpdates.reviewInstallation
            ? 'APPLICATION_UPDATE_PREVIEW_FAILED'
            : channel === ipcChannels.applicationUpdates.download
              ? 'APPLICATION_UPDATE_DOWNLOAD_FAILED'
              : 'APPLICATION_UPDATE_CHECK_FAILED',
          channel === ipcChannels.applicationUpdates.reviewInstallation
            ? 'The application could not review installation impact. Try again.'
            : channel === ipcChannels.applicationUpdates.download
              ? 'The application could not download the update. Try again.'
              : 'The application could not check for updates. Try again.',
        )
      }
    })
  }
  return {
    dispose: () => {
      disposed = true
      invalidateDocument()
      for (const channel of channels) {
        registrar.removeHandler?.(channel)
      }
    },
    invalidateDocument,
  }
}
