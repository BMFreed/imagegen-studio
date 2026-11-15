/** Invoke launcher c267bdb4 updater.ts7–16, exact electron-updater6.6.2 defaults. */
import type { AppUpdater } from 'electron-updater'

import type { ApplicationUpdateChecker } from './application-update-service.js'

/** Only the check capability escapes; native download/installer remain private. */
export function createElectronUpdateChecker(updater: AppUpdater): ApplicationUpdateChecker {
  updater.autoDownload = false
  updater.autoInstallOnAppQuit = false
  updater.autoRunAppAfterInstall = false
  updater.allowPrerelease = false
  updater.allowDowngrade = false
  updater.logger = null
  // AppUpdater emits error as well as rejecting check. The service projects
  // that rejection visibly; EventEmitter must not turn it into process death.
  updater.on('error', () => {})
  return { checkForUpdates: () => updater.checkForUpdates() }
}
