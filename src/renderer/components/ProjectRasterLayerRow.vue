<script setup lang="ts">
import type { ProjectRasterLayerView } from '../../shared/api.js'

import { computed } from 'vue'

import { provideProjectEntityRow } from './project-entity-row.js'
import ProjectEntitySurface from './ProjectEntitySurface.vue'

const props = defineProps<{
  layer: ProjectRasterLayerView
  selected: boolean
}>()

const emit = defineEmits<{ select: [layerId: string] }>()

provideProjectEntityRow({
  select: () => emit('select', props.layer.id),
  state: computed(() => ({
    locked: props.layer.locked,
    name: props.layer.name,
    selected: props.selected,
    summary: `${props.layer.width} × ${props.layer.height} · ${Math.round(props.layer.opacity * 100)}%`,
    visible: props.layer.visible,
  })),
})

const blendLabel = computed(() =>
  props.layer.blendMode === 'normal'
    ? 'Normal'
    : props.layer.blendMode[0]?.toUpperCase() + props.layer.blendMode.slice(1),
)
</script>

<template>
  <ProjectEntitySurface>
    <template v-slot:preview><img alt="" :src="layer.imageUrl" /></template>
    <template v-slot:details>
      <span>{{ blendLabel }} · X {{ layer.transform.x }} · Y {{ layer.transform.y }}</span>
    </template>
  </ProjectEntitySurface>
</template>
