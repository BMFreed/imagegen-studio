<script setup lang="ts">
import {
  AlertTriangle as AlertIcon,
  FilterOff as FilterOffIcon,
  Star as StarIcon,
} from '@vicons/tabler';
import { NButton, NEmpty, NIcon, NInput, NScrollbar, NSelect, NText } from 'naive-ui';

import type { PresetRecord } from './presets.types';

import PresetListRow from './PresetListRow.vue';

defineProps<{
  hasActiveFilters: boolean;
  presets: PresetRecord[];
  selectedId: string;
}>();

defineEmits<{
  resetFilters: [];
  select: [id: string];
}>();

const search = defineModel<string>('search', { required: true });
const sort = defineModel<'name' | 'recent'>('sort', { required: true });
const favoritesOnly = defineModel<boolean>('favoritesOnly', { required: true });
const attentionOnly = defineModel<boolean>('attentionOnly', { required: true });

const sortOptions = [
  { label: 'Name', value: 'name' },
  { label: 'Recently updated', value: 'recent' },
];
</script>

<template>
  <section class="preset-list-panel">
    <header class="list-toolbar">
      <div class="toolbar-row toolbar-row--search">
        <label class="toolbar-field">
          <NText class="toolbar-label" depth="3">Name</NText>
          <NInput v-model:value="search" clearable placeholder="Search presets" />
        </label>
        <NButton
          aria-label="Reset filters"
          circle
          :disabled="!hasActiveFilters"
          quaternary
          title="Reset filters"
          @click="$emit('resetFilters')"
        >
          <template v-slot:icon><NIcon :component="FilterOffIcon" /></template>
        </NButton>
      </div>
      <div class="toolbar-row toolbar-row--filters">
        <label class="toolbar-field">
          <NText class="toolbar-label" depth="3">Sort by</NText>
          <NSelect v-model:value="sort" :options="sortOptions" />
        </label>
        <div class="filter-actions">
          <NButton
            :secondary="favoritesOnly"
            size="medium"
            :type="favoritesOnly ? 'warning' : 'default'"
            @click="favoritesOnly = !favoritesOnly"
          >
            <template v-slot:icon><NIcon :component="StarIcon" /></template>
            Favorites
          </NButton>
          <NButton
            :secondary="attentionOnly"
            size="medium"
            :type="attentionOnly ? 'warning' : 'default'"
            @click="attentionOnly = !attentionOnly"
          >
            <template v-slot:icon><NIcon :component="AlertIcon" /></template>
            Needs Attention
          </NButton>
        </div>
      </div>
    </header>

    <NScrollbar class="preset-scroll">
      <div v-if="presets.length > 0" class="preset-list">
        <PresetListRow
          v-for="preset of presets"
          :key="preset.id"
          :preset
          :selected="preset.id === selectedId"
          @select="$emit('select', $event)"
        />
      </div>
      <NEmpty v-else class="empty-state" description="No presets match these filters" />
    </NScrollbar>
  </section>
</template>

<style scoped>
.preset-list-panel {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

.list-toolbar {
  display: grid;
  gap: 8px;
  padding: 8px 14px 10px;
  border-bottom: 1px solid var(--app-border);
}

.toolbar-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 8px;
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

.filter-actions {
  display: flex;
  gap: 8px;
}

.preset-scroll {
  min-height: 0;
}

.preset-list {
  display: grid;
  gap: 6px;
  padding: 12px 14px;
}

.empty-state {
  margin-top: 96px;
}
</style>
