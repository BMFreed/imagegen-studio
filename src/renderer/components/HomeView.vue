<script setup lang="ts">
import type { ProjectSummary } from '../../shared/api.js'
import {
  type HomeProjectSort,
  type HomeProjectStatus,
  selectHomeProjects,
} from '../../shared/projects/home-project-browse.js'
import type { ProjectTrashSummary } from '../../shared/projects/project-trash.js'
import type { ProjectWorkspaceSummary } from '../../shared/projects/project-workspaces.js'

import {
  AlertTriangle as AlertIcon,
  LayoutGrid as AllIcon,
  DotsVertical as DotsIcon,
  Folder as FolderIcon,
  FolderPlus as FolderPlusIcon,
  Upload as ImportIcon,
  ListDetails as ListIcon,
  Stack2 as ModelsIcon,
  Plus as PlusIcon,
  Bookmark as PresetsIcon,
  Refresh as RefreshIcon,
  FilterOff as ResetIcon,
  Trash as TrashIcon,
} from '@vicons/tabler'
import {
  NAlert,
  NButton,
  NButtonGroup,
  NDropdown,
  NEmpty,
  NIcon,
  NInput,
  NSelect,
  NSpin,
  NSplit,
  NTag,
  NText,
} from 'naive-ui'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import IconButton from '../../../docs/prototype-app/src/components/IconButton.vue'
import { projectStatusTagTheme } from '../../../docs/prototype-app/src/theme/naive-theme.js'
import HomeProjectInspector from './HomeProjectInspector.vue'

const props = defineProps<{
  busy: boolean
  error: string | null
  hasGenerationModel: boolean | null
  loading: boolean
  modelCatalogError: string | null
  openProjectIds?: string[]
  pendingAction: { kind: 'open' | 'rebuild'; projectId: string } | null
  projects: ProjectSummary[]
  trashError: string | null
  trashLoading: boolean
  trashProjects: ProjectTrashSummary[]
  trashView: boolean
  workspaces: ProjectWorkspaceSummary[]
  workspacesError: string | null
  workspacesLoading: boolean
}>()
const workspaceId = defineModel<string | null>('workspaceId', { required: true })
const search = defineModel<string>('search', { required: true })
const selectedProjectId = defineModel<string | null>('selectedProjectId', { required: true })
const sort = defineModel<HomeProjectSort>('sort', { required: true })
const status = defineModel<HomeProjectStatus>('status', { required: true })
const inspectorCollapsed = defineModel<boolean>('inspectorCollapsed', { required: true })
const viewMode = defineModel<'grid' | 'list'>('viewMode', { required: true })
const sidebarPaneSize = defineModel<number>('sidebarPaneSize', { required: true })
const browserPaneSize = defineModel<number>('browserPaneSize', { required: true })

// Only drag writes the App-owned preferred ratios; temporary viewport clamps do not.
const homeRoot = ref<HTMLElement | null>(null)
const contentRoot = ref<HTMLElement | null>(null)
const homeWidth = ref(1440)
const contentWidth = ref(1180)
let layoutObserver: ResizeObserver | null = null
const sidebarUsableWidth = computed(() => Math.max(1, homeWidth.value - 3))
const contentUsableWidth = computed(() => Math.max(1, contentWidth.value - 3))
const sidebarMin = computed(() => Math.min(1, 210 / sidebarUsableWidth.value))
const sidebarMax = computed(() =>
  Math.max(
    sidebarMin.value,
    Math.min(360, homeWidth.value - (inspectorCollapsed.value ? 324 : 546)) /
      sidebarUsableWidth.value,
  ),
)
const browserMin = computed(() =>
  Math.min(1, Math.max(280 / contentUsableWidth.value, 1 - 440 / contentUsableWidth.value)),
)
const browserMax = computed(() => Math.max(browserMin.value, 1 - 260 / contentUsableWidth.value))
const sidebarSize = computed<number | string>({
  get: () => Math.max(sidebarMin.value, Math.min(sidebarMax.value, sidebarPaneSize.value)),
  set: (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      sidebarPaneSize.value = value
    }
  },
})
const browserSize = computed<number | string>({
  get: () =>
    inspectorCollapsed.value
      ? 'calc(100% - 44px)'
      : Math.max(browserMin.value, Math.min(browserMax.value, browserPaneSize.value)),
  set: (value) => {
    if (!inspectorCollapsed.value && typeof value === 'number' && Number.isFinite(value)) {
      browserPaneSize.value = value
    }
  },
})
onMounted(() => {
  layoutObserver = new ResizeObserver(() => {
    if (homeRoot.value) {
      homeWidth.value = homeRoot.value.clientWidth
    }
    if (contentRoot.value) {
      contentWidth.value = contentRoot.value.clientWidth
    }
  })
  if (homeRoot.value) {
    layoutObserver.observe(homeRoot.value)
  }
  if (contentRoot.value) {
    layoutObserver.observe(contentRoot.value)
  }
})
onBeforeUnmount(() => layoutObserver?.disconnect())

const emit = defineEmits<{
  addWorkspace: []
  browseProjects: []
  browseTrash: []
  createProject: []
  deleteProject: [project: ProjectTrashSummary]
  importProject: []
  locateProject: [project: ProjectSummary]
  locateWorkspace: [workspaceId: string]
  manageModels: []
  managePresets: []
  moveProject: [project: ProjectSummary]
  openProject: [projectId: string, target?: 'current' | 'new']
  rebuildPreview: [projectId: string]
  refresh: []
  removeMissingProject: [project: ProjectSummary]
  removeWorkspace: [workspaceId: string]
  renameProject: [project: ProjectSummary]
  restoreProject: [project: ProjectTrashSummary]
  revealProject: [projectId: string]
  revealWorkspace: [workspaceId: string]
  trashProject: [project: ProjectSummary]
  workspaceSettings: [workspaceId: string]
}>()

const displayProjects = computed(() => (props.trashView ? props.trashProjects : props.projects))
const sortOptions = [
  { label: 'Last opened', value: 'lastOpened' },
  { label: 'Name', value: 'name' },
  { label: 'Modified', value: 'modified' },
]
const statusOptions = [
  { label: 'All statuses', value: 'all' },
  { label: 'Open', value: 'open' },
  { label: 'Recovery available', value: 'recovery' },
  { label: 'Needs attention', value: 'attention' },
]
const hasActiveFilters = computed(() => search.value.trim() !== '' || status.value !== 'all')
function resetFilters() {
  search.value = ''
  status.value = 'all'
}
function trashSummary(project: ProjectSummary): ProjectTrashSummary | null {
  return props.trashView && 'trashId' in project ? (project as ProjectTrashSummary) : null
}
function requestRestore(project: ProjectSummary) {
  const trashed = trashSummary(project)
  if (trashed) {
    emit('restoreProject', trashed)
  }
}
function requestDelete(project: ProjectSummary) {
  const trashed = trashSummary(project)
  if (trashed) {
    emit('deleteProject', trashed)
  }
}
function canRequestRename(project: ProjectSummary) {
  return (
    props.openProjectIds?.includes(project.id) ||
    (project.health === 'ready' && project.recoveryStatus === 'none')
  )
}
function canManageMissingProject(project: ProjectSummary) {
  return (
    !props.trashView &&
    project.health === 'missing' &&
    !project.pendingMove &&
    !project.pendingRename &&
    !props.openProjectIds?.includes(project.id) &&
    props.workspaces.some(
      (workspace) => workspace.id === project.workspaceId && workspace.availability === 'available',
    )
  )
}
function requestProjectAction(key: number | string, project: ProjectSummary) {
  if (props.busy) {
    return
  }
  if (key === 'open' || key === 'open-new') {
    requestOpen(project, key === 'open-new' ? 'new' : 'current')
    return
  }
  if (project.pendingMove) {
    if (key === 'move') {
      emit('moveProject', project)
    }
    return
  }
  if (project.pendingRename) {
    if (key === 'rename') {
      emit('renameProject', project)
    }
    return
  }
  if (key === 'reveal') {
    emit('revealProject', project.id)
  } else if (key === 'rebuild' && canRebuildPreview(project)) {
    emit('rebuildPreview', project.id)
  } else if (key === 'move' && project.health === 'ready') {
    emit('moveProject', project)
  } else if (key === 'rename' && canRequestRename(project)) {
    emit('renameProject', project)
  } else if (key === 'trash') {
    emit('trashProject', project)
  } else if (key === 'locate' && canManageMissingProject(project)) {
    emit('locateProject', project)
  } else if (key === 'remove-missing' && canManageMissingProject(project)) {
    emit('removeMissingProject', project)
  }
}
function projectActionOptions(project: ProjectSummary) {
  const openOptions = [
    { disabled: !canOpenProject(project), key: 'open', label: 'Open' },
    { disabled: !canOpenProject(project), key: 'open-new', label: 'Open in New Tab' },
  ]
  const focusOptions = props.openProjectIds?.includes(project.id) ? openOptions : []
  if (project.pendingMove) {
    return [...focusOptions, { key: 'move', label: 'Retry Move' }]
  }
  if (project.pendingRename) {
    return [...focusOptions, { key: 'rename', label: 'Retry Rename' }]
  }
  return [
    ...openOptions,
    { disabled: !canRequestRename(project), key: 'rename', label: 'Rename' },
    { disabled: project.health !== 'ready', key: 'move', label: 'Move to Workspace' },
    { key: 'reveal', label: 'Show in Folder' },
    { key: 'trash', label: 'Move to Trash' },
    ...(viewMode.value === 'grid' && canRebuildPreview(project)
      ? [{ key: 'rebuild', label: 'Rebuild Preview' }]
      : []),
    ...(canManageMissingProject(project)
      ? [
          { key: 'locate', label: 'Locate Project' },
          { key: 'remove-missing', label: 'Remove from Home' },
        ]
      : []),
  ]
}
function trashActionOptions(project: ProjectSummary) {
  return [
    {
      disabled: trashSummary(project)?.deletionStatus === 'deleting',
      key: 'restore',
      label: 'Restore Project',
    },
    { key: 'delete', label: 'Delete Permanently' },
  ]
}
function requestWorkspaceAction(key: number | string, workspaceId: string) {
  const workspace = props.workspaces.find(({ id }) => id === workspaceId)
  if (props.busy || !workspace) {
    return
  }
  switch (key) {
    case 'locate': {
      if (canLocateWorkspace(workspace)) {
        emit('locateWorkspace', workspace.id)
      }

      break
    }
    case 'remove': {
      if (!workspace.isDefault) {
        emit('removeWorkspace', workspace.id)
      }

      break
    }
    case 'rescan': {
      if (!props.loading && !props.workspacesLoading && !props.trashLoading) {
        // The existing refresh lists/scans every registered workspace without changing browse scope.
        emit('refresh')
      }

      break
    }
    case 'reveal': {
      emit('revealWorkspace', workspaceId)

      break
    }
    case 'settings': {
      emit('workspaceSettings', workspaceId)

      break
    }
    // No default
  }
}
function canLocateWorkspace(workspace: ProjectWorkspaceSummary): boolean {
  return !workspace.isDefault && workspace.availability !== 'available'
}
const selectedWorkspace = computed(() =>
  props.workspaces.find(({ id }) => id === workspaceId.value),
)
const workspaceProblem = computed(() => {
  if (props.trashView) {
    return null
  }
  const workspace = selectedWorkspace.value
  if (!workspaceId.value) {
    const unavailable = props.workspaces.filter(({ availability }) => availability !== 'available')
    return unavailable.length
      ? `${unavailable.map(({ displayName }) => displayName).join(', ')}: workspace folders are unavailable. Cached projects stay visible. Restore access and refresh to reconnect them.`
      : null
  }
  if (!workspace) {
    return props.workspacesLoading
      ? null
      : 'This workspace is unavailable. Refresh the workspace list to try again.'
  }
  if (workspace.availability === 'missing') {
    return 'This workspace folder is missing. Reconnect the folder and refresh. Cached projects stay visible.'
  }
  if (workspace.availability === 'inaccessible') {
    return 'This workspace folder cannot be accessed. Restore access and refresh. Cached projects stay visible.'
  }
  return workspace.writable
    ? null
    : 'This workspace is read-only. You can browse it; choose a writable destination when creating or importing a project.'
})
function workspaceStatus(workspace: ProjectWorkspaceSummary) {
  switch (workspace.availability) {
    case 'inaccessible': {
      return 'Unavailable'
    }
    case 'missing': {
      return 'Missing'
    }
    default: {
      return workspace.writable ? null : 'Read-only'
    }
  }
}
function projectWorkspaceName(project: ProjectSummary) {
  return (
    props.workspaces.find(({ id }) => id === project.workspaceId)?.displayName ??
    trashSummary(project)?.originalWorkspaceName ??
    'Workspace unavailable'
  )
}
const failedThumbnailUrls = ref<Set<string>>(new Set())
watch(
  () => props.projects,
  () => {
    // A fresh list is an explicit retry after a transient cache or protocol failure.
    failedThumbnailUrls.value = new Set()
  },
)

function showThumbnail(project: ProjectSummary): boolean {
  return (
    !project.pendingMove &&
    !project.pendingRename &&
    project.health === 'ready' &&
    project.thumbnailUrl !== null &&
    !failedThumbnailUrls.value.has(project.thumbnailUrl)
  )
}

function markThumbnailFailed(url: string | null): void {
  if (url !== null) {
    failedThumbnailUrls.value = new Set([...failedThumbnailUrls.value, url])
  }
}

function canRebuildPreview(project: ProjectSummary): boolean {
  return (
    !props.trashView &&
    !project.pendingMove &&
    !project.pendingRename &&
    project.health === 'ready' &&
    project.previewStatus === 'unavailable' &&
    (project.recoveryStatus === 'none' || project.recoveryStatus === 'unavailable')
  )
}

const visibleProjects = computed(() =>
  selectHomeProjects({
    openProjectIds: props.openProjectIds ?? [],
    projects: displayProjects.value,
    search: search.value,
    sort: sort.value,
    status: status.value,
    workspaces: props.workspaces,
  }),
)
const contextProjectId = ref<string | null>(null)
const contextMenuX = ref(0)
const contextMenuY = ref(0)
const contextProject = computed(() =>
  visibleProjects.value.find(({ id }) => id === contextProjectId.value),
)
const contextOptions = computed(() =>
  contextProject.value
    ? props.trashView
      ? trashActionOptions(contextProject.value)
      : projectActionOptions(contextProject.value)
    : [],
)
const selectedProject = computed(() =>
  visibleProjects.value.find(({ id }) => id === selectedProjectId.value),
)
const inspectorWorkspace = computed(() =>
  props.workspaces.find(({ id }) => id === selectedProject.value?.workspaceId),
)
watch(
  () => [props.trashView, workspaceId.value] as const,
  () => {
    selectedProjectId.value = null
    closeContextMenu()
  },
)
watch(
  visibleProjects,
  (projects) => {
    if (!projects.some(({ id }) => id === selectedProjectId.value)) {
      selectedProjectId.value = null
    }
    if (!projects.some(({ id }) => id === contextProjectId.value)) {
      closeContextMenu()
    }
  },
  { immediate: true },
)
watch(() => [props.busy, viewMode.value], closeContextMenu)
function selectBrowse(kind: 'projects' | 'trash') {
  closeContextMenu()
  selectedProjectId.value = null
  if (kind === 'projects') {
    emit('browseProjects')
  } else {
    emit('browseTrash')
  }
}
function selectWorkspace(id: string) {
  closeContextMenu()
  selectedProjectId.value = null
  workspaceId.value = id
}
function isProjectControl(event: MouseEvent): boolean {
  return event.target instanceof Element && Boolean(event.target.closest('[data-project-control]'))
}
function selectProject(event: MouseEvent, project: ProjectSummary) {
  if (props.busy || isProjectControl(event) || event.button !== 0) {
    return
  }
  closeContextMenu()
  if (!props.trashView && (event.ctrlKey || event.metaKey)) {
    event.preventDefault()
    requestOpen(project, 'new')
    return
  }
  selectedProjectId.value = project.id
}
function canOpenProject(project: ProjectSummary): boolean {
  return (
    !props.busy &&
    !props.trashView &&
    (props.openProjectIds?.includes(project.id) ||
      (!project.pendingMove &&
        !project.pendingRename &&
        project.health === 'ready' &&
        props.workspaces.some(
          (workspace) =>
            workspace.id === project.workspaceId && workspace.availability === 'available',
        )))
  )
}
function requestOpen(project: ProjectSummary, target: 'current' | 'new' = 'current') {
  closeContextMenu()
  if (canOpenProject(project)) {
    emit('openProject', project.id, target)
  }
}
function doubleClickProject(event: MouseEvent, project: ProjectSummary) {
  if (!isProjectControl(event) && event.button === 0 && !event.ctrlKey && !event.metaKey) {
    requestOpen(project, 'current')
  }
}
function auxiliaryClickProject(event: MouseEvent, project: ProjectSummary) {
  if (event.button === 1 && !isProjectControl(event)) {
    event.preventDefault()
    requestOpen(project, 'new')
  }
}
function closeContextMenu() {
  contextProjectId.value = null
}
function closeContextMenuOutside(event: MouseEvent) {
  // Naive's outside-click also receives the mouseup of a row's right-click.
  // That gesture already opened/repositioned this menu during contextmenu.
  if (
    event.button === 2 &&
    !isProjectControl(event) &&
    event.target instanceof Element &&
    event.target.closest<HTMLElement>('[data-project-id]')?.dataset.projectId ===
      contextProjectId.value
  ) {
    return
  }
  closeContextMenu()
}
function openContextMenu(event: MouseEvent, project: ProjectSummary) {
  if (isProjectControl(event)) {
    return
  }
  event.preventDefault()
  if (props.busy) {
    return
  }
  selectedProjectId.value = project.id
  contextMenuX.value = event.clientX
  contextMenuY.value = event.clientY
  contextProjectId.value = project.id
}
function requestContextAction(key: number | string) {
  const project = contextProject.value
  closeContextMenu()
  if (!project || props.busy) {
    return
  }
  if (props.trashView) {
    requestTrashAction(key, project)
  } else {
    requestProjectAction(key, project)
  }
}

function conditionTags(project: ProjectSummary) {
  const tags: { label: string; type: 'success' | 'warning' }[] = []
  const trashed = trashSummary(project)
  if (trashed) {
    tags.push({
      label: trashed.deletionStatus === 'deleting' ? 'Deletion pending' : 'In Trash',
      type: 'warning',
    })
  }
  const health = healthLabel(project)
  if (health) {
    tags.push({ label: health, type: 'warning' })
  }
  if (
    !trashed &&
    !props.workspaces.some(
      (workspace) => workspace.id === project.workspaceId && workspace.availability === 'available',
    )
  ) {
    tags.push({ label: 'Workspace unavailable', type: 'warning' })
  }
  const open = props.openProjectIds?.includes(project.id)
  if (open) {
    tags.push({ label: 'Open', type: 'success' })
  }
  const recovery = recoveryLabel(project)
  if (!trashed && !open && !project.pendingMove && !project.pendingRename && recovery) {
    tags.push({ label: recovery, type: 'warning' })
  }
  return tags.slice(0, viewMode.value === 'grid' ? 2 : 1)
}
function browseTime(project: ProjectSummary): string {
  const value = sort.value === 'modified' ? project.modifiedAt : project.lastOpenedAt
  return value ? new Date(value).toLocaleDateString() : 'Not recorded'
}
function browseTimeTitle(project: ProjectSummary): string {
  const value = sort.value === 'modified' ? project.modifiedAt : project.lastOpenedAt
  return `${sort.value === 'modified' ? 'Modified' : 'Last opened'}: ${value ? new Date(value).toLocaleString() : 'Not recorded'}`
}
function requestTrashAction(key: number | string, project: ProjectSummary) {
  if (props.busy) {
    return
  }
  if (key === 'restore') {
    requestRestore(project)
  } else if (key === 'delete') {
    requestDelete(project)
  }
}

function previewLabel(project: ProjectSummary): string | null {
  if (project.pendingMove || project.pendingRename || project.health !== 'ready') {
    return null
  }
  switch (project.previewStatus) {
    case 'empty': {
      return 'Empty project'
    }
    case 'rendered': {
      return showThumbnail(project) ? 'Saved preview' : 'Preview could not be displayed'
    }
    case 'unavailable': {
      return 'Preview unavailable'
    }
    default: {
      return null
    }
  }
}

function healthLabel(project: ProjectSummary): string | null {
  if (project.pendingMove) {
    return 'Move pending'
  }
  if (project.pendingRename) {
    return 'Rename pending'
  }
  switch (project.health) {
    case 'corrupt': {
      return 'File damaged'
    }
    case 'missing': {
      return 'File missing'
    }
    case 'ready': {
      return null
    }
    case 'unsupported_schema': {
      return 'Unsupported format'
    }
  }
}

function recoveryLabel(project: ProjectSummary): string | null {
  switch (project.recoveryStatus) {
    case 'invalid':
    case 'unavailable': {
      return 'Recovery unavailable'
    }
    case 'recoverable': {
      return 'Recovery available'
    }
    case 'stale': {
      return 'Recovery needs attention'
    }
    default: {
      return null
    }
  }
}
</script>

<template>
  <section
    ref="homeRoot"
    aria-label="Home"
    class="home-view"
    :class="{ 'home-view--inspector-collapsed': inspectorCollapsed }"
  >
    <NSplit v-model:size="sidebarSize" class="home-shell-split" :max="sidebarMax" :min="sidebarMin">
      <template v-slot:1>
        <aside aria-label="Workspace navigation" class="workspace-sidebar">
          <h2>Workspace</h2>
          <NButton
            class="sidebar-action new-project"
            :disabled="busy"
            type="primary"
            @click="$emit('createProject')"
          >
            <template v-slot:icon><NIcon :component="PlusIcon" /></template>
            New Project
          </NButton>
          <NButton
            class="sidebar-action import-project"
            :disabled="busy"
            quaternary
            @click="$emit('importProject')"
          >
            <template v-slot:icon><NIcon :component="ImportIcon" /></template>
            Import Project
          </NButton>
          <NButton
            :aria-pressed="!trashView && workspaceId === null"
            :bordered="false"
            class="sidebar-action workspace-select"
            :disabled="busy"
            :secondary="!trashView && workspaceId === null"
            @click="selectBrowse('projects')"
          >
            <template v-slot:icon><NIcon :component="AllIcon" /></template>
            Projects
          </NButton>
          <NButton
            :aria-pressed="trashView"
            :bordered="false"
            class="sidebar-action workspace-select"
            :disabled="busy"
            :secondary="trashView"
            @click="selectBrowse('trash')"
          >
            <template v-slot:icon><NIcon :component="TrashIcon" /></template>
            <span>Trash</span>
            <span class="workspace-count">{{ trashProjects.length }}</span>
          </NButton>
          <div class="workspace-heading">
            <h2>Workspaces</h2>
            <IconButton
              compact
              :disabled="busy"
              :icon="FolderPlusIcon"
              label="Add Workspace"
              @click="$emit('addWorkspace')"
            />
          </div>
          <div aria-label="Workspaces" class="workspace-list">
            <div v-for="workspace of workspaces" :key="workspace.id" class="workspace-row">
              <NButton
                :aria-pressed="!trashView && workspaceId === workspace.id"
                :bordered="false"
                class="sidebar-action workspace-select"
                :disabled="busy"
                :secondary="!trashView && workspaceId === workspace.id"
                :title="workspace.directoryPath"
                @click="selectWorkspace(workspace.id)"
              >
                <template v-slot:icon>
                  <NIcon v-if="workspace.availability !== 'available'" :component="AlertIcon" />
                  <span
                    v-else
                    aria-hidden="true"
                    class="workspace-marker"
                    :class="`workspace-marker--${workspace.color}`"
                  />
                </template>
                <span class="workspace-name">{{ workspace.displayName }}</span>
                <span v-if="workspaceStatus(workspace)" class="workspace-status">
                  {{ workspaceStatus(workspace) }}
                </span>
                <span class="workspace-count">{{ workspace.projectCount }}</span>
              </NButton>
              <NDropdown
                :disabled="busy"
                :options="[
                  { key: 'settings', label: 'Workspace Settings' },
                  { key: 'reveal', label: 'Show in Folder' },
                  {
                    disabled: loading || workspacesLoading || trashLoading,
                    key: 'rescan',
                    label: 'Rescan',
                  },
                  ...(!workspace.isDefault ? [{ key: 'remove', label: 'Remove Workspace' }] : []),
                  ...(canLocateWorkspace(workspace)
                    ? [{ key: 'locate', label: 'Locate Folder' }]
                    : []),
                ]"
                trigger="click"
                @select="requestWorkspaceAction($event, workspace.id)"
              >
                <span class="workspace-menu">
                  <IconButton
                    compact
                    :disabled="busy"
                    :icon="DotsIcon"
                    :label="`${workspace.displayName} workspace actions`"
                  />
                </span>
              </NDropdown>
            </div>
            <NSpin v-if="workspacesLoading && workspaces.length === 0" size="small" />
          </div>
          <h2 class="tools-heading">Tools</h2>
          <NButton class="sidebar-action" quaternary @click="$emit('manageModels')">
            <template v-slot:icon><NIcon :component="ModelsIcon" /></template>
            Manage Models
          </NButton>
          <NButton
            class="sidebar-action"
            :disabled="busy"
            quaternary
            @click="$emit('managePresets')"
          >
            <template v-slot:icon><NIcon :component="PresetsIcon" /></template>
            Manage Presets
          </NButton>
        </aside>
      </template>
      <template v-slot:2>
        <div ref="contentRoot" class="home-content">
          <NSplit
            v-model:size="browserSize"
            class="home-content-split"
            :disabled="inspectorCollapsed"
            :max="browserMax"
            :min="browserMin"
            :resizeTriggerSize="inspectorCollapsed ? 0 : 3"
          >
            <template v-slot:1>
              <div class="project-browser">
                <header class="browser-heading">
                  <div class="browser-title">
                    <h1>
                      {{
                        trashView
                          ? 'Trash'
                          : workspaceId === null
                            ? 'Projects'
                            : (selectedWorkspace?.displayName ?? 'Workspace')
                      }}
                    </h1>
                    <span class="project-count">{{ visibleProjects.length }}</span>
                  </div>
                  <div class="heading-actions">
                    <IconButton
                      :disabled="busy"
                      :icon="RefreshIcon"
                      label="Refresh projects"
                      :loading="loading || workspacesLoading || trashLoading"
                      @click="$emit('refresh')"
                    />
                    <IconButton
                      v-if="!trashView && selectedWorkspace"
                      :disabled="busy"
                      :icon="DotsIcon"
                      label="Workspace options"
                      @click="requestWorkspaceAction('settings', selectedWorkspace.id)"
                    />
                  </div>
                </header>

                <div class="browser-content">
                  <NAlert
                    v-if="hasGenerationModel === false"
                    key="n-alert-1"
                    class="browser-error"
                    type="warning"
                  >
                    <strong>No generation model installed.</strong>
                    You can still create, open, and organize projects.
                    <NButton size="tiny" text type="primary" @click="$emit('manageModels')">
                      Manage Models
                    </NButton>
                  </NAlert>
                  <NAlert
                    v-else-if="modelCatalogError"
                    key="n-alert-2"
                    class="browser-error"
                    title="Model catalog unavailable"
                    type="warning"
                  >
                    Refresh Home or open Manage Models to check installed models.
                    <NButton size="tiny" text type="primary" @click="$emit('manageModels')">
                      Manage Models
                    </NButton>
                  </NAlert>
                  <NAlert
                    v-if="error"
                    key="n-alert-3"
                    class="browser-error"
                    title="Project action failed"
                    type="error"
                  >
                    {{ error }}
                  </NAlert>
                  <NAlert
                    v-if="workspacesError"
                    key="n-alert-2"
                    class="browser-error"
                    title="Workspace list unavailable"
                    type="warning"
                  >
                    {{ workspacesError }} Refresh to try again.
                  </NAlert>
                  <NAlert
                    v-if="workspaceProblem"
                    key="n-alert-3"
                    class="browser-error"
                    title="Workspace needs attention"
                    type="warning"
                  >
                    {{ workspaceProblem }}
                    <NButton
                      v-if="selectedWorkspace && canLocateWorkspace(selectedWorkspace)"
                      :disabled="busy"
                      size="tiny"
                      text
                      type="primary"
                      @click="$emit('locateWorkspace', selectedWorkspace.id)"
                    >
                      Locate Folder
                    </NButton>
                  </NAlert>
                  <NAlert
                    v-if="trashError"
                    key="n-alert-4"
                    class="browser-error"
                    title="Trash unavailable"
                    type="warning"
                  >
                    {{ trashError }} Refresh to try again.
                  </NAlert>
                  <div aria-label="Project browser controls" class="browser-toolbar">
                    <label class="toolbar-field toolbar-field--search">
                      <NText class="toolbar-label" depth="3">Name</NText>
                      <NInput
                        v-model:value="search"
                        clearable
                        :inputProps="{ 'aria-label': 'Search projects' }"
                        placeholder="Search projects"
                      />
                    </label>
                    <label class="toolbar-field">
                      <NText class="toolbar-label" depth="3">Sort by</NText>
                      <NSelect v-model:value="sort" aria-label="Sort by" :options="sortOptions" />
                    </label>
                    <label class="toolbar-field">
                      <NText class="toolbar-label" depth="3">Status</NText>
                      <NSelect
                        v-model:value="status"
                        aria-label="Status"
                        :options="statusOptions"
                      />
                    </label>
                    <NButtonGroup aria-label="View mode" class="view-toggle">
                      <NButton
                        aria-label="Grid view"
                        :aria-pressed="viewMode === 'grid'"
                        :secondary="viewMode === 'grid'"
                        title="Grid view"
                        @click="viewMode = 'grid'"
                      >
                        <template v-slot:icon><NIcon :component="AllIcon" /></template>
                      </NButton>
                      <NButton
                        aria-label="List view"
                        :aria-pressed="viewMode === 'list'"
                        :secondary="viewMode === 'list'"
                        title="List view"
                        @click="viewMode = 'list'"
                      >
                        <template v-slot:icon><NIcon :component="ListIcon" /></template>
                      </NButton>
                    </NButtonGroup>
                    <IconButton
                      :disabled="!hasActiveFilters"
                      :icon="ResetIcon"
                      label="Reset filters"
                      @click="resetFilters"
                    />
                  </div>

                  <div v-if="loading && displayProjects.length === 0" class="browser-state">
                    <NSpin size="small" />
                  </div>
                  <div v-else-if="displayProjects.length === 0" class="browser-state">
                    <NEmpty :description="trashView ? 'Trash is empty' : 'No projects yet'">
                      <template v-slot:icon><NIcon :component="FolderIcon" /></template>
                      <template v-if="!trashView" v-slot:extra>
                        <NButton :disabled="busy" secondary @click="$emit('createProject')">
                          New Project
                        </NButton>
                      </template>
                    </NEmpty>
                  </div>
                  <div v-else-if="visibleProjects.length === 0" class="browser-state">
                    <NEmpty description="No projects match this search or filter">
                      <template v-slot:extra>
                        <NButton secondary @click="resetFilters">Reset filters</NButton>
                      </template>
                    </NEmpty>
                  </div>
                  <div
                    v-else
                    :aria-label="viewMode === 'grid' ? 'Project grid' : 'Project list'"
                    class="project-list"
                    :class="{ 'project-grid': viewMode === 'grid' }"
                    role="list"
                  >
                    <article
                      v-for="project of visibleProjects"
                      :key="trashSummary(project)?.trashId ?? project.id"
                      class="project-row"
                      :class="{
                        'project-row--selected': selectedProjectId === project.id,
                        'project-card': viewMode === 'grid',
                      }"
                      :data-project-id="project.id"
                      :data-selected="selectedProjectId === project.id"
                      :data-trash-id="trashSummary(project)?.trashId"
                      role="listitem"
                      @auxclick="auxiliaryClickProject($event, project)"
                      @click="selectProject($event, project)"
                      @contextmenu="openContextMenu($event, project)"
                      @dblclick="doubleClickProject($event, project)"
                    >
                      <NButton
                        :aria-label="`Select ${project.title}`"
                        :aria-pressed="selectedProjectId === project.id"
                        class="row-select"
                        :disabled="busy"
                        text
                        @keydown.enter.prevent.stop="requestOpen(project)"
                      >
                        <div class="project-thumbnail">
                          <img
                            v-if="showThumbnail(project)"
                            alt=""
                            decoding="async"
                            loading="lazy"
                            :src="project.thumbnailUrl ?? undefined"
                            @error="markThumbnailFailed(project.thumbnailUrl)"
                          />
                          <NIcon v-else aria-hidden="true" :component="FolderIcon" />
                          <div v-if="viewMode === 'grid'" class="condition-stack">
                            <NTag
                              v-for="condition of conditionTags(project)"
                              :key="condition.label"
                              :bordered="false"
                              size="small"
                              :themeOverrides="projectStatusTagTheme"
                              :type="condition.type"
                            >
                              {{ condition.label }}
                            </NTag>
                          </div>
                        </div>
                        <div class="project-details">
                          <div class="project-name-line">
                            <strong :title="project.title">{{ project.title }}</strong>
                            <template v-if="viewMode === 'list'">
                              <NTag
                                v-for="condition of conditionTags(project)"
                                :key="condition.label"
                                size="small"
                                :themeOverrides="projectStatusTagTheme"
                                :type="condition.type"
                              >
                                {{ condition.label }}
                              </NTag>
                            </template>
                          </div>
                          <div class="project-meta">
                            <span
                              class="project-workspace"
                              :title="
                                trashSummary(project)?.originalWorkspaceDirectoryPath ??
                                projectWorkspaceName(project)
                              "
                            >
                              {{ projectWorkspaceName(project) }}
                            </span>
                            <span
                              v-if="trashView || viewMode === 'list'"
                              class="project-file-name"
                              :title="project.fileName ?? 'Filename unavailable'"
                            >
                              {{ project.fileName ?? 'Filename unavailable' }}
                            </span>
                            <span v-if="project.bbox">
                              {{ project.bbox.width }} × {{ project.bbox.height }}
                            </span>
                            <span v-if="previewLabel(project)">{{ previewLabel(project) }}</span>
                            <span class="project-time" :title="browseTimeTitle(project)">
                              {{ browseTime(project) }}
                            </span>
                          </div>
                          <span
                            v-if="trashView && trashSummary(project)?.deletionError"
                            class="project-diagnostic"
                          >
                            {{ trashSummary(project)?.deletionError }}
                          </span>
                          <span v-if="!trashView && project.pendingMove" class="project-diagnostic">
                            {{ project.pendingMove.message }}
                          </span>
                          <span
                            v-if="!trashView && project.pendingRename"
                            class="project-diagnostic"
                          >
                            {{ project.pendingRename.message }}
                          </span>
                          <span
                            v-if="
                              !trashView &&
                              !project.pendingMove &&
                              !project.pendingRename &&
                              project.recoveryReason
                            "
                            class="project-diagnostic"
                          >
                            {{ project.recoveryReason }}
                          </span>
                        </div>
                      </NButton>
                      <div class="project-actions" data-project-control>
                        <template v-if="trashSummary(project) && viewMode === 'list'">
                          <NButton
                            :aria-label="`Restore ${project.title}`"
                            :disabled="busy || trashSummary(project)?.deletionStatus === 'deleting'"
                            size="small"
                            @click="requestRestore(project)"
                          >
                            Restore Project
                          </NButton>
                          <NButton
                            :aria-label="`Delete ${project.title} permanently`"
                            :disabled="busy"
                            quaternary
                            size="small"
                            type="error"
                            @click="requestDelete(project)"
                          >
                            Delete Permanently
                          </NButton>
                        </template>
                        <NDropdown
                          v-if="trashView && viewMode === 'grid'"
                          :disabled="busy"
                          :options="trashActionOptions(project)"
                          trigger="click"
                          @select="requestTrashAction($event, project)"
                        >
                          <span class="project-menu">
                            <IconButton
                              compact
                              :disabled="busy"
                              :icon="DotsIcon"
                              :label="`${project.title} project actions`"
                            />
                          </span>
                        </NDropdown>
                        <NButton
                          v-if="viewMode === 'list' && canRebuildPreview(project)"
                          :aria-label="`Rebuild preview for ${project.title}`"
                          :disabled="busy"
                          :loading="
                            pendingAction?.kind === 'rebuild' &&
                            pendingAction.projectId === project.id
                          "
                          quaternary
                          size="small"
                          @click="$emit('rebuildPreview', project.id)"
                        >
                          <template v-slot:icon><NIcon :component="RefreshIcon" /></template>
                          Rebuild Preview
                        </NButton>
                        <NButton
                          v-if="!trashView"
                          key="n-button-2"
                          :aria-label="`Open ${project.title}`"
                          class="open-project"
                          :disabled="!canOpenProject(project)"
                          :loading="
                            pendingAction?.kind === 'open' && pendingAction.projectId === project.id
                          "
                          size="small"
                          @click="requestOpen(project)"
                        >
                          Open
                        </NButton>
                        <NDropdown
                          v-if="!trashView"
                          key="n-dropdown-2"
                          :disabled="busy"
                          :options="projectActionOptions(project)"
                          trigger="click"
                          @select="requestProjectAction($event, project)"
                        >
                          <span class="project-menu">
                            <IconButton
                              compact
                              :disabled="busy"
                              :icon="DotsIcon"
                              :label="`${project.title} project actions`"
                            />
                          </span>
                        </NDropdown>
                      </div>
                    </article>
                  </div>
                </div>
              </div>
            </template>
            <template v-slot:2>
              <HomeProjectInspector
                v-model:collapsed="inspectorCollapsed"
                :busy
                :canManageMissing="
                  selectedProject ? canManageMissingProject(selectedProject) : false
                "
                :canRebuild="selectedProject ? canRebuildPreview(selectedProject) : false"
                :healthLabel="selectedProject ? healthLabel(selectedProject) : null"
                :isOpen="Boolean(selectedProject && openProjectIds?.includes(selectedProject.id))"
                :pendingAction
                :project="selectedProject"
                :recoveryLabel="selectedProject ? recoveryLabel(selectedProject) : null"
                :trashProject="selectedProject ? trashSummary(selectedProject) : null"
                :workspace="inspectorWorkspace"
                :workspaceName="selectedProject ? projectWorkspaceName(selectedProject) : ''"
                @deleteProject="$emit('deleteProject', $event)"
                @locateProject="$emit('locateProject', $event)"
                @locateWorkspace="$emit('locateWorkspace', $event)"
                @moveProject="$emit('moveProject', $event)"
                @openProject="(projectId, target) => $emit('openProject', projectId, target)"
                @rebuildPreview="$emit('rebuildPreview', $event)"
                @removeMissingProject="$emit('removeMissingProject', $event)"
                @renameProject="$emit('renameProject', $event)"
                @restoreProject="$emit('restoreProject', $event)"
                @revealProject="$emit('revealProject', $event)"
              />
            </template>
          </NSplit>
        </div>
      </template>
    </NSplit>
    <NDropdown
      :options="contextOptions"
      :show="Boolean(contextProject) && !busy"
      trigger="manual"
      :x="contextMenuX"
      :y="contextMenuY"
      @clickoutside="closeContextMenuOutside"
      @select="requestContextAction"
      @update:show="(show) => !show && closeContextMenu()"
    />
  </section>
</template>

<style scoped>
.home-view {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--app-surface);
}

.home-shell-split,
.home-content-split,
.home-content {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.workspace-sidebar {
  height: 100%;
  box-sizing: border-box;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  scrollbar-color: var(--app-border) transparent;
  scrollbar-width: thin;
  padding: 21px 12px;
  border-right: 1px solid var(--app-border);
}

.workspace-sidebar h2 {
  margin: 0 8px 15px;
  color: var(--app-text-muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.sidebar-action {
  width: 100%;
  min-width: 0;
  justify-content: flex-start;
  padding-inline: 10px;
}

.new-project {
  margin-bottom: 6px;
}

.import-project {
  margin-bottom: 18px;
}

.workspace-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 16px;
}

.workspace-sidebar .workspace-heading h2 {
  margin-bottom: 0;
}

.workspace-list {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 4px;
  min-width: 0;
  margin-top: 7px;
}

.workspace-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 2px;
  min-width: 0;
}

.project-menu,
.workspace-menu {
  display: inline-flex;
}

.workspace-select :deep(.n-button__content) {
  flex: 1 1 0%;
  justify-content: flex-start;
  min-width: 0;
  gap: 6px;
}

.workspace-name {
  flex: 1 1 0%;
  min-width: 0;
  overflow: hidden;
  text-align: start;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-count,
.workspace-status {
  flex: 0 0 auto;
  color: var(--app-text-muted);
  font-size: 11px;
}

.workspace-count {
  margin-left: auto;
}

.workspace-marker {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--app-text-muted);
}

.workspace-marker--green {
  background: var(--workspace-green);
}
.workspace-marker--blue {
  background: var(--workspace-blue);
}
.workspace-marker--amber {
  background: var(--workspace-amber);
}
.workspace-marker--violet {
  background: var(--workspace-violet);
}
.workspace-marker--teal {
  background: var(--workspace-teal);
}

.workspace-sidebar .tools-heading {
  margin-top: 28px;
}

.project-browser {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  container-type: inline-size;
}

.browser-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 53px;
  padding: 0 24px;
  border-bottom: 1px solid var(--app-border);
}

.browser-title,
.project-name-line,
.project-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.browser-heading h1 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.heading-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
}

.project-count,
.project-meta,
.project-diagnostic {
  color: var(--app-text-muted);
  font-size: var(--app-font-size-meta);
}

.browser-content {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  overflow: auto;
  scrollbar-color: var(--app-border) transparent;
  scrollbar-width: thin;
  padding: 22px 24px 36px;
}

.browser-error {
  margin-bottom: 16px;
}

.browser-toolbar {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) 140px 180px auto auto;
  align-items: end;
  gap: 8px;
  flex: 0 0 auto;
  max-width: 920px;
  margin-bottom: 18px;
}

.toolbar-field {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.toolbar-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  line-height: 1;
  text-transform: uppercase;
}

.browser-state {
  display: grid;
  flex: 1 0 180px;
  place-items: center;
  padding: 24px;
}

.project-list {
  display: grid;
  gap: 8px;
  max-width: 920px;
}

.project-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  min-width: 0;
  min-height: 88px;
  padding: 8px 12px 8px 8px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-elevated);
}

.project-row--selected {
  border-color: var(--workspace-green);
}

.row-select {
  min-width: 0;
  height: auto;
  padding: 0;
  white-space: normal;
}

.row-select :deep(.n-button__content) {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  align-items: center;
  gap: 14px;
  width: 100%;
  min-width: 0;
  text-align: start;
}

.project-thumbnail {
  display: grid;
  place-items: center;
  width: 72px;
  height: 70px;
  color: var(--app-text-muted);
  background: var(--app-chrome);
  font-size: 24px;
  overflow: hidden;
}

.project-thumbnail img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.project-details {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.project-name-line strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-meta span + span::before {
  content: '·';
  margin-right: 10px;
}

.project-meta {
  flex-wrap: wrap;
  row-gap: 4px;
}

.project-file-name {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-workspace {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-diagnostic {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  justify-self: end;
}

.project-grid {
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 178px), 1fr));
  align-items: start;
  align-content: start;
  gap: 14px;
  max-width: none;
}

.project-card {
  grid-template-columns: minmax(0, 1fr);
  gap: 0;
  overflow: hidden;
  padding: 0;
}

.project-card .row-select {
  display: block;
  width: 100%;
}

.project-card .row-select :deep(.n-button__content) {
  grid-template-columns: minmax(0, 1fr);
  gap: 0;
}

.project-card .project-thumbnail {
  position: relative;
  width: 100%;
  height: 132px;
}

.condition-stack {
  position: absolute;
  top: 8px;
  left: 8px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  max-width: calc(100% - 16px);
}

.project-card .project-details {
  gap: 5px;
  padding: 10px 12px;
}

.project-card .project-name-line {
  display: block;
}

.project-card .project-name-line strong {
  display: block;
}

.project-card .project-meta {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 4px;
}

.project-card .project-meta span + span::before {
  content: none;
}

.project-card .project-diagnostic {
  display: none;
}

.project-card .project-actions {
  width: 100%;
  box-sizing: border-box;
  min-height: 42px;
  padding: 0 8px 8px;
  justify-content: flex-end;
}

@container (max-width: 850px) {
  .browser-toolbar {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto auto;
  }

  .toolbar-field--search {
    grid-column: 1 / -1;
  }
}

@container (max-width: 720px) {
  .project-list:not(.project-grid) .project-row {
    grid-template-columns: minmax(0, 1fr);
  }

  .project-actions {
    flex-wrap: wrap;
    justify-content: flex-end;
    max-width: none;
  }
}

@container (max-width: 420px) {
  .browser-toolbar {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }

  .view-toggle {
    justify-self: start;
  }

  .browser-toolbar > .icon-action {
    justify-self: end;
  }
}
</style>
