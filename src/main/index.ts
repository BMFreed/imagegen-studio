import {
  ipcChannels,
  isCheckpointNoiseProfileChange,
  isProjectEmbeddingIdentity,
  isProjectGenerationDraftChange,
  isProjectGenerationModelSelection,
  isProjectLoraIdentity,
  isProjectRasterLayerChange,
  isProjectRegionalGuidanceMaskEditRequest,
  isProjectSmartPatchLayerChange,
  isProjectSmartPatchMaskEditRequest,
} from '../shared/api.js'
import type {
  ApiResult,
  ModelCatalogItem,
  ProjectCreateInput,
  ProjectEmbeddingIdentity,
  ProjectGenerateOptions,
  ProjectGenerationDraftChange,
  ProjectGenerationModelSelection,
  ProjectLoraIdentity,
  ProjectOpenResult,
  ProjectRasterLayerChange,
  ProjectRegionalGuidanceMaskEditRequest,
  ProjectSmartPatchLayerChange,
  ProjectSmartPatchMaskEditRequest,
  ProjectSmartPatchVariantChange,
  RuntimeStatus,
  SetCheckpointNoiseProfileChange,
} from '../shared/api.js'
import { parsePresetApplication } from '../shared/presets/preset-application.js'
import {
  parseSmartPatchPresetApplicationRequest,
  parseSmartPatchPresetApplicationReviewRequest,
} from '../shared/presets/smart-patch-preset-application.js'
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
import { isProjectCreateInput } from '../shared/projects/project-create.js'
import {
  isProjectDocumentId,
  isProjectGenerateOptions,
} from '../shared/projects/project-generation-actions.js'
import { isGenerationTargetKey } from '../shared/projects/project-generation-target-state.js'
import { ProjectMaskError } from '../shared/projects/project-mask.js'
import { validateProjectRenameName } from '../shared/projects/project-rename.js'
import { IGS_SAFETY_CEILINGS, IgsSchemaError } from '../shared/projects/project-schema.js'
import type { IgsRectV1 } from '../shared/projects/project-schema.js'
import {
  isProjectWorkspaceAddInput,
  isProjectWorkspaceId,
  parseProjectWorkspaceAddInput,
} from '../shared/projects/project-workspaces.js'
import { reconcilePromptEmbeddings } from '../shared/projects/prompt-embeddings.js'
import {
  isProjectRegionalGuidanceChange,
  isProjectRegionalGuidanceDocumentOwner,
  isProjectRegionalGuidanceHistoryGroupId,
  isProjectRegionalGuidanceOwner,
  isProjectRegionalGuidancePromptChangeForOwner,
  isProjectRegionalGuidanceReferenceImageChange,
  type ProjectRegionalGuidanceChange,
  type ProjectRegionalGuidanceDocumentOwner,
  type ProjectRegionalGuidanceOwner,
  type ProjectRegionalGuidancePromptChange,
  type ProjectRegionalGuidanceReferenceImageChange,
} from '../shared/projects/regional-guidance.js'
import {
  isProjectSmartPatchAcceptRequest,
  isProjectSmartPatchCandidateExportRequest,
  isProjectSmartPatchDiscardRequest,
  isProjectSmartPatchGenerateOptions,
  isProjectSmartPatchRasterAcceptRequest,
  type ProjectSmartPatchAcceptRequest,
  type ProjectSmartPatchCandidateExportRequest,
  type ProjectSmartPatchDiscardRequest,
  type ProjectSmartPatchGenerateOptions,
  type ProjectSmartPatchRasterAcceptRequest,
} from '../shared/projects/smart-patch-public-generation.js'
import { isProjectSmartPatchVariantChange } from '../shared/projects/smart-patch-variants.js'
import {
  isSmartResultComparisonRequest,
  type SmartResultComparisonRequest,
} from '../shared/projects/smart-result-comparison.js'
import {
  isSmartResultPresetRequest,
  type SmartResultPresetRequest,
} from '../shared/projects/smart-result-preset.js'
import { WINDOW_CLOSE_CANCELED_MESSAGE, WindowCloseCanceledError } from '../shared/window-close.js'

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  protocol,
  safeStorage,
  shell,
} from 'electron'
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
import { registerPresetIpc } from './presets/preset-ipc.js'
import { PresetRepository } from './presets/preset-repository.js'
import { PresetService } from './presets/preset-service.js'
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
import { GenerationProgressSource } from './projects/generation-progress-source.js'
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
  ProjectGenerationAcceptanceRecovery,
  ProjectGenerationAcceptanceRecoveryError,
} from './projects/project-generation-acceptance-recovery.js'
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
import { ProjectGenerationStagingLifecycle } from './projects/project-generation-staging-lifecycle.js'
import { releaseCanceledWindowCloseFences } from './projects/project-generation-window-close.js'
import { ProjectIdentityError } from './projects/project-identity.js'
import { ProjectIndexError, ProjectIndexRepository } from './projects/project-index.js'
import {
  parseProjectLayerImageUrl,
  streamSavedProjectLayer,
  streamStagedProjectLayer,
} from './projects/project-layer-resource.js'
import {
  parseProjectMaskImageUrl,
  streamSavedProjectMask,
  streamStagedProjectMask,
} from './projects/project-mask-resource.js'
import { withProjectPathLock } from './projects/project-path-lock.js'
import {
  parseProjectThumbnailImageUrl,
  readProjectThumbnail,
} from './projects/project-preview-resource.js'
import { ProjectRegionalGenerationCoordinator } from './projects/project-regional-generation-coordinator.js'
import {
  parseProjectRegionalMaskImageUrl,
  streamSavedProjectRegionalMask,
} from './projects/project-regional-mask-resource.js'
import {
  parseProjectRegionalReferenceThumbnailUrl,
  streamSavedProjectRegionalReferenceThumbnail,
  streamStagedProjectRegionalReferenceThumbnail,
} from './projects/project-regional-reference-resource.js'
import { ProjectRelocationStoreError } from './projects/project-relocation-store.js'
import { ProjectService, ProjectServiceError } from './projects/project-service.js'
import { ProjectSessionError } from './projects/project-session.js'
import { ProjectShadowError, ProjectShadowStore } from './projects/project-shadow.js'
import { SmartPatchAcceptancePlanError } from './projects/project-smart-patch-acceptance-plan.js'
import {
  ProjectSmartPatchAcceptance,
  ProjectSmartPatchAcceptanceError,
} from './projects/project-smart-patch-acceptance.js'
import { SmartPatchAdoptionError } from './projects/project-smart-patch-adoption.js'
import { ProjectSmartPatchGenerationActionController } from './projects/project-smart-patch-generation-action-controller.js'
import { ProjectSmartPatchResultActions } from './projects/project-smart-patch-result-actions.js'
import {
  ProjectSmartPatchResultResource,
  SmartPatchPublicResultError,
} from './projects/project-smart-patch-result-resource.js'
import { inspectSmartPatchVariantsWithOptionalWorker } from './projects/project-smart-patch-variant-inspection.js'
import { SmartPatchVariantProjectionError } from './projects/project-smart-patch-variant-projection.js'
import { ProjectTargetInspectionOwner } from './projects/project-target-inspection-owner.js'
import {
  inspectTemporaryRecovery,
  type ProjectTemporaryRecoveryInspection,
  unavailableTemporaryRecovery,
} from './projects/project-temporary-recovery.js'
import { ProjectTrashStoreError } from './projects/project-trash-store.js'
import { RasterImportError } from './projects/raster-import.js'
import {
  readGenerationAcceptanceKind,
  SmartPatchAcceptanceJournalError,
  SmartPatchAcceptanceJournalRepository,
} from './projects/smart-patch-acceptance-journal.js'
import { SmartPatchProcessorError } from './projects/smart-patch-generation-processor.js'
import { SmartPatchGenerationStagingError } from './projects/smart-patch-generation-staging.js'
import { ProjectWorkerClient, ProjectWorkerError } from './projects/worker-client.js'
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
    privileges: {
      corsEnabled: true,
      secure: true,
      standard: true,
      stream: true,
      supportFetchAPI: true,
    },
    scheme: 'igs-mask',
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
  {
    privileges: {
      corsEnabled: true,
      secure: true,
      standard: true,
      stream: true,
      supportFetchAPI: true,
    },
    scheme: 'igs-smart-staging',
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
      const presetService = new PresetService(new PresetRepository(database.db), {
        onCleanupError: () => console.error('Expired preset cleanup could not be completed.'),
      })
      const closeStorage = async () => {
        await presetService.shutdown()
        await database.close()
      }
      closeDatabase = closeStorage
      await presetService.start()
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
        const reference = parseProjectRegionalReferenceThumbnailUrl(request.url)
        if (reference) {
          try {
            const asset = projectService.getRegionalReferenceThumbnail(reference)
            if (!asset) {
              return new Response('Reference thumbnail not found.', { status: 404 })
            }
            return asset.kind === 'staged'
              ? await streamStagedProjectRegionalReferenceThumbnail(asset.source, asset.member)
              : await streamSavedProjectRegionalReferenceThumbnail(asset.filePath, asset.member)
          } catch {
            return new Response('Reference thumbnail unavailable.', { status: 503 })
          }
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
      protocol.handle('igs-mask', async (request) => {
        if (request.method !== 'GET') {
          return new Response('Method not allowed.', { status: 405 })
        }
        const regional = parseProjectRegionalMaskImageUrl(request.url)
        if (regional) {
          try {
            const asset = projectService.getRegionalMaskAsset(regional)
            if (!asset) {
              return new Response('Mask not found.', { status: 404 })
            }
            return asset.kind === 'staged'
              ? await streamStagedProjectMask(asset.source, asset.member)
              : await streamSavedProjectRegionalMask(asset.filePath, asset.member)
          } catch {
            return new Response('Mask unavailable.', { status: 503 })
          }
        }
        const resource = parseProjectMaskImageUrl(request.url)
        if (!resource) {
          return new Response('Mask not found.', { status: 404 })
        }
        try {
          const asset = projectService.getMaskAsset(resource)
          if (!asset) {
            return new Response('Mask not found.', { status: 404 })
          }
          return asset.kind === 'staged'
            ? await streamStagedProjectMask(asset.source, asset.member)
            : await streamSavedProjectMask(asset.filePath, asset.member)
        } catch {
          return new Response('Mask unavailable.', { status: 503 })
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
      const generationStagingLifecycle = recoveredGeneration
        ? new ProjectGenerationStagingLifecycle(
            recoveredGeneration.staging,
            recoveredGeneration.smartPatchStaging,
          )
        : null
      const generationLifecycleServices =
        recoveredGeneration && generationStagingLifecycle
          ? { ...recoveredGeneration, staging: generationStagingLifecycle }
          : null
      readTemporaryRecovery = (projectKey) =>
        inspectTemporaryRecovery(generationStagingLifecycle, projectKey)
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
        withSmartPatchGenerationPreparation: async () => null,
      }
      const smartPatchExecution = recoveredGeneration
        ? recoveredGeneration.orchestrator.createSmartPatchExecution(
            recoveredGeneration.smartPatchStaging,
            {
              confirmUnconfirmedStartupExit: async () => {
                if (!(await ProjectWorkerClient.retryUnconfirmedStartExit())) {
                  throw new ProjectWorkerError(
                    'WORKER_EXIT_UNCONFIRMED',
                    'The image worker has not confirmed exit.',
                  )
                }
              },
              start: async (signal) => {
                if (!generationRuntime) {
                  throw new ProjectGenerationActionError(
                    'GENERATION_RUNTIME_UNAVAILABLE',
                    'The installed image engine is unavailable.',
                  )
                }
                return await generationRuntime.startSmartPatchOutputWorker(
                  path.join(paths.dataRoot, 'scratch'),
                  signal,
                )
              },
            },
          )
        : null
      const regionalGeneration = recoveredGeneration
        ? new ProjectRegionalGenerationCoordinator({
            compositionProfile: 'invoke-canvas-v1',
            gate: projectGenerationGate,
            models: modelService,
            orchestrator: recoveredGeneration.orchestrator,
            projects: projectService,
            regionalReferenceResources: recoveredGeneration.regionalReferenceResources,
            scratchBasePath: path.join(paths.dataRoot, 'scratch'),
          })
        : null
      const generationProgress = new GenerationProgressSource([
        ...(recoveredGeneration ? [recoveredGeneration.processor] : []),
        ...(smartPatchExecution ? [smartPatchExecution] : []),
        ...(regionalGeneration ? [regionalGeneration] : []),
      ])
      const generationDispatch = recoveredGeneration
        ? new GenerationDispatchCoordinator(
            generationLease,
            recoveredGeneration.orchestrator,
            recoveredGeneration.processor,
            path.join(paths.dataRoot, 'scratch'),
            smartPatchExecution
              ? {
                  execution: smartPatchExecution,
                  nextPending: recoveredGeneration.orchestrator.nextDispatchableKind.bind(
                    recoveredGeneration.orchestrator,
                  ),
                }
              : undefined,
            regionalGeneration ?? undefined,
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
              regional: regionalGeneration ?? undefined,
              runtime: generationLease,
              scratchBasePath: path.join(paths.dataRoot, 'scratch'),
              staging: recoveredGeneration.staging,
            })
          : null
      const smartPatchActions =
        recoveredGeneration && generationActions
          ? new ProjectSmartPatchGenerationActionController({
              gate: projectGenerationGate,
              infillResolver: recoveredGeneration.infillResolver,
              models: modelService,
              orchestrator: recoveredGeneration.orchestrator,
              projects: projectService,
              queue: recoveredGeneration.queue,
              runtime: generationLease,
              scratchBasePath: path.join(paths.dataRoot, 'scratch'),
              seedReader: recoveredGeneration.staging,
              staging: recoveredGeneration.smartPatchStaging,
              wakeDispatch: generationActions.requestDrain.bind(generationActions),
              withAdmission: generationActions.withExternalAdmission.bind(generationActions),
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
            smartPatch: {
              orchestrator: recoveredGeneration.orchestrator,
              queue: recoveredGeneration.queue,
              staging: recoveredGeneration.smartPatchStaging,
            },
            staging: recoveredGeneration.staging,
          })
        : null
      const smartPatchAcceptance = recoveredGeneration
        ? new ProjectSmartPatchAcceptance({
            gate: projectGenerationGate,
            journal: new SmartPatchAcceptanceJournalRepository(database.db),
            normalStaging: recoveredGeneration.staging,
            orchestrator: recoveredGeneration.orchestrator,
            projects: projectService,
            queue: recoveredGeneration.queue,
            staging: recoveredGeneration.smartPatchStaging,
          })
        : null
      const acceptanceRecovery =
        recoveredGeneration && generationAcceptance && smartPatchAcceptance
          ? new ProjectGenerationAcceptanceRecovery({
              documents: projectService,
              gate: projectGenerationGate,
              orchestrator: recoveredGeneration.orchestrator,
              raster: generationAcceptance,
              readKind: (tabId, documentId) =>
                readGenerationAcceptanceKind(database.db, tabId, documentId),
              smartPatch: smartPatchAcceptance,
            })
          : null
      const projectGenerationClose = new ProjectGenerationClose(
        projectService,
        generationLifecycleServices,
        projectGenerationGate,
        (tabId) => acceptanceRecovery?.hasPendingHandoff(tabId) ?? false,
      )
      const projectGenerationRecovery = new ProjectGenerationRecovery(
        projectService,
        generationLifecycleServices,
        projectGenerationGate,
      )
      openImportedProject = (projectId) => projectGenerationRecovery.open(projectId)
      async function withClosedProjectMaintenance<T>(
        projectId: string,
        use: () => Promise<T>,
        allowCleanOpen = false,
        missingEntryAction: 'locate-workspace' | 'locate' | 'remove' | null = null,
      ): Promise<T> {
        return await projectGenerationGate.run(projectId, async () => {
          const tab = projectService.getOpenTabs().find((candidate) => candidate.id === projectId)
          if (tab && (!allowCleanOpen || tab.dirty)) {
            throw new ProjectServiceError(
              'PROJECT_ALREADY_OPEN',
              missingEntryAction === 'locate-workspace'
                ? 'Close all Projects from this workspace before locating its folder.'
                : missingEntryAction === 'locate'
                  ? 'Close the Project before locating its missing file.'
                  : missingEntryAction === 'remove'
                    ? 'Close the Project before removing its missing entry from Home.'
                    : 'Close the Project before changing its location or Trash state.',
            )
          }
          const services = generationLifecycleServices
          if (!services) {
            throw new ProjectServiceError(
              'PROJECT_INVALID_INPUT',
              missingEntryAction === 'locate-workspace'
                ? 'Generation recovery cannot be inspected. Restore access before locating the workspace folder.'
                : missingEntryAction === 'locate'
                  ? 'Generation recovery cannot be inspected. Restore access before locating the missing Project file.'
                  : missingEntryAction === 'remove'
                    ? 'Generation recovery cannot be inspected. Restore access before removing the missing entry from Home.'
                    : 'Generation recovery cannot be inspected. Repair recovery storage before changing Project location or Trash state.',
            )
          }
          return await services.orchestrator.withProjectMaintenanceFence(projectId, async () => {
            const unfinished = await services.queue.listUnfinishedByProject(projectId)
            const candidates = await services.staging.listOwnedCandidates(projectId)
            if (
              unfinished.length ||
              candidates.length ||
              acceptanceRecovery?.hasPendingHandoff(projectId)
            ) {
              throw new ProjectServiceError(
                'PROJECT_INVALID_INPUT',
                missingEntryAction === 'locate-workspace'
                  ? 'Restore access and resolve pending generation or results for every Project before locating the workspace folder.'
                  : missingEntryAction === 'locate'
                    ? 'Restore access to the Project and resolve its pending generation or results before locating its missing file.'
                    : missingEntryAction === 'remove'
                      ? 'Restore access to the Project and resolve its pending generation or results before removing its missing entry from Home.'
                      : 'Open the Project and resolve its pending generation or results before changing its location or Trash state.',
              )
            }
            return await use()
          })
        })
      }
      const reconcileOpenedProject = async (
        tabId: string,
        wasOpen: boolean,
      ): Promise<string | null> =>
        await reconcileOpenedProjectGeneration(
          tabId,
          wasOpen,
          recoveredGeneration?.orchestrator ?? null,
          acceptanceRecovery,
        )
      const generationResults = new ProjectGenerationResultResource(
        recoveredGeneration?.staging ?? null,
        (tabId) => projectService.getOpenDocumentId(tabId),
        recoveredGeneration?.queue ?? null,
      )
      const smartPatchResults = new ProjectSmartPatchResultResource({
        makeThumbnail: (bytes, size) =>
          nativeImage
            .createFromBuffer(bytes)
            .resize({ ...size, quality: 'good' })
            .toPNG(),
        projects: projectService,
        queue: recoveredGeneration?.queue ?? null,
        readLastActualSeed: recoveredGeneration
          ? recoveredGeneration.staging.readLastActualSeed.bind(recoveredGeneration.staging)
          : null,
        staging: recoveredGeneration?.smartPatchStaging ?? null,
      })
      const smartPatchResultActions =
        recoveredGeneration && smartPatchAcceptance && generationAcceptance
          ? new ProjectSmartPatchResultActions({
              acceptance: smartPatchAcceptance,
              chooseDestination: (defaultFileName) =>
                dialog.showSaveDialog(window, {
                  defaultPath: defaultFileName,
                  filters: [{ extensions: ['png'], name: 'PNG Images' }],
                  title: 'Save Smart Patch Candidate Image',
                }),
              gate: projectGenerationGate,
              normalStaging: recoveredGeneration.staging,
              orchestrator: recoveredGeneration.orchestrator,
              projects: projectService,
              queue: recoveredGeneration.queue,
              rasterAcceptance: generationAcceptance,
              staging: recoveredGeneration.smartPatchStaging,
              withWorker: (use) => targetInspectionOwner.useWorker(use),
            })
          : null
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
      protocol.handle('igs-smart-staging', async (request) => {
        const headers = {
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store',
          'Content-Type': 'image/png',
          'X-Content-Type-Options': 'nosniff',
        }
        if (request.method !== 'GET') {
          return new Response('Method not allowed.', { headers, status: 405 })
        }
        try {
          const bytes =
            new URL(request.url).hostname === 'thumbnail'
              ? await smartPatchResults.readThumbnail(request.url)
              : await smartPatchResults.readImage(request.url)
          return bytes
            ? new Response(new Uint8Array(bytes), { headers })
            : new Response('Smart Patch result not found.', { headers, status: 404 })
        } catch {
          return new Response('Smart Patch result unavailable.', { headers, status: 503 })
        }
      })
      const appShutdown = new GenerationAppShutdown({
        closeDatabase: closeStorage,
        context: ownedGenerationContext,
        coordinator: generationActions
          ? {
              shutdown: async () => {
                const smart = smartPatchActions?.shutdown()
                await generationActions.shutdown()
                await smart
              },
            }
          : null,
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
      const unsubscribeProgress = generationProgress.onProgress((snapshot) => {
        if (!window.webContents.isDestroyed()) {
          window.webContents.send(ipcChannels.projects.generationProgress, snapshot)
        }
      })
      window.on('closed', () => {
        unsubscribeProgress()
        generationProgress.dispose()
      })
      if (unsubscribeGeneration) {
        window.on('closed', unsubscribeGeneration)
      }

      // Closing the native window follows the same Save / Discard / Cancel contract as a tab.
      // This also covers Alt+F4 and app.quit(), which do not go through renderer controls.
      let closingAfterResolution = false
      let resolvingClose = false
      let rendererCloseHandlerReady = false
      const onCloseEditorReady = (event: Electron.IpcMainEvent, ...args: unknown[]): void => {
        if (
          event.sender === window.webContents &&
          event.senderFrame === window.webContents.mainFrame &&
          args.length === 0
        ) {
          rendererCloseHandlerReady = true
        }
      }
      ipcMain.on(ipcChannels.projects.windowCloseEditorReady, onCloseEditorReady)
      window.webContents.on('did-start-loading', () => {
        rendererCloseHandlerReady = false
      })
      window.webContents.on('render-process-gone', () => {
        rendererCloseHandlerReady = false
      })
      window.on('closed', () =>
        ipcMain.removeListener(ipcChannels.projects.windowCloseEditorReady, onCloseEditorReady),
      )
      function flushRendererDraftsBeforeClose(): Promise<void> {
        return new Promise((resolve, reject) => {
          const requestId = randomUUID()
          let settled = false
          let timeout: ReturnType<typeof setTimeout> | null = null
          const finish = (error: Error | null): void => {
            if (settled) {
              return
            }
            settled = true
            if (timeout !== null) {
              clearTimeout(timeout)
            }
            ipcMain.removeListener(ipcChannels.projects.windowCloseReady, onReady)
            ipcMain.removeListener(
              ipcChannels.projects.windowCloseDecisionPending,
              onDecisionPending,
            )
            window.webContents.removeListener('render-process-gone', onRendererUnavailable)
            window.webContents.removeListener('did-start-loading', onRendererUnavailable)
            window.webContents.removeListener('destroyed', onRendererUnavailable)
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
            if (
              event.sender !== window.webContents ||
              event.senderFrame !== window.webContents.mainFrame ||
              responseId !== requestId
            ) {
              return
            }
            finish(
              errorMessage === null
                ? null
                : errorMessage === WINDOW_CLOSE_CANCELED_MESSAGE
                  ? new WindowCloseCanceledError()
                  : new Error(
                      typeof errorMessage === 'string'
                        ? errorMessage
                        : 'The Project draft could not be flushed.',
                    ),
            )
          }
          const armTimeout = (): void => {
            if (timeout !== null) {
              clearTimeout(timeout)
            }
            timeout = setTimeout(
              () => finish(new Error('The Project editor did not respond before closing.')),
              10_000,
            )
          }
          const onDecisionPending = (
            event: Electron.IpcMainEvent,
            responseId: unknown,
            pending: unknown,
            ...extra: unknown[]
          ): void => {
            if (
              settled ||
              event.sender !== window.webContents ||
              event.senderFrame !== window.webContents.mainFrame ||
              responseId !== requestId ||
              typeof pending !== 'boolean' ||
              extra.length !== 0
            ) {
              return
            }
            // Human Save/Discard/Cancel decisions have no deadline. Writes retain the watchdog.
            if (pending) {
              if (timeout !== null) {
                clearTimeout(timeout)
              }
              timeout = null
            } else {
              armTimeout()
            }
          }
          const onRendererUnavailable = (): void => {
            finish(new Error('The editor became unavailable before closing.'))
          }
          armTimeout()
          ipcMain.on(ipcChannels.projects.windowCloseReady, onReady)
          ipcMain.on(ipcChannels.projects.windowCloseDecisionPending, onDecisionPending)
          window.webContents.once('render-process-gone', onRendererUnavailable)
          window.webContents.once('did-start-loading', onRendererUnavailable)
          window.webContents.once('destroyed', onRendererUnavailable)
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
            if (projectService.getOpenTabs().length > 0 || rendererCloseHandlerReady) {
              await flushRendererDraftsBeforeClose()
            }
            const tabs = projectService.getOpenTabs()
            // An Add admitted before native close must finish its shadow handoff before close
            // snapshots staging or fences dispatch. New Add requests see resolvingClose.
            for (const tab of tabs) {
              await projectGenerationGate.drain(tab.id)
            }
            const unresolvedTab = tabs.find((tab) => acceptanceRecovery?.hasPendingHandoff(tab.id))
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
            if (!(error instanceof WindowCloseCanceledError)) {
              dialog.showErrorBox(
                'Project close failed',
                error instanceof Error ? error.message : 'The Project could not be closed.',
              )
            }
          } finally {
            if (!closeCommitted) {
              releaseCanceledWindowCloseFences(
                fencedTabs,
                (tabId) => acceptanceRecovery?.hasPendingHandoff(tabId) ?? false,
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
      registerPresetIpc(ipcMain, window.webContents, presetService)
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
      const isOptionalPatchTarget = (value: unknown): boolean =>
        value === null || isProjectDocumentId(value)
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
      // The catalog directory is a separate lock key from each Project file. Import's internal
      // Open callback takes only the existing Project gate, so it cannot re-enter this lock.
      const workspaceCatalogChannels = new Set<string>([
        ipcChannels.projects.addWorkspace,
        ipcChannels.projects.create,
        ipcChannels.projects.deleteProjectPermanently,
        ipcChannels.projects.finishImport,
        ipcChannels.projects.list,
        ipcChannels.projects.listTrash,
        ipcChannels.projects.listWorkspaces,
        ipcChannels.projects.locateProject,
        ipcChannels.projects.locateWorkspace,
        ipcChannels.projects.moveProject,
        ipcChannels.projects.open,
        ipcChannels.projects.rebuildPreview,
        ipcChannels.projects.removeMissingProject,
        ipcChannels.projects.removeWorkspace,
        ipcChannels.projects.renameProject,
        ipcChannels.projects.resolveRecovery,
        ipcChannels.projects.restoreProject,
        ipcChannels.projects.revealProject,
        ipcChannels.projects.revealWorkspace,
        ipcChannels.projects.selectImport,
        ipcChannels.projects.trashProject,
        ipcChannels.projects.updateWorkspace,
      ])
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
            const value = workspaceCatalogChannels.has(channel)
              ? await withProjectPathLock(paths.dataRoot, () => handler(...args))
              : await handler(...args)
            return { ok: true, value }
          } catch (error) {
            if (
              channel === ipcChannels.projects.generate ||
              channel === ipcChannels.projects.generateSmartPatch ||
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
              error instanceof ProjectMaskError ||
              error instanceof ProjectCandidateImageExportError ||
              error instanceof ProjectGenerationCloseError ||
              error instanceof ProjectGenerationRecoveryError ||
              error instanceof ProjectGenerationAcceptanceError ||
              error instanceof ProjectGenerationAcceptanceRecoveryError ||
              error instanceof ProjectSmartPatchAcceptanceError ||
              error instanceof SmartPatchPublicResultError ||
              error instanceof SmartPatchAcceptancePlanError ||
              error instanceof SmartPatchVariantProjectionError ||
              error instanceof SmartPatchAcceptanceJournalError ||
              error instanceof SmartPatchAdoptionError ||
              error instanceof SmartPatchGenerationStagingError ||
              error instanceof SmartPatchProcessorError ||
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
              error instanceof ProjectTrashStoreError ||
              error instanceof ProjectRelocationStoreError ||
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

      registerProjectHandler(
        ipcChannels.projects.list,
        (args) => args.length === 0 || (args.length === 1 && isProjectWorkspaceId(args[0])),
        (workspaceId) => projectService.list(workspaceId as string | undefined),
      )
      registerProjectHandler(ipcChannels.projects.listWorkspaces, noArgs, () =>
        projectService.listWorkspaces(),
      )
      registerProjectHandler(
        ipcChannels.projects.moveProject,
        (args) => args.length === 2 && isProjectId(args[0]) && isProjectWorkspaceId(args[1]),
        async (id, workspaceId) => {
          try {
            return await withClosedProjectMaintenance(
              id as string,
              () => projectService.moveProject(id as string, workspaceId as string),
              true,
            )
          } finally {
            if (!window.isDestroyed()) {
              window.webContents.send(
                ipcChannels.projects.tabsChanged,
                projectService.getOpenTabs(),
              )
            }
          }
        },
      )
      registerProjectHandler(
        ipcChannels.projects.renameProject,
        (args) =>
          args.length === 2 && isProjectId(args[0]) && validateProjectRenameName(args[1]) === null,
        async (id, name) => {
          try {
            return await withClosedProjectMaintenance(
              id as string,
              () => projectService.renameProject(id as string, name as string),
              true,
            )
          } finally {
            if (!window.isDestroyed()) {
              window.webContents.send(
                ipcChannels.projects.tabsChanged,
                projectService.getOpenTabs(),
              )
            }
          }
        },
      )
      registerProjectHandler(ipcChannels.projects.listTrash, noArgs, () =>
        projectService.listTrash(),
      )
      registerProjectHandler(ipcChannels.projects.trashProject, oneProjectId, (id) =>
        withClosedProjectMaintenance(id as string, () => projectService.trashProject(id as string)),
      )
      registerProjectHandler(
        ipcChannels.projects.restoreProject,
        (args) => args.length === 2 && isProjectId(args[0]) && isProjectDocumentId(args[1]),
        (id, trashId) =>
          projectGenerationGate.run(id as string, () =>
            projectService.restoreProject(id as string, trashId as string),
          ),
      )
      registerProjectHandler(
        ipcChannels.projects.deleteProjectPermanently,
        (args) =>
          args.length === 3 &&
          isProjectId(args[0]) &&
          isProjectDocumentId(args[1]) &&
          args[2] === true,
        (id, trashId) =>
          withClosedProjectMaintenance(id as string, () =>
            projectService.deleteProjectPermanently(id as string, trashId as string),
          ),
      )
      registerProjectHandler(ipcChannels.projects.revealProject, oneProjectId, (id) =>
        projectService.revealProject(id as string, (file) => shell.showItemInFolder(file)),
      )
      registerProjectHandler(
        ipcChannels.projects.revealWorkspace,
        (args) => args.length === 1 && isProjectWorkspaceId(args[0]),
        (id) =>
          projectService.revealWorkspace(id as string, (directory) => shell.openPath(directory)),
      )
      registerProjectHandler(
        ipcChannels.projects.updateWorkspace,
        (args) =>
          args.length === 2 && isProjectWorkspaceId(args[0]) && isProjectWorkspaceAddInput(args[1]),
        (id, input) =>
          projectService.updateWorkspace(id as string, parseProjectWorkspaceAddInput(input)),
      )
      registerProjectHandler(ipcChannels.projects.locateProject, oneProjectId, (id) =>
        withClosedProjectMaintenance(
          id as string,
          () =>
            projectService.locateProject(id as string, async () => {
              const selection = await dialog.showOpenDialog(window, {
                filters: [{ extensions: ['igs'], name: 'ImageGen Studio Project' }],
                properties: ['openFile'],
                title: 'Locate Project',
              })
              return selection.canceled || selection.filePaths.length !== 1
                ? null
                : selection.filePaths[0]
            }),
          false,
          'locate',
        ),
      )
      registerProjectHandler(
        ipcChannels.projects.locateWorkspace,
        (args) => args.length === 1 && isProjectWorkspaceId(args[0]),
        (id) =>
          projectService.locateWorkspace(
            id as string,
            async () => {
              const selection = await dialog.showOpenDialog(window, {
                properties: ['openDirectory'],
                title: 'Locate Workspace Folder',
              })
              return selection.canceled || selection.filePaths.length !== 1
                ? null
                : selection.filePaths[0]
            },
            (ids, use) => {
              const projectIds = [...ids].sort()
              const withNext = (index: number): Promise<boolean> =>
                index === projectIds.length
                  ? use()
                  : withClosedProjectMaintenance(
                      projectIds[index],
                      () => withNext(index + 1),
                      false,
                      'locate-workspace',
                    )
              return withNext(0)
            },
          ),
      )
      registerProjectHandler(
        ipcChannels.projects.removeMissingProject,
        (args) => args.length === 2 && isProjectId(args[0]) && args[1] === true,
        (id) =>
          withClosedProjectMaintenance(
            id as string,
            () => projectService.removeMissingProject(id as string),
            false,
            'remove',
          ),
      )
      registerProjectHandler(
        ipcChannels.projects.removeWorkspace,
        (args) => args.length === 2 && isProjectWorkspaceId(args[0]) && args[1] === true,
        (id) => projectService.removeWorkspace(id as string),
      )
      registerProjectHandler(
        ipcChannels.projects.addWorkspace,
        (args) => args.length === 1 && isProjectWorkspaceAddInput(args[0]),
        async (input) => {
          const metadata = parseProjectWorkspaceAddInput(input)
          const selection = await dialog.showOpenDialog(window, {
            properties: ['openDirectory', 'createDirectory'],
            title: 'Add Workspace',
          })
          if (selection.canceled || selection.filePaths.length !== 1) {
            return null
          }
          return projectService.addWorkspace(metadata, selection.filePaths[0])
        },
      )
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
        ipcChannels.projects.getSmartPatchVariants,
        (args) =>
          args.length === 4 && isProjectId(args[0]) && args.slice(1).every(isProjectDocumentId),
        async (tabId, layerId, documentId, documentRevision) => {
          let catalog: ModelCatalogItem[] | null = null
          try {
            catalog = await modelService.getCatalog({ buildPreviews: false })
          } catch {
            // Unknown registry availability must not hide stored images or pretend they are missing.
          }
          const read = (worker?: Parameters<ProjectService['getSmartPatchVariants']>[4]) =>
            projectService.getSmartPatchVariants(
              tabId as string,
              layerId as string,
              documentId as string,
              documentRevision as string,
              worker,
              catalog,
            )
          return await inspectSmartPatchVariantsWithOptionalWorker(targetInspectionOwner, read)
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
        ipcChannels.projects.getRasterPresetData,
        (args) =>
          args.length === 3 &&
          isProjectId(args[0]) &&
          isProjectDocumentId(args[1]) &&
          isProjectDocumentId(args[2]),
        (tabId, documentId, layerId) =>
          projectService.getRasterGenerationData(
            tabId as string,
            documentId as string,
            layerId as string,
          ),
      )
      registerProjectHandler(
        ipcChannels.projects.getSmartResultComparisonData,
        (args) =>
          args.length === 2 && isProjectId(args[0]) && isSmartResultComparisonRequest(args[1]),
        async (tabId, request) =>
          await projectService.getSmartResultComparisonData(
            tabId as string,
            request as SmartResultComparisonRequest,
            // The service's final ownership/epoch check must follow actual worker lease close.
            (use) =>
              targetInspectionOwner.read(
                async (provider) => (provider ? await provider(use) : null),
                'comparison',
              ),
          ),
      )
      registerProjectHandler(
        ipcChannels.projects.getSmartResultPresetData,
        (args) => args.length === 2 && isProjectId(args[0]) && isSmartResultPresetRequest(args[1]),
        async (tabId, request) =>
          projectService.getSmartResultPresetData(
            tabId as string,
            request as SmartResultPresetRequest,
          ),
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
      registerProjectHandler(ipcChannels.projects.getGenerationProgress, noArgs, async () =>
        generationProgress.getProgressSnapshot(),
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
      const requireSmartPatchResultActions = () => {
        if (!smartPatchResultActions) {
          throw new SmartPatchPublicResultError(
            'PROJECT_NOT_READY',
            'Smart Patch recovery storage is unavailable. Editing and Save remain available.',
          )
        }
        return smartPatchResultActions
      }
      const assertSmartActionOpen = (tabId: string) => {
        if (resolvingClose || acceptanceRecovery?.hasPendingHandoff(tabId)) {
          throw new SmartPatchPublicResultError(
            'ACCEPTANCE_HANDOFF_PENDING',
            'Finish the Project close or accepted-result recovery before changing temporary Smart Patch results.',
          )
        }
      }
      registerProjectHandler(
        ipcChannels.projects.generateSmartPatch,
        (args) =>
          args.length === 2 && isProjectId(args[0]) && isProjectSmartPatchGenerateOptions(args[1]),
        async (tabId, request) => {
          assertSmartActionOpen(tabId as string)
          if (!smartPatchActions) {
            throw new ProjectGenerationActionError(
              'GENERATION_RUNTIME_UNAVAILABLE',
              'Smart Patch generation storage is unavailable. Editing and Save remain available.',
            )
          }
          return await smartPatchActions.generate(
            tabId as string,
            request as ProjectSmartPatchGenerateOptions,
          )
        },
      )
      registerProjectHandler(
        ipcChannels.projects.listSmartPatchGenerationResults,
        oneProjectId,
        (tabId) => smartPatchResults.list(tabId as string),
      )
      registerProjectHandler(
        ipcChannels.projects.getSmartPatchGenerationTargetState,
        (args) =>
          args.length === 4 && isProjectId(args[0]) && args.slice(1).every(isProjectDocumentId),
        (tabId, documentId, documentRevision, layerId) =>
          requireSmartPatchResultActions().targetState(
            tabId as string,
            documentId as string,
            documentRevision as string,
            layerId as string,
          ),
      )
      registerProjectHandler(
        ipcChannels.projects.acceptSmartPatchVariants,
        (args) =>
          args.length === 2 && isProjectId(args[0]) && isProjectSmartPatchAcceptRequest(args[1]),
        async (tabId, request) => {
          if (resolvingClose || !acceptanceRecovery) {
            throw new SmartPatchPublicResultError(
              'ACCEPTANCE_HANDOFF_PENDING',
              'Finish recovery or the application close decision before adding Smart Patch results.',
            )
          }
          return await acceptanceRecovery.withSmartPatchAdd(tabId as string, () =>
            requireSmartPatchResultActions().accept(
              tabId as string,
              request as ProjectSmartPatchAcceptRequest,
            ),
          )
        },
      )
      registerProjectHandler(
        ipcChannels.projects.acceptSmartPatchRaster,
        (args) =>
          args.length === 2 &&
          isProjectId(args[0]) &&
          isProjectSmartPatchRasterAcceptRequest(args[1]),
        async (tabId, input) => {
          if (resolvingClose || !acceptanceRecovery) {
            throw new SmartPatchPublicResultError(
              'ACCEPTANCE_HANDOFF_PENDING',
              'Finish recovery or the application close decision before adding Smart Patch results.',
            )
          }
          const id = tabId as string
          const request = structuredClone(input as ProjectSmartPatchRasterAcceptRequest)
          const owner = projectService.getOpenDocumentForAcceptance(id)
          if (
            !owner ||
            owner.document.documentId !== request.documentId ||
            owner.document.documentRevision !== request.documentRevision
          ) {
            throw new SmartPatchPublicResultError(
              'PROJECT_DOCUMENT_CHANGED',
              'The Project changed. Review the current Smart Patch results before Add as Raster Layer.',
            )
          }
          const epoch = owner.documentEpoch
          return await acceptanceRecovery.withRasterAdd(id, () => {
            if (
              projectService.getOpenDocumentForAcceptance(id) !== owner ||
              owner.documentEpoch !== epoch
            ) {
              throw new SmartPatchPublicResultError(
                'PROJECT_DOCUMENT_CHANGED',
                'The Project changed before Raster Add was admitted. Review its temporary results again.',
              )
            }
            return requireSmartPatchResultActions().acceptRaster(id, request, epoch)
          })
        },
      )
      registerProjectHandler(
        ipcChannels.projects.discardSmartPatchGenerationResults,
        (args) =>
          args.length === 2 && isProjectId(args[0]) && isProjectSmartPatchDiscardRequest(args[1]),
        async (tabId, request) => {
          assertSmartActionOpen(tabId as string)
          return await requireSmartPatchResultActions().discard(
            tabId as string,
            request as ProjectSmartPatchDiscardRequest,
          )
        },
      )
      registerProjectHandler(
        ipcChannels.projects.saveSmartPatchCandidateImage,
        (args) =>
          args.length === 2 &&
          isProjectId(args[0]) &&
          isProjectSmartPatchCandidateExportRequest(args[1]),
        (tabId, request) =>
          requireSmartPatchResultActions().save(
            tabId as string,
            request as ProjectSmartPatchCandidateExportRequest,
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
          (args.length === 2 || (args.length === 3 && isProjectWorkspaceId(args[2]))) &&
          isImportId(args[0]) &&
          (args[1] === 'move' || args[1] === 'copy'),
        async (importId, choice, workspaceId) => {
          const previouslyOpen = new Set(projectService.getOpenTabs().map((tab) => tab.id))
          const imported = await projectService.finishImport(
            importId as string,
            choice as 'copy' | 'move',
            workspaceId as string | undefined,
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
        (args) => args.length === 1 && isProjectCreateInput(args[0]),
        async (input) => {
          const tab = await projectService.create(input as ProjectCreateInput)
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
          args.length === 3 &&
          isOptionalPatchTarget(args[2]) &&
          ((args) =>
            args.length === 2 &&
            isProjectId(args[0]) &&
            args[1] !== null &&
            isProjectGenerationModelSelection(args[1]))(args.slice(0, 2)),
        async (tabId, selection, targetLayerId) => {
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
          return projectService.addGenerationLora(
            tabId as string,
            resource,
            (targetLayerId as string | null) ?? undefined,
          )
        },
      )
      registerProjectHandler(
        ipcChannels.projects.removeGenerationLora,
        (args) =>
          args.length === 3 &&
          isOptionalPatchTarget(args[2]) &&
          ((args) => args.length === 2 && isProjectId(args[0]) && isProjectLoraIdentity(args[1]))(
            args.slice(0, 2),
          ),
        (tabId, identity, targetLayerId) =>
          projectService.removeGenerationLora(
            tabId as string,
            identity as ProjectLoraIdentity,
            (targetLayerId as string | null) ?? undefined,
          ),
      )
      registerProjectHandler(
        ipcChannels.projects.setGenerationModel,
        (args) =>
          args.length === 3 &&
          isOptionalPatchTarget(args[2]) &&
          ((args) =>
            args.length === 2 &&
            isProjectId(args[0]) &&
            isProjectGenerationModelSelection(args[1]))(args.slice(0, 2)),
        async (tabId, selection, targetLayerId) => {
          const chosen = selection as ProjectGenerationModelSelection
          if (chosen === null) {
            return await projectService.setGenerationModel(
              tabId as string,
              null,
              (targetLayerId as string | null) ?? undefined,
            )
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
          return await projectService.setGenerationModel(
            tabId as string,
            model,
            (targetLayerId as string | null) ?? undefined,
          )
        },
      )
      registerProjectHandler(
        ipcChannels.projects.relinkGenerationLora,
        (args) =>
          args.length === 3 &&
          isOptionalPatchTarget(args[2]) &&
          ((args) => args.length === 2 && isProjectId(args[0]) && isProjectLoraIdentity(args[1]))(
            args.slice(0, 2),
          ),
        async (tabId, identity, targetLayerId) => {
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
            (targetLayerId as string | null) ?? undefined,
          )
        },
      )
      registerProjectHandler(
        ipcChannels.projects.relinkGenerationModel,
        (args) =>
          args.length === 2 && isOptionalPatchTarget(args[1]) && oneProjectId(args.slice(0, 1)),
        async (tabId, targetLayerId) => {
          if (!modelStorageAvailable) {
            throw new ModelServiceError(
              'MODEL_STORAGE_UNAVAILABLE',
              'Managed model storage needs repair.',
            )
          }
          return await projectService.relinkGenerationModel(
            tabId as string,
            (saved) => modelService.resolvePortableGenerationCheckpoint(saved),
            (targetLayerId as string | null) ?? undefined,
          )
        },
      )
      const runProjectDocumentAction = <T>(tabId: string, action: () => Promise<T>) =>
        projectGenerationGate.run(tabId, async () => {
          if (resolvingClose || acceptanceRecovery?.hasPendingHandoff(tabId)) {
            throw new ProjectGenerationAcceptanceError(
              'ACCEPTANCE_HANDOFF_PENDING',
              'Finish the Project close or accepted-result recovery before changing the Project.',
            )
          }
          return await action()
        })
      registerProjectHandler(
        ipcChannels.projects.addRegionalGuidance,
        (args) =>
          args.length === 2 &&
          isProjectId(args[0]) &&
          isProjectRegionalGuidanceDocumentOwner(args[1]),
        (tabId, owner) =>
          runProjectDocumentAction(tabId as string, () =>
            projectService.addRegionalGuidance(
              tabId as string,
              owner as ProjectRegionalGuidanceDocumentOwner,
            ),
          ),
      )
      registerProjectHandler(
        ipcChannels.projects.updateRegionalGuidance,
        (args) =>
          args.length === 3 &&
          isProjectId(args[0]) &&
          isProjectRegionalGuidanceOwner(args[1]) &&
          isProjectRegionalGuidanceChange(args[2]),
        (tabId, owner, change) =>
          runProjectDocumentAction(tabId as string, () =>
            projectService.updateRegionalGuidance(
              tabId as string,
              owner as ProjectRegionalGuidanceOwner,
              change as ProjectRegionalGuidanceChange,
            ),
          ),
      )
      registerProjectHandler(
        ipcChannels.projects.updateRegionalGuidancePrompt,
        (args) =>
          args.length === 3 &&
          isProjectId(args[0]) &&
          isProjectRegionalGuidanceOwner(args[1]) &&
          isProjectRegionalGuidancePromptChangeForOwner(args[2], args[1]),
        (tabId, owner, change) =>
          runProjectDocumentAction(tabId as string, () =>
            projectService.updateRegionalGuidancePrompt(
              tabId as string,
              owner as ProjectRegionalGuidanceOwner,
              change as ProjectRegionalGuidancePromptChange,
            ),
          ),
      )
      registerProjectHandler(
        ipcChannels.projects.duplicateRegionalGuidance,
        (args) =>
          args.length === 2 && isProjectId(args[0]) && isProjectRegionalGuidanceOwner(args[1]),
        (tabId, owner) =>
          runProjectDocumentAction(tabId as string, () =>
            projectService.duplicateRegionalGuidance(
              tabId as string,
              owner as ProjectRegionalGuidanceOwner,
            ),
          ),
      )
      registerProjectHandler(
        ipcChannels.projects.importRegionalGuidanceReferenceImage,
        (args) =>
          args.length === 2 && isProjectId(args[0]) && isProjectRegionalGuidanceOwner(args[1]),
        (tabId, owner) =>
          runProjectDocumentAction(tabId as string, () =>
            projectService.importRegionalGuidanceReferenceImage(
              tabId as string,
              owner as ProjectRegionalGuidanceOwner,
              async () => {
                if (!(await resolveProjectImageWorker())) {
                  throw new ProjectServiceError(
                    'PROJECT_WORKER_UNAVAILABLE',
                    'Set up the image runtime before importing a regional reference image.',
                  )
                }
                const selection = await dialog.showOpenDialog(window, {
                  filters: [{ extensions: ['png', 'jpg', 'jpeg', 'webp'], name: 'Images' }],
                  properties: ['openFile'],
                  title: 'Add Regional Guidance reference image',
                })
                return selection.canceled || selection.filePaths.length !== 1
                  ? null
                  : selection.filePaths[0]
              },
              {
                createImportThumbnail: async (input) => {
                  const result = await targetInspectionOwner.useWorker((worker) =>
                    worker.createImportThumbnail(input),
                  )
                  if (!result) {
                    throw new ProjectServiceError(
                      'PROJECT_WORKER_UNAVAILABLE',
                      'The image worker is unavailable. The Project was not changed.',
                    )
                  }
                  return result
                },
                normalizeImport: async (input) => {
                  const result = await targetInspectionOwner.useWorker((worker) =>
                    worker.normalizeImport(input),
                  )
                  if (!result) {
                    throw new ProjectServiceError(
                      'PROJECT_WORKER_UNAVAILABLE',
                      'The image worker is unavailable. The Project was not changed.',
                    )
                  }
                  return result
                },
              },
            ),
          ),
      )
      registerProjectHandler(
        ipcChannels.projects.updateRegionalGuidanceReferenceImage,
        (args) =>
          args.length === 3 &&
          isProjectId(args[0]) &&
          isProjectRegionalGuidanceOwner(args[1]) &&
          isProjectRegionalGuidanceReferenceImageChange(args[2]),
        (tabId, owner, change) =>
          runProjectDocumentAction(tabId as string, () =>
            projectService.updateRegionalGuidanceReferenceImage(
              tabId as string,
              owner as ProjectRegionalGuidanceOwner,
              change as ProjectRegionalGuidanceReferenceImageChange,
            ),
          ),
      )
      registerProjectHandler(
        ipcChannels.projects.deleteRegionalGuidance,
        (args) =>
          args.length === 2 && isProjectId(args[0]) && isProjectRegionalGuidanceOwner(args[1]),
        (tabId, owner) =>
          runProjectDocumentAction(tabId as string, () =>
            projectService.deleteRegionalGuidance(
              tabId as string,
              owner as ProjectRegionalGuidanceOwner,
            ),
          ),
      )
      registerProjectHandler(ipcChannels.projects.addSmartPatchLayer, oneProjectId, (tabId) =>
        runProjectDocumentAction(tabId as string, () =>
          projectService.addSmartPatchLayer(tabId as string),
        ),
      )
      registerProjectHandler(
        ipcChannels.projects.editRegionalGuidanceMask,
        (args) =>
          args.length === 3 &&
          isProjectId(args[0]) &&
          isProjectDocumentId(args[1]) &&
          isProjectRegionalGuidanceMaskEditRequest(args[2]),
        (tabId, regionId, request) =>
          runProjectDocumentAction(tabId as string, () =>
            projectService.editRegionalGuidanceMask(
              tabId as string,
              regionId as string,
              request as ProjectRegionalGuidanceMaskEditRequest,
            ),
          ),
      )
      registerProjectHandler(
        ipcChannels.projects.editSmartPatchMask,
        (args) =>
          args.length === 3 &&
          isProjectId(args[0]) &&
          isProjectDocumentId(args[1]) &&
          isProjectSmartPatchMaskEditRequest(args[2]),
        (tabId, layerId, request) =>
          runProjectDocumentAction(tabId as string, () =>
            projectService.editSmartPatchMask(
              tabId as string,
              layerId as string,
              request as ProjectSmartPatchMaskEditRequest,
            ),
          ),
      )
      registerProjectHandler(
        ipcChannels.projects.updateSmartPatchLayer,
        (args) =>
          args.length === 3 &&
          isProjectId(args[0]) &&
          isProjectDocumentId(args[1]) &&
          isProjectSmartPatchLayerChange(args[2]),
        (tabId, layerId, change) =>
          runProjectDocumentAction(tabId as string, () =>
            projectService.updateSmartPatchLayer(
              tabId as string,
              layerId as string,
              change as ProjectSmartPatchLayerChange,
            ),
          ),
      )
      registerProjectHandler(
        ipcChannels.projects.updateSmartPatchVariant,
        (args) =>
          args.length === 3 &&
          isProjectId(args[0]) &&
          isProjectDocumentId(args[1]) &&
          isProjectSmartPatchVariantChange(args[2]),
        (tabId, layerId, change) =>
          runProjectDocumentAction(tabId as string, () =>
            projectService.updateSmartPatchVariant(
              tabId as string,
              layerId as string,
              change as ProjectSmartPatchVariantChange,
            ),
          ),
      )
      registerProjectHandler(
        ipcChannels.projects.getSmartPatchPresetApplicationReview,
        (args) => args.length === 2 && isProjectId(args[0]),
        async (tabId, input) => {
          let request: ReturnType<typeof parseSmartPatchPresetApplicationReviewRequest>
          try {
            request = parseSmartPatchPresetApplicationReviewRequest(input)
          } catch {
            throw new ProjectServiceError(
              'PROJECT_INVALID_INPUT',
              'Choose a valid Smart Patch to review.',
            )
          }
          if (resolvingClose || acceptanceRecovery?.hasPendingHandoff(tabId as string)) {
            throw new ProjectGenerationAcceptanceError(
              'ACCEPTANCE_HANDOFF_PENDING',
              'Finish Project recovery before applying a preset.',
            )
          }
          return projectService.getSmartPatchPresetApplicationReview(tabId as string, request)
        },
      )
      registerProjectHandler(
        ipcChannels.projects.applySmartPatchPreset,
        (args) => args.length === 2 && isProjectId(args[0]),
        async (tabId, input) => {
          let request: ReturnType<typeof parseSmartPatchPresetApplicationRequest>
          try {
            request = parseSmartPatchPresetApplicationRequest(input)
          } catch {
            throw new ProjectServiceError(
              'PROJECT_INVALID_INPUT',
              'Choose valid preset sections. Size cannot be applied to a Smart Patch.',
            )
          }
          return runProjectDocumentAction(tabId as string, () =>
            projectService.applySmartPatchPreset(
              tabId as string,
              request,
              async (selection, current) => {
                await modelService.verifyPresetApplication(selection, current)
                if (!(await presetService.get(selection.sourcePresetId))) {
                  throw new ProjectServiceError(
                    'PROJECT_INVALID_INPUT',
                    'This preset is no longer active. Choose it again.',
                  )
                }
              },
            ),
          )
        },
      )
      registerProjectHandler(
        ipcChannels.projects.applyPreset,
        (args) => {
          if (args.length !== 2 || !isProjectId(args[0])) {
            return false
          }
          try {
            parsePresetApplication(args[1])
            return true
          } catch {
            return false
          }
        },
        (tabId, input) =>
          runProjectDocumentAction(tabId as string, () =>
            projectService.applyPreset(
              tabId as string,
              parsePresetApplication(input),
              async (request, current) => {
                await modelService.verifyPresetApplication(request, current)
                if (!(await presetService.get(request.sourcePresetId))) {
                  throw new ProjectServiceError(
                    'PROJECT_INVALID_INPUT',
                    'This preset is no longer active. Choose it again.',
                  )
                }
              },
            ),
          ),
      )
      registerProjectHandler(
        ipcChannels.projects.setGenerationVae,
        (args) =>
          args.length === 3 &&
          isOptionalPatchTarget(args[2]) &&
          ((args) =>
            args.length === 2 &&
            isProjectId(args[0]) &&
            isProjectGenerationModelSelection(args[1]))(args.slice(0, 2)),
        (tabId, selection, targetLayerId) =>
          runProjectDocumentAction(tabId as string, async () => {
            const chosen = selection as ProjectGenerationModelSelection
            if (chosen === null) {
              return projectService.setGenerationVae(
                tabId as string,
                null,
                (targetLayerId as string | null) ?? undefined,
              )
            }
            if (!modelStorageAvailable) {
              throw new ModelServiceError(
                'MODEL_STORAGE_UNAVAILABLE',
                'Managed model storage needs repair.',
              )
            }
            return projectService.setGenerationVae(
              tabId as string,
              () => modelService.resolveGenerationVae(chosen.resourceId, chosen.versionId),
              (targetLayerId as string | null) ?? undefined,
            )
          }),
      )
      registerProjectHandler(
        ipcChannels.projects.relinkGenerationVae,
        (args) =>
          args.length === 2 && isOptionalPatchTarget(args[1]) && oneProjectId(args.slice(0, 1)),
        (tabId, targetLayerId) =>
          runProjectDocumentAction(tabId as string, async () => {
            if (!modelStorageAvailable) {
              throw new ModelServiceError(
                'MODEL_STORAGE_UNAVAILABLE',
                'Managed model storage needs repair.',
              )
            }
            return projectService.relinkGenerationVae(
              tabId as string,
              (saved) => modelService.resolvePortableGenerationVae(saved),
              (targetLayerId as string | null) ?? undefined,
            )
          }),
      )
      registerProjectHandler(
        ipcChannels.projects.relinkGenerationEmbedding,
        (args) =>
          args.length === 3 &&
          isOptionalPatchTarget(args[2]) &&
          ((args) =>
            args.length === 2 && isProjectId(args[0]) && isProjectEmbeddingIdentity(args[1]))(
            args.slice(0, 2),
          ),
        (tabId, identity, targetLayerId) =>
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
              (targetLayerId as string | null) ?? undefined,
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
        (args) =>
          args.length === 4 &&
          isOptionalPatchTarget(args[3]) &&
          ((args) => {
            const change = args[1]
            return (
              args.length === 3 &&
              isProjectId(args[0]) &&
              isProjectGenerationDraftChange(change) &&
              (args[2] === null ||
                (isHistoryGroupId(args[2]) &&
                  (change.kind === 'positive-prompt' || change.kind === 'negative-prompt')))
            )
          })(args.slice(0, 3)),
        (tabId, change, historyGroupId, targetLayerId) =>
          projectService.updateGenerationDraft(
            tabId as string,
            change as ProjectGenerationDraftChange,
            (historyGroupId as string | null) ?? undefined,
            (targetLayerId as string | null) ?? undefined,
          ),
      )
      registerProjectHandler(
        ipcChannels.projects.sealPromptHistory,
        (args) =>
          args.length === 2 &&
          isProjectId(args[0]) &&
          (args[1] === null ||
            isHistoryGroupId(args[1]) ||
            isProjectRegionalGuidanceHistoryGroupId(args[1])),
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
          if (!generationAcceptance || !acceptanceRecovery) {
            throw new ProjectServiceError(
              'PROJECT_NOT_READY',
              'Temporary result recovery is unavailable. Try again after repair.',
            )
          }
          await acceptanceRecovery.withRasterAdd(tabId as string, () =>
            generationAcceptance.accept(
              tabId as string,
              candidateIds as string[],
              focusedCandidateId as string | null,
              expectedAvailableIds as string[],
              expectedUnfinishedJobIds as string[],
            ),
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
