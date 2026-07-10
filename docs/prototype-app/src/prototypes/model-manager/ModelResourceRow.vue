<script setup lang="ts">
import { Tool as ToolIcon } from '@vicons/tabler';
import { NButton, NIcon, NTag, useThemeVars } from 'naive-ui';
import { computed } from 'vue';

import type { ModelResource } from './model-manager.types';

import ResourceThumbnail from '../../components/ResourceThumbnail.vue';
import StatusBadge from '../../components/StatusBadge.vue';

defineProps<{
  muted?: boolean;
  resource: ModelResource;
  selected: boolean;
}>();

defineEmits<{
  select: [id: string];
}>();

const themeVars = useThemeVars();
const accentStyle = computed(() => ({ '--resource-accent': themeVars.value.primaryColor }));
</script>

<template>
  <article
    class="resource-row"
    :class="{ 'resource-row--selected': selected, 'resource-row--muted': muted }"
    :style="accentStyle"
  >
    <button
      :aria-pressed="selected"
      class="resource-select"
      type="button"
      @click="$emit('select', resource.id)"
    >
      <ResourceThumbnail :tone="resource.thumbnailTone" />
      <div class="resource-main">
        <strong v-overflow-title class="resource-title">{{ resource.name }}</strong>
        <p v-overflow-title>{{ resource.description }}</p>
        <div class="resource-meta">
          <NTag v-for="badge of resource.badges" :key="badge" :bordered="false" size="small">{{
            badge
          }}</NTag>
          <span v-if="resource.versionLabel">{{ resource.versionLabel }}</span>
          <span>{{ resource.sizeLabel }}</span>
        </div>
      </div>
    </button>
    <div class="resource-state">
      <StatusBadge :status="resource.status" />
      <NButton v-if="resource.status === 'missing'" ghost size="small" type="warning">
        <template v-slot:icon>
          <NIcon :component="ToolIcon" />
        </template>
        Repair
      </NButton>
    </div>
  </article>
</template>

<style scoped>
.resource-row {
  --resource-accent: transparent;

  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-height: 76px;
  padding: 10px 12px;
  border: 1px solid transparent;
  border-radius: var(--app-radius);
  background: var(--app-elevated);
}

.resource-row:hover:not(.resource-row--selected),
.resource-row--selected {
  border-color: var(--app-border);
  background: var(--app-elevated-hover);
}

.resource-row--selected::before {
  position: absolute;
  top: 8px;
  bottom: 8px;
  left: 0;
  width: 2px;
  border-radius: 999px;
  background: var(--resource-accent);
  content: '';
}

.resource-row--muted {
  opacity: 0.64;
}

.resource-row:has(.resource-select:focus-visible) {
  border-color: var(--resource-accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--resource-accent) 25%, transparent);
}

.resource-select {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 0;
  border: 0;
  color: inherit;
  background: transparent;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.resource-select:focus-visible {
  outline: 0;
}

.resource-main {
  min-width: 0;
}

.resource-title {
  display: block;
  overflow: hidden;
  font-size: 13px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

p {
  overflow: hidden;
  margin: 2px 0 6px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.resource-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.resource-state {
  display: flex;
  align-items: center;
  justify-content: end;
  gap: 8px;
}
</style>
