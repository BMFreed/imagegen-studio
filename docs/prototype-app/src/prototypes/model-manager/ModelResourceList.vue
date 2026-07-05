<template>
  <section class="resource-list-panel">
    <header class="list-toolbar">
      <NInput v-model:value="searchValue" clearable placeholder="Search models" />
      <NSelect v-model:value="baseModelValue" :options="baseModelOptions" />
      <NSelect v-model:value="sortValue" :options="sortOptions" :render-label="renderSortLabel" />
    </header>

    <NScrollbar class="resource-scroll">
      <div class="resource-list">
        <ModelResourceRow
          v-for="resource in resources"
          :key="resource.id"
          :resource="resource"
          :selected="resource.id === selectedId"
          :muted="resource.id === 'uncanny-valley-noobai'"
          @select="$emit('select', $event)"
        />
      </div>
    </NScrollbar>

    <footer class="install-strip">
      <div class="install-copy">
        <strong v-overflow-title>Installing Digital Art XL v0.2</strong>
      </div>
      <div class="install-progress">
        <NProgress type="line" :percentage="64" :show-indicator="false" />
      </div>
      <span v-overflow-title class="install-subtitle">Downloading from CivitAI · 1.4 GB of 2.2 GB</span>
      <div class="install-actions">
        <NButton tertiary type="error" size="small">
          <template #icon>
            <NIcon :component="XIcon" />
          </template>
          Cancel
        </NButton>
        <NButton tertiary type="info" size="small">
          <template #icon>
            <NIcon :component="ListIcon" />
          </template>
          View Queue
        </NButton>
      </div>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { h, ref } from 'vue';
import { ListDetails as ListIcon, SortAscending as SortIcon, X as XIcon } from '@vicons/tabler';
import { NButton, NIcon, NInput, NProgress, NScrollbar, NSelect, type SelectOption } from 'naive-ui';
import ModelResourceRow from './ModelResourceRow.vue';
import type { ModelResource } from './model-manager.types';

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
  { label: 'NoobAI', value: 'noobai' }
];

const sortOptions = [
  { label: 'Name', value: 'name' },
  { label: 'Recently installed', value: 'recent' },
  { label: 'Size', value: 'size' }
];

function renderSortLabel(option: SelectOption, selected?: boolean) {
  const children = selected
    ? [
        h(NIcon, { component: SortIcon, size: 15 }),
        h('span', String(option.label))
      ]
    : [h('span', String(option.label))];

  return h('span', { class: 'sort-option-label' }, children);
}
</script>

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
  padding: 12px 14px;
  border-bottom: 1px solid var(--app-border);
  align-items: center;
}

:global(.sort-option-label) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
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
    "title actions"
    "progress actions"
    "subtitle actions";
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
