<script setup lang="ts">
import { makeDraggable } from '@vue-dnd-kit/core'
import { computed, ref } from 'vue'

import type { ProjectCompositingLayer } from './project.types'

import ProjectLayerRow from './ProjectLayerRow.vue'

const props = defineProps<{
  index: number
  layer: ProjectCompositingLayer
  layers: ProjectCompositingLayer[]
  selected: boolean
}>()
const emit = defineEmits<{
  duplicate: []
  moveDown: []
  moveUp: []
  remove: []
  select: []
  toggleLock: []
  toggleVisible: []
  variants: []
}>()
const row = ref<HTMLElement | null>(null)
const { isDragging, isDragOver } = makeDraggable(
  row,
  {
    activation: { distance: 6 },
    dragHandle: '.selection-button',
    groups: ['project-layers'],
    id: props.layer.id,
    placementMargins: { bottom: 0.5, top: 0.5 },
  },
  () => [props.index, props.layers],
)
const placementClass = computed(() => ({
  'sortable-layer--after': isDragOver.value?.bottom,
  'sortable-layer--before': isDragOver.value?.top,
  'sortable-layer--dragging': isDragging.value,
}))
</script>

<template>
  <div ref="row" class="sortable-layer" :class="placementClass">
    <ProjectLayerRow
      :layer
      :selected
      @duplicate="emit('duplicate')"
      @moveDown="emit('moveDown')"
      @moveUp="emit('moveUp')"
      @remove="emit('remove')"
      @select="emit('select')"
      @toggleLock="emit('toggleLock')"
      @toggleVisible="emit('toggleVisible')"
      @variants="emit('variants')"
    />
  </div>
</template>

<style scoped>
.sortable-layer {
  position: relative;
  min-width: 0;
}
.sortable-layer--dragging {
  opacity: 0.42;
}
.sortable-layer--before::before,
.sortable-layer--after::after {
  position: absolute;
  right: 0;
  left: 0;
  z-index: 2;
  height: 2px;
  background: var(--workspace-green);
  content: '';
  pointer-events: none;
}
.sortable-layer--before::before {
  top: -3px;
}
.sortable-layer--after::after {
  bottom: -3px;
}
</style>
