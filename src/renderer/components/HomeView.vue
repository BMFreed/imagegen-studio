<script setup lang="ts">
import type { ProjectSummary } from '../../shared/api.js'
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
} from '@vicons/tabler'
import { NAlert, NButton, NDropdown, NEmpty, NIcon, NInput, NSpin, NTag } from 'naive-ui'
import { computed, ref, watch } from 'vue'

import IconButton from '../../../docs/prototype-app/src/components/IconButton.vue'

const props = defineProps<{
  busy: boolean
  error: string | null
  loading: boolean
  pendingAction: { kind: 'open' | 'rebuild'; projectId: string } | null
  projects: ProjectSummary[]
  workspaces: ProjectWorkspaceSummary[]
  workspacesError: string | null
  workspacesLoading: boolean
}>()
const workspaceId = defineModel<string | null>('workspaceId', { required: true })

defineEmits<{
  addWorkspace: []
  createProject: []
  importProject: []
  manageModels: []
  managePresets: []
  openProject: [projectId: string]
  rebuildPreview: [projectId: string]
  refresh: []
  workspaceSettings: [workspaceId: string]
}>()

const search = ref('')
const selectedWorkspace = computed(() =>
  props.workspaces.find(({ id }) => id === workspaceId.value),
)
const workspaceProblem = computed(() => {
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
    project.health === 'ready' &&
    project.previewStatus === 'unavailable' &&
    (project.recoveryStatus === 'none' || project.recoveryStatus === 'unavailable')
  )
}

const visibleProjects = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  return query
    ? props.projects.filter((project) => project.title.toLocaleLowerCase().includes(query))
    : props.projects
})

function previewLabel(project: ProjectSummary): string | null {
  if (project.health !== 'ready') {
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
        :aria-pressed="workspaceId === null"
        :bordered="false"
        class="sidebar-action workspace-select"
        :disabled="busy"
        :secondary="workspaceId === null"
        @click="workspaceId = null"
      >
        <template v-slot:icon><NIcon :component="AllIcon" /></template>
        Projects
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
            :aria-pressed="workspaceId === workspace.id"
            :bordered="false"
            class="sidebar-action workspace-select"
            :disabled="busy"
            :secondary="workspaceId === workspace.id"
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
            :options="[{ key: 'settings', label: 'Workspace Settings' }]"
            trigger="click"
            @select="$emit('workspaceSettings', workspace.id)"
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
              workspaceId === null ? 'Projects' : (selectedWorkspace?.displayName ?? 'Workspace')
            }}
          </h1>
          <span class="project-count">{{ projects.length }}</span>
        </div>
        <IconButton
          :icon="RefreshIcon"
          label="Refresh projects"
          :loading="loading || workspacesLoading"
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
        <NInput
          v-model:value="search"
          aria-label="Search projects"
          class="project-search"
          clearable
          :disabled="projects.length === 0"
          placeholder="Search projects"
        />

        <div v-if="loading && projects.length === 0" class="browser-state">
          <NSpin size="small" />
        </div>
        <div v-else-if="projects.length === 0" class="browser-state">
          <NEmpty description="No projects yet">
            <template v-slot:icon><NIcon :component="FolderIcon" /></template>
            <template v-slot:extra>
              <NButton :disabled="busy" secondary @click="$emit('createProject')">
                New Project
              </NButton>
            </template>
          </NEmpty>
        </div>
        <div v-else-if="visibleProjects.length === 0" class="browser-state">
          <NEmpty description="No projects match your search">
            <template v-slot:extra>
              <NButton secondary @click="search = ''">Clear search</NButton>
            </template>
          </NEmpty>
        </div>
        <div v-else class="project-list" role="list">
          <article
            v-for="project of visibleProjects"
            :key="project.id"
            class="project-row"
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
                <NTag v-if="healthLabel(project)" size="small" type="warning">
                  {{ healthLabel(project) }}
                </NTag>
                <NTag v-if="recoveryLabel(project)" key="n-tag-2" size="small" type="warning">
                  {{ recoveryLabel(project) }}
                </NTag>
              </div>
              <div class="project-meta">
                <span class="project-workspace" :title="projectWorkspaceName(project)">
                  {{ projectWorkspaceName(project) }}
                </span>
                <span v-if="project.bbox">
                  {{ project.bbox.width }} × {{ project.bbox.height }}
                </span>
                <span v-if="previewLabel(project)">{{ previewLabel(project) }}</span>
              </div>
              <span v-if="project.recoveryReason" class="project-diagnostic">
                {{ project.recoveryReason }}
              </span>
            </div>
            <div class="project-actions">
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
                :aria-label="`Open ${project.title}`"
                class="open-project"
                :disabled="busy || project.health !== 'ready'"
                :loading="pendingAction?.kind === 'open' && pendingAction.projectId === project.id"
                size="small"
                @click="$emit('openProject', project.id)"
              >
                Open
              </NButton>
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

.project-search {
  flex: 0 0 auto;
  max-width: 440px;
  margin-bottom: 18px;
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
}
</style>
