<script setup lang="ts">
import { NButton, NDropdown, NTag } from 'naive-ui';
import { computed, ref } from 'vue';

import type { HomeProjectAction, HomeProjectRecord } from './home.types';

import { projectStatusTagTheme } from '../../theme/naive-theme';
import HomeProjectActions from './HomeProjectActions.vue';
import ProjectArtwork from './ProjectArtwork.vue';

const props = defineProps<{
  conditions: string[];
  project: HomeProjectRecord;
  selected: boolean;
  showWorkspace: boolean;
  trashView: boolean;
  workspaceName: string;
}>();

const emit = defineEmits<{
  action: [value: HomeProjectAction];
  open: [value: { projectId: string; target: 'current' | 'new' }];
  select: [id: string];
}>();

const contextOptions = computed(() =>
  props.trashView
    ? [
        { key: 'restore', label: 'Restore' },
        { key: 'delete-permanently', label: 'Delete Permanently' },
      ]
    : [
        { key: 'open', label: 'Open' },
        { key: 'open-new', label: 'Open in New Tab' },
        { key: 'rename', label: 'Rename' },
        { key: 'move', label: 'Move to Workspace' },
        { key: 'reveal', label: 'Show in Folder' },
        { key: 'trash', label: 'Move to Trash' },
      ],
);

const contextMenuVisible = ref(false);
const contextMenuX = ref(0);
const contextMenuY = ref(0);

function handleClick(event: MouseEvent) {
  if (props.trashView) {
    emit('select', props.project.id);
    return;
  }
  if (event.ctrlKey || event.metaKey) {
    emit('open', { projectId: props.project.id, target: 'new' });
    return;
  }
  emit('select', props.project.id);
}

function handleAuxClick(event: MouseEvent) {
  if (event.button === 1) {
    event.preventDefault();
    emit('open', { projectId: props.project.id, target: 'new' });
  }
}

function handleDoubleClick() {
  if (!props.trashView) {
    emit('open', { projectId: props.project.id, target: 'current' });
  }
}

function handleContextAction(key: string) {
  contextMenuVisible.value = false;
  emit('action', {
    action: key as HomeProjectAction['action'],
    projectId: props.project.id,
  });
}

function openContextMenu(event: MouseEvent) {
  emit('select', props.project.id);
  contextMenuX.value = event.clientX;
  contextMenuY.value = event.clientY;
  contextMenuVisible.value = true;
}
</script>

<template>
  <article
    class="project-card"
    :class="{
      'project-card--attention': project.health !== 'ready',
      'project-card--selected': selected,
    }"
  >
    <NButton
      :aria-label="`Select ${project.displayName}`"
      :aria-pressed="selected"
      class="card-select"
      text
      @auxclick="handleAuxClick"
      @click="handleClick"
      @contextmenu.prevent="openContextMenu"
      @dblclick="handleDoubleClick"
      @keydown.enter.prevent="$emit('open', { projectId: project.id, target: 'current' })"
    >
      <div class="thumbnail">
        <ProjectArtwork v-if="project.thumbnailState === 'ready'" :tone="project.thumbnailTone" />
        <span v-else class="thumbnail-fallback">Preview unavailable</span>
        <div class="condition-stack">
          <NTag
            v-for="condition of conditions.slice(0, 2)"
            :key="condition"
            :bordered="false"
            size="small"
            :themeOverrides="projectStatusTagTheme"
            :type="condition === 'Open' ? 'success' : 'warning'"
          >
            {{ condition }}
          </NTag>
        </div>
      </div>
      <div class="card-body">
        <strong v-overflow-title>{{ project.displayName }}</strong>
        <span v-if="showWorkspace" v-overflow-title class="workspace-name">{{
          workspaceName
        }}</span>
        <div class="card-meta">
          <span>{{ project.width }} × {{ project.height }}</span>
          <span>{{ new Date(project.lastOpenedAt).toLocaleDateString() }}</span>
        </div>
      </div>
    </NButton>
    <HomeProjectActions
      class="card-actions"
      :projectId="project.id"
      :trashView
      @action="$emit('action', $event)"
      @select="$emit('select', $event)"
    />
  </article>
  <NDropdown
    :options="contextOptions"
    :show="contextMenuVisible"
    trigger="manual"
    :x="contextMenuX"
    :y="contextMenuY"
    @clickoutside="contextMenuVisible = false"
    @select="handleContextAction"
  />
</template>

<style scoped>
.project-card {
  position: relative;
  min-width: 0;
  overflow: hidden;
  background: var(--app-elevated);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
}

.project-card--selected {
  border-color: var(--workspace-green);
  box-shadow: inset 0 0 0 1px #64e36e42;
}

.project-card--attention {
  border-style: dashed;
}

.card-select {
  --n-padding: 0;
  display: block;
  width: 100%;
  height: 100%;
  cursor: pointer;
  text-align: left;
}

.card-select :deep(.n-button__content) {
  display: grid;
  width: 100%;
  white-space: normal;
}

.thumbnail {
  position: relative;
  height: 132px;
  overflow: hidden;
  background: var(--app-chrome);
}

.thumbnail-fallback {
  display: grid;
  place-items: center;
  height: 100%;
  color: var(--app-text-muted);
  font-size: 12px;
}

.condition-stack {
  position: absolute;
  top: 8px;
  left: 8px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.card-body {
  display: grid;
  gap: 5px;
  padding: 11px 40px 11px 12px;
  min-width: 0;
}

.card-body strong,
.workspace-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-name,
.card-meta {
  color: var(--app-text-muted);
  font-size: 12px;
}

.card-meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.card-actions {
  position: absolute;
  right: 5px;
  bottom: 24px;
  z-index: 1;
}
</style>
