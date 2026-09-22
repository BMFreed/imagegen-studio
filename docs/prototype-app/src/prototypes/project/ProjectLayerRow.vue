<script setup lang="ts">
import type { ProjectCompositingLayer, ProjectSession } from './project.types'
import type { CompositingRowCommands } from './useCompositingLayerRow'

import ProjectRasterLayerRow from './ProjectRasterLayerRow.vue'
import ProjectSmartPatchLayerRow from './ProjectSmartPatchLayerRow.vue'

defineProps<{ layer: ProjectCompositingLayer; selected: boolean; session: ProjectSession }>()
const emit = defineEmits<{
  duplicate: []
  moveDown: []
  moveUp: []
  remove: []
  savePreset: []
  select: []
  toggleLock: []
  toggleVisible: []
  variants: []
}>()
const commands: CompositingRowCommands = {
  duplicate: () => emit('duplicate'),
  moveDown: () => emit('moveDown'),
  moveUp: () => emit('moveUp'),
  remove: () => emit('remove'),
  savePreset: () => emit('savePreset'),
  select: () => emit('select'),
  toggleLock: () => emit('toggleLock'),
  toggleVisible: () => emit('toggleVisible'),
  variants: () => emit('variants'),
}
</script>

<template>
  <ProjectRasterLayerRow v-if="layer.kind === 'raster'" :commands :layer :selected :session />
  <ProjectSmartPatchLayerRow v-else :commands :layer :selected :session />
</template>
