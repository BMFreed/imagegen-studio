/**
 * Invoke launcher c267bdb439519216b277a7a8c6ad408b9d79efce updater.ts7/16 and
 * main-process-manager.ts167 own the upstream check/caller. Studio adapts only explicit checks
 * through its existing runtime-setup-ipc current-frame/document guard pattern. This protocol
 * accepts no feed, download or install capability.
 */
import { type ApiResult, ipcChannels } from '../../shared/api.js'
import {
  type ApplicationUpdateSnapshot,
  isApplicationUpdateSnapshot,
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
  getStatus: () => ApplicationUpdateSnapshot
}

const failure = (code: string, message: string): ApiResult<ApplicationUpdateSnapshot> => ({
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
  const channels = [ipcChannels.applicationUpdates.getStatus, ipcChannels.applicationUpdates.check]
  const invalidateDocument = () => {
    epoch = {}
  }
  for (const channel of channels) {
    registrar.handle(channel, async (event, ...args) => {
      if (
        disposed ||
        args.length !== 0 ||
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
        const snapshot =
          channel === ipcChannels.applicationUpdates.check
            ? await service.check()
            : service.getStatus()
        if (!current()) {
          return rejected()
        }
        return isApplicationUpdateSnapshot(snapshot)
          ? { ok: true, value: structuredClone(snapshot) }
          : invalid()
      } catch {
        if (!current()) {
          return rejected()
        }
        return failure(
          'APPLICATION_UPDATE_CHECK_FAILED',
          'The application could not check for updates. Try again.',
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
