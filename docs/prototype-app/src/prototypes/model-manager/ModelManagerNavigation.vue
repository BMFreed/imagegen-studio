<template>
  <aside class="manager-navigation">
    <section class="nav-section">
      <h2>Library</h2>
      <button v-for="item in libraryItems" :key="item.label" class="nav-item" :class="{ 'nav-item--active': item.active }" type="button">
        <span>{{ item.label }}</span>
        <span>{{ item.count }}</span>
      </button>
    </section>

    <section class="nav-section">
      <h2>Status</h2>
      <button v-for="item in statusItems" :key="item.label" class="nav-item" type="button">
        <span>{{ item.label }}</span>
        <span>{{ item.count }}</span>
      </button>
    </section>

    <section class="storage-summary">
      <div>
        <span>Storage used</span>
        <strong>84 GB</strong>
      </div>
      <div>
        <span>Downloads</span>
        <strong>2 active</strong>
      </div>
      <NButton secondary block size="small">
        <template #icon>
          <NIcon :component="FolderIcon" />
        </template>
        Open Folder
      </NButton>
    </section>
  </aside>
</template>

<script setup lang="ts">
import { Folder as FolderIcon } from '@vicons/tabler';
import { NButton, NIcon } from 'naive-ui';

const libraryItems = [
  { label: 'All Models', count: 28, active: true },
  { label: 'Checkpoints', count: 7 },
  { label: 'LoRA', count: 15 },
  { label: 'Embeddings', count: 4 },
  { label: 'VAE', count: 1 },
  { label: 'Upscalers', count: 1 }
];

const statusItems = [
  { label: 'Installed', count: 25 },
  { label: 'Downloading', count: 1 },
  { label: 'Needs Attention', count: 2 }
];
</script>

<style scoped>
.manager-navigation {
  display: grid;
  grid-template-rows: auto auto 1fr;
  gap: 22px;
  min-height: 0;
  padding: 18px;
  border-right: 1px solid var(--app-border);
}

.nav-section {
  display: grid;
  gap: 6px;
}

h2 {
  margin: 0 0 5px;
  color: var(--app-text-soft);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.nav-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 32px;
  padding: 0 12px;
  color: var(--app-text-muted);
  background: transparent;
  border: 0;
  border-radius: var(--app-radius);
  font: inherit;
  text-align: left;
}

.nav-item:hover {
  color: var(--app-text);
  background: var(--app-control);
}

.nav-item--active {
  color: var(--app-text);
  background: #19391f;
  box-shadow: inset 0 0 0 1px var(--app-accent-strong);
}

.storage-summary {
  align-self: end;
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-surface-raised);
}

.storage-summary div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: var(--app-text-muted);
}

.storage-summary strong {
  color: var(--app-text);
  font-weight: 600;
}
</style>
