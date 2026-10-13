import {
  ipcChannels,
  isCheckpointNoiseProfileChange,
  isProjectEmbeddingIdentity,
  isProjectGenerationDraftChange,
  isProjectGenerationModelSelection,
  isProjectLoraIdentity,
  isProjectRasterLayerChange,
} from '../shared/api.js'
import type {
  ApiResult,
  ProjectEmbeddingIdentity,
  ProjectGenerateOptions,
  ProjectGenerationDraftChange,
  ProjectGenerationModelSelection,
  ProjectLoraIdentity,
  ProjectOpenResult,
  ProjectRasterLayerChange,
  ProjectTab,
  RuntimeStatus,
  SetCheckpointNoiseProfileChange,
} from '../shared/api.js'
import {
  type AcceptedResultHistoryCursor,
  type AcceptedResultHistoryReference,
  isAcceptedResultHistoryCursor,
  isAcceptedResultHistoryReference,
} from '../shared/projects/accepted-result-history.js'
import { GenerationBatchPlanError } from '../shared/projects/generation-batch-plan.js'
import {
  isGenerationQueueCursor,
  isGenerationQueueReview,
  isGenerationQueueTerminalStatuses,
} from '../shared/projects/generation-queue-manager.js'
import type {
  GenerationQueueCursor,
  GenerationQueueReview,
  GenerationQueueTerminalStatus,
} from '../shared/projects/generation-queue-manager.js'
import {
  isProjectDocumentId,
  isProjectGenerateOptions,
} from '../shared/projects/project-generation-actions.js'
import { isGenerationTargetKey } from '../shared/projects/project-generation-target-state.js'
import { IGS_SAFETY_CEILINGS, IgsSchemaError } from '../shared/projects/project-schema.js'
import type { IgsRectV1 } from '../shared/projects/project-schema.js'
import { reconcilePromptEmbeddings } from '../shared/projects/prompt-embeddings.js'

import { app, BrowserWindow, dialog, ipcMain, Menu, protocol, safeStorage, shell } from 'electron'
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { mkdir, realpath } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { ensureAppPaths, resolveAppPaths } from './app-paths.js'
import { openAppDatabase } from './db/database.js'
import { ANIMA_SOURCE_LICENSE } from './models/anima-manifest.js'
import { CivitaiClient, CivitaiClientError, parseCivitaiModelUrl } from './models/civitai-client.js'
import { CivitaiTokenStore, CivitaiTokenStoreError } from './models/civitai-token-store.js'
import { ModelDownloader, ModelDownloadError } from './models/model-downloader.js'
import { ModelInstallCoordinator } from './models/model-install-coordinator.js'
import { ModelPreviewCache } from './models/model-preview-cache.js'
import { ModelRepository } from './models/model-repository.js'
import { ModelService, ModelServiceError } from './models/model-service.js'
import {
  parseAcceptedHistoryImageUrl,
  readSavedAcceptedResultImage,
} from './projects/accepted-history-resource.js'
import { developmentImageWorkerLocation } from './projects/development-image-worker.js'
import {
  GenerationAcceptanceJournalError,
  GenerationAcceptanceJournalRepository,
} from './projects/generation-acceptance-journal.js'
import {
  ProjectGenerationActionController,
  ProjectGenerationActionError,
  toProjectGenerationActionApiError,
} from './projects/generation-action-controller.js'
import { createGenerationAppContext } from './projects/generation-app-context.js'
import { GenerationAppShutdown } from './projects/generation-app-shutdown.js'
import { GenerationDispatchCoordinator } from './projects/generation-dispatch-coordinator.js'
import { GenerationDispatchError } from './projects/generation-dispatch-coordinator.js'
import { GenerationOrchestratorError } from './projects/generation-orchestrator.js'
import { GenerationProcessorError } from './projects/generation-processor.js'
import { GenerationQueueError } from './projects/generation-queue.js'
import { GenerationStagingError } from './projects/generation-staging.js'
import { IgsPackageError } from './projects/igs-package.js'
import { IllustriousJobError } from './projects/illustrious-txt2img-job.js'
import { ProjectAutosaveError } from './projects/project-autosave.js'
import {
  ProjectCandidateImageExporter,
  ProjectCandidateImageExportError,
} from './projects/project-candidate-image-export.js'
import {
  ProjectGenerationAcceptance,
  ProjectGenerationAcceptanceError,
} from './projects/project-generation-acceptance.js'
import {
  ProjectGenerationClose,
  ProjectGenerationCloseError,
} from './projects/project-generation-close.js'
import { ProjectGenerationOperationGate } from './projects/project-generation-operation-gate.js'
import { GenerationPreparationError } from './projects/project-generation-preparation.js'
import { ProjectGenerationProvenanceError } from './projects/project-generation-provenance.js'
import {
  ProjectGenerationRecovery,
  ProjectGenerationRecoveryError,
  reconcileOpenedProjectGeneration,
} from './projects/project-generation-recovery.js'
import {
  ProjectGenerationResultResource,
  ProjectGenerationResultResourceError,
} from './projects/project-generation-result-resource.js'
import { releaseCanceledWindowCloseFences } from './projects/project-generation-window-close.js'
import { ProjectIdentityError } from './projects/project-identity.js'
import { ProjectIndexError, ProjectIndexRepository } from './projects/project-index.js'
import {
  parseProjectLayerImageUrl,
  streamSavedProjectLayer,
  streamStagedProjectLayer,
} from './projects/project-layer-resource.js'
import {
  parseProjectThumbnailImageUrl,
  readProjectThumbnail,
} from './projects/project-preview-resource.js'
import { ProjectService, ProjectServiceError } from './projects/project-service.js'
import { ProjectSessionError } from './projects/project-session.js'
import { ProjectShadowError, ProjectShadowStore } from './projects/project-shadow.js'
import { ProjectTargetInspectionOwner } from './projects/project-target-inspection-owner.js'
import {
  inspectTemporaryRecovery,
  type ProjectTemporaryRecoveryInspection,
  unavailableTemporaryRecovery,
} from './projects/project-temporary-recovery.js'
import { RasterImportError } from './projects/raster-import.js'
import { ProjectWorkerError } from './projects/worker-client.js'
import { createRuntimeRoots, RuntimeManager } from './runtime/index.js'

const moduleDir = __dirname
const paths = resolveAppPaths()
mkdirSync(paths.dataRoot, { recursive: true })
app.setName('ImageGen Studio')
app.setPath('userData', paths.dataRoot)
protocol.registerSchemesAsPrivileged([
  {
    privileges: { corsEnabled: true, secure: true, standard: true, stream: true },
    scheme: 'igs-history',
  },
  {
    privileges: { corsEnabled: true, secure: true, standard: true, stream: true },
    scheme: 'igs-layer',
  },
  {
    privileges: { corsEnabled: true, secure: true, standard: true, stream: true },
    scheme: 'igs-preview',
  },
  {
    privileges: {
      corsEnabled: true,
      secure: true,
      standard: true,
      stream: true,
      supportFetchAPI: true,
    },
    scheme: 'igs-staging',
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
  let generationShutdown: GenerationAppShutdown | null = null
  let exitReady = false
  let exitInProgress = false

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
  app.on('will-quit', (event) => {
    if (exitReady) {
      return
    }
    // Electron emits will-quit after closing its windows. The normal window-close path awaits
    // this barrier while the window is still available; this is the fallback for other quit paths.
    event.preventDefault()
    if (exitInProgress) {
      return
    }
    exitInProgress = true
    void (async () => {
      if (generationShutdown) {
        await generationShutdown.finalize()
      } else if (closeDatabase) {
        await closeDatabase()
      }
      exitReady = true
      app.quit()
    })().catch((error: unknown) => {
      exitInProgress = false
      console.error('Application shutdown failed', error)
      dialog.showErrorBox(
        'Application close failed',
        'The application could not confirm worker exit or close its data storage.',
      )
    })
  })

  void app
    .whenReady()
    .then(async () => {
      ensureAppPaths(paths)

      const database = openAppDatabase(paths.dataRoot, path.join(moduleDir, 'migrations'))
      closeDatabase = database.close
      const projectRepository = new ProjectIndexRepository(database.db)
      let readGenerationSeed:
        ((projectKey: string, documentId: string) => Promise<number | null>) | null = null
      let readTemporaryRecovery:
        ((projectKey: string) => Promise<ProjectTemporaryRecoveryInspection>) | null = null
      let openImportedProject: ((projectId: string) => Promise<ProjectOpenResult>) | null = null
      const projectService: ProjectService = new ProjectService({
        dataRoot: paths.dataRoot,
        inspectTemporaryRecovery: async (projectKey) =>
          readTemporaryRecovery
            ? await readTemporaryRecovery(projectKey)
            : unavailableTemporaryRecovery(),
        openImportedProject: async (projectId) =>
          openImportedProject
            ? await openImportedProject(projectId)
            : await projectService.open(projectId),
        readLastActualSeed: async (projectKey, documentId) =>
          readGenerationSeed ? await readGenerationSeed(projectKey, documentId) : null,
        repository: projectRepository,
        resolvePromptEmbeddings: (input) => {
          if (!modelStorageAvailable) {
            if (input.selection) {
              throw new ModelServiceError(
                'MODEL_STORAGE_UNAVAILABLE',
                'Managed model storage needs repair.',
              )
            }
            return Promise.resolve(
              reconcilePromptEmbeddings({ ...input.prompt, text: input.text }, []),
            )
          }
          return modelService.resolveGenerationPromptEmbeddings(input)
        },
        roots: {
          placeholdersDir: path.join(moduleDir, 'placeholders'),
          scratchDir: path.join(paths.dataRoot, 'scratch'),
        },
        shadow: new ProjectShadowStore(path.join(paths.dataRoot, 'autosave')),
      })
      // Explicit development/test opt-in retains the derivatives source adapter. Production image
      // operations resolve the installed app-owned worker independently of CUDA inference readiness.
      const developmentWorkerLocation = developmentImageWorkerLocation({
        isPackaged: app.isPackaged,
        mainDirectory: moduleDir,
        nodeEnv: process.env.NODE_ENV,
        scratchDirectory: path.join(paths.dataRoot, 'scratch'),
        smokeOptIn: process.env.IMAGEGEN_TEST_IMAGE_WORKER,
      })
      const projectImageScratch = path.join(paths.dataRoot, 'scratch')
      await mkdir(projectImageScratch, { recursive: true })
      const resolveProjectImageWorker = async () =>
        developmentWorkerLocation
          ? {
              environment: { LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' },
              location: developmentWorkerLocation,
            }
          : ((await generationRuntime?.resolveInstalledProjectWorker(projectImageScratch)) ?? null)
      const targetInspectionOwner = new ProjectTargetInspectionOwner(resolveProjectImageWorker)
      const saveProjectWithPreview = async (tabId: string) => {
        const result = await targetInspectionOwner.useOptionalWorker((worker) =>
          projectService.save(tabId, worker),
        )
        if (!result) {
          throw new ProjectServiceError(
            'PROJECT_WORKER_UNAVAILABLE',
            'The application is closing. Save was not started.',
          )
        }
        return result
      }
      const layerScratchRoot = path.join(paths.dataRoot, 'scratch', 'layer-responses')
      await mkdir(layerScratchRoot, { recursive: true })
      protocol.handle('igs-history', async (request) => {
        if (request.method !== 'GET') {
          return new Response('Method not allowed.', { status: 405 })
        }
        const resource = parseAcceptedHistoryImageUrl(request.url)
        if (!resource) {
          return new Response('Saved result not found.', { status: 404 })
        }
        try {
          return await readSavedAcceptedResultImage(resource, projectRepository, layerScratchRoot)
        } catch {
          return new Response('Saved result unavailable.', { status: 503 })
        }
      })
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
      const thumbnailCacheRoot = path.join(
        await realpath(paths.dataRoot),
        'previews',
        'project-thumbnails',
      )
      protocol.handle('igs-preview', async (request) => {
        if (request.method !== 'GET') {
          return new Response('Method not allowed.', { status: 405 })
        }
        const resource = parseProjectThumbnailImageUrl(request.url)
        if (!resource) {
          return new Response('Project thumbnail not found.', { status: 404 })
        }
        return await readProjectThumbnail(resource, projectRepository, thumbnailCacheRoot)
      })
      try {
        await projectService.initialize()
      } catch (error) {
        console.error('Project storage is unavailable', error)
      }
      const modelRepository = new ModelRepository(database.db)
      const civitaiClient = new CivitaiClient()
      const resourcePreviews = new ModelPreviewCache({
        cacheRoot: paths.cacheRoot,
        canBuild: async () => Boolean(await resolveProjectImageWorker()),
        fetchSource: (url) => civitaiClient.previewImageDataUrl(url),
        scratchRoot: projectImageScratch,
        withWorker: (use) => targetInspectionOwner.useWorker(use, { retainCompletedResult: false }),
      })
      const modelService = new ModelService(
        modelRepository,
        civitaiClient,
        new CivitaiTokenStore(safeStorage, paths.dataRoot),
        paths.cacheRoot,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        resourcePreviews,
      )
      // Keep the recovered queue/staging pair and their single owner for this app lifetime.
      // Recover storage before exposing any user generation action.
      const ownedGenerationContext = await createGenerationAppContext({
        database,
        dataRoot: paths.dataRoot,
        modelService,
        projectIndex: projectRepository,
        projectService,
        scratchBasePath: path.join(paths.dataRoot, 'scratch'),
      })
      if (ownedGenerationContext.availability.kind === 'recovery-failed') {
        console.error('Generation recovery is unavailable', ownedGenerationContext.recoveryFailure)
      }
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
      let generationRuntime: RuntimeManager | null = null
      try {
        const runtimeRoots = await createRuntimeRoots(paths.dataRoot)
        generationRuntime = new RuntimeManager(runtimeRoots)
        runtimeManager = generationRuntime
      } catch (error) {
        console.error('Runtime storage is unavailable', error)
        runtimeManager = unavailableRuntimeService()
      }
      const recoveredGeneration =
        ownedGenerationContext.availability.kind === 'storage-recovered'
          ? ownedGenerationContext.requireRecoveredServices()
          : null
      readTemporaryRecovery = (projectKey) =>
        inspectTemporaryRecovery(recoveredGeneration?.staging ?? null, projectKey)
      readGenerationSeed = recoveredGeneration
        ? (projectKey, documentId) =>
            recoveredGeneration.staging.readLastActualSeed(projectKey, documentId)
        : null
      const projectGenerationGate = new ProjectGenerationOperationGate()
      // Recovered operational history is usable even if runtime storage cannot initialize.
      const generationLease = generationRuntime ?? {
        getStatus: async () => null,
        readQualifiedInferenceReady: async () => null,
        retryUnconfirmedGenerationExit: async () => true,
        withGenerationAdmission: async () => null,
        withGenerationPreparation: async () => null,
        withGenerationWorker: async () => null,
      }
      const generationDispatch = recoveredGeneration
        ? new GenerationDispatchCoordinator(
            generationLease,
            recoveredGeneration.orchestrator,
            recoveredGeneration.processor,
            path.join(paths.dataRoot, 'scratch'),
          )
        : null
      const generationActions =
        recoveredGeneration && generationDispatch
          ? new ProjectGenerationActionController({
              dispatch: generationDispatch,
              gate: projectGenerationGate,
              infillResolver: recoveredGeneration.infillResolver,
              models: modelService,
              orchestrator: recoveredGeneration.orchestrator,
              processor: recoveredGeneration.processor,
              projects: projectService,
              queue: recoveredGeneration.queue,
              runtime: generationLease,
              scratchBasePath: path.join(paths.dataRoot, 'scratch'),
              staging: recoveredGeneration.staging,
            })
          : null
      const requireGenerationActions = (): ProjectGenerationActionController => {
        if (!generationActions) {
          throw new ProjectGenerationActionError(
            'GENERATION_RUNTIME_UNAVAILABLE',
            'Generation storage or the image runtime needs attention. Editing and Save remain available.',
          )
        }
        return generationActions
      }
      const generationAcceptance = recoveredGeneration
        ? new ProjectGenerationAcceptance({
            documents: {
              getOpenDocument: (tabId) => projectService.getOpenDocumentForAcceptance(tabId),
            },
            gate: projectGenerationGate,
            journal: new GenerationAcceptanceJournalRepository(database.db),
            orchestrator: recoveredGeneration.orchestrator,
            queue: recoveredGeneration.queue,
            staging: recoveredGeneration.staging,
          })
        : null
      const projectGenerationClose = new ProjectGenerationClose(
        projectService,
        recoveredGeneration,
        projectGenerationGate,
        (tabId) => generationAcceptance?.hasPendingHandoff(tabId) ?? false,
      )
      const projectGenerationRecovery = new ProjectGenerationRecovery(
        projectService,
        recoveredGeneration,
        projectGenerationGate,
      )
      openImportedProject = (projectId) => projectGenerationRecovery.open(projectId)
      const reconcileOpenedProject = async (
        tabId: string,
        wasOpen: boolean,
      ): Promise<string | null> =>
        await reconcileOpenedProjectGeneration(
          tabId,
          wasOpen,
          recoveredGeneration?.orchestrator ?? null,
          generationAcceptance,
        )
      const generationResults = new ProjectGenerationResultResource(
        recoveredGeneration?.staging ?? null,
        (tabId) => projectService.getOpenDocumentId(tabId),
        recoveredGeneration?.queue ?? null,
      )
      const candidateImageExporter = new ProjectCandidateImageExporter(
        recoveredGeneration?.staging ?? null,
        (tabId) => projectService.getOpenDocumentId(tabId),
        (defaultFileName) =>
          dialog.showSaveDialog(window, {
            defaultPath: defaultFileName,
            filters: [{ extensions: ['png'], name: 'PNG Images' }],
            title: 'Save Candidate Image',
          }),
      )
      protocol.handle('igs-staging', async (request) => {
        const responseHeaders = {
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        }
        if (request.method !== 'GET') {
          return new Response('Method not allowed.', { headers: responseHeaders, status: 405 })
        }
        try {
          const isThumbnail = new URL(request.url).hostname === 'thumbnail'
          const bytes = isThumbnail
            ? await generationResults.readThumbnail(request.url)
            : await generationResults.readImage(request.url)
          return bytes
            ? new Response(new Uint8Array(bytes), {
                headers: {
                  ...responseHeaders,
                  'Content-Length': String(bytes.length),
                  'Content-Type': isThumbnail ? 'image/webp' : 'image/png',
                },
              })
            : new Response('Generation result not found.', {
                headers: responseHeaders,
                status: 404,
              })
        } catch {
          return new Response('Generation result unavailable.', {
            headers: responseHeaders,
            status: 503,
          })
        }
      })
      const appShutdown = new GenerationAppShutdown({
        closeDatabase: database.close,
        context: ownedGenerationContext,
        coordinator: generationActions,
        pendingJobs: recoveredGeneration?.queue ?? null,
        runtimeExit: generationRuntime,
        shutdownImageReads: () => targetInspectionOwner.shutdown(),
      })
      generationShutdown = appShutdown

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
      const unsubscribeGeneration = generationActions?.onChanged(() => {
        if (!window.webContents.isDestroyed()) {
          window.webContents.send(ipcChannels.projects.generationChanged)
        }
      })
      const unsubscribeProgress = recoveredGeneration?.processor.onProgress((snapshot) => {
        if (!window.webContents.isDestroyed()) {
          window.webContents.send(ipcChannels.projects.generationProgress, snapshot)
        }
      })
      if (unsubscribeProgress) {
        window.on('closed', unsubscribeProgress)
      }
      if (unsubscribeGeneration) {
        window.on('closed', unsubscribeGeneration)
      }

      // Closing the native window follows the same Save / Discard / Cancel contract as a tab.
      // This also covers Alt+F4 and app.quit(), which do not go through renderer controls.
      let closingAfterResolution = false
      let resolvingClose = false
      function flushRendererDraftsBeforeClose(): Promise<void> {
        return new Promise((resolve, reject) => {
          const requestId = randomUUID()
          let settled = false
          const finish = (error: Error | null): void => {
            if (settled) {
              return
            }
            settled = true
            clearTimeout(timeout)
            ipcMain.removeListener(ipcChannels.projects.windowCloseReady, onReady)
            if (error) {
              reject(error)
            } else {
              resolve()
            }
          }
          const onReady = (
            event: Electron.IpcMainEvent,
            responseId: unknown,
            errorMessage: unknown,
          ): void => {
            if (event.sender !== window.webContents || responseId !== requestId) {
              return
            }
            finish(
              errorMessage === null
                ? null
                : new Error(
                    typeof errorMessage === 'string'
                      ? errorMessage
                      : 'The Project draft could not be flushed.',
                  ),
            )
          }
          const timeout = setTimeout(
            () => finish(new Error('The Project editor did not respond before closing.')),
            10_000,
          )
          ipcMain.on(ipcChannels.projects.windowCloseReady, onReady)
          try {
            window.webContents.send(ipcChannels.projects.prepareWindowClose, requestId)
          } catch (cause) {
            finish(cause instanceof Error ? cause : new Error('The Project editor is unavailable.'))
          }
        })
      }
      window.on('close', (event) => {
        if (closingAfterResolution) {
          return
        }
        event.preventDefault()
        if (resolvingClose) {
          return
        }
        resolvingClose = true
        void (async () => {
          const fencedTabs: string[] = []
          let closeCommitted = false
          try {
            // The renderer can still have an unacknowledged prompt/seed edit. Flush it before
            // main decides whether anything is dirty or starts an explicit Save.
            if (projectService.getOpenTabs().length > 0) {
              await flushRendererDraftsBeforeClose()
            }
            const tabs = projectService.getOpenTabs()
            // An Add admitted before native close must finish its shadow handoff before close
            // snapshots staging or fences dispatch. New Add requests see resolvingClose.
            for (const tab of tabs) {
              await projectGenerationGate.drain(tab.id)
            }
            const unresolvedTab = tabs.find((tab) =>
              generationAcceptance?.hasPendingHandoff(tab.id),
            )
            if (unresolvedTab) {
              throw new ProjectGenerationAcceptanceError(
                'ACCEPTANCE_HANDOFF_PENDING',
                `Finish recovering accepted results in ${unresolvedTab.title} before closing the application.`,
              )
            }
            // Fence each open Project before taking the close-impact snapshot. Cancel releases
            // every fence without changing jobs or candidates.
            for (const tab of tabs) {
              await recoveredGeneration?.orchestrator.fenceProjectGeneration(tab.id)
              fencedTabs.push(tab.id)
            }
            const impacts = await Promise.all(
              tabs.map((tab) => projectGenerationClose.getCloseImpact(tab.id)),
            )
            const dirtyCount = tabs.filter((tab) => tab.dirty).length
            const unfinishedJobCount = impacts.reduce(
              (sum, impact) => sum + impact.unfinishedJobCount,
              0,
            )
            const completedCandidateCount = impacts.reduce(
              (sum, impact) => sum + impact.completedCandidateCount,
              0,
            )
            const generationStorageUnavailable =
              recoveredGeneration === null ||
              impacts.some((impact) => impact.generationStorageUnavailable)
            const hasGenerationImpact =
              unfinishedJobCount + completedCandidateCount > 0 || generationStorageUnavailable
            const detail = [
              dirtyCount > 0
                ? `${dirtyCount} Project${dirtyCount === 1 ? ' has' : 's have'} unsaved changes.`
                : null,
              unfinishedJobCount > 0
                ? `${unfinishedJobCount} unfinished generation job${unfinishedJobCount === 1 ? '' : 's'} will be canceled.`
                : null,
              completedCandidateCount > 0
                ? `${completedCandidateCount} unaccepted result${completedCandidateCount === 1 ? '' : 's'} will be discarded.`
                : null,
              generationStorageUnavailable
                ? 'Generation recovery storage cannot be inspected. Temporary results will remain on this computer for a later recovery attempt.'
                : null,
            ]
              .filter(Boolean)
              .join(' ')
            const choice =
              dirtyCount > 0
                ? dialog.showMessageBoxSync(window, {
                    buttons: ['Save', 'Discard Changes', 'Cancel'],
                    cancelId: 2,
                    defaultId: 0,
                    detail,
                    message: 'Close ImageGen Studio?',
                    type: 'question',
                  })
                : hasGenerationImpact
                  ? dialog.showMessageBoxSync(window, {
                      buttons: [
                        generationStorageUnavailable
                          ? 'Close and Keep Recovery'
                          : completedCandidateCount > 0
                            ? 'Discard Results and Close'
                            : 'Cancel Jobs and Close',
                        'Cancel',
                      ],
                      cancelId: 1,
                      defaultId: 1,
                      detail,
                      message: 'Close ImageGen Studio?',
                      type: 'warning',
                    })
                  : 0
            if ((dirtyCount > 0 && choice === 2) || (dirtyCount === 0 && choice === 1)) {
              return
            }
            // Keep every tab attached until all requested Saves have committed. If a later Save
            // fails, the window and all tabs remain usable; their snapshots are resynchronized.
            if (choice === 0) {
              for (const tab of projectService.getOpenTabs()) {
                if (tab.dirty) {
                  await projectGenerationGate.run(tab.id, () => saveProjectWithPreview(tab.id))
                }
              }
            }
            closeCommitted = true
            // A canceled dialog has not stopped generation. Once the user confirms closing,
            // hold this visible window until worker exit and pending-job cancellation are durable.
            await appShutdown.prepareWindowClose()
            for (const tab of projectService.getOpenTabs()) {
              await projectGenerationClose.close(tab.id, {
                confirmCloseImpact: hasGenerationImpact,
                discardDocument: tab.dirty && choice === 1,
              })
            }
            await appShutdown.finalize()
            exitReady = true
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
            if (!closeCommitted) {
              releaseCanceledWindowCloseFences(
                fencedTabs,
                (tabId) => generationAcceptance?.hasPendingHandoff(tabId) ?? false,
                (tabId) => recoveredGeneration?.orchestrator.releaseProjectGenerationFence(tabId),
              )
            }
            resolvingClose = false
            if (!closingAfterResolution && !window.isDestroyed()) {
              window.webContents.send(ipcChannels.projects.windowCloseReleased)
            }
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
      const isRasterLayerId = (value: unknown): value is string =>
        typeof value === 'string' &&
        /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)
      const isCandidateId = (value: unknown): value is string =>
        typeof value === 'string' &&
        /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value)
      const isHistoryGroupId = (value: unknown): value is string =>
        typeof value === 'string' &&
        /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value)
      const oneProjectId = (args: unknown[]): boolean => args.length === 1 && isProjectId(args[0])
      const closeProjectArgs = (args: unknown[]): boolean =>
        args.length === 2 && isProjectId(args[0]) && typeof args[1] === 'boolean'
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
              channel === ipcChannels.projects.generate ||
              channel === ipcChannels.projects.getGenerationState ||
              channel === ipcChannels.projects.cancelCurrentGeneration ||
              channel === ipcChannels.projects.getGenerationQueue ||
              channel === ipcChannels.projects.cancelGenerationJob ||
              channel === ipcChannels.projects.retryGenerationJob ||
              channel === ipcChannels.projects.deleteGenerationJob ||
              channel === ipcChannels.projects.pruneGenerationQueue
            ) {
              return { error: toProjectGenerationActionApiError(error), ok: false }
            }
            if (
              error instanceof ProjectServiceError ||
              error instanceof ProjectCandidateImageExportError ||
              error instanceof ProjectGenerationCloseError ||
              error instanceof ProjectGenerationRecoveryError ||
              error instanceof ProjectGenerationAcceptanceError ||
              error instanceof ProjectGenerationProvenanceError ||
              error instanceof ProjectGenerationResultResourceError ||
              error instanceof ProjectGenerationActionError ||
              error instanceof GenerationPreparationError ||
              error instanceof GenerationBatchPlanError ||
              error instanceof GenerationDispatchError ||
              error instanceof IllustriousJobError ||
              error instanceof GenerationOrchestratorError ||
              error instanceof GenerationProcessorError ||
              error instanceof GenerationQueueError ||
              error instanceof GenerationStagingError ||
              error instanceof GenerationAcceptanceJournalError ||
              error instanceof ModelServiceError ||
              error instanceof ProjectAutosaveError ||
              error instanceof ProjectSessionError ||
              error instanceof ProjectIndexError ||
              error instanceof ProjectIdentityError ||
              error instanceof ProjectShadowError ||
              error instanceof RasterImportError ||
              error instanceof ProjectWorkerError ||
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
      registerProjectHandler(
        ipcChannels.projects.getAcceptedResultHistory,
        (args) => args.length === 1 && (args[0] === null || isAcceptedResultHistoryCursor(args[0])),
        (cursor) =>
          projectService.getAcceptedResultHistory(cursor as AcceptedResultHistoryCursor | null),
      )
      registerProjectHandler(
        ipcChannels.projects.getGenerationTargetState,
        (args) =>
          args.length === 3 &&
          isProjectId(args[0]) &&
          isProjectDocumentId(args[1]) &&
          isGenerationTargetKey(args[2]),
        async (tabId, documentId, targetKey) => {
          const read = (withWorker?: Parameters<ProjectService['getGenerationTargetState']>[3]) =>
            projectService.getGenerationTargetState(
              tabId as string,
              documentId as string,
              targetKey as string,
              withWorker,
            )
          return (await targetInspectionOwner.read(read)) ?? (await read())
        },
      )
      registerProjectHandler(
        ipcChannels.projects.getRasterGenerationData,
        (args) =>
          args.length === 3 &&
          isProjectId(args[0]) &&
          isProjectDocumentId(args[1]) &&
          isProjectDocumentId(args[2]),
        async (tabId, documentId, layerId) => {
          const read = (withWorker?: Parameters<ProjectService['getRasterGenerationData']>[3]) =>
            projectService.getRasterGenerationData(
              tabId as string,
              documentId as string,
              layerId as string,
              withWorker,
            )
          return (await targetInspectionOwner.read(read, 'comparison')) ?? (await read())
        },
      )
      registerProjectHandler(
        ipcChannels.projects.reviewAcceptedResult,
        (args) => args.length === 1 && isAcceptedResultHistoryReference(args[0]),
        (reference) =>
          projectService.reviewAcceptedResult(reference as AcceptedResultHistoryReference),
      )
      registerProjectHandler(
        ipcChannels.projects.getGenerationQueue,
        (args) => args.length === 1 && (args[0] === null || isGenerationQueueCursor(args[0])),
        async (cursor) =>
          await requireGenerationActions().getQueue(cursor as GenerationQueueCursor | null),
      )
      const oneQueueReview = (args: unknown[]) =>
        args.length === 1 && isGenerationQueueReview(args[0])
      registerProjectHandler(
        ipcChannels.projects.cancelGenerationJob,
        oneQueueReview,
        async (review) =>
          await requireGenerationActions().cancelJob(review as GenerationQueueReview),
      )
      registerProjectHandler(
        ipcChannels.projects.retryGenerationJob,
        oneQueueReview,
        async (review) =>
          await requireGenerationActions().retryJob(review as GenerationQueueReview),
      )
      registerProjectHandler(
        ipcChannels.projects.deleteGenerationJob,
        oneQueueReview,
        async (review) =>
          await requireGenerationActions().deleteJob(review as GenerationQueueReview),
      )
      registerProjectHandler(
        ipcChannels.projects.pruneGenerationQueue,
        (args) => args.length === 1 && isGenerationQueueTerminalStatuses(args[0]),
        async (statuses) =>
          await requireGenerationActions().pruneQueue(statuses as GenerationQueueTerminalStatus[]),
      )
      registerProjectHandler(
        ipcChannels.projects.getGenerationProgress,
        noArgs,
        async () =>
          recoveredGeneration?.processor.getProgressSnapshot() ?? { current: null, revision: 0 },
      )
      registerProjectHandler(
        ipcChannels.projects.getGenerationState,
        oneProjectId,
        async (tabId) => await requireGenerationActions().getState(tabId as string),
      )
      registerProjectHandler(
        ipcChannels.projects.generate,
        (args) => args.length === 2 && isProjectId(args[0]) && isProjectGenerateOptions(args[1]),
        async (tabId, options) =>
          await requireGenerationActions().generate(
            tabId as string,
            options as ProjectGenerateOptions,
          ),
      )
      registerProjectHandler(
        ipcChannels.projects.cancelCurrentGeneration,
        (args) =>
          args.length === 3 &&
          isProjectId(args[0]) &&
          isProjectDocumentId(args[1]) &&
          isCandidateId(args[2]),
        async (tabId, documentId, expectedJobId) =>
          await requireGenerationActions().cancelCurrent(
            tabId as string,
            documentId as string,
            expectedJobId as string,
          ),
      )
      registerProjectHandler(ipcChannels.projects.selectImport, noArgs, async () => {
        const previouslyOpen = new Set(projectService.getOpenTabs().map((tab) => tab.id))
        const selection = await dialog.showOpenDialog(window, {
          filters: [{ extensions: ['igs'], name: 'ImageGen Studio Projects' }],
          properties: ['openFile'],
          title: 'Import Project',
        })
        if (selection.canceled || selection.filePaths.length !== 1) {
          return null
        }
        const imported = await projectService.selectImport(selection.filePaths[0])
        if (imported.kind === 'opened' && imported.result.kind === 'opened') {
          const warning = await reconcileOpenedProject(
            imported.result.tab.id,
            previouslyOpen.has(imported.result.tab.id),
          )
          if (warning) {
            imported.result.tab.storageWarning = [imported.result.tab.storageWarning, warning]
              .filter(Boolean)
              .join(' ')
          }
        }
        return imported
      })
      registerProjectHandler(
        ipcChannels.projects.finishImport,
        (args) =>
          args.length === 2 && isImportId(args[0]) && (args[1] === 'move' || args[1] === 'copy'),
        async (importId, choice) => {
          const previouslyOpen = new Set(projectService.getOpenTabs().map((tab) => tab.id))
          const imported = await projectService.finishImport(
            importId as string,
            choice as 'copy' | 'move',
          )
          if (imported.result.kind === 'opened') {
            const warning = await reconcileOpenedProject(
              imported.result.tab.id,
              previouslyOpen.has(imported.result.tab.id),
            )
            if (warning) {
              imported.result.tab.storageWarning = [imported.result.tab.storageWarning, warning]
                .filter(Boolean)
                .join(' ')
            }
          }
          return imported
        },
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
        async (input) => {
          const tab = await projectService.create(
            input as { height: number; title: string; width: number },
          )
          const warning = await reconcileOpenedProject(tab.id, false)
          if (warning) {
            tab.storageWarning = warning
          }
          return tab
        },
      )
      registerProjectHandler(ipcChannels.projects.open, oneProjectId, async (projectId) => {
        const wasOpen = projectService.getOpenTabs().some((tab) => tab.id === projectId)
        const result = await projectGenerationRecovery.open(projectId as string)
        if (result.kind === 'opened') {
          const warning = await reconcileOpenedProject(result.tab.id, wasOpen)
          if (warning) {
            result.tab.storageWarning = [result.tab.storageWarning, warning]
              .filter(Boolean)
              .join(' ')
          }
        }
        return result
      })
      registerProjectHandler(
        ipcChannels.projects.resolveRecovery,
        (args) =>
          args.length === 2 &&
          isProjectId(args[0]) &&
          (args[1] === 'recover' || args[1] === 'discard'),
        async (projectId, decision) => {
          const tab = await projectGenerationRecovery.resolve(
            projectId as string,
            decision as 'discard' | 'recover',
          )
          const warning = await reconcileOpenedProject(tab.id, false)
          if (warning) {
            tab.storageWarning = [tab.storageWarning, warning].filter(Boolean).join(' ')
          }
          return tab
        },
      )
      registerProjectHandler(
        ipcChannels.projects.addGenerationLora,
        (args) =>
          args.length === 2 &&
          isProjectId(args[0]) &&
          args[1] !== null &&
          isProjectGenerationModelSelection(args[1]),
        async (tabId, selection) => {
          if (!modelStorageAvailable) {
            throw new ModelServiceError(
              'MODEL_STORAGE_UNAVAILABLE',
              'Managed model storage needs repair.',
            )
          }
          const chosen = selection as ProjectLoraIdentity
          const resource = await modelService.resolveGenerationLora(
            chosen.resourceId,
            chosen.versionId,
          )
          return projectService.addGenerationLora(tabId as string, resource)
        },
      )
      registerProjectHandler(
        ipcChannels.projects.removeGenerationLora,
        (args) => args.length === 2 && isProjectId(args[0]) && isProjectLoraIdentity(args[1]),
        (tabId, identity) =>
          projectService.removeGenerationLora(tabId as string, identity as ProjectLoraIdentity),
      )
      registerProjectHandler(
        ipcChannels.projects.setGenerationModel,
        (args) =>
          args.length === 2 && isProjectId(args[0]) && isProjectGenerationModelSelection(args[1]),
        async (tabId, selection) => {
          const chosen = selection as ProjectGenerationModelSelection
          if (chosen === null) {
            return await projectService.setGenerationModel(tabId as string, null)
          }
          if (!modelStorageAvailable) {
            throw new ModelServiceError(
              'MODEL_STORAGE_UNAVAILABLE',
              'Managed model storage needs repair.',
            )
          }
          const model = await modelService.resolveGenerationCheckpoint(
            chosen.resourceId,
            chosen.versionId,
          )
          return await projectService.setGenerationModel(tabId as string, model)
        },
      )
      registerProjectHandler(
        ipcChannels.projects.relinkGenerationLora,
        (args) => args.length === 2 && isProjectId(args[0]) && isProjectLoraIdentity(args[1]),
        async (tabId, identity) => {
          if (!modelStorageAvailable) {
            throw new ModelServiceError(
              'MODEL_STORAGE_UNAVAILABLE',
              'Managed model storage needs repair.',
            )
          }
          return projectService.relinkGenerationLora(
            tabId as string,
            identity as ProjectLoraIdentity,
            (saved) => modelService.resolvePortableGenerationLora(saved),
          )
        },
      )
      registerProjectHandler(
        ipcChannels.projects.relinkGenerationModel,
        oneProjectId,
        async (tabId) => {
          if (!modelStorageAvailable) {
            throw new ModelServiceError(
              'MODEL_STORAGE_UNAVAILABLE',
              'Managed model storage needs repair.',
            )
          }
          return await projectService.relinkGenerationModel(tabId as string, (saved) =>
            modelService.resolvePortableGenerationCheckpoint(saved),
          )
        },
      )
      const runProjectDocumentAction = (tabId: string, action: () => Promise<ProjectTab>) =>
        projectGenerationGate.run(tabId, async () => {
          if (resolvingClose || generationAcceptance?.hasPendingHandoff(tabId)) {
            throw new ProjectGenerationAcceptanceError(
              'ACCEPTANCE_HANDOFF_PENDING',
              'Finish the Project close or accepted-result recovery before changing the Project.',
            )
          }
          return await action()
        })
      registerProjectHandler(
        ipcChannels.projects.setGenerationVae,
        (args) =>
          args.length === 2 && isProjectId(args[0]) && isProjectGenerationModelSelection(args[1]),
        (tabId, selection) =>
          runProjectDocumentAction(tabId as string, async () => {
            const chosen = selection as ProjectGenerationModelSelection
            if (chosen === null) {
              return projectService.setGenerationVae(tabId as string, null)
            }
            if (!modelStorageAvailable) {
              throw new ModelServiceError(
                'MODEL_STORAGE_UNAVAILABLE',
                'Managed model storage needs repair.',
              )
            }
            return projectService.setGenerationVae(tabId as string, () =>
              modelService.resolveGenerationVae(chosen.resourceId, chosen.versionId),
            )
          }),
      )
      registerProjectHandler(ipcChannels.projects.relinkGenerationVae, oneProjectId, (tabId) =>
        runProjectDocumentAction(tabId as string, async () => {
          if (!modelStorageAvailable) {
            throw new ModelServiceError(
              'MODEL_STORAGE_UNAVAILABLE',
              'Managed model storage needs repair.',
            )
          }
          return projectService.relinkGenerationVae(tabId as string, (saved) =>
            modelService.resolvePortableGenerationVae(saved),
          )
        }),
      )
      registerProjectHandler(
        ipcChannels.projects.relinkGenerationEmbedding,
        (args) => args.length === 2 && isProjectId(args[0]) && isProjectEmbeddingIdentity(args[1]),
        (tabId, identity) =>
          runProjectDocumentAction(tabId as string, async () => {
            if (!modelStorageAvailable) {
              throw new ModelServiceError(
                'MODEL_STORAGE_UNAVAILABLE',
                'Managed model storage needs repair.',
              )
            }
            return projectService.relinkGenerationEmbedding(
              tabId as string,
              identity as ProjectEmbeddingIdentity,
              (saved) => modelService.resolvePortableGenerationEmbedding(saved),
            )
          }),
      )
      registerProjectHandler(
        ipcChannels.projects.setPrimaryBbox,
        (args) => args.length === 2 && isProjectId(args[0]) && isProjectRect(args[1]),
        (tabId, rect) => projectService.setPrimaryBbox(tabId as string, rect as IgsRectV1),
      )
      registerProjectHandler(
        ipcChannels.projects.updateGenerationDraft,
        (args) => {
          const change = args[1]
          return (
            args.length === 3 &&
            isProjectId(args[0]) &&
            isProjectGenerationDraftChange(change) &&
            (args[2] === null ||
              (isHistoryGroupId(args[2]) &&
                (change.kind === 'positive-prompt' || change.kind === 'negative-prompt')))
          )
        },
        (tabId, change, historyGroupId) =>
          projectService.updateGenerationDraft(
            tabId as string,
            change as ProjectGenerationDraftChange,
            (historyGroupId as string | null) ?? undefined,
          ),
      )
      registerProjectHandler(
        ipcChannels.projects.sealPromptHistory,
        (args) =>
          args.length === 2 &&
          isProjectId(args[0]) &&
          (args[1] === null || isHistoryGroupId(args[1])),
        (tabId, historyGroupId) =>
          projectGenerationGate.run(tabId as string, () =>
            projectService.sealPromptHistory(
              tabId as string,
              (historyGroupId as string | null) ?? undefined,
            ),
          ),
      )
      registerProjectHandler(ipcChannels.projects.undo, oneProjectId, (tabId) =>
        runProjectDocumentAction(tabId as string, () => projectService.undo(tabId as string)),
      )
      registerProjectHandler(ipcChannels.projects.redo, oneProjectId, (tabId) =>
        runProjectDocumentAction(tabId as string, () => projectService.redo(tabId as string)),
      )
      registerProjectHandler(ipcChannels.projects.clearHistory, oneProjectId, (tabId) =>
        runProjectDocumentAction(tabId as string, () =>
          projectService.clearHistory(tabId as string),
        ),
      )
      registerProjectHandler(
        ipcChannels.projects.updateRasterLayer,
        (args) =>
          args.length === 3 &&
          isProjectId(args[0]) &&
          isRasterLayerId(args[1]) &&
          isProjectRasterLayerChange(args[2]),
        (tabId, layerId, change) =>
          projectService.updateRasterLayer(
            tabId as string,
            layerId as string,
            change as ProjectRasterLayerChange,
          ),
      )
      registerProjectHandler(
        ipcChannels.projects.moveRasterLayer,
        (args) =>
          args.length === 3 &&
          isProjectId(args[0]) &&
          isRasterLayerId(args[1]) &&
          Number.isSafeInteger(args[2]) &&
          (args[2] as number) >= 0,
        (tabId, layerId, targetIndex) =>
          projectService.moveRasterLayer(tabId as string, layerId as string, targetIndex as number),
      )
      registerProjectHandler(
        ipcChannels.projects.importRasterImage,
        oneProjectId,
        async (tabId) => {
          if (!projectService.getOpenTabs().some((tab) => tab.id === tabId)) {
            throw new ProjectServiceError(
              'PROJECT_NOT_OPEN',
              'Open the Project before importing an image.',
            )
          }
          if (!(await resolveProjectImageWorker())) {
            throw new ProjectServiceError(
              'PROJECT_WORKER_UNAVAILABLE',
              'Set up the image runtime before importing a Raster Layer.',
            )
          }
          const selection = await dialog.showOpenDialog(window, {
            filters: [{ extensions: ['png', 'jpg', 'jpeg', 'webp'], name: 'Images' }],
            properties: ['openFile'],
            title: 'Import image as Raster Layer',
          })
          if (selection.canceled || selection.filePaths.length !== 1) {
            return null
          }
          const result = await targetInspectionOwner.useWorker((worker) =>
            projectService.importRasterImage(tabId as string, selection.filePaths[0], worker),
          )
          if (!result) {
            throw new ProjectServiceError(
              'PROJECT_WORKER_UNAVAILABLE',
              'The image worker is unavailable. The Project was not changed.',
            )
          }
          return result
        },
      )
      registerProjectHandler(ipcChannels.projects.save, oneProjectId, (tabId) =>
        projectGenerationGate.run(tabId as string, () => saveProjectWithPreview(tabId as string)),
      )
      registerProjectHandler(
        ipcChannels.projects.rebuildPreview,
        oneProjectId,
        async (projectId) => {
          try {
            const result = await targetInspectionOwner.useWorker((worker) =>
              projectService.rebuildPreview(projectId as string, worker),
            )
            if (result) {
              return result
            }
          } catch (error) {
            if (!(error instanceof ProjectWorkerError)) {
              throw error
            }
            throw new ProjectServiceError(
              'PROJECT_WORKER_UNAVAILABLE',
              'The image worker could not start. The saved Project was not changed.',
            )
          }
          throw new ProjectServiceError(
            'PROJECT_WORKER_UNAVAILABLE',
            'Set up the image runtime before rebuilding a Project preview.',
          )
        },
      )
      registerProjectHandler(ipcChannels.projects.getCloseImpact, oneProjectId, (tabId) =>
        projectGenerationClose.getCloseImpact(tabId as string),
      )
      registerProjectHandler(ipcChannels.projects.listGenerationResults, oneProjectId, (tabId) =>
        generationResults.list(tabId as string),
      )
      registerProjectHandler(
        ipcChannels.projects.acceptGenerationCandidates,
        (args) => {
          const selected = args[1]
          const expected = args[3]
          const unfinished = args.length === 4 ? [] : args[4]
          return (
            (args.length === 4 || args.length === 5) &&
            isProjectId(args[0]) &&
            Array.isArray(selected) &&
            selected.length >= 1 &&
            selected.length <= 64 &&
            selected.every(isCandidateId) &&
            new Set(selected).size === selected.length &&
            (args[2] === null || isCandidateId(args[2])) &&
            Array.isArray(expected) &&
            expected.length >= selected.length &&
            expected.length <= IGS_SAFETY_CEILINGS.archiveEntries &&
            expected.every(isCandidateId) &&
            new Set(expected).size === expected.length &&
            selected.every((id: string) => expected.includes(id)) &&
            Array.isArray(unfinished) &&
            unfinished.length <= IGS_SAFETY_CEILINGS.archiveEntries &&
            unfinished.every(isCandidateId) &&
            new Set(unfinished).size === unfinished.length
          )
        },
        async (
          tabId,
          candidateIds,
          focusedCandidateId,
          expectedAvailableIds,
          expectedUnfinishedJobIds = [],
        ) => {
          if (resolvingClose) {
            throw new ProjectGenerationAcceptanceError(
              'ACCEPTANCE_CONFLICT',
              'Wait for the application close decision before adding results.',
            )
          }
          if (!generationAcceptance) {
            throw new ProjectServiceError(
              'PROJECT_NOT_READY',
              'Temporary result recovery is unavailable. Try again after repair.',
            )
          }
          await generationAcceptance.accept(
            tabId as string,
            candidateIds as string[],
            focusedCandidateId as string | null,
            expectedAvailableIds as string[],
            expectedUnfinishedJobIds as string[],
          )
          const tab = projectService.getOpenTabs().find((item) => item.id === tabId)
          if (!tab) {
            throw new ProjectServiceError('PROJECT_NOT_OPEN', 'Open the Project first.')
          }
          return tab
        },
      )
      registerProjectHandler(
        ipcChannels.projects.saveGenerationCandidateImage,
        (args) => args.length === 2 && isProjectId(args[0]) && isCandidateId(args[1]),
        (tabId, candidateId) => candidateImageExporter.save(tabId as string, candidateId as string),
      )
      registerProjectHandler(ipcChannels.projects.close, closeProjectArgs, (tabId, confirm) =>
        projectGenerationClose.close(tabId as string, {
          confirmCloseImpact: confirm as boolean,
          discardDocument: false,
        }),
      )
      registerProjectHandler(
        ipcChannels.projects.discardAndClose,
        closeProjectArgs,
        (tabId, confirm) =>
          projectGenerationClose.close(tabId as string, {
            confirmCloseImpact: confirm as boolean,
            discardDocument: true,
          }),
      )

      registerModelHandler(ipcChannels.models.getCatalog, noArgs, () =>
        modelService.getCatalog({ buildPreviews: true }),
      )
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
        ipcChannels.models.setPredictionType,
        (args) =>
          args.length === 3 &&
          typeof args[0] === 'string' &&
          typeof args[1] === 'string' &&
          (args[2] === 'epsilon' || args[2] === 'v_prediction'),
        async (resourceId, versionId, predictionType) => {
          await modelService.setPredictionType(
            resourceId as string,
            versionId as string,
            predictionType as 'epsilon' | 'v_prediction',
          )
        },
      )
      registerModelHandler(
        ipcChannels.models.setNoiseProfile,
        (args) =>
          args.length === 3 &&
          typeof args[0] === 'string' &&
          typeof args[1] === 'string' &&
          isCheckpointNoiseProfileChange(args[2]),
        async (resourceId, versionId, change) => {
          await modelService.setNoiseProfile(
            resourceId as string,
            versionId as string,
            change as SetCheckpointNoiseProfileChange,
          )
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
