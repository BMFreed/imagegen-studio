<script setup lang="ts">
import { Photo as ImageIcon } from '@vicons/tabler'
import { NButton, NDropdown, NIcon } from 'naive-ui'
import { computed } from 'vue'

import logoUrl from '../../../docs/assets/brand/imagegen-studio-logo-horizontal-no-bg.svg'

const props = defineProps<{
  canRedo: boolean
  canUndo: boolean
  homeOpen: boolean
  projectActive: boolean
}>()

const emit = defineEmits<{
  acceptedResults: []
  home: []
  presets: []
  queue: []
  redo: []
  undo: []
}>()

const editOptions = computed(() => [
  { disabled: !props.canUndo, key: 'undo', label: 'Undo · Ctrl+Z' },
  { disabled: !props.canRedo, key: 'redo', label: 'Redo · Ctrl+Shift+Z / Ctrl+Y' },
])

function selectEditAction(key: number | string) {
  if (key === 'undo' && props.canUndo) {
    emit('undo')
  } else if (key === 'redo' && props.canRedo) {
    emit('redo')
  }
}
</script>

<template>
  <header class="app-chrome">
    <NButton aria-label="Open Home" class="brand-button" text @click="$emit('home')">
      <img alt="ImageGen Studio" class="brand-logo" :src="logoUrl" />
    </NButton>
    <span v-if="homeOpen || !projectActive" class="chrome-context">
      {{ homeOpen ? 'Projects' : 'No document' }}
    </span>
    <NDropdown
      :options="[{ key: 'presets', label: 'Presets' }]"
      trigger="click"
      @select="$emit('presets')"
    >
      <NButton aria-label="Project menu" class="chrome-menu" text>Project</NButton>
    </NDropdown>
    <NDropdown :options="editOptions" trigger="click" @select="selectEditAction">
      <NButton aria-label="Edit menu" class="chrome-menu" :disabled="!projectActive" text>
        Edit
      </NButton>
    </NDropdown>
    <NButton
      aria-label="Open saved generations"
      class="chrome-menu history-button"
      quaternary
      size="small"
      title="Generated images saved in your projects"
      @click="$emit('acceptedResults')"
    >
      <template v-slot:icon><NIcon :component="ImageIcon" :size="18" /></template>
      Saved generations
    </NButton>
    <NButton
      aria-label="Open Queue Manager"
      class="chrome-menu queue-button"
      quaternary
      size="small"
      @click="$emit('queue')"
    >
      Queue
    </NButton>
  </header>
</template>

<style scoped>
.app-chrome {
  display: flex;
  align-items: center;
  gap: 18px;
  height: var(--app-chrome-height);
  padding: 0 8px;
  border-bottom: 1px solid var(--app-elevated);
  background: var(--app-chrome);
  user-select: none;
  -webkit-app-region: drag;
}

.brand-button {
  flex: 0 0 auto;
  -webkit-app-region: no-drag;
}

.brand-logo {
  display: block;
  width: 70px;
  height: 24px;
  object-fit: contain;
}

.chrome-context {
  color: var(--app-text-muted);
  font-size: var(--app-font-size-meta);
}

.chrome-menu {
  -webkit-app-region: no-drag;
}

.history-button {
  margin-left: auto;
}
</style>
