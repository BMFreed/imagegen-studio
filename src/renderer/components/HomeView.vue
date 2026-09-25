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
import { computed, ref } from 'vue'

const props = defineProps<{
  error: string | null
  loading: boolean
  pendingProjectId: string | null
  projects: ProjectSummary[]
}>()

defineEmits<{
  createProject: []
  importProject: []
  manageModels: []
  openProject: [projectId: string]
  refresh: []
}>()

const search = ref('')
const visibleProjects = computed(() => {
  const query = search.value.trim().toLocaleLowerCase()
  return query
    ? props.projects.filter((project) => project.title.toLocaleLowerCase().includes(query))
    : props.projects
})

function previewLabel(project: ProjectSummary): string {
  switch (project.previewStatus) {
    case 'rendered': {
      return 'Saved preview'
    }
    case 'unavailable': {
      return 'Preview unavailable'
    }
    default: {
      return 'Empty project'
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
      <NButton class="sidebar-action new-project" type="primary" @click="$emit('createProject')">
        <template v-slot:icon><NIcon :component="PlusIcon" /></template>
        New Project
      </NButton>
      <NButton class="sidebar-action import-project" quaternary @click="$emit('importProject')">
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

        <NSpin v-if="loading && projects.length === 0" class="browser-loading" size="small" />
        <NEmpty
          v-else-if="projects.length === 0"
          key="n-empty-1"
          class="browser-empty"
          description="No projects yet"
        >
          <template v-slot:icon><NIcon :component="FolderIcon" /></template>
          <template v-slot:extra>
            <NButton type="primary" @click="$emit('createProject')">New Project</NButton>
          </template>
        </NEmpty>
        <NEmpty
          v-else-if="visibleProjects.length === 0"
          key="n-empty-2"
          class="browser-empty"
          description="No projects match your search"
        />
        <div v-else class="project-list" role="list">
          <article
            v-for="project of visibleProjects"
            :key="project.id"
            class="project-row"
            role="listitem"
          >
            <div aria-hidden="true" class="project-thumbnail">
              <NIcon :component="FolderIcon" />
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
                <span>{{ previewLabel(project) }}</span>
              </div>
              <span v-if="project.recoveryReason" class="project-diagnostic">
                {{ project.recoveryReason }}
              </span>
            </div>
            <NButton
              :aria-label="`Open ${project.title}`"
              class="open-project"
              :disabled="pendingProjectId !== null && pendingProjectId !== project.id"
              :loading="pendingProjectId === project.id"
              size="small"
              @click="$emit('openProject', project.id)"
            >
              Open
            </NButton>
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
  min-height: 0;
  overflow: auto;
  padding: 22px 24px 36px;
}

.browser-error {
  margin-bottom: 16px;
}

.project-search {
  max-width: 440px;
  margin-bottom: 18px;
}

.browser-loading,
.browser-empty {
  display: block;
  margin: 56px auto;
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

.open-project {
  justify-self: end;
}
</style>
