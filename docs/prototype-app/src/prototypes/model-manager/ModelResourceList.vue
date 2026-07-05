<script setup lang="ts">
import { ListDetails as ListIcon, X as XIcon } from '@vicons/tabler';
import { NButton, NIcon, NInput, NProgress, NScrollbar, NSelect } from 'naive-ui';
import { ref } from 'vue';

import type { ModelResource } from './model-manager.types';

import ModelResourceRow from './ModelResourceRow.vue';

defineProps<{
  resources: ModelResource[];
  selectedId: string;
}>();

defineEmits<{
  select: [id: string];
}>();

const searchValue = ref('Illustrious');
const baseModelValue = ref('illustrious');
const sortValue = ref('name');

const baseModelOptions = [
  { label: 'Illustrious', value: 'illustrious' },
  { label: 'SDXL', value: 'sdxl' },
  { label: 'NoobAI', value: 'noobai' },
];

const sortOptions = [
  { label: 'Name', value: 'name' },
  { label: 'Recently installed', value: 'recent' },
  { label: 'Size', value: 'size' },
];
</script>

<template>
  <section class="resource-list-panel">
    <header class="list-toolbar">
      <label class="toolbar-field">
        <span>Name</span>
        <NInput v-model:value="searchValue" clearable placeholder="Search models" />
      </label>
      <label class="toolbar-field">
        <span>Base model</span>
        <NSelect v-model:value="baseModelValue" :options="baseModelOptions" />
      </label>
      <label class="toolbar-field">
        <span>Sort by</span>
        <NSelect v-model:value="sortValue" :consistentMenuWidth="false" :options="sortOptions" />
      </label>
    </header>

    <NScrollbar class="resource-scroll">
      <div class="resource-list">
        <ModelResourceRow
          v-for="resource of resources"
          :key="resource.id"
          :muted="resource.id === 'uncanny-valley-noobai'"
          :resource
          :selected="resource.id === selectedId"
          @select="$emit('select', $event)"
        />
      </div>
    </NScrollbar>

    <footer class="install-strip">
      <div class="install-copy">
        <strong v-overflow-title>Installing Digital Art XL v0.2</strong>
      </div>
      <div class="install-progress">
        <NProgress :percentage="64" :showIndicator="false" type="line" />
      </div>
      <span v-overflow-title class="install-subtitle"
        >Downloading from CivitAI · 1.4 GB of 2.2 GB</span
      >
      <div class="install-actions">
        <NButton size="small" tertiary type="error">
          <template v-slot:icon>
            <NIcon :component="XIcon" />
          </template>
          Cancel
        </NButton>
        <NButton size="small" tertiary type="info">
          <template v-slot:icon>
            <NIcon :component="ListIcon" />
          </template>
          View Queue
        </NButton>
      </div>
    </footer>
  </section>
</template>

<style scoped>
.resource-list-panel {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

.list-toolbar {
  display: grid;
  grid-template-columns: minmax(170px, 1fr) 145px 150px;
  gap: 8px;
  padding: 8px 14px 10px;
  border-bottom: 1px solid var(--app-border);
  align-items: end;
}

.toolbar-field {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.toolbar-field span {
  color: var(--app-text-muted);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  line-height: 1;
  text-transform: uppercase;
}

.resource-scroll {
  min-height: 0;
}

.resource-list {
  display: grid;
  gap: 6px;
  padding: 12px 14px;
}

.install-strip {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas:
    'title actions'
    'progress actions'
    'subtitle actions';
  align-items: center;
  gap: 2px 12px;
  min-height: 70px;
  padding: 8px 14px;
  border-top: 1px solid var(--app-border);
  background: var(--app-surface);
}

.install-copy {
  grid-area: title;
  display: grid;
  gap: 1px;
  min-width: 0;
}

.install-progress {
  grid-area: progress;
  min-width: 0;
  width: 100%;
}

.install-copy strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.install-subtitle {
  grid-area: subtitle;
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.install-actions {
  grid-area: actions;
  display: flex;
  gap: 8px;
}
</style>
