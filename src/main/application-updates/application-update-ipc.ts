/**
 * Invoke launcher c267bdb439519216b277a7a8c6ad408b9d79efce updater.ts7/16 and
 * main-process-manager.ts167 own the upstream check/download caller. Studio adapts explicit actions
 * through its existing runtime-setup-ipc current-frame/document guard pattern. This protocol
 * accepts only the displayed version for Download, never feed/path or install capability.
 */
import { type ApiResult, ipcChannels } from '../../shared/api.js'
import {
  type ApplicationUpdateInstallationRequest,
  type ApplicationUpdateInstallPreview,
  type ApplicationUpdateSnapshot,
  isApplicationUpdateInstallationRequest,
  isApplicationUpdateInstallPreview,
  isApplicationUpdateSnapshot,
  isApplicationUpdateVersion,
} from '../../shared/application-updates.js'

import { ApplicationUpdateRecoveryRequiredError } from './application-update-service.js'

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
const recoveryRequired = () =>
  failure(
    'APPLICATION_UPDATE_RECOVERY_REQUIRED',
    'Application update recovery is required before installation. Your Projects remain open.',
  )

/** Getter is read-only. The service owns deduplication, metadata and every actual network check. */
export function registerApplicationUpdateIpc(
  registrar: Registrar,
  caller: Caller,
  service: Service,
  requestInstallation?: (
    availableVersion: string,
    isCurrent: () => boolean,
  ) => Promise<ApplicationUpdateInstallationRequest>,
): { dispose: () => void; invalidateDocument: () => void } {
  let disposed = false
  let epoch = {}
  let selectionEpoch = {}
  let reviewedVersion: string | null = null
  let installationPending = false
  const channels = [
    ipcChannels.applicationUpdates.getStatus,
    ipcChannels.applicationUpdates.install,
    ipcChannels.applicationUpdates.check,
    ipcChannels.applicationUpdates.download,
    ipcChannels.applicationUpdates.reviewInstallation,
  ]
  const invalidateDocument = () => {
    epoch = {}
    selectionEpoch = {}
    reviewedVersion = null
  }
  for (const channel of channels) {
    registrar.handle(channel, async (event, ...args) => {
      if (
        disposed ||
        (channel === ipcChannels.applicationUpdates.download ||
        channel === ipcChannels.applicationUpdates.install ||
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
      if (channel === ipcChannels.applicationUpdates.install) {
        if (installationPending || !requestInstallation || reviewedVersion !== args[0]) {
          return failure(
            'APPLICATION_UPDATE_INSTALL_FAILED',
            'The application could not start installation. Review the update and try again.',
          )
        }
        installationPending = true
        reviewedVersion = null
        try {
          // Unlike status reads, an Install side effect needs this guard AFTER preflight awaits,
          // immediately before Main requests normal close. A stale reply check cannot undo close.
          const result = await requestInstallation(args[0] as string, current)
          if (!current()) {
            return rejected()
          }
          return isApplicationUpdateInstallationRequest(result) &&
            result.availableVersion === args[0]
            ? { ok: true, value: structuredClone(result) }
            : invalid()
        } catch (error) {
          if (!current()) {
            return rejected()
          }
          return error instanceof ApplicationUpdateRecoveryRequiredError
            ? recoveryRequired()
            : failure(
                'APPLICATION_UPDATE_INSTALL_FAILED',
                'The application could not start installation. Review the update and try again.',
              )
        } finally {
          installationPending = false
        }
      }
      if (installationPending && channel !== ipcChannels.applicationUpdates.getStatus) {
        return failure(
          'APPLICATION_UPDATE_INSTALL_FAILED',
          'The application could not start installation. Review the update and try again.',
        )
      }
      if (channel !== ipcChannels.applicationUpdates.getStatus) {
        selectionEpoch = {}
        reviewedVersion = null
      }
      const observedSelection = selectionEpoch
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
        const valid = previewRequest
          ? isApplicationUpdateInstallPreview(snapshot) && snapshot.availableVersion === args[0]
          : isApplicationUpdateSnapshot(snapshot)
        if (!valid) {
          return invalid()
        }
        if (
          previewRequest &&
          observedSelection === selectionEpoch &&
          isApplicationUpdateInstallPreview(snapshot) &&
          snapshot.installationAvailable
        ) {
          reviewedVersion = snapshot.availableVersion
        }
        return { ok: true, value: structuredClone(snapshot) }
      } catch (error) {
        if (!current()) {
          return rejected()
        }
        if (error instanceof ApplicationUpdateRecoveryRequiredError) {
          return recoveryRequired()
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
