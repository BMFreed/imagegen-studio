import { ipcChannels } from '../shared/api.js'
import type { ApiResult, RuntimeStatus } from '../shared/api.js'

import { app, BrowserWindow, dialog, ipcMain, Menu, safeStorage, shell } from 'electron'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { ensureAppPaths, resolveAppPaths } from './app-paths.js'
import { openAppDatabase } from './db/database.js'
import { ANIMA_SOURCE_LICENSE } from './models/anima-manifest.js'
import { CivitaiClient, CivitaiClientError, parseCivitaiModelUrl } from './models/civitai-client.js'
import { CivitaiTokenStore, CivitaiTokenStoreError } from './models/civitai-token-store.js'
import { ModelDownloader, ModelDownloadError } from './models/model-downloader.js'
import { ModelInstallCoordinator } from './models/model-install-coordinator.js'
import { ModelRepository } from './models/model-repository.js'
import { ModelService, ModelServiceError } from './models/model-service.js'
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
      const modelRepository = new ModelRepository(database.db)
      const modelService = new ModelService(
        modelRepository,
        new CivitaiClient(),
        new CivitaiTokenStore(safeStorage, paths.dataRoot),
        paths.cacheRoot,
      )
      const installCoordinator = new ModelInstallCoordinator(
        modelRepository,
        modelService,
        new ModelDownloader(),
        paths.dataRoot,
      )
      let modelStorageAvailable = true
      try {
        await installCoordinator.initialize()
      } catch {
        modelStorageAvailable = false
        console.error('Managed model storage is unavailable')
      }
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

      const modelError = (error: unknown): { code: string; message: string } => {
        if (
          error instanceof ModelServiceError ||
          error instanceof CivitaiClientError ||
          error instanceof CivitaiTokenStoreError ||
          error instanceof ModelDownloadError
        ) {
          return { code: error.code, message: error.message }
        }
        console.error('Model service operation failed')
        return {
          code: 'MODEL_INTERNAL_ERROR',
          message: 'The model service could not complete the action.',
        }
      }
      function registerModelHandler<T>(
        channel: string,
        validate: (args: unknown[]) => boolean,
        handler: (...args: unknown[]) => Promise<T>,
        requiresStorage = false,
      ): void {
        ipcMain.handle(channel, async (event, ...args: unknown[]): Promise<ApiResult<T>> => {
          if (event.sender !== window.webContents || !validate(args)) {
            return {
              error: { code: 'IPC_INVALID_CALLER', message: 'The model request was rejected.' },
              ok: false,
            }
          }
          if (requiresStorage && !modelStorageAvailable) {
            return {
              error: {
                code: 'MODEL_STORAGE_UNAVAILABLE',
                message: 'Managed model storage needs repair.',
              },
              ok: false,
            }
          }
          try {
            return { ok: true, value: await handler(...args) }
          } catch (error) {
            return { error: modelError(error), ok: false }
          }
        })
      }
      const noArgs = (args: unknown[]): boolean => args.length === 0
      const oneString = (args: unknown[]): boolean =>
        args.length === 1 && typeof args[0] === 'string'

      registerModelHandler(ipcChannels.models.getCatalog, noArgs, () => modelService.getCatalog())
      registerModelHandler(
        ipcChannels.models.getStorageSummary,
        noArgs,
        () => modelService.getStorageSummary(),
        true,
      )
      registerModelHandler(ipcChannels.models.getInstallJobs, noArgs, () =>
        installCoordinator.listJobs(),
      )
      registerModelHandler(ipcChannels.models.getTokenStatus, noArgs, () =>
        modelService.getTokenStatus(),
      )
      registerModelHandler(ipcChannels.models.saveToken, oneString, (token) =>
        modelService.saveToken(token as string),
      )
      registerModelHandler(ipcChannels.models.removeToken, noArgs, () => modelService.removeToken())
      registerModelHandler(ipcChannels.models.previewImport, oneString, (url) =>
        modelService.previewImport(url as string),
      )
      registerModelHandler(
        ipcChannels.models.startInstall,
        (args) =>
          args.length === 3 &&
          typeof args[0] === 'string' &&
          Number.isSafeInteger(args[1]) &&
          typeof args[2] === 'boolean',
        (previewId, fileId, acceptedAnimaLicense) =>
          installCoordinator.startInstall(
            previewId as string,
            fileId as number,
            acceptedAnimaLicense as boolean,
          ),
        true,
      )
      registerModelHandler(
        ipcChannels.models.cancelInstall,
        oneString,
        (jobId) => installCoordinator.cancelInstall(jobId as string),
        true,
      )
      registerModelHandler(
        ipcChannels.models.setDefaultVersion,
        (args) => args.length === 2 && args.every((arg) => typeof arg === 'string'),
        async (resourceId, versionId) => {
          await modelService.setDefaultVersion(resourceId as string, versionId as string)
        },
      )
      registerModelHandler(
        ipcChannels.models.checkUpdates,
        (args) => args.length === 1 && Number.isSafeInteger(args[0]),
        (modelId) => modelService.checkUpdates(modelId as number),
      )
      registerModelHandler(ipcChannels.models.openSourceLink, oneString, async (input) => {
        const url = input as string
        if (url !== ANIMA_SOURCE_LICENSE.url) {
          parseCivitaiModelUrl(url)
        }
        await shell.openExternal(url)
      })
      registerModelHandler(
        ipcChannels.models.openModelFolder,
        noArgs,
        async () => {
          const message = await shell.openPath(path.join(paths.dataRoot, 'models'))
          if (message) {
            throw new ModelServiceError('MODEL_FOLDER_UNAVAILABLE', message)
          }
        },
        true,
      )
      const unsubscribeInstall = installCoordinator.onChanged((job) => {
        if (!window.isDestroyed()) {
          window.webContents.send(ipcChannels.models.installChanged, job)
        }
      })
      window.on('closed', unsubscribeInstall)

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
