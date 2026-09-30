<script setup lang="ts">
import type {
  ApiResult,
  ModelCatalogItem,
  ProjectApi,
  ProjectCloseImpact,
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
import type { IgsRectV1 } from '../shared/projects/project-schema.js'
import { IGS_SAFETY_CEILINGS } from '../shared/projects/project-schema.js'

import { Home as HomeIcon, X as XIcon } from '@vicons/tabler'
import {
  darkTheme,
  NAlert,
  NButton,
  NCard,
  NConfigProvider,
  NEmpty,
  NFormItem,
  NIcon,
  NInput,
  NModal,
  NRadio,
  NRadioGroup,
} from 'naive-ui'
import { computed, onBeforeUnmount, onMounted, ref, toRaw, watch } from 'vue'

import type { CandidateExportFeedback } from './components/candidate-export-feedback.js'
import type { ModelManagerFocus } from './components/model-manager-focus.js'
import type { AspectRatioState, ResolutionSize } from './components/resolution-control'

import AppChrome from './components/AppChrome.vue'
import HomeView from './components/HomeView.vue'
import ModelManager from './components/ModelManager.vue'
import { ProjectDraftSync } from './components/project-draft-sync.js'
import ProjectView from './components/ProjectView.vue'
import ResolutionControl from './components/ResolutionControl.vue'
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
        | 'history'
        | 'import-image'
        | 'layer'
        | 'model'
        | 'redo'
        | 'save'
        | 'undo'
      tabId: string
    }

const homeOpen = ref(true)
const activeDocument = ref<string | null>('home')
const modelManagerOpen = ref(false)
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
const newProjectName = ref('')
const newProjectSize = ref<ResolutionSize>({ height: 1024, width: 1024 })
const newProjectAspect = ref<AspectRatioState>({ id: 'free', locked: false, value: 1 })
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
let projectListRequest = 0
let modelCatalogRequest = 0

const activeTab = computed(
  () => projectTabs.value.find((tab) => tab.id === activeDocument.value) ?? null,
)
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

function openModelManager(focus: ModelManagerFocus | null = null) {
  modelManagerFocus.value = focus
  modelManagerOpen.value = true
}
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
const canCreateProject = computed(
  () =>
    newProjectName.value.trim().length > 0 &&
    new TextEncoder().encode(newProjectName.value.trim()).length <=
      IGS_SAFETY_CEILINGS.titleBytes &&
    validDimension(newProjectSize.value.width) &&
    validDimension(newProjectSize.value.height),
)

function validDimension(value: number | null): value is number {
  return (
    value !== null &&
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= IGS_SAFETY_CEILINGS.rasterDimension
  )
}

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

watch(
  () => activeTab.value?.id,
  (tabId) => {
    if (tabId) {
      void refreshModelCatalog()
      void refreshGenerationResults(tabId)
    }
  },
)

async function readGenerationResults(tabId: string): Promise<ProjectGenerationResultsSnapshot> {
  const request = (generationResultsRequests.get(tabId) ?? 0) + 1
  generationResultsRequests.set(tabId, request)
  generationResultsLoading.value = { ...generationResultsLoading.value, [tabId]: true }
  generationResultsErrors.value = { ...generationResultsErrors.value, [tabId]: null }
  try {
    const snapshot = await apiValue(() => projectApi().listGenerationResults(tabId))
    if (
      generationResultsRequests.get(tabId) === request &&
      projectTabs.value.some((tab) => tab.id === tabId)
    ) {
      generationResultsByTab.value = { ...generationResultsByTab.value, [tabId]: snapshot }
    }
    return snapshot
  } catch (cause) {
    if (generationResultsRequests.get(tabId) === request) {
      const { [tabId]: _stale, ...remaining } = generationResultsByTab.value
      generationResultsByTab.value = remaining
      generationResultsErrors.value = {
        ...generationResultsErrors.value,
        [tabId]: errorMessage(cause),
      }
    }
    throw cause
  } finally {
    if (generationResultsRequests.get(tabId) === request) {
      generationResultsLoading.value = { ...generationResultsLoading.value, [tabId]: false }
    }
  }
}

async function refreshGenerationResults(tabId: string) {
  await readGenerationResults(tabId).catch(() => undefined)
}

watch(modelManagerOpen, (open, previous) => {
  if (previous && !open && activeTab.value) {
    void refreshModelCatalog()
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

function focusTab(tab: ProjectTab) {
  replaceTab(tab)
  activeDocument.value = tab.id
  tabErrors.value = { ...tabErrors.value, [tab.id]: null }
}

function removeTab(tabId: string) {
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
    if (!openIds.has(tab.id)) {
      stopExportFeedbackTimer(tab.id)
      draftSync.forget(tab.id)
      generationResultsRequests.set(tab.id, (generationResultsRequests.get(tab.id) ?? 0) + 1)
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
  homeOpen.value = false
  if (activeDocument.value === 'home') {
    activeDocument.value = projectTabs.value.at(-1)?.id ?? null
  }
}

async function activateDocument(documentId: string): Promise<boolean> {
  if (activeDocument.value === documentId) {
    return true
  }
  if (pendingProjectAction.value !== null || windowClosePending.value) {
    return false
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
  newProjectName.value = ''
  newProjectSize.value = { height: 1024, width: 1024 }
  newProjectAspect.value = { id: 'free', locked: false, value: 1 }
  newProjectError.value = null
  showNewProject.value = true
}

async function createProject() {
  if (!canCreateProject.value || pendingProjectAction.value !== null) {
    return
  }
  const { height, width } = newProjectSize.value
  if (!validDimension(width) || !validDimension(height)) {
    return
  }
  pendingProjectAction.value = { kind: 'create' }
  newProjectError.value = null
  try {
    const tab = await apiValue(() =>
      projectApi().create({ height, title: newProjectName.value.trim(), width }),
    )
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

async function openProject(projectId: string) {
  if (pendingProjectAction.value !== null) {
    return
  }
  const existing = projectTabs.value.find((tab) => tab.id === projectId)
  if (existing) {
    focusTab(existing)
    return
  }
  pendingProjectAction.value = { kind: 'open', projectId }
  homeError.value = null
  try {
    const result = await apiValue(() => projectApi().open(projectId))
    if (result.kind === 'recovery-required') {
      recoveryDecision.value = result
      recoveryError.value = null
    } else {
      focusTab(result.tab)
      await refreshProjects()
    }
  } catch (cause) {
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
    if (finished.warning) {
      globalNotice.value = finished.warning
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
  pendingProjectAction.value = { kind: 'recover' }
  recoveryError.value = null
  try {
    const tab = await apiValue(() =>
      projectApi().resolveRecovery(pendingRecovery.projectId, decision),
    )
    recoveryDecision.value = null
    focusTab(tab)
    await refreshProjects()
  } catch (cause) {
    recoveryError.value = errorMessage(cause)
  } finally {
    pendingProjectAction.value = null
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
    showNewProject.value ||
    importDialogVisible.value ||
    recoveryDecision.value ||
    closingTabId.value ||
    pendingAcceptance.value
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

onMounted(() => {
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
    unsubscribeBeforeWindowClose = globalThis.window.api?.projects.onBeforeWindowClose(
      async () => {
        windowClosePending.value = true
        if (pendingAcceptance.value && !acceptanceCommitting.value) {
          cancelAcceptance()
        }
        try {
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
          globalNotice.value = `Window close was canceled because a Project draft could not be updated. ${errorMessage(cause)}`
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
  for (const tabId of exportFeedbackTimers.keys()) {
    stopExportFeedbackTimer(tabId)
  }
  unsubscribeModelInstall?.()
  unsubscribeStatus?.()
  unsubscribeProjectTabs?.()
  unsubscribeBeforeWindowClose?.()
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
        @home="openHome"
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
          @openProject="openProject"
          @rebuildPreview="rebuildProjectPreview"
          @refresh="refreshProjects"
        />
        <ProjectView
          v-else-if="activeTab"
          :key="activeTab.id"
          :busy="pendingProjectAction !== null || windowClosePending"
          :draftPending="Boolean(generationDraftOverlays[activeTab.id])"
          :error="tabErrors[activeTab.id] ?? null"
          :exportFeedback="exportFeedbackByTab[activeTab.id] ?? null"
          :generationDraft="generationDraftOverlays[activeTab.id] ?? activeTab.generationDraft"
          :generationResults="generationResultsByTab[activeTab.id] ?? null"
          :generationResultsError="generationResultsErrors[activeTab.id] ?? null"
          :generationResultsLoading="generationResultsLoading[activeTab.id] ?? false"
          :modelCatalog
          :modelCatalogError
          :modelCatalogLoaded
          :modelCatalogLoading
          :pending="activeTabPending"
          :promptHistoryEpoch="promptHistoryEpochs[activeTab.id] ?? 0"
          :reloadRequired="reloadRequiredIds.has(activeTab.id)"
          :saveNotice="saveNotices[activeTab.id] ?? null"
          :tab="activeTab"
          @acceptCandidates="acceptGenerationCandidates(activeTab.id, $event)"
          @addLora="addGenerationLora(activeTab.id, $event)"
          @applyBbox="applyBbox(activeTab.id, $event)"
          @clearExportFeedback="clearExportFeedback(activeTab.id)"
          @clearHistory="runProjectHistoryAction(activeTab.id, 'clear-history')"
          @importImage="importActiveRasterImage"
          @manageModels="openModelManager($event)"
          @moveLayer="moveActiveRasterLayer"
          @redo="runProjectHistoryAction(activeTab.id, 'redo')"
          @refreshGenerationResults="refreshGenerationResults(activeTab.id)"
          @refreshModels="refreshModelCatalog"
          @relinkLora="relinkGenerationLora(activeTab.id, $event)"
          @relinkModel="relinkGenerationModel(activeTab.id)"
          @removeLora="removeGenerationLora(activeTab.id, $event)"
          @save="saveProject(activeTab.id)"
          @saveCandidateImage="saveCandidateImage(activeTab.id, $event)"
          @sealPromptHistory="sealPromptHistory(activeTab.id, $event)"
          @selectModel="setGenerationModel(activeTab.id, $event)"
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

      <ModelManager v-model:show="modelManagerOpen" :focus="modelManagerFocus" />

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

      <NModal
        v-model:show="showNewProject"
        :closeOnEsc="pendingProjectAction?.kind !== 'create'"
        :maskClosable="false"
      >
        <NCard
          aria-label="New Project"
          class="dialog-card"
          contentScrollable
          role="dialog"
          size="small"
          title="New Project"
        >
          <form id="new-project-form" @submit.prevent="createProject">
            <NAlert v-if="newProjectError" class="dialog-error" type="error">
              {{ newProjectError }}
            </NAlert>
            <NFormItem label="Project name">
              <NInput
                v-model:value="newProjectName"
                autofocus
                :inputProps="{ 'aria-label': 'Project name' }"
                maxlength="256"
                placeholder="Untitled Project"
              />
            </NFormItem>
            <section aria-label="Initial generation area" class="create-dimensions">
              <h3>Generation area</h3>
              <ResolutionControl
                v-model="newProjectSize"
                v-model:aspectRatio="newProjectAspect"
                :disabled="pendingProjectAction !== null"
                heightLabel="Project height"
                :max="IGS_SAFETY_CEILINGS.rasterDimension"
                widthLabel="Project width"
              />
              <p class="dialog-secondary">
                Sets the first generation area. The canvas is unbounded.
              </p>
            </section>
          </form>
          <template v-slot:footer>
            <div class="dialog-actions dialog-actions--footer">
              <NButton :disabled="pendingProjectAction !== null" @click="showNewProject = false">
                Cancel
              </NButton>
              <NButton
                attrType="submit"
                :disabled="!canCreateProject || pendingProjectAction !== null"
                form="new-project-form"
                :loading="pendingProjectAction?.kind === 'create'"
                type="primary"
              >
                Create Project
              </NButton>
            </div>
          </template>
        </NCard>
      </NModal>

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
            Recover opens unsaved changes for review. The saved .igs file changes only after Save.
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

.create-dimensions {
  display: grid;
  gap: 12px;
}

.create-dimensions h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}

.create-dimensions p {
  margin: 0;
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
