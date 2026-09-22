<script setup lang="ts">
import { Refresh } from '@vicons/tabler'
import { NAlert, NButton, NIcon } from 'naive-ui'
import { computed } from 'vue'

import type { ProjectSession, ProjectSmartPatchLayer } from './project.types'
import type { CompositingRowCommands } from './useCompositingLayerRow'

import ProjectCanvasArtwork from './ProjectCanvasArtwork.vue'
import ProjectEntitySurface from './ProjectEntitySurface.vue'
import ProjectEntityThumbnail from './ProjectEntityThumbnail.vue'
import ProjectGenerationComparison from './ProjectGenerationComparison.vue'
import { useCompositingLayerRow } from './useCompositingLayerRow'

const props = defineProps<{
  commands: CompositingRowCommands
  layer: ProjectSmartPatchLayer
  selected: boolean
  session: ProjectSession
}>()
const activeVariant = computed(() =>
  props.layer.variants.find((v) => v.id === props.layer.activeVariantId),
)
useCompositingLayerRow(
  props,
  () => `${props.layer.variants.length} variants · ${props.layer.status}`,
)
</script>

<template>
  <ProjectEntitySurface class="layer-row">
    <template v-slot:preview>
      <ProjectEntityThumbnail aria-label="Mask thumbnail" class="mask-thumb" />
      <ProjectEntityThumbnail>
        <ProjectCanvasArtwork :tone="activeVariant?.tone" />
      </ProjectEntityThumbnail>
    </template>
    <template v-slot:header-actions>
      <NButton
        :aria-label="`Switch variant for ${layer.name}`"
        circle
        quaternary
        size="tiny"
        @click="commands.variants"
      >
        <template v-slot:icon><NIcon :component="Refresh" :size="18" /></template>
      </NButton>
    </template>
    <template v-slot:menu-overlay><ProjectGenerationComparison :layer :session /></template>
    <template v-slot:details>
      <NAlert
        v-if="layer.status === 'outdated'"
        class="patch-warning"
        :showIcon="false"
        type="warning"
      >
        Mask, bounds or settings changed. Regenerate to refresh this patch.
      </NAlert>
      <dl class="patch-properties">
        <div>
          <dt>Bounds</dt>
          <dd>{{ layer.bbox.width }} × {{ layer.bbox.height }}</dd>
        </div>
        <div>
          <dt>Internal size</dt>
          <dd>{{ layer.internalWidth }} × {{ layer.internalHeight }}</dd>
        </div>
      </dl>
      <div class="patch-variant">
        <span>Mask revision {{ layer.maskRevision }}</span>
        <NButton size="tiny" text @click="commands.variants()">
          {{ activeVariant?.name ?? 'No variant' }}
          · Browse
        </NButton>
      </div>
    </template>
  </ProjectEntitySurface>
</template>

<style scoped>
.patch-properties {
  display: flex;
  gap: 24px;
  margin: 2px 0 8px;
  font-size: 12px;
}
.patch-properties dt,
.patch-variant {
  color: var(--app-text-muted);
}
.patch-properties dd {
  margin: 0;
}
.patch-variant {
  display: flex;
  justify-content: space-between;
  gap: 6px;
  font-size: 12px;
}
.patch-warning {
  margin-bottom: 8px;
}

.mask-thumb {
  background: radial-gradient(circle at 58% 52%, #fff 0 24%, #777 26% 33%, #121216 35%);
}
</style>
