<template>
  <header class="app-chrome">
    <div class="menu-left">
      <img class="brand-logo" :src="logoUrl" alt="ImageGen Studio" />
      <nav class="menu-items" aria-label="Application menu">
        <button v-for="item in menuItems" :key="item" class="menu-item" type="button">{{ item }}</button>
      </nav>
    </div>
    <div class="menu-right">
      <IconButton :icon="ListDetailsIcon" label="Generation queue" badge="2" />
      <IconButton :icon="DownloadIcon" label="Downloads" badge="1" />
      <IconButton :icon="SettingsIcon" label="Settings" />
      <div class="window-controls" aria-label="Window controls">
        <button class="window-control" type="button" aria-label="Minimize">-</button>
        <button class="window-control" type="button" aria-label="Maximize">□</button>
        <button class="window-control" type="button" aria-label="Close">×</button>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { Download as DownloadIcon, ListDetails as ListDetailsIcon, Settings as SettingsIcon } from '@vicons/tabler';
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
  color: var(--app-text-muted);
  background: var(--app-chrome);
  border-bottom: 1px solid #202024;
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
  padding: 0;
  color: var(--app-text-muted);
  background: transparent;
  border: 0;
  font: inherit;
}

.menu-item:hover {
  color: var(--app-text);
}

.menu-right {
  gap: 4px;
  height: 100%;
}

.window-controls {
  height: 100%;
  margin-left: 8px;
  border-left: 1px solid #202024;
}

.window-control {
  width: 48px;
  height: 100%;
  color: var(--app-text-muted);
  background: transparent;
  border: 0;
  font: inherit;
}

.window-control:hover {
  color: var(--app-text);
  background: var(--app-control);
}
</style>
