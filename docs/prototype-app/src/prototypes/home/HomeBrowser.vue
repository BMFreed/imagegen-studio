<script setup lang="ts">
import {
  AlertTriangle as AlertIcon,
  DotsVertical as DotsIcon,
  Refresh as RefreshIcon,
} from '@vicons/tabler'
import { NAlert, NButton, NIcon, NScrollbar } from 'naive-ui'

import type {
  HomeProjectAction,
  HomeProjectRecord,
  HomeSort,
  HomeStatusFilter,
  HomeViewMode,
  HomeWorkspace,
} from './home.types'

import HomeBrowserToolbar from './HomeBrowserToolbar.vue'
import HomeEmptyState from './HomeEmptyState.vue'
import HomeProjectGrid from './HomeProjectGrid.vue'
import HomeProjectList from './HomeProjectList.vue'

defineProps<{
  conditionsById: Record<string, string[]>
  filtered: boolean
  hasActiveFilters: boolean
  hasInstalledModel: boolean
  projects: HomeProjectRecord[]
  selectedId?: string
  showWorkspace: boolean
  title: string
  trashView: boolean
  workspace?: HomeWorkspace
  workspaces: HomeWorkspace[]
}>()

defineEmits<{
  action: [value: HomeProjectAction]
  manageModels: []
  newProject: []
  open: [value: { projectId: string; target: 'current' | 'new' }]
  openProject: []
  reset: []
  select: [id: string]
  workspaceAction: [value: { action: string; workspaceId: string }]
}>()

const search = defineModel<string>('search', { required: true })
const sort = defineModel<HomeSort>('sort', { required: true })
const status = defineModel<HomeStatusFilter>('status', { required: true })
const viewMode = defineModel<HomeViewMode>('viewMode', { required: true })
</script>

<template>
  <main class="home-browser">
    <header class="browser-heading">
      <div class="browser-title">
        <h1 tabindex="-1">{{ title }}</h1>
        <span>{{ projects.length }} {{ projects.length === 1 ? 'project' : 'projects' }}</span>
      </div>
      <div v-if="workspace" class="heading-actions">
        <NButton
          aria-label="Refresh workspace"
          circle
          quaternary
          title="Refresh workspace"
          @click="$emit('workspaceAction', { action: 'rescan', workspaceId: workspace.id })"
        >
          <template v-slot:icon><NIcon :component="RefreshIcon" /></template>
        </NButton>
        <NButton
          aria-label="Workspace options"
          circle
          quaternary
          title="Workspace options"
          @click="$emit('workspaceAction', { action: 'settings', workspaceId: workspace.id })"
        >
          <template v-slot:icon><NIcon :component="DotsIcon" /></template>
        </NButton>
      </div>
    </header>

    <NAlert v-if="!hasInstalledModel" class="model-warning" type="warning">
      <template v-slot:icon><NIcon :component="AlertIcon" /></template>
      <strong>No generation model installed.</strong>
      You can still create, open, and organize projects.
      <NButton size="tiny" text type="primary" @click="$emit('manageModels')">
        Manage Models
      </NButton>
    </NAlert>

    <NAlert
      v-if="workspace && workspace.availability !== 'available'"
      key="n-alert-2"
      class="workspace-warning"
      type="warning"
    >
      <strong>{{ workspace.name }} is unavailable.</strong>
      Cached project entries remain visible so you can locate or remove the workspace.
      <NButton
        size="tiny"
        text
        type="primary"
        @click="$emit('workspaceAction', { action: 'locate', workspaceId: workspace.id })"
      >
        Locate Folder
      </NButton>
    </NAlert>

    <HomeBrowserToolbar
      v-model:search="search"
      v-model:sort="sort"
      v-model:status="status"
      v-model:viewMode="viewMode"
      :hasActiveFilters
      @reset="$emit('reset')"
    />

    <NScrollbar class="browser-scroll">
      <HomeEmptyState
        v-if="projects.length === 0"
        :filtered
        :trashView
        @newProject="$emit('newProject')"
        @openProject="$emit('openProject')"
        @reset="$emit('reset')"
      />
      <HomeProjectGrid
        v-else-if="viewMode === 'grid'"
        :conditionsById
        :projects
        :selectedId
        :showWorkspace
        :trashView
        :workspaces
        @action="$emit('action', $event)"
        @open="$emit('open', $event)"
        @select="$emit('select', $event)"
      />
      <HomeProjectList
        v-else
        :conditionsById
        :projects
        :selectedId
        :trashView
        :workspaces
        @action="$emit('action', $event)"
        @open="$emit('open', $event)"
        @select="$emit('select', $event)"
      />
    </NScrollbar>
  </main>
</template>

<style scoped>
.home-browser {
  display: grid;
  grid-template-rows: auto auto auto minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  height: 100%;
  background: var(--app-surface-soft);
}

.browser-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 54px;
  padding: 9px 18px;
  border-bottom: 1px solid var(--app-border);
}

.browser-title {
  display: flex;
  align-items: baseline;
  min-width: 0;
  gap: 8px;
}

.browser-heading h1 {
  margin: 0;
  font-size: 21px;
}

.browser-heading span {
  color: var(--app-text-muted);
  font-size: 12px;
  white-space: nowrap;
}

.heading-actions {
  display: flex;
  gap: 4px;
}

.model-warning,
.workspace-warning {
  margin: 10px 18px 0;
}

.model-warning :deep(.n-alert-body__content),
.workspace-warning :deep(.n-alert-body__content) {
  display: flex;
  align-items: center;
  gap: 5px;
}

.browser-scroll {
  min-height: 0;
}
</style>
