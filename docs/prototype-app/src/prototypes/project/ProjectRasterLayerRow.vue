<script setup lang="ts">
import type { ProjectRasterLayer, ProjectSession } from './project.types'
import type { CompositingRowCommands } from './useCompositingLayerRow'

import ProjectCanvasArtwork from './ProjectCanvasArtwork.vue'
import ProjectEntitySurface from './ProjectEntitySurface.vue'
import ProjectEntityThumbnail from './ProjectEntityThumbnail.vue'
import ProjectGenerationComparison from './ProjectGenerationComparison.vue'
import { useCompositingLayerRow } from './useCompositingLayerRow'

const props = defineProps<{
  commands: CompositingRowCommands
  layer: ProjectRasterLayer
  selected: boolean
  session: ProjectSession
}>()
useCompositingLayerRow(props, () => `${props.layer.opacity}% · ${props.layer.blendMode}`)
</script>

<template>
  <ProjectEntitySurface class="layer-row">
    <template v-slot:preview>
      <ProjectEntityThumbnail><ProjectCanvasArtwork :tone="layer.tone" /></ProjectEntityThumbnail>
    </template>
    <template v-slot:menu-overlay><ProjectGenerationComparison :layer :session /></template>
  </ProjectEntitySurface>
</template>
