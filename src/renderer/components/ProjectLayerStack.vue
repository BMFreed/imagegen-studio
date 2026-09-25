<script setup lang="ts">
import type { ProjectRasterLayerView } from '../../shared/api.js'

import { NEmpty } from 'naive-ui'

import ProjectRasterLayerRow from './ProjectRasterLayerRow.vue'

defineProps<{ layers: ProjectRasterLayerView[] }>()
const selectedLayerId = defineModel<string | null>('selectedLayerId', { required: true })
</script>

<template>
  <aside aria-label="Project layers" class="layer-stack">
    <h2>Layers ({{ layers.length }})</h2>
    <NEmpty
      v-if="layers.length === 0"
      class="layer-empty"
      description="No Raster Layers yet"
      size="small"
    />
    <div v-else class="layer-list">
      <ProjectRasterLayerRow
        v-for="layer of layers"
        :key="layer.id"
        :layer
        :selected="selectedLayerId === layer.id"
        @select="selectedLayerId = $event"
      />
    </div>
  </aside>
</template>

<style scoped>
.layer-stack {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: 14px 9px;
  border-left: 1px solid var(--app-border);
  background: var(--app-surface);
}

.layer-stack h2 {
  margin: 0 2px 10px;
  font-size: var(--app-font-size);
  font-weight: 600;
}

.layer-list {
  display: grid;
  gap: 4px;
}
.layer-empty {
  margin-top: 36px;
}
</style>
