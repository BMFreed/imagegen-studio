<script setup lang="ts">
import { NButton, NDropdown, NTag } from 'naive-ui'
import { computed, ref } from 'vue'

import type { HomeProjectAction, HomeProjectRecord } from './home.types'

import { projectStatusTagTheme } from '../../theme/naive-theme'
import HomeProjectActions from './HomeProjectActions.vue'
import ProjectArtwork from './ProjectArtwork.vue'

const props = defineProps<{
  conditions: string[]
  project: HomeProjectRecord
  selected: boolean
  trashView: boolean
  workspaceName: string
}>()

const emit = defineEmits<{
  action: [value: HomeProjectAction]
  open: [value: { projectId: string; target: 'current' | 'new' }]
  select: [id: string]
}>()

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
)

const contextMenuVisible = ref(false)
const contextMenuX = ref(0)
const contextMenuY = ref(0)

function handleClick(event: MouseEvent) {
  if (props.trashView) {
    emit('select', props.project.id)
    return
  }
  if (event.ctrlKey || event.metaKey) {
    emit('open', { projectId: props.project.id, target: 'new' })
  } else {
    emit('select', props.project.id)
  }
}

function handleContextAction(key: string) {
  contextMenuVisible.value = false
  emit('action', {
    action: key as HomeProjectAction['action'],
    projectId: props.project.id,
  })
}

function openContextMenu(event: MouseEvent) {
  emit('select', props.project.id)
  contextMenuX.value = event.clientX
  contextMenuY.value = event.clientY
  contextMenuVisible.value = true
}
</script>

<template>
  <article
    class="project-row"
    :class="{ 'project-row--selected': selected }"
    @contextmenu.prevent="openContextMenu"
  >
    <NButton
      :aria-label="`Select ${project.displayName}`"
      :aria-pressed="selected"
      class="row-select"
      text
      @auxclick.middle.prevent="$emit('open', { projectId: project.id, target: 'new' })"
      @click="handleClick"
      @dblclick.stop="$emit('open', { projectId: project.id, target: 'current' })"
      @keydown.enter.prevent="$emit('open', { projectId: project.id, target: 'current' })"
    >
      <div class="row-art"><ProjectArtwork :tone="project.thumbnailTone" /></div>
      <div class="row-name">
        <strong v-overflow-title>{{ project.displayName }}</strong>
        <span v-overflow-title>{{ workspaceName }} · {{ project.fileName }}</span>
      </div>
      <span>{{ project.width }} × {{ project.height }}</span>
      <span>{{ project.layerCount }} layers</span>
      <span>{{ new Date(project.modifiedAt).toLocaleDateString() }}</span>
      <div class="row-conditions">
        <NTag
          v-for="condition of conditions.slice(0, 1)"
          :key="condition"
          :bordered="false"
          size="small"
          :themeOverrides="projectStatusTagTheme"
          :type="condition === 'Open' ? 'success' : 'warning'"
        >
          {{ condition }}
        </NTag>
      </div>
    </NButton>
    <HomeProjectActions
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
.project-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  min-width: 0;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-elevated);
}

.project-row--selected {
  border-color: var(--workspace-green);
}

.row-select {
  --n-padding: 7px 8px;
  min-width: 0;
  height: 58px;
}

.row-select :deep(.n-button__content) {
  display: grid;
  grid-template-columns: 54px minmax(180px, 1fr) 100px 76px 90px minmax(100px, auto);
  align-items: center;
  gap: 12px;
  width: 100%;
  min-width: 0;
  text-align: left;
}

.row-art {
  position: relative;
  width: 52px;
  height: 42px;
  overflow: hidden;
  border-radius: var(--app-radius);
}

.row-name {
  display: grid;
  min-width: 0;
}

.row-name strong,
.row-name span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-name span,
.row-select span {
  color: var(--app-text-muted);
  font-size: 12px;
}

.row-conditions {
  justify-self: start;
}
</style>
