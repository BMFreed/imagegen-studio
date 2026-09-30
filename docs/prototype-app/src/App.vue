<script setup lang="ts">
import {
  darkTheme,
  NButton,
  NCard,
  NConfigProvider,
  NDialogProvider,
  NEmpty,
  NMessageProvider,
  NModal,
  NText,
} from 'naive-ui'
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'

import type { DocumentTabModel } from './components/app-shell.types'
import type { HomeProjectRecord, HomeScenarioId } from './prototypes/home/home.types'
import type { PresetCreateIntent } from './prototypes/presets/presets.types'
import type { ProjectScenarioId, ProjectSession } from './prototypes/project/project.types'

import AppChrome from './components/AppChrome.vue'
import DocumentTabs from './components/DocumentTabs.vue'
import ProjectContextMock from './components/ProjectContextMock.vue'
import HomePrototype from './prototypes/home/HomePrototype.vue'
import ModelManagerPrototype from './prototypes/model-manager/ModelManagerPrototype.vue'
import ApplyPresetPrototype from './prototypes/presets/ApplyPresetPrototype.vue'
import PresetManagerPrototype from './prototypes/presets/PresetManagerPrototype.vue'
import { currentProjectPresetSource } from './prototypes/presets/presets.mock'
import {
  cloneDocument,
  discardProjectChanges,
  redoProject,
  saveProjectSession,
  undoProject,
} from './prototypes/project/project-history'
import {
  createProjectScenario,
  createProjectSessionFromHomeRecord,
} from './prototypes/project/project.mock'
import { createPresetIntent } from './prototypes/project/project.utils'
import ProjectPrototype from './prototypes/project/ProjectPrototype.vue'
import { appLayerCssVariables } from './theme/app-layers'
import { imageGenNaiveTheme } from './theme/naive-theme'

type PrototypeId =
  'apply-preset' | 'home' | 'model-manager' | 'preset-manager' | 'project' | 'save-preset'

const prototypeIds = new Set<PrototypeId>([
  'apply-preset',
  'home',
  'model-manager',
  'preset-manager',
  'project',
  'save-preset',
])
const scenarioIds = new Set<HomeScenarioId>(['default', 'first-run', 'no-model', 'problems'])
const projectScenarioIds = new Set<ProjectScenarioId>([
  'default',
  'empty-project',
  'errors',
  'regional-guidance',
  'smart-patch',
  'staging',
])
const searchParameters = new URLSearchParams(globalThis.location.search)
const requestedPrototype = searchParameters.get('prototype')
const requestedScenario = searchParameters.get('scenario')

const activePrototype = computed<PrototypeId>(() =>
  prototypeIds.has(requestedPrototype as PrototypeId)
    ? (requestedPrototype as PrototypeId)
    : 'home',
)
const homeScenario = computed<HomeScenarioId>(() =>
  scenarioIds.has(requestedScenario as HomeScenarioId)
    ? (requestedScenario as HomeScenarioId)
    : 'default',
)
const projectScenario = computed<ProjectScenarioId>(() =>
  projectScenarioIds.has(requestedScenario as ProjectScenarioId)
    ? (requestedScenario as ProjectScenarioId)
    : 'default',
)
const usesProjectContext = computed(
  () => activePrototype.value === 'apply-preset' || activePrototype.value === 'save-preset',
)
const usesDocumentSessions = computed(
  () => activePrototype.value === 'home' || activePrototype.value === 'project',
)

const workspaceColors: Record<string, string> = {
  'archive-drive': '#b8a06a',
  'character-studies': '#74a8ff',
  'regional-drafts': '#b58cff',
  uncategorized: '#64e36e',
  'upscale-tests': '#f0b65f',
}
const homeTab: DocumentTabModel = { dirty: false, id: 'home', kind: 'home', title: 'Home' }
const sessionDocumentTabs = ref<DocumentTabModel[]>([
  homeTab,
  {
    dirty: false,
    id: 'sample-project-b',
    kind: 'project',
    title: 'Sample Project B.igs',
    workspaceColor: workspaceColors['uncategorized'],
  },
  {
    dirty: false,
    id: 'sample-project-a',
    kind: 'project',
    title: 'Sample Project A.igs',
    workspaceColor:
      workspaceColors[activePrototype.value === 'project' ? 'character-studies' : 'uncategorized'],
  },
])
const staticDocumentTabs: DocumentTabModel[] = [
  homeTab,
  {
    dirty: true,
    id: 'sample-project-b',
    kind: 'project',
    title: 'Sample Project B.igs',
    workspaceColor: workspaceColors['uncategorized'],
  },
  {
    dirty: false,
    id: 'sample-project-a',
    kind: 'project',
    title: 'Sample Project A.igs',
    workspaceColor: workspaceColors['character-studies'],
  },
]
const activeDocumentId = ref(activePrototype.value === 'home' ? 'home' : 'sample-project-b')
const showHomeModelManager = ref(false)
const showHomePresetManager = ref(false)
const showStandaloneModelManager = ref(true)
const managerSelectedId = ref<string>()
const managerCreateIntent = ref<PresetCreateIntent>()
const pendingCloseId = ref<string>()
const projectSessions = reactive<Record<string, ProjectSession>>({
  'sample-project-a': createProjectScenario('default'),
  'sample-project-b': createProjectScenario(
    activePrototype.value === 'project' ? projectScenario.value : 'default',
  ),
})
projectSessions['sample-project-a']!.document.id = 'sample-project-a'
projectSessions['sample-project-a']!.document.title = 'Sample Project A.igs'
projectSessions['sample-project-a']!.savedDocument = cloneDocument(
  projectSessions['sample-project-a']!.document,
)

const documentTabs = computed(() => {
  const tabs = usesDocumentSessions.value ? sessionDocumentTabs.value : staticDocumentTabs
  return tabs.map((tab) =>
    tab.kind === 'project' && projectSessions[tab.id]
      ? { ...tab, dirty: projectSessions[tab.id]!.dirty }
      : tab,
  )
})
const activeProjectSession = computed(() =>
  usesDocumentSessions.value ? projectSessions[activeDocumentId.value] : undefined,
)
// Mount a Project when first opened and keep it mounted while its tab remains
// open, so local UI state and mock generation timers survive tab switches.
const visitedProjectIds = ref(new Set([activeDocumentId.value]))
watch(activeDocumentId, (id) => {
  if (projectSessions[id]) {
    visitedProjectIds.value.add(id)
  }
})
const mountedProjectTabs = computed(() =>
  sessionDocumentTabs.value.filter(
    (tab) => tab.kind === 'project' && visitedProjectIds.value.has(tab.id),
  ),
)
const managerOverlayOpen = computed(() => showHomeModelManager.value || showHomePresetManager.value)
const activeQueueCount = computed(
  () =>
    activeProjectSession.value?.queueItems.filter(
      (item) => item.status === 'pending' || item.status === 'running',
    ).length ?? 0,
)
const openProjectIds = computed(() =>
  sessionDocumentTabs.value.filter((tab) => tab.kind === 'project').map((tab) => tab.id),
)
const dirtyProjectIds = computed(() =>
  sessionDocumentTabs.value
    .filter((tab) => tab.kind === 'project' && (projectSessions[tab.id]?.dirty ?? tab.dirty))
    .map((tab) => tab.id),
)

function requestHome() {
  if (!usesDocumentSessions.value) {
    globalThis.location.href = '/'
    return
  }
  if (!sessionDocumentTabs.value.some((tab) => tab.id === 'home')) {
    sessionDocumentTabs.value.unshift({ ...homeTab })
  }
  activeDocumentId.value = 'home'
}

function openHomeModelManager() {
  managerCreateIntent.value = undefined
  showHomePresetManager.value = false
  showHomeModelManager.value = true
}

function openHomePresetManager(id?: string) {
  managerSelectedId.value = typeof id === 'string' ? id : undefined
  managerCreateIntent.value = undefined
  showHomeModelManager.value = false
  showHomePresetManager.value = true
}

function saveActiveProject() {
  const session = activeProjectSession.value
  if (!session) {
    return false
  }
  const saved = saveProjectSession(session)
  session.ui.notice = saved
    ? { text: 'Project saved', type: 'success' }
    : { text: 'Project could not be saved. Your changes are still open.', type: 'error' }
  return saved
}

function toggleActiveProjectQueue() {
  const session = activeProjectSession.value
  if (session) {
    session.ui.queueOpen = !session.ui.queueOpen
  }
}

function openSavePreset(intent?: PresetCreateIntent) {
  const session = activeProjectSession.value
  if (!session) {
    return
  }
  managerCreateIntent.value = intent ?? createPresetIntent(session)
  showHomeModelManager.value = false
  showHomePresetManager.value = true
}

function hasUnfinishedProjectJobs(session: ProjectSession) {
  return session.queueItems.some((item) => item.status === 'pending' || item.status === 'running')
}

function cancelUnfinishedProjectJobs(session: ProjectSession) {
  for (const item of session.queueItems) {
    if (item.status === 'pending' || item.status === 'running') {
      item.status = 'canceled'
    }
  }
  for (const candidate of session.staging?.candidates ?? []) {
    if (candidate.status === 'pending' || candidate.status === 'running') {
      candidate.status = 'canceled'
    }
  }
}

function requestCloseDocument(id: string) {
  const session = projectSessions[id]
  if (session && (session.dirty || session.staging || hasUnfinishedProjectJobs(session))) {
    pendingCloseId.value = id
    return
  }
  closeDocument(id)
}

function confirmClose(action: 'discard' | 'save') {
  const id = pendingCloseId.value
  if (!id) {
    return
  }
  const session = projectSessions[id]
  if (session) {
    if (action === 'save' && !saveProjectSession(session)) {
      session.ui.notice = {
        text: 'Project could not be saved. Your changes are still open.',
        type: 'error',
      }
      pendingCloseId.value = undefined
      return
    }
    if (action === 'discard') {
      discardProjectChanges(session)
    }
    session.staging = undefined
  }
  pendingCloseId.value = undefined
  closeDocument(id)
}

function closeDocument(id: string) {
  if (!usesDocumentSessions.value) {
    if (activeDocumentId.value === id) {
      const session = projectSessions[id]
      if (session) {
        cancelUnfinishedProjectJobs(session)
      }
      activeDocumentId.value = ''
    }
    return
  }
  const index = sessionDocumentTabs.value.findIndex((tab) => tab.id === id)
  if (index < 0) {
    return
  }
  const session = projectSessions[id]
  if (session) {
    cancelUnfinishedProjectJobs(session)
  }
  sessionDocumentTabs.value.splice(index, 1)
  if (activeDocumentId.value === id) {
    activeDocumentId.value =
      sessionDocumentTabs.value[index]?.id ?? sessionDocumentTabs.value[index - 1]?.id ?? ''
  }
}

function openHomeProject(value: {
  project: HomeProjectRecord
  recovered?: boolean
  target: 'current' | 'new'
}) {
  const existing = sessionDocumentTabs.value.find((tab) => tab.id === value.project.id)
  if (existing) {
    if (value.recovered) {
      existing.dirty = true
      projectSessions[value.project.id] ??= createProjectSessionFromHomeRecord(value.project)
      projectSessions[value.project.id]!.dirty = true
    }
    activeDocumentId.value = existing.id
    return
  }
  const tab: DocumentTabModel = {
    dirty: value.recovered ?? false,
    id: value.project.id,
    kind: 'project',
    title: value.project.fileName,
    workspaceColor: workspaceColors[value.project.workspaceId] ?? '#64e36e',
  }
  projectSessions[value.project.id] ??= createProjectSessionFromHomeRecord(value.project)
  if (value.recovered) {
    projectSessions[value.project.id]!.dirty = true
  }
  const homeIndex = sessionDocumentTabs.value.findIndex((candidate) => candidate.id === 'home')
  if (value.target === 'current' && homeIndex >= 0) {
    sessionDocumentTabs.value.splice(homeIndex, 1, tab)
  } else {
    sessionDocumentTabs.value.splice(
      homeIndex >= 0 ? homeIndex + 1 : sessionDocumentTabs.value.length,
      0,
      tab,
    )
  }
  activeDocumentId.value = tab.id
}

function handleGlobalKeydown(event: KeyboardEvent) {
  const session = activeProjectSession.value
  if (!session || !(event.ctrlKey || event.metaKey)) {
    return
  }
  const target = event.target as HTMLElement | null
  if (target?.closest('.n-modal, .n-drawer, [role="dialog"]')) {
    return
  }
  if (event.key.toLowerCase() === 's') {
    event.preventDefault()
    saveActiveProject()
  }
  if (event.key.toLowerCase() === 'z') {
    event.preventDefault()
    event.shiftKey ? redoProject(session) : undoProject(session)
  }
  if (event.key.toLowerCase() === 'y') {
    event.preventDefault()
    redoProject(session)
  }
}

globalThis.addEventListener('keydown', handleGlobalKeydown)
onBeforeUnmount(() => globalThis.removeEventListener('keydown', handleGlobalKeydown))

function syncProjectTab(project: HomeProjectRecord) {
  const tab = sessionDocumentTabs.value.find((candidate) => candidate.id === project.id)
  if (!tab) {
    return
  }
  tab.title = project.fileName
  tab.workspaceColor = workspaceColors[project.workspaceId] ?? tab.workspaceColor
}
</script>

<template>
  <NConfigProvider :theme="darkTheme" :themeOverrides="imageGenNaiveTheme">
    <NDialogProvider>
      <NMessageProvider>
        <div class="app-shell" :style="appLayerCssVariables">
          <AppChrome
            :canRedo="(activeProjectSession?.history.future.length ?? 0) > 0"
            :canSave="activeProjectSession?.dirty ?? false"
            :canUndo="(activeProjectSession?.history.past.length ?? 0) > 0"
            :projectActive="Boolean(activeProjectSession)"
            :queueBadge="activeQueueCount"
            @applyPreset="activeProjectSession && (activeProjectSession.ui.applyPresetOpen = true)"
            @closeProject="activeDocumentId && requestCloseDocument(activeDocumentId)"
            @home="requestHome"
            @manageModels="openHomeModelManager"
            @managePresets="openHomePresetManager"
            @queue="toggleActiveProjectQueue"
            @redo="activeProjectSession && redoProject(activeProjectSession)"
            @save="saveActiveProject"
            @savePreset="openSavePreset"
            @undo="activeProjectSession && undoProject(activeProjectSession)"
          />
          <div class="app-workspace">
            <DocumentTabs
              v-model:activeId="activeDocumentId"
              :tabs="documentTabs"
              @close="requestCloseDocument"
            />
            <main class="prototype-stage">
              <template v-if="usesDocumentSessions">
                <HomePrototype
                  v-show="activeDocumentId === 'home'"
                  :aria-hidden="showHomeModelManager || showHomePresetManager || undefined"
                  :dirtyProjectIds
                  :inert="showHomeModelManager || showHomePresetManager || undefined"
                  :openProjectIds
                  :scenario="homeScenario"
                  @manageModels="openHomeModelManager"
                  @managePresets="openHomePresetManager"
                  @openProject="openHomeProject"
                  @projectChanged="syncProjectTab"
                />
                <ProjectPrototype
                  v-for="tab of mountedProjectTabs"
                  v-show="activeDocumentId === tab.id"
                  :key="tab.id"
                  :active="activeDocumentId === tab.id && !managerOverlayOpen"
                  :session="projectSessions[tab.id]!"
                  @manageModels="openHomeModelManager"
                  @managePresets="openHomePresetManager"
                  @savePreset="openSavePreset"
                />
                <NEmpty v-if="!activeDocumentId" description="No document open">
                  <template v-slot:extra>
                    <NButton type="primary" @click="requestHome">Open Home</NButton>
                  </template>
                </NEmpty>
              </template>
              <ProjectContextMock v-else-if="usesProjectContext" />
              <section v-else aria-hidden="true" class="home-context">
                <div class="workspace-sidebar">
                  <span class="sidebar-title">Workspaces</span>
                  <span class="sidebar-item sidebar-item--active">Uncategorized</span>
                  <span class="sidebar-item">Character studies</span>
                  <span class="sidebar-item">Upscale tests</span>
                </div>
                <div class="workspace-grid">
                  <div class="workspace-card" />
                  <div class="workspace-card workspace-card--wide" />
                  <div class="workspace-card" />
                </div>
              </section>
            </main>
            <ModelManagerPrototype
              v-if="activePrototype === 'model-manager' && showStandaloneModelManager"
              @close="showStandaloneModelManager = false"
            />
            <PresetManagerPrototype
              v-if="activePrototype === 'home' && showHomePresetManager"
              key="home-preset-manager"
              :initialCreateIntent="managerCreateIntent"
              :initialSelectedId="managerSelectedId"
              @close="showHomePresetManager = false"
            />
            <ModelManagerPrototype
              v-if="activePrototype === 'home' && showHomeModelManager"
              key="model-manager-prototype-2"
              @close="showHomeModelManager = false"
            />
            <PresetManagerPrototype
              v-if="activePrototype === 'preset-manager'"
              key="preset-manager"
            />
            <ApplyPresetPrototype v-else-if="activePrototype === 'apply-preset'" />
            <PresetManagerPrototype
              v-else-if="activePrototype === 'save-preset'"
              key="save-preset"
              :initialCreateIntent="currentProjectPresetSource"
            />

            <PresetManagerPrototype
              v-if="activePrototype === 'project' && showHomePresetManager"
              key="project-preset-manager"
              :initialCreateIntent="managerCreateIntent"
              :initialSelectedId="managerSelectedId"
              @close="showHomePresetManager = false"
            />
            <ModelManagerPrototype
              v-if="activePrototype === 'project' && showHomeModelManager"
              key="project-model-manager"
              @close="showHomeModelManager = false"
            />

            <NModal
              :maskClosable="false"
              :show="Boolean(pendingCloseId)"
              @update:show="!$event && (pendingCloseId = undefined)"
            >
              <NCard
                aria-label="Close Project"
                class="close-project-card"
                role="dialog"
                size="small"
              >
                <h2>
                  {{
                    projectSessions[pendingCloseId ?? '']?.dirty
                      ? 'Unsaved project changes'
                      : projectSessions[pendingCloseId ?? '']?.staging
                        ? 'Unaccepted generation results'
                        : 'Generation in progress'
                  }}
                </h2>
                <NText>
                  {{
                    projectSessions[pendingCloseId ?? '']?.dirty
                      ? 'Save changes before closing this project? Unaccepted candidates will be discarded and unfinished jobs canceled.'
                      : projectSessions[pendingCloseId ?? '']?.staging
                        ? 'Temporary generation candidates will be discarded and unfinished jobs canceled when this project closes.'
                        : 'Unfinished generation jobs will be canceled when this project closes.'
                  }}
                </NText>
                <div class="close-project-actions">
                  <NButton tertiary @click="pendingCloseId = undefined">Cancel</NButton>
                  <NButton secondary type="error" @click="confirmClose('discard')">
                    {{
                      projectSessions[pendingCloseId ?? '']?.dirty
                        ? 'Discard Changes'
                        : projectSessions[pendingCloseId ?? '']?.staging
                          ? 'Discard Candidates and Close'
                          : 'Cancel Jobs and Close'
                    }}
                  </NButton>
                  <NButton
                    v-if="projectSessions[pendingCloseId ?? '']?.dirty"
                    type="primary"
                    @click="confirmClose('save')"
                  >
                    Save
                  </NButton>
                </div>
              </NCard>
            </NModal>
          </div>
        </div>
      </NMessageProvider>
    </NDialogProvider>
  </NConfigProvider>
</template>

<style scoped>
.app-shell {
  display: grid;
  grid-template-rows: var(--app-chrome-height) minmax(0, 1fr);
  height: 100vh;
  isolation: isolate;
}

.app-workspace {
  position: relative;
  display: grid;
  grid-template-rows: var(--app-tabs-height) minmax(0, 1fr);
  min-height: 0;
}

.prototype-stage {
  position: relative;
  min-height: 0;
  overflow: hidden;
}

.prototype-stage > :deep(.n-empty) {
  margin-top: 140px;
}

.close-project-card {
  width: min(480px, calc(100vw - 48px));
}
.close-project-card h2 {
  margin: 0 0 6px;
  font-size: 18px;
}
.close-project-actions {
  display: flex;
  justify-content: end;
  gap: 8px;
  margin-top: 20px;
}

.home-context {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
}

.workspace-sidebar {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 24px;
  border-right: 1px solid var(--app-border);
}

.sidebar-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.sidebar-item {
  padding: 9px 10px;
  border-radius: var(--app-radius);
}

.sidebar-item--active {
  background: var(--app-elevated-hover);
}

.workspace-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(180px, 260px));
  align-content: start;
  gap: 18px;
  padding: 64px 72px;
}

.workspace-card {
  height: 210px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-surface);
}

.workspace-card--wide {
  height: 260px;
}
</style>
