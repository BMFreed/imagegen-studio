/**
 * Fresh donors: InvokeAI4875d96531ca6712b288f6e660fcbb34143408c1 invoker.py:stop and
 * session_processor_default.py:stop; launcher c267bdb439519216b277a7a8c6ad408b9d79efce updater.ts
 * -> main-process-manager.ts. Native electron-updater6.6.2 BaseUpdater.quitAndInstall ->
 * AppImageUpdater.doInstall has no safe exit-synchronized handoff. This disclosed narrow adapter
 * delegates to the pinned platform mechanism instead.
 *
 * Electron44.4.5 primary implementation (not the void declaration in electron.d.ts):
 * https://github.com/electron/electron/blob/v44.4.5/shell/browser/api/electron_api_app.cc
 * https://github.com/electron/electron/blob/v44.4.5/shell/browser/relauncher.cc
 * https://github.com/electron/electron/blob/v44.4.5/shell/browser/relauncher_linux.cc
 *
 * Preserve the raw native result. It is not acknowledgement of a new application, version or
 * runtime; even a failed handoff attempt must not be interpreted as proof that no child exists.
 * This adapter never closes data, quits, releases locks or owns rollback/recovery authority. The
 * helper inherits Chromium's irreversible NoNewPrivs flag. Use the native type-2 AppImage
 * extract-and-run option so the new image does not need setuid fusermount. Native controls
 * reproduce FUSE mount denial with identical bytes under setpriv --no-new-privs.
 */
import type { App } from 'electron'

import path from 'node:path'

/** Main-private handoff only; the caller must already hold the verified published capability. */
export function createElectronApplicationRelauncher(
  appPort: Pick<App, 'relaunch'>,
  electronVersion: string,
): ((currentAppImage: string) => unknown) | null {
  if (electronVersion !== '44.4.5' || process.platform !== 'linux' || process.arch !== 'x64') {
    return null
  }
  const relaunch = appPort.relaunch
  return (currentAppImage: string): unknown => {
    if (
      typeof currentAppImage !== 'string' ||
      currentAppImage.includes('\0') ||
      !path.isAbsolute(currentAppImage) ||
      path.resolve(currentAppImage) !== currentAppImage ||
      currentAppImage === path.parse(currentAppImage).root
    ) {
      throw new Error('A verified canonical AppImage path is required for application restart.')
    }
    const result: unknown = Reflect.apply(relaunch, appPort, [
      { args: ['--appimage-extract-and-run'], execPath: currentAppImage },
    ])
    return result
  }
}
