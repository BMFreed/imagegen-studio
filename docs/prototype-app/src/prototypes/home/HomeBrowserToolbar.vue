<script setup lang="ts">
import {
  LayoutGrid as GridIcon,
  ListDetails as ListIcon,
  FilterOff as ResetIcon,
} from '@vicons/tabler';
import { NButton, NButtonGroup, NIcon, NInput, NSelect, NText } from 'naive-ui';

import type { HomeSort, HomeStatusFilter, HomeViewMode } from './home.types';

defineProps<{
  hasActiveFilters: boolean;
  sortDisabled: boolean;
}>();

defineEmits<{
  reset: [];
}>();

const search = defineModel<string>('search', { required: true });
const sort = defineModel<HomeSort>('sort', { required: true });
const status = defineModel<HomeStatusFilter>('status', { required: true });
const viewMode = defineModel<HomeViewMode>('viewMode', { required: true });

const sortOptions = [
  { label: 'Last opened', value: 'lastOpened' },
  { label: 'Name', value: 'name' },
  { label: 'Modified', value: 'modified' },
];

const statusOptions = [
  { label: 'All conditions', value: 'all' },
  { label: 'Open', value: 'open' },
  { label: 'Recovery available', value: 'recovery' },
  { label: 'Needs attention', value: 'attention' },
];
</script>

<template>
  <header class="browser-toolbar">
    <label class="toolbar-field toolbar-field--search">
      <NText class="toolbar-label" depth="3">Name</NText>
      <NInput v-model:value="search" clearable placeholder="Search projects" />
    </label>
    <label class="toolbar-field">
      <NText class="toolbar-label" depth="3">Sort by</NText>
      <NSelect
        v-model:value="sort"
        aria-label="Sort by"
        :disabled="sortDisabled"
        :options="sortOptions"
      />
    </label>
    <label class="toolbar-field">
      <NText class="toolbar-label" depth="3">Condition</NText>
      <NSelect v-model:value="status" aria-label="Condition" :options="statusOptions" />
    </label>
    <NButtonGroup aria-label="View mode" class="view-toggle">
      <NButton
        aria-label="Grid view"
        :aria-pressed="viewMode === 'grid'"
        :secondary="viewMode === 'grid'"
        title="Grid view"
        @click="viewMode = 'grid'"
      >
        <template v-slot:icon><NIcon :component="GridIcon" /></template>
      </NButton>
      <NButton
        aria-label="List view"
        :aria-pressed="viewMode === 'list'"
        :secondary="viewMode === 'list'"
        title="List view"
        @click="viewMode = 'list'"
      >
        <template v-slot:icon><NIcon :component="ListIcon" /></template>
      </NButton>
    </NButtonGroup>
    <NButton
      aria-label="Reset filters"
      circle
      :disabled="!hasActiveFilters"
      quaternary
      title="Reset filters"
      @click="$emit('reset')"
    >
      <template v-slot:icon><NIcon :component="ResetIcon" /></template>
    </NButton>
  </header>
</template>

<style scoped>
.browser-toolbar {
  display: grid;
  grid-template-columns: minmax(200px, 1fr) minmax(130px, 0.35fr) minmax(160px, 0.45fr) auto auto;
  align-items: end;
  gap: 8px;
  padding: 10px 18px;
  border-bottom: 1px solid var(--app-border);
}

.toolbar-field {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.toolbar-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  line-height: 1;
  text-transform: uppercase;
}

.view-toggle {
  padding-bottom: 1px;
}

@media (max-width: 1320px) {
  .browser-toolbar {
    grid-template-columns: minmax(180px, 1fr) 120px 142px auto auto;
  }
}
</style>
