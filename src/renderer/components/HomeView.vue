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
  NDropdown,
  NEmpty,
  NIcon,
  NInput,
  NSelect,
  NSpin,
  NTag,
  NText,
} from 'naive-ui'
import { computed, ref, watch } from 'vue'

import IconButton from '../../../docs/prototype-app/src/components/IconButton.vue'

const props = defineProps<{
  busy: boolean
  error: string | null
  loading: boolean
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
const sort = defineModel<HomeProjectSort>('sort', { required: true })
const status = defineModel<HomeProjectStatus>('status', { required: true })

const emit = defineEmits<{
  addWorkspace: []
  browseProjects: []
  browseTrash: []
  createProject: []
  deleteProject: [project: ProjectTrashSummary]
  importProject: []
  manageModels: []
  managePresets: []
  moveProject: [project: ProjectSummary]
  openProject: [projectId: string]
  rebuildPreview: [projectId: string]
  refresh: []
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
function requestProjectAction(key: number | string, project: ProjectSummary) {
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
  } else if (key === 'move' && project.health === 'ready') {
    emit('moveProject', project)
  } else if (key === 'rename' && canRequestRename(project)) {
    emit('renameProject', project)
  } else if (key === 'trash') {
    emit('trashProject', project)
  }
}
function requestWorkspaceAction(key: number | string, workspaceId: string) {
  if (key === 'reveal') {
    emit('revealWorkspace', workspaceId)
  } else if (key === 'settings') {
    emit('workspaceSettings', workspaceId)
  }
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
  <section aria-label="Home" class="home-view">
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
        @click="$emit('browseProjects')"
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
        @click="$emit('browseTrash')"
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
            @click="workspaceId = workspace.id"
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
      <NButton class="sidebar-action" :disabled="busy" quaternary @click="$emit('managePresets')">
        <template v-slot:icon><NIcon :component="PresetsIcon" /></template>
        Manage Presets
      </NButton>
    </aside>

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
        <IconButton
          :icon="RefreshIcon"
          label="Refresh projects"
          :loading="loading || workspacesLoading || trashLoading"
          @click="$emit('refresh')"
        />
      </header>

      <div class="browser-content">
        <NAlert v-if="error" class="browser-error" title="Project action failed" type="error">
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
            <NSelect v-model:value="status" aria-label="Status" :options="statusOptions" />
          </label>
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
        <div v-else class="project-list" role="list">
          <article
            v-for="project of visibleProjects"
            :key="trashSummary(project)?.trashId ?? project.id"
            class="project-row"
            :data-project-id="project.id"
            :data-trash-id="trashSummary(project)?.trashId"
            role="listitem"
          >
            <div aria-hidden="true" class="project-thumbnail">
              <img
                v-if="showThumbnail(project)"
                alt=""
                decoding="async"
                loading="lazy"
                :src="project.thumbnailUrl ?? undefined"
                @error="markThumbnailFailed(project.thumbnailUrl)"
              />
              <NIcon v-else :component="FolderIcon" />
            </div>
            <div class="project-details">
              <div class="project-name-line">
                <strong :title="project.title">{{ project.title }}</strong>
                <NTag v-if="trashView" key="trash" size="small" type="warning">
                  {{
                    trashSummary(project)?.deletionStatus === 'deleting'
                      ? 'Deletion pending'
                      : 'In Trash'
                  }}
                </NTag>
                <NTag v-if="healthLabel(project)" key="health" size="small" type="warning">
                  {{ healthLabel(project) }}
                </NTag>
                <NTag
                  v-if="
                    !trashView &&
                    !project.pendingMove &&
                    !project.pendingRename &&
                    recoveryLabel(project)
                  "
                  key="recovery"
                  size="small"
                  type="warning"
                >
                  {{ recoveryLabel(project) }}
                </NTag>
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
                  v-if="trashView"
                  class="project-file-name"
                  :title="trashSummary(project)?.fileName"
                >
                  {{ trashSummary(project)?.fileName }}
                </span>
                <span v-if="project.bbox">
                  {{ project.bbox.width }} × {{ project.bbox.height }}
                </span>
                <span v-if="previewLabel(project)">{{ previewLabel(project) }}</span>
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
              <span v-if="!trashView && project.pendingRename" class="project-diagnostic">
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
            <div class="project-actions">
              <template v-if="trashSummary(project)">
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
              <NButton
                v-if="canRebuildPreview(project)"
                :aria-label="`Rebuild preview for ${project.title}`"
                :disabled="busy"
                :loading="
                  pendingAction?.kind === 'rebuild' && pendingAction.projectId === project.id
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
                :disabled="
                  busy ||
                  Boolean(project.pendingMove || project.pendingRename) ||
                  project.health !== 'ready'
                "
                :loading="pendingAction?.kind === 'open' && pendingAction.projectId === project.id"
                size="small"
                @click="$emit('openProject', project.id)"
              >
                Open
              </NButton>
              <NDropdown
                v-if="!trashView"
                :disabled="busy"
                :options="
                  project.pendingMove
                    ? [{ key: 'move', label: 'Retry Move' }]
                    : project.pendingRename
                      ? [{ key: 'rename', label: 'Retry Rename' }]
                      : [
                          {
                            key: 'rename',
                            label: 'Rename',
                            disabled: !canRequestRename(project),
                          },
                          {
                            key: 'move',
                            label: 'Move to Workspace',
                            disabled: project.health !== 'ready',
                          },
                          { key: 'reveal', label: 'Show in Folder' },
                          { key: 'trash', label: 'Move to Trash' },
                        ]
                "
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
  </section>
</template>

<style scoped>
.home-view {
  display: grid;
  grid-template-columns: 248px minmax(0, 1fr);
  flex: 1 1 auto;
  min-height: 0;
  background: var(--app-surface);
}

.workspace-sidebar {
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
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
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
  grid-template-columns: minmax(180px, 1fr) 140px 180px auto;
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
  grid-template-columns: 72px minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  min-width: 0;
  min-height: 88px;
  padding: 8px 12px 8px 8px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-elevated);
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

@media (max-width: 1100px) {
  .home-view {
    grid-template-columns: 210px minmax(0, 1fr);
  }

  .project-actions {
    flex-wrap: wrap;
    justify-content: flex-end;
    max-width: 160px;
  }

  .browser-toolbar {
    grid-template-columns: minmax(140px, 1fr) 120px 160px auto;
  }
}

@media (max-width: 800px) {
  .browser-toolbar {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
  }

  .toolbar-field--search {
    grid-column: 1 / -1;
  }
}
</style>
