<script setup lang="ts">
import logoUrl from '@docs-assets/brand/imagegen-studio-logo-horizontal-no-bg.svg';
import {
  Download as DownloadIcon,
  ListDetails as ListDetailsIcon,
  Minus as MinusIcon,
  Settings as SettingsIcon,
  Square as SquareIcon,
  X as XIcon,
} from '@vicons/tabler';
import { NButton, NDropdown, NIcon } from 'naive-ui';
import { computed } from 'vue';

import IconButton from './IconButton.vue';

const props = withDefaults(
  defineProps<{
    canRedo?: boolean;
    canSave?: boolean;
    canUndo?: boolean;
    projectActive?: boolean;
    queueBadge?: number;
  }>(),
  { canRedo: false, canSave: false, canUndo: false, projectActive: false, queueBadge: 0 },
);

const emit = defineEmits<{
  applyPreset: [];
  closeProject: [];
  home: [];
  manageModels: [];
  managePresets: [];
  queue: [];
  redo: [];
  save: [];
  savePreset: [];
  undo: [];
}>();

const menus = computed(() => [
  {
    label: 'File',
    options: [
      { disabled: !props.canSave, key: 'save', label: 'Save' },
      { disabled: !props.projectActive, key: 'closeProject', label: 'Close Project' },
    ],
  },
  {
    label: 'Edit',
    options: [
      { disabled: !props.canUndo, key: 'undo', label: 'Undo' },
      { disabled: !props.canRedo, key: 'redo', label: 'Redo' },
    ],
  },
  {
    label: 'Project',
    options: [
      { disabled: !props.projectActive, key: 'applyPreset', label: 'Apply Preset' },
      { disabled: !props.projectActive, key: 'savePreset', label: 'Save Current as Preset' },
      { key: 'managePresets', label: 'Manage Presets' },
    ],
  },
  { label: 'Models', options: [{ key: 'manageModels', label: 'Manage Models' }] },
]);

function handleMenuSelect(key: string) {
  switch (key) {
    case 'applyPreset': {
      emit('applyPreset');
      break;
    }
    case 'closeProject': {
      emit('closeProject');
      break;
    }
    case 'manageModels': {
      emit('manageModels');
      break;
    }
    case 'managePresets': {
      emit('managePresets');
      break;
    }
    case 'redo': {
      emit('redo');
      break;
    }
    case 'save': {
      emit('save');
      break;
    }
    case 'savePreset': {
      emit('savePreset');
      break;
    }
    case 'undo': {
      emit('undo');
      break;
    }
  }
}
</script>

<template>
  <header class="app-chrome">
    <div class="menu-left">
      <NButton aria-label="Open Home" class="brand-button" text @click="$emit('home')">
        <img alt="ImageGen Studio" class="brand-logo" :src="logoUrl" />
      </NButton>
      <nav aria-label="Application menu" class="menu-items">
        <NDropdown
          v-for="menu of menus"
          :key="menu.label"
          :options="menu.options"
          trigger="click"
          @select="handleMenuSelect"
        >
          <NButton text>{{ menu.label }}</NButton>
        </NDropdown>
        <NButton text>Window</NButton>
        <NButton text>Help</NButton>
      </nav>
    </div>
    <div class="menu-right">
      <IconButton
        :badge="queueBadge || undefined"
        :icon="ListDetailsIcon"
        label="Generation queue"
        @click="$emit('queue')"
      />
      <IconButton badge="1" :icon="DownloadIcon" label="Downloads" />
      <IconButton :icon="SettingsIcon" label="Settings" />
      <div aria-label="Window controls" class="window-controls">
        <NButton aria-label="Minimize" class="window-control" quaternary title="Minimize">
          <template v-slot:icon>
            <NIcon :component="MinusIcon" />
          </template>
        </NButton>
        <NButton aria-label="Maximize" class="window-control" quaternary title="Maximize">
          <template v-slot:icon>
            <NIcon :component="SquareIcon" />
          </template>
        </NButton>
        <NButton
          aria-label="Close"
          class="window-control window-control--close"
          quaternary
          title="Close"
        >
          <template v-slot:icon>
            <NIcon :component="XIcon" />
          </template>
        </NButton>
      </div>
    </div>
  </header>
</template>

<style scoped>
.app-chrome {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
  height: 40px;
  padding-left: 12px;
  background: var(--app-chrome);
  border-bottom: 1px solid var(--app-elevated);
  user-select: none;
}

.menu-left,
.menu-right,
.menu-items,
.window-controls {
  display: flex;
  align-items: center;
}

.menu-left {
  gap: 16px;
  min-width: 0;
}

.brand-logo {
  display: block;
  width: 78px;
  height: 30px;
  object-fit: contain;
}

.brand-button {
  flex: 0 0 auto;
}

.brand-button :deep(.n-button__content) {
  height: 30px;
}

.menu-items {
  gap: 16px;
}

.menu-right {
  gap: 4px;
  height: 100%;
}

.window-controls {
  height: 100%;
  margin-left: 8px;
  border-left: 1px solid var(--app-elevated);
}

.window-control {
  width: 48px;
  height: 100%;
  border-radius: 0;
}

.window-control--close:hover {
  background: var(--app-window-close);
}
</style>
