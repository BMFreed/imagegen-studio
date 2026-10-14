<script setup lang="ts">
import type { ProjectApi, ProjectSmartPatchLayerView } from '../../shared/api.js'

import { Brush } from '@vicons/tabler'
import { NIcon } from 'naive-ui'
import { computed } from 'vue'

import { type ProjectEntityRowAction, provideProjectEntityRow } from './project-entity-row.js'
import ProjectEntitySurface from './ProjectEntitySurface.vue'

const props = defineProps<{
  disabled: boolean
  index: number
  layer: ProjectSmartPatchLayerView
  layerCount: number
  selected: boolean
}>()
const emit = defineEmits<{
  move: [layerId: string, targetIndex: number]
  select: [layerId: string]
  update: [layerId: string, change: Parameters<ProjectApi['updateSmartPatchLayer']>[2]]
}>()
const menu = computed<ProjectEntityRowAction[]>(() => [
  {
    disabled: true,
    key: 'compare-generation',
    label: 'Compare generation settings · No generation data',
    run: () => undefined,
  },
  {
    disabled: true,
    key: 'save-result-preset',
    label: 'Save Preset from Result',
    run: () => undefined,
  },
  {
    disabled: props.disabled || props.layer.locked || props.index === 0,
    key: 'up',
    label: 'Move up',
    run: () => emit('move', props.layer.id, props.index - 1),
  },
  {
    disabled: props.disabled || props.layer.locked || props.index >= props.layerCount - 1,
    key: 'down',
    label: 'Move down',
    run: () => emit('move', props.layer.id, props.index + 1),
  },
])

provideProjectEntityRow({
  menu,
  select: () => emit('select', props.layer.id),
  state: computed(() => ({
    disabled: props.disabled,
    locked: props.layer.locked,
    name: props.layer.name,
    selected: props.selected,
    summary: `${props.layer.rasterSubLayers.length} variants · ${props.layer.status}`,
    visible: props.layer.visible,
  })),
  toggleLock: () => emit('update', props.layer.id, { kind: 'lock', locked: !props.layer.locked }),
  toggleVisible: () =>
    emit('update', props.layer.id, { kind: 'visibility', visible: !props.layer.visible }),
})
</script>

<template>
  <ProjectEntitySurface data-testid="smart-patch-layer-card">
    <template v-slot:preview>
      <img
        v-if="layer.maskImageUrl"
        alt="Smart Patch mask"
        class="mask-thumbnail"
        :src="layer.maskImageUrl"
      />
      <span
        v-else
        :aria-label="
          layer.mask.asset ? 'Smart Patch mask preview unavailable' : 'Empty Smart Patch mask'
        "
        class="empty-mask"
        role="img"
      >
        <NIcon :component="Brush" :size="18" />
      </span>
    </template>
    <template v-slot:details>
      <dl class="patch-properties">
        <div>
          <dt>Bounds</dt>
          <dd>{{ layer.boundingBox.width }} × {{ layer.boundingBox.height }}</dd>
        </div>
        <div>
          <dt>Internal size</dt>
          <dd>{{ layer.internalResolution.width }} × {{ layer.internalResolution.height }}</dd>
        </div>
      </dl>
      <div class="patch-details">
        <span>Mask revision {{ layer.mask.revision }}</span>
        <span>No variant</span>
      </div>
    </template>
  </ProjectEntitySurface>
</template>

<style scoped>
.mask-thumbnail {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.empty-mask {
  display: grid;
  width: 100%;
  height: 100%;
  place-items: center;
  color: var(--app-text-muted);
}

.patch-properties {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 24px;
  margin: 2px 0 8px;
}

.patch-properties dt {
  color: var(--app-text-muted);
}

.patch-properties dd {
  margin: 0;
  color: var(--app-text);
}

.patch-details {
  display: flex;
  justify-content: space-between;
  gap: 6px;
}
</style>
