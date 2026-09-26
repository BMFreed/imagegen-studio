<script setup lang="ts">
import type {
  ApiResult,
  ProjectApi,
  ProjectGenerationDraftChange,
  ProjectImportSelection,
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
  NInputNumber,
  NModal,
  NRadio,
  NRadioGroup,
} from 'naive-ui'
import { computed, onBeforeUnmount, onMounted, ref, toRaw } from 'vue'

import AppChrome from './components/AppChrome.vue'
import HomeView from './components/HomeView.vue'
import ModelManager from './components/ModelManager.vue'
import { ProjectDraftSync } from './components/project-draft-sync.js'
import ProjectView from './components/ProjectView.vue'
import RuntimeNotice from './components/RuntimeNotice.vue'
import { imageGenNaiveTheme } from './theme/naive-theme.js'

type RecoveryDecision = Extract<ProjectOpenResult, { kind: 'recovery-required' }>
type ImportTransfer = Extract<ProjectImportSelection, { kind: 'transfer-required' }>
type PendingProjectAction =
  | { kind: 'bbox' | 'close' | 'discard' | 'import-image' | 'layer' | 'save'; tabId: string }
  | { kind: 'create' | 'import-finish' | 'import-select' | 'recover' }
  | { kind: 'open' | 'rebuild'; projectId: string }

const homeOpen = ref(true)
const activeDocument = ref<string | null>('home')
const modelManagerOpen = ref(false)
const projects = ref<ProjectSummary[]>([])
const projectTabs = ref<ProjectTab[]>([])
const generationDraftOverlays = ref<Record<string, ProjectTab['generationDraft']>>({})
const draftValidity = ref<Record<string, boolean>>({})
const projectsLoading = ref(false)
const homeError = ref<string | null>(null)
const tabErrors = ref<Record<string, string | null>>({})
const saveNotices = ref<Record<string, string | null>>({})
const reloadRequiredIds = ref<Set<string>>(new Set())
const globalNotice = ref<string | null>(null)
const pendingProjectAction = ref<PendingProjectAction | null>(null)
const recoveryDecision = ref<RecoveryDecision | null>(null)
const recoveryError = ref<string | null>(null)
const closingTabId = ref<string | null>(null)
const closeError = ref<string | null>(null)
const showNewProject = ref(false)
const newProjectError = ref<string | null>(null)
const newProjectName = ref('')
const newProjectWidth = ref<number | null>(1024)
const newProjectHeight = ref<number | null>(1024)
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
let projectListRequest = 0

const activeTab = computed(
  () => projectTabs.value.find((tab) => tab.id === activeDocument.value) ?? null,
)
const pendingHomeAction = computed(() => {
  const action = pendingProjectAction.value
  return action?.kind === 'open' || action?.kind === 'rebuild' ? action : null
})
const activeTabPending = computed<'bbox' | 'import-image' | 'save' | null>(() => {
  const action = pendingProjectAction.value
  if (
    !activeTab.value ||
    !action ||
    (action.kind !== 'bbox' && action.kind !== 'import-image' && action.kind !== 'save') ||
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
    validDimension(newProjectWidth.value) &&
    validDimension(newProjectHeight.value),
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
  send: (tabId, change) => apiValue(() => projectApi().updateGenerationDraft(tabId, change)),
})

function updateGenerationDraft(tabId: string, change: ProjectGenerationDraftChange) {
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
  draftSync.change({ ...tab, generationDraft: toRaw(tab.generationDraft) }, change)
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
  draftSync.forget(tabId)
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
  const { [tabId]: _closedNotice, ...remainingNotices } = saveNotices.value
  tabErrors.value = remainingErrors
  saveNotices.value = remainingNotices
}

function reconcileProjectTabs(nextTabs: ProjectTab[]) {
  const openIds = new Set(nextTabs.map((tab) => tab.id))
  for (const tab of projectTabs.value) {
    if (!openIds.has(tab.id)) {
      draftSync.forget(tab.id)
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
  saveNotices.value = Object.fromEntries(
    Object.entries(saveNotices.value).filter(([id]) => openIds.has(id)),
  )
  draftValidity.value = Object.fromEntries(
    Object.entries(draftValidity.value).filter(([id]) => openIds.has(id)),
  )
}

function openHome() {
  homeOpen.value = true
  activeDocument.value = 'home'
  void refreshProjects()
}

function closeHome() {
  homeOpen.value = false
  if (activeDocument.value === 'home') {
    activeDocument.value = projectTabs.value.at(-1)?.id ?? null
  }
}

function activateDocument(documentId: string) {
  activeDocument.value = documentId
  if (documentId === 'home') {
    void refreshProjects()
  }
}

function onTabKeydown(event: KeyboardEvent, documentId: string) {
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
    activateDocument(nextId)
    const tabs = (event.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLElement>(
      '[role="tab"]',
    )
    tabs?.[nextIndex]?.focus()
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
  newProjectWidth.value = 1024
  newProjectHeight.value = 1024
  newProjectError.value = null
  showNewProject.value = true
}

async function createProject() {
  if (!canCreateProject.value || pendingProjectAction.value !== null) {
    return
  }
  const width = newProjectWidth.value
  const height = newProjectHeight.value
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
    await draftSync.flush(tabId)
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
    await draftSync.flush(tabId)
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
    await draftSync.flush(tabId)
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
    await draftSync.flush(tabId)
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

async function saveProject(tabId: string, closeAfter = false) {
  if (pendingProjectAction.value !== null || windowClosePending.value) {
    return
  }
  if (draftValidity.value[tabId] === false) {
    const message = 'Enter a valid fixed seed before saving this Project.'
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
  try {
    await draftSync.flush(tabId)
    const outcome = await apiValue(() => projectApi().save(tabId))
    replaceTab(outcome.tab)
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
        await apiValue(() => projectApi().close(tabId))
        if (warning) {
          globalNotice.value = warning
        }
        removeTab(tabId)
        closingTabId.value = null
      } catch (cause) {
        const message = `The project was saved, but the tab could not close. ${errorMessage(cause)}`
        setTabError(tabId, message)
        closingTabId.value = null
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
  try {
    try {
      await draftSync.flush(tabId)
    } catch (cause) {
      const message = `The draft could not be updated. Save and Close will retry. ${errorMessage(cause)}`
      setTabError(tabId, message)
      closeError.value = message
      closingTabId.value = tabId
      activeDocument.value = tabId
      return
    }
    const tab = projectTabs.value.find((candidate) => candidate.id === tabId)
    if (!tab) {
      return
    }
    if (tab.dirty) {
      closingTabId.value = tabId
      closeError.value = null
      return
    }
    await apiValue(() => projectApi().close(tabId))
    removeTab(tabId)
    await refreshProjects()
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
  closeError.value = null
}

async function discardAndClose() {
  const tabId = closingTabId.value
  if (!tabId || pendingProjectAction.value !== null || windowClosePending.value) {
    return
  }
  pendingProjectAction.value = { kind: 'discard', tabId }
  closeError.value = null
  try {
    await apiValue(() => projectApi().discardAndClose(tabId))
    removeTab(tabId)
    closingTabId.value = null
    await refreshProjects()
  } catch (cause) {
    closeError.value = errorMessage(cause)
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
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    const tab = activeTab.value
    if (
      tab &&
      !modelManagerOpen.value &&
      !showNewProject.value &&
      !recoveryDecision.value &&
      !closingTabId.value
    ) {
      event.preventDefault()
      void saveProject(tab.id)
    }
  }
}

onMounted(() => {
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
        try {
          if (Object.values(draftValidity.value).includes(false)) {
            throw new Error('Enter a valid fixed seed before closing the app.')
          }
          await draftSync.flushAll()
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
  unsubscribeStatus?.()
  unsubscribeProjectTabs?.()
  unsubscribeBeforeWindowClose?.()
  globalThis.window.removeEventListener('keydown', onAppKeydown)
})
</script>

<template>
  <NConfigProvider :theme="darkTheme" :themeOverrides="imageGenNaiveTheme">
    <div class="app-shell">
      <AppChrome :homeOpen @home="openHome" />
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
          :error="homeError"
          :loading="projectsLoading"
          :pendingAction="pendingHomeAction"
          :projects
          @createProject="beginNewProject"
          @importProject="selectImport"
          @manageModels="modelManagerOpen = true"
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
          :generationDraft="generationDraftOverlays[activeTab.id] ?? activeTab.generationDraft"
          :pending="activeTabPending"
          :reloadRequired="reloadRequiredIds.has(activeTab.id)"
          :saveNotice="saveNotices[activeTab.id] ?? null"
          :tab="activeTab"
          @applyBbox="applyBbox(activeTab.id, $event)"
          @importImage="importActiveRasterImage"
          @moveLayer="moveActiveRasterLayer"
          @save="saveProject(activeTab.id)"
          @updateDraft="updateGenerationDraft(activeTab.id, $event)"
          @updateLayer="updateActiveRasterLayer"
          @validateDraft="setDraftValidity"
        />
        <NEmpty v-else class="empty-document" description="No document open">
          <template v-slot:extra>
            <NButton type="primary" @click="openHome">Open Home</NButton>
          </template>
        </NEmpty>
      </main>

      <ModelManager v-model:show="modelManagerOpen" />

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
          role="dialog"
          size="small"
          title="New Project"
        >
          <form @submit.prevent="createProject">
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
            <div class="create-dimensions">
              <NFormItem label="Width">
                <NInputNumber
                  v-model:value="newProjectWidth"
                  :inputProps="{ 'aria-label': 'Project width' }"
                  :max="IGS_SAFETY_CEILINGS.rasterDimension"
                  :min="1"
                />
              </NFormItem>
              <NFormItem label="Height">
                <NInputNumber
                  v-model:value="newProjectHeight"
                  :inputProps="{ 'aria-label': 'Project height' }"
                  :max="IGS_SAFETY_CEILINGS.rasterDimension"
                  :min="1"
                />
              </NFormItem>
            </div>
            <div class="dialog-actions">
              <NButton :disabled="pendingProjectAction !== null" @click="showNewProject = false">
                Cancel
              </NButton>
              <NButton
                attrType="submit"
                :disabled="!canCreateProject || pendingProjectAction !== null"
                :loading="pendingProjectAction?.kind === 'create'"
                type="primary"
              >
                Create Project
              </NButton>
            </div>
          </form>
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
        :closeOnEsc="pendingProjectAction === null"
        :maskClosable="false"
        :show="closingTabId !== null"
        @update:show="!$event && cancelClose()"
      >
        <NCard
          aria-label="Unsaved changes"
          class="dialog-card"
          role="dialog"
          size="small"
          title="Unsaved changes"
        >
          <NAlert v-if="closeError" class="dialog-error" type="error">{{ closeError }}</NAlert>
          <p>This project has changes that are not in its saved .igs file.</p>
          <div class="dialog-actions">
            <NButton :disabled="pendingProjectAction !== null" @click="cancelClose">Cancel</NButton>
            <NButton
              :disabled="pendingProjectAction !== null"
              :loading="pendingProjectAction?.kind === 'discard'"
              @click="discardAndClose"
            >
              Discard Changes
            </NButton>
            <NButton
              :disabled="pendingProjectAction !== null"
              :loading="pendingProjectAction?.kind === 'save'"
              type="primary"
              @click="closingTabId && saveProject(closingTabId, true)"
            >
              Save and Close
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
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.create-dimensions :deep(.n-input-number) {
  width: 100%;
}

.dialog-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
}
</style>
