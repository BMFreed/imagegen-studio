<script setup lang="ts">
import {
  AlertTriangle as AlertIcon,
  LayoutGrid as AllIcon,
  Bookmark as BookmarkIcon,
  DotsVertical as DotsIcon,
  Folder as FolderIcon,
  FolderPlus as FolderPlusIcon,
  Plus as PlusIcon,
  Settings as SettingsIcon,
  Trash as TrashIcon,
} from '@vicons/tabler'
import { NButton, NDropdown, NEllipsis, NIcon, NScrollbar, NText } from 'naive-ui'

import type { HomeBrowseSelection, HomeWorkspace } from './home.types'

defineProps<{
  browseSelection: HomeBrowseSelection
  projectCounts: Record<string, number>
  trashedCount: number
  workspaces: HomeWorkspace[]
}>()

defineEmits<{
  addWorkspace: []
  importProject: []
  manageModels: []
  managePresets: []
  newProject: []
  selectBrowse: [value: 'all' | 'trash']
  selectWorkspace: [workspaceId: string]
  workspaceAction: [value: { action: string; workspaceId: string }]
}>()

const workspaceOptions = [
  { key: 'settings', label: 'Workspace Settings' },
  { key: 'reveal', label: 'Show in Folder' },
  { key: 'rescan', label: 'Rescan' },
  { key: 'remove', label: 'Remove Workspace' },
]

function getWorkspaceOptions(workspace: HomeWorkspace) {
  return workspace.isDefault
    ? workspaceOptions.filter((option) => option.key !== 'remove')
    : workspaceOptions
}
</script>

<template>
  <aside aria-label="Home navigation" class="home-sidebar">
    <div class="quick-actions">
      <NButton type="primary" @click="$emit('newProject')">
        <template v-slot:icon><NIcon :component="PlusIcon" /></template>
        New Project
      </NButton>
      <NButton secondary @click="$emit('importProject')">
        <template v-slot:icon><NIcon :component="FolderIcon" /></template>
        Import Project
      </NButton>
    </div>

    <NScrollbar class="sidebar-scroll">
      <div class="navigation-list">
        <NText class="group-label" depth="3">Browse</NText>
        <NButton
          :aria-pressed="browseSelection.kind === 'all'"
          class="navigation-row"
          :secondary="browseSelection.kind === 'all'"
          @click="$emit('selectBrowse', 'all')"
        >
          <template v-slot:icon><NIcon :component="AllIcon" /></template>
          <span>Projects</span>
        </NButton>
        <NButton
          :aria-pressed="browseSelection.kind === 'trash'"
          class="navigation-row"
          :secondary="browseSelection.kind === 'trash'"
          @click="$emit('selectBrowse', 'trash')"
        >
          <template v-slot:icon><NIcon :component="TrashIcon" /></template>
          <span>Trash</span>
          <small>{{ trashedCount }}</small>
        </NButton>

        <div class="group-heading group-heading--workspaces">
          <NText class="group-label" depth="3">Workspaces</NText>
          <NButton
            aria-label="Add workspace"
            circle
            quaternary
            size="tiny"
            title="Add workspace"
            @click="$emit('addWorkspace')"
          >
            <template v-slot:icon><NIcon :component="FolderPlusIcon" /></template>
          </NButton>
        </div>
        <div v-for="workspace of workspaces" :key="workspace.id" class="workspace-row">
          <NButton
            :aria-pressed="
              browseSelection.kind === 'workspace' && browseSelection.workspaceId === workspace.id
            "
            class="navigation-row workspace-select"
            :secondary="
              browseSelection.kind === 'workspace' && browseSelection.workspaceId === workspace.id
            "
            @click="$emit('selectWorkspace', workspace.id)"
          >
            <template v-slot:icon>
              <span
                v-if="workspace.availability === 'available'"
                class="workspace-marker"
                :style="{ backgroundColor: workspace.color }"
              />
              <NIcon v-else :component="AlertIcon" />
            </template>
            <NEllipsis class="workspace-name">{{ workspace.name }}</NEllipsis>
            <small>
              {{
                workspace.availability === 'available'
                  ? (projectCounts[workspace.id] ?? 0)
                  : 'Missing'
              }}
            </small>
          </NButton>
          <NDropdown
            :options="getWorkspaceOptions(workspace)"
            trigger="click"
            @select="
              $emit('workspaceAction', { action: String($event), workspaceId: workspace.id })
            "
          >
            <NButton
              :aria-label="`${workspace.name} workspace actions`"
              circle
              class="workspace-menu"
              quaternary
              size="tiny"
            >
              <template v-slot:icon><NIcon :component="DotsIcon" /></template>
            </NButton>
          </NDropdown>
        </div>
      </div>
    </NScrollbar>

    <div class="tool-actions">
      <NButton secondary @click="$emit('manageModels')">
        <template v-slot:icon><NIcon :component="SettingsIcon" /></template>
        Manage Models
      </NButton>
      <NButton secondary @click="$emit('managePresets')">
        <template v-slot:icon><NIcon :component="BookmarkIcon" /></template>
        Manage Presets
      </NButton>
    </div>
  </aside>
</template>

<style scoped>
.home-sidebar {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 14px;
  min-width: 0;
  min-height: 0;
  height: 100%;
  padding: 16px;
  border-right: 1px solid var(--app-border);
  background: var(--app-chrome);
}

.quick-actions,
.navigation-list,
.tool-actions {
  display: grid;
  gap: 7px;
}

.sidebar-scroll {
  min-height: 0;
}

.group-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
}

.group-label {
  padding: 8px 8px 2px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.group-heading--workspaces {
  margin-top: 5px;
}

.navigation-row {
  --n-padding: 0 9px;
  justify-content: start;
  width: 100%;
}

.navigation-row :deep(.n-button__content) {
  justify-content: start;
  width: 100%;
  min-width: 0;
}

.navigation-row small {
  margin-left: auto;
  color: var(--app-text-muted);
  font-size: 11px;
}

.workspace-row {
  position: relative;
  min-width: 0;
}

.workspace-select {
  padding-right: 26px;
}

.workspace-marker {
  width: 8px;
  height: 8px;
  border-radius: 2px;
}

.workspace-select :deep(.workspace-name) {
  flex: 1 1 auto;
  min-width: 0;
  line-height: 1.5;
}

.workspace-menu {
  position: absolute;
  top: 4px;
  right: 2px;
}

.tool-actions {
  padding-top: 12px;
  border-top: 1px solid var(--app-border);
}

.tool-actions .n-button {
  width: 100%;
}
</style>
