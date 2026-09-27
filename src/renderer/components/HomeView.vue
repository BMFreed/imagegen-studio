<script setup lang="ts">
import type { ProjectSummary } from '../../shared/api.js'

import {
  Folder as FolderIcon,
  Upload as ImportIcon,
  Stack2 as ModelsIcon,
  Plus as PlusIcon,
  Refresh as RefreshIcon,
} from '@vicons/tabler'
import { NAlert, NButton, NEmpty, NIcon, NInput, NSpin, NTag } from 'naive-ui'
import { computed, ref, watch } from 'vue'

const props = defineProps<{
  busy: boolean
  error: string | null
  loading: boolean
  pendingAction: { kind: 'open' | 'rebuild'; projectId: string } | null
  projects: ProjectSummary[]
}>()

defineEmits<{
  createProject: []
  importProject: []
  manageModels: []
  openProject: [projectId: string]
  rebuildPreview: [projectId: string]
  refresh: []
}>()

const search = ref('')
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
    project.recoveryStatus === 'none'
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
    case 'invalid': {
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
      <div aria-current="page" class="sidebar-item sidebar-item--selected">Projects</div>
      <h2 class="tools-heading">Tools</h2>
      <NButton class="sidebar-action" quaternary @click="$emit('manageModels')">
        <template v-slot:icon><NIcon :component="ModelsIcon" /></template>
        Manage Models
      </NButton>
    </aside>

    <div class="project-browser">
      <header class="browser-heading">
        <div class="browser-title">
          <h1>Projects</h1>
          <span class="project-count">{{ projects.length }}</span>
        </div>
        <NButton
          aria-label="Refresh projects"
          :loading
          quaternary
          size="small"
          @click="$emit('refresh')"
        >
          <template v-slot:icon><NIcon :component="RefreshIcon" /></template>
        </NButton>
      </header>

      <div class="browser-content">
        <NAlert v-if="error" class="browser-error" title="Project action failed" type="error">
          {{ error }}
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
  justify-content: flex-start;
  padding-inline: 10px;
}

.new-project {
  margin-bottom: 6px;
}

.import-project {
  margin-bottom: 18px;
}

.sidebar-item {
  padding: 8px 11px;
  border-radius: var(--app-radius);
}

.sidebar-item--selected {
  background: var(--app-elevated-hover);
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
