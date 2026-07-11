<script setup lang="ts">
import { ref } from 'vue'

import type { ProjectCompositingLayer, ProjectSession } from './project.types'

import ProjectSortableLayerRow from './ProjectSortableLayerRow.vue'
import { scrollContainerRef, useProjectLayerDnd } from './useProjectLayerDnd'

const props = defineProps<{ scrollContainer: HTMLElement | null; session: ProjectSession }>()
const emit = defineEmits<{
  duplicate: [layer: ProjectCompositingLayer]
  move: [layer: ProjectCompositingLayer, delta: number]
  remove: [layer: ProjectCompositingLayer]
  toggleLock: [layer: ProjectCompositingLayer]
  toggleVisible: [layer: ProjectCompositingLayer]
  variants: [layer: ProjectCompositingLayer]
}>()
const list = ref<HTMLElement | null>(null)
const { isDragOver } = useProjectLayerDnd(props.session, list, scrollContainerRef(props))
</script>

<template>
  <div ref="list" class="layer-list" :class="{ 'layer-list--active': isDragOver }">
    <ProjectSortableLayerRow
      v-for="(layer, index) of session.document.layers"
      :key="layer.id"
      :index
      :layer
      :layers="session.document.layers"
      :selected="session.ui.selection?.id === layer.id"
      @duplicate="emit('duplicate', layer)"
      @moveDown="emit('move', layer, 1)"
      @moveUp="emit('move', layer, -1)"
      @remove="emit('remove', layer)"
      @select="session.ui.selection = { id: layer.id, kind: 'compositing-layer' }"
      @toggleLock="emit('toggleLock', layer)"
      @toggleVisible="emit('toggleVisible', layer)"
      @variants="emit('variants', layer)"
    />
  </div>
</template>

<style scoped>
.layer-list {
  display: grid;
  gap: 5px;
  min-height: 12px;
}
.layer-list--active {
  border-radius: var(--app-radius);
}
</style>
