<script setup lang="ts">
import type { ProjectApi, ProjectRasterLayerView } from '../../shared/api.js'

import { makeDraggable } from '@vue-dnd-kit/core'
import { computed, ref } from 'vue'

import ProjectRasterLayerRow from './ProjectRasterLayerRow.vue'

const props = defineProps<{
  disabled: boolean
  hasGenerationData: boolean
  index: number
  layer: ProjectRasterLayerView
  layers: ProjectRasterLayerView[]
  selected: boolean
}>()
const comparisonLayerId = defineModel<string | null>('comparisonLayerId', { required: true })
const emit = defineEmits<{
  move: [layerId: string, targetIndex: number]
  saveResultPreset: [layerId: string]
  select: [layerId: string]
  update: [layerId: string, change: Parameters<ProjectApi['updateRasterLayer']>[2]]
}>()

const row = ref<HTMLElement | null>(null)
const { isDragging, isDragOver } = makeDraggable(
  row,
  {
    activation: { distance: 6 },
    disabled: computed(() => props.disabled || props.layer.locked),
    dragHandle: '.selection-button',
    groups: ['project-raster-layers'],
    id: props.layer.id,
  },
  () => [props.index, props.layers],
)

const placementClass = computed(() => ({
  'sortable-row--after': isDragOver.value?.bottom,
  'sortable-row--before': isDragOver.value?.top,
  'sortable-row--dragging': isDragging.value,
}))
</script>

<template>
  <div ref="row" class="sortable-row" :class="placementClass">
    <ProjectRasterLayerRow
      v-model:comparisonLayerId="comparisonLayerId"
      :disabled
      :hasGenerationData
      :index
      :layer
      :layerCount="layers.length"
      :selected
      @move="(layerId, targetIndex) => emit('move', layerId, targetIndex)"
      @saveResultPreset="emit('saveResultPreset', $event)"
      @select="emit('select', $event)"
      @update="(layerId, change) => emit('update', layerId, change)"
    >
      <template v-slot:comparison="slotProps">
        <slot name="comparison" v-bind="slotProps" />
      </template>
    </ProjectRasterLayerRow>
  </div>
</template>

<style scoped>
.sortable-row {
  position: relative;
  min-width: 0;
}

.sortable-row--dragging {
  opacity: 0.42;
}

.sortable-row--before::before,
.sortable-row--after::after {
  position: absolute;
  right: 0;
  left: 0;
  z-index: 2;
  height: 2px;
  background: var(--app-tab-active-text);
  content: '';
  pointer-events: none;
}

.sortable-row--before::before {
  top: -3px;
}

.sortable-row--after::after {
  bottom: -3px;
}
</style>
