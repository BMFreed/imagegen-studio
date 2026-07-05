<template>
  <section class="resource-list-panel">
    <header class="list-toolbar">
      <NInput v-model:value="searchValue" clearable placeholder="Search models" />
      <NSelect v-model:value="baseModelValue" :options="baseModelOptions" />
      <NSelect v-model:value="sortValue" :options="sortOptions" />
      <NButton quaternary circle size="small" aria-label="More filters" title="More filters">
        <template #icon>
          <NIcon :component="AdjustmentsIcon" />
        </template>
      </NButton>
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
        <strong>Installing Digital Art XL v0.2</strong>
        <span v-overflow-title>Downloading from CivitAI · 1.4 GB of 2.2 GB</span>
      </div>
      <NProgress type="line" :percentage="64" :show-indicator="false" />
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
import { ref } from 'vue';
import {
  AdjustmentsHorizontal as AdjustmentsIcon,
  ListDetails as ListIcon,
  X as XIcon
} from '@vicons/tabler';
import { NButton, NIcon, NInput, NProgress, NScrollbar, NSelect } from 'naive-ui';
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
  grid-template-columns: minmax(170px, 1fr) 145px 130px 32px;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--app-border);
  align-items: center;
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
  grid-template-columns: minmax(0, 1fr) 170px auto;
  align-items: center;
  gap: 10px;
  min-height: 56px;
  padding: 8px 14px;
  border-top: 1px solid var(--app-border);
  background: var(--app-surface);
}

.install-copy {
  display: grid;
  gap: 1px;
  min-width: 0;
}

.install-copy span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.install-actions {
  display: flex;
  gap: 8px;
}
</style>
