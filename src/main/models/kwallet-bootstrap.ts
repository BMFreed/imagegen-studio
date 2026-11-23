import { spawn } from 'node:child_process'

export type KWalletBootstrapResult = 'canceled' | 'ready' | 'timeout' | 'unavailable'

/** The helper owns the native password prompt. Its only reply is an exit code. */
export function bootstrapKWallet(
  executable: string,
  signal: AbortSignal,
): Promise<KWalletBootstrapResult> {
  if (signal.aborted) {
    return Promise.resolve('canceled')
  }
  const address = process.env.DBUS_SESSION_BUS_ADDRESS
  if (!address) {
    return Promise.resolve('unavailable')
  }
  return new Promise((resolve) => {
    const child = spawn(executable, [], {
      env: { DBUS_SESSION_BUS_ADDRESS: address },
      stdio: 'ignore',
    })
    let timedOut = false
    let forceStop: NodeJS.Timeout | undefined
    const stop = () => {
      if (!forceStop) {
        child.kill('SIGTERM')
        // Allow the active D-Bus call and the best-effort dismissal to settle.
        forceStop = setTimeout(() => child.kill('SIGKILL'), 6000)
      }
    }
    const deadline = setTimeout(() => {
      timedOut = true
      stop()
    }, 65_000)
    signal.addEventListener('abort', stop, { once: true })
    // A failed spawn emits error followed by close. The quit barrier waits for close.
    child.on('error', () => undefined)
    child.once('close', (code) => {
      signal.removeEventListener('abort', stop)
      clearTimeout(deadline)
      clearTimeout(forceStop)
      if (signal.aborted) {
        resolve('canceled')
      } else if (timedOut || code === 3) {
        resolve('timeout')
      } else if (code === 2) {
        resolve('canceled')
      } else {
        resolve(code === 0 ? 'ready' : 'unavailable')
      }
    })
  })
}
