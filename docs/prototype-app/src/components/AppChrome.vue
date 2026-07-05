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
import { NButton, NIcon } from 'naive-ui';

import IconButton from './IconButton.vue';

const menuItems = ['File', 'Edit', 'Project', 'Models', 'Window', 'Help'];
</script>

<template>
  <header class="app-chrome">
    <div class="menu-left">
      <img alt="ImageGen Studio" class="brand-logo" :src="logoUrl" />
      <nav aria-label="Application menu" class="menu-items">
        <NButton v-for="item of menuItems" :key="item" class="menu-item" text>{{ item }}</NButton>
      </nav>
    </div>
    <div class="menu-right">
      <IconButton badge="2" :icon="ListDetailsIcon" label="Generation queue" />
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
