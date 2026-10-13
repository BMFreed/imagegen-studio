<script setup lang="ts">
import type {
  ApiResult,
  ModelCatalogItem,
  ProjectApi,
  ProjectCloseImpact,
  ProjectCreateInput,
  ProjectEmbeddingIdentity,
  ProjectGenerateOptions,
  ProjectGenerationActionState,
  ProjectGenerationDraftChange,
  ProjectGenerationResultsSnapshot,
  ProjectImportSelection,
  ProjectLoraIdentity,
  ProjectOpenResult,
  ProjectSaveResult,
  ProjectSummary,
  ProjectTab,
  RuntimeStatus,
} from '../shared/api.js'
import type { PresetApplicationRequest } from '../shared/presets/preset-application.js'
import type { PresetRecord } from '../shared/presets/preset-schema.js'
import type {
  AcceptedResultHistoryCursor,
  AcceptedResultHistoryReference,
} from '../shared/projects/accepted-result-history.js'
import type { GenerationProgressSnapshot } from '../shared/projects/generation-progress.js'
import {
  generationTargetSignature,
  hashGenerationTargetSignature,
  type ProjectGenerationTargetState,
} from '../shared/projects/project-generation-target-state.js'
import type { IgsRectV1 } from '../shared/projects/project-schema.js'
import { WINDOW_CLOSE_CANCELED_MESSAGE } from '../shared/window-close.js'

import { Home as HomeIcon, X as XIcon } from '@vicons/tabler'
import {
  darkTheme,
  NAlert,
  NButton,
  NCard,
  NConfigProvider,
  NEmpty,
  NIcon,
  NModal,
  NRadio,
  NRadioGroup,
} from 'naive-ui'
import { computed, onBeforeUnmount, onMounted, ref, toRaw, watch } from 'vue'

import type { CandidateExportFeedback } from './components/candidate-export-feedback.js'
import type {
  GenerationResultFocusRequest,
  QueueResultOpenReference,
  QueueResultReference,
} from './components/generation-queue-result.js'
import type { ModelManagerFocus } from './components/model-manager-focus.js'
import type { PresetCreateIntent } from './components/preset-create-intent.js'

import {
  type AcceptedHistoryFocusRequest,
  acceptedHistoryLayerAvailable,
} from './components/accepted-history-navigation.js'
import AcceptedResultsBrowser from './components/AcceptedResultsBrowser.vue'
import AppChrome from './components/AppChrome.vue'
import ApplyPresetModal from './components/ApplyPresetModal.vue'
import {
  GenerationQueueResultNavigator,
  resultFocusCandidate,
} from './components/generation-queue-result.js'
import GenerationQueueManager from './components/GenerationQueueManager.vue'
import HomeView from './components/HomeView.vue'
import ModelManager from './components/ModelManager.vue'
import NewProjectModal from './components/NewProjectModal.vue'
import PresetManager from './components/PresetManager.vue'
import { ProjectDraftSync } from './components/project-draft-sync.js'
import { createProjectPresetIntent } from './components/project-preset-draft.js'
import ProjectView from './components/ProjectView.vue'
import { createResultPresetIntent } from './components/result-preset-draft.js'
import RuntimeNotice from './components/RuntimeNotice.vue'
import { imageGenNaiveTheme } from './theme/naive-theme.js'

type RecoveryDecision = Extract<ProjectOpenResult, { kind: 'recovery-required' }>
type ImportTransfer = Extract<ProjectImportSelection, { kind: 'transfer-required' }>
type CandidateSelection = { candidateIds: string[]; focusedCandidateId: string | null }
type PendingAcceptance = {
  candidateIds: string[]
  expectedCandidateIds: string[]
  expectedUnfinishedJobIds: string[]
  focusedCandidateId: string | null
  tabId: string
  uncheckedCandidateIds: string[]
}
type PendingGeneration = {
  candidateIds: string[]
  documentId: string
  iterations: number
  tabId: string
  unfinishedJobIds: string[]
}
type PendingProjectAction =
  | { kind: 'create' | 'import-finish' | 'import-select' | 'recover' }
  | { kind: 'open' | 'rebuild'; projectId: string }
  | {
      kind:
        | 'accept-candidate'
        | 'bbox'
        | 'clear-history'
        | 'close'
        | 'discard'
        | 'export-candidate'
        | 'generate'
        | 'history'
        | 'import-image'
        | 'layer'
        | 'model'
        | 'preset'
        | 'redo'
        | 'save'
        | 'undo'
      tabId: string
    }

const homeOpen = ref(true)
const activeDocument = ref<string | null>('home')
const modelManagerOpen = ref(false)
const presetManagerOpen = ref(false)
const presetManagerInitialId = ref<string | null>(null)
const presetManagerCreateIntent = ref<PresetCreateIntent | null>(null)
let presetCreateEpoch = 0
const presetCatalog = ref<PresetRecord[]>([])
const presetCatalogLoading = ref(false)
const presetCatalogError = ref<string | null>(null)
let presetCatalogEpoch = 0
let presetOpeningEpoch = 0
const presetApplication = ref<{ documentId: string; source: PresetRecord; tabId: string } | null>(
  null,
)
const presetApplyOpen = ref(false)
const presetApplyError = ref<string | null>(null)
const presetApplyBusy = ref(false)
const presetModelHandoff = ref<{
  application: NonNullable<typeof presetApplication.value>
  catalogSettled: boolean
  focus: ModelManagerFocus
  managerHidden: boolean
  phase: 'models' | 'refreshing' | 'suspending'
} | null>(null)
const presetApplyTab = computed(() => {
  const application = presetApplication.value
  return application
    ? (projectTabs.value.find(
        (tab) => tab.id === application.tabId && tab.documentId === application.documentId,
      ) ?? null)
    : null
})
const presetApplyCurrent = computed(
  () =>
    presetApplyTab.value && {
      generationDraft:
        generationDraftOverlays.value[presetApplyTab.value.id] ??
        presetApplyTab.value.generationDraft,
      primaryBbox: presetApplyTab.value.primaryBbox,
    },
)
const presetManager = ref<InstanceType<typeof PresetManager> | null>(null)
const generationQueueOpen = ref(false)
const generationQueueEpoch = ref(0)
const queueResultOpeningId = ref<string | null>(null)
const queueResultNavigationError = ref<string | null>(null)
const generationResultFocusByTab = ref<Record<string, GenerationResultFocusRequest>>({})
const modelManagerFocus = ref<ModelManagerFocus | null>(null)
const projects = ref<ProjectSummary[]>([])
const projectTabs = ref<ProjectTab[]>([])
const modelCatalog = ref<ModelCatalogItem[]>([])
const modelCatalogError = ref<string | null>(null)
const modelCatalogLoaded = ref(false)
const modelCatalogLoading = ref(false)
const generationDraftOverlays = ref<Record<string, ProjectTab['generationDraft']>>({})
const promptHistoryEpochs = ref<Record<string, number>>({})
const generationResultsByTab = ref<Record<string, ProjectGenerationResultsSnapshot>>({})
const generationResultsErrors = ref<Record<string, string | null>>({})
const generationResultsLoading = ref<Record<string, boolean>>({})
const generationResultsRequests = new Map<string, number>()
const generationStatesByTab = ref<Record<string, ProjectGenerationActionState>>({})
const generationStateErrors = ref<Record<string, string | null>>({})
const generationStateLoading = ref<Record<string, boolean>>({})
const generationNotices = ref<Record<string, string | null>>({})
const generationCanceling = ref<Record<string, boolean>>({})
const imagesPerClickByTab = ref<Record<string, number | null>>({})
const generationStateRequests = new Map<string, number>()
const generationCommandRequests = new Map<string, number>()
const generationCancelRequests = new Map<string, number>()
const draftValidity = ref<Record<string, boolean>>({})
const projectsLoading = ref(false)
const homeError = ref<string | null>(null)
const tabErrors = ref<Record<string, string | null>>({})
const exportFeedbackByTab = ref<Record<string, CandidateExportFeedback | null>>({})
const exportFeedbackTimers = new Map<string, ReturnType<typeof setTimeout>>()
const saveNotices = ref<Record<string, string | null>>({})
const reloadRequiredIds = ref<Set<string>>(new Set())
const globalNotice = ref<string | null>(null)
const pendingProjectAction = ref<PendingProjectAction | null>(null)
const pendingAcceptance = ref<PendingAcceptance | null>(null)
const pendingGeneration = ref<PendingGeneration | null>(null)
const generationCommitting = ref(false)
const generationConfirmationNotice = ref<string | null>(null)
const acceptanceActionLabel = computed(() => {
  const decision = pendingAcceptance.value
  if (!decision) {
    return 'Add'
  }
  const actions = [`Add ${decision.candidateIds.length}`]
  if (decision.expectedUnfinishedJobIds.length) {
    actions.push(`Cancel ${decision.expectedUnfinishedJobIds.length}`)
  }
  if (decision.uncheckedCandidateIds.length) {
    actions.push(`Discard ${decision.uncheckedCandidateIds.length}`)
  }
  return actions.join(', ')
})
const acceptanceCommitting = ref(false)
const acceptanceNotice = ref<{ message: string; type: 'error' | 'warning' } | null>(null)
const recoveryDecision = ref<RecoveryDecision | null>(null)
const recoveryError = ref<string | null>(null)
const closingTabId = ref<string | null>(null)
const closeImpact = ref<ProjectCloseImpact | null>(null)
const closeError = ref<string | null>(null)
const showNewProject = ref(false)
const newProjectError = ref<string | null>(null)
const importTransfer = ref<ImportTransfer | null>(null)
const importDialogVisible = ref(false)
const importChoice = ref<'copy' | 'move'>('move')

const status = ref<RuntimeStatus | null>(null)
const runtimeError = ref<string | null>(null)
const runtimePending = ref<'check' | 'install' | 'repair' | null>(null)
const windowClosePending = ref(false)
let unsubscribeStatus: (() => void) | undefined
let unsubscribeProjectTabs: (() => void) | undefined
let unsubscribeBeforeWindowClose: (() => void) | undefined
let unsubscribeModelInstall: (() => void) | undefined
const generationProgress = ref<GenerationProgressSnapshot>({ current: null, revision: 0 })
let unsubscribeProgress: (() => void) | undefined
let unsubscribeGeneration: (() => void) | undefined
let projectListRequest = 0
let modelCatalogRequest = 0
let rendererDisposed = false

const activeTab = computed(
  () => projectTabs.value.find((tab) => tab.id === activeDocument.value) ?? null,
)
const activeImagesPerClick = computed<number | null>({
  get: () => {
    const id = activeTab.value?.id
    return id && Object.hasOwn(imagesPerClickByTab.value, id) ? imagesPerClickByTab.value[id] : 4
  },
  set: (value) => {
    if (activeTab.value) {
      imagesPerClickByTab.value = { ...imagesPerClickByTab.value, [activeTab.value.id]: value }
    }
  },
})
const runtimeUnavailableReason = computed(() => {
  if (runtimeError.value) {
    return 'Check the image generation connection with Check again above.'
  }
  switch (status.value?.kind) {
    case 'needs-repair': {
      return 'Use Repair in the image generation notice above before generating.'
    }
    case 'not-installed': {
      return 'Use Set up in the image generation notice above before generating.'
    }
    case 'ready': {
      return null
    }
    case 'unsupported': {
      return 'Generation is unavailable on this computer. See the image generation notice above.'
    }
    default: {
      return 'Wait for the image generation check above.'
    }
  }
})
const closingTab = computed(
  () => projectTabs.value.find((tab) => tab.id === closingTabId.value) ?? null,
)
const closeHasGeneration = computed(() => hasGenerationCloseImpact(closeImpact.value))

function hasGenerationCloseImpact(impact: ProjectCloseImpact | null): boolean {
  return Boolean(
    impact &&
    (impact.generationStorageUnavailable ||
      impact.completedCandidateCount > 0 ||
      impact.unfinishedJobCount > 0),
  )
}

function openModelManager(focus: ModelManagerFocus | null = null, fromPresetHandoff = false) {
  if (presetModelHandoff.value && !fromPresetHandoff) {
    presetApplyOpen.value = false
    presetModelHandoff.value = null
  }
  modelManagerFocus.value = focus
  modelManagerOpen.value = true
}
function currentPresetModelHandoff(request: NonNullable<typeof presetModelHandoff.value>) {
  return (
    presetModelHandoff.value === request &&
    presetApplication.value === request.application &&
    presetApplyOpen.value &&
    !modelManagerOpen.value &&
    activeTab.value?.id === request.application.tabId &&
    activeTab.value.documentId === request.application.documentId &&
    presetApplyTab.value !== null &&
    !pendingProjectAction.value &&
    !windowClosePending.value &&
    !reloadRequiredIds.value.has(request.application.tabId)
  )
}
function openPresetResourceModels(focus: ModelManagerFocus) {
  const application = presetApplication.value
  if (
    !application ||
    !presetApplyOpen.value ||
    presetApplyBusy.value ||
    presetModelHandoff.value ||
    modelManagerOpen.value ||
    pendingProjectAction.value ||
    windowClosePending.value ||
    activeTab.value?.id !== application.tabId ||
    activeTab.value.documentId !== application.documentId ||
    reloadRequiredIds.value.has(application.tabId)
  ) {
    return
  }
  presetModelHandoff.value = {
    application,
    catalogSettled: false,
    focus: JSON.parse(JSON.stringify(focus)) as ModelManagerFocus,
    managerHidden: false,
    phase: 'suspending',
  }
}
function openSuspendedPresetModels() {
  const request = presetModelHandoff.value
  if (!request || request.phase !== 'suspending') {
    return
  }
  if (!currentPresetModelHandoff(request)) {
    presetApplyOpen.value = false
    presetModelHandoff.value = null
    return
  }
  request.phase = 'models'
  openModelManager(request.focus, true)
}
function resumePresetAfterModels() {
  const request = presetModelHandoff.value
  if (
    !request ||
    request.phase !== 'refreshing' ||
    !request.managerHidden ||
    !request.catalogSettled
  ) {
    return
  }
  if (!currentPresetModelHandoff(request)) {
    presetApplyOpen.value = false
  }
  presetModelHandoff.value = null
}
function presetModelsDismissed() {
  const request = presetModelHandoff.value
  if (request?.phase === 'refreshing') {
    request.managerHidden = true
    resumePresetAfterModels()
  }
}

function openPresetManager() {
  ++presetCreateEpoch
  presetManagerCreateIntent.value = null
  presetManagerInitialId.value = null
  presetManagerOpen.value = true
  void refreshModelCatalog()
}
async function saveCurrentAsPreset(tabId: string, target: ProjectGenerationTargetState | null) {
  if (
    pendingProjectAction.value ||
    windowClosePending.value ||
    presetManagerOpen.value ||
    generationDraftOverlays.value[tabId] ||
    reloadRequiredIds.value.has(tabId)
  ) {
    return
  }
  const tab = projectTabs.value.find((candidate) => candidate.id === tabId)
  if (!tab || activeTab.value?.id !== tabId) {
    return
  }
  const epoch = ++presetCreateEpoch
  const snapshot: ProjectTab = JSON.parse(JSON.stringify(tab))
  const capturedTarget = target ? { ...target } : null
  try {
    const signature = generationTargetSignature(snapshot)
    const mode =
      capturedTarget?.documentId === snapshot.documentId &&
      signature &&
      capturedTarget.targetKey === (await hashGenerationTargetSignature(signature))
        ? capturedTarget.mode
        : null
    if (
      epoch !== presetCreateEpoch ||
      windowClosePending.value ||
      pendingProjectAction.value ||
      activeTab.value?.id !== tabId ||
      activeTab.value.documentId !== snapshot.documentId ||
      presetManagerOpen.value
    ) {
      return
    }
    presetManagerCreateIntent.value = createProjectPresetIntent({
      catalog:
        modelCatalogLoaded.value && !modelCatalogLoading.value && !modelCatalogError.value
          ? modelCatalog.value
          : null,
      mode,
      project: snapshot,
    })
    presetManagerInitialId.value = null
    presetManagerOpen.value = true
    void refreshModelCatalog()
  } catch (cause) {
    if (epoch === presetCreateEpoch) {
      setTabError(tabId, errorMessage(cause))
    }
  }
}
async function saveResultAsPreset(tabId: string, layerId: string) {
  if (
    pendingProjectAction.value ||
    windowClosePending.value ||
    presetManagerOpen.value ||
    reloadRequiredIds.value.has(tabId)
  ) {
    return
  }
  const tab = projectTabs.value.find((candidate) => candidate.id === tabId)
  const layer = tab?.layers.find((candidate) => candidate.id === layerId)
  const accepted = tab?.acceptedResults.find((candidate) => candidate.layerId === layerId)
  if (!tab || !layer || !accepted || activeTab.value?.id !== tabId) {
    return
  }
  const epoch = ++presetCreateEpoch
  const documentId = tab.documentId
  const layerIdentity = JSON.stringify(layer)
  const acceptedIdentity = JSON.stringify(accepted)
  const layerName = layer.name
  const projectName = tab.title
  const current = () => {
    const owner = projectTabs.value.find((candidate) => candidate.id === tabId)
    return (
      epoch === presetCreateEpoch &&
      !windowClosePending.value &&
      !pendingProjectAction.value &&
      !presetManagerOpen.value &&
      !reloadRequiredIds.value.has(tabId) &&
      activeTab.value?.id === tabId &&
      owner?.documentId === documentId &&
      JSON.stringify(owner.layers.find((candidate) => candidate.id === layerId)) ===
        layerIdentity &&
      JSON.stringify(owner.acceptedResults.find((candidate) => candidate.layerId === layerId)) ===
        acceptedIdentity
    )
  }
  try {
    const result = await projectApi().getRasterPresetData(tabId, documentId, layerId)
    if (!current()) {
      return
    }
    if (!result.ok) {
      throw new Error(result.error.message)
    }
    if (result.value.documentId !== documentId || result.value.layerId !== layerId) {
      throw new Error('The saved generation settings belong to another result.')
    }
    presetManagerCreateIntent.value = createResultPresetIntent({
      data: result.value,
      layerName,
      projectName,
    })
    presetManagerInitialId.value = null
    presetManagerOpen.value = true
    void refreshModelCatalog()
  } catch (cause) {
    if (current()) {
      setTabError(tabId, errorMessage(cause))
    }
  }
}
async function refreshPresetCatalog() {
  const epoch = ++presetCatalogEpoch
  presetCatalogLoading.value = true
  presetCatalogError.value = null
  try {
    const api = globalThis.window.api?.presets
    if (!api) {
      throw new Error('The desktop preset connection is unavailable.')
    }
    const records = await apiValue(() => api.list())
    if (epoch === presetCatalogEpoch) {
      presetCatalog.value = records
    }
  } catch (cause) {
    if (epoch === presetCatalogEpoch) {
      presetCatalog.value = []
      presetCatalogError.value = errorMessage(cause)
    }
  } finally {
    if (epoch === presetCatalogEpoch) {
      presetCatalogLoading.value = false
    }
  }
}
async function chooseProjectPreset(tabId: string, id: string) {
  const tab = projectTabs.value.find((item) => item.id === tabId)
  if (
    !tab ||
    pendingProjectAction.value ||
    windowClosePending.value ||
    reloadRequiredIds.value.has(tabId)
  ) {
    return
  }
  const epoch = ++presetOpeningEpoch
  presetApplyError.value = null
  try {
    const api = globalThis.window.api?.presets
    if (!api) {
      throw new Error('The desktop preset connection is unavailable.')
    }
    const source = await apiValue(() => api.get(id))
    if (
      epoch !== presetOpeningEpoch ||
      activeTab.value?.id !== tabId ||
      activeTab.value.documentId !== tab.documentId
    ) {
      return
    }
    if (!source) {
      throw new Error('This preset is no longer active. Refresh the preset list.')
    }
    presetApplication.value = { documentId: tab.documentId, source, tabId }
    presetApplyOpen.value = true
    void refreshModelCatalog()
  } catch (cause) {
    if (epoch === presetOpeningEpoch) {
      presetCatalogError.value = errorMessage(cause)
    }
  }
}
async function applyProjectPreset(
  selection: Pick<PresetApplicationRequest, 'payload' | 'selectedSections'>,
) {
  const application = presetApplication.value
  if (
    !application ||
    !presetApplyTab.value ||
    presetApplyBusy.value ||
    presetModelHandoff.value ||
    pendingProjectAction.value ||
    windowClosePending.value ||
    reloadRequiredIds.value.has(application.tabId)
  ) {
    return
  }
  const request: PresetApplicationRequest = {
    ...JSON.parse(JSON.stringify(selection)),
    documentId: application.documentId,
    sourcePresetId: application.source.id,
  }
  presetApplyBusy.value = true
  presetApplyError.value = null
  pendingProjectAction.value = { kind: 'preset', tabId: application.tabId }
  try {
    await flushProjectDraft(application.tabId)
    replaceTab(await apiValue(() => projectApi().applyPreset(application.tabId, request)))
    saveNotices.value = { ...saveNotices.value, [application.tabId]: null }
    presetApplyOpen.value = false
  } catch (cause) {
    presetApplyError.value = errorMessage(cause)
  } finally {
    presetApplyBusy.value = false
    pendingProjectAction.value = null
  }
}
function editPresetOriginal(id: string) {
  ++presetCreateEpoch
  presetManagerCreateIntent.value = null
  presetManagerInitialId.value = id
  presetManagerOpen.value = true
  void refreshModelCatalog()
}
watch(presetManagerOpen, (open) => {
  if (!open) {
    presetManagerCreateIntent.value = null
    void refreshPresetCatalog()
  }
})
watch([() => activeTab.value?.id, () => activeTab.value?.documentId], () => {
  ++presetCreateEpoch
  ++presetOpeningEpoch
  if (!presetApplyBusy.value) {
    presetApplyOpen.value = false
    presetModelHandoff.value = null
  }
  if (activeTab.value) {
    void refreshPresetCatalog()
  }
})
const pendingHomeAction = computed(() => {
  const action = pendingProjectAction.value
  return action?.kind === 'open' || action?.kind === 'rebuild' ? action : null
})
const activeTabPending = computed<
  'bbox' | 'clear-history' | 'import-image' | 'model' | 'redo' | 'save' | 'undo' | null
>(() => {
  const action = pendingProjectAction.value
  if (
    !activeTab.value ||
    !action ||
    (action.kind !== 'bbox' &&
      action.kind !== 'clear-history' &&
      action.kind !== 'import-image' &&
      action.kind !== 'model' &&
      action.kind !== 'redo' &&
      action.kind !== 'save' &&
      action.kind !== 'undo') ||
    action.tabId !== activeTab.value.id
  ) {
    return null
  }
  return action.kind
})
const showRuntimeNotice = computed(
  () => status.value?.kind !== 'ready' || runtimeError.value !== null,
)

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'An unexpected error occurred.'
}

async function apiValue<T>(operation: () => Promise<ApiResult<T>>): Promise<T> {
  const result = await operation()
  if (!result.ok) {
    throw new Error(result.error.message)
  }
  return result.value
}

function projectApi() {
  const api = globalThis.window.api?.projects
  if (!api) {
    throw new Error('The desktop application connection is unavailable.')
  }
  return api
}

async function refreshModelCatalog() {
  const request = ++modelCatalogRequest
  modelCatalogLoading.value = true
  modelCatalogError.value = null
  try {
    const api = globalThis.window.api?.models
    if (!api) {
      throw new Error('The desktop application connection is unavailable.')
    }
    const catalog = await apiValue(() => api.getCatalog())
    if (request === modelCatalogRequest) {
      modelCatalog.value = catalog
      modelCatalogLoaded.value = true
    }
  } catch (cause) {
    if (request === modelCatalogRequest) {
      modelCatalogError.value = errorMessage(cause)
    }
  } finally {
    if (request === modelCatalogRequest) {
      modelCatalogLoading.value = false
    }
  }
}

watch([() => activeTab.value?.id, () => activeTab.value?.documentId], ([tabId]) => {
  if (tabId) {
    void refreshModelCatalog()
    void refreshGenerationResults(tabId)
    void refreshGenerationState(tabId)
  }
})

async function readGenerationResults(tabId: string): Promise<ProjectGenerationResultsSnapshot> {
  const documentId = projectTabs.value.find((tab) => tab.id === tabId)?.documentId
  const request = (generationResultsRequests.get(tabId) ?? 0) + 1
  generationResultsRequests.set(tabId, request)
  generationResultsLoading.value = { ...generationResultsLoading.value, [tabId]: true }
  generationResultsErrors.value = { ...generationResultsErrors.value, [tabId]: null }
  try {
    const snapshot = await apiValue(() => projectApi().listGenerationResults(tabId))
    if (
      generationResultsRequests.get(tabId) === request &&
      projectTabs.value.some((tab) => tab.id === tabId && tab.documentId === documentId)
    ) {
      generationResultsByTab.value = { ...generationResultsByTab.value, [tabId]: snapshot }
    }
    return snapshot
  } catch (cause) {
    if (
      generationResultsRequests.get(tabId) === request &&
      projectTabs.value.some((tab) => tab.id === tabId && tab.documentId === documentId)
    ) {
      const { [tabId]: _stale, ...remaining } = generationResultsByTab.value
      generationResultsByTab.value = remaining
      generationResultsErrors.value = {
        ...generationResultsErrors.value,
        [tabId]: errorMessage(cause),
      }
    }
    throw cause
  } finally {
    if (
      generationResultsRequests.get(tabId) === request &&
      projectTabs.value.some((tab) => tab.id === tabId && tab.documentId === documentId)
    ) {
      generationResultsLoading.value = { ...generationResultsLoading.value, [tabId]: false }
    }
  }
}

async function refreshGenerationResults(tabId: string) {
  await readGenerationResults(tabId).catch(() => undefined)
}

function generationDocumentIsOpen(tabId: string, documentId: string): boolean {
  return (
    !rendererDisposed &&
    projectTabs.value.some((tab) => tab.id === tabId && tab.documentId === documentId)
  )
}

async function refreshGenerationState(tabId: string) {
  const tab = projectTabs.value.find((candidate) => candidate.id === tabId)
  if (!tab) {
    return
  }
  const documentId = tab.documentId
  const request = (generationStateRequests.get(tabId) ?? 0) + 1
  generationStateRequests.set(tabId, request)
  generationStateLoading.value = { ...generationStateLoading.value, [tabId]: true }
  generationStateErrors.value = { ...generationStateErrors.value, [tabId]: null }
  const current = () =>
    generationStateRequests.get(tabId) === request && generationDocumentIsOpen(tabId, documentId)
  try {
    const state = await apiValue(() => projectApi().getGenerationState(tabId))
    if (state.documentId !== documentId) {
      throw new Error(
        'The Project changed while its queue was being read. Open the queue to retry.',
      )
    }
    if (current()) {
      generationStatesByTab.value = { ...generationStatesByTab.value, [tabId]: state }
    }
  } catch (cause) {
    if (current()) {
      const { [tabId]: _stale, ...remaining } = generationStatesByTab.value
      generationStatesByTab.value = remaining
      generationStateErrors.value = { ...generationStateErrors.value, [tabId]: errorMessage(cause) }
    }
  } finally {
    if (current()) {
      generationStateLoading.value = { ...generationStateLoading.value, [tabId]: false }
    }
  }
}

function refreshOpenGeneration() {
  generationQueueEpoch.value += 1
  for (const tab of projectTabs.value) {
    void refreshGenerationState(tab.id)
    void refreshGenerationResults(tab.id)
  }
}

function openGenerationQueue() {
  cancelAcceptedHistoryNavigation()
  queueResultNavigator.cancelProjectOpen()
  queueResultNavigationError.value = null
  generationQueueOpen.value = true
  refreshOpenGeneration()
}

function refreshQueueResults() {
  queueResultNavigationError.value = null
  for (const tab of projectTabs.value) {
    void refreshGenerationState(tab.id)
    void refreshGenerationResults(tab.id)
  }
}

const savedAcceptedResultsOpen = ref(false)
const acceptedHistoryError = ref<string | null>(null)
const acceptedHistoryOpening = ref(false)
const acceptedHistoryFocus = ref<AcceptedHistoryFocusRequest | null>(null)
let acceptedHistoryRequest = 0
let pendingAcceptedHistory: {
  reference: AcceptedResultHistoryReference
  requestId: number
} | null = null
let closingAcceptedHistoryForNavigation = false
let acceptedHistoryModalSettled = true

function cancelAcceptedHistoryNavigation() {
  acceptedHistoryRequest += 1
  pendingAcceptedHistory = null
  acceptedHistoryFocus.value = null
  closingAcceptedHistoryForNavigation = false
}

function openSavedAcceptedResults() {
  if (pendingProjectAction.value || windowClosePending.value) {
    return
  }
  queueResultNavigator.cancel()
  cancelAcceptedHistoryNavigation()
  acceptedHistoryError.value = null
  acceptedHistoryModalSettled = false
  savedAcceptedResultsOpen.value = true
}

async function readAcceptedHistoryPage(
  cursor: AcceptedResultHistoryCursor | null,
  refresh: boolean,
) {
  if (refresh) {
    projects.value = await apiValue(() => projectApi().list())
  }
  return await apiValue(() => projectApi().getAcceptedResultHistory(cursor))
}

watch(savedAcceptedResultsOpen, (open) => {
  if (!open && !closingAcceptedHistoryForNavigation) {
    cancelAcceptedHistoryNavigation()
  }
  closingAcceptedHistoryForNavigation = false
})
watch(windowClosePending, (closing) => {
  if (closing) {
    cancelAcceptedHistoryNavigation()
  }
})

async function continueAcceptedHistoryOpen(projectKey: string) {
  const intent = pendingAcceptedHistory
  if (
    !intent ||
    intent.reference.projectKey !== projectKey ||
    intent.requestId !== acceptedHistoryRequest ||
    rendererDisposed ||
    pendingProjectAction.value ||
    recoveryDecision.value ||
    windowClosePending.value ||
    !acceptedHistoryModalSettled
  ) {
    return
  }
  const tab = projectTabs.value.find((item) => item.id === projectKey)
  pendingAcceptedHistory = null
  if (
    !tab ||
    reloadRequiredIds.value.has(projectKey) ||
    !acceptedHistoryLayerAvailable(tab, intent.reference)
  ) {
    globalNotice.value =
      'This saved result is not available in the current project. Your unsaved changes were preserved.'
    return
  }
  acceptedHistoryFocus.value = { ...intent.reference, requestId: intent.requestId }
}

function acceptedHistoryClosed() {
  acceptedHistoryModalSettled = true
  const key = pendingAcceptedHistory?.reference.projectKey
  if (key) {
    void continueAcceptedHistoryOpen(key)
  }
}

async function openSavedAcceptedResult(reference: AcceptedResultHistoryReference) {
  if (pendingProjectAction.value || windowClosePending.value || acceptedHistoryOpening.value) {
    return
  }
  cancelAcceptedHistoryNavigation()
  const requestId = acceptedHistoryRequest
  pendingAcceptedHistory = { reference: { ...reference }, requestId }
  acceptedHistoryError.value = null
  acceptedHistoryOpening.value = true
  try {
    const available = await apiValue(() => projectApi().reviewAcceptedResult({ ...reference }))
    if (
      requestId !== acceptedHistoryRequest ||
      rendererDisposed ||
      !savedAcceptedResultsOpen.value ||
      windowClosePending.value
    ) {
      return
    }
    if (!available) {
      acceptedHistoryError.value =
        'This saved result changed or is unavailable. Refresh saved generations.'
      pendingAcceptedHistory = null
      return
    }
    const previous = activeTab.value
    if (previous && previous.id !== reference.projectKey) {
      await flushProjectDraft(previous.id)
    }
    if (requestId !== acceptedHistoryRequest || !savedAcceptedResultsOpen.value) {
      return
    }
    closingAcceptedHistoryForNavigation = true
    savedAcceptedResultsOpen.value = false
    await openProject(reference.projectKey, true, () => requestId === acceptedHistoryRequest)
    if (requestId !== acceptedHistoryRequest || rendererDisposed || windowClosePending.value) {
      return
    }
    if (homeError.value) {
      cancelAcceptedHistoryNavigation()
      globalNotice.value = homeError.value
    } else if (!recoveryDecision.value) {
      await continueAcceptedHistoryOpen(reference.projectKey)
    }
  } catch (cause) {
    if (requestId === acceptedHistoryRequest) {
      cancelAcceptedHistoryNavigation()
      acceptedHistoryError.value = errorMessage(cause)
      globalNotice.value = acceptedHistoryError.value
    }
  } finally {
    acceptedHistoryOpening.value = false
  }
}

async function openQueueProject(projectKey: string, reference?: QueueResultOpenReference | null) {
  cancelAcceptedHistoryNavigation()
  if (
    pendingProjectAction.value !== null ||
    windowClosePending.value ||
    queueResultOpeningId.value !== null
  ) {
    return
  }
  queueResultNavigator.cancel()
  if (reference && reference.projectKey === projectKey) {
    queueResultNavigator.beginProjectOpen(reference)
    queueResultOpeningId.value = reference.queueItemId
  }
  generationQueueOpen.value = false
  try {
    await openProject(projectKey, Boolean(reference))
    if (homeError.value) {
      queueResultNavigator.cancelProjectOpen()
      globalNotice.value = homeError.value
    } else if (!recoveryDecision.value) {
      await continueQueueResultOpen(projectKey)
    }
  } finally {
    queueResultOpeningId.value = null
  }
}

const queueResultNavigator = new GenerationQueueResultNavigator({
  canContinueProjectOpen: () =>
    !rendererDisposed &&
    pendingProjectAction.value === null &&
    recoveryDecision.value === null &&
    closingTabId.value === null &&
    !windowClosePending.value,
  canNavigate: () =>
    !rendererDisposed &&
    generationQueueOpen.value &&
    pendingProjectAction.value === null &&
    !windowClosePending.value,
  getOpenDocumentId: (projectKey) =>
    reloadRequiredIds.value.has(projectKey)
      ? null
      : (projectTabs.value.find((tab) => tab.id === projectKey)?.documentId ?? null),
  readResults: readGenerationResults,
})

watch(generationQueueOpen, (open) => {
  if (!open) {
    queueResultNavigator.cancelView()
  }
})

function applyQueueResultFocus(focus: GenerationResultFocusRequest): boolean {
  const tab = projectTabs.value.find(
    (item) => item.id === focus.projectKey && item.documentId === focus.openDocumentId,
  )
  if (
    !tab ||
    !resultFocusCandidate(focus, generationResultsByTab.value[tab.id]?.candidates ?? [], {
      documentId: tab.documentId,
      projectKey: tab.id,
    })
  ) {
    return false
  }
  generationResultFocusByTab.value = {
    ...generationResultFocusByTab.value,
    [tab.id]: focus,
  }
  focusTab(tab)
  return true
}

async function continueQueueResultOpen(projectKey: string) {
  const intent = queueResultNavigator.getPendingProjectOpen()
  if (!intent || intent.projectKey !== projectKey || recoveryDecision.value) {
    return
  }
  queueResultOpeningId.value = intent.queueItemId
  try {
    const result = await queueResultNavigator.continueProjectOpen()
    if (result.kind === 'superseded') {
      return
    }
    if (result.kind === 'unavailable' || !applyQueueResultFocus(result.focus)) {
      const message =
        result.kind === 'unavailable'
          ? result.reason
          : 'The temporary result changed. The Project is open; refresh the queue.'
      queueResultNavigationError.value = message
      globalNotice.value = message
    }
  } catch (cause) {
    if (!rendererDisposed && !windowClosePending.value) {
      queueResultNavigationError.value = errorMessage(cause)
      globalNotice.value = queueResultNavigationError.value
    }
  } finally {
    queueResultOpeningId.value = null
  }
}

async function openQueueResult(reference: QueueResultReference) {
  if (queueResultOpeningId.value !== null) {
    return
  }
  queueResultOpeningId.value = reference.queueItemId
  queueResultNavigationError.value = null
  try {
    const result = await queueResultNavigator.open(reference)
    if (result.kind === 'superseded') {
      return
    }
    if (result.kind === 'unavailable') {
      queueResultNavigationError.value = result.reason
      return
    }
    // A newer background refresh may have revoked a candidate while this read was pending.
    if (!applyQueueResultFocus(result.focus)) {
      queueResultNavigationError.value =
        'The temporary result changed. Refresh the queue before viewing it.'
      return
    }
    generationQueueOpen.value = false
  } catch (cause) {
    if (!rendererDisposed && generationQueueOpen.value) {
      queueResultNavigationError.value = errorMessage(cause)
    }
  } finally {
    queueResultOpeningId.value = null
  }
}

function clearResultFocus(tabId: string, revision: number) {
  if (generationResultFocusByTab.value[tabId]?.revision === revision) {
    const { [tabId]: _handled, ...remaining } = generationResultFocusByTab.value
    generationResultFocusByTab.value = remaining
  }
}

watch(modelManagerOpen, async (open, previous) => {
  if (previous && !open && activeTab.value) {
    const request = presetModelHandoff.value
    if (request?.phase === 'models') {
      request.phase = 'refreshing'
      await refreshModelCatalog()
      if (presetModelHandoff.value === request) {
        request.catalogSettled = true
        resumePresetAfterModels()
      }
    } else {
      void refreshModelCatalog()
    }
  }
})

const draftSync = new ProjectDraftSync({
  onAcknowledged(tab) {
    replaceTab(tab)
    setTabError(tab.id, null)
    saveNotices.value = { ...saveNotices.value, [tab.id]: null }
  },
  onError(tabId, error) {
    setTabError(tabId, error.message)
  },
  onOverlay(tabId, draft) {
    const next = { ...generationDraftOverlays.value }
    if (draft) {
      next[tabId] = draft
    } else {
      delete next[tabId]
    }
    generationDraftOverlays.value = next
  },
  seal: (tabId, historyGroupId) =>
    apiValue(() => projectApi().sealPromptHistory(tabId, historyGroupId)),
  send: (tabId, change, historyGroupId) =>
    apiValue(() => projectApi().updateGenerationDraft(tabId, change, historyGroupId)),
})

function updateGenerationDraft(
  tabId: string,
  change: ProjectGenerationDraftChange,
  historyGroupId?: string,
) {
  if (
    pendingProjectAction.value !== null ||
    windowClosePending.value ||
    reloadRequiredIds.value.has(tabId)
  ) {
    return
  }
  const tab = projectTabs.value.find((candidate) => candidate.id === tabId)
  if (!tab) {
    return
  }
  draftSync.change({ ...tab, generationDraft: toRaw(tab.generationDraft) }, change, historyGroupId)
}

function updateActiveGenerationDraft(
  change: ProjectGenerationDraftChange,
  historyGroupId?: string,
) {
  if (activeTab.value) {
    updateGenerationDraft(activeTab.value.id, change, historyGroupId)
  }
}

function sealPromptHistory(tabId: string, historyGroupId: string) {
  const tab = projectTabs.value.find((candidate) => candidate.id === tabId)
  if (tab) {
    draftSync.sealPromptHistory(tab, historyGroupId)
  }
}

function rotatePromptHistoryGroup(tabId: string) {
  promptHistoryEpochs.value = {
    ...promptHistoryEpochs.value,
    [tabId]: (promptHistoryEpochs.value[tabId] ?? 0) + 1,
  }
}

async function flushProjectDraft(tabId: string) {
  await draftSync.flush(tabId)
  replaceTab(await apiValue(() => projectApi().sealPromptHistory(tabId)))
  rotatePromptHistoryGroup(tabId)
}

async function generateProject(tabId: string, iterations: number) {
  const tab = projectTabs.value.find((candidate) => candidate.id === tabId)
  const state = generationStatesByTab.value[tabId]
  if (
    !tab ||
    pendingProjectAction.value !== null ||
    windowClosePending.value ||
    reloadRequiredIds.value.has(tabId) ||
    draftValidity.value[tabId] === false ||
    runtimeUnavailableReason.value !== null ||
    state?.documentId !== tab.documentId ||
    (state.phase !== 'idle' && state.phase !== 'processing') ||
    !Number.isSafeInteger(iterations) ||
    iterations < 1 ||
    iterations > 100
  ) {
    return
  }
  await requestGeneration(tabId, iterations)
}

async function requestGeneration(tabId: string, iterations: number, decision?: PendingGeneration) {
  const request = (generationCommandRequests.get(tabId) ?? 0) + 1
  generationCommandRequests.set(tabId, request)
  pendingProjectAction.value = { kind: 'generate', tabId }
  generationCommitting.value = true
  generationConfirmationNotice.value = null
  generationNotices.value = { ...generationNotices.value, [tabId]: null }
  setTabError(tabId, null)
  let documentId: string | null = null
  const currentRequest = () => !rendererDisposed && generationCommandRequests.get(tabId) === request
  try {
    await flushProjectDraft(tabId)
    // Acknowledgement can replace the tab DTO; use its current document identity after flush.
    const tab = projectTabs.value.find((candidate) => candidate.id === tabId)
    if (!tab || windowClosePending.value || !currentRequest()) {
      return
    }
    documentId = tab.documentId
    if (decision && decision.documentId !== documentId) {
      throw new Error('The Project changed. Keep these results and review the reopened Project.')
    }
    const options: ProjectGenerateOptions = { documentId, iterations }
    if (decision) {
      options.confirmation = {
        candidateIds: [...decision.candidateIds],
        unfinishedJobIds: [...decision.unfinishedJobIds],
      }
    }
    const result = await apiValue(() => projectApi().generate(tabId, options))
    if (
      !currentRequest() ||
      !generationDocumentIsOpen(tabId, documentId) ||
      windowClosePending.value
    ) {
      return
    }
    if (result.documentId !== documentId) {
      throw new Error('The Project changed while generation was being prepared. Review it again.')
    }
    if (result.kind === 'confirmation-required') {
      pendingGeneration.value = {
        candidateIds: [...result.candidateIds],
        documentId,
        iterations,
        tabId,
        unfinishedJobIds: [...result.unfinishedJobIds],
      }
      generationConfirmationNotice.value = decision
        ? 'Temporary results or unfinished jobs changed. Review the counts and confirm again.'
        : null
    } else {
      pendingGeneration.value = null
      generationNotices.value = {
        ...generationNotices.value,
        [tabId]: result.truncated
          ? 'Max prompts limited the concrete prompts in this batch.'
          : null,
      }
    }
  } catch (cause) {
    if (
      currentRequest() &&
      !windowClosePending.value &&
      (!documentId || generationDocumentIsOpen(tabId, documentId))
    ) {
      if (decision && pendingGeneration.value) {
        generationConfirmationNotice.value = errorMessage(cause)
      } else {
        setTabError(tabId, errorMessage(cause))
      }
    }
  } finally {
    if (currentRequest()) {
      generationCommitting.value = false
      if (!pendingGeneration.value || windowClosePending.value) {
        pendingProjectAction.value = null
      }
      refreshOpenGeneration()
    }
  }
}

function keepGenerationResults() {
  if (generationCommitting.value) {
    return
  }
  pendingGeneration.value = null
  generationConfirmationNotice.value = null
  if (pendingProjectAction.value?.kind === 'generate') {
    pendingProjectAction.value = null
  }
}

async function confirmGenerationReplacement() {
  const decision = pendingGeneration.value
  if (!decision || generationCommitting.value || windowClosePending.value) {
    return
  }
  await requestGeneration(decision.tabId, decision.iterations, decision)
}

async function cancelCurrentGeneration(tabId: string) {
  const tab = projectTabs.value.find((candidate) => candidate.id === tabId)
  const state = generationStatesByTab.value[tabId]
  if (
    !tab ||
    !state?.runningJobId ||
    state.documentId !== tab.documentId ||
    pendingProjectAction.value !== null ||
    windowClosePending.value ||
    generationCanceling.value[tabId] ||
    reloadRequiredIds.value.has(tabId)
  ) {
    return
  }
  const documentId = tab.documentId
  const jobId = state.runningJobId
  const request = (generationCancelRequests.get(tabId) ?? 0) + 1
  generationCancelRequests.set(tabId, request)
  generationCanceling.value = { ...generationCanceling.value, [tabId]: true }
  setTabError(tabId, null)
  const current = () =>
    generationCancelRequests.get(tabId) === request && generationDocumentIsOpen(tabId, documentId)
  try {
    const next = await apiValue(() =>
      projectApi().cancelCurrentGeneration(tabId, documentId, jobId),
    )
    if (current() && next.documentId === documentId) {
      // Supersede reads that began before the cancellation acknowledgement.
      generationStateRequests.set(tabId, (generationStateRequests.get(tabId) ?? 0) + 1)
      generationStatesByTab.value = { ...generationStatesByTab.value, [tabId]: next }
      generationStateErrors.value = { ...generationStateErrors.value, [tabId]: null }
      generationStateLoading.value = { ...generationStateLoading.value, [tabId]: false }
    }
  } catch (cause) {
    if (current()) {
      setTabError(tabId, errorMessage(cause))
    }
  } finally {
    if (current()) {
      generationCanceling.value = { ...generationCanceling.value, [tabId]: false }
      refreshOpenGeneration()
    }
  }
}

function forgetGenerationUi(tabId: string, forgetCount: boolean) {
  generationStateRequests.set(tabId, (generationStateRequests.get(tabId) ?? 0) + 1)
  generationCommandRequests.set(tabId, (generationCommandRequests.get(tabId) ?? 0) + 1)
  generationCancelRequests.set(tabId, (generationCancelRequests.get(tabId) ?? 0) + 1)
  delete generationStatesByTab.value[tabId]
  delete generationStateErrors.value[tabId]
  delete generationStateLoading.value[tabId]
  delete generationNotices.value[tabId]
  delete generationCanceling.value[tabId]
  if (forgetCount) {
    delete imagesPerClickByTab.value[tabId]
  }
  if (
    pendingGeneration.value?.tabId === tabId ||
    (pendingProjectAction.value?.kind === 'generate' && pendingProjectAction.value.tabId === tabId)
  ) {
    pendingGeneration.value = null
    generationConfirmationNotice.value = null
    generationCommitting.value = false
    pendingProjectAction.value = null
  }
}

async function runGenerationModelAction(
  tabId: string,
  request: () => Promise<ApiResult<ProjectTab>>,
) {
  if (
    pendingProjectAction.value !== null ||
    windowClosePending.value ||
    reloadRequiredIds.value.has(tabId)
  ) {
    return
  }
  pendingProjectAction.value = { kind: 'model', tabId }
  setTabError(tabId, null)
  try {
    await flushProjectDraft(tabId)
    replaceTab(await apiValue(request))
    saveNotices.value = { ...saveNotices.value, [tabId]: null }
  } catch (cause) {
    setTabError(tabId, errorMessage(cause))
    void refreshModelCatalog()
  } finally {
    pendingProjectAction.value = null
  }
}

function addGenerationLora(tabId: string, identity: ProjectLoraIdentity) {
  return runGenerationModelAction(tabId, () => projectApi().addGenerationLora(tabId, identity))
}

function removeGenerationLora(tabId: string, identity: ProjectLoraIdentity) {
  return runGenerationModelAction(tabId, () => projectApi().removeGenerationLora(tabId, identity))
}

function setGenerationModel(
  tabId: string,
  selection: { resourceId: string; versionId: string } | null,
) {
  return runGenerationModelAction(tabId, () => projectApi().setGenerationModel(tabId, selection))
}

function relinkGenerationLora(tabId: string, identity: ProjectLoraIdentity) {
  return runGenerationModelAction(tabId, () => projectApi().relinkGenerationLora(tabId, identity))
}

function relinkGenerationModel(tabId: string) {
  return runGenerationModelAction(tabId, () => projectApi().relinkGenerationModel(tabId))
}

function setGenerationVae(
  tabId: string,
  selection: { resourceId: string; versionId: string } | null,
) {
  return runGenerationModelAction(tabId, () => projectApi().setGenerationVae(tabId, selection))
}

function relinkGenerationVae(tabId: string) {
  return runGenerationModelAction(tabId, () => projectApi().relinkGenerationVae(tabId))
}

function relinkGenerationEmbedding(tabId: string, identity: ProjectEmbeddingIdentity) {
  return runGenerationModelAction(tabId, () =>
    projectApi().relinkGenerationEmbedding(tabId, identity),
  )
}

function setDraftValidity(tabId: string, valid: boolean) {
  draftValidity.value = { ...draftValidity.value, [tabId]: valid }
}

function replaceTab(tab: ProjectTab) {
  const index = projectTabs.value.findIndex((candidate) => candidate.id === tab.id)
  if (index >= 0) {
    projectTabs.value.splice(index, 1, tab)
  } else {
    projectTabs.value.push(tab)
  }
}

function focusTab(tab: ProjectTab, preserveResultOpen = false) {
  if (!preserveResultOpen) {
    cancelAcceptedHistoryNavigation()
    queueResultNavigator.cancelProjectOpen()
  }
  replaceTab(tab)
  activeDocument.value = tab.id
  tabErrors.value = { ...tabErrors.value, [tab.id]: null }
}

function removeTab(tabId: string) {
  if (
    pendingAcceptedHistory?.reference.projectKey === tabId ||
    acceptedHistoryFocus.value?.projectKey === tabId
  ) {
    cancelAcceptedHistoryNavigation()
  }
  if (queueResultNavigator.getPendingProjectOpen()?.projectKey === tabId) {
    queueResultNavigator.cancelProjectOpen()
  }
  const { [tabId]: _closedFocus, ...remainingFocus } = generationResultFocusByTab.value
  generationResultFocusByTab.value = remainingFocus
  forgetGenerationUi(tabId, true)
  stopExportFeedbackTimer(tabId)
  draftSync.forget(tabId)
  const { [tabId]: _closedPromptEpoch, ...remainingPromptEpochs } = promptHistoryEpochs.value
  promptHistoryEpochs.value = remainingPromptEpochs
  generationResultsRequests.set(tabId, (generationResultsRequests.get(tabId) ?? 0) + 1)
  const { [tabId]: _closedResults, ...remainingResults } = generationResultsByTab.value
  const { [tabId]: _closedResultsError, ...remainingResultsErrors } = generationResultsErrors.value
  const { [tabId]: _closedResultsLoading, ...remainingResultsLoading } =
    generationResultsLoading.value
  generationResultsByTab.value = remainingResults
  generationResultsErrors.value = remainingResultsErrors
  generationResultsLoading.value = remainingResultsLoading
  const { [tabId]: _closedValidity, ...remainingValidity } = draftValidity.value
  draftValidity.value = remainingValidity
  projectTabs.value = projectTabs.value.filter((tab) => tab.id !== tabId)
  if (activeDocument.value === tabId) {
    activeDocument.value = homeOpen.value ? 'home' : (projectTabs.value.at(-1)?.id ?? null)
  }
  const nextReloadRequired = new Set(reloadRequiredIds.value)
  nextReloadRequired.delete(tabId)
  reloadRequiredIds.value = nextReloadRequired
  const { [tabId]: _closedError, ...remainingErrors } = tabErrors.value
  const { [tabId]: _closedExportFeedback, ...remainingExportFeedback } = exportFeedbackByTab.value
  const { [tabId]: _closedNotice, ...remainingNotices } = saveNotices.value
  tabErrors.value = remainingErrors
  exportFeedbackByTab.value = remainingExportFeedback
  saveNotices.value = remainingNotices
}

function reconcileProjectTabs(nextTabs: ProjectTab[]) {
  const openIds = new Set(nextTabs.map((tab) => tab.id))
  for (const tab of projectTabs.value) {
    const next = nextTabs.find((candidate) => candidate.id === tab.id)
    if (!next || next.documentId !== tab.documentId) {
      if (queueResultNavigator.getPendingProjectOpen()?.projectKey === tab.id) {
        queueResultNavigator.cancelProjectOpen()
      }
      forgetGenerationUi(tab.id, !next)
      stopExportFeedbackTimer(tab.id)
      draftSync.forget(tab.id)
      generationResultsRequests.set(tab.id, (generationResultsRequests.get(tab.id) ?? 0) + 1)
      delete generationResultsByTab.value[tab.id]
      delete generationResultsErrors.value[tab.id]
      delete generationResultsLoading.value[tab.id]
    }
  }
  projectTabs.value = nextTabs
  if (
    activeDocument.value !== null &&
    activeDocument.value !== 'home' &&
    !openIds.has(activeDocument.value)
  ) {
    activeDocument.value = homeOpen.value ? 'home' : (nextTabs.at(-1)?.id ?? null)
  }
  if (closingTabId.value && !openIds.has(closingTabId.value)) {
    closingTabId.value = null
    closeError.value = null
  }
  reloadRequiredIds.value = new Set([...reloadRequiredIds.value].filter((id) => openIds.has(id)))
  tabErrors.value = Object.fromEntries(
    Object.entries(tabErrors.value).filter(([id]) => openIds.has(id)),
  )
  exportFeedbackByTab.value = Object.fromEntries(
    Object.entries(exportFeedbackByTab.value).filter(([id]) => openIds.has(id)),
  )
  saveNotices.value = Object.fromEntries(
    Object.entries(saveNotices.value).filter(([id]) => openIds.has(id)),
  )
  draftValidity.value = Object.fromEntries(
    Object.entries(draftValidity.value).filter(([id]) => openIds.has(id)),
  )
  promptHistoryEpochs.value = Object.fromEntries(
    Object.entries(promptHistoryEpochs.value).filter(([id]) => openIds.has(id)),
  )
  generationResultsByTab.value = Object.fromEntries(
    Object.entries(generationResultsByTab.value).filter(([id]) => openIds.has(id)),
  )
  generationResultFocusByTab.value = Object.fromEntries(
    Object.entries(generationResultFocusByTab.value).filter(([id, request]) =>
      nextTabs.some((tab) => tab.id === id && tab.documentId === request.openDocumentId),
    ),
  )
  generationResultsErrors.value = Object.fromEntries(
    Object.entries(generationResultsErrors.value).filter(([id]) => openIds.has(id)),
  )
  generationResultsLoading.value = Object.fromEntries(
    Object.entries(generationResultsLoading.value).filter(([id]) => openIds.has(id)),
  )
}

function openHome() {
  homeOpen.value = true
  void activateDocument('home')
}

function closeHome() {
  cancelAcceptedHistoryNavigation()
  homeOpen.value = false
  if (activeDocument.value === 'home') {
    activeDocument.value = projectTabs.value.at(-1)?.id ?? null
  }
}

async function activateDocument(documentId: string): Promise<boolean> {
  const switchingDuringHistoryOpen =
    acceptedHistoryOpening.value && pendingProjectAction.value?.kind === 'open'
  cancelAcceptedHistoryNavigation()
  queueResultNavigator.cancelProjectOpen()
  if (activeDocument.value === documentId) {
    return true
  }
  if (
    (pendingProjectAction.value !== null && !switchingDuringHistoryOpen) ||
    windowClosePending.value
  ) {
    return false
  }
  if (switchingDuringHistoryOpen) {
    // History navigation already flushed the departing draft before Main Open began.
    activeDocument.value = documentId
    if (documentId === 'home') {
      void refreshProjects()
    }
    return true
  }
  const previous = activeTab.value
  if (previous) {
    pendingProjectAction.value = { kind: 'history', tabId: previous.id }
    try {
      await flushProjectDraft(previous.id)
    } catch (cause) {
      setTabError(
        previous.id,
        `Could not finish the Project draft before switching tabs. ${errorMessage(cause)}`,
      )
      return false
    } finally {
      pendingProjectAction.value = null
    }
  }
  activeDocument.value = documentId
  if (documentId === 'home') {
    void refreshProjects()
  }
  return true
}

async function onTabKeydown(event: KeyboardEvent, documentId: string) {
  if (event.target !== event.currentTarget) {
    return
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    activateDocument(documentId)
    return
  }
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
    return
  }
  event.preventDefault()
  const ids = [...(homeOpen.value ? ['home'] : []), ...projectTabs.value.map((tab) => tab.id)]
  const index = ids.indexOf(documentId)
  const direction = event.key === 'ArrowRight' ? 1 : -1
  const nextIndex = (index + direction + ids.length) % ids.length
  const nextId = ids[nextIndex]
  if (nextId) {
    const tabList = (event.currentTarget as HTMLElement).parentElement
    if (await activateDocument(nextId)) {
      tabList?.querySelectorAll<HTMLElement>('[role="tab"]')[nextIndex]?.focus()
    }
  }
}

async function refreshProjects() {
  const request = ++projectListRequest
  projectsLoading.value = true
  homeError.value = null
  try {
    const list = await apiValue(() => projectApi().list())
    if (request === projectListRequest) {
      projects.value = list
    }
  } catch (cause) {
    if (request === projectListRequest) {
      homeError.value = errorMessage(cause)
    }
  } finally {
    if (request === projectListRequest) {
      projectsLoading.value = false
    }
  }
}

function beginNewProject() {
  queueResultNavigator.cancelProjectOpen()
  newProjectError.value = null
  showNewProject.value = true
  void refreshPresetCatalog()
  void refreshModelCatalog()
}

async function createProject(input: ProjectCreateInput) {
  if (pendingProjectAction.value !== null || windowClosePending.value) {
    return
  }
  const captured: ProjectCreateInput = JSON.parse(JSON.stringify(input))
  pendingProjectAction.value = { kind: 'create' }
  newProjectError.value = null
  try {
    const tab = await apiValue(() => projectApi().create(captured))
    showNewProject.value = false
    focusTab(tab)
    if (tab.storageWarning) {
      globalNotice.value = tab.storageWarning
    }
    await refreshProjects()
  } catch (cause) {
    newProjectError.value = errorMessage(cause)
  } finally {
    pendingProjectAction.value = null
  }
}

async function openProject(
  projectId: string,
  preserveResultOpen = false,
  isCurrent?: () => boolean,
) {
  if (!preserveResultOpen) {
    cancelAcceptedHistoryNavigation()
    queueResultNavigator.cancelProjectOpen()
  }
  if (pendingProjectAction.value !== null) {
    return
  }
  homeError.value = null
  const existing = projectTabs.value.find((tab) => tab.id === projectId)
  if (existing) {
    focusTab(existing, preserveResultOpen)
    return
  }
  pendingProjectAction.value = { kind: 'open', projectId }
  homeError.value = null
  try {
    const result = await apiValue(() => projectApi().open(projectId))
    if (isCurrent && !isCurrent()) {
      // Main may already own this tab; retain it in the strip without stealing the new context.
      if (result.kind === 'opened' && !rendererDisposed && !windowClosePending.value) {
        replaceTab(result.tab)
      }
      return
    }
    if (result.kind === 'recovery-required') {
      recoveryDecision.value = result
      recoveryError.value = null
    } else {
      focusTab(result.tab, preserveResultOpen)
      if (result.tab.storageWarning) {
        globalNotice.value = result.tab.storageWarning
      }
      await refreshProjects()
    }
  } catch (cause) {
    if (isCurrent && !isCurrent()) {
      return
    }
    if (preserveResultOpen) {
      queueResultNavigator.cancelProjectOpen()
    }
    homeError.value = errorMessage(cause)
  } finally {
    pendingProjectAction.value = null
  }
}

async function rebuildProjectPreview(projectId: string) {
  if (pendingProjectAction.value !== null) {
    return
  }
  const openTab = projectTabs.value.find((tab) => tab.id === projectId)
  if (openTab?.dirty) {
    focusTab(openTab)
    globalNotice.value = 'Save Project to rebuild its preview.'
    return
  }

  pendingProjectAction.value = { kind: 'rebuild', projectId }
  homeError.value = null
  try {
    const result = await projectApi().rebuildPreview(projectId)
    if (!result.ok) {
      if (result.error.code === 'PROJECT_DIRTY') {
        const dirtyTab = projectTabs.value.find((tab) => tab.id === projectId)
        if (dirtyTab) {
          focusTab(dirtyTab)
          globalNotice.value = 'Save Project to rebuild its preview.'
        } else {
          homeError.value = 'Save Project to rebuild its preview.'
        }
      } else if (result.error.code === 'PROJECT_WORKER_UNAVAILABLE') {
        homeError.value = `Rebuild Preview needs an available image worker. ${result.error.message}`
      } else {
        homeError.value = result.error.message
      }
      return
    }

    await refreshProjects()
    const warnings: string[] = []
    if (!result.value.directorySynced) {
      warnings.push('The preview was rebuilt, but disk synchronization could not be confirmed.')
    }
    if (result.value.indexWarning) {
      warnings.push(
        `The preview was rebuilt. Home may show outdated project details. ${result.value.indexWarning}`,
      )
    }
    if (warnings.length > 0) {
      globalNotice.value = warnings.join(' ')
    }
  } catch (cause) {
    homeError.value = errorMessage(cause)
  } finally {
    pendingProjectAction.value = null
  }
}

async function selectImport() {
  if (pendingProjectAction.value !== null || importTransfer.value) {
    return
  }
  pendingProjectAction.value = { kind: 'import-select' }
  homeError.value = null
  try {
    const selection = await apiValue(() => projectApi().selectImport())
    if (!selection) {
      return
    }
    if (selection.kind === 'opened') {
      if (selection.result.kind === 'opened') {
        focusTab(selection.result.tab)
        if (selection.result.tab.storageWarning) {
          globalNotice.value = selection.result.tab.storageWarning
        }
      } else {
        recoveryDecision.value = selection.result
        recoveryError.value = null
      }
      await refreshProjects()
      return
    }
    importChoice.value = 'move'
    importTransfer.value = selection
    importDialogVisible.value = true
  } catch (cause) {
    homeError.value = errorMessage(cause)
  } finally {
    pendingProjectAction.value = null
  }
}

async function cancelImport() {
  const transfer = importTransfer.value
  if (!transfer || !importDialogVisible.value || pendingProjectAction.value !== null) {
    return
  }
  importDialogVisible.value = false
  try {
    const result = await projectApi().cancelImport(transfer.importId)
    if (!result.ok) {
      homeError.value = result.error.message
    }
  } catch (cause) {
    homeError.value = errorMessage(cause)
  }
}

async function finishImport() {
  const transfer = importTransfer.value
  if (!transfer || pendingProjectAction.value !== null) {
    return
  }
  pendingProjectAction.value = { kind: 'import-finish' }
  try {
    const finished = await apiValue(() =>
      projectApi().finishImport(transfer.importId, importChoice.value),
    )
    importDialogVisible.value = false
    const warning = [
      finished.warning,
      finished.result.kind === 'opened' ? finished.result.tab.storageWarning : undefined,
    ]
      .filter(Boolean)
      .join(' ')
    if (warning) {
      globalNotice.value = warning
    }
    if (finished.result.kind === 'opened') {
      focusTab(finished.result.tab)
    } else {
      recoveryDecision.value = finished.result
      recoveryError.value = null
    }
    await refreshProjects()
  } catch (cause) {
    // Import selections are one-use in main, including failed attempts. Return to the picker.
    importDialogVisible.value = false
    homeError.value = errorMessage(cause)
  } finally {
    pendingProjectAction.value = null
  }
}

function cancelRecovery() {
  if (pendingProjectAction.value?.kind === 'recover') {
    return
  }
  queueResultNavigator.cancelProjectOpen()
  cancelAcceptedHistoryNavigation()
  recoveryDecision.value = null
  recoveryError.value = null
}

async function resolveRecovery(decision: 'discard' | 'recover') {
  const pendingRecovery = recoveryDecision.value
  if (!pendingRecovery || pendingProjectAction.value !== null) {
    return
  }
  if (decision === 'recover' && pendingRecovery.recoveryStatus !== 'recoverable') {
    return
  }
  if (decision === 'discard') {
    cancelAcceptedHistoryNavigation()
    // This explicit recovery decision discards temporary results as well as the document shadow.
    queueResultNavigator.cancelProjectOpen()
  }
  pendingProjectAction.value = { kind: 'recover' }
  recoveryError.value = null
  try {
    const tab = await apiValue(() =>
      projectApi().resolveRecovery(pendingRecovery.projectId, decision),
    )
    recoveryDecision.value = null
    focusTab(
      tab,
      queueResultNavigator.getPendingProjectOpen()?.projectKey === pendingRecovery.projectId ||
        pendingAcceptedHistory?.reference.projectKey === pendingRecovery.projectId,
    )
    if (tab.storageWarning) {
      globalNotice.value = tab.storageWarning
    }
    await refreshProjects()
  } catch (cause) {
    queueResultNavigator.cancelProjectOpen()
    cancelAcceptedHistoryNavigation()
    recoveryError.value = errorMessage(cause)
  } finally {
    pendingProjectAction.value = null
  }
  if (!recoveryDecision.value) {
    await continueQueueResultOpen(pendingRecovery.projectId)
    await continueAcceptedHistoryOpen(pendingRecovery.projectId)
  }
}

function setTabError(tabId: string, message: string | null) {
  tabErrors.value = { ...tabErrors.value, [tabId]: message }
}

function stopExportFeedbackTimer(tabId: string) {
  const timer = exportFeedbackTimers.get(tabId)
  if (timer !== undefined) {
    clearTimeout(timer)
    exportFeedbackTimers.delete(tabId)
  }
}

function clearExportFeedback(tabId: string) {
  stopExportFeedbackTimer(tabId)
  exportFeedbackByTab.value = { ...exportFeedbackByTab.value, [tabId]: null }
}

async function saveCandidateImage(tabId: string, candidateId: string) {
  if (pendingProjectAction.value !== null || windowClosePending.value) {
    return
  }
  pendingProjectAction.value = { kind: 'export-candidate', tabId }
  setTabError(tabId, null)
  clearExportFeedback(tabId)
  try {
    const outcome = await apiValue(() =>
      projectApi().saveGenerationCandidateImage(tabId, candidateId),
    )
    if (outcome.kind === 'saved') {
      exportFeedbackByTab.value = {
        ...exportFeedbackByTab.value,
        [tabId]: {
          kind: 'success',
          message: `Saved ${outcome.fileName}. Candidate stays in temporary results; not added to Project.`,
        },
      }
      const timer = setTimeout(() => clearExportFeedback(tabId), 6000)
      exportFeedbackTimers.set(tabId, timer)
    }
  } catch (cause) {
    exportFeedbackByTab.value = {
      ...exportFeedbackByTab.value,
      [tabId]: {
        kind: 'error',
        message: `Candidate image could not be saved. ${errorMessage(cause)}`,
      },
    }
  } finally {
    pendingProjectAction.value = null
  }
}

function candidateSetsForAcceptance(
  snapshot: ProjectGenerationResultsSnapshot,
  selection: CandidateSelection,
): {
  expectedCandidateIds: string[]
  expectedUnfinishedJobIds: string[]
  uncheckedCandidateIds: string[]
} {
  if (snapshot.recoveryUnavailable) {
    throw new Error('Temporary result recovery is unavailable. Repair it before adding results.')
  }
  const selected = new Set(selection.candidateIds)
  const eligible = snapshot.candidates.filter((candidate) => !candidate.sourceDocumentMismatch)
  const expectedCandidateIds = eligible.map((candidate) => candidate.candidateId)
  const available = new Set(expectedCandidateIds)
  if (
    selected.size === 0 ||
    selected.size !== selection.candidateIds.length ||
    [...selected].some((candidateId) => !available.has(candidateId))
  ) {
    throw new Error('Selected results changed. Review the current results and try Add again.')
  }
  return {
    expectedCandidateIds,
    expectedUnfinishedJobIds: [...snapshot.unfinishedSiblingJobIds],
    uncheckedCandidateIds: expectedCandidateIds.filter((candidateId) => !selected.has(candidateId)),
  }
}

function sameIds(left: string[], right: string[]): boolean {
  const other = new Set(right)
  return left.length === right.length && left.every((candidateId) => other.has(candidateId))
}

async function commitGenerationCandidates(decision: PendingAcceptance) {
  acceptanceCommitting.value = true
  try {
    await flushProjectDraft(decision.tabId)
    const result = await projectApi().acceptGenerationCandidates(
      decision.tabId,
      [...decision.candidateIds],
      decision.focusedCandidateId,
      [...decision.expectedCandidateIds],
      [...decision.expectedUnfinishedJobIds],
    )
    if (!result.ok && result.error.code === 'ACCEPTANCE_SELECTION_STALE') {
      setTabError(
        decision.tabId,
        'Generation results or unfinished jobs changed before Add. Review them and confirm Add again.',
      )
      return
    }
    if (!result.ok) {
      throw new Error(result.error.message)
    }
    replaceTab(result.value)
    saveNotices.value = { ...saveNotices.value, [decision.tabId]: null }
  } catch (cause) {
    // The shadow may already contain the accepted layers if only staging cleanup failed.
    // Re-read the open document instead of assuming that an error means no mutation occurred.
    try {
      const opened = await apiValue(() => projectApi().open(decision.tabId))
      if (opened.kind === 'opened') {
        replaceTab(opened.tab)
      }
    } catch {
      // Keep the original acceptance error visible; the next Project refresh can retry.
    }
    setTabError(
      decision.tabId,
      `Acceptance could not be confirmed. Check the layer stack and temporary results before retrying. ${errorMessage(cause)}`,
    )
  } finally {
    await refreshGenerationResults(decision.tabId)
    pendingAcceptance.value = null
    acceptanceNotice.value = null
    acceptanceCommitting.value = false
    pendingProjectAction.value = null
  }
}

async function acceptGenerationCandidates(tabId: string, selection: CandidateSelection) {
  if (
    pendingProjectAction.value !== null ||
    windowClosePending.value ||
    reloadRequiredIds.value.has(tabId) ||
    selection.candidateIds.length === 0
  ) {
    return
  }
  pendingProjectAction.value = { kind: 'accept-candidate', tabId }
  setTabError(tabId, null)
  acceptanceNotice.value = null
  try {
    const snapshot = await readGenerationResults(tabId)
    if (windowClosePending.value || !projectTabs.value.some((tab) => tab.id === tabId)) {
      return
    }
    const { expectedCandidateIds, expectedUnfinishedJobIds, uncheckedCandidateIds } =
      candidateSetsForAcceptance(snapshot, selection)
    const decision: PendingAcceptance = {
      candidateIds: [...selection.candidateIds],
      expectedCandidateIds,
      expectedUnfinishedJobIds,
      focusedCandidateId: selection.focusedCandidateId,
      tabId,
      uncheckedCandidateIds,
    }
    if (uncheckedCandidateIds.length > 0 || expectedUnfinishedJobIds.length > 0) {
      pendingAcceptance.value = decision
    } else {
      await commitGenerationCandidates(decision)
    }
  } catch (cause) {
    setTabError(tabId, errorMessage(cause))
  } finally {
    if (!pendingAcceptance.value && !acceptanceCommitting.value) {
      pendingProjectAction.value = null
    }
  }
}

function cancelAcceptance() {
  if (acceptanceCommitting.value) {
    return
  }
  pendingAcceptance.value = null
  acceptanceNotice.value = null
  pendingProjectAction.value = null
}

async function confirmAcceptance() {
  const decision = pendingAcceptance.value
  if (!decision || acceptanceCommitting.value || windowClosePending.value) {
    return
  }
  acceptanceCommitting.value = true
  acceptanceNotice.value = null
  try {
    const snapshot = await readGenerationResults(decision.tabId)
    if (windowClosePending.value) {
      return
    }
    const eligibleIds = new Set(
      snapshot.candidates
        .filter((candidate) => !candidate.sourceDocumentMismatch)
        .map((candidate) => candidate.candidateId),
    )
    if (decision.candidateIds.some((candidateId) => !eligibleIds.has(candidateId))) {
      pendingAcceptance.value = null
      pendingProjectAction.value = null
      setTabError(
        decision.tabId,
        'Selected results changed. Review the refreshed results and try Add again.',
      )
      return
    }
    const current = candidateSetsForAcceptance(snapshot, decision)
    if (
      !sameIds(decision.expectedCandidateIds, current.expectedCandidateIds) ||
      !sameIds(decision.expectedUnfinishedJobIds, current.expectedUnfinishedJobIds)
    ) {
      pendingAcceptance.value = { ...decision, ...current }
      acceptanceNotice.value = {
        message:
          'Results or unfinished jobs changed while this dialog was open. Review the counts and confirm again.',
        type: 'warning',
      }
      return
    }
    await commitGenerationCandidates(decision)
  } catch (cause) {
    acceptanceNotice.value = { message: errorMessage(cause), type: 'error' }
  } finally {
    acceptanceCommitting.value = false
    if (windowClosePending.value) {
      pendingAcceptance.value = null
      acceptanceNotice.value = null
      pendingProjectAction.value = null
    }
  }
}

async function applyBbox(tabId: string, rect: IgsRectV1) {
  if (
    pendingProjectAction.value !== null ||
    windowClosePending.value ||
    reloadRequiredIds.value.has(tabId)
  ) {
    return
  }
  pendingProjectAction.value = { kind: 'bbox', tabId }
  setTabError(tabId, null)
  try {
    await flushProjectDraft(tabId)
    replaceTab(await apiValue(() => projectApi().setPrimaryBbox(tabId, rect)))
    saveNotices.value = { ...saveNotices.value, [tabId]: null }
  } catch (cause) {
    setTabError(tabId, errorMessage(cause))
  } finally {
    pendingProjectAction.value = null
  }
}

async function updateRasterLayer(
  tabId: string,
  layerId: string,
  change: Parameters<ProjectApi['updateRasterLayer']>[2],
) {
  if (
    pendingProjectAction.value !== null ||
    windowClosePending.value ||
    reloadRequiredIds.value.has(tabId)
  ) {
    return
  }
  pendingProjectAction.value = { kind: 'layer', tabId }
  setTabError(tabId, null)
  try {
    await flushProjectDraft(tabId)
    replaceTab(await apiValue(() => projectApi().updateRasterLayer(tabId, layerId, change)))
    saveNotices.value = { ...saveNotices.value, [tabId]: null }
  } catch (cause) {
    setTabError(tabId, errorMessage(cause))
  } finally {
    pendingProjectAction.value = null
  }
}

async function importRasterImage(tabId: string) {
  if (
    pendingProjectAction.value !== null ||
    windowClosePending.value ||
    reloadRequiredIds.value.has(tabId)
  ) {
    return
  }
  pendingProjectAction.value = { kind: 'import-image', tabId }
  setTabError(tabId, null)
  try {
    await flushProjectDraft(tabId)
    const tab = await apiValue(() => projectApi().importRasterImage(tabId))
    if (tab) {
      replaceTab(tab)
      saveNotices.value = { ...saveNotices.value, [tabId]: null }
    }
  } catch (cause) {
    setTabError(tabId, errorMessage(cause))
  } finally {
    pendingProjectAction.value = null
  }
}

function importActiveRasterImage() {
  if (activeTab.value) {
    void importRasterImage(activeTab.value.id)
  }
}

async function moveRasterLayer(tabId: string, layerId: string, targetIndex: number) {
  if (
    pendingProjectAction.value !== null ||
    windowClosePending.value ||
    reloadRequiredIds.value.has(tabId)
  ) {
    return
  }
  pendingProjectAction.value = { kind: 'layer', tabId }
  setTabError(tabId, null)
  try {
    await flushProjectDraft(tabId)
    replaceTab(await apiValue(() => projectApi().moveRasterLayer(tabId, layerId, targetIndex)))
    saveNotices.value = { ...saveNotices.value, [tabId]: null }
  } catch (cause) {
    setTabError(tabId, errorMessage(cause))
  } finally {
    pendingProjectAction.value = null
  }
}

function moveActiveRasterLayer(layerId: string, targetIndex: number) {
  if (activeTab.value) {
    void moveRasterLayer(activeTab.value.id, layerId, targetIndex)
  }
}

function updateActiveRasterLayer(
  layerId: string,
  change: Parameters<ProjectApi['updateRasterLayer']>[2],
) {
  if (activeTab.value) {
    void updateRasterLayer(activeTab.value.id, layerId, change)
  }
}

function saveWarning(outcome: ProjectSaveResult): string | null {
  const warnings: string[] = []
  if (!outcome.directorySynced) {
    warnings.push('The file was saved, but disk synchronization could not be confirmed.')
  }
  if (outcome.indexWarning) {
    warnings.push(`Home may show outdated project details. ${outcome.indexWarning}`)
  }
  if (outcome.recoveryError || outcome.recoveryStatus === 'failed') {
    warnings.push(`The recovery copy still needs attention. ${outcome.recoveryError ?? ''}`.trim())
  }
  if (outcome.reloadRequired) {
    warnings.push('Reopen this project before editing further.')
  }
  return warnings.length > 0 ? warnings.join(' ') : null
}

async function runProjectHistoryAction(tabId: string, action: 'clear-history' | 'redo' | 'undo') {
  if (
    pendingProjectAction.value !== null ||
    windowClosePending.value ||
    reloadRequiredIds.value.has(tabId)
  ) {
    return
  }
  pendingProjectAction.value = { kind: action, tabId }
  setTabError(tabId, null)
  try {
    await flushProjectDraft(tabId)
    const request =
      action === 'undo'
        ? projectApi().undo(tabId)
        : action === 'redo'
          ? projectApi().redo(tabId)
          : projectApi().clearHistory(tabId)
    replaceTab(await apiValue(() => request))
    saveNotices.value = { ...saveNotices.value, [tabId]: null }
  } catch (cause) {
    setTabError(tabId, errorMessage(cause))
  } finally {
    pendingProjectAction.value = null
  }
}

function runActiveProjectHistoryAction(action: 'redo' | 'undo') {
  if (activeTab.value) {
    void runProjectHistoryAction(activeTab.value.id, action)
  }
}

async function closeProjectTab(
  tabId: string,
  discardChanges: boolean,
  confirmCloseImpact: boolean,
): Promise<boolean> {
  const result = discardChanges
    ? await projectApi().discardAndClose(tabId, confirmCloseImpact)
    : await projectApi().close(tabId, confirmCloseImpact)
  if (!result.ok) {
    if (result.error.code === 'PROJECT_CLOSE_CONFIRMATION_REQUIRED') {
      closeImpact.value = await apiValue(() => projectApi().getCloseImpact(tabId))
      closingTabId.value = tabId
      activeDocument.value = tabId
      closeError.value = 'Generation activity changed. Review what closing will discard or cancel.'
      return false
    }
    throw new Error(result.error.message)
  }
  removeTab(tabId)
  closingTabId.value = null
  closeImpact.value = null
  closeError.value = null
  await refreshProjects()
  return true
}

async function saveProject(tabId: string, closeAfter = false) {
  if (pendingProjectAction.value !== null || windowClosePending.value) {
    return
  }
  if (draftValidity.value[tabId] === false) {
    const message = 'Correct invalid generation settings before saving this Project.'
    setTabError(tabId, message)
    if (closeAfter) {
      closeError.value = message
    }
    activeDocument.value = tabId
    return
  }
  pendingProjectAction.value = { kind: 'save', tabId }
  setTabError(tabId, null)
  closeError.value = null
  const confirmCloseImpact = closeAfter && closeHasGeneration.value
  try {
    await flushProjectDraft(tabId)
    const outcome = await apiValue(() => projectApi().save(tabId))
    replaceTab(outcome.tab)
    // Save may snapshot a candidate completed since the last Results read. Refresh the local
    // cursor before the Seed control can offer a stale Reuse value.
    await refreshGenerationResults(tabId)
    const warning = saveWarning(outcome)
    saveNotices.value = { ...saveNotices.value, [tabId]: warning }
    if (outcome.reloadRequired) {
      reloadRequiredIds.value = new Set([...reloadRequiredIds.value, tabId])
    }
    await refreshProjects()
    if (closeAfter) {
      if (outcome.tab.dirty) {
        closeError.value = 'New changes remain after Save. Review them before closing.'
        return
      }
      try {
        const closed = await closeProjectTab(tabId, false, confirmCloseImpact)
        if (closed && warning) {
          globalNotice.value = warning
        }
      } catch (cause) {
        const message = `The project was saved, but the tab could not close. ${errorMessage(cause)}`
        setTabError(tabId, message)
        closeError.value = message
        activeDocument.value = tabId
      }
    }
  } catch (cause) {
    const message = errorMessage(cause)
    setTabError(tabId, message)
    if (closeAfter) {
      closeError.value = message
    }
  } finally {
    pendingProjectAction.value = null
  }
}

async function requestClose(tabId: string) {
  queueResultNavigator.cancelProjectOpen()
  if (pendingProjectAction.value !== null || windowClosePending.value) {
    return
  }
  pendingProjectAction.value = { kind: 'close', tabId }
  setTabError(tabId, null)
  closeError.value = null
  closeImpact.value = null
  try {
    try {
      await flushProjectDraft(tabId)
    } catch (cause) {
      const message = `The draft could not be updated. Retry closing after fixing the error. ${errorMessage(cause)}`
      setTabError(tabId, message)
      activeDocument.value = tabId
      return
    }
    const tab = projectTabs.value.find((candidate) => candidate.id === tabId)
    if (!tab) {
      return
    }
    const impact = await apiValue(() => projectApi().getCloseImpact(tabId))
    closeImpact.value = impact
    if (tab.dirty || hasGenerationCloseImpact(impact)) {
      closingTabId.value = tabId
      return
    }
    await closeProjectTab(tabId, false, false)
  } catch (cause) {
    setTabError(tabId, errorMessage(cause))
    activeDocument.value = tabId
  } finally {
    pendingProjectAction.value = null
  }
}

function cancelClose() {
  if (pendingProjectAction.value !== null) {
    return
  }
  closingTabId.value = null
  closeImpact.value = null
  closeError.value = null
}

async function confirmCleanClose() {
  const tabId = closingTabId.value
  if (!tabId || pendingProjectAction.value !== null || windowClosePending.value) {
    return
  }
  pendingProjectAction.value = { kind: 'close', tabId }
  closeError.value = null
  try {
    await closeProjectTab(tabId, false, closeHasGeneration.value)
  } catch (cause) {
    closeError.value = errorMessage(cause)
    activeDocument.value = tabId
  } finally {
    pendingProjectAction.value = null
  }
}

async function discardAndClose() {
  const tabId = closingTabId.value
  if (!tabId || pendingProjectAction.value !== null || windowClosePending.value) {
    return
  }
  pendingProjectAction.value = { kind: 'discard', tabId }
  closeError.value = null
  try {
    await closeProjectTab(tabId, true, closeHasGeneration.value)
  } catch (cause) {
    closeError.value = errorMessage(cause)
    activeDocument.value = tabId
  } finally {
    pendingProjectAction.value = null
  }
}

function applyRuntimeResult(result: ApiResult<RuntimeStatus>) {
  if (result.ok) {
    status.value = result.value
    runtimeError.value = null
  } else {
    runtimeError.value = result.error.message
  }
}

async function runRuntimeAction(action: 'check' | 'install' | 'repair') {
  if (runtimePending.value !== null) {
    return
  }
  runtimePending.value = action
  runtimeError.value = null
  try {
    const runtimeApi = globalThis.window.api?.runtime
    if (!runtimeApi) {
      runtimeError.value = 'The desktop application connection is unavailable.'
      return
    }
    const result = await runtimeApi[action === 'check' ? 'getStatus' : action]()
    applyRuntimeResult(result)
  } catch (cause) {
    runtimeError.value = errorMessage(cause)
  } finally {
    runtimePending.value = null
  }
}

function onAppKeydown(event: KeyboardEvent) {
  if (
    event.defaultPrevented ||
    event.isComposing ||
    (!event.ctrlKey && !event.metaKey) ||
    event.altKey
  ) {
    return
  }
  const tab = activeTab.value
  if (
    !tab ||
    modelManagerOpen.value ||
    presetManagerOpen.value ||
    presetApplyOpen.value ||
    showNewProject.value ||
    importDialogVisible.value ||
    recoveryDecision.value ||
    closingTabId.value ||
    pendingAcceptance.value ||
    pendingGeneration.value
  ) {
    return
  }
  const target = event.target instanceof Element ? event.target : null
  if (target?.closest('[role="dialog"]')) {
    return
  }
  const key = event.key.toLowerCase()
  if (key === 's' && !event.shiftKey) {
    event.preventDefault()
    void saveProject(tab.id)
    return
  }
  const action =
    key === 'z' && !event.shiftKey
      ? 'undo'
      : (key === 'z' && event.shiftKey) || (key === 'y' && !event.shiftKey)
        ? 'redo'
        : null
  if (!action) {
    return
  }
  if (
    target?.closest('input, textarea, [contenteditable="true"]') &&
    !target.closest('.prompt-editor .cm-content')
  ) {
    return
  }
  event.preventDefault()
  void runProjectHistoryAction(tab.id, action)
}

function updateGenerationProgress(snapshot: GenerationProgressSnapshot): void {
  if (!rendererDisposed && snapshot.revision >= generationProgress.value.revision) {
    generationProgress.value = snapshot
  }
}

onMounted(() => {
  try {
    unsubscribeProgress =
      globalThis.window.api?.projects.onGenerationProgress(updateGenerationProgress)
    void apiValue(() => projectApi().getGenerationProgress())
      .then(updateGenerationProgress)
      .catch((cause) => {
        globalNotice.value = errorMessage(cause)
      })
  } catch (cause) {
    globalNotice.value = errorMessage(cause)
  }
  try {
    unsubscribeModelInstall = globalThis.window.api?.models.onInstallChanged((job) => {
      if (job.status === 'completed' && activeTab.value) {
        void refreshModelCatalog()
      }
    })
  } catch (cause) {
    modelCatalogError.value = errorMessage(cause)
  }
  try {
    unsubscribeStatus = globalThis.window.api?.runtime.onStatusChanged((nextStatus) => {
      status.value = nextStatus
      if (nextStatus.kind === 'ready') {
        runtimeError.value = null
      }
      for (const tab of projectTabs.value) {
        void refreshGenerationState(tab.id)
      }
    })
  } catch (cause) {
    runtimeError.value = errorMessage(cause)
  }
  try {
    unsubscribeProjectTabs = globalThis.window.api?.projects.onTabsChanged(reconcileProjectTabs)
  } catch (cause) {
    homeError.value = errorMessage(cause)
  }
  try {
    unsubscribeGeneration =
      globalThis.window.api?.projects.onGenerationChanged(refreshOpenGeneration)
  } catch (cause) {
    globalNotice.value = errorMessage(cause)
  }
  try {
    unsubscribeBeforeWindowClose = globalThis.window.api?.projects.onBeforeWindowClose(
      async (setDecisionPending) => {
        windowClosePending.value = true
        queueResultNavigator.cancel()
        if (pendingAcceptance.value && !acceptanceCommitting.value) {
          cancelAcceptance()
        }
        if (pendingGeneration.value) {
          if (!generationCommitting.value) {
            keepGenerationResults()
          } else {
            pendingGeneration.value = null
            generationConfirmationNotice.value = null
          }
        }
        try {
          await presetManager.value?.prepareWindowClose(setDecisionPending)
          if (Object.values(draftValidity.value).includes(false)) {
            throw new Error('Correct invalid generation settings before closing the app.')
          }
          await draftSync.flushAll()
          for (const tab of projectTabs.value) {
            replaceTab(await apiValue(() => projectApi().sealPromptHistory(tab.id)))
            rotatePromptHistoryGroup(tab.id)
          }
        } catch (cause) {
          windowClosePending.value = false
          if (errorMessage(cause) !== WINDOW_CLOSE_CANCELED_MESSAGE) {
            globalNotice.value = `Window close was canceled. ${errorMessage(cause)}`
          }
          throw cause
        }
      },
      () => {
        windowClosePending.value = false
      },
    )
  } catch (cause) {
    globalNotice.value = errorMessage(cause)
  }
  globalThis.window.addEventListener('keydown', onAppKeydown)
  void runRuntimeAction('check')
  void refreshProjects()
})

onBeforeUnmount(() => {
  ++presetCreateEpoch
  ++presetCatalogEpoch
  ++presetOpeningEpoch
  rendererDisposed = true
  cancelAcceptedHistoryNavigation()
  queueResultNavigator.cancel()
  pendingGeneration.value = null
  generationConfirmationNotice.value = null
  for (const tabId of exportFeedbackTimers.keys()) {
    stopExportFeedbackTimer(tabId)
  }
  unsubscribeModelInstall?.()
  unsubscribeStatus?.()
  unsubscribeProjectTabs?.()
  unsubscribeBeforeWindowClose?.()
  unsubscribeGeneration?.()
  unsubscribeProgress?.()
  globalThis.window.removeEventListener('keydown', onAppKeydown)
})
</script>

<template>
  <NConfigProvider :theme="darkTheme" :themeOverrides="imageGenNaiveTheme">
    <div class="app-shell">
      <AppChrome
        :canRedo="
          Boolean(activeTab?.canRedo) &&
          pendingProjectAction === null &&
          !windowClosePending &&
          !reloadRequiredIds.has(activeTab?.id ?? '')
        "
        :canUndo="
          Boolean(activeTab?.canUndo) &&
          pendingProjectAction === null &&
          !windowClosePending &&
          !reloadRequiredIds.has(activeTab?.id ?? '')
        "
        :homeOpen
        :projectActive="Boolean(activeTab)"
        @acceptedResults="openSavedAcceptedResults"
        @home="openHome"
        @presets="openPresetManager"
        @queue="openGenerationQueue"
        @redo="runActiveProjectHistoryAction('redo')"
        @undo="runActiveProjectHistoryAction('undo')"
      />
      <nav aria-label="Open documents" class="document-tabs" role="tablist">
        <div
          v-if="homeOpen"
          aria-label="Home"
          :aria-selected="activeDocument === 'home'"
          class="document-tab"
          :class="{ 'document-tab--active': activeDocument === 'home' }"
          role="tab"
          tabindex="0"
          @click="activateDocument('home')"
          @keydown="onTabKeydown($event, 'home')"
        >
          <NIcon :component="HomeIcon" />
          <span>Home</span>
          <NButton
            aria-label="Close Home"
            circle
            class="tab-close"
            quaternary
            size="tiny"
            @click.stop="closeHome"
          >
            <template v-slot:icon><NIcon :component="XIcon" /></template>
          </NButton>
        </div>
        <div
          v-for="tab of projectTabs"
          :key="tab.id"
          :aria-label="tab.title"
          :aria-selected="activeDocument === tab.id"
          class="document-tab"
          :class="{ 'document-tab--active': activeDocument === tab.id }"
          role="tab"
          tabindex="0"
          @click="activateDocument(tab.id)"
          @keydown="onTabKeydown($event, tab.id)"
        >
          <span aria-hidden="true" class="project-marker" />
          <span class="tab-title" :title="tab.title">{{ tab.title }}</span>
          <span v-if="tab.dirty" aria-label="Unsaved changes" class="tab-dirty">•</span>
          <NButton
            :aria-label="`Close ${tab.title}`"
            circle
            class="tab-close"
            :disabled="pendingProjectAction !== null || windowClosePending"
            quaternary
            size="tiny"
            @click.stop="requestClose(tab.id)"
          >
            <template v-slot:icon><NIcon :component="XIcon" /></template>
          </NButton>
        </div>
      </nav>

      <main class="app-stage">
        <RuntimeNotice
          v-if="showRuntimeNotice"
          :error="runtimeError"
          :pending="runtimePending"
          :status
          @check="runRuntimeAction('check')"
          @install="runRuntimeAction('install')"
          @repair="runRuntimeAction('repair')"
        />
        <NAlert
          v-if="globalNotice"
          class="global-notice"
          closable
          type="warning"
          @close="globalNotice = null"
        >
          {{ globalNotice }}
        </NAlert>
        <HomeView
          v-if="activeDocument === 'home' && homeOpen"
          :busy="pendingProjectAction !== null || windowClosePending"
          :error="homeError"
          :loading="projectsLoading"
          :pendingAction="pendingHomeAction"
          :projects
          @createProject="beginNewProject"
          @importProject="selectImport"
          @manageModels="openModelManager()"
          @managePresets="openPresetManager"
          @openProject="openProject"
          @rebuildPreview="rebuildProjectPreview"
          @refresh="refreshProjects"
        />
        <ProjectView
          v-else-if="activeTab"
          :key="activeTab.id"
          v-model:imagesPerClick="activeImagesPerClick"
          :acceptedHistoryFocus="
            acceptedHistoryFocus?.projectKey === activeTab.id ? acceptedHistoryFocus : null
          "
          :busy="pendingProjectAction !== null || windowClosePending"
          :draftPending="Boolean(generationDraftOverlays[activeTab.id])"
          :error="tabErrors[activeTab.id] ?? null"
          :exportFeedback="exportFeedbackByTab[activeTab.id] ?? null"
          :generationCanceling="generationCanceling[activeTab.id] ?? false"
          :generationDraft="generationDraftOverlays[activeTab.id] ?? activeTab.generationDraft"
          :generationError="generationStateErrors[activeTab.id] ?? null"
          :generationNotice="generationNotices[activeTab.id] ?? null"
          :generationProgress
          :generationResultFocus="generationResultFocusByTab[activeTab.id] ?? null"
          :generationResults="generationResultsByTab[activeTab.id] ?? null"
          :generationResultsError="generationResultsErrors[activeTab.id] ?? null"
          :generationResultsLoading="generationResultsLoading[activeTab.id] ?? false"
          :generationState="generationStatesByTab[activeTab.id] ?? null"
          :generationStateLoading="generationStateLoading[activeTab.id] ?? false"
          :generationSubmitting="
            pendingProjectAction?.kind === 'generate' &&
            pendingProjectAction.tabId === activeTab.id &&
            generationCommitting
          "
          :modelCatalog
          :modelCatalogError
          :modelCatalogLoaded
          :modelCatalogLoading
          :pending="activeTabPending"
          :presets="presetCatalog"
          :presetsError="presetCatalogError"
          :presetsLoading="presetCatalogLoading"
          :promptHistoryEpoch="promptHistoryEpochs[activeTab.id] ?? 0"
          :reloadRequired="reloadRequiredIds.has(activeTab.id)"
          :runtimeUnavailableReason
          :saveNotice="saveNotices[activeTab.id] ?? null"
          :tab="activeTab"
          @acceptCandidates="acceptGenerationCandidates(activeTab.id, $event)"
          @acceptedHistoryFocusHandled="
            acceptedHistoryFocus?.requestId === $event && (acceptedHistoryFocus = null)
          "
          @addLora="addGenerationLora(activeTab.id, $event)"
          @applyBbox="applyBbox(activeTab.id, $event)"
          @cancelGeneration="cancelCurrentGeneration(activeTab.id)"
          @choosePreset="chooseProjectPreset(activeTab.id, $event)"
          @clearExportFeedback="clearExportFeedback(activeTab.id)"
          @clearHistory="runProjectHistoryAction(activeTab.id, 'clear-history')"
          @generate="generateProject(activeTab.id, $event)"
          @importImage="importActiveRasterImage"
          @manageModels="openModelManager($event)"
          @managePresets="openPresetManager"
          @moveLayer="moveActiveRasterLayer"
          @redo="runProjectHistoryAction(activeTab.id, 'redo')"
          @refreshGenerationResults="refreshGenerationResults(activeTab.id)"
          @refreshGenerationState="refreshGenerationState(activeTab.id)"
          @refreshModels="refreshModelCatalog"
          @refreshPresets="refreshPresetCatalog"
          @relinkEmbedding="relinkGenerationEmbedding(activeTab.id, $event)"
          @relinkLora="relinkGenerationLora(activeTab.id, $event)"
          @relinkModel="relinkGenerationModel(activeTab.id)"
          @relinkVae="relinkGenerationVae(activeTab.id)"
          @removeLora="removeGenerationLora(activeTab.id, $event)"
          @resultFocusHandled="clearResultFocus(activeTab.id, $event)"
          @save="saveProject(activeTab.id)"
          @saveCandidateImage="saveCandidateImage(activeTab.id, $event)"
          @savePreset="saveCurrentAsPreset(activeTab.id, $event)"
          @saveResultPreset="saveResultAsPreset(activeTab.id, $event)"
          @sealPromptHistory="sealPromptHistory(activeTab.id, $event)"
          @selectModel="setGenerationModel(activeTab.id, $event)"
          @selectVae="setGenerationVae(activeTab.id, $event)"
          @undo="runProjectHistoryAction(activeTab.id, 'undo')"
          @updateDraft="updateActiveGenerationDraft"
          @updateLayer="updateActiveRasterLayer"
          @validateDraft="setDraftValidity"
        />
        <NEmpty v-else class="empty-document" description="No document open">
          <template v-slot:extra>
            <NButton type="primary" @click="openHome">Open Home</NButton>
          </template>
        </NEmpty>
      </main>

      <ModelManager
        v-model:show="modelManagerOpen"
        :focus="modelManagerFocus"
        @afterClose="presetModelsDismissed"
      />
      <PresetManager
        ref="presetManager"
        v-model:show="presetManagerOpen"
        :catalog="modelCatalog"
        :catalogReady="modelCatalogLoaded && !modelCatalogLoading && modelCatalogError === null"
        :createIntent="presetManagerCreateIntent"
        :initialPresetId="presetManagerInitialId"
      />
      <ApplyPresetModal
        v-if="presetApplication && presetApplyTab && presetApplyCurrent"
        v-model:show="presetApplyOpen"
        :busy="presetApplyBusy"
        :catalog="modelCatalog"
        :catalogReady="modelCatalogLoaded && !modelCatalogLoading && modelCatalogError === null"
        :current="presetApplyCurrent"
        :error="presetApplyError"
        :projectName="presetApplyTab.title"
        :source="presetApplication.source"
        :suspended="presetModelHandoff !== null"
        @apply="applyProjectPreset"
        @editOriginal="editPresetOriginal"
        @manageModels="openPresetResourceModels"
        @suspended="openSuspendedPresetModels"
      />

      <AcceptedResultsBrowser
        v-model:show="savedAcceptedResultsOpen"
        :busy="acceptedHistoryOpening || pendingProjectAction !== null || windowClosePending"
        :navigationError="acceptedHistoryError"
        :readPage="readAcceptedHistoryPage"
        @closed="acceptedHistoryClosed"
        @openResult="openSavedAcceptedResult"
      />

      <GenerationQueueManager
        v-model:show="generationQueueOpen"
        :appBusy="
          pendingProjectAction !== null || windowClosePending || queueResultOpeningId !== null
        "
        :generationErrors="generationStateErrors"
        :generationLoading="generationStateLoading"
        :generationProgress
        :generationStates="generationStatesByTab"
        :projectTabs
        :refreshEpoch="generationQueueEpoch"
        :reloadRequiredIds
        :resultErrors="generationResultsErrors"
        :resultLoading="generationResultsLoading"
        :resultNavigationError="queueResultNavigationError"
        :resultOpeningId="queueResultOpeningId"
        :resultSnapshots="generationResultsByTab"
        :runtimeUnavailableReason
        @changed="refreshOpenGeneration"
        @openProject="openQueueProject"
        @openResult="openQueueResult"
        @refreshResults="refreshQueueResults"
      />

      <NModal
        :closeOnEsc="pendingProjectAction?.kind !== 'import-finish'"
        :maskClosable="false"
        :show="importDialogVisible"
        @afterLeave="importTransfer = null"
        @update:show="!$event && cancelImport()"
      >
        <NCard
          aria-label="Import Project"
          class="dialog-card"
          contentScrollable
          role="dialog"
          size="small"
          title="Import Project"
        >
          <p>
            Add
            <strong>{{ importTransfer?.title }}</strong>
            ({{ importTransfer?.fileName }}) to Uncategorized before opening it.
          </p>
          <NRadioGroup v-model:value="importChoice" aria-label="Import method">
            <NRadio value="move">Move the file here</NRadio>
            <NRadio value="copy">Keep the original and copy it here</NRadio>
          </NRadioGroup>
          <div class="dialog-actions">
            <NButton :disabled="pendingProjectAction !== null" @click="cancelImport">
              Cancel
            </NButton>
            <NButton
              :disabled="pendingProjectAction !== null"
              :loading="pendingProjectAction?.kind === 'import-finish'"
              type="primary"
              @click="finishImport"
            >
              {{ importChoice === 'move' ? 'Move and Open' : 'Copy and Open' }}
            </NButton>
          </div>
        </NCard>
      </NModal>

      <NewProjectModal
        v-model:show="showNewProject"
        :busy="pendingProjectAction !== null || windowClosePending"
        :catalog="modelCatalog"
        :catalogReady="modelCatalogLoaded && !modelCatalogLoading && modelCatalogError === null"
        :createError="newProjectError"
        :presets="presetCatalog"
        :presetsError="presetCatalogError"
        :presetsLoading="presetCatalogLoading"
        @create="createProject"
        @refreshPresets="refreshPresetCatalog"
      />

      <NModal
        :closeOnEsc="pendingProjectAction?.kind !== 'recover'"
        :maskClosable="false"
        :show="recoveryDecision !== null"
        @update:show="!$event && cancelRecovery()"
      >
        <NCard
          aria-label="Recovery available"
          class="dialog-card"
          contentScrollable
          role="dialog"
          size="small"
          title="Recovery available"
        >
          <NAlert v-if="recoveryError" class="dialog-error" type="error">
            {{ recoveryError }}
          </NAlert>
          <p>{{ recoveryDecision?.reason }}</p>
          <p v-if="recoveryDecision?.recoveryStatus !== 'recoverable'" class="dialog-secondary">
            The recovery copy cannot be opened. You can open the saved project or leave it
            unchanged.
          </p>
          <p v-else class="dialog-secondary">
            Recover restores available project changes and temporary results for review. The saved
            .igs file changes only after Save.
          </p>
          <p class="dialog-secondary">
            Discard Recovery removes this project's unsaved changes and all temporary generation
            results, then opens the saved .igs file.
          </p>
          <div class="dialog-actions">
            <NButton :disabled="pendingProjectAction !== null" @click="cancelRecovery">
              Cancel
            </NButton>
            <NButton
              :disabled="pendingProjectAction !== null"
              :loading="pendingProjectAction?.kind === 'recover'"
              @click="resolveRecovery('discard')"
            >
              Discard Recovery and Open Saved
            </NButton>
            <NButton
              v-if="recoveryDecision?.recoveryStatus === 'recoverable'"
              :disabled="pendingProjectAction !== null"
              :loading="pendingProjectAction?.kind === 'recover'"
              type="primary"
              @click="resolveRecovery('recover')"
            >
              Recover
            </NButton>
          </div>
        </NCard>
      </NModal>

      <NModal
        :closeOnEsc="!generationCommitting"
        :maskClosable="false"
        :show="pendingGeneration !== null"
        @update:show="!$event && keepGenerationResults()"
      >
        <NCard
          aria-label="Replace temporary generation results"
          class="dialog-card"
          contentScrollable
          role="dialog"
          size="small"
          title="Replace temporary results?"
        >
          <NAlert v-if="generationConfirmationNotice" class="dialog-error" type="warning">
            {{ generationConfirmationNotice }}
          </NAlert>
          <p v-if="pendingGeneration?.candidateIds.length">
            {{ pendingGeneration.candidateIds.length }} temporary
            {{ pendingGeneration.candidateIds.length === 1 ? 'result' : 'results' }} will be
            discarded. Keep the results to add a layer or save an image first.
          </p>
          <p v-if="pendingGeneration?.unfinishedJobIds.length">
            {{ pendingGeneration.unfinishedJobIds.length }} unfinished generation
            {{ pendingGeneration.unfinishedJobIds.length === 1 ? 'job' : 'jobs' }} will be canceled.
          </p>
          <p class="dialog-secondary">Existing Project layers will remain.</p>
          <div class="dialog-actions">
            <NButton :disabled="generationCommitting" @click="keepGenerationResults">
              Keep results
            </NButton>
            <NButton
              :disabled="windowClosePending"
              :loading="generationCommitting"
              type="primary"
              @click="confirmGenerationReplacement"
            >
              Discard and Generate
            </NButton>
          </div>
        </NCard>
      </NModal>

      <NModal
        :closeOnEsc="!acceptanceCommitting"
        :maskClosable="false"
        :show="pendingAcceptance !== null"
        @update:show="!$event && cancelAcceptance()"
      >
        <NCard
          aria-label="Accept generation results"
          class="dialog-card"
          contentScrollable
          role="dialog"
          size="small"
          title="Add selected results"
        >
          <NAlert
            v-if="acceptanceNotice"
            key="acceptance-notice"
            class="dialog-error"
            :type="acceptanceNotice.type"
          >
            {{ acceptanceNotice.message }}
          </NAlert>
          <p v-if="pendingAcceptance">
            Add {{ pendingAcceptance.candidateIds.length }} selected
            {{ pendingAcceptance.candidateIds.length === 1 ? 'result' : 'results' }} as Raster
            {{ pendingAcceptance.candidateIds.length === 1 ? 'Layer' : 'Layers' }}.
          </p>
          <NAlert
            v-if="pendingAcceptance?.expectedUnfinishedJobIds.length"
            key="cancel-jobs-warning"
            type="warning"
          >
            {{ pendingAcceptance.expectedUnfinishedJobIds.length }} unfinished generation
            {{ pendingAcceptance.expectedUnfinishedJobIds.length === 1 ? 'job' : 'jobs' }} will be
            canceled before Add.
          </NAlert>
          <NAlert
            v-if="pendingAcceptance?.uncheckedCandidateIds.length"
            key="discard-warning"
            type="warning"
          >
            {{ pendingAcceptance.uncheckedCandidateIds.length }} unchecked temporary
            {{ pendingAcceptance.uncheckedCandidateIds.length === 1 ? 'result' : 'results' }} will
            be discarded. To keep one, cancel and select it or save its image first.
          </NAlert>
          <div class="dialog-actions">
            <NButton :disabled="acceptanceCommitting" @click="cancelAcceptance">Cancel</NButton>
            <NButton :loading="acceptanceCommitting" type="primary" @click="confirmAcceptance">
              {{ acceptanceActionLabel }}
            </NButton>
          </div>
        </NCard>
      </NModal>

      <NModal
        :closeOnEsc="pendingProjectAction === null"
        :maskClosable="false"
        :show="closingTabId !== null"
        @update:show="!$event && cancelClose()"
      >
        <NCard
          aria-label="Close Project"
          class="dialog-card"
          contentScrollable
          role="dialog"
          size="small"
          :title="closingTab?.dirty ? 'Unsaved changes' : 'Close Project'"
        >
          <NAlert v-if="closeError" class="dialog-error" type="error">{{ closeError }}</NAlert>
          <p v-if="closingTab" class="dialog-secondary">{{ closingTab.title }}</p>
          <p v-if="closingTab?.dirty">
            This project has changes that are not in its saved .igs file.
          </p>
          <p v-if="closeImpact?.completedCandidateCount">
            Unaccepted generation results will be discarded when this project closes. Any jobs still
            unfinished at close will also be canceled.
          </p>
          <p v-if="closeImpact?.unfinishedJobCount">
            Unfinished generation jobs will be canceled when this project closes. Any results that
            finish before closing will also be discarded.
          </p>
          <p v-if="closeImpact?.generationStorageUnavailable">
            Generation recovery storage cannot be inspected. Closing will keep any temporary results
            on this computer for another recovery attempt.
          </p>
          <div class="dialog-actions">
            <NButton :disabled="pendingProjectAction !== null" @click="cancelClose">Cancel</NButton>
            <NButton
              v-if="closingTab?.dirty"
              :disabled="pendingProjectAction !== null"
              :loading="pendingProjectAction?.kind === 'discard'"
              secondary
              type="error"
              @click="discardAndClose"
            >
              Discard Changes
            </NButton>
            <NButton
              v-if="closingTab?.dirty"
              key="save-and-close"
              :disabled="pendingProjectAction !== null"
              :loading="pendingProjectAction?.kind === 'save'"
              type="primary"
              @click="closingTabId && saveProject(closingTabId, true)"
            >
              Save and Close
            </NButton>
            <NButton
              v-else
              key="close-with-generation"
              :disabled="pendingProjectAction !== null"
              :loading="pendingProjectAction?.kind === 'close'"
              secondary
              type="error"
              @click="confirmCleanClose"
            >
              {{
                closeImpact?.generationStorageUnavailable
                  ? 'Close and Keep Recovery'
                  : closeImpact?.completedCandidateCount
                    ? 'Discard Candidates and Close'
                    : 'Cancel Jobs and Close'
              }}
            </NButton>
          </div>
        </NCard>
      </NModal>
    </div>
  </NConfigProvider>
</template>

<style scoped>
.app-shell {
  display: grid;
  grid-template-rows: var(--app-chrome-height) var(--app-tabs-height) minmax(0, 1fr);
  height: 100vh;
}

.document-tabs {
  display: flex;
  min-width: 0;
  height: var(--app-tabs-height);
  overflow-x: auto;
  padding-left: 8px;
  border-bottom: 1px solid var(--app-border);
  background: var(--app-chrome);
  scrollbar-width: thin;
  user-select: none;
  -webkit-app-region: drag;
}

.document-tab {
  display: flex;
  flex: 0 0 166px;
  align-items: center;
  gap: 8px;
  min-width: 0;
  height: 100%;
  padding: 0 7px 0 10px;
  border: 1px solid transparent;
  border-right-color: var(--app-border);
  color: var(--app-text-muted);
  cursor: default;
  -webkit-app-region: no-drag;
}

.document-tab--active {
  border-color: var(--app-border);
  border-bottom-color: var(--app-surface);
  color: var(--app-tab-active-text);
  background: var(--app-surface);
}

.document-tab > .tab-title,
.document-tab > span:not(.project-marker, .tab-dirty) {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-marker {
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  border-radius: 2px;
  background: var(--app-tab-active-text);
}

.tab-dirty {
  flex: 0 0 auto;
  color: var(--app-tab-active-text);
  font-size: 16px;
  line-height: 1;
}

.tab-close {
  flex: 0 0 auto;
  opacity: 0.58;
}

.app-stage {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--app-surface);
}

.global-notice {
  margin: 12px 18px 0;
}

.empty-document {
  margin: auto;
}

.dialog-card {
  width: min(460px, calc(100vw - 32px));
  max-height: calc(100vh - 32px);
}

.dialog-card p {
  margin: 0 0 14px;
}

.dialog-secondary {
  color: var(--app-text-muted);
  font-size: var(--app-font-size-meta);
}

.dialog-error {
  margin-bottom: 14px;
}

.dialog-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
}

.dialog-actions--footer {
  margin-top: 0;
}
</style>
