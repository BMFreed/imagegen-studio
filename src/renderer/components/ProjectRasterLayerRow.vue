<script setup lang="ts">
import type { ProjectApi, ProjectRasterLayerView } from '../../shared/api.js'

import { computed } from 'vue'

import { type ProjectEntityRowAction, provideProjectEntityRow } from './project-entity-row.js'
import ProjectEntitySurface from './ProjectEntitySurface.vue'

const props = defineProps<{
  disabled: boolean
  hasGenerationData: boolean
  hasPresetData?: boolean
  index: number
  layer: ProjectRasterLayerView
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
  move: [layerId: string, targetIndex: number]
  saveResultPreset: [layerId: string]
  select: [layerId: string]
  update: [layerId: string, change: Parameters<ProjectApi['updateRasterLayer']>[2]]
}>()

const menu = computed<ProjectEntityRowAction[]>(() => [
  {
    disabled:
      props.disabled ||
      !props.hasGenerationData ||
      Boolean(props.layer.generationSettingsUnavailableReason),
    key: 'compare-generation',
    label: props.layer.generationSettingsUnavailableReason
      ? `Compare generation settings · ${props.layer.generationSettingsUnavailableReason}`
      : props.hasGenerationData
        ? 'Compare generation settings'
        : 'Compare generation settings · No generation data',
    run: () => {
      comparisonOpen.value = true
    },
  },
  {
    disabled:
      props.disabled ||
      !(props.hasPresetData ?? props.hasGenerationData) ||
      (props.layer.resultPresetSourceKind !== 'smart-patch' &&
        Boolean(props.layer.generationSettingsUnavailableReason)),
    key: 'save-result-preset',
    label:
      props.layer.resultPresetSourceKind === 'smart-patch'
        ? 'Save Preset from Result'
        : props.layer.generationSettingsUnavailableReason
          ? `Save Preset from Result · ${props.layer.generationSettingsUnavailableReason}`
          : 'Save Preset from Result',
    run: () => emit('saveResultPreset', props.layer.id),
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
  popoverOpen: comparisonOpen,
  select: () => emit('select', props.layer.id),
  state: computed(() => ({
    disabled: props.disabled,
    locked: props.layer.locked,
    name: props.layer.name,
    selected: props.selected,
    summary: `${props.layer.width} × ${props.layer.height} · ${Math.round(props.layer.opacity * 100)}%`,
    visible: props.layer.visible,
  })),
  toggleLock: () => emit('update', props.layer.id, { kind: 'lock', locked: !props.layer.locked }),
  toggleVisible: () =>
    emit('update', props.layer.id, { kind: 'visibility', visible: !props.layer.visible }),
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
    <template v-slot:menu-overlay><slot :layer name="comparison" /></template>
  </ProjectEntitySurface>
</template>
