<template>
  <header class="app-chrome">
    <div class="menu-left">
      <img class="brand-logo" :src="logoUrl" alt="ImageGen Studio" />
      <nav class="menu-items" aria-label="Application menu">
        <NButton v-for="item in menuItems" :key="item" text class="menu-item">{{ item }}</NButton>
      </nav>
    </div>
    <div class="menu-right">
      <IconButton :icon="ListDetailsIcon" label="Generation queue" badge="2" />
      <IconButton :icon="DownloadIcon" label="Downloads" badge="1" />
      <IconButton :icon="SettingsIcon" label="Settings" />
      <div class="window-controls" aria-label="Window controls">
        <NButton quaternary class="window-control" aria-label="Minimize" title="Minimize">
          <template #icon>
            <NIcon :component="MinusIcon" />
          </template>
        </NButton>
        <NButton quaternary class="window-control" aria-label="Maximize" title="Maximize">
          <template #icon>
            <NIcon :component="SquareIcon" />
          </template>
        </NButton>
        <NButton quaternary class="window-control window-control--close" aria-label="Close" title="Close">
          <template #icon>
            <NIcon :component="XIcon" />
          </template>
        </NButton>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import {
  Download as DownloadIcon,
  ListDetails as ListDetailsIcon,
  Minus as MinusIcon,
  Settings as SettingsIcon,
  Square as SquareIcon,
  X as XIcon
} from '@vicons/tabler';
import { NButton, NIcon } from 'naive-ui';
import logoUrl from '@docs-assets/brand/imagegen-studio-logo-horizontal-no-bg.svg';
import IconButton from './IconButton.vue';

const menuItems = ['File', 'Edit', 'Project', 'Models', 'Window', 'Help'];
</script>

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

.menu-items {
  gap: 16px;
}

.menu-item {
  cursor: pointer;
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
  cursor: pointer;
}

.window-control--close:hover {
  background: var(--app-window-close);
}
</style>
