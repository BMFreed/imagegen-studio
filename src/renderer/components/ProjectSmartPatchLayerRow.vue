<script setup lang="ts">
import type { ProjectApi, ProjectSmartPatchLayerView } from '../../shared/api.js'
import type { ProjectAcceptedResultTarget } from '../../shared/projects/project-accepted-results.js'

import { Brush } from '@vicons/tabler'
import { NButton, NIcon } from 'naive-ui'
import { computed } from 'vue'

import { type ProjectEntityRowAction, provideProjectEntityRow } from './project-entity-row.js'
import ProjectEntitySurface from './ProjectEntitySurface.vue'

const props = defineProps<{
  disabled: boolean
  freshnessLabel?: string
  hasGenerationData: boolean
  index: number
  layer: ProjectSmartPatchLayerView
  layerCount: number
  selected: boolean
}>()
const comparisonLayerId = defineModel<string | null>('comparisonLayerId', { required: true })
const comparisonOpen = computed({
  get: () => comparisonLayerId.value === props.layer.id,
  set: (open) => {
    if (open) {
      comparisonLayerId.value = props.layer.id
    } else if (comparisonLayerId.value === props.layer.id) {
      comparisonLayerId.value = null
    }
  },
})
const emit = defineEmits<{
  browseVariants: [layerId: string]
  comparisonHidden: [layerId: string]
  move: [layerId: string, targetIndex: number]
  saveSmartResultPreset: [owner: ProjectAcceptedResultTarget]
  select: [layerId: string]
  update: [layerId: string, change: Parameters<ProjectApi['updateSmartPatchLayer']>[2]]
}>()
const activeVariant = computed(() =>
  props.layer.rasterSubLayers.find((variant) => variant.id === props.layer.activeRasterSubLayerId),
)
const menu = computed<ProjectEntityRowAction[]>(() => [
  {
    key: 'browse-variants',
    label: 'Browse variants',
    run: () => emit('browseVariants', props.layer.id),
  },
  {
    disabled: props.disabled || !activeVariant.value || !props.hasGenerationData,
    key: 'compare-generation',
    label:
      activeVariant.value && props.hasGenerationData
        ? 'Compare generation settings'
        : 'Compare generation settings · No generation data',
    run: () => {
      if (activeVariant.value && props.hasGenerationData && !props.disabled) {
        comparisonOpen.value = true
      }
    },
  },
  {
    disabled: props.disabled || !activeVariant.value,
    key: 'save-result-preset',
    label: activeVariant.value
      ? 'Save Preset from Result'
      : 'Save Preset from Result · No generation data',
    run: () => {
      if (activeVariant.value && !props.disabled) {
        emit('saveSmartResultPreset', {
          kind: 'smart-patch-variant',
          layerId: props.layer.id,
          variantId: activeVariant.value.id,
        })
      }
    },
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
  popoverAfterLeave: () => emit('comparisonHidden', props.layer.id),
  popoverOpen: comparisonOpen,
  select: () => emit('select', props.layer.id),
  state: computed(() => ({
    disabled: props.disabled,
    locked: props.layer.locked,
    name: props.layer.name,
    selected: props.selected,
    summary: `${props.layer.rasterSubLayers.length} ${props.layer.rasterSubLayers.length === 1 ? 'variant' : 'variants'} · ${
      props.layer.status === 'empty'
        ? 'Empty'
        : props.layer.status === 'outdated'
          ? 'Outdated'
          : (props.freshnessLabel ?? 'Unverified')
    }`,
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
    <template v-slot:menu-overlay><slot :layer name="comparison" /></template>
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
        <NButton
          :aria-label="`Browse variants for ${layer.name}`"
          data-entity-control
          data-patch-variants-trigger
          size="tiny"
          text
          @click="emit('browseVariants', layer.id)"
        >
          Variants ({{ layer.rasterSubLayers.length }})
        </NButton>
      </div>
      <div v-if="activeVariant" class="patch-active-result">
        <img
          v-if="layer.activeRaster"
          :alt="`Active variant: ${activeVariant.name}`"
          class="raster-thumbnail"
          :src="layer.activeRaster.imageUrl"
        />
        <span class="active-variant" :title="activeVariant.name">{{ activeVariant.name }}</span>
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
.active-variant {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.patch-active-result {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 6px;
}
.raster-thumbnail {
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  object-fit: contain;
  border: 1px solid var(--app-border);
  background: var(--app-chrome);
}
</style>
