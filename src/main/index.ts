import { ipcChannels } from '../shared/api.js'
import type { ApiResult, RuntimeStatus } from '../shared/api.js'

import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { ensureAppPaths, resolveAppPaths } from './app-paths.js'
import { openAppDatabase } from './db/database.js'
import { createRuntimeRoots, RuntimeManager } from './runtime/index.js'

const moduleDir = __dirname
const paths = resolveAppPaths()
mkdirSync(paths.dataRoot, { recursive: true })
app.setName('ImageGen Studio')
app.setPath('userData', paths.dataRoot)
const gotInstanceLock = app.requestSingleInstanceLock()

function unavailableRuntimeService(): Pick<
  RuntimeManager,
  'getStatus' | 'install' | 'onStatusChanged' | 'repair'
> {
  const status: RuntimeStatus = {
    detail: 'The application runtime storage cannot be accessed.',
    kind: 'needs-repair',
    profile: 'linux-nvidia',
  }
  const installationUnavailable = async (): Promise<ApiResult<RuntimeStatus>> => ({
    error: {
      code: 'RUNTIME_INSTALL_UNAVAILABLE',
      message: 'Runtime repair is unavailable in this application version.',
    },
    ok: false,
  })
  return {
    getStatus: async () => ({ ok: true, value: status }),
    install: installationUnavailable,
    onStatusChanged: () => () => undefined,
    repair: installationUnavailable,
  }
}

if (!gotInstanceLock) {
  app.quit()
} else {
  let mainWindow: BrowserWindow | null = null
  let closeDatabase: (() => Promise<void>) | null = null

  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return
    }
    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    }
    mainWindow.show()
    mainWindow.focus()
  })

  app.on('window-all-closed', () => app.quit())
  app.on('before-quit', () => {
    if (closeDatabase) {
      void closeDatabase()
    }
  })

  void app
    .whenReady()
    .then(async () => {
      ensureAppPaths(paths)

      const database = openAppDatabase(paths.dataRoot, path.join(moduleDir, 'migrations'))
      closeDatabase = database.close
      let runtimeManager: Pick<
        RuntimeManager,
        'getStatus' | 'install' | 'onStatusChanged' | 'repair'
      >
      try {
        const runtimeRoots = await createRuntimeRoots(paths.dataRoot)
        runtimeManager = new RuntimeManager(runtimeRoots)
      } catch (error) {
        console.error('Runtime storage is unavailable', error)
        runtimeManager = unavailableRuntimeService()
      }

      Menu.setApplicationMenu(null)
      const window = new BrowserWindow({
        backgroundColor: '#19191d',
        height: 900,
        minHeight: 620,
        minWidth: 900,
        show: false,
        titleBarOverlay: {
          color: '#202024',
          height: 32,
          symbolColor: '#c5c7ce',
        },
        titleBarStyle: 'hidden',
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          preload: path.join(moduleDir, '../preload/preload.cjs'),
          sandbox: true,
        },
        width: 1380,
      })
      mainWindow = window

      const invalidCaller = (): ApiResult<RuntimeStatus> => ({
        error: { code: 'IPC_INVALID_CALLER', message: 'Runtime request was rejected.' },
        ok: false,
      })
      function registerRuntimeHandler(
        channel: string,
        handler: () => Promise<ApiResult<RuntimeStatus>>,
      ): void {
        ipcMain.handle(channel, async (event, ...args: unknown[]) => {
          if (event.sender !== window.webContents || args.length !== 0) {
            return invalidCaller()
          }
          try {
            return await handler()
          } catch (error) {
            console.error(`Runtime operation failed: ${channel}`, error)
            return {
              error: { code: 'RUNTIME_INTERNAL_ERROR', message: 'Runtime service failed.' },
              ok: false,
            } satisfies ApiResult<RuntimeStatus>
          }
        })
      }

      registerRuntimeHandler(ipcChannels.runtime.getStatus, () => runtimeManager.getStatus())
      registerRuntimeHandler(ipcChannels.runtime.install, () => runtimeManager.install())
      registerRuntimeHandler(ipcChannels.runtime.repair, () => runtimeManager.repair())
      const unsubscribeRuntime = runtimeManager.onStatusChanged((status) => {
        if (!window.isDestroyed()) {
          window.webContents.send(ipcChannels.runtime.statusChanged, status)
        }
      })
      window.on('closed', unsubscribeRuntime)

      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
      window.webContents.on('will-attach-webview', (event) => event.preventDefault())
      const devUrl = process.env.IMAGEGEN_DEV_SERVER_URL
      const rendererUrl =
        !app.isPackaged &&
        process.env.NODE_ENV === 'development' &&
        devUrl === 'http://127.0.0.1:5174'
          ? devUrl
          : null
      const builtFile = path.join(moduleDir, '../renderer/index.html')
      const allowedUrl = rendererUrl ?? pathToFileURL(builtFile).toString()
      window.webContents.on('will-navigate', (event, url) => {
        if (url !== allowedUrl) {
          event.preventDefault()
        }
      })

      await (rendererUrl ? window.loadURL(rendererUrl) : window.loadFile(builtFile))
      window.show()
    })
    .catch((error: unknown) => {
      console.error('ImageGen Studio startup failed', error)
      dialog.showErrorBox(
        'Не удалось запустить ImageGen Studio',
        error instanceof Error ? error.message : 'Неизвестная ошибка запуска.',
      )
      app.exit(1)
    })
}
