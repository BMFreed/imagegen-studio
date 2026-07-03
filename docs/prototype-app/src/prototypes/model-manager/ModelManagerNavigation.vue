<template>
  <aside class="manager-navigation">
    <section class="nav-section">
      <h2>Library</h2>
      <NMenu v-model:value="activeLibraryKey" :options="libraryOptions" />
    </section>

    <section class="nav-section">
      <h2>Status</h2>
      <NMenu v-model:value="activeStatusKey" :options="statusOptions" />
    </section>

    <section class="storage-summary">
      <div>
        <span>Storage used</span>
        <strong>84 GB</strong>
      </div>
      <NButton ghost type="info" block size="small">
        <template #icon>
          <NIcon :component="FolderIcon" />
        </template>
        Open Folder
      </NButton>
    </section>
  </aside>
</template>

<script setup lang="ts">
import { h, ref } from 'vue';
import { Folder as FolderIcon } from '@vicons/tabler';
import { NButton, NIcon, NMenu, type MenuOption } from 'naive-ui';

const activeLibraryKey = ref('all');
const activeStatusKey = ref('');

function makeMenuLabel(label: string, count: number) {
  return () =>
    h('div', { class: 'menu-label' }, [
      h('span', label),
      h('span', { class: 'menu-count' }, String(count))
    ]);
}

const libraryOptions: MenuOption[] = [
  { key: 'all', label: makeMenuLabel('All Models', 28) },
  { key: 'checkpoints', label: makeMenuLabel('Checkpoints', 7) },
  { key: 'lora', label: makeMenuLabel('LoRA', 15) },
  { key: 'embeddings', label: makeMenuLabel('Embeddings', 4) },
  { key: 'vae', label: makeMenuLabel('VAE', 1) },
  { key: 'upscalers', label: makeMenuLabel('Upscalers', 1) }
];

const statusOptions: MenuOption[] = [
  { key: 'installed', label: makeMenuLabel('Installed', 25) },
  { key: 'downloading', label: makeMenuLabel('Downloading', 1) },
  { key: 'needs-attention', label: makeMenuLabel('Needs Attention', 2) }
];
</script>

<style scoped>
.manager-navigation {
  display: grid;
  grid-template-rows: auto auto 1fr;
  gap: 22px;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  padding: 18px;
}

.nav-section {
  display: grid;
  gap: 6px;
}

h2 {
  margin: 0 0 5px;
  color: #6f6f73;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

:deep(.n-menu) {
  --n-item-height: 32px;
  --n-item-text-color: #a0a0a3;
  --n-item-text-color-hover: #dbdbdc;
  --n-item-text-color-active: #64e36e;
  --n-item-color-hover: #232327;
  --n-item-color-active: #19391f;
  --n-item-color-active-hover: #1e4425;
  --n-item-border-radius: var(--app-radius);
}

:deep(.n-menu-item-content) {
  cursor: pointer;
}

:deep(.menu-label) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 12px;
}

.storage-summary {
  align-self: end;
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: #202024;
}

.storage-summary div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.storage-summary strong {
  color: #dbdbdc;
  font-weight: 600;
}
</style>
