<script setup lang="ts">
import { Tool as ToolIcon } from '@vicons/tabler';
import { NButton, NIcon, NTag } from 'naive-ui';

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
</script>

<template>
  <div
    class="resource-row"
    :class="{ 'resource-row--selected': selected, 'resource-row--muted': muted }"
    role="button"
    tabindex="0"
    @click="$emit('select', resource.id)"
    @keydown.enter="$emit('select', resource.id)"
  >
    <ResourceThumbnail :tone="resource.thumbnailTone" />
    <div class="resource-main">
      <div class="resource-title-line">
        <strong v-overflow-title>{{ resource.name }}</strong>
      </div>
      <p v-overflow-title>{{ resource.description }}</p>
      <div class="resource-meta">
        <NTag v-for="badge of resource.badges" :key="badge" :bordered="false" size="small">{{
          badge
        }}</NTag>
        <span>{{ resource.sizeLabel }}</span>
      </div>
    </div>
    <div class="resource-state">
      <StatusBadge :status="resource.status" />
      <NButton v-if="resource.status === 'missing'" ghost size="small" type="warning" @click.stop>
        <template v-slot:icon>
          <NIcon :component="ToolIcon" />
        </template>
        Repair
      </NButton>
    </div>
  </div>
</template>

<style scoped>
.resource-row {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) minmax(112px, auto);
  align-items: center;
  gap: 10px;
  min-height: 76px;
  padding: 10px 12px;
  border: 1px solid transparent;
  border-radius: var(--app-radius);
  background: var(--app-elevated);
  cursor: pointer;
  outline: 0;
}

.resource-row:hover:not(.resource-row--selected) {
  border-color: var(--app-border);
  background: var(--app-elevated-hover);
}

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
  background: var(--workspace-green);
  content: '';
}

.resource-row--muted {
  opacity: 0.64;
}

.resource-row:focus-visible {
  border-color: var(--workspace-green);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--workspace-green) 25%, transparent);
}

.resource-main {
  min-width: 0;
}

.resource-title-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.resource-title-line strong {
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
  min-width: 0;
}
</style>
