import { ipcChannels } from '../shared/api.js'
import type { ApiResult, RuntimeStatus } from '../shared/api.js'
import { IGS_SAFETY_CEILINGS, IgsSchemaError } from '../shared/projects/project-schema.js'
import type { IgsRectV1 } from '../shared/projects/project-schema.js'

import { app, BrowserWindow, dialog, ipcMain, Menu, protocol, safeStorage, shell } from 'electron'
import { mkdirSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
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
import { IgsPackageError } from './projects/igs-package.js'
import { ProjectAutosaveError } from './projects/project-autosave.js'
import { ProjectIdentityError } from './projects/project-identity.js'
import { ProjectIndexError, ProjectIndexRepository } from './projects/project-index.js'
import {
  parseProjectLayerImageUrl,
  streamSavedProjectLayer,
  streamStagedProjectLayer,
} from './projects/project-layer-resource.js'
import { ProjectService, ProjectServiceError } from './projects/project-service.js'
import { ProjectSessionError } from './projects/project-session.js'
import { ProjectShadowError, ProjectShadowStore } from './projects/project-shadow.js'
import { createRuntimeRoots, RuntimeManager } from './runtime/index.js'

const moduleDir = __dirname
const paths = resolveAppPaths()
mkdirSync(paths.dataRoot, { recursive: true })
app.setName('ImageGen Studio')
app.setPath('userData', paths.dataRoot)
protocol.registerSchemesAsPrivileged([
  {
    privileges: { corsEnabled: true, secure: true, standard: true, stream: true },
    scheme: 'igs-layer',
  },
])
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
  app.on('will-quit', () => {
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
      const projectService = new ProjectService({
        dataRoot: paths.dataRoot,
        repository: new ProjectIndexRepository(database.db),
        roots: {
          placeholdersDir: path.join(moduleDir, 'placeholders'),
          scratchDir: path.join(paths.dataRoot, 'scratch'),
        },
        shadow: new ProjectShadowStore(path.join(paths.dataRoot, 'autosave')),
      })
      const layerScratchRoot = path.join(paths.dataRoot, 'scratch', 'layer-responses')
      await mkdir(layerScratchRoot, { recursive: true })
      protocol.handle('igs-layer', async (request) => {
        if (request.method !== 'GET') {
          return new Response('Method not allowed.', { status: 405 })
        }
        const resource = parseProjectLayerImageUrl(request.url)
        if (!resource) {
          return new Response('Layer not found.', { status: 404 })
        }
        let asset: ReturnType<ProjectService['getLayerAsset']>
        try {
          asset = projectService.getLayerAsset(resource)
        } catch {
          return new Response('Layer unavailable.', { status: 503 })
        }
        if (!asset) {
          return new Response('Layer not found.', { status: 404 })
        }
        try {
          return asset.kind === 'staged'
            ? await streamStagedProjectLayer(asset.source, asset.member, layerScratchRoot)
            : await streamSavedProjectLayer(asset.filePath, asset.member, layerScratchRoot)
        } catch {
          return new Response('Layer unavailable.', { status: 503 })
        }
      })
      try {
        await projectService.initialize()
      } catch (error) {
        console.error('Project storage is unavailable', error)
      }
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

      // Closing the native window follows the same Save / Discard / Cancel contract as a tab.
      // This also covers Alt+F4 and app.quit(), which do not go through renderer controls.
      let closingAfterResolution = false
      let resolvingClose = false
      window.on('close', (event) => {
        if (closingAfterResolution || projectService.getOpenTabs().length === 0) {
          return
        }
        event.preventDefault()
        if (resolvingClose) {
          return
        }
        const dirtyCount = projectService.getOpenTabs().filter((tab) => tab.dirty).length
        const choice = dirtyCount
          ? dialog.showMessageBoxSync(window, {
              buttons: ['Save', 'Discard Changes', 'Cancel'],
              cancelId: 2,
              defaultId: 0,
              detail: `${dirtyCount} Project${dirtyCount === 1 ? ' has' : 's have'} unsaved changes.`,
              message: 'Close ImageGen Studio?',
              type: 'question',
            })
          : 0
        if (choice === 2) {
          return
        }
        resolvingClose = true
        void (async () => {
          try {
            // Keep every tab attached until all requested Saves have committed. If a later Save
            // fails, the window and all tabs remain usable; their snapshots are resynchronized.
            if (choice === 0) {
              for (const tab of projectService.getOpenTabs()) {
                if (tab.dirty) {
                  await projectService.save(tab.id)
                }
              }
            }
            for (const tab of projectService.getOpenTabs()) {
              await (tab.dirty && choice === 1
                ? projectService.discardAndClose(tab.id)
                : projectService.close(tab.id))
            }
            closingAfterResolution = true
            window.close()
          } catch (error) {
            if (!window.isDestroyed()) {
              window.webContents.send(
                ipcChannels.projects.tabsChanged,
                projectService.getOpenTabs(),
              )
            }
            dialog.showErrorBox(
              'Project close failed',
              error instanceof Error ? error.message : 'The Project could not be closed.',
            )
          } finally {
            resolvingClose = false
          }
        })()
      })

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

      const isProjectId = (value: unknown): value is string =>
        typeof value === 'string' && /^project-v1-[a-f0-9]{64}$/.test(value)
      const oneProjectId = (args: unknown[]): boolean => args.length === 1 && isProjectId(args[0])
      const isImportId = (value: unknown): value is string =>
        typeof value === 'string' && /^[a-f0-9-]{36}$/i.test(value)
      const isProjectRect = (value: unknown): boolean => {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          return false
        }
        const rect = value as Record<string, unknown>
        return (
          Object.keys(rect).length === 4 &&
          Number.isSafeInteger(rect.x) &&
          Number.isSafeInteger(rect.y) &&
          Math.abs(rect.x as number) <= IGS_SAFETY_CEILINGS.coordinateMagnitude &&
          Math.abs(rect.y as number) <= IGS_SAFETY_CEILINGS.coordinateMagnitude &&
          Number.isSafeInteger(rect.width) &&
          Number.isSafeInteger(rect.height) &&
          (rect.width as number) >= 1 &&
          (rect.height as number) >= 1 &&
          (rect.width as number) <= IGS_SAFETY_CEILINGS.rasterDimension &&
          (rect.height as number) <= IGS_SAFETY_CEILINGS.rasterDimension
        )
      }
      function registerProjectHandler<T>(
        channel: string,
        validate: (args: unknown[]) => boolean,
        handler: (...args: unknown[]) => Promise<T>,
      ): void {
        ipcMain.handle(channel, async (event, ...args: unknown[]): Promise<ApiResult<T>> => {
          if (
            event.sender !== window.webContents ||
            event.senderFrame !== window.webContents.mainFrame ||
            !validate(args)
          ) {
            return {
              error: { code: 'IPC_INVALID_CALLER', message: 'The Project request was rejected.' },
              ok: false,
            }
          }
          try {
            return { ok: true, value: await handler(...args) }
          } catch (error) {
            if (
              error instanceof ProjectServiceError ||
              error instanceof ProjectAutosaveError ||
              error instanceof ProjectSessionError ||
              error instanceof ProjectIndexError ||
              error instanceof ProjectIdentityError ||
              error instanceof ProjectShadowError ||
              error instanceof IgsPackageError ||
              error instanceof IgsSchemaError
            ) {
              return { error: { code: error.code, message: error.message }, ok: false }
            }
            const storageCode = (error as NodeJS.ErrnoException)?.code
            if (storageCode === 'ENOSPC' || storageCode === 'EDQUOT') {
              return {
                error: {
                  code: 'PROJECT_STORAGE_FULL',
                  message: 'The Project could not be saved because storage is full.',
                },
                ok: false,
              }
            }
            if (storageCode === 'EACCES' || storageCode === 'EPERM' || storageCode === 'EROFS') {
              return {
                error: {
                  code: 'PROJECT_WRITE_DENIED',
                  message: 'The Project location is not writable.',
                },
                ok: false,
              }
            }
            console.error(`Project operation failed: ${channel}`, error)
            return {
              error: {
                code: 'PROJECT_INTERNAL_ERROR',
                message: 'The Project operation could not be completed.',
              },
              ok: false,
            }
          }
        })
      }

      registerProjectHandler(ipcChannels.projects.list, noArgs, () => projectService.list())
      registerProjectHandler(ipcChannels.projects.selectImport, noArgs, async () => {
        const selection = await dialog.showOpenDialog(window, {
          filters: [{ extensions: ['igs'], name: 'ImageGen Studio Projects' }],
          properties: ['openFile'],
          title: 'Import Project',
        })
        if (selection.canceled || selection.filePaths.length !== 1) {
          return null
        }
        return await projectService.selectImport(selection.filePaths[0])
      })
      registerProjectHandler(
        ipcChannels.projects.finishImport,
        (args) =>
          args.length === 2 && isImportId(args[0]) && (args[1] === 'move' || args[1] === 'copy'),
        (importId, choice) =>
          projectService.finishImport(importId as string, choice as 'copy' | 'move'),
      )
      registerProjectHandler(
        ipcChannels.projects.cancelImport,
        (args) => args.length === 1 && isImportId(args[0]),
        async (importId) => projectService.cancelImport(importId as string),
      )
      registerProjectHandler(
        ipcChannels.projects.create,
        (args) => {
          if (args.length !== 1 || typeof args[0] !== 'object' || args[0] === null) {
            return false
          }
          const input = args[0] as Record<string, unknown>
          return (
            Object.keys(input).length === 3 &&
            typeof input.title === 'string' &&
            input.title.trim().length > 0 &&
            new TextEncoder().encode(input.title).byteLength <= IGS_SAFETY_CEILINGS.titleBytes &&
            Number.isSafeInteger(input.width) &&
            Number.isSafeInteger(input.height) &&
            (input.width as number) >= 1 &&
            (input.height as number) >= 1 &&
            (input.width as number) <= IGS_SAFETY_CEILINGS.rasterDimension &&
            (input.height as number) <= IGS_SAFETY_CEILINGS.rasterDimension
          )
        },
        (input) => projectService.create(input as { height: number; title: string; width: number }),
      )
      registerProjectHandler(ipcChannels.projects.open, oneProjectId, (projectId) =>
        projectService.open(projectId as string),
      )
      registerProjectHandler(
        ipcChannels.projects.resolveRecovery,
        (args) =>
          args.length === 2 &&
          isProjectId(args[0]) &&
          (args[1] === 'recover' || args[1] === 'discard'),
        (projectId, decision) =>
          projectService.resolveRecovery(projectId as string, decision as 'discard' | 'recover'),
      )
      registerProjectHandler(
        ipcChannels.projects.setPrimaryBbox,
        (args) => args.length === 2 && isProjectId(args[0]) && isProjectRect(args[1]),
        (tabId, rect) => projectService.setPrimaryBbox(tabId as string, rect as IgsRectV1),
      )
      registerProjectHandler(ipcChannels.projects.save, oneProjectId, (tabId) =>
        projectService.save(tabId as string),
      )
      registerProjectHandler(ipcChannels.projects.close, oneProjectId, (tabId) =>
        projectService.close(tabId as string),
      )
      registerProjectHandler(ipcChannels.projects.discardAndClose, oneProjectId, (tabId) =>
        projectService.discardAndClose(tabId as string),
      )

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
