<script setup lang="ts">
import {
  ChevronRight as CollapseIcon,
  ChevronLeft as ExpandIcon,
  Folder as FolderIcon,
  FileSearch as LocateIcon,
  Refresh as RefreshIcon,
} from '@vicons/tabler';
import { NButton, NEmpty, NIcon, NTag } from 'naive-ui';
import { computed } from 'vue';

import type { HomeProjectAction, HomeProjectRecord, HomeWorkspace } from './home.types';

import { getProjectConditionLabels } from './home.utils';
import HomePreviewViewport from './HomePreviewViewport.vue';

const props = defineProps<{
  openProjectIds: string[];
  project?: HomeProjectRecord;
  trashView: boolean;
  workspace?: HomeWorkspace;
  workspaces: HomeWorkspace[];
}>();

defineEmits<{
  action: [value: HomeProjectAction];
  locateProject: [id: string];
  open: [value: { projectId: string; target: 'current' | 'new' }];
  rebuildPreview: [id: string];
  removeProject: [id: string];
  showErrorDetails: [id: string];
  workspaceAction: [value: { action: string; workspaceId: string }];
}>();

const collapsed = defineModel<boolean>('collapsed', { required: true });

const isOpen = computed(() =>
  props.project ? props.openProjectIds.includes(props.project.id) : false,
);
const conditions = computed(() =>
  props.project
    ? getProjectConditionLabels(props.project, props.openProjectIds, props.workspaces)
    : [],
);
const canOpen = computed(
  () =>
    !props.trashView &&
    props.project?.health === 'ready' &&
    props.workspace?.availability === 'available',
);
</script>

<template>
  <aside
    aria-label="Project inspector"
    class="home-inspector"
    :class="{ 'home-inspector--collapsed': collapsed }"
  >
    <NButton
      :aria-expanded="!collapsed"
      :aria-label="collapsed ? 'Expand inspector' : 'Collapse inspector'"
      circle
      class="collapse-button"
      quaternary
      size="small"
      :title="collapsed ? 'Expand inspector' : 'Collapse inspector'"
      @click="collapsed = !collapsed"
    >
      <template v-slot:icon>
        <NIcon :component="collapsed ? ExpandIcon : CollapseIcon" />
      </template>
    </NButton>

    <template v-if="!collapsed">
      <NEmpty v-if="!project" class="inspector-empty" description="Select a project to preview" />
      <template v-else>
        <header class="inspector-header">
          <div>
            <h2>{{ project.displayName }}</h2>
            <span v-overflow-title>{{ workspace?.name }} / {{ project.fileName }}</span>
          </div>
        </header>

        <div class="condition-row">
          <NTag
            v-for="condition of conditions"
            :key="condition"
            size="small"
            :type="condition === 'Open' ? 'success' : 'warning'"
            >{{ condition }}</NTag
          >
        </div>

        <div v-if="workspace?.availability !== 'available'" class="inspector-problem">
          <strong>Workspace unavailable</strong>
          <span>The indexed project is kept visible so you can locate its folder.</span>
          <div class="problem-actions">
            <NButton
              v-if="project.health === 'corrupt'"
              size="small"
              type="primary"
              @click="$emit('showErrorDetails', project.id)"
              >Show Error Details</NButton
            >
            <NButton
              size="small"
              type="primary"
              @click="$emit('workspaceAction', { action: 'locate', workspaceId: workspace!.id })"
              >Locate Folder</NButton
            >
            <NButton
              size="small"
              @click="$emit('workspaceAction', { action: 'remove', workspaceId: workspace!.id })"
              >Remove Workspace</NButton
            >
          </div>
        </div>

        <div v-else-if="project.health !== 'ready'" class="inspector-problem">
          <strong v-if="project.health === 'missing'">Project file is missing</strong>
          <strong v-else-if="project.health === 'corrupt'">Project file is corrupt</strong>
          <strong v-else>This project was created by a newer app version</strong>
          <span v-if="project.health === 'missing'"
            >Locate the .igs file or remove this stale entry.</span
          >
          <span v-else>Opening is disabled to avoid damaging the project.</span>
          <div class="problem-actions">
            <NButton
              v-if="project.health === 'missing'"
              key="n-button-2"
              size="small"
              type="primary"
              @click="$emit('locateProject', project.id)"
              ><template v-slot:icon><NIcon :component="LocateIcon" /></template>Locate
              Project</NButton
            >
            <NButton
              v-if="project.health === 'missing'"
              key="n-button-2"
              size="small"
              @click="$emit('removeProject', project.id)"
              >Remove from Home</NButton
            >
            <NButton
              v-else
              key="n-button-3"
              size="small"
              @click="$emit('action', { action: 'reveal', projectId: project.id })"
              >Show in Folder</NButton
            >
          </div>
        </div>

        <HomePreviewViewport v-else-if="project.thumbnailState === 'ready'" :project />
        <div v-else class="inspector-problem inspector-problem--preview">
          <strong>Preview unavailable</strong>
          <span
            >The project can still be opened. Rebuild its derived thumbnail when convenient.</span
          >
          <NButton size="small" @click="$emit('rebuildPreview', project.id)">
            <template v-slot:icon><NIcon :component="RefreshIcon" /></template>
            Rebuild Preview
          </NButton>
        </div>

        <div class="detail-grid">
          <div>
            <span>Size</span><strong>{{ project.width }} × {{ project.height }}</strong>
          </div>
          <div>
            <span>Layers</span><strong>{{ project.layerCount }} layers</strong>
          </div>
          <div>
            <span>Model</span><strong>{{ project.modelName ?? 'Not set' }}</strong>
          </div>
          <div>
            <span>Modified</span
            ><strong>{{ new Date(project.modifiedAt).toLocaleString() }}</strong>
          </div>
        </div>

        <div v-if="trashView" class="inspector-actions">
          <NButton
            type="primary"
            @click="$emit('action', { action: 'restore', projectId: project.id })"
            >Restore Project</NButton
          >
          <NButton
            type="error"
            @click="$emit('action', { action: 'delete-permanently', projectId: project.id })"
            >Delete Permanently</NButton
          >
        </div>
        <div v-else class="inspector-actions">
          <NButton
            :disabled="!canOpen"
            type="primary"
            @click="$emit('open', { projectId: project.id, target: 'current' })"
          >
            <template v-slot:icon><NIcon :component="FolderIcon" /></template>
            {{ isOpen ? 'Switch to Project' : 'Open Project' }}
          </NButton>
          <NButton
            :disabled="!canOpen"
            @click="$emit('open', { projectId: project.id, target: 'new' })"
            >Open in New Tab</NButton
          >
          <NButton @click="$emit('action', { action: 'move', projectId: project.id })"
            >Move</NButton
          >
          <NButton @click="$emit('action', { action: 'reveal', projectId: project.id })"
            >Show in Folder</NButton
          >
        </div>
      </template>
    </template>
  </aside>
</template>

<style scoped>
.home-inspector {
  position: relative;
  display: grid;
  grid-template-rows: auto auto minmax(220px, 1fr) auto auto;
  align-content: start;
  gap: 12px;
  min-width: 0;
  min-height: 0;
  padding: 16px;
  border-left: 1px solid var(--app-border);
  background: var(--app-chrome);
}

.home-inspector--collapsed {
  width: 44px;
  padding: 8px;
}

.collapse-button {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2;
}

.inspector-empty {
  grid-row: 1 / -1;
  place-self: center;
}

.inspector-header {
  padding-right: 34px;
}

.inspector-header h2 {
  margin: 0 0 4px;
  font-size: 16px;
}

.inspector-header span {
  display: block;
  overflow: hidden;
  color: var(--app-text-muted);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.condition-row,
.problem-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.inspector-problem {
  display: grid;
  align-content: center;
  gap: 10px;
  min-height: 190px;
  padding: 18px;
  color: var(--app-text-muted);
  border: 1px dashed var(--status-warning);
  border-radius: var(--app-radius);
  background: var(--status-warning-soft);
}

.inspector-problem--preview {
  min-height: 260px;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.detail-grid div {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.detail-grid span {
  color: var(--app-text-muted);
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.detail-grid strong {
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.inspector-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
}
</style>
